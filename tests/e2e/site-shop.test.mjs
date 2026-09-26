// End-to-end: the construction site's workshop (P2c.4) with real (trusted)
// touches. The saw, hammer and wrench hang on their pegboard outlines; drag
// the hammer off and back near its outline: it snaps home. Drag the saw back
// and forth over the plank on the saw table: zzzt, two half planks. Tap the
// drill on and carry it over a half plank: a bolt, locked. Push a dirt pile
// into the mixer's mouth, tap the drum: it spins through its frames; tap
// again: it pours a cement slab, which snaps onto the build grid. Tap cones
// over (dominoes) and up; drive the truck through them. Tap the thermos: a
// cup of cocoa, which a character sips. Stand a kid on a seesaw plank: it
// tips. Reload: all of it is still there; at rest nothing runs.

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
const sounds = (page) => page.eval(() => window.__rec.sounds.slice());
const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle' && a.playState === 'running').length === 0
  && !window.__town.scene.stats().dig.moving && !window.__town.scene.stats().shop.spinning;
const shop = (page, fn, arg) => page.eval(`(${fn})(window.__town.scene.shop, ${JSON.stringify(arg === undefined ? null : arg)})`);
const ent = (page, id) => page.eval((id) => { const e = window.__store.state.entities[id]; return e && !e.deleted ? { id, kind: e.kind, x: e.x, y: e.y, room: e.room, parent: e.parent || null, props: e.props } : null; }, id);
const ents = (page, kind) => page.eval((kind) => Object.values(window.__store.state.entities).filter((e) => !e.deleted && e.kind === kind && e.room === 'construction/yard').map((e) => ({ id: e.id, x: e.x, y: e.y, props: e.props })), kind);
const w2s = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
const pan = async (page, x) => { await page.eval((x) => window.__stage.camera.panTo(x), x); await page.waitFor(imagesReady); await page.waitFor(calm); };

const entPoint = (page, id) => page.eval((id) => {
  const v = window.__town.scene.view.viewOf(id);
  if (!v) return null;
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === v.el) return { x, y };
  }
  return null;
}, id);
const piecePoint = (page, pid, fr = [0.5, 0.4, 0.6, 0.3, 0.7]) => page.eval(([pid, fr]) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, [pid, fr]);

/** Drag entity `id` by its body so its FEET follow the world path, then lift. */
async function dragFeetAlong(page, id, path, { stepMs = 24 } = {}) {
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
  for (const p of pts) { t += stepMs; await g('touchMove', [pt(p.x, p.y)], t); }
  await page.frames(2);
  for (let k = 0; k < 4; k++) { t += 60; await g('touchMove', [pt(pts[pts.length - 1].x, pts[pts.length - 1].y)], t); }   // hold still: no flick
  t += stepMs;
  await g('touchEnd', [], t);
  await page.frames(2);
}
const line = (a, b, n = 8) => { const out = []; for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); return out; };

describe('construction site workshop (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
  });
  after(async () => { if (page) await page.close(); });

  it('in from the map to the workshop: tools on their outlines, a plank on the saw table, a drill, cones', async () => {
    const at = await page.eval(() => {
      const p = window.__town.manifest.map.pieces.construction;
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('construction', 0.62);
    });
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.at === 'construction/yard' && !window.__town.busy && window.__town.scene.shop);
    await pan(page, 1440);
    const hung = await shop(page, (s) => s.hung().map((h) => h.kind).sort());
    assert.deepEqual(hung, ['hammer', 'saw', 'wrench']);
    const t = await shop(page, (s) => s.table);
    const planks = await ents(page, 'plank');
    S.plank = planks.find((p) => Math.abs(p.x - t.cx) < 1 && Math.abs(p.y - t.y) < 1);
    assert.ok(S.plank, 'a plank on the saw table');
    S.drill = (await ents(page, 'drill'))[0];
    assert.ok(S.drill, 'a drill on the bench');
    S.hammer = (await shop(page, (s) => s.hung().find((h) => h.kind === 'hammer'))).id;
    S.saw = (await shop(page, (s) => s.hung().find((h) => h.kind === 'saw'))).id;
    // Drawn smaller and turned to fit the outline.
    const st = await page.eval((id) => { const v = window.__town.scene.view.viewOf(id); return { scale: v.scale, rot: v.body.style.rotate }; }, S.hammer);
    assert.equal(st.scale, 0.9);
    assert.equal(st.rot, '24deg');
    assert.equal((await ents(page, 'traffic-cone')).length, 3);
    await page.screenshot('shop-1-workshop');
  });

  it('drag the hammer off the pegboard, then back near its outline: it snaps home with a click', async () => {
    const peg = await shop(page, (s) => s.peg.hammer);
    await dragFeetAlong(page, S.hammer, line([peg.x, peg.y], [2600, 940], 10));
    await page.waitFor(calm);
    let h = await ent(page, S.hammer);
    assert.ok(Math.abs(h.x - peg.x) > 20 && h.y > 900, `the hammer is on the ground (${h.x}, ${h.y})`);
    assert.deepEqual((await shop(page, (s) => s.hung().map((q) => q.kind))).sort(), ['saw', 'wrench']);
    const unrot = await page.eval((id) => window.__town.scene.view.viewOf(id).body.style.rotate, S.hammer);
    assert.equal(unrot, '', 'upright on the ground');
    await clearRec(page);
    // Back up, let go a bit off the outline (40 right, 30 low).
    await dragFeetAlong(page, S.hammer, line([h.x, h.y], [peg.x + 40, peg.y + 30], 12));
    await page.waitFor(calm);
    h = await ent(page, S.hammer);
    assert.deepEqual([h.x, h.y], [peg.x, peg.y], 'snapped exactly onto its outline');
    const snd = await sounds(page);
    assert.ok(snd.includes('clink'), `a click (${snd})`);
    await page.screenshot('shop-2-hammer-home');
  });

  it('saw a plank on the saw table into two half planks (zzzt, sawdust)', async () => {
    await clearRec(page);
    const p = S.plank;
    const path = [...line([2690, 458], [p.x + 30, p.y - 10], 8)];
    for (let k = 0; k < 6; k++) path.push(...line(k % 2 ? [p.x - 30, p.y - 10] : [p.x + 30, p.y - 10], k % 2 ? [p.x + 30, p.y - 10] : [p.x - 30, p.y - 10], 6));
    path.push(...line([p.x + 30, p.y - 10], [2640, 940], 8));
    await dragFeetAlong(page, S.saw, path);
    await page.waitFor(calm);
    assert.equal(await ent(page, p.id), null, 'the plank is gone');
    const halves = (await ents(page, 'plank-half')).filter((h) => Math.abs(h.x - p.x) < 120 && Math.abs(h.y - p.y) < 1);
    assert.equal(halves.length, 2, 'two half planks on the table');
    S.halves = halves.map((h) => h.id);
    const snd = await sounds(page);
    assert.ok(snd.filter((n) => n === 'zzzt').length >= 4, `zzzt strokes (${snd})`);
    const st = await page.eval(() => window.__town.scene.stats().shop);
    assert.equal(st.cuts, 1);
    await page.screenshot('shop-3-sawn');
  });

  it('tap the drill on (whirr), carry it over a half plank: a bolt, and it is locked', async () => {
    const d = await entPoint(page, S.drill.id);
    await clearRec(page);
    await page.tap(d.x, d.y);
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(S.drill.id)}].props.on === true`);
    assert.ok((await sounds(page)).includes('whirr'));
    await page.waitFor(calm);
    const h = await ent(page, S.halves[0]);
    const dv = await ent(page, S.drill.id);
    // Sweep the drill across the half plank (its bit leads on the left).
    await dragFeetAlong(page, S.drill.id, [...line([dv.x, dv.y], [h.x + 90, h.y - 20], 6), ...line([h.x + 90, h.y - 20], [h.x + 20, h.y + 10], 10), ...line([h.x + 20, h.y + 10], [2790, 686], 6)]);
    await page.waitFor(calm);
    const after = await ent(page, S.halves[0]);
    assert.equal(after.props.bolt, true, 'bolted');
    assert.equal(after.props.locked, true, 'locked');
    const bolt = await page.eval((id) => { const b = window.__town.scene.view.viewOf(id).lift.querySelector('.site-bolt'); return b && b.style.visibility !== 'hidden'; }, S.halves[0]);
    assert.ok(bolt, 'a bolt head shows');
    await page.screenshot('shop-4-bolted');
  });

  it('a dirt pile into the mixer mouth, tap: it spins through its frames; tap again: a cement slab pours out', async () => {
    // A pile by the mixer (set up: the kid shovelled it), then the real part: push it into the mouth.
    await page.eval(() => window.__town.scene.dig.dumpAt(2600, 950, 3));
    await page.waitFor(calm);
    const pile = (await page.eval(() => window.__town.scene.dig.piles())).find((p) => Math.abs(p.x - 2600) < 80);
    assert.ok(pile);
    const mouth = await shop(page, (s) => s.mouth);
    await dragFeetAlong(page, pile.id, line([pile.x, pile.y], [mouth[0], mouth[1] + 10], 14));
    await page.waitFor(calm);
    assert.equal(await ent(page, pile.id), null, 'the pile went in');
    let mx = await shop(page, (s) => s.mixer());
    assert.equal(mx.load, 3);
    await page.eval(() => {
      window.__drum = [];
      const el = window.__town.scene.pieces.el('mixer-drum');
      new MutationObserver(() => { const v = el.dataset.variant; if (window.__drum[window.__drum.length - 1] !== v) window.__drum.push(v); }).observe(el, { attributes: true, attributeFilter: ['data-variant'] });
    });
    await clearRec(page);
    const dp = await piecePoint(page, 'mixer-drum', [0.5, 0.4, 0.6]);
    assert.ok(dp);
    await page.tap(dp.x, dp.y);
    await page.waitFor(calm);
    const seen = await page.eval(() => window.__drum);
    assert.ok(['spin1', 'spin2', 'spin3', 'spin0'].every((f) => seen.includes(f)), `spin frames ${seen}`);
    mx = await shop(page, (s) => s.mixer());
    assert.equal(mx.ready, true, 'cement ready');
    assert.ok((await sounds(page)).includes('rumble'));
    await page.screenshot('shop-5-mixed');
    const slabs0 = (await ents(page, 'cement-slab')).length;
    await page.tap(dp.x, dp.y);
    await page.waitFor(calm);
    const slabs = await ents(page, 'cement-slab');
    assert.equal(slabs.length, slabs0 + 1, 'a slab poured out');
    S.slab = slabs[slabs.length - 1].id;
    const pour = await shop(page, (s) => s.pour);
    assert.ok(Math.abs(slabs[slabs.length - 1].x - pour[0]) < 20, 'at the pour spot');
    mx = await shop(page, (s) => s.mixer());
    assert.equal(mx.load, 0);
    assert.equal(mx.ready, false);
    const grey = await page.eval((id) => window.__town.scene.view.viewOf(id).body.querySelector('img').style.filter, S.slab);
    assert.ok(/grayscale/.test(grey), 'drawn grey');
    await page.screenshot('shop-6-slab');
  });

  it('the cement slab snaps onto the build grid as a foundation piece', async () => {
    // Carried over to the build yard (set up), then dragged onto the deck by finger.
    await page.eval((id) => window.__store.dispatch('move', { id, room: 'construction/yard', x: 700, y: 945, z: 0 }), S.slab);
    await pan(page, 0);
    await dragFeetAlong(page, S.slab, line([700, 945], [560, 870], 12));
    await page.waitFor(calm);
    const placed = await page.eval(() => window.__town.scene.build.placed());
    const p = placed.find((q) => q.id === S.slab);
    assert.ok(p, 'on the grid');
    assert.equal(p.w, 4);
    await page.screenshot('shop-7-slab-on-grid');
  });

  it('seesaw: a plank on a block under its middle tips when a kid stands on one end', async () => {
    // Set up a block with a plank balanced on it, then stand a character on the right end by finger.
    const pl = await page.eval(() => {
      const s = window.__town.scene;
      const g = s.grid;
      const sp = (kind, c, r, w) => { const id = window.__store.newId(); window.__store.dispatch('spawn', { id, kind, room: 'construction/yard', x: g.x0 + (c + w / 2) * g.cell, y: g.y - r * g.cell, z: 1, props: { built: true } }); return id; };
      sp('block-2x1', 7, 0, 2);
      return sp('plank', 6, 1, 4);
    });
    await page.waitFor(calm);
    const ss = (await shop(page, (s) => s.seesaws())).find((q) => q.id === pl);
    assert.ok(ss, 'a seesaw');
    assert.equal(ss.angle, 0);
    const kid = await page.eval(() => Object.values(window.__store.state.entities).find((e) => !e.deleted && e.kind === 'char' && e.room === 'construction/yard' && !e.props.seat).id);
    const k = await ent(page, kid);
    await dragFeetAlong(page, kid, line([k.x, k.y], [ss.x1 - 25, ss.top - 130], 14));
    await page.waitFor(calm);
    const k2 = await ent(page, kid);
    assert.ok(Math.abs(k2.y - ss.top) < 1, `standing on the plank (${k2.y} vs ${ss.top})`);
    const ss2 = (await shop(page, (s) => s.seesaws())).find((q) => q.id === pl);
    assert.equal(ss2.angle, 15, 'tipped down on the right');
    const drawn = await page.eval(([id, kid]) => ({ rot: window.__town.scene.view.viewOf(id).body.style.rotate, drop: window.__town.scene.view.viewOf(kid).lift.style.translate }), [pl, kid]);
    assert.equal(drawn.rot, '15deg');
    assert.ok(/px/.test(drawn.drop), 'the kid goes down with the end');
    await page.screenshot('shop-8-seesaw');
  });

  it('cones: a tap knocks one over and the next falls like a domino; a tap stands it up; the truck knocks them over', async () => {
    await pan(page, 1440);
    const cones = (await ents(page, 'traffic-cone')).sort((a, b) => a.x - b.x);
    const [a, b, c] = cones;
    await clearRec(page);
    const pb = await entPoint(page, b.id);
    await page.tap(pb.x, pb.y);
    await page.waitFor(calm);
    assert.equal((await ent(page, b.id)).props.down, true, 'tapped cone down');
    assert.equal((await ent(page, c.id)).props.down, true, 'the next one fell too (domino)');
    assert.ok(!(await ent(page, a.id)).props.down, 'the one behind stays up');
    assert.ok((await sounds(page)).includes('clunk'), 'clonk');
    const pc = await entPoint(page, b.id);
    await page.tap(pc.x, pc.y);
    await page.waitFor(calm);
    assert.equal((await ent(page, b.id)).props.down, false, 'stood back up');
    await page.screenshot('shop-9-cones');
    // Drive the truck left through a and b.
    await clearRec(page);
    const tb = await piecePoint(page, 'dump-truck', [0.3, 0.5, 0.2, 0.4]);
    const o = await w2s(page, 0, 0), o2 = await w2s(page, -220, 0);
    await page.drag(tb, { x: tb.x + (o2.x - o.x), y: tb.y }, { steps: 16, durationMs: 500 });
    await page.waitFor(calm);
    const tr = await page.eval(() => window.__town.scene.dig.truck());
    assert.ok(tr.dx < -150, `the truck drove (${tr.dx})`);
    assert.equal((await ent(page, a.id)).props.down, true, 'the truck knocked a cone over');
    assert.equal((await ent(page, b.id)).props.down, true, 'and the other one');
    assert.ok((await sounds(page)).includes('clunk'), 'clonk');
    await page.screenshot('shop-10-truck-cones');
  });

  it('the thermos pours a cup of cocoa; a character sips it; the lunchbox opens', async () => {
    await pan(page, 700);
    const th = (await ents(page, 'thermos'))[0];
    const cups0 = (await ents(page, 'cafe-cup')).length;
    await clearRec(page);
    const p = await entPoint(page, th.id);
    await page.tap(p.x, p.y);
    await page.waitFor(calm);
    const cups = await ents(page, 'cafe-cup');
    assert.equal(cups.length, cups0 + 1, 'a new cup');
    const cup = cups.find((q) => !cups0 || q.props.fill === 'cocoa');
    assert.equal(cup.props.fill, 'cocoa');
    assert.ok((await sounds(page)).includes('pour'));
    S.cup = cup.id;
    await page.screenshot('shop-11-cocoa');
    // Give it to the kid on the lunch bench.
    const kid = await page.eval(() => Object.values(window.__store.state.entities).find((e) => !e.deleted && e.kind === 'char' && e.room === 'construction/yard' && e.props.seat === 'bench-1').id);
    const bites0 = await page.eval(() => window.__town.scene.chars.stats().bites);
    const from = await entPoint(page, S.cup);
    const kp = await entPoint(page, kid);
    await page.drag(from, kp, { steps: 12, durationMs: 400 });
    await page.waitFor(() => window.__town.scene.chars.stats().bites > 0);
    const bites = await page.eval(() => window.__town.scene.chars.stats().bites);
    assert.ok(bites > bites0, 'sipped');
    await page.waitFor(calm);
    // The lunchbox.
    const lb = (await ents(page, 'lunchbox'))[0];
    const lp = await entPoint(page, lb.id);
    await page.tap(lp.x, lp.y);
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(lb.id)}].props.open === true`);
    await page.waitFor(calm);
    await page.screenshot('shop-12-lunch');
  });

  it('at rest nothing runs: no frames, no timers', async () => {
    await page.waitFor(calm);
    const r = await page.eval(async () => {
      let n = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (f) => { n++; return raf.call(window, f); };
      const s0 = window.__town.scene.stats();
      await new Promise((ok) => setTimeout(ok, 1200));
      window.requestAnimationFrame = raf;
      const s1 = window.__town.scene.stats();
      return { n, timers: s1.timers, spinning: s1.shop.spinning, strokes: s1.shop.strokes - s0.shop.strokes };
    });
    assert.deepEqual(r, { n: 0, timers: 0, spinning: false, strokes: 0 });
  });

  it('reload: tools, cut planks, the bolt, the slab, cones and the cocoa are all still there', async () => {
    await pan(page, 1440);
    const snap = () => page.eval(() => {
      const st = window.__store.state.entities;
      const pick = (k) => Object.values(st).filter((e) => !e.deleted && e.kind === k && e.room === 'construction/yard').map((e) => [e.id, e.x, e.y, JSON.stringify(e.props)]).sort();
      return { hung: window.__town.scene.shop.hung().map((h) => h.id).sort(), halves: pick('plank-half'), slabs: pick('cement-slab'), cones: pick('traffic-cone'), cups: pick('cafe-cup'), drills: pick('drill'), mixer: window.__town.scene.shop.mixer() };
    });
    const before = await snap();
    await page.goto('index.html');
    await record(page);
    await page.waitFor(() => window.__town && window.__town.at === 'construction/yard' && !window.__town.busy && window.__town.scene.shop);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    const after = await snap();
    assert.deepEqual(after, before);
    const bolt = await page.eval((id) => { const v = window.__town.scene.view.viewOf(id); const b = v && v.lift.querySelector('.site-bolt'); return !!b && b.style.visibility !== 'hidden'; }, S.halves[0]);
    assert.ok(bolt, 'the bolt still shows');
    const rot = await page.eval((id) => window.__town.scene.view.viewOf(id).body.style.rotate, S.hammer);
    assert.equal(rot, '24deg', 'the hammer still hangs turned to its outline');
    assert.deepEqual(page.externalRequests(), []);
    assert.deepEqual(page.errors, []);
    await page.screenshot('shop-13-after-reload');
  });
});
