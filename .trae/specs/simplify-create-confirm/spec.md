# 简化创建文件确认流程 Spec

## Why
当前创建新文件时确认流程过于繁琐，用户体验不佳。需要简化创建文件的确认逻辑，使其与修改文件的确认流程基本一致，减少不必要的确认步骤。

## What Changes
- 移除新文件创建时的强制确认逻辑
- 使创建文件的确认判断与修改文件使用相同的智能判断标准
- 保留配置项的灵活性，用户仍可通过配置调整确认策略

## Impact
- 受影响的功能：文件创建工具、handleFileChange 函数
- 受影响的文件：`src/chat/tools.ts`
- **BREAKING**: 创建新文件时将不再总是要求确认，可能增加意外创建文件的风险

## ADDED Requirements
无

## MODIFIED Requirements

### Requirement: 智能确认模式（修改）
原规范中"新文件创建总是要求确认"的条款修改为：

- **WHEN** 用户配置为 smart 模式
- **AND** 变更行数 >= smartConfirmMinChangedLines (默认 50)
- **OR** 字符变化量 >= smartConfirmMinCharDelta (默认 3000)
- **THEN** 系统 SHALL 要求用户确认
- **注意**: 新文件创建不再自动触发确认，而是基于变更规模判断

### Requirement: handleFileChange 函数（修改）
移除 isNewFile 强制确认的逻辑：
```typescript
// 原逻辑
requireConfirm =
  isNewFile ||
  diffResult.previewLines >= smartConfirmMinChangedLines ||
  contentDelta >= smartConfirmMinCharDelta;

// 新逻辑
requireConfirm =
  diffResult.previewLines >= smartConfirmMinChangedLines ||
  contentDelta >= smartConfirmMinCharDelta;
```

## REMOVED Requirements

### Requirement: 新文件创建强制确认
**原因**: 用户体验过于繁琐，与修改文件体验不一致
**迁移**: 用户如需要求创建文件时确认，可将 `llma.agent.fileChangeConfirmMode` 配置为 `always`
