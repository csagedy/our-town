// Parent menu (P1.16, docs/design.md 4 and 7): the only text-heavy surface,
// hidden behind a 2-second press so a 5-year-old can't open it by accident.
//
// HOW TO OPEN: press and hold the top-left corner for 2 seconds (the round
// map button in a location; on the city map, where that button is hidden,
// the same corner, marked with a small faint gear). After a short moment a
// ring appears there and fills; lift early and nothing happens. The press
// must stay still (a drag cancels it), and a second finger anywhere cancels
// it, so mashing and swiping never open it. A plain tap on the map button
// still goes to the map. Nothing about it blocks play: the listener only
// watches pointers (it never stops or prevents them).
//
// INSIDE (grown-up text is fine here):
//   Sound on/off + volume, Voice on/off, Words (Zoe's text layer) on/off
//   (device-local, src/ui/settings.js: localStorage, never a world op)
//   Play together (the two-iPad pairing flow; was only behind ?together)
//   This place: Tidy up (the scene's behaviors.tidy()), Start over (confirm)
//   World file: Save to a file (share sheet / download), Load from a file (confirm)
//   App version, and "Update now" when a new version is waiting (src/pwa.js)
//
//   const menu = installParentMenu({ store, persist, input, town, playTogether });
//   menu.open(); menu.close(); menu.isOpen
//
// DOM only inside installParentMenu (unit tests import the pure helpers).

import { loadSettings, saveSettings, applySettings } from './settings.js';
import { installedVersion, waitingVersion, updateNow } from '../pwa.js';
import { shareWorldFile, pickWorldFile } from '../core/persist.js';
import { inRoom, childrenOf } from '../engine/world.js';

export const HOLD_MS = 2000;          // the press that opens the menu
export const HOLD_SLOP = 24;          // px the finger may wander while holding
export const RING_DELAY_MS = 300;     // the ring shows only once it is clearly a hold, not a tap
export const CORNER_MIN = 120;        // px: the hot corner is at least this big...
export const CORNER_FRAC = 0.1;       // ...or this fraction of the screen width

/** Size of the top-left hot corner for a viewport width. Pure. */
export const cornerSize = (vw) => Math.max(CORNER_MIN, Math.round(vw * CORNER_FRAC));

/** Is (x, y) inside the hot corner whose origin is the safe-area inset? Pure. */
export function inHotCorner(x, y, vw, safe = { left: 0, top: 0 }) {
  const c = cornerSize(vw);
  return x >= 0 && y >= 0 && x <= safe.left + c && y <= safe.top + c;
}

/** Friendly name of a place for the menu. Pure. */
export function placeName(at) {
  if (!at || at === 'city') return 'the town map';
  if (at === 'cafe/kitchen') return 'the cafe kitchen';
  const [loc, room] = String(at).split('/');
  return room ? `the ${loc} ${room}` : `the ${loc}`;
}

/** Ops that put a room back to its first-visit state: hard removes, children first. Pure. */
export function resetOps(state, at) {
  if (!at || at === 'city') return state.map && state.map.night ? [['mapSet', { night: false }]] : [];
  const ops = [];
  const walk = (e) => {
    for (const k of childrenOf(state, e.id)) walk(k);
    ops.push(['remove', { id: e.id, hard: true }]);
  };
  for (const e of inRoom(state, at)) walk(e);
  return ops;
}

const GEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9 5.1v-2.6l-2.4-.5a7 7 0 0 0-.7-1.6l1.4-2-1.9-1.9-2 1.4a7 7 0 0 0-1.6-.7L13.3 3h-2.6l-.5 2.4a7 7 0 0 0-1.6.7l-2-1.4-1.9 1.9 1.4 2a7 7 0 0 0-.7 1.6L3 10.7v2.6l2.4.5c.2.6.4 1.1.7 1.6l-1.4 2 1.9 1.9 2-1.4c.5.3 1 .5 1.6.7l.5 2.4h2.6l.5-2.4c.6-.2 1.1-.4 1.6-.7l2 1.4 1.9-1.9-1.4-2c.3-.5.5-1 .7-1.6l2.4-.5Z"/></svg>';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Install the hot corner and the (closed) menu.
 * opts: store, persist, input (to cancel gestures when the menu opens),
 * town (mountTown result: at, scene; or any scene with .behaviors),
 * playTogether() -> Promise<{ui}> (starts the two-iPad session once),
 * audio: { setMuted, setVolume, setSpeechOn, sfx }, doc, storage, reload.
 */
export function installParentMenu(opts) {
  const { store, persist, input = null, town = null, playTogether = null, audio = {} } = opts;
  const doc = opts.doc || document;
  const win = doc.defaultView;
  const reload = opts.reload || (() => win.location.reload());
  const storage = opts.storage;
  let settings = applySettings(loadSettings(storage), { audio, store, doc });
  const stats = { holds: 0, opened: 0, cancelled: 0 };

  // ---- the hot corner ----
  const mark = doc.createElement('div');
  mark.className = 'pm-mark';
  mark.dataset.noPan = '';
  mark.innerHTML = GEAR;
  const ring = doc.createElement('div');
  ring.className = 'pm-ring';
  ring.dataset.noPan = '';
  ring.innerHTML = '<div class="pm-ring-fill"></div>';
  ring.hidden = true;
  doc.body.appendChild(mark);
  doc.body.appendChild(ring);

  let hold = null;   // { id, x0, y0, timer, ringTimer, anim }
  const safe = () => {
    const cs = win.getComputedStyle(doc.documentElement);
    return { left: parseFloat(cs.getPropertyValue('--safe-left')) || 0, top: parseFloat(cs.getPropertyValue('--safe-top')) || 0 };
  };

  function cancelHold(why) {
    if (!hold) return;
    clearTimeout(hold.timer);
    clearTimeout(hold.ringTimer);
    if (hold.anim) hold.anim.cancel();
    hold = null;
    ring.hidden = true;
    if (why) stats.cancelled++;
  }
  function showRing() {
    // Centered on the map button's spot (the corner's visible anchor).
    const b = mark.getBoundingClientRect();
    ring.style.transform = `translate3d(${Math.round(b.left + b.width / 2)}px, ${Math.round(b.top + b.height / 2)}px, 0)`;
    ring.hidden = false;
    const fill = ring.firstChild;
    if (fill.animate) {
      hold.anim = fill.animate([{ transform: 'scale(0.05)' }, { transform: 'scale(1)' }],
        { duration: HOLD_MS - RING_DELAY_MS, easing: 'linear', fill: 'forwards' });
    }
  }
  function onDown(e) {
    if (menuOpen) return;
    if (hold) { cancelHold('second finger'); return; }   // any other finger cancels
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!inHotCorner(e.clientX, e.clientY, win.innerWidth, safe())) return;
    stats.holds++;
    hold = { id: e.pointerId, x0: e.clientX, y0: e.clientY, anim: null };
    hold.ringTimer = setTimeout(() => { if (hold) showRing(); }, RING_DELAY_MS);
    hold.timer = setTimeout(() => { cancelHold(); open(); }, HOLD_MS);
  }
  function onMove(e) {
    if (!hold || e.pointerId !== hold.id) return;
    const dx = e.clientX - hold.x0, dy = e.clientY - hold.y0;
    if (dx * dx + dy * dy > HOLD_SLOP * HOLD_SLOP) cancelHold('moved');
  }
  function onUp(e) { if (hold && e.pointerId === hold.id) cancelHold('lifted'); }
  const onHidden = () => { if (doc.visibilityState === 'hidden') cancelHold('hidden'); };
  const cap = { capture: true, passive: true };
  doc.addEventListener('pointerdown', onDown, cap);
  doc.addEventListener('pointermove', onMove, cap);
  doc.addEventListener('pointerup', onUp, cap);
  doc.addEventListener('pointercancel', onUp, cap);
  doc.addEventListener('visibilitychange', onHidden);

  // ---- the menu ----
  const root = doc.createElement('div');
  root.className = 'pm-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="pm-card" role="dialog" aria-label="Grown-ups menu">
      <div class="pm-head"><h2>Grown-ups</h2><button class="pm-close" data-pm="close" aria-label="Close">&times;</button></div>
      <div class="pm-row"><div class="pm-what"><b>Sound</b><small>No sound on the iPad? Check the silent switch and ringer.</small></div>
        <button class="pm-switch" role="switch" data-pm="sound"></button></div>
      <div class="pm-row"><div class="pm-what"><b>Volume</b></div>
        <input class="pm-volume" data-pm="volume" type="range" min="0" max="100" step="5"></div>
      <div class="pm-row"><div class="pm-what"><b>Voice</b><small>Characters talk, and words are read aloud.</small></div>
        <button class="pm-switch" role="switch" data-pm="voice"></button></div>
      <div class="pm-row"><div class="pm-what"><b>Words</b><small>Names under things, for readers. Tap a name to hear it.</small></div>
        <button class="pm-switch" role="switch" data-pm="textLayer"></button></div>
      <div class="pm-row"><div class="pm-what"><b>Play together</b><small>Two iPads side by side, no internet needed.</small></div>
        <button class="pm-btn" data-pm="together">Start</button></div>
      <div class="pm-row"><div class="pm-what"><b>This place</b><small class="pm-place"></small></div>
        <div class="pm-btns"><button class="pm-btn" data-pm="tidy">Tidy up</button><button class="pm-btn" data-pm="reset">Start over&hellip;</button></div></div>
      <div class="pm-row"><div class="pm-what"><b>World file</b><small>Back up the whole town, or move it to another iPad.</small></div>
        <div class="pm-btns"><button class="pm-btn" data-pm="save" disabled>Save to a file</button><button class="pm-btn" data-pm="load">Load a file&hellip;</button></div></div>
      <div class="pm-confirm" hidden><p></p><div class="pm-btns"><button class="pm-btn" data-pm="no">Cancel</button><button class="pm-btn pm-danger" data-pm="yes"></button></div></div>
      <p class="pm-status" aria-live="polite"></p>
      <div class="pm-foot"><span class="pm-version"></span><button class="pm-btn pm-update" data-pm="update" hidden>Update now</button></div>
    </div>`;
  doc.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  const btn = (name) => q(`[data-pm="${name}"]`);
  const status = (text) => { q('.pm-status').textContent = text || ''; };

  let menuOpen = false;
  let worldFile = null;
  let confirmYes = null;

  function syncSwitches() {
    for (const k of ['sound', 'voice', 'textLayer']) btn(k).setAttribute('aria-checked', String(!!settings[k]));
    btn('volume').value = String(Math.round(settings.volume * 100));
    btn('volume').disabled = !settings.sound;
  }
  function change(patch) {
    settings = applySettings(Object.assign({}, settings, patch), { audio, store, doc });
    saveSettings(settings, storage);
    syncSwitches();
  }
  const scene = () => (town && town.scene) || town;
  const place = () => (town && town.at) || (scene() && scene().id) || 'city';

  function askConfirm(text, yesLabel, fn) {
    const c = q('.pm-confirm');
    c.querySelector('p').textContent = text;
    btn('yes').textContent = yesLabel;
    confirmYes = fn;
    c.hidden = false;
  }
  function closeConfirm() { confirmYes = null; q('.pm-confirm').hidden = true; }

  function refreshVersion() {
    installedVersion().then((v) => { q('.pm-version').textContent = 'Version ' + (v || 'dev'); });
    waitingVersion().then((w) => {
      const u = btn('update');
      u.hidden = !w;
      u.textContent = w ? `Update now (${w})` : 'Update now';
    });
  }
  function prepareFile() {
    worldFile = null;
    btn('save').disabled = true;
    if (!persist || !persist.exportWorld) return;
    // Built ahead of time: Safari needs share() to start inside the tap.
    persist.exportWorld().then((f) => { if (menuOpen) { worldFile = f; btn('save').disabled = false; } },
      () => status('Could not build the world file.'));
  }

  function open() {
    if (menuOpen) return;
    menuOpen = true;
    stats.opened++;
    if (input) input.cancelAll();
    syncSwitches();
    closeConfirm();
    status('');
    q('.pm-place').textContent = 'Now: ' + placeName(place()) + '.';
    const sc = scene();
    btn('tidy').disabled = !(sc && sc.behaviors && sc.behaviors.tidy);
    refreshVersion();
    prepareFile();
    root.hidden = false;
    doc.body.classList.add('pm-open');
  }
  function close() {
    if (!menuOpen) return;
    menuOpen = false;
    worldFile = null;
    closeConfirm();
    root.hidden = true;
    doc.body.classList.remove('pm-open');
  }

  const click = {
    close,
    sound: () => change({ sound: !settings.sound }),
    voice: () => change({ voice: !settings.voice }),
    textLayer: () => change({ textLayer: !settings.textLayer }),
    together() {
      if (!playTogether) { status('Play together is not available here.'); return; }
      close();
      Promise.resolve(playTogether()).then((t) => { if (t && t.ui) t.ui.open(); });
    },
    tidy() {
      const sc = scene();
      const moved = sc && sc.behaviors ? sc.behaviors.tidy() : [];
      status(moved.length ? `Tidied: ${moved.length} thing${moved.length === 1 ? '' : 's'} went home.` : 'Already tidy.');
    },
    reset() {
      const at = place();
      askConfirm(`Put ${placeName(at)} back the way it started? Everything in it now goes away.`, 'Start over', async () => {
        for (const [op, args] of resetOps(store.state, at)) store.dispatch(op, args);
        status('Starting over...');
        if (persist && persist.flush) await persist.flush();
        reload();
      });
    },
    save() {
      if (!worldFile) return;
      shareWorldFile(worldFile, { doc }).then((how) => {
        status(how === 'cancelled' ? '' : how === 'shared' ? 'World file shared.' : `Saved ${worldFile ? worldFile.name : 'the world file'}.`);
      });
    },
    load() {
      pickWorldFile({ doc }).then((file) => {
        if (!file) return;
        askConfirm(`Replace the whole town on this iPad with "${file.name}"?`, 'Replace', async () => {
          try {
            await persist.importWorld(file);
          } catch (e) {
            status(e && e.code === 'not-a-world' ? 'That file is not an Our Town world.' : `Could not load it (${esc((e && (e.code || e.message)) || 'error')}).`);
            return;
          }
          status('Loaded. Restarting...');
          if (persist.flush) await persist.flush();
          reload();
        });
      });
    },
    yes() { const fn = confirmYes; closeConfirm(); if (fn) fn(); },
    no: closeConfirm,
    update() { status('Updating...'); updateNow(); },
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-pm]');
    if (!b || b.disabled || !click[b.dataset.pm] || b.dataset.pm === 'volume') return;
    if (audio.sfx && b.dataset.pm !== 'close') audio.sfx.play('tap', { gain: 0.5 });
    click[b.dataset.pm]();
  });
  btn('volume').addEventListener('input', () => change({ volume: Number(btn('volume').value) / 100 }));
  btn('volume').addEventListener('change', () => { if (audio.sfx) audio.sfx.play('pop'); });
  // A tap on the dimmed backdrop (outside the card) closes it; only one that
  // started there (the finger that held the corner lifts over the backdrop).
  let downOnBackdrop = false;
  root.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === root; });
  root.addEventListener('click', (e) => { if (e.target === root && downOnBackdrop) close(); downOnBackdrop = false; });

  return {
    el: root, mark, ring, stats,
    open, close,
    get isOpen() { return menuOpen; },
    get holding() { return !!hold; },
    get settings() { return Object.assign({}, settings); },
    destroy() {
      cancelHold();
      doc.removeEventListener('pointerdown', onDown, cap);
      doc.removeEventListener('pointermove', onMove, cap);
      doc.removeEventListener('pointerup', onUp, cap);
      doc.removeEventListener('pointercancel', onUp, cap);
      doc.removeEventListener('visibilitychange', onHidden);
      root.remove(); mark.remove(); ring.remove();
    },
  };
}
