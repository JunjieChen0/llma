/**
 * 配置工具文件
 * 
 * 提供扩展配置相关的工具函数，包括：
 * - 获取不同 AI 模型的 API 密钥
 * - 检测模型是否支持多模态（文本+图像）
 * 
 * 这些函数简化了配置访问逻辑，提供统一的配置接口。
 * 
 * @module config
 */

import * as vscode from 'vscode';

/**
 * 获取指定模型的 API 密钥
 * 
 * 根据当前选择的模型类型，从 VS Code 配置中获取对应的 API 密钥。
 * 支持多种 AI 提供商，包括：
 * - DeepSeek
 * - Qwen (通义千问）
 * - Doubao (豆包）
 * - Zhipu (智谱）
 * - OpenAI
 * - Hugging Face
 * - Kimi (月之暗面）
 * - Hugging Face Space
 * - 自定义模型
 * - 本地模型
 * 
 * @param config - VS Code 工作区配置对象
 * @param model - 模型标识符（如 'deepseek', 'openai' 等）
 * @returns API 密钥字符串，如果未配置则返回 undefined
 * 
 * @example
 * ```typescript
 * const config = vscode.workspace.getConfiguration('llma');
 * const apiKey = getApiKey(config, 'deepseek');
 * if (apiKey) {
 *   console.log('DeepSeek API key found');
 * }
 * ```
 */
export function getApiKey(config: vscode.WorkspaceConfiguration, model: string): string | undefined {
  // 本地模型不需要 API 密钥，返回特殊标识
  if (model === 'local') {
    return 'local';
  }
  
  // 根据模型类型从配置中获取对应的 API 密钥
  switch (model) {
    case 'deepseek': 
      return config.get<string>('deepseekApiKey');
    case 'qwen': 
      return config.get<string>('qwenApiKey');
    case 'doubao': 
      return config.get<string>('doubaoApiKey');
    case 'zhipu': 
      return config.get<string>('zhipuApiKey');
    case 'openai': 
      return config.get<string>('openaiApiKey');
    case 'huggingface': 
      return config.get<string>('huggingfaceApiKey');
    case 'kimi': 
      return config.get<string>('kimiApiKey');
    case 'huggingface-space': 
      return config.get<string>('huggingfaceSpaceApiKey');
    case 'custom': 
      return config.get<string>('customModel.apiKey');
    default: 
      return undefined;
  }
}

/**
 * 检测模型是否支持多模态（文本+图像）
 * 
 * 多模态模型可以同时处理文本和图像输入，用于：
 * - 代码截图理解
 * - 图像描述生成
 * - 视觉问答
 * 
 * 通过检查模型名称或配置中的多模态标志来判断。
 * 
 * @param model - 模型标识符
 * @param config - VS Code 工作区配置对象
 * @returns 如果模型支持多模态则返回 true，否则返回 false
 * 
 * @example
 * ```typescript
 * const config = vscode.workspace.getConfiguration('llma');
 * const isMultimodal = isMultimodalModel('openai', config);
 * if (isMultimodal) {
 *   console.log('This model supports images');
 * }
 * ```
 */
export function isMultimodalModel(model: string, config: vscode.WorkspaceConfiguration): boolean {
  switch (model) {
    case 'openai':
      // OpenAI 模型：检查模型名称是否包含 'vision' 或 'gpt-4'
      const openaiModel = config.get<string>('openaiModel', '');
      return openaiModel.includes('vision') || openaiModel.includes('gpt-4');
      
    case 'qwen':
      // Qwen 模型：检查模型名称是否包含 'vl' (Vision Language)
      const qwenModel = config.get<string>('qwenModel', '');
      return qwenModel.includes('vl');
      
    case 'huggingface':
      // Hugging Face 模型：检查模型名称是否包含 'llava' 或 'vision'
      const hfModel = config.get<string>('huggingfaceModel', '');
      return hfModel.includes('llava') || hfModel.includes('vision');
      
    case 'local':
      // 本地模型：检查配置中的多模态标志
      return config.get<boolean>('localModel.supportsMultimodal', false);
      
    case 'deepseek':
      // DeepSeek 模型：检查模型名称是否包含 'vl' 或 'vision'
      const dsModel = config.get<string>('deepseekModel', '');
      return dsModel.includes('vl') || dsModel.includes('vision');
      
    case 'custom':
      // 自定义模型：检查配置中的多模态标志
      return config.get<boolean>('customModel.supportsMultimodal', false);
      
    default:
      // 其他模型默认不支持多模态
      return false;
  }
}