// Entry point. Plain ES module, Safari 16 floor (see CLAUDE.md).

import { createStage } from './engine/stage.js';
import { mountBoot } from './scenes/boot.js';
import { registerServiceWorker } from './pwa.js';

// Belt and braces against browser gestures on top of the CSS (touch-action,
// user-select, touch-callout): Safari's pinch "gesture" events, double-tap
// zoom and the long-press context menu.
function blockBrowserGestures() {
  const stop = (e) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
    document.addEventListener(type, stop, { passive: false });
  }
}

function boot() {
  blockBrowserGestures();
  const stage = createStage(document.getElementById('app'));
  mountBoot(stage);
  document.body.dataset.boot = 'ready';     // the test harness waits for this
  registerServiceWorker();
}

try {
  boot();
} catch (err) {
  document.body.dataset.boot = 'error';
  throw err;
}
