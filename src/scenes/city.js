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
// Performance: no per-frame work. Reactions are short WAAPI tweens on
// transform/opacity (tween.js); nothing loops while nobody touches the iPad.

import { mountRoom } from '../engine/room.js';
import { createFx } from '../engine/fx.js';
import * as tween from '../engine/tween.js';
import { sfx } from '../audio/index.js';

export const CITY_ID = 'city';

// What each tappable piece belongs to.
const OWNER = {
  cafe: 'cafe', 'cafe-door': 'cafe',
  theater: 'theater', 'theater-curtains': 'theater',
  construction: 'construction', 'crane-jib': 'construction',
  school: 'school', 'school-bell': 'school', bus: 'bus',
  birds: 'birds', lostfound: 'lostfound', lot: 'lot', sun: 'sky', moon: 'sky',
};
// Built locations: a tap goes in. The rest react ("coming soon").
export const DOORS = { cafe: 'cafe/kitchen' };
export const BUILDINGS = ['cafe', 'theater', 'construction', 'school'];

const later = (ms, fn) => setTimeout(fn, ms);

/** Room definition for the view layer, from the manifest's map entry. Pure. */
export function cityRoom(map, night = false) {
  const img = (v) => `<div class="city-body"><img class="city-day" alt="" draggable="false" decoding="async"${night && v.night ? '' : ` src="${v.file}"`}>`
    + (v.night ? `<img class="city-night" alt="" draggable="false" decoding="async"${night ? ` src="${v.night.file}"` : ''}>` : '') + '</div>';
  const art = [];
  const [back, front] = map.layers;
  art.push({ id: 'back', layer: 'back', x: back.x, y: back.y, w: back.w, h: back.h, cls: 'city-static', html: img(back) });
  for (const [id, p] of Object.entries(map.pieces)) {
    const boxes = p.copies || [[p.x, p.y]];
    boxes.forEach(([x, y], i) => {
      art.push({ id: p.copies ? `${id}-${i}` : id, layer: 'mid', depth: p.depth, x, y, w: p.w, h: p.h, cls: `city-piece city-${id}`, html: img(p) });
    });
  }
  if (front) art.push({ id: 'front', layer: 'mid', depth: 1100, x: front.x, y: front.y, w: front.w, h: front.h, cls: 'city-static', html: img(front) });
  const b = map.backdrop[night ? 'night' : 'day'];
  return { id: CITY_ID, width: map.width, backdrop: b, floor: { top: 700, bottom: 960 }, surfaces: [], art };
}

/** Every image file the map shows in one mode (for preloading). */
export function cityFiles(map, night = false) {
  const files = [];
  for (const v of [...map.layers, ...Object.values(map.pieces)]) files.push(night && v.night ? v.night.file : v.file);
  return files;
}

/**
 * Mount the map. opts: { input, store, manifest, cameraX, onEnter(building,
 * location, {x, y} screen point), from: location we came back from }.
 */
export function mountCity(stage, { input, store, manifest, cameraX = 0, onEnter = null, from = null }) {
  const map = manifest.map;
  let night = !!store.state.map.night;
  const room = mountRoom(stage, Object.assign(cityRoom(map, night), { cameraX }));
  room.el.classList.add('city');
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
  /** Swap every image to the day or night variant. animate: cross-fade. */
  function applyNight(on, animate) {
    const seq = ++swapSeq;
    const jobs = [];
    for (const el of els) {
      const nightImg = el.querySelector('.city-night');
      const dayImg = el.querySelector('.city-day');
      if (!nightImg) continue;
      const show = on ? nightImg : dayImg;
      const want = on ? nightFile(el) : dayFile(el);
      if (want && show.getAttribute('src') !== want) show.setAttribute('src', want);
      jobs.push((show.decode ? show.decode() : Promise.resolve()).catch(() => {}).then(() => ({ nightImg, dayImg })));
    }
    return Promise.all(jobs).then((list) => {
      if (seq !== swapSeq) return;
      for (const { nightImg, dayImg } of list) {
        // The night image sits on top of the day image: fade it in or out.
        nightImg.style.opacity = on ? '1' : '0';
        const drop = () => { if (seq === swapSeq) (on ? dayImg : nightImg).removeAttribute('src'); };
        if (animate) tween.done(tween.animate(nightImg, [{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: 450, easing: 'ease-in-out' })).then(drop);
        else drop();
      }
    });
  }
  // Which file an element shows in each mode (element -> piece id).
  const pieceOf = (el) => { const id = el.dataset.art; return id === 'back' || id === 'front' ? map.layers.find((L) => L.id === id) : map.pieces[id.replace(/-\d+$/, '')] || map.pieces[id]; };
  const dayFile = (el) => pieceOf(el).file;
  const nightFile = (el) => { const p = pieceOf(el); return p.night ? p.night.file : null; };
  for (const el of els) { const n = el.querySelector('.city-night'); if (n) n.style.opacity = night ? '1' : '0'; }
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
    construction() {
      bounce('construction', 0.16);
      sfx.play('whistle');
      later(380, () => sfx.play('knock'));
      later(700, () => sfx.play('knock', { gain: 0.8 }));
      sparkle('construction', 0.75, 8, 'puff');
      once('crane-jib', () => wiggle(bodyOf('crane-jib'), [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-7deg)', offset: 0.22 }, { transform: 'rotate(5deg)', offset: 0.48 },
        { transform: 'rotate(-3deg)', offset: 0.72 }, { transform: 'rotate(1.5deg)', offset: 0.88 }, { transform: 'rotate(0deg)' },
      ], { duration: 1300, easing: 'ease-in-out' }));
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

  return {
    id: CITY_ID, room, fx, stats,
    get night() { return night; },
    /** Screen point of a piece's center (tests, transitions). */
    screenPoint(id, dy = 0.5) { const el = room.art.get(id); if (!el) return null; const c = center(el, dy); return stage.worldToScreen(c.x, c.y); },
    /** World point where a location's door is (the transition zooms there). */
    doorPoint(location) {
      if (location !== DOORS.cafe) return null;
      const p = map.pieces['cafe-door'];
      return { x: p.x + p.w / 2, y: p.y + p.h * 0.55 };
    },
    destroy() {
      unsubscribe();
      swapSeq++;
      for (const el of pieceEls) input.unregister(el);
      fx.clear();
      room.destroy();
    },
  };
}
