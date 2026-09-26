// The Theater (P2b.1, docs/design.md 3.2): Zoe's place (singing, shows) and
// Ian's (costumes, heroes). ONE panning strip, 2880 units wide: BACKSTAGE and
// the costume closet, the STAGE, and the AUDIENCE + LOBBY
// (tools/art/rooms/theater.mjs, manifest `rooms.theater`). The city map's
// theater leads here (location 'theater/stage').
//
//   const theater = await mountTheater(stage, { input, store, manifest, carry, from });
//
// What it wires (the engine half of P2b.1; the same pattern as cafe.js and site.js):
// - LAYERS in column tiles (engine/tiles.js), decoded only near the camera.
// - CAMERA: flings snap to the zone stops (backstage, stage, audience). In
//   from the map it opens on the stage; a reload keeps where you were (per iPad).
// - PIECES (manifest `pieces`, the spotlight at its three `copies`): each is
//   its own image drawn right after its layer. Many are big mostly-clear
//   images (a curtain half, a light cone), so the piece image never takes
//   touches: a HIT box (per piece and state, world units, below) does.
//   Piece state is props of one `theater-fixtures` entity (room
//   'theater/fixtures'), set with store ops: saved, replayed, shared.
// - CURTAIN: the three curtain pieces swap together (open / half / closed,
//   fixtures prop `curtain`). Tap the rope right of the stage (or the
//   valance) to step it (open -> half -> closed -> half -> open), pull the
//   rope down, or drag either half toward the middle (closes) or out (opens).
//   A velvet swoosh; when it OPENS with anyone on the stage the audience goes
//   "ooh" and applauds. Characters on the stage are upstage of the curtain
//   line (the stage surface sorts at the back wall), so a closed curtain hides them.
// - BOWS: tap a character standing on the stage: a ta-da, a bow, the seated
//   audience applauds and cheers, and roses fly from the audience onto the
//   stage (real `rose` things, max ROSE_CAP lie there).
// - AUDIENCE: characters dropped on a seat sit (characters.js seats); they
//   hold and eat popcorn and lemonade from the snack stand (eat = drop the
//   snack at the mouth). A stamped ticket handed to one of them: a happy wheee.
// - COSTUME CLOSET: the two racks hang real costumes (visible stock
//   spawners, rack-*), the props shelf, the open trunk and the wig stand are
//   invisible hot spots over their painted stock. A wear piece dropped on a
//   character is worn (characters.js) with a sparkle and a ta-da; a coloured
//   one (a blue gown) brings that colour. A character standing in front of
//   the vanity mirror makes it twinkle.
// - TICKET BOOTH: tap the window: it opens and a ticket pops out onto the
//   counter; tap a ticket lying on the booth counter: stamped (thunk).
// - POSTER: the picture poster (Zoe's text layer is P2b.7).
// - SHOW (P2b.2, theater-show.js): spotlights dragged along the rail and
//   tapped through their colours (a character in the light shines), the
//   backdrop flies to the next scene (tap it or pull the fly rope) with a
//   finite ambience, and the effects booth (fog, confetti, snow, thunder).
// - LATER BEADS (the pieces only react for now, PIECES[].later): costume
//   reactions + hero wardrobe (P2b.3), instruments (P2b.7).
// - SOUND CORNER (P2b.5/P2b.6, theater-sound.js): the mic stand records
//   (red dot), tapes, the boombox plays them with lip-sync, six voice filter
//   boxes on the booth balcony.
// - FIRST VISIT: Luna on the stage, Maya backstage by the racks, four audience
//   members in the seats, the stock.

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { inRoom, getEntity, locate } from '../engine/world.js';
import { settle, ON_EPS, EDGE_TOL } from '../engine/surfaces.js';
import { createTileLoader } from '../engine/tiles.js';
import { sfx, speech } from '../audio/index.js';
import { addSpriteSource, spriteFor } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { useArtSprites } from './art.js';
import { mountCharacters, seedCharacters, CHAR_KIND } from '../engine/characters.js';
import { textLabels } from './kitchen.js';
import * as tween from '../engine/tween.js';
import { createSound, soundArt } from './theater-sound.js';   // P2b.5/P2b.6
import { createShow, showArt } from './theater-show.js';      // P2b.2

export const THEATER_ID = 'theater/stage';
export const FIXTURES_KIND = 'theater-fixtures';
export const FIXTURES_ROOM = 'theater/fixtures';
export const CAM_KEY = 'ourtown.theaterCam';
export const ARRIVE_ZONE = 'stage';
export const CURTAIN = ['open', 'half', 'closed'];
export const CURTAIN_PIECES = ['curtain-left', 'curtain-right', 'valance'];
export const ROSE_CAP = 8;
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// The room definition (pure)

/** Surface id -> {piece, variant} for surfaces that exist only in one piece state (the trunk). Pure. */
export function insideSurfaces(m) {
  const out = {};
  for (const s of m.surfaces) {
    if (!s.inside) continue;
    const [piece, variant] = s.inside.split(':');
    out[s.id] = { piece, variant };
  }
  return out;
}

/** Sort depth of a manifest layer (the back layer's things sort at the wall foot). Pure. */
export function depthFor(m) {
  const floorTop = m.floor.y0;
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  return (layer) => (layer === 'back' ? floorTop : baseline[layer]);
}

/** Art ids of a piece: one per copy ('piece:spotlight', 'piece:spotlight#1', ...). Pure. */
export function copyIds(pid, p) {
  const n = p.copies && p.copies.length ? p.copies.length : 1;
  return Array.from({ length: n }, (_, i) => (i ? `piece:${pid}#${i}` : `piece:${pid}`));
}

/** The view-layer room definition for the theater strip. Pure. opts.tiled: layers as tiles (default). */
export function theaterRoom(m, { tiled = true, cameraX = 0 } = {}) {
  const floorTop = m.floor.y0;
  const depthOf = depthFor(m);
  const img = (src) => `<img${src ? ` src="${src}"` : ''} alt="" draggable="false" decoding="async">`;
  const art = [];
  const tiles = [];
  for (const L of m.layers) {
    const layer = L.id === 'back' ? 'back' : L.id === 'front' ? 'front' : 'mid';
    const depth = L.id === 'back' ? undefined : L.baseline;
    if (tiled && L.tiles && L.tiles.length) {
      L.tiles.forEach((t, i) => {
        const id = `${L.id}-${i}`;
        art.push({ id, layer: layer === 'front' ? 'mid' : layer, depth, x: t.x, y: t.y, w: t.w, h: t.h, cls: 'art-img art-tile', html: img(null) });
        tiles.push({ id, file: t.file, x: t.x, w: t.w, px: t.px });
      });
    } else {
      art.push({ id: L.id, layer: layer === 'front' ? 'mid' : layer, depth, x: L.x, y: L.y, w: L.w, h: L.h, cls: 'art-img', html: img(L.file) });
    }
    for (const [pid, p] of Object.entries(m.pieces || {})) {
      if (p.layer !== L.id) continue;
      const o = p.pivot ? [p.pivot[0] - p.x, p.pivot[1] - p.y] : [p.w / 2, p.h];
      const at = p.copies && p.copies.length ? p.copies : [[p.x, p.y]];
      copyIds(pid, p).forEach((id, i) => art.push({
        id, layer: layer === 'front' ? 'mid' : layer, depth, x: at[i][0], y: at[i][1], w: p.w, h: p.h, cls: 'art-piece',
        html: `<div class="piece-body" style="transform-origin:${Math.round(o[0])}px ${Math.round(o[1])}px">${img(null)}</div>`,
      }));
    }
  }
  // The curtain rope (painted in the back layer): an invisible touch target.
  const rope = (m.slots || []).find((s) => s.id === 'curtain-rope');
  if (rope && rope.box) art.push({ id: 'hit:curtain-rope', layer: 'mid', depth: 764.4, x: rope.box[0], y: rope.box[1], w: rope.box[2], h: rope.box[3], cls: 'art-hit', html: '' });
  return {
    id: THEATER_ID,
    width: m.width,
    cameraX,
    cameraStops: (m.zones || []).map((z) => z.camera),
    backdrop: { top: '#D9CCE6', bottom: '#E7C9A8', horizon: floorTop },
    floor: { top: floorTop, bottom: m.floor.y1, x0: 0, x1: m.width, sound: 'thud' },
    surfaces: m.surfaces.map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, y: s.y, depth: depthOf(s.layer), sound: s.id === 'stage' ? 'knock' : s.inside ? 'thud' : 'knock' })),
    seats: (m.seats || []).map((s) => ({ id: s.id, x: s.at[0], y: s.at[1], depth: depthOf(s.layer) })),
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

// curtain: steps the curtain; toggle: [a, b] (world state, sound per new
// state); press: a variant shown for `ms`; ticket: the ticket window;
// otherwise react (wobble, squish, shake) with a sound. `later` names the
// bead that brings the piece alive (its hooks are listed in that bead).
export const PIECES = {
  'curtain-left': { curtain: true }, 'curtain-right': { curtain: true }, valance: { curtain: true },
  trapdoor: { toggle: ['closed', 'open'], sound: { open: ['squeak', { pitch: 0.6 }], closed: ['thud', { pitch: 1.1 }] }, fx: { open: 'puff' } },
  trunk: { toggle: ['closed', 'open'], sound: { open: ['squeak', { pitch: 0.8 }], closed: ['thud', { pitch: 0.9 }] }, fx: { open: 'sparkle' } },
  'ticket-window': { ticket: true },
  poster: { react: 'wobble', sound: ['tap', { pitch: 0.8 }] },
  backdrop: { react: 'wobble', sound: ['whoosh', { pitch: 0.7, gain: 0.6 }] },   // theater-show.js (P2b.2)
  spotlight: { react: 'wobble', sound: ['clink', { pitch: 0.8 }] },   // theater-show.js (P2b.2)
  'fog-machine': { react: 'wobble', sound: ['whoosh', { pitch: 0.6, gain: 0.6 }], fx: 'puff' },   // theater-show.js (P2b.2)
  'confetti-cannon': { react: 'wobble', sound: ['pop', { pitch: 0.8 }] },   // theater-show.js (P2b.2)
  'snow-machine': { react: 'wobble', sound: ['whoosh', { pitch: 1.4, gain: 0.5 }] },   // theater-show.js (P2b.2)
  'thunder-sheet': { react: 'shake', sound: ['clatter', { pitch: 0.6, gain: 0.6 }] },   // theater-show.js (P2b.2)
  'fx-fog': { press: 'down', ms: 260, sound: ['tap', { pitch: 0.8 }] },   // theater-show.js (P2b.2)
  'fx-confetti': { press: 'down', ms: 260, sound: ['tap', { pitch: 0.9 }] },   // theater-show.js (P2b.2)
  'fx-snow': { press: 'down', ms: 260, sound: ['tap', { pitch: 1.0 }] },   // theater-show.js (P2b.2)
  'fx-thunder': { press: 'down', ms: 260, sound: ['tap', { pitch: 1.1 }] },   // theater-show.js (P2b.2)
  'mic-stand': { react: 'wobble', sound: ['tap', { pitch: 1.2 }] },   // theater-sound.js records
  boombox: { react: 'squish', sound: ['plink'] },                        // theater-sound.js plays tapes
  piano: { react: 'squish', sound: ['plink'], later: 'P2b.7' },
  drums: { react: 'squish', sound: ['knock', { pitch: 0.7 }], later: 'P2b.7' },
  xylophone: { react: 'squish', sound: ['plink', { note: 7 }], later: 'P2b.7' },
  guitar: { react: 'wobble', sound: ['plink', { note: 2 }], later: 'P2b.7' },
};

// Where a piece takes touches, in world units: [x, y, w, h] (for every
// state) or {state: box}; `rel` boxes are relative to each copy's top-left.
// Pieces not listed take touches on their whole box. Measured from the
// images' opaque parts (a curtain half gathered at the side is ~150 wide).
export const HIT = {
  'curtain-left': { open: [1016, 83, 148, 691], half: [1016, 83, 300, 691], closed: [1019, 83, 447, 691] },
  'curtain-right': { open: [1747, 83, 148, 691], half: [1600, 83, 299, 691], closed: [1446, 83, 453, 691] },
  valance: [989, 59, 932, 110],
  backdrop: [1027, 123, 856, 581],
  trapdoor: { closed: [1623, 770, 141, 45], open: [1618, 680, 151, 140] },
  'thunder-sheet': [821, -100, 108, 675],
  trunk: { closed: [51, 767, 183, 144], open: [51, 688, 195, 223] },
  'fog-machine': [1046, 735, 118, 66],        // P2b.2: above the piano's lid (the piano starts lower)
  'confetti-cannon': [1756, 680, 130, 124],
  piano: [1041, 803, 199, 259], drums: [1301, 806, 208, 192], xylophone: [1511, 834, 196, 147], guitar: [1739, 805, 104, 175],   // P2b.2: the guitar's neck no longer covers the cannon
  spotlight: { rel: [100, 2, 88, 100] },
  'mic-stand': [1420, 566, 60, 76],
  'snow-machine': [1742, 129, 100, 127],
};

/** The hit box of a piece copy in a state, relative to the copy's top-left: [x, y, w, h]. Pure. */
export function hitBox(pid, p, state, copy = 0) {
  const h = HIT[pid];
  if (!h) return [0, 0, p.w, p.h];
  if (h.rel) return h.rel.slice();
  const b = Array.isArray(h) ? h : (h[state] || h[p.default] || Object.values(h)[0]);
  const at = p.copies && p.copies[copy] ? p.copies[copy] : [p.x, p.y];
  return [r1(b[0] - at[0]), r1(b[1] - at[1]), b[2], b[3]];
}

/** The state of a piece from the fixtures props (its manifest default when unset). Pure. */
export function pieceState(id, props, pieces) {
  const p = pieces[id];
  if (!p) return null;
  const v = props && props[CURTAIN_PIECES.includes(id) ? 'curtain' : id];
  return typeof v === 'string' && p.variants[v] ? v : p.default;
}

/** The variant a piece shows. Pure. (The poster shows its pictures; its text is Zoe's layer, later.) */
export function pieceVariant(id, props, pieces) {
  if (id === 'poster' && pieces[id].variants.pictures) return 'pictures';
  return pieceState(id, props, pieces);
}

/** The state a tap flips a toggle piece to (null for a non-toggle). Pure. */
export function nextToggle(id, cur) {
  const t = (PIECES[id] || {}).toggle;
  if (!t) return null;
  return cur === t[1] ? t[0] : t[1];
}

/**
 * The curtain state a rope tap steps to: open -> half -> closed -> half ->
 * open (dir: +1 closing, -1 opening; the half state keeps going the way it
 * went). Returns {state, dir}. Pure.
 */
export function curtainStep(cur, dir = 1) {
  const i = Math.max(0, CURTAIN.indexOf(cur));
  let d = i === 0 ? 1 : i === CURTAIN.length - 1 ? -1 : (dir < 0 ? -1 : 1);
  return { state: CURTAIN[i + d], dir: d };
}

/** Curtain state for a drag of a half: `toward` units toward the middle from state `from`. Pure. */
export function curtainDrag(from, toward, step = 130) {
  const i = Math.max(0, CURTAIN.indexOf(from));
  const n = Math.max(0, Math.min(CURTAIN.length - 1, i + Math.round(toward / step)));
  return CURTAIN[n];
}

/** Is a (top-level) entity standing on the stage? rig: manifest rigs.stage. Pure. */
export function onStage(e, rig) {
  if (!e || e.parent || (e.props && e.props.seat)) return false;
  return e.x >= rig.x0 && e.x <= rig.x1 && e.y <= rig.lip + 0.5 && e.y >= rig.upstage - 0.5;
}

/** Is this seat an audience seat (the rows and the balcony)? Pure. */
export const audienceSeat = (id) => typeof id === 'string' && (id.indexOf('seat-') === 0 || id.indexOf('balcony-') === 0);

// ---------------------------------------------------------------------------
// First visit (pure data)

// Invisible hot spots over painted stock: [kind, feet x, feet y].
export const HOTSPOTS = [
  ['shelf-crown', 77, 238], ['shelf-top-hat', 133, 238], ['shelf-masquerade', 196, 238],
  ['shelf-wand', 64, 364], ['shelf-microphone', 119, 364], ['shelf-bouquet', 183, 364],
  ['shelf-tambourine', 78, 490], ['shelf-foam-sword', 133, 490], ['shelf-maracas', 200, 490],
  ['shelf-tape', 84, 616], ['shelf-program', 175, 616],
  ['trunk-hats', 143, 805],
  ['wig-hats', 525, 532],
  ['snack-popcorn', 2758, 551.6], ['snack-lemonade', 2835, 551.6],
  ['ticket-roll', 2564.8, 554.4],
];
// Costumes hanging on the racks (visible stock): [rack, kinds].
export const RACKS = [
  ['rack-a', ['rack-gown', 'rack-royal-coat', 'rack-fairy-tutu', 'rack-wizard-robe', 'rack-pirate-coat', 'rack-star-dress', 'rack-tuxedo', 'rack-knight-tunic']],
  ['rack-b', ['rack-hero-cape', 'rack-lightning-cape', 'rack-hero-suit', 'rack-wings', 'rack-feather-boa', 'rack-hero-mask', 'rack-sparkle-mask']],
];
// Loose things: [kind, surface id or null, x, floor y, props].
export const THEATER_ITEMS = [
  ['bouquet', 'vanity', 300], ['program', 'ticket-counter', 2672],
  ['microphone', null, 690, 930],
];
export const THEATER_CAST = [
  { cast: 'performer', x: 1290, y: 805 },
  { cast: 'girl9', x: 860, y: 900 },
  { cast: 'grandma', seat: 'seat-A2' },
  { cast: 'dad', seat: 'seat-B3' },
  { cast: 'girl5', seat: 'seat-A3' },
  { cast: 'boy9', seat: 'seat-C2' },
];

/** Where a rack's hanging costume stands (its feet), hung from the rail at `top`. Pure. */
export function rackSpot(box, i, n, sprite) {
  const [x0, top, w] = box;
  const pad = Math.min(46, w / (n + 1));
  const x = x0 + pad + (i * (w - 2 * pad)) / Math.max(1, n - 1);
  return { x: r1(x), y: r1(top + 6 + sprite.h) };
}

/** Spawn the first-visit things (store ops). room: the normalized room def (all surfaces). */
export function seedTheater(store, room, m, { catalog = null } = {}) {
  const surf = (id) => room.surfaces.find((s) => s.id === id);
  const spawn = (kind, x, y, z = 0, props) => store.dispatch('spawn', { id: store.newId(), kind, room: room.id, x: r1(x), y: r1(y), z, ...(props ? { props } : {}) });
  const spriteOf = (kind) => (catalog && catalog.has(kind) ? catalog.sprite(kind) : spriteFor(kind));
  for (const [kind, x, y] of HOTSPOTS) spawn(kind, x, y);
  for (const [rid, kinds] of RACKS) {
    const sp = (m.spawners || []).find((s) => s.id === rid);
    if (!sp || !sp.box) continue;
    kinds.forEach((kind, i) => { const at = rackSpot(sp.box, i, kinds.length, spriteOf(kind)); spawn(kind, at.x, at.y, i); });
  }
  for (const [kind, on, x, fy, props] of THEATER_ITEMS) {
    const s = on && surf(on);
    const r = settle(room, { x, y: s ? s.y : fy, halfW: spriteOf(kind).w / 2 });
    spawn(kind, r.x, r.y, 0, props);
  }
}

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

/**
 * Mount the theater. opts: { input, store, manifest, carry (P1.14), from (the
 * place we came from, null on boot), storage (tests) }. Resolves once it is up.
 */
export async function mountTheater(stage, { input, store, manifest, carry = null, from = null, storage = safeStorage(), persist = (typeof window !== 'undefined' && window.__persist) || null }) {
  const m = manifest.rooms.theater;
  const rigStage = m.rigs.stage;
  useArtSprites(manifest);
  const catalog = await loadCatalog();
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const tiled = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('tiles') === '0');
  const saved = from ? null : loadCam(storage);
  const cameraX = saved != null ? saved : zoneCamera(m, ARRIVE_ZONE);
  const def = theaterRoom(m, { tiled, cameraX });
  def.art.push(...soundArt());   // P2b.5/6: the red dot's hit box, the six filter boxes
  def.art.push(...showArt());    // P2b.2: the fly rope
  const room = mountRoom(stage, def);
  const fx = createFx(room.fxLayer);
  const allSurfaces = room.def.surfaces.slice();
  const inside = insideSurfaces(m);
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  const RACK_KEY = { 'rack-a': baseline.counter + 0.5, 'rack-b': baseline.mid + 0.5 };
  const HOT_KEY = baseline.counter + 0.5;

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
  const setProp = (key, value) => { const f = fixtures(); if (f && f.props[key] !== value) store.dispatch('set', { id: f.id, path: 'props.' + key, value }); };

  // ---- behaviors, characters, view ----
  const behaviors = createBehaviors({ catalog, store });
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
  // A tap on a performer's worn or held part bows too (characters.js asks first).
  behaviors.charTap = (e) => { if (onStage(e, rigStage) && (e.props.pose || 'stand') === 'stand') { bow(e); return true; } return false; };
  const base0 = chars ? chars.hooks : behaviors;
  const base = carry ? carry.hooks(base0, room) : base0;

  const stats = { taps: {}, swaps: 0, curtain: 0, oohs: 0, applause: 0, bows: 0, roses: 0, tickets: 0, stamps: 0, mirror: 0, tadas: 0 };
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let view = null;
  let show = null;                   // P2b.2 (theater-show.js)
  const viewOf = (id) => (view ? view.viewOf(id) : null);

  const isChar = (e) => !!e && e.kind === CHAR_KIND;
  const rackOf = (kind) => { for (const [rid, kinds] of RACKS) if (kinds.includes(kind)) return rid; return null; };
  const wearProp = (kind) => { const k = catalog.get(kind); const sp = k && k.art && k.art.sprite; const p = sp && manifest.props[sp]; return p && p.wear ? p : null; };

  // Things shut inside the closed trunk are hidden (and untouchable).
  const hidden = new Set();
  const onInside = (e) => {
    for (const s of allSurfaces) {
      const q = inside[s.id];
      if (q && Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL) return { surface: s, ...q };
    }
    return null;
  };
  const isOpen = (q) => state(q.piece) === q.variant;
  const topOf = (e) => { const at = locate(store.state, e.id); return at ? getEntity(store.state, at.top) : null; };
  const shutIn = (e) => { const t = e.parent ? topOf(e) : e; if (!t || t.room !== THEATER_ID) return false; const q = onInside(t); return !!q && !isOpen(q); };
  function applyHidden(e, el) {
    const shut = shutIn(e);
    if (!e.parent) { if (shut) hidden.add(e.id); else hidden.delete(e.id); }
    const want = shut ? 'hidden' : '';
    if (el.style.visibility !== want) el.style.visibility = want;
    input.setEnabled(el, !shut);
  }

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

  const hooks = Object.assign({}, base, {
    spriteOf: (e) => (catalog.hasTag(e.kind, 'hotspot') ? hotSprite(e.kind) : (base.spriteOf ? base.spriteOf(e) : null)),
    sortKeyOf(e) {
      const rack = !e.parent && catalog.hasTag(e.kind, 'rack') ? rackOf(e.kind) : null;
      if (rack) return RACK_KEY[rack] + (e.z || 0) * 0.01;
      const k = base.sortKeyOf ? base.sortKeyOf(e) : null;
      if (k != null || !catalog.hasTag(e.kind, 'hotspot')) return k;
      return allSurfaces.some((s) => Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL) ? null : Math.max(e.y, HOT_KEY);
    },
    onRender(e, ctx) {
      if (base.onRender) base.onRender(e, ctx);
      applyHidden(e, ctx.el);
    },
    dropTarget: (item, other) => !hidden.has(other.id) && (base.dropTarget ? base.dropTarget(item, other) : false),
    onDropInto(item, target, ctx) {
      if (isChar(target)) {
        // A coloured costume (a blue gown) brings its colours when it goes on.
        const wp = wearProp(item.kind);
        const color = item.props && item.props.color;
        if (wp && color && wp.wear.colors && wp.wear.colors[color] && !(item.props.colors)) {
          store.dispatch('set', { id: item.id, path: 'props.colors', value: wp.wear.colors[color] });
        }
        const r = base.onDropInto ? base.onDropInto(item, target, ctx) : false;
        const now = getEntity(store.state, item.id);
        if (wp && now && now.parent === target.id && String(now.slot).indexOf('wear-') === 0) tada(target);
        else if (item.kind === 'ticket' && now && now.parent === target.id && item.props.stamp === 'stamped') excited(target.id);
        return r;
      }
      return base.onDropInto ? base.onDropInto(item, target, ctx) : false;
    },
    onTap(e, ctx) {
      if (isChar(e) && onStage(e, rigStage) && (e.props.pose || 'stand') === 'stand') { bow(e); return true; }
      if (e.kind === 'ticket' && !e.parent && onCounter(e)) { stamp(e); return true; }
      return base.onTap ? base.onTap(e, ctx) : false;
    },
  });

  // ---- pieces: each copy's image, and its hit box (the thing a finger touches) ----
  const pieces = new Map();          // pid -> {copies: [{el, body, img, hit}], shown, gen}
  for (const pid of Object.keys(m.pieces || {})) {
    const p = m.pieces[pid];
    const copies = [];
    copyIds(pid, p).forEach((aid, i) => {
      const el = room.art.get(aid);
      if (!el) return;
      el.dataset.piece = pid;
      el.style.pointerEvents = 'none';
      const hit = document.createElement('div');
      hit.className = 'piece-hit';
      hit.dataset.piece = pid;
      hit.style.cssText = 'position:absolute;pointer-events:auto';
      el.appendChild(hit);
      copies.push({ el, body: el.firstChild, img: el.querySelector('img'), hit, copy: i });
    });
    if (!copies.length) continue;
    const rec = { copies, shown: null, gen: 0, hitFor: null };
    pieces.set(pid, rec);
    for (const c of copies) {
      if (PIECES[pid] && PIECES[pid].curtain && pid !== 'valance') input.register(c.hit, curtainHalf(pid));
      else input.register(c.hit, { onTap: () => tapPiece(pid, c.copy), pan: true });
    }
  }
  function placeHits(pid, variant) {
    const rec = pieces.get(pid);
    if (!rec || rec.hitFor === variant) return;
    rec.hitFor = variant;
    for (const c of rec.copies) {
      const b = hitBox(pid, m.pieces[pid], variant, c.copy);
      Object.assign(c.hit.style, { left: b[0] + 'px', top: b[1] + 'px', width: b[2] + 'px', height: b[3] + 'px' });
    }
  }
  const ropeEl = room.art.get('hit:curtain-rope');
  if (ropeEl) input.register(ropeEl, curtainRope());

  // P2b.5/P2b.6: the mic, tapes, boombox and voice filters.
  const sound = createSound({
    store, room, fx, chars, input, persist, m, THEATER_ID,
    cheer: (o) => cheer(o), performers: () => performers(),
    setOverride: (pid, v) => { if (v) overrides.set(pid, v); else overrides.delete(pid); renderPieces(); },
    bodyOf: (pid) => (pieces.get(pid) ? pieces.get(pid).copies[0].body : null),
    monitor: typeof location !== 'undefined' && new URLSearchParams(location.search).has('micmonitor'),
  });
  view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: sound.wrap(hooks), labels: textLabels(catalog, manifest) });
  sound.bind(view);
  // P2b.2: spotlights, flying scenery + ambience, the effects booth.
  show = createShow({
    store, stage, room, fx, chars, input, m, view: () => view, setProp, fprops, pieceState: (pid) => state(pid),
    setOverride: (pid, v) => { if (v) overrides.set(pid, v); else overrides.delete(pid); renderPieces(); },
    copiesOf: (pid) => (pieces.get(pid) ? pieces.get(pid).copies : null),
    performers: () => performers(), audience: () => audience(), cheer: (o) => cheer(o),
  });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);

  // ---- first visit ----
  const here = inRoom(store.state, THEATER_ID);
  if (firstVisit || !here.length) {
    seedTheater(store, { ...room.def, surfaces: allSurfaces }, m, { catalog });
    if (chars && !here.some((e) => e.kind === CHAR_KIND)) seedCharacters(store, chars.rig, { room: THEATER_ID, seats: chars.seats, placements: THEATER_CAST });
  }
  firstVisit = false;

  // ---- piece images ----
  const overrides = new Map();       // pid -> variant shown for a moment (a button press, the ticket window)
  function swap(pid, variant) {
    const rec = pieces.get(pid);
    const v = m.pieces[pid].variants[variant];
    if (!rec || !v || rec.shown === variant) return;
    rec.shown = variant;
    placeHits(pid, variant);
    const gen = ++rec.gen;
    for (const c of rec.copies) c.el.dataset.variant = variant;
    const pre = new Image();
    pre.src = v.file;
    const show = () => { if (rec.gen === gen) { for (const c of rec.copies) c.img.src = v.file; stats.swaps++; } };
    if (!rec.copies[0].img.getAttribute('src')) { show(); return; }
    (pre.decode ? pre.decode() : Promise.resolve()).then(show, show);
  }
  function renderPieces() {
    const props = fprops();
    for (const pid of pieces.keys()) if (!(show && show.owns(pid))) swap(pid, overrides.get(pid) || pieceVariant(pid, props, m.pieces));
    if (show) show.render(props);
  }

  // Inside surfaces follow the trunk lid; things in it hide and show.
  let openKey = null;
  function applyInside() {
    const open = Object.keys(inside).filter((sid) => isOpen(inside[sid]));
    const key = open.join(',');
    if (key === openKey) return false;
    openKey = key;
    const live = allSurfaces.filter((s) => !inside[s.id] || open.includes(s.id));
    room.def.surfaces.length = 0;
    room.def.surfaces.push(...live);
    for (const e of inRoom(store.state, THEATER_ID)) if (onInside(e)) view.repaint(e.id);
    return true;
  }

  const pieceCenter = (pid, copy = 0) => {
    const p = m.pieces[pid];
    const b = hitBox(pid, p, pieces.get(pid).shown || p.default, copy);
    const at = p.copies && p.copies[copy] ? p.copies[copy] : [p.x, p.y];
    return { x: at[0] + b[0] + b[2] / 2, y: at[1] + b[1] + b[3] * 0.45, w: b[2] };
  };
  const burstAt = (pid, type, o = {}, copy = 0) => {
    const c = pieceCenter(pid, copy);
    fx.burst(type, c.x, c.y, Object.assign({ count: 6, spread: Math.max(50, Math.min(160, c.w * 0.6)) }, o));
  };
  const playS = (s) => { if (s) view.play(s[0], s[1]); };
  const bodies = (pid) => pieces.get(pid).copies.map((c) => c.body);

  function press(pid, variant, ms) {
    overrides.set(pid, variant);
    renderPieces();
    later(ms, () => { overrides.delete(pid); renderPieces(); });
  }

  function tapPiece(pid, copy = 0) {
    const spec = PIECES[pid] || { react: 'wobble', sound: ['pop'] };
    stats.taps[pid] = (stats.taps[pid] || 0) + 1;
    const body = pieces.get(pid).copies[copy].body;
    if (spec.curtain) { stepCurtain(); return; }
    if (sound.onPieceTap(pid)) { tween.squish(body, { amount: 0.3 }); return; }
    if (show && show.onPieceTap(pid, copy)) return;
    if (spec.ticket) { ticketWindow(); return; }
    if (spec.toggle) {
      const next = nextToggle(pid, state(pid));
      setProp(pid, next);
      if (pid === 'trunk' && next === 'open') dropOffTrunk();
      playS(spec.sound && spec.sound[next]);
      if (spec.fx && spec.fx[next]) burstAt(pid, spec.fx[next]);
      tween.squish(body, { amount: 0.5, duration: 300 });
      return;
    }
    if (spec.press) {
      press(pid, spec.press, spec.ms);
      playS(spec.sound);
      tween.squish(body, { amount: 0.6 });
      burstAt(pid, 'sparkle', { count: 3 });
      return;
    }
    if (spec.react === 'shake') tween.shake(body, { amount: 0.5 });
    else if (spec.react === 'squish') tween.squish(body, { amount: 0.4 });
    else tween.wobble(body, { amount: 0.25 });
    playS(spec.sound);
    burstAt(pid, spec.fx || 'sparkle', { count: 4 }, copy);
  }

  // Opening the trunk: whatever was set on its lid slides off onto the floor in front.
  function dropOffTrunk() {
    const top = allSurfaces.find((s) => s.id === 'trunk-top');
    if (!top) return;
    for (const e of inRoom(store.state, THEATER_ID)) {
      if (Math.abs(e.y - top.y) >= ON_EPS || e.x < top.x0 - EDGE_TOL || e.x > top.x1 + EDGE_TOL) continue;
      const x = e.x, y = 930;
      if (store.dispatch('move', { id: e.id, room: THEATER_ID, x: r1(x), y, z: 0 })) view.animateFrom(e.id, e.x, e.y);
    }
  }

  // ---- the curtain ----
  let curtainDir = 1;
  const curtain = () => state('curtain-left');
  const COVER = { open: 148, half: 300, closed: 447 };
  function setCurtain(next) {
    const prev = curtain();
    if (next === prev || CURTAIN.indexOf(next) < 0) return false;
    setProp('curtain', next);
    stats.curtain++;
    const opening = CURTAIN.indexOf(next) < CURTAIN.indexOf(prev);
    curtainDir = opening ? -1 : 1;
    view.play('swoosh', { pitch: opening ? 1.15 : 0.95, gain: 0.8 });
    const k = COVER[prev] / COVER[next];
    for (const pid of ['curtain-left', 'curtain-right']) {
      tween.animate(pieces.get(pid).copies[0].body, [
        { transform: `scaleX(${k})` }, { transform: `scaleX(${1 + (opening ? -0.03 : 0.03)})`, offset: 0.7 }, { transform: 'scaleX(1)' },
      ], { duration: 420, easing: 'ease-out' });
    }
    tween.animate(pieces.get('valance').copies[0].body, [{ transform: 'scaleY(0.96)' }, { transform: 'scaleY(1.02)', offset: 0.6 }, { transform: 'scaleY(1)' }], { duration: 420, easing: 'ease-out' });
    if (opening && performers().length) later(260, () => cheer({ ooh: true }));
    return true;
  }
  function stepCurtain() {
    const s = curtainStep(curtain(), curtainDir);
    setCurtain(s.state);
    tween.wobble(pieces.get('valance').copies[0].body, { amount: 0.15, duration: 500 });
  }
  function curtainRope() {
    let pulled = 0;
    return {
      pan: false,
      onTap() { stepCurtain(); ropeWiggle(); },
      onDragStart() { pulled = 0; return true; },
      onDragMove(info) {
        // Every pull down the rope steps the curtain once.
        const n = Math.floor(Math.max(0, info.dy) / 70);
        if (n > pulled) { pulled = n; stepCurtain(); ropeWiggle(); }
      },
      onDragEnd() { if (!pulled) ropeWiggle(); },
    };
  }
  const ropeWiggle = () => { if (ropeEl) fx.burst('sparkle', m.slots.find((s) => s.id === 'curtain-rope').at[0], 640, { count: 3, spread: 40 }); };
  function curtainHalf(pid) {
    const sign = pid === 'curtain-left' ? 1 : -1;
    let from = null;
    return {
      pan: false,
      onTap() { tapPiece(pid); },
      onDragStart() { from = curtain(); return true; },
      onDragMove(info) {
        const want = curtainDrag(from, info.dx * sign);
        if (want !== curtain()) setCurtain(want);
      },
      onDragEnd() { from = null; },
    };
  }

  // ---- audience and performers ----
  const inTheater = () => inRoom(store.state, THEATER_ID);
  const audience = () => inTheater().filter((e) => isChar(e) && e.props.pose === 'sit' && audienceSeat(e.props.seat));
  const performers = () => inTheater().filter((e) => isChar(e) && onStage(e, rigStage));

  /** The seated audience reacts: an "ooh" (the curtain opened on someone), then applause and cheering arms. */
  function cheer({ ooh = false, roses = 0 } = {}) {
    const crowd = audience();
    if (!crowd.length) return;
    let at = 0;
    if (ooh) {
      stats.oohs++;
      view.play('ooh', { gain: 0.9 });
      for (const a of crowd) if (chars) chars.face(a.id, [['surprised', 800], ['happy', 1400]]);
      at = 650;
    }
    later(at, () => {
      stats.applause++;
      view.play('applause', { gain: Math.min(1, 0.6 + crowd.length * 0.1) });
      crowd.forEach((a, i) => {
        const up = { armL: [138, 18, 0], armR: [138, 18, 0] };
        const mid = { armL: [110, 40, 0], armR: [110, 40, 0] };
        later((i * 97) % 260, () => {
          if (!chars) return;
          chars.gesture(a.id, [[up, 230], [mid, 200], [up, 230], [mid, 200], [up, 260]], { face: ooh ? null : [['laughing', 900], ['happy', 900]] });
          const h = chars.anchor(a.id, 'head');
          if (h && i < 4) fx.burst('heart', h.x, h.y - 50, { count: 2, spread: 40 });
        });
      });
      if (roses) later(500, () => throwRoses(crowd, roses));
    });
  }

  /** Ta-da, a bow; the audience applauds and throws roses. */
  let bowing = 0;
  function bow(e) {
    const now = Date.now();
    const v = viewOf(e.id);
    if (now - bowing < 1400) { if (v) tween.wobble(v.body, { amount: 0.3 }); return; }
    bowing = now;
    stats.bows++;
    view.play('tada', { gain: 0.8 });
    if (chars) {
      chars.gesture(e.id, [[{ armL: [100, 30, 0], armR: [100, 30, 0], head: 0 }, 420], [{ armL: [30, -30, 0], armR: [30, -30, 0], head: 8 }, 620]], { face: [['happy', 420], ['love', 1400]] });
    }
    if (v) {
      // The dip of a bow (a front-on character can't fold): down and a little squashed, then up.
      tween.animate(v.body, [
        { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
        { transform: 'translate3d(0, 0, 0) scale(1, 1)', offset: 0.3 },
        { transform: 'translate3d(0, 16px, 0) scale(1.03, 0.9)', offset: 0.55 },
        { transform: 'translate3d(0, 16px, 0) scale(1.03, 0.9)', offset: 0.75 },
        { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
      ], { duration: 1200, easing: 'ease-in-out' });
      fx.burst('sparkle', v.x, v.y - 200, { count: 6, spread: 120 });
    }
    const crowd = audience();
    later(450, () => cheer({ roses: crowd.length ? Math.min(3, crowd.length) : 0 }));
  }

  /** Roses fly from the audience onto the stage (real things; the oldest go when there are too many). */
  function throwRoses(crowd, n) {
    const land = (m.slots || []).find((s) => s.id === 'rose-land');
    const stageS = allSurfaces.find((s) => s.id === 'stage');
    if (!land || !stageS) return;
    const box = land.box;
    const lo = Math.max(box[0], 1260), hi = box[0] + box[2] - 40;
    const from = crowd.slice().sort(() => Math.random() - 0.5).slice(0, n);
    from.forEach((a, i) => later(i * 180, () => {
      const id = store.newId();
      const x = r1(lo + Math.random() * (hi - lo));
      if (!store.dispatch('spawn', { id, kind: 'rose', room: THEATER_ID, x, y: stageS.y, z: Math.floor(Math.random() * 20), props: { thrown: true } })) return;
      stats.roses++;
      const h = (chars && chars.anchor(a.id, 'handR')) || { x: a.x, y: a.y - 150 };
      const v = viewOf(id);
      if (v) {
        const T = v.transform;
        const dx = h.x - v.x, dy = h.y - v.y;
        tween.animate(v.el, [
          { transform: `translate3d(${r1(dx)}px, ${r1(dy)}px, 0) ${T} rotate(-200deg)` },
          { transform: `translate3d(${r1(dx * 0.45)}px, ${r1(dy * 0.45 - 220)}px, 0) ${T} rotate(-90deg)`, offset: 0.5 },
          { transform: `${T} rotate(0deg)` },
        ], { duration: 820, easing: 'linear' });
        tween.squash(v.body, { delay: 820, amount: 0.7 });
      }
      later(820, () => { view.play('plink', { pitch: 1.2 }); fx.burst('sparkle', x, stageS.y - 20, { count: 4, spread: 50 }); });
      capRoses(id);
    }));
  }
  function capRoses(keep) {
    const roses = inTheater().filter((e) => e.kind === 'rose' && e.props && e.props.thrown).sort((a, b) => (a.id < b.id ? -1 : 1));
    while (roses.length > ROSE_CAP) {
      const old = roses.shift();
      if (old.id === keep) continue;
      const v = viewOf(old.id);
      if (v) fx.burst('puff', v.x, v.y - 20, { count: 4, scale: 0.5 });
      store.dispatch('remove', { id: old.id, hard: true });
    }
  }

  /** A wear piece went on at the theater: ta-da! */
  function tada(target) {
    stats.tadas++;
    later(160, () => view.play('tada', { gain: 0.7 }));
    const h = chars ? chars.anchor(target.id, 'head') : null;
    if (h) later(120, () => fx.burst('sparkle', h.x, h.y - 30, { count: 8, spread: 130 }));
  }
  function excited(id) {
    if (!chars) return;
    chars.face(id, [['wheee', 1200], ['happy', 800]]);
    view.play('cheer', { gain: 0.6 });
  }

  // ---- ticket booth ----
  const counter = () => allSurfaces.find((s) => s.id === 'ticket-counter');
  const onCounter = (e) => { const s = counter(); return !!s && Math.abs(e.y - s.y) < ON_EPS && e.x >= s.x0 - EDGE_TOL && e.x <= s.x1 + EDGE_TOL; };
  function ticketWindow() {
    const s = counter();
    tween.squish(pieces.get('ticket-window').copies[0].body, { amount: 0.4 });
    press('ticket-window', 'open', 1500);
    view.play('chime', { gain: 0.7 });
    if (!s) return;
    later(260, () => {
      const id = store.newId();
      const st = (m.stations || []).find((q) => q.id === 'ticket-window');
      const x = r1((st ? st.at[0] : 2606) + (Math.random() * 40 - 20));
      if (!store.dispatch('spawn', { id, kind: 'ticket', room: THEATER_ID, x, y: s.y, z: 5 })) return;
      stats.tickets++;
      view.animateFrom(id, x, s.y - 90);
      view.play('pop', { pitch: 1.2 });
      behaviors.enforceCap([id]);
    });
  }
  function stamp(e) {
    const v = viewOf(e.id);
    if (e.props.stamp === 'stamped') {
      if (v) tween.wobble(v.body, { amount: 0.4 });
      view.play('plink');
      return;
    }
    store.dispatch('set', { id: e.id, path: 'props.stamp', value: 'stamped' });
    stats.stamps++;
    view.play('clunk', { pitch: 1.1 });
    later(90, () => view.play('thud', { pitch: 1.3, gain: 0.7 }));
    if (v) {
      tween.squash(v.body, { amount: 1.3, delay: 60 });
      fx.burst('sparkle', v.x, v.y - 20, { count: 6, spread: 70 });
    }
    press('ticket-window', 'open', 500);
  }

  // ---- the vanity mirror twinkles for a character standing in front of it ----
  const mirror = (m.slots || []).find((s) => s.id === 'vanity-mirror');
  function checkMirror(e) {
    if (!mirror || !isChar(e) || e.parent || !((e.props.pose || 'stand') === 'stand' || e.props.seat === 'vanity-stool')) return;
    const [x0, , w] = mirror.box;
    if (e.x < x0 - 20 || e.x > x0 + w + 20 || e.y < m.floor.y0 - 1) return;
    stats.mirror++;
    const [bx, by, bw, bh] = mirror.box;
    later(250, () => {
      fx.burst('sparkle', bx + bw / 2, by + bh * 0.45, { count: 8, spread: bw * 0.8 });
      view.play('sparkle', { gain: 0.7 });
      if (chars) chars.face(e.id, [['love', 1400]]);
    });
  }

  applyInside();
  renderPieces();
  view.refresh();

  const unsubscribe = store.subscribe((st, env) => {
    applyInside();
    renderPieces();
    if (env && env.device === store.device && env.op === 'move' && env.args && env.args.id) {
      const e = getEntity(st, env.args.id);
      if (e && e.room === THEATER_ID) { checkMirror(e); if (show) show.onMove(e); }
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
    id: room.id, room, view, fx, catalog, behaviors, chars, tiles, sound, show,
    zones: m.zones,
    pieces: {
      ids: () => [...pieces.keys()],
      state,
      shown: (pid) => (pieces.get(pid) || {}).shown || null,
      /** The element a touch on the piece lands on (its hit box; copy i). */
      el: (pid, i = 0) => { const r = pieces.get(pid); return r && r.copies[i] ? r.copies[i].hit : null; },
      img: (pid, i = 0) => { const r = pieces.get(pid); return r && r.copies[i] ? r.copies[i].el : null; },
      tap: tapPiece,
    },
    curtain: { state: curtain, set: setCurtain, step: stepCurtain, rope: () => ropeEl },
    audience: () => audience().map((e) => e.id),
    performers: () => performers().map((e) => e.id),
    hidden: () => [...hidden],
    stats: () => ({ ...stats, taps: { ...stats.taps }, timers: timers.size }),
    surfaces: () => room.def.surfaces.map((s) => s.id),
    fixtures,
    /** Where things arriving by car stand: in the lobby, in a row. */
    arrivalSpot(i) { return { x: Math.round(2760 - i * 110), y: Math.round(905 + (i % 2) * 35) }; },
    destroy() {
      unsubscribe();
      offStage();
      sound.destroy();
      show.destroy();
      clearTimeout(camTimer);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const r of pieces.values()) for (const c of r.copies) input.unregister(c.hit);
      if (ropeEl) input.unregister(ropeEl);
      tiles.destroy();
      view.destroy();
      if (chars) chars.destroy();
      fx.clear();
      room.destroy();
      removeSource();
    },
  };
}

/** Image files the theater shows first (preloading before a transition). */
export function theaterFiles(manifest, { cameraX = null } = {}) {
  const m = manifest.rooms.theater;
  const x = cameraX == null ? zoneCamera(m, ARRIVE_ZONE) : cameraX;
  const near = (a, w) => a + w > x - 100 && a < x + 1540;
  const out = [];
  for (const L of m.layers) for (const t of L.tiles || [L]) if (near(t.x, t.w)) out.push(t.file);
  for (const p of Object.values(m.pieces || {})) if (near(p.x, p.w)) out.push(p.variants[p.default].file);
  return out;
}
