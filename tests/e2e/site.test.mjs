// End-to-end: the construction site (P2c.1) with real (trusted) touches.
// In from the city map's construction building; build a three-block tower
// from the brick pallet and put a roof from the scaffold stock on it (every
// piece snapped exactly onto the 40-unit grid and the height map); paint a
// block (dip the brush in a can, drag it over the block); hammer one (it
// locks and shows its nail); stand Rosa on the roof; pull the bottom block
// out (the ones above settle down, nothing is lost, Rosa rides down on the
// roof); the portable toilet flushes; reload: the build is all still there;
// no text on screen; an untouched site does no work.

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

const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const noText = () => document.body.innerText.trim();
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0;
/** page.waitFor with an argument (serialized into the polled expression). */
const waitWith = (page, fn, arg, timeout = 15000) => page.waitFor(`(${fn})(${JSON.stringify(arg)})`, { timeout });
const pt = (x, y) => ({ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 });

/** A screen point where a touch picks entity `id`. */
const entPoint = (page, id) => page.eval((id) => {
  const v = window.__town.scene.view.viewOf(id);
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === v.el) return { x, y };
  }
  return null;
}, id);

/** A screen point where a touch picks fixture piece `pid`. */
const piecePoint = (page, pid) => page.eval((pid) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 90 || y < 90 || x > innerWidth - 90 || y > innerHeight - 20) continue;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, pid);

const w2s = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
const ent = (page, id) => page.eval((id) => { const e = window.__store.state.entities[id]; return e ? { id, kind: e.kind, x: e.x, y: e.y, room: e.room, parent: e.parent || null, props: e.props } : null; }, id);
const idsOf = (page, kind) => page.eval(([kind, room]) => Object.values(window.__store.state.entities).filter((e) => e.kind === kind && !e.deleted && e.room === room && !e.parent).map((e) => e.id).sort(), [kind, SITE]);
const placed = (page) => page.eval(() => window.__town.scene.build.placed());
const grid = (page) => page.eval(() => window.__town.scene.grid);

/** Is every grid piece exactly on an anchor, resting on the height map (nothing floats, nothing overlaps)? */
const gridHonest = (page) => page.eval(async () => {
  const { settleGrid, shapeOf } = await import('./src/core/buildgrid.js');
  const sc = window.__town.scene;
  const g = sc.grid;
  const list = sc.build.placed().map((p) => {
    const e = window.__store.state.entities[p.id];
    const snap = window.__town.manifest.props[sc.catalog.get(p.kind).art.sprite].snap;
    return { id: p.id, c: p.c, r: p.r, shape: shapeOf(snap, g.cell), x: e.x, y: e.y };
  });
  const exact = list.every((p) => Math.abs(p.x - (g.x0 + (p.c + p.shape.w / 2) * g.cell)) < 0.01 && Math.abs(p.y - (g.y - p.r * g.cell)) < 0.01);
  return { exact, moves: settleGrid(g, list).length, n: list.length };
});

/** The drag-out clone a spawner made (the newest entity of `kinds` that wasn't there before). */
async function newPiece(page, before) {
  await waitWith(page, (b) => window.__town.scene.build.placed().some((p) => !b.includes(p.id)) , before).catch(() => {});
  return page.eval((b) => window.__town.scene.build.placed().find((p) => !b.includes(p.id)) || null, before);
}

/** Drag from `from` (screen) so the finger ends at world (wx, wy). */
async function dragToWorld(page, from, wx, wy, opts = {}) {
  const to = await w2s(page, wx, wy);
  await page.drag(from, to, Object.assign({ steps: 16, durationMs: 360 }, opts));
  await page.frames(2);
}

/** Drag entity `id` by its body so its feet end at world (wx, wy). */
async function dragFeetTo(page, id, wx, wy) {
  const from = await entPoint(page, id);
  assert.ok(from, `a touch point on ${id}`);
  const to = await page.eval(([id, fx, fy, wx, wy]) => {
    const v = window.__town.scene.view.viewOf(id);
    const g = window.__stage.screenToWorld(fx, fy);
    return window.__stage.worldToScreen(g.x + wx - v.x, g.y + wy - v.y);
  }, [id, from.x, from.y, wx, wy]);
  await page.drag(from, to, { steps: 16, durationMs: 360 });
  await page.frames(2);
}

describe('construction site (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};   // shared state between the steps
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
  });
  after(async () => { if (page) await page.close(); });

  it('the construction building on the map leads into the site, at the build yard', async () => {
    assert.equal(await page.eval(() => window.__town.at), 'city');
    const at = await page.eval(() => {
      const p = window.__town.manifest.map.pieces.construction;
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('construction', 0.62);
    });
    await clearRec(page);
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.at === 'construction/yard' && !window.__town.busy);
    assert.ok((await page.eval(() => window.__rec.sounds)).includes('whistle'), 'the whistle blows on the way in');
    assert.equal(await page.eval(() => document.querySelector('.room').dataset.room), SITE);
    assert.equal(await page.eval(() => window.__stage.room.width), 2880);
    assert.equal(await page.eval(() => window.__stage.camera.x), 0, 'opens on the build yard');
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    assert.equal(await page.eval(noText), '');
    // First visit: the half-built house and starter bricks on the grid, Rosa, a kid in an orange hard hat.
    const h = await gridHonest(page);
    assert.ok(h.exact && h.moves === 0 && h.n >= 9, JSON.stringify(h));
    const cast = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'construction/yard').map((e) => e.props.cast).sort());
    assert.deepEqual(cast, ['boy5', 'builder']);
    const hat = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'hard-hat' && e.parent && window.__store.state.entities[e.parent].props.cast === 'boy5'));
    assert.equal(hat.props.colors.hat, '#EE9A55', 'the kid wears the orange hard hat');
    await page.screenshot('site-build-yard');
  });

  it('builds a three-block tower from the brick pallet, each block snapped exactly onto the height map', async () => {
    const g = await grid(page);
    const bricks = (await idsOf(page, 'site-bricks'))[0];
    assert.ok(bricks);
    S.tower = [];
    for (let i = 0; i < 3; i++) {
      await page.waitFor(calm);
      const before = (await placed(page)).map((p) => p.id);
      const hs = await page.eval(() => window.__town.scene.build.heights());
      await clearRec(page);
      await dragToWorld(page, await entPoint(page, bricks), 560, 600);
      const p = await newPiece(page, before);
      assert.ok(p, `block ${i + 1} landed on the grid`);
      assert.match(p.kind, /^block-/);
      const e = await ent(page, p.id);
      // Exactly on its anchor, on top of what is under its columns.
      assert.equal(e.x, g.x0 + (p.c + p.w / 2) * g.cell, `x on the grid (${p.kind})`);
      assert.equal(e.y, g.y - p.r * g.cell, 'y on the grid');
      assert.equal(p.r, Math.max(...hs.slice(p.c, p.c + p.w)), 'it rests on the tallest column under it');
      assert.equal(p.c, Math.max(0, Math.min(g.cols - p.w, Math.round((560 - g.x0) / g.cell - p.w / 2))), 'the column under the finger');
      if (i > 0) assert.ok(p.r > 0, 'stacked on the one before');
      await page.waitFor(() => window.__rec.sounds.includes('clack'));
      S.tower.push(p);
      // Drawn at scale 1 (no depth scale) so the art lines up with the cells.
      assert.equal(await page.eval((id) => window.__town.scene.view.viewOf(id).scale, p.id), 1);
    }
    const h = await gridHonest(page);
    assert.ok(h.exact && h.moves === 0, JSON.stringify(h));
    await page.waitFor(calm);
    await page.screenshot('site-tower');
  });

  it('puts a roof from the scaffold stock on top, snapped exactly', async () => {
    const g = await grid(page);
    const stock = (await idsOf(page, 'stock-roof-triangle'))[0];
    const before = (await placed(page)).map((p) => p.id);
    const hs = await page.eval(() => window.__town.scene.build.heights());
    await dragToWorld(page, await entPoint(page, stock), 560, 480);
    const roof = await newPiece(page, before);
    assert.ok(roof && roof.kind === 'roof-triangle', JSON.stringify(roof));
    const e = await ent(page, roof.id);
    assert.equal(roof.c, 6, 'a 4-wide roof over the tower');
    assert.equal(roof.r, Math.max(...hs.slice(6, 10)), 'on top of the tower');
    assert.equal(e.x, g.x0 + (roof.c + 2) * g.cell);
    assert.equal(e.y, g.y - roof.r * g.cell);
    S.roof = roof;
    const h = await gridHonest(page);
    assert.ok(h.exact && h.moves === 0, JSON.stringify(h));
    // Its apex is a place to stand.
    const tops = await page.eval(() => window.__town.scene.build.tops());
    S.apex = tops.find((t) => Math.abs((t.x0 + t.x1) / 2 - e.x) < 1 && Math.abs(t.y - (e.y - 80)) < 0.5);
    assert.ok(S.apex, `the roof's apex is a top: ${JSON.stringify(tops)}`);
    await page.waitFor(calm);
    await page.screenshot('site-roof');
  });

  it('Rosa stands on the roof', async () => {
    const rosa = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && e.props.cast === 'builder').id);
    S.rosa = rosa;
    await dragFeetTo(page, rosa, (S.apex.x0 + S.apex.x1) / 2, S.apex.y - 12);
    await waitWith(page, (id) => { const e = window.__store.state.entities[id]; return e && e.props.pose === 'stand'; }, rosa);
    await page.waitFor(calm);
    const e = await ent(page, rosa);
    assert.equal(e.y, S.apex.y, `Rosa's feet on the apex (${e.y} vs ${S.apex.y})`);
    assert.ok(e.x >= S.apex.x0 - 12 && e.x <= S.apex.x1 + 12);
    await page.screenshot('site-rosa-on-roof');
  });

  it('paints a block: dip the brush in a can, drag it over the block', async () => {
    const target = S.tower[1];
    const cur = (await ent(page, target.id)).props.paint;
    const cans = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'paint-can' && e.room === 'construction/yard' && !e.parent && e.x > 1100 && e.x < 1300).map((e) => ({ id: e.id, paint: e.props.paint })));
    const can = cans.find((c) => c.paint !== cur);
    assert.ok(can, JSON.stringify(cans));
    const brush = (await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'paintbrush' && e.room === 'construction/yard' && !e.parent).sort((a, b) => a.x - b.x)[0].id));
    const from = await entPoint(page, brush);
    // The bristles are the brush's feet point: keep them on the can, then on the block.
    const legs = await page.eval(([bid, cid, tid, fx, fy]) => {
      const sc = window.__town.scene, st = window.__stage;
      const b = sc.view.viewOf(bid), c = sc.view.viewOf(cid), t = sc.view.viewOf(tid);
      const f = st.screenToWorld(fx, fy);
      const ox = b.x - f.x, oy = b.y - f.y;
      const at = (x, y) => st.worldToScreen(x - ox, y - oy);
      return [at(c.x, c.y - c.sprite.h * c.scale * 0.4), at(c.x, 640), at(t.x, t.y - 20)];
    }, [brush, can.id, target.id, from.x, from.y]);
    const g = page.gesture();
    let tms = 0;
    await g('touchStart', [pt(from.x, from.y)], tms);
    let p0 = from;
    for (const leg of legs) {
      for (let k = 1; k <= 12; k++) { tms += 16; await g('touchMove', [pt(p0.x + (leg.x - p0.x) * k / 12, p0.y + (leg.y - p0.y) * k / 12)], tms); }
      await page.frames(2);
      p0 = leg;
    }
    tms += 16;
    await g('touchEnd', [], tms);
    await waitWith(page, ([id, paint]) => window.__store.state.entities[id].props.paint === paint, [target.id, can.paint]);
    assert.equal((await ent(page, brush)).props.paint, can.paint, 'the brush took the colour');
    const key = await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.key, target.id);
    assert.ok(key.endsWith(':' + can.paint), `drawn in ${can.paint}: ${key}`);
    S.painted = { id: target.id, paint: can.paint };
    await page.waitFor(calm);
    await page.screenshot('site-painted');
  });

  it('hammers a block: bonk, it locks and shows a nail', async () => {
    const target = S.tower[1];
    const hammer = (await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'hammer' && e.room === 'construction/yard' && !e.parent).sort((a, b) => a.x - b.x)[0].id));
    const t = await page.eval((id) => { const v = window.__town.scene.view.viewOf(id); return { x: v.x, y: v.y - 20 }; }, target.id);
    await clearRec(page);
    await dragToWorld(page, await entPoint(page, hammer), t.x, t.y);
    await waitWith(page, (id) => window.__store.state.entities[id].props.locked === true, target.id);
    assert.ok((await page.eval(() => window.__rec.sounds)).includes('bonk'));
    const nail = await page.eval((id) => { const n = window.__town.scene.view.viewOf(id).el.querySelector('.site-nail'); return n ? getComputedStyle(n).visibility : null; }, target.id);
    assert.equal(nail, 'visible');
    S.locked = target.id;
    await page.waitFor(calm);
    await page.screenshot('site-hammered');
  });

  it('pulling the bottom block out is forgiving: the ones above settle down, Rosa rides the roof down', async () => {
    const bottom = S.tower[0];
    const before = await placed(page);
    const roof0 = before.find((p) => p.id === S.roof.id);
    // Onto the sand in front of the deck (not over the grid: y below its front line).
    await dragFeetTo(page, bottom.id, 700, 958);
    await waitWith(page, (id) => { const e = window.__store.state.entities[id]; return e && e.y > 940; }, bottom.id);
    await page.waitFor(calm);
    const after = await placed(page);
    assert.equal(after.length, before.length - 1, 'only the pulled block left the grid');
    assert.ok(before.every((p) => p.id === bottom.id || after.some((q) => q.id === p.id)), 'nothing else was lost');
    const h = await gridHonest(page);
    assert.ok(h.exact && h.moves === 0, `nothing floats, nothing overlaps: ${JSON.stringify(h)}`);
    const roof1 = after.find((p) => p.id === S.roof.id);
    assert.ok(roof1.r < roof0.r, `the roof came down (${roof0.r} -> ${roof1.r})`);
    const rosa = await ent(page, S.rosa);
    const g = await grid(page);
    assert.equal(rosa.y, g.y - roof1.r * g.cell - 80, 'Rosa is still on the roof');
    assert.ok((await ent(page, S.locked)).props.locked, 'the hammered block is still locked');
    await page.screenshot('site-pulled-out');
  });

  it('the portable toilet door opens and shuts, and flushes', async () => {
    const door = await piecePoint(page, 'potty-door');
    assert.ok(door);
    await page.tap(door.x, door.y);
    await page.waitFor(() => window.__town.scene.pieces.state('potty-door') === 'open');
    await page.waitFor(calm);
    await clearRec(page);
    await page.tap(door.x, door.y);
    await page.waitFor(() => window.__town.scene.pieces.state('potty-door') === 'closed');
    await page.waitFor(() => window.__rec.sounds.includes('flush'));
    assert.equal(await page.eval(() => window.__town.scene.stats().flushes), 1);
    // The crane lever flips; the machines (later beads) still react to a tap.
    const lever = await piecePoint(page, 'crane-lever');
    await page.tap(lever.x, lever.y);
    await page.waitFor(() => window.__town.scene.pieces.state('crane-lever') === 'down');
    await page.waitFor(calm);
  });

  it('reload: the build, the paint and the lock are all still there', async () => {
    const before = (await placed(page)).sort((a, b) => (a.id < b.id ? -1 : 1));
    await page.goto('index.html');
    await record(page);
    await page.waitFor(() => window.__town && window.__town.at === 'construction/yard' && !window.__town.busy && window.__town.scene.build);
    const after = (await placed(page)).sort((a, b) => (a.id < b.id ? -1 : 1));
    assert.deepEqual(after, before);
    assert.equal((await ent(page, S.painted.id)).props.paint, S.painted.paint);
    assert.equal((await ent(page, S.locked)).props.locked, true);
    assert.equal(await page.eval(() => window.__town.scene.pieces.state('potty-door')), 'closed');
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    assert.equal(await page.eval(noText), '');
    await page.screenshot('site-after-reload');
  });

  it('carrying: hold the hammer on the map button to take it to the map, hold it on the site to bring it back; the car drives in', async () => {
    const hammer = (await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'hammer' && e.room === 'construction/yard' && !e.parent).sort((a, b) => a.x - b.x)[0].id));
    await page.waitFor(calm);
    const h = await entPoint(page, hammer);
    const mb = await page.box('.ui-map');
    const g = page.gesture();
    let t = 0;
    await g('touchStart', [pt(h.x, h.y)], t);
    for (let k = 1; k <= 14; k++) { t += 30; await g('touchMove', [pt(h.x + (mb.cx - h.x) * k / 14, h.y + (mb.cy - h.y) * k / 14)], t); }
    await page.waitFor(() => window.__town.at === 'city' && !window.__town.busy, { timeout: 10000 });
    await page.waitFor(() => window.__town.carry.stats.adopted >= 1, { timeout: 5000 });
    // Over the site's door on the map: back in, still in the finger.
    await page.eval(() => window.__stage.camera.panTo(window.__town.scene.doorWorld('construction').x - 720));
    await page.frames(3);
    const door2 = await page.eval(() => { const w = window.__town.scene.doorWorld('construction'); return window.__stage.worldToScreen(w.x, w.y); });
    for (let k = 1; k <= 14; k++) { t += 30; await g('touchMove', [pt(mb.cx + (door2.x - mb.cx) * k / 14, mb.cy + (door2.y - mb.cy) * k / 14)], t); }
    await page.waitFor(() => window.__town.at === 'construction/yard' && !window.__town.busy, { timeout: 10000 });
    await page.waitFor(() => window.__town.carry.stats.adopted >= 2, { timeout: 5000 });
    assert.deepEqual(await page.eval(() => window.__town.scene.view.heldIds()), [hammer], 'still under the finger at the site');
    t += 30;
    await g('touchMove', [pt(door2.x + 20, door2.y + 40)], t);
    t += 30;
    await g('touchEnd', [], t);
    await waitWith(page, (id) => { const e = window.__store.state.entities[id]; return e.room === 'construction/yard' && !e.parent; }, hammer);
    // The car: the thermos rides in it (set up through the store) and gets out at the site.
    await page.tapElement('.ui-map');
    await page.waitFor(() => window.__town.at === 'city' && !window.__town.busy && window.__town.scene.view);
    const thermos = await page.eval(() => {
      const s = window.__store.state;
      const car = Object.values(s.entities).find((e) => e.kind === 'car');
      const th = Object.values(s.entities).find((e) => e.kind === 'thermos' && e.room === 'construction/yard');
      window.__store.dispatch('move', { id: car.id, room: 'city', x: 1000, y: car.y });
      window.__store.dispatch('move', { id: th.id, room: 'city', x: 1000, y: car.y });
      window.__store.dispatch('attach', { id: th.id, parent: car.id });
      window.__stage.camera.panTo(1000 - 720);
      return th.id;
    });
    await page.waitFor(() => !window.__stage.camera.moving);
    await page.frames(4);
    const carId = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'car').id);
    const car = await entPoint(page, carId);
    await page.tap(car.x, car.y);
    await page.waitFor(() => window.__town.at === 'construction/yard' && !window.__town.busy && window.__town.scene.view, { timeout: 20000 });
    await waitWith(page, (id) => window.__store.state.entities[id].room === 'construction/yard', thermos);
    const e = await ent(page, thermos);
    assert.equal(e.parent, null);
    assert.deepEqual({ x: e.x, y: e.y }, await page.eval(() => window.__town.scene.arrivalSpot(0)), 'it stands at the site\'s arrival spot');
    await page.waitFor(calm);
    await page.screenshot('site-car-arrived');
  });

  it('stays idle when nobody touches it: no frames, no ops, no timers', async () => {
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
      calm: (() => { try { return document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0; } catch { return false; } })(),
      timers: window.__town.scene.stats().timers,
    }));
    assert.deepEqual(r, { rafs: 0, ops: 0, calm: true, timers: 0 });
    assert.equal(await page.eval(noText), '');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
