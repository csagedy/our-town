// Host-authoritative play on two iPads (stretch goal; see spikes/p2p/README.md).
//
// One iPad hosts the town; the other visits as a guest. The same store and
// ops serve solo play; only the route of a local op changes:
//
//   guest kid drags ─► guest store.dispatch ─► send intent ─┐
//                                                           ▼
//   host kid drags ─► host store.dispatch ─────────► host.submit(env)
//                                                     1. validate against the host's world
//                                                     2. refuse if another device holds it
//                                                     3. re-stamp with the host's clock
//                                                     4. apply, then broadcast
//                                                           │
//   both stores ◄───────────── store.receive(env) ◄─────────┘
//
// The host's log is the single order of truth, so both iPads see the same
// world. Re-stamping keeps the op id and author device but takes a Lamport
// value from the host's clock, so every broadcast op is newer than anything
// either device saw before.
//
// Ownership: the kid holding an object owns it until they drop it. A drag
// start calls `grab(id, device)`; the lease lasts `ttl` ms (renew by calling
// grab again while dragging) and ends on `release`, or automatically when
// the owner's committed op on it (the drop) is accepted. Holding a thing
// also holds whatever is inside it. The other kid's grab or op on a held
// thing is refused with 'busy' and their UI plays the "busy" wobble.
// Leases are session-only: never persisted, never part of the world.
//
// Transport (WebRTC data channel, QR pairing) is not here: `broadcast` and
// the guest's `send` are plain callbacks, so tests wire devices in-process.

import { touchedIds, validate } from './ops.js';
import { getEntity, isWithin } from './world.js';

const RELEASING = new Set(['move', 'detach', 'attach', 'remove', 'travel', 'combine']);

/**
 * Make `store` the host. Its own local dispatches go through the same checks.
 *   const host = createHost(store, { broadcast: (env) => channel.send(env) });
 */
export function createHost(store, { broadcast = () => {}, now = () => Date.now(), ttl = 5000 } = {}) {
  const leases = new Map();   // entity id -> { device, until }

  function holder(id) {
    const l = leases.get(id);
    if (!l) return null;
    if (l.until <= now()) { leases.delete(id); return null; }
    return l.device;
  }

  // Held by someone other than `device`, either itself or via a container.
  function heldByOther(id, device) {
    for (const held of Array.from(leases.keys())) {
      const who = holder(held);
      if (who && who !== device && isWithin(store.state, id, held)) return true;
    }
    return false;
  }

  const host = {
    holder,

    /** Try to pick up `id` for `device`. True if granted (or renewed). */
    grab(id, device) {
      if (!getEntity(store.state, id) || heldByOther(id, device)) return false;
      leases.set(id, { device, until: now() + ttl });
      return true;
    },

    release(id, device) {
      if (holder(id) === device) leases.delete(id);
    },

    /** Validate and sequence an op from any device. Returns { ok, reason, env }. */
    submit(env) {
      const reason = validate(store.state, env) ||
        (touchedIds(env).some((id) => heldByOther(id, env.device)) ? 'busy' : null);
      if (reason) return { ok: false, reason, env };
      const seq = Object.assign({}, env, { lamport: store.stampAfter(env.lamport) });
      if (!store.receive(seq)) return { ok: false, reason: 'duplicate', env };
      if (RELEASING.has(env.op)) for (const id of touchedIds(env)) host.release(id, env.device);
      broadcast(seq);
      return { ok: true, reason: null, env: seq };
    },
  };

  store.setSubmit((env) => host.submit(env).ok);
  return host;
}

/**
 * Make `store` a guest: local ops become intents sent to the host. Load the
 * host's world first (`store.load(hostState)`), then feed every broadcast
 * into `store.receive`.
 */
export function joinAsGuest(store, send) {
  store.setSubmit((env) => { send(env); return true; });
}
