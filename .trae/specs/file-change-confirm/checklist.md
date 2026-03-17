# Checklist

- [x] handleFileChange 函数正确实现确认逻辑
  - [x] 正确检测新文件和修改文件
  - [x] 正确备份原始内容到 backupMap
  - [x] 根据 auto 参数和配置决定是否确认
  - [x] 智能模式下正确计算变更行数和字符差异
  - [x] 需要确认时发送 fileChangePreview 消息
  - [x] 不需要确认时直接调用 applyFileChangeDirect

- [x] confirmFileChange 函数正确实现
  - [x] 正确从 pendingFileContents 获取内容
  - [x] 验证 pendingId 有效性
  - [x] 清理 pending 状态
  - [x] 调用 applyFileChangeDirect 应用修改

- [x] applyFileChangeDirect 函数正确实现
  - [x] 使用 SmartEditor 应用智能编辑
  - [x] 正确更新 backupMap
  - [x] 支持显示编辑后的高亮
  - [x] 支持打开差异视图

- [x] 配置项正确定义和使用
  - [x] fileChangeConfirmMode 配置在 package.json 中定义
  - [x] smartConfirmMinChangedLines 配置正确
  - [x] smartConfirmMinCharDelta 配置正确
  - [x] 配置值正确传递到 handleFileChange
  - [x] 添加了缺失的配置项：promptForBatchEdit, enableReflection, taskCompletionCheck 等

- [x] 前端界面正确实现
  - [x] 接收并显示 fileChangePreview 消息
  - [x] 显示文件差异对比（使用 CSS 类替代内联样式）
  - [x] 确认按钮正确调用 confirmFileChange（使用事件监听器）
  - [x] 取消按钮正确调用 cancelFileChange（使用事件监听器）
  - [x] 添加了 file-preview-card 和 diff-view 的专用 CSS 样式

- [x] 错误处理完善
  - [x] 文件不存在时的处理
  - [x] pendingId 过期时的错误提示
  - [x] 工作区未打开时的错误提示
  - [x] 添加了 cancelPendingFileChange 函数清理内存

- [x] 测试通过
  - [x] 创建新文件时正确要求确认
  - [x] 小修改在 smart 模式下不要求确认
  - [x] 大修改在 smart 模式下要求确认
  - [x] always 模式总是要求确认
  - [x] never 模式从不要求确认
  - [x] 类型检查通过（npm run check-types 无错误）
