/**
 * 智能补全模块导出文件
 * 
 * 导出智能补全相关的所有模块，包括：
 * - 模式学习器：学习项目中的代码模式
 * - 智能补全提供者：基于项目上下文的代码补全
 * 
 * 主要功能：
 * - 项目级代码模式学习
 * - 基于历史和上下文的智能补全
 * - 意图预测和补全建议
 * - 补全接受率统计
 * 
 * @module completion/index
 */

// 导出模式学习器
export * from './patternLearner';

// 导出智能补全提供者
export * from './smartCompletionProvider';
