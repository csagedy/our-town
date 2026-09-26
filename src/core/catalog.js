// The catalog (docs/design.md 2.2, 6.6): what every entity kind is. One
// entry per kind in data/catalog.json; adding an item means one catalog
// entry plus (optionally) art. Loaded with fetch(): Safari 16 has no JSON
// module imports.
//
//   const catalog = await loadCatalog();            // never rejects
//   catalog.get('mug')      -> normalized entry (below) or null
//   catalog.sprite('mug', 'full') -> sprite for view.js (art or placeholder)
//   catalog.hasTag('mug', 'drink')
//
// data/catalog.json:
//   { "schema": 1,
//     "kinds": {
//       "<kind>": {
//         "art":    { "sprite": "<art-manifest props id>", "scale": 1 },   optional
//         "ph":     { "shape": "round|box|tall|cup|blob|flat", "fill": "#hex",
//                     "looks": { "<look>": { "fill"?, "shape"?, "h"? } } },  placeholder
//         "size":   [w, h],        placeholder box, world units
//         "anchor": [ax, ay],      feet point inside the box (default bottom center)
//         "tags":   ["food", "dish", "container", "toy", "heat-source", ...],
//         "sounds": { "tap": "<sfx>", "drop": "<sfx>" },   names from src/audio/sfx.js
//         "behaviors": [ { "use": "<registered behavior>", ...params } ],   in order
//         "label":  "Cookie Jar",  optional: Zoe's text layer only, never needed to play
//         "home":   { "room": "cafe/kitchen" } | { "spawner": "<kind>" },  tidy-up target
//         "fixed":  true           optional: furniture, not draggable
//       } } }
//
// Art: when the art manifest (assets/art-manifest.json, tools/art) has the
// `art.sprite` prop, the view draws its WebP for the entity's current look
// (a manifest variant name; the prop's default variant otherwise), at the
// manifest's measured size and anchor times `art.scale`. Without it (no
// entry, or the manifest failed to load) the placeholder shape is drawn from
// `ph`, `size`, `anchor`, and `ph.looks[look]` overrides. Looks come from
// behaviors (toggle, cycle, eatable, container...; see src/core/behaviors/).
//
// Pure except loadCatalog (fetch). No DOM at module top level.

import { SHAPES, hashColor } from '../engine/sprites.js';

export const CATALOG_URL = 'data/catalog.json';
export const MANIFEST_URL = 'assets/art-manifest.json';
export const CATALOG_SCHEMA = 1;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && isFinite(v);
const isPt = (p) => Array.isArray(p) && p.length === 2 && p.every(isNum);
const r1 = (v) => Math.round(v * 10) / 10;

/** Fill in defaults. Pure; tolerates a malformed entry (validateCatalog reports it). */
export function normalizeKind(kind, raw) {
  const k = isObj(raw) ? raw : {};
  const size = isPt(k.size) ? k.size : [90, 90];
  const ph = isObj(k.ph) ? k.ph : {};
  return {
    kind,
    art: isObj(k.art) && typeof k.art.sprite === 'string' ? { sprite: k.art.sprite, scale: isNum(k.art.scale) ? k.art.scale : 1 } : null,
    ph: {
      shape: SHAPES.includes(ph.shape) ? ph.shape : 'blob',
      fill: typeof ph.fill === 'string' ? ph.fill : hashColor(kind),
      looks: isObj(ph.looks) ? ph.looks : {},
    },
    size,
    anchor: isPt(k.anchor) ? k.anchor : [size[0] / 2, size[1]],
    tags: Array.isArray(k.tags) ? k.tags.filter((t) => typeof t === 'string') : [],
    sounds: Object.assign({ tap: null, drop: null }, isObj(k.sounds) ? k.sounds : {}),
    behaviors: Array.isArray(k.behaviors) ? k.behaviors.filter((b) => isObj(b) && typeof b.use === 'string') : [],
    label: typeof k.label === 'string' ? k.label : null,
    home: isObj(k.home) ? k.home : null,
    fixed: k.fixed === true,
  };
}

/**
 * Problems in a catalog file (an empty list means good). `opts.behaviors`:
 * the behavior registry (name -> def with `params` defaults) to check names
 * and params; `opts.sounds`: valid sound names; `opts.manifest`: the art
 * manifest, to check art refs and looks. Pure.
 */
export function validateCatalog(json, { behaviors = null, sounds = null, manifest = null } = {}) {
  const out = [];
  if (!isObj(json)) return ['catalog is not an object'];
  if (json.schema !== CATALOG_SCHEMA) out.push('schema must be ' + CATALOG_SCHEMA);
  if (!isObj(json.kinds)) return out.concat('kinds must be an object');
  const kinds = json.kinds;
  const KEYS = new Set(['art', 'ph', 'size', 'anchor', 'tags', 'sounds', 'behaviors', 'label', 'home', 'fixed']);
  for (const [kind, k] of Object.entries(kinds)) {
    const at = (m) => out.push(kind + ': ' + m);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(kind)) at('kind names are lowercase-with-dashes');
    if (!isObj(k)) { at('entry must be an object'); continue; }
    for (const key of Object.keys(k)) if (!KEYS.has(key)) at('unknown field ' + key);
    if (!isPt(k.size) || k.size[0] <= 0 || k.size[1] <= 0) at('size must be [w, h] > 0');
    if (k.anchor != null && (!isPt(k.anchor) || (isPt(k.size) && (k.anchor[0] < 0 || k.anchor[0] > k.size[0] || k.anchor[1] < 0 || k.anchor[1] > k.size[1])))) at('anchor must be a point inside size');
    if (!Array.isArray(k.tags) || !k.tags.every((t) => typeof t === 'string' && t)) at('tags must be a list of strings');
    if (k.label != null && typeof k.label !== 'string') at('label must be a string');
    if (k.fixed != null && typeof k.fixed !== 'boolean') at('fixed must be a boolean');
    if (k.art != null) {
      if (!isObj(k.art) || typeof k.art.sprite !== 'string') at('art needs a sprite id');
      else if (manifest && !(manifest.props && manifest.props[k.art.sprite])) at('art sprite ' + k.art.sprite + ' is not in the art manifest');
      if (isObj(k.art) && k.art.scale != null && !(isNum(k.art.scale) && k.art.scale > 0)) at('art.scale must be > 0');
    }
    if (k.ph != null) {
      if (!isObj(k.ph)) at('ph must be an object');
      else {
        if (k.ph.shape != null && !SHAPES.includes(k.ph.shape)) at('ph.shape must be one of ' + SHAPES.join(', '));
        if (k.ph.looks != null && !isObj(k.ph.looks)) at('ph.looks must be an object');
      }
    }
    if (k.sounds != null) {
      if (!isObj(k.sounds)) at('sounds must be an object');
      else for (const [slot, name] of Object.entries(k.sounds)) {
        if (slot !== 'tap' && slot !== 'drop') at('unknown sound slot ' + slot);
        if (sounds && !sounds.includes(name)) at('unknown sound ' + name);
      }
    }
    if (k.home != null) {
      const h = k.home;
      const ok = isObj(h) && ((typeof h.room === 'string' && h.room) || (typeof h.spawner === 'string' && kinds[h.spawner]));
      if (!ok) at('home must be {room} or {spawner: <catalog kind>}');
    }
    if (!Array.isArray(k.behaviors)) { at('behaviors must be a list'); continue; }
    for (const b of k.behaviors) {
      if (!isObj(b) || typeof b.use !== 'string') { at('each behavior needs "use"'); continue; }
      if (!behaviors) continue;
      const def = behaviors[b.use];
      if (!def) { at('unknown behavior ' + b.use); continue; }
      for (const p of Object.keys(b)) if (p !== 'use' && !(p in def.params)) at(b.use + ': unknown param ' + p);
      if (def.check) {
        const why = def.check(Object.assign({}, def.params, b), { kinds, sounds, kind });
        if (why) at(b.use + ': ' + why);
      }
    }
  }
  return out;
}

/**
 * The runtime catalog over a parsed file and (optionally) the art manifest.
 * Unknown kinds still work everywhere: they get a hashed-color placeholder.
 */
export function createCatalog(json, manifest = null) {
  const raw = (isObj(json) && isObj(json.kinds)) ? json.kinds : {};
  const kinds = new Map();
  for (const kind of Object.keys(raw)) kinds.set(kind, normalizeKind(kind, raw[kind]));
  const artProps = (manifest && isObj(manifest.props)) ? manifest.props : {};
  const cache = new Map();

  /** The manifest prop for a kind, if its art exists. */
  const artOf = (k) => (k && k.art && artProps[k.art.sprite]) || null;

  function makeSprite(kind, look) {
    const k = kinds.get(kind) || normalizeKind(kind, null);
    const sound = k.sounds.tap || 'pop';
    const a = artOf(k);
    if (a && isObj(a.variants)) {
      const name = look && a.variants[look] ? look : a.default;
      const v = a.variants[name];
      if (v && typeof v.file === 'string' && isPt(v.size) && isPt(v.anchor)) {
        const s = k.art.scale;
        const W = v.size[0] * s, H = v.size[1] * s, ax = v.anchor[0] * s, ay = v.anchor[1] * s;
        // A box whose bottom center is the anchor (the view's feet point);
        // the image sits inside it and may hang below (a shadow, a base).
        const bw = 2 * Math.max(ax, W - ax);
        return {
          key: 'art:' + kind + ':' + name, draw: 'img', src: v.file, sound, look: name,
          w: r1(bw), h: r1(ay),
          img: { left: r1(bw / 2 - ax), top: 0, w: r1(W), h: r1(H) },
        };
      }
    }
    const o = (look && isObj(k.ph.looks[look])) ? k.ph.looks[look] : {};
    const w0 = isNum(o.w) ? o.w : k.size[0];
    const h0 = isNum(o.h) ? o.h : k.size[1];
    const [ax, ay] = k.anchor;
    const bw = 2 * Math.max(ax, k.size[0] - ax);
    const sprite = {
      key: 'ph:' + kind + (look ? ':' + look : ''), draw: 'shape', sound, look: look || null,
      w: r1(bw * (w0 / k.size[0])), h: r1(ay * (h0 / k.size[1])),
      shape: SHAPES.includes(o.shape) ? o.shape : k.ph.shape,
      fill: typeof o.fill === 'string' ? o.fill : k.ph.fill,
    };
    return sprite;
  }

  return {
    kinds: () => Array.from(kinds.keys()),
    has: (kind) => kinds.has(kind),
    get: (kind) => kinds.get(kind) || null,
    tagsOf: (kind) => (kinds.has(kind) ? kinds.get(kind).tags : []),
    hasTag: (kind, tag) => kinds.has(kind) && kinds.get(kind).tags.includes(tag),
    labelOf: (kind) => (kinds.has(kind) ? kinds.get(kind).label : null),
    homeOf: (kind) => (kinds.has(kind) ? kinds.get(kind).home : null),
    /** Does this kind draw manifest art (vs a placeholder)? */
    hasArt: (kind) => !!artOf(kinds.get(kind)),
    /** Sprite for a kind in a look (null = default). Cached; never throws. */
    sprite(kind, look = null) {
      const id = kind + '\u0000' + (look || '');
      let s = cache.get(id);
      if (!s) { s = makeSprite(kind, look); cache.set(id, s); }
      return s;
    },
    raw: json,
    manifest,
  };
}

async function fetchJson(url, fetchFn) {
  try {
    const r = await fetchFn(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/**
 * Fetch data/catalog.json and the art manifest (in parallel) and build the
 * catalog. Never rejects: a missing catalog gives an empty one (every kind a
 * placeholder), a missing manifest gives placeholders for every kind.
 */
export async function loadCatalog({ fetch: fetchFn = (u) => fetch(u), catalogUrl = CATALOG_URL, manifestUrl = MANIFEST_URL } = {}) {
  const [json, manifest] = await Promise.all([fetchJson(catalogUrl, fetchFn), fetchJson(manifestUrl, fetchFn)]);
  if (!json) console.warn('catalog: could not load ' + catalogUrl + '; using placeholders');
  return createCatalog(json || { schema: CATALOG_SCHEMA, kinds: {} }, manifest);
}
