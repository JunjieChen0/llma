/**
 * 统一工具系统 - 入口
 * 注册所有工具，供 ToolExecutor 使用
 */
import { toolRegistry } from './registry';
import { allTools } from './tools';

export * from './types';
export * from './registry';

/** 初始化并注册所有内置工具 */
export function registerAllTools(): void {
  for (const tool of allTools) {
    toolRegistry.register(tool);
  }
}
