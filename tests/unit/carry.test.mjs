// Carrying (P1.14, src/scenes/carry.js): the pure parts. The pocket, the
// car and hold-to-go are driven with real touches in tests/e2e/carry.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { carLayout, nextDoor, parkX, pocketList, pocketRoomOf, isVehicle, PAINTED_CARS, CAR_SEATS, POCKET_MAX } from '../../src/scenes/carry.js';
import { createStore } from '../../src/engine/store.js';
import { cityRoom, CITY_FLOOR } from '../../src/scenes/city.js';
import { normalizeRoom, depthScale } from '../../src/engine/surfaces.js';

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));

test('the pocket is a per-device room; its things keep their order and carry their children', () => {
  const store = createStore({ device: 'aaaaaa' });
  const room = pocketRoomOf(store.device);
  assert.equal(room, 'pocket/aaaaaa');
  assert.notEqual(pocketRoomOf('bbbbbb'), room, 'each iPad has its own pocket');
  const bag = store.newId(), apple = store.newId(), cup = store.newId();
  store.dispatch('spawn', { id: bag, kind: 'backpack', room: 'cafe/kitchen', x: 500, y: 900 });
  store.dispatch('spawn', { id: apple, kind: 'apple', parent: bag, slot: 's0' });
  store.dispatch('spawn', { id: cup, kind: 'cupcake', room: 'cafe/kitchen', x: 300, y: 900 });
  store.dispatch('move', { id: cup, room, x: 0, y: 0 });
  store.dispatch('move', { id: bag, room, x: 1, y: 0 });
  assert.deepEqual(pocketList(store.state, room).map((e) => e.id), [cup, bag]);
  assert.equal(store.state.entities[apple].parent, bag, 'the apple is still in the bag');
  assert.equal(pocketList(store.state, pocketRoomOf('bbbbbb')).length, 0);
  assert.ok(POCKET_MAX >= 6);
});

test('car seats: characters sit with their head over the door, things peek out; seats fill driver first', () => {
  const box = { w: 400, h: 180 };
  const lay = carLayout(box, [
    { id: 'a:2', slot: 's1', w: 60, h: 80, char: false },
    { id: 'a:1', slot: 's0', w: 150, h: 260, char: true },
  ]);
  const kid = lay.get('a:1'), cake = lay.get('a:2');
  assert.equal(kid.front, false, 'behind the body');
  assert.ok(kid.x > cake.x, 'the driver seat is at the front (right)');
  assert.ok(kid.y < 0 && kid.y > -box.h, 'the seat point is inside the car');
  assert.ok(cake.y < 0 && cake.y > -box.h);
  assert.ok(kid.scale < 1);
  // Overflow (only a merge without a host can make it) still gets a spot.
  const many = carLayout(box, Array.from({ length: CAR_SEATS + 1 }, (_, i) => ({ id: 'a:' + i, slot: null, w: 50, h: 50 })));
  assert.equal(many.size, CAR_SEATS + 1);
});

test('the car parks by each door, never on a painted car, and drives on around the block', () => {
  for (const [a, b] of PAINTED_CARS) {
    for (const door of [a, (a + b) / 2, b]) {
      const x = parkX(door);
      assert.ok(x + 100 <= a || x - 100 >= b, `door ${door} parks at ${x}`);
    }
  }
  assert.equal(parkX(1430), 1430);
  const doors = [
    { building: 'cafe', x: 378, location: 'cafe/kitchen' }, { building: 'theater', x: 810, location: null },
    { building: 'construction', x: 1430, location: null }, { building: 'school', x: 1998, location: null },
  ];
  assert.equal(nextDoor(doors, 600).building, 'theater');
  assert.equal(nextDoor(doors, parkX(810)).building, 'construction', 'parked at the theater, the next stop is the site');
  assert.equal(nextDoor(doors, 1998).building, 'cafe', 'around the block');
  // With passengers it heads for a place they can go into.
  assert.equal(nextDoor(doors, 600, { built: true }).building, 'cafe');
  assert.equal(nextDoor(doors.map((d) => ({ ...d, location: null })), 600, { built: true }).building, 'theater');
});

test('the car and the backpack are catalog containers with art', () => {
  for (const kind of ['car', 'backpack']) {
    const k = catalog.kinds[kind];
    assert.ok(k, kind);
    assert.ok(k.behaviors.some((b) => b.use === 'container'), `${kind} is a container`);
    assert.ok(manifest.props[k.art.sprite], `${kind} has art`);
  }
  assert.ok(isVehicle({ kind: 'car' }) && !isVehicle({ kind: 'toy-car' }));
});

test('the city map is a room things can rest on, drawn smaller than in a room', () => {
  const room = normalizeRoom(cityRoom(manifest.map, false));
  assert.deepEqual([room.floor.top, room.floor.bottom], [CITY_FLOOR.top, CITY_FLOOR.bottom]);
  assert.ok(room.entityScale > 0.3 && room.entityScale < 1);
  assert.ok(depthScale(room, CITY_FLOOR.bottom) < 1, 'smaller than the same thing in a room');
});
