// Pooled particle effects (docs/design.md 6.2): sparkles, puffs and hearts.
// At most `cap` particle elements ever exist (24 by default); they are
// created on first use, reused forever, and hidden with visibility (no
// layout) when idle. When every particle is busy the oldest one is recycled,
// so a flurry of taps never grows the DOM or queues work. Particles animate
// transform/opacity only, through tween.js, so nothing runs per frame once
// they finish.
//
//   const fx = createFx(layerEl, { cap: 24 });
//   fx.burst('sparkle', x, y, { count: 6, spread: 70 });
//   fx.stats()  -> { cap, created, active }

import { animate } from './tween.js';

export const FX_CAP = 24;

// Unit-box SVG shapes (viewBox 0 0 20 20), filled by CSS class per type.
const SHAPES = {
  sparkle: '<svg viewBox="0 0 20 20"><path d="M10 0 L12.6 7.4 L20 10 L12.6 12.6 L10 20 L7.4 12.6 L0 10 L7.4 7.4 Z"/></svg>',
  puff: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9"/></svg>',
  heart: '<svg viewBox="0 0 20 20"><path d="M10 18 C4 13 0 10 0 5.6 C0 2.4 2.4 0 5.4 0 C7.4 0 9 1.2 10 3 C11 1.2 12.6 0 14.6 0 C17.6 0 20 2.4 20 5.6 C20 10 16 13 10 18 Z"/></svg>',
  // P2c.1: water drops (the site's hose), falling as they fly.
  drop: '<svg viewBox="0 0 20 20"><path d="M10 1 C13 6 16 9.5 16 13 C16 16.5 13.3 19 10 19 C6.7 19 4 16.5 4 13 C4 9.5 7 6 10 1 Z"/></svg>',
};
// Cafe prep (P2a.2): chopped bits, suds, stirring swirls and the 1-in-20
// chick that peeks out of a cracked egg. bit and swirl take a colour
// (burst opts.color, drawn with currentColor).
const INK = 'stroke="#3D2C29" stroke-width="1.6" stroke-linejoin="round"';
Object.assign(SHAPES, {
  bit: `<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="4.5" fill="currentColor" ${INK}/></svg>`,
  bubble: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="rgba(255,255,255,0.35)" stroke="#FFFFFF" stroke-width="1.8"/><path d="M6 8.5 Q6.5 5.5 9.5 5" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/></svg>',
  swirl: '<svg viewBox="0 0 20 20"><path d="M10 10 m-1.2 0 a1.2 1.2 0 1 1 2.4 0 a3 3 0 1 1 -6 0 a5 5 0 1 1 10 0 a7 7 0 1 1 -14 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  chick: `<svg viewBox="0 0 20 20"><circle cx="10" cy="9" r="6.5" fill="#F4DC98" ${INK}/><circle cx="8" cy="8" r="0.9" fill="#3D2C29"/><circle cx="12" cy="8" r="0.9" fill="#3D2C29"/><path d="M9 10 L11 10 L10 11.6 Z" fill="#DFB050" ${INK}/><path d="M3 13 L5 11.5 L7 13 L9 11.5 L11 13 L13 11.5 L15 13 L17 11.5 L17 17 Q10 20 3 17 Z" fill="#FFFDF6" ${INK}/></svg>`,
});
// Heat (P2a.3): a soft steam curl rising off hot food, pots and the oven.
SHAPES.steam = '<svg viewBox="0 0 20 20"><path d="M9 19 C4 15 14 12 9 8 C6 5.5 9 2.5 11 1" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.6" stroke-linecap="round"/></svg>';
export const FX_TYPES = Object.keys(SHAPES);

// Per type: base size (units), lifetime (ms), rise (units, negative = up), spin (deg).
const LOOK = {
  sparkle: { size: 26, life: 620, rise: -30, spin: 90 },
  puff: { size: 40, life: 520, rise: -18, spin: 0 },
  heart: { size: 34, life: 900, rise: -110, spin: 0 },
  drop: { size: 16, life: 700, rise: 70, spin: 0 },
  bit: { size: 18, life: 620, rise: 46, spin: 260 },
  bubble: { size: 26, life: 1000, rise: -80, spin: 0 },
  swirl: { size: 36, life: 700, rise: -14, spin: 300 },
  chick: { size: 46, life: 1500, rise: -34, spin: 0 },
  steam: { size: 34, life: 1400, rise: -70, spin: 30 },
};

export function createFx(layer, { cap = FX_CAP, random = Math.random } = {}) {
  const pool = [];          // { el, type, anim, started }
  let seq = 0;

  function take() {
    let p = pool.find((q) => !q.anim);
    if (p) return p;
    if (pool.length < cap) {
      const el = document.createElement('div');
      el.className = 'fx-p';
      el.style.visibility = 'hidden';
      layer.appendChild(el);
      p = { el, type: null, anim: null, started: 0 };
      pool.push(p);
      return p;
    }
    // All busy: recycle the oldest.
    p = pool.reduce((a, b) => (a.started <= b.started ? a : b));
    const a = p.anim;
    p.anim = null;
    a.cancel();
    return p;
  }

  function launch(type, x, y, dx, dy, scale, delay, color = null) {
    const p = take();
    const look = LOOK[type];
    if (p.type !== type) {
      p.el.innerHTML = SHAPES[type];
      p.el.className = `fx-p fx-${type}`;   // CSS sizes it: LOOK[type].size units square
      p.type = type;
    }
    const el = p.el;
    el.style.color = color || '';
    // Position lives in the keyframes (transform only: no left/top, no layout).
    const h = look.size / 2;
    const at = (ox, oy) => `translate3d(${x - h + ox}px, ${y - h + oy}px, 0)`;
    el.style.visibility = '';
    const spin = look.spin * (random() - 0.5) * 2;
    const frames = type === 'chick'
      ? [
        { transform: `${at(0, 10)} scale(${0.4 * scale})`, opacity: 0 },
        { transform: `${at(0, look.rise)} scale(${1.1 * scale})`, opacity: 1, offset: 0.2 },
        { transform: `${at(0, look.rise)} scale(${scale}) rotate(-8deg)`, opacity: 1, offset: 0.5 },
        { transform: `${at(0, look.rise)} scale(${scale}) rotate(8deg)`, opacity: 1, offset: 0.75 },
        { transform: `${at(0, 10)} scale(${0.5 * scale})`, opacity: 0 },
      ]
      : type === 'puff'
      ? [
        { transform: `${at(0, 0)} scale(${0.3 * scale})`, opacity: 0.9 },
        { transform: `${at(dx, dy + look.rise)} scale(${1.3 * scale})`, opacity: 0 },
      ]
      : [
        { transform: `${at(0, 0)} scale(${0.2 * scale}) rotate(0deg)`, opacity: 0 },
        { transform: `${at(dx * 0.6, dy * 0.6 + look.rise * 0.4)} scale(${1.1 * scale}) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.3 },
        { transform: `${at(dx, dy + look.rise)} scale(${0.6 * scale}) rotate(${spin}deg)`, opacity: 0 },
      ];
    const anim = animate(el, frames, { duration: look.life, delay, easing: 'ease-out', fill: 'backwards' });
    p.anim = anim;
    p.started = ++seq;
    const release = () => {
      if (p.anim !== anim) return;      // recycled meanwhile
      p.anim = null;
      el.style.visibility = 'hidden';
    };
    anim.addEventListener('finish', release);
    anim.addEventListener('cancel', release);
  }

  return {
    /**
     * A burst of `count` particles of `type` around world point (x, y) (+ ox, oy).
     * angle/arc (degrees, 0 = right, negative = up): a fan instead of a ring (a hose's spray).
     * color: fill of the coloured types (bit, swirl; P2a.2).
     */
    burst(type, x, y, { count = 6, spread = 60, scale = 1, stagger = 18, ox = 0, oy = 0, angle = null, arc = 60, color = null } = {}) {
      if (!LOOK[type]) type = 'sparkle';
      const n = Math.min(count, cap);
      x += ox; y += oy;
      for (let i = 0; i < n; i++) {
        const ang = angle == null ? (i / n) * Math.PI * 2 + random() * 0.8 : ((angle + (random() - 0.5) * arc) * Math.PI) / 180;
        const r = spread * (0.5 + random() * 0.5);
        const k = scale * (0.7 + random() * 0.6);
        launch(type, x, y, Math.cos(ang) * r, Math.sin(ang) * r * 0.7, k, i * stagger, color);
      }
    },
    stats: () => ({ cap, created: pool.length, active: pool.filter((p) => p.anim).length }),
    /** Stop everything and hide (a room change). Elements stay pooled. */
    clear() {
      for (const p of pool) if (p.anim) { const a = p.anim; p.anim = null; a.cancel(); p.el.style.visibility = 'hidden'; }
    },
  };
}
