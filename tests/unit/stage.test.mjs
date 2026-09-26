import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitStage, STAGE_W, STAGE_H } from '../../src/engine/stage.js';

test('fitStage fills the width on a 4:3 iPad and letterboxes top/bottom', () => {
  const f = fitStage(1024, 768);
  assert.equal(f.s, 1024 / STAGE_W);
  assert.equal(f.x, 0);
  assert.ok(f.y > 0);
  assert.equal(f.y * 2 + STAGE_H * f.s, 768);
});

test('fitStage fills the height on a wide viewport and centers horizontally', () => {
  const f = fitStage(2000, 1000);
  assert.equal(f.s, 1);
  assert.equal(f.x, (2000 - STAGE_W) / 2);
  assert.equal(f.y, 0);
});

import { bleedFor, screenToWorld, worldToScreen, ART_BLEED } from '../../src/engine/stage.js';

const SCREENS = {
  'ipad-air': [1180, 820], 'ipad-pro-9.7': [1024, 768], 'ipad-pro-12.9': [1366, 1024],
  'ipad-air portrait': [820, 1180], 'ipad-pro-9.7 portrait': [768, 1024], 'ipad-pro-12.9 portrait': [1024, 1366],
  'wide desktop': [2000, 900],
};

test('bleedFor covers the whole screen on every iPad, landscape and portrait', () => {
  for (const [name, [vw, vh]] of Object.entries(SCREENS)) {
    const f = fitStage(vw, vh);
    const b = bleedFor(vw, vh);
    // The stage plus bleed, scaled, reaches past every screen edge.
    assert.ok(f.x - b.x * f.s <= 0 && f.x + (STAGE_W + b.x) * f.s >= vw, `${name} horizontal`);
    assert.ok(f.y - b.y * f.s <= 0 && f.y + (STAGE_H + b.y) * f.s >= vh, `${name} vertical`);
  }
  // Landscape iPads need no more than the 100 units drawn into the room art.
  for (const n of ['ipad-air', 'ipad-pro-9.7', 'ipad-pro-12.9']) {
    const b = bleedFor(...SCREENS[n]);
    assert.ok(b.x <= ART_BLEED && b.y <= ART_BLEED, `${n}: ${JSON.stringify(b)}`);
  }
});

test('screenToWorld and worldToScreen round-trip under scale, pan and host offset', () => {
  for (const [vw, vh] of Object.values(SCREENS)) {
    const f = fitStage(vw, vh);
    for (const cam of [0, 333.3, 1440]) {
      for (const [ox, oy] of [[0, 0], [12, 30]]) {
        for (const [wx, wy] of [[0, 0], [1440, 1000], [cam + 720, 500], [2880, 999], [-50, 1100]]) {
          const sp = worldToScreen(f, cam, wx, wy, ox, oy);
          const wp = screenToWorld(f, cam, sp.x, sp.y, ox, oy);
          assert.ok(Math.abs(wp.x - wx) < 1e-9 && Math.abs(wp.y - wy) < 1e-9, `${vw}x${vh} cam ${cam}`);
        }
      }
    }
  }
});

test('screenToWorld maps the stage corners to the camera window', () => {
  const f = fitStage(1024, 768);
  const tl = screenToWorld(f, 500, f.x, f.y);
  const br = screenToWorld(f, 500, f.x + STAGE_W * f.s, f.y + STAGE_H * f.s);
  assert.deepEqual([tl.x, tl.y], [500, 0]);
  assert.ok(Math.abs(br.x - 1940) < 1e-9 && Math.abs(br.y - 1000) < 1e-9);
});
