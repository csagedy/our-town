// P2a.1 the cafe strip, pure parts: the room definition (tiles, pieces,
// inside surfaces, camera stops), piece states, first-visit seeding, the food
// state model's looks, doneness tints, dish bites that leave the plate, the
// Mystery Dish composite, and the tile picker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { createCatalog } from '../../src/core/catalog.js';
import { createBehaviors } from '../../src/core/behaviors/index.js';
import { foodLook } from '../../src/core/behaviors/cafe.js';
import { mysteryLook, mysterySprite, mysteryColorFor, mysteryProps, MYSTERY_HEX } from '../../src/core/mystery.js';
import { createStore } from '../../src/engine/store.js';
import { getEntity, inRoom, childrenOf } from '../../src/engine/world.js';
import { normalizeRoom, settle } from '../../src/engine/surfaces.js';
import { tilesNear, decodedBytes, REST_MARGIN } from '../../src/engine/tiles.js';
import { createRng } from '../../src/engine/random.js';
import {
  cafeRoom, insideSurfaces, zoneCamera, pieceState, pieceVariant, nextToggle, PIECES, seedCafe,
  FRIDGE_ROWS, HOTSPOTS, CAFE_ITEMS, CAFE_ID, fixturesOf, FIXTURES_KIND, cafeFiles,
} from '../../src/scenes/cafe.js';

const json = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const m = manifest.rooms.cafe;
const catalog = createCatalog(json, manifest);

test('cafeRoom: tiled layers, each piece right after its layer, all surfaces, seats and zone stops', () => {
  const def = cafeRoom(m);
  assert.equal(def.id, CAFE_ID);
  assert.equal(def.width, 2880);
  assert.deepEqual(def.cameraStops, [0, 900, 1440]);
  assert.equal(def.surfaces.length, m.surfaces.length);
  assert.equal(def.seats.length, m.seats.length);
  const ids = def.art.map((a) => a.id);
  // Layer order: back tiles, back pieces, counter tiles, counter pieces, ...
  let last = -1;
  for (const L of m.layers) {
    for (let i = 0; i < L.tiles.length; i++) { const at = ids.indexOf(`${L.id}-${i}`); assert.ok(at > last, `${L.id}-${i} in order`); last = at; }
    for (const [pid, p] of Object.entries(m.pieces)) {
      if (p.layer !== L.id) continue;
      const at = ids.indexOf('piece:' + pid);
      assert.ok(at > last, `piece ${pid} after its layer's tiles`);
      const a = def.art[at];
      assert.equal(a.depth, L.id === 'back' ? undefined : L.baseline);
      assert.equal(a.layer, L.id === 'back' ? 'back' : 'mid');
    }
    last = Math.max(last, ...Object.keys(m.pieces).filter((pid) => m.pieces[pid].layer === L.id).map((pid) => ids.indexOf('piece:' + pid)));
  }
  // Tiles have no src until the loader wants them; untiled layers have theirs.
  assert.ok(def.art.filter((a) => a.cls === 'art-img').every((a) => !/src=/.test(a.html)));
  const whole = cafeRoom(m, { tiled: false });
  assert.equal(whole.tiles.length, 0);
  assert.equal(whole.art.filter((a) => a.cls === 'art-img').length, m.layers.length);
  assert.equal(zoneCamera(m, 'dining'), 1440);
});

test('inside surfaces belong to a door piece variant', () => {
  const ins = insideSurfaces(m);
  assert.deepEqual(Object.keys(ins).sort(), ['fridge-1', 'fridge-2', 'fridge-3', 'oven-rack']);
  assert.deepEqual(ins['fridge-2'], { piece: 'fridge-door', variant: 'open' });
  assert.deepEqual(ins['oven-rack'], { piece: 'oven-door', variant: 'open' });
});

test('pieces: every manifest piece reacts to a tap; toggles flip; knobs follow their burner; a full closed oven glows', () => {
  for (const pid of Object.keys(m.pieces)) assert.ok(PIECES[pid], `${pid} has a tap reaction`);
  for (const [pid, spec] of Object.entries(PIECES)) {
    assert.ok(m.pieces[pid], `${pid} is in the manifest`);
    if (spec.toggle) for (const v of spec.toggle) assert.ok(m.pieces[pid].variants[v], `${pid}:${v}`);
    if (spec.press) assert.ok(m.pieces[pid].variants[spec.press], `${pid}:${spec.press}`);
    if (spec.controls) assert.ok(PIECES[spec.controls].toggle);
  }
  assert.equal(pieceState('fridge-door', {}, m.pieces), 'closed');
  assert.equal(pieceState('fridge-door', { 'fridge-door': 'bogus' }, m.pieces), 'closed');
  assert.equal(nextToggle('fridge-door', 'closed'), 'open');
  assert.equal(nextToggle('fridge-door', 'open'), 'closed');
  assert.equal(nextToggle('counter-bell', 'up'), null);
  assert.equal(pieceVariant('knob-1', { 'burner-1': 'on' }, m.pieces), 'on');
  assert.equal(pieceVariant('knob-2', { 'burner-1': 'on' }, m.pieces), 'off');
  assert.equal(pieceVariant('oven-door', {}, m.pieces, { ovenFull: true }), 'closedOn');
  assert.equal(pieceVariant('oven-door', { 'oven-door': 'open' }, m.pieces, { ovenFull: true }), 'open');
  assert.equal(pieceVariant('oven-door', {}, m.pieces, { ovenFull: false }), 'closed');
  assert.equal(pieceVariant('menu-board', {}, m.pieces), 'pictures');
});

test('seedCafe: fridge stock on the fridge shelves, hot spots, dishes and cookware; every kind is in the catalog', () => {
  const store = createStore({ device: 'tt', now: () => 0 });
  const def = normalizeRoom(cafeRoom(m));
  seedCafe(store, def, catalog);
  const all = inRoom(store.state, CAFE_ID);
  const n = FRIDGE_ROWS.reduce((k, [, items]) => k + items.length, 0) + HOTSPOTS.length + CAFE_ITEMS.length;
  assert.equal(all.length, n);
  for (const e of all) assert.ok(catalog.has(e.kind), `${e.kind} in the catalog`);
  // Every fridge item of the manifest has stock on a fridge shelf.
  const fridge = m.spawners.find((s) => s.id === 'fridge');
  for (const item of fridge.items) {
    const e = all.find((q) => q.kind === 'fridge-' + item);
    assert.ok(e, item);
    const s = def.surfaces.find((q) => q.id.startsWith('fridge-') && q.id !== 'fridge-top' && Math.abs(q.y - e.y) < 0.5);
    assert.ok(s && e.x >= s.x0 && e.x <= s.x1, `${item} on a fridge shelf`);
  }
  // Every pantry item has a source (painted hot spot or stock).
  const pantry = m.spawners.find((s) => s.id === 'pantry');
  const gives = new Set(all.map((e) => (catalog.get(e.kind).behaviors.find((b) => b.use === 'spawner') || {}).kinds).flat().filter(Boolean));
  for (const item of pantry.items) assert.ok(gives.has(item), `something gives ${item}`);
  for (const item of ['cafe-cup', 'plate', 'scoop']) assert.ok(gives.has(item), `something gives ${item}`);
  // The loose things rest where settle() puts them (a surface or the floor).
  for (const e of all.filter((q) => !catalog.hasTag(q.kind, 'stock'))) {
    const r = settle(def, { x: e.x, y: e.y, halfW: 1 });
    assert.equal(r.y, e.y, `${e.kind} resting`);
  }
});

test('the fixtures entity: lowest id wins', () => {
  const store = createStore({ device: 'tt', now: () => 0 });
  assert.equal(fixturesOf(store.state), null);
  const a = store.newId(), b = store.newId();
  store.dispatch('spawn', { id: b, kind: FIXTURES_KIND, room: 'cafe/fixtures', x: 0, y: 0 });
  store.dispatch('spawn', { id: a, kind: FIXTURES_KIND, room: 'cafe/fixtures', x: 0, y: 0 });
  assert.equal(fixturesOf(store.state).id, a < b ? a : b);
});

test('cafeFiles: the arrival view\'s tiles and pieces, not the whole strip', () => {
  const files = cafeFiles(manifest);
  assert.ok(files.some((f) => /tiles\/back-/.test(f)));
  assert.ok(files.includes(m.pieces['front-door'].variants.closed.file));
  assert.ok(!files.includes(m.pieces['fridge-door'].variants.closed.file), 'the fridge is two zones away');
  assert.ok(!files.some((f) => /\/back\.webp$/.test(f)));
});

test('tiles: at each camera stop only the tiles within the rest margin; much less than the whole strip', () => {
  const back = m.layers[0];
  assert.ok(back.tiles.length >= 4);
  const all = m.layers.flatMap((L) => L.tiles);
  const full = m.layers.reduce((n, L) => n + L.px[0] * L.px[1] * 4, 0);
  for (const z of m.zones) {
    const near = tilesNear(all, z.camera, z.camera + 1440, REST_MARGIN).map((i) => all[i]);
    // Every tile that overlaps the view is in.
    for (const t of all) if (t.x + t.w > z.camera && t.x < z.camera + 1440) assert.ok(near.includes(t));
    const bytes = decodedBytes(near);
    assert.ok(bytes < full * 0.7, `${z.id}: ${(bytes / 1e6).toFixed(1)} MB of ${(full / 1e6).toFixed(1)} MB`);
  }
  // Tiles of a layer cover it with no gaps.
  for (const L of m.layers) {
    let x = L.x;
    for (const t of L.tiles) { assert.ok(t.x <= x + 0.01, `${L.id} no gap at ${x}`); x = Math.max(x, t.x + t.w); }
    assert.ok(Math.abs(x - (L.x + L.w)) < 1.5, `${L.id} covered to its end`);
  }
});

// ---- food state model ----

test('foodLook: cut, crack and doneness pick the manifest prep variants; no cook art -> tint look', () => {
  const egg = manifest.props.egg.prep;
  assert.equal(foodLook({}, egg), null);
  assert.equal(foodLook({ cracked: 1 }, egg), 'cracked');
  assert.equal(foodLook({ cracked: 1, cooked: 1 }, egg), 'fried');
  assert.equal(foodLook({ cooked: 3 }, egg), 'toasty');
  const tomato = { ...manifest.props.tomato.prep, tint: true };
  assert.equal(foodLook({ cut: 1 }, tomato), 'sliced');
  assert.equal(foodLook({ cut: 2 }, tomato), 'chopped', 'the knife goes on past the art: whole -> sliced -> chopped (P2a.2)');
  assert.equal(foodLook({ cut: 9 }, tomato), 'chopped', 'the cut counter is an inc, clamped when read');
  assert.equal(foodLook({ cut: 1, cooked: 2 }, tomato), 'sliced@2');
  assert.equal(foodLook({ cooked: 1 }, tomato), '@1');
  const bread = manifest.props.bread.prep;
  assert.equal(foodLook({ cut: 2 }, bread), 'slice');
  assert.equal(foodLook({ cut: 2, cooked: 3 }, bread), 'toasty');
});

test('catalog: every cafe ingredient carries its prep and doneness mapped to real variants', () => {
  for (const kind of manifest.cafe.ingredients) {
    const k = catalog.get(kind);
    assert.ok(k, kind);
    assert.equal(k.art.sprite, kind);
    const food = k.behaviors.find((b) => b.use === 'food');
    const prep = manifest.props[kind].prep || {};
    if (kind === 'scoop' || kind === 'cafe-cup') continue;
    assert.ok(food, `${kind} has the food behavior`);
    for (const key of ['cut', 'crack', 'cook']) {
      assert.deepEqual(food[key] || null, prep[key] || null, `${kind}.${key}`);
      for (const v of food[key] || []) assert.ok(manifest.props[kind].variants[v], `${kind}:${v}`);
    }
  }
  for (const kind of manifest.cafe.dishes) assert.ok(catalog.has(kind), kind);
  for (const id of Object.values(manifest.cafe.cookware)) assert.ok(catalog.has(id), id);
});

test('catalog sprite: a doneness tint look is the variant with the manifest filter', () => {
  const s = catalog.sprite('tomato', 'sliced@2');
  assert.equal(s.src, manifest.props.tomato.variants.sliced.file);
  assert.equal(s.filter, manifest.cafe.doneness.tint[2]);
  assert.notEqual(s.key, catalog.sprite('tomato', 'sliced').key);
  assert.equal(catalog.sprite('tomato', 'sliced').filter, undefined);
  assert.equal(catalog.sprite('tomato', '@1').src, manifest.props.tomato.variants.whole.file);
});

function world() {
  const store = createStore({ device: 'tt', now: () => 0 });
  const def = normalizeRoom(cafeRoom(m));
  const sounds = [];
  const view = { room: { id: def.id, def }, viewOf: () => null, play: (n) => sounds.push(n), animateFrom: () => {} };
  const b = createBehaviors({ catalog, store, random: createRng(3) });
  b.bind(view, null);
  const ctx = { view, fx: null, info: {} };
  const spawn = (kind, props, where = { room: def.id, x: 2300, y: 805 }) => { const id = store.newId(); store.dispatch('spawn', { id, kind, ...where, props }); return id; };
  return { store, b, ctx, spawn, sounds, e: (id) => getEntity(store.state, id), def };
}

test('food verbs: cut, crack and cook step the state (ready for P2a.2/P2a.3)', () => {
  const w = world();
  const tomato = w.spawn('tomato');
  assert.equal(w.b.act(tomato, 'cut'), true);
  assert.equal(w.b.lookOf(w.e(tomato)), 'sliced');
  assert.equal(w.b.act(tomato, 'cut'), true);
  assert.equal(w.b.lookOf(w.e(tomato)), 'chopped');
  assert.equal(w.b.act(tomato, 'cut'), false, 'no more cuts');
  assert.equal(w.e(tomato).props.cut, 2);
  assert.equal(w.b.act(tomato, 'cook'), true);
  const heap = w.b.spriteOf(w.e(tomato));
  assert.equal(heap.src, manifest.props.tomato.variants.sliced.file, 'chopped is drawn as a heap of little slices');
  assert.ok(heap.filter.includes(manifest.cafe.doneness.tint[1]), 'with the doneness tint');
  assert.equal(heap.overlays.length, 4);
  const egg = w.spawn('egg');
  assert.equal(w.b.act(egg, 'crack'), true);
  for (let i = 0; i < 3; i++) assert.equal(w.b.act(egg, 'cook'), true);
  assert.equal(w.b.act(egg, 'cook'), false, 'toasty is the most');
  assert.equal(w.e(egg).props.method, 'fried');
  assert.equal(w.b.spriteOf(w.e(egg)).src, manifest.props.egg.variants.toasty.file);
});

test('dishes: bites, and the last one leaves the plate (bowl, glass...) where the dish was, or in the same hand', () => {
  const w = world();
  const burger = w.spawn('burger');
  const at = { ...w.e(burger) };
  for (let i = 0; i < 2; i++) w.b.onTap(w.e(burger), w.ctx);
  assert.equal(w.b.lookOf(w.e(burger)), 'bite2');
  w.b.onTap(w.e(burger), w.ctx);
  assert.equal(w.e(burger), undefined, 'eaten up');
  const left = inRoom(w.store.state, w.def.id).find((e) => e.kind === 'plate');
  assert.ok(left, 'a plate is left');
  assert.deepEqual([left.x, left.y], [at.x, at.y]);
  // In a character's hand: the bowl stays in the hand.
  const hand = w.spawn('basket');
  const salad = w.spawn('salad', null, { parent: hand, slot: 'hand-r' });
  for (let i = 0; i < 3; i++) w.b.act(salad, 'bite');
  const kids = childrenOf(w.store.state, hand);
  assert.deepEqual(kids.map((k) => [k.kind, k.slot]), [['bowl', 'hand-r']]);
  // A smoothie is drunk to an empty glass that stays.
  const sm = w.spawn('smoothie', { color: 'green' });
  assert.equal(w.b.lookOf(w.e(sm)), 'green');
  w.b.act(sm, 'bite');
  assert.equal(w.b.lookOf(w.e(sm)), 'empty');
  assert.equal(w.b.act(sm, 'bite'), false);
});

// ---- the Mystery Dish ----

test('mystery: colour nearest the ingredients, look by colour and bites, composite sprite from the parts', () => {
  assert.equal(mysteryColorFor(['#DC6B6E', '#F6D3CF']), 'pink');
  assert.equal(mysteryColorFor([[163, 201, 143]]), 'green');
  assert.equal(mysteryColorFor([MYSTERY_HEX.blue]), 'blue');
  assert.equal(mysteryColorFor([]), 'pink');
  const p = mysteryProps(createRng(7), ['#8A5B45']);
  assert.equal(p.color, 'brown');
  for (const k of ['eyes', 'mouth', 'topper']) assert.ok(manifest.props['mystery-' + k].variants[p[k]], k);
  assert.equal(mysteryLook({ color: 'blue' }), 'blue');
  assert.equal(mysteryLook({ color: 'blue', bites: 2 }), 'blue-bite2');
  assert.equal(mysteryLook({ color: 'nope', bites: 9 }), 'pink-bite2');
  const e = { id: 'x', kind: 'mystery-dish', props: { color: 'green', eyes: 'stars', mouth: 'teeth', topper: 'candle', bites: 1 } };
  const s = mysterySprite(catalog, e);
  assert.equal(s.src, manifest.props['mystery-dish'].variants['green-bite1'].file);
  assert.deepEqual(s.overlays.map((o) => o.src), [
    manifest.props['mystery-eyes'].variants.stars.file, manifest.props['mystery-mouth'].variants.teeth.file, manifest.props['mystery-topper'].variants.candle.file,
  ]);
  // Each part's origin lands at the base anchor (box bottom centre) + cafe.mystery.at.
  const eyes = manifest.props['mystery-eyes'].variants.stars;
  const o = s.overlays[0];
  assert.ok(Math.abs(o.left + eyes.anchor[0] - (s.w / 2 + manifest.cafe.mystery.at.eyes[0])) < 0.2);
  assert.ok(Math.abs(o.top + eyes.anchor[1] - (s.h + manifest.cafe.mystery.at.eyes[1])) < 0.2);
  assert.notEqual(s.key, mysterySprite(catalog, { ...e, props: { ...e.props, eyes: 'dots' } }).key);
  // Through the behaviors (the view's spriteOf), bites and all.
  const w = world();
  const md = w.spawn('mystery-dish', { color: 'orange', eyes: 'happy', mouth: 'o', topper: 'bow' });
  assert.equal(w.b.spriteOf(w.e(md)).overlays.length, 3);
  for (let i = 0; i < 3; i++) w.b.onTap(w.e(md), w.ctx);
  assert.ok(inRoom(w.store.state, w.def.id).some((q) => q.kind === 'plate'), 'eaten up: the plate stays');
});
