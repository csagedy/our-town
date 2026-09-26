// Cafe behaviors (P2a.1): the food state model's look, ready for prep
// (P2a.2) and heat (P2a.3), and the Mystery Dish's composite sprite (P2a.4).
//
//   food     a food's state props pick its art variant (catalog params map
//            state to the manifest's prep variants, docs/STYLE.md 9):
//              props.cut      0.. index into `cut` (whole -> halves/slices)
//              props.cracked  truthy: the last look in `crack` (an egg)
//              props.cooked   0..3 doneness (design 3.1; 3 = extra toasty,
//                             never burnt): `cook[n]` when the art has
//                             doneness variants, else the prep look with the
//                             manifest's doneness tint (look '<variant>@n')
//              props.method   raw | boiled | fried | baked | toasted (set by heat)
//            No tap of its own (the universal fallback reacts); verbs cut,
//            crack and cook are what the P2a.2/P2a.3 stations call
//            (behaviors.act(id, 'cut')).
//   mystery  a Mystery Dish: its look is its colour + bites, and its sprite is
//            the composite of base + eyes + mouth + topper (src/core/mystery.js)
//
// Pure except what the reaction context does.

import { defineBehavior } from './registry.js';
import { mysteryLook, mysterySprite } from '../mystery.js';

export const DONENESS_MAX = 3;
const isStrList = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every((s) => typeof s === 'string' && s);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The look for a food's state props, or null (its default look). Pure.
 * p = { cut, crack, cook, tint } (the food behavior's params).
 */
export function foodLook(props = {}, p = {}) {
  const cooked = clamp(props.cooked | 0, 0, DONENESS_MAX);
  let prep = null;
  if (p.crack && props.cracked) prep = p.crack[p.crack.length - 1];
  else if (p.cut && (props.cut | 0) > 0) prep = p.cut[clamp(props.cut | 0, 0, p.cut.length - 1)];
  if (!cooked) return prep;
  if (p.cook) return p.cook[cooked];
  return p.tint ? `${prep || ''}@${cooked}` : prep;
}

defineBehavior('food', {
  params: {
    cut: null,       // prep looks in cut order, first = uncut (manifest prep.cut)
    crack: null,     // [whole, cracked] (manifest prep.crack)
    cook: null,      // look per doneness 0..3 (manifest prep.cook); null: tint instead
    method: null,    // how heat cooks it by default (fried, boiled, baked, toasted)
    tint: true,      // no cook looks: tint the sprite per doneness (manifest cafe.doneness.tint)
  },
  check(p) {
    for (const k of ['cut', 'crack']) if (p[k] != null && !isStrList(p[k], 2)) return k + ' must list at least two looks';
    if (p.cook != null && !(isStrList(p.cook, DONENESS_MAX + 1) && p.cook.length === DONENESS_MAX + 1)) return 'cook must list a look per doneness 0..3';
    if (p.method != null && typeof p.method !== 'string') return 'method must be a string';
    return null;
  },
  look: (e, p) => foodLook(e.props, p),
  verbs: {
    /** One cut: the next prep look. False when it can't be cut any further. */
    cut(e, rx, p) {
      if (!p.cut) return false;
      const n = (e.props.cut | 0) + 1;
      if (n >= p.cut.length) return false;
      rx.set('cut', n);
      rx.play('knock', { pitch: 1.1 + n * 0.1 });
      rx.squish({ amount: 0.7 });
      return true;
    },
    crack(e, rx, p) {
      if (!p.crack || e.props.cracked) return false;
      rx.set('cracked', 1);
      rx.play('pop');
      rx.burst('puff', { count: 4, scale: 0.5 });
      return true;
    },
    /** One step of heat: doneness +1 (up to 3), and the cooking method once. */
    cook(e, rx, p) {
      const cur = clamp(e.props.cooked | 0, 0, DONENESS_MAX);
      if (cur >= DONENESS_MAX) return false;
      rx.set('cooked', cur + 1);
      if (p.method && !e.props.method) rx.set('method', p.method);
      rx.play('sizzle', { gain: 0.6 });
      return true;
    },
  },
});

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
