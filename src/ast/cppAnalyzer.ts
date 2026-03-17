// src/ast/cppAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import {
  ASTNode,
  ASTAnalysisResult
} from './types';

export class CppASTAnalyzer extends BaseASTAnalyzer {
  language = 'cpp';
  supportedExtensions = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const nodes: ASTNode[] = [];
    const lines = code.split('\n');
    
    let parentStack: ASTNode[] = [];
    let bracketDepth = 0;
    let inStruct = false;
    let currentStructName = '';
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const trimmedLine = line.trim();
      const startColumn = line.length - line.trimStart().length;
      
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
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
      
      if (trimmedLine.startsWith('#include')) {
        const includeMatch = trimmedLine.match(/#include\s*[<"]([^>"]+)[>"]/);
        if (includeMatch) {
          const importNode = this.createNode(
            'import',
            includeMatch[1],
            lineNum + 1,
            startColumn,
            lineNum + 1,
            line.length
          );
          this._addToParentOrRoot(nodes, parentStack, importNode);
        }
        continue;
      }
      
      const structMatch = trimmedLine.match(/(?:struct|class)\s+(\w+)(?:\s*:\s*(?:public|private|protected)?\s*(\w+))?\s*{?/);
      if (structMatch) {
        const structName = structMatch[1];
        const endLine = this._findBlockEnd(lines, lineNum);
        const structNode = this.createNode(
          trimmedLine.startsWith('class') ? 'class' : 'class',
          structName,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            typeAnnotations: structMatch[2] ? [structMatch[2]] : []
          }
        );
        this._addToParentOrRoot(nodes, parentStack, structNode);
        parentStack.push(structNode);
        inStruct = true;
        currentStructName = structName;
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        continue;
      }
      
      const funcMatch = this._parseFunction(trimmedLine, lines, lineNum);
      if (funcMatch) {
        const endLine = this._findBlockEnd(lines, lineNum);
        const isMethod = inStruct;
        const funcNode = this.createNode(
          isMethod ? 'method' : 'function',
          funcMatch.name,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            parameters: funcMatch.params,
            returnType: funcMatch.returnType,
            signature: `${funcMatch.returnType} ${funcMatch.name}(${funcMatch.params.join(', ')})`
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
            isStatic: varMatch.isStatic,
            typeAnnotations: [varMatch.type]
          }
        );
        this._addToParentOrRoot(nodes, parentStack, varNode);
      }
      
      bracketDepth += this._countOpenBrackets(line);
      bracketDepth -= this._countCloseBrackets(line);
      
      while (parentStack.length > 0 && bracketDepth <= 0) {
        const popped = parentStack.pop();
        if (popped && (popped.type === 'class' || popped.type === 'interface')) {
          inStruct = parentStack.some(n => n.type === 'class' || n.type === 'interface');
        }
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

  private _parseFunction(line: string, lines: string[], startLine: number): {
    name: string;
    params: string[];
    returnType: string;
  } | null {
    let fullFuncLine = line;
    let currentLine = startLine;
    while (!fullFuncLine.includes('{') && !fullFuncLine.includes(';') && currentLine < lines.length - 1) {
      currentLine++;
      fullFuncLine += ' ' + lines[currentLine].trim();
    }
    
    const match = fullFuncLine.match(/(?:(?:static|const|inline|virtual)\s+)*([\w:<>,\s*&]+?)\s+(\w+)\s*\(([^)]*)\)/);
    if (match && (fullFuncLine.includes('{') || !fullFuncLine.includes(';'))) {
      let returnType = match[1].trim();
      if (returnType === 'unsigned' || returnType === 'signed' || returnType === 'long' || returnType === 'short') {
        const nextMatch = fullFuncLine.match(/(?:(?:static|const|inline|virtual)\s+)*([\w:<>,\s*&]+\s+[\w:<>,\s*&]+?)\s+(\w+)\s*\(([^)]*)\)/);
        if (nextMatch) {
          returnType = nextMatch[1].trim();
          return {
            name: nextMatch[2],
            params: nextMatch[3] ? nextMatch[3].split(',').map(p => p.trim()).filter(Boolean) : [],
            returnType
          };
        }
      }
      return {
        name: match[2],
        params: match[3] ? match[3].split(',').map(p => p.trim()).filter(Boolean) : [],
        returnType
      };
    }
    return null;
  }

  private _parseVariable(line: string): {
    name: string;
    type: string;
    isConst: boolean;
    isStatic: boolean;
  } | null {
    if (line.includes('(') || line.includes(')') || line.includes('{') || line.includes('}')) {
      return null;
    }
    const match = line.match(/(?:(static|const)\s+)*([\w:<>,\s*&]+)\s+(\w+)(?:\s*=|;|$)/);
    if (match && !['if', 'for', 'while', 'do', 'switch', 'return', 'sizeof', 'typedef', 'using'].includes(match[3])) {
      return {
        name: match[3],
        type: match[2].trim(),
        isConst: line.includes('const'),
        isStatic: line.includes('static')
      };
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
