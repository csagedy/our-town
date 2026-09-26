// The starter behaviors (P1.8). Each one is small and composable; a kind
// lists several (see data/catalog.json). Params are documented next to
// their defaults. The reaction context `rx` is described in runtime.js.
//
//   toggle     tap flips a boolean prop (a lamp, a jar lid, a book)
//   cycle      tap steps through looks (a mug fills, a flower blooms, an egg cracks)
//   sound      tap plays a sound (with a pitch picked from a list)
//   squeak     a squeeze toy: a big squish, a squeak, hearts
//   wobble     rocks like jelly
//   spill      tap (or long press) tips the contents out onto distinct spots around it
//   container  accepts drops of things with the right tags into slots drawn by a layout
//              (P1.9, src/core/containers.js); refuses others, and a full one, with a bounce-back
//   eatable    tap (or a character, later) takes a bite through the bite looks; a dish's
//              last bite leaves its plate (or bowl, glass, tray) behind (`leaves`)
//   spawner    an infinite source (P1.9): dragging from it pulls out a new clone, a tap pops
//              one out; a clone dropped back on it goes home. Not draggable itself.
//   variant    the look is a prop's value (a crayon's color)
//   peek       tap: the things inside a basket or bag hop up so you can see them

import { defineBehavior } from './registry.js';
import { pick } from '../../engine/random.js';
import { checkLayout } from '../containers.js';

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

// Tip the contents out: each child gets its own free spot around the
// container (on the surface it stands on while there is room, then the
// floor; containers.js planSpill: no two land on top of each other) and pops
// out with a fall. A container inside another spills from where it is drawn.
function spillOut(e, rx, p) {
  const kids = rx.children();
  if (!kids.length) return false;
  const at = rx.where();
  const top = at.y - rx.size().h * 0.6;
  for (const s of rx.spots(kids, { from: at, gap: Math.max(6, p.spread / 10) })) {
    if (rx.dispatch('detach', { id: s.id, room: rx.room.id, x: s.x, y: s.y, z: s.z })) rx.popFrom(s.id, at.x, top);
  }
  rx.play(p.sound);
  rx.wobble({ amount: 1.2 });
  rx.burst('puff', { count: 5 });
  return true;
}

defineBehavior('spill', {
  params: {
    on: 'tap',          // 'tap' | 'longPress': which gesture tips it
    sound: 'whoosh',
    spread: 110,        // room between the things it tips out (units x 10)
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
    accepts: [],         // tags it takes (an item needs any one of them; "*" takes anything)
    capacity: 4,         // how many things fit (one slot each)
    look: null,          // look while it holds something (a bowl of soup), or null
    sound: 'plink',      // accepted
    refuseSound: 'boing',
    // Slot layout (src/core/containers.js): how the things inside are drawn.
    layout: 'hidden',    // hidden | row | grid | shelves | stack | heap | plate | interior
    area: null,          // [left, top, right, bottom] fractions of its box where feet go
    cols: null,          // spots per row / shelf
    shelves: null,       // shelf lines, y fractions top to bottom (layout: shelves)
    peek: null,          // heap / interior: how much of each thing shows over the rim (0 = hidden)
    scale: null,         // things inside are drawn this much smaller
  },
  check(p, { sounds }) {
    if (!isStrList(p.accepts)) return 'accepts must list at least one tag';
    if (!(Number.isInteger(p.capacity) && p.capacity > 0)) return 'capacity must be a positive integer';
    if (!soundOk(p.sound, sounds) || !soundOk(p.refuseSound, sounds)) return 'unknown sound';
    return checkLayout(p);
  },
  look: (e, p, w) => (p.look && w.children().length ? p.look : null),
  accepts: () => true,   // every container is a drop target: a wrong item gets a playful "no", never nothing
  receive(target, item, rx, p) {
    if (item.parent === target.id) {
      // Picked up and put back: it springs back to its own slot.
      rx.reason = 'back';
      rx.play(p.sound, { pitch: 0.9 });
      rx.squish({ amount: 0.6 });
      return 'accept';
    }
    const tags = rx.catalog.tagsOf(item.kind);
    if (!(p.accepts.includes('*') || p.accepts.some((t) => tags.includes(t)))) {
      rx.reason = 'wrong';
      rx.refuse(p.refuseSound);
      return 'refuse';
    }
    const slot = rx.slotFor(p, item);
    if (!slot) {
      // Full: a "no room!" shake, and the things inside hop to show it.
      rx.reason = 'full';
      rx.refuse(p.refuseSound);
      rx.hopKids({ height: 0.3 });
      return 'refuse';
    }
    if (!rx.dispatch('attach', { id: item.id, parent: target.id, slot })) {
      rx.reason = 'loop';
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
    if (p.leaves) {
      // Eaten up: the plate (or bowl...) stays where the dish was, in the
      // same hand or container slot. One combine, so it can't half-happen.
      const at = e.parent ? { parent: e.parent, slot: e.slot || undefined } : { room: e.room, x: e.x, y: e.y, z: e.z || 0 };
      // It is left dirty (the sink cleans it, P2a.2).
      rx.dispatch('combine', Object.assign({ ids: [e.id], resultId: rx.newId(), resultKind: p.leaves, props: { dirty: 1 } }, at));
    } else rx.dispatch('remove', { id: e.id, hard: true });
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
    leaves: null,       // 'gone' dishes: the kind left behind (plate, bowl, glass, tray), or null
    sound: 'munch',
    tap: true,          // false: a tap doesn't nibble (the Mystery Dish giggles instead; eating still bites)
  },
  check(p, { sounds, kinds }) {
    if (!isStrList(p.looks)) return 'looks must list the bite looks';
    if (p.then !== 'gone' && p.then !== 'stay') return 'then must be gone or stay';
    if (p.leaves != null && (typeof p.leaves !== 'string' || (kinds && !kinds[p.leaves]))) return 'leaves must be a catalog kind';
    return soundOk(p.sound, sounds) ? null : 'unknown sound ' + p.sound;
  },
  look: (e, p) => p.looks[clampIdx(e.props.bites || 0, p.looks.length)],
  onTap: (e, rx, p) => (p.tap === false ? false : bite(e, rx, p)),
  verbs: { bite },
});

// Random props for a new clone: { color: ['red', 'blue'] } -> { color: 'blue' };
// then the `keep` props copied from the spawner (e) itself.
function varyProps(p, random, e = null) {
  const out = {};
  if (p.vary) for (const k of Object.keys(p.vary)) out[k] = pick(p.vary[k], random);
  if (p.keep && e) for (const k of p.keep) if (e.props[k] !== undefined) out[k] = e.props[k];
  return out;
}

const isCloneFor = (target, item, p) => typeof item.props.from === 'string' && (item.props.from === target.id || p.kinds.includes(item.kind));

defineBehavior('spawner', {
  params: {
    kinds: [],       // catalog kinds it gives out (a random one each time)
    vary: null,      // random props per clone: { "color": ["red", "blue"] }
    sound: 'pop',
    homeSound: 'whoosh',   // a clone dropped back on it goes home
    keep: null,      // prop keys a clone copies from the spawner itself (a red paint can gives red cans)
  },
  check(p, { kinds, sounds }) {
    if (!isStrList(p.kinds)) return 'kinds must list at least one kind';
    const missing = p.kinds.filter((k) => !kinds[k]);
    if (missing.length) return 'unknown kinds ' + missing.join(', ');
    if (p.vary != null && !(p.vary && typeof p.vary === 'object' && Object.values(p.vary).every((l) => Array.isArray(l) && l.length))) return 'vary must map props to lists';
    if (p.keep != null && !isStrList(p.keep)) return 'keep must list prop names';
    return soundOk(p.sound, sounds) && soundOk(p.homeSound, sounds) ? null : 'unknown sound';
  },
  canDrag: () => false,   // the spawner stays put; a drag on it pulls out a clone (dragOut)
  // A drag that starts on the spawner: a new clone appears under the finger
  // and the finger carries it (view.js). The room's cap is kept after.
  dragOut(e, rx, p) {
    const kind = pick(p.kinds, rx.random);
    const id = rx.newId();
    const s = rx.catalog.sprite(kind);
    const info = rx.info || {};
    // Under the finger (its body centered on it), where the drag is now.
    const fx = typeof info.x === 'number' ? info.x : rx.where().x;
    const fy = typeof info.y === 'number' ? info.y : rx.where().y - 40;
    const x = Math.round(Math.max(s.w / 2, Math.min(rx.room.def.width - s.w / 2, fx)));
    const y = Math.round(Math.max(s.h, Math.min(1000, fy + s.h * 0.45)));
    if (!rx.dispatch('spawn', { id, kind, room: rx.room.id, x, y, props: Object.assign({ from: e.id }, varyProps(p, rx.random, e)) })) return null;
    rx.play(p.sound, { pitch: 1.15 });
    rx.squish({ amount: 0.7 });
    rx.burst('sparkle', { count: 4 });
    rx.enforceCap([id]);
    return id;
  },
  // A tap pops one out onto a free spot nearby.
  onTap(e, rx, p) {
    const kind = pick(p.kinds, rx.random);
    const id = rx.newId();
    const at = rx.where();
    const [spot] = rx.spots([{ id, kind }], { from: at });
    if (!rx.dispatch('spawn', { id, kind, room: rx.room.id, x: spot.x, y: spot.y, z: spot.z, props: Object.assign({ from: e.id }, varyProps(p, rx.random, e)) })) return false;
    rx.popFrom(id, at.x, at.y - rx.size().h);
    rx.play(p.sound);
    rx.squish({ amount: 1.2 });
    rx.burst('sparkle', { count: 6 });
    rx.enforceCap([id]);
    return true;
  },
  accepts: (target, item, p) => isCloneFor(target, item, p),
  // A clone (of this spawner, or of a kind it gives out) dropped on it goes home.
  receive(target, item, rx, p) {
    if (!isCloneFor(target, item, p)) return null;
    rx.goHome(item.id, { to: target.id });
    rx.play(p.homeSound, { pitch: 1.2 });
    rx.squish({ amount: 1.1 });
    return 'accept';
  },
});

defineBehavior('variant', {
  params: {
    key: 'color',       // the prop whose value is the look name
  },
  look: (e, p) => (typeof e.props[p.key] === 'string' ? e.props[p.key] : null),
});

defineBehavior('peek', {
  params: {
    sound: 'whoosh',
    height: 0.6,        // how far the things inside hop up (fraction of their height)
  },
  check: (p, { sounds }) => (soundOk(p.sound, sounds) ? null : 'unknown sound ' + p.sound),
  onTap(e, rx, p) {
    if (!rx.children().length) return false;
    rx.hopKids({ height: p.height });
    rx.play(p.sound, { pitch: 1.3 });
    rx.squish({ amount: 0.6 });
    return true;
  },
});
