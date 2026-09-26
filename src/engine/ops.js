// Ops: the only way the world changes (docs/design.md 6.4).
//
// UI code never mutates state; it dispatches small, intent-level ops. Each op
// travels in an envelope:
//
//   { id: "<deviceId>:<n>", op: "move", args: {...}, device, lamport, t }
//
// `t` is wall-clock time for debugging only; reducers never read it.
//
// | op      | args                                                            |
// |---------|-----------------------------------------------------------------|
// | spawn   | {id, kind, room | parent+slot?, x?, y?, z?, rot?, flip?, props?}   |
// | move    | {id, room, x, y, z?, rot?}   committed on drop; clears parent     |
// | attach  | {id, parent, slot?}                                              |
// | detach  | {id, room, x, y, z?}         = a move out of a parent            |
// | set     | {id, path: "props.<key>" | "rot" | "flip", value}                |
// | inc     | {id, path: "props.<key>", by, value?}  a counter intent (below)  |
// | combine | {ids, resultId, resultKind, room | parent+slot?, x?, y?, z?, props?}|
// | remove  | {id, hard?}                  to Lost & Found; hard = true delete  |
// | travel  | {ids, to}                    top-level things change room        |
// | mapSet  | {lot, structureId} and/or {night}                                |
//
// Everything an op needs is in its args: placement of a combine result, the
// picked random result, the new id. The reducer never looks anything up that
// could differ between devices.
//
// Counters and aggregates (squish counts, coins, applause, stack heights)
// use the `inc` intent, never an absolute `set` computed from what one
// device saw: two kids tapping at once would each write n+1 and one tap
// would be lost to last-writer-wins. `inc` says "add `by`". Whoever
// sequences the op resolves it (`resolveIntent`): solo play resolves it in
// the local store, host-authoritative play on the host (a guest sends the
// bare intent). Resolving writes the result into `args.value`, so the logged,
// broadcast and replayed op is a plain LWW write of that value: replay and
// merge stay idempotent and order-independent, and because the host
// resolves ops one at a time in its single order, no increment is lost.
//
// Two levels of checking:
// - `checkArgs` (shape) throws on a malformed op. That is a programming bug.
// - `validate` (meaning) returns a reason string, or null if the op makes
//   sense against the current world: the entity exists, an attach makes no
//   loop, a spawn id is new and belongs to the sender. The store runs it on
//   local dispatch; the host runs it on every guest intent. Merged peer logs
//   skip it, because the reducers are total and converge anyway.

import { deviceOf, isId } from './ids.js';
import { getEntity, isWithin, LOT_COUNT } from './world.js';

// Arg types. A trailing '?' means optional (null or missing is fine).
const T = {
  id: isId,
  ids: (v) => Array.isArray(v) && v.length > 0 && v.every(isId) && new Set(v).size === v.length,
  str: (v) => typeof v === 'string' && v.length > 0,
  num: (v) => typeof v === 'number' && isFinite(v),
  bool: (v) => typeof v === 'boolean',
  obj: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
  lot: (v) => Number.isInteger(v) && v >= 0 && v < LOT_COUNT,
  ppath: (v) => typeof v === 'string' && /^props\.[A-Za-z0-9_-]+$/.test(v),
  path: (v) => v === 'rot' || v === 'flip' || (typeof v === 'string' && /^props\.[A-Za-z0-9_-]+$/.test(v)),
  any: (v) => v !== undefined,
};

const SPEC = {
  spawn: { id: 'id', kind: 'str', room: 'str?', parent: 'id?', slot: 'str?', x: 'num?', y: 'num?', z: 'num?', rot: 'num?', flip: 'bool?', props: 'obj?' },
  move: { id: 'id', room: 'str', x: 'num', y: 'num', z: 'num?', rot: 'num?' },
  attach: { id: 'id', parent: 'id', slot: 'str?' },
  detach: { id: 'id', room: 'str', x: 'num', y: 'num', z: 'num?' },
  set: { id: 'id', path: 'path', value: 'any' },
  inc: { id: 'id', path: 'ppath', by: 'num', value: 'num?' },
  combine: { ids: 'ids', resultId: 'id', resultKind: 'str', room: 'str?', parent: 'id?', slot: 'str?', x: 'num?', y: 'num?', z: 'num?', props: 'obj?' },
  remove: { id: 'id', hard: 'bool?' },
  travel: { ids: 'ids', to: 'str' },
  mapSet: { lot: 'lot?', structureId: 'id?', night: 'bool?' },
};

/** Every op name. */
export const OPS = Object.keys(SPEC);

/** Throw a TypeError unless `args` is a well-formed `op`. */
export function checkArgs(op, args) {
  const spec = SPEC[op];
  if (!spec) throw new TypeError('unknown op: ' + op);
  if (!T.obj(args)) throw new TypeError(op + ': args must be an object');
  for (const k of Object.keys(args)) {
    if (!spec[k]) throw new TypeError(op + ': unexpected arg ' + k);
  }
  for (const k of Object.keys(spec)) {
    const t = spec[k];
    const optional = t.endsWith('?');
    const v = args[k];
    if (optional && v == null) continue;
    if (!T[optional ? t.slice(0, -1) : t](v)) throw new TypeError(op + ': bad ' + k + ': ' + JSON.stringify(v));
  }
  if ((op === 'spawn' || op === 'combine') && (args.room == null) === (args.parent == null)) {
    throw new TypeError(op + ': needs exactly one of room or parent');
  }
  if (op === 'mapSet' && args.lot == null && args.night == null) throw new TypeError('mapSet: needs lot or night');
  if (op === 'mapSet' && (args.lot == null) !== !('structureId' in args)) {
    throw new TypeError('mapSet: lot and structureId go together');
  }
}

/**
 * Build an envelope. Args are deep-copied through JSON, which also proves
 * they are serializable (they will be saved and sent between iPads).
 */
export function makeEnvelope(op, args, { id, device, lamport, t = 0 }) {
  checkArgs(op, args);
  return { id, op, args: JSON.parse(JSON.stringify(args)), device, lamport, t };
}

/** Existing entity ids an op acts on (for validation and grab leases). */
export function touchedIds(env) {
  const a = env.args;
  switch (env.op) {
    case 'spawn': return a.parent ? [a.parent] : [];
    case 'combine': return a.parent ? a.ids.concat(a.parent) : a.ids;
    case 'attach': return [a.id, a.parent];
    case 'travel': return a.ids;
    case 'mapSet': return a.structureId ? [a.structureId] : [];
    default: return [a.id];
  }
}

/** Why `env` makes no sense against `state`, or null if it is fine. */
export function validate(state, env) {
  const a = env.args;
  for (const id of touchedIds(env)) {
    if (!getEntity(state, id)) return 'gone:' + id;
  }
  const newId = env.op === 'spawn' ? a.id : env.op === 'combine' ? a.resultId : null;
  if (newId) {
    if (state.entities[newId]) return 'exists:' + newId;
    if (deviceOf(newId) !== env.device) return 'foreign-id:' + newId;
  }
  if (env.op === 'attach' && isWithin(state, a.parent, a.id)) return 'loop';
  if (env.op === 'combine' && a.parent && a.ids.some((id) => isWithin(state, a.parent, id))) return 'loop';
  return null;
}

/** The number an `inc` adds to (a missing or non-number prop counts as 0). Pure. */
export function counterValue(state, id, path) {
  const e = getEntity(state, id);
  const v = e && e.props[path.slice(6)];
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

/**
 * Resolve an intent op against the sequencer's world (the solo store, or the
 * host): `inc` gets `args.value` = current + by. Any `value` a sender filled
 * in is ignored: only the sequencer's world counts. Other ops come back
 * unchanged. Pure: returns a new envelope, never edits `env`.
 */
export function resolveIntent(state, env) {
  if (env.op !== 'inc') return env;
  const a = env.args;
  const value = counterValue(state, a.id, a.path) + a.by;
  return Object.assign({}, env, { args: Object.assign({}, a, { value }) });
}
