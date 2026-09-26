// End-to-end: persistence (P1.4) on the real IndexedDB in Chrome. The boot
// buddy's squish count is an entity in the store, so it proves the save path:
// real touch taps -> store ops -> IndexedDB -> reload / crash -> same count.
//
// "Kill abruptly" is Page.crash: the renderer dies with no pagehide, no
// unload and no pending timers, like iOS killing a backgrounded tab.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openPage } from '../../tools/harness.mjs';

const squishes = () => document.querySelector('.buddy').dataset.squishes;
const storedSquishes = () => {
  const s = window.__store.state;
  const b = Object.values(s.entities).find((e) => e.kind === 'buddy');
  return b.props.squishes;
};

async function tapTimes(page, n, expect) {
  for (let i = 0; i < n; i++) await page.tapElement('.buddy');
  await page.waitFor(`document.querySelector('.buddy').dataset.squishes === ${JSON.stringify(expect)}`, { timeout: 3000 }).catch(() => {});
  assert.equal(await page.eval(squishes), expect);
}

// Kill the renderer, then load the game again in the same tab (same profile,
// so the same IndexedDB).
async function crashAndReopen(page) {
  page.send('Page.crash').catch(() => {});   // never answered: the renderer dies
  const end = Date.now() + 5000;
  while (!page.errors.includes('renderer crashed')) {
    if (Date.now() > end) throw new Error('renderer did not crash');
    await new Promise((r) => setTimeout(r, 20));
  }
  page.errors.splice(page.errors.indexOf('renderer crashed'), 1);
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, 300));
    try { await page.goto('index.html?room=buddy'); return; } catch (err) {
      if (attempt >= 3 || !/ERR_ABORTED/.test(err.message)) throw err;
    }
  }
}

describe('persistence (real IndexedDB)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-air', path: 'index.html?room=buddy' }); });
  after(async () => { if (page) await page.close(); });

  it('boots on IndexedDB with a stable device id', async () => {
    const r = await page.eval(() => ({ mode: window.__persist.mode, device: window.__persist.device, recovered: window.__persist.recovered }));
    assert.equal(r.mode, 'idb');
    assert.match(r.device, /^[0-9a-z]{6}$/);
    assert.equal(r.recovered, false);
    await page.goto('index.html?room=buddy');
    assert.equal(await page.eval(() => window.__persist.device), r.device, 'same device id after reload');
  });

  it('keeps state across a reload', async () => {
    assert.equal(await page.eval(squishes), '0');
    await tapTimes(page, 3, '3');
    await page.goto('index.html?room=buddy');
    assert.equal(await page.eval(squishes), '3');
    assert.equal(await page.eval(storedSquishes), 3);
    assert.deepEqual(page.errors, []);
  });

  it('saves on visibilitychange -> hidden, so a kill right after loses nothing', async () => {
    await tapTimes(page, 2, '5');
    // One more squish and the hide in the same task: that op is certainly
    // still in the write buffer (the idle flush waits 250ms) when we hide.
    const buffered = await page.eval(() => {
      window.__scene.squish();
      const n = window.__persist.pending().buffered;
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return n;
    });
    assert.ok(buffered >= 1, 'op was unsaved when the page hid');
    await crashAndReopen(page);            // no waiting: killed straight after hiding
    assert.equal(await page.eval(squishes), '6');
    assert.deepEqual(page.errors, []);
  });

  it('flushes at idle too: a kill with no hide event after a short pause loses nothing', async () => {
    await tapTimes(page, 1, '7');
    await page.waitFor(() => window.__persist.pending().buffered === 0, { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 150));   // let the transaction land
    await crashAndReopen(page);
    assert.equal(await page.eval(squishes), '7');
    assert.deepEqual(page.errors, []);
  });

  it('boots fresh without errors from a corrupt database, keeping a backup', async () => {
    // Stop this page's own saving first, so its pagehide snapshot doesn't
    // overwrite the damage before the next boot sees it.
    await page.eval(() => window.__persist.detach());
    await page.eval(() => new Promise((resolve, reject) => {
      const req = indexedDB.open('ourtown');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['snapshot', 'ops'], 'readwrite');
        tx.objectStore('snapshot').put({ seq: 'x', state: { schema: 1, entities: 42, map: null } }, 'world');
        tx.objectStore('ops').put('not an op', 999999);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    }));
    await page.goto('index.html?room=buddy');
    const r = await page.eval(async () => {
      const backups = await new Promise((resolve) => {
        const req = indexedDB.open('ourtown');
        req.onsuccess = () => {
          const g = req.result.transaction('backups').objectStore('backups').getAll();
          g.onsuccess = () => { req.result.close(); resolve(g.result); };
        };
      });
      return {
        recovered: window.__persist.recovered,
        mode: window.__persist.mode,
        backups: backups.map((b) => b.snapshot && b.snapshot.state && b.snapshot.state.entities),
      };
    });
    assert.deepEqual(r, { recovered: true, mode: 'idb', backups: [42] });
    assert.equal(await page.eval(squishes), '0', 'fresh world');
    assert.deepEqual(page.errors, []);
    await page.screenshot('persist-recovered');
    // And the fresh world saves normally again.
    await tapTimes(page, 2, '2');
    await page.goto('index.html?room=buddy');
    assert.equal(await page.eval(squishes), '2');
    assert.equal(await page.eval(() => window.__persist.recovered), false);
  });

  it('round-trips a world file: export (download fallback) and import (file input)', async () => {
    // Export through the <a download> fallback and read back what it offered.
    const exported = await page.eval(async () => {
      const { shareWorldFile } = await import('./src/core/persist.js');
      const file = await window.__persist.exportWorld();
      const seen = [];
      const orig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function click() { seen.push({ href: this.href, download: this.download }); };
      let how;
      try { how = await shareWorldFile(file, { method: 'download' }); } finally { HTMLAnchorElement.prototype.click = orig; }
      const text = await (await fetch(seen[0].href)).text();
      return { how, name: seen[0].download, text, same: text === await file.text() };
    });
    assert.equal(exported.how, 'downloaded');
    assert.match(exported.name, /^ourtown-world-\d{4}-\d\d-\d\d\.json$/);
    assert.equal(exported.same, true);
    const parsed = JSON.parse(exported.text);
    assert.equal(parsed.format, 'ourtown-world');
    assert.equal(Object.values(parsed.state.entities).find((e) => e.kind === 'buddy').props.squishes, 2);

    await tapTimes(page, 3, '5');          // the world moves on after the backup

    // Import it back through a real file input.
    const dir = mkdtempSync(path.join(tmpdir(), 'ourtown-world-'));
    const file = path.join(dir, exported.name);
    writeFileSync(file, exported.text);
    try {
      await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
      await page.eval(async () => {
        const { pickWorldFile } = await import('./src/core/persist.js');
        window.__picked = pickWorldFile();
      });
      const { root } = await page.send('DOM.getDocument', {});
      const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.world-file-input' });
      assert.ok(nodeId, 'file input is in the page');
      await page.send('DOM.setFileInputFiles', { nodeId, files: [file] });
      const r = await page.eval(async () => {
        const f = await window.__picked;
        const res = await window.__persist.importWorld(f);
        return { name: f.name, res, left: !!document.querySelector('.world-file-input') };
      });
      assert.equal(r.name, exported.name);
      assert.equal(r.left, false, 'input removed after picking');
      assert.equal(r.res.blobs, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(await page.eval(storedSquishes), 2, 'store holds the imported world');
    await page.goto('index.html?room=buddy');
    assert.equal(await page.eval(squishes), '2', 'imported world survives a reload');

    // A file from a newer app version is refused and changes nothing.
    const refused = await page.eval(async (text) => {
      const f = JSON.parse(text);
      f.version = 99;
      try { await window.__persist.importWorld(JSON.stringify(f)); return 'accepted'; } catch (e) { return e.code; }
    }, exported.text);
    assert.equal(refused, 'too-new');
    assert.equal(await page.eval(storedSquishes), 2);
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });

  it('stores blobs in their own object store', async () => {
    const r = await page.eval(async () => {
      const p = window.__persist;
      await p.putBlob('tape:1', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp4' }));
      const b = await p.getBlob('tape:1');
      const bytes = Array.from(new Uint8Array(await b.arrayBuffer()));
      const ids = await p.blobIds();
      await p.deleteBlob('tape:1');
      return { bytes, type: b.type, ids, after: await p.blobIds() };
    });
    assert.deepEqual(r, { bytes: [1, 2, 3], type: 'audio/mp4', ids: ['tape:1'], after: [] });
  });
});

describe('persistence with no storage (private mode)', () => {
  let page;
  before(async () => {
    page = await openPage({ path: null });
    // Old Safari private mode: IndexedDB exists but open() throws.
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: "IDBFactory.prototype.open = function () { throw new DOMException('The operation is insecure.', 'SecurityError'); };",
    });
    await page.goto('index.html?room=buddy');
  });
  after(async () => { if (page) await page.close(); });

  it('plays normally and simply forgets on reload', async () => {
    assert.equal(await page.eval(() => window.__persist.mode), 'memory');
    await tapTimes(page, 2, '2');
    await page.goto('index.html?room=buddy');
    assert.equal(await page.eval(squishes), '0');
    assert.deepEqual(page.errors, []);
  });
});
