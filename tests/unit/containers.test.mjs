// P1.9 containers and spawners: slot layouts, spill spots, the entity cap and
// tidy-up (src/core/containers.js, pure), and the store-level guarantees:
// things inside containers persist, travel with their container between
// rooms, replay to the same world, and are held with their container on two
// iPads.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import {
  layoutSlots, assignSlots, freeSlots, pickSlot, planSpill, planCap, planTidy, isCustomized,
  checkLayout, boxOf, overlaps, slotIndex, jitter,
} from '../../src/core/containers.js';
import { createStore } from '../../src/engine/store.js';
import { createHost, joinAsGuest } from '../../src/engine/authority.js';
import { applyAll, createWorld, childrenOf, inRoom, locate, getEntity } from '../../src/engine/world.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';
import { openWorld, createMemoryAdapter } from '../../src/core/persist.js';
import { createCatalog } from '../../src/core/catalog.js';
import { createBehaviors } from '../../src/core/behaviors/index.js';
import { CONTAINERS_ROOM, CONTAINER_ITEMS, spawnTestItems } from '../../src/scenes/test-room.js';
import { createRng } from '../../src/engine/random.js';

const json = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const K = 'cafe/kitchen';
const D = 'cafe/dining';
const room = normalizeRoom(CONTAINERS_ROOM);

const items = (n, w = 40, h = 50) => Array.from({ length: n }, (_, i) => ({ id: 'a:' + i, slot: 's' + i, w, h }));

describe('slot layouts', () => {
  test('slots: own slot kept, clashes and legacy slots get the first free one', () => {
    assert.equal(slotIndex('s12'), 12);
    assert.equal(slotIndex('in'), -1);
    const got = assignSlots([{ id: 'b', slot: 's0' }, { id: 'a', slot: 's0' }, { id: 'c', slot: 'in' }, { id: 'd', slot: 's5' }], 4);
    assert.deepEqual(got.map((g) => [g.id, g.index]), [['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
    assert.deepEqual(freeSlots([{ id: 'x', slot: 's1' }], 3), [0, 2]);
    assert.deepEqual(freeSlots(items(3), 3), []);
  });

  test('row, grid, shelves, plate: distinct spots, feet on the right lines', () => {
    const box = { w: 200, h: 100 };
    const row = layoutSlots({ layout: 'row', capacity: 3, area: [0, 0.2, 1, 0.3] }, box, items(3));
    const xs = [...row.values()].map((s) => s.x);
    assert.equal(new Set(xs).size, 3);
    for (const s of row.values()) { assert.equal(s.y, -70); assert.equal(s.front, true); }
    const shelves = layoutSlots({ layout: 'shelves', capacity: 6, cols: 2, shelves: [0.3, 0.6, 0.9], area: [0, 0, 1, 1] }, box, items(6));
    assert.deepEqual([...new Set([...shelves.values()].map((s) => s.y))], [-70, -40, -10]);
    const grid = layoutSlots({ layout: 'grid', capacity: 4 }, box, items(4));
    assert.equal(new Set([...grid.values()].map((s) => s.x + ',' + s.y)).size, 4);
    const plate = layoutSlots({ layout: 'plate', capacity: 3, area: [0.1, 0.3, 0.9, 0.5] }, box, items(3));
    const [c, l, r] = ['a:0', 'a:1', 'a:2'].map((id) => plate.get(id));
    assert.equal(c.x, 0, 'the first thing sits in the middle');
    assert.ok(l.x < 0 && r.x > 0, 'the garnish ring goes around it');
    assert.ok(c.z > l.z && c.z > r.z && l.scale < c.scale);
  });

  test('stack piles up; heap mounds behind the rim with stable jitter; interior peeks or hides', () => {
    const box = { w: 120, h: 40 };
    const st = layoutSlots({ layout: 'stack', capacity: 4, area: [0.1, 0.2, 0.9, 0.3] }, box, items(3, 50, 30));
    const ys = [...st.values()].map((s) => s.y);
    assert.ok(ys[0] > ys[1] && ys[1] > ys[2], 'each sits on the one below');
    const heap = layoutSlots({ layout: 'heap', capacity: 3, area: [0.1, 0.3, 0.9, 1], peek: 0.5 }, box, items(3));
    for (const s of heap.values()) { assert.equal(s.front, false); assert.ok(s.y <= 0); }
    assert.deepEqual(layoutSlots({ layout: 'heap', capacity: 3, peek: 0.5 }, box, items(3)), layoutSlots({ layout: 'heap', capacity: 3, peek: 0.5 }, box, items(3)), 'deterministic');
    assert.equal(jitter('k3f9:1a'), jitter('k3f9:1a'));
    const peek = layoutSlots({ layout: 'interior', capacity: 3, area: [0.1, 0.2, 0.9, 1], peek: 0.3 }, box, items(2, 40, 100));
    // Feet 70% of the thing's height below the rim (clamped to the box bottom).
    for (const s of peek.values()) assert.equal(s.y, 0);
    const hidden = layoutSlots({ layout: 'interior', capacity: 3, peek: 0 }, box, items(2));
    for (const s of hidden.values()) assert.equal(s.hidden, true);
    for (const s of layoutSlots({ layout: 'hidden', capacity: 2 }, box, items(2)).values()) assert.equal(s.hidden, true);
  });

  test('pickSlot: nearest free fixed spot to the finger, first free otherwise, null when full', () => {
    const p = { layout: 'row', capacity: 3, area: [0, 0.2, 1, 0.3] };
    const box = { w: 300, h: 30 };
    assert.equal(pickSlot(p, box, [], { x: 110, y: -20 }), 's2');
    assert.equal(pickSlot(p, box, [], { x: -110, y: -20 }), 's0');
    assert.equal(pickSlot(p, box, [{ id: 'q', slot: 's0' }], { x: -110, y: -20 }), 's1');
    assert.equal(pickSlot(p, box, items(3)), null);
    assert.equal(pickSlot({ layout: 'heap', capacity: 3 }, box, [{ id: 'q', slot: 's0' }], { x: 100, y: 0 }), 's1');
  });

  test('checkLayout catches bad params', () => {
    assert.equal(checkLayout({ layout: 'row' }), null);
    assert.match(checkLayout({ layout: 'zigzag' }), /layout/);
    assert.match(checkLayout({ layout: 'shelves' }), /shelves/);
    assert.match(checkLayout({ layout: 'row', area: [0.5, 0, 0.2, 1] }), /area/);
    assert.match(checkLayout({ layout: 'heap', peek: 2 }), /peek/);
  });
});

describe('spill spots', () => {
  test('spilled things land on distinct spots, never on each other or on what is already there', () => {
    const others = [{ x: 640, y: 540, w: 176, h: 24 }, { x: 300, y: 880, w: 60, h: 60 }, { x: 740, y: 900, w: 90, h: 70 }];
    const things = [{ id: 'a', w: 91, h: 20 }, { id: 'b', w: 54, h: 77 }, { id: 'c', w: 48, h: 46 },
      { id: 'd', w: 86, h: 72 }, { id: 'e', w: 63, h: 63 }, { id: 'f', w: 77, h: 95 }];
    const spots = planSpill({ room, from: { x: 640, y: 540 }, items: things, others });
    assert.equal(spots.length, 6);
    const boxes = spots.map((s, i) => boxOf(s.x, s.y, things[i].w, things[i].h));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `spot ${i} and ${j} overlap`);
      for (const o of others) assert.ok(!overlaps(boxes[i], boxOf(o.x, o.y, o.w, o.h)), `spot ${i} lands on something`);
      const s = spots[i];
      assert.ok(s.y === 540 || (s.y >= 700 && s.y <= 960), 'on the counter or the floor: ' + s.y);
      assert.ok(s.x > 0 && s.x < 1440);
    }
    assert.ok(spots.some((s) => s.surface === 'counter'), 'the counter is used while there is room');
  });

  test('a packed room still answers (least overlap) and stays inside the room', () => {
    const others = [];
    for (let x = 30; x < 1440; x += 60) for (let y = 710; y <= 960; y += 50) others.push({ x, y, w: 60, h: 60 });
    const spots = planSpill({ room, from: { x: 20, y: 900 }, items: [{ id: 'z', w: 80, h: 80 }], others });
    assert.equal(spots.length, 1);
    assert.ok(spots[0].x >= 40 && spots[0].x <= 1400);
  });
});

// ---- a store with the containers room, as the game runs it (no DOM) ----

function pantry({ device = 'tt', cap = 12, store: given = null } = {}) {
  const catalog = createCatalog(json, manifest);
  const store = given || createStore({ device, now: () => 0 });
  const def = normalizeRoom(Object.assign({}, CONTAINERS_ROOM, { cap }));
  const held = new Set();
  const view = {
    room: { id: def.id, def }, viewOf: () => null, play: () => {}, animateFrom: () => {},
    heldIds: () => [...held],
  };
  const b = createBehaviors({ catalog, store, random: createRng(7) });
  b.bind(view, null);
  if (!given) spawnTestItems(store, { room: def, items: CONTAINER_ITEMS });
  const byKind = (kind) => Object.values(store.state.entities).filter((e) => e.kind === kind && getEntity(store.state, e.id)).map((e) => e.id);
  const ctx = { view, fx: null, info: {} };
  return { catalog, store, def, b, view, held, ctx, byKind, e: (id) => getEntity(store.state, id) };
}

describe('containers in the store', () => {
  test('the containers room: nested contents are children with slots (tray > plate > cupcake)', () => {
    const w = pantry();
    const [tray] = w.byKind('tray');
    const plate = childrenOf(w.store.state, tray).find((c) => c.kind === 'plate');
    assert.equal(plate.slot, 's1');
    const [cake] = childrenOf(w.store.state, plate.id);
    assert.equal(cake.kind, 'cupcake');
    assert.equal(locate(w.store.state, cake.id).top, tray);
    assert.equal(locate(w.store.state, cake.id).room, 'test/pantry');
    assert.ok(!inRoom(w.store.state, 'test/pantry').some((e) => e.id === cake.id), 'not loose in the room');
    const [fridge] = w.byKind('fridge');
    assert.ok(childrenOf(w.store.state, fridge).some((c) => c.kind === 'egg-carton'), 'the egg carton lives in the fridge');
  });

  test('a container travels to another room with everything inside it, and replays the same', () => {
    const w = pantry();
    const log = [];
    const store = createStore({ device: 'tt', now: () => 0 });
    store.subscribe((s, env) => { if (env) log.push(env); });
    spawnTestItems(store, { room: w.def, items: CONTAINER_ITEMS });
    const tray = Object.values(store.state.entities).find((e) => e.kind === 'tray').id;
    const inside = () => Object.values(store.state.entities).filter((e) => locate(store.state, e.id) && locate(store.state, e.id).top === tray && e.id !== tray);
    const before = inside().map((e) => [e.id, e.parent, e.slot]);
    assert.equal(before.length, 3, 'plate, cupcake, mug');
    assert.ok(store.dispatch('travel', { ids: [tray], to: 'test/porch' }));
    assert.equal(locate(store.state, tray).room, 'test/porch');
    for (const e of inside()) assert.equal(locate(store.state, e.id).room, 'test/porch');
    assert.deepEqual(inside().map((e) => [e.id, e.parent, e.slot]), before, 'same parents and slots');
    // Replay from the log (boot): the same world.
    assert.deepEqual(applyAll(createWorld(), log), store.state);
    // Replay in another order (a merged log): the same world too.
    assert.deepEqual(applyAll(createWorld(), log.slice().reverse()).entities, store.state.entities);
  });

  test('contents persist: saved, reloaded from the snapshot and the op log, still inside', async () => {
    const adapter = createMemoryAdapter();
    const t = { fns: [], setTimer(fn) { this.fns.push(fn); return this.fns.length; }, clearTimer() {} };
    const open = () => openWorld({ adapter, setTimer: (f) => t.setTimer(f), clearTimer: () => {}, doc: null, win: null });
    const a = await open();
    const w = pantry({ store: a.store });
    spawnTestItems(a.store, { room: w.def, items: CONTAINER_ITEMS });
    const [tray] = w.byKind('tray');
    const [basket] = w.byKind('basket');
    const [cake] = w.byKind('cupcake');
    // Move the cupcake from the plate into the basket, then the tray to the porch.
    assert.ok(w.b.onDropInto(w.e(cake), w.e(basket), w.ctx));
    assert.equal(w.e(cake).parent, basket);
    a.store.dispatch('travel', { ids: [tray], to: 'test/porch' });
    await a.persist.flush();
    const b = await open();
    const s = b.store.state;
    assert.equal(s.entities[cake].parent, basket);
    assert.match(s.entities[cake].slot, /^s\d$/);
    assert.equal(locate(s, tray).room, 'test/porch');
    assert.equal(childrenOf(s, tray).length, 2, 'plate and mug still on the tray');
    assert.deepEqual(s.entities, a.store.state.entities);
    // And from a compacted snapshot.
    await b.persist.saveNow();
    const c = await open();
    assert.deepEqual(c.store.state.entities, a.store.state.entities);
  });

  test('two iPads: holding a container holds what is inside it', () => {
    let clock = 1000;
    const now = () => clock;
    const toGuest = [], toHost = [];
    const hostStore = createStore({ device: 'zoe', now });
    const w = pantry({ store: hostStore });
    spawnTestItems(hostStore, { room: w.def, items: CONTAINER_ITEMS });
    const host = createHost(hostStore, { broadcast: (env) => toGuest.push(env), now });
    const guestStore = createStore({ device: 'ian', now });
    guestStore.load(JSON.parse(JSON.stringify(hostStore.state)), hostStore.clockState());
    const results = [];
    joinAsGuest(guestStore, (env) => toHost.push(env));
    const flush = () => {
      while (toHost.length || toGuest.length) {
        while (toHost.length) results.push(host.submit(toHost.shift()));
        while (toGuest.length) guestStore.receive(toGuest.shift());
      }
    };
    const [tray] = w.byKind('tray');
    const [cake] = w.byKind('cupcake');
    const [plate] = childrenOf(hostStore.state, tray).filter((c) => c.kind === 'plate').map((c) => c.id);
    assert.equal(host.grab(tray, 'zoe'), true, 'Zoe picks up the tray');
    assert.equal(host.grab(cake, 'ian'), false, 'Ian cannot take the cupcake off it meanwhile');
    assert.equal(host.grab(plate, 'ian'), false);
    guestStore.dispatch('move', { id: cake, room: 'test/pantry', x: 300, y: 880 });
    flush();
    assert.equal(results.at(-1).reason, 'busy');
    assert.equal(hostStore.state.entities[cake].parent, plate, 'still on the plate');
    // Zoe sets the tray down: now Ian can.
    hostStore.dispatch('move', { id: tray, room: 'test/pantry', x: 700, y: 540 });
    flush();
    guestStore.dispatch('move', { id: cake, room: 'test/pantry', x: 300, y: 880 });
    flush();
    assert.equal(hostStore.state.entities[cake].parent, null);
    assert.deepEqual(guestStore.state.entities, hostStore.state.entities);
  });
});

describe('entity cap and tidy', () => {
  test('planCap: oldest untouched loose clones first; never held, customized or holding something', () => {
    const store = createStore({ device: 'tt', now: () => 0 });
    const spawn = (props, x = 100) => { const id = store.newId(); store.dispatch('spawn', { id, kind: 'ball', room: K, x, y: 880, props }); return id; };
    const bin = spawn({});
    const c = [0, 1, 2, 3, 4].map((i) => spawn({ from: bin }, 200 + i * 80));
    const loose = spawn({});   // not a clone: never counted, never sent
    store.dispatch('move', { id: c[0], room: K, x: 900, y: 900 });   // touched: now the newest rev
    store.dispatch('set', { id: c[1], path: 'props.color', value: 'red' });   // customized
    assert.equal(isCustomized(store.state.entities[c[1]]), true);
    assert.equal(isCustomized(store.state.entities[c[2]]), false);
    store.dispatch('attach', { id: loose, parent: c[3] });   // c[3] holds something
    assert.deepEqual(planCap(store.state, K, { cap: 3 }), [c[2], c[4]]);
    assert.deepEqual(planCap(store.state, K, { cap: 3, keep: new Set([c[2]]) }), [c[4], c[0]]);
    assert.deepEqual(planCap(store.state, K, { cap: 5 }), []);
    assert.deepEqual(planCap(store.state, K, { cap: 0, keep: new Set(c) }), [], 'a gentle limit: nothing it may take');
  });

  test('the cap never sends home a held clone; tidy sends things home', () => {
    const w = pantry({ cap: 3 });
    const [cup] = w.byKind('crayon-cup');
    const tapCup = () => w.b.onTap(w.e(cup), w.ctx);
    tapCup();
    const first = Object.values(w.store.state.entities).find((e) => e.props.from === cup).id;
    w.held.add(first);                               // a finger is on the oldest clone
    for (let i = 0; i < 5; i++) tapCup();
    const clones = inRoom(w.store.state, w.def.id).filter((e) => e.props.from === cup);
    assert.equal(clones.length, 3, 'at the cap');
    assert.ok(w.e(first), 'the held one stayed');
    w.held.clear();

    // Tidy: clones go home, the teddy goes into the toy bin, a mug from
    // another room's home travels there; furniture and held things stay.
    const [bin] = w.byKind('toy-bin');
    const teddy = w.store.newId();
    w.store.dispatch('spawn', { id: teddy, kind: 'teddy', room: w.def.id, x: 600, y: 900 });
    const [basket] = w.byKind('basket');
    const bits = childrenOf(w.store.state, basket).map((k) => k.id);
    w.store.dispatch('detach', { id: bits[0], room: w.def.id, x: 900, y: 900 });
    const done = w.b.tidy();
    assert.equal(inRoom(w.store.state, w.def.id).filter((e) => e.props.from === cup).length, 0, 'crayons back in the cup');
    assert.equal(w.e(teddy).parent, bin, 'the teddy is put away in the toy bin');
    assert.ok(done.some((d) => d.how === 'travel' && d.to === K), 'kitchen things travel to the kitchen');
    assert.ok(w.e(w.byKind('fridge')[0]), 'furniture stays');
    assert.equal(locate(w.store.state, w.byKind('fridge')[0]).room, w.def.id);
  });
});
