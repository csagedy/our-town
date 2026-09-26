// Test room for the P1.7 view layer (index.html?room=test): a wall shelf, a
// counter against the back wall, a free-standing table and the floor band,
// with 10 draggable placeholder items spawned into the store on first boot
// (they persist through reload like everything else in the store). Tap an
// item: sound + squish. Drag it: it lands on the surface under it, or falls
// to the floor with a bounce.
//
// index.html?room=catalog is the same room (id test/catalog) set up for
// P1.8: 15 catalog kinds (data/catalog.json) covering every starter
// behavior (toggle, cycle, sound, squeak, wobble, spill, container, eatable,
// spawner), drawn with the art manifest's WebPs where they exist and
// placeholders otherwise. Both rooms run the behavior runtime, so every tap
// on anything reacts (kinds not in the catalog get the universal fallback).
//
// Temporary, like the boot scene: the real rooms arrive with the locations.

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { settle, normalizeRoom } from '../engine/surfaces.js';
import { spriteFor, addSpriteSource, PLACEHOLDER_KINDS } from '../engine/sprites.js';
import { inRoom } from '../engine/world.js';
import { sfx } from '../audio/index.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';

export const TEST_ROOM = {
  id: 'test/lab',
  width: 1440,
  backdrop: { top: '#fde4bd', bottom: '#d4955f', horizon: 700 },
  floor: { top: 700, bottom: 960, x0: 0, x1: 1440, sound: 'thud' },
  surfaces: [
    { id: 'shelf', x0: 120, x1: 460, y: 330, depth: 700, sound: 'knock' },
    { id: 'counter', x0: 520, x1: 880, y: 540, depth: 700, sound: 'knock' },
    { id: 'table', x0: 1010, x1: 1330, y: 640, depth: 830, sound: 'knock' },
  ],
  art: [
    { id: 'baseboard', layer: 'back', x: -100, y: 686, w: 1640, h: 16, cls: 'ph-baseboard' },
    { id: 'window', layer: 'back', x: 1020, y: 150, w: 260, h: 220, cls: 'ph-window' },
    { id: 'shelf', layer: 'back', x: 110, y: 330, w: 360, h: 60, cls: 'ph-shelf',
      html: '<i class="plank"></i><i class="bracket l"></i><i class="bracket r"></i>' },
    { id: 'counter', layer: 'mid', depth: 700, x: 506, y: 540, w: 388, h: 162, cls: 'ph-counter',
      html: '<i class="top"></i><i class="front"></i>' },
    { id: 'table', layer: 'mid', depth: 830, x: 996, y: 640, w: 348, h: 190, cls: 'ph-table',
      html: '<i class="leg l"></i><i class="leg r"></i><i class="cloth"></i><i class="top"></i>' },
    { id: 'plant', layer: 'front', x: -30, y: 850, w: 130, h: 170, cls: 'ph-plant',
      html: '<i class="leaf a"></i><i class="leaf b"></i><i class="pot"></i>' },
  ],
};

// First-boot layout: [kind, surface id or null, x, floor y].
export const TEST_ITEMS = [
  ['test-book', 'shelf', 210],
  ['test-jar', 'shelf', 380],
  ['test-cup', 'counter', 590],
  ['test-pot', 'counter', 710],
  ['test-bun', 'counter', 830],
  ['test-bottle', 'table', 1070],
  ['test-star', 'table', 1250],
  ['test-ball', null, 320, 880],
  ['test-block', null, 960, 790],
  ['test-teddy', null, 1370, 920],
];

// ?room=catalog first-boot layout: 15 catalog kinds, same format.
export const CATALOG_ROOM = Object.assign({}, TEST_ROOM, { id: 'test/catalog' });
export const CATALOG_ITEMS = [
  ['book', 'shelf', 170],
  ['flower-pot', 'shelf', 250],
  ['mug', 'shelf', 330],
  ['lamp', 'shelf', 410],
  ['cookie-jar', 'counter', 565],
  ['bowl', 'counter', 645],
  ['pan', 'counter', 750],
  ['cupcake', 'counter', 850],
  ['apple', 'table', 1060],
  ['egg', 'table', 1140],
  ['gift', 'table', 1250],
  ['ball', null, 250, 880],
  ['blocks', null, 450, 800],
  ['teddy', null, 680, 900],
  ['toy-bin', null, 1180, 930],
];

/** Spawn the first-boot items (or `extra` more, for perf tests) into the store. */
export function spawnTestItems(store, { extra = 0, room = normalizeRoom(TEST_ROOM), items = TEST_ITEMS } = {}) {
  const spawn = (kind, x, y) => {
    const s = spriteFor(kind);
    const r = settle(room, { x, y, halfW: s.w / 2 });
    store.dispatch('spawn', { id: store.newId(), kind, room: room.id, x: Math.round(r.x), y: r.y });
  };
  if (!extra) {
    for (const [kind, on, x, fy] of items) {
      const s = on && room.surfaces.find((q) => q.id === on);
      spawn(kind, x, s ? s.y : fy);
    }
    return;
  }
  // Perf filler: a grid over the floor band and surfaces, deterministic.
  for (let i = 0; i < extra; i++) {
    const kind = PLACEHOLDER_KINDS[i % PLACEHOLDER_KINDS.length];
    const x = 60 + ((i * 137) % 1320);
    const y = [330, 540, 640, 720, 780, 840, 900, 950][i % 8];
    spawn(kind, x, y);
  }
}

/** Mount the test room (set 'test') or the catalog room (set 'catalog'). Loads the catalog first. */
export async function mountTestRoom(stage, { input, store, set = 'test' }) {
  const catalog = await loadCatalog();
  // Catalog kinds draw from the art manifest (or their placeholder) for
  // every spriteFor() caller too, not only the view.
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const isCatalog = set === 'catalog';
  const room = mountRoom(stage, isCatalog ? CATALOG_ROOM : TEST_ROOM);
  const fx = createFx(room.fxLayer);
  const behaviors = createBehaviors({ catalog, store });
  const view = createRoomView({ stage, store, input, room, fx, sfx, behaviors });
  behaviors.bind(view, fx);
  const items = isCatalog ? CATALOG_ITEMS : TEST_ITEMS;
  if (!inRoom(store.state, room.id).length) spawnTestItems(store, { room: room.def, items });
  return {
    room, view, fx, catalog, behaviors,
    spawnExtra: (n) => spawnTestItems(store, { extra: n, room: room.def }),
    destroy() { view.destroy(); fx.clear(); room.destroy(); removeSource(); },
  };
}
