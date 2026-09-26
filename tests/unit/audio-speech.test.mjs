// speechSynthesis wrapper: offline voice picking, the queue, fallbacks.
// Also the clip loader (decode into the clips bus).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, scoreVoice, createSpeech, KID_RATE, KID_PITCH } from '../../src/audio/speech.js';
import { createClips, decode } from '../../src/audio/clips.js';
import { createAudioCore } from '../../src/audio/context.js';
import { FakeAudioContext, reaches } from './fake-audio.mjs';

const V = (name, lang, local = true, extra = {}) => ({ name, lang, localService: local, voiceURI: `uri:${name}`, default: false, ...extra });

const IPAD_VOICES = [
  V('Albert', 'en-US'), V('Bad News', 'en-US'), V('Zarvox', 'en-US'), V('Bells', 'en-US'),
  V('Daniel', 'en-GB'), V('Karen', 'en-AU'), V('Amélie', 'fr-CA'), V('Samantha', 'en-US'),
  V('Google US English', 'en-US', false), V('Moira', 'en-IE'),
];

test('pickVoice: a friendly, local en-US voice beats novelty, remote and other languages', () => {
  assert.equal(pickVoice(IPAD_VOICES).name, 'Samantha');
  assert.equal(pickVoice([V('Samantha', 'en-US'), V('Ava (Enhanced)', 'en-US')]).name, 'Ava (Enhanced)');
  assert.equal(pickVoice([V('Fred', 'en-US'), V('Rocko', 'en-US')]).name, 'Rocko', 'Eloquence voice over novelty');
  assert.equal(pickVoice([V('Samantha', 'en_US')]).name, 'Samantha', 'Android-style underscore');
});

test('pickVoice: falls back to other English, then to nothing', () => {
  assert.equal(pickVoice([V('Daniel', 'en-GB'), V('Thomas', 'fr-FR')]).name, 'Daniel');
  assert.equal(pickVoice([V('Google US English', 'en-US', false)]), null, 'network voices fail offline');
  assert.equal(pickVoice([V('Thomas', 'fr-FR'), V('Anna', 'de-DE')]), null);
  assert.equal(pickVoice([V('Zarvox', 'en-US'), V('Bubbles', 'en-US')]), null);
  assert.equal(pickVoice([]), null);
  assert.equal(pickVoice(undefined), null);
});

test('pickVoice: honors the remembered voice while it is still usable', () => {
  assert.equal(pickVoice(IPAD_VOICES, { preferredURI: 'uri:Moira' }).name, 'Moira');
  assert.equal(pickVoice(IPAD_VOICES, { preferredURI: 'uri:Zarvox' }).name, 'Samantha');
  assert.equal(pickVoice(IPAD_VOICES, { preferredURI: 'uri:gone' }).name, 'Samantha');
  assert.equal(scoreVoice(V('Samantha', 'en-US', undefined)) > 0, true, 'localService missing counts as local');
});

// ---- a fake speechSynthesis ----
function fakeSynth(voices = IPAD_VOICES) {
  const s = new EventTarget();
  s.voices = voices;
  s.spoken = [];
  s.cancelled = 0;
  s.getVoices = () => s.voices;
  s.speak = (u) => { s.spoken.push(u); };
  s.cancel = () => { s.cancelled++; };
  return s;
}
class FakeUtterance { constructor(text) { this.text = text; } }

function setup(opts = {}) {
  const synth = opts.synth === undefined ? fakeSynth() : opts.synth;
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const timers = [];
  const unavailable = [];
  let muted = false;
  const speech = createSpeech({
    synth, Utterance: FakeUtterance, storage,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    isMuted: () => muted,
    onUnavailable: (t) => unavailable.push(t),
  });
  return { speech, synth, store, timers, unavailable, mute: (m) => { muted = m; } };
}

test('say: kid-friendly rate and pitch, chosen voice, remembered', async () => {
  const { speech, synth, store } = setup();
  const p = speech.say('cat');
  assert.equal(synth.spoken.length, 1);
  const u = synth.spoken[0];
  assert.equal(u.text, 'cat');
  assert.equal(u.voice.name, 'Samantha');
  assert.equal(u.lang, 'en-US');
  assert.equal(u.rate, KID_RATE);
  assert.equal(u.pitch, KID_PITCH);
  assert.ok(u.rate < 1 && u.pitch > 1);
  assert.equal(store.get('ourtown.voice'), 'uri:Samantha');
  u.onend();
  assert.equal(await p, true);
});

test('say: queues one utterance at a time, in order', async () => {
  const { speech, synth } = setup();
  const done = [];
  const ps = ['a', 'b', 'c'].map((w) => speech.say(w).then((r) => done.push([w, r])));
  assert.equal(synth.spoken.length, 1);
  assert.equal(speech.queued(), 2);
  synth.spoken[0].onend();
  assert.equal(synth.spoken.length, 2);
  assert.equal(synth.spoken[1].text, 'b');
  synth.spoken[1].onend();
  synth.spoken[2].onend();
  await Promise.all(ps);
  assert.deepEqual(done, [['a', true], ['b', true], ['c', true]]);
  assert.equal(speech.speaking(), false);
});

test('say with interrupt: clears the queue and speaks right away', async () => {
  const { speech, synth } = setup();
  const a = speech.say('one');
  const b = speech.say('two');
  const c = speech.say('now', { interrupt: true });
  assert.equal(await a, false);
  assert.equal(await b, false);
  assert.ok(synth.cancelled >= 1);
  assert.equal(synth.spoken[synth.spoken.length - 1].text, 'now');
  synth.spoken[synth.spoken.length - 1].onend();
  assert.equal(await c, true);
});

test('watchdog: a lost onend (iOS backgrounding) does not stall the queue', async () => {
  const { speech, synth, timers } = setup();
  const a = speech.say('hello');
  const b = speech.say('there');
  assert.ok(timers[0].ms > 2000);
  timers[0].fn();                         // onend never came
  assert.equal(await a, true);
  assert.equal(synth.spoken[1].text, 'there');
  synth.spoken[1].onend();
  assert.equal(await b, true);
  assert.equal(timers[1].cleared, true);
});

test('no speechSynthesis at all: resolves false and falls back (picture + chime)', async () => {
  const { speech, unavailable } = setup({ synth: null });
  // deps.synth null falls through to globalThis.speechSynthesis, absent in Node.
  assert.equal(await speech.say('dog'), false);
  assert.deepEqual(unavailable, ['dog']);
  assert.equal(speech.available(), false);
});

test('only unusable voices: falls back; voiceschanged re-picks', async () => {
  const synth = fakeSynth([V('Thomas', 'fr-FR'), V('Google US English', 'en-US', false)]);
  const { speech, unavailable } = setup({ synth });
  assert.equal(await speech.say('sun'), false);
  assert.deepEqual(unavailable, ['sun']);
  synth.voices = IPAD_VOICES;
  synth.dispatchEvent(new Event('voiceschanged'));
  const p = speech.say('sun');
  assert.equal(synth.spoken[0].voice.name, 'Samantha');
  synth.spoken[0].onend();
  assert.equal(await p, true);
});

test('voices not loaded yet: speaks with the default English voice, does not cache', async () => {
  const synth = fakeSynth([]);
  const { speech } = setup({ synth });
  const p = speech.say('hi');
  assert.equal(synth.spoken[0].voice, undefined);
  assert.equal(synth.spoken[0].lang, 'en-US');
  synth.spoken[0].onend();
  assert.equal(await p, true);
  synth.voices = IPAD_VOICES;
  speech.say('again');
  assert.equal(synth.spoken[1].voice.name, 'Samantha');
});

test('speech errors: a real error falls back, a cancel does not', async () => {
  const { speech, synth, unavailable } = setup();
  const a = speech.say('x');
  synth.spoken[0].onerror({ error: 'synthesis-failed' });
  assert.equal(await a, false);
  assert.deepEqual(unavailable, ['x']);
  const b = speech.say('y');
  synth.spoken[1].onerror({ error: 'interrupted' });
  assert.equal(await b, false);
  assert.deepEqual(unavailable, ['x']);
});

test('muted: nothing is spoken; empty text is ignored', async () => {
  const { speech, synth, mute } = setup();
  mute(true);
  assert.equal(await speech.say('quiet'), false);
  mute(false);
  assert.equal(await speech.say('   '), false);
  assert.equal(synth.spoken.length, 0);
});

test('prime: one silent utterance, only once', () => {
  const { speech, synth } = setup();
  speech.prime();
  speech.prime();
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].volume, 0);
});

// ---- clips ----
function clipSetup(files) {
  class AC extends FakeAudioContext { constructor() { super({ state: 'running' }); } }
  const core = createAudioCore({ AudioContext: AC, document: new EventTarget(), now: () => 0 });
  const fetched = [];
  const clips = createClips(core, {
    fetch: async (url) => {
      fetched.push(url);
      if (!(url in files)) return { ok: false, status: 404 };
      return { ok: true, arrayBuffer: async () => files[url] };
    },
  });
  return { core, clips, fetched };
}

test('clips: load decodes once into a buffer and plays through the clips bus', async () => {
  const { core, clips, fetched } = clipSetup({ 'assets/audio/sizzle.m4a': new ArrayBuffer(8) });
  const [b1, b2] = await Promise.all([
    clips.load('sizzle', 'assets/audio/sizzle.m4a'),
    clips.load('sizzle', 'assets/audio/sizzle.m4a'),
  ]);
  assert.ok(b1 && b1 === b2);
  assert.equal(fetched.length, 1);
  assert.ok(clips.has('sizzle'));
  const h = clips.play('sizzle', { loop: true, gain: 0.5, rate: 1.2 });
  const g = core.get(false);
  const src = h.source;
  assert.equal(src.loop, true);
  assert.equal(src.playbackRate.value, 1.2);
  assert.ok(reaches(src, g.clips));
  assert.ok(reaches(g.clips, g.ctx.destination));
  h.stop();
  assert.ok(src.stoppedAt > src.startedAt);
});

test('clips: failures and unknown names are quiet no-ops', async () => {
  const { clips } = clipSetup({ 'empty.m4a': new ArrayBuffer(0) });
  const warn = console.warn;
  const warnings = [];
  console.warn = (m) => warnings.push(m);
  try {
    assert.equal(await clips.load('nope', 'missing.m4a'), null);
    assert.equal(await clips.load('bad', 'empty.m4a'), null);
    assert.deepEqual(await clips.loadAll({ nope: 'missing.m4a' }), []);
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 3);
  assert.equal(clips.play('nope'), null);
  assert.equal(clips.play('never-loaded'), null);
});

test('decode: supports the promise form of decodeAudioData too', async () => {
  const buf = { duration: 1 };
  assert.equal(await decode({ decodeAudioData: () => Promise.resolve(buf) }, new ArrayBuffer(1)), buf);
  await assert.rejects(decode({ decodeAudioData: () => { throw new Error('boom'); } }, new ArrayBuffer(1)));
});
