// Two-iPad play wired into the app (stretch, bead oxg.2). Loaded by main.js
// only with the hidden ?together URL flag, until the parent menu (P1.16)
// offers it.
//
// The shared demo is the boot buddy: its squish count is a store entity, so
// both iPads show the same count and a tap on either one counts (and makes
// the buddy squish on the other iPad too).
//
// Feedback hooks for real scenes: any element with data-entity="<id>" gets
// the class "tg-held-other" while the other kid holds that entity (a grab
// lease, see session.js), and a "tg-busy" wobble when an op on it is refused.

import { createSession } from './session.js';
import { createPairingUI } from './pairing.js';
import { touchedIds } from '../engine/ops.js';

function loadCss(doc, href) {
  if (doc.querySelector('link[href="' + href + '"]')) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  doc.head.appendChild(l);
}

function liveBuddy(state) {
  for (const id of Object.keys(state.entities)) {
    const e = state.entities[id];
    if (e.kind === 'buddy' && !e.deleted && e.room === 'boot') return e;
  }
  return null;
}

const byEntity = (doc, id) => doc.querySelectorAll('[data-entity="' + String(id).replace(/["\\]/g, '') + '"]');

/**
 * opts: store, persist (from openWorld), scene (mountBoot result).
 * Returns { session, ui } (main.js exposes it as window.__together).
 */
export function startTogether({ store, persist, scene, doc = document }) {
  loadCss(doc, 'src/net/together.css');
  const session = createSession({ store, persist });
  const ui = createPairingUI({ session, doc });

  // --- the buddy follows the shared world
  function showBuddy() {
    const b = liveBuddy(store.state);
    if (!b || !scene) return;
    scene.el.dataset.entity = b.id;
    // A guest's own taps are in flight to the host: keep showing the count
    // it already shows, or the number would flicker back while it travels.
    const mine = session.inflight().filter((env) => env.op === 'set' && env.args.id === b.id && env.args.path === 'props.squishes');
    const n = mine.length ? mine[mine.length - 1].args.value : (b.props.squishes || 0);
    if (scene.setCount) scene.setCount(n); else scene.el.dataset.squishes = String(n);
  }
  store.subscribe((state, env) => {
    showBuddy();
    if (env && env.device !== store.device && env.op === 'set' && env.args.path === 'props.squishes' &&
        scene && scene.react && scene.el.dataset.entity === env.args.id) {
      scene.react();   // the other kid squished it
    }
  });
  showBuddy();

  // --- "the other kid has it" hooks
  session.on('held', (id, by) => {
    const other = !!by && by !== store.device;
    for (const e of byEntity(doc, id)) e.classList.toggle('tg-held-other', other);
  });
  session.on('refused', (r) => {
    if (!r.env) return;
    for (const id of touchedIds(r.env)) {
      for (const e of byEntity(doc, id)) {
        e.classList.remove('tg-busy');
        void e.offsetWidth;   // restart the wobble
        e.classList.add('tg-busy');
      }
    }
    showBuddy();
  });
  session.on('status', () => showBuddy());

  return { session, ui };
}
