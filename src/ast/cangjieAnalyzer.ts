// src/ast/cangjieAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import {
  ASTNode,
  ASTAnalysisResult
} from './types';

export class CangjieASTAnalyzer extends BaseASTAnalyzer {
  language = 'cangjie';
  supportedExtensions = ['.cj'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const nodes: ASTNode[] = [];
    const lines = code.split('\n');
    
    let parentStack: ASTNode[] = [];
    let bracketDepth = 0;
    let inClass = false;
    let inInterface = false;
    let inTrait = false;
    
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
      
      const classMatch = trimmedLine.match(/^(?:(public|internal)\s+)?(?:(abstract|final|sealed)\s+)*(?:class|struct)\s+(\w+)(?:\s*<[^>]+>)?(?:\s+extends\s+[\w<>,\s]+)?(?:\s+implements\s+[\w<>,\s]+)?\s*{?/);
      if (classMatch) {
        const className = classMatch[3];
        const endLine = this._findBlockEnd(lines, lineNum);
        const classNode = this.createNode(
          'class',
          className,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            visibility: (classMatch[1] as 'public' | 'private' | 'internal') || 'internal',
            isExported: classMatch[1] === 'public'
          }
        );
        this._addToParentOrRoot(nodes, parentStack, classNode);
        parentStack.push(classNode);
        inClass = true;
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        continue;
      }
      
      const interfaceMatch = trimmedLine.match(/^(?:(public|internal)\s+)?interface\s+(\w+)(?:\s*<[^>]+>)?\s*{?/);
      if (interfaceMatch) {
        const interfaceName = interfaceMatch[2];
        const endLine = this._findBlockEnd(lines, lineNum);
        const interfaceNode = this.createNode(
          'interface',
          interfaceName,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            visibility: (interfaceMatch[1] as 'public' | 'private' | 'internal') || 'internal',
            isExported: interfaceMatch[1] === 'public'
          }
        );
        this._addToParentOrRoot(nodes, parentStack, interfaceNode);
        parentStack.push(interfaceNode);
        inInterface = true;
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        continue;
      }
      
      const traitMatch = trimmedLine.match(/^(?:(public|internal)\s+)?trait\s+(\w+)(?:\s*<[^>]+>)?\s*{?/);
      if (traitMatch) {
        const traitName = traitMatch[2];
        const endLine = this._findBlockEnd(lines, lineNum);
        const traitNode = this.createNode(
          'interface',
          traitName,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            visibility: (traitMatch[1] as 'public' | 'private' | 'internal') || 'internal',
            isExported: traitMatch[1] === 'public'
          }
        );
        this._addToParentOrRoot(nodes, parentStack, traitNode);
        parentStack.push(traitNode);
        inTrait = true;
        bracketDepth += this._countOpenBrackets(line);
        bracketDepth -= this._countCloseBrackets(line);
        continue;
      }
      
      const funcMatch = this._parseFunction(trimmedLine);
      if (funcMatch) {
        const endLine = this._findBlockEnd(lines, lineNum);
        const isMethod = inClass || inInterface || inTrait;
        const funcNode = this.createNode(
          isMethod ? 'method' : 'function',
          funcMatch.name,
          lineNum + 1,
          startColumn,
          endLine + 1,
          lines[endLine].length,
          {
            visibility: funcMatch.visibility,
            isStatic: funcMatch.isStatic,
            isAsync: funcMatch.isAsync,
            parameters: funcMatch.params,
            returnType: funcMatch.returnType,
            signature: `${funcMatch.name}(${funcMatch.params.join(', ')}): ${funcMatch.returnType || 'Unit'}`
          }
        );
        this._addToParentOrRoot(nodes, parentStack, funcNode);
        parentStack.push(funcNode);
        continue;
      }
      
      const varMatch = this._parseVariable(trimmedLine);
      if (varMatch && (parentStack.length === 0 || parentStack.every(n => n.type === 'class' || n.type === 'interface'))) {
        const varNode = this.createNode(
          varMatch.isConst ? 'constant' : 'variable',
          varMatch.name,
          lineNum + 1,
          startColumn,
          lineNum + 1,
          line.length,
          {
            visibility: varMatch.visibility,
            isStatic: varMatch.isStatic,
            typeAnnotations: varMatch.type ? [varMatch.type] : []
          }
        );
        this._addToParentOrRoot(nodes, parentStack, varNode);
      }
      
      bracketDepth += this._countOpenBrackets(line);
      bracketDepth -= this._countCloseBrackets(line);
      
      while (parentStack.length > 0 && bracketDepth <= 0) {
        const popped = parentStack.pop();
        if (popped) {
          if (popped.type === 'class') inClass = parentStack.some(n => n.type === 'class');
          if (popped.type === 'interface') inInterface = parentStack.some(n => n.type === 'interface');
          if (popped.type === 'interface' && popped.name.toLowerCase().includes('trait')) {
            inTrait = parentStack.some(n => n.type === 'interface' && n.name.toLowerCase().includes('trait'));
          }
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

  private _parseFunction(line: string): {
    name: string;
    visibility?: 'public' | 'private' | 'internal';
    isStatic: boolean;
    isAsync: boolean;
    params: string[];
    returnType?: string;
  } | null {
    const match = line.match(/(?:(public|internal|private)\s+)?(?:(static)\s+)?(?:(async)\s+)?fn\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?\s*{?/);
    if (match) {
      return {
        name: match[4],
        visibility: (match[1] as 'public' | 'private' | 'internal') || undefined,
        isStatic: !!match[2],
        isAsync: !!match[3],
        params: match[5] ? match[5].split(',').map(p => p.trim()).filter(Boolean) : [],
        returnType: match[6]?.trim()
      };
    }
    return null;
  }

  private _parseVariable(line: string): {
    name: string;
    type?: string;
    visibility?: 'public' | 'private' | 'internal';
    isStatic: boolean;
    isConst: boolean;
  } | null {
    const constMatch = line.match(/(?:(public|internal|private)\s+)?(?:(static)\s+)?(?:const)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/);
    if (constMatch) {
      return {
        name: constMatch[3],
        type: constMatch[4]?.trim(),
        visibility: (constMatch[1] as 'public' | 'private' | 'internal') || undefined,
        isStatic: !!constMatch[2],
        isConst: true
      };
    }
    const letMatch = line.match(/(?:(public|internal|private)\s+)?(?:(static)\s+)?(?:let|var)\s+(\w+)(?:\s*:\s*([^=]+))?\s*=/);
    if (letMatch) {
      return {
        name: letMatch[3],
        type: letMatch[4]?.trim(),
        visibility: (letMatch[1] as 'public' | 'private' | 'internal') || undefined,
        isStatic: !!letMatch[2],
        isConst: line.includes('let')
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
