/**
 * 状态栏模块
 * 
 * 提供 VS Code 状态栏的管理功能，包括：
 * - 状态栏创建：在 VS Code 状态栏中显示扩展状态
 * - 状态更新：根据扩展状态更新状态栏文本和图标
 * - 命令绑定：点击状态栏可以切换自动补全
 * - 资源清理：正确释放状态栏资源
 * 
 * 主要功能：
 * - 显示扩展的运行状态（空闲、加载中、已禁用）
 * - 提供快速切换自动补全的入口
 * - 使用 VS Code 图标增强视觉效果
 * 
 * @module statusBar
 */

import * as vscode from 'vscode';

/**
 * 状态栏项实例
 * 全局变量，用于访问和更新状态栏
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * 创建状态栏项
 * 
 * 在 VS Code 状态栏右侧创建状态栏项，并设置初始状态。
 * 
 * 功能：
 * - 创建状态栏项，优先级为 100
 * - 绑定点击命令为 "llma.toggle"（切换自动补全）
 * - 初始化状态栏文本
 * - 显示状态栏项
 * 
 * @returns 状态栏项实例
 * 
 * @example
 * ```typescript
 * const statusBarItem = createStatusBarItem();
 * // 状态栏会显示在 VS Code 底部右侧
 * ```
 */
export function createStatusBarItem() {
  // 创建状态栏项，位置在右侧，优先级为 100
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  
  // 绑定点击命令：点击状态栏切换自动补全
  statusBarItem.command = "llma.toggle";
  
  // 初始化状态栏状态
  updateStatusBar(false);
  
  // 显示状态栏
  statusBarItem.show();
  
  return statusBarItem;
}

/**
 * 更新状态栏状态
 * 
 * 根据扩展的当前状态更新状态栏文本和图标。
 * 
 * 状态类型：
 * - 已禁用：显示 "NJUST_AI_Assistant Off" 和禁用图标
 * - 加载中：显示 "NJUST_AI_Assistant..." 和旋转图标
 * - 空闲：显示 "NJUST_AI_Assistant"
 * 
 * @param isLoading - 是否正在加载
 * 
 * @example
 * ```typescript
 * // 显示加载状态
 * updateStatusBar(true);
 * 
 * // 显示空闲状态
 * updateStatusBar(false);
 * ```
 */
export function updateStatusBar(isLoading: boolean) {
  // 获取配置
  const config = vscode.workspace.getConfiguration('llma');
  const enabled = config.get<boolean>('enableAutoCompletion');
  
  if (!enabled) {
    // 已禁用状态：显示禁用图标和 "Off" 标记
    statusBarItem.text = `$(circle-slash) NJUST_AI_Assistant Off`;
  } else if (isLoading) {
    // 加载中状态：显示旋转图标
    statusBarItem.text = `$(sync~spin) NJUST_AI_Assistant...`;
  } else {
    // 空闲状态：只显示名称
    statusBarItem.text = `NJUST_AI_Assistant`;
  }
}

/**
 * 释放状态栏资源
 * 
 * 在扩展停用时调用，正确释放状态栏资源。
 * 
 * @example
 * ```typescript
 * // 在扩展停用时调用
 * disposeStatusBar();
 * ```
 */
export function disposeStatusBar() {
  statusBarItem?.dispose();
}