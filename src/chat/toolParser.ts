// src/chat/toolParser.ts
import * as vscode from 'vscode';
import * as path from 'path';

export interface ToolParseOptions {
  allowFlexibleFormat?: boolean;
  suggestCorrections?: boolean;
  normalizeWhitespace?: boolean;
  fuzzyMatchThreshold?: number;
}

export interface ToolParseResult {
  success: boolean;
  toolType?: string;
  parameters?: any;
  error?: string;
  suggestions?: string[];
}

export class ToolParser {
  private static readonly TOOL_PATTERNS: Record<string, RegExp> = {
    FILE: /^\s*>\s*FILE\s*:\s*(.+)$/gim,
    RUN: /^\s*>\s*RUN\s*:\s*(.+)$/gim,
    MKDIR: /^\s*>\s*MKDIR\s*:\s*(.+)$/gim,
    REPLACE: /^\s*>\s*REPLACE\s*:\s*(.+)$/gim,
    EDIT_FUNCTION: /^\s*>\s*EDIT_FUNCTION\s*:\s*(.+)$/gim,
    EDIT_CLASS: /^\s*>\s*EDIT_CLASS\s*:\s*(.+)$/gim,
    EDIT_LINE_CONTAINING: /^\s*>\s*EDIT_LINE_CONTAINING\s*:\s*(.+)$/gim,
    EDIT_BLOCK: /^\s*>\s*EDIT_BLOCK\s*:\s*(.+)$/gim,
    RANGE_EDIT: /^\s*>\s*RANGE_EDIT\s*:\s*(.+)$/gim,
    DIFF: /^\s*>\s*DIFF\s*:\s*(.+)$/gim,
    PROJECT: /^\s*>\s*PROJECT\s*:\s*(.+)$/gim,
    MULTI_FILE: /^\s*>\s*MULTI_FILE\s*:\s*(.+)$/gim,
    APPLY_BATCH: /^\s*>\s*APPLY_BATCH\s*:\s*(.+)$/gim,
    CHECK_BATCH: /^\s*>\s*CHECK_BATCH\s*:\s*(.+)$/gim,
    MCP: /^\s*>\s*MCP\s*:\s*(.+)$/gim,
    READ: /^\s*>\s*READ\s*:\s*(.+)$/gim,
    SMART_EDIT: /^\s*>\s*SMART_EDIT\s*:\s*(.+)$/gim,
    SEARCH_REPLACE: /^\s*>\s*SEARCH_REPLACE\s*:\s*(.+)$/gim
  };

  /** 匹配 ```lang\n 或 ```\n 后的代码块内容（无 g 以获取捕获组） */
  private static readonly CODE_BLOCK_PATTERN = /```(?:\w*)\r?\n([\s\S]*?)```/;
  private static readonly DIRECTIVE_BOUNDARY_PATTERN = /^\s*>\s*(?:FILE|RUN|MKDIR|REPLACE|EDIT_FUNCTION|EDIT_CLASS|EDIT_LINE_CONTAINING|EDIT_BLOCK|RANGE_EDIT|DIFF|PROJECT|MULTI_FILE|APPLY_BATCH|CHECK_BATCH|MCP|READ|SMART_EDIT|SEARCH_REPLACE)\s*:/im;
  private static readonly ORIGINAL_PATTERN = /<ORIGINAL>\s*([\s\S]*?)\s*<\/ORIGINAL>/i;
  private static readonly NEW_PATTERN = /<NEW>\s*([\s\S]*?)\s*<\/NEW>/i;

  static parseToolDirective(response: string, options: ToolParseOptions = {}): ToolParseResult[] {
    const results: ToolParseResult[] = [];
    const {
      allowFlexibleFormat = true,
      suggestCorrections = true,
      normalizeWhitespace = true
    } = options;

    for (const [toolType, pattern] of Object.entries(this.TOOL_PATTERNS)) {
      const matches = Array.from(response.matchAll(pattern));
      
      for (const match of matches) {
        const directiveLine = match[0];
        const parameter = match[1].trim();
        
        if (normalizeWhitespace) {
          directiveLine.replace(/\s+/g, ' ');
        }

        const result: ToolParseResult = {
          success: true,
          toolType,
          parameters: this.extractParameters(toolType, directiveLine, response, match.index!)
        };

        if (result.parameters === null) {
          result.success = false;
          result.error = `无法提取 ${toolType} 参数`;
          
          if (suggestCorrections) {
            result.suggestions = this.generateSuggestions(toolType, directiveLine);
          }
        }

        results.push(result);
      }
    }

    return results;
  }

  private static extractParameters(
    toolType: string,
    directiveLine: string,
    response: string,
    directiveIndex: number
  ): any | null {
    const afterDirective = response.slice(directiveIndex + directiveLine.length);
    const directiveBody = this.getDirectiveBody(afterDirective);

    switch (toolType) {
      case 'FILE':
        return this.extractFilePathAndContent(directiveLine, directiveBody);
      case 'RUN':
        return { command: directiveLine.split(':')[1]?.trim() };
      case 'MKDIR':
        return { path: directiveLine.split(':')[1]?.trim() };
      case 'REPLACE':
        return this.extractReplaceParameters(directiveLine, directiveBody);
      case 'EDIT_FUNCTION':
        return this.extractEditFunctionParameters(directiveLine, directiveBody);
      case 'EDIT_CLASS':
        return this.extractEditClassParameters(directiveLine, directiveBody);
      case 'EDIT_LINE_CONTAINING':
        return this.extractEditLineContainingParameters(directiveLine, directiveBody);
      case 'EDIT_BLOCK':
      case 'RANGE_EDIT':
      case 'DIFF':
        return this.extractRangeParameters(directiveLine, directiveBody);
      case 'PROJECT':
        return this.extractJSONParameters(directiveBody, 'object');
      case 'MULTI_FILE':
        return this.extractJSONParameters(directiveBody, 'array');
      case 'APPLY_BATCH':
        return this.extractJSONParameters(directiveBody, 'array');
      case 'CHECK_BATCH':
        return { command: directiveLine.split(':')[1]?.trim() };
      case 'MCP':
        return this.extractMCPParameters(directiveLine);
      case 'READ':
        return { path: directiveLine.split(':')[1]?.trim() };
      case 'SMART_EDIT':
        return this.extractSmartEditParameters(directiveLine, directiveBody);
      case 'SEARCH_REPLACE':
        return this.extractSearchReplaceParameters(directiveLine, directiveBody);
      default:
        return null;
    }
  }

  /**
   * 仅提取当前指令的正文，避免跨越到后续指令导致参数串扰。
   */
  private static getDirectiveBody(afterDirective: string): string {
    const match = this.DIRECTIVE_BOUNDARY_PATTERN.exec(afterDirective);
    if (!match || match.index === undefined || match.index < 0) {
      return afterDirective;
    }
    return afterDirective.slice(0, match.index);
  }

  private static extractSmartEditParameters(
    directiveLine: string,
    afterDirective: string
  ): { path: string; content: string; intent?: string } | null {
    const parts = directiveLine.split(':')[1]?.trim().split(/\s+/);
    if (!parts || parts.length < 1) {
      return null;
    }

    const path = parts[0];
    let intent: string | undefined;
    
    for (const part of parts) {
      if (part.startsWith('--intent=')) {
        intent = part.split('=')[1];
      } else if (part === '--modify') {
        intent = 'modify';
      } else if (part === '--rewrite') {
        intent = 'rewrite';
      } else if (part === '--refactor') {
        intent = 'refactor';
      }
    }

    const codeBlockMatch = afterDirective.match(this.CODE_BLOCK_PATTERN);
    if (!codeBlockMatch) {
      return null;
    }

    return { path, content: codeBlockMatch[1], intent };
  }

  private static extractSearchReplaceParameters(
    directiveLine: string,
    afterDirective: string
  ): { path: string; search: string; replace: string; global?: boolean } | null {
    const pathFromDirective = directiveLine.split(':')[1]?.trim().split(/\s+/)[0];
    const pathMatch = afterDirective.match(/^\s*(.+?)\n/);
    const path = (pathFromDirective && pathFromDirective.length > 0) ? pathFromDirective : (pathMatch ? pathMatch[1].trim() : '');
    if (!path) {
      return null;
    }

    const searchMatch = afterDirective.match(/<SEARCH>\s*([\s\S]*?)\s*<\/SEARCH>/i);
    const replaceMatch = afterDirective.match(/<REPLACE>\s*([\s\S]*?)\s*<\/REPLACE>/i);
    const globalMatch = afterDirective.match(/--global/i);

    if (!searchMatch || !replaceMatch) {
      return null;
    }

    return {
      path,
      search: this.normalizeContent(searchMatch[1]),
      replace: this.normalizeContent(replaceMatch[1]),
      global: !!globalMatch
    };
  }

  private static extractFilePathAndContent(directiveLine: string, afterDirective: string): { path: string; content: string } | null {
    const codeBlockMatch = afterDirective.match(this.CODE_BLOCK_PATTERN);
    if (!codeBlockMatch) {
      return null;
    }

    const codeContent = codeBlockMatch[1];
    const firstLine = codeContent.split('\n')[0].trim();
    const pathFromDirective = directiveLine.split(':')[1]?.trim();

    if (firstLine.startsWith('FILE:')) {
      const pathMatch = firstLine.match(/FILE:\s*(.+)/);
      if (pathMatch) {
        const actualContent = codeContent.split('\n').slice(1).join('\n').trimStart();
        return { path: pathMatch[1].trim(), content: actualContent };
      }
    }

    return { path: pathFromDirective || 'unknown', content: codeContent };
  }

  /** 规范化文本：统一换行符，仅去除末尾空白，保留缩进（代码编辑必须精确匹配） */
  private static normalizeContent(s: string): string {
    return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  }

  private static extractReplaceParameters(directiveLine: string, afterDirective: string): { path: string; original: string; new: string } | null {
    const pathFromDirective = directiveLine.split(':')[1]?.trim().split(/\s+/)[0];
    const pathMatch = afterDirective.match(/^\s*(.+?)\n/);
    const path = (pathFromDirective && pathFromDirective.length > 0) ? pathFromDirective : (pathMatch ? pathMatch[1].trim() : '');
    if (!path) {
      return null;
    }

    const originalMatch = afterDirective.match(this.ORIGINAL_PATTERN);
    const newMatch = afterDirective.match(this.NEW_PATTERN);

    if (!originalMatch || !newMatch) {
      return null;
    }

    return {
      path,
      original: this.normalizeContent(originalMatch[1]),
      new: this.normalizeContent(newMatch[1])
    };
  }

  private static extractEditFunctionParameters(
    directiveLine: string,
    afterDirective: string
  ): { path: string; functionName: string; content: string } | null {
    const parts = directiveLine.split(':')[1]?.trim().split(/\s+/);
    if (!parts || parts.length < 2) {
      return null;
    }

    const path = parts[0];
    const functionName = parts.slice(1).join(' ');

    const codeBlockMatch = afterDirective.match(this.CODE_BLOCK_PATTERN);
    if (!codeBlockMatch) {
      return null;
    }

    return { path, functionName, content: codeBlockMatch[1] };
  }

  private static extractEditClassParameters(
    directiveLine: string,
    afterDirective: string
  ): { path: string; className: string; content: string } | null {
    const parts = directiveLine.split(':')[1]?.trim().split(/\s+/);
    if (!parts || parts.length < 2) {
      return null;
    }

    const path = parts[0];
    const className = parts.slice(1).join(' ');

    const codeBlockMatch = afterDirective.match(this.CODE_BLOCK_PATTERN);
    if (!codeBlockMatch) {
      return null;
    }

    return { path, className, content: codeBlockMatch[1] };
  }

  private static extractEditLineContainingParameters(
    directiveLine: string,
    afterDirective: string
  ): { path: string; textPattern: string; content: string } | null {
    const parts = directiveLine.split(':')[1]?.trim().split(/\s+/);
    if (!parts || parts.length < 2) {
      return null;
    }

    const path = parts[0];
    const textPattern = parts.slice(1).join(' ');

    const codeBlockMatch = afterDirective.match(this.CODE_BLOCK_PATTERN);
    if (!codeBlockMatch) {
      return null;
    }

    return { path, textPattern, content: codeBlockMatch[1] };
  }

  private static extractRangeParameters(
    directiveLine: string,
    afterDirective: string
  ): { path: string; startLine?: number; endLine?: number; start?: number; end?: number; content: string } | null {
    const codeBlockMatch = afterDirective.match(this.CODE_BLOCK_PATTERN);
    if (!codeBlockMatch) {
      return null;
    }

    const pathFromDirective = directiveLine.split(':')[1]?.trim().split(/\s+/)[0];
    const path = pathFromDirective && pathFromDirective.length > 0 ? pathFromDirective : '';
    if (!path) {
      return null;
    }

    let content = codeBlockMatch[1];
    const lines = content.split('\n');

    const params: any = { path };
    let contentStartIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const startLineMatch = line.match(/startLine\s*:\s*(\d+)/i);
      const endLineMatch = line.match(/endLine\s*:\s*(\d+)/i);
      const startMatch = line.match(/\bstart\s*:\s*(\d+)/i);
      const endMatch = line.match(/\bend\s*:\s*(\d+)/i);
      if (startLineMatch) params.startLine = parseInt(startLineMatch[1], 10);
      if (endLineMatch) params.endLine = parseInt(endLineMatch[1], 10);
      if (startMatch) params.start = parseInt(startMatch[1], 10);
      if (endMatch) params.end = parseInt(endMatch[1], 10);
      if (startLineMatch || endLineMatch || startMatch || endMatch) {
        contentStartIdx = i + 1;
      } else if (contentStartIdx > 0) {
        break;
      }
    }

    if (contentStartIdx > 0) {
      content = lines.slice(contentStartIdx).join('\n').replace(/^\n+/, '');
    }
    params.content = content;

    return params;
  }

  private static extractJSONParameters(afterDirective: string, expect: 'array' | 'object' = 'object'): any | null {
    if (expect === 'array') {
      const arrayMatch = afterDirective.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch {
          /* fall through */
        }
      }
      const objectMatch = afterDirective.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          const parsed = JSON.parse(objectMatch[0]);
          if (parsed && Array.isArray(parsed.files)) {
            return parsed.files;
          }
        } catch {
          /* fall through */
        }
      }
    } else {
      const objectMatch = afterDirective.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private static extractMCPParameters(directiveLine: string): { serverName: string; toolName: string; args?: any } | null {
    const parts = directiveLine.split(':')[1]?.trim().split(/\s+/);
    if (!parts || parts.length < 2) {
      return null;
    }

    const serverName = parts[0];
    const toolName = parts[1];
    let args = {};

    if (parts.length > 2) {
      try {
        args = JSON.parse(parts.slice(2).join(' '));
      } catch {
        args = {};
      }
    }

    return { serverName, toolName, args };
  }

  static validateToolParameters(toolType: string, parameters: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!parameters) {
      errors.push('参数为空');
      return { valid: false, errors };
    }

    switch (toolType) {
      case 'FILE':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'RUN':
        if (!parameters.command) errors.push('缺少命令参数');
        break;

      case 'REPLACE':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.original) errors.push('缺少原文本参数');
        if (!parameters.new) errors.push('缺少新文本参数');
        break;

      case 'EDIT_FUNCTION':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.functionName) errors.push('缺少函数名参数');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'EDIT_CLASS':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.className) errors.push('缺少类名参数');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'EDIT_LINE_CONTAINING':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.textPattern) errors.push('缺少文本模式参数');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'MCP':
        if (!parameters.serverName) errors.push('缺少服务器名称参数');
        if (!parameters.toolName) errors.push('缺少工具名称参数');
        break;

      case 'READ':
        if (!parameters.path) errors.push('缺少路径参数');
        break;

      case 'SMART_EDIT':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'SEARCH_REPLACE':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.search) errors.push('缺少搜索内容参数');
        if (!parameters.replace) errors.push('缺少替换内容参数');
        break;

      case 'EDIT_BLOCK':
        if (!parameters.path) errors.push('缺少路径参数');
        if (parameters.startLine === undefined || parameters.endLine === undefined) errors.push('缺少 startLine/endLine');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'RANGE_EDIT':
        if (!parameters.path) errors.push('缺少路径参数');
        if (parameters.start === undefined || parameters.end === undefined) errors.push('缺少 start/end');
        if (!parameters.content) errors.push('缺少内容参数');
        break;

      case 'DIFF':
        if (!parameters.path) errors.push('缺少路径参数');
        if (!parameters.content) errors.push('缺少 diff 内容参数');
        break;

      case 'APPLY_BATCH':
        const batchFiles = Array.isArray(parameters) ? parameters : parameters?.files;
        if (!Array.isArray(batchFiles) || batchFiles.length === 0) errors.push('缺少 files 数组');
        else if (batchFiles.some((f: any) => !f?.path || f?.content === undefined)) errors.push('files 中每项需包含 path 和 content');
        break;

      default:
        errors.push(`未知工具类型: ${toolType}`);
    }

    return { valid: errors.length === 0, errors };
  }

  private static generateSuggestions(toolType: string, directiveLine: string): string[] {
    const suggestions: string[] = [];

    if (!directiveLine.startsWith('>')) {
      suggestions.push('指令应以 ">" 开头');
    }

    if (!directiveLine.includes(':')) {
      suggestions.push('指令应包含 ":" 分隔符');
    }

    if (toolType === 'FILE') {
      suggestions.push('确保代码块有语言标记 (如 ```python)');
    }

    if (toolType === 'REPLACE') {
      suggestions.push('确保 <ORIGINAL> 和 <NEW> 标签正确闭合');
    }

    suggestions.push('检查指令格式是否符合文档要求');

    return suggestions;
  }

  static findSimilarFunctions(
    document: vscode.TextDocument,
    functionName: string,
    threshold: number = 0.6
  ): string[] {
    const fullText = document.getText();
    const lines = fullText.split('\n');
    const similarFunctions: string[] = [];

    const functionPatterns: RegExp[] = [
      /function\s+(\w+)/g,
      /const\s+(\w+)\s*=\s*async\s*\(/g,
      /const\s+(\w+)\s*=\s*function/g,
      /let\s+(\w+)\s*=\s*async\s*\(/g,
      /let\s+(\w+)\s*=\s*function/g,
      /var\s+(\w+)\s*=\s*async\s*\(/g,
      /var\s+(\w+)\s*=\s*function/g,
      /(\w+)\s*:\s*async\s+function/g,
      /(\w+)\s*:\s*function/g,
      /async\s+function\s+(\w+)/g,
      /class\s+(\w+)/g,
      /def\s+(\w+)\s*\(/g,
      /def\s+(\w+)\s*:/g,
      /fn\s+(\w+)\s*\(/g,
      /fn\s+(\w+)\s*[<(]/g,
      /func\s+(\w+)\s*\(/g,
      /func\s+(\w+)\s*[<(]/g,
      /public\s+(?:static\s+)?function\s+(\w+)/g,
      /private\s+(?:static\s+)?function\s+(\w+)/g,
      /protected\s+(?:static\s+)?function\s+(\w+)/g,
      /export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/g,
      /export\s+(?:default\s+)?class\s+(\w+)/g,
      /export\s+(?:const|let|var)\s+(\w+)\s*=/g,
      /interface\s+(\w+)(?:\s*extends|\s*\{)/g,
      /type\s+(\w+)\s*=/g,
      /@function\s+(\w+)/g,
      /@method\s+(\w+)/g,
      /#\s*def\s+(\w+)/g,
      /#\s*class\s+(\w+)/g,
    ];

    for (const line of lines) {
      for (const pattern of functionPatterns) {
        const matches = line.matchAll(pattern);
        for (const match of matches) {
          const candidate = match[1];
          if (candidate && candidate !== functionName) {
            const similarity = this.levenshteinSimilarity(candidate, functionName);
            if (similarity >= threshold) {
              similarFunctions.push(candidate);
            }
          }
        }
      }
    }

    return [...new Set(similarFunctions)].slice(0, 5);
  }

  private static levenshteinSimilarity(s1: string, s2: string): number {
    const distance = this.levenshteinDistance(s1.toLowerCase(), s2.toLowerCase());
    const maxLength = Math.max(s1.length, s2.length);
    return 1 - distance / maxLength;
  }

  private static levenshteinDistance(s: string, t: string): number {
    if (!s) return t.length;
    if (!t) return s.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= t.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= s.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= t.length; i++) {
      for (let j = 1; j <= s.length; j++) {
        if (t.charAt(i - 1) === s.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[t.length][s.length];
  }

  static normalizeDirective(directive: string): string {
    return directive
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }
}
