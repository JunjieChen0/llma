// src/ast/base.ts

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ASTNode,
  ASTNodeType,
  ASTAnalysisResult,
  IASTAnalyzer,
  ASTSymbolInfo,
  DependencyInfo
} from './types';

export abstract class BaseASTAnalyzer implements IASTAnalyzer {
  abstract language: string;
  abstract supportedExtensions: string[];

  protected nodeIdCounter = 0;

  canAnalyze(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.includes(ext);
  }

  abstract analyze(code: string, filePath: string): Promise<ASTAnalysisResult>;

  getCodeStructure(nodes: ASTNode[]): string {
    const structure: string[] = [];
    this._buildStructureRecursive(nodes, structure, 0);
    return structure.join('\n');
  }

  protected _buildStructureRecursive(nodes: ASTNode[], structure: string[], depth: number): void {
    const indent = '  '.repeat(depth);
    
    for (const node of nodes) {
      let line = `${indent}- [${node.type}] ${node.name}`;
      if (node.metadata.signature) {
        line += `: ${node.metadata.signature}`;
      }
      if (node.metadata.visibility) {
        line = `${indent}${node.metadata.visibility} - [${node.type}] ${node.name}`;
      }
      structure.push(line);
      
      if (node.children.length > 0) {
        this._buildStructureRecursive(node.children, structure, depth + 1);
      }
    }
  }

  findNodeAtPosition(nodes: ASTNode[], line: number, column: number): ASTNode | null {
    return this._findNodeAtPositionRecursive(nodes, line, column);
  }

  protected _findNodeAtPositionRecursive(
    nodes: ASTNode[],
    line: number,
    column: number
  ): ASTNode | null {
    for (const node of nodes) {
      const isWithin = this._isPositionWithinNode(node, line, column);
      if (isWithin) {
        const child = this._findNodeAtPositionRecursive(node.children, line, column);
        if (child) {
          return child;
        }
        return node;
      }
    }
    return null;
  }

  protected _isPositionWithinNode(node: ASTNode, line: number, column: number): boolean {
    if (line < node.startLine || line > node.endLine) {
      return false;
    }
    if (line === node.startLine && column < node.startColumn) {
      return false;
    }
    if (line === node.endLine && column > node.endColumn) {
      return false;
    }
    return true;
  }

  getParentChain(nodes: ASTNode[], nodeId: string): ASTNode[] {
    const chain: ASTNode[] = [];
    this._findParentChainRecursive(nodes, nodeId, chain);
    return chain.reverse();
  }

  protected _findParentChainRecursive(
    nodes: ASTNode[],
    nodeId: string,
    chain: ASTNode[],
    currentParent?: ASTNode
  ): boolean {
    for (const node of nodes) {
      if (node.id === nodeId) {
        if (currentParent) {
          chain.push(currentParent);
        }
        return true;
      }
      if (this._findParentChainRecursive(node.children, nodeId, chain, node)) {
        if (currentParent) {
          chain.push(currentParent);
        }
        return true;
      }
    }
    return false;
  }

  protected generateId(): string {
    return uuidv4();
  }

  protected createNode(
    type: ASTNodeType,
    name: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number,
    metadata: ASTNode['metadata'] = {},
    children: ASTNode[] = []
  ): ASTNode {
    return {
      id: this.generateId(),
      type,
      name,
      startLine,
      startColumn,
      endLine,
      endColumn,
      children,
      metadata
    };
  }

  protected collectSymbols(nodes: ASTNode[]): ASTSymbolInfo[] {
    const symbols: ASTSymbolInfo[] = [];
    this._collectSymbolsRecursive(nodes, symbols);
    return symbols;
  }

  protected _collectSymbolsRecursive(nodes: ASTNode[], symbols: ASTSymbolInfo[]): void {
    for (const node of nodes) {
      if (['function', 'method', 'class', 'interface', 'variable', 'constant', 'type', 'enum'].includes(node.type)) {
        symbols.push({
          id: node.id,
          name: node.name,
          kind: node.type,
          filePath: '',
          startLine: node.startLine,
          endLine: node.endLine,
          visibility: node.metadata.visibility,
          isStatic: node.metadata.isStatic,
          isExported: node.metadata.isExported,
          signature: node.metadata.signature,
          documentation: node.metadata.documentation
        });
      }
      this._collectSymbolsRecursive(node.children, symbols);
    }
  }

  protected collectDependencies(nodes: ASTNode[]): DependencyInfo[] {
    const dependencies: DependencyInfo[] = [];
    this._collectDependenciesRecursive(nodes, dependencies);
    return dependencies;
  }

  protected _collectDependenciesRecursive(nodes: ASTNode[], dependencies: DependencyInfo[]): void {
    for (const node of nodes) {
      if (node.type === 'import') {
        dependencies.push({
          from: '',
          to: node.name,
          type: 'import',
          location: {
            startLine: node.startLine,
            endLine: node.endLine
          }
        });
      }
      this._collectDependenciesRecursive(node.children, dependencies);
    }
  }

  protected calculateStatistics(nodes: ASTNode[], code: string): ASTAnalysisResult['statistics'] {
    const stats: ASTAnalysisResult['statistics'] = {
      totalNodes: 0,
      functions: 0,
      classes: 0,
      variables: 0,
      imports: 0,
      exports: 0,
      linesOfCode: code.split('\n').length,
      commentLines: 0
    };
    this._calculateStatisticsRecursive(nodes, stats);
    return stats;
  }

  protected _calculateStatisticsRecursive(nodes: ASTNode[], stats: ASTAnalysisResult['statistics']): void {
    for (const node of nodes) {
      stats.totalNodes++;
      switch (node.type) {
        case 'function':
        case 'method':
          stats.functions++;
          break;
        case 'class':
        case 'interface':
          stats.classes++;
          break;
        case 'variable':
        case 'constant':
          stats.variables++;
          break;
        case 'import':
          stats.imports++;
          break;
        case 'export':
          stats.exports++;
          break;
        case 'comment':
          stats.commentLines += node.endLine - node.startLine + 1;
          break;
      }
      this._calculateStatisticsRecursive(node.children, stats);
    }
  }

  protected extractDocumentation(comments: string[], nodeStartLine: number): string | undefined {
    for (const comment of comments) {
      const commentLine = parseInt(comment.split(':')[0], 10);
      if (commentLine < nodeStartLine && nodeStartLine - commentLine <= 3) {
        return comment.substring(comment.indexOf(':') + 1).trim();
      }
    }
    return undefined;
  }
}
