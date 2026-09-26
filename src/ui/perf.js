// Perf harness overlay (P1.16): index.html?perf shows FPS, a frame-time
// histogram, the DOM node count, running animations and an estimate of the
// decoded image memory. docs/perf.md says how to read it, how to measure
// memory on the real iPad (Safari has no performance.memory: use Web
// Inspector's Timelines > Memory), and holds the first numbers.
//
//   const perf = startPerf();        // main.js does this for ?perf
//   perf.snapshot()                  // { fps, frames, hist, p50, p95, max, nodes, anims, imageMB, images, jsMB }
//   perf.reset()                     // start a new measurement window
//   window.__perf                    // the same object, for tools/perf.mjs
//
// Cost: the overlay itself runs one requestAnimationFrame loop (the game is
// otherwise idle at 0% CPU when nothing moves) and rewrites a few text nodes
// twice a second, so leave it off for battery tests.
//
// Pure helpers are exported for unit tests; DOM only inside startPerf.

// Frame-time buckets in ms (upper bounds): 60 fps, 40, 30, 20, 15, worse.
export const BUCKETS = [17.5, 25.5, 34, 50.5, 67, Infinity];
export const BUCKET_LABELS = ['<=17', '<=25', '<=33', '<=50', '<=67', '>67'];

/** Index of the histogram bucket for a frame time. Pure. */
export function bucketOf(ms) {
  for (let i = 0; i < BUCKETS.length; i++) if (ms <= BUCKETS[i]) return i;
  return BUCKETS.length - 1;
}

/** The q-quantile (0..1) of a list of numbers. Pure. */
export function quantile(list, q) {
  if (!list.length) return 0;
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

/**
 * Decoded bitmap bytes for a set of images (4 bytes per pixel, each distinct
 * src once: the browser shares one decoded copy per URL). A lower bound: the
 * GPU keeps its own copy of composited layers on top. Pure over plain
 * {src, w, h} records.
 */
export function imageBytes(images) {
  const seen = new Map();
  for (const i of images) if (i.src && i.w && i.h && !seen.has(i.src)) seen.set(i.src, i.w * i.h * 4);
  let total = 0;
  for (const b of seen.values()) total += b;
  return { bytes: total, count: seen.size };
}

const MAX_SAMPLES = 1200;   // frame times kept for the percentiles (~20 s at 60 fps)

export function startPerf({ doc = document, show = true } = {}) {
  const win = doc.defaultView;
  const samples = [];
  const hist = BUCKETS.map(() => 0);
  let frames = 0;
  let t0 = win.performance.now();
  let last = 0;
  let raf = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsT = t0;

  function tick(t) {
    if (last) {
      const dt = t - last;
      samples.push(dt);
      if (samples.length > MAX_SAMPLES) samples.shift();
      hist[bucketOf(dt)]++;
      frames++;
    }
    last = t;
    fpsFrames++;
    if (t - fpsT >= 1000) { fps = (fpsFrames * 1000) / (t - fpsT); fpsFrames = 0; fpsT = t; }
    raf = win.requestAnimationFrame(tick);
  }
  raf = win.requestAnimationFrame(tick);
  // A hidden page gets no frames: don't count the gap as one huge frame.
  const onVis = () => { last = 0; };
  doc.addEventListener('visibilitychange', onVis);

  function images() {
    const out = [];
    for (const img of doc.images) {
      if (img.complete && img.naturalWidth) out.push({ src: img.currentSrc || img.src, w: img.naturalWidth, h: img.naturalHeight });
    }
    return out;
  }

  function snapshot() {
    const im = imageBytes(images());
    const mem = win.performance && win.performance.memory;   // Chrome only; Safari: Web Inspector
    let anims = 0;
    try { anims = doc.getAnimations().filter((a) => a.playState === 'running').length; } catch (e) { anims = -1; }
    const elapsed = win.performance.now() - t0;
    return {
      fps: Math.round(fps * 10) / 10,
      avgFps: elapsed > 0 ? Math.round((frames * 1000 / elapsed) * 10) / 10 : 0,
      frames,
      seconds: Math.round(elapsed / 100) / 10,
      hist: hist.slice(),
      p50: Math.round(quantile(samples, 0.5) * 10) / 10,
      p95: Math.round(quantile(samples, 0.95) * 10) / 10,
      max: Math.round(Math.max(0, ...samples) * 10) / 10,
      nodes: doc.getElementsByTagName('*').length,
      svgNodes: doc.querySelectorAll('svg, svg *').length,
      anims,
      images: im.count,
      imageMB: Math.round(im.bytes / 1048576 * 10) / 10,
      jsMB: mem ? Math.round(mem.usedJSHeapSize / 1048576 * 10) / 10 : null,
    };
  }
  function reset() {
    samples.length = 0;
    for (let i = 0; i < hist.length; i++) hist[i] = 0;
    frames = 0;
    t0 = win.performance.now();
    last = 0;
  }

  let hud = null;
  let timer = 0;
  if (show) {
    hud = doc.createElement('div');
    hud.className = 'perf-hud';
    hud.dataset.noPan = '';
    hud.innerHTML = '<div class="perf-text"></div><div class="perf-bars">' + BUCKETS.map(() => '<div class="perf-bar"></div>').join('') + '</div>';
    doc.body.appendChild(hud);
    const text = hud.firstChild;
    const bars = [...hud.lastChild.children];
    const paint = () => {
      const s = snapshot();
      text.textContent = `FPS ${s.fps.toFixed(0)}  p50 ${s.p50}ms  p95 ${s.p95}ms\n`
        + `max ${s.max}ms  frames ${s.frames}\n`
        + `DOM ${s.nodes} (svg ${s.svgNodes})  anims ${s.anims}\n`
        + `images ${s.images}: ~${s.imageMB} MB decoded\n`
        + (s.jsMB != null ? `JS heap ${s.jsMB} MB\n` : 'JS heap: Web Inspector\n')
        + BUCKET_LABELS.join(' ');
      const top = Math.max(1, ...s.hist);
      bars.forEach((b, i) => { b.style.transform = `scaleY(${(s.hist[i] / top).toFixed(3)})`; });
    };
    paint();
    timer = win.setInterval(paint, 500);
  }

  const api = {
    snapshot, reset,
    stop() {
      win.cancelAnimationFrame(raf);
      win.clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVis);
      if (hud) hud.remove();
    },
  };
  win.__perf = api;
  return api;
}
