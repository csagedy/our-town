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
// Custom entities (P1.10 characters, src/engine/characters.js; all optional):
//   sortKeyOf(entity)                    -> a sort key overriding sortKey() (a seated character), or null
//   onRender(entity, ctx)                after the view drew the entity (update a live SVG in place)
//   onDragStart(entity, ctx)             after a drag of it started (a character dangles)
//   onDragMove(entity, ctx)              on every drag move
//   dropSpot(entity, x, y)               -> {id, x0, x1, y, depth} to glow while dragging (a seat), or null
//   onDrop(entity, ctx)                  -> true if it placed itself (dispatched its ops, runs its own tween)
// UI over the room (P1.14 pocket tray, src/scenes/carry.js; all optional):
//   overUi(entity, info)                 -> true while the finger is over UI that takes drops (no room target glows)
//   dropOnUi(entity, ctx)                -> true if that UI took the drop (it dispatched the ops); checked first
// view.repaint(id) re-renders one entity (its sprite may depend on things
// the view does not track, e.g. what a character holds); view.handoff(id,
// info) lets another gesture carry entity `id` (a held item pulled out of a hand).
// ctx = { view, id, el, body, room, store, fx, sfx, tween, sprite, info, play }
// (play(name, opts) plays a sound and counts it in stats()).
//
// A container's look can depend on what is inside it, so when an op moves
// something into or out of a parent (attach, detach, spawn into a parent,
// ...) the parent's sprite is re-checked even though its own rev is unchanged.
//
// Containers (P1.9; all optional):
//   layoutOf(parent, kids)               -> Map id -> {x, y, z, scale, front, hidden} or null
//   cloneFor(entity, ctx)                -> id of a new entity a drag on `entity` pulls out (a spawner)
// Things inside a container with a layout are drawn too: each child's element
// is nested inside its container's lift element, at its slot (x, y: feet
// offset from the container's feet in its units; front: over the container's
// body, else behind it, peeking over the rim). So a child rides along with no
// extra work when the container is dragged or tweened, nested containers too
// (a tray holding a plate holding a cupcake). v.x, v.y, v.scale of a child
// are kept in world units (its drawn feet point and total scale), so drop
// targets, particles and hit boxes work for children like for anything
// else. Dragging a child lifts it out: its element moves to the room layer
// for the drag; a drop anywhere re-parents it (or it springs back into its
// slot). A drag that starts on a spawner carries the clone cloneFor makes
// (view.handoff) and the spawner stays put. Kids of a parent without a
// layout (a character's hands) are not drawn here.
//
// Text layer (P1.16, design.md 4; optional): labels = { of(entity) -> text
// or null, say(text, el) }. A top-level entity with a label gets a small
// name tag (.ent-label under its feet, created on first need). CSS shows the
// tags only while body.text-layer is on (src/ui/parent.css), so toggling
// the layer is one class and no re-render. A tap on a visible tag reads it
// (labels.say) instead of tapping the thing; a drag from it still drags.

import { inRoom, getEntity, locate } from './world.js';
import { settle, sortKey, zIndexFor, depthScale, stackZ, Z_DRAG, DEPTH_SCALE } from './surfaces.js';
import { spriteFor, paintSprite } from './sprites.js';
import * as tween from './tween.js';

const POOL_MAX = 64;
const SINGLE = new Set(['spawn', 'move', 'set', 'inc', 'detach']);   // ops that touch one top-level entity
const MIN_TARGET = 96;       // drop-target boxes are at least this big (units), like the 64pt hit boxes
const round1 = (v) => Math.round(v * 10) / 10;

export function createRoomView({ stage, store, input, room, fx = null, sfx = null, behaviors = {}, labels = null }) {
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
      parentView: null, kids: new Set(), local: null, detached: false, proxy: null,
    };
    // The lift is a stacking context with the body at z 50: things inside a
    // container (nested .ent elements, z 1..49 behind the body, 51..99 in front).
    v.lift.style.zIndex = '0';
    v.body.style.zIndex = '50';
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

  function mount(e, pv = null, local = null) {
    const v = pool.pop() || create();
    v.id = e.id;
    v.rev = -1;
    v.el.dataset.id = e.id;
    v.parentView = pv;
    v.local = local;
    v.detached = false;
    if (pv) pv.kids.add(v);
    input.setEnabled(v.el, true);
    views.set(e.id, v);
    render(v, e, false);
    (pv ? pv.lift : room.depth).appendChild(v.el);
    stats.mounts++;
    return v;
  }

  // Move a view's element under a new parent view (null: the room layer).
  function reattach(v, pv) {
    if (v.parentView) v.parentView.kids.delete(v);
    v.parentView = pv;
    v.detached = false;
    if (pv) pv.kids.add(v);
    const host = pv ? pv.lift : room.depth;
    if (v.el.parentNode !== host) host.appendChild(v.el);
  }

  function unmount(v) {
    if (v.id == null || views.get(v.id) !== v) return;
    for (const k of [...v.kids]) unmount(k);   // the things inside it leave with it
    v.kids.clear();
    if (v.parentView) v.parentView.kids.delete(v);
    v.parentView = null;
    v.local = null;
    v.detached = false;
    v.proxy = null;
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
  // A child's transform inside its parent's box: feet at the parent's feet + (lx, ly).
  const localTransformOf = (v, pv, lx, ly, scale) =>
    `translate3d(${round1(pv.sprite.w / 2 + lx - v.sprite.w / 2)}px, ${round1(pv.sprite.h + ly - v.sprite.h)}px, 0) scale(${round1(scale * 1000) / 1000})`;
  const inContainer = (v) => !!(v.parentView && !v.detached);

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
    place(v, e, animate);
    if (labels) setLabel(v, e);
    if (behaviors.onRender) behaviors.onRender(e, ctx(v, null));
  }

  // Text layer name tag (see the header). Things inside a container stay unlabeled.
  function setLabel(v, e) {
    const text = (!v.parentView && labels.of(e)) || '';
    if (text === (v.labelText || '')) return;
    v.labelText = text;
    if (!v.label) {
      v.label = document.createElement('div');
      v.label.className = 'ent-label';
      v.label.innerHTML = '<span></span>';
      v.el.appendChild(v.label);
    }
    v.label.firstChild.textContent = text;
    v.label.hidden = !text;
  }
  function labelHit(v, info) {
    if (!v.labelText || !labels.say || !document.body.classList.contains('text-layer')) return false;
    const b = v.label.firstChild.getBoundingClientRect();
    return info.sx >= b.left - 8 && info.sx <= b.right + 8 && info.sy >= b.top - 8 && info.sy <= b.bottom + 8;
  }

  /** Position v (transform, z, world x/y/scale) from e, then its children's world coordinates. */
  function place(v, e, animate) {
    const from = v.transform;
    if (inContainer(v)) {
      const pv = v.parentView;
      const L = v.local || { x: 0, y: 0, z: 0, scale: 1, front: true };
      v.x = pv.x + L.x * pv.scale;
      v.y = pv.y + L.y * pv.scale;
      v.z = L.z;
      v.key = pv.key;
      v.scale = pv.scale * L.scale;
      setZ(v, (L.front ? 51 : 1) + L.z);   // the parent's body is z 50 in its lift
      setTransform(v, localTransformOf(v, pv, L.x, L.y, L.scale));
    } else {
      const custom = behaviors.sortKeyOf ? behaviors.sortKeyOf(e) : null;
      const key = custom != null ? custom : sortKey(def, e.x, e.y).key;
      v.x = e.x; v.y = e.y; v.z = e.z || 0; v.key = key;
      v.scale = depthScale(def, key);
      setZ(v, zIndexFor(key, v.z));
      setTransform(v, transformOf(v, e.x, e.y, v.scale));
    }
    if (animate && from && from !== v.transform && !v.dropping) {
      if (v.posAnim) v.posAnim.cancel();
      v.posAnim = tween.slide(v.el, from, v.transform, { duration: 260 });
    }
    placeKids(v);
  }

  // A container moved or changed look: its children's world coordinates (and
  // their transforms, which depend on its sprite size) follow.
  function placeKids(v) {
    for (const k of v.kids) {
      if (k.held || k.detached || !k.sprite) continue;
      const ke = getEntity(store.state, k.id);
      if (ke) place(k, ke, false);
    }
  }

  /** Slide v from world point (x, y) at scale s to where it is now drawn. */
  function glideFrom(v, w, opts) {
    const to = v.transform;
    let from;
    if (inContainer(v)) {
      const pv = v.parentView;
      from = localTransformOf(v, pv, (w.x - pv.x) / pv.scale, (w.y - pv.y) / pv.scale, w.s / pv.scale);
    } else from = transformOf(v, w.x, w.y, w.s);
    if (v.posAnim) v.posAnim.cancel();
    v.posAnim = from !== to ? tween.slide(v.el, from, to, opts) : null;
  }

  // ---- store sync ----
  function sync(state, id) {
    const e = getEntity(state, id);
    const v = views.get(id);
    if (v && v.parentView) {
      // A thing inside a container: a look change can move its neighbours (a stack).
      if (e && e.parent === v.parentView.id && !v.detached) {
        if (v.rev !== e.rev) {
          const key = v.spriteKey;
          render(v, e, true);
          if (key !== v.spriteKey) fullSync(state, true);
        }
      } else fullSync(state, true);
      return;
    }
    const at = e && locate(state, id);
    const here = at && at.top === id && at.room === roomId;
    if (!here) { if (v) unmount(v); return; }
    if (!v) fullSync(state, true);        // mounts it with whatever it carries
    else if (v.rev !== e.rev) render(v, e, true);
  }

  const sameLocal = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z && a.scale === b.scale && a.front === b.front;

  function fullSync(state, animate) {
    const seen = new Set();
    // Children by parent, once per sync (childrenOf would scan per container).
    const kidsOf = new Map();
    for (const k in state.entities) {
      const c = state.entities[k];
      if (!c.parent || !getEntity(state, k) || !getEntity(state, c.parent)) continue;
      if (!kidsOf.has(c.parent)) kidsOf.set(c.parent, []);
      kidsOf.get(c.parent).push(c);
    }
    const visit = (e, pv, L) => {
      if (seen.has(e.id)) return;
      seen.add(e.id);
      let v = views.get(e.id);
      if (!v) v = mount(e, pv, L);
      else if (!v.held && (v.detached || v.parentView !== pv)) {
        reattach(v, pv);
        v.local = L;
        render(v, e, false);
      } else {
        const moved = !!L && !sameLocal(v.local, L);
        v.local = L;
        if (v.rev !== e.rev) render(v, e, animate);
        else if (moved && !v.held) place(v, e, animate);
      }
      const kids = kidsOf.get(e.id);
      if (!kids || !behaviors.layoutOf) return;
      kids.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const lay = behaviors.layoutOf(e, kids);
      if (!lay) return;
      for (const c of kids) {
        const cl = lay.get(c.id);
        if (cl && !cl.hidden) visit(c, v, cl);
      }
    };
    for (const e of inRoom(state, roomId)) visit(e, null, null);
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
    const a = env.args;
    const was = a.id && prev ? prev.entities[a.id] : null;
    // Fast path: one entity that is not moving into or out of a container.
    const single = env.op === 'set' || env.op === 'inc'
      || (SINGLE.has(env.op) && !a.parent && !(was && was.parent && env.op !== 'spawn'));
    if (single) {
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
    if (labels && labelHit(v, info)) { labels.say(v.labelText, v.label); return; }
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
    if (e && behaviors.overUi && behaviors.overUi(e, info)) return null;   // over UI (the pocket): no room target
    const spot = e && behaviors.dropSpot ? behaviors.dropSpot(e, v.x, v.y) : null;
    if (spot) return { type: 'surface', id: spot.id, surface: spot };
    if (e && behaviors.dropTarget) {
      // An entity that accepts this one, under the finger (front-most wins).
      // Front-most: the higher top-level container, then the deeper nested one.
      let best = null;
      let bestRank = -Infinity;
      for (const o of views.values()) {
        if (o === v || o.held || o.detached || !o.sprite || within(o, v)) continue;
        const hw = Math.max(o.sprite.w * o.scale, MIN_TARGET) / 2;
        const top = o.y - Math.max(o.sprite.h * o.scale, MIN_TARGET);
        if (info.x < o.x - hw || info.x > o.x + hw || info.y < top || info.y > o.y) continue;
        const rank = frontRank(o);
        if (best && bestRank > rank) continue;
        const oe = getEntity(store.state, o.id);
        if (oe && behaviors.dropTarget(e, oe)) { best = o; bestRank = rank; }
      }
      if (best) return { type: 'entity', id: best.id, view: best };
    }
    const r = settle(def, { x: v.x, y: v.y, halfW: (v.sprite.w * DEPTH_SCALE[1]) / 2 });   // same rule as the drop
    return r.surface ? { type: 'surface', id: r.surface.id, surface: r.surface } : null;
  }

  // Is view o inside view v (at any depth)? A held container's contents are not targets.
  function within(o, v) {
    for (let p = o.parentView; p; p = p.parentView) if (p === v) return true;
    return false;
  }
  const topOf = (o) => { let t = o; while (t.parentView && !t.detached) t = t.parentView; return t; };
  function frontRank(o) {
    let depth = 0;
    for (let p = o; p.parentView && !p.detached; p = p.parentView) depth++;
    return Number(topOf(o).zIndex) * 100 + depth * 10 + (inContainer(o) ? (Number(o.zIndex) || 0) / 10 : 0);
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
      st.zIndex = String(Number(topOf(o).zIndex) - 1);
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
    if (behaviors.cloneFor) {
      // A spawner: the drag carries a brand-new clone, the spawner stays put.
      const cid = behaviors.cloneFor(e, ctx(v, info));
      if (cid) {
        const h = api.handoff(cid, info);
        if (!h) return false;
        v.proxy = h;
        const cv = views.get(cid);
        return { el: cv.el, lift: { target: cv.lift, shadow: cv.el.firstChild } };
      }
    }
    if (behaviors.canDrag && behaviors.canDrag(e) === false) return false;
    if (v.posAnim) { v.posAnim.cancel(); v.posAnim = null; }
    for (const a of v.el.getAnimations()) a.cancel();
    if (inContainer(v)) {
      // Lift it out of its container: it floats in the room layer, drawn
      // exactly where it was (v.x, v.y, v.scale are its world feet and scale).
      v.detached = true;
      room.depth.appendChild(v.el);
    } else {
      // Pick up from where the store says it rests (a cancelled fall snaps there).
      v.x = e.x; v.y = e.y;
    }
    setTransform(v, transformOf(v, v.x, v.y, v.scale));
    v.held = true;
    info.data.x0 = v.x;
    info.data.y0 = v.y;
    setZ(v, Z_DRAG);
    play('pickup');
    if (behaviors.onDragStart) behaviors.onDragStart(e, ctx(v, info));
    return true;
  }

  function dragMove(v, info) {
    if (v.proxy) { v.proxy.move(info); return; }
    if (!v.held) return;
    const t0 = performance.now();
    v.x = info.data.x0 + info.dx;
    v.y = info.data.y0 + info.dy;
    setTransform(v, transformOf(v, v.x, v.y, v.scale));
    if (behaviors.onDragMove) { const e = entityOf(v); if (e) behaviors.onDragMove(e, ctx(v, info)); }
    showHighlight(v, pickTarget(v, info));
    const ms = performance.now() - t0;
    stats.moves++;
    stats.moveMs += ms;
    if (ms > stats.maxMoveMs) stats.maxMoveMs = ms;
  }

  // A dragged thing that no op moved goes back where the store says it is
  // (into its container's slot if it came out of one).
  function restore(v) {
    const e = getEntity(store.state, v.id);
    if (!e) return;
    if (v.detached) fullSync(store.state, false);
    else render(v, e, false);
  }

  function dragEnd(v, info) {
    if (v.proxy) { const h = v.proxy; v.proxy = null; h.end(info); return; }
    if (!v.held) return;
    const target = v.target;
    hideHighlight(v);
    v.held = false;
    const e = entityOf(v);
    if (!e) return;
    stats.drops++;
    const fromW = { x: v.x, y: v.y, s: v.scale };   // where the finger let go (world)
    if (behaviors.dropOnUi && behaviors.dropOnUi(e, ctx(v, info))) {
      // Taken by UI over the room (the P1.14 pocket): gone from here, or refused: spring back.
      if (views.get(e.id) === v && getEntity(store.state, e.id)) { restore(v); glideFrom(v, fromW, { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }); }
      return;
    }
    if (target && target.type === 'entity' && behaviors.onDropInto) {
      const te = getEntity(store.state, target.id);
      const rev0 = v.rev;
      v.dropping = true;
      const handled = te && behaviors.onDropInto(e, te, ctx(v, info));
      v.dropping = false;
      if (handled) {
        const still = views.get(e.id) === v && getEntity(store.state, e.id);
        if (!still) return;
        if (v.rev === rev0) {
          // Not taken (a container refused it, or it went back in its own
          // slot): spring back to where it came from.
          restore(v);
          glideFrom(v, fromW, { duration: 380, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        } else {
          if (v.detached) fullSync(store.state, false);
          glideFrom(v, fromW, { duration: 240, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
        }
        return;
      }
    }
    if (behaviors.onDrop) {
      v.dropping = true;             // it animates itself: no glide on the re-render
      const placed = behaviors.onDrop(e, ctx(v, info));
      v.dropping = false;
      if (placed) return;
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
    if (!env) {
      // Refused (another kid holds its container): back where it was.
      restore(v);
      glideFrom(v, fromW, { duration: 220 });
      tween.squish(v.body, { amount: 0.6 });
      play('squeak');
      return;
    }
    if (v.detached) fullSync(store.state, false);
    if (v.rev !== now.rev) render(v, now, false);
    const to = v.transform;
    if (v.posAnim) v.posAnim.cancel();
    let landAt = 0;
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
    /** Ids a finger is carrying right now (never auto-removed by the entity cap). */
    heldIds: () => [...views.values()].filter((v) => v.held).map((v) => v.id),
    /** The container view an entity is drawn inside, or null (top level / not drawn). */
    parentOf: (id) => { const v = views.get(id); return v && v.parentView ? v.parentView.id : null; },
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
    /** Re-render one entity now (sprite re-checked). False if not drawn or held. */
    repaint(id) {
      const v = views.get(id);
      const e = v && getEntity(store.state, id);
      if (!e || v.held) return false;
      render(v, e, false);
      return true;
    },
    /**
     * Let another gesture carry entity `id` from now on (it is under the
     * finger at info.x/y): returns {move(info), end(info)} to forward that
     * gesture's drag moves and end to, or null if it is not drawn here.
     */
    handoff(id, info) {
      const v = views.get(id);
      if (!v || v.held) return null;
      const data = {};
      const wrap = (i) => Object.assign({}, i, { data });
      if (!dragStart(v, wrap(info))) return null;
      data.x0 = v.x - info.dx;
      data.y0 = v.y - info.dy;
      dragMove(v, wrap(info));
      return { move: (i) => dragMove(v, wrap(i)), end: (i) => dragEnd(v, wrap(i)) };
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
