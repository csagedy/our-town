// Carrying things between places (P1.14, docs/design.md 2.5): the pocket
// tray, hold-to-go travel, the car and the bag glue. town.js creates one
// `carry` per page; each scene passes its entity view's hooks through
// carry.hooks(base, room) and town.js calls carry.mounted(scene) after every
// scene change.
//
// POCKET TRAY
// A round grape button in the bottom-left corner of every place (the city
// map too) and a strip of POCKET_MAX cells that slides out to its right.
// - Tap the button: the tray opens or closes (remembered on this iPad).
// - Start dragging anything (a prop, a bag, a character): the tray peeks
//   open by itself, so the target is right there; drop on it (or on the
//   button) and it goes in, with a pop and a sparkle. It closes again after
//   the drag if it was closed before. A full pocket or the car says "no"
//   (shake + boing) and the thing springs back.
// - Drag a thumbnail out: the thing comes out under the finger into the
//   place you are in and lands by the room's normal surface / floor settle.
// Things in the pocket stay ordinary store entities: they are top-level
// entities in the room `pocket/<deviceId>` (x = their order), so they are
// saved and replayed like anything else, and whatever they carry (a
// character's held and worn things, a bag's contents: child entities) comes
// along with no extra work. The pocket is the same in every place because it
// is not a place.
//
// Two iPads (host-authoritative, design.md 6.4): the pocket room is named
// after the device, so each iPad has its own pocket and only shows and takes
// from its own. Ownership rules:
// - Only the device whose id is in the room name puts things in or takes
//   them out (nothing else ever reads `pocket/<other device>`).
// - Pocketing is an ordinary `move`, so the host's leases apply: you can't
//   pocket something the other kid is holding (refused: it springs back).
// - While visiting, a guest's pocket lives in the HOST's world (the one world
//   being played). When the visit ends the guest goes back to its own world
//   (session.js), and whatever was in its pocket stays in the host's town,
//   waiting in `pocket/<guest>` for the next visit. Nothing crosses worlds.
// - Known limit: a guest's ops apply only when the host echoes them, so
//   dragging a thumbnail out on a guest iPad needs one round trip before the
//   thing is under the finger (the drag starts only if it is already there).
//
// HOLD-TO-GO
// While dragging something, hold it over the map button (in a place) or over
// a built building's door (on the map) for HOLD_MS: the button fills up, then
// the thing rides along through the transition (it waits in the pocket, so
// nothing is lost if anything goes wrong) and, if the finger is still down
// when the new place is up, it is back under the finger (input.adopt). If the
// finger let go meanwhile, it is in the pocket and the tray opens.
//
// THE CAR (a container kind, data/catalog.json `car`)
// One car lives on the city map. Drop characters and things into it: they sit
// in its seats (characters peek out over the door, props too). Tap it: honk,
// it drives along the street to the next building and parks at its door. At
// a built place (the cafe) its passengers hop out and go inside, and so do
// you. At a building that isn't built yet the building plays its "coming
// soon" and everyone stays in the car.
//
// BAGS (`backpack`): an ordinary P1.9 container; pocket it (or give it to a
// character to hold) and its contents come along, because they are its
// children.

import { inRoom, getEntity, childrenOf } from '../engine/world.js';
import { settle } from '../engine/surfaces.js';
import { spriteFor } from '../engine/sprites.js';
import { assignSlots, freeSlots } from '../core/containers.js';
import { loadRig } from '../engine/characters.js';
import { renderCharacter } from '../engine/rig-svg.js';
import { CHAR_KIND, partsOf, specOf } from '../engine/char-model.js';
import * as tween from '../engine/tween.js';
import { sfx } from '../audio/index.js';

export const POCKET_MAX = 6;
export const POCKET_KEY = 'ourtown.pocket';
export const HOLD_MS = 650;            // hold over the map button / a door this long to go
export const CAR_KIND = 'car';
export const CAR_SEATS = 4;
export const CAR_SPOT = { x: 600, y: 774 };       // where the car first parks on the map
const CAR_SEAT_X = [0.62, 0.46, 0.3, 0.14];      // seat centres (fractions of the car box), driver first
const CAR_RIM = 0.39;                            // door line (fraction of the car box from the top)
const CAR_PELVIS = 0.48;                         // a seated passenger's seat point (fraction of the box, from the bottom)
const DRIVE_SPEED = 0.55;                        // world units per ms
const r1 = (v) => Math.round(v * 10) / 10;

export const pocketRoomOf = (device) => 'pocket/' + device;
export const isVehicle = (e) => !!e && e.kind === CAR_KIND;
const isChar = (e) => !!e && e.kind === CHAR_KIND;

/** Top-level things in a pocket room, in pocket order (x, then id). Pure. */
export function pocketList(state, room) {
  return inRoom(state, room).sort((a, b) => (a.x - b.x) || (a.id < b.id ? -1 : 1));
}

/**
 * Where the things in the car sit: Map id -> {x, y, z, scale, front, hidden}
 * (view.js layout: feet offset from the car's feet in its units). box = the
 * car sprite {w, h}; items [{id, slot, w, h, char}]. Characters sit at
 * 70% size with their head and shoulders over the door; props peek out. Pure.
 */
export function carLayout(box, items) {
  const out = new Map();
  const rim = CAR_RIM * box.h - box.h;
  for (const it of assignSlots(items, CAR_SEATS)) {
    const i = Math.min(it.index, CAR_SEATS - 1);
    const scale = it.char ? 0.7 : 0.9;
    const x = CAR_SEAT_X[i] * box.w - box.w / 2 + (it.index >= CAR_SEATS ? 10 * (it.index - CAR_SEATS + 1) : 0);
    // A character sits (its placement point is the seat, legs below it, hidden
    // by the doors); a thing sinks 40% of its height below the door line.
    const y = it.char ? -CAR_PELVIS * box.h : rim + (it.h || 60) * scale * 0.4;
    out.set(it.id, { x: r1(x), y: r1(y), z: 10 + i, scale, front: false, hidden: false });
  }
  return out;
}

// The two cars painted into the map's street (tools/art/rooms/city.mjs
// parkedCar, world x spans): ours parks beside them, never on top.
export const PAINTED_CARS = [[203, 385], [812, 994]];
const CAR_HALF = 100;          // half our car's width on the map, plus a little air

/** Where the car parks for a door at world x: in front of it, or just beside a painted car there. Pure. */
export function parkX(doorX, painted = PAINTED_CARS) {
  for (const [a, b] of painted) {
    if (doorX + CAR_HALF <= a || doorX - CAR_HALF >= b) continue;
    const left = a - CAR_HALF, right = b + CAR_HALF;
    return Math.abs(left - doorX) <= Math.abs(right - doorX) ? left : right;
  }
  return doorX;
}

/**
 * The door the car drives to from x: the next one to the right (by where it
 * would park), else the first (around the block). With passengers aboard it heads for the next
 * BUILT place (so a tap takes everyone somewhere they can go in), which may
 * be the one it is parked at. doors sorted by x. Pure.
 */
export function nextDoor(doors, x, { built = false } = {}) {
  const list = built ? doors.filter((d) => d.location) : doors;
  if (built && !list.length) return nextDoor(doors, x);
  return list.find((d) => parkX(d.x) > x + 40) || list[0] || null;
}

const BAG_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 12 Q17 4 24 4 Q31 4 31 12 L28 12 Q28 7 24 7 Q20 7 20 12Z"/><path d="M9 18 Q9 12 15 12 L33 12 Q39 12 39 18 L39 38 Q39 44 33 44 L15 44 Q9 44 9 38Z"/></svg>';

function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem() {} }; }
}

/**
 * opts: { stage, input, store, manifest, town: { at(), go(to, {from}), button, scene() }, storage }
 */
export function createCarry({ stage, input, store, manifest, town, storage = safeStorage() }) {
  const pocketRoom = pocketRoomOf(store.device);
  const stats = { pocketed: 0, pulled: 0, refused: 0, holdGo: 0, adopted: 0, drives: 0, lastDrive: null };
  let open = false;
  try { open = !!(JSON.parse(storage.getItem(POCKET_KEY) || 'null') || {}).open; } catch { /* closed */ }
  let scene = null;                 // the current scene (town.scene)
  let hooksNow = null;              // the current scene's wrapped hooks (sprites for thumbnails)
  let rig = null;
  loadRig().then((r) => { rig = r; render(true); }).catch(() => {});

  // ---- fingers: where every pointer is (host has capture, so events reach the window) ----
  const fingers = new Map();        // pointerId -> {sx, sy, t, type}
  const onPtr = (e) => {
    if (e.type === 'pointerup' || e.type === 'pointercancel') fingers.delete(e.pointerId);
    else fingers.set(e.pointerId, { sx: e.clientX, sy: e.clientY, t: e.timeStamp, type: e.pointerType });
  };
  const PTR = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
  for (const t of PTR) window.addEventListener(t, onPtr, true);

  // ---- DOM ----
  const host = stage.host;
  const root = document.createElement('div');
  root.className = 'pocket';
  root.dataset.noPan = '';
  root.innerHTML = `<div class="pocket-tray" data-ui="pocket-tray"></div><div class="ui-btn ui-pocket" data-ui="pocket"><div class="ui-btn-face">${BAG_ICON}<div class="pocket-dots"></div></div></div>`;
  host.appendChild(root);
  const tray = root.firstChild;
  const btn = root.lastChild;
  const dots = btn.querySelector('.pocket-dots');
  const cells = [];
  for (let i = 0; i < POCKET_MAX; i++) {
    const c = document.createElement('div');
    c.className = 'pocket-cell';
    c.innerHTML = '<div class="pocket-thumb"></div>';
    tray.appendChild(c);
    const cell = { el: c, thumb: c.firstChild, id: null, sig: '' };
    cells.push(cell);
    input.register(c, {
      onTap() { if (cell.id) { tween.squish(cell.thumb, { amount: 0.8 }); sfx.play('plink'); } },
      onDragStart: (info) => (cell.id ? pullOut(cell.id, info) : false),
      onDragMove: (info) => { if (info.data.h) info.data.h.move(info); },
      onDragEnd: (info) => { if (info.data.h) info.data.h.end(info); },
    });
  }
  input.register(btn, {
    onTap() {
      tween.squish(btn.firstChild, { amount: 0.6, duration: 300 });
      sfx.play(open ? 'pop' : 'whoosh', { gain: 0.6, pitch: open ? 1 : 1.3 });
      setOpen(!open, true);
    },
  });

  function setOpen(on, remember) {
    open = on;
    root.classList.toggle('is-open', on);
    if (remember) { try { storage.setItem(POCKET_KEY, JSON.stringify({ open: on })); } catch { /* forget */ } }
  }
  setOpen(open, false);

  // ---- thumbnails ----
  function ensureRigCss() {
    if (!rig || document.getElementById('rig-css')) return;
    const st = document.createElement('style');
    st.id = 'rig-css';
    st.textContent = rig.css;
    document.head.appendChild(st);
  }
  function charThumb(e) {
    if (!rig) return '';
    ensureRigCss();
    const { held, worn } = partsOf(childrenOf(store.state, e.id), rig);
    const spec = specOf(e.props, worn);
    const res = renderCharacter(rig, spec, { pose: 'stand', expr: 'happy', shadow: false, held: {} });
    const h = rig.bodies[spec.body].skeleton.height;
    // A portrait: head and shoulders.
    const vb = [-h * 0.33, -h * 1.08, h * 0.66, h * 0.66].map(Math.round);
    void held;
    return `<svg class="pocket-char" xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" overflow="hidden">${res.svg}</svg>`;
  }
  function spriteOfE(e) {
    return (hooksNow && hooksNow.spriteOf && hooksNow.spriteOf(e)) || spriteFor(e.kind, e.props);
  }
  function paintThumb(cell, e) {
    const t = cell.thumb;
    t.textContent = '';
    t.removeAttribute('style');
    t.className = 'pocket-thumb';
    if (!e) return;
    t.dataset.kind = e.kind;
    if (isChar(e)) { t.innerHTML = charThumb(e); t.classList.add('is-char'); return; }
    const s = spriteOfE(e);
    const box = document.createElement('div');
    box.className = 'pocket-sprite';
    box.style.width = `${s.w}px`;
    box.style.height = `${s.h}px`;
    const size = cell.el.clientWidth * 0.78 || 70;
    const k = Math.min(size / s.w, size / s.h, 1.6);
    box.style.transform = `translate(-50%, -50%) scale(${Math.round(k * 1000) / 1000})`;
    if (s.draw === 'img') box.innerHTML = `<img src="${s.src}" alt="" draggable="false">`;
    else if (s.draw === 'custom' && s.paint) s.paint(box);
    else { box.classList.add('ph', `ph-${s.shape || 'blob'}`); box.style.background = s.fill || '#ccc'; }
    t.appendChild(box);
    const n = childrenOf(store.state, e.id).length;
    if (n) {
      const b = document.createElement('div');
      b.className = 'pocket-count';
      b.innerHTML = '<i></i>'.repeat(Math.min(n, 5));       // dots, no digits: zero reading
      t.appendChild(b);
    }
  }
  function sigOf(e) {
    let s = e.id + ':' + e.rev;
    for (const k of childrenOf(store.state, e.id)) s += ',' + k.id + ':' + k.rev;
    return s + (rig ? 'r' : '') + (hooksNow ? 'h' : '');
  }
  function render(force = false) {
    const list = pocketList(store.state, pocketRoom);
    cells.forEach((cell, i) => {
      const e = list[i] || null;
      const sig = e ? sigOf(e) : '';
      cell.id = e ? e.id : null;
      cell.el.classList.toggle('is-full', !!e);
      cell.el.dataset.id = e ? e.id : '';
      if (!force && sig === cell.sig) return;
      cell.sig = sig;
      paintThumb(cell, e);
    });
    dots.innerHTML = '<i></i>'.repeat(Math.min(list.length, POCKET_MAX));
    root.dataset.count = String(list.length);
  }
  const unsubscribe = store.subscribe(() => render(false));
  render(true);

  // ---- drop targets over the room ----
  let rects = null;
  function measure() {
    const hr = host.getBoundingClientRect();
    const box = (el, pad) => {
      // offset* ignore transforms: the tray's final (open) box, even mid-slide.
      let x = 0, y = 0;
      for (let n = el; n && n !== host; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      return { l: hr.left + x - pad, t: hr.top + y - pad, r: hr.left + x + el.offsetWidth + pad, b: hr.top + y + el.offsetHeight + pad };
    };
    const mb = town.button;
    rects = { tray: box(tray, 16), btn: box(btn, 16), map: mb && mb.style.visibility !== 'hidden' ? box(mb, 20) : null };
  }
  const inside = (r, info) => !!r && info.sx >= r.l && info.sx <= r.r && info.sy >= r.t && info.sy <= r.b;
  const overPocket = (info) => !!rects && (inside(rects.btn, info) || (root.classList.contains('is-open') && inside(rects.tray, info)));

  // ---- drag tracking ----
  let drag = null;                  // {id, pointer, wasOpen, holdTimer, holdAt}
  let closeTimer = 0;
  function dragBegan(e, info) {
    clearTimeout(closeTimer);
    if (drag) clearHold();
    drag = { id: e.id, pointer: info.id, wasOpen: open, holdTimer: 0, holdKey: null };
    if (!open && !isVehicle(e)) root.classList.add('is-open', 'is-peek');
    measure();
  }
  function dragMoved(e, info) {
    if (!drag || drag.id !== e.id) return;
    const over = overPocket(info);
    root.classList.toggle('is-over', over);
    if (isVehicle(e)) return;
    // Hold-to-go: over the map button in a place, over a built door on the map.
    let key = null, to = null, from = null;
    if (town.at() !== 'city' && inside(rects.map, info)) {
      key = 'map'; to = 'city';
      from = { x: (rects.map.l + rects.map.r) / 2, y: (rects.map.t + rects.map.b) / 2 };
    } else if (town.at() === 'city' && scene && scene.doorAt) {
      const b = scene.doorAt(info.sx, info.sy);
      const door = b && scene.doors().find((d) => d.building === b);
      if (door && door.location) {
        key = 'door:' + b; to = door.location;
        const w = scene.doorWorld(b);
        from = stage.worldToScreen(w.x, w.y);
      }
    }
    if (key !== drag.holdKey) {
      clearHold();
      if (key) {
        drag.holdKey = key;
        const el = key === 'map' ? town.button : null;
        if (el) el.classList.add('is-charging');
        if (!el && scene.poke) root.classList.add('is-door');
        drag.holdTimer = setTimeout(() => holdGo(drag.id, drag.pointer, to, from), HOLD_MS);
      }
    }
  }
  function clearHold() {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    drag.holdTimer = 0;
    drag.holdKey = null;
    if (town.button) town.button.classList.remove('is-charging');
    root.classList.remove('is-door');
  }
  function dragEnded(keepOpen) {
    if (!drag) return;
    clearHold();
    const wasOpen = drag.wasOpen;
    drag = null;
    root.classList.remove('is-over');
    clearTimeout(closeTimer);
    if (!wasOpen) {
      closeTimer = setTimeout(() => { if (!drag) root.classList.remove('is-open', 'is-peek'); setOpen(open, false); }, keepOpen ? 1100 : 250);
    }
  }

  // ---- in and out ----
  function refuse() {
    stats.refused++;
    tween.shake(tray, { amount: 0.6 });
    tween.squish(btn.firstChild, { amount: 0.5 });
    sfx.play('boing', { pitch: 0.85 });
  }
  function pocketIt(e) {
    const list = pocketList(store.state, pocketRoom);
    if (isVehicle(e) || list.length >= POCKET_MAX) { refuse(); return false; }
    const x = list.length ? Math.floor(list[list.length - 1].x) + 1 : 0;
    const env = store.dispatch('move', { id: e.id, room: pocketRoom, x, y: 0, z: 0 });
    if (!env) { refuse(); return false; }
    stats.pocketed++;
    sfx.play('pop');
    setTimeout(() => sfx.play('plink', { gain: 0.7 }), 90);
    tween.squish(btn.firstChild, { amount: 0.7 });
    const cell = cells.find((c) => c.id === e.id);
    if (cell) tween.squish(cell.thumb, { amount: 1.2, duration: 420 });
    return true;
  }

  /**
   * Bring pocket thing `id` out under the finger into the current place and
   * hand the drag to the room view. Returns what input's onDragStart wants
   * ({el, lift}) and keeps the view's drag proxy in info.data.h, or false.
   */
  function pullOut(id, info) {
    const sc = scene;
    const e = getEntity(store.state, id);
    if (!sc || !sc.view || !e) return false;
    const w = stage.screenToWorld(info.sx, info.sy);
    const s = spriteOfE(e);
    const k = sc.room.def.entityScale || 1;
    const env = store.dispatch('move', { id, room: sc.room.id, x: r1(w.x), y: r1(w.y + s.h * k * 0.4), z: 0 });
    if (!env) return false;
    const h = sc.view.handoff(id, info);
    if (!h) return false;
    info.data.h = h;
    stats.pulled++;
    const v = sc.view.viewOf(id);
    return v ? { el: v.el, lift: { target: v.lift, shadow: v.el.firstChild } } : false;
  }

  // ---- hold-to-go ----
  async function holdGo(id, pointer, to, from) {
    if (!drag || drag.id !== id) return;
    const e = getEntity(store.state, id);
    const list = pocketList(store.state, pocketRoom);
    clearHold();
    if (!e || list.length >= POCKET_MAX) { refuse(); return; }
    // It waits in the pocket while the scene changes (so nothing can be lost).
    const x = list.length ? Math.floor(list[list.length - 1].x) + 1 : 0;
    drag = null;
    root.classList.remove('is-over');
    if (!store.dispatch('move', { id, room: pocketRoom, x, y: 0, z: 0 })) { refuse(); return; }
    stats.holdGo++;
    sfx.play('honk', { gain: 0.5, pitch: 1.3 });
    const went = await town.go(to, { from });
    const f = fingers.get(pointer);
    if (went && f && getEntity(store.state, id) && pocketList(store.state, pocketRoom).some((q) => q.id === id)) {
      const ok = input.adopt(pointer, f, root, {
        onDragStart: (info) => pullOut(id, info),
        onDragMove: (info) => { if (info.data.h) info.data.h.move(info); },
        onDragEnd: (info) => { if (info.data.h) info.data.h.end(info); },
      });
      if (ok) { stats.adopted++; return; }
    }
    // The finger let go on the way: it is in the pocket.
    setOpen(true, true);
    const cell = cells.find((c) => c.id === id);
    if (cell) tween.squish(cell.thumb, { amount: 1.2, duration: 420 });
  }

  // ---- the car ----
  let driving = false;
  function boardCar(item, car, ctx) {
    const kids = childrenOf(store.state, car.id);
    const free = freeSlots(kids.map((k) => ({ id: k.id, slot: k.slot })), CAR_SEATS);
    const cv = ctx.view.viewOf(car.id);
    if (!free.length) {
      if (cv) tween.shake(cv.body, { amount: 0.6 });
      ctx.play('boing', { pitch: 0.8 });
      return true;                   // handled: it springs back
    }
    if (!store.dispatch('attach', { id: item.id, parent: car.id, slot: 's' + free[0] })) return true;
    // Sitting in a seat (a character dragged back out stands up again: characters.js place()).
    if (item.props.pose !== 'sit') store.dispatch('set', { id: item.id, path: 'props.pose', value: 'sit' });
    if (cv) tween.squish(cv.body, { amount: 0.8 });
    ctx.play('honk', { gain: 0.35, pitch: 1.4 });
    return true;
  }

  function drive(car, ctx) {
    const sc = scene;
    if (driving || !sc || sc.id !== 'city' || !sc.doors) {
      const v = ctx.view.viewOf(car.id);
      if (v) tween.wobble(v.body, { amount: 0.5 });
      ctx.play('honk');
      return;
    }
    const view = sc.view;
    const v = view.viewOf(car.id);
    const door = nextDoor(sc.doors(), car.x, { built: childrenOf(store.state, car.id).length > 0 });
    if (!v || !door) return;
    driving = true;
    stats.drives++;
    const from = v.transform;
    const to_x = parkX(door.x);
    const dist = Math.abs(to_x - car.x);
    ctx.play('honk');
    if (!store.dispatch('move', { id: car.id, room: sc.room.id, x: to_x, y: car.y, z: 0 })) { driving = false; return; }
    const to = v.transform;
    const duration = Math.max(700, Math.round(dist / DRIVE_SPEED));
    if (v.posAnim) v.posAnim.cancel();
    v.posAnim = tween.animate(v.el, [{ transform: from }, { transform: to }], { duration, easing: 'ease-in-out' });
    const bumps = Math.max(2, Math.round(duration / 260));
    const frames = [];
    for (let i = 0; i <= bumps; i++) frames.push({ transform: `translate3d(0, ${i % 2 ? -5 : 0}px, 0) rotate(${i % 2 ? -1.2 : 0}deg)` });
    tween.animate(v.body, frames, { duration, easing: 'linear' });
    // Keep the car on screen.
    const cam = stage.camera;
    if (cam.max > 0) cam.panTo(Math.max(0, Math.min(cam.max, to_x - 720)), { duration });
    stats.lastDrive = { building: door.building, location: door.location };
    tween.done(v.posAnim).then(() => {
      driving = false;
      if (scene !== sc) return;
      sfx.play('honk', { gain: 0.8 });
      const cur = getEntity(store.state, car.id);
      if (cur && view.viewOf(car.id)) tween.squash(view.viewOf(car.id).body, { amount: 0.8 });
      const riders = cur ? childrenOf(store.state, car.id) : [];
      if (!door.location || !riders.length) { sc.poke(door.building); return; }
      // Everybody out: they go inside (once the place is up, so a first
      // visit still gets its starter things), and so do we.
      sc.poke(door.building);
      riders_ = { car: car.id, location: door.location, ids: riders.map((r) => r.id) };
      const w = sc.doorWorld(door.building);
      setTimeout(() => { if (scene === sc) town.go(door.location, { from: stage.worldToScreen(w.x, w.y) }); }, 350);
    });
  }

  let riders_ = null;               // passengers on their way in: {car, location, ids}
  function unload(sc) {
    const p = riders_;
    riders_ = null;
    if (!p || sc.id !== p.location || !sc.view) return;
    const f = sc.room.def.floor;
    let i = 0;
    for (const id of p.ids) {
      const r = getEntity(store.state, id);
      if (!r || r.parent !== p.car) continue;       // somebody took it out meanwhile
      if (isChar(r) && r.props.pose && r.props.pose !== 'stand') store.dispatch('set', { id, path: 'props.pose', value: 'stand' });
      if (isChar(r) && r.props.seat) store.dispatch('set', { id, path: 'props.seat', value: null });
      const x = f.x0 + 420 + i * 170;
      const y = Math.round(f.bottom - 30 - (i % 2) * 40);
      if (store.dispatch('move', { id, room: sc.id, x, y, z: 0 })) sc.view.animateFrom(id, x - 60, y - 160);
      i++;
    }
  }

  // ---- the hooks every room view gets ----
  function hooks(base, room) {
    const h = Object.assign({}, base, {
      overUi: (e, info) => overPocket(info),
      dropOnUi(e, ctx) {
        const over = overPocket(ctx.info);
        dragEnded(over);
        return over ? (pocketIt(e), true) : false;
      },
      onDragStart(e, ctx) {
        dragBegan(e, ctx.info);
        if (base.onDragStart) base.onDragStart(e, ctx);
      },
      onDragMove(e, ctx) {
        dragMoved(e, ctx.info);
        if (base.onDragMove) base.onDragMove(e, ctx);
      },
      dropTarget(item, other) {
        if (isVehicle(other)) return !isVehicle(item);
        return base.dropTarget ? base.dropTarget(item, other) : false;
      },
      onDropInto(item, target, ctx) {
        if (isVehicle(target) && isChar(item)) return boardCar(item, target, ctx);
        return base.onDropInto ? base.onDropInto(item, target, ctx) : false;
      },
      layoutOf(parent, kids) {
        if (!isVehicle(parent)) return base.layoutOf ? base.layoutOf(parent, kids) : null;
        const box = h.spriteOf(parent) || spriteFor(parent.kind, parent.props);
        return carLayout(box, kids.map((k) => {
          const s = h.spriteOf(k) || spriteFor(k.kind, k.props);
          return { id: k.id, slot: k.slot, w: s.w, h: s.h, char: isChar(k) };
        }));
      },
      onTap(e, ctx) {
        if (isVehicle(e)) { drive(e, ctx); return true; }
        return base.onTap ? base.onTap(e, ctx) : false;
      },
    });
    void room;
    hooksNow = h;
    return h;
  }

  // ---- first time: the car on the map, a backpack in the cafe ----
  function ensureKit(sc) {
    const s = store.state;
    const has = (kind) => Object.keys(s.entities).some((id) => s.entities[id].kind === kind && getEntity(s, id));
    if (sc.id === 'city' && !has(CAR_KIND)) {
      store.dispatch('spawn', { id: store.newId(), kind: CAR_KIND, room: 'city', x: CAR_SPOT.x, y: CAR_SPOT.y });
    }
    if (sc.id === 'cafe/kitchen' && !has('backpack') && sc.room) {
      const r = settle(sc.room.def, { x: 1000, y: sc.room.def.floor.bottom - 30, halfW: 40 });
      store.dispatch('spawn', { id: store.newId(), kind: 'backpack', room: sc.id, x: Math.round(r.x), y: r.y });
    }
  }

  return {
    pocketRoom, stats, hooks,
    get open() { return open; },
    ids: () => pocketList(store.state, pocketRoom).map((e) => e.id),
    /** Screen box of pocket cell i (tests). */
    cellRect: (i) => cells[i].el.getBoundingClientRect(),
    button: btn,
    tray,
    setOpen: (on) => setOpen(on, true),
    /** After every scene change (town.js). */
    mounted(sc) {
      scene = sc;
      if (drag) dragEnded(false);
      driving = false;
      ensureKit(sc);
      unload(sc);
      render(true);
    },
    /** Before a scene change. */
    leaving() { if (drag) dragEnded(false); },
    destroy() {
      unsubscribe();
      for (const t of PTR) window.removeEventListener(t, onPtr, true);
      for (const c of cells) input.unregister(c.el);
      input.unregister(btn);
      root.remove();
    },
  };
}
