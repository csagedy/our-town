// The cafe kitchen (P1.13 routes the cafe here): the kitchen's art layers
// from the art pipeline (assets/rooms/kitchen/*.webp) with its surfaces from
// the manifest, and the same behaviors as the test room (P1.8 catalog +
// behavior runtime): drag anything onto a shelf, counter or table (or drop
// it on the floor); every tap reacts (a mug fills, the cookie jar opens, an
// apple gets bitten; unknown kinds get the universal fallback). Starter props
// outside the catalog draw with their WebP from the art manifest. The real
// cafe (Phase 2a) replaces the starter set.

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { settle } from '../engine/surfaces.js';
import { inRoom } from '../engine/world.js';
import { sfx } from '../audio/index.js';
import { addSpriteSource, spriteFor } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { useArtSprites } from './art.js';
import { mountCharacters, seedCharacters } from '../engine/characters.js';
import { speech } from '../audio/index.js';
import * as tween from '../engine/tween.js';

export const KITCHEN_ID = 'cafe/kitchen';

/** The view-layer room definition for the kitchen, from its manifest entry. Pure. */
export function kitchenRoom(m, id = KITCHEN_ID) {
  const floorTop = m.floor.y0;
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  // A thing on a back-layer shelf sorts just behind the counter layer.
  const depthOf = (layer) => (layer === 'back' ? floorTop : baseline[layer]);
  return {
    id,
    width: m.width,
    backdrop: { top: '#EECAB8', bottom: '#E7BFA3', horizon: floorTop },
    floor: { top: floorTop, bottom: m.floor.y1, x0: 0, x1: m.width, sound: 'thud' },
    surfaces: m.surfaces.map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, y: s.y, depth: depthOf(s.layer), sound: 'knock' })),
    // P1.10: characters sit on the stools and chairs (between the chair backs and the table).
    seats: (m.seats || []).map((s) => ({ id: s.id, x: s.at[0], y: s.at[1], depth: depthOf(s.layer) })),
    art: m.layers.map((L) => ({
      id: L.id, layer: L.id === 'back' ? 'back' : 'mid', depth: L.id === 'back' ? undefined : L.baseline,
      x: L.x, y: L.y, w: L.w, h: L.h, cls: 'art-img',
      html: `<img src="${L.file}" alt="" draggable="false" decoding="async">`,
    })),
  };
}

// First visit: [kind, surface id or null, x, floor y]. Catalog kinds (with
// behaviors) plus a few art-only foods.
export const KITCHEN_ITEMS = [
  ['cookie-jar', 'shelf-l3', 150], ['teddy', 'shelf-l2', 300], ['flower-pot', 'shelf-r2', 1010],
  ['juice', 'window-sill', 640], ['egg', 'back-counter', 640], ['pan', 'back-counter', 1000],
  ['croissant', 'display-top', 1160], ['cake-slice', 'display-top', 1290],
  ['mug', 'island-top', 580], ['bowl', 'island-top', 700], ['cupcake', 'island-top', 890], ['bread', 'island-shelf', 820],
  ['apple', 'dining-table', 110], ['banana', 'dining-table', 380],
  ['ball', null, 1120, 930], ['blocks', null, 520, 900],
];

// P1.10: the starter cast on a first visit (characters.js seedCharacters placements).
export const KITCHEN_CAST = [
  { cast: 'boy5', seat: 'chair-1' },
  { cast: 'grandpa', seat: 'chair-2' },
  { cast: 'grownup', x: 1010, y: 790 },
  { cast: 'girl9', x: 1190, y: 935 },
];
export const KITCHEN_CAST_ITEMS = [{ kind: 'chef-hat', x: 800, y: 504, z: 1 }];

export function spawnKitchenItems(store, room) {
  for (const [kind, on, x, fy] of KITCHEN_ITEMS) {
    const s = on && room.surfaces.find((q) => q.id === on);
    const sp = spriteFor(kind);
    const r = settle(room, { x, y: s ? s.y : fy, halfW: sp.w / 2 });
    store.dispatch('spawn', { id: store.newId(), kind, room: room.id, x: Math.round(r.x), y: r.y });
  }
}

/**
 * Zoe's text layer (P1.16): catalog labels, the art manifest's label for
 * art-only kinds, a name in props (name tags, later). A tap reads it aloud.
 */
export function textLabels(catalog, manifest) {
  return {
    of: (e) => (e.props && typeof e.props.name === 'string' && e.props.name) || catalog.labelOf(e.kind)
      || (manifest.props && manifest.props[e.kind] && manifest.props[e.kind].label) || null,
    say(text, el) {
      tween.squish(el, { amount: 0.5, duration: 260 });
      speech.say(text, { interrupt: true }).then((ok) => { if (!ok) sfx.play('chime', { gain: 0.6 }); });
    },
  };
}

/** Mount the kitchen. opts: { input, store, manifest }. Resolves once it is up. */
export async function mountKitchen(stage, { input, store, manifest }) {
  useArtSprites(manifest);                 // art-only kinds (croissant, bread...)
  const catalog = await loadCatalog();     // never rejects
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const room = mountRoom(stage, kitchenRoom(manifest.rooms.kitchen));
  const fx = createFx(room.fxLayer);
  const behaviors = createBehaviors({ catalog, store });
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });   // null without the rig
  const view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: chars ? chars.hooks : behaviors, labels: textLabels(catalog, manifest) });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);
  if (!inRoom(store.state, room.id).length) {
    spawnKitchenItems(store, room.def);
    if (chars) seedCharacters(store, chars.rig, { room: room.id, seats: chars.seats, placements: KITCHEN_CAST, items: KITCHEN_CAST_ITEMS });
  }
  return {
    id: room.id, room, view, fx, catalog, behaviors,
    chars,
    destroy() { view.destroy(); if (chars) chars.destroy(); fx.clear(); room.destroy(); removeSource(); },
  };
}

/** Image files the kitchen shows (for preloading before a transition). */
export const kitchenFiles = (manifest) => manifest.rooms.kitchen.layers.map((L) => L.file);
