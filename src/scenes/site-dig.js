// The construction site's DIG PIT (P2c.3, docs/design.md 3.3 #5-#7): Ian's
// hole in the ground. Mounted by src/scenes/site.js next to the crane rigs.
//
//   const dig = createSiteDig({ stage, store, input, room, fx, manifest, catalog, pieces, later, site });
//   const hooks = dig.hooks(siteHooks);    // before createRoomView
//   dig.bind(view, chars);                 // after it
//
// THE DIRT (src/engine/digmask.js). The pit's `dirt` piece is drawn into a
// <canvas> (1.5 px per world unit, the art's own resolution) over a mask of
// 2-unit cells on the dig box. Dragging the SPADE (its blade tip) or the
// EXCAVATOR BUCKET through it digs soft round holes; each finger gesture is
// ONE store op (a `dig-stroke` entity: quantized circle centres + a radius)
// and a refill is a fill stroke. After 40 strokes the mask folds into one
// base64 snapshot entity. So the hole is saved, survives a reload exactly and
// is the same on the other iPad, without ever sending pixels. The canvas
// redraws only on the frame after a change (zero idle cost).
//
// TREASURES (manifest site.treasures, seeded in the six treasure slots in a
// fixed layout): drawn UNDER the dirt canvas (sort key 705 < the dirt's 706 <
// the floor band) and not touchable while props.buried. Dig until the dirt
// over one is mostly gone (digsite.UNCOVER, a coverage check on the mask
// under its box) and it is found: `set buried false`, it hops, sparkles,
// ta-da!, and it is a normal prop (drag it anywhere; the chest opens). Put a
// treasure back in the hole and fill it in: buried again. A pit filled right
// back up with nothing left in it gets two new treasures (picked before
// dispatch, so the ops carry them).
//
// WHERE THE DIRT GOES. A spade holds one scoop, the bucket two, a
// wheelbarrow three, the truck up to eight. Full things show it (spade: a
// clump; bucket, wheelbarrow, truck bed: their `full`/`dirt` art). Dumping
// (dumpAt) goes, in order: into the truck bed if it is over it, into an
// empty wheelbarrow, back into the pit where it is dug (a fill circle that
// grows with the load), onto a pile next to it, or a new dirt PILE (kind
// 'dirt-pile', props.size in scoops, via `inc`). Piles: tap to pat them flat
// or back into a hill, drag one into the pit to fill it, scoop from one with
// the spade or the bucket.
// - SPADE: drag it: an empty spade digs until it is full (scrape, clods);
//   a full one carried over the wheelbarrow or the truck bed drops its load
//   in; set it down (or tap it) and it tips out (in the pit: refill, once it
//   has left the pit; elsewhere: a pile).
// - EXCAVATOR: drag the bucket; the arm turns for the height and the machine
//   rolls on its treads for x (digsite.excavatorReach), engine rumbling and
//   puffing. Through dirt it digs and fills (bucket `full`). Tap a full bucket,
//   flick it, or let go of it over the truck: it tips out there. Drag the
//   body to drive. The cab seat (manifest seat 'excavator-cab') rides along.
// - DUMP TRUCK: tap it: beep beep, the bed tilts up (manifest variants
//   tilt, up), dirt slides out at the back (a pile, or into the pit), and
//   whatever rode on the bed slides off. Drag it to drive (the bed surface,
//   the cab seat and what rides on the bed come along).
// - WHEELBARROW: fill it with the spade (or the bucket), wheel it anywhere,
//   tap it: it tips its load out in front.
// State: machine poses and loads are props of the site-fixtures entity
// (excX, excArm, excavator-bucket, truckX, truck-bed, truckLoad); a dump's
// animation is a plan prop (truckPour / bucketDump) every iPad plays.
// Motion runs rAF only while something moves; nothing is scheduled at rest.

import * as tween from '../engine/tween.js';
import { getEntity, inRoom } from '../engine/world.js';
import { zIndexFor, depthScale, surfaceUnder } from '../engine/surfaces.js';
import { createDigPit, createDigCanvas } from '../engine/digmask.js';
import {
  excavatorGeom, excavatorPose, excavatorReach, DUMP_CURL, FULL_CURL,
  SPADE_R, BUCKET_R, SPADE_SCOOP, BUCKET_SCOOP, LOAD, PILE_MAX, TRUCK_MAX,
  fillRadius, pileDims, treasureSpots, treasureBox, restockPicks, UNCOVER, REBURY, RESTOCK_FULL,
} from '../core/digsite.js';

export const DIG_PIECES = ['dirt', 'excavator', 'excavator-arm', 'excavator-bucket', 'dump-truck', 'truck-bed'];
export const DIG_ROOM = 'construction/dig';
export const MASK_ID = 'pit';
export const PILE_KIND = 'dirt-pile';
export const BURIED_KEY = 705;
export const DIRT_KEY = 706;
const CLOD = '#8E5E3C';
const INK = '#3D2C29';
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const GROUND = [728, 956];            // where piles can sit (the floor band, a bit inside)
const SPADE_KIND = 'spade';
const BARROW_KIND = 'wheelbarrow';

/** The SVG of a dirt pile (pure). */
export function pileSvg(size, flat) {
  const { w, h } = pileDims(size, flat);
  const top = 3;
  const body = flat
    ? `M3 ${h - 1} C ${w * 0.12} ${h * 0.25}, ${w * 0.3} ${top}, ${w / 2} ${top} C ${w * 0.7} ${top}, ${w * 0.88} ${h * 0.25}, ${w - 3} ${h - 1} Z`
    : `M3 ${h - 1} C ${w * 0.16} ${h * 0.35}, ${w * 0.33} ${top}, ${w / 2} ${top} C ${w * 0.67} ${top}, ${w * 0.84} ${h * 0.35}, ${w - 3} ${h - 1} Z`;
  const shine = flat ? '' : `<path d="M${w * 0.3} ${h * 0.34} C ${w * 0.4} ${h * 0.14}, ${w * 0.55} ${h * 0.12}, ${w * 0.62} ${h * 0.2}" fill="none" stroke="#D2A57C" stroke-width="3.2" stroke-linecap="round"/>`;
  const marks = [[0.3, 0.62], [0.58, 0.5], [0.72, 0.74], [0.45, 0.8]].map(([fx, fy]) => `<path d="M${w * fx - 5} ${h * fy + 2} q5 -5 10 0" fill="none" stroke="#9A6A48" stroke-width="2" stroke-linecap="round"/>`).join('');
  const pebbles = `<ellipse cx="${w * 0.38}" cy="${h * 0.7}" rx="4.5" ry="3" fill="#E6DED3" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${w * 0.66}" cy="${h * 0.62}" rx="3.5" ry="2.4" fill="#E6DED3" stroke="${INK}" stroke-width="1.5"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">`
    + `<ellipse cx="${w / 2}" cy="${h - 2}" rx="${w * 0.47}" ry="4" fill="${INK}" opacity="0.12"/>`
    + `<path d="${body}" fill="#B98A62" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>${shine}${marks}${pebbles}</svg>`;
}

const CLUMP_HTML = `<svg viewBox="0 0 34 20" width="34" height="20" aria-hidden="true"><path d="M2 17 C2 8 8 3 14 5 C18 1 26 2 28 8 C33 9 33 17 30 18 Z" fill="#A87752" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 11 q3 -3 6 0" fill="none" stroke="#7E5436" stroke-width="1.6" stroke-linecap="round"/><ellipse cx="22" cy="12" rx="2.6" ry="1.8" fill="#E6DED3" stroke="${INK}" stroke-width="1.2"/></svg>`;

export function createSiteDig({ stage, store, input, room, fx, manifest, catalog, pieces, later, site }) {
  const m = manifest.rooms.site;
  const SITE_ID = room.id;
  const rigs = m.rigs;
  const digBox = rigs.dig.box;
  const dirtDef = m.pieces.dirt;
  const exRig = rigs.excavator;
  const trRig = rigs.dumpTruck;
  const geo = excavatorGeom(exRig);
  const treasureKinds = (manifest.site && manifest.site.treasures) || [];
  let view = null;
  let chars = null;
  const stats = { digs: 0, fills: 0, scoops: 0, dumps: {}, reveals: 0, reburies: 0, restocks: 0, pours: 0, drives: 0, frames: 0, pats: 0, tips: 0 };
  const play = (name, o) => { if (view) view.play(name, o); };
  const viewOf = (id) => (view ? view.viewOf(id) : null);
  const piece = (pid) => pieces.get(pid) || null;
  const fixtures = () => site.fixtures();
  const fprops = () => { const f = fixtures(); return f ? f.props : {}; };
  const setFix = (key, value) => { const f = fixtures(); if (f && f.props[key] !== value) store.dispatch('set', { id: f.id, path: 'props.' + key, value }); };
  const isTreasure = (e) => !!e && catalog.hasTag(e.kind, 'treasure');
  const isBuried = (e) => isTreasure(e) && e.props.buried === true && !e.parent && e.room === SITE_ID;
  const isPile = (e) => !!e && e.kind === PILE_KIND;
  const isSpade = (e) => !!e && e.kind === SPADE_KIND;
  const isBarrow = (e) => !!e && e.kind === BARROW_KIND;
  const loaded = (e) => !!e && e.props.load === 'dirt';
  const top = () => inRoom(store.state, SITE_ID);
  const dump = (kind) => { stats.dumps[kind] = (stats.dumps[kind] || 0) + 1; };

  // ---------------------------------------------------------------------------
  // The dirt: mask + canvas

  const dirtRec = piece('dirt');
  let canvas = null;
  const pit = createDigPit({
    store, id: MASK_ID, room: DIG_ROOM, box: digBox, cell: 2,
    onChange: (d) => { if (canvas) canvas.request(d); },
  });
  if (dirtRec) {
    dirtRec.img.style.display = 'none';
    dirtRec.el.style.zIndex = String(zIndexFor(DIRT_KEY));
    canvas = createDigCanvas({
      host: dirtRec.body,
      frame: [dirtDef.x, dirtDef.y, dirtDef.w, dirtDef.h],
      mask: pit.mask,
      src: dirtDef.variants[dirtDef.default].file,
      ppu: Math.min(1.5, dirtDef.px[0] / dirtDef.w),
    });
  }
  const holeNear = (x, y, r = 34) => { const c = pit.coverage(x - r, y - r, x + r, y + r); return c != null && c < 0.9; };

  // Clods and grit where the dirt was moved (throttled so a fast drag stays light).
  let fxAt = 0, soundAt = 0;
  function digFx(x, y, amount, mode = 'd') {
    const now = performance.now();
    if (now - soundAt > 150 && amount > 0) { soundAt = now; play(mode === 'd' ? 'scrape' : 'thud', { pitch: 0.9 + Math.random() * 0.2, gain: 0.8 }); }
    if (now - fxAt > 110 && amount > 0) {
      fxAt = now;
      fx.burst('bit', x, y - 6, { count: 3, spread: 46, angle: -90, arc: 120, color: CLOD, scale: 0.8 });
    }
  }

  // ---------------------------------------------------------------------------
  // Treasures

  function treasureCover(e) {
    const v = viewOf(e.id);
    const k = catalog.get(e.kind);
    const w = v && v.sprite ? v.sprite.w : k ? k.size[0] : 60;
    const h = v && v.sprite ? v.sprite.h : k ? k.size[1] : 60;
    const b = treasureBox(e.x, e.y, w, h, depthScale(room.def, e.y));
    return pit.coverage(b[0], b[1], b[2], b[3]);
  }
  const inPit = (e) => pit.inside(e.x, e.y, 4);

  /** After this iPad moved dirt: find what is uncovered, bury what is covered. */
  function checkTreasures(mode) {
    for (const e of top()) {
      if (!isTreasure(e)) continue;
      const v = viewOf(e.id);
      if (v && v.held) continue;
      if (e.props.buried) {
        const c = treasureCover(e);
        if (c != null && c <= UNCOVER) { store.dispatch('set', { id: e.id, path: 'props.buried', value: false }); stats.reveals++; }
      } else if (mode === 'f' && inPit(e)) {
        const c = treasureCover(e);
        if (c != null && c >= REBURY) { store.dispatch('set', { id: e.id, path: 'props.buried', value: true }); stats.reburies++; }
      }
    }
  }

  function revealFx(e) {
    const v = viewOf(e.id);
    const h = v && v.sprite ? v.sprite.h * v.scale : 50;
    fx.burst('sparkle', e.x, e.y - h * 0.5, { count: 12, spread: 110, stagger: 20 });
    fx.burst('bit', e.x, e.y - 10, { count: 5, spread: 70, angle: -90, arc: 150, color: CLOD });
    play('tada');
    later(260, () => play('ding', { pitch: 1.2 }));
    if (v && !v.held) {
      tween.animate(v.lift, [
        { transform: 'translate3d(0px, 0px, 0px) scale(0.6)' },
        { transform: 'translate3d(0px, -46px, 0px) scale(1.15)', offset: 0.45, easing: 'ease-in' },
        { transform: 'translate3d(0px, 0px, 0px) scale(1)', offset: 0.8 },
        { transform: 'translate3d(0px, -8px, 0px) scale(1)', offset: 0.9 },
        { transform: 'translate3d(0px, 0px, 0px) scale(1)' },
      ], { duration: 820, easing: 'ease-out' });
      tween.squash(v.body, { delay: 660, amount: 0.8 });
    }
    // Anyone close by is amazed.
    if (chars) {
      for (const c of top()) {
        if (c.kind !== 'char' || Math.abs(c.x - e.x) > 520) continue;
        chars.face(c.id, [['surprised', 1300], ['happy', 1500]]);
      }
    }
  }

  function freeSlots() {
    const spots = m.slots.filter((s) => s.kind === 'treasure');
    const things = top().filter((e) => isTreasure(e));
    return spots.filter((s) => !things.some((e) => Math.abs(e.x - s.at[0]) < 40 && Math.abs(e.y - s.at[1]) < 40)).map((s) => s.id);
  }

  /** A pit filled back up with nothing left in it: two new treasures to find. */
  function maybeRestock() {
    if (pit.dirtLeft() < RESTOCK_FULL) return;
    if (top().some((e) => isTreasure(e) && e.props.buried)) return;
    const picks = restockPicks(treasureKinds, freeSlots(), 2, Math.random);
    for (const [kind, slot] of picks) {
      const at = m.slots.find((s) => s.id === slot).at;
      store.dispatch('spawn', { id: store.newId(), kind, room: SITE_ID, x: r1(at[0]), y: r1(at[1]), z: 0, props: { buried: true } });
    }
    if (picks.length) { stats.restocks++; later(150, () => { play('chime', { pitch: 1.3 }); fx.burst('sparkle', digBox[0] + digBox[2] / 2, digBox[1] + digBox[3] / 2, { count: 8, spread: 140 }); }); }
  }

  // ---------------------------------------------------------------------------
  // Piles

  const pileSprites = new Map();
  function pileSprite(e) {
    const size = clamp(Math.round(e.props.size) || 1, 1, PILE_MAX);
    const flat = !!e.props.flat;
    const key = `pile:${size}:${flat ? 1 : 0}`;
    let s = pileSprites.get(key);
    if (!s) {
      const d = pileDims(size, flat);
      const html = pileSvg(size, flat);
      s = { key, draw: 'custom', w: d.w, h: d.h, sound: 'thud', paint: (body) => { body.innerHTML = html; } };
      pileSprites.set(key, s);
    }
    return s;
  }
  function pileNear(x, y, exceptId = null) {
    let best = null, bd = Infinity;
    for (const e of top()) {
      if (!isPile(e) || e.id === exceptId) continue;
      const v = viewOf(e.id);
      if (v && v.held) continue;
      const d = Math.abs(e.x - x) + Math.abs(e.y - y) * 1.5;
      if (Math.abs(e.x - x) < 70 && Math.abs(e.y - y) < 45 && d < bd) { best = e; bd = d; }
    }
    return best;
  }
  /** A pile whose drawn box has (x, y) in it (a spade or a bucket scooping). */
  function pileUnder(x, y) {
    for (const e of top()) {
      if (!isPile(e)) continue;
      const v = viewOf(e.id);
      if (!v || v.held || !v.sprite) continue;
      const hw = (v.sprite.w * v.scale) / 2 + 8;
      if (x >= v.x - hw && x <= v.x + hw && y >= v.y - v.sprite.h * v.scale - 14 && y <= v.y + 10) return e;
    }
    return null;
  }
  /** Take n scoops off a pile (it goes when it is used up). Returns how many it gave. */
  function takeFromPile(p, n) {
    const size = Math.max(1, Math.round(p.props.size) || 1);
    const got = Math.min(n, size);
    if (got >= size) store.dispatch('remove', { id: p.id, hard: true });
    else store.dispatch('inc', { id: p.id, path: 'props.size', by: -got });
    play('scrape', { pitch: 0.8 });
    fx.burst('bit', p.x, p.y - 12, { count: 4, spread: 50, angle: -90, arc: 120, color: CLOD });
    return got;
  }
  function growFx(id, delay = 0) {
    const v = viewOf(id);
    if (!v) return;
    tween.animate(v.body, [
      { transform: 'scale(0.2, 0.1)' },
      { transform: 'scale(1.08, 1.12)', offset: 0.7 },
      { transform: 'scale(1, 1)' },
    ], { duration: 620, delay, easing: 'ease-out', fill: 'backwards' });
    later(delay + 300, () => { play('thud', { pitch: 0.8 }); fx.burst('puff', v.x, v.y - 8, { count: 4, spread: 60, scale: 0.55 }); });
  }

  // ---------------------------------------------------------------------------
  // Truck (declared early: dumpAt needs the bed)

  const tr = { dx: 0, mode: 'rest', glide: 0, drv: null, pourUntil: 0 };
  const truckEls = ['dump-truck', 'truck-bed'];
  const bedSurf = site.surface ? site.surface('truck-bed') : null;
  const bed0 = bedSurf ? { x0: bedSurf.x0, x1: bedSurf.x1, y: bedSurf.y } : { x0: 1841, x1: 1996, y: 761.6 };
  const bedState = () => site.pieceState('truck-bed');
  const bedOpen = () => { const s = bedState(); return (s === 'down' || s === 'full') && performance.now() > tr.pourUntil; };
  const overBed = (x, y) => bedOpen() && x >= bed0.x0 + tr.dx - 70 && x <= bed0.x1 + tr.dx + 70 && y <= bed0.y + 70 && y >= bed0.y - 260;

  function barrowAt(x, y, exceptId) {
    for (const e of top()) {
      if (!isBarrow(e) || e.id === exceptId) continue;
      const v = viewOf(e.id);
      if (!v || v.held || !v.sprite) continue;
      const s = v.scale;
      if (x >= v.x - 70 * s && x <= v.x + 75 * s && y >= v.y - 110 * s && y <= v.y + 20) return e;
    }
    return null;
  }

  /**
   * Put n scoops of dirt down at world (x, y): the truck bed, an empty
   * wheelbarrow, the pit's hole, a pile next to it or a new pile (header).
   * opts.fall: the dirt falls from up there onto the ground in front.
   */
  function dumpAt(x, y, n, { noTruck = false, exceptId = null, fall = 0 } = {}) {
    if (!noTruck && overBed(x, y)) {
      const load = fprops().truckLoad || 0;
      const add = Math.min(n, Math.max(0, TRUCK_MAX - load));
      const f = fixtures();
      if (f && add) store.dispatch('inc', { id: f.id, path: 'props.truckLoad', by: add });
      if (bedState() !== 'full') setFix('truck-bed', 'full');
      const bx = (bed0.x0 + bed0.x1) / 2 + tr.dx;
      fx.burst('bit', bx, bed0.y - 20, { count: 6, spread: 80, angle: -90, arc: 140, color: CLOD });
      later(120, () => { play('thud', { pitch: 0.75 }); play('clunk', { pitch: 0.7, gain: 0.5 }); const b = piece('truck-bed'); if (b) tween.squash(b.body, { amount: 0.4 }); });
      dump('truck');
      return { kind: 'truck', x: bx, y: bed0.y };
    }
    const wb = barrowAt(x, y, exceptId);
    if (wb && !loaded(wb)) {
      store.dispatch('set', { id: wb.id, path: 'props.load', value: 'dirt' });
      const v = viewOf(wb.id);
      if (v) tween.squash(v.body, { amount: 0.8 });
      play('thud', { pitch: 0.9 });
      fx.burst('bit', wb.x, wb.y - 50, { count: 5, spread: 60, angle: -90, arc: 140, color: CLOD });
      dump('barrow');
      return { kind: 'barrow', id: wb.id };
    }
    const gy = clamp(y + fall, GROUND[0], GROUND[1]);
    const px = clamp(x, digBox[0] + 12, digBox[0] + digBox[2] - 12);
    const py = clamp(gy, digBox[1] + 12, digBox[1] + digBox[3] - 8);
    if (pit.inside(x, gy, 10) && holeNear(px, py)) {
      pit.fill(px, py, fillRadius(n));
      stats.fills++;
      checkTreasures('f');
      maybeRestock();
      play('slide', { gain: 0.7 });
      fx.burst('bit', px, py - 10, { count: 6, spread: 70, angle: -90, arc: 160, color: CLOD });
      dump('pit');
      return { kind: 'pit', x: px, y: py };
    }
    const gx = clamp(x, 40, m.width - 40);
    const near = pileNear(gx, gy, exceptId);
    if (near && (Math.round(near.props.size) || 1) < PILE_MAX) {
      store.dispatch('inc', { id: near.id, path: 'props.size', by: Math.min(n, PILE_MAX - (Math.round(near.props.size) || 1)) });
      const v = viewOf(near.id);
      if (v) tween.squash(v.body, { amount: 0.9 });
      play('thud', { pitch: 0.85 });
      dump('pile');
      return { kind: 'pile', id: near.id, grew: true };
    }
    const id = store.newId();
    store.dispatch('spawn', { id, kind: PILE_KIND, room: SITE_ID, x: r1(gx), y: r1(gy), z: 0, props: { size: Math.min(PILE_MAX, n) } });
    dump('pile');
    return { kind: 'pile', id, grew: false };
  }

  // ---------------------------------------------------------------------------
  // Spade and wheelbarrow

  const spadeG = new Map();      // spade id -> this drag's state

  function showClump(v, on) {
    if (!v) return;
    const lift = v.lift;
    let c = lift.querySelector(':scope > .dig-clump');
    if (!on) { if (c) c.style.visibility = 'hidden'; return; }
    if (!c) {
      c = document.createElement('div');
      c.className = 'dig-clump';
      c.style.cssText = 'position:absolute;left:50%;bottom:6px;width:34px;height:20px;margin-left:-19px;z-index:60;pointer-events:none;transform:rotate(-30deg)';
      c.innerHTML = CLUMP_HTML;
      lift.appendChild(c);
    }
    c.style.visibility = '';
  }

  function spadeStart(e) {
    spadeG.set(e.id, { full: loaded(e), armed: loaded(e), g: null, dug: 0 });
  }
  function spadeFill(e, v, st) {
    if (st.g) { st.g.end(); st.g = null; }
    st.full = true;
    stats.scoops++;
    store.dispatch('set', { id: e.id, path: 'props.load', value: 'dirt' });
    showClump(v, true);
    play('squish', { pitch: 0.8 });
    later(90, () => play('thud', { pitch: 1.1, gain: 0.6 }));
  }
  function spadeEmpty(e, v, st, res) {
    if (st) { st.full = false; st.armed = false; st.dug = 0; }
    store.dispatch('set', { id: e.id, path: 'props.load', value: 'empty' });
    showClump(v, false);
    if (v) tween.wobble(v.body, { amount: 0.8, duration: 420 });
    if (res && res.kind === 'pile' && !res.grew) growFx(res.id);
  }
  function spadeMove(e) {
    const st = spadeG.get(e.id);
    const v = viewOf(e.id);
    if (!st || !v) return;
    const x = v.x, y = v.y - 4;          // the blade's tip
    const cur = getEntity(store.state, e.id) || e;
    if (!st.full) {
      if (pit.inside(x, y)) {
        if (!st.g) st.g = pit.begin('d', SPADE_R);
        const t = st.g.add(x, y);
        if (t) { st.dug += t; stats.digs++; digFx(x, y, t); checkTreasures('d'); }
        if (st.dug >= SPADE_SCOOP) spadeFill(cur, v, st);
        return;
      }
      if (st.g) { st.g.end(); st.g = null; }
      const p = pileUnder(x, y);
      if (p && takeFromPile(p, LOAD.spade)) spadeFill(cur, v, st);
      return;
    }
    // A full spade: into the truck or a wheelbarrow as it passes; back in the pit once it has been out.
    if (!pit.inside(x, y, 20)) st.armed = true;
    const wb = barrowAt(x, y);
    if ((wb && !loaded(wb)) || overBed(x, y)) { spadeEmpty(cur, v, st, dumpAt(x, y, LOAD.spade)); return; }
    if (st.armed && pit.inside(x, y) && holeNear(x, y)) spadeEmpty(cur, v, st, dumpAt(x, y, LOAD.spade));
  }
  function spadeDrop(e) {
    const st = spadeG.get(e.id);
    spadeG.delete(e.id);
    if (!st) return;
    if (st.g) { st.g.end(); st.g = null; }
    const v = viewOf(e.id);
    const cur = getEntity(store.state, e.id) || e;
    // Set down full, away from the hole it just dug: it tips out there.
    if (st.full && st.armed && v) spadeEmpty(cur, v, st, dumpAt(v.x, v.y, LOAD.spade));
  }
  function spadeTap(e) {
    const v = viewOf(e.id);
    if (!loaded(e) || !v) return false;
    stats.tips++;
    tween.animate(v.body, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-70deg)', offset: 0.4 }, { transform: 'rotate(0deg)' }], { duration: 520, easing: 'ease-out' });
    play('slide', { gain: 0.5 });
    spadeEmpty(e, v, null, dumpAt(e.x - 40, e.y, LOAD.spade));
    return true;
  }

  function barrowTap(e) {
    const v = viewOf(e.id);
    if (!v) return false;
    if (!loaded(e)) { tween.wobble(v.body, { amount: 0.6 }); play('squeak', { pitch: 0.9 }); return true; }
    stats.tips++;
    v.body.style.transformOrigin = '38% 100%';
    tween.animate(v.body, [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-32deg)', offset: 0.35, easing: 'ease-in' },
      { transform: 'rotate(-32deg)', offset: 0.6 },
      { transform: 'rotate(0deg)' },
    ], { duration: 900, easing: 'ease-out' });
    play('squeak', { pitch: 0.8 });
    later(200, () => play('slide', { gain: 0.7 }));
    fx.burst('bit', e.x - 55, e.y - 30, { count: 7, spread: 60, angle: 120, arc: 60, color: CLOD, stagger: 40 });
    store.dispatch('set', { id: e.id, path: 'props.load', value: 'empty' });
    const res = dumpAt(e.x - 80, e.y, LOAD.wheelbarrow, { exceptId: e.id });
    if (res.kind === 'pile' && !res.grew) growFx(res.id, 250);
    return true;
  }
  let barrowSound = 0;
  function barrowMove(e) {
    const now = performance.now();
    if (now - barrowSound > 380) { barrowSound = now; play('rumble', { gain: 0.35, pitch: 1.5 }); }
    void e;
  }

  function pileTap(e) {
    const v = viewOf(e.id);
    stats.pats++;
    store.dispatch('set', { id: e.id, path: 'props.flat', value: !e.props.flat });
    play('thud', { pitch: e.props.flat ? 1.1 : 0.8 });
    later(80, () => play('squish', { pitch: 0.7, gain: 0.6 }));
    if (v) { fx.burst('puff', v.x, v.y - 6, { count: 4, spread: 70, scale: 0.5 }); tween.squash(v.body, { amount: 1 }); }
    return true;
  }
  /** A pile let go of: into the pit's hole (it fills it and is gone) or the truck, else it just lands. */
  function pileDrop(e) {
    const v = viewOf(e.id);
    if (!v) return false;
    const n = Math.max(1, Math.round(e.props.size) || 1);
    const x = v.x, y = v.y;
    if (overBed(x, y) || (pit.inside(x, y, 6) && holeNear(clamp(x, digBox[0], digBox[0] + digBox[2]), clamp(y, digBox[1], digBox[1] + digBox[3]), 50))) {
      const res = dumpAt(x, y, n, { exceptId: e.id });
      if (res.kind === 'truck' || res.kind === 'pit') {
        fx.burst('puff', x, y - 10, { count: 5, spread: 70, scale: 0.6 });
        store.dispatch('remove', { id: e.id, hard: true });
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // The excavator

  const ex = { a: 0, dx: 0, curl: 0, mode: 'rest', g: null, dug: 0, off: [0, 0], glide: 0, motorAt: 0, rumbleAt: 0, puffAt: 0, dist: 0 };
  const exSeat = (m.seats || []).find((s) => s.id === 'excavator-cab');
  const trSeat = (m.seats || []).find((s) => s.id === 'truck-cab');
  const bucketFull = () => site.pieceState('excavator-bucket') === 'full';

  function moveSeat(seatId, x) {
    for (const list of [room.def.seats || [], (chars && chars.seats) || []]) {
      const st = list.find((q) => q.id === seatId);
      if (!st) continue;
      const half = st.x1 != null ? (st.x1 - st.x0) / 2 : 44;
      st.x = x;
      if (st.x1 != null) { st.x0 = x - half; st.x1 = x + half; }
    }
  }

  function placeExc(bob = 0) {
    const pose = excavatorPose(geo, ex.a, ex.dx, ex.curl);
    const body = piece('excavator'), arm = piece('excavator-arm'), bk = piece('excavator-bucket');
    const d = m.pieces;
    if (body) body.el.style.transform = `translate3d(${r1(d.excavator.x + ex.dx)}px, ${r1(d.excavator.y + bob)}px, 0px)`;
    if (arm) {
      arm.el.style.transform = `translate3d(${r1(d['excavator-arm'].x + ex.dx)}px, ${r1(d['excavator-arm'].y + bob)}px, 0px)`;
      arm.body.style.transform = ex.a ? `rotate(${ex.a}deg)` : '';
    }
    if (bk) {
      const bx = d['excavator-bucket'].x + (pose.B[0] - geo.B0[0]);
      const by = d['excavator-bucket'].y + (pose.B[1] - geo.B0[1]) + bob;
      bk.el.style.transform = `translate3d(${r1(bx)}px, ${r1(by)}px, 0px)`;
      bk.body.style.transform = pose.bucketDeg ? `rotate(${r1(pose.bucketDeg)}deg)` : '';
    }
    if (exSeat) moveSeat('excavator-cab', r1(exSeat.at[0] + ex.dx));
    return pose;
  }

  function engine(moved, dxMoved) {
    const now = performance.now();
    if (!moved) return;
    if (now - ex.rumbleAt > 330) { ex.rumbleAt = now; play('rumble', { gain: 0.7, pitch: 0.9 + Math.random() * 0.1 }); }
    if (now - ex.motorAt > 850) { ex.motorAt = now; play('motor', { gain: 0.45, vary: 0 }); }
    if (dxMoved && now - ex.puffAt > 260) {
      ex.puffAt = now;
      const b = m.pieces.excavator;
      fx.burst('puff', b.x + ex.dx + b.w * 0.86, b.y + 26, { count: 2, spread: 24, scale: 0.45, stagger: 60 });
    }
  }

  function bucketFill() {
    if (ex.g) { ex.g.end(); ex.g = null; }
    ex.curl = FULL_CURL;
    ex.dug = 0;
    stats.scoops++;
    setFix('excavator-bucket', 'full');
    placeExc();
    play('clunk', { pitch: 0.8 });
    later(100, () => play('squish', { pitch: 0.7 }));
  }

  function bucketScoop(pose) {
    if (bucketFull()) return;
    const [x, y] = pose.M;
    if (pit.inside(x, y)) {
      if (!ex.g) ex.g = pit.begin('d', BUCKET_R);
      const t = ex.g.add(x, y);
      if (t) {
        ex.dug += t; stats.digs++;
        digFx(x, y, t);
        checkTreasures('d');
        ex.curl = r1(FULL_CURL * Math.min(1, ex.dug / BUCKET_SCOOP));
      }
      if (ex.dug >= BUCKET_SCOOP) bucketFill();
      return;
    }
    if (ex.g) { ex.g.end(); ex.g = null; }
    const p = pileUnder(x, y);
    if (p && takeFromPile(p, LOAD.bucket)) bucketFill();
  }

  /** Tip the bucket out where it is (a store op for the load, a plan for the tip animation). */
  function bucketDump() {
    if (!bucketFull()) return false;
    const pose = excavatorPose(geo, ex.a, ex.dx, ex.curl);
    const [x, y] = pose.M;
    const res = dumpAt(x, y, LOAD.bucket, { fall: Math.max(0, 850 - y) * 0.6 });
    ex.curl = 0;
    setFix('excavator-bucket', 'empty');
    const seq = store.device + ':' + Date.now().toString(36);
    setFix('bucketDump', { seq, a: ex.a, dx: ex.dx, x: r1(x), y: r1(y), pile: res.kind === 'pile' && !res.grew ? res.id : null });
    stats.tips++;
    return true;
  }
  function playBucketDump(plan) {
    const bk = piece('excavator-bucket');
    if (!bk || !plan) return;
    const a = typeof plan.a === 'number' ? plan.a : ex.a;
    tween.animate(bk.body, [
      { transform: `rotate(${r1(a + FULL_CURL)}deg)` },
      { transform: `rotate(${r1(a + DUMP_CURL)}deg)`, offset: 0.35, easing: 'ease-in' },
      { transform: `rotate(${r1(a + DUMP_CURL)}deg)`, offset: 0.55 },
      { transform: `rotate(${r1(a)}deg)` },
    ], { duration: 900, easing: 'ease-out' });
    play('clunk', { pitch: 1.1 });
    later(200, () => { play('slide', { gain: 0.6 }); fx.burst('bit', plan.x, plan.y, { count: 9, spread: 60, angle: 90, arc: 50, color: CLOD, stagger: 25 }); });
    if (plan.pile) later(0, () => growFx(plan.pile, 260));
  }

  function bucketStart(info) {
    if (ex.mode !== 'rest') { if (ex.mode !== 'glide') return false; cancelAnimationFrame(ex.glide); ex.glide = 0; }
    ex.mode = 'drag';
    ex.dug = 0;
    const pose = excavatorPose(geo, ex.a, ex.dx, ex.curl);
    ex.off = [info.x - pose.B[0], info.y - pose.B[1]];
    play('clunk', { pitch: 1.25, gain: 0.7 });
    return true;
  }
  function bucketMove(info) {
    if (ex.mode !== 'drag') return;
    const t = excavatorReach(geo, info.x - ex.off[0], info.y - ex.off[1]);
    const moved = t.a !== ex.a || t.dx !== ex.dx;
    const dxMoved = t.dx !== ex.dx;
    ex.dist += Math.abs(t.dx - ex.dx);
    ex.a = t.a; ex.dx = t.dx;
    stats.frames++;
    const pose = placeExc(dxMoved ? Math.sin(ex.dist / 9) * 1.4 : 0);
    engine(moved, dxMoved);
    if (moved) bucketScoop(pose);
  }
  function bucketEnd(info) {
    if (ex.mode !== 'drag') return;
    ex.mode = 'rest';
    if (ex.g) { ex.g.end(); ex.g = null; }
    placeExc();
    const speed = Math.hypot(info.vx || 0, info.vy || 0);
    const pose = excavatorPose(geo, ex.a, ex.dx, ex.curl);
    if (bucketFull() && !info.cancelled && (speed > 1.1 || overBed(pose.M[0], pose.M[1]))) bucketDump();
    parkExc();
  }
  function bucketTap() {
    if (ex.mode !== 'rest') return;
    if (bucketDump()) return;
    const bk = piece('excavator-bucket');
    play('clink', { pitch: 0.75 });
    if (bk) tween.animate(bk.body, [{ transform: `rotate(${ex.a}deg)` }, { transform: `rotate(${ex.a + 14}deg)`, offset: 0.4 }, { transform: `rotate(${ex.a}deg)` }], { duration: 380 });
  }

  function exDriveStart(info) {
    if (ex.mode !== 'rest') { if (ex.mode !== 'glide') return false; cancelAnimationFrame(ex.glide); ex.glide = 0; }
    ex.mode = 'drive';
    info.data.dx0 = ex.dx;
    play('rumble', { gain: 0.8 });
    return true;
  }
  function exDriveMove(info) {
    if (ex.mode !== 'drive') return;
    const dx = r1(clamp(info.data.dx0 + info.dx, geo.drive[0], geo.drive[1]));
    const moved = dx !== ex.dx;
    ex.dist += Math.abs(dx - ex.dx);
    ex.dx = dx;
    stats.frames++;
    const pose = placeExc(Math.sin(ex.dist / 9) * 1.6);
    engine(moved, moved);
    if (moved) bucketScoop(pose);
  }
  function exDriveEnd() {
    if (ex.mode !== 'drive') return;
    ex.mode = 'rest';
    if (ex.g) { ex.g.end(); ex.g = null; }
    placeExc();
    stats.drives++;
    play('thud', { gain: 0.5, pitch: 0.7 });
    parkExc();
  }

  function parkExc() {
    const f = fixtures();
    if (!f) return;
    if ((f.props.excX || 0) !== ex.dx) setFix('excX', ex.dx);
    if ((f.props.excArm || 0) !== ex.a) setFix('excArm', ex.a);
    if (exSeat) {
      const x = r1(exSeat.at[0] + ex.dx);
      for (const e of top()) if (e.kind === 'char' && e.props.seat === 'excavator-cab' && Math.abs(e.x - x) > 0.05) store.dispatch('move', { id: e.id, room: SITE_ID, x, y: e.y, z: 0 });
    }
  }

  /** Glide the excavator to the pose the store says (the other iPad, a reload), rAF only while it moves. */
  function glideExc(toA, toDx) {
    if (ex.mode === 'drag' || ex.mode === 'drive') return;
    if (ex.glide) cancelAnimationFrame(ex.glide);
    const fa = ex.a, fd = ex.dx, t0 = performance.now();
    const dur = Math.min(900, 220 + Math.abs(toDx - fd) * 1.5 + Math.abs(toA - fa) * 8);
    ex.mode = 'glide';
    const step = (now) => {
      stats.frames++;
      const u = clamp((now - t0) / dur, 0, 1);
      const k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      ex.a = r1(fa + (toA - fa) * k); ex.dx = r1(fd + (toDx - fd) * k);
      placeExc(u < 1 && toDx !== fd ? Math.sin(u * 30) * 1.4 : 0);
      if (u < 1) ex.glide = requestAnimationFrame(step);
      else { ex.glide = 0; ex.mode = 'rest'; ex.a = toA; ex.dx = toDx; placeExc(); }
    };
    ex.glide = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // The dump truck

  function placeTruck(bob = 0) {
    const d = m.pieces;
    for (const pid of truckEls) {
      const p = piece(pid);
      if (p) p.el.style.transform = `translate3d(${r1(d[pid].x + tr.dx)}px, ${r1(d[pid].y + (pid === 'dump-truck' ? bob : 0))}px, 0px)`;
    }
    if (bedSurf) { bedSurf.x0 = r1(bed0.x0 + tr.dx); bedSurf.x1 = r1(bed0.x1 + tr.dx); }
    if (trSeat) moveSeat('truck-cab', r1(trSeat.at[0] + tr.dx));
  }
  /** Things riding on the bed now, and the truck's driver. */
  function riders() {
    const out = [];
    for (const e of top()) {
      if (e.kind === 'char' && e.props.seat === 'truck-cab') { out.push(e); continue; }
      const s = surfaceUnder(room.def, e.x, e.y);
      if (s && s.id === 'truck-bed') out.push(e);
    }
    return out;
  }

  function truckStart(info) {
    if (tr.mode !== 'rest' || performance.now() < tr.pourUntil) { if (tr.mode !== 'glide') return false; cancelAnimationFrame(tr.glide); tr.glide = 0; tr.mode = 'rest'; }
    tr.mode = 'drive';
    info.data.dx0 = tr.dx;
    tr.drv = { dist: 0, at: 0, sound: performance.now(), riders: riders().map((e) => e.id) };
    play('honk', { gain: 0.6 });
    return true;
  }
  function truckMove(info) {
    if (tr.mode !== 'drive') return;
    const dx = r1(clamp(info.data.dx0 + info.dx, -250, 60));
    tr.drv.dist += Math.abs(dx - tr.dx);
    tr.dx = dx;
    stats.frames++;
    placeTruck(Math.sin(tr.drv.dist / 9) * 1.5);
    const dd = dx - info.data.dx0;
    for (const id of tr.drv.riders) {
      const v = viewOf(id);
      if (v && !v.held) v.el.style.transform = `translate3d(${r1(dd)}px, 0px, 0px) ${v.transform}`;
    }
    const now = performance.now();
    if (now - tr.drv.sound > 360 && tr.drv.dist > 4) { tr.drv.sound = now; play('rumble', { gain: 0.7, pitch: 1.1 }); }
    if (tr.drv.dist - tr.drv.at > 50) { tr.drv.at = tr.drv.dist; fx.burst('puff', m.pieces['dump-truck'].x + tr.dx + 20, 880, { count: 2, spread: 22, scale: 0.45 }); }
  }
  function truckEnd(info) {
    if (tr.mode !== 'drive') return;
    tr.mode = 'rest';
    placeTruck(0);
    const dd = r1(tr.dx - info.data.dx0);
    stats.drives++;
    setFix('truckX', tr.dx);
    for (const id of tr.drv.riders) {
      const e = getEntity(store.state, id);
      const v = viewOf(id);
      if (!e || (v && v.held)) continue;
      if (!dd || !store.dispatch('move', { id, room: SITE_ID, x: r1(e.x + dd), y: e.y, z: e.z || 0 })) { if (v) v.el.style.transform = v.transform; }
    }
    tr.drv = null;
    play('thud', { gain: 0.5, pitch: 0.8 });
  }

  function glideTruck(to) {
    if (tr.mode === 'drive') return;
    if (tr.glide) cancelAnimationFrame(tr.glide);
    const from = tr.dx, t0 = performance.now(), dur = Math.min(900, 200 + Math.abs(to - from) * 1.5);
    tr.mode = 'glide';
    const step = (now) => {
      stats.frames++;
      const u = clamp((now - t0) / dur, 0, 1);
      const k = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      tr.dx = r1(from + (to - from) * k);
      placeTruck(u < 1 ? Math.sin(u * 30) * 1.4 : 0);
      if (u < 1) tr.glide = requestAnimationFrame(step);
      else { tr.glide = 0; tr.mode = 'rest'; tr.dx = to; placeTruck(0); }
    };
    tr.glide = requestAnimationFrame(step);
  }

  /** Tap the truck: tip the bed. The ops first (dirt out, riders off), then the plan every iPad animates. */
  function pour() {
    if (tr.mode !== 'rest' || performance.now() < tr.pourUntil) return;
    const f = fixtures();
    if (!f) return;
    const load = Math.max(0, Math.round(f.props.truckLoad || 0));
    const px = r1(trRig.pour[0] + tr.dx), py = trRig.pour[1];
    stats.pours++;
    let res = null;
    if (load > 0) {
      res = dumpAt(px + 20, py + 10, load, { noTruck: true });
      store.dispatch('inc', { id: f.id, path: 'props.truckLoad', by: -load });
    }
    if (site.pieceState('truck-bed') !== 'down') setFix('truck-bed', 'down');
    const things = [];
    riders().filter((e) => e.props.seat !== 'truck-cab').forEach((e, i) => {
      const x = r1(clamp(px + 70 + i * 48, 40, m.width - 40)), y = r1(Math.min(GROUND[1], 930 + (i % 2) * 18));
      if (e.kind === 'char') {
        if (e.props.seat) store.dispatch('set', { id: e.id, path: 'props.seat', value: null });
        if (e.props.pose && e.props.pose !== 'stand') store.dispatch('set', { id: e.id, path: 'props.pose', value: 'stand' });
      }
      if (store.dispatch('move', { id: e.id, room: SITE_ID, x, y, z: 0 })) things.push({ id: e.id, fx: e.x, fy: e.y });
    });
    const seq = store.device + ':' + Date.now().toString(36);
    setFix('truckPour', { seq, at: [px, py], load, things, pile: res && res.kind === 'pile' && !res.grew ? res.id : null, grow: res && res.kind === 'pile' && res.grew ? res.id : null });
  }

  const tfAt = (v, x, y, s) => `translate3d(${r1(x - v.sprite.w / 2)}px, ${r1(y - v.sprite.h)}px, 0) scale(${s})`;
  let pourSeq = null;
  function playPour(plan) {
    if (!plan || plan.seq === pourSeq) return;
    pourSeq = plan.seq;
    const T = { tilt: 0, up: 260, back: 1550, down: 1800 };
    tr.pourUntil = performance.now() + T.down + 60;
    site.showPiece('truck-bed', 'tilt');
    play('beep');
    later(T.up, () => { site.showPiece('truck-bed', 'up'); play('clunk', { pitch: 0.7 }); });
    later(T.back, () => site.showPiece('truck-bed', 'tilt'));
    later(T.down, () => { site.showPiece('truck-bed', null); play('clunk', { pitch: 0.9, gain: 0.6 }); });
    const [px, py] = plan.at;
    if (plan.load > 0) {
      later(380, () => play('slide'));
      for (let k = 0; k < 6; k++) later(360 + k * 150, () => fx.burst('bit', px + 6, py - 60, { count: 4, spread: 60, angle: 70, arc: 40, color: CLOD, stagger: 30 }));
      if (plan.pile) later(0, () => growFx(plan.pile, 420));
      if (plan.grow) later(700, () => { const v = viewOf(plan.grow); if (v) tween.squash(v.body, { amount: 1 }); });
    }
    // Riders slide off the back.
    for (const t of plan.things || []) {
      const v = viewOf(t.id);
      if (!v || v.held || !v.sprite) continue;
      if (v.posAnim) { v.posAnim.cancel(); v.posAnim = null; }
      const to = v.transform;
      const from = tfAt(v, t.fx, t.fy, v.scale);
      const mid = tfAt(v, (t.fx + v.x) / 2 + 30, Math.min(t.fy, v.y) - 60, v.scale);
      v.posAnim = tween.animate(v.el, [
        { transform: from },
        { transform: mid, offset: 0.45, easing: 'ease-in' },
        { transform: to, offset: 0.85 },
        { transform: tfAt(v, v.x, v.y - 8, v.scale), offset: 0.92 },
        { transform: to },
      ], { duration: 760, delay: 320, easing: 'ease-out', fill: 'backwards' });
      if (chars && getEntity(store.state, t.id) && getEntity(store.state, t.id).kind === 'char') later(320, () => { chars.face(t.id, [['wheee', 800], ['laughing', 1000]]); play('giggle', { pitch: 1.1 }); });
      later(1000, () => fx.burst('puff', v.x, v.y - 4, { count: 3, spread: 40, scale: 0.45 }));
    }
  }

  // ---------------------------------------------------------------------------
  // Touch on the pieces

  function pad(p, box, cls = 'dig-hit') {
    if (!p || p.el.querySelector('.' + cls)) return;
    const d = document.createElement('div');
    d.className = cls;
    d.style.cssText = `position:absolute;left:${r1(box[0])}px;top:${r1(box[1])}px;width:${r1(box[2])}px;height:${r1(box[3])}px;pointer-events:auto`;
    p.el.appendChild(d);
  }

  function registerPieces() {
    const reg = (pid, h) => { const p = piece(pid); if (p) input.register(p.el, h); };
    // The dirt: a tap pats it (a drag on it pans the room, like the ground).
    reg('dirt', {
      pan: true,
      onTap: (info) => {
        play('thud', { pitch: 0.7 });
        if (pit.inside(info.x, info.y)) fx.burst('bit', info.x, info.y, { count: 3, spread: 40, angle: -90, arc: 120, color: CLOD });
        else fx.burst('puff', info.x, info.y, { count: 3, spread: 40, scale: 0.5 });
      },
    });
    // The arm is only drawn (its box covers half the pit); the bucket takes the touches, with a big pad.
    const arm = piece('excavator-arm');
    if (arm) arm.el.style.pointerEvents = 'none';
    const bk = piece('excavator-bucket');
    if (bk) { bk.el.style.pointerEvents = 'none'; pad(bk, [-20, -20, m.pieces['excavator-bucket'].w + 40, m.pieces['excavator-bucket'].h + 40]); }
    reg('excavator-bucket', { onTap: bucketTap, onDragStart: bucketStart, onDragMove: bucketMove, onDragEnd: bucketEnd, minHit: 120 });
    reg('excavator', {
      onTap: () => { if (ex.mode !== 'rest') return; play('rumble', { gain: 0.8 }); const b = piece('excavator'); if (b) tween.wobble(b.body, { amount: 0.2 }); const d = m.pieces.excavator; fx.burst('puff', d.x + ex.dx + d.w * 0.86, d.y + 26, { count: 3, spread: 30, scale: 0.5 }); },
      onDragStart: exDriveStart, onDragMove: exDriveMove, onDragEnd: exDriveEnd,
    });
    // The truck: a tap tips the bed, a drag drives. The bed's picture box is mostly air: a pad over the bed itself.
    const bedP = piece('truck-bed');
    const slot = (m.slots || []).find((s) => s.id === 'truck-bed');
    if (bedP) {
      bedP.el.style.pointerEvents = 'none';
      const b = slot && slot.box ? slot.box : [bed0.x0, bed0.y - 40, bed0.x1 - bed0.x0, 90];
      pad(bedP, [b[0] - m.pieces['truck-bed'].x, b[1] - m.pieces['truck-bed'].y, b[2], b[3]]);
    }
    const truckH = { onTap: pour, onDragStart: truckStart, onDragMove: truckMove, onDragEnd: truckEnd };
    reg('dump-truck', truckH);
    reg('truck-bed', truckH);
  }

  // ---------------------------------------------------------------------------
  // First time the dig code sees this world: treasures, spades, a wheelbarrow

  function seed() {
    const f = fixtures();
    if (!f || f.props.digSeeded) return;
    for (const t of treasureSpots(m)) {
      if (!catalog.has(t.kind)) continue;
      store.dispatch('spawn', { id: store.newId(), kind: t.kind, room: SITE_ID, x: r1(t.x), y: r1(t.y), z: 0, props: { buried: true } });
    }
    const things = [[SPADE_KIND, 1996, 952], [SPADE_KIND, 2336, 956], [BARROW_KIND, 2470, 957, { load: 'empty' }]];
    for (const [kind, x, y, props] of things) {
      if (!catalog.has(kind)) continue;
      store.dispatch('spawn', { id: store.newId(), kind, room: SITE_ID, x, y, z: 0, ...(props ? { props } : {}) });
    }
    setFix('digSeeded', true);
  }

  // ---------------------------------------------------------------------------
  // View hooks

  function hooks(base) {
    return Object.assign({}, base, {
      spriteOf: (e) => (isPile(e) ? pileSprite(e) : base.spriteOf ? base.spriteOf(e) : null),
      sortKeyOf: (e) => (isBuried(e) ? BURIED_KEY : base.sortKeyOf ? base.sortKeyOf(e) : null),
      scaleOf: (e) => (isBuried(e) ? depthScale(room.def, e.y) : base.scaleOf ? base.scaleOf(e) : null),
      canDrag: (e) => (isBuried(e) ? false : base.canDrag ? base.canDrag(e) : true),
      dropTarget: (item, other) => (isBuried(other) || isPile(other) || isPile(item) ? false : base.dropTarget ? base.dropTarget(item, other) : false),
      onTap(e, ctx) {
        if (isBuried(e)) return true;
        if (isPile(e)) return pileTap(e);
        if (isSpade(e) && spadeTap(e)) return true;
        if (isBarrow(e)) return barrowTap(e);
        return base.onTap ? base.onTap(e, ctx) : false;
      },
      onDragStart(e, ctx) {
        if (base.onDragStart) base.onDragStart(e, ctx);
        if (isSpade(e)) spadeStart(e);
      },
      onDragMove(e, ctx) {
        if (base.onDragMove) base.onDragMove(e, ctx);
        if (isSpade(e)) spadeMove(e);
        else if (isBarrow(e)) barrowMove(e);
      },
      onDrop(e, ctx) {
        if (isSpade(e)) spadeDrop(e);
        if (isPile(e) && pileDrop(e)) return true;
        return base.onDrop ? base.onDrop(e, ctx) : false;
      },
      onRender(e, ctx) {
        if (base.onRender) base.onRender(e, ctx);
        if (isSpade(e)) { const st = spadeG.get(e.id); showClump(viewOf(e.id), st ? st.full : loaded(e)); }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Store

  const unsubscribe = store.subscribe((st, env) => {
    if (!env) { syncMachines(true); return; }
    const a = env.args;
    const f = fixtures();
    if (env.op === 'set' && f && a.id === f.id) {
      if (a.path === 'props.truckPour' && a.value && typeof a.value === 'object') playPour(a.value);
      else if (a.path === 'props.bucketDump' && a.value && typeof a.value === 'object') playBucketDump(a.value);
      else if (env.device !== store.device && (a.path === 'props.excX' || a.path === 'props.excArm' || a.path === 'props.truckX')) syncMachines(false);
      else if (a.path === 'props.excavator-bucket' && a.value === 'empty' && ex.mode === 'rest') { ex.curl = 0; placeExc(); }
      else if (a.path === 'props.excavator-bucket' && a.value === 'full' && ex.mode === 'rest') { ex.curl = FULL_CURL; placeExc(); }
      return;
    }
    if (env.op === 'set' && a.path === 'props.buried') {
      const e = getEntity(st, a.id);
      if (isTreasure(e)) {
        if (a.value === false) later(0, () => revealFx(getEntity(store.state, a.id) || e));
        else if (view) { const v = viewOf(a.id); if (v) fx.burst('puff', e.x, e.y - 20, { count: 4, spread: 60, scale: 0.5 }); play('thud', { pitch: 0.8 }); }
      }
      return;
    }
    // Something handed a treasure: the character holding it is amazed.
    if (env.op === 'attach' && chars) {
      const e = getEntity(st, a.id), p = getEntity(st, a.parent);
      if (isTreasure(e) && p && p.kind === 'char') later(60, () => { chars.face(p.id, [['surprised', 1400], ['happy', 1200]]); play('ooh', { gain: 0.5 }); });
    }
  });

  /** Put the machines where the store says (instantly at boot/load, gliding otherwise). */
  function syncMachines(now) {
    const p = fprops();
    const a = typeof p.excArm === 'number' ? clamp(p.excArm, geo.arm[0], geo.arm[1]) : 0;
    const dx = typeof p.excX === 'number' ? clamp(p.excX, geo.drive[0], geo.drive[1]) : 0;
    const tdx = typeof p.truckX === 'number' ? clamp(p.truckX, -250, 60) : 0;
    if (now) {
      if (ex.glide) { cancelAnimationFrame(ex.glide); ex.glide = 0; ex.mode = 'rest'; }
      if (tr.glide) { cancelAnimationFrame(tr.glide); tr.glide = 0; tr.mode = 'rest'; }
      if (ex.mode === 'rest') { ex.a = a; ex.dx = dx; ex.curl = bucketFull() ? FULL_CURL : 0; placeExc(); }
      if (tr.mode === 'rest') { tr.dx = tdx; placeTruck(0); }
      return;
    }
    if (a !== ex.a || dx !== ex.dx) glideExc(a, dx);
    if (tdx !== tr.dx) glideTruck(tdx);
  }

  return {
    DIG_PIECES,
    hooks,
    /** After the view exists: seed, take over the machines' touches, place them. */
    bind(v, c) {
      view = v;
      chars = c;
      seed();
      registerPieces();
      syncMachines(true);
      if (canvas) canvas.request();
      view.refresh();
    },
    stats: () => Object.assign({}, stats, { dumps: Object.assign({}, stats.dumps), pit: pit.stats(), canvas: canvas ? canvas.stats() : null, moving: !!(ex.glide || tr.glide), drawing: canvas ? canvas.busy() : false }),
    api: {
      pit,
      canvas: () => canvas,
      canvasSize: () => (canvas ? canvas.size() : null),
      dirtLeft: () => pit.dirtLeft(),
      hash: () => pit.hash(),
      coverageOf: (id) => { const e = getEntity(store.state, id); return e ? treasureCover(e) : null; },
      treasures: () => top().filter((e) => isTreasure(e)).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, buried: !!e.props.buried })),
      piles: () => top().filter((e) => isPile(e)).map((e) => ({ id: e.id, x: e.x, y: e.y, size: e.props.size, flat: !!e.props.flat })),
      excavator: () => {
        const pose = excavatorPose(geo, ex.a, ex.dx, ex.curl);
        return { a: ex.a, dx: ex.dx, curl: ex.curl, mode: ex.mode, full: bucketFull(), B: pose.B.map(r1), M: pose.M.map(r1), moving: !!ex.glide };
      },
      truck: () => ({ dx: tr.dx, mode: tr.mode, bed: bedState(), load: fprops().truckLoad || 0, pouring: performance.now() < tr.pourUntil, bed0, riders: riders().map((e) => e.id) }),
      geo,
      dumpAt,
      pour,
      reach: (x, y) => excavatorReach(geo, x, y),
    },
    destroy() {
      unsubscribe();
      pit.destroy();
      if (canvas) canvas.destroy();
      if (ex.glide) cancelAnimationFrame(ex.glide);
      if (tr.glide) cancelAnimationFrame(tr.glide);
      ex.glide = tr.glide = 0;
    },
  };
}
