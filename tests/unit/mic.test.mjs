// Unit: the theater mic (P2b.5/P2b.6): the WAV encoder, envelope extraction,
// the tape model, the voice filter graphs, the recorder's permission and
// release rules (fake audio / media), and the filter box geometry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeAudioContext, FakeParam, reaches } from './fake-audio.mjs';
import {
  encodeWav, decodeWav, pickMimeType, buildFilter, filterRate, crushCurve, FILTERS, lalaEnv, lalaNotes, tuneFreq, createMic, LALA_TUNE,
} from '../../src/audio/mic.js';
import {
  envelopeOf, levelsOf, packEnv, unpackEnv, levelAt, syllables, recordedTapeProps, recordingIds, deleteRecordings, isRecorded,
  HOP, MAX_SEC, FILTER_NAMES,
} from '../../src/core/tapes.js';
import { filterBoxes, filterAt, filterSpot, inDeck, onFilter, DECK, soundArt, filterBoxHtml, FILTER_ICONS } from '../../src/scenes/theater-sound.js';

// The fake context plus the nodes the filters and the recorder use.
class Ctx extends FakeAudioContext {
  createDelay(max = 1) { const n = this._node('delay'); n.maxDelayTime = max; n.delayTime = new FakeParam(n, 'delayTime', 0); return n; }
  createWaveShaper() { const n = this._node('shaper'); n.curve = null; return n; }
  createAnalyser() { const n = this._node('analyser'); n.fftSize = 2048; n.getByteTimeDomainData = (a) => a.fill(128); return n; }
  createMediaStreamSource(stream) { const n = this._node('mic'); n.stream = stream; return n; }
  createScriptProcessor() { const n = this._node('script'); return n; }
  _node(kind) { const n = this.createGain(); n.kind = kind; delete n.gain; return n; }
}
const core = (ctx) => {
  const sfx = ctx.createGain(), clips = ctx.createGain();
  sfx.connect(ctx.destination); clips.connect(ctx.destination);
  return { get: () => ({ ctx, sfx, clips }), isMuted: () => false, canPlay: () => true };
};

test('encodeWav writes a 16-bit mono PCM RIFF file that decodes back', () => {
  const sr = 22050;
  const a = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
  const b = new Float32Array([0.25, -0.25]);
  const ab = encodeWav([a, b], sr);
  const v = new DataView(ab);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(ab, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(str(12, 4), 'fmt ');
  assert.equal(str(36, 4), 'data');
  assert.equal(ab.byteLength, 44 + 9 * 2);
  assert.equal(v.getUint32(4, true), ab.byteLength - 8);
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 1, 'mono');
  assert.equal(v.getUint32(24, true), sr);
  assert.equal(v.getUint32(28, true), sr * 2, 'byte rate');
  assert.equal(v.getUint16(34, true), 16, 'bits');
  assert.equal(v.getInt16(44 + 3 * 2, true), 32767, 'full scale +');
  assert.equal(v.getInt16(44 + 4 * 2, true), -32768, 'full scale -');
  assert.equal(v.getInt16(44 + 5 * 2, true), 32767, 'clipped');
  const back = decodeWav(ab);
  assert.equal(back.sampleRate, sr);
  assert.equal(back.samples.length, 9);
  for (const [i, want] of [[0, 0], [1, 0.5], [2, -0.5], [7, 0.25], [8, -0.25]]) assert.ok(Math.abs(back.samples[i] - want) < 1e-3, `sample ${i}`);
  assert.equal(encodeWav(new Float32Array(0), 8000).byteLength, 44, 'empty take: just the header');
});

test('envelopeOf: RMS per hop, normalised to the loudest step, gated, 0..9', () => {
  const sr = 1000, hop = 0.1;
  const s = new Float32Array(sr);   // 1 s: loud, quiet, silent, half, loud...
  const amp = [1, 0.05, 0, 0.5, 1, 0, 0.3, 0, 1, 0];
  for (let i = 0; i < s.length; i++) s[i] = amp[Math.floor(i / 100)] * (i % 2 ? 1 : -1);
  const env = envelopeOf(s, sr, hop);
  assert.deepEqual(env, [9, 0, 0, 5, 9, 0, 3, 0, 9, 0]);
  assert.deepEqual(envelopeOf(new Float32Array(500), sr, hop), [0, 0, 0, 0, 0], 'silence is all zeros');
  assert.equal(envelopeOf(new Float32Array(1050), sr, hop).length, 11, 'a partial last step counts');
  assert.deepEqual(levelsOf([0.2, 0.1, 0.01, 0]), [9, 5, 0, 0]);
});

test('env strings: pack, unpack, levelAt, capped at MAX_SEC', () => {
  const lv = [0, 3, 9, 12, -1, 5];
  const env = packEnv(lv);
  assert.equal(env, '039905');
  assert.deepEqual(unpackEnv(env), [0, 3, 9, 9, 0, 5]);
  assert.equal(levelAt(env, 0), 0);
  assert.equal(levelAt(env, HOP * 2 + 0.01), 9);
  assert.equal(levelAt(env, 100), 0, 'past the end');
  assert.equal(levelAt('', 0), 0);
  assert.equal(packEnv(new Array(5000).fill(4)).length, Math.round(MAX_SEC / HOP), 'a minute at most');
  assert.ok(Math.round(MAX_SEC / HOP) <= 750, 'small enough for entity props');
});

test('syllables: runs over the threshold, short gaps bridged', () => {
  assert.deepEqual(syllables([0, 5, 6, 0, 0, 4, 0, 7, 7, 7]), [[1, 3], [5, 6], [7, 10]]);
  assert.deepEqual(syllables([0, 5, 6, 0, 0, 4, 0, 7], { gap: 2 }), [[1, 3], [5, 8]]);
  assert.deepEqual(syllables([0, 1, 2, 0]), []);
});

test('the tape model: recorded props, ids, deleting every recording and its voice', async () => {
  const p = recordedTapeProps({ levels: [0, 9, 4], duration: 2.345, filter: 'robot', device: 'abc', color: 'teal' });
  assert.deepEqual(p, { color: 'teal', env: '094', dur: 2.3, filter: 'robot', dev: 'abc' });
  assert.deepEqual(recordedTapeProps({ levels: [], duration: 99, filter: 'nope', color: 'plaid' }), { color: 'pink', env: '', dur: MAX_SEC });
  assert.ok(isRecorded({ kind: 'tape', props: { env: '12' } }));
  assert.ok(!isRecorded({ kind: 'tape', props: { color: 'pink' } }), 'a blank tape');
  const state = { entities: {
    a: { id: 'a', kind: 'tape', props: { env: '19' } },
    b: { id: 'b', kind: 'tape', props: { color: 'pink' } },
    c: { id: 'c', kind: 'tape', props: { env: '5' }, deleted: true },
    d: { id: 'd', kind: 'egg', props: {} },
    e: { id: 'e', kind: 'tape', props: { env: '77' } },
  } };
  assert.deepEqual(recordingIds(state), ['a', 'e']);
  const ops = [];
  const store = { state, dispatch: (op, args) => { ops.push([op, args]); if (op === 'remove') state.entities[args.id].deleted = true; return true; } };
  const blobs = new Map([['a', 1], ['c', 1], ['gone', 1], ['d', 1]]);
  let flushed = 0;
  const persist = { blobIds: async () => [...blobs.keys()], deleteBlob: async (id) => { blobs.delete(id); }, flush: async () => { flushed++; } };
  const r = await deleteRecordings(store, persist);
  assert.deepEqual(ops, [['remove', { id: 'a', hard: true }], ['remove', { id: 'e', hard: true }]], 'hard removes: the other iPad loses them too');
  assert.deepEqual(r, { tapes: 2, blobs: 3 });
  assert.deepEqual([...blobs.keys()], ['d'], 'an egg\'s blob (a painting, say) stays');
  assert.equal(flushed, 1);
});

test('pickMimeType: audio/mp4 first (Safari 16), then webm; "" lets it choose; null without MediaRecorder', () => {
  const MR = (ok) => ({ isTypeSupported: (t) => ok.includes(t) });
  assert.equal(pickMimeType(MR(['audio/webm', 'audio/mp4'])), 'audio/mp4');
  assert.equal(pickMimeType(MR(['audio/webm;codecs=opus', 'audio/webm'])), 'audio/webm;codecs=opus');
  assert.equal(pickMimeType(MR([])), '');
  assert.equal(pickMimeType({}), '');
  assert.equal(pickMimeType(undefined), null);
});

test('voice filters: every graph reaches the destination, starts its oscillators, and stops cleanly', () => {
  for (const name of [...FILTER_NAMES, null, 'nope']) {
    const ctx = new Ctx({ state: 'running' });
    const f = buildFilter(ctx, name, ctx.destination);
    assert.ok(reaches(f.input, ctx.destination), `${name}: input -> destination`);
    for (const o of f.oscs) assert.equal(o.startedAt, 0, `${name}: oscillators start now`);
    assert.equal(f.rate, filterRate(name));
    f.stop();
    for (const o of f.oscs) assert.ok(o.stoppedAt !== undefined, `${name}: oscillators stop`);
    for (const n of f.nodes) assert.ok(n.disconnected, `${name}: ${n.kind} disconnected`);
    f.stop();   // twice is fine
  }
  assert.equal(filterRate('chipmunk'), 1.6);
  assert.equal(filterRate('giant'), 0.65);
  assert.equal(filterRate('chipmunk', true), 1, 'live: no rate change');
  assert.equal(filterRate(null), 1);
  assert.deepEqual(Object.keys(FILTERS).sort(), FILTER_NAMES.slice().sort());
});

test('voice filters: the shapes of the graphs', () => {
  const kinds = (name) => { const ctx = new Ctx(); const f = buildFilter(ctx, name, ctx.destination); return { f, kinds: f.nodes.map((n) => n.kind) }; };
  // robot: ring modulation (an oscillator driving a gain's gain) plus a bit-crush shaper
  const robot = kinds('robot');
  const ringGain = robot.f.nodes.find((n) => n.kind === 'gain' && robot.f.oscs.some((o) => o.outputs.includes(n.gain)));
  assert.ok(ringGain, 'an oscillator drives a gain (ring mod)');
  assert.equal(ringGain.gain.value, 0, 'the ring gain rests at 0: out = in x sine');
  assert.equal(robot.f.oscs[0].frequency.value, 55);
  const shaper = robot.f.nodes.find((n) => n.kind === 'shaper');
  assert.ok(shaper && shaper.curve && shaper.curve.length > 100, 'bit-crush curve');
  // echo: a feedback loop through a delay
  const echo = kinds('echo');
  const d = echo.f.nodes.find((n) => n.kind === 'delay');
  assert.ok(d && reaches(d, d) === true, 'the delay feeds back into itself');
  const loop = new Set();
  const walk = (n, depth) => { if (depth > 6) return false; for (const o of n.outputs) { if (o === d) return true; if (!loop.has(o) && o.outputs) { loop.add(o); if (walk(o, depth + 1)) return true; } } return false; };
  assert.ok(walk(d, 0), 'delay -> ... -> delay');
  assert.equal(d.delayTime.value, 0.32);
  // underwater: a lowpass whose frequency wobbles; alien: vibrato (a delay time driven by an LFO) + ring mod
  const uw = kinds('underwater');
  const lp = uw.f.nodes.find((n) => n.kind === 'biquad' && n.type === 'lowpass');
  assert.ok(lp && uw.f.nodes.some((n) => n.outputs.includes(lp.frequency)), 'the lowpass frequency is modulated');
  const al = kinds('alien');
  const vib = al.f.nodes.find((n) => n.kind === 'delay');
  assert.ok(al.f.nodes.some((n) => n.outputs.includes(vib.delayTime)), 'vibrato: an LFO moves the delay time');
  assert.ok(al.f.oscs.some((o) => o.frequency.value === 420), 'ring mod at 420 Hz');
  // chipmunk / giant: shelves
  assert.ok(kinds('chipmunk').f.nodes.some((n) => n.type === 'highshelf'));
  assert.ok(kinds('giant').f.nodes.some((n) => n.type === 'lowshelf'));
  // crush curve is a staircase in -1..1
  const c = crushCurve(4, 9);
  assert.deepEqual([...c], [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);
});

test('the built-in singer: the default tune\'s envelope and one "la" per syllable', () => {
  const env = lalaEnv();
  const notes = lalaNotes(env);
  assert.equal(notes.length, LALA_TUNE.length, 'a note per tune step');
  assert.ok(notes.every((n, i) => i === 0 || n.at > notes[i - 1].at), 'in order');
  assert.equal(notes[0].f, tuneFreq(0));
  assert.ok(Math.abs(tuneFreq(5) / tuneFreq(0) - 2) < 1e-9, 'degree 5 is an octave up');
  assert.equal(lalaNotes('000000').length, 0, 'silence: no notes');
  assert.equal(lalaNotes('0990990990').length, 3, 'a far-away tape sings its syllables');
});

// ---- the recorder, with fake media ----
function fakeMedia({ fail = null } = {}) {
  const tracks = [];
  const nav = { mediaDevices: { getUserMedia: async () => {
    if (fail) { const e = new Error(fail); e.name = fail; throw e; }
    const t = { kind: 'audio', readyState: 'live', stop() { this.readyState = 'ended'; } };
    tracks.push(t);
    return { getTracks: () => [t], getAudioTracks: () => [t] };
  } } };
  return { nav, tracks };
}
class FakeRecorder {
  constructor(stream, opts) { this.stream = stream; this.mimeType = (opts && opts.mimeType) || 'audio/webm'; this.state = 'inactive'; FakeRecorder.last = this; }
  static isTypeSupported(t) { return t === 'audio/mp4'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable({ data: new Blob([new Uint8Array(10)], { type: this.mimeType }) }); this.onstop(); }, 0); }
}

test('recorder: MediaRecorder with audio/mp4; the mic is released the moment it stops', async () => {
  const ctx = new Ctx({ state: 'running' });
  ctx.decodeAudioData = (ab, ok, bad) => bad(new Error('fake: no decoder'));   // the live envelope and clock then
  const { nav, tracks } = fakeMedia();
  let t = 0;
  const mic = createMic(core(ctx), { navigator: nav, MediaRecorder: FakeRecorder, now: () => t, setInterval: () => 1, clearInterval: () => {} });
  await mic.open();
  assert.equal(mic.live, true);
  assert.equal(mic.begin({ filter: 'robot' }), 'MediaRecorder');
  assert.equal(FakeRecorder.last.mimeType, 'audio/mp4');
  assert.ok(ctx.nodes.some((n) => n.kind === 'mic'), 'a live source for the level meter');
  const monitor = ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.length && n.gain && n.gain.value === 0 && n.outputs[0] !== ctx.destination);
  assert.ok(monitor, 'the live filter feeds a silent monitor (no speakers: feedback)');
  t = 2000;
  const p = mic.stop();
  assert.equal(tracks[0].readyState, 'ended', 'released synchronously');
  assert.equal(mic.live, false);
  const take = await p;
  assert.equal(take.type, 'audio/mp4');
  assert.equal(take.blob.size, 10);
  assert.equal(take.duration, 2);
  assert.ok(Array.isArray(take.levels));
  assert.equal(mic.stats().released, 1);
});

test('recorder: no MediaRecorder -> PCM captured and encoded as WAV', async () => {
  const ctx = new Ctx({ state: 'running' });
  ctx.decodeAudioData = (ab, ok, bad) => bad(new Error('fake: no decoder'));
  const { nav, tracks } = fakeMedia();
  const mic = createMic(core(ctx), { navigator: nav, MediaRecorder: null, now: () => 0, setInterval: () => 1, clearInterval: () => {} });
  await mic.open();
  assert.equal(mic.begin(), 'wav');
  const proc = ctx.nodes.find((n) => n.kind === 'script');
  proc.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array([0.5, -0.5, 0.25]) } });
  const take = await mic.stop();
  assert.equal(tracks[0].readyState, 'ended');
  assert.equal(take.type, 'audio/wav');
  const back = decodeWav(await take.blob.arrayBuffer());
  assert.equal(back.samples.length, 3);
  assert.equal(back.sampleRate, 48000);
});

test('recorder: denied / no mic become codes (the theater shrugs, never an error)', async () => {
  const ctx = new Ctx();
  for (const [deps, code] of [
    [{ navigator: fakeMedia({ fail: 'NotAllowedError' }).nav }, 'denied'],
    [{ navigator: fakeMedia({ fail: 'NotFoundError' }).nav }, 'nomic'],
    [{ navigator: {} }, 'nomic'],
    [{ navigator: { mediaDevices: {} } }, 'nomic'],
  ]) {
    const mic = createMic(core(ctx), deps);
    await assert.rejects(mic.open(), (e) => e.code === code);
    assert.equal(mic.live, false);
  }
});

test('filter boxes: six picture boxes, kid-sized, not overlapping; drop spots and deck detection', () => {
  const boxes = filterBoxes();
  assert.deepEqual(boxes.map((b) => b.name), FILTER_NAMES);
  for (let i = 0; i < boxes.length; i++) {
    assert.ok(boxes[i].w >= 78 && boxes[i].h >= 78, 'at least 64 pt on the iPad Air (0.82 px per unit)');
    if (i) assert.ok(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].w, 'no overlap');
    const s = filterSpot(boxes[i].name);
    assert.equal(filterAt(s.x, s.y + 20), boxes[i].name);
    assert.equal(onFilter({ x: s.x, y: s.y }), boxes[i].name);
  }
  assert.equal(filterAt(100, 100), null);
  assert.ok(inDeck({ x: DECK.x, y: DECK.y }));
  assert.ok(!inDeck({ x: DECK.x, y: DECK.y, parent: 'p' }));
  const art = soundArt();
  assert.equal(art.length, 7);
  assert.ok(art.every((a) => a.id && a.w > 0 && a.h > 0));
  for (const n of FILTER_NAMES) {
    assert.ok(FILTER_ICONS[n].includes('<'), n);
    assert.ok(!/>[^<\s][^<]*</.test(filterBoxHtml(n)), `${n}: no text in the box`);
  }
});
