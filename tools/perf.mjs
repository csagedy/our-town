// First perf check (P1.16): headless Chrome with CPU throttling as a rough
// A9X proxy, driving the real app with real touches and reading the ?perf
// overlay's numbers (src/ui/perf.js) plus CDP Performance.getMetrics.
// Results go in docs/perf.md by hand; this prints a table and JSON.
//
//   node tools/perf.mjs                 # throttle x5, ipad-pro-9.7
//   node tools/perf.mjs --rate 6 --viewport ipad-pro-12.9
//
// Blink with software raster is not WebKit on an A9X GPU: read the numbers
// as relative (what got worse, what is heavy), and re-check on the iPad
// (docs/perf.md "On the real iPad").

import { openPage } from './harness.mjs';

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const RATE = Number(arg('rate', 5));
const VIEWPORT = arg('viewport', 'ipad-pro-9.7');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await openPage({ viewport: VIEWPORT });
const results = [];
async function metrics() {
  const { metrics: m } = await page.send('Performance.getMetrics');
  const o = Object.fromEntries(m.map((x) => [x.name, x.value]));
  return { jsHeapMB: Math.round(o.JSHeapUsedSize / 1048576 * 10) / 10, layouts: o.LayoutCount, styles: o.RecalcStyleCount };
}
async function measure(name, fn, { settle = 400 } = {}) {
  await sleep(settle);
  const m0 = await metrics();
  await page.eval(() => { window.__perf.reset(); window.__longTasks.length = 0; const v = window.__town.scene && window.__town.scene.view; if (v) v.resetStats(); });
  await fn();
  const s = await page.eval(() => window.__perf.snapshot());
  const m1 = await metrics();
  const lt = await page.eval(() => { const l = window.__longTasks.splice(0); return { n: l.length, maxMs: Math.round(Math.max(0, ...l)) }; });
  const vs = await page.eval(() => { const v = window.__town.scene && window.__town.scene.view; if (!v) return null; const st = v.stats(); v.resetStats(); return { moves: st.moves, avgMoveMs: st.moves ? Math.round(st.moveMs / st.moves * 100) / 100 : 0, maxMoveMs: Math.round(st.maxMoveMs * 100) / 100 }; });
  const r = { name, ...s, jsHeapMB: m1.jsHeapMB, layouts: m1.layouts - m0.layouts, styles: m1.styles - m0.styles, longTasks: lt, drag: vs };
  results.push(r);
  console.log(`${name.padEnd(34)} longtasks ${lt.n} (max ${lt.maxMs}ms)${vs && vs.moves ? ` drag move avg ${vs.avgMoveMs}ms max ${vs.maxMoveMs}ms` : ''}\n${''.padEnd(34)} fps ${String(s.avgFps).padStart(5)}  p50 ${String(s.p50).padStart(5)}  p95 ${String(s.p95).padStart(6)}  max ${String(s.max).padStart(6)}  DOM ${s.nodes}  anims ${s.anims}  img ${s.imageMB}MB  heap ${m1.jsHeapMB}MB`);
  return r;
}
const pt = (x, y) => ({ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 });
async function swipe(from, to, ms = 500, steps = 25) {
  const g = page.gesture();
  await g('touchStart', [pt(from.x, from.y)], 0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await g('touchMove', [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)], (ms * i) / steps);
    await sleep(ms / steps);
  }
  await g('touchEnd', [], ms + 16);
}

await page.send('Performance.enable', {});
await page.send('Emulation.setCPUThrottlingRate', { rate: RATE });
// Decoded-image peak (bead 6hn): bitmaps referenced at any moment = <img>s in
// the page with a loaded src, plus off-screen images being decoded (a
// preload's new Image().decode(), a tile loader's decode-ahead), each URL
// once. Sampled every frame while armed and at every decode() resolution
// (the moment a preload is fully decoded while the old scene is still up).
await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  (() => {
    const off = new Set();
    const peak = window.__imgPeak = { armed: false, maxMB: 0, sample() {
      const seen = new Map();
      const add = (i) => { const s = i.currentSrc || i.src; if (s && i.naturalWidth && !seen.has(s)) seen.set(s, i.naturalWidth * i.naturalHeight * 4); };
      for (const i of document.images) if (i.complete) add(i);
      for (const i of off) add(i);
      let b = 0; for (const v of seen.values()) b += v;
      const mb = Math.round(b / 1048576 * 10) / 10;
      if (mb > peak.maxMB) peak.maxMB = mb;
      return mb;
    }, arm() { peak.armed = true; peak.maxMB = 0; peak.sample(); const f = () => { if (!peak.armed) return; peak.sample(); requestAnimationFrame(f); }; requestAnimationFrame(f); },
    disarm() { peak.sample(); peak.armed = false; return peak.maxMB; } };
    const dec = HTMLImageElement.prototype.decode;
    if (dec) HTMLImageElement.prototype.decode = function () {
      const p = dec.call(this);
      if (!this.isConnected) {
        off.add(this);
        const done = () => { if (peak.armed) peak.sample(); off.delete(this); };
        p.then(done, done);
      }
      return p;
    };
  })();
  new MutationObserver((l, o) => { if (document.body && document.body.dataset.boot === 'ready') { window.__bootReadyAt = performance.now(); o.disconnect(); } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-boot'] });` });
await page.goto('index.html?perf');
const boot = await page.eval(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource');
  return { ready: Math.round(window.__bootReadyAt || 0), dcl: Math.round(nav.domContentLoadedEventEnd), lastResource: Math.round(Math.max(0, ...res.map((r) => r.responseEnd))) };
});
const bootMs = boot.ready;
await page.eval(() => {
  window.__longTasks = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* not in Safari */ }
});
console.log(`throttle x${RATE}, ${VIEWPORT}; boot ready at ${boot.ready} ms, DOMContentLoaded ${boot.dcl} ms, last file loaded at ${boot.lastResource} ms`);
const vw = await page.eval(() => ({ w: innerWidth, h: innerHeight }));

await measure('city idle (3 s)', () => sleep(3000));
const bigImages = await page.eval(() => [...document.images].filter((i) => i.complete && i.naturalWidth)
  .map((i) => ({ src: i.getAttribute('src'), mb: Math.round(i.naturalWidth * i.naturalHeight * 4 / 104857.6) / 10, px: i.naturalWidth + 'x' + i.naturalHeight }))
  .filter((v, k, a) => a.findIndex((q) => q.src === v.src) === k).sort((a, b) => b.mb - a.mb).slice(0, 8));
console.log('city: biggest decoded images', bigImages);
// Pan start (bead bp8): the first swipe of a fresh page, alone.
await measure('city pan start (1st swipe)', async () => {
  await swipe({ x: vw.w * 0.8, y: vw.h * 0.45 }, { x: vw.w * 0.2, y: vw.h * 0.45 });
  await sleep(600);
});
await measure('city pan (6 swipes)', async () => {
  for (let i = 0; i < 3; i++) {
    await swipe({ x: vw.w * 0.8, y: vw.h * 0.45 }, { x: vw.w * 0.2, y: vw.h * 0.45 });
    await swipe({ x: vw.w * 0.2, y: vw.h * 0.45 }, { x: vw.w * 0.8, y: vw.h * 0.45 });
  }
  await sleep(600);
});
const tGo = Date.now();
await measure('city -> kitchen transition', async () => {
  await page.eval(() => { window.__imgPeak.arm(); return window.__town.go('cafe/kitchen'); });
  await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
}, { settle: 100 });
results[results.length - 1].transitionMs = Date.now() - tGo;
results[results.length - 1].peakImageMB = await page.eval(() => window.__imgPeak.disarm());
console.log(`${''.padEnd(34)} transition ${results[results.length - 1].transitionMs} ms, decoded-image peak ${results[results.length - 1].peakImageMB} MB`);
await page.waitFor(() => window.__town.scene.view && window.__town.scene.chars);
await measure('kitchen idle, cast of 4 (3 s)', () => sleep(3000));
async function dragMug(n) {
  for (let i = 0; i < n; i++) {
    const p = await page.eval(() => {
      // The mug, or (if a character has picked it up) any loose prop on screen.
      const ents = Object.values(window.__store.state.entities).filter((e) => !e.deleted && !e.parent && e.room === 'cafe/kitchen' && e.kind !== 'char');
      const m = ents.find((e) => e.kind === 'mug') || ents.find((e) => window.__town.scene.view.viewOf(e.id));
      const v = m && window.__town.scene.view.viewOf(m.id);
      if (!v) return null;
      const r = v.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!p) return;
    await swipe(p, { x: vw.w * (i % 2 ? 0.3 : 0.7), y: vw.h * 0.85 }, 700, 30);
    await sleep(500);
  }
}
await measure('kitchen drag a mug x4, cast of 4', () => dragMug(4));
// Grow the cast to 12 (the P1.15 starter cast size): copies of the 4.
await page.eval(() => {
  const s = window.__store;
  const chars = Object.values(s.state.entities).filter((e) => e.kind === 'char' && !e.deleted && e.room === 'cafe/kitchen');
  for (let i = 0; i < 8; i++) {
    const c = chars[i % chars.length];
    const props = JSON.parse(JSON.stringify(c.props));
    props.pose = 'stand'; props.seat = null;
    s.dispatch('spawn', { id: s.newId(), kind: 'char', room: 'cafe/kitchen', x: 180 + i * 150, y: 860 + (i % 3) * 30, props });
  }
});
await page.frames(4);
await measure('kitchen idle, cast of 12 (3 s)', () => sleep(3000));
await measure('kitchen drag a mug x4, cast of 12', () => dragMug(4));
await measure('kitchen text layer on, cast of 12', async () => {
  await page.eval(() => document.body.classList.add('text-layer'));
  await sleep(2000);
});
await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
console.log(JSON.stringify({ rate: RATE, viewport: VIEWPORT, bootMs, results }, null, 1));
if (page.errors.length) console.log('page errors:', page.errors);
await page.close();
