// Entry point. Plain ES module, Safari 16 floor (see CLAUDE.md).

import { createStage } from './engine/stage.js';
import { createInput } from './engine/input.js';
import { mountBoot } from './scenes/boot.js';
import { mountTestRoom, TEST_SETS } from './scenes/test-room.js';
import { mountTown } from './scenes/town.js';
import { registerServiceWorker } from './pwa.js';
import { initAudio } from './audio/index.js';
import { openWorld } from './core/persist.js';
import { getEntity } from './engine/world.js';

// Belt and braces against browser gestures on top of the CSS (touch-action,
// user-select, touch-callout): Safari's pinch "gesture" events, double-tap
// zoom and the long-press context menu.
function blockBrowserGestures() {
  const stop = (e) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
    document.addEventListener(type, stop, { passive: false });
  }
}

// P1.4 until real scenes exist: the placeholder buddy is an entity in the
// store, so its squish count is saved and survives reloads (e2e proof).
function buddyEntity(store) {
  const s = store.state;
  for (const id of Object.keys(s.entities)) {
    if (s.entities[id].kind === 'buddy' && getEntity(s, id)) return s.entities[id];
  }
  const id = store.newId();
  store.dispatch('spawn', { id, kind: 'buddy', room: 'boot', x: 720, y: 560, props: { squishes: 0 } });
  return store.state.entities[id];
}

async function boot() {
  blockBrowserGestures();
  initAudio();                              // unlocks WebAudio on the first tap
  const stage = createStage(document.getElementById('app'));
  const room = new URLSearchParams(location.search).get('room');   // dev routes, see below
  const input = createInput(stage);         // tap / drag / long-press and background panning
  const { store, persist } = await openWorld();   // saved world (never rejects)
  window.__store = store;
  window.__persist = persist;
  // Default: the town (the city map hub, P1.13). Hidden dev routes:
  // ?room=test (P1.7 views), ?room=catalog (P1.8 behaviors), ?room=containers
  // and ?room=porch (P1.9 containers, spawners, carrying), ?room=wide (P1.5
  // camera + P1.6 input demo), ?room=buddy (the retired boot buddy; its squish
  // count proves persistence).
  let scene;
  if (TEST_SETS.includes(room)) scene = await mountTestRoom(stage, { input, store, set: room });
  else if (room === 'buddy' || room === 'wide') {
    const buddyId = buddyEntity(store).id;
    scene = mountBoot(stage, {
      room, input,
      squishes: store.state.entities[buddyId].props.squishes || 0,
      // Looked up per tap: a two-iPad guest plays with the host's buddy. A
      // counter is an `inc` intent, never an absolute set (design.md 6.4).
      onSquish: () => store.dispatch('inc', { id: buddyEntity(store).id, path: 'props.squishes', by: 1 }),
    });
  } else {
    scene = await mountTown(stage, { input, store });
    window.__town = scene;
  }
  // Two-iPad play (stretch, oxg.2), hidden behind ?together until the parent menu (P1.16).
  if (new URLSearchParams(location.search).has('together')) {
    window.__together = (await import('./net/together.js')).startTogether({ store, persist, scene });
  }
  window.__stage = stage;                   // for e2e tests and debugging
  window.__input = input;
  window.__scene = scene;
  document.body.dataset.boot = 'ready';     // the test harness waits for this
  registerServiceWorker();
}

boot().catch((err) => {
  document.body.dataset.boot = 'error';
  throw err;
});
