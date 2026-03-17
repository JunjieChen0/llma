import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { globalChatProvider } from './extension'; // 保留从 extension 导入

// 定义并导出 runTerminal
export let runTerminal: vscode.Terminal | undefined;

// 文件类型映射
export function getLanguageFromExtension(ext: string): string | null {
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

export function getExecutableName(baseName: string, language: string): string {
  if (process.platform === 'win32') {
    if (language === 'java'){ return `${baseName}.class`;}
    return `${baseName}.exe`;
  }
  if (['python', 'javascript', 'ruby', 'php', 'typescript'].includes(language)) {
    return baseName;
  }
  if (language === 'java'){ return `${baseName}.class`;}
  return baseName;
}

export function getShellPath(): string {
  if (process.platform === 'win32') {
    return process.env.PSModulePath ? 'powershell.exe' : (process.env.COMSPEC || 'cmd.exe');
  }
  return process.env.SHELL || '/bin/bash';
}

export function getChangeDirectoryCommand(dirPath: string): string {
  const normalizedPath = dirPath.replace(/\\/g, '\\\\');
  if (process.platform === 'win32') {
    return process.env.PSModulePath
      ? `Set-Location -Path '${normalizedPath}'`
      : `cd /d "${normalizedPath}"`;
  } else {
    return `cd "${normalizedPath}"`;
  }
}

function hasUserCompilerOverride(config: vscode.WorkspaceConfiguration, language: string): boolean {
  const inspected = config.inspect<any>('compilation.compilers');
  const merged = [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue];
  return merged.some(value =>
    value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, language)
  );
}

function getNativeSourceExtensions(language: string): string[] {
  if (language === 'c') {
    return ['.c'];
  }
  if (language === 'cpp') {
    return ['.cpp', '.cc', '.cxx'];
  }
  if (language === 'cangjie') {
    return ['.cj'];
  }
  return [];
}

/**
 * 收集同目录下需要参与链接的 C/C++ 源文件。
 * - 仅在默认编译命令下启用，避免影响用户自定义命令语义。
 * - 若目录中存在多个同语言源文件，则全部参与链接。
 */
function buildNativeSourcesArgument(filePath: string, language: string): string {
  const exts = getNativeSourceExtensions(language);
  if (exts.length === 0) {
    return `"${filePath}"`;
  }

  const fileDir = path.dirname(filePath);
  const normalizedCurrent = path.normalize(filePath);
  const collected: string[] = [normalizedCurrent];

  try {
    const entries = fs.readdirSync(fileDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!exts.includes(ext)) {
        continue;
      }
      const candidate = path.join(fileDir, entry.name);
      if (path.normalize(candidate) === normalizedCurrent) {
        continue;
      }
      collected.push(candidate);
    }
  } catch {
    // 回退到仅编译当前文件，保持兼容性
  }

  return collected.map(p => `"${p}"`).join(' ');
}

// 编译主函数
export async function compileFile(filePath: string, options: {
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

    const language = getLanguageFromExtension(fileExt);
    if (!language) {
      vscode.window.showErrorMessage(`不支持的文件类型: ${fileExt}`);
      return;
    }

    let outputDir: string;
    if (options.outputPath) {
      outputDir = path.dirname(options.outputPath);
    } else {
      outputDir = path.join(fileDir, defaultOutputDir);
    }

    const executableName = getExecutableName(fileNameWithoutExt, language);
    const outputPath = options.outputPath || path.join(outputDir, executableName);

    let compileCommand = options.customCommand || compilers[language];
    if (!compileCommand) {
      vscode.window.showErrorMessage(`未配置 ${language} 语言的编译命令`);
      return;
    }

    if (language === 'java' && !options.customCommand) {
      compileCommand = compilers['java'] || `javac -d "{outputDir}" "{file}"`;
    }

    // 仓颉语言特殊处理：支持多文件编译和包管理
    if (language === 'cangjie' && !options.customCommand) {
      // 检测当前目录是否有仓颉项目配置文件
      const fs = require('fs');
      const cjpmToml = path.join(fileDir, 'cjpm.toml');
      const cjcJson = path.join(fileDir, 'cjc.json');
      
      if (fs.existsSync(cjpmToml) || fs.existsSync(cjcJson)) {
        // 使用仓颉包管理器编译
        compileCommand = `cjpm build`;
        // 仓颉包管理器会自动处理输出路径
        if (options.outputPath) {
          compileCommand = compilers['cangjie'] || `cjc "{file}" -o "{executable}"`;
        }
      } else {
        // 单文件模式，使用 cjc 直接编译
        compileCommand = compilers['cangjie'] || `cjc "{file}" -o "{executable}"`;
      }
    }

    const allFilesArg = buildNativeSourcesArgument(filePath, language);
    if (!options.customCommand && (language === 'c' || language === 'cpp') && !hasUserCompilerOverride(config, language)) {
      // 兼容旧模板（仅含 {file}），在默认命令下自动升级为多文件链接。
      if (!compileCommand.includes('{allFiles}') && compileCommand.includes('{file}')) {
        compileCommand = compileCommand.replace(/{file}/g, '{allFiles}');
      }
    }

    compileCommand = compileCommand
      .replace(/{file}/g, `"${filePath}"`)
      .replace(/{allFiles}/g, allFilesArg)
      .replace(/{executable}/g, `"${outputPath}"`)
      .replace(/{fileDir}/g, `"${fileDir}"`)
      .replace(/{fileName}/g, fileName)
      .replace(/{fileNameWithoutExt}/g, fileNameWithoutExt)
      .replace(/{outputDir}/g, `"${outputDir}"`);

    if (options.args && options.args.length > 0) {
      compileCommand += ` ${options.args.join(' ')}`;
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (globalChatProvider) {
      globalChatProvider.postMessageToWebview({
        type: 'addSystemMessage',
        text: `⏳ 正在编译/检查: ${fileName}...`
      });
    } else {
      vscode.window.setStatusBarMessage(`正在编译: ${fileName}...`, 3000);
    }

    await executeCompilationSilent(compileCommand, filePath, outputPath, language, fileDir);

  } catch (error: any) {
    vscode.window.showErrorMessage(`编译流程错误: ${error.message}`);
  }
}

export async function showCompilationOptions(filePath: string) {
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
          message: `❌ **编译失败**\n\n\`\`\`text\n${output.trim()}\n\`\`\``,
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

    if (output.trim()) {
      successMessage += `\n\n\`\`\`text\n${output.trim()}\n\`\`\``;
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

export async function runExecutable(targetPath: string, language: string) {
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

  const effectiveLanguage = language || getLanguageFromExtension(ext) || '';
  
  if (effectiveLanguage === 'java' && ext === '.class') {
    const className = path.basename(targetPath, '.class');
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    runCommand = `java ${className}`;
  } 
  else if (effectiveLanguage === 'python' || ext === '.py') {
    const pythonInfo = await getPythonRunCommand(targetPath);
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    const safeInterpreter = pythonInfo.interpreter.replace(/\\/g, '\\\\');
    if (process.platform === 'win32') {
      runCommand = `& "${safeInterpreter}" "${baseName}"`;
    } else {
      runCommand = `"${safeInterpreter}" "${baseName}"`;
    }
  } 
  else if (effectiveLanguage === 'javascript' || ext === '.js') {
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    runCommand = `node "${baseName}"`;
  } 
  else if (effectiveLanguage === 'typescript' || ext === '.ts') {
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    runCommand = `npx ts-node "${baseName}"`; 
  }
  else if (effectiveLanguage === 'cangjie' || ext === '.cj') {
    // 仓颉语言运行支持
    runTerminal.sendText(getChangeDirectoryCommand(execDir));
    // 检测是否使用仓颉包管理器运行
    const cangjieProjectConfig = findCangjieProjectConfig(execDir);
    if (cangjieProjectConfig) {
      // 使用仓颉包管理器运行 - 先检查 cjpm.toml 是否存在
      const fs = require('fs');
      const cjpmToml = path.join(execDir, 'cjpm.toml');
      if (fs.existsSync(cjpmToml)) {
        runCommand = `cjpm run`;
      } else {
        // 虽然有配置文件但不在当前目录，使用 cjc 编译运行
        if (process.platform === 'win32') {
          runCommand = `& ".\\${baseName}"`;
        } else {
          runCommand = `"./${baseName}"`;
        }
      }
    } else {
      // 直接运行编译后的可执行文件
      if (process.platform === 'win32') {
        runCommand = `& ".\\${baseName}"`;
      } else {
        runCommand = `"./${baseName}"`;
      }
    }
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

// Python 相关函数
export function getPythonInterpreterPath(): string | undefined {
  const config = vscode.workspace.getConfiguration('llma');
  const interpreterPath = config.get<string>('python.interpreterPath');
  if (interpreterPath && interpreterPath.trim() !== '') {
    if (path.isAbsolute(interpreterPath)){ return interpreterPath;}
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const absolutePath = path.join(workspaceFolders[0].uri.fsPath, interpreterPath);
      if (fs.existsSync(absolutePath)){ return absolutePath;}
    }
  }
  return undefined;
}

export function detectPythonInterpreter(): string {
  const config = vscode.workspace.getConfiguration('llma');
  const preferredCommand = config.get<string>('python.preferredCommand') || 'auto';
  const configuredPath = getPythonInterpreterPath();
  if (configuredPath){ return configuredPath;}
  if (preferredCommand !== 'auto'){ return preferredCommand;}
  return process.platform === 'win32' ? 'py' : 'python3';
}

export function detectVirtualEnv(filePath: string): string | undefined {
  const config = vscode.workspace.getConfiguration('llma');
  if (!config.get<boolean>('python.autoDetectVirtualEnv')){ return undefined;}
  
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
        if (fs.existsSync(pythonPath)){ return pythonPath;}
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return undefined;
}

export async function checkPythonVersion(pythonPath: string): Promise<string | undefined> {
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

/**
 * 检测仓颉项目配置文件
 * @param dirPath 目录路径
 * @returns 如果找到配置文件返回 true，否则返回 false
 */
export function findCangjieProjectConfig(dirPath: string): boolean {
  const configFiles = ['cjc.json', 'cjpm.toml', 'Cangjie.toml'];
  let currentDir = dirPath;
  let maxDepth = 5;

  while (maxDepth-- > 0 && currentDir !== path.dirname(currentDir)) {
    for (const configFile of configFiles) {
      const configPath = path.join(currentDir, configFile);
      if (fs.existsSync(configPath)) {
        return true;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  return false;
}

export async function getPythonRunCommand(filePath: string): Promise<{ command: string; interpreter: string; version?: string }> {
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