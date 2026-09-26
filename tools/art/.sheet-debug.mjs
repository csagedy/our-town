import { openPage } from '../harness.mjs';
const page = await openPage({ root: new URL('../..', import.meta.url).pathname, path: 'tools/art/raster.html' });
await page.setViewport({ width: 1600, height: 1000 });
await page.goto('tools/art/contact-sheet/index.html');
console.log(await page.eval(() => [...document.querySelectorAll('section[id]')].map((s) => { const r = s.getBoundingClientRect(); return s.id + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }).join('\n')));
console.log(await page.eval(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })));
console.log(page.errors);
await page.close();
