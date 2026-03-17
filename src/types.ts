/**
 * 核心类型定义文件
 * 
 * 定义了整个扩展中使用的基础数据类型和接口，包括：
 * - 聊天消息类型（兼容 OpenAI 格式）
 * - API 消息类型（支持多模态）
 * - 聊天会话类型
 * - Python 解释器信息
 * - 搜索结果类型
 * - 编辑描述类型
 * 
 * @module types
 */

/**
 * 聊天消息接口
 * 
 * 定义了聊天系统中的基本消息结构，兼容 OpenAI Chat API 格式。
 * 用于在用户、助手和系统之间传递消息。
 * 
 * @interface ChatMessage
 */
export interface ChatMessage {
  /**
   * 消息角色
   * - 'user': 用户发送的消息
   * - 'assistant': AI 助手返回的消息
   * - 'system': 系统提示消息，用于设置 AI 的行为和上下文
   */
  role: 'user' | 'assistant' | 'system';
  
  /**
   * 消息内容
   * 可以是纯文本或包含格式化的内容
   */
  content: string;
}

/**
 * 聊天历史类型
 * 
 * 表示一个完整的对话历史，由多条 ChatMessage 组成。
 * 用于维护会话上下文，支持多轮对话。
 * 
 * @type ChatHistory
 */
export type ChatHistory = ChatMessage[];

/**
 * API 层消息内容类型
 * 
 * 支持多模态内容，可以是：
 * - 纯文本字符串
 * - 包含文本和图像的内容数组
 * 
 * 用于与支持多模态的 AI 模型（如 GPT-4 Vision）交互。
 * 
 * @type APIMessageContent
 */
export type APIMessageContent = string | Array<{ 
  type: string;           // 内容类型：'text' 或 'image_url'
  text?: string;          // 文本内容（当 type 为 'text' 时）
  image_url?: { url: string }; // 图像 URL（当 type 为 'image_url' 时）
}>;

/**
 * API 层消息接口
 * 
 * 定义了与 AI 模型 API 交互时使用的消息格式。
 * 相比 ChatMessage，支持更丰富的内容类型（如多模态）。
 * 
 * @interface APIMessage
 */
export interface APIMessage {
  /**
   * 消息角色
   * 可以是 'user'、'assistant'、'system' 或其他 API 支持的角色
   */
  role: string;
  
  /**
   * 消息内容
   * 支持文本或多模态内容（文本+图像）
   */
  content: APIMessageContent;
}

/**
 * 聊天会话接口
 * 
 * 表示一个完整的聊天会话，包含会话元数据和消息历史。
 * 用于会话持久化和恢复。
 * 
 * @interface ChatSession
 */
export interface ChatSession {
  /**
   * 会话唯一标识符
   * 使用 UUID 格式，确保全局唯一
   */
  id: string;
  
  /**
   * 会话创建时间戳
   * 使用 Unix 时间戳（毫秒）
   */
  timestamp: number;
  
  /**
   * 会话中的所有消息
   * 按时间顺序排列的对话历史
   */
  messages: { role: string; content: string }[];
  
  /**
   * 会话预览文本
   * 用于在会话列表中显示，通常是最后一条用户消息的摘要
   */
  preview: string;
}

/**
 * Python 解释器信息接口
 * 
 * 用于描述 Python 环境的配置和状态。
 * 支持虚拟环境检测和管理。
 * 
 * @interface PythonInterpreterInfo
 */
export interface PythonInterpreterInfo {
  /**
   * Python 解释器可执行文件路径
   * 例如：'/usr/bin/python3' 或 'C:\\Python39\\python.exe'
   */
  path: string;
  
  /**
   * Python 版本号
   * 例如：'3.9.7'，可选字段
   */
  version?: string;
  
  /**
   * 是否为虚拟环境
   * 标识当前 Python 环境是否在虚拟环境中运行
   */
  isVirtualEnv?: boolean;
  
  /**
   * 虚拟环境路径
   * 如果是虚拟环境，记录虚拟环境的根目录
   */
  virtualEnvPath?: string;
}

/**
 * 搜索结果接口
 * 
 * 表示网络搜索返回的单条结果。
 * 用于集成网络搜索功能，提供实时信息获取。
 * 
 * @interface SearchResult
 */
export interface SearchResult {
  /**
   * 搜索结果标题
   * 网页或文档的标题
   */
  title: string;
  
  /**
   * 搜索结果 URL
   * 完整的网页链接
   */
  url: string;
  
  /**
   * 搜索结果摘要
   * 网页内容的简短描述，帮助用户判断相关性
   */
  snippet: string;
}

/**
 * 编辑描述接口
 * 
 * 用于描述代码编辑的位置和范围。
 * 支持多种编辑方式：基于行号或基于字符位置。
 * 
 * @interface EditDescription
 */
export interface EditDescription {
  /**
   * 起始行号（从 1 开始）
   * 可选，用于基于行的编辑
   */
  startLine?: number;   
  
  /**
   * 结束行号（从 1 开始）
   * 可选，用于基于行的编辑
   */
  endLine?: number;     
  
  /**
   * 起始字符位置（从 0 开始）
   * 可选，用于基于字符位置的精确编辑
   */
  start?: number;       
  
  /**
   * 结束字符位置（从 0 开始）
   * 可选，用于基于字符位置的精确编辑
   */
  end?: number;        
}