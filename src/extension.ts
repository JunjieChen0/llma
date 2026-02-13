import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

// 全局状态栏项
let statusBarItem: vscode.StatusBarItem;
// 运行专用终端 (仅在点击运行按钮时使用)
let runTerminal: vscode.Terminal | undefined;
// 全局 ChatProvider 引用
let globalChatProvider: LLMAChatProvider | undefined;

// 扩展激活入口
export function activate(context: vscode.ExtensionContext) {
  console.log('=== LLMA 已激活 ===');

  // 1. 初始化状态栏
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "llma.toggle";
  updateStatusBar(false);
  statusBarItem.show();

  // 2. 注册行内代码预测 (Ghost Text)
  const provider = new LLMAInlineCompletionProvider();
  const selector = { pattern: '**' };
  const inlineProvider = vscode.languages.registerInlineCompletionItemProvider(selector, provider);

  // 3. 注册侧边栏聊天窗口
  const chatProvider = new LLMAChatProvider(context.extensionUri);
  globalChatProvider = chatProvider;
  const chatView = vscode.window.registerWebviewViewProvider("llma.chatView", chatProvider, {
    webviewOptions: { retainContextWhenHidden: true }
  });

  // 4. 注册命令
  const generateCommand = vscode.commands.registerCommand('llma.aiCodeComplete', async () => {
    await handleExplicitCodeGeneration();
  });

  const toggleCommand = vscode.commands.registerCommand('llma.toggle', () => {
    const config = vscode.workspace.getConfiguration('llma');
    const currentState = config.get<boolean>('enableAutoCompletion');
    config.update('enableAutoCompletion', !currentState, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`LLMA 自动预测已${!currentState ? '开启' : '关闭'}`);
  });

  const manualTriggerCommand = vscode.commands.registerCommand('llma.trigger', () => {
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });

  // 5. 注册编译命令
  const compileCommand = vscode.commands.registerCommand('llma.compileCurrentFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个编辑器');
      return;
    }
    await compileFile(editor.document.uri.fsPath);
  });

  const compileWithOptionsCommand = vscode.commands.registerCommand('llma.compileWithOptions', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个编辑器');
      return;
    }
    await showCompilationOptions(editor.document.uri.fsPath);
  });

  // 6. 监听配置变化
  const configListener = vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('llma')) {
      updateStatusBar(false);
    }
  });

  context.subscriptions.push(
    statusBarItem,
    inlineProvider,
    chatView,
    generateCommand,
    toggleCommand,
    manualTriggerCommand,
    compileCommand,
    compileWithOptionsCommand,
    configListener
  );
}

export function deactivate() {
  if (runTerminal) {
    runTerminal.dispose();
  }
  console.log('LLMA Pro 已停用');
}

/**
 * === 编译核心功能 ===
 */

async function compileFile(filePath: string, options: {
  customCommand?: string;
  outputPath?: string;
  args?: string[];
} = {}) {
  try {
    const config = vscode.workspace.getConfiguration('llma');
    const compilers = config.get<any>('compilation.compilers') || {};
    const defaultOutputDir = config.get<string>('compilation.defaultOutputDir') || 'build';

    const fileExt = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const fileNameWithoutExt = path.basename(filePath, fileExt);
    const fileDir = path.dirname(filePath);

    // 获取文件语言
    const language = getLanguageFromExtension(fileExt);

    if (!language) {
      vscode.window.showErrorMessage(`不支持的文件类型: ${fileExt}`);
      return;
    }

    // 确定输出目录
    let outputDir: string;
    if (options.outputPath) {
      outputDir = path.dirname(options.outputPath);
    } else {
      outputDir = path.join(fileDir, defaultOutputDir);
    }

    // 获取可执行文件名
    const executableName = getExecutableName(fileNameWithoutExt, language);
    const outputPath = options.outputPath || path.join(outputDir, executableName);

    // 获取编译命令
    let compileCommand = options.customCommand || compilers[language];

    if (!compileCommand) {
      vscode.window.showErrorMessage(`未配置 ${language} 语言的编译命令`);
      return;
    }

    // 对于 Java，默认使用 -d 参数指定输出目录
    if (language === 'java' && !options.customCommand) {
      compileCommand = compilers['java'] || `javac -d "{outputDir}" "{file}"`;
    }

    // 替换占位符
    compileCommand = compileCommand
      .replace(/{file}/g, `"${filePath}"`)
      .replace(/{executable}/g, `"${outputPath}"`)
      .replace(/{fileDir}/g, `"${fileDir}"`)
      .replace(/{fileName}/g, fileName)
      .replace(/{fileNameWithoutExt}/g, fileNameWithoutExt)
      .replace(/{outputDir}/g, `"${outputDir}"`);

    // 添加额外参数
    if (options.args && options.args.length > 0) {
      compileCommand += ` ${options.args.join(' ')}`;
    }

    // 创建输出目录
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 通知 UI 开始编译
    if (globalChatProvider) {
      globalChatProvider.postMessageToWebview({
        type: 'addSystemMessage',
        text: `⏳ 正在编译/检查: ${fileName}...`
      });
    } else {
      vscode.window.setStatusBarMessage(`正在编译: ${fileName}...`, 3000);
    }

    // 在后台静默执行编译
    await executeCompilationSilent(compileCommand, filePath, outputPath, language, fileDir);

  } catch (error: any) {
    vscode.window.showErrorMessage(`编译流程错误: ${error.message}`);
  }
}

async function showCompilationOptions(filePath: string) {
  const config = vscode.workspace.getConfiguration('llma');
  const compilers = config.get<any>('compilation.compilers') || {};
  const fileExt = path.extname(filePath).toLowerCase();
  const language = getLanguageFromExtension(fileExt);

  if (!language) {
    vscode.window.showErrorMessage(`不支持的文件类型: ${fileExt}`);
    return;
  }

  const defaultCommand = compilers[language] || '';

  const customCommand = await vscode.window.showInputBox({
    prompt: `请输入 ${language} 编译命令`,
    value: defaultCommand,
    placeHolder: `例如: gcc "{file}" -o "{executable}" -Wall`
  });

  if (customCommand === undefined) {
    return;
  }

  const additionalArgs = await vscode.window.showInputBox({
    prompt: '请输入额外参数（可选）',
    placeHolder: '例如: -O2 -g'
  });

  const outputPath = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(path.dirname(filePath), 'build',
      getExecutableName(path.basename(filePath, fileExt), language))),
    filters: {
      '可执行文件': ['exe', 'out', 'class', ''],
      '所有文件': ['*']
    }
  });

  await compileFile(filePath, {
    customCommand,
    outputPath: outputPath?.fsPath,
    args: additionalArgs && additionalArgs.trim() ? additionalArgs.split(' ') : []
  });
}

async function executeCompilationSilent(command: string, sourcePath: string, outputPath: string, language: string, cwd: string) {
  cp.exec(command, { cwd: cwd }, (error, stdout, stderr) => {
    const output = (stdout || '') + (stderr || '');
    
    if (error) {
      if (globalChatProvider) {
        globalChatProvider.postMessageToWebview({
          type: 'compilationResult',
          success: false,
          message: `❌ **编译失败**\n\n\`\`\`\n${output.trim()}\n\`\`\``,
          filePath: sourcePath,
          executablePath: outputPath,
          language: language
        });
      } else {
        vscode.window.showErrorMessage(`编译失败:\n${output}`);
      }
      return;
    }

    let successMessage = '';
    let runTarget = sourcePath;
    
    if (['c', 'cpp', 'rust', 'go', 'cangjie'].includes(language)) {
      runTarget = outputPath;
      successMessage = `✅ **编译成功！**\n生成文件: \`${path.basename(outputPath)}\``;
    } else if (language === 'java') {
      runTarget = outputPath; 
      successMessage = `✅ **Java 编译成功！**`;
    } else if (['python', 'javascript', 'typescript'].includes(language)) {
      successMessage = `✅ **语法/类型检查通过！**`;
    } else {
      successMessage = `✅ **处理完成。**`;
    }

    if (globalChatProvider) {
      globalChatProvider.postMessageToWebview({
        type: 'compilationResult',
        success: true,
        message: successMessage,
        filePath: sourcePath,
        executablePath: runTarget,
        language: language
      });
    } else {
      vscode.window.showInformationMessage('编译/检查成功');
    }
  });
}

async function runExecutable(targetPath: string, language: string) {
  const ext = path.extname(targetPath);
  const baseName = path.basename(targetPath);
  const terminalName = `LLMA Run: ${baseName}`;

  if (runTerminal) {
    runTerminal.dispose();
  }

  runTerminal = vscode.window.createTerminal({
    name: terminalName,
    shellPath: getShellPath()
  });

  runTerminal.show(false);

  let runCommand = '';
  let execDir = path.dirname(targetPath);

  if (language === 'java' && ext === '.class') {
    const className = path.basename(targetPath, '.class');
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    runCommand = `java ${className}`;
  } 
  else if (language === 'python' || ext === '.py') {
    const pythonInfo = await getPythonRunCommand(targetPath);
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    if (process.platform === 'win32') {
      runCommand = `& '${pythonInfo.interpreter}' '${baseName}'`;
    } else {
      runCommand = `"${pythonInfo.interpreter}" "${baseName}"`;
    }
  } 
  else if (language === 'javascript' || ext === '.js') {
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    runCommand = `node "${baseName}"`;
  } 
  else if (language === 'typescript' || ext === '.ts') {
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    runCommand = `npx ts-node "${baseName}"`; 
  }
  else {
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    if (process.platform === 'win32') {
      runCommand = `& ".\\${baseName}"`;
    } else {
      runCommand = `"./${baseName}"`;
    }
  }

  if (process.platform !== 'win32') {
      runTerminal.sendText('clear');
  }
  runTerminal.sendText(runCommand);
}

// ... 辅助函数 ...

function getLanguageFromExtension(ext: string): string | null {
  const languageMap: { [key: string]: string } = {
    '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
    '.java': 'java', '.class': 'java', '.jar': 'java',
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript',
    '.rs': 'rust', '.go': 'go', '.cs': 'csharp',
    '.php': 'php', '.rb': 'ruby', '.swift': 'swift',
    '.m': 'objective-c', '.cj': 'cangjie'
  };
  return languageMap[ext] || null;
}

function getExecutableName(baseName: string, language: string): string {
  if (process.platform === 'win32') {
    if (language === 'java') return `${baseName}.class`;
    return `${baseName}.exe`;
  }
  if (['python', 'javascript', 'ruby', 'php', 'typescript'].includes(language)) {
    return baseName;
  }
  if (language === 'java') return `${baseName}.class`;
  return baseName;
}

function getShellPath(): string {
  if (process.platform === 'win32') {
    return process.env.PSModulePath ? 'powershell.exe' : (process.env.COMSPEC || 'cmd.exe');
  }
  return process.env.SHELL || '/bin/bash';
}

function getChangeDirectoryCommand(dirPath: string): string {
  const normalizedPath = dirPath.replace(/\\/g, '\\\\');
  if (process.platform === 'win32') {
    return process.env.PSModulePath
      ? `Set-Location -Path '${normalizedPath}'`
      : `cd /d "${normalizedPath}"`;
  } else {
    return `cd "${normalizedPath}"`;
  }
}

// ... Python 相关 ...

interface PythonInterpreterInfo {
  path: string;
  version?: string;
  isVirtualEnv?: boolean;
  virtualEnvPath?: string;
}

function getPythonInterpreterPath(): string | undefined {
  const config = vscode.workspace.getConfiguration('llma');
  const interpreterPath = config.get<string>('python.interpreterPath');
  if (interpreterPath && interpreterPath.trim() !== '') {
    if (path.isAbsolute(interpreterPath)) return interpreterPath;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const absolutePath = path.join(workspaceFolders[0].uri.fsPath, interpreterPath);
      if (fs.existsSync(absolutePath)) return absolutePath;
    }
  }
  return undefined;
}

function detectPythonInterpreter(): string {
  const config = vscode.workspace.getConfiguration('llma');
  const preferredCommand = config.get<string>('python.preferredCommand') || 'auto';
  const configuredPath = getPythonInterpreterPath();
  if (configuredPath) return configuredPath;
  if (preferredCommand !== 'auto') return preferredCommand;
  return process.platform === 'win32' ? 'py' : 'python3';
}

function detectVirtualEnv(filePath: string): string | undefined {
  const config = vscode.workspace.getConfiguration('llma');
  if (!config.get<boolean>('python.autoDetectVirtualEnv')) return undefined;
  
  const fileDir = path.dirname(filePath);
  const venvDirs = ['venv', '.venv', 'env', '.env', 'virtualenv', '.virtualenv'];
  let currentDir = fileDir;
  let maxDepth = 5;

  while (maxDepth-- > 0 && currentDir !== path.dirname(currentDir)) {
    for (const venvDir of venvDirs) {
      const venvPath = path.join(currentDir, venvDir);
      if (fs.existsSync(venvPath)) {
        let pythonPath = process.platform === 'win32'
          ? path.join(venvPath, 'Scripts', 'python.exe')
          : path.join(venvPath, 'bin', 'python');
        if (fs.existsSync(pythonPath)) return pythonPath;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return undefined;
}

async function checkPythonVersion(pythonPath: string): Promise<string | undefined> {
  try {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      exec(`"${pythonPath}" --version`, (error: any, stdout: string, stderr: string) => {
        if (error) { resolve(undefined); return; }
        const versionOutput = (stdout || stderr).trim();
        const versionMatch = versionOutput.match(/Python\s+(\d+\.\d+\.\d+)/);
        resolve(versionMatch ? versionMatch[1] : undefined);
      });
    });
  } catch { return undefined; }
}

async function getPythonRunCommand(filePath: string): Promise<{ command: string; interpreter: string; version?: string }> {
  const config = vscode.workspace.getConfiguration('llma');
  const venvPython = detectVirtualEnv(filePath);
  const configuredPython = getPythonInterpreterPath();
  const autoDetectedPython = detectPythonInterpreter();
  let pythonInterpreter = venvPython || configuredPython || autoDetectedPython;

  let version: string | undefined;
  if (config.get<boolean>('python.versionCheck')) {
    version = await checkPythonVersion(pythonInterpreter);
  }

  const baseName = path.basename(filePath);
  let runCommand = process.platform === 'win32'
    ? `"${pythonInterpreter}" "${baseName}"`
    : `"${pythonInterpreter}" "${baseName}"`;

  return { command: runCommand, interpreter: pythonInterpreter, version };
}

/**
 * === 侧边栏聊天视图提供者 ===
 */
class LLMAChatProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private fileBackupMap = new Map<string, string | null>();
  // 添加 AbortController 用于管理请求取消
  private _abortController: AbortController | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    vscode.window.onDidChangeTextEditorSelection(e => {
      if (this._view && e.textEditor === vscode.window.activeTextEditor) {
        this.updateContextStatus(e.textEditor);
      }
    });

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this.handleUserMessage(data.text, data.history, data.model, data.mode, data.files, data.useWebSearch);
          break;
        case 'stopGeneration':
          // 处理停止生成请求
          if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
          }
          break;
        case 'applyFileChange':
          await this.handleApplyFileChange(data.filepath, data.content);
          break;
        case 'saveFile':
          await this.handleSaveFile(data.filepath);
          break;
        case 'revertFile':
          await this.handleRevertFile(data.filepath);
          break;
        case 'compileCurrentFile':
          await vscode.commands.executeCommand('llma.compileCurrentFile');
          break;
        case 'runExecutable':
          await runExecutable(data.path, data.language);
          break;
        case 'revealInExplorer':
          if (data.path) vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(data.path));
          break;
        case 'refreshContext':
          if (vscode.window.activeTextEditor) this.updateContextStatus(vscode.window.activeTextEditor);
          break;
        case 'selectContextFiles':
          await this.handleSelectContextFiles();
          break;
        case 'getSettings':
          await this.sendSettingsToWebview();
          break;
        case 'saveSettings':
          await this.handleSaveSettings(data.settings);
          break;
      }
    });
  }

  public postMessageToWebview(message: any) {
    this._view?.webview.postMessage(message);
  }

  private resolveFilePath(filepath: string): vscode.Uri | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return null;
    return path.isAbsolute(filepath) ? vscode.Uri.file(filepath) : vscode.Uri.joinPath(workspaceFolders[0].uri, filepath);
  }

  private async handleApplyFileChange(filepath: string, content: string) {
    const targetUri = this.resolveFilePath(filepath);
    if (!targetUri) {
      vscode.window.showErrorMessage('请先打开一个工作区文件夹');
      return;
    }

    let fileExists = false;
    try {
      await vscode.workspace.fs.stat(targetUri);
      fileExists = true;
    } catch { fileExists = false; }

    try {
      const edit = new vscode.WorkspaceEdit();
      if (fileExists) {
        const doc = await vscode.workspace.openTextDocument(targetUri);
        if (!this.fileBackupMap.has(targetUri.fsPath)) {
          this.fileBackupMap.set(targetUri.fsPath, doc.getText());
        }
        const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        edit.replace(targetUri, fullRange, content);
        await vscode.workspace.applyEdit(edit);
        await vscode.window.showTextDocument(doc, { preview: false });
        this._view?.webview.postMessage({ type: 'fileChangeApplied', filepath, isNew: false });
      } else {
        if (!this.fileBackupMap.has(targetUri.fsPath)) {
          this.fileBackupMap.set(targetUri.fsPath, null);
        }
        edit.createFile(targetUri, { ignoreIfExists: true });
        edit.insert(targetUri, new vscode.Position(0, 0), content);
        await vscode.workspace.applyEdit(edit);
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        this._view?.webview.postMessage({ type: 'fileChangeApplied', filepath, isNew: true });
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`修改出错: ${e.message}`);
      this._view?.webview.postMessage({ type: 'fileChangeError', filepath, error: e.message });
    }
  }

  private async handleSaveFile(filepath: string) {
    const targetUri = this.resolveFilePath(filepath);
    if (!targetUri) return;
    try {
      const doc = await vscode.workspace.openTextDocument(targetUri);
      await doc.save();
      vscode.window.setStatusBarMessage(`已保存 ${path.basename(filepath)}`, 3000);
      this._view?.webview.postMessage({ type: 'fileChangeSaved', filepath });
    } catch (e: any) {
      vscode.window.showErrorMessage(`保存失败: ${e.message}`);
    }
  }

  private async handleRevertFile(filepath: string) {
    const targetUri = this.resolveFilePath(filepath);
    if (!targetUri) return;
    try {
      const fsPath = targetUri.fsPath;
      if (this.fileBackupMap.has(fsPath)) {
        const originalContent = this.fileBackupMap.get(fsPath);
        const edit = new vscode.WorkspaceEdit();
        if (originalContent === null || originalContent === undefined) {
          edit.deleteFile(targetUri, { ignoreIfNotExists: true });
        } else {
          const doc = await vscode.workspace.openTextDocument(targetUri);
          const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
          edit.replace(targetUri, fullRange, originalContent);
        }
        await vscode.workspace.applyEdit(edit);
        vscode.window.setStatusBarMessage(`已撤销 ${path.basename(filepath)}`, 3000);
        this._view?.webview.postMessage({ type: 'fileChangeReverted', filepath });
      } else {
        vscode.window.showWarningMessage('未找到历史备份');
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`撤销失败: ${e.message}`);
    }
  }

  private async handleSelectContextFiles() {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: '添加到上下文',
      title: '选择参考文件'
    });
    if (uris && uris.length > 0) {
      this._view?.webview.postMessage({
        type: 'filesSelected',
        files: uris.map(u => ({ name: path.basename(u.fsPath), path: u.fsPath }))
      });
    }
  }

  private async sendSettingsToWebview() {
    const config = vscode.workspace.getConfiguration('llma');
    this._view?.webview.postMessage({
      type: 'updateSettings',
      settings: {
        deepseekApiKey: config.get('deepseekApiKey') || '',
        qwenApiKey: config.get('qwenApiKey') || '',
        doubanApiKey: config.get('doubanApiKey') || '',
        doubanModel: config.get('doubanModel') || '',
        zhipuApiKey: config.get('zhipuApiKey') || '',
        huggingfaceApiKey: config.get('huggingfaceApiKey') || '',
        huggingfaceModel: config.get('huggingfaceModel') || '',
        localModelEnabled: config.get('localModel.enabled') || false,
        localModelBaseUrl: config.get('localModel.baseUrl') || 'http://localhost:11434/v1',
        localModelName: config.get('localModel.modelName') || 'llama3',
        localModelTimeout: config.get('localModel.timeout') || 120000,
        enableWebSearch: config.get('enableWebSearch') || false,
        webSearchEngine: config.get('webSearchEngine') || 'google',
        serpApiKey: config.get('serpApiKey') || ''
      }
    });
  }

  private async handleSaveSettings(settings: any) {
    const config = vscode.workspace.getConfiguration('llma');
    try {
      if (settings.deepseekApiKey !== undefined) await config.update('deepseekApiKey', settings.deepseekApiKey, vscode.ConfigurationTarget.Global);
      if (settings.qwenApiKey !== undefined) await config.update('qwenApiKey', settings.qwenApiKey, vscode.ConfigurationTarget.Global);
      if (settings.doubanApiKey !== undefined) await config.update('doubanApiKey', settings.doubanApiKey, vscode.ConfigurationTarget.Global);
      if (settings.doubanModel !== undefined) await config.update('doubanModel', settings.doubanModel, vscode.ConfigurationTarget.Global);
      if (settings.zhipuApiKey !== undefined) await config.update('zhipuApiKey', settings.zhipuApiKey, vscode.ConfigurationTarget.Global);
      if (settings.huggingfaceApiKey !== undefined) await config.update('huggingfaceApiKey', settings.huggingfaceApiKey, vscode.ConfigurationTarget.Global);
      if (settings.huggingfaceModel !== undefined) await config.update('huggingfaceModel', settings.huggingfaceModel, vscode.ConfigurationTarget.Global);
      
      if (settings.localModelEnabled !== undefined) await config.update('localModel.enabled', settings.localModelEnabled, vscode.ConfigurationTarget.Global);
      if (settings.localModelBaseUrl !== undefined) await config.update('localModel.baseUrl', settings.localModelBaseUrl, vscode.ConfigurationTarget.Global);
      if (settings.localModelName !== undefined) await config.update('localModel.modelName', settings.localModelName, vscode.ConfigurationTarget.Global);
      if (settings.localModelTimeout !== undefined) await config.update('localModel.timeout', settings.localModelTimeout, vscode.ConfigurationTarget.Global);

      if (settings.enableWebSearch !== undefined) await config.update('enableWebSearch', settings.enableWebSearch, vscode.ConfigurationTarget.Global);
      if (settings.serpApiKey !== undefined) await config.update('serpApiKey', settings.serpApiKey, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage('配置已更新！');
      await this.sendSettingsToWebview();
    } catch (e: any) {
      vscode.window.showErrorMessage(`配置保存失败: ${e.message}`);
    }
  }

  private updateContextStatus(editor: vscode.TextEditor) {
    const fileName = path.basename(editor.document.fileName);
    const lineCount = editor.selection.isEmpty ? 0 : editor.selection.end.line - editor.selection.start.line + 1;
    const contextInfo = editor.selection.isEmpty
      ? `当前编辑器: ${fileName}`
      : `选中代码: ${fileName} (${lineCount} 行)`;
    this._view?.webview.postMessage({ type: 'updateContextInfo', text: contextInfo });
  }

  private async handleUserMessage(userText: string, history: any[], selectedModel: string, mode: 'chat' | 'agent', attachedFiles: string[], useWebSearch: boolean) {
    if (!this._view) return;

    // 1. 如果有正在进行的请求，先终止
    if (this._abortController) {
      this._abortController.abort();
    }
    // 2. 创建新的控制器
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    const editor = vscode.window.activeTextEditor;
    let contextPrompt = "";
    const maxContextLength = mode === 'agent' ? 8000 : 4000;

    if (editor) {
      const document = editor.document;
      const selection = editor.selection;
      const fileName = path.basename(document.fileName);
      const relativePath = vscode.workspace.asRelativePath(document.uri);
      const language = document.languageId;
      let codeContext = "";

      if (!selection.isEmpty) {
        codeContext = document.getText(selection);
      } else {
        const cursorLine = selection.active.line;
        const startLine = Math.max(0, cursorLine - 200);
        const endLine = Math.min(document.lineCount - 1, cursorLine + 50);
        const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).range.end.character);
        codeContext = document.getText(range);
      }
      if (codeContext.length > maxContextLength) {
        codeContext = codeContext.substring(0, maxContextLength) + "\n... (truncated)";
      }
      contextPrompt += `\n\n[Active File: ${relativePath}]\n\`\`\`${language}\n${codeContext}\n\`\`\`\n`;
    }

    if (attachedFiles && attachedFiles.length > 0) {
      contextPrompt += `\n\n=== User Attached Files ===\n`;
      for (const filePath of attachedFiles) {
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const truncatedContent = content.length > 10000 ? content.substring(0, 10000) + "\n... (Truncated)" : content;
          contextPrompt += `\n[File: ${vscode.workspace.asRelativePath(filePath)}]\n\`\`\`\n${truncatedContent}\n\`\`\`\n`;
        } catch (e) {
          contextPrompt += `\n[File: ${path.basename(filePath)}] (Error reading file)\n`;
        }
      }
    }

    const config = vscode.workspace.getConfiguration('llma');
    const model = selectedModel || config.get<string>('currentModel') || 'deepseek';
    const apiKey = getApiKey(config, model);

    if (model !== 'local' && !apiKey) {
      this._view.webview.postMessage({ type: 'addErrorResponse', text: `⚠️ 请先配置 ${model} 的 API Key` });
      this._abortController = null;
      return;
    }

    try {
      let webSearchResults = '';
      const serpApiKey = config.get<string>('serpApiKey') || '';
      const searchEngine = config.get<string>('webSearchEngine') || 'google';

      if (useWebSearch) {
        if (!serpApiKey) {
          this._view.webview.postMessage({ type: 'addErrorResponse', text: '⚠️ 无法进行网络搜索：请先在设置中配置 SerpApi API Key。' });
          this._abortController = null;
          return;
        }
        this._view.webview.postMessage({ type: 'showSearchStatus', text: '🔍 正在搜索...' });
        try {
          const results = await searchWeb(userText, serpApiKey, searchEngine);
          webSearchResults = formatSearchResults(results);
        } catch (searchError: any) {
          webSearchResults = `\n\n⚠️ 搜索失败: ${searchError.message}\n`;
        }
      }

      let systemPrompt = '';
      if (mode === 'agent') {
        systemPrompt = `你是一个高级 AI 代码 Agent，具备直接在 VS Code 中修改、创建和编译文件的能力。
你的任务是根据用户需求直接给出可执行的文件变更。

【强制指令协议 (Modification)】
如果你需要修改现有文件或创建新文件，**必须**在代码块之前单独空一行输出文件标记：
\`> FILE: path/to/file\`
紧接着输出完整的包含所有修改内容的代码块。
示例：
> FILE: src/main.ts
\`\`\`typescript
// 完整的代码内容
\`\`\`
注意：必须输出修改后的**完整文件内容**，不要只输出差异部分。

【编译与运行指导】
- 如果用户询问如何运行，告诉他们可以使用右上角的 "▶️" 按钮或快捷键 \`Ctrl+Shift+B\` 编译。
- 对于 C/C++，建议用户检查 build 目录下的可执行文件。
- 对于 Java，编译后会生成 .class 文件在 build 目录下。
- 对于 Python 和 JS/TS，运行的是源文件，不需要编译生成可执行文件。`;
      } else if (useWebSearch && webSearchResults) {
        systemPrompt = `你是一个具有联网检索能力的专业 VS Code 编程助手。
用户的问题中包含了最新检索到的网络搜索结果（[🌐 网络搜索结果]）。
请仔细阅读并综合这些搜索结果，结合你的编程专业知识，为用户提供最新、最准确的解答。`;
      } else {
        systemPrompt = `你是一个专业的 VS Code AI 编程助手。
你的核心任务是解答用户的编程问题、解释代码、提供代码建议和重构方案。
所有的代码片段必须使用 Markdown 代码块包裹。`;
      }

      let enhancedUserText = userText;
      if (webSearchResults) enhancedUserText = userText + '\n\n' + webSearchResults;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: enhancedUserText + contextPrompt }
      ];

      const temp = mode === 'agent' ? 0.1 : 0.7;
      this._view.webview.postMessage({ type: 'streamStart' });

      // 传递 signal 给 callChatAI
      await callChatAI(model, apiKey, messages, config, 4000, temp, signal, (contentDelta, reasoningDelta) => {
        this._view?.webview.postMessage({
          type: 'streamUpdate',
          content: contentDelta,
          reasoning: reasoningDelta
        });
      });

      this._view.webview.postMessage({ type: 'streamEnd' });

    } catch (error: any) {
      // 检查是否为用户主动取消 (AbortController 触发)
      if (axios.isCancel(error) || error.name === 'CanceledError' || error.message === 'canceled') {
        this._view.webview.postMessage({ 
          type: 'addWarningResponse', 
          text: '⚠️ 已停止生成对话' 
        });
      } else {
        const errorMsg = `❌ 错误: ${error.message}`;
        if (model === 'local') {
          const baseUrl = config.get<string>('localModel.baseUrl') || 'http://localhost:11434/v1';
          this._view.webview.postMessage({
            type: 'addErrorResponse',
            text: `${errorMsg}\n\n本地模型连接失败，请检查服务地址: ${baseUrl}`
          });
        } else {
          this._view.webview.postMessage({ type: 'addErrorResponse', text: errorMsg });
        }
      }
    } finally {
      this._abortController = null;
      // 确保 UI 状态重置
      this._view?.webview.postMessage({ type: 'streamEnd' });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const config = vscode.workspace.getConfiguration('llma');
    const defaultModel = config.get<string>('currentModel') || 'deepseek';
    const cspSource = webview.cspSource;
    const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; font-src ${cspSource} data:; img-src ${cspSource} data: https:;`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>LLMA Pro - AI 编程助手</title>
  <style>
    :root {
      --primary-color: #007acc;
      --primary-hover: #005fa3;
      --success-color: #2ecc71;
      --warning-color: #f39c12;
      --danger-color: #e74c3c;
      --info-color: #3498db;
      --bg-light: var(--vscode-sideBar-background);
      --bg-lighter: var(--vscode-sideBarSectionHeader-background);
      --border-color: var(--vscode-widget-border);
      --text-primary: var(--vscode-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --text-tertiary: var(--vscode-disabledForeground);
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 8px;
      --shadow-sm: 0 2px 4px rgba(0,0,0,0.1);
      --shadow-md: 0 4px 8px rgba(0,0,0,0.15);
      --transition-fast: 0.15s ease;
      --transition-normal: 0.25s ease;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
      background: var(--bg-light);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      line-height: 1.5;
    }
    
    /* ===== 顶部工具栏 ===== */
    .header-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-lighter);
      border-bottom: 1px solid var(--border-color);
      min-height: 44px;
    }
    
    .model-selector { flex: 1; position: relative; }
    
    .model-select {
      width: 100%;
      padding: 5px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      font-size: 12px;
      outline: none;
      cursor: pointer;
      transition: var(--transition-fast);
    }
    
    .model-select:hover { border-color: var(--primary-color); }
    .model-select:focus { border-color: var(--primary-color); box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2); }
    
    .btn-icon {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; background: transparent;
      border: 1px solid transparent; border-radius: var(--radius-sm);
      color: var(--text-secondary); cursor: pointer; transition: var(--transition-fast); font-size: 13px;
    }
    
    .btn-icon:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--text-primary); border-color: var(--border-color); }
    .btn-icon.active { background: var(--primary-color); color: white; }
    
    .btn-icon.compile { background: linear-gradient(135deg, var(--success-color), #27ae60); color: white; border: none; }
    .btn-icon.compile:hover { background: linear-gradient(135deg, #27ae60, #219653); transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    
    /* ===== 模式切换器 ===== */
    .mode-toggle {
      display: flex; background: var(--vscode-input-background);
      border: 1px solid var(--border-color); border-radius: var(--radius-sm);
      padding: 2px; gap: 2px;
    }
    
    .mode-btn {
      padding: 4px 8px; font-size: 11px; font-weight: 500;
      background: transparent; border: none; border-radius: 3px;
      color: var(--text-secondary); cursor: pointer; transition: var(--transition-fast); white-space: nowrap;
    }
    
    .mode-btn:hover { color: var(--text-primary); }
    .mode-btn.active { background: var(--primary-color); color: white; }
    
    /* ===== 上下文栏 ===== */
    .context-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 12px; background: var(--vscode-list-hoverBackground);
      border-bottom: 1px solid var(--border-color); font-size: 11px; color: var(--text-secondary);
    }
    
    .context-info { display: flex; align-items: center; gap: 6px; overflow: hidden; }
    .context-icon { font-size: 11px; opacity: 0.7; }
    .context-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .context-actions { display: flex; gap: 4px; }
    
    /* ===== 聊天容器 ===== */
    .chat-container {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 12px;
      background: var(--vscode-editor-background);
    }
    
    .welcome-message {
      background: linear-gradient(135deg, var(--primary-color), #3498db);
      color: white; border-radius: var(--radius-md); padding: 14px;
      margin-bottom: 6px; box-shadow: var(--shadow-sm);
    }
    
    .welcome-message h3 { font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .welcome-message ul { list-style: none; padding-left: 0; }
    .welcome-message li { margin-bottom: 5px; font-size: 11px; display: flex; align-items: center; gap: 5px; }
    
    .feature-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
    .badge { background: rgba(255, 255, 255, 0.2); padding: 2px 6px; border-radius: 10px; font-size: 9px; font-weight: 500; }
    
    /* 消息样式 */
    .message {
      max-width: 85%; padding: 10px 14px; border-radius: var(--radius-md);
      position: relative; animation: fadeIn 0.3s ease; line-height: 1.4;
      font-size: 13px; word-break: break-word;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .user-message {
      align-self: flex-end; background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
      color: white; border-bottom-right-radius: var(--radius-sm);
    }
    
    .ai-message {
      align-self: flex-start; background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--border-color); border-bottom-left-radius: var(--radius-sm); width: 100%;
    }
    
    .system-message {
      text-align: center; font-size: 11px; color: var(--text-secondary);
      margin: 5px 0; font-style: italic; opacity: 0.8;
    }
    
    .warning-message {
      align-self: center;
      background: linear-gradient(135deg, var(--warning-color), #e67e22);
      color: white;
      border-radius: var(--radius-sm);
      font-size: 11px;
      padding: 4px 12px;
      margin: 8px 0;
      box-shadow: var(--shadow-sm);
    }

    .message-time { font-size: 9px; opacity: 0.6; margin-top: 4px; text-align: right; }
    
    /* === 思考过程样式 === */
    .reasoning-block {
      margin-bottom: 10px; border-radius: var(--radius-sm);
      background: rgba(0, 0, 0, 0.03); border-left: 3px solid var(--text-tertiary); overflow: hidden;
    }
    
    .reasoning-block summary {
      cursor: pointer; font-size: 11px; color: var(--text-tertiary);
      padding: 6px 10px; user-select: none; font-style: italic; outline: none;
      display: flex; align-items: center; gap: 6px;
    }
    .reasoning-block summary:hover { background: rgba(0, 0, 0, 0.05); }
    
    .reasoning-content {
      padding: 4px 10px 10px 10px; font-size: 11.5px; color: #777;
      font-style: italic; white-space: pre-wrap; line-height: 1.5;
      border-top: 1px dashed rgba(0,0,0,0.05);
    }

    /* 代码块 */
    .code-block { position: relative; margin: 6px 0; border-radius: var(--radius-sm); overflow: hidden; }
    
    .code-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 5px 8px; background: var(--vscode-textBlockQuote-background);
      border-bottom: 1px solid var(--border-color);
      font-family: 'Consolas', 'Monaco', monospace; font-size: 10px; color: var(--text-secondary);
    }
    
    .language-tag {
      background: var(--primary-color); color: white; padding: 1px 5px;
      border-radius: 3px; font-size: 9px; font-weight: 500;
    }
    
    pre {
      margin: 0; padding: 10px; background: var(--vscode-textBlockQuote-background);
      overflow-x: auto; font-family: 'Consolas', 'Monaco', monospace; font-size: 12px; line-height: 1.4;
    }
    
    code { font-family: inherit; }
    
    /* 文件操作区域 */
    .file-action-card {
      background: var(--vscode-editor-lineHighlightBackground);
      border-left: 3px solid var(--info-color); border-radius: var(--radius-md);
      padding: 10px; margin: 10px 0; animation: slideIn 0.3s ease;
    }

    .file-action-card.generation-pending {
      border-left-color: var(--warning-color); opacity: 0.8; animation: pulse 1.5s infinite;
    }
    
    @keyframes slideIn {
      from { transform: translateX(-10px); opacity: 0; }
      to { transform: translateX(10px); opacity: 1; }
    }
    
    .file-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .file-icon { font-size: 14px; color: var(--info-color); }
    .file-path { font-family: 'Consolas', 'Monaco', monospace; font-size: 11px; color: var(--text-primary); font-weight: 500; }
    .action-buttons { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
    
    /* === 编译结果卡片 === */
    .compilation-card {
      border: 1px solid var(--border-color); background: var(--vscode-editor-background);
      border-radius: var(--radius-md); padding: 12px; margin: 10px 0;
      box-shadow: var(--shadow-sm); animation: slideIn 0.3s ease;
    }
    .compilation-card.success { border-left: 4px solid var(--success-color); }
    .compilation-card.error { border-left: 4px solid var(--danger-color); }
    
    .comp-header { font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .comp-details { font-size: 12px; margin-bottom: 12px; white-space: pre-wrap; font-family: 'Consolas', 'Monaco', monospace; color: var(--text-secondary); }
    .comp-actions { display: flex; gap: 8px; }
    
    .btn-run { 
      background: linear-gradient(135deg, var(--success-color), #27ae60); 
      color: white; border: none; padding: 5px 12px; border-radius: var(--radius-sm); 
      cursor: pointer; display: flex; align-items: center; gap: 4px; font-size: 11px; 
    }
    .btn-run:hover { opacity: 0.9; transform: translateY(-1px); }
    
    .btn-reveal { 
      background: transparent; border: 1px solid var(--border-color); 
      color: var(--text-primary); padding: 5px 12px; border-radius: var(--radius-sm); 
      cursor: pointer; font-size: 11px; 
    }
    .btn-reveal:hover { background: var(--vscode-toolbar-hoverBackground); }
    
    /* ===== 文件附件区域 ===== */
    .attachments-bar {
      padding: 6px 12px; border-top: 1px solid var(--border-color);
      background: var(--bg-lighter); display: flex; align-items: center; gap: 6px;
      overflow-x: auto; min-height: 36px;
    }
    
    .attachments-label { font-size: 10px; color: var(--text-secondary); white-space: nowrap; }
    
    .file-chips { display: flex; gap: 5px; flex: 1; overflow-x: auto; padding: 2px; }
    
    .file-chip {
      display: flex; align-items: center; gap: 5px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      padding: 3px 8px; border-radius: 12px; font-size: 10px; white-space: nowrap;
      transition: var(--transition-fast);
    }
    .file-chip:hover { background: var(--vscode-badge-hoverBackground); }
    
    .remove-chip { cursor: pointer; opacity: 0.7; transition: var(--transition-fast); font-size: 12px; line-height: 1; }
    .remove-chip:hover { opacity: 1; transform: scale(1.1); }
    
    /* ===== 输入区域 ===== */
    .input-area {
      padding: 12px 12px; border-top: 1px solid var(--border-color);
      background: var(--bg-lighter); position: relative;
    }
    
    .textarea-wrapper { position: relative; margin-bottom: 0; }
    
    textarea {
      width: 100%; min-height: 80px; max-height: 120px;
      padding: 10px 12px 40px 12px; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: 1px solid var(--border-color);
      border-radius: var(--radius-md); font-family: inherit; font-size: 13px;
      line-height: 1.4; resize: none; outline: none; transition: var(--transition-fast);
    }
    
    textarea:focus { border-color: var(--primary-color); box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2); }
    textarea::placeholder { color: var(--text-tertiary); }
    
    .input-actions {
      position: absolute; right: 10px; bottom: 10px;
      display: flex; align-items: center; gap: 6px; z-index: 10;
    }
    
    .btn-attach, .btn-websearch {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--border-color); border-radius: var(--radius-sm);
      color: var(--text-secondary); font-size: 12px; cursor: pointer;
      transition: var(--transition-fast); padding: 0;
    }
    .btn-attach:hover, .btn-websearch:hover { background: var(--vscode-button-secondaryHoverBackground); color: var(--text-primary); }
    .btn-websearch.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
    
    .btn-send {
      padding: 6px 16px; background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
      color: white; border: none; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
      cursor: pointer; transition: var(--transition-normal); min-width: 60px; height: 28px;
      display: flex; align-items: center; justify-content: center;
    }
    .btn-send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .btn-stop {
      padding: 6px 16px; background: linear-gradient(135deg, var(--danger-color), #c0392b);
      color: white; border: none; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
      cursor: pointer; transition: var(--transition-normal); min-width: 60px; height: 28px;
      display: flex; align-items: center; justify-content: center;
    }
    .btn-stop:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    
    /* ===== 加载动画 ===== */
    .loading-indicator {
      display: flex; align-items: center; gap: 8px; padding: 10px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: var(--radius-md); margin: 6px 0; animation: pulse 1.5s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 0.8; } 50% { opacity: 1; } }
    
    .loading-dots { display: flex; gap: 3px; }
    .loading-dot {
      width: 5px; height: 5px; background: var(--primary-color);
      border-radius: 50%; animation: bounce 1.4s infinite ease-in-out;
    }
    .loading-dot:nth-child(1) { animation-delay: -0.32s; }
    .loading-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
    
    /* ===== 模态框 ===== */
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5); z-index: 1000; align-items: center; justify-content: center;
    }
    
    .modal-content {
      background: var(--vscode-editor-background); border-radius: var(--radius-lg);
      width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: var(--shadow-md);
    }
    
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px; border-bottom: 1px solid var(--border-color);
    }
    
    .modal-title { font-size: 15px; font-weight: 600; }
    .modal-close {
      background: none; border: none; font-size: 16px; color: var(--text-secondary); cursor: pointer;
      width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm);
    }
    .modal-close:hover { background: var(--vscode-toolbar-hoverBackground); }
    
    .modal-body { padding: 18px; }
    
    .settings-tabs { display: flex; gap: 2px; margin-bottom: 18px; border-bottom: 1px solid var(--border-color); }
    
    .settings-tab {
      padding: 6px 14px; background: transparent; border: none; border-bottom: 2px solid transparent;
      color: var(--text-secondary); font-size: 12px; cursor: pointer;
    }
    .settings-tab:hover { color: var(--text-primary); }
    .settings-tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
    
    .form-group { margin-bottom: 14px; }
    .form-label { display: block; margin-bottom: 5px; font-size: 12px; color: var(--text-primary); font-weight: 500; }
    .form-hint { display: block; margin-top: 3px; font-size: 10px; color: var(--text-tertiary); }
    
    .form-input {
      width: 100%; padding: 7px 10px; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: 1px solid var(--border-color);
      border-radius: var(--radius-sm); font-size: 12px; outline: none;
    }
    .form-input:focus { border-color: var(--primary-color); box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2); }

    .checkbox-group { display: flex; align-items: center; gap: 6px; }
    .checkbox-group input[type="checkbox"] { width: 14px; height: 14px; cursor: pointer; }
    
    .modal-footer { padding: 14px 18px; border-top: 1px solid var(--border-color); text-align: right; }
    
    .btn-primary {
      padding: 6px 20px; background: linear-gradient(135deg, var(--primary-color), var(--primary-hover));
      color: white; border: none; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
      cursor: pointer; transition: var(--transition-normal);
    }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    
    .btn-success {
      padding: 6px 14px; background: linear-gradient(135deg, var(--success-color), #27ae60);
      color: white; border: none; border-radius: var(--radius-sm); font-size: 11px; font-weight: 500;
      cursor: pointer; transition: var(--transition-normal);
    }
    .btn-success:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }

    .btn-danger {
      padding: 6px 14px; background: linear-gradient(135deg, var(--danger-color), #c0392b);
      color: white; border: none; border-radius: var(--radius-sm); font-size: 11px; font-weight: 500;
      cursor: pointer; transition: var(--transition-normal);
    }
    .btn-danger:hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
    
    /* 滚动条美化 */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
  </style>
</head>
<body>
  <div class="header-toolbar">
    <div class="model-selector">
      <select class="model-select" id="model-select" aria-label="选择 AI 模型">
        <option value="deepseek" ${defaultModel === 'deepseek' ? 'selected' : ''}> DeepSeek</option>
        <option value="qwen" ${defaultModel === 'qwen' ? 'selected' : ''}> 通义千问</option>
        <option value="douban" ${defaultModel === 'douban' ? 'selected' : ''}> 豆包(Volcengine)</option>
        <option value="zhipu" ${defaultModel === 'zhipu' ? 'selected' : ''}> 智普AI</option>
        <option value="huggingface" ${defaultModel === 'huggingface' ? 'selected' : ''}> Hugging Face</option>
        <option value="local" ${defaultModel === 'local' ? 'selected' : ''}> 本地模型</option>
      </select>
    </div>
    <button class="btn-icon compile" id="compile-btn" title="编译当前文件 (Ctrl+Shift+B)">▶</button>
    <button class="btn-icon" id="settings-btn" title="设置">⚙️</button>
    <!-- 新增：新对话按钮 -->
    <button class="btn-icon" id="new-chat-btn" title="新对话 (清空历史)">➕</button>
    <div class="mode-toggle">
      <button class="mode-btn active" id="mode-chat">聊天模式</button>
      <button class="mode-btn" id="mode-agent">Agent 模式</button>
    </div>
  </div>
  
  <div class="context-bar">
    <div class="context-info">
      <span class="context-icon">📄</span>
      <span class="context-text" id="context-text">等待编辑器激活...</span>
    </div>
    <div class="context-actions">
      <button class="btn-icon" id="refresh-context" title="刷新上下文">🔄</button>
    </div>
  </div>
  
  <div class="chat-container" id="chat-container">
    <div class="welcome-message">
      <h3>✨ LLMA Pro 助手已就绪</h3>
      <ul>
        <li>🔄 <strong>聊天模式</strong>: 获取代码建议和解答</li>
        <li>🤖 <strong>Agent 模式</strong>: 创建、修改文件并编译代码</li>
        <li>⚡️ <strong>快捷键</strong>: Ctrl+Shift+B 快速编译当前文件</li>
        <li>💡 <strong>提示</strong>: 拖拽文件或点击 📎 添加上下文，点击 🌐 开启网络搜索</li>
      </ul>
      <div class="feature-badges">
        <span class="badge">代码生成</span>
        <span class="badge">智能预测</span>
        <span class="badge">文件编译</span>
        <span class="badge">联网搜索</span>
        <span class="badge">流式输出</span>
      </div>
    </div>
  </div>
  
  <div class="attachments-bar" id="attachments-bar">
    <span class="attachments-label">📎 已添加:</span>
    <div class="file-chips" id="file-chips"></div>
  </div>
  
  <div class="input-area">
    <div class="textarea-wrapper">
      <textarea id="message-input" placeholder="输入您的问题或指令... (Enter 发送, Shift+Enter 换行)"></textarea>
      <div class="input-actions">
        <button class="btn-attach" id="attach-btn" title="添加文件">📎</button>
        <button class="btn-websearch" id="websearch-toggle-btn" title="开启/关闭联网搜索">🌐</button>
        <button class="btn-stop" id="stop-btn" style="display: none;" title="停止生成">停止</button>
        <button class="btn-send" id="send-btn" title="发送消息">发送</button>
      </div>
    </div>
  </div>
  
  <div class="modal-overlay" id="settings-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">⚙️ LLMA Pro 设置</h3>
        <button class="modal-close" id="close-settings">×</button>
      </div>
      <div class="modal-body">
        <div class="settings-tabs">
          <button class="settings-tab active" data-tab="online">在线模型</button>
          <button class="settings-tab" data-tab="local">本地模型</button>
          <button class="settings-tab" data-tab="websearch">联网搜索</button>
        </div>
        
        <div id="online-settings" class="tab-content">
          <div class="form-group"><label class="form-label">DeepSeek API Key</label><input type="password" id="key-deepseek" class="form-input"></div>
          <div class="form-group"><label class="form-label">通义千问 API Key</label><input type="password" id="key-qwen" class="form-input"></div>
          <div class="form-group"><label class="form-label">豆包 API Key</label><input type="password" id="key-douban" class="form-input"></div>
          <div class="form-group"><label class="form-label">豆包 Endpoint ID</label><input type="text" id="model-douban" class="form-input"></div>
          <div class="form-group"><label class="form-label">智普AI API Key</label><input type="password" id="key-zhipu" class="form-input"></div>
          <div class="form-group"><label class="form-label">Hugging Face Token</label><input type="password" id="key-huggingface" class="form-input"></div>
          <div class="form-group"><label class="form-label">Hugging Face Model ID</label><input type="text" id="model-huggingface" class="form-input" placeholder="Qwen/Qwen2.5-Coder-32B-Instruct"></div>
        </div>
        
        <div id="local-settings" class="tab-content" style="display: none;">
          <div class="form-group"><div class="checkbox-group"><input type="checkbox" id="local-enabled"><label class="form-label">启用本地模型</label></div></div>
          <div class="form-group"><label class="form-label">服务地址</label><input type="text" id="local-base-url" class="form-input"></div>
          <div class="form-group"><label class="form-label">模型名称</label><input type="text" id="local-model-name" class="form-input"></div>
          <div class="form-group"><label class="form-label">请求超时</label><input type="number" id="local-timeout" class="form-input"></div>
        </div>
        
        <div id="websearch-settings" class="tab-content" style="display: none;">
          <div class="form-group"><div class="checkbox-group"><input type="checkbox" id="websearch-enabled"><label class="form-label">默认全局启用联网搜索</label></div></div>
          <div class="form-group"><label class="form-label">SerpApi API Key</label><input type="password" id="serp-api-key" class="form-input"></div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn-primary" id="save-settings-btn">保存设置</button></div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    const chatContainer = document.getElementById('chat-container');
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const attachBtn = document.getElementById('attach-btn');
    const webSearchToggleBtn = document.getElementById('websearch-toggle-btn');
    const modelSelect = document.getElementById('model-select');
    const compileBtn = document.getElementById('compile-btn');
    const refreshBtn = document.getElementById('refresh-context');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const modeChatBtn = document.getElementById('mode-chat');
    const modeAgentBtn = document.getElementById('mode-agent');
    const fileChips = document.getElementById('file-chips');
    const attachmentsBar = document.getElementById('attachments-bar');
    const newChatBtn = document.getElementById('new-chat-btn');
    
    let history = [];
    let currentMode = 'chat';
    let attachedFiles = [];
    let isGenerating = false;
    let isWebSearchEnabled = false;
    let activeSettingsTab = 'online';

    // 用于流式渲染的全局变量
    let currentAiMessageDiv = null;
    let currentAiContent = '';
    let currentAiReasoning = '';
    
    function init() {
      setMode('chat');
      const savedState = vscode.getState();
      if (savedState) {
        if (savedState.attachedFiles) { attachedFiles = savedState.attachedFiles; renderFileChips(); }
        if (savedState.currentMode) setMode(savedState.currentMode);
        if (savedState.isWebSearchEnabled !== undefined) {
          isWebSearchEnabled = savedState.isWebSearchEnabled;
          webSearchToggleBtn.classList.toggle('active', isWebSearchEnabled);
        }
      }
      bindEvents();
      vscode.postMessage({ type: 'refreshContext' });
      updateAttachmentsBar();
    }
    
    function bindEvents() {
      modeChatBtn.addEventListener('click', () => setMode('chat'));
      modeAgentBtn.addEventListener('click', () => setMode('agent'));
      sendBtn.addEventListener('click', sendMessage);
      stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'stopGeneration' }));
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
      attachBtn.addEventListener('click', () => vscode.postMessage({ type: 'selectContextFiles' }));
      webSearchToggleBtn.addEventListener('click', () => {
        isWebSearchEnabled = !isWebSearchEnabled;
        webSearchToggleBtn.classList.toggle('active', isWebSearchEnabled);
        saveState();
      });
      compileBtn.addEventListener('click', () => vscode.postMessage({ type: 'compileCurrentFile' }));
      refreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'refreshContext' }));
      
      settingsBtn.addEventListener('click', () => {
        switchSettingsTab(modelSelect.value === 'local' ? 'local' : 'online');
        vscode.postMessage({ type: 'getSettings' });
        settingsModal.style.display = 'flex';
      });
      closeSettingsBtn.addEventListener('click', () => settingsModal.style.display = 'none');
      saveSettingsBtn.addEventListener('click', saveSettings);
      document.querySelectorAll('.settings-tab').forEach(tab => tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab)));
      modelSelect.addEventListener('change', (e) => switchSettingsTab(e.target.value === 'local' ? 'local' : 'online'));
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
      
      // 新对话按钮事件
      newChatBtn.addEventListener('click', () => {
        history = [];
        chatContainer.innerHTML = '';
        addWelcomeMessage();
        saveState();
      });
    }

    function addWelcomeMessage() {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-message';
        welcomeDiv.innerHTML = \`
          <h3>✨ LLMA Pro 助手已就绪</h3>
          <ul>
            <li>🔄 <strong>聊天模式</strong>: 获取代码建议和解答</li>
            <li>🤖 <strong>Agent 模式</strong>: 创建、修改文件并编译代码</li>
            <li>⚡️ <strong>快捷键</strong>: Ctrl+Shift+B 快速编译当前文件</li>
            <li>💡 <strong>提示</strong>: 拖拽文件或点击 📎 添加上下文，点击 🌐 开启网络搜索</li>
          </ul>
          <div class="feature-badges">
            <span class="badge">代码生成</span>
            <span class="badge">智能预测</span>
            <span class="badge">文件编译</span>
            <span class="badge">联网搜索</span>
            <span class="badge">流式输出</span>
          </div>
        \`;
        chatContainer.appendChild(welcomeDiv);
    }
    
    function setMode(mode) {
      currentMode = mode;
      modeChatBtn.classList.remove('active');
      modeAgentBtn.classList.remove('active');
      (mode === 'chat' ? modeChatBtn : modeAgentBtn).classList.add('active');
      input.placeholder = mode === 'agent' ? "输入指令，例如：'创建 src/utils.ts'..." : "输入问题或代码请求... (Enter 发送)";
      saveState();
    }
    
    function sendMessage() {
      const text = input.value.trim();
      if (!text || isGenerating) return;
      
      addMessage(text, 'user');
      input.value = '';
      input.style.height = 'auto';
      
      isGenerating = true;
      updateButtonState();
      
      vscode.postMessage({
        type: 'sendMessage',
        text: text,
        history: history,
        model: modelSelect.value,
        mode: currentMode,
        files: attachedFiles.map(f => f.path),
        useWebSearch: isWebSearchEnabled
      });
      history.push({ role: 'user', content: text });
      saveState();
    }

    // ========== 渲染逻辑 ==========
    
    function addMessage(text, type, isError = false) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ' + type + '-message';

      if (type === 'warning') {
        messageDiv.className = 'message warning-message';
        messageDiv.innerHTML = '<span>' + escapeHtml(text) + '</span>';
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return;
      }
      
      if (isError) {
        messageDiv.style.background = 'linear-gradient(135deg, var(--danger-color), #c0392b)';
        messageDiv.style.color = 'white';
        messageDiv.innerHTML = formatMessageContent(text, type, true);
      } else if (type === 'ai') {
        let cleanContent = text;
        let reasoning = '';
        const thinkRegex = /<think>([\\s\\S]*?)(?:<\\/think>|$)/gi;
        let match;
        while ((match = thinkRegex.exec(text)) !== null) {
            reasoning += (reasoning ? '\\n' : '') + match[1];
        }
        cleanContent = text.replace(/<think>[\\s\\S]*?(?:<\\/think>|$)/gi, '').trimStart();
        
        let htmlStr = '';
        if (reasoning) {
            htmlStr += '<details class="reasoning-block">' +
                       '<summary>🤔 思考过程</summary>' +
                       '<div class="reasoning-content">' + escapeHtml(reasoning.trim()) + '</div>' +
                       '</details>';
        }
        htmlStr += '<div class="content-block">' + formatMessageContent(cleanContent, type, true) + '</div>';
        messageDiv.innerHTML = htmlStr;
      } else {
        messageDiv.innerHTML = formatMessageContent(text, type, true);
      }
      
      const timeSpan = document.createElement('div');
      timeSpan.className = 'message-time';
      timeSpan.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      messageDiv.appendChild(timeSpan);
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function addSystemMessage(text) {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'system-message';
        sysDiv.textContent = text;
        chatContainer.appendChild(sysDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function addCompilationCard(success, message, filePath, executablePath, language) {
        const div = document.createElement('div');
        div.className = 'compilation-card ' + (success ? 'success' : 'error');
        
        let html = '<div class="comp-header">' + (success ? '✅ 编译成功' : '❌ 编译失败') + '</div>';
        
        // 简单格式化 message，将 code block 包裹的错误信息转为 pre
        // 这里的正则要小心 HTML 转义后的字符
        let formattedMsg = escapeHtml(message)
            .replace(/&#96;&#96;&#96;([\\s\\S]*?)&#96;&#96;&#96;/g, '<pre>$1</pre>')
            .replace(/\\n/g, '<br>');
            
        // 简单替换一下粗体
        formattedMsg = formattedMsg.replace(/\\\*\\\*(.*?)\\\*\\\*/g, '<strong>$1</strong>');

        html += '<div class="comp-details">' + formattedMsg + '</div>';
        
        if (success) {
            html += '<div class="comp-actions">';
            // 注意：onclick 传参需要转义
            const safePath = executablePath.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
            const safeLang = language;
            html += '<button class="btn-run" onclick="window.runExecutable(\\'' + safePath + '\\', \\'' + safeLang + '\\')">▶️ 运行</button>';
            html += '<button class="btn-reveal" onclick="window.revealInExplorer(\\'' + safePath + '\\')">📂 打开所在文件夹</button>';
            html += '</div>';
        }
        
        div.innerHTML = html;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    function formatMessageContent(text, type, isFinal = true) {
      if (type === 'user') return escapeHtml(text);
      
      let html = '';
      let lines = text.split('\\n');
      let inCodeBlock = false;
      let currentLanguage = '';
      let buffer = '';
      
      const mdTicks = String.fromCharCode(96, 96, 96);
      
      lines.forEach(line => {
        if (line.startsWith(mdTicks)) {
          if (!inCodeBlock) {
            inCodeBlock = true;
            currentLanguage = line.substring(3).trim();
            html += buffer;
            buffer = '';
          } else {
            html += '<div class="code-block">' +
                    '<div class="code-header">' +
                    '<span>' + escapeHtml(currentLanguage || 'code') + '</span>' +
                    '<span class="language-tag">' + escapeHtml(currentLanguage || 'text') + '</span>' +
                    '</div>' +
                    '<pre><code>' + escapeHtml(buffer) + '</code></pre>' +
                    '</div>';
            buffer = '';
            inCodeBlock = false;
            currentLanguage = '';
          }
          return;
        }
        
        if (inCodeBlock) {
          buffer += line + '\\n';
        } else {
          if (line.trim().startsWith('> FILE:')) {
            const filePath = line.substring(7).trim();
            const safePath = escapeHtml(filePath);
            
            if (isFinal) {
               html += '<div class="file-action-card" data-filepath="' + safePath + '">' +
                       '<div class="file-header"><span class="file-icon">📄</span><span class="file-path">' + safePath + '</span></div>' +
                       '<div class="action-buttons"><button class="btn-primary apply-btn" onclick="applyFileChange(this, &quot;' + safePath + '&quot;)">⚡️ 审查并应用</button></div>' +
                       '</div>';
            } else {
               html += '<div class="file-action-card generation-pending" data-filepath="' + safePath + '">' +
                       '<div class="file-header"><span class="file-icon">📄</span><span class="file-path">' + safePath + '</span><span style="font-size: 11px; color: var(--text-secondary); margin-left: 8px; font-style: italic;">⏳ 正在生成代码...</span></div>' +
                       '</div>';
            }
          } else if (line.trim()) {
            html += '<p>' + escapeHtml(line) + '</p>';
          }
        }
      });
      if (buffer.trim()) html += buffer;
      return html;
    }
    
    function updateButtonState() {
      if (isGenerating) {
        sendBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
        input.disabled = true;
      } else {
        sendBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        input.disabled = false;
        input.focus();
      }
    }
    
    function renderFileChips() {
      fileChips.innerHTML = '';
      attachedFiles.forEach((file, index) => {
        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.innerHTML = '<span>📄 ' + escapeHtml(file.name) + '</span><span class="remove-chip" data-index="' + index + '">×</span>';
        fileChips.appendChild(chip);
      });
      document.querySelectorAll('.remove-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          attachedFiles.splice(parseInt(btn.dataset.index), 1);
          renderFileChips();
          updateAttachmentsBar();
          saveState();
        });
      });
    }
    
    function updateAttachmentsBar() {
      attachmentsBar.style.display = attachedFiles.length > 0 ? 'flex' : 'none';
    }
    
    function switchSettingsTab(tabId) {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
      document.getElementById('online-settings').style.display = tabId === 'online' ? 'block' : 'none';
      document.getElementById('local-settings').style.display = tabId === 'local' ? 'block' : 'none';
      document.getElementById('websearch-settings').style.display = tabId === 'websearch' ? 'block' : 'none';
      activeSettingsTab = tabId;
    }
    
    function saveSettings() {
      const settings = {};
      if (activeSettingsTab === 'online') {
        settings.deepseekApiKey = document.getElementById('key-deepseek').value;
        settings.qwenApiKey = document.getElementById('key-qwen').value;
        settings.doubanApiKey = document.getElementById('key-douban').value;
        settings.doubanModel = document.getElementById('model-douban').value;
        settings.zhipuApiKey = document.getElementById('key-zhipu').value;
        settings.huggingfaceApiKey = document.getElementById('key-huggingface').value;
        settings.huggingfaceModel = document.getElementById('model-huggingface').value;
      } else if (activeSettingsTab === 'local') {
        settings.localModelEnabled = document.getElementById('local-enabled').checked;
        settings.localModelBaseUrl = document.getElementById('local-base-url').value;
        settings.localModelName = document.getElementById('local-model-name').value;
        settings.localModelTimeout = parseInt(document.getElementById('local-timeout').value) || 120000;
      } else if (activeSettingsTab === 'websearch') {
        settings.enableWebSearch = document.getElementById('websearch-enabled').checked;
        settings.serpApiKey = document.getElementById('serp-api-key').value;
      }
      vscode.postMessage({ type: 'saveSettings', settings: settings });
      document.getElementById('settings-modal').style.display = 'none';
    }
    
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function saveState() {
      vscode.setState({ attachedFiles, currentMode, isWebSearchEnabled });
    }
    
    // 全局函数：供编译结果卡片调用
    window.runExecutable = function(path, language) {
        vscode.postMessage({ type: 'runExecutable', path: path, language: language });
    };

    window.revealInExplorer = function(path) {
        vscode.postMessage({ type: 'revealInExplorer', path: path });
    };

    window.applyFileChange = function(btnElem, filePath) {
      const card = btnElem.closest('.file-action-card');
      let nextElem = card.nextElementSibling;
      let codeContent = '';
      
      while(nextElem) {
        if (nextElem.classList.contains('code-block')) {
          const codeNode = nextElem.querySelector('code');
          if (codeNode) {
             codeContent = codeNode.textContent;
          }
          break;
        }
        if (nextElem.classList.contains('file-action-card')) break;
        nextElem = nextElem.nextElementSibling;
      }

      if (!codeContent) {
        const messageDiv = btnElem.closest('.message');
        const codeBlocks = Array.from(messageDiv.querySelectorAll('.code-block code'));
        if (codeBlocks.length > 0) {
           codeContent = codeBlocks[0].textContent;
        }
      }

      if (!codeContent) {
         btnElem.textContent = '❌ 未找到代码块';
         setTimeout(() => { btnElem.textContent = '⚡️ 审查并应用'; }, 2000);
         return;
      }

      btnElem.textContent = '⏳ 应用中...';
      btnElem.disabled = true;

      vscode.postMessage({ type: 'applyFileChange', filepath: filePath, content: codeContent });
    };

    window.saveFile = function(btnElem, filePath) {
      btnElem.textContent = '⏳ 保存中...';
      btnElem.disabled = true;
      vscode.postMessage({ type: 'saveFile', filepath: filePath });
    };

    window.revertFile = function(btnElem, filePath) {
      btnElem.textContent = '⏳ 撤销中...';
      btnElem.disabled = true;
      vscode.postMessage({ type: 'revertFile', filepath: filePath });
    };
    
    // ========== 消息接收核心处理 (支持流式) ==========
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.type) {
        case 'addResponse':
          addMessage(message.text, 'ai');
          const cleanHistoryText = message.text.replace(/<think>[\\s\\S]*?(?:<\\/think>|$)/gi, '').trimStart();
          history.push({ role: 'assistant', content: cleanHistoryText });
          isGenerating = false;
          updateButtonState();
          break;
          
        case 'addErrorResponse':
          addMessage(message.text, 'ai', true);
          isGenerating = false;
          updateButtonState();
          break;

        case 'addWarningResponse':
          addMessage(message.text, 'warning');
          isGenerating = false;
          updateButtonState();
          const tempSearch = document.getElementById('temp-search-status');
          if(tempSearch) tempSearch.remove();
          break;

        case 'addSystemMessage':
          addSystemMessage(message.text);
          break;

        case 'compilationResult':
          addCompilationCard(message.success, message.message, message.filePath, message.executablePath, message.language);
          break;

        case 'fileChangeApplied':
          const safePathApplied = escapeHtml(message.filepath);
          const applyCards = document.querySelectorAll('div.file-action-card[data-filepath="' + safePathApplied + '"]');
          if (applyCards.length > 0) {
              const targetCard = applyCards[applyCards.length - 1];
              const actionArea = targetCard.querySelector('.action-buttons');
              if (actionArea) {
                  actionArea.innerHTML = '<span style="font-size: 11px; margin-right: 8px; color: var(--success-color);">✅ 已写入编辑器</span>' +
                                         '<button class="btn-primary apply-btn" onclick="applyFileChange(this, &quot;' + safePathApplied + '&quot;)">🔄 重新应用</button> ' +
                                         '<button class="btn-success" onclick="saveFile(this, &quot;' + safePathApplied + '&quot;)">💾 保存</button> ' +
                                         '<button class="btn-danger" onclick="revertFile(this, &quot;' + safePathApplied + '&quot;)">↩️ 撤销</button>';
              }
          }
          break;
          
        case 'fileChangeSaved':
          const safePathSaved = escapeHtml(message.filepath);
          const savedCards = document.querySelectorAll('div.file-action-card[data-filepath="' + safePathSaved + '"]');
          if (savedCards.length > 0) {
              const targetCard = savedCards[savedCards.length - 1];
              const actionArea = targetCard.querySelector('.action-buttons');
              if (actionArea) {
                  actionArea.innerHTML = '<span style="font-size: 11px; margin-right: 8px; color: var(--success-color);">✅ 文件已固化保存</span>' +
                                         '<button class="btn-primary apply-btn" onclick="applyFileChange(this, &quot;' + safePathSaved + '&quot;)">🔄 重新应用</button> ' +
                                         '<button class="btn-danger" onclick="revertFile(this, &quot;' + safePathSaved + '&quot;)">↩️ 撤销</button>';
              }
          }
          break;
          
        case 'fileChangeReverted':
          const safePathReverted = escapeHtml(message.filepath);
          const revertedCards = document.querySelectorAll('div.file-action-card[data-filepath="' + safePathReverted + '"]');
          if (revertedCards.length > 0) {
              const targetCard = revertedCards[revertedCards.length - 1];
              const actionArea = targetCard.querySelector('.action-buttons');
              if (actionArea) {
                  actionArea.innerHTML = '<span style="font-size: 11px; margin-right: 8px; color: var(--danger-color);">❌ 已撤销更改</span>' +
                                         '<button class="btn-primary apply-btn" onclick="applyFileChange(this, &quot;' + safePathReverted + '&quot;)">⚡️ 重新应用</button>';
              }
          }
          break;

        case 'fileChangeError':
          const safePathError = escapeHtml(message.filepath);
          const errorCards = document.querySelectorAll('div.file-action-card[data-filepath="' + safePathError + '"]');
          if (errorCards.length > 0) {
              const targetCard = errorCards[errorCards.length - 1];
              const applyBtn = targetCard.querySelector('.apply-btn');
              if (applyBtn) {
                 applyBtn.textContent = '⚡️ 重试应用';
                 applyBtn.disabled = false;
              }
          }
          break;

        case 'streamStart':
          isGenerating = true;
          updateButtonState();
          currentAiContent = '';
          currentAiReasoning = '';
          
          currentAiMessageDiv = document.createElement('div');
          currentAiMessageDiv.className = 'message ai-message';
          
          const timeSpanHtml = '<div class="message-time">' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>';
          currentAiMessageDiv.dataset.timeHtml = timeSpanHtml;
          
          currentAiMessageDiv.innerHTML = '<span style="color:#aaa; font-style:italic;">正在思考中...</span>';
          chatContainer.appendChild(currentAiMessageDiv);
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
          
        case 'streamUpdate':
          if (!currentAiMessageDiv) return;
          
          if (message.reasoning) currentAiReasoning += message.reasoning;
          if (message.content) currentAiContent += message.content;
          
          let extractedReasoning = currentAiReasoning;
          let cleanStreamContent = currentAiContent;
          
          const thinkRegexUpdate = /<think>([\\s\\S]*?)(?:<\\/think>|$)/gi;
          let matchUpdate;
          while ((matchUpdate = thinkRegexUpdate.exec(currentAiContent)) !== null) {
              extractedReasoning += (extractedReasoning ? '\\n' : '') + matchUpdate[1];
          }
          cleanStreamContent = currentAiContent.replace(/<think>[\\s\\S]*?(?:<\\/think>|$)/gi, '').trimStart();
          
          let htmlStrUpdate = '';
          
          if (extractedReasoning) {
             htmlStrUpdate += '<details class="reasoning-block" open>' +
                              '<summary>🤔 思考过程</summary>' +
                              '<div class="reasoning-content">' + escapeHtml(extractedReasoning.trim()) + '</div>' +
                              '</details>';
          }
          
          if (cleanStreamContent) {
             // isFinal = false 阻止在此处生成带按钮的操作卡片，以防闪烁
             htmlStrUpdate += '<div class="content-block">' + formatMessageContent(cleanStreamContent, 'ai', false) + '</div>';
          } else if (extractedReasoning) {
             htmlStrUpdate += '<div style="color:#aaa; font-style:italic; font-size:12px; margin-top:5px;">思考完毕，正在生成代码...</div>';
          }
          
          htmlStrUpdate += currentAiMessageDiv.dataset.timeHtml;
          currentAiMessageDiv.innerHTML = htmlStrUpdate;
          
          chatContainer.scrollTop = chatContainer.scrollHeight;
          break;
          
        case 'streamEnd':
          if (currentAiMessageDiv) {
              const details = currentAiMessageDiv.querySelector('details.reasoning-block');
              if (details) {
                  details.removeAttribute('open');
              }
              
              // 在流输出结束时，重新渲染生成拥有完全功能的按钮 (isFinal = true)
              const finalCleanContent = currentAiContent.replace(/<think>[\\s\\S]*?(?:<\\/think>|$)/gi, '').trimStart();
              
              let extractedReasoningEnd = '';
              const thinkRegexEnd = /<think>([\\s\\S]*?)(?:<\\/think>|$)/gi;
              let matchEnd;
              while ((matchEnd = thinkRegexEnd.exec(currentAiContent)) !== null) {
                  extractedReasoningEnd += (extractedReasoningEnd ? '\\n' : '') + matchEnd[1];
              }

              let finalHtml = '';
              if (extractedReasoningEnd) {
                 finalHtml += '<details class="reasoning-block">' +
                              '<summary>🤔 思考过程</summary>' +
                              '<div class="reasoning-content">' + escapeHtml(extractedReasoningEnd.trim()) + '</div>' +
                              '</details>';
              }
              
              finalHtml += '<div class="content-block">' + formatMessageContent(finalCleanContent, 'ai', true) + '</div>';
              finalHtml += currentAiMessageDiv.dataset.timeHtml;
              currentAiMessageDiv.innerHTML = finalHtml;
          }
          
          const finalCleanContentHistory = currentAiContent.replace(/<think>[\\s\\S]*?(?:<\\/think>|$)/gi, '').trimStart();
          history.push({ role: 'assistant', content: finalCleanContentHistory });
          isGenerating = false;
          updateButtonState();
          currentAiMessageDiv = null;
          break;
          
        case 'showSearchStatus':
          const statusDiv = document.createElement('div');
          statusDiv.className = 'message ai-message';
          statusDiv.style.background = 'transparent';
          statusDiv.style.border = 'none';
          statusDiv.style.color = 'var(--info-color)';
          statusDiv.style.fontStyle = 'italic';
          statusDiv.textContent = message.text;
          chatContainer.appendChild(statusDiv);
          chatContainer.scrollTop = chatContainer.scrollHeight;
          statusDiv.id = 'temp-search-status';
          break;

        case 'updateContextInfo':
          document.getElementById('context-text').textContent = message.text;
          break;
          
        case 'filesSelected':
          message.files.forEach(file => { if (!attachedFiles.some(f => f.path === file.path)) attachedFiles.push(file); });
          renderFileChips();
          updateAttachmentsBar();
          saveState();
          break;
          
        case 'updateSettings':
          if (message.settings.deepseekApiKey) document.getElementById('key-deepseek').value = message.settings.deepseekApiKey;
          if (message.settings.qwenApiKey) document.getElementById('key-qwen').value = message.settings.qwenApiKey;
          if (message.settings.doubanApiKey) document.getElementById('key-douban').value = message.settings.doubanApiKey;
          if (message.settings.doubanModel) document.getElementById('model-douban').value = message.settings.doubanModel;
          if (message.settings.zhipuApiKey) document.getElementById('key-zhipu').value = message.settings.zhipuApiKey;
          if (message.settings.huggingfaceApiKey) document.getElementById('key-huggingface').value = message.settings.huggingfaceApiKey;
          if (message.settings.huggingfaceModel) document.getElementById('model-huggingface').value = message.settings.huggingfaceModel;
          if (message.settings.localModelEnabled !== undefined) document.getElementById('local-enabled').checked = message.settings.localModelEnabled;
          if (message.settings.localModelBaseUrl) document.getElementById('local-base-url').value = message.settings.localModelBaseUrl;
          if (message.settings.localModelName) document.getElementById('local-model-name').value = message.settings.localModelName;
          if (message.settings.localModelTimeout) document.getElementById('local-timeout').value = message.settings.localModelTimeout;
          if (message.settings.enableWebSearch !== undefined) {
             document.getElementById('websearch-enabled').checked = message.settings.enableWebSearch;
             if (message.settings.enableWebSearch && !isWebSearchEnabled && !vscode.getState()?.hasOwnProperty('isWebSearchEnabled')) {
                isWebSearchEnabled = true;
                webSearchToggleBtn.classList.add('active');
             }
          }
          if (message.settings.serpApiKey) document.getElementById('serp-api-key').value = message.settings.serpApiKey;
          break;
      }
      
      if (message.type === 'streamStart' || message.type === 'addResponse') {
         const tempSearch = document.getElementById('temp-search-status');
         if (tempSearch) tempSearch.remove();
      }
    });
    
    init();
  </script>
</body>
</html>`;
  }
}

/**
 * 智能代码生成 (Ctrl+Shift+A) (保持非流式)
 */
async function handleExplicitCodeGeneration() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('请先打开一个编辑器');
    return;
  }

  const document = editor.document;
  const selection = editor.selection;
  const cursorLine = selection.active.line;

  const startContextLine = Math.max(0, cursorLine - 100);
  const endContextLine = Math.min(document.lineCount - 1, cursorLine + 20);

  const textBefore = document.getText(new vscode.Range(startContextLine, 0, selection.start.line, selection.start.character));
  const textSelected = document.getText(selection);
  const textAfter = document.getText(new vscode.Range(selection.end.line, selection.end.character, endContextLine, document.lineAt(endContextLine).range.end.character));

  const currentIndent = document.lineAt(cursorLine).text.match(/^\s*/)?.[0] || '';

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "LLMA 正在生成代码...",
      cancellable: true
    }, async (progress, token) => {

      const config = vscode.workspace.getConfiguration('llma');
      const currentModel = config.get<string>('currentModel') || 'deepseek';
      const apiKey = getApiKey(config, currentModel);

      if (!apiKey) {
        vscode.window.showErrorMessage(`请先配置 ${currentModel} 的 API 密钥`);
        return;
      }

      progress.report({ increment: 20 });

      const isInsertion = textSelected.trim().length === 0;
      let systemPrompt = `You are an expert coding assistant. Return ONLY the code block. No markdown fencing, no explanation. Maintain indentation: "${currentIndent}".`;
      let userPrompt = "";

      if (isInsertion) {
        userPrompt = `[FILE: ${path.basename(document.fileName)}]\n[LANGUAGE: ${document.languageId}]\n[CODE BEFORE CURSOR]:\n${textBefore}\n<CURSOR>\n[CODE AFTER CURSOR]:\n${textAfter}\n\nINSTRUCTION: Generate the code that belongs at <CURSOR>. Just the code.`;
      } else {
        userPrompt = `[FILE: ${path.basename(document.fileName)}]\n[CONTEXT BEFORE]:\n${textBefore.slice(-500)}\n\n[SELECTED CODE TO PROCESS]:\n${textSelected}\n\n[INSTRUCTION]:\nOptimize, fix, or implement the logic described in the selected code.\nReturn only the replaced code.`;
      }

      progress.report({ increment: 40 });

      // 使用 callSimpleAI（非流式）
      const completion = await callSimpleAI(
        currentModel, apiKey, systemPrompt, userPrompt, 2000, 0.2, config
      );

      if (token.isCancellationRequested) { return; }

      if (completion) {
        progress.report({ increment: 90 });
        await editor.edit(editBuilder => {
          let cleanCode = completion.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
          if (selection.isEmpty) {
            editBuilder.insert(selection.active, cleanCode);
          } else {
            editBuilder.replace(selection, cleanCode);
          }
        });
      }
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(`生成失败: ${error.message}`);
  }
}

/**
 * 行内代码预测提供者 (Ghost Text)
 */
class LLMAInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private _abortController: AbortController | null = null;
  private _timer: NodeJS.Timeout | null = null;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {

    const config = vscode.workspace.getConfiguration('llma');
    if (!config.get<boolean>('enableAutoCompletion')) { return []; }

    if (this._timer) { clearTimeout(this._timer); }
    if (this._abortController) { this._abortController.abort(); }

    const delay = config.get<number>('requestDelay') || 300;

    return new Promise((resolve) => {
      this._timer = setTimeout(async () => {
        if (token.isCancellationRequested) { resolve([]); return; }

        try {
          updateStatusBar(true);
          this._abortController = new AbortController();
          const signal = this._abortController.signal;

          token.onCancellationRequested(() => {
            this._abortController?.abort();
            updateStatusBar(false);
            resolve([]);
          });

          const promptData = this.prepareSmartContext(document, position);
          if (!promptData) {
            updateStatusBar(false);
            resolve([]);
            return;
          }

          const completionText = await this.fetchAICompletion(promptData, config, signal);

          if (!completionText || completionText.trim().length === 0) {
            updateStatusBar(false);
            resolve([]);
            return;
          }

          const item = new vscode.InlineCompletionItem(
            completionText,
            new vscode.Range(position, position)
          );

          updateStatusBar(false);
          resolve([item]);

        } catch (error) {
          updateStatusBar(false);
          resolve([]);
        }
      }, delay);
    });
  }

  private prepareSmartContext(document: vscode.TextDocument, position: vscode.Position) {
    const windowSizeLines = 60;
    const startLine = Math.max(0, position.line - windowSizeLines);
    const endLine = Math.min(document.lineCount - 1, position.line + 10);

    const rangeBefore = new vscode.Range(startLine, 0, position.line, position.character);
    const rangeAfter = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).range.end.character);

    const textBefore = document.getText(rangeBefore);
    const textAfter = document.getText(rangeAfter);

    if (textBefore.trim().length < 1) { return null; }

    return {
      prefix: textBefore,
      suffix: textAfter,
      language: document.languageId,
      filename: path.basename(document.fileName)
    };
  }

  private async fetchAICompletion(
    data: { prefix: string, suffix: string, language: string, filename: string },
    config: vscode.WorkspaceConfiguration,
    signal: AbortSignal
  ): Promise<string> {
    const model = config.get<string>('currentModel') || 'deepseek';
    const apiKey = getApiKey(config, model);
    if (!apiKey) { return ''; }

    const systemPrompt = `You are a code completion engine. Output ONLY the code to fill the <CURSOR> gap. DO NOT repeat prefix/suffix. No Markdown.`;
    const userPrompt = `File: ${data.filename}\nLang: ${data.language}\n\n[CODE START]\n${data.prefix}<CURSOR>${data.suffix}\n[CODE END]\n\nTask: Fill in <CURSOR>.`;
    const maxTokens = 100;
    return await callSimpleAI(model, apiKey, systemPrompt, userPrompt, maxTokens, 0.0, config, signal);
  }
}

// --- 联网搜索功能 (使用 SerpApi) ---

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchWeb(query: string, apiKey: string, engine: string = "google"): Promise<SearchResult[]> {
  const url = 'https://serpapi.com/search.json';
  try {
    // 同样应用代理配置
    const proxyAgent = getProxyAgent(url);
    const axiosConfig: any = {
      params: { q: query, engine: engine, api_key: apiKey, hl: 'zh-cn', gl: 'cn' },
      timeout: 20000,
      ...(proxyAgent && {
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        proxy: false
      })
    };

    const response = await axios.get(url, axiosConfig);
    const results: SearchResult[] = [];
    if (response.data && response.data.organic_results) {
      response.data.organic_results.slice(0, 5).forEach((item: any) => {
        results.push({ title: item.title, url: item.link, snippet: item.snippet || '无内容摘要' });
      });
    }
    return results;
  } catch (error: any) {
    console.error('网络搜索失败:', error.message);
    throw new Error(`网络搜索失败: ${error.message}`);
  }
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return '未找到相关结果。';
  }
  let formatted = '🌐 网络搜索结果:\n\n';
  results.forEach((result, index) => {
    formatted += `${index + 1}. **${result.title}**\n   ${result.snippet}\n   来源: ${result.url}\n\n`;
  });
  return formatted;
}

// --- 代理与重试辅助函数 ---

function getProxyAgent(url: string) {
  const proxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
  if (!proxy) return undefined;
  const isHttps = url.startsWith('https');
  return isHttps ? new HttpsProxyAgent(proxy) : new HttpProxyAgent(proxy);
}

function isRetryableError(err: any): boolean {
  const code = err.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED' ||
         err.message?.includes('socket hang up') ||
         (err.response?.status >= 500 && err.response?.status < 600);
}

async function axiosPostWithRetry(url: string, payload: any, config: any, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.post(url, payload, config);
    } catch (err: any) {
      const isLast = i === retries;
      if (isLast || !isRetryableError(err)) throw err;
      const delay = (i + 1) * 1000;
      console.log(`请求失败 (${err.code || err.message})，${delay}ms后重试... (${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('重试耗尽');
}

// --- API 调用函数 ---

/**
 * 非流式简单调用 (用于 Ghost text 等)
 */
async function callSimpleAI(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  config: vscode.WorkspaceConfiguration,
  signal?: AbortSignal
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  return await callChatAI(model, apiKey, messages, config, maxTokens, temperature, signal);
}

/**
 * 通用聊天 API 调用，支持 SSE 流式返回
 * 如果传入了 onUpdate，将启用 stream=true
 */
async function callChatAI(
  model: string,
  apiKey: string | undefined,
  messages: any[],
  config: vscode.WorkspaceConfiguration,
  maxTokens: number = 2000,
  temperature: number = 0.7,
  signal?: AbortSignal,
  onUpdate?: (contentDelta: string, reasoningDelta: string) => void
): Promise<string> {
  let url = '';
  const isStreaming = !!onUpdate;

  let payload: any = {
    messages: messages,
    max_tokens: maxTokens,
    temperature: temperature,
    stream: isStreaming
  };

  const headers: any = {
    'Content-Type': 'application/json'
  };

  if (model === 'local') {
    const baseUrl = config.get<string>('localModel.baseUrl') || 'http://localhost:11434/v1';
    url = `${baseUrl}/chat/completions`;
    payload.model = config.get<string>('localModel.modelName') || 'llama3';
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  } else if (model === 'deepseek') {
    url = 'https://api.deepseek.com/chat/completions';
    payload.model = 'deepseek-coder';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'qwen') {
    const baseUrl = config.get<string>('qwenBaseUrl') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    url = `${baseUrl}/chat/completions`;
    payload.model = 'qwen-coder-turbo';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'douban') {
    url = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    payload.model = config.get<string>('doubanModel') || '';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'zhipu') {
    url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    payload.model = 'glm-4';
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (model === 'huggingface') {
    url = 'https://router.huggingface.co/v1/chat/completions';
    payload.model = config.get<string>('huggingfaceModel') || 'meta-llama/Meta-Llama-3-8B-Instruct';
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // 统一获取代理配置
  const proxyAgent = getProxyAgent(url);
  const axiosConfig: any = {
    headers,
    signal,
    timeout: 120000, // 延长至120秒
    ...(proxyAgent && {
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      proxy: false // 禁止 axios 自动使用环境代理
    })
  };

  if (!isStreaming) {
    // === 非流式请求（带重试） ===
    try {
      const response = await axiosPostWithRetry(url, payload, axiosConfig, 2);
      return response.data.choices[0]?.message?.content || '';
    } catch (error: any) {
      if (!axios.isCancel(error)) {
        if (error.response) console.error('Data:', error.response.data);
        throw error;
      }
      return '';
    }
  } else {
    // === 流式请求（不支持自动重试，但应用代理和超时） ===
    return new Promise(async (resolve, reject) => {
      try {
        const response = await axios.post(url, payload, {
          ...axiosConfig,
          responseType: 'stream'
        });

        let fullContent = '';
        let fullReasoning = '';
        let buffer = '';

        response.data.on('data', (chunk: any) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.substring(6);
              if (dataStr === '[DONE]') {
                continue;
              }

              try {
                const data = JSON.parse(dataStr);
                const delta = data.choices?.[0]?.delta;

                if (delta) {
                  const contentDelta = delta.content || '';
                  const reasoningDelta = delta.reasoning_content || '';

                  if (contentDelta || reasoningDelta) {
                    fullContent += contentDelta;
                    fullReasoning += reasoningDelta;
                    onUpdate?.(contentDelta, reasoningDelta);
                  }
                }
              } catch (e) {
                // 忽略被截断的不完整 JSON 报错
              }
            }
          }
        });

        response.data.on('end', () => {
          resolve(fullContent);
        });

        response.data.on('error', (err: any) => {
          reject(err);
        });

      } catch (error: any) {
        if (!axios.isCancel(error)) {
          reject(error);
        } else {
          resolve('');
        }
      }
    });
  }
}

// --- 辅助函数 ---

function updateStatusBar(isLoading: boolean) {
  const config = vscode.workspace.getConfiguration('llma');
  const enabled = config.get<boolean>('enableAutoCompletion');
  if (!enabled) {
    statusBarItem.text = `$(circle-slash) LLMA Off`;
  } else if (isLoading) {
    statusBarItem.text = `$(sync~spin) LLMA...`;
  } else {
    statusBarItem.text = `$(hubot) LLMA`;
  }
}

function getApiKey(config: vscode.WorkspaceConfiguration, model: string): string | undefined {
  if (model === 'local') {
    return 'local';
  }
  switch (model) {
    case 'deepseek': return config.get<string>('deepseekApiKey');
    case 'qwen': return config.get<string>('qwenApiKey');
    case 'douban': return config.get<string>('doubanApiKey');
    case 'zhipu': return config.get<string>('zhipuApiKey');
    case 'huggingface': return config.get<string>('huggingfaceApiKey');
    default: return undefined;
  }
}