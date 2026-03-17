# 主题切换改动 Diff 视图

以下为「无需重新加载即可切换主题」相关的具体代码修改，采用统一 diff 格式（`-` 为删除，`+` 为新增）。

---

## 1. src/chat/index.ts

```diff
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri]
    };
-   webviewView.webview.html = generateChatHtml(webviewView.webview, this._context.extensionUri);
+   const themeKind = vscode.window.activeColorTheme.kind;
+   const initialTheme = (themeKind === vscode.ColorThemeKind.Light || themeKind === vscode.ColorThemeKind.HighContrastLight) ? 'light' : 'dark';
+   webviewView.webview.html = generateChatHtml(webviewView.webview, this._context.extensionUri, initialTheme);

    const savedHistory = this._context.globalState.get<any[]>('llma.chatHistory') || [];
    this.currentSessionHistory = savedHistory.slice();
    webviewView.webview.postMessage({ type: 'initHistory', history: savedHistory });

-   // （无主题相关逻辑）
+   // 发送当前主题；主题变化 + 面板重新可见时都发送，实现立马切换
+   const sendTheme = () => {
+     const kind = vscode.window.activeColorTheme.kind;
+     const theme = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? 'light' : 'dark';
+     this._view?.webview.postMessage({ type: 'themeChanged', theme });
+   };
+   sendTheme();
+   const themeSub = vscode.window.onDidChangeActiveColorTheme(() => {
+     // 延迟一帧再读主题并发送，避免事件触发时 API 尚未更新
+     setTimeout(() => {
+       sendTheme();
+       setTimeout(sendTheme, 80);
+     }, 0);
+   });
+   // 面板从隐藏恢复可见时重新同步主题（隐藏时收不到 postMessage）
+   const visibilitySub = webviewView.onDidChangeVisibility(() => {
+     if (webviewView.visible) sendTheme();
+   });
+   webviewView.onDidDispose(() => {
+     themeSub.dispose();
+     visibilitySub.dispose();
+   });

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
+       case 'getTheme':
+         sendTheme();
+         break;
        case 'sendMessage':
```

---

## 2. src/chat/webview.ts

```diff
- export function generateChatHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
+ export function generateChatHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialTheme: 'light' | 'dark' = 'dark'): string {
    const cspSource = webview.cspSource;
    const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; script-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src ${cspSource} data:; img-src ${cspSource} data: https:;`;

    const htmlPath = path.join(extensionUri.fsPath, 'media', 'chat.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(/{{csp}}/g, csp);
+   html = html.replace(/\{\{INITIAL_THEME\}\}/g, initialTheme);
+   // 直接在 body 上设置 class，首屏即生效，不依赖脚本执行顺序
+   if (initialTheme === 'light') {
+     html = html.replace(/<body(\s|>)/, '<body class="light-theme"$1');
+   }
    return html;
  }
```

---

## 3. media/chat-template.html

```diff
    <script>
-   // 自动检测 VS Code 主题并应用
-   (function() {
-     function updateThemeFromVSCode() {
-       const isVSCodeDark = document.body.classList.contains('vscode-dark') ||
-                            document.body.classList.contains('vscode-high-contrast');
-       if (isVSCodeDark) {
-         document.body.classList.remove('light-theme');
-         localStorage.setItem('theme', 'dark');
-       } else {
-         document.body.classList.add('light-theme');
-         localStorage.setItem('theme', 'light');
-       }
-     }
-     updateThemeFromVSCode();
-     const observer = new MutationObserver(function(mutations) {
-       mutations.forEach(function(mutation) {
-         if (mutation.attributeName === 'class') {
-           updateThemeFromVSCode();
-         }
-       });
-     });
-     observer.observe(document.body, { attributes: true });
-   })();
+   // 主题：首屏由注入的 {{INITIAL_THEME}} 立即应用，之后由 postMessage('themeChanged') 同步
+   function applyTheme(theme) {
+     if (theme === 'light') {
+       document.body.classList.add('light-theme');
+       localStorage.setItem('theme', 'light');
+     } else {
+       document.body.classList.remove('light-theme');
+       localStorage.setItem('theme', 'dark');
+     }
+   }
+   applyTheme('{{INITIAL_THEME}}');
    {{SCRIPTS}}
  </script>
```

---

## 4. media/js/main.js

```diff
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
+       case 'themeChanged':
+         if (message.theme === 'light' || message.theme === 'dark') applyTheme(message.theme);
+         break;
        case 'addResponse':
          clearTaskProgress();
```

---

## 小结

| 文件 | 改动要点 |
|------|----------|
| `src/chat/index.ts` | 首屏传入 initialTheme；sendTheme + onDidChangeActiveColorTheme + onDidChangeVisibility；处理 getTheme |
| `src/chat/webview.ts` | generateChatHtml 增加 initialTheme 参数；替换 {{INITIAL_THEME}}；亮色时给 body 加 class |
| `media/chat-template.html` | 去掉基于 vscode-dark 的检测与 MutationObserver；改为 applyTheme + applyTheme('{{INITIAL_THEME}}') |
| `media/js/main.js` | 在消息 switch 中增加 case 'themeChanged' 并调用 applyTheme |
