// The construction site's tower crane (P2c.2, docs/design.md 3.3 #3): pure
// geometry for the trolley, the cable and the hook, what the hook grabs and
// where a load is set down, and the damped pendulum a load swings on.
//
// State lives in ONE store entity of kind 'crane-hook' in the site room: its
// x, y is the hook's grab point (the inside of the hook's curve), moved with
// `move` ops; what hangs on it is its child (`attach` slot 'hook'). So the
// crane is saved, replayed and shared by two iPads like everything else.
// The art (manifest rooms.site.rigs.towerCrane) is four pieces moved with
// transforms from that point:
//   trolley  translate x along the jib's rail
//   cable    translate x, scaleY = length / drawn length about the cable top
//   hook     translate x, then down by the extra length
// and while it swings, the cable, the hook and the load rotate together
// about the cable top (the trolley).
//
// Pure: no DOM, no store (unit tests: tests/unit/crane.test.mjs).

export const HOOK_KIND = 'crane-hook';
export const HOOK_SLOT = 'hook';
export const G = 2400;          // units / s^2 (the same toy gravity as the wrecking ball)
export const DAMP = 1.5;        // 1/s: a swing dies down in a few seconds
export const MAX_SWAY = 0.35;   // radians (~20 deg)
export const TROLLEY_SPEED = 560;   // units / s
export const HOOK_SPEED = 360;      // units / s
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The crane's geometry from the manifest rig. Pure. */
export function craneGeom(rig) {
  const [cx, cy] = rig.cableTop;
  const [hx, hy] = rig.hookTop;
  const [gx, gy] = rig.hookGrab;
  const dx = gx - hx;                // grab point relative to the cable end
  const dy = gy - hy;
  return {
    cableTop: [cx, cy], hookTop: [hx, hy], grab: [gx, gy], dx, dy,
    cableLength: rig.cableLength,
    x0: rig.trolleyRail.x0 + dx, x1: rig.trolleyRail.x1 + dx,     // grab x range
    y0: rig.hookRange.yMin + dy, y1: rig.hookRange.yMax + dy,     // grab y range
    rest: [rig.trolleyRail.rest + dx, gy],
  };
}

/** A grab point clamped into the crane's reach. Pure. */
export function clampHook(geo, x, y) {
  return { x: r1(clamp(x, geo.x0, geo.x1)), y: r1(clamp(y, geo.y0, geo.y1)) };
}

/**
 * CSS transforms for the crane pieces with the grab point at (x, y) and the
 * swing angle th (radians, + = the load is out to the right).
 * The pieces' bodies have their transform-origin at: cable = the cable top,
 * hook = `hookOrigin` (the cable top in the hook box's coordinates). Pure.
 * hookBox: the hook piece's box {x, y}.
 */
export function pieceTransforms(geo, x, y, th, hookBox) {
  const tx = r1(x - geo.grab[0]);            // trolley shift
  const len = y - geo.dy - geo.cableTop[1];  // cable length now
  const dl = r1(y - geo.grab[1]);            // extra length
  const deg = Math.round((-th * 180 / Math.PI) * 100) / 100;   // th > 0: the load is to the right (CSS rotate is clockwise)
  const rot = deg ? ` rotate(${deg}deg)` : '';
  return {
    trolley: `translate3d(${tx}px, 0px, 0px)`,
    cable: `translate3d(${tx}px, 0px, 0px)${rot} scale(1, ${Math.round((len / geo.cableLength) * 1000) / 1000})`,
    hook: `translate3d(${tx}px, 0px, 0px)${rot} translate3d(0px, ${dl}px, 0px)`,
    hookOrigin: `${r1(geo.cableTop[0] - hookBox.x)}px ${r1(geo.cableTop[1] - hookBox.y)}px`,
  };
}

/** The length of the pendulum (cable top to the load's middle) for a grab point y and a load hanging `drop` below it. Pure. */
export function swingLength(geo, y, drop = 0) {
  return Math.max(60, y - geo.cableTop[1] + drop * 0.5);
}

/**
 * One step of the damped pendulum (semi-implicit Euler). s = {th, w}; dt in
 * seconds; ax = the trolley's acceleration (units/s^2, + = right): a
 * trolley that speeds up leaves the load behind. Returns the new state. Pure.
 */
export function swingStep(s, dt, L, ax = 0, { g = G, damp = DAMP } = {}) {
  const acc = -(g / L) * Math.sin(s.th) - (ax / L) * Math.cos(s.th) - damp * s.w;
  const w = s.w + acc * dt;
  const th = clamp(s.th + w * dt, -MAX_SWAY, MAX_SWAY);
  return { th, w: th === MAX_SWAY || th === -MAX_SWAY ? 0 : w };
}

/** Is a swing settled (small and slow enough to snap to rest)? Pure. */
export const swingSettled = (s) => Math.abs(s.th) < 0.003 && Math.abs(s.w) < 0.02;

/** Move `cur` toward `to` by at most `max` (one axis). Pure. */
export function approach(cur, to, max) {
  const d = to - cur;
  return Math.abs(d) <= max ? to : cur + Math.sign(d) * max;
}

/**
 * What the hook, coming down at x from grab height y, touches first: the
 * thing whose box spans x and whose top is at or below y (the highest such
 * top). things: [{id, x0, x1, top}]. Returns the thing or null. Pure.
 */
export function contactBelow(things, x, y) {
  let best = null;
  for (const t of things) {
    if (x < t.x0 || x > t.x1 || t.top < y - 4) continue;
    if (!best || t.top < best.top) best = t;
  }
  return best;
}

/** The thing whose box holds the grab point (x, y) (the hook dropped onto it), front-most first. Pure. */
export function thingAt(things, x, y, { slack = 14 } = {}) {
  let best = null;
  for (const t of things) {
    if (x < t.x0 || x > t.x1 || y < t.top - slack || y > t.bottom) continue;
    if (!best || (t.rank || 0) > (best.rank || 0)) best = t;
  }
  return best;
}

/**
 * Where a load hanging at x comes to rest: the first surface under its feet
 * (surfaces [{id, x0, x1, y}], at or below feetY - slack) or the floor line
 * floorY. Returns {y, surface}. Pure.
 */
export function landingUnder(surfaces, x, feetY, floorY, { slack = 10 } = {}) {
  let best = null;
  for (const s of surfaces) {
    if (x < s.x0 - 8 || x > s.x1 + 8 || s.y < feetY - slack || s.y > floorY) continue;
    if (!best || s.y < best.y) best = s;
  }
  return best ? { y: best.y, surface: best } : { y: floorY, surface: null };
}

/**
 * Where the things on the hook hang: Map id -> {x, y, z, scale, front, hidden}
 * (view.js layout: feet offset from the hook's grab point). items [{id, h,
 * char}]: a character hangs by its raised hands (its box top at the hook), a
 * thing by its top. Two at once (two iPads) hang side by side. Pure.
 */
export function hookLayout(items) {
  const out = new Map();
  const n = items.length;
  items.forEach((it, i) => {
    const x = n > 1 ? (i - (n - 1) / 2) * 50 : 0;
    const y = it.char ? it.h * 0.97 : Math.max(10, it.h - 8);
    out.set(it.id, { x: r1(x), y: r1(y), z: 10 + i, scale: 1, front: false, hidden: false });
  });
  return out;
}
