/**
 * 网络搜索模块
 * 
 * 提供网络搜索功能，集成 SerpApi 服务，包括：
 * - 搜索查询：执行网络搜索并返回结果
 * - 查询优化：将自然语言问题提炼为搜索关键词
 * - 结果解析：解析搜索结果为标准格式
 * - 代理支持：支持 HTTP/HTTPS 代理
 * - 超时控制：可配置的搜索超时时间
 * - 时效性增强：自动附加当前日期以获取最新结果
 * 
 * 主要功能：
 * - 集成 SerpApi 提供网络搜索
 * - 支持多种搜索引擎（Google、Bing 等）
 * - 优化搜索查询以提高结果质量
 * - 格式化搜索结果以便 AI 理解
 * 
 * @module webSearch
 */

import axios, { AxiosRequestConfig } from 'axios';
import { getProxyAgent } from './utils';
import { SearchResult } from './types';
import { TIMEOUT } from './constants';

/**
 * SerpApi URL
 * 网络搜索的 API 端点
 */
const SERP_API_URL = 'https://serpapi.com/search.json';

/**
 * 最大搜索结果数
 * 限制返回的搜索结果数量，避免信息过载
 */
const MAX_RESULTS = 5;

/**
 * 构建 Axios 请求配置
 * 
 * 创建用于调用 SerpApi 的请求配置，包括：
 * - 查询参数：搜索关键词、引擎、API 密钥
 * - 语言和地区设置：中文、中国
 * - 超时设置：使用 WEB_SEARCH 超时常量
 * - 代理设置：如果配置了代理则使用
 * 
 * @param apiKey - SerpApi 密钥
 * @param query - 搜索查询字符串
 * @param engine - 搜索引擎，默认为 'google'
 * @returns Axios 请求配置对象
 */
function buildAxiosConfig(apiKey: string, query: string, engine: string): AxiosRequestConfig {
  // 获取代理代理
  const proxyAgent = getProxyAgent(SERP_API_URL);
  
  return {
    // 查询参数
    params: { 
      q: query,           // 搜索关键词
      engine,            // 搜索引擎
      api_key: apiKey,   // API 密钥
      hl: 'zh-cn',      // 界面语言：中文
      gl: 'cn'           // 地理位置：中国
    },
    
    // 超时设置
    timeout: TIMEOUT.WEB_SEARCH,
    
    // 代理设置（如果配置了代理）
    ...(proxyAgent && { httpAgent: proxyAgent, httpsAgent: proxyAgent, proxy: false }),
  };
}

/**
 * 解析搜索结果
 * 
 * 将 SerpApi 返回的原始数据解析为标准格式。
 * 
 * @param data - SerpApi 返回的原始数据
 * @returns 搜索结果数组
 */
function parseResults(data: any): SearchResult[] {
  // 提取自然搜索结果，限制数量
  return (data?.organic_results ?? [])
    .slice(0, MAX_RESULTS)
    .map((item: any) => ({
      title: item.title,           // 标题
      url: item.link,             // URL
      snippet: item.snippet || '无内容摘要',  // 摘要
    }));
}

/**
 * 提取搜索查询
 * 
 * 将自然语言问题提炼为搜索关键词，并附加当前日期以提升时效性。
 * 
 * 处理步骤：
 * 1. 去掉疑问词和语气词（？、！、。等）
 * 2. 去掉常见的查询前缀（请问、你知道、帮我查等）
 * 3. 截断过长的查询（最多 100 字符）
 * 4. 附加当前年月，让搜索引擎优先返回最新结果
 * 
 * @param text - 自然语言问题或查询
 * @returns 优化后的搜索查询字符串
 * 
 * @example
 * ```typescript
 * extractSearchQuery('请问现在 TypeScript 最新版本是多少？');
 * // 返回：'TypeScript 最新版本 2026年3月'
 * ```
 */
function extractSearchQuery(text: string): string {
  // 去掉疑问词、语气词
  let q = text
    .replace(/[？?！!。，,]/g, ' ')
    .replace(/^(请问|你知道|帮我查|查一下|搜索|告诉我|现在|目前)/g, '')
    .trim();
  
  // 截断过长查询
  if (q.length > 100) { q = q.substring(0, 100); }
  
  // 附加当前年月，让搜索引擎优先返回最新结果
  const now = new Date();
  const yearMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`;
  
  return `${q} ${yearMonth}`.trim();
}

/**
 * 执行网络搜索
 * 
 * 使用 SerpApi 执行网络搜索并返回结果。
 * 
 * @param query - 搜索查询字符串
 * @param apiKey - SerpApi 密钥
 * @param engine - 搜索引擎，默认为 'google'
 * @returns Promise，解析为搜索结果数组
 * 
 * @example
 * ```typescript
 * try {
 *   const results = await searchWeb(
 *     'TypeScript 最新版本',
 *     apiKey,
 *     'google'
 *   );
 *   console.log('Found', results.length, 'results');
 * } catch (error) {
 *   console.error('Search failed:', error);
 * }
 * ```
 */
export async function searchWeb(query: string, apiKey: string, engine = 'google'): Promise<SearchResult[]> {
  try {
    // 提取优化后的搜索查询
    const searchQuery = extractSearchQuery(query);
    
    // 调用 SerpApi
    const response = await axios.get(SERP_API_URL, buildAxiosConfig(apiKey, searchQuery, engine));
    
    // 解析并返回结果
    return parseResults(response.data);
  } catch (error: any) {
    throw new Error(`网络搜索失败: ${error.message}`);
  }
}

/**
 * 格式化搜索结果
 * 
 * 将搜索结果数组格式化为易读的文本，供 AI 理解。
 * 
 * @param results - 搜索结果数组
 * @returns 格式化后的字符串
 * 
 * @example
 * ```typescript
 * const results = [
 *   { title: 'TypeScript 5.0 Released', url: '...', snippet: '...' }
 * ];
 * const formatted = formatSearchResults(results);
 * // 输出：
 * // 🌐 网络搜索结果:
 * // 
 * // 1. **TypeScript 5.0 Released**
 * //    ...
 * //    来源: ...
 * ```
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) { return '未找到相关结果。'; }
  
  return '🌐 网络搜索结果:\n\n' + results
    .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   来源: ${r.url}`)
    .join('\n\n');
}
