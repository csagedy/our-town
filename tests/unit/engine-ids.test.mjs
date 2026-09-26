// ids.js and random.js: device ids, id generator, Lamport clock, stamps, seeded dice.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDeviceId, createIds, deviceOf, isId, createClock, compareStamps, newer } from '../../src/engine/ids.js';
import { createRng, pick, randInt, shuffled } from '../../src/engine/random.js';

test('device ids are short base36 with no colon', () => {
  const d = newDeviceId(createRng(1));
  assert.match(d, /^[0-9a-z]{6}$/);
  assert.notEqual(newDeviceId(createRng(2)), d);
});

test('ids are "<device>:<base36 counter>", unique and resumable', () => {
  const ids = createIds('k3f9');
  assert.equal(ids.next(), 'k3f9:1');
  for (let i = 0; i < 34; i++) ids.next();
  assert.equal(ids.next(), 'k3f9:10');   // 36 in base36
  assert.equal(ids.counter, 36);
  const resumed = createIds('k3f9', ids.counter);
  assert.equal(resumed.next(), 'k3f9:11');
  assert.throws(() => createIds('a:b'));
  assert.throws(() => createIds(''));
});

test('deviceOf and isId', () => {
  assert.equal(deviceOf('k3f9:1a'), 'k3f9');
  assert.equal(deviceOf('nope'), null);
  assert.equal(deviceOf(null), null);
  assert.ok(isId('k3f9:1a'));
  assert.ok(!isId('k3f9'));
  assert.ok(!isId('K3:1'));
  assert.ok(!isId(7));
});

test('Lamport clock ticks locally and jumps past observed ops', () => {
  const c = createClock();
  assert.equal(c.tick(), 1);
  assert.equal(c.tick(), 2);
  c.observe(10);
  assert.equal(c.tick(), 11);
  c.observe(3);             // never goes backwards
  assert.equal(c.time, 11);
  assert.equal(createClock(40).tick(), 41);
});

test('stamps order by lamport, then device id; missing stamps always lose', () => {
  assert.ok(compareStamps([2, 'a'], [1, 'z']) > 0);
  assert.ok(compareStamps([1, 'b'], [1, 'a']) > 0);
  assert.equal(compareStamps([1, 'a'], [1, 'a']), 0);
  assert.ok(newer([1, 'a'], undefined));
  assert.ok(!newer([1, 'a'], [1, 'a']));   // equal stamp = same op, not newer
  assert.ok(!newer([1, 'a'], [1, 'b']));
});

test('seeded rng is reproducible and in [0, 1)', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(createRng(1)(), createRng(2)());
});

test('pick, randInt and shuffled use the given rng', () => {
  const r = createRng(7);
  const list = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 100; i++) assert.ok(list.includes(pick(list, r)));
  for (let i = 0; i < 100; i++) {
    const n = randInt(3, 5, r);
    assert.ok(n >= 3 && n <= 5 && Number.isInteger(n));
  }
  const s = shuffled(list, createRng(9));
  assert.deepEqual([...s].sort(), list);
  assert.deepEqual(shuffled(list, createRng(9)), s);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);   // input untouched
  assert.equal(pick([], r), undefined);
});
