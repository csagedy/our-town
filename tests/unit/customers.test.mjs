// Unit: the cafe customers' pure rules (src/core/customers.js, P2a.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EASY, MAX_WALKINS, orderPool, rollOrder, servable, matchesOrder, freeSeats, pickSeat, walkIns, tableSpot,
  coinSpots, tipJarLook, pileCount, walkMs, phaseOf, cupFull,
} from '../../src/core/customers.js';

const table = { recipes: [
  { id: 'pancakes', dish: 'pancakes', name: 'Pancakes' }, { id: 'sandwich', dish: 'sandwich', name: 'Sandwich' },
  { id: 'strawberry-banana', dish: 'smoothie', name: 'Strawberry Banana Smoothie' }, { id: 'cupcake', dish: 'cupcake', name: 'Cupcake' },
  { id: 'spaghetti', dish: 'spaghetti', name: 'Spaghetti' },
] };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const isFood = (k) => ['sandwich', 'banana', 'cupcake', 'smoothie', 'mystery-dish'].includes(k);

test('the order pool: the easy ones plus what the kids found, deterministic', () => {
  assert.deepEqual(orderPool([], table), [...EASY].sort());
  assert.ok(orderPool(['spaghetti'], table).includes('spaghetti'));
  assert.ok(!orderPool(['nope'], table).includes('nope'), 'unknown recipe ids are skipped');
});

test('rollOrder: anything (a heart), a dish from the table, or coffee; the same rolls give the same order', () => {
  assert.equal(rollOrder(seq(0.01), { table }).any, true);
  const o = rollOrder(seq(0.7, 0.7), { table });
  assert.deepEqual(o, { dish: 'sandwich', recipe: 'sandwich', any: false, name: 'Sandwich' });
  assert.deepEqual(rollOrder(seq(0.7, 0.7), { table }), o);
  assert.equal(rollOrder(seq(0.5, 0), { table }).dish, 'coffee');
  assert.equal(rollOrder(seq(0.5, 0.99), { table }).dish, 'smoothie');
});

test('servable: food, full cups, plates with food; not empty or dirty dishes, coins or characters', () => {
  assert.ok(servable({ kind: 'sandwich', props: {} }, isFood));
  assert.ok(servable({ kind: 'cafe-cup', props: { fill: 'latte' } }, isFood));
  assert.ok(!servable({ kind: 'cafe-cup', props: {} }, isFood));
  assert.ok(!servable({ kind: 'cafe-cup', props: { fill: 'empty' } }, isFood));
  assert.ok(servable({ kind: 'mug', props: { fill: 1 } }, isFood));
  assert.ok(!servable({ kind: 'plate', props: {} }, isFood, []));
  assert.ok(servable({ kind: 'plate', props: {} }, isFood, [{ kind: 'banana' }]));
  assert.ok(!servable({ kind: 'plate', props: { dirty: 1 } }, isFood, [{ kind: 'banana' }]));
  assert.ok(!servable({ kind: 'coin', props: {} }, () => true));
  assert.ok(!servable({ kind: 'char', props: {} }, () => true));
  assert.ok(!servable({ kind: 'glass', props: {} }, isFood));
});

test('matchesOrder: the dish kind, coffee = a full cup, anything always; a mystery dish never is (and that is fine)', () => {
  assert.ok(matchesOrder({ dish: 'pancakes' }, { kind: 'pancakes', props: { recipe: 'choc-pancakes' } }));
  assert.ok(!matchesOrder({ dish: 'pancakes' }, { kind: 'mystery-dish', props: {} }));
  assert.ok(matchesOrder({ dish: 'coffee' }, { kind: 'cafe-cup', props: { fill: 'cocoa' } }));
  assert.ok(matchesOrder({ any: true }, { kind: 'mystery-dish', props: {} }));
  assert.ok(!matchesOrder(null, { kind: 'pancakes', props: {} }));
  assert.ok(cupFull({ kind: 'mug', props: { fill: 1 } }));
});

test('seats: free dining seats (not taken, not walked to), tables first; at most 4 walk-ins', () => {
  const seats = [{ id: 'island-stool-1' }, { id: 'window-seat-1' }, { id: 'table-1-chair-l' }, { id: 'table-1-chair-r' }, { id: 'bed-1', lie: true }];
  const chars = [{ props: { seat: 'table-1-chair-l' } }, { props: { walk: { seat: 'table-1-chair-r' } } }];
  assert.deepEqual(freeSeats(seats, chars).map((s) => s.id), ['window-seat-1']);
  assert.equal(pickSeat(seats, [], seq(0)).id, 'table-1-chair-l');
  assert.equal(pickSeat(seats, chars, seq(0.9)).id, 'window-seat-1');
  assert.equal(pickSeat(seats, chars.concat([{ props: { seat: 'window-seat-1' } }]), seq(0)), null);
  assert.equal(MAX_WALKINS, 4);
  assert.equal(walkIns([{ props: { cust: 'walk' } }, { props: {} }]).length, 1);
});

test('tableSpot and coins: on the table in front of the chair, coins beside the plate within the table', () => {
  const surfaces = [{ id: 'table-1', x0: 2205, x1: 2415, y: 805 }, { id: 'window-seat-sill', x0: 1981, x1: 2233, y: 474.6 }];
  const s = tableSpot({ id: 'table-1-chair-l', x: 2254, y: 865 }, surfaces);
  assert.equal(s.surface, 'table-1');
  assert.equal(s.y, 805);
  assert.ok(s.x > 2254 && s.x < 2310);
  assert.equal(tableSpot({ id: 'window-seat-1', x: 2044, y: 576 }, surfaces).surface, 'window-seat-sill');
  assert.equal(tableSpot({ id: 'rug-1', x: 10, y: 900 }, surfaces), null);
  const c = coinSpots(3, 2400, 805, { x0: 2205, x1: 2415 });
  assert.equal(c.length, 3);
  for (const p of c) assert.ok(p.x <= 2401 && p.x >= 2219 && p.y === 805);
});

test('looks, counts, phases', () => {
  assert.deepEqual([0, 1, 5, 6, 40].map(tipJarLook), ['empty', 'coins', 'coins', 'full', 'full']);
  assert.deepEqual([0, 3, 99].map(pileCount), [0, 3, 14]);
  assert.ok(walkMs(0) >= 1100 && walkMs(100000) <= 3000);
  assert.equal(phaseOf({ order: { any: true } }), 'wait');
  assert.equal(phaseOf({ order: { any: true }, eating: { id: 'x' } }), 'eat');
  assert.equal(phaseOf({ walk: { seat: 's' }, order: {} }), 'walk');
  assert.equal(phaseOf({ leave: { from: [0, 0] } }), 'leave');
  assert.equal(phaseOf({ paid: { seat: null } }), 'paid');
  assert.equal(phaseOf({}), 'idle');
});
