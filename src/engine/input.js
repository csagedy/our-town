// Input: pointer events -> tap / drag / long-press, plus room panning
// (docs/design.md 2.1, 2.2, 6.3). One delegated set of pointer listeners on
// the stage host; things that react to touch register themselves:
//
//   const input = createInput(stage);
//   const off = input.register(el, {
//     onTap(info), onLongPress(info),
//     onDragStart(info)   // return false to refuse (e.g. a grab lease is busy), or
//                         // {el, lift: {target, shadow}} when the finger carries another
//                         // element (a spawner's new clone): it gets the lift feel instead
//     onDragMove(info),   // every move, and when the camera pans under the finger
//     onDragEnd(info),    // once; info.cancelled is true for a lost pointer
//     lift: true,         // lift feel on [data-lift] / [data-lift-shadow] children
//     pan: false,         // true: a drag that starts here pans the room instead
//     minHit: 64,         // min hit box in screen pt, centered on the element
//   });
//
// Gestures, per pointer (any number of fingers at once, one gesture each):
//   - a finger on a registered element is "pending" until it moves more than
//     TAP_SLOP screen pt from where it landed (then a drag starts, if the
//     element has drag handlers) or is held LONG_PRESS_MS (long-press, if it
//     has onLongPress; a later move still drags, with info.longPress = true).
//     Lifting a pending finger within TAP_MAX_MS is a tap. The slop is
//     generous on purpose: a 5-year-old's tap wobbles.
//   - a finger on nothing registered pans the room (camera drag with
//     momentum); one panning finger at a time, others are ignored.
//   - an element is held by one pointer at a time; a second finger on a held
//     element is ignored (not a pan).
//   - elements inside [data-no-pan] that are not registered (UI chrome that
//     handles its own events) are left alone.
//
// Hit boxes: a direct hit on a registered element (or its descendants) wins.
// Otherwise the nearest registered element whose box, grown to at least
// minHit x minHit screen pt around its center, contains the finger.
//
// Drag info is in room (world) units and recomputed from the screen point
// whenever the camera moves, so a dragged thing stays exactly under the
// finger during edge auto-pan and while another finger pans the room.
// Commit state (a store `move` op) in onDragEnd only, never per move.
//
// info = { id, el, pointerType, x, y (world), sx, sy (screen), startX, startY
//          (world at touch-down), dx, dy (world delta since touch-down), vx, vy
//          (screen pt/ms), longPress, cancelled, t (ms since touch-down), data
//          (scratch object that lives for the gesture) }
//
// Performance: nothing runs per frame except the edge auto-pan loop, and only
// while a dragged finger is inside an edge zone. Layout is read on
// touch-down only (padded hit test, lift origin).
//
// No DOM access at import time (unit tests import the pure helpers).

export const TAP_SLOP = 18;          // screen pt a finger may wander and still tap (design 2.2 said 10: too tight for a 5-year-old)
export const TAP_MAX_MS = 400;       // a still press released later than this is not a tap (kids tap slowly; design 2.2 said 250)
export const LONG_PRESS_MS = 500;    // held still this long: long-press (only if the element has onLongPress)
export const MIN_HIT = 64;           // screen pt
export const LIFT_SCALE = 1.08;
export const MAX_TILT = 12;          // degrees
export const TILT_PER_SPEED = 7;     // degrees per screen pt/ms of horizontal speed
export const TILT_SETTLE_MS = 90;    // finger still this long: tilt eases back to 0
export const LIFT_MS = 150;          // lift and set-down transition
export const EDGE_ZONE = 80;         // screen pt from the left/right screen edge
export const EDGE_DWELL = 120;       // ms in the zone before auto-pan starts
export const EDGE_RAMP = 450;        // ms from start to full speed
export const EDGE_MAX_SPEED = 1.3;   // room units per ms with the finger at the very edge
const VELOCITY_MS = 60;              // drag history used for velocity
const MAX_FRAME_DT = 50;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Padded hit test. cands: [{left, top, right, bottom, minHit?, order}] in
 * screen px. Returns the candidate whose box grown to at least minHit square
 * (centered) contains (x, y), nearest to its real box first, later order on
 * ties. Pure.
 */
export function paddedHit(cands, x, y, minHit = MIN_HIT) {
  let best = null;
  let bestD = Infinity;
  for (const c of cands) {
    const m = c.minHit ?? minHit;
    const px = Math.max(0, (m - (c.right - c.left)) / 2);
    const py = Math.max(0, (m - (c.bottom - c.top)) / 2);
    if (x < c.left - px || x > c.right + px || y < c.top - py || y > c.bottom + py) continue;
    const dx = Math.max(c.left - x, 0, x - c.right);
    const dy = Math.max(c.top - y, 0, y - c.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bestD || (d === bestD && best && (c.order ?? 0) > (best.order ?? 0))) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** What a released finger was. hasLongPress: long-press already fired. Pure. */
export function classifyRelease({ moved, elapsed, longPressed }) {
  if (moved || longPressed) return 'none';
  return elapsed <= TAP_MAX_MS ? 'tap' : 'none';
}

/** Has the finger left the tap slop? Pure. */
export const beyondSlop = (dx, dy, slop = TAP_SLOP) => dx * dx + dy * dy > slop * slop;

/**
 * Edge auto-pan speed (room units/ms, negative = left) for a finger at screen
 * x `sx` on a screen spanning left..right that has been in an edge zone for
 * `dwell` ms. Deeper in the zone is faster; it ramps up after a short dwell
 * so dropping something near the edge doesn't yank the room. Pure.
 */
export function edgeSpeed(sx, left, right, dwell) {
  let depth = 0;
  if (sx < left + EDGE_ZONE) depth = -Math.min(1, (left + EDGE_ZONE - sx) / EDGE_ZONE);
  else if (sx > right - EDGE_ZONE) depth = Math.min(1, (sx - (right - EDGE_ZONE)) / EDGE_ZONE);
  if (!depth) return 0;
  const ramp = clamp((dwell - EDGE_DWELL) / EDGE_RAMP, 0, 1);
  return depth * EDGE_MAX_SPEED * ramp;
}

/** Is screen x inside an edge zone? Pure. */
export const inEdgeZone = (sx, left, right) => sx < left + EDGE_ZONE || sx > right - EDGE_ZONE;

/** Drag tilt in degrees for a horizontal speed in screen pt/ms: the held thing swings behind the finger. Pure. */
export const tiltFor = (vx) => clamp(-vx * TILT_PER_SPEED, -MAX_TILT, MAX_TILT) || 0;

/** Velocity {vx, vy} (units/ms) over the last VELOCITY_MS of samples [{t, x, y}]. Pure. */
export function velocityOf(samples) {
  const n = samples.length;
  if (n < 2) return { vx: 0, vy: 0 };
  const last = samples[n - 1];
  let first = samples[n - 2];
  for (let i = n - 2; i >= 0 && last.t - samples[i].t <= VELOCITY_MS; i--) first = samples[i];
  const dt = last.t - first.t;
  return dt > 0 ? { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt } : { vx: 0, vy: 0 };
}

function report(err) {
  // A throwing handler must not leave a gesture stuck: finish our bookkeeping
  // and rethrow outside it, so it still shows up as an uncaught error.
  setTimeout(() => { throw err; });
}

function call(fn, info) {
  if (!fn) return undefined;
  try { return fn(info); } catch (err) { report(err); return undefined; }
}

/**
 * Create the input layer for a stage (src/engine/stage.js). opts.pan = false
 * turns off background panning. Returns the input API (see the top of file).
 */
export function createInput(stage, opts = {}) {
  const host = opts.target || stage.host;
  const panEnabled = opts.pan !== false;
  const { camera, world } = stage;

  const regs = new Map();       // el -> reg
  const gestures = new Map();   // pointerId -> gesture
  let order = 0;
  let panId = null;             // pointer panning the room
  let frame = 0;                // edge auto-pan rAF id
  let lastFrame = 0;
  let autopanning = false;
  const liftTimers = new WeakMap();

  // ---- hit testing ----
  function regFor(node) {
    for (let n = node; n && n !== host; n = n.parentNode) {
      const r = regs.get(n);
      if (r) return r;
    }
    return null;
  }
  const heldBy = (r) => {
    for (const g of gestures.values()) if (g.reg === r) return g;
    return null;
  };
  const draggable = (r) => !!(r.h.onDragStart || r.h.onDragMove || r.h.onDragEnd);

  /** -> reg | 'busy' | 'ui' | null (background). */
  function hitTest(target, sx, sy) {
    const direct = regFor(target);
    if (direct && !direct.disabled) return heldBy(direct) ? 'busy' : direct;
    if (!direct && target && target.closest && target.closest('[data-no-pan]')) return 'ui';
    const cands = [];
    for (const r of regs.values()) {
      if (r.disabled || r === direct || !r.el.isConnected || heldBy(r)) continue;
      const b = r.el.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      cands.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom, minHit: r.minHit, order: r.order, reg: r });
    }
    const best = paddedHit(cands, sx, sy);
    return best ? best.reg : null;
  }

  // ---- gesture info ----
  function info(g, extra) {
    const w = stage.screenToWorld(g.sx, g.sy);
    const v = velocityOf(g.samples);
    return {
      id: g.id, el: g.reg ? g.reg.el : null, pointerType: g.type,
      x: w.x, y: w.y, sx: g.sx, sy: g.sy,
      startX: g.w0.x, startY: g.w0.y, dx: w.x - g.w0.x, dy: w.y - g.w0.y,
      vx: v.vx, vy: v.vy, longPress: g.longPressed, cancelled: false,
      t: g.tLast - g.t0, data: g.data, ...extra,
    };
  }

  // ---- lift feel: scale up around the finger, tilt with velocity, shadow fades in ----
  function liftParts(r) {
    const l = r.lift;
    if (!l) return null;
    const o = l === true ? {} : l;
    const target = o.target || r.el.querySelector('[data-lift]');
    const shadow = o.shadow || r.el.querySelector('[data-lift-shadow]');
    return target || shadow ? { target, shadow } : null;
  }

  function liftStart(g) {
    const p = g.carry && g.carry.lift ? g.carry.lift : liftParts(g.reg);
    g.lift = p;
    if (!p) return;
    const { target, shadow } = p;
    if (target) {
      clearTimeout(liftTimers.get(target));
      const st = target.style;
      st.transition = 'none';
      st.transform = '';
      // Scale and tilt around the point under the finger, so it stays put.
      const r = target.getBoundingClientRect();
      const k = target.offsetWidth ? r.width / target.offsetWidth : 1;
      st.transformOrigin = `${(g.x0 - r.left) / k}px ${(g.y0 - r.top) / k}px`;
      st.willChange = 'transform';
      void target.offsetWidth;              // commit the reset before transitioning
      st.transition = `transform ${LIFT_MS}ms ease-out`;
      st.transform = `scale(${LIFT_SCALE}) rotate(0deg)`;
    }
    if (shadow) {
      clearTimeout(liftTimers.get(shadow));
      shadow.style.transition = `opacity ${LIFT_MS}ms ease-out`;
      shadow.style.opacity = '1';
    }
  }

  function setTilt(g, deg) {
    const t = g.lift && g.lift.target;
    if (!t) return;
    const d = Math.round(deg * 10) / 10;
    if (d === g.tilt) return;
    g.tilt = d;
    t.style.transform = `scale(${LIFT_SCALE}) rotate(${d}deg)`;
  }

  function liftEnd(g) {
    const p = g.lift;
    g.lift = null;
    if (!p) return;
    const { target, shadow } = p;
    if (target) {
      target.style.transform = '';
      liftTimers.set(target, setTimeout(() => {
        const st = target.style;
        st.transition = '';
        st.transformOrigin = '';
        st.willChange = '';
      }, LIFT_MS + 40));
    }
    if (shadow) {
      shadow.style.opacity = '';
      liftTimers.set(shadow, setTimeout(() => { shadow.style.transition = ''; }, LIFT_MS + 40));
    }
  }

  // ---- camera will-change and edge auto-pan ----
  function syncWillChange() {
    const on = camera.max > 0 && (camera.dragging || camera.moving || autopanning);
    world.style.willChange = on ? 'transform' : '';
  }

  function screenEdges() {
    return { left: stage.originX, right: stage.originX + stage.vw };
  }

  function checkEdge(g, now) {
    const { left, right } = screenEdges();
    const inZone = camera.max > 0 && inEdgeZone(g.sx, left, right);
    if (!inZone) {
      if (g.edgeSince) { g.edgeSince = 0; autopanIdle(); }
      return;
    }
    if (!g.edgeSince) g.edgeSince = now;
    if (!frame) {
      lastFrame = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  /** Stop the auto-pan loop now if no dragged finger is in an edge zone. */
  function autopanIdle() {
    for (const g of gestures.values()) if (g.state === 'drag' && g.edgeSince) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (autopanning) { autopanning = false; syncWillChange(); }
  }

  function tick(t) {
    frame = 0;
    const { left, right } = screenEdges();
    let v = 0;
    let any = false;
    for (const g of gestures.values()) {
      if (g.state !== 'drag' || !g.edgeSince) continue;
      any = true;
      v += edgeSpeed(g.sx, left, right, Math.max(0, t - g.edgeSince));
    }
    if (!any) {
      autopanning = false;
      syncWillChange();
      return;
    }
    const dt = lastFrame ? Math.min(MAX_FRAME_DT, Math.max(0, t - lastFrame)) : 0;
    lastFrame = t;
    if (v && dt && !camera.dragging) {
      if (camera.moving) camera.stop();
      if (!autopanning) { autopanning = true; syncWillChange(); }
      camera.panBy(clamp(v, -EDGE_MAX_SPEED * 2, EDGE_MAX_SPEED * 2) * dt);   // drags follow via onChange('camera')
    }
    frame = requestAnimationFrame(tick);
  }

  // ---- drag ----
  function startDrag(g) {
    clearTimeout(g.timer);
    const r = call(g.reg.h.onDragStart, info(g));
    if (r === false) { g.state = 'dead'; return; }
    g.carry = r && typeof r === 'object' && r.el ? r : null;
    g.state = 'drag';
    g.tilt = null;
    const el = g.carry ? g.carry.el : g.reg.el;
    el.dataset.dragging = '';
    el.style.willChange = 'transform';
    liftStart(g);
    dragMove(g, true);
  }

  function dragMove(g, fromPointer) {
    call(g.reg.h.onDragMove, info(g));
    if (!fromPointer) return;
    if (g.lift) {
      setTilt(g, tiltFor(velocityOf(g.samples).vx));
      clearTimeout(g.still);
      g.still = setTimeout(() => { if (g.state === 'drag') setTilt(g, 0); }, TILT_SETTLE_MS);
    }
    checkEdge(g, performance.now());
  }

  function endDrag(g, cancelled) {
    clearTimeout(g.still);
    const el = g.carry ? g.carry.el : g.reg.el;
    delete el.dataset.dragging;
    el.style.willChange = '';
    liftEnd(g);
    autopanIdle();                          // g is already out of `gestures`
    call(g.reg.h.onDragEnd, info(g, { cancelled }));
  }

  // ---- pointer events ----
  function capture(id) {
    try { host.setPointerCapture(id); } catch { /* pointer already gone */ }
  }

  function sample(g, e) {
    g.sx = e.clientX;
    g.sy = e.clientY;
    g.tLast = e.timeStamp;
    const s = g.samples;
    s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (s.length > 2 && e.timeStamp - s[0].t > VELOCITY_MS * 2) s.shift();
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const stale = gestures.get(e.pointerId);
    if (stale) finish(stale, true);
    const hit = hitTest(e.target, e.clientX, e.clientY);
    if (hit === 'ui') return;
    const g = {
      id: e.pointerId, type: e.pointerType, kind: 'none', state: 'pending', reg: null,
      x0: e.clientX, y0: e.clientY, sx: e.clientX, sy: e.clientY, t0: e.timeStamp, tLast: e.timeStamp,
      w0: stage.screenToWorld(e.clientX, e.clientY), samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
      data: {}, longPressed: false, timer: 0, still: 0, edgeSince: 0, lift: null, tilt: null,
    };
    if (hit && hit !== 'busy') {
      g.kind = 'target';
      g.reg = hit;
      if (camera.moving && !camera.dragging) camera.stop();   // a touch catches a fling
      if (hit.h.onLongPress) g.timer = setTimeout(() => longPress(g), LONG_PRESS_MS);
    } else if (!hit && panEnabled && panId === null) {
      startPan(g, e.clientX, e.timeStamp);
    }
    gestures.set(g.id, g);
    capture(g.id);
  }

  function startPan(g, sx, t) {
    g.kind = 'pan';
    panId = g.id;
    camera.beginDrag(sx, t);
    syncWillChange();
  }

  function longPress(g) {
    if (gestures.get(g.id) !== g || g.state !== 'pending') return;
    g.state = 'held';
    g.longPressed = true;
    g.tLast = g.t0 + LONG_PRESS_MS;
    call(g.reg.h.onLongPress, info(g));
  }

  function onMove(e) {
    const g = gestures.get(e.pointerId);
    if (!g) return;
    sample(g, e);
    if (g.kind === 'pan') { camera.dragTo(e.clientX, e.timeStamp); return; }
    if (g.kind !== 'target') return;
    if (g.state === 'drag') { dragMove(g, true); return; }
    if (g.state !== 'pending' && g.state !== 'held') return;
    if (!beyondSlop(g.sx - g.x0, g.sy - g.y0)) return;
    clearTimeout(g.timer);
    if (draggable(g.reg)) startDrag(g);
    else if (g.reg.pan && panEnabled && panId === null) {
      // A tap-only hot spot that opted in: the drag pans the room from where the finger landed.
      startPan(g, g.x0, g.t0);
      camera.dragTo(e.clientX, e.timeStamp);
    } else g.state = 'dead';
  }

  function finish(g, cancelled, e) {
    gestures.delete(g.id);
    clearTimeout(g.timer);
    if (e) sample(g, e);
    if (g.kind === 'pan') {
      if (panId === g.id) panId = null;
      if (cancelled) camera.cancelDrag(); else camera.endDrag(e ? e.timeStamp : performance.now());
      syncWillChange();
      return;
    }
    if (g.kind !== 'target') return;
    if (g.state === 'drag') { endDrag(g, cancelled); return; }
    if (cancelled) return;
    const kind = classifyRelease({
      moved: g.state === 'dead', elapsed: g.tLast - g.t0, longPressed: g.longPressed,
    });
    if (kind === 'tap' && g.state === 'pending') call(g.reg.h.onTap, info(g));
  }

  function onUp(e) {
    const g = gestures.get(e.pointerId);
    if (g) finish(g, false, e);
  }
  function onCancel(e) {
    const g = gestures.get(e.pointerId);
    if (g) finish(g, true);
  }
  function onLostCapture(e) {
    // Only our own capture on the host; lostpointercapture bubbles up from
    // the element the browser implicitly captured a touch to.
    if (e.target !== host) return;
    const g = gestures.get(e.pointerId);
    if (g) finish(g, true);
  }

  function cancelAll() {
    for (const g of [...gestures.values()]) finish(g, true);
  }
  const onHidden = () => { if (document.visibilityState === 'hidden') cancelAll(); };

  const offStage = stage.onChange((_, why) => {
    if (why === 'camera' || why === 'resize') {
      // The world under a still finger changed: keep dragged things under it.
      for (const g of gestures.values()) if (g.state === 'drag') dragMove(g, false);
    } else if (why === 'settle') {
      syncWillChange();
    } else if (why === 'room') {
      cancelAll();
      syncWillChange();
    }
  });

  const listeners = [
    ['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp],
    ['pointercancel', onCancel], ['lostpointercapture', onLostCapture],
  ];
  for (const [type, fn] of listeners) host.addEventListener(type, fn);
  window.addEventListener('blur', cancelAll);
  document.addEventListener('visibilitychange', onHidden);

  const input = {
    /** Make el react to touch. Returns an unregister function. */
    register(el, handlers = {}) {
      const { lift = false, pan = false, minHit = MIN_HIT, ...h } = handlers;
      if (regs.has(el)) input.unregister(el);
      regs.set(el, { el, h, lift, pan, minHit, order: order++, disabled: false });
      return () => input.unregister(el);
    },
    /** Stop reacting; a gesture in progress on el ends as cancelled. */
    unregister(el) {
      const r = regs.get(el);
      if (!r) return;
      const g = heldBy(r);
      if (g) finish(g, true);
      regs.delete(el);
    },
    /** Temporarily ignore el (it keeps its registration). */
    setEnabled(el, on) {
      const r = regs.get(el);
      if (!r) return;
      r.disabled = !on;
      if (!on) { const g = heldBy(r); if (g) finish(g, true); }
    },
    isHeld: (el) => { const r = regs.get(el); return !!(r && heldBy(r)); },
    /** The registered element a touch at (clientX, clientY) would pick, or null. */
    hitTest(sx, sy) {
      const r = hitTest(document.elementFromPoint(sx, sy), sx, sy);
      return r && typeof r === 'object' ? r.el : null;
    },
    cancelAll,
    /**
     * Carry on with a finger that is still down after its gesture ended (a
     * scene change cancels every gesture): from now on it drags as if it had
     * started on `el` with `handlers` (onDragStart / onDragMove / onDragEnd,
     * as for register). at = {sx, sy, t (event timeStamp), type}: where the
     * finger is now. The host kept its pointer capture, so the finger's moves
     * and its lift keep arriving here. False if that pointer already has a
     * gesture or the drag was refused. (P1.14: an item carried through the
     * map button comes along into the next place.)
     */
    adopt(pointerId, at, el, handlers = {}) {
      if (gestures.has(pointerId)) return false;
      const { lift = false, ...h } = handlers;
      const reg = { el, h, lift, pan: false, minHit: MIN_HIT, order: order++, disabled: false };
      const g = {
        id: pointerId, type: at.type || 'touch', kind: 'target', state: 'pending', reg,
        x0: at.sx, y0: at.sy, sx: at.sx, sy: at.sy, t0: at.t, tLast: at.t,
        w0: stage.screenToWorld(at.sx, at.sy), samples: [{ t: at.t, x: at.sx, y: at.sy }],
        data: {}, longPressed: false, timer: 0, still: 0, edgeSince: 0, lift: null, tilt: null,
      };
      gestures.set(pointerId, g);
      capture(pointerId);
      startDrag(g);
      if (g.state !== 'drag') { gestures.delete(pointerId); return false; }
      return true;
    },
    /** Snapshot for tests and debugging. */
    debug: () => ({
      pointers: [...gestures.values()].map((g) => ({ id: g.id, kind: g.kind, state: g.state })),
      panning: panId !== null, autopanLoop: !!frame, registered: regs.size,
    }),
    destroy() {
      cancelAll();
      offStage();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      for (const [type, fn] of listeners) host.removeEventListener(type, fn);
      window.removeEventListener('blur', cancelAll);
      document.removeEventListener('visibilitychange', onHidden);
      regs.clear();
    },
  };
  return input;
}
