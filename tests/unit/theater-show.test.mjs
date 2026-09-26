// Unit: the pure rules of the theater show (P2b.2, src/scenes/theater-show.js):
// spotlight colours and spots, who stands in the light, the scene cycle, the
// effect particle plans (bounded, transform/opacity paths) and the ambience.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPOT_COLORS, nextColor, colorOf, spotPerm, nearestRest, dropSpot, litLamps, lampOver, nextScene,
  plan, ambientBits, AMBIENCE, EFFECT_OF, SHOW_CAP, AMBIENCE_MS, AMBIENCE_EVERY, showArt,
} from '../../src/scenes/theater-show.js';
import { RECIPES } from '../../src/audio/sfx.js';
import { FX_TYPES } from '../../src/engine/fx.js';

const m = JSON.parse(readFileSync(new URL('../../assets/art-manifest.json', import.meta.url))).rooms.theater;
const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

test('spotlight colours cycle off -> white -> pink -> blue -> gold -> off, matching the manifest', () => {
  assert.deepEqual(SPOT_COLORS, m.rigs.spotlights.colors);
  for (const c of SPOT_COLORS) assert.ok(m.pieces.spotlight.variants[c], c);
  const seen = ['off'];
  for (let i = 0; i < 5; i++) seen.push(nextColor(seen[seen.length - 1]));
  assert.deepEqual(seen, ['off', 'white', 'pink', 'blue', 'gold', 'off']);
  assert.equal(colorOf({ spot1: 'pink' }, 1), 'pink');
  assert.equal(colorOf({ spot1: 'purple' }, 1), 'off');
  assert.equal(colorOf({}, 0), 'off');
});

test('spots: a permutation string; dropping a lamp on a taken spot swaps the two', () => {
  assert.deepEqual(spotPerm(undefined), [0, 1, 2]);
  assert.deepEqual(spotPerm('210'), [2, 1, 0]);
  assert.deepEqual(spotPerm('112'), [0, 1, 2], 'not a permutation: identity');
  assert.deepEqual(spotPerm('01'), [0, 1, 2]);
  const rest = m.rigs.spotlights.rest;
  assert.equal(nearestRest(1700, rest), 2);
  assert.equal(nearestRest(1100, rest), 0);
  assert.equal(nearestRest(1330, rest), 0);
  assert.equal(nearestRest(1331, rest), 1);
  assert.equal(dropSpot([0, 1, 2], 0, 2), '210');
  assert.equal(dropSpot([0, 1, 2], 1, 1), '012', 'back where it was');
  assert.equal(dropSpot([2, 1, 0], 2, 1), '201');
});

test('in the light: a character within reach of a lit lamp, the nearest one', () => {
  const rest = m.rigs.spotlights.rest;
  const lit = litLamps({ spot0: 'gold', spot2: 'blue', spots: '210' }, rest);
  assert.deepEqual(lit, [{ copy: 0, x: 1708, color: 'gold' }, { copy: 2, x: 1204, color: 'blue' }]);
  assert.equal(lampOver({ x: 1290 }, lit).copy, 2);
  assert.equal(lampOver({ x: 1456 }, lit), null, 'the middle lamp is off');
  assert.equal(lampOver({ x: 1650 }, lit).color, 'gold');
  assert.deepEqual(litLamps({}, rest), []);
});

test('scenes cycle through the manifest backdrop, each with an ambience sound and particles', () => {
  const scenes = m.rigs.backdrop.scenes;
  assert.equal(nextScene('stars', scenes), 'castle');
  assert.equal(nextScene('city', scenes), 'stars');
  assert.equal(nextScene('nope', scenes), scenes[0]);
  for (const s of scenes) {
    assert.ok(m.pieces.backdrop.variants[s], s);
    assert.ok(AMBIENCE[s], `${s} has an ambience`);
    assert.ok(RECIPES[AMBIENCE[s].sound], `${s}: sound ${AMBIENCE[s].sound}`);
    const bits = ambientBits(AMBIENCE[s].fx, [1030, 180, 850, 450], seeded(3));
    assert.ok(bits.length >= 1 && bits.length <= 2);
    for (const b of bits) assert.ok(FX_TYPES.includes(b.type), b.type);
  }
  // Finite: sound plays about 3 times, and it all ends by AMBIENCE_MS.
  assert.ok(AMBIENCE_MS <= 12000 && Math.ceil((AMBIENCE_MS - 1500) / AMBIENCE_EVERY) <= 3);
  for (const s of ['thunder', 'gasp', 'laugh', 'waves', 'breeze', 'crickets', 'traffic']) assert.ok(RECIPES[s], s);
});

test('effect plans: bounded particle counts inside the pool cap, known shapes, paths that end invisible', () => {
  const rig = {
    fog: m.rigs.effects.fog, confetti: m.rigs.effects.confetti,
    opening: [m.rigs.curtain.opening[0], m.rigs.curtain.opening[0] + m.rigs.curtain.opening[2]], snowTop: 200, floor: 796,
  };
  let total = 0;
  for (const e of ['fog', 'confetti', 'snow']) {
    const p = plan(e, rig, seeded(7));
    assert.ok(p.length > 0 && p.length <= 20, `${e}: ${p.length}`);
    total += p.length;
    for (const q of p) {
      assert.ok(FX_TYPES.includes(q.type), q.type);
      assert.ok(q.steps.length >= 2);
      assert.equal(q.steps[q.steps.length - 1].o, 0, `${e} fades out at the end`);
      assert.ok(q.life > 0 && q.life < 5000);
      assert.ok(q.delay >= 0 && q.delay < 4000);
    }
  }
  assert.ok(total <= SHOW_CAP, `fog + confetti + snow at once (${total}) fit the pool (${SHOW_CAP})`);
  assert.deepEqual(plan('thunder', rig), []);
  // Snow falls inside the proscenium opening; confetti lands on the stage.
  for (const q of plan('snow', rig, seeded(2))) assert.ok(q.x >= rig.opening[0] && q.x <= rig.opening[1]);
  for (const q of plan('confetti', rig, seeded(2))) assert.ok(Math.abs(q.y + q.steps[2].dy - 796) < 20);
});

test('every machine and console button fires an effect; the fly rope is a real touch target', () => {
  for (const pid of Object.keys(EFFECT_OF)) assert.ok(m.pieces[pid], pid);
  const [rope] = showArt();
  assert.equal(rope.id, 'hit:fly-rope');
  assert.ok(rope.w >= 40 && rope.h >= 200);
});
