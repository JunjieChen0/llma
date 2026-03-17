# 文件修改后显示 Diff 差异对比 Spec

## Why
用户反馈插件在修改文件后没有显示修改前后的差异对比。虽然代码中已经有相关逻辑，但由于调用路径问题，导致 diff 功能在多个场景下不生效。

## What Changes
- 修复 `smartEditTool` 中获取 `originalContent` 的时机问题（在 applySmartEdit 之后获取）
- 修复 `searchReplaceTool` 添加 diff 显示功能
- 确保所有文件修改路径都正确调用 diff 对比

## Impact
- Affected specs: 文件修改、diff 显示、高亮功能
- Affected code: toolUnified/tools/index.ts, smartEditor.ts

## ADDED Requirements
### Requirement: 所有文件修改后显示 Diff 对比
当插件修改文件后，必须显示修改前后的差异对比视图。

#### Scenario: 用户确认修改后显示 diff
- **WHEN** 用户通过聊天确认文件修改
- **THEN** 系统显示 diff 对比视图（使用 vscode.diff 命令）

#### Scenario: 批量修改文件后显示 diff
- **WHEN** 用户批量修改多个文件
- **THEN** 系统逐个显示每个文件的 diff 对比

#### Scenario: Agent 工具修改文件后显示 diff
- **WHEN** Agent 使用 SMART_EDIT 等工具修改文件
- **THEN** 系统显示 diff 对比视图
