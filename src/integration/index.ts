/**
 * 集成管理模块
 * 
 * 整合了多个外部服务和功能，包括：
 * - LangChain：AI 功能集成（代码解释、审查、测试生成等）
 * - Git：版本控制集成（提交、推送、拉取等）
 * - 命令注册：提供各种快捷命令
 * 
 * 主要功能：
 * - 初始化和管理 LangChain 服务
 * - 初始化和管理 Git 服务
 * - 注册 VS Code 命令
 * - 提供 AI 辅助功能（代码解释、审查、测试生成）
 * - 提供 Git 快捷操作（快速提交、推送、拉取）
 * - AI 生成 Git 提交消息
 * 
 * @module integration/index
 */

import * as vscode from 'vscode';
import { LangChainManager, LangChainConfig } from '../langchain';
import { GitManager } from '../git';

/**
 * 集成管理器类
 * 
 * 整合 LangChain 和 Git 功能，提供统一的接口。
 * 使用单例模式确保全局只有一个实例。
 * 
 * @class IntegrationManager
 */
export class IntegrationManager {
  /**
   * 单例实例
   */
  private static instance: IntegrationManager | null = null;
  
  /**
   * LangChain 管理器实例
   */
  private langChainManager: LangChainManager | null = null;
  
  /**
   * Git 管理器实例
   */
  private gitManager: GitManager | null = null;
  
  /**
   * VS Code 扩展上下文
   */
  private context: vscode.ExtensionContext;

  /**
   * 私有构造函数
   * 
   * @param context - VS Code 扩展上下文
   */
  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 获取单例实例
   * 
   * @param context - VS Code 扩展上下文（首次创建时需要）
   * @returns 集成管理器单例
   */
  static getInstance(context?: vscode.ExtensionContext): IntegrationManager {
    if (!IntegrationManager.instance && context) {
      IntegrationManager.instance = new IntegrationManager(context);
    }
    return IntegrationManager.instance!;
  }

  /**
   * 重置单例实例
   */
  static resetInstance(): void {
    IntegrationManager.instance = null;
  }

  /**
   * 初始化所有集成服务
   * 
   * 初始化 Git 和 LangChain 服务。
   */
  async initialize(): Promise<void> {
    await this.initializeGit();
    await this.initializeLangChain();
    this.registerCommands();
  }

  private async initializeGit(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const repoPath = workspaceFolders[0].uri.fsPath;
      this.gitManager = GitManager.getInstance(repoPath);
      
      const isGitRepo = await this.gitManager.isGitRepo();
      if (isGitRepo) {
        console.log('Git repository detected and initialized');
      }
    }
  }

  private async initializeLangChain(): Promise<void> {
    const config = vscode.workspace.getConfiguration('llma');
    const currentModel = config.get<string>('currentModel') || 'deepseek';
    
    let apiKey = '';
    let baseUrl = '';
    let modelName = '';

    switch (currentModel) {
      case 'deepseek':
        apiKey = config.get<string>('deepseekApiKey') || '';
        modelName = config.get<string>('deepseekModel') || 'deepseek-coder';
        baseUrl = 'https://api.deepseek.com/v1';
        break;
      case 'qwen':
        apiKey = config.get<string>('qwenApiKey') || '';
        modelName = config.get<string>('qwenModel') || 'qwen-coder-turbo';
        baseUrl = config.get<string>('qwenBaseUrl') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
        break;
      case 'openai':
        apiKey = config.get<string>('openaiApiKey') || '';
        modelName = config.get<string>('openaiModel') || 'gpt-4-turbo-preview';
        break;
      case 'custom':
        apiKey = config.get<string>('customModel.apiKey') || '';
        baseUrl = config.get<string>('customModel.apiBaseUrl') || '';
        modelName = config.get<string>('customModel.modelName') || '';
        break;
    }

    if (apiKey && modelName) {
      const langChainConfig: LangChainConfig = {
        apiKey,
        baseUrl: baseUrl || undefined,
        modelName,
        temperature: 0.7,
        maxTokens: 2000,
      };
      this.langChainManager = LangChainManager.getInstance(langChainConfig);
      console.log('LangChain initialized with model:', modelName);
    }
  }

  getLangChainManager(): LangChainManager | null {
    return this.langChainManager;
  }

  getGitManager(): GitManager | null {
    return this.gitManager;
  }

  private registerCommands(): void {
    const commands = [
      vscode.commands.registerCommand('llma.git.quickCommit', async () => {
        if (this.gitManager) {
          await this.gitManager.showQuickCommit();
        } else {
          vscode.window.showErrorMessage('Git manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.git.quickPush', async () => {
        if (this.gitManager) {
          await this.gitManager.showQuickPush();
        } else {
          vscode.window.showErrorMessage('Git manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.git.quickPull', async () => {
        if (this.gitManager) {
          await this.gitManager.showQuickPull();
        } else {
          vscode.window.showErrorMessage('Git manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.git.branchPicker', async () => {
        if (this.gitManager) {
          await this.gitManager.showBranchPicker();
        } else {
          vscode.window.showErrorMessage('Git manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.git.status', async () => {
        if (this.gitManager) {
          await this.gitManager.showStatusOutput();
        } else {
          vscode.window.showErrorMessage('Git manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.git.aiCommit', async () => {
        if (this.gitManager && this.langChainManager) {
          try {
            const diff = await this.gitManager.getDiff();
            if (!diff.trim()) {
              vscode.window.showInformationMessage('No changes to commit');
              return;
            }

            const commitMessage = await this.langChainManager.generateCommitMessage(diff);
            const userMessage = await vscode.window.showInputBox({
              prompt: 'AI generated commit message. Edit or confirm:',
              value: commitMessage,
            });

            if (userMessage) {
              await this.gitManager.add('.');
              await this.gitManager.commit(userMessage);
              vscode.window.showInformationMessage('AI commit successful');
            }
          } catch (error) {
            vscode.window.showErrorMessage(`AI commit failed: ${error}`);
          }
        } else {
          vscode.window.showErrorMessage('Git or LangChain manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.code.explain', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('No active editor');
          return;
        }

        const selection = editor.selection;
        const code = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
        const fileType = editor.document.fileName.split('.').pop() || 'txt';

        if (this.langChainManager) {
          try {
            const explanation = await this.langChainManager.explainCode(code, fileType);
            
            const panel = vscode.window.createWebviewPanel(
              'codeExplanation',
              'Code Explanation',
              vscode.ViewColumn.Beside,
              {}
            );

            panel.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    white-space: pre-wrap;
                    word-wrap: break-word;
                  }
                </style>
              </head>
              <body>${explanation.replace(/\n/g, '<br>')}</body>
              </html>
            `;
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to explain code: ${error}`);
          }
        } else {
          vscode.window.showErrorMessage('LangChain manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.code.review', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('No active editor');
          return;
        }

        const code = editor.document.getText();
        const fileType = editor.document.fileName.split('.').pop() || 'txt';

        if (this.langChainManager) {
          try {
            const review = await this.langChainManager.codeReview(code, fileType);
            
            const panel = vscode.window.createWebviewPanel(
              'codeReview',
              'Code Review',
              vscode.ViewColumn.Beside,
              {}
            );

            panel.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                    white-space: pre-wrap;
                    word-wrap: break-word;
                  }
                </style>
              </head>
              <body>${review.replace(/\n/g, '<br>')}</body>
              </html>
            `;
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to review code: ${error}`);
          }
        } else {
          vscode.window.showErrorMessage('LangChain manager not initialized');
        }
      }),

      vscode.commands.registerCommand('llma.code.generateTests', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showInformationMessage('No active editor');
          return;
        }

        const selection = editor.selection;
        const code = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
        const fileType = editor.document.fileName.split('.').pop() || 'txt';

        if (this.langChainManager) {
          try {
            const tests = await this.langChainManager.generateTests(code, fileType);
            
            const panel = vscode.window.createWebviewPanel(
              'testGeneration',
              'Generated Tests',
              vscode.ViewColumn.Beside,
              { enableScripts: true }
            );

            panel.webview.html = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                    background: var(--vscode-editor-background);
                  }
                  pre {
                    background: var(--vscode-editor-lineHighlightBackground);
                    padding: 15px;
                    border-radius: 4px;
                    overflow-x: auto;
                  }
                  button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-top: 10px;
                  }
                  button:hover {
                    background: var(--vscode-button-hoverBackground);
                  }
                </style>
              </head>
              <body>
                <pre><code>${tests.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                <button onclick="copyCode()">Copy to Clipboard</button>
                <script>
                  const vscode = acquireVsCodeApi();
                  function copyCode() {
                    const code = document.querySelector('code').textContent;
                    navigator.clipboard.writeText(code);
                  }
                </script>
              </body>
              </html>
            `;
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to generate tests: ${error}`);
          }
        } else {
          vscode.window.showErrorMessage('LangChain manager not initialized');
        }
      }),
    ];

    commands.forEach(cmd => this.context.subscriptions.push(cmd));
  }

  dispose(): void {
    LangChainManager.resetInstance();
    GitManager.resetInstance();
    IntegrationManager.resetInstance();
  }
}

export function createIntegrationManager(context: vscode.ExtensionContext): IntegrationManager {
  return IntegrationManager.getInstance(context);
}
