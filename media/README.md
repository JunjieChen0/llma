# 前端模块化结构

## 文件说明

| 文件 | 说明 |
|------|------|
| `chat-template.html` | HTML 模板，包含当前样式与 `{{SCRIPTS}}` 占位符 |
| `chat.css` | 历史拆分出的样式文件，当前未参与构建 |
| `chat.html` | 构建产物，由 `scripts/build-chat.js` 生成 |
| `js/state.js` | 状态与 DOM 引用 |
| `js/main.js` | 主逻辑（模式切换、消息、卡片、事件、流式渲染等） |

## 构建

```bash
node scripts/build-chat.js
```

或作为完整构建的一部分：

```bash
npm run build
```

## 开发流程

1. 修改 `chat-template.html` 或 `js/*.js`
2. 运行 `node scripts/build-chat.js` 生成 `chat.html`
3. 扩展加载的是 `chat.html`，无需修改 webview 逻辑
