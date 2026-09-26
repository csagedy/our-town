// End-to-end: the parent menu (P1.16) with real (trusted) touches on iPad
// viewports. A tap or a short hold on the hot corner does nothing; a 2 s
// hold opens the menu (on the city map's corner and on a location's map
// button, which then does NOT go to the map). Every setting works and
// survives a reload (localStorage, not the world); the text layer shows name
// tags only when on, and a tapped tag is read aloud; tidy and start over;
// the world file round-trips (save -> change -> load); "Play together" opens
// the pairing screens; "Update now" shows up when a new version waits.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openPage, removeDir, ROOT, VIEWPORTS } from '../../tools/harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isOpen = () => !!window.__parentMenu && window.__parentMenu.isOpen;
const pt = (x, y) => ({ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 });

/** The hot corner's visible anchor: the map button in a location, the gear on the city. */
async function corner(page) {
  const sel = await page.eval(() => (window.__town && window.__town.at !== 'city' ? '.ui-map' : '.pm-mark'));
  const b = await page.box(sel);
  return { x: b.cx, y: b.cy };
}
async function hold(page, p, ms) {
  const g = page.gesture();
  await g('touchStart', [pt(p.x, p.y)], 0);
  await sleep(ms);
  await g('touchEnd', [], ms);
}
async function openMenu(page) {
  await hold(page, await corner(page), 2300);
  await page.waitFor(isOpen);
}
const tap = (page, name) => page.tapElement(`[data-pm="${name}"]`);
const checked = (page, name) => page.eval((n) => document.querySelector(`[data-pm="${n}"]`).getAttribute('aria-checked'), name);
const visibleLabels = () => [...document.querySelectorAll('.ent-label span')].filter((s) => s.getClientRects().length > 0 && s.textContent).map((s) => s.textContent);

// Record ring visibility changes and speech in the page as they happen.
async function record(page) {
  await page.eval(async () => {
    const rec = window.__pmRec = { ringShown: 0, said: [] };
    new MutationObserver(() => { if (!document.querySelector('.pm-ring').hidden) rec.ringShown++; })
      .observe(document.querySelector('.pm-ring'), { attributes: true, attributeFilter: ['hidden'] });
    const { speech } = await import('./src/audio/index.js');
    const say = speech.say;
    speech.say = (text, o) => { rec.said.push(text); return say(text, o); };
  });
}

describe('parent menu (ipad-pro-9.7, the A9X size)', () => {
  let page; let dl;
  before(async () => {
    page = await openPage({ viewport: 'ipad-pro-9.7' });
    await record(page);
    dl = mkdtempSync(path.join(tmpdir(), 'ourtown-dl-'));
  });
  after(async () => {
    if (page) await page.close();
    if (dl) removeDir(dl);
  });

  it('a tap, a 1 s hold, a dragged hold and a two-finger hold do NOT open it', async () => {
    assert.equal(await page.eval(() => window.__town.at), 'city');
    const c = await corner(page);
    await page.tap(c.x, c.y);
    await hold(page, c, 1000);
    // Hold but slide away.
    let g = page.gesture();
    await g('touchStart', [pt(c.x, c.y)], 0);
    await sleep(300);
    await g('touchMove', [pt(c.x + 60, c.y + 40)], 300);
    await sleep(2000);
    await g('touchEnd', [], 2300);
    // Hold with a second finger elsewhere on the screen.
    g = page.gesture();
    await g('touchStart', [pt(c.x, c.y)], 0);
    await sleep(200);
    await g('touchStart', [pt(c.x, c.y), Object.assign(pt(600, 500), { id: 1 })], 200);
    await sleep(2100);
    await g('touchEnd', [], 2300);
    // A window for something NOT to happen (fixed wait on purpose).
    await sleep(600);
    assert.equal(await page.eval(isOpen), false);
    const r = await page.eval(() => ({ stats: window.__parentMenu.stats, ring: window.__pmRec.ringShown, ringHidden: document.querySelector('.pm-ring').hidden }));
    assert.equal(r.stats.opened, 0);
    assert.ok(r.ring >= 1, 'the ring showed during the 1 s hold');
    assert.equal(r.ringHidden, true, 'and went away on release');
    assert.deepEqual(page.errors, []);
  });

  it('a 2 s hold on the corner opens it (and the ring fills on the way)', async () => {
    const c = await corner(page);
    const g = page.gesture();
    await g('touchStart', [pt(c.x, c.y)], 0);
    await sleep(1200);
    await page.screenshot('parent-menu-ring');
    await sleep(1100);
    await page.waitFor(isOpen);
    await g('touchEnd', [], 2300);
    await page.frames(3);
    await page.screenshot('parent-menu-open');
    const r = await page.eval(() => ({
      text: document.querySelector('.pm-card').innerText,
      place: document.querySelector('.pm-place').textContent,
      tidy: document.querySelector('[data-pm="tidy"]').disabled,
      at: window.__town.at,
    }));
    assert.match(r.text, /Sound/);
    assert.match(r.text, /Version/);
    assert.match(r.place, /town map/);
    // Tidy is offered wherever the scene has behaviors (the P1.14 street on the map too).
    assert.equal(r.tidy, !(await page.eval(() => !!(window.__town.scene && window.__town.scene.behaviors))));
    assert.equal(r.at, 'city');
  });

  it('every toggle works and survives a reload', async () => {
    // Defaults: sound on, voice on, words OFF.
    assert.equal(await checked(page, 'sound'), 'true');
    assert.equal(await checked(page, 'voice'), 'true');
    assert.equal(await checked(page, 'textLayer'), 'false');
    await tap(page, 'sound');
    await tap(page, 'voice');
    await tap(page, 'textLayer');
    assert.equal(await checked(page, 'sound'), 'false');
    // Volume is greyed out while the sound is off: turn it back on to set it.
    await tap(page, 'sound');
    const b = await page.box('[data-pm="volume"]');
    await page.tap(b.x + b.w * 0.3, b.cy);
    await page.waitFor(() => document.querySelector('[data-pm="volume"]').value !== '70');
    await tap(page, 'sound');
    const live = await page.eval(async () => {
      const a = await import('./src/audio/index.js');
      return { muted: a.isMuted(), speech: a.isSpeechOn(), volume: a.getVolume(), talk: window.__store.state.settings.talk,
        text: document.body.classList.contains('text-layer'), saved: JSON.parse(localStorage.getItem('ourtown.settings')) };
    });
    assert.equal(live.muted, true);
    assert.equal(live.speech, false);
    assert.equal(live.talk, false, 'the characters stop talking');
    assert.equal(live.text, true);
    assert.ok(live.volume > 0.15 && live.volume < 0.45, `volume ${live.volume}`);
    assert.deepEqual(live.saved, { sound: false, volume: live.volume, voice: false, textLayer: true });
    // Nothing went into the shared world: no op for settings.
    assert.equal(await page.eval(() => window.__persist.pending().buffered + window.__persist.pending().logged >= 0), true);

    await page.goto('index.html');
    await record(page);
    const after = await page.eval(async () => {
      const a = await import('./src/audio/index.js');
      return { muted: a.isMuted(), speech: a.isSpeechOn(), volume: a.getVolume(), talk: window.__store.state.settings.talk, text: document.body.classList.contains('text-layer') };
    });
    assert.deepEqual(after, { muted: true, speech: false, volume: live.volume, talk: false, text: true });
    await openMenu(page);
    assert.equal(await checked(page, 'sound'), 'false');
    assert.equal(await checked(page, 'voice'), 'false');
    assert.equal(await checked(page, 'textLayer'), 'true');
    // Back to sound and voice on, words off, for the rest of the tests.
    await tap(page, 'sound');
    await tap(page, 'voice');
    await tap(page, 'textLayer');
    await tap(page, 'close');
    assert.equal(await page.eval(isOpen), false);
  });

  it('the text layer shows name tags only when on, and a tapped tag is read aloud', async () => {
    await page.eval(() => window.__town.go('cafe/kitchen'));
    await page.waitFor(() => window.__town.at === 'cafe/kitchen' && !window.__town.busy && window.__town.scene.view);
    await page.frames(3);
    assert.deepEqual(await page.eval(visibleLabels), [], 'off: no tags');
    assert.equal(await page.eval(() => document.body.innerText.trim()), '', 'off: no text on screen at all');
    // Open the menu by holding the map button: it must not go to the map.
    await openMenu(page);
    assert.equal(await page.eval(() => window.__town.at), 'cafe/kitchen', 'the long hold did not travel');
    await tap(page, 'textLayer');
    await tap(page, 'close');
    await page.frames(3);
    const on = await page.eval(visibleLabels);
    assert.ok(on.length >= 8, `tags: ${on.join(', ')}`);
    assert.ok(on.includes('Mug') && on.includes('Cookie Jar'), on.join(', '));
    await page.screenshot('parent-menu-text-layer');
    // Tap the mug's tag: read aloud, and the mug itself does not react.
    const b = await page.eval(() => {
      const s = [...document.querySelectorAll('.ent-label span')].find((q) => q.textContent === 'Mug');
      const r = s.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.eval(() => { window.__pmRec.said.length = 0; });
    await page.tap(b.x, b.y);
    await page.waitFor(() => window.__pmRec.said.includes('Mug'));
    // Off again: gone.
    await openMenu(page);
    await tap(page, 'textLayer');
    await tap(page, 'close');
    await page.frames(2);
    assert.deepEqual(await page.eval(visibleLabels), []);
  });

  it('tidy up runs the room\'s tidy, and start over (after a confirm) resets the room', async () => {
    const before = await page.eval(() => {
      const { entities } = window.__store.state;
      return Object.values(entities).filter((e) => e.room === 'cafe/kitchen' && !e.deleted).map((e) => e.id).sort();
    });
    await openMenu(page);
    assert.equal(await page.eval(() => document.querySelector('[data-pm="tidy"]').disabled), false);
    await tap(page, 'tidy');
    await page.waitFor(() => /tidy|went home/i.test(document.querySelector('.pm-status').textContent));
    // Start over asks first; cancel keeps everything.
    await tap(page, 'reset');
    assert.equal(await page.eval(() => document.querySelector('.pm-confirm').hidden), false);
    await page.screenshot('parent-menu-confirm');
    await tap(page, 'no');
    assert.equal(await page.eval(() => document.querySelector('.pm-confirm').hidden), true);
    await tap(page, 'reset');
    await page.eval(() => { window.__beforeReset = 1; });
    await tap(page, 'yes');
    await page.waitFor(() => !window.__beforeReset && document.body.dataset.boot === 'ready' && window.__town && window.__town.at === 'cafe/kitchen' && window.__town.scene.view, { timeout: 30000 });
    await record(page);
    const r = await page.eval(async () => {
      const { entities } = window.__store.state;
      const live = Object.values(entities).filter((e) => !e.deleted);
      // P2a.1: the cafe strip's first-visit things and cast (src/scenes/cafe.js).
      const { CAFE_ITEMS: KITCHEN_ITEMS, CAFE_CAST: KITCHEN_CAST } = await import('./src/scenes/cafe.js');
      return {
        ids: live.filter((e) => e.room === 'cafe/kitchen').map((e) => e.id),
        oldLive: live.filter((e) => e.room === 'cafe/kitchen' || e.parent).map((e) => e.id),
        kinds: live.map((e) => e.kind),
        want: KITCHEN_ITEMS.map((i) => i[0]), cast: KITCHEN_CAST.length,
      };
    });
    assert.equal(r.ids.filter((id) => before.includes(id)).length, 0, 'everything that was there is gone');
    for (const k of r.want) assert.ok(r.kinds.includes(k), `the starting ${k} is back`);
    assert.equal(r.kinds.filter((k) => k === 'char').length, r.cast, 'the starting cast is back');
  });

  it('the world file round-trips: save to a file, change the world, load the file', async () => {
    // Something recognisable in the world: the mug at x 333.
    const mug = await page.eval(() => {
      const m = Object.values(window.__store.state.entities).find((e) => e.kind === 'mug' && !e.deleted);
      window.__store.dispatch('move', { id: m.id, room: 'cafe/kitchen', x: 333, y: 930, z: 0 });
      return m.id;
    });
    await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    // Headless Chrome has navigator.share; the iPad shows its share sheet. Here: the download fallback.
    await page.eval(() => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; });
    await openMenu(page);
    await page.waitFor(() => !document.querySelector('[data-pm="save"]').disabled);
    await tap(page, 'save');
    await page.waitFor(() => /Saved/.test(document.querySelector('.pm-status').textContent));
    let file = null;
    for (let i = 0; i < 100 && !file; i++) {
      const f = readdirSync(dl).find((n) => n.endsWith('.json'));
      if (f) file = path.join(dl, f); else await sleep(100);
    }
    assert.ok(file, 'the world file was downloaded');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(json.format, 'ourtown-world');
    assert.equal(json.state.entities[mug].x, 333);
    await tap(page, 'close');

    // Change the world, then load the file back.
    await page.eval((id) => window.__store.dispatch('move', { id, room: 'cafe/kitchen', x: 777, y: 930, z: 0 }), mug);
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await openMenu(page);
    await tap(page, 'load');
    await page.waitFor(() => !!document.querySelector('.world-file-input'));
    const { root } = await page.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.world-file-input' });
    await page.send('DOM.setFileInputFiles', { nodeId, files: [file] });
    await page.waitFor(() => !document.querySelector('.pm-confirm').hidden);
    assert.match(await page.eval(() => document.querySelector('.pm-confirm p').textContent), /Replace the whole town/);
    await page.eval(() => { window.__beforeLoad = 1; });
    await tap(page, 'yes');
    await page.waitFor(() => !window.__beforeLoad && document.body.dataset.boot === 'ready' && window.__town && window.__town.scene && window.__town.scene.view, { timeout: 30000 });
    await record(page);
    assert.equal(await page.eval((id) => window.__store.state.entities[id].x, mug), 333, 'the saved world came back');
    assert.equal(await page.eval((id) => Math.round(window.__town.scene.view.viewOf(id).x), mug), 333, 'and is drawn there');
  });

  it('"Play together" opens the pairing screens', async () => {
    await openMenu(page);
    await tap(page, 'together');
    await page.waitFor(() => { const p = document.querySelector('.tg-panel'); return p && !p.hidden; });
    assert.equal(await page.eval(isOpen), false, 'the menu closed');
    assert.equal(await page.eval(() => !!window.__together && !!document.querySelector('.tg-badge')), true);
    await page.frames(3);
    await page.screenshot('parent-menu-together');
    await page.tapElement('.tg-close');
    await page.waitFor(() => document.querySelector('.tg-panel').hidden);
    assert.deepEqual(page.externalRequests(), []);
    assert.deepEqual(page.errors, []);
  });
});

// The hold works the same on the other two iPad sizes.
for (const name of ['ipad-air', 'ipad-pro-12.9']) {
  describe(`parent menu hold (${name})`, () => {
    let page;
    before(async () => { page = await openPage({ viewport: name }); });
    after(async () => { if (page) await page.close(); });
    it('tap: closed; 2 s hold: open', async () => {
      const c = await corner(page);
      await page.tap(c.x, c.y);
      await sleep(2200);
      assert.equal(await page.eval(isOpen), false);
      await hold(page, c, 2300);
      await page.waitFor(isOpen);
      await page.screenshot(`parent-menu-${name}`);
      assert.ok(VIEWPORTS[name]);
      assert.deepEqual(page.errors, []);
    });
  });
}

// "Update now" (the offline.test.mjs approach: a temp copy of the site that
// can publish a v2 while the page is open).
function shippedCopy() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ourtown-site-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets', 'data']) {
    if (existsSync(path.join(ROOT, f))) cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  }
  return dir;
}
const swVersion = (file) => readFileSync(file, 'utf8').match(/var VERSION = '([^']+)'/)[1];

describe('parent menu: version and "Update now"', () => {
  let page; let site; let v1;
  const v2 = 'v2menu0000';
  before(async () => {
    site = shippedCopy();
    v1 = swVersion(path.join(site, 'sw.js'));
    page = await openPage({ root: site, viewport: 'ipad-pro-9.7' });
    await page.waitFor(() => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller), { timeout: 30000 });
    await page.goto('index.html');
  });
  after(async () => {
    if (page) await page.close();
    if (site) removeDir(site);
  });

  it('shows the version, no update button until a new version waits, then updates', async () => {
    await openMenu(page);
    await page.waitFor(`document.querySelector('.pm-version').textContent === 'Version ${v1}'`, { timeout: 10000 });
    assert.equal(await page.eval(() => document.querySelector('[data-pm="update"]').hidden), true);
    await tap(page, 'close');
    const sw = path.join(site, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace(`var VERSION = '${v1}'`, `var VERSION = '${v2}'`));
    await page.eval(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitFor(async () => (await (await import('./src/pwa.js')).waitingVersion()) !== '', { timeout: 30000 });
    await openMenu(page);
    await page.waitFor(() => !document.querySelector('[data-pm="update"]').hidden, { timeout: 10000 });
    assert.match(await page.eval(() => document.querySelector('[data-pm="update"]').textContent), new RegExp(v2));
    await page.screenshot('parent-menu-update');
    await page.eval(() => { window.__beforeUpdate = 1; });
    await tap(page, 'update');
    await page.waitFor(async () => !window.__beforeUpdate && document.body.dataset.boot === 'ready'
      && (await (await import('./src/pwa.js')).installedVersion()) === 'v2menu0000', { timeout: 30000 });
    assert.deepEqual(page.externalRequests(), []);
  });
});
