// src/chat/toolSystem/executor.ts
import * as vscode from 'vscode';
import { Tool, ToolResult, ToolExecutionContext, ToolRegistry, ToolSystemConfig } from './base';
import { logToolCall, logError, logInfo } from '../trace';

export class ToolExecutorV2 {
  private registry: ToolRegistry;
  private config: ToolSystemConfig;

  constructor(registry: ToolRegistry, config: Partial<ToolSystemConfig> = {}) {
    this.registry = registry;
    this.config = {
      enableValidation: true,
      enableAutoRetry: true,
      maxRetries: 3,
      retryDelay: 500,
      enableHooks: true,
      enableLogging: true,
      ...config
    };
  }

  async execute(
    toolName: string,
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const tool = this.registry.get(toolName);
    
    if (!tool) {
      return {
        success: false,
        error: `工具 ${toolName} 不存在`
      };
    }

    const startTime = Date.now();
    
    try {
      if (this.config.enableValidation && tool.validate) {
        const validation = tool.validate(params);
        if (!validation.valid) {
          return {
            success: false,
            error: `参数验证失败: ${validation.errors.join(', ')}`
          };
        }
      }

      if (this.config.enableHooks && tool.beforeExecute) {
        await tool.beforeExecute(params, context);
      }

      logInfo(context.sessionId || '', `执行工具: ${toolName}`, { params }, 0);

      const result = await tool.execute(params, context);

      if (this.config.enableHooks && tool.afterExecute) {
        await tool.afterExecute(result, context);
      }

      const duration = Date.now() - startTime;
      
      logToolCall(
        context.sessionId || '',
        toolName,
        result.success,
        result.output,
        0
      );

      if (this.config.enableLogging) {
        console.log(`[ToolExecutorV2] ${toolName} 执行完成 (${duration}ms): ${result.success ? '成功' : '失败'}`);
      }

      return result;

    } catch (error: any) {
      if (this.config.enableHooks && tool.onError) {
        await tool.onError(error, context);
      }

      logError(context.sessionId || '', error.message, { toolName, params }, 0);

      if (this.config.enableLogging) {
        console.error(`[ToolExecutorV2] ${toolName} 执行错误:`, error);
      }

      return {
        success: false,
        error: error.message || '未知错误'
      };
    }
  }

  async executeWithRetry(
    toolName: string,
    params: Record<string, any>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const result = await this.execute(toolName, params, context);
      
      if (result.success) {
        return result;
      }

      if (!this.config.enableAutoRetry || attempt >= this.config.maxRetries) {
        return result;
      }

      lastError = new Error(result.error);
      
      if (this.config.enableLogging) {
        console.log(`[ToolExecutorV2] ${toolName} 第 ${attempt + 1} 次尝试失败，${this.config.retryDelay}ms 后重试...`);
      }

      await this.delay(this.config.retryDelay * Math.pow(2, attempt));
    }

    return {
      success: false,
      error: lastError?.message || '重试次数耗尽'
    };
  }

  async executeBatch(
    commands: Array<{ toolName: string; params: Record<string, any> }>,
    context: ToolExecutionContext,
    options: { stopOnError?: boolean; parallel?: boolean } = {}
  ): Promise<ToolResult[]> {
    const { stopOnError = false, parallel = false } = options;
    const results: ToolResult[] = [];

    if (parallel) {
      const promises = commands.map(cmd => 
        this.executeWithRetry(cmd.toolName, cmd.params, context)
      );
      return await Promise.all(promises);
    }

    for (const cmd of commands) {
      const result = await this.executeWithRetry(cmd.toolName, cmd.params, context);
      results.push(result);

      if (stopOnError && !result.success) {
        break;
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }

  updateConfig(config: Partial<ToolSystemConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function createToolExecutor(
  registry: ToolRegistry,
  config?: Partial<ToolSystemConfig>
): ToolExecutorV2 {
  return new ToolExecutorV2(registry, config);
}
