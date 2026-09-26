// Room layer tiles (P2a.1): a panning room's layers ship as column tiles
// (tools/art/build.mjs `tiles`, docs/perf.md "Cafe strip memory"), and only
// the tiles near the camera are decoded. The whole cafe strip decodes to
// about 62 MB; the old 2 GB iPad Pro can't spare that for one room.
//
//   const tiles = createTileLoader({ stage, tiles: [{ img, file, x, w, px }] });
//   tiles.update()        after the room is up (also runs on every camera change)
//   tiles.loaded()        files whose <img> has a src right now
//   tiles.destroy()
//
// Rules:
// - At rest a tile is wanted if it lies within REST_MARGIN of the visible
//   world rect; while the camera moves (a drag, a fling, a snap, an edge
//   auto-pan) the margin grows to MOVE_MARGIN so the next tiles decode ahead
//   of the finger.
// - Load = decode off-screen first (new Image + img.decode()), then set the
//   visible <img>'s src, so nothing ever pops in half-decoded.
// - Unload = drop the <img>'s src once the camera has been still for
//   SETTLE_MS and the tile is no longer wanted at rest. Unloading never
//   happens mid-pan, so a tile the finger is heading back to stays.
// - Idle: no timers or frames while nothing moves (the settle check is one
//   timeout armed by camera movement).
//
// tilesNear() is pure (unit tests).

export const REST_MARGIN = 100;     // world units: less than the build's TILE_MARGIN, so a stop needs only its own tiles
export const MOVE_MARGIN = 420;
export const SETTLE_MS = 350;

/** Indices of tiles [{x, w}] within `margin` of the world span [left, right]. Pure. */
export function tilesNear(tiles, left, right, margin) {
  const out = [];
  tiles.forEach((t, i) => { if (t.x + t.w > left - margin && t.x < right + margin) out.push(i); });
  return out;
}

/** Decoded bitmap bytes of tiles (width x height x 4). Pure. */
export const decodedBytes = (tiles) => tiles.reduce((n, t) => n + (t.px ? t.px[0] * t.px[1] * 4 : 0), 0);

export function createTileLoader({ stage, tiles, onChange = null }) {
  const recs = tiles.map((t) => ({ ...t, state: 'idle', gen: 0 }));   // idle | loading | loaded
  const stats = { loads: 0, unloads: 0 };
  let timer = 0;
  let destroyed = false;

  function view() {
    const v = stage.visibleWorld();
    return { left: v.left, right: v.right };
  }

  function load(r) {
    if (r.state !== 'idle') return;
    r.state = 'loading';
    const gen = ++r.gen;
    const pre = new Image();
    pre.decoding = 'async';
    pre.src = r.file;
    const show = () => {
      if (destroyed || r.gen !== gen || r.state !== 'loading') return;
      r.state = 'loaded';
      r.img.src = r.file;
      stats.loads++;
      if (onChange) onChange();
    };
    (pre.decode ? pre.decode() : Promise.resolve()).then(show, show);
  }

  function unload(r) {
    if (r.state === 'idle') return;
    r.gen++;
    r.state = 'idle';
    r.img.removeAttribute('src');
    stats.unloads++;
    if (onChange) onChange();
  }

  /** Load what the camera needs; with `settled`, also drop what it no longer needs. */
  function update(settled = false) {
    if (destroyed) return;
    const cam = stage.camera;
    const moving = cam.dragging || cam.moving;
    const { left, right } = view();
    const want = new Set(tilesNear(recs, left, right, moving ? MOVE_MARGIN : REST_MARGIN));
    recs.forEach((r, i) => { if (want.has(i)) load(r); });
    if (settled && !moving) recs.forEach((r, i) => { if (!want.has(i)) unload(r); });
  }

  function settleLater() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      const cam = stage.camera;
      if (cam.dragging || cam.moving) { settleLater(); return; }
      update(true);
    }, SETTLE_MS);
  }

  const off = stage.onChange((_, why) => {
    if (why === 'camera') { update(false); settleLater(); }
    else if (why === 'settle' || why === 'resize') { update(false); settleLater(); }
  });

  return {
    update,
    /** Files with a src right now (decoded or decoding in the <img>). */
    loaded: () => recs.filter((r) => r.state === 'loaded').map((r) => r.file),
    /** Decoded bytes of the loaded tiles. */
    bytes: () => decodedBytes(recs.filter((r) => r.state === 'loaded')),
    /** Files a camera at x would want at rest (for preloading before a transition). */
    filesAt(cameraX, width = 1440) { return tilesNear(recs, cameraX, cameraX + width, REST_MARGIN).map((i) => recs[i].file); },
    stats: () => ({ ...stats, loaded: recs.filter((r) => r.state === 'loaded').length, loading: recs.filter((r) => r.state === 'loading').length, total: recs.length, settleTimer: !!timer }),
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      off();
    },
  };
}
