// End-to-end: cafe prep (P2a.2) on the iPad Air and the old 9.7" iPad Pro,
// every flow with real (trusted) touches: drop a tomato on the cutting board
// and drag the knife across it (whole -> sliced -> chopped); peel a potato
// with a tap; drag an egg out of the pantry onto the mixing bowl (it cracks
// in); add flour and milk and whisk it round (the batter blends in stages to
// plain batter, a "done" puff); strawberries, a banana and milk into the
// blender, tap (whirr, the jug turns pink), drop a glass on it (a pink
// smoothie pours); eat a burger at a table (a dirty plate) and wash it in the
// sink (clean); bread in the toaster (POP: toast); a cup under the coffee
// machine fills. Then reload: every state is still there.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const VIEWS = ['ipad-air', 'ipad-pro-9.7'];

async function record(page) {
  await page.eval(async () => {
    if (window.__rec) return;
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

/** page.waitFor for a function of one JSON argument. */
const until = (page, fn, arg, opts) => page.waitFor(`(${fn})(${JSON.stringify(arg)})`, opts);
const E = (page, id) => page.eval((id) => window.__store.state.entities[id] || null, id);
const byKind = (page, kind) => page.eval((kind) => Object.values(window.__store.state.entities)
  .filter((e) => e.kind === kind && !e.deleted).map((e) => e.id).sort(), kind);
const kidsOf = (page, id) => page.eval((id) => Object.values(window.__store.state.entities)
  .filter((e) => e.parent === id && !e.deleted).map((e) => ({ id: e.id, kind: e.kind, props: e.props })), id);
const panTo = async (page, x) => {
  await page.eval((x) => window.__stage.camera.panTo(x), x);
  await page.waitFor(() => !window.__stage.camera.moving);
  await page.frames(3);
};

/** A screen point where a touch picks entity `id` (nearest its centre). */
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
/** The screen centre of an entity's drawn box (a drop target: the finger ends here). */
const centerOf = (page, id, fy = 0.5) => page.eval(([id, fy]) => {
  const r = window.__town.scene.view.viewOf(id).el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * fy };
}, [id, fy]);
const screenOf = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);

/** A screen point where a touch picks piece `pid`. */
const piecePoint = (page, pid) => page.eval((pid) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 90 || y < 90 || x > innerWidth - 90) continue;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, pid);

/** Drag from a screen point along screen points (a raw gesture, 16ms a step). */
async function path(page, pts, { dt = 16, hold = 0 } = {}) {
  const g = page.gesture();
  const P = (p) => [{ x: p.x, y: p.y, id: 0, radiusX: 11, radiusY: 11, force: 1 }];
  let t = 0;
  await g('touchStart', P(pts[0]), t);
  t += hold;
  for (const p of pts.slice(1)) { t += dt; await g('touchMove', P(p), t); await page.frames(1); }
  await g('touchEnd', [], t + 16);
  await page.frames(2);
}
/** Drag (a straight line) from a screen point to another. */
const drag = (page, from, to) => page.drag(from, to, { steps: 14, durationMs: 280 });

/** A new clone out of the first spawner of `stockKind`, dropped with the finger at `to`. Returns its id. */
async function pullOut(page, stockKind, to) {
  const [stock] = await byKind(page, stockKind);
  const before = new Set(await page.eval(() => Object.keys(window.__store.state.entities)));
  const from = await entPoint(page, stock);
  assert.ok(from, `${stockKind} is touchable`);
  await drag(page, from, to);
  await page.frames(2);
  const ids = await page.eval(() => Object.keys(window.__store.state.entities));
  const made = ids.filter((id) => !before.has(id));
  assert.equal(made.length, 1, `one new thing out of ${stockKind}`);
  return made[0];
}

for (const name of VIEWS) {
  describe(`cafe prep (${name}, landscape, touch)`, () => {
    let page;
    const W = {};    // ids across the flows
    before(async () => {
      page = await openPage({ viewport: name });
      const door = await page.eval(() => {
        const p = window.__town.manifest.map.pieces['cafe-door'];
        window.__stage.camera.panTo(p.x + p.w / 2 - 720);
        return window.__town.scene.screenPoint('cafe-door', 0.5);
      });
      await page.tap(door.x, door.y);
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
      await record(page);
      W.st = await page.eval(() => window.__town.scene.prep.stations());
      W.bowl = (await byKind(page, 'mixing-bowl'))[0];
      W.fixtures = await page.eval(() => window.__town.scene.fixtures().id);
    });
    after(async () => { if (page) await page.close(); });

    it('has a station over the blender, the toaster and the sink', () => {
      for (const k of ['station-blender', 'station-toaster', 'station-sink']) assert.ok(W.st[k], k);
    });

    it('chop: a tomato on the cutting board, the knife dragged across it: whole -> sliced -> chopped', async () => {
      await panTo(page, 300);
      const [tomato] = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'tomato' && !e.deleted && !e.props.from).map((e) => e.id));
      W.tomato = tomato;
      // Onto the board, left of the knife.
      await drag(page, await entPoint(page, tomato), await screenOf(page, 805, 470));
      await until(page, (id) => Math.abs(window.__store.state.entities[id].y - 492.8) < 1, tomato);
      const [knife] = await byKind(page, 'knife');
      const from = await entPoint(page, knife);
      assert.ok(from, 'the knife is touchable');
      // Where the finger must be for the knife's blade to be at a world point.
      const geo = await page.eval(([k, t, fx, fy]) => {
        const v = window.__town.scene.view.viewOf(k);
        const f = window.__stage.screenToWorld(fx, fy);
        const blade = { x: v.x - v.sprite.w * v.scale * 0.2, y: v.y - v.sprite.h * v.scale * 0.5 };
        const tv = window.__town.scene.view.viewOf(t);
        return { off: { x: f.x - blade.x, y: f.y - blade.y }, tx: tv.x, ty: tv.y - tv.sprite.h * tv.scale * 0.5 };
      }, [knife, tomato, from.x, from.y]);
      const at = (wx, wy) => screenOf(page, wx + geo.off.x, wy + geo.off.y);
      await clearRec(page);
      // Up above it, then three chops down through it (sawing up and down).
      const pts = [from];
      const up = geo.ty - 110;
      for (let i = 0; i <= 5; i++) pts.push(await at(geo.tx + 60 - i * 12, up + i * 4));
      for (let c = 0; c < 3; c++) {
        for (let i = 1; i <= 5; i++) pts.push(await at(geo.tx + 4 * c, up + (geo.ty - up) * (i / 5)));
        for (let i = 1; i <= 5; i++) pts.push(await at(geo.tx + 4 * c, geo.ty - (geo.ty - up) * (i / 5)));
      }
      await path(page, pts, { dt: 24 });
      await until(page, (id) => (window.__store.state.entities[id].props.cut | 0) >= 2, tomato);
      const t = await E(page, tomato);
      assert.equal(await page.eval((id) => window.__town.scene.behaviors.lookOf(window.__store.state.entities[id]), tomato), 'chopped');
      assert.equal(await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.overlays.length, tomato), 4, 'a heap of little pieces');
      assert.ok(t.props.cut >= 2);
      const rec = await page.eval(() => window.__rec);
      assert.ok(rec.sounds.filter((s) => s === 'chop').length >= 2, 'a chop sound per cut');
      assert.ok(rec.fx.includes('bit'), 'bits fly');
      assert.ok(rec.fx.includes('sparkle'), 'a sparkle when it is all chopped');
      await page.screenshot(`prep-${name}-1-chopped`);
    });

    it('peel: a potato out of the pantry basket, tapped: peeled (the peel flies off)', async () => {
      await panTo(page, 0);
      const potato = await pullOut(page, 'pantry-potato', await screenOf(page, 1000, 880));
      W.potato = potato;
      await until(page, (id) => !window.__town.scene.view.viewOf(id).posAnim || window.__town.scene.view.viewOf(id).posAnim.playState === 'finished', potato);
      await clearRec(page);
      const p = await entPoint(page, potato);
      await page.tap(p.x, p.y);
      await until(page, (id) => window.__store.state.entities[id].props.peeled === 1, potato);
      assert.equal(await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.look, potato), 'peeled');
      assert.ok((await page.eval(() => window.__rec.fx)).includes('bit'));
    });

    it('crack: an egg dragged out of the pantry onto the mixing bowl cracks on the rim and plops in', async () => {
      await panTo(page, 0);
      await clearRec(page);
      const egg = await pullOut(page, 'pantry-egg', await centerOf(page, W.bowl, 0.3));
      W.egg = egg;
      const e = await E(page, egg);
      assert.equal(e.parent, W.bowl, 'in the bowl');
      assert.equal(e.props.cracked, 1, 'cracked');
      const rec = await page.eval(() => window.__rec);
      assert.ok(rec.sounds.includes('crack'));
      assert.equal(await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.look, egg), 'fried', 'a yolk in the bowl');
      await page.screenshot(`prep-${name}-2-egg-in-bowl`);
    });

    it('mix: flour and milk in too, then the whisk round and round: the batter blends in stages to plain batter', async () => {
      await panTo(page, 0);
      W.flour = await pullOut(page, 'pantry-flour', await centerOf(page, W.bowl, 0.3));
      // Milk from the fridge.
      const door = await piecePoint(page, 'fridge-door');
      await page.tap(door.x, door.y);
      await page.waitFor(() => window.__town.scene.pieces.state('fridge-door') === 'open' && window.__town.scene.hidden().length === 0);
      await page.frames(3);
      W.milk = await pullOut(page, 'fridge-milk', await centerOf(page, W.bowl, 0.3));
      const kids = await kidsOf(page, W.bowl);
      assert.deepEqual(kids.map((k) => k.kind).sort(), ['egg', 'flour', 'milk']);
      await page.screenshot(`prep-${name}-3-bowl-heap`);
      // The whisk: from the window sill to the bowl, then circles over it.
      const [whisk] = await byKind(page, 'whisk');
      const from = await entPoint(page, whisk);
      const c = await page.eval((b) => { const v = window.__town.scene.view.viewOf(b); return { x: v.x, y: v.y - v.sprite.h * v.scale * 0.5 }; }, W.bowl);
      await clearRec(page);
      const circle = async (turns, r = 70) => {
        const pts = [];
        for (let i = 0; i <= turns * 16 + 2; i++) {
          const a = (i / 16) * Math.PI * 2;
          pts.push(await screenOf(page, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.6));
        }
        // Then put the whisk down on the floor (over the bowl, the chef would take it).
        pts.push(await screenOf(page, 1000, 860));
        return pts;
      };
      // One circle first: part-mixed (the stir stage shows).
      await path(page, [from, ...(await circle(1))], { dt: 20 });
      const mid = await kidsOf(page, W.bowl);
      assert.ok(mid.every((k) => (k.props.stir | 0) >= 1 && (k.props.stir | 0) < 6), 'part mixed: ' + JSON.stringify(mid.map((k) => k.props.stir)));
      const midSprite = await page.eval((b) => window.__town.scene.view.viewOf(b).sprite, W.bowl);
      assert.equal(midSprite.look, 'mixing', 'the batter shows while mixing');
      assert.equal(midSprite.overlays.length, 1);
      await page.screenshot(`prep-${name}-4-mixing`);
      // More circles with the whisk (picked up where it rests now).
      const [w2] = await byKind(page, 'whisk');
      await path(page, [await entPoint(page, w2), ...(await circle(3))], { dt: 20 });
      await until(page, (b) => window.__store.state.entities[b].props.batter === 'plain', W.bowl);
      const done = await kidsOf(page, W.bowl);
      assert.ok(done.every((k) => k.props.stir >= 6), 'all mixed in');
      assert.equal(await page.eval((b) => window.__town.scene.view.viewOf(b).sprite.look, W.bowl), 'batter');
      const rec = await page.eval(() => window.__rec);
      assert.ok(rec.sounds.filter((s) => s === 'whisk').length >= 6, 'a whisk sound per stir step');
      assert.ok(rec.fx.includes('swirl'), 'swirls');
      assert.ok(rec.sounds.includes('chime') && rec.fx.includes('puff'), 'a done puff');
      // The mixed things are not drawn on their own any more.
      assert.deepEqual(await page.eval((ids) => ids.map((id) => !!window.__town.scene.view.viewOf(id)), done.map((k) => k.id)), [false, false, false]);
      await page.screenshot(`prep-${name}-5-batter`);
    });

    it('toast: bread from the pantry dropped in the toaster: the lever goes down, POP, toast', async () => {
      await panTo(page, 0);
      await clearRec(page);
      const bread = await pullOut(page, 'pantry-bread', await centerOf(page, W.st['station-toaster']));
      W.bread = bread;
      assert.equal((await E(page, bread)).parent, W.st['station-toaster'], 'in the toaster');
      await page.waitFor(() => window.__town.scene.pieces.state('toaster') === 'down');
      await until(page, (id) => { const e = window.__store.state.entities[id]; return !e.parent && e.props.cooked === 1; }, bread, { timeout: 8000 });
      await page.screenshot(`prep-${name}-6-toast-pop`);
      assert.equal(await page.eval(() => window.__town.scene.pieces.state('toaster')), 'up');
      const b = await E(page, bread);
      assert.equal(b.props.method, 'toasted');
      assert.ok(Math.abs(b.x - 1195) < 260 && b.y <= 504, `it lands on the counter by the toaster (${b.x}, ${b.y})`);
      assert.equal(await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.look, bread), 'toast');
      assert.ok((await page.eval(() => window.__rec.sounds)).includes('pop'));
    });

    it('smoothie: strawberry, banana and milk in the blender, tap: whirr, pink; a glass on it pours a pink smoothie', async () => {
      await panTo(page, 250);
      const blender = W.st['station-blender'];
      W.straw = await pullOut(page, 'fridge-strawberry', await centerOf(page, blender));
      W.milk2 = await pullOut(page, 'fridge-milk', await centerOf(page, blender));
      const [banana] = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'banana' && !e.deleted && e.room === 'cafe/kitchen').map((e) => e.id));
      await drag(page, await entPoint(page, banana), await centerOf(page, blender));
      const kids = await kidsOf(page, blender);
      assert.deepEqual(kids.map((k) => k.kind).sort(), ['banana', 'milk', 'strawberry']);
      await page.screenshot(`prep-${name}-7-blender-full`);
      await clearRec(page);
      const b = await entPoint(page, blender);
      assert.ok(b, 'the blender takes a tap');
      await page.tap(b.x, b.y);
      await page.waitFor(() => window.__rec.sounds.includes('whirr'));
      await page.waitFor(() => window.__town.scene.pieces.shown('blender') === 'pink', { timeout: 8000 });
      assert.ok((await kidsOf(page, blender)).every((k) => k.props.stir >= 6), 'blended');
      await page.screenshot(`prep-${name}-8-blended`);
      // The glass from the cup shelf, dropped on the blender.
      await panTo(page, 700);
      const [glass] = await byKind(page, 'glass');
      await clearRec(page);
      await drag(page, await entPoint(page, glass), await centerOf(page, blender));
      await page.waitFor(() => Object.values(window.__store.state.entities).some((e) => e.kind === 'smoothie' && !e.deleted));
      const [sm] = await byKind(page, 'smoothie');
      W.smoothie = sm;
      const s = await E(page, sm);
      assert.equal(s.props.color, 'pink');
      assert.deepEqual(s.props.contents, ['banana', 'milk', 'strawberry']);
      assert.equal(s.room, 'cafe/kitchen');
      assert.equal(await E(page, glass).then((g) => !g || g.deleted), true, 'the glass became the smoothie');
      assert.deepEqual(await kidsOf(page, blender), [], 'the jug is empty again');
      await page.waitFor(() => window.__town.scene.pieces.shown('blender') === 'empty');
      assert.ok((await page.eval(() => window.__rec.sounds)).includes('pour'));
      await until(page, (id) => { const v = window.__town.scene.view.viewOf(id); return !v || !v.posAnim || v.posAnim.playState === 'finished'; }, sm);
      await page.screenshot(`prep-${name}-9-smoothie`);
    });

    it('coffee: a cup under the spout, press the machine: it fills with coffee', async () => {
      await panTo(page, 900);
      const cup = await pullOut(page, 'cup-stack', await screenOf(page, 1480, 470));
      W.cup = cup;
      await until(page, (id) => Math.abs(window.__store.state.entities[id].y - 504) < 1, cup);
      await clearRec(page);
      const m = await piecePoint(page, 'coffee-machine');
      assert.ok(m, 'the machine takes a tap');
      await page.tap(m.x, m.y);
      await until(page, (id) => window.__store.state.entities[id].props.fill === 'coffee', cup);
      assert.ok((await page.eval(() => window.__rec.sounds)).includes('pour'));
      await page.screenshot(`prep-${name}-10-coffee`);
    });

    it('sink: eat a burger at a table (a dirty plate is left), wash the plate in the sink: clean', async () => {
      await panTo(page, 1100);
      const [burger] = await byKind(page, 'burger');
      for (let i = 0; i < 3; i++) {
        const p = await entPoint(page, burger);
        await page.tap(p.x, p.y);
        await page.frames(4);
      }
      await until(page, (id) => !window.__store.state.entities[id] || window.__store.state.entities[id].deleted, burger);
      const plate = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'plate' && !e.deleted && e.props.dirty === 1).id);
      W.plate = plate;
      await page.frames(10);
      await page.screenshot(`prep-${name}-11-dirty-plate`);
      assert.ok(await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.key.endsWith(':dirty'), plate), 'drawn dirty');
      // To the order counter, then over to the sink.
      await drag(page, await entPoint(page, plate), await screenOf(page, 1560, 590));
      await panTo(page, 350);
      await clearRec(page);
      await drag(page, await entPoint(page, plate), await centerOf(page, W.st['station-sink']));
      await until(page, (id) => window.__store.state.entities[id].props.dirty === 0, plate);
      const p = await E(page, plate);
      assert.equal(p.parent, W.st['station-sink'], 'in the sink');
      const rec = await page.eval(() => window.__rec);
      assert.ok(rec.sounds.includes('splash'));
      assert.ok(rec.fx.includes('bubble') && rec.fx.includes('drop'));
      assert.ok(!(await page.eval((id) => window.__town.scene.view.viewOf(id).sprite.key.endsWith(':dirty'), plate)), 'drawn clean');
      await page.screenshot(`prep-${name}-12-washed`);
    });

    it('reload: every state is still there', async () => {
      await page.frames(10);
      await page.goto('index.html');
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy && window.__town.scene.view);
      const s = await page.eval((W) => {
        const e = (id) => window.__store.state.entities[id];
        const kids = (id) => Object.values(window.__store.state.entities).filter((q) => q.parent === id && !q.deleted);
        return {
          tomatoCut: e(W.tomato).props.cut, potato: e(W.potato).props.peeled,
          bowl: kids(W.bowl).map((k) => [k.kind, k.props.stir >= 6, k.props.cracked || 0]).sort(), batter: e(W.bowl).props.batter,
          bread: [e(W.bread).props.cooked, e(W.bread).parent], smoothie: e(W.smoothie).props.color,
          cup: e(W.cup).props.fill, plate: [e(W.plate).props.dirty, e(W.plate).parent === W.st['station-sink']],
          bowlLook: window.__town.scene.view.viewOf(W.bowl) && window.__town.scene.view.viewOf(W.bowl).sprite.look,
          tomatoLook: window.__town.scene.behaviors.lookOf(e(W.tomato)),
        };
      }, W);
      assert.deepEqual(s, {
        tomatoCut: 2, potato: 1,
        bowl: [['egg', true, 1], ['flour', true, 0], ['milk', true, 0]], batter: 'plain',
        bread: [1, null], smoothie: 'pink', cup: 'coffee', plate: [0, true],
        bowlLook: 'batter', tomatoLook: 'chopped',
      });
      await page.eval(() => window.__stage.camera.panTo(300));
      await page.waitFor(() => !window.__stage.camera.moving);
      await page.frames(10);
      await page.screenshot(`prep-${name}-13-after-reload`);
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
    });
  });
}
