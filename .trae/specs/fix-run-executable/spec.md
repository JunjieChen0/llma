# 一键运行代码失败问题 Spec

## Why
用户反馈手动运行代码可以成功，但通过插件界面的一键运行功能有时会失败。这会导致用户体验不一致，需要排查和修复。

## What Changes
- 分析一键运行代码的完整流程
- 识别可能导致失败的关键环节
- 修复发现的问题

## Impact
- 受影响的功能：一键运行（runExecutable）
- 受影响的文件：`src/compilation.ts`, `media/chat.html`

## ADDED Requirements

### Requirement: 一键运行流程分析
需要检查以下关键环节：

1. **消息传递层**（前端 → 后端）
   - 前端点击"运行"按钮
   - 通过 postMessage 发送 `runExecutable` 消息
   - 后端接收消息并调用 `runExecutable` 函数

2. **语言识别层**
   - 编译成功后传递的 `language` 参数
   - 后端根据扩展名识别语言

3. **运行命令生成层**
   - Python: 使用 `getPythonRunCommand` 获取解释器路径
   - Java: 运行 `.class` 文件
   - JavaScript/TypeScript: 使用 `node` 或 `ts-node`

#### Scenario: 手动运行成功但一键运行失败
- **可能原因 1**: 前端传递的 `language` 参数不正确或丢失
- **可能原因 2**: 路径中包含特殊字符导致命令构造失败
- **可能原因 3**: Python 解释器检测失败（虚拟环境未正确识别）
- **可能原因 4**: Windows PowerShell 命令语法问题

## MODIFIED Requirements
无

## REMOVED Requirements
无
