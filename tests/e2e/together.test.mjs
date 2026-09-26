// End-to-end: two-iPad play (stretch, oxg.2) between two separate Chrome
// instances (separate profiles, so separate IndexedDB saves and device ids),
// over real WebRTC on this machine. Pairing uses the copy/paste fallback of
// the pairing screens (headless Chrome has no camera). Then real touch taps
// on the buddy on each page update both; a grab lease on one page shows as
// "held by the other kid" on the other; killing one Chrome leaves the other
// playing solo.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const squishes = () => document.querySelector('.buddy').dataset.squishes;
const status = () => window.__together.session.status;
const statusIs = (st) => `window.__together && window.__together.session.status === '${st}'`;

// Headless Chrome has no usable camera (getUserMedia never settles on a Mac
// without camera access), so the page gets "no camera": the pairing screens
// open the copy/paste box. Like WebKit, Chrome hands out mDNS ".local" host
// candidates unless the page holds camera permission, and two headless
// Chromes cannot resolve each other's names; granting the permission gives
// real LAN addresses, which is exactly the spike's KEY RULE on the iPad.
// (So this test needs the Mac to have a network interface with an address.)
async function noCameraButPermission(page) {
  await page.send('Browser.grantPermissions', { permissions: ['videoCapture'], origin: new URL(page.baseUrl).origin });
  await page.eval(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no camera here', 'NotFoundError'));
  });
}

async function click(page, selector) {
  await page.waitFor(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`);
  await page.tapElement(selector);
}

describe('two iPads together (real WebRTC, copy/paste pairing)', () => {
  let zoe, ian;
  let ianOwn;

  before(async () => {
    [zoe, ian] = await Promise.all([
      openPage({ viewport: 'ipad-air', path: 'index.html?room=buddy&together' }),
      openPage({ viewport: 'ipad-pro-9.7', path: 'index.html?room=buddy&together' }),
    ]);
    await Promise.all([zoe, ian].map(noCameraButPermission));
  });
  after(async () => {
    if (zoe) await zoe.close();
    if (ian) await ian.close();
  });

  it('each iPad starts in its own town', async () => {
    for (let i = 0; i < 2; i++) await zoe.tapElement('.buddy');
    await zoe.waitFor(`document.querySelector('.buddy').dataset.squishes === '2'`);
    await ian.tapElement('.buddy');
    await ian.waitFor(`document.querySelector('.buddy').dataset.squishes === '1'`);
    ianOwn = await ian.eval(() => ({ device: window.__store.device, state: JSON.stringify(window.__store.state) }));
    const zd = await zoe.eval(() => window.__store.device);
    assert.notEqual(zd, ianOwn.device);
    assert.equal(await zoe.eval(status), 'solo');
  });

  it('pairs with the picture screens and the copy/paste codes', async () => {
    await click(zoe, '.tg-badge');
    await click(zoe, '.tg-host');
    await click(ian, '.tg-badge');
    await click(ian, '.tg-join');
    // No camera in headless Chrome: the paste box opens by itself.
    await zoe.waitFor(() => document.querySelector('.tg-my-code').value.startsWith('P1|o|'), { timeout: 20000 });
    await zoe.screenshot('together-host-code');
    const offer = await zoe.eval(() => document.querySelector('.tg-my-code').value);
    assert.ok(offer.length < 400, 'offer code is QR-sized: ' + offer.length);
    await ian.waitFor(() => !document.querySelector('.tg-paste').hidden);
    await ian.eval((code) => { document.querySelector('.tg-their-code').value = code; }, offer);
    await click(ian, '.tg-use');
    await ian.waitFor(() => document.querySelector('.tg-my-code').value.startsWith('P1|a|'), { timeout: 20000 });
    await ian.screenshot('together-guest-code');
    const answer = await ian.eval(() => document.querySelector('.tg-my-code').value);
    await zoe.eval((code) => { document.querySelector('.tg-their-code').value = code; }, answer);
    await click(zoe, '.tg-use');
    await zoe.waitFor(statusIs('hosting'), { timeout: 30000 });
    await ian.waitFor(statusIs('visiting'), { timeout: 30000 });
    await zoe.waitFor(`document.querySelector('.tg-panel').dataset.screen === 'done'`);
    await zoe.screenshot('together-done');
    await zoe.waitFor(`document.querySelector('.tg-panel').hidden`);
    await ian.waitFor(`document.querySelector('.tg-panel').hidden`);
    // Ian visits Zoe's town: same world, same buddy, same count.
    assert.equal(await ian.eval(squishes), '2');
    const [zs, is] = await Promise.all([zoe, ian].map((p) => p.eval(() => {
      const s = Object.assign({}, window.__store.state); delete s.settings; return JSON.stringify(s);
    })));
    assert.equal(is, zs);
  });

  it('taps on either iPad count on both', async () => {
    await ian.tapElement('.buddy');
    await zoe.waitFor(`document.querySelector('.buddy').dataset.squishes === '3'`);
    await ian.waitFor(`document.querySelector('.buddy').dataset.squishes === '3'`);
    await zoe.tapElement('.buddy');
    await ian.waitFor(`document.querySelector('.buddy').dataset.squishes === '4'`);
    for (let i = 0; i < 3; i++) await ian.tapElement('.buddy');
    await zoe.waitFor(`document.querySelector('.buddy').dataset.squishes === '7'`);
    await ian.waitFor(`window.__store.state.entities[document.querySelector('.buddy').dataset.entity].props.squishes === 7`);
    assert.equal(await ian.eval(squishes), '7');
    await ian.screenshot('together-guest-playing');
  });

  it('a grab on one iPad shows as held on the other', async () => {
    const id = await zoe.eval(() => document.querySelector('.buddy').dataset.entity);
    assert.equal(await ian.eval((i) => window.__together.session.grab(i), id), true);
    await zoe.waitFor(`document.querySelector('.buddy').classList.contains('tg-held-other')`);
    assert.equal(await zoe.eval((i) => window.__together.session.grab(i), id), false);
    await ian.eval((i) => window.__together.session.release(i), id);
    await zoe.waitFor(`!document.querySelector('.buddy').classList.contains('tg-held-other')`);
  });

  it('kill one iPad: the other plays on solo, and the guest save was never touched', async () => {
    await ian.close();
    ian = null;
    await zoe.waitFor(statusIs('solo'), { timeout: 30000 });
    await zoe.tapElement('.buddy');
    await zoe.waitFor(`document.querySelector('.buddy').dataset.squishes === '8'`);
    await zoe.waitFor(`document.querySelector('.tg-badge').dataset.status === 'solo'`);
    assert.deepEqual(zoe.errors, []);
    assert.deepEqual(zoe.externalRequests(), []);
  });
});

describe('guest side of a dropped link', () => {
  let zoe, ian;
  before(async () => {
    [zoe, ian] = await Promise.all([
      openPage({ viewport: 'ipad-air', path: 'index.html?room=buddy&together' }),
      openPage({ viewport: 'ipad-air', path: 'index.html?room=buddy&together' }),
    ]);
    await Promise.all([zoe, ian].map(noCameraButPermission));
  });
  after(async () => {
    if (zoe) await zoe.close();
    if (ian) await ian.close();
  });

  it('the guest keeps playing when the host vanishes, then goes home to its own untouched town', async () => {
    await ian.tapElement('.buddy');
    await ian.waitFor(`document.querySelector('.buddy').dataset.squishes === '1'`);
    const own = await ian.eval(() => JSON.stringify(window.__store.state));
    // Pair through the UI's API (same code path as the buttons).
    const offer = await zoe.eval(async () => {
      window.__together.ui.open();
      await window.__together.ui.startHost();
      return window.__together.ui.myCode;
    });
    await ian.eval(() => { window.__together.ui.open(); return window.__together.ui.startJoin(); });
    await ian.eval((c) => window.__together.ui.useCode(c), offer);
    await ian.waitFor(() => window.__together.ui.myCode.startsWith('P1|a|'), { timeout: 20000 });
    const answer = await ian.eval(() => window.__together.ui.myCode);
    await zoe.eval((c) => window.__together.ui.useCode(c), answer);
    await ian.waitFor(statusIs('visiting'), { timeout: 30000 });
    assert.equal(await ian.eval(squishes), '0', 'Zoe\'s buddy has never been squished');
    await ian.waitFor(`document.querySelector('.tg-panel').hidden`);   // the "done" picture closes itself

    await zoe.close();
    zoe = null;
    await ian.waitFor(statusIs('away'), { timeout: 30000 });
    await ian.waitFor(`document.querySelector('.tg-badge').dataset.status === 'away'`);
    for (let i = 0; i < 2; i++) await ian.tapElement('.buddy');
    await ian.waitFor(`document.querySelector('.buddy').dataset.squishes === '2'`);

    // Go home: the picture button in the chooser.
    await click(ian, '.tg-badge');
    await click(ian, '.tg-home');
    await ian.waitFor(statusIs('solo'));
    assert.equal(await ian.eval(() => JSON.stringify(window.__store.state)), own);
    assert.equal(await ian.eval(squishes), '1');
    // And the save on disk is his own town too.
    await ian.goto('index.html?room=buddy');
    assert.equal(await ian.eval(squishes), '1');
    assert.equal(await ian.eval(() => Object.keys(window.__store.state.entities).length), 1);
    assert.deepEqual(ian.errors, []);
    assert.deepEqual(ian.externalRequests(), []);
  });
});
