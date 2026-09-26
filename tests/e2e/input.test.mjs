// End-to-end: the P1.6 input module on the wide test room's blob demo
// (index.html?room=wide), driven with real (trusted) CDP touch input on the
// three iPad landscape viewports: tap / sloppy tap / long-press / drag
// classification, exact finger tracking (also while panned), edge auto-pan,
// two simultaneous drags, background pan vs blob drag, padded hit boxes and
// pointercancel recovery.

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pt = (x, y, id = 0) => ({ x, y, id, radiusX: 11, radiusY: 11, force: 1 });

/** Blob i's model state and counters, read in the page. */
const blob = (page, i) => page.eval((n) => {
  const d = window.__scene.demo.blobs[n];
  const ds = d.el.dataset;
  const num = (k) => Number(ds[k]);
  return {
    x: d.state.x, y: d.state.y, hue: d.state.hue,
    taps: num('taps'), longPresses: num('longPresses'), drags: num('drags'), commits: num('commits'), cancels: num('cancels'),
    dragging: 'dragging' in ds,
  };
}, i);

/** Screen point of blob i's center (plus a world offset). */
const blobScreen = (page, i, ox = 0, oy = 0) => page.eval(([n, a, b]) => {
  const s = window.__scene.demo.blobs[n].state;
  return window.__stage.worldToScreen(s.x + a, s.y + b);
}, [i, ox, oy]);

const cam = (page) => page.eval(() => window.__stage.camera.x);
const settled = () => !window.__stage.camera.moving && !window.__stage.camera.dragging;
const debug = (page) => page.eval(() => window.__input.debug());
const moves = (page) => page.eval(() => window.__scene.demo.moves.length);

/** Assert blob i sits so that the world point grabbed at `grabW` (blob-relative offset) is under screen point p. */
async function assertUnderFinger(page, i, grab, p, msg) {
  // Chrome delivers pointermove aligned to animation frames: let the last
  // queued move reach the page before measuring (it may lag on a busy machine).
  await page.frames(2);
  // Read the finger's world point and the blob in ONE eval: during edge
  // auto-pan the camera moves every frame, and two separate evals can land on
  // either side of a frame (seen as a steady 18.45 units off on a busy machine).
  const { w, b } = await page.eval(([x, y, n]) => {
    const s = window.__scene.demo.blobs[n].state;
    return { w: window.__stage.screenToWorld(x, y), b: { x: s.x, y: s.y } };
  }, [p.x, p.y, i]);
  const err = Math.hypot(b.x + grab.x - w.x, b.y + grab.y - w.y);
  assert.ok(err < 0.01, `${msg}: blob ${i} is ${err} units off the finger`);
  // And the DOM agrees: the finger is over the blob.
  const hit = await page.eval(([x, y, n]) => {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest(`[data-blob="${n}"]`));
  }, [p.x, p.y, i]);
  assert.ok(hit, `${msg}: elementFromPoint under the finger is blob ${i}`);
}

/** One-finger touch path: down at from, steps to `to`, optional holds, optional end. */
// Events carry gesture-relative timestamps (page.gesture), so the page sees
// the scripted timing even if this process runs late on a busy machine.
async function touchPath(page, from, to, { steps = 10, stepMs = 16, holdStartMs = 0, holdEndMs = 0, end = 'touchEnd', id = 0 } = {}) {
  const g = page.gesture();
  await g('touchStart', [pt(from.x, from.y, id)], 0);
  if (holdStartMs) await sleep(holdStartMs);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    await g('touchMove', [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, id)], holdStartMs + (k - 1) * stepMs);
    await sleep(stepMs);
  }
  if (holdEndMs) await sleep(holdEndMs);
  if (end) await g(end, [], holdStartMs + steps * stepMs + holdEndMs);
  else await page.frames(2);   // finger still down: let the frame-aligned moves arrive
}

async function assertNothingStuck(page) {
  const d = await debug(page);
  assert.deepEqual(d.pointers, [], 'no pointers tracked');
  assert.equal(d.panning, false);
  assert.equal(d.autopanLoop, false, 'edge auto-pan loop stopped');
  assert.equal(await page.eval(() => document.querySelectorAll('[data-dragging]').length), 0);
}

for (const name of ['ipad-pro-9.7', 'ipad-air', 'ipad-pro-12.9']) {
  describe(`input on ${name}`, () => {
    let page;
    let s;
    before(async () => {
      page = await openPage({ viewport: name, path: 'index.html?room=wide' });
      s = await page.eval(() => window.__stage.s);
    });
    after(async () => { if (page) await page.close(); });
    beforeEach(async () => {
      await page.eval(() => { window.__stage.camera.panTo(0); window.__scene.demo.reset(); });
    });

    it('a tap is a tap: squish, no drag, no move', async () => {
      const b0 = await blob(page, 1);
      const c = await blobScreen(page, 1);
      await page.tap(c.x, c.y);
      const b1 = await blob(page, 1);
      assert.equal(b1.taps, b0.taps + 1);
      assert.deepEqual([b1.drags, b1.commits, b1.longPresses, b1.x, b1.y], [b0.drags, b0.commits, b0.longPresses, b0.x, b0.y]);
    });

    it('a sloppy tap with 12pt of jitter is still a tap', async () => {
      const b0 = await blob(page, 1);
      const c = await blobScreen(page, 1);
      // A 40ms wiggle. The events carry their own 5ms-apart timestamps and are
      // sent back to back without waiting for each reply: one round trip per
      // event could add up past the long-press timer (500ms, real time in the
      // page) on a busy machine and turn the tap into a long-press.
      const g = page.gesture();
      let t = 0;
      await Promise.all([
        g('touchStart', [pt(c.x, c.y)], 0),
        ...[[4, 3], [9, 6], [12, 0], [5, -8], [-8, 8.9], [-3, 11], [2, 4]]
          .map(([dx, dy]) => g('touchMove', [pt(c.x + dx, c.y + dy)], t += 5)),
        g('touchEnd', [], t + 5),
      ]);
      const b1 = await blob(page, 1);
      assert.equal(b1.taps, b0.taps + 1, 'counted as a tap');
      assert.deepEqual([b1.drags, b1.commits, b1.x, b1.y], [b0.drags, b0.commits, b0.x, b0.y], 'did not drag');
      assert.equal(await cam(page), 0);
    });

    it('a long-press is a long-press (not a tap); moving after it drags', async () => {
      const b0 = await blob(page, 0);
      const c = await blobScreen(page, 0);
      await page.longPress(c.x, c.y, { holdMs: 700 });
      const b1 = await blob(page, 0);
      assert.equal(b1.longPresses, b0.longPresses + 1);
      assert.notEqual(b1.hue, b0.hue, 'long-press changed the color');
      assert.deepEqual([b1.taps, b1.drags, b1.commits], [b0.taps, b0.drags, b0.commits]);
      // Long-press then carry it.
      await touchPath(page, c, { x: c.x + 150, y: c.y - 40 }, { holdStartMs: 650 });
      const b2 = await blob(page, 0);
      assert.equal(b2.longPresses, b1.longPresses + 1);
      assert.deepEqual([b2.taps, b2.drags, b2.commits], [b1.taps, b1.drags + 1, b1.commits + 1]);
      assert.ok(Math.abs(b2.x - (b1.x + 150 / s)) < 0.01);
    });

    it('a drag carries the blob exactly under the finger, lifted, and commits once on drop', async () => {
      const b0 = await blob(page, 1);
      const m0 = await moves(page);
      const grab = { x: 25, y: -30 };                         // grab off-center
      const from = await blobScreen(page, 1, grab.x, grab.y);
      const to = { x: from.x - 180, y: from.y - 260 };
      await touchPath(page, from, to, { steps: 14, end: null });
      // Mid-drag: under the finger, lifted, no commit yet.
      await assertUnderFinger(page, 1, grab, to, 'mid-drag');
      const mid = await blob(page, 1);
      assert.equal(mid.dragging, true);
      assert.equal(mid.commits, b0.commits, 'no commit while dragging');
      assert.equal(await moves(page), m0);
      await sleep(200);   // lift transition done, tilt settled
      const lift = await page.eval(() => {
        const el = document.querySelector('[data-blob="1"]');
        return {
          transform: el.querySelector('[data-lift]').style.transform,
          shadow: getComputedStyle(el.querySelector('[data-lift-shadow]')).opacity,
          z: getComputedStyle(el).zIndex,
        };
      });
      assert.match(lift.transform, /scale\(1\.08\) rotate\(0deg\)/);
      assert.equal(lift.shadow, '1');
      assert.equal(lift.z, '1000');
      await page.screenshot(`input-${name}-drag-lifted`);
      await page.touch('touchEnd', []);
      const b1 = await blob(page, 1);
      assert.deepEqual([b1.taps, b1.drags, b1.commits, b1.dragging], [b0.taps, b0.drags + 1, b0.commits + 1, false]);
      assert.equal(await moves(page), m0 + 1, 'exactly one move op per drag');
      await assertUnderFinger(page, 1, grab, to, 'after drop');
      assert.equal(await cam(page), 0, 'a blob drag does not pan');
      await sleep(250);
      const rest = await page.eval(() => {
        const el = document.querySelector('[data-blob="1"]');
        return [el.querySelector('[data-lift]').style.transform, el.querySelector('[data-lift]').style.transition,
          getComputedStyle(el.querySelector('[data-lift-shadow]')).opacity];
      });
      assert.deepEqual(rest, ['', '', '0'], 'set down: lift and shadow reset');
    });

    it('the drag tilts with velocity (clamped) while moving fast', async () => {
      const c = await blobScreen(page, 1);
      await page.touch('touchStart', [pt(c.x, c.y)]);
      let maxTilt = 0;
      for (let k = 1; k <= 10; k++) {
        await page.touch('touchMove', [pt(c.x - k * 30, c.y)]);
        await sleep(8);
        const deg = await page.eval(() => {
          const m = /rotate\((-?[\d.]+)deg\)/.exec(document.querySelector('[data-blob="1"] [data-lift]').style.transform);
          return m ? Number(m[1]) : 0;
        });
        maxTilt = Math.max(maxTilt, deg);
      }
      assert.ok(maxTilt > 3 && maxTilt <= 12, `swung back against a leftward drag (${maxTilt})`);
      await sleep(200);
      const still = await page.eval(() => document.querySelector('[data-blob="1"] [data-lift]').style.transform);
      assert.match(still, /rotate\(0deg\)/, 'tilt settles when the finger stops');
      await page.touch('touchEnd', []);
    });

    it('while panned, a drag still lands on the exact world point under the finger, and does not pan', async () => {
      await page.eval(() => window.__stage.camera.panTo(700));
      const grab = { x: -40, y: 20 };
      const from = await blobScreen(page, 2, grab.x, grab.y);
      const to = { x: from.x - 260, y: from.y + 120 };
      const b0 = await blob(page, 2);
      await touchPath(page, from, to, { steps: 12 });
      assert.equal(await cam(page), 700, 'camera untouched by a blob drag');
      await assertUnderFinger(page, 2, grab, to, 'panned drop');
      const b1 = await blob(page, 2);
      assert.ok(Math.abs(b1.x - (b0.x - 260 / s)) < 0.01 && Math.abs(b1.y - (b0.y + 120 / s)) < 0.01);
    });

    it('a background drag pans the room; a blob drag the same way does not', async () => {
      const width = await page.eval(() => innerWidth);
      const y = await page.eval(() => window.__stage.worldToScreen(0, 150).y);
      await page.drag({ x: width * 0.7, y }, { x: width * 0.7 - 300, y }, { steps: 10, durationMs: 200 });
      await page.waitFor(settled, { timeout: 4000 });
      const panned = await cam(page);
      assert.ok(panned >= 300 / s - 1, `background drag panned ${panned}`);
      await page.eval(() => window.__stage.camera.panTo(0));
      const c = await blobScreen(page, 1);
      await page.drag(c, { x: c.x - 300, y: c.y }, { steps: 10, durationMs: 200 });
      await page.waitFor(settled, { timeout: 4000 });
      assert.equal(await cam(page), 0, 'blob drag did not pan');
    });

    it('edge auto-pan: holding a blob at the right edge pans the room, the blob rides along under the finger', async () => {
      const width = await page.eval(() => innerWidth);
      const from = await blobScreen(page, 1);
      const to = { x: width - 12, y: from.y };
      const b0 = await blob(page, 1);
      await touchPath(page, from, to, { steps: 12, end: null });
      await sleep(700);
      const c1 = await cam(page);
      assert.ok(c1 > 150, `camera panned right while held at the edge (${c1})`);
      await assertUnderFinger(page, 1, { x: 0, y: 0 }, to, 'riding the auto-pan');
      await page.screenshot(`input-${name}-edge-autopan`);
      await sleep(300);
      const c2 = await cam(page);
      assert.ok(c2 > c1, 'still panning while held');
      await page.touch('touchEnd', []);
      const b1 = await blob(page, 1);
      assert.equal(b1.commits, b0.commits + 1);
      assert.ok(b1.x > b0.x + c2 - 1, `blob carried across the room (${b0.x} -> ${b1.x})`);
      const c3 = await cam(page);
      await sleep(150);
      assert.equal(await cam(page), c3, 'auto-pan stops on release');
      await assertNothingStuck(page);
      // And back to the left edge.
      const back = await blobScreen(page, 1);
      await touchPath(page, back, { x: 10, y: back.y }, { steps: 12, holdEndMs: 900 });
      assert.ok((await cam(page)) < c3 - 150, 'panned left at the left edge');
      await assertNothingStuck(page);
    });

    it('two fingers drag two blobs at once, independently', async () => {
      const a0 = await blob(page, 0);
      const b0 = await blob(page, 1);
      const fa = await blobScreen(page, 0);
      const fb = await blobScreen(page, 1);
      const va = { x: 160, y: -220 };
      const vb = { x: -120, y: -300 };
      await page.touch('touchStart', [pt(fa.x, fa.y, 0)]);
      await page.touch('touchStart', [pt(fa.x, fa.y, 0), pt(fb.x, fb.y, 1)]);
      const at = (f, v, t) => ({ x: f.x + v.x * t, y: f.y + v.y * t });
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        const pa = at(fa, va, t);
        const pb = at(fb, vb, t);
        await page.touch('touchMove', [pt(pa.x, pa.y, 0), pt(pb.x, pb.y, 1)]);
        await sleep(16);
      }
      await page.frames(2);   // frame-aligned moves delivered
      const ea = at(fa, va, 1);
      const eb = at(fb, vb, 1);
      assert.equal((await debug(page)).pointers.filter((p) => p.state === 'drag').length, 2);
      await assertUnderFinger(page, 0, { x: 0, y: 0 }, ea, 'finger A');
      await assertUnderFinger(page, 1, { x: 0, y: 0 }, eb, 'finger B');
      await page.screenshot(`input-${name}-two-finger-drag`);
      // Lift finger A first (CDP touchEnd lists the points released): B keeps dragging.
      await page.touch('touchEnd', [pt(ea.x, ea.y, 0)]);
      assert.equal((await blob(page, 0)).commits, a0.commits + 1);
      assert.equal((await blob(page, 1)).dragging, true);
      await page.touch('touchMove', [pt(eb.x + 50, eb.y, 1)]);
      await page.touch('touchEnd', []);
      await assertUnderFinger(page, 1, { x: 0, y: 0 }, { x: eb.x + 50, y: eb.y }, 'finger B after A lifted');
      const a1 = await blob(page, 0);
      const b1 = await blob(page, 1);
      assert.deepEqual([a1.drags, a1.commits, b1.drags, b1.commits], [a0.drags + 1, a0.commits + 1, b0.drags + 1, b0.commits + 1]);
      assert.equal(await cam(page), 0);
      await assertNothingStuck(page);
    });

    it('one finger holds a blob while another pans the room: the blob stays under its finger', async () => {
      const fa = await blobScreen(page, 1);
      const hold = { x: fa.x, y: fa.y - 60 };
      await touchPath(page, fa, hold, { steps: 4, end: null });
      const width = await page.eval(() => innerWidth);
      const y = await page.eval(() => window.__stage.worldToScreen(0, 150).y);
      const p0 = { x: width * 0.8, y };
      await page.touch('touchStart', [pt(hold.x, hold.y, 0), pt(p0.x, p0.y, 1)]);
      for (let k = 1; k <= 10; k++) {
        await page.touch('touchMove', [pt(hold.x, hold.y, 0), pt(p0.x - k * 25, y, 1)]);
        await sleep(40);
      }
      await sleep(120);
      await page.touch('touchEnd', [pt(p0.x - 250, y, 1)]);   // pan finger up (it rested: no fling)
      await page.waitFor(settled, { timeout: 4000 });
      const c = await cam(page);
      assert.ok(Math.abs(c - 250 / s) < 1, `second finger panned ${c}`);
      await assertUnderFinger(page, 1, { x: 0, y: 0 }, hold, 'held through a pan');
      await page.touch('touchEnd', []);
      await assertNothingStuck(page);
    });

    it('a pointercancel mid-drag leaves nothing stuck', async () => {
      const b0 = await blob(page, 1);
      const c = await blobScreen(page, 1);
      await touchPath(page, c, { x: c.x + 120, y: c.y - 80 }, { end: 'touchCancel' });
      const b1 = await blob(page, 1);
      assert.deepEqual([b1.cancels, b1.commits, b1.dragging, b1.taps], [b0.cancels + 1, b0.commits + 1, false, b0.taps]);
      await assertNothingStuck(page);
      await sleep(250);
      assert.equal(await page.eval(() => document.querySelector('[data-blob="1"] [data-lift]').style.transform), '');
      // Cancel during edge auto-pan: the room stops.
      const width = await page.eval(() => innerWidth);
      const c2 = await blobScreen(page, 1);
      await touchPath(page, c2, { x: width - 10, y: c2.y }, { holdEndMs: 500, end: 'touchCancel' });
      const x1 = await cam(page);
      await sleep(200);
      assert.equal(await cam(page), x1, 'auto-pan stopped by the cancel');
      await assertNothingStuck(page);
      // Cancel during a background pan.
      const y = await page.eval(() => window.__stage.worldToScreen(0, 150).y);
      await touchPath(page, { x: width * 0.3, y }, { x: width * 0.5, y }, { end: 'touchCancel' });
      assert.equal(await page.eval(() => window.__stage.camera.dragging), false);
      await assertNothingStuck(page);
      // Everything still works afterwards.
      await page.eval(() => window.__stage.camera.panTo(0));
      const c3 = await blobScreen(page, 0);
      const t0 = (await blob(page, 0)).taps;
      await page.tap(c3.x, c3.y);
      assert.equal((await blob(page, 0)).taps, t0 + 1);
      await touchPath(page, c3, { x: c3.x + 100, y: c3.y - 100 });
      assert.equal((await blob(page, 0)).dragging, false);
      await assertUnderFinger(page, 0, { x: 0, y: 0 }, { x: c3.x + 100, y: c3.y - 100 }, 'drag after cancels');
    });

    it('hit boxes are padded to 64pt: a near miss on the tiny blob still taps it', async () => {
      const r = await page.box('[data-blob="3"]');
      assert.ok(r.w < 40, `tiny blob is ${r.w}pt wide`);
      const t0 = (await blob(page, 3)).taps;
      const pad = (64 - r.w) / 2;
      await page.tap(r.x - pad + 3, r.cy);                   // just inside the padded box
      assert.equal((await blob(page, 3)).taps, t0 + 1);
      await page.tap(r.cx, r.y + r.h + pad - 3);
      assert.equal((await blob(page, 3)).taps, t0 + 2);
      await page.tap(r.x - pad - 12, r.cy);                  // outside it
      assert.equal((await blob(page, 3)).taps, t0 + 2);
      // Padded drag works too.
      const from = { x: r.x - pad + 3, y: r.cy };
      await touchPath(page, from, { x: from.x + 100, y: from.y + 60 });
      assert.equal((await blob(page, 3)).commits >= 1, true);
      assert.equal(await cam(page), 0);
    });

    it('no errors and no external requests', () => {
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
    });
  });
}
