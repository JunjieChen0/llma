# Tasks
- [x] Task 1: 修改 SmartEditor 返回修改位置范围：在 applySmartEdit 函数中返回修改的位置范围
  - [x] SubTask 1.1: 修改 applyFullReplace 返回新内容的范围
  - [x] SubTask 1.2: 修改 applyPartialEdits 返回修改位置
  - [x] SubTask 1.3: 修改 applyAutoEdit 传递范围信息

- [x] Task 2: 修改 applyFileChangeDirect 函数：应用编辑后调用高亮显示
  - [x] SubTask 2.1: 获取 SmartEditor 返回的修改范围
  - [x] SubTask 2.2: 调用 revealEditLocation 高亮显示修改位置

- [x] Task 3: 验证修复效果
  - [x] SubTask 3.1: 运行类型检查
  - [x] SubTask 3.2: 测试文件修改后高亮显示
