// The Character Maker's rules (P1.15, docs/design.md 2.4): pure, no DOM, so
// unit tests import it directly. The booth scene (src/scenes/booth.js) draws
// the buttons and turns the changes below into store ops.
//
// The character in the booth is an ordinary `char` entity (char-model.js)
// kept in the room MIRROR_ROOM, which no room view shows: the booth draws it
// big in its own preview. Every choice is a store op on it (so it is saved,
// replayed and shared), and "done" moves it out onto the booth floor.
//
// Categories (the tabs, in order). Each has options (the picture buttons):
//   body skin hair hairColor eyes brows facial cheeks   -> props (set ops)
//   top bottom shoes                                    -> props.wear (set op)
//   hat face over back                                  -> a worn child entity (spawn / remove)
// Tapping the option that is already chosen for an outfit slot steps its
// colour instead (rig.maker.outfitColors).

import { REMOVABLE, wearSlotName } from './char-model.js';

export const MIRROR_ROOM = 'booth/mirror';
export const CATEGORIES = ['body', 'skin', 'hair', 'hairColor', 'eyes', 'brows', 'facial', 'cheeks', 'hat', 'face', 'top', 'over', 'bottom', 'shoes', 'back'];
/** Colour variable prefix per wear slot (docs/rig.md section 4). */
export const COLOR_KEY = { top: 'top', bottom: 'bot', shoes: 'shoe', hat: 'hat', face: 'face', over: 'over', back: 'back' };
const WEAR_CATS = ['top', 'bottom', 'shoes', 'hat', 'face', 'over', 'back'];
const EYES = [null, 'big', 'small', 'almond'];
const CHEEKS = [{ blush: false, freckles: false }, { blush: true, freckles: false }, { blush: false, freckles: true }, { blush: true, freckles: true }];

export const isWearCat = (cat) => WEAR_CATS.includes(cat);
export const isRemovableCat = (cat) => REMOVABLE.includes(cat);

/** The option values of a category, in button order. Pure. */
export function optionsOf(rig, cat) {
  const m = rig.maker;
  switch (cat) {
    case 'body': return m.bodies.slice();
    case 'skin': return m.skins.map((s) => s.slice());
    case 'hair': return m.hairStyles.slice();
    case 'hairColor': return m.hairColors.map((c) => c.slice());
    case 'eyes': return [].concat(...EYES.map((e) => [{ eyes: e, lashes: false }, { eyes: e, lashes: true }]));
    case 'brows': return m.brows.slice();
    case 'facial': return m.facialHair.slice();
    case 'cheeks': return CHEEKS.map((c) => Object.assign({}, c));
    default: return (m.wear[cat] || []).slice();
  }
}

/** Is `value` the current choice of `cat` for this look (props + worn {slot: entity})? Pure. */
export function isChosen(cat, value, props, worn = {}) {
  switch (cat) {
    case 'body': return props.body === value;
    case 'skin': return !!props.skin && props.skin[0] === value[0];
    case 'hair': return !!props.hair && props.hair.style === value;
    case 'hairColor': return !!props.hair && props.hair.color[0] === value[0];
    case 'eyes': return (props.eyes || null) === value.eyes && !!props.lashes === value.lashes;
    case 'brows': return (props.brows || null) === value;
    case 'facial': return (props.facialHair || 'none') === value;
    case 'cheeks': return !!props.blush === value.blush && !!props.freckles === value.freckles;
    default:
      if (isRemovableCat(cat)) return ((worn[cat] && worn[cat].kind) || null) === value;
      return ((props.wear || {})[cat] || null) === value;
  }
}

/** The look with `cat` set to `value`, as a props patch {key: value} (not for removable slots). Pure. */
export function patchFor(cat, value, props) {
  switch (cat) {
    case 'body': return { body: value };
    case 'skin': return { skin: value.slice() };
    case 'hair': return { hair: { style: value, color: (props.hair && props.hair.color || ['#6A4A3A', '#523729']).slice() } };
    case 'hairColor': return { hair: { style: (props.hair && props.hair.style) || 'short', color: value.slice() } };
    case 'eyes': return { eyes: value.eyes, lashes: value.lashes };
    case 'brows': return { brows: value };
    case 'facial': return { facialHair: value === 'none' ? null : value };
    case 'cheeks': return { blush: value.blush, freckles: value.freckles };
    default: return { wear: Object.assign({}, props.wear || {}, { [cat]: value }) };
  }
}

/** Colour vars {key: colour} for option i of a slot's colour list. Pure. */
export function slotColors(rig, cat, i) {
  const key = COLOR_KEY[cat];
  const list = rig.maker.outfitColors[key] || [];
  if (!list.length) return {};
  const c = list[((i % list.length) + list.length) % list.length];
  return { [key]: c[0], [key + '-sh']: c[1], [key + '-2']: c[2] };
}

/** Which colour of the list a colours object shows (-1: none of them). Pure. */
export function colorIndex(rig, cat, colors = {}) {
  const key = COLOR_KEY[cat];
  const list = rig.maker.outfitColors[key] || [];
  return list.findIndex((c) => c[0] === colors[key]);
}

/** props.colors without the given slot's keys, plus `add`. Pure. */
export function withSlotColors(colors, cat, add) {
  const key = COLOR_KEY[cat];
  const out = {};
  for (const k of Object.keys(colors || {})) if (k !== key && k.indexOf(key + '-') !== 0) out[k] = colors[k];
  return Object.assign(out, add);
}

const pickOf = (random) => (list) => list[Math.floor(random() * list.length) % list.length];

/**
 * A random look: {props, pieces: [{kind, slot, colors}]} in the castProps
 * format (char-model.js), so it spawns the same way. Pure given `random`.
 */
export function randomLook(rig, random = Math.random) {
  const pick = pickOf(random);
  const m = rig.maker;
  const body = pick(m.bodies);
  const grown = body === 'adult' || body === 'elder';
  let style = pick(m.hairStyles);
  if (style === 'bald' && !grown) style = 'short';
  const naturals = m.hairColors.slice(0, 8);
  const color = body === 'elder' ? pick(m.hairColors.slice(6, 8)) : random() < 0.8 ? pick(naturals.slice(0, 6)) : pick(m.hairColors);
  const wear = { top: pick(m.wear.top), bottom: pick(m.wear.bottom), shoes: pick(m.wear.shoes) };
  let colors = {};
  for (const slot of ['top', 'bottom', 'shoes']) colors = Object.assign(colors, slotColors(rig, slot, Math.floor(random() * 99)));
  const cheeks = pick(CHEEKS);
  const props = {
    body, skin: pick(m.skins).slice(), hair: { style, color: color.slice() },
    lashes: random() < 0.5, blush: cheeks.blush, freckles: cheeks.freckles,
    eyes: pick(EYES), brows: pick(m.brows), facialHair: grown && random() < 0.35 ? pick(m.facialHair.slice(1)) : null,
    sock: '#FBF3E8', wear, colors, expr: 'happy', pose: 'stand', seat: null, raise: null, taps: 0,
  };
  const pieces = [];
  const chance = { hat: 0.45, face: 0.25, over: 0.15, back: 0.2 };
  for (const slot of REMOVABLE) {
    if (random() >= chance[slot]) continue;
    const kind = pick(m.wear[slot].filter(Boolean));
    pieces.push({ kind, slot, colors: slotColors(rig, slot, Math.floor(random() * 99)) });
  }
  return { props, pieces };
}

/** The props keys a look sets (what shuffle overwrites). */
export const LOOK_KEYS = ['body', 'skin', 'hair', 'lashes', 'blush', 'freckles', 'eyes', 'brows', 'facialHair', 'wear', 'colors'];

/**
 * Store ops (as [op, args] pairs) that turn the character `id` (props,
 * worn {slot: entity}) into `look` = {props, pieces}. newId() makes ids for
 * spawned pieces. Pure.
 */
export function lookOps(id, props, worn, look, newId) {
  const ops = [];
  for (const k of LOOK_KEYS) {
    const want = look.props[k] === undefined ? null : look.props[k];
    const have = props[k] === undefined ? null : props[k];
    if (JSON.stringify(want) !== JSON.stringify(have)) ops.push(['set', { id, path: 'props.' + k, value: want }]);
  }
  const bySlot = Object.fromEntries(look.pieces.map((p) => [p.slot, p]));
  for (const slot of REMOVABLE) {
    const cur = worn[slot], next = bySlot[slot];
    if (cur && (!next || next.kind !== cur.kind)) ops.push(['remove', { id: cur.id, hard: true }]);
    if (next && (!cur || next.kind !== cur.kind)) {
      ops.push(['spawn', { id: newId(), kind: next.kind, parent: id, slot: wearSlotName(slot), props: { colors: next.colors || {} } }]);
    } else if (next && cur) {
      ops.push(['set', { id: cur.id, path: 'props.colors', value: next.colors || {} }]);
    }
  }
  return ops;
}

/**
 * Store ops for choosing option `value` of `cat` (a tap on a picture
 * button). Tapping the choice that is already made steps an outfit piece's
 * colour. Returns [[op, args], ...] (empty: nothing to do). Pure.
 */
export function chooseOps(rig, id, props, worn, cat, value, newId) {
  const chosen = isChosen(cat, value, props, worn);
  if (isRemovableCat(cat)) {
    const cur = worn[cat];
    if (chosen) {
      if (!cur) return [];
      const i = colorIndex(rig, cat, (cur.props && cur.props.colors) || {});
      return [['set', { id: cur.id, path: 'props.colors', value: slotColors(rig, cat, i + 1) }]];
    }
    const ops = [];
    if (cur) ops.push(['remove', { id: cur.id, hard: true }]);
    if (value) ops.push(['spawn', { id: newId(), kind: value, parent: id, slot: wearSlotName(cat), props: { colors: {} } }]);
    return ops;
  }
  if (chosen) {
    if (!isWearCat(cat)) return [];
    const colors = props.colors || {};
    const i = colorIndex(rig, cat, colors);
    return [['set', { id, path: 'props.colors', value: withSlotColors(colors, cat, slotColors(rig, cat, i + 1)) }]];
  }
  const patch = patchFor(cat, value, props);
  return Object.keys(patch).map((k) => ['set', { id, path: 'props.' + k, value: patch[k] === undefined ? null : patch[k] }]);
}
