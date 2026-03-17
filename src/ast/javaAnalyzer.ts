// src/ast/javaAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import {
  ASTNode,
  ASTAnalysisResult
} from './types';

export class JavaASTAnalyzer extends BaseASTAnalyzer {
  language = 'java';
  supportedExtensions = ['.java'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const nodes: ASTNode[] = [];
    const lines = code.split('\n');
    
    let parentStack: ASTNode[] = [];
    let bracketDepth = 0;
    let inClass = false;
    let currentClassName = '';
    
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
      
      if (trimmedLine.startsWith('import ')) {
        const importMatch = trimmedLine.match(/^import\s+([^;]+);?/);
        if (importMatch) {
          const importNode = this.createNode(
            'import',
            importMatch[1],
            lineNum + 1,
            startColumn,
            lineNum + 1,
            line.length
          );
          this._addToParentOrRoot(nodes, parentStack, importNode);
        }
        continue;
      }
      
      const classMatch = trimmedLine.match(/(?:(public|private|protected)\s+)?(?:(abstract|final|static)\s+)*(?:class|interface|enum)\s+(\w+)(?:\s+extends\s+[\w<>,\s]+)?(?:\s+implements\s+[\w<>,\s]+)?\s*{?/);
      if (classMatch) {
        const className = classMatch[3];
        const endLine = this._findBlockEnd(lines, lineNum);
        const classNode = this.createNode(
          trimmedLine.includes('interface') ? 'interface' : 
          trimmedLine.includes('enum') ? 'enum' : 'class',
          className,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            visibility: (classMatch[1] as 'public' | 'private' | 'protected') || undefined,
            isStatic: classMatch[2] === 'static',
            isExported: classMatch[1] === 'public'
          }
        );
        this._addToParentOrRoot(nodes, parentStack, classNode);
        parentStack.push(classNode);
        inClass = true;
        currentClassName = className;
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        continue;
      } else {
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        
        if (inClass && bracketDepth <= 0 && parentStack.length > 0) {
          parentStack.pop();
          inClass = parentStack.some(n => n.type === 'class' || n.type === 'interface' || n.type === 'enum');
        }
      }
      
      const methodMatch = this._parseMethod(trimmedLine);
      if (methodMatch && inClass) {
        const endLine = this._findBlockEnd(lines, lineNum);
        const methodNode = this.createNode(
          'method',
          methodMatch.name,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            visibility: methodMatch.visibility,
            isStatic: methodMatch.isStatic,
            parameters: methodMatch.params,
            returnType: methodMatch.returnType,
            signature: `${methodMatch.returnType} ${methodMatch.name}(${methodMatch.params.join(', ')})`
          }
        );
        this._addToParentOrRoot(nodes, parentStack, methodNode);
        parentStack.push(methodNode);
        continue;
      }
      
      const fieldMatch = this._parseField(trimmedLine);
      if (fieldMatch && inClass) {
        const fieldNode = this.createNode(
          fieldMatch.isFinal ? 'constant' : 'variable',
          fieldMatch.name,
          lineNum + 1,
          startColumn,
          lineNum + 1,
          line.length,
          {
            visibility: fieldMatch.visibility,
            isStatic: fieldMatch.isStatic,
            typeAnnotations: [fieldMatch.type]
          }
        );
        this._addToParentOrRoot(nodes, parentStack, fieldNode);
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

  private _parseMethod(line: string): {
    name: string;
    visibility?: 'public' | 'private' | 'protected';
    isStatic: boolean;
    params: string[];
    returnType: string;
  } | null {
    const match = line.match(/(?:(public|private|protected)\s+)?(?:(static|final)\s+)*([\w<>,\s]+)\s+(\w+)\s*\(([^)]*)\)/);
    if (match) {
      return {
        name: match[4],
        visibility: (match[1] as 'public' | 'private' | 'protected') || undefined,
        isStatic: match[2] === 'static',
        params: match[5] ? match[5].split(',').map(p => p.trim()).filter(Boolean) : [],
        returnType: match[3].trim()
      };
    }
    return null;
  }

  private _parseField(line: string): {
    name: string;
    type: string;
    visibility?: 'public' | 'private' | 'protected';
    isStatic: boolean;
    isFinal: boolean;
  } | null {
    const match = line.match(/(?:(public|private|protected)\s+)?(?:(static|final)\s+)*(?:(static|final)\s+)*([\w<>,\s]+)\s+(\w+)/);
    if (match && line.includes(';')) {
      return {
        name: match[5],
        type: match[4].trim(),
        visibility: (match[1] as 'public' | 'private' | 'protected') || undefined,
        isStatic: match[2] === 'static' || match[3] === 'static',
        isFinal: match[2] === 'final' || match[3] === 'final'
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
