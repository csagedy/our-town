// Input demo for the wide test room (index.html?room=wide), temporary like
// the rest of the boot scene: four blobs to drag across the room with the
// P1.6 input module. Tap = squish, long-press = color swap, drag = lift and
// carry (edge auto-pan near the screen edges), drop = one "move" commit.
//
// Blob positions are world units at the blob's center. Each drop appends one
// {op: 'move', id, x, y} to `moves`, standing in for the P1.3 store dispatch
// (drag frames stay local, as in docs/design.md 6.4).

import { sfx } from '../audio/index.js';

export const DEMO_BLOBS = [
  { x: 260, y: 860, size: 150, hue: 340 },
  { x: 1120, y: 870, size: 120, hue: 140 },
  { x: 1900, y: 600, size: 170, hue: 265 },
  { x: 1250, y: 470, size: 36, hue: 30 },     // tiny: exercises the 64pt padded hit box
];

const SQUISH = [
  { transform: 'scale(1, 1)' },
  { transform: 'scale(1.16, 0.84)', offset: 0.3 },
  { transform: 'scale(0.94, 1.08)', offset: 0.65 },
  { transform: 'scale(1, 1)' },
];

export function mountBlobs(stage, input, specs = DEMO_BLOBS) {
  const moves = [];
  const roomW = stage.room.width;
  const blobs = specs.map((spec, i) => {
    const b = { id: `blob${i}`, x: spec.x, y: spec.y, size: spec.size, hue: spec.hue };
    const el = document.createElement('div');
    el.className = 'blob';
    el.dataset.blob = String(i);
    Object.assign(el.dataset, { taps: '0', longPresses: '0', drags: '0', commits: '0', cancels: '0' });
    el.style.width = el.style.height = `${b.size}px`;
    el.innerHTML = '<div class="blob-shadow" data-lift-shadow></div>'
      + '<div class="blob-lift" data-lift><div class="blob-body"><i></i><i></i></div></div>';
    const body = el.querySelector('.blob-body');
    const paint = () => { body.style.background = `hsl(${b.hue}, 75%, 62%)`; };
    const place = () => {
      el.style.transform = `translate3d(${b.x - b.size / 2}px, ${b.y - b.size / 2}px, 0)`;
      el.dataset.x = String(b.x);
      el.dataset.y = String(b.y);
    };
    const bump = (k) => { el.dataset[k] = String(Number(el.dataset[k]) + 1); };
    const squish = () => body.animate(SQUISH, { duration: 320, easing: 'ease-out' });
    paint();
    place();
    stage.world.appendChild(el);

    input.register(el, {
      lift: true,
      onTap() {
        bump('taps');
        sfx.play('boing', { pitch: 150 / b.size });
        squish();
      },
      onLongPress() {
        bump('longPresses');
        b.hue = (b.hue + 70) % 360;
        paint();
        sfx.play('sparkle');
      },
      onDragStart(info) {
        bump('drags');
        info.data.x0 = b.x;
        info.data.y0 = b.y;
        sfx.play('pickup');
      },
      onDragMove(info) {
        b.x = info.data.x0 + info.dx;
        b.y = info.data.y0 + info.dy;
        place();
      },
      onDragEnd(info) {
        if (info.cancelled) bump('cancels');
        // No failure: a drop off the room comes back inside it.
        b.x = Math.min(roomW - b.size / 2, Math.max(b.size / 2, b.x));
        b.y = Math.min(1000 - b.size / 2, Math.max(b.size / 2, b.y));
        place();
        moves.push({ op: 'move', id: b.id, x: b.x, y: b.y });
        bump('commits');
        sfx.play('thud');
        squish();
      },
    });
    const reset = () => {
      Object.assign(b, { x: spec.x, y: spec.y, hue: spec.hue });
      paint();
      place();
    };
    return { el, state: b, reset };
  });
  /** Put every blob back where it started (tests). */
  const reset = () => blobs.forEach((bl) => bl.reset());
  return { blobs, moves, reset };
}
