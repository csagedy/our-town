// Room layers (docs/design.md 2.1, 6.2): builds a room's DOM inside the
// stage's room layer from a room definition, and gives the view layer the
// containers it draws into.
//
//   const room = mountRoom(stage, def);
//
// def = {
//   id: 'cafe/kitchen', width: 1440, backdrop: {top, bottom, horizon}, cameraX,
//   floor: {top, bottom, x0, x1, sound},            // see surfaces.js
//   surfaces: [{id, x0, x1, y, depth, sound}],       // see surfaces.js
//   art: [{id, layer: 'back' | 'mid' | 'front', x, y, w, h, depth, cls, html}],
// }
//
// Layers, all inside ONE depth container so they share a stacking order
// with the entities (z-index bands from surfaces.js):
//   back   z Z_BACK: walls, windows, a wall shelf: always behind everything
//   mid    z just under zIndexFor(depth): occluders (a table and its cloth,
//          a counter front). An entity sorting before `depth` draws behind
//          it, one at or after it draws in front: the occluder band.
//   front  z Z_FRONT: foreground art over every resting entity
// then entities (view.js, z from their sort key), and a dragged entity
// (Z_DRAG) above all of it. Particles (fx.js) get their own layer on top.
//
// Art pieces are positioned with a transform once, at mount, and never move.
// Pre-rasterized room art (an <img> of the room SVG) goes in as `html`.

import { normalizeRoom, zIndexFor, Z_BACK, Z_FRONT, Z_FX } from './surfaces.js';

export function artZ(piece) {
  if (piece.layer === 'back') return Z_BACK;
  if (piece.layer === 'front') return Z_FRONT;
  return zIndexFor(piece.depth ?? (piece.y + (piece.h || 0))) - 1;
}

/** Start a room on the stage (clears the old one) and build its layers. */
export function mountRoom(stage, rawDef) {
  const def = normalizeRoom(rawDef);
  stage.setRoom({ width: def.width, backdrop: def.backdrop, cameraX: def.cameraX || 0 });

  const el = document.createElement('div');
  el.className = 'room';
  el.dataset.room = def.id;
  const depth = document.createElement('div');
  depth.className = 'room-depth';
  const fxLayer = document.createElement('div');
  fxLayer.className = 'room-fx';
  fxLayer.style.zIndex = String(Z_FX);
  el.appendChild(depth);
  el.appendChild(fxLayer);

  const art = new Map();
  for (const piece of def.art) {
    const a = document.createElement('div');
    a.className = `art art-${piece.layer || 'mid'}${piece.cls ? ' ' + piece.cls : ''}`;
    if (piece.id) a.dataset.art = piece.id;
    a.style.width = `${piece.w}px`;
    a.style.height = `${piece.h}px`;
    a.style.transform = `translate3d(${piece.x}px, ${piece.y}px, 0)`;
    a.style.zIndex = String(artZ(piece));
    if (piece.html) a.innerHTML = piece.html;
    depth.appendChild(a);
    if (piece.id) art.set(piece.id, a);
  }
  stage.world.appendChild(el);

  return {
    def,
    id: def.id,
    el,          // .room: the room's root inside stage.world
    depth,       // .room-depth: art + entities share this stacking order
    fxLayer,     // .room-fx: particles, above everything
    art,         // art piece id -> element
    destroy() { el.remove(); },
  };
}
