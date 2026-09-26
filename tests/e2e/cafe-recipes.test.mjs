// End-to-end: cafe recipes (P2a.4) with real (trusted) touches on the iPad
// Air. A SANDWICH: bread, cheese, tomato and lettuce dragged onto a plate
// stack up; a tap on the plate assembles them with a poof into a sandwich
// (the recipe book records it), which is then served to a customer who eats
// it. PANCAKES: batter poured into the pan on a lit burner cooks a pancake;
// the pan dropped on a plate slides it on; twice, and the two stack; a tap:
// a pancake stack. A MYSTERY DISH from fish, chocolate and banana: a face
// (eyes, mouth, topper), a silly name in the text layer, a giggle and a
// wiggle when tapped, and a funny face then a laugh from the grandpa who
// eats it. The RECIPE BOOK on the counter's back shelf opens on a tap, shows
// the sandwich's star sticker (and silhouettes for the rest), pages with the
// big arrows and closes. A RELOAD keeps the stickers and the mystery dish.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const TUNE = { stepMs: 1200, ovenMs: 2500, warmMs: 3000 };

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
const live = (page, kind) => page.eval((kind) => Object.values(window.__store.state.entities)
  .filter((e) => e.kind === kind && !e.deleted && !e.props.from).map((e) => e.id).sort(), kind);
const kidsOf = (page, id) => page.eval((id) => Object.values(window.__store.state.entities)
  .filter((e) => e.parent === id && !e.deleted).map((e) => e.id), id);
const panTo = async (page, x) => {
  await page.eval((x) => window.__stage.camera.panTo(x), x);
  await page.waitFor(() => !window.__stage.camera.moving);
  await page.frames(3);
};
const settled = (page, id) => until(page, (id) => { const v = window.__town.scene.view.viewOf(id); return v && !v.held && (!v.posAnim || v.posAnim.playState === 'finished'); }, id);
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
const piecePoint = (page, pid) => page.eval((pid) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, pid);
const tapPiece = async (page, pid) => { const p = await piecePoint(page, pid); assert.ok(p, pid + ' is touchable'); await page.tap(p.x, p.y); };
const drag = (page, from, to) => page.drag(from, to, { steps: 14, durationMs: 280 });

/** Drag entity `id` so its feet land at world (tx, ty). */
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

/** Drag a thing onto a plate with a real touch; it lands on the plate. */
async function ontoPlate(page, id, plate) {
  const from = await entPoint(page, id);
  assert.ok(from, id + ' is touchable');
  await drag(page, from, await centerOf(page, plate, 0.2));
  await until(page, ([i, p]) => window.__store.state.entities[i].parent === p, [id, plate]);
  await page.frames(2);
}

/** Tap a plate (its rim, or what is on it: the whole plate is the button). */
async function tapPlate(page, plate) {
  const p = await page.eval((id) => {
    const r = window.__town.scene.view.viewOf(id).el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom - Math.min(8, r.height * 0.3) };
  }, plate);
  await page.tap(p.x, p.y);
}

/** Setup (not the thing under test): things out of the fridge, lying on the floor. */
const spawnAt = (page, list) => page.eval((list) => {
  const s = window.__store;
  return list.map(([kind, x, y, props]) => { const id = s.newId(); s.dispatch('spawn', { id, kind, room: 'cafe/kitchen', x, y, ...(props ? { props } : {}) }); return id; });
}, list);

/** Setup: a bowl of done plain batter in the mixing bowl. */
const makeBatter = (page, bowl) => page.eval((bowl) => {
  const s = window.__store;
  for (const [i, kind] of ['flour', 'milk', 'egg'].entries()) {
    s.dispatch('spawn', { id: s.newId(), kind, parent: bowl, slot: 's' + i, props: { stir: 6, ...(kind === 'egg' ? { cracked: 1 } : {}) } });
  }
  s.dispatch('set', { id: bowl, path: 'props.batter', value: 'plain' });
}, bowl);

const dishOf = (page, kind) => page.waitFor(`Object.values(window.__store.state.entities).filter((e) => e.kind === ${JSON.stringify(kind)} && !e.deleted && e.props.recipe).map((e) => e.id).pop()`);

describe('cafe recipes (ipad-air, landscape, touch)', () => {
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
    W.pan = (await live(page, 'pan'))[0];
    W.bowl = (await live(page, 'mixing-bowl'))[0];
    W.book = await page.eval(() => window.__town.scene.recipes.bookId());
  });
  after(async () => { if (page) await page.close(); });

  it('sandwich: bread, cheese, tomato and lettuce stack up on a plate; a tap: poof, a sandwich; served to a customer', async () => {
    assert.ok(W.book, 'the recipe book is in the cafe');
    assert.deepEqual(await page.eval(() => window.__town.scene.recipes.found()), [], 'nothing found yet');
    await panTo(page, 900);
    const [plate, bread, cheese, tomato, lettuce] = await spawnAt(page, [
      ['plate', 1760, 616], ['bread', 1480, 900, { cut: 2 }], ['cheese', 1600, 930], ['tomato', 1720, 900], ['lettuce', 1850, 930],
    ]);
    W.plate = plate;
    await page.frames(3);
    for (const id of [bread, cheese, tomato, lettuce]) await ontoPlate(page, id, plate);
    assert.equal((await kidsOf(page, plate)).length, 4);
    // They stack: each one drawn higher on the plate than the one before.
    const ys = await page.eval((ids) => ids.map((id) => window.__town.scene.view.viewOf(id).y), [bread, cheese, tomato, lettuce]);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] < ys[i - 1] - 2, 'stacked: ' + ys.join(', '));
    await page.screenshot('recipes-1-stacked');
    await clearRec(page);
    await tapPlate(page, plate);
    const sw = await dishOf(page, 'sandwich');
    const e = await E(page, sw);
    assert.equal(e.props.recipe, 'sandwich');
    assert.equal(e.props.name, 'Sandwich');
    assert.equal((await E(page, plate)).deleted, true, 'the plate became the sandwich (its art has a plate)');
    for (const id of [bread, cheese, tomato, lettuce]) assert.equal((await E(page, id)).deleted, true);
    assert.ok(Math.abs(e.x - 1760) < 1 && e.y === 616, 'where the plate was');
    await page.waitFor(() => window.__rec.fx.includes('puff') && window.__rec.sounds.includes('chime'));
    assert.deepEqual(await page.eval(() => window.__town.scene.recipes.found()), ['sandwich']);
    assert.ok(await page.eval(() => window.__rec.sounds.includes('tada')), 'a first find: a fanfare');
    await page.frames(6);
    await page.screenshot('recipes-2-sandwich');
    // Serve it: the grandpa by the window eats it, bite by bite.
    const gp = await page.eval(() => {
      const c = Object.values(window.__store.state.entities).find((q) => q.kind === 'char' && q.props.seat === 'window-seat-1');
      return c && { id: c.id, mouth: window.__town.scene.chars.inspect(c.id).anchors.mouth };
    });
    assert.ok(gp, 'the grandpa on the window seat');
    const bites0 = await page.eval(() => window.__town.scene.chars.stats().bites);
    await drag(page, await entPoint(page, sw), await screenOf(page, gp.mouth.x, gp.mouth.y));
    await page.waitFor(`window.__town.scene.chars.stats().bites > ${bites0}`);
    assert.equal((await E(page, sw)).parent, gp.id, 'in his hand');
    assert.equal((await E(page, sw)).props.bites, 1, 'one bite');
    await page.screenshot('recipes-3-served');
  });

  it('pancakes: batter into the pan on a lit burner, cooked, the pan onto a plate (twice: a stack), a tap: pancakes', async () => {
    await panTo(page, 0);
    await carry(page, W.pan, 1001, 494);
    await tapPiece(page, 'knob-1');
    await page.waitFor(() => window.__town.scene.pieces.state('burner-1') === 'on');
    // A plate on the island.
    await page.eval(() => { const s = window.__store; for (const e of Object.values(s.state.entities)) if (e.kind === 'egg' && !e.deleted && !e.parent && e.room === 'cafe/kitchen') s.dispatch('remove', { id: e.id, hard: true }); });
    const [plate] = await spawnAt(page, [['plate', 780, 630]]);
    await page.frames(3);
    const cakes = [];
    for (let n = 0; n < 2; n++) {
      await makeBatter(page, W.bowl);
      await page.frames(2);
      await drag(page, await entPoint(page, W.bowl), await centerOf(page, W.pan, 0.3, -20));
      const cake = await page.waitFor(`Object.values(window.__store.state.entities).filter((e) => e.kind === 'pancake' && !e.deleted && e.parent === ${JSON.stringify(W.pan)}).map((e) => e.id).pop()`);
      cakes.push(cake);
      await until(page, (id) => (window.__store.state.entities[id].props.cooked | 0) >= 1, cake, { timeout: 8000 });
      if (n === 0) await page.screenshot('recipes-4-pancake-in-pan');
      // The pan onto the plate: the pancake slides on (the pan springs back to the stove).
      await drag(page, await entPoint(page, W.pan), await centerOf(page, plate, 0.3));
      await until(page, ([c, p]) => window.__store.state.entities[c].parent === p, [cake, plate]);
      await settled(page, W.pan);
      assert.equal((await E(page, W.pan)).y, 504, 'the pan is back on the stovetop');
    }
    const ys = await page.eval((ids) => ids.map((id) => window.__town.scene.view.viewOf(id).y), cakes);
    assert.ok(ys[1] < ys[0] - 2, 'the second pancake sits on the first: ' + ys.join(', '));
    await tapPiece(page, 'knob-1');
    await page.screenshot('recipes-5-pancake-stack-on-plate');
    await clearRec(page);
    await tapPlate(page, plate);
    const pc = await dishOf(page, 'pancakes');
    assert.equal((await E(page, pc)).props.recipe, 'pancakes');
    assert.deepEqual(await page.eval(() => window.__town.scene.recipes.found()), ['pancakes', 'sandwich']);
    await page.frames(6);
    await page.screenshot('recipes-6-pancakes');
  });

  it('mystery dish: fish, chocolate and banana make a dish with a face and a silly name; it giggles; the grandpa eats it: a funny face, then a laugh', async () => {
    await panTo(page, 1440);
    const [plate, fish, choc, banana] = await spawnAt(page, [
      ['plate', 2080, 576.8], ['fish', 2000, 900], ['chocolate', 2120, 930], ['banana', 2240, 900],
    ]);
    await page.frames(3);
    for (const id of [fish, choc, banana]) await ontoPlate(page, id, plate);
    await clearRec(page);
    await tapPlate(page, plate);
    const md = await page.waitFor(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'mystery-dish' && !e.deleted && e.props.mystery).map((e) => e.id).pop());
    const e = await E(page, md);
    const { mysteryFace, mysteryName, itemsOf } = await import('../../src/core/recipes.js');
    const items = itemsOf([{ kind: 'fish', props: {} }, { kind: 'chocolate', props: {} }, { kind: 'banana', props: {} }]);
    assert.equal(e.props.name, mysteryName(items), 'the name is the contents hash');
    for (const [k, v] of Object.entries(mysteryFace(items))) assert.equal(e.props[k], v, k);
    assert.deepEqual(e.props.contents, ['banana', 'chocolate', 'fish']);
    assert.ok(await page.eval(() => window.__rec.sounds.includes('giggle')), 'it giggles into being');
    // Its face: the base and the three parts.
    const srcs = await page.eval(async (id) => {
      const imgs = [...window.__town.scene.view.viewOf(id).body.querySelectorAll('img')];
      await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
      return imgs.map((i) => i.getAttribute('src'));
    }, md);
    assert.equal(srcs.length, 4);
    assert.match(srcs[1], new RegExp('mystery-eyes-' + e.props.eyes));
    assert.match(srcs[2], new RegExp('mystery-mouth-' + e.props.mouth));
    // Zoe's text layer: its silly name on the tag.
    await page.eval(() => document.body.classList.add('text-layer'));
    await page.frames(2);
    const tag = await page.eval((id) => { const v = window.__town.scene.view.viewOf(id); return v.label ? v.label.textContent : ''; }, md);
    assert.equal(tag, e.props.name);
    await page.screenshot('recipes-7-mystery-named');
    await page.eval(() => document.body.classList.remove('text-layer'));
    // A tap: giggle and wiggle, never a bite.
    await clearRec(page);
    const n = await page.eval(() => window.__town.scene.behaviors.log().length);
    const p = await entPoint(page, md);
    await page.tap(p.x, p.y);
    await page.waitFor(`window.__town.scene.behaviors.log().length > ${n}`);
    assert.equal(await page.eval(() => window.__town.scene.behaviors.log().at(-1).reason), 'giggle');
    assert.ok(await page.eval(() => window.__rec.sounds.includes('giggle')));
    assert.equal((await E(page, md)).props.bites, undefined);
    // The grandpa eats it: yuck-funny face, then laughing.
    const gp = await page.eval(() => {
      const c = Object.values(window.__store.state.entities).find((q) => q.kind === 'char' && q.props.seat === 'window-seat-1');
      return { id: c.id, mouth: window.__town.scene.chars.inspect(c.id).anchors.mouth };
    });
    // His hand still holds the sandwich: put it down on the sill first (setup).
    await page.eval((gp) => { const s = window.__store; for (const k of Object.values(s.state.entities)) if (k.parent === gp && k.kind === 'sandwich' && !k.deleted) s.dispatch('move', { id: k.id, room: 'cafe/kitchen', x: 2200, y: 576.8, z: 0 }); }, gp.id);
    await page.frames(2);
    await drag(page, await entPoint(page, md), await screenOf(page, gp.mouth.x, gp.mouth.y));
    await page.waitFor(() => window.__town.scene.chars.stats().lastTaste === 'weird');
    await page.waitFor(`window.__town.scene.chars.inspect(${JSON.stringify(gp.id)}).shown === 'yuck'`, { timeout: 5000 });
    await page.screenshot('recipes-8-mystery-yuck');
    await page.waitFor(`window.__town.scene.chars.inspect(${JSON.stringify(gp.id)}).shown === 'laughing'`, { timeout: 5000 });
    await page.screenshot('recipes-9-mystery-laugh');
    // Mysteries don't get stickers: only recipes are in the book.
    assert.deepEqual(await page.eval(() => window.__town.scene.recipes.found()), ['pancakes', 'sandwich']);
  });

  it('the recipe book: tap it on the counter shelf, the sandwich has its star, the rest are silhouettes; big arrows page; close', async () => {
    await panTo(page, 900);
    const p = await entPoint(page, W.book);
    assert.ok(p, 'the book is touchable on the shelf');
    await page.tap(p.x, p.y);
    await page.waitFor(() => document.querySelector('.rbook.is-shown'));
    await page.frames(10);
    const shown = await page.eval(() => window.__town.scene.recipes.book.shown());
    assert.deepEqual(shown.map((r) => r.id), ['sandwich', 'veggie-sandwich', 'grilled-cheese', 'burger']);
    assert.deepEqual(shown.filter((r) => r.found).map((r) => r.id), ['sandwich']);
    assert.ok(await page.eval(() => {
      const d = document.querySelector('.rbook-dish[data-recipe="sandwich"]');
      const star = d.querySelector('.rbook-star');
      const q = document.querySelector('.rbook-dish[data-recipe="burger"]');
      return getComputedStyle(star).display !== 'none' && q.classList.contains('is-hidden')
        && /brightness\(0\)/.test(getComputedStyle(q.querySelector('img')).filter);
    }), 'a star for the sandwich, a silhouette for the burger');
    // Picture ingredients (bread and cheese) and the plate, no text needed.
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.rbook-row[data-recipe="sandwich"] .rbook-ings .rbook-ico')].map((i) => i.dataset.kind)), ['bread', 'cheese']);
    await page.screenshot('recipes-10-book');
    // The big arrow: the next spread.
    await page.tapElement('.rbook-next');
    await page.waitFor(() => window.__town.scene.recipes.book.page() === 1);
    await page.frames(10);
    assert.deepEqual((await page.eval(() => window.__town.scene.recipes.book.shown())).map((r) => r.id), ['chicken-burger', 'big-breakfast', 'egg-toast', 'honey-toast']);
    await page.screenshot('recipes-11-book-page-2');
    // On to the pancakes' spread: its star is there too.
    for (let i = 0; i < 3; i++) { await page.tapElement('.rbook-next'); await page.frames(3); }
    await page.waitFor(() => window.__town.scene.recipes.book.page() === 4);
    assert.ok((await page.eval(() => window.__town.scene.recipes.book.shown())).some((r) => r.id === 'pancakes' && r.found));
    await page.screenshot('recipes-12-book-pancakes');
    await page.tapElement('.rbook-prev');
    await page.waitFor(() => window.__town.scene.recipes.book.page() === 3);
    await page.tapElement('.rbook-close');
    await page.waitFor(() => !document.querySelector('.rbook.is-open'));
    assert.equal(await page.eval(() => window.__town.scene.recipes.book.isOpen()), false);
  });

  it('a reload keeps the stickers and the dishes', async () => {
    const md = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'mystery-dish' && !e.deleted && e.props.mystery).map((e) => e.id).pop());
    const before = await E(page, md);
    await page.goto('index.html');
    await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy && window.__town.scene.recipes);
    assert.deepEqual(await page.eval(() => window.__town.scene.recipes.found()), ['pancakes', 'sandwich']);
    const after = await E(page, md);
    assert.equal(after.props.name, before.props.name);
    assert.equal(after.props.bites, before.props.bites);
    await panTo(page, 900);
    const p = await entPoint(page, await page.eval(() => window.__town.scene.recipes.bookId()));
    await page.tap(p.x, p.y);
    await page.waitFor(() => document.querySelector('.rbook.is-shown'));
    await page.frames(10);
    assert.ok((await page.eval(() => window.__town.scene.recipes.book.shown())).some((r) => r.id === 'sandwich' && r.found));
    await page.screenshot('recipes-13-after-reload');
    await page.tapElement('.rbook-close');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
