// Audio core: bus graph, iOS unlock/resume logic, mute. Runs against the fake
// Web Audio API in fake-audio.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioContext, reaches } from './fake-audio.mjs';
import { buildGraph, createAudioCore, MASTER_VOLUME, GESTURE_EVENTS } from '../../src/audio/context.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup({ ctxState = 'suspended' } = {}) {
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const window = new EventTarget();
  let clock = 1000;
  class AC extends FakeAudioContext { constructor() { super({ state: ctxState }); } }
  const core = createAudioCore({ AudioContext: AC, document, window, now: () => clock });
  return { core, document, window, advance: (ms) => { clock += ms; } };
}

test('buildGraph: every bus goes through a gentle compressor and the master gain to the speakers', () => {
  const ctx = new FakeAudioContext();
  const g = buildGraph(ctx);
  for (const bus of [g.sfx, g.clips, g.music]) {
    assert.deepEqual(bus.outputs, [g.compressor]);
    assert.ok(reaches(bus, ctx.destination));
  }
  assert.deepEqual(g.compressor.outputs, [g.master]);
  assert.deepEqual(g.master.outputs, [ctx.destination]);
  assert.equal(g.master.gain.value, MASTER_VOLUME);
  assert.ok(g.compressor.ratio.value <= 4, 'gentle ratio');
  assert.ok(g.compressor.threshold.value >= -24 && g.compressor.threshold.value <= -12);
  assert.ok(g.compressor.attack.value >= 0.003, 'not so fast it crunches transients');
  assert.equal(buildGraph(new FakeAudioContext(), { muted: true }).master.gain.value, 0);
});

test('no context is created until needed; state reports none', () => {
  const { core } = setup();
  assert.equal(core.state(), 'none');
  assert.equal(core.get(false), null);
  assert.equal(core.canPlay(), false);
});

test('unsupported browsers degrade to a null graph, never a throw', () => {
  const core = createAudioCore({ global: {}, document: new EventTarget(), now: () => 0 });
  assert.equal(core.get(), null);
  assert.equal(core.state(), 'unsupported');
  core.gesture();
  assert.equal(core.canPlay(), false);
});

for (const type of GESTURE_EVENTS) {
  test(`a ${type} creates and resumes the context`, async () => {
    const { core, document } = setup();
    core.install();
    document.dispatchEvent(new Event(type));
    const { ctx } = core.get(false);
    assert.equal(ctx.calls.resume, 1);
    assert.ok(core.canPlay(), 'a sound in the same gesture may be scheduled');
    await tick();
    assert.equal(core.state(), 'running');
    // Silent one-sample kick played inside the gesture (old iOS unlock).
    const kick = ctx.sources()[0];
    assert.equal(kick.kind, 'buffer');
    assert.equal(kick.startedAt, 0);
    assert.deepEqual(kick.outputs, [ctx.destination]);
  });
}

test('install is idempotent and a running context is not resumed again', async () => {
  const { core, document } = setup();
  core.install();
  core.install();
  document.dispatchEvent(new Event('pointerup'));
  await tick();
  const { ctx } = core.get(false);
  assert.equal(ctx.calls.resume, 1);
  document.dispatchEvent(new Event('touchend'));
  document.dispatchEvent(new Event('click'));
  assert.equal(ctx.calls.resume, 1);
});

test('an interrupted context (phone call, Siri) comes back on the next tap', async () => {
  const { core, document } = setup();
  core.install();
  document.dispatchEvent(new Event('pointerup'));
  await tick();
  const { ctx } = core.get(false);
  ctx._setState('interrupted');
  assert.equal(core.state(), 'interrupted');
  document.dispatchEvent(new Event('touchend'));
  assert.equal(ctx.calls.resume, 2);
  await tick();
  assert.equal(core.state(), 'running');
});

test('a refused resume is retried on every later gesture', async () => {
  const { core, document, advance } = setup();
  core.install();
  const a = core.get(true);
  a.ctx.resumeResult = 'reject';
  document.dispatchEvent(new Event('pointerup'));
  await tick();
  assert.equal(core.state(), 'suspended');
  advance(5000);
  assert.equal(core.canPlay(), false, 'long after the gesture, sounds are dropped, not queued');
  a.ctx.resumeResult = 'running';
  document.dispatchEvent(new Event('click'));
  await tick();
  assert.equal(a.ctx.calls.resume, 2);
  assert.equal(core.state(), 'running');
});

test('hidden page suspends; visible again tries to resume', async () => {
  const { core, document } = setup();
  core.install();
  document.dispatchEvent(new Event('pointerup'));
  await tick();
  const { ctx } = core.get(false);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(ctx.calls.suspend, 1);
  assert.equal(core.state(), 'suspended');
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(ctx.calls.resume, 2);
  assert.equal(core.state(), 'running');
});

test('a closed context is rebuilt on the next gesture', async () => {
  const { core, document } = setup();
  core.install();
  document.dispatchEvent(new Event('pointerup'));
  await tick();
  const first = core.get(false).ctx;
  await first.close();
  document.dispatchEvent(new Event('pointerup'));
  await tick();
  const second = core.get(false).ctx;
  assert.notEqual(first, second);
  assert.equal(core.state(), 'running');
  assert.equal(core.stats.recreated, 1);
});

test('mute ramps the master gain to 0 and back to the volume', () => {
  const { core } = setup();
  const g = core.get(true);
  core.setMuted(true);
  assert.equal(core.isMuted(), true);
  const last = () => g.master.gain.events.filter((e) => e.type === 'target').pop();
  assert.equal(last().v, 0);
  core.setMuted(false);
  assert.equal(last().v, MASTER_VOLUME);
  core.setVolume(0.4);
  assert.equal(last().v, 0.4);
  core.setVolume(7);
  assert.equal(core.getVolume(), 1);
});

test('gesture hooks run on each gesture (speech priming)', () => {
  const { core, document } = setup();
  let n = 0;
  core.onGesture(() => { n++; });
  core.onGesture(() => { throw new Error('a bad hook must not break audio'); });
  core.install();
  document.dispatchEvent(new Event('pointerup'));
  document.dispatchEvent(new Event('touchend'));
  assert.equal(n, 2);
});
