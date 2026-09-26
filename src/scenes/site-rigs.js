// The construction site's big machines (P2c.2, docs/design.md 3.3 #3, #4):
// the TOWER CRANE and the WRECKING BALL, mounted by src/scenes/site.js.
//
//   const rigs = createSiteRigs({ stage, store, input, room, fx, manifest, catalog, pieces, later, site });
//   const hooks = rigs.hooks(siteHooks);      // before createRoomView
//   rigs.bind(view, chars);                   // after it
//   rigs.lever('down' | 'up');                // the lever piece was flipped (site.js)
//   rigs.quiet()                              // true while a wreck dispatches (no auto-settle)
//
// TOWER CRANE. The hook is ONE store entity (kind 'crane-hook', src/core/crane.js)
// whose x, y is the grab point; what hangs on it is its child (`attach` slot
// 'hook'), drawn inside it by the view (layoutOf), so it rides along. The
// crane art (trolley, cable, hook) follows that point with transforms.
// - Drag the TROLLEY along the jib: the hook and its load come along and
//   swing (the pendulum feels the trolley's acceleration).
// - Drag the HOOK anywhere in the crane's reach (the trolley follows).
// - The LEVER: down lowers the hook until it touches something (clunk: it
//   takes hold) or, with a load, until the load touches down (it is set
//   down; a build piece over the deck snaps onto the grid via buildgrid); up
//   raises it to the top.
// - Letting go of the hook on something takes hold of it; letting go of a
//   load low enough sets it down.
// - A character on the hook holds on with both hands up and grins (pose
//   'hold-up', expr 'wheee'; its own face comes back when it gets off).
// Every change is a store op (the hook's `move`, `attach`, the load's `move`
// and `set`s), so it is saved and shared; the other iPad animates the hook to
// wherever the op says. Motion is a rAF loop that runs ONLY while something
// moves or swings, then stops (idle costs nothing).
//
// WRECKING BALL (src/core/wreck.js). Pull the ball back and let go: the whole
// swing and everything it knocks down is planned first (landing spots, spins,
// hops rolled here), then dispatched: ONE `set` of the site-fixtures entity's
// props.wreck carrying the plan, then a `move` per knocked piece / character
// (and the settle of what is left). Every iPad plays the same swing from the
// plan and gives each moved thing its tumble, delayed to the moment the ball
// reaches it. BOOM, a little screen shake (not with prefers-reduced-motion),
// dust, clatter, giggles. Locked pieces wobble and stay.

import * as tween from '../engine/tween.js';
import { getEntity, childrenOf, inRoom } from '../engine/world.js';
import { createRng } from '../engine/random.js';
import { zIndexFor } from '../engine/surfaces.js';
import { snapDrop, overGrid } from '../core/buildgrid.js';
import {
  HOOK_KIND, HOOK_SLOT, craneGeom, clampHook, pieceTransforms, swingLength, swingStep, swingSettled, approach,
  contactBelow, thingAt, landingUnder, hookLayout, TROLLEY_SPEED, HOOK_SPEED,
} from '../core/crane.js';
import { pullOf, ballPos, ballAt, swingPath, planWreck, MIN_PULL, TUMBLE_MS, LAND_AT } from '../core/wreck.js';

export const RIG_PIECES = ['crane-trolley', 'crane-cable', 'crane-hook', 'wreck-chain', 'wreck-ball'];
const HOOK_SORT = 999;            // the hook and its load draw in front of the mid layer, behind the front art
const FLOOR_Y = 915;              // a load lowered over open ground lands here (in front of the deck)
const GROUND = 935;               // the ball's bottom skids along this line
const MOTOR_EVERY = 850;
const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const NO_PICK = ['hotspot', 'spawner', 'stock'];

function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

export function createSiteRigs({ stage, store, input, room, fx, manifest, catalog, pieces, later, site }) {
  const m = manifest.rooms.site;
  const SITE_ID = room.id;
  const grid = m.grid;
  const geo = craneGeom(m.rigs.towerCrane);
  const wr = m.rigs.wreckingBall;
  const tip = wr.tip;
  const gy = GROUND - wr.ballRadius;
  const rest = wr.ballCentre;
  let view = null;
  let chars = null;
  const stats = { frames: 0, grabs: 0, drops: 0, travels: 0, swings: 0, wrecks: 0, knocked: 0, tumbles: 0, booms: 0, wobbles: 0, giggles: 0 };
  const play = (name, o) => { if (view) view.play(name, o); };
  const viewOf = (id) => (view ? view.viewOf(id) : null);
  const piece = (pid) => pieces.get(pid) || null;

  // ---------------------------------------------------------------------------
  // The hook entity

  /** The hook entity (lowest id wins if two iPads made one each), or null. */
  function hookEnt(st = store.state) {
    let best = null;
    for (const id in st.entities) {
      const e = st.entities[id];
      if (e.kind !== HOOK_KIND || !getEntity(st, id) || e.room !== SITE_ID || e.parent) continue;
      if (!best || id < best.id) best = e;
    }
    return best;
  }
  const isHook = (e) => !!e && e.kind === HOOK_KIND;
  const loadOf = (st = store.state) => { const h = hookEnt(st); return h ? childrenOf(st, h.id).filter((c) => getEntity(st, c.id)) : []; };

  function ensureHook() {
    if (hookEnt()) return;
    store.dispatch('spawn', { id: store.newId(), kind: HOOK_KIND, room: SITE_ID, x: r1(geo.rest[0]), y: r1(geo.rest[1]), z: 0, props: {} });
  }

  const HOOK_SPRITE = { key: 'crane-hook-grab', draw: 'custom', w: 110, h: 96, sound: 'clink', paint: (body) => { body.textContent = ''; } };
  const isChar = (e) => !!e && e.kind === 'char';

  // ---------------------------------------------------------------------------
  // The crane: what is drawn (cr.x, cr.y: the grab point; th, w: the swing)

  const hk = m.pieces['crane-hook'];
  const tp = m.pieces['crane-trolley'];
  const cr = { x: geo.rest[0], y: geo.rest[1], th: 0, w: 0, vx: 0, tx: null, ty: null, arrive: null, mode: 'idle', raf: 0, last: 0, motor: null, motorAt: 0, shownKey: '' };

  function loadDrop() {
    let d = 0;
    const h = hookEnt();
    if (!h) return 0;
    const v = viewOf(h.id);
    if (!v) return 0;
    for (const k of v.kids) if (k.local && !k.detached) d = Math.max(d, k.local.y);
    return d;
  }

  /** Draw the crane at (cr.x, cr.y, cr.th). atRest: hand the hook element back to the view. */
  function drawCrane(atRest = false) {
    const t = pieceTransforms(geo, cr.x, cr.y, cr.th, hk);
    const tr = piece('crane-trolley'), cb = piece('crane-cable'), hp = piece('crane-hook');
    if (tr) tr.el.style.transform = `translate3d(${r1(tp.x + cr.x - geo.grab[0])}px, ${tp.y}px, 0px)`;
    if (cb) cb.body.style.transform = t.cable;
    if (hp) { hp.body.style.transformOrigin = t.hookOrigin; hp.body.style.transform = t.hook; }
    const h = hookEnt();
    const v = h && viewOf(h.id);
    if (!v || !v.sprite || v.held) return;
    if (atRest && Math.abs(h.x - cr.x) < 0.05 && Math.abs(h.y - cr.y) < 0.05) {
      v.el.style.transform = v.transform;
      v.el.style.transformOrigin = '';
      return;
    }
    const left = r1(cr.x - v.sprite.w / 2), top = r1(cr.y - v.sprite.h);
    const cx = geo.cableTop[0] + (cr.x - geo.grab[0]);
    v.el.style.transformOrigin = `${r1(cx - left)}px ${r1(geo.cableTop[1] - top)}px`;
    const deg = Math.round(-cr.th * 18000 / Math.PI) / 100;
    v.el.style.transform = `translate3d(${left}px, ${top}px, 0px) rotate(${deg}deg)`;
  }

  function motor(on) {
    const now = performance.now();
    if (on && now - cr.motorAt > MOTOR_EVERY) {
      cr.motorAt = now;
      play('motor', { gain: 0.5, vary: 0 });
    } else if (!on && cr.motorAt) {
      cr.motorAt = 0;
    }
  }

  function kick() { if (!cr.raf) { cr.last = 0; cr.px = cr.x; cr.py = cr.y; cr.raf = requestAnimationFrame(step); } }
  function step(now) {
    cr.raf = 0;
    stats.frames++;
    const dt = cr.last ? Math.min(0.05, Math.max(0.001, (now - cr.last) / 1000)) : 1 / 60;
    cr.last = now;
    const px = cr.px != null ? cr.px : cr.x, py = cr.py != null ? cr.py : cr.y;   // where it was drawn last frame
    if (cr.mode === 'idle' && cr.tx != null) {
      cr.x = approach(cr.x, cr.tx, TROLLEY_SPEED * dt);
      cr.y = approach(cr.y, cr.ty, HOOK_SPEED * dt);
      if (cr.x === cr.tx && cr.y === cr.ty) {
        cr.tx = cr.ty = null;
        if (py !== cr.y) cr.w += (cr.th >= 0 ? 0.08 : -0.08);    // a little jolt as it stops
        const f = cr.arrive;
        cr.arrive = null;
        if (f) f();
      }
    }
    // The trolley's speed, smoothed (finger moves arrive every frame or two), and its acceleration.
    const vx = cr.vx + ((cr.x - px) / dt - cr.vx) * 0.35;
    const ax = clamp((vx - cr.vx) / dt, -15000, 15000) * 0.4;   // gentle: a toy crane, not a real one
    cr.vx = vx;
    const s = swingStep(cr, dt, swingLength(geo, cr.y, loadDrop()), ax);
    cr.th = s.th; cr.w = s.w;
    const moving = cr.x !== px || cr.y !== py;
    motor(moving);
    cr.px = cr.x; cr.py = cr.y;
    const done = cr.mode === 'idle' && cr.tx == null && !moving && swingSettled(cr);
    if (done) { cr.th = 0; cr.w = 0; cr.vx = 0; cr.px = cr.py = null; drawCrane(true); motor(false); return; }
    drawCrane(false);
    if (cr.mode !== 'drag') cr.raf = requestAnimationFrame(step);
  }

  /** Send the hook to (x, y) (a store move now; the crane travels there), then arrive(). */
  function travelTo(x, y, arrive = null) {
    const h = hookEnt();
    if (!h) return;
    const c = clampHook(geo, x, y);
    cr.tx = c.x; cr.ty = c.y; cr.arrive = arrive;
    if (cr.y !== c.y) cr.w += 0.05;
    stats.travels++;
    if (h.x !== c.x || h.y !== c.y) store.dispatch('move', { id: h.id, room: SITE_ID, x: c.x, y: c.y, z: 0 });
    kick();
  }

  // What the hook can take hold of: top-level things drawn in the room.
  function things() {
    const out = [];
    if (!view) return out;
    const h = hookEnt();
    for (const id of view.ids()) {
      const v = viewOf(id);
      if (!v || v.parentView || v.held || !v.sprite) continue;
      const e = getEntity(store.state, id);
      if (!e || e.room !== SITE_ID || (h && id === h.id) || e.kind === site.FIXTURES_KIND) continue;
      if (!isChar(e)) {
        const k = catalog.get(e.kind);
        if (!k || k.fixed || NO_PICK.some((t) => k.tags.includes(t))) continue;
      }
      const hw = Math.max((v.sprite.w * v.scale) / 2, 24) + 16;   // forgiving: the hook catches a near miss
      out.push({ id, x0: v.x - hw, x1: v.x + hw, top: v.y - v.sprite.h * v.scale, bottom: v.y, rank: Number(v.zIndex) || 0 });
    }
    return out;
  }

  /** Where a hanging load comes down at x: {y (feet), spot (grid) | null}. */
  function landingFor(load, x, feetY) {
    if (site.isBuild(load) && overGrid(grid, x, feetY)) {
      const spot = snapDrop(grid, site.placed(), site.shapeOfKind(load.kind), x, load.id);
      if (spot) return { y: spot.y, spot };
    }
    const r = landingUnder(room.def.surfaces.filter((s) => s.id !== 'lever-box'), x, feetY, FLOOR_Y);
    return { y: r.y, spot: null, surface: r.surface };
  }

  function grab(id) {
    const h = hookEnt();
    const e = getEntity(store.state, id);
    if (!h || !e || e.parent) return false;
    if (!store.dispatch('attach', { id, parent: h.id, slot: HOOK_SLOT })) return false;
    stats.grabs++;
    if (isChar(e)) {
      const exprWas = e.props.expr || null;
      store.dispatch('set', { id, path: 'props.seat', value: null });
      store.dispatch('set', { id, path: 'props.pose', value: 'hold-up' });
      store.dispatch('set', { id, path: 'props.exprWas', value: exprWas === 'wheee' ? null : exprWas });
      store.dispatch('set', { id, path: 'props.riding', value: true });
      store.dispatch('set', { id, path: 'props.expr', value: 'wheee' });
      later(120, () => play('giggle', { pitch: 1.1 }));
      stats.giggles++;
    }
    play('clunk');
    fx.burst('sparkle', cr.x, cr.y + 10, { count: 5, spread: 60 });
    cr.w += 0.12;
    kick();
    return true;
  }

  /** Set the load down at x (its feet at land.y), the hook stays where it is. */
  function setDown(land) {
    const h = hookEnt();
    if (!h) return;
    const hv = viewOf(h.id);
    for (const e of loadOf()) {
      const kv = viewOf(e.id);
      const from = kv ? { x: kv.x, y: kv.y } : { x: cr.x, y: land.y };
      let at;
      if (land.spot && site.isBuild(e)) {
        at = site.gridSpot(grid, site.shapeOfKind(e.kind), land.spot.c, land.spot.r);
      } else {
        at = { x: r1(clamp(cr.x + (kv && kv.local ? kv.local.x : 0), 30, m.width - 30)), y: r1(land.y), z: 0 };
      }
      if (!store.dispatch('move', { id: e.id, room: SITE_ID, x: at.x, y: at.y, z: at.z || 0 })) continue;
      stats.drops++;
      if (land.spot && site.isBuild(e) && !e.props.built) store.dispatch('set', { id: e.id, path: 'props.built', value: true });
      if (isChar(e)) restoreFace(getEntity(store.state, e.id) || e);
      if (view) view.animateFrom(e.id, from.x, Math.min(from.y, at.y - 1));
      const row = land.spot ? land.spot.r : 0;
      later(160, () => {
        play(land.spot ? 'clack' : 'thud', { pitch: 0.85 + Math.min(1.1, row * 0.09) });
        fx.burst('puff', at.x, at.y - 6, { count: 5, spread: 60, scale: 0.5, stagger: 10 });
      });
    }
    void hv;
    play('clunk', { pitch: 1.15 });
    cr.w += 0.1;
    kick();
  }

  function restoreFace(e) {
    if (!e.props.riding) return;
    store.dispatch('set', { id: e.id, path: 'props.riding', value: false });
    store.dispatch('set', { id: e.id, path: 'props.expr', value: e.props.exprWas || 'happy' });
    if ((e.props.pose || 'stand') === 'hold-up') store.dispatch('set', { id: e.id, path: 'props.pose', value: 'stand' });
  }

  /** The lever was flipped: down lowers (take hold / set down), up raises. */
  function lever(stateNow) {
    const h = hookEnt();
    if (!h || cr.mode !== 'idle') return;
    const x = cr.tx != null ? cr.tx : cr.x;
    if (stateNow === 'up') { travelTo(x, geo.y0); return; }
    const load = loadOf();
    if (load.length) {
      const drop = loadDrop();
      const land = landingFor(load[0], x, cr.y + drop);
      const y = clamp(land.y - drop, geo.y0, geo.y1);
      travelTo(x, y, () => { if (y + drop >= land.y - 4) setDown(landingFor(load[0], x, y + drop)); else play('clunk', { pitch: 0.8 }); });
      return;
    }
    const c = contactBelow(things(), x, cr.y);
    const y = c ? clamp(c.top + 12, geo.y0, geo.y1) : geo.y1;
    travelTo(x, y, () => {
      if (c && y >= c.top) grab(c.id);
      else { play('clunk', { pitch: 0.8 }); fx.burst('puff', x, y + 6, { count: 3, spread: 40, scale: 0.4 }); }
    });
  }

  // The hook let go of by the finger at (cr.x, cr.y).
  function hookDropped(info) {
    const h = hookEnt();
    if (!h) return;
    cr.mode = 'idle';
    cr.w += clamp(-(info && info.vx ? info.vx : 0) * 0.35, -0.5, 0.5);
    const load = loadOf();
    if (load.length) {
      const drop = loadDrop();
      const land = landingFor(load[0], cr.x, cr.y + drop);
      if (cr.y + drop >= land.y - 18) {
        const y = clamp(land.y - drop, geo.y0, geo.y1);
        cr.y = y;
        travelTo(cr.x, y);
        setDown(landingFor(load[0], cr.x, y + drop));
        return;
      }
      travelTo(cr.x, cr.y);
      return;
    }
    const t = thingAt(things(), cr.x, cr.y);
    travelTo(cr.x, cr.y);
    if (t) grab(t.id);
  }

  // ---------------------------------------------------------------------------
  // The wrecking ball

  const wb = { mode: 'rest', P: { x: rest[0], y: rest[1] }, plan: null, path: null, t0: 0, raf: 0, seq: null, drawn: false, reel: null, clatterAt: 0 };

  function drawBall(P) {
    const dx = P.x - tip[0], dy = P.y - tip[1];
    const d = Math.hypot(dx, dy);
    const deg = Math.round((-Math.atan2(dx, dy) * 180 / Math.PI) * 100) / 100;
    const ch = piece('wreck-chain'), bl = piece('wreck-ball');
    const atRest = Math.abs(P.x - rest[0]) < 0.3 && Math.abs(P.y - rest[1]) < 0.3;
    if (atRest) {
      if (ch) { ch.body.style.transform = ''; if (ch.z0 != null) ch.el.style.zIndex = ch.z0; }
      if (bl) { bl.body.style.transform = ''; if (bl.z0 != null) bl.el.style.zIndex = bl.z0; }
      wb.drawn = false;
      return;
    }
    if (!wb.drawn) {
      // Out swinging: in front of the things on the ground (it comes down to the floor's front).
      for (const p of [ch, bl]) if (p) { if (p.z0 == null) p.z0 = p.el.style.zIndex; p.el.style.zIndex = String(zIndexFor(958)); }
    }
    if (ch) ch.body.style.transform = `rotate(${deg}deg) scale(1, ${Math.round((d / wr.chainLength) * 1000) / 1000})`;
    if (bl) bl.body.style.transform = `rotate(${deg}deg) translate3d(0px, ${r1(d - wr.chainLength)}px, 0px)`;
    wb.drawn = true;
  }

  function ballStep(now) {
    wb.raf = 0;
    stats.frames++;
    if (wb.mode === 'swing') {
      const t = now - wb.t0;
      if (t >= wb.path.end) {
        // Reel the chain back to its own length.
        wb.mode = 'reel';
        wb.reel = { t0: now, from: wb.path.L };
      } else {
        wb.P = ballAt(wb.path, tip, gy, t);
        drawBall(wb.P);
      }
    }
    if (wb.mode === 'reel') {
      const u = clamp((now - wb.reel.t0) / 450, 0, 1);
      const k = 1 - Math.pow(1 - u, 3);
      const L = wb.reel.from + (wr.chainLength - wb.reel.from) * k;
      wb.P = ballPos(tip, L, 0, gy);
      if (u >= 1) { wb.mode = 'rest'; wb.P = { x: rest[0], y: rest[1] }; drawBall(wb.P); return; }
      drawBall(wb.P);
    }
    if (wb.mode === 'swing' || wb.mode === 'reel') wb.raf = requestAnimationFrame(ballStep);
  }

  /** Swing locally along a path (a nudge, or a plan's swing). */
  function swingBall(path, t0 = performance.now()) {
    wb.mode = 'swing';
    wb.path = path;
    wb.t0 = t0;
    stats.swings++;
    if (!wb.raf) wb.raf = requestAnimationFrame(ballStep);
  }

  // Targets for the plan: grid pieces and characters in the room.
  function wreckTargets() {
    const pieces0 = [];
    for (const p of site.placed()) {
      const e = getEntity(store.state, p.id);
      const v = viewOf(p.id);
      if (!e || (v && v.held)) continue;
      pieces0.push({ id: p.id, c: p.c, r: p.r, shape: p.shape, x: e.x, y: e.y, locked: !!e.props.locked });
    }
    const cs = [];
    const f = room.def.floor;
    for (const e of inRoom(store.state, SITE_ID)) {
      if (!isChar(e)) continue;
      const v = viewOf(e.id);
      if (!v || v.held || !v.sprite) continue;
      const hw = (v.sprite.w * v.scale) / 2 * 0.7;
      cs.push({ id: e.id, x: e.x, y: e.y, box: [v.x - hw, v.y - v.sprite.h * v.scale, v.x + hw, v.y], floor: e.y >= f.top && !e.props.seat });
    }
    return { pieces: pieces0, chars: cs };
  }

  let quiet = false;
  function release(pull) {
    const f = site.fixtures();
    if (!f) return;
    const { pieces: ps, chars: cs } = wreckTargets();
    const seed = (Math.random() * 4294967296) >>> 0;
    const plan = planWreck(ps, cs, { tip, gy, radius: wr.ballRadius, grid, width: m.width, rng: createRng(seed), pull });
    const seq = store.device + ':' + Date.now().toString(36);
    stats.wrecks++;
    quiet = true;
    try {
      store.dispatch('set', { id: f.id, path: 'props.wreck', value: Object.assign({ seq }, plan) });
      for (const h of plan.hits) {
        if (h.kind === 'wobble') continue;
        const e = getEntity(store.state, h.id);
        if (!e) continue;
        if (h.kind === 'char') {
          if (e.props.seat) store.dispatch('set', { id: h.id, path: 'props.seat', value: null });
          if (e.props.pose && e.props.pose !== 'stand') store.dispatch('set', { id: h.id, path: 'props.pose', value: 'stand' });
        }
        const z = h.kind === 'settle' ? Math.min(99, Math.round(h.r * 2) + 1) : 0;
        store.dispatch('move', { id: h.id, room: SITE_ID, x: h.x, y: h.y, z });
        if (h.kind === 'knock') stats.knocked++;
      }
    } finally {
      quiet = false;
    }
    // When it is all over, whatever stood on something that went comes down (forgiving gravity).
    later(plan.end + 300, () => site.settleNow());
  }

  // A plan arrived (ours or the other iPad's): swing, and time each reaction.
  function playPlan(plan) {
    if (!plan || plan.seq === wb.seq) return;
    wb.seq = plan.seq;
    wb.plan = plan;
    const path = swingPath({ L: plan.L, a0: plan.a0 });
    swingBall(path);
    play('swoosh', { gain: 0.9 });
    const halves = path.halves.slice(1, 3);
    for (const hv of halves) later(Math.max(0, hv.t0 - 150), () => play('swoosh', { gain: 0.5, pitch: 0.9 }));
    const first = plan.hits.find((h) => h.kind === 'knock' || h.kind === 'char');
    if (first) later(first.t, () => boom(first));
    for (const h of plan.hits) {
      if (h.kind !== 'wobble') continue;
      later(h.t, () => {
        const v = viewOf(h.id);
        stats.wobbles++;
        play('clunk', { pitch: 1.4, gain: 0.7 });
        if (v && !v.held) tween.wobble(v.body, { amount: 0.8, duration: 700 });
      });
    }
  }

  function boom(h) {
    stats.booms++;
    play('boom');
    const b = ballAt(wb.path || swingPath(wb.plan), tip, gy, h.t);
    fx.burst('puff', b.x, b.y + 10, { count: 8, spread: 130, scale: 0.9, stagger: 12 });
    if (!reducedMotion()) {
      const base = stage.el.style.transform || '';
      tween.animate(stage.el, [
        { transform: `${base} translate(0px, 0px)` },
        { transform: `${base} translate(-7px, 3px)`, offset: 0.15 },
        { transform: `${base} translate(6px, -3px)`, offset: 0.35 },
        { transform: `${base} translate(-4px, 2px)`, offset: 0.55 },
        { transform: `${base} translate(2px, -1px)`, offset: 0.78 },
        { transform: `${base} translate(0px, 0px)` },
      ], { duration: 380, easing: 'ease-out' });
    }
  }

  // The transform the view would give v at feet (x, y) and scale s.
  const tfAt = (v, x, y, s) => `translate3d(${r1(x - v.sprite.w / 2)}px, ${r1(y - v.sprite.h)}px, 0) scale(${s})`;

  /** A moved thing's flight: held at its old spot until the ball gets there, then off it goes. */
  function tumble(h) {
    const v = viewOf(h.id);
    if (!v || v.held || !v.sprite || v.parentView) return;
    const elapsed = performance.now() - wb.t0;
    const delay = Math.max(0, h.t - elapsed);
    if (v.posAnim) { v.posAnim.cancel(); v.posAnim = null; }
    const calm = reducedMotion();
    const s1 = v.scale;
    const s0 = h.kind === 'char' ? s1 : 1;
    const from = tfAt(v, h.fx, h.fy, s0);
    const to = v.transform;
    stats.tumbles++;
    let anim;
    if (h.kind === 'settle') {
      anim = tween.animate(v.el, [
        { transform: from, easing: tween.GRAVITY_EASE },
        { transform: to, offset: 0.8 },
        { transform: tfAt(v, h.x, h.y - 6, s1), offset: 0.9 },
        { transform: to },
      ], { duration: 420, delay, fill: 'backwards' });
      later(delay + 340, () => { play('clack', { pitch: 0.9 }); fx.burst('puff', h.x, h.y - 4, { count: 3, spread: 50, scale: 0.4 }); });
    } else {
      const hop = calm ? Math.min(40, h.hop) : h.hop;
      const mid = tfAt(v, (h.fx + h.x) / 2, Math.min(h.fy, h.y) - hop, (s0 + s1) / 2);
      anim = tween.animate(v.el, [
        { transform: from, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
        { transform: mid, offset: 0.4, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
        { transform: to, offset: LAND_AT, easing: 'ease-out' },
        { transform: tfAt(v, h.x, h.y - Math.max(6, hop * 0.12), s1), offset: 0.89, easing: 'ease-in' },
        { transform: to },
      ], { duration: TUMBLE_MS, delay, fill: 'backwards' });
      if (!calm && h.spin) {
        const hh = r1(v.sprite.h / 2);
        const rot = (a) => `translate3d(0px, ${-hh}px, 0px) rotate(${a}deg) translate3d(0px, ${hh}px, 0px)`;
        tween.animate(v.body, [
          { transform: rot(0) },
          { transform: rot(h.spin), offset: LAND_AT },
          { transform: rot(h.spin) },
        ], { duration: TUMBLE_MS, delay, fill: 'backwards', easing: 'ease-out' });
      }
      const landAt = delay + Math.round(TUMBLE_MS * LAND_AT);
      if (h.kind === 'char') {
        later(delay, () => { if (chars) chars.face(h.id, [['wheee', 700], ['laughing', 1100]]); play('giggle', { pitch: 1.15 }); stats.giggles++; });
        later(landAt, () => { tween.squash(v.body, { amount: 0.9 }); fx.burst('puff', h.x, h.y - 4, { count: 4, spread: 60, scale: 0.5 }); play('thud', { gain: 0.7 }); });
      } else {
        later(landAt, () => {
          tween.squash(v.body, { amount: 1 });
          fx.burst('puff', h.x, h.y - 6, { count: 3, spread: 50, scale: 0.55 });
          const now = performance.now();
          if (now - wb.clatterAt > 110) { wb.clatterAt = now; play('clatter', { pitch: 0.9 + Math.random() * 0.25 }); }
        });
      }
    }
    v.posAnim = anim;
  }

  function ballDragStart(info) {
    if (wb.mode !== 'rest') return false;
    info.data.P0 = { x: rest[0], y: rest[1] };
    wb.mode = 'drag';
    play('clink', { pitch: 0.8 });
    return true;
  }
  function ballDragMove(info) {
    if (wb.mode !== 'drag') return;
    const p = pullOf(tip, info.data.P0.x + info.dx, info.data.P0.y + info.dy, { gy });
    wb.P = ballPos(tip, p.L, p.a0, gy);
    wb.pull = p;
    drawBall(wb.P);
  }
  function ballDragEnd(info) {
    if (wb.mode !== 'drag') return;
    const p = wb.pull || { L: wr.chainLength, a0: 0 };
    wb.pull = null;
    wb.mode = 'rest';
    if (info.cancelled || Math.abs(p.a0) < MIN_PULL) {
      // A nudge: a little local swing, nothing to plan.
      swingBall(swingPath({ L: p.L, a0: p.a0 || 0.08 }));
      return;
    }
    release(p);
  }
  function ballTap() {
    if (wb.mode !== 'rest') return;
    play('clink', { pitch: 0.7 });
    swingBall(swingPath({ L: wr.chainLength, a0: 0.14 }));
  }

  // ---------------------------------------------------------------------------
  // Touch on the pieces

  function trolleyStart(info) {
    if (!hookEnt()) return false;
    const h = hookEnt();
    const hv = viewOf(h.id);
    if (hv && hv.held) return false;
    cr.mode = 'trolley';
    cr.tx = cr.ty = null; cr.arrive = null;
    info.data.x0 = cr.x;
    play('clink', { pitch: 1.2 });
    kick();
    return true;
  }
  function trolleyMove(info) {
    if (cr.mode !== 'trolley') return;
    cr.x = clampHook(geo, info.data.x0 + info.dx, cr.y).x;
    kick();
  }
  function trolleyEnd() {
    if (cr.mode !== 'trolley') return;
    cr.mode = 'idle';
    travelTo(cr.x, cr.y);
  }

  function registerPieces() {
    const reg = (pid, h) => { const p = piece(pid); if (p) input.register(p.el, h); };
    const tpc = piece('crane-trolley');
    if (tpc && !tpc.el.querySelector('.rig-hit')) {
      // A bigger, invisible touch pad around the little trolley (5-year-old fingers).
      const pad = document.createElement('div');
      pad.className = 'rig-hit';
      pad.style.cssText = `position:absolute;left:${r1(tp.w / 2 - 60)}px;top:${r1(tp.h / 2 - 52)}px;width:120px;height:104px`;
      tpc.el.appendChild(pad);
    }
    reg('crane-trolley', {
      onTap: () => { play('clink', { pitch: 1.3 }); cr.w += 0.12; kick(); },
      onDragStart: trolleyStart, onDragMove: trolleyMove, onDragEnd: trolleyEnd, minHit: 110,
    });
    reg('wreck-ball', { onTap: ballTap, onDragStart: ballDragStart, onDragMove: ballDragMove, onDragEnd: ballDragEnd, minHit: 110 });
    // The cable and the hook art are only drawn: the hook entity takes the touches; the chain is part of the ball.
    for (const pid of ['crane-cable', 'crane-hook', 'wreck-chain']) { const p = piece(pid); if (p) p.el.style.pointerEvents = 'none'; }
  }

  // ---------------------------------------------------------------------------
  // View hooks

  function hooks(base) {
    return Object.assign({}, base, {
      spriteOf: (e) => (isHook(e) ? HOOK_SPRITE : base.spriteOf ? base.spriteOf(e) : null),
      sortKeyOf: (e) => (isHook(e) ? HOOK_SORT : base.sortKeyOf ? base.sortKeyOf(e) : null),
      scaleOf: (e) => (isHook(e) ? 1 : base.scaleOf ? base.scaleOf(e) : null),
      canDrag: (e) => (isHook(e) ? cr.mode !== 'trolley' : base.canDrag ? base.canDrag(e) : true),
      layoutOf(parent, kids) {
        if (!isHook(parent)) return base.layoutOf ? base.layoutOf(parent, kids) : null;
        return hookLayout(kids.map((k) => {
          const s = (this.spriteOf && this.spriteOf(k)) || { h: 60 };
          return { id: k.id, h: s.h, char: isChar(k) };
        }));
      },
      overUi: (e, info) => (isHook(e) ? true : base.overUi ? base.overUi(e, info) : false),
      dropOnUi: (e, ctx) => (isHook(e) ? false : base.dropOnUi ? base.dropOnUi(e, ctx) : false),
      dropTarget: (item, other) => (isHook(item) || isHook(other) ? false : base.dropTarget ? base.dropTarget(item, other) : false),
      onTap(e, ctx) {
        if (!isHook(e)) return base.onTap ? base.onTap(e, ctx) : false;
        play('clink');
        cr.w += 0.18;
        kick();
        return true;
      },
      onRender(e, ctx) {
        if (!isHook(e)) { if (base.onRender) base.onRender(e, ctx); return; }
        const v = viewOf(e.id);
        if (v && v.posAnim) { v.posAnim.cancel(); v.posAnim = null; }
        if (!v || v.held || cr.mode !== 'idle') return;
        // The store says the hook is somewhere else (the other iPad, a reload): travel there.
        if (Math.abs(e.x - cr.x) > 0.05 || Math.abs(e.y - cr.y) > 0.05) {
          if (cr.tx !== e.x || cr.ty !== e.y) { cr.tx = e.x; cr.ty = e.y; cr.arrive = null; }
          drawCrane(false);
          kick();
        } else if (cr.raf) drawCrane(false);
      },
      onDragStart(e, ctx) {
        if (!isHook(e)) { if (base.onDragStart) base.onDragStart(e, ctx); return; }
        if (cr.raf) { cancelAnimationFrame(cr.raf); cr.raf = 0; }
        cr.mode = 'drag';
        cr.tx = cr.ty = null; cr.arrive = null;
        cr.th = 0; cr.w = 0;
        const v = viewOf(e.id);
        if (v) {
          v.el.style.transformOrigin = '';
          // Carry on from where the hook is drawn (it may be on its way somewhere).
          if (ctx.info && ctx.info.data) { ctx.info.data.x0 = cr.x; ctx.info.data.y0 = cr.y; }
          v.x = cr.x; v.y = cr.y;
        }
        drawCrane(false);
      },
      onDragMove(e, ctx) {
        if (!isHook(e)) { if (base.onDragMove) base.onDragMove(e, ctx); return; }
        const v = viewOf(e.id);
        if (!v) return;
        const c = clampHook(geo, v.x, v.y);
        if (c.x !== v.x || c.y !== v.y) {
          v.x = c.x; v.y = c.y;
          const t = tfAt(v, c.x, c.y, v.scale);
          v.transform = t;
          v.el.style.transform = t;
        }
        const moved = c.x !== cr.x || c.y !== cr.y;
        cr.x = c.x; cr.y = c.y;
        motor(moved);
        drawCrane(false);
      },
      onDrop(e, ctx) {
        if (!isHook(e)) return base.onDrop ? base.onDrop(e, ctx) : false;
        hookDropped(ctx.info);
        return true;
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Store

  const unsubscribe = store.subscribe((st, env) => {
    if (!env) return;
    const a = env.args;
    if (env.op === 'set' && a.path === 'props.wreck') {
      const f = site.fixtures();
      if (f && a.id === f.id && a.value && typeof a.value === 'object') playPlan(a.value);
      return;
    }
    if ((env.op === 'move' || env.op === 'detach') && wb.plan && wb.mode !== 'rest') {
      const h = wb.plan.hits.find((q) => q.id === a.id && q.kind !== 'wobble');
      if (h && Math.abs(h.x - a.x) < 0.05 && Math.abs(h.y - a.y) < 0.05) tumble(h);
    }
    // A rider taken off the hook some other way (dragged off, pocketed): its own face again.
    if (env.device === store.device && (env.op === 'move' || env.op === 'detach' || env.op === 'travel')) {
      for (const id of a.ids || [a.id]) {
        const e = getEntity(st, id);
        if (e && isChar(e) && e.props.riding) later(0, () => { const cur = getEntity(store.state, id); const h = hookEnt(); if (cur && (!h || cur.parent !== h.id)) restoreFace(cur); });
      }
    }
  });

  return {
    RIG_PIECES,
    hooks,
    lever,
    quiet: () => quiet,
    /** After the view exists: take over the rig pieces' touches, place the crane where the store says. */
    bind(v, c) {
      view = v;
      chars = c;
      ensureHook();
      registerPieces();
      const h = hookEnt();
      if (h) { cr.x = h.x; cr.y = h.y; }
      drawCrane(true);
      view.refresh();
    },
    stats: () => Object.assign({}, stats, { craneMoving: !!cr.raf, ballMoving: !!wb.raf }),
    crane: {
      hook: () => { const h = hookEnt(); return h ? { id: h.id, x: h.x, y: h.y, load: loadOf().map((e) => e.id) } : null; },
      shown: () => ({ x: cr.x, y: cr.y, th: cr.th, mode: cr.mode, moving: !!cr.raf }),
      geo,
      lever,
      grab,
      things,
    },
    wreck: {
      ball: () => ({ x: wb.P.x, y: wb.P.y, mode: wb.mode, moving: !!wb.raf }),
      plan: () => wb.plan,
      tip, gy, rest,
    },
    destroy() {
      unsubscribe();
      if (cr.raf) cancelAnimationFrame(cr.raf);
      if (wb.raf) cancelAnimationFrame(wb.raf);
      cr.raf = wb.raf = 0;
    },
  };
}
