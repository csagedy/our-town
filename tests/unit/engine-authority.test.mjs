// authority.js: host-authoritative two-iPad play, simulated in-process.
// The guest sends intents; the host validates, sequences and broadcasts;
// grab ownership stops two kids from taking the same thing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/engine/store.js';
import { createHost, joinAsGuest } from '../../src/engine/authority.js';
import { applyAll, createWorld } from '../../src/engine/world.js';

const K = 'cafe/kitchen';
const D = 'cafe/dining';

/**
 * Wire a host (Zoe's iPad) and a guest (Ian's) through an in-memory "network".
 * Messages queue until `flush()`, like a real channel with latency.
 */
function session({ ttl = 5000 } = {}) {
  let clock = 1000;
  const now = () => clock;
  const toGuest = [], toHost = [];
  const hostStore = createStore({ device: 'zoe', now });
  const hostLog = [];
  hostStore.subscribe((s, env) => { if (env) hostLog.push(env); });
  const host = createHost(hostStore, { broadcast: (env) => toGuest.push(env), now, ttl });
  const results = [];

  // Zoe sets up her town before Ian joins.
  const egg = hostStore.newId(), bowl = hostStore.newId(), chef = hostStore.newId();
  hostStore.dispatch('spawn', { id: egg, kind: 'egg', room: K, x: 100, y: 800 });
  hostStore.dispatch('spawn', { id: bowl, kind: 'bowl', room: K, x: 300, y: 800 });
  hostStore.dispatch('spawn', { id: chef, kind: 'char', room: K, x: 600, y: 900 });
  toGuest.length = 0;   // the guest gets a snapshot instead of these

  const guestStore = createStore({ device: 'ian', now });
  guestStore.load(JSON.parse(JSON.stringify(hostStore.state)), hostStore.clockState());
  joinAsGuest(guestStore, (env) => toHost.push(env));

  function flush() {
    while (toHost.length || toGuest.length) {
      while (toHost.length) results.push(host.submit(toHost.shift()));
      while (toGuest.length) guestStore.receive(toGuest.shift());
    }
  }
  return { host, hostStore, guestStore, hostLog, results, flush, egg, bowl, chef, tick: (ms) => { clock += ms; } };
}

test('guest intents reach the world only through the host, then both iPads agree', () => {
  const s = session();
  const env = s.guestStore.dispatch('move', { id: s.egg, room: D, x: 50, y: 850 });
  assert.ok(env);
  assert.equal(s.guestStore.state.entities[s.egg].room, K);   // not applied until the host says so
  assert.equal(s.hostStore.state.entities[s.egg].room, K);
  s.flush();
  assert.equal(s.results[0].ok, true);
  assert.equal(s.results[0].env.id, env.id);                    // same op id, author kept
  assert.equal(s.results[0].env.device, 'ian');
  assert.ok(s.results[0].env.lamport > env.lamport);            // host re-stamped with its clock
  assert.equal(s.hostStore.state.entities[s.egg].room, D);
  assert.deepEqual(s.guestStore.state, s.hostStore.state);
});

test('a guest can spawn with its own ids; spoofed or stale intents are refused', () => {
  const s = session();
  const cup = s.guestStore.newId();
  assert.match(cup, /^ian:/);
  s.guestStore.dispatch('spawn', { id: cup, kind: 'cup', room: K, x: 1, y: 1 });
  // A spoofed spawn with Zoe's id prefix, and an op on an egg Zoe already ate.
  toHostRaw(s, { id: 'ian:zz', op: 'spawn', args: { id: 'zoe:zz', kind: 'x', room: K }, device: 'ian', lamport: 1, t: 0 });
  s.hostStore.dispatch('remove', { id: s.egg, hard: true });
  toHostRaw(s, { id: 'ian:zy', op: 'set', args: { id: s.egg, path: 'props.cooked', value: 3 }, device: 'ian', lamport: 1, t: 0 });
  s.flush();
  assert.deepEqual(s.results.map((r) => r.reason), ['foreign-id:zoe:zz', 'gone:' + s.egg, null]);
  assert.equal(s.guestStore.state.entities[cup].kind, 'cup');
  assert.deepEqual(s.guestStore.state, s.hostStore.state);
});

function toHostRaw(s, env) { s.results.push(s.host.submit(env)); }

test('ownership: the kid holding an object owns it until the drop; no double-grabs', () => {
  const s = session();
  // Ian touches the egg first.
  assert.equal(s.host.grab(s.egg, 'ian'), true);
  assert.equal(s.host.holder(s.egg), 'ian');
  // Zoe tries to grab it too: busy wobble.
  assert.equal(s.host.grab(s.egg, 'zoe'), false);
  // Zoe's drop on it (a move) is refused as well, locally on the host.
  assert.equal(s.hostStore.dispatch('move', { id: s.egg, room: K, x: 999, y: 999 }), null);
  // Ian renews while dragging, then drops: the drop commits and frees the egg.
  assert.equal(s.host.grab(s.egg, 'ian'), true);
  s.guestStore.dispatch('attach', { id: s.egg, parent: s.bowl, slot: 'in-0' });
  s.flush();
  assert.equal(s.results.at(-1).ok, true);
  assert.equal(s.host.holder(s.egg), null);
  assert.equal(s.hostStore.state.entities[s.egg].parent, s.bowl);
  // Now Zoe can take it.
  assert.equal(s.host.grab(s.egg, 'zoe'), true);
  assert.equal(s.host.grab(s.egg, 'ian'), false);
  assert.deepEqual(s.guestStore.state, s.hostStore.state);
});

test('holding a container holds its contents; racing intents: first one in wins', () => {
  const s = session();
  s.hostStore.dispatch('attach', { id: s.egg, parent: s.bowl, slot: 'in-0' });
  s.flush();
  assert.equal(s.host.grab(s.bowl, 'zoe'), true);         // Zoe lifts the bowl
  assert.equal(s.host.grab(s.egg, 'ian'), false);         // Ian can't pluck the egg out of her hands
  s.guestStore.dispatch('move', { id: s.egg, room: D, x: 1, y: 1 });
  s.flush();
  assert.equal(s.results.at(-1).reason, 'busy');
  assert.equal(s.hostStore.state.entities[s.egg].parent, s.bowl);
  s.host.release(s.bowl, 'zoe');

  // Both kids try to combine the same egg at once; the host takes the first.
  const a = s.hostStore.makeOp('combine', { ids: [s.egg], resultId: s.hostStore.newId(), resultKind: 'omelet', room: K, x: 0, y: 0 });
  const b = s.guestStore.makeOp('combine', { ids: [s.egg], resultId: s.guestStore.newId(), resultKind: 'cake', room: K, x: 0, y: 0 });
  const ra = s.host.submit(a);
  const rb = s.host.submit(b);
  s.flush();
  assert.equal(ra.ok, true);
  assert.equal(rb.ok, false);
  assert.equal(rb.reason, 'gone:' + s.egg);
  assert.equal(Object.values(s.hostStore.state.entities).filter((e) => e.kind === 'cake').length, 0);
  assert.deepEqual(s.guestStore.state, s.hostStore.state);
});

test('a lease expires if the holder goes quiet (sleep, dropped connection)', () => {
  const s = session({ ttl: 5000 });
  assert.equal(s.host.grab(s.chef, 'ian'), true);
  s.tick(4999);
  assert.equal(s.host.grab(s.chef, 'zoe'), false);
  s.tick(1);
  assert.equal(s.host.holder(s.chef), null);
  assert.equal(s.host.grab(s.chef, 'zoe'), true);
});

test('release only frees a lease held by that device; grabbing a gone thing fails', () => {
  const s = session();
  s.host.grab(s.chef, 'ian');
  s.host.release(s.chef, 'zoe');
  assert.equal(s.host.holder(s.chef), 'ian');
  s.host.release(s.chef, 'ian');
  assert.equal(s.host.holder(s.chef), null);
  assert.equal(s.host.grab('zoe:404', 'ian'), false);
  assert.equal(s.host.submit(s.hostStore.makeOp('mapSet', { night: true })).ok, true);
});

test('a play session: many interleaved intents, host log replays to the same world', () => {
  const s = session();
  const ids = [s.egg, s.bowl, s.chef];
  for (let i = 0; i < 60; i++) {
    const id = ids[i % 3];
    if (i % 2) {
      s.host.grab(id, 'ian');
      s.guestStore.dispatch('move', { id, room: i % 4 ? K : D, x: i * 10, y: 800 });
    } else {
      s.host.grab(id, 'zoe');
      s.hostStore.dispatch('set', { id, path: 'props.n', value: i });
    }
    if (i % 5 === 0) s.flush();
  }
  s.flush();
  assert.ok(s.results.some((r) => r.ok) && s.results.some((r) => r.reason === 'busy'));
  assert.deepEqual(s.guestStore.state, s.hostStore.state);
  // The host's broadcast order is a total order: replaying its log from the
  // pre-join snapshot rebuilds the same world.
  assert.deepEqual(applyAll(createWorld(), s.hostLog), s.hostStore.state);
});
