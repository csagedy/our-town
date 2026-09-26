// The construction site's WORKSHOP rules (P2c.4, docs/design.md 3.3 #8,
// #11, #13, #17, #18): pure data and geometry for src/scenes/site-shop.js.
// No DOM, no store: unit tests import this directly
// (tests/unit/site-shop.test.mjs).
//
// - PEGBOARD: the tool wall over the workbench has chalk outlines for the
//   saw, the hammer and the wrench (tools/art/rooms/site.mjs toolWall, art
//   units * 0.7 = world). A tool of that kind hangs on its outline when it is
//   exactly at the hang spot (feet point), drawn smaller and turned to match
//   the outline. So "hanging" is nothing but a position: a `move` op.
// - SAW: a stroke is the saw's x turning back after at least STROKE_MIN
//   units; CUT_STROKES strokes over a piece on the saw table cut it (the
//   manifest `saw` list of the piece, or SAW_EXTRA).
// - MIXER: what a tap does from the drum's state.
// - CONES: which standing cones a vehicle driving through [x0, x1] knocks
//   over, and the domino chain from a cone that falls.
// - SEESAW: a plank resting on the grid on a support under its middle only
//   is a seesaw; it tips toward the side with more riders.

const r1 = (v) => Math.round(v * 10) / 10;
const EPS = 0.01;
const near = (a, b, e = 0.5) => Math.abs(a - b) < e;

// ---------------------------------------------------------------------------
// Pegboard

// Hang spots (world, feet point) of the tools with an outline on the tool
// wall; scale and turn make the drawn tool cover its outline (the hammer and
// the wrench are drawn leaning, the saw hangs teeth up). box: the outline's
// bounds [x0, y0, x1, y1].
export const PEG = {
  saw: { x: 2690, y: 458, scale: 0.85, rot: 0, flip: true, box: [2646, 462, 2723, 490] },
  hammer: { x: 2771, y: 520, scale: 0.9, rot: 24, flip: false, box: [2751, 451, 2793, 546] },
  wrench: { x: 2828, y: 527, scale: 1.1, rot: 30, flip: false, box: [2817, 434, 2839, 546] },
};
export const PEG_KINDS = Object.keys(PEG);
export const PEG_REACH = 75;        // a drop this close (x) to the hang spot snaps home...
export const PEG_ABOVE = 596;       // ...if it is above this line (under it is the workbench top)

/** The hang spot of a tool kind, or null. Pure. */
export const hangSpot = (kind) => PEG[kind] || null;

/** Is entity e hanging on its outline? (top level, exactly at the hang spot) Pure. */
export function isHung(e) {
  const s = e && PEG[e.kind];
  return !!s && !e.parent && near(e.x, s.x) && near(e.y, s.y);
}

/** The hang spot a tool dropped with its feet at (x, y) goes to, or null (too far). Pure. */
export function pegNear(kind, x, y) {
  const s = PEG[kind];
  if (!s) return null;
  if (Math.abs(x - s.x) > PEG_REACH || y > PEG_ABOVE || y < s.box[1] - 90) return null;
  return s;
}

// ---------------------------------------------------------------------------
// Saw

export const STROKE_MIN = 14;       // world units of travel before a turn counts as a stroke
export const CUT_STROKES = 4;
// Pieces with no manifest `saw` list that still cut (length is kept: 6 = 4 + 2 cells).
export const SAW_EXTRA = { beam: ['plank', 'plank-half'] };

/** A fresh stroke counter. */
export const sawStart = (x) => ({ x, from: x, dir: 0, strokes: 0 });

/**
 * The saw moved to x: returns the next counter state and whether a stroke
 * just completed (the saw turned back after STROKE_MIN units). Pure.
 */
export function sawStep(st, x) {
  const d = x - st.x;
  if (Math.abs(d) < 0.5) return { st, stroke: false };
  const dir = d > 0 ? 1 : -1;
  if (st.dir === 0) return { st: { x, from: st.from, dir, strokes: st.strokes }, stroke: false };
  if (dir === st.dir) return { st: { x, from: st.from, dir, strokes: st.strokes }, stroke: false };
  const long = Math.abs(st.x - st.from) >= STROKE_MIN;
  return { st: { x, from: st.x, dir, strokes: st.strokes + (long ? 1 : 0) }, stroke: long };
}

/** The kinds a piece is sawn into, or null (not sawable). prop: the manifest prop. Pure. */
export function sawInto(kind, prop) {
  if (prop && Array.isArray(prop.saw) && prop.saw.length) return prop.saw.slice();
  return SAW_EXTRA[kind] ? SAW_EXTRA[kind].slice() : null;
}

/**
 * Where the cut pieces go: side by side, centred where the piece was, a
 * small gap between them. widths: their drawn widths. Returns feet x's. Pure.
 */
export function cutLayout(x, widths, gap = 10) {
  const total = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
  let at = x - total / 2;
  return widths.map((w) => { const cx = at + w / 2; at += w + gap; return r1(cx); });
}

/** The saw table from the manifest slot 'saw-table': {x0, x1, y, cx}. Pure. */
export function sawTable(m) {
  const s = (m.slots || []).find((q) => q.id === 'saw-table');
  const b = s && s.box ? s.box : [2618, 574, 140, 42];
  return { x0: b[0], x1: b[0] + b[2], y: b[1] + b[3], cx: r1(b[0] + b[2] / 2) };
}

/** Is a piece with its feet at (x, y) resting on the saw table? Pure. */
export function onSawTable(table, x, y) {
  return near(y, table.y) && x >= table.x0 - 30 && x <= table.x1 + 30;
}

// ---------------------------------------------------------------------------
// Cement mixer

export const MIXER_MAX = 8;          // scoops of dirt the drum holds

/** What a tap on the drum does: 'pour' (cement is ready), 'mix' (dirt in it), 'rattle' (empty). Pure. */
export function mixerAction(props = {}) {
  if (props.mixerReady && (props.mixerLoad | 0) > 0) return 'pour';
  if ((props.mixerLoad | 0) > 0) return 'mix';
  return 'rattle';
}

/** How many scoops of n fit in the drum now. Pure. */
export const mixerRoom = (load, n) => Math.max(0, Math.min(n, MIXER_MAX - (load | 0)));

// Where the drum's open mouth is drawn, from the drum's pivot: the art
// (tools/art/rooms/site.mjs mixerDrum) has the mouth 152 art units along the
// drum's axis, turned -28 degrees (x 0.7 = world). The manifest's
// 'mixer-mouth' slot sits ~110 units above the drawn mouth, so it is not used.
export const MOUTH_FROM_PIVOT = [-94, 50];

/** The drum's mouth [x, y] in world units. Pure. */
export function mouthAt(m) {
  const d = m.pieces && m.pieces['mixer-drum'];
  const p = d && d.pivot ? d.pivot : [2765, 777];
  return [r1(p[0] + MOUTH_FROM_PIVOT[0]), r1(p[1] + MOUTH_FROM_PIVOT[1])];
}

/** Is (x, y) (a dropped pile's feet, a hose's nozzle) at the mixer's mouth? Pure. */
export function atMouth(m, x, y) {
  const [mx, my] = mouthAt(m);
  return Math.abs(x - mx) <= 80 && y >= my - 110 && y <= my + 55;
}

// ---------------------------------------------------------------------------
// Cones

export const CONE_BAND = [860, 968];   // feet y of cones a vehicle on the ground runs into

/** Standing cones [{id, x, y, down}] whose feet are in [x0, x1] on the vehicle's lane. Pure: ids. */
export function conesInPath(cones, x0, x1, band = CONE_BAND) {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  return cones.filter((c) => !c.down && c.x >= lo && c.x <= hi && c.y >= band[0] && c.y <= band[1]).map((c) => c.id);
}

/**
 * Dominoes: from the cone `startId` falling toward dir (+1 right, -1 left),
 * each standing cone within `gap` further on (and close in depth) falls
 * next. Returns [{id, step}] (step 1, 2, ...), the start not included. Pure.
 */
export function dominoChain(cones, startId, dir, { gap = 95, dy = 45 } = {}) {
  const start = cones.find((c) => c.id === startId);
  if (!start || !dir) return [];
  const out = [];
  const used = new Set([startId]);
  let cur = start;
  for (let step = 1; step < 20; step++) {
    let next = null;
    for (const c of cones) {
      if (used.has(c.id) || c.down) continue;
      const dx = (c.x - cur.x) * dir;
      if (dx <= 4 || dx > gap || Math.abs(c.y - cur.y) > dy) continue;
      if (!next || (c.x - cur.x) * dir < (next.x - cur.x) * dir) next = c;
    }
    if (!next) break;
    used.add(next.id);
    out.push({ id: next.id, step });
    cur = next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seesaw

export const SEESAW_KINDS = ['plank', 'beam'];
export const TILT = 15;               // degrees

/**
 * Planks on the grid that are seesaws: resting (row > 0) on a support under
 * their middle only (both end columns lower), with nothing built on top.
 * placed: [{id, kind, c, r, shape}]. Returns [{id, pivot, top, x0, x1}]
 * (world: pivot x, the plank's top y and its ends). Pure.
 */
export function seesawsOf(grid, placed) {
  const out = [];
  for (const p of placed) {
    if (!SEESAW_KINDS.includes(p.kind) || p.r < EPS) continue;
    const w = p.shape.w;
    if (w < 3) continue;
    const hs = new Array(w).fill(0);
    let covered = false;
    for (const q of placed) {
      if (q.id === p.id) continue;
      for (let i = 0; i < q.shape.w; i++) {
        const k = q.c + i - p.c;
        if (k < 0 || k >= w) continue;
        if (q.r >= p.r + p.shape.h - EPS) covered = true;
        else if (q.r < p.r - EPS) hs[k] = Math.max(hs[k], q.r + q.shape.tops[i]);
      }
    }
    if (covered) continue;
    const held = hs.map((h) => Math.abs(h - p.r) < EPS);
    if (held[0] || held[w - 1] || !held.some(Boolean)) continue;
    const x = grid.x0 + (p.c + w / 2) * grid.cell;
    const y = grid.y - p.r * grid.cell;
    out.push({ id: p.id, pivot: r1(x), top: r1(y - p.shape.h * grid.cell), x0: r1(x - (w * grid.cell) / 2), x1: r1(x + (w * grid.cell) / 2) });
  }
  return out;
}

/** Riders [{id, x, y}] standing on seesaw ss (feet on its top line). Pure: the riders. */
export function ridersOf(ss, things) {
  return things.filter((t) => near(t.y, ss.top, 0.8) && t.x >= ss.x0 - 6 && t.x <= ss.x1 + 6);
}

/** The seesaw's angle (degrees, + = the right end down) from its riders. Pure. */
export function seesawAngle(ss, riders) {
  let l = 0, r = 0;
  for (const t of riders) { if (t.x < ss.pivot - 4) l++; else if (t.x > ss.pivot + 4) r++; }
  return r > l ? TILT : l > r ? -TILT : 0;
}

/** How far down (world units) a point at x on the seesaw goes at angle deg. Pure. */
export function seesawDrop(ss, deg, x) {
  return r1((x - ss.pivot) * Math.tan((deg * Math.PI) / 180));
}
