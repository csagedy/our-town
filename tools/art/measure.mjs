// Delivery-format measurements behind docs/STYLE.md section 9. Run:
//   node tools/art/measure.mjs            (prints a table, writes tools/art/measurements.json)
// Headless Chrome on the build Mac with CPU throttling as a stand-in for the
// A9X (the oldest target). Blink, not WebKit, and software raster: treat the
// times as relative (format A vs format B), not as iPad numbers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../harness.mjs';
import { ART_SCALE } from './palette.mjs';
import { svgFor, rasterize } from './build.mjs';
import { ROOM as KITCHEN } from './rooms/kitchen.mjs';
import { PROPS } from './props/starter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const THROTTLE = 5;       // Apple M4 single core is roughly 5x an A9X
const RUNS = 5;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const kb = (n) => +(n / 1024).toFixed(1);

// In the page: decode + draw an image (from bytes) at W x H device px, RUNS times; median ms.
async function timeDecode(page, b64, type, W, H) {
  return page.eval(async (data, mime, w, h, runs) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const times = [];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < runs; i++) {
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));   // new URL: no decoded-image cache hit
      const img = new Image();
      const t0 = performance.now();
      img.src = url;
      await img.decode();
      g.drawImage(img, 0, 0, w, h);
      g.getImageData(0, 0, 1, 1);
      times.push(performance.now() - t0);
      URL.revokeObjectURL(url);
    }
    times.sort((a, b) => a - b);
    return times[Math.floor(times.length / 2)];
  }, b64, type, W, H, RUNS);
}

async function main() {
  const page = await openPage({ root: ROOT, path: 'tools/art/raster.html' });
  const out = { throttle: THROTTLE, runs: RUNS, rooms: {}, props: {}, characters: {} };
  try {
    // ---------------- rooms: each layer as SVG-in-<img> vs WebP at 1.5 and 2 px/unit ----------------
    const room = KITCHEN, { x, y, w, h } = room.canvas;
    const place = (inner) => `<g id="art"><g transform="translate(${room.offset[0]} ${room.offset[1]}) scale(${ART_SCALE})"><g class="o">${inner}</g></g></g>`;
    // Display target: the stage bleed canvas on an iPad Pro 12.9 (2732 px across 1440 units = 1.9 px/unit).
    const DISPLAY = 1.9;
    const rows = [];
    const webps = {};
    for (const L of room.layers) {
      const svgDisplay = svgFor([x, y, w, h], place(L.art()), ART_SCALE * DISPLAY, room.defs);
      const svgBytes = Buffer.byteLength(svgDisplay);
      const elements = (svgDisplay.match(/<(path|rect|circle|ellipse|line|polygon|polyline)\b/g) || []).length;
      const row = { layer: L.id, svgKB: kb(svgBytes), svgElements: elements };
      await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      for (const R of [1.5, 2]) {
        const res = await rasterize(page, {
          svg: svgFor([x, y, w, h], place(L.art()), ART_SCALE * R, room.defs), unit: R, formats: ['webp', 'png'], quality: 0.9,
          crop: L.opaque ? null : { pad: 4, clamp: [x, y, w, h] }, opaque: L.opaque ? '#FBF3E8' : null,
        });
        webps[`${L.id}@${R}`] = res;
        row[`webp${R}KB`] = kb(Buffer.from(res.data.webp, 'base64').length);
        row[`png${R}KB`] = kb(Buffer.from(res.data.png, 'base64').length);
        row[`px${R}`] = res.px.join('x');
        row[`decodedMB${R}`] = +((res.px[0] * res.px[1] * 4) / 1048576).toFixed(1);
      }
      await page.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      const dW = Math.round(w * DISPLAY), dH = Math.round(h * DISPLAY);
      row.svgRasterMs = +(await timeDecode(page, Buffer.from(svgDisplay).toString('base64'), 'image/svg+xml', dW, dH)).toFixed(1);
      for (const R of [1.5, 2]) {
        const r = webps[`${L.id}@${R}`];
        row[`webp${R}DecodeMs`] = +(await timeDecode(page, r.data.webp, 'image/webp', r.px[0], r.px[1])).toFixed(1);
      }
      rows.push(row);
    }
    out.rooms.kitchen = rows;

    // ---------------- props: SVG-in-<img> vs WebP (2 px/unit) ----------------
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
    let svgTotal = 0, webpTotal = 0, n = 0, svgMs = 0, webpMs = 0, svgEls = 0;
    const pjobs = [];
    for (const [id, p] of Object.entries(PROPS)) {
      for (const [vn, art] of Object.entries(p.variants)) {
        const v = manifest.props[id].variants[vn];
        const svg = svgFor([-v.anchor[0] / ART_SCALE, -v.anchor[1] / ART_SCALE, v.size[0] / ART_SCALE, v.size[1] / ART_SCALE], `<g class="o">${art}</g>`, ART_SCALE * 2);
        const webp = fs.readFileSync(path.join(ROOT, v.file));
        svgTotal += Buffer.byteLength(svg); webpTotal += webp.length; n++;
        svgEls += (svg.match(/<(path|rect|circle|ellipse)\b/g) || []).length;
        pjobs.push([svg, webp.toString('base64'), v.px]);
      }
    }
    await page.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    for (const [svg, webp, px] of pjobs) {
      svgMs += await timeDecode(page, Buffer.from(svg).toString('base64'), 'image/svg+xml', px[0], px[1]);
      webpMs += await timeDecode(page, webp, 'image/webp', px[0], px[1]);
    }
    out.props = { sprites: n, svgKB: kb(svgTotal), webpKB: kb(webpTotal), avgSvgElements: +(svgEls / n).toFixed(0), svgRasterMsTotal: +svgMs.toFixed(1), webpDecodeMsTotal: +webpMs.toFixed(1) };

    // ---------------- characters: live SVG cost ----------------
    await page.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    out.characters = await page.eval(async () => {
      const { renderCharacter, svgWrap, poseFrames, matrixAttr } = await import('/src/engine/rig-svg.js');
      const rig = await (await fetch('/assets/characters/rig.json')).json();
      document.head.insertAdjacentHTML('beforeend', `<style>${rig.css}</style>`);
      const stage = document.createElement('div');
      stage.style.cssText = 'position:absolute;left:0;top:0;width:1440px;height:1000px;transform:scale(.95);transform-origin:0 0';
      document.body.appendChild(stage);
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      // mount 8 characters (2 of each of the cast), time build + first paint
      const t0 = performance.now();
      let html = '';
      for (let i = 0; i < 8; i++) {
        const c = rig.characters[i % 4];
        html += `<div style="position:absolute;left:${80 + i * 160}px;top:${300 + (i % 2) * 80}px">${svgWrap(rig, renderCharacter(rig, c, { pose: 'stand', expr: 'happy' }), { css: false })}</div>`;
      }
      stage.innerHTML = html;
      await frame();
      const mountMs = performance.now() - t0;
      const svgs = stage.querySelectorAll('svg');
      const nodes = svgs[0].querySelectorAll('*').length;
      const nodesAll = stage.querySelectorAll('*').length;
      // Pose changes on ALL 8 characters every frame for 60 frames: if the
      // frame interval stays ~16.7 ms, live posing fits the frame budget.
      const poseNames = Object.keys(rig.poses);
      const chars = [...svgs].map((svg, i) => ({ groups: [...svg.querySelectorAll('[data-f]')], sk: rig.bodies[rig.characters[i % 4].body].skeleton }));
      let jsMs = 0;
      const t1 = performance.now();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const t = performance.now();
        for (const ch of chars) {
          const { frames } = poseFrames(ch.sk, rig.poses[poseNames[i % poseNames.length]]);
          for (const g of ch.groups) { const f = frames[g.getAttribute('data-f')]; if (f) g.setAttribute('transform', matrixAttr(f)); }
        }
        jsMs += performance.now() - t;
      }
      await frame();
      const poseFrameMs = (performance.now() - t1) / 61;
      // Expression swaps (innerHTML of the eyes + mouth slots) on all 8, every frame for 60 frames.
      const exprs = Object.keys(rig.expressions);
      const t2 = performance.now();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        svgs.forEach((svg, k) => {
          const face = rig.bodies[rig.characters[k % 4].body].face, e = rig.expressions[exprs[(i + k) % exprs.length]];
          svg.querySelector('[data-slot="eyes"]').innerHTML = face.eyes[e.eyes];
          svg.querySelector('[data-slot="mouth"]').innerHTML = face.mouth[e.mouth];
        });
      }
      await frame();
      const exprFrameMs = (performance.now() - t2) / 61;
      const bytes = svgs[0].outerHTML.length;
      return { charactersMounted: 8, mountAndPaintMs: +mountMs.toFixed(1), domNodesPerCharacter: nodes, domNodesAll8: nodesAll,
        posing8FrameMs: +poseFrameMs.toFixed(1), posing8JsMsPerFrame: +(jsMs / 60).toFixed(2), expr8FrameMs: +exprFrameMs.toFixed(1), svgBytesPerCharacter: bytes,
        combos: { poses: poseNames.length, expressions: exprs.length, outfitPieces: Object.keys(rig.wear).length } };
    });
    await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  } finally {
    await page.close();
  }
  fs.writeFileSync(path.join(HERE, 'measurements.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
