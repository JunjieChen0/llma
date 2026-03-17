import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  SymbolInfo,
  SymbolKind,
  ImportRelation,
  CallRelation,
  FileNode,
  IndexConfig,
  DEFAULT_INDEX_CONFIG,
  LANGUAGE_MAP,
  SYMBOL_PATTERNS
} from './types';

export class SymbolIndex {
  private symbols: Map<string, SymbolInfo> = new Map();
  private fileSymbols: Map<string, Set<string>> = new Map();
  private nameIndex: Map<string, Set<string>> = new Map();
  private config: IndexConfig;
  private rootPath: string;
  private isIndexing: boolean = false;
  private indexVersion: number = 0;

  constructor(rootPath: string, config: Partial<IndexConfig> = {}) {
    this.rootPath = rootPath;
    this.config = { ...DEFAULT_INDEX_CONFIG, ...config };
  }

  async indexWorkspace(progress?: vscode.Progress<{ message: string }>): Promise<number> {
    if (this.isIndexing) {
      return 0;
    }

    this.isIndexing = true;
    this.symbols.clear();
    this.fileSymbols.clear();
    this.nameIndex.clear();
    this.indexVersion++;

    try {
      const files = await this.discoverFiles();
      let processed = 0;

      for (const filePath of files) {
        if (progress) {
          progress.report({ message: `Indexing ${path.basename(filePath)} (${processed}/${files.length})` });
        }
        await this.indexFile(filePath);
        processed++;
      }

      return this.symbols.size;
    } finally {
      this.isIndexing = false;
    }
  }

  async indexFile(filePath: string): Promise<SymbolInfo[]> {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > this.config.maxFileSize) {
        return [];
      }

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const language = this.detectLanguage(filePath);
      
      if (!language) {
        return [];
      }

      const existingSymbols = this.fileSymbols.get(filePath);
      if (existingSymbols) {
        for (const symbolId of existingSymbols) {
          this.symbols.delete(symbolId);
        }
      }
      this.fileSymbols.set(filePath, new Set());

      const symbols = this.extractSymbols(content, filePath, language);
      
      for (const symbol of symbols) {
        const id = this.generateSymbolId(symbol);
        this.symbols.set(id, symbol);
        this.fileSymbols.get(filePath)!.add(id);
        
        if (!this.nameIndex.has(symbol.name)) {
          this.nameIndex.set(symbol.name, new Set());
        }
        this.nameIndex.get(symbol.name)!.add(id);
      }

      return symbols;
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
      return [];
    }
  }

  private extractSymbols(content: string, filePath: string, language: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');
    const patterns = SYMBOL_PATTERNS[language];

    if (!patterns) {
      return symbols;
    }

    for (const [kind, regexList] of patterns) {
      for (const regex of regexList) {
        regex.lastIndex = 0;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
          const name = match[1];
          if (!name || name.length < 2 || /^\d/.test(name)) {
            continue;
          }

          const position = this.getLineColumn(content, match.index);
          const endPosition = this.findSymbolEnd(content, match.index, kind);
          
          const symbol: SymbolInfo = {
            name,
            kind: kind as SymbolKind,
            filePath,
            line: position.line,
            column: position.column,
            endLine: endPosition.line,
            endColumn: endPosition.column,
            isExported: this.checkExported(content, match.index),
            isAsync: this.checkAsync(content, match.index),
            visibility: this.detectVisibility(content, match.index),
            signature: this.extractSignature(lines, position.line - 1)
          };

          symbols.push(symbol);
        }
      }
    }

    return this.deduplicateSymbols(symbols);
  }

  private getLineColumn(content: string, index: number): { line: number; column: number } {
    const before = content.substring(0, index);
    const lines = before.split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1
    };
  }

  private findSymbolEnd(content: string, startIndex: number, kind: SymbolKind): { line: number; column: number } {
    const afterContent = content.substring(startIndex);
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    let endIndex = 0;
    let foundOpenBrace = false;

    for (let i = 0; i < afterContent.length; i++) {
      const char = afterContent[i];
      const prevChar = i > 0 ? afterContent[i - 1] : '';

      if (inString) {
        if (char === stringChar && prevChar !== '\\') {
          inString = false;
        }
        continue;
      }

      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{') {
        braceCount++;
        foundOpenBrace = true;
      } else if (char === '}') {
        braceCount--;
        if (foundOpenBrace && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    if (endIndex === 0) {
      const lines = afterContent.split('\n');
      if (kind === 'function' || kind === 'method') {
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          if (lines[i].trim() === '' && i > 0) {
            endIndex = lines.slice(0, i).join('\n').length;
            break;
          }
        }
      }
      if (endIndex === 0) {
        endIndex = Math.min(afterContent.length, 500);
      }
    }

    return this.getLineColumn(content, startIndex + endIndex);
  }

  private checkExported(content: string, index: number): boolean {
    const before = content.substring(Math.max(0, index - 20), index);
    return /export\s/.test(before);
  }

  private checkAsync(content: string, index: number): boolean {
    const before = content.substring(Math.max(0, index - 20), index);
    return /async\s/.test(before);
  }

  private detectVisibility(content: string, index: number): 'public' | 'private' | 'protected' | 'internal' {
    const before = content.substring(Math.max(0, index - 30), index);
    if (/private\s/.test(before)) return 'private';
    if (/protected\s/.test(before)) return 'protected';
    if (/internal\s/.test(before)) return 'internal';
    return 'public';
  }

  private extractSignature(lines: string[], lineIndex: number): string | undefined {
    if (lineIndex < 0 || lineIndex >= lines.length) return undefined;
    
    const line = lines[lineIndex].trim();
    if (line.length > 100) {
      return line.substring(0, 100) + '...';
    }
    return line;
  }

  private deduplicateSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
    const seen = new Map<string, SymbolInfo>();
    
    for (const symbol of symbols) {
      const key = `${symbol.filePath}:${symbol.name}:${symbol.kind}`;
      if (!seen.has(key)) {
        seen.set(key, symbol);
      }
    }
    
    return Array.from(seen.values());
  }

  private detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    
    for (const [lang, extensions] of Object.entries(LANGUAGE_MAP)) {
      if (extensions.includes(ext)) {
        return lang;
      }
    }
    
    return null;
  }

  private generateSymbolId(symbol: SymbolInfo): string {
    return `${symbol.filePath}:${symbol.name}:${symbol.kind}:${symbol.line}`;
  }

  private async discoverFiles(): Promise<string[]> {
    const files: string[] = [];
    
    const scanDir = async (dirPath: string) => {
      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            if (!this.shouldExclude(fullPath)) {
              await scanDir(fullPath);
            }
          } else if (entry.isFile()) {
            if (this.shouldInclude(fullPath)) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await scanDir(this.rootPath);
    return files;
  }

  private shouldExclude(fullPath: string): boolean {
    const relative = path.relative(this.rootPath, fullPath);
    for (const pattern of this.config.excludePatterns) {
      if (pattern.endsWith('/**')) {
        const dir = pattern.slice(0, -3);
        if (relative.startsWith(dir)) return true;
      } else if (relative.includes(pattern.replace('**/', ''))) {
        return true;
      }
    }
    return false;
  }

  private shouldInclude(fullPath: string): boolean {
    const ext = path.extname(fullPath).toLowerCase();
    for (const pattern of this.config.includePatterns) {
      if (pattern.startsWith('**/*')) {
        // 正确提取扩展名：**/*.ts -> .ts
        const patternExt = pattern.slice(3); // 获取 .ts 部分
        if (!patternExt.startsWith('.')) {
          continue; // 不是有效的扩展名模式
        }
        if (ext === patternExt) return true;
      }
    }
    return false;
  }

  getSymbol(name: string): SymbolInfo | undefined {
    const ids = this.nameIndex.get(name);
    if (!ids || ids.size === 0) return undefined;
    
    const id = ids.values().next().value as string | undefined;
    if (!id) return undefined;
    return this.symbols.get(id);
  }

  getSymbolsByName(name: string): SymbolInfo[] {
    const ids = this.nameIndex.get(name);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.symbols.get(id))
      .filter((s): s is SymbolInfo => s !== undefined);
  }

  getSymbolsInFile(filePath: string): SymbolInfo[] {
    const ids = this.fileSymbols.get(filePath);
    if (!ids) return [];
    
    return Array.from(ids)
      .map(id => this.symbols.get(id))
      .filter((s): s is SymbolInfo => s !== undefined);
  }

  getSymbolsByKind(kind: SymbolKind): SymbolInfo[] {
    return Array.from(this.symbols.values()).filter(s => s.kind === kind);
  }

  searchSymbols(query: string, limit: number = 20): SymbolInfo[] {
    const lowerQuery = query.toLowerCase();
    const results: Array<{ symbol: SymbolInfo; score: number }> = [];

    for (const symbol of this.symbols.values()) {
      const lowerName = symbol.name.toLowerCase();
      let score = 0;

      if (lowerName === lowerQuery) {
        score = 100;
      } else if (lowerName.startsWith(lowerQuery)) {
        score = 80;
      } else if (lowerName.includes(lowerQuery)) {
        score = 60;
      } else if (this.fuzzyMatch(lowerName, lowerQuery)) {
        score = 40;
      }

      if (score > 0) {
        results.push({ symbol, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.symbol);
  }

  private fuzzyMatch(text: string, query: string): boolean {
    let textIdx = 0;
    let queryIdx = 0;

    while (textIdx < text.length && queryIdx < query.length) {
      if (text[textIdx] === query[queryIdx]) {
        queryIdx++;
      }
      textIdx++;
    }

    return queryIdx === query.length;
  }

  removeFile(filePath: string): void {
    const ids = this.fileSymbols.get(filePath);
    if (ids) {
      for (const id of ids) {
        const symbol = this.symbols.get(id);
        if (symbol) {
          const nameIds = this.nameIndex.get(symbol.name);
          if (nameIds) {
            nameIds.delete(id);
            if (nameIds.size === 0) {
              this.nameIndex.delete(symbol.name);
            }
          }
        }
        this.symbols.delete(id);
      }
      this.fileSymbols.delete(filePath);
    }
  }

  getFileNode(filePath: string): FileNode | undefined {
    const symbols = this.getSymbolsInFile(filePath);
    if (symbols.length === 0) return undefined;

    try {
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      return {
        path: filePath,
        language: this.detectLanguage(filePath) || 'unknown',
        lineCount: content.split('\n').length,
        symbolCount: symbols.length,
        importCount: 0,
        lastModified: stat.mtimeMs,
        hash: this.computeHash(content)
      };
    } catch {
      return undefined;
    }
  }

  private computeHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  getStats(): { totalSymbols: number; totalFiles: number; byKind: Record<string, number> } {
    const byKind: Record<string, number> = {};
    
    for (const symbol of this.symbols.values()) {
      byKind[symbol.kind] = (byKind[symbol.kind] || 0) + 1;
    }

    return {
      totalSymbols: this.symbols.size,
      totalFiles: this.fileSymbols.size,
      byKind
    };
  }

  getIndexVersion(): number {
    return this.indexVersion;
  }

  isCurrentlyIndexing(): boolean {
    return this.isIndexing;
  }

  clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
    this.nameIndex.clear();
    this.indexVersion++;
  }
}
