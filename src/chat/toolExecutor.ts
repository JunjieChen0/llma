/**
 * 工具执行器模块
 * 
 * 负责解析和执行 AI 返回的工具调用指令，包括：
 * - 工具解析：从 AI 响应中提取工具调用指令
 * - 工具执行：调用注册的工具并执行操作
 * - 重试机制：失败时自动重试
 * - 错误处理：捕获和处理工具执行错误
 * - 并行执行：支持同时执行多个工具
 * - 结果收集：收集所有工具的执行结果
 * 
 * 主要功能：
 * - 解析多种格式的工具调用指令
 * - 支持工具验证和预处理
 * - 提供重试和错误恢复机制
 * - 支持工具执行钩子（before/after）
 * - 提供详细的执行日志和反馈
 * 
 * @module chat/toolExecutor
 */

import * as vscode from 'vscode';
import { ToolParser, ToolParseOptions, ToolParseResult } from './toolParser';
import { LLMAChatProvider } from './index';
import { toolRegistry, registerAllTools } from './toolUnified';
import { EditDescription, ChatHistory } from '../types';

/**
 * 工具注册标志
 * 确保工具只注册一次
 */
let toolsRegistered = false;

/**
 * 确保工具已注册
 * 
 * 如果工具尚未注册，则执行注册操作。
 * 使用单例模式确保工具只注册一次。
 */
function ensureToolsRegistered(): void {
  if (!toolsRegistered) {
    registerAllTools();
    toolsRegistered = true;
  }
}

/**
 * 工具执行上下文接口
 * 
 * 定义工具执行时需要的上下文信息。
 * 
 * @interface ToolExecutionContext
 */
export interface ToolExecutionContext {
  /**
   * 聊天提供者实例
   */
  provider: LLMAChatProvider;
  
  /**
   * 聊天历史记录
   */
  history: ChatHistory;
  
  /**
   * VS Code 工作区配置
   */
  config: vscode.WorkspaceConfiguration;
  
  /**
   * 中止信号
   * 用于取消正在执行的工具
   */
  abortSignal?: AbortSignal;
}

/**
 * 工具执行结果接口
 * 
 * 定义工具执行后的结果信息。
 * 
 * @interface ToolExecutionResult
 */
export interface ToolExecutionResult {
  /**
   * 是否成功
   */
  success: boolean;
  
  /**
   * 工具类型
   */
  toolType?: string;
  
  /**
   * 工具参数
   */
  parameters?: any;
  
  /**
   * 输出内容
   */
  output?: string;
  
  /**
   * 错误信息
   */
  error?: string;
  
  /**
   * 改进建议
   */
  suggestions?: string[];
  
  /**
   * 重试次数
   */
  retryCount: number;
}

/**
 * 工具执行器类
 * 
 * 负责解析和执行 AI 返回的工具调用指令。
 * 
 * @class ToolExecutor
 */
export class ToolExecutor {
  /**
   * 最大重试次数
   */
  private static readonly MAX_RETRIES = 2;
  
  /**
   * 重试延迟（毫秒）
   */
  private static readonly RETRY_DELAY = 500;

  /**
   * 执行工具调用
   * 
   * 从 AI 响应中解析工具调用指令，并执行所有工具。
   * 
   * @param aiResponse - AI 响应字符串
   * @param context - 工具执行上下文
   * @param options - 工具解析选项
   * @returns Promise，解析为所有工具的执行结果数组
   * 
   * @example
   * ```typescript
   * const results = await ToolExecutor.executeTools(
   *   aiResponse,
   *   { provider, history, config }
   * );
   * for (const result of results) {
   *   console.log(result.toolType, result.success);
   * }
   * ```
   */
  static async executeTools(
    aiResponse: string,
    context: ToolExecutionContext,
    options: ToolParseOptions = {}
  ): Promise<ToolExecutionResult[]> {
    // 确保工具已注册
    ensureToolsRegistered();
    
    // 解析工具调用指令
    const parseResults = ToolParser.parseToolDirective(aiResponse, options);
    const results: ToolExecutionResult[] = [];

    // 执行每个工具
    for (const parseResult of parseResults) {
      if (!parseResult.toolType || !parseResult.parameters) {
        results.push({
          success: false,
          toolType: parseResult.toolType,
          parameters: parseResult.parameters,
          error: parseResult.error,
          suggestions: parseResult.suggestions,
          retryCount: 0
        });
        continue;
      }

      const executionResult = await this.executeWithRetry(
        parseResult.toolType,
        parseResult.parameters,
        context,
        this.MAX_RETRIES
      );

      results.push(executionResult);
    }

    return results;
  }

  static async executeWithRetry(
    toolType: string,
    parameters: any,
    context: ToolExecutionContext,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<ToolExecutionResult> {
    let lastError: string | undefined;
    let lastTermError: any;
    let retryCount = 0;

    // 为 RUN/BUILD/TEST 注入稳定 id，所有重试共用同一个 id，前端去重只显示一张卡片
    const isRunTool = ['RUN', 'BUILD', 'TEST'].includes(toolType);
    const termId = isRunTool
      ? `term_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      : undefined;
    const paramsWithId = isRunTool ? { ...parameters, _termId: termId } : parameters;

    while (retryCount <= maxRetries) {
      try {
        const result = await this.executeSingleTool(toolType, paramsWithId, context);
        return {
          success: true,
          toolType,
          parameters,
          output: result,
          retryCount
        };
      } catch (error: any) {
        lastError = error.message;
        lastTermError = error;
        retryCount++;

        if (retryCount <= maxRetries) {
          await this.sleep(this.RETRY_DELAY * retryCount);
        }
      }
    }

    // 所有重试耗尽后，为失败的 RUN/BUILD/TEST 命令发一张错误卡片
    if (isRunTool && lastTermError?.termOutput !== undefined) {
      (context.provider as any).postMessageToWebview({
        type: 'addTerminalOutput',
        id: termId,
        command: parameters.command,
        output: lastTermError.termOutput,
        exitCode: lastTermError.termExitCode ?? 1
      });
    }

    return {
      success: false,
      toolType,
      parameters,
      error: lastError,
      retryCount: maxRetries
    };
  }

  private static async executeSingleTool(
    toolType: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string> {
    const validation = ToolParser.validateToolParameters(toolType, parameters);

    if (!validation.valid) {
      throw new Error(`参数验证失败: ${validation.errors.join(', ')}`);
    }

    ensureToolsRegistered();
    const tool = toolRegistry.get(toolType);

    if (!tool) {
      throw new Error(`未知工具类型: ${toolType}`);
    }

    return await tool.execute(parameters, context);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async validateAndExecute(
    aiResponse: string,
    context: ToolExecutionContext,
    options: ToolParseOptions = {}
  ): Promise<{ results: ToolExecutionResult[]; validationErrors: string[] }> {
    const parseResults = ToolParser.parseToolDirective(aiResponse, options);
    const results: ToolExecutionResult[] = [];
    const validationErrors: string[] = [];

    for (const parseResult of parseResults) {
      if (!parseResult.toolType || !parseResult.parameters) {
        results.push({
          success: false,
          toolType: parseResult.toolType,
          parameters: parseResult.parameters,
          error: parseResult.error,
          suggestions: parseResult.suggestions,
          retryCount: 0
        });
        continue;
      }

      const validation = ToolParser.validateToolParameters(
        parseResult.toolType,
        parseResult.parameters
      );

      if (!validation.valid) {
        validationErrors.push(...validation.errors);
        results.push({
          success: false,
          toolType: parseResult.toolType,
          parameters: parseResult.parameters,
          error: `参数验证失败: ${validation.errors.join(', ')}`,
          retryCount: 0
        });
        continue;
      }

      const executionResult = await this.executeWithRetry(
        parseResult.toolType,
        parseResult.parameters,
        context,
        this.MAX_RETRIES
      );

      results.push(executionResult);
    }

    return { results, validationErrors };
  }

  static async executeToolsInParallel(
    aiResponse: string,
    context: ToolExecutionContext,
    options: ToolParseOptions = {}
  ): Promise<ToolExecutionResult[]> {
    const parseResults = ToolParser.parseToolDirective(aiResponse, options);
    
    const promises = parseResults.map(parseResult =>
      this.executeWithRetry(
        parseResult.toolType || 'UNKNOWN',
        parseResult.parameters || {},
        context,
        this.MAX_RETRIES
      )
    );

    return Promise.all(promises);
  }
}
