// End-to-end: the P1.7 view layer in the test room (index.html?room=test),
// driven with real (trusted) CDP touch drags on the iPad viewports: drops
// land on the counter, midair drops fall to the floor, drops past the room
// edge are clamped, draw order behind/in front of the table, drop-target
// highlight, tap = sound + squish, two simultaneous drags, persistence
// across reload, and a 60-entity perf check (DOM nodes, drag handler times,
// frame times, rev-diffed renders, idle = no frame loop, no animations).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pt = (x, y, id = 0) => ({ x, y, id, radiusX: 11, radiusY: 11, force: 1 });

/** An entity (by id, or the first of a kind) in the room: store fields plus its view. */
const ent = (page, kind) => page.eval((k) => {
  const s = window.__store.state;
  const e = s.entities[k] || Object.values(s.entities).find((q) => q.kind === k && !q.deleted);
  const v = window.__scene.view.viewOf(e.id);
  const r = v.el.getBoundingClientRect();
  return {
    id: e.id, x: e.x, y: e.y, z: e.z, room: e.room, rev: e.rev,
    zIndex: Number(v.zIndex), scale: v.scale, w: v.sprite.w, h: v.sprite.h,
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
  };
}, kind);

const toScreen = (page, x, y) => page.eval(([a, b]) => window.__stage.worldToScreen(a, b), [x, y]);

/** Screen points (from, to) that grab `e` at its body center and carry its feet to world (tx, ty). */
async function grabPoints(page, e, tx, ty) {
  const lift = (e.h * e.scale) / 2;
  return { from: await toScreen(page, e.x, e.y - lift), to: await toScreen(page, tx, ty - lift) };
}

async function touchDrag(page, from, to, { steps = 12, stepMs = 16, holdEndMs = 0, beforeEnd } = {}) {
  await page.touch('touchStart', [pt(from.x, from.y)]);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    await page.touch('touchMove', [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)]);
    await sleep(stepMs);
  }
  if (holdEndMs) await sleep(holdEndMs);
  if (beforeEnd) await beforeEnd();
  await page.touch('touchEnd', []);
}

/** Drag entity `kind` so its feet go to world (tx, ty); wait for the commit and the landing tween. */
async function dropAt(page, kind, tx, ty, opts) {
  const e = await ent(page, kind);
  const { from, to } = await grabPoints(page, e, tx, ty);
  await touchDrag(page, from, to, opts);
  await page.waitFor(`window.__store.state.entities[${JSON.stringify(e.id)}].rev > ${e.rev}`);
  await page.waitForAnimations(`.ent[data-id="${e.id}"]`);
  return ent(page, kind);
}

const idle = (page) => page.waitFor(() => document.getAnimations().length === 0 && document.querySelectorAll('[data-dragging]').length === 0);

for (const name of ['ipad-pro-9.7', 'ipad-air', 'ipad-pro-12.9']) {
  describe(`entity views on ${name}`, () => {
    let page;
    before(async () => { page = await openPage({ viewport: name, path: 'index.html?room=test' }); });
    after(async () => {
      if (!page) return;
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
      await page.close();
    });

    it('spawns the 10 placeholder items on first boot, resting on surfaces or the floor', async () => {
      const r = await page.eval(() => {
        const view = window.__scene.view;
        return view.ids().map((id) => { const e = window.__store.state.entities[id]; return [e.kind, e.y]; });
      });
      assert.equal(r.length, 10);
      for (const [kind, y] of r) assert.ok([330, 540, 640].includes(y) || (y >= 700 && y <= 960), `${kind} rests (y ${y})`);
      await page.screenshot(`views-${name}-boot`);
    });

    it('a drop over the counter lands ON the counter, with the highlight showing while over it', async () => {
      const e0 = await ent(page, 'test-ball');
      const { from, to } = await grabPoints(page, e0, 650, 470);
      let hl = null;
      await touchDrag(page, from, to, {
        beforeEnd: async () => {
          hl = await page.eval(() => [...document.querySelectorAll('.drop-hl')]
            .filter((h) => h.style.visibility !== 'hidden').map((h) => h.dataset.target));
          await page.screenshot(`views-${name}-highlight`);
        },
      });
      assert.deepEqual(hl, ['surface:counter'], 'the counter glows while the ball is over it');
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(e0.id)}].rev > ${e0.rev}`);
      await page.waitForAnimations(`.ent[data-id="${e0.id}"]`);
      const e = await ent(page, 'test-ball');
      assert.equal(e.y, 540, 'y is exactly the counter line');
      assert.ok(e.x >= 520 && e.x <= 880, `x ${e.x} on the counter`);
      assert.ok(Math.abs(e.x - 650) < 1, 'x kept');
      assert.equal(await page.eval(() => [...document.querySelectorAll('.drop-hl')].filter((h) => h.style.visibility !== 'hidden').length), 0, 'highlight gone after the drop');
      // The element's feet are drawn on the counter line.
      const feet = await toScreen(page, 650, 540);
      assert.ok(Math.abs(e.rect.bottom - feet.y) < 1.5, `drawn feet ${e.rect.bottom} vs counter ${feet.y}`);
      assert.ok(e.z >= 1, 'stacked above what was already on the counter');
      const st = await page.eval(() => window.__scene.view.stats());
      assert.equal(st.lastSound, 'knock');
    });

    it('a drop in midair falls to the floor with a bounce', async () => {
      const e0 = await ent(page, 'test-star');
      const { from, to } = await grabPoints(page, e0, 950, 220);
      await touchDrag(page, from, to);
      // Snapshot the fall animation as it starts.
      const anim = await page.waitFor(`(() => {
        const el = document.querySelector('.ent[data-id="${e0.id}"]');
        const a = el.getAnimations()[0];
        return a && { frames: a.effect.getKeyframes().length, dur: a.effect.getTiming().duration };
      })()`);
      assert.ok(anim.frames >= 4 && anim.dur >= 200, 'a fall tween with a bounce keyframe');
      await page.waitForAnimations(`.ent[data-id="${e0.id}"]`);
      const e = await ent(page, 'test-star');
      assert.equal(e.y, 700, 'landed on the floor band');
      assert.ok(Math.abs(e.x - 950) < 1);
      const floor = await toScreen(page, 950, 700);
      assert.ok(Math.abs(e.rect.bottom - floor.y) < 1.5, 'drawn on the floor, not in midair');
    });

    it('a drop past the room edge is clamped inside the room', async () => {
      const e0 = await ent(page, 'test-bun');
      const lift = (e0.h * e0.scale) / 2;
      const from = await toScreen(page, e0.x, e0.y - lift);
      const vp = await page.eval(() => ({ w: innerWidth, h: innerHeight }));
      await touchDrag(page, from, { x: 2, y: vp.h - 2 });
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(e0.id)}].rev > ${e0.rev}`);
      await page.waitForAnimations(`.ent[data-id="${e0.id}"]`);
      const e = await ent(page, 'test-bun');
      assert.ok(e.x >= e.w * 1.08 / 2 - 0.01, `x ${e.x} clamped`);
      assert.ok(e.y >= 700 && e.y <= 960, `y ${e.y} in the floor band`);
      const left = await toScreen(page, 0, 0);
      assert.ok(e.rect.left >= left.x - 0.5, `drawn inside the room (${e.rect.left} >= ${left.x})`);
      const bottom = await toScreen(page, 0, 1000);
      assert.ok(e.rect.bottom <= bottom.y + 0.5, 'not below the room');
      // And past the right edge / below everything on the tall iPad.
      const e1 = await ent(page, 'test-cup');
      const f1 = await toScreen(page, e1.x, e1.y - (e1.h * e1.scale) / 2);
      await touchDrag(page, f1, { x: vp.w - 2, y: vp.h - 2 });
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(e1.id)}].rev > ${e1.rev}`);
      await page.waitForAnimations(`.ent[data-id="${e1.id}"]`);
      const c = await ent(page, 'test-cup');
      assert.ok(c.x <= 1440 - c.w * 1.08 / 2 + 0.01 && c.y <= 960, `cup ${c.x},${c.y} clamped`);
    });

    it('draw order: behind the table vs in front of it', async () => {
      const table = await page.eval(() => {
        const a = document.querySelector('[data-art="table"]');
        return Number(a.style.zIndex);
      });
      const behind = await dropAt(page, 'test-block', 1170, 760);
      assert.ok(Math.abs(behind.y - 760) < 1, 'stays in the floor band (not snapped onto the table)');
      assert.ok(behind.zIndex < table, `behind: z ${behind.zIndex} < table ${table}`);
      const cx = (behind.rect.left + behind.rect.right) / 2;
      const cy = (behind.rect.top + behind.rect.bottom) / 2;
      const hitBehind = await page.eval(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el.closest('[data-art]') ? el.closest('[data-art]').dataset.art : el.closest('.ent') ? 'ent' : el.className;
      }, [cx, cy]);
      assert.equal(hitBehind, 'table', 'the table art covers the block');
      await page.screenshot(`views-${name}-behind-table`);

      const front = await dropAt(page, 'test-block', 1170, 900);
      assert.ok(Math.abs(front.y - 900) < 1);
      assert.ok(front.zIndex > table, 'in front: above the table');
      const fx = (front.rect.left + front.rect.right) / 2;
      const fy = (front.rect.top + front.rect.bottom) / 2;
      const hitFront = await page.eval(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el.closest('.ent') ? el.closest('.ent').dataset.kind : el.className;
      }, [fx, fy]);
      assert.equal(hitFront, 'test-block');

      const onTable = await dropAt(page, 'test-jar', 1160, 600);
      assert.equal(onTable.y, 640, 'on the table top');
      assert.ok(onTable.zIndex > table, 'a thing on the table draws over the table');
      await page.screenshot(`views-${name}-front-and-on-table`);
    });

    it('tapping an item plays its sound and squishes it', async () => {
      await idle(page);
      const e = await ent(page, 'test-teddy');
      const before = await page.eval(() => window.__scene.view.stats().sounds);
      const p = await toScreen(page, e.x, e.y - (e.h * e.scale) / 2);
      await page.tap(p.x, p.y);
      const squish = await page.waitFor(`(() => {
        const b = document.querySelector('.ent[data-id="${e.id}"] .ent-body');
        return b.getAnimations().length > 0;
      })()`);
      assert.ok(squish);
      const st = await page.eval(() => window.__scene.view.stats());
      assert.equal(st.sounds, before + 1);
      assert.equal(st.lastSound, 'squeak');
      const after = await ent(page, 'test-teddy');
      assert.equal(after.rev, e.rev, 'a tap does not move it');
    });

    it('two simultaneous drags both land', async () => {
      await idle(page);
      const a = await ent(page, 'test-pot');
      const b = await ent(page, 'test-book');
      const pa = await grabPoints(page, a, 1180, 560);   // onto the table
      const pb = await grabPoints(page, b, 400, 820);    // to the floor
      await page.touch('touchStart', [pt(pa.from.x, pa.from.y, 1)]);
      await page.touch('touchStart', [pt(pa.from.x, pa.from.y, 1), pt(pb.from.x, pb.from.y, 2)]);
      const steps = 12;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        await page.touch('touchMove', [
          pt(pa.from.x + (pa.to.x - pa.from.x) * t, pa.from.y + (pa.to.y - pa.from.y) * t, 1),
          pt(pb.from.x + (pb.to.x - pb.from.x) * t, pb.from.y + (pb.to.y - pb.from.y) * t, 2),
        ]);
        await sleep(16);
      }
      const dragging = await page.eval(() => document.querySelectorAll('[data-dragging]').length);
      assert.equal(dragging, 2, 'both held at once');
      await page.touch('touchEnd', [pt(pb.to.x, pb.to.y, 2)]);
      await page.touch('touchEnd', []);
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(a.id)}].rev > ${a.rev} && window.__store.state.entities[${JSON.stringify(b.id)}].rev > ${b.rev}`);
      await idle(page);
      const a2 = await ent(page, 'test-pot');
      const b2 = await ent(page, 'test-book');
      assert.equal(a2.y, 640, 'pot on the table');
      assert.ok(Math.abs(a2.x - 1180) < 1);
      assert.ok(Math.abs(b2.y - 820) < 1, 'book on the floor');
      assert.ok(Math.abs(b2.x - 400) < 1);
      assert.deepEqual((await page.eval(() => window.__input.debug())).pointers, []);
      await page.screenshot(`views-${name}-two-drags`);
    });
  });
}

describe('entity views: persistence and performance (ipad-pro-9.7 viewport)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-pro-9.7', path: 'index.html?room=test' }); });
  after(async () => {
    if (!page) return;
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
    await page.close();
  });

  it('positions persist after a reload (and are not re-spawned)', async () => {
    await dropAt(page, 'test-ball', 700, 480);                  // counter
    await dropAt(page, 'test-teddy', 300, 200);                 // shelf
    await dropAt(page, 'test-bottle', 250, 910);                // floor
    const snap = () => page.eval(() => Object.values(window.__store.state.entities)
      .filter((e) => e.room === 'test/lab').map((e) => [e.id, e.kind, e.x, e.y, e.z]).sort());
    const before = await snap();
    assert.equal(before.length, 10);
    await page.goto('index.html?room=test');
    const after = await snap();
    assert.deepEqual(after, before);
    const drawn = await page.eval(() => window.__scene.view.ids().length);
    assert.equal(drawn, 10);
    const ball = await ent(page, 'test-ball');
    assert.ok(Math.abs(ball.x - 700) < 1 && ball.y === 540);
    const feet = await toScreen(page, 700, 540);
    assert.ok(Math.abs(ball.rect.bottom - feet.y) < 1.5, 'drawn where it was saved');
  });

  it('60 entities: DOM size, drag cost, rev-diffed renders, idle with no frame loop', async () => {
    await page.eval(() => window.__scene.spawnExtra(50));
    await idle(page);
    const dom = await page.eval(() => ({
      views: window.__scene.view.ids().length,
      all: document.querySelectorAll('*').length,
      room: document.querySelector('.room').querySelectorAll('*').length,
    }));
    assert.equal(dom.views, 60);
    assert.ok(dom.room <= 60 * 4 + 40, `room DOM nodes ${dom.room}`);

    // Frame sampler (test instrumentation only) + fresh stats, then one long drag.
    await page.eval(() => {
      window.__scene.view.resetStats();
      window.__frames = [];
      let last = 0;
      const tick = (t) => { if (last) window.__frames.push(t - last); last = t; if (window.__sampling) requestAnimationFrame(tick); };
      window.__sampling = true;
      requestAnimationFrame(tick);
    });
    // An entity not covered by another one at its grab point (the filler overlaps a lot).
    const id = await page.eval(() => window.__scene.view.ids().find((i) => {
      const r = window.__scene.view.viewOf(i).el.getBoundingClientRect();
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return hit && hit.closest('.ent') && hit.closest('.ent').dataset.id === i;
    }));
    const e = await ent(page, id);
    const { from, to } = await grabPoints(page, e, 300, 900);
    await touchDrag(page, from, to, { steps: 40, stepMs: 16 });
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(e.id)}].rev > ${e.rev}`);
    await idle(page);
    const perf = await page.eval(() => {
      window.__sampling = false;
      const f = window.__frames.slice().sort((a, b) => a - b);
      const st = window.__scene.view.stats();
      return {
        moves: st.moves, avgMoveMs: st.moveMs / st.moves, maxMoveMs: st.maxMoveMs, renders: st.renders,
        frames: f.length, medianFrame: f[Math.floor(f.length / 2)], p95Frame: f[Math.floor(f.length * 0.95)], maxFrame: f[f.length - 1],
      };
    });
    console.log(`  perf, 60 entities, ${dom.all} DOM nodes (${dom.room} in the room):`, JSON.stringify(perf));
    assert.ok(perf.moves >= 30, 'drag moves handled');
    assert.ok(perf.avgMoveMs < 4, `drag handler avg ${perf.avgMoveMs}ms`);
    assert.ok(perf.maxMoveMs < 20, `drag handler max ${perf.maxMoveMs}ms (budget 20ms)`);
    assert.equal(perf.renders, 1, 'one drop re-rendered exactly one entity (rev diff)');

    // Idle: no animations and no requestAnimationFrame calls for a while.
    const rafs = await page.eval(async () => {
      let n = 0;
      const orig = window.requestAnimationFrame;
      window.requestAnimationFrame = (fn) => { n++; return orig.call(window, fn); };
      await new Promise((r) => setTimeout(r, 600));
      window.requestAnimationFrame = orig;
      return { n, anims: document.getAnimations().length, willChange: [...document.querySelectorAll('.ent')].filter((el) => el.style.willChange).length };
    });
    assert.deepEqual(rafs, { n: 0, anims: 0, willChange: 0 }, 'idle: no frame loop, no animations, no will-change');
    await page.screenshot('views-60-entities');
  });

  it('fx pool never grows past its cap', async () => {
    const st = await page.eval(async () => {
      const fx = window.__scene.fx;
      for (let i = 0; i < 20; i++) fx.burst(['sparkle', 'puff', 'heart'][i % 3], 300 + i * 40, 400, { count: 8 });
      const during = fx.stats();
      const nodes = document.querySelectorAll('.fx-p').length;
      return { during, nodes };
    });
    assert.equal(st.during.created, 24);
    assert.equal(st.nodes, 24);
    await page.screenshot('views-fx');
    await idle(page);
    assert.equal(await page.eval(() => window.__scene.fx.stats().active), 0);
  });
});
