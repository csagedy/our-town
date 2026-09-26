// The dig pit's pure rules (P2c.3, docs/design.md 3.3 #5-#7): excavator
// geometry and its one-finger control, the buried-treasure layout, how much
// dirt a spade / bucket / wheelbarrow holds, pile sizes. No DOM; the scene is
// src/scenes/site-dig.js and the dirt itself src/engine/digmask.js.

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Excavator (manifest rooms.site.rigs.excavator)
//
// The arm is ONE rigid piece turning about armPivot; the bucket hangs from
// the arm's tip (bucketPivot, carried round by the arm) and curls about it.
// A single finger on the bucket drives it: the arm turns so the bucket gets
// to the finger's height, and the whole machine rolls on its treads so it
// gets to the finger's x (the simplest control that reaches everywhere: the
// bucket goes where the finger goes).

export const ARM_RANGE = [-40, 30];      // degrees from the painted pose (negative: lower)
export const DRIVE_RANGE = [-170, 60];   // world units the excavator rolls (negative: towards the pit and the truck)
export const DUMP_CURL = -105;           // bucket curl that tips it out
export const FULL_CURL = 16;             // a full bucket curls in a little, holding its load

/** The excavator's rest geometry. Pure. */
export function excavatorGeom(rig) {
  const P = rig.armPivot, B = rig.bucketPivot, M = rig.bucketMouth;
  const R = Math.hypot(B[0] - P[0], B[1] - P[1]);
  return {
    P, B0: B, M0: M, R,
    th0: Math.atan2(B[1] - P[1], B[0] - P[0]),
    mouth: [M[0] - B[0], M[1] - B[1]],
    arm: ARM_RANGE, drive: DRIVE_RANGE,
  };
}

/** Where things are for arm angle a (deg), drive dx and bucket curl (deg): B (bucket pivot), M (scoop point). Pure. */
export function excavatorPose(geo, a, dx, curl = 0) {
  const th = geo.th0 + a * DEG;
  const B = [geo.P[0] + dx + geo.R * Math.cos(th), geo.P[1] + geo.R * Math.sin(th)];
  const t = (a + curl) * DEG;
  const [ox, oy] = geo.mouth;
  const M = [B[0] + ox * Math.cos(t) - oy * Math.sin(t), B[1] + ox * Math.sin(t) + oy * Math.cos(t)];
  return { B, M, a, dx, curl, bucketDeg: a + curl };
}

/**
 * The arm angle and drive that bring the bucket pivot to world (tx, ty), as
 * near as the machine goes: the arm for the height (the left-hand solution:
 * the bucket stays in front of the cab), then the treads for x. Pure.
 */
export function excavatorReach(geo, tx, ty) {
  const s = clamp((ty - geo.P[1]) / geo.R, -1, 1);
  let th = Math.PI - Math.asin(s);                   // cos <= 0: to the left of the pivot
  let a = (th - geo.th0) / DEG;
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  a = clamp(a, geo.arm[0], geo.arm[1]);
  th = geo.th0 + a * DEG;
  const dx = clamp(tx - (geo.P[0] + geo.R * Math.cos(th)), geo.drive[0], geo.drive[1]);
  return { a: r1(a), dx: r1(dx) };
}

// ---------------------------------------------------------------------------
// Dirt amounts (in "scoops"; a pile's size is scoops too)

export const SPADE_R = 24;           // the spade's hole radius (world units)
export const BUCKET_R = 30;
export const SPADE_SCOOP = 26000;    // dirt levels (digmask cells x levels) a spade holds before it is full
export const BUCKET_SCOOP = 52000;
export const LOAD = { spade: 1, bucket: 2, wheelbarrow: 3 };
export const PILE_MAX = 8;
export const TRUCK_MAX = 8;

/** The radius of the fill a dump of n scoops makes in the pit. Pure. */
export function fillRadius(n) {
  return Math.round(30 + 16 * Math.sqrt(Math.max(1, Math.min(PILE_MAX, n))));
}

/** A pile's drawn size for its size (scoops) and whether it was patted flat. Pure. */
export function pileDims(size, flat = false) {
  const n = clamp(Math.round(size) || 1, 1, PILE_MAX);
  const w = 64 + 20 * n, h = 22 + 8 * n;
  return flat ? { w: Math.round(w * 1.3), h: Math.round(h * 0.45), n } : { w, h, n };
}

// ---------------------------------------------------------------------------
// Treasures

// The first-visit layout: [kind, slot] (manifest slots treasure-1..6, BELOW the dirt).
export const TREASURE_LAYOUT = [
  ['gem', 'treasure-1'],
  ['rubber-duck', 'treasure-2'],
  ['toy-robot', 'treasure-3'],
  ['fossil', 'treasure-4'],
  ['treasure-chest', 'treasure-5'],
  ['dino-bone', 'treasure-6'],
];
export const UNCOVER = 0.5;      // mean dirt over a treasure at or under this: it is found
export const REBURY = 0.85;      // at or over this (after a fill): buried again
export const RESTOCK_FULL = 0.97;

/** The treasure spots from the manifest: [{kind, slot, x, y}]. Pure. */
export function treasureSpots(m) {
  const slots = new Map((m.slots || []).filter((s) => s.kind === 'treasure').map((s) => [s.id, s.at]));
  return TREASURE_LAYOUT.filter(([, slot]) => slots.has(slot)).map(([kind, slot]) => ({ kind, slot, x: slots.get(slot)[0], y: slots.get(slot)[1] }));
}

/** The box (world) a coverage check looks at: the middle of the treasure's drawn box. Pure. */
export function treasureBox(x, y, w, h, scale = 1) {
  const hw = (w * scale) / 2 * 0.7, hh = h * scale;
  return [x - hw, y - hh * 0.85, x + hw, y - hh * 0.15];
}

/**
 * New buried treasures for a refilled pit (picked before dispatch, so the op
 * carries them): up to n [kind, slot] pairs on slots nothing sits on. rng() in [0, 1). Pure.
 */
export function restockPicks(kinds, freeSlots, n, rng) {
  const slots = freeSlots.slice();
  const out = [];
  for (let i = 0; i < n && slots.length; i++) {
    const si = Math.floor(rng() * slots.length);
    const kind = kinds[Math.floor(rng() * kinds.length)];
    out.push([kind, slots.splice(si, 1)[0]]);
  }
  return out;
}
