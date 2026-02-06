import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';

// 代码提示项类
class LLMACompletionItem extends vscode.CompletionItem {
  constructor(
    label: string,
    kind: vscode.CompletionItemKind,
    public isAI: boolean = false
  ) {
    super(label, kind);
    
    if (isAI) {
      // AI 生成的建议有特殊标记
      this.detail = '🤖 LLMA 智能建议';
      this.sortText = `zzz_${label}`; // 确保AI建议在后面
      this.preselect = false;
    }
  }
}

// 代码提示提供者
class LLMACompletionProvider implements vscode.CompletionItemProvider {
  private completionCache: Map<string, vscode.CompletionItem[]> = new Map();
  private lastRequestTime: number = 0;
  private requestDelay: number = 300; // 请求延迟，避免频繁调用

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
    const items: vscode.CompletionItem[] = [];
    
    // 检查是否应该触发AI建议
    if (this.shouldTriggerAICompletion(document, position, context)) {
      const aiItems = await this.getAICompletionItems(document, position, token);
      items.push(...aiItems);
    }

    // 添加一些预设的智能模板
    const templateItems = this.getTemplateCompletionItems(document, position);
    items.push(...templateItems);

    return new vscode.CompletionList(items, true);
  }

  // 判断是否应该触发AI建议
  private shouldTriggerAICompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.CompletionContext
  ): boolean {
    // 限制请求频率
    const now = Date.now();
    if (now - this.lastRequestTime < this.requestDelay) {
      return false;
    }

    // 只在特定上下文中触发
    const line = document.lineAt(position.line);
    const textBeforeCursor = line.text.substring(0, position.character);
    
    // 触发AI建议的关键词
    const aiTriggers = [
      '//', '/*', '/**', // 注释
      'function', 'def', 'func', // 函数定义
      'class', 'interface', // 类定义
      'if', 'for', 'while', 'switch', // 控制流
      'try', 'catch', 'finally', // 异常处理
      'return', 'throw', // 返回/抛出
      'const', 'let', 'var', // 变量声明
      'async', 'await', // 异步
      'new', 'this', // 对象
      'import', 'export', 'require', // 模块
    ];

    // 检查是否包含触发词
    for (const trigger of aiTriggers) {
      if (textBeforeCursor.trim().endsWith(trigger) || 
          textBeforeCursor.includes(` ${trigger}`)) {
        return true;
      }
    }

    // 检查是否在写注释
    if (textBeforeCursor.includes('//') || textBeforeCursor.includes('/*')) {
      return true;
    }

    return false;
  }

  // 获取AI生成的建议
  private async getAICompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.CompletionItem[]> {
    try {
      this.lastRequestTime = Date.now();

      // 获取配置
      const config = vscode.workspace.getConfiguration('llma');
      const currentModel = config.get<string>('currentModel') || 'deepseek';
      const apiKey = this.getApiKey(config, currentModel);
      
      if (!apiKey) {
        return [];
      }

      // 获取当前行和上下文
      const line = document.lineAt(position.line);
      const textBeforeCursor = line.text.substring(0, position.character);
      const textAfterCursor = line.text.substring(position.character);
      
      // 构建上下文
      const context = this.getCompletionContext(document, position);
      
      // 构建提示词
      const systemPrompt = `你是一个代码补全助手。请根据用户当前的代码上下文，提供接下来最可能的代码建议。
要求：
1. 返回3-5个最可能的代码补全选项
2. 每个选项用一行表示
3. 保持与现有代码一致的风格
4. 只返回代码，不要解释`;

      const userPrompt = `语言: ${document.languageId}
当前位置: 第${position.line + 1}行, 第${position.character + 1}列
当前行: ${line.text}
光标前: ${textBeforeCursor}
光标后: ${textAfterCursor}
${context ? `上下文:\n${context}` : ''}

请为当前光标位置提供代码补全建议：`;

      // 调用AI模型（简化版，更快响应）
      const completion = await this.callAIModelQuick(
        currentModel,
        apiKey,
        systemPrompt,
        userPrompt
      );

      if (!completion) {
        return [];
      }

      // 解析AI返回的建议
      return this.parseAICompletions(completion, document.languageId);
    } catch (error) {
      console.error('AI Completion Error:', error);
      return [];
    }
  }

  // 快速调用AI模型（用于补全，使用更小的参数）
  private async callAIModelQuick(
    modelType: string,
    apiKey: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5秒超时

    try {
      let url = '';
      let payload = {};

      switch (modelType) {
        case 'deepseek':
          url = 'https://api.deepseek.com/v1/chat/completions';
          payload = {
            model: 'deepseek-coder',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 100,
            temperature: 0.2,
            stream: false
          };
          break;
        case 'qwen':
          const baseUrl = vscode.workspace.getConfiguration('llma').get<string>('qwenBaseUrl') || 
                         'https://dashscope.aliyuncs.com/compatible-mode/v1';
          url = `${baseUrl}/chat/completions`;
          payload = {
            model: 'qwen-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 100,
            temperature: 0.2,
            stream: false
          };
          break;
        default:
          return '';
      }

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        timeout: 5000
      });

      clearTimeout(timeout);
      return response.data.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  // 解析AI返回的建议
  private parseAICompletions(completion: string, languageId: string): LLMACompletionItem[] {
    const items: LLMACompletionItem[] = [];
    
    // 按行分割，每行作为一个建议
    const lines = completion.split('\n').filter(line => line.trim());
    
    for (const line of lines.slice(0, 5)) { // 最多5个建议
      const trimmed = line.trim();
      if (trimmed) {
        // 根据语言确定类型
        const kind = this.getCompletionItemKind(trimmed, languageId);
        const item = new LLMACompletionItem(trimmed, kind, true);
        
        // 添加文档说明
        item.documentation = new vscode.MarkdownString(`**LLMA 智能建议**\n\n\`\`\`${languageId}\n${trimmed}\n\`\`\``);
        
        items.push(item);
      }
    }
    
    return items;
  }

  // 获取完成项的类型
  private getCompletionItemKind(text: string, languageId: string): vscode.CompletionItemKind {
    text = text.trim();
    
    // 根据文本内容判断类型
    if (text.startsWith('function ') || text.includes('=>') || text.includes('def ')) {
      return vscode.CompletionItemKind.Function;
    } else if (text.includes('class ') || text.includes('interface ')) {
      return vscode.CompletionItemKind.Class;
    } else if (text.includes('const ') || text.includes('let ') || text.includes('var ')) {
      return vscode.CompletionItemKind.Variable;
    } else if (text.includes('if ') || text.includes('for ') || text.includes('while ')) {
      return vscode.CompletionItemKind.Keyword;
    } else if (text.includes('import ') || text.includes('require(') || text.includes('from ')) {
      return vscode.CompletionItemKind.Module;
    } else if (text.includes('return ') || text.includes('throw ')) {
      return vscode.CompletionItemKind.Keyword;
    }
    
    return vscode.CompletionItemKind.Text;
  }

  // 获取API密钥
  private getApiKey(config: vscode.WorkspaceConfiguration, modelType: string): string | undefined {
    switch (modelType) {
      case 'deepseek':
        return config.get<string>('deepseekApiKey');
      case 'qwen':
        return config.get<string>('qwenApiKey');
      case 'douban':
        return config.get<string>('doubanApiKey');
      default:
        return undefined;
    }
  }

  // 获取补全上下文
  private getCompletionContext(document: vscode.TextDocument, position: vscode.Position): string {
    // 获取当前位置前后5行作为上下文
    const contextLines = 5;
    const startLine = Math.max(0, position.line - contextLines);
    const endLine = Math.min(document.lineCount - 1, position.line + contextLines);
    
    let context = '';
    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i);
      const prefix = i === position.line ? '→ ' : '  ';
      context += `${prefix}${line.text}\n`;
    }
    
    return context;
  }

  // 获取模板完成项（预设的智能代码片段）
  private getTemplateCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): LLMACompletionItem[] {
    const items: LLMACompletionItem[] = [];
    const languageId = document.languageId;
    const line = document.lineAt(position.line);
    const textBeforeCursor = line.text.substring(0, position.character);
    
    // 通用模板
    const commonTemplates = [
      {
        trigger: ['for', '循环'],
        template: 'for (let i = 0; i < length; i++) {\n  \n}',
        kind: vscode.CompletionItemKind.Snippet,
        description: 'for循环模板'
      },
      {
        trigger: ['if', '如果'],
        template: 'if (condition) {\n  \n}',
        kind: vscode.CompletionItemKind.Snippet,
        description: 'if条件语句'
      },
      {
        trigger: ['function', '函数', 'def'],
        template: 'function name(params) {\n  \n}',
        kind: vscode.CompletionItemKind.Snippet,
        description: '函数定义'
      },
      {
        trigger: ['try', '尝试'],
        template: 'try {\n  \n} catch (error) {\n  \n}',
        kind: vscode.CompletionItemKind.Snippet,
        description: 'try-catch异常处理'
      },
      {
        trigger: ['async', '异步'],
        template: 'async function name() {\n  \n}',
        kind: vscode.CompletionItemKind.Snippet,
        description: '异步函数'
      }
    ];

    // 语言特定模板
    const languageTemplates: Record<string, any[]> = {
      'javascript': [
        {
          trigger: ['console', '打印'],
          template: 'console.log(${1:message});',
          kind: vscode.CompletionItemKind.Snippet,
          description: '控制台输出'
        },
        {
          trigger: ['fetch', '请求'],
          template: 'fetch(url)\n  .then(response => response.json())\n  .then(data => {\n    \n  })\n  .catch(error => {\n    \n  });',
          kind: vscode.CompletionItemKind.Snippet,
          description: 'fetch请求模板'
        }
      ],
      'python': [
        {
          trigger: ['def', '函数'],
          template: 'def function_name(args):\n    """\n    函数说明\n    """\n    ',
          kind: vscode.CompletionItemKind.Snippet,
          description: 'Python函数定义'
        },
        {
          trigger: ['print', '打印'],
          template: 'print(${1:message})',
          kind: vscode.CompletionItemKind.Snippet,
          description: '打印输出'
        }
      ],
      'typescript': [
        {
          trigger: ['interface', '接口'],
          template: 'interface InterfaceName {\n  \n}',
          kind: vscode.CompletionItemKind.Snippet,
          description: 'TypeScript接口定义'
        },
        {
          trigger: ['type', '类型'],
          template: 'type TypeName = {\n  \n};',
          kind: vscode.CompletionItemKind.Snippet,
          description: 'TypeScript类型定义'
        }
      ]
    };

    // 合并模板
    const templates = [...commonTemplates, ...(languageTemplates[languageId] || [])];

    // 检查是否触发模板
    for (const template of templates) {
      for (const trigger of template.trigger) {
        if (textBeforeCursor.toLowerCase().includes(trigger.toLowerCase()) ||
            textBeforeCursor.trim().endsWith(trigger)) {
          const item = new LLMACompletionItem(
            `${trigger} - ${template.description}`,
            template.kind,
            false
          );
          
          item.insertText = new vscode.SnippetString(template.template);
          item.documentation = new vscode.MarkdownString(`**LLMA 代码模板**\n\n\`\`\`${languageId}\n${template.template}\n\`\`\``);
          item.detail = template.description;
          
          items.push(item);
        }
      }
    }

    return items;
  }
}

// 悬浮提示提供者（显示AI解释）
class LLMAHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    // 检查是否启用了AI解释功能
    const config = vscode.workspace.getConfiguration('llma');
    const enableHover = config.get<boolean>('enableHoverExplanation', true);
    
    if (!enableHover) {
      return null;
    }

    // 获取选中的文本或当前单词
    const range = document.getWordRangeAtPosition(position);
    if (!range) {
      return null;
    }

    const word = document.getText(range);
    if (!word || word.length < 2) {
      return null;
    }

    // 获取上下文
    const context = this.getHoverContext(document, position);
    
    try {
      // 构建提示词
      const systemPrompt = `你是一个代码解释助手。请解释给定的代码标识符（变量、函数、类等）的含义和作用。`;
      
      const userPrompt = `语言: ${document.languageId}
标识符: ${word}
上下文: ${context}

请解释这个标识符的作用和含义：`;

      // 获取配置
      const currentModel = config.get<string>('currentModel') || 'deepseek';
      const apiKey = this.getApiKey(config, currentModel);
      
      if (!apiKey) {
        return null;
      }

      // 调用AI获取解释
      const explanation = await this.getAIExplanation(currentModel, apiKey, systemPrompt, userPrompt);
      
      if (explanation) {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`### 🤖 LLMA 解释: \`${word}\`\n\n`);
        markdown.appendMarkdown(explanation);
        markdown.appendMarkdown(`\n\n---\n*由 ${currentModel} 模型生成*`);
        
        return new vscode.Hover(markdown, range);
      }
    } catch (error) {
      console.error('Hover explanation error:', error);
    }
    
    return null;
  }

  private async getAIExplanation(
    modelType: string,
    apiKey: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    try {
      let url = '';
      let payload = {};

      switch (modelType) {
        case 'deepseek':
          url = 'https://api.deepseek.com/v1/chat/completions';
          payload = {
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 200,
            temperature: 0.3,
            stream: false
          };
          break;
        case 'qwen':
          const baseUrl = vscode.workspace.getConfiguration('llma').get<string>('qwenBaseUrl') || 
                         'https://dashscope.aliyuncs.com/compatible-mode/v1';
          url = `${baseUrl}/chat/completions`;
          payload = {
            model: 'qwen-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 200,
            temperature: 0.3,
            stream: false
          };
          break;
        default:
          return '';
      }

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 3000
      });

      return response.data.choices[0]?.message?.content?.trim() || '';
    } catch (error) {
      console.error('AI Explanation Error:', error);
      return '';
    }
  }

  private getHoverContext(document: vscode.TextDocument, position: vscode.Position): string {
    // 获取当前位置前后3行作为上下文
    const contextLines = 3;
    const startLine = Math.max(0, position.line - contextLines);
    const endLine = Math.min(document.lineCount - 1, position.line + contextLines);
    
    let context = '';
    for (let i = startLine; i <= endLine; i++) {
      const line = document.lineAt(i);
      context += `${line.text}\n`;
    }
    
    return context;
  }

  private getApiKey(config: vscode.WorkspaceConfiguration, modelType: string): string | undefined {
    switch (modelType) {
      case 'deepseek':
        return config.get<string>('deepseekApiKey');
      case 'qwen':
        return config.get<string>('qwenApiKey');
      case 'douban':
        return config.get<string>('doubanApiKey');
      default:
        return undefined;
    }
  }
}

// 主要激活函数
export function activate(context: vscode.ExtensionContext) {
  console.log('=== LLMA 扩展激活开始 ===');
  console.log('版本: 0.0.1');
  console.log('激活时间:', new Date().toLocaleString());

  // 创建状态栏项目
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  updateStatusBar(statusBarItem);
  statusBarItem.command = "llma.aiCodeComplete";
  statusBarItem.show();
  console.log('状态栏项目已创建');

  // 注册代码提示提供者
  const completionProvider = new LLMACompletionProvider();
  const completionDisposable = vscode.languages.registerCompletionItemProvider(
    { scheme: 'file', language: '*' },
    completionProvider,
    '.', ' ', '\t', '\n', '(', '[', '{', "'", '"', '`' // 触发字符
  );

  // 注册悬浮提示提供者
  const hoverProvider = new LLMAHoverProvider();
  const hoverDisposable = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: '*' },
    hoverProvider
  );

  // 注册AI代码补全命令
  const disposable = vscode.commands.registerCommand('llma.aiCodeComplete', async () => {
    // ... 原有的代码补全逻辑（保持不变）
    console.log('llma.aiCodeComplete 命令被调用');
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个编辑器');
      return;
    }

    const document = editor.document;
    const selection = editor.selection;
    
    // 获取当前光标位置的行号和列号
    const cursorLine = selection.active.line;
    const cursorCharacter = selection.active.character;
    
    console.log(`光标位置: 第${cursorLine + 1}行, 第${cursorCharacter + 1}列`);

    try {
      // 显示进度
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "LLMA正在分析代码...",
        cancellable: true
      }, async (progress, token) => {
        token.onCancellationRequested(() => {
          console.log("用户取消了操作");
        });

        progress.report({ increment: 10 });

        // 获取配置
        const config = vscode.workspace.getConfiguration('llma');
        const currentModel = config.get<string>('currentModel') || 'deepseek';
        
        console.log('使用模型:', currentModel);
        
        // 检查API密钥
        const apiKey = getApiKey(config, currentModel);
        if (!apiKey) {
          const modelName = getModelDisplayName(currentModel);
          vscode.window.showErrorMessage(`请先配置${modelName}的API密钥`);
          return;
        }

        progress.report({ increment: 30 });

        // 获取完整的文件内容和上下文
        const contextInfo = await getCodeContext(editor, cursorLine);
        console.log(`上下文长度: ${contextInfo.context.length} 字符`);
        console.log(`当前函数: ${contextInfo.currentFunction || '无'}`);
        console.log(`当前类: ${contextInfo.currentClass || '无'}`);

        progress.report({ increment: 50 });

        // 获取用户输入（选中的文本或当前行的文本）
        const userInput = getSelectionOrLineText(editor);
        if (!userInput.trim()) {
          vscode.window.showWarningMessage('请输入代码或注释作为提示');
          return;
        }

        console.log('用户输入:', userInput.substring(0, 100) + (userInput.length > 100 ? '...' : ''));

        // 构建智能提示词
        const systemPrompt = buildSystemPrompt(document.languageId);
        const userPrompt = buildUserPrompt(
          document,
          cursorLine,
          userInput,
          contextInfo
        );

        console.log('开始调用AI模型...');

        // 调用AI模型
        const completion = await callAIModel(currentModel, apiKey, systemPrompt, userPrompt);
        
        if (completion) {
          progress.report({ increment: 90 });
          
          // 在编辑器中插入生成的代码
          await editor.edit(editBuilder => {
            // 确定插入位置
            let insertPosition: vscode.Position;
            if (selection.isEmpty) {
              // 如果没有选中文本，插入到当前行末尾
              const line = document.lineAt(cursorLine);
              insertPosition = line.range.end;
            } else {
              // 如果有选中文本，替换选中的文本
              insertPosition = selection.start;
            }
            
            // 智能插入代码（自动格式化）
            const formattedCompletion = formatCompletion(
              completion, 
              document.languageId,
              editor.options.insertSpaces ? ' '.repeat(editor.options.tabSize as number) : '\t'
            );
            
            if (selection.isEmpty) {
              editBuilder.insert(insertPosition, '\n' + formattedCompletion);
            } else {
              editBuilder.replace(selection, formattedCompletion);
            }
          });
          
          // 显示成功消息
          const modelName = getModelDisplayName(currentModel);
          vscode.window.showInformationMessage(`✅ LLMA 已生成代码 (使用: ${modelName})`);
          console.log('代码生成成功，长度:', completion.length);
        }
        
        progress.report({ increment: 100 });
      });
    } catch (error: any) {
      console.error('LLMA Error:', error);
      vscode.window.showErrorMessage(`LLMA 错误: ${error.message}`);
    }
  });

  // 注册配置变更监听器
  const configDisposable = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('llma')) {
      console.log('LLMA 配置已更新');
      updateStatusBar(statusBarItem);
      const config = vscode.workspace.getConfiguration('llma');
      const currentModel = config.get<string>('currentModel') || 'deepseek';
      vscode.window.showInformationMessage(`LLMA 已切换到 ${getModelDisplayName(currentModel)} 模型`);
    }
  });

  // 注册测试命令
  const testDisposable = vscode.commands.registerCommand('llma.helloWorld', () => {
    console.log('llma.helloWorld 命令被调用');
    vscode.window.showInformationMessage('Hello World from LLMA!');
  });

  // 注册智能代码分析命令
  const analyzeDisposable = vscode.commands.registerCommand('llma.analyzeCode', async () => {
    console.log('llma.analyzeCode 命令被调用');
    
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个编辑器');
      return;
    }
    
    const document = editor.document;
    const contextInfo = await getCodeContext(editor, editor.selection.active.line);
    
    vscode.window.showInformationMessage(
      `代码分析完成！\n文件: ${path.basename(document.fileName)}\n` +
      `函数: ${contextInfo.currentFunction || '无'}\n` +
      `类: ${contextInfo.currentClass || '无'}\n` +
      `上下文行数: ${contextInfo.contextLines}`
    );
  });

  // 注册快速建议命令
  const quickSuggestDisposable = vscode.commands.registerCommand('llma.quickSuggest', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    
    // 触发自动完成
    vscode.commands.executeCommand('editor.action.triggerSuggest');
  });

  context.subscriptions.push(
    disposable, 
    configDisposable, 
    testDisposable, 
    analyzeDisposable,
    quickSuggestDisposable,
    completionDisposable,
    hoverDisposable,
    statusBarItem
  );
  
  console.log('=== LLMA 扩展激活完成，已注册所有功能 ===');
  
  // 显示激活消息
  vscode.window.showInformationMessage('🤖 LLMA AI助手已激活！使用 Ctrl+Shift+A 生成代码，或输入时获得智能提示。');
}

// ... 其余辅助函数保持不变（getApiKey, getCodeContext, findCurrentFunction, findCurrentClass, buildSystemPrompt, buildUserPrompt, getLanguageName, formatCompletion, callAIModel, callDeepSeek, callQwen, callDouban）
// 请确保这些函数都在这里

// 注意：需要添加缺失的函数，这里只列出了新增的部分，原有函数需要保留

// 更新状态栏
function updateStatusBar(statusBarItem: vscode.StatusBarItem) {
  const config = vscode.workspace.getConfiguration('llma');
  const currentModel = config.get<string>('currentModel') || 'deepseek';
  const modelName = getModelDisplayName(currentModel);
  statusBarItem.text = `$(wand) LLMA (${modelName})`;
  statusBarItem.tooltip = `LLMA AI Code Assistant - 使用 ${modelName} 模型`;
}

// 获取模型显示名称
function getModelDisplayName(modelType: string): string {
  const modelMap: Record<string, string> = {
    'deepseek': 'DeepSeek',
    'douban': '豆包',
    'qwen': '通义千问'
  };
  return modelMap[modelType] || modelType;
}

// 获取API密钥
function getApiKey(config: vscode.WorkspaceConfiguration, modelType: string): string | undefined {
  switch (modelType) {
    case 'deepseek':
      return config.get<string>('deepseekApiKey');
    case 'qwen':
      return config.get<string>('qwenApiKey');
    case 'douban':
      return config.get<string>('doubanApiKey');
    default:
      return undefined;
  }
}

// 获取选中的文本或当前行文本
function getSelectionOrLineText(editor: vscode.TextEditor): string {
  const selection = editor.selection;
  if (!selection.isEmpty) {
    return editor.document.getText(selection);
  }
  
  const line = editor.document.lineAt(selection.active.line);
  return line.text;
}

// 获取代码上下文
async function getCodeContext(
  editor: vscode.TextEditor, 
  cursorLine: number
): Promise<{
  context: string;
  currentFunction: string | null;
  currentClass: string | null;
  contextLines: number;
}> {
  const document = editor.document;
  const totalLines = document.lineCount;
  
  // 计算上下文窗口（光标前后各20行，最多40行）
  const contextWindow = 20;
  const startLine = Math.max(0, cursorLine - contextWindow);
  const endLine = Math.min(totalLines - 1, cursorLine + contextWindow);
  
  let context = '';
  let contextLines = 0;
  
  for (let i = startLine; i <= endLine; i++) {
    const line = document.lineAt(i);
    // 添加行号和内容，方便AI理解
    context += `${i + 1}: ${line.text}\n`;
    contextLines++;
  }
  
  // 分析当前函数和类
  const currentFunction = await findCurrentFunction(document, cursorLine);
  const currentClass = await findCurrentClass(document, cursorLine);
  
  return {
    context,
    currentFunction,
    currentClass,
    contextLines
  };
}

// 查找当前函数
async function findCurrentFunction(
  document: vscode.TextDocument, 
  cursorLine: number
): Promise<string | null> {
  const languageId = document.languageId;
  
  // 针对不同语言的函数检测
  const functionPatterns: Record<string, RegExp[]> = {
    'javascript': [
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/,
      /^\s*(\w+)\s*\(.*\)\s*{/,
      /^\s*(\w+)\s*:\s*\(.*\)\s*=>/,
    ],
    'typescript': [
      /^\s*(?:export\s+)?(?:public|private|protected)?\s*(?:async\s+)?function\s+(\w+)/,
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*:\s*.*=\s*(?:async\s+)?\(/,
      /^\s*(?:export\s+)?(?:public|private|protected)?\s*(\w+)\s*\(.*\)\s*:/,
      /^\s*(?:async\s+)?(\w+)\s*\(.*\)\s*{/,
    ],
    'python': [
      /^\s*def\s+(\w+)/,
      /^\s*async\s+def\s+(\w+)/,
      /^\s*@.*\n\s*def\s+(\w+)/,
    ],
    'java': [
      /^\s*(?:public|private|protected|static|\s)+\s+[\w<>\[\]]+\s+(\w+)\s*\(/,
    ],
    'cpp': [
      /^\s*(?:[\w:<>]+\s+)+(\w+)\s*\(/,
    ],
    'csharp': [
      /^\s*(?:public|private|protected|internal|static|\s)+\s+[\w<>\[\]]+\s+(\w+)\s*\(/,
    ],
  };
  
  const patterns = functionPatterns[languageId] || functionPatterns['javascript'];
  
  // 从当前行向上查找函数定义
  for (let i = cursorLine; i >= 0; i--) {
    const line = document.lineAt(i);
    for (const pattern of patterns) {
      const match = line.text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  return null;
}

// 查找当前类
async function findCurrentClass(
  document: vscode.TextDocument, 
  cursorLine: number
): Promise<string | null> {
  const languageId = document.languageId;
  
  const classPatterns: Record<string, RegExp[]> = {
    'javascript': [
      /^\s*(?:export\s+)?class\s+(\w+)/,
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*class/,
    ],
    'typescript': [
      /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
      /^\s*interface\s+(\w+)/,
      /^\s*type\s+(\w+)/,
    ],
    'python': [
      /^\s*class\s+(\w+)/,
    ],
    'java': [
      /^\s*(?:public|private|protected|abstract|\s)+\s+class\s+(\w+)/,
      /^\s*interface\s+(\w+)/,
    ],
    'cpp': [
      /^\s*class\s+(\w+)/,
      /^\s*struct\s+(\w+)/,
    ],
    'csharp': [
      /^\s*(?:public|private|protected|internal|abstract|\s)+\s+class\s+(\w+)/,
      /^\s*interface\s+(\w+)/,
    ],
  };
  
  const patterns = classPatterns[languageId] || classPatterns['javascript'];
  
  // 从当前行向上查找类定义
  for (let i = cursorLine; i >= 0; i--) {
    const line = document.lineAt(i);
    for (const pattern of patterns) {
      const match = line.text.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
  }
  
  return null;
}

// 构建系统提示词
function buildSystemPrompt(languageId: string): string {
  const languageName = getLanguageName(languageId);
  
  return `你是一个专业的${languageName}开发者，精通${languageName}的最佳实践、设计模式和代码规范。

请根据用户提供的完整代码上下文和光标位置，生成最合适、最准确的代码。

要求：
1. 仔细分析提供的代码上下文，理解代码结构和逻辑
2. 保持与现有代码完全一致的风格（缩进、命名、注释等）
3. 只返回代码，不要任何解释或标记
4. 确保生成的代码语法正确，逻辑合理
5. 如果需要，添加适当的注释说明复杂逻辑
6. 考虑异常处理和边界条件
7. 遵循${languageName}的最佳实践

如果用户请求修复错误或改进代码，请分析问题并提供最优解决方案。`;
}

// 构建用户提示词
function buildUserPrompt(
  document: vscode.TextDocument,
  cursorLine: number,
  userInput: string,
  contextInfo: {
    context: string;
    currentFunction: string | null;
    currentClass: string | null;
    contextLines: number;
  }
): string {
  const languageName = getLanguageName(document.languageId);
  const fileName = path.basename(document.fileName);
  
  let prompt = `文件: ${fileName}
语言: ${languageName}
光标位置: 第${cursorLine + 1}行`;

  if (contextInfo.currentFunction) {
    prompt += `\n当前函数: ${contextInfo.currentFunction}`;
  }
  
  if (contextInfo.currentClass) {
    prompt += `\n当前类: ${contextInfo.currentClass}`;
  }
  
  prompt += `\n\n=== 代码上下文 (${contextInfo.contextLines}行) ===\n`;
  prompt += contextInfo.context;
  prompt += '\n=== 上下文结束 ===\n\n';
  
  prompt += `用户输入/需求: ${userInput}\n\n`;
  prompt += `请基于以上完整代码上下文，在光标位置（第${cursorLine + 1}行）生成最合适的代码。`;
  
  return prompt;
}

// 获取语言名称
function getLanguageName(languageId: string): string {
  const languageMap: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'php': 'PHP',
    'ruby': 'Ruby',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'html': 'HTML',
    'css': 'CSS',
    'vue': 'Vue',
    'react': 'React',
    'json': 'JSON',
    'xml': 'XML',
    'markdown': 'Markdown',
    'yaml': 'YAML',
    'shellscript': 'Shell Script',
    'sql': 'SQL',
    'dockerfile': 'Dockerfile',
    'makefile': 'Makefile'
  };
  return languageMap[languageId] || languageId;
}

// 格式化生成的代码
function formatCompletion(
  completion: string,
  languageId: string,
  indentation: string
): string {
  // 清理AI可能添加的额外文本
  let cleaned = completion.trim();
  
  // 移除可能的代码块标记
  cleaned = cleaned.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
  
  return cleaned;
}

// 调用AI模型
async function callAIModel(
  modelType: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const maxTokens = 2000; // 增加token限制以支持更长的上下文
  const temperature = 0.3; // 降低温度以获得更确定性的输出

  console.log(`调用 ${modelType} API，系统提示长度: ${systemPrompt.length}，用户提示长度: ${userPrompt.length}`);

  switch (modelType) {
    case 'deepseek':
      return callDeepSeek(apiKey, systemPrompt, userPrompt, maxTokens, temperature);
    case 'qwen':
      const baseUrl = vscode.workspace.getConfiguration('llma').get<string>('qwenBaseUrl') || 
                     'https://dashscope.aliyuncs.com/compatible-mode/v1';
      return callQwen(apiKey, baseUrl, systemPrompt, userPrompt, maxTokens, temperature);
    case 'douban':
      return callDouban(apiKey, systemPrompt, userPrompt, maxTokens, temperature);
    default:
      throw new Error(`不支持的模型类型: ${modelType}`);
  }
}

// 调用DeepSeek API
async function callDeepSeek(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  try {
    console.log('调用 DeepSeek API...');
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-coder', // 使用代码专用模型
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000 // 增加超时时间
    });

    return response.data.choices[0]?.message?.content?.trim() || '';
  } catch (error: any) {
    console.error('DeepSeek API 错误:', error.response?.data || error.message);
    throw new Error(`DeepSeek API错误: ${error.response?.data?.message || error.message}`);
  }
}

// 调用通义千问API
async function callQwen(
  apiKey: string,
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  try {
    console.log('调用通义千问 API...');
    const response = await axios.post(`${baseUrl}/chat/completions`, {
      model: 'qwen-coder', // 使用代码专用模型
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000
    });

    return response.data.choices[0]?.message?.content?.trim() || '';
  } catch (error: any) {
    console.error('通义千问 API 错误:', error.response?.data || error.message);
    throw new Error(`通义千问API错误: ${error.response?.data?.message || error.message}`);
  }
}

// 调用豆包API
async function callDouban(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  try {
    console.log('调用豆包 API...');
    const response = await axios.post('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      model: 'ep-20240209134430-ftg8h',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 60000
    });

    return response.data.choices[0]?.message?.content?.trim() || '';
  } catch (error: any) {
    console.error('豆包 API 错误:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      throw new Error('豆包API密钥无效或已过期');
    } else if (error.response?.status === 404) {
      throw new Error('豆包API端点不存在，可能需要更新');
    }
    
    throw new Error(`豆包API错误: ${error.response?.data?.message || error.message}`);
  }
}

export function deactivate() {
  console.log('=== LLMA 扩展已停用 ===');
}