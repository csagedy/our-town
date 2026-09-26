// Unit: the construction site's big machines (P2c.2), pure parts: the tower
// crane geometry, pendulum and grab/landing rules (src/core/crane.js), and
// the wrecking ball's swing and knock-down plan (src/core/wreck.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  craneGeom, clampHook, pieceTransforms, swingStep, swingSettled, approach, contactBelow, thingAt, landingUnder, hookLayout, swingLength,
} from '../../src/core/crane.js';
import { pullOf, ballPos, swingPath, angleAt, ballAt, planWreck, circleHitsBox, halfPeriod, L_MIN, L_MAX } from '../../src/core/wreck.js';
import { shapeOf, anchorAt } from '../../src/core/buildgrid.js';
import { createRng } from '../../src/engine/random.js';
import { createStore } from '../../src/engine/store.js';

const manifest = JSON.parse(readFileSync(new URL('../../assets/art-manifest.json', import.meta.url)));
const m = manifest.rooms.site;
const G = m.grid;
const geo = craneGeom(m.rigs.towerCrane);
const WB = m.rigs.wreckingBall;
const GY = 935 - WB.ballRadius;

test('crane geometry: rest, reach, clamping', () => {
  assert.deepEqual(geo.rest.map(Math.round), [578, 493]);
  assert.ok(geo.x0 < geo.rest[0] && geo.rest[0] < geo.x1);
  assert.ok(geo.y1 > G.y - 10 && geo.y1 < G.y, 'the hook reaches right down to the deck');
  assert.deepEqual(clampHook(geo, -100, 5000), { x: Math.round(geo.x0 * 10) / 10, y: Math.round(geo.y1 * 10) / 10 });
  assert.deepEqual(clampHook(geo, 600, 500), { x: 600, y: 500 });
});

test('crane transforms: at rest nothing moves; lower = longer cable, the hook goes down by as much', () => {
  const hook = m.pieces['crane-hook'];
  const t0 = pieceTransforms(geo, geo.grab[0], geo.grab[1], 0, hook);
  assert.equal(t0.trolley, 'translate3d(0px, 0px, 0px)');
  assert.match(t0.cable, /scale\(1, 1\)$/);
  assert.equal(t0.hook, 'translate3d(0px, 0px, 0px) translate3d(0px, 0px, 0px)');
  const t1 = pieceTransforms(geo, geo.grab[0] + 100, geo.grab[1] + 200, 0.1, hook);
  assert.match(t1.trolley, /translate3d\(100px/);
  const s = Number(/scale\(1, ([\d.]+)\)/.exec(t1.cable)[1]);
  assert.ok(Math.abs(s - (geo.cableLength + 200) / geo.cableLength) < 0.002);
  assert.match(t1.hook, /translate3d\(0px, 200px, 0px\)$/);
  assert.match(t1.hook, /rotate\(-5\.73deg\)/, 'a load out to the right = counter-clockwise on screen');
});

test('pendulum: a trolley that speeds up leaves the load behind; it settles by itself', () => {
  let s = { th: 0, w: 0 };
  const L = swingLength(geo, 500, 40);
  for (let i = 0; i < 10; i++) s = swingStep(s, 1 / 60, L, 3000);    // trolley speeds up to the right
  assert.ok(s.th < -0.01, 'the load lags to the left');
  let n = 0;
  while (!swingSettled(s) && n < 2000) { s = swingStep(s, 1 / 60, L, 0); n++; }
  assert.ok(n < 1200, `settles within 20 s (${n} frames)`);
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(9, 10, 3), 10);
});

test('grab and landing rules', () => {
  const things = [{ id: 'a', x0: 100, x1: 140, top: 840, bottom: 880 }, { id: 'b', x0: 100, x1: 140, top: 800, bottom: 840, rank: 2 }, { id: 'c', x0: 300, x1: 340, top: 700, bottom: 880 }];
  assert.equal(contactBelow(things, 120, 500).id, 'b', 'the top of the tower is touched first');
  assert.equal(contactBelow(things, 200, 500), null);
  assert.equal(contactBelow(things, 320, 800), null, 'nothing below the hook there');
  assert.equal(thingAt(things, 120, 820).id, 'b');
  assert.equal(thingAt(things, 120, 790).id, 'b', 'a near miss above the top still catches');
  assert.equal(thingAt(things, 200, 820), null);
  const surf = [{ id: 'deck', x0: 230, x1: 870, y: 880 }, { id: 'shelf', x0: 100, x1: 200, y: 574 }];
  assert.deepEqual(landingUnder(surf, 150, 500, 915).y, 574);
  assert.deepEqual(landingUnder(surf, 150, 600, 915).y, 915, 'below the shelf already: the floor');
  assert.deepEqual(landingUnder(surf, 400, 600, 915).y, 880);
  const lay = hookLayout([{ id: 'x', h: 46, char: false }]);
  assert.deepEqual(lay.get('x'), { x: 0, y: 38, z: 10, scale: 1, front: false, hidden: false });
  const two = hookLayout([{ id: 'x', h: 46 }, { id: 'y', h: 250, char: true }]);
  assert.ok(two.get('x').x < 0 && two.get('y').x > 0 && two.get('y').y > 200);
});

test('wrecking ball: pull, swing path, angle and ground skid', () => {
  const p = pullOf(WB.tip, 1853, 733, { gy: GY });
  assert.ok(p.L > 600 && p.L < 720 && p.a0 > 0.8 && p.a0 < 1, JSON.stringify(p));
  assert.equal(pullOf(WB.tip, WB.tip[0], WB.tip[1] + 10).L, L_MIN);
  assert.equal(pullOf(WB.tip, WB.tip[0] + 5000, WB.tip[1]).L, L_MAX);
  const path = swingPath(p);
  assert.equal(angleAt(path, 0), p.a0);
  assert.ok(Math.abs(angleAt(path, path.halves[0].dur) - path.halves[0].b) < 1e-9, 'first half-swing ends on the far side');
  assert.ok(path.halves[0].b < -0.7 * p.a0, 'the first return keeps most of the pull');
  assert.equal(angleAt(path, path.end + 10), 0);
  assert.ok(path.end < 12000, 'it comes to rest within a few swings');
  assert.ok(Math.abs(halfPeriod(301) - Math.PI * Math.sqrt(301 / 2400) * 1000) < 1e-6);
  const low = ballPos(WB.tip, 800, 0, GY);
  assert.equal(low.y, GY, 'a long chain skids along the ground');
  assert.ok(circleHitsBox(0, 0, 10, [5, -5, 20, 5]) && !circleHitsBox(0, 0, 10, [11, -5, 20, 5]));
  const b = ballAt(path, WB.tip, GY, path.halves[0].dur);
  assert.ok(b.x < WB.tip[0] - 400, 'swings well over to the build side');
});

// A 4-block tower at column 15 (bottom locked) + two characters on the floor.
function scene() {
  const S = shapeOf(manifest.props['block-1x1'].snap, G.cell);
  const pieces = [0, 1, 2, 3].map((r) => Object.assign({ id: 'p' + r, c: 15, r, shape: S, locked: r === 0 }, anchorAt(G, 1, 15, r)));
  const chars = [
    { id: 'rosa', x: 960, y: 930, box: [930, 700, 990, 930], floor: true },
    { id: 'far', x: 2500, y: 930, box: [2470, 700, 2530, 930], floor: true },
  ];
  return { pieces, chars };
}
const OPTS = (rng) => ({ tip: WB.tip, gy: GY, radius: WB.ballRadius, grid: G, width: m.width, rng, pull: pullOf(WB.tip, 1853, 733, { gy: GY }) });

test('wreck plan: knocks the tower down, the locked piece wobbles and stays, a character spins', () => {
  const { pieces, chars } = scene();
  const plan = planWreck(pieces, chars, OPTS(createRng(7)));
  const by = (kind) => plan.hits.filter((h) => h.kind === kind);
  assert.deepEqual(by('knock').map((h) => h.id).sort(), ['p1', 'p2', 'p3']);
  assert.ok(by('wobble').some((h) => h.id === 'p0'), 'the locked piece wobbles');
  assert.ok(!plan.hits.some((h) => h.id === 'p0' && h.kind !== 'wobble'), 'and stays put');
  assert.deepEqual(by('char').map((h) => h.id), ['rosa'], 'only what the ball reaches');
  for (const h of by('knock')) {
    assert.ok(h.x < h.fx, 'knocked the way the ball was going (to the left)');
    assert.ok(h.y >= 900 && h.y <= 948, 'lands on the floor, off the grid');
    assert.ok(Math.abs(h.spin) >= 360 && h.spin % 360 === 0, 'lands upright');
  }
  const t = Object.fromEntries(by('knock').map((h) => [h.id, h.t]));
  assert.ok(t.p1 <= t.p2 && t.p2 <= t.p3, 'from the bottom up');
  for (let i = 1; i < plan.hits.length; i++) assert.ok(plan.hits[i - 1].t <= plan.hits[i].t, 'hits in time order');
});

test('wreck plan is deterministic in its rng (pre-rolled: two iPads agree through the ops)', () => {
  const a = planWreck(...Object.values(scene()), OPTS(createRng(42)));
  const b = planWreck(...Object.values(scene()), OPTS(createRng(42)));
  const c = planWreck(...Object.values(scene()), OPTS(createRng(43)));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.hits.map((h) => h.x), c.hits.map((h) => h.x));
  // Both iPads apply the same ops (the plan in a set, then moves) and end up the same.
  const apply = (store) => {
    store.dispatch('spawn', { id: 'd:1', kind: 'site-fixtures', room: 'construction/fixtures', x: 0, y: 0 });
    for (const p of scene().pieces) store.dispatch('spawn', { id: 'd:' + p.id, kind: 'block-1x1', room: 'construction/yard', x: p.x, y: p.y });
  };
  const s1 = createStore({ device: 'd' }), s2 = createStore({ device: 'd' });
  apply(s1); apply(s2);
  const ops = [['set', { id: 'd:1', path: 'props.wreck', value: a }], ...a.hits.filter((h) => h.kind === 'knock').map((h) => ['move', { id: 'd:' + h.id, room: 'construction/yard', x: h.x, y: h.y, z: 0 }])];
  for (const [op, args] of ops) s1.dispatch(op, args);
  for (const [op, args] of ops) s2.dispatch(op, args);
  assert.deepEqual(s1.state.entities, s2.state.entities);
});

test('a locked piece holds up what rests on it; an unlocked piece under it goes, and it settles down', () => {
  const { pieces } = scene();
  pieces[0].locked = false;
  pieces[2].locked = true;           // rows: 0 free, 1 free, 2 locked, 3 free
  // A pull that only reaches low (a ground skid): hits rows 0 and 1.
  const plan = planWreck(pieces, [], Object.assign(OPTS(createRng(1)), { pull: pullOf(WB.tip, 2150, 900, { gy: GY }) }));
  const knocked = plan.hits.filter((h) => h.kind === 'knock').map((h) => h.id).sort();
  assert.ok(knocked.includes('p0'), JSON.stringify(plan.hits));
  assert.ok(!knocked.includes('p2') && !knocked.includes('p3'), 'the locked piece and the one on it stay');
  const settle = plan.hits.filter((h) => h.kind === 'settle');
  assert.deepEqual(settle.map((h) => h.id).sort(), ['p2', 'p3']);
  assert.equal(settle.find((h) => h.id === 'p2').r, 0, 'the locked piece comes down to the deck');
});
