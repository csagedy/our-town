// Ids and clocks: the two tiny counters every op carries (docs/design.md 6.4).
//
// Device id:  a short random base36 string made once per install ("k3f9x2")
//             and kept forever by persistence (P1.4). It never contains ':'.
// Entity/op id: "<deviceId>:<counter>" with the counter in base36, e.g.
//             "k3f9x2:1a". Ids are unique across devices without any
//             coordination because the prefix differs, and stable forever.
//             One counter per device serves both entity ids and op ids.
// Lamport clock: an integer that ticks on every local op and jumps past any
//             op received from elsewhere. It orders ops across devices.
// Stamp:      [lamport, deviceId], the version stored per field. Stamps are
//             totally ordered: higher lamport wins, ties go to the larger
//             device id. Two different ops never share a stamp, because a
//             device never reuses a lamport value.
//
// All functions here are pure or take their randomness as an argument, so
// they run the same in Node tests and on the iPad.

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A fresh device id: `len` random base36 characters. */
export function newDeviceId(rand = Math.random, len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += B36[Math.floor(rand() * 36)];
  return s;
}

/**
 * Id generator for one device. `counter` is the last value handed out, so
 * persistence can resume where the previous session stopped.
 *   const ids = createIds('k3f9x2'); ids.next() -> "k3f9x2:1"
 */
export function createIds(device, counter = 0) {
  if (!device || device.indexOf(':') !== -1) throw new TypeError('bad device id: ' + device);
  return {
    device,
    next() { counter += 1; return device + ':' + counter.toString(36); },
    get counter() { return counter; },
  };
}

/** The device prefix of an id ("k3f9x2:1a" -> "k3f9x2"). */
export function deviceOf(id) {
  const i = typeof id === 'string' ? id.indexOf(':') : -1;
  return i > 0 ? id.slice(0, i) : null;
}

/** True for a well-formed "<device>:<counter>" id. */
export function isId(id) {
  return typeof id === 'string' && /^[0-9a-z]+:[0-9a-z]+$/.test(id);
}

/**
 * Lamport clock. `tick()` is for a local op, `observe(n)` for an op seen
 * from elsewhere (it never moves backwards).
 */
export function createClock(time = 0) {
  return {
    tick() { time += 1; return time; },
    observe(n) { if (n > time) time = n; return time; },
    get time() { return time; },
  };
}

/** Compare two stamps [lamport, device]: negative, zero or positive. */
export function compareStamps(a, b) {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
}

/** True when stamp `a` beats stamp `b` (a missing `b` always loses). */
export function newer(a, b) {
  return !b || compareStamps(a, b) > 0;
}
