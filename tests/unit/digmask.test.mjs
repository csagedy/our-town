// Unit: the dig mask (src/engine/digmask.js, P2c.3) and the dig pit's pure
// rules (src/core/digsite.js): soft holes and fills, the stroke builder
// (coalescing, quantizing, the preview equals the replay), snapshots (exact
// round trip), stroke compaction in a real store (the mask is unchanged, the
// strokes are gone, a stroke the snapshot did not see survives), the coverage
// check under a treasure, and the excavator's one-finger reach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createMask, stamp, applyStroke, strokeBuilder, coverage, dirtLeft, encodeMask, decodeMask, maskHash, replay,
  digState, compactionOps, createDigPit, toBase64, fromBase64, isStroke, FULL, MAX_POINTS, STROKE_KIND, SNAP_KIND,
} from '../../src/engine/digmask.js';
import {
  excavatorGeom, excavatorPose, excavatorReach, ARM_RANGE, DRIVE_RANGE, treasureSpots, treasureBox, UNCOVER, REBURY,
  fillRadius, pileDims, restockPicks, TREASURE_LAYOUT, PILE_MAX,
} from '../../src/core/digsite.js';
import { createStore } from '../../src/engine/store.js';
import { createRng } from '../../src/engine/random.js';

const manifest = JSON.parse(readFileSync(new URL('../../assets/art-manifest.json', import.meta.url)));
const site = manifest.rooms.site;
const BOX = site.rigs.dig.box;              // [2037, 721, 329, 224]
const ROOM = 'construction/dig';

test('mask: a fresh mask is full; a dig makes a soft round hole, a fill puts it back', () => {
  const m = createMask({ box: BOX, cell: 2 });
  assert.deepEqual([m.cols, m.rows], [165, 112]);
  assert.equal(dirtLeft(m), 1);
  const cx = 2200, cy = 830;
  const took = stamp(m, cx, cy, 24, 'd');
  assert.ok(took > 0);
  assert.equal(coverage(m, cx - 6, cy - 6, cx + 6, cy + 6), 0, 'the middle is dug out');
  const rim = coverage(m, cx + 18, cy - 1, cx + 22, cy + 1);
  assert.ok(rim > 0 && rim < 1, `the edge is soft (${rim})`);
  assert.equal(coverage(m, cx + 30, cy - 4, cx + 40, cy + 4), 1, 'outside the radius: untouched');
  assert.equal(stamp(m, cx, cy, 24, 'd'), 0, 'digging the same hole again changes nothing');
  const put = stamp(m, cx, cy, 31, 'f');
  assert.equal(put, took, 'a slightly bigger fill (any dump is) puts exactly that back');
  assert.equal(dirtLeft(m), 1);
  assert.equal(coverage(m, cx - 12, cy - 12, cx + 12, cy + 12), 1, 'the hole is gone');
  assert.equal(coverage(m, 0, 0, 10, 10), null, 'no cells there');
});

test('stroke builder: coalesces close points, quantizes, and its preview is exactly the replay', () => {
  const live = createMask({ box: BOX, cell: 2 });
  const b = strokeBuilder(live, 'd', 24.4);
  let moved = 0;
  for (let i = 0; i <= 200; i++) moved += b.add(2080 + i * 1.03, 800 + Math.sin(i / 9) * 30);
  const op = b.op();
  assert.ok(isStroke(op));
  assert.equal(op.r, 24);
  assert.ok(op.p.every(Number.isInteger), 'whole units');
  assert.ok(op.p.length / 2 < 60, `coalesced: ${op.p.length / 2} points kept of 201`);
  assert.ok(moved > 0);
  const rep = createMask({ box: BOX, cell: 2 });
  assert.equal(applyStroke(rep, op), moved);
  assert.equal(maskHash(rep), maskHash(live), 'replay = preview');
  // A very long gesture says so (the controller splits it into several ops).
  const b2 = strokeBuilder(createMask({ box: BOX, cell: 2 }), 'd', 10);
  for (let i = 0; i < MAX_POINTS * 5 && !b2.full(); i++) b2.add(2040 + (i % 300), 725 + Math.floor(i / 300) * 10);
  assert.ok(b2.full());
  assert.equal(isStroke({ m: 'x', r: 3, p: [1, 2] }), false);
  assert.equal(applyStroke(rep, { m: 'd', r: 5, p: [1] }), 0, 'a bad op is ignored');
});

test('snapshots: base64 run-length round trip is exact; damaged data is refused', () => {
  const m = createMask({ box: BOX, cell: 2 });
  assert.ok(encodeMask(m).length <= 8, 'an untouched mask is a few characters');
  const rng = createRng(7);
  for (let i = 0; i < 40; i++) stamp(m, BOX[0] + rng() * BOX[2], BOX[1] + rng() * BOX[3], 10 + rng() * 30, rng() < 0.7 ? 'd' : 'f');
  const s = encodeMask(m);
  assert.ok(s.length < 12000, `${s.length} chars`);
  const back = createMask({ box: BOX, cell: 2 });
  assert.equal(decodeMask(back, s), true);
  assert.deepEqual(Array.from(back.v), Array.from(m.v));
  const other = createMask({ box: [0, 0, 100, 100], cell: 2 });
  assert.equal(decodeMask(other, s), false, 'a mask of another size refuses it');
  assert.equal(decodeMask(back, s.slice(0, -8)), false, 'truncated');
  assert.equal(decodeMask(back, 'not base64!'), false);
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  assert.deepEqual(Array.from(fromBase64(toBase64(bytes))), Array.from(bytes));
});

test('store: strokes replay in spawn order; compaction folds them into one snapshot without changing a cell', () => {
  const store = createStore({ device: 'aaaaaa' });
  const pit = createDigPit({ store, id: 'pit', room: ROOM, box: BOX, cell: 2, compactAt: 12 });
  const rng = createRng(3);
  for (let k = 0; k < 12; k++) {
    const g = pit.begin(k % 4 === 3 ? 'f' : 'd', 20);
    for (let i = 0; i < 12; i++) g.add(BOX[0] + 20 + rng() * (BOX[2] - 40), BOX[1] + 20 + rng() * (BOX[3] - 40));
    g.end();
  }
  let ds = digState(store.state, 'pit');
  assert.equal(ds.strokes.length, 12, 'one op per gesture');
  assert.equal(ds.snap, null);
  const before = pit.hash();
  const fresh = createMask({ box: BOX, cell: 2 });
  replay(fresh, store.state, 'pit');
  assert.equal(maskHash(fresh), before, 'a replay from the store is what is on screen');
  // The 13th gesture goes over the limit: compacted.
  pit.dig(2150, 800, 18);
  ds = digState(store.state, 'pit');
  assert.equal(ds.strokes.length, 0, 'the strokes are folded away');
  assert.ok(ds.snap && ds.snap.kind === SNAP_KIND && typeof ds.snap.props.data === 'string');
  const after = pit.hash();
  replay(fresh, store.state, 'pit');
  assert.equal(maskHash(fresh), after, 'the snapshot replays to the same mask');
  assert.equal(pit.stats().compactions, 1);
  // Strokes after the snapshot replay on top of it; a second compaction drops the old snapshot.
  for (let k = 0; k < 13; k++) pit.fill(BOX[0] + 30 + k * 20, BOX[1] + 100, 12);
  ds = digState(store.state, 'pit');
  const snaps = Object.values(store.state.entities).filter((e) => !e.deleted && e.kind === SNAP_KIND);
  assert.equal(snaps.length, 1, 'only the newest snapshot is kept');
  replay(fresh, store.state, 'pit');
  assert.equal(maskHash(fresh), pit.hash());
  pit.destroy();
});

test('store: a stroke the snapshot did not see (the other iPad, in flight) survives and replays on top', () => {
  const store = createStore({ device: 'aaaaaa' });
  const m = createMask({ box: BOX, cell: 2 });
  for (let k = 0; k < 3; k++) {
    store.dispatch('spawn', { id: store.newId(), kind: STROKE_KIND, room: ROOM, x: 0, y: 0, props: { mask: 'pit', m: 'd', r: 20, p: [40 + k * 60, 60, 60 + k * 60, 80] } });
  }
  replay(m, store.state, 'pit');
  const ops = compactionOps(store.state, m, 'pit', { room: ROOM, newId: () => store.newId() });
  assert.equal(ops[0][0], 'spawn');
  assert.equal(ops.filter(([op]) => op === 'remove').length, 3);
  // The other kid's stroke lands between planning and committing.
  const other = createStore({ device: 'bbbbbb' });
  const late = other.makeOp('spawn', { id: other.newId(), kind: STROKE_KIND, room: ROOM, x: 0, y: 0, props: { mask: 'pit', m: 'd', r: 25, p: [250, 150] } });
  store.receive(late);
  for (const [op, args] of ops) store.dispatch(op, args);
  const ds = digState(store.state, 'pit');
  assert.equal(ds.strokes.length, 1);
  assert.equal(ds.strokes[0].id, late.args.id);
  const want = createMask({ box: BOX, cell: 2 });
  for (const s of [0, 1, 2]) applyStroke(want, { m: 'd', r: 20, p: [40 + s * 60, 60, 60 + s * 60, 80] });
  applyStroke(want, late.args.props);
  const got = createMask({ box: BOX, cell: 2 });
  replay(got, store.state, 'pit');
  assert.equal(maskHash(got), maskHash(want));
});

test('coverage under a treasure: found when the dirt over it is mostly gone, buried again when filled', () => {
  const spots = treasureSpots(site);
  assert.equal(spots.length, 6);
  assert.deepEqual(spots.map((s) => s.kind), TREASURE_LAYOUT.map(([k]) => k));
  const bone = spots.find((s) => s.kind === 'dino-bone');
  const p = manifest.props['dino-bone'].variants.default;
  const box = treasureBox(bone.x, bone.y, p.size[0], p.size[1]);
  assert.ok(box[0] < bone.x && box[2] > bone.x && box[1] < bone.y && box[3] <= bone.y);
  const m = createMask({ box: BOX, cell: 2 });
  const cov = () => coverage(m, ...box);
  assert.equal(cov(), 1);
  stamp(m, bone.x - 30, bone.y - 30, 24, 'd');
  assert.ok(cov() > UNCOVER, `one small hole is not enough (${cov()})`);
  const b = strokeBuilder(m, 'd', 24);
  for (let x = box[0] - 5; x <= box[2] + 5; x += 4) b.add(x, (box[1] + box[3]) / 2);
  assert.ok(cov() <= UNCOVER, `a pass right over it finds it (${cov()})`);
  stamp(m, bone.x, bone.y - 30, fillRadius(3), 'f');
  assert.ok(cov() >= REBURY, `a wheelbarrow of dirt buries it again (${cov()})`);
});

test('excavator: the bucket goes where the finger goes (arm for height, treads for x), within its limits', () => {
  const geo = excavatorGeom(site.rigs.excavator);
  assert.ok(Math.abs(geo.R - site.rigs.excavator.reach) < 0.5);
  const rest = excavatorPose(geo, 0, 0, 0);
  assert.deepEqual(rest.B.map((v) => Math.round(v)), site.rigs.excavator.bucketPivot);
  assert.deepEqual(rest.M.map((v) => Math.round(v * 10) / 10), site.rigs.excavator.bucketMouth);
  assert.deepEqual(excavatorReach(geo, rest.B[0], rest.B[1]), { a: 0, dx: 0 });
  for (const [tx, ty] of [[2150, 860], [2220, 800], [2120, 700], [2080, 900]]) {
    const r = excavatorReach(geo, tx, ty);
    const p = excavatorPose(geo, r.a, r.dx);
    assert.ok(Math.hypot(p.B[0] - tx, p.B[1] - ty) < 1, `reaches (${tx}, ${ty}): ${p.B}`);
  }
  const low = excavatorReach(geo, 2200, 1200);
  assert.equal(low.a, ARM_RANGE[0], 'the arm stops at its lowest');
  const far = excavatorReach(geo, 1000, 800);
  assert.equal(far.dx, DRIVE_RANGE[0], 'the treads stop at the end of the drive');
  assert.ok(excavatorPose(geo, -20, 0).B[1] > rest.B[1], 'negative arm angle = lower');
});

test('piles and restocking: sizes grow with scoops; new treasures go on free slots only', () => {
  const a = pileDims(1), b = pileDims(4), f = pileDims(4, true);
  assert.ok(b.w > a.w && b.h > a.h);
  assert.ok(f.w > b.w && f.h < b.h, 'patted flat: wider and lower');
  assert.equal(pileDims(99).n, PILE_MAX);
  assert.ok(fillRadius(8) > fillRadius(1));
  const picks = restockPicks(['gem', 'fossil'], ['treasure-2', 'treasure-5'], 3, createRng(1));
  assert.equal(picks.length, 2);
  assert.deepEqual(picks.map((p) => p[1]).sort(), ['treasure-2', 'treasure-5']);
  assert.deepEqual(restockPicks(['gem'], ['treasure-1'], 2, createRng(9)), restockPicks(['gem'], ['treasure-1'], 2, createRng(9)));
  assert.equal(FULL, 15);
});
