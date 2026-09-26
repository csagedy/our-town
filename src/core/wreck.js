// The construction site's wrecking ball (P2c.2, docs/design.md 3.3 #4): pure
// rules for the swing and for what it knocks down. The one place in the game
// where things fall over, because Ian asked for it: nothing breaks and
// nothing disappears, pieces land on the ground and can be built again.
//
// THE SWING. The ball hangs on its chain from the boom tip (manifest
// rooms.site.rigs.wreckingBall). Pulling it back pays the chain out or reels
// it in (length L = distance from the tip to the finger, clamped) and sets the
// start angle a0 (radians from straight down, + = to the right). Let go and it
// swings like a pendulum: half-swings from angle A_k to A_k+1 = -r A_k, each
// taking half a period pi * sqrt(L / g), cosine-eased (slow at the ends, fast
// through the bottom). The first return keeps most of the pull (r0), later
// ones lose more (r), and once a half-swing is small it eases to rest. Where
// the circle would dip below the ground the ball skids along it instead
// (y clamped to gy), so a long chain sweeps along the ground like a bowling
// ball. Everything is a function of time: `ballAt(path, t)`.
//
// THE KNOCK (planWreck). The path is sampled every 16 ms against the build
// pieces on the grid and the characters. The first touch of a piece's box by
// the ball's circle is a hit: an unlocked piece is knocked off the grid, and
// so is everything resting on it (directly or up a chain of unlocked pieces),
// a row later each; a LOCKED (hammered) piece only wobbles and stays (the
// pieces resting on it stay too). A character it touches does a silly spin
// and lands a little way off. Every landing spot, spin and hop is rolled here
// with the given rng, BEFORE anything is dispatched, and carried in the ops
// (design 6.4: pre-rolled randomness), so two iPads show the same scatter.
// What is left on the grid then settles down under gravity (buildgrid).
//
// Pure: no DOM, no store (unit tests: tests/unit/wreck.test.mjs).

import { settleGrid } from './buildgrid.js';

export const G = 2400;              // units / s^2: a gentle, toy-like gravity
export const L_MIN = 180;           // shortest chain (reeled in)
export const L_MAX = 820;           // longest chain (paid out)
export const R0 = 0.88;             // the first return keeps this much of the pull
export const R = 0.55;              // later half-swings lose more
export const REST_AMP = 0.09;       // below this (radians, ~5 deg) the ball eases to rest
export const MAX_A = 1.9;           // the start angle is clamped to +-110 degrees
export const MIN_PULL = 0.1;        // a smaller pull (radians) is a nudge: a little swing, no plan
export const STEP_MS = 16;
export const TUMBLE_MS = 700;       // a knocked piece's flight (the view's tumble)
export const LAND_AT = 0.78;        // share of the tumble spent in the air
export const FLOOR_Y = [900, 948];  // where scattered things land (the floor band in front of the deck)
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const EPS = 0.01;

/** Half a pendulum period for chain length L (ms). Pure. */
export const halfPeriod = (L, g = G) => Math.PI * Math.sqrt(L / g) * 1000;

/**
 * The pull: chain length and start angle for a ball pulled to (x, y) (its
 * centre), with the ground limit gy for the centre. Pure.
 */
export function pullOf(tip, x, y, { gy = Infinity } = {}) {
  const yy = Math.min(y, gy);
  const dx = x - tip[0];
  const dy = yy - tip[1];
  const L = clamp(Math.hypot(dx, dy), L_MIN, L_MAX);
  const a0 = clamp(Math.atan2(dx, dy), -MAX_A, MAX_A);
  return { L: r1(L), a0: Math.round(a0 * 10000) / 10000 };
}

/** Where the ball centre is at angle a on a chain of length L (clamped to the ground gy). Pure. */
export function ballPos(tip, L, a, gy = Infinity) {
  return { x: tip[0] + L * Math.sin(a), y: Math.min(gy, tip[1] + L * Math.cos(a)) };
}

/**
 * The swing path from a pull: {L, a0, halves: [{t0, dur, a, b}], end}. Each
 * half-swing goes from angle a to b; the last one eases to 0. Pure.
 */
export function swingPath({ L, a0 }, { g = G, r0 = R0, r = R, rest = REST_AMP } = {}) {
  const halves = [];
  const T = halfPeriod(L, g);
  let t = 0;
  let a = a0;
  let k = 0;
  while (Math.abs(a) >= rest && k < 16) {
    const b = -a * (k === 0 ? r0 : r);
    halves.push({ t0: Math.round(t), dur: Math.round(T), a, b });
    t += T;
    a = b;
    k++;
  }
  // Ease the last little bit to rest (a quarter swing).
  halves.push({ t0: Math.round(t), dur: Math.round(T / 2), a, b: 0, ease: true });
  t += T / 2;
  return { L, a0, halves, end: Math.round(t) };
}

/** The swing angle at time t (ms) along a path (0 after the end). Pure. */
export function angleAt(path, t) {
  if (t <= 0) return path.a0;
  for (const h of path.halves) {
    if (t > h.t0 + h.dur) continue;
    const u = clamp((t - h.t0) / h.dur, 0, 1);
    if (h.ease) return h.a + (h.b - h.a) * (1 - Math.cos((u * Math.PI) / 2));
    return (h.a + h.b) / 2 + ((h.a - h.b) / 2) * Math.cos(u * Math.PI);
  }
  return 0;
}

/** The ball centre at time t along a path. Pure. */
export function ballAt(path, tip, gy, t) {
  return ballPos(tip, path.L, angleAt(path, t), gy);
}

/** Does a circle (cx, cy, rad) touch the box [x0, y0, x1, y1]? Pure. */
export function circleHitsBox(cx, cy, rad, box) {
  const nx = clamp(cx, box[0], box[2]);
  const ny = clamp(cy, box[1], box[3]);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) <= rad * rad;
}

/** A grid piece's box [x0, y0, x1, y1] from its anchor (x, y) and shape (cells). Pure. */
export function pieceBox(p, cell) {
  return [p.x - (p.shape.w * cell) / 2, p.y - p.shape.h * cell, p.x + (p.shape.w * cell) / 2, p.y];
}

// Does q rest directly on p (columns overlap and q's row is p's top in one of them)?
function restsOn(q, p) {
  if (!(q.c < p.c + p.shape.w && q.c + q.shape.w > p.c)) return false;
  for (let i = 0; i < p.shape.w; i++) {
    const col = p.c + i;
    if (col < q.c || col >= q.c + q.shape.w) continue;
    if (Math.abs(q.r - (p.r + p.shape.tops[i])) < EPS) return true;
  }
  return false;
}

/**
 * Plan a wreck: what the swing knocks down and where everything lands.
 *
 *   pieces: grid pieces [{id, c, r, shape, x, y, locked}] (x, y = anchor)
 *   chars:  characters [{id, x, y, box: [x0, y0, x1, y1], floor: bool}]
 *   opts:   {tip, gy, radius, grid, width (room), rng, pull: {L, a0}}
 *
 * Returns {L, a0, end, hits: [...]}, hits sorted by time:
 *   {id, t, kind: 'knock', fx, fy, x, y, spin, hop}   off the grid onto the floor
 *   {id, t, kind: 'char',  fx, fy, x, y, spin, hop}   a silly spin, lands on its feet
 *   {id, t, kind: 'wobble'}                            locked: wobbles, stays
 *   {id, t, kind: 'settle', fx, fy, x, y, r}           what is left comes to rest (gravity)
 * t: ms after the release (the view starts its flight then). Pure.
 */
export function planWreck(pieces, chars, { tip, gy, radius, grid, width = 2880, rng = Math.random, pull }) {
  const path = swingPath(pull);
  const cell = grid.cell;
  const boxes = new Map(pieces.map((p) => [p.id, pieceBox(p, cell)]));
  const knocked = new Map();       // id -> {t, dir}
  const charHit = new Map();
  const wobbles = [];
  const lastWobble = new Map();    // id -> half-swing index of its last wobble
  const halfOf = (t) => { let k = 0; for (let i = 0; i < path.halves.length; i++) if (t >= path.halves[i].t0) k = i; return k; };

  // Knock p (and everything resting on it, a row later each) at time t.
  const knock = (p, t, dir) => {
    const was = knocked.get(p.id);
    if (was && was.t <= t) return;
    knocked.set(p.id, { t, dir });
    for (const q of pieces) {
      if (q.id === p.id || q.locked || !restsOn(q, p)) continue;
      knock(q, t + 70 + Math.round((q.r - p.r) * 20), dir);
    }
  };

  let prev = ballAt(path, tip, gy, 0);
  for (let t = 0; t <= path.end; t += STEP_MS) {
    const b = ballAt(path, tip, gy, t);
    const dx = b.x - prev.x;
    const dir = dx > 0.01 ? 1 : dx < -0.01 ? -1 : (b.x >= tip[0] ? -1 : 1);
    prev = b;
    for (const p of pieces) {
      if (knocked.has(p.id) && knocked.get(p.id).t <= t) continue;
      if (!circleHitsBox(b.x, b.y, radius, boxes.get(p.id))) continue;
      if (p.locked) {
        const k = halfOf(t);
        if (lastWobble.get(p.id) !== k) { lastWobble.set(p.id, k); wobbles.push({ id: p.id, t, kind: 'wobble' }); }
        continue;
      }
      knock(p, t, dir);
    }
    for (const c of chars) {
      if (charHit.has(c.id)) continue;
      if (circleHitsBox(b.x, b.y, radius, c.box)) charHit.set(c.id, { t, dir });
    }
  }

  const hits = wobbles.slice();
  const land = () => r1(FLOOR_Y[0] + rng() * (FLOOR_Y[1] - FLOOR_Y[0]));
  // Knocked pieces in a stable order (the rng draws must not depend on Map order).
  const order = pieces.filter((p) => knocked.has(p.id)).sort((a, b) => a.r - b.r || (a.id < b.id ? -1 : 1));
  for (const p of order) {
    const { t, dir } = knocked.get(p.id);
    const d = 70 + rng() * 170 + 26 * p.r;
    const turns = 1 + Math.floor(rng() * 2);
    hits.push({
      id: p.id, t, kind: 'knock', fx: p.x, fy: p.y,
      x: r1(clamp(p.x + dir * d, 40, width - 40)), y: land(),
      spin: dir * turns * 360, hop: Math.round(70 + rng() * 110 + 18 * p.r),
    });
  }
  for (const c of chars.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const h = charHit.get(c.id);
    if (!h) continue;
    const d = 110 + rng() * 120;
    hits.push({
      id: c.id, t: h.t, kind: 'char', fx: c.x, fy: c.y,
      x: r1(clamp(c.x + h.dir * d, 60, width - 60)), y: c.floor ? r1(clamp(c.y + (rng() - 0.5) * 30, FLOOR_Y[0], FLOOR_Y[1])) : land(),
      spin: h.dir * 360, hop: Math.round(150 + rng() * 60),
    });
  }
  // What is left settles down (a locked piece whose support went), once what was under it has gone.
  if (knocked.size) {
    const left = pieces.filter((p) => !knocked.has(p.id));
    for (const mv of settleGrid(grid, left)) {
      const p = pieces.find((q) => q.id === mv.id);
      let t = 0;
      for (const [id, k] of knocked) {
        const q = pieces.find((z) => z.id === id);
        if (q.r < p.r && q.c < p.c + p.shape.w && q.c + q.shape.w > p.c) t = Math.max(t, k.t);
      }
      hits.push({ id: mv.id, t: t + 260, kind: 'settle', fx: p.x, fy: p.y, x: mv.x, y: mv.y, r: mv.r });
    }
  }
  hits.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { L: path.L, a0: path.a0, end: path.end, hits };
}
