// End-to-end: carrying things between places (P1.14, src/scenes/carry.js)
// with real (trusted) touches on iPad viewports. The pocket tray keeps a
// cupcake and a character (with her outfit and what she holds) from the
// kitchen to the city and back and across a reload; things come out of it
// onto the map and into the car; the car drives its passengers into the cafe;
// a backpack's contents come along in the pocket; holding a dragged thing on
// the map button (or on the cafe door) takes it along with the finger still
// on it.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const IDLE = '(window.__town && !window.__town.busy && window.__town.scene && !!window.__town.scene.view)';
const noText = () => document.body.innerText.trim();

/** Screen centre of an entity's body (null if it isn't drawn). */
/** Screen point of an entity's body (null if it isn't drawn); dy: 0 top .. 1 bottom (default the centre). */
const at = (page, id, dy = 0.5) => page.eval(({ id, dy }) => {
  const v = window.__town.scene.view.viewOf(id);
  if (!v) return null;
  const r = v.body.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * dy };
}, { id, dy });
const cell = (page, i) => page.eval((i) => {
  const c = document.querySelectorAll('.pocket-cell')[i];
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: c.dataset.id };
}, i);
const ent = (page, id) => page.eval((id) => {
  const e = window.__store.state.entities[id];
  return e && !e.deleted ? { room: e.room, parent: e.parent, slot: e.slot, x: e.x, y: e.y, props: e.props } : null;
}, id);
const kidsOf = (page, id) => page.eval((id) => Object.values(window.__store.state.entities)
  .filter((e) => e.parent === id && !e.deleted).map((e) => ({ id: e.id, kind: e.kind, slot: e.slot })).sort((a, b) => (a.slot < b.slot ? -1 : 1)), id);
const pocket = (page) => page.eval(() => window.__town.carry.ids());
const drag = (page, from, to) => page.drag(from, to, { steps: 16, durationMs: 520 });

async function goKitchen(page) {
  if (await page.eval(() => window.__town.at) !== 'cafe/kitchen') await page.eval(() => window.__town.go('cafe/kitchen'));
  await page.waitFor(IDLE);
  await showCounter(page);
}
// P2a.1: the cafe is a panning strip; its counter stop shows the cook, her
// backpack and the fruit and cupcake on the order counter.
async function showCounter(page) {
  await page.eval(() => window.__stage.camera.panTo(900));
  await page.frames(2);
}

for (const name of ['ipad-air', 'ipad-pro-9.7']) {
  describe(`carrying (${name}, landscape, touch)`, () => {
    let page;
    let ids;
    before(async () => {
      page = await openPage({ viewport: name });
      await page.waitFor(IDLE);
    });
    after(async () => { if (page) await page.close(); });

    it('the pocket button is in every place, round and big, with no text', async () => {
      const b = await page.eval(() => document.querySelector('.ui-pocket').getBoundingClientRect().toJSON());
      const vp = await page.eval(() => ({ w: innerWidth, h: innerHeight }));
      assert.ok(b.width >= 64 && b.left < vp.w * 0.15 && b.bottom > vp.h * 0.85, `bottom-left, ${b.width}pt`);
      assert.equal(await page.eval(noText), '');
      // The car waits on the map.
      assert.equal(await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'car' && e.room === 'city').length), 1);
      await goKitchen(page);
      assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.ui-pocket')).visibility), 'visible');
      ids = await page.eval(() => {
        const all = Object.values(window.__store.state.entities);
        const f = (k) => all.find((e) => e.kind === k && e.room === 'cafe/kitchen');
        return { cup: f('cupcake').id, kid: all.find((e) => e.kind === 'char' && e.props.cast === 'girl9').id, bag: f('backpack').id, apple: f('apple').id, banana: f('banana').id };
      });
      // Setup (not under test): she holds the banana.
      await page.eval(({ kid, banana }) => window.__store.dispatch('attach', { id: banana, parent: kid, slot: 'hand-r' }), ids);
    });

    it('drag a cupcake and a character into the pocket in the kitchen', async () => {
      const pk = await page.box('.ui-pocket');
      // Dragging opens the tray by itself; the cupcake goes on the button.
      await drag(page, await at(page, ids.cup), { x: pk.cx, y: pk.cy });
      await page.waitFor(() => window.__town.carry.ids().length === 1);
      // The character goes on the tray (it peeks open while she is carried).
      const kid0 = await ent(page, ids.kid);
      const g = page.gesture();
      // By her head: in the cafe strip she stands near the tray, and a mostly
      // downward pull on her apron would take the apron off instead.
      const from = await at(page, ids.kid, 0.2);
      const to = { x: pk.cx + pk.w * 2.5, y: pk.cy };
      await g('touchStart', [{ x: from.x, y: from.y }], 0);
      for (let k = 1; k <= 14; k++) await g('touchMove', [{ x: from.x + (to.x - from.x) * k / 14, y: from.y + (to.y - from.y) * k / 14 }], k * 30);
      await page.frames(3);
      assert.ok(await page.eval(() => document.querySelector('.pocket').classList.contains('is-open')), 'tray peeks open during a drag');
      await page.screenshot(`carry-${name}-tray-peek`);
      await g('touchEnd', [], 15 * 30);
      await page.waitFor(() => window.__town.carry.ids().length === 2);
      assert.deepEqual(await pocket(page), [ids.cup, ids.kid]);
      const kid1 = await ent(page, ids.kid);
      assert.equal(kid1.room, window_pocket(await page.eval(() => window.__store.device)));
      assert.deepEqual(kid1.props.wear, kid0.props.wear, 'outfit kept');
      ids.wear = kid0.props.wear;
      assert.deepEqual((await kidsOf(page, ids.kid)).find((k) => k.slot === 'hand-r'), { id: ids.banana, kind: 'banana', slot: 'hand-r' }, 'still holds the banana');
      assert.equal(await at(page, ids.cup), null, 'no longer in the kitchen');
      // Thumbnails: a sprite and a character portrait.
      assert.ok(await page.eval(() => !!document.querySelector('.pocket-cell.is-full img') && !!document.querySelector('.pocket-cell.is-full .pocket-char .rig')));
      await page.tapElement('.ui-pocket');
      await page.waitFor(() => window.__town.carry.open);
      await page.frames(20);
      await page.screenshot(`carry-${name}-pocket-kitchen`);
    });

    it('in the city they are still in the pocket; the cupcake comes out onto the map, she gets into the car', async () => {
      await page.tapElement('.ui-map');
      await page.waitFor(`window.__town.at === 'city' && ${IDLE}`);
      assert.deepEqual(await pocket(page), [ids.cup, ids.kid]);
      // Cupcake out onto the sidewalk.
      const c0 = await cell(page, 0);
      assert.equal(c0.id, ids.cup);
      const vp = await page.eval(() => ({ w: innerWidth, h: innerHeight }));
      await drag(page, c0, { x: vp.w * 0.45, y: vp.h * 0.6 });
      const cup = await ent(page, ids.cup);
      assert.equal(cup.room, 'city');
      assert.ok(cup.y >= 655 && cup.y <= 815, `rests on the street (y ${cup.y})`);
      // She comes out of the pocket straight into the car.
      const carId = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'car').id);
      ids.car = carId;
      const k0 = await cell(page, 0);
      assert.equal(k0.id, ids.kid);
      await drag(page, k0, await at(page, carId));
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(ids.kid)}].parent != null`);
      const kid = await ent(page, ids.kid);
      assert.equal(kid.parent, carId, 'sitting in the car');
      assert.equal(kid.props.pose, 'sit');
      assert.deepEqual(await pocket(page), []);
      await page.frames(20);
      await page.screenshot(`carry-${name}-car`);
    });

    it('tap the car: it honks, drives to the cafe and its passenger goes inside (with us)', async () => {
      // P2c.1 built the construction site and P2d.1 the school, the next
      // places to the right of the car's first spot: park it past the school
      // first (clear of the painted bus), so the next built place is the cafe,
      // around the block.
      await page.eval((id) => {
        const e = window.__store.state.entities[id];
        window.__store.dispatch('move', { id, room: 'city', x: 2300, y: e.y });
        window.__stage.camera.panTo(2300 - 720);
      }, ids.car);
      await page.waitFor(() => !window.__stage.camera.moving);
      // The long move slides the car over: wait until it is drawn there.
      await page.waitFor(`window.__town.scene.view.viewOf(${JSON.stringify(ids.car)}).el.getAnimations().length === 0`);
      await page.frames(4);
      // Every place on the street can be gone into now; with a passenger the
      // car heads for the nearest one in its direction of travel (to the
      // right), or around the block to the first one.
      const doors = await page.eval(() => window.__town.scene.doors());
      assert.deepEqual(doors.map((d) => [d.building, !!d.location]), [['cafe', true], ['theater', true], ['construction', true], ['school', true]]);
      const ahead = doors.filter((d) => d.location && d.x > 2300);
      const dest = (ahead[0] || doors.find((d) => d.location)).location;
      assert.equal(dest, 'cafe/kitchen', 'past the school, the next place is the cafe');
      const car = await at(page, ids.car);
      await page.tap(car.x, car.y);
      await page.waitFor(() => window.__town.carry.stats.drives === 1);
      assert.deepEqual(await page.eval(() => window.__town.carry.stats.lastDrive), { building: 'cafe', location: dest });
      await page.frames(8);
      await page.screenshot(`carry-${name}-driving`);
      await page.waitFor(`window.__town.at === 'cafe/kitchen' && ${IDLE}`, { timeout: 20000 });
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(ids.kid)}].room === 'cafe/kitchen'`);
      const kid = await ent(page, ids.kid);
      assert.equal(kid.room, 'cafe/kitchen');
      assert.equal(kid.parent, null);
      assert.equal(kid.props.pose, 'stand');
      assert.deepEqual(kid.props.wear, ids.wear, 'arrives in the same outfit');
      assert.ok((await kidsOf(page, ids.kid)).some((k) => k.id === ids.banana), 'still holds the banana');
      assert.ok(await at(page, ids.kid), 'drawn in the kitchen');
      // The car stayed parked at the cafe on the map.
      const carE = await ent(page, ids.car);
      assert.equal(carE.room, 'city');
      assert.ok(Math.abs(carE.x - 378) < 130 && (carE.x > 385 + 90 || carE.x < 203 - 90), `parked by the cafe door, beside the painted car (x ${carE.x})`);
      await page.frames(20);
      await page.screenshot(`carry-${name}-arrived`);
    });

    it('a backpack carries its contents in the pocket, and the pocket survives a reload', async () => {
      await showCounter(page);
      await drag(page, await at(page, ids.apple), await at(page, ids.bag));
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(ids.apple)}].parent === ${JSON.stringify(ids.bag)}`);
      assert.equal((await ent(page, ids.apple)).parent, ids.bag, 'apple in the bag');
      const pk = await page.box('.ui-pocket');
      // Grab the bag low (the apple peeks out of its top).
      await drag(page, await at(page, ids.bag, 0.95), { x: pk.cx, y: pk.cy });
      await page.waitFor(() => window.__town.carry.ids().length === 1);
      assert.deepEqual(await pocket(page), [ids.bag], await page.eval(() => window.__town.carry.ids().map((i) => window.__store.state.entities[i].kind).join()));
      assert.ok(await page.eval(() => document.querySelectorAll('.pocket-cell.is-full .pocket-count i').length === 1), 'a dot says something is inside');
      // Reload (the pocket is in the saved world).
      await page.frames(20);
      await page.goto('index.html');
      await page.waitFor(IDLE);
      assert.equal(await page.eval(() => window.__town.at), 'cafe/kitchen');
      assert.deepEqual(await pocket(page), [ids.bag], await page.eval(() => window.__town.carry.ids().map((i) => window.__store.state.entities[i].kind).join()));
      assert.equal((await ent(page, ids.apple)).parent, ids.bag);
      // To the map, and the bag comes out there with the apple in it.
      await page.tapElement('.ui-map');
      await page.waitFor(`window.__town.at === 'city' && ${IDLE}`);
      const vp = await page.eval(() => ({ w: innerWidth, h: innerHeight }));
      await drag(page, await cell(page, 0), { x: vp.w * 0.62, y: vp.h * 0.62 });
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(ids.bag)}].room === 'city'`);
      assert.equal((await ent(page, ids.bag)).room, 'city');
      assert.equal((await ent(page, ids.apple)).parent, ids.bag, 'the apple came along inside');
      // The cupcake is still where it was dropped on the map.
      assert.equal((await ent(page, ids.cup)).room, 'city');
      assert.ok(await at(page, ids.cup));
      await page.frames(20);
      await page.screenshot(`carry-${name}-city-bag`);
    });

    it('hold a dragged thing on the cafe door: it goes in with the finger still on it, and back out via the map button', async () => {
      const bag = await at(page, ids.bag, 0.95);
      const door = await page.eval(() => { const w = window.__town.scene.doorWorld('cafe'); return window.__stage.worldToScreen(w.x, w.y); });
      const g = page.gesture();
      let t = 0;
      await g('touchStart', [{ x: bag.x, y: bag.y }], t);
      for (let k = 1; k <= 14; k++) { t += 30; await g('touchMove', [{ x: bag.x + (door.x - bag.x) * k / 14, y: bag.y + (door.y - bag.y) * k / 14 }], t); }
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy, { timeout: 10000 });
      await page.waitFor(() => window.__town.carry.stats.adopted >= 1, { timeout: 5000 });
      assert.deepEqual(await page.eval(() => window.__town.scene.view.heldIds()), [ids.bag], 'still under the finger in the kitchen');
      const vp = await page.eval(() => ({ w: innerWidth, h: innerHeight }));
      const drop = { x: vp.w * 0.5, y: vp.h * 0.8 };
      for (let k = 1; k <= 10; k++) { t += 30; await g('touchMove', [{ x: door.x + (drop.x - door.x) * k / 10, y: door.y + (drop.y - door.y) * k / 10 }], t); }
      await page.frames(3);
      t += 30;
      await g('touchEnd', [], t);
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(ids.bag)}].room === 'cafe/kitchen'`);
      assert.equal((await ent(page, ids.apple)).parent, ids.bag);
      assert.deepEqual(await pocket(page), []);
      // And out again: hold the bag on the map button.
      const b2 = await at(page, ids.bag, 0.95);
      const mb = await page.box('.ui-map');
      const g2 = page.gesture();
      t = 0;
      await g2('touchStart', [{ x: b2.x, y: b2.y }], t);
      for (let k = 1; k <= 14; k++) { t += 30; await g2('touchMove', [{ x: b2.x + (mb.cx - b2.x) * k / 14, y: b2.y + (mb.cy - b2.y) * k / 14 }], t); }
      await page.frames(3);
      assert.ok(await page.eval(() => document.querySelector('.ui-map').classList.contains('is-charging')), 'the map button fills up');
      await page.waitFor(() => window.__town.at === 'city' && !window.__town.busy, { timeout: 10000 });
      await page.waitFor(() => window.__town.carry.stats.adopted >= 2, { timeout: 5000 });
      const street = { x: vp.w * 0.7, y: vp.h * 0.6 };
      for (let k = 1; k <= 8; k++) { t += 30; await g2('touchMove', [{ x: mb.cx + (street.x - mb.cx) * k / 8, y: mb.cy + (street.y - mb.cy) * k / 8 }], t); }
      await page.frames(3);
      t += 30;
      await g2('touchEnd', [], t);
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(ids.bag)}].room === 'city'`);
      assert.equal((await ent(page, ids.apple)).parent, ids.bag);
    });

    it('a full pocket says no, the car does not fit, and nothing ever errors or leaves the iPad', async () => {
      // Six things in (setup through the store), then a real drag of a seventh.
      await page.eval(() => {
        const s = window.__store;
        const room = window.__town.carry.pocketRoom;
        for (let i = 0; i < 6; i++) s.dispatch('spawn', { id: s.newId(), kind: 'ball', room, x: 10 + i, y: 0 });
      });
      const pk = await page.box('.ui-pocket');
      const before = await ent(page, ids.cup);
      await drag(page, await at(page, ids.cup), { x: pk.cx, y: pk.cy });
      await page.frames(10);
      assert.equal((await ent(page, ids.cup)).room, 'city', 'a full pocket refuses');
      assert.ok(await page.eval(() => window.__town.carry.stats.refused >= 1));
      void before;
      await drag(page, await at(page, ids.car), { x: pk.cx, y: pk.cy });
      await page.frames(10);
      assert.equal((await ent(page, ids.car)).room, 'city', 'the car does not go in a pocket');
      assert.equal(await page.eval(noText), '');
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
    });
  });
}

function window_pocket(device) { return 'pocket/' + device; }
