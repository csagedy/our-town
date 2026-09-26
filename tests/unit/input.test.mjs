// Pure helpers of the P1.6 input module (src/engine/input.js). The gesture
// flow itself is driven with real touch input in tests/e2e/input.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paddedHit, classifyRelease, beyondSlop, edgeSpeed, inEdgeZone, tiltFor, velocityOf,
  TAP_SLOP, TAP_MAX_MS, LONG_PRESS_MS, MIN_HIT, MAX_TILT, EDGE_ZONE, EDGE_DWELL, EDGE_RAMP, EDGE_MAX_SPEED,
} from '../../src/engine/input.js';

const box = (left, top, w, h, order = 0) => ({ left, top, right: left + w, bottom: top + h, order });

test('thresholds are kid-sized and consistent', () => {
  assert.ok(TAP_SLOP >= 15, 'a 12pt wobble must stay a tap');
  assert.ok(TAP_MAX_MS < LONG_PRESS_MS, 'a still press is a tap or a long-press, never both');
  assert.ok(MIN_HIT >= 64);
});

test('slop: 12pt of jitter is inside, a real drag is outside', () => {
  assert.equal(beyondSlop(12, 0), false);
  assert.equal(beyondSlop(8.5, 8.5), false);
  assert.equal(beyondSlop(TAP_SLOP, 0), false);
  assert.equal(beyondSlop(TAP_SLOP + 1, 0), true);
  assert.equal(beyondSlop(15, 15), true);
});

test('classifyRelease', () => {
  assert.equal(classifyRelease({ moved: false, elapsed: 120, longPressed: false }), 'tap');
  assert.equal(classifyRelease({ moved: false, elapsed: TAP_MAX_MS, longPressed: false }), 'tap');
  assert.equal(classifyRelease({ moved: false, elapsed: TAP_MAX_MS + 1, longPressed: false }), 'none');
  assert.equal(classifyRelease({ moved: true, elapsed: 80, longPressed: false }), 'none');
  assert.equal(classifyRelease({ moved: false, elapsed: 700, longPressed: true }), 'none');
});

test('paddedHit grows small boxes to 64pt and prefers the nearest real box', () => {
  const tiny = box(100, 100, 20, 20);           // center 110,110: padded to 78..142
  assert.equal(paddedHit([tiny], 110, 110), tiny);
  assert.equal(paddedHit([tiny], 141, 110), tiny);
  assert.equal(paddedHit([tiny], 143, 110), null);
  assert.equal(paddedHit([tiny], 110, 79), tiny);
  // A big box is not padded further.
  const big = box(300, 300, 200, 100);
  assert.equal(paddedHit([big], 299, 350), null);
  assert.equal(paddedHit([big], 400, 350), big);
  // Two padded boxes overlap: the nearer real box wins.
  const a = box(100, 100, 20, 20);
  const b = box(150, 100, 20, 20);
  assert.equal(paddedHit([a, b], 128, 110), a);
  assert.equal(paddedHit([a, b], 142, 110), b);
  // Exactly in both: the later (on top) wins.
  const c = box(100, 100, 20, 20, 1);
  assert.equal(paddedHit([a, c], 110, 110), c);
  // Per-candidate minHit.
  const roomy = { ...tiny, minHit: 100 };       // padded to 60..160
  assert.equal(paddedHit([roomy], 155, 110), roomy);
  assert.equal(paddedHit([roomy], 165, 110), null);
});

test('edgeSpeed: zero in the middle, ramps after a dwell, faster deeper, signed', () => {
  const L = 0;
  const R = 1000;
  assert.equal(edgeSpeed(500, L, R, 5000), 0);
  assert.equal(inEdgeZone(500, L, R), false);
  assert.equal(inEdgeZone(R - 10, L, R), true);
  assert.equal(edgeSpeed(R - 10, L, R, 0), 0, 'no pan before the dwell');
  assert.equal(edgeSpeed(R - 10, L, R, EDGE_DWELL), 0);
  const half = edgeSpeed(R - 10, L, R, EDGE_DWELL + EDGE_RAMP / 2);
  const full = edgeSpeed(R - 10, L, R, EDGE_DWELL + EDGE_RAMP);
  assert.ok(half > 0 && half < full);
  assert.ok(Math.abs(full - EDGE_MAX_SPEED * (70 / EDGE_ZONE)) < 1e-9);
  assert.equal(edgeSpeed(R, L, R, 10000), EDGE_MAX_SPEED);
  assert.equal(edgeSpeed(R + 50, L, R, 10000), EDGE_MAX_SPEED, 'clamped past the edge');
  assert.ok(edgeSpeed(R - 40, L, R, 10000) < edgeSpeed(R - 5, L, R, 10000));
  assert.equal(edgeSpeed(L + 10, L, R, 10000), -full);
});

test('tiltFor: swings behind the motion, clamped to 12 degrees', () => {
  assert.equal(tiltFor(0), 0);
  assert.ok(tiltFor(0.5) < 0 && tiltFor(-0.5) > 0);
  assert.equal(tiltFor(50), -MAX_TILT);
  assert.equal(tiltFor(-50), MAX_TILT);
});

test('velocityOf uses the recent samples', () => {
  assert.deepEqual(velocityOf([{ t: 0, x: 0, y: 0 }]), { vx: 0, vy: 0 });
  const s = [{ t: 0, x: 0, y: 0 }, { t: 100, x: 500, y: 0 }, { t: 120, x: 510, y: 0 }, { t: 140, x: 520, y: 20 }];
  const v = velocityOf(s);
  assert.ok(Math.abs(v.vx - 0.5) < 1e-9, `vx ${v.vx}`);
  assert.ok(Math.abs(v.vy - 0.5) < 1e-9);
});
