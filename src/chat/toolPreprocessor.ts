import * as vscode from 'vscode';
import * as fs from 'fs';
import { resolveFilePath } from './smartEditor';

export interface ParsedTool {
  type: string;
  filepath?: string;
  content?: string;
  original?: string;
  new?: string;
  [key: string]: any;
}

export interface FileContext {
  exists: (filepath: string) => boolean;
  getSize: (filepath: string) => number;
}

/**
 * 工具预处理器：在执行前验证和优化工具选择
 */
export class ToolPreprocessor {
  private fileContext: FileContext;

  constructor() {
    this.fileContext = {
      exists: (filepath: string) => {
        const uri = resolveFilePath(filepath);
        return uri ? fs.existsSync(uri.fsPath) : false;
      },
      getSize: (filepath: string) => {
        const uri = resolveFilePath(filepath);
        if (!uri || !fs.existsSync(uri.fsPath)) return 0;
        return fs.statSync(uri.fsPath).size;
      }
    };
  }

  /**
   * 预处理工具列表
   */
  preprocessTools(tools: ParsedTool[]): ParsedTool[] {
    const optimized: ParsedTool[] = [];
    const fileToolMap = new Map<string, ParsedTool[]>();

    // 按文件分组
    for (const tool of tools) {
      if (tool.filepath) {
        if (!fileToolMap.has(tool.filepath)) {
          fileToolMap.set(tool.filepath, []);
        }
        fileToolMap.get(tool.filepath)!.push(tool);
      } else {
        optimized.push(tool);
      }
    }

    // 对每个文件的工具进行优化
    for (const [filepath, fileTools] of fileToolMap) {
      const optimizedFileTools = this.optimizeFileTools(filepath, fileTools);
      optimized.push(...optimizedFileTools);
    }

    return optimized;
  }

  /**
   * 优化单个文件的工具
   */
  private optimizeFileTools(filepath: string, tools: ParsedTool[]): ParsedTool[] {
    const fileExists = this.fileContext.exists(filepath);

    // 规则1: 文件不存在时，REPLACE/EDIT_* 转为 FILE
    if (!fileExists) {
      const hasCreateTool = tools.some(t => t.type === 'FILE');
      if (!hasCreateTool && tools.length > 0) {
        const firstTool = tools[0];
        if (['REPLACE', 'EDIT_FUNCTION', 'EDIT_CLASS', 'EDIT_LINE_CONTAINING'].includes(firstTool.type)) {
          return [{ ...firstTool, type: 'FILE', _optimized: 'file-not-exists' }];
        }
      }
    }

    // 规则2: 多个小修改 → 考虑合并
    if (tools.length >= 3 && tools.every(t => t.type === 'REPLACE')) {
      // 可以考虑合并为 APPLY_BATCH，但需要更复杂的逻辑
      // 暂时保持原样
    }

    // 规则3: FILE 工具覆盖其他工具
    const fileToolIndex = tools.findIndex(t => t.type === 'FILE');
    if (fileToolIndex !== -1) {
      return [tools[fileToolIndex]];
    }

    return tools;
  }

  /**
   * 验证工具参数
   */
  validateTool(tool: ParsedTool): { valid: boolean; error?: string } {
    if (!tool.type) {
      return { valid: false, error: '工具类型缺失' };
    }

    switch (tool.type) {
      case 'REPLACE':
        if (!tool.filepath || !tool.original || tool.new === undefined) {
          return { valid: false, error: 'REPLACE 需要 filepath, original, new 参数' };
        }
        break;
      case 'FILE':
        if (!tool.filepath || !tool.content) {
          return { valid: false, error: 'FILE 需要 filepath 和 content 参数' };
        }
        break;
      case 'EDIT_FUNCTION':
      case 'EDIT_CLASS':
        if (!tool.filepath || !tool.name || !tool.content) {
          return { valid: false, error: `${tool.type} 需要 filepath, name, content 参数` };
        }
        break;
      case 'RUN':
        if (!tool.command) {
          return { valid: false, error: 'RUN 需要 command 参数' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * 推荐最佳工具
   */
  recommendTool(intent: {
    action: 'create' | 'modify' | 'delete';
    scope?: 'line' | 'function' | 'class' | 'file';
    filepath: string;
  }): string {
    const fileExists = this.fileContext.exists(intent.filepath);

    if (intent.action === 'create' || !fileExists) {
      return 'FILE';
    }

    if (intent.action === 'modify') {
      switch (intent.scope) {
        case 'line': return 'EDIT_LINE_CONTAINING';
        case 'function': return 'EDIT_FUNCTION';
        case 'class': return 'EDIT_CLASS';
        default: return 'REPLACE';
      }
    }

    return 'FILE';
  }
}
