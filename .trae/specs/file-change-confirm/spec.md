# 文件修改/创建确认逻辑 Spec

## Why
当前系统已有文件修改确认逻辑（handleFileChange），但需要检查和优化确认流程，确保用户在修改或创建文件时能够正确地进行确认，避免意外修改。

## What Changes
- 检查现有文件确认逻辑的完整性
- 优化确认流程的用户体验
- 确保配置项正确工作
- 改进确认界面的交互逻辑

## Impact
- 受影响的功能：文件修改工具、批量编辑工具
- 受影响的文件：`src/chat/tools.ts`, `src/chat/index.ts`, 相关 UI 组件

## ADDED Requirements

### Requirement: 文件修改确认流程
系统 SHALL 提供以下确认模式：
- `always`: 总是要求用户确认
- `smart`: 基于变更行数或字符数智能判断
- `never`: 从不要求确认，直接应用

#### Scenario: 智能确认模式
- **WHEN** 用户配置为 smart 模式
- **AND** 变更行数 >= smartConfirmMinChangedLines (默认 50)
- **OR** 字符变化量 >= smartConfirmMinCharDelta (默认 3000)
- **THEN** 系统 SHALL 要求用户确认

#### Scenario: 新文件创建
- **WHEN** 创建新文件时
- **THEN** 系统 SHALL 总是要求用户确认（在 smart 模式下）

### Requirement: 确认界面交互
系统 SHALL 提供以下确认操作：
- 查看文件差异预览
- 确认应用修改
- 取消修改
- 回滚到原始版本

## MODIFIED Requirements

### Requirement: handleFileChange 函数
当前实现需要确保：
1. 正确检测文件是否存在（新文件 vs 修改）
2. 正确备份原始内容
3. 根据配置和参数决定是否要求确认
4. 在需要确认时发送正确的消息到 webview
5. 在确认前不实际修改文件

### Requirement: confirmFileChange 函数
当前实现需要确保：
1. 从 pendingFileContents 获取待确认内容
2. 验证 pendingId 有效性
3. 应用修改后清理 pending 状态
4. 调用 applyFileChangeDirect 实际写入文件

## REMOVED Requirements
无
