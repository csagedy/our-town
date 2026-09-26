// World state and its pure reducers (docs/design.md 6.4). The heart of the game.
//
// The world is a plain JSON object:
//
//   { schema: 1,
//     entities: { [id]: Entity },
//     locations: {},                         // per-location extras (future ops)
//     map: { lots: [id|null x 6], night: false, v: { "lots.0": stamp, night: stamp } },
//     settings: { textLayer: true, sound: true } }   // device-local, never touched by ops
//
//   Entity = { id, kind, room, parent, slot, x, y, z, rot, flip, props: {},
//              deleted?, rev, v: { field: [lamport, deviceId] } }
//
// `room` is null while the entity is parented (in a hand, on a shelf...).
// `rev` is the highest lamport of any op that touched the entity: a cheap,
// monotonic "did it change?" number for views and for sync.
//
// Merge rule: every field is a last-writer-wins register. A write lands only
// if its stamp [lamport, device] beats the stamp stored in `v[field]`, so
// the result does not depend on the order ops arrive in. Props are one field
// each ("props.cooked"). `deleted` is a sticky flag (nothing writes false),
// so a hard delete always wins. Together that makes `apply` commutative and
// idempotent for any set of ops: two devices that saw the same ops agree,
// whatever the order (the convergence tests prove it).
//
// Two consequences, both chosen for convergence:
// - A deleted entity stays as a tombstone and keeps merging writes, but it
//   is invisible (`isLive` is false). It is never "undeleted".
// - An op on an id we have not seen spawned creates a stub without `kind`
//   (also invisible). When the spawn arrives it fills the stub.
// Semantic rules that depend on other entities (a child whose parent was
// deleted falls to the floor of the parent's last room; a parent loop falls
// into Lost & Found) are applied by the selectors (`locate`, `childrenOf`,
// `inRoom`), not stored, so they stay order-independent too.
//
// Ops never reach here unchecked from the UI: the store checks args shape
// (ops.js) and, for local or host-validated play, semantics. The reducers
// are still total: any op on any state gives a valid state, never a throw.

import { newer } from './ids.js';

export const SCHEMA = 1;
export const LOT_COUNT = 6;
export const LOST_FOUND = 'lostfound';

/** A fresh, empty world. */
export function createWorld() {
  return {
    schema: SCHEMA,
    entities: {},
    locations: {},
    map: { lots: new Array(LOT_COUNT).fill(null), night: false, v: {} },
    settings: { textLayer: true, sound: true },
  };
}

// ---------------------------------------------------------------------------
// Applying ops

/** Apply one op envelope. Pure: returns a new state, `state` is untouched. */
export function apply(state, env) {
  return applyAll(state, [env]);
}

/**
 * Apply many envelopes in order with one copy-on-write draft (fast replay).
 * Unknown ops are skipped, so an older build can load a newer log safely.
 */
export function applyAll(state, envs) {
  const d = draft(state);
  for (const env of envs) {
    const r = REDUCERS[env.op];
    if (r) r(d, env.args, [env.lamport, env.device]);
  }
  return d.done();
}

const REDUCERS = {
  spawn(d, a, s) { spawnInto(d, a.id, a.kind, a, a.props, s); },

  move(d, a, s) { place(d.edit(a.id, s), a, s); },

  // Detaching is a drop somewhere: same fields as a move.
  detach(d, a, s) { place(d.edit(a.id, s), a, s); },

  attach(d, a, s) {
    const e = d.edit(a.id, s);
    write(e, 'parent', a.parent, s);
    write(e, 'slot', a.slot == null ? null : a.slot, s);
    write(e, 'room', null, s);
  },

  set(d, a, s) { write(d.edit(a.id, s), a.path, a.value, s); },

  combine(d, a, s) {
    for (const id of a.ids) write(d.edit(id, s), 'deleted', true, s);
    spawnInto(d, a.resultId, a.resultKind, a, a.props, s);
  },

  // Soft remove sends the thing to Lost & Found; hard remove is a true delete
  // (spawner clones going home, ingredients used up).
  remove(d, a, s) {
    const e = d.edit(a.id, s);
    if (a.hard) { write(e, 'deleted', true, s); return; }
    write(e, 'room', LOST_FOUND, s);
    write(e, 'parent', null, s);
    write(e, 'slot', null, s);
  },

  // Top-level things change room; their children come along implicitly.
  travel(d, a, s) {
    for (const id of a.ids) {
      const e = d.edit(id, s);
      write(e, 'room', a.to, s);
      write(e, 'parent', null, s);
      write(e, 'slot', null, s);
    }
  },

  mapSet(d, a, s) {
    const m = d.editMap();
    if (a.lot != null && newer(s, m.v['lots.' + a.lot])) {
      m.v['lots.' + a.lot] = s;
      m.lots[a.lot] = a.structureId == null ? null : a.structureId;
    }
    if (a.night != null && newer(s, m.v.night)) { m.v.night = s; m.night = a.night; }
  },
};

function spawnInto(d, id, kind, a, props, s) {
  const e = d.edit(id, s);
  write(e, 'kind', kind, s);
  if (a.parent) {
    write(e, 'parent', a.parent, s);
    write(e, 'slot', a.slot == null ? null : a.slot, s);
    write(e, 'room', null, s);
  } else {
    write(e, 'room', a.room, s);
    write(e, 'parent', null, s);
    write(e, 'slot', null, s);
  }
  write(e, 'x', a.x || 0, s);
  write(e, 'y', a.y || 0, s);
  write(e, 'z', a.z || 0, s);
  write(e, 'rot', a.rot || 0, s);
  write(e, 'flip', !!a.flip, s);
  if (props) for (const k of Object.keys(props)) write(e, 'props.' + k, props[k], s);
}

function place(e, a, s) {
  write(e, 'room', a.room, s);
  write(e, 'parent', null, s);
  write(e, 'slot', null, s);
  write(e, 'x', a.x, s);
  write(e, 'y', a.y, s);
  write(e, 'z', a.z || 0, s);
  if (a.rot != null) write(e, 'rot', a.rot, s);
}

/** The LWW rule: set `field` to `value` only if stamp `s` is newer. */
function write(e, field, value, s) {
  if (!newer(s, e.v[field])) return;
  e.v[field] = s;
  if (field.startsWith('props.')) e.props[field.slice(6)] = value;
  else e[field] = value;
}

/**
 * Copy-on-write draft: copies the entity table and each touched entity once,
 * however many ops touch them, then hands back the new state.
 */
function draft(base) {
  let entities = null;
  let map = null;
  const copied = new Set();
  return {
    edit(id, s) {
      if (!entities) entities = Object.assign({}, base.entities);
      let e = entities[id];
      if (!copied.has(id)) {
        e = e
          ? Object.assign({}, e, { props: Object.assign({}, e.props), v: Object.assign({}, e.v) })
          : { id, props: {}, v: {}, rev: 0 };   // stub until its spawn arrives
        entities[id] = e;
        copied.add(id);
      }
      if (s[0] > e.rev) e.rev = s[0];
      return e;
    },
    editMap() {
      if (!map) map = { lots: base.map.lots.slice(), night: base.map.night, v: Object.assign({}, base.map.v) };
      return map;
    },
    done() {
      if (!entities && !map) return base;
      return Object.assign({}, base, { entities: entities || base.entities, map: map || base.map });
    },
  };
}

// ---------------------------------------------------------------------------
// Selectors (read-only; views and validation use these)

/** Spawned and not deleted. */
export function isLive(e) {
  return !!e && e.kind != null && !e.deleted;
}

/** The live entity with this id, or undefined. */
export function getEntity(state, id) {
  const e = state.entities[id];
  return isLive(e) ? e : undefined;
}

/**
 * Where an entity effectively is. Walks up the parent chain:
 *   { room, top, fallen }
 * `top` is the top-level entity that carries it (itself if not parented).
 * If a parent is missing or deleted, the entity is `fallen`: it is its own
 * top and lies on the floor of the nearest ancestor's last room. A parent
 * loop (only possible when two devices merge without a host) or a chain
 * with no room at all ends in Lost & Found. Returns null for a non-live id.
 */
export function locate(state, id) {
  const self = getEntity(state, id);
  if (!self) return null;
  const seen = new Set([id]);
  let e = self;
  while (e.parent) {
    const p = state.entities[e.parent];
    if (!isLive(p)) {
      return { room: (p && lastRoom(state, p, seen)) || LOST_FOUND, top: e.id, fallen: true };
    }
    if (seen.has(p.id)) {
      // A loop. Each loop member stands alone in Lost & Found; things hanging
      // off the loop stay with the member they reach first.
      return { room: LOST_FOUND, top: p.id, fallen: p.id === id };
    }
    seen.add(p.id);
    e = p;
  }
  return { room: e.room || LOST_FOUND, top: e.id, fallen: false };
}

// The room a (possibly deleted) entity was last in, following its parents.
function lastRoom(state, e, seen) {
  while (e && !e.room && e.parent && !seen.has(e.parent)) {
    seen.add(e.parent);
    e = state.entities[e.parent];
  }
  return e ? e.room || null : null;
}

/** Live children that really sit in `id` (not fallen), sorted by slot then id. */
export function childrenOf(state, id) {
  const out = [];
  for (const k in state.entities) {
    const e = state.entities[k];
    if (e.parent === id && isLive(e)) {
      const at = locate(state, k);
      if (!at.fallen) out.push(e);
    }
  }
  return out.sort(bySlotThenId);
}

/** Live top-level entities in `room` (fallen orphans included), sorted by id. */
export function inRoom(state, room) {
  const out = [];
  for (const k in state.entities) {
    const at = locate(state, k);
    if (at && at.top === k && at.room === room) out.push(state.entities[k]);
  }
  return out.sort(bySlotThenId);
}

/** True if `id` is `ancestor` or sits (at any depth) inside it. */
export function isWithin(state, id, ancestor) {
  const seen = new Set();
  let e = state.entities[id];
  while (e && !seen.has(e.id)) {
    if (e.id === ancestor) return true;
    seen.add(e.id);
    e = e.parent ? state.entities[e.parent] : null;
  }
  return false;
}

function bySlotThenId(a, b) {
  const sa = a.slot || '', sb = b.slot || '';
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
