import fs from 'node:fs';
import { openPage } from '../harness.mjs';
import { P } from './palette.mjs';
import { svgFor, rasterize } from './build.mjs';
import { SITE_PROPS } from './props/site.mjs';
const OUT = process.argv[2];
const page = await openPage({ root: new URL('../..', import.meta.url).pathname, path: 'tools/art/raster.html' });
let x = 0, y = 200, body = '';
const W = 2400;
for (const [id, p] of Object.entries(SITE_PROPS)) for (const [vn, art] of Object.entries(p.variants)) {
  const w = p.snap ? p.snap.footprint[0] * 57.2 + 40 : 200;
  if (x + w > W) { x = 0; y += 260; }
  body += `<g transform="translate(${x + w / 2} ${y})">${art}</g><circle class="n" fill="red" cx="${x + w / 2}" cy="${y}" r="3"/>`;
  x += w + 20;
}
const H = y + 60;
const res = await rasterize(page, { svg: svgFor([0, 0, W, H], `<g id="art" class="o">${body}</g>`, 0.7), unit: 0.7, formats: ['png'], crop: null, opaque: P.cream });
fs.writeFileSync(OUT, Buffer.from(res.data.png, 'base64'));
await page.close();
console.log(res.px);
