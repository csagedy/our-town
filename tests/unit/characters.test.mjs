// P1.10: the character model (src/engine/char-model.js): cast props, what a
// character holds and wears, pose composition, placement boxes, seats,
// taste, and spawning through store ops (so it saves and replays).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  castProps, partsOf, specOf, composePose, danglePose, lerpPose, sameOrder, poseBox, anchorOffset,
  normalizeSeats, seatNear, tasteOf, reactionsFor, spawnCharacter, seedCharacters, wearSlotOf, appearanceKey, CHAR_KIND,
} from '../../src/engine/char-model.js';
import { renderCharacter } from '../../src/engine/rig-svg.js';
import { createStore } from '../../src/engine/store.js';
import { childrenOf, getEntity, applyAll, createWorld } from '../../src/engine/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rig = JSON.parse(readFileSync(path.join(ROOT, 'assets/characters/rig.json'), 'utf8'));

test('castProps: clothes stay props, removable pieces become worn children with their colours', () => {
  const { props, pieces } = castProps(rig, 'grownup');
  assert.equal(props.body, 'adult');
  assert.deepEqual(Object.keys(props.wear).sort(), ['bottom', 'shoes', 'top']);
  assert.deepEqual(pieces.map((p) => [p.kind, p.slot]), [['apron', 'over']]);
  assert.ok(pieces[0].colors.over, 'the butter apron colour travels with the apron');
  assert.equal(props.colors.over, undefined);
  assert.equal(props.pose, 'stand');
  assert.equal(props.taps, 0);
  const boy = castProps(rig, 'boy5');
  assert.deepEqual(boy.pieces.map((p) => p.kind), ['towel-cape']);
  assert.equal(wearSlotOf(rig, 'hero-cape'), 'back');
  assert.equal(wearSlotOf(rig, 'tee-star'), null, 'a top is not a removable piece');
  assert.equal(wearSlotOf(rig, 'cupcake'), null);
});

test('P2c wearables: tool belt, gloves and the hero suit are worn children that draw on every body and pose', () => {
  assert.equal(wearSlotOf(rig, 'tool-belt'), 'belt');
  assert.equal(wearSlotOf(rig, 'gloves'), 'hands');
  assert.equal(wearSlotOf(rig, 'hero-suit'), 'top', 'a costume top is worn over the base top');
  const { props } = castProps(rig, 'dad');
  const withTop = Object.assign({}, props, { colors: Object.assign({}, props.colors, { top: '#123456', 'top-2': '#654321' }) });
  const kids = [
    { id: 'a', kind: 'tool-belt', slot: 'wear-belt', props: {} },
    { id: 'b', kind: 'gloves', slot: 'wear-hands', props: {} },
    { id: 'c', kind: 'hero-suit', slot: 'wear-top', props: {} },
    { id: 'd', kind: 'cupcake', slot: 'hand-l', props: {} },
  ];
  const { held, worn } = partsOf(kids, rig);
  assert.deepEqual(Object.keys(worn).sort(), ['belt', 'hands', 'top']);
  const spec = specOf(withTop, worn);
  assert.equal(spec.wear.top, 'hero-suit');
  assert.equal(spec.colors.top, undefined, 'the suit keeps its own teal, not the tee colour');
  assert.equal(specOf(withTop, {}).wear.top, props.wear.top, 'off again: the own top is back');
  for (const body of Object.keys(rig.bodies)) {
    for (const pose of Object.keys(rig.poses)) {
      const out = renderCharacter(rig, Object.assign({}, spec, { body }), { pose: composePose(rig, pose, held), held: { L: '<circle r="10"/>' }, marks: true });
      for (const w of ['belt', 'hands', 'top']) assert.ok(out.svg.includes(`data-w="${w}"`), `${body} ${pose}: ${w} tagged`);
      assert.equal((out.svg.match(/data-f="hand[LR]"/g) || []).length, 2, 'one glove per hand, in the hand frames');
      assert.ok(!/NaN|undefined/.test(out.svg), `${body} ${pose}: clean svg`);
    }
  }
  const plain = renderCharacter(rig, specOf(props, {}), { marks: true });
  assert.ok(!plain.svg.includes('data-w="top"'), 'an ordinary top is not a removable piece');
});

test('partsOf / specOf: held items by hand, worn pieces merged into the rig spec', () => {
  const { props } = castProps(rig, 'girl9');
  const kids = [
    { id: 'a', kind: 'cupcake', slot: 'hand-r', props: {} },
    { id: 'b', kind: 'crown', slot: 'wear-hat', props: { colors: { hat: '#123456' } } },
    { id: 'c', kind: 'cupcake', slot: 'wear-hat', props: {} },   // not a hat: ignored
  ];
  const { held, worn } = partsOf(kids, rig);
  assert.equal(held.R.id, 'a');
  assert.equal(held.L, null);
  assert.equal(worn.hat.id, 'b');
  const spec = specOf(props, worn);
  assert.equal(spec.wear.hat, 'crown');
  assert.equal(spec.wear.top, 'tee-stripe');
  assert.equal(spec.colors.hat, '#123456');
  // It renders, every pose, with a held item.
  for (const pose of Object.keys(rig.poses)) {
    const out = renderCharacter(rig, spec, { pose: composePose(rig, pose, held), held: { R: '<circle r="10"/>' }, marks: true });
    assert.ok(out.svg.includes('data-w="hat"'), 'the worn hat is tagged for hit testing');
  }
  assert.notEqual(appearanceKey(props), appearanceKey(Object.assign({}, props, { skin: ['#000', '#111'] })));
  assert.equal(appearanceKey(props), appearanceKey(Object.assign({}, props, { expr: 'sad', taps: 9 })), 'expression and taps do not rebuild');
});

test('composePose: a holding arm comes up in front, a raised one goes up; lying keeps its arms', () => {
  const p = composePose(rig, 'stand', { L: {} });
  assert.deepEqual(p.armL, rig.poses.hold.armL);
  assert.deepEqual(p.armR, rig.poses.stand.armR);
  assert.deepEqual(p.front, ['L']);
  const up = composePose(rig, 'stand', { R: {} }, 'R');
  assert.deepEqual(up.armR, [160, -48, 0]);
  assert.deepEqual(up.front, []);
  const sit = composePose(rig, 'sit', { R: {} });
  assert.equal(sit.anchor, 'seat');
  assert.equal(sit.legsFront, true);
  assert.deepEqual(sit.front, ['R']);
  assert.equal(composePose(rig, 'lie', { L: {} }), rig.poses.lie);
  assert.equal(rig.poses.stand.front, undefined, 'the rig data is not mutated');
  const d = danglePose(rig, {});
  assert.equal(d.ground, false);
  assert.ok(sameOrder(rig.poses.stand, d));
  assert.ok(!sameOrder(rig.poses.stand, rig.poses.hold));
  const mid = lerpPose(rig.poses.stand, rig.poses.wave, 0.5);
  assert.equal(mid.armR[0], (rig.poses.stand.armR[0] + rig.poses.wave.armR[0]) / 2);
  assert.deepEqual(lerpPose(rig.poses.stand, rig.poses.wave, 1).armR.slice(0, 3), rig.poses.wave.armR);
});

test('poseBox: placement boxes whose bottom centre is the pose anchor', () => {
  for (const body of Object.keys(rig.bodies)) {
    const h = rig.bodies[body].skeleton.height * rig.artScale;
    const stand = poseBox(rig, body, rig.poses.stand);
    assert.ok(stand.h > h * 0.9 && stand.h < h * 1.2, `${body} standing box ${stand.h} vs ${h}`);
    assert.ok(stand.w > 60 && stand.w < h, `${body} width ${stand.w}`);
    const sit = poseBox(rig, body, rig.poses.sit);
    assert.ok(sit.h < stand.h, 'sitting is shorter above its anchor');
    const lie = poseBox(rig, body, rig.poses.lie);
    assert.ok(lie.w > lie.h, 'lying is wide');
    // The mouth is above the feet, the seat just under the pelvis.
    const m = anchorOffset(rig, body, rig.poses.stand, 'mouth');
    assert.ok(m[1] < -h * 0.5);
    const s = anchorOffset(rig, body, rig.poses.stand, 'seat');
    assert.ok(s[1] < 0 && s[1] > -h * 0.6);
  }
});

test('seats: snap within reach, one character per seat; beds and sofas are for lying', () => {
  const seats = normalizeSeats([{ id: 'stool-1', at: [633, 820] }, { id: 'sofa', x: 640, y: 874, lie: true, half: 140 }, { id: 'bed-1', at: [200, 800] }]);
  assert.equal(seats[0].lie, false);
  assert.equal(seats[0].depth, 820);
  assert.equal(seats[1].x0, 500);
  assert.equal(seats[2].lie, true, 'bed ids lie down');
  assert.equal(seatNear(seats, 640, 800).id, 'stool-1');
  assert.equal(seatNear(seats, 900, 500), null);
  assert.equal(seatNear(seats, 700, 870).id, 'sofa');
  assert.equal(seatNear(seats, 640, 800, new Set(['stool-1'])).id, 'sofa', 'the stool is taken: the next nearest');
  assert.equal(seatNear(seats, 640, 800, new Set(['stool-1', 'sofa'])), null, 'all taken');
});

test('taste and reactions', () => {
  assert.equal(tasteOf(['food', 'sweet']), 'sweet');
  assert.equal(tasteOf(['food', 'ingredient']), 'weird');
  assert.equal(tasteOf(['food', 'sour']), 'weird');
  assert.equal(tasteOf(['food', 'fruit']), 'plain');
  assert.deepEqual(reactionsFor('stand'), ['giggle', 'wave', 'jump', 'happy']);
  assert.ok(!reactionsFor('sit').includes('jump'));
  assert.deepEqual(reactionsFor('lie'), ['sleepy']);
});

test('spawnCharacter / seedCharacters: store ops (worn pieces are children), replayable', () => {
  const store = createStore({ device: 'dev1' });
  const log = [];
  store.subscribe((s, env) => { if (env) log.push(env); });
  const seats = normalizeSeats([{ id: 'stool-1', at: [633, 820] }, { id: 'sofa', at: [640, 874], lie: true }]);
  const ids = seedCharacters(store, rig, {
    room: 'cafe/kitchen', seats,
    placements: [{ cast: 'girl9', seat: 'stool-1' }, { cast: 'grandpa', x: 300, y: 900 }, { cast: 'boy5', seat: 'sofa' }],
    items: [{ kind: 'hero-cape', x: 500, y: 950 }],
  });
  assert.equal(ids.length, 3);
  const girl = getEntity(store.state, ids[0]);
  assert.equal(girl.kind, CHAR_KIND);
  assert.equal(girl.props.pose, 'sit');
  assert.equal(girl.props.seat, 'stool-1');
  assert.deepEqual([girl.x, girl.y], [633, 820]);
  assert.deepEqual(childrenOf(store.state, girl.id).map((c) => [c.kind, c.slot]).sort(), [['apron', 'wear-over'], ['headband', 'wear-hat']]);
  const boy = getEntity(store.state, ids[2]);
  assert.equal(boy.props.pose, 'lie');
  assert.equal(boy.props.expr, 'sleepy');
  const grandpa = getEntity(store.state, ids[1]);
  assert.equal(grandpa.props.pose, 'stand');
  // Replaying the log gives the same world.
  const replay = applyAll(createWorld(), log);
  assert.deepEqual(replay.entities, store.state.entities);
  // Hold and eat are attach / inc ops on the children.
  const cup = store.newId();
  store.dispatch('spawn', { id: cup, kind: 'cupcake', room: 'cafe/kitchen', x: 10, y: 900 });
  assert.ok(store.dispatch('attach', { id: cup, parent: grandpa.id, slot: 'hand-l' }));
  assert.equal(partsOf(childrenOf(store.state, grandpa.id), rig).held.L.id, cup);
  assert.ok(spawnCharacter(store, rig, 'nobody', { room: 'x', x: 1, y: 1 }), 'an unknown cast id falls back to the first cast member');
});
