# LLMA README

这是 **LLMA Pro** 扩展的说明文档。LLMA Pro 是一个集成了 AI 代码预测、智能聊天、一键编译和运行的多功能编程助手，支持多种主流大语言模型，并可直接在 VS Code 中修改、创建文件。

## Features

### 🤖 多模型 AI 聊天
- 支持 **DeepSeek、通义千问、豆包、智普AI、Hugging Face** 以及 **本地模型**（如 Ollama、LM Studio）。
- 内置 **聊天模式**（回答编程问题、解释代码）和 **Agent 模式**（自动生成/修改文件、提供编译运行指导）。
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
- 支持 **C/C++、Java、Python、JavaScript、TypeScript、Rust、Go** 等多种语言的编译/检查。
- 通过 `Ctrl+Shift+B` 快速编译当前文件，编译结果直接显示在聊天窗口中。
- 编译成功后，可点击按钮直接运行生成的可执行文件（在独立终端中）。

### 📝 Agent 模式：直接修改文件
- Agent 模式下，AI 可以输出带 `> FILE: path/to/file` 标记的代码块，扩展会识别并允许你 **一键应用、保存、撤销** 文件更改。
- 新文件会自动创建，现有文件会备份以便回滚。

### ⚙️ 图形化设置界面
- 点击状态栏或工具栏齿轮图标可打开设置模态框，分页配置在线模型、本地模型、联网搜索等。


## Requirements

- **VS Code 1.80.0 或更高版本**
- **网络连接**（使用在线模型时需要）
- **API 密钥**：根据你选择的模型，需要申请对应的 API Key：
  - DeepSeek: [https://platform.deepseek.com/](https://platform.deepseek.com/)
  - 通义千问 (DashScope): [https://dashscope.aliyun.com/](https://dashscope.aliyun.com/)
  - 豆包 (火山引擎): [https://console.volcengine.com/ark/](https://console.volcengine.com/ark/)
  - 智普AI (Zhipu): [https://open.bigmodel.cn/](https://open.bigmodel.cn/)
  - Hugging Face: [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
- **SerpApi 密钥**（如需联网搜索）: [https://serpapi.com/](https://serpapi.com/)
- **本地模型**（如需使用）：需要自行启动兼容 OpenAI API 的本地服务（如 Ollama、LM Studio），并配置 `localModel.baseUrl`。

## Extension Settings

此扩展通过 `contributes.configuration` 贡献了以下设置（可在 VS Code 设置中搜索 `llma` 进行配置）：

### 通用
* `llma.enableAutoCompletion`：是否启用自动行内预测（Ghost Text），默认 `false`。
* `llma.requestDelay`：触发自动预测前的延迟（毫秒），默认 `300`。
* `llma.currentModel`：当前使用的模型标识，可选值：`deepseek`、`qwen`、`douban`、`zhipu`、`huggingface`、`local`，默认 `deepseek`。

### 在线模型 API 密钥
* `llma.deepseekApiKey`：DeepSeek API Key。
* `llma.qwenApiKey`：通义千问 API Key。
* `llma.doubanApiKey`：豆包 API Key。
* `llma.doubanModel`：豆包使用的 Endpoint ID（模型 ID）。
* `llma.zhipuApiKey`：智普AI API Key。
* `llma.huggingfaceApiKey`：Hugging Face Token。
* `llma.huggingfaceModel`：Hugging Face 模型 ID，例如 `Qwen/Qwen2.5-Coder-32B-Instruct`。

### 本地模型
* `llma.localModel.enabled`：是否启用本地模型（若启用，则聊天时选择“本地模型”才会生效）。
* `llma.localModel.baseUrl`：本地模型服务地址，默认为 `http://localhost:11434/v1`（适用于 Ollama）。
* `llma.localModel.modelName`：本地模型名称，如 `llama3`、`qwen2.5-coder` 等。
* `llma.localModel.timeout`：请求超时时间（毫秒），默认 `120000`。

### 联网搜索
* `llma.enableWebSearch`：是否默认全局开启联网搜索（可在对话中动态切换）。
* `llma.webSearchEngine`：搜索引擎，目前仅支持 `google`。
* `llma.serpApiKey`：SerpApi 的 API Key。

### Python 相关
* `llma.python.interpreterPath`：指定 Python 解释器路径（绝对路径或相对于工作区的路径）。
* `llma.python.autoDetectVirtualEnv`：是否自动检测虚拟环境（`venv`、`.venv` 等），默认 `true`。
* `llma.python.preferredCommand`：优先使用的 Python 命令，如 `python3`、`py`，或 `auto` 自动选择。
* `llma.python.versionCheck`：运行前是否检查 Python 版本，默认 `true`。

### 编译配置
* `llma.compilation.compilers`：各语言的编译命令模板，支持以下占位符：
  - `{file}`：源文件完整路径
  - `{executable}`：输出可执行文件路径
  - `{fileDir}`：源文件所在目录
  - `{fileName}`：源文件名
  - `{fileNameWithoutExt}`：无扩展名的文件名
  - `{outputDir}`：输出目录
  示例：
  ```json
  {
    "c": "gcc {file} -o {executable} -Wall",
    "cpp": "g++ {file} -o {executable} -std=c++17",
    "java": "javac -d {outputDir} {file}",
    "python": "python -m py_compile {file}",
    "javascript": "node --check {file}",
    "typescript": "tsc --noEmit {file}"
  }
  ```
* `llma.compilation.defaultOutputDir`：默认输出目录名（相对于源文件目录），默认 `build`。

## Known Issues

- 豆包模型需填写 Endpoint ID，而非普通模型名称。
- 联网搜索结果可能不准确，建议结合编程知识综合判断。
- Agent 模式下修改文件时，如果文件已被外部修改，可能会冲突（扩展会备份原始内容）。

## Release Notes

### 0.4.1

初始发布版本，包含以下核心功能：
- 多模型 AI 聊天（聊天模式 / Agent 模式）
- 自动行内代码预测（Ghost Text）
- 一键编译与运行（支持 C/C++、Java、Python、JS/TS 等）
- Agent 模式下直接应用/保存/撤销文件更改
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
