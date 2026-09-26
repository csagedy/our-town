// The town: which location is on screen, and getting between them (P1.13,
// docs/design.md 2.6). The city map is home; tapping a built location's
// building zooms and irises into it; the round map button (top-left corner of
// every location, docs/STYLE.md section 7) brings you back to the map.
//
//   const town = await mountTown(stage, { input, store });
//   town.at            'city' | 'cafe/kitchen'
//   town.go(location)  animated; resolves when the new scene is up
//   town.busy          true during a transition (taps are ignored meanwhile)
//
// Where you are (and where the map was panned to) is this iPad's own state,
// not the shared world: two kids on two iPads can be in different places. It
// is kept in localStorage (`ourtown.here`) and survives a reload.
//
// Transition (transform/opacity only): the old scene zooms toward the door
// while a round iris grows from it and covers the screen; the new scene is
// mounted underneath (its images decoded first) and the iris shrinks away.

import { loadArt, preload } from './art.js';
import { mountCity, cityFiles, CITY_ID } from './city.js';
import { mountKitchen, kitchenFiles, KITCHEN_ID } from './kitchen.js';
import { mountBooth, boothFiles, BOOTH_ID } from './booth.js';
import * as tween from '../engine/tween.js';
import { sfx } from '../audio/index.js';
import { createCarry } from './carry.js';

export const HERE_KEY = 'ourtown.here';
export const LOCATIONS = [CITY_ID, KITCHEN_ID, BOOTH_ID];
const ZOOM_MS = 460;
const OPEN_MS = 420;

/** Read the saved place: { at, mapX }. Never throws. */
export function loadHere(storage = safeStorage()) {
  try {
    const v = JSON.parse(storage.getItem(HERE_KEY) || 'null');
    if (v && LOCATIONS.includes(v.at)) return { at: v.at, mapX: Number(v.mapX) || 0 };
  } catch { /* unreadable: start at home */ }
  return { at: CITY_ID, mapX: 0 };
}
export function saveHere(here, storage = safeStorage()) {
  try { storage.setItem(HERE_KEY, JSON.stringify(here)); } catch { /* private mode or full: forget */ }
}
function safeStorage() {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem() {} }; }
}

const HOUSE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 L44 23 Q45.5 24.5 44 26 Q42.8 27.2 41 26 L39 24.4 L39 40 Q39 43 36 43 L29 43 L29 32 Q29 30 27 30 L21 30 Q19 30 19 32 L19 43 L12 43 Q9 43 9 40 L9 24.4 L7 26 Q5.2 27.2 4 26 Q2.5 24.5 4 23 Z"/></svg>';

function mapButton(host) {
  const el = document.createElement('div');
  el.className = 'ui-btn ui-map';
  el.dataset.noPan = '';
  el.dataset.ui = 'map';
  el.innerHTML = `<div class="ui-btn-face">${HOUSE_ICON}</div>`;
  host.appendChild(el);
  return el;
}

function irisEl(host) {
  const el = document.createElement('div');
  el.className = 'town-iris';
  el.dataset.noPan = '';
  el.innerHTML = '<div class="town-iris-dot"></div>';
  el.style.visibility = 'hidden';
  host.appendChild(el);
  return el;
}

/**
 * Mount the town. opts: { input, store, storage (tests) }. Resolves once the first scene is up.
 */
export async function mountTown(stage, { input, store, storage } = {}) {
  const manifest = await loadArt();
  const here = loadHere(storage);
  const btn = mapButton(stage.host);
  const iris = irisEl(stage.host);
  const dot = iris.firstChild;
  let scene = null;
  let busy = false;
  const stats = { transitions: 0 };
  // P1.14: the pocket tray, hold-to-go, the car (src/scenes/carry.js).
  const carry = createCarry({ stage, input, store, manifest, storage, town: { at: () => here.at, go: (to, o) => go(to, o), button: btn, scene: () => scene } });

  async function mount(at, from = null) {
    if (scene) scene.destroy();
    scene = null;
    if (at === KITCHEN_ID) scene = await mountKitchen(stage, { input, store, manifest, carry });
    else if (at === BOOTH_ID) scene = await mountBooth(stage, { input, store, manifest, carry });   // P1.15
    else scene = await mountCity(stage, { input, store, manifest, carry, cameraX: here.mapX, from, onEnter: (_, loc, pt) => go(loc, { from: pt }) });
    here.at = at;
    saveHere(here, storage);
    const home = at === CITY_ID;
    btn.style.visibility = home ? 'hidden' : '';
    input.setEnabled(btn, !home);
    document.body.dataset.location = at;
    carry.mounted(scene);
  }

  // Remember how far the map is panned (on settle only: no per-frame writes).
  stage.onChange((_, why) => {
    if (here.at === CITY_ID && !busy && (why === 'settle' || why === 'camera') && !stage.camera.dragging && !stage.camera.moving) {
      here.mapX = Math.round(stage.camera.x);
      saveHere(here, storage);
    }
  });

  const saveNow = () => {
    if (here.at === CITY_ID && !busy) here.mapX = Math.round(stage.camera.x);
    saveHere(here, storage);
  };
  window.addEventListener('pagehide', saveNow);
  const onHidden = () => { if (document.visibilityState === 'hidden') saveNow(); };
  document.addEventListener('visibilitychange', onHidden);

  // Iris: a dot scaled from `from` (screen point) to cover the screen, or back.
  function irisSize(pt) {
    const r = stage.host.getBoundingClientRect();
    const dx = Math.max(pt.x - r.left, r.right - pt.x), dy = Math.max(pt.y - r.top, r.bottom - pt.y);
    return { x: pt.x - r.left, y: pt.y - r.top, s: (Math.hypot(dx, dy) * 2 + 40) / 100 };
  }
  function irisAnim(pt, closing, duration) {
    const { x, y, s } = irisSize(pt);
    iris.style.visibility = '';
    const at = (k) => `translate3d(${x - 50}px, ${y - 50}px, 0) scale(${k})`;
    const frames = closing ? [{ transform: at(0.01) }, { transform: at(s) }] : [{ transform: at(s) }, { transform: at(0.01) }];
    return tween.animate(dot, frames, { duration, easing: closing ? 'ease-in' : 'ease-out', fill: 'forwards' });
  }

  /** Go to a location with the zoom + iris transition. */
  async function go(to, { from = null } = {}) {
    if (busy || to === here.at || !LOCATIONS.includes(to)) return false;
    busy = true;
    stats.transitions++;
    carry.leaving();
    input.cancelAll();
    const leaving = here.at;
    if (leaving === CITY_ID) here.mapX = Math.round(stage.camera.x);
    const r = stage.host.getBoundingClientRect();
    const pt = from || { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    // Zoom the old scene toward the point while the iris closes over it.
    const w = stage.screenToWorld(pt.x, pt.y);
    const roomEl = scene.room.el;
    roomEl.style.transformOrigin = `${w.x}px ${w.y}px`;
    const zoom = tween.animate(roomEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }], { duration: ZOOM_MS, easing: 'ease-in', fill: 'forwards' });
    sfx.play('whoosh', { gain: 0.7 });
    const files = to === KITCHEN_ID ? kitchenFiles(manifest) : to === BOOTH_ID ? boothFiles(manifest) : cityFiles(manifest.map, !!store.state.map.night);
    await Promise.all([tween.done(irisAnim(pt, true, ZOOM_MS)), preload(files), tween.done(zoom)]);
    zoom.cancel();
    await mount(to, leaving);
    // Coming home: open the iris on the door we came out of.
    let openAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (to === CITY_ID && scene.doorPoint) {
      const d = scene.doorPoint(leaving);
      if (d) openAt = stage.worldToScreen(d.x, d.y);
    }
    const newRoom = scene.room.el;
    newRoom.style.transformOrigin = `${stage.screenToWorld(openAt.x, openAt.y).x}px ${stage.screenToWorld(openAt.x, openAt.y).y}px`;
    const settle = tween.animate(newRoom, [{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: OPEN_MS, easing: 'ease-out' });
    await Promise.all([tween.done(irisAnim(openAt, false, OPEN_MS)), tween.done(settle)]);
    for (const a of dot.getAnimations()) a.cancel();
    iris.style.visibility = 'hidden';
    busy = false;
    return true;
  }

  input.register(btn, {
    onTap() {
      if (busy) return;
      const face = btn.firstChild;
      tween.squish(face, { amount: 0.6, duration: 300 });
      sfx.play('pop');
      const b = btn.getBoundingClientRect();
      go(CITY_ID, { from: { x: b.left + b.width / 2, y: b.top + b.height / 2 } });
    },
  });

  await mount(here.at);

  return {
    get at() { return here.at; },
    get scene() { return scene; },
    get busy() { return busy; },
    get mapX() { return here.mapX; },
    manifest, stats, button: btn, carry,
    go,
    destroy() {
      window.removeEventListener('pagehide', saveNow);
      document.removeEventListener('visibilitychange', onHidden);
      if (scene) scene.destroy();
      scene = null;
      carry.destroy();
      input.unregister(btn);
      btn.remove();
      iris.remove();
    },
  };
}
