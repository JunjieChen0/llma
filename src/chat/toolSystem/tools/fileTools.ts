// src/chat/toolSystem/tools/fileTools.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTool, ToolDefinition, ToolExecutionContext, ToolResult } from '../base';

export class ReadFileTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'READ',
    description: '读取文件内容',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: '文件路径（相对于工作区根目录）',
        required: true
      },
      {
        name: 'startLine',
        type: 'number',
        description: '起始行号（可选）',
        required: false
      },
      {
        name: 'endLine',
        type: 'number',
        description: '结束行号（可选）',
        required: false
      }
    ],
    dangerLevel: 'safe'
  };

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { path: filepath, startLine, endLine } = params;
    const workspaceRoot = context.provider.workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = path.isAbsolute(filepath) ? filepath : path.join(workspaceRoot, filepath);

    try {
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: `文件不存在: ${filepath}` };
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      let output = content;
      if (startLine !== undefined || endLine !== undefined) {
        const start = startLine ?? 1;
        const end = endLine ?? lines.length;
        output = lines.slice(start - 1, end).join('\n');
        output = `--- 第 ${start} - ${end} 行 ---\n${output}`;
      }

      return { 
        success: true, 
        output,
        metadata: { filepath, lines: lines.length }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class WriteFileTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'FILE',
    description: '写入或创建文件',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: '文件路径',
        required: true
      },
      {
        name: 'content',
        type: 'string',
        description: '文件内容',
        required: true
      },
      {
        name: 'append',
        type: 'boolean',
        description: '是否追加模式',
        required: false,
        default: false
      }
    ],
    dangerLevel: 'warning'
  };

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { path: filepath, content, append = false } = params;
    const workspaceRoot = context.provider.workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = path.isAbsolute(filepath) ? filepath : path.join(workspaceRoot, filepath);

    try {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (append) {
        fs.appendFileSync(fullPath, content, 'utf-8');
      } else {
        fs.writeFileSync(fullPath, content, 'utf-8');
      }

      return { 
        success: true, 
        output: append ? `已追加内容到: ${filepath}` : `已写入文件: ${filepath}`,
        metadata: { filepath, size: content.length }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class MakeDirectoryTool extends BaseTool {
  definition: ToolDefinition = {
    name: 'MKDIR',
    description: '创建目录',
    category: 'file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: '目录路径',
        required: true
      }
    ],
    dangerLevel: 'safe'
  };

  async execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const { path: dirpath } = params;
    const workspaceRoot = context.provider.workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fullPath = path.isAbsolute(dirpath) ? dirpath : path.join(workspaceRoot, dirpath);

    try {
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }

      return { 
        success: true, 
        output: `已创建目录: ${dirpath}`,
        metadata: { dirpath }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
