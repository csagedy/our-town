// End-to-end audio: a real touch tap unlocks and resumes the AudioContext and
// plays the boot boing; the context comes back after being suspended; every
// sound plays without errors and cleans up; every recipe renders to sane
// samples in an OfflineAudioContext (we can't listen in headless Chrome, so we
// measure: level, soft attack, silent tail, little energy above 5kHz, no NaN,
// no clipping when mashed through the master bus); speech resolves either way;
// and the dev sound board works.
//
// Caveat: page.eval() runs with userGesture, which gives Chrome "sticky"
// activation, so Chrome itself would allow resume() without the tap. What the
// tap proves is that our listeners create and resume the context from inside
// the gesture (the part iOS needs); the unit tests cover interrupted/refused.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const AUDIO = './src/audio/index.js';

describe('audio on the boot stage (iPad Air, touch)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-air', path: 'index.html?room=buddy' }); });
  after(async () => { if (page) await page.close(); });

  const info = () => page.eval(async (url) => {
    const a = await import(url);
    return { state: a.audioState(), created: a.audio.stats.created, attempts: a.audio.stats.unlockAttempts, played: a.sfx.stats.played, dropped: a.sfx.stats.dropped };
  }, AUDIO);

  it('has no AudioContext before the first tap', async () => {
    assert.deepEqual(await info(), { state: 'none', created: 0, attempts: 0, played: 0, dropped: 0 });
  });

  it('a touch tap on the buddy creates, unlocks and resumes the context and plays a boing', async () => {
    await page.tapElement('.buddy');
    await page.waitFor(() => document.querySelector('.buddy').dataset.squishes === '1');
    await page.waitFor(async () => (await import('./src/audio/index.js')).audioState() === 'running');
    const r = await info();
    // Chrome may start the new context already running (sticky activation, see
    // the caveat above), in which case no resume() was needed.
    assert.equal(r.created, 1, 'the tap created the one AudioContext');
    assert.equal(r.played, 1, 'the boing was scheduled');
    assert.equal(r.dropped, 0);
    assert.deepEqual(page.errors, []);
  });

  it('an interrupted/suspended context is resumed by the next tap', async () => {
    const s = await page.eval(async (url) => {
      const a = await import(url);
      await a.audio.get(false).ctx.suspend();
      return a.audioState();
    }, AUDIO);
    assert.equal(s, 'suspended');
    await page.tapElement('.buddy');
    await page.waitFor(() => document.querySelector('.buddy').dataset.squishes === '2');
    await page.waitFor(async () => (await import('./src/audio/index.js')).audioState() === 'running');
    const r = await info();
    assert.ok(r.attempts >= 1, 'the tap called resume()');
    assert.equal(r.created, 1, 'same context, resumed, not replaced');
    assert.equal(r.played, 2, `the boing in the resuming tap was kept: ${JSON.stringify(r)}`);
  });

  it('suspends when the page is hidden and resumes when it is visible again', async () => {
    const states = await page.eval(async (url) => {
      const a = await import(url);
      const setVis = (v) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      const until = async (want) => { const t0 = performance.now(); while (a.audioState() !== want && performance.now() - t0 < 10000) await new Promise((r) => setTimeout(r, 20)); return a.audioState(); };
      setVis('hidden');
      const hidden = await until('suspended');
      setVis('visible');
      const visible = await until('running');
      delete document.visibilityState;
      return { hidden, visible };
    }, AUDIO);
    assert.deepEqual(states, { hidden: 'suspended', visible: 'running' });
  });

  it('plays every sound with no errors, and voices clean up when done', async () => {
    const r = await page.eval(async (url) => {
      const a = await import(url);
      const handles = [];
      for (const name of a.sfx.names) {
        while (a.sfx.activeVoices() >= 12) await new Promise((res) => setTimeout(res, 30));
        handles.push([name, !!a.sfx.play(name, { gain: 0.5 })]);
        a.sfx.play(name, { pitch: 1.5, pan: -0.5, gain: 0.3 });
      }
      for (let i = 0; i < 20; i++) a.sfx.play('plink');
      const t0 = performance.now();
      while (a.sfx.activeVoices() > 0 && performance.now() - t0 < 20000) await new Promise((res) => setTimeout(res, 50));
      return { handles, left: a.sfx.activeVoices(), count: a.sfx.names.length };
    }, AUDIO);
    assert.ok(r.count >= 15);
    for (const [name, ok] of r.handles) assert.ok(ok, `${name} played`);
    assert.equal(r.left, 0, 'every voice ended and was disconnected');
    assert.deepEqual(page.errors, []);
  });

  it('every recipe renders soft, clean, non-harsh audio (OfflineAudioContext)', async () => {
    const r = await page.eval(async () => {
      const m = await import('./src/audio/sfx.js');
      const out = {};
      for (const name of m.SOUND_NAMES) {
        const sr = 44100;
        const len = Math.ceil((m.RECIPES[name].dur + 0.1) * sr);
        const off = new OfflineAudioContext(2, len, sr);
        // ch0 = the sound, ch1 = the sound through a 5kHz high-pass (harshness).
        const merger = off.createChannelMerger(2);
        const bus = off.createGain();
        const hp = off.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 5000;
        bus.connect(merger, 0, 0);
        bus.connect(hp);
        hp.connect(merger, 0, 1);
        merger.connect(off.destination);
        let s = 7;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        const v = m.renderInto(off, bus, name, {}, { random: rnd });
        const buf = await off.startRendering();
        const x = buf.getChannelData(0);
        const h = buf.getChannelData(1);
        let peak = 0, e = 0, eh = 0, nan = 0;
        for (let i = 0; i < x.length; i++) {
          if (!Number.isFinite(x[i])) nan++;
          peak = Math.max(peak, Math.abs(x[i]));
          e += x[i] * x[i];
          eh += h[i] * h[i];
        }
        const t0 = Math.round(v.t * sr);
        let head = 0;
        for (let i = 0; i < t0 + Math.round(0.001 * sr); i++) head = Math.max(head, Math.abs(x[i]));
        let tail = 0;
        for (let i = x.length - Math.round(0.02 * sr); i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]));
        out[name] = { peak, rms: Math.sqrt(e / x.length), hfRms: Math.sqrt(eh / x.length), head: head / peak, tail, nan };
      }
      return out;
    });
    const rows = [];
    for (const [name, m] of Object.entries(r)) {
      rows.push(`${name.padEnd(9)} peak ${m.peak.toFixed(3)} rms ${m.rms.toFixed(4)} >5k ${m.hfRms.toFixed(4)} attack@1ms ${(m.head * 100).toFixed(0)}%`);
      assert.equal(m.nan, 0, `${name}: NaN samples`);
      assert.ok(m.peak >= 0.05 && m.peak <= 0.7, `${name}: peak ${m.peak}`);
      assert.ok(m.head < 0.3, `${name}: starts softly (${m.head} of peak within 1ms)`);
      assert.ok(m.tail < 0.002, `${name}: ends in silence (${m.tail})`);
      assert.ok(m.hfRms < 0.02, `${name}: too much energy above 5kHz (${m.hfRms})`);
    }
    console.log(rows.join('\n'));
  });

  it('a mash of ten sounds through the master bus never clips', async () => {
    const peak = await page.eval(async () => {
      const { buildGraph } = await import('./src/audio/context.js');
      const m = await import('./src/audio/sfx.js');
      const sr = 44100;
      const off = new OfflineAudioContext(1, sr * 2, sr);
      const g = buildGraph(off);
      for (const n of ['boing', 'pop', 'thud', 'plink', 'knock', 'chime', 'squish', 'tap', 'bubble', 'cheer']) {
        m.renderInto(off, g.sfx, n, { vary: 0 });
      }
      const x = (await off.startRendering()).getChannelData(0);
      let p = 0;
      for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
      return p;
    });
    assert.ok(peak > 0.1 && peak < 0.95, `mash peak ${peak}`);
  });

  it('mute silences play() and unmute restores it', async () => {
    const r = await page.eval(async (url) => {
      const a = await import(url);
      a.setMuted(true);
      const muted = a.sfx.play('pop');
      a.setMuted(false);
      const back = a.sfx.play('pop');
      return { muted, back: !!back };
    }, AUDIO);
    assert.equal(r.muted, null);
    assert.equal(r.back, true);
  });

  it('speech resolves (spoken, or falls back to a chime) without errors', async () => {
    const r = await page.eval(async (url) => {
      const a = await import(url);
      const before = a.sfx.stats.played;
      const v = a.speech.voice();
      const ok = await Promise.race([a.speech.say('Hi'), new Promise((res) => setTimeout(() => res('timeout'), 20000))]);
      return { ok, voice: v && v !== 'default' ? `${v.name} ${v.lang} local=${v.localService}` : String(v), chimed: a.sfx.stats.played > before };
    }, AUDIO);
    console.log(`speech: ${JSON.stringify(r)}`);
    assert.notEqual(r.ok, 'timeout');
    if (r.ok === false) assert.equal(r.chimed, true, 'fallback chime');
    assert.deepEqual(page.errors, []);
  });

  it('made no network requests outside the local server', async () => {
    assert.deepEqual(page.externalRequests(), []);
    assert.deepEqual(page.errors, []);
  });
});

describe('dev sound board', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-air', path: 'tools/sound-board.html' }); });
  after(async () => { if (page) await page.close(); });

  it('has a button per sound, and tapping them plays sounds', async () => {
    const n = await page.eval(() => ({
      buttons: document.querySelectorAll('#grid button').length,
      names: window.__board.sfx.names.length,
    }));
    assert.equal(n.buttons, n.names);
    assert.ok(n.buttons >= 15);
    await page.tapElement('[data-sound="boing"]');
    await page.waitFor(() => window.__board.audio.state() === 'running');
    for (const s of ['plink', 'plink', 'sparkle', 'squish']) await page.tapElement(`[data-sound="${s}"]`);
    await page.waitFor(() => window.__board.sfx.stats.played >= 4);
    await page.screenshot('sound-board');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
