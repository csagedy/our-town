// The `inc` counter intent (bead oxg.3, docs/design.md 6.4): counters and
// aggregates never use an absolute `set`. Solo play resolves an inc in the
// local store; host-authoritative play resolves it on the host, in the
// host's order, so concurrent taps on two iPads all count. The resolved op
// is a plain LWW write, so logs still replay and merge order-independently.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/engine/store.js';
import { createHost, joinAsGuest } from '../../src/engine/authority.js';
import { applyAll, apply, createWorld } from '../../src/engine/world.js';
import { checkArgs, resolveIntent, makeEnvelope } from '../../src/engine/ops.js';
import { createRng, shuffled } from '../../src/engine/random.js';

const R = 'boot';

test('inc: arg shape', () => {
  checkArgs('inc', { id: 'aa:1', path: 'props.squishes', by: 1 });
  checkArgs('inc', { id: 'aa:1', path: 'props.coins', by: -2, value: 7 });
  assert.throws(() => checkArgs('inc', { id: 'aa:1', path: 'rot', by: 1 }), /bad path/);
  assert.throws(() => checkArgs('inc', { id: 'aa:1', path: 'props.n', by: '1' }), /bad by/);
  assert.throws(() => checkArgs('inc', { id: 'aa:1', path: 'props.n', by: Infinity }), /bad by/);
  assert.throws(() => checkArgs('inc', { id: 'aa:1', path: 'props.n' }), /bad by/);
});

test('inc: solo store resolves it and returns the resolved envelope', () => {
  const s = createStore({ device: 'aa', now: () => 0 });
  const id = s.newId();
  s.dispatch('spawn', { id, kind: 'buddy', room: R, x: 0, y: 0 });   // no counter yet: counts from 0
  const e1 = s.dispatch('inc', { id, path: 'props.squishes', by: 1 });
  assert.equal(e1.args.value, 1);
  s.dispatch('inc', { id, path: 'props.squishes', by: 1 });
  s.dispatch('inc', { id, path: 'props.squishes', by: 3 });
  assert.equal(s.state.entities[id].props.squishes, 5);
  s.dispatch('set', { id, path: 'props.label', value: 'x' });
  s.dispatch('inc', { id, path: 'props.label', by: 2 });              // not a number: counts from 0
  assert.equal(s.state.entities[id].props.label, 2);
  assert.equal(s.dispatch('inc', { id: 'aa:zz', path: 'props.n', by: 1 }), null, 'unknown entity is refused');
});

test('inc: resolveIntent is pure and ignores a sender-supplied value', () => {
  const s = createStore({ device: 'aa', now: () => 0 });
  const id = s.newId();
  s.dispatch('spawn', { id, kind: 'jar', room: R, props: { coins: 4 } });
  const env = makeEnvelope('inc', { id, path: 'props.coins', by: 2, value: 999 }, { id: 'bb:1', device: 'bb', lamport: 9 });
  const r = resolveIntent(s.state, env);
  assert.equal(r.args.value, 6);
  assert.equal(env.args.value, 999, 'input untouched');
  const other = makeEnvelope('set', { id, path: 'props.x', value: 1 }, { id: 'bb:2', device: 'bb', lamport: 9 });
  assert.equal(resolveIntent(s.state, other), other);
});

test('inc: an unresolved intent in a merged log adds to the current value', () => {
  let w = createWorld();
  w = apply(w, makeEnvelope('spawn', { id: 'aa:1', kind: 'jar', room: R, props: { coins: 2 } }, { id: 'aa:2', device: 'aa', lamport: 1 }));
  w = apply(w, makeEnvelope('inc', { id: 'aa:1', path: 'props.coins', by: 5 }, { id: 'aa:3', device: 'aa', lamport: 2 }));
  assert.equal(w.entities['aa:1'].props.coins, 7);
});

test('inc: a resolved log replays idempotently and in any order', () => {
  const s = createStore({ device: 'aa', now: () => 0 });
  const log = [];
  s.subscribe((st, env) => { if (env) log.push(env); });
  const id = s.newId();
  s.dispatch('spawn', { id, kind: 'buddy', room: R, props: { squishes: 0 } });
  for (let i = 0; i < 12; i++) s.dispatch('inc', { id, path: 'props.squishes', by: 1 });
  assert.equal(s.state.entities[id].props.squishes, 12);
  const rng = createRng(7);
  for (let k = 0; k < 20; k++) {
    const order = shuffled(log, rng);
    const twice = order.concat(shuffled(log, rng));
    assert.deepEqual(applyAll(createWorld(), twice).entities[id].props, s.state.entities[id].props);
  }
});

/** A host and a guest over an in-memory channel that queues until flush(). */
function pair() {
  const toHost = [], toGuest = [];
  const hostStore = createStore({ device: 'zoe', now: () => 0 });
  const hostLog = [];
  hostStore.subscribe((st, env) => { if (env) hostLog.push(env); });
  const host = createHost(hostStore, { broadcast: (env) => toGuest.push(env) });
  const buddy = hostStore.newId();
  hostStore.dispatch('spawn', { id: buddy, kind: 'buddy', room: R, props: { squishes: 3 } });
  toGuest.length = 0;
  const guestStore = createStore({ device: 'ian', now: () => 0 });
  guestStore.load(JSON.parse(JSON.stringify(hostStore.state)), hostStore.clockState());
  joinAsGuest(guestStore, (env) => toHost.push(JSON.parse(JSON.stringify(env))));   // over the wire
  const flush = () => {
    while (toHost.length || toGuest.length) {
      while (toHost.length) host.submit(toHost.shift());
      while (toGuest.length) guestStore.receive(JSON.parse(JSON.stringify(toGuest.shift())));
    }
  };
  return { host, hostStore, guestStore, hostLog, buddy, flush };
}

test('inc: concurrent taps on host and guest all count (none lost), both iPads converge', () => {
  const t = pair();
  // Both kids tap at the same time: the guest's 5 intents are in flight
  // while the host kid taps 4 times.
  for (let i = 0; i < 5; i++) assert.ok(t.guestStore.dispatch('inc', { id: t.buddy, path: 'props.squishes', by: 1 }));
  for (let i = 0; i < 4; i++) t.hostStore.dispatch('inc', { id: t.buddy, path: 'props.squishes', by: 1 });
  assert.equal(t.guestStore.state.entities[t.buddy].props.squishes, 3, 'guest waits for the host');
  t.flush();
  assert.equal(t.hostStore.state.entities[t.buddy].props.squishes, 12);
  assert.deepEqual(t.guestStore.state, t.hostStore.state);
  // Interleave more rounds with partial flushes.
  for (let round = 0; round < 5; round++) {
    t.guestStore.dispatch('inc', { id: t.buddy, path: 'props.squishes', by: 2 });
    t.hostStore.dispatch('inc', { id: t.buddy, path: 'props.squishes', by: 1 });
    if (round % 2) t.flush();
  }
  t.flush();
  assert.equal(t.hostStore.state.entities[t.buddy].props.squishes, 12 + 15);
  assert.deepEqual(t.guestStore.state, t.hostStore.state);
  // The host's log (what persistence saves) replays to the same world in any order.
  const rng = createRng(11);
  for (let k = 0; k < 10; k++) {
    assert.deepEqual(applyAll(createWorld(), shuffled(t.hostLog, rng)).entities, t.hostStore.state.entities);
  }
});

test('inc: the host ignores a value the guest filled in itself', () => {
  const t = pair();
  const env = t.guestStore.makeOp('inc', { id: t.buddy, path: 'props.squishes', by: 1, value: 1000 });
  const r = t.host.submit(env);
  assert.ok(r.ok);
  assert.equal(r.env.args.value, 4);
  assert.equal(t.hostStore.state.entities[t.buddy].props.squishes, 4);
});

test('why: the same concurrent taps as absolute sets lose increments', () => {
  const t = pair();
  const n = () => t.guestStore.state.entities[t.buddy].props.squishes;
  // Each iPad computes n+1 from what it sees: both write 4.
  t.guestStore.dispatch('set', { id: t.buddy, path: 'props.squishes', value: n() + 1 });
  t.hostStore.dispatch('set', { id: t.buddy, path: 'props.squishes', value: t.hostStore.state.entities[t.buddy].props.squishes + 1 });
  t.flush();
  assert.equal(t.hostStore.state.entities[t.buddy].props.squishes, 4, 'two taps, one counted: use inc');
});
