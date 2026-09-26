// Characters as entities (P1.10, docs/design.md 2.4, docs/rig.md): the pure
// part. No DOM, so unit tests import it directly; the live view is
// characters.js.
//
// A character is an entity of kind 'char':
//
//   props: { cast: 'girl9', body: 'kid9', skin: [c, shade], hair: {style, color: [c, shade]},
//            facialHair, lashes, blush, sock, freckles, eyes, brows,   // (P1.15 maker options)
//            name: 'Maya',                     // optional, Zoe's text layer only
//            wear: { top, bottom, shoes },     // the clothes it is drawn in (not entities)
//            colors: { shoe: '#..' },          // slot colour overrides (docs/rig.md section 4)
//            expr: 'happy',                    // its current expression (set op)
//            pose: 'stand' | 'sit' | 'sit-cross' | 'lie',   // set op; a drop on a seat, rug or bed sets it
//            seat: 'stool-1' | null,           // the seat it is on (draw order, one per seat)
//            raise: 'L' | 'R' | null,          // a held item is shown off (hold-up), set op
//            taps: n }                         // inc op: each tap plays the next reaction on every iPad
//
// Children (attach op, slot):
//   'hand-l' / 'hand-r'   a held item (any kind); L and R are SCREEN sides (docs/rig.md)
//   'wear-<slot>'         a worn piece whose kind is a rig wear piece: hat, face, over, back
//                         (a hat, glasses, an apron, a cape: drop one on, drag it off)
//
// So what a character holds and wears travels with it (travel moves
// children) and is saved and shared like everything else.

import { poseFrames, applyMatrix } from './rig-svg.js';

export const CHAR_KIND = 'char';
export const HANDS = { L: 'hand-l', R: 'hand-r' };
export const SIDE_OF = { 'hand-l': 'L', 'hand-r': 'R' };
export const REMOVABLE = ['hat', 'face', 'over', 'back'];   // wear slots that are entities
export const BASE_WEAR = ['top', 'bottom', 'shoes'];         // clothes drawn from props.wear
export const wearSlotName = (slot) => 'wear-' + slot;
export const REACTIONS = ['giggle', 'wave', 'jump', 'happy'];
export const PHRASES = ['Hi!', 'Yay!', 'Hello, friend!', 'Let’s play!', 'I’m hungry!', 'Wheee!', 'Yummy!', 'I love you!'];

const APPEARANCE = ['body', 'skin', 'hair', 'facialHair', 'lashes', 'blush', 'freckles', 'eyes', 'brows', 'sock', 'wear', 'colors'];
const r1 = (v) => Math.round(v * 10) / 10;

/** Is this a wearable piece kind (a rig wear piece in a removable slot)? Returns its slot or null. */
export function wearSlotOf(rig, kind) {
  const w = rig && rig.wear && rig.wear[kind];
  return w && REMOVABLE.includes(w.slot) ? w.slot : null;
}

/**
 * Props for a character from a cast spec, plus the removable pieces it
 * starts with as [{kind, slot, colors}] (spawned as worn children). Pure.
 */
export function castProps(rig, castId) {
  const c = rig.characters.find((q) => q.id === castId) || rig.characters[0];
  const wear = {};
  const pieces = [];
  const colors = Object.assign({}, c.colors || {});
  for (const slot of Object.keys(c.wear || {})) {
    const kind = c.wear[slot];
    if (!REMOVABLE.includes(slot)) { wear[slot] = kind; continue; }
    // This piece's colour overrides go with it (--over, --over-sh, ...).
    const own = {};
    for (const k of Object.keys(colors)) if (k === slot || k.indexOf(slot + '-') === 0) { own[k] = colors[k]; delete colors[k]; }
    pieces.push({ kind, slot, colors: own });
  }
  const props = {
    cast: c.id, body: c.body, skin: c.skin.slice(), hair: { style: c.hair.style, color: c.hair.color.slice() },
    lashes: !!c.lashes, blush: !!c.blush, sock: c.sock || '#FBF3E8', wear, colors,
    expr: c.expr || 'happy', pose: 'stand', seat: null, raise: null, taps: 0,
  };
  if (c.facialHair) props.facialHair = c.facialHair;
  if (c.freckles) props.freckles = true;
  if (c.eyes) props.eyes = c.eyes;
  if (c.brows) props.brows = c.brows;
  if (c.name) props.name = c.name;          // Zoe's text layer (name tag) only
  return { props, pieces };
}

/** What a character holds and wears, from its children: {held: {L, R}, worn: {slot: entity}}. Pure. */
export function partsOf(children, rig) {
  const held = { L: null, R: null };
  const worn = {};
  for (const c of children) {
    if (SIDE_OF[c.slot]) held[SIDE_OF[c.slot]] = c;
    else if (c.slot && c.slot.indexOf('wear-') === 0) {
      const slot = c.slot.slice(5);
      if (wearSlotOf(rig, c.kind) === slot) worn[slot] = c;
    }
  }
  return { held, worn };
}

/** The rig spec (docs/rig.md section 7) for a character entity's props and worn children. Pure. */
export function specOf(props, worn = {}) {
  const wear = Object.assign({}, props.wear || {});
  const colors = Object.assign({}, props.colors || {});
  for (const slot of Object.keys(worn)) {
    wear[slot] = worn[slot].kind;
    Object.assign(colors, (worn[slot].props && worn[slot].props.colors) || {});
  }
  return {
    body: props.body || 'kid9', skin: props.skin || ['#EDC3A2', '#D9A07F'],
    hair: props.hair || { style: 'short', color: ['#6A4A3A', '#55403F'] },
    facialHair: props.facialHair, lashes: !!props.lashes, blush: !!props.blush, sock: props.sock,
    freckles: !!props.freckles, eyes: props.eyes || null, brows: props.brows || null,
    wear, colors, expr: props.expr || 'neutral',
  };
}

/** A key that changes whenever the drawn character must be rebuilt (not for expression changes). Pure. */
export function appearanceKey(props) {
  let s = '';
  for (const k of APPEARANCE) s += JSON.stringify(props[k] === undefined ? null : props[k]) + '|';
  return s;
}

const HOLD_ARM = [18, -100, 0];
const UP_ARM = [160, -48, 0];

/**
 * The pose object for a base pose name with held items: a holding arm comes
 * up to the chest (drawn in front of the head), a raised one goes up high.
 * Lying keeps its arms. Pure.
 */
export function composePose(rig, name, held = {}, raise = null) {
  const base = rig.poses[name] || rig.poses.stand;
  if (name === 'lie') return base;
  const pose = Object.assign({}, base);
  const front = (base.front || []).slice();
  for (const s of ['L', 'R']) {
    if (!held[s]) continue;
    if (raise === s) pose['arm' + s] = UP_ARM;
    else {
      pose['arm' + s] = (rig.poses.hold && rig.poses.hold['arm' + s]) || HOLD_ARM;
      if (front.indexOf(s) < 0) front.push(s);
    }
  }
  pose.front = front;
  return pose;
}

/** The dangling pose while lifted: arms up a little, legs loose. Pure. */
export function danglePose(rig, held = {}, raise = null) {
  const p = composePose(rig, 'stand', held, raise);
  return Object.assign({}, p, {
    armL: held.L ? p.armL : [34, 26, 0], armR: held.R ? p.armR : [34, 26, 0],
    legL: [6, -10, 4], legR: [6, -10, 4], head: 4, ground: false, anchor: 'feet',
  });
}

/** Interpolate two pose objects (numbers and joint arrays); flags come from `b`. Pure. */
export function lerpPose(a, b, t) {
  const out = Object.assign({}, b);
  const arr = (x, y) => {
    const n = Math.max(x.length, y.length, 3);
    const o = [];
    for (let i = 0; i < n; i++) {
      const dx = i === 3 ? 1 : 0;
      const u = x[i] == null ? dx : x[i], v = y[i] == null ? dx : y[i];
      o.push(u + (v - u) * t);
    }
    return o;
  };
  for (const k of ['armL', 'armR', 'legL', 'legR', 'root']) out[k] = arr(a[k] || [0, 0, 0], b[k] || [0, 0, 0]);
  out.torso = (a.torso || 0) + ((b.torso || 0) - (a.torso || 0)) * t;
  out.head = (a.head || 0) + ((b.head || 0) - (a.head || 0)) * t;
  return out;
}

/** Same draw order (arms in front, legs in front)? Then a pose change is transforms only. Pure. */
export function sameOrder(a, b) {
  const f = (p) => (p.front || []).slice().sort().join('') + (p.legsFront ? '+' : '-') + (p.anchor === 'back' ? 'b' : '');
  return f(a) === f(b);
}

/**
 * The hit/placement box of a pose on a body, in world units: the box's
 * bottom centre is the pose's anchor (feet, seat or back), so the view
 * places it like any sprite. {w, h, anchor: [x, y] art units}. Pure.
 */
export function poseBox(rig, bodyId, pose) {
  const body = rig.bodies[bodyId];
  const sk = body.skeleton;
  const { frames, anchors } = poseFrames(sk, pose);
  const a = anchors[pose.anchor || 'feet'];
  const rx = (body.head ? body.head.rx : sk.headRy) * 1.08;
  const ry = (body.head ? body.head.ry : sk.headRy) * 1.12;
  const pts = [anchors.head, anchors.handL, anchors.handR, anchors.feet,
    applyMatrix(frames.legLL, 0, sk.shin), applyMatrix(frames.legLR, 0, sk.shin), applyMatrix(frames.root, 0, 0)];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); }
  const hd = applyMatrix(frames.head, 0, 0);
  // The head is a big ellipse (upright or on its side when lying).
  const side = pose.anchor === 'back';
  x0 = Math.min(x0, hd[0] - (side ? ry : rx));
  x1 = Math.max(x1, hd[0] + (side ? ry : rx));
  y0 = Math.min(y0, hd[1] - (side ? rx : ry));
  const k = rig.artScale;
  const half = Math.max(a[0] - x0, x1 - a[0]);
  return { w: r1(2 * half * k), h: r1(Math.max(40, (a[1] - y0) * k)), anchor: a, center: r1(((x0 + x1) / 2 - a[0]) * k) };
}

/** A local anchor (art units) of a pose, in world units relative to the pose's placement anchor. Pure. */
export function anchorOffset(rig, bodyId, pose, name) {
  const { anchors } = poseFrames(rig.bodies[bodyId].skeleton, pose);
  const a = anchors[pose.anchor || 'feet'];
  const p = anchors[name];
  return [(p[0] - a[0]) * rig.artScale, (p[1] - a[1]) * rig.artScale];
}

/**
 * Seats in a room definition, normalized: [{id, x, y, depth, lie, pose, x0, x1}].
 * A seat whose id starts with bed/sofa/couch/mat/nap is for lying down; one
 * starting with rug/carpet/circle is for sitting criss-cross on the floor
 * (circle time). `pose` is the pose a character takes there. Pure.
 */
export function normalizeSeats(list = []) {
  return list.map((s, i) => {
    const at = s.at || [s.x, s.y];
    const id = s.id || 'seat' + i;
    const lie = s.lie != null ? !!s.lie : /^(bed|sofa|couch|mat|nap)/.test(id);
    const pose = s.pose || (lie ? 'lie' : /^(rug|carpet|circle)/.test(id) ? 'sit-cross' : 'sit');
    const half = s.half != null ? s.half : lie ? 110 : 44;
    return { id, x: at[0], y: at[1], depth: s.depth != null ? s.depth : at[1], lie, pose, x0: s.x0 != null ? s.x0 : at[0] - half, x1: s.x1 != null ? s.x1 : at[0] + half };
  });
}

export const SEAT_SNAP = 70;     // world units: a pelvis this close to a seat snaps onto it (design 2.4: 60pt)

/**
 * The seat a character whose seat point (just under the pelvis) is at
 * (x, y) snaps to, or null. `taken`: seat ids other characters use. Pure.
 */
export function seatNear(seats, x, y, taken = new Set()) {
  let best = null, bestD = Infinity;
  for (const s of seats) {
    if (taken.has(s.id)) continue;
    const dx = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;
    const dy = Math.abs(y - s.y) * (y < s.y ? 0.6 : 1);   // a little generous from above
    if (dx > SEAT_SNAP || dy > SEAT_SNAP * 1.3) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/** How a food tastes from its tags: 'sweet' | 'weird' | 'plain'. Pure. */
export function tasteOf(tags = []) {
  if (tags.some((t) => t === 'sour' || t === 'weird' || t === 'spicy' || t === 'ingredient' || t === 'raw')) return 'weird';
  if (tags.some((t) => t === 'sweet' || t === 'dessert')) return 'sweet';
  return 'plain';
}

/** Which reactions a tap cycles through in a pose. Pure. */
export function reactionsFor(pose) {
  if (pose === 'lie') return ['sleepy'];
  if (pose && pose.indexOf('sit') === 0) return ['giggle', 'wave', 'happy'];
  return REACTIONS;
}

/**
 * Spawn a character (and the pieces it starts with) through store ops.
 * where: {room, x, y} standing, or {room, seat} with a normalized seat.
 * Returns the new id (or null if the spawn was refused).
 */
export function spawnCharacter(store, rig, castId, where) {
  const { props, pieces } = castProps(rig, castId);
  const id = store.newId();
  let x = where.x, y = where.y;
  if (where.seat) {
    props.pose = where.seat.pose || (where.seat.lie ? 'lie' : 'sit');
    props.seat = where.seat.id;
    x = where.seat.x; y = where.seat.y;
    if (where.seat.lie) props.expr = 'sleepy';
  }
  if (where.pose) props.pose = where.pose;
  if (!store.dispatch('spawn', { id, kind: CHAR_KIND, room: where.room, x: r1(x), y: r1(y), props })) return null;
  for (const p of pieces) {
    store.dispatch('spawn', { id: store.newId(), kind: p.kind, parent: id, slot: wearSlotName(p.slot), props: Object.keys(p.colors).length ? { colors: p.colors } : {} });
  }
  return id;
}

/**
 * Put characters into a room (first visit): placements are
 * [{cast, x, y} | {cast, seat: '<seat id>'}]; seats from normalizeSeats.
 * Extra things (a cape, a hat) go in with `items`: [{kind, x, y}] (feet points).
 */
export function seedCharacters(store, rig, { room, seats = [], placements = [], items = [] }) {
  const ids = [];
  for (const p of placements) {
    const seat = p.seat ? seats.find((s) => s.id === p.seat) : null;
    const id = spawnCharacter(store, rig, p.cast, seat ? { room, seat } : { room, x: p.x, y: p.y, pose: p.pose });
    if (id) ids.push(id);
  }
  for (const it of items) store.dispatch('spawn', { id: store.newId(), kind: it.kind, room, x: it.x, y: it.y, z: it.z || 0 });
  return ids;
}
