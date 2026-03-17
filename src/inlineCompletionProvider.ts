// inlineCompletionProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { callSimpleAI } from './api';
import { getApiKey } from './config';
import { AI } from './constants';
import { updateStatusBar } from './statusBar';
import { getCangjieSystemPrompt, isCangjieFile } from './utils';

export class LLMAInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private _abortController: AbortController | null = null;
  private _timer: NodeJS.Timeout | null = null;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {

    const config = vscode.workspace.getConfiguration('llma');
    if (!config.get<boolean>('enableAutoCompletion')) { return []; }

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

          const promptData = this.prepareSmartContext(document, position);
          if (!promptData) {
            updateStatusBar(false);
            resolve([]);
            return;
          }

          const completionText = await this.fetchAICompletion(promptData, config, signal);

          if (!completionText || completionText.trim().length === 0) {
            updateStatusBar(false);
            resolve([]);
            return;
          }

          const item = new vscode.InlineCompletionItem(
            completionText,
            new vscode.Range(position, position)
          );

          updateStatusBar(false);
          resolve([item]);

        } catch (error) {
          updateStatusBar(false);
          resolve([]);
        }
      }, delay);
    });
  }

  private prepareSmartContext(document: vscode.TextDocument, position: vscode.Position) {
    const windowSizeLines = 60;
    const startLine = Math.max(0, position.line - windowSizeLines);
    const endLine = Math.min(document.lineCount - 1, position.line + 10);

    const rangeBefore = new vscode.Range(startLine, 0, position.line, position.character);
    const rangeAfter = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).range.end.character);

    const textBefore = document.getText(rangeBefore);
    const textAfter = document.getText(rangeAfter);

    if (textBefore.trim().length < 1) { return null; }

    return {
      prefix: textBefore,
      suffix: textAfter,
      language: document.languageId,
      filename: path.basename(document.fileName)
    };
  }

  private async fetchAICompletion(
    data: { prefix: string, suffix: string, language: string, filename: string },
    config: vscode.WorkspaceConfiguration,
    signal: AbortSignal
  ): Promise<string> {
    const model = config.get<string>('currentModel') || 'deepseek';
    const apiKey = getApiKey(config, model);
    if (!apiKey) { return ''; }

    // 检测是否为仓颉文件
    const isCangjie = data.language === 'cangjie' || data.filename.endsWith('.cj');
    
    const baseSystemPrompt = `You are a code completion engine. Output ONLY the code to fill the <CURSOR> gap. DO NOT repeat prefix/suffix. No Markdown. Use English for comments and strings by default. IMPORTANT: Do NOT use any special characters in your code, including emojis, ASCII art, or special symbols. Do NOT embed terminal commands in code strings.`;
    
    // 仓颉文件使用专用系统提示词
    const systemPrompt = isCangjie 
      ? getCangjieSystemPrompt(baseSystemPrompt)
      : baseSystemPrompt;
    
    // 仓颉使用更低的 temperature 确保准确性
    const temperature = isCangjie ? 0.0 : 0.0;
    
    const userPrompt = `File: ${data.filename}\nLang: ${data.language}\n\n[CODE START]\n${data.prefix}<CURSOR>${data.suffix}\n[CODE END]\n\nTask: Fill in <CURSOR>.`;
    const maxTokens = AI.INLINE_MAX_TOKENS;
    return await callSimpleAI(model, apiKey, systemPrompt, userPrompt, maxTokens, temperature, config, signal);
  }
}