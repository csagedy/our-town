// Production art build (P1.12). Run through `python3 tools/build.py art`, or
// directly: node tools/art/build.mjs [--no-sheet]
//
// 1. Character rig data   -> assets/characters/rig.json   (live SVG at runtime)
// 2. Room depth layers    -> assets/rooms/<room>/<layer>.webp   (rasterized; a
//                            panning room with zones also gets column tiles
//                            in assets/rooms/<room>/tiles/<layer>-<i>.webp)
// 3. Starter props        -> assets/sprites/props/<prop>-<variant>.webp
// 4. Manifest             -> assets/art-manifest.json (sizes, anchors, surfaces)
// 5. Contact sheet        -> tools/art/contact-sheet/*.png (screenshots of
//                            tools/art/contact-sheet/index.html)
//
// Rasterizing uses headless Chrome through tools/harness.mjs (the same Chrome
// the tests use): SVG -> <img> -> <canvas> -> toDataURL('image/webp').
// Delivery format and the numbers behind it: docs/STYLE.md section 9.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage } from '../harness.mjs';
import { P, ART_SCALE, INK_W, css, scaleStrokes } from './palette.mjs';
import { buildRig } from './characters/rig.mjs';
import { ROOM as KITCHEN } from './rooms/kitchen.mjs';
import { ROOM as CAFE } from './rooms/cafe.mjs';
import { ROOM as BOOTH } from './rooms/booth.mjs';
import { CAFE_PROPS, EXTEND as CAFE_EXTEND, CAFE_META } from './props/cafe.mjs';
import { CITY } from './rooms/city.mjs';
import { PROPS } from './props/starter.mjs';
import { ROOM as SITE, SITE_RIGS, BUILD_GRID } from './rooms/site.mjs';
import { SITE_PROPS, SITE_META } from './props/site.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ASSETS = path.join(ROOT, 'assets');

// Raster densities in output pixels per WORLD unit (docs/STYLE.md section 9).
export const ROOM_PX = 1.5;
export const PROP_PX = 2;
const ROOM_QUALITY = 0.9;     // lossy WebP; flat colour + lines compress well
const PROP_QUALITY = 0.92;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const round = (n, d = 1) => +n.toFixed(d);

function writeIfChanged(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && Buffer.compare(fs.readFileSync(file), buf) === 0) return false;
  fs.writeFileSync(file, buf);
  return true;
}

/** Standalone SVG text for the rasterizer, strokes scaled for pxPerArt output pixels per art unit. */
export function svgFor(viewBox, body, pxPerArt, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.join(' ')}"><style>${css(pxPerArt)}</style>${defs}${scaleStrokes(body, pxPerArt)}</svg>`;
}

export async function rasterize(page, job) {
  return page.eval((j) => window.rasterize(j), job);
}

export async function buildRoom(page, room, written) {
  const k = ART_SCALE * ROOM_PX;                       // stroke scale: output px per art unit
  const { x: cx, y: cy, w: cw, h: ch } = room.canvas;
  const place = (inner) => `<g id="art"><g transform="translate(${room.offset[0]} ${room.offset[1]}) scale(${ART_SCALE})"><g class="o">${inner}</g></g></g>`;
  const toWorld = (x, y) => [round(x * ART_SCALE + room.offset[0]), round(y * ART_SCALE + room.offset[1])];
  const layers = [];
  for (const L of room.layers) {
    const svg = svgFor([cx, cy, cw, ch], place(L.art()), k, room.defs);
    const res = await rasterize(page, {
      svg, unit: ROOM_PX, formats: ['webp'], quality: ROOM_QUALITY,
      crop: L.opaque ? null : { pad: 4, clamp: [cx, cy, cw, ch] }, opaque: L.opaque ? P.cream : null,
    });
    const file = path.join(ASSETS, 'rooms', room.id, `${L.id}.webp`);
    const buf = Buffer.from(res.data.webp, 'base64');
    if (writeIfChanged(file, buf)) written.push(file);
    layers.push({
      id: L.id, file: rel(file), baseline: L.baseline, opaque: !!L.opaque,
      x: round(res.box[0], 2), y: round(res.box[1], 2), w: round(res.box[2], 2), h: round(res.box[3], 2),
      px: res.px, bytes: buf.length,
    });
  }
  // A panning room with camera stops (the cafe strip) also ships each layer
  // in column tiles, so the runtime decodes only what is near the camera.
  if (room.zones) await buildRoomTiles(page, room, place, layers, room.zones.map((z) => z.camera), written);
  const out = {
    id: room.id, width: room.width, height: 1000, canvas: room.canvas, pxPerUnit: ROOM_PX, layers,
    floor: { y0: toWorld(0, room.floor.y0)[1], y1: toWorld(0, room.floor.y1)[1] },
    surfaces: room.surfaces.map((s) => {
      const [x0, y] = toWorld(s.seg[0], s.seg[2]);
      return { id: s.id, layer: s.layer, x0, x1: toWorld(s.seg[1], 0)[0], y, ...(s.inside ? { inside: s.inside } : {}) };
    }),
    seats: room.seats.map((s) => ({ id: s.id, layer: s.layer, at: toWorld(s.at[0], s.at[1]) })),
  };
  const boxW = (b) => { const [x, y] = toWorld(b[0], b[1]); return [x, y, round(b[2] * ART_SCALE), round(b[3] * ART_SCALE)]; };
  if (room.pieces) out.pieces = await buildRoomPieces(page, room, place, toWorld, boxW, written);
  if (room.slots) {
    out.slots = room.slots.map((s) => ({ ...s, at: s.at ? toWorld(s.at[0], s.at[1]) : null, box: s.box ? boxW(s.box) : null }));
  }
  if (room.spawners) out.spawners = room.spawners.map((s) => ({ ...s, ...(s.at ? { at: toWorld(s.at[0], s.at[1]) } : {}) }));
  if (room.zones) out.zones = room.zones.map((z) => ({ id: z.id, x0: toWorld(z.x0, 0)[0], x1: toWorld(z.x1, 0)[0], camera: z.camera }));
  return out;
}

// ---- column tiles for panning rooms (P2a.1; docs/perf.md "Cafe strip memory") ----
export const TILE_MARGIN = 120;   // world units: how far past a camera stop's view a tile edge sits
const TILE_OVERLAP_PX = 2;        // each tile reaches this far under its right neighbour (no hairline seams)

/**
 * Column edges (world x) for a room's tiles: the canvas ends plus, for each
 * camera stop, its 1440-wide view widened by `margin` on both sides. So at a
 * stop exactly the tiles within `margin` of the view are needed. Edges are
 * snapped to whole output pixels. Pure.
 */
export function tileEdges(canvas, stops, { view = 1440, margin = TILE_MARGIN, px = ROOM_PX } = {}) {
  const x0 = canvas.x, x1 = canvas.x + canvas.w;
  const snap = (e) => x0 + Math.round((e - x0) * px) / px;
  const set = new Set([x0, x1]);
  for (const s of stops) for (const e of [s - margin, s + view + margin]) if (e > x0 + 1 && e < x1 - 1) set.add(snap(e));
  return [...set].sort((a, b) => a - b);
}

async function buildRoomTiles(page, room, place, layers, stops, written) {
  const k = ART_SCALE * ROOM_PX;
  const edges = tileEdges(room.canvas, stops);
  for (const [li, L] of room.layers.entries()) {
    const out = layers[li];
    out.tiles = [];
    const lx1 = out.x + out.w;
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = Math.max(edges[i], out.x);
      const b = Math.min(edges[i + 1] + TILE_OVERLAP_PX / ROOM_PX, lx1);
      if (b - a < 2) continue;
      const box = [a, out.y, b - a, out.h];
      const res = await rasterize(page, {
        svg: svgFor(box, place(L.art()), k, room.defs), unit: ROOM_PX, formats: ['webp'], quality: ROOM_QUALITY,
        crop: null, opaque: L.opaque ? P.cream : null,
      });
      const file = path.join(ASSETS, 'rooms', room.id, 'tiles', `${L.id}-${out.tiles.length}.webp`);
      const buf = Buffer.from(res.data.webp, 'base64');
      if (writeIfChanged(file, buf)) written.push(file);
      out.tiles.push({ file: rel(file), x: round(box[0], 2), y: round(box[1], 2), w: round(box[2], 2), h: round(box[3], 2), px: res.px, bytes: buf.length });
    }
  }
}

/**
 * A room's state pieces (rooms/cafe.mjs): every variant is rasterized in ONE
 * shared box (the union of the variants' crops), so the runtime swaps
 * variants in place by changing the img src. Placement: x, y, w, h (world).
 */
async function buildRoomPieces(page, room, place, toWorld, boxW, written) {
  const { x: cx, y: cy, w: cw, h: ch } = room.canvas;
  const k = ART_SCALE * ROOM_PX;
  const job = (art, box) => ({
    svg: svgFor(box || [cx, cy, cw, ch], place(art), k, room.defs), unit: ROOM_PX, formats: ['webp'], quality: ROOM_QUALITY,
    crop: box ? null : { pad: 4, clamp: [cx, cy, cw, ch] }, opaque: null,
  });
  const out = {};
  for (const pc of room.pieces) {
    const names = Object.keys(pc.variants);
    const arts = names.map((n) => pc.variants[n]());
    let res = [];
    for (const a of arts) res.push(await rasterize(page, job(a)));
    const x0 = Math.min(...res.map((r) => r.box[0])), y0 = Math.min(...res.map((r) => r.box[1]));
    const x1 = Math.max(...res.map((r) => r.box[0] + r.box[2])), y1 = Math.max(...res.map((r) => r.box[1] + r.box[3]));
    const box = [x0, y0, x1 - x0, y1 - y0];
    for (let i = 0; i < res.length; i++) if (res[i].box.join() !== box.join()) res[i] = await rasterize(page, job(arts[i], box));
    const variants = {};
    names.forEach((n, i) => {
      const file = path.join(ASSETS, 'rooms', room.id, `${pc.id}-${n}.webp`);
      const buf = Buffer.from(res[i].data.webp, 'base64');
      if (writeIfChanged(file, buf)) written.push(file);
      variants[n] = { file: rel(file), bytes: buf.length };
    });
    out[pc.id] = {
      layer: pc.layer, default: names[0], variants, px: res[0].px,
      x: round(box[0], 2), y: round(box[1], 2), w: round(box[2], 2), h: round(box[3], 2),
      taps: pc.taps || null, pivot: pc.pivot ? toWorld(...pc.pivot) : null,
      ...(pc.controls ? { controls: pc.controls } : {}),
      ...(pc.textArea ? { textArea: boxW(pc.textArea) } : {}),
    };
  }
  return out;
}

/**
 * The city map (rooms/city.mjs): static layers plus separate pieces, each in a
 * day and a night variant (docs/STYLE.md section 9, "The city map"). Night =
 * the day art through the build-time NIGHT colour filter, plus its lit extras;
 * it is rasterized in exactly the day variant's box so the two swap in place.
 */
export async function buildMap(page, map, written) {
  const k = ART_SCALE * ROOM_PX;
  const { x: cx, y: cy, w: cw, h: ch } = map.canvas;
  const place = (inner) => `<g id="art"><g transform="translate(${map.offset[0]} ${map.offset[1]}) scale(${ART_SCALE})"><g class="o">${inner}</g></g></g>`;
  const toWorld = (x, y) => [round(x * ART_SCALE + map.offset[0], 2), round(y * ART_SCALE + map.offset[1], 2)];
  const night = (art, lit, sky = '') => `${sky}<g filter="url(#night)">${art}</g><g class="lit">${lit}</g>`;
  const dir = path.join(ASSETS, 'rooms', map.id);
  // Day and night are rasterized in ONE box (the union of both crops), so
  // the two images swap in place even where a night glow reaches past the day art.
  const job = (inner, box, opaque) => ({
    svg: svgFor(box || [cx, cy, cw, ch], place(inner), k, map.defs), unit: ROOM_PX, formats: ['webp'], quality: ROOM_QUALITY,
    crop: opaque || box ? null : { pad: 4, clamp: [cx, cy, cw, ch] }, opaque: opaque ? P.cream : null,
  });
  const write = (name, res) => {
    const file = path.join(dir, `${name}.webp`);
    const buf = Buffer.from(res.data.webp, 'base64');
    if (writeIfChanged(file, buf)) written.push(file);
    return { file: rel(file), bytes: buf.length };
  };
  async function variants(name, day, nightSvg, opaque) {
    let d = await rasterize(page, job(day, null, opaque));
    let n = nightSvg != null ? await rasterize(page, job(nightSvg, null, opaque)) : null;
    if (n && !opaque) {
      const [a, b] = [d.box, n.box];
      const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
      const box = [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) - x0, Math.max(a[1] + a[3], b[1] + b[3]) - y0];
      if (box.join() !== a.join()) d = await rasterize(page, job(day, box, false));
      if (box.join() !== b.join()) n = await rasterize(page, job(nightSvg, box, false));
    }
    const out = { ...write(name, d), px: d.px,
      x: round(d.box[0], 2), y: round(d.box[1], 2), w: round(d.box[2], 2), h: round(d.box[3], 2) };
    out.night = n ? write(`${name}-night`, n) : null;
    return out;
  }
  const layers = [];
  for (const L of map.layers) {
    const { art, lit } = map.collect(L.art);
    const day = (L.sky ? L.sky() : '') + art;
    const v = await variants(L.id, day, night(art, lit, L.nightSky ? L.nightSky() : ''), !!L.opaque);
    layers.push({ id: L.id, opaque: !!L.opaque, ...v });
  }
  const pieces = {};
  for (const piece of map.pieces) {
    const { art, lit } = map.collect(piece.art);
    const v = await variants(piece.id, art, piece.noNight ? null : night(art, lit), false);
    // Copies: the art is drawn at the first copy's spot; the others are offsets from it.
    const c0 = piece.copies && piece.copies[0];
    const copies = c0 ? piece.copies.map(([x, y]) => [round(v.x + (x - c0[0]) * ART_SCALE, 2), round(v.y + (y - c0[1]) * ART_SCALE, 2)]) : null;
    pieces[piece.id] = { ...v, depth: piece.depth, pivot: piece.pivot ? toWorld(...piece.pivot) : null, copies };
  }
  return { id: map.id, width: map.width, height: 1000, canvas: map.canvas, pxPerUnit: ROOM_PX, backdrop: map.backdrop, layers, pieces };
}

async function buildProps(page, written) {
  const k = ART_SCALE * PROP_PX;
  const unit = ART_SCALE * PROP_PX;                     // output px per art unit
  const out = {};
  // Starter props (plus the cafe's extra food variants: one kind per food), then the cafe set.
  const all = Object.entries(PROPS).map(([id, p]) => {
    const ext = CAFE_EXTEND[id];
    return [id, ext ? { ...p, variants: { ...p.variants, ...ext.variants }, prep: ext.prep, set: 'starter' } : { ...p, set: 'starter' }];
  }).concat(Object.entries(CAFE_PROPS).map(([id, p]) => [id, { ...p, set: 'cafe' }]))
    .concat(Object.entries(SITE_PROPS).map(([id, p]) => [id, { ...p, set: 'site' }]));
  for (const [id, p] of all) {
    const variants = {};
    for (const [vname, art] of Object.entries(p.variants)) {
      const svg = svgFor([-400, -400, 800, 500], `<g id="art" class="o">${art}</g>`, k);
      const res = await rasterize(page, { svg, unit, formats: ['webp'], quality: PROP_QUALITY, crop: { pad: 5 } });
      const name = Object.keys(p.variants).length === 1 && vname === 'default' ? id : `${id}-${vname}`;
      const file = path.join(ASSETS, 'sprites', 'props', `${name}.webp`);
      const buf = Buffer.from(res.data.webp, 'base64');
      if (writeIfChanged(file, buf)) written.push(file);
      const [bx, by, bw, bh] = res.box;
      variants[vname] = {
        file: rel(file), px: res.px, bytes: buf.length,
        // world size, and the anchor (the resting point, art origin) in world units from the image's top-left
        size: [round(bw * ART_SCALE, 2), round(bh * ART_SCALE, 2)],
        anchor: [round(-bx * ART_SCALE, 2), round(-by * ART_SCALE, 2)],
      };
    }
    const w = (v) => v.map((n) => round(n * ART_SCALE, 2));
    out[id] = {
      label: p.label, tags: p.tags, default: Object.keys(p.variants)[0], variants,
      taps: p.taps || null, oneWay: !!p.oneWay, bites: p.bites || null,
      grip: w(p.grip || [0, -(Object.values(variants)[0].anchor[1] / ART_SCALE) / 2]),
      surface: p.surface ? w(p.surface) : null,
      set: p.set, prep: p.prep || null, leaves: p.leaves || null,
      // construction site extras (props/site.mjs): snap metadata, paint map, wear piece, states, saw result
      ...Object.fromEntries(['snap', 'paint', 'wear', 'states', 'saw'].filter((k) => p[k] != null).map((k) => [k, p[k]])),
    };
  }
  return out;
}

async function screenshotSheet(page, written) {
  const dir = path.join(HERE, 'contact-sheet');
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto('tools/art/contact-sheet/index.html');
  const sections = await page.eval(() => [...document.querySelectorAll('section[id]')].map((s) => {
    const r = s.getBoundingClientRect();
    return { id: s.id, x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }));
  const full = await page.eval(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
  const shot = async (name, clip, scale) => {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale } });
    const file = path.join(dir, `${name}.png`);
    if (writeIfChanged(file, Buffer.from(data, 'base64'))) written.push(file);
  };
  // The whole sheet is taller than Chrome can capture at full size, so it is
  // shot with the page itself zoomed out (same picture as a scaled clip).
  const Z = 0.3;
  await page.eval((z) => { document.documentElement.style.zoom = String(z); }, Z);
  await shot('contact-sheet', { x: 0, y: 0, width: Math.floor(full.w * Z), height: Math.floor(full.h * Z) }, 1);
  await page.eval(() => { document.documentElement.style.zoom = ''; });
  for (const s of sections) await shot(s.id, { x: s.x, y: s.y, width: s.w, height: s.h }, 0.5);
}

export async function build({ sheet = true } = {}) {
  const written = [];
  const rig = buildRig();
  const rigFile = path.join(ASSETS, 'characters', 'rig.json');
  const rigBuf = Buffer.from(JSON.stringify(rig));
  if (writeIfChanged(rigFile, rigBuf)) written.push(rigFile);

  const page = await openPage({ root: ROOT, path: 'tools/art/raster.html' });
  try {
    const kitchen = await buildRoom(page, KITCHEN, written);
    const cafe = await buildRoom(page, CAFE, written);
    const booth = await buildRoom(page, BOOTH, written);
    const site = { ...(await buildRoom(page, SITE, written)), grid: BUILD_GRID, rigs: SITE_RIGS };
    const city = await buildMap(page, CITY, written);
    const props = await buildProps(page, written);
    const manifest = {
      schema: 1,
      note: 'Generated by tools/art/build.mjs (python3 tools/build.py art). Units are world units (the 1440 x 1000 stage) unless noted. Format: docs/STYLE.md section 9.',
      artScale: ART_SCALE, inkWorld: round(INK_W * ART_SCALE, 2),
      characters: {
        rig: rel(rigFile), bytes: rigBuf.length,
        cast: rig.characters.map((c) => c.id),
        bodies: Object.fromEntries(Object.entries(rig.bodies).map(([id, b]) => [id, {
          height: round(b.skeleton.height * ART_SCALE, 1),
          anchor: [0, 0],   // feet: the ground point between the feet (rig local origin)
        }])),
        poses: Object.keys(rig.poses), expressions: Object.keys(rig.expressions),
        wear: Object.fromEntries(Object.entries(rig.wear).map(([id, w]) => [id, w.slot])),
      },
      rooms: { kitchen, cafe, booth, site },
      map: city,
      props,
      site: SITE_META,
      cafe: { ...CAFE_META, mystery: { ...CAFE_META.mystery, at: Object.fromEntries(Object.entries(CAFE_META.mystery.at).map(([k, v]) => [k, v.map((n) => round(n * ART_SCALE, 2))])) } },
    };
    const mFile = path.join(ASSETS, 'art-manifest.json');
    if (writeIfChanged(mFile, Buffer.from(JSON.stringify(manifest, null, 1) + '\n'))) written.push(mFile);
    if (sheet) await screenshotSheet(page, written);
  } finally {
    await page.close();
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  build({ sheet: !process.argv.includes('--no-sheet') }).then((files) => {
    for (const f of files) console.log('  wrote ' + rel(f));
    console.log(`  art: done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }, (err) => { console.error(err); process.exit(1); });
}
