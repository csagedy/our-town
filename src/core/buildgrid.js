// The construction site's build grid (P2c.1, docs/design.md 3.3): pure rules
// for snapping build pieces onto the 40-unit grid of the build deck, a
// per-column height map, the tops things can stand on, and gravity.
//
// There is no separate grid state: a piece is ON the grid when it is a build
// piece at the top level of the site room whose feet point sits exactly on a
// grid anchor (manifest rooms.site.grid):
//
//   anchor of a [w, h] piece at column c, row r = [x0 + (c + w/2) * cell, y - r * cell]
//
// Rows can be half cells (planks, beams and the flat roof are 0.5 tall). So
// the grid is just entity positions, moved with ordinary `move` ops: it is
// saved, replayed and shared by two iPads like everything else.
//
// A piece's footprint and stack points come from the art manifest
// (props.<id>.snap = { footprint: [w, h], stack: [[dx, dy], ...] }): stack
// points are the cell centres on top that carry the next piece (a roof: only
// its apex; a flag: none). Column tops: a column under a stack point is as
// high as that point (stairs are 1 on the left and 2 on the right); any other
// column of the footprint is as high as the whole piece (nothing goes through
// a roof slope or a flag), but only stack points make a surface to stand on.
//
// Everything here is pure (unit tests: tests/unit/site.test.mjs).

export const EPS = 0.01;
const r2 = (v) => Math.round(v * 100) / 100;
const near = (a, b) => Math.abs(a - b) < EPS;

/** Footprint and per-column tops (in cells above the piece's base) of a manifest snap. Pure. */
export function shapeOf(snap, cell = 40) {
  const fp = (snap && snap.footprint) || [1, 1];
  const w = Math.max(1, Math.round(fp[0]));
  const h = fp[1] > 0 ? fp[1] : 1;
  const stack = (snap && snap.stack) || [];
  const tops = [];
  const stands = [];            // per column: a stack point is there (a surface to stand on)
  for (let i = 0; i < w; i++) {
    const left = i * cell - (w * cell) / 2;
    const right = left + cell;
    let top = null;
    for (const [dx, dy] of stack) {
      if (dx >= left - EPS && dx <= right + EPS) top = Math.max(top == null ? -Infinity : top, -dy / cell);
    }
    tops.push(top == null ? h : top);
    stands.push(top != null);
  }
  return { w, h, tops, stands, stack };
}

/** The anchor (feet point) of a piece of width w at column c, row r. Pure. */
export function anchorAt(grid, w, c, r) {
  return { x: r2(grid.x0 + (c + w / 2) * grid.cell), y: r2(grid.y - r * grid.cell) };
}

/**
 * Where a piece at (x, y) sits on the grid: {c, r}, or null when it is not on
 * a grid anchor. Pure.
 */
export function cellOf(grid, shape, x, y) {
  const c = (x - grid.x0) / grid.cell - shape.w / 2;
  const r = (grid.y - y) / grid.cell;
  const ci = Math.round(c);
  const r2x = Math.round(r * 2);
  if (!near(c, ci) || !near(r * 2, r2x)) return null;
  if (ci < 0 || ci + shape.w > grid.cols || r2x < 0 || r2x > (grid.maxRows || 14) * 2) return null;
  return { c: ci, r: r2x / 2 };
}

/** The column a drop at feet x snaps to for a piece of width w (clamped into the grid). Pure. */
export function columnFor(grid, w, x) {
  const c = Math.round((x - grid.x0) / grid.cell - w / 2);
  return Math.max(0, Math.min(grid.cols - w, c));
}

/** Is a drop at feet point (x, y) over the build grid? (x inside it, y above the front of the deck + slack) Pure. */
export function overGrid(grid, x, y, { slack = 50, reach = 30 } = {}) {
  return x >= grid.x0 - reach && x <= grid.x1 + reach && y <= grid.y + slack;
}

/**
 * Column heights from placed pieces [{id, c, r, shape}] (except the ids in
 * `skip`). Pure: returns an array of grid.cols heights (cells).
 */
export function heightMap(grid, placed, skip = null) {
  const hs = new Array(grid.cols).fill(0);
  for (const p of placed) {
    if (skip && skip.has(p.id)) continue;
    for (let i = 0; i < p.shape.w; i++) {
      const col = p.c + i;
      if (col >= 0 && col < grid.cols) hs[col] = Math.max(hs[col], p.r + p.shape.tops[i]);
    }
  }
  return hs;
}

/** The row a piece of `shape` at column c comes to rest on. Pure. */
export function restRow(hs, c, shape) {
  let r = 0;
  for (let i = 0; i < shape.w; i++) r = Math.max(r, hs[c + i] || 0);
  return r;
}

/**
 * Snap a dropped piece: its column from the drop x, its row from the height
 * map of the others. Returns {c, r, x, y}, or null when the tower is too high. Pure.
 */
export function snapDrop(grid, placed, shape, x, skipId = null) {
  const c = columnFor(grid, shape.w, x);
  const hs = heightMap(grid, placed, skipId ? new Set([skipId]) : null);
  const r = restRow(hs, c, shape);
  if (r + shape.h > (grid.maxRows || 14) + EPS) return null;
  return Object.assign({ c, r }, anchorAt(grid, shape.w, c, r));
}

/**
 * Gravity for the whole grid, forgiving: every piece (lowest first) comes to
 * rest on what is under it now, so a piece pulled out of the middle of a
 * tower lets the ones above it settle down (never fall off, never float),
 * and overlaps (two iPads dropping at once) are pushed up. Pieces in `skip`
 * (held by a finger) are left out. Returns [{id, c, r, from, x, y}] for the
 * pieces that must move. Pure.
 */
export function settleGrid(grid, placed, skip = null) {
  const order = placed.filter((p) => !(skip && skip.has(p.id)))
    .sort((a, b) => a.r - b.r || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hs = new Array(grid.cols).fill(0);
  const moves = [];
  for (const p of order) {
    const r = restRow(hs, p.c, p.shape);
    for (let i = 0; i < p.shape.w; i++) hs[p.c + i] = Math.max(hs[p.c + i], r + p.shape.tops[i]);
    if (!near(r, p.r)) moves.push(Object.assign({ id: p.id, c: p.c, r, from: p.r }, anchorAt(grid, p.shape.w, p.c, r)));
  }
  return moves;
}

/**
 * Pieces resting on less than half of their footprint (they wobble, but they
 * stay: support is only checked loosely, design 3.3). Pure: returns ids.
 */
export function wobbly(grid, placed) {
  const out = [];
  for (const p of placed) {
    if (p.r < EPS) continue;
    const hs = heightMap(grid, placed.filter((q) => q.id !== p.id && q.r < p.r + EPS));
    let held = 0;
    for (let i = 0; i < p.shape.w; i++) if (near(hs[p.c + i], p.r)) held++;
    if (held * 2 < p.shape.w) out.push(p.id);
  }
  return out;
}

/**
 * Surfaces on top of the build: segments {id, x0, x1, y} where something
 * (a character, a hammer, a hat) can stand. One per run of neighbouring
 * standing columns at the same height that nothing covers. A lone stack
 * point on a column boundary (a roof's apex) gives a one-cell segment
 * centred on it. Pure.
 */
export function topSurfaces(grid, placed) {
  const hs = heightMap(grid, placed);
  const segs = [];
  for (const p of placed) {
    const { w } = p.shape;
    const base = anchorAt(grid, w, p.c, p.r);
    for (const [dx, dy] of p.shape.stack) {
      const top = p.r + -dy / grid.cell;
      // Covered? (a column this point sits on is higher than it)
      const rel = dx / grid.cell + w / 2;           // columns from the piece's left edge
      const cols = near(rel, Math.round(rel)) ? [Math.round(rel) - 1, Math.round(rel)] : [Math.floor(rel)];
      const open = cols.filter((i) => i >= 0 && i < w).every((i) => near(hs[p.c + i], top));
      if (!open) continue;
      segs.push({ x0: base.x + dx - grid.cell / 2, x1: base.x + dx + grid.cell / 2, y: r2(base.y + dy) });
    }
  }
  segs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && near(last.y, s.y) && s.x0 <= last.x1 + EPS) last.x1 = Math.max(last.x1, s.x1);
    else out.push(Object.assign({}, s));
  }
  return out.map((s, i) => ({ id: 'build-top-' + i, x0: r2(s.x0), x1: r2(s.x1), y: s.y }));
}

/** Columns a placed piece covers, and the ids of the pieces resting above it in those columns (a tower). Pure. */
export function towerOf(placed, p) {
  const out = [];
  for (const q of placed) {
    if (q.id === p.id) continue;
    if (q.c < p.c + p.shape.w && q.c + q.shape.w > p.c) out.push(q);
  }
  return out;
}
