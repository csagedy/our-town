// End-to-end: the boot stage loads cleanly on an iPad-sized touch viewport and
// the retired placeholder buddy (now at ?room=buddy; the default scene is the
// city map, tests/e2e/city.test.mjs) reacts to a real (trusted) touch tap.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage, VIEWPORTS } from '../../tools/harness.mjs';

const squishes = () => document.querySelector('.buddy').dataset.squishes;

describe('boot stage (iPad Air, landscape, touch)', () => {
  let page;
  before(async () => {
    page = await openPage({ viewport: 'ipad-air', path: 'index.html?room=buddy' });
    // Record what the page actually receives, to prove input arrives as touch pointers.
    await page.eval(() => {
      window.__seen = [];
      for (const t of ['pointerdown', 'pointerup']) {
        document.addEventListener(t, (e) => window.__seen.push(`${e.type}:${e.pointerType}:${e.isTrusted}`), true);
      }
    });
  });
  after(async () => { if (page) await page.close(); });

  it('boots with no errors and shows no text', async () => {
    assert.deepEqual(page.errors, []);
    assert.equal(await page.eval(() => document.body.innerText.trim()), '');
    assert.equal(await page.eval(squishes), '0');
    await page.screenshot('boot-ipad-air');
  });

  it('fits the 1440x1000 stage to the viewport', async () => {
    const { width, height } = VIEWPORTS['ipad-air'];
    const box = await page.box('.stage');
    const s = Math.min(width / 1440, height / 1000);
    assert.ok(Math.abs(box.w - 1440 * s) < 1, `stage width ${box.w}`);
    assert.ok(Math.abs(box.h - 1000 * s) < 1, `stage height ${box.h}`);
    assert.ok(box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= width + 0.5 && box.y + box.h <= height + 0.5);
    const buddy = await page.box('.buddy');
    assert.ok(buddy.w >= 64 && buddy.h >= 64, 'hit target at least 64pt');
  });

  it('has the iPad PWA guards in place', async () => {
    const r = await page.eval(() => {
      const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content;
      const cs = getComputedStyle(document.querySelector('.stage'));
      return {
        viewport: meta('viewport'),
        capable: meta('apple-mobile-web-app-capable'),
        statusBar: meta('apple-mobile-web-app-status-bar-style'),
        touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
        stageTouchAction: cs.touchAction,
        userSelect: getComputedStyle(document.body).webkitUserSelect,
        scrollable: document.scrollingElement.scrollHeight > innerHeight,
      };
    });
    assert.match(r.viewport, /user-scalable=no/);
    assert.match(r.viewport, /maximum-scale=1/);
    assert.match(r.viewport, /viewport-fit=cover/);
    assert.equal(r.capable, 'yes');
    assert.equal(r.statusBar, 'black-translucent');
    assert.equal(r.touchIcon, 'assets/icons/icon-180.png');
    assert.equal(r.stageTouchAction, 'none');
    assert.equal(r.userSelect, 'none');
    assert.equal(r.scrollable, false);
  });

  it('squishes on a touch tap', async () => {
    // Snapshot the reaction in the same task as the squish (the counter
    // changes there), not on a later poll: on a loaded machine the 420ms
    // animation could already be over by the time a poll gets to look.
    await page.eval(() => {
      const buddy = document.querySelector('.buddy');
      new MutationObserver((_, obs) => {
        obs.disconnect();
        window.__atSquish = {
          anims: document.querySelector('.buddy-squish').getAnimations().length,
          happy: buddy.classList.contains('is-happy'),
        };
      }).observe(buddy, { attributes: true, attributeFilter: ['data-squishes'] });
    });
    await page.tapElement('.buddy');
    await page.waitFor(() => document.querySelector('.buddy').dataset.squishes === '1');
    const running = await page.waitFor(() => window.__atSquish);
    assert.equal(running.anims, 1, 'squish animation is running');
    assert.equal(running.happy, true, 'face switched to happy');
    await page.screenshot('boot-ipad-air-squish');
    const seen = await page.eval(() => window.__seen);
    assert.deepEqual(seen, ['pointerdown:touch:true', 'pointerup:touch:true']);
    // The squish settles: animation finishes and the face returns to neutral.
    await page.waitForAnimations('.buddy-squish');
    await page.waitFor(() => document.querySelector('.buddy-squish').getAnimations().length === 0
      && !document.querySelector('.buddy').classList.contains('is-happy'));
  });

  it('counts each tap', async () => {
    await page.tapElement('.buddy');
    await page.tapElement('.buddy');
    await page.waitFor(() => document.querySelector('.buddy').dataset.squishes === '3');
  });

  it('does not squish on a drag or a long press', async () => {
    const b = await page.box('.buddy');
    await page.drag({ x: b.cx, y: b.cy }, { x: b.cx + 80, y: b.cy });
    await page.longPress(b.cx, b.cy, { holdMs: 500 });
    assert.equal(await page.eval(squishes), '3');
  });

  it('ignores taps outside the buddy', async () => {
    await page.tap(40, 40);
    assert.equal(await page.eval(squishes), '3');
  });

  it('makes no network requests outside the local server, and nothing failed', async () => {
    assert.deepEqual(page.externalRequests(), []);
    assert.ok(page.requests.some((u) => u.endsWith('/src/main.js')));
    assert.deepEqual(page.errors, []);
  });

  it('registers the service worker (details in tests/e2e/offline.test.mjs)', async () => {
    const r = await page.eval(async () => {
      const pwa = await import('./src/pwa.js');
      await navigator.serviceWorker.ready;
      return { enabled: pwa.SW_ENABLED, regs: (await navigator.serviceWorker.getRegistrations()).length };
    });
    assert.deepEqual(r, { enabled: true, regs: 1 });
  });

  it('serves a valid manifest with the three icons', async () => {
    const r = await page.eval(async () => {
      const m = await (await fetch('manifest.webmanifest')).json();
      const icons = await Promise.all(m.icons.map(async (i) => {
        const img = new Image();
        img.src = i.src;
        await img.decode();
        return `${img.naturalWidth}x${img.naturalHeight}=${i.sizes}`;
      }));
      return { display: m.display, orientation: m.orientation, icons };
    });
    assert.deepEqual(r, {
      display: 'standalone', orientation: 'landscape',
      icons: ['180x180=180x180', '192x192=192x192', '512x512=512x512'],
    });
  });
});

describe('boot stage (original iPad Pro 9.7", 4:3)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-pro-9.7', path: 'index.html?room=buddy' }); });
  after(async () => { if (page) await page.close(); });

  it('letterboxes the stage and still reacts to a tap', async () => {
    const box = await page.box('.stage');
    assert.ok(Math.abs(box.w - 1024) < 1, `stage fills the width (${box.w})`);
    assert.ok(box.y > 0, 'letterboxed top and bottom');
    await page.tapElement('.buddy');
    await page.waitFor(() => document.querySelector('.buddy').dataset.squishes === '1');
    assert.deepEqual(page.errors, []);
    await page.screenshot('boot-ipad-pro-9.7');
  });
});
