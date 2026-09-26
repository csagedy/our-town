// Cafe prep stations (P2a.2, docs/design.md 3.1 #2-4, 8, 9, 16, 17): what
// the cafe's tools and appliances do with food. The state lives in the food
// model (src/core/food.js) and the behaviors' verbs (src/core/behaviors/
// cafe.js); this module decides WHEN (a knife stroke across the cutting
// board, a whisk circling a bowl, a glass dropped on the blender...) and
// animates the appliance pieces the room art draws (the jug shakes, the
// toaster pops). Every change is a store op, so it is saved, replayed and
// shared by two iPads (grab leases apply as for any drag).
//
//   CUTTING BOARD  drop food on the board, then drag the knife across it
//                  (every pass, or every down-stroke of a sawing motion, is
//                  one cut: whole -> sliced -> chopped); or tap the food (or
//                  the knife) and the knife hops over and chops. Peelable
//                  things get peeled first; an egg cracks.
//   MIXING BOWL    drop ingredients in (an egg cracks on the rim), then drag
//                  the whisk (or ladle, spatula) round and round over it:
//                  each half circle is a stir step (a tap on the bowl is one
//                  too). The batter's colour blends in stages; done: a puff.
//   BLENDER        drop fruit / milk / ice cream in the jug, tap it: whirr,
//                  the jug shakes and fills with the smoothie colour; drop a
//                  glass on it: it pours a smoothie.
//   SINK           drop anything in: splash, bubbles, a dirty plate comes out
//                  clean; the tap washes what is in the basin.
//   TOASTER        drop bread in: the lever goes down, POP, toast flies out.
//   COFFEE         a cup (or mug) on the back bar under the spout: press the
//                  machine and it fills with coffee, then cocoa, then a latte.
//
//   const prep = createPrep({ store, catalog, behaviors, manifestRoom, fx, input, pieceApi });
//   hooks = prep.wrap(hooks);           // before createRoomView
//   prep.bind(view);                    // after it
//   prep.pieceVariant(pid, props)       // a variant override for a piece, or null
//   prep.onPieceTap(pid)                // true if it handled a piece tap itself
//   prep.destroy()

import { getEntity, inRoom, childrenOf } from '../engine/world.js';
import { ON_EPS } from '../engine/surfaces.js';
import * as tween from '../engine/tween.js';
import { resolveBehaviors } from '../core/behaviors/index.js';
import { canCut, isMixed, smoothieOf, drinkFor, DRINK_PIECE, cupFill } from '../core/food.js';
import { CUPS } from '../core/behaviors/cafe.js';

export const STATION_KINDS = ['station-blender', 'station-toaster', 'station-sink'];
export const BOARD = 'cutting-board';
export const KNIVES = ['knife'];
export const STIR_TOOLS = ['whisk', 'ladle', 'spatula'];
export const TOAST_MS = 1500;
export const BLEND_MS = 650;       // the jug shakes this long before it shows the smoothie
export const STIR_RADIUS = 170;    // a stirring finger within this of a bowl's middle stirs it
export const SPOUT = [1410, 1545]; // the coffee spout's reach along the back bar (world x)
const CUT_GAP_MS = 110;            // two cuts of one food are at least this far apart
const SAW_MIN = 16;                // a down-stroke this long, then up: one cut

const r1 = (v) => Math.round(v * 10) / 10;

/** Where each station stands (world feet), from the manifest room. Pure. */
export function stationSpots(m) {
  const surf = (id) => (m.surfaces || []).find((s) => s.id === id);
  const piece = (id) => (m.pieces || {})[id];
  const out = {};
  const b = piece('blender');
  const cr = surf('counter-right');
  if (b && cr) out['station-blender'] = { x: r1(b.x + b.w * 0.41), y: cr.y, piece: 'blender' };
  const t = piece('toaster');
  if (t && cr) out['station-toaster'] = { x: r1(t.x + t.w / 2), y: cr.y, piece: 'toaster' };
  const sink = (m.slots || []).find((s) => s.id === 'sink');
  const cs = surf('counter-sink');
  if (sink && cs) out['station-sink'] = { x: r1(sink.at[0]), y: cs.y, piece: 'sink-tap' };
  return out;
}

/** The live station of a kind in a room (lowest id wins if two iPads made one each), or null. */
export function stationOf(state, room, kind) {
  let best = null;
  for (const e of inRoom(state, room)) if (e.kind === kind && (!best || e.id < best.id)) best = e;
  return best;
}

/** Spawn any missing station (store ops). Returns the ids spawned. */
export function ensureStations(store, m, room) {
  const made = [];
  for (const [kind, at] of Object.entries(stationSpots(m))) {
    if (stationOf(store.state, room, kind)) continue;
    const id = store.newId();
    if (store.dispatch('spawn', { id, kind, room, x: at.x, y: at.y, z: 0 })) made.push(id);
  }
  return made;
}

/** Is a top-level thing resting on the cutting board? Pure. */
export function onBoard(board, e) {
  return !!board && !e.parent && Math.abs(e.y - board.y) < ON_EPS && e.x >= board.x0 - 24 && e.x <= board.x1 + 24;
}

/** Shortest signed angle from a to b (radians). Pure. */
export const angleDelta = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export function createPrep({ store, catalog, behaviors, m, room, fx, pieceApi }) {
  const roomId = room.id;
  const spots = stationSpots(m);
  const board = (room.def.surfaces || []).find((s) => s.id === BOARD) || (m.surfaces || []).find((s) => s.id === BOARD);
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const stats = { cuts: 0, strokes: 0, stirs: 0, blends: 0, pours: 0, pops: 0, washes: 0, fills: 0 };
  let view = null;
  let hooks = null;
  let base = null;

  const foodParams = (kind) => {
    const k = catalog.get(kind);
    const b = k && resolveBehaviors(k.behaviors).find((q) => q.name === 'food');
    return b ? b.p : null;
  };
  const isStation = (e) => STATION_KINDS.includes(e.kind);
  const station = (kind) => stationOf(store.state, roomId, kind);
  const boardFoods = () => inRoom(store.state, roomId).filter((e) => foodParams(e.kind) && onBoard(board, e));
  const pieceBody = (pid) => { const el = pieceApi.el(pid); return el ? el.firstChild : null; };

  // ---- knife ----
  function cutFood(id) {
    const e = getEntity(store.state, id);
    if (!e) return false;
    const p = foodParams(e.kind);
    // An egg on the board cracks; everything else takes a knife stroke.
    const verb = p && p.crack && !e.props.cracked ? 'crack' : 'cut';
    const ok = behaviors.act(id, verb);
    if (ok) stats.cuts++;
    return ok;
  }

  /** The knife hops over to a food and chops it (a tap). */
  function knifeHop(knifeId, foodId) {
    const kv = view && view.viewOf(knifeId);
    const fv = view && view.viewOf(foodId);
    if (!kv || !fv || kv.held) return;
    const dx = r1((fv.x - kv.x) / kv.scale - 12);
    const dy = r1((fv.y - fv.sprite.h * fv.scale - (kv.y - kv.sprite.h * kv.scale)) / kv.scale);
    tween.animate(kv.body, [
      { transform: 'translate3d(0, 0, 0)' },
      { transform: `translate3d(${dx}px, ${dy - 46}px, 0) rotate(-24deg)`, offset: 0.38, easing: 'ease-in' },
      { transform: `translate3d(${dx}px, ${dy + 6}px, 0) rotate(6deg)`, offset: 0.55 },
      { transform: `translate3d(${dx}px, ${dy - 20}px, 0) rotate(-8deg)`, offset: 0.7 },
      { transform: 'translate3d(0, 0, 0)' },
    ], { duration: 560, easing: 'ease-out' });
  }

  function knifeNear(food) {
    let best = null;
    let bestD = 260;
    for (const e of inRoom(store.state, roomId)) {
      if (!KNIVES.includes(e.kind)) continue;
      const d = Math.abs(e.x - food.x) + Math.abs(e.y - food.y);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  /** A tap chops a food on the board with the knife (the knife hops over, then the cut lands). */
  function tapChop(food, knife) {
    if (knife) knifeHop(knife.id, food.id);
    later(knife ? 210 : 0, () => cutFood(food.id));
  }

  // The knife's blade: the left part of its sprite (the handle is on the right).
  function bladeOf(kv) {
    return { x: kv.x - kv.sprite.w * kv.scale * 0.2, y: kv.y - kv.sprite.h * kv.scale * 0.5 };
  }

  function knifeMove(e, info) {
    const kv = view.viewOf(e.id);
    if (!kv) return;
    const B = bladeOf(kv);
    const st = info.data.chop || (info.data.chop = { foods: new Map(), last: null });
    const t = typeof info.t === 'number' ? info.t : performance.now();
    for (const f of boardFoods()) {
      const fv = view.viewOf(f.id);
      if (!fv || fv.held) continue;
      const hw = Math.max(fv.sprite.w * fv.scale / 2, 34) + 8;
      const top = fv.y - Math.max(fv.sprite.h * fv.scale, 40) - 26;
      const inside = B.x >= fv.x - hw && B.x <= fv.x + hw && B.y >= top && B.y <= fv.y + 14;
      let s = st.foods.get(f.id);
      if (!s) { s = { inside: false, y: B.y, down: 0, at: -1e9 }; st.foods.set(f.id, s); }
      let stroke = false;
      if (inside && !s.inside) stroke = true;                 // a pass (or a chop) comes into it
      else if (inside) {
        const dy = B.y - s.y;
        if (dy > 0) s.down += dy;
        else if (dy < -3) { if (s.down >= SAW_MIN) stroke = true; s.down = 0; }
      }
      s.inside = inside;
      s.y = B.y;
      if (!inside) s.down = 0;
      if (stroke && t - s.at >= CUT_GAP_MS) {
        s.at = t;
        stats.strokes++;
        cutFood(f.id);
        tween.squish(kv.body, { amount: 0.5, duration: 200 });
      }
    }
  }

  // ---- whisk ----
  const mixBowls = () => {
    const out = [];
    for (const id of view.ids()) {
      const e = getEntity(store.state, id);
      if (!e) continue;
      const k = catalog.get(e.kind);
      const mix = k && resolveBehaviors(k.behaviors).find((b) => b.name === 'mix');
      if (mix && mix.p.stir) out.push(e);
    }
    return out;
  };

  function stirMove(e, info) {
    const st = info.data.stir || (info.data.stir = { bowl: null, a: null, acc: 0 });
    let near = null;
    let nearD = STIR_RADIUS;
    for (const b of mixBowls()) {
      const bv = view.viewOf(b.id);
      if (!bv || bv.held) continue;
      const cx = bv.x;
      const cy = bv.y - bv.sprite.h * bv.scale * 0.5;
      const d = Math.hypot(info.x - cx, info.y - cy);
      if (d < nearD) { near = { b, cx, cy }; nearD = d; }
    }
    if (!near) { st.bowl = null; st.a = null; return; }
    const a = Math.atan2(info.y - near.cy, info.x - near.cx);
    if (st.bowl !== near.b.id) { st.bowl = near.b.id; st.a = a; st.acc = 0; return; }
    const da = angleDelta(st.a, a);
    st.a = a;
    if (Math.abs(da) > 1.5) return;                 // a jump, not a stir
    st.acc += Math.abs(da);
    while (st.acc >= Math.PI) {
      st.acc -= Math.PI;
      if (childrenOf(store.state, near.b.id).length && behaviors.act(near.b.id, 'stir')) stats.stirs++;
      const wv = view.viewOf(e.id);
      if (wv) tween.wobble(wv.body, { amount: 0.4, duration: 300 });
    }
  }

  // ---- blender ----
  function blenderVariant(props) {
    const s = station('station-blender');
    if (!s) return null;
    const mixed = childrenOf(store.state, s.id).filter((k) => isMixed(k.props));
    return mixed.length ? smoothieOf(mixed.map((k) => ({ kind: k.kind, props: k.props }))) : 'empty';
  }

  function shakeBlender(ms = 1100) {
    const body = pieceBody('blender');
    if (!body) return;
    const f = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const d = i === 0 || i === n ? 0 : (i % 2 ? 3 : -3) * (1 - i / (n + 2));
      f.push({ transform: `translate3d(${d}px, ${i % 3 === 1 ? -2 : 0}px, 0) rotate(${d * 0.7}deg)` });
    }
    tween.animate(body, f, { duration: ms, easing: 'linear' });
  }

  function tapBlender(s) {
    // Whirr and shake first, the fruit tumbling in the jug; then it is all
    // blended (the ops) and the jug shows the smoothie colour.
    stats.blends++;
    view.play('whirr');
    shakeBlender();
    for (const k of childrenOf(store.state, s.id)) {
      const kv = view.viewOf(k.id);
      if (!kv || !kv.body) continue;
      const f = [];
      for (let i = 0; i <= 8; i++) f.push({ transform: i === 0 || i === 8 ? 'translate3d(0, 0, 0)' : `translate3d(${(i % 2 ? 6 : -6)}px, ${-8 - (i % 3) * 7}px, 0) rotate(${(i % 2 ? 40 : -40) * i}deg)` });
      tween.animate(kv.body, f, { duration: BLEND_MS, easing: 'ease-in-out' });
    }
    later(BLEND_MS, () => { if (getEntity(store.state, s.id)) behaviors.act(s.id, 'blend'); });
  }

  // ---- toaster ----
  function toasterPop() {
    const s = station('station-toaster');
    if (!s || !childrenOf(store.state, s.id).length) return false;
    const ok = behaviors.act(s.id, 'pop');
    if (ok) {
      stats.pops++;
      if (pieceApi.state('toaster') !== 'up') pieceApi.set('toaster', 'up');
      const body = pieceBody('toaster');
      if (body) tween.squish(body, { amount: 1.2, duration: 360 });
    }
    return ok;
  }

  function toasterIn() {
    if (pieceApi.state('toaster') !== 'down') pieceApi.set('toaster', 'down');
    const body = pieceBody('toaster');
    if (body) tween.squish(body, { amount: 0.6 });
    later(TOAST_MS, toasterPop);
  }

  // ---- sink ----
  function washSink() {
    const s = station('station-sink');
    if (!s) return;
    const r = pieceApi.state('sink-tap');
    if (r === 'on') { behaviors.act(s.id, 'wash'); stats.washes++; }
  }

  // ---- coffee ----
  function cupUnderSpout() {
    const bar = (room.def.surfaces || []).find((q) => q.id === 'back-bar');
    let best = null;
    for (const e of inRoom(store.state, roomId)) {
      if (!cupFill(e.kind, 'coffee')) continue;
      if (e.x < SPOUT[0] || e.x > SPOUT[1]) continue;
      if (bar && Math.abs(e.y - bar.y) > ON_EPS) continue;
      if (!best || Math.abs(e.x - 1477) < Math.abs(best.x - 1477)) best = e;
    }
    return best;
  }

  function pourCoffee() {
    const cup = cupUnderSpout();
    const f = pieceApi.fixtures();
    const drink = drinkFor(f && f.props.coffee);
    pieceApi.press('coffee-machine', DRINK_PIECE[drink]);
    view.play('pour', { pitch: 0.9 });
    const p = m.pieces['coffee-machine'];
    if (fx && p) fx.burst('puff', p.x + p.w * 0.45, p.y + p.h * 0.35, { count: 4, spread: 40, scale: 0.6 });
    if (!cup) return true;
    const fill = cupFill(cup.kind, drink);
    store.dispatch('set', { id: cup.id, path: 'props.' + fill.key, value: fill.value });
    if (f) store.dispatch('inc', { id: f.id, path: 'props.coffee', by: 1 });
    stats.fills++;
    const cv = view.viewOf(cup.id);
    if (cv) tween.squish(cv.body, { amount: 1, delay: 300 });
    if (fx && cv) fx.burst('heart', cv.x, cv.y - cv.sprite.h * cv.scale - 10, { count: 2, spread: 30 });
    return true;
  }

  // ---- hooks ----
  function takes(st, item) {
    if (item.kind === 'char' || isStation(item)) return false;
    if (st.kind === 'station-toaster') return catalog.hasTag(item.kind, 'bread');
    if (st.kind === 'station-blender') return catalog.hasTag(item.kind, 'food') || CUPS.includes(item.kind);
    return !catalog.get(item.kind) || !catalog.get(item.kind).fixed;
  }

  function wrap(b) {
    base = b;
    hooks = Object.assign({}, b, {
      dropTarget(item, other) {
        if (isStation(other)) return takes(other, item);
        return b.dropTarget ? b.dropTarget(item, other) : false;
      },
      onDropInto(item, target, ctx) {
        const handled = b.onDropInto ? b.onDropInto(item, target, ctx) : false;
        if (!handled) return handled;
        const now = getEntity(store.state, item.id);
        if (target.kind === 'station-toaster' && now && now.parent === target.id) toasterIn();
        if (target.kind === 'station-blender' && !now) stats.pours++;
        if (target.kind === 'station-sink' && now && now.parent === target.id) {
          stats.washes++;
          if (pieceApi.state('sink-tap') !== 'on') {
            // A little splash from the tap, then it drips off again.
            const body = pieceBody('sink-tap');
            if (body) tween.wobble(body, { amount: 0.3 });
          }
        }
        return handled;
      },
      onTap(e, ctx) {
        if (e.kind === 'station-blender') { tapBlender(e); return true; }
        if (e.kind === 'station-toaster') {
          if (!toasterPop()) pieceApi.tap('toaster');
          return true;
        }
        if (e.kind === 'station-sink') { pieceApi.tap('sink-tap'); washSink(); return true; }
        if (KNIVES.includes(e.kind)) {
          const foods = boardFoods();
          const f = foods.find((q) => canCut(q.props, foodParams(q.kind))) || foods[0];
          if (f) { tapChop(f, e); return true; }
        }
        const p = foodParams(e.kind);
        if (p && onBoard(board, e) && (canCut(e.props, p) || (p.crack && !e.props.cracked))) {
          tapChop(e, knifeNear(e));
          return true;
        }
        return b.onTap ? b.onTap(e, ctx) : false;
      },
      onDragMove(e, ctx) {
        if (b.onDragMove) b.onDragMove(e, ctx);
        if (!view || !ctx.info) return;
        if (KNIVES.includes(e.kind)) knifeMove(e, ctx.info);
        else if (STIR_TOOLS.includes(e.kind)) stirMove(e, ctx.info);
      },
    });
    return hooks;
  }

  return {
    wrap,
    bind(v) {
      view = v;
      // Bread left in the toaster (a reload mid-toast): it pops soon.
      const t = station('station-toaster');
      if (t && childrenOf(store.state, t.id).length) later(700, toasterPop);
    },
    pieceVariant(pid, props) {
      if (pid === 'blender') return blenderVariant(props);
      return null;
    },
    onPieceTap(pid) {
      if (pid === 'blender') { const s = station('station-blender'); if (s) { tapBlender(s); return true; } }
      if (pid === 'toaster') return toasterPop();
      if (pid === 'coffee-machine') return pourCoffee();
      return false;
    },
    afterPieceTap(pid) {
      if (pid === 'sink-tap') washSink();
    },
    stations: () => Object.fromEntries(STATION_KINDS.map((k) => [k, (station(k) || {}).id || null])),
    spots,
    stats: () => ({ ...stats, timers: timers.size }),
    toasterPop,
    destroy() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
