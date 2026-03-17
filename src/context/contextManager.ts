/**
 * 上下文管理器模块
 * 
 * 提供工作区级别的上下文管理功能，包括：
 * - 符号索引：工作区范围的符号提取和搜索
 * - 代码图：代码关系分析和依赖图构建
 * - 文件监听：自动检测文件变化并更新索引
 * - 上下文查询：根据查询条件获取相关上下文
 * - AST 缓存：缓存 AST 分析结果以提高性能
 * - 增量更新：支持增量更新索引，避免全量重建
 * 
 * 主要功能：
 * - 管理工作区的代码结构和符号信息
 * - 提供代码导航和上下文理解
 * - 支持多种编程语言的 AST 分析
 * - 提供智能的代码搜索和查询
 * - 自动维护索引的时效性
 * 
 * @module context/contextManager
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SymbolIndex } from './symbolIndex';
import { CodeGraphBuilder } from './codeGraph';
import {
  SymbolInfo,
  ContextQuery,
  ContextResult,
  IndexConfig,
  ProjectContext,
  SymbolKind,
  DEFAULT_INDEX_CONFIG
} from './types';
import {
  initializeASTAnalyzers,
  globalASTRegistry,
  ASTAnalysisResult
} from '../ast';
import { LanguageServiceManager } from '../languageService';

/**
 * Agent 上下文管理器类
 * 
 * 管理工作区的代码上下文，提供符号索引和代码图功能。
 * 使用单例模式确保全局只有一个实例。
 * 
 * @class AgentContextManager
 */
export class AgentContextManager {
  /**
   * 单例实例
   */
  private static instance: AgentContextManager | null = null;
  
  /**
   * 符号索引实例
   * 负责工作区符号的提取和搜索
   */
  private symbolIndex: SymbolIndex;
  
  /**
   * 代码图构建器实例
   * 负责构建代码关系图
   */
  private graphBuilder: CodeGraphBuilder;
  
  /**
   * 工作区根路径
   */
  private rootPath: string;
  
  /**
   * 索引配置
   */
  private config: IndexConfig;
  
  /**
   * 是否已初始化
   */
  private isInitialized: boolean = false;
  
  /**
   * 文件监听器
   * 监听文件变化以更新索引
   */
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  
  /**
   * 待处理的文件变化
   * 存储需要更新的文件及其变化类型
   */
  private pendingChanges: Map<string, 'change' | 'delete'> = new Map();
  
  /**
   * 防抖定时器
   * 防止频繁更新索引
   */
  private debounceTimer: NodeJS.Timeout | null = null;
  
  /**
   * 上次索引时间
   */
  private lastIndexTime: number = 0;
  
  /**
   * 索引 Promise
   * 用于避免并发索引
   */
  private indexPromise: Promise<void> | null = null;
  
  /**
   * AST 缓存
   * 缓存文件的 AST 分析结果
   */
  private astCache: Map<string, ASTAnalysisResult> = new Map();
  
  /**
   * 语言服务管理器
   * 用于增强 AST 分析
   */
  private languageServiceManager: LanguageServiceManager;

  /**
   * 私有构造函数
   * 
   * @param rootPath - 工作区根路径
   * @param config - 索引配置
   */
  private constructor(rootPath: string, config: Partial<IndexConfig> = {}) {
    this.rootPath = rootPath;
    this.config = { ...DEFAULT_INDEX_CONFIG, ...config };
    this.symbolIndex = new SymbolIndex(rootPath, this.config);
    this.graphBuilder = new CodeGraphBuilder(rootPath);
    this.languageServiceManager = LanguageServiceManager.getInstance();
  }

  /**
   * 获取单例实例
   * 
   * @param rootPath - 工作区根路径（首次创建时需要）
   * @param config - 索引配置
   * @returns 上下文管理器单例
   */
  static getInstance(rootPath?: string, config?: Partial<IndexConfig>): AgentContextManager {
    const workspaceRoot = rootPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    if (!AgentContextManager.instance && workspaceRoot) {
      AgentContextManager.instance = new AgentContextManager(workspaceRoot, config);
    }
    
    return AgentContextManager.instance!;
  }

  static resetInstance(): void {
    if (AgentContextManager.instance) {
      AgentContextManager.instance.dispose();
      AgentContextManager.instance = null;
    }
  }

  async initialize(progress?: vscode.Progress<{ message: string }>): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.indexPromise) {
      return this.indexPromise;
    }

    this.indexPromise = this.doInitialize(progress);
    
    try {
      await this.indexPromise;
    } finally {
      this.indexPromise = null;
    }
  }

  private async doInitialize(progress?: vscode.Progress<{ message: string }>): Promise<void> {
    progress?.report({ message: 'Scanning workspace files...' });
    
    const symbolCount = await this.symbolIndex.indexWorkspace(progress);
    progress?.report({ message: `Indexed ${symbolCount} symbols, building code graph...` });
    
    const symbols = this.symbolIndex['symbols'];
    this.graphBuilder.buildFromSymbols(symbols);
    
    if (this.config.watchForChanges) {
      this.setupFileWatcher();
    }
    
    this.lastIndexTime = Date.now();
    this.isInitialized = true;
    
    progress?.report({ message: 'Context manager initialized successfully' });
  }

  private setupFileWatcher(): void {
    const patterns = this.config.includePatterns
      .map(p => p.replace('**/', ''))
      .join(',');
    
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.rootPath, `**/*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,h}`)
    );

    this.fileWatcher.onDidChange(uri => {
      this.scheduleUpdate(uri.fsPath, 'change');
    });

    this.fileWatcher.onDidCreate(uri => {
      this.scheduleUpdate(uri.fsPath, 'change');
    });

    this.fileWatcher.onDidDelete(uri => {
      this.scheduleUpdate(uri.fsPath, 'delete');
    });
  }

  private scheduleUpdate(filePath: string, type: 'change' | 'delete'): void {
    this.pendingChanges.set(filePath, type);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.config.debounceMs);
  }

  private async processPendingChanges(): Promise<void> {
    const changes = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    for (const [filePath, type] of changes) {
      if (type === 'delete') {
        this.symbolIndex.removeFile(filePath);
      } else {
        await this.symbolIndex.indexFile(filePath);
        await this.graphBuilder.buildFromFile(filePath);
      }
    }

    this.lastIndexTime = Date.now();
  }

  async query(query: ContextQuery): Promise<ContextResult> {
    await this.ensureInitialized();

    const symbols: SymbolInfo[] = [];
    const relatedFiles = new Set<string>();
    const callChain: string[] = [];
    const dependencies: string[] = [];
    const dependents: string[] = [];

    if (query.symbolName) {
      const found = query.symbolKind
        ? this.symbolIndex.getSymbolsByName(query.symbolName).filter(s => s.kind === query.symbolKind)
        : this.symbolIndex.getSymbolsByName(query.symbolName);
      
      symbols.push(...found);

      for (const symbol of found) {
        relatedFiles.add(symbol.filePath);

        const callers = this.graphBuilder.getCallers(symbol.name);
        for (const caller of callers) {
          callChain.push(`${caller.caller} -> ${caller.callee} (${path.basename(caller.callerFile)})`);
        }

        const deps = this.graphBuilder.getDependencies(symbol.filePath);
        dependencies.push(...deps);

        const depsOn = this.graphBuilder.getDependents(symbol.filePath);
        dependents.push(...depsOn);
      }
    }

    if (query.filePath) {
      const fileSymbols = this.symbolIndex.getSymbolsInFile(query.filePath);
      symbols.push(...fileSymbols);
      relatedFiles.add(query.filePath);

      const related = this.graphBuilder.getRelatedFiles(query.filePath, query.maxDepth || 1);
      related.forEach(f => relatedFiles.add(f));
    }

    const uniqueSymbols = this.deduplicateSymbols(symbols, query.maxResults || 50);
    const summary = this.generateSummary(uniqueSymbols, relatedFiles, callChain);

    return {
      symbols: uniqueSymbols,
      relatedFiles: Array.from(relatedFiles),
      callChain: callChain.length > 0 ? callChain : undefined,
      dependencies: dependencies.length > 0 ? [...new Set(dependencies)] : undefined,
      dependents: dependents.length > 0 ? [...new Set(dependents)] : undefined,
      summary
    };
  }

  async getRelevantContext(
    activeFilePath: string,
    userQuery: string,
    maxTokens: number = 8000
  ): Promise<string> {
    await this.ensureInitialized();

    const context: string[] = [];
    let currentTokens = 0;

    context.push('=== Code Context ===\n');

    const activeSymbols = this.symbolIndex.getSymbolsInFile(activeFilePath);
    if (activeSymbols.length > 0) {
      const symbolSummary = this.formatSymbolsForContext(activeSymbols.slice(0, 20));
      context.push(`\n[Active File Symbols]\n${symbolSummary}`);
      currentTokens += this.estimateTokens(symbolSummary);
    }

    const keywords = this.extractKeywords(userQuery);
    const relevantSymbols = this.findRelevantSymbols(keywords, activeFilePath);
    
    if (relevantSymbols.length > 0) {
      const relevantSummary = this.formatSymbolsForContext(relevantSymbols.slice(0, 10));
      context.push(`\n[Relevant Symbols]\n${relevantSummary}`);
      currentTokens += this.estimateTokens(relevantSummary);
    }

    const relatedFiles = this.graphBuilder.getRelatedFiles(activeFilePath, 2);
    for (const filePath of relatedFiles.slice(0, 5)) {
      if (currentTokens >= maxTokens * 0.7) break;

      const symbols = this.symbolIndex.getSymbolsInFile(filePath);
      if (symbols.length > 0) {
        const fileSummary = `\n[${path.relative(this.rootPath, filePath)}]\n${this.formatSymbolsForContext(symbols.slice(0, 10))}`;
        context.push(fileSummary);
        currentTokens += this.estimateTokens(fileSummary);
      }
    }

    const callChain = this.getCallChainForFile(activeFilePath);
    if (callChain.length > 0) {
      context.push(`\n[Call Chain]\n${callChain.slice(0, 10).join('\n')}`);
    }

    return context.join('\n');
  }

  async getSymbolDefinition(symbolName: string, filePath?: string): Promise<string | null> {
    await this.ensureInitialized();

    const symbols = this.symbolIndex.getSymbolsByName(symbolName);
    const symbol = filePath
      ? symbols.find(s => s.filePath === filePath)
      : symbols[0];

    if (!symbol) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(symbol.filePath, 'utf-8');
      const lines = content.split('\n');
      
      const startLine = Math.max(0, symbol.line - 1);
      const endLine = symbol.endLine ? Math.min(lines.length, symbol.endLine) : startLine + 30;
      
      const definition = lines.slice(startLine, endLine).join('\n');
      return `// ${symbol.filePath}:${symbol.line}\n${definition}`;
    } catch {
      return null;
    }
  }

  searchSymbols(query: string, limit: number = 20): SymbolInfo[] {
    return this.symbolIndex.searchSymbols(query, limit);
  }

  getSymbolsByKind(kind: SymbolKind): SymbolInfo[] {
    return this.symbolIndex.getSymbolsByKind(kind);
  }

  getProjectContext(): ProjectContext | null {
    if (!this.isInitialized) {
      return null;
    }

    const stats = this.symbolIndex.getStats();
    const packageJsonPath = path.join(this.rootPath, 'package.json');
    let dependencies = new Map<string, string>();
    let framework: string | undefined;

    try {
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf-8');
        const pkg = JSON.parse(content);
        
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, version] of Object.entries(allDeps)) {
          dependencies.set(name, version as string);
        }

        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          framework = 'react';
        } else if (pkg.dependencies?.vue || pkg.devDependencies?.vue) {
          framework = 'vue';
        } else if (pkg.dependencies?.next || pkg.devDependencies?.next) {
          framework = 'next';
        }
      }
    } catch {
      // Ignore errors reading package.json
    }

    return {
      rootPath: this.rootPath,
      language: this.detectPrimaryLanguage(),
      framework,
      entryPoints: this.findEntryPoints(),
      configFiles: this.findConfigFiles(),
      dependencies,
      graph: this.graphBuilder.getGraph()
    };
  }

  private detectPrimaryLanguage(): string {
    const stats = this.symbolIndex.getStats();
    const extensions: Record<string, number> = {};

    for (const symbol of this.symbolIndex['symbols'].values()) {
      const ext = path.extname(symbol.filePath);
      extensions[ext] = (extensions[ext] || 0) + 1;
    }

    const sorted = Object.entries(extensions).sort((a, b) => b[1] - a[1]);
    
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.kt': 'kotlin',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cc': 'cpp',
      '.cxx': 'cpp',
      '.h': 'cpp',
      '.hpp': 'cpp',
      '.hh': 'cpp',
      '.hxx': 'cpp',
      '.cs': 'csharp',
      '.gradle': 'gradle'
    };

    return langMap[sorted[0]?.[0] || '.ts'] || 'typescript';
  }

  private findEntryPoints(): string[] {
    const entries: string[] = [];
    
    // TypeScript/JavaScript
    const tsJsPatterns = [
      'index.ts', 'index.js', 'main.ts', 'main.js',
      'app.ts', 'app.js', 'server.ts', 'server.js',
      'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js'
    ];
    
    // Python
    const pythonPatterns = [
      '__init__.py', 'main.py', 'app.py', 'manage.py',
      'src/main.py', 'app/main.py'
    ];
    
    // Java
    const javaPatterns = [
      'Main.java', 'main.java', 'Application.java',
      'src/main/java/*/Main.java',
      'src/main/java/*/Application.java',
      'src/main/java/*/*/Main.java',
      'src/main/java/*/*/Application.java'
    ];
    
    // C/C++
    const cppPatterns = [
      'main.cpp', 'main.c', 'main.cc', 'main.cxx',
      'src/main.cpp', 'src/main.c',
      'source/main.cpp', 'source/main.c'
    ];
    
    // C#
    const csharpPatterns = [
      'Program.cs', 'Startup.cs',
      'src/Program.cs', 'src/Startup.cs'
    ];
    
    // Go
    const goPatterns = [
      'main.go', 'cmd/main.go', 'src/main.go'
    ];
    
    // Rust
    const rustPatterns = [
      'src/main.rs', 'src/lib.rs'
    ];

    // Kotlin
    const kotlinPatterns = [
      'Main.kt', 'main.kt', 'Application.kt',
      'src/main/kotlin/*/Main.kt',
      'src/main/kotlin/*/Application.kt'
    ];

    const allPatterns = [
      ...tsJsPatterns,
      ...pythonPatterns,
      ...javaPatterns,
      ...cppPatterns,
      ...csharpPatterns,
      ...goPatterns,
      ...rustPatterns,
      ...kotlinPatterns
    ];

    for (const pattern of allPatterns) {
      // 简单 glob 匹配
      if (pattern.includes('*')) {
        // 对于包含 * 的模式，进行简单匹配
        const basePattern = pattern.replace(/\*/g, '');
        const dir = path.dirname(pattern);
        try {
          const searchDir = path.join(this.rootPath, dir);
          if (fs.existsSync(searchDir)) {
            const files = fs.readdirSync(searchDir);
            for (const file of files) {
              if (file.startsWith(basePattern.replace('src/main/java/', '').replace('src/main/kotlin/', ''))) {
                const fullPath = path.join(searchDir, file);
                entries.push(path.relative(this.rootPath, fullPath));
              }
            }
          }
        } catch {
          // Ignore errors
        }
      } else {
        const fullPath = path.join(this.rootPath, pattern);
        if (fs.existsSync(fullPath)) {
          entries.push(path.relative(this.rootPath, fullPath));
        }
      }
    }

    return entries;
  }

  private findConfigFiles(): string[] {
    const configs: string[] = [];
    
    // TypeScript/JavaScript
    const tsConfigs = [
      'package.json', 'tsconfig.json', 'jsconfig.json',
      'webpack.config.js', 'vite.config.js', 'rollup.config.js',
      '.eslintrc.js', '.prettierrc'
    ];
    
    // Python
    const pythonConfigs = [
      'pyproject.toml', 'setup.py', 'setup.cfg',
      'requirements.txt', 'Pipfile', 'poetry.lock',
      'manage.py', 'pytest.ini', 'tox.ini'
    ];
    
    // Java
    const javaConfigs = [
      'pom.xml', 'build.gradle', 'build.gradle.kts',
      'settings.gradle', 'settings.gradle.kts',
      'gradle.properties', 'mvnw', 'gradlew'
    ];
    
    // C/C++
    const cppConfigs = [
      'CMakeLists.txt', 'Makefile', 'makefile',
      'configure', 'configure.ac', 'CMakePresets.json',
      'vcpkg.json', 'conanfile.txt', 'conanfile.py'
    ];
    
    // C#
    const csharpConfigs = [
      '*.csproj', '*.sln', 'global.json', 'Directory.Build.props'
    ];
    
    // Go
    const goConfigs = [
      'go.mod', 'go.sum', 'Gopkg.toml', 'Gopkg.lock'
    ];
    
    // Rust
    const rustConfigs = [
      'Cargo.toml', 'Cargo.lock', 'rust-toolchain.toml'
    ];
    
    // Kotlin
    const kotlinConfigs = [
      'build.gradle.kts', 'settings.gradle.kts', 'gradle.properties'
    ];

    const allConfigs = [
      ...tsConfigs,
      ...pythonConfigs,
      ...javaConfigs,
      ...cppConfigs,
      ...csharpConfigs,
      ...goConfigs,
      ...rustConfigs,
      ...kotlinConfigs
    ];

    for (const pattern of allConfigs) {
      if (pattern.includes('*')) {
        // 通配符模式
        try {
          const dir = this.rootPath;
          const files = fs.readdirSync(dir);
          const ext = pattern.substring(1); // *.csproj -> .csproj
          for (const file of files) {
            if (file.endsWith(ext)) {
              configs.push(file);
            }
          }
        } catch {
          // Ignore errors
        }
      } else {
        const fullPath = path.join(this.rootPath, pattern);
        if (fs.existsSync(fullPath)) {
          configs.push(pattern);
        }
      }
    }

    return configs;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private deduplicateSymbols(symbols: SymbolInfo[], maxResults: number): SymbolInfo[] {
    const seen = new Set<string>();
    const result: SymbolInfo[] = [];

    for (const symbol of symbols) {
      const key = `${symbol.filePath}:${symbol.name}:${symbol.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(symbol);
        if (result.length >= maxResults) break;
      }
    }

    return result;
  }

  private generateSummary(
    symbols: SymbolInfo[],
    relatedFiles: Set<string>,
    callChain: string[]
  ): string {
    const parts: string[] = [];

    if (symbols.length > 0) {
      const byKind: Record<string, number> = {};
      for (const s of symbols) {
        byKind[s.kind] = (byKind[s.kind] || 0) + 1;
      }
      parts.push(`${symbols.length} symbols (${Object.entries(byKind).map(([k, v]) => `${v} ${k}s`).join(', ')})`);
    }

    if (relatedFiles.size > 0) {
      parts.push(`${relatedFiles.size} related files`);
    }

    if (callChain.length > 0) {
      parts.push(`${callChain.length} call relations`);
    }

    return parts.join(', ') || 'No context found';
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
      'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
      'against', 'between', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
      'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
      'create', 'add', 'update', 'delete', 'remove', 'get', 'set', 'make',
      'help', 'please', 'want', 'need', 'show', 'list', 'find', 'search'
    ]);

    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10);
  }

  private findRelevantSymbols(keywords: string[], activeFilePath: string): SymbolInfo[] {
    const results: Array<{ symbol: SymbolInfo; score: number }> = [];

    for (const symbol of this.symbolIndex['symbols'].values()) {
      let score = 0;
      const lowerName = symbol.name.toLowerCase();

      for (const keyword of keywords) {
        if (lowerName === keyword) {
          score += 100;
        } else if (lowerName.includes(keyword)) {
          score += 50;
        } else if (symbol.signature?.toLowerCase().includes(keyword)) {
          score += 30;
        }
      }

      if (symbol.filePath === activeFilePath) {
        score += 20;
      }

      if (score > 0) {
        results.push({ symbol, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(r => r.symbol);
  }

  private formatSymbolsForContext(symbols: SymbolInfo[]): string {
    return symbols
      .map(s => {
        const visibility = s.visibility !== 'public' ? `${s.visibility} ` : '';
        const async = s.isAsync ? 'async ' : '';
        const exported = s.isExported ? 'exported ' : '';
        return `  ${exported}${visibility}${async}${s.kind} ${s.name}${s.signature ? `: ${s.signature}` : ''} (${path.basename(s.filePath)}:${s.line})`;
      })
      .join('\n');
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private getCallChainForFile(filePath: string): string[] {
    const chains: string[] = [];
    const symbols = this.symbolIndex.getSymbolsInFile(filePath);

    for (const symbol of symbols) {
      if (symbol.kind === 'function' || symbol.kind === 'method') {
        const callees = this.graphBuilder.getCallees(symbol.name);
        for (const call of callees.slice(0, 3)) {
          chains.push(`${symbol.name} -> ${call.callee}`);
        }
      }
    }

    return chains;
  }

  getStats(): { symbols: number; files: number; lastIndexed: Date } {
    const stats = this.symbolIndex.getStats();
    return {
      symbols: stats.totalSymbols,
      files: stats.totalFiles,
      lastIndexed: new Date(this.lastIndexTime)
    };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async analyzeFileAST(filePath: string, forceRefresh = false): Promise<ASTAnalysisResult | null> {
    if (!forceRefresh && this.astCache.has(filePath)) {
      return this.astCache.get(filePath)!;
    }

    try {
      const code = await fs.promises.readFile(filePath, 'utf-8');
      const analyzer = globalASTRegistry.getAnalyzerForFile(filePath);
      let result: ASTAnalysisResult | null = null;

      if (analyzer) {
        result = await analyzer.analyze(code, filePath);
      }

      try {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        if (document && this.languageServiceManager) {
          result = await this.languageServiceManager.enhanceASTWithLanguageService(document, result!);
        }
      } catch (lsError) {
        console.warn(`Language service enhancement failed for ${filePath}:`, lsError);
      }

      if (result) {
        this.astCache.set(filePath, result);
      }
      return result;
    } catch (error) {
      console.warn(`Failed to analyze AST for ${filePath}:`, error);
      return null;
    }
  }

  getCachedAST(filePath: string): ASTAnalysisResult | null {
    return this.astCache.get(filePath) || null;
  }

  clearASTCache(filePath?: string): void {
    if (filePath) {
      this.astCache.delete(filePath);
    } else {
      this.astCache.clear();
    }
  }

  async getEnhancedContextWithAST(
    activeFilePath: string,
    userQuery: string,
    maxTokens: number = 8000
  ): Promise<string> {
    const baseContext = await this.getRelevantContext(activeFilePath, userQuery, maxTokens / 2);
    const astResult = await this.analyzeFileAST(activeFilePath);
    
    if (!astResult) {
      return baseContext;
    }

    const astContext = this.formatASTForContext(astResult, maxTokens / 2);
    
    return baseContext + '\n\n' + astContext;
  }

  private formatASTForContext(result: ASTAnalysisResult, maxTokens: number): string {
    const parts: string[] = [];
    
    parts.push('=== AST Analysis ===');
    parts.push(`Language: ${result.language}`);
    parts.push(`Stats: ${result.statistics.functions} functions, ${result.statistics.classes} classes, ${result.statistics.variables} variables`);
    
    if (result.statistics.imports > 0) {
      parts.push(`Imports: ${result.statistics.imports}`);
    }
    
    const structure = this.getCodeStructureForContext(result.nodes);
    if (structure) {
      parts.push('\nCode Structure:');
      parts.push(structure);
    }
    
    if (result.symbols.length > 0) {
      parts.push('\nSymbols:');
      const symbolList = result.symbols
        .slice(0, 30)
        .map(s => {
          const vis = s.visibility ? `${s.visibility} ` : '';
          const type = s.kind;
          return `  ${vis}${type} ${s.name}${s.signature ? `: ${s.signature}` : ''} (${s.startLine})`;
        })
        .join('\n');
      parts.push(symbolList);
    }
    
    const context = parts.join('\n');
    if (context.length > maxTokens * 4) {
      return context.substring(0, maxTokens * 4) + '\n... (truncated)';
    }
    return context;
  }

  private getCodeStructureForContext(nodes: any[]): string {
    const structure: string[] = [];
    this._buildStructureRecursive(nodes, structure, 0);
    return structure.slice(0, 50).join('\n');
  }

  private _buildStructureRecursive(nodes: any[], structure: string[], depth: number): void {
    const indent = '  '.repeat(depth);
    
    for (const node of nodes) {
      let line = `${indent}- [${node.type}] ${node.name}`;
      if (node.metadata?.signature) {
        line += `: ${node.metadata.signature}`;
      }
      if (node.metadata?.visibility) {
        line = `${indent}${node.metadata.visibility} - [${node.type}] ${node.name}`;
      }
      structure.push(line);
      
      if (node.children && node.children.length > 0 && depth < 3) {
        this._buildStructureRecursive(node.children, structure, depth + 1);
      }
    }
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.symbolIndex.clear();
    this.graphBuilder.clear();
    this.astCache.clear();
    this.isInitialized = false;
  }
}

export function createContextManager(rootPath?: string): AgentContextManager {
  return AgentContextManager.getInstance(rootPath);
}
