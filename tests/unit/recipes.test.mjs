// P2a.4 recipes (src/core/recipes.js, data/recipes.json) and the Mystery
// Dish generator: every recipe in the table resolves to itself, matching is
// order-independent and honours prep/doneness, anything else is a Mystery
// Dish whose face and silly name come from a hash of the contents (the same
// things always make the same dish), discovery is a `set` on the fixtures,
// the plate's assemble behavior is one combine, and two iPads assembling
// converge on the host (one dish, even when both tap at once).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { createCatalog, validateCatalog } from '../../src/core/catalog.js';
import { createBehaviors } from '../../src/core/behaviors/index.js';
import { BEHAVIORS } from '../../src/core/behaviors/registry.js';
import { createStore } from '../../src/engine/store.js';
import { createHost, joinAsGuest } from '../../src/engine/authority.js';
import { getEntity, inRoom, childrenOf } from '../../src/engine/world.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';
import { createRng } from '../../src/engine/random.js';
import { cafeRoom } from '../../src/scenes/cafe.js';
import { needProps } from '../../src/scenes/cafe-recipes.js';
import { MYSTERY_VARIANTS, MYSTERY_HEX } from '../../src/core/mystery.js';
import {
  useRecipes, recipeTable, validateRecipes, resolveDish, findRecipe, itemsOf, exampleItems, mysteryName,
  mysteryFace, contentsKey, discoverArgs, discovered, normalizeNeed, matches, hash32, DISH_TINTS,
  NAME_ADJ, NAME_NOUN, STATIONS, MIN_MYSTERY,
} from '../../src/core/recipes.js';

const json = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const recipesJson = JSON.parse(readFileSync(path.join(ROOT, 'data/recipes.json'), 'utf8'));
const catalog = createCatalog(json, manifest);
const m = manifest.rooms.cafe;
useRecipes(recipesJson);
const R = () => recipeTable().recipes;
const it = (...kinds) => kinds.map((kind) => ({ kind, prep: 'whole', cooked: 0 }));
const toast = { kind: 'bread', prep: 'whole', cooked: 1 };

function permutations(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => { for (const p of permutations(a.slice(0, i).concat(a.slice(i + 1)))) out.push([x, ...p]); });
  return out;
}

// ---- the table ----

test('the table: about 40+ recipes, valid against the catalog and the art', () => {
  assert.deepEqual(validateRecipes(recipesJson, { kinds: catalog.kinds(), toppers: Object.keys(manifest.props['mystery-topper'].variants) }), []);
  assert.ok(R().length >= 40, 'recipes: ' + R().length);
  assert.equal(R().length, recipesJson.recipes.length, 'none skipped');
  for (const r of R()) {
    assert.ok(catalog.hasArt(r.dish), `${r.id}: ${r.dish} has art`);
    if (r.look.tint) assert.ok(DISH_TINTS[r.look.tint], r.id);
    assert.ok(r.name && typeof r.name === 'string');
  }
  for (const at of STATIONS) assert.ok(R().some((r) => r.at === at), 'a recipe at ' + at);
  // The 16 dishes with art are all made by some recipe (and more combos reuse them).
  for (const d of ['pancakes', 'burger', 'pizza', 'salad', 'spaghetti', 'sandwich', 'sushi', 'soup', 'fruit-bowl', 'sundae', 'cookies', 'grilled-cheese', 'egg-toast', 'smoothie', 'cupcake', 'cake-slice']) {
    assert.ok(R().some((r) => r.dish === d), 'a recipe makes ' + d);
  }
  assert.deepEqual(validateRecipes({ recipes: [{ id: 'x', at: 'moon', dish: 'rock', needs: [] }] }, { kinds: catalog.kinds() }).length > 0, true);
  // The catalog (with the new dressed / assemble behaviors and the recipe book) is valid.
  assert.deepEqual(validateCatalog(json, { behaviors: BEHAVIORS, manifest }), []);
});

test('every recipe resolves to itself from its own ingredients', () => {
  for (const r of R()) {
    const d = resolveDish(r.at, itemsOf(exampleItems(r).map((x) => ({ kind: x.kind, props: { cooked: x.cooked, ...(x.prep === 'chopped' ? { cut: 9 } : {}) } })), (k) => {
      const kk = catalog.get(k);
      const f = kk && kk.behaviors.find((b) => b.use === 'food');
      return f || null;
    }));
    assert.ok(d, r.id);
    assert.equal(d.recipe, r.id, `${r.id} resolved to ${d.recipe}`);
    assert.equal(d.kind, r.dish);
    assert.equal(d.props.name, r.name);
    assert.equal(d.mystery, false);
    // With its extras too (still that recipe or a more specific one, never a mystery).
    const withExtras = exampleItems(r).concat(r.extras.slice(0, 2).map((kind) => ({ kind, prep: 'whole', cooked: 0 })));
    const e = resolveDish(r.at, withExtras);
    assert.equal(e.mystery, false, `${r.id} + extras`);
  }
});

test('matching is order-independent (every permutation, recipes and mysteries alike)', () => {
  const combos = [
    ['plate', [{ kind: 'bread', prep: 'whole', cooked: 0 }, ...it('cheese', 'tomato', 'lettuce')]],
    ['plate', [toast, ...it('cheese')]],
    ['plate', it('fish', 'chocolate', 'banana', 'onion')],
    ['oven', it('flour', 'egg', 'milk', 'sugar')],
    ['blender', it('strawberry', 'banana', 'milk')],
    ['pot', it('pasta', 'sausage', 'tomato')],
  ];
  for (const [at, items] of combos) {
    const first = resolveDish(at, items);
    for (const p of permutations(items)) assert.deepEqual(resolveDish(at, p), first, `${at}: ${items.map((x) => x.kind)}`);
  }
});

test('prep and doneness matter: toast makes grilled cheese, raw sausage is a mystery, salad wants chopped lettuce', () => {
  assert.equal(resolveDish('plate', [{ kind: 'bread', prep: 'whole', cooked: 0 }, ...it('cheese')]).recipe, 'sandwich');
  assert.equal(resolveDish('plate', [toast, ...it('cheese')]).recipe, 'grilled-cheese');
  assert.equal(resolveDish('plate', [toast, { kind: 'egg', prep: 'cracked', cooked: 2 }]).recipe, 'egg-toast');
  assert.equal(resolveDish('plate', [...it('bread'), { kind: 'sausage', prep: 'whole', cooked: 1 }, ...it('cheese')]).recipe, 'burger');
  assert.equal(resolveDish('plate', it('bread', 'sausage')).mystery, true, 'raw sausage in bread: a mystery');
  assert.equal(resolveDish('plate', [{ kind: 'lettuce', prep: 'chopped', cooked: 0 }, ...it('tomato', 'carrot')]).recipe, 'salad');
  assert.equal(resolveDish('plate', it('lettuce', 'tomato')).mystery, true, 'a whole lettuce head is not a salad');
  // Counts: three pancakes are a tower; one or two are pancakes.
  const cake = { kind: 'pancake', prep: 'whole', cooked: 1 };
  assert.equal(resolveDish('plate', [cake]).recipe, 'pancakes');
  assert.equal(resolveDish('plate', [cake, cake]).recipe, 'pancakes');
  assert.equal(resolveDish('plate', [cake, cake, cake, ...it('honey')]).recipe, 'pancake-tower');
  assert.equal(resolveDish('plate', [cake, ...it('blueberries')]).recipe, 'berry-pancakes', 'any of the berries');
  // The most specific recipe wins; two slices of bread are still a sandwich.
  assert.equal(resolveDish('plate', it('bread', 'bread', 'cheese')).recipe, 'sandwich');
  assert.equal(resolveDish('oven', it('flour', 'egg', 'sugar')).recipe, 'cupcake');
  assert.equal(resolveDish('oven', it('flour', 'egg', 'sugar', 'milk')).recipe, 'cake');
  assert.equal(resolveDish('oven', it('flour', 'sugar', 'butter')).recipe, 'cookies');
  assert.equal(resolveDish('pot', it('pasta', 'tomato')).recipe, 'spaghetti');
  assert.equal(resolveDish('pot', it('pasta', 'tomato', 'sausage')).recipe, 'meatballs');
  // A recipe from another station doesn't count here.
  assert.equal(findRecipe('plate', it('flour', 'sugar', 'butter')), null);
  // Needs in one shape.
  assert.deepEqual(normalizeNeed({ any: ['a', 'b'], cooked: 1, n: 2 }), { kinds: ['a', 'b'], cooked: 1, raw: false, prep: null, n: 2 });
  assert.equal(matches({ needs: [normalizeNeed('a')], extras: [] }, it('a', 'b')), false, 'b is unexpected');
});

test('Mystery Dish: every other combination works, with a deterministic face and silly name', () => {
  const items = it('fish', 'chocolate', 'banana');
  const d = resolveDish('plate', items);
  assert.equal(d.kind, 'mystery-dish');
  assert.equal(d.mystery, true);
  assert.equal(d.recipe, null);
  assert.deepEqual(d.props.contents, ['banana', 'chocolate', 'fish']);
  assert.ok(MYSTERY_HEX[d.props.color]);
  for (const part of ['eyes', 'mouth', 'topper']) assert.ok(MYSTERY_VARIANTS[part].includes(d.props[part]), part);
  // Deterministic: the same things (any order, on any iPad) make the same dish.
  assert.deepEqual(resolveDish('plate', it('banana', 'fish', 'chocolate')), d);
  assert.equal(mysteryName(items), d.props.name);
  // A name is Adjective + Word + Noun from the lists (~30 each).
  assert.ok(NAME_ADJ.length >= 30 && NAME_NOUN.length >= 30);
  const names = new Set();
  const faces = new Set();
  const kinds = ['fish', 'chocolate', 'banana', 'onion', 'honey', 'seaweed', 'lemon', 'egg', 'carrot', 'sprinkles', 'rice', 'cheese'];
  for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
    const combo = it(kinds[i], kinds[j]);
    const r = resolveDish('plate', combo);
    if (!r.mystery) continue;
    const [adj, ...rest] = r.props.name.split(' ');
    assert.ok(NAME_ADJ.includes(adj) || NAME_ADJ.includes(adj + ' ' + rest[0]), r.props.name);
    assert.ok(NAME_NOUN.includes(rest[rest.length - 1]), r.props.name);
    assert.equal(r.props.name, mysteryName(combo.slice().reverse()));
    names.add(r.props.name);
    faces.add([r.props.eyes, r.props.mouth, r.props.topper].join());
  }
  assert.ok(names.size > 30, 'plenty of different names: ' + names.size);
  assert.ok(faces.size > 20, 'plenty of different faces: ' + faces.size);
  // Colour from the ingredients' average: berries and cream, pinkish; greens, green.
  assert.equal(mysteryFace(it('strawberry', 'strawberry', 'sugar')).color, 'pink');
  assert.equal(mysteryFace(it('lettuce', 'seaweed', 'lettuce')).color, 'green');
  assert.notEqual(contentsKey(it('fish')), contentsKey([{ kind: 'fish', prep: 'whole', cooked: 2 }]), 'cooked fish is a different mystery');
  assert.equal(typeof hash32('x'), 'number');
  // One thing on a plate isn't a dish yet; one weird thing in the pot is.
  assert.equal(resolveDish('plate', it('tomato')), null);
  assert.equal(MIN_MYSTERY.plate, 2);
  assert.equal(resolveDish('pot', it('chocolate')).kind, 'mystery-dish');
  assert.equal(resolveDish('plate', []), null);
  // The blender pours a mystery SMOOTHIE with a face.
  const sm = resolveDish('blender', it('fish', 'onion'));
  assert.equal(sm.kind, 'smoothie');
  assert.ok(sm.props.eyes && sm.props.mouth && sm.props.name && !sm.props.topper);
});

test('discovery: a set on the fixtures entity, once per recipe', () => {
  const store = createStore({ device: 'tt', now: () => 0 });
  assert.equal(discoverArgs(store.state, 'sandwich'), null, 'no fixtures: nothing to write');
  const f = store.newId();
  store.dispatch('spawn', { id: f, kind: 'cafe-fixtures', room: 'cafe/fixtures', x: 0, y: 0, props: {} });
  const a = discoverArgs(store.state, 'sandwich');
  assert.deepEqual(a, { id: f, path: 'props.found-sandwich', value: 1 });
  assert.ok(store.dispatch('set', a));
  assert.equal(discoverArgs(store.state, 'sandwich'), null, 'found already');
  assert.deepEqual([...discovered(store.state)], ['sandwich']);
  assert.equal(discoverArgs(store.state, null), null);
  // The book draws a need in its state.
  assert.deepEqual(needProps(normalizeNeed({ kind: 'lettuce', prep: 'chopped' })), { cut: 9 });
  assert.deepEqual(needProps(normalizeNeed({ kind: 'egg', cooked: 1 })), { cooked: 1, cracked: 1 });
});

// ---- behaviors (store ops) ----

const def = normalizeRoom(cafeRoom(m));
function world(store = createStore({ device: 'tt', now: () => 0 })) {
  const sounds = [];
  const view = { room: { id: def.id, def }, viewOf: () => null, play: (n) => sounds.push(n), animateFrom: () => {} };
  const b = createBehaviors({ catalog, store, random: createRng(3) });
  b.bind(view, null);
  const ctx = { view, fx: null, info: {} };
  const spawn = (kind, props, where = { room: def.id, x: 1760, y: 616 }) => { const id = store.newId(); store.dispatch('spawn', { id, kind, ...where, props }); return id; };
  return { store, b, ctx, spawn, sounds, e: (id) => getEntity(store.state, id), kids: (id) => childrenOf(store.state, id) };
}

test('plate: things stack in the middle; a tap assembles ONE combine into the dish where the plate was', () => {
  const w = world();
  const fx = w.spawn('cafe-fixtures', {}, { room: 'cafe/fixtures', x: 0, y: 0 });
  const plate = w.spawn('plate');
  const ids = ['bread', 'cheese', 'tomato', 'lettuce'].map((kind) => w.spawn(kind, kind === 'bread' ? { cut: 2 } : {}, { room: def.id, x: 1500, y: 900 }));
  for (const id of ids) assert.equal(w.b.onDropInto(w.e(id), w.e(plate), w.ctx), true);
  assert.deepEqual(w.kids(plate).map((k) => k.slot).sort(), ['s0', 's1', 's2', 's3'], 'in drop order');
  const lay = w.b.layoutOf(w.e(plate), w.kids(plate));
  const ys = ids.map((id) => lay.get(id).y);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] < ys[i - 1], 'stacked up: ' + ys);
  assert.equal(w.b.onTap(w.e(plate), w.ctx), true);
  const log = w.b.log().at(-1);
  assert.equal(log.reason, 'assemble');
  assert.deepEqual(log.via, ['assemble']);
  const sw = inRoom(w.store.state, def.id).find((q) => q.kind === 'sandwich');
  assert.ok(sw);
  assert.deepEqual(sw.props, { recipe: 'sandwich', name: 'Sandwich' });
  assert.deepEqual([sw.x, sw.y], [1760, 616]);
  assert.equal(w.e(plate), undefined, 'the plate is part of the sandwich now');
  for (const id of ids) assert.equal(w.e(id), undefined);
  assert.equal(w.e(fx).props['found-sandwich'], 1);
  assert.ok(w.sounds.includes('chime') && w.sounds.includes('tada'));
  // Eating it through: the plate comes back (dirty).
  for (let i = 0; i < 3; i++) w.b.act(sw.id, 'bite');
  assert.ok(inRoom(w.store.state, def.id).some((q) => q.kind === 'plate' && q.props.dirty));
});

test('plate: weird things make a named Mystery Dish; one thing alone hops; a cupcake keeps its plate', () => {
  const w = world();
  const plate = w.spawn('plate');
  const t = w.spawn('tomato', {}, { parent: plate, slot: 's0' });
  w.b.onTap(w.e(plate), w.ctx);
  assert.equal(w.b.log().at(-1).reason, 'more');
  assert.equal(w.e(t).parent, plate, 'still a tomato on a plate');
  w.spawn('chocolate', {}, { parent: plate, slot: 's1' });
  w.b.onTap(w.e(plate), w.ctx);
  assert.equal(w.b.log().at(-1).reason, 'mystery');
  const md = inRoom(w.store.state, def.id).find((q) => q.kind === 'mystery-dish');
  assert.deepEqual(md.props, resolveDish('plate', it('tomato', 'chocolate')).props);
  assert.ok(w.sounds.includes('giggle'));
  // A tap on it: a giggle and a wiggle, never a bite.
  w.b.onTap(md, w.ctx);
  assert.equal(w.b.log().at(-1).reason, 'giggle');
  assert.equal(w.e(md.id).props.bites, undefined);
  // Mystery Dishes taste weird (a funny face, then a laugh).
  assert.ok(catalog.hasTag('mystery-dish', 'weird'));
  // A cake slice with sprinkles: a party cake ON the plate (the plate stays).
  const p2 = w.spawn('plate', {}, { room: def.id, x: 1500, y: 616 });
  w.spawn('cake-slice', {}, { parent: p2, slot: 's0' });
  w.spawn('sprinkles', {}, { parent: p2, slot: 's1' });
  w.b.onTap(w.e(p2), w.ctx);
  const [cake] = w.kids(p2);
  assert.equal(cake.kind, 'cake-slice');
  assert.equal(cake.props.topper, 'candle');
  assert.ok(w.e(p2), 'the plate stays');
  // Dressed: its topper (and a tinted dish's filter) drawn on the reused art.
  const sp = w.b.spriteOf(cake);
  assert.ok(sp.overlays.some((o) => /mystery-topper-candle/.test(o.src)));
  const choc = w.spawn('sundae', { tint: 'choc' });
  assert.equal(w.b.spriteOf(w.e(choc)).filter, DISH_TINTS.choc);
  const face = w.spawn('smoothie', { color: 'green', eyes: 'googly', mouth: 'grin' });
  assert.equal(w.b.spriteOf(w.e(face)).overlays.length, 2, 'a mystery smoothie has a face');
});

test('two iPads: the guest assembles, the host sequences, both see the same dish; both tap at once: one dish', () => {
  const toHost = [], toGuest = [];
  const hostStore = createStore({ device: 'zoe', now: () => 0 });
  const host = createHost(hostStore, { broadcast: (env) => toGuest.push(env) });
  const hw = world(hostStore);
  hw.spawn('cafe-fixtures', {}, { room: 'cafe/fixtures', x: 0, y: 0 });
  const plate = hw.spawn('plate');
  for (const [i, kind] of ['fish', 'banana', 'honey'].entries()) hw.spawn(kind, {}, { parent: plate, slot: 's' + i });
  const plate2 = hw.spawn('plate', {}, { room: def.id, x: 1500, y: 616 });
  hw.spawn('pancake', { cooked: 1 }, { parent: plate2, slot: 's0' });
  toGuest.length = 0;
  const guestStore = createStore({ device: 'ian', now: () => 0 });
  guestStore.load(JSON.parse(JSON.stringify(hostStore.state)), hostStore.clockState());
  joinAsGuest(guestStore, (env) => toHost.push(JSON.parse(JSON.stringify(env))));
  const gw = world(guestStore);
  const flush = () => {
    while (toHost.length || toGuest.length) {
      while (toHost.length) host.submit(toHost.shift());
      while (toGuest.length) guestStore.receive(JSON.parse(JSON.stringify(toGuest.shift())));
    }
  };
  // The guest taps plate 2: pancakes, carried whole in the op.
  gw.b.onTap(gw.e(plate2), gw.ctx);
  assert.equal(guestStore.state.entities[plate2].deleted, undefined, 'not applied until the host says so');
  flush();
  const pc = inRoom(hostStore.state, def.id).find((q) => q.kind === 'pancakes');
  assert.ok(pc && pc.props.recipe === 'pancakes');
  assert.deepEqual(guestStore.state, hostStore.state);
  assert.deepEqual([...discovered(hostStore.state)], ['pancakes']);
  // Both tap plate 1 at the same moment: one Mystery Dish, the same on both.
  hw.b.onTap(hw.e(plate), hw.ctx);
  gw.b.onTap(gw.e(plate), gw.ctx);
  flush();
  const mds = inRoom(hostStore.state, def.id).filter((q) => q.kind === 'mystery-dish');
  assert.equal(mds.length, 1, 'one dish');
  assert.deepEqual(mds[0].props, resolveDish('plate', it('fish', 'banana', 'honey')).props);
  assert.deepEqual(guestStore.state, hostStore.state);
});
