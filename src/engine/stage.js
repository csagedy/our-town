// Stage: the logical 1440 x 1000 play area, scaled to fit the screen and
// centered, with a camera for rooms wider than 1440 (docs/design.md 6.3).
//
// DOM layout (all positioned with transforms only):
//
//   host (#app, fixed, full screen, overflow hidden: clips the bleed)
//   └ .stage        translate(fit.x, fit.y) scale(s); 1440 x 1000; set on resize only
//     └ .stage-world   the room layer, room.width x 1000 units; the camera pan is
//       │              translate3d(-camera.x, 0, 0) on this element and nothing else
//       ├ .stage-backdrop  solid fill behind the room art, sized on resize to cover
//       │                  the letterbox bleed (any aspect ratio, portrait too)
//       └ ...scene art and entities, positioned in room units
//
// Coordinates: world = (screen - host origin - fit offset) / s + (camera.x, 0).
// Screen coordinates are clientX/clientY. Only the input module (P1.6) and
// views should convert, and they should use screenToWorld/worldToScreen.
//
// Performance: resize reads layout once; panning writes one transform per
// change and never reads layout; nothing runs per frame unless a fling or
// panTo animation is in progress (see camera.js).

import { createCamera } from './camera.js';

export const STAGE_W = 1440;
export const STAGE_H = 1000;
export const ART_BLEED = 100;   // room art is drawn this many units past every edge
const BLEED_MARGIN = 4;         // extra units so rounding never shows a hairline

/** Scale and offset that fit the stage inside a vw x vh viewport. Pure. */
export function fitStage(vw, vh) {
  const s = Math.min(vw / STAGE_W, vh / STAGE_H);
  return { s, x: (vw - STAGE_W * s) / 2, y: (vh - STAGE_H * s) / 2 };
}

/** Units of room needed past each stage edge to cover a vw x vh screen. Pure. */
export function bleedFor(vw, vh) {
  const f = fitStage(vw, vh);
  return {
    x: Math.max(0, f.x / f.s) + BLEED_MARGIN,
    y: Math.max(0, f.y / f.s) + BLEED_MARGIN,
  };
}

/** Screen point -> world point, for a fit {s, x, y}, camera x and host origin. Pure. */
export function screenToWorld(fit, camX, sx, sy, originX = 0, originY = 0) {
  return { x: (sx - originX - fit.x) / fit.s + camX, y: (sy - originY - fit.y) / fit.s };
}

/** World point -> screen point. Inverse of screenToWorld. Pure. */
export function worldToScreen(fit, camX, wx, wy, originX = 0, originY = 0) {
  return { x: (wx - camX) * fit.s + fit.x + originX, y: wy * fit.s + fit.y + originY };
}

const DEFAULT_BACKDROP = { top: 'transparent', bottom: 'transparent', horizon: 700 };

/**
 * Create the stage inside `host` and keep it fitted on resize/orientation change.
 * Returns the stage API (see the README-style summary at the end of this file).
 */
export function createStage(host) {
  const el = document.createElement('div');
  el.className = 'stage';
  const world = document.createElement('div');
  world.className = 'stage-world';
  const backdrop = document.createElement('div');
  backdrop.className = 'stage-backdrop';
  world.appendChild(backdrop);
  el.appendChild(world);
  host.appendChild(el);

  const listeners = new Set();
  const notify = (why) => listeners.forEach((fn) => fn(stage, why));

  const camera = createCamera({
    onMove(x) {
      world.style.transform = `translate3d(${-x}px, 0, 0)`;
      notify('camera');
    },
    onSettle() { notify('settle'); },
  });

  const stage = {
    el,            // the scaled stage root
    world,         // room layer: append scene art and entities here (room units)
    host,
    camera,        // {x, max, dragging, moving, panTo, panBy, stop, beginDrag, dragTo, endDrag}
    s: 1, x: 0, y: 0,          // current fit: scale and stage offset in the host (px)
    vw: 0, vh: 0,              // host size (px)
    originX: 0, originY: 0,    // host's top-left in client coordinates
    bleed: { x: 0, y: 0 },     // units of room visible past each stage edge
    room: { width: STAGE_W, backdrop: DEFAULT_BACKDROP },
  };

  function sizeBackdrop() {
    const { width, backdrop: b } = stage.room;
    const bx = Math.max(stage.bleed.x, ART_BLEED);
    const by = Math.max(stage.bleed.y, ART_BLEED);
    const horizon = by + (b.horizon ?? DEFAULT_BACKDROP.horizon);
    const st = backdrop.style;
    st.left = `${-bx}px`;
    st.top = `${-by}px`;
    st.width = `${width + 2 * bx}px`;
    st.height = `${STAGE_H + 2 * by}px`;
    st.background = `linear-gradient(to bottom, ${b.top} 0px, ${b.top} ${horizon}px, ${b.bottom} ${horizon}px, ${b.bottom} 100%)`;
  }

  /** Re-measure the host and refit. Called on resize; cheap to call again. */
  function layout() {
    const r = host.getBoundingClientRect();
    const vw = r.width || window.innerWidth;
    const vh = r.height || window.innerHeight;
    const fit = fitStage(vw, vh);
    Object.assign(stage, { s: fit.s, x: fit.x, y: fit.y, vw, vh, originX: r.left, originY: r.top });
    stage.bleed = bleedFor(vw, vh);
    camera.scale = fit.s;
    el.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})`;
    sizeBackdrop();
    notify('resize');
  }

  /**
   * Start a new room: clears the room layer (except the backdrop), sets its
   * width, backdrop fill and camera position. Scenes then append into
   * stage.world. backdrop = {top, bottom, horizon}: CSS colors above and below
   * world y = horizon, extended to cover any letterbox.
   */
  stage.setRoom = ({ width = STAGE_W, backdrop: b = DEFAULT_BACKDROP, cameraX = 0 } = {}) => {
    for (const child of [...world.children]) if (child !== backdrop) child.remove();
    stage.room = { width: Math.max(STAGE_W, width), backdrop: { ...DEFAULT_BACKDROP, ...b } };
    world.style.width = `${stage.room.width}px`;
    camera.stop();
    camera.cancelDrag();
    camera.setRange(stage.room.width - STAGE_W);
    camera.panTo(cameraX);
    world.style.transform = `translate3d(${-camera.x}px, 0, 0)`;
    sizeBackdrop();
    notify('room');
  };

  const fit = () => ({ s: stage.s, x: stage.x, y: stage.y });
  stage.screenToWorld = (sx, sy) => screenToWorld(fit(), camera.x, sx, sy, stage.originX, stage.originY);
  stage.worldToScreen = (wx, wy) => worldToScreen(fit(), camera.x, wx, wy, stage.originX, stage.originY);
  /** World rect currently on screen, including letterbox bleed: {left, top, right, bottom}. */
  stage.visibleWorld = () => {
    const a = stage.screenToWorld(stage.originX, stage.originY);
    const b = stage.screenToWorld(stage.originX + stage.vw, stage.originY + stage.vh);
    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
  };

  /** Subscribe to changes: fn(stage, why) with why = 'resize' | 'room' | 'camera' | 'settle'. Returns unsubscribe. */
  stage.onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  /**
   * Drag-to-pan on the background with momentum. Listens on `target` (default
   * the host) and pans when a single finger starts on something that passes
   * `canStart(e)` (default: not inside an element marked [data-no-pan]).
   * P1.6 can instead drive camera.beginDrag/dragTo/endDrag from its own
   * gesture recognizer and skip this. Returns a detach function.
   */
  stage.attachDragPan = ({ target = host, canStart = (e) => !(e.target.closest && e.target.closest('[data-no-pan]')) } = {}) => {
    let id = null;
    const down = (e) => {
      if (id !== null || !e.isPrimary || !canStart(e)) return;
      id = e.pointerId;
      try { target.setPointerCapture(id); } catch { /* pointer already gone */ }
      camera.beginDrag(e.clientX, e.timeStamp);
      if (camera.max > 0) world.style.willChange = 'transform';
    };
    const move = (e) => {
      if (e.pointerId === id) camera.dragTo(e.clientX, e.timeStamp);
    };
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      camera.endDrag(e.timeStamp);
      if (!camera.moving) world.style.willChange = '';
    };
    const cancel = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      camera.cancelDrag();
      world.style.willChange = '';
    };
    // Drop will-change once a fling settles.
    const off = stage.onChange((_, why) => {
      if (why === 'settle' && !camera.dragging) world.style.willChange = '';
    });
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', cancel);
    return () => {
      off();
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', cancel);
    };
  };

  stage.layout = layout;
  layout();
  stage.setRoom();
  window.addEventListener('resize', layout);
  // iOS can report the old size during orientationchange; measure again after it settles.
  window.addEventListener('orientationchange', () => { layout(); setTimeout(layout, 300); });
  return stage;
}

// API summary (for P1.6 input and P1.7 views):
//   const stage = createStage(host)
//   stage.setRoom({width, backdrop: {top, bottom, horizon}, cameraX})  new room; then append into stage.world
//   stage.screenToWorld(clientX, clientY) -> {x, y}   stage.worldToScreen(x, y) -> {x, y}
//   stage.visibleWorld() -> {left, top, right, bottom}   stage.s (px per unit), stage.bleed {x, y}
//   stage.onChange(fn(stage, why)) -> unsubscribe        why: 'resize' | 'room' | 'camera' | 'settle'
//   stage.attachDragPan({target, canStart}) -> detach   background drag-pan with momentum
//   stage.camera: x, max, dragging, moving, panTo(x, {duration}), panBy(dx), stop(),
//                 beginDrag(clientX, t), dragTo(clientX, t), endDrag(t), cancelDrag()
