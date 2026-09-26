// P1.16 pure helpers: device-local settings, the hot corner, start-over ops, perf stats.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, normalizeSettings, applySettings, DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/ui/settings.js';
import { inHotCorner, cornerSize, placeName, resetOps, HOLD_MS } from '../../src/ui/parent-menu.js';
import { bucketOf, quantile, imageBytes } from '../../src/ui/perf.js';
import { createStore } from '../../src/engine/store.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('settings: defaults (text layer off), junk-proof, round-trip', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { sound: true, volume: 0.7, voice: true, textLayer: false });
  const s = mem();
  assert.deepEqual(loadSettings(s), DEFAULT_SETTINGS);
  s.setItem(SETTINGS_KEY, '{not json');
  assert.deepEqual(loadSettings(s), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ sound: 'no', volume: 7, voice: false, extra: 1 }), { sound: true, volume: 1, voice: false, textLayer: false });
  assert.equal(saveSettings({ sound: false, volume: 0.333, voice: false, textLayer: true }, s), true);
  assert.deepEqual(loadSettings(s), { sound: false, volume: 0.33, voice: false, textLayer: true });
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  assert.equal(saveSettings(DEFAULT_SETTINGS, { setItem() { throw new Error('full'); } }), false);
});

test('settings: applied to audio and the store without any op', () => {
  const calls = [];
  const audio = { setMuted: (m) => calls.push(['muted', m]), setVolume: (v) => calls.push(['vol', v]), setSpeechOn: (o) => calls.push(['speech', o]) };
  const store = createStore({ device: 'dev1' });
  let ops = 0;
  store.subscribe(() => ops++);
  applySettings({ sound: false, volume: 0.4, voice: false, textLayer: true }, { audio, store });
  assert.deepEqual(calls, [['vol', 0.4], ['muted', true], ['speech', false]]);
  assert.equal(store.state.settings.talk, false);
  assert.equal(store.state.settings.textLayer, true);
  assert.equal(ops, 0, 'settings are not world ops');
});

test('hot corner: top-left only, grows with the screen', () => {
  assert.equal(cornerSize(1024), 120);
  assert.equal(cornerSize(1366), 137);
  assert.ok(inHotCorner(50, 50, 1024));
  assert.ok(!inHotCorner(200, 50, 1024));
  assert.ok(!inHotCorner(50, 700, 1024));
  assert.ok(inHotCorner(150, 60, 1024, { left: 40, top: 0 }));
  assert.equal(HOLD_MS, 2000);
});

test('place names and start-over ops', () => {
  assert.equal(placeName('city'), 'the town map');
  assert.equal(placeName('cafe/kitchen'), 'the cafe kitchen');
  assert.equal(placeName('school/classroom'), 'the school classroom');
  const store = createStore({ device: 'dev1' });
  const box = store.newId(); const egg = store.newId(); const other = store.newId();
  store.dispatch('spawn', { id: box, kind: 'basket', room: 'cafe/kitchen', x: 100, y: 900 });
  store.dispatch('spawn', { id: egg, kind: 'egg', parent: box, slot: 's0' });
  store.dispatch('spawn', { id: other, kind: 'egg', room: 'city', x: 100, y: 900 });
  assert.deepEqual(resetOps(store.state, 'cafe/kitchen'), [['remove', { id: egg, hard: true }], ['remove', { id: box, hard: true }]]);
  assert.deepEqual(resetOps(store.state, 'city'), [], 'a sunny map has nothing to reset');
  store.dispatch('mapSet', { night: true });
  assert.deepEqual(resetOps(store.state, 'city'), [['mapSet', { night: false }]]);
});

test('perf helpers', () => {
  assert.equal(bucketOf(16.7), 0);
  assert.equal(bucketOf(33.3), 2);
  assert.equal(bucketOf(500), 5);
  assert.equal(quantile([5, 1, 3, 2, 4], 0.5), 3);
  assert.equal(quantile([], 0.95), 0);
  assert.deepEqual(imageBytes([{ src: 'a', w: 10, h: 10 }, { src: 'a', w: 10, h: 10 }, { src: 'b', w: 2, h: 5 }, { src: '', w: 9, h: 9 }]), { bytes: 440, count: 2 });
});
