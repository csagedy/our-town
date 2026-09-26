// Surfaces and depth (docs/design.md 2.1, 6.3): where a dropped thing comes
// to rest, and what draws in front of what. Pure functions, no DOM, so unit
// tests import them directly.
//
// A room declares (see normalizeRoom):
//
//   floor     the floor band things stand in: { top: 700, bottom: 960, x0, x1 }
//             (y is the feet line; the band's top is the back wall's base)
//   surfaces  horizontal line segments you can set something on (counter
//             tops, shelves, table tops): { id, x0, x1, y, depth, sound }
//             `depth` is the sort y of the furniture that carries it (where
//             the table's legs meet the floor), so a cup on the table draws
//             over the table art and a thing on the floor behind the table
//             (y < depth) draws behind it. Defaults to y.
//
// A surface being a line segment rather than a box is the quiet win of the
// head-on dollhouse view (archive/bakery-v1): "is it on the counter?" is one
// x-range test and one y compare.
//
// Entity positions are the FEET point (bottom center) in room units.
//
// Drop rule (settle): clamp x into the room; then the first surface the thing
// would hit falling straight down from the drop point wins (a drop up to
// SNAP_UP units below a surface line still snaps up onto it, so a sloppy
// drop on the counter lands on the counter); otherwise it lands in the floor
// band (falling to the band's back line from above, clamped from below). It
// never rests in midair and never off the room.
//
// Draw order (sortKey): things on the floor sort by y; things on a surface
// sort just in front of that surface's furniture (depth + 0.5), then by z
// (stack order on the surface). zIndexFor turns a key into a CSS z-index in
// the room's depth container; room art in the mid layer sorts by its depth
// with the same function, so an entity with key < depth draws behind it.

export const FLOOR_TOP = 700;
export const FLOOR_BOTTOM = 960;
export const SNAP_UP = 48;        // a drop this far below a surface line still lands on it
export const EDGE_TOL = 12;       // x slack past a surface's ends
export const ON_EPS = 0.5;        // |y - surface.y| under this = standing on it
export const FALL_MIN = 6;        // a landing lower than the drop by more than this is a fall
export const DEPTH_SCALE = [0.92, 1.08];   // scale at the floor band's back and front

// z-index bands inside a room's depth container.
export const Z_BACK = 1;                // back layer art (walls, windows)
export const Z_FRONT = 10000000;        // front layer art (foreground plants, a front lip)
export const Z_DRAG = 20000000;         // a thing in a finger floats above everything
export const Z_FX = 30000000;           // particles

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Fill in defaults for a room definition. Pure; returns a new object. */
export function normalizeRoom(def) {
  const width = Math.max(1440, def.width || 1440);
  const f = def.floor || {};
  const floor = {
    top: f.top ?? FLOOR_TOP,
    bottom: f.bottom ?? FLOOR_BOTTOM,
    x0: f.x0 ?? 0,
    x1: f.x1 ?? width,
    sound: f.sound || 'thud',
  };
  const surfaces = (def.surfaces || []).map((s, i) => ({
    id: s.id || `s${i}`,
    x0: Math.min(s.x0, s.x1),
    x1: Math.max(s.x0, s.x1),
    y: s.y,
    depth: s.depth ?? s.y,
    sound: s.sound || 'knock',
  }));
  return { ...def, width, floor, surfaces, art: def.art || [] };
}

/**
 * The surface a thing dropped with its feet at (x, y) lands on, or null.
 * Candidates cover x (with EDGE_TOL slack) and lie at or below y - SNAP_UP;
 * the highest (smallest y) wins: the first one it would hit falling.
 */
export function findSurface(room, x, y) {
  let best = null;
  for (const s of room.surfaces) {
    if (x < s.x0 - EDGE_TOL || x > s.x1 + EDGE_TOL) continue;
    if (s.y < y - SNAP_UP) continue;
    if (!best || s.y < best.y) best = s;
  }
  return best;
}

/** Keep a thing of half-width halfW inside the room's floor x range. */
export function clampX(room, x, halfW = 0) {
  const lo = room.floor.x0 + halfW;
  const hi = room.floor.x1 - halfW;
  return lo > hi ? (room.floor.x0 + room.floor.x1) / 2 : clamp(x, lo, hi);
}

/**
 * Where a thing dropped with its feet at (x, y) comes to rest.
 * Returns { x, y, surface (object or null), fall (landed lower than dropped),
 * dist (units fallen, negative for a snap up), sound }.
 */
export function settle(room, { x, y, halfW = 0 }) {
  const cx = clampX(room, x, halfW);
  const s = findSurface(room, cx, y);
  let rx;
  let ry;
  if (s) {
    // Keep at least half the thing on the surface.
    const inset = Math.min(halfW / 2, (s.x1 - s.x0) / 2);
    rx = clamp(cx, s.x0 + inset, s.x1 - inset);
    ry = s.y;
  } else {
    rx = cx;
    ry = clamp(y, room.floor.top, room.floor.bottom);
  }
  const dist = ry - y;
  return { x: rx, y: ry, surface: s, fall: dist > FALL_MIN, dist, sound: s ? s.sound : room.floor.sound };
}

/** The surface an entity at (x, y) is standing on, or null (floor / anywhere else). */
export function surfaceUnder(room, x, y) {
  for (const s of room.surfaces) {
    if (Math.abs(y - s.y) < ON_EPS && x >= s.x0 - EDGE_TOL && x <= s.x1 + EDGE_TOL) return s;
  }
  return null;
}

/** Draw-order key for a thing at (x, y): { key, surface }. */
export function sortKey(room, x, y) {
  const s = surfaceUnder(room, x, y);
  return s ? { key: s.depth + 0.5, surface: s } : { key: y, surface: null };
}

/**
 * CSS z-index for a sort key plus stack order z (0..99). Integer, and
 * monotonic in key at 0.01-unit resolution. Mid-layer art uses
 * zIndexFor(depth) - 1, so things at exactly its depth draw in front.
 */
export function zIndexFor(key, z = 0) {
  return 1000 + Math.round(clamp(key, -5, 5000) * 100) + clamp(Math.round(z) || 0, 0, 99);
}

/** Depth cue: scale for a sort key (0.92 at the floor band's back, 1.08 at its front). */
export function depthScale(room, key) {
  const { top, bottom } = room.floor;
  const t = bottom > top ? clamp((key - top) / (bottom - top), 0, 1) : 0.5;
  return Math.round((DEPTH_SCALE[0] + (DEPTH_SCALE[1] - DEPTH_SCALE[0]) * t) * 1000) / 1000;
}

/**
 * Next stack order for something set on surface `s`, given the entities in
 * the room: one above the highest z already on it. Floor things are z 0.
 */
export function stackZ(room, s, entities, exceptId) {
  if (!s) return 0;
  let z = 0;
  for (const e of entities) {
    if (e.id === exceptId) continue;
    if (surfaceUnder(room, e.x, e.y) === s) z = Math.max(z, (e.z || 0) + 1);
  }
  return Math.min(z, 99);
}
