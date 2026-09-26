// End-to-end: P1.9 containers and spawners in index.html?room=containers,
// driven with real (trusted) CDP touches on iPad viewports:
// - things inside containers are drawn at their slots, nested (tray > plate > cupcake);
// - dragging the tray carries everything on it, during the drag and after;
// - a drag on a spawner pulls out a clone (the egg carton in the fridge, the crayon cup);
// - a full container refuses with a bounce-back (the thing springs back into its old container);
// - a spill scatters the contents to distinct spots (no overlaps);
// - the room cap sends old untouched clones home, never the one a finger holds;
// - contents survive a reload; a container carried to another room keeps them.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pt = (x, y, id = 0) => ({ x, y, id, radiusX: 11, radiusY: 11, force: 1 });
const idle = (page) => page.waitFor(() => document.getAnimations().length === 0 && document.querySelectorAll('[data-dragging]').length === 0);

/** Store + view facts for an entity. */
const ent = (page, id) => page.eval((i) => {
  const e = window.__store.state.entities[i];
  const view = window.__scene.view;
  const v = view.viewOf(i);
  const r = v ? v.body.getBoundingClientRect() : null;   // the body: inside the lift, so it scales with a drag
  return {
    id: i, kind: e.kind, x: e.x, y: e.y, rev: e.rev, parent: e.parent || null, slot: e.slot || null,
    room: e.room, props: e.props, deleted: !!e.deleted, drawn: !!v, drawnIn: view.parentOf(i),
    wx: v ? v.x : null, wy: v ? v.y : null, h: v ? v.sprite.h * v.scale : 0, w: v ? v.sprite.w * v.scale : 0,
    rect: r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.width } : null,
  };
}, id);

const byKind = (page, kind) => page.eval((k) => Object.values(window.__store.state.entities)
  .filter((e) => e.kind === k && !e.deleted).map((e) => e.id).sort(), kind);
const kidsOf = (page, id) => page.eval((i) => Object.values(window.__store.state.entities)
  .filter((e) => e.parent === i && !e.deleted).map((e) => e.id).sort(), id);
const toScreen = (page, x, y) => page.eval(([a, b]) => window.__stage.worldToScreen(a, b), [x, y]);
// up: how far up its height to touch (0.5 = the middle; a thing sunk in a bowl shows only its top).
const bodyPoint = async (page, e, up = 0.5) => toScreen(page, e.wx, e.wy - e.h * up);
const logLen = (page) => page.eval(() => window.__scene.behaviors.log().length);
const lastLog = (page) => page.eval(() => window.__scene.behaviors.log().at(-1));
const clones = (page) => page.eval(() => Object.values(window.__store.state.entities)
  .filter((e) => !e.deleted && e.kind && typeof e.props.from === 'string' && !e.parent).map((e) => e.id));

async function touchPath(page, from, to, { steps = 14, stepMs = 16, end = true, id = 0 } = {}) {
  await page.touch('touchStart', [pt(from.x, from.y, id)]);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    await page.touch('touchMove', [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, id)]);
    await sleep(stepMs);
  }
  if (end) await page.touch('touchEnd', []);
}

/** Drag `id` by its body and drop it with the finger over world point / another entity. */
async function dragTo(page, id, to, up = 0.5) {
  await idle(page);
  const e = await ent(page, id);
  const target = typeof to === 'string' ? await bodyPoint(page, await ent(page, to)) : await toScreen(page, to.x, to.y);
  const from = await bodyPoint(page, e, up);
  assert.equal(await page.eval(([x, y]) => window.__input.hitTest(x, y).dataset.id, [from.x, from.y]), id, 'the finger lands on it');
  await touchPath(page, from, target);
  await idle(page);
}

const rel = (c, t) => ({ x: (c.rect.cx - t.rect.cx) / t.rect.w, y: (c.rect.b - t.rect.b) / t.rect.w });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol, `${msg}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
const overlapArea = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

for (const name of ['ipad-air', 'ipad-pro-9.7']) {
  describe(`containers and spawners on ${name}`, () => {
    let page;
    const ids = {};
    before(async () => {
      page = await openPage({ viewport: name, path: 'index.html?room=containers' });
      await page.waitFor(() => [...document.querySelectorAll('.ent img')].every((i) => i.complete && i.naturalWidth > 0));
      for (const k of ['tray', 'basket', 'bowl', 'fridge', 'egg-carton', 'crayon-cup', 'toy-bin', 'cupcake', 'mug', 'pallet']) ids[k] = (await byKind(page, k))[0];
      const plates = await byKind(page, 'plate');
      for (const p of plates) {
        const e = await ent(page, p);
        if (e.parent) ids.plate = p; else ids.plate2 = p;
      }
      ids.egg = (await kidsOf(page, ids.bowl))[0];
    });
    after(async () => {
      if (!page) return;
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
      await page.close();
    });

    it('draws things inside containers at their slots, nested', async () => {
      const tray = await ent(page, ids.tray);
      const plate = await ent(page, ids.plate);
      const cake = await ent(page, ids.cupcake);
      assert.equal(plate.drawnIn, ids.tray);
      assert.equal(cake.drawnIn, ids.plate);
      assert.equal((await ent(page, ids.mug)).drawnIn, ids.tray);
      assert.ok(plate.rect.cx > tray.rect.l && plate.rect.cx < tray.rect.r && plate.rect.b <= tray.rect.b + 1, 'the plate sits on the tray');
      assert.ok(Math.abs(cake.rect.cx - plate.rect.cx) < 3 && cake.rect.b <= plate.rect.b, 'the cupcake sits in the middle of the plate');
      const fridge = await ent(page, ids.fridge);
      const carton = await ent(page, ids['egg-carton']);
      assert.equal(carton.drawnIn, ids.fridge);
      assert.ok(carton.rect.t > fridge.rect.t && carton.rect.b < fridge.rect.b, 'the egg carton is on a fridge shelf');
      const egg = await ent(page, ids.egg);
      assert.equal(egg.drawnIn, ids.bowl, 'the egg peeks out of the bowl');
      await page.screenshot(`containers-${name}-boot`);
    });

    it('dragging the tray carries the plate, the cupcake and the mug (during and after)', async () => {
      await idle(page);
      const t0 = await ent(page, ids.tray);
      const riders = [ids.plate, ids.cupcake, ids.mug];
      const rel0 = {};
      for (const r of riders) rel0[r] = rel(await ent(page, r), t0);
      // Grab the tray by its left end (the plate covers its middle).
      const from = await toScreen(page, t0.wx - t0.w * 0.4, t0.wy - t0.h * 0.5);
      assert.equal(await page.eval(([x, y]) => window.__input.hitTest(x, y).dataset.id, [from.x, from.y]), ids.tray);
      const dropAt = await toScreen(page, 1000 - t0.w * 0.4, 850 - t0.h * 0.5);
      await touchPath(page, from, dropAt, { end: false });
      // The finger rests: the lift's tilt eases back to 0 (then only a uniform lift scale).
      await page.waitFor(`/rotate\\(0deg\\)/.test(window.__scene.view.viewOf(${JSON.stringify(ids.tray)}).lift.style.transform)`);
      await page.frames(2);
      const mid = await ent(page, ids.tray);
      assert.ok(mid.rect.cx - t0.rect.cx > 100, 'the tray is under the finger');
      for (const r of riders) near(rel(await ent(page, r), mid), rel0[r], 0.03, 'rides along mid-drag');
      await page.screenshot(`containers-${name}-tray-drag`);
      await page.touch('touchEnd', []);
      await idle(page);
      const t1 = await ent(page, ids.tray);
      assert.ok(t1.y >= 700, 'the tray landed on the floor');
      for (const r of riders) {
        const e = await ent(page, r);
        near(rel(e, t1), rel0[r], 0.03, 'still on the tray after the drop');
        assert.equal(e.room, null, 'still inside (no room of its own)');
      }
      assert.equal((await ent(page, ids.cupcake)).parent, ids.plate);
      assert.equal((await ent(page, ids.plate)).parent, ids.tray);
      await page.screenshot(`containers-${name}-tray-dropped`);
    });

    it('a drag on a spawner pulls out a clone (the egg carton in the fridge, the crayon cup)', async () => {
      const carton0 = await ent(page, ids['egg-carton']);
      const eggs0 = await byKind(page, 'egg');
      const n = await logLen(page);
      await touchPath(page, await bodyPoint(page, carton0), await toScreen(page, 620, 500), { steps: 18 });
      await idle(page);
      const eggs = await byKind(page, 'egg');
      assert.equal(eggs.length, eggs0.length + 1, 'a new egg');
      const egg = await ent(page, eggs.find((e) => !eggs0.includes(e)));
      assert.equal(egg.props.from, ids['egg-carton']);
      assert.equal(egg.parent, null);
      assert.equal(egg.y, 540, 'it landed on the counter');
      const carton = await ent(page, ids['egg-carton']);
      assert.equal(carton.parent, ids.fridge, 'the carton stayed in the fridge');
      assert.equal(carton.rev, carton0.rev, 'the carton itself did not move');
      const log = (await page.eval(() => window.__scene.behaviors.log())).slice(n);
      assert.ok(log.some((l) => l.trigger === 'dragOut' && l.via[0] === 'spawner'));

      const cup = await ent(page, ids['crayon-cup']);
      await touchPath(page, await bodyPoint(page, cup), await toScreen(page, 330, 880));
      await idle(page);
      const crayon = await ent(page, (await byKind(page, 'crayon'))[0]);
      assert.equal(crayon.props.from, ids['crayon-cup']);
      assert.ok(crayon.y >= 700);
      assert.match(await page.eval((i) => window.__scene.view.viewOf(i).sprite.key, crayon.id), /crayon:(red|orange|yellow|green|blue|purple)/);
      await page.screenshot(`containers-${name}-cloned`);
    });

    it('a full plate refuses: the egg pulled out of the bowl springs back into the bowl', async () => {
      await page.eval((plate) => {
        // A plate holds 5 (P2a.4: a sandwich stacks up on it).
        for (let i = 0; i < 5; i++) window.__store.dispatch('spawn', { id: window.__store.newId(), kind: i ? 'apple' : 'cupcake', parent: plate, slot: 's' + i });
      }, ids.plate2);
      await idle(page);
      assert.equal((await kidsOf(page, ids.plate2)).length, 5);
      const egg0 = await ent(page, ids.egg);
      const n = await logLen(page);
      await dragTo(page, ids.egg, ids.plate2, 0.85);
      await page.waitFor(`window.__scene.behaviors.log().length > ${n}`);
      const r = await lastLog(page);
      assert.deepEqual(r.via, ['container:refuse']);
      assert.equal(r.reason, 'full');
      assert.ok(r.did.anim && r.did.sound && r.did.fx, 'a playful no, never silent');
      const egg = await ent(page, ids.egg);
      assert.equal(egg.parent, ids.bowl);
      assert.equal(egg.rev, egg0.rev, 'nothing saved');
      assert.equal(egg.drawnIn, ids.bowl, 'drawn back inside the bowl');
      assert.ok(Math.abs(egg.rect.cx - egg0.rect.cx) < 2 && Math.abs(egg.rect.b - egg0.rect.b) < 2, 'back in its slot');
      assert.equal((await kidsOf(page, ids.plate2)).length, 5);
      // Pulled out onto the floor instead, it comes out.
      await dragTo(page, ids.egg, { x: 900, y: 930 }, 0.85);
      const out = await ent(page, ids.egg);
      assert.equal(out.parent, null);
      assert.equal(out.drawnIn, null);
      assert.ok(out.y >= 700);
      await page.screenshot(`containers-${name}-full`);
    });

    it('a spill scatters everything to its own spot: no overlaps', async () => {
      await page.eval((b) => {
        for (const [kind, slot] of [['ball', 's2'], ['cupcake', 's3'], ['toy-car', 's4']]) {
          window.__store.dispatch('spawn', { id: window.__store.newId(), kind, parent: b, slot });
        }
      }, ids.basket);
      await idle(page);
      const inside = await kidsOf(page, ids.basket);
      assert.equal(inside.length, 5);
      const basket = await ent(page, ids.basket);
      const n = await logLen(page);
      const p = await bodyPoint(page, basket);
      await page.longPress(p.x, p.y);
      await page.waitFor(`window.__scene.behaviors.log().length > ${n}`);
      assert.deepEqual((await lastLog(page)).via, ['spill']);
      await idle(page);
      assert.equal((await kidsOf(page, ids.basket)).length, 0);
      const spilled = [];
      for (const id of inside) spilled.push(await ent(page, id));
      for (const e of spilled) {
        assert.equal(e.parent, null);
        assert.ok(e.drawn && !e.drawnIn);
        assert.ok(e.y === 540 || (e.y >= 700 && e.y <= 960), `${e.kind} rests on the counter or floor: ${e.y}`);
      }
      const tops = await page.eval(() => window.__scene.view.ids().filter((i) => !window.__scene.view.parentOf(i)));
      for (let i = 0; i < spilled.length; i++) {
        const a = spilled[i];
        for (const id of tops) {
          if (id === a.id || (spilled.slice(0, i).some((s) => s.id === id))) continue;
          const b = await ent(page, id);
          const o = overlapArea(a.rect, b.rect);
          const small = Math.min((a.rect.r - a.rect.l) * (a.rect.b - a.rect.t), (b.rect.r - b.rect.l) * (b.rect.b - b.rect.t));
          assert.ok(o < small * 0.03, `${a.kind} landed on ${b.kind} (${Math.round(o)} px²)`);
        }
      }
      await page.screenshot(`containers-${name}-spilled`);
    });

    it('past the cap, old untouched clones go home with a poof; never the one a finger holds', async () => {
      await idle(page);
      const cap = await page.eval(() => window.__scene.room.def.cap);
      assert.equal(cap, 12);
      // Finger 0 pulls a crayon out and keeps holding it.
      const cup = await ent(page, ids['crayon-cup']);
      const crayons0 = await byKind(page, 'crayon');
      const holdAt = await toScreen(page, 560, 760);
      await touchPath(page, await bodyPoint(page, cup), holdAt, { end: false });
      const held = (await byKind(page, 'crayon')).find((c) => !crayons0.includes(c));
      assert.ok(held, 'a crayon is in the finger');
      assert.deepEqual(await page.eval(() => window.__scene.view.heldIds()), [held]);
      // Finger 1 taps the toy bin again and again.
      const bin = await ent(page, ids['toy-bin']);
      const tp = await bodyPoint(page, bin);
      const fromBin = [];
      for (let i = 0; i < 14; i++) {
        const before = await page.eval((b) => Object.values(window.__store.state.entities).filter((e) => e.props.from === b).map((e) => e.id), ids['toy-bin']);
        const n = await logLen(page);
        await page.touch('touchStart', [pt(holdAt.x, holdAt.y, 0), pt(tp.x, tp.y, 1)]);
        await sleep(30);
        await page.touch('touchEnd', [pt(tp.x, tp.y, 1)]);
        await page.waitFor(`window.__scene.behaviors.log().length > ${n}`);
        const now = await page.eval((b) => Object.values(window.__store.state.entities).filter((e) => e.props.from === b).map((e) => e.id), ids['toy-bin']);
        fromBin.push(now.find((id) => !before.includes(id)));
      }
      const loose = await clones(page);
      assert.equal(loose.length, 12, `the room is back at its cap (${loose.length})`);
      const h = await ent(page, held);
      assert.equal(h.deleted, false, 'the held crayon never goes home');
      assert.equal((await ent(page, fromBin[0])).deleted, true, 'the oldest untouched clone went home');
      assert.equal((await ent(page, fromBin.at(-1))).deleted, false, 'the newest stayed');
      assert.deepEqual(await page.eval(() => window.__scene.view.heldIds()), [held], 'still in the finger');
      await page.waitFor(() => document.getAnimations().length === 0);   // a finger still holds the crayon
      // Tapped-out clones pop onto free spots: none lands on another thing.
      const tops = await page.eval((h) => window.__scene.view.ids().filter((i) => !window.__scene.view.parentOf(i) && i !== h), held);
      const live = [];
      for (const id of tops) live.push(await ent(page, id));
      for (const a of live.filter((e) => e.props.from === ids['toy-bin'])) {
        for (const b of live) {
          if (b.id === a.id) continue;
          const o = overlapArea(a.rect, b.rect);
          const small = Math.min((a.rect.r - a.rect.l) * (a.rect.b - a.rect.t), (b.rect.r - b.rect.l) * (b.rect.b - b.rect.t));
          assert.ok(o < small * 0.05, `a ${a.kind} from the bin landed on the ${b.kind} (${Math.round(o)} px²)`);
        }
      }
      await page.screenshot(`containers-${name}-capped`);
      await page.touch('touchEnd', []);
      await idle(page);
      const placed = await ent(page, held);
      assert.ok(placed.drawn && placed.y >= 700, 'dropped where the finger let go');
    });

    it('contents survive a reload; the tray carried to the porch keeps its load', async () => {
      const snap = () => page.eval(() => {
        const out = {};
        for (const e of Object.values(window.__store.state.entities)) {
          if (!e.deleted && e.kind) out[e.id] = [e.parent || null, e.slot || null, e.room || null, window.__scene.view.parentOf(e.id)];
        }
        return out;
      });
      const before = await snap();
      await page.goto('index.html?room=containers');
      assert.deepEqual(await snap(), before, 'same parents, slots and drawing after a reload');
      assert.equal((await ent(page, ids.cupcake)).drawnIn, ids.plate);

      const t0 = await ent(page, ids.tray);
      const rel0 = rel(await ent(page, ids.cupcake), t0);
      assert.equal(await page.eval((t) => window.__scene.carry(t, 'test/porch'), ids.tray), true);
      await page.waitFor(`!window.__scene.view.viewOf(${JSON.stringify(ids.tray)})`);
      assert.equal((await ent(page, ids.tray)).drawn, false, 'gone from the pantry');
      assert.equal((await ent(page, ids.cupcake)).drawn, false);
      await page.goto('index.html?room=porch');
      for (let pass = 0; pass < 2; pass++) {
        const tray = await ent(page, ids.tray);
        assert.equal(tray.room, 'test/porch');
        assert.ok(tray.drawn);
        assert.equal((await ent(page, ids.plate)).drawnIn, ids.tray);
        assert.equal((await ent(page, ids.mug)).drawnIn, ids.tray);
        const cake = await ent(page, ids.cupcake);
        assert.equal(cake.drawnIn, ids.plate);
        near(rel(cake, tray), rel0, 0.03, 'the cupcake is still on the plate on the tray');
        await page.screenshot(`containers-${name}-porch-${pass}`);
        if (!pass) await page.goto('index.html?room=porch');
      }
    });

    it('tidy sends loose things home', async () => {
      await page.goto('index.html?room=containers');
      assert.ok((await clones(page)).length > 0);
      const done = await page.eval(() => window.__scene.tidy());
      assert.ok(done.length > 0);
      await idle(page);
      assert.deepEqual(await clones(page), [], 'every clone went back to its spawner');
      assert.ok((await ent(page, ids.fridge)).drawn, 'furniture stays');
      await page.screenshot(`containers-${name}-tidy`);
    });
  });
}
