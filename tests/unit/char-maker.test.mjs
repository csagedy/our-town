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
  MIRROR_ROOM, CATEGORIES, optionsOf, isChosen, chooseOps, randomLook, lookOps, COLOR_KEY,
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
  assert.equal(CATEGORIES.length, 15);
  for (const cat of CATEGORIES) assert.ok(optionsOf(rig, cat).length >= 3, cat);
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
  for (const cat of ['top', 'bottom', 'shoes', 'hat', 'back']) {
    const value = optionsOf(rig, cat).filter(Boolean)[1];
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
