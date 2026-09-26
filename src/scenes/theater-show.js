// The theater's show magic (P2b.2, docs/design.md 3.2 #3, #12, #14): the
// spotlights on the rail, the flying scenery, and the effects booth.
// Mounted by theater.js (the same seam as theater-sound.js).
//
//   SPOTLIGHTS  three lamps (the `spotlight` piece at its three copies). Drag
//               a lamp along the rail: it follows the finger and snaps to the
//               nearest of the three spots (a lamp already there slides over
//               to the spot you left). Tap a lamp: off -> white -> pink ->
//               blue -> gold -> off. The cone and its soft pool on the stage
//               floor are in the piece art (translucent, no blend modes, no
//               blur). A character standing in a lit pool gets a sparkle, a
//               proud face and a star pose. Fixtures props: `spot0..2`
//               (colour per lamp) and `spots` (which spot each lamp is at, a
//               permutation like "012"): saved, replayed, shared.
//   SCENERY     tap the backdrop, or pull the fly rope (left of the stage)
//               down: the backdrop flies up out of sight, the next scene
//               (stars, castle, sea, city) drops in with a thud and a dust
//               puff. Each scene brings an AMBIENCE: a sound (crickets,
//               breeze, waves, traffic) replayed a few times and a few subtle
//               particles (twinkles, petals, bubbles, window lights). Finite:
//               it stops after AMBIENCE_MS, when the backdrop changes, or when
//               the stage leaves the screen. Fixtures prop `backdrop`.
//   EFFECTS     the four picture buttons in the booth and the machines
//               themselves: FOG (soft clouds roll across the stage floor and
//               fade; the audience goes "ooh"), CONFETTI (the cannon fires, the
//               pieces arc over the stage, land and fade; the audience cheers),
//               SNOW (flakes fall over the stage for a few seconds), THUNDER
//               (the sheet shakes, a rumble, a quick white flash, not with
//               prefers-reduced-motion; the audience gasps, then laughs).
//               Transient: nothing is saved.
//
// Performance: every particle goes through ONE fx pool (SHOW_CAP elements,
// transform + opacity WAAPI only); timers are finite; nothing runs once the
// effects end (no rAF loops here at all).
//
//   const show = createShow({...});   show.render(props)   show.onPieceTap(pid, copy)
//   show.onMove(entity)   show.state()   show.stats()   show.destroy()

import { createFx } from '../engine/fx.js';
import { sfx } from '../audio/index.js';
import * as tween from '../engine/tween.js';

export const SPOT_COLORS = ['off', 'white', 'pink', 'blue', 'gold'];
export const LIGHT_REACH = 120;           // a character within this x of a lit lamp stands in its light
export const SHINE_MS = 2200;             // one shine per character per this long
export const SHOW_CAP = 48;               // particles for the show effects and ambience, all at once
export const FLY = 600;                   // how far the backdrop flies up (out of its clip box)
export const AMBIENCE_MS = 10000;         // an ambience stops by itself after this
export const AMBIENCE_EVERY = 3200;       // its sound is replayed this often (3 plays)
export const AMBIENCE_TICK = 700;         // an ambient particle or two this often
export const FLY_ROPE = [969, 470, 44, 300];   // the fly rope's touch box (left of the stage)
export const EFFECTS = ['fog', 'confetti', 'snow', 'thunder'];
export const CONFETTI_COLORS = ['#F7B9C6', '#FFD27A', '#BCDDF3', '#B8E0C8', '#D7C2EC', '#F49A8C'];
// The ambience of each scene: its sound and its particles.
export const AMBIENCE = {
  stars: { sound: 'crickets', fx: 'twinkle', gain: 0.8 },
  castle: { sound: 'breeze', fx: 'petal', gain: 0.8 },
  sea: { sound: 'waves', fx: 'bubble', gain: 0.8 },
  city: { sound: 'traffic', fx: 'window', gain: 0.75 },
};
// Which effect a piece fires (the machines and their console buttons).
export const EFFECT_OF = {
  'fog-machine': 'fog', 'fx-fog': 'fog',
  'confetti-cannon': 'confetti', 'fx-confetti': 'confetti',
  'snow-machine': 'snow', 'fx-snow': 'snow',
  'thunder-sheet': 'thunder', 'fx-thunder': 'thunder',
};

const r1 = (v) => Math.round(v * 10) / 10;

/** The colour after `c` in the tap cycle. Pure. */
export function nextColor(c) {
  const i = SPOT_COLORS.indexOf(c);
  return SPOT_COLORS[(i + 1) % SPOT_COLORS.length];
}

/** The lamp colour of copy i from the fixtures props. Pure. */
export const colorOf = (props, i) => (props && SPOT_COLORS.includes(props['spot' + i]) ? props['spot' + i] : 'off');

/** Which spot each lamp is at: a permutation of 0..n-1 from a prop string ("012"); anything else is the identity. Pure. */
export function spotPerm(s, n = 3) {
  const id = Array.from({ length: n }, (_, i) => i);
  if (typeof s !== 'string' || s.length !== n) return id;
  const p = s.split('').map(Number);
  const seen = new Set(p);
  return seen.size === n && p.every((v) => v >= 0 && v < n) ? p : id;
}

/** The index of the rest spot nearest x. Pure. */
export function nearestRest(x, rest) {
  let best = 0;
  for (let i = 1; i < rest.length; i++) if (Math.abs(rest[i] - x) < Math.abs(rest[best] - x)) best = i;
  return best;
}

/** The spots after lamp `copy` is dropped on spot `to`: a lamp already there swaps into the spot it left. Returns the prop string. Pure. */
export function dropSpot(perm, copy, to) {
  const p = perm.slice();
  const from = p[copy];
  const other = p.indexOf(to);
  p[copy] = to;
  if (other >= 0 && other !== copy) p[other] = from;
  return p.join('');
}

/** The lit lamps: [{copy, x, color}] (x = the pool's centre). Pure. */
export function litLamps(props, rest) {
  const perm = spotPerm(props && props.spots, rest.length);
  const out = [];
  for (let i = 0; i < rest.length; i++) {
    const color = colorOf(props, i);
    if (color !== 'off') out.push({ copy: i, x: rest[perm[i]], color });
  }
  return out;
}

/** The lit lamp whose pool entity e stands in (nearest first), or null. Pure. */
export function lampOver(e, lamps, reach = LIGHT_REACH) {
  let best = null;
  for (const l of lamps) if (Math.abs(e.x - l.x) <= reach && (!best || Math.abs(e.x - l.x) < Math.abs(e.x - best.x))) best = l;
  return best;
}

/** The scene after `cur`. Pure. */
export function nextScene(cur, scenes) {
  const i = scenes.indexOf(cur);
  return scenes[(i + 1) % scenes.length];
}

/** The four effects' particle plans (pure; `rand` in [0, 1)). Each item: {type, x, y, steps, life, delay, color?}. */
export function plan(effect, rig, rand = Math.random) {
  const out = [];
  if (effect === 'fog') {
    const [x, y] = rig.fog.out;
    for (let i = 0; i < 8; i++) {
      const go = 520 + rand() * 260 + (i % 4) * 40;
      const lift = -40 - rand() * 40;
      out.push({
        type: 'fog', x, y: y - 10, life: 3200 + rand() * 900, delay: i * 240,
        steps: [
          { dx: 0, dy: 0, s: 0.5, o: 0 },
          { dx: go * 0.18, dy: lift * 0.4, s: 1.2, o: 0.85, at: 0.18, e: 'ease-out' },
          { dx: go * 0.6, dy: lift * 0.9, s: 1.9, o: 0.65, at: 0.6 },
          { dx: go, dy: lift, s: 2.5, o: 0 },
        ],
      });
    }
  } else if (effect === 'confetti') {
    const [x, y] = rig.confetti.out;
    const floor = rig.floor;
    for (let i = 0; i < 20; i++) {
      const dx = -(90 + rand() * 520);
      const peak = -(200 + rand() * 230);
      const land = floor - y + rand() * 18;
      const spin = 360 + rand() * 540;
      out.push({
        type: 'confetti', x, y, life: 2300 + rand() * 500, delay: i * 18, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        steps: [
          { dx: 0, dy: 0, s: 0.4, o: 1, r: 0 },
          { dx: dx * 0.45, dy: peak, s: 1, o: 1, r: spin * 0.4, at: 0.3, e: 'ease-in' },
          { dx: dx * 0.85, dy: land, s: 1, o: 1, r: spin, at: 0.78 },
          { dx: dx * 0.85, dy: land, s: 0.9, o: 1, r: spin, at: 0.9 },
          { dx: dx * 0.85, dy: land, s: 0.8, o: 0, r: spin },
        ],
        // the first leg flies up and slows (ease-out), the second falls and speeds up (ease-in)
        easing0: 'ease-out',
      });
    }
  } else if (effect === 'snow') {
    const [x0, x1] = rig.opening;
    const top = rig.snowTop, floor = rig.floor;
    for (let i = 0; i < 16; i++) {
      const x = x0 + 30 + rand() * (x1 - x0 - 60);
      const sway = 25 + rand() * 30;
      const s = 0.7 + rand() * 0.6;
      const fall = floor - top - rand() * 30;
      out.push({
        type: 'flake', x, y: top, life: 2600 + rand() * 900, delay: i * 230,
        steps: [
          { dx: 0, dy: 0, s, o: 0, r: 0 },
          { dx: sway, dy: fall * 0.3, s, o: 1, r: 40, at: 0.25 },
          { dx: -sway * 0.6, dy: fall * 0.65, s, o: 1, r: 90, at: 0.6 },
          { dx: sway * 0.4, dy: fall, s: s * 0.9, o: 0.9, r: 120, at: 0.92 },
          { dx: sway * 0.4, dy: fall, s: s * 0.8, o: 0, r: 120 },
        ],
      });
    }
  }
  return out;
}

/** One tick of an ambience's particles (pure): 1-2 small subtle ones inside the scene. */
export function ambientBits(kind, box, rand = Math.random) {
  const [x0, y0, w, h] = box;
  const at = (fx, fy) => [x0 + fx * w, y0 + fy * h];
  const out = [];
  const n = 1 + (rand() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    if (kind === 'bubble') {
      const [x, y] = at(0.08 + rand() * 0.84, 0.75 + rand() * 0.2);
      const s = 0.5 + rand() * 0.5;
      out.push({ type: 'bubble', x, y, life: 2600, delay: i * 300, steps: [{ s: s * 0.6, o: 0 }, { dx: 8, dy: -60, s, o: 0.8, at: 0.25 }, { dx: -8, dy: -170, s, o: 0.6, at: 0.7 }, { dx: 4, dy: -240, s, o: 0 }] });
    } else if (kind === 'twinkle') {
      const [x, y] = at(0.06 + rand() * 0.88, 0.05 + rand() * 0.45);
      const s = 0.45 + rand() * 0.4;
      out.push({ type: 'sparkle', x, y, life: 1300, delay: i * 350, steps: [{ s: 0.1, o: 0, r: 0 }, { s, o: 1, r: 45, at: 0.4 }, { s: 0.1, o: 0, r: 90 }] });
    } else if (kind === 'petal') {
      const [x, y] = at(rand() * 0.3, 0.1 + rand() * 0.3);
      out.push({ type: 'confetti', x, y, color: rand() < 0.5 ? '#F7B9C6' : '#FFFFFF', life: 3600, delay: i * 400, steps: [{ s: 0.5, o: 0, r: 0 }, { dx: 120, dy: 60, s: 0.6, o: 0.85, r: 160, at: 0.25 }, { dx: 380, dy: 140, s: 0.6, o: 0.8, r: 380, at: 0.7 }, { dx: 520, dy: 220, s: 0.5, o: 0, r: 520 }] });
    } else if (kind === 'window') {
      const [x, y] = at(0.12 + rand() * 0.76, 0.25 + rand() * 0.45);
      out.push({ type: 'sparkle', x, y, life: 1100, delay: i * 300, steps: [{ s: 0.1, o: 0 }, { s: 0.55, o: 0.9, at: 0.4 }, { s: 0.1, o: 0 }] });
    }
  }
  return out;
}

/** Is reduced motion asked for? */
function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

// The fly rope (drawn, left of the stage, the twin of the curtain rope): a
// rope with a gold tassel and a sandbag weight. Its own art piece + touch box.
const ROPE_SVG = `<svg viewBox="0 0 44 300" width="44" height="300" style="display:block;overflow:visible">
<path d="M22 -330 V222" stroke="#3D2C29" stroke-width="9" stroke-linecap="round" fill="none"/>
<path d="M22 -330 V222" stroke="#E7C98E" stroke-width="5" stroke-linecap="round" fill="none" stroke-dasharray="7 6"/>
<path d="M8 222 H36 L40 262 Q22 272 4 262 Z" fill="#8FA3C9" stroke="#3D2C29" stroke-width="3.5" stroke-linejoin="round"/>
<path d="M12 232 H32" stroke="#3D2C29" stroke-width="3" stroke-linecap="round"/>
<circle cx="22" cy="248" r="6" fill="#FFD27A" stroke="#3D2C29" stroke-width="3"/>
</svg>`;
export function showArt() {
  return [{ id: 'hit:fly-rope', layer: 'mid', depth: 764.4, x: FLY_ROPE[0], y: FLY_ROPE[1], w: FLY_ROPE[2], h: FLY_ROPE[3], cls: 'art-hit fly-rope', html: `<div class="fly-rope-body" style="transform-origin:22px -330px">${ROPE_SVG}</div>` }];
}

export function createShow({ store, stage, room, fx, chars, input, m, view: viewOf, setProp, fprops, pieceState, setOverride, copiesOf, performers, audience, cheer, doc = document, reduced = reducedMotion }) {
  const pieces = m.pieces;
  const rigs = m.rigs;
  const spot = rigs.spotlights;
  const rest = spot.rest;
  const lampOx = spot.rail && pieces.spotlight.pivot ? pieces.spotlight.pivot[0] - pieces.spotlight.x : pieces.spotlight.w / 2;
  const lampY = pieces.spotlight.y;
  const scenes = rigs.backdrop.scenes;
  const opening = rigs.curtain.opening;          // [x, y, w, h] of the proscenium opening
  const floorY = rigs.stage.lip - 30;
  const fxRig = {
    fog: rigs.effects.fog, confetti: rigs.effects.confetti,
    opening: [opening[0], opening[0] + opening[2]], snowTop: opening[1] + 90, floor: floorY,
  };
  const pool = createFx(room.fxLayer, { cap: SHOW_CAP });
  const stats = {
    spotTaps: 0, spotMoves: 0, spotSwaps: 0, shines: 0, flies: 0, ropePulls: 0,
    ambience: { started: 0, stopped: 0, sounds: 0, particles: 0, why: null },
    effects: { fog: 0, confetti: 0, snow: 0, thunder: 0 }, flashes: 0,
    reactions: { ooh: 0, cheer: 0, gasp: 0, laugh: 0, wheee: 0 }, peak: 0,
  };
  let destroyed = false;
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); return t; };
  const play = (name, opts) => { const v = viewOf(); if (v) v.play(name, opts); };
  const emit = (list) => {
    for (const q of list) {
      const steps = q.easing0 ? q.steps.map((s, i) => (i === 0 ? { ...s, e: q.easing0 } : s)) : q.steps;
      pool.path(q.type, q.x, q.y, steps, { life: q.life, delay: q.delay || 0, color: q.color || null });
    }
    const a = pool.stats().active;
    if (a > stats.peak) stats.peak = a;
  };
  const faces = (list, seq) => { if (chars) for (const e of list) chars.face(e.id, seq); };

  // ---------------------------------------------------------------------
  // Spotlights
  const lamps = copiesOf('spotlight') || [];
  const lamp = lamps.map((c, i) => ({ c, i, color: null, x: null, anim: null, drag: null, pending: 0 }));
  const hitRel = [100, 2, 88, 100];
  for (const L of lamp) {
    Object.assign(L.c.hit.style, { left: hitRel[0] + 'px', top: hitRel[1] + 'px', width: hitRel[2] + 'px', height: hitRel[3] + 'px' });
    L.c.el.dataset.copy = String(L.i);
  }
  const lampTransform = (x) => `translate3d(${r1(x - lampOx)}px, ${lampY}px, 0)`;
  function placeLamp(L, x, { slide = false } = {}) {
    if (L.x === x) return;
    const from = L.x;
    L.x = x;
    if (L.anim) { const a = L.anim; L.anim = null; a.cancel(); }
    L.c.el.style.transform = lampTransform(x);
    if (slide && from != null && !reduced()) {
      L.anim = tween.animate(L.c.el, [{ transform: lampTransform(from) }, { transform: lampTransform(x + (x > from ? 6 : -6)), offset: 0.8 }, { transform: lampTransform(x) }], { duration: 320, easing: 'ease-out' });
      const a = L.anim;
      a.addEventListener('finish', () => { if (L.anim === a) L.anim = null; });
    }
  }
  function showColor(L, color) {
    if (L.color === color) return;
    const first = L.color == null;
    L.color = color;
    L.c.el.dataset.variant = color;
    const file = pieces.spotlight.variants[color].file;
    const gen = ++L.pending;
    const set = () => {
      if (L.pending !== gen || destroyed) return;
      L.c.img.src = file;
      if (!first && color !== 'off' && !reduced()) tween.animate(L.c.img, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    };
    if (!L.c.img.getAttribute('src')) { set(); return; }
    const pre = new Image();
    pre.src = file;
    (pre.decode ? pre.decode() : Promise.resolve()).then(set, set);
  }
  function renderSpots(props) {
    const perm = spotPerm(props.spots, rest.length);
    for (const L of lamp) {
      showColor(L, colorOf(props, L.i));
      if (!L.drag) placeLamp(L, rest[perm[L.i]], { slide: L.x != null });
    }
  }
  function cycle(L) {
    const props = fprops();
    const next = nextColor(colorOf(props, L.i));
    setProp('spot' + L.i, next);
    stats.spotTaps++;
    play('clink', { pitch: next === 'off' ? 0.7 : 1 + SPOT_COLORS.indexOf(next) * 0.08, gain: 0.7 });
    tween.squish(L.c.body, { amount: 0.25 });
    if (next !== 'off') {
      pool.burst('sparkle', L.x, lampY + 30, { count: 3, spread: 40, scale: 0.7 });
      later(200, () => shineAll());
    }
  }
  function dragLamp(L) {
    return {
      pan: false,
      onTap() { cycle(L); },
      onDragStart() {
        L.drag = { x0: L.x };
        if (L.anim) { const a = L.anim; L.anim = null; a.cancel(); }
        play('slide', { pitch: 1.6, gain: 0.35 });
        return true;
      },
      onDragMove(info) {
        if (!L.drag) return;
        const x = Math.max(spot.rail.x0, Math.min(spot.rail.x1, L.drag.x0 + info.dx));
        L.x = null;   // force the write
        placeLamp(L, r1(x));
      },
      onDragEnd() {
        if (!L.drag) return;
        L.drag = null;
        const props = fprops();
        const perm = spotPerm(props.spots, rest.length);
        const to = nearestRest(L.x, rest);
        const next = dropSpot(perm, L.i, to);
        const swapped = perm.indexOf(to) !== L.i;
        stats.spotMoves++;
        if (swapped) stats.spotSwaps++;
        // Snap: slide from where the finger let go to the spot.
        const at = L.x;
        L.x = null;
        placeLamp(L, at);
        if (next !== perm.join('')) setProp('spots', next);
        placeLamp(L, rest[to], { slide: true });
        play('clunk', { pitch: 1.4, gain: 0.5 });
        later(340, () => shineAll());
      },
    };
  }
  for (const L of lamp) input.register(L.c.hit, dragLamp(L));

  // A character standing in a lit pool: a sparkle, a proud face, a star pose.
  const shone = new Map();   // char id -> last shine time
  function shine(e, l) {
    const now = Date.now();
    if (now - (shone.get(e.id) || 0) < SHINE_MS) return false;
    shone.set(e.id, now);
    stats.shines++;
    const h = chars ? chars.anchor(e.id, 'head') : null;
    const hx = h ? h.x : e.x, hy = h ? h.y : e.y - 200;
    pool.burst('sparkle', hx, hy - 40, { count: 6, spread: 90 });
    pool.burst('sparkle', l.x, floorY + 10, { count: 3, spread: 70, scale: 0.6 });
    play('sparkle', { gain: 0.6 });
    if (chars) {
      const star = { armL: [150, 10, 0], armR: [150, 10, 0], head: -4 };
      const hips = { armL: [60, 40, 0], armR: [60, 40, 0], head: 0 };
      chars.gesture(e.id, [[star, 360], [star, 700], [hips, 500]], { face: [['cheeky', 1100], ['happy', 900]] });
    }
    return true;
  }
  function shineAll() {
    const lit = litLamps(fprops(), rest);
    if (!lit.length) return 0;
    let n = 0;
    for (const e of performers()) {
      if ((e.props.pose || 'stand') !== 'stand') continue;
      const l = lampOver(e, lit);
      if (l && shine(e, l)) n++;
    }
    return n;
  }
  function onMove(e) {
    if (!e || e.kind !== 'char' || !performers().some((p) => p.id === e.id)) return;
    const l = lampOver(e, litLamps(fprops(), rest));
    if (l) later(250, () => shine(e, l));
  }

  // ---------------------------------------------------------------------
  // Scenery: fly the backdrop, drop the next one in, its ambience
  const drop = copiesOf('backdrop') ? copiesOf('backdrop')[0] : null;
  if (drop) drop.el.style.overflow = 'hidden';   // flying up = out of the clip box (behind the valance)
  let flying = false;
  let upAnim = null;
  const sceneBox = [opening[0] + 10, opening[1] + 60, opening[2] - 20, rigs.stage.upstage - opening[1] - 70];
  const waitShown = (file, n = 40) => new Promise((res) => {
    const tick = (k) => { if (destroyed || !drop || drop.img.getAttribute('src') === file || k <= 0) res(); else requestAnimationFrame(() => tick(k - 1)); };
    tick(n);
  });
  function fly(how = 'tap') {
    if (flying || !drop) return false;
    const cur = pieceState('backdrop');
    const next = nextScene(cur, scenes);
    flying = true;
    stats.flies++;
    stopAmbience('change');
    setOverride('backdrop', cur);     // keep the old picture up while it flies
    setProp('backdrop', next);
    play('swoosh', { pitch: 1.25, gain: 0.7 });
    const file = pieces.backdrop.variants[next].file;
    const pre = new Image();
    pre.src = file;
    const decoded = (pre.decode ? pre.decode() : Promise.resolve()).catch(() => null);
    const calm = reduced();
    const up = calm ? null : tween.animate(drop.body, [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(0, ${-FLY}px, 0)` }], { duration: 460, easing: 'ease-in', fill: 'forwards' });
    upAnim = up;
    Promise.all([up ? tween.done(up) : Promise.resolve(), decoded]).then(async () => {
      if (destroyed) return;
      setOverride('backdrop', null);
      await waitShown(file);
      if (destroyed) return;
      if (!calm) {
        play('whoosh', { pitch: 0.7, gain: 0.5 });
        const down = tween.animate(drop.body, [
          { transform: `translate3d(0, ${-FLY}px, 0)` },
          { transform: 'translate3d(0, 10px, 0)', offset: 0.78 },
          { transform: 'translate3d(0, -4px, 0)', offset: 0.9 },
          { transform: 'translate3d(0, 0, 0)' },
        ], { duration: 560, easing: 'ease-in' });
        if (upAnim) { const a = upAnim; upAnim = null; a.cancel(); }
        await tween.done(down);
      }
      if (destroyed) return;
      play('thud', { pitch: 0.8, gain: 0.8 });
      const deckY = rigs.stage.upstage;
      for (const fx0 of [0.15, 0.5, 0.85]) fx.burst('puff', opening[0] + opening[2] * fx0, deckY - 6, { count: 3, spread: 50, scale: 0.55 });
      flying = false;
      startAmbience(next);
    });
    if (how === 'rope') stats.ropePulls++;
    return true;
  }

  // Ambience: a few plays of the scene's sound, a few particles; finite.
  let amb = null;    // {scene, handles, timers}
  const stageOnScreen = () => {
    try { const v = stage.visibleWorld(); return v.right > opening[0] + 60 && v.left < opening[0] + opening[2] - 60; } catch { return true; }
  };
  function startAmbience(scene) {
    stopAmbience('restart');
    const A = AMBIENCE[scene];
    if (!A || !stageOnScreen()) return false;
    const me = amb = { scene, handles: [], timers: new Set(), t0: Date.now() };
    stats.ambience.started++;
    stats.ambience.why = null;
    const T = (ms, fn) => { const t = later(ms, () => { me.timers.delete(t); if (amb === me) fn(); }); me.timers.add(t); };
    for (let k = 0; k * AMBIENCE_EVERY < AMBIENCE_MS - 1500; k++) {
      T(k * AMBIENCE_EVERY, () => {
        const h = sfx.play(A.sound, { gain: A.gain });
        stats.ambience.sounds++;
        if (h) me.handles.push(h);
      });
    }
    for (let t = 300; t < AMBIENCE_MS - 1400; t += AMBIENCE_TICK) {
      T(t, () => { const bits = ambientBits(A.fx, sceneBox); stats.ambience.particles += bits.length; emit(bits); });
    }
    T(AMBIENCE_MS, () => stopAmbience('done'));
    return true;
  }
  function stopAmbience(why = 'stop') {
    const a = amb;
    if (!a) return;
    amb = null;
    for (const t of a.timers) { clearTimeout(t); timers.delete(t); }
    a.timers.clear();
    for (const h of a.handles) { try { h.stop(); } catch { /* finished */ } }
    stats.ambience.stopped++;
    stats.ambience.why = why;
  }
  const offCam = stage.onChange((_, why) => {
    if (amb && (why === 'camera' || why === 'settle') && !stageOnScreen()) stopAmbience('offscreen');
  });

  // The fly rope: tap it, or pull it down.
  const ropeEl = room.art.get('hit:fly-rope');
  const ropeBody = ropeEl ? ropeEl.querySelector('.fly-rope-body') : null;
  const ropeTug = () => { if (ropeBody && !reduced()) tween.animate(ropeBody, [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(0, 34px, 0)', offset: 0.35 }, { transform: 'translate3d(0, -6px, 0)', offset: 0.7 }, { transform: 'translate3d(0, 0, 0)' }], { duration: 520, easing: 'ease-out' }); };
  if (ropeEl) {
    let pulled = false;
    input.register(ropeEl, {
      pan: false,
      onTap() { ropeTug(); fly('rope'); },
      onDragStart() { pulled = false; return true; },
      onDragMove(info) {
        if (ropeBody) ropeBody.style.transform = `translate3d(0, ${r1(Math.max(0, Math.min(60, info.dy)))}px, 0)`;
        if (!pulled && info.dy > 55) { pulled = true; fly('rope'); }
      },
      onDragEnd() { if (ropeBody) ropeBody.style.transform = ''; ropeTug(); },
    });
  }

  // ---------------------------------------------------------------------
  // Effects
  const lastFire = {};
  const hold = (pid, variant, ms) => { setOverride(pid, variant); later(ms, () => setOverride(pid, null)); };
  const bodyOf = (pid) => { const c = copiesOf(pid); return c ? c[0].body : null; };
  function crowd() { return audience(); }

  function fire(effect) {
    const now = Date.now();
    if (now - (lastFire[effect] || 0) < 700) return false;
    lastFire[effect] = now;
    stats.effects[effect]++;
    if (effect === 'fog') {
      hold('fog-machine', 'on', 3400);
      const b = bodyOf('fog-machine');
      if (b) tween.squish(b, { amount: 0.35 });
      play('swoosh', { pitch: 0.55, gain: 0.55 });
      later(500, () => play('whoosh', { pitch: 0.45, gain: 0.35 }));
      emit(plan('fog', fxRig));
      later(900, () => {
        const c = crowd();
        if (!c.length) return;
        stats.reactions.ooh++;
        play('ooh', { gain: 0.9 });
        faces(c, [['surprised', 900], ['love', 1200]]);
      });
    } else if (effect === 'confetti') {
      hold('confetti-cannon', 'fire', 700);
      const b = bodyOf('confetti-cannon');
      if (b) tween.squash(b, { amount: 1.2 });
      play('pop', { pitch: 0.55, gain: 0.9 });
      later(60, () => play('sparkle', { gain: 0.6 }));
      emit(plan('confetti', fxRig));
      later(450, () => {
        if (!crowd().length) return;
        stats.reactions.cheer++;
        play('cheer', { gain: 0.6 });
        cheer();
      });
    } else if (effect === 'snow') {
      hold('snow-machine', 'on', 4200);
      const b = bodyOf('snow-machine');
      if (b) tween.wobble(b, { amount: 0.2 });
      play('whoosh', { pitch: 1.5, gain: 0.45 });
      later(400, () => play('sparkle', { gain: 0.45 }));
      later(1900, () => play('sparkle', { gain: 0.35 }));
      emit(plan('snow', fxRig));
      later(700, () => { const c = crowd(); if (!c.length) return; stats.reactions.wheee++; faces(c, [['wheee', 1300], ['happy', 900]]); });
    } else if (effect === 'thunder') {
      hold('thunder-sheet', 'shake', 900);
      const b = bodyOf('thunder-sheet');
      if (b) tween.shake(b, { amount: 0.9, duration: 900 });
      play('thunder', { gain: 1 });
      const calm = reduced();
      if (!calm) {
        flash();
        if (drop) tween.shake(drop.body, { amount: 0.25, duration: 500 });
      }
      later(250, () => {
        const c = crowd();
        if (!c.length) return;
        stats.reactions.gasp++;
        play('gasp', { gain: 0.9 });
        faces(c, [['surprised', 1100]]);
      });
      later(1400, () => {
        const c = crowd();
        if (!c.length) return;
        stats.reactions.laugh++;
        play('laugh', { gain: 0.8 });
        faces(c, [['laughing', 1300], ['happy', 700]]);
      });
    }
    return true;
  }

  // Lightning: a white flash over what is on screen (created for the flash, removed after).
  function flash() {
    let v;
    try { v = stage.visibleWorld(); } catch { v = { left: 0, right: m.width, top: 0, bottom: 1000 }; }
    const el = doc.createElement('div');
    el.className = 'show-flash';
    el.style.cssText = `position:absolute;left:0;top:0;width:${Math.ceil(v.right - v.left + 80)}px;height:${Math.ceil(v.bottom - v.top + 80)}px;background:#FFFFFF;opacity:0;pointer-events:none;transform:translate3d(${Math.floor(v.left - 40)}px, ${Math.floor(v.top - 40)}px, 0)`;
    room.fxLayer.appendChild(el);
    stats.flashes++;
    const a = tween.animate(el, [
      { opacity: 0 }, { opacity: 0.8, offset: 0.08 }, { opacity: 0.1, offset: 0.3 }, { opacity: 0.55, offset: 0.4 }, { opacity: 0 },
    ], { duration: 560, easing: 'linear' });
    tween.done(a).then(() => el.remove());
  }

  function onPieceTap(pid, copy = 0) {
    if (pid === 'backdrop') { fly('tap'); return true; }
    if (pid === 'spotlight') { cycle(lamp[copy] || lamp[0]); return true; }
    const effect = EFFECT_OF[pid];
    if (!effect) return false;
    if (pid.indexOf('fx-') === 0) {
      hold(pid, 'down', 260);
      play('tap', { pitch: 0.8 + EFFECTS.indexOf(effect) * 0.1 });
      const b = bodyOf(pid);
      if (b) tween.squish(b, { amount: 0.6 });
    }
    fire(effect);
    return true;
  }

  return {
    owns: (pid) => pid === 'spotlight',
    render(props) { renderSpots(props); },
    onPieceTap,
    onMove,
    fire,
    fly,
    cycle: (i) => cycle(lamp[i]),
    shineAll,
    ambience: { start: startAmbience, stop: stopAmbience, running: () => (amb ? amb.scene : null) },
    rope: () => ropeEl,
    state() {
      const props = fprops();
      return {
        spots: lamp.map((L) => ({ copy: L.i, x: L.x, color: colorOf(props, L.i), shown: L.color, dragging: !!L.drag })),
        perm: spotPerm(props.spots, rest.length).join(''),
        backdrop: pieceState('backdrop'),
        flying,
        ambience: amb ? amb.scene : null,
        fx: pool.stats(),
        timers: timers.size,
      };
    },
    stats: () => JSON.parse(JSON.stringify(stats)),
    destroy() {
      destroyed = true;
      stopAmbience('destroy');
      offCam();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const L of lamp) input.unregister(L.c.hit);
      if (ropeEl) input.unregister(ropeEl);
      pool.clear();
    },
  };
}
