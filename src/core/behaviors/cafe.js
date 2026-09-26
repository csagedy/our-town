// Cafe behaviors: the food state model's look and verbs (P2a.1 look, P2a.2
// prep), the mixing bowl, dishes that get dirty and washed, the smoothie
// glass and the Mystery Dish's composite sprite (P2a.4). The state model
// itself (props, clamping, colours, batter and smoothie rules) is
// src/core/food.js; the stations that call these verbs (cutting board,
// whisk, blender, sink, toaster, coffee machine) are src/scenes/cafe-prep.js.
//
//   food     a food's state props pick its art variant (catalog params map
//            state to the manifest's prep variants, docs/STYLE.md 9):
//              props.cut      inc: knife strokes (whole -> sliced -> chopped)
//              props.peeled   1 once peeled (params.peel)
//              props.cracked  1 once cracked (an egg; in a bowl it is a yolk)
//              props.cooked   inc: doneness 0..3 (3 = extra toasty, never burnt)
//              props.method   raw | boiled | fried | baked | toasted (set by heat)
//            A look the art lacks is drawn from what it has: 'chopped' is a
//            heap of little pieces of the last cut look, 'peeled' the whole
//            look paled by a filter.
//            Tap: peels it, or cracks it (an egg). Verbs: cut (one knife
//            stroke: peels first if it must), peel, crack, cook, wash.
//   mix      a bowl, pan or pot things are mixed or cracked into: an egg
//            dropped in cracks (the yolk plops in). With `stir` (the mixing
//            bowl): stirring (the whisk, or a tap) mixes what is in it in
//            stages; what is stirred sinks into a batter whose colour blends
//            toward the batter look; mixed things are not drawn; a "done"
//            puff when it is all batter (props.batter), heaped over the rim.
//            Verb: stir.
//   dish     plates, bowls, cups, glasses: props.dirty (leftovers after
//            eating) draws smudges; verb wash cleans it.
//   mystery  a Mystery Dish: its look is its colour + bites, and its sprite is
//            the composite of base + eyes + mouth + topper (src/core/mystery.js)
//   drink    a drink in a glass (the smoothie): its colour until sipped
//   pot      the saucepan (P2a.3): filled at the sink (props.water), its look
//            is water, boiling while it heats, pasta once the pasta in it
//            is cooked (the pasta is then drawn by the pot's art)
//   tray     the baking tray (P2a.3): batter poured on is raw cookie dough
//            (props.dough); baked it shows cookies; a tap tips the cookies
//            off onto a free spot (a `cookies` dish, still warm)
//
// Pure except what the reaction context does.

import { defineBehavior, resolveBehaviors, getBehavior } from './registry.js';
import { mysteryLook, mysterySprite } from '../mystery.js';
import {
  DONENESS_MAX, MIX_DONE, foodLook as lookOfFood, prepChain, cutIndex, isPeeled, donenessOf, colorOf,
  averageColor, blendHex, batterOf, mixState, BATTER_HEX, BATTER_ART, toRgb, toHex,
  isMixed, smoothieOf, SMOOTHIE_HEX, potLook, TRAY_DISH,
} from '../food.js';

export { DONENESS_MAX };
/** The look for a food's state props (see src/core/food.js). Pure. */
export const foodLook = lookOfFood;

const isStrList = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every((s) => typeof s === 'string' && s);
const r1 = (v) => Math.round(v * 10) / 10;
const svgUri = (w, h, body, vb = `0 0 ${w} ${h}`) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${r1(w)}" height="${r1(h)}" preserveAspectRatio="none">${body}</svg>`);
const darker = (hex, k = 0.78) => toHex(toRgb(hex).map((v) => v * k));

// ---------------------------------------------------------------------------
// food

// Peeled looks without art: the whole look, paled (a peeled potato is cream).
const PEEL_FILTER = 'sepia(0.2) saturate(0.55) brightness(1.16)';
// A raw egg's yolk art before it cooks: paler, a little see-through.
const RAW_FILTER = 'saturate(0.55) brightness(1.08) opacity(0.82)';
// A chopped heap: five little pieces of the last cut look.
const HEAP = [[0.27, 1.0, -18], [0.5, 1.03, 12], [0.73, 1.0, -6], [0.38, 0.7, 24], [0.62, 0.72, -28]];
const HEAP_SCALE = 0.56;

function chopHeap(base, kind, look) {
  if (!base || base.draw !== 'img' || !base.img) return base;
  const pw = base.img.w * HEAP_SCALE;
  const ph = base.img.h * HEAP_SCALE;
  const W = Math.max(base.w, pw * 2.4);
  const H = Math.max(base.h * 0.8, ph * 1.5);
  const at = ([fx, fy, rot]) => ({ left: r1(W * fx - pw / 2), top: r1(H * fy - ph * 0.92), w: r1(pw), h: r1(ph), rot });
  const [first, ...rest] = HEAP.map(at);
  return Object.assign({}, base, {
    key: `chop:${kind}:${look}`, look: 'chopped', w: r1(W), h: r1(H),
    img: first, overlays: rest.map((o) => Object.assign({ src: base.src }, o)),
  });
}

function burstBits(rx, color, n = 6, o = {}) {
  rx.burst('bit', Object.assign({ count: n, spread: 70, color, angle: -90, arc: 150, stagger: 10 }, o));
}

function peel(e, rx, p) {
  if (!p.peel || isPeeled(e.props)) return false;
  rx.set('peeled', 1);
  rx.play('squish', { pitch: 1.35 });
  rx.play('whoosh', { pitch: 2, gain: 0.5 });
  rx.squish({ amount: 1.2 });
  burstBits(rx, p.peelColor || colorOf(e), 7, { spread: 90 });
  rx.burst('sparkle', { count: 3 });
  return true;
}

function crack(e, rx, p) {
  if (!p.crack || e.props.cracked) return false;
  rx.set('cracked', 1);
  rx.play('crack');
  rx.squish({ amount: 1.1 });
  burstBits(rx, '#FFFDF6', 6, { spread: 60 });
  // Once in a while a baby chick peeks out, cheeps, and ducks back into the yolk.
  if (rx.random() < 0.05) { rx.burst('chick', { count: 1, spread: 1 }); rx.play('squeak', { pitch: 1.9 }); rx.reason = 'chick'; }
  return true;
}

/** One knife stroke. True if it changed the food (a peel or a cut). */
function cut(e, rx, p) {
  if (p.peel && !isPeeled(e.props)) return peel(e, rx, p);
  const chain = prepChain(p);
  const color = colorOf(e);
  if (!chain || cutIndex(e.props, p) >= chain.length - 1) {
    // Nothing more to cut (all chopped, or a carton of milk): a thunk and a few bits.
    rx.play('chop', { pitch: 1.3 });
    rx.squish({ amount: 0.6 });
    burstBits(rx, color, 3, { spread: 45 });
    rx.reason = chain ? 'chopped' : 'uncut';
    return false;
  }
  const i = cutIndex(e.props, p) + 1;
  rx.inc('cut', 1);
  rx.play('chop', { pitch: 0.95 + i * 0.1 });
  rx.squish({ amount: 1.3 });
  burstBits(rx, color, 5 + i * 2, { spread: 70 + i * 15 });
  if (i === chain.length - 1) {
    // All chopped: a sparkle (design 3.1 #2).
    rx.burst('sparkle', { count: 6 });
    rx.play('sparkle');
  }
  return true;
}

defineBehavior('food', {
  params: {
    cut: null,       // prep looks in cut order, first = uncut (manifest prep.cut); 'chopped' is added
    chop: true,      // false: no synthesized 'chopped' at the end of the cut chain
    peel: false,     // it can be peeled (tap, or the knife's first stroke)
    peelColor: null, // the peel's colour for the flying bits (default: the food's colour)
    crack: null,     // [whole, cracked] (manifest prep.crack)
    crackIn: null,   // the cracked look inside a bowl or pan (an egg: its yolk, 'fried' raw)
    cook: null,      // look per doneness 0..3 (manifest prep.cook); null: tint instead
    method: null,    // how heat cooks it by default (fried, boiled, baked, toasted)
    tint: true,      // no cook looks: tint the sprite per doneness (manifest cafe.doneness.tint)
  },
  check(p) {
    for (const k of ['cut', 'crack']) if (p[k] != null && !isStrList(p[k], k === 'cut' ? 1 : 2)) return k + ' must list looks';
    if (p.cook != null && !(isStrList(p.cook, DONENESS_MAX + 1) && p.cook.length === DONENESS_MAX + 1)) return 'cook must list a look per doneness 0..3';
    if (p.method != null && typeof p.method !== 'string') return 'method must be a string';
    return null;
  },
  look: (e, p) => lookOfFood(e.props, p, { inside: !!e.parent }),
  sprite(e, p, { catalog, look }) {
    if (!look) return null;
    // A raw egg in a bowl or pan is its yolk art, glossy and pale until heat
    // cooks it (P2a.3: raw -> fried -> toasty).
    if (e.parent && p.crackIn && look === p.crackIn && !donenessOf(e.props)) {
      const s = catalog.sprite(e.kind, look);
      return s.draw === 'img' ? Object.assign({}, s, { key: s.key + ':raw', filter: RAW_FILTER }) : null;
    }
    // A doneness tint ('chopped@2') applies on top of a drawn-up look.
    const at = look.indexOf('@');
    const name = at >= 0 ? look.slice(0, at) : look;
    const tint = at >= 0 ? catalog.sprite(e.kind, look).filter || null : null;
    if (name !== 'chopped' && name !== 'peeled') return null;
    const s = catalog.sprite(e.kind, name);
    if (s.look === name || s.draw !== 'img') return null;          // the art has it
    let out;
    if (name === 'chopped') {
      const chain = prepChain(p);
      const from = chain && chain.length > 1 ? chain[chain.length - 2] : null;
      out = chopHeap(catalog.sprite(e.kind, from), e.kind, from);
    } else {
      const b = catalog.sprite(e.kind, 'whole');
      out = Object.assign({}, b, { key: b.key + ':peeled', look: 'peeled', filter: PEEL_FILTER });
    }
    if (!tint) return out;
    return Object.assign({}, out, {
      key: out.key + look.slice(at), filter: [out.filter, tint].filter(Boolean).join(' '),
      overlays: (out.overlays || []).map((o) => Object.assign({}, o, { filter: tint })),
    });
  },
  onTap(e, rx, p) {
    if (p.peel && !isPeeled(e.props)) return peel(e, rx, p);
    if (p.crack && !e.props.cracked) return crack(e, rx, p);
    return false;
  },
  verbs: {
    cut,
    peel,
    crack,
    /** One step of heat: doneness +1 (an `inc`; read clamped to 3), and the cooking method once. */
    cook(e, rx, p) {
      if (donenessOf(e.props) >= DONENESS_MAX) return false;
      rx.inc('cooked', 1);
      if (p.method && !e.props.method) rx.set('method', p.method);
      rx.play('sizzle', { gain: 0.6 });
      return true;
    },
    /** Rinsed under the tap: nothing to clean on food, but it shines. */
    wash(e, rx) {
      rx.squish({ amount: 0.7 });
      rx.burst('sparkle', { count: 4 });
      return true;
    },
  },
});

// ---------------------------------------------------------------------------
// mix: bowls and pans (cracking eggs in), the mixing bowl (stirring)

const containerParams = (kind) => (resolveBehaviors(kind && kind.behaviors).find((b) => b.name === 'container') || {}).p || null;
const itemsOf = (kids) => kids.map((k) => ({ kind: k.kind, props: k.props || {} }));

// Where the batter sits in the mixing bowl's art, as fractions of its
// image: [left, right, rim (the batter's bottom, under the rim line), top
// of the full mound (above the image: batter heaped up over the rim)].
const DEFAULT_RIM = [0.1, 0.9, 0.165, -0.34];

function batterOverlay(img, rim, color, level, { swirl = false, done = false } = {}) {
  const [fl, fr, fb, ft] = rim;
  const w = img.w * (fr - fl);
  const h = Math.max(3, img.h * (fb - ft) * level);
  const tone = darker(color, 0.84);
  const k = 0.12;   // how square the mound's shoulders are
  const parts = [
    `<path d="M0 ${h} C${w * k} ${h * 0.05} ${w * (1 - k)} ${h * 0.05} ${w} ${h} Z" fill="${color}"/>`,
    // a soft glint
    `<path d="M${w * 0.24} ${h * 0.5} Q${w * 0.3} ${h * 0.28} ${w * 0.42} ${h * 0.24}" fill="none" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>`,
  ];
  if (swirl) {
    parts.push(`<path d="M${w * 0.34} ${h * 0.8} Q${w * 0.46} ${h * 0.35} ${w * 0.58} ${h * 0.62} T${w * 0.8} ${h * 0.55}" fill="none" stroke="${tone}" stroke-width="2.2" stroke-linecap="round"/>`);
  }
  if (done) {
    // a little swirl peak on top, like a spoonful just lifted out
    parts.push(`<path d="M${w * 0.46} ${h * 0.3} q${w * 0.05} ${-h * 0.34} ${w * 0.1} ${-h * 0.02}" fill="${color}" stroke="#3D2C29" stroke-width="2.6" stroke-linejoin="round"/>`);
    parts.push(`<path d="M${w * 0.6} ${h * 0.5} q${w * 0.08} ${-h * 0.12} ${w * 0.16} ${h * 0.02}" fill="none" stroke="${tone}" stroke-width="2" stroke-linecap="round"/>`);
  }
  parts.push(`<path d="M1.2 ${h} C${w * k} ${h * 0.05 + 1.5} ${w * (1 - k)} ${h * 0.05 + 1.5} ${w - 1.2} ${h}" fill="none" stroke="#3D2C29" stroke-width="3" stroke-linecap="round"/>`);
  const pad = done ? h * 0.35 : 0;   // room for the peak above the mound
  return {
    src: svgUri(w, h + pad, `<g transform="translate(0 ${r1(pad)})">${parts.join('')}</g>`),
    left: r1(img.left + img.w * fl), top: r1(img.top + img.h * fb - h - pad), w: r1(w), h: r1(h + pad),
  };
}

/** A stir step (half a circle): everything not yet mixed gets stir +1. True if it did anything. */
function stir(e, rx, p) {
  if (!p.stir) return false;
  const kids = rx.children();
  if (!kids.length) return false;
  const todo = kids.filter((k) => (k.props.stir | 0) < MIX_DONE);
  rx.play('whisk', { pitch: 0.9 + rx.random() * 0.25 });
  rx.wobble({ amount: 0.35 });
  const color = averageColor(itemsOf(kids));
  rx.burst('swirl', { count: 3, spread: 36, color: darker(color, 0.8), stagger: 30 });
  if (!todo.length) { rx.reason = 'mixed'; return true; }
  const done = todo.every((k) => (k.props.stir | 0) + 1 >= MIX_DONE);
  for (const k of todo) rx.dispatch('inc', { id: k.id, path: 'props.stir', by: 1 });
  if ((todo[0].props.stir | 0) % 2 === 1) rx.burst('bit', { count: 3, spread: 50, color, angle: -90, arc: 120 });   // a little splatter
  if (done) {
    // All batter: a "done" puff, sparkles and a chime.
    const look = batterOf(itemsOf(kids));
    rx.set('batter', look);
    rx.burst('puff', { count: 8, spread: 70 });
    rx.burst('sparkle', { count: 6, spread: 80 });
    rx.play('chime');
    rx.squish({ amount: 1.2 });
    rx.reason = 'done';
  }
  return true;
}

defineBehavior('mix', {
  params: {
    stir: false,      // true: a mixing bowl (stirring, batter)
    rim: null,        // [left, right, rim, top] fractions of the art where the batter shows (default: the mixing bowl's)
    sink: 0.45,       // how far a stirred thing sinks (fraction of its height) before it is mixed in
  },
  check(p) {
    if (p.rim != null && !(Array.isArray(p.rim) && p.rim.length === 4 && p.rim.every((v) => typeof v === 'number'))) return 'rim must be 4 fractions';
    return null;
  },
  // An egg dropped in cracks on the rim and plops in (the container places it).
  receive(target, item, rx, p) {
    const k = rx.catalog.get(item.kind);
    const food = k && resolveBehaviors(k.behaviors).find((b) => b.name === 'food');
    if (!food || !food.p.crack || item.props.cracked || item.parent === target.id) return null;
    const cp = containerParams(rx.kind);
    const box = getBehavior('container');
    if (!cp || !box) return null;
    const r = box.receive(target, item, rx, cp);
    if (r !== 'accept') return r;
    rx.dispatch('set', { id: item.id, path: 'props.cracked', value: 1 });
    rx.play('crack');
    rx.burst('bit', { count: 6, spread: 55, color: '#FFFDF6', angle: -90, arc: 150 });
    rx.burst('puff', { count: 3, spread: 30, scale: 0.5 });
    if (rx.random() < 0.05) { rx.burst('chick', { count: 1, spread: 1 }); rx.play('squeak', { pitch: 1.9 }); rx.reason = 'chick'; }
    else rx.reason = 'crack';
    return 'accept';
  },
  look(e, p, w) {
    if (!p.stir) return null;
    const kids = w.children();
    if (!kids.length) return null;
    const st = mixState(itemsOf(kids));
    if (st.done) return BATTER_ART[batterOf(itemsOf(kids))] || 'batter';
    return null;
  },
  sprite(e, p, { catalog, look, children }) {
    if (!p.stir || !children) return null;
    return batterSprite(catalog, e, p, children(), look);
  },
  layoutKids(parent, kids, lay, p) {
    if (!p.stir) return;
    for (const k of kids) {
      const L = lay.get(k.id);
      if (!L) continue;
      const s = k.props.stir | 0;
      if (s >= MIX_DONE) L.hidden = true;
      else if (s > 0) {
        L.y = r1(L.y + 26 * p.sink * (s / MIX_DONE));
        L.scale = r1((L.scale || 1) * (1 - 0.25 * (s / MIX_DONE)) * 100) / 100;
      }
    }
  },
  onTap(e, rx, p) { return stir(e, rx, p); },
  verbs: { stir },
});

/**
 * The mixing bowl while things are being stirred in: the empty (or batter)
 * bowl with a batter dome that rises and blends toward the batter colour.
 * kids: the bowl's child entities. Null when the art look alone is right.
 */
export function batterSprite(catalog, e, p, kids, look) {
  if (!kids.length) return null;
  const items = itemsOf(kids);
  const st = mixState(items);
  const target = batterOf(items);
  if (!st.done && st.t <= 0) return null;          // just a heap so far
  const base = catalog.sprite(e.kind, 'empty');
  if (!base || base.draw !== 'img' || !base.img) return null;
  // Mixed things are batter colour; the rest still shows its own colour.
  const color = st.done ? BATTER_HEX[target] : blendHex(averageColor(items), BATTER_HEX[target] || BATTER_HEX.plain, Math.min(1, st.t * 1.2));
  const level = st.done ? 1 : 0.3 + 0.6 * st.t;
  const o = batterOverlay(base.img, p.rim || DEFAULT_RIM, color, level, { swirl: !st.done, done: st.done });
  return Object.assign({}, base, { key: `batter:${e.kind}:${color}:${Math.round(level * 20)}:${st.done ? 1 : 0}`, look: st.done ? 'batter' : 'mixing', overlays: [o] });
}

// ---------------------------------------------------------------------------
// dish: dirty after eating, clean after the sink

const SMUDGE = svgUri(60, 24, [
  '<ellipse cx="22" cy="13" rx="12" ry="5.5" fill="#D98B64" opacity="0.85"/>',
  '<ellipse cx="39" cy="11" rx="8" ry="4" fill="#BC6E4C" opacity="0.8"/>',
  '<path d="M14 11 q6 -4 12 0" fill="none" stroke="#9C6C4C" stroke-width="1.6" stroke-linecap="round"/>',
  '<circle cx="31" cy="17" r="2" fill="#C4933A"/><circle cx="47" cy="15" r="1.6" fill="#C4933A"/>',
  '<circle cx="12" cy="8" r="1.5" fill="#C4933A"/><circle cx="51" cy="8" r="1.3" fill="#E2A860"/>',
].join(''));

defineBehavior('dish', {
  params: {
    at: 0.45,     // where the leftovers sit: fraction of the image height from its top
  },
  sprite(e, p, { catalog, look }) {
    if (!e.props.dirty) return null;
    const base = catalog.sprite(e.kind, look);
    if (!base || base.draw !== 'img' || !base.img) return null;
    const w = base.img.w * 0.72;
    const h = w * 0.4;
    const o = { src: SMUDGE, left: r1(base.img.left + (base.img.w - w) / 2), top: r1(base.img.top + base.img.h * p.at - h * 0.8), w: r1(w), h: r1(h) };
    return Object.assign({}, base, { key: base.key + ':dirty', overlays: (base.overlays || []).concat([o]) });
  },
  verbs: {
    /** Washed in the sink: clean (if it was dirty), a squeaky sparkle. */
    wash(e, rx) {
      const was = !!e.props.dirty;
      if (was) rx.set('dirty', 0);
      rx.play('squeak', { pitch: was ? 1.5 : 1.2 });
      rx.squish({ amount: 0.9 });
      rx.burst('sparkle', { count: was ? 7 : 4 });
      rx.reason = was ? 'clean' : 'rinse';
      return true;
    },
  },
});

// ---------------------------------------------------------------------------
// Stations (invisible containers over the painted appliances; the cafe
// scene, src/scenes/cafe-prep.js, animates the appliance pieces)
//
//   blender   drop fruit, milk, ice cream in (drawn in the jug); tap: whirr,
//             everything is blended (stir = MIX_DONE, no longer drawn; the
//             jug piece shows the smoothie colour); drop a glass (cup, mug)
//             on it: ONE combine turns the glass and the contents into a
//             smoothie { color, contents } beside it (blending first if needed)
//   toaster   bread goes in (hidden; the lever goes down); verb pop: each
//             slice pops out onto the counter one doneness toastier
//   sink      anything dropped in gets a splash and is washed (a dirty dish
//             comes out clean); verb wash (the tap): washes all that is in it

export const CUPS = ['glass', 'cafe-cup', 'mug'];

function blend(e, rx) {
  const kids = rx.children();
  if (rx.trigger !== 'verb:blend') rx.play('whirr');   // the cafe scene whirrs first, then blends
  if (!kids.length) { rx.reason = 'empty'; rx.shake({ amount: 0.5 }); return true; }
  for (const k of kids) if (!isMixed(k.props)) rx.dispatch('inc', { id: k.id, path: 'props.stir', by: MIX_DONE - (k.props.stir | 0) });
  const color = SMOOTHIE_HEX[smoothieOf(itemsOf(kids))];
  rx.burst('swirl', { count: 5, spread: 40, color: darker(color, 0.85), stagger: 60 });
  rx.burst('bit', { count: 4, spread: 50, color, angle: -90, arc: 100, stagger: 90 });
  rx.reason = 'blend';
  return true;
}

defineBehavior('blender', {
  accepts: (target, item) => CUPS.includes(item.kind),
  receive(target, item, rx) {
    if (!CUPS.includes(item.kind)) return null;
    const kids = rx.children();
    if (!kids.length) { rx.reason = 'empty'; rx.refuse(); return 'refuse'; }
    const color = smoothieOf(itemsOf(kids));
    const id = rx.newId();
    const at = rx.where();
    const [spot] = rx.spots([{ id, kind: 'smoothie' }], { from: { x: at.x + 55, y: at.y } });
    const ok = rx.dispatch('combine', {
      ids: [item.id].concat(kids.map((k) => k.id)), resultId: id, resultKind: 'smoothie',
      room: rx.room.id, x: spot.x, y: spot.y, z: spot.z, props: { color, contents: kids.map((k) => k.kind).sort() },
    });
    if (!ok) { rx.refuse(); return 'refuse'; }
    rx.popFrom(id, at.x, at.y - 60);
    if (kids.some((k) => !isMixed(k.props))) rx.play('whirr');
    rx.play('pour');
    rx.burst('heart', { count: 3 });
    rx.burst('sparkle', { count: 6 });
    rx.reason = 'pour';
    rx.result = id;
    return 'accept';
  },
  layoutKids(parent, kids, lay) {
    for (const k of kids) { const L = lay.get(k.id); if (L && isMixed(k.props)) L.hidden = true; }
  },
  onTap: blend,
  verbs: { blend },
});

function pop(e, rx) {
  const kids = rx.children();
  if (!kids.length) return false;
  const at = rx.where();
  const spots = rx.spots(kids, { from: { x: at.x - 60, y: at.y } });
  for (const sp of spots) {
    const k = kids.find((q) => q.id === sp.id);
    if (!rx.dispatch('detach', { id: sp.id, room: rx.room.id, x: sp.x, y: sp.y, z: sp.z })) continue;
    if (donenessOf(k.props) < DONENESS_MAX) rx.dispatch('inc', { id: sp.id, path: 'props.cooked', by: 1 });
    if (!k.props.method) rx.dispatch('set', { id: sp.id, path: 'props.method', value: 'toasted' });
    rx.popFrom(sp.id, at.x, at.y - 170);
  }
  rx.play('pop', { pitch: 0.9 });
  rx.play('ding');
  rx.burst('sparkle', { count: 6 });
  rx.burst('puff', { count: 3, scale: 0.6 });
  rx.reason = 'pop';
  return true;
}

defineBehavior('toaster', {
  onTap: pop,          // impatient: pop it now
  verbs: { pop },
});

function washIn(rx, items) {
  let cleaned = 0;
  for (const it of items) if (it.props.dirty) { rx.dispatch('set', { id: it.id, path: 'props.dirty', value: 0 }); cleaned++; }
  rx.play('splash');
  rx.burst('drop', { count: 6, spread: 60, angle: -90, arc: 140 });
  rx.burst('bubble', { count: 6 + cleaned * 2, spread: 60, stagger: 40 });
  if (cleaned) { rx.play('squeak', { pitch: 1.6 }); rx.burst('sparkle', { count: 6, spread: 70 }); }
  rx.reason = cleaned ? 'clean' : 'rinse';
  return cleaned;
}

defineBehavior('sink', {
  // Anything dropped in: into the basin (the container), washed with a splash.
  receive(target, item, rx) {
    const cp = containerParams(rx.kind);
    const box = getBehavior('container');
    if (!cp || !box || item.parent === target.id) return null;
    const r = box.receive(target, item, rx, cp);
    if (r === 'accept') washIn(rx, [getEntityOf(rx, item.id) || item]);
    return r;
  },
  verbs: {
    /** The tap runs: everything in the basin is washed. */
    wash(e, rx) { washIn(rx, rx.children()); return true; },
  },
});

const getEntityOf = (rx, id) => rx.state.entities[id] || null;

// ---------------------------------------------------------------------------
// Heat (P2a.3): the saucepan and the baking tray. The heat loop is
// src/scenes/cafe-heat.js; the rules are src/core/food.js.

defineBehavior('pot', {
  look: (e, p, w) => potLook(e.props, e.props.water ? w.children() : []),
  layoutKids(parent, kids, lay) {
    if (!parent.props.water) return;
    // In the water: things bob low; cooked pasta is drawn by the pot's art.
    const pasta = potLook(parent.props, kids) === 'pasta';
    for (const k of kids) {
      const L = lay.get(k.id);
      if (!L) continue;
      if (pasta && k.kind === 'pasta') L.hidden = true;
      else L.y = r1(L.y + 8);
    }
  },
});

/** Tip a baked tray's cookies off onto a free spot: a warm `cookies` dish. */
function tipCookies(e, rx, p) {
  if (!e.props.dough || donenessOf(e.props) < 1) return false;
  const id = rx.newId();
  const at = rx.where();
  const [spot] = rx.spots([{ id, kind: p.dish }], { from: { x: at.x + 40, y: at.y } });
  const hotAt = typeof e.props.hotAt === 'number' ? e.props.hotAt : 0;
  if (!rx.dispatch('spawn', { id, kind: p.dish, room: rx.room.id, x: spot.x, y: spot.y, z: spot.z, props: { hotAt, method: 'baked' } })) return false;
  rx.set('dough', 0);
  rx.set('cooked', 0);
  rx.popFrom(id, at.x, at.y - 40);
  rx.play('pop', { pitch: 1.1 });
  rx.play('chime');
  rx.squish({ amount: 1 });
  rx.burst('sparkle', { count: 6 });
  rx.burst('heart', { count: 2 });
  rx.reason = 'cookies';
  rx.result = id;
  return true;
}

defineBehavior('tray', {
  params: {
    looks: ['raw', 'cookies', 'cookies', 'cookies'],   // the dough's look per doneness 0..3
    dish: TRAY_DISH,                                   // what a tap tips off once it is baked
  },
  check(p, { kinds }) {
    if (!isStrList(p.looks, DONENESS_MAX + 1)) return 'looks must list a look per doneness 0..3';
    if (kinds && !kinds[p.dish]) return 'dish must be a catalog kind';
    return null;
  },
  look: (e, p) => (e.props.dough ? p.looks[donenessOf(e.props)] : null),
  onTap: tipCookies,
  verbs: { tip: tipCookies },
});

// ---------------------------------------------------------------------------

defineBehavior('mystery', {
  look: (e) => mysteryLook(e.props),
  sprite: (e, p, { catalog }) => mysterySprite(catalog, e),
});

// A drink in a glass (the smoothie): its look is its colour until it is
// sipped, then the empty glass (the glass stays; it can be refilled later).
function sip(e, rx, p) {
  if ((e.props.bites | 0) >= 1) return false;
  rx.inc('bites', 1);
  rx.play(p.sound, { pitch: 1.2 });
  rx.squish({ amount: 0.7 });
  rx.burst('heart', { count: 2 });
  return true;
}

defineBehavior('drink', {
  params: {
    key: 'color',      // the prop holding the full look (a smoothie colour)
    empty: 'empty',    // the look once it has been drunk
    sound: 'bubble',
  },
  look: (e, p) => ((e.props.bites | 0) >= 1 ? p.empty : (typeof e.props[p.key] === 'string' ? e.props[p.key] : null)),
  onTap: sip,
  verbs: { bite: sip },
});
