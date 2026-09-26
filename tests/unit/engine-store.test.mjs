// store.js: dispatch, receive, subscribe, load and deterministic randomness.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/engine/store.js';
import { createRng, pick } from '../../src/engine/random.js';
import { createWorld } from '../../src/engine/world.js';

const K = 'cafe/kitchen';

test('dispatch stamps, applies and returns the envelope', () => {
  const s = createStore({ device: 'aa', now: () => 99 });
  const id = s.newId();
  assert.equal(id, 'aa:1');
  const env = s.dispatch('spawn', { id, kind: 'egg', room: K, x: 1, y: 2 });
  assert.deepEqual(env, { id: 'aa:2', op: 'spawn', args: { id, kind: 'egg', room: K, x: 1, y: 2 }, device: 'aa', lamport: 1, t: 99 });
  assert.equal(s.state.entities[id].kind, 'egg');
  assert.equal(s.getState(), s.state);
  const env2 = s.dispatch('move', { id, room: K, x: 5, y: 5 });
  assert.equal(env2.lamport, 2);
  assert.equal(s.state.entities[id].rev, 2);
});

test('dispatch throws on malformed ops and returns null on senseless ones', () => {
  const s = createStore({ device: 'aa' });
  assert.throws(() => s.dispatch('move', { id: 'aa:1' }), TypeError);
  const before = s.state;
  assert.equal(s.dispatch('move', { id: 'aa:1', room: K, x: 0, y: 0 }), null);   // nothing there
  assert.equal(s.state, before);
});

test('subscribe notifies after every applied op; unsubscribe stops it', () => {
  const s = createStore({ device: 'aa' });
  const seen = [];
  const off = s.subscribe((state, env) => seen.push([env.op, Object.keys(state.entities).length]));
  const id = s.newId();
  s.dispatch('spawn', { id, kind: 'egg', room: K });
  s.dispatch('set', { id, path: 'props.cooked', value: 1 });
  s.dispatch('move', { id: 'zz:1', room: K, x: 0, y: 0 });   // rejected: no notify
  off();
  s.dispatch('remove', { id });
  assert.deepEqual(seen, [['spawn', 1], ['set', 1]]);
});

test('a listener may unsubscribe itself without breaking the loop', () => {
  const s = createStore({ device: 'aa' });
  const calls = [];
  const off = s.subscribe(() => { calls.push('once'); off(); });
  s.subscribe((state, env) => { calls.push(env.op); });
  s.dispatch('mapSet', { night: true });
  s.dispatch('mapSet', { night: false });
  assert.deepEqual(calls, ['once', 'mapSet', 'mapSet']);
});

test('receive applies remote ops once, advances the clock, and notifies', () => {
  const s = createStore({ device: 'aa' });
  let n = 0;
  s.subscribe(() => { n += 1; });
  const env = { id: 'bb:1', op: 'spawn', args: { id: 'bb:2', kind: 'egg', room: K }, device: 'bb', lamport: 40, t: 0 };
  assert.equal(s.receive(env), true);
  assert.equal(s.receive(env), false);   // duplicate delivery
  assert.equal(n, 1);
  assert.equal(s.clockState().lamport, 40);
  assert.equal(s.dispatch('mapSet', { night: true }).lamport, 41);   // local ops now sort after
});

test('clockState resumes ids and lamport in a new session', () => {
  const s = createStore({ device: 'aa' });
  s.dispatch('spawn', { id: s.newId(), kind: 'egg', room: K });
  const saved = s.clockState();
  assert.deepEqual(saved, { lamport: 1, counter: 2 });
  const s2 = createStore({ device: 'aa', state: s.state, ...saved });
  assert.equal(s2.newId(), 'aa:3');
  assert.equal(s2.dispatch('mapSet', { night: true }).lamport, 2);
});

test('load replaces the world, resets dedupe, and notifies with a null env', () => {
  const s = createStore({ device: 'aa' });
  const env = { id: 'bb:1', op: 'mapSet', args: { night: true }, device: 'bb', lamport: 3, t: 0 };
  s.receive(env);
  const got = [];
  s.subscribe((state, e) => got.push(e));
  s.load(createWorld(), { lamport: 10 });
  assert.equal(s.state.map.night, false);
  assert.deepEqual(got, [null]);
  assert.equal(s.receive(env), true);   // the log can be replayed onto the fresh world
  assert.equal(s.dispatch('mapSet', { night: false }).lamport, 11);
});

test('setSubmit routes local ops; null restores solo play', () => {
  const s = createStore({ device: 'aa' });
  const sent = [];
  s.setSubmit((env) => { sent.push(env); return true; });
  const env = s.dispatch('mapSet', { night: true });
  assert.deepEqual(sent, [env]);
  assert.equal(s.state.map.night, false);   // not applied until it comes back
  s.setSubmit((env2) => false);
  assert.equal(s.dispatch('mapSet', { night: true }), null);
  s.setSubmit(null);
  s.dispatch('mapSet', { night: true });
  assert.equal(s.state.map.night, true);
});

test('randomness is rolled before dispatch, so replaying the log gives the same world', () => {
  const dishes = ['Wobble Soup', 'Mystery Muffin', 'Toasty Surprise', 'Pickle Pie'];
  const a = createStore({ device: 'aa' });
  const log = [];
  a.subscribe((state, env) => log.push(env));
  const rand = createRng(5);
  for (let i = 0; i < 20; i++) {
    const id = a.newId();
    a.dispatch('spawn', { id, kind: 'food', room: K, props: { name: pick(dishes, rand) } });
  }
  const b = createStore({ device: 'bb' });
  log.forEach((env) => b.receive(env));
  assert.deepEqual(b.state, a.state);
  assert.ok(log.every((env) => dishes.includes(env.args.props.name)));
});
