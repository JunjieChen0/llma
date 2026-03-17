/**
 * AST（抽象语法树）分析模块导出文件
 * 
 * 导出 AST 分析相关的所有模块，包括：
 * - 类型定义：AST 节点、分析结果、符号信息等
 * - 基础分析器：所有分析器的基类和通用功能
 * - 语言分析器：TypeScript、Python、Java、Go、C++、仓颉等
 * - 注册表：全局 AST 分析器注册表
 * 
 * 主要功能：
 * - 支持多种编程语言的 AST 分析
 * - 提取代码结构、符号、依赖关系
 * - 提供代码导航和上下文理解
 * - 支持代码图构建和符号索引
 * 
 * @module ast/index
 */

// 导出 AST 类型定义
export * from './types';

// 导出基础分析器类
export * from './base';

// 导出各种语言的 AST 分析器
export * from './typescriptAnalyzer';
export * from './pythonAnalyzer';
export * from './javaAnalyzer';
export * from './goAnalyzer';
export * from './cppAnalyzer';
export * from './cangjieAnalyzer';

// 导入全局注册表和语言分析器
import { globalASTRegistry } from './types';
import { TypeScriptASTAnalyzer } from './typescriptAnalyzer';
import { PythonASTAnalyzer } from './pythonAnalyzer';
import { JavaASTAnalyzer } from './javaAnalyzer';
import { GoASTAnalyzer } from './goAnalyzer';
import { CppASTAnalyzer } from './cppAnalyzer';
import { CangjieASTAnalyzer } from './cangjieAnalyzer';

/**
 * 初始化所有 AST 分析器
 * 
 * 将所有支持的语言分析器注册到全局注册表中。
 * 这些分析器可以用于：
 * - 代码结构分析
 * - 符号提取
 * - 依赖关系分析
 * - 代码导航
 * 
 * @example
 * ```typescript
 * initializeASTAnalyzers();
 * const languages = getSupportedLanguages();
 * console.log('Supported languages:', languages);
 * // 输出：['typescript', 'python', 'java', 'go', 'cpp', 'cangjie']
 * ```
 */
export function initializeASTAnalyzers(): void {
  globalASTRegistry.register(new TypeScriptASTAnalyzer());
  globalASTRegistry.register(new PythonASTAnalyzer());
  globalASTRegistry.register(new JavaASTAnalyzer());
  globalASTRegistry.register(new GoASTAnalyzer());
  globalASTRegistry.register(new CppASTAnalyzer());
  globalASTRegistry.register(new CangjieASTAnalyzer());
}

/**
 * 获取支持的语言列表
 * 
 * 返回所有已注册的 AST 分析器支持的语言列表。
 * 
 * @returns 语言标识符数组，如 ['typescript', 'python', 'java', ...]
 * 
 * @example
 * ```typescript
 * const languages = getSupportedLanguages();
 * console.log('Supported languages:', languages);
 * ```
 */
export function getSupportedLanguages(): string[] {
  return globalASTRegistry.getSupportedLanguages();
}

// 导出全局注册表，供其他模块使用
export { globalASTRegistry } from './types';
