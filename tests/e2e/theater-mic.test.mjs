// End-to-end: the theater mic, tapes, boombox and voice filters (P2b.5,
// P2b.6) with real (trusted) touches. Record 2 s at the mic (countdown dots,
// the level ring, Luna sings along) -> a tape pops out; the mic is released
// at once; drop the tape in the boombox: it plays the voice and Luna
// lip-syncs, the audience applauds; drop it on the robot box: it takes the
// filter and plays through it (and an OfflineAudioContext render proves the
// robot graph changes the sound); reload: the voice is still there and
// plays; a tape from the other iPad (no voice here) shows the far-away cloud
// and sings the built-in melody; permission denied: the mic shrugs and sings
// la la la (no error, no text); the parent menu deletes every recording.
// Nothing goes over the network the whole time.
//
// THE MIC: on this Mac, Chrome hangs in getUserMedia({audio}) even with the
// fake-device flags (openPage({fakeMic: true}); the browser's CoreAudio
// input query blocks, likely macOS microphone privacy for Chrome), so the
// page's getUserMedia is replaced by a stand-in that returns a real
// MediaStream from WebAudio (a 330 Hz voice pulsing twice a second). Every-
// thing after the device (MediaRecorder, the analyser, the blob store,
// decode, playback, filters) is the real thing.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const THEATER = 'theater/stage';

/** In-page stand-in for the microphone (see the header). window.__fakeMic.mode: 'ok' | 'denied' | 'nomic'. */
function installFakeMic() {
  const fm = window.__fakeMic = window.__fakeMic || { streams: [], mode: 'ok', calls: 0 };
  navigator.mediaDevices.getUserMedia = async () => {
    fm.calls++;
    if (fm.mode === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
    if (fm.mode === 'nomic') throw new DOMException('Requested device not found', 'NotFoundError');
    const ctx = fm.ctx || (fm.ctx = new AudioContext());
    await ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = 330;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 2;
    const amt = ctx.createGain();
    amt.gain.value = 0.4;
    lfo.connect(amt); amt.connect(g.gain);
    const dest = ctx.createMediaStreamDestination();
    osc.connect(g); g.connect(dest); osc.start(); lfo.start();
    fm.streams.push(dest.stream);
    return dest.stream;
  };
  return true;
}

/** Count every way the page could send something out (fetch, XHR, beacons, sockets, WebRTC). */
function installNetSpy() {
  const spy = window.__net = window.__net || { calls: [] };
  if (spy.installed) return true;
  spy.installed = true;
  const note = (what, url) => spy.calls.push(what + ' ' + String(url));
  const f = window.fetch;
  window.fetch = function (u, o) { note('fetch', u && u.url ? u.url : u); return f.apply(this, arguments); };
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { note('xhr', u); return open.apply(this, arguments); };
  if (navigator.sendBeacon) { const b = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = (u, d) => { note('beacon', u); return b(u, d); }; }
  const WS = window.WebSocket;
  window.WebSocket = function (u, p) { note('ws', u); return new WS(u, p); };
  if (window.RTCPeerConnection) { const P = window.RTCPeerConnection; window.RTCPeerConnection = function (c) { note('rtc', ''); return new P(c); }; }
  return true;
}

async function recordSounds(page) {
  await page.eval(async () => {
    if (window.__rec) return;
    const rec = window.__rec = { sounds: [] };
    const { sfx } = await import('./src/audio/index.js');
    const play = sfx.play;
    sfx.play = (name, opts) => { rec.sounds.push(name); return play(name, opts); };
  });
}

/** Sample a character's mouth atom every few ms (lip-sync evidence). */
const watchMouth = (page, id) => page.eval((id) => {
  clearInterval(window.__mouthT);
  window.__mouths = [];
  window.__mouthT = setInterval(() => {
    const i = window.__town.scene.chars.inspect(id);
    const m = i && i.atoms.mouth;
    if (m && window.__mouths[window.__mouths.length - 1] !== m) window.__mouths.push(m);
  }, 20);
}, id);
const mouths = (page) => page.eval(() => window.__mouths.slice());

const snd = (page) => page.eval(() => ({ st: window.__town.scene.sound.state(), stats: window.__town.scene.sound.stats() }));
const panTo = async (page, x) => { await page.eval((x) => window.__stage.camera.panTo(x), x); await page.waitFor(() => !window.__stage.camera.moving); await page.frames(3); };
const recButton = (page) => page.eval(() => {
  const el = window.__town.scene.sound.el.rec();
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  return { x, y, hit: window.__input.hitTest(x, y) === el };
});
const filterPoint = (page, name) => page.eval((name) => {
  const el = window.__town.scene.sound.el.filter(name);
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.55, hit: window.__input.hitTest(r.left + r.width / 2, r.top + r.height * 0.55) === el };
}, name);
const w2s = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
/** A screen point where a touch picks entity `id`. */
const entPoint = (page, id) => page.eval((id) => {
  const v = window.__town.scene.view.viewOf(id);
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === v.el) return { x, y };
  }
  return null;
}, id);
const tapes = (page) => page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'tape' && !e.deleted && e.props && e.props.env).map((e) => ({ id: e.id, x: e.x, y: e.y, room: e.room, props: e.props })));

describe('theater mic, tapes and voice filters (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await page.eval(() => window.__town.go('theater/stage'));
    await page.waitFor(() => window.__town.at === 'theater/stage' && !window.__town.busy, { timeout: 20000 });
    await page.eval(installFakeMic);
    await page.eval(installNetSpy);
    await recordSounds(page);
    S.luna = await page.eval((room) => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && e.room === room && e.props.cast === 'performer').id, THEATER);
    S.req0 = page.requests.length;
  });
  after(async () => { if (page) await page.close(); });

  it('record 2 s: a picture countdown, the level ring pulses, Luna sings at the mic; stop: a tape pops out and the mic is released', async () => {
    await panTo(page, 736);
    const b = await recButton(page);
    assert.ok(b.hit, 'the red dot takes the touch');
    await watchMouth(page, S.luna);
    await page.tap(b.x, b.y);
    // The countdown: three dots over the mic, then recording.
    await page.waitFor(() => window.__town.scene.sound.state().phase === 'count');
    assert.equal(await page.eval(() => [...document.querySelector('.mic-count').children].filter((d) => d.style.opacity === '1').length), 3, 'three dots');
    await page.waitFor(() => window.__town.scene.sound.state().phase === 'rec', { timeout: 10000 });
    assert.equal(await page.eval(() => window.__town.scene.pieces.shown('mic-stand')), 'rec', 'the mic stand shows its red light');
    // The ring follows the live level (AnalyserNode): it changes size.
    const scales = await page.eval(() => new Promise((resolve) => {
      const out = new Set();
      const t = setInterval(() => { out.add(document.querySelector('.mic-meter').style.transform); }, 40);
      setTimeout(() => { clearInterval(t); resolve([...out]); }, 1200);
    }));
    assert.ok(scales.length >= 3, `the ring pulses: ${scales.join(' ')}`);
    await page.waitFor(() => window.__town.scene.sound.state().elapsed >= 2, { timeout: 10000 });
    const m = await mouths(page);
    assert.ok(m.includes('sing') && m.includes('small'), `Luna's mouth opens and shuts with the voice: ${m.join(',')}`);
    await page.screenshot('theater-mic-recording');
    await page.tap(b.x, b.y);
    await page.waitFor(() => window.__town.scene.sound.state().phase !== 'rec');
    // Released at once: every track of every stream the page got has ended.
    const rel = await page.eval(() => ({ live: window.__town.scene.sound.state().micLive, states: window.__fakeMic.streams.flatMap((s) => s.getTracks().map((t) => t.readyState)) }));
    assert.equal(rel.live, false);
    assert.ok(rel.states.length >= 1 && rel.states.every((s) => s === 'ended'), `the mic is released: ${rel.states}`);
    await page.waitFor(() => window.__town.scene.sound.stats().recordings === 1, { timeout: 10000 });
    const [t] = await tapes(page);
    assert.ok(t, 'a recorded tape');
    S.tape = t.id;
    assert.equal(t.room, THEATER);
    assert.ok(t.props.dur >= 1.5 && t.props.dur <= 3.5, `about 2 s: ${t.props.dur}`);
    assert.ok(/^[0-9]+$/.test(t.props.env) && /[5-9]/.test(t.props.env) && t.props.env.length < 60, `an envelope: ${t.props.env}`);
    const blob = await page.eval(async (id) => { const b = await window.__persist.getBlob(id); return b ? { size: b.size, type: b.type } : null; }, S.tape);
    assert.ok(blob && blob.size > 500, `the voice is in the blob store: ${JSON.stringify(blob)}`);
    const st = await page.eval(() => window.__town.scene.sound.stats().mic);
    assert.equal(st.how, 'MediaRecorder');
    assert.ok(st.mime, 'a feature-detected mimeType');
    // Not in the op log: no envelope of bytes anywhere in the synced entity.
    assert.ok(JSON.stringify(await page.eval((id) => window.__store.state.entities[id], S.tape)).length < 2000, 'the tape entity stays small');
    await page.waitFor(() => !!window.__town.scene.view.viewOf(Object.values(window.__store.state.entities).find((e) => e.kind === 'tape' && e.props.env).id));
    await page.screenshot('theater-mic-tape');
  });

  it('the tape dropped in the boombox plays the voice; Luna lip-syncs; the audience applauds at the end', async () => {
    await panTo(page, 1300);
    const from = await entPoint(page, S.tape);
    assert.ok(from, 'a touch point on the tape');
    const to = await w2s(page, 2394, 200);
    await watchMouth(page, S.luna);
    await page.eval(() => { window.__rec.sounds.length = 0; });
    await page.drag(from, to, { steps: 18, durationMs: 450 });
    await page.waitFor((() => { const p = window.__town.scene.sound.state().playing; return p && p.where === 'boombox' && p.how === 'voice'; }), { timeout: 10000 });
    const e = await page.eval((id) => window.__store.state.entities[id], S.tape);
    assert.deepEqual([e.x, e.y], [2394, 228], 'the tape sits in the deck');
    assert.equal(await page.eval(() => window.__town.scene.pieces.shown('boombox')), 'play');
    await page.screenshot('theater-mic-boombox');
    await page.waitFor(() => !window.__town.scene.sound.state().playing, { timeout: 15000 });
    const m = await mouths(page);
    assert.ok(m.includes('sing') && m.includes('small'), `Luna lip-syncs to the tape: ${m.join(',')}`);
    await page.waitFor(() => window.__rec.sounds.includes('applause'), { timeout: 5000 });
    const st = (await snd(page)).stats;
    assert.ok(st.voice >= 1 && st.ends >= 1 && st.applause >= 1, JSON.stringify(st));
    assert.equal(await page.eval(() => window.__town.scene.pieces.shown('boombox')), 'idle', 'back to idle');
  });

  it('dropped on the robot box: the tape takes the robot filter, plays through it, and the robot graph changes the sound', async () => {
    const box = await filterPoint(page, 'robot');
    assert.ok(box.hit, 'the robot box takes touches');
    const from = await entPoint(page, S.tape);
    await page.drag(from, box, { steps: 18, durationMs: 450 });
    await page.waitFor((() => { const p = window.__town.scene.sound.state().playing; return p && p.where === 'robot' && p.filter === 'robot' && p.how === 'voice'; }), { timeout: 10000 });
    assert.equal(await page.eval((id) => window.__store.state.entities[id].props.filter, S.tape), 'robot');
    assert.equal(await page.eval((id) => !!window.__town.scene.view.viewOf(id).el.querySelector('[data-badge="robot"]'), S.tape), true, 'a robot badge on the tape');
    await page.screenshot('theater-mic-robot');
    // Render the recorded voice dry and through the robot graph, offline.
    const cmp = await page.eval(async (id) => {
      const { buildFilter } = await import('./src/audio/mic.js');
      const blob = await window.__persist.getBlob(id);
      const ab = await blob.arrayBuffer();
      const sr = 44100;
      const probe = new OfflineAudioContext(1, sr, sr);
      const voice = await probe.decodeAudioData(ab);
      const render = async (name) => {
        const ctx = new OfflineAudioContext(1, Math.ceil(voice.duration * sr), sr);
        const src = ctx.createBufferSource();
        src.buffer = voice;
        const f = buildFilter(ctx, name, ctx.destination);
        src.connect(f.input);
        src.start();
        return (await ctx.startRendering()).getChannelData(0);
      };
      const dry = await render(null), robot = await render('robot');
      let dd = 0, rr = 0, dr = 0;
      for (let i = 0; i < dry.length; i++) { dd += dry[i] * dry[i]; rr += robot[i] * robot[i]; dr += dry[i] * robot[i]; }
      // Zero crossings: a ring-modulated voice at 55 Hz has a different spectrum.
      const zc = (a) => { let n = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) n++; return n; };
      return { dryRms: Math.sqrt(dd / dry.length), robotRms: Math.sqrt(rr / robot.length), corr: dr / Math.sqrt(dd * rr), zcDry: zc(dry), zcRobot: zc(robot) };
    }, S.tape);
    assert.ok(cmp.dryRms > 0.01 && cmp.robotRms > 0.005, `both audible: ${JSON.stringify(cmp)}`);
    assert.ok(Math.abs(cmp.corr) < 0.8, `the robot output is not the dry voice: ${JSON.stringify(cmp)}`);
    await page.waitFor(() => !window.__town.scene.sound.state().playing, { timeout: 15000 });
  });

  it('a tap on a filter box previews it and makes it the live filter (it glows)', async () => {
    const box = await filterPoint(page, 'echo');
    await page.tap(box.x, box.y);
    await page.waitFor(() => window.__town.scene.sound.state().liveFilter === 'echo');
    assert.equal(await page.eval(() => window.__town.scene.sound.el.filter('echo').querySelector('.fbox-glow').style.opacity), '1');
    const st = await snd(page);
    assert.ok(st.stats.previews >= 1);
    await page.tap(box.x, box.y);
    await page.waitFor(() => window.__town.scene.sound.state().liveFilter === null);
  });

  it('reload: the tape and its voice are still there, and it plays', async () => {
    await page.eval(() => window.__persist.flush());
    await page.goto('index.html');
    await page.waitFor(() => window.__town.at === 'theater/stage' && !window.__town.busy, { timeout: 20000 });
    await page.eval(installNetSpy);
    await page.eval(installFakeMic);
    await recordSounds(page);
    const e = await page.eval((id) => window.__store.state.entities[id], S.tape);
    assert.ok(e && e.props.env && e.props.filter === 'robot', 'the tape, its envelope and filter');
    await page.waitFor(() => window.__town.scene.sound.state().localKnown, { timeout: 10000 });
    assert.equal(await page.eval((id) => window.__town.scene.sound.isLocal(id), S.tape), true, 'its voice is on this iPad');
    await panTo(page, 1300);
    const at = await entPoint(page, S.tape);
    assert.ok(at, 'the tape on the robot box');
    await page.tap(at.x, at.y);
    await page.waitFor((() => { const p = window.__town.scene.sound.state().playing; return p && p.how === 'voice' && p.filter === 'robot'; }), { timeout: 10000 });
    await page.waitFor(() => !window.__town.scene.sound.state().playing, { timeout: 15000 });
  });

  it('a tape from the other iPad (no voice here): a far-away cloud, and it sings the built-in melody with lip-sync', async () => {
    // What arrives from the other iPad: the tape entity (props only); its voice stays there.
    S.far = await page.eval(async (room) => {
      const { makeEnvelope } = await import('./src/engine/ops.js');
      const id = 'zz9far:1';
      const args = { id, kind: 'tape', room, x: 1700, y: 805, z: 3, props: { color: 'teal', env: '0099990099990000999999000', dur: 2, filter: 'giant', dev: 'zz9far' } };
      window.__store.receive(makeEnvelope('spawn', args, { id: 'zz9far:e1', device: 'zz9far', lamport: window.__store.clockState().lamport + 1, t: Date.now() }));
      return window.__store.state.entities[id] ? id : null;
    }, THEATER);
    assert.equal(S.far, 'zz9far:1', 'the other iPad\'s spawn applies');
    await page.waitFor(`(() => { const v = window.__town.scene.view.viewOf(${JSON.stringify(S.far)}); return v && !!v.el.querySelector('[data-badge="far"]'); })()`, { timeout: 5000 });
    await page.screenshot('theater-mic-far');
    await watchMouth(page, S.luna);
    const from = await entPoint(page, S.far);
    const to = await w2s(page, 2394, 200);
    await page.drag(from, to, { steps: 18, durationMs: 450 });
    await page.waitFor((() => { const p = window.__town.scene.sound.state().playing; return p && p.where === 'boombox' && p.how === 'lala'; }), { timeout: 10000 });
    assert.equal((await snd(page)).stats.far, 1);
    await page.waitFor(() => !window.__town.scene.sound.state().playing, { timeout: 15000 });
    const m = await mouths(page);
    assert.ok(m.includes('sing') && m.includes('small'), `lip-sync to the melody: ${m.join(',')}`);
  });

  it('permission denied: the mic shrugs and sings la la la; no tape, no error, no text', async () => {
    await panTo(page, 736);
    await page.eval(() => { window.__fakeMic.mode = 'denied'; });
    const before = (await tapes(page)).length;
    const b = await recButton(page);
    await page.tap(b.x, b.y);
    await page.waitFor(() => window.__town.scene.sound.stats().shrugs === 1);
    const s = await snd(page);
    assert.equal(s.st.denied, true);
    assert.equal(s.st.micLive, false);
    await page.waitFor((() => { const p = window.__town.scene.sound.state().playing; return p && p.where === 'mic' && p.how === 'lala'; }), { timeout: 5000 });
    assert.equal(await page.eval(() => window.__town.scene.sound.el.slash().style.display), 'block', 'the mic-with-a-slash picture');
    assert.equal(await page.eval(() => document.body.innerText.trim()), '', 'no words on screen');
    await page.screenshot('theater-mic-denied');
    // A second tap: straight to the shrug (no asking again this session).
    await page.waitFor(() => !window.__town.scene.sound.state().playing, { timeout: 10000 });
    const calls = await page.eval(() => window.__fakeMic.calls);
    await page.tap(b.x, b.y);
    await page.waitFor(() => window.__town.scene.sound.stats().shrugs === 2);
    assert.equal(await page.eval(() => window.__fakeMic.calls), calls);
    assert.equal((await tapes(page)).length, before, 'no tape');
    assert.deepEqual(page.errors, []);
  });

  it('nothing went over the network while recording and playing', async () => {
    assert.deepEqual(await page.eval(() => window.__net.calls.filter((c) => !/^fetch (\.?\/?)?(assets|data|src)\//.test(c.replace(location.origin + '/', '')))), [], 'no fetch/XHR/beacon/socket/WebRTC except the app\'s own files');
    const after = page.requests.slice(S.req0);
    const odd = after.filter((u) => !u.startsWith(page.baseUrl) || !/\/(assets|src|data)\/|index\.html|sw\.js|manifest\.webmanifest|\/$|\.css$/.test(u.replace(page.baseUrl, '/')));
    assert.deepEqual(odd, [], 'only the app\'s own static files');
    assert.deepEqual(page.externalRequests(), []);
  });

  it('parent menu: "Delete all recordings" (with a confirm) removes every recording and its voice', async () => {
    await page.eval(() => window.__parentMenu.open());
    await page.tapElement('[data-pm="recordings"]');
    await page.waitFor(() => !document.querySelector('.pm-confirm').hidden);
    await page.tapElement('[data-pm="yes"]');
    await page.waitFor(() => /Deleted/.test(document.querySelector('.pm-status').textContent), { timeout: 10000 });
    assert.deepEqual(await tapes(page), []);
    assert.deepEqual(await page.eval(() => window.__persist.blobIds()), []);
    await page.eval(() => window.__parentMenu.close());
    assert.deepEqual(page.errors, []);
  });
});
