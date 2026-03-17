# 文件修改后高亮显示问题修复 Spec

## Why
用户在使用 Agent 模式修改文件后，编辑器中没有显示高亮提示修改的位置，导致用户不知道文件被修改了什么内容。

## What Changes
- 在 `SmartEditor.applySmartEdit` 函数中，应用编辑后添加高亮显示修改位置的逻辑
- 在 `applyFileChangeDirect` 函数中，编辑完成后显示修改位置的高亮
- 确保所有文件修改路径都调用高亮功能

## Impact
- Affected specs: Agent 文件编辑功能
- Affected code: 
  - `src/chat/smartEditor.ts` - SmartEditor 类
  - `src/chat/tools.ts` - applyFileChangeDirect 函数

## ADDED Requirements
### Requirement: 文件修改后显示高亮
文件被 AI 修改后，编辑器应该高亮显示修改的位置，让用户能够快速定位到变更区域。

#### Scenario: Agent 修改文件后高亮显示
- **WHEN** Agent 使用工具（如 REPLACE、EDIT_FUNCTION、FILE 等）修改文件后
- **THEN** 编辑器应该：
  1. 打开修改的文件（如果尚未打开）
  2. 滚动到修改的位置
  3. 高亮显示修改的区域（使用编辑器的主题色）
  4. 高亮持续 3 秒后自动消失

#### Scenario: 直接使用 SmartEditor 修改文件
- **WHEN** 调用 SmartEditor.applySmartEdit 修改文件后
- **THEN** 返回修改的位置范围，供调用者决定是否需要高亮显示
