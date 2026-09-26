// The Character Maker booth (P1.15, docs/design.md 2.4): the photo-booth
// kiosk on the city map opens into a little dress-up parlour. Zero text:
// every choice is a picture button.
//
//   left: the room (assets/rooms/booth, tools/art/rooms/booth.mjs): a big
//         vanity mirror over a round stage, a criss-cross rug, a pouf. The
//         character being made stands on the stage, drawn big (the preview);
//         characters that are done stand on the floor like in any room (drag
//         them around, sit them down, carry them off in the pocket).
//   right: the maker panel: two columns of category tabs (body, skin, hair,
//         hair colour, eyes, brows, facial hair, cheeks, hat, glasses, top,
//         apron/vest, bottom, shoes, cape/wings), a grid of picture options
//         (each one a little render of the character wearing it), the
//         shuffle die and the photo-frame "done" button.
//
// The character on the stage is a `char` entity in MIRROR_ROOM (no room view
// shows that room), so every choice is a store op (char-maker.js) and the
// half-made character survives a reload and is shared with the other iPad.
// Done: a camera flash, and it hops off the stage onto the floor (a `move`
// into the booth), and a new random one appears. Restyle: drag a character
// onto the stage: it goes up (the old one hops down, or disappears if
// nobody touched it yet).
//
// Reactions: every change makes the preview wiggle with a happy face; the die
// makes it giggle; tapping it giggles or waves.

import { mountRoom } from '../engine/room.js';
import { createRoomView } from '../engine/view.js';
import { createFx } from '../engine/fx.js';
import { inRoom, childrenOf } from '../engine/world.js';
import { sfx, speech } from '../audio/index.js';
import { addSpriteSource } from '../engine/sprites.js';
import { loadCatalog } from '../core/catalog.js';
import { createBehaviors } from '../core/behaviors/index.js';
import { useArtSprites } from './art.js';
import { mountCharacters, seedCharacters } from '../engine/characters.js';
import { renderCharacter, bodyBox, faceSlot, resolveExpr } from '../engine/rig-svg.js';
import { CHAR_KIND, partsOf, specOf, wearSlotName } from '../engine/char-model.js';
import {
  MIRROR_ROOM, CATEGORIES, optionsOf, isChosen, chooseOps, randomLook, lookOps, patchFor, isRemovableCat,
} from '../engine/char-maker.js';
import { textLabels } from './kitchen.js';
import * as tween from '../engine/tween.js';

export const BOOTH_ID = 'booth';
export { MIRROR_ROOM };
const SVGNS = 'http://www.w3.org/2000/svg';
const PANEL_X = 880;                                  // world x where the maker panel starts
export const PREVIEW = { x: 444, y: 872, h: 560 };    // the stage: preview feet point and target height (world)
const ZONE = { x0: 250, x1: 640, y0: 700, y1: 1000 }; // drop a character here to restyle it
const TAB = { x: [945, 1047], y0: 112, dy: 108, d: 92 };
const OPT = { x: [1172, 1284, 1396], y0: 150, dy: 114, d: 104 };
const DICE = { x: 1200, y: 880, d: 132 };
const DONE = { x: 1360, y: 880, d: 132 };
const TAB_COLORS = ['#F79A4B', '#62B96B', '#4AA6E0', '#FFD552', '#A77BD6'];
// First visit: a couple of the starter cast hang out in the booth.
export const BOOTH_CAST = [{ cast: 'performer', seat: 'rug-1' }, { cast: 'boy9', seat: 'pouf-1' }];

/** The view-layer room definition for the booth, from its manifest entry. Pure. */
export function boothRoom(m, id = BOOTH_ID) {
  const floorTop = m.floor.y0;
  const baseline = Object.fromEntries(m.layers.map((L) => [L.id, L.baseline]));
  const depthOf = (layer) => (layer === 'back' ? floorTop : baseline[layer]);
  return {
    id,
    width: m.width,
    backdrop: { top: '#D5C8E3', bottom: '#E7BFA3', horizon: floorTop },
    // The floor stops at the panel, so nothing lands behind the buttons.
    floor: { top: floorTop, bottom: m.floor.y1, x0: 0, x1: PANEL_X - 20, sound: 'thud' },
    surfaces: m.surfaces.map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, y: s.y, depth: depthOf(s.layer), sound: 'knock' })),
    seats: (m.seats || []).map((s) => ({ id: s.id, x: s.at[0], y: s.at[1], depth: depthOf(s.layer) })),
    art: m.layers.map((L) => ({
      id: L.id, layer: L.id === 'back' ? 'back' : 'mid', depth: L.id === 'back' ? undefined : L.baseline,
      x: L.x, y: L.y, w: L.w, h: L.h, cls: 'art-img',
      html: `<img src="${L.file}" alt="" draggable="false" decoding="async">`,
    })),
  };
}

/** Image files the booth shows (for preloading before a transition). */
export const boothFiles = (manifest) => manifest.rooms.booth.layers.map((L) => L.file);

/** The character on the stage (the first char in MIRROR_ROOM), or null. Pure. */
export function draftOf(state) {
  return inRoom(state, MIRROR_ROOM).find((e) => e.kind === CHAR_KIND) || null;
}

// ---- icons (white, solid, no text) ----
const ICONS = {
  body: '<circle cx="14" cy="16" r="5"/><rect x="9" y="22" width="10" height="16" rx="5"/><circle cx="32" cy="10" r="7"/><rect x="25" y="18" width="14" height="24" rx="7"/>',
  skin: '<path d="M24 5 C13 5 5 13 5 23 C5 33 13 42 22 42 C26 42 26 38 24 35 C22 32 25 29 29 29 L34 29 C39 29 43 25 43 20 C43 11 34 5 24 5Z"/><circle cx="15" cy="21" r="3.5" fill="#F79A4B"/><circle cx="21" cy="13" r="3.5" fill="#F79A4B"/><circle cx="31" cy="13" r="3.5" fill="#F79A4B"/>',
  hair: '<circle cx="24" cy="27" r="14"/><path d="M8 26 C6 10 18 5 24 5 C32 5 43 10 40 26 C36 18 30 15 24 18 C18 15 12 18 8 26Z"/>',
  hairColor: '<path d="M24 4 C24 4 10 20 10 29 C10 37 16 43 24 43 C32 43 38 37 38 29 C38 20 24 4 24 4Z"/>',
  eyes: '<path d="M3 24 C10 12 38 12 45 24 C38 36 10 36 3 24Z"/><circle cx="24" cy="24" r="7" fill="#4AA6E0"/>',
  brows: '<path d="M6 18 Q14 9 22 16 L20 19 Q14 14 8 21Z M42 18 Q34 9 26 16 L28 19 Q34 14 40 21Z"/><circle cx="14" cy="29" r="4.5"/><circle cx="34" cy="29" r="4.5"/>',
  facial: '<path d="M24 22 C18 16 6 17 3 28 C10 26 16 28 24 26 C32 28 38 26 45 28 C42 17 30 16 24 22Z"/>',
  cheeks: '<circle cx="24" cy="24" r="19"/><circle cx="14" cy="28" r="4.5" fill="#A77BD6"/><circle cx="34" cy="28" r="4.5" fill="#A77BD6"/>',
  hat: '<path d="M10 30 C10 14 16 8 24 8 C32 8 38 14 38 30Z"/><rect x="4" y="30" width="40" height="7" rx="3.5"/>',
  face: '<circle cx="13" cy="25" r="9" fill="none" stroke="#fff" stroke-width="5"/><circle cx="35" cy="25" r="9" fill="none" stroke="#fff" stroke-width="5"/><rect x="20" y="22" width="8" height="4" rx="2"/>',
  top: '<path d="M16 6 L4 14 L9 23 L14 20 L14 42 L34 42 L34 20 L39 23 L44 14 L32 6 Q24 13 16 6Z"/>',
  over: '<path d="M17 5 L31 5 L31 16 L40 18 L37 43 L11 43 L8 18 L17 16Z"/>',
  bottom: '<path d="M11 5 L37 5 L40 43 L28 43 L24 18 L20 43 L8 43Z"/>',
  shoes: '<path d="M6 20 L18 20 Q20 28 30 29 L40 31 Q45 32 45 37 L45 40 L6 40Z"/>',
  back: '<path d="M16 5 L32 5 Q36 22 44 42 Q34 38 24 43 Q14 38 4 42 Q12 22 16 5Z"/>',
  dice: '<rect x="5" y="5" width="38" height="38" rx="9"/><g fill="#4AA6E0"><circle cx="15" cy="15" r="4"/><circle cx="33" cy="15" r="4"/><circle cx="24" cy="24" r="4"/><circle cx="15" cy="33" r="4"/><circle cx="33" cy="33" r="4"/></g>',
  done: '<rect x="4" y="7" width="40" height="34" rx="5"/><rect x="10" y="13" width="28" height="22" rx="2" fill="#62B96B"/><circle cx="24" cy="21" r="4.5"/><path d="M15 35 Q24 25 33 35Z"/>',
};

const CSS = `
.mk-panel{position:absolute;left:${PANEL_X + 6}px;top:14px;width:${1440 - PANEL_X - 12}px;height:972px;border-radius:44px;background:#FBF3E8;box-shadow:0 8px 0 rgba(0,0,0,.08);pointer-events:none}
.mk-ui{position:absolute;left:0;top:0;width:1440px;height:1000px;pointer-events:none}
.mk-btn{position:absolute;border-radius:50%;pointer-events:auto;touch-action:none}
.mk-btn::before{content:"";position:absolute;left:0;top:6%;width:100%;height:100%;border-radius:inherit;background:rgba(0,0,0,.16)}
.mk-face{position:absolute;inset:0;border-radius:inherit;border:7px solid #fff;overflow:hidden;transform-origin:50% 60%}
.mk-face::after{content:"";position:absolute;left:-10%;top:54%;width:120%;height:90%;background:rgba(0,0,0,.07);pointer-events:none}
.mk-btn svg.mk-icon{position:absolute;left:21%;top:21%;width:58%;height:58%;fill:#fff}
.mk-tab.is-on .mk-face{border-color:#3D2C29;border-width:6px}
.mk-tab.is-on{transform:scale(1.1)}
.mk-opt{border-radius:28px}
.mk-opt .mk-face{background:#fff;border:6px solid #fff}
.mk-opt.is-on .mk-face{border-color:#FFD552;border-width:8px}
.mk-opt .mk-face::after{display:none}
.mk-opt svg.mk-thumb{position:absolute;left:0;top:0;width:100%;height:100%}
.mk-preview{position:absolute;left:0;top:0;pointer-events:auto;touch-action:none}
.mk-pv-scale{position:absolute;left:0;top:0}
.mk-pv-scale svg{display:block;overflow:visible;animation:char-breathe 1.8s ease-in-out infinite alternate;transform-origin:50% 94%}
.mk-flash{position:absolute;left:${ZONE.x0 - 80}px;top:40px;width:${ZONE.x1 - ZONE.x0 + 160}px;height:900px;border-radius:60px;background:#fff;opacity:0;pointer-events:none}
`;
function ensureCss() {
  if (document.getElementById('maker-css')) return;
  const st = document.createElement('style');
  st.id = 'maker-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/** Mount the booth. opts: { input, store, manifest, carry (P1.14), random }. Resolves once it is up. */
export async function mountBooth(stage, { input, store, manifest, carry = null, random = Math.random }) {
  useArtSprites(manifest);
  const catalog = await loadCatalog();
  const removeSource = addSpriteSource((kind) => (catalog.has(kind) ? catalog.sprite(kind) : null));
  const room = mountRoom(stage, boothRoom(manifest.rooms.booth));
  const fx = createFx(room.fxLayer);
  const behaviors = createBehaviors({ catalog, store });
  const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
  const stats = { changes: 0, shuffles: 0, done: 0, restyled: 0, renders: 0, reactions: 0 };
  const isChar = (e) => e && e.kind === CHAR_KIND;
  const inZone = (x, y) => x >= ZONE.x0 && x <= ZONE.x1 && y >= ZONE.y0 && y <= ZONE.y1;
  let maker = null;

  // Characters dropped on the stage go up to be restyled.
  const base = chars ? chars.hooks : behaviors;
  const hooks = Object.assign({}, base, {
    dropSpot(e, x, y) {
      if (isChar(e) && maker && inZone(x, y)) return { id: 'booth-stage', x0: ZONE.x0 + 30, x1: ZONE.x1 - 30, y: PREVIEW.y, depth: PREVIEW.y };
      return base.dropSpot ? base.dropSpot(e, x, y) : null;
    },
    onDrop(e, ctx) {
      const v = ctx.view.viewOf(e.id);
      if (isChar(e) && maker && v && inZone(v.x, v.y)) { maker.restyle(e); return true; }
      return base.onDrop ? base.onDrop(e, ctx) : false;
    },
  });
  const view = createRoomView({ stage, store, input, room, fx, sfx, behaviors: carry ? carry.hooks(hooks, room) : hooks, labels: textLabels(catalog, manifest) });
  behaviors.bind(view, fx);
  if (chars) chars.bind(view, fx);
  if (chars && !inRoom(store.state, room.id).length && !draftOf(store.state)) {
    seedCharacters(store, chars.rig, { room: room.id, seats: chars.seats, placements: BOOTH_CAST });
  }
  if (chars) maker = createMaker({ stage, store, input, room, view, fx, rig: chars.rig, stats, random });

  return {
    id: room.id, room, view, fx, catalog, behaviors, chars, stats,
    get maker() { return maker; },
    destroy() { if (maker) maker.destroy(); view.destroy(); if (chars) chars.destroy(); fx.clear(); room.destroy(); removeSource(); },
  };
}

function createMaker({ store, input, room, view, fx, rig, stats, random }) {
  ensureCss();
  const K = rig.artScale;
  const regs = [];
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  let tab = 'body';
  let tFace = null;
  let lastSig = null;
  let busy = false;

  // ---- the draft (the character on the stage) ----
  const draft = () => draftOf(store.state);
  function lookOf(d) {
    const kids = childrenOf(store.state, d.id);
    const { worn } = partsOf(kids, rig);
    return { props: d.props, worn, kids };
  }
  function spawnDraft() {
    const look = randomLook(rig, random);
    const id = store.newId();
    look.props.fresh = true;          // nobody touched it yet: a restyle may replace it
    if (!store.dispatch('spawn', { id, kind: CHAR_KIND, room: MIRROR_ROOM, x: 0, y: 0, props: look.props })) return null;
    for (const p of look.pieces) store.dispatch('spawn', { id: store.newId(), kind: p.kind, parent: id, slot: wearSlotName(p.slot), props: { colors: p.colors } });
    return id;
  }
  function run(ops) {
    for (const [op, args] of ops) store.dispatch(op, args);
  }
  function touch(d) {
    if (d.props.fresh) store.dispatch('set', { id: d.id, path: 'props.fresh', value: false });
  }
  if (!draft()) spawnDraft();

  // ---- DOM ----
  const ui = document.createElement('div');
  ui.className = 'mk-ui';
  ui.dataset.noPan = '';
  ui.dataset.maker = '';
  ui.style.zIndex = '15000000';        // above room art and resting things, below a dragged one
  ui.innerHTML = `<div class="mk-panel"></div><div class="mk-flash"></div>
    <div class="mk-preview" data-mk="preview"><div class="mk-pv-scale"></div></div>`;
  room.depth.appendChild(ui);
  const flash = ui.querySelector('.mk-flash');
  const pv = ui.querySelector('.mk-preview');
  const pvScale = pv.firstChild;

  function button(cls, x, y, d, color, inner, data, onTap) {
    const el = document.createElement('div');
    el.className = 'mk-btn ' + cls;
    el.style.left = `${x - d / 2}px`;
    el.style.top = `${y - d / 2}px`;
    el.style.width = el.style.height = `${d}px`;
    el.innerHTML = `<div class="mk-face" style="background:${color}">${inner}</div>`;
    Object.assign(el.dataset, data);
    ui.appendChild(el);
    input.register(el, { onTap: () => onTap(el), minHit: 40 });
    regs.push(el);
    return el;
  }
  const icon = (name) => `<svg class="mk-icon" viewBox="0 0 48 48" aria-hidden="true">${ICONS[name]}</svg>`;

  const tabEls = {};
  CATEGORIES.forEach((cat, i) => {
    const x = TAB.x[i % 2], y = TAB.y0 + Math.floor(i / 2) * TAB.dy;
    tabEls[cat] = button('mk-tab', x, y, TAB.d, TAB_COLORS[i % TAB_COLORS.length], icon(cat), { mkTab: cat }, (el) => {
      if (tab === cat) { tween.squish(el.firstChild, { amount: 0.5 }); sfx.play('tap'); return; }
      tab = cat;
      tween.squish(el.firstChild, { amount: 0.6 });
      sfx.play('pop');
      showTabs();
      renderOptions();
    });
  });
  button('mk-dice', DICE.x, DICE.y, DICE.d, '#4AA6E0', icon('dice'), { mk: 'shuffle' }, (el) => shuffle(el));
  button('mk-done', DONE.x, DONE.y, DONE.d, '#62B96B', icon('done'), { mk: 'done' }, (el) => done(el));
  input.register(pv, { onTap: () => tapPreview(), minHit: 40 });
  regs.push(pv);

  function showTabs() {
    for (const cat of CATEGORIES) tabEls[cat].classList.toggle('is-on', cat === tab);
  }

  // ---- thumbnails ----
  function specFor(cat, value, look) {
    let props = look.props, worn = look.worn;
    if (isRemovableCat(cat)) {
      worn = Object.assign({}, worn);
      if (value) worn[cat] = worn[cat] && worn[cat].kind === value ? worn[cat] : { kind: value, props: {} };
      else delete worn[cat];
    } else props = Object.assign({}, props, patchFor(cat, value, props));
    return specOf(props, worn);
  }
  function cropFor(cat, spec, res) {
    const b = rig.bodies[spec.body];
    const hd = b.head, sk = b.skeleton;
    const [hx, hy] = res.anchors.head;
    if (cat === 'eyes' || cat === 'brows') return [hx - hd.rx * 0.8, hy - hd.ry * 0.62, hd.rx * 1.6, hd.ry * 1.25];
    if (cat === 'body') { const h = rig.bodies.adult.skeleton.height; return [-h * 0.42, -h * 1.06, h * 0.84, h * 1.12]; }
    if (cat === 'top' || cat === 'over' || cat === 'back') { const h = sk.height; return [-h * 0.5, -h * 1.04, h, h * 1.1]; }
    if (cat === 'bottom' || cat === 'shoes') { const top = sk.hipY - sk.legR * 2.5; const w = -top * 1.25; return [-w / 2, top, w, -top + 40]; }
    const up = cat === 'hat' ? 1.7 : 1.35;
    return [hx - hd.rx - 50, hy - hd.ry * up, hd.rx * 2 + 100, hd.ry * (up + 1.25)];
  }
  const optEls = [];
  function renderOptions() {
    const d = draft();
    for (const el of optEls) { input.unregister(el); el.remove(); const i = regs.indexOf(el); if (i >= 0) regs.splice(i, 1); }
    optEls.length = 0;
    if (!d) return;
    const look = lookOf(d);
    const opts = optionsOf(rig, tab);
    opts.forEach((value, i) => {
      const x = OPT.x[i % 3], y = OPT.y0 + Math.floor(i / 3) * OPT.dy;
      const spec = specFor(tab, value, look);
      const res = renderCharacter(rig, spec, { pose: 'stand', expr: 'happy', shadow: false });
      const vb = cropFor(tab, spec, res).map((n) => Math.round(n));
      const thumb = `<svg class="mk-thumb" xmlns="${SVGNS}" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" overflow="hidden">${res.svg}</svg>`;
      const el = button('mk-opt', x, y, OPT.d, '#fff', thumb, { mkOpt: String(i) }, (b) => choose(value, b));
      el.classList.toggle('is-on', isChosen(tab, value, look.props, look.worn));
      optEls.push(el);
    });
    stats.renders++;
  }
  function markChosen() {
    const d = draft();
    if (!d) return;
    const look = lookOf(d);
    const opts = optionsOf(rig, tab);
    optEls.forEach((el, i) => el.classList.toggle('is-on', isChosen(tab, opts[i], look.props, look.worn)));
  }

  // ---- preview ----
  let pvSpec = null;
  function renderPreview() {
    const d = draft();
    if (!d) { pvScale.innerHTML = ''; pvSpec = null; return; }
    const look = lookOf(d);
    const spec = specOf(look.props, look.worn);
    const res = renderCharacter(rig, spec, { pose: 'stand', expr: tFace || 'happy' });
    const vb = bodyBox(rig, spec.body);
    const h = rig.bodies[spec.body].skeleton.height;
    const s = Math.min(2, PREVIEW.h / (h * K));
    const w = vb[2] * K, hh = vb[3] * K, fx0 = -vb[0] * K, fy0 = -vb[1] * K;
    pvScale.innerHTML = `<svg xmlns="${SVGNS}" viewBox="${vb.join(' ')}" width="${Math.round(w)}" height="${Math.round(hh)}" overflow="visible">${res.svg}</svg>`;
    pvScale.style.transformOrigin = `${fx0}px ${fy0}px`;
    pvScale.style.transform = `scale(${s.toFixed(3)})`;
    pv.style.left = `${Math.round(PREVIEW.x - fx0)}px`;
    pv.style.top = `${Math.round(PREVIEW.y - fy0)}px`;
    pv.style.width = `${Math.round(w)}px`;
    pv.style.height = `${Math.round(hh)}px`;
    pv.style.transformOrigin = `${fx0}px ${fy0}px`;
    pv.dataset.body = spec.body;
    pvSpec = spec;
  }
  function setFace(expr) {
    if (!pvSpec) return;
    const atoms = resolveExpr(rig, expr || 'happy');
    for (const slot of ['eyes', 'brows', 'mouth', 'extras']) {
      const g = pvScale.querySelector(`[data-slot="${slot}"]`);
      if (g) g.innerHTML = faceSlot(rig, pvSpec, slot, atoms[slot]);
    }
  }
  let faceTimer = 0;
  function flashFace(expr, ms) {
    tFace = expr;
    setFace(expr);
    clearTimeout(faceTimer);
    faceTimer = later(ms, () => { tFace = null; setFace('happy'); });
  }
  // Blink every few seconds (only while nothing else is on its face).
  let blinkTimer = 0;
  function blinkLoop() {
    blinkTimer = later(2600 + random() * 3000, () => {
      if (!tFace && pvSpec) {
        const g = pvScale.querySelector('[data-slot="eyes"]');
        if (g) { g.innerHTML = faceSlot(rig, pvSpec, 'eyes', rig.blink); later(130, () => { if (!tFace) setFace('happy'); }); }
      }
      blinkLoop();
    });
  }
  blinkLoop();

  function wiggle() {
    stats.reactions++;
    tween.animate(pv, [
      { transform: 'rotate(0deg) scale(1, 1)' }, { transform: 'rotate(-5deg) scale(1.04, 0.96)', offset: 0.2 },
      { transform: 'rotate(4deg) scale(0.98, 1.03)', offset: 0.45 }, { transform: 'rotate(-2deg) scale(1.01, 0.99)', offset: 0.7 },
      { transform: 'rotate(0deg) scale(1, 1)' },
    ], { duration: 520, easing: 'ease-in-out' });
    flashFace(random() < 0.5 ? 'happy' : 'laughing', 900);
  }
  function giggle() {
    stats.reactions++;
    flashFace('laughing', 1200);
    sfx.play('giggle');
    tween.animate(pv, [
      { transform: 'translate3d(0, 0, 0)', easing: 'ease-out' }, { transform: 'translate3d(0, -40px, 0) rotate(-3deg)', offset: 0.4, easing: 'ease-in' },
      { transform: 'translate3d(0, 0, 0) scale(1.06, 0.94)', offset: 0.75 }, { transform: 'translate3d(0, 0, 0)' },
    ], { duration: 600 });
  }
  function tapPreview() {
    const r = random();
    if (r < 0.5) giggle();
    else {
      stats.reactions++;
      flashFace(r < 0.75 ? 'love' : 'cheeky', 1100);
      sfx.play(r < 0.75 ? 'bell' : 'boing');
      tween.wobble(pv, { amount: 0.6 });
      fx.burst('heart', PREVIEW.x, PREVIEW.y - PREVIEW.h * 0.8, { count: 4, spread: 80 });
    }
  }

  // ---- choices ----
  function choose(value, el) {
    const d = draft();
    if (!d || busy) return;
    const look = lookOf(d);
    const ops = chooseOps(rig, d.id, look.props, look.worn, tab, value, () => store.newId());
    tween.squish(el.firstChild, { amount: 0.6 });
    if (!ops.length) { sfx.play('tap'); wiggle(); return; }
    stats.changes++;
    touch(d);
    run(ops);
    sfx.play(isRemovableCat(tab) || ['top', 'bottom', 'shoes'].includes(tab) ? 'sparkle' : 'plink', { pitch: 0.9 + random() * 0.3 });
    fx.burst('sparkle', PREVIEW.x, PREVIEW.y - PREVIEW.h * (tab === 'shoes' || tab === 'bottom' ? 0.2 : 0.7), { count: 6, spread: 90 });
    wiggle();
  }
  function shuffle(el) {
    const d = draft();
    if (!d || busy) return;
    stats.shuffles++;
    tween.animate(el.firstChild, [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(200deg) scale(1.15)', offset: 0.6 }, { transform: 'rotate(360deg) scale(1)' }], { duration: 520, easing: 'ease-out' });
    sfx.play('boing', { pitch: 1.2 });
    const look = lookOf(d);
    touch(d);
    run(lookOps(d.id, look.props, look.worn, randomLook(rig, random), () => store.newId()));
    fx.burst('sparkle', PREVIEW.x, PREVIEW.y - PREVIEW.h * 0.5, { count: 10, spread: 160 });
    giggle();
  }
  function floorSpot() {
    const here = inRoom(store.state, BOOTH_ID).filter((e) => e.kind === CHAR_KIND && !e.props.seat);
    const xs = [690, 170, 800, 80, 610, 280];
    const x = xs[here.length % xs.length] + (Math.floor(here.length / xs.length) % 3) * 24;
    return { x, y: 930 - (here.length % 3) * 22 };
  }
  /** Send the stage character down onto the floor (a pop out of the mirror). */
  function popOut(d) {
    const p = floorSpot();
    for (const [k, v] of [['pose', 'stand'], ['seat', null], ['raise', null], ['expr', 'happy'], ['fresh', null]]) {
      if (JSON.stringify(d.props[k] === undefined ? null : d.props[k]) !== JSON.stringify(v)) store.dispatch('set', { id: d.id, path: 'props.' + k, value: v });
    }
    if (!store.dispatch('move', { id: d.id, room: BOOTH_ID, x: p.x, y: p.y, z: 0 })) return false;
    view.animateFrom(d.id, PREVIEW.x, PREVIEW.y - 160);
    return true;
  }
  function done(el) {
    const d = draft();
    if (!d || busy) return;
    busy = true;
    stats.done++;
    tween.squish(el.firstChild, { amount: 0.7 });
    sfx.play('clink');
    tween.animate(flash, [{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
    later(200, () => {
      const cur = draft();
      if (cur && popOut(cur)) {
        sfx.play('cheer', { gain: 0.6 });
        fx.burst('sparkle', PREVIEW.x, PREVIEW.y - 200, { count: 12, spread: 200 });
      }
      spawnDraft();
      giggle();
      busy = false;
    });
  }
  /** A character dropped on the stage: it goes up; the one there hops down (or goes, if untouched). */
  function restyle(e) {
    const old = draft();
    if (old && old.id !== e.id) {
      if (old.props.fresh) {
        for (const k of childrenOf(store.state, old.id)) store.dispatch('remove', { id: k.id, hard: true });
        store.dispatch('remove', { id: old.id, hard: true });
      } else popOut(old);
    }
    for (const [k, v] of [['pose', 'stand'], ['seat', null], ['raise', null]]) {
      if (JSON.stringify(e.props[k] === undefined ? null : e.props[k]) !== JSON.stringify(v)) store.dispatch('set', { id: e.id, path: 'props.' + k, value: v });
    }
    store.dispatch('move', { id: e.id, room: MIRROR_ROOM, x: 0, y: 0, z: 0 });
    stats.restyled++;
    sfx.play('sparkle');
    fx.burst('sparkle', PREVIEW.x, PREVIEW.y - PREVIEW.h * 0.5, { count: 12, spread: 160 });
    later(30, giggle);
  }

  // ---- store sync: redraw when the stage character changes ----
  function sigOf() {
    const d = draft();
    if (!d) return 'none';
    const { taps, expr, fresh, ...p } = d.props;
    return d.id + JSON.stringify(p) + childrenOf(store.state, d.id).map((c) => c.slot + c.kind + JSON.stringify((c.props && c.props.colors) || null)).join(',');
  }
  function sync() {
    const s = sigOf();
    if (s === lastSig) return;
    lastSig = s;
    renderPreview();
    renderOptions();
  }
  const unsubscribe = store.subscribe(() => sync());
  showTabs();
  sync();

  return {
    get tab() { return tab; },
    get draftId() { const d = draft(); return d ? d.id : null; },
    restyle,
    destroy() {
      unsubscribe();
      for (const t of timers) clearTimeout(t);
      for (const el of regs) input.unregister(el);
      ui.remove();
    },
  };
}
