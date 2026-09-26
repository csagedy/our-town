// Synth SFX: every recipe builds a sound graph that is wired to the bus, uses
// soft envelopes (>= 5ms attack, ends silent), stays in audible, non-harsh
// ranges, and cleans up after itself. Also the play() API, pitch variation and
// the pentatonic plink walk.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioContext, FakeParam, reaches } from './fake-audio.mjs';
import { createAudioCore } from '../../src/audio/context.js';
import {
  createSfx, renderInto, RECIPES, SOUND_NAMES, pentatonicFreq, MIN_ATTACK, WALK_RANGE,
} from '../../src/audio/sfx.js';

function seeded(seed = 1) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function runningCore() {
  class AC extends FakeAudioContext { constructor() { super({ state: 'running' }); } }
  return createAudioCore({ AudioContext: AC, document: new EventTarget(), now: () => 0 });
}

test('there are at least 15 sounds, including the requested families', () => {
  assert.ok(SOUND_NAMES.length >= 15, `${SOUND_NAMES.length} sounds`);
  for (const n of ['pop', 'boing', 'squish', 'sparkle', 'whoosh', 'plink', 'clink', 'sizzle', 'cheer']) {
    assert.ok(SOUND_NAMES.includes(n), n);
  }
});

for (const name of SOUND_NAMES) {
  test(`recipe "${name}" builds a sound, soft and complete`, () => {
    for (const seed of [1, 2, 3]) {
      const ctx = new FakeAudioContext({ state: 'running' });
      ctx.currentTime = 10;
      const out = ctx.createGain();
      out.connect(ctx.destination);
      const before = ctx.nodes.length;
      const v = renderInto(ctx, out, name, {}, { random: seeded(seed) });
      const made = ctx.nodes.slice(before);
      assert.ok(made.length > 0);
      assert.ok(made.length <= 80, `node count ${made.length} (old iPads)`);

      // Every source starts no earlier than now, stops, and is heard.
      const sources = ctx.sources().filter((s) => made.includes(s));
      assert.ok(sources.length > 0);
      for (const s of sources) {
        assert.ok(s.startedAt >= 10, `${s.kind} starts in the future`);
        assert.ok(s.stoppedAt > s.startedAt, `${s.kind} is stopped`);
        assert.ok(reaches(s, out), `${s.kind} reaches the output`);
      }
      assert.ok(v.end - v.t <= RECIPES[name].dur + 1e-9, `length ${v.end - v.t} <= dur ${RECIPES[name].dur}`);
      assert.ok(v.last && v.last.stoppedAt === v.end, 'last source is tracked for cleanup');

      // Nothing new connects to anything outside this sound.
      for (const n of made) {
        for (const o of n.outputs) {
          const dest = o instanceof FakeParam ? o.node : o;
          assert.ok(made.includes(dest) || dest === out, `${n.kind} connects only inside the sound`);
        }
      }

      // Envelopes: gains that fade in from silence take >= 5ms, never exceed
      // 0.6, and every such envelope ends back at (near) silence.
      for (const n of made.filter((x) => x.kind === 'gain')) {
        const ev = n.gain.events;
        if (!ev.length || !reaches(n, out)) continue;              // modulation depth gains
        if (n.outputs.some((o) => o instanceof FakeParam)) continue;
        assert.ok(n.gain.max() <= 0.6, `${name}: gain peak ${n.gain.max()}`);
        for (let i = 0; i < ev.length - 1; i++) {
          if (ev[i].type === 'set' && ev[i].v <= 0.001 && ev[i + 1].type === 'lin' && ev[i + 1].v > 0.01) {
            const attack = ev[i + 1].t - ev[i].t;
            assert.ok(attack >= MIN_ATTACK - 1e-9, `${name}: ${attack * 1000}ms attack`);
          }
        }
        assert.ok(ev[ev.length - 1].v <= 0.001, `${name}: envelope ends silent`);
      }

      // Oscillators stay in a comfortable range: nothing sub-bass or shrill.
      for (const o of made.filter((x) => x.kind === 'osc')) {
        // Modulators (vibrato LFOs, FM operators) feed a param, not the output.
        const isLfo = o.outputs.every((d) => d.kind === 'gain' && d.outputs.every((p) => p instanceof FakeParam));
        for (const e of [...o.frequency.events, { v: o.frequency.value }]) {
          if (isLfo) assert.ok(e.v > 0 && e.v <= 12000, `modulator at ${e.v}Hz`);
          else assert.ok(e.v >= 40 && e.v <= 7000, `${name}: osc at ${e.v}Hz`);
        }
        if (!isLfo) assert.ok(['sine', 'triangle'].includes(o.type), `${name}: soft waveform, got ${o.type}`);
      }
    }
  });
}

test('unknown sound: renderInto throws, play() warns and returns null', () => {
  const ctx = new FakeAudioContext();
  assert.throws(() => renderInto(ctx, ctx.destination, 'kaboom'), /unknown sound/);
  const sfx = createSfx(runningCore());
  const warn = console.warn;
  let warned = '';
  console.warn = (m) => { warned = m; };
  try {
    assert.equal(sfx.play('kaboom'), null);
  } finally {
    console.warn = warn;
  }
  assert.match(warned, /kaboom/);
});

test('play() connects to the sfx bus, counts voices and cleans up when done', () => {
  const core = runningCore();
  const sfx = createSfx(core);
  const h = sfx.play('boing', { pan: 0.5 });
  assert.ok(h);
  const { ctx, sfx: bus } = core.get(false);
  assert.equal(sfx.activeVoices(), 1);
  const srcs = ctx.sources();
  for (const s of srcs) assert.ok(reaches(s, bus));
  assert.ok(ctx.nodes.some((n) => n.kind === 'panner' && n.pan.value === 0.5));
  srcs.forEach((s) => s.end());
  assert.equal(sfx.activeVoices(), 0);
  assert.ok(ctx.nodes.find((n) => n.kind === 'panner').disconnected);
  h.stop();   // stopping a finished sound is harmless
});

test('random pitch variation: repeats differ by up to 5%, vary:0 and pitch are exact', () => {
  const ctx = new FakeAudioContext();
  const startFreq = (opts, random) => {
    const before = ctx.nodes.length;
    renderInto(ctx, ctx.destination, 'pop', opts, { random });
    return ctx.nodes.slice(before).find((n) => n.kind === 'osc').frequency.events[0].v;
  };
  const r = seeded(7);
  const fs = Array.from({ length: 12 }, () => startFreq({}, r));
  assert.ok(new Set(fs).size > 6, 'repeats are not identical');
  for (const f of fs) assert.ok(f >= 320 * 0.95 - 1e-6 && f <= 320 * 1.05 + 1e-6, `${f}`);
  assert.equal(startFreq({ vary: 0 }, r), 320);
  assert.equal(startFreq({ vary: 0, pitch: 2 }, r), 640);
  assert.equal(startFreq({ vary: 0, pitch: 0.5 }, r), 160);
});

test('pentatonicFreq: C major pentatonic from C5', () => {
  const near = (a, b) => Math.abs(a - b) < 0.05;
  assert.ok(near(pentatonicFreq(0), 523.25));
  assert.ok(near(pentatonicFreq(1), 587.33));   // D5
  assert.ok(near(pentatonicFreq(2), 659.26));   // E5
  assert.ok(near(pentatonicFreq(3), 783.99));   // G5
  assert.ok(near(pentatonicFreq(4), 880.0));    // A5
  assert.ok(near(pentatonicFreq(5), 1046.5));   // C6
  assert.ok(near(pentatonicFreq(-1), 440.0));   // A4
});

test('repeated plinks walk the pentatonic scale in small steps (music, not noise)', () => {
  const core = runningCore();
  const sfx = createSfx(core, { random: seeded(3), maxVoices: 1000 });
  const { ctx } = core.get(true);
  const scale = new Set(Array.from({ length: 10 }, (_, i) => pentatonicFreq(i).toFixed(2)));
  const degrees = [];
  for (let i = 0; i < 40; i++) {
    ctx.currentTime = i * 0.3;
    const before = ctx.nodes.length;
    assert.ok(sfx.play('plink'));
    const f = ctx.nodes.slice(before).find((n) => n.kind === 'osc').frequency.events[0].v;
    assert.ok(scale.has(f.toFixed(2)), `${f} is in the scale`);
    degrees.push([...scale].indexOf(f.toFixed(2)));
  }
  for (let i = 1; i < degrees.length; i++) {
    assert.ok(Math.abs(degrees[i] - degrees[i - 1]) <= 2, `step ${degrees[i - 1]} -> ${degrees[i]}`);
  }
  assert.ok(new Set(degrees).size >= 4, 'the melody moves around');
  assert.ok(degrees.every((d) => d >= WALK_RANGE[0] && d <= WALK_RANGE[1]));
  // A specific note on request.
  const before = ctx.nodes.length;
  sfx.play('plink', { note: 5 });
  assert.equal(ctx.nodes.slice(before).find((n) => n.kind === 'osc').frequency.events[0].v, pentatonicFreq(5));
});

test('nothing is scheduled while locked, muted, or over the voice limit', () => {
  let clock = 0;
  const core = createAudioCore({ AudioContext: FakeAudioContext, document: new EventTarget(), now: () => clock });
  const sfx = createSfx(core, { maxVoices: 3 });
  assert.equal(sfx.play('pop'), null, 'suspended and no gesture yet');
  core.gesture();                       // the tap that unlocks
  assert.ok(sfx.play('pop'), 'sound in the unlocking gesture is kept');
  core.setMuted(true);
  assert.equal(sfx.play('pop'), null, 'muted');
  core.setMuted(false);
  assert.ok(sfx.play('pop'));
  assert.ok(sfx.play('pop'));
  assert.equal(sfx.play('pop'), null, 'voice limit');
  assert.equal(sfx.stats.played, 3);
  assert.equal(sfx.stats.dropped, 3);
});
