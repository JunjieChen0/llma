import * as vscode from 'vscode';

export interface EditLocation {
  filepath: string;
  line?: number;
  column?: number;
  range?: vscode.Range;
}

export async function revealEditLocation(
  location: EditLocation,
  options: {
    highlight?: boolean;
    focus?: boolean;
    scrollIntoView?: boolean;
  } = {}
): Promise<vscode.Range | null> {
  const {
    highlight = true,
    focus = true,
    scrollIntoView = true
  } = options;

  try {
    const targetUri = vscode.Uri.file(location.filepath);
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(doc, {
      preserveFocus: !focus,
      preview: false
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    if (location.range) {
      const selection = new vscode.Selection(
        location.range.start,
        location.range.end
      );
      editor.selection = selection;
      if (scrollIntoView) {
        editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
      }
      if (highlight) {
        await highlightRange(editor, location.range);
      }
      return location.range;
    } else if (location.line !== undefined) {
      const line = Math.max(0, location.line - 1);
      const column = location.column || 0;
      const position = new vscode.Position(line, column);
      const range = new vscode.Range(position, position);
      
      const selection = new vscode.Selection(position, position);
      editor.selection = selection;
      if (scrollIntoView) {
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
      if (highlight) {
        await highlightRange(editor, range);
      }
      return range;
    }
    return null;
  } catch (error) {
    console.error('Failed to reveal edit location:', error);
    vscode.window.showWarningMessage(`无法定位文件: ${location.filepath}`);
    return null;
  }
}

export async function revealWithFallback(
  filepath: string,
  pattern: string,
  fallbackLine?: number
): Promise<vscode.Range | null> {
  const targetUri = vscode.Uri.file(filepath);
  
  try {
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const fullText = doc.getText();
    const normalizedText = fullText.replace(/\r\n/g, '\n');
    const normalizedPattern = pattern.replace(/\r\n/g, '\n');
    
    const index = normalizedText.indexOf(normalizedPattern);
    if (index !== -1) {
      const startPos = doc.positionAt(index);
      const endPos = doc.positionAt(index + normalizedPattern.length);
      const range = new vscode.Range(startPos, endPos);
      
      const editor = await vscode.window.showTextDocument(doc, {
        preserveFocus: false,
        preview: false
      });
      editor.selection = new vscode.Selection(startPos, endPos);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      await highlightRange(editor, range);
      
      return range;
    }
  } catch (error) {
    console.error('Error in revealWithFallback:', error);
  }

  if (fallbackLine !== undefined) {
    return await revealEditLocation({
      filepath,
      line: fallbackLine
    }, { highlight: true, focus: true });
  }

  return null;
}

function highlightRange(editor: vscode.TextEditor, range: vscode.Range): Promise<void> {
  return new Promise((resolve) => {
    const decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground')
    });
    
    editor.setDecorations(decorationType, [range]);

    setTimeout(() => {
      decorationType.dispose();
      resolve();
    }, 3000);
  });
}

export function calculateEditRange(
  originalText: string,
  newText: string,
  document: vscode.TextDocument,
  options: { caseSensitive?: boolean; fuzzyMatch?: boolean } = {}
): vscode.Range | null {
  const { caseSensitive = true, fuzzyMatch = false } = options;
  const fullText = document.getText();
  
  const fullTextNorm = fullText.replace(/\r\n/g, '\n');
  const originalNorm = originalText.replace(/\r\n/g, '\n');
  
  let index = caseSensitive 
    ? fullTextNorm.indexOf(originalNorm)
    : fullTextNorm.toLowerCase().indexOf(originalNorm.toLowerCase());
  
  if (index === -1 && fuzzyMatch) {
    const fuzzyResult = findFuzzyMatch(fullTextNorm, originalNorm);
    if (fuzzyResult) {
      index = fuzzyResult.index;
    }
  }
  
  if (index === -1) {
    return null;
  }
  
  const crlfOffset = countCRLFOffset(fullText, index);
  const adjustedIndex = index + crlfOffset;
  const adjustedLength = originalNorm.length + countCRLFOffset(fullText, index + originalNorm.length) - crlfOffset;
  
  const startPos = document.positionAt(adjustedIndex);
  const endPos = document.positionAt(adjustedIndex + adjustedLength);
  
  return new vscode.Range(startPos, endPos);
}

function countCRLFOffset(text: string, position: number): number {
  let offset = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === '\r' && text[i + 1] === '\n') {
      offset++;
      i++;
    }
  }
  return offset;
}

function findFuzzyMatch(text: string, pattern: string): { index: number; score: number } | null {
  const dmp = new (require('diff-match-patch'))();
  const matches = dmp.match_main(text, pattern, 0);
  if (matches !== -1) {
    return { index: matches, score: 1 };
  }
  
  const patternLen = pattern.length;
  const threshold = Math.max(0.6, 1 - Math.abs(text.length - patternLen) / Math.max(text.length, patternLen));
  dmp.Match_Threshold = threshold;
  
  const found = dmp.match(text, pattern, 0);
  if (found !== -1) {
    return { index: found, score: threshold };
  }
  
  return null;
}

export async function revealAndSelect(
  filepath: string,
  pattern: string | RegExp,
  options: {
    matchIndex?: number;
    highlight?: boolean;
  } = {}
): Promise<vscode.Range | null> {
  const { matchIndex = 0, highlight = true } = options;
  
  try {
    const targetUri = vscode.Uri.file(filepath);
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(doc, {
      preserveFocus: false,
      preview: false
    });
    
    const text = doc.getText();
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      : new RegExp(pattern.source, pattern.flags);
    
    const matches = [...text.matchAll(regex)];
    
    if (matches.length === 0 || matchIndex >= matches.length) {
      return null;
    }
    
    const match = matches[matchIndex];
    const startPos = doc.positionAt(match.index);
    const endPos = doc.positionAt(match.index + match[0].length);
    const range = new vscode.Range(startPos, endPos);
    
    const selection = new vscode.Selection(startPos, endPos);
    editor.selection = selection;
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    
    if (highlight) {
      await highlightRange(editor, range);
    }
    
    return range;
  } catch (error) {
    console.error('Failed to reveal and select:', error);
    return null;
  }
}

export async function openFileAtLocation(
  filepath: string,
  line?: number,
  column?: number
): Promise<vscode.TextEditor | null> {
  try {
    const targetUri = vscode.Uri.file(filepath);
    const doc = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(doc, {
      preserveFocus: false,
      preview: false
    });
    
    if (line !== undefined) {
      const position = new vscode.Position(
        Math.max(0, line - 1),
        column || 0
      );
      const range = new vscode.Range(position, position);
      const selection = new vscode.Selection(position, position);
      editor.selection = selection;
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
    
    return editor;
  } catch (error) {
    console.error('Failed to open file at location:', error);
    return null;
  }
}
