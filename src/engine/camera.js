// Camera: the horizontal pan of a room wider than the 1440-unit stage
// (docs/design.md section 6.3). No DOM access: the stage (src/engine/stage.js)
// owns the elements and applies `x` as a translate on the room layer through
// the onMove callback. Kept DOM-free so the momentum math is unit-testable
// with a fake clock.
//
// Units: camera x is in room units (the world x shown at the stage's left
// edge), 0 .. roomWidth - 1440. Drag input is in screen px and divided by the
// stage scale, so the room tracks the finger 1:1.
//
// Performance: no per-frame loop when idle. A rAF loop runs only while a fling
// (momentum after release) or a panTo animation is in progress, and stops
// itself when the motion settles or hits an edge.

export const FRICTION_TAU = 325;    // ms; fling speed decays as exp(-t / tau) (iOS-like)
export const MIN_FLING = 0.05;      // units/ms at release needed to fling at all
export const STOP_SPEED = 0.01;     // units/ms below which a fling stops
export const VELOCITY_WINDOW = 100; // ms of drag history used for release velocity
export const STALE_MS = 60;         // finger resting this long before release = no fling
const MAX_FRAME_DT = 50;            // ms; clamp long frames (tab switch) so flings don't jump

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Release velocity (units/ms) from drag samples [{t, x}]. Pure. */
export function releaseVelocity(samples, tRelease) {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  if (tRelease - last.t > STALE_MS) return 0;
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > VELOCITY_WINDOW) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * opts.onMove(x): called whenever x changes (apply the transform there).
 * opts.onSettle(x): called when a fling or panTo animation ends or is stopped.
 * opts.raf(fn): frame scheduler, default window.requestAnimationFrame (looked
 * up per call); opts.cancelRaf likewise. Tests pass fakes.
 */
export function createCamera(opts = {}) {
  const onMove = opts.onMove || (() => {});
  const onSettle = opts.onSettle || (() => {});
  const raf = opts.raf || ((fn) => requestAnimationFrame(fn));
  const cancelRaf = opts.cancelRaf || ((id) => cancelAnimationFrame(id));

  const cam = {
    x: 0,
    max: 0,          // roomWidth - 1440 (0 = room doesn't pan)
    scale: 1,        // stage scale (screen px per unit), set by the stage
    dragging: false,
    moving: false,   // a fling or panTo animation is running (rAF active)
  };

  let frame = 0;
  let motion = null;  // {kind: 'fling', v, lastT} | {kind: 'tween', from, to, t0, dur}
  let drag = null;    // {startX, startCam, samples}

  function set(x) {
    const nx = clamp(x, 0, cam.max);
    if (nx !== cam.x) {
      cam.x = nx;
      onMove(nx);
    }
    return nx;
  }

  function stop() {
    if (frame) cancelRaf(frame);
    frame = 0;
    const was = cam.moving;
    motion = null;
    cam.moving = false;
    if (was) onSettle(cam.x);
  }

  function tick(t) {
    frame = 0;
    if (!motion) return;
    if (motion.kind === 'fling') {
      if (motion.lastT == null) motion.lastT = t;       // first frame: just take the timestamp
      const dt = Math.min(MAX_FRAME_DT, Math.max(0, t - motion.lastT));
      motion.lastT = t;
      const before = cam.x;
      // Exact integral of v * exp(-t/tau) over dt, so frame rate doesn't matter.
      const decay = Math.exp(-dt / FRICTION_TAU);
      const target = before + motion.v * FRICTION_TAU * (1 - decay);
      motion.v *= decay;
      const after = set(target);
      const hitEdge = after !== target;
      if (hitEdge || Math.abs(motion.v) < STOP_SPEED) { stop(); return; }
    } else {
      if (motion.t0 == null) motion.t0 = t;
      const p = motion.dur > 0 ? clamp((t - motion.t0) / motion.dur, 0, 1) : 1;
      set(motion.from + (motion.to - motion.from) * easeOutCubic(p));
      if (p >= 1) { stop(); return; }
    }
    frame = raf(tick);
  }

  function start(m) {
    stop();
    motion = m;
    cam.moving = true;
    frame = raf(tick);
  }

  /** Change the pan range (room width or stage resize). Keeps x in range. */
  cam.setRange = (max) => {
    cam.max = Math.max(0, max);
    if (cam.x > cam.max) set(cam.max);
  };

  /** Jump (or animate, with {duration} ms) to camera x. */
  cam.panTo = (x, { duration = 0 } = {}) => {
    const to = clamp(x, 0, cam.max);
    if (!duration || to === cam.x) { stop(); set(to); return; }
    start({ kind: 'tween', from: cam.x, to, t0: null, dur: duration });
  };

  /** Move by dx units immediately (e.g. edge auto-pan). Returns the applied delta. */
  cam.panBy = (dx) => {
    const before = cam.x;
    return set(before + dx) - before;
  };

  cam.stop = stop;

  // ---- drag with momentum (screen px in, timestamps in ms) ----
  cam.beginDrag = (sx, t) => {
    stop();                                   // a touch catches a fling, like iOS
    drag = { startX: sx, startCam: cam.x, samples: [{ t, x: cam.x }] };
    cam.dragging = true;
  };

  cam.dragTo = (sx, t) => {
    if (!drag) return;
    set(drag.startCam - (sx - drag.startX) / cam.scale);
    const s = drag.samples;
    s.push({ t, x: cam.x });
    // Keep only what releaseVelocity can use.
    while (s.length > 2 && t - s[0].t > VELOCITY_WINDOW * 2) s.shift();
  };

  cam.endDrag = (t) => {
    if (!drag) return;
    const v = releaseVelocity(drag.samples, t);
    drag = null;
    cam.dragging = false;
    if (Math.abs(v) >= MIN_FLING && cam.max > 0) start({ kind: 'fling', v, lastT: null });
  };

  cam.cancelDrag = () => {
    drag = null;
    cam.dragging = false;
  };

  return cam;
}
