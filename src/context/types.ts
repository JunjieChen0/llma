import * as vscode from 'vscode';

export type SymbolKind = 
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'variable'
  | 'constant'
  | 'property'
  | 'enum'
  | 'type'
  | 'namespace'
  | 'module'
  | 'import'
  | 'struct';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;
  documentation?: string;
  type?: string;
  visibility?: 'public' | 'private' | 'protected' | 'internal';
  isExported?: boolean;
  isAsync?: boolean;
  isStatic?: boolean;
  parent?: string;
  children?: string[];
}

export interface CallRelation {
  caller: string;
  callee: string;
  callerFile: string;
  calleeFile?: string;
  line: number;
}

export interface ImportRelation {
  sourceFile: string;
  targetFile: string;
  importedSymbols: string[];
  importType: 'default' | 'named' | 'namespace' | 'dynamic';
  line: number;
}

export interface InheritanceRelation {
  child: string;
  parent: string;
  childFile: string;
  parentFile?: string;
  type: 'extends' | 'implements' | 'inherits'; // inherits 用于 C++/C# 等
}

export interface FileNode {
  path: string;
  language: string;
  lineCount: number;
  symbolCount: number;
  importCount: number;
  lastModified: number;
  hash?: string;
}

export interface CodeGraph {
  symbols: Map<string, SymbolInfo>;
  calls: CallRelation[];
  imports: ImportRelation[];
  inheritances: InheritanceRelation[];
  files: Map<string, FileNode>;
}

export interface ContextQuery {
  filePath?: string;
  symbolName?: string;
  symbolKind?: SymbolKind;
  maxDepth?: number;
  maxResults?: number;
  includeBody?: boolean;
  includeRelated?: boolean;
}

export interface ContextResult {
  symbols: SymbolInfo[];
  relatedFiles: string[];
  callChain?: string[];
  dependencies?: string[];
  dependents?: string[];
  summary: string;
}

export interface IndexConfig {
  enabled: boolean;
  maxFileSize: number;
  excludePatterns: string[];
  includePatterns: string[];
  watchForChanges: boolean;
  debounceMs: number;
}

export interface ProjectContext {
  rootPath: string;
  language: string;
  framework?: string;
  entryPoints: string[];
  configFiles: string[];
  dependencies: Map<string, string>;
  graph: CodeGraph;
}

export const DEFAULT_INDEX_CONFIG: IndexConfig = {
  enabled: true,
  maxFileSize: 1024 * 1024,
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    'dist/**',
    'build/**',
    '__pycache__/**',
    '*.min.js',
    '*.min.css',
    '.next/**',
    'coverage/**',
    'vendor/**'
  ],
  includePatterns: [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.py',
    '**/*.java',
    '**/*.go',
    '**/*.rs',
    '**/*.c',
    '**/*.cpp',
    '**/*.cc',
    '**/*.cxx',
    '**/*.h',
    '**/*.hpp',
    '**/*.hh',
    '**/*.hxx',
    '**/*.vue',
    '**/*.svelte',
    '**/*.gradle',
    '**/*.kt',
    '**/*.cs',
    '**/*.cj'  // 仓颉语言支持
  ],
  watchForChanges: true,
  debounceMs: 500
};

export const LANGUAGE_MAP: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx'],
  python: ['.py'],
  java: ['.java'],
  kotlin: ['.kt'],
  go: ['.go'],
  rust: ['.rs'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'],
  csharp: ['.cs'],
  gradle: ['.gradle'],
  vue: ['.vue'],
  svelte: ['.svelte'],
  cangjie: ['.cj']  // 仓颉语言支持
};

export const SYMBOL_PATTERNS: Record<string, Map<SymbolKind, RegExp[]>> = {
  typescript: new Map([
    ['class', [/(?:export\s+)?class\s+(\w+)/g]],
    ['interface', [/(?:export\s+)?interface\s+(\w+)/g]],
    ['function', [
      /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g
    ]],
    ['method', [/(?:(?:public|private|protected)\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/g]],
    ['variable', [/(?:export\s+)?(?:const|let|var)\s+(\w+)/g]],
    ['type', [/(?:export\s+)?type\s+(\w+)/g]],
    ['enum', [/(?:export\s+)?enum\s+(\w+)/g]],
    ['namespace', [/(?:export\s+)?namespace\s+(\w+)/g]]
  ]),
  python: new Map([
    ['class', [/class\s+(\w+)(?:\([^)]*\))?:/g]],
    ['function', [/def\s+(\w+)\s*\([^)]*\)/g]],
    ['variable', [/(\w+)\s*=\s*(?!.*def|.*class)/g]]
  ]),
  java: new Map([
    ['class', [
      /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+[\w.]+)?(?:\s+implements\s+[\w\s,.]+)?\s*{/g,
      /(?:public|private|protected)?\s*class\s+(\w+)/g
    ]],
    ['interface', [
      /(?:public|private|protected)?\s*(?:abstract\s+)?interface\s+(\w+)(?:\s+extends\s+[\w\s,.]+)?\s*{/g
    ]],
    ['method', [
      /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:[\w<>[\],\s]+)\s+(\w+)\s*\([^)]*\)(?:\s+throws\s+[\w\s,]+)?\s*{/g,
      /(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:void|int|boolean|char|byte|short|long|float|double)\s+(\w+)\s*\([^)]*\)(?:\s+throws\s+[\w\s,]+)?\s*{/g
    ]],
    ['enum', [/(?:public|private|protected)?\s*enum\s+(\w+)(?:\s+implements\s+[\w\s,.]+)?\s*{/g]],
    ['namespace', [/package\s+([\w.]+)\s*;/g]]
  ]),
  cpp: new Map([
    ['class', [
      /(?:public|private|protected)?\s*class\s+(\w+)(?:\s*:\s*(?:public|private|protected)?\s*[\w:,\s]+)?\s*{/g,
      /class\s+(\w+)/g
    ]],
    ['struct', [
      /(?:public|private|protected)?\s*struct\s+(\w+)(?:\s*:\s*(?:public|private|protected)?\s*[\w:,\s]+)?\s*{/g
    ]],
    ['function', [
      /(?:[\w:*&<>,\s]+)\s+(\w+)\s*\([^)]*\)\s*(?:const)?\s*(?:override)?\s*(?:final)?\s*(?:noexcept)?\s*[{;]/g,
      /(?:[\w:*&<>,\s]+)\s+(\w+)\s*\([^)]*\)\s*(?::\s*(?:[\w\s()=,]+))?\s*[{;]/g
    ]],
    ['namespace', [/namespace\s+(\w+)\s*{/g]],
    ['enum', [/enum\s+(?:class\s+)?(\w+)(?:\s*:\s*\w+)?\s*{/g]],
    ['variable', [/(?:static\s+)?(?:const\s+)?(?:[\w:*&<>,\s]+)\s+(\w+)\s*[;=]/g]]
  ]),
  go: new Map([
    ['function', [/func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/g]],
    ['interface', [/type\s+(\w+)\s+interface\s*{/g]],
    ['class', [/type\s+(\w+)\s+struct\s*{/g]]
  ]),
  kotlin: new Map([
    ['class', [
      /(?:public|private|protected|internal)?\s*(?:data\s+)?(?:open\s+)?(?:abstract\s+)?(?:final\s+)?(?:sealed\s+)?class\s+(\w+)(?:\([^)]*\))?(?:\s*:\s*[\w\s,.()]+)?\s*[{]/g
    ]],
    ['interface', [/(?:public|private|protected|internal)?\s*interface\s+(\w+)(?:\([^)]*\))?(?:\s*:\s*[\w\s,.()]+)?\s*[{]/g]],
    ['function', [
      /(?:public|private|protected|internal)?\s*(?:tailrec\s+)?(?:suspend\s+)?(?:inline\s+)?(?:operator\s+)?fun\s+(?:<[^>]+>\s+)?(?:[\w?*]+\.)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w?*]+)?\s*(?:\{)?/g
    ]],
    ['variable', [/(?:val|var)\s+(\w+)(?:\s*:\s*[\w?*]+)?\s*=/g]]
  ]),
  csharp: new Map([
    ['class', [
      /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?class\s+(\w+)(?:\s*:\s*[\w\s,.]+)?\s*{/g
    ]],
    ['interface', [
      /(?:public|private|protected|internal)?\s*interface\s+(\w+)(?:\s*:\s*[\w\s,.]+)?\s*{/g
    ]],
    ['method', [
      /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(?:abstract\s+)?(?:async\s+)?(?:[\w<>,\s]+)\s+(\w+)\s*\([^)]*\)\s*(?:where\s+\w+\s*:\s*[\w\s,]+)?\s*(?:{|;)/g
    ]],
    ['enum', [/(?:public|private|protected|internal)?\s*enum\s+(\w+)(?:\s*:\s*\w+)?\s*{/g]],
    ['namespace', [/namespace\s+(\w+(?:\.\w+)*)\s*{/g]]
  ]),
  // 仓颉语言符号模式（基于仓颉语法特性）
  cangjie: new Map([
    ['class', [
      /(?:public|private|protected)?\s*(?:open\s+|final\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s*:\s*[\w\s,.]+)?\s*{/g,
      /class\s+(\w+)/g
    ]],
    ['struct', [
      /(?:public|private|protected)?\s*struct\s+(\w+)(?:\s*:\s*[\w\s,.]+)?\s*{/g
    ]],
    ['interface', [
      /(?:public|private|protected)?\s*(?:open\s+)?interface\s+(\w+)(?:\s*:\s*[\w\s,.]+)?\s*{/g
    ]],
    ['enum', [
      /(?:public|private|protected)?\s*enum\s+(\w+)(?:\s*:\s*\w+)?\s*{/g,
      /enum\s+(\w+)/g
    ]],
    ['function', [
      /(?:public|private|protected)?\s*(?:static\s+)?(?:inline\s+)?(?:tailrec\s+)?func\s+(\w+)\s*\([^)]*\)(?:\s*:\s*[\w?*]+)?\s*(?:{|=)/g,
      /func\s+(\w+)\s*\(/g
    ]],
    ['method', [
      /(?:public|private|protected)?\s*(?:static\s+)?(?:override\s+)?func\s+(\w+)\s*\([^)]*\)(?:\s*:\s*[\w?*]+)?\s*{/g
    ]],
    ['variable', [
      /(?:val|var|let)\s+(\w+)(?:\s*:\s*[\w?*]+)?\s*=/g,
      /(?:public|private|protected)?\s*(?:static\s+)?(?:const\s+)?(?:val|var)\s+(\w+)/g
    ]],
    ['namespace', [
      /namespace\s+(\w+(?:\.\w+)*)\s*{/g,
      /module\s+(\w+(?:\.\w+)*)\s*{/g
    ]],
    ['type', [
      /typealias\s+(\w+)\s*=\s*[\w?*]+/g,
      /(?:open\s+)?type\s+(\w+)/g
    ]],
    ['property', [
      /(?:val|var)\s+(\w+)\s*:\s*[\w?*]+\s*(?:get|set)/g
    ]],
    ['import', [
      /import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*\{[^}]*\})?)/g,
      /use\s+([\w.]+)/g
    ]]
  ])
};
