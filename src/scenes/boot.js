// Boot placeholder: a friendly buddy that squishes when tapped. It proves the
// touch -> stage -> animation path until the real scenes arrive, and is
// meant to be deleted once the city map (P1.13) exists.
//
// The tap rule here mirrors design.md section 2.2 (under 10pt of movement and
// under 250ms); P1.6 replaces this with the shared input module.

const TAP_SLOP = 10;    // CSS px (= iPad points)
const TAP_MS = 250;

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

export function mountBoot(stage) {
  const buddy = document.createElement('div');
  buddy.className = 'buddy';
  buddy.dataset.squishes = '0';
  const squishEl = document.createElement('div');
  squishEl.className = 'buddy-squish';
  squishEl.innerHTML = BUDDY_SVG;
  buddy.appendChild(squishEl);
  stage.el.appendChild(buddy);

  let happyTimer = 0;
  function squish() {
    squishEl.animate(SQUISH, { duration: 420, easing: 'ease-out' });
    buddy.classList.add('is-happy');
    clearTimeout(happyTimer);
    happyTimer = setTimeout(() => buddy.classList.remove('is-happy'), 700);
    buddy.dataset.squishes = String(Number(buddy.dataset.squishes) + 1);
  }

  let down = null;
  buddy.addEventListener('pointerdown', (e) => {
    if (down) return;                         // ignore a second finger
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false };
    buddy.setPointerCapture(e.pointerId);
  });
  buddy.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= TAP_SLOP) down.moved = true;
  });
  buddy.addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const isTap = !down.moved && e.timeStamp - down.t < TAP_MS;
    down = null;
    if (isTap) squish();
  });
  buddy.addEventListener('pointercancel', () => { down = null; });

  return { el: buddy, squish };
}
