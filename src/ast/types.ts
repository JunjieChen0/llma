// src/ast/types.ts

/**
 * AST 分析相关类型定义
 */

export type ASTNodeType = 
  | 'program'
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'variable'
  | 'constant'
  | 'import'
  | 'export'
  | 'type'
  | 'enum'
  | 'namespace'
  | 'module'
  | 'expression'
  | 'statement'
  | 'comment'
  | 'unknown';

export interface ASTNode {
  id: string;
  type: ASTNodeType;
  name: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  parentId?: string;
  children: ASTNode[];
  metadata: {
    [key: string]: any;
    visibility?: 'public' | 'private' | 'protected' | 'internal';
    isStatic?: boolean;
    isAsync?: boolean;
    returnType?: string;
    parameters?: string[];
    typeAnnotations?: string[];
    decorators?: string[];
    documentation?: string;
  };
}

export interface ASTAnalysisResult {
  language: string;
  filePath: string;
  nodes: ASTNode[];
  symbols: ASTSymbolInfo[];
  dependencies: DependencyInfo[];
  statistics: {
    totalNodes: number;
    functions: number;
    classes: number;
    variables: number;
    imports: number;
    exports: number;
    linesOfCode: number;
    commentLines: number;
  };
}

export interface ASTSymbolInfo {
  id: string;
  name: string;
  kind: ASTNodeType;
  filePath: string;
  startLine: number;
  endLine: number;
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  isStatic?: boolean;
  isExported?: boolean;
  signature?: string;
  documentation?: string;
}

export interface DependencyInfo {
  from: string;
  to: string;
  type: 'import' | 'inheritance' | 'composition' | 'functionCall' | 'variableReference';
  location: {
    startLine: number;
    endLine: number;
  };
}

export interface IASTAnalyzer {
  language: string;
  supportedExtensions: string[];
  analyze(code: string, filePath: string): Promise<ASTAnalysisResult>;
  canAnalyze(filePath: string): boolean;
  getCodeStructure(nodes: ASTNode[]): string;
  findNodeAtPosition(nodes: ASTNode[], line: number, column: number): ASTNode | null;
  getParentChain(nodes: ASTNode[], nodeId: string): ASTNode[];
}

export interface IASTAnalyzerRegistry {
  register(analyzer: IASTAnalyzer): void;
  unregister(language: string): void;
  getAnalyzer(language: string): IASTAnalyzer | null;
  getAnalyzerForFile(filePath: string): IASTAnalyzer | null;
  getSupportedLanguages(): string[];
}

export class ASTAnalyzerRegistry implements IASTAnalyzerRegistry {
  private analyzers: Map<string, IASTAnalyzer> = new Map();

  register(analyzer: IASTAnalyzer): void {
    this.analyzers.set(analyzer.language, analyzer);
  }

  unregister(language: string): void {
    this.analyzers.delete(language);
  }

  getAnalyzer(language: string): IASTAnalyzer | null {
    return this.analyzers.get(language) || null;
  }

  getAnalyzerForFile(filePath: string): IASTAnalyzer | null {
    for (const analyzer of this.analyzers.values()) {
      if (analyzer.canAnalyze(filePath)) {
        return analyzer;
      }
    }
    return null;
  }

  getSupportedLanguages(): string[] {
    return Array.from(this.analyzers.keys());
  }
}

export const globalASTRegistry = new ASTAnalyzerRegistry();
