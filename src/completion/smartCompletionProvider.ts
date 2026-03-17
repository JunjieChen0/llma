import * as vscode from 'vscode';
import * as path from 'path';
import { callSimpleAI } from '../api';
import { getApiKey, isMultimodalModel } from '../config';
import { AI } from '../constants';
import { updateStatusBar } from '../statusBar';
import { CodePatternLearner, getPatternLearner, CompletionContext, CompletionIntent } from './patternLearner';
import { AgentContextManager, createContextManager } from '../context';
import { getCangjieSystemPrompt, isCangjieFile } from '../utils';

export class SmartCompletionProvider implements vscode.InlineCompletionItemProvider {
  private _abortController: AbortController | null = null;
  private _timer: NodeJS.Timeout | null = null;
  private _patternLearner: CodePatternLearner | null = null;
  private _contextManager: AgentContextManager | null = null;
  private _lastCompletionTime: number = 0;
  private _completionCount: number = 0;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {

    const config = vscode.workspace.getConfiguration('llma');
    if (!config.get<boolean>('enableAutoCompletion')) { return []; }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) { return []; }

    if (!this._patternLearner) {
      this._patternLearner = getPatternLearner(workspaceRoot);
    }

    if (!this._contextManager) {
      this._contextManager = createContextManager(workspaceRoot);
      this._contextManager.initialize().catch(() => {});
    }

    if (this._timer) { clearTimeout(this._timer); }
    if (this._abortController) { this._abortController.abort(); }

    const delay = config.get<number>('requestDelay') || 300;

    return new Promise((resolve) => {
      this._timer = setTimeout(async () => {
        if (token.isCancellationRequested) { resolve([]); return; }

        try {
          updateStatusBar(true);
          this._abortController = new AbortController();
          const signal = this._abortController.signal;

          token.onCancellationRequested(() => {
            this._abortController?.abort();
            updateStatusBar(false);
            resolve([]);
          });

          const promptData = this.prepareEnhancedContext(document, position);
          if (!promptData) {
            updateStatusBar(false);
            resolve([]);
            return;
          }

          const intent = this._patternLearner!.predictIntent(promptData.completionContext);
          promptData.intent = intent;

          const completionText = await this.fetchSmartCompletion(promptData, config, signal);

          if (!completionText || completionText.trim().length === 0) {
            const fallbackItems = this.getFallbackCompletions(promptData.completionContext, intent);
            if (fallbackItems.length > 0) {
              updateStatusBar(false);
              const items = fallbackItems.map(c => new vscode.InlineCompletionItem(
                c,
                new vscode.Range(position, position)
              ));
              resolve(items);
              return;
            }
            resolve([]);
            return;
          }

          this._patternLearner!.learnFromEdit(
            document.fileName,
            promptData.prefix + completionText + promptData.suffix,
            promptData.prefix + promptData.suffix
          );

          this._completionCount++;
          this._lastCompletionTime = Date.now();

          const items = this.splitCompletionIntoItems(completionText, position);

          updateStatusBar(false);
          resolve(items);

        } catch (error) {
          updateStatusBar(false);
          resolve([]);
        }
      }, delay);
    });
  }

  private prepareEnhancedContext(document: vscode.TextDocument, position: vscode.Position) {
    const windowSizeLines = 60;
    const startLine = Math.max(0, position.line - windowSizeLines);
    const endLine = Math.min(document.lineCount - 1, position.line + 10);

    const rangeBefore = new vscode.Range(startLine, 0, position.line, position.character);
    const rangeAfter = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).range.end.character);

    const prefix = document.getText(rangeBefore);
    const suffix = document.getText(rangeAfter);

    if (prefix.trim().length < 1) { return null; }

    const completionContext: CompletionContext = {
      currentFile: document.fileName,
      language: document.languageId,
      prefix,
      suffix,
      cursorLine: position.line,
      cursorColumn: position.character,
      visibleSymbols: [],
      imports: [],
      recentEdits: []
    };

    return {
      prefix,
      suffix,
      language: document.languageId,
      filename: path.basename(document.fileName),
      filepath: document.fileName,
      completionContext,
      intent: null as CompletionIntent | null
    };
  }

  private async fetchSmartCompletion(
    data: {
      prefix: string;
      suffix: string;
      language: string;
      filename: string;
      filepath: string;
      completionContext: CompletionContext;
      intent: CompletionIntent | null;
    },
    config: vscode.WorkspaceConfiguration,
    signal: AbortSignal
  ): Promise<string> {
    const model = config.get<string>('currentModel') || 'deepseek';
    const apiKey = getApiKey(config, model);
    if (!apiKey) { return ''; }

    // 检测是否为仓颉文件
    const isCangjie = data.language === 'cangjie' || data.filename.endsWith('.cj');

    let projectContext = '';
    if (this._contextManager?.isReady()) {
      try {
        projectContext = await this._contextManager.getRelevantContext(
          data.filepath,
          data.prefix + '<CURSOR>' + data.suffix,
          2000
        );
      } catch {
        // Ignore context errors
      }
    }

    const intentHint = data.intent 
      ? `\n[Intent: ${data.intent.type} (${Math.round(data.intent.confidence * 100)}% confidence)]`
      : '';

    const learnedSuggestions = data.intent?.suggestedCompletions.length
      ? `\n[Learned patterns: ${data.intent.suggestedCompletions.slice(0, 5).join(', ')}]`
      : '';

    const baseSystemPrompt = `You are an advanced code completion engine with project-level understanding.
Output ONLY the code to fill the <CURSOR> gap. DO NOT repeat prefix/suffix. No Markdown.
Use English for comments and strings by default.
IMPORTANT: Do NOT use any special characters in your code, including emojis, ASCII art, or special symbols. Do NOT embed terminal commands in code strings.
${intentHint}${learnedSuggestions}

Consider:
1. Project patterns and conventions
2. Import statements in the file
3. Function and class signatures
4. Type hints and return types
5. Error handling patterns`;

    // 仓颉文件使用专用系统提示词
    const systemPrompt = isCangjie 
      ? getCangjieSystemPrompt(baseSystemPrompt)
      : baseSystemPrompt;
    
    // 仓颉使用更低的 temperature 确保准确性
    const temperature = isCangjie ? 0.0 : 0.0;

    const userPrompt = `File: ${data.filename}
Lang: ${data.language}
${projectContext ? `\nProject Context:\n${projectContext}\n` : ''}
[CODE START]
${data.prefix}<CURSOR>${data.suffix}
[CODE END]

Task: Fill in <CURSOR>.`;

    const maxTokens = AI.INLINE_MAX_TOKENS;
    return await callSimpleAI(model, apiKey, systemPrompt, userPrompt, maxTokens, temperature, config, signal);
  }

  private getFallbackCompletions(context: CompletionContext, intent: CompletionIntent): string[] {
    if (!this._patternLearner) { return []; }

    const suggestions = intent?.suggestedCompletions || [];
    
    if (context.suffix.trim().startsWith('{')) {
      if (context.language === 'typescript' || context.language === 'javascript') {
        return suggestions.length > 0 ? suggestions : [
          'return {',
          'const result = {',
          'console.log({',
        ];
      }
    }

    if (context.suffix.trim().startsWith('(')) {
      if (context.language === 'typescript' || context.language === 'javascript') {
        return suggestions.length > 0 ? suggestions : [
          'return ',
          'await ',
          'console.log(',
        ];
      }
    }

    if (context.suffix.trim().startsWith(':')) {
      if (context.language === 'typescript') {
        return suggestions.length > 0 ? suggestions : [
          'string',
          'number',
          'boolean',
          'void',
          'any',
          'Promise<void>',
          'Promise<string>',
        ];
      }
    }

    return [];
  }

  private splitCompletionIntoItems(completion: string, position: vscode.Position): vscode.InlineCompletionItem[] {
    const items: vscode.InlineCompletionItem[] = [];
    
    const lines = completion.split('\n');
    const mainCompletion = lines.join('\n');
    items.push(new vscode.InlineCompletionItem(
      mainCompletion,
      new vscode.Range(position, position)
    ));

    if (lines.length > 1) {
      for (let i = 1; i < Math.min(lines.length, 3); i++) {
        const partial = lines.slice(0, i + 1).join('\n');
        items.push(new vscode.InlineCompletionItem(
          partial,
          new vscode.Range(position, position)
        ));
      }
    }

    return items;
  }
}

export class CompletionAnalytics {
  private static instance: CompletionAnalytics | null = null;
  private acceptedCount: number = 0;
  private rejectedCount: number = 0;
  private totalShown: number = 0;
  private sessionStart: number = Date.now();

  static getInstance(): CompletionAnalytics {
    if (!CompletionAnalytics.instance) {
      CompletionAnalytics.instance = new CompletionAnalytics();
    }
    return CompletionAnalytics.instance;
  }

  recordAccept(): void {
    this.acceptedCount++;
    this.totalShown++;
  }

  recordReject(): void {
    this.rejectedCount++;
    this.totalShown++;
  }

  recordShow(): void {
    this.totalShown++;
  }

  getStats(): { acceptanceRate: number; totalShown: number; sessionDuration: number } {
    const acceptanceRate = this.totalShown > 0 
      ? Math.round((this.acceptedCount / this.totalShown) * 100) 
      : 0;
    
    return {
      acceptanceRate,
      totalShown: this.totalShown,
      sessionDuration: Date.now() - this.sessionStart
    };
  }

  reset(): void {
    this.acceptedCount = 0;
    this.rejectedCount = 0;
    this.totalShown = 0;
    this.sessionStart = Date.now();
  }
}
