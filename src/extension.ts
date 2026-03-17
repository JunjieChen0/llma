/**
 * VS Code 扩展入口文件
 * 
 * 这是 NJUST_AI_Assistant (LLMA) 扩展的主入口点，负责：
 * 1. 初始化所有核心组件（AST分析器、集成管理器、状态栏等）
 * 2. 注册代码补全提供者（基础版和智能版）
 * 3. 注册侧边栏聊天窗口
 * 4. 初始化 MCP (Model Context Protocol) 管理器
 * 5. 注册所有扩展命令
 * 6. 监听配置变化
 * 
 * @module extension
 */

import * as vscode from 'vscode';
import { createStatusBarItem, disposeStatusBar, updateStatusBar } from './statusBar';
import { LLMAInlineCompletionProvider } from './inlineCompletionProvider';
import { SmartCompletionProvider } from './completion/smartCompletionProvider';
import { LLMAChatProvider } from './chat/index';
import { compileFile, showCompilationOptions, runExecutable, runTerminal } from './compilation';
import { handleExplicitCodeGeneration } from './commands';
import { MCPManager } from './mcpClient';
import { initializeASTAnalyzers } from './ast';
import { IntegrationManager } from './integration';

/**
 * 全局变量定义
 * 这些变量在整个扩展生命周期中共享，提供对核心组件的访问
 */

/**
 * 状态栏项，用于显示扩展运行状态
 */
export let statusBarItem: vscode.StatusBarItem;

/**
 * 全局聊天提供者实例，用于访问聊天功能
 */
export let globalChatProvider: LLMAChatProvider | undefined;

/**
 * MCP (Model Context Protocol) 管理器，用于连接外部 MCP 服务器
 */
export let mcpManager: MCPManager | undefined;

/**
 * 集成管理器，整合了 LangChain 和 Git 功能
 */
export let integrationManager: IntegrationManager | undefined;

/**
 * 扩展激活函数
 * 
 * 当用户打开包含此扩展的工作区时，VS Code 会调用此函数。
 * 这是扩展初始化的核心入口点。
 * 
 * @param context - VS Code 扩展上下文，提供订阅、存储等扩展生命周期管理功能
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('=== NJUST_AI_Assistant 已激活 ===');
  
  // 初始化 AST 分析器，支持多种编程语言的代码结构分析
  initializeASTAnalyzers();
  console.log('✅ AST analyzers initialized for supported languages');

  // 初始化集成管理器，整合 LangChain (AI 功能) 和 Git (版本控制)
  integrationManager = IntegrationManager.getInstance(context);
  integrationManager.initialize().then(() => {
    console.log('✅ Integration manager initialized (LangChain + Git)');
  }).catch(err => {
    console.warn('Integration manager initialization failed:', err);
  });

  // 1. 初始化状态栏
  // 状态栏显示扩展的运行状态（如：正在请求 AI、空闲等）
  statusBarItem = createStatusBarItem();
  context.subscriptions.push(statusBarItem);

  // 2. 注册基础版行内代码补全提供者
  // 这是第一代补全系统，提供实时的代码建议
  const provider = new LLMAInlineCompletionProvider();
  const selector = { pattern: '**' }; // 匹配所有文件类型
  const inlineProvider = vscode.languages.registerInlineCompletionItemProvider(selector, provider);
  context.subscriptions.push(inlineProvider);

  // 2.1 注册增强版智能补全提供者（项目级学习）
  // 这是第二代补全系统，具备以下特性：
  // - 学习项目中的代码模式
  // - 理解项目上下文
  // - 预测用户意图
  // - 提供更准确的补全建议
  const smartProvider = new SmartCompletionProvider();
  const smartInlineProvider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    smartProvider
  );
  context.subscriptions.push(smartInlineProvider);

  // 3. 注册侧边栏聊天窗口
  // 提供与 AI 助手交互的界面，支持：
  // - 代码生成和修改
  // - 工具调用（文件操作、命令执行等）
  // - 会话历史管理
  // - 多轮对话
  const chatProvider = new LLMAChatProvider(context);
  globalChatProvider = chatProvider;
  const chatView = vscode.window.registerWebviewViewProvider("llma.chatView", chatProvider, {
    webviewOptions: { retainContextWhenHidden: true } // 隐藏时保留上下文，避免重新加载
  });
  context.subscriptions.push(chatView);

  // 4. 初始化 MCP (Model Context Protocol) 管理器
  // MCP 是一个标准协议，允许 AI 模型访问外部工具和数据源
  // 支持的功能：
  // - 连接多个 MCP 服务器
  // - 动态加载工具
  // - 工具调用和结果返回
  mcpManager = new MCPManager();
  const config = vscode.workspace.getConfiguration('llma');
  const mcpServers = config.get<any[]>('mcp.servers') || [];
  if (mcpServers.length > 0) {
    mcpManager.initializeServers(mcpServers).catch(err => {
      console.error('MCP initialization error', err);
    });
  }

  // 5. 监听配置变化，实现动态配置更新
  // 当用户修改配置时，自动重新初始化相关组件
  const configListener = vscode.workspace.onDidChangeConfiguration(e => {
    // MCP 服务器配置变化时，重新初始化所有服务器
    if (e.affectsConfiguration('llma.mcp.servers')) {
      const newConfig = vscode.workspace.getConfiguration('llma');
      const newServers = newConfig.get<any[]>('mcp.servers') || [];
      // 重新初始化：先关闭所有现有连接，再重新连接
      mcpManager?.disposeAll().then(() => {
        mcpManager?.initializeServers(newServers);
      });
    }
    // 其他配置变化时，更新状态栏
    if (e.affectsConfiguration('llma')) {
      updateStatusBar(false);
    }
  });

  // 6. 注册扩展命令
  // 这些命令可以通过命令面板、快捷键或代码触发
  
  // 命令：显式触发 AI 代码生成
  // 用户可以通过此命令主动请求 AI 生成代码
  const generateCommand = vscode.commands.registerCommand('llma.aiCodeComplete', async () => {
    await handleExplicitCodeGeneration();
  });

  // 命令：切换自动补全开关
  // 允许用户快速启用/禁用自动代码补全功能
  const toggleCommand = vscode.commands.registerCommand('llma.toggle', () => {
    const config = vscode.workspace.getConfiguration('llma');
    const currentState = config.get<boolean>('enableAutoCompletion');
    config.update('enableAutoCompletion', !currentState, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`LLMA 自动预测已${!currentState ? '开启' : '关闭'}`);
  });

  // 命令：手动触发补全建议
  // 用户可以主动请求显示补全建议
  const manualTriggerCommand = vscode.commands.registerCommand('llma.trigger', () => {
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });

  // 命令：编译当前文件
  // 支持仓颉等语言的编译功能
  const compileCommand = vscode.commands.registerCommand('llma.compileCurrentFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个编辑器');
      return;
    }
    await compileFile(editor.document.uri.fsPath);
  });

  // 命令：使用选项编译当前文件
  // 提供编译选项对话框，允许用户自定义编译参数
  const compileWithOptionsCommand = vscode.commands.registerCommand('llma.compileWithOptions', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个编辑器');
      return;
    }
    await showCompilationOptions(editor.document.uri.fsPath);
  });

  // 命令：切换聊天/Agent 模式
  const toggleChatAgentModeCommand = vscode.commands.registerCommand('llma.toggleChatAgentMode', () => {
    globalChatProvider?.postMessageToWebview({ type: 'toggleChatAgentMode' });
  });

  // 将所有订阅项添加到上下文，确保扩展停用时正确清理资源
  context.subscriptions.push(
    generateCommand,
    toggleCommand,
    manualTriggerCommand,
    compileCommand,
    compileWithOptionsCommand,
    toggleChatAgentModeCommand,
    configListener,
    // 确保 MCP 管理器在扩展停用时释放所有连接
    { dispose: () => mcpManager?.disposeAll() }
  );
}

/**
 * 扩展停用函数
 * 
 * 当扩展被禁用或 VS Code 关闭时调用。
 * 负责清理所有资源，保存状态，释放连接。
 */
export async function deactivate() {
  // 保存当前聊天会话到持久化存储
  if (globalChatProvider) {
    await globalChatProvider.saveCurrentSession();
  }
  
  // 释放终端资源
  if (runTerminal) {
    runTerminal.dispose();
  }
  
  // 释放状态栏资源
  disposeStatusBar();
  
  // 关闭所有 MCP 服务器连接
  await mcpManager?.disposeAll();
  
  // 释放集成管理器资源
  integrationManager?.dispose();
  
  console.log('LLMA 已停用');
}