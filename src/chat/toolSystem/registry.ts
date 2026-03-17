// src/chat/toolSystem/registry.ts
import { Tool, ToolRegistry, ToolSystemConfig, ToolDefinition } from './base';

export class ToolRegistryImpl implements ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<ToolDefinition['category'], Set<string>> = new Map();
  private config: ToolSystemConfig;

  constructor(config: Partial<ToolSystemConfig> = {}) {
    this.config = {
      enableValidation: true,
      enableAutoRetry: true,
      maxRetries: 3,
      retryDelay: 500,
      enableHooks: true,
      enableLogging: true,
      ...config
    };

    for (const category of ['file', 'editor', 'system', 'search', 'mcp', 'custom'] as const) {
      this.categories.set(category, new Set());
    }
  }

  register(tool: Tool): void {
    const name = tool.definition.name.toUpperCase();
    
    if (this.tools.has(name)) {
      console.warn(`工具 ${name} 已存在，将被覆盖`);
    }

    this.tools.set(name, tool);
    const categorySet = this.categories.get(tool.definition.category);
    if (categorySet) {
      categorySet.add(name);
    }

    if (this.config.enableLogging) {
      console.log(`[ToolRegistry] 注册工具: ${name} (${tool.definition.category})`);
    }
  }

  unregister(name: string): boolean {
    const upperName = name.toUpperCase();
    const tool = this.tools.get(upperName);
    
    if (!tool) {
      return false;
    }

    const categorySet = this.categories.get(tool.definition.category);
    if (categorySet) {
      categorySet.delete(upperName);
    }

    this.tools.delete(upperName);
    
    if (this.config.enableLogging) {
      console.log(`[ToolRegistry] 注销工具: ${upperName}`);
    }
    
    return true;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name.toUpperCase());
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolDefinition['category']): Tool[] {
    const categorySet = this.categories.get(category);
    if (!categorySet) {
      return [];
    }
    
    return Array.from(categorySet)
      .map(name => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  has(name: string): boolean {
    return this.tools.has(name.toUpperCase());
  }

  getConfig(): ToolSystemConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ToolSystemConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  clear(): void {
    this.tools.clear();
    for (const categorySet of this.categories.values()) {
      categorySet.clear();
    }
  }
}

export const globalToolRegistry = new ToolRegistryImpl();

export function registerTool(tool: Tool): void {
  globalToolRegistry.register(tool);
}

export function getTool(name: string): Tool | undefined {
  return globalToolRegistry.get(name);
}

export function getAllTools(): Tool[] {
  return globalToolRegistry.getAll();
}

export function getToolsByCategory(category: ToolDefinition['category']): Tool[] {
  return globalToolRegistry.getByCategory(category);
}
