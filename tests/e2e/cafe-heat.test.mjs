// End-to-end: cafe heat (P2a.3) with real (trusted) touches on the iPad
// Air: the pan onto burner 1, an egg cracked into it, the knob turned: raw
// -> fried (and the burner turned off: it stops) -> extra toasty; a bowl of
// batter poured into the pan makes a pancake, which flips on a tap and on an
// upward flick; the saucepan filled at the sink, on burner 2 with pasta: it
// boils, the pasta cooks, the ladle scoops spaghetti into a bowl; hot
// spaghetti fed to the chef: "hot hot hot!"; raw cookie dough on the tray in
// the oven with the door shut: it glows, opening the door mid-bake pauses
// it, then a ding, the door pops open, cookies; a reload mid-cook resumes
// from the saved heat clock; and with nothing on heat the heat loop has no
// timers and asks for no animation frames.
//
// The step times are tuned shorter here (heat.tune) so the test runs fast;
// the reload check runs at the shipped 3 s step.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const TUNE = { stepMs: 1500, ovenMs: 2500, warmMs: 5000 };

async function record(page) {
  await page.eval(async () => {
    const rec = window.__rec = { sounds: [], fx: [] };
    const { sfx } = await import('./src/audio/index.js');
    const play = sfx.play;
    sfx.play = (name, opts) => { rec.sounds.push(name); return play(name, opts); };
    const fx = window.__town.scene.fx;
    const burst = fx.burst;
    fx.burst = (type, ...rest) => { rec.fx.push(type); return burst(type, ...rest); };
  });
}
const clearRec = (page) => page.eval(() => { window.__rec.sounds.length = 0; window.__rec.fx.length = 0; });
const until = (page, fn, arg, opts) => page.waitFor(`(${fn})(${JSON.stringify(arg)})`, opts);
const E = (page, id) => page.eval((id) => window.__store.state.entities[id] || null, id);
const byKind = (page, kind) => page.eval((kind) => Object.values(window.__store.state.entities)
  .filter((e) => e.kind === kind && !e.deleted && !e.props.from).map((e) => e.id).sort(), kind);
const kidsOf = (page, id) => page.eval((id) => Object.values(window.__store.state.entities)
  .filter((e) => e.parent === id && !e.deleted).map((e) => ({ id: e.id, kind: e.kind, props: e.props })), id);
const lookOf = (page, id) => page.eval((id) => window.__town.scene.view.viewOf(id).sprite.look, id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const panTo = async (page, x) => {
  await page.eval((x) => window.__stage.camera.panTo(x), x);
  await page.waitFor(() => !window.__stage.camera.moving);
  await page.frames(3);
};
const settled = (page, id) => until(page, (id) => { const v = window.__town.scene.view.viewOf(id); return v && !v.held && (!v.posAnim || v.posAnim.playState === 'finished'); }, id);

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
const centerOf = (page, id, fy = 0.5, dx = 0) => page.eval(([id, fy, dx]) => {
  const r = window.__town.scene.view.viewOf(id).el.getBoundingClientRect();
  return { x: r.left + r.width / 2 + dx, y: r.top + r.height * fy };
}, [id, fy, dx]);
const screenOf = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
const piecePoint = (page, pid, fys = null) => page.eval(([pid, fys]) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fys || fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, [pid, fys]);
const tapPiece = async (page, pid, fys) => { const p = await piecePoint(page, pid, fys); assert.ok(p, pid + ' is touchable'); await page.tap(p.x, p.y); };

const drag = (page, from, to) => page.drag(from, to, { steps: 14, durationMs: 280 });
/** Raw touch path along screen points (16ms a step). */
async function path(page, pts, { dt = 16 } = {}) {
  const g = page.gesture();
  const P = (p) => [{ x: p.x, y: p.y, id: 0, radiusX: 11, radiusY: 11, force: 1 }];
  let t = 0;
  await g('touchStart', P(pts[0]), t);
  for (const p of pts.slice(1)) { t += dt; await g('touchMove', P(p), t); await page.frames(1); }
  await g('touchEnd', [], t + 16);
  await page.frames(2);
}

/** Drag entity `id` so its feet land at world (tx, ty) (dropped a little above, it settles). */
async function carry(page, id, tx, ty) {
  const from = await entPoint(page, id);
  assert.ok(from, id + ' is touchable');
  const to = await page.eval(([id, fx, fy, tx, ty]) => {
    const v = window.__town.scene.view.viewOf(id);
    const f = window.__stage.screenToWorld(fx, fy);
    return window.__stage.worldToScreen(tx + (f.x - v.x), ty + (f.y - v.y));
  }, [id, from.x, from.y, tx, ty]);
  await drag(page, from, to);
  await page.frames(2);
  await settled(page, id);
}

/** A new clone out of the first spawner of `stockKind`, dropped with the finger at `to`. */
async function pullOut(page, stockKind, to) {
  const [stock] = await page.eval((k) => Object.values(window.__store.state.entities).filter((e) => e.kind === k && !e.deleted).map((e) => e.id), stockKind);
  const before = new Set(await page.eval(() => Object.keys(window.__store.state.entities)));
  await drag(page, await entPoint(page, stock), to);
  await page.frames(2);
  const made = (await page.eval(() => Object.keys(window.__store.state.entities))).filter((id) => !before.has(id));
  assert.equal(made.length, 1, `one new thing out of ${stockKind}`);
  return made[0];
}

/** Setup (not the thing under test): a bowl of done plain batter in the mixing bowl. */
const makeBatter = (page, bowl) => page.eval((bowl) => {
  const s = window.__store;
  for (const [i, kind] of ['flour', 'milk', 'egg'].entries()) {
    s.dispatch('spawn', { id: s.newId(), kind, parent: bowl, slot: 's' + i, props: { stir: 6, ...(kind === 'egg' ? { cracked: 1 } : {}) } });
  }
  s.dispatch('set', { id: bowl, path: 'props.batter', value: 'plain' });
  s.dispatch('set', { id: bowl, path: 'props.dirty', value: 0 });
}, bowl);

describe('cafe heat (ipad-air, landscape, touch)', () => {
  let page;
  const W = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    const door = await page.eval(() => {
      const p = window.__town.manifest.map.pieces['cafe-door'];
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('cafe-door', 0.5);
    });
    await page.tap(door.x, door.y);
    await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
    await record(page);
    await page.eval((t) => window.__town.scene.heat.tune(t), TUNE);
    W.pan = (await byKind(page, 'pan'))[0];
    W.pot = (await byKind(page, 'saucepan'))[0];
    W.tray = (await byKind(page, 'baking-tray'))[0];
    W.bowl = (await byKind(page, 'mixing-bowl'))[0];
    W.ladle = (await byKind(page, 'ladle'))[0];
    W.egg = (await byKind(page, 'egg'))[0];
    await panTo(page, 0);
  });
  after(async () => { if (page) await page.close(); });

  it('nothing on heat: no heat timers, no animation frames', async () => {
    const s = await page.eval(() => window.__town.scene.heat.stats());
    assert.equal(s.heated, 0);
    assert.equal(s.timers, 0, 'no timers');
    const frames = await page.eval(async () => {
      let n = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (fn) => { n++; return raf(fn); };
      await new Promise((r) => setTimeout(r, 1200));
      window.requestAnimationFrame = raf;
      return n;
    });
    assert.equal(frames, 0, 'nobody asks for animation frames');
  });

  it('stove: an egg in the pan on a lit burner: raw -> fried; off: it stops; on again: extra toasty', async () => {
    assert.ok(W.pan && W.egg && W.ladle, 'the pan, an egg and the ladle are in the kitchen');
    // The pan onto burner 1 (its bowl over the burner; the handle sticks out right).
    await carry(page, W.pan, 1001, 494);
    const pan = await E(page, W.pan);
    assert.equal(pan.y, 504, 'on the stovetop');
    // The egg from the island into the pan: it cracks in.
    await drag(page, await entPoint(page, W.egg), await centerOf(page, W.pan, 0.3, -20));
    await until(page, ([e, p]) => window.__store.state.entities[e].parent === p, [W.egg, W.pan]);
    assert.equal((await E(page, W.egg)).props.cracked, 1);
    await page.screenshot('heat-1-raw-egg-in-pan');
    // Not lit yet: nothing heats.
    assert.equal((await page.eval(() => window.__town.scene.heat.stats())).heated, 0);
    await clearRec(page);
    await tapPiece(page, 'knob-1');
    await page.waitFor(() => window.__town.scene.pieces.state('burner-1') === 'on');
    await until(page, (p) => window.__store.state.entities[p].props.heatAt > 0, W.pan);
    assert.deepEqual((await page.eval(() => window.__town.scene.heat.heated())).map((h) => h.burner), ['burner-1']);
    const raw = await page.eval((e) => window.__town.scene.view.viewOf(e).sprite, W.egg);
    assert.equal(raw.look, 'fried');
    assert.match(raw.filter || '', /opacity/, 'raw: the pale, glossy yolk');
    // One step: fried.
    await until(page, (e) => (window.__store.state.entities[e].props.cooked | 0) >= 1, W.egg, { timeout: 8000 });
    const fried = await page.eval((e) => window.__town.scene.view.viewOf(e).sprite, W.egg);
    assert.equal(fried.look, 'fried');
    assert.ok(!fried.filter, 'cooked: no raw filter');
    assert.equal((await E(page, W.egg)).props.method, 'fried');
    await page.waitFor(() => window.__rec.fx.includes('steam'));
    const rec = await page.eval(() => window.__rec);
    assert.ok(rec.sounds.includes('sizzle'), 'sizzle');
    assert.ok(rec.fx.includes('bit'), 'spatter');
    await page.screenshot('heat-2-fried');
    // Off: it stops at fried.
    await tapPiece(page, 'knob-1');
    await until(page, (p) => !window.__store.state.entities[p].props.heatAt, W.pan);
    const c1 = (await E(page, W.egg)).props.cooked;
    await sleep(TUNE.stepMs * 2.2);
    assert.equal((await E(page, W.egg)).props.cooked, c1, 'no cooking with the burner off');
    assert.equal((await page.eval(() => window.__town.scene.heat.stats())).stepTimer, false, 'no step timer');
    // On again: on to extra toasty (and there it stops: never burnt).
    await tapPiece(page, 'knob-1');
    await until(page, (e) => (window.__store.state.entities[e].props.cooked | 0) >= 3, W.egg, { timeout: 12000 });
    assert.equal(await lookOf(page, W.egg), 'toasty');
    await page.screenshot('heat-3-toasty');
    await sleep(TUNE.stepMs * 1.5);
    assert.ok((await E(page, W.egg)).props.cooked >= 3);
    assert.equal(await page.eval((e) => window.__town.scene.behaviors.lookOf(window.__store.state.entities[e]), W.egg), 'toasty');
  });

  it('pancake: batter poured into the pan makes a pancake; a tap flips it, and so does a flick', async () => {
    // Out with the egg (a drag onto the island).
    await carry(page, W.egg, 700, 620);
    assert.equal((await E(page, W.egg)).parent, null);
    await makeBatter(page, W.bowl);
    await page.frames(2);
    const bowl0 = await E(page, W.bowl);
    await clearRec(page);
    await drag(page, await entPoint(page, W.bowl), await centerOf(page, W.pan, 0.3, -20));
    const [cake] = await until(page, (p) => { const k = Object.values(window.__store.state.entities).filter((e) => e.parent === p && !e.deleted); return k.length === 1 && k[0].kind === 'pancake' && k.map((e) => e.id); }, W.pan);
    W.pancake = cake;
    assert.deepEqual(await kidsOf(page, W.bowl), [], 'the batter left the bowl');
    await settled(page, W.bowl);
    const bowl1 = await E(page, W.bowl);
    assert.deepEqual([bowl1.x, bowl1.y], [bowl0.x, bowl0.y], 'the bowl went back');
    assert.equal(bowl1.props.dirty, 1, 'batter-smeared');
    assert.ok((await page.eval(() => window.__rec.sounds)).includes('pour'));
    await page.screenshot('heat-4-pancake-batter');
    await until(page, (id) => (window.__store.state.entities[id].props.cooked | 0) >= 1, cake, { timeout: 8000 });
    assert.equal(await lookOf(page, cake), 'cooked');
    // A tap on the pan: the pancake tosses up and spins over.
    const pp = await entPoint(page, W.pan);
    await page.tap(pp.x, pp.y);
    await until(page, (id) => (window.__store.state.entities[id].props.flips | 0) === 1, cake);
    const midFlip = await page.eval((id) => window.__town.scene.view.viewOf(id).body.getAnimations().length, cake);
    assert.ok(midFlip >= 1, 'it is in the air');
    await sleep(300);
    await page.screenshot('heat-5-flip');
    assert.ok((await page.eval(() => window.__rec.sounds)).includes('whoosh'));
    await sleep(700);
    // A flick upward: grab the pan and throw it up fast, let go.
    const f = await entPoint(page, W.pan);
    const g = page.gesture();
    const P = (x, y) => [{ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 }];
    await g('touchStart', P(f.x, f.y), 0);
    for (let i = 1; i <= 6; i++) await g('touchMove', P(f.x, f.y - i * 16), i * 12);
    await g('touchEnd', [], 84);
    await until(page, (id) => (window.__store.state.entities[id].props.flips | 0) === 2, cake);
    await settled(page, W.pan);
    assert.equal((await E(page, W.pan)).y, 504, 'the pan lands back on the stove');
    assert.equal((await E(page, cake)).parent, W.pan, 'the pancake lands back in the pan');
    // Burner 1 off again.
    await tapPiece(page, 'knob-1');
    await until(page, (p) => !window.__store.state.entities[p].props.heatAt, W.pan);
  });

  it('boil: the saucepan filled at the sink, pasta, burner 2: boils; the ladle serves spaghetti into a bowl', async () => {
    const sink = await page.eval(() => window.__town.scene.prep.stations()['station-sink']);
    await drag(page, await entPoint(page, W.pot), await centerOf(page, sink));
    await until(page, (p) => window.__store.state.entities[p].props.water === 1, W.pot);
    await settled(page, W.pot);
    assert.equal(await lookOf(page, W.pot), 'water');
    // Out of the sink onto burner 2.
    await carry(page, W.pot, 1085, 494);
    assert.equal((await E(page, W.pot)).y, 504);
    W.pasta = await pullOut(page, 'pantry-pasta', await centerOf(page, W.pot, 0.3, -20));
    assert.equal((await E(page, W.pasta)).parent, W.pot, 'pasta in the pot');
    await clearRec(page);
    await tapPiece(page, 'knob-2');
    await until(page, (p) => window.__store.state.entities[p].props.heatAt > 0, W.pot);
    await until(page, (p) => window.__town.scene.view.viewOf(p).sprite.look === 'boiling', W.pot);
    await page.waitFor(() => window.__rec.fx.includes('bubble'));
    await page.screenshot('heat-6-boiling');
    await until(page, (id) => (window.__store.state.entities[id].props.cooked | 0) >= 1, W.pasta, { timeout: 8000 });
    await until(page, (p) => window.__town.scene.view.viewOf(p).sprite.look === 'pasta', W.pot);
    assert.equal((await E(page, W.pasta)).props.method, 'boiled');
    await page.screenshot('heat-7-pasta');
    // A clean bowl on the island (setup), then the ladle: dip it in the pot, drop it on the bowl.
    W.dishBowl = await page.eval(() => { const s = window.__store; const id = s.newId(); s.dispatch('spawn', { id, kind: 'bowl', room: 'cafe/kitchen', x: 560, y: 630 }); return id; });
    await page.frames(3);
    const from = await entPoint(page, W.ladle);
    const pot = await centerOf(page, W.pot, 0.3, -10);
    const bowl = await centerOf(page, W.dishBowl, 0.3);
    const pts = [from];
    for (let i = 1; i <= 10; i++) pts.push({ x: from.x + (pot.x - from.x) * i / 10, y: from.y + (pot.y - from.y) * i / 10 });
    for (let i = 0; i < 4; i++) pts.push({ x: pot.x + (i % 2 ? 6 : -6), y: pot.y + 4 });
    for (let i = 1; i <= 14; i++) pts.push({ x: pot.x + (bowl.x - pot.x) * i / 14, y: pot.y + (bowl.y - pot.y) * i / 14 - Math.sin(i / 14 * Math.PI) * 60 });
    await path(page, pts, { dt: 20 });
    const [spag] = await page.waitFor(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'spaghetti' && !e.deleted).map((e) => e.id));
    W.spag = spag;
    const s = await E(page, spag);
    assert.deepEqual([s.x, s.y], [560, 630], 'served where the bowl was');
    assert.ok(s.props.hotAt > 0, 'hot');
    assert.equal((await E(page, W.dishBowl)).deleted, true, 'the bowl became the dish');
    assert.equal((await E(page, W.pasta)).deleted, true, 'the pasta was scooped out');
    assert.equal((await E(page, W.ladle)).props.fill, 'empty');
    assert.equal(await lookOf(page, W.pot), 'boiling', 'hot water left in the pot');
    await page.screenshot('heat-8-spaghetti');
    await tapPiece(page, 'knob-2');
    await until(page, (p) => !window.__store.state.entities[p].props.heatAt, W.pot);
  });

  it('hot food at a character\'s mouth: "hot hot hot!", fanning, then yum', async () => {
    const chef = await page.eval(() => {
      const e = Object.values(window.__store.state.entities).find((q) => q.kind === 'char' && q.props.seat === 'island-stool-2');
      return e && { id: e.id, mouth: window.__town.scene.chars.inspect(e.id).anchors.mouth };
    });
    assert.ok(chef, 'the chef at the island');
    assert.equal(await page.eval((id) => window.__town.scene.heat.isHot(window.__store.state.entities[id]), W.spag), true);
    await drag(page, await entPoint(page, W.spag), await screenOf(page, chef.mouth.x, chef.mouth.y));
    await page.waitFor(() => window.__town.scene.chars.stats().lastTaste === 'hot');
    await page.waitFor(`window.__town.scene.chars.inspect(${JSON.stringify(chef.id)}).atoms.extras === 'sweat'`);
    await page.screenshot('heat-9-hot-hot-hot');
    await page.waitFor(`window.__town.scene.chars.inspect(${JSON.stringify(chef.id)}).shown === 'yum'`, { timeout: 6000 });
  });

  it('oven: raw cookies on the tray, door shut: it glows; open mid-bake pauses; then a ding, the door pops open: cookies', async () => {
    // Batter poured on the tray: raw cookie dough.
    await makeBatter(page, W.bowl);
    await page.frames(2);
    await drag(page, await entPoint(page, W.bowl), await centerOf(page, W.tray, 0.2));
    await until(page, (t) => window.__store.state.entities[t].props.dough === 'plain', W.tray);
    assert.equal(await lookOf(page, W.tray), 'raw');
    // Open the oven, the tray onto the rack, shut the door.
    await tapPiece(page, 'oven-door');
    await page.waitFor(() => window.__town.scene.pieces.state('oven-door') === 'open');
    await page.frames(3);
    await carry(page, W.tray, 1029, 640);
    assert.equal((await E(page, W.tray)).y, 651, 'on the oven rack');
    await page.screenshot('heat-10-tray-in-oven');
    await clearRec(page);
    await tapPiece(page, 'oven-door', [0.92, 0.85]);   // the open door's flap (the tray is in front of the oven's middle)
    await page.waitFor(() => window.__town.scene.pieces.shown('oven-door') === 'closedOn');
    await until(page, (t) => window.__store.state.entities[t].props.heatAt > 0, W.tray);
    await page.screenshot('heat-11-oven-glow');
    // Open it about halfway: it pauses with the progress banked.
    await sleep(TUNE.ovenMs * 0.45);
    await tapPiece(page, 'oven-door');
    await until(page, (t) => !window.__store.state.entities[t].props.heatAt, W.tray);
    const banked = (await E(page, W.tray)).props.heatMs;
    assert.ok(banked > 300 && banked < TUNE.ovenMs, 'progress banked: ' + banked);
    await sleep(TUNE.ovenMs * 1.2);
    assert.ok(!(await E(page, W.tray)).props.cooked, 'no baking with the door open');
    assert.equal(await lookOf(page, W.tray), 'raw');
    // Shut again: it finishes the rest (less than a full bake), then DING.
    await tapPiece(page, 'oven-door', [0.92, 0.85]);
    const t0 = Date.now();
    await until(page, (t) => (window.__store.state.entities[t].props.cooked | 0) >= 1, W.tray, { timeout: 8000 });
    assert.ok(Date.now() - t0 < TUNE.ovenMs + 600, 'resumed, not restarted');
    await page.waitFor(() => window.__rec.sounds.includes('ding'));
    await page.waitFor(() => window.__town.scene.pieces.state('oven-door') === 'open');
    await settled(page, W.tray);
    assert.equal(await lookOf(page, W.tray), 'cookies');
    assert.equal((await E(page, W.tray)).props.method, 'baked');
    await page.screenshot('heat-12-cookies');
    // Tap the tray: the cookies come off onto a free spot, warm.
    await clearRec(page);
    const tp = await entPoint(page, W.tray);
    await page.tap(tp.x, tp.y);
    const [cookies] = await page.waitFor(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'cookies' && !e.deleted && e.props.method === 'baked').map((e) => e.id));
    assert.ok((await E(page, cookies)).props.hotAt > 0, 'warm cookies');
    assert.equal(await lookOf(page, W.tray), 'empty');
    await page.waitFor(() => window.__rec.fx.includes('steam'), { timeout: 4000 });
    await page.screenshot('heat-13-cookies-out');
  });

  it('with nothing on heat and nothing warm any more: no heat timers, no animation frames', async () => {
    await page.waitFor(() => window.__town.scene.heat.stats().timers === 0, { timeout: TUNE.warmMs + 5000 });
    const frames = await page.eval(async () => {
      let n = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (fn) => { n++; return raf(fn); };
      await new Promise((r) => setTimeout(r, 1200));
      window.requestAnimationFrame = raf;
      return n;
    });
    assert.equal(frames, 0);
    assert.equal((await page.eval(() => window.__town.scene.heat.stats())).timers, 0);
  });

  it('a reload mid-cook resumes from the saved heat clock (shipped 3 s step)', async () => {
    // A fresh egg from the pantry into the pan, burner 1 on.
    const egg = await pullOut(page, 'pantry-egg', await centerOf(page, W.pan, 0.3, -20));
    assert.equal((await E(page, egg)).parent, W.pan);
    await page.eval(() => window.__town.scene.heat.tune({ stepMs: 3000, ovenMs: 5000, warmMs: 20000 }));
    await tapPiece(page, 'knob-1');
    await until(page, (p) => window.__store.state.entities[p].props.heatAt > 0, W.pan);
    const heatAt = (await E(page, W.pan)).props.heatAt;
    await sleep(1200);
    assert.equal((await E(page, egg)).props.cooked, undefined, 'still raw');
    await page.goto('index.html');
    await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy && window.__town.scene.heat);
    // Stamp the moment the egg cooks in the page itself, so a slow poll (a
    // loaded machine) doesn't count as a slow cook.
    const ready = await page.eval((egg) => {
      const cooked = () => ((window.__store.state.entities[egg] || { props: {} }).props.cooked | 0) >= 1;
      const r = { at: Date.now(), cooked: cooked() };
      window.__cookedAt = r.cooked ? r.at : 0;
      if (!r.cooked) {
        const off = window.__store.subscribe(() => { if (!window.__cookedAt && cooked()) { window.__cookedAt = Date.now(); off(); } });
      }
      return r;
    }, egg);
    const pan = await E(page, W.pan);
    assert.equal(pan.props.heatAt, heatAt, 'the same heat clock, not restarted');
    assert.deepEqual((await page.eval(() => window.__town.scene.heat.heated())).map((h) => h.id), [W.pan]);
    await until(page, () => window.__cookedAt > 0, null, { timeout: 8000 });
    const at = await page.eval(() => window.__cookedAt);
    if (ready.cooked) {
      // The reload itself took longer than the step: it cooked on arrival
      // because its ORIGINAL clock had run out (a restarted clock would wait a full step).
      assert.ok(ready.at - heatAt >= 3000 - 250, 'cooked on arrival only because the original step had passed: ' + (ready.at - heatAt));
    } else {
      assert.ok(at - heatAt < 3000 + 1800, 'cooked about one step after the ORIGINAL start: ' + (at - heatAt));
    }
    await page.screenshot('heat-14-after-reload');
    await tapPiece(page, 'knob-1');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
