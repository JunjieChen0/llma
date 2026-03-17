/**
 * 工具函数集合文件
 * 
 * 提供扩展中使用的各种工具函数，包括：
 * - 代理配置：获取 HTTP/HTTPS 代理代理
 * - 网络请求：带重试机制的 Axios POST 请求
 * - 安全检查：检测危险命令
 * - 上下文收集：工作区文件结构、相关文件、诊断信息
 * - 仓颉语言支持：专用系统提示词和文件检测
 * 
 * 这些工具函数被扩展的多个模块使用，提供通用的功能支持。
 * 
 * @module utils
 */

import * as vscode from 'vscode';
import { TRUNCATE } from './constants';
import * as fs from 'fs';
import * as path from 'path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import axios from 'axios';

/**
 * 获取代理代理
 * 
 * 根据目标 URL 的协议（HTTP 或 HTTPS）和 VS Code 配置，
 * 返回相应的代理代理对象。
 * 
 * @param url - 目标 URL，用于判断协议类型
 * @returns HTTP 或 HTTPS 代理代理，如果未配置代理则返回 undefined
 * 
 * @example
 * ```typescript
 * const agent = getProxyAgent('https://api.example.com');
 * if (agent) {
 *   console.log('Proxy configured');
 * }
 * ```
 */
export function getProxyAgent(url: string) {
  // 从 VS Code 配置中读取代理设置
  const proxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
  if (!proxy) { return undefined; }
  
  // 根据目标 URL 的协议选择相应的代理代理
  const isHttps = url.startsWith('https');
  return isHttps ? new HttpsProxyAgent(proxy) : new HttpProxyAgent(proxy);
}

/**
 * 判断错误是否可重试
 * 
 * 检查错误类型，判断是否应该进行重试。
 * 可重试的错误包括：
 * - 网络连接重置 (ECONNRESET)
 * - 连接超时 (ETIMEDOUT)
 * - 连接中止 (ECONNABORTED)
 * - Socket 挂起
 * - 服务器错误 (5xx)
 * 
 * @param err - 错误对象
 * @returns 如果错误可重试则返回 true，否则返回 false
 */
export function isRetryableError(err: any): boolean {
  const code = err.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED' ||
         err.message?.includes('socket hang up') ||
         (err.response?.status >= 500 && err.response?.status < 600);
}

/**
 * 带重试机制的 Axios POST 请求
 * 
 * 执行 HTTP POST 请求，如果失败且错误可重试，则自动重试。
 * 使用指数退避策略，每次重试间隔递增。
 * 
 * @param url - 请求的 URL
 * @param payload - 请求体数据
 * @param config - Axios 配置对象
 * @param retries - 最大重试次数，默认为 2
 * @returns Promise，解析为响应数据
 * @throws 如果所有重试都失败，抛出错误
 * 
 * @example
 * ```typescript
 * try {
 *   const response = await axiosPostWithRetry(
 *     'https://api.example.com/data',
 *     { key: 'value' },
 *     { timeout: 30000 }
 *   );
 *   console.log(response.data);
 * } catch (error) {
 *   console.error('All retries failed:', error);
 * }
 * ```
 */
export async function axiosPostWithRetry(url: string, payload: any, config: any, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await axios.post(url, payload, config);
    } catch (err: any) {
      const isLast = i === retries;
      // 如果是最后一次尝试或错误不可重试，直接抛出错误
      if (isLast || !isRetryableError(err)) { throw err; }
      
      // 计算重试延迟（指数退避）
      const delay = (i + 1) * 1000;
      console.log(`请求失败 (${err.code || err.message})，${delay}ms后重试... (${i + 1}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('重试耗尽');
}

/**
 * 危险命令黑名单（正则表达式匹配）
 * 
 * 定义了被认为危险或具有破坏性的命令模式。
 * 这些命令可能：
 * - 删除重要文件或目录
 * - 格式化磁盘
 * - 修改系统配置
 * - 执行特权操作
 * - 导致系统不稳定
 * 
 * 在执行用户提供的命令前，应该检查是否匹配这些模式。
 */
const DANGEROUS_COMMANDS = [
  /^rm\s+-rf\s+[\/~]/,        // 删除根目录或用户目录
  /^mkfs/,                     // 格式化文件系统
  /^dd\s+if=/,                 // 磁盘写入操作
  /^:\(\)\s*{\s*:\s*|\s*:&\s*};:/, // fork 炸弹（会创建无限进程）
  /^chmod\s+777\s+\//,         // 修改根目录权限
  /^sudo\s+(?!.*\?)/,          // sudo 命令（除非有交互确认，但此处禁止）
  /^su\s+/,                    // 切换用户
  /^passwd/,                   // 修改密码
  /^kill\s+-9\s+[0-9]+/,       // 强制杀进程（可能误杀重要进程）
  /^systemctl\s+(stop|restart|disable)/, // 系统服务管理
  /^service\s+.*\s+(stop|restart)/,
  /^shutdown/,                  // 关机命令
  /^reboot/,                   // 重启命令
  /^halt/                      // 停止系统
];

/**
 * 检测命令是否危险
 * 
 * 检查给定的命令字符串是否匹配危险命令黑名单。
 * 用于在执行命令前进行安全检查，防止意外破坏。
 * 
 * @param command - 要检查的命令字符串
 * @returns 如果命令危险则返回 true，否则返回 false
 * 
 * @example
 * ```typescript
 * if (isCommandDangerous('rm -rf /')) {
 *   console.warn('Dangerous command detected!');
 *   return;
 * }
 * ```
 */
export function isCommandDangerous(command: string): boolean {
  const trimmed = command.trim();
  for (const pattern of DANGEROUS_COMMANDS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * 获取工作区上下文信息
 * 
 * 递归扫描工作区目录，生成文件树结构，并读取关键配置文件的内容。
 * 用于为 AI 提供项目结构和配置信息，帮助理解项目上下文。
 * 
 * 功能特点：
 * - 递归扫描目录（最多 3 层深度）
 * - 忽略常见的依赖和构建目录（node_modules, .git 等）
 * - 限制显示的文件数量（最多 200 个）
 * - 读取关键配置文件（package.json, requirements.txt 等）
 * - 目录优先显示，文件按名称排序
 * 
 * @returns Promise，解析为包含文件结构和配置的字符串
 * 
 * @example
 * ```typescript
 * const context = await getWorkspaceContext();
 * console.log(context);
 * // 输出：
 * // 当前工作区文件结构：
 * // 📁 src/
 * //   📁 components/
 * //     📄 Button.tsx
 * //   📄 index.ts
 * // 📁 package.json
 * // 
 * // package.json 内容：
 * // ```json
 * // {
 * //   "name": "my-project",
 * //   ...
 * // }
 * // ```
 * ```
 */
export async function getWorkspaceContext(): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) { return ''; }
  
  const root = workspaceFolders[0].uri.fsPath;
  let context = '\n\n当前工作区文件结构：\n';

  // 定义需要忽略的目录（依赖、构建产物、版本控制等）
  const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.vscode', '__pycache__', '.next', 'dist',
    'build', '.cache', 'coverage', '.idea', 'target', 'vendor', '.svn',
    '.hg', 'bower_components', '.tox', '.eggs', '*.egg-info'
  ]);
  
  // 扫描深度限制（防止过深）
  const MAX_DEPTH = 3;
  
  // 最大文件数限制（防止输出过长）
  const MAX_FILES = 200;
  let fileCount = 0;

  /**
   * 递归扫描目录
   * 
   * @param dirPath - 要扫描的目录路径
   * @param prefix - 用于缩进的前缀字符串
   * @param depth - 当前递归深度
   */
  async function scanDir(dirPath: string, prefix: string, depth: number) {
    // 超过深度限制或文件数限制时停止
    if (depth > MAX_DEPTH || fileCount > MAX_FILES) { return; }
    
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      // 排序：目录优先，然后按名称排序
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) { return -1; }
        if (!a.isDirectory() && b.isDirectory()) { return 1; }
        return a.name.localeCompare(b.name);
      });
      
      for (const entry of sorted) {
        if (fileCount > MAX_FILES) { break; }
        
        // 跳过忽略的目录
        if (IGNORE_DIRS.has(entry.name)) { continue; }
        
        // 跳过隐藏目录
        if (entry.name.startsWith('.') && entry.isDirectory()) { continue; }
        
        fileCount++;
        
        if (entry.isDirectory()) {
          // 目录：添加文件夹图标并递归扫描
          context += `${prefix}📁 ${entry.name}/\n`;
          await scanDir(path.join(dirPath, entry.name), prefix + '  ', depth + 1);
        } else {
          // 文件：添加文件图标
          context += `${prefix}📄 ${entry.name}\n`;
        }
      }
    } catch {
      // 跳过无权限的目录
    }
  }

  try {
    // 从根目录开始扫描
    await scanDir(root, '', 0);
    
    // 如果文件过多，添加提示
    if (fileCount > MAX_FILES) {
      context += `\n... (文件过多，仅显示前 ${MAX_FILES} 项)\n`;
    }
    
    // 读取关键配置文件的内容
    const keyFiles = ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
    for (const kf of keyFiles) {
      const kfPath = path.join(root, kf);
      if (fs.existsSync(kfPath)) {
        const content = await fs.promises.readFile(kfPath, 'utf-8');
        // 限制显示长度，最多 1000 字符
        context += `\n\n${kf} 内容：\n\`\`\`${kf.endsWith('.json') ? 'json' : 'text'}\n${content.slice(0, 1000)}${content.length > 1000 ? '\n... (截断)' : ''}\n\`\`\``;
      }
    }
  } catch (e) {
    context += '无法读取工作区文件列表';
  }
  
  return context;
}

/**
 * 获取相关文件的上下文信息
 * 
 * 分析活动文件的导入语句，找出本地依赖的文件，
 * 并读取这些文件的内容摘要。
 * 用于为 AI 提供代码依赖关系和上下文。
 * 
 * 功能特点：
 * - 解析多种导入语法（ES6, CommonJS, Python 等）
 * - 解析相对路径导入
 * - 尝试多种文件扩展名
 * - 提取导出语句作为摘要
 * - 限制显示的文件数量和长度
 * 
 * @param activeFilePath - 当前活动文件的路径
 * @returns Promise，解析为包含相关文件内容的字符串
 * 
 * @example
 * ```typescript
 * const context = await getRelatedFilesContext('/path/to/file.ts');
 * console.log(context);
 * // 输出：
 * // === Related Files (imports) ===
 * // 
 * // [utils/helper.ts] (imported by active file)
 * // ```typescript
 * // export function helper() {
 * //   // ...
 * // }
 * // ```
 * ```
 */
export async function getRelatedFilesContext(activeFilePath: string): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) { return ''; }
  const root = workspaceFolders[0].uri.fsPath;

  let fileContent: string;
  try {
    fileContent = await fs.promises.readFile(activeFilePath, 'utf-8');
  } catch {
    return '';
  }

  // 定义多种导入语句的正则表达式模式
  const importPatterns = [
    /import\s+.*?\s+from\s+['"](\.[^'"]+)['"]/g,      // ES6: import ... from './...'
    /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,        // ES6: import('./...')
    /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,      // CommonJS: require('./...')
    /from\s+(\.[^\s'"]+)\s+import/g,                 // ES6: from ... import
  ];

  // 提取所有本地导入路径
  const localImports = new Set<string>();
  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(fileContent)) !== null) {
      localImports.add(match[1]);
    }
  }

  if (localImports.size === 0) { return ''; }

  // 解析导入的文件
  const activeDir = path.dirname(activeFilePath);
  const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.go', '.rs', '.vue', '.svelte'];
  const MAX_RELATED = 5;  // 最多显示 5 个相关文件
  const MAX_CHARS = TRUNCATE.DIAG_MAX_CHARS;

  let context = '\n\n=== Related Files (imports) ===\n';
  let count = 0;

  for (const imp of localImports) {
    if (count >= MAX_RELATED) { break; }
    
    // 解析相对路径
    let resolved = path.resolve(activeDir, imp);

    // 尝试找到实际的文件
    let foundPath: string | null = null;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      foundPath = resolved;
    } else {
      // 尝试添加各种扩展名
      for (const ext of EXTENSIONS) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) { foundPath = withExt; break; }
        // 尝试 index 文件
        const indexPath = path.join(resolved, `index${ext}`);
        if (fs.existsSync(indexPath)) { foundPath = indexPath; break; }
      }
    }

    if (!foundPath) { continue; }

    try {
      // 读取文件内容
      const content = await fs.promises.readFile(foundPath, 'utf-8');
      const lines = content.split('\n');
      const exportLines: string[] = [];

      // 提取导出语句作为摘要（最多 80 行）
      for (let i = 0; i < Math.min(lines.length, 80); i++) {
        const line = lines[i];
        if (/^(export |module\.exports|def |class |public |interface |type |const |function )/.test(line.trimStart())) {
          exportLines.push(line);
        }
      }

      // 生成相对路径和摘要
      const relativePath = vscode.workspace.asRelativePath(foundPath);
      const summary = exportLines.length > 0
        ? exportLines.slice(0, 15).join('\n')
        : lines.slice(0, 30).join('\n');
      const truncated = summary.length > MAX_CHARS ? summary.substring(0, MAX_CHARS) + '\n...' : summary;

      const ext = path.extname(foundPath).replace('.', '') || 'text';
      context += `\n[${relativePath}] (imported by active file)\n\`\`\`${ext}\n${truncated}\n\`\`\`\n`;
      count++;
    } catch {
      // 跳过无法读取的文件
    }
  }

  return count > 0 ? context : '';
}

/**
 * 获取 VS Code 诊断信息上下文
 * 
 * 收集工作区中的错误和警告信息，用于提供给 AI 进行问题诊断。
 * 
 * 功能特点：
 * - 可以收集所有文件的诊断信息，或仅收集指定文件的
 * - 只包含错误和警告，忽略信息级别
 * - 按严重程度排序（错误优先）
 * - 限制显示的诊断数量（最多 20 条）
 * - 显示文件路径、行号、错误消息和来源
 * 
 * @param filePaths - 可选，指定要收集诊断信息的文件路径列表
 * @returns 包含诊断信息的字符串，如果没有诊断信息则返回空字符串
 * 
 * @example
 * ```typescript
 * // 获取所有文件的诊断信息
 * const allDiagnostics = getDiagnosticsContext();
 * 
 * // 获取特定文件的诊断信息
 * const fileDiagnostics = getDiagnosticsContext(['/path/to/file.ts']);
 * ```
 */
export function getDiagnosticsContext(filePaths?: string[]): string {
  let allDiags: [vscode.Uri, readonly vscode.Diagnostic[]][];

  if (filePaths && filePaths.length > 0) {
    // 收集指定文件的诊断信息
    allDiags = [];
    for (const fp of filePaths) {
      const uri = vscode.Uri.file(fp);
      const diags = vscode.languages.getDiagnostics(uri);
      if (diags.length > 0) { allDiags.push([uri, diags]); }
    }
  } else {
    // 收集所有文件的诊断信息
    allDiags = vscode.languages.getDiagnostics() as [vscode.Uri, readonly vscode.Diagnostic[]][];
  }

  // 提取诊断信息
  const items: { severity: number; text: string }[] = [];

  for (const [uri, diags] of allDiags) {
    const relPath = vscode.workspace.asRelativePath(uri);
    for (const d of diags) {
      // 跳过信息级别的诊断
      if (d.severity > vscode.DiagnosticSeverity.Warning) { continue; }
      
      const sevLabel = d.severity === vscode.DiagnosticSeverity.Error ? 'ERROR' : 'WARN';
      const line = d.range.start.line + 1;
      const src = d.source ? ` (${d.source})` : '';
      items.push({
        severity: d.severity,
        text: `[${sevLabel}] ${relPath}:${line} - ${d.message}${src}`
      });
    }
  }

  if (items.length === 0) { return ''; }

  // 按严重程度排序（错误优先）
  items.sort((a, b) => a.severity - b.severity);
  
  // 限制显示数量
  const MAX_DIAGS = 20;
  const selected = items.slice(0, MAX_DIAGS);

  // 生成诊断信息字符串
  let context = '\n\n=== Diagnostics (errors/warnings) ===\n';
  for (const item of selected) {
    context += item.text + '\n';
  }
  if (items.length > MAX_DIAGS) {
    context += `... (共 ${items.length} 条，仅显示前 ${MAX_DIAGS} 条)\n`;
  }
  
  return context;
}

/**
 * 获取仓颉（Cangjie）语言的专用系统提示词
 * 
 * 生成针对仓颉编程语言的系统提示词，包含：
 * - 语法规则和最佳实践
 * - 类型系统说明
 * - 代码构造规则
 * - 禁止事项
 * - 编译和执行说明
 * - Few-shot 示例（如果提供了用户意图）
 * 
 * @param basePrompt - 基础提示词，会追加到仓颉规则之后
 * @param userIntent - 用户意图，用于生成相关的 few-shot 示例
 * @returns 包含仓颉语言规则的完整系统提示词
 * 
 * @example
 * ```typescript
 * const prompt = getCangjieSystemPrompt(
 *   'Generate a function to calculate factorial',
 *   'factorial calculation'
 * );
 * console.log(prompt);
 * ```
 */
export function getCangjieSystemPrompt(basePrompt: string = '', userIntent?: string): string {
  // 导入模板系统（动态导入以避免循环依赖）
  const { generateFewShotPrompt } = require('./cangjie/templates');
  
  // 生成 few-shot 模板示例
  const fewShotTemplates = userIntent ? generateFewShotPrompt(userIntent) : '';
  
  // 仓颉语言规则
  const cangjieRules = `
You are generating code for Cangjie programming language (仓颉编程语言). Follow these MANDATORY rules:

**Function and Entry Syntax:**
1. Use Cangjie function syntax: 'func name(param: Type): ReturnType { ... }'
2. Use ':' for return type annotation. Do NOT use '->' after function parameter list.
3. Main/entry declaration is compiler-version sensitive:
   - Follow by style already present in current file/project.
   - If there is no existing style, prefer by project's documented style.
   - Do not mix multiple main declaration styles in one file.

**Type System:**
1. Use Cangjie types: Int8/Int16/Int32/Int64/UInt*/Float*/Bool/Char/String/Unit.
2. Array must use generic form: Array<Type>. Do NOT use Type[].
3. Avoid non-Cangjie lowercase primitive aliases like int/long/boolean/string.

**Code Construction Rules:**
1. Keep generated code compile-ready (balanced parentheses/braces, complete function body).
2. Use syntax that matches nearby code and existing declarations in same file.
3. Prefer explicit return types for public or reusable functions.
4. If codebase uses @entry or special main rules, keep it consistent with that local style.

**Hard Prohibitions:**
- NEVER output C/C++/Java/TypeScript function signatures for Cangjie code.
- NEVER use '->' in function declarations.
- NEVER use 'Type[]' array syntax.
- NEVER emit shell commands or compiler commands inside source code.

**IMPORTANT - Code Output Rules:**
- Output ONLY Cangjie source code - NO terminal commands
- DO NOT include compilation commands (cjc, cjpm, etc.) in code
- DO NOT include shell commands or script execution
- DO NOT include markdown formatting - just raw code
- ONLY output .cj source code that can be directly saved and compiled

**Compilation & Execution:**
1. Single file compile: 'cjc filename.cj -o output.exe'
2. Project mode: 'cjpm build', 'cjpm run' (requires cjpm.toml)
3. Run executable: '.\\output.exe' (Windows) or './output' (Linux/Mac)

${basePrompt ? '\n**Additional Instructions:**\n' + basePrompt : ''}
${fewShotTemplates}

CRITICAL: Double-check ALL syntax before outputting. Common mistakes to avoid:
- Wrong: arr: Int32[]               Correct: arr: Array<Int32>
- Wrong: func foo() -> void         Correct: func foo(): Unit
- Wrong: func foo() -> Int32        Correct: func foo(): Int32
- Wrong: // Run: cjc main.cj        ✅ Correct: Just by code, NO commands
`;

  return cangjieRules;
}

/**
 * 检测文件是否为仓颉（Cangjie）语言文件
 * 
 * 通过检查文件的语言 ID 或文件扩展名来判断。
 * 仓颉语言文件的扩展名为 .cj。
 * 
 * @param document - VS Code 文本文档对象
 * @returns 如果是仓颉文件则返回 true，否则返回 false
 * 
 * @example
 * ```typescript
 * if (isCangjieFile(document)) {
 *   const prompt = getCangjieSystemPrompt();
 *   // 使用仓颉专用提示词
 * }
 * ```
 */
export function isCangjieFile(document: vscode.TextDocument): boolean {
  return document.languageId === 'cangjie' || document.fileName.toLowerCase().endsWith('.cj');
}
