// src/chat/toolSystem/base.ts
import * as vscode from 'vscode';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: any;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    allowedValues?: any[];
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'file' | 'editor' | 'system' | 'search' | 'mcp' | 'custom';
  parameters: ToolParameter[];
  dangerLevel: 'safe' | 'warning' | 'dangerous';
  requiresConfirmation?: boolean;
  examples?: string[];
}

export interface ToolExecutionContext {
  provider: LLMAChatProvider;
  history: any[];
  config: vscode.WorkspaceConfiguration;
  abortSignal?: AbortSignal;
  sessionId?: string;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface Tool {
  readonly definition: ToolDefinition;
  execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>;
  validate?(params: Record<string, any>): { valid: boolean; errors: string[] };
  beforeExecute?(params: Record<string, any>, context: ToolExecutionContext): Promise<void>;
  afterExecute?(result: ToolResult, context: ToolExecutionContext): Promise<void>;
  onError?(error: Error, context: ToolExecutionContext): Promise<void>;
}

export interface LLMAChatProvider {
  postMessageToWebview(message: any): void;
  currentSessionHistory: any[];
  workspaceRoot: string;
  pendingReadContext: { role: string; content: string }[];
}

export abstract class BaseTool implements Tool {
  abstract definition: ToolDefinition;

  abstract execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>;

  validate(params: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of this.definition.parameters) {
      if (param.required && !(param.name in params)) {
        errors.push(`缺少必需参数: ${param.name}`);
        continue;
      }

      if (param.name in params) {
        const value = params[param.name];
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (actualType !== param.type && param.type !== 'object') {
          errors.push(`参数 ${param.name} 类型错误: 期望 ${param.type}, 实际 ${actualType}`);
        }

        if (param.validation) {
          if (param.validation.pattern && typeof value === 'string') {
            const regex = new RegExp(param.validation.pattern);
            if (!regex.test(value)) {
              errors.push(`参数 ${param.name} 不符合格式要求`);
            }
          }

          if (param.validation.allowedValues && !param.validation.allowedValues.includes(value)) {
            errors.push(`参数 ${param.name} 值不在允许范围内`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async beforeExecute(params: Record<string, any>, context: ToolExecutionContext): Promise<void> {
    const validation = this.validate(params);
    if (!validation.valid) {
      throw new Error(`参数验证失败: ${validation.errors.join(', ')}`);
    }
  }

  async afterExecute(result: ToolResult, context: ToolExecutionContext): Promise<void> {
  }

  async onError(error: Error, context: ToolExecutionContext): Promise<void> {
    context.provider.postMessageToWebview({
      type: 'addErrorResponse',
      text: `工具执行错误: ${error.message}`
    });
  }
}

export interface ToolRegistry {
  register(tool: Tool): void;
  unregister(name: string): boolean;
  get(name: string): Tool | undefined;
  getAll(): Tool[];
  getByCategory(category: ToolDefinition['category']): Tool[];
  has(name: string): boolean;
}

export interface ToolSystemConfig {
  enableValidation: boolean;
  enableAutoRetry: boolean;
  maxRetries: number;
  retryDelay: number;
  enableHooks: boolean;
  enableLogging: boolean;
}
