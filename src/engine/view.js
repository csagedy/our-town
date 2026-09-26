// Entity views (docs/design.md 2.2, 6.2): mirrors the store's top-level
// entities in one room into pooled DOM elements, and turns drags into
// surface-aware drops.
//
//   const room = mountRoom(stage, def);                     // room.js
//   const view = createRoomView({ stage, store, input, room, fx, behaviors });
//   view.destroy();                                          // before the next room
//
// Rendering
// - One element per entity, taken from a pool and returned to it when the
//   entity leaves the room (elements, their input registration and their
//   sprite DOM are reused; nothing is created per frame).
// - Diff by rev: a store op re-renders only the entities it touched, and
//   only if their `rev` moved. A full sync (boot, load, ops that can shuffle
//   parents) walks inRoom() and still skips every entity whose rev is
//   unchanged. stats().renders counts real renders.
// - Position is transform only: translate3d to the feet point (bottom center)
//   and the depth scale (0.92 back .. 1.08 front). z-index comes from the
//   sort key (surfaces.js): y on the floor, the furniture's depth for things
//   on a surface, then z (stack order). Style writes are skipped when the
//   value is unchanged; will-change is set only while dragging or tweening.
//
// Drag and drop (input.js does the finger work; we only move the element)
// - onDragStart: stop any tween, float above everything (Z_DRAG), 'pickup'.
// - onDragMove: element = start + (dx, dy); the drop target under it (a
//   surface it would land on, or an entity that behaviors.dropTarget accepts)
//   glows. The highlight element changes only when the target changes.
// - onDragEnd: behaviors.onDropInto(entity, target) gets first refusal for an
//   entity target (if it handles the drop and the entity is still here, e.g.
//   a container said "no", it springs back to where it was picked up);
//   otherwise surfaces.settle() picks the resting spot (a
//   surface, or the floor band; x clamped into the room) and ONE store
//   `move` is dispatched. Then a tween shows it: a fall with a small bounce,
//   or a short snap, a landing squash, and the surface's sound.
//
// Behaviors (the P1.8 seam; all optional):
//   spriteOf(entity)                     -> sprite (default sprites.spriteFor(kind, props))
//   canDrag(entity)                      -> false to refuse a drag
//   onTap(entity, ctx)                   -> true to skip the default squish + sound
//   onLongPress(entity, ctx)
//   dropTarget(entity, other)            -> true if `other` accepts `entity` (containers, characters)
//   onDropInto(entity, target, ctx)      -> true if it handled the drop (it dispatches its own ops)
//   onLanded(entity, ctx)                after a settle drop is committed
//   landSound(entity, surfaceSound)      -> the landing sound (default: the surface's)
// ctx = { view, id, el, body, room, store, fx, sfx, tween, sprite, info, play }
// (play(name, opts) plays a sound and counts it in stats()).
//
// A container's look can depend on what is inside it, so when an op moves
// something into or out of a parent (attach, detach, spawn into a parent,
// ...) the parent's sprite is re-checked even though its own rev is unchanged.

import { inRoom, getEntity, locate } from './world.js';
import { settle, sortKey, zIndexFor, depthScale, stackZ, Z_DRAG, DEPTH_SCALE } from './surfaces.js';
import { spriteFor, paintSprite } from './sprites.js';
import * as tween from './tween.js';

const POOL_MAX = 64;
const SINGLE = new Set(['spawn', 'move', 'set', 'inc', 'detach']);   // ops that touch one top-level entity
const MIN_TARGET = 96;       // drop-target boxes are at least this big (units), like the 64pt hit boxes
const round1 = (v) => Math.round(v * 10) / 10;

export function createRoomView({ stage, store, input, room, fx = null, sfx = null, behaviors = {} }) {
  const roomId = room.id;
  const def = room.def;
  const views = new Map();     // entity id -> view
  const pool = [];
  const highlights = [];       // pooled highlight elements
  const stats = { renders: 0, mounts: 0, created: 0, moves: 0, moveMs: 0, maxMoveMs: 0, drops: 0, sounds: 0, lastSound: '' };
  const play = (name, opts) => {
    stats.sounds++;
    stats.lastSound = name;
    if (sfx) sfx.play(name, opts);
  };

  const spriteOf = (e) => (behaviors.spriteOf && behaviors.spriteOf(e)) || spriteFor(e.kind, e.props);

  // ---- elements ----
  function create() {
    const el = document.createElement('div');
    el.className = 'ent';
    el.innerHTML = '<div class="ent-shadow" data-lift-shadow></div><div class="ent-lift" data-lift><div class="ent-body"></div></div>';
    const v = {
      id: null, el, lift: el.children[1], body: el.children[1].firstChild,
      sprite: null, spriteKey: null, rev: -1,
      x: 0, y: 0, z: 0, key: 0, scale: 1, zIndex: '', transform: '',
      held: false, dropping: false, posAnim: null, hl: null, target: null,
    };
    el.__view = v;
    input.register(el, {
      lift: true,
      onTap: (info) => tap(v, info),
      onLongPress: (info) => longPress(v, info),
      onDragStart: (info) => dragStart(v, info),
      onDragMove: (info) => dragMove(v, info),
      onDragEnd: (info) => dragEnd(v, info),
    });
    stats.created++;
    return v;
  }

  function mount(e) {
    const v = pool.pop() || create();
    v.id = e.id;
    v.rev = -1;
    v.el.dataset.id = e.id;
    input.setEnabled(v.el, true);
    views.set(e.id, v);
    render(v, e, false);
    room.depth.appendChild(v.el);
    stats.mounts++;
    return v;
  }

  function unmount(v) {
    views.delete(v.id);
    v.id = null;                        // handlers ignore a released view
    input.setEnabled(v.el, false);      // ends a drag on it (as cancelled)
    hideHighlight(v);
    for (const a of v.el.getAnimations()) a.cancel();
    for (const a of v.body.getAnimations()) a.cancel();
    v.el.remove();
    v.posAnim = null;
    v.held = false;
    if (pool.length < POOL_MAX) pool.push(v);
    else input.unregister(v.el);
  }

  const transformOf = (v, x, y, scale) =>
    `translate3d(${round1(x - v.sprite.w / 2)}px, ${round1(y - v.sprite.h)}px, 0) scale(${scale})`;

  function setTransform(v, t) {
    if (t !== v.transform) { v.el.style.transform = t; v.transform = t; }
  }
  function setZ(v, z) {
    const s = String(z);
    if (s !== v.zIndex) { v.el.style.zIndex = s; v.zIndex = s; }
  }

  /** Render entity e into view v. animate: glide from the old spot (a change from elsewhere). */
  function render(v, e, animate) {
    stats.renders++;
    v.rev = e.rev;
    if (v.held) return;                 // a finger owns it; dragEnd re-renders
    const sprite = spriteOf(e);
    if (sprite.key !== v.spriteKey) {
      v.sprite = sprite;
      v.spriteKey = sprite.key;
      paintSprite(v.body, sprite);
      v.el.style.width = `${sprite.w}px`;
      v.el.style.height = `${sprite.h}px`;
      v.el.dataset.kind = e.kind;
    }
    const { key } = sortKey(def, e.x, e.y);
    v.x = e.x; v.y = e.y; v.z = e.z || 0; v.key = key;
    v.scale = depthScale(def, key);
    setZ(v, zIndexFor(key, v.z));
    const from = v.transform;
    setTransform(v, transformOf(v, e.x, e.y, v.scale));
    if (animate && from && from !== v.transform && !v.dropping) {
      if (v.posAnim) v.posAnim.cancel();
      v.posAnim = tween.slide(v.el, from, v.transform, { duration: 260 });
    }
  }

  // ---- store sync ----
  function sync(state, id) {
    const e = getEntity(state, id);
    const at = e && locate(state, id);
    const here = at && at.top === id && at.room === roomId;
    const v = views.get(id);
    if (!here) { if (v) unmount(v); return; }
    if (!v) mount(e);
    else if (v.rev !== e.rev) render(v, e, true);
  }

  function fullSync(state, animate) {
    const seen = new Set();
    for (const e of inRoom(state, roomId)) {
      seen.add(e.id);
      const v = views.get(e.id);
      if (!v) mount(e);
      else if (v.rev !== e.rev) render(v, e, animate);
    }
    for (const v of [...views.values()]) if (!seen.has(v.id)) unmount(v);
  }

  // Parents whose contents an op changed: the new parent and each moved
  // entity's old one (read from the state before the op).
  function parentsTouched(prev, env) {
    const a = env.args;
    const out = new Set();
    if (a.parent) out.add(a.parent);
    const ids = a.ids ? a.ids : a.id ? [a.id] : [];
    for (const id of ids) {
      const old = prev && prev.entities[id];
      if (old && old.parent) out.add(old.parent);
    }
    return out;
  }

  // Re-check the sprite of mounted parents (a bowl that got soup in it).
  function refreshParents(state, ids) {
    for (const pid of ids) {
      const v = views.get(pid);
      const e = v && getEntity(state, pid);
      if (e && !v.held && spriteOf(e).key !== v.spriteKey) render(v, e, false);
    }
  }

  let prevState = store.state;
  const unsubscribe = store.subscribe((state, env) => {
    const prev = prevState;
    prevState = state;
    if (!env) { fullSync(state, false); return; }
    if (SINGLE.has(env.op) && !(env.op === 'spawn' && env.args.parent)) {
      sync(state, env.args.id);
      if (env.op === 'detach' || env.op === 'move') refreshParents(state, parentsTouched(prev, env));
    } else {
      fullSync(state, true);
      refreshParents(state, parentsTouched(prev, env));
    }
  });

  // ---- behaviors ----
  function ctx(v, info) {
    return { view: api, id: v.id, el: v.el, body: v.body, room, store, fx, sfx, tween, sprite: v.sprite, info, play };
  }
  const entityOf = (v) => (v.id ? getEntity(store.state, v.id) : null);

  function tap(v, info) {
    const e = entityOf(v);
    if (!e) return;
    if (behaviors.onTap && behaviors.onTap(e, ctx(v, info))) return;
    tween.squish(v.body);
    play(v.sprite.sound || 'pop');
    if (fx) fx.burst('sparkle', v.x, v.y - v.sprite.h * v.scale * 0.6, { count: 4, spread: v.sprite.w * 0.7 });
  }

  function longPress(v, info) {
    const e = entityOf(v);
    if (e && behaviors.onLongPress) behaviors.onLongPress(e, ctx(v, info));
  }

  // ---- drop targets ----
  function pickTarget(v, info) {
    const e = entityOf(v);
    if (e && behaviors.dropTarget) {
      // An entity that accepts this one, under the finger (front-most wins).
      let best = null;
      for (const o of views.values()) {
        if (o === v || o.held || !o.sprite) continue;
        const hw = Math.max(o.sprite.w * o.scale, MIN_TARGET) / 2;
        const top = o.y - Math.max(o.sprite.h * o.scale, MIN_TARGET);
        if (info.x < o.x - hw || info.x > o.x + hw || info.y < top || info.y > o.y) continue;
        if (best && Number(best.zIndex) > Number(o.zIndex)) continue;
        const oe = getEntity(store.state, o.id);
        if (oe && behaviors.dropTarget(e, oe)) best = o;
      }
      if (best) return { type: 'entity', id: best.id, view: best };
    }
    const r = settle(def, { x: v.x, y: v.y, halfW: (v.sprite.w * DEPTH_SCALE[1]) / 2 });   // same rule as the drop
    return r.surface ? { type: 'surface', id: r.surface.id, surface: r.surface } : null;
  }

  function showHighlight(v, target) {
    const sameTarget = v.target && target && v.target.type === target.type && v.target.id === target.id;
    if (sameTarget || (!v.target && !target)) return;
    hideHighlight(v);
    v.target = target;
    if (!target) return;
    const h = highlights.find((q) => !q.busy) || newHighlight();
    h.busy = true;
    v.hl = h;
    const st = h.el.style;
    if (target.type === 'surface') {
      const s = target.surface;
      h.el.className = 'drop-hl drop-hl-surface';
      st.width = `${s.x1 - s.x0 + 24}px`;
      st.height = '20px';
      st.transform = `translate3d(${s.x0 - 12}px, ${s.y - 12}px, 0)`;
      st.zIndex = String(zIndexFor(s.depth + 0.5) - 1);
    } else {
      const o = target.view;
      const w = o.sprite.w * o.scale + 36;
      const hh = o.sprite.h * o.scale + 36;
      h.el.className = 'drop-hl drop-hl-entity';
      st.width = `${w}px`;
      st.height = `${hh}px`;
      st.transform = `translate3d(${o.x - w / 2}px, ${o.y - hh + 18}px, 0)`;
      st.zIndex = String(Number(o.zIndex) - 1);
    }
    h.el.dataset.target = `${target.type}:${target.id}`;
    st.visibility = '';
    h.anim = tween.pulse(h.el);
  }

  function newHighlight() {
    const el = document.createElement('div');
    el.className = 'drop-hl';
    room.depth.appendChild(el);
    const h = { el, busy: false, anim: null };
    highlights.push(h);
    return h;
  }

  function hideHighlight(v) {
    v.target = null;
    const h = v.hl;
    if (!h) return;
    v.hl = null;
    h.busy = false;
    if (h.anim) { h.anim.cancel(); h.anim = null; }
    h.el.style.visibility = 'hidden';
    delete h.el.dataset.target;
  }

  // ---- drag ----
  function dragStart(v, info) {
    const e = entityOf(v);
    if (!e) return false;
    if (behaviors.canDrag && behaviors.canDrag(e) === false) return false;
    if (v.posAnim) { v.posAnim.cancel(); v.posAnim = null; }
    for (const a of v.el.getAnimations()) a.cancel();
    // Pick up from where the store says it rests (a cancelled fall snaps there).
    v.x = e.x; v.y = e.y;
    setTransform(v, transformOf(v, v.x, v.y, v.scale));
    v.held = true;
    info.data.x0 = v.x;
    info.data.y0 = v.y;
    setZ(v, Z_DRAG);
    play('pickup');
    return true;
  }

  function dragMove(v, info) {
    if (!v.held) return;
    const t0 = performance.now();
    v.x = info.data.x0 + info.dx;
    v.y = info.data.y0 + info.dy;
    setTransform(v, transformOf(v, v.x, v.y, v.scale));
    showHighlight(v, pickTarget(v, info));
    const ms = performance.now() - t0;
    stats.moves++;
    stats.moveMs += ms;
    if (ms > stats.maxMoveMs) stats.maxMoveMs = ms;
  }

  function dragEnd(v, info) {
    if (!v.held) return;
    const target = v.target;
    hideHighlight(v);
    v.held = false;
    const e = entityOf(v);
    if (!e) return;
    stats.drops++;
    if (target && target.type === 'entity' && behaviors.onDropInto) {
      const te = getEntity(store.state, target.id);
      if (te && behaviors.onDropInto(e, te, ctx(v, info))) {
        const still = views.get(e.id) === v && getEntity(store.state, e.id);
        if (still && v.rev === still.rev) {
          // Not taken (a container refused it): spring back to where it was picked up.
          const from = v.transform;
          render(v, still, false);
          if (v.posAnim) v.posAnim.cancel();
          if (from !== v.transform) v.posAnim = tween.slide(v.el, from, v.transform, { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        } else if (still) render(v, still, true);
        return;
      }
    }
    const from = v.transform;
    // Widest it can get once landed (the front of the floor band), so it never pokes off the room.
    const halfW = (v.sprite.w * DEPTH_SCALE[1]) / 2;
    const r = settle(def, { x: v.x, y: v.y, halfW });
    const z = stackZ(def, r.surface, inRoom(store.state, roomId), e.id);
    v.dropping = true;
    const env = store.dispatch('move', { id: e.id, room: roomId, x: round1(r.x), y: round1(r.y), z });
    v.dropping = false;
    const now = views.get(e.id) === v ? getEntity(store.state, e.id) : null;
    if (!now) return;
    if (!env || v.rev !== now.rev) render(v, now, false);   // refused: go back to where it was
    const to = v.transform;
    if (v.posAnim) v.posAnim.cancel();
    let landAt = 0;
    if (!env) {
      v.posAnim = tween.slide(v.el, from, to, { duration: 220 });
      tween.squish(v.body, { amount: 0.6 });
      play('squeak');
      return;
    }
    if (r.fall) {
      const f = tween.fall(v.el, from, to, { dist: r.dist });
      v.posAnim = f.anim;
      landAt = f.landAt;
    } else if (from !== to) {
      v.posAnim = tween.slide(v.el, from, to, { duration: 140 });
      landAt = 100;
    }
    tween.squash(v.body, { delay: landAt, amount: r.fall ? Math.min(1.4, 0.6 + r.dist / 400) : 0.7 });
    const sound = (behaviors.landSound && behaviors.landSound(now, r.sound)) || r.sound;
    if (landAt) setTimeout(() => play(sound), landAt); else play(sound);
    if (behaviors.onLanded) behaviors.onLanded(now, ctx(v, info));
  }

  // ---- API ----
  const api = {
    room,
    /** The view for an entity id (for behaviors and tests): {el, body, x, y, z, key, scale, zIndex, sprite} */
    viewOf: (id) => views.get(id) || null,
    ids: () => [...views.keys()],
    /** Play a sound (counted in stats). */
    play,
    /**
     * Animate entity `id` popping out from world point (x, y) (feet) to where
     * it rests now: a spawner's new thing, a spilled one. False if not drawn.
     */
    animateFrom(id, x, y) {
      const v = views.get(id);
      if (!v || v.held) return false;
      if (v.posAnim) v.posAnim.cancel();
      const from = transformOf(v, x, y, v.scale);
      const dist = Math.max(40, v.y - y);
      const f = tween.fall(v.el, from, v.transform, { dist });
      v.posAnim = f.anim;
      tween.squash(v.body, { delay: f.landAt, amount: 0.8 });
      return true;
    },
    /** Resync from the store (rev-diffed). */
    refresh: () => fullSync(store.state, false),
    stats: () => ({ ...stats, views: views.size, pooled: pool.length, highlights: highlights.length }),
    resetStats() { for (const k of Object.keys(stats)) if (k !== 'created') stats[k] = k === 'lastSound' ? '' : 0; },
    destroy() {
      unsubscribe();
      for (const v of [...views.values()]) unmount(v);
      for (const v of pool) input.unregister(v.el);
      pool.length = 0;
      for (const h of highlights) h.el.remove();
      highlights.length = 0;
    },
  };
  fullSync(store.state, false);
  return api;
}
