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
// index.html?room=containers (id test/pantry) is set up for P1.9: a fridge
// with shelves holding an egg-carton spawner, a tray holding a plate holding
// a cupcake (and a mug), a basket (contents peek over the rim), a bowl (a
// heap), a pallet (a stack of blocks), a spare plate, and spawners: the
// crayon cup, the brick pile and the toy bin (also a container). Its entity
// cap is low (12 loose clones) so the "go home" rule shows quickly.
// index.html?room=porch (id test/porch) starts empty: carry something there
// with scene.carry(id, 'test/porch') (a `travel` op, like P1.14's pocket
// tray will) and open it. Scene hooks: scene.tidy() (the "go home" parent
// action, P1.16 will put it in the parent menu), scene.carry(id, room).
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
import { mountCharacters, seedCharacters } from '../engine/characters.js';
import { speech } from '../audio/index.js';

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

// ?room=cast (id test/cast, P1.10): the test room plus seats (a bench under
// the shelf, a stool, a sofa to lie on), the starter cast (seedCharacters
// placements) and things to give them: food to eat, hats, a cape.
export const CAST_ROOM = Object.assign({}, TEST_ROOM, {
  id: 'test/cast',
  backdrop: { top: '#fde2e4', bottom: '#d9a38a', horizon: 700 },
  seats: [
    { id: 'bench-1', x: 205, y: 640, depth: 712 },
    { id: 'bench-2', x: 385, y: 640, depth: 712 },
    { id: 'stool', x: 1372, y: 738, depth: 800 },
    { id: 'sofa', x: 640, y: 874, depth: 950, lie: true, half: 140 },
  ],
  art: TEST_ROOM.art.concat([
    { id: 'bench', layer: 'mid', depth: 712, x: 110, y: 636, w: 370, h: 76, cls: 'ph-bench',
      html: '<i class="top"></i><i class="leg l"></i><i class="leg r"></i>' },
    { id: 'stool', layer: 'mid', depth: 800, x: 1330, y: 734, w: 84, h: 66, cls: 'ph-stool',
      html: '<i class="top"></i><i class="leg l"></i><i class="leg r"></i>' },
    { id: 'sofa', layer: 'mid', depth: 950, x: 480, y: 796, w: 320, h: 154, cls: 'ph-sofa',
      html: '<i class="back"></i><i class="seat"></i><i class="arm l"></i><i class="arm r"></i>' },
  ]),
});
export const CAST_ITEMS = [
  ['cupcake', 'counter', 600],
  ['apple', 'counter', 700],
  ['egg', 'counter', 800],
  ['mug', 'table', 1060],
];
export const TEST_CAST = [
  { cast: 'girl9', seat: 'bench-1' },
  { cast: 'grandpa', seat: 'bench-2' },
  { cast: 'grownup', x: 110, y: 945 },
  { cast: 'boy5', x: 880, y: 950 },
];
export const TEST_CAST_ITEMS = [
  { kind: 'crown', x: 1150, y: 640 },
  { kind: 'hero-cape', x: 1270, y: 640 },
  { kind: 'chef-hat', x: 1230, y: 960 },
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

// ?room=containers first-boot layout: [kind, surface id or null, x, floor y,
// contents]. Contents are [kind, slot, contents] (spawned inside, nested).
// No sofa here: the floor is for the brick pile, the pallet and the toys.
const noSofa = (def) => ({
  art: (def.art || []).filter((a) => a.id !== 'sofa'),
  seats: (def.seats || []).filter((q) => q.id !== 'sofa'),
});
export const CONTAINERS_ROOM = Object.assign({}, TEST_ROOM, noSofa(TEST_ROOM), {
  id: 'test/pantry', cap: 12,
  backdrop: { top: '#d8f3dc', bottom: '#95d5b2', horizon: 700 },
});
export const CONTAINER_ITEMS = [
  ['fridge', null, 190, 724, [['egg-carton', 's0'], ['apple', 's3']]],
  ['crayon-cup', 'shelf', 400],
  ['tray', 'counter', 640, null, [['plate', 's1', [['cupcake', 's0']]], ['mug', 's2']]],
  ['basket', 'counter', 810, null, [['teddy', 's0'], ['apple', 's1']]],
  ['bowl', 'table', 1080, null, [['egg', 's0']]],
  ['plate', 'table', 1250],
  ['brick-pile', null, 430, 940],
  ['pallet', null, 700, 900, [['blocks', 's0'], ['blocks', 's1']]],
  ['toy-bin', null, 1180, 930],
];

// ?room=porch: a second room to carry things into (empty at first).
export const PORCH_ROOM = Object.assign({}, TEST_ROOM, noSofa(TEST_ROOM), {
  id: 'test/porch',
  backdrop: { top: '#cde7ff', bottom: '#a3c4f3', horizon: 700 },
});

/** Spawn the first-boot items (or `extra` more, for perf tests) into the store. */
export function spawnTestItems(store, { extra = 0, room = normalizeRoom(TEST_ROOM), items = TEST_ITEMS } = {}) {
  const spawn = (kind, x, y) => {
    const s = spriteFor(kind);
    const r = settle(room, { x, y, halfW: s.w / 2 });
    const id = store.newId();
    store.dispatch('spawn', { id, kind, room: room.id, x: Math.round(r.x), y: r.y });
    return id;
  };
  const fill = (parent, contents) => {
    for (const [kind, slot, inner] of contents || []) {
      const id = store.newId();
      store.dispatch('spawn', { id, kind, parent, slot });
      fill(id, inner);
    }
  };
  if (!extra) {
    for (const [kind, on, x, fy, contents] of items) {
      const s = on && room.surfaces.find((q) => q.id === on);
      fill(spawn(kind, x, s ? s.y : fy), contents);
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

const SETS = {
  test: [TEST_ROOM, TEST_ITEMS],
  catalog: [CATALOG_ROOM, CATALOG_ITEMS],
  containers: [CONTAINERS_ROOM, CONTAINER_ITEMS],
  porch: [PORCH_ROOM, []],
  cast: [CAST_ROOM, CAST_ITEMS],
};
/** The dev routes this module mounts (?room=<set>). */
export const TEST_SETS = Object.keys(SETS);

/** Mount a test room: set 'test', 'catalog', 'containers' or 'porch'. Loads the catalog first. */
export async function mountTestRoom(stage, { input, store, set = 'test' }) {
  const catalog = await loadCatalog();
  // Catalog kinds draw from the art manifest (or their placeholder) for
  // every spriteFor() caller too, not only the view.
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const [roomDef, items] = SETS[set] || SETS.test;
  const room = mountRoom(stage, roomDef);
  const fx = createFx(room.fxLayer);
  const behaviors = createBehaviors({ catalog, store });
  // Characters (P1.10) can be in every test room; the starter cast is in ?room=cast.
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
  const view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: chars ? chars.hooks : behaviors });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);
  // First boot only (and the empty porch stays empty).
  if (items.length && !inRoom(store.state, room.id).length) {
    spawnTestItems(store, { room: room.def, items });
    if (chars && set === 'cast') seedCharacters(store, chars.rig, { room: room.id, seats: chars.seats, placements: TEST_CAST, items: TEST_CAST_ITEMS });
  }
  return {
    room, view, fx, catalog, behaviors, chars,
    spawnExtra: (n) => spawnTestItems(store, { extra: n, room: room.def }),
    /** "Go home": loose things back to their catalog home (P1.9; P1.16's parent menu later). */
    tidy: () => behaviors.tidy(),
    /** Carry a top-level thing (and everything inside it) to another room: a `travel` op. */
    carry: (id, to) => !!store.dispatch('travel', { ids: [id], to }),
    destroy() { view.destroy(); if (chars) chars.destroy(); fx.clear(); room.destroy(); removeSource(); },
  };
}
