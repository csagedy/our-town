// In-memory stand-in for a WebRTC data channel pair, for unit tests of
// src/net/transport.js createLink and src/net/session.js. Messages are
// delivered asynchronously (a microtask later, like a real channel), in order.

import { createLink } from '../../src/net/transport.js';

export class FakeChannel extends EventTarget {
  constructor() {
    super();
    this.readyState = 'connecting';
    this.peer = null;
    this.sent = [];      // every raw frame this side sent
    this.cutOff = false; // true: frames vanish (an iPad fell asleep), no close event
  }

  send(text) {
    if (this.readyState !== 'open') throw new Error('InvalidStateError');
    this.sent.push(text);
    if (this.cutOff) return;
    const p = this.peer;
    queueMicrotask(() => {
      if (p.readyState === 'open' && !p.cutOff) p.dispatchEvent(new MessageEvent('message', { data: text }));
    });
  }

  open() {
    this.readyState = 'open';
    this.dispatchEvent(new Event('open'));
  }

  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
    const p = this.peer;
    queueMicrotask(() => p.close());
  }
}

export function channelPair() {
  const a = new FakeChannel(), b = new FakeChannel();
  a.peer = b; b.peer = a;
  return [a, b];
}

// Timers that only run when the test says so: no stray real intervals.
export function manualTimers() {
  let t = 1000;
  let nextId = 1;
  const timers = new Map();   // id -> { at, fn, every }
  return {
    now: () => t,
    setTimer(fn, ms) { const id = nextId++; timers.set(id, { at: t + ms, fn, every: 0 }); return id; },
    clearTimer(id) { timers.delete(id); },
    setInterval(fn, ms) { const id = nextId++; timers.set(id, { at: t + ms, fn, every: ms }); return id; },
    clearInterval(id) { timers.delete(id); },
    /** Move the clock forward, firing due timers in order. */
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let best = null;
        for (const [id, x] of timers) if (x.at <= end && (!best || x.at < best[1].at)) best = [id, x];
        if (!best) break;
        const [id, x] = best;
        t = x.at;
        if (x.every) x.at += x.every; else timers.delete(id);
        x.fn();
      }
      t = end;
    },
    get count() { return timers.size; },
  };
}

/** Two open links joined by fake channels. opts go to createLink (timers). */
export function linkPair(opts = {}) {
  const [ca, cb] = channelPair();
  const a = createLink(ca, opts), b = createLink(cb, opts);
  ca.open(); cb.open();
  return { a, b, ca, cb };
}

/** Let queued deliveries (and anything they trigger) run. */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}
