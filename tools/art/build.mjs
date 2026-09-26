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
