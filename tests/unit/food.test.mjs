// P2a.2 the food state model and prep (src/core/food.js, the cafe
// behaviors' prep verbs, src/scenes/cafe-prep.js's pure parts): prep chains
// (whole -> sliced -> chopped, peeled, cracked), clamped inc counters (two
// iPads chopping at once), the mixing bowl's stir stages and batter, the
// blender's smoothie colour and pour (one combine), the toaster's pop, the
// sink, dirty dishes, the coffee drinks and the station spots.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { createCatalog } from '../../src/core/catalog.js';
import { createBehaviors } from '../../src/core/behaviors/index.js';
import { createStore } from '../../src/engine/store.js';
import { createHost, joinAsGuest } from '../../src/engine/authority.js';
import { getEntity, inRoom, childrenOf } from '../../src/engine/world.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';
import { createRng } from '../../src/engine/random.js';
import { cafeRoom } from '../../src/scenes/cafe.js';
import { stationSpots, ensureStations, stationOf, onBoard, angleDelta, STATION_KINDS } from '../../src/scenes/cafe-prep.js';
import {
  prepChain, prepOf, cutIndex, canCut, isChopped, foodLook, donenessOf, mixState, batterOf, smoothieOf,
  averageColor, blendHex, nearestColor, contentsOf, drinkFor, cupFill, isMixed, MIX_DONE, STIR_PER_STAGE,
  SMOOTHIE_HEX, BATTER_HEX,
} from '../../src/core/food.js';
import { useRecipes } from '../../src/core/recipes.js';

const json = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const m = manifest.rooms.cafe;
const catalog = createCatalog(json, manifest);
useRecipes(JSON.parse(readFileSync(path.join(ROOT, 'data/recipes.json'), 'utf8')));
const foodP = (kind) => catalog.get(kind).behaviors.find((b) => b.use === 'food');

// ---- pure model ----

test('prep chain: the art\'s cut looks, then chopped (drawn up when the art has none)', () => {
  assert.deepEqual(prepChain(foodP('tomato')), ['whole', 'sliced', 'chopped']);
  assert.deepEqual(prepChain(foodP('carrot')), ['whole', 'chopped'], 'already ends chopped');
  assert.deepEqual(prepChain(foodP('bread')), ['loaf', 'sliced', 'slice', 'chopped']);
  assert.deepEqual(prepChain(foodP('chocolate')), ['bar', 'chunks'], 'chunks is chopped');
  assert.equal(prepChain(foodP('milk')), null, 'milk is not cut');
  assert.equal(prepChain({ cut: ['a', 'b'], chop: false }).length, 2);
});

test('prepOf: whole, sliced, chopped, peeled, cracked; the cut counter is clamped when read', () => {
  const t = foodP('tomato');
  assert.equal(prepOf({}, t), 'whole');
  assert.equal(prepOf({ cut: 1 }, t), 'sliced');
  assert.equal(prepOf({ cut: 2 }, t), 'chopped');
  assert.equal(prepOf({ cut: 7 }, t), 'chopped');
  assert.equal(cutIndex({ cut: 7 }, t), 2);
  assert.ok(canCut({ cut: 1 }, t) && !canCut({ cut: 2 }, t));
  assert.ok(isChopped({ cut: 3 }, t));
  const banana = foodP('banana');
  assert.equal(prepOf({}, banana), 'whole');
  assert.ok(canCut({}, banana), 'a knife peels it first');
  assert.equal(prepOf({ peeled: 1 }, banana), 'peeled');
  assert.equal(prepOf({ peel: 1 }, banana), 'peeled', 'old saves: the cycle index');
  assert.equal(prepOf({ peeled: 1, cut: 1 }, banana), 'sliced');
  assert.equal(prepOf({ cracked: 1 }, foodP('egg')), 'cracked');
  assert.equal(prepOf({}, foodP('milk')), 'whole');
});

test('foodLook: peel, chop, crack in a bowl, doneness', () => {
  const b = foodP('banana');
  assert.equal(foodLook({}, b), 'whole');
  assert.equal(foodLook({ peeled: 1 }, b), 'peeled');
  assert.equal(foodLook({ peeled: 1, cut: 1 }, b), 'sliced');
  assert.equal(foodLook({ peeled: 1, cut: 2 }, b), 'chopped');
  const egg = foodP('egg');
  assert.equal(foodLook({ cracked: 1 }, egg), 'cracked');
  assert.equal(foodLook({ cracked: 1 }, egg, { inside: true }), 'fried', 'a raw yolk in the bowl');
  assert.equal(foodLook({ cracked: 1, cooked: 1 }, egg, { inside: true }), 'fried');
  assert.equal(foodLook({ cooked: 9 }, egg), 'toasty', 'doneness is clamped to 3');
  assert.equal(donenessOf({ cooked: 9 }), 3);
  assert.equal(foodLook({ peeled: 1 }, foodP('potato')), 'peeled');
});

test('colours: blend, average (milk and flour dilute), nearest', () => {
  assert.equal(blendHex('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(blendHex('#102030', '#FFFFFF', 0), '#102030');
  assert.equal(nearestColor('#8A5B45', SMOOTHIE_HEX), 'choc');
  assert.equal(nearestColor('#DC7A78', { red: '#DC6B6E', blue: '#7F8FC4' }), 'red');
  const pale = averageColor([{ kind: 'tomato', props: {} }, { kind: 'milk', props: {} }]);
  assert.equal(nearestColor(pale, { red: '#DC6B6E', white: '#FFFFFF' }), 'red', 'milk only pales the tomato');
});

test('batter: plain, choc, pink, and a silly colour for anything else', () => {
  const it = (...kinds) => kinds.map((kind) => ({ kind, props: kind === 'egg' ? { cracked: 1 } : {} }));
  assert.equal(batterOf(it('flour', 'egg', 'milk')), 'plain');
  assert.equal(batterOf(it('flour', 'sugar', 'butter', 'egg')), 'plain');
  assert.equal(batterOf(it('flour', 'egg', 'chocolate')), 'choc');
  assert.equal(batterOf(it('flour', 'milk', 'strawberry')), 'pink');
  assert.equal(batterOf([{ kind: 'scoop', props: { flavor: 'chocolate' } }]), 'choc');
  assert.equal(batterOf(it('lettuce', 'lettuce')), 'green');
  assert.equal(batterOf([]), null);
  for (const c of Object.values(BATTER_HEX)) assert.match(c, /^#[0-9A-F]{6}$/);
});

test('mixState: stages from the least-stirred thing; done when everything is mixed in', () => {
  const k = (...s) => s.map((stir) => ({ props: { stir } }));
  assert.deepEqual(mixState([]), { n: 0, mixed: 0, stage: 0, t: 0, done: false });
  assert.equal(mixState(k(0, 0)).stage, 0);
  assert.equal(mixState(k(STIR_PER_STAGE, STIR_PER_STAGE)).stage, 1);
  assert.equal(mixState(k(MIX_DONE, 1)).stage, 0, 'a new thing just dropped in');
  const d = mixState(k(MIX_DONE, MIX_DONE + 4));
  assert.ok(d.done && d.t === 1 && d.stage === 3, 'stir is clamped when read');
  assert.ok(isMixed({ stir: MIX_DONE }) && !isMixed({ stir: MIX_DONE - 1 }));
});

test('smoothie colours: strawberry-banana is pink, chocolate wins, greens are green', () => {
  const it = (...kinds) => kinds.map((kind) => ({ kind, props: {} }));
  assert.equal(smoothieOf(it('strawberry', 'banana', 'milk')), 'pink');
  assert.equal(smoothieOf(it('banana', 'milk')), 'yellow');
  assert.equal(smoothieOf(it('lettuce', 'apple', 'lettuce')), 'green');
  assert.equal(smoothieOf(it('banana', 'chocolate')), 'choc');
  assert.equal(smoothieOf(it('blueberries', 'milk')), 'purple');
  assert.ok(SMOOTHIE_HEX[smoothieOf(it('fish', 'milk'))], 'anything else: the nearest colour, never nothing');
  assert.equal(smoothieOf([{ kind: 'scoop', props: { flavor: 'vanilla' } }, { kind: 'milk', props: {} }]), 'cream');
  assert.equal(smoothieOf([]), 'cream');
  for (const c of Object.keys(SMOOTHIE_HEX)) assert.ok(m.pieces.blender.variants[c] && manifest.props.smoothie.variants[c], c);
});

test('contents: the child entities, sorted by id, with their prep state', () => {
  const kids = [
    { id: 'b:2', kind: 'milk', props: { stir: 6 } },
    { id: 'a:9', kind: 'egg', props: { cracked: 1 } },
  ];
  assert.deepEqual(contentsOf(kids, (k) => (foodP(k) || {})), [
    { id: 'a:9', kind: 'egg', prep: 'cracked', cooked: 0, mixed: false },
    { id: 'b:2', kind: 'milk', prep: 'whole', cooked: 0, mixed: true },
  ]);
});

test('coffee: coffee, cocoa, latte in turn; cups and mugs fill', () => {
  assert.deepEqual([0, 1, 2, 3, -1].map(drinkFor), ['coffee', 'cocoa', 'latte', 'coffee', 'latte']);
  assert.deepEqual(cupFill('cafe-cup', 'cocoa'), { key: 'fill', value: 'cocoa' });
  assert.deepEqual(cupFill('mug', 'latte'), { key: 'fill', value: 1 });
  assert.equal(cupFill('plate', 'coffee'), null);
  for (const d of ['coffee', 'cocoa', 'latte']) assert.ok(manifest.props['cafe-cup'].variants[d], d);
});

test('station spots, the board, angles', () => {
  const s = stationSpots(m);
  assert.deepEqual(Object.keys(s).sort(), [...STATION_KINDS].sort());
  assert.equal(s['station-toaster'].y, m.surfaces.find((q) => q.id === 'counter-right').y);
  assert.equal(s['station-sink'].y, m.surfaces.find((q) => q.id === 'counter-sink').y);
  const board = m.surfaces.find((q) => q.id === 'cutting-board');
  assert.ok(onBoard(board, { x: 820, y: board.y }));
  assert.ok(!onBoard(board, { x: 820, y: 630 }));
  assert.ok(!onBoard(board, { x: 820, y: board.y, parent: 'x:1' }));
  assert.ok(Math.abs(angleDelta(3, -3) - (2 * Math.PI - 6)) < 1e-9, 'across the wrap');
  assert.ok(Math.abs(angleDelta(0.5, 0.2) + 0.3) < 1e-9);
});

// ---- behaviors (store ops) ----

function world(device = 'tt') {
  const store = createStore({ device, now: () => 0 });
  const def = normalizeRoom(cafeRoom(m));
  const sounds = [];
  const view = { room: { id: def.id, def }, viewOf: () => null, play: (n) => sounds.push(n), animateFrom: () => {} };
  const b = createBehaviors({ catalog, store, random: createRng(3) });
  b.bind(view, null);
  const ctx = { view, fx: null, info: {} };
  const spawn = (kind, props, where = { room: def.id, x: 700, y: 630 }) => { const id = store.newId(); store.dispatch('spawn', { id, kind, ...where, props }); return id; };
  return { store, b, ctx, spawn, sounds, e: (id) => getEntity(store.state, id), def, kids: (id) => childrenOf(store.state, id) };
}

test('knife: each cut is an inc; peel first, then slice, then chop, then a thunk; an egg cracks', () => {
  const w = world();
  const banana = w.spawn('banana');
  assert.equal(w.b.act(banana, 'cut'), true);
  assert.equal(w.e(banana).props.peeled, 1, 'the first stroke peels it');
  assert.equal(w.b.act(banana, 'cut'), true);
  assert.equal(w.b.act(banana, 'cut'), true);
  assert.equal(w.b.lookOf(w.e(banana)), 'chopped');
  assert.equal(w.b.act(banana, 'cut'), false, 'all chopped');
  assert.equal(w.sounds.filter((s) => s === 'chop').length, 3);
  assert.ok(w.sounds.includes('sparkle'), 'a sparkle when it is all chopped');
  // Peeled without art: the whole look, paled.
  const potato = w.spawn('potato');
  assert.equal(w.b.onTap(w.e(potato), w.ctx), true);
  assert.equal(w.b.log().at(-1).via[0], 'food');
  const s = w.b.spriteOf(w.e(potato));
  assert.equal(s.src, manifest.props.potato.variants.whole.file);
  assert.ok(s.filter && s.key.endsWith(':peeled'));
  // Carrots have chopped art.
  const carrot = w.spawn('carrot');
  w.b.act(carrot, 'cut');
  assert.equal(w.b.spriteOf(w.e(carrot)).src, manifest.props.carrot.variants.chopped.file);
});

test('two iPads chopping the same tomato at once: both strokes count (inc on the host)', () => {
  const toHost = [], toGuest = [];
  const hostStore = createStore({ device: 'zoe', now: () => 0 });
  const host = createHost(hostStore, { broadcast: (env) => toGuest.push(env) });
  const tomato = hostStore.newId();
  hostStore.dispatch('spawn', { id: tomato, kind: 'tomato', room: 'cafe/kitchen', x: 820, y: 492.8 });
  toGuest.length = 0;
  const guestStore = createStore({ device: 'ian', now: () => 0 });
  guestStore.load(JSON.parse(JSON.stringify(hostStore.state)), hostStore.clockState());
  joinAsGuest(guestStore, (env) => toHost.push(JSON.parse(JSON.stringify(env))));
  const def = normalizeRoom(cafeRoom(m));
  const mk = (store) => {
    const b = createBehaviors({ catalog, store, random: createRng(1) });
    b.bind({ room: { id: def.id, def }, viewOf: () => null, play: () => {}, animateFrom: () => {} }, null);
    return b;
  };
  const hb = mk(hostStore), gb = mk(guestStore);
  // Both see an uncut tomato and cut it at the same moment.
  hb.act(tomato, 'cut');
  gb.act(tomato, 'cut');
  while (toHost.length || toGuest.length) {
    while (toHost.length) host.submit(toHost.shift());
    while (toGuest.length) guestStore.receive(JSON.parse(JSON.stringify(toGuest.shift())));
  }
  assert.equal(hostStore.state.entities[tomato].props.cut, 2);
  assert.equal(guestStore.state.entities[tomato].props.cut, 2);
  assert.equal(hb.lookOf(hostStore.state.entities[tomato]), 'chopped');
});

test('mixing bowl: an egg dropped in cracks; stirring mixes in stages to batter; mixed things are not drawn', () => {
  const w = world();
  const bowl = w.spawn('mixing-bowl');
  const egg = w.spawn('egg');
  assert.equal(w.b.onDropInto(w.e(egg), w.e(bowl), w.ctx), true);
  assert.deepEqual(w.b.log().at(-1).via, ['mix:accept']);
  assert.equal(w.e(egg).parent, bowl);
  assert.equal(w.e(egg).props.cracked, 1);
  assert.ok(w.sounds.includes('crack'));
  for (const kind of ['flour', 'milk']) w.b.onDropInto(w.e(w.spawn(kind)), w.e(bowl), w.ctx);
  assert.equal(w.kids(bowl).length, 3);
  assert.equal(w.b.spriteOf(w.e(bowl)).look, 'empty', 'a heap, no batter yet');
  let lay = w.b.layoutOf(w.e(bowl), w.kids(bowl));
  const y0 = lay.get(egg).y;
  // One stir step: everything gets stir +1 (an inc each); the batter shows and blends.
  assert.equal(w.b.act(bowl, 'stir'), true);
  assert.deepEqual(w.kids(bowl).map((k) => k.props.stir), [1, 1, 1]);
  const s1 = w.b.spriteOf(w.e(bowl));
  assert.equal(s1.look, 'mixing');
  assert.equal(s1.overlays.length, 1);
  assert.match(s1.overlays[0].src, /^data:image\/svg\+xml,/);
  lay = w.b.layoutOf(w.e(bowl), w.kids(bowl));
  assert.ok(lay.get(egg).y > y0, 'what is stirred sinks into the batter');
  // A tap is a stir step too (Ian).
  w.b.onTap(w.e(bowl), w.ctx);
  for (let i = 2; i < MIX_DONE - 1; i++) w.b.act(bowl, 'stir');
  assert.equal(w.e(bowl).props.batter, undefined);
  w.b.act(bowl, 'stir');
  assert.equal(w.b.log().at(-1).reason, 'done');
  assert.equal(w.e(bowl).props.batter, 'plain');
  assert.ok(w.sounds.includes('chime'));
  assert.equal(w.b.lookOf(w.e(bowl)), 'batter');
  assert.equal(w.b.spriteOf(w.e(bowl)).look, 'batter');
  lay = w.b.layoutOf(w.e(bowl), w.kids(bowl));
  assert.ok([...lay.values()].every((L) => L.hidden), 'mixed things are batter now');
  // More stirring still reacts (never a dead gesture), with no more ops on the contents.
  const rev = w.kids(bowl).map((k) => k.rev);
  assert.equal(w.b.act(bowl, 'stir'), true);
  assert.deepEqual(w.kids(bowl).map((k) => k.rev), rev);
  // Chocolate in: a new thing on top of the batter; stir again -> choc batter.
  const choc = w.spawn('chocolate');
  w.b.onDropInto(w.e(choc), w.e(bowl), w.ctx);
  for (let i = 0; i < MIX_DONE; i++) w.b.act(bowl, 'stir');
  assert.equal(w.e(bowl).props.batter, 'choc');
  assert.equal(w.b.lookOf(w.e(bowl)), 'choc-batter');
  // An empty bowl: nothing to stir, the fallback reacts.
  const bowl2 = w.spawn('mixing-bowl');
  const r = w.b.onTap(w.e(bowl2), w.ctx) && w.b.log().at(-1);
  assert.deepEqual(r.via, []);
  assert.deepEqual(r.fallback, ['squish', 'sound', 'sparkle']);
});

test('blender: fruit in, blend (hidden, the jug colour), a glass on it pours ONE combine into a smoothie', () => {
  const w = world();
  const bl = w.spawn('station-blender', null, { room: w.def.id, x: 1265, y: 504 });
  for (const kind of ['strawberry', 'banana', 'milk']) {
    assert.equal(w.b.onDropInto(w.e(w.spawn(kind)), w.e(bl), w.ctx), true);
  }
  assert.equal(w.kids(bl).length, 3);
  assert.ok([...w.b.layoutOf(w.e(bl), w.kids(bl)).values()].every((L) => !L.hidden), 'drawn in the jug');
  assert.equal(w.b.onTap(w.e(bl), w.ctx), true);
  assert.equal(w.b.log().at(-1).reason, 'blend');
  assert.ok(w.sounds.includes('whirr'));
  assert.ok(w.kids(bl).every((k) => isMixed(k.props)));
  assert.ok([...w.b.layoutOf(w.e(bl), w.kids(bl)).values()].every((L) => L.hidden), 'blended: the jug shows the colour');
  // A plate is not a glass: the blender takes food only (the container refuses).
  const glass = w.spawn('glass', null, { room: w.def.id, x: 1884, y: 203 });
  assert.equal(w.b.onDropInto(w.e(glass), w.e(bl), w.ctx), true);
  const log = w.b.log().at(-1);
  assert.deepEqual(log.via, ['blender:accept']);
  assert.equal(log.reason, 'pour');
  assert.equal(w.e(glass), undefined, 'the glass became the smoothie');
  assert.equal(w.kids(bl).length, 0);
  const sm = inRoom(w.store.state, w.def.id).find((e) => e.kind === 'smoothie');
  // P2a.4: the recipe table names it (Zoe's text layer shows props.name).
  assert.deepEqual(sm.props, { color: 'pink', contents: ['banana', 'milk', 'strawberry'], recipe: 'strawberry-banana', name: 'Strawberry Banana Smoothie' });
  assert.equal(w.b.lookOf(sm), 'pink');
  // An empty blender: the glass bounces back.
  const g2 = w.spawn('glass');
  w.b.onDropInto(w.e(g2), w.e(bl), w.ctx);
  assert.equal(w.b.log().at(-1).reason, 'empty');
  assert.ok(w.e(g2));
  // Pour without tapping first: blended on the way.
  w.b.onDropInto(w.e(w.spawn('banana')), w.e(bl), w.ctx);
  w.b.onDropInto(w.e(g2), w.e(bl), w.ctx);
  assert.equal(inRoom(w.store.state, w.def.id).filter((e) => e.kind === 'smoothie').at(-1).props.color, 'yellow');
});

test('toaster: bread in, pop: out onto the counter one doneness toastier', () => {
  const w = world();
  const t = w.spawn('station-toaster', null, { room: w.def.id, x: 1196, y: 504 });
  const bread = w.spawn('bread');
  assert.equal(w.b.onDropInto(w.e(bread), w.e(t), w.ctx), true);
  assert.equal(w.e(bread).parent, t);
  assert.equal(w.b.act(t, 'pop'), true);
  const b = w.e(bread);
  assert.equal(b.parent, null);
  assert.equal(b.room, w.def.id);
  assert.deepEqual([b.props.cooked, b.props.method], [1, 'toasted']);
  assert.equal(w.b.lookOf(b), 'toast');
  assert.ok(w.sounds.includes('pop') && w.sounds.includes('ding'));
  assert.equal(w.b.act(t, 'pop'), false, 'empty');
  // Toasted again and again: extra toasty, never burnt.
  for (let i = 0; i < 4; i++) { w.b.onDropInto(w.e(bread), w.e(t), w.ctx); w.b.act(t, 'pop'); }
  assert.equal(w.b.lookOf(w.e(bread)), 'toasty');
});

test('eating leaves a dirty plate; the sink washes it clean with a splash', () => {
  const w = world();
  const burger = w.spawn('burger');
  for (let i = 0; i < 3; i++) w.b.onTap(w.e(burger), w.ctx);
  const plate = inRoom(w.store.state, w.def.id).find((e) => e.kind === 'plate');
  assert.equal(plate.props.dirty, 1);
  const dirty = w.b.spriteOf(plate);
  assert.ok(dirty.key.endsWith(':dirty') && dirty.overlays.length === 1);
  const sink = w.spawn('station-sink', null, { room: w.def.id, x: 693, y: 504 });
  assert.equal(w.b.onDropInto(w.e(plate.id), w.e(sink), w.ctx), true);
  assert.equal(w.b.log().at(-1).reason, 'clean');
  assert.equal(w.e(plate.id).props.dirty, 0);
  assert.equal(w.e(plate.id).parent, sink);
  assert.ok(!w.b.spriteOf(w.e(plate.id)).key.endsWith(':dirty'));
  assert.ok(w.sounds.includes('splash'));
  // Anything can be rinsed (a tomato); the tap washes the whole basin.
  assert.equal(w.b.onDropInto(w.e(w.spawn('tomato')), w.e(sink), w.ctx), true);
  assert.equal(w.b.log().at(-1).reason, 'rinse');
  assert.equal(w.b.act(sink, 'wash'), true);
});

test('stations: spawned once per cafe (idempotent), lowest id wins', () => {
  const store = createStore({ device: 'tt', now: () => 0 });
  const a = ensureStations(store, m, 'cafe/kitchen');
  assert.equal(a.length, 3);
  assert.deepEqual(ensureStations(store, m, 'cafe/kitchen'), []);
  for (const k of STATION_KINDS) assert.ok(stationOf(store.state, 'cafe/kitchen', k), k);
  for (const k of STATION_KINDS) {
    const c = catalog.get(k);
    assert.ok(c.fixed && c.tags.includes('hotspot') && c.tags.includes('station'), k);
  }
});
