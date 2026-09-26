// The Construction Site (P2c.1, docs/design.md 3.3): Ian's place. ONE
// panning strip, 2880 units wide, with the build yard, the crane yard and the
// dig pit + workshop (tools/art/rooms/site.mjs, manifest `rooms.site`). The
// city map's construction building leads here (location 'construction/yard').
//
//   const site = await mountSite(stage, { input, store, manifest, carry, from });
//
// What it wires (the engine half of P2c.1; the same pattern as cafe.js):
// - LAYERS in column tiles (engine/tiles.js), decoded only near the camera.
// - CAMERA: flings snap to the zone stops (build, crane, dig). Coming in from
//   the map opens on the build yard; a reload keeps where you were (per iPad).
// - PIECES (manifest `pieces`): every fixture is its own image, drawn right
//   after its layer, and answers a tap. The portable toilet door opens and
//   shuts (and flushes, loudly), the crane lever flips up and down; their
//   state is props of one `site-fixtures` entity (room 'construction/fixtures'),
//   set with store ops. The TOWER CRANE (trolley, hook, lever) and the
//   WRECKING BALL are src/scenes/site-rigs.js (P2c.2). The DIG PIT (dirt mask
//   canvas, treasures, spade, wheelbarrow, piles), the EXCAVATOR and the DUMP
//   TRUCK are src/scenes/site-dig.js (P2c.3). The mixer only wobbles and
//   makes a sound for now (P2c.4).
// - BUILD GRID (src/core/buildgrid.js): build pieces (blocks, planks, beams,
//   roofs, windows, doors, stairs, flags, chimneys) dropped over the build
//   deck snap to its 40-unit grid, onto the per-column height map, with a
//   fall, a squash, a clack whose pitch rises with the height, and a dust
//   puff; a tall tower sways a little (never falls). The grid is nothing but
//   the pieces' positions (store `move`s), so it is saved and shared.
//   Lifting a piece out of the middle of a tower lets the pieces above it
//   settle down (the forgiving choice: nothing falls off, nothing floats).
//   The tops of the build are surfaces: characters stand on a roof, things
//   rest on a flat top. Pieces are drawn at scale 1 on the grid (no depth
//   scale), so they line up exactly.
// - HAMMER: drop the hammer on a piece: bonk, sparkles, it is locked (a nail
//   head shows) and never sways again.
// - PAINT: dip a paintbrush in a paint can (drag it over the can, or drop it
//   there), then drag it over pieces: each one it touches takes the colour
//   (manifest `paint` variants; rainbow stripes on blocks only; a door keeps
//   its open/shut state).
// - SPAWNERS: invisible hot spots over the painted lumber pile, brick pallet,
//   cones and hard-hat hooks, paint cans on the workshop shelf (one per
//   colour: a red can gives red cans), and small visible stock of the
//   special pieces (roofs, windows, a door, stairs, a flag, a chimney) on the
//   scaffold.
// - FIRST VISIT: Rosa the builder, a kid in a hard hat on the lunch bench, a
//   half-built house and starter bricks on the deck, the tools and a lunch.

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { inRoom, getEntity } from '../engine/world.js';
import { settle, surfaceUnder, ON_EPS, EDGE_TOL, DEPTH_SCALE } from '../engine/surfaces.js';
import { createTileLoader } from '../engine/tiles.js';
import { sfx, speech } from '../audio/index.js';
import { addSpriteSource, spriteFor } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { useArtSprites } from './art.js';
import { mountCharacters, seedCharacters, CHAR_KIND } from '../engine/characters.js';
import { textLabels } from './kitchen.js';
import * as tween from '../engine/tween.js';
import { shapeOf, cellOf, snapDrop, settleGrid, topSurfaces, wobbly, towerOf, heightMap, overGrid } from '../core/buildgrid.js';
import { createSiteRigs, RIG_PIECES } from './site-rigs.js';   // P2c.2: the tower crane and the wrecking ball
import { HOOK_KIND } from '../core/crane.js';
import { createSiteDig, DIG_PIECES } from './site-dig.js';   // P2c.3: the dig pit, the excavator, the dump truck

export const SITE_ID = 'construction/yard';
export const FIXTURES_KIND = 'site-fixtures';
export const FIXTURES_ROOM = 'construction/fixtures';
export const CAM_KEY = 'ourtown.siteCam';
export const ARRIVE_ZONE = 'build';
export const TOP_PREFIX = 'build-top-';
const r1 = (v) => Math.round(v * 10) / 10;
const MOVES_THINGS = new Set(['move', 'detach', 'attach', 'remove', 'travel', 'combine']);

// ---------------------------------------------------------------------------
// The room definition (pure)

// Other piece states in which an inside surface still exists (the truck bed loaded with dirt is still a bed).
export const INSIDE_ALSO = { 'truck-bed:down': ['full'] };

/** Surface id -> {piece, variant} for surfaces that exist only in one piece state (the truck bed). Pure. */
export function insideSurfaces(m) {
  const out = {};
  for (const s of m.surfaces) {
    if (!s.inside) continue;
    const [piece, variant] = s.inside.split(':');
    out[s.id] = { piece, variant };
  }
  return out;
}

/** Sort depth of a manifest layer; the build deck sorts at its front line (the grid's rest line). Pure. */
export function depthFor(m) {
  const floorTop = m.floor.y0;
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  return (layer, id) => (id === 'build-deck' ? m.grid.y : layer === 'back' ? floorTop : baseline[layer]);
}

/** The view-layer room definition for the site strip. Pure. opts.tiled: layers as tiles (default). */
export function siteRoom(m, { tiled = true, cameraX = 0 } = {}) {
  const floorTop = m.floor.y0;
  const depthOf = depthFor(m);
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
    id: SITE_ID,
    width: m.width,
    cameraX,
    cameraStops: (m.zones || []).map((z) => z.camera),
    backdrop: { top: '#CDE6EE', bottom: '#E9D3AE', horizon: floorTop },
    floor: { top: floorTop, bottom: m.floor.y1, x0: 0, x1: m.width, sound: 'thud' },
    surfaces: m.surfaces.map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, y: s.y, depth: depthOf(s.layer, s.id), sound: s.id === 'build-deck' ? 'clack' : 'knock' })),
    seats: (m.seats || []).map((s) => ({ id: s.id, x: s.at[0], y: s.at[1], depth: depthOf(s.layer, s.id) })),
    art,
    tiles,
  };
}

/** The camera x of a zone stop. */
export function zoneCamera(m, id) {
  const z = (m.zones || []).find((q) => q.id === id);
  return z ? z.camera : 0;
}

// ---------------------------------------------------------------------------
// Pieces: what a tap does (pure data)

// toggle: [a, b] a tap flips between (world state, fixtures props); sound per
// new state; then: [sound, ms] after the new state (the flush after the door
// shuts). Everything else: react (wobble or shake) with a sound. `later`
// names the bead that brings the piece alive.
export const PIECES = {
  'potty-door': {
    toggle: ['closed', 'open'],
    sound: { open: ['squeak', { pitch: 0.7 }], closed: ['thud', { pitch: 1.2 }] },
    then: { closed: ['flush', 260] },
    fx: { open: 'sparkle', closed: 'puff' },
  },
  'crane-lever': { toggle: ['up', 'down'], sound: { down: ['knock', { pitch: 0.8 }], up: ['knock', { pitch: 1.25 }] }, fx: { down: 'sparkle', up: 'sparkle' } },
  // P2c.2: the trolley, cable, hook, chain and ball are driven by site-rigs.js (RIG_PIECES); these only react.
  'crane-jib': { react: 'wobble', sound: ['knock', { pitch: 0.7 }] },
  'crane-cab': { react: 'wobble', sound: ['whistle'] },
  'wreck-boom': { react: 'wobble', sound: ['knock', { pitch: 0.6 }] },
  'crane-trolley': { rig: true }, 'crane-cable': { rig: true }, 'crane-hook': { rig: true },
  'wreck-chain': { rig: true }, 'wreck-ball': { rig: true }, 'wreck-body': { rig: true },
  // P2c.3: the dig pit's pieces are driven by site-dig.js (DIG_PIECES).
  dirt: { dig: true }, 'dump-truck': { dig: true }, 'truck-bed': { dig: true },
  excavator: { dig: true }, 'excavator-arm': { dig: true }, 'excavator-bucket': { dig: true },
  'mixer-drum': { react: 'shake', sound: ['whoosh', { pitch: 0.8 }], later: 'P2c.4' },
};

/** The state of a toggle piece (its manifest default when unset). Pure. */
export function pieceState(id, props, pieces) {
  const p = pieces[id];
  if (!p) return null;
  const v = props && props[id];
  return typeof v === 'string' && p.variants[v] ? v : p.default;
}

/** The state a tap flips a toggle piece to (null for a non-toggle). Pure. */
export function nextToggle(id, cur) {
  const t = (PIECES[id] || {}).toggle;
  if (!t) return null;
  return cur === t[1] ? t[0] : t[1];
}

// ---------------------------------------------------------------------------
// Paint (pure)

/**
 * The paint a piece takes from a brush colour: the new props.paint value, or
 * null when this piece has no such colour (rainbow is for blocks only). Pure.
 * snapProp: the manifest prop (its `paint` map).
 */
export function paintFor(prop, color) {
  if (!prop || !prop.paint || typeof color !== 'string') return null;
  return prop.paint[color] ? color : null;
}

// ---------------------------------------------------------------------------
// First visit (pure data)

// Hot spots over the painted piles: [kind, feet x, feet y].
export const HOTSPOTS = [
  ['site-lumber', 104, 892],
  ['site-bricks', 910, 898],
  ['site-cones', 1068, 902],
  ['site-hardhats', 1579, 679],
];
// Paint cans on the workshop's tool shelf (visible spawners, one per colour): [paint, x].
export const PAINT_STOCK = [['red', 2642], ['yellow', 2684], ['blue', 2726], ['green', 2768], ['purple', 2810], ['rainbow', 2852]];
// Visible stock of the special pieces on the scaffold: [kind, surface, x].
export const STOCK = [
  ['stock-roof-triangle', 'scaffold-2', 160], ['stock-roof-flat', 'scaffold-2', 290], ['stock-flag', 'scaffold-2', 400],
  ['stock-stairs', 'scaffold-1', 128], ['stock-window', 'scaffold-1', 200], ['stock-round-window', 'scaffold-1', 252],
  ['stock-door', 'scaffold-1', 304], ['stock-chimney', 'scaffold-1', 356],
];
// The half-built house and the starter bricks on the deck: [kind, column, row, paint].
export const BUILD = [
  ['block-1x1', 1, 0, 'yellow'], ['door', 2, 0, 'blue'], ['block-2x1', 3, 0, 'yellow'],
  ['window', 1, 1, 'yellow'], ['window', 3, 1, 'yellow'], ['block-1x1', 4, 1, 'yellow'],
  ['block-2x1', 11, 0, 'red'], ['block-1x1', 13, 0, 'green'], ['block-2x1', 11, 1, 'blue'],
];
// Loose things: [kind, surface id or null, x, floor y, props].
export const SITE_ITEMS = [
  ['hammer', null, 175, 935], ['paintbrush', null, 1135, 930],
  ['paint-can', null, 1205, 928, { paint: 'red' }], ['paint-can', null, 1265, 918, { paint: 'blue' }],
  ['lunchbox', 'bench', 1135], ['thermos', 'bench', 1172],
  ['hose', null, 1520, 945],
  ['hammer', 'workbench', 2775], ['paintbrush', 'workbench', 2822],
];
export const SITE_CAST = [
  { cast: 'builder', x: 1335, y: 938 },
  { cast: 'boy5', seat: 'bench-1' },
];
// The kid (SITE_CAST[1]) gets an orange hard hat.
export const SITE_CAST_WEAR = [{ cast: 1, kind: 'hard-hat', slot: 'wear-hat', color: 'orange' }];

/** Where the grid places a piece: {x, y, z} for kind at column c, row r. Pure. */
export function gridSpot(grid, shape, c, r) {
  return { x: r1(grid.x0 + (c + shape.w / 2) * grid.cell), y: r1(grid.y - r * grid.cell), z: Math.min(99, Math.round(r * 2) + 1) };
}

/** Spawn the first-visit things (store ops). room: the normalized room def. */
export function seedSite(store, room, { catalog = null, grid, shapeOfKind }) {
  const surf = (id) => room.surfaces.find((s) => s.id === id);
  const spawn = (kind, x, y, z = 0, props) => store.dispatch('spawn', { id: store.newId(), kind, room: room.id, x: r1(x), y: r1(y), z, ...(props ? { props } : {}) });
  for (const [kind, x, y] of HOTSPOTS) spawn(kind, x, y);
  const shelf = surf('tool-shelf');
  if (shelf) PAINT_STOCK.forEach(([paint, x], i) => spawn('site-paint', x, shelf.y, i, { paint }));
  STOCK.forEach(([kind, sid, x], i) => { const s = surf(sid); if (s) spawn(kind, x, s.y, i % 4); });
  for (const [kind, c, r, paint] of BUILD) {
    const at = gridSpot(grid, shapeOfKind(kind), c, r);
    spawn(kind, at.x, at.y, at.z, { paint, built: true });
  }
  for (const [kind, on, x, fy, props] of SITE_ITEMS) {
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

const NAIL_HTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 12 L13.5 12 L12.6 21 Q12 23 11.4 21 Z" fill="#8E8994" stroke="#433E46" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="12" cy="10" rx="10" ry="7" fill="#B9B4BD" stroke="#433E46" stroke-width="2"/><ellipse cx="9" cy="8.2" rx="3.6" ry="2" fill="#F4F2F6"/></svg>';

/**
 * Mount the site. opts: { input, store, manifest, carry (P1.14), from (the
 * place we came from, null on boot), storage (tests) }. Resolves once it is up.
 */
export async function mountSite(stage, { input, store, manifest, carry = null, from = null, storage = safeStorage() }) {
  const m = manifest.rooms.site;
  const grid = m.grid;
  useArtSprites(manifest);
  const catalog = await loadCatalog();
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const tiled = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tiles') === '0');
  const saved = from ? null : loadCam(storage);
  const cameraX = saved != null ? saved : zoneCamera(m, ARRIVE_ZONE);
  const def = siteRoom(m, { tiled, cameraX });
  const room = mountRoom(stage, def);
  const fx = createFx(room.fxLayer);
  const baseSurfaces = room.def.surfaces.slice();
  const inside = insideSurfaces(m);
  const DECK_KEY = grid.y + 0.5;           // grid pieces sort just in front of the deck
  const TOP_DEPTH = grid.y + 0.5;          // things on the build's tops sort just in front of the pieces

  // ---- tiles ----
  const tiles = createTileLoader({
    stage,
    tiles: def.tiles.map((t) => ({ ...t, img: room.art.get(t.id).querySelector('img') })),
  });
  tiles.update();

  // ---- the fixtures entity ----
  let firstVisit = !fixturesOf(store.state);
  if (firstVisit) store.dispatch('spawn', { id: store.newId(), kind: FIXTURES_KIND, room: FIXTURES_ROOM, x: 0, y: 0, props: {} });
  const fixtures = () => fixturesOf(store.state);
  const fprops = () => { const f = fixtures(); return f ? f.props : {}; };
  const state = (pid) => pieceState(pid, fprops(), m.pieces);

  // ---- build pieces ----
  const propOf = (kind) => { const k = catalog.get(kind); return k && k.art ? manifest.props[k.art.sprite] || null : null; };
  const shapes = new Map();
  const shapeOfKind = (kind) => {
    if (!shapes.has(kind)) {
      const p = propOf(kind);
      shapes.set(kind, p && p.snap && catalog.hasTag(kind, 'buildpiece') ? shapeOf(p.snap, grid.cell) : null);
    }
    return shapes.get(kind);
  };
  const isBuild = (e) => !!e && e.kind !== CHAR_KIND && !!shapeOfKind(e.kind);
  /** A grid piece's placement {id, c, r, shape}, or null (not on the grid). */
  const placementOf = (e) => {
    if (!isBuild(e) || e.parent || e.room !== SITE_ID) return null;
    const shape = shapeOfKind(e.kind);
    const cell = cellOf(grid, shape, e.x, e.y);
    return cell ? { id: e.id, c: cell.c, r: cell.r, shape, kind: e.kind } : null;
  };
  const placedIn = (st) => { const out = []; for (const e of inRoom(st, SITE_ID)) { const p = placementOf(e); if (p) out.push(p); } return out; };
  const placed = () => placedIn(store.state);

  // ---- behaviors, characters, view ----
  const behaviors = createBehaviors({ catalog, store });
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
  const base0 = chars ? chars.hooks : behaviors;
  const base = carry ? carry.hooks(base0, room) : base0;

  const stats = { taps: {}, swaps: 0, snaps: 0, settles: 0, locks: 0, paints: 0, dips: 0, flushes: 0, sways: 0, orphans: 0 };
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let view = null;

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

  // The nail head a hammered piece shows (in its lift, so it rides along).
  function showNail(e, el) {
    const lift = el.querySelector('[data-lift]');
    if (!lift) return;
    let n = lift.querySelector(':scope > .site-nail');
    const on = isBuild(e) && !!e.props.locked;
    if (!on) { if (n) n.style.visibility = 'hidden'; return; }
    if (!n) {
      n = document.createElement('div');
      n.className = 'site-nail';
      n.style.cssText = 'position:absolute;left:50%;top:50%;width:26px;height:26px;margin-left:-13px;margin-top:-17px;z-index:60;pointer-events:none';
      n.innerHTML = NAIL_HTML;
      lift.appendChild(n);
    }
    n.style.visibility = '';
  }

  // The finger's brush: what it touched last (paint each piece once per pass).
  const brushOver = new Map();       // brush id -> id it is over

  const hooks = Object.assign({}, base, {
    spriteOf: (e) => (catalog.hasTag(e.kind, 'hotspot') ? hotSprite(e.kind) : (base.spriteOf ? base.spriteOf(e) : null)),
    sortKeyOf(e) {
      if (placementOf(e)) return DECK_KEY;
      const k = base.sortKeyOf ? base.sortKeyOf(e) : null;
      if (k != null || !catalog.hasTag(e.kind, 'hotspot')) return k;
      return baseSurfaces.some((s) => Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL) ? null : Math.max(e.y, 905);
    },
    scaleOf: (e) => (placementOf(e) ? 1 : base.scaleOf ? base.scaleOf(e) : null),
    onRender(e, ctx) {
      if (base.onRender) base.onRender(e, ctx);
      if (isBuild(e) || ctx.el.querySelector('.site-nail')) showNail(e, ctx.el);
    },
    dropTarget(item, other) {
      if (item.kind === 'hammer' && isBuild(other)) return true;
      if (item.kind === 'paintbrush' && (isBuild(other) || other.kind === 'paint-can')) return true;
      return base.dropTarget ? base.dropTarget(item, other) : false;
    },
    onDropInto(item, target, ctx) {
      if (item.kind === 'hammer' && isBuild(target)) { hammer(target, ctx); return true; }
      if (item.kind === 'paintbrush' && target.kind === 'paint-can') { dip(item, target); return true; }
      if (item.kind === 'paintbrush' && isBuild(target)) { paint(item, target); return true; }
      return base.onDropInto ? base.onDropInto(item, target, ctx) : false;
    },
    onDragStart(e, ctx) {
      if (base.onDragStart) base.onDragStart(e, ctx);
      if (e.kind === 'paintbrush') brushOver.delete(e.id);
      // A piece lifted out of the build: the ones above it settle down now.
      if (placementOf(e)) settleNow();
    },
    onDragMove(e, ctx) {
      if (base.onDragMove) base.onDragMove(e, ctx);
      if (e.kind === 'paintbrush') brushMove(e);
    },
    onDrop(e, ctx) {
      if (isBuild(e) && snapPiece(e, ctx)) return true;
      return base.onDrop ? base.onDrop(e, ctx) : false;
    },
    onTap(e, ctx) {
      const r = base.onTap ? base.onTap(e, ctx) : false;
      // A tap on a tall build makes it sway a little (never fall).
      const p = placementOf(e);
      if (p && !e.props.locked && p.r >= 3) sway(p, { amount: 0.6 });
      return r;
    },
  });

  // Pieces take touches (registered before the entity views).
  const pieces = new Map();
  for (const pid of Object.keys(m.pieces || {})) {
    const el = room.art.get('piece:' + pid);
    if (!el) continue;
    el.dataset.piece = pid;
    const rec = { el, body: el.firstChild, img: el.querySelector('img'), shown: null, gen: 0 };
    pieces.set(pid, rec);
    if (!RIG_PIECES.includes(pid) && !DIG_PIECES.includes(pid)) input.register(el, { onTap: () => tapPiece(pid), pan: true });
  }
  const rigs = createSiteRigs({
    stage, store, input, room, fx, manifest, catalog, pieces, later,
    site: { FIXTURES_KIND, fixtures, placed: () => placed(), isBuild, shapeOfKind, gridSpot, settleNow: () => settleNow() },
  });
  const dig = createSiteDig({
    stage, store, input, room, fx, manifest, catalog, pieces, later,
    site: {
      fixtures, pieceState: state,
      showPiece: (pid, variant) => { if (variant) overrides.set(pid, variant); else overrides.delete(pid); renderPieces(); },
      surface: (id) => baseSurfaces.find((q) => q.id === id) || null,
    },
  });
  view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: dig.hooks(rigs.hooks(hooks)), labels: textLabels(catalog, manifest) });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);

  // ---- surfaces: the fixed ones, the live inside ones, and the build's tops ----
  let surfKey = null;
  let tops = [];
  function applySurfaces() {
    const open = Object.keys(inside).filter((sid) => {
      const { piece, variant } = inside[sid];
      const now = state(piece);
      return now === variant || (INSIDE_ALSO[piece + ':' + variant] || []).includes(now);
    });
    tops = topSurfaces(grid, placed()).map((t) => Object.assign(t, { depth: TOP_DEPTH, sound: 'clack' }));
    const key = open.join(',') + '|' + tops.map((t) => `${t.x0},${t.x1},${t.y}`).join(';');
    if (key === surfKey) return false;
    surfKey = key;
    const live = baseSurfaces.filter((s) => !inside[s.id] || open.includes(s.id));
    room.def.surfaces.length = 0;
    room.def.surfaces.push(...live, ...tops);
    return true;
  }

  // ---- first visit ----
  const here = inRoom(store.state, SITE_ID);
  if (firstVisit || !here.length) {
    seedSite(store, room.def, { catalog, grid, shapeOfKind });
    if (chars && !here.some((e) => e.kind === CHAR_KIND)) {
      const ids = seedCharacters(store, chars.rig, { room: SITE_ID, seats: chars.seats, placements: SITE_CAST });
      for (const w of SITE_CAST_WEAR) {
        if (!ids[w.cast]) continue;
        const wear = (manifest.props[w.kind] || {}).wear;
        const colors = wear && wear.colors && wear.colors[w.color];
        store.dispatch('spawn', { id: store.newId(), kind: w.kind, parent: ids[w.cast], slot: w.slot, props: colors ? { colors } : {} });
      }
    }
  }
  firstVisit = false;
  applySurfaces();
  rigs.bind(view, chars);
  dig.bind(view, chars);

  // ---- the build grid ----
  const viewOf = (id) => (view ? view.viewOf(id) : null);
  const landFx = (x, y, w, row, delay) => later(delay, () => {
    view.play('clack', { pitch: 0.85 + Math.min(1.1, row * 0.09) });
    fx.burst('puff', x, y - 6, { count: 5, spread: Math.max(40, w * 0.55), scale: 0.5, stagger: 10 });
  });

  /** A tall build sways (the lifts of its unlocked pieces lean, more the higher). */
  function sway(p, { amount = 1 } = {}) {
    const all = placed();
    const tower = [p, ...towerOf(all, p)];
    stats.sways++;
    for (const q of tower) {
      const qe = getEntity(store.state, q.id);
      const v = viewOf(q.id);
      if (!qe || qe.props.locked || !v || v.held) continue;
      const d = Math.min(9, (q.r + 1) * 0.7 * amount);
      tween.animate(v.lift, [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: `translate3d(${-d}px, 0, 0)`, offset: 0.2 },
        { transform: `translate3d(${d * 0.7}px, 0, 0)`, offset: 0.45 },
        { transform: `translate3d(${-d * 0.35}px, 0, 0)`, offset: 0.7 },
        { transform: 'translate3d(0, 0, 0)' },
      ], { duration: 900, easing: 'ease-in-out' });
    }
  }

  /** Drop a build piece on the grid: snap, fall, squash, clack, puff. False: not over the grid. */
  function snapPiece(e, ctx) {
    const v = ctx.view.viewOf(e.id);
    if (!v || !overGrid(grid, v.x, v.y)) return false;
    const shape = shapeOfKind(e.kind);
    const spot = snapDrop(grid, placed(), shape, v.x, e.id);
    if (!spot) return false;
    // A drop onto something higher that is not the build (a scaffold shelf): that wins.
    const halfW = (v.sprite.w * DEPTH_SCALE[1]) / 2;
    const r = settle(room.def, { x: v.x, y: v.y, halfW });
    if (r.surface && r.surface.id !== 'build-deck' && r.surface.id.indexOf(TOP_PREFIX) !== 0 && r.y < spot.y - 0.5) return false;
    const from = v.transform;
    const fromY = v.y;
    const at = gridSpot(grid, shape, spot.c, spot.r);
    if (!store.dispatch('move', { id: e.id, room: SITE_ID, x: at.x, y: at.y, z: at.z })) return false;
    const cur = getEntity(store.state, e.id);
    if (cur && !cur.props.built) store.dispatch('set', { id: e.id, path: 'props.built', value: true });   // a built piece never goes home to keep the room's cap
    stats.snaps++;
    if (!view.repaint(e.id)) return true;
    const to = v.transform;
    if (v.posAnim) v.posAnim.cancel();
    const dist = at.y - fromY;
    let landAt = 0;
    if (dist > 6) {
      const f = tween.fall(v.el, from, to, { dist });
      v.posAnim = f.anim;
      landAt = f.landAt;
    } else if (from !== to) {
      v.posAnim = tween.slide(v.el, from, to, { duration: 140 });
      landAt = 110;
    }
    tween.squash(v.body, { delay: landAt, amount: Math.min(1.5, 0.9 + Math.max(0, dist) / 500) });
    landFx(at.x, at.y, v.sprite.w, spot.r, landAt);
    const p = placementOf(getEntity(store.state, e.id) || e);
    if (p) {
      later(landAt + 60, () => {
        const all = placed();
        const me = all.find((q) => q.id === p.id);
        if (!me) return;
        const cur2 = getEntity(store.state, p.id);
        if (me.r + me.shape.h >= 4) sway(me, { amount: 0.8 });
        else if (cur2 && !cur2.props.locked && wobbly(grid, all).includes(p.id)) {
          const v2 = viewOf(p.id);
          if (v2 && !v2.held) tween.wobble(v2.body, { amount: 0.35, duration: 700 });
        }
      });
    }
    return true;
  }

  /**
   * Gravity: every grid piece rests on what is under it now (a piece lifted
   * out of a tower: the ones above settle down), then anything standing on a
   * top that went away (a character on the roof) comes down with it.
   */
  let settling = false;
  function settleNow() {
    if (settling || !view) return;
    settling = true;
    try {
      const held = new Set(view.heldIds());
      const moves = settleGrid(grid, placed().filter((p) => !held.has(p.id)));
      for (const mv of moves) {
        const e = getEntity(store.state, mv.id);
        if (!e) continue;
        const z = Math.min(99, Math.round(mv.r * 2) + 1);
        const oldY = e.y;
        if (!store.dispatch('move', { id: mv.id, room: SITE_ID, x: mv.x, y: mv.y, z })) continue;
        stats.settles++;
        const v = viewOf(mv.id);
        if (v && !v.held) {
          view.animateFrom(mv.id, mv.x, oldY);
          const dist = Math.abs(mv.y - oldY);
          landFx(mv.x, mv.y, v.sprite.w, mv.r, Math.round(tween.fallDuration(dist) * tween.LAND_AT));
        }
      }
      applySurfaces();
      // Things left standing on a top that went away (Rosa on the roof): down
      // onto what is under them now. Only near the build, and never a seated
      // character, a hot spot or something in a finger.
      const f = room.def.floor;
      for (const e of inRoom(store.state, SITE_ID)) {
        if (held.has(e.id) || placementOf(e) || (e.props && e.props.seat) || catalog.hasTag(e.kind, 'hotspot') || e.kind === HOOK_KIND) continue;
        if (e.x < grid.x0 - 60 || e.x > grid.x1 + 60) continue;
        if (surfaceUnder(room.def, e.x, e.y) || (e.y >= f.top - 0.5 && e.y <= f.bottom + 0.5)) continue;
        const v = viewOf(e.id);
        const halfW = v ? (v.sprite.w * DEPTH_SCALE[1]) / 4 : 20;
        const r = settle(room.def, { x: e.x, y: e.y, halfW });
        if (!store.dispatch('move', { id: e.id, room: SITE_ID, x: r1(r.x), y: r1(r.y), z: 0 })) continue;
        stats.orphans++;
        view.animateFrom(e.id, e.x, e.y);
      }
    } finally {
      settling = false;
    }
  }

  // ---- hammer and paint ----
  const center = (id) => { const v = viewOf(id); return v ? { x: v.x, y: v.y - v.sprite.h * v.scale * 0.5, w: v.sprite.w * v.scale } : null; };

  function hammer(target) {
    const c = center(target.id);
    const v = viewOf(target.id);
    if (!target.props.locked) {
      store.dispatch('set', { id: target.id, path: 'props.locked', value: true });
      stats.locks++;
    }
    view.play('bonk', { pitch: 0.95 + Math.random() * 0.1 });
    later(120, () => view.play('sparkle', { gain: 0.6 }));
    if (v) tween.squash(v.body, { amount: 1.3 });
    if (c) fx.burst('sparkle', c.x, c.y - 10, { count: 8, spread: Math.max(60, c.w * 0.7) });
  }

  function dip(brush, can) {
    const color = (can.props && can.props.paint) || (propOf(can.kind) || {}).default || 'red';
    if (brush.props.paint !== color) store.dispatch('set', { id: brush.id, path: 'props.paint', value: color });
    stats.dips++;
    view.play('bubble', { pitch: 0.8 });
    const v = viewOf(can.id);
    if (v) tween.squish(v.body, { amount: 0.6 });
    const c = center(can.id);
    if (c) fx.burst('puff', c.x, c.y - 10, { count: 4, spread: 40, scale: 0.5 });
  }

  function paint(brush, target) {
    const color = brush.props.paint;
    const v = viewOf(target.id);
    const c = center(target.id);
    if (!color || color === 'clean') {
      // A dry brush: a tickle, no paint.
      view.play('squeak', { pitch: 1.4 });
      if (v) tween.wobble(v.body, { amount: 0.3 });
      return false;
    }
    const want = paintFor(propOf(target.kind), color);
    if (!want) {
      // No such colour for this piece (rainbow on a plank): a playful "no".
      view.play('boing', { pitch: 1.2 });
      if (v) tween.shake(v.body, { amount: 0.4 });
      return false;
    }
    if (target.props.paint !== want) {
      store.dispatch('set', { id: target.id, path: 'props.paint', value: want });
      stats.paints++;
    }
    view.play('squish', { pitch: 1.1 + Math.random() * 0.2 });
    if (v) tween.squash(v.body, { amount: 0.8 });
    if (c) fx.burst('sparkle', c.x, c.y, { count: 5, spread: Math.max(50, c.w * 0.6) });
    return true;
  }

  // The brush's bristles (its feet point) touch a can or a piece: dip or paint once per pass.
  function brushMove(brush) {
    const bv = viewOf(brush.id);
    if (!bv) return;
    const x = bv.x, y = bv.y;
    let hit = null;
    for (const id of view.ids()) {
      if (id === brush.id) continue;
      const e = getEntity(store.state, id);
      if (!e || !(isBuild(e) || e.kind === 'paint-can')) continue;
      const v = viewOf(id);
      if (!v || v.held) continue;
      const hw = (v.sprite.w * v.scale) / 2;
      const top = v.y - v.sprite.h * v.scale;
      if (x >= v.x - hw && x <= v.x + hw && y >= top - 6 && y <= v.y + 6) { if (!hit || v.key * 100 + v.z > hit.rank) hit = { id, e, rank: v.key * 100 + v.z }; }
    }
    const was = brushOver.get(brush.id) || null;
    const now = hit ? hit.id : null;
    if (was === now) return;
    brushOver.set(brush.id, now);
    if (!hit) return;
    const b = getEntity(store.state, brush.id) || brush;
    if (hit.e.kind === 'paint-can') dip(b, hit.e);
    else if (b.props.paint && b.props.paint !== 'clean') paint(b, hit.e);
  }

  // ---- fixture pieces ----
  const overrides = new Map();
  function swap(pid, variant) {
    const p = pieces.get(pid);
    const v = m.pieces[pid].variants[variant];
    if (!p || !v || p.shown === variant) return;
    p.shown = variant;
    p.el.dataset.variant = variant;
    const gen = ++p.gen;
    const pre = new Image();
    pre.src = v.file;
    const show = () => { if (p.gen === gen) { p.img.src = v.file; stats.swaps++; } };
    if (!p.img.getAttribute('src')) { show(); return; }
    (pre.decode ? pre.decode() : Promise.resolve()).then(show, show);
  }
  function renderPieces() {
    const props = fprops();
    for (const pid of pieces.keys()) swap(pid, overrides.get(pid) || pieceState(pid, props, m.pieces));
  }
  const burstAt = (pid, type, o = {}) => {
    const p = m.pieces[pid];
    fx.burst(type, p.x + p.w / 2, p.y + p.h * 0.45, Object.assign({ count: 6, spread: Math.max(60, Math.min(160, p.w * 0.6)) }, o));
  };
  const playS = (s) => { if (s) view.play(s[0], s[1]); };

  function tapPiece(pid) {
    const spec = PIECES[pid] || { react: 'wobble', sound: ['pop'] };
    const p = pieces.get(pid);
    stats.taps[pid] = (stats.taps[pid] || 0) + 1;
    if (spec.toggle) {
      const next = nextToggle(pid, state(pid));
      const f = fixtures();
      if (f) store.dispatch('set', { id: f.id, path: 'props.' + pid, value: next });
      if (pid === 'crane-lever') rigs.lever(next);
      playS(spec.sound && spec.sound[next]);
      if (spec.fx && spec.fx[next]) burstAt(pid, spec.fx[next]);
      const then = spec.then && spec.then[next];
      if (then) {
        later(then[1], () => {
          view.play(then[0]);
          if (then[0] === 'flush') {
            stats.flushes++;
            later(500, () => burstAt(pid, 'puff', { count: 5, scale: 0.7 }));
            tween.shake(p.body, { amount: 0.25, duration: 900 });
          }
        });
      }
      tween.squish(p.body, { amount: 0.5, duration: 300 });
      return;
    }
    if (spec.react === 'shake') tween.shake(p.body, { amount: 0.5 });
    else if (spec.react === 'squish') tween.squish(p.body, { amount: 0.4 });
    else tween.wobble(p.body, { amount: 0.25 });
    playS(spec.sound);
    burstAt(pid, spec.fx || 'sparkle', { count: 4 });
  }

  renderPieces();
  view.refresh();

  // Keep the grid honest after this iPad's own changes (a piece carried off,
  // pocketed, picked up by the other hand...): gravity plus the tops. The
  // other iPad settles its own changes, so the two never fight.
  let prevState = store.state;
  let pending = 0;
  const unsubscribe = store.subscribe((st, env) => {
    const prev = prevState;
    prevState = st;
    applySurfaces();
    renderPieces();
    if (!env || env.device !== store.device || settling || pending || rigs.quiet() || !MOVES_THINGS.has(env.op)) return;
    const ids = env.args.ids || (env.args.id ? [env.args.id] : []);
    const wasOnGrid = ids.some((id) => { const e = prev && prev.entities[id]; return e && placementOf(getEntity(prev, id) || e); });
    if (!wasOnGrid) return;
    pending = setTimeout(() => { timers.delete(pending); pending = 0; settleNow(); }, 0);
    timers.add(pending);
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
    grid,
    pieces: {
      ids: () => [...pieces.keys()],
      state,
      shown: (pid) => (pieces.get(pid) || {}).shown || null,
      el: (pid) => (pieces.get(pid) || {}).el || null,
      tap: tapPiece,
    },
    build: {
      /** Pieces on the grid: [{id, kind, c, r, w, h}]. */
      placed: () => placed().map((p) => ({ id: p.id, kind: p.kind, c: p.c, r: p.r, w: p.shape.w, h: p.shape.h })),
      heights: () => heightMap(grid, placed()),
      tops: () => tops.map((t) => ({ id: t.id, x0: t.x0, x1: t.x1, y: t.y })),
      settle: settleNow,
    },
    stats: () => ({ ...stats, taps: { ...stats.taps }, timers: timers.size, rigs: rigs.stats(), dig: dig.stats() }),
    /** P2c.2: the tower crane and the wrecking ball (site-rigs.js; tests, debugging). */
    crane: rigs.crane,
    wreck: rigs.wreck,
    /** P2c.3: the dig pit, the excavator and the truck (site-dig.js; tests, debugging). */
    dig: dig.api,
    surfaces: () => room.def.surfaces.map((s) => s.id),
    fixtures,
    /** Where things arriving by car stand: in front of the build yard, in a row. */
    arrivalSpot(i) { return { x: Math.round(1290 - i * 115), y: Math.round(905 + (i % 2) * 35) }; },
    destroy() {
      unsubscribe();
      rigs.destroy();
      dig.destroy();
      offStage();
      clearTimeout(camTimer);
      for (const t of timers) clearTimeout(t);
      timers.clear();
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

/** Image files the site shows first (preloading before a transition). */
export function siteFiles(manifest, { cameraX = null } = {}) {
  const m = manifest.rooms.site;
  const x = cameraX == null ? zoneCamera(m, ARRIVE_ZONE) : cameraX;
  const near = (a, w) => a + w > x - 100 && a < x + 1540;
  const out = [];
  for (const L of m.layers) for (const t of L.tiles || [L]) if (near(t.x, t.w)) out.push(t.file);
  for (const p of Object.values(m.pieces || {})) if (near(p.x, p.w)) out.push(p.variants[p.default].file);
  return out;
}
