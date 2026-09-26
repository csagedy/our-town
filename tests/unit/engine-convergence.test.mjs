// The convergence tests (docs/design.md 6.4): two devices make interleaved,
// conflicting edits; replaying their op logs in any order must give the
// same world. First a scripted scenario with every kind of conflict, then a
// seeded randomized (property-style) run over many generated histories.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/engine/store.js';
import { applyAll, createWorld, inRoom, LOST_FOUND } from '../../src/engine/world.js';
import { createRng, pick, randInt, shuffled } from '../../src/engine/random.js';

const K = 'cafe/kitchen';
const D = 'cafe/dining';
const S = 'school/classroom';
const ROOMS = [K, D, S, 'pocket'];

/** A store that records every op it originates. */
function device(name) {
  const store = createStore({ device: name, now: () => 0 });
  const log = [];
  store.subscribe((state, env) => { if (env && env.device === name) log.push(env); });
  return { store, log };
}

/** Deliver every op in `from` that `to` has not seen. */
function sync(from, to) { for (const env of from.log) to.store.receive(env); }

function replay(envs) {
  const s = createStore({ device: 'zz' });
  for (const env of envs) s.receive(env);
  return s.state;
}

test('two-log convergence: scripted conflicting edits merge the same in any order', () => {
  const A = device('aa');
  const B = device('bb');
  const a = A.store, b = B.store;

  // Shared start: A sets up the kitchen, B learns it.
  const egg = a.newId(), pot = a.newId(), plate = a.newId(), chef = a.newId(), car = a.newId();
  a.dispatch('spawn', { id: egg, kind: 'egg', room: K, x: 100, y: 800, props: { cooked: 0 } });
  a.dispatch('spawn', { id: pot, kind: 'pot', room: K, x: 300, y: 700 });
  a.dispatch('spawn', { id: plate, kind: 'plate', room: K, x: 500, y: 700 });
  a.dispatch('spawn', { id: chef, kind: 'char', room: K, x: 700, y: 900 });
  a.dispatch('spawn', { id: car, kind: 'car', room: K, x: 0, y: 900 });
  sync(A, B);

  // Round 1, concurrently (neither sees the other):
  a.dispatch('move', { id: egg, room: K, x: 111, y: 811 });          // both move the egg
  b.dispatch('move', { id: egg, room: D, x: 222, y: 822 });
  a.dispatch('set', { id: egg, path: 'props.cooked', value: 2 });    // both cook it differently
  b.dispatch('set', { id: egg, path: 'props.cooked', value: 1 });
  b.dispatch('set', { id: egg, path: 'props.salted', value: true }); // disjoint prop: both survive
  a.dispatch('attach', { id: plate, parent: chef, slot: 'hand-l' }); // A hands the plate to the chef
  const cookie = b.newId();                                          // B puts a new cookie on the plate
  b.dispatch('spawn', { id: cookie, kind: 'cookie', parent: plate, slot: 's0' });
  a.dispatch('remove', { id: pot, hard: true });                     // A sends the pot home...
  b.dispatch('set', { id: pot, path: 'props.filled', value: 'soup' }); // ...while B fills it
  b.dispatch('mapSet', { lot: 0, structureId: car });                // both claim lot 0
  a.dispatch('mapSet', { lot: 0, structureId: chef, night: true });

  // Partial exchange: B hears A's round 1, A does not hear B yet.
  sync(A, B);

  // Round 2: B now has a higher clock; A keeps going concurrently.
  const soup = b.newId();
  b.dispatch('combine', { ids: [egg], resultId: soup, resultKind: 'omelet', room: D, x: 50, y: 850, props: { name: 'Toasty Surprise' } });
  a.dispatch('attach', { id: egg, parent: car, slot: 'trunk' });     // A puts the (now eaten on B) egg in the car
  a.dispatch('travel', { ids: [car], to: S });
  b.dispatch('travel', { ids: [chef], to: S });
  a.dispatch('remove', { id: chef });                                // A sends the chef to Lost & Found
  b.dispatch('mapSet', { night: false });

  // Full exchange: both live devices must agree.
  sync(A, B);
  sync(B, A);
  assert.deepEqual(a.state, b.state);

  // And any replay order of the two logs gives that same world.
  const orders = {
    'A then B': A.log.concat(B.log),
    'B then A': B.log.concat(A.log),
    'reversed': A.log.concat(B.log).reverse(),
    'zipped': A.log.flatMap((e, i) => (B.log[i] ? [B.log[i], e] : [e])).concat(B.log.slice(A.log.length)),
    'with duplicates': B.log.concat(A.log, B.log, A.log.slice(3)),
  };
  for (const [name, envs] of Object.entries(orders)) {
    assert.deepEqual(replay(envs), a.state, name);
    assert.deepEqual(applyAll(createWorld(), envs.filter((e, i) => envs.indexOf(e) === i)), a.state, name + ' (pure)');
  }

  // Spot-check the merged meaning.
  const w = a.state;
  assert.equal(w.entities[egg].deleted, true);                 // the omelet ate it; delete wins over A's attach
  assert.equal(w.entities[soup].props.name, 'Toasty Surprise');
  assert.equal(w.entities[pot].deleted, true);                 // hard delete wins over B's fill
  assert.equal(w.entities[pot].props.filled, 'soup');          // (the tombstone still merged the write)
  assert.equal(w.entities[cookie].parent, plate);
  assert.equal(w.entities[plate].parent, chef);
  assert.ok([S, LOST_FOUND].includes(w.entities[chef].room));  // travel vs remove: LWW picks one
  assert.ok(inRoom(w, w.entities[chef].room).some((e) => e.id === chef));
  assert.equal(w.map.night, false);
});

// ---------------------------------------------------------------------------
// Randomized: many seeded histories, 2 or 3 devices, random partial syncs.

function randomOp(store, rand) {
  const st = store.state;
  const live = Object.values(st.entities).filter((e) => e.kind && !e.deleted).map((e) => e.id).sort();
  const any = () => pick(live, rand);
  const room = () => pick(ROOMS, rand);
  const pos = () => ({ x: randInt(0, 1440, rand), y: randInt(600, 960, rand) });
  const kind = pick(['spawn', 'spawn', 'move', 'move', 'set', 'set', 'attach', 'detach', 'combine', 'remove', 'travel', 'mapSet'], rand);
  if (kind === 'spawn' || live.length < 2) {
    const parent = live.length && rand() < 0.3 ? any() : null;
    return ['spawn', Object.assign({ id: store.newId(), kind: pick(['egg', 'pot', 'block', 'char'], rand), props: { c: randInt(0, 3, rand) } },
      parent ? { parent, slot: 's' + randInt(0, 2, rand) } : Object.assign({ room: room() }, pos()))];
  }
  switch (kind) {
    case 'move': return ['move', Object.assign({ id: any(), room: room(), z: randInt(0, 3, rand) }, pos())];
    case 'detach': return ['detach', Object.assign({ id: any(), room: room() }, pos())];
    case 'set': return ['set', rand() < 0.8
      ? { id: any(), path: 'props.' + pick(['c', 'd', 'color'], rand), value: randInt(0, 9, rand) }
      : { id: any(), path: pick(['rot', 'flip'], rand), value: rand() < 0.5 ? randInt(-12, 12, rand) : rand() < 0.5 }];
    case 'attach': return ['attach', { id: any(), parent: any(), slot: 'h' + randInt(0, 1, rand) }];
    case 'combine': {
      const ids = shuffled(live, rand).slice(0, randInt(1, 2, rand));
      return ['combine', Object.assign({ ids, resultId: store.newId(), resultKind: 'mix', room: room(), props: { name: pick(['A', 'B', 'C'], rand) } }, pos())];
    }
    case 'remove': return ['remove', rand() < 0.5 ? { id: any() } : { id: any(), hard: true }];
    case 'travel': return ['travel', { ids: shuffled(live, rand).slice(0, randInt(1, 3, rand)), to: room() }];
    default: return ['mapSet', rand() < 0.5 ? { lot: randInt(0, 5, rand), structureId: rand() < 0.2 ? null : any() } : { night: rand() < 0.5 }];
  }
}

function history(seed) {
  const rand = createRng(seed);
  const devs = ['aa', 'bb', 'cc'].slice(0, randInt(2, 3, rand)).map(device);
  const steps = randInt(30, 120, rand);
  for (let i = 0; i < steps; i++) {
    const d = pick(devs, rand);
    const [op, args] = randomOp(d.store, rand);
    // Senseless ops (e.g. attach a thing into itself) are refused locally; that's fine.
    d.store.dispatch(op, args);
    if (rand() < 0.25) {        // a random one-way partial delivery, in a scrambled order
      const from = pick(devs, rand), to = pick(devs, rand);
      const some = shuffled(from.log, rand).slice(0, randInt(0, from.log.length, rand));
      for (const env of some) to.store.receive(env);
    }
  }
  return { devs, rand };
}

test('randomized convergence: 300 seeded histories, any delivery order, same world', () => {
  let totalOps = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { devs, rand } = history(seed);
    const all = devs.flatMap((d) => d.log);
    totalOps += all.length;
    // Everyone hears everything (in a scrambled order, with duplicates).
    for (const to of devs) for (const env of shuffled(all.concat(all.slice(0, 5)), rand)) to.store.receive(env);
    const truth = devs[0].store.state;
    for (const d of devs.slice(1)) assert.deepEqual(d.store.state, truth, 'seed ' + seed + ': live devices differ');
    for (let k = 0; k < 4; k++) {
      assert.deepEqual(applyAll(createWorld(), shuffled(all, rand)), truth, 'seed ' + seed + ': permutation ' + k);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(truth)), truth);
  }
  assert.ok(totalOps > 10000, 'generated ' + totalOps + ' ops');
});
