// Unit tests: the construction site workshop's pure rules (P2c.4, src/core/workshop.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PEG, isHung, pegNear, sawStart, sawStep, STROKE_MIN, CUT_STROKES, sawInto, cutLayout, sawTable, onSawTable,
  mixerAction, mixerRoom, MIXER_MAX, atMouth, mouthAt, conesInPath, dominoChain, seesawsOf, ridersOf, seesawAngle, seesawDrop, TILT,
} from '../../src/core/workshop.js';
import { shapeOf } from '../../src/core/buildgrid.js';

const manifest = JSON.parse(readFileSync(new URL('../../assets/art-manifest.json', import.meta.url), 'utf8'));
const site = manifest.rooms.site;
const grid = site.grid;

test('pegboard: hang spots sit over the tool wall, a tool is hung only exactly there', () => {
  const wall = site.surfaces.find((s) => s.id === 'workbench');
  for (const [kind, s] of Object.entries(PEG)) {
    assert.ok(s.x > wall.x0 && s.x < wall.x1, `${kind} over the bench`);
    assert.ok(s.y < wall.y - 40, `${kind} hangs above the bench top`);
    assert.ok(s.box[0] < s.box[2] && s.box[1] < s.box[3]);
    assert.ok(isHung({ kind, x: s.x, y: s.y }));
    assert.ok(!isHung({ kind, x: s.x + 3, y: s.y }));
    assert.ok(!isHung({ kind, x: s.x, y: s.y, parent: 'c1' }), 'in a hand is not hung');
  }
  assert.ok(!isHung({ kind: 'drill', x: 0, y: 0 }), 'no outline for the drill');
});

test('pegboard: a drop near the outline snaps home, far away or on the bench it does not', () => {
  const s = PEG.hammer;
  assert.equal(pegNear('hammer', s.x + 40, s.y + 30), s);
  assert.equal(pegNear('hammer', s.x + 120, s.y), null, 'too far to the side');
  assert.equal(pegNear('hammer', s.x, 616), null, 'on the workbench top');
  assert.equal(pegNear('hammer', s.x, 300), null, 'far above');
  assert.equal(pegNear('paintbrush', s.x, s.y), null);
});

test('saw: a stroke is a turn back after STROKE_MIN units; wiggles do not count', () => {
  let st = sawStart(100);
  let strokes = 0;
  const go = (x) => { const r = sawStep(st, x); st = r.st; if (r.stroke) strokes++; };
  for (let x = 100; x <= 130; x += 5) go(x);   // right 30
  for (let x = 130; x >= 100; x -= 5) go(x);   // turn: stroke 1
  go(95); go(130);                              // turn after 35 left: stroke 2
  go(128);                                      // turn after 35 right: stroke 3
  go(131); go(129); go(132);                    // wiggles of 2-3 units: no strokes
  assert.equal(strokes, 3);
  assert.equal(st.strokes, 3);
  assert.ok(STROKE_MIN > 3 && CUT_STROKES >= 3);
});

test('saw: what a piece is cut into, and where the pieces go', () => {
  assert.deepEqual(sawInto('plank', manifest.props.plank), ['plank-half', 'plank-half']);
  assert.deepEqual(sawInto('beam', manifest.props.beam), ['plank', 'plank-half'], '6 cells = 4 + 2');
  assert.equal(sawInto('block-1x1', manifest.props['block-1x1']), null);
  const xs = cutLayout(1000, [87, 87], 10);
  assert.deepEqual(xs, [951.5, 1048.5]);
  const t = sawTable(site);
  assert.ok(t.x0 < t.cx && t.cx < t.x1);
  assert.equal(t.y, site.surfaces.find((s) => s.id === 'workbench').y, 'the table is on the workbench top');
  assert.ok(onSawTable(t, t.cx, t.y));
  assert.ok(!onSawTable(t, t.cx, t.y - 20));
  assert.ok(!onSawTable(t, t.x1 + 80, t.y));
});

test('mixer: tap actions, room in the drum, the mouth', () => {
  assert.equal(mixerAction({}), 'rattle');
  assert.equal(mixerAction({ mixerLoad: 2 }), 'mix');
  assert.equal(mixerAction({ mixerLoad: 2, mixerReady: true }), 'pour');
  assert.equal(mixerAction({ mixerLoad: 0, mixerReady: true }), 'rattle');
  assert.equal(mixerRoom(0, 3), 3);
  assert.equal(mixerRoom(MIXER_MAX - 1, 3), 1);
  assert.equal(mixerRoom(MIXER_MAX, 3), 0);
  const [mx, my] = mouthAt(site);
  const drum = site.pieces['mixer-drum'];
  assert.ok(mx > drum.x && mx < drum.x + drum.w * 0.4 && my > drum.y + drum.h * 0.5, 'the mouth is the drum\'s lower left end');
  assert.ok(atMouth(site, mx, my));
  assert.ok(atMouth(site, mx - 60, my - 80));
  assert.ok(!atMouth(site, mx - 300, my));
  assert.ok(!atMouth(site, mx, 940), 'the ground in front is not the mouth');
});

test('cones: a vehicle knocks the standing cones on its lane; dominoes fall in a row', () => {
  const cones = [
    { id: 'a', x: 100, y: 930 }, { id: 'b', x: 180, y: 935 }, { id: 'c', x: 260, y: 925 },
    { id: 'd', x: 500, y: 930 }, { id: 'e', x: 150, y: 930, down: true }, { id: 'f', x: 150, y: 760 },
  ];
  assert.deepEqual(conesInPath(cones, 90, 200), ['a', 'b']);
  assert.deepEqual(conesInPath(cones, 200, 90), ['a', 'b'], 'either order');
  assert.deepEqual(dominoChain(cones, 'a', 1), [{ id: 'b', step: 1 }, { id: 'c', step: 2 }]);
  assert.deepEqual(dominoChain(cones, 'c', -1), [{ id: 'b', step: 1 }, { id: 'a', step: 2 }]);
  assert.deepEqual(dominoChain(cones, 'd', 1), []);
});

test('seesaw: a plank on a middle support with both ends free; it tips toward more riders', () => {
  const plank = shapeOf(manifest.props.plank.snap, grid.cell);
  const block = shapeOf(manifest.props['block-2x1'].snap, grid.cell);
  const small = shapeOf(manifest.props['block-1x1'].snap, grid.cell);
  const base = { id: 'blk', kind: 'block-2x1', c: 5, r: 0, shape: block };
  const pl = { id: 'pl', kind: 'plank', c: 4, r: 1, shape: plank };
  const list = seesawsOf(grid, [base, pl]);
  assert.equal(list.length, 1);
  const ss = list[0];
  assert.equal(ss.pivot, grid.x0 + 6 * grid.cell);
  assert.equal(ss.top, grid.y - 60);
  // An end held up too: not a seesaw.
  assert.equal(seesawsOf(grid, [base, pl, { id: 'x', kind: 'block-1x1', c: 4, r: 0, shape: small }]).length, 0);
  // On the deck, or something built on top: not a seesaw.
  assert.equal(seesawsOf(grid, [{ ...pl, r: 0 }]).length, 0);
  assert.equal(seesawsOf(grid, [base, pl, { id: 'y', kind: 'block-1x1', c: 6, r: 1.5, shape: small }]).length, 0);
  // Riders on its top.
  const things = [{ id: 'k1', x: ss.x0 + 10, y: ss.top }, { id: 'k2', x: ss.x1 - 10, y: ss.top }, { id: 'k3', x: ss.x1 - 30, y: ss.top }, { id: 'far', x: ss.x0, y: 900 }];
  const rs = ridersOf(ss, things);
  assert.deepEqual(rs.map((t) => t.id), ['k1', 'k2', 'k3']);
  assert.equal(seesawAngle(ss, []), 0);
  assert.equal(seesawAngle(ss, rs.slice(0, 1)), -TILT, 'one on the left: left end down');
  assert.equal(seesawAngle(ss, rs.slice(0, 2)), 0, 'balanced');
  assert.equal(seesawAngle(ss, rs), TILT, 'two on the right beat one');
  assert.ok(seesawDrop(ss, TILT, ss.x1) > 10, 'the right end goes down');
  assert.ok(seesawDrop(ss, TILT, ss.x0) < -10, 'the left end goes up');
});
