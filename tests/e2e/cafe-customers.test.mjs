// End-to-end: cafe customers (P2a.5) with real (trusted) touches on the iPad
// Air. Nobody comes in by themselves (idle: no customers, no timers). A tap
// on the little bell over the front door: ding-dong, the door opens and a
// customer WALKS in (a glide with walk-a/walk-b steps) to a free table and
// sits; a thought bubble pops up with a PICTURE of the order. A sandwich
// made on a plate and put on their table: a big cheer and hearts, bites,
// the dirty plate stays on the table with 3 coins, a wave, and they walk
// out of the door (gone; the plate stays). A second customer served the
// Mystery Dish: a funny face, then a laugh, and 2 coins anyway. Coins
// dropped on the register: the drawer springs open, cha-ching, the count
// goes up (`inc`) and the open drawer shows the pile; the keys boop. Coins
// in the tip jar fill it (empty -> coins). The counter bell gives the kids'
// own seated characters orders too. At most 4 walk-ins. A reload mid-order
// keeps the bubble. Idle with customers waiting: no timers, no animations.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const TUNE = { biteMs: 350, firstBiteMs: 700, thanksMs: 900 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record(page) {
  await page.eval(async () => {
    const rec = window.__rec = { sounds: [], fx: [], faces: [] };
    const { sfx } = await import('./src/audio/index.js');
    const play = sfx.play;
    sfx.play = (name, opts) => { rec.sounds.push(name); return play(name, opts); };
    const fx = window.__town.scene.fx;
    const burst = fx.burst;
    fx.burst = (type, ...rest) => { rec.fx.push(type); return burst(type, ...rest); };
    const chars = window.__town.scene.chars;
    const face = chars.face;
    chars.face = (id, seq) => { rec.faces.push({ id, seq: seq.map((s) => (typeof s[0] === 'string' ? s[0] : 'chomp')) }); return face(id, seq); };
  });
}
const clearRec = (page) => page.eval(() => { window.__rec.sounds.length = 0; window.__rec.fx.length = 0; window.__rec.faces.length = 0; });
const E = (page, id) => page.eval((id) => window.__store.state.entities[id] || null, id);
const C = (page) => page.eval(() => window.__town.scene.customers);
const list = (page) => page.eval(() => window.__town.scene.customers.list());
const cstats = (page) => page.eval(() => window.__town.scene.customers.stats());
const panTo = async (page, x) => {
  await page.eval((x) => window.__stage.camera.panTo(x), x);
  await page.waitFor(() => !window.__stage.camera.moving);
  await page.frames(3);
};
const settled = (page, id) => page.waitFor(`(() => { const v = window.__town.scene.view.viewOf(${JSON.stringify(id)}); return v && !v.held && (!v.posAnim || v.posAnim.playState === 'finished'); })()`);
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
const centerOf = (page, id, fy = 0.5) => page.eval(([id, fy]) => {
  const r = window.__town.scene.view.viewOf(id).el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * fy };
}, [id, fy]);
const screenOf = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
const piecePoint = (page, pid, fx = null, fy = null) => page.eval(([pid, fx, fy]) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const y of fy == null ? fr : [fy]) for (const x of fx == null ? fr : [fx]) {
    const px = r.left + r.width * x, py = r.top + r.height * y;
    if (window.__input.hitTest(px, py) === el) return { x: px, y: py };
  }
  return null;
}, [pid, fx, fy]);
const tapPiece = async (page, pid, fx, fy) => { const p = await piecePoint(page, pid, fx, fy); assert.ok(p, pid + ' is touchable'); await page.tap(p.x, p.y); };
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
}

/** Ring the door bell with a real tap; `roll` pins Math.random for the rolls (the order, the seat). Returns the new customer's id. */
async function ring(page, roll = null) {
  const before = (await list(page)).map((c) => c.id);
  if (roll != null) await page.eval((r) => { window.__realRandom = window.__realRandom || Math.random; Math.random = () => r; }, roll);
  await tapPiece(page, 'door-bell');
  if (roll != null) await page.eval(() => { Math.random = window.__realRandom; });
  const id = await page.waitFor(`window.__town.scene.customers.list().map((c) => c.id).filter((id) => !${JSON.stringify(before)}.includes(id)).pop()`, { timeout: 4000 }).catch(() => null);
  return id;
}
const waiting = (page, id) => page.waitFor(`(window.__town.scene.customers.list().find((c) => c.id === ${JSON.stringify(id)}) || {}).phase === 'wait'`, { timeout: 10000 });

/** Setup (not under test): things lying on the dining room floor. */
const spawnAt = (page, list) => page.eval((list) => {
  const s = window.__store;
  return list.map(([kind, x, y, props]) => { const id = s.newId(); s.dispatch('spawn', { id, kind, room: 'cafe/kitchen', x, y, ...(props ? { props } : {}) }); return id; });
}, list);
const tableSpot = (page, id) => page.eval(async (id) => {
  const { tableSpot } = await import('./src/core/customers.js');
  const e = window.__store.state.entities[id];
  const seat = window.__town.scene.chars.seats.find((s) => s.id === e.props.seat);
  return tableSpot(seat, window.__town.scene.room.def.surfaces);
}, id);
const coinsOn = (page) => page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'coin' && !e.deleted && e.room === 'cafe/kitchen').map((e) => e.id).sort());

async function enterCafe(page) {
  const door = await page.eval(() => {
    const p = window.__town.manifest.map.pieces['cafe-door'];
    window.__stage.camera.panTo(p.x + p.w / 2 - 720);
    return window.__town.scene.screenPoint('cafe-door', 0.5);
  });
  await page.tap(door.x, door.y);
  await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy && window.__town.scene.customers);
}

describe('cafe customers (ipad-air, landscape, touch)', () => {
  let page;
  const W = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await enterCafe(page);
    await record(page);
    await page.eval((t) => window.__town.scene.customers.tune(t), TUNE);
    await panTo(page, 1440);
  });
  after(async () => { if (page) await page.close(); });

  it('idle: nobody comes in by themselves; no timers', async () => {
    assert.deepEqual((await list(page)).filter((c) => c.walkIn), []);
    await sleep(1500);   // a window in which nothing must happen
    assert.deepEqual((await list(page)).filter((c) => c.walkIn), [], 'no automatic customers');
    const s = await cstats(page);
    assert.equal(s.timers, 0);
    assert.equal(s.local, 0);
    assert.ok(await page.eval(() => !!window.__town.scene.customers.tipJarId()), 'a tip jar on the counter');
  });

  it('ring the door bell: the door opens, a customer walks in to a free table and sits; a picture order pops up', async () => {
    await clearRec(page);
    // Pin the rolls: 0.7 -> not "anything", the 4th of the 5 easy orders (sandwich).
    const id = await ring(page, 0.7);
    assert.ok(id, 'a customer came in');
    W.a = id;
    assert.ok(await page.eval(() => window.__rec.sounds.includes('doorbell')));
    await page.waitFor(() => window.__town.scene.pieces.state('front-door') === 'open');
    // Walking: a long glide from the door, legs stepping.
    const walking = await page.eval((id) => {
      const v = window.__town.scene.view.viewOf(id);
      const e = window.__store.state.entities[id];
      return { anim: !!(v.posAnim && v.posAnim.playState === 'running'), dur: v.posAnim && v.posAnim.effect.getTiming().duration, walk: e.props.walk, pose: e.props.pose };
    }, id);
    assert.ok(walking.anim && walking.dur >= 1000, 'gliding in: ' + JSON.stringify(walking));
    assert.equal(walking.pose, 'stand');
    assert.ok(walking.walk && /^table-/.test(walking.walk.seat), 'to a table');
    await sleep(500);
    await page.screenshot('customers-1-walking');
    await waiting(page, id);
    const e = await E(page, id);
    assert.equal(e.props.pose, 'sit');
    assert.equal(e.props.seat, walking.walk.seat);
    assert.equal(e.props.order.recipe, 'sandwich');
    await page.waitFor(() => window.__town.scene.pieces.state('front-door') === 'closed');
    // The bubble: a picture (an image of the dish), no words needed.
    const b = await page.eval((id) => {
      const el = document.querySelector(`.cust-bubble[data-cust="${id}"]`);
      return el && { imgs: el.querySelectorAll('.cb-pic img').length, order: el.dataset.order, vis: getComputedStyle(el).visibility, name: el.querySelector('.cb-name').textContent };
    }, id);
    assert.ok(b && b.imgs >= 1 && b.order === 'sandwich' && b.vis === 'visible', JSON.stringify(b));
    assert.equal(b.name, 'Sandwich', 'the text layer name (hidden unless words are on)');
    await page.waitFor(() => window.__rec.sounds.includes('pop'));
    await page.frames(30);
    await page.screenshot('customers-2-order');
  });

  it('make the sandwich they asked for and put it on their table: a cheer, hearts, bites, 3 coins, the dirty plate stays, a wave, out of the door', async () => {
    const [plate, bread, cheese, tomato, lettuce] = await spawnAt(page, [
      ['plate', 2330, 595], ['bread', 1980, 930, { cut: 2 }], ['cheese', 2070, 940], ['tomato', 2160, 930], ['lettuce', 2000, 880],
    ]);
    await page.frames(3);
    for (const id of [bread, cheese, tomato, lettuce]) {
      await drag(page, await entPoint(page, id), await centerOf(page, plate, 0.2));
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(id)}].parent === ${JSON.stringify(plate)}`);
      await page.frames(2);
    }
    const pr = await page.eval((id) => { const r = window.__town.scene.view.viewOf(id).el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 5 }; }, plate);
    await page.tap(pr.x, pr.y);
    const sw = await page.waitFor(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'sandwich' && !e.deleted && e.props.recipe).map((e) => e.id).pop());
    await page.frames(4);
    await clearRec(page);
    const coins0 = await coinsOn(page);
    const spot = await tableSpot(page, W.a);
    assert.ok(spot, 'a table in front of them');
    await carry(page, sw, spot.x, spot.y - 20);
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(W.a)}].props.eating || {}).match === true`, { timeout: 5000 });
    assert.equal((await E(page, W.a)).props.order, null, 'the order is taken');
    await page.waitFor(() => window.__rec.sounds.includes('cheer') && window.__rec.fx.includes('heart'));
    assert.equal(await page.eval((id) => !!document.querySelector(`.cust-bubble[data-cust="${id}"]`), W.a) || false, false, 'the bubble popped away');
    await page.frames(8);
    await page.screenshot('customers-3-cheer');
    // Bites (the sandwich's bite looks), then the dirty plate and the coins.
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(sw)}].props.bites | 0) >= 1 || window.__store.state.entities[${JSON.stringify(sw)}].deleted`);
    await page.waitFor(() => window.__rec.faces.some((f) => f.seq.includes('chomp') && f.seq.includes('yum')));
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(W.a)}] || {}).props.paid || false`, { timeout: 10000 }).catch(() => null);
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(sw)}].deleted === true`);
    const coins = (await coinsOn(page)).filter((c) => !coins0.includes(c));
    assert.equal(coins.length, 3, 'three coins for the dish they wanted');
    const dirty = await page.eval(([x, y]) => Object.values(window.__store.state.entities).filter((e) => e.kind === 'plate' && !e.deleted && e.props.dirty && !e.parent && Math.abs(e.y - y) < 2 && Math.abs(e.x - x) < 80).map((e) => e.id), [spot.x, spot.y]);
    assert.equal(dirty.length, 1, 'the dirty plate stays on the table');
    W.dirty = dirty[0];
    W.coins = coins;
    for (const c of coins) assert.equal((await E(page, c)).y, spot.y, 'coins on the table');
    await page.waitFor(() => window.__rec.sounds.includes('clink'));
    await page.frames(10);
    await page.screenshot('customers-4-coins');
    // Then they walk out of the door and are gone; the plate stays.
    await page.waitFor(`!!(window.__store.state.entities[${JSON.stringify(W.a)}].props.leave) || window.__store.state.entities[${JSON.stringify(W.a)}].deleted`, { timeout: 8000 });
    await page.waitFor(() => window.__town.scene.pieces.state('front-door') === 'open').catch(() => null);
    await sleep(400);
    await page.screenshot('customers-5-leaving');
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(W.a)}].deleted === true`, { timeout: 10000 });
    assert.ok(!(await E(page, W.dirty)).deleted, 'the plate is still there');
    await page.waitFor(() => window.__town.scene.pieces.state('front-door') === 'closed');
    const s = await cstats(page);
    assert.equal(s.gone, 1);
    assert.equal(s.matches, 1);
  });

  it('serve a Mystery Dish: a funny face, then a laugh, and coins anyway', async () => {
    const id = await ring(page, 0.7);
    assert.ok(id);
    W.b = id;
    await waiting(page, id);
    await page.frames(20);
    const mystery = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'mystery-dish' && !e.deleted).id);
    // (Setup) off the table it sits on, onto the sideboard, so the serve is a real carry.
    await page.eval((id) => window.__store.dispatch('move', { id, room: 'cafe/kitchen', x: 2460, y: 595, z: 0 }), mystery);
    await page.frames(4);
    await settled(page, mystery);
    await clearRec(page);
    const coins0 = await coinsOn(page);
    // Dropped right on the customer (their face).
    const mouth = await page.eval((id) => window.__town.scene.chars.inspect(id).anchors.mouth, id);
    await drag(page, await entPoint(page, mystery), await screenOf(page, mouth.x, mouth.y));
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(id)}].props.eating || {}).match === false`, { timeout: 5000 }).catch(async (err) => {
      await page.screenshot('customers-dbg');
      throw new Error(err.message + JSON.stringify(await page.eval(([m, id]) => [window.__store.state.entities[m], window.__store.state.entities[id].props, window.__town.scene.behaviors.log().slice(-3)], [mystery, id])));
    });
    await page.waitFor(() => window.__rec.faces.some((f) => f.seq.join(',').includes('yuck') && f.seq.indexOf('laughing') > f.seq.indexOf('yuck')));
    assert.ok(!(await page.eval(() => window.__rec.faces.some((f) => f.seq.includes('sad')))), 'never sad');
    await sleep(700);
    await page.screenshot('customers-6-mystery-face');
    await page.waitFor(() => window.__rec.sounds.includes('giggle'));
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(mystery)}].deleted === true`, { timeout: 10000 });
    await page.waitFor(`(${JSON.stringify(coins0)}).length + 2 === Object.values(window.__store.state.entities).filter((e) => e.kind === 'coin' && !e.deleted && e.room === 'cafe/kitchen').length`, { timeout: 8000 });
    await page.frames(10);
    await page.screenshot('customers-7-mystery-coins');
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(id)}].deleted === true`, { timeout: 10000 });
    assert.equal((await cstats(page)).others, 1);
  });

  it('coins: into the register (the drawer opens, cha-ching, the count goes up, the pile shows; the keys boop) and the tip jar (it fills)', async () => {
    const coins = await coinsOn(page);
    assert.ok(coins.length >= 5, coins.length + ' coins');
    // (Setup) a kid carried the coins over to the order counter.
    await page.eval((ids) => ids.forEach((id, i) => window.__store.dispatch('move', { id, room: 'cafe/kitchen', x: 1430 + i * 34, y: 616, z: 0 })), coins.slice(0, 4));
    await panTo(page, 900);
    for (const c of coins.slice(0, 4)) await settled(page, c);
    await clearRec(page);
    assert.equal(await page.eval(() => window.__town.scene.customers.registerCoins()), 0);
    // Coin on the register.
    const reg = await piecePoint(page, 'register', 0.5, 0.75);
    await drag(page, await entPoint(page, coins[0]), reg);
    await page.waitFor(() => window.__town.scene.customers.registerCoins() === 1);
    assert.equal((await E(page, coins[0])).deleted, true, 'the coin went in');
    assert.equal(await page.eval(() => window.__town.scene.pieces.state('register')), 'open', 'the drawer springs open');
    assert.ok(await page.eval(() => window.__rec.sounds.includes('chaching')));
    await drag(page, await entPoint(page, coins[1]), reg);
    await page.waitFor(() => window.__town.scene.customers.registerCoins() === 2);
    assert.equal(await page.eval(() => document.querySelectorAll('.reg-pile.open img').length), 2, 'the pile in the drawer');
    await page.frames(6);
    await page.screenshot('customers-8-register');
    // The keys boop; a tap on the drawer shuts it (the pile hides) and opens it again.
    await clearRec(page);
    await tapPiece(page, 'register', 0.4, 0.4);
    await page.waitFor(() => window.__rec.sounds.includes('beep'));
    assert.equal(await page.eval(() => window.__town.scene.pieces.state('register')), 'open', 'a key does not shut the drawer');
    await tapPiece(page, 'register', 0.5, 0.85);
    await page.waitFor(() => window.__town.scene.pieces.state('register') === 'closed');
    assert.equal(await page.eval(() => document.querySelectorAll('.reg-pile.open').length), 0);
    await tapPiece(page, 'register', 0.5, 0.85);
    await page.waitFor(() => window.__town.scene.pieces.state('register') === 'open');
    // The tip jar.
    const jar = await page.eval(() => window.__town.scene.customers.tipJarId());
    const look = () => page.eval((id) => window.__town.scene.behaviors.lookOf(window.__store.state.entities[id]), jar);
    assert.equal(await look(), 'empty');
    await drag(page, await entPoint(page, coins[2]), await centerOf(page, jar, 0.4));
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(jar)}].props.coins | 0) === 1`);
    assert.equal(await look(), 'coins');
    await drag(page, await entPoint(page, coins[3]), await centerOf(page, jar, 0.4));
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(jar)}].props.coins | 0) === 2`);
    // (Setup) a few more tips: it is full.
    await page.eval((id) => window.__store.dispatch('inc', { id, path: 'props.coins', by: 4 }), jar);
    assert.equal(await look(), 'full');
    await page.frames(6);
    await page.screenshot('customers-9-tipjar');
    await clearRec(page);
    await page.tap(...Object.values(await entPoint(page, jar)));
    await page.waitFor(() => window.__rec.sounds.filter((s) => s === 'clink').length >= 3);
  });

  it('kid-as-customer: the counter bell gives the kids sitting at the tables orders too', async () => {
    await panTo(page, 900);
    const kids = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && !e.deleted && /^(table-|window-seat-)/.test(e.props.seat || '') && !e.props.cust).map((e) => e.id).sort());
    assert.ok(kids.length >= 2, 'the boy at the table and the grandpa by the window');
    await tapPiece(page, 'counter-bell');
    for (const id of kids) await waiting(page, id);
    await panTo(page, 1440);
    await page.frames(30);
    for (const id of kids) assert.ok(await page.eval((id) => !!document.querySelector(`.cust-bubble[data-cust="${id}"] .cb-pic > *`), id), 'a picture bubble for ' + id);
    await page.screenshot('customers-10-kids-order');
    W.kids = kids;
    // The grandpa by the window gets a cupcake from the counter, dropped on him; he eats, pays, and stays.
    const gp = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && !e.deleted && e.props.seat === 'window-seat-1').id);
    const cake = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'cupcake' && !e.deleted && !e.parent && e.room === 'cafe/kitchen').id);
    const coins0 = (await coinsOn(page)).length;
    const head = await page.eval((id) => window.__town.scene.chars.inspect(id).anchors.mouth, gp);
    await drag(page, await entPoint(page, cake), await screenOf(page, head.x, head.y + 30));
    await page.waitFor(`!!window.__store.state.entities[${JSON.stringify(gp)}].props.eating`, { timeout: 5000 });
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(cake)}].deleted === true`, { timeout: 10000 });
    await page.waitFor(`Object.values(window.__store.state.entities).filter((e) => e.kind === 'coin' && !e.deleted && e.room === 'cafe/kitchen').length >= ${coins0 + 2}`, { timeout: 8000 });
    await page.waitFor(`(() => { const e = window.__store.state.entities[${JSON.stringify(gp)}]; return !e.props.paid && !e.props.eating; })()`, { timeout: 8000 });
    const g = await E(page, gp);
    assert.ok(!g.deleted && g.props.seat === 'window-seat-1' && !g.props.leave, 'a kid-customer stays at the table');
  });

  it('at most 4 walk-ins, however often the bell rings; a reload mid-order keeps the bubbles', async () => {
    for (let i = 0; i < 6; i++) {
      await tapPiece(page, 'door-bell');
      await page.frames(4);
    }
    await page.waitFor(() => window.__town.scene.customers.list().filter((c) => c.walkIn).length === 4, { timeout: 5000 }).catch(() => null);
    const n = (await list(page)).filter((c) => c.walkIn).length;
    assert.ok(n <= 4, n + ' walk-ins');
    const s = await cstats(page);
    assert.ok(s.rings >= 6);
    await page.waitFor(() => window.__town.scene.customers.list().every((c) => c.phase === 'wait'), { timeout: 15000 });
    assert.equal((await list(page)).filter((c) => c.walkIn).length, Math.min(4, n));
    await page.waitFor(() => window.__town.scene.pieces.state('front-door') === 'closed');
    await page.frames(30);
    await page.screenshot('customers-11-full');
    // Idle with customers waiting: nothing running.
    await sleep(800);
    const idle = await page.eval(() => ({ s: window.__town.scene.customers.stats(), anims: document.querySelector('.cust-layer').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length }));
    assert.equal(idle.s.timers, 0, 'no host timers while customers wait');
    assert.equal(idle.s.local, 0, 'no local timers');
    assert.equal(idle.anims, 0, 'no bubble animation');
    const waitingIds = (await list(page)).filter((c) => c.phase === 'wait').map((c) => c.id).sort();
    await page.goto('');
    await page.waitFor(() => window.__town && window.__town.at === 'cafe/kitchen' && window.__town.scene.customers);
    await page.frames(20);
    const after = await page.eval(() => [...document.querySelectorAll('.cust-bubble')].filter((b) => b.querySelector('.cb-pic > *')).map((b) => b.dataset.cust).sort());
    assert.deepEqual(after, waitingIds, 'every bubble is back');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
