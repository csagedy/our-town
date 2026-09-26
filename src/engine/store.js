// The store: one device's copy of the world, and the only door into it.
//
//   const store = createStore({ device: 'k3f9x2' });
//   const id = store.newId();
//   store.dispatch('spawn', { id, kind: 'egg', room: 'cafe/kitchen', x: 300, y: 820 });
//   const off = store.subscribe((state, env) => view.update(state, env));
//
// dispatch(op, args):  check shape (throws on a bug), stamp an envelope
//   (tick the Lamport clock, next op id), check meaning with `validate`
//   (returns null if the op makes no sense, e.g. the egg is already eaten),
//   then hand the envelope to `submit`. Returns the envelope, or null.
//
// submit(env) decides where a local op goes. It returns true if accepted:
//   - solo (default): apply it right here.
//   - host (authority.js): check grab leases, re-stamp, apply, broadcast.
//   - guest (authority.js): send it to the host as an intent; it is applied
//     only when the host's broadcast comes back through `receive`.
//
// receive(env):  apply an op from elsewhere (the host, a peer's log, or the
//   saved log on boot). Duplicates (same op id) are ignored and the Lamport
//   clock jumps past the op's stamp. No semantic check: the reducers are
//   total and per-field LWW makes the merge order-independent.
//
// subscribe(fn): fn(state, env) after every applied op (env is null after
//   `load`). Returns an unsubscribe function. Views re-render from `state`;
//   persistence (P1.4) appends `env` to its log.
//
// load(state, clock): replace the world (boot from a snapshot, a guest
//   joining the host's town). clockState() gives what to save alongside.

import { createClock, createIds } from './ids.js';
import { makeEnvelope, validate } from './ops.js';
import { apply, createWorld } from './world.js';

export function createStore({ device, state = createWorld(), lamport = 0, counter = 0, now = () => Date.now() } = {}) {
  const ids = createIds(device, counter);
  const clock = createClock(lamport);
  const listeners = new Set();
  let seen = new Set();
  let submit = localApply;

  function commit(env) {
    if (seen.has(env.id)) return false;
    seen.add(env.id);
    clock.observe(env.lamport);
    state = apply(state, env);
    for (const fn of Array.from(listeners)) fn(state, env);
    return true;
  }

  function localApply(env) { return commit(env); }

  const store = {
    device,
    get state() { return state; },
    getState() { return state; },

    /** A new entity id owned by this device. Make it before dispatching a spawn. */
    newId() { return ids.next(); },

    /** Stamp an envelope for a local op without submitting it. */
    makeOp(op, args) {
      return makeEnvelope(op, args, { id: ids.next(), device, lamport: clock.tick(), t: now() });
    },

    dispatch(op, args) {
      const env = store.makeOp(op, args);
      if (validate(state, env)) return null;
      return submit(env) ? env : null;
    },

    receive(env) { return commit(env); },

    /** Advance the clock past `lamport` and return a fresh tick (host re-stamping). */
    stampAfter(lamport) { clock.observe(lamport); return clock.tick(); },

    /** Route local ops (see header). Pass null to go back to solo play. */
    setSubmit(fn) { submit = fn || localApply; },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    load(next, clockState) {
      state = next;
      seen = new Set();
      if (clockState) clock.observe(clockState.lamport || 0);
      for (const fn of Array.from(listeners)) fn(state, null);
    },

    clockState() { return { lamport: clock.time, counter: ids.counter }; },
  };
  return store;
}
