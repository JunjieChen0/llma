// src/ast/pythonAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import {
  ASTNode,
  ASTAnalysisResult
} from './types';

export class PythonASTAnalyzer extends BaseASTAnalyzer {
  language = 'python';
  supportedExtensions = ['.py'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const nodes: ASTNode[] = [];
    const lines = code.split('\n');
    
    let parentStack: ASTNode[] = [];
    let currentIndent = 0;
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmedLine = line.trim();
      const indent = line.length - line.trimStart().length;
      const startColumn = indent;
      
      if (trimmedLine.startsWith('#')) {
        const commentNode = this.createNode(
          'comment',
          'Comment',
          lineNum + 1,
          startColumn,
          lineNum + 1,
          line.length
        );
        this._addToParentOrRoot(nodes, parentStack, commentNode);
        continue;
      }
      
      while (parentStack.length > 0 && indent <= this._getNodeIndent(parentStack[parentStack.length - 1])) {
        parentStack.pop();
      }
      
      if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('from ')) {
        const importMatch = this._parseImport(trimmedLine);
        if (importMatch) {
          const importNode = this.createNode(
            'import',
            importMatch.source,
            lineNum + 1,
            startColumn,
            lineNum + 1,
            line.length
          );
          this._addToParentOrRoot(nodes, parentStack, importNode);
        }
        continue;
      }
      
      const classMatch = trimmedLine.match(/^class\s+(\w+)(?:\(([^)]*)\))?\s*:/);
      if (classMatch) {
        const className = classMatch[1];
        const endLine = this._findBlockEnd(lines, lineNum, indent);
        const classNode = this.createNode(
          'class',
          className,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            isExported: true,
            typeAnnotations: classMatch[2] ? [classMatch[2]] : []
          }
        );
        (classNode as any)._indent = indent;
        this._addToParentOrRoot(nodes, parentStack, classNode);
        parentStack.push(classNode);
        continue;
      }
      
      const funcMatch = trimmedLine.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?\s*:/);
      if (funcMatch) {
        const funcName = funcMatch[1];
        const endLine = this._findBlockEnd(lines, lineNum, indent);
        const isMethod = parentStack.some(n => n.type === 'class');
        const funcNode = this.createNode(
          isMethod ? 'method' : 'function',
          funcName,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            isExported: !funcName.startsWith('_'),
            isAsync: trimmedLine.startsWith('async'),
            parameters: this._parseParams(funcMatch[2]),
            returnType: funcMatch[3]?.trim(),
            signature: `${funcName}(${funcMatch[2]})${funcMatch[3] ? ' -> ' + funcMatch[3].trim() : ''}`
          }
        );
        (funcNode as any)._indent = indent;
        this._addToParentOrRoot(nodes, parentStack, funcNode);
        parentStack.push(funcNode);
        continue;
      }
      
      const varMatch = this._parseVariable(trimmedLine);
      if (varMatch && parentStack.length === 0) {
        const varNode = this.createNode(
          varMatch.isConst ? 'constant' : 'variable',
          varMatch.name,
          lineNum + 1,
          startColumn,
          lineNum + 1,
          line.length,
          {
            isExported: !varMatch.name.startsWith('_'),
            typeAnnotations: varMatch.type ? [varMatch.type] : []
          }
        );
        this._addToParentOrRoot(nodes, parentStack, varNode);
      }
    }
    
    const symbols = this.collectSymbols(nodes).map(s => ({ ...s, filePath }));
    const dependencies = this.collectDependencies(nodes);
    const statistics = this.calculateStatistics(nodes, code);
    
    return {
      language: this.language,
      filePath,
      nodes,
      symbols,
      dependencies,
      statistics
    };
  }

  private _parseImport(line: string): { source: string } | null {
    if (line.startsWith('import ')) {
      const match = line.match(/^import\s+([^\s#]+)/);
      return match ? { source: match[1] } : null;
    } else {
      const match = line.match(/^from\s+([^\s#]+)/);
      return match ? { source: match[1] } : null;
    }
  }

  private _parseParams(paramsStr: string): string[] {
    if (!paramsStr) return [];
    return paramsStr.split(',').map(p => {
      const colonIndex = p.indexOf(':');
      return (colonIndex > 0 ? p.substring(0, colonIndex) : p).trim();
    }).filter(Boolean);
  }

  private _parseVariable(line: string): {
    name: string;
    type?: string;
    isConst: boolean;
  } | null {
    const match = line.match(/^(\w+)(?:\s*:\s*([^=]+))?\s*=/);
    if (match) {
      const name = match[1];
      const isConst = name === name.toUpperCase();
      return {
        name,
        type: match[2]?.trim(),
        isConst
      };
    }
    return null;
  }

  private _findBlockEnd(lines: string[], startLine: number, startIndent: number): number {
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;
      const indent = line.length - line.trimStart().length;
      if (indent <= startIndent && trimmed) {
        return i - 1;
      }
    }
    return lines.length - 1;
  }

  private _getNodeIndent(node: ASTNode): number {
    return (node as any)._indent ?? 0;
  }

  private _addToParentOrRoot(nodes: ASTNode[], parentStack: ASTNode[], newNode: ASTNode): void {
    if (parentStack.length > 0) {
      const parent = parentStack[parentStack.length - 1];
      newNode.parentId = parent.id;
      parent.children.push(newNode);
    } else {
      nodes.push(newNode);
    }
  }
}
