// End-to-end: the city map hub (P1.13), the default scene, on every iPad
// viewport with real (trusted) touches: the map pans under a finger, the cafe
// door leads into the kitchen and the map button back out (the location
// survives a reload), the three unbuilt buildings react, the sun/moon toggles
// night (saved in the world), nothing on screen is text, and an untouched
// map does no work at all.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage, VIEWPORTS } from '../../tools/harness.mjs';

// Record every Web Animation (by the art piece it moves) and every sound, in
// the page, as it happens: a poll could miss a short reaction on a busy machine.
async function record(page) {
  await page.eval(async () => {
    if (window.__rec) return;
    const rec = window.__rec = { anims: [], sounds: [] };
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const host = this.closest && this.closest('[data-art]');
      rec.anims.push(host ? host.dataset.art : (this.className || this.tagName));
      return orig.apply(this, args);
    };
    const { sfx } = await import('./src/audio/index.js');
    const play = sfx.play;
    sfx.play = (name, opts) => { rec.sounds.push(name); return play(name, opts); };
  });
}
const clearRec = (page) => page.eval(() => { window.__rec.anims.length = 0; window.__rec.sounds.length = 0; });

// Every <img> that has a src is decoded (so a screenshot shows the real art).
const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const noText = () => document.body.innerText.trim();
const settled = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().length === 0;

/** Pan the map so a piece is centred (camera API), then return its screen point. */
async function show(page, id, dy = 0.5) {
  return page.eval(({ id, dy }) => {
    const p = window.__town.manifest.map.pieces[id];
    window.__stage.camera.panTo(p.x + p.w / 2 - 720);
    return window.__town.scene.screenPoint(id, dy);
  }, { id, dy });
}

for (const name of Object.keys(VIEWPORTS)) {
  describe(`city map (${name}, landscape, touch)`, () => {
    let page;
    const vp = VIEWPORTS[name];
    before(async () => {
      page = await openPage({ viewport: name });
      await record(page);
    });
    after(async () => { if (page) await page.close(); });

    it('boots into the city with no errors and no text on screen', async () => {
      assert.equal(await page.eval(() => window.__town.at), 'city');
      await page.waitFor(imagesReady);
      assert.equal(await page.eval(noText), '');
      assert.deepEqual(page.errors, []);
      // The map is wider than every screen, and the buildings are big targets.
      assert.equal(await page.eval(() => window.__stage.camera.max), 960);
      for (const b of ['cafe', 'theater', 'construction', 'school']) {
        const w = await page.eval((id) => window.__town.scene.room.art.get(id).getBoundingClientRect().width, b);
        assert.ok(w >= 200, `${b} is ${w}pt wide`);
      }
      assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.ui-map')).visibility), 'hidden', 'no map button on the map');
      await page.screenshot(`city-${name}`);
    });

    it('pans with a finger drag on the sky, with momentum', async () => {
      const y = vp.height * 0.08;
      await page.drag({ x: vp.width * 0.8, y }, { x: vp.width * 0.2, y }, { steps: 12, durationMs: 300 });
      await page.waitFor(() => !window.__stage.camera.moving);
      const x1 = await page.eval(() => window.__stage.camera.x);
      assert.ok(x1 > 300, `panned right to ${x1}`);
      // A drag that starts on a building pans too (buildings are tap-only).
      const school = await page.eval(() => window.__town.scene.screenPoint('school'));
      const from = { x: Math.min(vp.width - 40, Math.max(40, school.x)), y: school.y };
      await page.drag(from, { x: from.x + 300, y: from.y }, { steps: 10, durationMs: 400, holdMs: 80 });
      await page.waitFor(() => !window.__stage.camera.moving);
      assert.ok(await page.eval(() => window.__stage.camera.x) < x1, 'dragged back left');
      await page.eval(() => window.__stage.camera.panTo(1e4));
      await page.waitFor(imagesReady);
      await page.screenshot(`city-${name}-east`);
    });

    // The construction site is built now (P2c.1, tests/e2e/site.test.mjs goes in).
    it('the unbuilt buildings play a "coming soon" reaction, never a dead tap', async () => {
      const cases = [
        ['theater', 0.3, 'theater-curtains', 'whoosh'],
        ['school', 0.55, 'school-bell', 'bell'],
      ];
      for (const [id, dy, part, sound] of cases) {
        await page.waitFor(settled);
        const pt = await show(page, id, dy);
        assert.ok(pt.x > 0 && pt.x < vp.width && pt.y > 0 && pt.y < vp.height, `${id} on screen`);
        await clearRec(page);
        await page.tap(pt.x, pt.y);
        await page.waitFor(`window.__rec.anims.includes(${JSON.stringify(part)})`).catch(() => {});
        const rec = await page.eval(() => window.__rec);
        assert.ok(rec.anims.includes(part), `${id}: ${part} moved (${rec.anims})`);
        assert.ok(rec.anims.includes(id), `${id}: the building bounced`);
        assert.ok(rec.sounds.includes(sound), `${id}: played ${sound} (${rec.sounds})`);
        assert.equal(await page.eval(() => window.__town.at), 'city', `${id} is not built yet: we stay on the map`);
        if (id === 'school') await page.screenshot(`city-${name}-school-bell`);
      }
    });

    it('the lots, the Lost & Found box, the bus and the birds react too', async () => {
      for (const id of ['lot-3', 'lostfound', 'bus', 'birds']) {
        await page.waitFor(settled);
        const pt = await page.eval((id) => {
          const el = window.__town.scene.room.art.get(id);
          const r0 = el.getBoundingClientRect();
          const x = el.style.transform.match(/translate3d\(([-\d.]+)px/)[1];
          window.__stage.camera.panTo(Number(x) + (r0.width / window.__stage.s) / 2 - 720);
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height * 0.4 };
        }, id);
        await clearRec(page);
        await page.tap(pt.x, pt.y);
        await page.waitFor(() => window.__rec.anims.length > 0 && window.__rec.sounds.length > 0);
      }
    });

    it('the sun turns the city to night (a saved mapSet op), the moon back to day', async () => {
      await page.waitFor(settled);
      const sun = await show(page, 'sun');
      await page.tap(sun.x, sun.y);
      await page.waitFor(() => window.__store.state.map.night === true);
      // back-2 is on screen at camera 0 (the sun's spot): its night tile shows, the day tile is dropped.
      await page.waitFor(() => document.querySelector('[data-art="back-2"] .city-night').style.opacity === '1'
        && !document.querySelector('[data-art="back-2"] .city-day').getAttribute('src'));
      assert.equal(await page.eval(() => getComputedStyle(window.__town.scene.room.art.get('moon')).visibility), 'visible');
      await page.waitFor(settled);
      await page.waitFor(imagesReady);
      await page.screenshot(`city-${name}-night`);
      // Night is part of the saved world.
      await page.goto('index.html');
      await record(page);
      await page.waitFor(imagesReady);
      assert.equal(await page.eval(() => window.__store.state.map.night), true);
      assert.match(await page.eval(() => document.querySelector('[data-art="cafe"] .city-night').getAttribute('src')), /cafe-night\.webp$/);
      assert.equal(await page.eval(() => document.querySelector('[data-art="cafe"] .city-day').getAttribute('src')), null, 'day art not loaded at night');
      await page.eval(() => window.__stage.camera.panTo(1e4));
      await page.waitFor(imagesReady);
      await page.screenshot(`city-${name}-night-east`);
      const moon = await show(page, 'moon');
      await page.tap(moon.x, moon.y);
      await page.waitFor(() => window.__store.state.map.night === false);
      await page.waitFor(() => document.querySelector('[data-art="back-2"] .city-night').style.opacity === '0');
      assert.equal(await page.eval(noText), '');
    });

    it('the cafe door opens into the kitchen; the map button brings you back; both survive a reload', async () => {
      await page.waitFor(settled);
      const door = await show(page, 'cafe-door', 0.5);
      await clearRec(page);
      await page.tap(door.x, door.y);
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
      const rec = await page.eval(() => window.__rec);
      assert.ok(rec.anims.includes('cafe-door') && rec.sounds.includes('doorbell'), `door opened with a ding-dong (${rec.anims} / ${rec.sounds})`);
      await page.waitFor(imagesReady);
      const k = await page.eval(() => ({
        room: document.querySelector('.room').dataset.room,
        items: window.__town.scene.view.ids().length,
        btn: getComputedStyle(document.querySelector('.ui-map')).visibility,
        box: document.querySelector('.ui-map').getBoundingClientRect().toJSON(),
      }));
      assert.equal(k.room, 'cafe/kitchen');
      assert.ok(k.items >= 10, `kitchen starter props: ${k.items}`);
      assert.equal(k.btn, 'visible');
      assert.ok(k.box.width >= 64 && k.box.left < vp.width * 0.2 && k.box.top < vp.height * 0.2, 'round map button, top-left, at least 64pt');
      assert.equal(await page.eval(noText), '');
      await page.screenshot(`city-${name}-kitchen`);
      // Kitchen props behave like the test room: a tap reacts with a sound.
      const mug = await page.eval(() => {
        const v = window.__town.scene.view;
        const id = v.ids().find((i) => window.__store.state.entities[i].kind === 'mug');
        const r = v.viewOf(id).el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      await clearRec(page);
      await page.tap(mug.x, mug.y);
      await page.waitFor(() => window.__rec.sounds.length > 0);
      // Reload: still in the kitchen.
      await page.goto('index.html');
      await record(page);
      assert.equal(await page.eval(() => window.__town.at), 'cafe/kitchen');
      // The map button goes home, and the cafe door closes behind us.
      await page.waitFor(() => !window.__town.busy);
      await clearRec(page);
      await page.tapElement('.ui-map');
      await page.waitFor(() => window.__town.at === 'city' && !window.__town.busy);
      await page.waitFor(() => window.__rec.anims.includes('cafe-door'));
      assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.ui-map')).visibility), 'hidden');
      await page.goto('index.html');
      assert.equal(await page.eval(() => window.__town.at), 'city');
      assert.deepEqual(page.errors, []);
    });

    it('stays idle when nobody touches it: no animations, no frame callbacks', async () => {
      await page.waitFor(settled);
      await page.eval(() => {
        window.__rafs = 0;
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = (fn) => { window.__rafs++; return raf(fn); };
      });
      await new Promise((r) => setTimeout(r, 1500));   // a window in which nothing may happen
      const r = await page.eval(() => ({ rafs: window.__rafs, anims: document.getAnimations().length, fx: window.__town.scene.fx.stats().active }));
      assert.deepEqual(r, { rafs: 0, anims: 0, fx: 0 });
      assert.deepEqual(page.externalRequests(), []);
      assert.deepEqual(page.errors, []);
    });
  });
}

// Bead 6hn: the map's layers are column tiles and every image goes through a
// tile loader (src/engine/tiles.js): only what is near the camera is decoded,
// the set not showing (day or night) holds nothing, and a transition never
// has both places decoded at once.
describe('city map memory (ipad-pro-9.7): nearby tiles only, bounded transition peak', () => {
  let page;
  before(async () => {
    page = await openPage({ viewport: 'ipad-pro-9.7' });
    // Decoded bitmaps referenced right now: <img>s in the page with a loaded
    // src plus off-screen images being decoded (preloads, decode-ahead), each
    // URL once (the same measure as tools/perf.mjs). Sampled every frame while
    // armed and whenever an off-screen decode finishes.
    await page.eval(() => {
      const off = new Set();
      const peak = window.__peak = { max: 0, armed: false, blankAtOpen: [] };
      peak.mb = () => {
        const seen = new Map();
        const add = (i) => { const s = i.currentSrc || i.src; if (s && i.naturalWidth && !seen.has(s)) seen.set(s, i.naturalWidth * i.naturalHeight * 4); };
        for (const i of document.images) if (i.complete) add(i);
        for (const i of off) add(i);
        let b = 0; for (const v of seen.values()) b += v;
        return b / 1048576;
      };
      peak.sample = () => { const m = peak.mb(); if (m > peak.max) peak.max = m; };
      peak.arm = () => { peak.max = 0; peak.armed = true; const f = () => { if (!peak.armed) return; peak.sample(); requestAnimationFrame(f); }; f(); };
      const dec = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        const p = dec.call(this);
        if (!this.isConnected) { off.add(this); const done = () => { if (peak.armed) peak.sample(); off.delete(this); }; p.then(done, done); }
        return p;
      };
      // When the iris starts to open, count the room art on screen that has no image yet (a blank flash).
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, opts) {
        if (this.classList && this.classList.contains('town-iris-dot') && /scale\(0\.01\)/.test(JSON.stringify(frames[frames.length - 1]))) {
          const vw = innerWidth, vh = innerHeight;
          const blank = [...document.querySelectorAll('.room .art-tile, .room .city-static, .room .city-piece')].filter((el) => {
            if (el.style.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            if (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh) return false;
            return ![...el.querySelectorAll('img')].some((i) => i.getAttribute('src'));
          }).map((el) => el.dataset.art);
          peak.blankAtOpen.push(blank);
        }
        return animate.call(this, frames, opts);
      };
    });
  });
  after(async () => { if (page) await page.close(); });

  // What is loaded, per set, and whether it is exactly what the camera wants at rest.
  const state = () => page.eval(() => {
    const sc = window.__town.scene;
    const v = window.__stage.visibleWorld();
    const M = 200;   // CITY_REST_MARGIN
    const want = [], extra = [], missing = [];
    const night = sc.night;
    for (const im of sc.room.def.images) {
      const el = sc.room.art.get(im.id);
      const near = im.x + im.w > v.left - M && im.x < v.right + M;
      const onScreen = im.x + im.w > v.left && im.x < v.right;
      const img = el.querySelector(night && im.night ? '.city-night' : '.city-day');
      const other = im.night ? el.querySelector(night ? '.city-day' : '.city-night') : null;
      const has = !!img.getAttribute('src');
      if (near) want.push(im.id);
      if (has && !near) extra.push(im.id);
      if (onScreen && !has) missing.push(im.id);
      if (other && other.getAttribute('src')) extra.push(im.id + (night ? ':day' : ':night'));
    }
    const whole = [...document.images].filter((i) => /rooms\/city\/(back|front)(-night)?\.webp$/.test(i.getAttribute('src') || '')).length;
    const map = window.__town.manifest.map;
    const wholeMB = [...map.layers, ...Object.values(map.pieces)].reduce((n, p) => n + p.px[0] * p.px[1] * 4, 0) / 1048576;
    return { x: window.__stage.camera.x, want, extra, missing, whole, mb: sc.decodedBytes() / 1048576, wholeMB, loaded: sc.loaded().length, total: sc.room.def.images.length };
  });
  // The state once a day/night cross-fade (450 ms) has dropped the old set: polled from here, it reads the page.
  const settledState = async () => {
    let s;
    for (let t0 = Date.now(); Date.now() - t0 < 5000; await new Promise((r) => setTimeout(r, 50))) if ((s = await state()).extra.length === 0) break;
    return s;
  };
  const still = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
    && Object.values(window.__town.scene.loaders).every((l) => !l.stats().loading && !l.stats().settleTimer);

  it('at rest only the tiles on screen and one column each side are decoded, day or night', async () => {
    for (const night of [false, true]) {
      await page.eval((n) => window.__store.dispatch('mapSet', { night: n }), night);
      for (const x of [0, 480, 960, 130]) {
        await page.eval((x) => window.__stage.camera.panTo(x), x);
        await page.waitFor(still);
        const s = await settledState();
        assert.deepEqual(s.missing, [], `${night ? 'night' : 'day'} x ${x}: everything on screen has its image`);
        assert.deepEqual(s.extra, [], `${night ? "night" : "day"} x ${x}: nothing far away (or of the other set) is decoded: ${s.extra}`);
        assert.equal(s.whole, 0, 'no whole-layer image in the page');
        assert.ok(s.loaded < s.total, `x ${x}: ${s.loaded} of ${s.total} images loaded`);
        // At either end about 70% of the map's bitmaps; mid-map every building is on screen.
        assert.ok(s.mb < s.wholeMB * (x === 0 || x === 960 ? 0.8 : 0.95), `x ${x}: ${s.mb.toFixed(1)} of ${s.wholeMB.toFixed(1)} MB of city images decoded`);
      }
    }
    await page.eval(() => window.__store.dispatch('mapSet', { night: false }));
    await page.waitFor(still);
  });

  it('a pan decodes ahead of the finger; nothing on screen is ever blank once it settles', async () => {
    await page.eval(() => window.__stage.camera.panTo(0));
    await page.waitFor(still);
    const vp = { width: 1024, height: 768 };
    // Finger still down after a long drag: the columns ahead are loading or loaded.
    const g = page.gesture();
    const pt = (x) => [{ x, y: vp.height * 0.1, id: 0, radiusX: 11, radiusY: 11, force: 1 }];
    await g('touchStart', pt(vp.width * 0.9), 0);
    for (let i = 1; i <= 10; i++) await g('touchMove', pt(vp.width * (0.9 - 0.03 * i)), 30 * i);
    await page.frames(2);
    const mid = await page.eval(() => {
      const v = window.__stage.visibleWorld();
      const ahead = window.__town.scene.room.def.images.filter((im) => /^back-/.test(im.id) && im.x > v.right && im.x < v.right + 420);
      return { x: window.__stage.camera.x, dragging: window.__stage.camera.dragging, ahead: ahead.map((im) => ({ id: im.id, busy: !!window.__town.scene.room.art.get(im.id).querySelector('.city-day').getAttribute('src') || window.__town.scene.loaders.day.stats().loading > 0 })) };
    });
    await g('touchEnd', [], 330);
    assert.ok(mid.x > 200 && mid.ahead.length > 0 && mid.ahead.every((t) => t.busy), `columns ahead decode during the drag: ${JSON.stringify(mid)}`);
    await page.waitFor(still);
    const s = await settledState();
    assert.deepEqual(s.extra, []);
    assert.deepEqual(s.missing, []);
  });

  it('city -> cafe -> city: the city is released before the cafe decodes; the peak stays bounded; no blank flash', async () => {
    await page.eval(() => window.__stage.camera.panTo(0));
    await page.waitFor(still);
    const cityMB = await page.eval(() => window.__peak.mb());
    await page.eval(() => { window.__peak.blankAtOpen.length = 0; window.__peak.arm(); return window.__town.go('cafe/kitchen'); });
    await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
    await page.waitFor(() => !window.__town.scene.tiles.stats().loading);
    const toCafe = await page.eval(() => { window.__peak.sample(); window.__peak.armed = false; return { max: window.__peak.max, now: window.__peak.mb(), blank: window.__peak.blankAtOpen.slice() }; });
    assert.deepEqual(toCafe.blank, [[]], 'every cafe tile on screen had its image when the iris opened');
    // Before (bead 6hn) the whole city stayed decoded while the cafe preloaded: ~47 + ~39 MB.
    const bound = Math.max(cityMB, toCafe.now) + 4;
    assert.ok(toCafe.max <= bound, `city -> cafe peak ${toCafe.max.toFixed(1)} MB, city ${cityMB.toFixed(1)}, cafe ${toCafe.now.toFixed(1)}`);
    await page.eval(() => { window.__peak.blankAtOpen.length = 0; window.__peak.arm(); return window.__town.go('city'); });
    await page.waitFor(() => window.__town.at === 'city' && !window.__town.busy);
    const toCity = await page.eval(() => { window.__peak.sample(); window.__peak.armed = false; return { max: window.__peak.max, now: window.__peak.mb(), blank: window.__peak.blankAtOpen.slice() }; });
    assert.deepEqual(toCity.blank, [[]], 'every city tile and piece on screen had its image when the iris opened');
    assert.ok(toCity.max <= Math.max(toCafe.now, toCity.now) + 4, `cafe -> city peak ${toCity.max.toFixed(1)} MB (cafe ${toCafe.now.toFixed(1)}, city ${toCity.now.toFixed(1)})`);
    assert.deepEqual(page.errors, []);
  });

  it('the AudioContext is made while the town is idle, not in the first gesture (bead bp8)', async () => {
    await page.goto('index.html');
    await page.waitFor(async () => (await import('./src/audio/index.js')).audio.stats.created === 1);
    const st = await page.eval(async () => { const a = await import('./src/audio/index.js'); return { created: a.audio.stats.created, attempts: a.audio.stats.unlockAttempts }; });
    assert.equal(st.attempts, 0, 'created before any gesture');
    // The first tap only resumes it.
    await page.tap(512, 60);
    await page.waitFor(async () => (await import('./src/audio/index.js')).audioState() === 'running');
    assert.equal(await page.eval(async () => (await import('./src/audio/index.js')).audio.stats.created), 1);
    assert.deepEqual(page.errors, []);
  });
});

describe('city map dev routes and flags', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-air', path: 'index.html?together' }); });
  after(async () => { if (page) await page.close(); });

  it('?together boots on the city map', async () => {
    assert.equal(await page.eval(() => window.__town.at), 'city');
    assert.ok(await page.eval(() => !!window.__together));
    assert.deepEqual(page.errors, []);
  });

  it('?room=test, ?room=wide and ?room=buddy still route to their dev rooms', async () => {
    await page.goto('index.html?room=test');
    assert.equal(await page.eval(() => document.querySelector('.room').dataset.room), 'test/lab');
    assert.equal(await page.eval(() => !!window.__town), false);
    await page.goto('index.html?room=wide');
    assert.equal(await page.eval(() => window.__stage.camera.max), 1440);
    await page.goto('index.html?room=buddy');
    assert.ok(await page.eval(() => !!document.querySelector('.buddy')));
    assert.deepEqual(page.errors, []);
  });
});
