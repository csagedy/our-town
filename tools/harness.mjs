// Headless-browser test harness. Node built-ins only (no npm install): it
// starts tools/serve.py, launches the installed Google Chrome headless, and
// drives it over the Chrome DevTools Protocol with Node's global WebSocket.
//
// The page runs in an iPad-sized landscape viewport with touch emulation on,
// so page.tap()/drag()/longPress() send real (trusted) touch input through
// Chrome's input pipeline, which the page receives as pointer events with
// pointerType "touch", exactly like on the iPad.
//
// Usage (see tests/e2e/boot.test.mjs for a full example):
//
//   import { openPage } from '../../tools/harness.mjs';
//   const page = await openPage({ viewport: 'ipad-air' });   // loads index.html, waits for boot
//   await page.tapElement('.buddy');
//   assert.equal(await page.eval(() => document.querySelector('.buddy').dataset.squishes), '1');
//   assert.deepEqual(page.externalRequests(), []);
//   await page.close();
//
// Page API:
//   page.baseUrl                      http://127.0.0.1:<port>/
//   page.goto(path)                   navigate, wait for load and body[data-boot="ready"]
//   page.eval(fnOrExpr, ...args)      run in the page (awaits promises), returns JSON value
//   page.waitFor(fnOrExpr, {timeout}) poll until truthy
//   page.box(selector)                {x, y, w, h, cx, cy} in CSS px, or null
//   page.tap(x, y, {holdMs})          one-finger tap
//   page.tapElement(selector)         tap the element's center
//   page.longPress(x, y, {holdMs})    press and hold (default 600ms)
//   page.drag(from, to, {steps, durationMs, holdMs})   one-finger drag, from/to = {x, y}
//   page.touch(type, points)          raw CDP touch: 'touchStart'|'touchMove'|'touchEnd'|'touchCancel'
//   page.screenshot(name)             PNG into test-results/<name>.png, returns the path
//   page.errors                       uncaught exceptions, console.error, failed loads (strings)
//   page.requests                     every request URL the page made
//   page.externalRequests()           requests not to the local server (must stay empty)
//   page.setViewport(name|{width,height})
//   page.send(method, params)         raw CDP escape hatch
//   page.close()                      kill Chrome and the server
//
// Environment: CHROME=/path/to/chrome overrides the browser; HEADFUL=1 shows
// the window (handy when debugging a test).

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RESULTS_DIR = path.join(ROOT, 'test-results');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Landscape CSS viewports of the target devices.
export const VIEWPORTS = {
  'ipad-air': { width: 1180, height: 820 },        // iPad Air 5th gen (M1)
  'ipad-pro-12.9': { width: 1366, height: 1024 },  // original iPad Pro 12.9" (A9X)
  'ipad-pro-9.7': { width: 1024, height: 768 },    // original iPad Pro 9.7" (A9X)
};

// iPadOS 16 Safari. Cosmetic only: the engine is still Chrome's Blink, so this
// harness can't catch WebKit-only bugs or APIs newer than Safari 16.
const IPAD_SAFARI_16_UA = 'Mozilla/5.0 (iPad; CPU OS 16_7 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLine(stream, pattern, timeoutMs, what) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`${what}: timed out; output so far:\n${buf}`)), timeoutMs);
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const m = buf.match(pattern);
      if (m) { clearTimeout(timer); resolve(m); }
    });
  });
}

/** Start tools/serve.py on a free port. Returns { url, proc }. */
export async function startServer() {
  const proc = spawn('python3', [path.join(ROOT, 'tools', 'serve.py'), '--port', '0', '--quiet'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const m = await readLine(proc.stdout, /Serving on (http:\/\/127\.0\.0\.1:\d+\/)/, 10000, 'serve.py');
  return { url: m[1], proc };
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method}: no reply in 15s`));
      }, 15000);
    });
  }

  on(fn) { this.listeners.push(fn); }
}

async function launchChrome(viewport) {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME} (set CHROME=...)`);
  const profile = mkdtempSync(path.join(tmpdir(), 'ourtown-chrome-'));
  const args = [
    process.env.HEADFUL ? '' : '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${viewport.width},${viewport.height}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-default-apps', '--mute-audio', '--hide-scrollbars',
    'about:blank',
  ].filter(Boolean);
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const m = await readLine(proc.stderr, /DevTools listening on (ws:\/\/\S+)/, 20000, 'chrome');
  const ws = new WebSocket(m[1]);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('could not connect to Chrome DevTools')), { once: true });
  });
  return { proc, profile, cdp: new Cdp(ws), ws };
}

function toSource(fnOrExpr, args) {
  return typeof fnOrExpr === 'function'
    ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})`
    : String(fnOrExpr);
}

/**
 * Launch Chrome + the dev server and open a page.
 * opts.viewport: a VIEWPORTS key or {width, height}; default 'ipad-air'.
 * opts.path: page to load, default 'index.html'. Pass null to skip loading.
 * opts.waitForBoot: wait for body[data-boot="ready"], default true.
 */
export async function openPage(opts = {}) {
  const server = await startServer();
  let chrome;
  try {
    chrome = await launchChrome(resolveViewport(opts.viewport || 'ipad-air'));
  } catch (err) {
    server.proc.kill();
    throw err;
  }
  const { cdp } = chrome;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);

  const origin = new URL(server.url).origin;
  const page = {
    baseUrl: server.url,
    errors: [],
    requests: [],
    send,
    externalRequests() {
      return this.requests.filter((u) => !u.startsWith(origin) && !/^(data|blob|about):/.test(u));
    },
  };

  const loadWaiters = [];
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    switch (msg.method) {
      case 'Page.loadEventFired': loadWaiters.splice(0).forEach((r) => r()); break;
      case 'Network.requestWillBeSent': page.requests.push(p.request.url); break;
      case 'Runtime.exceptionThrown':
        page.errors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
        break;
      case 'Runtime.consoleAPICalled':
        if (p.type === 'error' || p.type === 'assert') {
          page.errors.push('console.error: ' + p.args.map((a) => a.value ?? a.description).join(' '));
        }
        break;
      case 'Log.entryAdded':
        if (p.entry.level === 'error') page.errors.push(`log: ${p.entry.text} ${p.entry.url || ''}`.trim());
        break;
      default:
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Emulation.setUserAgentOverride', { userAgent: opts.userAgent || IPAD_SAFARI_16_UA, platform: 'iPad' });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  page.setViewport = async (vp) => {
    const { width, height } = resolveViewport(vp);
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile: true,
      screenOrientation: { type: 'landscapePrimary', angle: 90 },
    });
  };
  await page.setViewport(opts.viewport || 'ipad-air');

  page.eval = async (fnOrExpr, ...args) => {
    const r = await send('Runtime.evaluate', {
      expression: toSource(fnOrExpr, args), awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('page.eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  page.waitFor = async (fnOrExpr, { timeout = 5000, interval = 25 } = {}) => {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try { last = await page.eval(fnOrExpr); } catch (e) { last = e.message; }
      if (last) return last;
      await sleep(interval);
    }
    throw new Error(`waitFor timed out after ${timeout}ms: ${toSource(fnOrExpr, [])} (last: ${JSON.stringify(last)})`);
  };

  page.goto = async (p, { waitForBoot = true } = {}) => {
    const loaded = new Promise((r) => loadWaiters.push(r));
    const res = await send('Page.navigate', { url: new URL(p, server.url).href });
    if (res.errorText) throw new Error(`navigate ${p}: ${res.errorText}`);
    await loaded;
    if (waitForBoot) {
      await page.waitFor(() => document.body && document.body.dataset.boot, { timeout: 10000 });
      const state = await page.eval(() => document.body.dataset.boot);
      if (state !== 'ready') throw new Error(`boot state "${state}"; errors: ${page.errors.join(' | ')}`);
    }
  };

  page.box = (selector) => page.eval((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, selector);

  // ---- touch input ----
  const point = (x, y) => ({ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 });
  page.touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points });
  page.tap = async (x, y, { holdMs = 60 } = {}) => {
    await page.touch('touchStart', [point(x, y)]);
    await sleep(holdMs);
    await page.touch('touchEnd', []);
  };
  page.longPress = (x, y, { holdMs = 600 } = {}) => page.tap(x, y, { holdMs });
  page.tapElement = async (selector, opts2) => {
    const b = await page.box(selector);
    if (!b) throw new Error(`tapElement: no element ${selector}`);
    await page.tap(b.cx, b.cy, opts2);
  };
  page.drag = async (from, to, { steps = 12, durationMs = 240, holdMs = 0 } = {}) => {
    await page.touch('touchStart', [point(from.x, from.y)]);
    if (holdMs) await sleep(holdMs);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.touch('touchMove', [point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)]);
      await sleep(durationMs / steps);
    }
    await page.touch('touchEnd', []);
  };

  page.screenshot = async (name) => {
    mkdirSync(RESULTS_DIR, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(RESULTS_DIR, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };

  page.close = async () => {
    try { chrome.ws.close(); } catch { /* already closed */ }
    chrome.proc.kill();
    server.proc.kill();
    await sleep(100);
    rmSync(chrome.profile, { recursive: true, force: true });
  };

  if (opts.path !== null) {
    try {
      await page.goto(opts.path || 'index.html', { waitForBoot: opts.waitForBoot !== false });
    } catch (err) {
      await page.close();
      throw err;
    }
  }
  return page;
}

function resolveViewport(vp) {
  if (typeof vp === 'object') return vp;
  if (!VIEWPORTS[vp]) throw new Error(`unknown viewport ${vp}; known: ${Object.keys(VIEWPORTS).join(', ')}`);
  return VIEWPORTS[vp];
}
