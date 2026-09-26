// The city map hub (P1.13): its generated art (assets/art-manifest.json
// `map`), the pure room builders of src/scenes/city.js and kitchen.js, and
// the saved "where am I" of src/scenes/town.js. The live map is driven in
// tests/e2e/city.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { cityRoom, cityFiles, BUILDINGS, DOORS } from '../../src/scenes/city.js';
import { kitchenRoom, KITCHEN_ID } from '../../src/scenes/kitchen.js';
import { loadHere, saveHere, HERE_KEY } from '../../src/scenes/town.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const map = manifest.map;
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

function checkFile(f) {
  assert.ok(f.file.startsWith('assets/rooms/city/'), f.file);
  assert.ok(existsSync(path.join(ROOT, f.file)), `${f.file} is missing`);
  assert.equal(statSync(path.join(ROOT, f.file)).size, f.bytes, `${f.file}: stale byte count (rebuild art)`);
}

test('the map art: wider than the screen, every layer and piece with a day and a night file', () => {
  assert.equal(map.id, 'city');
  assert.ok(map.width > 1440 * 1.5, 'pans on every iPad');
  assert.equal(map.layers[0].id, 'back');
  assert.equal(map.layers[0].opaque, true);
  for (const L of map.layers) {
    checkFile(L);
    checkFile(L.night);
    assert.ok([L.x, L.y, L.w, L.h].every(isNum), L.id);
  }
  for (const [id, p] of Object.entries(map.pieces)) {
    checkFile(p);
    if (id !== 'sun' && id !== 'moon') checkFile(p.night);
    assert.ok([p.x, p.y, p.w, p.h, p.depth].every(isNum), id);
    assert.ok(p.x >= map.canvas.x && p.x + p.w <= map.canvas.x + map.canvas.w, `${id} inside the canvas`);
  }
});

test('the map has the four buildings with their moving parts, 6 lots, Lost & Found and a sun/moon', () => {
  const parts = { cafe: 'cafe-door', theater: 'theater-curtains', construction: 'crane-jib', school: 'school-bell' };
  assert.deepEqual(BUILDINGS, Object.keys(parts));
  for (const [b, part] of Object.entries(parts)) {
    const B = map.pieces[b], P = map.pieces[part];
    assert.ok(B && P, `${b} and ${part}`);
    assert.ok(B.w * 1 >= 380, `${b} is big (${B.w} units)`);
    assert.ok(P.pivot && P.depth > B.depth, `${part} turns around a pivot, drawn over ${b}`);
    const [px, py] = P.pivot;
    assert.ok(px >= B.x && px <= B.x + B.w && py >= B.y - 50 && py <= B.y + B.h, `${part} pivot on ${b}`);
  }
  assert.equal(map.pieces.lot.copies.length, 6);
  for (const [x, y] of map.pieces.lot.copies) assert.ok(x >= 0 && x + map.pieces.lot.w <= map.width && y > 700, 'lots on the front strip');
  for (const id of ['lostfound', 'sun', 'moon', 'bus', 'birds']) assert.ok(map.pieces[id], id);
  assert.equal(DOORS.cafe, KITCHEN_ID);
});

test('cityRoom: one art element per piece and lot, day or night sources only', () => {
  const day = normalizeRoom(cityRoom(map, false));
  assert.equal(day.width, map.width);
  const ids = day.art.map((a) => a.id);
  assert.ok(ids.includes('back') && ids.includes('front') && ids.includes('lot-5') && ids.includes('cafe-door'));
  const back = day.art.find((a) => a.id === 'back');
  assert.match(back.html, /class="city-day"[^>]* src="assets\/rooms\/city\/back\.webp"/);
  assert.doesNotMatch(back.html, /back-night\.webp/, 'night art not loaded by day');
  const night = cityRoom(map, true).art.find((a) => a.id === 'back');
  assert.match(night.html, /back-night\.webp/);
  assert.doesNotMatch(night.html, /city-day"[^>]* src=/);
  assert.ok(cityFiles(map, true).every((f) => f.includes('-night') || /sun|moon/.test(f)));
  // Draw order: sky things < buildings < their parts < bus < lots < front layer.
  const z = (id) => day.art.find((a) => a.id === id).depth;
  assert.ok(z('sun') < z('cafe') && z('cafe') < z('cafe-door') && z('cafe-door') < z('bus') && z('bus') < z('lot-0') && z('lot-0') < z('front'));
});

test('kitchenRoom: the kitchen layers and manifest surfaces for the view layer', () => {
  const k = manifest.rooms.kitchen;
  const room = normalizeRoom(kitchenRoom(k));
  assert.equal(room.id, 'cafe/kitchen');
  assert.equal(room.art.length, k.layers.length);
  assert.equal(room.art[0].layer, 'back');
  assert.equal(room.surfaces.length, k.surfaces.length);
  const counter = room.surfaces.find((s) => s.id === 'back-counter');
  assert.equal(counter.depth, k.layers.find((L) => L.id === 'counter').baseline);
  const shelf = room.surfaces.find((s) => s.id === 'shelf-l1');
  assert.ok(shelf.depth < counter.depth, 'wall shelves sort behind the counter');
  assert.deepEqual([room.floor.top, room.floor.bottom], [k.floor.y0, k.floor.y1]);
});

test('loadHere/saveHere: the saved place survives, junk falls back to the map', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
  const s = mem();
  assert.deepEqual(loadHere(s), { at: 'city', mapX: 0 });
  saveHere({ at: 'cafe/kitchen', mapX: 420 }, s);
  assert.deepEqual(loadHere(s), { at: 'cafe/kitchen', mapX: 420 });
  s.setItem(HERE_KEY, '{nope');
  assert.deepEqual(loadHere(s), { at: 'city', mapX: 0 });
  s.setItem(HERE_KEY, JSON.stringify({ at: 'moon/base' }));
  assert.equal(loadHere(s).at, 'city');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadHere(broken), { at: 'city', mapX: 0 });
  saveHere({ at: 'city', mapX: 1 }, broken);   // never throws
});
