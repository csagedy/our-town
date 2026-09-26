// Production art build (P1.12). Run through `python3 tools/build.py art`, or
// directly: node tools/art/build.mjs [--no-sheet]
//
// 1. Character rig data   -> assets/characters/rig.json   (live SVG at runtime)
// 2. Room depth layers    -> assets/rooms/<room>/<layer>.webp   (rasterized)
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
import { CITY } from './rooms/city.mjs';
import { PROPS } from './props/starter.mjs';

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
  return {
    id: room.id, width: room.width, height: 1000, canvas: room.canvas, pxPerUnit: ROOM_PX, layers,
    floor: { y0: toWorld(0, room.floor.y0)[1], y1: toWorld(0, room.floor.y1)[1] },
    surfaces: room.surfaces.map((s) => {
      const [x0, y] = toWorld(s.seg[0], s.seg[2]);
      return { id: s.id, layer: s.layer, x0, x1: toWorld(s.seg[1], 0)[0], y };
    }),
    seats: room.seats.map((s) => ({ id: s.id, layer: s.layer, at: toWorld(s.at[0], s.at[1]) })),
  };
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
  for (const [id, p] of Object.entries(PROPS)) {
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
  await shot('contact-sheet', { x: 0, y: 0, width: full.w, height: full.h }, 0.5);
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
      rooms: { kitchen },
      map: city,
      props,
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
