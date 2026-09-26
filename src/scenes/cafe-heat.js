// Cafe heat (P2a.3, docs/design.md 3.1 #5-7): the stove and the oven,
// Toca Kitchen style. Nothing ever burns or catches fire: doneness stops at
// 3, "extra toasty" (src/core/food.js). The rules (what cooks, what batter
// turns into, what the ladle scoops) are pure in food.js; this module
// decides WHEN and animates it.
//
//   STOVE   a pan or pot on a lit burner (the knobs toggle the burners)
//           heats: its food cooks a doneness step every HEAT.stepMs (raw ->
//           fried -> extra toasty), with sizzle and spatter for a pan,
//           bubbles for a pot of water, steam curls; turning the burner off
//           (or lifting the pan off) stops it.
//           FLIP: tap the pan, or flick it upward: the food tosses and spins
//           in the air and lands back in it.
//           POUR: a mixing bowl of done batter dropped on the pan pours a
//           pancake into it (on the baking tray: raw cookie dough).
//           BOIL: the saucepan dropped in the sink fills with water; on a lit
//           burner it boils (pasta in it cooks); the LADLE dragged over it
//           scoops soup (or spaghetti), dropped on a bowl (or plate) it
//           serves the dish.
//   OVEN    things on the rack with the door shut: the oven glows (cafe.js
//           shows the door's closedOn look), hums, and after HEAT.ovenMs a
//           DING and the door pops open: baked (raw cookies -> cookies, a
//           bowl of batter -> a cupcake, food one doneness step). Opening the
//           door mid-bake pauses it.
//   WARM    what heat cooked stays warm for HEAT.warmMs (steam curls); a
//           character fed warm food goes "hot hot hot!" (characters.js asks
//           behaviors.hotOf), fans its mouth, then yum.
//
// Time: the heated top-level thing carries heatAt / heatMs (set ops, see
// food.js), so progress is read from the clock, not ticked per frame: a
// reload or a trip to the map mid-cook picks up where it was. The doneness
// itself is an `inc`. Timers run ONLY while something is on heat or warm:
// one step timeout (the soonest due step) and one coarse ambient timeout
// (steam, sizzle); none at all otherwise, and no animation frames ever.
// Two iPads: only the sequencing iPad (solo or host) writes heat ops, so a
// step is never counted twice; a guest just draws the steam.
//
//   const heat = createHeat({ store, catalog, behaviors, m, room, fx, pieceApi });
//   hooks = heat.wrap(hooks);      // after prep.wrap, before createRoomView
//   heat.bind(view);               // after it
//   heat.afterPieceTap(pid)        // the sink tap fills a saucepan in the basin
//   heat.isHot(entity)             // warm from the heat (or on it right now)
//   heat.heated()                  // [{id, where, burner}] on heat now
//   heat.tune({stepMs, ovenMs, warmMs})   // tests
//   heat.destroy()

import { getEntity, inRoom, childrenOf, locate } from '../engine/world.js';
import { ON_EPS, EDGE_TOL } from '../engine/surfaces.js';
import { paintSprite } from '../engine/sprites.js';
import * as tween from '../engine/tween.js';
import { resolveBehaviors } from '../core/behaviors/index.js';
import {
  HEAT, DONENESS_MAX, donenessOf, isHeating, heatDue, isWarm, cookPlan, pourOf, scoopOf, BATTER_HEX,
} from '../core/food.js';

export const BURNER_REACH = 72;     // a thing's middle within this of a burner sits on it
export const AMBIENT_MS = 700;      // steam / sizzle cadence while something is on heat or warm
export const LADLE_REACH = 120;     // the ladle's bowl within this of a saucepan's middle dips in
export const FLICK_VY = -0.8;       // units/ms upward at release: a flick of the pan flips it
export const FLIP_MS = 720;
export const POTS = ['saucepan'];
export const PANS = ['pan'];
export const LADLES = ['ladle'];
export const SERVE_INTO = ['bowl', 'plate'];

const r1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

/** The burners, the stovetop and the oven rack from the manifest room. Pure. */
export function heatSpots(m) {
  const surf = (id) => (m.surfaces || []).find((s) => s.id === id) || null;
  const burners = (m.slots || []).filter((s) => s.kind === 'burner' && Array.isArray(s.at))
    .map((s) => ({ id: s.id, piece: s.piece || s.id, x: s.at[0], y: s.at[1] }));
  return { burners, stovetop: surf('stovetop'), rack: surf('oven-rack') };
}

const onSurface = (s, e) => !!s && Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL;

/**
 * Which top-level things are on heat now: Map id -> {where: 'stove'|'oven', burner}.
 * lit(piece): is that burner on; ovenShut: the oven door is closed;
 * centerOf(e): the x of a thing's middle (a pan's bowl, not its handle);
 * heatable(e): cookware or food. Pure.
 */
export function heatedThings(things, spots, { lit = () => false, ovenShut = false, centerOf = (e) => e.x, heatable = () => true } = {}) {
  const out = new Map();
  for (const e of things) {
    if (e.parent || !heatable(e)) continue;
    if (onSurface(spots.stovetop, e)) {
      const cx = centerOf(e);
      let best = null;
      for (const b of spots.burners) {
        const d = Math.abs(cx - b.x);
        if (d <= BURNER_REACH && (!best || d < Math.abs(cx - best.x))) best = b;
      }
      if (best && lit(best.piece)) out.set(e.id, { where: 'stove', burner: best.piece });
    } else if (ovenShut && onSurface(spots.rack, e)) out.set(e.id, { where: 'oven', burner: null });
  }
  return out;
}

export function createHeat({ store, catalog, behaviors, m, room, fx, pieceApi, now = () => Date.now(), isGuest = () => false }) {
  const roomId = room.id;
  const spots = heatSpots(m);
  const T = Object.assign({}, HEAT);
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const stats = { steps: 0, pauses: 0, flips: 0, pours: 0, scoops: 0, serves: 0, fills: 0, dings: 0, ambient: 0, scans: 0 };
  let heated = new Map();
  const lastWhere = new Map();       // id -> where it was last heated (a pause banks that step's progress)
  let view = null;
  let base = null;
  let stepTimer = 0;
  let ambTimer = 0;
  let ambN = 0;
  let queued = false;
  let unsubscribe = null;
  let dead = false;

  const writer = () => !isGuest();
  const stepOf = (where) => (where === 'oven' ? T.ovenMs : T.stepMs);
  const foodParams = (kind) => {
    const k = catalog.get(kind);
    const b = k && resolveBehaviors(k.behaviors).find((q) => q.name === 'food');
    return b ? b.p : null;
  };
  const capacityOf = (kind) => { const p = behaviors.containerOf ? behaviors.containerOf(kind) : null; return p ? p.capacity : 0; };
  const set = (id, key, value) => store.dispatch('set', { id, path: 'props.' + key, value });

  // The x of a thing's middle: cookware art knows where its bowl is (manifest `surface`).
  function centerOf(e) {
    const k = catalog.get(e.kind);
    const a = k && k.art && catalog.manifest && catalog.manifest.props && catalog.manifest.props[k.art.sprite];
    return a && Array.isArray(a.surface) ? e.x + ((a.surface[0] + a.surface[1]) / 2) * k.art.scale : e.x;
  }
  const heatable = (e) => catalog.hasTag(e.kind, 'cookware') || !!foodParams(e.kind);
  const things = () => inRoom(store.state, roomId);

  function scanNow() {
    return heatedThings(things(), spots, {
      lit: (piece) => pieceApi.state(piece) === 'on',
      ovenShut: pieceApi.state('oven-door') === 'closed',
      centerOf,
      heatable,
    });
  }

  // ---- visuals ----
  function topPoint(id, fy = 0.7) {
    const v = view && view.viewOf(id);
    if (!v || !v.sprite) return null;
    const e = getEntity(store.state, id);
    const dx = e && !e.parent ? (centerOf(e) - e.x) * v.scale : 0;
    return { x: v.x + dx, y: v.y - v.sprite.h * v.scale * fy, v };
  }
  function burst(id, type, o = {}, fy = 0.7) {
    const p = topPoint(id, fy);
    if (p && fx) fx.burst(type, p.x, p.y, Object.assign({ count: 2, spread: 30 }, o));
  }
  function ovenPoint() {
    const d = (m.pieces || {})['oven-door'];
    return d ? { x: d.x + d.w / 2, y: d.y + 6 } : null;
  }
  /** The things inside hop (food jumps in a hot pan). */
  function hopKids(id, height = 14, ms = 320) {
    for (const k of childrenOf(store.state, id)) {
      const kv = view && view.viewOf(k.id);
      if (!kv || !kv.body || kv.held) continue;
      const h = Math.round(height * (0.7 + Math.random() * 0.6));
      tween.animate(kv.body, [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: `translate3d(0, ${-h}px, 0) rotate(${Math.random() < 0.5 ? -4 : 4}deg)`, offset: 0.45, easing: 'ease-in' },
        { transform: 'translate3d(0, 0, 0)' },
      ], { duration: ms, easing: 'ease-out' });
    }
  }
  const hasWater = (e) => !!(e && e.props.water);

  function onStart(e, h) {
    if (!view) return;
    if (h.where === 'oven') { view.play('whirr', { pitch: 0.45, gain: 0.35 }); return; }
    view.play(hasWater(e) ? 'bubble' : 'sizzle', { gain: 0.55 });
    burst(e.id, 'steam', { count: 2, spread: 24 });
  }

  function ambientTick() {
    ambTimer = 0;
    if (dead) return;
    stats.ambient++;
    const n = ++ambN;
    const t = now();
    for (const [id, h] of heated) {
      const e = getEntity(store.state, id);
      if (!e) continue;
      if (h.where === 'oven') {
        const p = ovenPoint();
        if (p && fx && n % 2) fx.burst('steam', p.x + (Math.random() - 0.5) * 60, p.y, { count: 1, spread: 10, scale: 0.8 });
        if (n % 4 === 1 && view) view.play('whirr', { pitch: 0.4, gain: 0.18 });
        continue;
      }
      const kids = childrenOf(store.state, id);
      if (hasWater(e)) {
        burst(id, 'bubble', { count: 2, spread: 26, scale: 0.55 }, 0.85);
        burst(id, 'steam', { count: 1, spread: 16 }, 0.95);
        if (n % 3 === 1 && view) view.play('bubble', { pitch: 0.8 + Math.random() * 0.3, gain: 0.3 });
      } else if (kids.length) {
        // A sizzle: oil spatter, a curl of steam, the food jumps a little.
        burst(id, 'bit', { count: 3, spread: 36, color: '#FFE9A8', angle: -90, arc: 140, scale: 0.45 }, 0.9);
        burst(id, 'steam', { count: 1, spread: 16 }, 1.1);
        if (n % 2) hopKids(id, 8, 260);
        if (n % 3 === 1 && view) view.play('sizzle', { gain: 0.3 });
      } else if (n % 3 === 1) burst(id, 'steam', { count: 1, spread: 12, scale: 0.6 }, 0.4);
    }
    // Warm food off the heat: a lazy curl now and then.
    if (view && n % 2 === 0) {
      let k = 0;
      for (const id of view.ids()) {
        if (heated.has(id) || k >= 4) continue;
        const e = getEntity(store.state, id);
        if (!e || !isWarm(e.props, t, T.warmMs) || insideHeated(e)) continue;
        const v = view.viewOf(id);
        if (!v || v.held || v.el.style.visibility === 'hidden') continue;
        burst(id, 'steam', { count: 1, spread: 12, scale: 0.75 }, 1.05);
        k++;
      }
    }
    ambient();
  }

  const insideHeated = (e) => { if (!e.parent) return false; const at = locate(store.state, e.id); return !!at && heated.has(at.top); };

  function anyWarm() {
    if (!view) return false;
    const t = now();
    for (const id of view.ids()) { const e = getEntity(store.state, id); if (e && isWarm(e.props, t, T.warmMs)) return true; }
    return false;
  }

  function ambient() {
    const want = !dead && (heated.size > 0 || anyWarm());
    if (want && !ambTimer) ambTimer = setTimeout(ambientTick, AMBIENT_MS);
    else if (!want && ambTimer) { clearTimeout(ambTimer); ambTimer = 0; }
  }

  function ding() {
    stats.dings++;
    if (view) { view.play('ding', { pitch: 1.2 }); later(160, () => view && view.play('chime')); }
    const p = ovenPoint();
    if (p && fx) { fx.burst('sparkle', p.x, p.y + 60, { count: 8, spread: 100 }); fx.burst('steam', p.x, p.y + 30, { count: 4, spread: 60 }); }
    // The door pops open (a kid can shut it again to bake some more).
    later(260, () => { if (!dead && pieceApi.state('oven-door') === 'closed') pieceApi.tap('oven-door'); });
  }

  // ---- cooking ----
  /** One or more steps of heat on top-level thing e. Returns true if some food changed. */
  function cook(e, where, n, t) {
    const kids = childrenOf(store.state, e.id);
    const plan = cookPlan(e, kids, { oven: where === 'oven', paramsOf: foodParams });
    let changed = false;
    const cookOne = (x) => {
      const by = Math.min(n, DONENESS_MAX - donenessOf(x.props));
      if (by <= 0) return;
      store.dispatch('inc', { id: x.id, path: 'props.cooked', by });
      if (!x.props.method) {
        const p = foodParams(x.kind);
        set(x.id, 'method', plan.method || (p && p.method) || (where === 'oven' ? 'baked' : 'fried'));
      }
      set(x.id, 'hotAt', t);
      changed = true;
    };
    if (plan.self) cookOne(e);
    for (const id of plan.foods) { const k = getEntity(store.state, id); if (k) cookOne(k); }
    if (plan.bake) {
      // A bowl of batter: one combine into a cupcake, in the bowl.
      if (store.dispatch('combine', { ids: plan.bake.ids, resultId: store.newId(), resultKind: plan.bake.kind, parent: e.id, slot: 's0', props: { hotAt: t, method: 'baked' } })) {
        changed = true;
        if (e.props.batter) set(e.id, 'batter', 0);
      }
    }
    set(e.id, 'hotAt', t);      // the pan, pot or tray is hot too
    if (!view) return changed;
    view.repaint(e.id);          // a pot's look follows its pasta
    if (where === 'oven') { if (changed) ding(); return changed; }
    if (changed) {
      view.play(hasWater(e) ? 'bubble' : 'sizzle', { gain: 0.6, pitch: 0.9 + Math.random() * 0.2 });
      hopKids(e.id, 22, 380);
      burst(e.id, 'steam', { count: 3, spread: 34 }, 1.1);
    }
    return changed;
  }

  /** Cook the steps due now; pause: bank the rest and stop heating. */
  function advance(e, where, t, pause = false) {
    const d = heatDue(e.props, stepOf(where), t);
    if (d.steps > 0) { stats.steps += d.steps; cook(e, where, d.steps, t); }
    const cur = getEntity(store.state, e.id);
    if (!cur) return;
    if (pause) {
      stats.pauses++;
      if (num(cur.props.heatMs) !== r1(d.rest)) set(e.id, 'heatMs', r1(d.rest));
      set(e.id, 'heatAt', 0);
    } else if (d.steps > 0) {
      if (num(cur.props.heatMs)) set(e.id, 'heatMs', 0);
      set(e.id, 'heatAt', Math.round(t - d.rest));
    }
  }

  // ---- the loop (runs only while something is on heat) ----
  function scanOnce() {
    stats.scans++;
    const t = now();
    const next = scanNow();
    const w = writer();
    for (const [id, h] of next) {
      const e = getEntity(store.state, id);
      if (!e) continue;
      const prev = lastWhere.get(id);
      if (w && isHeating(e.props) && prev && prev !== h.where) advance(e, prev, t, true);   // stove -> oven: bank it
      const cur = getEntity(store.state, id);
      if (w && cur && !isHeating(cur.props)) set(id, 'heatAt', t);                           // start / resume
      lastWhere.set(id, h.where);
      if (!heated.has(id)) onStart(e, h);
    }
    if (w) {
      for (const e of things()) {
        if (!isHeating(e.props) || next.has(e.id)) continue;
        advance(e, lastWhere.get(e.id) || 'stove', t, true);                                  // off the heat: pause
      }
    }
    heated = next;
  }

  function schedule() {
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = 0; }
    if (dead || !heated.size || !writer()) return;
    const t = now();
    let soon = Infinity;
    for (const [id, h] of heated) {
      const e = getEntity(store.state, id);
      if (e && isHeating(e.props)) soon = Math.min(soon, heatDue(e.props, stepOf(h.where), t).next);
    }
    if (soon === Infinity) return;
    stepTimer = setTimeout(tick, Math.max(20, Math.ceil(soon) + 5));
  }

  function tick() {
    stepTimer = 0;
    if (dead) return;
    const t = now();
    for (const [id, h] of heated) {
      const e = getEntity(store.state, id);
      if (e && isHeating(e.props)) advance(e, h.where, t);
    }
    scan();
  }

  /** Re-check what is on heat (after any store op; coalesced to one pass). */
  function scan() {
    if (dead) return;
    scanOnce();
    schedule();
    ambient();
  }
  function queueScan() {
    if (queued || dead) return;
    queued = true;
    Promise.resolve().then(() => { queued = false; scan(); });
  }

  // ---- flip ----
  function flip(pan) {
    const kids = childrenOf(store.state, pan.id);
    if (!kids.length || !view) return false;
    stats.flips++;
    const pv = view.viewOf(pan.id);
    if (pv) {
      tween.animate(pv.body, [
        { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
        { transform: 'translate3d(-6px, -16px, 0) rotate(-9deg)', offset: 0.18, easing: 'ease-out' },
        { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0.42 },
        { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0.86 },
        { transform: 'translate3d(0, 4px, 0) rotate(3deg)', offset: 0.93 },
        { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
      ], { duration: FLIP_MS, easing: 'ease-in-out' });
    }
    kids.forEach((k, i) => {
      store.dispatch('inc', { id: k.id, path: 'props.flips', by: 1 });
      const kv = view.viewOf(k.id);
      if (!kv || !kv.body || !kv.sprite) return;
      const hh = r1(kv.sprite.h / 2);
      const up = 150 + i * 30;
      // Up, spinning over (scaleY through -1, about its middle), and back down.
      const f = (y, s, r) => ({ transform: `translate3d(0, ${y - hh}px, 0) rotate(${r}deg) scaleY(${s}) translate3d(0, ${hh}px, 0)` });
      tween.animate(kv.body, [
        f(0, 1, 0),
        Object.assign(f(-up * 0.7, 0.25, -10), { offset: 0.25 }),
        Object.assign(f(-up, -1, 0), { offset: 0.5 }),
        Object.assign(f(-up * 0.7, 0.25, 10), { offset: 0.75 }),
        f(0, 1, 0),
      ], { duration: FLIP_MS, easing: 'ease-in-out', delay: i * 60 });
      tween.squash(kv.body, { delay: FLIP_MS + i * 60, amount: 0.9 });
    });
    view.play('whoosh', { pitch: 1.35, gain: 0.8 });
    burst(pan.id, 'sparkle', { count: 3, spread: 50 }, 2.4);
    const hot = heated.has(pan.id);
    later(FLIP_MS - 40, () => {
      if (!view) return;
      view.play(hot ? 'sizzle' : 'thud', { gain: hot ? 0.7 : 0.6, pitch: 1.1 });
      burst(pan.id, hot ? 'steam' : 'puff', { count: 3, spread: 40, scale: 0.6 }, 0.9);
    });
    return true;
  }

  // ---- pour, fill, scoop, serve ----
  const freeSlot = (id, cap) => {
    const used = new Set(childrenOf(store.state, id).map((k) => k.slot));
    for (let i = 0; i < cap; i++) if (!used.has('s' + i)) return 's' + i;
    return null;
  };

  /** A bowl of done batter dropped on a pan (a pancake) or the tray (cookie dough). True if poured. */
  function pour(bowl, target) {
    const kids = childrenOf(store.state, bowl.id);
    const p = pourOf(kids, target.kind);
    if (!p) return false;
    if (p.into === 'dough') {
      if (target.props.dough) return false;
      set(target.id, 'dough', p.batter);
      if (donenessOf(target.props)) set(target.id, 'cooked', 0);
      for (const k of kids) store.dispatch('remove', { id: k.id, hard: true });
    } else {
      const slot = freeSlot(target.id, capacityOf(target.kind) || 2);
      if (!slot) return false;
      if (!store.dispatch('combine', { ids: kids.map((k) => k.id), resultId: store.newId(), resultKind: p.into, parent: target.id, slot, props: { batter: p.batter } })) return false;
    }
    set(bowl.id, 'batter', 0);
    set(bowl.id, 'dirty', 1);         // batter smears: the sink cleans it
    stats.pours++;
    view.play('pour', { pitch: 0.8 });
    view.play('squish', { pitch: 0.8, gain: 0.6 });
    if (heated.has(target.id)) later(200, () => view && view.play('sizzle', { gain: 0.7 }));
    burst(target.id, 'bit', { count: 6, spread: 50, color: BATTER_HEX[p.batter] || BATTER_HEX.plain, angle: -90, arc: 120 }, 0.8);
    burst(target.id, 'sparkle', { count: 5, spread: 60 }, 1);
    const tv = view.viewOf(target.id);
    if (tv) tween.squish(tv.body, { amount: 0.8 });
    return true;
  }

  /** A saucepan in the sink basin fills with water. */
  function fill(pot) {
    if (pot.props.water) return false;
    set(pot.id, 'water', 1);
    stats.fills++;
    if (view) { view.play('pour', { pitch: 1.2 }); later(200, () => view && view.play('bubble', { pitch: 1.3, gain: 0.5 })); }
    return true;
  }
  function fillInSink() {
    const sink = inRoom(store.state, roomId).find((e) => e.kind === 'station-sink');
    if (!sink) return;
    for (const k of childrenOf(store.state, sink.id)) if (POTS.includes(k.kind)) fill(k);
  }

  function ladleMove(e, info) {
    if (e.props.fill === 'soup' || !view) return;
    const st = info.data.ladle || (info.data.ladle = { done: false });
    if (st.done) return;
    // The ladle's bowl: the left end of its sprite (the handle is up right).
    const lv = view.viewOf(e.id);
    if (!lv) return;
    const bx = lv.x - lv.sprite.w * lv.scale * 0.1;
    const by = lv.y - lv.sprite.h * lv.scale * 0.2;
    for (const pot of inRoom(store.state, roomId)) {
      if (!POTS.includes(pot.kind)) continue;
      const pv = view.viewOf(pot.id);
      if (!pv || pv.held) continue;
      const cx = pv.x + (centerOf(pot) - pot.x) * pv.scale;
      const cy = pv.y - 40 * pv.scale;
      if (Math.hypot(bx - cx, by - cy) > LADLE_REACH && Math.hypot(info.x - cx, info.y - cy) > LADLE_REACH) continue;
      const s = scoopOf(pot.props, childrenOf(store.state, pot.id), now());
      if (!s) continue;
      st.done = true;
      stats.scoops++;
      const hotAt = Math.max(num(pot.props.hotAt), ...s.take.map((id) => num((getEntity(store.state, id) || { props: {} }).props.hotAt))) || now();
      for (const id of s.take) store.dispatch('remove', { id, hard: true });
      set(e.id, 'fill', 'soup');
      set(e.id, 'dish', s.dish);
      set(e.id, 'hotAt', hotAt);
      view.repaint(pot.id);
      // Held: the view redraws it on the drop; show the full ladle now.
      const cur = getEntity(store.state, e.id);
      if (cur && base && base.spriteOf) { const sp = base.spriteOf(cur); if (sp && sp.draw === 'img') { paintSprite(lv.body, sp); lv.sprite = sp; lv.spriteKey = sp.key; } }
      view.play('bubble', { pitch: 1.1 });
      view.play('pour', { pitch: 1.3, gain: 0.5 });
      if (fx) fx.burst('drop', cx, cy, { count: 4, spread: 30 });
      burst(pot.id, 'steam', { count: 2, spread: 20 }, 1);
      tween.squish(pv.body, { amount: 0.5 });
      return;
    }
  }

  /** A full ladle dropped on an empty bowl (or plate): it serves the dish. */
  function serve(ladle, target) {
    if (ladle.props.fill !== 'soup' || childrenOf(store.state, target.id).length) return false;
    const dish = typeof ladle.props.dish === 'string' && catalog.has(ladle.props.dish) ? ladle.props.dish : 'soup';
    const at = target.parent ? { parent: target.parent, slot: target.slot || undefined } : { room: target.room, x: target.x, y: target.y, z: target.z || 0 };
    const id = store.newId();
    const hotAt = num(ladle.props.hotAt) || now();
    if (!store.dispatch('combine', Object.assign({ ids: [target.id], resultId: id, resultKind: dish, props: { hotAt, method: 'boiled' } }, at))) return false;
    set(ladle.id, 'fill', 'empty');
    set(ladle.id, 'dish', 0);
    stats.serves++;
    view.play('pour');
    view.play('chime');
    later(30, () => {
      if (!view) return;
      const v = view.viewOf(id);
      if (v) tween.squish(v.body, { amount: 1.1 });
      burst(id, 'sparkle', { count: 6, spread: 60 }, 0.8);
      burst(id, 'heart', { count: 2, spread: 40 }, 1);
      burst(id, 'steam', { count: 2, spread: 20 }, 1.1);
    });
    return true;
  }

  // ---- hooks ----
  function wrap(b) {
    base = b;
    return Object.assign({}, b, {
      // Cookware never catches other cookware (a pot set down by a pan's
      // handle lands on the stove, it doesn't bounce off the pan).
      dropTarget(item, other) {
        if (catalog.hasTag(item.kind, 'cookware') && catalog.hasTag(other.kind, 'cookware')) {
          const pouring = item.kind === 'mixing-bowl' && pourOf(childrenOf(store.state, item.id), other.kind);
          if (!pouring) return false;
        }
        return b.dropTarget ? b.dropTarget(item, other) : false;
      },
      onTap(e, ctx) {
        if (PANS.includes(e.kind) && flip(e)) return true;
        return b.onTap ? b.onTap(e, ctx) : false;
      },
      onDropInto(item, target, ctx) {
        if (item.kind === 'mixing-bowl' && (PANS.includes(target.kind) || target.kind === 'baking-tray') && pour(item, target)) return true;
        if (LADLES.includes(item.kind) && SERVE_INTO.includes(target.kind) && serve(item, target)) return true;
        const handled = b.onDropInto ? b.onDropInto(item, target, ctx) : false;
        if (handled && POTS.includes(item.kind) && target.kind === 'station-sink') {
          const now2 = getEntity(store.state, item.id);
          if (now2 && now2.parent === target.id) fill(now2);
        }
        return handled;
      },
      onDragMove(e, ctx) {
        if (b.onDragMove) b.onDragMove(e, ctx);
        if (ctx.info && LADLES.includes(e.kind)) ladleMove(e, ctx.info);
      },
      onLanded(e, ctx) {
        if (b.onLanded) b.onLanded(e, ctx);
        // A flick upward: the food tosses (the pan lands back where it falls).
        if (PANS.includes(e.kind) && ctx.info && typeof ctx.info.vy === 'number' && ctx.info.vy < FLICK_VY) {
          const cur = getEntity(store.state, e.id);
          if (cur) flip(cur);
        }
      },
    });
  }

  function isHot(e) {
    if (!e) return false;
    if (isWarm(e.props, now(), T.warmMs)) return true;
    const at = locate(store.state, e.id);
    return !!at && heated.has(at.top);
  }

  return {
    wrap,
    bind(v) {
      view = v;
      unsubscribe = store.subscribe(queueScan);
      scan();
    },
    afterPieceTap(pid) {
      if (pid === 'sink-tap' && pieceApi.state('sink-tap') === 'on') fillInSink();
    },
    isHot,
    flip: (id) => { const e = getEntity(store.state, id); return !!e && flip(e); },
    heated: () => [...heated].map(([id, h]) => ({ id, where: h.where, burner: h.burner })),
    tune(o = {}) { Object.assign(T, o); scan(); return Object.assign({}, T); },
    stats: () => ({ ...stats, heated: heated.size, stepTimer: !!stepTimer, ambTimer: !!ambTimer, timers: timers.size + (stepTimer ? 1 : 0) + (ambTimer ? 1 : 0) }),
    spots,
    destroy() {
      dead = true;
      if (unsubscribe) unsubscribe();
      clearTimeout(stepTimer);
      clearTimeout(ambTimer);
      stepTimer = ambTimer = 0;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      view = null;
    },
  };
}

