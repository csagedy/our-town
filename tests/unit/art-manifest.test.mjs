// The generated art (python3 tools/build.py art): assets/art-manifest.json
// must only reference files that exist, carry anchors and sizes, and the
// character rig must cover the contract in docs/rig.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { renderCharacter, poseFrames, applyMatrix } from '../../src/engine/rig-svg.js';

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const rig = JSON.parse(readFileSync(path.join(ROOT, manifest.characters.rig), 'utf8'));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);

function checkFile(rel, bytes) {
  assert.ok(!rel.startsWith('/') && !rel.includes('..'), `${rel} must be repo-relative`);
  assert.ok(rel.startsWith('assets/'), `${rel} must ship under assets/`);
  const abs = path.join(ROOT, rel);
  assert.ok(existsSync(abs), `${rel} is missing`);
  if (bytes != null) assert.equal(statSync(abs).size, bytes, `${rel}: manifest byte count is stale (rebuild art)`);
}

test('every room layer file exists, with a placement box and a baseline', () => {
  for (const [id, room] of Object.entries(manifest.rooms)) {
    assert.ok(room.layers.length >= 3, `${id}: depth layers`);
    let prev = -Infinity;
    for (const L of room.layers) {
      checkFile(L.file, L.bytes);
      assert.ok([L.x, L.y, L.w, L.h, L.baseline].every(isNum), `${id}/${L.id}: box and baseline`);
      assert.ok(isPt(L.px) && L.px[0] > 0 && L.px[1] > 0, `${id}/${L.id}: px`);
      assert.ok(L.baseline >= prev, `${id}: layer baselines must not decrease (draw order)`);
      prev = L.baseline;
    }
    for (const s of room.surfaces) assert.ok([s.x0, s.x1, s.y].every(isNum) && s.x1 > s.x0 && room.layers.some((L) => L.id === s.layer), `${id}: surface ${s.id}`);
    for (const s of room.seats) assert.ok(isPt(s.at) && room.layers.some((L) => L.id === s.layer), `${id}: seat ${s.id}`);
    assert.ok(room.floor.y0 < room.floor.y1, `${id}: floor band`);
  }
});

test('every prop variant file exists, with a size and an anchor inside it', () => {
  const ids = Object.keys(manifest.props);
  assert.ok(ids.length >= 20, `starter set has ${ids.length} props, need 20`);
  for (const [id, p] of Object.entries(manifest.props)) {
    assert.ok(p.variants[p.default], `${id}: default variant`);
    assert.ok(isPt(p.grip), `${id}: grip`);
    for (const [vn, v] of Object.entries(p.variants)) {
      checkFile(v.file, v.bytes);
      assert.ok(isPt(v.size) && isPt(v.anchor), `${id}/${vn}: size and anchor`);
      assert.ok(v.anchor[0] >= 0 && v.anchor[0] <= v.size[0] && v.anchor[1] >= 0 && v.anchor[1] <= v.size[1] + 1, `${id}/${vn}: anchor inside the image`);
    }
    for (const list of [p.taps, p.bites]) {
      if (list) for (const v of list) assert.ok(v === null || p.variants[v], `${id}: unknown variant ${v}`);
    }
  }
});

test('character rig covers the docs/rig.md contract', () => {
  checkFile(manifest.characters.rig, manifest.characters.bytes);
  for (const p of ['stand', 'wave', 'hold-up', 'cheer', 'sit', 'walk-a', 'walk-b', 'lie']) assert.ok(rig.poses[p], `pose ${p}`);
  for (const e of ['happy', 'laughing', 'surprised', 'sad', 'yum', 'sleepy', 'grumpy']) assert.ok(rig.expressions[e], `expression ${e}`);
  const slots = new Set(Object.values(rig.wear).map((w) => w.slot));
  for (const s of ['hat', 'top', 'bottom', 'shoes', 'back', 'face']) assert.ok(slots.has(s), `wear slot ${s}`);
  assert.ok(Object.keys(rig.wear).length >= 6 && rig.wear['towel-cape'] && rig.wear.apron, 'outfit pieces incl. a cape and an apron');
  assert.equal(rig.characters.length, 4, 'starter cast');
  assert.ok(new Set(rig.characters.map((c) => c.skin[0])).size === 4, 'varied skin');
  assert.ok(new Set(rig.characters.map((c) => c.hair.style)).size === 4, 'varied hair');
  for (const [id, b] of Object.entries(manifest.characters.bodies)) assert.ok(isPt(b.anchor) && isNum(b.height), `body ${id}: anchor, height`);
});

test('every character renders in every pose and expression, feet on the floor', () => {
  for (const c of rig.characters) {
    const sk = rig.bodies[c.body].skeleton;
    for (const [pname, pose] of Object.entries(rig.poses)) {
      for (const expr of Object.keys(rig.expressions)) {
        const r = renderCharacter(rig, c, { pose: pname, expr });
        assert.ok(!/undefined|NaN/.test(r.svg), `${c.id} ${pname} ${expr}: bad svg`);
      }
      const { frames, anchors } = poseFrames(sk, pose);
      for (const [k, a] of Object.entries(anchors)) assert.ok(isPt(a), `${c.id} ${pname}: anchor ${k}`);
      if (pose.ground) {
        const ank = Math.max(applyMatrix(frames.legLL, 0, sk.shin)[1], applyMatrix(frames.legLR, 0, sk.shin)[1]);
        assert.ok(Math.abs(ank - (sk.hipY + sk.thigh + sk.shin)) < 0.01, `${c.id} ${pname}: planted foot on the floor`);
      }
    }
  }
});
