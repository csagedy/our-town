// Persistence (P1.4, docs/design.md 2.7 and 6.4): the world survives reloads,
// app switches and iOS killing a backgrounded tab without warning.
//
//   const { store, persist } = await openWorld();   // never rejects
//   store.dispatch(...)                             // saved automatically
//
// Storage layout (IndexedDB database "ourtown", one object store each):
//   meta      "device" -> the stable device id (made once per install)
//   snapshot  "world"  -> { schema, seq, clock: {lamport, counter}, savedAt, state }
//   ops       seq (1, 2, 3...) -> op envelope, the log since the snapshot
//   blobs     entity id -> Blob (mic tapes, paintings); never inside ops
//   backups   "backup:<time>" -> a snapshot that failed to load (newest 2 kept)
//
// Saving: every envelope the store emits gets the next local `seq` and waits
// in a buffer. The buffer is written in one transaction FLUSH_DELAY ms after
// the first op arrives (Safari 16 has no requestIdleCallback), so a burst of
// ops costs one write and nothing waits long. On visibilitychange -> hidden,
// pagehide and freeze we save at once as a snapshot, because iOS may kill a
// hidden tab at any moment. Every `compactEvery` ops (200) the flush becomes a
// compaction too: write { snapshot of the current state + clock, seq } and
// delete ops <= seq in the same transaction, so the log never grows past
// ~200 ops and boot stays fast.
//
// Boot: read the device id, the snapshot and the ops after its seq; migrate
// and check the snapshot, replay the tail with applyAll, recover the clock
// (lamport and id counter never go backwards, or ids would repeat), and
// create the store from the result.
//
// Resilience:
// - No storage (private mode, IndexedDB missing, open throws or hangs): the
//   game runs on an in-memory adapter and simply forgets on reload.
//   `persist.mode` is 'memory'.
// - A snapshot that is unreadable, from a newer build or fails `checkWorld`
//   is copied to `backups` with the log, then snapshot and log are cleared and
//   the world starts fresh (`persist.recovered`, `persist.problems`). Bad ops
//   in the tail are skipped one by one. Nothing here throws into boot; it
//   warns with console.warn.
// - A failed write marks the save dirty; the next save writes a full
//   snapshot, which covers everything the failed write had.
// - `schema` on every snapshot and world file, with MIGRATIONS as the hook.
//
// Tombstones: compaction drops hard-deleted entities that nothing still
// points at (see compactWorld and docs/design.md 6.4 "Tombstone GC"), and
// deletes their blobs. The live store keeps them until the next boot.
//
// World file (export/import, parent menu P1.16): JSON
//   { format: 'ourtown-world', version: 1, schema, exportedAt, device, clock,
//     state, blobs: { id: { type, data: base64 } } }
// Export with shareWorldFile(file) (navigator.share({files}), falling back to
// <a download>); import with pickWorldFile() (an <input type=file>) then
// persist.importWorld(file). Safari needs share() and input.click() to run
// inside the tap, so build the file first (exportWorld is async) and call
// shareWorldFile from the tap handler.
//
// navigator.storage.persist() is requested by src/pwa.js at boot.
//
// Unit tests import this in Node: no DOM access at module top level.

import { createStore } from '../engine/store.js';
import { applyAll, createWorld, LOT_COUNT, SCHEMA } from '../engine/world.js';
import { checkArgs, OPS } from '../engine/ops.js';
import { isId, newDeviceId } from '../engine/ids.js';

export const DB_NAME = 'ourtown';
export const DB_VERSION = 1;
export const STORES = ['meta', 'snapshot', 'ops', 'blobs', 'backups'];
export const COMPACT_EVERY = 200;
export const FLUSH_DELAY = 250;
export const OPEN_TIMEOUT = 4000;
export const KEEP_BACKUPS = 2;
export const FILE_FORMAT = 'ourtown-world';
export const FILE_VERSION = 1;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function warn(...args) {
  if (typeof console !== 'undefined') console.warn('[persist]', ...args);
}

function codedError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---------------------------------------------------------------------------
// Schema: checking and migrating a world

/**
 * Migration hook: MIGRATIONS[n] turns a schema-n world into a schema-(n+1)
 * world. Add one whenever world.js bumps SCHEMA. Runs on saved snapshots and
 * on imported files. Boot writes a fresh snapshot right after a migration.
 */
export const MIGRATIONS = {};

/** Why `state` is not a usable world, or null if it is fine. */
export function checkWorld(state) {
  if (!isObj(state)) return 'not an object';
  if (!Number.isInteger(state.schema)) return 'no schema';
  if (!isObj(state.entities)) return 'no entities';
  for (const k of Object.keys(state.entities)) {
    const e = state.entities[k];
    if (!isObj(e) || e.id !== k || !isObj(e.v) || !isObj(e.props)) return 'bad entity ' + k;
  }
  const m = state.map;
  if (!isObj(m) || !Array.isArray(m.lots) || m.lots.length !== LOT_COUNT || !isObj(m.v)) return 'bad map';
  if (state.locations != null && !isObj(state.locations)) return 'bad locations';
  if (state.settings != null && !isObj(state.settings)) return 'bad settings';
  return null;
}

/**
 * Bring a saved world up to `target` schema and check it. Returns the world,
 * or throws an Error with code 'corrupt', 'too-new' or 'no-migration'.
 */
export function migrateWorld(state, { migrations = MIGRATIONS, target = SCHEMA } = {}) {
  if (!isObj(state) || !Number.isInteger(state.schema) || state.schema < 1) {
    throw codedError('corrupt', 'world has no schema version');
  }
  if (state.schema > target) throw codedError('too-new', 'world schema ' + state.schema + ' is newer than ' + target);
  let s = state;
  while (s.schema < target) {
    const m = migrations[s.schema];
    if (typeof m !== 'function') throw codedError('no-migration', 'no migration from schema ' + s.schema);
    const next = m(s);
    if (!isObj(next) || next.schema !== s.schema + 1) throw codedError('corrupt', 'migration ' + s.schema + ' failed');
    s = next;
  }
  const why = checkWorld(s);
  if (why) throw codedError('corrupt', why);
  const fresh = createWorld();
  return Object.assign({}, s, {
    locations: s.locations || {},
    settings: Object.assign({}, fresh.settings, s.settings || {}),
  });
}

/** True for an envelope worth replaying (a known op with good args). */
export function checkEnvelope(env) {
  if (!isObj(env) || !isId(env.id) || typeof env.device !== 'string' || !env.device) return false;
  if (!Number.isInteger(env.lamport) || env.lamport < 0) return false;
  try { checkArgs(env.op, env.args); } catch (e) { return false; }
  return true;
}

// ---------------------------------------------------------------------------
// Compaction and clock recovery (pure)

/**
 * Drop tombstones (entities with `deleted`) that are safe to forget:
 * - their delete stamp's lamport is <= `stableLamport` (solo play: every
 *   op there is already applied, so Infinity; see docs/design.md 6.4 for what
 *   this must be once two iPads merge logs), and
 * - nothing kept points at them: no kept entity has one as an ancestor
 *   (`locate` drops orphans on the floor of a deleted parent's last room, so
 *   that chain must stay) and no map lot holds one.
 * Returns { state, removed: [ids] }; `state` is unchanged if nothing goes.
 */
export function compactWorld(state, { stableLamport = Infinity } = {}) {
  const ents = state.entities;
  const candidates = new Set();
  for (const k of Object.keys(ents)) {
    const e = ents[k];
    const stamp = e.v && e.v.deleted;
    if (e.deleted && (!stamp || stamp[0] <= stableLamport)) candidates.add(k);
  }
  if (!candidates.size) return { state, removed: [] };
  const keep = new Set();
  for (const k of Object.keys(ents)) {
    if (candidates.has(k)) continue;
    const seen = new Set([k]);
    let p = ents[k].parent;
    while (p && !seen.has(p)) {
      seen.add(p);
      if (candidates.has(p)) keep.add(p);
      p = ents[p] ? ents[p].parent : null;
    }
  }
  for (const lot of state.map.lots) if (lot && candidates.has(lot)) keep.add(lot);
  const removed = [];
  const entities = {};
  for (const k of Object.keys(ents)) {
    if (candidates.has(k) && !keep.has(k)) removed.push(k);
    else entities[k] = ents[k];
  }
  if (!removed.length) return { state, removed };
  return { state: Object.assign({}, state, { entities }), removed };
}

function ownCounter(id, device) {
  if (typeof id !== 'string' || id.indexOf(device + ':') !== 0) return 0;
  const n = parseInt(id.slice(device.length + 1), 36);
  return isFinite(n) ? n : 0;
}

/**
 * The clock to resume with: never behind the saved clock, any replayed op or
 * any entity. The id counter must pass every id this device ever made, or a
 * new entity could reuse an old id.
 */
export function recoverClock(device, state, envs = [], saved = null) {
  let lamport = saved && Number.isInteger(saved.lamport) ? saved.lamport : 0;
  let counter = saved && Number.isInteger(saved.counter) ? saved.counter : 0;
  for (const env of envs) {
    if (env.lamport > lamport) lamport = env.lamport;
    counter = Math.max(counter, ownCounter(env.id, device));
    const a = env.args || {};
    counter = Math.max(counter, ownCounter(a.id, device), ownCounter(a.resultId, device));
  }
  for (const k of Object.keys(state.entities)) {
    const e = state.entities[k];
    if (e.rev > lamport) lamport = e.rev;
    counter = Math.max(counter, ownCounter(k, device));
  }
  return { lamport, counter };
}

// Replay a tail, skipping any op that throws (the reducers are total for
// checked ops, so this is belt and braces against a hand-edited log).
function replay(state, envs, problems) {
  try {
    return applyAll(state, envs);
  } catch (e) {
    let s = state;
    for (const env of envs) {
      try { s = applyAll(s, [env]); } catch (err) { problems.push('op ' + env.id + ' threw'); }
    }
    return s;
  }
}

// ---------------------------------------------------------------------------
// Storage adapters
//
// Both speak the same small promise API:
//   get(store, key)        -> value | undefined
//   getAll(store)          -> [[key, value], ...] sorted by key
//   keys(store)            -> [key, ...] sorted
//   batch(writes, {strict}) one atomic transaction; each write is
//       {store, key, value}   put
//       {store, key, del: true}  delete one key
//       {store, upTo: key}    delete every key <= key
//       {store, clear: true}  empty the store
//   kind                   'idb' | 'memory'
//   close()

function compareKeys(a, b) {
  const ta = typeof a, tb = typeof b;
  if (ta !== tb) return ta === 'number' ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function cloneValue(v) {
  if (v === undefined || v === null || typeof v !== 'object') return v;
  if (typeof Blob !== 'undefined' && v instanceof Blob) return v;
  return JSON.parse(JSON.stringify(v));
}

/**
 * In-memory adapter: the fallback when there is no storage, and the unit
 * test double. `adapter.failWrites = true` makes every batch reject.
 */
export function createMemoryAdapter() {
  let data = {};
  for (const s of STORES) data[s] = new Map();
  const adapter = {
    kind: 'memory',
    failWrites: false,
    data,
    get(store, key) { return Promise.resolve(cloneValue(data[store].get(key))); },
    keys(store) { return Promise.resolve(Array.from(data[store].keys()).sort(compareKeys)); },
    getAll(store) {
      const keys = Array.from(data[store].keys()).sort(compareKeys);
      return Promise.resolve(keys.map((k) => [k, cloneValue(data[store].get(k))]));
    },
    batch(writes) {
      if (adapter.failWrites) return Promise.reject(codedError('write-failed', 'memory adapter: writes fail'));
      const next = Object.assign({}, data);
      const copied = new Set();
      try {
        for (const w of writes) {
          if (!data[w.store]) throw codedError('bad-store', 'no store ' + w.store);
          if (!copied.has(w.store)) { next[w.store] = new Map(data[w.store]); copied.add(w.store); }
          const m = next[w.store];
          if (w.clear) m.clear();
          else if ('upTo' in w) { for (const k of Array.from(m.keys())) if (compareKeys(k, w.upTo) <= 0) m.delete(k); }
          else if (w.del) m.delete(w.key);
          else m.set(w.key, cloneValue(w.value));
        }
      } catch (e) {
        return Promise.reject(e);
      }
      data = next;
      adapter.data = data;
      return Promise.resolve();
    },
    close() {},
  };
  return adapter;
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(idb, name, timeout) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const finish = (ok, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      (ok ? resolve : reject)(v);
    };
    // Old Safari versions could leave open() pending forever: never hang boot.
    timer = setTimeout(() => finish(false, codedError('open-timeout', 'IndexedDB open timed out')), timeout);
    let req;
    try { req = idb.open(name, DB_VERSION); } catch (e) { finish(false, e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (settled) { db.close(); return; }
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) { db.close(); finish(false, codedError('missing-store', s)); return; }
      }
      finish(true, db);
    };
    req.onerror = () => finish(false, req.error || codedError('open-failed'));
    req.onblocked = () => {};   // another tab holds an old version; the timeout covers it
  });
}

/**
 * Open the IndexedDB adapter. Rejects where there is no usable IndexedDB
 * (private mode, missing API, open error or timeout).
 */
export function openIdbAdapter({ name = DB_NAME, idb, timeout = OPEN_TIMEOUT } = {}) {
  const factory = idb || (typeof indexedDB !== 'undefined' ? indexedDB : null);
  if (!factory || typeof factory.open !== 'function') return Promise.reject(codedError('no-indexeddb'));
  return openDb(factory, name, timeout).then((first) => {
    let db = first;
    let reopening = null;
    const watch = (d) => { d.onversionchange = () => d.close(); };
    watch(db);

    // iOS sometimes drops the IndexedDB connection after the app was in the
    // background ("Connection to Indexed Database server lost"). Reopen once
    // and retry before giving up.
    function withRetry(fn) {
      return fn(db).catch((err) => {
        if (!reopening) {
          reopening = openDb(factory, name, timeout).then((d) => { watch(d); db = d; }).finally(() => { reopening = null; });
        }
        return reopening.then(() => fn(db), () => { throw err; });
      });
    }

    function readTx(store, fn) {
      return withRetry((d) => new Promise((resolve, reject) => {
        const tx = d.transaction([store], 'readonly');
        const r = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(r());
        tx.onerror = tx.onabort = () => reject(tx.error || codedError('read-failed'));
      }));
    }

    return {
      kind: 'idb',
      get(store, key) {
        return readTx(store, (s) => { const req = s.get(key); return () => req.result; });
      },
      keys(store) {
        return readTx(store, (s) => { const req = s.getAllKeys(); return () => req.result; });
      },
      getAll(store) {
        return readTx(store, (s) => {
          const kr = s.getAllKeys();
          const vr = s.getAll();
          return () => kr.result.map((k, i) => [k, vr.result[i]]);
        });
      },
      batch(writes, { strict = false } = {}) {
        const stores = Array.from(new Set(writes.map((w) => w.store)));
        if (!stores.length) return Promise.resolve();
        return withRetry((d) => new Promise((resolve, reject) => {
          const tx = strict ? d.transaction(stores, 'readwrite', { durability: 'strict' }) : d.transaction(stores, 'readwrite');
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error || codedError('write-aborted'));
          try {
            for (const w of writes) {
              const s = tx.objectStore(w.store);
              if (w.clear) s.clear();
              else if ('upTo' in w) s.delete(IDBKeyRange.upperBound(w.upTo));
              else if (w.del) s.delete(w.key);
              else s.put(w.value, w.key);
            }
          } catch (e) {
            try { tx.abort(); } catch (e2) { /* already finished */ }
            reject(e);
            return;
          }
          // Hand the transaction to the storage process now rather than at
          // the end of this task: it matters when iOS is about to suspend us.
          if (typeof tx.commit === 'function') tx.commit();
        }));
      },
      close() { db.close(); },
    };
  });
}

// ---------------------------------------------------------------------------
// Base64 for blobs in world files

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Check and unpack a parsed world file. Returns { state, clock, blobs, device },
 * or throws an Error with code 'not-a-world', 'too-new', 'no-migration' or 'corrupt'.
 */
export function readWorldFile(file) {
  if (!isObj(file) || file.format !== FILE_FORMAT) throw codedError('not-a-world', 'not an our-town world file');
  if (!Number.isInteger(file.version) || file.version < 1) throw codedError('corrupt', 'world file has no version');
  if (file.version > FILE_VERSION) throw codedError('too-new', 'world file version ' + file.version + ' is newer than this app');
  const state = migrateWorld(file.state);
  const clock = isObj(file.clock) ? file.clock : {};
  const blobs = isObj(file.blobs) ? file.blobs : {};
  for (const k of Object.keys(blobs)) {
    const b = blobs[k];
    if (!isObj(b) || typeof b.data !== 'string') throw codedError('corrupt', 'bad blob ' + k);
  }
  return {
    state,
    clock: { lamport: Number.isInteger(clock.lamport) ? clock.lamport : 0, counter: Number.isInteger(clock.counter) ? clock.counter : 0 },
    blobs,
    device: typeof file.device === 'string' ? file.device : null,
  };
}

/** "ourtown-world-2026-09-26.json" */
export function worldFileName(date = new Date()) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return 'ourtown-world-' + date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) + '.json';
}

// ---------------------------------------------------------------------------
// The persistence controller

/**
 * Open storage and read the saved world. Never rejects.
 * Options: adapter (skip IndexedDB, e.g. createMemoryAdapter()), device
 * (force an id, tests), compactEvery, flushDelay, now, setTimer/clearTimer.
 *
 * Returns `persist`: { device, mode: 'idb'|'memory', state, clock, recovered,
 * problems, attach(store, {doc, win}), flush(), compact(), saveNow(),
 * putBlob/getBlob/deleteBlob/blobIds, exportWorld(), importWorld(input),
 * pending(), close() }.
 */
export async function openPersist(opts = {}) {
  const now = opts.now || (() => Date.now());
  const compactEvery = opts.compactEvery || COMPACT_EVERY;
  const flushDelay = opts.flushDelay == null ? FLUSH_DELAY : opts.flushDelay;
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || ((t) => clearTimeout(t));

  let adapter = opts.adapter || null;
  let mode = adapter ? adapter.kind : 'idb';
  if (!adapter) {
    try {
      adapter = await openIdbAdapter(opts.idbOptions);
    } catch (e) {
      warn('storage unavailable, playing without saving:', (e && (e.code || e.name || e.message)) || e);
      adapter = createMemoryAdapter();
      mode = 'memory';
    }
  }

  const problems = [];
  let recovered = false;
  let dirty = false;   // the saved copy is behind: the next save must be a snapshot

  // Writes that fail mid-session: note it, and let the next save be a full
  // snapshot, which includes everything the failed write had.
  let warned = false;
  const inflight = new Set();
  function write(writes, wopts) {
    const p = adapter.batch(writes, wopts).catch((e) => {
      dirty = true;
      if (!warned) { warned = true; warn('save failed, will retry with a snapshot:', (e && (e.name || e.message)) || e); }
    });
    inflight.add(p);
    p.then(() => inflight.delete(p));
    return p;
  }

  // --- the device id
  let device = opts.device || null;
  if (!device) {
    try {
      const d = await adapter.get('meta', 'device');
      if (typeof d === 'string' && /^[0-9a-z]+$/.test(d)) device = d;
    } catch (e) { problems.push('device id unreadable'); }
  }
  if (!device) {
    device = newDeviceId();
    await write([{ store: 'meta', key: 'device', value: device }]);
  }

  // --- snapshot plus tail
  let snapRec;
  let opRows = [];
  let readOk = true;
  try {
    snapRec = await adapter.get('snapshot', 'world');
    opRows = await adapter.getAll('ops');
  } catch (e) {
    readOk = false;
    problems.push('saved world unreadable: ' + ((e && (e.name || e.message)) || e));
  }

  let base = createWorld();
  let savedClock = null;
  let seq = 0;
  let migrated = false;
  let snapshotOk = readOk;
  if (readOk && snapRec !== undefined) {
    try {
      if (!isObj(snapRec)) throw codedError('corrupt', 'snapshot is not a record');
      const st = migrateWorld(snapRec.state);
      migrated = st.schema !== snapRec.state.schema;
      base = st;
      savedClock = isObj(snapRec.clock) ? snapRec.clock : null;
      seq = Number.isInteger(snapRec.seq) && snapRec.seq >= 0 ? snapRec.seq : 0;
    } catch (e) {
      snapshotOk = false;
      problems.push('snapshot: ' + e.message);
    }
  }

  let tail = [];
  if (!snapshotOk) {
    // Keep the bad data for a grown-up to rescue, then start fresh.
    recovered = true;
    const t = now();
    const writes = [
      { store: 'snapshot', clear: true },
      { store: 'ops', clear: true },
    ];
    if (readOk) {
      writes.push({ store: 'backups', key: 'backup:' + String(t).padStart(15, '0'), value: { savedAt: t, reason: problems[problems.length - 1], snapshot: snapRec, ops: opRows.slice(0, 5000) } });
    }
    await write(writes);
    try {
      const keys = (await adapter.keys('backups')).filter((k) => String(k).indexOf('backup:') === 0);
      const old = keys.slice(0, Math.max(0, keys.length - KEEP_BACKUPS));
      if (old.length) await write(old.map((k) => ({ store: 'backups', key: k, del: true })));
    } catch (e) { /* backups are best effort */ }
    base = createWorld();
    opRows = [];
    seq = 0;
  } else {
    for (const row of opRows) {
      const k = row[0], env = row[1];
      if (typeof k !== 'number' || k <= seq) continue;   // already in the snapshot
      if (checkEnvelope(env)) tail.push(env);
      else if (!isObj(env) || OPS.indexOf(env.op) !== -1) problems.push('bad op at ' + k);
    }
    if (tail.length !== opRows.filter((r) => typeof r[0] === 'number' && r[0] > seq).length) dirty = true;
  }
  if (problems.length) warn('recovered from damaged save:', problems.join('; '));

  const state = replay(base, tail, problems);
  const clock = recoverClock(device, state, tail, savedClock);
  let nextSeq = seq + 1;
  for (const row of opRows) if (typeof row[0] === 'number' && row[0] >= nextSeq) nextSeq = row[0] + 1;
  let logCount = tail.length;
  if (migrated || recovered) dirty = true;

  // --- saving
  let store = null;
  let buffer = [];     // [seq, env] not yet written
  let timer = null;
  const detachers = [];

  function schedule() {
    if (timer !== null) return;
    timer = setTimer(() => { timer = null; save(); }, flushDelay);
  }

  function cancelTimer() {
    if (timer !== null) { clearTimer(timer); timer = null; }
  }

  /** Write buffered ops (or a snapshot if due). Resolves when written. */
  function save(force) {
    cancelTimer();
    if (!store) return Promise.resolve();
    if (dirty || force || logCount + buffer.length >= compactEvery) return compact();
    if (!buffer.length) return Promise.resolve();
    const rows = buffer;
    buffer = [];
    logCount += rows.length;
    return write(rows.map((r) => ({ store: 'ops', key: r[0], value: r[1] })));
  }

  /** Snapshot the store's world now and trim the log. */
  function compact() {
    cancelTimer();
    if (!store) return Promise.resolve();
    const full = store.state;
    const { state: slim, removed } = compactWorld(full);
    const upTo = nextSeq - 1;
    const writes = [
      { store: 'snapshot', key: 'world', value: { schema: slim.schema, seq: upTo, clock: store.clockState(), savedAt: now(), state: slim } },
      { store: 'ops', upTo },
    ];
    for (const id of removed) writes.push({ store: 'blobs', key: id, del: true });
    buffer = [];
    logCount = 0;
    dirty = false;
    return write(writes, { strict: true });
  }

  /** Save everything now as a snapshot (app hidden, page going away). */
  function saveNow() {
    if (!store) return Promise.resolve();
    if (!dirty && !buffer.length && !logCount) return Promise.resolve();
    return compact();
  }

  function flush() {
    const p = save();
    return Promise.all([p].concat(Array.from(inflight))).then(() => {});
  }

  const persist = {
    device,
    mode,
    state,
    clock,
    recovered,
    problems,
    adapter,

    /** Start saving `store`'s ops and hook the page lifecycle. */
    attach(s, { doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null } = {}) {
      store = s;
      detachers.push(s.subscribe((st, env) => {
        if (!env) { dirty = true; schedule(); return; }   // store.load: a whole new world
        buffer.push([nextSeq++, env]);
        schedule();
      }));
      const onVis = () => { if (doc.visibilityState === 'hidden') saveNow(); };
      const onHide = () => { saveNow(); };
      if (doc && doc.addEventListener) {
        doc.addEventListener('visibilitychange', onVis);
        detachers.push(() => doc.removeEventListener('visibilitychange', onVis));
        doc.addEventListener('freeze', onHide);
        detachers.push(() => doc.removeEventListener('freeze', onHide));
      }
      if (win && win.addEventListener) {
        win.addEventListener('pagehide', onHide);
        detachers.push(() => win.removeEventListener('pagehide', onHide));
      }
      if (dirty) compact();
      return () => persist.detach();
    },

    detach() {
      cancelTimer();
      while (detachers.length) detachers.pop()();
    },

    /** Write whatever is buffered; resolves once every write has landed. */
    flush,
    compact() { const p = compact(); return Promise.all([p].concat(Array.from(inflight))).then(() => {}); },
    saveNow,

    /** Ops logged since the last snapshot, and ops still in memory only. */
    pending() { return { logged: logCount, buffered: buffer.length, dirty }; },

    // --- blobs (mic tapes, drawings), keyed by entity id; never inside ops
    putBlob(id, blob) { return adapter.batch([{ store: 'blobs', key: id, value: blob }]); },
    getBlob(id) { return adapter.get('blobs', id); },
    deleteBlob(id) { return adapter.batch([{ store: 'blobs', key: id, del: true }]); },
    blobIds() { return adapter.keys('blobs'); },

    /** Build the world file (a File) for the current world and its blobs. */
    async exportWorld({ blobs = true } = {}) {
      if (!store) throw codedError('not-attached', 'attach a store first');
      const out = {
        format: FILE_FORMAT,
        version: FILE_VERSION,
        schema: store.state.schema,
        exportedAt: new Date(now()).toISOString(),
        device,
        clock: store.clockState(),
        state: compactWorld(store.state).state,
        blobs: {},
      };
      if (blobs) {
        for (const id of await adapter.keys('blobs')) {
          const b = await adapter.get('blobs', id);
          if (!b || typeof b.arrayBuffer !== 'function') continue;
          out.blobs[id] = { type: b.type || '', data: bytesToBase64(new Uint8Array(await b.arrayBuffer())) };
        }
      }
      const text = JSON.stringify(out);
      const name = worldFileName(new Date(now()));
      return typeof File === 'function'
        ? new File([text], name, { type: 'application/json' })
        : Object.assign(new Blob([text], { type: 'application/json' }), { name });
    },

    /**
     * Replace the world with a world file (File, Blob, JSON text or parsed
     * object). Checks format, file version and schema (migrating older ones)
     * before touching anything; throws a coded Error if it is not usable.
     * Keeps this iPad's device id and settings. Resolves once saved.
     */
    async importWorld(input) {
      if (!store) throw codedError('not-attached', 'attach a store first');
      let parsed = input;
      if (input && typeof input.text === 'function') input = await input.text();
      if (typeof input === 'string') {
        try { parsed = JSON.parse(input); } catch (e) { throw codedError('not-a-world', 'not JSON'); }
      }
      const w = readWorldFile(parsed);
      const blobWrites = [{ store: 'blobs', clear: true }];
      for (const id of Object.keys(w.blobs)) {
        const b = w.blobs[id];
        blobWrites.push({ store: 'blobs', key: id, value: new Blob([base64ToBytes(b.data)], { type: b.type || '' }) });
      }
      await adapter.batch(blobWrites);
      const next = Object.assign({}, w.state, { settings: store.state.settings });
      const need = recoverClock(device, next, [], w.clock);
      store.load(next, need);
      // The store's id counter only moves forward through newId(): skip past
      // any id this device made in the imported world (an old backup of ours).
      while (store.clockState().counter < need.counter) store.newId();
      await persist.compact();
      return { entities: Object.keys(next.entities).length, blobs: Object.keys(w.blobs).length };
    },

    close() {
      persist.detach();
      try { adapter.close(); } catch (e) { /* ignore */ }
    },
  };
  return persist;
}

/**
 * Boot helper: open persistence, build the store from the saved world and
 * start saving. Never rejects. Returns { store, persist }.
 */
export async function openWorld(opts = {}) {
  const persist = await openPersist(opts);
  const store = createStore({
    device: persist.device,
    state: persist.state,
    lamport: persist.clock.lamport,
    counter: persist.clock.counter,
  });
  persist.attach(store, opts);
  return { store, persist };
}

// ---------------------------------------------------------------------------
// Moving world files in and out of the iPad (call from a tap handler)

/**
 * Hand a world file to the share sheet (Save to Files, AirDrop...), or
 * download it where sharing files is not supported. Resolves 'shared',
 * 'downloaded' or 'cancelled'.
 */
export async function shareWorldFile(file, { nav = typeof navigator !== 'undefined' ? navigator : null, doc = typeof document !== 'undefined' ? document : null, method } = {}) {
  if (method !== 'download' && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    let can = false;
    try { can = nav.canShare({ files: [file] }); } catch (e) { can = false; }
    if (can) {
      try {
        await nav.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        // NotAllowedError (lost the tap) and friends: fall back to a download.
      }
    }
  }
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file.name || worldFileName();
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  const t = setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (t && t.unref) t.unref();   // Node (unit tests): don't hold the process open
  return 'downloaded';
}

/**
 * Let the grown-up pick a world file. Resolves the File, or null if they
 * cancel (where the browser reports it; Safari 16 has no cancel event, so the
 * promise may simply stay pending). The input carries the class
 * "world-file-input" while open.
 */
export function pickWorldFile({ doc = typeof document !== 'undefined' ? document : null } = {}) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    // No `accept` filter: iPadOS greys out .json files it cannot type-match.
    input.className = 'world-file-input';
    input.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0;';
    const done = (f) => { input.remove(); resolve(f); };
    input.addEventListener('change', () => done((input.files && input.files[0]) || null));
    input.addEventListener('cancel', () => done(null));
    doc.body.appendChild(input);
    input.click();
  });
}
