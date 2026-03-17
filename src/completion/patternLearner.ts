import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface CodePattern {
  id: string;
  trigger: string;
  completion: string;
  frequency: number;
  language: string;
  context: string;
  filePatterns: string[];
  lastUsed: number;
  score: number;
}

export interface CompletionIntent {
  type: 'complete' | 'add' | 'modify' | 'import' | 'function' | 'class' | 'variable' | 'comment' | 'test' | 'error';
  confidence: number;
  suggestedCompletions: string[];
}

export interface CompletionContext {
  currentFile: string;
  language: string;
  prefix: string;
  suffix: string;
  cursorLine: number;
  cursorColumn: number;
  visibleSymbols: string[];
  imports: string[];
  recentEdits: EditSnapshot[];
}

export interface EditSnapshot {
  file: string;
  timestamp: number;
  editType: 'add' | 'modify' | 'delete';
  lineStart: number;
  lineEnd: number;
  content: string;
}

export interface LearnedPattern {
  trigger: string;
  completions: Map<string, number>;
  contexts: string[];
}

export class CodePatternLearner {
  private patterns: Map<string, CodePattern> = new Map();
  private editHistory: EditSnapshot[] = [];
  private importPatterns: Map<string, Set<string>> = new Map();
  private frequentPatterns: LearnedPattern[] = [];
  private rootPath: string;
  private maxHistorySize: number = 100;
  private maxPatternsSize: number = 500;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.loadFromStorage();
  }

  learnFromEdit(filePath: string, newContent: string, oldContent: string | null): void {
    const ext = path.extname(filePath).toLowerCase();
    const language = this.detectLanguage(ext);
    
    const editSnapshot: EditSnapshot = {
      file: filePath,
      timestamp: Date.now(),
      editType: oldContent === null ? 'add' : (newContent.length > oldContent.length ? 'add' : 'modify'),
      lineStart: 0,
      lineEnd: 0,
      content: newContent
    };
    
    this.editHistory.push(editSnapshot);
    if (this.editHistory.length > this.maxHistorySize) {
      this.editHistory.shift();
    }

    this.analyzeAndStorePattern(filePath, newContent, language);
    this.analyzeImports(filePath, newContent, language);
    this.saveToStorage();
  }

  private analyzeAndStorePattern(filePath: string, content: string, language: string): void {
    const lines = content.split('\n');
    const patterns = this.extractCommonPatterns(language);
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      for (const pattern of patterns) {
        if (trimmed.startsWith(pattern.trigger)) {
          const completion = this.extractCompletion(trimmed, pattern.trigger);
          if (completion && completion.length > 3) {
            this.addOrUpdatePattern(
              pattern.trigger,
              completion,
              language,
              filePath,
              1
            );
          }
        }
      }
    }
  }

  private extractCommonPatterns(language: string): Array<{ trigger: string; extractor: (line: string) => string | null }> {
    const tsPatterns = [
      { trigger: 'import ', extractor: (line: string) => line.match(/import\s+.+/)?.[0] || null },
      { trigger: 'export ', extractor: (line: string) => line.match(/export\s+.+/)?.[0] || null },
      { trigger: 'const ', extractor: (line: string) => line.match(/const\s+\w+\s*=/)?.[0] || null },
      { trigger: 'interface ', extractor: (line: string) => line.match(/interface\s+\w+/)?.[0] || null },
      { trigger: 'type ', extractor: (line: string) => line.match(/type\s+\w+/)?.[0] || null },
      { trigger: 'async ', extractor: (line: string) => line.match(/async\s+\w+/)?.[0] || null },
      { trigger: 'public ', extractor: (line: string) => line.match(/public\s+\w+/)?.[0] || null },
      { trigger: 'private ', extractor: (line: string) => line.match(/private\s+\w+/)?.[0] || null },
    ];

    const pyPatterns = [
      { trigger: 'def ', extractor: (line: string) => line.match(/def\s+\w+/)?.[0] || null },
      { trigger: 'class ', extractor: (line: string) => line.match(/class\s+\w+/)?.[0] || null },
      { trigger: 'import ', extractor: (line: string) => line.match(/import\s+\w+/)?.[0] || null },
      { trigger: 'from ', extractor: (line: string) => line.match(/from\s+\w+/)?.[0] || null },
      { trigger: 'async def ', extractor: (line: string) => line.match(/async\s+def\s+\w+/)?.[0] || null },
    ];

    // 仓颉语言模式
    const cangjiePatterns = [
      { trigger: 'func ', extractor: (line: string) => line.match(/func\s+\w+/)?.[0] || null },
      { trigger: 'class ', extractor: (line: string) => line.match(/class\s+\w+/)?.[0] || null },
      { trigger: 'struct ', extractor: (line: string) => line.match(/struct\s+\w+/)?.[0] || null },
      { trigger: 'interface ', extractor: (line: string) => line.match(/interface\s+\w+/)?.[0] || null },
      { trigger: 'enum ', extractor: (line: string) => line.match(/enum\s+\w+/)?.[0] || null },
      { trigger: 'import ', extractor: (line: string) => line.match(/import\s+.+/)?.[0] || null },
      { trigger: 'use ', extractor: (line: string) => line.match(/use\s+\w+/)?.[0] || null },
      { trigger: 'val ', extractor: (line: string) => line.match(/val\s+\w+/)?.[0] || null },
      { trigger: 'var ', extractor: (line: string) => line.match(/var\s+\w+/)?.[0] || null },
      { trigger: 'public ', extractor: (line: string) => line.match(/public\s+\w+/)?.[0] || null },
      { trigger: 'private ', extractor: (line: string) => line.match(/private\s+\w+/)?.[0] || null },
      { trigger: 'protected ', extractor: (line: string) => line.match(/protected\s+\w+/)?.[0] || null },
      { trigger: 'namespace ', extractor: (line: string) => line.match(/namespace\s+\w+/)?.[0] || null },
      { trigger: 'module ', extractor: (line: string) => line.match(/module\s+\w+/)?.[0] || null },
    ];

    if (language === 'python') {
      return pyPatterns;
    } else if (language === 'cangjie') {
      return cangjiePatterns;
    }
    return tsPatterns;
  }

  private extractCompletion(line: string, trigger: string): string | null {
    const afterTrigger = line.substring(trigger.length).trim();
    const match = afterTrigger.match(/^(\w+)/);
    return match ? match[1] : null;
  }

  private addOrUpdatePattern(
    trigger: string,
    completion: string,
    language: string,
    filePath: string,
    frequency: number
  ): void {
    const id = `${trigger}:${completion}:${language}`;
    
    if (this.patterns.has(id)) {
      const existing = this.patterns.get(id)!;
      existing.frequency += frequency;
      existing.lastUsed = Date.now();
      existing.score = this.calculateScore(existing);
      this.patterns.set(id, existing);
    } else {
      if (this.patterns.size >= this.maxPatternsSize) {
        this.prunePatterns();
      }
      
      const pattern: CodePattern = {
        id,
        trigger,
        completion,
        frequency,
        language,
        context: path.basename(filePath),
        filePatterns: [path.basename(filePath)],
        lastUsed: Date.now(),
        score: 0
      };
      pattern.score = this.calculateScore(pattern);
      this.patterns.set(id, pattern);
    }
  }

  private calculateScore(pattern: CodePattern): number {
    const recencyWeight = 0.3;
    const frequencyWeight = 0.5;
    const contextWeight = 0.2;
    
    const now = Date.now();
    const daysSinceLastUse = (now - pattern.lastUsed) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - daysSinceLastUse / 30);
    
    const frequencyScore = Math.min(1, pattern.frequency / 10);
    
    const contextScore = pattern.filePatterns.length > 1 ? 0.8 : 0.5;
    
    return recencyWeight * recencyScore + frequencyWeight * frequencyScore + contextWeight * contextScore;
  }

  private prunePatterns(): void {
    const sorted = Array.from(this.patterns.values()).sort((a, b) => a.score - b.score);
    const toRemove = sorted.slice(0, Math.floor(this.maxPatternsSize * 0.2));
    for (const pattern of toRemove) {
      this.patterns.delete(pattern.id);
    }
  }

  private analyzeImports(filePath: string, content: string, language: string): void {
    const importRegex = language === 'python'
      ? /(?:import\s+(\w+)|from\s+(\w+)\s+import)/
      : /import\s+(?:\{([^}]+)\}|(\w+))/g;
    
    const matches = content.matchAll(importRegex);
    const imports: string[] = [];
    
    for (const match of matches) {
      if (match[1]) imports.push(match[1]);
      if (match[2]) imports.push(match[2]);
    }
    
    if (!this.importPatterns.has(language)) {
      this.importPatterns.set(language, new Set());
    }
    
    const langImports = this.importPatterns.get(language)!;
    for (const imp of imports) {
      langImports.add(imp);
    }
  }

  predictIntent(context: CompletionContext): CompletionIntent {
    const { prefix, suffix, language } = context;
    const intents: Array<{ type: CompletionIntent['type']; score: number }> = [];

    const trimmedPrefix = prefix.trimEnd();
    const lastLine = trimmedPrefix.split('\n').pop() || '';
    const nextLine = suffix.trimStart().split('\n')[0] || '';

    if (lastLine.includes('import ') || nextLine.includes('import ')) {
      intents.push({ type: 'import', score: 0.9 });
    }

    if (lastLine.match(/\bdef\s+\w+\s*\(/)) {
      intents.push({ type: 'function', score: 0.8 });
    }

    if (lastLine.match(/\bclass\s+\w+/)) {
      intents.push({ type: 'class', score: 0.8 });
    }

    if (lastLine.match(/\b\w+\s*=\s*$/)) {
      intents.push({ type: 'variable', score: 0.7 });
    }

    if (lastLine.startsWith('//') || lastLine.startsWith('#')) {
      intents.push({ type: 'comment', score: 0.9 });
    }

    if (lastLine.match(/\berror\b|\bexception\b|\bfail\b/i)) {
      intents.push({ type: 'error', score: 0.8 });
    }

    if (lastLine.match(/\btest\b|\bdescribe\b|\bit\b/i)) {
      intents.push({ type: 'test', score: 0.8 });
    }

    if (nextLine.length > 0 && !lastLine.endsWith('{') && !lastLine.endsWith(':')) {
      intents.push({ type: 'complete', score: 0.6 });
    }

    intents.sort((a, b) => b.score - a.score);
    
    const bestIntent = intents[0] || { type: 'complete' as const, score: 0.3 };
    const suggestedCompletions = this.getSuggestedCompletions(context, bestIntent.type);

    return {
      type: bestIntent.type,
      confidence: bestIntent.score,
      suggestedCompletions
    };
  }

  getSuggestedCompletions(context: CompletionContext, intentType: CompletionIntent['type']): string[] {
    const suggestions: string[] = [];
    const { language, currentFile } = context;

    const matchingPatterns = Array.from(this.patterns.values())
      .filter(p => p.language === language && p.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    for (const pattern of matchingPatterns) {
      suggestions.push(pattern.completion);
    }

    if (intentType === 'import') {
      const langImports = this.importPatterns.get(language);
      if (langImports) {
        for (const imp of langImports) {
          if (suggestions.length >= 10) break;
          if (!suggestions.includes(imp)) {
            suggestions.push(imp);
          }
        }
      }
    }

    return suggestions.slice(0, 10);
  }

  getCompletionContext(document: vscode.TextDocument, position: vscode.Position): CompletionContext {
    const ext = path.extname(document.fileName).toLowerCase();
    const language = this.detectLanguage(ext);
    
    const windowSize = 30;
    const startLine = Math.max(0, position.line - windowSize);
    const endLine = Math.min(document.lineCount - 1, position.line + 10);
    
    const rangeBefore = new vscode.Range(startLine, 0, position.line, position.character);
    const rangeAfter = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).range.end.character);
    
    const prefix = document.getText(rangeBefore);
    const suffix = document.getText(rangeAfter);

    const recentEdits = this.editHistory
      .filter(e => e.file === document.fileName)
      .slice(-5);

    const importMatches = prefix.matchAll(/(?:import|from|require)\s+["']([^"']+)["']/g);
    const imports: string[] = [];
    for (const match of importMatches) {
      imports.push(match[1]);
    }

    return {
      currentFile: document.fileName,
      language,
      prefix,
      suffix,
      cursorLine: position.line,
      cursorColumn: position.character,
      visibleSymbols: [],
      imports,
      recentEdits
    };
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.cpp': 'cpp'
    };
    return langMap[ext] || 'unknown';
  }

  private getStoragePath(): string {
    return path.join(this.rootPath, '.llma_patterns.json');
  }

  private loadFromStorage(): void {
    try {
      const storagePath = this.getStoragePath();
      if (fs.existsSync(storagePath)) {
        const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
        if (data.patterns) {
          for (const p of data.patterns) {
            this.patterns.set(p.id, p);
          }
        }
        if (data.importPatterns) {
          for (const [lang, imports] of Object.entries(data.importPatterns)) {
            this.importPatterns.set(lang, new Set(imports as string[]));
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load pattern storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const storagePath = this.getStoragePath();
      const data = {
        patterns: Array.from(this.patterns.values()),
        importPatterns: Object.fromEntries(this.importPatterns)
      };
      fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save pattern storage:', error);
    }
  }

  getStats(): { totalPatterns: number; totalImports: number; languages: string[] } {
    const languages = new Set<string>();
    for (const p of this.patterns.values()) {
      languages.add(p.language);
    }
    
    return {
      totalPatterns: this.patterns.size,
      totalImports: Array.from(this.importPatterns.values()).reduce((sum, s) => sum + s.size, 0),
      languages: Array.from(languages)
    };
  }

  clear(): void {
    this.patterns.clear();
    this.editHistory = [];
    this.importPatterns.clear();
    this.saveToStorage();
  }
}

let patternLearnerInstance: CodePatternLearner | null = null;

export function getPatternLearner(rootPath?: string): CodePatternLearner {
  const workspaceRoot = rootPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  
  if (!patternLearnerInstance && workspaceRoot) {
    patternLearnerInstance = new CodePatternLearner(workspaceRoot);
  }
  
  return patternLearnerInstance!;
}

export function resetPatternLearner(): void {
  patternLearnerInstance = null;
}
