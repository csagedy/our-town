// Behavior runtime: turns a kind's behavior list (catalog) into the hooks
// createRoomView takes (src/engine/view.js), and guarantees the universal
// fallback: EVERY tap on anything gets an animation, a sound and a sparkle.
// No dead taps, ever: a behavior that did nothing (a cycle at its end, an
// empty bowl's spill, an apple core, an unknown kind) still gets a squish,
// its tap sound and particles.
//
//   const behaviors = createBehaviors({ catalog, store });
//   const view = createRoomView({ ..., behaviors });
//   behaviors.bind(view, fx);                 // for act() and the log
//   behaviors.act(id, 'bite')                 // run a verb (a character eats, P1.10)
//   behaviors.log()                           // recent reactions (tests, debugging)
//
// The reaction context `rx` every behavior hook gets:
//   rx.id, rx.entity, rx.kind (catalog entry), rx.catalog, rx.store, rx.state, rx.room, rx.random
//   rx.play(name, opts)          sound (counted in view.stats)
//   rx.squish(o) rx.wobble(o) rx.shake(o)   body animations (transform only)
//   rx.burst(type, o)            particles ('sparkle' | 'puff' | 'heart') over it
//   rx.set(key, value)           store `set` on props.<key>  (state: on/off, a look index)
//   rx.inc(key, by)              store `inc` on props.<key>  (counts: bites, coins; design.md 6.4)
//   rx.dispatch(op, args)        any other store op; rx.newId() for a spawn
//   rx.children()                what is inside it
//   rx.settleAt(thing, x, y, o)  where a thing dropped at (x, y) rests: {x, y, z}
//   rx.popFrom(id, x, y)         animate a (new or moved) entity popping out from (x, y) to its spot
//   rx.size()                    its drawn {w, h}
//   rx.refuse(sound)             the playful "no": shake, boing, puff
// and records what the reaction did (rx.did = {anim, sound, fx}; rx.via =
// names of the behaviors that reacted) so the fallback fills in the rest.

import { resolveBehaviors } from './registry.js';
import './builtin.js';
import { childrenOf, getEntity, inRoom } from '../../engine/world.js';
import { settle, stackZ, DEPTH_SCALE } from '../../engine/surfaces.js';
import * as tween from '../../engine/tween.js';

export const LOG_MAX = 64;
const round1 = (v) => Math.round(v * 10) / 10;

export function createBehaviors({ catalog, store, random = Math.random }) {
  const lists = new Map();      // kind -> [{name, def, p}]
  const log = [];
  let seq = 0;
  let bound = { view: null, fx: null };

  function listOf(kind) {
    let l = lists.get(kind);
    if (!l) {
      const k = catalog.get(kind);
      l = k ? resolveBehaviors(k.behaviors) : [];
      lists.set(kind, l);
    }
    return l;
  }

  /** The look (art variant) an entity's state asks for, or null (default look). */
  function lookOf(e) {
    const list = listOf(e.kind);
    if (!list.length) return null;
    let kids = null;
    const w = { state: store.state, children: () => kids || (kids = childrenOf(store.state, e.id)) };
    for (const b of list) {
      if (!b.def.look) continue;
      const l = b.def.look(e, b.p, w);
      if (l) return l;
    }
    return null;
  }

  function makeRx(e, view, fx, info, trigger) {
    const did = { anim: false, sound: false, fx: false };
    const room = view.room;
    const vw = () => view.viewOf(e.id);
    const body = (fn, o) => { const v = vw(); if (v) fn(v.body, o); did.anim = true; };
    const rx = {
      trigger, id: e.id, entity: e, kind: catalog.get(e.kind), catalog, store, view, room, info, random, did, via: [], fallback: [],
      get state() { return store.state; },
      play(name, opts) { if (!name) return; view.play(name, opts); did.sound = true; },
      squish: (o) => body(tween.squish, o),
      wobble: (o) => body(tween.wobble, o),
      shake: (o) => body(tween.shake, o),
      burst(type, o = {}) {
        const v = vw();
        const x = v ? v.x : e.x;
        const y = v ? v.y - v.sprite.h * v.scale * 0.6 : e.y - 40;
        const w = v ? v.sprite.w * v.scale : 80;
        if (fx) fx.burst(type, x, y, Object.assign({ count: 5, spread: Math.max(50, w * 0.7) }, o));
        did.fx = true;
      },
      size() { const v = vw(); return v ? { w: v.sprite.w * v.scale, h: v.sprite.h * v.scale } : { w: 80, h: 80 }; },
      set: (key, value) => store.dispatch('set', { id: e.id, path: 'props.' + key, value }),
      inc: (key, by = 1) => store.dispatch('inc', { id: e.id, path: 'props.' + key, by }),
      dispatch: (op, args) => store.dispatch(op, args),
      newId: () => store.newId(),
      children: () => childrenOf(store.state, e.id),
      settleAt(thing, x, y, { floorJitter = false } = {}) {
        const def = room.def;
        const s = catalog.sprite(thing.kind);
        const r = settle(def, { x, y, halfW: (s.w * DEPTH_SCALE[1]) / 2 });
        let ry = r.y;
        if (!r.surface && floorJitter) {
          const f = def.floor;
          const base = y >= f.top ? y : f.top + 60;
          ry = Math.min(f.bottom, Math.max(f.top, base + (random() - 0.4) * 90));
        }
        const z = stackZ(def, r.surface, inRoom(store.state, room.id), thing.id);
        return { x: round1(r.x), y: round1(ry), z };
      },
      popFrom(id, x, y) { if (view.animateFrom) view.animateFrom(id, x, y); },
      refuse(sound) {
        rx.shake();
        rx.play(sound || 'boing', { pitch: 0.8 });
        rx.burst('puff', { count: 4 });
      },
    };
    return rx;
  }

  function record(rx) {
    const entry = {
      seq: ++seq, id: rx.id, kind: rx.entity.kind, trigger: rx.trigger,
      via: rx.via.slice(), fallback: rx.fallback.slice(), did: Object.assign({}, rx.did),
    };
    log.push(entry);
    if (log.length > LOG_MAX) log.shift();
    const v = rx.view.viewOf(rx.id);
    if (v) v.el.dataset.reactions = String(Number(v.el.dataset.reactions || 0) + 1);
    return entry;
  }

  // The universal fallback: whatever the behaviors did not do, do it.
  function fallback(rx, { light = false } = {}) {
    if (!rx.did.anim) { rx.squish(light ? { amount: 0.6 } : undefined); rx.fallback.push('squish'); }
    if (!rx.did.sound) {
      const k = rx.kind;
      const v = rx.view.viewOf(rx.id);
      rx.play((k && k.sounds.tap) || (v && v.sprite.sound) || 'pop', { pitch: 0.95 + random() * 0.1 });
      rx.fallback.push('sound');
    }
    if (!rx.did.fx && !light) { rx.burst('sparkle', { count: 4 }); rx.fallback.push('sparkle'); }
  }

  /** Run every behavior that has hook `hook` for entity e (fresh state per behavior). */
  function runAll(e, rx, hook) {
    for (const b of listOf(e.kind)) {
      const fn = b.def[hook];
      if (!fn) continue;
      const cur = getEntity(store.state, e.id);
      if (!cur) break;                 // eaten / removed by an earlier behavior
      rx.entity = cur;
      if (fn(cur, rx, b.p)) rx.via.push(b.name);
    }
  }

  function gesture(e, ctx, hook) {
    const rx = makeRx(e, ctx.view, ctx.fx, ctx.info, hook === 'onTap' ? 'tap' : 'longPress');
    runAll(e, rx, hook);
    // Gone already (eaten up): it reacted on its way out; nothing to squish.
    if (getEntity(store.state, e.id)) fallback(rx, { light: hook === 'onLongPress' && !rx.via.length });
    return record(rx);
  }

  const hooks = {
    // Kinds not in the catalog: null, so the view asks sprites.spriteFor()
    // (the engine's own placeholders and any other sprite source).
    spriteOf: (e) => (catalog.has(e.kind) ? catalog.sprite(e.kind, lookOf(e)) : null),

    canDrag(e) {
      const k = catalog.get(e.kind);
      if (k && k.fixed) return false;
      for (const b of listOf(e.kind)) if (b.def.canDrag && b.def.canDrag(e, b.p) === false) return false;
      return true;
    },

    onTap(e, ctx) { gesture(e, ctx, 'onTap'); return true; },

    onLongPress(e, ctx) { gesture(e, ctx, 'onLongPress'); },

    dropTarget(item, other) {
      if (item.id === other.id) return false;
      for (const b of listOf(other.kind)) if (b.def.accepts && b.def.accepts(other, item, b.p)) return true;
      return false;
    },

    onDropInto(item, target, ctx) {
      const rx = makeRx(target, ctx.view, ctx.fx, ctx.info, 'drop');
      rx.item = item.id;
      for (const b of listOf(target.kind)) {
        if (!b.def.receive) continue;
        const r = b.def.receive(target, item, rx, b.p);
        if (!r) continue;
        rx.via.push(b.name + ':' + r);
        if (r === 'refuse') {
          // The item bounces back where it came from (view.js), with a squish.
          const iv = ctx.view.viewOf(item.id);
          if (iv) tween.squish(iv.body, { amount: 0.9, delay: 120 });
        }
        record(rx);
        return true;
      }
      return false;
    },

    /** The sound a landing makes: the kind's drop sound, else the surface's. */
    landSound(e, surfaceSound) {
      const k = catalog.get(e.kind);
      return (k && k.sounds.drop) || surfaceSound;
    },
  };

  return Object.assign(hooks, {
    catalog,
    lookOf,
    behaviorsOf: (kind) => listOf(kind).map((b) => b.name),
    /** Use this view (and fx) for act(). */
    bind(view, fx = null) { bound = { view, fx }; },
    /**
     * Run a verb on an entity (e.g. act(id, 'bite') when a character eats).
     * Returns true if some behavior of its kind has the verb and it reacted.
     */
    act(id, verb) {
      const e = getEntity(store.state, id);
      if (!e || !bound.view) return false;
      for (const b of listOf(e.kind)) {
        const fn = b.def.verbs && b.def.verbs[verb];
        if (!fn) continue;
        const rx = makeRx(e, bound.view, bound.fx, null, 'verb:' + verb);
        const ok = !!fn(e, rx, b.p);
        if (ok) rx.via.push(b.name);
        record(rx);
        return ok;
      }
      return false;
    },
    log: () => log.slice(),
  });
}
