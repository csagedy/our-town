// Boot placeholder: a friendly buddy that squishes when tapped. It proves the
// touch -> stage -> animation path until the real scenes arrive, and is
// meant to be deleted once the city map (P1.13) exists.
//
// Touch goes through the shared input module (src/engine/input.js): the
// buddy is tap-only, so a drag on it neither moves it nor pans the room.

import { sfx } from '../audio/index.js';
import { mountBlobs } from './input-demo.js';

const BUDDY_SVG = `
<svg viewBox="0 0 360 380" aria-hidden="true">
  <ellipse cx="180" cy="356" rx="140" ry="16" fill="#2b2d42" opacity="0.18"/>
  <ellipse cx="180" cy="200" rx="170" ry="158" fill="#3ea0d6"/>
  <ellipse cx="174" cy="190" rx="160" ry="148" fill="#5bc0eb"/>
  <g class="face-neutral">
    <ellipse cx="124" cy="164" rx="34" ry="39" fill="#fff"/>
    <ellipse cx="236" cy="164" rx="34" ry="39" fill="#fff"/>
    <circle cx="129" cy="172" r="18" fill="#2b2d42"/>
    <circle cx="241" cy="172" r="18" fill="#2b2d42"/>
    <circle cx="135" cy="164" r="6" fill="#fff"/>
    <circle cx="247" cy="164" r="6" fill="#fff"/>
    <path d="M140 222 Q180 258 220 222" fill="none" stroke="#2b2d42" stroke-width="14" stroke-linecap="round"/>
  </g>
  <g class="face-happy">
    <path d="M98 172 Q124 136 150 172" fill="none" stroke="#2b2d42" stroke-width="13" stroke-linecap="round"/>
    <path d="M210 172 Q236 136 262 172" fill="none" stroke="#2b2d42" stroke-width="13" stroke-linecap="round"/>
    <path d="M132 214 Q180 290 228 214 Z" fill="#2b2d42"/>
    <ellipse cx="180" cy="252" rx="22" ry="12" fill="#ff7a96"/>
  </g>
  <ellipse cx="82" cy="218" rx="24" ry="14" fill="#ff7a96" opacity="0.75"/>
  <ellipse cx="278" cy="218" rx="24" ry="14" fill="#ff7a96" opacity="0.75"/>
</svg>`;

const SQUISH = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.18, 0.8)', offset: 0.25 },
  { transform: 'scale(0.9, 1.12)', offset: 0.55 },
  { transform: 'scale(1.04, 0.97)', offset: 0.8 },
  { transform: 'scale(1, 1)' },
];

// Temporary wide test room for the P1.5 camera: 2880 units of colored
// stripes (12 x 240) over a floor band, reachable with index.html?room=wide.
export const WIDE_TEST_ROOM = { width: 2880, backdrop: { top: '#9ad0f5', bottom: '#8d6e63', horizon: 760 } };
const STRIPE_W = 240;

function buildWideTestRoom(stage) {
  const { width } = WIDE_TEST_ROOM;
  const n = width / STRIPE_W;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'test-stripe';
    el.dataset.stripe = String(i);
    // First and last stripes carry the 100-unit art bleed past the room edges.
    const left = i * STRIPE_W - (i === 0 ? 100 : 0);
    const w = STRIPE_W + (i === 0 ? 100 : 0) + (i === n - 1 ? 100 : 0);
    el.style.transform = `translate(${left}px, 0)`;
    el.style.width = `${w}px`;
    el.style.background = `hsl(${Math.round((i * 360) / n)}, 70%, ${i % 2 ? 68 : 58}%)`;
    stage.world.appendChild(el);
  }
  const floor = document.createElement('div');
  floor.className = 'test-floor';
  floor.style.transform = 'translate(-100px, 0)';
  floor.style.width = `${width + 200}px`;
  stage.world.appendChild(floor);
}

/**
 * Mount the boot scene. opts.input: the input module (createInput). opts.room:
 * 'wide' for the P1.5 wide test room, which also gets the P1.6 blob demo.
 * opts.squishes: the saved squish count to start from; opts.onSquish(count):
 * called after each squish (main.js saves it through the store, P1.4).
 */
export function mountBoot(stage, opts = {}) {
  const { input } = opts;
  if (opts.room === 'wide') {
    stage.setRoom(WIDE_TEST_ROOM);
    buildWideTestRoom(stage);
  } else {
    stage.setRoom({ width: 1440, backdrop: { top: '#ffcf70', bottom: '#f4a57c', horizon: 740 } });
  }

  const buddy = document.createElement('div');
  buddy.className = 'buddy';
  buddy.dataset.squishes = String(opts.squishes || 0);
  const squishEl = document.createElement('div');
  squishEl.className = 'buddy-squish';
  squishEl.innerHTML = BUDDY_SVG;
  buddy.appendChild(squishEl);
  stage.world.appendChild(buddy);

  let happyTimer = 0;
  function squish() {
    sfx.play('boing');
    squishEl.animate(SQUISH, { duration: 420, easing: 'ease-out' });
    buddy.classList.add('is-happy');
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => buddy.classList.remove('is-happy'), 700);
    buddy.dataset.squishes = String(Number(buddy.dataset.squishes) + 1);
    if (opts.onSquish) opts.onSquish(Number(buddy.dataset.squishes));
  }

  input.register(buddy, { onTap: squish });
  const demo = opts.room === 'wide' ? mountBlobs(stage, input) : null;

  return { el: buddy, squish, demo };
}
