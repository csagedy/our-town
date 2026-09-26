// The one global AudioContext, its master bus, and the iOS unlock dance.
//
// Graph:  sfx bus ──┐
//         clips bus ─┼─> compressor (gentle) ─> master gain (volume, mute) ─> speakers
//         music bus ─┘
//
// iOS rules this module handles (design.md section 5):
// - A context may only start inside a user gesture, so every pointerup,
//   touchend, click and keydown calls resume() until the context is running.
//   The listeners stay installed forever, because iOS moves a running context
//   to "interrupted" (phone call, Siri, another app's audio) or "suspended"
//   (backgrounding) and only a later gesture may bring it back.
// - Old iOS versions also want a buffer played inside the gesture, so each
//   unlock attempt starts a one-sample silent buffer.
// - When the page is hidden we suspend (saves battery on road trips) and try
//   to resume when it becomes visible again; if Safari refuses, the next tap
//   does it.
// - A context that ends up "closed" is thrown away and rebuilt on the next tap.
//
// No DOM or AudioContext access happens at import time (unit tests import this
// in Node); createAudioCore() takes its globals lazily or from `deps`.

export const MASTER_VOLUME = 0.7;
// A sound asked for while the context is not running is only scheduled if a
// gesture (and therefore a resume) happened this recently; otherwise it would
// pile up in the frozen context and blast out all at once on the next resume.
export const GESTURE_GRACE_MS = 1000;
export const GESTURE_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];

/** Build the bus graph on any BaseAudioContext (also an OfflineAudioContext). */
export function buildGraph(ctx, { volume = MASTER_VOLUME, muted = false } = {}) {
  const compressor = ctx.createDynamicsCompressor();
  // Gentle: only tames a pile of simultaneous taps, never pumps single sounds.
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  compressor.connect(master);
  master.connect(ctx.destination);

  const bus = (gain) => {
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(compressor);
    return g;
  };
  return { ctx, compressor, master, sfx: bus(1), clips: bus(0.9), music: bus(0.5) };
}

export function createAudioCore(deps = {}) {
  const g = () => deps.global || globalThis;
  const doc = () => deps.document || g().document;
  const now = deps.now || (() => g().performance.now());

  let graph = null;
  let unsupported = false;
  let muted = false;
  let volume = MASTER_VOLUME;
  let lastGesture = -Infinity;
  let resuming = false;
  let autoSuspended = false;
  let installed = false;
  const gestureHooks = [];
  const stateHooks = [];
  const stats = { created: 0, unlockAttempts: 0, resumes: 0, recreated: 0 };

  function notify() {
    const s = state();
    for (const fn of stateHooks) { try { fn(s); } catch (e) { /* a listener must not break audio */ } }
  }

  function get(create = true) {
    if (graph && graph.ctx.state === 'closed') {
      graph = null;
      stats.recreated++;
    }
    if (graph || !create || unsupported) return graph;
    const AC = deps.AudioContext || g().AudioContext || g().webkitAudioContext;
    if (!AC) { unsupported = true; return null; }
    let ctx;
    try {
      ctx = new AC();
    } catch (e) {
      unsupported = true;
      return null;
    }
    stats.created++;
    graph = buildGraph(ctx, { volume, muted });
    ctx.onstatechange = () => {
      if (ctx.state === 'running') resuming = false;
      notify();
    };
    return graph;
  }

  function state() {
    if (unsupported) return 'unsupported';
    return graph ? graph.ctx.state : 'none';
  }

  function tryResume(ctx) {
    resuming = true;
    let p;
    try { p = ctx.resume(); } catch (e) { resuming = false; return; }
    if (p && p.then) {
      p.then(() => { resuming = false; stats.resumes++; notify(); },
        () => { resuming = false; });
    } else {
      resuming = false;
    }
  }

  /** Call from inside a user gesture. Creates, resumes and primes the context. */
  function gesture() {
    lastGesture = now();
    const a = get(true);
    if (a && a.ctx.state !== 'running') {
      stats.unlockAttempts++;
      autoSuspended = false;
      tryResume(a.ctx);
      try {
        const src = a.ctx.createBufferSource();
        src.buffer = a.ctx.createBuffer(1, 1, 22050);
        src.connect(a.ctx.destination);
        src.start(0);
      } catch (e) { /* the silent kick is best effort */ }
    }
    for (const fn of gestureHooks) { try { fn(); } catch (e) { /* ignore */ } }
  }

  function visibility(hidden) {
    const a = get(false);
    if (!a) return;
    if (hidden) {
      if (a.ctx.state === 'running') {
        autoSuspended = true;
        try { a.ctx.suspend(); } catch (e) { /* ignore */ }
      }
    } else if (autoSuspended || a.ctx.state === 'interrupted') {
      autoSuspended = false;
      tryResume(a.ctx);    // may be refused outside a gesture; the next tap retries
    }
  }

  /** Install the gesture and visibility listeners (idempotent). */
  function install() {
    const d = doc();
    if (installed || !d) return;
    installed = true;
    const opts = { capture: true, passive: true };
    for (const type of GESTURE_EVENTS) d.addEventListener(type, gesture, opts);
    d.addEventListener('visibilitychange', () => visibility(d.visibilityState === 'hidden'));
    const w = deps.window || g().window;
    if (w && w.addEventListener) {
      w.addEventListener('pageshow', () => visibility(false));
      w.addEventListener('focus', () => visibility(false));
    }
  }

  /** True if a sound scheduled now will be heard (soon). */
  function canPlay() {
    if (!graph) return false;
    const s = graph.ctx.state;
    if (s === 'running') return true;
    if (s === 'closed') return false;
    return resuming || now() - lastGesture < GESTURE_GRACE_MS;
  }

  function applyMaster() {
    if (!graph) return;
    const { ctx, master } = graph;
    const target = muted ? 0 : volume;
    const p = master.gain;
    try {
      p.cancelScheduledValues(ctx.currentTime);
      p.setValueAtTime(p.value, ctx.currentTime);
      p.setTargetAtTime(target, ctx.currentTime, 0.03);
    } catch (e) {
      p.value = target;
    }
  }

  return {
    get,
    state,
    gesture,
    visibility,
    install,
    canPlay,
    stats,
    isMuted: () => muted,
    setMuted(m) { muted = !!m; applyMaster(); notify(); },
    getVolume: () => volume,
    setVolume(v) { volume = Math.max(0, Math.min(1, Number(v) || 0)); applyMaster(); },
    onGesture(fn) { gestureHooks.push(fn); },
    onStateChange(fn) { stateHooks.push(fn); },
  };
}
