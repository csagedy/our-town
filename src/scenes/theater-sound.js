// The theater's sound corner (P2b.5 mic recording + tapes, P2b.6 voice
// filters + lip-sync; docs/design.md 3.2 #4-6). Mounted by theater.js.
//
//   MIC STAND   tap the big red dot (or the mic): the mic is asked for (the
//               iPad's permission prompt the first time), three dots pop
//               away (3-2-1, no digits), then it records: a pulsing ring
//               around the mic follows the live level (AnalyserNode) and a
//               character standing at the mic "sings" (mouth open / shut
//               with the level). Tap again to stop; it stops by itself
//               after MAX_SEC. The mic is released AT ONCE (the iOS
//               recording light goes off). A cassette TAPE pops out onto
//               the stage: a `tape` entity whose props carry the colour, the
//               amplitude envelope, length and filter (src/core/tapes.js);
//               the voice is a Blob in the persist blob store under the
//               tape's id, on THIS iPad only (never in an op, never synced,
//               never uploaded).
//               No mic / permission denied: the mic shrugs and sings a
//               built-in "la la la" instead. Never an error message; the red
//               dot gets a small mic-with-a-slash picture.
//   BOOMBOX     drop a tape on the boombox (in the booth): it clicks into the
//               deck and plays through its voice filter on the clips bus.
//               Every character standing on the stage lip-syncs to the
//               tape's envelope; at the end the audience applauds. Tap the
//               boombox: stop / play again. Drag the tape out any time.
//   FILTER BOXES six picture boxes on the booth balcony (chipmunk, giant,
//               robot, echo cave, underwater, alien; WebAudio graphs in
//               src/audio/mic.js). Drop a tape on one: the tape takes that
//               filter (props.filter, a small badge on the tape) and plays
//               through it right there, the box shaking to the level. Tap a
//               box: a little "la la" through it, and it becomes the LIVE
//               filter for the next recording (the box glows; tap again to
//               clear). Live monitoring through the speakers is off (it would
//               feed back); ?micmonitor turns it on for headphones.
//   TWO IPADS   tape entities sync (colour, envelope, filter), the voice does
//               not. On the iPad without the voice the tape shows a small
//               "far away" cloud and plays the built-in melody shaped by the
//               envelope (one "la" per syllable), so the lip-sync still
//               matches. Blank tapes from the props shelf play a little tune.
//
//   const sound = createSound({ store, room, fx, chars, input, persist, stage, m, cheer, performers, setOverride, THEATER_ID });
//   hooks = sound.wrap(hooks);   sound.bind(view);   sound.onPieceTap(pid)   sound.destroy()
//   soundArt()  -> the extra art items (the red-dot hit box, the six filter boxes)

import { audio } from '../audio/index.js';
import { createMic, playBuffer, singLaLa, lalaEnv, FILTERS } from '../audio/mic.js';
import { decode } from '../audio/clips.js';
import { getEntity } from '../engine/world.js';
import * as tween from '../engine/tween.js';
import { isTape, isRecorded, levelAt, MOUTH_OPEN, MAX_SEC, HOP, FILTER_NAMES, TAPE_COLORS, recordedTapeProps } from '../core/tapes.js';

// ---- geometry (world units, the theater strip; manifest rigs.mic / stations.boombox) ----
export const REC_BUTTON = [1458, 744, 86, 80];          // the red dot (grown to a kid-sized target)
export const MIC_HEAD = [1444, 582];
export const SINGER_X = 1456;                           // a character within SINGER_REACH of this x (on stage) sings at the mic
export const SINGER_REACH = 200;
export const TAPE_OUT = [1570, 805];                    // a new tape lands here on the stage, right of the mic
export const DECK = { x: 2394, y: 228 };                // a tape's feet in the boombox deck
export const BOOMBOX_DROP = [2296, 130, 214, 140];      // a tape dropped with the finger here goes in the deck
export const FILTER_SIZE = 78;
export const FILTER_TOP = 346;
export const FILTER_X0 = 1958;
export const FILTER_GAP = 14;
export const FILTER_DEPTH = 725;                        // just in front of the booth / balcony art (counter layer 724)
export const COUNT_MS = 650;                            // one countdown dot

/** The six filter boxes: [{name, x, y, w, h}] (top-left, world). Pure. */
export function filterBoxes() {
  return FILTER_NAMES.map((name, i) => ({ name, x: FILTER_X0 + i * (FILTER_SIZE + FILTER_GAP), y: FILTER_TOP, w: FILTER_SIZE, h: FILTER_SIZE }));
}
const inBox = (b, x, y, pad = 0) => x >= b[0] - pad && x <= b[0] + b[2] + pad && y >= b[1] - pad && y <= b[1] + b[3] + pad;
/** The filter box under a world point, or null. Pure. */
export function filterAt(x, y, pad = 10) {
  for (const b of filterBoxes()) if (inBox([b.x, b.y, b.w, b.h], x, y, pad)) return b.name;
  return null;
}
/** Where a tape rests on a filter box (feet). Pure. */
export function filterSpot(name) {
  const b = filterBoxes().find((q) => q.name === name);
  return b ? { x: b.x + b.w / 2, y: b.y + 4 } : null;
}
/** Is a (top-level) tape sitting in the deck / on a filter box? Pure. */
export const inDeck = (e) => !!e && !e.parent && Math.abs(e.x - DECK.x) < 1 && Math.abs(e.y - DECK.y) < 1;
export function onFilter(e) {
  if (!e || e.parent) return null;
  for (const name of FILTER_NAMES) { const s = filterSpot(name); if (Math.abs(e.x - s.x) < 1 && Math.abs(e.y - s.y) < 1) return name; }
  return null;
}

// ---- pictures (zero text), viewBox 0 0 100 100, ink outline ----
const INK = 'stroke="#3D2C29" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"';
export const FILTER_ICONS = {
  chipmunk: `<circle cx="30" cy="30" r="11" fill="#C98A4B" ${INK}/><circle cx="70" cy="30" r="11" fill="#C98A4B" ${INK}/><ellipse cx="50" cy="55" rx="30" ry="27" fill="#D9A064" ${INK}/><ellipse cx="33" cy="64" rx="10" ry="8" fill="#F4DDB8"/><ellipse cx="67" cy="64" rx="10" ry="8" fill="#F4DDB8"/><circle cx="40" cy="48" r="3.6" fill="#3D2C29"/><circle cx="60" cy="48" r="3.6" fill="#3D2C29"/><circle cx="50" cy="58" r="3" fill="#3D2C29"/><rect x="45" y="63" width="10" height="11" rx="1.5" fill="#FFFDF6" ${INK}/>`,
  giant: `<path d="M26 20 L54 20 L54 58 Q84 58 86 76 L86 84 L20 84 L20 76 Q20 64 26 58 Z" fill="#8C6A4E" ${INK}/><path d="M20 76 L86 76" fill="none" ${INK}/><circle cx="36" cy="32" r="3" fill="#3D2C29"/><circle cx="36" cy="44" r="3" fill="#3D2C29"/>`,
  robot: `<path d="M50 12 L50 24" fill="none" ${INK}/><circle cx="50" cy="11" r="5" fill="#E95454" ${INK}/><rect x="22" y="24" width="56" height="50" rx="8" fill="#C9D6E2" ${INK}/><rect x="31" y="36" width="12" height="12" rx="2" fill="#6FB7D6" ${INK}/><rect x="57" y="36" width="12" height="12" rx="2" fill="#6FB7D6" ${INK}/><rect x="34" y="57" width="32" height="9" rx="2" fill="#FFFDF6" ${INK}/><path d="M42 57 L42 66 M50 57 L50 66 M58 57 L58 66" ${INK}/><rect x="14" y="40" width="8" height="16" rx="3" fill="#9BB3C9" ${INK}/><rect x="78" y="40" width="8" height="16" rx="3" fill="#9BB3C9" ${INK}/>`,
  echo: `<path d="M12 84 L12 60 Q12 22 50 22 Q88 22 88 60 L88 84 Z" fill="#8E7A9E" ${INK}/><path d="M28 84 L28 64 Q28 40 50 40 Q72 40 72 64 L72 84 Z" fill="#3D2C3F" ${INK}/><path d="M50 58 Q58 64 50 70 M56 52 Q68 64 56 76 M62 46 Q78 64 62 82" fill="none" stroke="#FFD27A" stroke-width="3.6" stroke-linecap="round"/>`,
  underwater: `<path d="M18 56 Q40 30 66 50 Q72 54 74 56 Q72 58 66 62 Q40 82 18 56 Z" fill="#F2A65E" ${INK}/><path d="M74 56 L88 44 L88 68 Z" fill="#F2A65E" ${INK}/><circle cx="32" cy="52" r="3.6" fill="#3D2C29"/><circle cx="46" cy="24" r="6" fill="#DFF3FB" ${INK}/><circle cx="58" cy="14" r="4" fill="#DFF3FB" ${INK}/><circle cx="30" cy="30" r="3.5" fill="#DFF3FB" ${INK}/>`,
  alien: `<path d="M34 26 L26 10 M66 26 L74 10" fill="none" ${INK}/><circle cx="26" cy="10" r="5" fill="#FFD27A" ${INK}/><circle cx="74" cy="10" r="5" fill="#FFD27A" ${INK}/><ellipse cx="50" cy="54" rx="32" ry="34" fill="#9CCB6A" ${INK}/><ellipse cx="37" cy="50" rx="8" ry="11" fill="#3D2C29"/><ellipse cx="63" cy="50" rx="8" ry="11" fill="#3D2C29"/><circle cx="35" cy="46" r="2.5" fill="#FFFDF6"/><circle cx="61" cy="46" r="2.5" fill="#FFFDF6"/><path d="M42 72 Q50 78 58 72" fill="none" ${INK}/>`,
};
const CLOUD = `<path d="M26 74 Q10 74 12 60 Q14 48 28 50 Q30 32 50 32 Q68 32 72 48 Q90 46 90 62 Q90 74 76 74 Z" fill="#FFFFFF" ${INK}/><path d="M40 60 L48 60 M58 60 L66 60" stroke="#8FA3C9" stroke-width="3.4" stroke-linecap="round"/>`;
const MIC_SLASH = `<circle cx="50" cy="50" r="40" fill="#FFFDF6" ${INK}/><rect x="40" y="24" width="20" height="34" rx="10" fill="#9BB3C9" ${INK}/><path d="M32 50 Q32 68 50 68 Q68 68 68 50 M50 68 L50 78" fill="none" ${INK}/><path d="M24 24 L76 76" stroke="#E95454" stroke-width="7" stroke-linecap="round"/>`;
const svg = (body, w, h) => `<svg viewBox="0 0 100 100" width="${w}" height="${h}" style="display:block;overflow:visible" aria-hidden="true">${body}</svg>`;

/** A filter box's HTML (a rounded box in its colour with the picture). Pure. */
export function filterBoxHtml(name) {
  const c = FILTERS[name].color;
  return `<div class="fbox-body" style="position:absolute;inset:0;transform-origin:50% 100%">`
    + `<svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block;position:absolute;inset:0" aria-hidden="true"><rect x="4" y="6" width="92" height="90" rx="16" fill="${c}" ${INK}/><rect x="10" y="12" width="80" height="78" rx="12" fill="#FFFDF6" opacity="0.55"/></svg>`
    + `<div style="position:absolute;left:12%;top:12%;width:76%;height:76%">${svg(FILTER_ICONS[name], '100%', '100%')}</div>`
    + `<div class="fbox-glow" style="position:absolute;inset:-7px;border-radius:22px;border:6px solid #FFD27A;opacity:0"></div></div>`;
}

/** The theater's extra art items (world units): the red dot's hit box and the six filter boxes. Pure. */
export function soundArt() {
  const out = [{ id: 'hit:mic-rec', layer: 'mid', depth: 1000, x: REC_BUTTON[0], y: REC_BUTTON[1], w: REC_BUTTON[2], h: REC_BUTTON[3], cls: 'art-hit', html: '' }];
  for (const b of filterBoxes()) out.push({ id: 'filter:' + b.name, layer: 'mid', depth: FILTER_DEPTH, x: b.x, y: b.y, w: b.w, h: b.h, cls: 'art-fbox', html: filterBoxHtml(b.name) });
  return out;
}

// Singing faces: the mouth open / shut (docs/rig.md 5).
export const SING_OPEN = { eyes: 'content', brows: 'arch', mouth: 'sing', extras: 'notes' };
export const SING_SHUT = { eyes: 'content', brows: 'arch', mouth: 'small', extras: 'notes' };

export function createSound({ store, room, fx, chars, input, persist = null, m, cheer, performers, setOverride, bodyOf, THEATER_ID, doc = document, monitor = false }) {
  const mic = createMic(audio);
  const stats = { recordings: 0, shrugs: 0, plays: 0, voice: 0, lala: 0, far: 0, blank: 0, filterDrops: 0, deckDrops: 0, ends: 0, applause: 0, mouthFlips: 0, previews: 0, discarded: 0 };
  let view = null;
  let destroyed = false;
  let phase = 'idle';          // idle | asking | count | rec | saving
  let denied = false;          // the mic said no this session: shrug straight away
  let liveFilter = null;       // the glowing filter box: the next recording's filter
  let playing = null;          // { id, handle, where, how }
  let raf = 0;
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); if (!destroyed) fn(); }, ms); timers.add(t); return t; };
  const buffers = new Map();   // tape id -> decoded AudioBuffer (this session)
  const local = new Set();     // tape ids whose voice Blob is on this iPad
  let localKnown = false;

  // ---- DOM: the red dot, the filter boxes, the meter ring, the countdown ----
  const recHit = room.art.get('hit:mic-rec');
  const boxes = new Map();     // name -> {el, body, glow}
  for (const name of FILTER_NAMES) {
    const el = room.art.get('filter:' + name);
    if (!el) continue;
    el.dataset.filter = name;
    boxes.set(name, { el, body: el.querySelector('.fbox-body'), glow: el.querySelector('.fbox-glow') });
  }
  const meter = doc.createElement('div');
  meter.className = 'mic-meter';
  meter.style.cssText = `position:absolute;left:${MIC_HEAD[0] - 80}px;top:${MIC_HEAD[1] - 80}px;width:160px;height:160px;pointer-events:none;opacity:0;transform:scale(0.7)`;
  meter.innerHTML = '<div style="position:absolute;inset:0;border-radius:50%;border:9px solid rgba(233,84,84,0.85)"></div><div style="position:absolute;inset:22px;border-radius:50%;border:6px solid rgba(255,210,122,0.9)"></div>';
  room.fxLayer.appendChild(meter);
  const dots = doc.createElement('div');
  dots.className = 'mic-count';
  dots.style.cssText = `position:absolute;left:${MIC_HEAD[0] - 95}px;top:${MIC_HEAD[1] - 150}px;width:190px;height:50px;pointer-events:none`;
  for (let i = 0; i < 3; i++) {
    const d = doc.createElement('div');
    d.style.cssText = `position:absolute;left:${i * 70}px;top:0;width:50px;height:50px;border-radius:50%;background:#E95454;border:5px solid #3D2C29;box-sizing:border-box;opacity:0`;
    dots.appendChild(d);
  }
  room.fxLayer.appendChild(dots);
  const slash = doc.createElement('div');
  slash.className = 'mic-slash';
  slash.style.cssText = 'position:absolute;right:-18px;top:-22px;width:44px;height:44px;pointer-events:none;display:none';
  slash.innerHTML = svg(MIC_SLASH, 44, 44);
  if (recHit) recHit.appendChild(slash);

  // ---- characters: who sings ----
  const at = (id) => getEntity(store.state, id);
  const standing = (e) => (e.props.pose || 'stand') === 'stand';
  const singers = () => performers().map((e) => (typeof e === 'string' ? at(e) : e)).filter((e) => e && standing(e));
  const micSinger = () => singers().filter((e) => Math.abs(e.x - SINGER_X) <= SINGER_REACH).sort((a, b) => Math.abs(a.x - SINGER_X) - Math.abs(b.x - SINGER_X))[0] || null;
  const mouths = new Map();
  function mouth(id, open) {
    if (!chars) return;
    const t = Date.now();
    const cur = mouths.get(id);
    if (cur && cur.open === open && t - cur.at < 200) return;
    if (!chars.face(id, [[open ? SING_OPEN : SING_SHUT, 360]])) return;
    if (!cur || cur.open !== open) stats.mouthFlips++;
    mouths.set(id, { open, at: t });
  }
  const quiet = () => mouths.clear();

  // ---- the loop (only while recording or playing) ----
  let lastLevel = 0;
  let livePeak = 0;
  function loop() {
    raf = 0;
    if (destroyed) return;
    let busy = false;
    if (phase === 'rec') {
      busy = true;
      const lv = mic.level();
      lastLevel = lv;
      meter.style.transform = `scale(${(0.75 + Math.min(1, lv) * 0.65).toFixed(3)})`;
      // Open on the loud parts: over a floor and near the recent peak (a mic's hiss stays shut).
      livePeak = Math.max(lv, livePeak * 0.96);
      const s = micSinger();
      if (s) mouth(s.id, lv > 0.06 && lv > livePeak * 0.55);
      if (mic.elapsed() >= MAX_SEC) stopRec('auto');
    }
    if (playing) {
      busy = true;
      const t = playing.handle.time();
      const lv = levelAt(playing.env, t);
      lastLevel = lv / 9;
      for (const s of singers()) mouth(s.id, lv >= MOUTH_OPEN);
      if (playing.where && boxes.has(playing.where)) {
        const b = boxes.get(playing.where).body;
        b.style.transform = `scale(${(1 + lv * 0.012).toFixed(3)}, ${(1 - lv * 0.008).toFixed(3)}) rotate(${((lv % 2 ? 1 : -1) * lv * 0.35).toFixed(2)}deg)`;
      }
    }
    if (busy) raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf && !destroyed) raf = requestAnimationFrame(loop); };

  // ---- recording ----
  function toggleRecord() {
    if (phase === 'rec') { stopRec('tap'); return; }
    if (phase !== 'idle') return;          // asking, counting down, saving: one thing at a time
    startRec();
  }

  async function startRec() {
    stopPlaying(false);
    if (denied) { shrug(); return; }
    phase = 'asking';
    try {
      await mic.open();                    // inside the tap: the permission prompt
    } catch (e) {
      phase = 'idle';
      if (e && e.code === 'denied') denied = true;
      shrug();
      return;
    }
    if (destroyed) { mic.cancel(); return; }
    phase = 'count';
    countdown(() => {
      if (destroyed || phase !== 'count') { mic.cancel(); return; }
      try {
        mic.begin({ filter: liveFilter, monitor });
      } catch (e) {
        mic.cancel(); phase = 'idle'; shrug(); return;
      }
      phase = 'rec';
      setOverride('mic-stand', 'rec');
      tween.animate(meter, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
      if (view) view.play('pop', { pitch: 1.4, gain: 0.6 });
      fx.burst('sparkle', MIC_HEAD[0], MIC_HEAD[1], { count: 6, spread: 90 });
      kick();
    });
  }

  function countdown(done) {
    const ds = [...dots.children];
    for (const d of ds) { d.style.opacity = '1'; tween.popIn(d); }
    if (view) view.play('plink', { pitch: 0.9, gain: 0.6 });
    ds.slice().reverse().forEach((d, i) => later(COUNT_MS * (i + 1), () => {
      tween.animate(d, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 220, fill: 'forwards' });
      later(230, () => { d.style.opacity = '0'; });
      if (view) view.play('plink', { pitch: 1 + i * 0.2, gain: 0.6 });
      if (i === ds.length - 1) later(120, done);
    }));
  }

  function stopRec(why) {
    if (phase !== 'rec') return Promise.resolve();
    phase = 'saving';
    const take = mic.stop();               // the mic is released inside stop(), right now
    setOverride('mic-stand', null);
    tween.animate(meter, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    quiet();
    if (view) view.play(why === 'auto' ? 'chime' : 'clunk', { gain: 0.7 });
    return keep(take);
  }

  /** Keep a take: the voice into the blob store (this iPad only), a tape entity with its envelope. */
  async function keep(take) {
    let res = null;
    try { res = await take; } catch (e) { console.warn('mic: take failed', e); }
    phase = 'idle';
    if (!res || !res.blob || !res.blob.size || res.duration < 0.3) {
      stats.discarded++;
      if (!destroyed) fx.burst('puff', REC_BUTTON[0] + 40, REC_BUTTON[1], { count: 5 });
      return;
    }
    const id = store.newId();
    if (persist && persist.putBlob) {
      try { await persist.putBlob(id, res.blob); } catch (e) { console.warn('mic: could not keep the take', e); }
    }
    local.add(id);
    if (res.buffer) buffers.set(id, res.buffer);
    const props = recordedTapeProps({ levels: res.levels, duration: res.duration, filter: liveFilter, device: store.device, color: TAPE_COLORS[stats.recordings % TAPE_COLORS.length] });
    if (!store.dispatch('spawn', { id, kind: 'tape', room: THEATER_ID, x: TAPE_OUT[0], y: TAPE_OUT[1], z: 20, props })) return;
    stats.recordings++;
    if (view && !destroyed) {
      view.animateFrom(id, REC_BUTTON[0] + 40, REC_BUTTON[1] - 60);
      view.play('pop', { pitch: 1.1 });
      later(300, () => fx.burst('sparkle', TAPE_OUT[0], TAPE_OUT[1] - 30, { count: 8, spread: 90 }));
    }
  }

  /** No mic (or "no"): the mic shrugs and sings a built-in la la la. Never an error. */
  function shrug() {
    stats.shrugs++;
    slash.style.display = denied ? 'block' : 'none';
    const body = bodyOf('mic-stand');
    if (body) {
      tween.animate(body, [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-7deg) translateY(-6px)', offset: 0.25 },
        { transform: 'rotate(6deg) translateY(-6px)', offset: 0.5 }, { transform: 'rotate(-3deg)', offset: 0.75 }, { transform: 'rotate(0deg)' },
      ], { duration: 900, easing: 'ease-in-out' });
    }
    if (view) view.play('boing', { pitch: 1.2, gain: 0.6 });
    later(500, () => play({ env: lalaEnv(), filter: liveFilter, where: 'mic', how: 'lala', id: null }));
  }

  // ---- playing tapes ----
  async function bufferOf(id) {
    if (buffers.has(id)) return buffers.get(id);
    if (!persist || !persist.getBlob) return null;
    let blob = null;
    try { blob = await persist.getBlob(id); } catch { blob = null; }
    if (!blob || !blob.size) { local.delete(id); return null; }
    local.add(id);
    const a = audio.get(true);
    if (!a) return null;
    try {
      const buf = await decode(a.ctx, await blob.arrayBuffer());
      buffers.set(id, buf);
      return buf;
    } catch (e) { console.warn('tape: could not decode', e && e.message); return null; }
  }

  /** Play tape `id` (where: 'boombox' or a filter name; filter: override). */
  async function playTape(id, { where = 'boombox', filter } = {}) {
    const e = at(id);
    if (!isTape(e)) return null;
    const fl = filter !== undefined ? filter : (e.props.filter || null);
    stopPlaying(false);
    const token = {};
    playing = { id, token, handle: { time: () => 0, stop() {} }, env: '', where, how: 'loading' };
    if (!isRecorded(e)) { stats.blank++; return play({ id, env: lalaEnv(), filter: fl, where, how: 'lala', token }); }
    const buf = await bufferOf(id);
    if (!playing || playing.token !== token || destroyed) return null;
    if (!buf) { stats.far++; return play({ id, env: e.props.env, filter: fl, where, how: 'lala', token }); }
    return play({ id, env: e.props.env, filter: fl, where, how: 'voice', buffer: buf, token });
  }

  function play({ id, env, filter, where, how, buffer = null, token = {} }) {
    if (playing && playing.token !== token) stopPlaying(false);
    const end = () => ended(token);
    const handle = how === 'voice'
      ? playBuffer(audio, buffer, { filter, onEnded: end })
      : singLaLa(audio, { env, filter, onEnded: end });
    if (!handle) { playing = null; return null; }
    playing = { id, token, handle, env, where, how, filter };
    stats.plays++;
    stats[how === 'voice' ? 'voice' : 'lala']++;
    if (where === 'boombox') setOverride('boombox', 'play');
    const pb = where === 'boombox' ? bodyOf('boombox') : where === 'mic' ? bodyOf('mic-stand') : null;
    if (pb) tween.squish(pb, { amount: 0.3 });
    kick();
    return { how, filter: handle.filter, duration: handle.duration };
  }

  function ended(token) {
    if (!playing || playing.token !== token) return;
    const was = playing;
    playing = null;
    stats.ends++;
    finishLook(was);
    if (destroyed) return;
    // The audience applauds a performance (a voice or a song, not a stopped one).
    if (was.id) { stats.applause++; cheer({}); }
  }
  function finishLook(was) {
    if (was.where === 'boombox') setOverride('boombox', null);
    if (was.where && boxes.has(was.where)) boxes.get(was.where).body.style.transform = '';
    quiet();
  }
  function stopPlaying(fx0 = true) {
    if (!playing) return false;
    const was = playing;
    playing = null;
    try { was.handle.stop(); } catch { /* ok */ }
    finishLook(was);
    if (fx0 && view) view.play('clunk', { pitch: 1.2, gain: 0.6 });
    return true;
  }

  // ---- filter boxes ----
  function setLive(name) {
    liveFilter = liveFilter === name ? null : name;
    for (const [n, b] of boxes) b.glow.style.opacity = n === liveFilter ? '1' : '0';
  }
  function tapFilter(name) {
    const b = boxes.get(name);
    tween.squish(b.body, { amount: 0.5 });
    setLive(name);
    stats.previews++;
    // A little "la la" through it (unless a tape is playing).
    if (!playing || playing.how === 'lala') play({ id: null, env: lalaEnv([[0, 3], [2, 3], [4, 5]]), filter: name, where: name, how: 'lala' });
    fx.burst('sparkle', b.el ? filterSpot(name).x : 0, FILTER_TOP + 10, { count: 4, spread: 60 });
  }
  for (const [name, b] of boxes) input.register(b.el, { onTap: () => tapFilter(name), pan: true });
  if (recHit) input.register(recHit, { onTap: toggleRecord, pan: true });

  // ---- drops: a tape onto the boombox or a filter box ----
  function dropTape(e, ctx) {
    const info = ctx && ctx.info;
    const v = view && view.viewOf(e.id);
    const px = info && isFinite(info.x) ? info.x : v ? v.x : e.x;
    const py = info && isFinite(info.y) ? info.y : v ? v.y : e.y;
    const from = v ? { x: v.x, y: v.y } : { x: e.x, y: e.y };
    if (inBox(BOOMBOX_DROP, px, py)) {
      // One tape in the deck: an older one hops out onto the booth console.
      for (const o of Object.values(store.state.entities)) {
        if (o.id !== e.id && isTape(o) && !o.deleted && o.room === THEATER_ID && inDeck(o)) {
          if (store.dispatch('move', { id: o.id, room: THEATER_ID, x: 2475, y: 252, z: 5 }) && view) view.animateFrom(o.id, DECK.x, DECK.y - 40);
        }
      }
      if (!store.dispatch('move', { id: e.id, room: THEATER_ID, x: DECK.x, y: DECK.y, z: 50 })) return false;
      stats.deckDrops++;
      if (view) { view.animateFrom(e.id, from.x, Math.min(from.y, DECK.y - 30)); view.play('clunk', { gain: 0.8 }); }
      later(260, () => playTape(e.id, { where: 'boombox' }));
      return true;
    }
    const name = filterAt(px, py) || filterAt(from.x, from.y - 20);
    if (name) {
      const spot = filterSpot(name);
      if (e.props.filter !== name) store.dispatch('set', { id: e.id, path: 'props.filter', value: name });
      if (!store.dispatch('move', { id: e.id, room: THEATER_ID, x: spot.x, y: spot.y, z: 50 })) return false;
      stats.filterDrops++;
      if (view) { view.animateFrom(e.id, from.x, Math.min(from.y, spot.y - 30)); view.play('plink', { pitch: 1.2 }); }
      const b = boxes.get(name);
      if (b) tween.shake(b.body, { amount: 0.5 });
      fx.burst('sparkle', spot.x, spot.y - 30, { count: 6, spread: 70 });
      later(260, () => playTape(e.id, { where: name }));
      return true;
    }
    return false;
  }

  // ---- tape badges: the filter picture and the "far away" cloud ----
  function badges(e, ctx) {
    const lift = ctx.body && ctx.body.parentNode;
    if (!lift) return;
    let el = lift.querySelector(':scope > .tape-badges');
    const far = isRecorded(e) && localKnown && !local.has(e.id);
    const fl = e.props && FILTERS[e.props.filter] ? e.props.filter : null;
    const key = (far ? 'far' : '') + '|' + (fl || '');
    if (key === '|') { if (el) el.remove(); return; }
    if (!el) {
      el = doc.createElement('div');
      el.className = 'tape-badges';
      el.style.cssText = 'position:absolute;right:-16px;top:-26px;display:flex;gap:2px;pointer-events:none;z-index:60';
      lift.appendChild(el);
    }
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    el.innerHTML = (fl ? `<div data-badge="${fl}" style="width:34px;height:34px;border-radius:50%;background:${FILTERS[fl].color};border:3px solid #3D2C29;box-sizing:border-box;padding:3px">${svg(FILTER_ICONS[fl], '100%', '100%')}</div>` : '')
      + (far ? `<div data-badge="far" style="width:40px;height:34px">${svg(CLOUD, 40, 34)}</div>` : '');
  }

  // Which voices are on this iPad (async; then the far-away clouds can show).
  if (persist && persist.blobIds) {
    Promise.resolve(persist.blobIds()).then((ids) => {
      for (const id of ids || []) local.add(id);
      localKnown = true;
      if (view && !destroyed) for (const e of Object.values(store.state.entities)) if (isRecorded(e) && e.room === THEATER_ID) view.repaint(e.id);
    }, () => { localKnown = false; });
  }

  // The page going away mid-recording: keep what we have.
  const onHidden = () => { if (doc.visibilityState === 'hidden') { if (phase === 'rec') stopRec('hidden'); else if (phase === 'count' || phase === 'asking') { mic.cancel(); phase = 'idle'; } } };
  doc.addEventListener('visibilitychange', onHidden);

  return {
    wrap(hooks) {
      return Object.assign({}, hooks, {
        onDrop(e, ctx) {
          if (isTape(e) && dropTape(e, ctx)) return true;
          return hooks.onDrop ? hooks.onDrop(e, ctx) : false;
        },
        onDragStart(e, ctx) {
          if (playing && playing.id === e.id) stopPlaying(true);
          return hooks.onDragStart ? hooks.onDragStart(e, ctx) : undefined;
        },
        sortKeyOf(e) {
          // A tape in the deck or on a filter box draws in front of it.
          if (isTape(e) && e.room === THEATER_ID && (inDeck(e) || onFilter(e))) return FILTER_DEPTH + 1 + (e.z || 0) * 0.001;
          return hooks.sortKeyOf ? hooks.sortKeyOf(e) : null;
        },
        onRender(e, ctx) {
          if (hooks.onRender) hooks.onRender(e, ctx);
          if (isTape(e)) badges(e, ctx);
        },
        onTap(e, ctx) {
          if (isTape(e) && e.room === THEATER_ID && (inDeck(e) || onFilter(e))) {
            if (playing && playing.id === e.id) stopPlaying(true);
            else playTape(e.id, { where: inDeck(e) ? 'boombox' : onFilter(e) });
            if (ctx && ctx.body) tween.squish(ctx.body, { amount: 0.4 });
            return true;
          }
          return hooks.onTap ? hooks.onTap(e, ctx) : false;
        },
      });
    },
    bind(v) { view = v; },
    /** A piece tap the sound corner answers (the mic, the boombox). */
    onPieceTap(pid) {
      if (pid === 'mic-stand') { toggleRecord(); return true; }
      if (pid === 'boombox') {
        if (playing && playing.where === 'boombox') { stopPlaying(true); return true; }
        const deck = Object.values(store.state.entities).find((o) => isTape(o) && !o.deleted && o.room === THEATER_ID && inDeck(o));
        if (deck) { playTape(deck.id, { where: 'boombox' }); return true; }
        return false;                      // empty: it just squishes and plinks
      }
      return false;
    },
    toggleRecord,
    playTape,
    stop: () => stopPlaying(true),
    setLive,
    el: { rec: () => recHit, filter: (n) => (boxes.get(n) || {}).el || null, meter: () => meter, slash: () => slash },
    state: () => ({ phase, denied, liveFilter, micLive: mic.live, playing: playing ? { id: playing.id, where: playing.where, how: playing.how, filter: playing.filter || null } : null, level: lastLevel, localKnown, elapsed: mic.elapsed() }),
    stats: () => Object.assign({}, stats, { mic: mic.stats() }),
    isLocal: (id) => local.has(id),
    destroy() {
      destroyed = true;
      doc.removeEventListener('visibilitychange', onHidden);
      view = null;
      if (phase === 'rec') { phase = 'saving'; keep(mic.stop()); }   // leaving mid-song: keep the take (the tape waits in the theater)
      else mic.cancel();
      if (playing) { try { playing.handle.stop(); } catch { /* ok */ } playing = null; }
      if (raf) cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      for (const b of boxes.values()) input.unregister(b.el);
      if (recHit) input.unregister(recHit);
      meter.remove(); dots.remove();
    },
  };
}
