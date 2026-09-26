// The Mystery Dish (design.md 3.1; P2a.1 sets it up, P2a.4 generates them):
// a combo that is in no recipe becomes a plate with a lumpy blob in one of
// eight colours and a silly face. The art manifest ships the parts
// separately (`cafe.mystery`: the `mystery-dish` base per colour with its
// bite variants, and `mystery-eyes`, `mystery-mouth`, `mystery-topper`
// variants placed at `cafe.mystery.at` from the base's anchor), and this
// module assembles them into ONE composite sprite from the entity's props:
//
//   props = { color: 'pink', eyes: 'googly', mouth: 'grin', topper: 'sprout', bites: 0..2 }
//
//   mysteryProps(random, rgbs?)         a fresh random face (colour nearest the
//                                        average ingredient colour when rgbs given)
//   mysteryColorFor(rgbs, colors?)      nearest blob colour name for [[r,g,b], ...] or '#hex'
//   mysteryLook(props)                  the base variant: 'pink', 'pink-bite1', ...
//   mysterySprite(catalog, e)           the composite sprite (view.js / sprites.js format)
//
// Pure: no DOM (paintSprite draws the overlays).

export const MYSTERY_KIND = 'mystery-dish';
export const MYSTERY_PARTS = ['eyes', 'mouth', 'topper'];
export const MYSTERY_BITES = 2;

// The blob colours as drawn (tools/art/props/cafe.mjs MYSTERY_COLORS, fill tone).
export const MYSTERY_HEX = {
  pink: '#E9AFAE', yellow: '#F4DC98', green: '#B9CDA4', brown: '#E2A860',
  purple: '#D5C8E3', orange: '#F4C7A6', blue: '#A3BEDC', cream: '#EFE4D6',
};
const DEFAULTS = { color: 'pink', eyes: 'googly', mouth: 'grin', topper: 'sprout' };
export const MYSTERY_VARIANTS = {
  eyes: ['googly', 'wonky', 'happy', 'sleepy', 'stars', 'dots'],
  mouth: ['grin', 'tongue', 'o', 'wavy', 'teeth', 'smile'],
  topper: ['sprout', 'cherry', 'flag', 'bow', 'steam', 'candle'],
};

const r1 = (v) => Math.round(v * 10) / 10;

/** '#abc' / '#aabbcc' / [r, g, b] -> [r, g, b] or null. */
export function toRgb(c) {
  if (Array.isArray(c) && c.length >= 3 && c.every((n) => typeof n === 'number')) return c.slice(0, 3);
  if (typeof c !== 'string') return null;
  let h = c.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** The blob colour name nearest the average of `colors` (hex strings or rgb triples). */
export function mysteryColorFor(colors, names = Object.keys(MYSTERY_HEX)) {
  const rgbs = (colors || []).map(toRgb).filter(Boolean);
  if (!rgbs.length) return names[0];
  const avg = [0, 1, 2].map((i) => rgbs.reduce((n, c) => n + c[i], 0) / rgbs.length);
  let best = names[0];
  let bestD = Infinity;
  for (const n of names) {
    const c = toRgb(MYSTERY_HEX[n]);
    if (!c) continue;
    // Redmean colour distance: cheap and close enough to how it looks.
    const rm = (avg[0] + c[0]) / 2;
    const d = (2 + rm / 256) * (avg[0] - c[0]) ** 2 + 4 * (avg[1] - c[1]) ** 2 + (2 + (255 - rm) / 256) * (avg[2] - c[2]) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

const pick = (list, random) => list[Math.floor(random() * list.length) % list.length];

/** Props for a new Mystery Dish: a random face; the colour from the ingredients' colours if given. */
export function mysteryProps(random = Math.random, colors = null) {
  return {
    color: colors && colors.length ? mysteryColorFor(colors) : pick(Object.keys(MYSTERY_HEX), random),
    eyes: pick(MYSTERY_VARIANTS.eyes, random),
    mouth: pick(MYSTERY_VARIANTS.mouth, random),
    topper: pick(MYSTERY_VARIANTS.topper, random),
  };
}

/** The base variant for its colour and bites: 'pink', 'pink-bite1', 'pink-bite2'. */
export function mysteryLook(props = {}) {
  const color = typeof props.color === 'string' && MYSTERY_HEX[props.color] ? props.color : DEFAULTS.color;
  const b = Math.max(0, Math.min(MYSTERY_BITES, props.bites | 0));
  return b ? `${color}-bite${b}` : color;
}

/**
 * The composite sprite: the base (plate + blob) from the catalog, with the
 * face parts as overlays. Each part's origin goes at the base's anchor plus
 * manifest.cafe.mystery.at[part] (world units). Returns null if the catalog
 * has no art for the base (the placeholder then draws).
 */
export function mysterySprite(catalog, e) {
  const props = (e && e.props) || {};
  const look = mysteryLook(props);
  const base = catalog.sprite(MYSTERY_KIND, look);
  const m = catalog.manifest;
  const kit = m && m.cafe && m.cafe.mystery;
  if (!base || base.draw !== 'img' || !base.img || !kit) return base;
  const k = catalog.get(MYSTERY_KIND);
  const s = (k && k.art && k.art.scale) || 1;
  const overlays = [];
  const names = [];
  for (const part of MYSTERY_PARTS) {
    const p = m.props && m.props[kit.parts[part]];
    if (!p) continue;
    const name = typeof props[part] === 'string' && p.variants[props[part]] ? props[part] : (DEFAULTS[part] in p.variants ? DEFAULTS[part] : p.default);
    const v = p.variants[name];
    const at = kit.at[part] || [0, 0];
    overlays.push({
      part, src: v.file,
      left: r1(base.w / 2 + (at[0] - v.anchor[0]) * s), top: r1(base.h + (at[1] - v.anchor[1]) * s),
      w: r1(v.size[0] * s), h: r1(v.size[1] * s),
    });
    names.push(name);
  }
  return Object.assign({}, base, { key: `mystery:${look}:${names.join(':')}`, overlays });
}
