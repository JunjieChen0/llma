// src/ast/goAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import {
  ASTNode,
  ASTAnalysisResult
} from './types';

export class GoASTAnalyzer extends BaseASTAnalyzer {
  language = 'go';
  supportedExtensions = ['.go'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const nodes: ASTNode[] = [];
    const lines = code.split('\n');
    
    let parentStack: ASTNode[] = [];
    let bracketDepth = 0;
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmedLine = line.trim();
      const startColumn = line.length - line.trimStart().length;
      
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
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
      
      if (trimmedLine.startsWith('package ')) {
        const pkgMatch = trimmedLine.match(/^package\s+(\w+)/);
        if (pkgMatch) {
          const pkgNode = this.createNode(
            'module',
            pkgMatch[1],
            lineNum + 1,
            startColumn,
            lineNum + 1,
            line.length
          );
          nodes.push(pkgNode);
        }
        continue;
      }
      
      if (trimmedLine.startsWith('import ')) {
        const importMatch = this._parseImport(trimmedLine, line, lines, lineNum);
        if (importMatch) {
          const importNode = this.createNode(
            'import',
            importMatch,
            lineNum + 1,
            startColumn,
            lineNum + 1,
            line.length
          );
          this._addToParentOrRoot(nodes, parentStack, importNode);
        }
        continue;
      }
      
      const typeMatch = trimmedLine.match(/^(?:(type)\s+(\w+)\s+(?:struct|interface)\s*{)/);
      if (typeMatch) {
        const typeName = typeMatch[2];
        const endLine = this._findBlockEnd(lines, lineNum);
        const typeNode = this.createNode(
          trimmedLine.includes('interface') ? 'interface' : 'class',
          typeName,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            isExported: typeName[0] === typeName[0].toUpperCase()
          }
        );
        this._addToParentOrRoot(nodes, parentStack, typeNode);
        parentStack.push(typeNode);
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        continue;
      }
      
      const funcMatch = this._parseFunction(trimmedLine);
      if (funcMatch) {
        const endLine = this._findBlockEnd(lines, lineNum);
        const isMethod = funcMatch.receiver !== '';
        const funcNode = this.createNode(
          isMethod ? 'method' : 'function',
          funcMatch.name,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            isExported: funcMatch.name[0] === funcMatch.name[0].toUpperCase(),
            parameters: funcMatch.params,
            returnType: funcMatch.returnType,
            signature: `${funcMatch.receiver ? '(' + funcMatch.receiver + ') ' : ''}${funcMatch.name}(${funcMatch.params.join(', ')})${funcMatch.returnType ? ' ' + funcMatch.returnType : ''}`
          }
        );
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
            isExported: varMatch.name[0] === varMatch.name[0].toUpperCase(),
            typeAnnotations: varMatch.type ? [varMatch.type] : []
          }
        );
        this._addToParentOrRoot(nodes, parentStack, varNode);
      }
      
      bracketDepth += this._countOpenBrackets(line);
      bracketDepth -= this._countCloseBrackets(line);
      
      while (parentStack.length > 0 && bracketDepth <= 0) {
        parentStack.pop();
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

  private _parseImport(line: string, fullLine: string, lines: string[], startLine: number): string {
    if (line.includes('(')) {
      const imports: string[] = [];
      for (let i = startLine + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (l === ')') break;
        const match = l.match(/"([^"]+)"/);
        if (match) {
          imports.push(match[1]);
        }
      }
      return imports.join(', ');
    } else {
      const match = line.match(/"([^"]+)"/);
      return match ? match[1] : '';
    }
  }

  private _parseFunction(line: string): {
    name: string;
    receiver: string;
    params: string[];
    returnType: string;
  } | null {
    const receiverMatch = line.match(/^func\s+\(([^)]+)\)\s+(\w+)/);
    if (receiverMatch) {
      const receiver = receiverMatch[1];
      const name = receiverMatch[2];
      const rest = line.substring(line.indexOf(name) + name.length);
      const paramsMatch = rest.match(/\(([^)]*)\)/);
      const params = paramsMatch ? paramsMatch[1].split(',').map(p => p.trim()).filter(Boolean) : [];
      const returnMatch = rest.match(/\)\s*([^{]+)/);
      const returnType = returnMatch ? returnMatch[1].trim() : '';
      return { name, receiver, params, returnType };
    }
    
    const funcMatch = line.match(/^func\s+(\w+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      const rest = line.substring(line.indexOf(name) + name.length);
      const paramsMatch = rest.match(/\(([^)]*)\)/);
      const params = paramsMatch ? paramsMatch[1].split(',').map(p => p.trim()).filter(Boolean) : [];
      const returnMatch = rest.match(/\)\s*([^{]+)/);
      const returnType = returnMatch ? returnMatch[1].trim() : '';
      return { name, receiver: '', params, returnType };
    }
    return null;
  }

  private _parseVariable(line: string): {
    name: string;
    type?: string;
    isConst: boolean;
  } | null {
    const constMatch = line.match(/^const\s+(\w+)(?:\s+(\w+))?\s*=/);
    if (constMatch) {
      return { name: constMatch[1], type: constMatch[2], isConst: true };
    }
    const varMatch = line.match(/^var\s+(\w+)(?:\s+(\w+))?\s*=/);
    if (varMatch) {
      return { name: varMatch[1], type: varMatch[2], isConst: false };
    }
    return null;
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
