// world.js: every reducer, per-field LWW, purity, and the selectors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, apply, applyAll, isLive, getEntity, locate, childrenOf, inRoom, isWithin, LOST_FOUND } from '../../src/engine/world.js';

let n = 0;
/** A raw envelope stamped [lamport, device]. */
function E(op, args, lamport, device = 'a') {
  n += 1;
  return { id: device + ':' + n.toString(36), op, args, device, lamport, t: 0 };
}
const K = 'cafe/kitchen';
const D = 'cafe/dining';
function world(...envs) { return applyAll(createWorld(), envs); }
const egg = (lamport = 1, extra = {}) => E('spawn', Object.assign({ id: 'a:e', kind: 'egg', room: K, x: 100, y: 800, props: { cooked: 0 } }, extra), lamport);

test('createWorld is empty with six lots and default settings', () => {
  const w = createWorld();
  assert.equal(w.schema, 1);
  assert.deepEqual(w.entities, {});
  assert.deepEqual(w.map.lots, [null, null, null, null, null, null]);
  assert.equal(w.map.night, false);
  assert.deepEqual(w.settings, { textLayer: true, sound: true });
  assert.notEqual(createWorld().map.lots, w.map.lots);
});

test('spawn creates a full entity with a stamp per field', () => {
  const e = world(egg(3)).entities['a:e'];
  assert.deepEqual(
    { id: e.id, kind: e.kind, room: e.room, parent: e.parent, slot: e.slot, x: e.x, y: e.y, z: e.z, rot: e.rot, flip: e.flip, props: e.props, rev: e.rev },
    { id: 'a:e', kind: 'egg', room: K, parent: null, slot: null, x: 100, y: 800, z: 0, rot: 0, flip: false, props: { cooked: 0 }, rev: 3 });
  assert.deepEqual(e.v.kind, [3, 'a']);
  assert.deepEqual(e.v['props.cooked'], [3, 'a']);
  assert.ok(isLive(e));
});

test('spawn straight into a parent leaves room null', () => {
  const w = world(E('spawn', { id: 'a:p', kind: 'pot', room: K, x: 1, y: 1 }, 1),
    E('spawn', { id: 'a:s', kind: 'soup', parent: 'a:p', slot: 'in-0' }, 2));
  const s = w.entities['a:s'];
  assert.equal(s.parent, 'a:p');
  assert.equal(s.slot, 'in-0');
  assert.equal(s.room, null);
});

test('spawn of an existing id changes nothing (same or older stamp)', () => {
  const w1 = world(egg(1));
  assert.deepEqual(apply(w1, egg(1)), w1);                 // replayed spawn
  const w2 = apply(w1, E('move', { id: 'a:e', room: D, x: 5, y: 6 }, 2));
  assert.equal(apply(w2, egg(1)).entities['a:e'].room, D);   // late duplicate cannot undo the move
});

test('move places the entity, clears parent/slot, z defaults to 0, rot optional', () => {
  let w = world(egg(1), E('attach', { id: 'a:e', parent: 'a:x', slot: 'hand-l' }, 2));
  w = apply(w, E('move', { id: 'a:e', room: D, x: 400, y: 900, z: 2, rot: 5 }, 3));
  const e = w.entities['a:e'];
  assert.deepEqual([e.room, e.parent, e.slot, e.x, e.y, e.z, e.rot], [D, null, null, 400, 900, 2, 5]);
  w = apply(w, E('move', { id: 'a:e', room: D, x: 1, y: 2 }, 4));
  assert.equal(w.entities['a:e'].z, 0);
  assert.equal(w.entities['a:e'].rot, 5);   // not given, not touched
  assert.equal(w.entities['a:e'].rev, 4);
});

test('attach sets parent and slot and nulls room; detach drops it in a room', () => {
  let w = world(egg(1), E('spawn', { id: 'a:c', kind: 'char', room: K, x: 0, y: 0 }, 2));
  w = apply(w, E('attach', { id: 'a:e', parent: 'a:c', slot: 'hand-r' }, 3));
  let e = w.entities['a:e'];
  assert.deepEqual([e.parent, e.slot, e.room], ['a:c', 'hand-r', null]);
  w = apply(w, E('attach', { id: 'a:e', parent: 'a:c' }, 4));
  assert.equal(w.entities['a:e'].slot, null);
  w = apply(w, E('detach', { id: 'a:e', room: D, x: 10, y: 20 }, 5));
  e = w.entities['a:e'];
  assert.deepEqual([e.parent, e.slot, e.room, e.x, e.y, e.z], [null, null, D, 10, 20, 0]);
});

test('set writes one prop (or rot/flip) and leaves the others alone', () => {
  let w = world(egg(1, { props: { cooked: 0, cut: false } }));
  w = apply(w, E('set', { id: 'a:e', path: 'props.cooked', value: 2 }, 2));
  w = apply(w, E('set', { id: 'a:e', path: 'props.filled', value: { soup: 'red' } }, 3));
  w = apply(w, E('set', { id: 'a:e', path: 'flip', value: true }, 4));
  w = apply(w, E('set', { id: 'a:e', path: 'rot', value: -8 }, 5));
  const e = w.entities['a:e'];
  assert.deepEqual(e.props, { cooked: 2, cut: false, filled: { soup: 'red' } });
  assert.equal(e.flip, true);
  assert.equal(e.rot, -8);
});

test('per-field LWW: an older write loses, a newer one wins, fields are independent', () => {
  const w0 = world(egg(1));
  const newer = E('set', { id: 'a:e', path: 'props.cooked', value: 2 }, 5, 'a');
  const older = E('set', { id: 'a:e', path: 'props.cooked', value: 1 }, 4, 'b');
  const moveB = E('move', { id: 'a:e', room: D, x: 9, y: 9 }, 3, 'b');
  const ab = applyAll(w0, [newer, older, moveB]);
  const ba = applyAll(w0, [moveB, older, newer]);
  assert.equal(ab.entities['a:e'].props.cooked, 2);
  assert.equal(ab.entities['a:e'].room, D);       // older op still wins its own field
  assert.deepEqual(ab, ba);
});

test('LWW ties on lamport go to the larger device id', () => {
  const w0 = world(egg(1));
  const fromA = E('set', { id: 'a:e', path: 'props.cooked', value: 'A' }, 7, 'a');
  const fromB = E('set', { id: 'a:e', path: 'props.cooked', value: 'B' }, 7, 'b');
  assert.equal(applyAll(w0, [fromA, fromB]).entities['a:e'].props.cooked, 'B');
  assert.equal(applyAll(w0, [fromB, fromA]).entities['a:e'].props.cooked, 'B');
});

test('remove sends to Lost & Found; hard remove leaves an invisible tombstone', () => {
  let w = world(egg(1), E('attach', { id: 'a:e', parent: 'a:c', slot: 'x' }, 2));
  w = apply(w, E('remove', { id: 'a:e' }, 3));
  const e = w.entities['a:e'];
  assert.deepEqual([e.room, e.parent, e.slot], [LOST_FOUND, null, null]);
  assert.ok(isLive(e));
  w = apply(w, E('remove', { id: 'a:e', hard: true }, 4));
  assert.equal(w.entities['a:e'].deleted, true);
  assert.equal(getEntity(w, 'a:e'), undefined);
  assert.deepEqual(inRoom(w, LOST_FOUND), []);
});

test('a hard delete wins over any later or earlier write (never undeleted)', () => {
  const w0 = world(egg(1));
  const del = E('remove', { id: 'a:e', hard: true }, 2, 'a');
  const late = E('move', { id: 'a:e', room: D, x: 1, y: 1 }, 9, 'b');
  const x = applyAll(w0, [del, late]);
  const y = applyAll(w0, [late, del]);
  assert.deepEqual(x, y);
  assert.ok(!isLive(x.entities['a:e']));
  assert.ok(!isLive(apply(x, egg(1)).entities['a:e']));
});

test('combine deletes the inputs and spawns the result where the op says', () => {
  let w = world(egg(1), E('spawn', { id: 'a:f', kind: 'flour', room: K, x: 1, y: 1 }, 2));
  w = apply(w, E('combine', { ids: ['a:e', 'a:f'], resultId: 'a:k', resultKind: 'cake', room: K, x: 50, y: 60, props: { name: 'Mystery Muffin' } }, 3));
  assert.ok(!isLive(w.entities['a:e']) && !isLive(w.entities['a:f']));
  const k = w.entities['a:k'];
  assert.deepEqual([k.kind, k.room, k.x, k.y, k.props.name], ['cake', K, 50, 60, 'Mystery Muffin']);
  w = apply(w, E('spawn', { id: 'a:pl', kind: 'plate', room: K, x: 1, y: 1 }, 4));
  w = apply(w, E('combine', { ids: ['a:k'], resultId: 'a:k2', resultKind: 'cake-slice', parent: 'a:pl', slot: 's0' }, 5));
  assert.equal(w.entities['a:k2'].parent, 'a:pl');
  assert.equal(w.entities['a:k2'].room, null);
});

test('travel moves top-level things to another room and unparents them', () => {
  let w = world(egg(1), E('spawn', { id: 'a:car', kind: 'car', room: K, x: 0, y: 0 }, 2),
    E('spawn', { id: 'a:c', kind: 'char', parent: 'a:car', slot: 'seat-0' }, 3),
    E('spawn', { id: 'a:x', kind: 'block', room: 'pocket', x: 0, y: 0 }, 4));
  w = apply(w, E('travel', { ids: ['a:car', 'a:x'], to: 'school/classroom' }, 5));
  assert.equal(w.entities['a:car'].room, 'school/classroom');
  assert.equal(w.entities['a:x'].room, 'school/classroom');
  assert.equal(locate(w, 'a:c').room, 'school/classroom');   // the passenger came along
  assert.equal(w.entities['a:c'].parent, 'a:car');
});

test('mapSet sets a lot and/or night with LWW', () => {
  let w = world(E('mapSet', { lot: 2, structureId: 'a:s' }, 3));
  assert.deepEqual(w.map.lots, [null, null, 'a:s', null, null, null]);
  w = apply(w, E('mapSet', { lot: 2, structureId: 'b:t' }, 2, 'b'));   // older: loses
  assert.equal(w.map.lots[2], 'a:s');
  w = apply(w, E('mapSet', { lot: 2, structureId: null, night: true }, 4));
  assert.equal(w.map.lots[2], null);
  assert.equal(w.map.night, true);
  w = apply(w, E('mapSet', { night: false }, 5));
  assert.equal(w.map.night, false);
  assert.equal(w.map.lots[2], null);
});

test('ops before their spawn make an invisible stub the spawn completes', () => {
  const move = E('move', { id: 'b:q', room: D, x: 7, y: 7 }, 5, 'b');
  const spawn = E('spawn', { id: 'b:q', kind: 'ball', room: K, x: 1, y: 1 }, 2, 'b');
  const stub = apply(createWorld(), move);
  assert.ok(stub.entities['b:q']);
  assert.ok(!isLive(stub.entities['b:q']));
  assert.deepEqual(inRoom(stub, D), []);
  const full = apply(stub, spawn);
  assert.deepEqual(full, applyAll(createWorld(), [spawn, move]));
  assert.equal(full.entities['b:q'].room, D);
});

test('unknown ops are skipped', () => {
  const w = world(egg(1));
  assert.equal(apply(w, E('teleport', { id: 'a:e' }, 2)), w);
});

test('reducers are pure: input state is never mutated, untouched entities are shared', () => {
  const w = world(egg(1), E('spawn', { id: 'a:b', kind: 'block', room: K, x: 0, y: 0 }, 2));
  const before = JSON.parse(JSON.stringify(w));
  const ops = [
    E('move', { id: 'a:e', room: D, x: 1, y: 1 }, 3), E('set', { id: 'a:e', path: 'props.cooked', value: 3 }, 4),
    E('attach', { id: 'a:e', parent: 'a:b' }, 5), E('detach', { id: 'a:e', room: K, x: 0, y: 0 }, 6),
    E('combine', { ids: ['a:e'], resultId: 'a:r', resultKind: 'r', room: K }, 7), E('remove', { id: 'a:r' }, 8),
    E('travel', { ids: ['a:r'], to: D }, 9), E('mapSet', { lot: 0, structureId: 'a:r', night: true }, 10),
  ];
  let s = w;
  for (const op of ops) {
    const snap = JSON.stringify(s);
    const next = apply(s, op);
    assert.equal(JSON.stringify(s), snap, op.op + ' mutated its input');
    assert.notEqual(next, s);
    s = next;
  }
  assert.deepEqual(w, before);
  assert.equal(apply(w, ops[0]).entities['a:b'], w.entities['a:b']);
  assert.equal(apply(w, ops[0]).map, w.map);
});

test('reducers never roll dice or read the clock', () => {
  const rnd = Math.random, now = Date.now;
  Math.random = () => { throw new Error('reducer used Math.random'); };
  Date.now = () => { throw new Error('reducer used Date.now'); };
  try {
    world(egg(1), E('combine', { ids: ['a:e'], resultId: 'a:r', resultKind: 'r', room: K, props: { name: 'x' } }, 2));
  } finally { Math.random = rnd; Date.now = now; }
});

test('state stays JSON round-trippable', () => {
  const w = world(egg(1), E('mapSet', { lot: 1, structureId: 'a:e' }, 2));
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w);
});

test('locate, childrenOf, inRoom and isWithin follow the parent chain', () => {
  const w = world(
    E('spawn', { id: 'a:c', kind: 'char', room: K, x: 0, y: 0 }, 1),
    E('spawn', { id: 'a:bag', kind: 'bag', parent: 'a:c', slot: 'back' }, 2),
    E('spawn', { id: 'a:y', kind: 'yoyo', parent: 'a:bag', slot: 'b' }, 3),
    E('spawn', { id: 'a:x', kind: 'ball', parent: 'a:bag', slot: 'a' }, 4),
    E('spawn', { id: 'a:t', kind: 'table', room: D, x: 0, y: 0 }, 5));
  assert.deepEqual(locate(w, 'a:y'), { room: K, top: 'a:c', fallen: false });
  assert.deepEqual(childrenOf(w, 'a:bag').map((e) => e.id), ['a:x', 'a:y']);
  assert.deepEqual(inRoom(w, K).map((e) => e.id), ['a:c']);
  assert.deepEqual(inRoom(w, D).map((e) => e.id), ['a:t']);
  assert.ok(isWithin(w, 'a:y', 'a:c'));
  assert.ok(isWithin(w, 'a:c', 'a:c'));
  assert.ok(!isWithin(w, 'a:c', 'a:y'));
  assert.equal(locate(w, 'nope:1'), null);
});

test('a child of a deleted parent falls to the floor of the parent\'s last room', () => {
  let w = world(
    E('spawn', { id: 'a:c', kind: 'char', room: D, x: 0, y: 0 }, 1),
    E('spawn', { id: 'a:pl', kind: 'plate', parent: 'a:c', slot: 'hand-l' }, 2),
    E('spawn', { id: 'a:k', kind: 'cake', parent: 'a:pl', slot: 's0' }, 3));
  w = apply(w, E('remove', { id: 'a:pl', hard: true }, 4));
  assert.deepEqual(locate(w, 'a:k'), { room: D, top: 'a:k', fallen: true });
  assert.deepEqual(childrenOf(w, 'a:pl'), []);
  assert.deepEqual(inRoom(w, D).map((e) => e.id), ['a:c', 'a:k']);
  // attach to a parent that is already gone: same result
  const w2 = apply(w, E('attach', { id: 'a:c', parent: 'a:pl', slot: 'x' }, 5));
  assert.equal(locate(w2, 'a:c').fallen, true);
  assert.equal(locate(w2, 'a:c').room, LOST_FOUND);   // the plate's last room was via the char itself
});

test('a parent loop from merged logs lands in Lost & Found instead of vanishing', () => {
  const w = world(
    E('spawn', { id: 'a:b1', kind: 'box', room: K, x: 0, y: 0 }, 1),
    E('spawn', { id: 'a:b2', kind: 'box', room: K, x: 0, y: 0 }, 2),
    E('attach', { id: 'a:b1', parent: 'a:b2' }, 3, 'a'),
    E('attach', { id: 'a:b2', parent: 'a:b1' }, 3, 'b'),
    E('spawn', { id: 'a:c', kind: 'cup', parent: 'a:b1', slot: 's' }, 4));
  assert.deepEqual(locate(w, 'a:b1'), { room: LOST_FOUND, top: 'a:b1', fallen: true });
  assert.deepEqual(locate(w, 'a:b2'), { room: LOST_FOUND, top: 'a:b2', fallen: true });
  assert.deepEqual(locate(w, 'a:c'), { room: LOST_FOUND, top: 'a:b1', fallen: false });
  assert.deepEqual(inRoom(w, LOST_FOUND).map((e) => e.id), ['a:b1', 'a:b2']);
  assert.deepEqual(childrenOf(w, 'a:b1').map((e) => e.id), ['a:c']);
  assert.deepEqual(childrenOf(w, 'a:b2'), []);
});
