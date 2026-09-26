// PWA glue: service worker registration, installed version, "Update now" and
// persistent storage. Mirrors /Users/chris/workspace/games (kids-arcade), with
// the P1.2 update ruling (see the header of sw.js):
//
//   - a new version installs in the background and waits; it never takes over
//     mid-play;
//   - it takes over on a cold launch: if a worker is already waiting when the
//     page boots (installed during an earlier session), we activate it and
//     reload straight away, before anyone has touched anything;
//   - or when a parent taps "Update now" (updateNow()).
//
// The parent menu (P1.16) shows installedVersion() and wires a button to
// updateNow(). No DOM access at module top level (unit tests import this).

export const SW_ENABLED = true;
export const CACHE_PREFIX = 'ourtown-';

const hasSW = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

let reloading = false;
function reloadOnce() {
  if (reloading) return;
  reloading = true;
  location.reload();
}

/** Ask a waiting worker to take over, then reload once it controls the page.
 *  Resolves true if a reload is under way. */
function activateWaiting(reg) {
  if (!reg || !reg.waiting) return Promise.resolve(false);
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
  reg.waiting.postMessage({ type: 'skipWaiting' });
  return Promise.resolve(true);
}

/** Register sw.js. Call once at boot, after the first scene is up. Resolves
 *  the registration, or null where there is no service worker (e.g. the LAN
 *  dev address, which is not a secure context). */
export function registerServiceWorker() {
  requestPersistentStorage();
  if (!SW_ENABLED || !hasSW()) return Promise.resolve(null);
  return navigator.serviceWorker.register('sw.js').then((reg) => {
    // Cold launch: a version that finished installing last session is waiting.
    // Nobody has played yet, so this is the moment to switch.
    if (reg.waiting && navigator.serviceWorker.controller) activateWaiting(reg);
    return reg;
  }).catch(() => null);
}

/** Ask the browser not to evict our storage (the saved world, recordings).
 *  Feature-detected: resolves true/false, or null where unsupported. */
export function requestPersistentStorage() {
  const s = typeof navigator !== 'undefined' && navigator.storage;
  if (!s || typeof s.persist !== 'function') return Promise.resolve(null);
  const already = typeof s.persisted === 'function' ? s.persisted() : Promise.resolve(false);
  return already.then((yes) => (yes ? true : s.persist())).catch(() => null);
}

/** Ask a worker for its VERSION over a MessageChannel. */
function askVersion(worker) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(''), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve((e.data && e.data.version) || ''); };
    worker.postMessage({ type: 'version' }, [ch.port2]);
  });
}

/** Version of the worker running this page, e.g. "3f9a2c01d4", or ''. Falls
 *  back to the newest "ourtown-*" cache before a worker controls the page. */
export function installedVersion() {
  if (hasSW() && navigator.serviceWorker.controller) {
    return askVersion(navigator.serviceWorker.controller);
  }
  if (typeof caches === 'undefined') return Promise.resolve('');
  return caches.keys().then((keys) => {
    const v = keys.filter((k) => k.indexOf(CACHE_PREFIX) === 0).sort().pop();
    return v ? v.slice(CACHE_PREFIX.length) : '';
  }).catch(() => '');
}

/** Version installed and waiting for the next launch, or '' if none. */
export function waitingVersion() {
  if (!hasSW()) return Promise.resolve('');
  return navigator.serviceWorker.getRegistration().then((reg) => (
    reg && reg.waiting ? askVersion(reg.waiting) : ''
  )).catch(() => '');
}

/** "Update now": take a waiting version, or check the server for a new one,
 *  and reload once it takes over. Resolves 'reloading' or 'up-to-date'. */
export function updateNow() {
  if (!hasSW()) { reloadOnce(); return Promise.resolve('reloading'); }
  return navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) { reloadOnce(); return 'reloading'; }
    if (reg.waiting) return activateWaiting(reg).then(() => 'reloading');
    return reg.update().then(() => {
      const nw = reg.installing || reg.waiting;
      if (!nw) return 'up-to-date';
      return new Promise((resolve) => {
        const check = () => {
          if (nw.state === 'installed') { activateWaiting(reg); resolve('reloading'); }
          else if (nw.state === 'redundant') resolve('up-to-date');
        };
        nw.addEventListener('statechange', check);
        check();
      });
    });
  }).catch(() => { reloadOnce(); return 'reloading'; });
}
