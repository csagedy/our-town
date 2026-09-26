// End-to-end: the P1.5 stage and camera on the wide test room
// (index.html?room=wide, 2880 units of colored stripes), on all three iPad
// viewports in landscape and then rotated to portrait. Real touch input only.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage, VIEWPORTS } from '../../tools/harness.mjs';

const ROOM_W = 2880;
const MAX_CAM = ROOM_W - 1440;

const cam = () => window.__stage.camera.x;
const settled = () => !window.__stage.camera.moving && !window.__stage.camera.dragging;
const squishes = () => document.querySelector('.buddy').dataset.squishes;

/**
 * Speed up the camera's clock: rAF callbacks get timestamps that run `k`
 * times faster than real time, so each fling plays out (and settles) k times
 * sooner. The camera measures motion only from rAF timestamps and clamps a
 * frame to 50ms, so k = 3 (a 16.7ms frame -> 50ms) keeps every fling's path
 * and distance identical to real time; the fling math itself is unit-tested
 * with a fake clock (tests/unit/camera.test.mjs). Drag input still runs at
 * real speed with real timestamps (see page.drag in tools/harness.mjs).
 */
function fastFrameClock(k) {
  const orig = window.requestAnimationFrame.bind(window);
  let t0 = null;
  window.requestAnimationFrame = (fn) => orig((t) => {
    if (t0 === null) t0 = t;
    fn(t0 + (t - t0) * k);
  });
  return true;
}

/** Rotate the emulated iPad (resize + orientation). */
async function rotate(page, { width, height }, portrait) {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: true,
    screenOrientation: portrait ? { type: 'portraitPrimary', angle: 0 } : { type: 'landscapePrimary', angle: 90 },
  });
  await page.waitFor(`window.__stage.vw === ${width} && innerWidth === ${width}`);
}

/**
 * Screenshot with the page backdrop (body/#app) painted magenta, and count
 * magenta pixels: any gap in the room art or its bleed shows up as magenta.
 */
async function gapPixels(page, name) {
  await page.eval(() => {
    document.body.dataset.gapCheck = document.body.getAttribute('style') || '';
    document.body.style.background = '#ff00ff';
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const file = await page.screenshot(name);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  const count = await page.eval(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 230 && px[i + 1] < 40 && px[i + 2] > 230) n++;
    return { n, w: c.width, h: c.height };
  }, data);
  await page.eval(() => {
    document.body.setAttribute('style', document.body.dataset.gapCheck);
    delete document.body.dataset.gapCheck;
  });
  return { ...count, file };
}

/** Conversions agree with the real DOM (a probe placed in world units) and round-trip. */
function conversionCheck() {
  const st = window.__stage;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;';
  st.world.appendChild(probe);
  const worst = { dom: 0, trip: 0 };
  const pts = [[0, 0], [720, 500], [1439, 999], [2880, 1000], [st.camera.x + 100, 250], [-80, 1080]];
  for (const [wx, wy] of pts) {
    probe.style.transform = `translate(${wx}px, ${wy}px)`;
    const r = probe.getBoundingClientRect();
    const s = st.worldToScreen(wx, wy);
    worst.dom = Math.max(worst.dom, Math.abs(r.left - s.x), Math.abs(r.top - s.y));
    const w = st.screenToWorld(s.x, s.y);
    worst.trip = Math.max(worst.trip, Math.abs(w.x - wx), Math.abs(w.y - wy));
  }
  // Screen -> world -> screen for points all over the screen.
  for (const [sx, sy] of [[0, 0], [innerWidth, innerHeight], [innerWidth / 3, innerHeight / 2]]) {
    const w = st.screenToWorld(sx, sy);
    const s = st.worldToScreen(w.x, w.y);
    worst.trip = Math.max(worst.trip, Math.abs(s.x - sx), Math.abs(s.y - sy));
  }
  probe.remove();
  // A tap point converted to world lands on the stripe that elementFromPoint sees.
  const sp = st.worldToScreen(st.camera.x + 700, 300);
  const hit = document.elementFromPoint(sp.x, sp.y);
  const stripe = Math.floor((st.camera.x + 700) / 240);
  return { ...worst, hitStripe: hit && hit.dataset.stripe, stripe: String(stripe), s: st.s };
}

/** Drag on the background (a stripe row above the buddy) and wait for any fling to settle. */
async function swipe(page, dx) {
  const width = await page.eval(() => innerWidth);
  const y = await page.eval(() => window.__stage.worldToScreen(0, 200).y);
  const from = { x: dx < 0 ? width * 0.85 : width * 0.15, y };
  await page.drag(from, { x: from.x + dx, y }, { steps: 10, durationMs: 160 });
  await page.waitFor(settled);
}

async function expectEdge(page, edge) {
  for (let i = 0; i < 8 && (await page.eval(cam)) !== edge; i++) {
    await swipe(page, edge ? -600 : 600);
  }
  assert.equal(await page.eval(cam), edge, `reached camera ${edge}`);
  // One more hard swipe past the edge: stays put, and the room edge sits on the stage edge.
  await swipe(page, edge ? -600 : 600);
  assert.equal(await page.eval(cam), edge, 'clamped at the edge');
  const r = await page.eval((w) => {
    const st = window.__stage;
    return { edge: st.worldToScreen(w, 0).x, stageLeft: st.x, stageRight: st.x + 1440 * st.s };
  }, edge ? ROOM_W : 0);
  assert.ok(Math.abs(r.edge - (edge ? r.stageRight : r.stageLeft)) < 0.01, JSON.stringify(r));
}

for (const name of ['ipad-air', 'ipad-pro-9.7', 'ipad-pro-12.9']) {
  const vp = VIEWPORTS[name];
  describe(`stage and camera: wide room on ${name}`, () => {
    let page;
    before(async () => {
      page = await openPage({ viewport: name, path: 'index.html?room=wide' });
      await page.eval(fastFrameClock, 3);
    });
    after(async () => { if (page) await page.close(); });

    for (const orient of ['landscape', 'portrait']) {
      const portrait = orient === 'portrait';
      const size = portrait ? { width: vp.height, height: vp.width } : vp;

      it(`${orient}: fits the stage and the conversions match the DOM`, async () => {
        if (portrait) await rotate(page, size, true);
        const st = await page.eval(() => {
          const s = window.__stage;
          return { s: s.s, x: s.x, y: s.y, w: s.room.width, max: s.camera.max, vw: s.vw, vh: s.vh };
        });
        const s = Math.min(size.width / 1440, size.height / 1000);
        assert.ok(Math.abs(st.s - s) < 1e-9, `scale ${st.s}`);
        assert.deepEqual([st.vw, st.vh, st.w, st.max], [size.width, size.height, ROOM_W, MAX_CAM]);
        for (const at of [0, 777]) {
          await page.eval((x) => window.__stage.camera.panTo(x), at);
          const c = await page.eval(conversionCheck);
          assert.ok(c.dom < 0.01, `worldToScreen matches the DOM (off by ${c.dom}px)`);
          assert.ok(c.trip < 1e-9, `round trip error ${c.trip}`);
          assert.equal(c.hitStripe, c.stripe, 'the converted point hits the expected stripe');
        }
        await page.eval(() => window.__stage.camera.panTo(0));
      });

      it(`${orient}: no gaps at the letterbox edges, at either end of the room`, async () => {
        const left = await gapPixels(page, `stage-${name}-${orient}-left`);
        assert.equal(left.n, 0, `magenta pixels at camera 0 (${left.file})`);
        assert.deepEqual([left.w, left.h], [size.width * 2, size.height * 2]);
        await page.eval((x) => window.__stage.camera.panTo(x), MAX_CAM);
        const right = await gapPixels(page, `stage-${name}-${orient}-right`);
        assert.equal(right.n, 0, `magenta pixels at the right end (${right.file})`);
        await page.eval(() => window.__stage.camera.panTo(0));
      });

      it(`${orient}: a drag pans the room with momentum and stops at both edges`, async () => {
        await swipe(page, -300);
        const x1 = await page.eval(cam);
        const s = await page.eval(() => window.__stage.s);
        // The finger moved 300px = 300/s units; momentum carries it further.
        assert.ok(x1 > 300 / s, `panned ${x1} units, more than the ${300 / s} dragged`);
        await expectEdge(page, MAX_CAM);
        await expectEdge(page, 0);
        await page.screenshot(`stage-${name}-${orient}-panned`);
      });

      it(`${orient}: goes idle after a fling (no frame loop, will-change dropped)`, async () => {
        await swipe(page, -300);
        const idle = await page.eval(() => new Promise((resolve) => {
          const orig = window.requestAnimationFrame;
          let calls = 0;
          window.requestAnimationFrame = (fn) => { calls++; return orig(fn); };
          setTimeout(() => {
            window.requestAnimationFrame = orig;
            resolve({ calls, willChange: window.__stage.world.style.willChange });
          }, 400);
        }));
        assert.deepEqual(idle, { calls: 0, willChange: '' });
        await page.eval(() => window.__stage.camera.panTo(0));
      });

      it(`${orient}: a tap still squishes the buddy and does not pan`, async () => {
        const before = Number(await page.eval(squishes));
        await page.tapElement('.buddy');
        await page.waitFor(`document.querySelector('.buddy').dataset.squishes === '${before + 1}'`);
        const b = await page.box('.buddy');
        await page.drag({ x: b.cx, y: b.cy }, { x: b.cx - 200, y: b.cy });   // drag on the buddy: no pan
        await page.waitFor(settled);
        assert.equal(await page.eval(cam), 0);
        assert.equal(await page.eval(squishes), String(before + 1));
      });

      it(`${orient}: no errors and no external requests`, () => {
        assert.deepEqual(page.errors, []);
        assert.deepEqual(page.externalRequests(), []);
      });
    }

    it('keeps the camera in range when rotated back mid-pan', async () => {
      await page.eval((x) => window.__stage.camera.panTo(x), 1000);
      await rotate(page, vp, false);
      assert.equal(await page.eval(cam), 1000);
      assert.equal(await page.eval(() => window.__stage.s), Math.min(vp.width / 1440, vp.height / 1000));
      assert.deepEqual(page.errors, []);
    });
  });
}

describe('stage: a 1440 room (the buddy room)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-pro-9.7', path: 'index.html?room=buddy' }); });
  after(async () => { if (page) await page.close(); });

  it('does not pan and has no letterbox gaps, landscape and portrait', async () => {
    assert.equal(await page.eval(() => window.__stage.camera.max), 0);
    await swipe(page, -400);
    assert.equal(await page.eval(cam), 0);
    const land = await gapPixels(page, 'stage-default-ipad-pro-9.7-landscape');
    assert.equal(land.n, 0, land.file);
    await rotate(page, { width: 768, height: 1024 }, true);
    const port = await gapPixels(page, 'stage-default-ipad-pro-9.7-portrait');
    assert.equal(port.n, 0, port.file);
    await page.tapElement('.buddy');
    await page.waitFor(() => document.querySelector('.buddy').dataset.squishes === '1');
    assert.deepEqual(page.errors, []);
  });
});
