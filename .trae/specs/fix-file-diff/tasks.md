# Tasks
- [x] Task 1: 分析 diff 不显示的根本原因
  - [x] SubTask 1.1: 检查 smartEditTool 代码流程
  - [x] SubTask 1.2: 检查 backupMap 填充时机

- [ ] Task 2: 修复 smartEditTool 中 originalContent 获取时机
  - [ ] SubTask 2.1: 在 applySmartEdit 之后获取 originalContent
  - [ ] SubTask 2.2: 验证 diff 显示逻辑正确

- [ ] Task 3: 修复 searchReplaceTool 添加 diff 显示功能
  - [ ] SubTask 3.1: 在 searchReplaceTool 中添加 diff 显示逻辑
  - [ ] SubTask 3.2: 确保 backupMap 正确填充

- [ ] Task 4: 验证修复效果
  - [ ] SubTask 4.1: 运行类型检查
  - [ ] SubTask 4.2: 测试各场景下 diff 是否正确显示

# Task Dependencies
- Task 2 依赖于 Task 1 的分析结果
- Task 3 依赖于 Task 1 的分析结果
- Task 4 依赖于 Task 2 和 Task 3 完成
