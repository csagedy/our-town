// End-to-end: the construction site's dig pit (P2c.3) with real (trusted)
// touches. Drag the spade through the dirt: the canvas pixels over the dino
// bone go from dirt to hole, the spade fills (a clump), set it down: a pile;
// dig again until the bone is found (ta-da), then drag the bone away. Drag
// the excavator bucket through the dirt until it is full and let go over the
// truck: the bed is loaded. Drive the truck away from the pit and tap it: the
// bed tips and a pile grows. Push the piles back into the hole: the pit
// refills. A kid sits in the excavator cab and rides along when it drives.
// Reload: the hole (mask hash), the piles, the treasures and the machines are
// exactly where they were. The canvas stays small, and at rest nothing runs.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const pt = (x, y, id = 0) => ({ x, y, id, radiusX: 11, radiusY: 11, force: 1 });

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
const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0
  && !window.__town.scene.stats().dig.moving && !window.__town.scene.stats().dig.drawing;
const dig = (page, fn, arg) => page.eval(`(${fn})(window.__town.scene.dig, ${JSON.stringify(arg === undefined ? null : arg)})`);
const ent = (page, id) => page.eval((id) => { const e = window.__store.state.entities[id]; return e && !e.deleted ? { id, kind: e.kind, x: e.x, y: e.y, room: e.room, parent: e.parent || null, props: e.props } : null; }, id);
const w2s = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);

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
const piecePoint = (page, pid, fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) => page.eval(([pid, fr]) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, [pid, fr]);

/** The dirt canvas's alpha (0..255) at world (x, y). */
const dirtAlpha = (page, x, y) => page.eval(([x, y]) => {
  const c = window.__town.scene.dig.canvas();
  c.flush();
  const d = window.__town.manifest.rooms.site.pieces.dirt;
  const k = c.canvas.width / d.w;
  return c.canvas.getContext('2d').getImageData(Math.round((x - d.x) * k), Math.round((y - d.y) * k), 1, 1).data[3];
}, [x, y]);

/**
 * Drag entity `id` by its body so its FEET follow the world path (a finger
 * gesture of many small moves), then lift.
 */
async function dragFeetAlong(page, id, path, { stepMs = 24, lift = true } = {}) {
  const from = await entPoint(page, id);
  assert.ok(from, `a touch point on ${id}`);
  const pts = await page.eval(([id, fx, fy, path]) => {
    const v = window.__town.scene.view.viewOf(id);
    const g = window.__stage.screenToWorld(fx, fy);
    return path.map(([wx, wy]) => window.__stage.worldToScreen(g.x + wx - v.x, g.y + wy - v.y));
  }, [id, from.x, from.y, path]);
  const g = page.gesture();
  let t = 0;
  await g('touchStart', [pt(from.x, from.y)], t);
  // First get past the tap slop, then follow the path.
  for (const p of pts) { t += stepMs; await g('touchMove', [pt(p.x, p.y)], t); }
  await page.frames(2);
  if (lift) { t += stepMs; await g('touchEnd', [], t); await page.frames(2); }
  return g;
}

/** A zig-zag of feet points over world box [x0, y0, x1, y1]. */
function scribble(x0, y0, x1, y1, rows = 4, per = 8) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const y = y0 + ((y1 - y0) * r) / Math.max(1, rows - 1);
    for (let k = 0; k <= per; k++) {
      const u = r % 2 ? 1 - k / per : k / per;
      out.push([x0 + (x1 - x0) * u, y]);
    }
  }
  return out;
}

describe('construction site dig pit (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
  });
  after(async () => { if (page) await page.close(); });

  it('in from the map to the dig zone: dirt canvas, six buried treasures, spades and a wheelbarrow', async () => {
    const at = await page.eval(() => {
      const p = window.__town.manifest.map.pieces.construction;
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('construction', 0.62);
    });
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.at === 'construction/yard' && !window.__town.busy);
    await page.eval(() => window.__stage.camera.panTo(1440));
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    const t = await dig(page, (d) => d.treasures());
    assert.equal(t.length, 6);
    assert.ok(t.every((q) => q.buried));
    assert.deepEqual(t.map((q) => q.kind).sort(), ['dino-bone', 'fossil', 'gem', 'rubber-duck', 'toy-robot', 'treasure-chest']);
    S.bone = t.find((q) => q.kind === 'dino-bone');
    // Buried: under the dirt canvas, and not touchable.
    const z = await page.eval((id) => ({ bone: Number(window.__town.scene.view.viewOf(id).el.style.zIndex), dirt: Number(window.__town.scene.pieces.el('dirt').style.zIndex) }), S.bone.id);
    assert.ok(z.bone < z.dirt, 'the bone draws under the dirt');
    assert.equal(await entPoint(page, S.bone.id), null, 'a buried bone cannot be touched');
    // Memory: the canvas is the dirt art's size, the mask 1 px per 2 units.
    const c = await dig(page, (d) => d.canvasSize());
    assert.deepEqual([c.w, c.h, c.maskW, c.maskH], [616, 349, 165, 112]);
    assert.ok(c.bytes < 1.2e6, `canvas memory ${c.bytes} bytes`);
    const tools = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => !e.deleted && e.room === 'construction/yard' && (e.kind === 'spade' || e.kind === 'wheelbarrow')).map((e) => ({ id: e.id, kind: e.kind, x: e.x })));
    S.spade = tools.filter((q) => q.kind === 'spade').sort((a, b) => a.x - b.x)[0].id;
    S.barrow = tools.find((q) => q.kind === 'wheelbarrow').id;
    assert.equal(await dig(page, (d) => d.dirtLeft()), 1);
    await page.screenshot('dig-1-pit');
  });

  it('spade-dig a hole over the bone: the canvas pixels become a hole, the spade fills, set down it makes a pile', async () => {
    const [bx, by] = [S.bone.x, S.bone.y - 25];
    assert.ok((await dirtAlpha(page, bx, by)) > 200, 'dirt over the bone');
    await clearRec(page);
    const sp = await ent(page, S.spade);
    // Into the pit and scribble over the bone, then out to the ground on the left and let go.
    const path = [[sp.x + 30, sp.y - 40], [bx - 50, by], ...scribble(bx - 45, by - 20, bx + 45, by + 20, 3, 6), [bx - 150, 900], [1985, 885]];
    await dragFeetAlong(page, S.spade, path);
    await page.waitFor(calm);
    const a1 = await dirtAlpha(page, bx, by);
    assert.ok(a1 < 60, `a hole in the canvas over the bone (alpha ${a1})`);
    const st = await page.eval(() => window.__town.scene.stats().dig);
    assert.ok(st.scoops >= 1, 'the spade got full');
    assert.ok(st.pit.strokes >= 1 && st.pit.strokes <= 3, `one stroke op per gesture (${st.pit.strokes})`);
    assert.ok(await page.eval(() => window.__rec.sounds.includes('scrape')));
    const piles = await dig(page, (d) => d.piles());
    assert.equal(piles.length, 1, 'set down full: a pile');
    assert.equal((await ent(page, S.spade)).props.load, 'empty');
    await page.screenshot('dig-2-hole');
  });

  it('dig on until the bone is found: ta-da, it hops out and can be dragged away', async () => {
    for (let k = 0; k < 6; k++) {
      const b = await ent(page, S.bone.id);
      if (!b.props.buried) break;
      const sp = await ent(page, S.spade);
      const [bx, by] = [S.bone.x, S.bone.y - 25];
      await dragFeetAlong(page, S.spade, [[sp.x + 30, sp.y - 40], [bx - 40, by - 25], ...scribble(bx - 40, by - 28, bx + 40, by + 22, 3 + k, 6), [1975 - k * 25, 885]]);
      await page.waitFor(calm);
    }
    const b = await ent(page, S.bone.id);
    assert.equal(b.props.buried, false, 'the bone is found');
    assert.ok(await page.eval(() => window.__rec.sounds.includes('tada')));
    const cov = await dig(page, (d, id) => d.coverageOf(id), S.bone.id);
    assert.ok(cov <= 0.5, `the dirt over it is mostly gone (${cov})`);
    await page.screenshot('dig-3-bone-found');
    // Now a normal prop: drag it out onto the ground.
    const from = await entPoint(page, S.bone.id);
    assert.ok(from, 'the found bone takes touches');
    // (not too low on the left: the pocket tray opens along the bottom-left while dragging)
    const to = await w2s(page, 1640, 850);
    await page.drag(from, { x: to.x, y: to.y - 20 }, { steps: 14, durationMs: 380 });
    await page.waitFor(calm);
    const b2 = await ent(page, S.bone.id);
    assert.equal(b2.room, 'construction/yard');
    assert.ok(b2.x < 1720, `the bone was carried off (${b2.x})`);
    S.hole = await dig(page, (d) => d.dirtLeft());
    assert.ok(S.hole < 0.97);
  });

  it('the excavator bucket digs until full, and let go over the truck it dumps into the bed', async () => {
    await clearRec(page);
    const b = await piecePoint(page, 'excavator-bucket');
    assert.ok(b, 'a touch point on the bucket');
    const ex0 = await dig(page, (d) => d.excavator());
    // Finger path in world: down into the dirt on the left of the pit, back and forth, then up over the truck.
    const g0 = await page.eval(([x, y]) => window.__stage.screenToWorld(x, y), [b.x, b.y]);
    const off = [g0.x - ex0.B[0], g0.y - ex0.B[1]];
    const world = [];
    for (let k = 0; k <= 8; k++) world.push([ex0.B[0] - 10 * k, ex0.B[1] + 12 * k]);   // down into the dirt
    for (let r = 0; r < 4; r++) for (let k = 0; k <= 10; k++) { const u = r % 2 ? 1 - k / 10 : k / 10; world.push([2095 + 120 * u, 820 + r * 14]); }
    for (let k = 1; k <= 12; k++) world.push([2150 - 17 * k, 820 - 12 * k]);             // up and over the truck bed
    const pts = [];
    for (const [x, y] of world) pts.push(await w2s(page, x + off[0], y + off[1]));
    const g = page.gesture();
    let t = 0;
    await g('touchStart', [pt(b.x, b.y)], t);
    for (const p of pts) { t += 30; await g('touchMove', [pt(p.x, p.y)], t); }
    await page.frames(2);
    const mid = await dig(page, (d) => d.excavator());
    assert.ok(mid.full, 'the bucket is full');
    assert.ok(mid.dx < -30, `the excavator rolled towards the truck (${mid.dx})`);
    for (let k = 0; k < 6; k++) { t += 120; await g('touchMove', [pt(pts[pts.length - 1].x, pts[pts.length - 1].y)], t); }   // hold still: no flick
    t += 40;
    await g('touchEnd', [], t);
    await page.waitFor(calm);
    const tr = await dig(page, (d) => d.truck());
    assert.equal(tr.load, 2, 'two scoops in the truck');
    assert.equal(tr.bed, 'full');
    const ex = await dig(page, (d) => d.excavator());
    assert.equal(ex.full, false, 'the bucket is empty again');
    const snd = await page.eval(() => window.__rec.sounds);
    assert.ok(snd.includes('rumble') && snd.includes('scrape'), 'engine rumble and digging sounds');
    const f = await page.eval(() => window.__town.scene.fixtures().props);
    assert.equal(f.excX, ex.dx, 'the excavator pose is saved');
    await page.screenshot('dig-4-truck-loaded');
  });

  it('drive the truck away and tap it: beep, the bed tips up, dirt slides out into a pile', async () => {
    const tb = await piecePoint(page, 'dump-truck', [0.3, 0.5, 0.2, 0.4]);
    assert.ok(tb);
    const to = await w2s(page, 0, 0), to2 = await w2s(page, -140, 0);
    await page.drag(tb, { x: tb.x + (to2.x - to.x), y: tb.y }, { steps: 14, durationMs: 420 });
    await page.waitFor(calm);
    const tr0 = await dig(page, (d) => d.truck());
    assert.ok(tr0.dx < -100, `the truck drove (${tr0.dx})`);
    const size0 = (await dig(page, (d) => d.piles())).reduce((n, q) => n + q.size, 0);
    await clearRec(page);
    const tb2 = await piecePoint(page, 'dump-truck', [0.3, 0.5, 0.2, 0.4]);
    // Watch the bed's pictures while it tips.
    await page.eval(() => {
      window.__bed = [];
      const img = window.__town.scene.pieces.el('truck-bed');
      const mo = new MutationObserver(() => { const v = img.dataset.variant; if (window.__bed[window.__bed.length - 1] !== v) window.__bed.push(v); });
      mo.observe(img, { attributes: true, attributeFilter: ['data-variant'] });
    });
    await page.tap(tb2.x, tb2.y);
    await page.waitFor(() => window.__bed.includes('up') && window.__town.scene.dig.truck().pouring === false, { timeout: 8000 });
    await page.waitFor(calm);
    const bedSeen = await page.eval(() => window.__bed);
    assert.ok(bedSeen.includes('tilt') && bedSeen.includes('up'), `the bed tipped (${bedSeen})`);
    const tr = await dig(page, (d) => d.truck());
    assert.equal(tr.load, 0);
    assert.equal(tr.bed, 'down');
    const piles = await dig(page, (d) => d.piles());
    assert.equal(piles.reduce((n, q) => n + q.size, 0), size0 + 2, 'the two scoops came out onto a pile');
    const p = piles.find((q) => Math.abs(q.x - (2052 + tr.dx + 20)) < 75 && q.y > 880);
    assert.ok(p, 'the pile is behind the truck');
    S.truckPile = p.id;
    const snd = await page.eval(() => window.__rec.sounds);
    assert.ok(snd.includes('beep') && snd.includes('slide'));
    await page.screenshot('dig-5-truck-pile');
  });

  it('pat a pile flat; push the piles back into the hole: the pit refills', async () => {
    const p0 = await entPoint(page, S.truckPile);
    await page.tap(p0.x, p0.y);
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(S.truckPile)}].props.flat === true`);
    assert.equal((await ent(page, S.truckPile)).props.flat, true, 'patted flat');
    await page.waitFor(calm);
    const before = await dig(page, (d) => d.dirtLeft());
    const holeA = await dirtAlpha(page, S.bone.x, S.bone.y - 25);
    for (const p of await dig(page, (d) => d.piles())) {
      const from = await entPoint(page, p.id);
      if (!from) continue;
      const to = await w2s(page, S.bone.x, S.bone.y - 5);
      const g0 = await page.eval(([x, y]) => window.__stage.screenToWorld(x, y), [from.x, from.y]);
      const d = await page.eval(([x, y, id]) => { const v = window.__town.scene.view.viewOf(id); return { dx: x - v.x, dy: y - v.y }; }, [g0.x, g0.y, p.id]);
      const dest = await w2s(page, S.bone.x + d.dx, S.bone.y - 5 + d.dy);
      void to;
      await page.drag(from, dest, { steps: 14, durationMs: 380 });
      await page.waitFor(calm);
    }
    const after = await dig(page, (d) => d.dirtLeft());
    assert.ok(after > before + 0.02, `the pit filled up (${before} -> ${after})`);
    assert.equal((await dig(page, (d) => d.piles())).length, 0, 'the piles went into the hole');
    const holeB = await dirtAlpha(page, S.bone.x, S.bone.y - 25);
    assert.ok(holeB > holeA + 100, `dirt over the old hole again (${holeA} -> ${holeB})`);
    await page.screenshot('dig-6-refilled');
  });

  it('a kid climbs into the excavator cab and rides along when it drives', async () => {
    // Bring a kid over (setup), then the real part: drag them onto the cab seat.
    const kid = await page.eval(() => Object.values(window.__store.state.entities).find((e) => !e.deleted && e.kind === 'char' && e.room === 'construction/yard' && !e.props.seat).id);
    await page.eval((id) => window.__store.dispatch('move', { id, room: 'construction/yard', x: 2560, y: 950, z: 0 }), kid);
    await page.waitFor(calm);
    const ex = await dig(page, (d) => d.excavator());
    const seat = await page.eval(() => window.__town.manifest.rooms.site.seats.find((s) => s.id === 'excavator-cab').at);
    const from = await entPoint(page, kid);
    const g0 = await page.eval(([x, y]) => window.__stage.screenToWorld(x, y), [from.x, from.y]);
    const k0 = await ent(page, kid);
    const dest = await w2s(page, g0.x + seat[0] + ex.dx - k0.x, g0.y + seat[1] - k0.y + 40);   // her hips (not her feet) over the seat
    await page.drag(from, dest, { steps: 16, durationMs: 450 });
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(kid)}].props.seat === 'excavator-cab'`);
    await page.waitFor(calm);
    await page.screenshot('dig-7-kid-in-cab');
    const x0 = (await ent(page, kid)).x;
    // Drive: drag the excavator body to the right.
    const eb = await piecePoint(page, 'excavator', [0.8, 0.7, 0.9, 0.6]);
    const a = await w2s(page, 0, 0), b2 = await w2s(page, 60, 0);
    await page.drag(eb, { x: eb.x + (b2.x - a.x), y: eb.y }, { steps: 12, durationMs: 400 });
    await page.waitFor(calm);
    const ex2 = await dig(page, (d) => d.excavator());
    const k2 = await ent(page, kid);
    assert.equal(k2.props.seat, 'excavator-cab');
    assert.ok(Math.abs((k2.x - x0) - (ex2.dx - ex.dx)) < 1, `the kid rode along (${k2.x - x0} vs ${ex2.dx - ex.dx})`);
    S.kid = kid;
  });

  it('at rest nothing runs: no frames, no canvas draws', async () => {
    await page.waitFor(calm);
    const r = await page.eval(async () => {
      let n = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (f) => { n++; return raf.call(window, f); };
      const s0 = window.__town.scene.stats().dig;
      await new Promise((ok) => setTimeout(ok, 1200));
      window.requestAnimationFrame = raf;
      const s1 = window.__town.scene.stats().dig;
      return { n, frames: s1.frames - s0.frames, draws: s1.canvas.draws - s0.canvas.draws };
    });
    assert.deepEqual(r, { n: 0, frames: 0, draws: 0 });
  });

  it('reload: the hole, the piles, the treasures and the machines are exactly as they were', async () => {
    // One more pile to carry through the reload.
    await page.eval(() => window.__town.scene.dig.dumpAt(1700, 940, 3));
    await page.waitFor(calm);
    const snap = () => page.eval(() => {
      const d = window.__town.scene.dig;
      return { hash: d.hash(), dirt: d.dirtLeft(), piles: d.piles().sort((a, b) => (a.id < b.id ? -1 : 1)), treasures: d.treasures().sort((a, b) => (a.id < b.id ? -1 : 1)), ex: [d.excavator().a, d.excavator().dx], truck: d.truck().dx };
    });
    const before = await snap();
    await page.goto('index.html');
    await record(page);
    await page.waitFor(() => window.__town && window.__town.at === 'construction/yard' && !window.__town.busy && window.__town.scene.dig);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    const after = await snap();
    assert.deepEqual(after, before);
    assert.equal((await ent(page, S.kid)).props.seat, 'excavator-cab');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
    await page.eval(() => window.__stage.camera.panTo(1440));
    await page.waitFor(calm);
    await page.screenshot('dig-8-after-reload');
  });
});
