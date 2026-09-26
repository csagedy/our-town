// End-to-end: the service worker (P1.2). The game must run with no network
// (road trips), and a new version must never take over mid-play: it waits for
// the next cold launch or for "Update now" (see the header of sw.js).
//
// These tests serve a temp copy of the shipped files, so the update test can
// publish a "v2" by editing that copy while the page is open.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openPage, removeDir, ROOT } from '../../tools/harness.mjs';

function shippedCopy() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ourtown-site-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'assets', 'data']) {
    if (existsSync(path.join(ROOT, f))) cpSync(path.join(ROOT, f), path.join(dir, f), { recursive: true });
  }
  return dir;
}

const swVersion = (file) => readFileSync(file, 'utf8').match(/var VERSION = '([^']+)'/)[1];

// Wait until the worker controls the page (first install claims it).
const controlled = () => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller);
const version = async () => (await import('./src/pwa.js')).installedVersion();
const waiting = async () => (await import('./src/pwa.js')).waitingVersion();
// The city map (the default scene) is up with every image decoded.
const cityReady = () => window.__town && window.__town.at === 'city'
  && Promise.all([...document.images].filter((i) => i.getAttribute('src')).map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.length > 0 && ok.every(Boolean));

describe('service worker: offline', () => {
  let page; let site;
  before(async () => {
    site = shippedCopy();
    page = await openPage({ root: site });
  });
  after(async () => {
    if (page) await page.close();
    if (site) removeDir(site);
  });

  it('installs, precaches every shipped file and takes control', async () => {
    await page.waitFor(controlled, { timeout: 30000 });
    const v = swVersion(path.join(site, 'sw.js'));
    assert.equal(await page.eval(version), v);
    const r = await page.eval(async (ver) => {
      const c = await caches.open('ourtown-' + ver);
      return {
        caches: await caches.keys(),
        tally: await (await c.match('./__precache')).text(),
      };
    }, v);
    assert.deepEqual(r.caches, ['ourtown-' + v]);
    const [got, total] = r.tally.split('/');
    assert.equal(got, total, `precached ${r.tally}`);
    assert.ok(Number(total) >= 8, `precache list has ${total} files`);
  });

  it('asks for persistent storage where the browser has it', async () => {
    const r = await page.eval(async () => (await import('./src/pwa.js')).requestPersistentStorage());
    assert.ok(r === true || r === false, `persist() answered ${r}`);
  });

  it('boots with the network gone (server killed and CDP offline): the city draws and reacts', async () => {
    page.stopServer();
    await page.send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    page.errors.length = 0;
    await page.goto('index.html');
    assert.equal(await page.eval(() => !!navigator.serviceWorker.controller), true);
    assert.equal(await page.eval(cityReady), true, 'every map image came from the cache');
    const theater = await page.eval(() => window.__town.scene.screenPoint('theater', 0.3));
    await page.tap(theater.x, theater.y);
    await page.waitFor(() => window.__town.scene.stats.last === 'theater');
    // The folder URL (what the home-screen icon opens) works offline too.
    await page.goto('./');
    assert.equal(await page.eval(cityReady), true);
    await page.screenshot('offline-boot');
    assert.deepEqual(page.externalRequests(), []);
    assert.deepEqual(page.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED/.test(e)), []);
  });
});

describe('service worker: updates wait for a cold launch or "Update now"', () => {
  let page; let site; let v1;
  const v2 = 'v2test0000';

  before(async () => {
    site = shippedCopy();
    v1 = swVersion(path.join(site, 'sw.js'));
    page = await openPage({ root: site });
    await page.waitFor(controlled, { timeout: 30000 });
    // Relaunch so the whole session is served by the worker, as on the iPad.
    await page.goto('index.html');
  });
  after(async () => {
    if (page) await page.close();
    if (site) removeDir(site);
  });

  // Publish v2: a new sw.js version and a changed index.html.
  const publishV2 = () => {
    const sw = path.join(site, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace(`var VERSION = '${v1}'`, `var VERSION = '${v2}'`));
    const html = path.join(site, 'index.html');
    writeFileSync(html, readFileSync(html, 'utf8').replace('</head>', '<meta name="ourtown-test" content="v2">\n</head>'));
  };

  it('installs a new version in the background but keeps running the old one mid-session', async () => {
    publishV2();
    await page.eval(() => { window.__midSession = 'still here'; });
    // The browser's own update check (like the one on every launch).
    await page.eval(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitFor(waiting, { timeout: 30000 });
    assert.equal(await page.eval(waiting), v2);
    // Give it a moment to prove nothing swaps under the running page. (A
    // fixed wait on purpose: it's a window for something NOT to happen.)
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(await page.eval(() => window.__midSession), 'still here', 'page was not reloaded');
    assert.equal(await page.eval(version), v1, 'old worker still in control');
    assert.equal(await page.eval(() => window.__town.at), 'city', 'the running city is untouched');
    // The old cache is still there for the running page; the new one is filled.
    const keys = await page.eval(() => caches.keys());
    assert.deepEqual(keys.sort(), [`ourtown-${v1}`, `ourtown-${v2}`].sort());
  });

  it('takes over when a parent taps "Update now"', async () => {
    const loaded = page.eval(async () => (await import('./src/pwa.js')).updateNow());
    assert.equal(await loaded, 'reloading');
    await page.waitFor(() => document.body.dataset.boot === 'ready' && !window.__midSession
      && !!document.querySelector('meta[name="ourtown-test"]'), { timeout: 30000 });
    assert.equal(await page.eval(version), v2);
    assert.equal(await page.eval(waiting), '');
    assert.deepEqual(await page.eval(() => caches.keys()), [`ourtown-${v2}`], 'old cache cleaned up');
    assert.equal(await page.eval(async () => (await import('./src/pwa.js')).updateNow()), 'up-to-date');
  });
});

describe('service worker: a waiting version takes over on the next cold launch', () => {
  let page; let site; let v1;
  const v2 = 'v2cold0000';

  before(async () => {
    site = shippedCopy();
    v1 = swVersion(path.join(site, 'sw.js'));
    page = await openPage({ root: site });
    await page.waitFor(controlled, { timeout: 30000 });
    // Relaunch so the whole session is served by the worker, as on the iPad.
    await page.goto('index.html');
  });
  after(async () => {
    if (page) await page.close();
    if (site) removeDir(site);
  });

  it('switches to the new version at boot, before any play', async () => {
    const sw = path.join(site, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace(`var VERSION = '${v1}'`, `var VERSION = '${v2}'`));
    await page.eval(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitFor(waiting, { timeout: 30000 });
    assert.equal(await page.eval(version), v1);
    // Relaunch: a fresh load of the app with the old worker still in charge.
    // It boots, sees the waiting version and reloads into it straight away,
    // so don't let goto() check the boot state of the first (old) document.
    await page.goto('index.html', { waitForBoot: false });
    await page.waitFor(async () => performance.getEntriesByType('navigation')[0].type === 'reload'
      && document.body.dataset.boot === 'ready'
      && (await (await import('./src/pwa.js')).installedVersion()) === 'v2cold0000', { timeout: 30000 });
    assert.equal(await page.eval(waiting), '');
    assert.deepEqual(page.externalRequests(), []);
  });
});
