/**
 * LangChain 集成模块
 * 
 * 提供 AI 辅助功能，包括：
 * - 代码解释：解释代码的功能和逻辑
 * - 代码审查：分析代码质量、潜在问题和最佳实践
 * - 测试生成：为代码生成测试用例
 * - 提交消息生成：为 Git 提交生成规范的提交消息
 * - 代码助手：通用的代码生成和修改功能
 * 
 * 主要功能：
 * - 集成多种 AI 模型（DeepSeek、Qwen、OpenAI 等）
 * - 提供多种 AI 辅助功能
 * - 支持多模态输入（文本+图像）
 * - 使用单例模式管理配置
 * 
 * @module langchain/index
 */

import * as vscode from 'vscode';

/**
 * LangChain 配置接口
 * 
 * 定义 LangChain 管理器的配置参数。
 * 
 * @interface LangChainConfig
 */
export interface LangChainConfig {
  /**
   * API 密钥
   */
  apiKey: string;
  
  /**
   * API 基础 URL
   * 可选，用于自定义 API 端点
   */
  baseUrl?: string;
  
  /**
   * 模型名称
   * 如 'gpt-4-turbo-preview', 'deepseek-coder' 等
   */
  modelName: string;
  
  /**
   * 温度参数
   * 控制输出的随机性，0.0-1.0 之间
   */
  temperature?: number;
  
  /**
   * 最大 token 数
   * 限制生成内容的长度
   */
  maxTokens?: number;
}

/**
 * LangChain 管理器类
 * 
 * 提供各种 AI 辅助功能，使用单例模式。
 * 
 * @class LangChainManager
 */
export class LangChainManager {
  /**
   * 单例实例
   */
  private static instance: LangChainManager | null = null;
  
  /**
   * 配置对象
   */
  private config: LangChainConfig;

  /**
   * 私有构造函数
   * 
   * @param config - LangChain 配置
   */
  private constructor(config: LangChainConfig) {
    this.config = config;
  }

  /**
   * 获取单例实例
   * 
   * @param config - LangChain 配置（首次创建时需要）
   * @returns LangChain 管理器单例
   */
  static getInstance(config?: LangChainConfig): LangChainManager {
    if (!LangChainManager.instance && config) {
      LangChainManager.instance = new LangChainManager(config);
    }
    return LangChainManager.instance!;
  }

  /**
   * 重置单例实例
   */
  static resetInstance(): void {
    LangChainManager.instance = null;
  }

  updateConfig(config: Partial<LangChainConfig>): void {
    this.config = { ...this.config, ...config };
  }

  async simpleChat(
    systemPrompt: string,
    userMessage: string,
    context?: string
  ): Promise<string> {
    const prompt = [
      systemPrompt,
      context ? `\nContext:\n${context}` : '',
      `\nUser: ${userMessage}`,
    ].join('');

    return await this.callModel(prompt);
  }

  private async callModel(prompt: string): Promise<string> {
    try {
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
          baseUrl = 'https://api.openai.com/v1';
          break;
        case 'custom':
          apiKey = config.get<string>('customModel.apiKey') || '';
          baseUrl = config.get<string>('customModel.apiBaseUrl') || '';
          modelName = config.get<string>('customModel.modelName') || '';
          break;
        default:
          apiKey = this.config.apiKey;
          baseUrl = this.config.baseUrl || '';
          modelName = this.config.modelName;
      }

      if (!apiKey) {
        throw new Error('API key not configured');
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data: any = await response.json();
      return data.choices?.[0]?.message?.content || 'No response';
    } catch (error) {
      console.error('LangChain call failed:', error);
      throw error;
    }
  }

  async codeAssistant(
    userQuery: string,
    codeContext: string,
    fileType: string
  ): Promise<string> {
    const systemPrompt = `You are an expert code assistant. You help with:
- Writing clean, efficient, and well-documented code
- Debugging and fixing issues
- Refactoring and improving code quality
- Explaining code concepts
- Following best practices for ${fileType}

Always provide clear explanations with your code changes.`;

    return await this.simpleChat(systemPrompt, userQuery, codeContext);
  }

  async generateCommitMessage(
    diff: string,
    commitType: 'feat' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore' = 'feat'
  ): Promise<string> {
    const systemPrompt = `You are a Git commit message expert. Generate a concise, meaningful commit message following conventional commits format.

Format: <type>(<scope>): <description>

Types: feat, fix, refactor, docs, test, chore

Keep the description under 50 characters. Provide only the commit message, no extra text.`;

    const userMessage = `Generate a commit message for these changes:\n\n${diff}`;
    
    return await this.simpleChat(systemPrompt, userMessage);
  }

  async codeReview(
    code: string,
    fileType: string
  ): Promise<string> {
    const systemPrompt = `You are a senior code reviewer. Analyze the code and provide:
1. Potential bugs or issues
2. Performance concerns
3. Best practice violations
4. Security vulnerabilities (if any)
5. Suggestions for improvement

Be constructive and specific.`;

    const userMessage = `Review this ${fileType} code:\n\n${code}`;
    
    return await this.simpleChat(systemPrompt, userMessage);
  }

  async explainCode(
    code: string,
    fileType: string
  ): Promise<string> {
    const systemPrompt = `You are a code explainer. Explain what this code does in clear, simple terms. Include:
1. Overall purpose
2. Key functions/classes and what they do
3. Important algorithms or patterns used
4. Any notable edge cases handled`;

    const userMessage = `Explain this ${fileType} code:\n\n${code}`;
    
    return await this.simpleChat(systemPrompt, userMessage);
  }

  async generateTests(
    code: string,
    fileType: string,
    testFramework?: string
  ): Promise<string> {
    const framework = testFramework || this.getDefaultTestFramework(fileType);
    const systemPrompt = `You are a test generation expert. Write comprehensive tests for the provided code using ${framework}.

Include:
- Unit tests for main functionality
- Edge case tests
- Error handling tests
- Clear test descriptions`;

    const userMessage = `Generate tests for this ${fileType} code:\n\n${code}`;
    
    return await this.simpleChat(systemPrompt, userMessage);
  }

  private getDefaultTestFramework(fileType: string): string {
    const frameworkMap: Record<string, string> = {
      '.ts': 'Jest',
      '.tsx': 'Jest',
      '.js': 'Jest',
      '.jsx': 'Jest',
      '.py': 'pytest',
      '.java': 'JUnit',
      '.go': 'testing package',
      '.rs': 'built-in tests',
    };
    return frameworkMap[fileType] || 'appropriate testing framework';
  }
}

export function createLangChainManager(config: LangChainConfig): LangChainManager {
  return LangChainManager.getInstance(config);
}
