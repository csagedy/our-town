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
