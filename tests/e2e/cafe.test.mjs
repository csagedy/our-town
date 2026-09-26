// End-to-end: the cafe strip (P2a.1) on every iPad viewport with real
// (trusted) touches. In from the city map's cafe door; pan the strip and it
// snaps to the zone stops (the finger is never fought); only the tiles near
// the camera are decoded; open the fridge, pull an egg out of its stock, put
// a tomato in, shut it (the tomato is hidden inside) and reload (still in
// there); every state piece reacts to a tap with a sound and an animation
// (and the toggles change world state); the painted spawners (pantry, cups,
// plates, ice-cream tubs) clone; the Mystery Dish draws its face; no text on
// screen; an untouched cafe does no work.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage, VIEWPORTS } from '../../tools/harness.mjs';

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

const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const noText = () => document.body.innerText.trim();
// Characters breathe and blink forever (CSS + tiny WAAPI glances); nothing else may run.
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0;
const cam = (page) => page.eval(() => window.__stage.camera.x);
const STOPS = [0, 900, 1440];

/** A screen point where a touch picks piece `pid` (a 9x9 scan of its box), after centring it. */
async function piecePoint(page, pid) {
  return page.eval((pid) => {
    const sc = window.__town.scene;
    const p = window.__town.manifest.rooms.cafe.pieces[pid];
    window.__stage.camera.panTo(p.x + p.w / 2 - 720);
    const el = sc.pieces.el(pid);
    const r = el.getBoundingClientRect();
    const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];
    for (const fy of fr) for (const fx of fr) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 90 || y < 90 || x > innerWidth - 90 || y > innerHeight - 20) continue;
      // The whole fingertip must be on it (Chrome adjusts an 11 px touch to what is near).
      const ox = Math.min(12, r.width * 0.3), oy = Math.min(12, r.height * 0.3);
      if ([[0, 0], [ox, 0], [-ox, 0], [0, oy], [0, -oy]].every(([dx, dy]) => window.__input.hitTest(x + dx, y + dy) === el)) return { x, y };
    }
    return null;
  }, pid);
}

/** A screen point on the prep station over piece `pid` (P2a.2), or null. */
const stationPoint = (page, pid) => page.eval((pid) => {
  const sc = window.__town.scene;
  const kind = Object.keys(sc.prep.spots).find((k) => sc.prep.spots[k].piece === pid);
  const id = kind && sc.prep.stations()[kind];
  const v = id && sc.view.viewOf(id);
  if (!v) return null;
  const r = v.el.getBoundingClientRect();
  for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) for (const fx of [0.5, 0.4, 0.6]) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (window.__input.hitTest(x, y) === v.el) return { x, y };
  }
  return null;
}, pid);

/** A screen point where a touch picks entity `id` (nearest its centre; its neighbours may overlap it). */
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
/** An empty spot on the back wall (a touch there pans). */
const wallSpot = (page) => page.eval(() => {
  for (let y = 120; y < 400; y += 20) for (let x = 300; x < innerWidth - 300; x += 20) if (!window.__input.hitTest(x, y)) return { x, y };
  return null;
});

/** Drag entity `id` (real touch) so its feet land at world (wx, wy). */
async function dragTo(page, id, wx, wy) {
  const from = await entPoint(page, id);
  const to = await page.eval(([id, fx, fy, wx, wy]) => {
    const v = window.__town.scene.view.viewOf(id);
    const g = window.__stage.screenToWorld(fx, fy);
    return window.__stage.worldToScreen(g.x + wx - v.x, g.y + wy - v.y);
  }, [id, from.x, from.y, wx, wy]);
  await page.drag(from, to, { steps: 14, durationMs: 280 });
  await page.frames(2);
}

const byKind = (page, kind) => page.eval((kind) => {
  const s = window.__store.state;
  return Object.values(s.entities).filter((e) => e.kind === kind && !e.deleted && e.room === 'cafe/kitchen').map((e) => e.id);
}, kind);

/** The tiles the loader has loaded equal the ones near the view; the whole-layer files are never in the page. */
async function checkTiles(page, label) {
  const r = await page.eval(async () => {
    const { tilesNear, REST_MARGIN } = await import('./src/engine/tiles.js');
    const m = window.__town.manifest.rooms.cafe;
    const all = m.layers.flatMap((L) => L.tiles);
    const v = window.__stage.visibleWorld();
    const want = tilesNear(all, v.left, v.right, REST_MARGIN).map((i) => all[i].file).sort();
    const srcs = [...document.images].map((i) => i.getAttribute('src')).filter(Boolean);
    return {
      loaded: window.__town.scene.tiles.loaded().sort(), want, total: all.length,
      inDom: srcs.filter((s) => /rooms\/cafe\/tiles\//.test(s)).sort(),
      whole: srcs.filter((s) => m.layers.some((L) => s === L.file)),
      mb: window.__town.scene.tiles.bytes() / 1e6,
    };
  });
  assert.deepEqual(r.loaded, r.want, `${label}: loaded tiles are exactly the nearby ones`);
  assert.deepEqual([...new Set(r.inDom)].sort(), r.want, `${label}: only those have a src in the page`);
  assert.ok(r.loaded.length < r.total, `${label}: ${r.loaded.length} of ${r.total} tiles`);
  assert.deepEqual(r.whole, [], `${label}: no whole-layer image`);
  return r;
}

async function settleTiles(page) {
  await page.waitFor(() => { const t = window.__town.scene.tiles.stats(); return !t.settleTimer && t.loading === 0 && !window.__stage.camera.moving; });
}

for (const name of Object.keys(VIEWPORTS)) {
  describe(`cafe strip (${name}, landscape, touch)`, () => {
    let page;
    before(async () => {
      page = await openPage({ viewport: name });
      await record(page);
    });
    after(async () => { if (page) await page.close(); });

    it('the cafe door on the map leads into the strip, at the dining room by the front door', async () => {
      assert.equal(await page.eval(() => window.__town.at), 'city');
      const door = await page.eval(() => {
        const p = window.__town.manifest.map.pieces['cafe-door'];
        window.__stage.camera.panTo(p.x + p.w / 2 - 720);
        return window.__town.scene.screenPoint('cafe-door', 0.5);
      });
      await page.tap(door.x, door.y);
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
      assert.equal(await page.eval(() => document.querySelector('.room').dataset.room), 'cafe/kitchen');
      assert.equal(await page.eval(() => window.__stage.room.width), 2880);
      assert.equal(await cam(page), 1440, 'opens on the dining stop');
      await settleTiles(page);
      await page.waitFor(imagesReady);
      assert.equal(await page.eval(noText), '');
      await page.screenshot(`cafe-${name}-dining`);
      const r = await checkTiles(page, 'dining');
      assert.ok(r.mb < 45, `dining decodes ${r.mb.toFixed(1)} MB of tiles`);
    });

    it('panning follows the finger exactly, then a fling eases into a zone stop', async () => {
      const s = await page.eval(() => window.__stage.s);
      // A spot on the back wall between things (the background pans).
      const at = await wallSpot(page);
      assert.ok(at, 'found an empty wall spot');
      const x0 = await cam(page);
      const pt = (x, y) => ({ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 });
      const g = page.gesture();
      await g('touchStart', [pt(at.x, at.y)], 0);
      for (let k = 1; k <= 6; k++) await g('touchMove', [pt(at.x + k * 20, at.y)], k * 16);
      await page.frames(2);
      const mid = await page.eval(() => ({ x: window.__stage.camera.x, dragging: window.__stage.camera.dragging, moving: window.__stage.camera.moving }));
      assert.ok(mid.dragging && !mid.moving, 'finger down: dragging, no snap');
      assert.ok(Math.abs(mid.x - (x0 - 120 / s)) < 0.6, `camera tracks the finger 1:1 (${mid.x} vs ${x0 - 120 / s})`);
      // Hold still, then lift: no fling, no snap (it stays where it was put).
      await new Promise((r) => setTimeout(r, 150));
      await g('touchEnd', [], 96 + 150);
      await page.frames(3);
      assert.equal(await page.eval(() => window.__stage.camera.moving), false);
      assert.ok(Math.abs((await cam(page)) - mid.x) < 0.6, 'a slow release stays put');
      // A short flick right-to-left... left-to-right: toward the counter stop.
      const a2 = await wallSpot(page);
      await page.drag(a2, { x: a2.x + 60, y: a2.y }, { steps: 6, durationMs: 90 });
      await page.waitFor(() => !window.__stage.camera.moving && !window.__stage.camera.dragging);
      assert.equal(await cam(page), 900, 'snapped to the counter');
      await settleTiles(page);
      await page.waitFor(imagesReady);
      await checkTiles(page, 'counter');
      await page.screenshot(`cafe-${name}-counter`);
      // A big fling: all the way to the kitchen.
      const a3 = await wallSpot(page);
      await page.drag(a3, { x: a3.x + 300, y: a3.y }, { steps: 6, durationMs: 80 });
      await page.waitFor(() => !window.__stage.camera.moving && !window.__stage.camera.dragging);
      assert.equal(await cam(page), 0, 'snapped to the kitchen');
      await settleTiles(page);
      await page.waitFor(imagesReady);
      const r = await checkTiles(page, 'kitchen');
      assert.ok(r.mb < 45, `kitchen decodes ${r.mb.toFixed(1)} MB of tiles`);
      assert.ok(STOPS.includes(await cam(page)));
      assert.equal(await page.eval(noText), '');
    });

    it('fridge: open it, drag an egg out, put a tomato in, shut it; the tomato stays inside across a reload', async () => {
      const door = await piecePoint(page, 'fridge-door');
      await page.eval(() => window.__stage.camera.panTo(0));
      assert.ok(door);
      assert.equal(await page.eval(() => window.__town.scene.surfaces().includes('fridge-2')), false, 'shut: no fridge shelves');
      await clearRec(page);
      await page.tap(door.x, door.y);
      await page.waitFor(() => window.__town.scene.pieces.state('fridge-door') === 'open');
      await page.waitFor(() => window.__rec.sounds.includes('whoosh'));
      assert.equal(await page.eval(() => window.__town.scene.pieces.shown('fridge-door')), 'open');
      assert.ok(await page.eval(() => window.__town.scene.surfaces().includes('fridge-2')));
      await page.waitFor(() => window.__town.scene.hidden().length === 0);
      // The egg stock: a drag pulls out a new egg; the stock stays. (Dropped up
      // and right of the pocket tray, which peeks open during a drag.)
      const [stock] = await byKind(page, 'fridge-egg');
      const eggsBefore = (await byKind(page, 'egg')).length;
      const s0 = await page.eval((id) => ({ ...window.__store.state.entities[id] }), stock);
      const from = await entPoint(page, stock);
      const to = await page.eval(() => window.__stage.worldToScreen(1000, 820));
      await page.drag(from, to, { steps: 14, durationMs: 280 });
      const eggs = await byKind(page, 'egg');
      assert.equal(eggs.length, eggsBefore + 1, 'a new egg');
      const egg = await page.eval((ids) => ids.map((id) => window.__store.state.entities[id]).find((e) => e.props.from), eggs);
      assert.equal(egg.props.from, stock);
      assert.ok(egg.y >= 700 && egg.y <= 961, `the egg is on the floor (y ${egg.y})`);
      const s1 = await page.eval((id) => window.__store.state.entities[id], stock);
      assert.deepEqual([s1.x, s1.y], [s0.x, s0.y], 'the stock stayed on its shelf');
      // The tomato from the counter goes onto the middle shelf.
      const tomatoes = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'tomato' && !e.deleted && !e.props.from).map((e) => e.id));
      assert.equal(tomatoes.length, 1);
      const tomato = tomatoes[0];
      await dragTo(page, tomato, 470, 574);
      const t = await page.eval((id) => window.__store.state.entities[id], tomato);
      assert.equal(t.y, 574, 'on the fridge-2 shelf');
      await page.screenshot(`cafe-${name}-fridge-open`);
      // Shut the door: the tomato is inside, hidden and untouchable.
      const shut = await piecePoint(page, 'fridge-door');
      await page.eval(() => window.__stage.camera.panTo(0));
      await clearRec(page);
      await page.tap(shut.x, shut.y);
      await page.waitFor(() => window.__town.scene.pieces.state('fridge-door') === 'closed');
      await page.waitFor(() => window.__rec.sounds.includes('thud'));
      await page.waitFor(`window.__town.scene.hidden().includes(${JSON.stringify(tomato)})`);
      const hid = await page.eval((id) => ({
        hidden: window.__town.scene.hidden().includes(id),
        vis: window.__town.scene.view.viewOf(id).el.style.visibility,
        shelf: window.__town.scene.surfaces().includes('fridge-2'),
      }), tomato);
      assert.deepEqual(hid, { hidden: true, vis: 'hidden', shelf: false });
      // Reload: the door is shut with the tomato still inside.
      await page.waitFor(() => localStorage.getItem('ourtown.cafeCam') === '0');
      await page.goto('index.html');
      await record(page);
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy && window.__town.scene.view);
      assert.equal(await cam(page), 0, 'the camera came back where it was');
      const after = await page.eval((id) => ({
        e: window.__store.state.entities[id], door: window.__town.scene.pieces.state('fridge-door'),
        hidden: window.__town.scene.hidden().includes(id), vis: window.__town.scene.view.viewOf(id).el.style.visibility,
      }), tomato);
      assert.equal(after.door, 'closed');
      assert.equal(after.e.y, 574);
      assert.equal(after.e.room, 'cafe/kitchen');
      assert.ok(after.hidden && after.vis === 'hidden', 'still hidden inside');
      // Open again: there it is.
      const d2 = await piecePoint(page, 'fridge-door');
      await page.eval(() => window.__stage.camera.panTo(0));
      await page.tap(d2.x, d2.y);
      await page.waitFor(`window.__town.scene.view.viewOf(${JSON.stringify(tomato)}).el.style.visibility === ''`);
      assert.equal(await page.eval((id) => window.__town.scene.view.viewOf(id).el.style.visibility, tomato), '');
      assert.deepEqual(page.errors, []);
    });

    it('every state piece reacts to a real tap with a sound and an animation; toggles change world state', async () => {
      const ids = await page.eval(() => Object.keys(window.__town.manifest.rooms.cafe.pieces));
      assert.ok(ids.length >= 15);
      const PIECES = await page.eval(async () => (await import('./src/scenes/cafe.js')).PIECES);
      for (const pid of ids) {
        await page.waitFor(() => !window.__stage.camera.moving);
        // P2a.2: the toaster (and parts of the blender and sink) sit under an
        // invisible prep station that takes the touch and answers for its piece.
        const p = (await piecePoint(page, pid)) || (await stationPoint(page, pid));
        assert.ok(p, `${pid}: a touch can reach it`);
        const spec = PIECES[pid];
        const target = spec.controls || pid;
        const before = await page.eval((t) => window.__town.scene.pieces.state(t), target);
        await clearRec(page);
        await page.tap(p.x, p.y);
        await page.waitFor(`window.__rec.sounds.length > 0 && window.__rec.anims.includes('piece:${pid}')`, { timeout: 5000 }).catch(() => {});
        const rec = await page.eval(() => ({ ...window.__rec }));
        assert.ok(rec.sounds.length > 0, `${pid}: made a sound`);
        assert.ok(rec.anims.includes('piece:' + pid), `${pid}: animated (${rec.anims})`);
        if (PIECES[target].toggle) {
          const now = await page.eval((t) => window.__town.scene.pieces.state(t), target);
          assert.notEqual(now, before, `${pid}: ${target} toggled`);
        }
        if (pid === 'front-door') assert.ok(rec.sounds.includes('doorbell'), 'the front door rings');
        if (pid === 'counter-bell') assert.ok(rec.sounds.includes('ding'), 'ding');
      }
      // The knob drives its burner's flame.
      assert.equal(await page.eval(() => window.__town.scene.pieces.shown('knob-1')), await page.eval(() => window.__town.scene.pieces.shown('burner-1')));
      await page.waitFor(calm);
      await page.eval(() => window.__stage.camera.panTo(0));
      await settleTiles(page);
      await page.waitFor(imagesReady);
      await page.screenshot(`cafe-${name}-pieces`);
      // Toggles are world state: they come back after a reload.
      const st = await page.eval(() => window.__town.scene.fixtures().props);
      await page.goto('index.html');
      await record(page);
      await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy);
      assert.deepEqual(await page.eval(() => window.__town.scene.fixtures().props), st);
      for (const [pid, v] of Object.entries(st)) assert.equal(await page.eval((pid) => window.__town.scene.pieces.state(pid), pid), v);
      assert.deepEqual(page.errors, []);
    });

    it('the painted spawners clone: pantry flour, a cup, a plate, a chocolate scoop', async () => {
      for (const [stock, kind, zone] of [['pantry-flour', 'flour', 0], ['cup-stack', 'cafe-cup', 900], ['plate-stack', 'plate', 900], ['tub-chocolate', 'scoop', 900]]) {
        await page.eval((x) => window.__stage.camera.panTo(x), zone);
        await page.frames(2);
        const [sid] = await byKind(page, stock);
        assert.ok(sid, stock);
        const n0 = (await byKind(page, kind)).length;
        const from = await entPoint(page, sid);
        assert.ok(from, `${stock}: a touch can reach it`);
        const to = await page.eval((z) => window.__stage.worldToScreen(z + 1000, 820), zone);
        if (kind === 'scoop') {
          await page.tap(from.x, from.y);            // a tap pops one out
        } else {
          await page.drag(from, to, { steps: 14, durationMs: 280 });
        }
        await page.waitFor(`Object.values(window.__store.state.entities).filter((e) => e.kind === '${kind}' && !e.deleted && e.room === 'cafe/kitchen').length === ${n0 + 1}`, { timeout: 5000 }).catch(() => {});
        const ids = await byKind(page, kind);
        assert.equal(ids.length, n0 + 1, `${stock} gave a ${kind}`);
        const e = await page.eval(([ids, sid]) => ids.map((id) => window.__store.state.entities[id]).find((q) => q.props.from === sid), [ids, sid]);
        assert.ok(e, `the new ${kind} came from ${stock}`);
        if (kind === 'scoop') assert.equal(e.props.flavor, 'chocolate');
      }
      await page.waitFor(calm);
      await page.screenshot(`cafe-${name}-spawned`);
      assert.deepEqual(page.errors, []);
    });

    it('the Mystery Dish draws its base and face parts', async () => {
      await page.eval(() => window.__stage.camera.panTo(1440));
      await settleTiles(page);
      await page.waitFor(imagesReady);
      const [id] = await byKind(page, 'mystery-dish');
      const r = await page.eval(async (id) => {
        const v = window.__town.scene.view.viewOf(id);
        const imgs = [...v.body.querySelectorAll('img')];
        await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
        return { srcs: imgs.map((i) => i.getAttribute('src')), ok: imgs.every((i) => i.naturalWidth > 0), vis: getComputedStyle(v.el).visibility };
      }, id);
      assert.equal(r.srcs.length, 4, r.srcs.join(', '));
      assert.match(r.srcs[0], /mystery-dish-green/);
      assert.ok(/mystery-eyes-googly/.test(r.srcs[1]) && /mystery-mouth-grin/.test(r.srcs[2]) && /mystery-topper-cherry/.test(r.srcs[3]));
      assert.ok(r.ok && r.vis === 'visible');
      await page.screenshot(`cafe-${name}-mystery`);
      assert.equal(await page.eval(noText), '');
    });

    it('stays idle when nobody touches it: no frames, no ops, no loading', async () => {
      await page.waitFor(calm);
      await settleTiles(page);
      await page.eval(() => {
        window.__rafs = 0;
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = (fn) => { window.__rafs++; return raf(fn); };
        window.__ops = 0;
        window.__offOps = window.__store.subscribe(() => { window.__ops++; });
        window.__loads = window.__town.scene.tiles.stats();
      });
      await new Promise((r) => setTimeout(r, 1500));   // a window in which nothing may happen
      const r = await page.eval(() => ({
        rafs: window.__rafs, ops: window.__ops, calm: (() => { try { return !window.__town.busy && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0; } catch { return false; } })(),
        loads: window.__town.scene.tiles.stats().loads - window.__loads.loads, timers: window.__town.scene.pieces.stats().timers,
      }));
      assert.deepEqual(r, { rafs: 0, ops: 0, calm: true, loads: 0, timers: 0 });
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
    });
  });
}
