// src/ast/typescriptAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import {
  ASTNode,
  ASTNodeType,
  ASTAnalysisResult,
  ASTSymbolInfo,
  DependencyInfo
} from './types';

export class TypeScriptASTAnalyzer extends BaseASTAnalyzer {
  language = 'typescript';
  supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const nodes: ASTNode[] = [];
    const lines = code.split('\n');
    
    let inClass = false;
    let currentClassName = '';
    let inFunction = false;
    let currentFunctionName = '';
    let bracketDepth = 0;
    let parentStack: ASTNode[] = [];
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmedLine = line.trim();
      const startColumn = line.length - line.trimStart().length;
      
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*') && !trimmedLine.startsWith('**')) {
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
      
      if (trimmedLine.includes('import ')) {
        const importMatch = this._parseImport(line);
        if (importMatch) {
          const importNode = this.createNode(
            'import',
            importMatch.source,
            lineNum + 1,
            startColumn,
            lineNum + 1,
            line.length,
            { isExported: false }
          );
          this._addToParentOrRoot(nodes, parentStack, importNode);
        }
      }
      
      if (trimmedLine.includes('export ')) {
        this._parseExport(line, lineNum, startColumn, nodes, parentStack, filePath, lines);
      }
      
      const classMatch = trimmedLine.match(/(?:export\s+)?(?:abstract\s+)?(?:class|interface)\s+(\w+)/);
      if (classMatch) {
        const className = classMatch[1];
        const endLine = this._findBlockEnd(lines, lineNum);
        const classNode = this.createNode(
          trimmedLine.includes('interface') ? 'interface' : 'class',
          className,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            isExported: trimmedLine.includes('export'),
            isStatic: trimmedLine.includes('static'),
            visibility: trimmedLine.includes('export') ? 'public' : undefined
          }
        );
        this._addToParentOrRoot(nodes, parentStack, classNode);
        parentStack.push(classNode);
        inClass = true;
        currentClassName = className;
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
      } else {
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        
        if (inClass && bracketDepth <= 0 && parentStack.length > 0) {
          parentStack.pop();
          inClass = parentStack.some(n => n.type === 'class' || n.type === 'interface');
        }
      }
      
      const funcMatch = this._parseFunction(line, trimmedLine);
      if (funcMatch) {
        const funcName = funcMatch.name;
        const endLine = this._findBlockEnd(lines, lineNum);
        const isMethod = inClass && currentClassName;
        const funcNode = this.createNode(
          isMethod ? 'method' : 'function',
          funcName,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            isExported: trimmedLine.includes('export'),
            isStatic: trimmedLine.includes('static'),
            isAsync: trimmedLine.includes('async'),
            visibility: isMethod ? this._extractVisibility(trimmedLine) : undefined,
            parameters: funcMatch.params,
            returnType: funcMatch.returnType,
            signature: funcMatch.signature
          }
        );
        this._addToParentOrRoot(nodes, parentStack, funcNode);
        parentStack.push(funcNode);
        inFunction = true;
        currentFunctionName = funcName;
      }
      
      const varMatch = this._parseVariable(trimmedLine);
      if (varMatch && !inFunction && !inClass) {
        const varNode = this.createNode(
          varMatch.isConst ? 'constant' : 'variable',
          varMatch.name,
          lineNum + 1,
          startColumn,
          lineNum + 1,
          line.length,
          {
            isExported: trimmedLine.includes('export'),
            isStatic: false,
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
    const match = line.match(/import\s+(?:.*\s+from\s+)?['"]([^'"]+)['"]/);
    return match ? { source: match[1] } : null;
  }

  private _parseExport(
    line: string,
    lineNum: number,
    startColumn: number,
    nodes: ASTNode[],
    parentStack: ASTNode[],
    filePath: string,
    lines: string[]
  ): void {
    if (line.includes('export default')) {
      const exportNode = this.createNode(
        'export',
        'default',
        lineNum + 1,
        startColumn,
        lineNum + 1,
        line.length,
        { isExported: true }
      );
      this._addToParentOrRoot(nodes, parentStack, exportNode);
    } else if (line.includes('export {')) {
      const exportNode = this.createNode(
        'export',
        'named',
        lineNum + 1,
        startColumn,
        lineNum + 1,
        line.length,
        { isExported: true }
      );
      this._addToParentOrRoot(nodes, parentStack, exportNode);
    }
  }

  private _parseFunction(line: string, trimmedLine: string): {
    name: string;
    params: string[];
    returnType: string;
    signature: string;
  } | null {
    const patterns = [
      /(?:(public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\s*{?/,
      /(?:(public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*:\s*\([^)]*\)\s*=>\s*{?/,
      /const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*{?/,
      /let\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*{?/
    ];

    for (const pattern of patterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        const name = match[2] || match[1];
        const paramsMatch = trimmedLine.match(/\(([^)]*)\)/);
        const params = paramsMatch ? paramsMatch[1].split(',').map(p => p.trim()).filter(Boolean) : [];
        const returnTypeMatch = trimmedLine.match(/:\s*([^{]+)\s*\{?/);
        const returnType = returnTypeMatch ? returnTypeMatch[1].trim() : '';
        
        return {
          name,
          params,
          returnType,
          signature: `${name}(${params.join(', ')})${returnType ? ': ' + returnType : ''}`
        };
      }
    }
    return null;
  }

  private _parseVariable(trimmedLine: string): {
    name: string;
    type?: string;
    isConst: boolean;
  } | null {
    const constMatch = trimmedLine.match(/const\s+(\w+)(?::\s*([^=]+))?\s*=/);
    if (constMatch) {
      return { name: constMatch[1], type: constMatch[2]?.trim(), isConst: true };
    }
    const letMatch = trimmedLine.match(/let\s+(\w+)(?::\s*([^=]+))?\s*=/);
    if (letMatch) {
      return { name: letMatch[1], type: letMatch[2]?.trim(), isConst: false };
    }
    const varMatch = trimmedLine.match(/var\s+(\w+)(?::\s*([^=]+))?\s*=/);
    if (varMatch) {
      return { name: varMatch[1], type: varMatch[2]?.trim(), isConst: false };
    }
    return null;
  }

  private _extractVisibility(line: string): 'public' | 'private' | 'protected' | undefined {
    if (line.includes('private')) return 'private';
    if (line.includes('protected')) return 'protected';
    if (line.includes('public')) return 'public';
    return undefined;
  }

  private _findBlockEnd(lines: string[], startLine: number): number {
    let depth = 0;
    let inBlock = false;
    
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      depth += this._countOpenBrackets(line);
      if (depth > 0) inBlock = true;
      depth -= this._countCloseBrackets(line);
      
      if (inBlock && depth <= 0) {
        return i;
      }
    }
    return startLine;
  }

  private _countOpenBrackets(line: string): number {
    return (line.match(/{/g) || []).length;
  }

  private _countCloseBrackets(line: string): number {
    return (line.match(/}/g) || []).length;
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
