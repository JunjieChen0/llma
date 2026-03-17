import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  CodeGraph as ICodeGraph,
  SymbolInfo,
  CallRelation,
  ImportRelation,
  InheritanceRelation,
  FileNode,
  SymbolKind
} from './types';

export class CodeGraphBuilder {
  private graph: ICodeGraph;
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.graph = {
      symbols: new Map(),
      calls: [],
      imports: [],
      inheritances: [],
      files: new Map()
    };
  }

  buildFromSymbols(symbols: Map<string, SymbolInfo>): ICodeGraph {
    this.graph.symbols = symbols;
    this.graph.calls = [];
    this.graph.imports = [];
    this.graph.inheritances = [];
    
    for (const symbol of symbols.values()) {
      this.analyzeSymbol(symbol);
    }

    return this.graph;
  }

  async buildFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      this.extractImports(filePath, content, lines);
      this.extractCalls(filePath, content, lines);
      this.extractInheritances(filePath, content, lines);
      this.updateFileNode(filePath, content);
    } catch (error) {
      console.error(`Failed to build graph from ${filePath}:`, error);
    }
  }

  private extractImports(filePath: string, content: string, lines: string[]): void {
    const ext = path.extname(filePath).toLowerCase();
    const isJava = ext === '.java';
    const isCpp = ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'].includes(ext);
    const isKotlin = ext === '.kt';
    const isCSharp = ext === '.cs';
    const isPython = ext === '.py';
    const isGo = ext === '.go';
    const isRust = ext === '.rs';
    const isTS = ['.ts', '.tsx'].includes(ext);
    const isJS = ['.js', '.jsx'].includes(ext);

    // Python imports (增强版)
    if (isPython) {
      // import module
      const importModuleRegex = /^import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm;
      let match;
      while ((match = importModuleRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const module = match[1];
        const alias = match[2];
        
        // 模块名转路径
        const targetFile = module.replace(/\./g, path.sep) + '.py';
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols: [alias || module.split('.').pop()!],
          importType: 'namespace',
          line: lineNum
        });
      }
      
      // from module import ...
      const fromImportRegex = /^from\s+([\w.]+)\s+import\s+(?:\(([^)]+)\)|([^\n;]+))/gm;
      while ((match = fromImportRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const module = match[1];
        const imports = (match[2] || match[3] || '').split(',').map(s => s.trim().split(' as ')[0].trim());
        
        let targetFile = module.replace(/\./g, path.sep);
        if (!targetFile.startsWith('.') && !path.isAbsolute(targetFile)) {
          targetFile = targetFile + '.py';
        }
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols: imports.filter(s => s && s !== '*'),
          importType: 'named',
          line: lineNum
        });
      }
      
      // 相对导入 from . import ... / from ..pkg import ...
      const relativeImportRegex = /^from\s+(\.+)([\w.]*)\s+import\s+(?:\(([^)]+)\)|([^\n;]+))/gm;
      while ((match = relativeImportRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const dots = match[1];
        const module = match[2] || '';
        const imports = (match[3] || match[4] || '').split(',').map(s => s.trim().split(' as ')[0].trim());
        
        // 计算相对路径
        const baseDir = path.dirname(filePath);
        const levels = dots.length - 1;
        let relativeDir = baseDir;
        for (let i = 0; i < levels; i++) {
          relativeDir = path.dirname(relativeDir);
        }
        
        const targetFile = module ? 
          path.join(relativeDir, module.replace(/\./g, path.sep) + '.py') :
          path.join(relativeDir, '__init__.py');
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols: imports.filter(s => s && s !== '*'),
          importType: 'named',
          line: lineNum
        });
      }
    }

    // Go imports
    if (isGo) {
      // import "package"
      const singleImportRegex = /^import\s+"([^"]+)"/gm;
      let match: RegExpExecArray | null;
      while ((match = singleImportRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const pkg = match[1];
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile: pkg,
          importedSymbols: [path.basename(pkg)],
          importType: 'namespace',
          line: lineNum
        });
      }
      
      // import ( "pkg1" "pkg2" )
      const multiImportRegex = /import\s*\(([\s\S]*?)\)/g;
      while ((match = multiImportRegex.exec(content)) !== null) {
        const importBlock = match[1];
        const lineNum = content.substring(0, match.index).split('\n').length;
        
        const pkgRegex = /"(.*?)"/g;
        let pkgMatch: RegExpExecArray | null;
        while ((pkgMatch = pkgRegex.exec(importBlock)) !== null) {
          const pkg = pkgMatch[1];
          this.graph.imports.push({
            sourceFile: filePath,
            targetFile: pkg,
            importedSymbols: [path.basename(pkg)],
            importType: 'namespace',
            line: lineNum
          });
        }
      }
      
      // import alias "package"
      const aliasImportRegex = /^import\s+(\w+)\s+"([^"]+)"/gm;
      while ((match = aliasImportRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const alias = match[1];
        const pkg = match[2];
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile: pkg,
          importedSymbols: [alias],
          importType: 'named',
          line: lineNum
        });
      }
    }

    // Rust imports (use statements)
    if (isRust) {
      // use std::path;
      // use crate::module;
      // use super::Trait;
      // use pkg::{Item1, Item2};
      // use pkg::Item as Alias;
      const useRegex = /^use\s+([\w:]+(?:\{[^}]*\})?(?:\s+as\s+\w+)?);/gm;
      let match: RegExpExecArray | null;
      while ((match = useRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const usePath = match[1];
        
        // 解析路径
        let modulePath = usePath;
        let importedSymbols: string[] = [];
        
        // 处理 as 别名
        const asMatch = modulePath.match(/(.+)\s+as\s+(\w+)/);
        if (asMatch) {
          modulePath = asMatch[1].trim();
          importedSymbols = [asMatch[2]];
        }
        
        // 处理花括号展开
        const braceMatch = modulePath.match(/(.+)\{([^}]+)\}/);
        if (braceMatch) {
          modulePath = braceMatch[1];
          const items = braceMatch[2].split(',').map((s: string) => s.trim().split(' as ')[0].trim());
          importedSymbols = [...importedSymbols, ...items];
        }
        
        // 简单路径
        if (importedSymbols.length === 0) {
          importedSymbols = [modulePath.split('::').pop()!];
        }
        
        // 转换为文件路径
        const targetFile = modulePath.replace(/::/g, path.sep) + '.rs';
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols,
          importType: 'named',
          line: lineNum
        });
      }
      
      // mod statements (模块声明)
      const modRegex = /^mod\s+(\w+);/gm;
      while ((match = modRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const modName = match[1];
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile: `${modName}.rs`,
          importedSymbols: [modName],
          importType: 'namespace',
          line: lineNum
        });
      }
    }

    // TypeScript/JavaScript imports (增强版)
    if (isTS || isJS) {
      // ES6 imports
      const es6ImportRegex = /import\s+(?:(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+)?['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = es6ImportRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const namedImports = match[1];
        const namespaceImport = match[2];
        const defaultImport = match[3];
        const fromPath = match[4];
        
        let importedSymbols: string[] = [];
        if (namedImports) {
          importedSymbols = namedImports.split(',').map((s: string) => s.trim().split(' as ')[0].trim());
        } else if (namespaceImport) {
          importedSymbols = [namespaceImport];
        } else if (defaultImport) {
          importedSymbols = [defaultImport];
        }
        
        let targetFile = fromPath;
        if (fromPath && fromPath.startsWith('.')) {
          targetFile = this.resolveImportPath(filePath, fromPath);
        }
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols,
          importType: 'named',
          line: lineNum
        });
      }
      
      // Dynamic imports
      const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = dynamicImportRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const fromPath = match[1];
        
        let targetFile = fromPath;
        if (fromPath.startsWith('.')) {
          targetFile = this.resolveImportPath(filePath, fromPath);
        }
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols: ['default'],
          importType: 'dynamic',
          line: lineNum
        });
      }
      
      // CommonJS require
      const requireRegex = /(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      while ((match = requireRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const destructured = match[1];
        const defaultRequire = match[2];
        const fromPath = match[3];
        
        let importedSymbols: string[] = [];
        if (destructured) {
          importedSymbols = destructured.split(',').map((s: string) => s.trim().split(':')[0].trim());
        } else if (defaultRequire) {
          importedSymbols = [defaultRequire];
        }
        
        let targetFile = fromPath;
        if (fromPath.startsWith('.')) {
          targetFile = this.resolveImportPath(filePath, fromPath);
        }
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols,
          importType: 'named',
          line: lineNum
        });
      }
    }

    // Java/Kotlin imports
    if (isJava || isKotlin) {
      const importRegex = /^import\s+(?:static\s+)?([\w.*]+)\s*;/gm;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const importedClass = match[1];
        
        // 将包名转换为文件路径（简化处理）
        const targetFile = importedClass.replace(/\./g, path.sep) + (isJava ? '.java' : '.kt');
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols: [importedClass.split('.').pop() || importedClass],
          importType: 'named',
          line: lineNum
        });
      }
    }

    // C/C++ includes
    if (isCpp) {
      const includeRegex = /^#\s*include\s*[<"]([^>"]+)[>"]/gm;
      let match;
      while ((match = includeRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const includePath = match[1];
        
        let targetFile = includePath;
        if (!path.isAbsolute(includePath)) {
          targetFile = path.resolve(path.dirname(filePath), includePath);
        }
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile,
          importedSymbols: [path.basename(includePath)],
          importType: 'namespace',
          line: lineNum
        });
      }
    }

    // C# using statements
    if (isCSharp) {
      const usingRegex = /^using\s+(?:static\s+)?([\w.]+)(?:\s*=\s*[\w.]+)?\s*;/gm;
      let match;
      while ((match = usingRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        const namespace = match[1];
        
        this.graph.imports.push({
          sourceFile: filePath,
          targetFile: namespace.replace(/\./g, path.sep),
          importedSymbols: [namespace],
          importType: 'namespace',
          line: lineNum
        });
      }
    }
  }

  private extractCalls(filePath: string, content: string, lines: string[]): void {
    const callRegex = /(\w+)\s*\(/g;
    let match;

    while ((match = callRegex.exec(content)) !== null) {
      const callee = match[1];
      
      if (this.isBuiltinOrKeyword(callee)) {
        continue;
      }

      const lineNum = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNum - 1] || '';
      
      const caller = this.findEnclosingSymbol(content, match.index);
      
      this.graph.calls.push({
        caller: caller || 'global',
        callee,
        callerFile: filePath,
        calleeFile: undefined,
        line: lineNum
      });
    }
  }

  private extractInheritances(filePath: string, content: string, lines: string[]): void {
    const ext = path.extname(filePath).toLowerCase();
    const isJava = ext === '.java';
    const isCpp = ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'].includes(ext);
    const isKotlin = ext === '.kt';
    const isCSharp = ext === '.cs';
    const isPython = ext === '.py';
    const isTS = ['.ts', '.tsx'].includes(ext);
    const isJS = ['.js', '.jsx'].includes(ext);

    // Python 继承 (增强版)
    if (isPython) {
      // class Child(Parent)
      // class Child(Parent1, Parent2)
      // class Child(BaseClass)
      const pythonClassRegex = /class\s+(\w+)(?:\(([^)]*)\))?\s*:/g;
      let match;
      while ((match = pythonClassRegex.exec(content)) !== null) {
        const child = match[1];
        const parentsStr = match[2];

        if (parentsStr) {
          const parents = parentsStr.split(',').map(s => {
            // 处理 keyword arguments like metaclass=xxx
            if (s.includes('=')) {return null;}
            // 提取类名，去掉可能的 .xxx
            const parts = s.trim().split('.');
            return parts[parts.length - 1];
          }).filter(Boolean);

          for (const parent of parents) {
            if (parent && !this.isBuiltinOrKeyword(parent)) {
              this.graph.inheritances.push({
                child,
                parent,
                childFile: filePath,
                parentFile: undefined,
                type: 'extends'
              });
            }
          }
        }
      }
    }

    // TypeScript/JavaScript 继承
    if (isTS || isJS) {
      // class Child extends Parent
      const tsClassExtendsRegex = /class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w\s,.]+))?\s*{/g;
      let match;
      while ((match = tsClassExtendsRegex.exec(content)) !== null) {
        const child = match[1];
        const parentExtends = match[2];
        const parentImplements = match[3];

        if (parentExtends) {
          this.graph.inheritances.push({
            child,
            parent: parentExtends.trim(),
            childFile: filePath,
            parentFile: undefined,
            type: 'extends'
          });
        }

        if (parentImplements) {
          const interfaces = parentImplements.split(',').map(s => s.trim());
          for (const iface of interfaces) {
            if (iface && !this.isBuiltinOrKeyword(iface)) {
              this.graph.inheritances.push({
                child,
                parent: iface,
                childFile: filePath,
                parentFile: undefined,
                type: 'implements'
              });
            }
          }
        }
      }
    }

    // Java 继承和实现
    if (isJava) {
      // 匹配 class A extends B implements C, D
      const javaClassRegex = /(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w\s,.]+))?\s*{/g;
      let match;
      while ((match = javaClassRegex.exec(content)) !== null) {
        const child = match[1];
        const parentExtends = match[2];
        const parentImplements = match[3];

        if (parentExtends) {
          this.graph.inheritances.push({
            child,
            parent: parentExtends.trim(),
            childFile: filePath,
            parentFile: undefined,
            type: 'extends'
          });
        }

        if (parentImplements) {
          const interfaces = parentImplements.split(',').map(s => s.trim());
          for (const iface of interfaces) {
            if (iface && !this.isBuiltinOrKeyword(iface)) {
              this.graph.inheritances.push({
                child,
                parent: iface,
                childFile: filePath,
                parentFile: undefined,
                type: 'implements'
              });
            }
          }
        }
      }

      // 匹配 interface 继承
      const javaInterfaceRegex = /(?:public|private|protected)?\s*(?:abstract\s+)?interface\s+(\w+)(?:\s+extends\s+([\w\s,.]+))?\s*{/g;
      while ((match = javaInterfaceRegex.exec(content)) !== null) {
        const child = match[1];
        const parentExtends = match[2];

        if (parentExtends) {
          const parents = parentExtends.split(',').map(s => s.trim());
          for (const parent of parents) {
            if (parent && !this.isBuiltinOrKeyword(parent)) {
              this.graph.inheritances.push({
                child,
                parent,
                childFile: filePath,
                parentFile: undefined,
                type: 'extends'
              });
            }
          }
        }
      }
    }

    // C++ 继承
    if (isCpp) {
      // 匹配 class A : public B, private C, virtual D
      const cppClassRegex = /(?:public|private|protected)?\s*class\s+(\w+)\s*:\s*([\w\s:,&<>()]+)\s*{/g;
      let match;
      while ((match = cppClassRegex.exec(content)) !== null) {
        const child = match[1];
        const parentsStr = match[2];

        // 解析多个父类
        const parents = parentsStr.split(',').map(s => {
          // 提取类名，去掉 public/private/protected/virtual 等修饰词
          const parts = s.trim().split(/\s+/);
          return parts[parts.length - 1]; // 最后一个是类名
        });

        for (const parent of parents) {
          if (parent && !this.isBuiltinOrKeyword(parent)) {
            this.graph.inheritances.push({
              child,
              parent,
              childFile: filePath,
              parentFile: undefined,
              type: 'extends'
            });
          }
        }
      }

      // 匹配 struct 继承
      const cppStructRegex = /(?:public|private|protected)?\s*struct\s+(\w+)\s*:\s*([\w\s:,&<>()]+)\s*{/g;
      while ((match = cppStructRegex.exec(content)) !== null) {
        const child = match[1];
        const parentsStr = match[2];

        const parents = parentsStr.split(',').map(s => {
          const parts = s.trim().split(/\s+/);
          return parts[parts.length - 1];
        });

        for (const parent of parents) {
          if (parent && !this.isBuiltinOrKeyword(parent)) {
            this.graph.inheritances.push({
              child,
              parent,
              childFile: filePath,
              parentFile: undefined,
              type: 'extends'
            });
          }
        }
      }
    }

    // Kotlin 继承
    if (isKotlin) {
      const kotlinClassRegex = /(?:public|private|protected|internal)?\s*(?:data\s+)?(?:open\s+)?(?:abstract\s+)?(?:final\s+)?(?:sealed\s+)?class\s+(\w+)(?:\([^)]*\))?(?:\s*:\s*([\w\s,.()]+))?\s*[{]/g;
      let match: RegExpExecArray | null;
      while ((match = kotlinClassRegex.exec(content)) !== null) {
        const child = match[1];
        const parentsStr = match[2];

        if (parentsStr) {
          const parents = parentsStr.split(',').map((s: string) => s.trim().split('(')[0]); // 去掉构造函数
          for (const parent of parents) {
            if (parent && !this.isBuiltinOrKeyword(parent)) {
              this.graph.inheritances.push({
                child,
                parent,
                childFile: filePath,
                parentFile: undefined,
                type: 'extends'
              });
            }
          }
        }
      }
    }

    // C# 继承
    if (isCSharp) {
      const csharpClassRegex = /(?:public|private|protected|internal)?\s*(?:static\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?class\s+(\w+)(?:\s*:\s*([\w\s,.]+))?\s*{/g;
      let match: RegExpExecArray | null;
      while ((match = csharpClassRegex.exec(content)) !== null) {
        const child = match[1];
        const parentsStr = match[2];

        if (parentsStr) {
          const parents = parentsStr.split(',').map((s: string) => s.trim());
          for (const parent of parents) {
            if (parent && !this.isBuiltinOrKeyword(parent)) {
              // C# 第一个是基类，其他是接口
              const type: 'extends' | 'implements' = parents.indexOf(parent) === 0 ? 'extends' : 'implements';
              this.graph.inheritances.push({
                child,
                parent,
                childFile: filePath,
                parentFile: undefined,
                type
              });
            }
          }
        }
      }
    }
  }

  private analyzeSymbol(symbol: SymbolInfo): void {
    // Symbol analysis is done in buildFromFile
  }

  private resolveImportPath(sourceFile: string, importPath: string): string {
    const sourceDir = path.dirname(sourceFile);
    let resolved = path.resolve(sourceDir, importPath);
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'];
    
    if (!path.extname(resolved)) {
      for (const ext of extensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) {
          return withExt;
        }
        const indexPath = path.join(resolved, `index${ext}`);
        if (fs.existsSync(indexPath)) {
          return indexPath;
        }
      }
    }
    
    return resolved;
  }

  private isBuiltinOrKeyword(name: string): boolean {
    const builtins = new Set([
      'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
      'return', 'function', 'class', 'const', 'let', 'var', 'import', 'export',
      'try', 'catch', 'finally', 'throw', 'new', 'typeof', 'instanceof',
      'console', 'log', 'error', 'warn', 'info', 'debug',
      'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict',
      'String', 'Number', 'Boolean', 'Array', 'Object', 'Map', 'Set',
      'Promise', 'async', 'await', 'then', 'catch'
    ]);
    return builtins.has(name);
  }

  private findEnclosingSymbol(content: string, index: number): string | null {
    const before = content.substring(0, index);
    const lines = before.split('\n');
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      
      const funcMatch = line.match(/(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/);
      if (funcMatch) {
        return funcMatch[1];
      }
      
      const methodMatch = line.match(/(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*{/);
      if (methodMatch) {
        return methodMatch[1];
      }
    }
    
    return null;
  }

  private updateFileNode(filePath: string, content: string): void {
    const lines = content.split('\n');
    const ext = path.extname(filePath);
    
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.c': 'c',
      '.cpp': 'cpp'
    };

    this.graph.files.set(filePath, {
      path: filePath,
      language: languageMap[ext] || 'unknown',
      lineCount: lines.length,
      symbolCount: 0,
      importCount: this.graph.imports.filter(i => i.sourceFile === filePath).length,
      lastModified: Date.now()
    });
  }

  getGraph(): ICodeGraph {
    return this.graph;
  }

  getDependencies(filePath: string): string[] {
    const deps = new Set<string>();
    
    for (const imp of this.graph.imports) {
      if (imp.sourceFile === filePath && !imp.targetFile.startsWith('.')) {
        deps.add(imp.targetFile);
      }
    }
    
    return Array.from(deps);
  }

  getDependents(filePath: string): string[] {
    const dependents = new Set<string>();
    
    for (const imp of this.graph.imports) {
      if (imp.targetFile === filePath) {
        dependents.add(imp.sourceFile);
      }
    }
    
    return Array.from(dependents);
  }

  getCallers(functionName: string): CallRelation[] {
    return this.graph.calls.filter(c => c.callee === functionName);
  }

  getCallees(functionName: string): CallRelation[] {
    return this.graph.calls.filter(c => c.caller === functionName);
  }

  getInheritanceChain(className: string): InheritanceRelation[] {
    return this.graph.inheritances.filter(
      i => i.child === className || i.parent === className
    );
  }

  getRelatedFiles(filePath: string, depth: number = 1): string[] {
    const related = new Set<string>();
    const queue: Array<{ path: string; level: number }> = [{ path: filePath, level: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { path: current, level } = queue.shift()!;
      
      if (visited.has(current) || level > depth) {
        continue;
      }
      visited.add(current);

      if (level > 0) {
        related.add(current);
      }

      const deps = this.getDependencies(current);
      const dependents = this.getDependents(current);
      
      for (const dep of [...deps, ...dependents]) {
        if (!visited.has(dep)) {
          queue.push({ path: dep, level: level + 1 });
        }
      }
    }

    return Array.from(related);
  }

  clear(): void {
    this.graph = {
      symbols: new Map(),
      calls: [],
      imports: [],
      inheritances: [],
      files: new Map()
    };
  }
}
