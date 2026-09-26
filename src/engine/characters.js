// Characters in rooms (P1.10, docs/design.md 2.4): live SVG characters
// (src/engine/rig-svg.js, contract docs/rig.md) as entities of kind 'char'
// in the ordinary room view (view.js), plus everything they do. The data
// model and the pure helpers are in char-model.js.
//
//   const chars = await mountCharacters({ store, input, behaviors, room, sfx, speech });
//   const view = createRoomView({ ..., behaviors: chars ? chars.hooks : behaviors });
//   behaviors.bind(view, fx); if (chars) chars.bind(view, fx);
//   seedCharacters(store, chars.rig, { room: room.id, seats: chars.seats, placements })   // first visit
//
// chars.hooks wraps the behavior runtime's view hooks: characters and worn
// pieces draw here, everything else falls through to the runtime.
//
// What a character does (every lasting change is a store op, so it is saved,
// replayed and shared with the other iPad):
// - DRAG it by any part: it dangles (a local pose, legs swing on a short
//   pendulum), with a wheee / surprised face. Drop it on a seat (the room
//   def's `seats`) and it sits there (`set pose sit`, `set seat`, `move` to
//   the seat point); on a bed or sofa it lies down (and gets sleepy); on a
//   surface it stands on it; anywhere else it lands on its feet with a squash.
// - HOLD: an item dropped on it goes into the free hand nearest the finger
//   (`attach` slot hand-l / hand-r; the arm comes up to hold it). Tap the
//   held item: it is shown off high (`set raise`), tap again to lower it.
//   Drag it: it comes out of the hand (`detach`) and follows the finger.
// - EAT: food dropped at the mouth (or a held food dragged there) is taken
//   into a hand and bitten: the eatable behavior's `bite` verb (bite looks,
//   munch, crumbs at the mouth), or the art manifest's bite variants for
//   art-only foods. The face reacts by taste (tasteOf): yum for sweet, a
//   grimace then a laugh for sour/weird, happy otherwise.
// - WEAR: a wear piece (hat, glasses, apron, cape: a rig wear piece kind)
//   dropped on it is put on (`attach` slot wear-<slot>) with a sparkle; one
//   already in that slot pops off to the floor. Drag a worn piece to take it
//   off (an apron only by pulling it down; an upward drag lifts the character).
// - TAP: `inc props.taps`; every iPad plays the next reaction of the cycle
//   (giggle, wave, jump, happy face; sleepy when lying). LONG PRESS: it says
//   something short and cheerful (speechSynthesis) unless settings.talk is
//   false or the scene passed talk: false; a long press then drag lifts the
//   whole character even from a held or worn thing.
//
// Idle life, cheap on the A9X: breathing is ONE CSS animation per character
// (transform on an HTML wrapper, composited, random negative delay); blinks,
// glances and head tilts come from ONE shared timer for all characters (a
// few ms of work every half second or so, never a frame loop). Offscreen
// characters (IntersectionObserver) and hidden pages pause both. None of it
// touches the SVG: a character is a stack of <svg> layers (rig-svg.js
// `layers`), and a blink (opacity of the open/closed eyes layers), a glance
// (the eyes wrapper) and a head tilt (the two head wrappers) are WAAPI
// transform/opacity animations on those HTML boxes, so the compositor runs
// them with no style recalc or layout per frame (bead lm8). Pose
// changes (a wave, a tilt, the dangle) are short rAF tweens of the joint
// angles that stop when done.

import { renderCharacter, poseFrames, matrixAttr, resolveExpr, faceSlot, bodyBox } from './rig-svg.js';
import {
  CHAR_KIND, HANDS, SIDE_OF, wearSlotOf, wearSlotName, partsOf, specOf, appearanceKey, composePose, danglePose,
  lerpPose, sameOrder, poseBox, normalizeSeats, seatNear, tasteOf, reactionsFor, PHRASES,
} from './char-model.js';
import { getEntity, childrenOf, inRoom } from './world.js';
import { settle, DEPTH_SCALE } from './surfaces.js';
import { touchedIds } from './ops.js';

// Worn pieces pulled off only by a downward drag (an upward one lifts the character).
const PULL_DOWN = { over: true, top: true, belt: true };
// Worn slots whose pieces lie around as their prop art rather than the rig fragment.
const DROP_ART = { belt: true, hands: true };
import { spriteFor } from './sprites.js';
import * as tween from './tween.js';

export const RIG_URL = 'assets/characters/rig.json';
const SVGNS = 'http://www.w3.org/2000/svg';
const SLOTS = ['eyes', 'brows', 'mouth', 'extras'];
/** The id of idle-life WAAPI animations (glances, tilts); breathing is the CSS animation 'char-breathe'. */
export const IDLE_ANIM = 'char-idle';
// The layers of a character, bottom to top (rig-svg.js renderCharacter `layers`).
// The head pieces sit in .char-tilt wrappers (a head tilt rotates them about
// the chin), the eyes in .char-eyes (a glance slides it); all HTML boxes, so
// those animations are composited.
const LAYERS = ['base', 'hairBack', 'body', 'headUnder', 'eyes', 'blink', 'headOver', 'front'];
const lsvg = (name, cls) => `<svg class="${cls || 'char-layer'}" data-l="${name}" xmlns="${SVGNS}" overflow="visible"></svg>`;
const BOB_HTML = '<div class="char-bob">' + lsvg('base')
  + '<div class="char-tilt">' + lsvg('hairBack') + '</div>'
  + lsvg('body', 'char-svg')
  + '<div class="char-tilt">' + lsvg('headUnder') + '<div class="char-eyes">' + lsvg('eyes') + lsvg('blink', 'char-layer char-blink') + '</div>' + lsvg('headOver') + '</div>'
  + lsvg('front') + '</div>';
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

let rigLoad = null;
/** The rig data (cached). Rejects if it can't be fetched. */
export function loadRig(url = RIG_URL) {
  if (!rigLoad) {
    rigLoad = fetch(url).then((r) => { if (!r.ok) throw new Error('rig: HTTP ' + r.status); return r.json(); });
    rigLoad.catch(() => { rigLoad = null; });
  }
  return rigLoad;
}

function ensureCss(rig) {
  if (document.getElementById('rig-css')) return;
  const st = document.createElement('style');
  st.id = 'rig-css';
  st.textContent = rig.css;
  document.head.appendChild(st);
}

/**
 * Load the rig and set characters up for a mounted room. Resolves to the
 * characters object, or null if the rig can't be loaded (the room then
 * plays without characters).
 */
export async function mountCharacters(opts) {
  let rig;
  try { rig = opts.rig || await loadRig(); } catch (e) { console.warn('characters: no rig', e); return null; }
  ensureCss(rig);
  return createCharacters(Object.assign({}, opts, { rig }));
}

export function createCharacters({ store, input, rig, behaviors: base, room, sfx = null, speech = null, random = Math.random, talk = true }) {
  const K = rig.artScale;
  const catalog = base.catalog;
  const seats = normalizeSeats(room.def.seats || []);
  const recs = new Map();         // char id -> live record
  const boxes = new Map();
  const wearSprites = new Map();
  const stats = { builds: 0, faces: 0, blinks: 0, glances: 0, tilts: 0, idleTicks: 0, reactions: 0, lastReaction: '', bites: 0, lastTaste: '', said: 0, lastSaid: '', tweens: 0 };
  let view = null;
  let fx = null;
  let idleTimer = 0;
  let destroyed = false;

  const play = (name, o) => { if (view) view.play(name, o); else if (sfx) sfx.play(name, o); };
  const entityOf = (id) => getEntity(store.state, id);
  const kidsOf = (id) => childrenOf(store.state, id);
  const lookOf = (e) => (base.lookOf ? base.lookOf(e) : null);
  const alive = (rec) => !!(rec.bob && rec.bob.parentNode === rec.body && rec.body.isConnected);
  const pick = (list) => list[Math.floor(random() * list.length) % list.length];
  const later = (rec, ms, fn) => { const t = setTimeout(() => { rec.timers.delete(t); if (!destroyed) fn(); }, ms); rec.timers.add(t); return t; };

  function manifestProp(kind) {
    const m = catalog && catalog.manifest;
    if (!m || !m.props) return null;
    const k = catalog.get(kind);
    return m.props[(k && k.art && k.art.sprite) || kind] || null;
  }
  function tagsOf(kind) {
    const t = catalog ? catalog.tagsOf(kind) : [];
    if (t.length) return t;
    const p = manifestProp(kind);
    return (p && p.tags) || [];
  }
  const isFood = (kind) => { const t = tagsOf(kind); return t.includes('food') || t.includes('drink'); };

  // ---- sprites ----
  function boxFor(body, poseName) {
    const key = body + ':' + poseName;
    let b = boxes.get(key);
    if (!b) { b = poseBox(rig, body, rig.poses[poseName] || rig.poses.stand); boxes.set(key, b); }
    return b;
  }

  function charSprite(e) {
    const pose = e.props.pose || 'stand';
    const b = boxFor(e.props.body || 'kid9', pose);
    return { key: `char:${e.id}:${pose}`, draw: 'custom', w: b.w, h: b.h, sound: 'giggle', paint: (body) => paint(body, e.id) };
  }

  function wearVars(kind, colors) {
    const c = Object.assign({}, rig.wear[kind].colors, colors || {});
    return '--skin:#EDC3A2;--skin-sh:#D9A07F;--hair:#6A4A3A;--hair-sh:#55403F;' + Object.keys(c).map((k) => `--${k}:${c[k]}`).join(';');
  }
  function wearFragment(kind) {
    const piece = rig.bodies.kid9.wear[kind];
    const slot = rig.wear[kind].slot;
    if (slot === 'hands') return piece.hand ? `<g transform="translate(-24 0)">${piece.hand}</g><g transform="translate(24 0) scale(-1 1)">${piece.hand}</g>` : '';
    return (slot === 'back' ? piece.back : slot === 'over' || slot === 'belt' || slot === 'top' ? piece.torso : piece.head) || '';
  }
  /** A wear piece lying around: its fragment drawn alone (kid9 size), bottom centre on the feet point. */
  function wearSprite(e) {
    const colors = e.props && e.props.colors;
    const key = 'wear:' + e.kind + (colors ? ':' + JSON.stringify(colors) : '');
    let s = wearSprites.get(key);
    if (s) return s;
    const frag = wearFragment(e.kind);
    let bb = { x: -50, y: -50, width: 100, height: 100 };
    try {
      const m = document.createElementNS(SVGNS, 'svg');
      m.setAttribute('style', 'position:absolute;left:-9999px;top:0;visibility:hidden');
      m.innerHTML = `<g class="o">${frag}</g>`;
      document.body.appendChild(m);
      const b = m.firstChild.getBBox();
      m.remove();
      if (b.width > 0 && b.height > 0) bb = b;
    } catch (err) { /* keep the default box */ }
    const pad = 6;
    // Lying around, a cape or an apron is smaller than on a body (it is folded up, sort of).
    const slot = rig.wear[e.kind].slot;
    const k = K * (slot === 'back' ? 0.62 : slot === 'over' ? 0.75 : 1);
    const vb = [bb.x - pad, bb.y - pad, bb.width + 2 * pad, bb.height + 2 * pad];
    const svg = `<svg class="wear-prop" xmlns="${SVGNS}" viewBox="${vb.map(r1).join(' ')}" width="${r1(vb[2] * k)}" height="${r1(vb[3] * k)}" overflow="visible" style="position:absolute;left:${r1(-pad * k)}px;top:${r1(-pad * k)}px"><g class="o" style="${wearVars(e.kind, colors)}">${frag}</g></svg>`;
    s = { key, draw: 'custom', w: r1(bb.width * k), h: r1(bb.height * k), sound: 'plink', paint: (body) => { body.innerHTML = svg; } };
    wearSprites.set(key, s);
    return s;
  }

  /** SVG for a held item, upright on the hand centre (docs/rig.md section 4). */
  function heldSvg(item) {
    const p = manifestProp(item.kind);
    if (p) {
      const look = lookOf(item) || (item.props && item.props.variant);
      const name = look && p.variants[look] ? look : p.default;
      const v = p.variants[name];
      const grip = p.grip || [v.size[0] / 2 - v.anchor[0], v.size[1] / 2 - v.anchor[1]];
      return `<image href="${v.file}" x="${r1(-(v.anchor[0] + grip[0]) / K)}" y="${r1(-(v.anchor[1] + grip[1]) / K)}" width="${r1(v.size[0] / K)}" height="${r1(v.size[1] / K)}"/>`;
    }
    const s = spriteFor(item.kind, item.props);
    const w = Math.min(s.w, 90) / K, h = Math.min(s.h, 110) / K;
    return `<rect x="${r1(-w / 2)}" y="${r1(-h / 2)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(Math.min(w, h) * 0.3)}" fill="${s.fill || '#F4DC98'}"/>`;
  }

  // ---- building the live SVG ----
  function newRec(id) {
    const rec = {
      id, body: null, bob: null, svg: null, frameEls: [], names: [], slotEls: {}, atoms: {}, spec: null,
      pose: null, basePose: null, baseName: 'stand', anchorName: 'feet', held: { L: null, R: null }, worn: {},
      sig: null, taps: null, tPose: null, tFace: null, dragging: false, visible: true,
      regs: [], timers: new Set(), faceTimers: [], raf: 0, swing: null, offs: {},
    };
    recs.set(id, rec);
    return rec;
  }

  function paint(body, id) {
    const prevId = body.__char;
    if (prevId && prevId !== id) { const pr = recs.get(prevId); if (pr && pr.body === body) forget(pr); }
    const rec = recs.get(id) || newRec(id);
    if (rec.body && rec.body !== body) dropRegs(rec);
    rec.body = body;
    body.__char = id;
    stopIdle(rec);
    body.innerHTML = BOB_HTML;
    if (rec.bob && io) io.unobserve(rec.bob);
    rec.bob = body.firstChild;
    rec.bob.__rec = rec;
    rec.layers = {};
    for (const el of rec.bob.querySelectorAll('svg[data-l]')) rec.layers[el.getAttribute('data-l')] = el;
    rec.svg = rec.layers.body;
    rec.tiltEls = Array.prototype.slice.call(rec.bob.querySelectorAll('.char-tilt'));
    rec.eyesEl = rec.bob.querySelector('.char-eyes');
    rec.bob.style.animationDelay = `${-(random() * 3.6).toFixed(2)}s`;
    rec.sig = null;
    if (io) io.observe(rec.bob);
    const e = entityOf(id);
    if (e) build(rec, e);
    scheduleIdle();
  }

  function sigOf(e, kids) {
    let s = appearanceKey(e.props) + (e.props.pose || 'stand') + '|' + (e.props.raise || '') + '|';
    for (const c of kids) s += c.slot + ':' + c.kind + ':' + (lookOf(c) || (c.props && c.props.variant) || '') + ':' + JSON.stringify((c.props && c.props.colors) || null) + ',';
    return s;
  }

  function build(rec, e) {
    stats.builds++;
    stopTween(rec);
    const kids = kidsOf(e.id);
    const { held, worn } = partsOf(kids, rig);
    const spec = specOf(e.props, worn);
    rec.baseName = e.props.pose || 'stand';
    rec.basePose = composePose(rig, rec.baseName, held, e.props.raise);
    rec.anchorName = rec.basePose.anchor || 'feet';
    const pose = rec.dragging ? danglePose(rig, held, e.props.raise) : rec.tPose || rec.basePose;
    const expr = rec.tFace || spec.expr;
    stopIdle(rec);
    const res = renderCharacter(rig, spec, {
      pose, expr, marks: true, shadow: !rec.dragging, layers: true,
      held: { L: held.L ? heldSvg(held.L) : '', R: held.R ? heldSvg(held.R) : '' },
    });
    const vb = bodyBox(rig, spec.body);
    const b = boxFor(spec.body, rec.baseName);
    const a = res.anchors[rec.anchorName];
    const w = String(Math.round(vb[2] * K)), h = String(Math.round(vb[3] * K));
    // One viewBox for every layer: they stack exactly (docs/rig.md section 10).
    for (const name of LAYERS) {
      const svg = rec.layers[name];
      svg.setAttribute('viewBox', vb.join(' '));
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      svg.innerHTML = res.layers[name];
    }
    rec.vb = vb;
    const ox = (a[0] - vb[0]) * K, oy = (a[1] - vb[1]) * K;
    const st = rec.bob.style;
    st.left = `${r1(b.w / 2 - ox)}px`;
    st.top = `${r1(b.h - oy)}px`;
    st.width = `${w}px`;
    st.height = `${h}px`;
    st.transformOrigin = `${r1(ox)}px ${r1(oy)}px`;
    rec.frameEls = Array.prototype.slice.call(rec.bob.querySelectorAll('[data-f]'));
    rec.names = rec.frameEls.map((el) => el.getAttribute('data-f'));
    rec.slotEls = {};
    for (const slot of SLOTS) rec.slotEls[slot] = rec.bob.querySelector(`[data-slot="${slot}"]`);
    rec.atoms = resolveExpr(rig, expr);
    rec.spec = spec;
    rec.pose = pose;
    rec.held = held;
    rec.worn = worn;
    rec.sig = sigOf(e, kids);
    rec.offs = offsets(spec.body, pose, rec.anchorName);
    registerParts(rec);
  }

  /** World offsets (before depth scale) from the placement anchor to the other anchors, for a pose. */
  function offsets(bodyId, pose, anchorName) {
    const { anchors } = poseFrames(rig.bodies[bodyId].skeleton, pose);
    const a = anchors[anchorName];
    const o = {};
    for (const k of Object.keys(anchors)) o[k] = [(anchors[k][0] - a[0]) * K, (anchors[k][1] - a[1]) * K];
    return o;
  }

  /** Re-pose without rebuilding (same draw order): transforms on the frame groups only. */
  function applyPose(rec, pose) {
    const { frames, anchors } = poseFrames(rig.bodies[rec.spec.body].skeleton, pose);
    for (let i = 0; i < rec.frameEls.length; i++) {
      const n = rec.names[i];
      const el = rec.frameEls[i];
      if (n === 'shadow') { el.setAttribute('cx', String(anchors.feet[0])); if (pose.ground === false && pose.anchor === 'seat') el.setAttribute('cy', String(anchors.seat[1])); }
      else if (n === 'heldL' || n === 'heldR') el.setAttribute('transform', `translate(${anchors['hand' + n[4]].join(' ')})`);
      else if (frames[n]) el.setAttribute('transform', matrixAttr(frames[n]));
    }
    rec.pose = pose;
  }

  /** Cancel a running blink/glance/tilt at once (the layers are about to be redrawn). */
  function stopIdle(rec) {
    if (!rec.idleAnims) return;
    for (const a of rec.idleAnims) a.cancel();
    rec.idleAnims = null;
  }
  /** A pose change starts: a glance or tilt still running glides back to rest (150 ms) instead of drifting off the moving head. */
  function easeOutIdle(rec) {
    if (!rec.idleAnims) return;
    const list = rec.idleAnims;
    rec.idleAnims = null;
    for (const a of list) {
      const el = a.effect && a.effect.target;
      if (a.playState !== 'running' || !el || !a.__move) { a.cancel(); continue; }
      const now = getComputedStyle(el).transform;
      a.cancel();
      if (now && now !== 'none') idleAnim(rec, el, [{ transform: now }, { transform: 'none' }], { duration: 150, easing: 'ease-out' });
    }
  }
  /** One idle-life animation (transform/opacity on an HTML layer box: composited). */
  function idleAnim(rec, el, keyframes, opts, move = false) {
    tween.checkKeyframes(keyframes);
    // A new move on a box replaces the one still playing there: Blink can't
    // composite two transform (or opacity) animations on one element
    // (compositeFailed kTargetHasIncompatibleAnimations), so it would run the
    // new one on the main thread, a style recalc every frame for 1.3-1.7 s
    // (bead mhf.19). The shared timer never overlaps them; chars.idle() can.
    if (rec.idleAnims) {
      for (let i = rec.idleAnims.length - 1; i >= 0; i--) {
        const old = rec.idleAnims[i];
        if (old.effect && old.effect.target === el) { rec.idleAnims.splice(i, 1); old.cancel(); }
      }
    }
    const a = el.animate(keyframes, Object.assign({ id: IDLE_ANIM }, opts));
    a.__move = move;
    (rec.idleAnims || (rec.idleAnims = [])).push(a);
    a.onfinish = () => { if (rec.idleAnims) { const i = rec.idleAnims.indexOf(a); if (i >= 0) rec.idleAnims.splice(i, 1); } };
    return a;
  }

  function stopTween(rec) {
    if (rec.raf) cancelAnimationFrame(rec.raf);
    rec.raf = 0;
    rec.swing = null;
  }

  /** Tween the joints to `to` over ms (a short rAF loop that ends), or rebuild if the draw order differs. */
  function tweenTo(rec, to, ms = 240, done = null) {
    if (!alive(rec)) return;
    stopTween(rec);
    if (!sameOrder(rec.pose, to)) {
      const e = entityOf(rec.id);
      rec.tPose = to === rec.basePose ? null : to;
      if (e) build(rec, e);
      if (done) done();
      return;
    }
    easeOutIdle(rec);
    stats.tweens++;
    const from = rec.pose;
    const t0 = performance.now();
    const step = (now) => {
      rec.raf = 0;
      if (!alive(rec)) return;
      const t = Math.min(1, (now - t0) / ms);
      const k = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      applyPose(rec, t >= 1 ? to : lerpPose(from, to, k));
      if (t < 1) rec.raf = requestAnimationFrame(step);
      else if (done) done();
    };
    rec.raf = requestAnimationFrame(step);
  }

  function setFace(rec, expr) {
    if (!rec.spec) return;
    const atoms = resolveExpr(rig, expr);
    for (const slot of SLOTS) {
      if (atoms[slot] === rec.atoms[slot] || !rec.slotEls[slot]) continue;
      rec.slotEls[slot].innerHTML = faceSlot(rig, rec.spec, slot, atoms[slot]);
      stats.faces++;
    }
    rec.atoms = atoms;
    rec.shown = expr;
  }

  /** Show faces in sequence ([[expr, ms], ...]), then go back to the character's own expression. */
  function faces(rec, seq) {
    for (const t of rec.faceTimers) clearTimeout(t);
    rec.faceTimers = [];
    let at = 0;
    seq.forEach(([expr, ms]) => {
      rec.faceTimers.push(setTimeout(() => { if (!alive(rec)) return; rec.tFace = expr; setFace(rec, expr); }, at));
      at += ms;
    });
    rec.faceTimers.push(setTimeout(() => {
      rec.tFace = null;
      const e = entityOf(rec.id);
      if (e && alive(rec) && !rec.dragging) setFace(rec, e.props.expr || 'neutral');
    }, at));
  }

  // ---- world positions ----
  const viewOf = (id) => (view ? view.viewOf(id) : null);
  /** World point of anchor `name` of a drawn character. */
  function worldAnchor(rec, name) {
    const v = viewOf(rec.id);
    const o = rec.offs[name] || [0, 0];
    return v ? { x: v.x + o[0] * v.scale, y: v.y + o[1] * v.scale } : null;
  }
  function takenSeats(exceptId) {
    const out = new Set();
    for (const e of inRoom(store.state, room.id)) if (e.kind === CHAR_KIND && e.id !== exceptId && e.props.seat) out.add(e.props.seat);
    return out;
  }
  function seatFor(rec, v) {
    const o = rec.offs.seat || [0, 0];
    return seatNear(seats, v.x + o[0] * v.scale, v.y + o[1] * v.scale, takenSeats(rec.id));
  }

  // ---- held and worn parts: their own touch handlers ----
  function dropRegs(rec) {
    const keep = [];
    for (const el of rec.regs) {
      // Never cut off a gesture in progress on it (the drag carries on to its end).
      if (input.isHeld(el)) keep.push(el); else input.unregister(el);
    }
    rec.regs = keep;
  }

  function registerParts(rec) {
    dropRegs(rec);
    const add = (el, type, key) => { if (!el) return; input.register(el, partHandlers(rec, type, key, el)); rec.regs.push(el); };
    for (const s of ['L', 'R']) {
      if (!rec.held[s]) continue;
      add(rec.bob.querySelector(`[data-f="held${s}"]`), 'held', s);
      add(rec.bob.querySelector(`[data-f="hand${s}"]`), 'held', s);   // the mitten over it grabs it too
    }
    for (const slot of Object.keys(rec.worn)) {
      for (const el of rec.bob.querySelectorAll(`[data-w="${slot}"]`)) {
        // A gloved hand holding something grabs the held thing, not the glove.
        const f = el.getAttribute('data-f');
        if (f && f.indexOf('hand') === 0 && rec.held[f.slice(4)]) continue;
        add(el, 'wear', slot);
      }
    }
  }

  function partHandlers(rec, type, key, el) {
    let proxy = null;
    return {
      minHit: 40,
      onTap() {
        const e = entityOf(rec.id);
        if (!e) return;
        // A scene may answer a tap on the whole character first (P2b.1: a bow on the stage).
        if (base.charTap && base.charTap(e, { type, key })) return;
        if (type === 'held') {
          if (!rec.held[key]) return;
          store.dispatch('set', { id: e.id, path: 'props.raise', value: e.props.raise === key ? null : key });
          play('plink', { pitch: e.props.raise === key ? 0.9 : 1.2 });
          faces(rec, [['happy', 900]]);
        } else {
          const p = worldAnchor(rec, key === 'hat' || key === 'face' ? 'head' : 'seat');
          if (fx && p) fx.burst('sparkle', p.x, p.y - 20, { count: 5, spread: 60 });
          play('chime');
          faces(rec, [['love', 900]]);
        }
      },
      onDragStart(info) {
        const e = entityOf(rec.id);
        if (!e || !view) return false;
        // A long press lifts the whole character; so does an upward pull on an apron.
        if (info.longPress || (type === 'wear' && PULL_DOWN[key] && !(info.dy > Math.abs(info.dx)))) {
          proxy = view.handoff(rec.id, info);
          return !!proxy;
        }
        const item = type === 'held' ? rec.held[key] : rec.worn[key];
        if (!item) return false;
        const s = (hooks.spriteOf(item)) || spriteFor(item.kind, item.props);
        const x = r1(info.x), y = r1(info.y + s.h * 0.5);
        if (!store.dispatch('detach', { id: item.id, room: room.id, x, y, z: 0 })) return false;
        if (type === 'held' && e.props.raise === key) store.dispatch('set', { id: e.id, path: 'props.raise', value: null });
        proxy = view.handoff(item.id, info);
        if (type === 'wear') faces(rec, [['surprised', 500], ['happy', 600]]);
        return !!proxy;
      },
      onDragMove(info) { if (proxy) proxy.move(info); },
      onDragEnd(info) {
        const p = proxy;
        proxy = null;
        if (p) p.end(info);
        if (rec.regs.indexOf(el) < 0 || !el.isConnected) input.unregister(el);
      },
    };
  }

  // ---- reactions ----
  function react(rec, e, n) {
    const list = reactionsFor(e.props.pose || 'stand');
    let name = list[(n - 1) % list.length];
    const v = viewOf(rec.id);
    const free = !rec.held.R ? 'R' : !rec.held.L ? 'L' : null;
    if (name === 'wave' && !free) name = 'giggle';
    stats.reactions++;
    stats.lastReaction = name;
    if (name === 'giggle') {
      faces(rec, [['laughing', 1100]]);
      play('giggle');
      if (v) tween.wobble(v.body, { amount: 0.45 });
    } else if (name === 'wave') {
      faces(rec, [['happy', 1300]]);
      play('plink', { pitch: 1.3 });
      const base = rec.basePose;
      const frame = (k) => {
        const w = rig.poses[k ? 'wave2' : 'wave'];
        const p = Object.assign({}, base, { head: w.head, torso: w.torso });
        if (free === 'R') p.armR = w.armR; else p.armL = w.armR;
        return p;
      };
      let k = 0;
      const next = () => {
        if (!alive(rec) || rec.dragging) return;
        if (k >= 5) { tweenTo(rec, rec.basePose, 220); return; }
        tweenTo(rec, frame(k % 2), k ? 200 : 220, () => { k++; later(rec, 30, next); });
      };
      next();
    } else if (name === 'jump') {
      faces(rec, [['wheee', 1000]]);
      play('boing', { pitch: 1.2 });
      const c = rig.poses.cheer;
      const up = Object.assign({}, rec.basePose, { armL: rec.held.L ? rec.basePose.armL : c.armL, armR: rec.held.R ? rec.basePose.armR : c.armR, head: c.head, legL: c.legL, legR: c.legR });
      tweenTo(rec, up, 150);
      if (v) {
        tween.animate(v.body, [
          { transform: 'translate3d(0, 0, 0)', easing: 'ease-out' },
          { transform: 'translate3d(0, -56px, 0)', offset: 0.45, easing: 'ease-in' },
          { transform: 'translate3d(0, 0, 0)' },
        ], { duration: 560 });
        tween.squash(v.body, { delay: 560, amount: 0.8 });
      }
      later(rec, 520, () => { if (!rec.dragging) tweenTo(rec, rec.basePose, 200); });
      later(rec, 600, () => play('tap', { pitch: 0.8 }));
    } else if (name === 'happy') {
      faces(rec, [['love', 1400]]);
      play('bell');
      const p = worldAnchor(rec, 'head');
      if (fx && p) fx.burst('heart', p.x, p.y - 30, { count: 4, spread: 70 });
      if (v) tween.squish(v.body, { amount: 0.6 });
    } else if (name === 'sleepy') {
      faces(rec, [['sleepy', 1200]]);
      play('whistle', { pitch: 0.7, gain: 0.5 });
      if (v) tween.squish(v.body, { amount: 0.4 });
    }
  }

  function say(rec) {
    const text = pick(PHRASES);
    const allowed = talk !== false && store.state.settings.talk !== false;
    stats.said++;
    stats.lastSaid = allowed ? text : '';
    if (allowed && speech) speech.say(text, { interrupt: true });
    else play('giggle');
    // Mouth flaps while it talks.
    const seq = [];
    const mouths = ['oh', 'smile', 'laugh', 'small', 'oh', 'grin', 'sing', 'smile'];
    for (let i = 0; i < Math.min(8, 3 + text.length / 2); i++) seq.push([{ eyes: 'dot', mouth: mouths[i % mouths.length] }, 140]);
    seq.push(['happy', 700]);
    faces(rec, seq);
  }

  // ---- item dropped on a character ----
  function freeHand(rec, e, near) {
    const order = near === 'R' ? ['R', 'L'] : ['L', 'R'];
    for (const s of order) if (!rec.held[s]) return s;
    return null;
  }

  function dropOnChar(item, e, ctx) {
    const rec = recs.get(e.id);
    const v = viewOf(e.id);
    if (!rec || !v) return false;
    const info = ctx.info || { x: v.x, y: v.y - 100 };
    const slot = wearSlotOf(rig, item.kind);
    if (slot) return wearIt(rec, e, item, slot);
    const mouth = worldAnchor(rec, 'mouth');
    const near = (p, r) => p && Math.hypot(info.x - p.x, info.y - p.y) < r * v.scale;
    const hl = worldAnchor(rec, 'handL'), hr = worldAnchor(rec, 'handR');
    const side = hl && hr && Math.abs(info.x - hr.x) < Math.abs(info.x - hl.x) ? 'R' : 'L';
    if (isFood(item.kind) && (near(mouth, 70) || (rec.held.L && rec.held.R))) return feed(rec, e, item, side);
    const hand = freeHand(rec, e, side);
    if (!hand) {
      tween.shake(v.body, { amount: 0.6 });
      play('boing', { pitch: 0.8 });
      faces(rec, [['surprised', 700]]);
      return true;             // springs back
    }
    if (!store.dispatch('attach', { id: item.id, parent: e.id, slot: HANDS[hand] })) return true;
    play('plink', { pitch: 1.1 });
    faces(rec, [['happy', 900]]);
    return true;
  }

  function wearIt(rec, e, item, slot) {
    const v = viewOf(e.id);
    const old = rec.worn[slot];
    if (old && old.id !== item.id) {
      // The piece already there pops off to the side.
      const x = e.x + (random() < 0.5 ? -1 : 1) * 90;
      const s = hooks.spriteOf(old);
      const r = settle(room.def, { x, y: e.y + 10, halfW: s.w / 2 });
      if (store.dispatch('detach', { id: old.id, room: room.id, x: r1(r.x), y: r1(r.y), z: 0 })) {
        const h = worldAnchor(rec, 'head');
        if (h) view.animateFrom(old.id, h.x, h.y);
      }
    }
    if (!store.dispatch('attach', { id: item.id, parent: e.id, slot: wearSlotName(slot) })) return true;
    const p = worldAnchor(rec, slot === 'hat' || slot === 'face' ? 'head' : 'seat');
    if (fx && p) fx.burst('sparkle', p.x, p.y - (slot === 'hat' ? 50 : 0), { count: 8, spread: 90 });
    play('sparkle');
    if (v) tween.squish(v.body, { amount: 0.5 });
    if ((slot === 'back' || rig.wear[item.kind].costume) && (e.props.pose || 'stand') === 'stand') {
      // A cape or a hero suit: a quick hero pose.
      play('cheer', { gain: 0.6 });
      faces(rec, [['wheee', 1300]]);
      const c = rig.poses.cheer;
      tweenTo(rec, Object.assign({}, rec.basePose, { armL: rec.held.L ? rec.basePose.armL : c.armL, armR: rec.held.R ? rec.basePose.armR : c.armR, head: c.head }), 200);
      later(rec, 900, () => { if (!rec.dragging) tweenTo(rec, rec.basePose, 260); });
    } else faces(rec, [['love', 1300]]);
    return true;
  }

  function eatableOf(kind) {
    const k = catalog && catalog.get(kind);
    return !!(k && k.behaviors.some((b) => b.use === 'eatable'));
  }

  /** Take one bite of `item`: {ate, gone}. */
  function biteOf(rec, item) {
    const m = worldAnchor(rec, 'mouth');
    const at = m ? { x: m.x, y: m.y } : null;
    if (eatableOf(item.kind)) {
      const ok = base.act(item.id, 'bite', { at });
      return { ate: ok, gone: ok && !entityOf(item.id) };
    }
    const p = manifestProp(item.kind);
    if (p && p.bites) {
      // Art-only food: step its manifest bite variants (props.variant).
      const cur = (item.props && item.props.variant) || p.bites[0];
      const i = p.bites.indexOf(cur);
      const next = p.bites[i + 1];
      if (next === undefined) return { ate: false, gone: false };
      play(tagsOf(item.kind).includes('drink') ? 'bubble' : 'munch');
      if (fx && at) fx.burst('puff', at.x, at.y, { count: 5, scale: 0.4, spread: 40 });
      if (next === null) { store.dispatch('remove', { id: item.id, hard: true }); return { ate: true, gone: true }; }
      store.dispatch('set', { id: item.id, path: 'props.variant', value: next });
      return { ate: true, gone: false };
    }
    // Food with no bites (an egg, bread): a pretend nibble.
    play('munch', { pitch: 1.1 });
    if (fx && at) fx.burst('puff', at.x, at.y, { count: 4, scale: 0.35, spread: 36 });
    return { ate: true, gone: false };
  }

  function feed(rec, e, item, side = 'L') {
    if (item.parent !== e.id) {
      const hand = freeHand(rec, e, side);
      if (hand) store.dispatch('attach', { id: item.id, parent: e.id, slot: HANDS[hand] });
    }
    const cur = entityOf(item.id) || item;
    const taste = tasteOf(tagsOf(item.kind));
    const hot = !!(base.hotOf && base.hotOf(cur));     // P2a.3: fresh off the stove or out of the oven
    const r = biteOf(rec, cur);
    stats.bites++;
    stats.lastTaste = r.ate ? taste : 'none';
    const chomp = [[{ eyes: 'content', mouth: 'oh' }, 130], [{ eyes: 'content', mouth: 'small' }, 120], [{ eyes: 'content', mouth: 'oh' }, 130], [{ eyes: 'content', mouth: 'small' }, 120]];
    const v = viewOf(e.id);
    if (v) tween.squish(v.body, { amount: 0.35, duration: 300 });
    if (!r.ate) { faces(rec, [['cheeky', 900]]); play('boing', { pitch: 1.3 }); return true; }
    if (hot) { hotHotHot(rec, chomp); return true; }
    if (taste === 'sweet') {
      faces(rec, chomp.concat([['yum', 1300]]));
      later(rec, 500, () => { const p = worldAnchor(rec, 'head'); if (fx && p) fx.burst('heart', p.x, p.y - 40, { count: 3, spread: 60 }); });
    } else if (taste === 'weird') {
      faces(rec, chomp.concat([['yuck', 800], ['laughing', 1000]]));
      later(rec, 1000, () => play('giggle'));
    } else faces(rec, chomp.concat([['happy', 1000]]));
    return true;
  }

  // Hot food (P2a.3): "hot hot hot!", tongue out, fanning the mouth with a
  // free hand, a puff of steam; then yum. Never scary, never hurt.
  function hotHotHot(rec, chomp) {
    stats.lastTaste = 'hot';
    const fan = [];
    for (let i = 0; i < 6; i++) fan.push([{ eyes: i % 2 ? 'closed' : 'wide', brows: 'worried', mouth: i % 2 ? 'oh' : 'tongue', extras: 'sweat' }, 170]);
    faces(rec, chomp.slice(0, 2).concat(fan, [['yum', 1300]]));
    const allowed = talk !== false && store.state.settings.talk !== false;
    if (allowed && speech) speech.say('hot hot hot!', { interrupt: true });
    for (let i = 0; i < 3; i++) later(rec, 250 + i * 230, () => play('whistle', { pitch: 1.5 + i * 0.15, gain: allowed ? 0.25 : 0.5 }));
    const m = worldAnchor(rec, 'mouth');
    if (fx && m) fx.burst('steam', m.x, m.y - 30, { count: 2, spread: 40, scale: 0.7, angle: -90, arc: 70 });
    const free = !rec.held.R ? 'R' : !rec.held.L ? 'L' : null;
    if (free) {
      let k = 0;
      const flap = () => {
        if (!alive(rec) || rec.dragging) return;
        if (k >= 6) { tweenTo(rec, rec.basePose, 200); return; }
        const w = rig.poses[k % 2 ? 'wave2' : 'wave'];
        const p = Object.assign({}, rec.basePose, { head: w.head });
        if (free === 'R') p.armR = w.armR; else p.armL = w.armR;
        tweenTo(rec, p, 110, () => { k++; later(rec, 20, flap); });
      };
      later(rec, 240, flap);
    }
    later(rec, 1500, () => { const p = worldAnchor(rec, 'head'); if (fx && p) fx.burst('heart', p.x, p.y - 40, { count: 3, spread: 60 }); play('chime'); });
  }

  // ---- lifting and dropping a character ----
  function kickSwing(rec, amp, dir) {
    if (!alive(rec)) return;
    const swingBase = rec.pose;
    rec.swing = { t0: performance.now(), amp: clamp(amp, 0.4, 1.6) * 14 * (dir || 1), base: swingBase };
    if (rec.raf) return;
    const step = (now) => {
      rec.raf = 0;
      const s = rec.swing;
      if (!s || !alive(rec) || !rec.dragging) return;
      const t = now - s.t0;
      const a = s.amp * Math.exp(-t / 420) * Math.cos(t / 115);
      const b = s.base;
      applyPose(rec, Object.assign({}, b, {
        legL: [b.legL[0] - a, b.legL[1] - Math.abs(a) * 0.5, b.legL[2]],
        legR: [b.legR[0] + a, b.legR[1] - Math.abs(a) * 0.5, b.legR[2]],
        head: (b.head || 0) + a * 0.25,
      }));
      if (t < 1500) rec.raf = requestAnimationFrame(step);
      else { applyPose(rec, b); rec.swing = null; }
    };
    rec.raf = requestAnimationFrame(step);
  }

  function lift(e, ctx) {
    const rec = recs.get(e.id);
    if (!rec || !alive(rec)) return;
    for (const t of rec.timers) clearTimeout(t);
    rec.timers.clear();
    for (const t of rec.faceTimers) clearTimeout(t);
    rec.faceTimers = [];
    rec.dragging = true;
    rec.tPose = null;
    rec.tFace = pick(['wheee', 'surprised', 'laughing', 'wheee']);
    rec.bob.classList.add('char-lifted');
    build(rec, e);
    rec.vxSign = 0;
    kickSwing(rec, 1, 1);
    if (random() < 0.5) play('giggle', { pitch: 1.1 });
  }

  function swingMove(e, ctx) {
    const rec = recs.get(e.id);
    if (!rec || !rec.dragging || !ctx.info) return;
    const vx = ctx.info.vx;
    const sg = vx > 0.25 ? 1 : vx < -0.25 ? -1 : 0;
    if (sg && sg !== rec.vxSign) {
      rec.vxSign = sg;
      if (rec.swing) rec.swing.base = rec.swing.base;
      kickSwing(rec, Math.abs(vx), -sg);
    }
  }

  function place(e, ctx) {
    const rec = recs.get(e.id);
    const v = ctx.view.viewOf(e.id);
    if (!rec || !v) return false;
    rec.dragging = false;
    stopTween(rec);
    rec.tFace = null;
    rec.bob.classList.remove('char-lifted');
    const from = v.transform;
    const seat = seatFor(rec, v);
    const set = (key, value) => { if (JSON.stringify(e.props[key] === undefined ? null : e.props[key]) !== JSON.stringify(value)) store.dispatch('set', { id: e.id, path: 'props.' + key, value }); };
    let landAt = 0;
    let sound;
    let fell = false;
    let dist = 0;
    if (seat) {
      const lie = seat.lie;
      set('pose', seat.pose || (lie ? 'lie' : 'sit'));
      set('seat', seat.id);
      if (lie) set('expr', 'sleepy');
      else if (e.props.expr === 'sleepy') set('expr', 'happy');
      const x = lie ? seat.x - boxFor(e.props.body, 'lie').center : seat.x;
      store.dispatch('move', { id: e.id, room: room.id, x: r1(x), y: r1(seat.y), z: 0 });
      sound = lie ? 'squish' : 'tap';
    } else {
      const feet = rec.offs.feet || [0, 0];
      const fx0 = v.x + feet[0] * v.scale, fy0 = v.y + feet[1] * v.scale;
      const halfW = (boxFor(e.props.body, 'stand').w * DEPTH_SCALE[1]) / 4;
      const r = settle(room.def, { x: fx0, y: fy0, halfW });
      set('pose', 'stand');
      set('seat', null);
      if (e.props.expr === 'sleepy') set('expr', 'happy');
      store.dispatch('move', { id: e.id, room: room.id, x: r1(r.x), y: r1(r.y), z: 0 });
      sound = r.sound;
      fell = r.fall;
      dist = r.dist;
    }
    const now = entityOf(e.id);
    if (!now) return true;
    view.repaint(e.id);          // refused or not applied yet (a guest): back to the store's spot
    const to = v.transform;
    if (v.posAnim) v.posAnim.cancel();
    if (fell) {
      const f = tween.fall(v.el, from, to, { dist });
      v.posAnim = f.anim;
      landAt = f.landAt;
    } else if (from !== to) {
      v.posAnim = tween.slide(v.el, from, to, { duration: 170 });
      landAt = 130;
    }
    // Touchdown: legs under it (or the sit / lie pose), a squash, the sound.
    const touchdown = () => {
      const cur = entityOf(e.id);
      if (!cur || !alive(rec) || rec.dragging) return;
      build(rec, cur);
      if ((cur.props.pose || '').indexOf('sit') === 0) {
        // Sitting down: a little bounce on the seat.
        tween.animate(v.body, [
          { transform: 'translate3d(0, 0, 0) scale(1, 1)' }, { transform: 'translate3d(0, 0, 0) scale(1.06, 0.9)', offset: 0.22 },
          { transform: 'translate3d(0, -12px, 0) scale(0.97, 1.04)', offset: 0.5 }, { transform: 'translate3d(0, 0, 0) scale(1.03, 0.96)', offset: 0.78 },
          { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
        ], { duration: 460, easing: 'ease-out' });
      } else tween.squash(v.body, { amount: fell ? Math.min(1.3, 0.6 + dist / 400) : 0.7 });
      play(sound);
      if (cur.props.pose === 'lie') faces(rec, [['sleepy', 400]]);
      else faces(rec, [[fell ? 'surprised' : 'happy', 260], ['happy', 700]]);
    };
    if (landAt) later(rec, landAt, touchdown); else touchdown();
    return true;
  }

  // ---- store sync ----
  function sync(e) {
    const rec = recs.get(e.id);
    if (!rec || !alive(rec)) return;
    const kids = kidsOf(e.id);
    if (sigOf(e, kids) !== rec.sig) build(rec, e);
    else if (!rec.tFace && !rec.dragging) setFace(rec, e.props.expr || 'neutral');
    const t = e.props.taps || 0;
    if (rec.taps == null) rec.taps = t;
    else if (t > rec.taps) { rec.taps = t; if (!rec.dragging) react(rec, e, t); }
  }

  function forget(rec) {
    dropRegs(rec);
    for (const t of rec.timers) clearTimeout(t);
    for (const t of rec.faceTimers) clearTimeout(t);
    stopTween(rec);
    stopIdle(rec);
    if (rec.bob && io) io.unobserve(rec.bob);
    recs.delete(rec.id);
  }
  function prune() {
    for (const rec of [...recs.values()]) if (!alive(rec) || !viewOf(rec.id)) forget(rec);
  }

  // Children changed (a bite, a look, taken out): redraw their character.
  let prevState = store.state;
  const unsubscribe = store.subscribe((state, env) => {
    const before = prevState;
    prevState = state;
    if (!env || !view) return;
    const parents = new Set();
    for (const id of touchedIds(env)) {
      if (recs.has(id) && env.op !== 'set' && env.op !== 'inc' && env.op !== 'move') parents.add(id);   // something spawned into it
      for (const s of [state, before]) {
        const x = s.entities[id];
        if (x && x.parent && recs.has(x.parent)) parents.add(x.parent);
      }
    }
    for (const p of parents) view.repaint(p);
    if (env.op === 'travel' || env.op === 'remove') prune();
  });

  // ---- idle life: one shared timer ----
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      const rec = en.target.__rec;
      if (!rec) continue;
      rec.visible = en.isIntersecting;
      en.target.classList.toggle('char-off', !en.isIntersecting);
    }
    scheduleIdle();
  }) : null;

  const idleRecs = () => {
    const out = [];
    for (const rec of recs.values()) if (alive(rec) && rec.visible && !rec.dragging && !rec.raf) out.push(rec);
    return out;
  };

  let idleDue = 0;
  let idleHeld = false;     // chars.idleHold(true): no shared-timer idle life (tests measuring chars.idle)
  function scheduleIdle() {
    if (destroyed || document.hidden || idleHeld) return;
    const n = idleRecs().length;
    if (!n) return;
    // Each character gets a turn every ~3.6 s on average, however many there are.
    const ms = clamp(3600 / n, 320, 2400) * (0.6 + random() * 0.8);
    const now = performance.now();
    if (idleTimer && idleDue - now <= ms) return;     // (more characters arrived: come sooner)
    clearTimeout(idleTimer);
    idleDue = now + ms;
    idleTimer = setTimeout(idleTick, ms);
  }

  /**
   * One bit of idle life on a character: 'blink' (~130 ms), 'glance' (1.3 s)
   * or 'tilt' (1.7 s). Only WAAPI on the HTML layer boxes, no SVG change:
   * no layout, and no style recalc per frame (composited).
   */
  function idleLife(rec, what) {
    if (!alive(rec) || !rec.spec) return false;
    if (what === 'blink') {
      stats.blinks++;
      const hold = { duration: 130, easing: 'steps(1, end)' };
      idleAnim(rec, rec.layers.eyes, [{ opacity: 0 }, { opacity: 0 }], hold);
      idleAnim(rec, rec.layers.blink, [{ opacity: 1 }, { opacity: 1 }], hold);
      return true;
    }
    // The head frame (rotation + translation) of the pose on screen, in layer px.
    const m = poseFrames(rig.bodies[rec.spec.body].skeleton, rec.pose).frames.head;
    if (what === 'glance') {
      stats.glances++;
      // 5 art units along the head's own x axis (it may be tilted by the pose).
      const d = (random() < 0.5 ? -1 : 1) * 5 * K;
      const at = (f) => ({ transform: `translate(${r1(m[0] * d * f)}px, ${r1(m[1] * d * f)}px)` });
      idleAnim(rec, rec.eyesEl, [at(0), Object.assign(at(1), { offset: 0.15 }), Object.assign(at(1), { offset: 0.85 }), at(0)], { duration: 1300, easing: 'ease-in-out' }, true);
      return true;
    }
    if (what === 'tilt') {
      // A head tilt around the chin (the head frame's origin is the head centre).
      stats.tilts++;
      const ry = rig.bodies[rec.spec.body].skeleton.headRy;
      const vb = rec.vb;
      const cx = r1((m[2] * ry + m[4] - vb[0]) * K), cy = r1((m[3] * ry + m[5] - vb[1]) * K);
      const d = random() < 0.5 ? -7 : 7;
      const at = (deg) => ({ transform: `translate(${cx}px, ${cy}px) rotate(${deg}deg) translate(${-cx}px, ${-cy}px)` });
      for (const t of rec.tiltEls) {
        idleAnim(rec, t, [at(0), Object.assign(at(d), { offset: 0.25 }), Object.assign(at(d), { offset: 0.7 }), at(0)], { duration: 1700, easing: 'ease-in-out' }, true);
      }
      return true;
    }
    return false;
  }

  function idleTick() {
    idleTimer = 0;
    if (destroyed || document.hidden) return;
    stats.idleTicks++;
    const list = idleRecs().filter((r) => !r.tFace && r.pose === r.basePose && !(r.idleAnims && r.idleAnims.length));
    if (list.length) {
      const rec = pick(list);
      const roll = random();
      idleLife(rec, roll < 0.8 || rec.baseName === 'lie' ? 'blink' : roll < 0.9 ? 'glance' : 'tilt');
    }
    scheduleIdle();
  }

  const onVisibility = () => {
    const hidden = document.hidden;
    document.documentElement.classList.toggle('chars-paused', hidden);
    if (hidden) { clearTimeout(idleTimer); idleTimer = 0; } else scheduleIdle();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---- the view hooks ----
  const isChar = (e) => e && e.kind === CHAR_KIND;
  const hooks = Object.assign({}, base, {
    spriteOf(e) {
      if (isChar(e)) return charSprite(e);
      if (wearSlotOf(rig, e.kind)) {
        // The construction site's belt, gloves and hero suit lie around as their
        // prop art (assets/art-manifest.json) when there is one.
        // P2b.1: so do the theater's costume pieces (their catalog kinds have art).
        if (DROP_ART[rig.wear[e.kind].slot] || rig.wear[e.kind].costume || (catalog && catalog.hasArt(e.kind))) { const s = base.spriteOf ? base.spriteOf(e) : null; if (s) return s; }
        return wearSprite(e);
      }
      return base.spriteOf ? base.spriteOf(e) : null;
    },
    canDrag: (e) => (isChar(e) ? true : base.canDrag ? base.canDrag(e) : true),
    onTap(e, ctx) {
      if (!isChar(e)) return base.onTap ? base.onTap(e, ctx) : false;
      store.dispatch('inc', { id: e.id, path: 'props.taps', by: 1 });
      return true;
    },
    onLongPress(e, ctx) {
      if (!isChar(e)) return base.onLongPress ? base.onLongPress(e, ctx) : undefined;
      const rec = recs.get(e.id);
      if (rec) say(rec);
      return undefined;
    },
    dropTarget(item, other) {
      if (isChar(item)) return false;
      if (isChar(other)) return true;
      return base.dropTarget ? base.dropTarget(item, other) : false;
    },
    onDropInto(item, target, ctx) {
      if (isChar(target)) return dropOnChar(item, target, ctx);
      return base.onDropInto ? base.onDropInto(item, target, ctx) : false;
    },
    sortKeyOf(e) {
      if (!isChar(e) || !e.props.seat) return null;
      const s = seats.find((q) => q.id === e.props.seat);
      return s && Math.abs(s.y - e.y) < 1 ? s.depth + 0.5 : null;
    },
    onRender(e) { if (isChar(e)) sync(e); },
    onDragStart(e, ctx) { if (isChar(e)) lift(e, ctx); },
    onDragMove(e, ctx) { if (isChar(e)) swingMove(e, ctx); },
    dropSpot(e) {
      if (!isChar(e)) return null;
      const rec = recs.get(e.id);
      const v = viewOf(e.id);
      const s = rec && v ? seatFor(rec, v) : null;
      return s ? { id: 'seat:' + s.id, x0: s.x0, x1: s.x1, y: s.y, depth: s.depth } : null;
    },
    onDrop: (e, ctx) => (isChar(e) ? place(e, ctx) : false),
  });

  return {
    rig, seats, hooks, stats: () => Object.assign({}, stats, { chars: [...recs.values()].filter(alive).length, idleTimer: !!idleTimer }),
    /** Play one bit of idle life now ('blink' | 'glance' | 'tilt') on a character (tests, dev). */
    idle(id, what) { const rec = recs.get(id); return rec ? idleLife(rec, what) : false; },
    /** Hold (true) or resume (false) the shared idle timer, so a test can measure only the idle life it plays with idle() (tests, dev). */
    idleHold(on) {
      idleHeld = !!on;
      if (idleHeld) { clearTimeout(idleTimer); idleTimer = 0; } else scheduleIdle();
    },
    /** Use this view and fx (after createRoomView). */
    bind(v, f = null) { view = v; fx = f; scheduleIdle(); },
    /** What a character looks like right now (tests, debugging). */
    inspect(id) {
      const rec = recs.get(id);
      if (!rec || !alive(rec)) return null;
      return {
        pose: rec.baseName, dragging: rec.dragging, shown: rec.tFace || (entityOf(id) || { props: {} }).props.expr, atoms: Object.assign({}, rec.atoms),
        held: { L: rec.held.L && rec.held.L.kind, R: rec.held.R && rec.held.R.kind },
        worn: Object.fromEntries(Object.keys(rec.worn).map((k) => [k, rec.worn[k].kind])),
        anchors: Object.fromEntries(['head', 'mouth', 'handL', 'handR', 'feet', 'seat'].map((k) => [k, worldAnchor(rec, k)])),
        visible: rec.visible,
      };
    },
    /** Show faces in sequence on a character ([[expr, ms], ...]), then back to its own expression (P2c.2: the wrecking ball's giggle). */
    face(id, seq) { const rec = recs.get(id); if (!rec || !alive(rec) || rec.dragging) return false; faces(rec, seq); return true; },
    /**
     * Play a short joint sequence over the character's base pose, then ease
     * back: frames = [[partial pose (armL, armR, head, root...), ms], ...]
     * (P2b.1: a bow, the audience cheering). Local only (no store op).
     */
    gesture(id, frames, { face = null } = {}) {
      const rec = recs.get(id);
      if (!rec || !alive(rec) || rec.dragging || !frames.length) return false;
      if (face) faces(rec, face);
      let at = 0;
      frames.forEach(([pose, ms], i) => {
        const go = () => { if (!rec.dragging) tweenTo(rec, Object.assign({}, rec.basePose, pose), Math.min(220, ms)); };
        if (i === 0) go(); else later(rec, at, go);
        at += ms;
      });
      later(rec, at, () => { if (!rec.dragging) tweenTo(rec, rec.basePose, 260); });
      return true;
    },
    /** Screen-independent world anchor of a character (mouth, handL, head...). */
    anchor: (id, name) => { const rec = recs.get(id); return rec ? worldAnchor(rec, name) : null; },
    destroy() {
      destroyed = true;
      clearTimeout(idleTimer);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const rec of [...recs.values()]) forget(rec);
      if (io) io.disconnect();
    },
  };
}

export { seedCharacters, spawnCharacter, CHAR_KIND } from './char-model.js';
