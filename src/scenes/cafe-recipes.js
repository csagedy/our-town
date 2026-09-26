// Cafe recipes (P2a.4, docs/design.md 3.1 #11-12, 4): plating and the
// recipe book. The table and the Mystery Dish generator are pure in
// src/core/recipes.js (data/recipes.json); the plate's assemble and the
// dishes' looks are behaviors (src/core/behaviors/cafe.js `assemble`,
// `dressed`, `mystery`); the other result points (oven, pot + ladle, tray,
// blender) resolve their recipe where they make it (cafe-heat.js, the
// blender behavior). This module wires the cafe's side:
//
//   PLATING   drop things on a plate: they stack up in the middle (bread,
//             cheese, tomato, lettuce: a sandwich being built). Tap the
//             plate (or anything on it) and it assembles with a poof into the
//             recipe's dish, or, if it's in no recipe, a Mystery Dish with a
//             face and a silly name. A pan dropped on a plate slides what is
//             in it onto the plate (the fried egg, the pancake: pancakes
//             stack, three make a tower).
//   BOOK      the recipe book on the counter's back shelf: tap it and the picture
//             book opens (src/ui/recipe-book.js); a recipe made anywhere in
//             the cafe gets its star sticker (a `set` op on the fixtures:
//             saved, replayed, shared by two iPads).
//   SERVING   a dish is an ordinary thing: carry it to a table or drop it on
//             a character, who eats it bite by bite (a Mystery Dish: a funny
//             face, then a laugh).
//
//   const rec = createRecipes({ store, catalog, behaviors, m, room, stage, input, sfx, speech, fx });
//   hooks = rec.wrap(hooks);      // outermost (after heat.wrap)
//   rec.bind(view);               // after createRoomView; spawns the book if missing
//   rec.book                      // the book UI (open/close/turn/...)
//   rec.destroy()

import { getEntity, inRoom, childrenOf } from '../engine/world.js';
import { settle } from '../engine/surfaces.js';
import * as tween from '../engine/tween.js';
import { recipeTable, discovered, exampleItems, foodParamsOf, FIXTURES_KIND } from '../core/recipes.js';
import { smoothieOf } from '../core/food.js';
import { createRecipeBook } from '../ui/recipe-book.js';

export const BOOK_KIND = 'recipe-book';
export const BOOK_SPOT = { surface: 'back-bar', x: 1805 };     // the counter's back shelf, right of the plate stack
export const PLATES = ['plate'];
export const PANS = ['pan'];

const r1 = (v) => Math.round(v * 10) / 10;

/** The props that draw a need's ingredient in its state (toast, chopped, fried). Pure. */
export function needProps(n) {
  const props = {};
  if (n.cooked) props.cooked = n.cooked;
  if (n.prep && n.prep[0] === 'chopped') props.cut = 9;
  else if (n.prep && n.prep[0] === 'sliced') props.cut = 1;
  if (n.kinds[0] === 'egg') props.cracked = 1;
  return props;
}

export function createRecipes({ store, catalog, behaviors, m, room, stage, input, sfx = null, speech = null, fx = null }) {
  const roomId = room.id;
  const stats = { assembles: 0, slides: 0, opens: 0 };
  let view = null;
  let base = null;
  let unsubscribe = null;
  let lastFound = '';

  const spriteOfE = (e) => (base && base.spriteOf ? base.spriteOf(e) : null) || catalog.sprite(e.kind);

  // ---- the book ----
  const piece = (pid, variant) => {
    const p = m.pieces && m.pieces[pid];
    const v = p && p.variants[variant];
    return v ? { src: v.file, w: p.w, h: p.h } : null;
  };
  const STATION_ICON = {
    plate: () => catalog.sprite('plate'),
    pot: () => catalog.sprite('saucepan', 'boiling'),
    oven: () => piece('oven-door', 'closedOn'),
    tray: () => catalog.sprite('baking-tray', 'raw'),
    blender: () => piece('blender', 'empty'),
  };
  const book = createRecipeBook({
    host: stage.host,
    input,
    sfx,
    recipes: () => recipeTable().recipes,
    found: () => discovered(store.state),
    stationIcon: (at) => (STATION_ICON[at] ? STATION_ICON[at]() : null),
    say: speech ? (text) => speech.say(text, { interrupt: true }) : null,
    spriteOf(x) {
      if (x.needs) {
        // A recipe: its dish, as the recipe makes it.
        const props = { recipe: x.id };
        if (x.look.tint) props.tint = x.look.tint;
        if (x.look.topper) props.topper = x.look.topper;
        if (x.dish === 'smoothie') props.color = smoothieOf(exampleItems(x).map((it) => ({ kind: it.kind, props: {} })));
        return spriteOfE({ id: 'book:' + x.id, kind: x.dish, props, parent: null });
      }
      return spriteOfE({ id: 'book:' + x.kinds[0], kind: x.kinds[0], props: needProps(x), parent: null });
    },
  });

  function bookEntity() {
    let best = null;
    for (const id of Object.keys(store.state.entities)) {
      const e = getEntity(store.state, id);
      if (e && e.kind === BOOK_KIND && (!best || id < best.id)) best = e;
    }
    return best;
  }

  /** The recipe book on the kitchen shelf, if the town has none (older saves too). */
  function ensureBook() {
    if (bookEntity()) return null;
    const s = (room.def.surfaces || []).find((q) => q.id === BOOK_SPOT.surface);
    const id = store.newId();
    const r = s ? { x: BOOK_SPOT.x, y: s.y } : settle(room.def, { x: BOOK_SPOT.x, y: 500, halfW: 40 });
    store.dispatch('spawn', { id, kind: BOOK_KIND, room: roomId, x: r1(r.x), y: r.y, z: 0 });
    return id;
  }

  function openBook(e) {
    stats.opens++;
    const v = view && view.viewOf(e.id);
    if (v && v.body) tween.squish(v.body, { amount: 1, duration: 320 });
    book.open();
  }

  // ---- plating ----
  const plateOf = (e) => {
    if (!e || !e.parent) return null;
    const p = getEntity(store.state, e.parent);
    return p && PLATES.includes(p.kind) ? p : null;
  };

  /** A pan dropped on a plate: what's in it slides onto the plate. True if anything moved. */
  function slide(pan, plate) {
    const kids = childrenOf(store.state, pan.id);
    if (!kids.length) return false;
    const cap = (behaviors.containerOf && behaviors.containerOf(plate.kind) || { capacity: 5 }).capacity;
    const used = new Set(childrenOf(store.state, plate.id).map((k) => k.slot));
    let moved = 0;
    for (const k of kids) {
      let slot = null;
      for (let i = 0; i < cap && !slot; i++) if (!used.has('s' + i)) slot = 's' + i;
      if (!slot) break;
      used.add(slot);
      if (store.dispatch('attach', { id: k.id, parent: plate.id, slot })) moved++;
    }
    if (!view) return moved > 0;
    const pv = view.viewOf(plate.id);
    if (!moved) {
      // Full plate: a playful no.
      if (pv) tween.shake(pv.body, { amount: 0.5 });
      view.play('boing', { pitch: 0.9 });
      return false;
    }
    stats.slides++;
    view.play('whoosh', { pitch: 1.5, gain: 0.7 });
    view.play('plink', { pitch: 1.2 });
    if (pv) tween.squish(pv.body, { amount: 0.9 });
    if (fx && pv) fx.burst('sparkle', pv.x, pv.y - 30, { count: 5, spread: 60 });
    return true;
  }

  function wrap(b) {
    base = b;
    return Object.assign({}, b, {
      onTap(e, ctx) {
        if (e.kind === BOOK_KIND) { openBook(e); return true; }
        // Anything on a plate: the plate assembles (the whole plate is the button).
        const plate = plateOf(e);
        if (plate && b.onTap) { stats.assembles++; return b.onTap(plate, ctx); }
        if (PLATES.includes(e.kind) && childrenOf(store.state, e.id).length) stats.assembles++;
        return b.onTap ? b.onTap(e, ctx) : false;
      },
      dropTarget(item, other) {
        if (PANS.includes(item.kind) && PLATES.includes(other.kind)) return childrenOf(store.state, item.id).length > 0;
        return b.dropTarget ? b.dropTarget(item, other) : false;
      },
      onDropInto(item, target, ctx) {
        if (PANS.includes(item.kind) && PLATES.includes(target.kind)) { slide(item, target); return true; }
        return b.onDropInto ? b.onDropInto(item, target, ctx) : false;
      },
    });
  }

  // A new sticker while the book is open (a discovery by the other iPad).
  function onStore() {
    const f = [...discovered(store.state)].sort().join(',');
    if (f === lastFound) return;
    lastFound = f;
    book.refresh();
  }

  return {
    wrap,
    bind(v) {
      view = v;
      ensureBook();
      lastFound = [...discovered(store.state)].sort().join(',');
      unsubscribe = store.subscribe(onStore);
    },
    book,
    bookId: () => (bookEntity() || {}).id || null,
    found: () => [...discovered(store.state)].sort(),
    stats: () => ({ ...stats }),
    FIXTURES_KIND,
    paramsOf: (kind) => foodParamsOf(catalog, kind),
    here: () => inRoom(store.state, roomId).length,
    destroy() {
      if (unsubscribe) unsubscribe();
      book.destroy();
      view = null;
    },
  };
}
