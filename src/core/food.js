// The food state model (P2a.2, docs/design.md 3.1): what a food, a mixing
// bowl, a blender and a dish ARE, as entity props. Pure: no DOM, no store;
// behaviors (src/core/behaviors/cafe.js) and the cafe's prep stations
// (src/scenes/cafe-prep.js) read these answers and dispatch store ops.
//
// Every state change is a store op, so it is saved, replayed and shared by
// two iPads. Counters use `inc` (design 6.4: two kids chopping the same
// tomato at once both count) and are CLAMPED WHEN READ, never written back:
//
//   food props
//     cut      inc   knife strokes that landed; index into the prep chain
//                    (whole -> sliced -> chopped), clamped to its end
//     peeled   set   1 once peeled (banana, potato, onion)
//     cracked  set   1 once cracked (an egg)
//     cooked   inc   doneness 0..3 (clamped; 3 = extra toasty, never burnt)
//     method   set   how heat cooked it (toasted, fried...; P2a.3)
//     stir     inc   inside a mixing bowl or blender: how mixed in it is;
//                    at MIX_DONE it is part of the batter / smoothie (not drawn)
//   dish props (plate, bowl, cup, glass...)
//     dirty    set   1: leftovers after eating; the sink sets 0
//   mixing-bowl props
//     batter   set   the batter look once everything in it is mixed
//                    (plain | choc | pink | ...); informative, the look is
//                    derived from the contents
//   smoothie props (made by the blender, one `combine`)
//     color    the smoothie colour; contents: the ingredient kinds
//
// The CONTENTS of a bowl, pot or blender are its child entities (each
// ingredient stays its own entity with its own prep state), so two kids
// adding things at once never lose one (no list is ever overwritten).
// contentsOf() reads them; P2a.4's recipe table keys on it.
//
// prepOf() names the prep state: whole | peeled | sliced | chopped | cracked.

export const DONENESS_MAX = 3;
export const MIX_STAGES = 3;          // visible mixing stages before "done"
export const STIR_PER_STAGE = 2;      // half-circles per stage
export const MIX_DONE = MIX_STAGES * STIR_PER_STAGE;
export const PREP_NAMES = ['whole', 'peeled', 'sliced', 'chopped', 'cracked'];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// Prep chains

/**
 * The cut chain for a food's params (the `food` behavior's p): the looks a
 * knife steps through, first = uncut. A chain that does not end chopped
 * gets a synthesized 'chopped' look (a heap of little pieces of the last
 * look, drawn by the food behavior's sprite hook). Pure.
 */
export function prepChain(p = {}) {
  if (!Array.isArray(p.cut) || p.cut.length < 1) return null;
  const chain = p.cut.slice();
  if (p.chop !== false && !/^(chopped|chunks)$/.test(chain[chain.length - 1])) chain.push('chopped');
  return chain;
}

/** The chain index a food is at (its cut count, clamped). Pure. */
export function cutIndex(props = {}, p = {}) {
  const chain = prepChain(p);
  return chain ? clamp(num(props.cut) | 0, 0, chain.length - 1) : 0;
}

/** Can one more knife stroke change it? (peeling counts: a knife on a banana peels it). Pure. */
export function canCut(props = {}, p = {}) {
  if (p.peel && !isPeeled(props)) return true;
  const chain = prepChain(p);
  return !!chain && cutIndex(props, p) < chain.length - 1;
}

/** Is it fully chopped (the end of its chain)? Pure. */
export function isChopped(props = {}, p = {}) {
  const chain = prepChain(p);
  return !!chain && cutIndex(props, p) === chain.length - 1;
}

// Old saves: the banana's peel was a cycle index (props.peel).
export const isPeeled = (props = {}) => !!(props.peeled || props.peel);

/** The prep state's name: whole | peeled | sliced | chopped | cracked. Pure. */
export function prepOf(props = {}, p = {}) {
  if (props.cracked) return 'cracked';
  const chain = prepChain(p);
  const i = cutIndex(props, p);
  if (chain && i > 0) return i === chain.length - 1 ? 'chopped' : chain[i] === 'chopped' ? 'chopped' : 'sliced';
  if (p.peel && isPeeled(props)) return 'peeled';
  return 'whole';
}

/** Doneness 0..3 (the inc counter, clamped). Pure. */
export const donenessOf = (props = {}) => clamp(num(props.cooked) | 0, 0, DONENESS_MAX);

/**
 * The look (art variant name) for a food's state. Pure.
 * p = the food behavior's params { cut, crack, cook, peel, tint, ... }.
 * ctx.inside: it sits in a container (a cracked egg in a bowl is a yolk:
 * the 'fried' art, raw).
 */
export function foodLook(props = {}, p = {}, ctx = {}) {
  const cooked = donenessOf(props);
  let prep = null;
  if (p.crack && props.cracked) prep = ctx.inside && !cooked && p.crackIn ? p.crackIn : p.crack[p.crack.length - 1];
  else {
    const chain = prepChain(p);
    const i = cutIndex(props, p);
    if (chain && i > 0) prep = chain[i];
    else if (p.peel) prep = isPeeled(props) ? 'peeled' : 'whole';
  }
  if (!cooked) return prep;
  if (p.cook) return p.cook[cooked];
  return p.tint ? `${prep || ''}@${cooked}` : prep;
}

// ---------------------------------------------------------------------------
// Colours

// Flat fill colours of the ingredients as drawn (docs/STYLE.md palette):
// chop bits, the batter blend, the smoothie colour.
export const FOOD_HEX = {
  tomato: '#DC6B6E', egg: '#F7D66A', bread: '#E2A860', cheese: '#F4DC98', lettuce: '#A3C98F',
  carrot: '#EE9A5C', onion: '#D5C8E3', potato: '#EAD2A0', banana: '#F5DB7A', apple: '#E36B6B',
  strawberry: '#E9737A', blueberries: '#7F8FC4', lemon: '#F3D46A', flour: '#FBF3E8', sugar: '#FFFFFF',
  butter: '#F4DC98', milk: '#FFFFFF', chocolate: '#8A5B45', sprinkles: '#E9AFAE', honey: '#DFB050',
  pasta: '#F4DC98', rice: '#FBF3E8', sausage: '#D98B64', fish: '#A3BEDC', chicken: '#F4C7A6',
  tofu: '#FBF3E8', seaweed: '#4F6A58', pancake: '#F4DC98', 'coffee-beans': '#6A4A3A', cone: '#E2A860',
};
const SCOOP_HEX = { vanilla: '#FBF3E8', strawberry: '#F6C3C8', chocolate: '#8A5B45' };
// Pale, watery things mix in lighter (they dilute rather than colour).
const DILUTE = new Set(['milk', 'flour', 'sugar', 'rice', 'tofu', 'butter', 'honey']);
const CHOC = new Set(['chocolate', 'coffee-beans']);
const PINK = new Set(['strawberry', 'sprinkles']);

/** An ingredient's colour ({kind, props}): '#rrggbb'. Pure. */
export function colorOf(item) {
  if (!item) return '#EFE4D6';
  if (item.kind === 'scoop') return SCOOP_HEX[item.props && item.props.flavor] || SCOOP_HEX.vanilla;
  if (item.kind === 'egg' && item.props && !item.props.cracked) return '#FFFDF6';
  return FOOD_HEX[item.kind] || '#EFE4D6';
}

export function toRgb(c) {
  if (Array.isArray(c)) return c.slice(0, 3);
  let h = String(c || '').replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return [239, 228, 214];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb) => '#' + rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Mix two colours: t = 0 gives a, 1 gives b. Pure. */
export const blendHex = (a, b, t) => { const x = toRgb(a), y = toRgb(b), k = clamp(t, 0, 1); return toHex(x.map((v, i) => v + (y[i] - v) * k)); };

/** The weighted average colour of ingredients [{kind, props}]. Pure. */
export function averageColor(items) {
  let w = 0;
  const sum = [0, 0, 0];
  for (const it of items || []) {
    const k = it.kind === 'scoop' && (!it.props || it.props.flavor === 'vanilla' || !it.props.flavor) ? 0.4 : DILUTE.has(it.kind) ? 0.4 : 1;
    const c = toRgb(colorOf(it));
    for (let i = 0; i < 3; i++) sum[i] += c[i] * k;
    w += k;
  }
  return w ? toHex(sum.map((v) => v / w)) : '#EFE4D6';
}

/** The name in `palette` ({name: hex}) nearest colour c (redmean distance). Pure. */
export function nearestColor(c, palette) {
  const a = toRgb(c);
  let best = null;
  let bestD = Infinity;
  for (const [name, hex] of Object.entries(palette)) {
    const b = toRgb(hex);
    const rm = (a[0] + b[0]) / 2;
    const d = (2 + rm / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

const has = (items, set, flavor) => items.some((it) => set.has(it.kind) || (it.kind === 'scoop' && it.props && it.props.flavor === flavor));

// ---------------------------------------------------------------------------
// Batter (the mixing bowl)

// The batter looks. plain / choc / pink have art (mixing-bowl variants);
// the others are the plain batter tinted (a silly batter is never wrong).
export const BATTER_HEX = {
  plain: '#F3D27E', choc: '#8F6049', pink: '#EFB3B8', green: '#B9CDA4', purple: '#B8A3D0',
  orange: '#F4B98A', red: '#DC7A78', blue: '#A3BEDC',
};
export const BATTER_ART = { plain: 'batter', choc: 'choc-batter', pink: 'pink-batter' };

/** The batter look for ingredients [{kind, props}]: plain | choc | pink | green | ... Pure. */
export function batterOf(items) {
  const list = items || [];
  if (!list.length) return null;
  if (has(list, CHOC, 'chocolate')) return 'choc';
  if (has(list, PINK, 'strawberry')) return 'pink';
  return nearestColor(averageColor(list), BATTER_HEX);
}

/**
 * How mixed a bowl's contents are: { n, mixed, stage 0..MIX_STAGES, t 0..1, done }.
 * stage counts the least-stirred unmixed thing; done = everything is mixed.
 * items: [{props}]. Pure.
 */
export function mixState(items) {
  const list = items || [];
  const n = list.length;
  if (!n) return { n: 0, mixed: 0, stage: 0, t: 0, done: false };
  let mixed = 0;
  let total = 0;
  let least = MIX_DONE;
  for (const it of list) {
    const s = clamp(num(it.props && it.props.stir) | 0, 0, MIX_DONE);
    total += s;
    if (s >= MIX_DONE) mixed++;
    else least = Math.min(least, s);
  }
  const done = mixed === n;
  return { n, mixed, stage: done ? MIX_STAGES : Math.floor(least / STIR_PER_STAGE), t: total / (n * MIX_DONE), done };
}

/** Is this ingredient mixed in (not drawn on its own)? Pure. */
export const isMixed = (props = {}) => (num(props.stir) | 0) >= MIX_DONE;

// ---------------------------------------------------------------------------
// Smoothies (the blender)

// The smoothie art's colours (manifest `smoothie` variants).
export const SMOOTHIE_HEX = {
  pink: '#E9A3AA', yellow: '#F3D46A', green: '#A9C98F', purple: '#9A7A98', choc: '#8A5B45', cream: '#F3E9DA',
};

// Which smoothie colour each ingredient pulls toward (a colour distance on
// the average is too easily fooled: berries and milk would come out green).
const SMOOTHIE_FAMILY = {
  strawberry: 'pink', tomato: 'pink', apple: 'pink', sprinkles: 'pink',
  blueberries: 'purple', onion: 'purple',
  banana: 'yellow', lemon: 'yellow', honey: 'yellow', egg: 'yellow', cheese: 'yellow', carrot: 'yellow', pancake: 'yellow',
  lettuce: 'green', seaweed: 'green',
  chocolate: 'choc', 'coffee-beans': 'choc',
};
const SCOOP_FAMILY = { vanilla: 'cream', strawberry: 'pink', chocolate: 'choc' };
const FAMILY_ORDER = ['choc', 'purple', 'pink', 'green', 'yellow'];   // who wins a tie

/** The smoothie colour for ingredients [{kind, props}]: one of SMOOTHIE_HEX's names. Pure. */
export function smoothieOf(items) {
  const list = items || [];
  const n = {};
  const other = [];
  for (const it of list) {
    const f = it.kind === 'scoop' ? SCOOP_FAMILY[(it.props && it.props.flavor) || 'vanilla'] : SMOOTHIE_FAMILY[it.kind];
    if (f && f !== 'cream') n[f] = (n[f] || 0) + 1;
    else if (!f && !DILUTE.has(it.kind)) other.push(it);
  }
  let best = null;
  for (const f of FAMILY_ORDER) if (n[f] && (!best || n[f] > n[best])) best = f;
  if (best) return best;
  return other.length ? nearestColor(averageColor(other), SMOOTHIE_HEX) : 'cream';
}

// ---------------------------------------------------------------------------
// Contents and drinks

/**
 * What is in a container: [{id, kind, prep, cooked, mixed}] from its child
 * entities (sorted by id, so every iPad lists them alike). childrenOf is
 * world.js's selector (passed in to keep this module free of imports). Pure.
 */
export function contentsOf(kids, paramsOf = () => ({})) {
  return (kids || []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((k) => ({
    id: k.id, kind: k.kind, prep: prepOf(k.props, paramsOf(k.kind)), cooked: donenessOf(k.props), mixed: isMixed(k.props),
  }));
}

// The coffee machine pours these in turn (the fixtures' `coffee` inc counter).
export const DRINKS = ['coffee', 'cocoa', 'latte'];
export const DRINK_PIECE = { coffee: 'coffee', cocoa: 'cocoa', latte: 'milk' };
export const drinkFor = (n) => DRINKS[((num(n) | 0) % DRINKS.length + DRINKS.length) % DRINKS.length];

/** The fill a cup-like kind takes for a drink: {key, value} or null. Pure. */
export function cupFill(kind, drink) {
  if (kind === 'cafe-cup') return { key: 'fill', value: drink };
  if (kind === 'mug') return { key: 'fill', value: 1 };
  return null;
}
