// Tween helpers on the Web Animations API (docs/design.md 6.2). WAAPI
// transform/opacity animations run on the compositor, and nothing here runs
// a per-frame loop: an idle room costs 0% CPU.
//
// Rules (enforced by `animate`): keyframes may animate only `transform` and
// `opacity` (plus the per-keyframe `offset`/`easing`/`composite` keys). The
// element gets `will-change: transform` while any of its tweens run and loses
// it when the last one ends (unless the input module is dragging it, which
// owns will-change then).
//
//   animate(el, keyframes, opts)         -> Animation (checked, will-change managed)
//   done(anim)                           -> Promise that resolves when it finishes OR is cancelled
//   squish(el, {amount, duration})       tap reaction: squash and stretch around the feet
//   squash(el, {amount, delay})          landing: a quick flatten
//   fallKeyframes(from, to, bounce)      keyframes for a drop: gravity in, small bounce
//   fall(el, fromTransform, toTransform, {dist})   -> {anim, landAt (ms)}
//   slide(el, fromTransform, toTransform, {duration})
//   pulse(el, {min, max, duration})      endless opacity pulse (drop-target glow); cancel it
//   fadeIn(el) / fadeOut(el) / popIn(el)
//
// Transforms are passed as CSS strings, so callers compose them exactly as
// they write the element's style (translate3d(...) scale(...)).

const ALLOWED = new Set(['transform', 'opacity', 'offset', 'easing', 'composite']);

/** Throw if a keyframe list animates anything but transform/opacity. Pure. */
export function checkKeyframes(keyframes) {
  const list = Array.isArray(keyframes) ? keyframes : [keyframes];
  for (const k of list) {
    for (const prop of Object.keys(k)) {
      if (!ALLOWED.has(prop)) throw new Error(`tween: only transform/opacity may animate, not "${prop}"`);
    }
  }
  return keyframes;
}

const running = new WeakMap();   // el -> count of live tweens

function track(el, anim) {
  running.set(el, (running.get(el) || 0) + 1);
  el.style.willChange = 'transform';
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    const n = (running.get(el) || 1) - 1;
    if (n > 0) { running.set(el, n); return; }
    running.delete(el);
    // A drag in progress (input.js sets data-dragging) owns will-change.
    if (!('dragging' in el.dataset)) el.style.willChange = '';
  };
  anim.addEventListener('finish', end);
  anim.addEventListener('cancel', end);
}

/** el.animate with the transform/opacity rule and will-change bookkeeping. */
export function animate(el, keyframes, opts = {}) {
  checkKeyframes(keyframes);
  const anim = el.animate(keyframes, opts);
  track(el, anim);
  return anim;
}

/** Resolves when `anim` finishes or is cancelled (never rejects). */
export function done(anim) {
  if (!anim) return Promise.resolve(false);
  return anim.finished.then(() => true, () => false);
}

/** Is el running any tween started through this module? */
export const isAnimating = (el) => (running.get(el) || 0) > 0;

// ---- reactions ----

export const SQUISH_MS = 380;

/** Tap reaction: squash and stretch (set transform-origin at the feet in CSS). */
export function squish(el, { amount = 1, duration = SQUISH_MS, delay = 0 } = {}) {
  const a = 0.18 * amount;
  return animate(el, [
    { transform: 'scale(1, 1)' },
    { transform: `scale(${1 + a}, ${1 - a})`, offset: 0.25 },
    { transform: `scale(${1 - a * 0.55}, ${1 + a * 0.6})`, offset: 0.55 },
    { transform: `scale(${1 + a * 0.2}, ${1 - a * 0.15})`, offset: 0.8 },
    { transform: 'scale(1, 1)' },
  ], { duration, delay, easing: 'ease-out' });
}

/** Landing: a quick flatten and recover. */
export function squash(el, { amount = 1, delay = 0, duration = 220 } = {}) {
  const a = 0.14 * amount;
  return animate(el, [
    { transform: 'scale(1, 1)' },
    { transform: `scale(${1 + a}, ${1 - a})`, offset: 0.35 },
    { transform: 'scale(1, 1)' },
  ], { duration, delay, easing: 'ease-out' });
}

// ---- movement ----

export const GRAVITY_EASE = 'cubic-bezier(0.55, 0, 1, 0.45)';   // speeds up like a fall
export const LAND_AT = 0.72;                                     // share of a fall spent falling

/** Duration (ms) of a fall of `dist` units: longer drops take longer, but never drag on. */
export function fallDuration(dist) {
  return Math.round(Math.min(560, Math.max(200, 150 + Math.sqrt(Math.max(0, dist)) * 16)));
}

/** Bounce height (units) after a fall of `dist`. */
export const bounceHeight = (dist) => Math.round(Math.min(22, Math.max(4, dist * 0.07)));

/**
 * Keyframes for a drop: gravity from `from` to `to`, a small hop back up by
 * `bounce` px (world units; composed as an extra translate), and down again.
 */
export function fallKeyframes(from, to, bounce) {
  const up = `translate3d(0, ${-bounce}px, 0) ${to}`;
  return [
    { transform: from, easing: GRAVITY_EASE },
    { transform: to, offset: LAND_AT, easing: 'ease-out' },
    { transform: up, offset: LAND_AT + (1 - LAND_AT) * 0.5, easing: 'ease-in' },
    { transform: to },
  ];
}

/** Animate a fall. Returns { anim, landAt } (ms until it first touches down). */
export function fall(el, from, to, { dist = 100 } = {}) {
  const duration = fallDuration(dist);
  const anim = animate(el, fallKeyframes(from, to, bounceHeight(dist)), { duration });
  return { anim, landAt: Math.round(duration * LAND_AT), duration };
}

/** A short glide between two transforms (a snap onto a surface, a remote move). */
export function slide(el, from, to, { duration = 160, easing = 'ease-out' } = {}) {
  return animate(el, [{ transform: from }, { transform: to }], { duration, easing });
}

/** Endless opacity pulse for a highlight. Cancel the returned animation to stop it. */
export function pulse(el, { min = 0.45, max = 1, duration = 700 } = {}) {
  return animate(el, [{ opacity: min }, { opacity: max }], {
    duration, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out',
  });
}

export const fadeIn = (el, { duration = 150 } = {}) => animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease-out' });
export const fadeOut = (el, { duration = 150 } = {}) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'ease-in', fill: 'forwards' });
export const popIn = (el, { duration = 260 } = {}) => animate(el, [
  { transform: 'scale(0.4)', opacity: 0 },
  { transform: 'scale(1.1)', opacity: 1, offset: 0.6 },
  { transform: 'scale(1)', opacity: 1 },
], { duration, easing: 'ease-out' });
