// P1.15: the Character Maker's rules (src/engine/char-maker.js): every
// category's options, choosing through store ops (so the character in the
// booth saves and replays), colour steps, shuffle, and the booth's scene
// helpers (src/scenes/booth.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIRROR_ROOM, CATEGORIES, optionsOf, isChosen, chooseOps, randomLook, lookOps, COLOR_KEY, THUMB_HIDE, thumbSpec, isRemovableCat,
} from '../../src/engine/char-maker.js';
import { partsOf, specOf, CHAR_KIND, wearSlotName, normalizeSeats } from '../../src/engine/char-model.js';
import { renderCharacter } from '../../src/engine/rig-svg.js';
import { createStore } from '../../src/engine/store.js';
import { childrenOf, applyAll, createWorld } from '../../src/engine/world.js';
import { draftOf, boothRoom } from '../../src/scenes/booth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rig = JSON.parse(readFileSync(path.join(ROOT, 'assets/characters/rig.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));

/** A seeded pseudo-random source (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function spawnLook(store, look) {
  const id = store.newId();
  assert.ok(store.dispatch('spawn', { id, kind: CHAR_KIND, room: MIRROR_ROOM, x: 0, y: 0, props: look.props }));
  for (const p of look.pieces) store.dispatch('spawn', { id: store.newId(), kind: p.kind, parent: id, slot: wearSlotName(p.slot), props: { colors: p.colors } });
  return id;
}
const lookIn = (store, id) => { const e = store.state.entities[id]; return { props: e.props, worn: partsOf(childrenOf(store.state, id), rig).worn }; };

test('every category has picture options (at least 10 hair styles, 20 outfit pieces, a wide skin range)', () => {
  assert.equal(CATEGORIES.length, 17);
  // The belt and gloves tabs (bead mhf.20) are "none" plus the one piece.
  for (const cat of CATEGORIES) assert.ok(optionsOf(rig, cat).length >= (cat === 'belt' || cat === 'hands' ? 2 : 3), cat);
  assert.deepEqual(optionsOf(rig, 'belt'), [null, 'tool-belt']);
  assert.deepEqual(optionsOf(rig, 'hands'), [null, 'gloves']);
  assert.ok(isRemovableCat('belt') && isRemovableCat('hands'), 'belt and gloves are worn children');
  assert.ok(optionsOf(rig, 'hair').length >= 10);
  assert.ok(optionsOf(rig, 'skin').length >= 10);
  assert.deepEqual(optionsOf(rig, 'body'), ['kid5', 'kid9', 'teen', 'adult', 'elder']);
  assert.ok(optionsOf(rig, 'hat').includes('hijab'), 'a headscarf');
  const pieces = new Set(['top', 'bottom', 'shoes', 'hat', 'face', 'over', 'back'].flatMap((c) => optionsOf(rig, c)).filter(Boolean));
  assert.ok(pieces.size >= 20, `${pieces.size} outfit pieces`);
  for (const p of pieces) assert.ok(rig.wear[p], p);
});

test('choosing each option of each category is store ops, and then it is the chosen one', () => {
  const store = createStore({ device: 'a' });
  const id = spawnLook(store, randomLook(rig, rng(7)));
  for (const cat of CATEGORIES) {
    for (const value of optionsOf(rig, cat)) {
      const { props, worn } = lookIn(store, id);
      const ops = chooseOps(rig, id, props, worn, cat, value, () => store.newId());
      for (const [op, args] of ops) assert.ok(store.dispatch(op, args), `${cat} ${JSON.stringify(value)}: ${op}`);
      const after = lookIn(store, id);
      assert.ok(isChosen(cat, value, after.props, after.worn), `${cat} ${JSON.stringify(value)} chosen`);
      const r = renderCharacter(rig, specOf(after.props, after.worn), { pose: 'stand', expr: 'happy' });
      assert.ok(!/undefined|NaN/.test(r.svg), `${cat} ${JSON.stringify(value)} renders`);
    }
  }
  // Only one piece per removable slot ever hangs on it.
  const kids = childrenOf(store.state, id);
  assert.equal(new Set(kids.map((k) => k.slot)).size, kids.length);
});

test('tapping the chosen outfit piece again steps its colour', () => {
  const store = createStore({ device: 'a' });
  const id = spawnLook(store, randomLook(rig, rng(3)));
  for (const cat of ['top', 'bottom', 'shoes', 'hat', 'back', 'belt', 'hands']) {
    const pieces = optionsOf(rig, cat).filter(Boolean);
    const value = pieces[1] || pieces[0];
    let l = lookIn(store, id);
    for (const [op, args] of chooseOps(rig, id, l.props, l.worn, cat, value, () => store.newId())) store.dispatch(op, args);
    const key = COLOR_KEY[cat];
    const colorOf = () => { const q = lookIn(store, id); return cat === 'top' || cat === 'bottom' || cat === 'shoes' ? q.props.colors[key] : q.worn[cat].props.colors[key]; };
    const c0 = colorOf();
    l = lookIn(store, id);
    for (const [op, args] of chooseOps(rig, id, l.props, l.worn, cat, value, () => store.newId())) store.dispatch(op, args);
    assert.notEqual(colorOf(), c0, `${cat} colour stepped`);
    assert.ok(isChosen(cat, value, lookIn(store, id).props, lookIn(store, id).worn), `${cat}: still the same piece`);
  }
});

test('shuffle: random looks are valid, and lookOps turns one look into another (it replays)', () => {
  const store = createStore({ device: 'a' });
  const envs = [];
  store.subscribe((_, env) => { if (env) envs.push(env); });
  const r = rng(42);
  const id = spawnLook(store, randomLook(rig, r));
  const bodies = new Set();
  for (let i = 0; i < 30; i++) {
    const look = randomLook(rig, r);
    bodies.add(look.props.body);
    const { props, worn } = lookIn(store, id);
    for (const [op, args] of lookOps(id, props, worn, look, () => store.newId())) assert.ok(store.dispatch(op, args), op);
    const now = lookIn(store, id);
    for (const k of ['body', 'skin', 'hair', 'wear', 'eyes']) assert.deepEqual(now.props[k], look.props[k], k);
    assert.deepEqual(Object.keys(now.worn).sort(), look.pieces.map((p) => p.slot).sort());
    const out = renderCharacter(rig, specOf(now.props, now.worn), { pose: 'sit' });
    assert.ok(!/undefined|NaN/.test(out.svg));
  }
  assert.ok(bodies.size >= 4, 'shuffles across body types');
  // The op log replays to the same world (it is saved and shared).
  const replayed = applyAll(createWorld(), envs);
  assert.deepEqual(replayed.entities[id].props, store.state.entities[id].props);
  assert.deepEqual(childrenOf(replayed, id).map((k) => k.kind), childrenOf(store.state, id).map((k) => k.kind));
});

test('belt and gloves: chosen as worn children, "none" takes them off, shuffle can put them on (bead mhf.20)', () => {
  const store = createStore({ device: 'a' });
  const id = spawnLook(store, { props: randomLook(rig, rng(5)).props, pieces: [] });
  const pick = (cat, value) => { const l = lookIn(store, id); for (const [op, args] of chooseOps(rig, id, l.props, l.worn, cat, value, () => store.newId())) assert.ok(store.dispatch(op, args), op); };
  pick('belt', 'tool-belt');
  pick('hands', 'gloves');
  let l = lookIn(store, id);
  assert.equal(l.worn.belt.kind, 'tool-belt');
  assert.equal(l.worn.hands.kind, 'gloves');
  const spec = specOf(l.props, l.worn);
  assert.equal(spec.wear.belt, 'tool-belt');
  assert.equal(spec.wear.hands, 'gloves');
  const svg = renderCharacter(rig, spec, { pose: 'stand' }).svg;
  assert.ok(!/undefined|NaN/.test(svg));
  pick('belt', null);
  pick('hands', null);
  l = lookIn(store, id);
  assert.deepEqual(Object.keys(l.worn), []);
  assert.ok(isChosen('belt', null, l.props, l.worn) && isChosen('hands', null, l.props, l.worn));
  // Shuffle: some random looks come with a belt or gloves, and lookOps puts them on and off.
  const r = rng(9);
  const slots = new Set();
  for (let i = 0; i < 60; i++) {
    const look = randomLook(rig, r);
    look.pieces.forEach((p) => slots.add(p.slot));
    const q = lookIn(store, id);
    for (const [op, args] of lookOps(id, q.props, q.worn, look, () => store.newId())) assert.ok(store.dispatch(op, args), op);
    assert.deepEqual(Object.keys(lookIn(store, id).worn).sort(), look.pieces.map((p) => p.slot).sort());
  }
  assert.ok(slots.has('belt') && slots.has('hands'), [...slots].join());
});

test('a costume top (hero suit) worn over the top: chosen on the top tab; picking a top takes it off onto the floor (bead mhf.20)', () => {
  const store = createStore({ device: 'a' });
  const look = randomLook(rig, rng(11));
  look.props.wear.top = 'tee-stripe';
  const id = spawnLook(store, { props: look.props, pieces: [] });
  const suit = store.newId();
  assert.ok(store.dispatch('spawn', { id: suit, kind: 'hero-suit', parent: id, slot: wearSlotName('top'), props: {} }));
  let l = lookIn(store, id);
  assert.equal(l.worn.top.kind, 'hero-suit');
  assert.ok(isChosen('top', 'hero-suit', l.props, l.worn), 'the costume shows as the chosen top');
  assert.ok(!isChosen('top', 'tee-stripe', l.props, l.worn), 'the top under it does not');
  // Tapping the chosen costume steps the costume's own colour.
  let ops = chooseOps(rig, id, l.props, l.worn, 'top', 'hero-suit', () => store.newId(), { offTo: { room: 'booth', x: 700, y: 950 } });
  assert.deepEqual(ops.map((o) => o[0]), ['set']);
  assert.equal(ops[0][1].id, suit);
  for (const [op, args] of ops) store.dispatch(op, args);
  assert.ok(store.state.entities[suit].props.colors.top);
  // Picking the top that is under it: the costume comes off onto the floor, nothing else changes.
  l = lookIn(store, id);
  ops = chooseOps(rig, id, l.props, l.worn, 'top', 'tee-stripe', () => store.newId(), { offTo: { room: 'booth', x: 700, y: 950 } });
  assert.deepEqual(ops.map((o) => o[0]), ['detach']);
  for (const [op, args] of ops) assert.ok(store.dispatch(op, args), op);
  const e = store.state.entities[suit];
  assert.ok(!e.deleted && !e.parent && e.room === 'booth' && e.x === 700, 'the suit lies on the booth floor');
  l = lookIn(store, id);
  assert.equal(l.worn.top, undefined);
  assert.ok(isChosen('top', 'tee-stripe', l.props, l.worn));
  assert.equal(specOf(l.props, l.worn).wear.top, 'tee-stripe');
  // Worn again, then another top picked: off it comes and the new top is on.
  assert.ok(store.dispatch('attach', { id: suit, parent: id, slot: wearSlotName('top') }));
  l = lookIn(store, id);
  ops = chooseOps(rig, id, l.props, l.worn, 'top', 'hoodie', () => store.newId());
  assert.deepEqual(ops.map((o) => o[0]), ['remove', 'set'], 'without a floor spot it is removed');
  // Shuffle also takes it off (to the floor spot given).
  ops = lookOps(id, l.props, l.worn, randomLook(rig, rng(12)), () => store.newId(), { offTo: { room: 'booth', x: 180, y: 955 } });
  assert.deepEqual(ops[0], ['detach', { id: suit, room: 'booth', x: 180, y: 955, z: 0 }]);
  for (const [op, args] of ops) assert.ok(store.dispatch(op, args), op);
  assert.equal(lookIn(store, id).worn.top, undefined);
  assert.equal(store.state.entities[suit].room, 'booth');
});

test('the booth: the stage character lives in the mirror room; the rug seat sits criss-cross', () => {
  const store = createStore({ device: 'a' });
  assert.equal(draftOf(store.state), null);
  const id = spawnLook(store, randomLook(rig, rng(1)));
  assert.equal(draftOf(store.state).id, id);
  store.dispatch('move', { id, room: 'booth', x: 600, y: 930 });
  assert.equal(draftOf(store.state), null, 'done: it left the stage');
  const def = boothRoom(manifest.rooms.booth);
  assert.ok(def.floor.x1 < 880, 'nothing lands behind the maker panel');
  const seats = normalizeSeats(def.seats);
  assert.equal(seats.find((s) => s.id === 'rug-1').pose, 'sit-cross');
  assert.equal(seats.find((s) => s.id === 'pouf-1').pose, 'sit');
});

test('thumbnails take off what covers the choice (hat over hair), never the real look (bead mhf.18)', () => {
  for (const cat of CATEGORIES) assert.ok(Array.isArray(THUMB_HIDE[cat]), `${cat}: a hide list`);
  const props = { body: 'kid9', hair: { style: 'long', color: ['#6A4A3A', '#523729'] }, wear: { top: 'tee-star', bottom: 'pants', shoes: 'sneakers' } };
  const worn = { hat: { kind: 'hard-hat', props: {} }, face: { kind: 'hero-mask', props: {} }, over: { kind: 'apron', props: {} }, back: { kind: 'hero-cape', props: {} } };
  const spec = specOf(props, worn);
  const before = JSON.stringify(spec);
  assert.deepEqual(Object.keys(thumbSpec(spec, 'hair').wear).sort(), ['bottom', 'face', 'over', 'shoes', 'top']);
  assert.deepEqual(Object.keys(thumbSpec(spec, 'eyes').wear).sort(), ['back', 'bottom', 'over', 'shoes', 'top']);
  assert.deepEqual(Object.keys(thumbSpec(spec, 'top').wear).sort(), ['bottom', 'face', 'hat', 'shoes', 'top']);
  assert.equal(thumbSpec(spec, 'hat'), spec, 'the hat tab keeps everything');
  // Belt and gloves (mhf.20): the belt goes over the top and apron, so those tabs take it off.
  const belted = specOf(props, Object.assign({ belt: { kind: 'tool-belt', props: {} }, hands: { kind: 'gloves', props: {} } }, worn));
  assert.ok(!('belt' in thumbSpec(belted, 'top').wear) && !('belt' in thumbSpec(belted, 'over').wear));
  assert.deepEqual(Object.keys(thumbSpec(belted, 'belt').wear).sort(), ['belt', 'bottom', 'face', 'hat', 'over', 'shoes', 'top']);
  assert.ok('hands' in thumbSpec(belted, 'hands').wear && !('back' in thumbSpec(belted, 'hands').wear));
  assert.equal(JSON.stringify(spec), before, 'the spec itself is untouched');
  // A headscarf hides all the hair; the hair thumbnails take it off, so every style draws.
  const scarf = specOf(props, { hat: { kind: 'hijab', props: {} } });
  const svgs = optionsOf(rig, 'hair').map((style) => renderCharacter(rig, thumbSpec(Object.assign({}, scarf, { hair: { style, color: scarf.hair.color } }), 'hair'), { pose: 'stand' }).svg);
  assert.equal(new Set(svgs).size, svgs.length, 'every hair style looks different');
});
