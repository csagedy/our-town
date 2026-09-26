// The construction site's WORKSHOP (P2c.4, docs/design.md 3.3 #8, #9, #11,
// #13, #17, #18): Ian's tool bench, the cement mixer, cones, lunch and the
// seesaw. Mounted by src/scenes/site.js next to the rigs and the dig pit.
// Rules (pure) are in src/core/workshop.js.
//
//   const shop = createSiteShop({ stage, store, input, room, fx, manifest, catalog, pieces, later, site });
//   const hooks = shop.hooks(otherHooks);   // before createRoomView (outermost)
//   shop.bind(view, chars);                 // after it
//
// - PEGBOARD: the saw, the hammer and the wrench hang on their chalk outlines
//   on the tool wall (hanging = the exact hang spot, a `move`; drawn smaller
//   and turned to fit the outline). Drag one off; while it is carried near its
//   outline the outline glows; let go near it and it snaps home with a click
//   and a sparkle (a gentle tidy-up game).
// - SAW: put a plank (or a steel beam) on the workbench over the saw table:
//   it slides onto the table. Drag the saw back and forth over it: zzzt,
//   sawdust, the plank shivers; after CUT_STROKES strokes it is cut: ONE
//   `combine` turns it into the first piece and a `spawn` makes the second
//   (a plank: two half planks; a beam: a plank and a half plank), which hop
//   apart. Same colour.
// - DRILL: tap it: on (whirr) or off. Carry a drill that is on over a build
//   piece (or drop it on one): whirr, the piece gets a bolt (props.bolt, a
//   hex bolt head spins in) and is locked like the hammer's nail.
// - PAINT: the brush and the cans are site.js's (P2c.1).
// - CEMENT MIXER: drop a dirt pile (or tip a loaded wheelbarrow) at the
//   drum's mouth: it goes in (props.mixerLoad, `inc`). A spraying hose at the
//   mouth adds water (a splash; props.mixerWater). Tap the drum: it churns
//   through its four spin frames (rumble, sloshing); with dirt in it the
//   cement is then ready (a grey glop at the mouth). Tap again: the drum tips
//   and pours a CEMENT SLAB (kind 'cement-slab': the plank's grid footprint,
//   drawn grey until painted) at the pour spot; drag it onto the build deck:
//   a foundation piece. The spin/pour animation is a plan prop
//   (props.mixerPlay) that every iPad plays.
// - CONES: a tap knocks a standing cone over (clonk) and the cones next to it
//   fall like dominoes; a tap on a fallen one stands it up. Drag them
//   anywhere. The dump truck or the excavator driven through a cone knocks
//   it over (site-dig.js calls onDrive).
// - LUNCH: the lunchbox opens and shuts (catalog toggle + container); a tap on
//   the thermos pours a little cup of cocoa (a 'cafe-cup' with fill 'cocoa';
//   drop it on someone and they sip it, the eat verb).
// - SEESAW: a plank (or beam) on the build grid resting on a block under its
//   middle only (both ends free) is a seesaw: it tips toward the side with
//   more riders standing on it (drawn: the plank turns, the riders move with
//   it); when it tips over, whoever goes up goes "wheee". Nothing is stored:
//   it is worked out from positions, the same on both iPads.
// Not built (no art): the vehicle-builder cart (no wheel art), the paint
// roller. Everything is store ops; at rest nothing runs (timers only during
// an animation).

import * as tween from '../engine/tween.js';
import { getEntity, inRoom } from '../engine/world.js';
import { settle } from '../engine/surfaces.js';
import {
  PEG, PEG_KINDS, isHung, pegNear, sawStart, sawStep, CUT_STROKES, sawInto, cutLayout, sawTable, onSawTable,
  MIXER_MAX, mixerAction, mixerRoom, atMouth, mouthAt, conesInPath, dominoChain, seesawsOf, ridersOf, seesawAngle, seesawDrop,
} from '../core/workshop.js';

export const SHOP_PIECES = ['mixer-drum'];
export const SLAB_KIND = 'cement-slab';
export const CUP_KIND = 'cafe-cup';
export const CUP_CAP = 4;                 // cocoa cups around the site before the thermos only glugs
const CONE = 'traffic-cone';
const DRUM_PAD = [2650, 695, 225, 160];   // world box over the drum (its picture box is 450 x 360)
const SAWDUST = '#E8C99A';
const CEMENT = '#A9A6AE';
const r1 = (v) => Math.round(v * 10) / 10;

const BOLT_HTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 L21.1 6.75 L21.1 17.25 L12 22.5 L2.9 17.25 L2.9 6.75 Z" fill="#B9B4BD" stroke="#433E46" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="4.2" fill="#8E8994" stroke="#433E46" stroke-width="1.6"/><path d="M7 7.5 L10 6" stroke="#F4F2F6" stroke-width="2" stroke-linecap="round"/></svg>';
const GLOP = (color) => `<svg viewBox="0 0 44 64" width="44" height="64" aria-hidden="true"><g transform="rotate(-28 22 32)"><ellipse cx="22" cy="32" rx="8" ry="24" fill="${color}" stroke="#3D2C29" stroke-width="2"/><path d="M18 22 q4 -3 7 1 M18 38 q4 -3 7 1" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2" stroke-linecap="round"/></g><path d="M14 52 q-2 8 3 10 q5 1 4 -8 Z" fill="${color}" stroke="#3D2C29" stroke-width="1.6"/></svg>`;

export function createSiteShop({ stage, store, input, room, fx, manifest, catalog, pieces, later, site }) {
  const m = manifest.rooms.site;
  const SITE_ID = room.id;
  const table = sawTable(m);
  const mixerRig = m.rigs.mixer;
  const pour = mixerRig ? mixerRig.pour : [2658.6, 903];
  const mouth = mouthAt(m);
  const drumDef = m.pieces['mixer-drum'];
  let view = null;
  let chars = null;
  const stats = { hangs: 0, strokes: 0, cuts: 0, bolts: 0, fills: 0, waters: 0, spins: 0, pours: 0, knocks: 0, stands: 0, cups: 0, seesaws: 0, tips: 0 };
  const play = (name, o) => { if (view) view.play(name, o); };
  const viewOf = (id) => (view ? view.viewOf(id) : null);
  const top = () => inRoom(store.state, SITE_ID);
  const fixtures = () => site.fixtures();
  const fprops = () => { const f = fixtures(); return f ? f.props : {}; };
  const setFix = (key, value) => { const f = fixtures(); if (f && f.props[key] !== value) store.dispatch('set', { id: f.id, path: 'props.' + key, value }); };
  const incFix = (key, by) => { const f = fixtures(); if (f && by) store.dispatch('inc', { id: f.id, path: 'props.' + key, by }); };
  const propOf = (kind) => { const k = catalog.get(kind); return k && k.art ? manifest.props[k.art.sprite] || null : null; };
  const isBuild = (e) => site.isBuild(e);
  const drillOn = (e) => !!e && e.kind === 'drill' && !!e.props.on;
  const center = (id) => { const v = viewOf(id); return v && v.sprite ? { x: v.x, y: v.y - v.sprite.h * v.scale * 0.5, w: v.sprite.w * v.scale } : null; };
  const bench = () => site.surface('workbench');
  const hangKey = () => { const b = bench(); return (b ? b.depth : 728) + 0.4; };

  // ---------------------------------------------------------------------------
  // Drawing extras: hung tools, bolts, the grey slab

  // Elements this module styled (pooled elements are reused for other entities).
  const styled = new Set();
  function styleBody(v, rot, flip) {
    const b = v.body;
    const r = rot ? rot + 'deg' : '';
    const s = flip ? '1 -1' : '';
    if (b.style.rotate !== r) b.style.rotate = r;
    if (b.style.scale !== s) b.style.scale = s;
    if (r || s) styled.add(v.el); else styled.delete(v.el);
  }
  function showBolt(e, v) {
    const lift = v.lift;
    let n = lift.querySelector(':scope > .site-bolt');
    const on = isBuild(e) && !!e.props.bolt;
    if (!on) { if (n) n.style.visibility = 'hidden'; return; }
    if (!n) {
      n = document.createElement('div');
      n.className = 'site-bolt';
      n.style.cssText = 'position:absolute;left:50%;top:50%;width:24px;height:24px;margin-left:-12px;margin-top:-16px;z-index:61;pointer-events:none';
      n.innerHTML = BOLT_HTML;
      lift.appendChild(n);
    }
    n.style.visibility = '';
    const nail = lift.querySelector(':scope > .site-nail');
    if (nail) nail.style.visibility = 'hidden';     // a bolt instead of a nail
  }

  const slabSprites = new Map();
  function slabSprite(base) {
    let s = slabSprites.get(base.key);
    if (!s) { s = Object.assign({}, base, { key: base.key + ':cement', filter: [base.filter, 'grayscale(1) brightness(1.02) contrast(0.9)'].filter(Boolean).join(' ') }); slabSprites.set(base.key, s); }
    return s;
  }

  // ---------------------------------------------------------------------------
  // Pegboard

  const hangTaken = (kind, exceptId) => top().some((e) => e.id !== exceptId && e.kind === kind && isHung(e));

  function hang(e, v) {
    const s = PEG[e.kind];
    const from = v.transform;
    if (!store.dispatch('move', { id: e.id, room: SITE_ID, x: s.x, y: s.y, z: 0 })) return false;
    stats.hangs++;
    if (!view.repaint(e.id)) return true;
    const to = v.transform;
    if (v.posAnim) v.posAnim.cancel();
    if (from !== to) v.posAnim = tween.slide(v.el, from, to, { duration: 160 });
    later(150, () => {
      play('clink', { pitch: 1.3 });
      play('knock', { pitch: 1.5, gain: 0.6 });
      const b = s.box;
      fx.burst('sparkle', (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, { count: 7, spread: 70 });
      if (!v.held) tween.wobble(v.body, { amount: 0.3, duration: 500 });
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Saw

  const sawG = new Map();          // saw id -> {st, target}
  function sawTarget(x, y) {
    for (const e of top()) {
      if (!onSawTable(table, e.x, e.y) || !sawInto(e.kind, propOf(e.kind))) continue;
      const v = viewOf(e.id);
      if (!v || v.held || !v.sprite) continue;
      const hw = (v.sprite.w * v.scale) / 2 + 30;
      if (x >= e.x - hw && x <= e.x + hw && y >= e.y - 80 && y <= e.y + 40) return e;
    }
    return null;
  }
  function sawMove(saw) {
    const v = viewOf(saw.id);
    if (!v) return;
    let g = sawG.get(saw.id);
    const target = sawTarget(v.x, v.y);
    if (!target) { if (g) g.st = sawStart(v.x); return; }
    if (!g || g.target !== target.id) { g = { st: sawStart(v.x), target: target.id }; sawG.set(saw.id, g); }
    const r = sawStep(g.st, v.x);
    g.st = r.st;
    if (!r.stroke) return;
    stats.strokes++;
    play('zzzt', { pitch: 0.95 + Math.random() * 0.15 });
    const tv = viewOf(target.id);
    fx.burst('bit', v.x - 20, target.y - 8, { count: 4, spread: 50, angle: 90, arc: 90, color: SAWDUST, scale: 0.6 });
    if (tv) tween.shake(tv.body, { amount: 0.25, duration: 220 });
    if (g.st.strokes >= CUT_STROKES) { cut(target); sawG.delete(saw.id); }
  }

  function cut(e) {
    const kinds = sawInto(e.kind, propOf(e.kind));
    if (!kinds) return false;
    const widths = kinds.map((k) => { const c = catalog.get(k); return c ? c.size[0] : 80; });
    const xs = cutLayout(e.x, widths);
    const paint = e.props && e.props.paint;
    const props = (k) => { const p = propOf(k); return paint && p && p.paint && p.paint[paint] ? { paint } : {}; };
    const first = store.newId();
    if (!store.dispatch('combine', { ids: [e.id], resultId: first, resultKind: kinds[0], room: SITE_ID, x: xs[0], y: e.y, z: e.z || 0, props: props(kinds[0]) })) return false;
    const ids = [first];
    for (let i = 1; i < kinds.length; i++) {
      const id = store.newId();
      store.dispatch('spawn', { id, kind: kinds[i], room: SITE_ID, x: xs[i], y: e.y, z: (e.z || 0) + i, props: props(kinds[i]) });
      ids.push(id);
    }
    stats.cuts++;
    play('crack', { pitch: 1.2 });
    later(90, () => play('clack', { pitch: 1.1 }));
    fx.burst('bit', e.x, e.y - 10, { count: 10, spread: 90, angle: -90, arc: 160, color: SAWDUST, stagger: 15 });
    ids.forEach((id, i) => { const c = viewOf(id); if (c) view.animateFrom(id, r1(e.x + (i ? 6 : -6)), e.y - 26); });
    return true;
  }

  // Put a sawable piece that lands on the workbench squarely onto the saw table.
  function toTable(e) {
    if (!onSawTable(table, e.x, e.y) || Math.abs(e.x - table.cx) < 0.5 || !sawInto(e.kind, propOf(e.kind))) return;
    if (top().some((q) => q.id !== e.id && onSawTable(table, q.x, q.y) && sawInto(q.kind, propOf(q.kind)))) return;   // one at a time
    later(160, () => {
      const cur = getEntity(store.state, e.id);
      const v = viewOf(e.id);
      if (!cur || !v || v.held || !onSawTable(table, cur.x, cur.y)) return;
      store.dispatch('move', { id: e.id, room: SITE_ID, x: table.cx, y: table.y, z: cur.z || 0 });
      play('clunk', { pitch: 1.2, gain: 0.6 });
    });
  }

  // ---------------------------------------------------------------------------
  // Drill

  const drillOver = new Map();
  let whirrAt = 0;
  function bolt(target) {
    const v = viewOf(target.id);
    const was = !!target.props.bolt;
    if (!was) store.dispatch('set', { id: target.id, path: 'props.bolt', value: true });
    if (!target.props.locked) store.dispatch('set', { id: target.id, path: 'props.locked', value: true });
    if (!was) stats.bolts++;
    play('whirr', { pitch: 1.3, gain: 0.8 });
    later(160, () => play('clink', { pitch: 0.9 }));
    const c = center(target.id);
    if (c) fx.burst('sparkle', c.x, c.y - 6, { count: 6, spread: Math.max(50, c.w * 0.6) });
    if (v) {
      tween.squash(v.body, { amount: 0.5 });
      const b = v.lift.querySelector(':scope > .site-bolt');
      if (b) tween.animate(b, [{ transform: 'rotate(0deg) scale(1.6)' }, { transform: 'rotate(540deg) scale(1)' }], { duration: 520, easing: 'ease-out' });
    }
    return true;
  }
  function drillMove(d) {
    const dv = viewOf(d.id);
    if (!dv) return;
    const now = performance.now();
    if (now - whirrAt > 1100) { whirrAt = now; play('whirr', { gain: 0.45 }); }
    // The bit is at the drill's left tip.
    const x = dv.x - dv.sprite.w * dv.scale * 0.4, y = dv.y - dv.sprite.h * dv.scale * 0.8;
    let hit = null;
    for (const id of view.ids()) {
      const e = getEntity(store.state, id);
      if (!e || !isBuild(e)) continue;
      const v = viewOf(id);
      if (!v || v.held) continue;
      const hw = (v.sprite.w * v.scale) / 2;
      if (x >= v.x - hw - 16 && x <= v.x + hw + 16 && y >= v.y - v.sprite.h * v.scale - 16 && y <= v.y + 16) hit = e;
    }
    const was = drillOver.get(d.id) || null;
    const nowId = hit ? hit.id : null;
    if (was === nowId) return;
    drillOver.set(d.id, nowId);
    if (hit && !hit.props.bolt) bolt(hit);
  }

  // ---------------------------------------------------------------------------
  // Cement mixer

  const drum = () => pieces.get('mixer-drum') || null;
  let glop = null;
  function showGlop() {
    const p = drum();
    if (!p) return;
    const f = fprops();
    const load = f.mixerLoad | 0;
    const want = load > 0 ? (f.mixerReady ? 'ready' : 'dirt') : '';
    if (!glop) {
      if (!want) return;
      glop = document.createElement('div');
      glop.className = 'mixer-glop';
      glop.style.cssText = `position:absolute;left:${r1(mouth[0] - drumDef.x - 22)}px;top:${r1(mouth[1] - drumDef.y - 32)}px;width:44px;height:64px;pointer-events:none`;
      p.body.appendChild(glop);
    }
    if (glop.dataset.state === want) return;
    glop.dataset.state = want;
    glop.innerHTML = want ? GLOP(want === 'ready' ? CEMENT : '#B98A62') : '';
  }

  function fillMixer(n, x, y, what) {
    const load = fprops().mixerLoad | 0;
    const add = mixerRoom(load, n);
    if (!add) { play('boing', { pitch: 0.8 }); return 0; }
    incFix('mixerLoad', add);
    if (fprops().mixerReady) setFix('mixerReady', false);
    stats.fills++;
    play('thud', { pitch: 0.8 });
    later(110, () => play('slide', { gain: 0.5 }));
    fx.burst('bit', mouth[0], mouth[1] - 6, { count: 6, spread: 50, angle: -90, arc: 140, color: '#8E5E3C' });
    const p = drum();
    if (p) tween.squash(p.body, { amount: 0.3 });
    void x; void y; void what;
    return add;
  }
  function water() {
    if (!fprops().mixerWater) { setFix('mixerWater', true); stats.waters++; }
    play('splash', { pitch: 1.1 });
    later(150, () => play('bubble', { pitch: 0.8 }));
    fx.burst('drop', mouth[0], mouth[1], { count: 8, spread: 50, angle: -90, arc: 120 });
  }

  let spinUntil = 0;
  function tapDrum() {
    if (performance.now() < spinUntil) return;
    const f = fixtures();
    if (!f) return;
    const act = mixerAction(f.props);
    const seq = store.device + ':' + Date.now().toString(36);
    if (act === 'pour') {
      const load = f.props.mixerLoad | 0;
      const id = store.newId();
      const r = settle(room.def, { x: pour[0], y: pour[1], halfW: 84 });
      store.dispatch('spawn', { id, kind: SLAB_KIND, room: SITE_ID, x: r1(r.x), y: r1(r.y), z: 0, props: {} });
      incFix('mixerLoad', -load);
      setFix('mixerReady', false);
      setFix('mixerWater', false);
      stats.pours++;
      setFix('mixerPlay', { seq, kind: 'pour', slab: id });
      return;
    }
    if (act === 'mix') setFix('mixerReady', true);
    stats.spins++;
    setFix('mixerPlay', { seq, kind: act === 'mix' ? 'mix' : 'rattle', wet: !!f.props.mixerWater });
  }

  let playSeq = null;
  function playMixer(plan) {
    if (!plan || plan.seq === playSeq) return;
    playSeq = plan.seq;
    const p = drum();
    if (plan.kind === 'pour') {
      spinUntil = performance.now() + 1600;
      if (p) {
        tween.animate(p.body, [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-20deg)', offset: 0.25, easing: 'ease-in' },
          { transform: 'rotate(-20deg)', offset: 0.7 },
          { transform: 'rotate(0deg)' },
        ], { duration: 1500, easing: 'ease-out' });
      }
      play('clunk', { pitch: 0.8 });
      later(300, () => play('slide', { gain: 0.8 }));
      later(420, () => play('squish', { pitch: 0.7 }));
      for (let k = 0; k < 5; k++) later(330 + k * 130, () => fx.burst('bit', mouth[0] - 6, mouth[1] + 8 + k * 14, { count: 4, spread: 36, angle: 90, arc: 40, color: CEMENT, stagger: 25 }));
      const v = plan.slab ? viewOf(plan.slab) : null;
      if (v) {
        tween.animate(v.body, [
          { transform: 'scale(0.15, 0.2)' },
          { transform: 'scale(1.08, 1.15)', offset: 0.7 },
          { transform: 'scale(1, 1)' },
        ], { duration: 700, delay: 480, easing: 'ease-out', fill: 'backwards' });
        later(1000, () => { play('thud', { pitch: 0.7 }); fx.burst('puff', v.x, v.y - 6, { count: 5, spread: 110, scale: 0.55 }); });
      }
      return;
    }
    // Spin: the four drum frames round and round (sloshing when there is something in it).
    const frames = mixerRig ? mixerRig.frames : ['spin0', 'spin1', 'spin2', 'spin3'];
    const ms = Math.round(1000 / ((mixerRig && mixerRig.fps) || 12));
    const n = plan.kind === 'rattle' ? 10 : 20;
    spinUntil = performance.now() + n * ms + 80;
    play('rumble', { gain: 0.8, pitch: 1.1 });
    if (plan.kind === 'mix') { later(200, () => play('slide', { gain: 0.6 })); later(700, () => play('slide', { gain: 0.5, pitch: 1.2 })); }
    else later(150, () => play('clatter', { gain: 0.4, pitch: 1.4 }));
    if (plan.wet) later(400, () => play('bubble', { pitch: 0.7 }));
    for (let i = 1; i <= n; i++) later(i * ms, () => site.showPiece('mixer-drum', i === n ? null : frames[i % frames.length]));
    if (p) tween.shake(p.body, { amount: 0.25, duration: n * ms });
    later(n * ms, () => {
      if (plan.kind === 'mix') { play('bubble', { pitch: 0.6 }); fx.burst('puff', mouth[0], mouth[1] - 10, { count: 4, spread: 40, scale: 0.5 }); }
      else fx.burst('puff', mouth[0], mouth[1] - 10, { count: 3, spread: 30, scale: 0.4 });
    });
  }

  // ---------------------------------------------------------------------------
  // Cones

  const conesNow = () => top().filter((e) => e.kind === CONE).map((e) => ({ id: e.id, x: e.x, y: e.y, down: !!e.props.down }));
  function knock(id, dir, delay = 0, { hard = false } = {}) {
    const e = getEntity(store.state, id);
    if (!e || e.props.down) return false;
    store.dispatch('set', { id, path: 'props.down', value: true });
    stats.knocks++;
    later(delay, () => {
      const v = viewOf(id);
      play('clunk', { pitch: 1.3 + Math.random() * 0.2, gain: hard ? 1 : 0.7 });
      later(70, () => play('boing', { pitch: 1.5, gain: 0.5 }));
      if (v && !v.held) {
        tween.animate(v.lift, [
          { transform: 'translate3d(0px, 0px, 0px) rotate(0deg)' },
          { transform: `translate3d(${dir * 12}px, -26px, 0px) rotate(${dir * 30}deg)`, offset: 0.4, easing: 'ease-in' },
          { transform: 'translate3d(0px, 0px, 0px) rotate(0deg)' },
        ], { duration: 420, easing: 'ease-out' });
        fx.burst('puff', v.x, v.y - 8, { count: 3, spread: 40, scale: 0.45 });
      }
    });
    return true;
  }
  function knockChain(id, dir, { hard = false } = {}) {
    const all = conesNow();
    if (!knock(id, dir, 0, { hard })) return 0;
    const chain = dominoChain(all, id, dir || 1);
    for (const c of chain) knock(c.id, dir || 1, c.step * 150);
    return 1 + chain.length;
  }
  function coneTap(e) {
    const v = viewOf(e.id);
    if (e.props.down) {
      store.dispatch('set', { id: e.id, path: 'props.down', value: false });
      stats.stands++;
      play('squeak', { pitch: 1.2 });
      if (v) tween.squish(v.body, { amount: 0.8 });
      return true;
    }
    play('squeak', { pitch: 1 });
    knockChain(e.id, 1);
    return true;
  }

  /** A vehicle drove over [x0, x1] toward dir: standing cones in its way fall over. */
  function onDrive(x0, x1, dir) {
    const hit = conesInPath(conesNow(), x0, x1);
    for (const id of hit) knockChain(id, dir || 1, { hard: true });
    return hit.length;
  }

  // ---------------------------------------------------------------------------
  // Lunch: the thermos pours cocoa

  function thermosTap(e) {
    const v = viewOf(e.id);
    if (v) {
      tween.animate(v.body, [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(55deg)', offset: 0.35, easing: 'ease-in' },
        { transform: 'rotate(55deg)', offset: 0.65 },
        { transform: 'rotate(0deg)' },
      ], { duration: 820, easing: 'ease-out' });
    }
    const cups = top().filter((q) => q.kind === CUP_KIND).length;
    if (cups >= CUP_CAP) { play('bubble', { pitch: 0.7 }); return true; }
    const s = site.surfaceAt(e.x, e.y);
    const w = catalog.has(CUP_KIND) ? catalog.get(CUP_KIND).size[0] : 63;
    let x = e.x + 50;
    if (s && x + w / 2 > s.x1) x = e.x - 50;
    const r = settle(room.def, { x, y: e.y, halfW: w / 2 });
    const id = store.newId();
    store.dispatch('spawn', { id, kind: CUP_KIND, room: SITE_ID, x: r1(r.x), y: r1(r.y), z: 0, props: { fill: 'cocoa' } });
    stats.cups++;
    play('pour', { pitch: 1.1 });
    later(420, () => play('bubble', { pitch: 1.1 }));
    view.animateFrom(id, r1(e.x + (x > e.x ? 20 : -20)), r1(e.y - 50));
    later(600, () => fx.burst('puff', r.x, r.y - 50, { count: 3, spread: 24, scale: 0.35 }));
    return true;
  }

  // ---------------------------------------------------------------------------
  // Seesaw

  const tilts = new Map();          // plank id -> angle drawn
  const moved = new Map();          // rider id -> drop drawn
  function riders() {
    const out = [];
    for (const e of top()) if (!isBuild(e) && !e.parent) out.push({ id: e.id, x: e.x, y: e.y });
    return out;
  }
  function applySeesaws() {
    if (!view) return;
    const list = seesawsOf(site.grid, site.placed());
    const things = list.length ? riders() : [];
    const seen = new Set();
    const onNow = new Map();
    for (const ss of list) {
      const rs = ridersOf(ss, things).filter((t) => { const v = viewOf(t.id); return v && !v.held; });
      const deg = seesawAngle(ss, rs);
      seen.add(ss.id);
      const v = viewOf(ss.id);
      const was = tilts.get(ss.id) || 0;
      if (v && !v.held) setRot(v, deg);
      tilts.set(ss.id, deg);
      for (const t of rs) onNow.set(t.id, seesawDrop(ss, deg, t.x));
      if (deg !== was && deg !== 0) {
        stats.seesaws++;
        play('knock', { pitch: 0.8 });
        // Whoever goes up: wheee.
        const up = rs.filter((t) => (t.x - ss.pivot) * deg < 0);
        if (up.length) {
          play('whoosh', { pitch: 1.3 });
          later(200, () => play('giggle', { pitch: 1.1 }));
        }
        for (const t of up) {
          const rv = viewOf(t.id);
          if (chars && getEntity(store.state, t.id) && getEntity(store.state, t.id).kind === 'char') chars.face(t.id, [['wheee', 900], ['laughing', 900]]);
          if (rv) tween.animate(rv.body, [{ transform: 'translate3d(0px, 0px, 0px)' }, { transform: 'translate3d(0px, -60px, 0px)', offset: 0.4, easing: 'ease-out' }, { transform: 'translate3d(0px, 0px, 0px)' }], { duration: 700, easing: 'ease-in' });
        }
      }
    }
    for (const [id] of tilts) {
      if (seen.has(id)) continue;
      tilts.delete(id);
      const v = viewOf(id);
      if (v) setRot(v, 0);
    }
    for (const [id] of moved) if (!onNow.has(id)) { const v = viewOf(id); if (v) setDrop(v, 0); moved.delete(id); }
    for (const [id, dy] of onNow) { const v = viewOf(id); if (v && !v.held) setDrop(v, dy); moved.set(id, dy); }
  }
  function setRot(v, deg) {
    const want = deg ? deg + 'deg' : '';
    if (v.body.style.rotate === want) return;
    v.body.style.transition = 'rotate 260ms ease-out';
    v.body.style.rotate = want;
    if (want) styled.add(v.el);
  }
  function setDrop(v, dy) {
    const want = dy ? `0px ${dy}px` : '';
    if (v.lift.style.translate === want) return;
    v.lift.style.transition = 'translate 260ms ease-out';
    v.lift.style.translate = want;
    if (want) styled.add(v.el);
  }
  function clearStyles(v) {
    if (!styled.has(v.el)) return;
    styled.delete(v.el);
    for (const el of [v.body, v.lift]) { el.style.rotate = ''; el.style.scale = ''; el.style.translate = ''; el.style.transition = ''; }
  }

  // ---------------------------------------------------------------------------
  // View hooks

  function hooks(base) {
    return Object.assign({}, base, {
      spriteOf(e) {
        const s = base.spriteOf ? base.spriteOf(e) : null;
        if (e.kind !== SLAB_KIND || (e.props.paint && e.props.paint !== 'natural')) return s;
        return slabSprite(s || catalog.sprite(e.kind));
      },
      sortKeyOf: (e) => (isHung(e) ? hangKey() : base.sortKeyOf ? base.sortKeyOf(e) : null),
      scaleOf: (e) => (isHung(e) ? PEG[e.kind].scale : base.scaleOf ? base.scaleOf(e) : null),
      dropTarget(item, other) {
        if (drillOn(item) && isBuild(other)) return true;
        return base.dropTarget ? base.dropTarget(item, other) : false;
      },
      onDropInto(item, target, ctx) {
        if (drillOn(item) && isBuild(target)) { bolt(target); return true; }
        return base.onDropInto ? base.onDropInto(item, target, ctx) : false;
      },
      dropSpot(e, x, y) {
        if (PEG[e.kind] && !e.parent && pegNear(e.kind, x, y) && !hangTaken(e.kind, e.id)) {
          const b = PEG[e.kind].box;
          return { id: 'peg-' + e.kind, x0: b[0] - 8, x1: b[2] + 8, y: b[3] + 4, depth: hangKey() };
        }
        return base.dropSpot ? base.dropSpot(e, x, y) : null;
      },
      onDragStart(e, ctx) {
        const v = viewOf(e.id);
        if (v) clearStyles(v);
        if (base.onDragStart) base.onDragStart(e, ctx);
        if (e.kind === 'saw') sawG.delete(e.id);
        if (e.kind === 'drill') drillOver.delete(e.id);
      },
      onDragMove(e, ctx) {
        if (base.onDragMove) base.onDragMove(e, ctx);
        if (e.kind === 'saw') sawMove(e);
        else if (drillOn(getEntity(store.state, e.id) || e)) drillMove(e);
        else if (e.kind === 'hose' && e.props.spray) {
          const v = viewOf(e.id);
          if (v && atMouth(m, v.x + v.sprite.w * v.scale * 0.45, v.y - v.sprite.h * v.scale * 0.5) && !fprops().mixerWater) water();
        }
      },
      onDrop(e, ctx) {
        const v = viewOf(e.id);
        if (e.kind === 'saw') sawG.delete(e.id);
        if (v && PEG[e.kind] && !e.parent && pegNear(e.kind, v.x, v.y) && !hangTaken(e.kind, e.id) && hang(e, v)) return true;
        if (v && atMouth(m, v.x, v.y)) {
          if (e.kind === 'dirt-pile') {
            const n = Math.max(1, Math.round(e.props.size) || 1);
            if (fillMixer(n, v.x, v.y, 'pile')) {
              fx.burst('puff', v.x, v.y - 10, { count: 4, spread: 50, scale: 0.5 });
              store.dispatch('remove', { id: e.id, hard: true });
              return true;
            }
          } else if (e.kind === 'wheelbarrow' && e.props.load === 'dirt') {
            if (fillMixer(3, v.x, v.y, 'barrow')) store.dispatch('set', { id: e.id, path: 'props.load', value: 'empty' });
          } else if (e.kind === 'hose' && e.props.spray) water();
        }
        return base.onDrop ? base.onDrop(e, ctx) : false;
      },
      onLanded(e, ctx) {
        if (base.onLanded) base.onLanded(e, ctx);
        toTable(e);
      },
      onTap(e, ctx) {
        if (e.kind === CONE) return coneTap(e);
        if (e.kind === 'thermos') return thermosTap(e);
        return base.onTap ? base.onTap(e, ctx) : false;
      },
      onRender(e, ctx) {
        if (base.onRender) base.onRender(e, ctx);
        const v = ctx.view.viewOf(e.id);       // (the first render comes before bind)
        if (!v) return;
        if (isHung(e)) styleBody(v, PEG[e.kind].rot, PEG[e.kind].flip);
        else if (!tilts.has(e.id) && !moved.has(e.id)) clearStyles(v);
        if (isBuild(e) || v.lift.querySelector(':scope > .site-bolt')) showBolt(e, v);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Store

  const unsubscribe = store.subscribe((st, env) => {
    showGlop();
    if (env && env.op === 'set') {
      const f = fixtures();
      if (f && env.args.id === f.id && env.args.path === 'props.mixerPlay' && env.args.value && typeof env.args.value === 'object') playMixer(env.args.value);
    }
    if (!env || ['move', 'spawn', 'remove', 'combine', 'attach', 'detach', 'travel', 'set'].includes(env.op)) applySeesaws();
  });

  // First time the workshop code sees this world: tools on the pegboard, a drill, a plank on the saw table, a few cones.
  function seed() {
    const f = fixtures();
    if (!f || f.props.shopSeeded) return;
    const spawn = (kind, x, y, props) => { if (catalog.has(kind)) store.dispatch('spawn', { id: store.newId(), kind, room: SITE_ID, x: r1(x), y: r1(y), z: 0, ...(props ? { props } : {}) }); };
    spawn('saw', PEG.saw.x, PEG.saw.y);
    spawn('wrench', PEG.wrench.x, PEG.wrench.y);
    // The workbench hammer (P2c.1's seed) goes up on its outline.
    const b = bench();
    const h = top().find((e) => e.kind === 'hammer' && b && Math.abs(e.y - b.y) < 0.5 && e.x > b.x0 && e.x < b.x1);
    if (h && !isHung(h)) store.dispatch('move', { id: h.id, room: SITE_ID, x: PEG.hammer.x, y: PEG.hammer.y, z: 0 });
    else if (!h) spawn('hammer', PEG.hammer.x, PEG.hammer.y);
    const low = site.surface('workbench-low');
    if (low) spawn('drill', 2790, low.y);
    spawn('plank', table.cx, table.y);
    for (const [x, y] of [[1590, 930], [1645, 942], [1700, 930]]) spawn(CONE, x, y);
    setFix('shopSeeded', true);
  }

  return {
    SHOP_PIECES,
    hooks,
    onDrive,
    bind(v, c) {
      view = v;
      chars = c;
      seed();
      // The drum's picture box is mostly air (it would cover the drill under the
      // workbench): only a pad over the drum itself takes touches.
      const p = drum();
      if (p) {
        p.el.style.pointerEvents = 'none';
        const pad = document.createElement('div');
        pad.className = 'mixer-hit';
        const [x0, y0, w, h] = DRUM_PAD;
        pad.style.cssText = `position:absolute;left:${r1(x0 - drumDef.x)}px;top:${r1(y0 - drumDef.y)}px;width:${w}px;height:${h}px;pointer-events:auto`;
        p.el.appendChild(pad);
        input.register(p.el, { onTap: tapDrum, pan: true });
      }
      showGlop();
      applySeesaws();
      view.refresh();
    },
    stats: () => Object.assign({}, stats, { spinning: performance.now() < spinUntil }),
    api: {
      table,
      peg: PEG,
      pegKinds: PEG_KINDS,
      hung: () => top().filter((e) => isHung(e)).map((e) => ({ id: e.id, kind: e.kind })),
      mixer: () => { const f = fprops(); return { load: f.mixerLoad | 0, water: !!f.mixerWater, ready: !!f.mixerReady, max: MIXER_MAX, spinning: performance.now() < spinUntil }; },
      tapDrum,
      mouth,
      pour,
      cones: conesNow,
      seesaws: () => seesawsOf(site.grid, site.placed()).map((ss) => Object.assign({}, ss, { angle: tilts.get(ss.id) || 0 })),
      onDrive,
      cut,
    },
    destroy() {
      unsubscribe();
    },
  };
}
