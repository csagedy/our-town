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
  assert.equal(rig.characters.length, 12, 'starter cast (P1.15)');
  assert.ok(new Set(rig.characters.map((c) => c.skin[0])).size >= 8, 'varied skin');
  assert.ok(new Set(rig.characters.map((c) => c.hair.style)).size >= 8, 'varied hair');
  assert.ok(new Set(rig.characters.map((c) => c.body)).size >= 5, 'every body type');
  for (const c of rig.characters) assert.ok(typeof c.name === 'string' && c.name, `${c.id}: a name (text layer data)`);
  for (const id of ['girl9', 'boy5', 'grownup', 'grandpa']) assert.ok(rig.characters.some((c) => c.id === id), `kitchen cast ${id}`);
  // The Character Maker's choices (P1.15).
  const m = rig.maker;
  assert.ok(m.skins.length >= 10 && m.hairColors.length >= 8, 'skins and hair colours');
  assert.ok(m.hairStyles.length >= 10 && m.hairStyles.every((h) => rig.hairStyles[h]), 'at least 10 hair styles');
  assert.ok(Object.keys(rig.wear).length >= 20, 'at least 20 outfit pieces');
  for (const [slot, list] of Object.entries(m.wear)) for (const w of list) assert.ok(w === null || rig.wear[w].slot === slot, `maker ${slot}: ${w}`);
  for (const b of m.bodies) assert.ok(rig.bodies[b], `body ${b}`);
  for (const p of ['sit-cross', 'sit-eat']) assert.ok(rig.poses[p], `pose ${p}`);
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

test('the cafe strip: pieces with in-place variants, stations, spawners and zones (P2a.1)', () => {
  const cafe = manifest.rooms.cafe;
  assert.ok(cafe, 'rooms.cafe');
  assert.ok(cafe.width >= 2400 && cafe.width <= 3200, `cafe strip width ${cafe.width}`);
  assert.deepEqual(cafe.layers.map((L) => L.id), ['back', 'counter', 'mid', 'front']);
  const layerIds = new Set(cafe.layers.map((L) => L.id));
  for (const id of ['fridge-door', 'oven-door', 'burner-1', 'burner-2', 'toaster', 'blender', 'coffee-machine', 'register', 'front-door', 'door-bell', 'menu-board', 'sink-tap']) {
    const pc = cafe.pieces[id];
    assert.ok(pc, `piece ${id}`);
    assert.ok(layerIds.has(pc.layer), `${id}: layer`);
    assert.ok([pc.x, pc.y, pc.w, pc.h].every(isNum), `${id}: box`);
    assert.ok(Object.keys(pc.variants).length >= 2 && pc.variants[pc.default], `${id}: variants`);
    for (const v of Object.values(pc.variants)) checkFile(v.file, v.bytes);
    for (const t of pc.taps || []) assert.ok(pc.variants[t], `${id}: tap variant ${t}`);
  }
  assert.ok(cafe.pieces['fridge-door'].variants.open && cafe.pieces['oven-door'].variants.open && cafe.pieces['front-door'].variants.open, 'doors open');
  assert.ok(cafe.pieces['menu-board'].textArea.every(isNum) && cafe.pieces['menu-board'].variants.blank && cafe.pieces['menu-board'].variants.pictures, 'menu board text area + picture fallback');
  const slots = Object.fromEntries(cafe.slots.map((s) => [s.id, s]));
  for (const id of ['burner-1', 'burner-2', 'oven', 'sink', 'cutting-board', 'toaster', 'blender', 'coffee-cup', 'register-drawer', 'tip-jar', 'counter-bell', 'door']) {
    assert.ok(slots[id] && (isPt(slots[id].at) || (slots[id].box && slots[id].box.every(isNum))), `slot ${id}`);
    if (slots[id].piece) assert.ok(cafe.pieces[slots[id].piece], `slot ${id}: piece ${slots[id].piece}`);
  }
  const surfaces = new Set(cafe.surfaces.map((s) => s.id));
  for (const s of cafe.spawners) {
    for (const sid of s.surfaces || []) assert.ok(surfaces.has(sid), `spawner ${s.id}: surface ${sid}`);
    for (const item of s.items) assert.ok(manifest.props[item], `spawner ${s.id}: prop ${item}`);
  }
  assert.ok(cafe.seats.length >= 10, 'seats');
  for (const s of cafe.seats) assert.ok(s.at[0] >= 0 && s.at[0] <= cafe.width && s.at[1] <= 1000, `seat ${s.id} is on the stage`);
  assert.deepEqual(cafe.zones.map((z) => z.id), ['kitchen', 'counter', 'dining']);
});

test('cafe food: 30+ ingredients with prep variants, 12+ dishes with bites, the mystery kit', () => {
  const c = manifest.cafe;
  assert.ok(c.ingredients.length >= 30, `${c.ingredients.length} ingredients`);
  for (const id of c.ingredients) assert.ok(manifest.props[id], `ingredient ${id}`);
  for (const [id, p] of Object.entries(manifest.props)) {
    if (!p.prep) continue;
    for (const list of [p.prep.cut, p.prep.cook, p.prep.crack]) if (list) for (const v of list) assert.ok(p.variants[v], `${id}: prep variant ${v}`);
    if (p.prep.cook) assert.equal(p.prep.cook.length, 4, `${id}: doneness 0..3`);
  }
  const dishes = c.dishes.filter((id) => manifest.props[id]);
  assert.ok(dishes.length >= 12, `${dishes.length} dishes`);
  for (const id of dishes) if (manifest.props[id].leaves) assert.ok(manifest.props[manifest.props[id].leaves], `${id}: leaves ${manifest.props[id].leaves}`);
  for (const part of [c.mystery.base, ...Object.values(c.mystery.parts)]) assert.ok(manifest.props[part], `mystery ${part}`);
  for (const col of c.mystery.colors) assert.ok(manifest.props[c.mystery.base].variants[col], `mystery colour ${col}`);
  for (const id of Object.values(c.cookware)) assert.ok(manifest.props[id], `cookware ${id}`);
});
