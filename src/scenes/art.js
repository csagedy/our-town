// The shipped art manifest (assets/art-manifest.json, built by
// tools/art/build.mjs): loaded once per page with fetch() (Safari 16 has no
// JSON modules), plus helpers the scenes share.
//
//   const manifest = await loadArt();
//   preload(['assets/rooms/kitchen/back.webp', ...])   decode images before a transition
//   useArtSprites(manifest)                              starter props draw as their WebP sprites
//
// No DOM access at import time.

import { addSpriteSource } from '../engine/sprites.js';

export const MANIFEST_URL = 'assets/art-manifest.json';

let loading = null;

/** The manifest (cached). Rejects only if the file can't be fetched or parsed. */
export function loadArt(url = MANIFEST_URL) {
  if (!loading) {
    loading = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`art manifest: HTTP ${r.status}`);
      return r.json();
    });
    loading.catch(() => { loading = null; });   // let a later call retry
  }
  return loading;
}

/**
 * Decode images ahead of time so a scene appears whole. Resolves (never
 * rejects) when every image is decoded, failed, or `timeout` ms have passed.
 * Keeps the Image objects alive until then; the HTTP cache (or the service
 * worker) serves the scene's own <img>s afterwards.
 */
export function preload(files, { timeout = 2500 } = {}) {
  const jobs = files.filter(Boolean).map((src) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  });
  return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeout))]).then(() => undefined);
}

// Tap sound for a prop from its tags (the view plays sprite.sound on a tap).
const TAG_SOUNDS = [['bouncy', 'boing'], ['soft', 'squeak'], ['cup', 'clink'], ['dish', 'clink'], ['cookware', 'clink'],
  ['fruit', 'squish'], ['food', 'squish'], ['plant', 'plink'], ['book', 'tap'], ['container', 'knock']];
export function soundForTags(tags = []) {
  for (const [tag, sound] of TAG_SOUNDS) if (tags.includes(tag)) return sound;
  return 'pop';
}

/**
 * Sprite for a manifest prop kind, or null. props.variant picks a tap/bite
 * variant (default: the prop's default). Size is the image box in world
 * units; the feet point is its bottom center (the resting anchor sits a few
 * units of padding above it, see docs/STYLE.md section 9).
 */
export function artSprite(manifest, kind, props = {}) {
  const p = manifest && manifest.props && manifest.props[kind];
  if (!p) return null;
  const name = props && props.variant && p.variants[props.variant] ? props.variant : p.default;
  const v = p.variants[name];
  return { key: `art:${kind}:${name}`, draw: 'img', src: v.file, w: v.size[0], h: v.size[1], sound: soundForTags(p.tags) };
}

let spriteSourceFor = null;
/** Draw manifest prop kinds with their WebP sprites (idempotent per manifest). */
export function useArtSprites(manifest) {
  if (spriteSourceFor === manifest) return;
  spriteSourceFor = manifest;
  addSpriteSource((kind, props) => artSprite(manifest, kind, props));
}
