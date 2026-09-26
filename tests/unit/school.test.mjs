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

// ---- P2d.2: the teaching wall (src/scenes/school-board.js) ----
import {
  LETTERS, letterPicture, SIGHT_WORDS, sightWord, MAGNET_WORDS, magnetRows, nextWeather, WEATHERS, DAYS, dateKey,
  TEACHER_CARDS, isTeacher, MAGNET_KIND,
} from '../../src/scenes/school-board.js';
import { whiteboardRows } from '../../src/scenes/school.js';

test('letters: all 26 have a name, a sound, a word and a picture that exists (a star only for U and Z)', () => {
  assert.equal(Object.keys(LETTERS).length, 26);
  const stars = [];
  for (const ch of manifest.school.letters) {
    const L = LETTERS[ch];
    assert.ok(L && L[0] && L[1] && L[2], ch);
    const pic = letterPicture(manifest, ch);
    if (!pic) { stars.push(ch); continue; }
    assert.ok(readFileSync(path.join(ROOT, pic.file)).length > 0, `${ch}: ${pic.file}`);
    assert.ok(Math.max(pic.w, pic.h) <= 84.1);
    const p = manifest.props[L[3]];
    assert.ok(p.variants[L[4]], `${ch}: ${L[3]} has variant ${L[4]}`);
  }
  assert.deepEqual(stars, ['U', 'Z']);
  assert.equal(LETTERS.B[2], 'ball');
});

test('sight words: 16 Pre-K/K words on two pages of 8', () => {
  assert.equal(SIGHT_WORDS.length, 16);
  assert.equal(m.rigs.sightWords.cards.length, 8);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => sightWord(0, i)), ['the', 'I', 'a', 'see', 'can', 'like', 'go', 'is']);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => sightWord(1, i)), ['my', 'we', 'you', 'and', 'to', 'me', 'it', 'up']);
  assert.ok(hitAreas(m).some((h) => h.id === 'sight-flip'));
});

test('magnets: side by side in a row spell a word; a gap or another row breaks it', () => {
  const at = (id, ch, x, y = 300) => ({ id, ch, x, y, w: 54 });
  let rows = magnetRows([at('t', 'T', 220), at('c', 'C', 100), at('a', 'A', 160)]);
  assert.deepEqual(rows, [{ ids: ['c', 'a', 't'], word: 'cat' }]);
  rows = magnetRows([at('c', 'C', 100), at('a', 'A', 160), at('t', 'T', 400)]);
  assert.deepEqual(rows.map((r) => r.word), ['ca', 't']);
  rows = magnetRows([at('d', 'D', 100), at('o', 'O', 160, 300), at('g', 'G', 220, 380)]);
  assert.deepEqual(rows.map((r) => r.word), ['do', 'g']);
  for (const w of ['cat', 'dog', 'sun', 'mom', 'dad', 'ian', 'zoe']) assert.ok(MAGNET_WORDS.includes(w), w);
  assert.ok(catalog[MAGNET_KIND], 'the magnet is a catalog kind');
  const wb = whiteboardRows(m);
  assert.equal(wb.length, 2);
  assert.ok(schoolRoom(m).surfaces.some((s) => s.id === 'wb-row-1'));
});

test('weather cycles sun, cloud, rain, snow (a blank slot starts at sun); days and dates', () => {
  assert.equal(nextWeather(null), 'sun');
  assert.equal(nextWeather('sun'), 'cloud');
  assert.equal(nextWeather('snow'), 'sun');
  for (const w of WEATHERS) { assert.ok(m.pieces['weather-today'].variants[w]); assert.ok(m.pieces['class-window'].variants[w]); }
  assert.equal(DAYS[new Date(2026, 8, 28).getDay()], 'Monday');
  assert.equal(dateKey(new Date(2026, 8, 6)), '2026-09-06');
});

test('teacher cards: the teacher by cast or by lanyard; every card says something and has a picture', () => {
  const st = { entities: { a: { id: 'a', kind: 'char', props: { cast: 'girl9' } }, l: { id: 'l', kind: 'lanyard', parent: 'a', props: {} }, t: { id: 't', kind: 'char', props: { cast: 'teacher' } }, b: { id: 'b', kind: 'char', props: { cast: 'boy5' } } } };
  assert.equal(isTeacher(st, st.entities.t), true);
  assert.equal(isTeacher(st, st.entities.a), true);
  assert.equal(isTeacher(st, st.entities.b), false);
  for (const [id, c] of Object.entries(TEACHER_CARDS)) {
    assert.ok(c.say && c.react && c.pic, id);
    if (c.pic[0] === 'sprite') assert.ok(manifest.props[c.pic[1]], id);
  }
  for (const id of ['line-up', 'clean-up', 'wash-hands', 'snack-time', 'story-time', 'recess', 'quiet']) assert.ok(TEACHER_CARDS[id], id);
});

test('clean up: only floor supplies from here go home; never kids, food, surfaces, far-away things or a magnet row', async () => {
  const { cleanUpPlan } = await import('../../src/scenes/school-board.js');
  const tags = { crayon: ['crayon'], cupcake: ['food'], blocks: ['toy', 'buildpiece'], 'letter-magnet': ['magnet'], 'picture-book': ['book'], char: [] };
  const homes = { crayon: { spawner: 'crayon-cup' }, 'picture-book': { room: SCHOOL_ID }, blocks: { room: 'construction/yard' }, 'letter-magnet': { room: SCHOOL_ID } };
  const e = (id, kind, x, y, props = {}) => ({ id, kind, room: SCHOOL_ID, x, y, props });
  const items = [
    e('c1', 'crayon', 1600, 930, { from: 'bin' }), e('c2', 'crayon', 1470, 837.2, { from: 'bin' }), e('c3', 'crayon', 1500, 950),
    e('b1', 'picture-book', 1780, 950), e('k', 'char', 900, 900), e('f', 'cupcake', 1700, 960), e('x', 'blocks', 1880, 940),
    e('x2', 'blocks', 1800, 940, { from: 'blockbin' }), e('m1', 'letter-magnet', 1260, 940, { ch: 'O' }), e('m2', 'letter-magnet', 1300, 960, { ch: 'C' }),
  ];
  const plan = cleanUpPlan(items, {
    roomId: SCHOOL_ID, floorY0: m.floor.y0, surfaces: [{ x0: 1330, x1: 1533, y: 837.2 }],
    tagsOf: (k) => tags[k], homeOf: (k) => homes[k], fixedOf: () => false,
    binFor: (it) => (it.kind === 'crayon' ? 'bin' : it.kind === 'picture-book' ? 'books' : it.kind === 'blocks' ? 'blockbin' : null),
    magnetKind: 'letter-magnet', rowOf: (id) => (id === 'm2' ? 3 : 1),
  });
  // c3 has no from and its home is a spawner kind (not this room): stays; x (far-away blocks) stays, x2 came out of a bin here: goes.
  assert.deepEqual(plan.map((p) => p.id), ['c1', 'b1', 'x2', 'm1']);
  assert.equal(plan.find((p) => p.id === 'm1').to, 'wall');
});
