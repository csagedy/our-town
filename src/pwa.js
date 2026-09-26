// PWA glue: service worker registration, installed version and "Update now".
// Mirrors /Users/chris/workspace/games (kids-arcade): the installed version is
// the name of the cache the worker filled, and "Update now" asks the worker to
// check for a new version, then reloads once the new one takes over.
//
// HOOK FOR P1.2: sw.js does not exist yet, so SW_ENABLED is false and
// registerServiceWorker() is a no-op. P1.2 adds sw.js (cache named
// CACHE_PREFIX + version) and flips SW_ENABLED. The parent menu (P1.16) shows
// installedVersion() and wires a button to updateNow().

export const SW_ENABLED = false;
export const CACHE_PREFIX = 'ourtown-';

export function registerServiceWorker() {
  if (!SW_ENABLED || !('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('sw.js').catch(() => null);
}

/** Version string of the newest filled cache, e.g. "v12" or "3f9a2c", or ''. */
export function installedVersion() {
  if (!('caches' in window)) return Promise.resolve('');
  return caches.keys().then((keys) => {
    const v = keys.filter((k) => k.indexOf(CACHE_PREFIX) === 0).sort().pop();
    return v ? v.slice(CACHE_PREFIX.length) : '';
  }).catch(() => '');
}

/** Check for a new worker and reload once it takes control.
 *  Resolves 'reloading' or 'up-to-date'. */
export function updateNow() {
  if (!('serviceWorker' in navigator)) { location.reload(); return Promise.resolve('reloading'); }
  return new Promise((resolve) => {
    let done = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!done) { done = true; resolve('reloading'); location.reload(); }
    });
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) { done = true; resolve('reloading'); location.reload(); return; }
      return reg.update().then(() => {
        setTimeout(() => { if (!done) { done = true; resolve('up-to-date'); } }, 4000);
      });
    }).catch(() => { done = true; resolve('reloading'); location.reload(); });
  });
}
