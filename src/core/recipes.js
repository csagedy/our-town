// Recipes and the Mystery Dish generator (P2a.4, docs/design.md 3.1).
// Pure: no DOM, no store. The table is data (data/recipes.json, loaded with
// fetch like the catalog: Safari 16 has no JSON module imports); the cafe
// loads it once (loadRecipes) and every place that makes a result asks
// resolveDish(at, items):
//
//   at        where the result is made
//     plate     tap a plate with things on it: they assemble into the dish
//     pot       the ladle scoops the saucepan's cooked contents
//     oven      a mixing bowl of batter bakes, or food on the baking tray
//     tray      poured dough baked on the tray, tipped off
//     blender   a glass dropped on the blender pours the drink
//
//   recipe = { id, at, dish (catalog kind), name (Zoe's text layer),
//              needs: [need], extras: [kind], look: {tint, topper} }
//   need   = "kind" | { kind | any: [kinds], cooked: n (at least), raw: true,
//                       prep: "chopped" | [preps], n: count }
//
// A recipe MATCHES a set of items when every need takes its own item(s)
// and every item left over is an extra (or another of a needed kind: two
// slices of bread are still a sandwich). Matching is on the multiset of
// items, so the order things went in never matters. When several match,
// the most specific wins (more needs, more state rules, bigger counts),
// then the one listed first. Deterministic everywhere: two iPads resolving
// the same things get the same dish, and the dispatching iPad writes the
// result (kind + props) into the op anyway (design 6.4).
//
// No match: a MYSTERY DISH (never a failure). Its face and name are picked
// by a hash of the contents, so the same things always make the same
// silly dish: blob colour = the ingredients' average (mystery.js), eyes /
// mouth / topper and a name like "Wobbly Banana Surprise" (~30 adjectives,
// ~30 nouns, the ingredients' own words and some fun ones). The blender
// pours a mystery SMOOTHIE instead (a glass with a face).
//
// Discovery (the recipe book): props `found-<recipe id>` = 1 on the cafe's
// fixtures entity (one `set` op per new find, LWW per field, so two iPads
// finding things at once both stick).

import { prepOf, donenessOf, colorOf } from './food.js';
import { mysteryColorFor, MYSTERY_VARIANTS } from './mystery.js';
import { resolveBehaviors } from './behaviors/registry.js';

export const RECIPES_URL = 'data/recipes.json';
export const STATIONS = ['plate', 'pot', 'oven', 'tray', 'blender'];
// How many things make a Mystery Dish (one tomato on a plate is just a tomato).
export const MIN_MYSTERY = { plate: 2, pot: 1, oven: 1, tray: 1, blender: 1 };
export const MYSTERY_KIND = 'mystery-dish';
export const FOUND = 'found-';
export const FIXTURES_KIND = 'cafe-fixtures';

// Recoloured reused art (a CSS filter on the dish sprite). Only transform and
// opacity animate; a filter is set once when the sprite is painted.
export const DISH_TINTS = {
  choc: 'sepia(0.7) saturate(1.5) hue-rotate(-12deg) brightness(0.68)',
  red: 'hue-rotate(-28deg) saturate(1.7) brightness(0.98)',
  green: 'hue-rotate(58deg) saturate(1.15)',
  golden: 'sepia(0.45) saturate(1.5) brightness(1.03)',
  honey: 'sepia(0.55) saturate(1.8) hue-rotate(-6deg) brightness(1.04)',
  pink: 'hue-rotate(-38deg) saturate(1.35) brightness(1.06)',
  berry: 'hue-rotate(205deg) saturate(1.1) brightness(0.95)',
  orange: 'hue-rotate(-14deg) saturate(1.6)',
  yellow: 'hue-rotate(14deg) saturate(1.5) brightness(1.06)',
  pale: 'saturate(0.45) brightness(1.1)',
  egg: 'hue-rotate(20deg) saturate(1.9) brightness(1.12)',
};

// ---------------------------------------------------------------------------
// The table

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const strs = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s) : typeof v === 'string' && v ? [v] : []);

/** A need in one shape: { kinds: [...], cooked, raw, prep: [...]|null, n }. Pure. */
export function normalizeNeed(n) {
  if (typeof n === 'string') return { kinds: [n], cooked: 0, raw: false, prep: null, n: 1 };
  const o = isObj(n) ? n : {};
  const kinds = o.any ? strs(o.any) : strs(o.kind);
  return {
    kinds,
    cooked: typeof o.cooked === 'number' ? o.cooked : 0,
    raw: o.raw === true,
    prep: o.prep ? strs(o.prep) : null,
    n: Number.isInteger(o.n) && o.n > 0 ? o.n : 1,
  };
}

/** The most specific first: needs, state rules and counts. Pure. */
export function recipeScore(r) {
  let s = 0;
  for (const n of r.needs) s += n.n + (n.cooked || n.raw ? 1 : 0) + (n.prep ? 1 : 0) + (n.kinds.length > 1 ? 0 : 0.5);
  return s;
}

/** Normalize a parsed data/recipes.json: { recipes: [...], byId: Map }. Pure; skips malformed entries. */
export function createTable(json) {
  const list = isObj(json) && Array.isArray(json.recipes) ? json.recipes : [];
  const recipes = [];
  const byId = new Map();
  list.forEach((r, order) => {
    if (!isObj(r) || typeof r.id !== 'string' || byId.has(r.id) || !STATIONS.includes(r.at) || typeof r.dish !== 'string') return;
    const needs = (Array.isArray(r.needs) ? r.needs : []).map(normalizeNeed).filter((n) => n.kinds.length);
    if (!needs.length) return;
    const look = isObj(r.look) ? r.look : {};
    const rec = {
      id: r.id, at: r.at, dish: r.dish, name: typeof r.name === 'string' ? r.name : r.id,
      needs, extras: strs(r.extras), order,
      look: { tint: typeof look.tint === 'string' ? look.tint : null, topper: typeof look.topper === 'string' ? look.topper : null },
    };
    rec.score = recipeScore(rec);
    recipes.push(rec);
    byId.set(rec.id, rec);
  });
  return { recipes, byId };
}

/** Problems in a recipe file (empty = good). opts.kinds: catalog kinds; opts.toppers: topper variants. Pure. */
export function validateRecipes(json, { kinds = null, toppers = null } = {}) {
  const out = [];
  if (!isObj(json) || !Array.isArray(json.recipes)) return ['recipes must be a list'];
  const seen = new Set();
  const known = (k) => !kinds || kinds.includes(k);
  for (const r of json.recipes) {
    const at = (m) => out.push((r && r.id) + ': ' + m);
    if (!isObj(r) || typeof r.id !== 'string') { out.push('each recipe needs an id'); continue; }
    if (seen.has(r.id)) at('duplicate id');
    seen.add(r.id);
    if (!STATIONS.includes(r.at)) at('at must be one of ' + STATIONS.join(', '));
    if (typeof r.dish !== 'string' || !known(r.dish)) at('dish must be a catalog kind');
    if (typeof r.name !== 'string' || !r.name) at('needs a name');
    if (!Array.isArray(r.needs) || !r.needs.length) at('needs must list at least one thing');
    for (const n of r.needs || []) {
      const q = normalizeNeed(n);
      if (!q.kinds.length) at('a need without a kind');
      for (const k of q.kinds) if (!known(k)) at('unknown need ' + k);
      if (q.prep) for (const p of q.prep) if (!['whole', 'peeled', 'sliced', 'chopped', 'cracked'].includes(p)) at('unknown prep ' + p);
    }
    for (const k of strs(r.extras)) if (!known(k)) at('unknown extra ' + k);
    if (r.extras != null && !Array.isArray(r.extras)) at('extras must be a list');
    const look = r.look || {};
    if (look.tint != null && !DISH_TINTS[look.tint]) at('unknown tint ' + look.tint);
    if (look.topper != null && toppers && !toppers.includes(look.topper)) at('unknown topper ' + look.topper);
  }
  return out;
}

let TABLE = createTable(null);

/** Use this table (a parsed data/recipes.json) from now on. Returns the normalized table. */
export function useRecipes(json) { TABLE = createTable(json); return TABLE; }
/** The table in use. */
export const recipeTable = () => TABLE;

/** Fetch data/recipes.json and use it. Never rejects (no table: everything is a Mystery Dish). */
export async function loadRecipes({ fetch: fetchFn = (u) => fetch(u), url = RECIPES_URL } = {}) {
  if (TABLE.recipes.length) return TABLE;
  try {
    const r = await fetchFn(url);
    if (r.ok) return useRecipes(await r.json());
  } catch (e) { /* offline without a cache: mystery dishes only */ }
  console.warn('recipes: could not load ' + url);
  return TABLE;
}

// ---------------------------------------------------------------------------
// Items and matching

/** A catalog kind's `food` behavior params, or null. */
export function foodParamsOf(catalog, kind) {
  const k = catalog && catalog.get(kind);
  const b = k && resolveBehaviors(k.behaviors).find((q) => q.name === 'food');
  return b ? b.p : null;
}

/** Entities [{kind, props}] -> matchable items [{kind, prep, cooked, flavor}], sorted. Pure. */
export function itemsOf(entities, paramsOf = () => null) {
  return (entities || []).map((e) => {
    const props = e.props || {};
    const it = { kind: e.kind, prep: prepOf(props, paramsOf(e.kind) || {}), cooked: donenessOf(props) };
    if (typeof props.flavor === 'string') it.flavor = props.flavor;
    return it;
  }).sort((a, b) => (itemKey(a) < itemKey(b) ? -1 : itemKey(a) > itemKey(b) ? 1 : 0));
}

/** One item as a stable string (the hash and sort key). Pure. */
export const itemKey = (it) => `${it.kind}:${it.prep || 'whole'}:${it.cooked | 0}${it.flavor ? ':' + it.flavor : ''}`;

/** Does item `it` satisfy need `n` (one of its kinds, in the right state)? Pure. */
export function needOk(n, it) {
  if (!n.kinds.includes(it.kind)) return false;
  if (n.cooked && (it.cooked | 0) < n.cooked) return false;
  if (n.raw && (it.cooked | 0) > 0) return false;
  if (n.prep && !n.prep.includes(it.prep || 'whole')) return false;
  return true;
}

/** Does recipe r match items exactly (every need met, nothing unexpected left)? Pure. */
export function matches(r, items) {
  const slots = [];
  for (const n of r.needs) for (let i = 0; i < n.n; i++) slots.push(n);
  if (slots.length > items.length) return false;
  const allowed = new Set(r.extras);
  for (const n of r.needs) for (const k of n.kinds) allowed.add(k);
  if (items.some((it) => !allowed.has(it.kind))) return false;
  // Give each need slot its own item (backtracking; a handful of things).
  const used = new Array(items.length).fill(false);
  const fill = (s) => {
    if (s === slots.length) return true;
    for (let i = 0; i < items.length; i++) {
      if (used[i] || !needOk(slots[s], items[i])) continue;
      used[i] = true;
      if (fill(s + 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return fill(0);
}

/** The best recipe made `at` from items, or null. Pure. */
export function findRecipe(at, items, table = TABLE) {
  let best = null;
  for (const r of table.recipes) {
    if (r.at !== at || !matches(r, items)) continue;
    if (!best || r.score > best.score) best = r;
  }
  return best;
}

// ---------------------------------------------------------------------------
// The Mystery Dish generator

/** FNV-1a 32-bit hash of a string. Pure. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const pickBy = (list, key, salt) => list[hash32(key + '#' + salt) % list.length];

export const NAME_ADJ = [
  'Wobbly', 'Giggly', 'Squishy', 'Sparkly', 'Bouncy', 'Fuzzy', 'Silly', 'Wiggly', 'Zippy', 'Sleepy',
  'Dizzy', 'Bubbly', 'Snazzy', 'Twirly', 'Goofy', 'Lumpy', 'Jolly', 'Crunchy', 'Gooey', 'Fluffy',
  'Tickly', 'Zany', 'Loopy', 'Cheesy', 'Jiggly', 'Wacky', 'Rumbly', 'Sneezy', 'Mighty', 'Teeny', 'Jumbo', 'Topsy-Turvy',
];
export const NAME_NOUN = [
  'Surprise', 'Pudding', 'Wiggle', 'Mountain', 'Blob', 'Stew', 'Muddle', 'Jiggle', 'Tower', 'Swirl',
  'Mash', 'Delight', 'Dream', 'Casserole', 'Mush', 'Pie', 'Squish', 'Bake', 'Boogie', 'Party',
  'Tornado', 'Parade', 'Hug', 'Castle', 'Puddle', 'Blizzard', 'Splat', 'Jamboree', 'Gloop', 'Wobble', 'Nugget', 'Snowball',
];
export const NAME_FUN = ['Moon', 'Dragon', 'Dino', 'Rocket', 'Unicorn', 'Monster', 'Rainbow', 'Pirate', 'Robot', 'Kitten', 'Cloud', 'Volcano', 'Puppy', 'Wizard', 'Jelly', 'Pickle'];
// The word an ingredient lends a name.
export const FOOD_WORD = {
  tomato: 'Tomato', egg: 'Egg', bread: 'Toast', cheese: 'Cheese', lettuce: 'Lettuce', carrot: 'Carrot', onion: 'Onion',
  potato: 'Potato', banana: 'Banana', apple: 'Apple', strawberry: 'Berry', blueberries: 'Blueberry', lemon: 'Lemon',
  flour: 'Floury', sugar: 'Sugar', butter: 'Butter', milk: 'Milk', chocolate: 'Choco', sprinkles: 'Sprinkle', honey: 'Honey',
  pasta: 'Noodle', rice: 'Rice', sausage: 'Sausage', fish: 'Fishy', chicken: 'Chicken', tofu: 'Tofu', seaweed: 'Seaweed',
  pancake: 'Pancake', scoop: 'Ice Cream', cone: 'Cone', 'coffee-beans': 'Coffee', cupcake: 'Cupcake', cookies: 'Cookie',
};

/** The contents key the Mystery Dish is hashed from (order-independent). Pure. */
export const contentsKey = (items) => items.map(itemKey).sort().join('|');

/** A silly, kid-friendly name for these contents ("Wobbly Banana Surprise"). Deterministic. Pure. */
export function mysteryName(items) {
  const key = contentsKey(items);
  const words = [...new Set(items.map((it) => FOOD_WORD[it.kind]).filter(Boolean))].sort();
  const adj = pickBy(NAME_ADJ, key, 'adj');
  const noun = pickBy(NAME_NOUN, key, 'noun');
  const mid = words.length && hash32(key + '#mid') % 5 < 3 ? pickBy(words, key, 'word') : pickBy(NAME_FUN, key, 'fun');
  return `${adj} ${mid} ${noun}`;
}

/** Face parts for these contents: {color, eyes, mouth, topper}. Deterministic. Pure. */
export function mysteryFace(items) {
  const key = contentsKey(items);
  return {
    color: mysteryColorFor(items.map((it) => colorOf({ kind: it.kind, props: { cracked: it.prep === 'cracked' ? 1 : 0, flavor: it.flavor } }))),
    eyes: pickBy(MYSTERY_VARIANTS.eyes, key, 'eyes'),
    mouth: pickBy(MYSTERY_VARIANTS.mouth, key, 'mouth'),
    topper: pickBy(MYSTERY_VARIANTS.topper, key, 'topper'),
  };
}

// ---------------------------------------------------------------------------
// Resolving a result

/**
 * What `items` make at station `at`: { kind, props, recipe (id or null), mystery }
 * or null (nothing to make: too few things for a Mystery Dish). Props carry
 * the recipe id and name (the text layer shows props.name) and its look; a
 * Mystery Dish carries its face, name and contents. Deterministic. Pure.
 */
export function resolveDish(at, items, table = TABLE) {
  const list = items || [];
  if (!list.length) return null;
  const r = findRecipe(at, list, table);
  if (r) {
    const props = { recipe: r.id, name: r.name };
    if (r.look.tint) props.tint = r.look.tint;
    if (r.look.topper) props.topper = r.look.topper;
    return { kind: r.dish, props, recipe: r.id, mystery: false };
  }
  if (list.length < (MIN_MYSTERY[at] || 1)) return null;
  const face = mysteryFace(list);
  const props = { mystery: 1, name: mysteryName(list), contents: list.map((it) => it.kind).sort() };
  if (at === 'blender') {
    // A mystery smoothie: the glass gets the face (its colour is the blender's).
    Object.assign(props, { eyes: face.eyes, mouth: face.mouth });
    return { kind: 'smoothie', props, recipe: null, mystery: true };
  }
  Object.assign(props, face);
  return { kind: MYSTERY_KIND, props, recipe: null, mystery: true };
}

/** Items that would make recipe r (the first kind of each need, in its state). For tests and the book. Pure. */
export function exampleItems(r) {
  const out = [];
  for (const n of r.needs) for (let i = 0; i < n.n; i++) out.push({ kind: n.kinds[0], prep: n.prep ? n.prep[0] : 'whole', cooked: n.cooked || 0 });
  return out;
}

// ---------------------------------------------------------------------------
// Discovery (the recipe book)

/** The entity that remembers discoveries (the cafe fixtures; lowest id wins), or null. Pure. */
export function discoveryHolder(state) {
  let best = null;
  for (const id of Object.keys(state.entities)) {
    const e = state.entities[id];
    if (e.kind === FIXTURES_KIND && !e.deleted && (!best || id < best.id)) best = e;
  }
  return best;
}

/** Recipe ids found so far. Pure. */
export function discovered(state) {
  const h = discoveryHolder(state);
  const out = new Set();
  if (!h) return out;
  for (const k of Object.keys(h.props || {})) if (k.startsWith(FOUND) && h.props[k]) out.add(k.slice(FOUND.length));
  return out;
}

/** The `set` args that record finding recipe `id`, or null (no holder, or found already). Pure. */
export function discoverArgs(state, id) {
  if (!id) return null;
  const h = discoveryHolder(state);
  if (!h || (h.props && h.props[FOUND + id])) return null;
  return { id: h.id, path: 'props.' + FOUND + id, value: 1 };
}
