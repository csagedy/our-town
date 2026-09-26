// ops.js: arg shape checks, envelopes, touched ids and semantic validation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPS, checkArgs, makeEnvelope, touchedIds, validate } from '../../src/engine/ops.js';
import { applyAll, createWorld } from '../../src/engine/world.js';

const K = 'cafe/kitchen';
const GOOD = {
  spawn: { id: 'a:1', kind: 'egg', room: K, x: 1, y: 2, props: { cooked: 0 } },
  move: { id: 'a:1', room: K, x: 1, y: 2 },
  attach: { id: 'a:1', parent: 'a:2', slot: 'hand-l' },
  detach: { id: 'a:1', room: K, x: 1, y: 2 },
  set: { id: 'a:1', path: 'props.cooked', value: 2 },
  combine: { ids: ['a:1', 'a:2'], resultId: 'a:3', resultKind: 'cake', room: K, x: 0, y: 0 },
  remove: { id: 'a:1' },
  travel: { ids: ['a:1'], to: 'school/classroom' },
  mapSet: { lot: 0, structureId: 'a:1' },
};

test('the op list matches the design doc table', () => {
  assert.deepEqual(OPS.slice().sort(), ['attach', 'combine', 'detach', 'mapSet', 'move', 'remove', 'set', 'spawn', 'travel']);
  for (const op of OPS) checkArgs(op, GOOD[op]);
});

test('checkArgs rejects malformed ops', () => {
  const bad = [
    ['nope', {}],
    ['move', null],
    ['move', { id: 'a:1', room: K, x: 1 }],                       // missing y
    ['move', { id: 'a:1', room: K, x: 1, y: NaN }],
    ['move', { id: 'a:1', room: K, x: 1, y: 2, extra: 1 }],       // typo'd key
    ['move', { id: 'egg', room: K, x: 1, y: 2 }],                 // not an id
    ['spawn', { id: 'a:1', kind: 'egg' }],                        // no room or parent
    ['spawn', { id: 'a:1', kind: 'egg', room: K, parent: 'a:2' }],   // both
    ['spawn', { id: 'a:1', kind: '', room: K }],
    ['set', { id: 'a:1', path: 'x', value: 1 }],                  // position goes through move
    ['set', { id: 'a:1', path: 'props.a.b', value: 1 }],          // one level only
    ['set', { id: 'a:1', path: 'props.cooked' }],                 // value missing
    ['combine', { ids: [], resultId: 'a:3', resultKind: 'c', room: K }],
    ['combine', { ids: ['a:1', 'a:1'], resultId: 'a:3', resultKind: 'c', room: K }],
    ['travel', { ids: ['a:1'] }],
    ['remove', { id: 'a:1', hard: 'yes' }],
    ['mapSet', {}],
    ['mapSet', { lot: 6, structureId: 'a:1' }],
    ['mapSet', { lot: 1 }],                                       // lot without structureId
    ['mapSet', { structureId: 'a:1', night: true }],              // structureId without lot
  ];
  for (const [op, args] of bad) assert.throws(() => checkArgs(op, args), TypeError, op + ' ' + JSON.stringify(args));
  checkArgs('mapSet', { lot: 1, structureId: null });
  checkArgs('mapSet', { night: true });
  checkArgs('attach', { id: 'a:1', parent: 'a:2' });
  checkArgs('set', { id: 'a:1', path: 'props.filled', value: null });
});

test('makeEnvelope stamps and deep-copies the args', () => {
  const args = { id: 'a:1', path: 'props.filled', value: { soup: ['red'] } };
  const env = makeEnvelope('set', args, { id: 'a:9', device: 'a', lamport: 4, t: 123 });
  assert.deepEqual(env, { id: 'a:9', op: 'set', args, device: 'a', lamport: 4, t: 123 });
  args.value.soup.push('blue');
  assert.deepEqual(env.args.value, { soup: ['red'] });
  assert.throws(() => makeEnvelope('move', {}, { id: 'a:9', device: 'a', lamport: 1 }), TypeError);
});

test('touchedIds lists the existing entities an op acts on', () => {
  const t = (op, args) => touchedIds({ op, args });
  assert.deepEqual(t('spawn', GOOD.spawn), []);
  assert.deepEqual(t('spawn', { id: 'a:1', kind: 'x', parent: 'a:9' }), ['a:9']);
  assert.deepEqual(t('attach', GOOD.attach), ['a:1', 'a:2']);
  assert.deepEqual(t('combine', GOOD.combine), ['a:1', 'a:2']);
  assert.deepEqual(t('travel', GOOD.travel), ['a:1']);
  assert.deepEqual(t('mapSet', { night: true }), []);
  assert.deepEqual(t('mapSet', GOOD.mapSet), ['a:1']);
  assert.deepEqual(t('move', GOOD.move), ['a:1']);
});

test('validate checks the op makes sense against the world', () => {
  const w = applyAll(createWorld(), [
    { op: 'spawn', args: { id: 'a:1', kind: 'box', room: K }, device: 'a', lamport: 1 },
    { op: 'spawn', args: { id: 'a:2', kind: 'box', parent: 'a:1' }, device: 'a', lamport: 2 },
    { op: 'spawn', args: { id: 'a:3', kind: 'egg', room: K }, device: 'a', lamport: 3 },
    { op: 'remove', args: { id: 'a:3', hard: true }, device: 'a', lamport: 4 },
  ]);
  const v = (op, args, device = 'a') => validate(w, { op, args, device });
  assert.equal(v('move', { id: 'a:1', room: K, x: 0, y: 0 }), null);
  assert.equal(v('move', { id: 'a:3', room: K, x: 0, y: 0 }), 'gone:a:3');     // eaten
  assert.equal(v('move', { id: 'z:1', room: K, x: 0, y: 0 }), 'gone:z:1');
  assert.equal(v('spawn', { id: 'a:1', kind: 'x', room: K }), 'exists:a:1');
  assert.equal(v('spawn', { id: 'a:3', kind: 'x', room: K }), 'exists:a:3');   // tombstoned ids stay taken
  assert.equal(v('spawn', { id: 'b:1', kind: 'x', room: K }, 'a'), 'foreign-id:b:1');
  assert.equal(v('spawn', { id: 'b:1', kind: 'x', room: K }, 'b'), null);
  assert.equal(v('attach', { id: 'a:1', parent: 'a:2' }), 'loop');
  assert.equal(v('attach', { id: 'a:1', parent: 'a:1' }), 'loop');
  assert.equal(v('attach', { id: 'a:2', parent: 'a:1' }), null);
  assert.equal(v('combine', { ids: ['a:1', 'a:3'], resultId: 'a:9', resultKind: 'c', room: K }), 'gone:a:3');
  assert.equal(v('combine', { ids: ['a:1'], resultId: 'a:9', resultKind: 'c', parent: 'a:2' }), 'loop');
  assert.equal(v('combine', { ids: ['a:2'], resultId: 'a:9', resultKind: 'c', parent: 'a:1' }), null);
  assert.equal(v('mapSet', { lot: 0, structureId: 'a:3' }), 'gone:a:3');
  assert.equal(v('mapSet', { night: true }), null);
});
