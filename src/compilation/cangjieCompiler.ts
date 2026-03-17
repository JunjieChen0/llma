// cangjieCompiler.ts - 仓颉语言编译反馈闭环
import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { execWithTimeout } from '../chat/tools';
import { TIMEOUT } from '../constants';

export interface CompilationResult {
  success: boolean;
  stdout: string;
  stderr: string;
  errors: CompilationError[];
  command: string;
}

export interface CompilationError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * 检测仓颉文件的编译命令
 */
export function detectCangjieCompileCommand(filePath: string): string {
  const dir = path.dirname(filePath);
  const cjpmToml = path.join(dir, 'cjpm.toml');
  
  // 检查是否有 cjpm.toml（项目模式）
  if (require('fs').existsSync(cjpmToml)) {
    return `cjpm build`;
  }
  
  // 单文件模式
  const fileName = path.basename(filePath, '.cj');
  return `cjc ${filePath} -o ${fileName}`;
}

/**
 * 解析仓颉编译器错误信息
 */
export function parseCangjieErrors(stderr: string): CompilationError[] {
  const errors: CompilationError[] = [];
  
  // 仓颉编译器错误格式：filename:line:column: error: message
  const errorRegex = /([^:\s]+\.cj):(\d+):(\d+):\s*(error|warning):\s*(.+)/g;
  let match;
  
  while ((match = errorRegex.exec(stderr)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2]),
      column: parseInt(match[3]),
      message: match[5].trim(),
      severity: match[4] === 'error' ? 'error' : 'warning'
    });
  }
  
  // 如果没有匹配到标准格式，尝试简单格式
  if (errors.length === 0) {
    const simpleErrorRegex = /(error|warning):\s*(.+)/gi;
    while ((match = simpleErrorRegex.exec(stderr)) !== null) {
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
 * 格式化编译错误为 AI 可理解的提示
 */
export function formatErrorsForAI(errors: CompilationError[]): string {
  if (errors.length === 0) {
    return '';
  }
  
  let formatted = '编译错误列表（必须修复）:\n';
  for (const error of errors) {
    const severity = error.severity.toUpperCase();
    formatted += `[${severity}] ${error.file}:${error.line}:${error.column} - ${error.message}\n`;
  }
  
  formatted += '\n修复要求：\n';
  formatted += '1. 根据上述错误信息修复代码\n';
  formatted += '2. 保持原有代码风格和功能\n';
  formatted += '3. 只返回修复后的完整代码，不要解释\n';
  
  return formatted;
}

/**
 * 执行仓颉编译
 */
export async function compileCangjieFile(
  filePath: string,
  abortSignal?: AbortSignal
): Promise<CompilationResult> {
  const command = detectCangjieCompileCommand(filePath);
  const cwd = path.dirname(filePath);
  
  try {
    const result = await execWithTimeout(
      command,
      { cwd, env: process.env },
      TIMEOUT.COMMAND_SHORT,
      abortSignal
    );
    
    const errors = parseCangjieErrors(result.stderr);
    const success = result.killed || (errors.filter(e => e.severity === 'error').length === 0);
    
    return {
      success,
      stdout: result.stdout,
      stderr: result.stderr,
      errors,
      command
    };
  } catch (error: any) {
    return {
      success: false,
      stdout: '',
      stderr: error.message || '编译执行失败',
      errors: [{
        file: filePath,
        line: 0,
        column: 0,
        message: error.message || '编译命令执行失败',
        severity: 'error'
      }],
      command
    };
  }
}

/**
 * 编译反馈循环 - 自动修复编译错误
 */
export async function compileWithAutoFix(
  document: vscode.TextDocument,
  generateCode: () => Promise<string>,
  maxRetries: number = 2,
  abortSignal?: AbortSignal
): Promise<{ success: boolean; code: string; attempts: number }> {
  
  let currentCode = document.getText();
  let attempts = 1;
  
  // 首次生成
  currentCode = await generateCode();
  
  // 应用代码到文档
  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  edit.replace(document.uri, fullRange, currentCode);
  await vscode.workspace.applyEdit(edit);
  
  // 编译检查
  let result = await compileCangjieFile(document.fileName, abortSignal);
  
  if (result.success) {
    return { success: true, code: currentCode, attempts };
  }
  
  // 编译失败，进入修复循环
  for (let retry = 0; retry < maxRetries; retry++) {
    attempts++;
    
    // 格式化错误信息
    const errorHint = formatErrorsForAI(result.errors);
    
    // 重新生成代码（带错误信息）
    const fixedCode = await generateCodeWithErrorContext(errorHint, currentCode);
    
    // 应用修复后的代码
    const fixEdit = new vscode.WorkspaceEdit();
    fixEdit.replace(document.uri, fullRange, fixedCode);
    await vscode.workspace.applyEdit(fixEdit);
    
    currentCode = fixedCode;
    
    // 再次编译
    result = await compileCangjieFile(document.fileName, abortSignal);
    
    if (result.success) {
      return { success: true, code: currentCode, attempts };
    }
  }
  
  // 修复失败
  vscode.window.showWarningMessage(
    `仓颉代码自动修复失败（尝试 ${attempts} 次），仍有 ${result.errors.filter(e => e.severity === 'error').length} 个编译错误`
  );
  
  return { success: false, code: currentCode, attempts };
}

/**
 * 带错误上下文的代码生成（调用 AI）
 */
async function generateCodeWithErrorContext(
  errorHint: string,
  originalCode: string
): Promise<string> {
  // 这里需要调用 AI API，传入错误信息
  // 由于需要访问 AI 配置，这个函数应该在 messageHandler 中实现
  // 此处仅作为接口定义
  
  const prompt = `之前的代码编译失败，请修复以下错误：\n\n${errorHint}\n\n原始代码：\n\`\`\`\n${originalCode}\n\`\`\`\n\n请返回修复后的完整代码（不要 markdown 格式）：`;
  
  // 实际实现需要调用 callSimpleAI 或类似函数
  // 这里返回原始代码作为占位
  return originalCode;
}
