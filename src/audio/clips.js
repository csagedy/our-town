// Bundled audio clips (assets/audio/*.m4a, precached by the service worker):
// fetched once, decoded into AudioBuffers, and played through the clips bus
// of the same master chain as the synth sounds.
//
//   await clips.load('sizzle', 'assets/audio/sizzle.m4a');
//   const h = clips.play('sizzle', { loop: true, gain: 0.6 });
//   h.stop();            // short fade, no click
//
// A clip that failed to load or isn't loaded yet just doesn't play (returns
// null): missing texture sounds must never break play.

const FADE_IN = 0.006;

/** decodeAudioData, callback form (works in every Safari) wrapped in a promise. */
export function decode(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (b) => { if (!settled) { settled = true; resolve(b); } };
    const bad = (e) => { if (!settled) { settled = true; reject(e || new Error('decode failed')); } };
    try {
      const r = ctx.decodeAudioData(arrayBuffer, ok, bad);
      if (r && typeof r.then === 'function') r.then(ok, bad);
    } catch (e) {
      bad(e);
    }
  });
}

export function createClips(core, deps = {}) {
  const buffers = new Map();
  const pending = new Map();
  const fetchFn = (...a) => (deps.fetch || globalThis.fetch)(...a);

  /** Load and decode one clip. Resolves to the AudioBuffer, or null on failure. */
  function load(name, url) {
    if (buffers.has(name)) return Promise.resolve(buffers.get(name));
    if (pending.has(name)) return pending.get(name);
    const a = core.get(true);
    if (!a) return Promise.resolve(null);
    const p = Promise.resolve()
      .then(() => fetchFn(url))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((ab) => decode(a.ctx, ab))
      .then((buf) => { buffers.set(name, buf); pending.delete(name); return buf; })
      .catch((err) => {
        pending.delete(name);
        console.warn(`clips: could not load "${name}" from ${url}: ${err && err.message}`);
        return null;
      });
    pending.set(name, p);
    return p;
  }

  /** Load several: { name: url, ... }. Resolves to the names that loaded. */
  function loadAll(map) {
    const names = Object.keys(map);
    return Promise.all(names.map((n) => load(n, map[n])))
      .then((bufs) => names.filter((n, i) => bufs[i]));
  }

  function play(name, { gain = 1, rate = 1, loop = false, pan = 0, when = 0 } = {}) {
    const buf = buffers.get(name);
    if (!buf || core.isMuted()) return null;
    const a = core.get(true);
    if (!a || !core.canPlay()) return null;
    const { ctx } = a;
    const t0 = ctx.currentTime + 0.005 + when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + FADE_IN);
    src.connect(g);
    let tail = g;
    if (pan && ctx.createStereoPanner) {
      tail = ctx.createStereoPanner();
      tail.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(tail);
    }
    tail.connect(a.clips);
    src.onended = () => { g.disconnect(); if (tail !== g) tail.disconnect(); };
    src.start(t0);
    return {
      source: src,
      stop(fade = 0.05) {
        const now = ctx.currentTime;
        try {
          g.gain.cancelScheduledValues(now);
          g.gain.setValueAtTime(g.gain.value, now);
          g.gain.linearRampToValueAtTime(0, now + fade);
          src.stop(now + fade + 0.01);
        } catch (e) { /* already stopped */ }
      },
    };
  }

  return {
    load,
    loadAll,
    play,
    has: (name) => buffers.has(name),
    unload: (name) => buffers.delete(name),
  };
}
