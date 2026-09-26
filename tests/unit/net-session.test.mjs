// src/net/session.js: two iPads (host and guest) over an in-memory link pair
// (tests/unit/fake-link.mjs), with real stores and the real persistence code
// on the memory adapter. Covers convergence, the guest's stashed save,
// grab leases across the link, a link dropping mid-grab, and re-pairing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/engine/store.js';
import { openWorld, createMemoryAdapter } from '../../src/core/persist.js';
import { createSession } from '../../src/net/session.js';
import { linkPair, manualTimers, settle } from './fake-link.mjs';

const NO_BEAT = { setInterval: () => 0, clearInterval: () => {} };

function withoutSettings(s) { const o = Object.assign({}, s); delete o.settings; return o; }
const squishes = (store, id) => store.state.entities[id].props.squishes;

// Two iPads. Zoe hosts (plain store, like the app's but unsaved); Ian's iPad
// has its own saved town on a memory adapter.
async function twoIpads() {
  const clock = manualTimers();
  const timers = { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, setInterval: clock.setInterval, clearInterval: clock.clearInterval };

  const zoe = createStore({ device: 'zoe', now: clock.now });
  const buddy = zoe.newId();
  zoe.dispatch('spawn', { id: buddy, kind: 'buddy', room: 'boot', x: 720, y: 560, props: { squishes: 3 } });
  const block = zoe.newId();
  zoe.dispatch('spawn', { id: block, kind: 'block', room: 'boot', x: 100, y: 800 });

  const adapter = createMemoryAdapter();
  const flushNow = { setTimer: (fn) => { queueMicrotask(fn); return 1; }, clearTimer: () => {} };
  const ian = await openWorld({ adapter, device: 'ian', ...flushNow });
  const ianBuddy = ian.store.newId();
  ian.store.dispatch('spawn', { id: ianBuddy, kind: 'buddy', room: 'boot', x: 720, y: 560, props: { squishes: 7 } });
  ian.store.dispatch('set', { id: ianBuddy, path: 'props.squishes', value: 8 });
  await ian.persist.flush();

  const zs = createSession({ store: zoe, ...timers, ttl: 5000 });
  const is = createSession({ store: ian.store, persist: ian.persist, ...timers, ttl: 5000 });
  return { clock, zoe, ian: ian.store, persist: ian.persist, adapter, buddy, block, ianBuddy, zs, is, timers };
}

async function pair(t) {
  const { a, b, ca, cb } = linkPair(NO_BEAT);
  t.zs.host(a);
  t.is.join(b);
  await settle();
  return { a, b, ca, cb };
}

function saved(adapter) {
  return JSON.stringify({ snapshot: Array.from(adapter.data.snapshot), ops: Array.from(adapter.data.ops) });
}

test('guest gets the host town on join; ops from either side converge', async () => {
  const t = await twoIpads();
  const statuses = [];
  t.zs.on('status', (s) => statuses.push('zoe:' + s));
  t.is.on('status', (s) => statuses.push('ian:' + s));
  await pair(t);
  assert.deepEqual(statuses, ['zoe:hosting', 'ian:visiting']);
  assert.deepEqual(withoutSettings(t.ian.state), withoutSettings(t.zoe.state));
  assert.equal(t.ian.state.entities[t.ianBuddy], undefined, 'Ian is in Zoe\'s town now');

  const remoteOnIan = [], remoteOnZoe = [];
  t.is.on('remote', (env) => remoteOnIan.push(env.op));
  t.zs.on('remote', (env) => remoteOnZoe.push(env.op));

  // Ian taps the buddy: an intent, applied only when the host echoes it.
  assert.ok(t.ian.dispatch('set', { id: t.buddy, path: 'props.squishes', value: 4 }));
  assert.equal(squishes(t.ian, t.buddy), 3);
  await settle();
  assert.equal(squishes(t.zoe, t.buddy), 4);
  assert.equal(squishes(t.ian, t.buddy), 4);
  // Zoe taps.
  t.zoe.dispatch('set', { id: t.buddy, path: 'props.squishes', value: 5 });
  await settle();
  assert.equal(squishes(t.ian, t.buddy), 5);
  // Ian makes something with his own id; Zoe moves it.
  const cup = t.ian.newId();
  t.ian.dispatch('spawn', { id: cup, kind: 'cup', room: 'boot', x: 5, y: 5 });
  await settle();
  t.zoe.dispatch('move', { id: cup, room: 'boot', x: 50, y: 60 });
  await settle();
  assert.equal(t.ian.state.entities[cup].x, 50);
  assert.deepEqual(remoteOnZoe, ['set', 'spawn']);
  assert.deepEqual(remoteOnIan, ['set', 'move']);
  assert.deepEqual(withoutSettings(t.ian.state), withoutSettings(t.zoe.state));
});

test('the guest\'s own save is stashed, untouched by the visit, and restored on leave', async () => {
  const t = await twoIpads();
  const ownWorld = t.ian.state;
  await pair(t);
  // Joining saved his town once more (as a snapshot) and then stopped saving.
  await t.persist.flush();
  const before = saved(t.adapter);
  assert.deepEqual(t.adapter.data.snapshot.get('world').state.entities, ownWorld.entities);
  for (let i = 4; i < 10; i++) t.ian.dispatch('set', { id: t.buddy, path: 'props.squishes', value: i });
  await settle();
  await t.persist.flush();
  assert.equal(squishes(t.zoe, t.buddy), 9);
  assert.equal(saved(t.adapter), before, 'nothing from Zoe\'s town was written to Ian\'s save');

  t.is.leave();
  await settle();
  assert.equal(t.is.status, 'solo');
  assert.equal(t.ian.state, ownWorld, 'back in his own town, exactly as he left it');
  assert.equal(squishes(t.ian, t.ianBuddy), 8);
  // Saving is back on: his next squish lands in his save.
  t.ian.dispatch('set', { id: t.ianBuddy, path: 'props.squishes', value: 9 });
  await t.persist.flush();
  assert.notEqual(saved(t.adapter), before);
  const ops = Array.from(t.adapter.data.ops.values());
  assert.equal(ops[ops.length - 1].args.value, 9);
  // Zoe's side noticed the guest left and plays on alone.
  assert.equal(t.zs.status, 'solo');
  assert.ok(t.zoe.dispatch('set', { id: t.buddy, path: 'props.squishes', value: 10 }));
  assert.equal(squishes(t.zoe, t.buddy), 10);
});

test('grab leases cross the link: the other kid sees it held and cannot take it', async () => {
  const t = await twoIpads();
  await pair(t);
  const heldOnZoe = [];
  t.zs.on('held', (id, by) => heldOnZoe.push([id, by]));

  assert.equal(await t.is.grab(t.block), true);
  await settle();
  assert.deepEqual(heldOnZoe, [[t.block, 'ian']]);
  assert.equal(t.zs.heldByOther(t.block), true);
  assert.equal(t.is.heldByOther(t.block), false, 'Ian holds it himself');
  assert.equal(await t.zs.grab(t.block), false, 'Zoe cannot grab it');
  assert.equal(t.zoe.dispatch('move', { id: t.block, room: 'boot', x: 1, y: 1 }), null, 'nor move it');

  // Held for a long drag: renewed automatically past the 5s lease.
  for (let i = 0; i < 12; i++) { t.clock.advance(1000); await settle(); }
  assert.equal(t.zs.heldByOther(t.block), true);

  // Ian drops it: his move commits and ends the lease on both iPads.
  t.is.release(t.block);
  t.ian.dispatch('move', { id: t.block, room: 'boot', x: 400, y: 700 });
  await settle();
  assert.equal(t.zs.heldByOther(t.block), false);
  assert.equal(t.zoe.state.entities[t.block].x, 400);
  assert.equal(await t.zs.grab(t.block), true);
  await settle();
  assert.equal(t.is.heldByOther(t.block), true, 'now Ian sees Zoe holding it');
  assert.equal(await t.is.grab(t.block), false);
  const refused = [];
  t.is.on('refused', (r) => refused.push(r.reason));
  t.ian.dispatch('set', { id: t.block, path: 'props.color', value: 2 });
  await settle();
  assert.deepEqual(refused, ['busy']);
});

test('a link dropping mid-grab releases the lease; both play on solo; re-pairing resyncs', async () => {
  const t = await twoIpads();
  const { ca } = await pair(t);
  await t.persist.flush();
  const before = saved(t.adapter);
  assert.equal(await t.is.grab(t.block), true);
  await settle();
  assert.equal(t.zs.heldByOther(t.block), true);

  ca.close();                         // Zoe's side of the channel dies
  await settle();
  assert.equal(t.zs.status, 'solo');
  assert.equal(t.is.status, 'away');
  assert.equal(t.zs.heldByOther(t.block), false, 'lease freed when Ian vanished');
  assert.ok(t.zoe.dispatch('move', { id: t.block, room: 'boot', x: 9, y: 9 }), 'Zoe can move it again');
  assert.ok(t.zoe.dispatch('set', { id: t.buddy, path: 'props.squishes', value: 20 }));

  // Ian keeps playing in his copy of Zoe's town, without a host and unsaved.
  assert.ok(t.ian.dispatch('set', { id: t.buddy, path: 'props.squishes', value: 42 }));
  assert.equal(squishes(t.ian, t.buddy), 42);
  await t.persist.flush();
  assert.equal(saved(t.adapter), before);

  // Re-pair: the host sends a fresh snapshot; Ian's stash is still his own town.
  await pair(t);
  assert.equal(t.is.status, 'visiting');
  assert.equal(squishes(t.ian, t.buddy), 20);
  assert.equal(t.ian.state.entities[t.block].x, 9);
  assert.deepEqual(withoutSettings(t.ian.state), withoutSettings(t.zoe.state));
  t.ian.dispatch('set', { id: t.buddy, path: 'props.squishes', value: 21 });
  await settle();
  assert.equal(squishes(t.zoe, t.buddy), 21);

  t.is.leave();
  assert.equal(squishes(t.ian, t.ianBuddy), 8);
  assert.equal(saved(t.adapter), before);
});

test('guest ids never collide with ids the host already saw from it', async () => {
  const t = await twoIpads();
  await pair(t);
  const cup = t.ian.newId();
  t.ian.dispatch('spawn', { id: cup, kind: 'cup', room: 'boot', x: 1, y: 1 });
  await settle();
  t.is.leave();
  // Ian's iPad restarts (a fresh store from his untouched save, counter lower).
  const again = createStore({ device: 'ian', state: t.ian.state, lamport: 0, counter: 1 });
  const is2 = createSession({ store: again, ...t.timers });
  const { a, b } = linkPair(NO_BEAT);
  t.zs.host(a);
  is2.join(b);
  await settle();
  const next = again.newId();
  assert.notEqual(next, cup);
  const env = again.dispatch('spawn', { id: next, kind: 'cup', room: 'boot', x: 2, y: 2 });
  await settle();
  assert.ok(t.zoe.state.entities[next], 'the host accepted the new spawn (op id not a duplicate): ' + env.id);
});

test('a guest on another protocol or schema is turned away', async () => {
  const t = await twoIpads();
  const { a, b } = linkPair(NO_BEAT);
  t.zs.host(a);
  const got = [];
  b.on('message', (m) => got.push(m));
  const closed = new Promise((r) => b.on('close', r));
  b.send({ t: 'hello', v: 99, device: 'ian', schema: 1 });
  await settle();
  await closed;
  assert.deepEqual(got, [{ t: 'bye', reason: 'version' }]);
  assert.equal(t.zs.status, 'solo');
});
