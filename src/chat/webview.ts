// chat/webview.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function generateChatHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialTheme: 'light' | 'dark' = 'dark'): string {
  const cspSource = webview.cspSource;
  const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; script-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src ${cspSource} data:; img-src ${cspSource} data: https:;`;

  const htmlPath = path.join(extensionUri.fsPath, 'media', 'chat.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/{{csp}}/g, csp);
  html = html.replace(/\{\{INITIAL_THEME\}\}/g, initialTheme);
  // 直接在 body 上设置 class，首屏即生效，不依赖脚本执行顺序
  if (initialTheme === 'light') {
    html = html.replace(/<body(\s|>)/, '<body class="light-theme"$1');
  }
  return html;
}