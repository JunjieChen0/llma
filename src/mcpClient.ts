/**
 * MCP (Model Context Protocol) 客户端模块
 * 
 * 提供与 MCP 服务器交互的功能，包括：
 * - 服务器连接：连接到多个 MCP 服务器
 * - 工具调用：调用 MCP 服务器提供的工具
 * - 资源访问：访问 MCP 服务器提供的资源
 * - 连接管理：管理服务器连接的生命周期
 * - 错误处理：处理连接和调用错误
 * 
 * MCP 是一个标准协议，允许 AI 模型访问外部工具和数据源。
 * 
 * 主要功能：
 * - 支持多个 MCP 服务器同时连接
 * - 动态加载和管理服务器
 * - 提供统一的工具调用接口
 * - 自动处理环境变量和参数
 * 
 * @module mcpClient
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as vscode from 'vscode';

/**
 * MCP 服务器配置接口
 * 
 * 定义 MCP 服务器的配置参数。
 * 
 * @interface MCPServerConfig
 */
export interface MCPServerConfig {
  /**
   * 服务器名称
   * 用于标识和引用此服务器
   */
  name: string;
  
  /**
   * 启动命令
   * 用于启动 MCP 服务器进程的命令
   */
  command: string;
  
  /**
   * 命令参数
   * 传递给启动命令的参数列表
   */
  args: string[];
  
  /**
   * 环境变量
   * 可选，传递给服务器进程的环境变量
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * MCP 管理器类
 * 
 * 管理所有 MCP 服务器的连接和交互。
 * 
 * @class MCPManager
 */
export class MCPManager {
  /**
   * 客户端映射
   * 存储服务器名称到客户端实例的映射
   */
  private clients: Map<string, Client> = new Map();

  /**
   * 初始化所有配置的 MCP 服务器
   * 
   * 遍历服务器配置列表，为每个服务器创建连接。
   * 
   * 功能：
   * - 处理环境变量，确保所有值都是字符串
   * - 创建 StdioClientTransport 实例
   * - 创建 Client 实例并连接
   * - 存储客户端实例以供后续使用
   * - 处理连接错误并显示错误消息
   * 
   * @param servers - MCP 服务器配置数组
   * 
   * @example
   * ```typescript
   * const servers = [
   *   {
   *     name: 'filesystem',
   *     command: 'npx',
   *     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files']
   *   }
   * ];
   * await mcpManager.initializeServers(servers);
   * ```
   */
  async initializeServers(servers: MCPServerConfig[]) {
    for (const server of servers) {
      try {
        // 处理环境变量，确保所有值都是字符串
        const env: Record<string, string> = {};
        if (server.env) {
          for (const [key, value] of Object.entries(server.env)) {
            if (value !== undefined) {
              env[key] = value;
            }
          }
        }

        // 创建传输层
        const transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: env // 类型安全
        });
        
        // 创建客户端
        const client = new Client(
          {
            name: 'llma-mcp-client',
            version: '1.0.0'
          },
          {
            capabilities: {}
          }
        );
        
        // 连接到服务器
        await client.connect(transport);
        this.clients.set(server.name, client);
        console.log(`✅ MCP server connected: ${server.name}`);
      } catch (err: any) {
        vscode.window.showErrorMessage(`❌ Failed to connect MCP server ${server.name}: ${err.message}`);
      }
    }
  }

  /**
   * 调用指定 MCP 服务器的工具
   */
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server "${serverName}" not found or not connected`);
    }
    // 使用 SDK 提供的 callTool 方法
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    return result;
  }

  /**
   * 关闭所有连接
   */
  async disposeAll() {
    for (const client of this.clients.values()) {
      try {
        await client.close();
      } catch (err) {
        console.error('Error closing MCP client', err);
      }
    }
    this.clients.clear();
  }
}