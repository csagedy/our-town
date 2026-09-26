// The starter behaviors (P1.8). Each one is small and composable; a kind
// lists several (see data/catalog.json). Params are documented next to
// their defaults. The reaction context `rx` is described in runtime.js.
//
//   toggle     tap flips a boolean prop (a lamp, a jar lid, a book)
//   cycle      tap steps through looks (a mug fills, a flower blooms, an egg cracks)
//   sound      tap plays a sound (with a pitch picked from a list)
//   squeak     a squeeze toy: a big squish, a squeak, hearts
//   wobble     rocks like jelly
//   spill      tap (or long press) tips the contents out around it
//   container  accepts drops of things with the right tags; refuses others with a bounce-back
//   eatable    tap (or a character, later) takes a bite through the bite looks
//   spawner    P1.9 stub: tap pops out a new thing (capped); not draggable

import { defineBehavior } from './registry.js';
import { pick } from '../../engine/random.js';
import { inRoom } from '../../engine/world.js';

const isStrList = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every((s) => typeof s === 'string' && s);
const soundOk = (name, sounds) => name == null || !sounds || sounds.includes(name);
const clampIdx = (i, n) => Math.max(0, Math.min(n - 1, i | 0));

defineBehavior('toggle', {
  params: {
    key: 'on',                 // the boolean prop it flips
    looks: null,               // [offLook, onLook] art variants, or null (no look change)
    sounds: ['tap', 'ding'],   // [turning off, turning on]
    fx: 'sparkle',             // particles when it turns on (null for none)
  },
  check(p, { sounds }) {
    if (typeof p.key !== 'string' || !p.key) return 'key must be a prop name';
    if (p.looks != null && !isStrList(p.looks, 2)) return 'looks must be [off, on]';
    if (!isStrList(p.sounds, 2) || !p.sounds.every((s) => soundOk(s, sounds))) return 'sounds must be two sound names';
    return null;
  },
  look: (e, p) => (p.looks ? p.looks[e.props[p.key] ? 1 : 0] : null),
  onTap(e, rx, p) {
    const on = !e.props[p.key];
    rx.set(p.key, on);
    rx.play(p.sounds[on ? 1 : 0], { pitch: on ? 1.1 : 0.9 });
    rx.squish({ amount: 0.7 });
    if (on && p.fx) rx.burst(p.fx, { count: 6 });
    return true;
  },
});

defineBehavior('cycle', {
  params: {
    key: 'frame',       // the prop holding the look index
    looks: [],          // at least two looks, in order
    loop: true,         // false: stops at the last look (later taps get the fallback reaction)
    sound: 'plink',     // played on each step (null for none)
    fx: 'sparkle',
  },
  check(p, { sounds }) {
    if (!isStrList(p.looks, 2)) return 'looks must list at least two looks';
    if (!soundOk(p.sound, sounds)) return 'unknown sound ' + p.sound;
    return null;
  },
  look: (e, p) => p.looks[clampIdx(e.props[p.key] || 0, p.looks.length)],
  onTap(e, rx, p) {
    const n = p.looks.length;
    const next = (e.props[p.key] || 0) + 1;
    if (next >= n && !p.loop) return false;
    rx.set(p.key, next % n);
    if (p.sound) rx.play(p.sound, { pitch: 0.9 + (next % n) * 0.12 });
    rx.squish({ amount: 0.8 });
    if (p.fx) rx.burst(p.fx, { count: 5 });
    return true;
  },
});

defineBehavior('sound', {
  params: {
    name: 'pop',        // the sound
    pitches: null,      // a list of pitch factors to pick from (null: a small random wiggle)
  },
  check(p, { sounds }) {
    if (!soundOk(p.name, sounds) || typeof p.name !== 'string') return 'unknown sound ' + p.name;
    if (p.pitches != null && !(Array.isArray(p.pitches) && p.pitches.length && p.pitches.every((x) => typeof x === 'number' && x > 0))) return 'pitches must be positive numbers';
    return null;
  },
  onTap(e, rx, p) {
    rx.play(p.name, { pitch: p.pitches ? pick(p.pitches, rx.random) : 0.94 + rx.random() * 0.12 });
    return true;
  },
});

defineBehavior('squeak', {
  params: {
    pitch: [0.85, 1.35],   // random pitch range
    hearts: true,          // a few hearts float up
  },
  onTap(e, rx, p) {
    rx.play('squeak', { pitch: p.pitch[0] + rx.random() * (p.pitch[1] - p.pitch[0]) });
    rx.squish({ amount: 1.6, duration: 460 });
    if (p.hearts) rx.burst('heart', { count: 3, spread: 50 });
    return true;
  },
});

defineBehavior('wobble', {
  params: {
    amount: 1,      // how far it rocks (1 = about 9 degrees)
    sound: null,    // optional sound with the wobble
  },
  check: (p, { sounds }) => (soundOk(p.sound, sounds) ? null : 'unknown sound ' + p.sound),
  onTap(e, rx, p) {
    rx.wobble({ amount: p.amount });
    if (p.sound) rx.play(p.sound);
    return true;
  },
});

// Tip the contents out: each child gets a spot around the container (on the
// same surface if there is room, else the floor) and pops out with a fall.
function spillOut(e, rx, p) {
  const kids = rx.children();
  if (!kids.length) return false;
  const n = kids.length;
  kids.forEach((c, i) => {
    const side = n === 1 ? (rx.random() < 0.5 ? -1 : 1) : (i - (n - 1) / 2) / ((n - 1) / 2 || 1);
    const x = e.x + side * p.spread + (rx.random() - 0.5) * 30;
    const spot = rx.settleAt(c, x, e.y, { floorJitter: true });
    if (rx.dispatch('detach', { id: c.id, room: rx.room.id, x: spot.x, y: spot.y, z: spot.z })) {
      rx.popFrom(c.id, e.x, e.y - rx.size().h * 0.6);
    }
  });
  rx.play(p.sound);
  rx.wobble({ amount: 1.2 });
  rx.burst('puff', { count: 5 });
  return true;
}

defineBehavior('spill', {
  params: {
    on: 'tap',          // 'tap' | 'longPress': which gesture tips it
    sound: 'whoosh',
    spread: 110,        // how far things land from it (units)
  },
  check(p, { sounds }) {
    if (p.on !== 'tap' && p.on !== 'longPress') return 'on must be tap or longPress';
    return soundOk(p.sound, sounds) ? null : 'unknown sound ' + p.sound;
  },
  onTap: (e, rx, p) => (p.on === 'tap' ? spillOut(e, rx, p) : false),
  onLongPress: (e, rx, p) => (p.on === 'longPress' ? spillOut(e, rx, p) : false),
  verbs: { spill: spillOut },
});

defineBehavior('container', {
  params: {
    accepts: [],         // tags it takes (an item needs any one of them)
    capacity: 4,         // how many things fit
    look: null,          // look while it holds something (a bowl of soup), or null
    sound: 'plink',      // accepted
    refuseSound: 'boing',
  },
  check(p, { sounds }) {
    if (!isStrList(p.accepts)) return 'accepts must list at least one tag';
    if (!(Number.isInteger(p.capacity) && p.capacity > 0)) return 'capacity must be a positive integer';
    if (!soundOk(p.sound, sounds) || !soundOk(p.refuseSound, sounds)) return 'unknown sound';
    return null;
  },
  look: (e, p, w) => (p.look && w.children().length ? p.look : null),
  accepts: () => true,   // every container is a drop target: a wrong item gets a playful "no", never nothing
  receive(target, item, rx, p) {
    const tags = rx.catalog.tagsOf(item.kind);
    const fits = p.accepts.some((t) => tags.includes(t));
    if (!fits || rx.children().length >= p.capacity) {
      rx.refuse(p.refuseSound);
      return 'refuse';
    }
    if (!rx.dispatch('attach', { id: item.id, parent: target.id, slot: 'in' })) {
      rx.refuse(p.refuseSound);
      return 'refuse';
    }
    rx.play(p.sound, { pitch: 1 + rx.children().length * 0.1 });
    rx.squish({ amount: 1.1 });
    rx.burst('sparkle', { count: 7 });
    return 'accept';
  },
});

// One bite: step the bite look (an `inc`, so two kids biting at once both
// count); past the last look the food is gone (then: 'gone') or stays as
// its last look (then: 'stay', an apple core). Returns false when there is
// nothing left to bite.
function bite(e, rx, p) {
  const n = p.looks.length;
  const b = e.props.bites || 0;
  if (b + 1 >= n) {
    if (p.then !== 'gone') return false;
    rx.play(p.sound, { pitch: 0.9 });
    rx.burst('puff', { count: 7, scale: 0.6 });
    rx.burst('heart', { count: 2 });
    rx.squish();
    rx.dispatch('remove', { id: e.id, hard: true });
    return true;
  }
  rx.inc('bites', 1);
  rx.play(p.sound, { pitch: 0.95 + rx.random() * 0.15 });
  rx.squish({ amount: 0.8 });
  rx.burst('puff', { count: 5, scale: 0.4, spread: 40 });   // crumbs
  return true;
}

defineBehavior('eatable', {
  params: {
    looks: ['whole'],   // bite looks in order; the first is untouched
    then: 'gone',       // after the last look: 'gone' (eaten up) or 'stay' (a core stays)
    sound: 'munch',
  },
  check(p, { sounds }) {
    if (!isStrList(p.looks)) return 'looks must list the bite looks';
    if (p.then !== 'gone' && p.then !== 'stay') return 'then must be gone or stay';
    return soundOk(p.sound, sounds) ? null : 'unknown sound ' + p.sound;
  },
  look: (e, p) => p.looks[clampIdx(e.props.bites || 0, p.looks.length)],
  onTap: bite,
  verbs: { bite },
});

defineBehavior('spawner', {
  params: {
    kinds: [],       // catalog kinds it pops out
    max: 6,          // loose things from it in this room at once (then a playful "that's plenty" shake)
    sound: 'pop',
    spread: 150,
  },
  check(p, { kinds, sounds }) {
    if (!isStrList(p.kinds)) return 'kinds must list at least one kind';
    const missing = p.kinds.filter((k) => !kinds[k]);
    if (missing.length) return 'unknown kinds ' + missing.join(', ');
    if (!(Number.isInteger(p.max) && p.max > 0)) return 'max must be a positive integer';
    return soundOk(p.sound, sounds) ? null : 'unknown sound ' + p.sound;
  },
  canDrag: () => false,   // P1.9: dragging from a spawner clones a new thing
  onTap(e, rx, p) {
    const out = inRoom(rx.state, rx.room.id).filter((x) => x.props.from === e.id).length;
    if (out >= p.max) {
      rx.shake();
      rx.play('boing', { pitch: 0.8 });
      rx.burst('puff', { count: 4 });
      return true;
    }
    const kind = pick(p.kinds, rx.random);
    const id = rx.newId();
    const x = e.x + (rx.random() < 0.5 ? -1 : 1) * (p.spread * (0.6 + rx.random() * 0.4));
    const spot = rx.settleAt({ id, kind }, x, e.y, { floorJitter: true });
    if (!rx.dispatch('spawn', { id, kind, room: rx.room.id, x: spot.x, y: spot.y, z: spot.z, props: { from: e.id } })) return false;
    rx.popFrom(id, e.x, e.y - rx.size().h);
    rx.play(p.sound);
    rx.squish({ amount: 1.2 });
    rx.burst('sparkle', { count: 6 });
    return true;
  },
});
