// Deterministic randomness for game rules.
//
// Rule (docs/design.md 6.4): reducers never roll dice. Anything random (a
// mystery dish name, a customer's order, a treasure pick) is chosen by the
// device that dispatches the op, *before* the op is made, and the result is
// written into the op's args. Replaying the op on any device then gives the
// same world, and the reducers stay pure.
//
//   const dish = pick(MYSTERY_DISHES);             // roll first...
//   store.dispatch('combine', { ..., props: { name: dish } });   // ...then carry it
//
// `createRng(seed)` gives a seeded generator for tests and for anything that
// must be reproducible; game code can simply use the default Math.random.

/** Seeded PRNG (mulberry32). Returns a function giving floats in [0, 1). */
export function createRng(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random element of `list` (undefined for an empty list). */
export function pick(list, rand = Math.random) {
  return list[Math.floor(rand() * list.length)];
}

/** A random integer in [lo, hi] inclusive. */
export function randInt(lo, hi, rand = Math.random) {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** A shuffled copy of `list` (Fisher-Yates). */
export function shuffled(list, rand = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}
