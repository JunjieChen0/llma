/**
 * 命令处理模块
 * 
 * 提供扩展命令的处理逻辑，包括：
 * - 显式代码生成：通过命令触发 AI 代码生成
 * - 仓颉编译：支持仓颉语言的编译和自动修复
 * - 上下文感知：根据当前光标位置生成代码
 * - 进度显示：显示代码生成进度
 * - 错误处理：处理编译错误并自动修复
 * 
 * 主要功能：
 * - 处理用户显式触发的代码生成命令
 * - 支持仓颉语言的特殊处理
 * - 提供友好的用户界面和进度反馈
 * - 自动检测和处理编译错误
 * 
 * @module commands
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { getApiKey } from './config';
import { callSimpleAI } from './api';
import { AI, TIMEOUT } from './constants';
import { getCangjieSystemPrompt, isCangjieFile } from './utils';
import { findCangjieProjectConfig } from './compilation';

/**
 * 处理显式代码生成命令
 * 
 * 当用户通过命令面板或快捷键触发代码生成时调用此函数。
 * 
 * 功能流程：
 * 1. 获取当前编辑器和光标位置
 * 2. 收集上下文（光标前后的代码）
 * 3. 构建提示词（包括仓颉特殊处理）
 * 4. 调用 AI 生成代码
 * 5. 将生成的代码插入到光标位置
 * 
 * @example
 * ```typescript
 * // 通过命令面板触发
 * // 1. 打开命令面板 (Ctrl+Shift+P)
 * // 2. 输入 "LLMA: AI Code Complete"
 * // 3. 系统会自动生成代码并插入
 * ```
 */
export async function handleExplicitCodeGeneration() {
  // 获取当前活动的编辑器
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('请先打开一个编辑器');
    return;
  }

  const document = editor.document;
  const selection = editor.selection;
  const cursorLine = selection.active.line;

  // 计算上下文范围：光标前 100 行，后 20 行
  const startContextLine = Math.max(0, cursorLine - 100);
  const endContextLine = Math.min(document.lineCount - 1, cursorLine + 20);

  // 提取上下文文本
  const textBefore = document.getText(new vscode.Range(startContextLine, 0, selection.start.line, selection.start.character));
  const textSelected = document.getText(selection);
  const textAfter = document.getText(new vscode.Range(selection.end.line, selection.end.character, endContextLine, document.lineAt(endContextLine).range.end.character));

  // 获取当前行的缩进
  const currentIndent = document.lineAt(cursorLine).text.match(/^\s*/)?.[0] || '';

  try {
    // 显示进度通知
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "LLMA 正在生成代码...",
      cancellable: true
    }, async (progress, token) => {

      // 获取配置和 API 密钥
      const config = vscode.workspace.getConfiguration('llma');
      const currentModel = config.get<string>('currentModel') || 'deepseek';
      const apiKey = getApiKey(config, currentModel);

      if (!apiKey) {
        vscode.window.showErrorMessage(`请先配置 ${currentModel} 的 API 密钥`);
        return;
      }

      progress.report({ increment: 20 });

      // 判断是插入还是替换
      const isInsertion = textSelected.trim().length === 0;
      
      // 检测是否为仓颉文件
      const isCangjie = isCangjieFile(document);
      
      const baseSystemPrompt = `You are an expert coding assistant. Return ONLY the code block. No markdown fencing, no explanation. Maintain indentation: "${currentIndent}". Use English for comments and strings by default. IMPORTANT: Do NOT use any special characters in your code, including emojis (😀, 🎉, etc.), ASCII art, or special symbols (★, ☆, ♥, etc.). Only use standard programming characters. Do NOT embed terminal commands or shell scripts in code strings. Use the > RUN: command tool instead if needed.`;
      
      // 仓颉文件使用专用系统提示词
      const systemPrompt = isCangjie 
        ? getCangjieSystemPrompt(baseSystemPrompt)
        : baseSystemPrompt;
      
      // 仓颉使用更低的 temperature 确保准确性
      const temperature = isCangjie ? 0.0 : 0.2;
      
      let userPrompt = "";

      if (isInsertion) {
        userPrompt = `[FILE: ${path.basename(document.fileName)}]\n[LANGUAGE: ${document.languageId}]\n[CODE BEFORE CURSOR]:\n${textBefore}\n<CURSOR>\n[CODE AFTER CURSOR]:\n${textAfter}\n\nINSTRUCTION: Generate the code that belongs at <CURSOR>. Just the code.`;
      } else {
        userPrompt = `[FILE: ${path.basename(document.fileName)}]\n[CONTEXT BEFORE]:\n${textBefore.slice(-500)}\n\n[SELECTED CODE TO PROCESS]:\n${textSelected}\n\n[INSTRUCTION]:\nOptimize, fix, or implement the logic described in the selected code.\nReturn only the replaced code.`;
      }

      progress.report({ increment: 40 });

      const completion = await callSimpleAI(
        currentModel, apiKey, systemPrompt, userPrompt, AI.COMMAND_GENERATE_MAX_TOKENS, temperature, config
      );

      if (token.isCancellationRequested) { return; }

      if (completion) {
        progress.report({ increment: 90 });
        await editor.edit(editBuilder => {
          let cleanCode = completion.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
          if (selection.isEmpty) {
            editBuilder.insert(selection.active, cleanCode);
          } else {
            editBuilder.replace(selection, cleanCode);
          }
        });
        
        // 仓颉文件：自动编译检查
        if (isCangjie) {
          progress.report({ increment: 10 });
          await compileAndAutoFixCangjie(editor, config, currentModel, apiKey, token, progress);
        }
      }
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(`生成失败：${error.message}`);
  }
}

/**
 * 仓颉文件编译检查和自动修复
 */
async function compileAndAutoFixCangjie(
  editor: vscode.TextEditor,
  config: vscode.WorkspaceConfiguration,
  model: string,
  apiKey: string,
  token: vscode.CancellationToken,
  progress: vscode.Progress<{ increment?: number }>
): Promise<void> {
  const document = editor.document;
  const maxRetries = 2;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 执行编译
    const compileResult = await runCangjieCompile(document.fileName);
    
    if (compileResult.success) {
      vscode.window.showInformationMessage('✅ 仓颉代码编译成功！');
      return;
    }
    
    // 编译失败，显示错误
    const errorCount = compileResult.errors.length;
    const errorMsg = `编译失败：${errorCount} 个错误\n\n${compileResult.errors.slice(0, 3).map(e => 
      `[${e.severity.toUpperCase()}] ${e.file}:${e.line}:${e.column} - ${e.message}`
    ).join('\n')}`;
    
    vscode.window.showWarningMessage(errorMsg);
    
    // 询问用户是否需要自动修复
    const fixChoice = await vscode.window.showWarningMessage(
      `检测到 ${errorCount} 个编译错误，是否需要 AI 自动修复？`,
      '自动修复',
      '取消'
    );
    
    if (fixChoice !== '自动修复' || token.isCancellationRequested) {
      return;
    }
    
    // 生成修复请求
    const errorContext = formatErrorsForAI(compileResult.errors);
    const currentCode = document.getText();
    
    const systemPrompt = getCangjieSystemPrompt();
    const userPrompt = `当前代码编译失败，请修复以下错误：\n\n${errorContext}\n\n当前代码：\n${currentCode}\n\n请返回修复后的完整代码（不要 markdown 格式，只返回代码）：`;
    
    progress.report({ increment: 20 });
    
    const fixedCode = await callSimpleAI(
      model, apiKey, systemPrompt, userPrompt, AI.COMMAND_GENERATE_MAX_TOKENS, 0.0, config
    );
    
    if (!fixedCode || token.isCancellationRequested) {
      return;
    }
    
    // 应用修复
    const cleanCode = fixedCode.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    await editor.edit(editBuilder => {
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );
      editBuilder.replace(fullRange, cleanCode);
    });
    
    // 继续下一轮编译检查
  }
  
  // 达到最大重试次数
  vscode.window.showErrorMessage('自动修复已达到最大尝试次数，请手动检查代码');
}

/**
 * 执行仓颉编译命令
 */
async function runCangjieCompile(filePath: string): Promise<{
  success: boolean;
  errors: Array<{ file: string; line: number; column: number; message: string; severity: 'error' | 'warning' }>;
  stdout: string;
  stderr: string;
}> {
  const dir = path.dirname(filePath);
  const fileNameWithoutExt = path.basename(filePath, '.cj');
  const isProjectMode = findCangjieProjectConfig(dir);

  // 检测编译命令
  const command = isProjectMode
    ? `cjpm build`
    : `cjc "${filePath}" -o "${fileNameWithoutExt}"`;
  
  return new Promise((resolve) => {
    cp.exec(command, {
      cwd: dir,
      env: process.env,
      timeout: TIMEOUT.COMMAND_SHORT
    }, (error, stdout, stderr) => {
      const errors = parseCangjieErrors(stderr);
      const success = errors.filter(e => e.severity === 'error').length === 0;
      
      resolve({
        success,
        errors,
        stdout,
        stderr
      });
    });
  });
}

/**
 * 解析仓颉编译错误
 */
function parseCangjieErrors(stderr: string): Array<{ file: string; line: number; column: number; message: string; severity: 'error' | 'warning' }> {
  const errors: Array<{ file: string; line: number; column: number; message: string; severity: 'error' | 'warning' }> = [];

  // 去除 ANSI 颜色控制字符，兼容 cjc 彩色输出
  const cleanStderr = stderr.replace(/\x1b\[[0-9;]*m/g, '');
  const lines = cleanStderr.split(/\r?\n/);
  const headerRegex = /^\s*(error|warning):\s*(.+)\s*$/i;
  const locationRegex = /==>\s+(.+?\.cj):(\d+):(\d+):/;
  let pending: { severity: 'error' | 'warning'; message: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      if (pending) {
        errors.push({
          file: 'unknown',
          line: 0,
          column: 0,
          message: pending.message,
          severity: pending.severity
        });
      }
      pending = {
        severity: headerMatch[1].toLowerCase() === 'warning' ? 'warning' : 'error',
        message: headerMatch[2].trim()
      };
      continue;
    }

    if (pending) {
      const locationMatch = line.match(locationRegex);
      if (locationMatch) {
        errors.push({
          file: locationMatch[1],
          line: parseInt(locationMatch[2], 10),
          column: parseInt(locationMatch[3], 10),
          message: pending.message,
          severity: pending.severity
        });
        pending = null;
      }
    }
  }

  if (pending) {
    errors.push({
      file: 'unknown',
      line: 0,
      column: 0,
      message: pending.message,
      severity: pending.severity
    });
  }

  // 兼容单行 error/warning 输出
  if (errors.length === 0) {
    const simpleRegex = /(error|warning):\s*(.+)/gi;
    let match;
    while ((match = simpleRegex.exec(cleanStderr)) !== null) {
      errors.push({
        file: 'unknown',
        line: 0,
        column: 0,
        message: match[2].trim(),
        severity: match[1].toLowerCase() === 'error' ? 'error' : 'warning'
      });
    }
  }

  return errors;
}

/**
 * 格式化错误为 AI 提示
 */
function formatErrorsForAI(errors: Array<{ file: string; line: number; column: number; message: string; severity: 'error' | 'warning' }>): string {
  if (errors.length === 0) return '';
  
  let formatted = '编译错误列表（必须修复）:\n';
  for (const error of errors) {
    formatted += `[${error.severity.toUpperCase()}] ${error.file}:${error.line}:${error.column} - ${error.message}\n`;
  }
  
  formatted += '\n修复要求：\n';
  formatted += '1. 根据上述错误信息修复代码\n';
  formatted += '2. 保持原有代码风格和功能\n';
  formatted += '3. 只返回修复后的完整代码，不要解释\n';
  
  return formatted;
}