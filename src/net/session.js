// Two-iPad session (stretch, bead oxg.2): host and guest roles on top of the
// engine's authority.js, over any link from transport.js (or an in-memory
// pair in tests). Design: docs/design.md 6.4 "Ownership and two iPads".
//
//   const session = createSession({ store, persist });
//   session.host(link);   // this iPad's town is the shared one
//   session.join(link);   // this iPad visits the other town
//   session.leave();      // end it: a guest goes home to its own town
//
// Host: its world, its save. When the guest says hello it gets a snapshot of
// the whole world (and the live grab leases). Every local op on either iPad
// goes through authority.createHost: validated, refused as 'busy' if the
// other kid holds the thing, re-stamped and broadcast. The host keeps saving
// as usual, so whatever the guest builds stays in the host's town.
//
// Guest: "visits". On the snapshot its own world is stashed in memory and
// persistence is detached, so its solo save on disk is never touched by the
// visit; local ops become intents to the host (authority.joinAsGuest) and
// only the host's broadcasts change the world. leave() puts the stash back
// and re-attaches persistence. If the app is killed mid-visit, the next boot
// simply loads the untouched solo save.
//
// Link drops (sleep, out of range, app killed): each side keeps playing solo.
// The host drops the guest's leases and plays on in its town. The guest stays
// in its local copy of the host's town ('away': ops apply locally, nothing is
// saved) so play does not jump; re-pairing (a new link) brings a fresh
// snapshot, and leave() goes home.
//
// Grab leases: grab(id) before a drag (Promise<boolean>: a guest asks the
// host), release(id) on drop; renewed automatically while held. Both iPads
// learn who holds what through 'held' events: heldByOther(id) and
// on('held', (id, device|null) => ...) drive the "the other kid has it" look.
//
// Messages (JSON over the link):
//   guest -> host  {t:'hello', v, device, schema}   {t:'op', env}
//                  {t:'grab', id, req}              {t:'release', id}
//   host -> guest  {t:'snap', state, clock, counter, leases}   {t:'op', env}
//                  {t:'no', id, reason}   {t:'grant', req, ok}   {t:'held', id, by}
//                  {t:'bye', reason}
//
// Events: 'status' (status), 'held' (id, by), 'refused' ({id, reason, env}),
// 'remote' (env: an op authored on the other iPad was applied here).
//
// No DOM access (unit tests drive it in Node).

import { createHost, joinAsGuest } from '../engine/authority.js';
import { recoverClock } from '../core/persist.js';

export const PROTOCOL = 1;
export const GRAB_TIMEOUT = 3000;
export const SWEEP_MS = 1000;

function ownCounter(id, device) {
  if (typeof id !== 'string') return 0;
  const i = id.lastIndexOf(':');
  if (i === -1 || id.slice(0, i) !== device) return 0;
  const n = parseInt(id.slice(i + 1), 36);
  return Number.isFinite(n) ? n : 0;
}

/**
 * opts: store (required), persist (optional: the guest detaches it while
 * visiting), now, ttl (lease ms), setTimer/clearTimer/setInterval/clearInterval.
 *
 * status: 'solo' | 'hosting' (guest connected) | 'visiting' (guest,
 * connected) | 'away' (guest, link lost, still in the host's town).
 */
export function createSession(opts) {
  const store = opts.store;
  const persist = opts.persist || null;
  const now = opts.now || (() => Date.now());
  const ttl = opts.ttl || 5000;
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || ((t) => clearTimeout(t));
  const setInt = opts.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearInt = opts.clearInterval || ((t) => clearInterval(t));

  const listeners = { status: [], held: [], refused: [], remote: [] };
  let status = 'solo';
  let role = 'solo';
  let link = null;
  let offLink = [];
  let auth = null;            // host: authority.createHost
  let peer = null;            // the other iPad's device id
  let guestReady = false;     // host: snapshot sent, broadcasts may flow
  let stash = null;           // guest: { state, clock } of its own town
  let held = {};              // id -> device, as last announced
  const mine = new Set();     // ids this iPad holds (renewed while held)
  const pending = new Map();  // guest: grab req -> { resolve, timer }
  const peerCounter = {};     // host: highest counter seen in each guest's op ids
  const inflight = new Map(); // guest: op id -> intent sent, not yet echoed or refused
  let nextReq = 1;
  let sweep = null;

  function emit(type, a, b) {
    for (const fn of listeners[type].slice()) fn(a, b);
  }

  function setStatus(s) {
    if (s === status) return;
    status = s;
    emit('status', s);
  }

  function send(m) { return link ? link.send(m) : false; }

  // --- held bookkeeping (both roles see the same map)

  function setHeld(next) {
    const before = held;
    held = next;
    const ids = new Set(Object.keys(before).concat(Object.keys(next)));
    for (const id of ids) {
      if (before[id] !== next[id]) emit('held', id, next[id] || null);
    }
  }

  // Host: compare the authority's live leases with what both sides were told.
  function syncHeld() {
    if (!auth) return;
    const next = auth.leases();
    const before = held;
    setHeld(next);
    if (!guestReady) return;
    const ids = new Set(Object.keys(before).concat(Object.keys(next)));
    for (const id of ids) if (before[id] !== next[id]) send({ t: 'held', id, by: next[id] || null });
  }

  function startSweep() {
    stopSweep();
    sweep = setInt(() => {
      syncHeld();
      // Keep this iPad's own grabs alive while the kid is still holding.
      for (const id of mine) renew(id);
    }, Math.min(SWEEP_MS, Math.floor(ttl / 2)));
  }

  function stopSweep() {
    if (sweep !== null) { clearInt(sweep); sweep = null; }
  }

  function renew(id) {
    if (role === 'host' && auth) auth.grab(id, store.device);
    else if (role === 'guest' && status === 'visiting') send({ t: 'grab', id, req: 0 });
  }

  // --- link plumbing

  function detachLink(reason) {
    for (const off of offLink) off();
    offLink = [];
    const l = link;
    link = null;
    if (l && l.isOpen) l.close(reason || 'replaced');
  }

  function useLink(l, onMessage) {
    detachLink('replaced');
    link = l;
    offLink.push(l.on('message', onMessage));
    offLink.push(l.on('close', () => { if (link === l) dropped(); }));
  }

  function failGrabs() {
    for (const p of pending.values()) { clearTimer(p.timer); p.resolve(false); }
    pending.clear();
  }

  // The link died (not leave()): both sides play on alone.
  function dropped() {
    for (const off of offLink) off();
    offLink = [];
    link = null;
    failGrabs();
    if (role === 'host') {
      if (auth && peer) auth.releaseAll(peer);
      syncHeld();
      guestReady = false;
      toSolo();
    } else if (role === 'guest') {
      store.setSubmit(null);        // play on in the local copy (not saved)
      inflight.clear();
      setHeld({});
      mine.clear();
      setStatus(stash ? 'away' : 'solo');
      if (!stash) { role = 'solo'; stopSweep(); }
    }
  }

  function toSolo() {
    stopSweep();
    store.setSubmit(null);
    auth = null;
    role = 'solo';
    mine.clear();
    setHeld({});
    setStatus('solo');
  }

  // --- host

  function hostMessage(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'hello') {
      if (m.v !== PROTOCOL || m.schema !== store.state.schema || typeof m.device !== 'string' || m.device === store.device) {
        send({ t: 'bye', reason: 'version' });
        link.close('version');
        return;
      }
      peer = m.device;
      const state = Object.assign({}, store.state);
      delete state.settings;          // device-local
      send({ t: 'snap', state, clock: store.clockState(), counter: peerCounter[peer] || 0, leases: auth.leases() });
      guestReady = true;
      setStatus('hosting');
      return;
    }
    if (!guestReady) return;
    if (m.t === 'op' && m.env && m.env.device === peer) {
      peerCounter[peer] = Math.max(peerCounter[peer] || 0, ownCounter(m.env.id, peer));
      const r = auth.submit(m.env);
      if (!r.ok) send({ t: 'no', id: m.env.id, reason: r.reason });
      syncHeld();
    } else if (m.t === 'grab') {
      const ok = auth.grab(m.id, peer);
      if (m.req) send({ t: 'grant', req: m.req, id: m.id, ok });
      syncHeld();
    } else if (m.t === 'release') {
      auth.release(m.id, peer);
      syncHeld();
    }
  }

  // --- guest

  function guestMessage(m) {
    if (!m || typeof m.t !== 'string') return;
    if (m.t === 'snap') {
      if (!stash) {
        // Save anything unsaved, then stop saving: the visit never touches
        // this iPad's own save.
        if (persist) { persist.saveNow(); persist.detach(); }
        stash = { state: store.state, clock: store.clockState() };
      }
      const next = Object.assign({}, m.state, { settings: stash.state.settings });
      store.load(next, m.clock);
      // Never reuse an id the host already knows from this iPad.
      const need = Math.max(recoverClock(store.device, next, [], null).counter, m.counter || 0);
      while (store.clockState().counter < need) store.newId();
      inflight.clear();
      joinAsGuest(store, (env) => { if (send({ t: 'op', env })) inflight.set(env.id, env); });
      role = 'guest';
      setHeld(m.leases || {});
      setStatus('visiting');
      return;
    }
    if (status !== 'visiting') return;
    if (m.t === 'op' && m.env) {
      inflight.delete(m.env.id);
      if (store.receive(m.env) && m.env.device !== store.device) emit('remote', m.env);
    } else if (m.t === 'no') {
      const env = inflight.get(m.id) || null;
      inflight.delete(m.id);
      emit('refused', { id: m.id, reason: m.reason, env });
    } else if (m.t === 'grant') {
      const p = pending.get(m.req);
      if (p) { pending.delete(m.req); clearTimer(p.timer); if (!m.ok) mine.delete(m.id); p.resolve(!!m.ok); }
    } else if (m.t === 'held') {
      const next = Object.assign({}, held);
      if (m.by) next[m.id] = m.by; else delete next[m.id];
      setHeld(next);
    } else if (m.t === 'bye') {
      link.close(m.reason || 'bye');
    }
  }

  const session = {
    get status() { return status; },
    get role() { return role; },
    get peer() { return peer; },
    get connected() { return status === 'hosting' || status === 'visiting'; },
    get visiting() { return !!stash; },
    get link() { return link; },

    on(type, fn) {
      listeners[type].push(fn);
      return () => { const i = listeners[type].indexOf(fn); if (i !== -1) listeners[type].splice(i, 1); };
    },

    /** Host the shared town over an open link (a re-pair replaces the old link). */
    host(l) {
      if (stash) session.leave();   // a visiting guest goes home first
      if (!auth) {
        auth = createHost(store, {
          broadcast: (env) => { if (guestReady) send({ t: 'op', env }); },
          now,
          ttl,
        });
      }
      role = 'host';
      guestReady = false;
      peer = null;
      useLink(l, hostMessage);
      startSweep();
      // Host-local ops can end a lease (a drop): tell both sides.
      offLink.push(store.subscribe((s, env) => {
        if (!env) return;
        if (env.device !== store.device) emit('remote', env);
        syncHeld();
      }));
    },

    /** Visit the other iPad's town over an open link. */
    join(l) {
      if (role === 'host') { detachLink('replaced'); toSolo(); }
      role = 'guest';
      useLink(l, guestMessage);
      startSweep();
      send({ t: 'hello', v: PROTOCOL, device: store.device, schema: store.state.schema });
    },

    /** End the session. A guest goes back to its own town and save. */
    leave() {
      failGrabs();
      inflight.clear();
      detachLink('leave');
      if (stash) {
        store.setSubmit(null);
        store.load(stash.state, stash.clock);
        stash = null;
        if (persist) persist.attach(store);
      }
      guestReady = false;
      peer = null;
      toSolo();
    },

    /** Pick up `id` for this kid. Resolves false if the other kid has it. */
    grab(id) {
      if (held[id] && held[id] !== store.device) return Promise.resolve(false);
      if (role === 'host' && auth) {
        const ok = auth.grab(id, store.device);
        if (ok) mine.add(id);
        syncHeld();
        return Promise.resolve(ok);
      }
      if (role === 'guest' && status === 'visiting') {
        mine.add(id);
        const req = nextReq++;
        return new Promise((resolve) => {
          const timer = setTimer(() => { pending.delete(req); mine.delete(id); resolve(false); }, GRAB_TIMEOUT);
          pending.set(req, { resolve, timer });
          send({ t: 'grab', id, req });
        });
      }
      return Promise.resolve(true);   // solo: nobody to share with
    },

    release(id) {
      mine.delete(id);
      if (role === 'host' && auth) { auth.release(id, store.device); syncHeld(); }
      else if (role === 'guest' && status === 'visiting') send({ t: 'release', id });
    },

    holder(id) { return held[id] || null; },
    heldByOther(id) { return !!held[id] && held[id] !== store.device; },
    held() { return Object.assign({}, held); },

    /** Guest: intents sent to the host and not yet echoed back (oldest first). */
    inflight() { return Array.from(inflight.values()); },
  };
  return session;
}
