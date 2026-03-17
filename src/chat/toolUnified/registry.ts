/**
 * 统一工具系统 - 注册表
 */
import type { ITool } from './types';

class ToolRegistryImpl {
  private tools = new Map<string, ITool>();

  register(tool: ITool): void {
    const name = tool.definition.name.toUpperCase();
    this.tools.set(name, tool);
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name.toUpperCase());
  }

  has(name: string): boolean {
    return this.tools.has(name.toUpperCase());
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

export const toolRegistry = new ToolRegistryImpl();
