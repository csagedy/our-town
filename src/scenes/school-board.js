// The school's teaching wall (P2d.2, docs/design.md 3.4 rows 4-6, 4 "reading
// layers"): the letter wall, the letter magnets, the sight-word board, the
// calendar + weather board (and the classroom window that follows it) and the
// teacher's picture cards. Mounted by school.js, which hands it its helpers:
//
//   const board = createSchoolBoard({ stage, store, room, view, fx, chars, catalog, manifest,
//                                     speech, isSpeechOn, popArt, later, setFix, fprops, ... });
//
// Play, never a quiz: nothing is ever wrong, nothing waits for an answer.
// - LETTER WALL: tap a letter: it pops out and bounces, the voice says its
//   name, its sound and a word ("B... buh... ball!") and the word's picture
//   (an existing prop sprite; a star where none fits) pops up under it. A
//   drag from a letter pulls out a LETTER MAGNET (entity `letter-magnet`,
//   props.ch) that sticks on the whiteboard rows (surfaces wb-row-*) or the
//   floor; dropped back on the wall it goes home. Magnets side by side in a
//   row that spell a word from MAGNET_WORDS: a cheer and the voice reads it.
// - SIGHT WORDS: the blank cards get big friendly words (the one place the
//   classroom shows text: the reading layer; marked data-reading). Two pages
//   of 8 (the round turn button under the board flips them; fixtures prop
//   `sight-page`). Tap a card: it wiggles, the voice reads it and the nearest
//   kid says it again. Voice off: a wiggle and a plink.
// - WEATHER: tap the calendar's weather slot: sun -> cloud -> rain -> snow;
//   the window outside changes to match (fixtures props `weather-today` and
//   `class-window`), rain or snow falls behind the glass for a few seconds
//   (a finite WAAPI loop, capped; a tap on the window or the slot starts it
//   again), and the kids near the window react. A weather card dropped on the
//   slot sets it too.
// - CALENDAR: tap today's dot (the week row's dot for today, or the month's
//   "today" dot): a sticker star (fixtures prop `cal-star` = the date) and
//   "Today is Monday!" from the device's date. Other week dots say their day.
// - TEACHER: tap the teacher (cast `teacher` or anyone wearing the lanyard):
//   she holds up a random picture card, the voice says it and the kids
//   respond: line up -> they hop to the footprints, story time -> they sit on
//   the rug, clean up -> classroom supplies on the floor hop back to their
//   bins (never a kid's arrangement: see cleanUpPlan), the others -> a wiggle.
//
// Speech is on-device only (audio/speech.js). Idle: nothing runs while
// nobody touches it (every reaction is a finite tween or a tracked timeout).

import { getEntity, inRoom, childrenOf } from '../engine/world.js';
import * as tween from '../engine/tween.js';
import { ON_EPS, EDGE_TOL } from '../engine/surfaces.js';

const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Pure data

/** Per letter: [TTS name, TTS sound, word, sprite, variant]. sprite null = a star. */
export const LETTERS = {
  A: ['A', 'ah', 'apple', 'apple', 'whole'],
  B: ['B', 'buh', 'ball', 'ball', 'default'],
  C: ['C', 'kuh', 'cake', 'cake-slice', 'whole'],
  D: ['D', 'duh', 'duck', 'rubber-duck', 'default'],
  E: ['E', 'eh', 'egg', 'egg', 'whole'],
  F: ['F', 'fff', 'fish', 'fish', 'raw'],
  G: ['G', 'guh', 'gift', 'gift', 'closed'],
  H: ['H', 'huh', 'hat', 'top-hat', 'default'],
  I: ['I', 'ih', 'ice cream', 'cone', 'default'],
  J: ['J', 'juh', 'juice', 'juice', 'full'],
  K: ['K', 'kuh', 'king', 'crown', 'gold'],
  L: ['L', 'lll', 'lemon', 'lemon', 'whole'],
  M: ['M', 'mmm', 'milk', 'milk', 'default'],
  N: ['N', 'nnn', 'noodles', 'pasta', 'cooked'],
  O: ['O', 'ah', 'onion', 'onion', 'whole'],
  P: ['P', 'puh', 'pizza', 'pizza', 'whole'],
  Q: ['Q', 'kwuh', 'queen', 'tiara', 'default'],
  R: ['R', 'rrr', 'robot', 'toy-robot', 'default'],
  S: ['S', 'sss', 'sun', 'weather-card', 'sun'],
  T: ['T', 'tuh', 'teddy', 'teddy', 'default'],
  U: ['U', 'uh', 'up', null, null],
  V: ['V', 'vvv', 'van', 'toy-car', 'default'],
  W: ['W', 'wuh', 'wand', 'wand', 'still'],
  X: ['X', 'ks', 'box', 'show-tell-box', 'closed'],
  Y: ['Y', 'yuh', 'yellow', 'crayon', 'yellow'],
  Z: ['Z', 'zzz', 'zoom', null, null],
};

/** The picture for a letter: {file, w, h} from the manifest, or null (draw a star). Pure. */
export function letterPicture(manifest, ch) {
  const L = LETTERS[ch];
  const p = L && L[3] && manifest.props && manifest.props[L[3]];
  const v = p && (p.variants[L[4]] || p.variants[p.default]);
  if (!v || !v.file) return null;
  const size = v.size || [60, 60];
  const s = 84 / Math.max(size[0], size[1]);
  return { file: v.file, w: r1(size[0] * s), h: r1(size[1] * s) };
}

/** Pre-K/K sight words, two pages of 8 (the board has 8 blank cards). */
export const SIGHT_WORDS = ['the', 'I', 'a', 'see', 'can', 'like', 'go', 'is', 'my', 'we', 'you', 'and', 'to', 'me', 'it', 'up'];
export const sightWord = (page, i) => SIGHT_WORDS[((page ? 1 : 0) * 8 + i) % SIGHT_WORDS.length];

/** Words the magnets can spell (lower case; the letters are capitals). */
export const MAGNET_WORDS = ['cat', 'dog', 'sun', 'mom', 'dad', 'ian', 'zoe', 'hi', 'pig', 'bus', 'hat', 'cup', 'bed', 'yes', 'fun', 'love', 'up', 'go', 'run', 'car'];

/**
 * Letter magnets in rows: items [{id, ch, x, y, w}] (feet point, drawn width).
 * Magnets whose feet are within `dy` of each other and whose centres are no
 * more than 1.5 widths apart chain into one row. Returns [{ids, word}] (word
 * in lower case, left to right). Pure.
 */
export function magnetRows(items, { dy = 22 } = {}) {
  const left = items.slice().sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
  const used = new Set();
  const rows = [];
  for (const a of left) {
    if (used.has(a.id)) continue;
    const row = [a];
    used.add(a.id);
    let last = a;
    for (const b of left) {
      if (used.has(b.id) || b.x < last.x) continue;
      if (Math.abs(b.y - a.y) > dy) continue;
      if (b.x - last.x > Math.max(last.w, b.w) * 1.5) break;
      row.push(b);
      used.add(b.id);
      last = b;
    }
    rows.push({ ids: row.map((q) => q.id), word: row.map((q) => q.ch).join('').toLowerCase() });
  }
  return rows;
}

/** The weather after `w` on the calendar (blank starts at sun). Pure. */
export const WEATHERS = ['sun', 'cloud', 'rain', 'snow'];
export function nextWeather(w) {
  const i = WEATHERS.indexOf(w);
  return WEATHERS[(i + 1) % WEATHERS.length];
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "2026-09-26" for a Date (local time). Pure. */
export const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The teacher's picture cards: id -> {say, pic, react}. pic: ['sprite', kind,
 * variant] | ['crop', layerBox] (a schedule/feelings picture cut from the
 * room art) | ['svg', markup]. react: what the kids do.
 */
const INK = 'stroke="#3D2C29" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const FOOT = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse cx="0" cy="0" rx="11" ry="17" fill="#8CBDB8" ${INK}/><circle cx="-7" cy="-22" r="4" fill="#8CBDB8" ${INK}/><circle cx="1" cy="-25" r="4" fill="#8CBDB8" ${INK}/><circle cx="9" cy="-21" r="3.5" fill="#8CBDB8" ${INK}/></g>`;
export const TEACHER_CARDS = {
  'line-up': { say: 'line up!', react: 'line', pic: ['svg', `<svg viewBox="0 0 120 100">${FOOT(30, 70, -8)}${FOOT(62, 48, 6)}${FOOT(94, 70, -8)}</svg>`] },
  'clean-up': { say: 'clean up!', react: 'tidy', pic: ['sprite', 'blocks', 'default'] },
  'wash-hands': {
    say: 'wash your hands!', react: 'wash',
    pic: ['svg', `<svg viewBox="0 0 120 100"><path d="M38 88 L38 50 Q38 42 45 42 Q52 42 52 50 L52 30 Q52 22 59 22 Q66 22 66 30 L66 26 Q66 18 73 18 Q80 18 80 26 L80 34 Q80 27 87 27 Q94 27 94 35 L94 70 Q94 88 76 92 L52 92 Q40 92 38 88 Z" fill="#F4C9A8" ${INK}/><circle cx="24" cy="30" r="10" fill="#DDF1F7" ${INK}/><circle cx="20" cy="58" r="7" fill="#DDF1F7" ${INK}/><circle cx="104" cy="16" r="8" fill="#DDF1F7" ${INK}/><circle cx="108" cy="52" r="6" fill="#DDF1F7" ${INK}/></svg>`],
  },
  'snack-time': { say: 'snack time!', react: 'yum', pic: ['crop', 'schedule', 'snack'] },
  'story-time': { say: 'story time!', react: 'rug', pic: ['crop', 'schedule', 'story'] },
  recess: { say: 'recess!', react: 'cheer', pic: ['crop', 'schedule', 'recess'] },
  quiet: { say: 'quiet, please. shhh', react: 'quiet', pic: ['crop', 'feelings', 'calm'] },
};
export const CARD_IDS = Object.keys(TEACHER_CARDS);

// "Clean up!" (bead q62.26): only classroom supplies lying on the FLOOR go
// back to their bins. Never characters, food, things on a surface (a table,
// a shelf, the whiteboard) or inside something, things from other places, or
// letter magnets that are part of a row (a kid's word).
export const SUPPLY_TAGS = ['crayon', 'marker', 'paper', 'book', 'block', 'buildpiece', 'magnet', 'chalk', 'glue', 'cut', 'stamp', 'puzzle', 'paint'];
export const NEVER_TAGS = ['food', 'snack', 'lunch', 'drink', 'sweet', 'spawner', 'hotspot', 'container', 'stock'];
export const CLEANUP_MAX = 8;

/**
 * Which things "clean up!" sends home: [{id, to}] (to = the bin entity id, or
 * 'wall' for a lone letter magnet). Pure. items: the room's top-level
 * entities; o: { roomId, floorY0, surfaces: [{x0, x1, y}], tagsOf(kind),
 * homeOf(kind), fixedOf(kind), binFor(entity) -> id | null, magnetKind,
 * rowOf(id) -> magnet count in its row, hasKids(id) }.
 */
export function cleanUpPlan(items, o) {
  const out = [];
  for (const e of items) {
    if (out.length >= CLEANUP_MAX) break;
    if (!e || e.parent || e.kind === 'char' || e.room !== o.roomId) continue;
    if (o.fixedOf(e.kind) || (o.hasKids && o.hasKids(e.id))) continue;
    const tags = o.tagsOf(e.kind) || [];
    if (tags.some((t) => NEVER_TAGS.includes(t))) continue;
    if (!tags.some((t) => SUPPLY_TAGS.includes(t))) continue;
    // On the floor: in the floor band and not resting on any surface.
    if (!(e.y >= o.floorY0 - 1)) continue;
    if (o.surfaces.some((sf) => Math.abs(e.y - sf.y) < ON_EPS && e.x >= sf.x0 - EDGE_TOL && e.x <= sf.x1 + EDGE_TOL)) continue;
    if (e.kind === o.magnetKind) {
      if (o.rowOf(e.id) > 1) continue;   // part of a row: a kid's word, it stays
      out.push({ id: e.id, to: 'wall' });
      continue;
    }
    // A school thing: its catalog home is this place, or it came out of a bin here.
    const bin = o.binFor(e);
    const home = o.homeOf(e.kind);
    if (!bin) continue;
    if (!(home && home.room === o.roomId) && !(typeof e.props.from === 'string' && e.props.from === bin)) continue;
    out.push({ id: e.id, to: bin });
  }
  return out;
}

/** Is this character the teacher (her cast, or anyone wearing the lanyard)? Pure. */
export function isTeacher(state, e) {
  if (!e || e.kind !== 'char') return false;
  if (e.props && e.props.cast === 'teacher') return true;
  return childrenOf(state, e.id).some((k) => k.kind === 'lanyard');
}

const STAR_SVG = '<svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M20 3 L25 14.5 L37.5 15.6 L28 24 L30.8 36.4 L20 30 L9.2 36.4 L12 24 L2.5 15.6 L15 14.5 Z" fill="#F2C75C" stroke="#3D2C29" stroke-width="2.6" stroke-linejoin="round"/></svg>';
const TURN_SVG = '<svg viewBox="0 0 48 48" width="100%" height="100%"><circle cx="24" cy="24" r="21" fill="#FFFDF6" stroke="#3D2C29" stroke-width="3"/><path d="M14 20 A11 11 0 0 1 33 17" fill="none" stroke="#4AA6E0" stroke-width="4" stroke-linecap="round"/><path d="M34 10 L34 19 L25 18" fill="none" stroke="#4AA6E0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 28 A11 11 0 0 1 15 31" fill="none" stroke="#E4846F" stroke-width="4" stroke-linecap="round"/><path d="M14 38 L14 29 L23 30" fill="none" stroke="#E4846F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const WORD_FONT = '700 27px/1 ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", -apple-system, system-ui, sans-serif';

export const MAGNET_KIND = 'letter-magnet';
export const MAGNET_W = 54;
export const RAIN_MAX = 14;
export const WEATHER_MS = 6000;   // how long rain / snow falls after a tap

// ---------------------------------------------------------------------------
// Runtime

export function createSchoolBoard(ctx) {
  const { stage, store, room, view, fx, chars, manifest, catalog, speech, isSpeechOn, popArt, later, setFix, fprops, charsHere, anchor, viewOf, onScreen, SCHOOL_ID, behaviors } = ctx;
  const m = manifest.rooms.school;
  const R = m.rigs || {};
  const poses = chars && chars.rig ? chars.rig.poses : {};
  const stats = { letters: 0, lastLetter: '', pictures: 0, magnets: 0, homes: 0, words: [], sight: 0, lastSight: '', repeats: 0, flips: 0, weather: 0, drops: 0, reacts: 0, days: 0, stars: 0, cards: 0, lastCard: '', lineups: 0, rugs: 0, tidies: 0, cleaned: 0, lastCleanUp: [], spoken: [], plinks: 0 };
  let forced = null;
  let lastCard = null;

  const speak = (texts, { interrupt = true, pitch, rate } = {}) => {
    const list = [].concat(texts);
    for (const t of list) { stats.spoken.push(t); if (stats.spoken.length > 24) stats.spoken.shift(); }
    if (!isSpeechOn()) return false;
    list.forEach((t, i) => speech.say(t, Object.assign({ interrupt: interrupt && i === 0 }, pitch ? { pitch } : {}, rate ? { rate } : {})));
    return true;
  };
  const voiceOn = () => isSpeechOn();
  const back = m.layers.find((L) => L.id === 'back');

  /** An element showing a crop of the back layer art (world box), drawn at scale s. */
  function cropEl(box, s = 1, radius = 6) {
    const [x, y, w, h] = box;
    const src = (back.tiles && back.tiles.length ? back.tiles : [back]).filter((t) => t.x < x + w && t.x + t.w > x && t.y < y + h && t.y + t.h > y);
    const clip = document.createElement('div');
    clip.style.cssText = `position:absolute;left:0;top:0;width:${r1(w * s)}px;height:${r1(h * s)}px;overflow:hidden;border-radius:${radius}px`;
    clip.innerHTML = src.map((t) => `<img alt="" draggable="false" src="${t.file}" style="position:absolute;left:${r1((t.x - x) * s)}px;top:${r1((t.y - y) * s)}px;width:${r1(t.w * s)}px;height:${r1(t.h * s)}px;max-width:none">`).join('');
    return clip;
  }
  /** Something popping up at world (x, y) (its centre) for `ms`, then gone. */
  function popUp(inner, x, y, w, h, ms = 1500, { rise = 16 } = {}) {
    const outer = document.createElement('div');
    outer.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;transform:translate3d(${r1(x - w / 2)}px, ${r1(y - h / 2)}px, 0);pointer-events:none`;
    const body = document.createElement('div');
    body.style.cssText = 'position:absolute;inset:0;transform-origin:50% 80%;opacity:0';
    body.appendChild(inner);
    outer.appendChild(body);
    room.fxLayer.appendChild(outer);
    const a = tween.animate(body, [
      { transform: 'translate3d(0, 10px, 0) scale(0.2)', opacity: 0 },
      { transform: `translate3d(0, ${-rise}px, 0) scale(1.15)`, opacity: 1, offset: 0.1 },
      { transform: `translate3d(0, ${-rise * 0.6}px, 0) scale(0.96)`, opacity: 1, offset: 0.17 },
      { transform: `translate3d(0, ${-rise * 0.7}px, 0) scale(1)`, opacity: 1, offset: 0.24 },
      { transform: `translate3d(0, ${-rise * 0.7}px, 0) scale(1)`, opacity: 1, offset: 0.85 },
      { transform: `translate3d(0, ${-rise}px, 0) scale(0.6)`, opacity: 0 },
    ], { duration: ms, easing: 'ease-out' });
    tween.done(a).then(() => outer.remove(), () => outer.remove());
    return outer;
  }

  // ---- the letter wall ----
  const letterBox = (ch) => { const L = (R.letters || []).find((q) => q.ch === ch); return L ? L.box : null; };
  function tapLetter(ch) {
    const L = LETTERS[ch];
    const box = letterBox(ch);
    if (!L || !box) return;
    stats.letters++;
    stats.lastLetter = ch;
    popArt(box, 'back');
    view.play('pop', { pitch: 0.9 + (ch.charCodeAt(0) - 65) / 50 });
    if (!speak([L[0] + '.', L[1] + '.', L[2] + '!'])) {
      [0, 350, 700].forEach((t, k) => later(t, () => { stats.plinks++; view.play('plink', { note: (ch.charCodeAt(0) - 65) % 7 + 1 + k * 2, gain: 0.7 }); }));
    }
    // The word's picture pops up under the letter.
    const pic = letterPicture(manifest, ch);
    const inner = document.createElement('div');
    inner.dataset.letterPic = ch;
    inner.style.cssText = 'position:absolute;inset:0;border-radius:18px;background:#FFFDF6;border:3px solid #3D2C29;box-sizing:border-box;box-shadow:0 4px 0 rgba(61,44,41,0.18)';
    const W = 104, H = 104;
    if (pic) inner.innerHTML = `<img alt="" draggable="false" src="${pic.file}" data-sprite="${L[3]}" style="position:absolute;left:${r1((W - pic.w) / 2)}px;top:${r1((H - pic.h) / 2)}px;width:${pic.w}px;height:${pic.h}px">`;
    else inner.innerHTML = `<div data-sprite="star" style="position:absolute;left:14px;top:14px;width:76px;height:76px">${STAR_SVG}</div>`;
    const cx = Math.min(Math.max(box[0] + box[2] / 2, 1210), 2130);
    // Under the wall (never over the other letters).
    const py = (WALL ? WALL[3] : box[1] + box[3]) + H / 2 + 6;
    popUp(inner, cx, py, W, H, 2400);
    stats.pictures++;
    later(900, () => { fx.burst('sparkle', cx, py, { count: 5, spread: 70 }); view.play('sparkle', { gain: 0.5 }); });
  }

  // Magnets: the letter tile cut from the wall art.
  const magnetSprites = new Map();
  function magnetSprite(ch) {
    let s = magnetSprites.get(ch);
    if (s) return s;
    const box = letterBox(ch) || [0, 0, 66, 59];
    const k = MAGNET_W / box[2];
    s = {
      key: 'magnet:' + ch, draw: 'custom', w: MAGNET_W, h: r1(box[3] * k), sound: 'clack',
      paint(body) {
        body.textContent = '';
        const c = cropEl(box, k, 9);
        c.style.boxShadow = '0 3px 0 rgba(61,44,41,0.25)';
        body.appendChild(c);
      },
    };
    magnetSprites.set(ch, s);
    return s;
  }
  function letterDrag(ch) {
    return {
      pan: false,
      onDragStart(info) {
        const s = magnetSprite(ch);
        const id = store.newId();
        const x = Math.round(info.x), y = Math.round(info.y + s.h * 0.45);
        if (!store.dispatch('spawn', { id, kind: MAGNET_KIND, room: SCHOOL_ID, x, y, props: { ch } })) return false;
        const h = view.handoff(id, info);
        if (!h) return false;
        info.data.h = h;
        stats.magnets++;
        popArt(letterBox(ch), 'back');
        view.play('clack', { pitch: 1.2 });
        if (behaviors.enforceCap) behaviors.enforceCap([id]);
        const v = viewOf(id);
        return v ? { el: v.el, lift: { target: v.lift, shadow: v.el.firstChild } } : false;
      },
      onDragMove(info) { if (info.data.h) info.data.h.move(info); },
      onDragEnd(info) { if (info.data.h) info.data.h.end(info); },
    };
  }
  const dragHandlers = new Map();
  const WALL = (() => {
    const L = R.letters || [];
    if (!L.length) return null;
    const xs = L.map((q) => q.box[0]), ys = L.map((q) => q.box[1]);
    return [Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...L.map((q) => q.box[0] + q.box[2])) + 10, Math.max(...L.map((q) => q.box[1] + q.box[3])) + 24];
  })();
  function magnets() {
    const out = [];
    for (const e of inRoom(store.state, SCHOOL_ID)) {
      if (e.kind !== MAGNET_KIND || e.parent || typeof e.props.ch !== 'string') continue;
      const v = viewOf(e.id);
      out.push({ id: e.id, ch: e.props.ch, x: e.x, y: e.y, w: v ? v.sprite.w * v.scale : MAGNET_W });
    }
    return out;
  }
  const cheered = new Map();   // row word -> ids key (don't cheer the same row twice in a row)
  function checkWords(id) {
    const row = magnetRows(magnets()).find((r) => r.ids.includes(id));
    if (!row || row.ids.length < 2 || !MAGNET_WORDS.includes(row.word)) return null;
    const key = row.ids.slice().sort().join(',');
    if (cheered.get(row.word) === key) return null;
    cheered.set(row.word, key);
    stats.words.push(row.word);
    const es = row.ids.map((q) => getEntity(store.state, q)).filter(Boolean);
    const cx = es.reduce((s, e) => s + e.x, 0) / es.length;
    const cy = es[0].y - 30;
    view.play('tada', { gain: 0.8 });
    later(200, () => view.play('cheer', { gain: 0.7 }));
    fx.burst('sparkle', cx, cy, { count: 10, spread: 60 + es.length * 20 });
    es.forEach((e, i) => later(i * 90, () => { const v = viewOf(e.id); if (v) tween.animate(v.body, [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-18px,0)', offset: 0.4 }, { transform: 'translate3d(0,0,0)' }], { duration: 380, easing: 'ease-out' }); }));
    const word = row.word === 'ian' ? 'Ian' : row.word === 'zoe' ? 'Zoe' : row.word;
    speak(word + '!');
    cheerNearest(cx, cy);
    return row.word;
  }
  function cheerNearest(x, y) {
    const e = nearestKid(x, y, { anyone: true });
    if (!e || !chars) return;
    stats.reacts++;
    if (poses.cheer) chars.gesture(e.id, [[armsOf(poses.cheer), 320], [armsOf(poses.stand || {}), 200], [armsOf(poses.cheer), 320]], { face: [['laughing', 1200]] });
    else chars.face(e.id, [['laughing', 1200]]);
  }
  const armsOf = (p) => ({ armL: p.armL, armR: p.armR });
  function nearestKid(x, y, { anyone = false, not = null } = {}) {
    let best = null, bd = Infinity;
    for (const e of charsHere()) {
      if (e.id === not || (!anyone && isTeacher(store.state, e))) continue;
      const v = viewOf(e.id);
      if (!v || v.held || !onScreen(e.x)) continue;
      const d = Math.hypot(e.x - x, (e.y - y) * 0.5);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function magnetDrop(e, v) {
    const cy = v ? v.y - (v.sprite.h * v.scale) / 2 : e.y;
    const cx = v ? v.x : e.x;
    if (WALL && cx >= WALL[0] && cx <= WALL[2] && cy <= WALL[3]) {
      // Back on the wall: it goes home (the letter bounces to say thanks).
      stats.homes++;
      fx.burst('puff', cx, cy, { count: 4, spread: 30, scale: 0.6 });
      view.play('whoosh', { pitch: 1.3 });
      const box = letterBox(e.props.ch);
      if (box) popArt(box, 'back');
      store.dispatch('remove', { id: e.id, hard: true });
      return true;
    }
    later(260, () => { if (getEntity(store.state, e.id)) checkWords(e.id); });
    return false;
  }
  function tapMagnet(e) {
    const L = LETTERS[e.props.ch];
    view.play('clack', { pitch: 1.1 });
    const v = viewOf(e.id);
    if (v) tween.squish(v.body, { amount: 0.7 });
    if (L && !speak(L[0] + '.')) view.play('plink', { note: (e.props.ch.charCodeAt(0) - 65) % 7 + 1 });
    return true;
  }

  // ---- sight words ----
  const CARDS = (R.sightWords && R.sightWords.cards) || [];
  const page = () => (fprops()['sight-page'] ? 1 : 0);
  const wordEls = [];
  CARDS.forEach((_, i) => {
    const hit = room.art.get('hit:sight-' + i);
    if (!hit) return;
    const w = document.createElement('div');
    w.className = 'school-word';
    w.dataset.reading = 'sight';
    w.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 10px 0 16px;box-sizing:border-box;color:#3D2C29;font:${WORD_FONT};letter-spacing:0.5px;pointer-events:none;transform-origin:50% 50%;white-space:nowrap`;
    hit.appendChild(w);
    wordEls[i] = w;
  });
  let shownPage = -1;
  function renderWords(animate = false) {
    const p = page();
    if (p === shownPage) return;
    shownPage = p;
    wordEls.forEach((w, i) => {
      if (!w) return;
      const set = () => { w.textContent = sightWord(p, i); };
      if (!animate) { set(); return; }
      later(i * 40 + 120, set);
      tween.animate(w, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1, 0.05)', offset: 0.45 }, { transform: 'scale(1, 0.05)', offset: 0.55 }, { transform: 'scale(1, 1)' }], { duration: 300, delay: i * 40, easing: 'ease-in-out' });
    });
  }
  const flipEl = room.art.get('hit:sight-flip');
  if (flipEl) flipEl.innerHTML = TURN_SVG;
  function flipSight() {
    stats.flips++;
    setFix('sight-page', page() ? 0 : 1);
    renderWords(true);
    view.play('swoosh', { gain: 0.7 });
    if (flipEl) tween.animate(flipEl.firstChild, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }], { duration: 360, easing: 'ease-in-out' });
  }
  function tapSight(i) {
    const box = CARDS[i];
    const w = wordEls[i];
    if (!box) return;
    const word = sightWord(page(), i);
    stats.sight++;
    stats.lastSight = word;
    const hit = room.art.get('hit:sight-' + i);
    if (hit) tween.animate(hit, [
      { transform: `translate3d(${box[0]}px, ${box[1]}px, 0) rotate(0deg)` }, { transform: `translate3d(${box[0]}px, ${box[1] - 4}px, 0) rotate(-6deg) scale(1.1)`, offset: 0.2 },
      { transform: `translate3d(${box[0]}px, ${box[1] - 4}px, 0) rotate(5deg) scale(1.1)`, offset: 0.45 }, { transform: `translate3d(${box[0]}px, ${box[1]}px, 0) rotate(-3deg)`, offset: 0.7 },
      { transform: `translate3d(${box[0]}px, ${box[1]}px, 0) rotate(0deg)` },
    ], { duration: 520, easing: 'ease-out' });
    if (w && !hit) tween.wobble(w, { amount: 0.4 });
    view.play('plink', { note: (i % 7) + 2, gain: 0.8 });
    stats.plinks++;
    fx.burst('sparkle', box[0] + box[2] / 2, box[1] + box[3] / 2, { count: 5, spread: 60 });
    if (!voiceOn()) return;
    speak(word === 'I' ? 'I.' : word + '.');
    // A kid nearby says it again (a brighter voice, a little cheer).
    const kid = nearestKid(box[0] + box[2] / 2, 700);
    if (kid) {
      stats.repeats++;
      speak(word === 'I' ? 'I!' : word + '!', { interrupt: false, pitch: 1.55, rate: 1 });
      later(700, () => { if (chars) chars.face(kid.id, [['singing', 700], ['happy', 500]]); if (chars && poses.cheer) chars.gesture(kid.id, [[{ armR: poses.cheer.armR }, 380]]); });
    }
  }

  // ---- weather ----
  const winPiece = m.pieces && m.pieces['class-window'];
  const winEl = room.art.get('piece:class-window');
  let rainBox = null;
  let rainAnims = [];
  if (winEl && winPiece) {
    // The glass (the piece box minus its frame and sill); particles only fall here.
    const gx = 0.13, gy = 0.1, gw = 0.74, gh = 0.72;
    rainBox = document.createElement('div');
    rainBox.className = 'school-weatherfx';
    rainBox.style.cssText = `position:absolute;left:${r1(winPiece.w * gx)}px;top:${r1(winPiece.h * gy)}px;width:${r1(winPiece.w * gw)}px;height:${r1(winPiece.h * gh)}px;overflow:hidden;pointer-events:none`;
    winEl.appendChild(rainBox);
  }
  const weather = () => { const w = fprops()['weather-today']; return WEATHERS.includes(w) ? w : null; };
  function stopFalling() {
    for (const a of rainAnims) a.cancel();
    rainAnims = [];
    if (rainBox) rainBox.textContent = '';
  }
  function startFalling(w) {
    stopFalling();
    if (!rainBox || (w !== 'rain' && w !== 'snow')) return 0;
    const W = parseFloat(rainBox.style.width), H = parseFloat(rainBox.style.height);
    const n = RAIN_MAX;
    const snow = w === 'snow';
    const dur = snow ? 2600 : 700;
    for (let k = 0; k < n; k++) {
      const d = document.createElement('div');
      const x = r1(((k + 0.5) / n) * W + (((k * 37) % 11) - 5));
      d.style.cssText = snow
        ? `position:absolute;left:${x}px;top:-12px;width:9px;height:9px;border-radius:50%;background:#FFFFFF;border:1.5px solid #9FB7C9;box-sizing:border-box`
        : `position:absolute;left:${x}px;top:-24px;width:3px;height:18px;border-radius:2px;background:#7F9FC4;transform:rotate(12deg)`;
      rainBox.appendChild(d);
      const drift = snow ? ((k % 3) - 1) * 14 : -6;
      const a = tween.animate(d, [
        { transform: `translate3d(0, 0, 0)${snow ? '' : ' rotate(12deg)'}` },
        { transform: `translate3d(${drift}px, ${H + 40}px, 0)${snow ? '' : ' rotate(12deg)'}` },
      ], { duration: dur, delay: ((k * 211) % dur), iterations: Math.max(1, Math.round((WEATHER_MS - dur) / dur)), easing: 'linear', fill: 'backwards' });
      rainAnims.push(a);
    }
    const all = rainAnims.slice();
    Promise.all(all.map((a) => tween.done(a).catch(() => null))).then(() => { if (rainAnims.length && rainAnims.every((a) => all.includes(a))) stopFalling(); });
    return n;
  }
  const WEATHER_SOUND = { sun: ['chime', { pitch: 1.2 }], cloud: ['whoosh', { pitch: 0.7 }], rain: ['splash', { gain: 0.7 }], snow: ['sparkle', { pitch: 0.8 }] };
  const WEATHER_FACE = { sun: [['happy', 1200]], cloud: [['surprised', 700], ['neutral', 700]], rain: [['surprised', 700], ['laughing', 800]], snow: [['wheee', 1200]] };
  function setWeather(w, { sound = true } = {}) {
    if (!WEATHERS.includes(w)) return;
    stats.weather++;
    setFix('weather-today', w);
    setFix('class-window', w);
    const p = m.pieces['weather-today'];
    if (p) fx.burst(w === 'snow' ? 'sparkle' : w === 'rain' ? 'drop' : w === 'sun' ? 'sparkle' : 'puff', p.x + p.w / 2, p.y + p.h / 2, { count: 5, spread: 60 });
    if (sound) { const s = WEATHER_SOUND[w]; view.play(s[0], s[1]); }
    if (isSpeechOn()) speak(w === 'sun' ? 'sunny!' : w === 'cloud' ? 'cloudy!' : w === 'rain' ? 'rainy!' : 'snowy!');
    startFalling(w);
    reactToWeather(w);
  }
  function reactToWeather(w) {
    if (!chars || !winPiece) return;
    const cx = winPiece.x + winPiece.w / 2;
    const near = charsHere().filter((e) => Math.abs(e.x - cx) < 460 && onScreen(e.x) && !(viewOf(e.id) || {}).held);
    near.slice(0, 5).forEach((e, i) => later(250 + i * 120, () => {
      stats.reacts++;
      chars.face(e.id, WEATHER_FACE[w]);
      if ((w === 'sun' || w === 'snow') && poses.wave && (e.props.pose || 'stand') === 'stand') chars.gesture(e.id, [[armsOf(poses.wave), 280], [armsOf(poses.wave2 || poses.wave), 280], [armsOf(poses.wave), 280]]);
    }));
  }
  function tapWeatherSlot() { setWeather(nextWeather(weather())); }
  function tapWindow() {
    const w = weather() || 'sun';
    const p = pieces('class-window');
    if (p) tween.wobble(p, { amount: 0.15, duration: 400 });
    const s = WEATHER_SOUND[w];
    view.play(s[0], s[1]);
    startFalling(w);
    reactToWeather(w);
  }
  const pieces = (pid) => { const el = room.art.get('piece:' + pid); return el ? el.firstChild : null; };
  function weatherCardDrop(e, v) {
    const p = m.pieces['weather-today'];
    if (!p || !v || typeof e.props.weather !== 'string') return false;
    const cx = v.x, cy = v.y - (v.sprite.h * v.scale) / 2;
    if (cx < p.x - 30 || cx > p.x + p.w + 30 || cy < p.y - 30 || cy > p.y + p.h + 30) return false;
    stats.drops++;
    fx.burst('puff', cx, cy, { count: 4, spread: 30, scale: 0.6 });
    store.dispatch('remove', { id: e.id, hard: true });
    setWeather(e.props.weather);
    return true;
  }

  // ---- calendar ----
  const CAL = R.calendar || {};
  const todayDot = CAL.monthDots ? CAL.monthDots[(CAL.doneThrough != null ? CAL.doneThrough : 11) + 1] : null;
  const calHit = room.art.get('hit:calendar');
  const calOrigin = (() => { const h = ctx.hitBox('calendar'); return h ? [h[0], h[1]] : [0, 0]; })();
  let starEl = null;
  let ringEl = null;
  function renderCalendar() {
    const today = dateKey(ctx.now());
    const on = fprops()['cal-star'] === today;
    if (calHit && todayDot && !starEl) {
      starEl = document.createElement('div');
      starEl.className = 'school-cal-star';
      const s = 30;
      starEl.style.cssText = `position:absolute;left:${r1(todayDot[0] - calOrigin[0] - s / 2)}px;top:${r1(todayDot[1] - calOrigin[1] - s / 2)}px;width:${s}px;height:${s}px;pointer-events:none;visibility:hidden`;
      starEl.innerHTML = STAR_SVG;
      calHit.appendChild(starEl);
      const wd = CAL.weekDots && CAL.weekDots[ctx.now().getDay()];
      if (wd) {
        ringEl = document.createElement('div');
        const rr = (CAL.dotRadius || 8.4) + 5;
        ringEl.style.cssText = `position:absolute;left:${r1(wd[0] - calOrigin[0] - rr)}px;top:${r1(wd[1] - calOrigin[1] - rr)}px;width:${r1(rr * 2)}px;height:${r1(rr * 2)}px;border-radius:50%;border:3px solid #3D2C29;box-sizing:border-box;pointer-events:none;visibility:hidden`;
        calHit.appendChild(ringEl);
      }
    }
    if (starEl) starEl.style.visibility = on ? '' : 'hidden';
    if (ringEl) ringEl.style.visibility = on ? '' : 'hidden';
  }
  function tapCalendar(info) {
    const now = ctx.now();
    const day = DAYS[now.getDay()];
    const dots = [];
    (CAL.weekDots || []).forEach((p, i) => dots.push({ p, week: i }));
    (CAL.monthDots || []).forEach((p, i) => dots.push({ p, month: i }));
    let hit = null, bd = Infinity;
    if (info && typeof info.x === 'number') for (const d of dots) { const dd = Math.hypot(d.p[0] - info.x, d.p[1] - info.y); if (dd < bd) { bd = dd; hit = d; } }
    const monthToday = (CAL.doneThrough != null ? CAL.doneThrough : 11) + 1;
    const isToday = !hit || bd > 26 || hit.week === now.getDay() || hit.month === monthToday;
    if (!isToday && hit.week != null) {
      // Another day of the week: the voice names it.
      view.play('plink', { note: hit.week + 1, gain: 0.8 });
      stats.plinks++;
      fx.burst('sparkle', hit.p[0], hit.p[1], { count: 3, spread: 30, scale: 0.7 });
      speak(DAYS[hit.week] + '!');
      return;
    }
    if (!isToday) {
      view.play('plink', { note: (hit.month % 7) + 1, gain: 0.6 });
      stats.plinks++;
      fx.burst('sparkle', hit.p[0], hit.p[1], { count: 3, spread: 30, scale: 0.7 });
      return;
    }
    // Today: a sticker star on today's dot, and the day out loud.
    stats.days++;
    const first = fprops()['cal-star'] !== dateKey(now);
    setFix('cal-star', dateKey(now));
    renderCalendar();
    if (first) stats.stars++;
    if (starEl) tween.animate(starEl, [{ transform: 'scale(0.2) rotate(-40deg)' }, { transform: 'scale(1.5) rotate(10deg)', offset: 0.5 }, { transform: 'scale(1) rotate(0deg)' }], { duration: 480, easing: 'ease-out' });
    view.play('tada', { gain: 0.6 });
    if (todayDot) fx.burst('sparkle', todayDot[0], todayDot[1], { count: 8, spread: 50 });
    if (!speak('Today is ' + day + '!')) view.play('chime', { pitch: 1.2 });
  }

  // ---- the teacher's picture cards ----
  function cardPicture(card) {
    const W = 150, H = 128;
    const inner = document.createElement('div');
    inner.dataset.card = card;
    inner.style.cssText = 'position:absolute;inset:0;border-radius:16px;background:#FFFDF6;border:4px solid #3D2C29;box-sizing:border-box;box-shadow:0 5px 0 rgba(61,44,41,0.2)';
    const pic = TEACHER_CARDS[card].pic;
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:10px;top:8px;right:10px;bottom:8px';
    if (pic[0] === 'svg') holder.innerHTML = pic[1].replace('<svg ', '<svg width="100%" height="100%" ');
    else if (pic[0] === 'sprite') {
      const p = manifest.props[pic[1]];
      const v = p && (p.variants[pic[2]] || p.variants[p.default]);
      if (v) { const s = Math.min(118 / v.size[0], 100 / v.size[1]); holder.innerHTML = `<img alt="" draggable="false" src="${v.file}" style="position:absolute;left:${r1((122 - v.size[0] * s) / 2)}px;top:${r1((104 - v.size[1] * s) / 2)}px;width:${r1(v.size[0] * s)}px;height:${r1(v.size[1] * s)}px">`; }
      else holder.innerHTML = STAR_SVG;
    } else {
      const box = pic[1] === 'schedule' ? ((R.schedule || []).find((c) => c.id === pic[2]) || {}).box
        : (() => { const f = (R.feelings || []).find((q) => q.id === pic[2]); return f ? [f.at[0] - f.r, f.at[1] - f.r, f.r * 2, f.r * 2] : null; })();
      if (box) {
        const s = Math.min(112 / box[2], 100 / box[3]);
        const c = cropEl(box, s, 8);
        c.style.left = r1((122 - box[2] * s) / 2) + 'px';
        c.style.top = r1((104 - box[3] * s) / 2) + 'px';
        holder.appendChild(c);
      } else holder.innerHTML = STAR_SVG;
    }
    inner.appendChild(holder);
    return { inner, W, H };
  }
  function pickCard() {
    if (forced) { const c = forced; forced = null; return c; }
    const pool = CARD_IDS.filter((c) => c !== lastCard);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function teacherTap(e) {
    const card = pickCard();
    lastCard = card;
    stats.cards++;
    stats.lastCard = card;
    const C = TEACHER_CARDS[card];
    const head = anchor(e.id, 'head') || { x: e.x, y: e.y - 200 };
    const { inner, W, H } = cardPicture(card);
    popUp(inner, head.x, Math.max(H / 2 + 8, head.y - 150), W, H, 2800, { rise: 20 });
    view.play('swoosh', { pitch: 1.2 });
    later(180, () => view.play('pop', { pitch: 1.1 }));
    if (chars) {
      const hu = poses['hold-up'];
      if (hu) chars.gesture(e.id, [[armsOf(hu), 1500], [armsOf(hu), 900]], { face: [['happy', 2400]] });
      else chars.face(e.id, [['happy', 2000]]);
    }
    if (!speak(C.say)) later(200, () => view.play('chime', { pitch: 1.1 }));
    later(900, () => kidsDo(C.react, e));
    return card;
  }
  const kids = (teacher) => charsHere().filter((k) => k.id !== teacher.id && !isTeacher(store.state, k) && !(viewOf(k.id) || {}).held);
  /** Move kids onto free seats (ids in order), nearest first. */
  function toSeats(list, seatIds, spot) {
    const seats = (chars ? chars.seats : []).filter((s) => seatIds.includes(s.id)).sort((a, b) => seatIds.indexOf(a.id) - seatIds.indexOf(b.id));
    const taken = new Set(charsHere().map((k) => k.props.seat).filter(Boolean));
    const free = seats.filter((s) => !taken.has(s.id));
    const todo = list.filter((k) => !seatIds.includes(k.props.seat)).sort((a, b) => Math.abs(a.x - spot) - Math.abs(b.x - spot));
    let n = 0;
    todo.forEach((k, i) => {
      const s = free[i];
      if (!s) return;
      n++;
      later(i * 160, () => {
        const cur = getEntity(store.state, k.id);
        const v = viewOf(k.id);
        if (!cur || cur.room !== SCHOOL_ID || cur.parent || (v && v.held)) return;
        const from = { x: cur.x, y: cur.y };
        store.dispatch('set', { id: k.id, path: 'props.pose', value: s.pose || 'stand' });
        store.dispatch('set', { id: k.id, path: 'props.seat', value: s.id });
        if (!store.dispatch('move', { id: k.id, room: SCHOOL_ID, x: r1(s.x), y: r1(s.y), z: 0 })) return;
        view.animateFrom(k.id, from.x, Math.min(from.y, s.y) - 60);
        view.play('boing', { pitch: 1.1 + i * 0.08, gain: 0.6 });
        later(420, () => { fx.burst('puff', s.x, s.y, { count: 3, spread: 30, scale: 0.5 }); if (chars) chars.face(k.id, [['happy', 900]]); });
      });
    });
    return n;
  }
  // Clean up: floor supplies hop back to their bins, one note each, then a tada.
  function binFor(e) {
    const here = inRoom(store.state, SCHOOL_ID);
    if (typeof e.props.from === 'string') { const s = here.find((q) => q.id === e.props.from); if (s) return s.id; }
    let best = null, bd = Infinity;
    for (const s of here) {
      const k = catalog.get(s.kind);
      const sp = k && (k.behaviors || []).find((b) => b.use === 'spawner');
      if (!sp || !(sp.kinds || []).includes(e.kind)) continue;
      const d = Math.abs(s.x - e.x);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? best.id : null;
  }
  function cleanUp() {
    stats.tidies++;
    const rows = magnetRows(magnets());
    const rowOf = (id) => { const r = rows.find((q) => q.ids.includes(id)); return r ? r.ids.length : 0; };
    const plan = cleanUpPlan(inRoom(store.state, SCHOOL_ID).filter((e) => !e.parent), {
      roomId: SCHOOL_ID, floorY0: m.floor.y0, surfaces: room.def.surfaces,
      tagsOf: (k) => (catalog.get(k) ? catalog.get(k).tags || [] : []), homeOf: (k) => catalog.homeOf(k),
      fixedOf: (k) => { const c = catalog.get(k); return !!(c && c.fixed); },
      binFor, magnetKind: MAGNET_KIND, rowOf, hasKids: (id) => childrenOf(store.state, id).length > 0,
    });
    stats.cleaned = (stats.cleaned || 0) + plan.length;
    stats.lastCleanUp = plan.map((p) => p.id);
    const tune = [1, 3, 5, 3, 5, 6, 8, 6];
    plan.forEach((p, i) => later(i * 220, () => {
      const e = getEntity(store.state, p.id);
      const v = viewOf(p.id);
      if (!e || (v && v.held)) return;
      let tx, ty;
      if (p.to === 'wall') { const b = letterBox(e.props.ch) || [e.x, 60, 0, 0]; tx = b[0] + b[2] / 2; ty = b[1] + b[3] / 2; }
      else { const s = getEntity(store.state, p.to); tx = s ? s.x : e.x; ty = s ? s.y - 30 : e.y - 100; }
      view.play('plink', { note: tune[i % tune.length], gain: 0.7 });
      const go = () => {
        if (!getEntity(store.state, p.id)) return;
        store.dispatch('remove', { id: p.id, hard: true });
        fx.burst('sparkle', tx, ty, { count: 4, spread: 40 });
        if (p.to === 'wall') { const b = letterBox(e.props.ch); if (b) popArt(b, 'back'); }
      };
      if (v && v.lift) {
        const dx = r1(tx - e.x), dy = r1(ty - e.y);
        const a = tween.animate(v.lift, [
          { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
          { transform: `translate3d(${r1(dx * 0.5)}px, ${r1(Math.min(dy, 0) * 0.5 - 90)}px, 0) scale(0.9)`, opacity: 1, offset: 0.5 },
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.4)`, opacity: 0 },
        ], { duration: 460, easing: 'ease-in-out' });
        tween.done(a).then(go);
      } else go();
    }));
    later(plan.length * 220 + 420, () => view.play('tada', { gain: 0.6 }));
    return plan;
  }
  function kidsDo(react, teacher) {
    const list = kids(teacher);
    if (react === 'line') {
      stats.lineups++;
      const ids = (R.line && R.line.spots ? R.line.spots : []).map((_, i) => `line-${i + 1}`);
      toSeats(list, ids, (R.line && R.line.spots && R.line.spots[0][0]) || 700);
      for (let k = 0; k < 4; k++) later(k * 260, () => view.play('knock', { pitch: k % 2 ? 0.7 : 0.9, gain: 0.6 }));
      return;
    }
    if (react === 'rug') {
      stats.rugs++;
      toSeats(list, (R.rug && R.rug.seats) || [], 1900);
      return;
    }
    if (react === 'tidy') cleanUp();
    // Everyone else: a quick happy reaction (hands up, a munch, bubbles, a hush).
    list.filter((k) => onScreen(k.x)).slice(0, 6).forEach((k, i) => later(i * 110, () => {
      if (!chars) return;
      stats.reacts++;
      if (react === 'quiet') { chars.face(k.id, [[{ eyes: 'closed', brows: 'none', mouth: 'smile', extras: 'blush' }, 1400]]); return; }
      if (react === 'yum') { chars.face(k.id, [['yum', 1200]]); view.play('munch', { gain: 0.4, pitch: 1 + i * 0.1 }); return; }
      if (react === 'wash') { const h = anchor(k.id, 'handR'); if (h) fx.burst('bubble', h.x, h.y, { count: 3, spread: 30, scale: 0.6 }); chars.face(k.id, [['laughing', 900]]); return; }
      if (poses.cheer) chars.gesture(k.id, [[armsOf(poses.cheer), 380], [armsOf(poses.stand || {}), 200], [armsOf(poses.cheer), 380]], { face: [['laughing', 1100]] });
    }));
    if (react === 'cheer') later(200, () => view.play('cheer', { gain: 0.6 }));
  }

  renderWords(false);
  renderCalendar();
  // Coming back to a rainy day: it rains for a moment, then stops.
  if (weather() === 'rain' || weather() === 'snow') startFalling(weather());

  return {
    stats: () => ({ ...stats, words: stats.words.slice(), spoken: stats.spoken.slice(), falling: rainAnims.filter((a) => a.playState === 'running').length, drops: stats.drops }),
    /** A letter hit area's drag handlers (a drag pulls out a magnet). */
    letterHandlers(id) { let h = dragHandlers.get(id); if (!h) { h = letterDrag(id.slice(7)); dragHandlers.set(id, h); } return h; },
    /** A tap on a hit area; true if the board answered it. */
    tapHit(id, info) {
      if (id.indexOf('letter-') === 0) { tapLetter(id.slice(7)); return true; }
      if (id === 'sight-flip') { flipSight(); return true; }
      if (id.indexOf('sight-') === 0) { tapSight(Number(id.slice(6))); return true; }
      if (id === 'calendar') { tapCalendar(info); return true; }
      return false;
    },
    tapPiece(pid) {
      if (pid === 'weather-today') { tapWeatherSlot(); return true; }
      if (pid === 'class-window') { tapWindow(); return true; }
      return false;
    },
    /** Hook: a tap on an entity. True if handled. */
    onTap(e) {
      if (e.kind === MAGNET_KIND) return tapMagnet(e);
      if (isTeacher(store.state, e)) { teacherTap(e); return true; }
      return false;
    },
    /** Hook: a drop (before the view settles it). True if handled. */
    onDrop(e, dropCtx) {
      const v = dropCtx && dropCtx.view ? dropCtx.view.viewOf(e.id) : viewOf(e.id);
      if (e.kind === MAGNET_KIND) return magnetDrop(e, v);
      if (e.kind === 'weather-card') return weatherCardDrop(e, v);
      return false;
    },
    spriteOf: (e) => (e.kind === MAGNET_KIND && typeof e.props.ch === 'string' ? magnetSprite(e.props.ch) : null),
    /** After any store change. */
    render() { renderWords(true); renderCalendar(); },
    weather,
    setWeather,
    page,
    magnets: () => magnets(),
    rows: () => magnetRows(magnets()),
    checkWords,
    /** Tests / Zoe's parent: the next teacher card (else random). */
    forceCard(c) { forced = TEACHER_CARDS[c] ? c : null; },
    teacherTap,
    cleanUp,
    destroy() { stopFalling(); },
  };
}
