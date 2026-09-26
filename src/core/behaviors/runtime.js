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
//   behaviors.act(id, 'bite', {at})           // run a verb (a character eats, P1.10; fx at `at`)
//   behaviors.log()                           // recent reactions (tests, debugging)
//   behaviors.tidy()                          // P1.9 "go home": loose things back to their catalog home
//   behaviors.enforceCap()                    // P1.9 room entity cap (runs after every spawner clone)
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
//   rx.where()                   where it is drawn in the room {x, y} (a thing inside a container too)
//   rx.spots(things, {from})     distinct free resting spots near `from` for [{id, kind}]: [{id, x, y, z}]
//   rx.slotFor(p, item)          the free slot a drop should take (nearest the finger), or null when full
//   rx.hopKids({height})         the things inside it hop (a peek, a "no room" refusal)
//   rx.goHome(id, {to})          a clone goes home: a puff where it was, a sparkle at `to`, a hard remove
//   rx.enforceCap(keepIds)       keep the room at its entity cap (oldest untouched clones go home)
//   rx.reason                    optional word for the log ('full', 'wrong', 'back'...)
// and records what the reaction did (rx.did = {anim, sound, fx}; rx.via =
// names of the behaviors that reacted) so the fallback fills in the rest.
//
// Containers (P1.9): layoutOf(parent, kids) tells the view where the things
// inside a container are drawn (the container behavior's layout params,
// src/core/containers.js); cloneFor(spawner) makes the clone a drag pulls
// out of a spawner. The runtime remembers what a kid touched recently (this
// session only) so the entity cap never sends home something just placed.

import { resolveBehaviors } from './registry.js';
import './builtin.js';
import './cafe.js';
import './site.js';     // P2c.1: build pieces, the hose
import { childrenOf, getEntity, inRoom } from '../../engine/world.js';
import { settle, stackZ, DEPTH_SCALE } from '../../engine/surfaces.js';
import * as tween from '../../engine/tween.js';
import { layoutSlots, pickSlot, planSpill, planCap, planTidy, DEFAULT_CAP } from '../containers.js';

export const LOG_MAX = 64;
export const RECENT_MS = 30000;   // a clone placed this recently never goes home to keep the cap
const round1 = (v) => Math.round(v * 10) / 10;

// random: looked up on each roll by default (not captured at mount), so a test
// that pins Math.random for one gesture really gets that pick.
export function createBehaviors({ catalog, store, random = () => Math.random() }) {
  const lists = new Map();      // kind -> [{name, def, p}]
  const log = [];
  let seq = 0;
  let bound = { view: null, fx: null };
  const touched = new Map();    // id -> performance time a kid last placed / tapped it (session only)
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const touch = (id) => { touched.set(id, now()); };

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

  /** The container params of a kind (its `container` behavior), or null. */
  function containerOf(kind) {
    for (const b of listOf(kind)) if (b.name === 'container') return b.p;
    return null;
  }

  /** The drawn size of an entity (its sprite in its current look). */
  function sizeOf(e) {
    const s = (e.props && hooks.spriteOf(e)) || catalog.sprite(e.kind);
    return { w: s.w, h: s.h };
  }

  /** Where an entity is drawn in the room: its view's world feet point, else its stored x, y. */
  function whereOf(view, e) {
    const v = view && view.viewOf(e.id);
    return v ? { x: v.x, y: v.y } : { x: e.x, y: e.y };
  }

  /** Free resting spots near `from` for things [{id, kind}] in the view's room. */
  function spotsFor(view, things, from, gap) {
    const room = view.room;
    const skip = new Set(things.map((t) => t.id));
    const others = [];
    for (const o of inRoom(store.state, room.id)) {
      if (skip.has(o.id)) continue;
      if (catalog.hasTag(o.kind, 'station')) continue;   // invisible prep stations take no room (P2a.2)
      const v = view.viewOf(o.id);
      if (v && v.held) continue;
      const sz = sizeOf(o);
      others.push({ x: o.x, y: o.y, w: sz.w * DEPTH_SCALE[1], h: sz.h * DEPTH_SCALE[1] });
    }
    // Sizes at the largest depth scale: drawn boxes never touch, front or back.
    const items = things.map((t) => {
      const sz = t.kind ? sizeOf(t) : { w: 60, h: 60 };
      return { id: t.id, w: sz.w * DEPTH_SCALE[1], h: sz.h * DEPTH_SCALE[1] };
    });
    const plan = planSpill({ room: room.def, from, items, others, gap });
    const state = store.state;
    const placedOn = new Map();
    return plan.map((sp) => {
      let z = 0;
      if (sp.surface) {
        const s = room.def.surfaces.find((q) => q.id === sp.surface);
        z = stackZ(room.def, s, inRoom(state, room.id), sp.id) + (placedOn.get(sp.surface) || 0);
        placedOn.set(sp.surface, (placedOn.get(sp.surface) || 0) + 1);
      }
      return { id: sp.id, x: sp.x, y: sp.y, z: Math.min(99, z) };
    });
  }

  /** Ids a finger holds right now, plus things a kid placed within RECENT_MS. */
  function keepSet(view, extra = [], recent = true) {
    const keep = new Set(extra);
    if (view && view.heldIds) for (const id of view.heldIds()) keep.add(id);
    const t = now();
    for (const [id, at] of touched) {
      if (t - at >= RECENT_MS) touched.delete(id);
      else if (recent) keep.add(id);
    }
    return keep;
  }

  /** A clone goes home: a puff where it was drawn, a sparkle at its spawner, a hard remove. */
  function goHome(view, fx, id, to) {
    const e = getEntity(store.state, id);
    if (!e) return false;
    const at = whereOf(view, e);
    const h = sizeOf(e).h;
    if (!store.dispatch('remove', { id, hard: true })) return false;
    touched.delete(id);
    if (fx) {
      fx.burst('puff', at.x, at.y - h * 0.5, { count: 5, spread: 50 });
      const s = to && getEntity(store.state, to);
      if (s) { const sa = whereOf(view, s); fx.burst('sparkle', sa.x, sa.y - sizeOf(s).h * 0.7, { count: 3, spread: 40 }); }
    }
    return true;
  }

  /** Keep a room at its cap (room.def.cap, default 120). Returns the ids sent home. */
  function enforceCap(view, fx, extraKeep = []) {
    if (!view) return [];
    const cap = view.room.def.cap || DEFAULT_CAP;
    const ids = planCap(store.state, view.room.id, { cap, keep: keepSet(view, extraKeep) });
    const gone = [];
    for (const id of ids) {
      const e = getEntity(store.state, id);
      if (e && goHome(view, fx, id, e.props.from)) gone.push(id);
    }
    if (gone.length) view.play('whoosh', { pitch: 1.4, gain: 0.5 });
    return gone;
  }

  function makeRx(e, view, fx, info, trigger, at = null) {
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
        // Not drawn on its own (in a character's hand): at the given point.
        const x = v ? v.x : at ? at.x : e.x;
        const y = v ? v.y - v.sprite.h * v.scale * 0.6 : at ? at.y : e.y - 40;
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
      where: () => whereOf(view, getEntity(store.state, e.id) || e),
      spots: (things, { from = rx.where(), gap } = {}) => spotsFor(view, things, from, gap),
      slotFor(p, item) {
        const cur = getEntity(store.state, e.id) || e;
        const kids = childrenOf(store.state, e.id).map((k) => Object.assign({ id: k.id, slot: k.slot }, sizeOf(k)));
        const v = view.viewOf(e.id);
        const local = v && info && typeof info.x === 'number' && v.scale
          ? { x: (info.x - v.x) / v.scale, y: (info.y - v.y) / v.scale } : null;
        return pickSlot(p, sizeOf(cur), kids, local);
      },
      hopKids({ height = 0.5 } = {}) {
        for (const k of childrenOf(store.state, e.id)) {
          const kv = view.viewOf(k.id);
          if (!kv || !kv.body || !kv.sprite) continue;
          const d = Math.round(kv.sprite.h * height);
          tween.animate(kv.body, [
            { transform: 'translate3d(0, 0, 0)' },
            { transform: `translate3d(0, ${-d}px, 0)`, offset: 0.4, easing: 'ease-in' },
            { transform: 'translate3d(0, 0, 0)' },
          ], { duration: 560, delay: Math.round(random() * 90), easing: 'ease-out' });
          did.anim = true;
        }
      },
      goHome: (id, { to = null } = {}) => { if (goHome(view, fx, id, to)) did.fx = true; },
      enforceCap: (keepIds = []) => enforceCap(view, fx, keepIds),
      reason: null,
    };
    return rx;

  }

  function record(rx) {
    const entry = {
      seq: ++seq, id: rx.id, kind: rx.entity.kind, trigger: rx.trigger,
      via: rx.via.slice(), fallback: rx.fallback.slice(), did: Object.assign({}, rx.did),
    };
    if (rx.reason) entry.reason = rx.reason;
    if (rx.item) entry.item = rx.item;
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
    // A behavior with a `sprite` hook (the Mystery Dish's composite) draws it whole.
    spriteOf(e) {
      if (!catalog.has(e.kind)) return null;
      for (const b of listOf(e.kind)) {
        if (!b.def.sprite) continue;
        const s = b.def.sprite(e, b.p, { catalog, look: lookOf(e), children: () => childrenOf(store.state, e.id) });
        if (s) return s;
      }
      return catalog.sprite(e.kind, lookOf(e));
    },

    canDrag(e) {
      const k = catalog.get(e.kind);
      if (k && k.fixed) return false;
      for (const b of listOf(e.kind)) if (b.def.canDrag && b.def.canDrag(e, b.p) === false) return false;
      return true;
    },

    onTap(e, ctx) { touch(e.id); gesture(e, ctx, 'onTap'); return true; },

    onLongPress(e, ctx) { gesture(e, ctx, 'onLongPress'); },

    dropTarget(item, other) {
      if (item.id === other.id) return false;
      for (const b of listOf(other.kind)) if (b.def.accepts && b.def.accepts(other, item, b.p)) return true;
      return false;
    },

    onDropInto(item, target, ctx) {
      touch(item.id);
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

    /** A drop landed on a surface or the floor: the kid placed it on purpose. */
    onLanded(e) { touch(e.id); },

    /**
     * Where the things inside `parent` are drawn (view.js nests their
     * elements in the parent's): Map id -> {x, y, z, scale, front, hidden},
     * or null if its kind has no container layout (things held by a
     * character's hand are drawn by the character, P1.10).
     */
    layoutOf(parent, kids) {
      const p = containerOf(parent.kind);
      if (!p) return null;
      const lay = layoutSlots(p, sizeOf(parent), kids.map((k) => Object.assign({ id: k.id, slot: k.slot }, sizeOf(k))));
      for (const b of listOf(parent.kind)) if (b.def.layoutKids) b.def.layoutKids(parent, kids, lay, b.p, { sizeOf, box: sizeOf(parent) });
      return lay;
    },

    /** A drag starting on a spawner: the id of the new clone the finger carries, or null. */
    cloneFor(e, ctx) {
      for (const b of listOf(e.kind)) {
        if (!b.def.dragOut) continue;
        const rx = makeRx(e, ctx.view, ctx.fx, ctx.info, 'dragOut');
        const id = b.def.dragOut(e, rx, b.p);
        if (!id) continue;
        rx.via.push(b.name);
        rx.item = id;
        record(rx);
        touch(id);
        return id;
      }
      return null;
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
     * opts.at: world point for its particles when it has no view of its own
     * (food in a character's hand bites at the mouth).
     */
    act(id, verb, { at = null } = {}) {
      const e = getEntity(store.state, id);
      if (!e || !bound.view) return false;
      for (const b of listOf(e.kind)) {
        const fn = b.def.verbs && b.def.verbs[verb];
        if (!fn) continue;
        const rx = makeRx(e, bound.view, bound.fx, null, 'verb:' + verb, at);
        const ok = !!fn(e, rx, b.p);
        if (ok) rx.via.push(b.name);
        record(rx);
        return ok;
      }
      return false;
    },
    log: () => log.slice(),
    /** Container params for a kind (its `container` behavior), or null. */
    containerOf,
    /** Keep the bound view's room at its cap now. Returns the ids sent home. */
    enforceCap: (keepIds = []) => enforceCap(bound.view, bound.fx, keepIds),
    /**
     * "Go home" (a hidden parent hook for now; P1.16's parent menu later):
     * every loose thing in the bound view's room goes back to its catalog
     * `home`. Clones go back into their spawner; {spawner} things go into
     * that spawner (inside it if it also holds things and has room, else they
     * vanish into it); {room} things in the wrong room travel home. Held
     * things and furniture stay. Returns [{id, how, to}] of what moved.
     */
    tidy() {
      const view = bound.view;
      if (!view) return [];
      const plan = planTidy(store.state, view.room.id, {
        homeOf: (kind) => catalog.homeOf(kind),
        fixedOf: (kind) => { const k = catalog.get(kind); return !!(k && k.fixed); },
        keep: keepSet(view, [], false),
      });
      const done = [];
      for (const step of plan) {
        const e = getEntity(store.state, step.id);
        if (!e) continue;
        if (step.how === 'travel') {
          const at = whereOf(view, e);
          if (store.dispatch('travel', { ids: [step.id], to: step.to })) {
            if (bound.fx) bound.fx.burst('puff', at.x, at.y - sizeOf(e).h * 0.5, { count: 4 });
            done.push(step);
          }
          continue;
        }
        // Home is a spawner: inside it if it is also a container with room.
        const sp = step.to && getEntity(store.state, step.to);
        const p = sp && typeof e.props.from !== 'string' && containerOf(sp.kind);
        if (p) {
          const kids = childrenOf(store.state, sp.id).map((k) => Object.assign({ id: k.id, slot: k.slot }, sizeOf(k)));
          const tags = catalog.tagsOf(e.kind);
          const slot = (p.accepts.includes('*') || p.accepts.some((t) => tags.includes(t))) && pickSlot(p, sizeOf(sp), kids);
          if (slot && store.dispatch('attach', { id: e.id, parent: sp.id, slot })) { done.push({ id: e.id, how: 'into', to: sp.id }); continue; }
        }
        if (goHome(view, bound.fx, step.id, step.to)) done.push(step);
      }
      if (done.length) view.play('whoosh', { pitch: 1.2 });
      return done;
    },
  });

}
