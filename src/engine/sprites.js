// Sprite lookup: the one place the view layer asks "what does this kind look
// like?". Today every kind is a placeholder (a colored rounded shape with an
// outline, drawn by CSS); the art pipeline (P1.12, assets/art-manifest.json)
// plugs in later with addSpriteSource() and nothing else changes.
//
//   spriteFor(kind, props) -> { key, w, h, sound, draw: 'shape' | 'img', ... }
//     an 'img' sprite has `src` and optionally `img: {left, top, w, h}`, the
//     image's box inside the w x h entity box (for an off-center anchor);
//     a 'custom' sprite has paint(bodyEl), which draws it (characters)
//   addSpriteSource(fn)     fn(kind, props) -> sprite | null, tried before the placeholders
//   paintSprite(bodyEl, sprite)   (re)draw a sprite into a view's body element
//
// Sizes are room units (the view scales them by depth). The feet anchor is
// the bottom center of the w x h box.

export const SHAPES = ['round', 'box', 'tall', 'cup', 'blob', 'flat'];

// Placeholder look per kind: [w, h, shape, fill, sound]. Also used by the test room.
const PLACEHOLDERS = {
  'test-ball': [86, 86, 'round', '#ff6b6b', 'boing'],
  'test-block': [96, 96, 'box', '#ffd93d', 'knock'],
  'test-cup': [74, 88, 'cup', '#4cc9f0', 'clink'],
  'test-bottle': [54, 128, 'tall', '#6bcb77', 'bubble'],
  'test-bun': [104, 70, 'blob', '#f4a261', 'squish'],
  'test-book': [120, 44, 'flat', '#9b5de5', 'tap'],
  'test-teddy': [100, 116, 'blob', '#c08552', 'squeak'],
  'test-jar': [80, 104, 'box', '#f15bb5', 'plink'],
  'test-star': [92, 92, 'round', '#fee440', 'sparkle'],
  'test-pot': [120, 90, 'cup', '#8d99ae', 'clink'],
};

const sources = [];

/** Register a sprite source (e.g. the art manifest). Newest source wins. Returns a remover. */
export function addSpriteSource(fn) {
  sources.unshift(fn);
  return () => { const i = sources.indexOf(fn); if (i >= 0) sources.splice(i, 1); };
}

/** A stable pleasant color for an unknown kind. Pure. */
export function hashColor(kind) {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 62%)`;
}

/** The placeholder sprite for a kind (unknown kinds get a hashed color). Pure. */
export function placeholderSprite(kind) {
  const p = PLACEHOLDERS[kind] || [90, 90, 'blob', hashColor(kind || '?'), 'pop'];
  return { key: `ph:${kind}`, draw: 'shape', w: p[0], h: p[1], shape: p[2], fill: p[3], sound: p[4] };
}

/** Kinds that have a placeholder look (the test room spawns these). */
export const PLACEHOLDER_KINDS = Object.keys(PLACEHOLDERS);

/** Sprite for an entity kind (+ props, for states such as cooked). Never throws. */
export function spriteFor(kind, props = {}) {
  for (const src of sources) {
    try {
      const s = src(kind, props);
      if (s) return s;
    } catch { /* a broken source falls through to the placeholder */ }
  }
  return placeholderSprite(kind);
}

/** Draw `sprite` into a view's body element. Only called when the sprite key changes. */
export function paintSprite(body, sprite) {
  body.textContent = '';
  const st = body.style;
  if (sprite.draw === 'custom') {
    // Drawn by its owner (a live SVG character): paint(body) fills it.
    body.className = 'ent-body ent-custom';
    st.background = '';
    sprite.paint(body);
    return;
  }
  if (sprite.draw === 'img') {
    body.className = 'ent-body ent-img';
    st.background = '';
    const img = document.createElement('img');
    img.src = sprite.src;
    img.alt = '';
    img.draggable = false;
    if (sprite.img) {
      // The image inside the w x h box: the box's bottom center is the art's
      // anchor (catalog.js), so the image may be offset or hang below it.
      const s = img.style;
      s.position = 'absolute';
      s.left = `${sprite.img.left}px`;
      s.top = `${sprite.img.top}px`;
      s.width = `${sprite.img.w}px`;
      s.height = `${sprite.img.h}px`;
    }
    body.appendChild(img);
  } else {
    body.className = `ent-body ph ph-${sprite.shape}`;
    st.background = sprite.fill;
  }
}
