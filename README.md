
# NJUST_AI_Assistant

**NJUST_AI_Assistant** 是一个集成了 AI 代码预测、智能聊天、一键编译和运行的多功能编程助手，支持多种主流大语言模型，并可直接在 VS Code 中修改、创建文件。

---

## Features

### 🤖 多模型 AI 聊天
- 支持 **DeepSeek、通义千问、豆包、智普AI、Hugging Face、OpenAI** 以及 **本地模型**（如 Ollama、LM Studio）。
- 内置 **聊天模式**（回答编程问题、解释代码）和 **Agent 模式**（自动生成/修改文件、提供编译运行指导、执行终端命令）。
- 流式输出响应，支持 **思考过程** 展示（模型返回 `<think>` 标签时自动折叠）。

### 📄 智能上下文感知
- 自动将当前打开的编辑器内容（或选中代码）作为上下文附加到对话中。
- 可手动添加任意文件作为参考，帮助 AI 更好地理解项目。

### 🌐 联网搜索（需配置 SerpApi）
- 在对话中开启联网搜索后，AI 可结合最新搜索结果回答问题。
- 搜索结果会自动格式化并作为上下文提供给模型。

### ⚡️ 行内代码预测（Ghost Text）
- 在编码时自动触发 AI 补全，提供下一段代码的预测（需启用 `enableAutoCompletion`）。
- 支持延迟触发，避免频繁请求。

### 🚀 一键编译与运行
- 支持 **C/C++、Java、Python、JavaScript、TypeScript、Rust、Go、仓颉** 等多种语言的编译/检查。
- 通过 `Ctrl+Shift+B` 快速编译当前文件，编译结果直接显示在聊天窗口中。
- 编译成功后，可点击按钮直接运行生成的可执行文件（在独立终端中）。

### 🤖 Agent 模式：直接修改文件与执行命令
- **修改文件**：AI 可以输出带 `> FILE: path/to/file` 标记的代码块，扩展会识别并允许你 **一键应用、保存、撤销** 文件更改。新文件会自动创建，现有文件会备份以便回滚。
- **执行命令**：AI 可以使用 `> RUN: command` 标记请求执行终端命令（如运行测试、安装依赖等），执行结果会返回给 AI 继续推理。命令执行前可请求用户确认（可配置为自动允许）。

### ⚙️ 图形化设置界面
- 点击状态栏或工具栏齿轮图标可打开设置模态框，分页配置在线模型、本地模型、联网搜索等。

---

## Requirements

- **VS Code 1.80.0 或更高版本**
- **网络连接**（使用在线模型时需要）
- **API 密钥**：根据你选择的模型，需要申请对应的 API Key：
  - DeepSeek: [https://platform.deepseek.com/](https://platform.deepseek.com/)
  - 通义千问 (DashScope): [https://dashscope.aliyun.com/](https://dashscope.aliyun.com/)
  - 豆包 (火山引擎): [https://console.volcengine.com/ark/](https://console.volcengine.com/ark/)
  - 智普AI (Zhipu): [https://open.bigmodel.cn/](https://open.bigmodel.cn/)
  - Hugging Face: [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
  - OpenAI: [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **SerpApi 密钥**（如需联网搜索）: [https://serpapi.com/](https://serpapi.com/)
- **本地模型**（如需使用）：需要自行启动兼容 OpenAI API 的本地服务（如 Ollama、LM Studio），并配置 `localModel.baseUrl`。

---

## Extension Settings

此扩展通过 `contributes.configuration` 贡献了以下设置（可在 VS Code 设置中搜索 `llma` 进行配置）：

### 通用
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.enableAutoCompletion` | boolean | `true` | 启用实时代码预测 (Ghost Text/幽灵文本) |
| `llma.currentModel` | string | `"deepseek"` | 选择 AI 模型提供商，可选值：`deepseek`、`qwen`、`doubao`、`zhipu`、`local`、`huggingface`、`openai` |
| `llma.requestDelay` | number | `300` | 自动预测延迟（毫秒） |
| `llma.maxTokens` | number | `2000` | 生成的最大 Token 数 |

### 在线模型 API 密钥
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.deepseekApiKey` | string | `""` | DeepSeek API Key |
| `llma.qwenApiKey` | string | `""` | 通义千问 API Key |
| `llma.qwenBaseUrl` | string | `"https://dashscope.aliyuncs.com/compatible-mode/v1"` | 通义千问 Base URL |
| `llma.doubaoApiKey` | string | `""` | 豆包 API Key |
| `llma.doubaoModel` | string | `""` | 豆包 Endpoint ID (例如: ep-20240604...) |
| `llma.zhipuApiKey` | string | `""` | 智普AI API Key |
| `llma.huggingfaceApiKey` | string | `""` | Hugging Face Access Token (HF_TOKEN) |
| `llma.huggingfaceModel` | string | `"Qwen/Qwen2.5-Coder-32B-Instruct"` | Hugging Face 模型 ID |
| `llma.openaiApiKey` | string | `""` | OpenAI API Key |
| `llma.openaiBaseUrl` | string | `"https://api.openai.com/v1"` | OpenAI Base URL (需包含 /v1) |
| `llma.openaiModel` | string | `"gpt-4-turbo-preview"` | OpenAI 模型名称，如 `gpt-4`、`gpt-3.5-turbo` |

### 本地模型
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.localModel.enabled` | boolean | `false` | 启用本地大模型 |
| `llma.localModel.baseUrl` | string | `"http://localhost:11434/v1"` | 本地模型 API 基础 URL (例如 Ollama: http://localhost:11434/v1) |
| `llma.localModel.modelName` | string | `"llama3"` | 本地模型名称 (例如: llama3, qwen2, codellama) |
| `llma.localModel.timeout` | number | `120000` | 本地模型请求超时时间 (毫秒) |

### 联网搜索
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.enableWebSearch` | boolean | `false` | 启用联网搜索功能 |
| `llma.webSearchEngine` | string | `"google"` | 选择 SerpAPI 使用的底层搜索引擎（google/bing/baidu/yahoo/duckduckgo） |
| `llma.serpApiKey` | string | `""` | SerpApi API Key (用于联网搜索) |

### 编译配置
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.compilation.compilers` | object | 见下方 | 编译命令配置，支持占位符 `{file}`、`{executable}`、`{outputDir}`、`{fileName}`、`{fileNameWithoutExt}`、`{fileDir}` |
| `llma.compilation.defaultOutputDir` | string | `"build"` | 默认输出目录 |

默认编译命令对象：
```json
{
  "c": "gcc \"{file}\" -o \"{executable}\"",
  "cpp": "g++ \"{file}\" -o \"{executable}\"",
  "python": "python -m py_compile \"{file}\"",
  "javascript": "node --check \"{file}\"",
  "typescript": "tsc --noEmit \"{file}\"",
  "java": "javac -d \"{outputDir}\" \"{file}\"",
  "rust": "rustc \"{file}\" -o \"{executable}\"",
  "go": "go build -o \"{executable}\" \"{file}\"",
  "cangjie": "cjc \"{file}\" -o \"{executable}\""
}
```

### Python 相关
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.python.interpreterPath` | string | `""` | Python 解释器路径（留空则自动检测） |
| `llma.python.autoDetectVirtualEnv` | boolean | `true` | 自动检测并激活虚拟环境 |
| `llma.python.preferredCommand` | string | `"auto"` | 首选 Python 命令（auto/python/python3/py） |
| `llma.python.versionCheck` | boolean | `true` | 运行前检查 Python 版本 |

### Agent 模式相关
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `llma.agent.allowCommandExecution` | boolean | `false` | 允许 AI 自动执行终端命令（若为 false，每次执行前会请求用户确认） |
| `llma.agent.maxToolIterations` | number | `5` | 单次对话中工具调用的最大迭代次数，防止无限循环 |

---

## Known Issues

- 豆包模型需填写 Endpoint ID，而非普通模型名称。
- 联网搜索结果可能不准确，建议结合编程知识综合判断。
- Agent 模式下修改文件时，如果文件已被外部修改，可能会冲突（扩展会备份原始内容）。
- 命令执行功能默认需要用户确认，可修改配置以自动允许（请谨慎开启）。

---

## Release Notes

### 1.0.0

初始发布版本，包含以下核心功能：
- 多模型 AI 聊天（聊天模式 / Agent 模式）
- 自动行内代码预测（Ghost Text）
- 一键编译与运行（支持 C/C++、Java、Python、JS/TS、Rust、Go、仓颉等）
- Agent 模式下直接应用/保存/撤销文件更改，以及执行终端命令
- 联网搜索支持
- 图形化设置界面

---

## Following extension guidelines

确保你已阅读扩展指南并遵循创建扩展的最佳实践。

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

你可以使用 Visual Studio Code 编写 README。以下是一些有用的编辑器键盘快捷键：

* 拆分编辑器（macOS 上为 `Cmd+\`，Windows 和 Linux 上为 `Ctrl+\`）。
* 切换预览（macOS 上为 `Shift+Cmd+V`，Windows 和 Linux 上为 `Shift+Ctrl+V`）。
* 按 `Ctrl+Space`（Windows、Linux、macOS）查看 Markdown 片段列表。

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**