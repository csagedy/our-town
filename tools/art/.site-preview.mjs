// scratch: render the site strip (all layers + chosen piece variants) to a PNG
import fs from 'node:fs';
import { openPage } from '../harness.mjs';
import { ART_SCALE, P } from './palette.mjs';
import { svgFor, rasterize } from './build.mjs';
import { ROOM } from './rooms/site.mjs';
const OUT = process.argv[2];
const alt = process.argv.includes('--alt');
const ALT = { 'potty-door': 'open', 'crane-lever': 'down', 'truck-bed': 'up', 'excavator-bucket': 'full', 'mixer-drum': 'spin2' };
const page = await openPage({ root: new URL('../..', import.meta.url).pathname, path: 'tools/art/raster.html' });
const { x, y, w, h } = ROOM.canvas;
let inner = '';
for (const L of ROOM.layers) {
  inner += L.art();
  for (const pc of ROOM.pieces) if (pc.layer === L.id) { const n = Object.keys(pc.variants); const v = alt && ALT[pc.id] ? ALT[pc.id] : n[0]; inner += pc.variants[v](); }
}
const place = `<g id="art"><g transform="scale(${ART_SCALE})"><g class="o">${inner}</g></g></g>`;
const zi = process.argv.indexOf('--zone'); const Z = zi > 0 ? ROOM.zones[+process.argv[zi + 1]] : null; const U = Z ? 1 : 0.6;
const k = ART_SCALE * U;
const res = await rasterize(page, { svg: svgFor(Z ? [Z.camera, 0, 1440, 1000] : [x, y, w, h], place, k, ROOM.defs), unit: U, formats: ['png'], crop: null, opaque: P.cream });
fs.writeFileSync(OUT, Buffer.from(res.data.png, 'base64'));
await page.close();
console.log('ok', res.px);
