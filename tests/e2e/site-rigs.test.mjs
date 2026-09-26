// End-to-end: the construction site's tower crane and wrecking ball (P2c.2)
// with real (trusted) touches. Drag the trolley over a block, flip the lever:
// the hook comes down and takes hold (clunk); lever up, drag the trolley: the
// block swings; lever down over the deck: it is set down and snaps onto the
// grid. Drag the hook itself onto a block and down onto the deck. A kid rides
// the hook (hands up, grinning) and gets off; a kid sits in the crane cab.
// Pull the wrecking ball back and let go: a 4-block tower comes down (the
// hammered block wobbles and stays), the pieces tumble onto the floor, a
// character does a silly spin, BOOM. Reload: the crane, its load and the
// scattered pieces are where they were. Afterwards nothing runs.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const SITE = 'construction/yard';

async function record(page) {
  await page.eval(async () => {
    if (window.__rec) return;
    const rec = window.__rec = { sounds: [] };
    const { sfx } = await import('./src/audio/index.js');
    const play = sfx.play;
    sfx.play = (name, opts) => { rec.sounds.push(name); return play(name, opts); };
  });
}
const clearRec = (page) => page.eval(() => { window.__rec.sounds.length = 0; });
const sounds = (page) => page.eval(() => window.__rec.sounds.slice());
const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0;
const craneIdle = () => { const s = window.__town.scene.stats().rigs; return !s.craneMoving && !s.ballMoving; };
const waitWith = (page, fn, arg, timeout = 15000) => page.waitFor(`(${fn})(${JSON.stringify(arg)})`, { timeout });

const entPoint = (page, id) => page.eval((id) => {
  const v = window.__town.scene.view.viewOf(id);
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === v.el) return { x, y };
  }
  return null;
}, id);
const piecePoint = (page, pid) => page.eval((pid) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, pid);
const ent = (page, id) => page.eval((id) => { const e = window.__store.state.entities[id]; return e ? { id, kind: e.kind, x: e.x, y: e.y, room: e.room, parent: e.parent || null, props: e.props } : null; }, id);
const hook = (page) => page.eval(() => window.__town.scene.crane.hook());
const placedAt = (page, id) => page.eval((id) => window.__town.scene.build.placed().find((p) => p.id === id) || null, id);
/** World distance -> screen px (x). */
const unitsToPx = (page, d) => page.eval((d) => { const a = window.__stage.worldToScreen(0, 0), b = window.__stage.worldToScreen(d, 0); return b.x - a.x; }, d);

/** Drag entity `id` by its body so its feet end at world (wx, wy). */
async function dragFeetTo(page, id, wx, wy) {
  const from = await entPoint(page, id);
  assert.ok(from, `a touch point on ${id}`);
  const to = await page.eval(([id, fx, fy, wx, wy]) => {
    const v = window.__town.scene.view.viewOf(id);
    const g = window.__stage.screenToWorld(fx, fy);
    return window.__stage.worldToScreen(g.x + wx - v.x, g.y + wy - v.y);
  }, [id, from.x, from.y, wx, wy]);
  await page.drag(from, to, { steps: 16, durationMs: 400 });
  await page.frames(2);
}

/** Drag the trolley so the hook ends at world x. */
async function trolleyTo(page, x, durationMs = 450) {
  const from = await piecePoint(page, 'crane-trolley');
  assert.ok(from, 'a touch point on the trolley');
  const dx = await unitsToPx(page, x - (await hook(page)).x);
  await page.drag(from, { x: from.x + dx, y: from.y }, { steps: 18, durationMs });
  await page.frames(2);
}
async function flipLever(page, want) {
  const lv = await piecePoint(page, 'crane-lever');
  if (await page.eval(() => window.__town.scene.pieces.state('crane-lever')) === want) {
    // Already there: the lever toggles, so go through the other state (the hook moves then comes back).
    await page.tap(lv.x, lv.y);
    await waitWith(page, (w) => window.__town.scene.pieces.state('crane-lever') !== w, want);
    await page.waitFor(craneIdle, { timeout: 20000 });
  }
  await page.tap(lv.x, lv.y);
  await waitWith(page, (w) => window.__town.scene.pieces.state('crane-lever') === w, want);
  await page.waitFor(craneIdle, { timeout: 20000 });
}
/** Sample the swing angle every frame from now on (page side). */
const sampleSwing = (page) => page.eval(() => {
  window.__sw = { max: 0, n: 0 };
  const f = () => { const s = window.__town.scene.crane.shown(); window.__sw.max = Math.max(window.__sw.max, Math.abs(s.th)); window.__sw.n++; if (window.__sw.n < 400) requestAnimationFrame(f); };
  requestAnimationFrame(f);
});

describe('construction site crane and wrecking ball (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
  });
  after(async () => { if (page) await page.close(); });

  it('in from the map: the crane hook is an entity at rest under the trolley', async () => {
    const at = await page.eval(() => {
      const p = window.__town.manifest.map.pieces.construction;
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('construction', 0.62);
    });
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.at === 'construction/yard' && !window.__town.busy);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    const h = await hook(page);
    assert.ok(h && h.load.length === 0);
    const geo = await page.eval(() => window.__town.scene.crane.geo);
    assert.deepEqual([h.x, h.y], geo.rest.map((v) => Math.round(v * 10) / 10));
    S.hook = h.id;
    // The green starter block at column 13 is what we pick up.
    S.green = await page.eval(() => window.__town.scene.build.placed().find((p) => p.c === 13 && p.r === 0).id);
  });

  it('trolley over a block, lever down: the hook comes down and takes hold with a clunk', async () => {
    const block = await ent(page, S.green);
    await trolleyTo(page, block.x);
    await page.waitFor(craneIdle, { timeout: 20000 });
    const h = await hook(page);
    assert.ok(Math.abs(h.x - block.x) < 12, `the hook is over the block (${h.x} vs ${block.x})`);
    await clearRec(page);
    await flipLever(page, 'down');
    const h2 = await hook(page);
    assert.deepEqual(h2.load, [S.green], 'the block hangs on the hook');
    assert.ok(h2.y > 800, 'the hook came down to it');
    assert.equal((await ent(page, S.green)).parent, S.hook, 'an attach op');
    assert.equal(await placedAt(page, S.green), null, 'off the grid');
    assert.equal(await page.eval((id) => window.__town.scene.view.parentOf(id), S.green), S.hook, 'drawn on the hook');
    const snd = await sounds(page);
    assert.ok(snd.includes('clunk') && snd.includes('motor'), snd.join(','));
    await page.screenshot('rigs-hook-grabbed');
  });

  it('lever up, drag the trolley: the block swings on the cable, then settles', async () => {
    await flipLever(page, 'up');
    const h = await hook(page);
    assert.ok(h.y < 300, 'up at the top');
    await sampleSwing(page);
    await trolleyTo(page, 470, 300);
    await page.frames(8);
    await page.screenshot('rigs-hook-swinging');
    await page.waitFor(craneIdle, { timeout: 20000 });
    const sw = await page.eval(() => window.__sw.max);
    assert.ok(sw > 0.05 && sw <= 0.36, `it swung (max ${sw} rad) and stopped`);
    assert.equal((await page.eval(() => window.__town.scene.crane.shown())).th, 0);
    assert.ok(Math.abs((await hook(page)).x - 470) < 12);
  });

  it('lever down over the deck: set down, snapped onto the grid', async () => {
    await flipLever(page, 'down');
    const e = await ent(page, S.green);
    assert.equal(e.parent, null);
    const p = await placedAt(page, S.green);
    assert.ok(p, 'on the grid');
    const g = await page.eval(() => window.__town.scene.grid);
    assert.equal(e.x, g.x0 + (p.c + 0.5) * g.cell, 'exactly on a grid anchor');
    assert.equal(e.y, g.y - p.r * g.cell);
    assert.ok(Math.abs(e.x - 470) <= 20, 'in the column under the hook');
    assert.deepEqual((await hook(page)).load, []);
    await page.waitFor(calm);
    await page.screenshot('rigs-set-down');
    await flipLever(page, 'up');
  });

  it('drag the hook itself onto a block, then down onto the deck', async () => {
    const blue = await page.eval(() => window.__town.scene.build.placed().find((p) => p.c === 11 && p.r === 1).id);
    const b = await ent(page, blue);
    const from = await entPoint(page, S.hook);
    assert.ok(from, 'a touch point on the hook');
    const to = await page.eval(([fx, fy, x, y, hx, hy]) => { const g = window.__stage.screenToWorld(fx, fy); return window.__stage.worldToScreen(g.x + x - hx, g.y + y - hy); },
      [from.x, from.y, b.x, b.y - 30, (await hook(page)).x, (await hook(page)).y]);
    await page.drag(from, to, { steps: 18, durationMs: 450 });
    await page.waitFor(craneIdle, { timeout: 20000 });
    assert.deepEqual((await hook(page)).load, [blue], 'dropped on it: it takes hold');
    // Down onto an empty stretch of the deck (column 8).
    const g = await page.eval(() => window.__town.scene.grid);
    const hx = g.x0 + 8.5 * g.cell;
    const from2 = await entPoint(page, S.hook);
    const h = await hook(page);
    const to2 = await page.eval(([fx, fy, dx, dy]) => { const w = window.__stage.screenToWorld(fx, fy); return window.__stage.worldToScreen(w.x + dx, w.y + dy); }, [from2.x, from2.y, hx - h.x, 880 - h.y]);
    await page.drag(from2, to2, { steps: 18, durationMs: 450 });
    await page.waitFor(craneIdle, { timeout: 20000 });
    const p = await placedAt(page, blue);
    assert.ok(p && p.r === 0 && Math.abs(p.c - 8) <= 1, JSON.stringify(p));
    assert.deepEqual((await hook(page)).load, []);
  });

  it('a kid rides the hook (hands up, grinning), then gets off with their own face', async () => {
    S.kid = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.props.cast === 'boy5').id);
    const expr0 = (await ent(page, S.kid)).props.expr || null;
    await flipLever(page, 'up');
    const h = await hook(page);
    await dragFeetTo(page, S.kid, h.x, 925);
    await page.waitFor(calm);
    await clearRec(page);
    await flipLever(page, 'down');
    assert.deepEqual((await hook(page)).load, [S.kid]);
    const k = await ent(page, S.kid);
    assert.equal(k.props.pose, 'hold-up');
    assert.equal(k.props.expr, 'wheee');
    assert.equal(await page.eval((id) => window.__town.scene.chars.inspect(id).shown, S.kid), 'wheee');
    await flipLever(page, 'up');
    await sampleSwing(page);
    await trolleyTo(page, 700, 280);
    await page.frames(10);
    await page.screenshot('rigs-kid-rides');
    await page.waitFor(craneIdle, { timeout: 20000 });
    assert.ok((await page.eval(() => window.__sw.max)) > 0.05, 'the rider swings');
    assert.ok((await sounds(page)).includes('giggle'));
    await flipLever(page, 'down');
    const k2 = await ent(page, S.kid);
    assert.equal(k2.parent, null);
    assert.equal(k2.room, SITE);
    assert.equal(k2.props.pose, 'stand');
    assert.equal(k2.props.expr || null, expr0 || 'happy', 'their own face back');
    await flipLever(page, 'up');
  });

  it('a kid sits in the crane cab', async () => {
    const seat = await page.eval(() => window.__town.manifest.rooms.site.seats.find((s) => s.id === 'crane-cab').at);
    await dragFeetTo(page, S.kid, seat[0], seat[1]);
    await waitWith(page, (id) => window.__store.state.entities[id].props.seat === 'crane-cab', S.kid);
    assert.equal((await ent(page, S.kid)).props.pose, 'sit');
    await page.waitFor(calm);
    // Inside the cab: fully on screen at the build-yard camera, the face in the cab window.
    const box = await page.eval((id) => {
      const r = window.__town.scene.view.viewOf(id).el.getBoundingClientRect();
      const head = window.__town.scene.chars.inspect(id).anchors.head;
      const cab = window.__town.scene.pieces.el('crane-cab').getBoundingClientRect();
      const h = window.__stage.worldToScreen(head.x, head.y);
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vh: innerHeight, vw: innerWidth, head: h, cab: { top: cab.top, bottom: cab.bottom, left: cab.left, right: cab.right }, cam: window.__stage.camera.x };
    }, S.kid);
    assert.equal(box.cam, 0, 'the build-yard camera');
    assert.ok(box.top >= 0 && box.bottom <= box.vh && box.left >= 0 && box.right <= box.vw, `fully on screen ${JSON.stringify(box)}`);
    assert.ok(box.head.y > box.cab.top + 20 && box.head.y < box.cab.bottom && box.head.x > box.cab.left && box.head.x < box.cab.right, 'the face is in the cab');
    await page.screenshot('rigs-kid-in-cab');
  });

  it('the wrecking ball knocks down a 4-block tower: tumbling, BOOM, the hammered block stays, a silly spin', async () => {
    // Setup through the store: a 4-block tower at column 15, its bottom block hammered; Rosa in the way.
    S.tower = await page.eval(() => {
      const st = window.__store; const g = window.__town.scene.grid; const ids = [];
      for (let r = 0; r < 4; r++) {
        const id = st.newId();
        st.dispatch('spawn', { id, kind: 'block-1x1', room: 'construction/yard', x: g.x0 + 15.5 * g.cell, y: g.y - r * g.cell, z: r * 2 + 1, props: { paint: ['red', 'yellow', 'blue', 'green'][r], built: true } });
        ids.push(id);
      }
      st.dispatch('set', { id: ids[0], path: 'props.locked', value: true });
      const rosa = Object.values(st.state.entities).find((e) => e.props.cast === 'builder');
      st.dispatch('move', { id: rosa.id, room: 'construction/yard', x: 960, y: 930 });
      window.__stage.camera.panTo(700);
      return { ids, rosa: rosa.id };
    });
    await page.waitFor(calm);
    await page.waitFor(imagesReady);
    await page.screenshot('rigs-wreck-before');
    const placed0 = await page.eval((ids) => ids.map((id) => window.__town.scene.build.placed().find((p) => p.id === id)).map((p) => p && p.r), S.tower.ids);
    assert.deepEqual(placed0, [0, 1, 2, 3]);
    // Pull the ball back to the right (a real drag) and let go.
    await clearRec(page);
    const from = await piecePoint(page, 'wreck-ball');
    assert.ok(from, 'a touch point on the ball');
    const to = await page.eval(([fx, fy]) => { const w = window.__stage.screenToWorld(fx, fy); const c = window.__town.scene.wreck.rest; return window.__stage.worldToScreen(w.x + 1853 - c[0], w.y + 733 - c[1]); }, [from.x, from.y]);
    await page.drag(from, to, { steps: 20, durationMs: 500 });
    // Catch the first knock mid-tumble for a screenshot.
    await page.waitFor(() => window.__town.scene.stats().rigs.booms >= 1, { timeout: 10000 });
    await page.frames(12);
    await page.screenshot('rigs-wreck-boom');
    await page.waitFor(craneIdle, { timeout: 30000 });
    await page.waitFor(calm, { timeout: 20000 });
    await page.screenshot('rigs-wreck-after');
    const plan = await page.eval(() => window.__town.scene.wreck.plan());
    const [locked, ...rest] = S.tower.ids;
    const lp = await placedAt(page, locked);
    assert.ok(lp && lp.c === 15 && lp.r === 0, 'the hammered block is still on the grid');
    assert.ok(plan.hits.some((h) => h.id === locked && h.kind === 'wobble'), 'it wobbled');
    for (const id of rest) {
      const e = await ent(page, id);
      assert.equal(await placedAt(page, id), null, `${id} is off the grid`);
      assert.equal(e.room, SITE, 'nothing disappears');
      assert.ok(e.y >= 900 && e.y <= 948 && e.x < 850, `${id} lies on the floor (${e.x}, ${e.y})`);
      const h = plan.hits.find((q) => q.id === id && q.kind === 'knock');
      assert.deepEqual([e.x, e.y], [h.x, h.y], 'where the pre-rolled plan said (carried in the ops)');
    }
    const rosaHit = plan.hits.find((h) => h.id === S.tower.rosa && h.kind === 'char');
    assert.ok(rosaHit, 'Rosa was in the way');
    const rosa = await ent(page, S.tower.rosa);
    assert.deepEqual([rosa.x, rosa.y], [rosaHit.x, rosaHit.y]);
    assert.equal(Math.abs(rosaHit.spin), 360, 'a silly spin');
    const fixtures = await page.eval(() => window.__town.scene.fixtures().props.wreck.seq);
    assert.equal(fixtures, plan.seq, 'the plan is in the store (props.wreck)');
    const snd = await sounds(page);
    for (const s of ['swoosh', 'boom', 'clatter', 'giggle']) assert.ok(snd.includes(s), `${s} in ${snd.join(',')}`);
    const st = await page.eval(() => window.__town.scene.stats().rigs);
    assert.ok(st.tumbles >= 4 && st.booms === 1, JSON.stringify(st));
    S.scatter = Object.fromEntries(await Promise.all(rest.map(async (id) => { const e = await ent(page, id); return [id, [e.x, e.y]]; })));
  });

  it('drive the wrecking crane to the far left of the deck and knock down a tower there', async () => {
    // A 4-block tower at column 0 (the far end of the deck), set up through the store.
    S.far = await page.eval(() => {
      const st = window.__store; const g = window.__town.scene.grid; const ids = [];
      for (let r = 0; r < 4; r++) {
        const id = st.newId();
        st.dispatch('spawn', { id, kind: 'block-1x1', room: 'construction/yard', x: g.x0 + 0.5 * g.cell, y: g.y - r * g.cell, z: r * 2 + 1, props: { paint: 'blue', built: true } });
        ids.push(id);
      }
      return ids;
    });
    await page.eval(() => window.__stage.camera.panTo(700));
    await page.waitFor(calm);
    const drive = await page.eval(() => window.__town.scene.wreck.drive);
    // Drive: drag the crawler to the left (two real drags, the camera panned between them).
    await clearRec(page);
    const leg = async (units) => {
      const from = await piecePoint(page, 'wreck-body');
      assert.ok(from, 'a touch point on the crawler');
      const dx = await unitsToPx(page, units);
      await page.drag(from, { x: from.x + dx, y: from.y }, { steps: 24, durationMs: 700 });
      await page.frames(2);
    };
    await leg(-560);
    const mid = await page.eval(() => window.__town.scene.wreck.dx());
    assert.ok(mid < -500 && mid > -620, `drove left (${mid})`);
    assert.ok((await sounds(page)).includes('rumble'), 'the treads rumble');
    await page.eval(() => window.__stage.camera.panTo(0));
    await page.waitFor(calm);
    await leg(-600);
    const dx = await page.eval(() => window.__town.scene.wreck.dx());
    assert.equal(dx, drive.x0, 'clamped at the far end of the yard');
    assert.equal(await page.eval(() => window.__town.scene.fixtures().props.wreckX), dx, 'where it stands is store state');
    await page.waitFor(calm);
    await page.screenshot('rigs-wreck-driven');
    // Pull the ball back to the right and let go.
    await clearRec(page);
    const from = await piecePoint(page, 'wreck-ball');
    assert.ok(from, 'a touch point on the ball');
    const to = await page.eval(([fx, fy]) => { const w = window.__stage.screenToWorld(fx, fy); const c = window.__town.scene.wreck.rest; return window.__stage.worldToScreen(w.x + 551, w.y + 124); }, [from.x, from.y]);
    await page.drag(from, to, { steps: 20, durationMs: 500 });
    await page.waitFor(() => window.__town.scene.stats().rigs.booms >= 2, { timeout: 10000 });
    await page.frames(10);
    await page.screenshot('rigs-wreck-far-boom');
    await page.waitFor(craneIdle, { timeout: 30000 });
    await page.waitFor(calm, { timeout: 20000 });
    const plan = await page.eval(() => window.__town.scene.wreck.plan());
    assert.deepEqual(plan.tip, await page.eval(() => window.__town.scene.wreck.tip), 'the plan swings from where the crane stands');
    for (const id of S.far) {
      assert.equal(await placedAt(page, id), null, `${id} knocked off the grid`);
      const e = await ent(page, id);
      const h = plan.hits.find((q) => q.id === id && q.kind === 'knock');
      assert.ok(h, `${id} is in the plan`);
      assert.deepEqual([e.x, e.y], [h.x, h.y]);
      assert.ok(e.y >= 900 && e.y <= 948);
    }
    await page.screenshot('rigs-wreck-far-after');
  });

  it('reload: the crane (and what hangs on it) and the scattered pieces are all still there', async () => {
    // Leave a block hanging: pick up one of the scattered ones with the hook.
    const e = await ent(page, S.tower.ids[1]);
    await page.eval(() => window.__stage.camera.panTo(0));
    await page.waitFor(calm);
    await trolleyTo(page, e.x);
    await page.waitFor(craneIdle, { timeout: 20000 });
    await flipLever(page, 'down');
    const h = await hook(page);
    assert.equal(h.load.length, 1, 'it took hold of something there (the block, or Rosa if she landed on it)');
    const id = h.load[0];
    await flipLever(page, 'up');
    const before = await hook(page);
    const dxBefore = await page.eval(() => window.__town.scene.wreck.dx());
    await page.goto('index.html');
    await record(page);
    await page.waitFor(() => window.__town && window.__town.at === 'construction/yard' && !window.__town.busy && window.__town.scene.crane);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    assert.deepEqual(await hook(page), before);
    assert.equal(await page.eval((id) => window.__town.scene.view.parentOf(id), id), before.id, 'still drawn on the hook');
    const shown = await page.eval(() => window.__town.scene.crane.shown());
    assert.deepEqual([shown.x, shown.y], [before.x, before.y], 'the crane is drawn where the store says');
    for (const [sid, xy] of Object.entries(S.scatter)) {
      if (sid === id) continue;
      const q = await ent(page, sid);
      assert.deepEqual([q.x, q.y], xy);
    }
    assert.ok((await placedAt(page, S.tower.ids[0])), 'the hammered block is still built');
    assert.equal(await page.eval(() => window.__town.scene.wreck.dx()), dxBefore, 'the wrecking crane is still where it was driven');
    await page.screenshot('rigs-after-reload');
  });

  it('idle after settling: no frames, no ops, no timers, no text', async () => {
    await page.waitFor(calm);
    await page.waitFor(() => { const t = window.__town.scene.tiles.stats(); return !t.settleTimer && t.loading === 0; });
    await page.eval(() => {
      window.__rafs = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (fn) => { window.__rafs++; return raf(fn); };
      window.__ops = 0;
      window.__offOps = window.__store.subscribe(() => { window.__ops++; });
    });
    await new Promise((r) => setTimeout(r, 1500));   // a window in which nothing may happen
    const r = await page.eval(() => ({
      rafs: window.__rafs, ops: window.__ops,
      calm: document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0,
      timers: window.__town.scene.stats().timers,
    }));
    assert.deepEqual(r, { rafs: 0, ops: 0, calm: true, timers: 0 });
    assert.equal(await page.eval(() => document.body.innerText.trim()), '');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
