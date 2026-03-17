/**
 * 统一工具系统 - 类型定义
 */
import * as vscode from 'vscode';
import type { ChatHistory } from '../../types';

/** Provider 最小接口，避免循环依赖 */
export interface ToolProvider {
  fileBackupMap: Map<string, string | null>;
  view?: vscode.WebviewView;
  workspaceRoot: string;
  postMessageToWebview(message: unknown): void;
}

/** 工具执行上下文 */
export interface ToolExecutionContext {
  provider: ToolProvider;
  history: ChatHistory;
  config: vscode.WorkspaceConfiguration;
  abortSignal?: AbortSignal;
}

/** 工具定义（用于注册和发现） */
export interface ToolDefinition {
  /** 工具类型名，如 FILE、RUN、REPLACE */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 schema（可选，用于验证和文档） */
  parameters?: Array<{ name: string; type: string; required?: boolean }>;
}

/** 统一工具接口 */
export interface ITool {
  readonly definition: ToolDefinition;
  execute(params: Record<string, unknown>, context: ToolExecutionContext): Promise<string>;
}
