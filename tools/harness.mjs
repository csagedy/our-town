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
//   page.waitFor(fnOrExpr, {timeout}) poll until truthy (default 15s, scaled by E2E_TIMEOUT_SCALE)
//   page.frames(n)                    wait for n animation frames to be painted (default 2)
//   page.waitForAnimations(selector)  wait until the element's Web Animations have finished
//   page.box(selector)                {x, y, w, h, cx, cy} in CSS px, or null
//   page.tap(x, y, {holdMs})          one-finger tap
//   page.tapElement(selector)         tap the element's center
//   page.longPress(x, y, {holdMs})    press and hold (default 600ms)
//   page.drag(from, to, {steps, durationMs, holdMs})   one-finger drag, from/to = {x, y}
//   page.touch(type, points)          raw CDP touch: 'touchStart'|'touchMove'|'touchEnd'|'touchCancel'
//   page.gesture()                    -> g(type, points, atMs): raw touches with gesture-relative timestamps
//   page.screenshot(name)             PNG into test-results/<name>.png, returns the path
//   page.errors                       uncaught exceptions, console.error, failed loads (strings)
//   page.requests                     every request URL the page made
//   page.externalRequests()           requests not to the local server (must stay empty)
//   page.setViewport(name|{width,height})
//   page.send(method, params)         raw CDP escape hatch
//   page.onEvent(fn)                  raw CDP events of this page: fn(method, params) (e.g. Tracing.dataCollected)
//   page.stopServer()                 kill the web server (offline tests)
//   page.close()                      kill Chrome and the server
//
// openPage({ root }) serves another directory instead of the repo (the service
// worker update test serves a temp copy it can change between versions).
//
// Environment: CHROME=/path/to/chrome overrides the browser; HEADFUL=1 shows
// the window (handy when debugging a test); E2E_TIMEOUT_SCALE=3 multiplies
// every harness timeout (for a very slow or overloaded machine).
//
// Robustness under load (several test files and other agents' Chrome
// instances at once), see bead dollhouse-game-mhf.17:
// - every instance gets its own server port (port 0) and temp profile;
// - touch events carry synthetic, evenly spaced CDP timestamps, so the page's
//   e.timeStamp (tap duration, drag velocity) doesn't depend on how quickly
//   this process gets scheduled: a 60ms tap is 60ms even if the CPU is busy;
// - waits poll a condition with generous, bounded timeouts, never a fixed sleep;
// - close() waits for Chrome to exit before removing its profile, retries the
//   removal and never throws over a leftover temp dir.

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

// Generous but bounded timeouts; E2E_TIMEOUT_SCALE stretches them all.
const SCALE = Math.max(1, Number(process.env.E2E_TIMEOUT_SCALE) || 1);
export const timeoutMs = (ms) => Math.round(ms * SCALE);
const T = {
  server: timeoutMs(20000),   // serve.py prints its port
  chrome: timeoutMs(30000),   // Chrome prints its DevTools URL
  cdp: timeoutMs(30000),      // one CDP command reply
  boot: timeoutMs(30000),     // page load + body[data-boot]
  waitFor: timeoutMs(15000),  // default page.waitFor
  exit: 5000,                 // Chrome/server exit after SIGTERM, then SIGKILL
};

/** Remove a temp dir; Chrome's helpers can still be flushing into it, so retry, and never throw. */
export function removeDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    process.stderr.write(`harness: could not remove ${dir} (${err.code}); leaving it\n`);
  }
}

/** Drop our ends of a child's pipes. Chrome's helper processes inherit its
 *  stderr, so one that outlives the browser would otherwise keep this test
 *  process alive (we saw a file take minutes to exit under load). */
function closePipes(proc) {
  for (const s of [proc.stdout, proc.stderr]) { try { s?.destroy(); } catch { /* closed */ } }
}

/** Kill a child process and wait until it has exited (SIGKILL after T.exit). */
function stopProcess(proc) {
  if (!proc) return Promise.resolve();
  if (proc.exitCode !== null || proc.signalCode !== null) { closePipes(proc); return Promise.resolve(); }
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); closePipes(proc); resolve(); };
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, T.exit);
    proc.once('exit', done);
    try { proc.kill('SIGTERM'); } catch { done(); }
  });
}

// Last-resort cleanup if the test process exits without close() (a crashed or
// cancelled test): kill our Chromes and servers and drop their profiles.
// Before this, a test process that died or was cancelled left its headless
// Chrome running with no parent: dozens of orphans piled up and loaded the
// machine, which made every other test run flakier.
const live = new Set();
const killLive = () => {
  for (const { procs, dir } of live) {
    for (const p of procs) { try { p.kill('SIGKILL'); } catch { /* gone */ } }
    if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  }
  live.clear();
};
process.on('exit', killLive);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(sig, () => { killLive(); process.kill(process.pid, sig); });
}

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

/** Start tools/serve.py on a free port, serving `root` (default the repo).
 *  Returns { url, proc }. */
export async function startServer(root = ROOT) {
  const proc = spawn('python3', [path.join(ROOT, 'tools', 'serve.py'), '--port', '0', '--quiet', '--root', root],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { procs: [proc] };
  live.add(entry);
  proc.once('exit', () => live.delete(entry));
  try {
    const m = await readLine(proc.stdout, /Serving on (http:\/\/127\.0\.0\.1:\d+\/)/, T.server, 'serve.py');
    return { url: m[1], proc };
  } catch (err) {
    await stopProcess(proc);
    throw err;
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
    this.closed = false;
    // If Chrome dies, fail every outstanding command at once instead of each timing out.
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const [id, { reject, method, timer }] of this.pending) {
        clearTimeout(timer);
        reject(new Error(`${method}: Chrome connection closed`));
        this.pending.delete(id);
      }
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method, timer } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(timer);
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
      if (this.closed) { reject(new Error(`${method}: Chrome connection closed`)); return; }
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method}: no reply in ${T.cdp}ms`));
      }, T.cdp);
      this.pending.set(id, { resolve, reject, method, timer });
      this.ws.send(JSON.stringify(msg));
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
    // Never throttle our page for being "in the background": under load a
    // throttled rAF or timer looks exactly like a flaky test.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--disable-ipc-flooding-protection',
    'about:blank',
  ].filter(Boolean);
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const entry = { procs: [proc], dir: profile };
  live.add(entry);
  const cleanup = async () => {
    await stopProcess(proc);
    live.delete(entry);
    removeDir(profile);
  };
  try {
    const m = await readLine(proc.stderr, /DevTools listening on (ws:\/\/\S+)/, T.chrome, 'chrome');
    const ws = new WebSocket(m[1]);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('could not connect to Chrome DevTools')), { once: true });
    });
    return { proc, profile, cdp: new Cdp(ws), ws, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
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
 * opts.root: directory to serve instead of the repo (e.g. a temp copy).
 */
export async function openPage(opts = {}) {
  const server = await startServer(opts.root);
  let chrome;
  try {
    chrome = await launchChrome(resolveViewport(opts.viewport || 'ipad-air'));
  } catch (err) {
    await stopProcess(server.proc);
    throw err;
  }
  const { cdp } = chrome;

  let closed = null;
  const close = () => {
    closed = closed || (async () => {
      try { chrome.ws.close(); } catch { /* already closed */ }
      await Promise.all([chrome.cleanup(), stopProcess(server.proc)]);
    })();
    return closed;
  };

  let targetId; let sessionId;
  try {
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  } catch (err) {
    await close();
    throw err;
  }
  const send = (method, params) => cdp.send(method, params, sessionId);

  const origin = new URL(server.url).origin;
  const page = {
    baseUrl: server.url,
    errors: [],
    requests: [],
    send,
    onEvent(fn) { cdp.on((msg) => { if (msg.sessionId === sessionId && msg.method) fn(msg.method, msg.params); }); },
    externalRequests() {
      return this.requests.filter((u) => !u.startsWith(origin) && !/^(data|blob|about):/.test(u));
    },
  };

  const loadWaiters = [];
  const inFlight = new Map();   // requestId -> url, for timeout diagnostics
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    switch (msg.method) {
      case 'Page.loadEventFired': loadWaiters.splice(0).forEach((r) => r()); break;
      case 'Network.requestWillBeSent':
        page.requests.push(p.request.url);
        inFlight.set(p.requestId, p.request.url);
        break;
      case 'Network.loadingFinished': case 'Network.loadingFailed': inFlight.delete(p.requestId); break;
      case 'Inspector.targetCrashed': page.errors.push('renderer crashed'); break;
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

  /** What the page was doing, for timeout messages. */
  const diagnose = async () => {
    let state = '?';
    try {
      state = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState + " boot=" + (document.body && document.body.dataset.boot)',
        returnByValue: true,
      }, sessionId).then((r) => r.result.value);
    } catch (e) { state = e.message; }
    return `page state: ${state}; errors: [${page.errors.join(' | ')}]; `
      + `requests in flight: [${[...inFlight.values()].join(', ')}]`;
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Log.enable');
    await send('Inspector.enable');
    await send('Emulation.setUserAgentOverride', { userAgent: opts.userAgent || IPAD_SAFARI_16_UA, platform: 'iPad' });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    // Keep the page "focused" so nothing treats it as a background tab.
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch (err) {
    await close();
    throw err;
  }

  page.setViewport = async (vp) => {
    const { width, height } = resolveViewport(vp);
    await send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile: true,
      screenOrientation: { type: 'landscapePrimary', angle: 90 },
    });
  };
  try {
    await page.setViewport(opts.viewport || 'ipad-air');
  } catch (err) {
    await close();
    throw err;
  }

  page.eval = async (fnOrExpr, ...args) => {
    const r = await send('Runtime.evaluate', {
      expression: toSource(fnOrExpr, args), awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error('page.eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  // Poll a condition. The timeout is wall-clock, but a poll that was already
  // running when time ran out still counts, and there is always a final check
  // after the deadline, so a stalled machine can't fail a condition that is true.
  page.waitFor = async (fnOrExpr, { timeout = T.waitFor, interval = 25 } = {}) => {
    const end = Date.now() + timeout;
    let last;
    for (;;) {
      const expired = Date.now() >= end;
      try { last = await page.eval(fnOrExpr); } catch (e) { last = e.message; if (cdp.closed) throw e; }
      if (last) return last;
      if (expired) break;
      await sleep(interval);
    }
    throw new Error(`waitFor timed out after ${timeout}ms: ${toSource(fnOrExpr, [])} (last: ${JSON.stringify(last)}); ${await diagnose()}`);
  };

  /** Wait until n more frames have been produced (layout, style and animations applied). */
  page.frames = (n = 2) => page.eval((k) => new Promise((resolve) => {
    const step = () => (k-- <= 0 ? resolve(true) : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);

  /** Wait until every Web Animation on the element (and its subtree) has finished. */
  page.waitForAnimations = (selector, { timeout } = {}) => page.waitFor(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return !!el && el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running' && a.playState !== 'pending');
  })()`, { timeout });

  page.goto = async (p, { waitForBoot = true, timeout = T.boot } = {}) => {
    const url = new URL(p, server.url).href;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(async () => reject(new Error(`goto ${p}: no load event in ${timeout}ms; ${await diagnose()}`)), timeout);
    });
    try {
      const loaded = new Promise((r) => loadWaiters.push(r));
      const res = await Promise.race([send('Page.navigate', { url }), deadline]);
      if (res.errorText) throw new Error(`navigate ${p}: ${res.errorText}`);
      await Promise.race([loaded, deadline]);
    } finally {
      clearTimeout(timer);
    }
    if (waitForBoot) {
      await page.waitFor(() => document.body && document.body.dataset.boot, { timeout });
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
  // Each event carries an explicit timestamp (seconds since the epoch), which
  // Chrome passes on as the pointer events' timeStamp. Within a gesture the
  // timestamps are exactly as far apart as the gesture says (a 60ms tap, a
  // 16ms move cadence), however late this process gets to send them, so tap
  // and fling detection in the page see the same input on a loaded machine.
  // The clock starts from real time for each gesture and never runs backwards.
  const point = (x, y) => ({ x, y, id: 0, radiusX: 11, radiusY: 11, force: 1 });
  let lastTouchTs = 0;
  const gestureClock = () => {
    const t0 = Math.max(Date.now() / 1000, lastTouchTs + 0.001);
    return (offsetMs) => { lastTouchTs = t0 + offsetMs / 1000; return lastTouchTs; };
  };
  page.touch = (type, points, timestamp) => send('Input.dispatchTouchEvent', {
    type, touchPoints: points, timestamp: timestamp ?? gestureClock()(0),
  });
  // A raw gesture on its own clock: g(type, points, atMs) stamps each event
  // atMs after the gesture began, so a scripted path keeps its timing (a tap
  // stays under the tap limit) even when this process is scheduled late.
  page.gesture = () => {
    const at = gestureClock();
    return (type, points, atMs) => page.touch(type, points, at(atMs));
  };
  page.tap = async (x, y, { holdMs = 60 } = {}) => {
    const at = gestureClock();
    await page.touch('touchStart', [point(x, y)], at(0));
    await sleep(holdMs);
    await page.touch('touchEnd', [], at(holdMs));
  };
  page.longPress = (x, y, { holdMs = 600 } = {}) => page.tap(x, y, { holdMs });
  page.tapElement = async (selector, opts2) => {
    const b = await page.box(selector);
    if (!b) throw new Error(`tapElement: no element ${selector}`);
    await page.tap(b.cx, b.cy, opts2);
  };
  // Moves every durationMs/steps; the release comes at most a frame (16ms)
  // after the last move, like a real flick.
  page.drag = async (from, to, { steps = 12, durationMs = 240, holdMs = 0 } = {}) => {
    const at = gestureClock();
    const dt = durationMs / steps;
    await page.touch('touchStart', [point(from.x, from.y)], at(0));
    if (holdMs) await sleep(holdMs);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await page.touch('touchMove', [point(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)],
        at(holdMs + dt * i));
      await sleep(dt);
    }
    await page.touch('touchEnd', [], at(holdMs + dt * steps + Math.min(dt, 16)));
  };

  page.screenshot = async (name) => {
    mkdirSync(RESULTS_DIR, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(RESULTS_DIR, `${name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  };

  // Kill the web server (the page keeps running): a real "no network" check
  // that doesn't depend on how CDP offline emulation reaches the worker.
  page.stopServer = () => { stopProcess(server.proc); };

  // Waits for Chrome and the server to exit, then removes the profile
  // (retrying; never throws over a leftover dir). Safe to call twice.
  page.close = close;

  if (opts.path !== null) {
    try {
      await page.goto(opts.path || 'index.html', { waitForBoot: opts.waitForBoot !== false });
    } catch (err) {
      await close();
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
