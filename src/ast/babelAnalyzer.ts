// src/ast/babelAnalyzer.ts

import { BaseASTAnalyzer } from './base';
import { ASTNode, ASTAnalysisResult } from './types';

export class BabelTypeScriptAnalyzer extends BaseASTAnalyzer {
  language = 'typescript';
  supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

  async analyze(code: string, filePath: string): Promise<ASTAnalysisResult> {
    const { TypeScriptASTAnalyzer } = await import('./typescriptAnalyzer');
    const analyzer = new TypeScriptASTAnalyzer();
    return analyzer.analyze(code, filePath);
  }
}
