// Spoken words via speechSynthesis, offline only.
//
//   speech.say('cat')                         // queued; resolves true when spoken
//   speech.say('Hello!', { interrupt: true }) // drop the queue, speak now
//
// - Only on-device voices (localService) are used: network voices would fail
//   on a road trip. On iPad every built-in voice is local.
// - A friendly English voice is picked once (en-US first, then other English),
//   novelty voices (Bad News, Zarvox, Bells...) are skipped, and the choice is
//   remembered in localStorage by voiceURI.
// - If voices haven't loaded yet (Safari can return [] at first) we speak with
//   the platform default English voice, which on iPad is on-device.
// - If there is no speechSynthesis or no usable voice, say() resolves false and
//   calls onUnavailable(text) so the caller can flash a picture and chime.
// - Our own queue (one utterance at a time, references kept so Safari doesn't
//   garbage-collect them and drop onend), plus a watchdog for the known iOS
//   case where onend never fires after backgrounding.
// - iOS wants the first speak() inside a user gesture: prime() speaks a silent
//   blank once and is wired to the audio unlock gesture in index.js.

export const KID_RATE = 0.9;       // a touch slower than normal
export const KID_PITCH = 1.15;     // a touch brighter
const STORAGE_KEY = 'ourtown.voice';

// macOS/iOS novelty and joke voices; fine for giggles, not for reading words.
const NOVELTY = new Set(['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged',
  'good news', 'hysterical', 'jester', 'organ', 'pipe organ', 'superstar', 'trinoids', 'whisper', 'wobble',
  'zarvox', 'fred', 'junior', 'kathy', 'ralph', 'princess']);
// Clear, warm voices, best first.
const FRIENDLY = ['samantha', 'ava', 'allison', 'susan', 'karen', 'moira', 'tessa', 'serena', 'nicky',
  'zoe', 'joelle', 'daniel', 'alex', 'tom'];

function baseName(voice) {
  return String(voice.name || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
}

/** Score a voice for kid-friendly offline English speech; null means unusable. */
export function scoreVoice(voice, { lang = 'en-US' } = {}) {
  if (!voice || voice.localService === false) return null;
  const vl = String(voice.lang || '').replace('_', '-').toLowerCase();
  if (!vl.startsWith('en')) return null;
  const name = baseName(voice);
  if (NOVELTY.has(name)) return null;
  let s = 0;
  if (vl === lang.toLowerCase()) s += 50;
  else if (vl.startsWith('en-')) s += 30;
  else s += 20;
  const i = FRIENDLY.indexOf(name);
  if (i >= 0) s += 20 - i;
  if (/enhanced|premium/i.test(voice.name)) s += 8;
  if (voice.default) s += 3;
  return s;
}

/** Pick the best voice, honoring a remembered voiceURI when it is still usable. */
export function pickVoice(voices, { lang = 'en-US', preferredURI } = {}) {
  if (!voices || !voices.length) return null;
  if (preferredURI) {
    const v = voices.find((x) => x.voiceURI === preferredURI);
    if (v && scoreVoice(v, { lang }) !== null) return v;
  }
  let best = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoice(v, { lang });
    if (s !== null && s > bestScore) { best = v; bestScore = s; }
  }
  return best;
}

export function createSpeech(deps = {}) {
  const g = () => deps.global || globalThis;
  const synth = () => deps.synth || g().speechSynthesis || null;
  const Utterance = () => deps.Utterance || g().SpeechSynthesisUtterance || null;
  const setTimer = deps.setTimeout || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimeout || ((id) => clearTimeout(id));
  const isMuted = deps.isMuted || (() => false);
  const onUnavailable = deps.onUnavailable || (() => {});
  const storage = () => {
    if (deps.storage !== undefined) return deps.storage;
    try { return g().localStorage || null; } catch (e) { return null; }
  };

  const queue = [];
  let current = null;       // { item, utterance, timer }
  let chosen;               // undefined = not picked yet, null = none usable
  let listening = false;
  let primed = false;

  function remembered() {
    try { const s = storage(); return s ? s.getItem(STORAGE_KEY) : null; } catch (e) { return null; }
  }
  function remember(uri) {
    try { const s = storage(); if (s) s.setItem(STORAGE_KEY, uri); } catch (e) { /* private mode */ }
  }

  function listen(s) {
    if (listening || !s.addEventListener) return;
    listening = true;
    s.addEventListener('voiceschanged', () => { chosen = undefined; });
  }

  /** The voice to use: a SpeechSynthesisVoice, 'default' (voices not loaded) or null. */
  function voice() {
    const s = synth();
    if (!s || !Utterance()) return null;
    listen(s);
    if (chosen !== undefined) return chosen;
    let list = [];
    try { list = s.getVoices() || []; } catch (e) { list = []; }
    if (!list.length) return 'default';           // not loaded yet: don't cache
    chosen = pickVoice(list, { preferredURI: remembered() });
    if (chosen) remember(chosen.voiceURI);
    return chosen;
  }

  function finish(result) {
    const c = current;
    if (!c) return;
    current = null;
    clearTimer(c.timer);
    c.item.resolve(result);
    pump();
  }

  function pump() {
    if (current || !queue.length) return;
    const item = queue.shift();
    if (isMuted()) { item.resolve(false); pump(); return; }
    const v = voice();
    if (!v) {
      item.resolve(false);
      try { onUnavailable(item.text); } catch (e) { /* ignore */ }
      pump();
      return;
    }
    const U = Utterance();
    const u = new U(item.text);
    if (v !== 'default') u.voice = v;
    u.lang = v !== 'default' && v.lang ? v.lang : 'en-US';
    u.rate = item.opts.rate != null ? item.opts.rate : KID_RATE;
    u.pitch = item.opts.pitch != null ? item.opts.pitch : KID_PITCH;
    u.volume = 1;
    const c = { item, utterance: u, timer: 0 };
    current = c;
    u.onend = () => { if (current === c) finish(true); };
    u.onerror = (e) => {
      if (current !== c) return;
      const err = e && e.error;
      if (err !== 'interrupted' && err !== 'canceled') {
        try { onUnavailable(item.text); } catch (x) { /* ignore */ }
      }
      finish(false);
    };
    // Watchdog: generous estimate of how long the words take.
    const ms = 2500 + (item.text.length * 110) / u.rate;
    c.timer = setTimer(() => { if (current === c) finish(true); }, ms);
    try {
      synth().speak(u);
    } catch (e) {
      finish(false);
    }
  }

  function say(text, opts = {}) {
    const t = String(text == null ? '' : text).trim();
    if (!t) return Promise.resolve(false);
    if (opts.interrupt) cancel();
    return new Promise((resolve) => {
      queue.push({ text: t, opts, resolve });
      pump();
    });
  }

  function cancel() {
    while (queue.length) queue.shift().resolve(false);
    const s = synth();
    if (current) {
      const c = current;
      current = null;
      clearTimer(c.timer);
      c.item.resolve(false);
    }
    try { if (s) s.cancel(); } catch (e) { /* ignore */ }
  }

  /** Speak a silent blank once, inside a user gesture (iOS unlock). */
  function prime() {
    if (primed) return;
    const s = synth();
    const U = Utterance();
    if (!s || !U) return;
    primed = true;
    if (current || queue.length) return;
    try {
      const u = new U(' ');
      u.volume = 0;
      s.speak(u);
    } catch (e) { /* ignore */ }
  }

  return {
    say,
    cancel,
    prime,
    voice,
    available: () => !!voice(),
    speaking: () => !!current,
    queued: () => queue.length,
    refresh() { chosen = undefined; },
  };
}
