/**
 * API 调用核心模块
 * 
 * 提供与各种 AI 模型 API 交互的核心功能，包括：
 * - 多模型支持：DeepSeek、Qwen、Doubao、Zhipu、HuggingFace、OpenAI、Kimi、自定义模型、本地模型
 * - 流式响应：支持流式输出和实时更新
 * - 多模态支持：处理文本和图像输入
 * - 重试机制：自动重试失败的请求
 * - 代理支持：支持 HTTP/HTTPS 代理
 * - 超时控制：可配置的请求超时时间
 * 
 * 主要功能：
 * - 统一的 API 调用接口
 * - 支持多种 AI 提供商
 * - 流式和非流式响应
 * - 错误处理和重试
 * - 多模态内容处理
 * 
 * @module api
 */

import * as vscode from 'vscode';
import axios from 'axios';
import OpenAI from 'openai';
import { getProxyAgent, axiosPostWithRetry } from './utils';
import { isMultimodalModel } from './config';
import type { APIMessage } from './types';
import { TIMEOUT } from './constants';

/**
 * 简单 AI 调用函数
 * 
 * 提供简化的 API 调用接口，只需要系统提示词和用户提示词。
 * 
 * @param model - 模型名称
 * @param apiKey - API 密钥
 * @param systemPrompt - 系统提示词
 * @param userPrompt - 用户提示词
 * @param maxTokens - 最大 token 数
 * @param temperature - 温度参数
 * @param config - VS Code 工作区配置
 * @param signal - 可选，中止信号
 * @returns Promise，解析为 AI 响应文本
 * 
 * @example
 * ```typescript
 * const response = await callSimpleAI(
 *   'deepseek-coder',
 *   apiKey,
 *   'You are a helpful assistant.',
 *   'Hello, how are you?',
 *   2000,
 *   0.7,
 *   config
 * );
 * ```
 */
export async function callSimpleAI(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  config: vscode.WorkspaceConfiguration,
  signal?: AbortSignal
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  return await callChatAI(model, apiKey, messages, config, maxTokens, temperature, signal);
}

/**
 * 聊天 AI 调用函数
 * 
 * 核心函数，支持流式和非流式响应，支持多模态输入。
 * 
 * @param model - 模型名称
 * @param apiKey - API 密钥
 * @param messages - 消息历史数组
 * @param config - VS Code 工作区配置
 * @param maxTokens - 最大 token 数，默认为 2000
 * @param temperature - 温度参数，默认为 0.7
 * @param signal - 可选，中止信号
 * @param onUpdate - 可选，流式更新回调函数
 * @returns Promise，解析为 AI 响应文本
 * 
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ];
 * 
 * // 非流式调用
 * const response = await callChatAI(model, apiKey, messages, config);
 * 
 * // 流式调用
 * await callChatAI(model, apiKey, messages, config, 2000, 0.7, undefined, (contentDelta, reasoningDelta) => {
 *   console.log('New content:', contentDelta);
 * });
 * ```
 */
export async function callChatAI(
  model: string,
  apiKey: string | undefined,
  messages: APIMessage[],
  config: vscode.WorkspaceConfiguration,
  maxTokens: number = 2000,
  temperature: number = 0.7,
  signal?: AbortSignal,
  onUpdate?: (contentDelta: string, reasoningDelta: string) => void
): Promise<string> {
  // 处理多模态：如果模型不支持多模态，过滤掉图像内容
  if (!isMultimodalModel(model, config)) {
    messages = messages.map(msg => {
      if (Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text);
        const text = textParts.join('\n') + (msg.content.some((item: any) => item.type === 'image_url') ? '\n[图片已忽略，当前模型不支持视觉]' : '');
        return { role: msg.role, content: text };
      }
      return msg;
    });
  }

  let url = '';
  const isStreaming = !!onUpdate;

  // 按模型限制 max_tokens，避免 API 返回 400
  const MODEL_MAX_OUTPUT: Record<string, number> = {
    'deepseek-coder': 4096,
    'deepseek-chat': 8192,
    'deepseek-reasoner': 8192,
    'moonshot-v1-8k': 4096,
    'moonshot-v1-32k': 8192,
    'moonshot-v1-128k': 8192,
    'glm-4': 4096,
    'glm-4-flash': 4096,
    'glm-4-plus': 4096,
    'qwen-coder-turbo': 8192,
    'qwen-turbo': 8192,
    'qwen-plus': 8192,
    'qwen-max': 8192,
  };

  function clampMaxTokens(requestedModel: string, requested: number): number {
    const limit = MODEL_MAX_OUTPUT[requestedModel];
    if (limit && requested > limit) {
      return limit;
    }
    return Math.min(requested, 8192);
  }

  const headers: any = {
    'Content-Type': 'application/json'
  };

  let actualModel = '';

  // 根据模型设置 URL 和 payload
  if (model === 'local') {
    const baseUrl = config.get<string>('localModel.baseUrl') || 'http://localhost:11434/v1';
    url = `${baseUrl}/chat/completions`;
    actualModel = config.get<string>('localModel.modelName') || 'llama3';
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  } else if (model === 'deepseek') {
    url = 'https://api.deepseek.com/chat/completions';
    actualModel = config.get<string>('deepseekModel') || 'deepseek-coder';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'qwen') {
    const baseUrl = config.get<string>('qwenBaseUrl') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    url = `${baseUrl}/chat/completions`;
    actualModel = config.get<string>('qwenModel') || 'qwen-coder-turbo';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'doubao') {
    url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    actualModel = config.get<string>('doubaoModel') || '';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'zhipu') {
    url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    actualModel = config.get<string>('zhipuModel') || 'glm-4';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'huggingface') {
    return callHuggingFace(apiKey, messages, config, maxTokens, temperature, signal, onUpdate);
  } else if (model === 'huggingface-space') {
    return callHuggingFaceSpace(apiKey, messages, config, maxTokens, temperature, signal, onUpdate);
  } else if (model === 'openai') {
    url = config.get<string>('openaiBaseUrl') || 'https://api.openai.com/v1';
    url = url.replace(/\/$/, '') + '/chat/completions';
    actualModel = config.get<string>('openaiModel') || 'gpt-4-turbo-preview';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'kimi') {
    const baseUrl = config.get<string>('kimiBaseUrl') || 'https://api.moonshot.cn/v1';
    url = `${baseUrl}/chat/completions`;
    actualModel = config.get<string>('kimiModel') || 'moonshot-v1-8k';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'custom') {
    const baseUrl = config.get<string>('customModel.apiBaseUrl') || 'http://127.0.0.1:8000';
    const endpoint = config.get<string>('customModel.chatEndpoint') || '/chat/completions';
    url = baseUrl.replace(/\/$/, '') + endpoint;
    actualModel = config.get<string>('customModel.modelName') || 'gpt-4';
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  const clampedMaxTokens = clampMaxTokens(actualModel, maxTokens);
  let payload: any = {
    model: actualModel,
    messages: messages,
    max_tokens: clampedMaxTokens,
    temperature: temperature,
    stream: isStreaming
  };

  // 公共的 axios 配置
  const proxyAgent = getProxyAgent(url);
  const axiosConfig: any = {
    headers,
    signal,
    timeout: TIMEOUT.API_DEFAULT,
    ...(proxyAgent && {
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      proxy: false
    })
  };

  // 非流式请求
  if (!isStreaming) {
    try {
      const response = await axiosPostWithRetry(url, payload, axiosConfig, 2);
      return response.data.choices[0]?.message?.content || '';
    } catch (error: any) {
      if (!axios.isCancel(error)) {
        if (model === 'kimi') {
          throw enhanceKimiError(error, actualModel);
        }
        throw error;
      }
      return '';
    }
  }

  // 流式请求
  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios.post(url, payload, {
        ...axiosConfig,
        responseType: 'stream'
      });

      let fullContent = '';
      let fullReasoning = '';
      let buffer = '';

      response.data.on('data', (chunk: any) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.substring(6);
            if (dataStr === '[DONE]') {
              continue;
            }

            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices?.[0]?.delta;

              if (delta) {
                const contentDelta = delta.content || '';
                const reasoningDelta = delta.reasoning_content || '';

                if (contentDelta || reasoningDelta) {
                  fullContent += contentDelta;
                  fullReasoning += reasoningDelta;
                  onUpdate?.(contentDelta, reasoningDelta);
                }
              }
            } catch (e) {
              // JSON parse error, ignore
            }
          }
        }
      });

      response.data.on('end', () => {
        resolve(fullContent);
      });

      response.data.on('error', (err: any) => {
        reject(err);
      });

    } catch (error: any) {
      if (!axios.isCancel(error)) {
        if (model === 'kimi') {
          reject(enhanceKimiError(error, actualModel));
        } else {
          reject(error);
        }
      } else {
        resolve('');
      }
    }
  });
}

// Hugging Face 专用调用
async function callHuggingFace(
  apiKey: string | undefined,
  messages: APIMessage[],
  config: vscode.WorkspaceConfiguration,
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal,
  onUpdate?: (contentDelta: string, reasoningDelta: string) => void
): Promise<string> {
  const baseURL = 'https://router.huggingface.co/v1';
  const modelName = config.get<string>('huggingfaceModel') || 'meta-llama/Meta-Llama-3-8B-Instruct';
  const proxyAgent = getProxyAgent(baseURL);
  const clientOptions: any = {
    baseURL,
    apiKey: apiKey,
    timeout: TIMEOUT.API_DEFAULT,
  };
  if (proxyAgent) {
    clientOptions.httpsAgent = proxyAgent;
  }
  const client = new OpenAI(clientOptions);

  try {
    if (!onUpdate) {
      const completion = await client.chat.completions.create({
        model: modelName,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }, { signal });
      return completion.choices[0]?.message?.content || '';
    } else {
      return new Promise(async (resolve, reject) => {
        try {
          const stream = await client.chat.completions.create({
            model: modelName,
            messages: messages as OpenAI.ChatCompletionMessageParam[],
            max_tokens: maxTokens,
            temperature,
            stream: true,
          }, { signal });

          let fullContent = '';
          let fullReasoning = '';

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta) {
              const contentDelta = delta.content || '';
              const reasoningDelta = (delta as any).reasoning_content || '';
              if (contentDelta || reasoningDelta) {
                fullContent += contentDelta;
                fullReasoning += reasoningDelta;
                onUpdate(contentDelta, reasoningDelta);
              }
            }
          }
          resolve(fullContent);
        } catch (error: any) {
          if (axios.isCancel(error) || error.name === 'CanceledError' || error.message === 'canceled') {
            resolve('');
          } else {
            reject(enhanceHuggingFaceError(error, modelName));
          }
        }
      });
    }
  } catch (error: any) {
    if (axios.isCancel(error) || error.name === 'CanceledError' || error.message === 'canceled') {
      return '';
    }
    throw enhanceHuggingFaceError(error, modelName);
  }
}

// Hugging Face Space 专用调用
async function callHuggingFaceSpace(
  apiKey: string | undefined,
  messages: APIMessage[],
  config: vscode.WorkspaceConfiguration,
  maxTokens: number,
  temperature: number,
  signal?: AbortSignal,
  onUpdate?: (contentDelta: string, reasoningDelta: string) => void
): Promise<string> {
  const baseUrl = config.get<string>('huggingfaceSpaceBaseUrl');
  if (!baseUrl) {
    throw new Error('请配置 Hugging Face Space 的 Base URL');
  }
  const modelName = config.get<string>('huggingfaceSpaceModel') || 'rag-agent';
  
  let useStream = !!onUpdate;
  const configuredStream = config.get<boolean>('stream');
  if (configuredStream !== undefined) {
    useStream = configuredStream;
  }

  console.log(`[HuggingFace] 流式模式: ${useStream ? '开启' : '关闭'} (由 ${configuredStream !== undefined ? '用户配置' : 'onUpdate 回调'} 决定)`);

  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';

  const requestHeaders: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey || 'dummy'}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': useStream ? 'text/event-stream' : 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Connection': 'keep-alive'
  };

  const requestPayload: any = {
    model: modelName,
    messages: messages,
    stream: useStream
  };

  const proxyAgent = getProxyAgent(url);
  const axiosConfig: any = {
    headers: requestHeaders,
    signal,
    timeout: TIMEOUT.API_DEFAULT,
    ...(useStream && { responseType: 'stream' }),
    ...(proxyAgent && {
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      proxy: false
    })
  };

  try {
    const response = await axios.post(url, requestPayload, axiosConfig);

    if (useStream) {
      return new Promise((resolve, reject) => {
        let fullContent = '';
        let buffer = '';
        let updateCount = 0;

        function parseEvents(data: string): { events: string[], rest: string } {
          const events: string[] = [];
          let remaining = data;
          const separator = '\n\n';
          let idx;
          while ((idx = remaining.indexOf(separator)) !== -1) {
            const eventBlock = remaining.substring(0, idx).trim();
            remaining = remaining.substring(idx + separator.length);
            if (eventBlock) {
              events.push(eventBlock);
            }
          }
          return { events, rest: remaining };
        }

        const onData = (chunk: Buffer | string) => {
          const chunkStr = chunk.toString('utf8');
          buffer += chunkStr;

          const { events, rest } = parseEvents(buffer);
          buffer = rest;

          for (const eventBlock of events) {
            const lines = eventBlock.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) { continue; }
              if (trimmed.startsWith('data:')) {
                const dataValue = trimmed.substring(5).trim();
                if (dataValue === '[DONE]') {
                  continue;
                }
                try {
                  const parsed = JSON.parse(dataValue);
                  const delta = parsed.choices?.[0]?.delta;
                  const content = delta?.content || '';
                  if (content) {
                    fullContent += content;
                    updateCount++;
                    if (onUpdate) {
                      onUpdate(content, '');
                    }
                  }
                } catch (e) {
                  console.error('❌ JSON 解析失败:', e);
                }
              }
            }
          }
        };

        const onEnd = () => {
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) { continue; }
              if (trimmed.startsWith('data:')) {
                const dataValue = trimmed.substring(5).trim();
                if (dataValue && dataValue !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(dataValue);
                    const delta = parsed.choices?.[0]?.delta;
                    const content = delta?.content || '';
                    if (content) {
                      fullContent += content;
                      updateCount++;
                      if (onUpdate) {
                        onUpdate(content, '');
                      }
                    }
                  } catch (e) {}
                }
              }
            }
          }
          resolve(fullContent);
        };

        const onError = (err: any) => {
          reject(err);
        };

        if (response.data.on) {
          response.data.on('data', onData);
          response.data.on('end', onEnd);
          response.data.on('error', onError);
        } else {
          reject(new Error('不支持的响应流类型'));
        }

        if (signal) {
          const abortHandler = () => {
            if (response.data.destroy) { response.data.destroy(); }
            reject(new Error('Request aborted'));
          };
          signal.addEventListener('abort', abortHandler);
        }
      });
    } else {
      const content = response.data.choices[0]?.message?.content || '';
      if (onUpdate) {
        onUpdate(content, '');
      }
      return content;
    }
  } catch (error: any) {
    if (axios.isCancel(error)) {
      return '';
    }
    throw enhanceHuggingFaceSpaceError(error);
  }
}

// 错误增强函数
function enhanceHuggingFaceError(error: any, modelName: string): Error {
  const response = error.response;
  if (response) {
    const status = response.status;
    const data = response.data;
    let message = '';
    switch (status) {
      case 401:
        message = `Hugging Face API Key 无效，请在设置中检查并重新填写。`;
        break;
      case 403:
        message = `Hugging Face 访问被拒绝，请确认 API Key 权限（至少需要 read 权限）。`;
        break;
      case 404:
        message = `模型 "${modelName}" 不存在，请确认模型 ID 是否正确。`;
        break;
      case 429:
        message = `请求过于频繁，已达到 Hugging Face 限流，请稍后再试。`;
        break;
      case 503:
        message = `模型 "${modelName}" 当前不可用，可能正在加载或已下线。`;
        break;
      case 400:
        const errorMsg = data?.error || error.message;
        if (errorMsg.includes('not supported by any provider')) {
          message = `模型 "${modelName}" 当前不被 Hugging Face Router API 支持，请确认模型 ID 是否正确，或尝试使用其他模型。您可以在 Hugging Face 官网查看该模型是否支持 Inference API。`;
        } else {
          message = `Hugging Face API 错误 (400): ${errorMsg}`;
        }
        break;
      default:
        message = `Hugging Face API 错误 (${status}): ${data?.error || error.message}`;
    }
    return new Error(message);
  } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    return new Error(`Hugging Face 请求超时，请检查网络连接或代理设置。`);
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return new Error(`无法连接到 Hugging Face 服务，请检查网络或代理。`);
  } else {
    return new Error(`Hugging Face 请求异常: ${error.message}`);
  }
}

function enhanceHuggingFaceSpaceError(error: any): Error {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    let detail = '';

    if (typeof data === 'string') {
      detail = data;
    } else if (data && data.error) {
      try {
        detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
      } catch {
        detail = '[无法序列化的 error 详情]';
      }
    } else {
      try {
        detail = JSON.stringify(data);
      } catch {
        detail = '[无法序列化的响应数据]';
      }
    }
    return new Error(`Hugging Face Space 请求失败 (HTTP ${status}): ${detail}`);
  } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return new Error('Hugging Face Space 请求超时，请检查网络或服务状态');
  } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return new Error('无法连接到 Hugging Face Space，请检查 URL 或网络');
  } else {
    return new Error(`Hugging Face Space 请求异常: ${error.message}`);
  }
}

/** Kimi/月之暗面 API 错误增强，解析并展示具体错误信息 */
function enhanceKimiError(error: any, modelName: string): Error {
  const response = error.response;
  if (response) {
    const status = response.status;
    let data = response.data;
    if (Buffer.isBuffer(data)) {
      try {
        data = JSON.parse(data.toString('utf8'));
      } catch {
        data = { error: data.toString('utf8') };
      }
    }
    const errObj = data?.error;
    const apiMsg = typeof errObj === 'string' ? errObj : (errObj?.message || errObj?.msg);
    const detail = apiMsg || (typeof data === 'string' ? data : (data ? JSON.stringify(data) : '')) || error.message;

    switch (status) {
      case 400:
        if (detail.includes('model') || detail.includes('模型')) {
          return new Error(`Kimi 模型 "${modelName}" 可能已停用或名称有误，请检查设置中的模型名称。当前支持：moonshot-v1-8k、moonshot-v1-32k、moonshot-v1-128k 等。`);
        }
        if (detail.includes('max_tokens') || detail.includes('token')) {
          return new Error(`Kimi 请求参数错误：${detail}\n提示：可尝试减少 max_tokens 或检查输入长度。`);
        }
        return new Error(`Kimi API 请求错误 (400): ${detail}`);
      case 401:
        return new Error(`Kimi API Key 无效或已过期，请在设置中检查并重新填写。`);
      case 403:
        if (detail.includes('quota') || detail.includes('余额') || detail.includes('额度')) {
          return new Error(`Kimi 账户额度不足，请检查月之暗面控制台余额。`);
        }
        return new Error(`Kimi 访问被拒绝 (403): ${detail}`);
      case 429:
        return new Error(`Kimi 请求过于频繁，请稍后再试。`);
      default:
        return new Error(`Kimi API 错误 (${status}): ${detail}`);
    }
  }
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return new Error(`Kimi 请求超时，请检查网络或代理设置。`);
  }
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return new Error(`无法连接到 Kimi 服务，请检查网络或代理。`);
  }
  return new Error(`Kimi 请求异常: ${error.message}`);
}