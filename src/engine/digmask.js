// Dig mask (P2c.3, docs/design.md 3.3 #5-#7, 6.2 "one <canvas> only where
// pixels change"): a patch of dirt (or sand) you can dig holes in and fill
// back up, saved and shared as a handful of small store ops. The site's dig
// pit uses it (src/scenes/site-dig.js); the school sandbox (P2d.4) reuses it.
//
// THE MODEL (pure, no DOM). A mask is a grid over a world box, `cell` world
// units per cell (2 by default), each cell holding how much dirt is there:
// 0 (dug out) .. FULL (15, untouched). Holes are soft circles:
//
//   const mask = createMask({ box: [x, y, w, h], cell: 2 });
//   stamp(mask, x, y, r, 'd')        // dig a soft round hole (min), returns how much dirt it took
//   stamp(mask, x, y, r, 'f')        // fill one back in (max), returns how much it added
//   coverage(mask, x0, y0, x1, y1)   // mean dirt 0..1 over a world box (null: no cells there)
//   dirtLeft(mask)                   // mean dirt 0..1 over the whole mask
//
// Inside 55% of the radius a dig takes everything, then the level ramps up to
// the rim, so the edge is soft; a fill is solid out to 75% and then ramps
// down, so it covers a same-size hole's rim. Dig is a min and fill a max: stamping the
// same circle twice changes nothing (a replayed or echoed op is harmless).
//
// STROKES. One finger gesture (a spade drag, a bucket pass) becomes ONE op:
// its circle centres, quantized to whole world units relative to the box,
// with one radius: { m: 'd' | 'f', r, p: [x0, y0, x1, y1, ...] }. The
// builder coalesces the finger's points (a point closer than 30% of r to the
// last one kept is skipped) and stamps exactly what a replay will stamp
// (between kept points, circles every 35% of r), so the live preview and
// every other iPad's replay are the same pixels.
//
//   const b = strokeBuilder(mask, 'd', 24);
//   b.add(x, y)      // world point; stamps (when kept) and returns the dirt it moved
//   b.op()           // the stroke op so far (null if nothing kept); b.full() past MAX_POINTS
//   applyStroke(mask, op)
//
// SNAPSHOTS. encodeMask(mask) packs the grid as base64 run-length bytes
// (value << 4 | run - 1, or value << 4 | 15 plus a 16-bit run): an untouched
// mask is 4 characters, a well-dug pit a couple of KB. decodeMask(mask, s)
// reads one back (false if it does not fit this mask). Exact: no drift.
//
// IN THE STORE. Every stroke is its own entity (kind STROKE_KIND, in an
// invisible room such as 'construction/dig', props { mask: <id>, ...stroke }),
// so two kids digging at once never overwrite each other (a list in one prop
// would be last-writer-wins). Replay order is the spawn stamp [lamport,
// device], which the host's one order makes the same on both iPads. When
// there are more than `compactAt` strokes, the device that just dug folds
// the mask into ONE snapshot entity (kind SNAP_KIND, props { mask, cols,
// rows, cell, data: base64 }) and hard-removes the strokes it covers and the
// older snapshots: a robust plain prop, saved in the world and sent with it
// (blobs are neither synced nor in ops). A stroke the snapshot did not
// see (the other kid's, in flight) survives and replays on top.
//
//   digState(state, maskId)           -> { snap, strokes }   (strokes in replay order)
//   replay(mask, state, maskId)       -> rebuilds the mask from the store
//   compactionOps(state, mask, maskId, { room, newId })  -> [[op, args], ...]
//
// THE CONTROLLER (store + mask; still no DOM):
//
//   const pit = createDigPit({ store, id: 'pit', room: 'construction/dig', box, cell, compactAt, onChange });
//   const g = pit.begin('d', 24);  g.add(x, y) -> dirt moved;  g.end()  // one op per gesture
//   pit.fill(x, y, r)               // a one-circle fill op (a dumped bucket)
//   pit.mask                        // what is on screen: the store's mask plus gestures in progress
//   pit.coverage(x0, y0, x1, y1), pit.dirtLeft(), pit.stats(), pit.destroy()
//   onChange(dirty) is called after every change (dirty: cell rect [c0, r0, c1, r1] or null = all).
//
// THE CANVAS (DOM, created only when called):
//
//   const cv = createDigCanvas({ host, frame: [x, y, w, h], mask, src, ppu: 1.5 });
//   cv.request()     // redraw on the next frame (one rAF, then nothing: zero idle cost)
//   cv.canvas, cv.stats(), cv.destroy()
//
// `frame` is the world box of the dirt picture (`src`), which may be bigger
// than the mask's box (a rim that never digs). The picture is drawn at `ppu`
// canvas px per world unit; the mask lives in a second, cell-sized canvas
// (1 px per cell, the dirt colour, alpha = the hole) that is drawn over it
// scaled up and smoothed with 'destination-out', so holes have soft edges.
// A faint darker ring around each hole (the same mask, offset, 'source-atop')
// gives the lip some depth. Memory for the site's pit: 616 x 349 x 4 bytes
// (0.86 MB) plus 165 x 112 x 4 (74 KB).

import { compareStamps } from './ids.js';

export const FULL = 15;
export const INNER = 0.55;          // fraction of the radius dug out completely
export const FILL_CORE = 0.75;      // fraction of the radius a fill fills completely
export const STEP = 0.35;           // circles along a stroke, as a fraction of r
export const MIN_GAP = 0.3;         // a finger point closer than this (x r) to the last kept one is skipped
export const MAX_POINTS = 160;      // points per stroke op (a longer gesture is several ops)
export const STROKE_KIND = 'dig-stroke';
export const SNAP_KIND = 'dig-snap';
export const COMPACT_AT = 40;

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---------------------------------------------------------------------------
// The model

/** A full (untouched) mask over world box [x, y, w, h]. Pure. */
export function createMask({ box, cell = 2 }) {
  const [x, y, w, h] = box;
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const v = new Uint8Array(cols * rows).fill(FULL);
  return { x, y, w, h, cell, cols, rows, v, dirty: null };
}

function markDirty(m, c0, r0, c1, r1) {
  const d = m.dirty;
  if (!d) m.dirty = [c0, r0, c1, r1];
  else { if (c0 < d[0]) d[0] = c0; if (r0 < d[1]) d[1] = r0; if (c1 > d[2]) d[2] = c1; if (r1 > d[3]) d[3] = r1; }
}
const markAll = (m) => { m.dirty = [0, 0, m.cols - 1, m.rows - 1]; };

/** Fill every cell with `level` (FULL: untouched dirt). */
export function resetMask(m, level = FULL) {
  m.v.fill(level);
  markAll(m);
}

/** Copy b's cells into a (same geometry). */
export function copyMask(a, b) {
  a.v.set(b.v);
  markAll(a);
}

/**
 * Stamp a soft circle at world (cx, cy), radius r: mode 'd' digs (cells go
 * down to the circle's level), 'f' fills (up). Returns the total level change.
 */
export function stamp(m, cx, cy, r, mode) {
  if (!(r > 0)) return 0;
  const cell = m.cell;
  const c0 = Math.max(0, Math.floor((cx - r - m.x) / cell));
  const c1 = Math.min(m.cols - 1, Math.floor((cx + r - m.x) / cell));
  const r0 = Math.max(0, Math.floor((cy - r - m.y) / cell));
  const r1 = Math.min(m.rows - 1, Math.floor((cy + r - m.y) / cell));
  if (c0 > c1 || r0 > r1) return 0;
  const inner = r * INNER;
  const span = r - inner;
  const rr = r * r;
  const fillCore = r * FILL_CORE, fillSpan = r - fillCore;
  const v = m.v;
  const fill = mode === 'f';
  let total = 0;
  for (let row = r0; row <= r1; row++) {
    const dy = m.y + (row + 0.5) * cell - cy;
    const base = row * m.cols;
    for (let col = c0; col <= c1; col++) {
      const dx = m.x + (col + 0.5) * cell - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr) continue;
      const d = Math.sqrt(d2);
      const lv = d <= inner ? 0 : Math.min(FULL, Math.round((FULL * (d - inner)) / span));
      const i = base + col;
      const cur = v[i];
      if (fill) {
        // A fill is solid out to FILL_CORE of the radius (so it covers a same-size hole's soft rim), then ramps.
        const t = d <= fillCore ? FULL : Math.max(0, Math.round((FULL * (r - d)) / fillSpan));
        if (t > cur) { total += t - cur; v[i] = t; }
      } else if (lv < cur) { total += cur - lv; v[i] = lv; }
    }
  }
  if (total) markDirty(m, c0, r0, c1, r1);
  return total;
}

/** Stamp the segment from (ax, ay) to (bx, by) (excluding a, including b), circles every STEP * r. */
function stampSegment(m, ax, ay, bx, by, r, mode) {
  const L = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(L / Math.max(1, r * STEP)));
  let total = 0;
  for (let k = 1; k <= n; k++) total += stamp(m, ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, r, mode);
  return total;
}

/** Is this a well-formed stroke op? Pure. */
export function isStroke(s) {
  return !!s && (s.m === 'd' || s.m === 'f') && typeof s.r === 'number' && s.r > 0 && s.r <= 400
    && Array.isArray(s.p) && s.p.length >= 2 && s.p.length % 2 === 0 && s.p.every((n) => typeof n === 'number' && isFinite(n));
}

/** Replay a stroke op into the mask (its points are relative to the mask box). Returns the level change. */
export function applyStroke(m, s) {
  if (!isStroke(s)) return 0;
  const p = s.p;
  let px = m.x + p[0], py = m.y + p[1];
  let total = stamp(m, px, py, s.r, s.m);
  for (let i = 2; i < p.length; i += 2) {
    const x = m.x + p[i], y = m.y + p[i + 1];
    total += stampSegment(m, px, py, x, y, s.r, s.m);
    px = x; py = y;
  }
  return total;
}

/**
 * A gesture's stroke, built point by point (see the header): add() keeps a
 * point (quantized) unless it is too close to the last kept one, stamps it
 * exactly as applyStroke will, and returns the dirt moved.
 */
export function strokeBuilder(m, mode, r) {
  const R = Math.max(1, Math.round(r));
  const gap = Math.max(1, R * MIN_GAP);
  const p = [];
  let lx = 0, ly = 0;
  return {
    mode, r: R,
    add(x, y) {
      const qx = Math.round(x - m.x), qy = Math.round(y - m.y);
      if (p.length) {
        if (Math.hypot(qx - lx, qy - ly) < gap) return 0;
        p.push(qx, qy);
        const t = stampSegment(m, m.x + lx, m.y + ly, m.x + qx, m.y + qy, R, mode);
        lx = qx; ly = qy;
        return t;
      }
      p.push(qx, qy);
      lx = qx; ly = qy;
      return stamp(m, m.x + qx, m.y + qy, R, mode);
    },
    /** The op for the points so far, or null. */
    op: () => (p.length ? { m: mode, r: R, p: p.slice() } : null),
    points: () => p.length / 2,
    full: () => p.length / 2 >= MAX_POINTS,
    /** Start over from the last kept point (after flushing a full op). */
    restart() { if (p.length) { const x = p[p.length - 2], y = p[p.length - 1]; p.length = 0; p.push(x, y); } },
  };
}

/** Mean dirt (0..1) over the cells whose centres lie in world box [x0, x1] x [y0, y1]; null if none. Pure. */
export function coverage(m, x0, y0, x1, y1) {
  const c0 = Math.max(0, Math.ceil((x0 - m.x) / m.cell - 0.5));
  const c1 = Math.min(m.cols - 1, Math.floor((x1 - m.x) / m.cell - 0.5));
  const r0 = Math.max(0, Math.ceil((y0 - m.y) / m.cell - 0.5));
  const r1 = Math.min(m.rows - 1, Math.floor((y1 - m.y) / m.cell - 0.5));
  if (c0 > c1 || r0 > r1) return null;
  let sum = 0, n = 0;
  for (let row = r0; row <= r1; row++) {
    const base = row * m.cols;
    for (let col = c0; col <= c1; col++) { sum += m.v[base + col]; n++; }
  }
  return sum / (n * FULL);
}

/** Mean dirt (0..1) over the whole mask. Pure. */
export function dirtLeft(m) {
  let sum = 0;
  for (let i = 0; i < m.v.length; i++) sum += m.v[i];
  return sum / (m.v.length * FULL);
}

/** Is world point (x, y) inside the mask's box (grown by `pad`)? Pure. */
export function inMask(m, x, y, pad = 0) {
  return x >= m.x - pad && x <= m.x + m.w + pad && y >= m.y - pad && y <= m.y + m.h + pad;
}

/** A small stable hash of the cells (tests, debugging: "the same pixels"). Pure. */
export function maskHash(m) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < m.v.length; i++) { h ^= m.v[i]; h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

// ---------------------------------------------------------------------------
// Snapshots: run-length bytes in base64 (no btoa: pure and the same in Node)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = (() => { const t = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();

export function toBase64(bytes) {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const left = bytes.length - i;
  if (left === 1) { const n = bytes[i] << 16; s += B64[n >> 18] + B64[(n >> 12) & 63] + '=='; }
  else if (left === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '='; }
  return s;
}

export function fromBase64(s) {
  if (typeof s !== 'string' || s.length % 4) return null;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const q = [0, 1, 2, 3].map((k) => { const c = s.charCodeAt(i + k); return c === 61 ? 0 : c < 128 ? B64I[c] : -1; });
    if (q.some((d) => d < 0)) return null;
    const n = (q[0] << 18) | (q[1] << 12) | (q[2] << 6) | q[3];
    if (o < out.length) out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** The mask's cells as base64 run-length bytes. Pure. */
export function encodeMask(m) {
  const bytes = [];
  const v = m.v;
  let i = 0;
  while (i < v.length) {
    const val = v[i];
    let n = 1;
    while (i + n < v.length && v[i + n] === val && n < 65535) n++;
    if (n <= 15) bytes.push((val << 4) | (n - 1));
    else bytes.push((val << 4) | 15, n >> 8, n & 255);
    i += n;
  }
  return toBase64(bytes);
}

/** Read an encodeMask() string into m. False (m untouched) if it is damaged or does not fit. */
export function decodeMask(m, s) {
  const bytes = fromBase64(s);
  if (!bytes) return false;
  const out = new Uint8Array(m.v.length);
  let o = 0;
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    const val = b >> 4;
    let n = (b & 15) + 1;
    if ((b & 15) === 15) {
      if (i + 1 >= bytes.length) return false;
      n = (bytes[i] << 8) | bytes[i + 1];
      i += 2;
    }
    if (val > FULL || o + n > out.length) return false;
    out.fill(val, o, o + n);
    o += n;
  }
  if (o !== out.length) return false;
  m.v.set(out);
  markAll(m);
  return true;
}

// ---------------------------------------------------------------------------
// In the store (pure)

const spawnStamp = (e) => (e.v && e.v.kind) || [0, ''];

/** The mask's snapshot (newest) and its live strokes in replay order. Pure. */
export function digState(state, maskId) {
  let snap = null;
  const strokes = [];
  for (const id in state.entities) {
    const e = state.entities[id];
    if (e.deleted || !e.kind || !e.props || e.props.mask !== maskId) continue;
    if (e.kind === STROKE_KIND) strokes.push(e);
    else if (e.kind === SNAP_KIND && (!snap || compareStamps(spawnStamp(e), spawnStamp(snap)) > 0)) snap = e;
  }
  strokes.sort((a, b) => compareStamps(spawnStamp(a), spawnStamp(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { snap, strokes };
}

function snapFits(m, snap) {
  const p = snap.props;
  return p.cols === m.cols && p.rows === m.rows && p.cell === m.cell;
}

/** Rebuild m from the store: the snapshot (or full dirt), then every live stroke. Returns digState. */
export function replay(m, state, maskId) {
  const ds = digState(state, maskId);
  resetMask(m);
  if (ds.snap && snapFits(m, ds.snap)) decodeMask(m, ds.snap.props.data);
  for (const s of ds.strokes) applyStroke(m, s.props);
  markAll(m);
  return ds;
}

/**
 * The ops that fold everything into one snapshot: spawn the snapshot of `m`
 * (which must be the replay of `state`), hard-remove the strokes and older
 * snapshots. Pure: [[op, args], ...].
 */
export function compactionOps(state, m, maskId, { room, newId }) {
  const ops = [['spawn', { id: newId(), kind: SNAP_KIND, room, x: 0, y: 0, props: { mask: maskId, cols: m.cols, rows: m.rows, cell: m.cell, data: encodeMask(m) } }]];
  for (const id in state.entities) {
    const e = state.entities[id];
    if (e.deleted || !e.props || e.props.mask !== maskId) continue;
    if (e.kind === STROKE_KIND || e.kind === SNAP_KIND) ops.push(['remove', { id, hard: true }]);
  }
  return ops;
}

// ---------------------------------------------------------------------------
// The controller (store + masks)

export function createDigPit({ store, id: maskId, room, box, cell = 2, compactAt = COMPACT_AT, onChange = () => {} }) {
  const base = createMask({ box, cell });      // exactly the store
  const live = createMask({ box, cell });      // base + gestures in progress (what is drawn)
  const gestures = new Set();
  let applied = [];                            // stroke ids in base, in order
  let snapId = null;
  const stats = { replays: 0, incremental: 0, ops: 0, compactions: 0, gestures: 0 };

  const changed = () => { const d = live.dirty; live.dirty = null; onChange(d); };

  function rebuildLive() {
    copyMask(live, base);
    for (const g of gestures) { const op = g.b.op(); if (op) applyStroke(live, op); }
  }

  /** Bring base up to the store (incrementally when only new strokes came in). */
  function sync(state) {
    const ds = digState(state, maskId);
    const ids = ds.strokes.map((s) => s.id);
    const sid = ds.snap ? ds.snap.id : null;
    const prefix = sid === snapId && ids.length >= applied.length && applied.every((id, i) => ids[i] === id);
    if (prefix && ids.length === applied.length) return false;
    if (prefix) {
      for (let i = applied.length; i < ids.length; i++) applyStroke(base, ds.strokes[i].props);
      stats.incremental++;
    } else {
      replay(base, state, maskId);
      stats.replays++;
    }
    applied = ids;
    snapId = sid;
    rebuildLive();
    base.dirty = null;
    changed();
    return true;
  }

  const DIG_KINDS = new Set([STROKE_KIND, SNAP_KIND]);
  const known = (id) => id === snapId || applied.includes(id);
  const unsubscribe = store.subscribe((state, env) => {
    if (!env) { sync(state); return; }
    const a = env.args;
    if ((env.op === 'spawn' && DIG_KINDS.has(a.kind)) || (env.op === 'remove' && known(a.id))) sync(state);
  });

  function dispatchStroke(op) {
    if (!op) return;
    stats.ops++;
    store.dispatch('spawn', { id: store.newId(), kind: STROKE_KIND, room, x: 0, y: 0, props: Object.assign({ mask: maskId }, op) });
  }

  function maybeCompact() {
    const ds = digState(store.state, maskId);
    if (ds.strokes.length <= compactAt) return false;
    // Fold exactly what the store holds (base is its replay).
    replay(base, store.state, maskId);
    const ops = compactionOps(store.state, base, maskId, { room, newId: () => store.newId() });
    for (const [op, args] of ops) store.dispatch(op, args);
    stats.compactions++;
    return true;
  }

  const pit = {
    id: maskId,
    mask: live,
    base,
    /** Start a gesture: mode 'd' (dig) or 'f' (fill), radius r. */
    begin(mode, r) {
      const g = { b: strokeBuilder(live, mode, r), done: false };
      gestures.add(g);
      stats.gestures++;
      return {
        mode,
        r: g.b.r,
        /** A finger point (world). Returns the dirt moved (0 if the point was skipped or nothing changed). */
        add(x, y) {
          if (g.done) return 0;
          const t = g.b.add(x, y);
          if (g.b.full()) { dispatchStroke(g.b.op()); g.b.restart(); }
          if (t) changed();
          return t;
        },
        points: () => g.b.points(),
        /** Commit the gesture as one op (nothing if it moved no dirt at all). */
        end() {
          if (g.done) return;
          g.done = true;
          gestures.delete(g);
          const op = g.b.op();
          if (op) dispatchStroke(op);
          maybeCompact();
        },
      };
    },
    /** One circle, committed at once (a dumped bucket, a pile pushed in). Returns the level change it makes. */
    fill(x, y, r) { return pit.stampOp('f', x, y, r); },
    dig(x, y, r) { return pit.stampOp('d', x, y, r); },
    stampOp(mode, x, y, r) {
      const b = strokeBuilder(live, mode, r);
      const t = b.add(x, y);
      if (t) changed();
      dispatchStroke(b.op());
      maybeCompact();
      return t;
    },
    coverage: (x0, y0, x1, y1) => coverage(live, x0, y0, x1, y1),
    dirtLeft: () => dirtLeft(live),
    inside: (x, y, pad = 0) => inMask(live, x, y, pad),
    hash: () => maskHash(live),
    compact: () => maybeCompact(),
    sync: () => sync(store.state),
    stats() {
      const ds = digState(store.state, maskId);
      return Object.assign({}, stats, { strokes: ds.strokes.length, snap: ds.snap ? ds.snap.id : null, cols: live.cols, rows: live.rows, cell: live.cell, gesturesOpen: gestures.size });
    },
    destroy() { unsubscribe(); gestures.clear(); },
  };
  sync(store.state);
  return pit;
}

// ---------------------------------------------------------------------------
// The canvas (DOM only inside the function)

export function createDigCanvas({ host, frame, mask, src, ppu = 1.5, color = [96, 62, 40], rim = 0.28 }) {
  const [fx, fy, fw, fh] = frame;
  const W = Math.round(fw * ppu), H = Math.round(fh * ppu);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.className = 'dig-canvas';
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const mc = document.createElement('canvas');
  mc.width = mask.cols; mc.height = mask.rows;
  const mctx = mc.getContext('2d');
  const img = mctx.createImageData(mask.cols, mask.rows);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = 0; }
  // Where the mask sits in the canvas (px).
  const mx = (mask.x - fx) * ppu, my = (mask.y - fy) * ppu, mw = mask.cols * mask.cell * ppu, mh = mask.rows * mask.cell * ppu;
  const pic = new Image();
  let ready = false;
  let raf = 0;
  let pendingAll = true;
  let pending = null;
  const stats = { draws: 0, frames: 0, maskPx: 0 };
  pic.decoding = 'async';
  pic.onload = () => { ready = true; request(); };
  pic.src = src;

  function writeMask(rect) {
    const [c0, r0, c1, r1] = rect;
    const cols = mask.cols;
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * cols + col;
        d[i * 4 + 3] = (FULL - mask.v[i]) * 17;
      }
    }
    mctx.putImageData(img, 0, 0, c0, r0, c1 - c0 + 1, r1 - r0 + 1);
    stats.maskPx += (c1 - c0 + 1) * (r1 - r0 + 1);
  }

  function draw() {
    raf = 0;
    stats.frames++;
    if (!ready) return;
    if (pendingAll) writeMask([0, 0, mask.cols - 1, mask.rows - 1]);
    else if (pending) writeMask(pending);
    pendingAll = false; pending = null;
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.drawImage(pic, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mc, mx, my, mw, mh);
    if (rim > 0) {
      // The lip: a darker ring on the dirt around each hole.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = rim;
      const o = Math.max(2, Math.round(ppu * 3));
      ctx.drawImage(mc, mx, my + o, mw, mh);
      ctx.drawImage(mc, mx - o, my, mw, mh);
      ctx.drawImage(mc, mx + o, my, mw, mh);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    stats.draws++;
  }

  function request(dirty) {
    if (dirty === undefined || dirty === null) pendingAll = true;
    else if (!pending) pending = dirty.slice();
    else { pending[0] = Math.min(pending[0], dirty[0]); pending[1] = Math.min(pending[1], dirty[1]); pending[2] = Math.max(pending[2], dirty[2]); pending[3] = Math.max(pending[3], dirty[3]); }
    if (!raf) raf = requestAnimationFrame(draw);
  }

  return {
    canvas,
    request,
    /** Draw now (tests). */
    flush() { if (raf) { cancelAnimationFrame(raf); raf = 0; } draw(); },
    busy: () => !!raf,
    ready: () => ready,
    size: () => ({ w: W, h: H, maskW: mask.cols, maskH: mask.rows, bytes: (W * H + mask.cols * mask.rows) * 4 }),
    stats: () => Object.assign({}, stats),
    destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; canvas.remove(); pic.onload = null; },
  };
}
