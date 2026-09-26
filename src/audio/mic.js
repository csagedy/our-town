// Mic recording, voice filters and the built-in "la la la" singer
// (P2b.5/P2b.6, docs/design.md 3.2 #4-6 and 5). ON-DEVICE ONLY: nothing here
// makes a network request; a recording is a Blob handed back to the caller,
// who keeps it in the persist blob store (src/core/tapes.js).
//
//   const mic = createMic(audioCore);            // audioCore: src/audio/context.js
//   await mic.open();                            // getUserMedia (inside the tap); throws {code: 'denied'|'nomic'}
//   mic.begin({ filter: 'robot' });              // start recording (after the countdown)
//   mic.level();                                 // 0..1 live input level (AnalyserNode)
//   const take = await mic.stop();               // {blob, type, duration, levels, buffer}; the mic is released at once
//   mic.cancel();                                // drop it (release the mic)
//
//   const h = playBuffer(audioCore, buffer, { filter: 'giant' });   // through the clips bus
//   h.time();   // seconds of TAPE time played (the lip-sync clock); h.stop()
//   const s = singLaLa(audioCore, { env, filter });                 // the built-in singer
//
// Recording: MediaRecorder where it exists, with a feature-detected
// mimeType (Safari 16: audio/mp4; Chrome: audio/webm). Without
// MediaRecorder: PCM through a ScriptProcessorNode, encoded to a 16-bit WAV
// here (encodeWav). The raw voice is recorded; filters are applied when a
// tape plays. Live monitoring (hearing yourself through the filter while
// recording) is OFF by default: on iPad speakers it would feed back into
// the mic, and Safari can't tell us if headphones are in. `monitor: true`
// (the theater's ?micmonitor flag) routes the live filtered input to the
// speakers for headphone use. The level meter always reads the live input.
//
// Filters are small WebAudio graphs (buildFilter): chipmunk / giant are a
// playbackRate change (1.6 / 0.65) plus a formant-ish shelf filter (live:
// the shelf only, there is no rate to change); robot is ring modulation at
// 55 Hz plus a bit-crush WaveShaper; echo cave a feedback DelayNode; under-
// water a wobbling lowpass with a slow vibrato; alien a fast vibrato plus
// ring modulation at 420 Hz. Only nodes Safari 16 has (no AudioWorklet).
//
// No DOM or AudioContext access at import time (unit tests import this).

import { envelopeOf, levelsOf, HOP, MAX_SEC, syllables, unpackEnv, packEnv, FILTER_NAMES } from '../core/tapes.js';
import { decode } from './clips.js';

// Preferred containers, best first. Safari 16 records audio/mp4 (AAC).
export const MIME_TYPES = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/** The first mimeType MediaRecorder can record ('' = let it choose; null = no MediaRecorder). Pure. */
export function pickMimeType(MR, types = MIME_TYPES) {
  if (!MR) return null;
  if (typeof MR.isTypeSupported !== 'function') return '';
  for (const t of types) { try { if (MR.isTypeSupported(t)) return t; } catch { /* ignore */ } }
  return '';
}

/** Mono Float32 chunks -> a 16-bit PCM WAV file (ArrayBuffer). Pure. */
export function encodeWav(chunks, sampleRate) {
  const list = Array.isArray(chunks) ? chunks : [chunks];
  const n = list.reduce((s, c) => s + c.length, 0);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44;
  for (const c of list) {
    for (let i = 0; i < c.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
    }
  }
  return buf;
}

/** A WAV ArrayBuffer -> {sampleRate, samples: Float32Array} (mono 16-bit, what encodeWav writes). Pure. */
export function decodeWav(ab) {
  const v = new DataView(ab);
  const sampleRate = v.getUint32(24, true);
  const n = v.getUint32(40, true) / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = v.getInt16(44 + i * 2, true); samples[i] = s < 0 ? s / 0x8000 : s / 0x7fff; }
  return { sampleRate, samples };
}

// ---------------------------------------------------------------------------
// Voice filters

// Pictures for the filter boxes and tape badges (docs/STYLE.md ink outline).
export const FILTERS = {
  chipmunk: { rate: 1.6, color: '#F2B35E' },
  giant: { rate: 0.65, color: '#7FA86B' },
  robot: { rate: 1, color: '#9BB3C9' },
  echo: { rate: 1, color: '#A58BC4' },
  underwater: { rate: 1, color: '#6FB7D6' },
  alien: { rate: 1, color: '#9CCB6A' },
};

/** Playback rate of a filter (1 for none / unknown, and for live input). Pure. */
export const filterRate = (name, live = false) => (!live && FILTERS[name] ? FILTERS[name].rate : 1);

/** A bit-crush curve: the wave squashed onto `steps` levels. Pure. */
export function crushCurve(steps = 12, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
  return c;
}

/**
 * Build filter `name` on ctx (any BaseAudioContext, also an
 * OfflineAudioContext), ending in `dest`. Returns { name, input, rate,
 * nodes, oscs, stop() }: connect the voice to `input`; for a played buffer
 * set its playbackRate to `rate`. An unknown name (or null) is a clean
 * pass-through. opts.live: for the live mic (no rate change).
 */
export function buildFilter(ctx, name, dest, { live = false } = {}) {
  const nodes = [];
  const oscs = [];
  const add = (n) => { nodes.push(n); return n; };
  const gain = (v) => { const g = add(ctx.createGain()); g.gain.value = v; return g; };
  const biquad = (type, f, q = 1, g = 0) => { const b = add(ctx.createBiquadFilter()); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = g; return b; };
  const osc = (f, type = 'sine') => { const o = add(ctx.createOscillator()); o.type = type; o.frequency.value = f; oscs.push(o); return o; };
  const delay = (t, max = 1) => { const d = add(ctx.createDelay(max)); d.delayTime.value = t; return d; };
  // A ring modulator: out = in * sine(f). The gain's own value is 0; the oscillator drives it.
  const ring = (f) => { const g = gain(0); osc(f).connect(g.gain); return g; };
  // Vibrato: a delay line whose delay wobbles (a pitch wobble), rate Hz, depth seconds.
  const vibrato = (rate, depth) => { const d = delay(depth * 2 + 0.005, 0.1); const lfo = osc(rate); const amt = gain(depth); lfo.connect(amt); amt.connect(d.delayTime); return d; };

  const input = gain(1);
  const out = gain(1);
  out.connect(dest);
  switch (FILTER_NAMES.includes(name) ? name : null) {
    case 'chipmunk': {
      // Squeaky: thin out the lows, a bright bump.
      const hp = biquad('highpass', 260, 0.7);
      const shelf = biquad('highshelf', 2800, 1, 6);
      input.connect(hp); hp.connect(shelf); shelf.connect(out);
      break;
    }
    case 'giant': {
      // Boomy: a big low shelf, the fizz rolled off.
      const shelf = biquad('lowshelf', 300, 1, 8);
      const lp = biquad('lowpass', 2600, 0.8);
      input.connect(shelf); shelf.connect(lp); lp.connect(out);
      out.gain.value = 0.85;
      break;
    }
    case 'robot': {
      const rm = ring(55);
      const crush = add(ctx.createWaveShaper());
      crush.curve = crushCurve(10);
      const body = biquad('bandpass', 1100, 0.9);
      input.connect(rm); rm.connect(crush); crush.connect(body); body.connect(out);
      const dry = gain(0.25); input.connect(dry); dry.connect(out);
      out.gain.value = 1.6;
      break;
    }
    case 'echo': {
      // Echo cave: the dry voice plus repeats that fade and darken.
      const d = delay(0.32, 1);
      const fb = gain(0.5);
      const dark = biquad('lowpass', 2400, 0.7);
      const wet = gain(0.7);
      input.connect(out);
      input.connect(d); d.connect(dark); dark.connect(fb); fb.connect(d);
      dark.connect(wet); wet.connect(out);
      out.gain.value = 0.8;
      break;
    }
    case 'underwater': {
      const v = vibrato(3.2, 0.0025);
      const lp = biquad('lowpass', 520, 7);
      const lfo = osc(1.6);
      const sweep = gain(260);
      lfo.connect(sweep); sweep.connect(lp.frequency);
      input.connect(v); v.connect(lp); lp.connect(out);
      out.gain.value = 1.3;
      break;
    }
    case 'alien': {
      const v = vibrato(7.5, 0.0035);
      const rm = ring(420);
      const wet = gain(0.8);
      const dry = gain(0.55);
      input.connect(v); v.connect(rm); rm.connect(wet); wet.connect(out); v.connect(dry); dry.connect(out);
      break;
    }
    default:
      input.connect(out);
  }
  const t = ctx.currentTime;
  for (const o of oscs) o.start(t);
  let stopped = false;
  return {
    name: FILTER_NAMES.includes(name) ? name : null,
    input,
    output: out,
    rate: filterRate(name, live),
    nodes,
    oscs,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const o of oscs) { try { o.stop(); } catch { /* already */ } }
      for (const n of nodes) { try { n.disconnect(); } catch { /* already */ } }
    },
  };
}

// ---------------------------------------------------------------------------
// Playback

/**
 * Play a decoded AudioBuffer through filter `filter` into the clips bus.
 * Returns { duration (real seconds), rate, time() (tape seconds played),
 * stop(), done (a promise) } or null without audio. onEnded fires once.
 */
export function playBuffer(core, buffer, { filter = null, gain = 1, onEnded = null, now = () => Date.now() } = {}) {
  const a = core.get(true);
  if (!a || !buffer) return null;
  const { ctx } = a;
  const fl = buildFilter(ctx, filter, a.clips);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = fl.rate;
  const g = ctx.createGain();
  const t0 = ctx.currentTime + 0.01;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  src.connect(g);
  g.connect(fl.input);
  const duration = buffer.duration / fl.rate;
  const started = now();
  let finished = false;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const tail = (filter === 'echo' ? 1.2 : 0.15) * 1000;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(guard);
    setTimeout(() => { fl.stop(); try { g.disconnect(); } catch { /* ok */ } }, tail);
    if (onEnded) { try { onEnded(); } catch (e) { console.warn(e); } }
    resolveDone();
  };
  src.onended = finish;
  // Wall-clock guard: a suspended context never fires onended.
  const guard = setTimeout(finish, duration * 1000 + 400);
  src.start(t0);
  return {
    duration,
    rate: fl.rate,
    filter: fl.name,
    time: () => Math.min(buffer.duration, ((now() - started) / 1000) * fl.rate),
    stop(fade = 0.06) {
      clearTimeout(guard);
      const t = ctx.currentTime;
      try { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.01); } catch { /* ended */ }
      finish();
    },
    done,
  };
}

// ---------------------------------------------------------------------------
// The built-in singer: "la la la" (the mic's shrug, far-away tapes, blank tapes)

// A little tune (pentatonic degrees over G4) and its rhythm in envelope steps.
export const LALA_TUNE = [[0, 4], [2, 4], [4, 4], [2, 3], [4, 3], [7, 6], [4, 4], [2, 4], [0, 8]];
const PENTA = [0, 2, 4, 7, 9];
export const LALA_BASE = 392;   // G4, a singing voice
export const tuneFreq = (degree, base = LALA_BASE) => base * Math.pow(2, (12 * Math.floor(degree / 5) + PENTA[((degree % 5) + 5) % 5]) / 12);

/** The default tune as an envelope string (a syllable per note, a breath between). Pure. */
export function lalaEnv(tune = LALA_TUNE) {
  const lv = [];
  for (const [, steps] of tune) { for (let i = 0; i < steps - 1; i++) lv.push(i === 0 ? 9 : Math.max(4, 8 - i)); lv.push(0); }
  lv.push(0, 0);
  return packEnv(lv);
}

/** Notes for an envelope: one "la" per syllable, walking the tune. Pure. [{at, dur, f}] seconds. */
export function lalaNotes(env, { hop = HOP, tune = LALA_TUNE } = {}) {
  const syl = syllables(unpackEnv(env), { thr: 3, min: 1, gap: 1 });
  return syl.map(([a, b], i) => ({ at: a * hop, dur: Math.max(0.12, (b - a) * hop), f: tuneFreq(tune[i % tune.length][0]) }));
}

/**
 * Sing an envelope with the built-in voice (a triangle "la" through an "ah"
 * formant), through a voice filter, into the clips bus. Returns the same
 * handle shape as playBuffer, or null without audio.
 */
export function singLaLa(core, { env = lalaEnv(), filter = null, gain = 0.5, onEnded = null, now = () => Date.now() } = {}) {
  const a = core.get(true);
  const notes = lalaNotes(env);
  const tapeDur = Math.max(0.3, (env.length || 1) * HOP);
  const rate = filterRate(filter);
  const duration = tapeDur / rate;
  const started = now();
  let finished = false;
  let fl = null;
  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });
  const srcs = [];
  if (a) {
    const { ctx } = a;
    fl = buildFilter(ctx, filter, a.clips);
    const t0 = ctx.currentTime + 0.02;
    for (const n of notes) {
      const at = t0 + n.at / rate, dur = n.dur / rate, f = n.f * rate;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f * 0.97, at);
      o.frequency.linearRampToValueAtTime(f, at + 0.05);
      const ah = ctx.createBiquadFilter();
      ah.type = 'bandpass'; ah.frequency.value = 900; ah.Q.value = 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.03);
      g.gain.setValueAtTime(gain, at + Math.max(0.04, dur - 0.06));
      g.gain.linearRampToValueAtTime(0.0001, at + dur);
      o.connect(ah); ah.connect(g); g.connect(fl.input);
      o.start(at); o.stop(at + dur + 0.02);
      srcs.push(o);
    }
  }
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (fl) setTimeout(() => fl.stop(), filter === 'echo' ? 1200 : 150);
    if (onEnded) { try { onEnded(); } catch (e) { console.warn(e); } }
    resolveDone();
  };
  const timer = setTimeout(finish, duration * 1000 + 100);
  return {
    duration, rate, filter: fl ? fl.name : null, env, notes: notes.length,
    time: () => Math.min(tapeDur, ((now() - started) / 1000) * rate),
    stop() { for (const o of srcs) { try { o.stop(); } catch { /* ok */ } } finish(); },
    done,
  };
}

// ---------------------------------------------------------------------------
// Recording

const micError = (code, cause) => Object.assign(new Error('mic: ' + code), { code, cause });

/**
 * The recorder. deps (tests): navigator, MediaRecorder, now, setInterval,
 * clearInterval. opts.monitor: hear the live (filtered) input (headphones only).
 */
export function createMic(core, deps = {}) {
  const g = () => deps.global || globalThis;
  const nav = () => deps.navigator || g().navigator;
  const MR = () => ('MediaRecorder' in deps ? deps.MediaRecorder : g().MediaRecorder);
  const now = deps.now || (() => Date.now());
  const every = deps.setInterval || ((fn, ms) => setInterval(fn, ms));
  const unevery = deps.clearInterval || ((t) => clearInterval(t));
  const stats = { opened: 0, recorded: 0, released: 0, denied: 0, how: null, mime: null };

  let s = null;   // the session: {stream, source, analyser, data, filter, rec, chunks, pcm, started, raw, sampler}

  function release() {
    if (!s) return;
    const x = s;
    s = null;
    if (x.sampler) unevery(x.sampler);
    for (const t of x.stream.getTracks()) { try { t.stop(); } catch { /* ok */ } }
    stats.released++;
    for (const n of [x.source, x.analyser, x.proc, x.sink, x.monitorGain]) { if (n) { try { n.disconnect(); } catch { /* ok */ } } }
    if (x.filter) x.filter.stop();
  }

  /** Ask for the mic (call inside the tap: the iPad shows its permission prompt the first time). */
  async function open() {
    if (s) release();
    const n = nav();
    const md = n && n.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') throw micError('nomic');
    let stream;
    try {
      stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      const name = e && e.name;
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') { stats.denied++; throw micError('denied', e); }
      throw micError('nomic', e);
    }
    if (!stream || !stream.getAudioTracks || !stream.getAudioTracks().length) {
      if (stream) for (const t of stream.getTracks()) t.stop();
      throw micError('nomic');
    }
    stats.opened++;
    s = { stream, started: 0, raw: [], chunks: [], pcm: [], rec: null };
    const a = core.get(true);
    if (a) {
      const { ctx } = a;
      try {
        s.source = ctx.createMediaStreamSource(stream);
        s.analyser = ctx.createAnalyser();
        s.analyser.fftSize = 1024;
        s.data = new Uint8Array(s.analyser.fftSize);
        s.source.connect(s.analyser);
      } catch (e) { console.warn('mic: no level meter', e); }
    }
    return true;
  }

  function level() {
    if (!s || !s.analyser) return 0;
    s.analyser.getByteTimeDomainData(s.data);
    let sum = 0;
    for (let i = 0; i < s.data.length; i++) { const v = (s.data[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / s.data.length) * 3.2);
  }

  /** Start recording (open() first). opts: filter (the live graph), monitor. */
  function begin({ filter = null, monitor = false } = {}) {
    if (!s) throw micError('closed');
    const a = core.get(true);
    // Live filter graph: feeds the speakers only when monitoring (headphones).
    if (a && s.source) {
      s.monitorGain = a.ctx.createGain();
      s.monitorGain.gain.value = monitor ? 1 : 0;
      s.monitorGain.connect(a.sfx);
      s.filter = buildFilter(a.ctx, filter, s.monitorGain, { live: true });
      s.source.connect(s.filter.input);
    }
    const Rec = MR();
    const mime = pickMimeType(Rec);
    if (Rec) {
      try {
        s.rec = mime ? new Rec(s.stream, { mimeType: mime }) : new Rec(s.stream);
        const chunks = s.chunks;   // the last chunk arrives after stop() released the session
        s.rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        s.rec.start();
        stats.how = 'MediaRecorder';
        stats.mime = s.rec.mimeType || mime || '';
      } catch (e) {
        console.warn('mic: MediaRecorder failed, recording PCM', e);
        s.rec = null;
      }
    }
    if (!s.rec) {
      if (!a || !s.source) throw micError('nomic');
      // PCM fallback: a ScriptProcessor copies the input; it must reach the destination to run.
      const proc = a.ctx.createScriptProcessor(4096, 1, 1);
      const sink = a.ctx.createGain();
      sink.gain.value = 0;
      const pcm = s.pcm;
      proc.onaudioprocess = (e) => { pcm.push(new Float32Array(e.inputBuffer.getChannelData(0))); };
      s.source.connect(proc); proc.connect(sink); sink.connect(a.ctx.destination);
      s.proc = proc; s.sink = sink; s.rate = a.ctx.sampleRate;
      stats.how = 'wav';
      stats.mime = 'audio/wav';
    }
    s.started = now();
    // The live envelope (a fallback when the recording can't be decoded).
    s.sampler = every(() => { if (s) s.raw.push(level()); }, HOP * 1000);
    return stats.how;
  }

  /** Stop: the mic is released right away (the iPad's recording light goes off). Resolves to the take. */
  function stop() {
    if (!s) return Promise.resolve(null);
    const x = s;
    const duration = Math.min(MAX_SEC, (now() - x.started) / 1000);
    const raw = x.raw.slice();
    const got = new Promise((resolve) => {
      if (x.rec && x.rec.state !== 'inactive') {
        const type = x.rec.mimeType || stats.mime || 'audio/mp4';
        x.rec.onstop = () => resolve(new Blob(x.chunks, { type }));
        try { x.rec.stop(); } catch { resolve(new Blob(x.chunks, { type })); }
      } else if (x.proc) {
        x.proc.onaudioprocess = null;
        resolve(new Blob([encodeWav(x.pcm, x.rate)], { type: 'audio/wav' }));
      } else resolve(null);
    });
    release();
    stats.recorded++;
    return got.then(async (blob) => {
      let buffer = null;
      const a = core.get(true);
      if (blob && blob.size && a) {
        try { buffer = await decode(a.ctx, await blob.arrayBuffer()); } catch (e) { console.warn('mic: could not decode the take', e && e.message); }
      }
      const levels = buffer ? envelopeOf(buffer.getChannelData(0), buffer.sampleRate) : levelsOf(raw);
      return { blob, type: blob ? blob.type : '', duration: buffer ? Math.min(MAX_SEC, buffer.duration) : duration, levels, buffer };
    });
  }

  return {
    open, begin, stop, level,
    cancel: release,
    get live() { return !!s; },
    get recording() { return !!(s && s.started); },
    elapsed: () => (s && s.started ? (now() - s.started) / 1000 : 0),
    stats: () => Object.assign({}, stats),
  };
}
