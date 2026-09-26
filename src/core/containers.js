// Containers, spawners and tidy-up (docs/design.md 2.3, P1.9): the pure
// planning half. No DOM, no store writes: unit tests import it directly, and
// the behavior runtime (src/core/behaviors/runtime.js) turns its answers into
// store ops and animations.
//
// SLOTS AND LAYOUTS
// A container kind lists the `container` behavior with layout params
// (data/catalog.json):
//
//   { "use": "container", "accepts": ["food"], "capacity": 3,
//     "layout": "plate", "area": [0.1, 0.2, 0.9, 0.62], "scale": 0.9 }
//
// Children are child entities (parent = container id) with slot "s0", "s1"...
// (the first free slot, or the free slot nearest the finger for layouts
// with fixed spots). layoutSlots() says where each child is drawn, in the
// container's own sprite units relative to its feet point (bottom center;
// y < 0 is up), so the view can nest the child's element inside the
// container's and the child rides along when the container moves.
//
//   layout     spots                                    drawn
//   hidden     none (P1.8 default: a look shows it)     not drawn
//   row        `cols` spots across the area's bottom     in front (a tray)
//   grid       cols x rows, feet on each row's line      in front (a crayon box)
//   shelves    `cols` per shelf line in `shelves`         in front (the fridge)
//   stack      each on top of the one below              in front (a pile)
//   heap       a jittered mound sunk behind the rim      behind the body (a bowl)
//   plate      one in the middle, a garnish ring         in front (a plate)
//   interior   sunk deep, only `peek` of each shows       behind the body (a basket; peek 0 = hidden)
//
//   area   [left, top, right, bottom] fractions of the container's box (top-
//          left origin). Feet go on the bottom line (row, stack, plate), on
//          row lines between top and bottom (grid), and the top line is the
//          rim for heap and interior.
//   cols, shelves (y fractions, top shelf first), peek (0..1), scale.
//
// Slot numbering is deterministic (ids and slots only), so two iPads and a
// replayed log draw the same thing.
//
// SPILL, SPAWN SPOTS: planSpill() finds distinct resting spots near a point
// (on the surface the container stands on while there is room, then the
// floor band), none overlapping each other or anything already in the room.
//
// ENTITY CAP: planCap() picks which loose spawner clones "go home" when a
// room has more than its cap: the least recently touched first (rev), never
// one that is held, protected (placed on purpose recently), customized by a
// kid (a prop written after it was spawned: a cracked egg, a bitten cupcake)
// or holding something.
//
// TIDY: planTidy() says where each loose thing's catalog `home` is: a clone
// goes back to its spawner, a {spawner: kind} thing goes into (or back to)
// that spawner, a {room} thing in another room travels there.

import { inRoom, getEntity } from '../engine/world.js';
import { surfaceUnder, clampX } from '../engine/surfaces.js';
import { compareStamps } from '../engine/ids.js';

export const LAYOUTS = ['hidden', 'row', 'grid', 'shelves', 'stack', 'heap', 'plate', 'interior'];
const BEHIND = new Set(['heap', 'interior']);
const FIXED_SPOTS = new Set(['row', 'grid', 'shelves', 'plate']);   // layouts where a drop picks the nearest spot
export const DEFAULT_AREA = [0.1, 0.3, 0.9, 1];
const DEFAULT_PEEK = { heap: 0.55, interior: 0.35 };
export const DEFAULT_CAP = 120;

const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const isFrac = (v) => typeof v === 'number' && v >= 0 && v <= 1;

/** A stable number in [-1, 1] from a string (jitter that both iPads agree on). Pure. */
export function jitter(s, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2001) / 1000 - 1;
}

/** Problems with container layout params (for catalog validation), or null. */
export function checkLayout(p) {
  if (!LAYOUTS.includes(p.layout)) return 'layout must be one of ' + LAYOUTS.join(', ');
  if (p.area != null && !(Array.isArray(p.area) && p.area.length === 4 && p.area.every(isFrac) && p.area[0] < p.area[2] && p.area[1] <= p.area[3])) {
    return 'area must be [left, top, right, bottom] fractions';
  }
  if (p.cols != null && !(Number.isInteger(p.cols) && p.cols > 0)) return 'cols must be a positive integer';
  if (p.layout === 'shelves' && !(Array.isArray(p.shelves) && p.shelves.length && p.shelves.every(isFrac))) return 'shelves must list shelf lines (fractions)';
  if (p.peek != null && !isFrac(p.peek)) return 'peek must be 0..1';
  if (p.scale != null && !(typeof p.scale === 'number' && p.scale > 0 && p.scale <= 2)) return 'scale must be 0..2';
  return null;
}

/** 's3' -> 3; anything else -> -1. */
export function slotIndex(slot) {
  const m = /^s(\d{1,3})$/.exec(slot || '');
  return m ? Number(m[1]) : -1;
}
export const slotName = (i) => 's' + i;

/**
 * Give each child a slot index: its own "sN" when valid and unique (lowest id
 * wins a clash, which only a merge without a host can make), else the first
 * free index, in id order. items: [{id, slot}]. Returns a new list sorted by
 * index; an overflow child (more children than capacity) gets index >= capacity.
 */
export function assignSlots(items, capacity) {
  const byId = items.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const taken = new Set();
  const out = [];
  const rest = [];
  for (const it of byId) {
    const i = slotIndex(it.slot);
    if (i >= 0 && i < capacity && !taken.has(i)) { taken.add(i); out.push(Object.assign({}, it, { index: i })); }
    else rest.push(it);
  }
  let next = 0;
  for (const it of rest) {
    while (taken.has(next)) next++;
    taken.add(next);
    out.push(Object.assign({}, it, { index: next }));
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Free slot indices (ascending) of a container holding `items`. */
export function freeSlots(items, capacity) {
  const used = new Set(assignSlots(items, capacity).map((it) => it.index));
  const out = [];
  for (let i = 0; i < capacity; i++) if (!used.has(i)) out.push(i);
  return out;
}

function areaOf(p, box) {
  const a = p.area || DEFAULT_AREA;
  return { L: a[0] * box.w, T: a[1] * box.h, R: a[2] * box.w, B: a[3] * box.h };
}

function gridShape(p, capacity) {
  if (p.layout === 'row') return { cols: p.cols || capacity, rows: 1 };
  if (p.layout === 'shelves') return { cols: p.cols || Math.ceil(capacity / p.shelves.length), rows: p.shelves.length };
  const cols = p.cols || Math.ceil(Math.sqrt(capacity));
  return { cols, rows: Math.ceil(capacity / cols) };
}

/**
 * The fixed spot of slot `i` (row, grid, shelves, plate) in box coordinates
 * (top-left origin): {bx, by, z, scale}. Null for the other layouts.
 */
function fixedSpot(p, box, capacity, i) {
  const { L, T, R, B } = areaOf(p, box);
  const s = p.scale || 1;
  if (p.layout === 'plate') {
    const mid = (L + R) / 2;
    if (i === 0) return { bx: mid, by: B, z: 30, scale: s };
    const k = Math.ceil(i / 2);
    const side = i % 2 ? -1 : 1;
    const reach = ((R - L) / 2) * Math.min(1, 0.62 + 0.2 * (k - 1));
    return { bx: mid + side * reach, by: B - 5 * k, z: 30 - k * 2 - (side > 0 ? 1 : 0), scale: s * 0.8 };
  }
  const { cols, rows } = gridShape(p, capacity);
  const r = Math.floor(i / cols);
  const c = i % cols;
  const bx = L + ((c + 0.5) * (R - L)) / cols;
  let by;
  if (p.layout === 'shelves') by = p.shelves[Math.min(r, p.shelves.length - 1)] * box.h;
  else by = rows <= 1 ? B : T + ((r + 1) * (B - T)) / rows;
  return { bx, by, z: Math.min(48, r * cols + c), scale: s };
}

const toLocal = (box, bx, by) => ({ x: r1(bx - box.w / 2), y: r1(by - box.h) });

/**
 * Where each child is drawn. p: container params (layout, capacity, area,
 * cols, shelves, peek, scale); box: the container sprite {w, h}; items:
 * [{id, slot, w, h}] (child sprite sizes). Returns Map id -> {x, y, z, scale,
 * front, hidden}: feet offset from the container's feet in its units, stack
 * order inside it (0..48), drawn in front of or behind its body. Pure.
 */
export function layoutSlots(p, box, items) {
  const out = new Map();
  const layout = LAYOUTS.includes(p.layout) ? p.layout : 'hidden';
  const capacity = Math.max(1, p.capacity || 1);
  const list = assignSlots(items, capacity);
  const peek = p.peek != null ? p.peek : DEFAULT_PEEK[layout];
  if (layout === 'hidden' || (layout === 'interior' && peek === 0)) {
    for (const it of list) out.set(it.id, { x: 0, y: 0, z: 0, scale: 1, front: false, hidden: true });
    return out;
  }
  const s = p.scale || 1;
  const { L, T, R, B } = areaOf(p, box);
  if (FIXED_SPOTS.has(layout)) {
    list.forEach((it, n) => {
      // An overflow child (a merge put one too many in) doubles up on the last spot.
      const sp = fixedSpot(p, box, capacity, Math.min(it.index, capacity - 1));
      const loc = toLocal(box, sp.bx + (it.index >= capacity ? 8 * (n + 1) : 0), sp.by);
      out.set(it.id, { x: loc.x, y: loc.y, z: sp.z, scale: sp.scale, front: true, hidden: false });
    });
    return out;
  }
  if (layout === 'stack') {
    let top = B;
    list.forEach((it, n) => {
      const bx = (L + R) / 2 + jitter(it.id) * box.w * 0.05;
      const loc = toLocal(box, bx, top);
      out.set(it.id, { x: loc.x, y: loc.y, z: Math.min(48, n), scale: s, front: true, hidden: false });
      top -= (it.h || 40) * s * 0.82;
    });
    return out;
  }
  // heap / interior: spread across the rim, sunk behind the body so the top
  // `peek` of each shows; a heap mounds up in the middle and jitters.
  const n = list.length;
  const heap = layout === 'heap';
  list.forEach((it, k) => {
    const t = (k + 0.5) / n;
    const w = R - L;
    const bx = L + t * w + jitter(it.id) * Math.min(w / (n + 1), (it.w || 40) * 0.5) * (heap ? 0.5 : 0.2);
    const h = (it.h || 40) * s;
    const mound = heap ? 0.14 * h * (1 - Math.abs(2 * t - 1)) : 0;
    const by = Math.min(box.h, T + (1 - peek) * h - mound + (heap ? jitter(it.id, 7) * h * 0.05 : 0));
    const loc = toLocal(box, bx, by);
    // The middle of a heap draws in front of its sides.
    const z = heap ? Math.round(20 - Math.abs(2 * t - 1) * 10) + (k % 2) : k;
    out.set(it.id, { x: loc.x, y: loc.y, z: clamp(z, 0, 48), scale: s, front: false, hidden: false });
  });
  return out;
}

/**
 * The slot a thing dropped into a container should take: the free fixed spot
 * nearest the local point (lx, ly) (container units from its feet), or the
 * first free slot for layouts without fixed spots. Returns a slot name, or
 * null when full.
 */
export function pickSlot(p, box, items, local = null) {
  const capacity = Math.max(1, p.capacity || 1);
  const free = freeSlots(items, capacity);
  if (!free.length) return null;
  if (!local || !FIXED_SPOTS.has(p.layout)) return slotName(free[0]);
  let best = free[0];
  let bestD = Infinity;
  for (const i of free) {
    const sp = fixedSpot(p, box, capacity, i);
    const loc = toLocal(box, sp.bx, sp.by);
    const d = Math.hypot(loc.x - local.x, (loc.y - local.y) * 0.8);
    if (d < bestD) { bestD = d; best = i; }
  }
  return slotName(best);
}

// ---------------------------------------------------------------------------
// Spill and spawn spots

/** A resting thing's box {x0, y0, x1, y1} (feet at x, y; size w x h). */
export const boxOf = (x, y, w, h) => ({ x0: x - w / 2, y0: y - h, x1: x + w / 2, y1: y });

/** Do two boxes overlap (more than `pad` units in both directions)? Pure. */
export function overlaps(a, b, pad = 0) {
  return a.x0 < b.x1 - pad && b.x0 < a.x1 - pad && a.y0 < b.y1 - pad && b.y0 < a.y1 - pad;
}

/**
 * Distinct resting spots for `items` near `from`, no two overlapping and none
 * overlapping `others`. room: a normalized room def (surfaces.js); from:
 * {x, y} (the container's feet); items: [{id, w, h}]; others: [{x, y, w, h}]
 * (what already rests in the room, the container included). Tries the
 * surface under `from` first (alternating left and right, moving out), then
 * floor rows in front of and behind `from`. If the whole room is packed, the
 * spot with the least overlap wins, so it always answers.
 * Returns [{id, x, y, surface: id|null}] in the same order. Pure.
 */
export function planSpill({ room, from, items, others = [], gap = 10 }) {
  const placed = others.map((o) => boxOf(o.x, o.y, o.w, o.h));
  const out = [];
  const onSurface = surfaceUnder(room, from.x, from.y);
  const f = room.floor;
  const floorY0 = onSurface ? Math.min(f.bottom, Math.max(f.top + 40, (f.top + f.bottom) / 2)) : clamp(from.y, f.top, f.bottom);
  const rows = [floorY0];
  for (let k = 1; k <= 8; k++) for (const dy of [k * 55, -k * 55]) {
    const y = floorY0 + dy;
    if (y >= f.top && y <= f.bottom) rows.push(y);
  }
  for (const it of items) {
    const w = it.w || 60;
    const h = it.h || 60;
    const step = w + gap;
    const cands = [];
    const line = (y, s, x0, x1) => {
      for (let k = 0; k < 40; k++) {
        for (const side of k ? [-1, 1] : [1, -1]) {
          const x = from.x + side * step * (0.9 + k);
          if (s && (x - w / 4 < s.x0 || x + w / 4 > s.x1)) continue;
          const cx = s ? x : clampX(room, x, w / 2);
          if (cx < x0 || cx > x1) continue;
          cands.push({ x: cx, y, surface: s ? s.id : null });
        }
      }
    };
    if (onSurface) line(onSurface.y, onSurface, -Infinity, Infinity);
    for (const y of rows) line(y, null, f.x0, f.x1);
    let best = null;
    let bestO = Infinity;
    for (const c of cands) {
      const b = boxOf(c.x, c.y, w, h);
      let o = 0;
      for (const p of placed) if (overlaps(b, p, 1)) o += Math.min(b.x1, p.x1) - Math.max(b.x0, p.x0);
      if (o === 0) { best = c; break; }
      if (o < bestO) { bestO = o; best = c; }
    }
    if (!best) best = { x: clampX(room, from.x, w / 2), y: floorY0, surface: null };
    placed.push(boxOf(best.x, best.y, w, h));
    out.push({ id: it.id, x: r1(best.x), y: r1(best.y), surface: best.surface });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entity cap

/** Was any prop written after the entity was spawned (a kid changed it)? Pure. */
export function isCustomized(e) {
  const born = e.v && e.v.kind;
  if (!born) return false;
  for (const k of Object.keys(e.v)) {
    if (k.startsWith('props.') && k !== 'props.from' && compareStamps(e.v[k], born) > 0) return true;
  }
  return false;
}

/** Loose spawner clones in a room: top-level, spawned by a spawner (props.from). */
export function looseClones(state, roomId) {
  return inRoom(state, roomId).filter((e) => typeof e.props.from === 'string');
}

/**
 * Which loose clones go home so the room is back at `cap`. keep: ids never to
 * send (held, placed recently). Oldest touch (lowest rev) first; never a kept,
 * customized or non-empty one, so the room may stay a little over the cap:
 * a gentle limit. Returns ids. Pure.
 */
export function planCap(state, roomId, { cap = DEFAULT_CAP, keep = new Set() } = {}) {
  const clones = looseClones(state, roomId);
  const excess = clones.length - cap;
  if (excess <= 0) return [];
  const parents = new Set();
  for (const k in state.entities) { const e = state.entities[k]; if (e.parent && getEntity(state, k)) parents.add(e.parent); }
  const cands = clones
    .filter((e) => !keep.has(e.id) && !isCustomized(e) && !parents.has(e.id))
    .sort((a, b) => a.rev - b.rev || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return cands.slice(0, excess).map((e) => e.id);
}

// ---------------------------------------------------------------------------
// Tidy ("go home")

/**
 * Where each loose thing in `roomId` goes on a tidy-up. homeOf(kind) ->
 * catalog home; fixedOf(kind) -> true for furniture; keep: ids to leave
 * alone (held).
 * Returns [{id, how: 'home', to: spawnerId|null}   a clone or a {spawner} thing goes back to its spawner
 *          {id, how: 'travel', to: room}]          its home room is elsewhere
 * (the runtime puts a 'home' thing inside the spawner when that spawner is
 * also a container with room for it, and poofs it away otherwise).
 * Things already home, with no home, fixed, or holding something stay. Pure.
 */
export function planTidy(state, roomId, { homeOf, fixedOf = () => false, keep = new Set() }) {
  const here = inRoom(state, roomId);
  const byKind = new Map();
  for (const e of Object.values(state.entities)) {
    if (!getEntity(state, e.id)) continue;
    if (!byKind.has(e.kind)) byKind.set(e.kind, []);
    byKind.get(e.kind).push(e);
  }
  const parents = new Set();
  for (const k in state.entities) { const e = state.entities[k]; if (e.parent && getEntity(state, k)) parents.add(e.parent); }
  const hereIds = new Set(here.map((e) => e.id));
  // The nearest spawner of that kind standing in this room (or inside something here), else any.
  const spawnerFor = (kind, near) => {
    const list = (byKind.get(kind) || []).slice().sort((a, b) => Math.abs(a.x - near.x) - Math.abs(b.x - near.x));
    return list.find((s) => hereIds.has(s.id) || (s.parent && hereIds.has(s.parent))) || list[0] || null;
  };
  const out = [];
  for (const e of here) {
    if (keep.has(e.id) || fixedOf(e.kind) || parents.has(e.id)) continue;
    if (typeof e.props.from === 'string') {
      out.push({ id: e.id, how: 'home', to: getEntity(state, e.props.from) ? e.props.from : null });
      continue;
    }
    const home = homeOf(e.kind);
    if (!home) continue;
    if (home.spawner) {
      const s = spawnerFor(home.spawner, e);
      out.push({ id: e.id, how: 'home', to: s ? s.id : null });
    } else if (home.room && home.room !== roomId) {
      out.push({ id: e.id, how: 'travel', to: home.room });
    }
  }
  return out;
}
