// The School (P2d.1, docs/design.md 3.4): Ian rehearses kindergarten here.
// ONE panning strip, 3200 units wide: the arrival (bus stop, front door,
// cubbies, the line-up footprints, the sink and the calm corner), the
// classroom (circle rug, rocking chair, centers, the goldfish, nap cots) and
// lunch + recess (tools/art/rooms/school.mjs, manifest `rooms.school`). The
// city map's school leads here (location 'school/classroom').
//
//   const school = await mountSchool(stage, { input, store, manifest, carry, from });
//
// What it wires (the engine half of P2d.1; the same pattern as site.js and cafe.js):
// - LAYERS in column tiles (engine/tiles.js), decoded only near the camera.
// - CAMERA: flings snap to the zone stops (arrival, classroom, recess). In
//   from the map opens on the arrival; a reload keeps where you were (per iPad).
// - PIECES: every fixture is its own image and answers a tap. The bus honks
//   and opens its door and the kids on it hop off to the kerb (and it drives
//   in when you arrive with kids aboard); the front door opens and shuts; the
//   bell swings ding-dong; the sink tap runs (a character standing at the
//   sink washes its hands: bubbles, a splash, sparkly hands); the light
//   switch dims the classroom (nap time); the goldfish swims to the glass;
//   the teacher's rocking chair rocks (with whoever sits in it). Toggle state
//   is props of one `school-fixtures` entity (room 'school/fixtures').
// - CUBBIES: six invisible `school-cubby` containers over the painted
//   cubbies (container system: a backpack hangs on the hook, a lunchbox sits
//   on the shelf, anything else on the floor, and they stay there). Drag a
//   character's head up to a cubby's label to make it theirs: the label then
//   shows the character's own face (its name tag with zero text).
// - SEATS: the manifest's (bus seats, beanbag, rug spots = criss-cross,
//   rocking chair, chairs, lunch benches...) plus the seven LINE-UP
//   footprints (stand, snapped onto the spot; tap the leader and the line
//   marches in place to a drum) and a lying seat on every nap cot (a
//   character on a cot lies down, sleepy, with drifting z's). On the beanbag
//   (the calm corner) a character relaxes with a calm face; each rug spot
//   plays its note and a full rug plays a little tune.
// - FEELINGS CHART: tap a face: the nearest character takes that face and
//   the voice names the feeling (a sound instead when the voice is off).
// - PICTURE SCHEDULE: tap a card: it bounces and says what it is (purely
//   optional play, never enforced).
// - GOLDFISH: tap it and it swims to the glass; drop fish food (or any snack)
//   on the bowl and it is fed (a happy bubble face).
// - THE TEACHING WALL (P2d.2, school-board.js): the letter wall (name, sound,
//   word + picture; drag out letter magnets that spell words on the
//   whiteboard rows), the sight-word board (the classroom's one reading
//   layer), the calendar (today's star, the day out loud) and weather slot
//   (the window follows, rain/snow falls briefly), the teacher's picture cards.
// - Everything else painted that looks tappable (the easel and whiteboard,
//   the swings, seesaw and sand) gets the fallback reaction for now:
//   P2d.3-P2d.4 bring them alive.
// - FIRST VISIT: Ms. Noor in the rocking chair (with her lanyard), three kids
//   on the bus (two with backpacks), Maya on the rug with her own cubby,
//   backpacks on hooks, a lunchbox in a cubby, the stock and a few things.
//
// Idle: nothing runs while nobody touches it (every reaction is a short
// WAAPI tween or a tracked timeout; the z's are a burst, not a loop).

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { inRoom, getEntity, childrenOf } from '../engine/world.js';
import { settle, ON_EPS, EDGE_TOL } from '../engine/surfaces.js';
import { createTileLoader } from '../engine/tiles.js';
import { sfx, speech, isSpeechOn } from '../audio/index.js';
import { addSpriteSource, spriteFor } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { useArtSprites } from './art.js';
import { mountCharacters, seedCharacters, CHAR_KIND } from '../engine/characters.js';
import { partsOf, specOf, appearanceKey, normalizeSeats } from '../engine/char-model.js';
import { renderCharacter, svgWrap } from '../engine/rig-svg.js';
import { textLabels } from './kitchen.js';
import * as tween from '../engine/tween.js';
import { createSchoolBoard } from './school-board.js';

export const SCHOOL_ID = 'school/classroom';
export const FIXTURES_KIND = 'school-fixtures';
export const FIXTURES_ROOM = 'school/fixtures';
export const CUBBY_KIND = 'school-cubby';
export const FISHBOWL_KIND = 'school-fishbowl';
export const CAM_KEY = 'ourtown.schoolCam';
export const ARRIVE_ZONE = 'arrival';
export const COT_SEAT = 'nap-cot:';        // a cot's lying seat id prefix (normalizeSeats: "nap..." = lie)
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// The room definition (pure)

/** Sort depth of a manifest layer (back-layer things sort at the floor top). Pure. */
export function depthFor(m) {
  const floorTop = m.floor.y0;
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  return (layer) => (layer === 'back' ? floorTop : baseline[layer]);
}

/** The line-up footprints as standing seats (snap onto the spot). Pure. */
export function lineSeats(m) {
  const spots = (m.rigs && m.rigs.line && m.rigs.line.spots) || [];
  return spots.map((at, i) => ({ id: `line-${i + 1}`, x: at[0], y: at[1], depth: at[1], pose: 'stand', half: 26 }));
}

// Painted things that answer a tap without being pieces: [id, box, layer].
// feeling-* and schedule-* do something now; the rest get the fallback (P2d.2-3).
export function hitAreas(m) {
  const out = [];
  const slot = Object.fromEntries((m.slots || []).map((s) => [s.id, s]));
  const rigs = m.rigs || {};
  for (const f of rigs.feelings || []) out.push({ id: 'feeling-' + f.id, box: [f.at[0] - f.r, f.at[1] - f.r, f.r * 2, f.r * 2], layer: 'back' });
  for (const c of rigs.schedule || []) out.push({ id: 'schedule-' + c.id, box: c.box, layer: 'back' });
  for (const L of rigs.letters || []) out.push({ id: 'letter-' + L.ch, box: L.box, layer: 'back' });
  const cards = (rigs.sightWords && rigs.sightWords.cards) || [];
  cards.forEach((b, i) => out.push({ id: 'sight-' + i, box: b, layer: 'back' }));
  // P2d.2: the round turn button under the sight-word board (the other 8 words).
  if (cards.length) {
    const x0 = Math.min(...cards.map((b) => b[0])), x1 = Math.max(...cards.map((b) => b[0] + b[2])), y1 = Math.max(...cards.map((b) => b[1] + b[3]));
    out.push({ id: 'sight-flip', box: [r1((x0 + x1) / 2 - 22), r1(y1 + 16), 44, 44], layer: 'back' });
  }
  const cal = rigs.calendar;
  if (cal && cal.monthDots && cal.monthDots.length) {
    const xs = cal.monthDots.map((p) => p[0]), ys = cal.monthDots.map((p) => p[1]).concat((cal.weekDots || []).map((p) => p[1]));
    const x0 = Math.min(...xs) - 12, y0 = Math.min(...ys) - 12;
    out.push({ id: 'calendar', box: [x0, y0, Math.max(...xs) + 12 - x0, Math.max(...ys) + 12 - y0], layer: 'back' });
  }
  if (slot.easel && slot.easel.box) out.push({ id: 'easel', box: slot.easel.box, layer: 'mid', later: 'P2d.3' });
  if (slot.whiteboard && slot.whiteboard.box) out.push({ id: 'whiteboard', box: slot.whiteboard.box, layer: 'back', later: 'P2d.3' });
  return out;
}

/** P2d.2: letter magnets stick on two rows across the whiteboard (surfaces over the board). Pure. */
export function whiteboardRows(m) {
  const b = m.rigs && m.rigs.canvases && m.rigs.canvases.whiteboard;
  if (!b) return [];
  const [x, y, w, h] = b;
  return [0.36, 0.71].map((f, i) => ({ id: `wb-row-${i + 1}`, layer: 'back', x0: r1(x + 8), x1: r1(x + w - 8), y: r1(y + h * f) }));
}

/** The view-layer room definition for the school strip. Pure. opts.tiled: layers as tiles (default). */
export function schoolRoom(m, { tiled = true, cameraX = 0 } = {}) {
  const floorTop = m.floor.y0;
  const depthOf = depthFor(m);
  const counter = (m.layers.find((L) => L.id === 'counter') || { baseline: 728 }).baseline;
  const mid = (m.layers.find((L) => L.id === 'mid') || { baseline: 903 }).baseline;
  const img = (src) => `<img${src ? ` src="${src}"` : ''} alt="" draggable="false" decoding="async">`;
  const art = [];
  const tiles = [];
  for (const L of m.layers) {
    const layer = L.id === 'back' ? 'back' : 'mid';
    const depth = L.id === 'back' ? undefined : L.baseline;
    if (tiled && L.tiles && L.tiles.length) {
      L.tiles.forEach((t, i) => {
        const id = `${L.id}-${i}`;
        art.push({ id, layer, depth, x: t.x, y: t.y, w: t.w, h: t.h, cls: 'art-img art-tile', html: img(null) });
        tiles.push({ id, file: t.file, x: t.x, w: t.w, px: t.px });
      });
    } else {
      art.push({ id: L.id, layer, depth, x: L.x, y: L.y, w: L.w, h: L.h, cls: 'art-img', html: img(L.file) });
    }
    for (const [pid, p] of Object.entries(m.pieces || {})) {
      if (p.layer !== L.id) continue;
      const o = p.pivot ? [p.pivot[0] - p.x, p.pivot[1] - p.y] : [p.w / 2, p.h];
      art.push({
        id: `piece:${pid}`, layer, depth, x: p.x, y: p.y, w: p.w, h: p.h, cls: 'art-piece',
        html: `<div class="piece-body" style="transform-origin:${Math.round(o[0])}px ${Math.round(o[1])}px">${img(null)}</div>`,
      });
    }
    // The cubby labels' face overlays draw right after the counter layer (over the painted animal).
    if (L.id === 'counter') {
      for (const s of m.slots || []) {
        if (s.kind !== 'label' || !s.box) continue;
        const [x, y, w, h] = s.box;
        art.push({
          id: `face:${s.id}`, layer: 'mid', depth: counter, x: x - 2, y: y - 2, w: w + 4, h: h + 4, cls: 'school-face',
          html: '<div class="school-face-body" style="position:absolute;inset:0;transform-origin:50% 50%;visibility:hidden"></div>',
        });
      }
    }
  }
  // Invisible tap areas over painted things (above their layer's art).
  for (const a of hitAreas(m)) {
    const [x, y, w, h] = a.box;
    art.push({ id: `hit:${a.id}`, layer: a.layer === 'mid' ? 'mid' : 'back', depth: a.layer === 'mid' ? mid : undefined, x, y, w, h, cls: 'school-hit', html: '' });
  }
  // Nap time: the classroom dims (front layer, never takes a touch).
  const lights = (m.slots || []).find((s) => s.id === 'lights');
  if (lights && lights.box) {
    const [x, y, w, h] = lights.box;
    art.push({ id: 'dim', layer: 'front', x, y, w, h, cls: 'school-dim', html: '<div style="position:absolute;inset:0;background:rgba(36,40,86,0.34);pointer-events:none"></div>' });
  }
  const seats = (m.seats || []).map((s) => ({ id: s.id, x: s.at[0], y: s.at[1], depth: depthOf(s.layer) }))
    .concat(lineSeats(m));
  return {
    id: SCHOOL_ID,
    width: m.width,
    cameraX,
    cameraStops: (m.zones || []).map((z) => z.camera),
    backdrop: { top: '#CDE6EE', bottom: '#EFD9B8', horizon: floorTop },
    floor: { top: floorTop, bottom: m.floor.y1, x0: 0, x1: m.width, sound: 'thud' },
    surfaces: m.surfaces.concat(whiteboardRows(m)).map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, y: s.y, depth: depthOf(s.layer), sound: /cubby/.test(s.id) ? 'tap' : /^wb-row/.test(s.id) ? 'clack' : 'knock' })),
    seats,
    art,
    tiles,
  };
}

/** The camera x of a zone stop. */
export function zoneCamera(m, id) {
  const z = (m.zones || []).find((q) => q.id === id);
  return z ? z.camera : 0;
}

// ---------------------------------------------------------------------------
// Pieces: what a tap does (pure data)

// toggle: [a, b] a tap flips between (world state, fixtures props), sound per
// new state; the others name what they do; `later` = fallback until that bead.
export const PIECES = {
  'front-door': { toggle: ['closed', 'open'], sound: { open: ['squeak', { pitch: 0.75 }], closed: ['thud', { pitch: 0.9 }] }, fx: { open: 'sparkle', closed: 'puff' } },
  'bus-door': { toggle: ['closed', 'open'], sound: { open: ['whoosh', { pitch: 1.5, gain: 0.8 }], closed: ['thud', { pitch: 1.2 }] }, fx: { open: 'puff' } },
  'sink-tap': { toggle: ['off', 'on'], sound: { on: ['splash'], off: ['squeak', { pitch: 1.4 }] }, fx: { on: 'drop' } },
  'light-switch': { toggle: ['on', 'off'], sound: { off: ['clunk', { pitch: 1.1 }], on: ['clunk', { pitch: 1.3 }] }, fx: { on: 'sparkle' } },
  'school-bell': { bell: true },
  bus: { bus: true },
  'bus-inside': { bus: true },
  'fish-bowl': { fish: true },
  'rocking-chair': { rock: true },
  'weather-today': { board: true },   // P2d.2 (school-board.js): cycle the weather
  'class-window': { board: true },    // rain / snow falls again, the kids look
  'swing-1-chains': { later: 'P2d.4', sound: ['squeak', { pitch: 0.8 }] },
  'swing-1-seat': { later: 'P2d.4', sound: ['squeak', { pitch: 0.9 }] },
  'swing-2-chains': { later: 'P2d.4', sound: ['squeak', { pitch: 0.8 }] },
  'swing-2-seat': { later: 'P2d.4', sound: ['squeak', { pitch: 0.9 }] },
  seesaw: { later: 'P2d.4', sound: ['knock', { pitch: 0.8 }] },
  sand: { later: 'P2d.4', sound: ['squish', { pitch: 0.8 }], react: 'squish', fx: 'puff' },
};

/** The state of a piece (its manifest default when unset). Pure. */
export function pieceState(id, props, pieces) {
  const p = pieces[id];
  if (!p) return null;
  const v = props && props[id];
  return typeof v === 'string' && p.variants[v] ? v : p.default;
}

/** The state a tap flips a toggle piece to (null for a non-toggle). Pure. */
export function nextToggle(id, cur) {
  const t = (PIECES[id] || {}).toggle;
  if (!t) return null;
  return cur === t[1] ? t[0] : t[1];
}

// ---------------------------------------------------------------------------
// Feelings, cubbies, the rug (pure)

// The chart's five faces: the expression a character takes and the word the voice says.
export const FEELINGS = {
  happy: { expr: 'happy', word: 'happy!', sound: ['giggle'], fx: 'sparkle' },
  sad: { expr: 'sad', word: 'sad', sound: ['chime', { pitch: 0.8 }], fx: 'heart' },          // a comforting heart, no judgment
  mad: { expr: 'grumpy', word: 'mad', sound: ['bonk', { pitch: 0.8 }], fx: 'puff' },
  scared: { expr: { eyes: 'wide', brows: 'worried', mouth: 'wobble', extras: 'sweat' }, word: 'worried', sound: ['squeak', { pitch: 0.7 }], fx: 'heart' },
  calm: { expr: { eyes: 'content', brows: 'none', mouth: 'smile', extras: 'blush' }, word: 'calm', sound: ['chime', { pitch: 1.2, gain: 0.7 }], fx: 'bubble' },
};
// A character on the beanbag (the calm corner) relaxes: eyes closed, a soft smile.
export const CALM_EXPR = { eyes: 'closed', brows: 'none', mouth: 'smile', extras: 'blush' };

/** Which cubby (0-based) a character's head at (x, y) is up against, or -1. Pure. */
export function cubbyAt(cubbies, x, y) {
  if (!cubbies || !cubbies.length) return -1;
  const xs = cubbies.map((c) => c.label[0]);
  const half = (xs.length > 1 ? (xs[1] - xs[0]) : 49) / 2;
  if (x < xs[0] - half - 12 || x > xs[xs.length - 1] + half + 12) return -1;
  const top = Math.min(...cubbies.map((c) => c.label[1])) - 70;
  const bottom = Math.max(...cubbies.map((c) => c.hook[1])) + 20;
  if (y < top || y > bottom) return -1;
  let best = -1, bd = Infinity;
  cubbies.forEach((c, i) => { const d = Math.abs(c.label[0] - x); if (d < bd) { bd = d; best = i; } });
  return best;
}

/**
 * Where the things in a cubby go: Map id -> 'hook' | 'shelf' | 'floor'. A
 * bag hangs on the hook, a lunchbox (or lunch) sits on the shelf, anything
 * else takes the shelf, then the floor, then the hook; extras pile on the
 * floor. Deterministic (by id). Pure. isBag / isLunch: (entity) -> bool.
 */
export function cubbySpots(kids, { isBag, isLunch }) {
  const out = new Map();
  const free = new Set(['hook', 'shelf', 'floor']);
  const list = kids.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const take = (k, spot) => { if (!out.has(k.id) && free.has(spot)) { free.delete(spot); out.set(k.id, spot); } };
  for (const k of list) if (isBag(k)) take(k, 'hook');
  for (const k of list) if (isLunch(k)) take(k, 'shelf');
  for (const k of list) for (const s of ['shelf', 'floor', 'hook']) take(k, s);
  for (const k of list) if (!out.has(k.id)) out.set(k.id, 'floor');
  return out;
}

/** The rug spot index (0-based) of a seat id, or -1. Pure. */
export const rugIndex = (seat) => (typeof seat === 'string' && /^rug-\d+$/.test(seat) ? Number(seat.slice(4)) - 1 : -1);

/** The kerb spots kids hop off the bus to (world feet points): in front of the bus, by the door. */
export const KERB = [[380, 936], [500, 962], [620, 938], [735, 962]];

// ---------------------------------------------------------------------------
// First visit (pure data)

// Invisible hot spots over painted stock: [kind, feet x, feet y].
export const HOTSPOTS = [
  ['school-art-caddy', 1421, 592.2],
  ['school-block-bin', 1366.4, 663], ['school-toy-bin', 1461.6, 663],
  ['school-crayon-bin', 1366.4, 719], ['school-plush-bin', 1461.6, 719],
  ['school-books', 2005.5, 704],
  ['school-weather-cards', 1288, 483],
  ['school-cots', 2131.5, 722],
  ['school-lunch', 2320.5, 560],
  ['school-recess-bin', 2453.5, 716],
];
// Visible stock: [kind, surface, x, props].
export const STOCK = [
  ['school-paint', 'easel-tray', 1190, { color: 'red' }], ['school-paint', 'easel-tray', 1218, { color: 'yellow' }],
  ['school-paint', 'easel-tray', 1246, { color: 'blue' }], ['school-paint', 'easel-tray', 1274, { color: 'green' }],
  ['school-marker', 'whiteboard-tray', 1690, { color: 'blue' }], ['school-marker', 'whiteboard-tray', 1745, { color: 'red' }],
];
// Loose things: [kind, surface id or null, x, floor y, props].
export const SCHOOL_ITEMS = [
  ['stamp', 'whiteboard-tray', 1812],
  ['globe', 'book-shelf', 2052], ['fish-food', 'book-shelf', 1944, null, { flavor: 'herbs' }],
  ['hand-bell', 'block-shelf', 1494],
  ['picture-book', 'cubby-top', 682],
  ['crayon-box', 'kid-table', 1362], ['paper-sheet', 'kid-table', 1440, null, { look: 'drawing' }], ['crayon', 'kid-table', 1505, null, { color: 'blue' }],
  ['nap-blanket', 'cot-stack', 2124],
  ['plush-bunny', null, 1150, 792],
];
// Backpack colours (manifest wear colours) and what starts in the cubbies: [cubby (0-based), kind, props].
export const CUBBY_ITEMS = [
  [0, 'school-backpack', { color: 'teal' }],
  [3, 'school-backpack', { color: 'sage' }],
  [1, 'school-lunchbox', {}],
];
export const SCHOOL_CAST = [
  { cast: 'teacher', seat: 'rocking-chair' },
  { cast: 'girl9', seat: 'rug-2' },
  { cast: 'boy5', seat: 'bus-seat-1' },
  { cast: 'girl5', seat: 'bus-seat-2' },
  { cast: 'boy9', seat: 'bus-seat-3' },
];
// Worn things: [cast index, kind, slot, colour name].
export const SCHOOL_CAST_WEAR = [
  [0, 'lanyard', 'wear-over', null],
  [3, 'school-backpack', 'wear-back', 'rose'],     // Priya
  [4, 'school-backpack', 'wear-back', 'butter'],   // Kenji (Leo keeps his towel cape on his back)
];
// Maya (SCHOOL_CAST[1]) already has cubby 1 (her face on its label).
export const SCHOOL_OWNERS = [[1, 0]];

// ---------------------------------------------------------------------------
// Runtime

function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem() {} }; }
}
function loadCam(storage) {
  try { const v = Number(JSON.parse(storage.getItem(CAM_KEY) || 'null')); return isFinite(v) ? v : null; } catch { return null; }
}

/** The fixtures entity (lowest id wins if two iPads made one each), or null. */
export function fixturesOf(state) {
  let best = null;
  for (const id of Object.keys(state.entities)) {
    const e = state.entities[id];
    if (e.kind === FIXTURES_KIND && getEntity(state, id) && (!best || id < best.id)) best = e;
  }
  return best;
}

/** The cubby containers in the room: index -> entity (the lowest id per index). */
export function cubbiesOf(state) {
  const out = [];
  for (const e of inRoom(state, SCHOOL_ID)) {
    if (e.kind !== CUBBY_KIND || e.parent) continue;
    const i = e.props && Number.isInteger(e.props.cubby) ? e.props.cubby : -1;
    if (i < 0) continue;
    if (!out[i] || e.id < out[i].id) out[i] = e;
  }
  return out;
}

/** Spawn the cubby containers and the fish bowl if missing (every mount, so older saves get them). */
export function ensureFixtures(store, m) {
  const cubbies = (m.rigs && m.rigs.cubbies) || [];
  const have = cubbiesOf(store.state);
  const surf = (id) => m.surfaces.find((s) => s.id === id);
  cubbies.forEach((c, i) => {
    if (have[i]) return;
    const floor = surf(c.floor);
    const x = floor ? (floor.x0 + floor.x1) / 2 : c.label[0];
    store.dispatch('spawn', { id: store.newId(), kind: CUBBY_KIND, room: SCHOOL_ID, x: r1(x), y: floor ? floor.y : 716.8, z: 0, props: { cubby: i } });
  });
  if (!inRoom(store.state, SCHOOL_ID).some((e) => e.kind === FISHBOWL_KIND)) {
    const s = (m.slots || []).find((q) => q.id === 'fish-bowl');
    const shelf = surf('book-shelf');
    if (s && s.box) store.dispatch('spawn', { id: store.newId(), kind: FISHBOWL_KIND, room: SCHOOL_ID, x: r1(s.box[0] + s.box[2] / 2), y: shelf ? shelf.y : r1(s.box[1] + s.box[3]), z: 5 });
  }
}

/** Spawn the first-visit things (store ops). room: the normalized room def. */
export function seedSchool(store, room, { catalog = null, manifest = null, cubbies = [] } = {}) {
  const surf = (id) => room.surfaces.find((s) => s.id === id);
  const spawn = (kind, x, y, z = 0, props) => store.dispatch('spawn', { id: store.newId(), kind, room: room.id, x: r1(x), y: r1(y), z, ...(props ? { props } : {}) });
  for (const [kind, x, y] of HOTSPOTS) spawn(kind, x, y);
  STOCK.forEach(([kind, sid, x, props], i) => { const s = surf(sid); if (s) spawn(kind, x, s.y, i % 4, props); });
  for (const [kind, on, x, fy, props] of SCHOOL_ITEMS) {
    const s = on && surf(on);
    const w = catalog && catalog.has(kind) ? catalog.sprite(kind).w : spriteFor(kind).w;
    const r = s ? { x, y: s.y } : settle(room, { x, y: fy, halfW: w / 2 });
    spawn(kind, r.x, r.y, 0, props || undefined);
  }
  for (const [i, kind, props] of CUBBY_ITEMS) {
    const c = cubbies[i];
    if (!c) continue;
    store.dispatch('spawn', { id: store.newId(), kind, parent: c.id, slot: 's' + childrenOf(store.state, c.id).length, props: wearProps(manifest, kind, props) });
  }
}

/** A thing's props with its wear colours for a colour name (a backpack's straps match its bag). */
export function wearProps(manifest, kind, props = {}) {
  const wear = manifest && manifest.props && manifest.props[kind] && manifest.props[kind].wear;
  const colors = wear && wear.colors && props.color && wear.colors[props.color];
  return colors ? Object.assign({}, props, { colors }) : Object.assign({}, props);
}

/**
 * Mount the school. opts: { input, store, manifest, carry (P1.14), from (the
 * place we came from, null on boot), storage (tests) }. Resolves once it is up.
 */
export async function mountSchool(stage, { input, store, manifest, carry = null, from = null, storage = safeStorage() }) {
  const m = manifest.rooms.school;
  const S = manifest.school || {};
  const R = m.rigs || {};
  useArtSprites(manifest);
  const catalog = await loadCatalog();
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const tiled = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tiles') === '0');
  const saved = from ? null : loadCam(storage);
  const cameraX = saved != null ? saved : zoneCamera(m, ARRIVE_ZONE);
  const def = schoolRoom(m, { tiled, cameraX });
  const room = mountRoom(stage, def);
  const fx = createFx(room.fxLayer);
  // The face labels and the nap-time dimmer never take a touch.
  for (const el of room.art.values()) if (el.classList.contains('school-dim') || el.classList.contains('school-face')) el.style.pointerEvents = 'none';
  const baseSurfaces = room.def.surfaces.slice();
  const counterKey = (m.layers.find((L) => L.id === 'counter') || { baseline: 728 }).baseline + 0.5;

  // ---- tiles ----
  const tiles = createTileLoader({
    stage,
    tiles: def.tiles.map((t) => ({ ...t, img: room.art.get(t.id).querySelector('img') })),
  });
  tiles.update();

  // ---- the fixtures entity ----
  let firstVisit = !fixturesOf(store.state);
  if (firstVisit) store.dispatch('spawn', { id: store.newId(), kind: FIXTURES_KIND, room: FIXTURES_ROOM, x: 0, y: 0, props: {} });
  const fixtures = () => fixturesOf(store.state);
  const fprops = () => { const f = fixtures(); return f ? f.props : {}; };
  const state = (pid) => pieceState(pid, fprops(), m.pieces);
  const setFix = (key, value) => { const f = fixtures(); if (f && JSON.stringify(f.props[key] === undefined ? null : f.props[key]) !== JSON.stringify(value)) store.dispatch('set', { id: f.id, path: 'props.' + key, value }); };

  // ---- behaviors, characters, view ----
  const behaviors = createBehaviors({ catalog, store });
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
  const base0 = chars ? chars.hooks : behaviors;
  const base = carry ? carry.hooks(base0, room) : base0;
  const rig = chars ? chars.rig : null;

  const stats = { taps: {}, hits: {}, swaps: 0, hops: 0, washes: 0, feelings: 0, lastFeeling: '', said: [], assigns: 0, notes: 0, tunes: 0, rocks: 0, feeds: 0, swims: 0, marches: 0, naps: 0, calm: 0, rings: 0, fallbacks: 0, faces: 0, arrivals: 0 };
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let view = null;
  const viewOf = (id) => (view ? view.viewOf(id) : null);
  const isChar = (e) => !!e && e.kind === CHAR_KIND;

  const hotSprites = new Map();
  const hotSprite = (kind) => {
    let s = hotSprites.get(kind);
    if (!s) {
      const k = catalog.get(kind);
      s = { key: 'hot:' + kind, draw: 'custom', w: k.size[0], h: k.size[1], sound: 'pop', paint: (body) => { body.textContent = ''; } };
      hotSprites.set(kind, s);
    }
    return s;
  };

  // ---- cubbies ----
  const CUB = R.cubbies || [];
  const cubbyIndex = (e) => (e && e.kind === CUBBY_KIND && e.props && Number.isInteger(e.props.cubby) ? e.props.cubby : -1);
  const isBag = (k) => catalog.hasTag(k.kind, 'bag');
  const isLunch = (k) => catalog.hasTag(k.kind, 'lunchbox') || catalog.hasTag(k.kind, 'lunch');
  const BAG_SCALE = 0.78, SHELF_SCALE = 0.62, FLOOR_SCALE = 0.55;
  function cubbyLayout(parent, kids) {
    const i = cubbyIndex(parent);
    const c = CUB[i];
    const out = new Map();
    if (!c) return out;
    const spots = cubbySpots(kids, { isBag, isLunch });
    const floorS = m.surfaces.find((s) => s.id === c.floor);
    const shelfS = m.surfaces.find((s) => s.id === c.shelf);
    const fy = floorS ? floorS.y : parent.y;
    let extra = 0;
    for (const k of kids) {
      const spot = spots.get(k.id);
      const sp = catalog.sprite(k.kind, k.props);
      const man = catalog.get(k.kind) && catalog.get(k.kind).art ? manifest.props[catalog.get(k.kind).art.sprite] : null;
      if (spot === 'hook') {
        const g = (man && man.grip) || [0, -sp.h * 0.85];
        out.set(k.id, { x: r1(c.hook[0] - parent.x - g[0] * BAG_SCALE), y: r1(c.hook[1] - fy - g[1] * BAG_SCALE), z: 2, scale: BAG_SCALE, front: true, hidden: false });
      } else if (spot === 'shelf') {
        out.set(k.id, { x: 0, y: r1((shelfS ? shelfS.y : fy - 164) - fy), z: 1, scale: SHELF_SCALE, front: true, hidden: false });
      } else {
        out.set(k.id, { x: r1(extra * 6), y: 0, z: 3 + extra, scale: FLOOR_SCALE, front: true, hidden: false });
        extra++;
      }
    }
    return out;
  }

  // Face labels: the owner's own face over the painted animal.
  const faceEls = CUB.map((_, i) => room.art.get(`face:label-${i + 1}`)).map((el) => (el ? { el, body: el.firstChild, key: '' } : null));
  const faceCache = new Map();
  function portrait(e) {
    if (!rig) return '';
    const kids = childrenOf(store.state, e.id);
    const { worn } = partsOf(kids, rig);
    const spec = specOf(e.props, worn);
    const key = appearanceKey(e.props) + Object.keys(worn).sort().map((k) => k + ':' + worn[k].kind + JSON.stringify(worn[k].props.colors || null)).join(',');
    let url = faceCache.get(key);
    if (!url) {
      const res = renderCharacter(rig, spec, { pose: 'stand', expr: 'happy', shadow: false, held: {} });
      const h = rig.bodies[spec.body].skeleton.height;
      const vb = [-h * 0.3, -h * 1.06, h * 0.6, h * 0.6].map(Math.round);
      const svg = svgWrap(rig, res, { viewBox: vb, clip: true, scale: 80 / vb[2] });
      url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      faceCache.set(key, url);
      stats.faces++;
    }
    return { key, url };
  }
  const ownerOf = (i) => { const id = fprops()['cubby-' + (i + 1)]; const e = typeof id === 'string' ? getEntity(store.state, id) : null; return isChar(e) ? e : null; };
  function renderFaces() {
    faceEls.forEach((f, i) => {
      if (!f) return;
      const e = ownerOf(i);
      const p = e ? portrait(e) : null;
      const key = p ? e.id + '|' + p.key : '';
      if (key === f.key) return;
      f.key = key;
      f.el.dataset.owner = e ? e.id : '';
      if (!p) { f.body.style.visibility = 'hidden'; f.body.innerHTML = ''; return; }
      f.body.innerHTML = '<div style="position:absolute;inset:0;border-radius:50%;background:#FFFDF6;border:2.5px solid #3D2C29;box-sizing:border-box;overflow:hidden">'
        + `<img alt="" draggable="false" src="${p.url}" style="position:absolute;left:0;top:0;width:100%;height:100%"></div>`
        + '<div class="school-face-glow" style="position:absolute;inset:-7px;border-radius:50%;border:4px solid #F2C75C;box-sizing:border-box;opacity:0"></div>';
      f.body.style.visibility = '';
    });
  }
  let glowOn = -1;
  function glowCubby(i) {
    if (i === glowOn) return;
    const set = (k, on) => {
      const f = faceEls[k];
      if (!f) return;
      if (!f.glow) {
        f.glow = document.createElement('div');
        f.glow.style.cssText = 'position:absolute;inset:-6px;border-radius:50%;border:4px solid #F2C75C;box-sizing:border-box;opacity:0;pointer-events:none';
        f.el.appendChild(f.glow);
      }
      f.glow.style.opacity = on ? '1' : '0';
    };
    if (glowOn >= 0) set(glowOn, false);
    glowOn = i;
    if (i >= 0) set(i, true);
  }
  function assignCubby(i, charId) {
    const f = fixtures();
    if (!f) return;
    // One cubby each: a character moving cubbies leaves the old one.
    CUB.forEach((_, k) => { if (k !== i && f.props['cubby-' + (k + 1)] === charId) setFix('cubby-' + (k + 1), null); });
    setFix('cubby-' + (i + 1), charId);
    stats.assigns++;
    renderFaces();
    const fe = faceEls[i];
    if (fe) tween.animate(fe.body, [
      { transform: 'scale(1)' }, { transform: 'scale(1.45)', offset: 0.3 }, { transform: 'scale(0.9)', offset: 0.6 }, { transform: 'scale(1)' },
    ], { duration: 560, easing: 'ease-out' });
    view.play('chime', { pitch: 1 + i * 0.06 });
    later(140, () => view.play('sparkle', { gain: 0.6 }));
    const c = CUB[i];
    fx.burst('sparkle', c.label[0], c.label[1], { count: 8, spread: 70 });
    if (chars) chars.face(charId, [['laughing', 700], ['happy', 600]]);
  }
  const nearestCubby = (x) => { let best = -1, bd = Infinity; CUB.forEach((c, i) => { const d = Math.abs(c.label[0] - x); if (d < bd) { bd = d; best = i; } }); return best; };
  function overCubbies(item) {
    const v = viewOf(item.id);
    if (!v || !CUB.length) return false;
    const cy = v.y - (v.sprite.h * v.scale) / 2;
    const x0 = CUB[0].label[0] - 26, x1 = CUB[CUB.length - 1].label[0] + 26;
    const floor = m.surfaces.find((s) => s.id === CUB[0].floor);
    return v.x >= x0 && v.x <= x1 && cy >= CUB[0].label[1] - 30 && cy <= (floor ? floor.y : 717);
  }
  function tapCubby(e) {
    const i = cubbyIndex(e);
    const c = CUB[i];
    if (!c) return;
    view.play('chime', { pitch: 1 + i * 0.06, gain: 0.8 });
    const fe = faceEls[i];
    if (fe && fe.key) tween.squish(fe.body, { amount: 0.8 });
    fx.burst('sparkle', c.label[0], c.label[1] + 40, { count: 4, spread: 50 });
    const owner = ownerOf(i);
    if (owner && chars) chars.face(owner.id, [['happy', 800]]);
  }

  // ---- nap cots: every cot is a lying seat ----
  const cotSeats = () => (chars ? chars.seats : []);
  let cotKey = null;
  function applyCots() {
    if (!chars) return;
    const cots = inRoom(store.state, SCHOOL_ID).filter((e) => e.kind === 'nap-cot' && !e.parent);
    const key = cots.map((e) => `${e.id}@${e.x},${e.y}`).join(';');
    if (key === cotKey) return;
    cotKey = key;
    const list = cotSeats();
    for (let k = list.length - 1; k >= 0; k--) if (list[k].id.indexOf(COT_SEAT) === 0) list.splice(k, 1);
    for (const e of cots) {
      const man = manifest.props['nap-cot'];
      const top = man && man.surface ? man.surface[2] : -21;
      list.push(...normalizeSeats([{ id: COT_SEAT + e.id, x: e.x, y: r1(e.y + top), depth: e.y, lie: true, half: 80 }]));
    }
  }

  // ---- pieces ----
  const pieces = new Map();
  for (const pid of Object.keys(m.pieces || {})) {
    const el = room.art.get('piece:' + pid);
    if (!el) continue;
    el.dataset.piece = pid;
    pieces.set(pid, { el, body: el.firstChild, img: el.querySelector('img'), shown: null, gen: 0 });
    input.register(el, { onTap: () => tapPiece(pid), pan: true });
  }
  // Tap areas over painted things (the letters' handlers come from the board: a drag pulls out a magnet).
  let board = null;
  const board0 = (id) => (id.indexOf('letter-') === 0 ? {
    pan: false,
    onTap: (info) => tapHit(id, info),
    onDragStart: (info) => (board ? board.letterHandlers(id).onDragStart(info) : false),
    onDragMove: (info) => { if (board) board.letterHandlers(id).onDragMove(info); },
    onDragEnd: (info) => { if (board) board.letterHandlers(id).onDragEnd(info); },
  } : null);
  const hits = new Map();
  for (const a of hitAreas(m)) {
    const el = room.art.get('hit:' + a.id);
    if (!el) continue;
    el.dataset.hit = a.id;
    hits.set(a.id, { el, a });
    input.register(el, (board0 && board0(a.id)) || { onTap: (info) => tapHit(a.id, info), pan: true });
  }

  const hooks = Object.assign({}, base, {
    spriteOf: (e) => (catalog.hasTag(e.kind, 'hotspot') ? hotSprite(e.kind) : (board && board.spriteOf(e)) || (base.spriteOf ? base.spriteOf(e) : null)),
    sortKeyOf(e) {
      const k = base.sortKeyOf ? base.sortKeyOf(e) : null;
      if (k != null || !catalog.hasTag(e.kind, 'hotspot')) return k;
      return baseSurfaces.some((s) => Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL) ? null : Math.max(e.y, counterKey);
    },
    layoutOf(parent, kids) {
      if (parent.kind === CUBBY_KIND) return cubbyLayout(parent, kids);
      return base.layoutOf ? base.layoutOf(parent, kids) : null;
    },
    dropTarget(item, other) {
      if (other.kind === FISHBOWL_KIND) return !isChar(item) && isFishFood(item);
      if (other.kind === CUBBY_KIND && isChar(item)) return false;
      // Only the cubby whose column the thing is over takes it (their drop boxes overlap).
      if (other.kind === CUBBY_KIND) { const v = viewOf(item.id); if (v && nearestCubby(v.x) !== cubbyIndex(other)) return false; }
      // Held up in the cubbies, a bag goes into the cubby, not onto the kid standing in front of it.
      if (isChar(other) && !isChar(item) && overCubbies(item)) return false;
      return base.dropTarget ? base.dropTarget(item, other) : false;
    },
    onDropInto(item, target, ctx) {
      if (target.kind === FISHBOWL_KIND) { feedFish(item); return true; }
      const r = base.onDropInto ? base.onDropInto(item, target, ctx) : false;
      if (target.kind === CUBBY_KIND) later(0, () => { const e = getEntity(store.state, item.id); if (e && e.parent === target.id) fx.burst('sparkle', target.x, target.y - 120, { count: 5, spread: 50 }); });
      return r;
    },
    onDragMove(e, ctx) {
      if (base.onDragMove) base.onDragMove(e, ctx);
      if (isChar(e)) glowCubby(headCubby(e));
    },
    onDrop(e, ctx) {
      if (!isChar(e) && board && board.onDrop(e, ctx)) return true;
      if (!isChar(e)) return base.onDrop ? base.onDrop(e, ctx) : false;
      const cub = headCubby(e);
      glowCubby(-1);
      const before = e.props.seat || null;
      const r = base.onDrop ? base.onDrop(e, ctx) : false;
      if (cub >= 0) {
        assignCubby(cub, e.id);
        // Standing right up against the cubbies: a hop forward, so the cubby and its face show.
        const cur = getEntity(store.state, e.id);
        if (cur && !cur.props.seat && !cur.parent && cur.y < 760) {
          later(260, () => {
            const c2 = getEntity(store.state, e.id);
            const v = viewOf(e.id);
            if (!c2 || c2.props.seat || c2.y >= 760 || (v && v.held)) return;
            if (store.dispatch('move', { id: e.id, room: SCHOOL_ID, x: c2.x, y: 792, z: 0 })) view.animateFrom(e.id, c2.x, c2.y);
          });
        }
      }
      const now = getEntity(store.state, e.id);
      if (now) afterPlace(now, before);
      return r;
    },
    onTap(e, ctx) {
      if (e.kind === FISHBOWL_KIND) { tapFish(); return true; }
      if (e.kind === CUBBY_KIND) { tapCubby(e); return true; }
      if (board && board.onTap(e)) return true;
      const r = base.onTap ? base.onTap(e, ctx) : false;
      if (isChar(e)) {
        if (e.props.seat === 'line-1') march();
        else if (typeof e.props.seat === 'string' && e.props.seat.indexOf(COT_SEAT) === 0) zzz(e.id, 3);
      }
      return r;
    },
  });

  view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: hooks, labels: textLabels(catalog, manifest) });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);

  // ---- first visit ----
  ensureFixtures(store, m);
  const here = inRoom(store.state, SCHOOL_ID);
  if (firstVisit || !here.some((e) => catalog.hasTag(e.kind, 'spawner'))) {
    seedSchool(store, room.def, { catalog, manifest, cubbies: cubbiesOf(store.state) });
    if (chars && !here.some((e) => e.kind === CHAR_KIND)) {
      const ids = seedCharacters(store, chars.rig, { room: SCHOOL_ID, seats: chars.seats, placements: SCHOOL_CAST });
      for (const [ci, kind, slot, color] of SCHOOL_CAST_WEAR) {
        if (!ids[ci]) continue;
        store.dispatch('spawn', { id: store.newId(), kind, parent: ids[ci], slot, props: wearProps(manifest, kind, color ? { color } : {}) });
      }
      for (const [ci, cub] of SCHOOL_OWNERS) if (ids[ci]) setFix('cubby-' + (cub + 1), ids[ci]);
    }
  }
  firstVisit = false;
  applyCots();
  // A tap on any part of the teacher (her lanyard, her face...): a picture card.
  behaviors.charTap = (e) => !!(board && board.onTap(e));

  // ---- helpers over characters ----
  const charsHere = () => inRoom(store.state, SCHOOL_ID).filter((e) => isChar(e) && !e.parent);
  const anchor = (id, name) => (chars ? chars.anchor(id, name) : null);
  function headCubby(e) {
    const h = anchor(e.id, 'head');
    return h ? cubbyAt(CUB, h.x, h.y) : -1;
  }
  const say = (text, sound) => {
    stats.said.push(text);
    if (stats.said.length > 12) stats.said.shift();
    if (isSpeechOn()) speech.say(text, { interrupt: true });
    else if (sound) view.play(sound[0], sound[1]);
  };
  const poses = rig ? rig.poses : {};

  // What happens after a character lands somewhere.
  function afterPlace(e, before) {
    const seat = e.props.seat || null;
    const at = seat ? cotSeats().find((s) => s.id === seat) : null;
    // Off the beanbag: the calm face goes (a feeling picked on the chart stays).
    if (before === 'beanbag' && seat !== 'beanbag' && JSON.stringify(e.props.expr) === JSON.stringify(CALM_EXPR)) store.dispatch('set', { id: e.id, path: 'props.expr', value: 'happy' });
    if (seat === 'beanbag') {
      store.dispatch('set', { id: e.id, path: 'props.expr', value: CALM_EXPR });
      stats.calm++;
      later(260, () => { view.play('chime', { pitch: 0.9, gain: 0.6 }); if (at) fx.burst('bubble', at.x, at.y - 60, { count: 3, spread: 50, scale: 0.8 }); });
    }
    const ri = rugIndex(seat);
    if (ri >= 0) later(180, () => rugNote(ri));
    if (seat === 'rocking-chair') later(320, () => rock({ soft: true }));
    if (seat && seat.indexOf(COT_SEAT) === 0) { stats.naps++; later(400, () => zzz(e.id, 4)); }
    if (state('sink-tap') === 'on' && atSink(e)) later(250, () => wash([e]));
  }

  // ---- the rug ----
  const RUG = (R.rug && R.rug.spots) || [];
  const rugTaken = () => { const s = new Set(); for (const e of charsHere()) { const i = rugIndex(e.props.seat); if (i >= 0) s.add(i); } return s; };
  function rugNote(i) {
    stats.notes++;
    view.play('plink', { note: i + 1, gain: 0.9 });
    const p = RUG[i];
    if (p) fx.burst('sparkle', p[0], p[1] - 10, { count: 4, spread: 50, scale: 0.8 });
    if (RUG.length && rugTaken().size === RUG.length) later(420, rugTune);
  }
  function rugTune() {
    stats.tunes++;
    const tune = [0, 1, 2, 3, 4, 5, 6, 4, 6];
    tune.forEach((n, k) => later(k * 170, () => {
      view.play('plink', { note: n + 1, gain: 0.8 });
      const p = RUG[n];
      if (p) fx.burst('sparkle', p[0], p[1] - 20, { count: 2, spread: 30 });
    }));
    later(tune.length * 170 + 60, () => {
      view.play('cheer', { gain: 0.7 });
      for (const e of charsHere()) if (rugIndex(e.props.seat) >= 0 && chars) chars.face(e.id, [['laughing', 900]]);
    });
  }

  // ---- the rocking chair ----
  function rock({ soft = false } = {}) {
    const p = pieces.get('rocking-chair');
    const rc = R.rockingChair || {};
    if (!p || !rc.pivot) return;
    stats.rocks++;
    const amp = soft ? [3.5, -2.5, 1.5] : [6, -5, 3.5, -2];
    const frames = (fn) => [fn(0)].concat(amp.map((a, k) => Object.assign(fn(a), { offset: (k + 1) / (amp.length + 1) })), [fn(0)]);
    const dur = soft ? 1100 : 1600;
    tween.animate(p.body, frames((a) => ({ transform: `rotate(${a}deg)` })), { duration: dur, easing: 'ease-in-out' });
    view.play('squeak', { pitch: 0.55, gain: 0.5 });
    later(dur * 0.45, () => view.play('squeak', { pitch: 0.5, gain: 0.4 }));
    // Whoever sits in it rocks along (rotated about the rockers' pivot).
    const sitter = charsHere().find((e) => e.props.seat === rc.seat);
    const v = sitter && viewOf(sitter.id);
    if (v && !v.held) {
      const d = (rc.pivot[1] - sitter.y) / (v.scale || 1);
      v.lift.style.transformOrigin = '50% 100%';
      const rad = (a) => (a * Math.PI) / 180;
      tween.animate(v.lift, frames((a) => ({ transform: `translate3d(${r1(d * Math.sin(rad(a)))}px, ${r1(d * (1 - Math.cos(rad(a))))}px, 0) rotate(${a}deg)` })), { duration: dur, easing: 'ease-in-out' });
    }
  }

  // ---- the goldfish ----
  const isFishFood = (item) => item.kind === 'fish-food' || catalog.hasTag(item.kind, 'food') || catalog.hasTag(item.kind, 'snack');
  const overrides = new Map();
  function press(pid, variant, ms) {
    overrides.set(pid, variant);
    renderPieces();
    const t = later(ms, () => { if (overrides.get(pid) === variant) { overrides.delete(pid); renderPieces(); } });
    return t;
  }
  const bowl = () => { const s = (m.slots || []).find((q) => q.id === 'fish-bowl'); return s && s.box ? { x: s.box[0] + s.box[2] / 2, y: s.box[1] + s.box[3] / 2 } : { x: 1981, y: 560 }; };
  function tapFish() {
    stats.swims++;
    stats.taps['fish-bowl'] = (stats.taps['fish-bowl'] || 0) + 1;
    const next = state('fish-bowl') === 'swim-a' ? 'swim-b' : 'swim-a';
    setFix('fish-bowl', next);
    view.play('bubble', { pitch: 1.2 });
    later(160, () => view.play('bubble', { pitch: 1.5, gain: 0.7 }));
    const b = bowl();
    fx.burst('bubble', b.x, b.y, { count: 4, spread: 40, scale: 0.6 });
    const p = pieces.get('fish-bowl');
    if (p) tween.wobble(p.body, { amount: 0.15, duration: 500 });
  }
  function feedFish(item) {
    stats.feeds++;
    const b = bowl();
    fx.burst('bit', b.x, b.y - 36, { count: 6, spread: 40, scale: 0.35, color: '#C4933A' });
    view.play('plink', { pitch: 1.4, gain: 0.7 });
    later(260, () => view.play('bubble', { pitch: 1.3 }));
    later(520, () => { view.play('giggle', { pitch: 1.6, gain: 0.6 }); fx.burst('bubble', b.x, b.y - 6, { count: 5, spread: 44, scale: 0.7 }); fx.burst('heart', b.x, b.y - 30, { count: 2 }); });
    press('fish-bowl', 'fed', 2600);
    const v = viewOf(item.id);
    if (v) tween.shake(v.body, { amount: 0.5, duration: 360 });
  }

  // ---- the sink ----
  const SINK = (m.slots || []).find((s) => s.id === 'sink') || { at: [990.5, 611.8], box: [952, 553, 77, 63] };
  const atSink = (e) => !e.parent && (!e.props.seat || /^line-/.test(e.props.seat)) && Math.abs(e.x - SINK.at[0]) < 95 && e.y >= m.floor.y0 - 2 && e.y < 880;
  function wash(list) {
    const b = SINK.box;
    const spout = { x: b[0] + b[2] * 0.5, y: b[1] + b[3] * 0.55 };
    view.play('splash', { gain: 0.9 });
    if (!list.length) { fx.burst('drop', spout.x, spout.y, { count: 5, spread: 30 }); return; }
    for (const e of list) {
      stats.washes++;
      const hr = anchor(e.id, 'handR') || spout;
      const hl = anchor(e.id, 'handL') || spout;
      const hx = (hr.x + hl.x) / 2, hy = (hr.y + hl.y) / 2;
      later(120, () => { view.play('bubble', { pitch: 1.1 }); fx.burst('bubble', hx, hy - 10, { count: 6, spread: 60, scale: 0.8 }); });
      later(520, () => { view.play('bubble', { pitch: 1.4, gain: 0.7 }); fx.burst('bubble', hx, hy - 20, { count: 4, spread: 50, scale: 0.6 }); });
      later(1000, () => { view.play('sparkle'); fx.burst('sparkle', hx, hy - 10, { count: 6, spread: 50 }); });
      if (chars && poses.hold) {
        const a = Object.assign({}, poses.hold);
        const b2 = Object.assign({}, poses.hold, { armL: poses.hold.armL && [poses.hold.armL[0] + 12, poses.hold.armL[1], poses.hold.armL[2]], armR: poses.hold.armR && [poses.hold.armR[0] - 12, poses.hold.armR[1], poses.hold.armR[2]] });
        chars.gesture(e.id, [[a, 220], [b2, 200], [a, 200], [b2, 200], [a, 200]], { face: [['laughing', 900], ['happy', 500]] });
      }
    }
  }

  // ---- the bus ----
  const BUS = R.bus || {};
  const riders = () => charsHere().filter((e) => typeof e.props.seat === 'string' && e.props.seat.indexOf('bus-seat') === 0).sort((a, b) => (a.props.seat < b.props.seat ? -1 : 1));
  const busParts = () => ['bus', 'bus-door', 'bus-inside'].map((pid) => pieces.get(pid)).filter(Boolean);
  function tapBus() {
    stats.taps.bus = (stats.taps.bus || 0) + 1;
    view.play('honk');
    later(260, () => view.play('honk', { pitch: 1.12, gain: 0.8 }));
    for (const p of busParts()) tween.animate(p.body, [
      { transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(0, -10px, 0)', offset: 0.3 },
      { transform: 'translate3d(0, 0, 0) scale(1.02, 0.98)', offset: 0.6 }, { transform: 'translate3d(0, 0, 0)' },
    ], { duration: 480, easing: 'ease-out' });
    const rs = riders();
    if (state('bus-door') !== 'open') openBusDoor();
    else if (!rs.length) { setFix('bus-door', 'closed'); playS(PIECES['bus-door'].sound.closed); }
    if (rs.length) hopOff(rs, 520);
  }
  function openBusDoor() {
    setFix('bus-door', 'open');
    playS(PIECES['bus-door'].sound.open);
    burstAt('bus-door', 'puff', { count: 5, scale: 0.6 });
  }
  function hopOff(rs, delay = 300) {
    rs.forEach((e, i) => later(delay + i * 420, () => {
      const cur = getEntity(store.state, e.id);
      if (!cur || cur.props.seat !== e.props.seat || cur.room !== SCHOOL_ID) return;
      const v = viewOf(e.id);
      if (v && v.held) return;
      const k = KERB[i % KERB.length];
      const x = k[0] + Math.floor(i / KERB.length) * 30, y = k[1];
      const door = BUS.door || [233.8, 865.2];
      store.dispatch('set', { id: e.id, path: 'props.pose', value: 'stand' });
      store.dispatch('set', { id: e.id, path: 'props.seat', value: null });
      if (!store.dispatch('move', { id: e.id, room: SCHOOL_ID, x, y, z: 0 })) return;
      stats.hops++;
      view.animateFrom(e.id, door[0] + 20, door[1] - 90);
      view.play('boing', { pitch: 1.2 + i * 0.1, gain: 0.7 });
      later(420, () => {
        fx.burst('puff', x, y, { count: 4, spread: 40, scale: 0.5 });
        if (chars && poses.wave) chars.gesture(e.id, [[poses.wave, 280], [poses.wave2 || poses.wave, 280], [poses.wave, 280], [poses.wave2 || poses.wave, 280]], { face: [['laughing', 1100], ['happy', 400]] });
      });
    }));
  }
  // Arriving with kids aboard: the bus pulls in from off the left edge and honks.
  function driveIn() {
    const rs = riders();
    if (!rs.length) return false;
    stats.arrivals++;
    const kf = [{ transform: 'translate3d(-620px, 0, 0)' }, { transform: 'translate3d(14px, 0, 0)', offset: 0.85 }, { transform: 'translate3d(0, 0, 0)' }];
    const opts = { duration: 1500, easing: 'ease-out' };
    for (const p of busParts()) tween.animate(p.body, kf, opts);
    for (const e of rs) { const v = viewOf(e.id); if (v) tween.animate(v.lift, kf, opts); }
    view.play('motor', { gain: 0.6 });
    later(1350, () => { view.play('honk'); later(240, () => view.play('honk', { pitch: 1.12, gain: 0.8 })); });
    return true;
  }

  // ---- the line ----
  function march() {
    const line = charsHere().filter((e) => /^line-\d+$/.test(e.props.seat || '')).sort((a, b) => Number(a.props.seat.slice(5)) - Number(b.props.seat.slice(5)));
    if (!line.length || !chars) return;
    stats.marches++;
    const wa = poses['walk-a'], wb = poses['walk-b'];
    for (let k = 0; k < 6; k++) later(k * 300, () => view.play('knock', { pitch: k % 2 ? 0.7 : 0.9, gain: 0.8 }));
    line.forEach((e, i) => later(i * 110, () => {
      if (wa && wb) chars.gesture(e.id, [[wa, 300], [wb, 300], [wa, 300], [wb, 300], [wa, 300], [wb, 300]], { face: [['happy', 1800]] });
    }));
  }

  // ---- napping ----
  function zzz(id, n = 3) {
    const h = anchor(id, 'head');
    if (!h) return;
    for (let k = 0; k < n; k++) later(k * 420, () => fx.burst('zzz', h.x + 18 + k * 6, h.y - 20, { count: 1, spread: 12, scale: 0.8 + k * 0.15 }));
    later(80, () => view.play('whoosh', { pitch: 0.5, gain: 0.35 }));
  }

  // ---- the feelings chart, the schedule, the other painted things ----
  const onScreen = (x) => x >= stage.camera.x - 40 && x <= stage.camera.x + 1480;
  function tapFeeling(f) {
    const F = FEELINGS[f];
    const spot = (R.feelings || []).find((q) => q.id === f);
    if (!F || !spot) return;
    stats.feelings++;
    stats.lastFeeling = f;
    popArt(hits.get('feeling-' + f).a.box, 'back');
    // The nearest character (on screen) takes the face.
    let best = null, bd = Infinity;
    for (const e of charsHere()) {
      const v = viewOf(e.id);
      if (!v || v.held || !onScreen(e.x)) continue;
      const h = anchor(e.id, 'head') || { x: e.x, y: e.y - 150 };
      const d = Math.hypot(h.x - spot.at[0], h.y - spot.at[1]);
      if (d < bd) { bd = d; best = e; }
    }
    view.play('chime', { pitch: 1.1, gain: 0.5 });
    say(F.word, F.sound);
    if (!best) return;
    store.dispatch('set', { id: best.id, path: 'props.expr', value: F.expr });
    const h = anchor(best.id, 'head');
    if (h) fx.burst(F.fx, h.x, h.y - 30, { count: F.fx === 'heart' ? 3 : 5, spread: 60 });
    const v = viewOf(best.id);
    if (v) tween.squish(v.body, { amount: 0.5 });
  }
  function tapSchedule(id) {
    const i = (R.schedule || []).findIndex((c) => c.id === id);
    const word = (S.scheduleWords && S.scheduleWords[id]) || id;
    popArt(hits.get('schedule-' + id).a.box, 'back');
    say(word + '!', ['plink', { note: Math.max(0, i) + 2 }]);
    view.play('pop', { pitch: 1.1 + i * 0.05, gain: 0.6 });
    const b = hits.get('schedule-' + id).a.box;
    fx.burst('sparkle', b[0] + b[2] / 2, b[1] + b[3] / 2, { count: 4, spread: 40 });
  }
  function tapHit(id, info) {
    stats.hits[id] = (stats.hits[id] || 0) + 1;
    if (id.indexOf('feeling-') === 0) return tapFeeling(id.slice(8));
    if (id.indexOf('schedule-') === 0) return tapSchedule(id.slice(9));
    if (board && board.tapHit(id, info)) return undefined;
    // Fallback (easel, whiteboard: P2d.3).
    stats.fallbacks++;
    const h = hits.get(id);
    popArt(h.a.box, h.a.layer);
    view.play('pop', { pitch: 0.9 + Math.random() * 0.4 });
    const b = h.a.box;
    fx.burst('sparkle', b[0] + b[2] / 2, b[1] + b[3] / 2, { count: 4, spread: Math.max(40, Math.min(120, b[2] * 0.6)) });
  }
  // A painted card pops out of the wall with a bounce (a copy cut from its
  // layer's tiles, removed when the bounce ends: nothing stays behind).
  function popArt(box, layerId = 'back') {
    const L = m.layers.find((q) => q.id === layerId);
    if (!L) return;
    const [x, y, w, h] = box;
    const src = (L.tiles && L.tiles.length ? L.tiles : [L]).filter((t) => t.x < x + w && t.x + t.w > x && t.y < y + h && t.y + t.h > y);
    if (!src.length) return;
    const outer = document.createElement('div');
    outer.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:translate3d(${r1(x)}px, ${r1(y)}px, 0);pointer-events:none`;
    const bounce = document.createElement('div');
    bounce.style.cssText = `position:absolute;inset:0;transform-origin:50% 60%;filter:drop-shadow(0 4px 3px rgba(61,44,41,0.25))`;
    const clip = document.createElement('div');
    clip.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:6px';
    clip.innerHTML = src.map((t) => `<img alt="" draggable="false" src="${t.file}" style="position:absolute;left:${r1(t.x - x)}px;top:${r1(t.y - y)}px;width:${t.w}px;height:${t.h}px;max-width:none">`).join('');
    bounce.appendChild(clip);
    outer.appendChild(bounce);
    room.fxLayer.appendChild(outer);
    const a = tween.animate(bounce, [
      { transform: 'translate3d(0, 0, 0) scale(1)' }, { transform: 'translate3d(0, -10px, 0) scale(1.28)', offset: 0.3 },
      { transform: 'translate3d(0, 0, 0) scale(0.94)', offset: 0.62 }, { transform: 'translate3d(0, 0, 0) scale(1.04)', offset: 0.82 },
      { transform: 'translate3d(0, 0, 0) scale(1)' },
    ], { duration: 560, easing: 'ease-out' });
    tween.done(a).then(() => outer.remove(), () => outer.remove());
  }

  // ---- fixture pieces ----
  function swap(pid, variant) {
    const p = pieces.get(pid);
    const v = m.pieces[pid].variants[variant];
    if (!p || !v || p.shown === variant) return;
    p.shown = variant;
    p.el.dataset.variant = variant;
    const gen = ++p.gen;
    const pre = new Image();
    pre.src = v.file;
    const show = () => { if (p.gen === gen) { p.img.src = v.file; stats.swaps++; } };
    if (!p.img.getAttribute('src')) { show(); return; }
    (pre.decode ? pre.decode() : Promise.resolve()).then(show, show);
  }
  const dimEl = room.art.get('dim');
  let dimShown = null;
  function renderPieces() {
    const props = fprops();
    for (const pid of pieces.keys()) swap(pid, overrides.get(pid) || pieceState(pid, props, m.pieces));
    // The window shows the day's weather (kept in step with the calendar slot, P2d.2).
    const off = pieceState('light-switch', props, m.pieces) === 'off';
    if (dimEl && dimShown !== off) {
      const was = dimShown;
      dimShown = off;
      dimEl.style.opacity = off ? '1' : '0';
      if (was != null) tween.animate(dimEl, [{ opacity: off ? 0 : 1 }, { opacity: off ? 1 : 0 }], { duration: 600, easing: 'ease-in-out' });
    }
  }
  const burstAt = (pid, type, o = {}) => {
    const p = m.pieces[pid];
    fx.burst(type, p.x + p.w / 2, p.y + p.h * 0.45, Object.assign({ count: 6, spread: Math.max(60, Math.min(160, p.w * 0.6)) }, o));
  };
  const playS = (s) => { if (s) view.play(s[0], s[1]); };

  function ringBell() {
    stats.rings++;
    const p = pieces.get('school-bell');
    press('school-bell', 'ring', 1100);
    view.play('bell', { gain: 0.9, pitch: 1.12 });
    later(380, () => view.play('bell', { gain: 0.9, pitch: 0.9 }));
    if (p) tween.animate(p.body, [
      { transform: 'rotate(0deg)' }, { transform: 'rotate(28deg)', offset: 0.16 }, { transform: 'rotate(-24deg)', offset: 0.36 },
      { transform: 'rotate(16deg)', offset: 0.56 }, { transform: 'rotate(-8deg)', offset: 0.76 }, { transform: 'rotate(0deg)' },
    ], { duration: 1100, easing: 'ease-in-out' });
    burstAt('school-bell', 'sparkle', { count: 6 });
  }

  function tapPiece(pid) {
    const spec = PIECES[pid] || { later: true };
    const p = pieces.get(pid);
    stats.taps[pid] = (stats.taps[pid] || 0) + 1;
    if (spec.bus) return tapBus();
    if (spec.fish) return tapFish();
    if (spec.rock) return rock();
    if (spec.bell) return ringBell();
    if (spec.board && board && board.tapPiece(pid)) return undefined;
    if (spec.toggle) {
      const next = nextToggle(pid, state(pid));
      setFix(pid, next);
      playS(spec.sound && spec.sound[next]);
      if (spec.fx && spec.fx[next]) burstAt(pid, spec.fx[next], { count: 5 });
      tween.squish(p.body, { amount: 0.5, duration: 300 });
      if (pid === 'bus-door' && next === 'open') { const rs = riders(); if (rs.length) hopOff(rs); }
      if (pid === 'sink-tap' && next === 'on') wash(charsHere().filter(atSink));
      if (pid === 'light-switch' && next === 'off') [4, 2, 3, 1, 0].forEach((n, k) => later(250 + k * 420, () => view.play('plink', { note: n, gain: 0.35 })));
      return undefined;
    }
    // Fallback: a wobble, a sound, sparkles (P2d.2-P2d.4 bring these alive).
    stats.fallbacks++;
    if (spec.react === 'squish') tween.squish(p.body, { amount: 0.4 }); else tween.wobble(p.body, { amount: 0.25 });
    playS(spec.sound || ['pop']);
    burstAt(pid, spec.fx || 'sparkle', { count: 4 });
    return undefined;
  }

  // ---- the teaching wall (P2d.2) ----
  board = createSchoolBoard({
    stage, store, room, view, fx, chars, manifest, catalog, speech, isSpeechOn, popArt, later, setFix, fprops, charsHere, anchor, viewOf, onScreen, SCHOOL_ID, behaviors,
    hitBox: (id) => (hits.get(id) ? hits.get(id).a.box : null),
    now: () => new Date(),
  });

  renderPieces();
  renderFaces();
  view.refresh();

  // Came in from the map with kids on the bus: it pulls in.
  if (from && pieces.has('bus')) driveIn();

  // Keep cots' seats, faces and pieces in step with the world. A cot this
  // iPad moves takes whoever naps on it along.
  const unsubscribe = store.subscribe((st, env) => {
    renderPieces();
    renderFaces();
    board.render();
    const cotMoved = env && env.op === 'move' && env.device === store.device && env.args && (() => { const e = st.entities[env.args.id]; return e && e.kind === 'nap-cot'; })();
    const prevSeats = cotMoved ? new Map(cotSeats().filter((s) => s.id === COT_SEAT + env.args.id).map((s) => [s.id, s])) : null;
    applyCots();
    if (cotMoved) {
      const sid = COT_SEAT + env.args.id;
      const s = cotSeats().find((q) => q.id === sid);
      const old = prevSeats.get(sid);
      if (s && old) {
        for (const e of charsHere()) {
          if (e.props.seat !== sid) continue;
          later(0, () => {
            const cur = getEntity(store.state, e.id);
            if (!cur || cur.props.seat !== sid) return;
            store.dispatch('move', { id: e.id, room: SCHOOL_ID, x: r1(cur.x + s.x - old.x), y: s.y, z: 0 });
          });
        }
      }
    }
  });

  // Remember where the camera rests (per iPad; on settle only).
  const saveCam = () => { try { storage.setItem(CAM_KEY, JSON.stringify(Math.round(stage.camera.x))); } catch { /* full or private */ } };
  let camTimer = 0;
  const offStage = stage.onChange((_, why) => {
    if (why !== 'camera' && why !== 'settle') return;
    clearTimeout(camTimer);
    camTimer = setTimeout(() => { camTimer = 0; if (!stage.camera.dragging && !stage.camera.moving) saveCam(); }, 400);
  });

  return {
    id: room.id, room, view, fx, catalog, behaviors, chars, tiles,
    zones: m.zones,
    pieces: {
      ids: () => [...pieces.keys()],
      state,
      shown: (pid) => (pieces.get(pid) || {}).shown || null,
      el: (pid) => (pieces.get(pid) || {}).el || null,
      tap: tapPiece,
    },
    hits: {
      ids: () => [...hits.keys()],
      el: (id) => (hits.get(id) || {}).el || null,
      tap: tapHit,
    },
    cubbies: {
      /** Cubby index -> owner char id (or null). */
      owners: () => CUB.map((_, i) => { const e = ownerOf(i); return e ? e.id : null; }),
      /** The container entity ids, by cubby index. */
      ids: () => cubbiesOf(store.state).map((e) => (e ? e.id : null)),
      /** What each cubby holds: [{id, kind, spot}] per cubby. */
      contents: () => cubbiesOf(store.state).map((c) => {
        if (!c) return [];
        const kids = childrenOf(store.state, c.id);
        const spots = cubbySpots(kids, { isBag, isLunch });
        return kids.map((k) => ({ id: k.id, kind: k.kind, spot: spots.get(k.id) }));
      }),
      /** Is a face showing on cubby i's label (and whose)? */
      face: (i) => { const f = faceEls[i]; return f && f.key ? { owner: f.el.dataset.owner, visible: f.body.style.visibility !== 'hidden', img: !!f.body.querySelector('img') } : null; },
      faceEl: (i) => (faceEls[i] ? faceEls[i].el : null),
      assign: assignCubby,
    },
    seats: () => (chars ? chars.seats.map((s) => ({ id: s.id, x: s.x, y: s.y, pose: s.pose, lie: s.lie })) : []),
    riders: () => riders().map((e) => e.id),
    driveIn,
    stats: () => ({ ...stats, taps: { ...stats.taps }, hits: { ...stats.hits }, said: stats.said.slice(), timers: timers.size }),
    board,
    surfaces: () => room.def.surfaces.map((s) => s.id),
    fixtures,
    /** Where things arriving by car stand: on the path in front of the school door, in a row. */
    arrivalSpot(i) { return { x: Math.round(560 + i * 110), y: Math.round(930 + (i % 2) * 30) }; },
    destroy() {
      unsubscribe();
      offStage();
      board.destroy();
      clearTimeout(camTimer);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const p of pieces.values()) input.unregister(p.el);
      for (const h of hits.values()) input.unregister(h.el);
      tiles.destroy();
      view.destroy();
      if (chars) chars.destroy();
      fx.clear();
      room.destroy();
      removeSource();
    },
  };
}

/** Image files the school shows first (preloading before a transition). */
export function schoolFiles(manifest, { cameraX = null } = {}) {
  const m = manifest.rooms.school;
  const x = cameraX == null ? zoneCamera(m, ARRIVE_ZONE) : cameraX;
  const near = (a, w) => a + w > x - 100 && a < x + 1540;
  const out = [];
  for (const L of m.layers) for (const t of L.tiles || [L]) if (near(t.x, t.w)) out.push(t.file);
  for (const p of Object.values(m.pieces || {})) if (near(p.x, p.w)) out.push(p.variants[p.default].file);
  return out;
}
