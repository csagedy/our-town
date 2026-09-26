// Tapes (P2b.5/P2b.6, docs/design.md 3.2 #4-6): the recorded-voice model,
// pure (no DOM, no audio). A TAPE is an ordinary `tape` entity (a cassette
// prop: carry it, pocket it, hand it to a character). A tape with a voice on
// it has these props (all small, all in the op log and synced):
//
//   color   'pink' | 'teal' | 'yellow'  (catalog variant)
//   env     the amplitude envelope, one digit 0..9 per HOP seconds ("0137..."),
//           at most MAX_SEC / HOP = 750 characters: what the lip-sync reads
//   dur     length in seconds (one decimal)
//   filter  a voice filter name (FILTER_NAMES) or absent
//   dev     the device that recorded it (the voice itself is only there)
//
// THE VOICE ITSELF is a Blob in the persist blob store (src/core/persist.js
// putBlob/getBlob), keyed by the tape entity's id, on the recording iPad
// only. It never goes into an op, never syncs to the other iPad and never
// leaves the device (CLAUDE.md). The other iPad sees the tape, its colour,
// filter and envelope: it plays a built-in melody shaped by the envelope
// (so the lip-sync still matches) and shows a small "far away" cloud on the
// tape. A blank tape (no env) from the props shelf plays a little tune.

export const TAPE_KIND = 'tape';
export const HOP = 0.08;          // seconds per envelope step (12.5 steps a second)
export const MAX_SEC = 60;        // a recording stops by itself (gently) after this
export const LEVELS = 9;          // envelope digits 0..9
export const MOUTH_OPEN = 3;      // an envelope level from which the mouth is open
export const TAPE_COLORS = ['pink', 'teal', 'yellow'];
export const FILTER_NAMES = ['chipmunk', 'giant', 'robot', 'echo', 'underwater', 'alien'];

export const isTape = (e) => !!e && e.kind === TAPE_KIND;
/** A tape with a recording on it (it has an envelope). */
export const isRecorded = (e) => isTape(e) && !!(e.props && typeof e.props.env === 'string' && e.props.env.length);

/**
 * Amplitude envelope of mono samples: RMS per `hop` seconds, normalised to
 * the loudest step and quantised to 0..LEVELS (quiet steps under a gate are
 * 0, so breathing doesn't flap the mouth). Returns an array of integers. Pure.
 */
export function envelopeOf(samples, sampleRate, hop = HOP, { gate = 0.1 } = {}) {
  const step = Math.max(1, Math.round(sampleRate * hop));
  const n = Math.ceil(samples.length / step);
  const rms = new Array(n).fill(0);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const a = i * step, b = Math.min(samples.length, a + step);
    for (let j = a; j < b; j++) sum += samples[j] * samples[j];
    rms[i] = Math.sqrt(sum / Math.max(1, b - a));
    if (rms[i] > peak) peak = rms[i];
  }
  if (peak < 1e-4) return rms.map(() => 0);   // silence
  return rms.map((r) => {
    const v = r / peak;
    return v < gate ? 0 : Math.max(1, Math.min(LEVELS, Math.round(v * LEVELS)));
  });
}

/** Normalise raw 0..1 levels (live analyser readings) the same way. Pure. */
export function levelsOf(raw, { gate = 0.1 } = {}) {
  const peak = raw.reduce((m, v) => Math.max(m, v), 0);
  if (peak < 1e-4) return raw.map(() => 0);
  return raw.map((r) => { const v = r / peak; return v < gate ? 0 : Math.max(1, Math.min(LEVELS, Math.round(v * LEVELS))); });
}

/** Levels -> the compact env string ("0137..."), capped at MAX_SEC. Pure. */
export function packEnv(levels, hop = HOP) {
  const max = Math.round(MAX_SEC / hop);
  let s = '';
  for (let i = 0; i < Math.min(levels.length, max); i++) s += String(Math.max(0, Math.min(LEVELS, levels[i] | 0)));
  return s;
}

/** env string -> levels. Pure. */
export function unpackEnv(env) {
  const out = [];
  for (let i = 0; i < (env || '').length; i++) { const d = env.charCodeAt(i) - 48; out.push(d >= 0 && d <= LEVELS ? d : 0); }
  return out;
}

/** Envelope level (0..9) at t seconds of tape time. Pure. */
export function levelAt(env, t, hop = HOP) {
  if (!env || t < 0) return 0;
  const i = Math.floor(t / hop);
  if (i >= env.length) return 0;
  const d = env.charCodeAt(i) - 48;
  return d >= 0 && d <= LEVELS ? d : 0;
}

/**
 * Syllables of an envelope: runs of steps at or over `thr`, as
 * [startStep, endStep) pairs; runs shorter than `min` steps are dropped and
 * gaps shorter than `gap` steps are bridged. Pure. (The built-in melody sings
 * one "la" per syllable, so it follows the rhythm of the recording.)
 */
export function syllables(levels, { thr = MOUTH_OPEN, min = 1, gap = 1 } = {}) {
  const out = [];
  let a = -1;
  for (let i = 0; i <= levels.length; i++) {
    const on = i < levels.length && levels[i] >= thr;
    if (on && a < 0) a = i;
    else if (!on && a >= 0) {
      const prev = out[out.length - 1];
      if (prev && a - prev[1] < gap) prev[1] = i;
      else out.push([a, i]);
      a = -1;
    }
  }
  return out.filter(([s, e]) => e - s >= min);
}

/** Props of a freshly recorded tape. Pure. */
export function recordedTapeProps({ levels, duration, filter = null, device = null, color = 'pink' }) {
  const p = { color: TAPE_COLORS.includes(color) ? color : 'pink', env: packEnv(levels), dur: Math.round(Math.min(MAX_SEC, duration) * 10) / 10 };
  if (filter && FILTER_NAMES.includes(filter)) p.filter = filter;
  if (device) p.dev = device;
  return p;
}

/** Ids of every recorded tape in the world (wherever it is: a room, a pocket, a hand). Pure. */
export function recordingIds(state) {
  return Object.keys(state.entities).filter((id) => { const e = state.entities[id]; return !e.deleted && isRecorded(e); }).sort();
}

/**
 * Parent menu "Delete all recordings": every recorded tape goes (hard
 * remove, so it goes on the other iPad too) and every tape voice Blob on
 * this iPad is deleted. Resolves to { tapes, blobs } counts.
 */
export async function deleteRecordings(store, persist) {
  const ids = recordingIds(store.state);
  for (const id of ids) store.dispatch('remove', { id, hard: true });
  let blobs = 0;
  if (persist && persist.blobIds) {
    const st = store.state;
    for (const id of await persist.blobIds()) {
      const e = st.entities[id];
      // A tape's voice (any tape, removed or not), or a blob nothing owns any more.
      if (!e || e.deleted || isTape(e)) { await persist.deleteBlob(id); blobs++; }
    }
  }
  if (persist && persist.flush) await persist.flush();
  return { tapes: ids.length, blobs };
}
