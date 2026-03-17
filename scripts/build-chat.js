/**
 * 构建 chat.html：将模板与模块化 JS 合并为单一文件
 * 运行: node scripts/build-chat.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mediaDir = path.join(root, 'media');
const jsDir = path.join(mediaDir, 'js');

const jsOrder = ['state', 'renderer', 'main'];

// 读取模板
let html = fs.readFileSync(path.join(mediaDir, 'chat-template.html'), 'utf8');

// 替换 JS：从模块文件拼接
let js = '';
for (const name of jsOrder) {
  const filePath = path.join(jsDir, name + '.js');
  if (fs.existsSync(filePath)) {
    js += fs.readFileSync(filePath, 'utf8').trim() + '\n\n';
  } else {
    console.warn('警告: 未找到', name + '.js');
  }
}
// 使用 split/join 避免 replace 将 $& 等当作特殊替换模式
const parts = html.split('{{SCRIPTS}}');
html = parts[0] + js.trim() + (parts[1] || '');
console.log('JS: 已从', jsOrder.length, '个模块拼接');

fs.writeFileSync(path.join(mediaDir, 'chat.html'), html);
console.log('chat.html 构建完成');
