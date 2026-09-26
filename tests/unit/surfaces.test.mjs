// Surfaces, depth sort, tween keyframe rules and the sprite lookup (P1.7):
// the pure parts of the view layer. The DOM side is in tests/e2e/views.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRoom, findSurface, settle, surfaceUnder, sortKey, zIndexFor, depthScale, stackZ, clampX,
  SNAP_UP, Z_DRAG, Z_FRONT,
} from '../../src/engine/surfaces.js';
import { checkKeyframes, fallKeyframes, fallDuration, bounceHeight } from '../../src/engine/tween.js';
import { spriteFor, addSpriteSource, placeholderSprite, PLACEHOLDER_KINDS } from '../../src/engine/sprites.js';
import { artZ } from '../../src/engine/room.js';
import { TEST_ROOM } from '../../src/scenes/test-room.js';

const room = normalizeRoom(TEST_ROOM);
const S = (id) => room.surfaces.find((s) => s.id === id);

test('normalizeRoom fills in the floor band and surface defaults', () => {
  const r = normalizeRoom({ id: 'x', surfaces: [{ x0: 500, x1: 100, y: 400 }] });
  assert.equal(r.width, 1440);
  assert.deepEqual([r.floor.top, r.floor.bottom, r.floor.x0, r.floor.x1], [700, 960, 0, 1440]);
  assert.deepEqual([r.surfaces[0].x0, r.surfaces[0].x1, r.surfaces[0].depth], [100, 500, 400]);
});

test('a drop over the counter lands on it; a drop a little below its line snaps up', () => {
  assert.equal(findSurface(room, 700, 300).id, 'counter');
  const r = settle(room, { x: 700, y: 480, halfW: 40 });
  assert.equal(r.surface.id, 'counter');
  assert.equal(r.y, 540);
  assert.equal(r.fall, true);
  const up = settle(room, { x: 700, y: 540 + SNAP_UP - 1, halfW: 40 });
  assert.equal(up.surface.id, 'counter');
  assert.ok(up.dist < 0, 'snapped up');
  const below = settle(room, { x: 700, y: 540 + SNAP_UP + 20, halfW: 40 });
  assert.equal(below.surface, null, 'too far below the counter line: floor');
  assert.equal(below.y, 700);
});

test('the first surface under the drop wins (shelf above counter would be hit first)', () => {
  // x 300 is under the shelf only; x 700 under the counter only; x 1100 the table.
  assert.equal(settle(room, { x: 300, y: 100 }).surface.id, 'shelf');
  assert.equal(settle(room, { x: 700, y: 100 }).surface.id, 'counter');
  assert.equal(settle(room, { x: 1100, y: 100 }).surface.id, 'table');
  // Between the shelf and the counter lines, over the counter: the counter.
  assert.equal(settle(room, { x: 700, y: 400 }).surface.id, 'counter');
});

test('a drop in midair with nothing under it falls to the floor band', () => {
  const r = settle(room, { x: 950, y: 200, halfW: 40 });
  assert.equal(r.surface, null);
  assert.equal(r.y, room.floor.top);
  assert.equal(r.fall, true);
  assert.equal(r.dist, 500);
  assert.equal(r.sound, 'thud');
});

test('a drop in the floor band stays; below it or past the room edge is clamped', () => {
  assert.deepEqual([settle(room, { x: 300, y: 850 }).x, settle(room, { x: 300, y: 850 }).y], [300, 850]);
  assert.equal(settle(room, { x: 300, y: 1100 }).y, 960);
  assert.equal(settle(room, { x: -80, y: 850, halfW: 45 }).x, 45);
  assert.equal(settle(room, { x: 1600, y: 850, halfW: 45 }).x, 1440 - 45);
  assert.equal(clampX(room, 700, 5000), 720, 'wider than the room: centered');
});

test('a thing hanging off a surface end is pulled on (at least half of it on)', () => {
  const r = settle(room, { x: 1335, y: 600, halfW: 60 });
  assert.equal(r.surface.id, 'table');
  assert.equal(r.x, 1330 - 30);
});

test('sort key: floor by y; on a surface just in front of its furniture', () => {
  assert.deepEqual(sortKey(room, 300, 850), { key: 850, surface: null });
  assert.equal(sortKey(room, 1100, 640).key, S('table').depth + 0.5);
  assert.equal(surfaceUnder(room, 1100, 640).id, 'table');
  assert.equal(surfaceUnder(room, 1100, 641), null);
  const table = TEST_ROOM.art.find((a) => a.id === 'table');
  const behind = zIndexFor(sortKey(room, 1170, 760).key);
  const onTop = zIndexFor(sortKey(room, 1170, 640).key);
  const front = zIndexFor(sortKey(room, 1170, 900).key);
  assert.ok(behind < artZ(table), 'floor behind the table draws under the table art');
  assert.ok(onTop > artZ(table), 'a cup on the table draws over it');
  assert.ok(front > artZ(table), 'floor in front draws over it');
  assert.ok(zIndexFor(830) > artZ(table), 'exactly at the depth: in front');
  assert.ok(zIndexFor(5000, 99) < Z_FRONT && Z_FRONT < Z_DRAG);
  assert.ok(zIndexFor(700, 3) > zIndexFor(700, 2), 'stack order breaks ties');
  assert.ok(Number.isInteger(zIndexFor(712.345, 1)));
});

test('depth scale runs 0.92 at the back of the floor band to 1.08 at the front', () => {
  assert.equal(depthScale(room, 700), 0.92);
  assert.equal(depthScale(room, 960), 1.08);
  assert.equal(depthScale(room, 830), 1);
  assert.equal(depthScale(room, 100), 0.92);
});

test('stackZ puts a new thing on top of what is already on the surface', () => {
  const ents = [{ id: 'a', x: 600, y: 540, z: 0 }, { id: 'b', x: 700, y: 540, z: 2 }, { id: 'c', x: 300, y: 850, z: 7 }];
  assert.equal(stackZ(room, S('counter'), ents, 'new'), 3);
  assert.equal(stackZ(room, S('counter'), ents, 'b'), 1);
  assert.equal(stackZ(room, S('table'), ents, 'new'), 0);
  assert.equal(stackZ(room, null, ents, 'new'), 0);
});

test('tweens may animate only transform and opacity', () => {
  assert.doesNotThrow(() => checkKeyframes([{ transform: 'scale(1)', opacity: 1, offset: 0, easing: 'ease' }]));
  assert.throws(() => checkKeyframes([{ left: '10px' }]), /only transform\/opacity/);
  assert.throws(() => checkKeyframes({ filter: 'blur(2px)' }), /filter/);
  const k = fallKeyframes('translate3d(0px, 0px, 0)', 'translate3d(0px, 300px, 0)', 12);
  checkKeyframes(k);
  assert.equal(k[0].transform, 'translate3d(0px, 0px, 0)');
  assert.equal(k[k.length - 1].transform, 'translate3d(0px, 300px, 0)', 'ends exactly on the landing spot');
  assert.match(k[2].transform, /translate3d\(0, -12px, 0\)/, 'bounces back up');
  assert.ok(fallDuration(10) >= 200 && fallDuration(1e6) <= 560 && fallDuration(500) > fallDuration(50));
  assert.ok(bounceHeight(500) > bounceHeight(20) && bounceHeight(1e6) <= 22);
});

test('sprite lookup: placeholders for every kind, sources plug in first, broken sources fall through', () => {
  assert.equal(PLACEHOLDER_KINDS.length, 10);
  const s = spriteFor('test-ball');
  assert.deepEqual([s.draw, s.shape, s.w, s.h, s.sound], ['shape', 'round', 86, 86, 'boing']);
  const u = spriteFor('never-heard-of-it');
  assert.equal(u.draw, 'shape');
  assert.equal(u.fill, placeholderSprite('never-heard-of-it').fill, 'stable color for unknown kinds');
  const off = addSpriteSource((kind) => (kind === 'test-ball' ? { key: 'art:ball', draw: 'img', src: 'assets/sprites/ball.svg', w: 80, h: 80 } : null));
  const off2 = addSpriteSource(() => { throw new Error('boom'); });
  assert.equal(spriteFor('test-ball').key, 'art:ball');
  assert.equal(spriteFor('test-cup').key, 'ph:test-cup');
  off(); off2();
  assert.equal(spriteFor('test-ball').key, 'ph:test-ball');
});
