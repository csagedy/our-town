// Synthesized sound effects: zero bytes on disk, built from oscillators, a
// shared noise buffer and envelopes at play time.
//
//   sfx.play('boing')                       // ±5% random pitch so repeats aren't robotic
//   sfx.play('boing', { pitch: 1.5 })       // higher (ratio; 2 = an octave up)
//   sfx.play('plink')                       // next note of a pentatonic random walk
//   sfx.play('plink', { note: 3 })          // a specific scale degree (0 = C5, 5 = C6)
//   sfx.play('pop', { gain: 0.5, pan: -0.4, when: 0.1, vary: 0 })
//
// Toca-style sound rules, enforced by tests/unit/audio-sfx.test.mjs and the
// offline renders in tests/e2e/audio.test.mjs:
// - every envelope has at least a 5ms attack (no clicks) and ends in silence;
// - sine and triangle waves by default, and anything brighter or noisy goes
//   through a low-pass or band-pass filter, so nothing is harsh;
// - the tuned family (plink, bell, ding, chime, cheer, sparkle, doorbell) only
//   uses the C major pentatonic scale, so any mash of taps sounds like music.
//
// renderInto() builds a sound into any BaseAudioContext (the e2e test renders
// every sound into an OfflineAudioContext and inspects the samples).

const SILENT = 0.0001;
export const MIN_ATTACK = 0.005;
const LOOKAHEAD = 0.005;

// ---- pentatonic scale ----
const PENTA = [0, 2, 4, 7, 9];            // C D E G A
export const SCALE_BASE = 523.25;         // C5
export function pentatonicFreq(degree, base = SCALE_BASE) {
  const oct = Math.floor(degree / 5);
  const i = ((degree % 5) + 5) % 5;
  return base * Math.pow(2, oct + PENTA[i] / 12);
}
export const WALK_RANGE = [0, 9];         // two octaves, C5..A6

// ---- building blocks ----
const noiseBuffers = new WeakMap();
function noiseBuffer(ctx) {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);   // 1s, looped
    const d = buf.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;                   // xorshift32
      d[i] = ((s >>> 0) / 4294967295) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** Fade in over `attack`, optionally hold, then decay exponentially to silence at t0 + dur. */
function envelope(param, t0, peak, attack, dur, hold = 0) {
  const a = Math.max(MIN_ATTACK, attack);
  param.setValueAtTime(SILENT, t0);
  param.linearRampToValueAtTime(peak, t0 + a);
  if (hold > 0) param.setValueAtTime(peak, t0 + a + hold);
  param.exponentialRampToValueAtTime(SILENT, t0 + Math.max(dur, a + hold + 0.01));
}

function amp(v, at, peak, attack, dur, hold, dest) {
  const g = v.ctx.createGain();
  envelope(g.gain, v.t + at, peak, attack, dur, hold);
  g.connect(dest || v.out);
  return g;
}

function filter(v, { type = 'lowpass', f, q = 0.7, sweep, at = 0, fixed = false }, dest) {
  const k = fixed ? 1 : v.p;
  const t0 = v.t + at;
  const bq = v.ctx.createBiquadFilter();
  bq.type = type;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(f * k, t0);
  for (const [dt, fr] of sweep || []) bq.frequency.exponentialRampToValueAtTime(fr * k, t0 + dt);
  bq.connect(dest);
  return bq;
}

/** An oscillator with an envelope, optional pitch sweep, vibrato and filter. */
function tone(v, o) {
  const { type = 'sine', f, at = 0, dur, peak = 0.3, attack = 0.006, hold = 0, fixed = false } = o;
  const k = fixed ? 1 : v.p;
  const t0 = v.t + at;
  const stopAt = t0 + dur + 0.02;
  const osc = v.ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f * k, t0);
  for (const [dt, fr] of o.sweep || []) osc.frequency.exponentialRampToValueAtTime(fr * k, t0 + dt);
  if (o.vib) {
    const lfo = v.ctx.createOscillator();
    lfo.frequency.value = o.vib.rate;
    const depth = v.ctx.createGain();
    depth.gain.setValueAtTime(o.vib.depth * k, t0);
    if (o.vib.fade) depth.gain.exponentialRampToValueAtTime(Math.max(0.5, o.vib.depth * k * o.vib.fade), t0 + dur);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(stopAt);
    v.track(lfo, stopAt);
  }
  const g = amp(v, at, peak, attack, dur, hold, o.dest);
  osc.connect(o.filter ? filter(v, { ...o.filter, at }, g) : g);
  osc.start(t0);
  osc.stop(stopAt);
  v.track(osc, stopAt);
  return osc;
}

/** Filtered noise with an envelope. */
function noise(v, o) {
  const { at = 0, dur, peak = 0.2, attack = 0.006, hold = 0 } = o;
  const t0 = v.t + at;
  const stopAt = t0 + dur + 0.02;
  const src = v.ctx.createBufferSource();
  src.buffer = noiseBuffer(v.ctx);
  src.loop = true;
  const g = amp(v, at, peak, attack, dur, hold, o.dest);
  src.connect(filter(v, { ...(o.filter || { type: 'lowpass', f: 3000 }), at }, g));
  src.start(t0, v.rnd() * 0.9);
  src.stop(stopAt);
  v.track(src, stopAt);
  return src;
}

/** Two-operator FM bell: bright strike that mellows as the modulation decays. */
function fmBell(v, { f, at = 0, dur = 1.2, peak = 0.2, ratio = 3.5, index = 1.5 }) {
  const k = v.p;
  const t0 = v.t + at;
  const stopAt = t0 + dur + 0.02;
  const car = v.ctx.createOscillator();
  const mod = v.ctx.createOscillator();
  const modGain = v.ctx.createGain();
  car.frequency.setValueAtTime(f * k, t0);
  mod.frequency.setValueAtTime(f * k * ratio, t0);
  modGain.gain.setValueAtTime(f * k * index, t0);
  modGain.gain.exponentialRampToValueAtTime(f * k * 0.02, t0 + dur * 0.6);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  const g = amp(v, at, peak, 0.005, dur, 0);
  car.connect(g);
  for (const o of [car, mod]) { o.start(t0); o.stop(stopAt); v.track(o, stopAt); }
}

/** A soft mallet note: fundamental plus a quick, quiet overtone (marimba-ish). */
function mallet(v, f, at = 0, peak = 0.3, dur = 0.55) {
  tone(v, { f, at, dur, peak, attack: 0.005 });
  tone(v, { f: f * 3.93, at, dur: 0.09, peak: peak * 0.18, attack: 0.005 });
  tone(v, { type: 'triangle', f: f * 2, at, dur: 0.22, peak: peak * 0.12, attack: 0.005 });
}

// ---- recipes ----
// dur: upper bound on the sound's length in seconds (used for offline renders).
// tuned: pitch comes from the scale, so no random detune by default.
export const RECIPES = {
  tap: {
    dur: 0.12,
    play(v) {
      tone(v, { f: 720, sweep: [[0.03, 430]], dur: 0.07, peak: 0.32 });
      noise(v, { dur: 0.025, peak: 0.05, filter: { type: 'lowpass', f: 2400 } });
    },
  },
  pop: {
    dur: 0.15,
    play(v) {
      tone(v, { f: 320, sweep: [[0.045, 980]], dur: 0.1, peak: 0.42 });
      noise(v, { dur: 0.03, peak: 0.06, filter: { type: 'bandpass', f: 1800, q: 1.2 } });
    },
  },
  boing: {
    dur: 0.62,
    play(v) {
      tone(v, {
        type: 'triangle', f: 140, sweep: [[0.09, 330], [0.55, 250]], dur: 0.58, peak: 0.36, attack: 0.008,
        vib: { rate: 15, depth: 45, fade: 0.05 }, filter: { type: 'lowpass', f: 1600 },
      });
      tone(v, { f: 70, sweep: [[0.09, 165], [0.4, 125]], dur: 0.4, peak: 0.16, attack: 0.008 });
    },
  },
  squish: {
    dur: 0.36,
    play(v) {
      noise(v, { dur: 0.26, peak: 0.34, attack: 0.012, filter: { type: 'lowpass', f: 1500, q: 5, sweep: [[0.22, 260]] } });
      noise(v, { at: 0.07, dur: 0.2, peak: 0.2, attack: 0.01, filter: { type: 'lowpass', f: 900, q: 6, sweep: [[0.18, 200]] } });
      tone(v, { f: 230, sweep: [[0.16, 110]], dur: 0.2, peak: 0.16, attack: 0.01, vib: { rate: 22, depth: 18 } });
    },
  },
  sparkle: {
    dur: 0.75, tuned: true,
    play(v) {
      const degs = [];
      for (let i = 0; i < 6; i++) degs.push(5 + Math.floor(v.rnd() * 8));
      degs.sort((a, b) => a - b);
      degs.forEach((d, i) => {
        const f = pentatonicFreq(d);
        tone(v, { f, at: i * 0.045, dur: 0.32, peak: 0.1, attack: 0.005 });
        tone(v, { f: f * 2.01, at: i * 0.045, dur: 0.12, peak: 0.03, attack: 0.005 });
      });
    },
  },
  whoosh: {
    dur: 0.5,
    play(v) {
      noise(v, {
        dur: 0.46, peak: 0.45, attack: 0.16,
        filter: { type: 'bandpass', f: 350, q: 1.3, sweep: [[0.18, 1800], [0.44, 520]] },
      });
    },
  },
  plink: {
    dur: 0.62, tuned: true,
    play(v) { mallet(v, pentatonicFreq(v.degree())); },
  },
  bell: {
    dur: 1.45, tuned: true,
    play(v) { fmBell(v, { f: pentatonicFreq(v.degree()), dur: 1.4, peak: 0.2 }); },
  },
  ding: {
    dur: 1.3, tuned: true,
    play(v) {
      const f = pentatonicFreq(7);    // E6
      tone(v, { f, dur: 1.25, peak: 0.24, attack: 0.005 });
      tone(v, { f: f * 2.76, dur: 0.4, peak: 0.05, attack: 0.005 });
    },
  },
  chime: {
    dur: 1.05, tuned: true,
    play(v) {
      mallet(v, pentatonicFreq(3), 0, 0.26, 0.5);            // G5
      mallet(v, pentatonicFreq(5), 0.12, 0.28, 0.9);         // C6
    },
  },
  clink: {
    dur: 0.4,
    play(v) {
      tone(v, { f: 2350, dur: 0.34, peak: 0.12, attack: 0.005 });
      tone(v, { f: 3610, dur: 0.22, peak: 0.06, attack: 0.005 });
      tone(v, { f: 5230, dur: 0.1, peak: 0.03, attack: 0.005 });
      noise(v, { dur: 0.02, peak: 0.04, filter: { type: 'highpass', f: 4000 } });
    },
  },
  sizzle: {
    dur: 1.45,
    play(v) {
      // A soft hiss bed plus crackles, all from one noise source: the crackles
      // are gain automation, not extra nodes.
      noise(v, { dur: 1.35, peak: 0.09, attack: 0.08, hold: 0.8, filter: { type: 'bandpass', f: 3400, q: 0.9 } });
      const t0 = v.t;
      const src = v.ctx.createBufferSource();
      src.buffer = noiseBuffer(v.ctx);
      src.loop = true;
      const g = v.ctx.createGain();
      g.gain.setValueAtTime(SILENT, t0);
      let t = t0 + 0.02;
      while (t < t0 + 1.2) {
        const peak = 0.06 + v.rnd() * 0.12;
        g.gain.setValueAtTime(SILENT, t);
        g.gain.linearRampToValueAtTime(peak, t + MIN_ATTACK);
        g.gain.exponentialRampToValueAtTime(SILENT, t + 0.02 + v.rnd() * 0.02);
        t += 0.045 + v.rnd() * 0.07;
      }
      g.connect(v.out);
      src.connect(filter(v, { type: 'bandpass', f: 2300, q: 1.4 }, g));
      src.start(t0, v.rnd() * 0.9);
      src.stop(t0 + 1.3);
      v.track(src, t0 + 1.3);
    },
  },
  cheer: {
    dur: 1.35, tuned: true,
    play(v) {
      [0, 2, 3, 5].forEach((d, i) => {       // C5 E5 G5 C6
        const last = i === 3;
        tone(v, {
          type: 'triangle', f: pentatonicFreq(d), at: i * 0.075, dur: last ? 0.75 : 0.22, peak: 0.17,
          attack: 0.008, filter: { type: 'lowpass', f: 2800 },
          vib: last ? { rate: 6, depth: 9 } : undefined,
        });
      });
      noise(v, { at: 0.05, dur: 0.9, peak: 0.035, attack: 0.15, filter: { type: 'bandpass', f: 1300, q: 0.8 } });
      [10, 12, 14, 12, 13].forEach((d, i) => {
        tone(v, { f: pentatonicFreq(d), at: 0.32 + i * 0.07, dur: 0.3, peak: 0.05, attack: 0.005 });
      });
    },
  },
  bubble: {
    dur: 0.22,
    play(v) {
      tone(v, { f: 280, sweep: [[0.09, 900]], dur: 0.12, peak: 0.32 });
      tone(v, { f: 380, sweep: [[0.07, 1150]], at: 0.07, dur: 0.1, peak: 0.16 });
    },
  },
  whistle: {
    dur: 0.52,
    play(v) {
      tone(v, { f: 480, sweep: [[0.36, 1300]], dur: 0.46, peak: 0.2, attack: 0.03, hold: 0.25, vib: { rate: 6, depth: 14 } });
    },
  },
  thud: {
    dur: 0.28,
    play(v) {
      tone(v, { f: 150, sweep: [[0.15, 55]], dur: 0.22, peak: 0.5 });
      noise(v, { dur: 0.06, peak: 0.14, filter: { type: 'lowpass', f: 420 } });
    },
  },
  pickup: {
    dur: 0.16,
    play(v) {
      tone(v, { f: 420, sweep: [[0.07, 780]], dur: 0.12, peak: 0.28 });
      tone(v, { type: 'triangle', f: 840, sweep: [[0.07, 1560]], dur: 0.1, peak: 0.05, filter: { type: 'lowpass', f: 3000 } });
    },
  },
  squeak: {
    dur: 0.22,
    play(v) {
      tone(v, {
        type: 'triangle', f: 1250, sweep: [[0.05, 1750], [0.15, 1400]], dur: 0.17, peak: 0.2, attack: 0.01,
        vib: { rate: 32, depth: 50 }, filter: { type: 'lowpass', f: 3200 },
      });
    },
  },
  giggle: {
    dur: 0.62,
    play(v) {
      [620, 700, 590, 670, 540].forEach((f, i) => {
        tone(v, {
          type: 'triangle', f, sweep: [[0.05, f * 1.12]], at: i * 0.1, dur: 0.08, peak: 0.45, attack: 0.008,
          filter: { type: 'bandpass', f: 1100, q: 1.4 },
        });
      });
    },
  },
  munch: {
    dur: 0.48,
    play(v) {
      [0, 0.15, 0.3].forEach((at) => {
        noise(v, { at, dur: 0.09, peak: 0.3, attack: 0.006, filter: { type: 'bandpass', f: 700 + v.rnd() * 500, q: 0.9 } });
        tone(v, { f: 120, sweep: [[0.06, 80]], at, dur: 0.07, peak: 0.15 });
      });
    },
  },
  knock: {
    dur: 0.28,
    play(v) {
      [0, 0.14].forEach((at) => {
        tone(v, { f: 260, sweep: [[0.05, 180]], at, dur: 0.08, peak: 0.4 });
        noise(v, { at, dur: 0.04, peak: 0.12, filter: { type: 'bandpass', f: 900, q: 1.5 } });
      });
    },
  },
  doorbell: {
    dur: 1.45, tuned: true,
    play(v) {
      for (const [d, at] of [[2, 0], [0, 0.4]]) {            // E5 then C5: ding-dong
        const f = pentatonicFreq(d);
        tone(v, { f, at, dur: 1.0, peak: 0.22, attack: 0.005 });
        tone(v, { f: f * 2.76, at, dur: 0.3, peak: 0.05, attack: 0.005 });
        tone(v, { f: f * 2, at, dur: 0.6, peak: 0.06, attack: 0.005 });
      }
    },
  },
};

export const SOUND_NAMES = Object.keys(RECIPES);

/**
 * Build one sound into `dest` on any BaseAudioContext. Returns the voice
 * ({t, end, last, p}). Throws on an unknown name.
 */
export function renderInto(ctx, dest, name, opts = {}, { random = Math.random, nextDegree } = {}) {
  const r = RECIPES[name];
  if (!r) throw new Error(`unknown sound "${name}"`);
  const vary = opts.vary != null ? opts.vary : (r.tuned ? 0 : 0.05);
  const p = (opts.pitch != null ? opts.pitch : 1) * (1 + (random() * 2 - 1) * vary);
  const t = ctx.currentTime + LOOKAHEAD + (opts.when || 0);
  const v = {
    ctx, out: dest, t, p, rnd: random, end: t, last: null,
    track(src, stopAt) { if (stopAt >= this.end) { this.end = stopAt; this.last = src; } },
    degree: () => (opts.note != null ? opts.note : (nextDegree ? nextDegree(t) : 4)),
  };
  r.play(v, opts);
  return v;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function createSfx(core, { random = Math.random, maxVoices = 16 } = {}) {
  let active = 0;
  let degree = 4;
  let lastNoteAt = -Infinity;
  const stats = { played: 0, dropped: 0 };

  // A gentle random walk over the pentatonic scale: taps close together make
  // a little melody; after a pause it starts again near the middle.
  function nextDegree(t) {
    if (t - lastNoteAt > 2) {
      degree = 2 + Math.floor(random() * 4);
    } else {
      const steps = [-2, -1, -1, 1, 1, 2];
      degree += steps[Math.floor(random() * steps.length)];
      if (degree < WALK_RANGE[0]) degree = WALK_RANGE[0] + 1;
      if (degree > WALK_RANGE[1]) degree = WALK_RANGE[1] - 1;
    }
    lastNoteAt = t;
    return degree;
  }

  function play(name, opts = {}) {
    if (!RECIPES[name]) {
      console.warn(`sfx: unknown sound "${name}"`);
      return null;
    }
    if (core.isMuted()) { stats.dropped++; return null; }
    const a = core.get(true);
    if (!a || !core.canPlay() || active >= maxVoices) { stats.dropped++; return null; }
    const { ctx } = a;
    const out = ctx.createGain();
    out.gain.value = clamp(opts.gain != null ? opts.gain : 1, 0, 2);
    let tail = out;
    if (opts.pan && ctx.createStereoPanner) {
      tail = ctx.createStereoPanner();
      tail.pan.value = clamp(opts.pan, -1, 1);
      out.connect(tail);
    }
    tail.connect(a.sfx);
    const v = renderInto(ctx, out, name, opts, { random, nextDegree });
    active++;
    stats.played++;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      active--;
      out.disconnect();
      if (tail !== out) tail.disconnect();
    };
    if (v.last) v.last.onended = finish; else finish();
    return {
      name,
      start: v.t,
      end: v.end,
      stop() {
        try {
          out.gain.cancelScheduledValues(ctx.currentTime);
          out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        } catch (e) { /* already finished */ }
      },
    };
  }

  return {
    play,
    names: SOUND_NAMES,
    has: (name) => Object.prototype.hasOwnProperty.call(RECIPES, name),
    stats,
    activeVoices: () => active,
  };
}
