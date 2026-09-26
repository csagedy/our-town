// The school strip's pure half (P2d.1): room definition, cubbies, the line,
// feelings and the catalog kinds it needs. The touch flows are e2e (tests/e2e/school.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  schoolRoom, lineSeats, hitAreas, cubbyAt, cubbySpots, rugIndex, nextToggle, pieceState, PIECES, FEELINGS,
  HOTSPOTS, STOCK, SCHOOL_ITEMS, SCHOOL_CAST, SCHOOL_CAST_WEAR, CUBBY_ITEMS, SCHOOL_ID, wearProps, schoolFiles,
} from '../../src/scenes/school.js';
import { normalizeSeats } from '../../src/engine/char-model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8')).kinds;
const rig = JSON.parse(readFileSync(path.join(ROOT, 'assets/characters/rig.json'), 'utf8'));
const m = manifest.rooms.school;

test('the room: 3200 wide, three camera stops, tiles, every piece, face labels, tap areas, the dimmer', () => {
  const d = schoolRoom(m);
  assert.equal(d.id, SCHOOL_ID);
  assert.equal(d.width, 3200);
  assert.deepEqual(d.cameraStops, [0, 946, 1760]);
  assert.ok(d.tiles.length >= 10);
  for (const pid of Object.keys(m.pieces)) assert.ok(d.art.some((a) => a.id === 'piece:' + pid), pid);
  for (let i = 1; i <= 6; i++) assert.ok(d.art.some((a) => a.id === `face:label-${i}`));
  assert.ok(d.art.some((a) => a.id === 'dim' && a.layer === 'front'));
  const hits = hitAreas(m).map((h) => h.id);
  for (const f of ['happy', 'sad', 'mad', 'scared', 'calm']) assert.ok(hits.includes('feeling-' + f));
  assert.ok(hits.includes('schedule-snack') && hits.includes('letter-A') && hits.includes('easel') && hits.includes('whiteboard'));
  // No words anywhere in the room's markup.
  assert.ok(d.art.every((a) => !/>[^<\s][^<]*</.test(a.html || '')));
});

test('seats: rug spots sit criss-cross, footprints stand, the rocking chair sits, a cot lies', () => {
  const seats = normalizeSeats(schoolRoom(m).seats);
  const by = Object.fromEntries(seats.map((s) => [s.id, s]));
  assert.equal(by['rug-1'].pose, 'sit-cross');
  assert.equal(by['rocking-chair'].pose, 'sit');
  assert.equal(by['line-1'].pose, 'stand');
  assert.equal(lineSeats(m).length, 7);
  assert.equal(normalizeSeats([{ id: 'nap-cot:x', x: 0, y: 0 }])[0].pose, 'lie');
  assert.equal(rugIndex('rug-4'), 3);
  assert.equal(rugIndex('line-1'), -1);
});

test('cubbies: a head at a label picks that cubby; a bag hangs, a lunchbox sits on the shelf', () => {
  const C = m.rigs.cubbies;
  assert.equal(cubbyAt(C, C[2].label[0], C[2].label[1] + 20), 2);
  assert.equal(cubbyAt(C, C[5].label[0] + 10, C[5].label[1]), 5);
  assert.equal(cubbyAt(C, C[0].label[0], 900), -1, 'too low: standing in the line, not at the cubby');
  assert.equal(cubbyAt(C, 1300, 480), -1);
  const kids = [{ id: 'b', kind: 'lunch' }, { id: 'a', kind: 'bag' }, { id: 'c', kind: 'toy' }];
  const spots = cubbySpots(kids, { isBag: (k) => k.kind === 'bag', isLunch: (k) => k.kind === 'lunch' });
  assert.deepEqual(Object.fromEntries(spots), { a: 'hook', b: 'shelf', c: 'floor' });
});

test('pieces: toggles flip, states come from the fixtures props, the fallback pieces name their bead', () => {
  assert.equal(nextToggle('front-door', 'closed'), 'open');
  assert.equal(nextToggle('sink-tap', 'on'), 'off');
  assert.equal(nextToggle('bus', 'still'), null);
  assert.equal(pieceState('light-switch', {}, m.pieces), 'on');
  assert.equal(pieceState('light-switch', { 'light-switch': 'off' }, m.pieces), 'off');
  for (const pid of Object.keys(m.pieces)) assert.ok(PIECES[pid], `${pid} answers a tap`);
  assert.equal(PIECES.seesaw.later, 'P2d.4');
  assert.equal(FEELINGS.scared.word, 'worried');
  assert.equal(FEELINGS.mad.expr, 'grumpy');
  for (const f of Object.values(FEELINGS)) if (typeof f.expr === 'string') assert.ok(rig.expressions[f.expr], f.expr);
});

test('first visit: every seeded kind is in the catalog, the cast exists, backpacks carry their colours', () => {
  const kinds = [...HOTSPOTS.map((h) => h[0]), ...STOCK.map((s) => s[0]), ...SCHOOL_ITEMS.map((s) => s[0]), ...CUBBY_ITEMS.map((c) => c[1]), ...SCHOOL_CAST_WEAR.map((w) => w[1]), 'school-cubby', 'school-fishbowl'];
  for (const k of kinds) assert.ok(catalog[k], k);
  for (const c of SCHOOL_CAST) assert.ok(rig.characters.some((q) => q.id === c.cast), c.cast);
  const p = wearProps(manifest, 'school-backpack', { color: 'rose' });
  assert.equal(p.colors.back, manifest.props['school-backpack'].wear.colors.rose.back);
  assert.ok(schoolFiles(manifest).length > 0);
});
