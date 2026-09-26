// The city map (P1.13, docs/design.md 2.6): the home screen. A front-on
// little town, 2400 units wide so it pans with a finger. Every building
// reacts to a tap: the cafe opens its door and you go in (town.js runs the
// transition); the theater, the construction site and the school are not
// built yet, so they play a "coming soon" reaction instead (curtains wiggle,
// the crane waves, the bell rings). The sun/moon in the sky toggles night
// (a `mapSet {night}` op, so it is saved and shared). Lots and the Lost &
// Found box wiggle for now (structures and the lost-things drawer arrive in
// P2c.5 and P1.14).
//
// Art: assets/rooms/city/*.webp from tools/art/rooms/city.mjs, placed by the
// manifest's `map` entry: a back and a front layer, and pieces, each with a
// night variant. Night swaps every image to its night file with an opacity
// cross-fade (both decoded first; the unused variant's src is then dropped
// so only one set stays in memory).
//
// Memory (bead 6hn, docs/perf.md "City map memory"): the two layers ship as
// 200-unit column tiles (tools/art/build.mjs buildMapTiles) and every image,
// tile or piece, goes through a tile loader (src/engine/tiles.js): only what
// is on screen plus one column each side is decoded, more ahead while the map
// moves, the rest dropped once it is still. One loader per set (day, night,
// and the pieces with no night variant); the set not showing holds nothing.
// Leaving releases every src (town.js then decodes the next place).
//
// Performance: no per-frame work. Reactions are short WAAPI tweens on
// transform/opacity (tween.js); nothing loops while nobody touches the iPad.

import { mountRoom } from '../engine/room.js';
import { createFx } from '../engine/fx.js';
import * as tween from '../engine/tween.js';
import { sfx, speech } from '../audio/index.js';
import { createRoomView } from '../engine/view.js';
import { addSpriteSource } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { mountCharacters } from '../engine/characters.js';
import { useArtSprites } from './art.js';
import { createTileLoader, tilesNear } from '../engine/tiles.js';

export const CITY_ID = 'city';

// What each tappable piece belongs to.
const OWNER = {
  cafe: 'cafe', 'cafe-door': 'cafe',
  theater: 'theater', 'theater-curtains': 'theater',
  construction: 'construction', 'crane-jib': 'construction',
  school: 'school', 'school-bell': 'school', bus: 'bus',
  birds: 'birds', lostfound: 'lostfound', lot: 'lot', sun: 'sky', moon: 'sky',
  booth: 'booth', 'booth-curtain': 'booth',   // P1.15: the Character Maker
};
// Built locations: a tap goes in. The rest react ("coming soon").
export const DOORS = { cafe: 'cafe/kitchen', booth: 'booth', construction: 'construction/yard' };   // P2c.1: the site
export const BUILDINGS = ['cafe', 'theater', 'construction', 'school'];
// P1.14: things and characters carried onto the map rest on the street (the
// upper sidewalk, the road, the lower sidewalk) and are drawn this much
// smaller than in a room, so a kid stands about door high.
export const CITY_FLOOR = { top: 655, bottom: 815 };
export const CITY_ENTITY_SCALE = 0.45;
// The piece whose box is each building's front door (a car parks there; a
// dragged thing held over it goes in).
const DOOR_PIECE = { cafe: 'cafe-door', theater: 'theater-curtains', construction: 'construction', school: 'school' };

const later = (ms, fn) => setTimeout(fn, ms);
// At rest the loaders keep what is on screen plus this much each side: one
// tile column (tools/art/build.mjs MAP_TILE_W), so the columns next to the
// view are already decoded when a pan starts (bead bp8).
export const CITY_REST_MARGIN = 200;
const READY_TIMEOUT = 4000;   // ms: never hold a transition longer than this for decodes

/**
 * Room definition for the view layer, from the manifest's map entry. Pure.
 * No <img> gets a src here: `images` lists every image slot ({id, x, w, px,
 * day, night} files, night null when the piece has no night variant) for the
 * tile loaders. opts.tiled: the layers as column tiles (default) or whole
 * (`?tiles=0`, docs/perf.md "before").
 */
export function cityRoom(map, night = false, { tiled = true } = {}) {
  const img = (v) => '<div class="city-body"><img class="city-day" alt="" draggable="false" decoding="async">'
    + (v.night ? '<img class="city-night" alt="" draggable="false" decoding="async">' : '') + '</div>';
  const art = [];
  const images = [];
  const slot = (id, x, w, v) => images.push({ id, x, w, px: v.px, day: v.file, night: v.night ? v.night.file : null });
  const layer = (L, layerName, depth) => {
    const parts = tiled && L.tiles && L.tiles.length ? L.tiles.map((t, i) => [`${L.id}-${i}`, t]) : [[L.id, L]];
    for (const [id, t] of parts) {
      art.push({ id, layer: layerName, depth, x: t.x, y: t.y, w: t.w, h: t.h, cls: 'city-static', html: img(t) });
      slot(id, t.x, t.w, t);
    }
  };
  const [back, front] = map.layers;
  layer(back, 'back');
  for (const [id, p] of Object.entries(map.pieces)) {
    const boxes = p.copies || [[p.x, p.y]];
    boxes.forEach(([x, y], i) => {
      const aid = p.copies ? `${id}-${i}` : id;
      art.push({ id: aid, layer: 'mid', depth: p.depth, x, y, w: p.w, h: p.h, cls: `city-piece city-${id}`, html: img(p) });
      slot(aid, x, p.w, p);
    });
  }
  if (front) layer(front, 'mid', 1100);
  const b = map.backdrop[night ? 'night' : 'day'];
  return { id: CITY_ID, width: map.width, backdrop: b, floor: Object.assign({ sound: 'tap' }, CITY_FLOOR), entityScale: CITY_ENTITY_SCALE, surfaces: [], art, images };
}

/**
 * The image files the map shows first in one mode with the camera at
 * cameraX (for preloading): the tiles and pieces the loaders want at rest.
 */
export function cityFiles(map, night = false, { cameraX = 0, width = 1440 } = {}) {
  const { images } = cityRoom(map, night);
  return tilesNear(images, cameraX, cameraX + width, CITY_REST_MARGIN).map((i) => (night && images[i].night) || images[i].day);
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

/**
 * Mount the map. opts: { input, store, manifest, cameraX, onEnter(building,
 * location, {x, y} screen point), from: location we came back from, carry
 * (P1.14, src/scenes/carry.js: wraps the entity view's hooks) }. Resolves
 * once it is up, entities (things carried here, the car) included.
 */
export async function mountCity(stage, opts) {
  const city = cityScene(stage, opts);
  await Promise.all([city.play(opts), city.ready()]);
  return city;
}

function cityScene(stage, { input, store, manifest, cameraX = 0, onEnter = null, from = null }) {
  const map = manifest.map;
  let night = !!store.state.map.night;
  const tiled = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tiles') === '0');
  const def = cityRoom(map, night, { tiled });
  const room = mountRoom(stage, Object.assign(def, { cameraX }));
  room.el.classList.add('city');

  // ---- image loading (bead 6hn): three loaders, only one of day/night active ----
  const recs = { day: [], night: [], always: [] };
  for (const im of def.images) {
    const el = room.art.get(im.id);
    const base = { id: im.id, x: im.x, w: im.w, px: im.px };
    if (im.night) {
      recs.day.push({ ...base, img: el.querySelector('.city-day'), file: im.day });
      recs.night.push({ ...base, img: el.querySelector('.city-night'), file: im.night });
    } else recs.always.push({ ...base, img: el.querySelector('.city-day'), file: im.day });
  }
  const margin = { restMargin: tiled ? CITY_REST_MARGIN : Infinity };
  const loaders = {
    day: createTileLoader({ stage, tiles: recs.day, active: !night, ...margin }),
    night: createTileLoader({ stage, tiles: recs.night, active: night, ...margin }),
    always: createTileLoader({ stage, tiles: recs.always, ...margin }),
  };
  const allLoaders = Object.values(loaders);
  for (const l of allLoaders) l.update();
  const nightImgs = recs.night.map((r) => r.img);
  const fx = createFx(room.fxLayer);
  const stats = { reactions: 0, entered: 0, toggles: 0, last: '' };
  const els = [...room.art.values()];
  const pieceEls = els.filter((el) => el.classList.contains('city-piece'));
  const bodyOf = (id) => { const el = room.art.get(id); return el && el.firstChild; };
  const busy = new Set();          // parts in the middle of a reaction
  let entering = false;

  // Moving parts turn around their pivot (from the manifest).
  for (const [id, p] of Object.entries(map.pieces)) {
    if (!p.pivot) continue;
    const b = bodyOf(id);
    if (b) b.style.transformOrigin = `${p.pivot[0] - p.x}px ${p.pivot[1] - p.y}px`;
  }

  // ---- night ----
  function showSky() {
    const sun = room.art.get('sun'), moon = room.art.get('moon');
    if (sun) { sun.style.visibility = night ? 'hidden' : ''; input.setEnabled(sun, !night); }
    if (moon) { moon.style.visibility = night ? '' : 'hidden'; input.setEnabled(moon, night); }
  }
  room.el.classList.toggle('is-night', night);

  let swapSeq = 0;
  /**
   * Swap to the day or night set. The new set's loader decodes what the
   * camera wants first; then the night images (stacked on the day ones)
   * fade in or out (animate) and the old set's loader drops its srcs.
   */
  function applyNight(on, animate) {
    const seq = ++swapSeq;
    const show = on ? loaders.night : loaders.day;
    const hide = on ? loaders.day : loaders.night;
    show.setActive(true);
    return show.ready().then(() => {
      if (seq !== swapSeq) return;
      const drop = () => { if (seq === swapSeq) hide.setActive(false); };
      const fades = [];
      for (const img of nightImgs) {
        img.style.opacity = on ? '1' : '0';
        if (animate && img.getAttribute('src')) fades.push(tween.done(tween.animate(img, [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: 450, easing: 'ease-in-out' })));
      }
      Promise.all(fades).then(drop);
    });
  }
  // The manifest piece an element shows (element -> piece id).
  const pieceOf = (el) => { const id = el.dataset.art; return map.pieces[id.replace(/-\d+$/, '')] || map.pieces[id]; };
  for (const img of nightImgs) img.style.opacity = night ? '1' : '0';
  showSky();

  /** Night on/off (from a store change: our tap or the other iPad's). */
  function setNight(on, { animate = true } = {}) {
    if (on === night) return;
    night = on;
    room.el.classList.toggle('is-night', night);
    showSky();
    applyNight(on, animate);
  }
  const unsubscribe = store.subscribe((state) => setNight(!!state.map.night));

  // ---- reactions ----
  const center = (el, dy = 0.5) => {
    const id = el.dataset.art;
    const p = pieceOf(el);
    const [x, y] = (p.copies && p.copies[Number(id.split('-').pop())]) || [p.x, p.y];
    return { x: x + p.w / 2, y: y + p.h * dy };
  };
  function bounce(id, amount = 0.3) {
    const b = bodyOf(id);
    if (b) tween.squish(b, { amount, duration: 460 });
  }
  function sparkle(id, dy = 0.5, count = 8, type = 'sparkle') {
    const el = room.art.get(id);
    if (!el) return;
    const c = center(el, dy);
    fx.burst(type, c.x, c.y, { count, spread: Math.min(200, el.offsetWidth * 0.4) });
  }
  function once(part, fn) {
    if (busy.has(part)) return;
    busy.add(part);
    tween.done(fn()).then(() => busy.delete(part));
  }
  const wiggle = (b, frames, opts) => tween.animate(b, frames, opts);

  const REACT = {
    cafe(el, info) {
      if (entering) return;
      bounce('cafe', 0.22);
      sfx.play('doorbell');
      sparkle('cafe-door', 0.4, 10);
      const door = bodyOf('cafe-door');
      const open = door ? wiggle(door, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.14)' }], { duration: 320, easing: 'ease-out', fill: 'forwards' }) : null;
      if (DOORS.cafe && onEnter) {
        entering = true;
        stats.entered++;
        const p = map.pieces['cafe-door'];
        const at = stage.worldToScreen(p.x + p.w / 2, p.y + p.h * 0.55);
        tween.done(open).then(() => onEnter('cafe', DOORS.cafe, at));
      }
    },
    // P1.15: the Character Maker kiosk: the curtain swishes open and in we go.
    booth() {
      if (entering) return;
      bounce('booth', 0.25);
      sfx.play('whoosh', { gain: 0.7 });
      later(120, () => sfx.play('sparkle'));
      sparkle('booth', 0.2, 8);
      const cur = bodyOf('booth-curtain');
      const open = cur ? wiggle(cur, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.12)' }], { duration: 320, easing: 'ease-out', fill: 'forwards' }) : null;
      if (onEnter) {
        entering = true;
        stats.entered++;
        const p = map.pieces['booth-curtain'];
        const at = stage.worldToScreen(p.x + p.w / 2, p.y + p.h * 0.55);
        tween.done(open).then(() => onEnter('booth', DOORS.booth, at));
      }
    },
    theater() {
      bounce('theater');
      sfx.play('whoosh');
      later(260, () => sfx.play('cheer', { gain: 0.8 }));
      sparkle('theater-curtains', 0.3, 8);
      later(200, () => sparkle('theater', 0.15, 6, 'heart'));
      once('theater-curtains', () => wiggle(bodyOf('theater-curtains'), [
        { transform: 'scale(1, 1)' }, { transform: 'scale(0.88, 1.02) skewX(4deg)', offset: 0.2 },
        { transform: 'scale(1.06, 0.99) skewX(-4deg)', offset: 0.45 }, { transform: 'scale(0.95, 1.01) skewX(2deg)', offset: 0.7 },
        { transform: 'scale(1, 1)' },
      ], { duration: 900, easing: 'ease-in-out' }));
    },
    construction(el, info) {
      if (entering) return;
      bounce('construction', 0.16);
      sfx.play('whistle');
      later(380, () => sfx.play('knock'));
      later(700, () => sfx.play('knock', { gain: 0.8 }));
      sparkle('construction', 0.75, 8, 'puff');
      once('crane-jib', () => wiggle(bodyOf('crane-jib'), [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-7deg)', offset: 0.22 }, { transform: 'rotate(5deg)', offset: 0.48 },
        { transform: 'rotate(-3deg)', offset: 0.72 }, { transform: 'rotate(1.5deg)', offset: 0.88 }, { transform: 'rotate(0deg)' },
      ], { duration: 1300, easing: 'ease-in-out' }));
      // P2c.1: the site is built: the whistle blows and in we go (a tap only;
      // the car's poke(), info null, just plays the reaction).
      if (info && DOORS.construction && onEnter) {
        entering = true;
        stats.entered++;
        const d = doorBox('construction');
        const at = stage.worldToScreen((d.x0 + d.x1) / 2, d.y0 + (d.y1 - d.y0) * 0.55);
        later(420, () => onEnter('construction', DOORS.construction, at));
      }
    },
    school() {
      bounce('school', 0.2);
      sparkle('school-bell', 0.5, 8);
      sfx.play('bell', { gain: 0.9 });
      once('school-bell', () => {
        for (const t of [330, 660]) later(t, () => sfx.play('bell', { gain: 0.9 }));
        return wiggle(bodyOf('school-bell'), [
          { transform: 'rotate(0deg)' }, { transform: 'rotate(30deg)', offset: 0.14 }, { transform: 'rotate(-26deg)', offset: 0.32 },
          { transform: 'rotate(22deg)', offset: 0.5 }, { transform: 'rotate(-14deg)', offset: 0.68 }, { transform: 'rotate(7deg)', offset: 0.84 },
          { transform: 'rotate(0deg)' },
        ], { duration: 1100, easing: 'ease-in-out' });
      });
    },
    bus() {
      sfx.play('squeak');
      later(180, () => sfx.play('squeak'));
      once('bus', () => wiggle(bodyOf('bus'), [
        { transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(0, -16px, 0)', offset: 0.3 },
        { transform: 'translate3d(0, 0, 0) scale(1.04, 0.96)', offset: 0.6 }, { transform: 'translate3d(0, 0, 0)' },
      ], { duration: 520, easing: 'ease-out' }));
      sparkle('bus', 0.4, 5);
    },
    birds() {
      sfx.play('whistle', { gain: 0.6 });
      later(160, () => sfx.play('plink'));
      once('birds', () => wiggle(bodyOf('birds'), [
        { transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(30px, -40px, 0) rotate(-6deg)', offset: 0.35 },
        { transform: 'translate3d(-10px, -16px, 0) rotate(4deg)', offset: 0.7 }, { transform: 'translate3d(0, 0, 0)' },
      ], { duration: 900, easing: 'ease-in-out' }));
    },
    lostfound(el) {
      sfx.play('boing');
      bounce(el.dataset.art, 0.5);
      sparkle(el.dataset.art, 0.3, 5);
    },
    lot(el) {
      sfx.play('knock', { gain: 0.8 });
      const id = el.dataset.art;
      once(id, () => wiggle(bodyOf(id), [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-4deg)', offset: 0.3 }, { transform: 'rotate(3deg)', offset: 0.6 }, { transform: 'rotate(0deg)' },
      ], { duration: 420, easing: 'ease-in-out' }));
      sparkle(id, 0.25, 4);
    },
    sky() {
      stats.toggles++;
      const b = bodyOf(night ? 'moon' : 'sun');
      if (b) tween.squish(b, { amount: 0.8 });
      sfx.play(night ? 'sparkle' : 'chime');
      store.dispatch('mapSet', { night: !night });
      sparkle(night ? 'moon' : 'sun', 0.5, 8);
    },
  };

  function tap(el, info) {
    const id = el.dataset.art;
    const owner = OWNER[id] || OWNER[id.replace(/-\d+$/, '')];
    const fn = owner && REACT[owner];
    if (!fn) return;
    stats.reactions++;
    stats.last = owner;
    fn(el, info);
  }
  for (const el of pieceEls) input.register(el, { onTap: (info) => tap(el, info), pan: true });

  // Back from a location: its door closes behind us.
  if (from === DOORS.cafe) {
    const door = bodyOf('cafe-door');
    if (door) tween.animate(door, [{ transform: 'scaleX(0.14)' }, { transform: 'scaleX(1)' }], { duration: 380, delay: 250, easing: 'ease-out', fill: 'backwards' });
    later(250, () => sfx.play('doorbell', { gain: 0.6 }));
  }

  if (from === DOORS.booth) {
    const cur = bodyOf('booth-curtain');
    if (cur) tween.animate(cur, [{ transform: 'scaleX(0.12)' }, { transform: 'scaleX(1)' }], { duration: 380, delay: 250, easing: 'ease-out', fill: 'backwards' });
    later(250, () => sfx.play('whoosh', { gain: 0.5 }));
  }

  // ---- P1.14: things on the map (the car, whatever was carried here) ----
  // The same entity view and behaviors as a room, on the street.
  let play = null;
  async function attachPlay({ carry = null } = {}) {
    useArtSprites(manifest);
    const catalog = await loadCatalog();
    const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
    const behaviors = createBehaviors({ catalog, store });
    const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech, talk: true });
    const base = chars ? chars.hooks : behaviors;
    const view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: carry ? carry.hooks(base, room) : base });
    behaviors.bind(view, fx);
    if (chars) chars.bind(view, fx);
    play = { catalog, behaviors, chars, view, removeSource };
  }
  const doorBox = (b) => { const p = map.pieces[DOOR_PIECE[b]]; return p ? { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h } : null; };

  return {
    id: CITY_ID, room, fx, stats,
    play: attachPlay,
    get view() { return play && play.view; },
    get chars() { return play && play.chars; },
    get behaviors() { return play && play.behaviors; },
    get catalog() { return play && play.catalog; },
    get night() { return night; },
    /** Each building's front door on the street: [{building, x, location | null}] by x. */
    doors() {
      return BUILDINGS.map((b) => { const d = doorBox(b); return { building: b, x: Math.round((d.x0 + d.x1) / 2), location: DOORS[b] || null }; }).sort((a, b) => a.x - b.x);
    },
    /** The building whose door (or front, lower half) is under screen point (sx, sy), or null. */
    doorAt(sx, sy) {
      const w = stage.screenToWorld(sx, sy);
      for (const b of BUILDINGS) {
        const p = map.pieces[b];
        if (p && w.x >= p.x && w.x <= p.x + p.w && w.y >= p.y + p.h * 0.45 && w.y <= p.y + p.h + 10) return b;
      }
      return null;
    },
    /** A building's tap reaction (the cafe's without going in). */
    poke(building) {
      const el = room.art.get(building);
      if (!el) return;
      if (building === 'cafe') { bounce('cafe', 0.22); sfx.play('doorbell'); sparkle('cafe-door', 0.4, 10); return; }
      tap(el, null);
    },
    /** World point of a building's door (a car parks in front of it). */
    doorWorld(building) { const d = doorBox(building); return d ? { x: (d.x0 + d.x1) / 2, y: d.y0 + (d.y1 - d.y0) * 0.55 } : null; },
    /** Screen point of a piece's center (tests, transitions). */
    screenPoint(id, dy = 0.5) { const el = room.art.get(id); if (!el) return null; const c = center(el, dy); return stage.worldToScreen(c.x, c.y); },
    /** World point where a location's door is (the transition zooms there). */
    doorPoint(location) {
      if (location === DOORS.construction) return this.doorWorld('construction');   // P2c.1
      const piece = location === DOORS.cafe ? 'cafe-door' : location === DOORS.booth ? 'booth-curtain' : null;
      if (!piece) return null;
      const p = map.pieces[piece];
      return { x: p.x + p.w / 2, y: p.y + p.h * 0.55 };
    },
    /** Resolves once what the camera wants is decoded (bounded: never hangs a transition). */
    ready: () => withTimeout(Promise.all(allLoaders.map((l) => l.ready())), READY_TIMEOUT),
    /** The image loaders (tests, docs/perf.md): {day, night, always}. */
    loaders,
    /** Files with a src right now, and their decoded bytes (width x height x 4). */
    loaded: () => allLoaders.flatMap((l) => l.loaded()),
    decodedBytes: () => allLoaders.reduce((n, l) => n + l.bytes(), 0),
    destroy() {
      if (play) { play.view.destroy(); if (play.chars) play.chars.destroy(); play.removeSource(); play = null; }
      unsubscribe();
      swapSeq++;
      // Let the bitmaps go before the next place decodes (town.js).
      for (const l of allLoaders) { l.release(); l.destroy(); }
      for (const el of pieceEls) input.unregister(el);
      fx.clear();
      room.destroy();
    },
  };
}
