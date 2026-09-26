// The Cafe (P2a.1, docs/design.md 3.1): ONE panning strip, 2880 units wide,
// with the kitchen, the order counter and the dining room
// (tools/art/rooms/cafe.mjs, manifest `rooms.cafe`). The city map's cafe
// door leads here. Location id 'cafe/kitchen' is kept (saves, the car, the
// parent menu and hold-to-go all know the cafe by it); the old one-screen
// kitchen (kitchen.js) lives on at the dev route ?room=kitchen.
//
//   const cafe = await mountCafe(stage, { input, store, manifest, carry, from });
//
// What it wires (the engine half of P2a.1):
// - LAYERS in column tiles (engine/tiles.js): only the tiles near the camera
//   are decoded (the whole strip is ~62 MB decoded; docs/perf.md).
// - CAMERA: flings snap gently to the three zone stops (kitchen, counter,
//   dining; camera.js). Coming in from the map opens on the dining room by the
//   front door; a reload keeps where you were (localStorage, per iPad).
// - PIECES (manifest `pieces`): every fixture that changes state is its own
//   image drawn right after its layer. A tap toggles or presses it with a
//   sound (no dead taps): fridge and oven doors, burners (and their knobs),
//   the sink tap, the toaster lever, the register drawer, the front door
//   (rings its bell) and the bells. Toggle state is world state: props of one
//   `cafe-fixtures` entity (room 'cafe/fixtures', never drawn) set with store
//   ops, so it is saved, replayed and shared by two iPads like anything else.
// - SURFACES from the manifest. Inside ones (fridge shelves, the oven rack)
//   exist only while their door is open; things on them are hidden (and
//   untouchable) while it is shut, and come back when it opens.
// - SPAWNERS (P1.9 `spawner` behavior): the fridge stock (visible, drawn
//   small), and invisible hot spots over the painted pantry, fruit bowl, cup
//   and plate stacks and ice-cream tubs. Drag one out, or tap for a pop-out.
// - PREP (P2a.2, cafe-prep.js): the knife on the cutting board, the whisk
//   over the mixing bowl, invisible station containers over the blender,
//   toaster and sink (spawned on every mount if missing), the coffee machine
//   filling the cup under its spout; prep.pieceVariant() colours the blender
//   jug, prep.onPieceTap() lets a station answer for its piece.
// - HEAT (P2a.3, cafe-heat.js): pans and pots on lit burners cook, the pan
//   flips, batter pours, the saucepan boils and the ladle serves; the oven
//   bakes with the door shut and dings; warm food steams.
// - RECIPES (P2a.4, cafe-recipes.js): plates stack what is put on them and
//   assemble on a tap (a recipe's dish or a Mystery Dish), a pan slides its
//   food onto a plate, and the recipe book on the counter's back shelf opens.
// - CUSTOMERS (P2a.5, cafe-customers.js): the door bell (or the closed door)
//   brings a walk-in to a free table, a picture order in a thought bubble,
//   serving on the table or into their hands, eating, coins; the counter
//   bell gives orders to the kids' own seated characters; coins go in the
//   register (the drawer opens, cha-ching, the pile) or the tip jar.
// - FIRST VISIT: the stock, cookware and dishes on the shelves and tables,
//   the kitchen cast and two customers at the tables.

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { inRoom, getEntity, locate } from '../engine/world.js';
import { settle, ON_EPS, EDGE_TOL } from '../engine/surfaces.js';
import { createTileLoader } from '../engine/tiles.js';
import { sfx, speech } from '../audio/index.js';
import { addSpriteSource, spriteFor } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { useArtSprites } from './art.js';
import { mountCharacters, seedCharacters, CHAR_KIND } from '../engine/characters.js';
import { textLabels } from './kitchen.js';
import * as tween from '../engine/tween.js';
import { createPrep, ensureStations } from './cafe-prep.js';
import { createHeat } from './cafe-heat.js';
import { createRecipes } from './cafe-recipes.js';
import { loadRecipes } from '../core/recipes.js';
import { createCustomers } from './cafe-customers.js';

export const CAFE_ID = 'cafe/kitchen';
export const FIXTURES_KIND = 'cafe-fixtures';
export const FIXTURES_ROOM = 'cafe/fixtures';
export const CAM_KEY = 'ourtown.cafeCam';
export const ARRIVE_ZONE = 'dining';

// ---------------------------------------------------------------------------
// The room definition (pure)

/** Surface id -> {piece, variant} for surfaces that exist only while a door is open. Pure. */
export function insideSurfaces(m) {
  const out = {};
  for (const s of m.surfaces) {
    if (!s.inside) continue;
    const [piece, variant] = s.inside.split(':');
    out[s.id] = { piece, variant };
  }
  return out;
}

/**
 * The view-layer room definition for the strip. Pure.
 * opts.tiled: draw the layers as tiles (default) or whole (docs/perf.md "before").
 */
export function cafeRoom(m, { tiled = true, cameraX = 0 } = {}) {
  const floorTop = m.floor.y0;
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  // A thing on a back-layer shelf sorts just behind the counter layer.
  const depthOf = (layer) => (layer === 'back' ? floorTop : baseline[layer]);
  const img = (src) => `<img${src ? ` src="${src}"` : ''} alt="" draggable="false" decoding="async">`;
  const art = [];
  const tiles = [];
  for (const L of m.layers) {
    const layer = L.id === 'back' ? 'back' : 'mid';
    const depth = L.id === 'back' ? undefined : L.baseline;
    if (tiled && L.tiles && L.tiles.length) {
      L.tiles.forEach((t, i) => {
        const id = `${L.id}-${i}`;
        art.push({ id, layer, depth, x: t.x, y: t.y, w: t.w, h: t.h, cls: 'art-img art-tile', html: img(null) });
        tiles.push({ id, file: t.file, x: t.x, w: t.w, px: t.px });
      });
    } else {
      art.push({ id: L.id, layer, depth, x: L.x, y: L.y, w: L.w, h: L.h, cls: 'art-img', html: img(L.file) });
    }
    // State pieces draw right after their layer (same depth, later in the DOM).
    for (const [pid, p] of Object.entries(m.pieces || {})) {
      if (p.layer !== L.id) continue;
      const o = p.pivot ? [p.pivot[0] - p.x, p.pivot[1] - p.y] : [p.w / 2, p.h];
      art.push({
        id: `piece:${pid}`, layer, depth, x: p.x, y: p.y, w: p.w, h: p.h, cls: 'art-piece',
        html: `<div class="piece-body" style="transform-origin:${Math.round(o[0])}px ${Math.round(o[1])}px">${img(null)}</div>`,
      });
    }
  }
  return {
    id: CAFE_ID,
    width: m.width,
    cameraX,
    cameraStops: (m.zones || []).map((z) => z.camera),
    backdrop: { top: '#EECAB8', bottom: '#E7BFA3', horizon: floorTop },
    floor: { top: floorTop, bottom: m.floor.y1, x0: 0, x1: m.width, sound: 'thud' },
    surfaces: m.surfaces.map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, y: s.y, depth: depthOf(s.layer), sound: s.inside ? 'clink' : 'knock' })),
    seats: (m.seats || []).map((s) => ({ id: s.id, x: s.at[0], y: s.at[1], depth: depthOf(s.layer) })),
    art,
    tiles,
  };
}

/** The camera x of a zone stop (manifest `zones`). */
export function zoneCamera(m, id) {
  const z = (m.zones || []).find((q) => q.id === id);
  return z ? z.camera : 0;
}

// ---------------------------------------------------------------------------
// Pieces: what a tap does (pure data + pure helpers)

// toggle: [a, b] the two states a tap flips between (world state);
// press: a variant shown for `ms` then back (a bell); controls: a knob taps
// the piece it controls; shake: no state, the piece wobbles or shakes.
// sound: per new state (toggle) or one [name, opts] (press, shake).
export const PIECES = {
  'fridge-door': { toggle: ['closed', 'open'], sound: { open: ['whoosh', { pitch: 0.6 }], closed: ['thud', { pitch: 1.2 }] }, fx: { open: 'puff' } },
  'oven-door': { toggle: ['closed', 'open'], sound: { open: ['knock', { pitch: 0.8 }], closed: ['thud', { pitch: 0.9 }] } },
  'burner-1': { toggle: ['off', 'on'], sound: { on: ['sizzle', { gain: 0.8 }], off: ['tap', { pitch: 0.9 }] }, fx: { on: 'sparkle' } },
  'burner-2': { toggle: ['off', 'on'], sound: { on: ['sizzle', { gain: 0.8 }], off: ['tap', { pitch: 0.9 }] }, fx: { on: 'sparkle' } },
  'knob-1': { controls: 'burner-1' },
  'knob-2': { controls: 'burner-2' },
  'sink-tap': { toggle: ['off', 'on'], sound: { on: ['bubble'], off: ['squeak', { pitch: 1.4 }] }, fx: { on: 'sparkle' } },
  toaster: { toggle: ['up', 'down'], sound: { down: ['knock', { pitch: 1.3 }], up: ['pop', { pitch: 1.1 }] }, fx: { up: 'sparkle' } },
  register: { toggle: ['closed', 'open'], sound: { open: ['chime'], closed: ['knock', { pitch: 1.2 }] }, fx: { open: 'sparkle' } },
  'front-door': { toggle: ['closed', 'open'], sound: { open: ['doorbell'], closed: ['thud', { pitch: 0.8 }] }, rings: 'door-bell' },
  'counter-bell': { press: 'down', ms: 240, sound: ['ding', { pitch: 1.25 }] },
  'door-bell': { press: 'ring', ms: 700, sound: ['bell'] },
  blender: { shake: true, sound: ['whoosh', { pitch: 1.7 }] },
  'coffee-machine': { press: 'coffee', ms: 900, sound: ['bubble', { pitch: 0.8 }] },
  'menu-board': { shake: true, sound: ['tap', { pitch: 0.8 }] },
};

/** The state of a toggle piece from the fixtures props (its manifest default when unset). Pure. */
export function pieceState(id, props, pieces) {
  const p = pieces[id];
  if (!p) return null;
  const v = props && props[id];
  return typeof v === 'string' && p.variants[v] ? v : p.default;
}

/**
 * The variant a piece shows for the world state. Pure. ctx.ovenFull: something
 * is on the oven rack (a closed oven with food in it glows).
 */
export function pieceVariant(id, props, pieces, ctx = {}) {
  const spec = PIECES[id] || {};
  if (spec.controls) {
    const on = pieceState(spec.controls, props, pieces) === 'on';
    return pieces[id].variants[on ? 'on' : 'off'] ? (on ? 'on' : 'off') : pieces[id].default;
  }
  if (id === 'oven-door') {
    const s = pieceState(id, props, pieces);
    return s === 'closed' && ctx.ovenFull && pieces[id].variants.closedOn ? 'closedOn' : s;
  }
  // The menu board shows its picture menu (Zoe's written menu is P2a.6).
  if (id === 'menu-board' && pieces[id].variants.pictures) return 'pictures';
  return pieceState(id, props, pieces);
}

/** The state a tap flips a toggle piece to. Pure. */
export function nextToggle(id, cur) {
  const t = (PIECES[id] || {}).toggle;
  if (!t) return null;
  return cur === t[1] ? t[0] : t[1];
}

// ---------------------------------------------------------------------------
// First visit (pure data)

// Fridge stock, shelf by shelf (spawner kinds `fridge-<item>`, drawn at 0.7).
export const FRIDGE_ROWS = [
  ['fridge-1', ['milk', 'egg', 'cheese', 'butter', 'tofu']],
  ['fridge-2', ['tomato', 'lettuce', 'strawberry', 'blueberries', 'lemon']],
  ['fridge-3', ['carrot', 'sausage', 'fish', 'chicken']],
];
// Invisible hot spots over painted stock: [kind, x, y] (world; y = the shelf line).
export const HOTSPOTS = [
  ['pantry-rice', 77, 231], ['pantry-seaweed', 130, 231], ['pantry-pasta', 183, 231], ['pantry-honey', 237, 231], ['pantry-coffee-beans', 288, 231],
  ['pantry-flour', 84, 357], ['pantry-sugar', 154, 357], ['pantry-chocolate', 217, 357], ['pantry-sprinkles', 276, 357],
  ['pantry-bread', 84, 483], ['pantry-egg', 165, 483],
  ['pantry-lemon', 84, 609], ['pantry-banana', 164, 609],
  ['pantry-potato', 84, 712.6], ['pantry-onion', 175, 712.6],
  ['bowl-apple', 847, 630],
  ['cup-stack', 1638, 504], ['plate-stack', 1686, 504],
  ['tub-vanilla', 1757, 609], ['tub-strawberry', 1809, 609], ['tub-chocolate', 1861, 609],
];
// Loose things: [kind, surface id or null, x, floor y, props]. Cookware in the
// kitchen, dishes on the cup shelves and the sideboard, food on the counter
// and at the customers' tables.
export const CAFE_ITEMS = [
  // The mixing bowl on the island's left, clear of the chef at the island
  // stool (P2a.2: the bowl is where Zoe mixes); the pan by the chef.
  ['pan', 'island-top', 830], ['saucepan', 'island-shelf', 810],
  ['knife', 'cutting-board', 846], ['mixing-bowl', 'island-top', 612], ['egg', 'island-top', 700],
  ['tomato', 'counter-sink', 612], ['baking-tray', 'island-shelf', 700],
  ['whisk', 'window-sill', 640], ['spatula', 'window-sill', 770], ['garnish-shaker', 'window-sill', 705, null, { flavor: 'herbs' }],
  ['mug', 'cup-shelf-1', 1784], ['cafe-cup', 'cup-shelf-1', 1834], ['glass', 'cup-shelf-1', 1884],
  ['bowl', 'cup-shelf-2', 1794], ['plate', 'cup-shelf-2', 1866],
  ['banana', 'order-counter', 1450], ['apple', 'order-counter', 1508],
  ['cupcake', 'order-counter', 1560], ['cookies', 'order-counter', 1616],
  ['tray', 'sideboard', 2320], ['sauce-bottle', 'sideboard', 2410, null, { flavor: 'tomato' }], ['cookie-jar', 'sideboard', 2490],
  ['burger', 'table-1', 2300], ['sundae', 'table-2', 2560],
  ['mystery-dish', 'table-3', 2786, null, { color: 'green', eyes: 'googly', mouth: 'grin', topper: 'cherry' }],
];
// The kitchen cast (the four starter characters): two in the kitchen, two customers.
export const CAFE_CAST = [
  { cast: 'girl9', x: 1240, y: 930 },
  { cast: 'grownup', seat: 'island-stool-2' },
  { cast: 'grandpa', seat: 'window-seat-1' },
  { cast: 'boy5', seat: 'table-1-chair-l' },
];
// The grown-up at the island (CAFE_CAST[1]) is the chef: the chef hat.
export const CAFE_CAST_WEAR = [{ cast: 1, kind: 'chef-hat', slot: 'wear-hat' }];

/** Spawn the stock and the loose things (store ops). room: the normalized room def (all surfaces). */
export function seedCafe(store, room, catalog = null) {
  const surf = (id) => room.surfaces.find((s) => s.id === id);
  const spawn = (kind, x, y, z = 0, props) => store.dispatch('spawn', { id: store.newId(), kind, room: room.id, x: Math.round(x * 10) / 10, y, z, ...(props ? { props } : {}) });
  for (const [sid, items] of FRIDGE_ROWS) {
    const s = surf(sid);
    if (!s) continue;
    items.forEach((it, i) => spawn('fridge-' + it, s.x0 + ((i + 0.5) * (s.x1 - s.x0)) / items.length, s.y, i));
  }
  for (const [kind, x, y] of HOTSPOTS) spawn(kind, x, y);
  for (const [kind, on, x, fy, props] of CAFE_ITEMS) {
    const s = on && surf(on);
    const w = catalog && catalog.has(kind) ? catalog.sprite(kind).w : spriteFor(kind).w;
    const r = settle(room, { x, y: s ? s.y : fy, halfW: w / 2 });
    spawn(kind, r.x, r.y, 0, props);
  }
}

// ---------------------------------------------------------------------------
// Runtime

function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem() {} }; }
}
function loadCam(storage) {
  try { const v = Number(JSON.parse(storage.getItem(CAM_KEY) || 'null')); return isFinite(v) ? v : null; } catch { return null; }
}

/** The fixtures entity (lowest id wins if two iPads made one each), or null. */
export function fixturesOf(state) {
  let best = null;
  for (const id of Object.keys(state.entities)) {
    const e = state.entities[id];
    if (e.kind === FIXTURES_KIND && getEntity(state, id) && (!best || id < best.id)) best = e;
  }
  return best;
}

/**
 * Mount the cafe. opts: { input, store, manifest, carry (P1.14), from (the
 * place we came from, null on boot), storage (tests) }. Resolves once it is up.
 */
export async function mountCafe(stage, { input, store, manifest, carry = null, from = null, storage = safeStorage() }) {
  const m = manifest.rooms.cafe;
  useArtSprites(manifest);
  const [catalog] = await Promise.all([loadCatalog(), loadRecipes()]);
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const tiled = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tiles') === '0');
  const saved = from ? null : loadCam(storage);
  const cameraX = saved != null ? saved : zoneCamera(m, ARRIVE_ZONE);
  const def = cafeRoom(m, { tiled, cameraX });
  const room = mountRoom(stage, def);
  const fx = createFx(room.fxLayer);
  const allSurfaces = room.def.surfaces.slice();
  const counterKey = (m.layers.find((L) => L.id === 'counter') || { baseline: 724 }).baseline + 0.5;
  const inside = insideSurfaces(m);

  // ---- tiles ----
  const tiles = createTileLoader({
    stage,
    tiles: def.tiles.map((t) => ({ ...t, img: room.art.get(t.id).querySelector('img') })),
  });
  tiles.update();

  // ---- the fixtures entity (piece state) ----
  let firstVisit = !fixturesOf(store.state);
  if (firstVisit) store.dispatch('spawn', { id: store.newId(), kind: FIXTURES_KIND, room: FIXTURES_ROOM, x: 0, y: 0, props: {} });
  const fixtures = () => fixturesOf(store.state);
  const fprops = () => { const f = fixtures(); return f ? f.props : {}; };
  const state = (pid) => pieceState(pid, fprops(), m.pieces);

  // ---- behaviors, characters, view ----
  const behaviors = createBehaviors({ catalog, store });
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
  const base0 = chars ? chars.hooks : behaviors;
  const base = carry ? carry.hooks(base0, room) : base0;

  const hidden = new Set();            // top-level ids shut inside the fridge or oven
  const onInside = (e) => {
    for (const s of allSurfaces) {
      const q = inside[s.id];
      if (q && Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL) return { surface: s, ...q };
    }
    return null;
  };
  const isOpen = (q) => state(q.piece) === q.variant;
  const topOf = (e) => { const at = locate(store.state, e.id); return at ? getEntity(store.state, at.top) : null; };
  const shutIn = (e) => { const t = e.parent ? topOf(e) : e; if (!t || t.room !== CAFE_ID) return false; const q = onInside(t); return !!q && !isOpen(q); };
  function applyHidden(e, el) {
    const shut = shutIn(e);
    if (!e.parent) { if (shut) hidden.add(e.id); else hidden.delete(e.id); }
    const want = shut ? 'hidden' : '';
    if (el.style.visibility !== want) el.style.visibility = want;
    input.setEnabled(el, !shut);
  }
  const hotSprites = new Map();
  const hotSprite = (kind) => {
    let s = hotSprites.get(kind);
    if (!s) {
      const k = catalog.get(kind);
      s = { key: 'hot:' + kind, draw: 'custom', w: k.size[0], h: k.size[1], sound: 'pop', paint: (body) => { body.textContent = ''; } };
      hotSprites.set(kind, s);
    }
    return s;
  };
  const hooks = Object.assign({}, base, {
    // Painted stock (pantry, stacks, tubs): the art is in the room layer.
    spriteOf: (e) => (catalog.hasTag(e.kind, 'hotspot') ? hotSprite(e.kind) : (base.spriteOf ? base.spriteOf(e) : null)),
    // A hot spot over painted stock that stands on no surface (the ice-cream
    // tubs in the display, the pantry's floor baskets) sorts just in front of
    // the counter layer, so a touch on its painted art reaches it; pieces in
    // front (the register, the bell) still win where they cover it.
    sortKeyOf(e) {
      const k = base.sortKeyOf ? base.sortKeyOf(e) : null;
      if (k != null || !catalog.hasTag(e.kind, 'hotspot')) return k;
      return allSurfaces.some((s) => Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL) ? null : Math.max(e.y, counterKey);
    },
    onRender(e, ctx) {
      if (base.onRender) base.onRender(e, ctx);
      applyHidden(e, ctx.el);
    },
    dropTarget: (item, other) => !hidden.has(other.id) && !(other.parent && shutIn(other)) && (base.dropTarget ? base.dropTarget(item, other) : false),
  });
  // P2a.2 prep stations: the knife, whisk, blender, sink, toaster and coffee machine.
  const prep = createPrep({
    store, catalog, behaviors, m, room, fx,
    pieceApi: {
      el: (pid) => (pieces.get(pid) || {}).el || null,
      state: (pid) => state(pid),
      set: (pid, value) => { const f = fixtures(); if (f) store.dispatch('set', { id: f.id, path: 'props.' + pid, value }); },
      tap: (pid) => tapPiece(pid, { raw: true }),
      press: (pid, variant) => press(pid, Object.assign({}, PIECES[pid], { press: variant })),
      render: () => renderPieces(),
      fixtures: () => fixtures(),
    },
  });
  const prepHooks = prep.wrap(hooks);
  // P2a.3 heat: the stove, the oven, flipping, pouring, boiling and ladling.
  const heat = createHeat({
    store, catalog, behaviors, m, room, fx,
    pieceApi: { state: (pid) => state(pid), tap: (pid) => tapPiece(pid, { raw: true }) },
    isGuest: () => typeof window !== 'undefined' && !!(window.__together && window.__together.session && window.__together.session.role === 'guest'),
  });
  // Characters ask whether food is hot ("hot hot hot!").
  behaviors.hotOf = (e) => heat.isHot(e);
  const heatHooks = heat.wrap(prepHooks);
  // P2a.4 recipes: plating, the pan onto a plate, the recipe book.
  const recipes = createRecipes({ store, catalog, behaviors, m, room, stage, input, sfx, speech, fx });
  const recHooks = recipes.wrap(heatHooks);
  // P2a.5 customers: the door bell, walk-ins, orders, serving, coins, the register, the tip jar.
  const customers = createCustomers({
    store, catalog, behaviors, m, room, chars, fx, sfx,
    pieceApi: {
      el: (pid) => (pieces.get(pid) || {}).el || null,
      state: (pid) => state(pid),
      set: (pid, value) => { const f = fixtures(); if (f && state(pid) !== value) store.dispatch('set', { id: f.id, path: 'props.' + pid, value }); },
      press: (pid, variant) => press(pid, Object.assign({}, PIECES[pid], { press: variant })),
      fixtures: () => fixtures(),
    },
    isGuest: () => typeof window !== 'undefined' && !!(window.__together && window.__together.session && window.__together.session.role === 'guest'),
  });
  const custHooks = customers.wrap(recHooks);
  // Pieces take touches (registered before the entity views, so where a
  // padded hit box is a tie the thing in front of the fixture wins).
  const pieces = new Map();          // id -> {el, body, img, shown, gen}
  for (const pid of Object.keys(m.pieces || {})) {
    const el = room.art.get('piece:' + pid);
    if (!el) continue;
    el.dataset.piece = pid;
    const rec = { el, body: el.firstChild, img: el.querySelector('img'), shown: null, gen: 0 };
    pieces.set(pid, rec);
    input.register(el, { onTap: (info) => tapPiece(pid, { info }), pan: true });
  }
  const view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: custHooks, labels: textLabels(catalog, manifest) });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);

  // ---- first visit ----
  const here = inRoom(store.state, CAFE_ID);
  if (firstVisit || !here.length) {
    const others = here.filter((e) => e.kind !== CHAR_KIND);
    if (!here.length || firstVisit) {
      // Things left from the old one-screen kitchen: onto the strip's surfaces.
      for (const e of others) {
        const r = settle({ ...room.def, surfaces: allSurfaces }, { x: e.x, y: e.y, halfW: 30 });
        if (r.x !== e.x || r.y !== e.y) store.dispatch('move', { id: e.id, room: CAFE_ID, x: Math.round(r.x), y: r.y, z: e.z || 0 });
      }
      seedCafe(store, { ...room.def, surfaces: allSurfaces }, catalog);
      // P1.14's first backpack (carry.js puts one in the cafe if the town has
      // none): here, on the floor by the pillar, clear of the pocket tray (and
      // off the counter, where the blender pours its smoothies, P2a.2).
      const hasBag = Object.keys(store.state.entities).some((id) => store.state.entities[id].kind === 'backpack' && getEntity(store.state, id));
      if (!hasBag) store.dispatch('spawn', { id: store.newId(), kind: 'backpack', room: CAFE_ID, x: 1330, y: 868 });
      if (chars && !here.some((e) => e.kind === CHAR_KIND)) {
        const ids = seedCharacters(store, chars.rig, { room: CAFE_ID, seats: chars.seats, placements: CAFE_CAST });
        for (const w of CAFE_CAST_WEAR) if (ids[w.cast]) store.dispatch('spawn', { id: store.newId(), kind: w.kind, parent: ids[w.cast], slot: w.slot });
      }
    }
  }
  firstVisit = false;
  // The prep stations over the blender, toaster and sink (older saves get them too).
  ensureStations(store, m, CAFE_ID);
  // P2a.3: the soup ladle by the sink (older saves get one too).
  if (!Object.keys(store.state.entities).some((id) => store.state.entities[id].kind === 'ladle' && getEntity(store.state, id))) {
    const cs = allSurfaces.find((q) => q.id === 'counter-sink');
    if (cs) store.dispatch('spawn', { id: store.newId(), kind: 'ladle', room: CAFE_ID, x: 735, y: cs.y, z: 0 });
  }
  prep.bind(view);
  heat.bind(view);
  recipes.bind(view);
  customers.bind(view);

  // ---- pieces ----
  const overrides = new Map();       // id -> variant shown for a moment (a bell press)
  const timers = new Set();
  const stats = { taps: {}, swaps: 0 };
  let ovenFull = false;

  function swap(pid, variant) {
    const p = pieces.get(pid);
    const v = m.pieces[pid].variants[variant];
    if (!p || !v || p.shown === variant) return;
    p.shown = variant;
    p.el.dataset.variant = variant;
    const gen = ++p.gen;
    // Decode first, then swap in place (all variants share one box): no flash.
    const pre = new Image();
    pre.src = v.file;
    const show = () => { if (p.gen === gen) { p.img.src = v.file; stats.swaps++; } };
    if (!p.img.getAttribute('src')) { show(); return; }
    (pre.decode ? pre.decode() : Promise.resolve()).then(show, show);
  }

  function renderPieces() {
    const props = fprops();
    for (const pid of pieces.keys()) swap(pid, overrides.get(pid) || prep.pieceVariant(pid, props) || pieceVariant(pid, props, m.pieces, { ovenFull }));
  }

  // Inside surfaces follow their doors; things on them hide and show.
  let openKey = null;
  function applyInside() {
    const open = Object.keys(inside).filter((sid) => isOpen(inside[sid]));
    const key = open.join(',');
    ovenFull = inRoom(store.state, CAFE_ID).some((e) => { const q = onInside(e); return q && q.surface.id === 'oven-rack'; });
    if (key === openKey) return false;
    openKey = key;
    const live = allSurfaces.filter((s) => !inside[s.id] || open.includes(s.id));
    room.def.surfaces.length = 0;
    room.def.surfaces.push(...live);
    // Re-render what sits on an inside surface: its draw order and visibility.
    for (const e of inRoom(store.state, CAFE_ID)) if (onInside(e)) view.repaint(e.id);
    return true;
  }

  const burstAt = (pid, type, o = {}) => {
    const p = m.pieces[pid];
    fx.burst(type, p.x + p.w / 2, p.y + p.h * 0.45, Object.assign({ count: 6, spread: Math.max(60, p.w * 0.6) }, o));
  };
  const playS = (s) => { if (s) view.play(s[0], s[1]); };

  function press(pid, spec) {
    overrides.set(pid, spec.press);
    renderPieces();
    const t = setTimeout(() => { timers.delete(t); overrides.delete(pid); renderPieces(); }, spec.ms);
    timers.add(t);
  }

  function tapPiece(pid, { raw = false, info = null } = {}) {
    const spec = PIECES[pid] || {};
    const p = pieces.get(pid);
    stats.taps[pid] = (stats.taps[pid] || 0) + 1;
    // P2a.5: the door and its bell bring a customer in; the register's keys boop.
    if (!raw && customers.onPieceTap(pid, info)) return;
    // A prep station answers for its appliance (the blender blends, the
    // coffee machine fills the cup under it, the toaster pops its toast).
    if (!raw && prep.onPieceTap(pid)) {
      if (pid !== 'blender') tween.squish(p.body, { amount: 0.6, duration: 320 });
      burstAt(pid, 'sparkle', { count: 4 });
      return;
    }
    const target = spec.controls || pid;
    const tspec = PIECES[target] || {};
    if (tspec.toggle) {
      const next = nextToggle(target, state(target));
      const f = fixtures();
      if (f) store.dispatch('set', { id: f.id, path: 'props.' + target, value: next });
      playS(tspec.sound && tspec.sound[next]);
      if (tspec.fx && tspec.fx[next]) burstAt(target, tspec.fx[next]);
      if (tspec.rings && next === 'open') press(tspec.rings, PIECES[tspec.rings]);
      tween.squish(p.body, { amount: 0.5, duration: 300 });
      if (spec.controls) tween.squish(pieces.get(target).body, { amount: 0.4, duration: 300 });
    } else if (spec.press) {
      press(pid, spec);
      playS(spec.sound);
      tween.squish(p.body, { amount: 0.8 });
      burstAt(pid, 'sparkle', { count: 4 });
    } else {
      if (pid === 'blender') tween.shake(p.body, { amount: 0.8 }); else tween.wobble(p.body, { amount: 0.4 });
      playS(spec.sound || ['pop']);
      burstAt(pid, 'sparkle', { count: 4 });
    }
    if (!raw) { prep.afterPieceTap(pid); heat.afterPieceTap(pid); customers.afterPieceTap(pid); }
  }

  applyInside();
  renderPieces();
  view.refresh();

  // Arriving through the front door: its little bell swings.
  if (from && pieces.has('door-bell')) press('door-bell', PIECES['door-bell']);

  const unsubscribe = store.subscribe(() => {
    if (!applyInside()) { /* same doors: only the oven glow and swaps may change */ }
    renderPieces();
  });

  // Remember where the camera rests (per iPad; on settle only).
  const saveCam = () => { try { storage.setItem(CAM_KEY, JSON.stringify(Math.round(stage.camera.x))); } catch { /* full or private */ } };
  let camTimer = 0;
  const offStage = stage.onChange((_, why) => {
    if (why !== 'camera' && why !== 'settle') return;
    clearTimeout(camTimer);
    camTimer = setTimeout(() => { camTimer = 0; if (!stage.camera.dragging && !stage.camera.moving) saveCam(); }, 400);
  });

  return {
    id: room.id, room, view, fx, catalog, behaviors, chars, tiles,
    zones: m.zones,
    pieces: {
      ids: () => [...pieces.keys()],
      state,
      shown: (pid) => (pieces.get(pid) || {}).shown || null,
      el: (pid) => (pieces.get(pid) || {}).el || null,
      tap: tapPiece,
      stats: () => ({ ...stats, taps: { ...stats.taps }, timers: timers.size }),
    },
    hidden: () => [...hidden],
    prep,
    heat,
    recipes,
    customers,
    surfaces: () => room.def.surfaces.map((s) => s.id),
    fixtures,
    /** Where things arriving by car stand: inside the front door, in a row. */
    arrivalSpot(i) {
      const door = (m.slots || []).find((s) => s.id === 'door');
      const x0 = door && door.at ? door.at[0] - 110 : m.width - 300;
      return { x: Math.round(x0 - i * 120), y: Math.round(m.floor.y1 - 70 + (i % 2) * 40) };
    },
    destroy() {
      unsubscribe();
      offStage();
      clearTimeout(camTimer);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      prep.destroy();
      heat.destroy();
      recipes.destroy();
      customers.destroy();
      for (const p of pieces.values()) input.unregister(p.el);
      tiles.destroy();
      view.destroy();
      if (chars) chars.destroy();
      fx.clear();
      room.destroy();
      removeSource();
    },
  };
}

/**
 * Image files the cafe shows first (for preloading before a transition): the
 * tiles around the arrival camera and the pieces' default looks there.
 */
export function cafeFiles(manifest, { cameraX = null } = {}) {
  const m = manifest.rooms.cafe;
  const x = cameraX == null ? zoneCamera(m, ARRIVE_ZONE) : cameraX;
  const near = (a, w) => a + w > x - 100 && a < x + 1540;
  const out = [];
  for (const L of m.layers) for (const t of L.tiles || [L]) if (near(t.x, t.w)) out.push(t.file);
  for (const p of Object.values(m.pieces || {})) if (near(p.x, p.w)) out.push(p.variants[p.default].file);
  return out;
}
