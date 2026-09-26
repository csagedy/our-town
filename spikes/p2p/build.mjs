// Inlines the vendored QR libraries into src/app.html -> index.html (one self-contained file).
// Usage: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const read = (p) => readFileSync(new URL(p, here), 'utf8');
// Guard against "</script>" inside library text ending the inline block early.
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const html = read('src/app.html')
  .replace('/*__QRCODE__*/', () => '/* qrcode-generator 2.0.4 | MIT | (c) 2009 Kazuhiko Arase */\n' + safe(read('vendor/qrcode-generator-2.0.4.js')))
  .replace('/*__JSQR__*/', () => '/* jsQR 1.4.0 | Apache-2.0 | https://github.com/cozmo/jsQR | see vendor/LICENSE-jsQR.txt */\n' + safe(read('vendor/jsQR-1.4.0.js')));
writeFileSync(new URL('index.html', here), html);
console.log('wrote index.html', html.length, 'bytes');
