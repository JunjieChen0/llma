/**
 * 语言服务模块
 * 
 * 提供 VS Code 语言服务功能的封装，包括：
 * - 文档符号：获取文档中的符号（函数、类、变量等）
 * - 定义跳转：跳转到符号的定义位置
 * - 引用查找：查找符号的所有引用
 * - Hover 信息：获取符号的悬停提示
 * - 签名帮助：获取函数/方法的参数提示
 * - 代码补全：获取代码补全建议
 * - 代码操作：获取代码操作建议（如快速修复）
 * - 代码格式化：获取代码格式化编辑
 * - 选择范围：获取代码选择范围
 * - 折叠范围：获取代码折叠范围
 * - AST 增强：使用语言服务增强 AST 分析结果
 * 
 * 主要功能：
 * - 封装 VS Code 语言服务 API
 * - 提供统一的接口访问语言服务
 * - 支持 AST 和语言服务的结合使用
 * - 使用单例模式管理语言服务
 * 
 * @module languageService/index
 */

import * as vscode from 'vscode';
import { ASTNode, ASTAnalysisResult, ASTSymbolInfo } from '../ast/types';
import { BaseASTAnalyzer } from '../ast/base';

/**
 * 符号定义接口
 * 
 * 表示符号的定义位置和相关信息。
 * 
 * @interface SymbolDefinition
 */
export interface SymbolDefinition {
  /**
   * 符号名称
   */
  name: string;
  
  /**
   * 符号类型
   * 如 Function、Class、Variable 等
   */
  kind: vscode.SymbolKind;
  
  /**
   * 定义位置
   */
  location: vscode.Location;
  
  /**
   * 选择范围
   * 符号名称在源代码中的范围
   */
  selectionRange: vscode.Range;
  
  /**
   * 容器名称
   * 包含此符号的父级符号名称
   */
  containerName?: string;
}

/**
 * 引用信息接口
 * 
 * 表示符号的引用位置。
 * 
 * @interface ReferenceInfo
 */
export interface ReferenceInfo {
  /**
   * 引用所在的文件 URI
   */
  uri: vscode.Uri;
  
  /**
   * 引用位置
   */
  range: vscode.Range;
}

/**
 * 文档符号信息接口
 * 
 * 表示文档中的符号信息。
 * 
 * @interface DocumentSymbolInfo
 */
export interface DocumentSymbolInfo {
  /**
   * 符号名称
   */
  name: string;
  
  /**
   * 符号类型
   */
  kind: vscode.SymbolKind;
  
  /**
   * 符号范围
   */
  range: vscode.Range;
  
  /**
   * 选择范围
   */
  selectionRange: vscode.Range;
  
  /**
   * 子符号
   */
  children?: DocumentSymbolInfo[];
  
  /**
   * 详细信息
   */
  detail?: string;
}

/**
 * 语言服务管理器类
 * 
 * 封装 VS Code 语言服务功能，提供统一的接口。
 * 使用单例模式确保全局只有一个实例。
 * 
 * @class LanguageServiceManager
 */
export class LanguageServiceManager {
  /**
   * 单例实例
   */
  private static instance: LanguageServiceManager | null = null;

  private constructor() {}

  static getInstance(): LanguageServiceManager {
    if (!LanguageServiceManager.instance) {
      LanguageServiceManager.instance = new LanguageServiceManager();
    }
    return LanguageServiceManager.instance;
  }

  static resetInstance(): void {
    LanguageServiceManager.instance = null;
  }

  async getDocumentSymbols(
    document: vscode.TextDocument
  ): Promise<DocumentSymbolInfo[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (!symbols || symbols.length === 0) {
        return [];
      }

      return this.convertSymbols(symbols);
    } catch (error) {
      console.warn('Failed to get document symbols:', error);
      return [];
    }
  }

  private convertSymbols(
    symbols: vscode.DocumentSymbol[]
  ): DocumentSymbolInfo[] {
    return symbols.map(symbol => ({
      name: symbol.name,
      kind: symbol.kind,
      range: symbol.range,
      selectionRange: symbol.selectionRange,
      detail: symbol.detail,
      children: symbol.children ? this.convertSymbols(symbol.children) : undefined,
    }));
  }

  async findDefinition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Location | vscode.Location[] | null> {
    try {
      const locations = await vscode.commands.executeCommand<
        vscode.Location | vscode.Location[] | vscode.LocationLink[]
      >('vscode.executeDefinitionProvider', document.uri, position);

      if (!locations) {
        return null;
      }

      if (Array.isArray(locations)) {
        if (locations.length === 0) {
          return null;
        }
        return locations.map(loc => this.toLocation(loc)).filter(Boolean) as vscode.Location[];
      }

      return this.toLocation(locations);
    } catch (error) {
      console.warn('Failed to find definition:', error);
      return null;
    }
  }

  private toLocation(
    loc: vscode.Location | vscode.LocationLink
  ): vscode.Location | null {
    if ('uri' in loc && 'range' in loc) {
      return loc;
    }
    if ('targetUri' in loc && 'targetRange' in loc) {
      return new vscode.Location(loc.targetUri, loc.targetRange);
    }
    return null;
  }

  async findReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    includeDeclaration: boolean = true
  ): Promise<vscode.Location[]> {
    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        document.uri,
        position,
        includeDeclaration
      );

      return locations || [];
    } catch (error) {
      console.warn('Failed to find references:', error);
      return [];
    }
  }

  async getHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    try {
      const hover = await vscode.commands.executeCommand<vscode.Hover>(
        'vscode.executeHoverProvider',
        document.uri,
        position
      );

      return hover || null;
    } catch (error) {
      console.warn('Failed to get hover:', error);
      return null;
    }
  }

  async getSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.SignatureHelp | null> {
    try {
      const signatureHelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
        'vscode.executeSignatureHelpProvider',
        document.uri,
        position
      );

      return signatureHelp || null;
    } catch (error) {
      console.warn('Failed to get signature help:', error);
      return null;
    }
  }

  async getCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context?: vscode.CompletionContext
  ): Promise<vscode.CompletionList | null> {
    try {
      const completions = await vscode.commands.executeCommand<
        vscode.CompletionItem[] | vscode.CompletionList
      >('vscode.executeCompletionItemProvider', document.uri, position, context);

      if (!completions) {
        return null;
      }

      if (Array.isArray(completions)) {
        return new vscode.CompletionList(completions);
      }

      return completions;
    } catch (error) {
      console.warn('Failed to get completion items:', error);
      return null;
    }
  }

  async getCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context?: vscode.CodeActionContext
  ): Promise<(vscode.Command | vscode.CodeAction)[]> {
    try {
      const actions = await vscode.commands.executeCommand<
        (vscode.Command | vscode.CodeAction)[]
      >('vscode.executeCodeActionProvider', document.uri, range, context);

      return actions || [];
    } catch (error) {
      console.warn('Failed to get code actions:', error);
      return [];
    }
  }

  async getFormattingEdits(
    document: vscode.TextDocument,
    options?: vscode.FormattingOptions
  ): Promise<vscode.TextEdit[]> {
    try {
      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        'vscode.executeFormatDocumentProvider',
        document.uri,
        options
      );

      return edits || [];
    } catch (error) {
      console.warn('Failed to get formatting edits:', error);
      return [];
    }
  }

  async getSelectionRange(
    document: vscode.TextDocument,
    positions: vscode.Position[]
  ): Promise<vscode.SelectionRange[] | null> {
    try {
      const ranges = await vscode.commands.executeCommand<vscode.SelectionRange[]>(
        'vscode.executeSelectionRangeProvider',
        document.uri,
        positions
      );

      return ranges || null;
    } catch (error) {
      console.warn('Failed to get selection range:', error);
      return null;
    }
  }

  async getFoldingRanges(
    document: vscode.TextDocument
  ): Promise<vscode.FoldingRange[]> {
    try {
      const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        document.uri
      );

      return ranges || [];
    } catch (error) {
      console.warn('Failed to get folding ranges:', error);
      return [];
    }
  }

  convertSymbolKind(kind: vscode.SymbolKind): string {
    const kindMap: Record<vscode.SymbolKind, string> = {
      [vscode.SymbolKind.File]: 'file',
      [vscode.SymbolKind.Module]: 'module',
      [vscode.SymbolKind.Namespace]: 'namespace',
      [vscode.SymbolKind.Package]: 'module',
      [vscode.SymbolKind.Class]: 'class',
      [vscode.SymbolKind.Method]: 'method',
      [vscode.SymbolKind.Property]: 'variable',
      [vscode.SymbolKind.Field]: 'variable',
      [vscode.SymbolKind.Constructor]: 'method',
      [vscode.SymbolKind.Enum]: 'enum',
      [vscode.SymbolKind.Interface]: 'interface',
      [vscode.SymbolKind.Function]: 'function',
      [vscode.SymbolKind.Variable]: 'variable',
      [vscode.SymbolKind.Constant]: 'constant',
      [vscode.SymbolKind.String]: 'expression',
      [vscode.SymbolKind.Number]: 'expression',
      [vscode.SymbolKind.Boolean]: 'expression',
      [vscode.SymbolKind.Array]: 'expression',
      [vscode.SymbolKind.Object]: 'expression',
      [vscode.SymbolKind.Key]: 'expression',
      [vscode.SymbolKind.Null]: 'expression',
      [vscode.SymbolKind.EnumMember]: 'variable',
      [vscode.SymbolKind.Struct]: 'class',
      [vscode.SymbolKind.Event]: 'variable',
      [vscode.SymbolKind.Operator]: 'expression',
      [vscode.SymbolKind.TypeParameter]: 'type',
    };
    return kindMap[kind] || 'unknown';
  }

  async enhanceASTWithLanguageService(
    document: vscode.TextDocument,
    baseResult: ASTAnalysisResult
  ): Promise<ASTAnalysisResult> {
    const symbols = await this.getDocumentSymbols(document);
    const enhancedNodes: ASTNode[] = [];

    for (const symbol of symbols) {
      const node = this.convertSymbolToASTNode(symbol, baseResult.filePath);
      if (node) {
        enhancedNodes.push(node);
      }
    }

    return {
      ...baseResult,
      nodes: enhancedNodes.length > 0 ? enhancedNodes : baseResult.nodes,
    };
  }

  private convertSymbolToASTNode(
    symbol: DocumentSymbolInfo,
    filePath: string
  ): ASTNode | null {
    const { v4: uuidv4 } = require('uuid');

    const nodeType = this.convertSymbolKind(symbol.kind);
    if (nodeType === 'unknown' || nodeType === 'file') {
      return null;
    }

    const node: ASTNode = {
      id: uuidv4(),
      type: nodeType as any,
      name: symbol.name,
      startLine: symbol.range.start.line + 1,
      startColumn: symbol.range.start.character,
      endLine: symbol.range.end.line + 1,
      endColumn: symbol.range.end.character,
      children: [],
      metadata: {
        documentation: symbol.detail,
      },
    };

    if (symbol.children) {
      for (const child of symbol.children) {
        const childNode = this.convertSymbolToASTNode(child, filePath);
        if (childNode) {
          childNode.parentId = node.id;
          node.children.push(childNode);
        }
      }
    }

    return node;
  }
}

export function createLanguageServiceManager(): LanguageServiceManager {
  return LanguageServiceManager.getInstance();
}
