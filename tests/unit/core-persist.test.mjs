// Persistence logic (src/core/persist.js) over the in-memory storage adapter,
// which speaks the same API as the IndexedDB one. The real IndexedDB path is
// covered end to end in tests/e2e/persist.test.mjs.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  openPersist, openWorld, createMemoryAdapter, openIdbAdapter, compactWorld, migrateWorld,
  checkWorld, recoverClock, readWorldFile, shareWorldFile, FILE_FORMAT, FILE_VERSION, MIGRATIONS,
} from '../../src/core/persist.js';
import { createStore } from '../../src/engine/store.js';
import { createWorld, getEntity, locate, SCHEMA } from '../../src/engine/world.js';

// Manual timers: the flush timer fires only when a test says so.
function manualTimers() {
  const timers = new Map();
  let n = 0;
  return {
    setTimer(fn) { timers.set(++n, fn); return n; },
    clearTimer(id) { timers.delete(id); },
    run() { const fns = Array.from(timers.values()); timers.clear(); fns.forEach((f) => f()); },
    get count() { return timers.size; },
  };
}

function fakePage() {
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  const win = new EventTarget();
  return {
    doc, win,
    hide() { doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange')); },
    pagehide() { win.dispatchEvent(new Event('pagehide')); },
  };
}

async function world(adapter, extra = {}) {
  const t = manualTimers();
  const page = fakePage();
  const { store, persist } = await openWorld({ adapter, setTimer: t.setTimer, clearTimer: t.clearTimer, doc: page.doc, win: page.win, ...extra });
  return { store, persist, t, page };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const opsIn = (a) => Array.from(a.data.ops.keys());
const spawn = (store, props = {}, room = 'cafe/kitchen') => {
  const id = store.newId();
  store.dispatch('spawn', { id, kind: 'egg', room, x: 10, y: 800, props });
  return id;
};

describe('boot and device id', () => {
  test('a fresh install makes a device id and an empty world, and keeps the id', async () => {
    const a = createMemoryAdapter();
    const { persist, store } = await world(a);
    assert.match(persist.device, /^[0-9a-z]{6}$/);
    assert.equal(persist.mode, 'memory');
    assert.equal(persist.recovered, false);
    assert.deepEqual(store.state.entities, {});
    const again = await world(a);
    assert.equal(again.persist.device, persist.device);
  });

  test('with no IndexedDB (Node, like private mode) it runs from memory without throwing', async () => {
    const p = await openPersist();   // no adapter: tries IndexedDB, falls back
    assert.equal(p.mode, 'memory');
    const store = createStore({ device: p.device });
    p.attach(store, { doc: null, win: null });
    spawn(store);
    await p.flush();
    assert.equal(Object.keys(store.state.entities).length, 1);
  });
});

describe('saving ops', () => {
  test('ops are buffered, then written in one batch when the timer fires', async () => {
    const a = createMemoryAdapter();
    const { store, persist, t } = await world(a);
    let batches = 0;
    const batch = a.batch;
    a.batch = (w, o) => { batches++; return batch(w, o); };
    spawn(store); spawn(store); spawn(store);
    assert.equal(opsIn(a).length, 0, 'nothing written yet');
    assert.equal(t.count, 1, 'one flush timer for the burst');
    t.run();
    await settle();
    assert.equal(batches, 1);
    assert.deepEqual(opsIn(a), [1, 2, 3]);
    assert.deepEqual(persist.pending(), { logged: 3, buffered: 0, dirty: false });
  });

  test('reopening replays the log into the same world and resumes the clock', async () => {
    const a = createMemoryAdapter();
    const s1 = await world(a);
    const egg = spawn(s1.store, { cooked: 0 });
    s1.store.dispatch('set', { id: egg, path: 'props.cooked', value: 2 });
    s1.store.dispatch('move', { id: egg, room: 'cafe/dining', x: 300, y: 820 });
    await s1.persist.flush();
    const s2 = await world(a);
    assert.deepEqual(s2.store.state, s1.store.state);
    assert.deepEqual(s2.store.clockState(), s1.store.clockState());
    const next = s2.store.newId();
    assert.ok(!s1.store.state.entities[next], 'new ids never reuse old ones');
  });

  test('going hidden writes a snapshot at once and empties the log', async () => {
    const a = createMemoryAdapter();
    const { store, persist, t, page } = await world(a);
    const egg = spawn(store);
    store.dispatch('set', { id: egg, path: 'props.cooked', value: 1 });
    page.hide();
    await persist.flush();
    assert.equal(t.count, 0, 'timer cancelled');
    const snap = a.data.snapshot.get('world');
    assert.equal(snap.seq, 2);
    assert.equal(snap.schema, SCHEMA);
    assert.deepEqual(snap.clock, store.clockState());
    assert.equal(snap.state.entities[egg].props.cooked, 1);
    assert.deepEqual(opsIn(a), []);
    const again = await world(a);
    assert.deepEqual(again.store.state, store.state);
  });

  test('pagehide saves too, and a hide with nothing new writes nothing', async () => {
    const a = createMemoryAdapter();
    const { store, persist, page } = await world(a);
    spawn(store);
    page.pagehide();
    await persist.flush();
    const first = a.data.snapshot.get('world');
    assert.ok(first);
    page.hide();
    await persist.flush();
    assert.equal(a.data.snapshot.get('world'), first, 'same record, not rewritten');
  });

  test('compacts every N ops: snapshot plus a short tail, same world on reopen', async () => {
    const a = createMemoryAdapter();
    const { store, persist, t } = await world(a, { compactEvery: 5 });
    const ids = [];
    for (let i = 0; i < 12; i++) {
      ids.push(spawn(store));
      if (i % 3 === 2) { t.run(); await settle(); }
    }
    t.run();
    await persist.flush();
    const snap = a.data.snapshot.get('world');
    assert.ok(snap.seq >= 5, 'a snapshot was written');
    assert.ok(opsIn(a).length < 5, 'log trimmed: ' + opsIn(a));
    assert.ok(opsIn(a).every((k) => k > snap.seq));
    const again = await world(a);
    assert.deepEqual(Object.keys(again.store.state.entities).sort(), ids.slice().sort());
  });

  test('a failed write is retried as a full snapshot, never thrown', async () => {
    const a = createMemoryAdapter();
    const { store, persist, t } = await world(a);
    a.failWrites = true;
    const egg = spawn(store);
    t.run();
    await persist.flush();
    assert.equal(persist.pending().dirty, true);
    a.failWrites = false;
    store.dispatch('set', { id: egg, path: 'props.cooked', value: 3 });
    t.run();
    await persist.flush();
    const again = await world(a);
    assert.equal(again.store.state.entities[egg].props.cooked, 3);
  });

  test('store.load (a whole new world) is saved as a snapshot', async () => {
    const a = createMemoryAdapter();
    const { store, persist, t } = await world(a);
    const other = createStore({ device: 'zzzz' });
    spawn(other);
    store.load(other.state, other.clockState());
    t.run();
    await persist.flush();
    assert.deepEqual(a.data.snapshot.get('world').state.entities, other.state.entities);
  });
});

describe('tombstones', () => {
  test('compaction drops unreferenced tombstones and their blobs, keeps ones still pointed at', async () => {
    const a = createMemoryAdapter();
    const { store, persist } = await world(a);
    const gone = spawn(store);
    const pot = spawn(store, {}, 'cafe/kitchen');
    const soup = store.newId();
    store.dispatch('spawn', { id: soup, kind: 'soup', parent: pot, slot: 'in' });
    await persist.putBlob(gone, new Blob(['tape']));
    await persist.putBlob(pot, new Blob(['keep me']));
    store.dispatch('remove', { id: gone, hard: true });
    store.dispatch('remove', { id: pot, hard: true });   // soup falls to the pot's last room
    assert.deepEqual(locate(store.state, soup), { room: 'cafe/kitchen', top: soup, fallen: true });
    await persist.compact();
    const saved = a.data.snapshot.get('world').state.entities;
    assert.ok(!saved[gone], 'unreferenced tombstone removed');
    assert.ok(saved[pot] && saved[pot].deleted, 'tombstone that a child still points at is kept');
    assert.deepEqual(await persist.blobIds(), [pot]);
    const again = await world(a);
    assert.deepEqual(locate(again.store.state, soup), { room: 'cafe/kitchen', top: soup, fallen: true });
    assert.ok(!again.store.newId().endsWith(gone.split(':')[1]), 'ids keep counting past removed ones');
  });

  test('compactWorld honours stableLamport and map lots', () => {
    const s = createStore({ device: 'aa' });
    const x = spawn(s);
    const y = spawn(s);
    s.dispatch('mapSet', { lot: 0, structureId: y });
    s.dispatch('remove', { id: x, hard: true });
    s.dispatch('remove', { id: y, hard: true });
    const delX = s.state.entities[x].v.deleted[0];
    assert.deepEqual(compactWorld(s.state, { stableLamport: delX - 1 }).removed, []);
    assert.deepEqual(compactWorld(s.state).removed, [x], 'the lot keeps y');
    const none = createWorld();
    assert.equal(compactWorld(none).state, none);
  });
});

describe('damaged saves', () => {
  test('a corrupt snapshot is backed up, and the game starts fresh without throwing', async () => {
    const a = createMemoryAdapter();
    const s1 = await world(a);
    spawn(s1.store);
    await s1.persist.compact();
    const device = s1.persist.device;
    a.data.snapshot.set('world', { seq: 1, state: { schema: 1, entities: 'garbage' } });
    a.data.ops.set(2, { junk: true });
    const s2 = await world(a);
    assert.equal(s2.persist.recovered, true);
    assert.ok(s2.persist.problems.length > 0);
    assert.equal(s2.persist.device, device, 'device id survives');
    assert.deepEqual(s2.store.state.entities, {});
    const backups = Array.from(a.data.backups.values());
    assert.equal(backups.length, 1);
    assert.equal(backups[0].snapshot.state.entities, 'garbage');
    assert.equal(a.data.snapshot.get('world').state.schema, SCHEMA, 'a clean snapshot replaced it');
    spawn(s2.store);
    await s2.persist.flush();
    const s3 = await world(a);
    assert.equal(s3.persist.recovered, false);
    assert.equal(Object.keys(s3.store.state.entities).length, 1);
  });

  test('only the newest backups are kept', async () => {
    const a = createMemoryAdapter();
    let t = 1000;
    for (let i = 0; i < 4; i++) {
      a.data.snapshot.set('world', 'not a record ' + i);
      await world(a, { now: () => (t += 1000) });
    }
    assert.equal(a.data.backups.size, 2);
    assert.deepEqual(Array.from(a.data.backups.values()).map((b) => b.snapshot), ['not a record 2', 'not a record 3']);
  });

  test('a snapshot from a newer build is backed up rather than misread', async () => {
    const a = createMemoryAdapter();
    const w = createWorld();
    a.data.snapshot.set('world', { seq: 0, state: Object.assign(w, { schema: SCHEMA + 1 }) });
    const s = await world(a);
    assert.equal(s.persist.recovered, true);
    assert.match(s.persist.problems.join(), /newer/);
  });

  test('bad ops in the tail are skipped, good ones kept', async () => {
    const a = createMemoryAdapter();
    const s1 = await world(a);
    const egg = spawn(s1.store);
    await s1.persist.flush();
    a.data.ops.set(2, { id: 'x:1', op: 'move', args: { id: egg, room: 5 }, device: 'x', lamport: 9 });
    a.data.ops.set(3, 'nonsense');
    a.data.ops.set(4, { id: 'x:2', op: 'teleport', args: {}, device: 'x', lamport: 10 });   // unknown op: newer build
    const s2 = await world(a);
    assert.ok(getEntity(s2.store.state, egg));
    assert.equal(s2.store.state.entities[egg].room, 'cafe/kitchen');
    assert.equal(s2.persist.problems.length, 2);
    assert.equal(s2.persist.recovered, false);
  });

  test('an unreadable store starts fresh', async () => {
    const a = createMemoryAdapter();
    a.getAll = () => Promise.reject(new Error('boom'));
    const s = await world(a);
    assert.equal(s.persist.recovered, true);
    assert.deepEqual(s.store.state.entities, {});
  });
});

describe('schema and migration', () => {
  test('migrateWorld runs the hook chain up to the target', () => {
    const old = Object.assign(createWorld(), { schema: 1 });
    const migrations = {
      1: (s) => Object.assign({}, s, { schema: 2, locations: { cafe: { lastRoom: 'cafe/kitchen' } } }),
      2: (s) => Object.assign({}, s, { schema: 3 }),
    };
    const out = migrateWorld(old, { migrations, target: 3 });
    assert.equal(out.schema, 3);
    assert.deepEqual(out.locations, { cafe: { lastRoom: 'cafe/kitchen' } });
    assert.throws(() => migrateWorld(old, { migrations: {}, target: 2 }), { code: 'no-migration' });
    assert.throws(() => migrateWorld(Object.assign(createWorld(), { schema: 9 })), { code: 'too-new' });
    assert.throws(() => migrateWorld({ entities: {} }), { code: 'corrupt' });
    assert.equal(typeof MIGRATIONS, 'object');
  });

  test('checkWorld spots broken shapes', () => {
    assert.equal(checkWorld(createWorld()), null);
    const w = createWorld();
    w.entities.a = { id: 'b', v: {}, props: {} };
    assert.match(checkWorld(w), /bad entity/);
    assert.match(checkWorld(Object.assign(createWorld(), { map: { lots: [] } })), /bad map/);
  });

  test('recoverClock passes every own id and lamport', () => {
    const s = createStore({ device: 'dd' });
    for (let i = 0; i < 40; i++) spawn(s);
    const c = recoverClock('dd', s.state, [], null);
    // Each spawn takes an entity id then an op id: the last entity is counter 79.
    assert.ok(c.counter >= 79 && c.counter <= s.clockState().counter, String(c.counter));
    assert.equal(c.lamport, s.clockState().lamport);
  });
});

describe('world files', () => {
  test('export then import on another iPad gives the same world and blobs', async () => {
    const src = await world(createMemoryAdapter());
    const egg = spawn(src.store, { cooked: 2 });
    await src.persist.putBlob(egg, new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: 'audio/mp4' }));
    const file = await src.persist.exportWorld();
    assert.match(file.name, /^ourtown-world-\d{4}-\d\d-\d\d\.json$/);
    const parsed = JSON.parse(await file.text());
    assert.equal(parsed.format, FILE_FORMAT);
    assert.equal(parsed.version, FILE_VERSION);
    assert.equal(parsed.schema, SCHEMA);

    const dstA = createMemoryAdapter();
    const dst = await world(dstA);
    dst.store.dispatch('mapSet', { night: true });
    const settings = { textLayer: false, sound: false };
    dst.store.load(Object.assign({}, dst.store.state, { settings }), null);
    const r = await dst.persist.importWorld(file);
    assert.deepEqual(r, { entities: 1, blobs: 1 });
    assert.deepEqual(dst.store.state.entities, src.store.state.entities);
    assert.deepEqual(dst.store.state.settings, settings, 'settings are this iPad\'s own');
    assert.notEqual(dst.persist.device, src.persist.device);
    const blob = await dst.persist.getBlob(egg);
    assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer())), [0, 1, 2, 250, 255]);
    assert.equal(blob.type, 'audio/mp4');
    assert.ok(dst.store.clockState().lamport >= src.store.clockState().lamport);
    // Saved: a reopen sees the imported world.
    const again = await world(dstA);
    assert.deepEqual(again.store.state.entities, src.store.state.entities);
  });

  test('importing our own old backup never reuses its ids', async () => {
    const a = createMemoryAdapter();
    const s1 = await world(a);
    for (let i = 0; i < 5; i++) spawn(s1.store);
    const file = await s1.persist.exportWorld();
    const fresh = await world(createMemoryAdapter(), { device: s1.persist.device });
    await fresh.persist.importWorld(await file.text());
    const id = fresh.store.newId();
    assert.ok(!fresh.store.state.entities[id], id + ' is new');
  });

  test('bad files are refused before anything changes', async () => {
    const s = await world(createMemoryAdapter());
    const egg = spawn(s.store);
    const good = JSON.parse(await (await s.persist.exportWorld()).text());
    const cases = [
      ['not json {', 'not-a-world'],
      [JSON.stringify({ hello: 1 }), 'not-a-world'],
      [JSON.stringify(Object.assign({}, good, { version: FILE_VERSION + 1 })), 'too-new'],
      [JSON.stringify(Object.assign({}, good, { state: Object.assign({}, good.state, { schema: SCHEMA + 1 }) })), 'too-new'],
      [JSON.stringify(Object.assign({}, good, { state: { schema: 1, entities: [] } })), 'corrupt'],
      [JSON.stringify(Object.assign({}, good, { blobs: { x: 5 } })), 'corrupt'],
    ];
    for (const [text, code] of cases) {
      await assert.rejects(s.persist.importWorld(text), { code }, text.slice(0, 60));
    }
    assert.ok(getEntity(s.store.state, egg), 'world untouched');
    assert.throws(() => readWorldFile(null), { code: 'not-a-world' });
  });
});

describe('IndexedDB adapter guards', () => {
  test('rejects when IndexedDB is missing, throws or hangs', async () => {
    await assert.rejects(openIdbAdapter({ idb: {} }), { code: 'no-indexeddb' });
    await assert.rejects(openIdbAdapter({ idb: { open() { throw new Error('SecurityError'); } } }), /SecurityError/);
    await assert.rejects(openIdbAdapter({ idb: { open() { return {}; } }, timeout: 20 }), { code: 'open-timeout' });
  });
});

describe('shareWorldFile', () => {
  const file = new File(['{}'], 'w.json', { type: 'application/json' });
  function fakeDoc() {
    const clicked = [];
    return {
      clicked,
      body: { appendChild() {} },
      createElement() { const a = { style: {}, click() { clicked.push(a.download); }, remove() {} }; return a; },
    };
  }

  test('uses the share sheet when files can be shared', async () => {
    const shared = [];
    const nav = { canShare: () => true, share: async (d) => { shared.push(d.files[0].name); } };
    assert.equal(await shareWorldFile(file, { nav, doc: fakeDoc() }), 'shared');
    assert.deepEqual(shared, ['w.json']);
  });

  test('a cancelled share is just cancelled', async () => {
    const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); } };
    assert.equal(await shareWorldFile(file, { nav, doc: fakeDoc() }), 'cancelled');
  });

  test('falls back to <a download> when sharing is missing or refused', async () => {
    const doc = fakeDoc();
    assert.equal(await shareWorldFile(file, { nav: {}, doc }), 'downloaded');
    const nav = { canShare: () => true, share: async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); } };
    assert.equal(await shareWorldFile(file, { nav, doc }), 'downloaded');
    assert.deepEqual(doc.clicked, ['w.json', 'w.json']);
  });
});
