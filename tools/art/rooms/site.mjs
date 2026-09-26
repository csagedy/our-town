// The Construction Site (P2c.1, docs/design.md 3.3): ONE panning strip, 2880
// world units wide, with three zones: the BUILD YARD (a wooden build deck with
// a chalk grid, scaffolding, the lumber pile, the brick pallet and a portable
// toilet), the CRANE yard (a tower crane, its lever box, a half-built steel
// frame, the site office and a wrecking-ball crane) and the DIG PIT plus
// WORKSHOP (the pit with a separate dirt layer, an excavator, a dump truck,
// a cement mixer and a workbench with a tool wall). Authored in art units
// like the cafe (world = art * ART_SCALE).
//
// Shipped as depth layers (back / counter / mid / front) plus PIECES: every
// moving or state-changing part is its own raster (docs/STYLE.md 9, "The
// cafe strip"): the portable toilet door, the tower crane's cab, jib, trolley,
// cable and hook, the crane lever, the wrecking crane's boom, chain and ball,
// the excavator's body, arm and bucket, the dump truck and its tilting bed,
// the mixer drum's spin frames, and the dig pit's DIRT fill (the engine draws
// it into a canvas and erases it with a mask to dig). Joints and attach
// points for the animated parts are in SITE_META.rigs (world units).
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';
import * as HH from '../props/household.mjs';
import { ART_SCALE } from '../palette.mjs';
const { pot, plantLeafy, mug, jar, books, succulent } = HH;

export const ART_W = 4114;                          // 2880 world
const WALL_Y = 1010;                                // fence foot = back edge of the ground
const BB = 1040;                                    // base line of the back row (counter layer)
const MB = 1290;                                    // base line of the mid row (vehicles, piles)
const X0 = -150, X1 = 4270, Y0 = -150, Y1 = 1580;
const ZB = [0, 1370], ZC = [1370, 2430], ZD = [2430, ART_W];   // zones (art x)
const G = 40 / ART_SCALE;                           // one build-grid cell (40 world) in art units
const A = (w) => w / ART_SCALE;                     // world -> art

// Build deck: 16 cells from world x 230 to 870; pieces rest at world y 880.
export const DECK = { x0: A(230), cells: 16, rest: A(880) };
DECK.x1 = DECK.x0 + DECK.cells * G;
const HAZ = '#EE9A55', HAZD = P.terraDeep;          // safety orange (the vest colour)
const DIRT = '#B98A66', DIRTD = '#9C7050', DIRTK = '#7E5A43', SAND = '#EBD3AC', SANDD = '#D9BC90';

const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;
const glint = (d, w = 6) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const cloud = (x, y, s = 1) => at(x, y, s, `<path class="n" fill="#fff" d="M0 0 q0 -30 30 -30 q10 -24 38 -18 q26 -6 34 20 q26 2 24 28Z"/>`);
const tree = (x, y, s = 1, c = P.leaf) => at(x, y, s, `<rect fill="${P.woodDeep}" x="-8" y="-60" width="16" height="60"/><path fill="${c}" d="${scallop(0, -96, 50, 46, 9, 10)}"/><path fill="${P.leafLight}" class="n" d="${scallop(-12, -106, 22, 18, 6, 5)}"/>`);
const bolt = (x, y, c = P.steelDeep) => `<circle class="n" fill="${c}" cx="${f(x)}" cy="${f(y)}" r="4"/>`;

/** Hazard stripes clipped to a box. */
let HZ = 0;
function hazard(x, y, w, h, a = P.mustard, b = P.char, step = 36) {
  const id = `hz${++HZ}`;
  let s = '';
  for (let i = -2; i < w / step + 2; i++) s += `<path fill="${b}" d="M${f(x + i * step)} ${f(y + h)} L${f(x + i * step + h)} ${y} L${f(x + i * step + h + step / 2)} ${y} L${f(x + i * step + step / 2)} ${f(y + h)}Z"/>`;
  return `<clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath>${R(x, y, w, h, a)}<g class="n" clip-path="url(#${id})">${s}</g>${R(x, y, w, h, 'none')}`;
}
/** A tyre with a hub. */
function wheel(x, y, r, hub = P.steel) {
  const bolts = [0, 72, 144, 216, 288].map((a) => { const t = a * Math.PI / 180; return bolt(x + Math.cos(t) * r * .3, y + Math.sin(t) * r * .3, P.steelDeep); }).join('');
  return `<circle fill="${P.char}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/><circle fill="${hub}" cx="${f(x)}" cy="${f(y)}" r="${f(r * .5)}"/>${bolts}<circle fill="${P.steelDeep}" class="thin" cx="${f(x)}" cy="${f(y)}" r="${f(r * .14)}"/>
  <path ${tl(P.charHi, 'stroke-width:5')} d="M${f(x - r * .72)} ${f(y - r * .3)} A${f(r * .78)} ${f(r * .78)} 0 0 1 ${f(x - r * .3)} ${f(y - r * .72)}"/>`;
}
/** Crawler tracks from x0 to x1 standing on base y. */
function tracks(x0, x1, base, h = 74) {
  const y = base - h, n = Math.max(3, Math.round((x1 - x0) / 70));
  let rollers = '', ticks = '';
  for (let i = 0; i < n; i++) rollers += `<circle fill="${P.charHi}" cx="${f(x0 + h / 2 + i * ((x1 - x0 - h) / (n - 1)))}" cy="${f(y + h / 2)}" r="${f(h * .26)}"/><circle class="n" fill="${P.char}" cx="${f(x0 + h / 2 + i * ((x1 - x0 - h) / (n - 1)))}" cy="${f(y + h / 2)}" r="${f(h * .09)}"/>`;
  for (let x = x0 + 20; x < x1 - 14; x += 22) ticks += `M${x} ${y + 1} L${x} ${y + 9} M${x} ${base - 9} L${x} ${base - 1} `;
  return `<path fill="${P.char}" d="${rrect(x0, y, x1 - x0, h, h / 2)}"/><path fill="${P.charDeep}" class="n" d="${rrect(x0 + 12, y + 12, x1 - x0 - 24, h - 24, (h - 24) / 2)}"/>${rollers}<path ${tl(P.charHi, 'stroke-width:4')} d="${ticks}"/>`;
}
/** A lattice mast (vertical) between y0 and y1 at centre x, half-width w. */
function mast(x, y0, y1, w, c = P.mustard, cd = P.mustardDeep) {
  let z = '';
  for (let y = y1 - 8; y > y0 + 30; y -= 56) z += `M${x - w + 8} ${y} L${x + w - 8} ${y - 28} L${x - w + 8} ${y - 56} `;
  let rungs = '';
  for (let y = y1 - 8; y > y0 + 20; y -= 56) rungs += R(x - w, y - 4, w * 2, 8, c);
  return `${rungs}<path ${tl(cd, 'stroke-width:7')} d="${z}"/>${R(x - w - 7, y0, 16, y1 - y0, c, ' rx="4"')}${R(x + w - 9, y0, 16, y1 - y0, c, ' rx="4"')}`;
}
/** A lattice boom from a to b (two chords + zigzag). */
function boom(ax, ay, bx, by, wA, wB, c, cd) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const pt = (t, s) => { const w = wA + (wB - wA) * t; return [ax + dx * t + nx * w * s, ay + dy * t + ny * w * s]; };
  const chord = (s) => { const [p0, p1] = [pt(0, s), pt(1, s)]; const q0 = pt(0, s * .55), q1 = pt(1, s * .55); return `<path fill="${c}" d="M${f(p0[0])} ${f(p0[1])} L${f(p1[0])} ${f(p1[1])} L${f(q1[0])} ${f(q1[1])} L${f(q0[0])} ${f(q0[1])}Z"/>`; };
  let z = '';
  const n = Math.round(L / 60);
  for (let i = 0; i < n; i++) { const a = pt(i / n, .5), b = pt((i + .5) / n, -.5), d = pt((i + 1) / n, .5); z += `M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} L${f(d[0])} ${f(d[1])} `; }
  return `<path ${tl(cd, 'stroke-width:7')} d="${z}"/>${chord(1)}${chord(-1)}`;
}
const bird = (x, y, c = P.blue, s = 1, flip = false) => at(x, y, flip ? -s : s, `<path fill="${c}" d="M-16 0 Q-18 -18 0 -20 Q14 -22 18 -8 L28 -10 L20 0 Q10 8 -6 6Z"/><circle class="ink" cx="8" cy="-12" r="2.6"/><path fill="${P.mustard}" class="thin" d="M18 -14 L26 -12 L18 -9Z"/><path class="d" d="M-10 -6 Q-2 -2 6 -6"/>`);

// ---------------------------------------------------------------------------
// BACK layer: sky, distant town, the hoarding fence, the ground, the build
// deck with its grid, the dig pit hole, and small things along the fence.
// ---------------------------------------------------------------------------
function sky() {
  const hills = `<path fill="${P.leafLight}" d="M${X0} 800 Q300 650 700 740 Q1100 620 1500 720 Q1900 640 2300 730 Q2700 650 3100 720 Q3600 630 ${X1} 720 L${X1} 900 L${X0} 900Z"/>`;
  const town = [[180, 150, 110, P.lav, P.plum], [420, 110, 150, P.peach, P.terra], [900, 170, 90, P.mint, P.teal], [1160, 120, 130, P.blush, P.rose],
    [2600, 130, 120, P.butter, P.mustard], [2850, 170, 100, P.lav, P.plum], [3350, 120, 140, P.mint, P.teal], [3620, 150, 110, P.blush, P.roseDeep], [3960, 110, 160, P.peach, P.terra]]
    .map(([x, w, h, c, r], i) => {
      const y = 760;
      const roof = i % 3 === 0 ? `<path fill="${r}" d="M${x - 10} ${y - h} L${x + w / 2} ${y - h - 50} L${x + w + 10} ${y - h}Z"/>` : R(x - 6, y - h - 14, w + 12, 16, r, ' rx="4"');
      let win = '';
      for (let yy = y - h + 22; yy < y - 30; yy += 44) for (let xx = x + 18; xx < x + w - 30; xx += 40) win += R(xx, yy, 22, 26, P.sky, ' class="thin" rx="3"');
      return `${R(x, y - h, w, h, c)}${roof}${win}`;
    }).join('');
  const farCrane = `<g opacity=".55">${R(3140, 380, 14, 380, P.sageDeep, ' class="n"')}${R(2980, 370, 380, 14, P.sageDeep, ' class="n"')}<path class="n" fill="none" style="stroke:${P.sageDeep};stroke-width:4" d="M3147 330 L2990 372 M3147 330 L3350 372 M3147 330 L3147 380 M3060 384 L3060 470"/></g>`;
  return `<rect class="n" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${WALL_Y - Y0}" fill="${P.sky}"/>
  ${cloud(160, 120)}${cloud(1020, 60, .8)}${cloud(1900, 110, 1.1)}${cloud(2780, 50, .9)}${cloud(3500, 130)}${cloud(4000, 40, .7)}
  ${farCrane}${hills}${town}
  ${tree(60, 770, 1.1)}${tree(1300, 770, .9, P.leafDeep)}${tree(2480, 770, 1.2)}${tree(3240, 770, .9, P.leafDeep)}${tree(3860, 770, 1)}
  ${at(3000, 190, 1, `${[...Array(10)].map((_, i) => { const a = i * 36; return `<g transform="rotate(${a})"><path fill="${P.butter}" class="thin" d="M-9 -78 L0 -100 L9 -78Z"/></g>`; }).join('')}<circle fill="${P.butter}" r="62"/><circle class="n" fill="#FFF3C4" cx="-18" cy="-20" r="16"/>`)}
  ${cloud(2350, 250, 1.2)}${cloud(3350, 300, .9)}${cloud(3800, 220, 1.1)}${cloud(1650, 40, .8)}
  ${bird(3500, 330, P.rose, .8)}${bird(3560, 300, P.blue, .9)}${bird(3610, 340, P.butter, .7)}
  ${bird(700, 250, P.blue, 1)}${bird(760, 220, P.rose, .8)}${bird(3060, 200, P.butter, .9, true)}`;
}
function fence() {
  const top = 740, x0 = X0, x1 = X1, gate = [2470, 2780];
  let s = '';
  for (let px = x0; px < x1; px += 150) {
    if (px + 150 > gate[0] && px < gate[1]) continue;
    s += `${R(px + 2, top, 146, WALL_Y - top, P.woodLight)}<path ${tl(P.wood)} d="M${px + 50} ${top + 34} L${px + 50} ${WALL_Y - 4} M${px + 100} ${top + 34} L${px + 100} ${WALL_Y - 4}"/>`;
    s += hazard(px + 2, top, 146, 28);
  }
  // the open gate: a peek at the street, one gate leaf swung back
  const road = `${R(gate[0] - 20, top, gate[1] - gate[0] + 40, WALL_Y - top, P.sky, ' class="n"')}
    <path class="n" fill="${P.leafLight}" d="M${gate[0] - 20} 900 Q${gate[0] + 150} 850 ${gate[1] + 20} 890 L${gate[1] + 20} ${WALL_Y}L${gate[0] - 20} ${WALL_Y}Z"/>
    ${R(gate[0] - 20, 950, gate[1] - gate[0] + 40, 60, P.warmGrey, ' class="n"')}<path ${tl('#fff', 'stroke:#fff;stroke-width:6;stroke-dasharray:30 26')} d="M${gate[0] - 20} 980 L${gate[1] + 20} 980"/>
    ${at(gate[0] + 90, 900, .8, tree(0, 0, 1))}${at(gate[0] + 220, 952, .9, `<path fill="${P.rose}" d="M-60 0 L-60 -30 Q-56 -44 -40 -46 L-26 -70 Q-20 -76 -8 -76 L30 -76 Q42 -76 48 -64 L58 -46 Q66 -44 66 -30 L66 0Z"/>${R(-18, -68, 24, 20, P.sky, ' class="thin" rx="3"')}${R(12, -68, 28, 20, P.sky, ' class="thin" rx="3"')}${wheel(-34, 0, 14)}${wheel(40, 0, 14)}`)}
    <path fill="${P.woodLight}" d="M${gate[1]} ${top} L${gate[1] + 40} ${top + 20} L${gate[1] + 40} ${WALL_Y - 10} L${gate[1]} ${WALL_Y}Z"/>`;
  const posts = [gate[0] - 14, gate[1] - 6].map((x) => `${R(x, top - 30, 22, WALL_Y - top + 30, P.woodDeep, ' rx="4"')}<circle fill="${HAZ}" cx="${x + 11}" cy="${top - 36}" r="12"/>`).join('');
  return road + s + posts;
}
function ground() {
  let dots = '';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 220; i++) {
    const x = X0 + rnd() * (X1 - X0), y = WALL_Y + 20 + rnd() * (Y1 - WALL_Y - 30);
    if (x > 2870 && x < 3410 && y < 1400) continue;                    // not in the pit
    const r = 3 + rnd() * 5;
    dots += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 1.4)}" ry="${f(r * .8)}" fill="${i % 3 ? SANDD : P.warmGrey}"/>`;
  }
  const trackPath = `M2600 ${Y1} Q2560 1450 2640 1340 M2720 ${Y1} Q2690 1450 2760 1340 M1500 1520 Q1900 1440 2300 1500 M1520 1550 Q1900 1470 2300 1530`;
  return `<rect class="n" x="${X0}" y="${WALL_Y}" width="${X1 - X0}" height="${Y1 - WALL_Y}" fill="${SAND}"/>
  <rect class="n" x="${X0}" y="${WALL_Y}" width="${X1 - X0}" height="16" fill="${SANDD}"/>
  <g class="n">${dots}</g><path ${tl(SANDD, 'stroke-width:10;stroke-dasharray:14 12')} d="${trackPath}"/>
  <ellipse class="n" fill="${P.skyDeep}" cx="1840" cy="1470" rx="120" ry="20"/><ellipse class="n" fill="${P.sky}" cx="1830" cy="1466" rx="96" ry="13"/>
  ${[[-80, 1500], [760, 1560], [1300, 1530], [2380, 1560], [3500, 1560], [4200, 1520]].map(([x, y]) => at(x, y, 1, [-24, -8, 8, 22].map((a, i) => leaf(34 + (i % 2) * 12, 7, a, i % 2 ? P.leaf : P.leafDeep)).join(''))).join('')}`;
}

// ---- BUILD YARD -----------------------------------------------------------
/** The build deck: a low wooden platform, cells checkered with a chalk line where pieces rest. */
function deck() {
  const { x0, x1, rest } = DECK, n = DECK.cells;
  const bt = rest - 36, bb = rest + 22, fb = bb + 40;         // band top, band bottom, face bottom
  const vp = (x0 + x1) / 2;
  const xt = (x) => vp + (x - vp) * .94;                       // top edge of the band is a touch narrower
  let band = '', seams = '', chalk = '';
  for (let i = 0; i < n; i++) {
    const a = x0 + i * G, b = a + G;
    const back = `M${f(xt(a))} ${f(bt)} L${f(xt(b))} ${f(bt)} L${f(b)} ${f(rest)} L${f(a)} ${f(rest)}Z`;
    band += `<path class="n" fill="${i % 2 ? P.wood : P.woodLight}" d="${back}"/>`;
    band += `<path class="n" fill="${i % 2 ? P.woodLight : P.wood}" d="M${f(a)} ${f(rest)} L${f(b)} ${f(rest)} L${f(b)} ${f(bb)} L${f(a)} ${f(bb)}Z"/>`;
    seams += `M${f(a + 6)} ${f(bb + 6)} L${f(a + 6)} ${f(fb - 6)} `;
    if (i) chalk += `M${f(xt(a))} ${f(bt + 6)} L${f(a)} ${f(bb - 4)} `;
  }
  let nails = '';
  for (let i = 0; i <= n; i++) nails += bolt(x0 + i * G - (i === n ? 10 : -12), bb + 20, P.woodLight);
  return `<g id="deck">
  <ellipse class="n" fill="${P.ink}" opacity=".08" cx="${f((x0 + x1) / 2)}" cy="${f(fb + 6)}" rx="${f((x1 - x0) / 2 + 30)}" ry="14"/>
  <path fill="${P.woodLight}" d="M${f(xt(x0))} ${f(bt)} L${f(xt(x1))} ${f(bt)} L${f(x1)} ${f(bb)} L${f(x0)} ${f(bb)}Z"/>
  ${band}
  <path ${tl('#fff', 'stroke:#fff;stroke-width:5')} d="${chalk}"/>
  <path ${tl('#fff', 'stroke:#fff;stroke-width:6;stroke-dasharray:18 12')} d="M${f(x0 + 8)} ${f(rest)} L${f(x1 - 8)} ${f(rest)}"/>
  <path fill="none" d="M${f(xt(x0))} ${f(bt)} L${f(xt(x1))} ${f(bt)} L${f(x1)} ${f(bb)} L${f(x0)} ${f(bb)}Z"/>
  ${R(x0 - 6, bb, x1 - x0 + 12, fb - bb, P.woodDeep, ' rx="4"')}<path ${tl(P.woodDark)} d="${seams}"/>${nails}
  <g transform="translate(${f(x1 - 60)} ${f(bb + 34)})"><path class="tl" style="stroke:#fff;stroke-width:4;opacity:.8" d="M-14 0 L-14 -16 L0 -28 L14 -16 L14 0Z M-4 0 L-4 -9 L4 -9 L4 0"/></g>
  <g transform="translate(${f(x0 + 50)} ${f(bb + 22)})"><path class="tl" style="stroke:#fff;stroke-width:4;opacity:.8" d="${star(0, 0, 13, 6)}"/></g>
  ${[x0 + 30, (x0 + x1) / 2, x1 - 30].map((x) => R(x - 20, fb - 2, 40, 12, P.woodDeep, ' rx="3"')).join('')}
  </g>`;
}
function fenceStuffBuild() {
  // a big picture-blueprint poster (a house), a hard-hat sign and bunting
  const bp = at(820, 800, 1, `${R(-120, -8, 240, 170, P.blue, ' rx="6"')}<g>
    <path class="tl" style="stroke:#fff;stroke-width:4;opacity:.8" d="M-100 12 L100 12 M-100 142 L100 142"/><path class="tl" style="stroke:#fff;stroke-width:4;opacity:.8" d="M-60 132 L-60 72 L0 32 L60 72 L60 132Z M-20 132 L-20 96 L10 96 L10 132 M26 84 L48 84 L48 104 L26 104Z M34 50 L34 30 L46 30 L46 58"/></g>
    <circle fill="${P.steel}" class="thin" cx="-110" cy="2" r="7"/><circle fill="${P.steel}" class="thin" cx="110" cy="2" r="7"/>`);
  const sign = at(1110, 820, 1, `<circle fill="${P.blueDeep}" cx="0" cy="40" r="48"/><circle fill="#fff" class="n" cx="0" cy="40" r="38"/>
    <path fill="${P.mustard}" d="M-28 50 C-30 20 -14 10 0 10 C14 10 30 20 28 50Z"/>${R(-36, 46, 72, 10, P.mustardDeep, ' rx="5"')}<path fill="${P.butter}" class="thin" d="M-5 11 L5 11 L4 46 L-4 46Z"/>`);
  const flags = [P.berry, P.butter, P.teal, HAZ, P.lav, P.leafLight];
  let bunt = `<path class="d" d="M140 640 Q420 700 700 640 Q980 700 1250 640"/>`;
  for (let i = 0; i < 16; i++) {
    const t = (i + .5) / 16, x = 140 + 1110 * t, seg = t < .504 ? t * 2 : (t - .504) * 2, y = 640 + 60 * 4 * seg * (1 - seg) * .5 + 8;
    bunt += `<path fill="${flags[i % flags.length]}" class="thin" d="M${f(x - 18)} ${f(y - 6)} L${f(x + 18)} ${f(y - 6)} L${f(x)} ${f(y + 30)}Z"/>`;
  }
  return bp + sign + bunt;
}
function floodlight(x, top) {
  return `<g>${R(x - 8, top, 16, BB - top, P.steelDeep, ' rx="4"')}${R(x - 30, BB - 16, 60, 16, P.char, ' rx="5"')}
  ${[-36, 0, 36].map((dx) => `${R(x + dx - 16, top - 36, 32, 30, P.charHi, ' rx="6"')}<rect class="n" fill="#FFF6D8" x="${x + dx - 11}" y="${top - 30}" width="22" height="16" rx="4"/>`).join('')}
  ${R(x - 58, top - 8, 116, 10, P.steelDeep, ' rx="4"')}</g>`;
}
function yardClutter() {
  // along the fence behind the deck: a cable spool, a cement sack, a shovel, a bucket, a toolbox
  const spool = at(470, BB, 1, `<ellipse fill="${P.wood}" cx="0" cy="-60" rx="22" ry="60"/>${R(-60, -104, 120, 88, P.teal)}<path ${tl(P.tealDeep)} d="M-60 -90 L60 -90 M-60 -74 L60 -74 M-60 -58 L60 -58 M-60 -42 L60 -42 M-60 -26 L60 -26"/>
    ${R(-74, -120, 20, 120, P.woodLight, ' rx="8"')}${R(54, -120, 20, 120, P.woodLight, ' rx="8"')}`);
  const sack = at(600, BB, 1, `<path fill="${P.oat}" d="M-40 0 Q-46 -40 -34 -70 Q0 -80 34 -70 Q46 -40 40 0Z"/><path class="d" d="M-30 -68 Q0 -58 30 -68"/><path fill="${P.warmGrey}" class="thin" d="M-16 -40 L16 -40 L16 -16 L-16 -16Z"/><path class="n" fill="${P.oat}" d="M-8 -34 L8 -34 L8 -22 L-8 -22Z"/>`);
  const shovel = `<g transform="translate(690 ${BB}) rotate(-10)"><rect fill="${P.woodDeep}" x="-5" y="-190" width="10" height="130" rx="4"/><path fill="${P.steel}" d="M-24 -70 L24 -70 L20 -20 Q0 4 -20 -20Z"/><path fill="none" d="M-14 -200 L14 -200 L10 -186 L-10 -186Z"/></g>`;
  const bucket = at(1000, BB, 1, `<path fill="${HAZ}" d="M-32 -64 L32 -64 L26 0 L-26 0Z"/><ellipse fill="${HAZD}" cx="0" cy="-64" rx="32" ry="8"/><path class="d" d="M-32 -60 Q0 -110 32 -60"/>`);
  const toolbox = at(1180, BB, 1, `${R(-50, -46, 100, 46, P.berry, ' rx="6"')}${R(-50, -46, 100, 14, '#C4585C', ' rx="4"')}<path fill="none" d="M-20 -46 L-20 -62 L20 -62 L20 -46"/>${R(-10, -30, 20, 10, P.steel, ' rx="3"')}`);
  return spool + sack + shovel + bucket + toolbox;
}

// ---- CRANE YARD (back) ------------------------------------------------------
const TC = { x: 1450, top: 290, cabY: 190, jibY0: 150, jibY1: 196, jibX0: 280, jibX1: 1920, trolleyX: 800, hookY: 600 };
function craneMast() {
  const { x, top } = TC;
  return `<g id="crane-mast">
  <ellipse class="n" fill="${P.ink}" opacity=".1" cx="${x}" cy="${BB + 4}" rx="110" ry="12"/>
  ${R(x - 90, BB - 50, 180, 50, P.warmGrey, ' rx="6"')}<path ${tl(P.warmGreyDeep)} d="M${x - 70} ${BB - 30} L${x + 70} ${BB - 30}"/>${bolt(x - 70, BB - 14)}${bolt(x + 70, BB - 14)}
  ${mast(x, top, BB - 50, 34)}
  </g>`;
}
function steelFrame() {
  const cols = [1720, 1920, 2120], floors = [880, 710, 540];
  let s = `<ellipse class="n" fill="${P.ink}" opacity=".08" cx="1920" cy="${BB + 2}" rx="240" ry="12"/>`;
  // bricked-in ground floor on the left bay
  s += R(1730, 890, 180, BB - 890, P.brick);
  s += `<path ${tl(P.brickDeep)} d="${[916, 942, 968, 994, 1020].map((y) => `M1730 ${y} L1910 ${y}`).join(' ')} ${[0, 1, 2, 3, 4, 5].map((r) => [0, 1, 2, 3].map((c) => `M${1730 + c * 50 + (r % 2) * 25 + 20} ${890 + r * 26} L${1730 + c * 50 + (r % 2) * 25 + 20} ${916 + r * 26}`).join(' ')).join(' ')}"/>`;
  s += R(1780, 928, 70, 60, P.sky, ' rx="4"');
  // columns
  for (const x of cols) s += `${R(x - 14, floors[2] - (x === 2120 ? -170 : 0), 28, BB - floors[2] + (x === 2120 ? -170 : 0), P.terra, ' rx="3"')}<path ${tl(P.terraDeep)} d="M${x - 5} ${floors[2] + 16 + (x === 2120 ? 170 : 0)} L${x - 5} ${BB - 10}"/>`;
  // beams (I-beams: a slab plus flange lines and bolts)
  const beam = (x0, x1, y) => `${R(x0 - 20, y - 14, x1 - x0 + 40, 28, P.terra, ' rx="4"')}<path ${tl(P.terraDeep)} d="M${x0 - 14} ${y - 4} L${x1 + 14} ${y - 4}"/>${bolt(x0 - 6, y + 6, P.terraDeep)}${bolt(x1 + 6, y + 6, P.terraDeep)}${bolt((x0 + x1) / 2, y + 6, P.terraDeep)}`;
  s += beam(1720, 2120, floors[0]) + beam(1720, 2120, floors[1]) + beam(1720, 1920, floors[2]);
  // floor planks on the first level, a ladder, the topping-out tree
  s += R(1740, floors[1] - 34, 160, 20, P.woodLight, ' rx="3"') + `<path ${tl(P.wood)} d="M1790 ${floors[1] - 34} L1790 ${floors[1] - 14} M1850 ${floors[1] - 34} L1850 ${floors[1] - 14}"/>`;
  s += `<path fill="${P.wood}" d="M2040 ${floors[0] - 14} L2070 ${floors[1] + 14} L2084 ${floors[1] + 14} L2054 ${floors[0] - 14}Z M2090 ${floors[0] - 14} L2120 ${floors[1] + 14} L2134 ${floors[1] + 14} L2104 ${floors[0] - 14}Z"/>`;
  s += `<path class="d" d="${[0, 1, 2, 3].map((i) => { const t = (i + .5) / 4, y = floors[0] - 14 - (floors[0] - floors[1] - 28) * t, x = 2047 + 30 * t; return `M${f(x)} ${f(y)} L${f(x + 50)} ${f(y)}`; }).join(' ')}"/>`;
  s += at(1720, floors[2] - 14, .75, `<path fill="${P.leafDeep}" d="M0 -120 L34 -50 L16 -52 L42 0 L-42 0 L-16 -52 L-34 -50Z"/>${R(-5, 0, 10, 14, P.woodDark)}`);
  s += at(1920, floors[2] - 14, 1, `<path class="d" d="M0 0 L0 -80"/><path fill="${P.berry}" d="M0 -80 L46 -66 L0 -52Z"/>`);
  return `<g id="frame">${s}</g>`;
}
const OFF = { x0: 2170, x1: 2430, top: 760 };
function siteOffice() {
  const { x0, x1, top } = OFF, bot = BB - 30;
  const hats = [[x0 + 36, P.mustard], [x0 + 86, HAZ], [x0 + 136, P.mustard]];
  return `<g id="office">
  ${[x0 + 24, x1 - 60].map((x) => R(x, bot, 36, 30, P.warmGrey, ' rx="3"')).join('')}
  ${R(x0, top, x1 - x0, bot - top, P.cream, ' rx="10"')}<path ${tl(P.oat)} d="${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `M${x0 + i * 30} ${top + 30} L${x0 + i * 30} ${bot - 6}`).join(' ')}"/>
  ${R(x0 - 8, top - 16, x1 - x0 + 16, 26, P.teal, ' rx="6"')}
  ${R(x0 + 20, top + 50, 150, 90, P.sky, ' rx="6"')}<path fill="#fff" class="thin" d="M${x0 + 20} ${top + 50} L${x0 + 170} ${top + 50} L${x0 + 170} ${top + 76} ${[...Array(6)].map((_, i) => `Q${x0 + 170 - i * 25 - 12.5} ${top + 88} ${x0 + 145 - i * 25} ${top + 76}`).join(' ')}Z"/>
  ${at(x0 + 60, top + 140, .45, plantLeafy(P.terra, 1))}${at(x0 + 130, top + 140, .6, mug(P.teal))}
  ${glint(`M${x0 + 40} ${top + 130} L${x0 + 70} ${top + 100}`)}
  ${R(x1 - 70, top + 40, 56, bot - top - 40, P.teal, ' rx="5"')}<circle fill="${P.mustard}" cx="${x1 - 26}" cy="${top + 130}" r="6"/>${R(x1 - 62, top + 52, 40, 36, P.sky, ' class="thin" rx="4"')}
  <path fill="${P.woodDeep}" d="M${x1 - 80} ${bot + 30} L${x1 - 80} ${bot + 6} L${x1 - 4} ${bot + 6} L${x1 - 4} ${bot + 30}Z"/><path fill="${P.woodDeep}" d="M${x1 - 84} ${bot + 6} L${x1} ${bot + 6} L${x1} ${bot - 6} L${x1 - 84} ${bot - 6}Z"/>
  ${R(x0 + 10, top + 164, 160, 12, P.woodDeep, ' rx="4"')}
  ${hats.map(([x, c]) => `<path class="d" d="M${x} ${top + 176} L${x} ${top + 186}"/><g transform="translate(${x} ${top + 216})"><path fill="${c}" d="M-26 0 C-28 -26 -12 -34 0 -34 C12 -34 28 -26 26 0Z"/>${R(-32, -4, 64, 10, c === HAZ ? HAZD : P.mustardDeep, ' rx="5"')}<path fill="${c === HAZ ? '#F6C08E' : P.butter}" class="thin" d="M-5 -33 L5 -33 L4 -2 L-4 -2Z"/></g>`).join('')}
  <g transform="translate(${x0 + 150} ${top + 186})"><path fill="${HAZ}" d="M-22 0 L-8 0 L-6 12 L6 12 L8 0 L22 0 L24 60 L-24 60Z"/><rect class="thin" fill="${P.cream}" x="-24" y="30" width="48" height="8"/><rect class="thin" fill="${P.cream}" x="-24" y="44" width="48" height="8"/></g>
  <circle fill="#fff" cx="${x1 - 120}" cy="${top + 70}" r="22"/><path class="d" d="M${x1 - 120} ${top + 70} L${x1 - 120} ${top + 56} M${x1 - 120} ${top + 70} L${x1 - 110} ${top + 76}"/>
  ${R(x0 + 190, top - 60, 50, 44, P.steel, ' rx="6"')}<path ${tl(P.steelDeep)} d="M${x0 + 198} ${top - 48} L${x0 + 232} ${top - 48} M${x0 + 198} ${top - 38} L${x0 + 232} ${top - 38} M${x0 + 198} ${top - 28} L${x0 + 232} ${top - 28}"/>
  </g>`;
}

// ---- DIG PIT (back: the hole) ---------------------------------------------
export const PIT = { x0: 2880, x1: 3410, top: 1050, bot: 1350 };
const PC = { cx: (PIT.x0 + PIT.x1) / 2, cy: (PIT.top + PIT.bot) / 2, rx: (PIT.x1 - PIT.x0) / 2, ry: (PIT.bot - PIT.top) / 2 };
const pitPath = () => `M${PIT.x0} ${PC.cy} A${PC.rx} ${PC.ry} 0 0 1 ${PIT.x1} ${PC.cy} A${PC.rx} ${PC.ry} 0 0 1 ${PIT.x0} ${PC.cy}Z`;
function pitHole() {
  const { x0, x1, top, bot } = PIT;
  const strata = [1090, 1140].map((y, i) => `M${x0 + 10 + i * 12} ${y} Q${x0 + 180} ${y - 14} ${(x0 + x1) / 2} ${y + 4} Q${x1 - 160} ${y + 16} ${x1 - 10 - i * 12} ${y - 4}`).join(' ');
  const rocks = [[x0 + 90, 1150, 14], [x1 - 90, 1160, 16], [x0 + 200, 1300, 12], [(x0 + x1) / 2 + 40, 1320, 16], [(x0 + x1) / 2 - 80, 1085, 10]]
    .map(([x, y, r]) => `<ellipse fill="${P.warmGreyDeep}" class="thin" cx="${x}" cy="${y}" rx="${r * 1.3}" ry="${r}"/>`).join('');
  const roots = `<path ${tl(P.woodDark, 'stroke-width:5')} d="M${x0 + 70} ${top + 4} Q${x0 + 90} ${top + 40} ${x0 + 74} ${top + 70} M${x0 + 82} ${top + 34} Q${x0 + 110} ${top + 44} ${x0 + 118} ${top + 64} M${x1 - 110} ${top + 4} Q${x1 - 130} ${top + 34} ${x1 - 116} ${top + 60}"/>`;
  const ladder = `<g transform="translate(${x0 + 60} ${top + 10}) rotate(-12)">${R(-4, 0, 12, 250, P.woodDeep, ' rx="4"')}${R(56, 0, 12, 250, P.woodDeep, ' rx="4"')}<path class="d" d="${[34, 90, 146, 202].map((y) => `M8 ${y} L56 ${y}`).join(' ')}"/></g>`;
  const heap = at(x0 - 10, top + 14, 1, `<path fill="${DIRT}" d="M-120 0 Q-100 -60 -50 -70 Q-10 -96 30 -60 Q60 -50 70 0Z"/><path ${tl(DIRTD, 'stroke-width:4')} d="M-80 -30 q8 -8 16 0 M-20 -50 q8 -8 16 0 M20 -24 q8 -8 16 0"/><g transform="rotate(20 10 -60)"><rect fill="${P.woodDeep}" x="4" y="-190" width="10" height="130" rx="4"/><path fill="${P.steel}" d="M-10 -70 L28 -70 L24 -30 Q9 -14 -6 -30Z"/></g>`);
  return `<g id="pit">
  <path fill="${DIRTK}" d="${pitPath()}"/>
  <clipPath id="pit-in"><path d="${pitPath()}"/></clipPath><g clip-path="url(#pit-in)">
  <ellipse class="n" fill="${DIRTD}" cx="${PC.cx}" cy="${PC.cy + 70}" rx="${PC.rx - 30}" ry="${PC.ry - 20}"/>
  <path ${tl('#8A6149', 'stroke-width:5')} d="${strata}"/>${rocks}${roots}</g>
  <path fill="none" d="${pitPath()}"/>
  ${[x0 + 150, x0 + 280, x0 + 410].map((x) => `${R(x - 5, top - 70, 10, 50, P.woodDeep, ' rx="3"')}<path class="n" fill="${HAZ}" d="M${x - 4} ${top - 56} L${x + 4} ${top - 56} L${x + 4} ${top - 46} L${x - 4} ${top - 46}Z"/>`).join('')}
  <path class="tl" style="stroke:${HAZ};stroke-width:6" d="M${x0 + 145} ${top - 52} Q${x0 + 215} ${top - 36} ${x0 + 285} ${top - 52} Q${x0 + 345} ${top - 36} ${x0 + 415} ${top - 52}"/>
  ${ladder}${heap}
  </g>`;
}
/** The pit's near lip (counter layer): the ground edge in front of the dirt, so the pit reads as a hole. */
function pitLip() {
  const { x0, x1 } = PIT, { cy, rx, ry } = PC;
  const edge = `M${x0} ${cy} A${rx} ${ry} 0 0 0 ${x1} ${cy}`;
  return `<path class="n" fill="${SAND}" d="${edge} L${x1 + 20} ${cy} L${x1 + 20} ${cy + ry + 40} L${x0 - 20} ${cy + ry + 40} L${x0 - 20} ${cy}Z"/>
  <path ${tl(SANDD, 'stroke-width:16')} d="M${x0 + 30} ${cy + 60} A${rx - 10} ${ry} 0 0 0 ${x1 - 30} ${cy + 60}" transform="translate(0 12)"/><path fill="none" d="${edge}"/>
  ${[[x0 + 90, cy + ry + 24], [x1 - 110, cy + ry + 18], [(x0 + x1) / 2 + 60, cy + ry + 34]].map(([x, y]) => `<ellipse class="n" fill="${SANDD}" cx="${x}" cy="${y}" rx="10" ry="5"/>`).join('')}`;
}
/** The loose dirt that fills the pit (a PIECE: the engine masks it away to dig). */
function dirtFill() {
  const { x0, x1, top, bot } = PIT;
  const y = top + 90;
  let clumps = '';
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const x = x0 + 60 + rnd() * (x1 - x0 - 120), yy = y + 40 + rnd() * (bot - y - 60);
    clumps += i % 4 === 0 ? `<ellipse class="thin" fill="${P.warmGrey}" cx="${f(x)}" cy="${f(yy)}" rx="${f(7 + rnd() * 6)}" ry="${f(5 + rnd() * 3)}"/>`
      : `<path ${tl(DIRTD, 'stroke-width:4')} d="M${f(x - 8)} ${f(yy)} Q${f(x)} ${f(yy - 8)} ${f(x + 8)} ${f(yy)}"/>`;
  }
  return `<g id="dirt"><clipPath id="pit-clip"><path d="${pitPath()}"/></clipPath><g clip-path="url(#pit-clip)">
  <path fill="${DIRT}" d="M${x0 - 20} ${bot + 20} L${x0 - 20} ${y + 20} ${scallop((x0 + x1) / 2, y + 20, (x1 - x0) / 2 + 20, 50, 16, 9, 180, 360, false).replace(/^M[^Q]*/, '')} L${x1 + 20} ${bot + 20}Z"/>
  <path class="n" fill="#C99A74" d="${scallop((x0 + x1) / 2, y + 26, (x1 - x0) / 2 - 60, 26, 12, 6, 180, 360, false)}Z"/>${clumps}</g>
  <path fill="none" d="${pitPath()}"/>
  ${[[x0 + 140, y - 4], [x1 - 170, y]].map(([x, yy]) => at(x, yy, .8, [-20, 10].map((a, i) => leaf(26, 7, a, i ? P.leaf : P.leafDeep)).join(''))).join('')}</g>`;
}

// ---- WORKSHOP (counter): the workbench and its tool wall -----------------
export const BENCH = { x0: 3740, x1: 4110, top: 880 };
function toolWall() {
  const { x0, x1 } = BENCH, y0 = 600, y1 = BENCH.top - 20;
  let holes = '';
  for (let y = y0 + 24; y < y1 - 10; y += 30) for (let x = x0 + 24; x < x1 - 10; x += 30) holes += `<circle cx="${x}" cy="${y}" r="3.5"/>`;
  // outlines (chalk) where the loose tools hang: saw, hammer, wrench
  const outline = `<g>
    <path class="tl" style="stroke:#fff;stroke-width:4;stroke-dasharray:8 7;opacity:.85" d="M${x0 + 40} ${y0 + 60} L${x0 + 150} ${y0 + 60} L${x0 + 150} ${y0 + 100} L${x0 + 40} ${y0 + 84}Z"/>
    <path class="tl" style="stroke:#fff;stroke-width:4;stroke-dasharray:8 7;opacity:.85" d="M${x0 + 190} ${y0 + 44} L${x0 + 250} ${y0 + 44} L${x0 + 250} ${y0 + 70} L${x0 + 228} ${y0 + 70} L${x0 + 228} ${y0 + 180} L${x0 + 212} ${y0 + 180} L${x0 + 212} ${y0 + 70} L${x0 + 190} ${y0 + 70}Z"/>
    <path class="tl" style="stroke:#fff;stroke-width:4;stroke-dasharray:8 7;opacity:.85" d="M${x0 + 300} ${y0 + 50} a16 16 0 1 1 0.1 0 M${x0 + 300} ${y0 + 82} L${x0 + 300} ${y0 + 180}"/></g>`;
  return `<g id="tool-wall">${R(x0, y0, x1 - x0, y1 - y0, P.woodLight, ' rx="6"')}<g class="n" fill="${P.wood}">${holes}</g>${outline}
  ${R(x0 - 10, y0 - 40, x1 - x0 + 20, 16, P.wood, ' rx="4"')}<path fill="${P.woodDeep}" d="M${x0 + 20} ${y0 - 24} L${x0 + 20} ${y0 + 10} L${x0 + 50} ${y0 - 24}Z M${x1 - 20} ${y0 - 24} L${x1 - 20} ${y0 + 10} L${x1 - 50} ${y0 - 24}Z"/>
  ${at(x0 + 40, y0 - 40, .55, plantLeafy(P.teal, 1))}${at(x1 - 40, y0 - 40, 1, books([[18, 60, P.blue], [16, 70, P.mustard], [20, 56, P.terra]]))}
  ${at(x0 + 150, y0 + 150, 1, `<rect fill="${P.cream}" x="-40" y="-40" width="80" height="60" rx="3"/><path class="n" fill="${P.sky}" d="M-36 -36 L36 -36 L36 16 L-36 16Z"/><path fill="${P.leaf}" class="thin" d="M-36 16 L-36 -4 Q-10 -24 10 -6 Q24 -16 36 -4 L36 16Z"/><path fill="${P.mustard}" class="thin" d="M-18 -4 L-18 -26 L0 -36 L18 -26 L18 -4Z"/><circle fill="${P.berry}" cx="0" cy="-44" r="6"/>`, -4)}
  </g>`;
}
function workbench() {
  const { x0, x1, top } = BENCH;
  return `<g id="workbench">
  <ellipse class="n" fill="${P.ink}" opacity=".1" cx="${(x0 + x1) / 2}" cy="${BB + 2}" rx="${(x1 - x0) / 2 + 10}" ry="10"/>
  ${R(x0 + 20, top + 20, 30, BB - top - 20, P.woodDeep)}${R(x1 - 50, top + 20, 30, BB - top - 20, P.woodDeep)}
  ${R(x0 + 30, BB - 60, x1 - x0 - 60, 16, P.wood, ' rx="4"')}
  ${at(x0 + 110, BB - 60, 1, `<path fill="${P.blue}" d="M-40 0 L-40 -40 L40 -40 L40 0Z"/>${R(-44, -48, 88, 10, P.blueDeep, ' rx="4"')}<ellipse class="n" fill="${P.blueDeep}" cx="0" cy="-20" rx="12" ry="8"/>`)}
  ${at(x1 - 120, BB - 60, 1, `${R(-50, -34, 100, 34, P.woodLight, ' rx="3"')}${R(-46, -58, 92, 24, P.wood, ' rx="3"')}`)}
  ${R(x0 - 6, top, x1 - x0 + 12, 30, P.wood, ' rx="5"')}${R(x0 - 6, top, x1 - x0 + 12, 12, P.woodLight, ' rx="4"')}<path ${tl(P.woodDeep)} d="M${x0 + 60} ${top + 20} L${x0 + 140} ${top + 20} M${x0 + 220} ${top + 20} L${x0 + 300} ${top + 20}"/>
  ${R(x1 - 30, top - 30, 40, 36, P.steelDeep, ' rx="4"')}${R(x1 - 26, top - 44, 32, 16, P.steel, ' rx="3"')}
  </g>`;
}

// ---- COUNTER layer (the back row) ---------------------------------------
const POTTY = { x0: 1210, x1: 1360, top: 700 };
function pottyBody() {
  const { x0, x1, top } = POTTY;
  return `<g id="potty">
  <ellipse class="n" fill="${P.ink}" opacity=".1" cx="${(x0 + x1) / 2}" cy="${BB + 2}" rx="${(x1 - x0) / 2 + 10}" ry="9"/>
  ${R(x0 - 6, BB - 16, x1 - x0 + 12, 16, P.tealDeep, ' rx="4"')}
  ${R(x0, top + 40, x1 - x0, BB - top - 56, P.teal, ' rx="8"')}
  <path fill="#fff" d="M${x0 - 10} ${top + 50} Q${x0 - 10} ${top} ${(x0 + x1) / 2} ${top - 4} Q${x1 + 10} ${top} ${x1 + 10} ${top + 50}Z"/>
  ${R(x1 - 40, top - 40, 16, 40, P.steelDeep, ' rx="4"')}${R(x1 - 46, top - 46, 28, 12, P.steel, ' rx="4"')}
  <path ${tl(P.tealDeep)} d="M${x0 + 10} ${top + 70} L${x0 + 10} ${BB - 30} M${x1 - 10} ${top + 70} L${x1 - 10} ${BB - 30}"/>
  ${R(x0 + 14, top + 58, x1 - x0 - 28, BB - top - 90, P.tealDeep, ' rx="6"')}
  </g>`;
}
/** The toilet door: closed (a crescent moon window) or swung open (foreshortened), showing a seat and a paper roll. */
function pottyDoor(open) {
  const { x0, x1, top } = POTTY, y0 = top + 58, y1 = BB - 32, dx0 = x0 + 14, dx1 = x1 - 14;
  if (!open) {
    return `<g>${R(dx0, y0, dx1 - dx0, y1 - y0, P.teal, ' rx="6"')}<path ${tl(P.tealDeep)} d="M${dx0 + 16} ${y0 + 120} L${dx1 - 16} ${y0 + 120} M${dx0 + 16} ${y0 + 180} L${dx1 - 16} ${y0 + 180}"/>
    <path fill="${P.butter}" d="M${(dx0 + dx1) / 2 + 4} ${y0 + 30} a26 26 0 1 0 22 40 a20 20 0 1 1 -22 -40Z"/>
    ${R(dx1 - 24, y0 + 130, 12, 34, P.steel, ' rx="5"')}<circle fill="${P.leafLight}" class="thin" cx="${dx1 - 18}" cy="${y0 + 110}" r="7"/></g>`;
  }
  const ox = dx0 - 70;
  return `<g>${R(dx0, y0, dx1 - dx0, y1 - y0, '#5E8F8C', ' rx="6"')}
  <path fill="#fff" d="M${(dx0 + dx1) / 2 - 36} ${y1} L${(dx0 + dx1) / 2 - 30} ${y1 - 60} L${(dx0 + dx1) / 2 + 30} ${y1 - 60} L${(dx0 + dx1) / 2 + 36} ${y1}Z"/>
  <ellipse fill="#fff" cx="${(dx0 + dx1) / 2}" cy="${y1 - 64}" rx="42" ry="12"/><ellipse fill="${P.steel}" class="thin" cx="${(dx0 + dx1) / 2}" cy="${y1 - 64}" rx="26" ry="6"/>
  ${R((dx0 + dx1) / 2 - 34, y1 - 170, 68, 70, '#fff', ' rx="10"')}
  <g transform="translate(${dx1 - 22} ${y0 + 110})"><rect fill="${P.steelDeep}" x="-4" y="-30" width="8" height="24" rx="3"/><circle fill="#fff" cx="0" cy="0" r="14"/><circle fill="${P.oat}" class="thin" cx="0" cy="0" r="5"/><path fill="#fff" d="M-14 0 L-14 34 L0 30 L0 0Z"/></g>
  ${at(dx0 + 30, y0 + 70, .5, `<rect fill="${P.rose}" x="-18" y="-40" width="36" height="40" rx="6"/>${leaf(40, 10, -14, P.leaf, 0, -40)}${leaf(34, 9, 20, P.leafDeep, 0, -40)}<circle fill="${P.butter}" cx="0" cy="-86" r="10"/>`)}
  <path fill="${P.teal}" d="M${dx0 + 2} ${y0} L${ox} ${y0 - 22} Q${ox - 12} ${y0 - 20} ${ox - 12} ${y0 - 6} L${ox - 12} ${y1 + 8} Q${ox - 12} ${y1 + 22} ${ox} ${y1 + 22} L${dx0 + 2} ${y1}Z"/>
  <path fill="${P.butter}" d="M${ox + 30} ${y0 + 34} a20 26 0 1 0 16 44 a16 22 0 1 1 -16 -44Z"/>
  ${R(ox + 8, y0 + 140, 10, 34, P.steel, ' rx="5"')}</g>`;
}
const SCAF = { x0: 140, x1: 620, top: 450, decks: [820, 600] };
function scaffold() {
  const { x0, x1, top, decks } = SCAF, xs = [x0, (x0 + x1) / 2, x1];
  let s = '';
  for (const x of xs) s += R(x - 8, top, 16, BB - top, P.steelDeep, ' rx="5"') + R(x - 18, BB - 12, 36, 12, P.char, ' rx="3"');
  for (let y = BB - 57; y > top + 10; y -= 114) s += R(x0 - 10, y - 5, x1 - x0 + 20, 10, P.steel, ' rx="5"');
  s += `<path fill="none" style="stroke:${P.steelDeep};stroke-width:10" class="n" d="M${xs[0]} ${BB - 60} L${xs[1]} ${decks[0] + 30} M${xs[1]} ${BB - 60} L${xs[2]} ${decks[0] + 30}"/>`;
  s += `<path fill="none" d="M${xs[0]} ${BB - 60} L${xs[1]} ${decks[0] + 30} M${xs[1]} ${BB - 60} L${xs[2]} ${decks[0] + 30}" style="stroke-width:3"/>`;
  for (const y of decks) {
    s += `${R(x0 - 16, y, x1 - x0 + 32, 22, P.woodLight, ' rx="4"')}<path ${tl(P.wood)} d="M${x0 + 60} ${y + 2} L${x0 + 60} ${y + 20} M${x0 + 200} ${y + 2} L${x0 + 200} ${y + 20} M${x0 + 340} ${y + 2} L${x0 + 340} ${y + 20}"/>`;
    s += R(x0 - 10, y - 60, x1 - x0 + 20, 10, HAZ, ' rx="5"');
    s += hazard(x0 - 8, y + 22, x1 - x0 + 16, 18);
  }
  // ladder in the right bay
  s += `<g>${R(xs[1] + 60, decks[1] - 6, 12, BB - decks[1], P.wood, ' rx="4"')}${R(xs[1] + 130, decks[1] - 6, 12, BB - decks[1], P.wood, ' rx="4"')}<path class="d" d="${[...Array(8)].map((_, i) => `M${xs[1] + 72} ${decks[1] + 30 + i * 52} L${xs[1] + 130} ${decks[1] + 30 + i * 52}`).join(' ')}"/></g>`;
  // things up on the decks: a radio, a bucket on a rope, paint pots, a plant
  s += at(x0 + 60, decks[0], 1, `${R(-34, -40, 68, 40, P.berry, ' rx="8"')}<circle fill="${P.cream}" cx="-12" cy="-20" r="11"/><circle class="n" fill="${P.berry}" cx="-12" cy="-20" r="4"/>${R(6, -30, 20, 8, P.cream, ' rx="3"')}<path class="d" d="M-24 -40 L-24 -54 L24 -54 L24 -40"/><path class="d" d="M20 -54 L34 -80"/>`);
  s += at(x0 + 300, decks[1], 1, `<path fill="${P.blue}" d="M-26 -48 L26 -48 L22 0 L-22 0Z"/><ellipse fill="${P.blueDeep}" cx="0" cy="-48" rx="26" ry="7"/>`);
  s += at(x0 + 350, decks[1], .8, `<path fill="${P.mustard}" d="M-26 -48 L26 -48 L22 0 L-22 0Z"/><ellipse fill="${P.mustardDeep}" cx="0" cy="-48" rx="26" ry="7"/>`);
  s += `<path class="d" d="M${x1 - 30} ${top} L${x1 - 30} ${top + 90}"/>${R(x1 - 60, top - 20, 60, 20, P.steelDeep, ' rx="6"')}` + at(x1 - 30, top + 130, 1, `<path fill="${P.oat}" d="M-24 -40 L24 -40 L20 0 L-20 0Z"/><path class="d" d="M-24 -40 Q0 -70 24 -40"/>`);
  s += at(x0 + 60, decks[1], .5, plantLeafy(P.terra, 1));
  return `<g id="scaffold">${s}</g>`;
}

// ---- MID layer --------------------------------------------------------------
const LUMBER = { x0: 10, x1: 300 };
function lumberPile() {
  const { x0, x1 } = LUMBER;
  let s = `<ellipse class="n" fill="${P.ink}" opacity=".1" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${(x1 - x0) / 2 + 10}" ry="10"/>`;
  s += R(x0 + 10, MB - 22, 40, 22, P.woodDeep, ' rx="3"') + R(x1 - 50, MB - 22, 40, 22, P.woodDeep, ' rx="3"');
  const cols = [P.woodLight, P.wood, '#F3DABE', P.woodLight, P.wood, '#F3DABE'];
  for (let i = 0; i < 6; i++) {
    const y = MB - 22 - (i + 1) * 24, dx = (i % 2) * 14 - 7;
    s += `${R(x0 + dx, y, x1 - x0 - 14, 24, cols[i], ' rx="4"')}<path ${tl(P.woodDeep)} d="M${x0 + dx + 40} ${y + 12} Q${x0 + dx + 80} ${y + 6} ${x0 + dx + 120} ${y + 12} M${x0 + dx + 170} ${y + 10} L${x0 + dx + 230} ${y + 10}"/>`;
  }
  s += `${R(x0 + 60, MB - 170, 14, 150, P.charHi, ' class="thin" rx="3"')}${R(x1 - 90, MB - 170, 14, 150, P.charHi, ' class="thin" rx="3"')}`;
  // two logs on top
  s += [x0 + 100, x0 + 200].map((x, i) => `<path fill="${P.woodDeep}" d="M${x - 70} ${MB - 206 - i * 4} L${x + 50} ${MB - 206 - i * 4} L${x + 50} ${MB - 170} L${x - 70} ${MB - 170}Z"/><ellipse fill="${P.woodLight}" cx="${x + 50}" cy="${MB - 188 - i * 2}" rx="12" ry="18"/><ellipse class="thin" fill="none" cx="${x + 50}" cy="${MB - 188 - i * 2}" rx="5" ry="9" style="stroke:${P.wood}"/>`).join('');
  return `<g id="lumber">${s}</g>`;
}
const BRICKS = { x0: 1250, x1: 1400 };
function brickPallet() {
  const { x0, x1 } = BRICKS, w = x1 - x0;
  let s = `<ellipse class="n" fill="${P.ink}" opacity=".1" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${w / 2 + 10}" ry="9"/>`;
  s += R(x0, MB - 30, w, 12, P.wood, ' rx="3"') + [x0 + 6, (x0 + x1) / 2 - 14, x1 - 34].map((x) => R(x, MB - 18, 28, 18, P.woodDeep, ' rx="3"')).join('');
  const bw = w / 3;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3 - (r === 4 ? 1 : 0); c++) {
    const x = x0 + c * bw + (r % 2 ? bw / 2 : 0) * (r === 4 ? 1 : 0), y = MB - 30 - (r + 1) * 30;
    s += R(x + 2, y, bw - 4, 28, [P.terra, '#E09A76', P.terraDeep][(r + c) % 3], ' rx="4"');
  }
  s += `<g transform="translate(${x1 + 20} ${MB}) rotate(-14)">${R(-24, -26, 48, 26, P.terra, ' rx="4"')}</g>`;
  return `<g id="bricks">${s}</g>`;
}
const LEVER = { x0: 1590, x1: 1730 };
function leverBox() {
  const { x0, x1 } = LEVER, top = MB - 150;
  return `<g id="lever-box">
  <ellipse class="n" fill="${P.ink}" opacity=".1" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${(x1 - x0) / 2 + 10}" ry="9"/>
  ${R(x0, top, x1 - x0, MB - top, P.mustard, ' rx="10"')}${hazard(x0, MB - 30, x1 - x0, 24)}
  ${R(x0 - 8, top - 6, x1 - x0 + 16, 18, P.mustardDeep, ' rx="6"')}
  <circle fill="${P.leafLight}" cx="${x0 + 34}" cy="${top + 50}" r="15"/><circle class="n" fill="#fff" opacity=".6" cx="${x0 + 30}" cy="${top + 45}" r="4"/>
  <circle fill="${P.berry}" cx="${x0 + 34}" cy="${top + 94}" r="15"/><circle class="n" fill="#fff" opacity=".6" cx="${x0 + 30}" cy="${top + 89}" r="4"/>
  <circle fill="#fff" cx="${x1 - 40}" cy="${top + 56}" r="22"/><path class="d" d="M${x1 - 56} ${top + 56} A16 16 0 0 1 ${x1 - 24} ${top + 56}"/><path class="d" d="M${x1 - 40} ${top + 56} L${x1 - 30} ${top + 44}"/>
  ${R(x1 - 62, top + 92, 44, 16, P.char, ' rx="6"')}
  ${R((x0 + x1) / 2 - 22, top - 20, 44, 18, P.char, ' rx="6"')}
  </g>`;
}
/** The big crane lever: a stick with a round knob, leaning back (up) or pushed forward (down). */
function lever(down) {
  const px = (LEVER.x0 + LEVER.x1) / 2, py = MB - 170, a = down ? 34 : -34;
  return `<g transform="translate(${px} ${py}) rotate(${a})"><rect fill="${P.steelDeep}" x="-9" y="-130" width="18" height="130" rx="8"/><circle fill="${P.berry}" cx="0" cy="-140" r="26"/><circle class="n" fill="#fff" opacity=".55" cx="-8" cy="-148" r="7"/></g>
  <ellipse fill="${P.char}" cx="${px}" cy="${py}" rx="24" ry="10"/>`;
}
const CONES = { x: 1520 };
function coneStack() {
  const one = (y) => `<path fill="${HAZ}" d="M-30 ${y} L-8 ${y - 110} Q0 ${y - 118} 8 ${y - 110} L30 ${y}Z"/><path fill="${P.cream}" class="n" d="M-20 ${y - 46} L20 ${y - 46} L16 ${y - 64} L-16 ${y - 64}Z"/>`;
  return at(CONES.x, MB, 1, `<ellipse class="n" fill="${P.ink}" opacity=".1" cx="0" cy="4" rx="48" ry="8"/>${R(-42, -12, 84, 12, HAZD, ' rx="3"')}${one(-12)}${one(-30)}${one(-48)}`);
}
// Wrecking crane (orange crawler), facing left.
const WR = { x0: 2010, x1: 2390, pivot: [2226, 1116], tip: [1860, 440], ball: [1860, 870], ballR: 66 };
function wreckBody() {
  const { x0, x1 } = WR, t = MB - 74;
  return `<g id="wreck-body">
  <ellipse class="n" fill="${P.ink}" opacity=".12" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${(x1 - x0) / 2 + 20}" ry="12"/>
  ${tracks(x0, x1, MB)}
  ${R(x0 + 80, t - 20, x1 - x0 - 160, 22, P.charDeep, ' rx="4"')}
  <path fill="${HAZ}" d="M${x0 + 150} ${t - 20} L${x0 + 150} ${t - 150} Q${x0 + 150} ${t - 164} ${x0 + 164} ${t - 164} L${x1 - 30} ${t - 164} Q${x1 - 14} ${t - 164} ${x1 - 14} ${t - 148} L${x1 - 14} ${t - 20}Z"/>
  ${hazard(x1 - 90, t - 110, 76, 70)}
  <path ${tl(HAZD)} d="M${x0 + 190} ${t - 120} L${x1 - 110} ${t - 120} M${x0 + 190} ${t - 100} L${x1 - 110} ${t - 100} M${x0 + 190} ${t - 80} L${x1 - 110} ${t - 80}"/>
  ${R(x1 - 70, t - 204, 18, 44, P.steelDeep, ' rx="4"')}
  <path fill="${HAZ}" d="M${x0 + 40} ${t - 20} L${x0 + 40} ${t - 190} Q${x0 + 40} ${t - 210} ${x0 + 60} ${t - 210} L${x0 + 150} ${t - 210} Q${x0 + 166} ${t - 210} ${x0 + 166} ${t - 194} L${x0 + 166} ${t - 20}Z"/>
  <path fill="${P.sky}" d="M${x0 + 56} ${t - 120} L${x0 + 56} ${t - 180} Q${x0 + 56} ${t - 194} ${x0 + 70} ${t - 194} L${x0 + 150} ${t - 194} L${x0 + 150} ${t - 120}Z"/>${glint(`M${x0 + 74} ${t - 136} L${x0 + 104} ${t - 176}`)}
  <circle fill="#FFF6D8" cx="${x0 + 52}" cy="${t - 50}" r="10"/>
  </g>`;
}
function wreckBoom() {
  const [ax, ay] = WR.pivot, [bx, by] = WR.tip;
  return `<g>${boom(ax, ay, bx, by, 30, 16, HAZ, HAZD)}<circle fill="${P.char}" cx="${bx}" cy="${by}" r="22"/><circle fill="${P.steel}" cx="${bx}" cy="${by}" r="9"/><circle fill="${P.char}" cx="${ax}" cy="${ay}" r="20"/><circle fill="${P.steel}" cx="${ax}" cy="${ay}" r="8"/></g>`;
}
function wreckChain() {
  const [bx, by] = WR.tip, end = WR.ball[1] - WR.ballR - 16;
  let s = '';
  for (let y = by + 18, i = 0; y < end; y += 22, i++) s += i % 2 ? R(bx - 4, y, 8, 26, P.steelDeep, ' rx="4"') : `<ellipse fill="none" style="stroke-width:3" cx="${bx}" cy="${y + 13}" rx="9" ry="14"/><ellipse fill="${P.steelDeep}" class="n" cx="${bx}" cy="${y + 13}" rx="0" ry="0"/>`;
  return `<g>${s}</g>`;
}
function wreckBall() {
  const [x, y] = WR.ball, r = WR.ballR;
  return `<g><path fill="${P.steelDeep}" d="M${x - 16} ${y - r + 6} L${x - 12} ${y - r - 20} L${x + 12} ${y - r - 20} L${x + 16} ${y - r + 6}Z"/><circle fill="${P.char}" class="thin" cx="${x}" cy="${y - r - 22}" r="9"/>
  <circle fill="${P.char}" cx="${x}" cy="${y}" r="${r}"/><path class="n" fill="${P.charHi}" d="M${x - r * .7} ${y - r * .1} A${r * .72} ${r * .72} 0 0 1 ${x - r * .1} ${y - r * .7} A${r * .9} ${r * .9} 0 0 0 ${x - r * .7} ${y - r * .1}Z"/>
  ${glint(`M${x - r * .5} ${y - r * .42} Q${x - r * .4} ${y - r * .56} ${x - r * .26} ${y - r * .6}`, 7)}</g>`;
}
// Dump truck (teal cab, orange bed), cab on the left.
const TR = { x0: 2450, x1: 2872, cab1: 2600, wheelY: MB - 46, bedPivot: [2872, MB - 70] };
function truckBody() {
  const { x0, x1, cab1, wheelY } = TR, ch = MB - 98;
  return `<g>
  <ellipse class="n" fill="${P.ink}" opacity=".12" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${(x1 - x0) / 2 + 16}" ry="11"/>
  ${R(x0 + 30, ch, x1 - x0 - 30, 32, P.char, ' rx="6"')}
  <path fill="${P.teal}" d="M${x0} ${ch + 30} L${x0} ${ch - 70} Q${x0} ${ch - 86} ${x0 + 14} ${ch - 90} L${x0 + 40} ${ch - 170} Q${x0 + 46} ${ch - 184} ${x0 + 62} ${ch - 184} L${cab1 - 10} ${ch - 184} Q${cab1} ${ch - 184} ${cab1} ${ch - 172} L${cab1} ${ch + 30}Z"/>
  <path fill="${P.sky}" d="M${x0 + 24} ${ch - 96} L${x0 + 50} ${ch - 164} L${cab1 - 16} ${ch - 164} L${cab1 - 16} ${ch - 96}Z"/>${glint(`M${x0 + 64} ${ch - 110} L${x0 + 84} ${ch - 150} M${x0 + 84} ${ch - 108} L${x0 + 98} ${ch - 138}`)}
  <path class="d" d="M${x0 + 80} ${ch - 80} L${x0 + 80} ${ch + 10}"/>${R(x0 + 90, ch - 60, 24, 8, P.tealDeep, ' rx="4"')}
  ${R(x0 - 12, ch + 10, 40, 22, P.char, ' rx="6"')}<circle fill="#FFF6D8" cx="${x0 + 10}" cy="${ch - 50}" r="12"/>
  ${R(x0 + 4, ch - 30, 26, 44, P.tealDeep, ' rx="4"')}<path ${tl(P.teal)} d="M${x0 + 10} ${ch - 20} L${x0 + 24} ${ch - 20} M${x0 + 10} ${ch - 8} L${x0 + 24} ${ch - 8} M${x0 + 10} ${ch + 4} L${x0 + 24} ${ch + 4}"/>
  ${R(cab1 - 10, ch - 184, 16, 20, P.mustard, ' rx="5"')}
  <path fill="${P.char}" d="M${x0 + 20} ${ch + 32} A60 60 0 0 1 ${x0 + 140} ${ch + 32}Z"/><path fill="${P.char}" d="M${x1 - 200} ${ch + 32} A60 60 0 0 1 ${x1 - 10} ${ch + 32}Z"/>
  ${wheel(x0 + 80, wheelY, 46)}${wheel(x1 - 150, wheelY, 46)}${wheel(x1 - 58, wheelY, 46)}
  </g>`;
}
function truckBed(state) {
  const { cab1, x1, bedPivot } = TR, [px, py] = bedPivot, x0 = cab1 + 8, top = py - 132;
  const ang = { down: 0, full: 0, tilt: 18, up: 38 }[state];
  const ram = ang ? `<path fill="${P.steel}" d="M${x0 + 60} ${py + 6} L${x0 + 76} ${py + 6} L${f(x0 + 90 + ang * 1.6)} ${f(py - ang * 5.2)} L${f(x0 + 74 + ang * 1.6)} ${f(py - ang * 5.2)}Z"/>` : '';
  const load = state === 'full' ? `<path fill="${DIRT}" d="M${x0 + 10} ${top + 8} ${scallop((x0 + x1) / 2, top + 8, (x1 - x0) / 2 - 8, 44, 10, 8, 180, 360, false).slice(1).replace(/^[^Q]*/, '')} L${x1 - 6} ${top + 8}Z"/><path class="n" fill="#C99A74" d="${scallop((x0 + x1) / 2, top + 6, (x1 - x0) / 2 - 50, 24, 8, 5, 200, 340, false)}Z"/>` : '';
  const bed = `${load}<path fill="${HAZ}" d="M${x0} ${top} L${x1 + 6} ${top - 10} L${x1} ${py} L${x0 + 24} ${py}Z"/>
    <path ${tl(HAZD)} d="M${x0 + 60} ${top + 4} L${x0 + 66} ${py - 6} M${x0 + 120} ${top + 2} L${x0 + 124} ${py - 6} M${x0 + 180} ${top} L${x0 + 182} ${py - 6}"/>
    ${R(x0 - 8, top - 12, x1 - x0 + 22, 18, HAZD, ' rx="6"')}${R(x1 - 10, top - 4, 20, py - top - 4, HAZD, ' rx="5"')}
    <path fill="${HAZ}" d="M${x0 - 6} ${top - 12} L${x0 - 6} ${top - 44} Q${x0 - 6} ${top - 52} ${x0 + 4} ${top - 50} L${x0 + 40} ${top - 12}Z"/>`;
  return `<g>${ram}<g transform="rotate(${ang} ${px} ${py})">${bed}</g><circle fill="${P.char}" cx="${px}" cy="${py}" r="12"/><circle fill="${P.steel}" class="thin" cx="${px}" cy="${py}" r="5"/></g>`;
}
// Excavator (yellow), cab on the left facing the pit.
const EX = { x0: 3430, x1: 3760, pivot: [3500, 1110], elbow: [3270, 840], tip: [3110, 1050] };
function excavatorBody() {
  const { x0, x1 } = EX, t = MB - 74;
  return `<g>
  <ellipse class="n" fill="${P.ink}" opacity=".12" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${(x1 - x0) / 2 + 20}" ry="12"/>
  ${tracks(x0, x1, MB)}
  ${R(x0 + 70, t - 20, x1 - x0 - 140, 22, P.charDeep, ' rx="4"')}
  <path fill="${P.mustard}" d="M${x0 + 120} ${t - 20} L${x0 + 120} ${t - 132} Q${x0 + 120} ${t - 146} ${x0 + 134} ${t - 146} L${x1 - 20} ${t - 146} Q${x1 - 6} ${t - 146} ${x1 - 6} ${t - 132} L${x1 - 6} ${t - 20}Z"/>
  ${hazard(x1 - 70, t - 96, 64, 60, P.mustard, P.char, 30)}
  <path ${tl(P.mustardDeep)} d="M${x0 + 170} ${t - 110} L${x1 - 90} ${t - 110} M${x0 + 170} ${t - 90} L${x1 - 90} ${t - 90} M${x0 + 170} ${t - 70} L${x1 - 90} ${t - 70}"/>
  ${R(x1 - 60, t - 190, 16, 46, P.steelDeep, ' rx="4"')}
  <path fill="${P.mustard}" d="M${x0 + 20} ${t - 20} L${x0 + 20} ${t - 200} Q${x0 + 20} ${t - 222} ${x0 + 42} ${t - 222} L${x0 + 130} ${t - 222} Q${x0 + 150} ${t - 222} ${x0 + 150} ${t - 202} L${x0 + 150} ${t - 20}Z"/>
  <path fill="${P.sky}" d="M${x0 + 36} ${t - 120} L${x0 + 36} ${t - 192} Q${x0 + 36} ${t - 206} ${x0 + 50} ${t - 206} L${x0 + 134} ${t - 206} L${x0 + 134} ${t - 120}Z"/>${glint(`M${x0 + 54} ${t - 140} L${x0 + 84} ${t - 186}`)}
  ${R(x0 + 14, t - 232, 142, 16, P.mustardDeep, ' rx="6"')}<circle fill="${HAZ}" cx="${x0 + 120}" cy="${t - 240}" r="11"/>
  <circle fill="#FFF6D8" cx="${x0 + 34}" cy="${t - 50}" r="10"/>
  </g>`;
}
function excavatorArm() {
  const [ax, ay] = EX.pivot, [ex, ey] = EX.elbow, [tx, ty] = EX.tip;
  const seg = (x0, y0, x1, y1, w0, w1) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    return `M${f(x0 + nx * w0)} ${f(y0 + ny * w0)} L${f(x1 + nx * w1)} ${f(y1 + ny * w1)} L${f(x1 - nx * w1)} ${f(y1 - ny * w1)} L${f(x0 - nx * w0)} ${f(y0 - ny * w0)}Z`;
  };
  const cyl = (x0, y0, x1, y1) => `<path fill="${P.steel}" d="${seg(x0, y0, x1, y1, 7, 7)}"/><path fill="${P.char}" d="${seg(x0, y0, x0 + (x1 - x0) * .45, y0 + (y1 - y0) * .45, 10, 10)}"/>`;
  return `<g>
  ${cyl(ax + 40, ay + 30, (ax + ex) / 2 + 10, (ay + ey) / 2 + 20)}
  <path fill="${P.mustard}" d="${seg(ax, ay, ex, ey, 30, 24)}"/><path ${tl(P.mustardDeep)} d="M${f(ax - 20)} ${f(ay - 30)} L${f(ex + 4)} ${f(ey + 30)}"/>
  <path fill="${P.mustard}" d="${seg(ex, ey, tx, ty, 22, 16)}"/>
  ${cyl(ex + 20, ey - 30, tx + 34, ty - 40)}
  <circle fill="${P.mustardDeep}" cx="${ex}" cy="${ey}" r="24"/><circle fill="${P.steel}" cx="${ex}" cy="${ey}" r="9"/>
  <circle fill="${P.char}" cx="${ax}" cy="${ay}" r="22"/><circle fill="${P.steel}" cx="${ax}" cy="${ay}" r="9"/>
  <circle fill="${P.char}" cx="${tx}" cy="${ty}" r="16"/><circle fill="${P.steel}" cx="${tx}" cy="${ty}" r="6"/>
  </g>`;
}
function excavatorBucket(full) {
  const [x, y] = EX.tip;
  const teeth = [0, 1, 2, 3].map((i) => `<path fill="${P.steel}" class="thin" d="M${x - 88 + i * 0} ${y + 52 + i * 14} L${x - 108} ${y + 58 + i * 14} L${x - 88} ${y + 64 + i * 14}Z"/>`).join('');
  const load = full ? `<path fill="${DIRT}" d="M${x - 84} ${y + 30} ${scallop(x - 44, y + 30, 46, 30, 7, 7, 180, 360, false).slice(1).replace(/^[^Q]*/, '')} L${x} ${y + 30}Z"/><circle class="thin" fill="${P.warmGrey}" cx="${x - 40}" cy="${y + 10}" r="8"/>` : '';
  return `<g>${load}<path fill="${P.char}" d="M${x + 8} ${y - 6} L${x + 14} ${y + 40} Q${x + 10} ${y + 110} ${x - 50} ${y + 116} Q${x - 86} ${y + 116} ${x - 90} ${y + 96} L${x - 90} ${y + 36} Q${x - 50} ${y + 26} ${x - 10} ${y + 10}Z"/>
  <path class="n" fill="${P.charHi}" d="M${x - 4} ${y + 40} Q${x - 4} ${y + 94} ${x - 50} ${y + 100} L${x - 50} ${y + 90} Q${x - 14} ${y + 84} ${x - 14} ${y + 40}Z"/>${teeth}
  <circle fill="${P.steel}" cx="${x}" cy="${y}" r="7"/></g>`;
}
// Cement mixer: a stand on two wheels, the drum tilted mouth-up-left.
const MX = { x0: 3790, x1: 4090, drum: [3950, 1110], ang: -28, mouth: [3858, 1016] };
function mixerStand() {
  const { x0, x1 } = MX, [cx, cy] = MX.drum;
  return `<g>
  <ellipse class="n" fill="${P.ink}" opacity=".12" cx="${(x0 + x1) / 2}" cy="${MB + 4}" rx="${(x1 - x0) / 2}" ry="10"/>
  <path fill="${P.blue}" d="M${cx - 90} ${MB - 56} L${cx - 40} ${cy + 20} L${cx - 20} ${cy + 20} L${cx - 66} ${MB - 56}Z M${cx + 90} ${MB - 56} L${cx + 40} ${cy + 20} L${cx + 20} ${cy + 20} L${cx + 66} ${MB - 56}Z"/>
  ${R(x0, MB - 76, x1 - x0, 22, P.blueDeep, ' rx="6"')}${R(x0 - 40, MB - 70, 50, 12, P.blueDeep, ' rx="5"')}<circle fill="${P.char}" cx="${x0 - 42}" cy="${MB - 64}" r="11"/>
  ${wheel(x0 + 60, MB - 38, 38)}${wheel(x1 - 60, MB - 38, 38)}
  ${R(x1 - 70, cy - 20, 70, 84, P.mustard, ' rx="8"')}<path ${tl(P.mustardDeep)} d="M${x1 - 58} ${cy} L${x1 - 12} ${cy} M${x1 - 58} ${cy + 16} L${x1 - 12} ${cy + 16} M${x1 - 58} ${cy + 32} L${x1 - 12} ${cy + 32}"/>
  <circle fill="${P.char}" cx="${cx}" cy="${cy}" r="20"/>
  </g>`;
}
function mixerDrum(frame) {
  const [cx, cy] = MX.drum, id = `drum${frame}`;
  // the drum in its own frame (x along the drum axis, mouth at -x)
  const body = `M-110 -52 L-150 -40 Q-160 0 -150 40 L-110 52 Q-40 92 60 80 Q120 70 120 0 Q120 -70 60 -80 Q-40 -92 -110 -52Z`;
  let stripes = '';
  for (let i = -3; i < 6; i++) { const o = i * 70 + frame * 17.5; stripes += `<path fill="${P.cream}" d="M${o - 110} 100 L${o - 60} -100 L${o - 30} -100 L${o - 80} 100Z"/>`; }
  return `<g transform="translate(${cx} ${cy}) rotate(${MX.ang})"><clipPath id="${id}"><path d="${body}"/></clipPath>
  <path fill="${HAZ}" d="${body}"/><g class="n" clip-path="url(#${id})">${stripes}<path fill="${HAZD}" d="M-160 -100 L-110 -100 L-110 100 L-160 100Z"/></g><path fill="none" d="${body}"/>
  <ellipse fill="${P.charDeep}" cx="-152" cy="0" rx="14" ry="38"/><ellipse fill="${HAZD}" class="thin" fill-opacity="0" cx="-152" cy="0" rx="14" ry="38"/>
  ${R(116, -14, 26, 28, P.char, ' rx="6"')}</g>`;
}

// ---- FRONT layer: the lunch bench and foreground clutter ----------------
const BENCHSEAT = { x0: 1430, x1: 1700, y: 1372 };
function lunchBench() {
  const { x0, x1, y } = BENCHSEAT;
  return `<g id="lunch-bench"><ellipse class="n" fill="${P.ink}" opacity=".1" cx="${(x0 + x1) / 2}" cy="${y + 80}" rx="${(x1 - x0) / 2 + 10}" ry="9"/>
  ${R(x0 + 24, y + 10, 24, 70, P.woodDeep, ' rx="4"')}${R(x1 - 48, y + 10, 24, 70, P.woodDeep, ' rx="4"')}
  ${R(x0, y - 8, x1 - x0, 24, P.wood, ' rx="6"')}${R(x0, y - 8, x1 - x0, 10, P.woodLight, ' rx="5"')}<path ${tl(P.woodDeep)} d="M${x0 + 90} ${y + 8} L${x0 + 170} ${y + 8}"/></g>`;
}
function foreground() {
  const tire = at(-40, 1560, 1, `<ellipse fill="${P.char}" cx="0" cy="-70" rx="90" ry="70"/><ellipse fill="${P.charDeep}" cx="0" cy="-74" rx="44" ry="30"/><path ${tl(P.charHi, 'stroke-width:6')} d="M-70 -110 Q-40 -136 0 -138"/>`);
  const pipes = at(4140, 1560, 1, [[-80, -40, P.blue], [0, -40, P.steel], [-40, -104, P.leafLight]].map(([x, y, c]) => `<circle fill="${c}" cx="${x}" cy="${y}" r="40"/><circle fill="${P.cream}" class="thin" cx="${x}" cy="${y}" r="26"/>`).join(''));
  const cone = (x, y, s) => at(x, y, s, `${R(-34, -12, 68, 12, HAZD, ' rx="3"')}<path fill="${HAZ}" d="M-26 -12 L-8 -110 Q0 -118 8 -110 L26 -12Z"/><path fill="${P.cream}" class="n" d="M-18 -50 L18 -50 L14 -70 L-14 -70Z"/>`);
  return tire + pipes + cone(2330, 1570, 1) + cone(2400, 1580, .85) + cone(880, 1580, .9);
}

// ---- TOWER CRANE pieces (front) ------------------------------------------
// The operator's cab: a big box hanging off the jib beside the mast top, with a
// see-through window (a character in the crane-cab seat shows through it; the
// cab's walls hide their legs). The cab's inside (back wall, seat) is drawn in
// the back layer (craneCabInside), behind the character.
const CAB = { x0: TC.x + 20, x1: TC.x + 300, y0: TC.cabY - 4, y1: 690, wx0: TC.x + 44, wx1: TC.x + 276, wy0: TC.cabY + 24, wy1: 470 };
function craneCab() {
  const { x0, x1, y0, y1, wx0, wx1, wy0, wy1 } = CAB;
  const outer = `M${x0 + 18} ${y0} L${x1 - 18} ${y0} Q${x1} ${y0} ${x1} ${y0 + 18} L${x1} ${y1 - 18} Q${x1} ${y1} ${x1 - 18} ${y1} L${x0 + 18} ${y1} Q${x0} ${y1} ${x0} ${y1 - 18} L${x0} ${y0 + 18} Q${x0} ${y0} ${x0 + 18} ${y0}Z`;
  const hole = `M${wx0 + 12} ${wy0} L${wx1 - 12} ${wy0} Q${wx1} ${wy0} ${wx1} ${wy0 + 12} L${wx1} ${wy1 - 12} Q${wx1} ${wy1} ${wx1 - 12} ${wy1} L${wx0 + 12} ${wy1} Q${wx0} ${wy1} ${wx0} ${wy1 - 12} L${wx0} ${wy0 + 12} Q${wx0} ${wy0} ${wx0 + 12} ${wy0}Z`;
  return `<g><path fill="${P.mustard}" fill-rule="evenodd" d="${outer} ${hole}"/>
  <path fill="${P.sky}" class="n" opacity=".16" d="${hole}"/>
  ${glint(`M${wx0 + 26} ${wy1 - 40} L${wx0 + 76} ${wy0 + 40}`)}${glint(`M${wx0 + 58} ${wy1 - 30} L${wx0 + 92} ${wy1 - 90}`)}
  ${R(x0 + 14, wy1 + 40, x1 - x0 - 28, 16, P.mustardDeep, ' rx="6"')}${R(x0 + 14, wy1 + 90, x1 - x0 - 28, 16, P.mustardDeep, ' rx="6"')}
  ${bolt(x0 + 34, y1 - 30)}${bolt(x1 - 34, y1 - 30)}
  ${R(x0 - 6, y1 - 16, x1 - x0 + 12, 22, P.char, ' rx="7"')}</g>`;
}
/** The cab's inside (back layer): a darker back wall and the operator's seat. */
function craneCabInside() {
  const { wx0, wx1, wy0, wy1 } = CAB;
  const cx = (wx0 + wx1) / 2;
  return `<g id="crane-cab-inside">${R(wx0 - 4, wy0 - 4, wx1 - wx0 + 8, wy1 - wy0 + 8, P.mustardDeep)}
  ${R(cx - 70, wy1 - 150, 140, 150, P.charDeep, ' rx="22"')}${R(cx - 56, wy1 - 136, 112, 120, P.char, ' rx="16"')}
  <circle fill="${P.berry}" cx="${wx1 - 36}" cy="${wy0 + 40}" r="10"/><circle fill="${P.leaf}" cx="${wx1 - 36}" cy="${wy0 + 72}" r="10"/></g>`;
}
function craneJib() {
  const { x, jibY0: y0, jibY1: y1, jibX0: L, jibX1: Rr } = TC;
  let truss = '';
  for (let xx = L + 10; xx < Rr - 40; xx += 44) truss += `M${xx} ${y1} L${xx + 22} ${y0} L${xx + 44} ${y1} `;
  const apex = y0 - 120;
  return `<g>
  <path fill="${P.mustard}" d="M${x - 34} ${y0} L${x - 8} ${apex} L${x + 8} ${apex} L${x + 34} ${y0}Z"/><path fill="${P.sky}" class="n" d="M${x - 16} ${y0 - 6} L${x - 3} ${apex + 30} L${x + 3} ${apex + 30} L${x + 16} ${y0 - 6}Z"/>
  <circle fill="${P.berry}" cx="${x}" cy="${apex - 8}" r="11"/><circle class="n" fill="#fff" opacity=".6" cx="${x - 3}" cy="${apex - 11}" r="3"/>
  <path class="d" d="M${x} ${apex} L${L + 30} ${y0} M${x} ${apex} L${x - 500} ${y0} M${x} ${apex} L${Rr - 20} ${y0}"/>
  <path ${tl(P.mustardDeep, 'stroke-width:6')} d="${truss}"/>
  ${R(L, y0 - 7, Rr - L, 14, P.mustard, ' rx="5"')}${R(L, y1 - 7, Rr - L, 14, P.mustard, ' rx="5"')}
  ${R(L - 14, y0 - 12, 20, y1 - y0 + 24, P.mustardDeep, ' rx="5"')}
  ${R(Rr - 130, y1 + 4, 110, 40, P.warmGrey, ' rx="5"')}${R(Rr - 130, y1 + 44, 110, 40, P.warmGreyDeep, ' rx="5"')}<path ${tl(P.warmGreyDeep)} d="M${Rr - 75} ${y1 + 8} L${Rr - 75} ${y1 + 40}"/>
  ${R(x + 160, y0 - 34, 70, 30, P.steelDeep, ' rx="5"')}
  ${at(Rr - 200, y0 - 6, 1, `<path fill="${P.woodDeep}" d="M-34 0 Q-36 -26 0 -28 Q36 -26 34 0Z"/><path ${tl(P.woodDark)} d="M-28 -10 L28 -14 M-24 -20 L24 -16"/><circle fill="${P.butter}" cx="-10" cy="-30" r="10"/><circle fill="${P.butter}" cx="10" cy="-30" r="10"/><circle class="ink" cx="-12" cy="-32" r="2.2"/><circle class="ink" cx="12" cy="-32" r="2.2"/><path fill="${HAZ}" class="thin" d="M-6 -28 L-14 -24 L-6 -22Z M14 -28 L6 -24 L14 -22Z"/>`)}
  ${bird(Rr - 260, y0 - 10, P.blue, .9, true)}
  </g>`;
}
function craneTrolley() {
  const { trolleyX: x, jibY1: y } = TC;
  return `<g>${R(x - 36, y + 6, 72, 26, P.char, ' rx="6"')}<circle fill="${P.charHi}" cx="${x - 20}" cy="${y + 4}" r="9"/><circle fill="${P.charHi}" cx="${x + 20}" cy="${y + 4}" r="9"/>${R(x - 30, y + 26, 60, 12, P.mustardDeep, ' rx="4"')}</g>`;
}
const CABLE_TOP = TC.jibY1 + 38;
function craneCable() {
  const x = TC.trolleyX;
  return `<g><path fill="none" style="stroke-width:3.5" d="M${x - 8} ${CABLE_TOP} L${x - 8} ${TC.hookY} M${x + 8} ${CABLE_TOP} L${x + 8} ${TC.hookY}"/></g>`;
}
function craneHook() {
  const x = TC.trolleyX, y = TC.hookY;
  return `<g>${R(x - 30, y, 60, 50, P.mustard, ' rx="10"')}${hazard(x - 30, y + 18, 60, 14, P.mustard, P.char, 20)}<circle fill="${P.char}" cx="${x}" cy="${y + 10}" r="6"/>
  <path fill="none" style="stroke-width:16;stroke:${P.ink}" d="M${x} ${y + 50} L${x} ${y + 76} Q${x} ${y + 110} ${x + 26} ${y + 100} Q${x + 38} ${y + 92} ${x + 30} ${y + 80}"/>
  <path class="n" fill="none" style="stroke-width:9;stroke:${P.steel}" d="M${x} ${y + 50} L${x} ${y + 76} Q${x} ${y + 110} ${x + 26} ${y + 100} Q${x + 38} ${y + 92} ${x + 30} ${y + 80}"/></g>`;
}

// ---------------------------------------------------------------------------
const toW = (x, y) => [+(x * ART_SCALE).toFixed(1), +(y * ART_SCALE).toFixed(1)];
export const ROOM = {
  id: 'site',
  offset: [0, 0],
  canvas: { x: -100, y: -100, w: 3080, h: 1200 },
  width: 2880,
  defs: '',
  layers: [
    { id: 'back', baseline: 0, opaque: true,
      art: () => `${sky()}${fence()}${fenceStuffBuild()}${floodlight(760, 560)}${floodlight(3560, 560)}${ground()}${deck()}${yardClutter()}${pitHole()}
        ${craneMast()}${craneCabInside()}${steelFrame()}${siteOffice()}${toolWall()}` },
    { id: 'counter', baseline: 728,
      art: () => `${pitLip()}${scaffold()}${pottyBody()}${workbench()}` },
    // P2c.3: the dump truck and the excavator body are only pieces (they drive), never baked into the layer.
    { id: 'mid', baseline: 903,
      art: () => `${lumberPile()}${brickPallet()}${coneStack()}${leverBox()}${mixerStand()}` },
    { id: 'front', baseline: 1000,
      art: () => `${lunchBench()}${foreground()}` },
  ],
  // Pieces (variants[0] = default; all variants share one box). Pivots are art units.
  pieces: [
    { id: 'dirt', layer: 'back', variants: { full: dirtFill } },
    { id: 'potty-door', layer: 'counter', variants: { closed: () => pottyDoor(false), open: () => pottyDoor(true) }, taps: ['closed', 'open'], pivot: [POTTY.x0 + 14, POTTY.top + 58] },
    { id: 'crane-lever', layer: 'mid', variants: { up: () => lever(false), down: () => lever(true) }, taps: ['up', 'down'], pivot: [(LEVER.x0 + LEVER.x1) / 2, MB - 170], controls: 'crane-hook' },
    // P2c.2 fix (q62.25): the wrecking crane's crawler is its own piece, so it can drive (boom, chain and ball ride along).
    { id: 'wreck-body', layer: 'mid', variants: { still: wreckBody } },
    { id: 'wreck-boom', layer: 'mid', variants: { still: wreckBoom }, pivot: WR.pivot },
    { id: 'wreck-chain', layer: 'mid', variants: { still: wreckChain }, pivot: WR.tip },
    { id: 'wreck-ball', layer: 'mid', variants: { still: wreckBall }, pivot: WR.tip },
    { id: 'dump-truck', layer: 'mid', variants: { still: truckBody } },
    { id: 'truck-bed', layer: 'mid', variants: { down: () => truckBed('down'), full: () => truckBed('full'), tilt: () => truckBed('tilt'), up: () => truckBed('up') }, taps: ['down', 'up'], pivot: TR.bedPivot },
    { id: 'excavator', layer: 'mid', variants: { still: excavatorBody } },
    { id: 'excavator-arm', layer: 'mid', variants: { still: excavatorArm }, pivot: EX.pivot },
    { id: 'excavator-bucket', layer: 'mid', variants: { empty: () => excavatorBucket(false), full: () => excavatorBucket(true) }, pivot: EX.tip },
    { id: 'mixer-drum', layer: 'mid', variants: { spin0: () => mixerDrum(0), spin1: () => mixerDrum(1), spin2: () => mixerDrum(2), spin3: () => mixerDrum(3) }, pivot: MX.drum },
    { id: 'crane-jib', layer: 'front', variants: { still: craneJib }, pivot: [TC.x, TC.jibY0] },
    { id: 'crane-cab', layer: 'front', variants: { still: craneCab } },
    { id: 'crane-trolley', layer: 'front', variants: { still: craneTrolley } },
    { id: 'crane-cable', layer: 'front', variants: { still: craneCable }, pivot: [TC.trolleyX, CABLE_TOP] },
    { id: 'crane-hook', layer: 'front', variants: { still: craneHook }, pivot: [TC.trolleyX, TC.hookY] },
  ],
  surfaces: [
    { id: 'build-deck', layer: 'back', seg: [DECK.x0, DECK.x1, DECK.rest] },
    { id: 'scaffold-1', layer: 'counter', seg: [SCAF.x0 - 10, SCAF.x1 + 10, SCAF.decks[0]] },
    { id: 'scaffold-2', layer: 'counter', seg: [SCAF.x0 - 10, SCAF.x1 + 10, SCAF.decks[1]] },
    { id: 'frame-1', layer: 'back', seg: [1710, 2130, 866] }, { id: 'frame-2', layer: 'back', seg: [1710, 2130, 696] }, { id: 'frame-3', layer: 'back', seg: [1710, 1930, 526] },
    { id: 'office-shelf', layer: 'back', seg: [OFF.x0 + 20, OFF.x0 + 170, OFF.top + 140] },
    { id: 'tool-shelf', layer: 'back', seg: [BENCH.x0, BENCH.x1, 560] },
    { id: 'workbench', layer: 'counter', seg: [BENCH.x0, BENCH.x1 - 40, BENCH.top] },
    { id: 'workbench-low', layer: 'counter', seg: [BENCH.x0 + 40, BENCH.x1 - 40, BB - 60] },
    { id: 'lumber-top', layer: 'mid', seg: [LUMBER.x0 + 10, LUMBER.x1 - 20, MB - 206] },
    { id: 'brick-top', layer: 'mid', seg: [BRICKS.x0, BRICKS.x1, MB - 180] },
    { id: 'lever-box', layer: 'mid', seg: [LEVER.x0, LEVER.x1, MB - 156] },
    { id: 'pit-floor', layer: 'back', seg: [PIT.x0 + 120, PIT.x1 - 120, PIT.bot - 10] },
    { id: 'bench', layer: 'front', seg: [BENCHSEAT.x0 + 10, BENCHSEAT.x1 - 10, BENCHSEAT.y - 8] },
    { id: 'truck-bed', layer: 'mid', seg: [TR.cab1 + 30, TR.x1 - 20, TR.bedPivot[1] - 132], inside: 'truck-bed:down' },
  ],
  seats: [
    { id: 'excavator-cab', layer: 'mid', at: [EX.x0 + 86, MB - 110] },
    // Inside the cab: sorted at the counter depth, so the cab (a front piece) draws over the sitter and its window shows them.
    { id: 'crane-cab', layer: 'counter', at: [(CAB.wx0 + CAB.wx1) / 2, 550] },
    { id: 'truck-cab', layer: 'mid', at: [TR.x0 + 80, MB - 110] },
    { id: 'wreck-cab', layer: 'mid', at: [WR.x0 + 102, MB - 110] },
    { id: 'bench-1', layer: 'front', at: [BENCHSEAT.x0 + 80, BENCHSEAT.y - 8] }, { id: 'bench-2', layer: 'front', at: [BENCHSEAT.x1 - 80, BENCHSEAT.y - 8] },
    { id: 'scaffold-sit', layer: 'counter', at: [SCAF.x0 + 170, SCAF.decks[0]] },
  ],
  slots: [
    { id: 'crane-hook', kind: 'hook', layer: 'front', at: [TC.trolleyX + 26, TC.hookY + 104], piece: 'crane-hook' },
    { id: 'crane-lever', kind: 'lever', layer: 'mid', at: [(LEVER.x0 + LEVER.x1) / 2, MB - 310], piece: 'crane-lever' },
    { id: 'wreck-ball', kind: 'wrecking-ball', layer: 'mid', at: WR.ball, piece: 'wreck-ball' },
    { id: 'mixer-mouth', kind: 'mixer', layer: 'mid', at: MX.mouth, box: [MX.mouth[0] - 40, MX.mouth[1] - 50, 90, 90], piece: 'mixer-drum' },
    { id: 'mixer-pour', kind: 'pour', layer: 'mid', at: [MX.mouth[0] - 60, MB] },
    { id: 'truck-bed', kind: 'truck-bed', layer: 'mid', at: [(TR.cab1 + TR.x1) / 2, TR.bedPivot[1] - 132], box: [TR.cab1 + 10, TR.bedPivot[1] - 190, TR.x1 - TR.cab1 - 10, 190], piece: 'truck-bed' },
    { id: 'excavator-bucket', kind: 'bucket', layer: 'mid', at: [EX.tip[0] - 44, EX.tip[1] + 60], piece: 'excavator-bucket' },
    { id: 'dig-pit', kind: 'dig', layer: 'back', box: [PIT.x0 + 30, PIT.top - 10, PIT.x1 - PIT.x0 - 60, PIT.bot - PIT.top + 10], piece: 'dirt' },
    { id: 'potty', kind: 'door', layer: 'counter', at: [(POTTY.x0 + POTTY.x1) / 2, BB - 30], piece: 'potty-door' },
    { id: 'bench-saw', kind: 'tool', layer: 'counter', at: [BENCH.x0 + 60, BENCH.top], tool: 'saw' },
    { id: 'bench-drill', kind: 'tool', layer: 'counter', at: [BENCH.x0 + 150, BENCH.top], tool: 'drill' },
    { id: 'bench-hammer', kind: 'tool', layer: 'counter', at: [BENCH.x0 + 225, BENCH.top], tool: 'hammer' },
    { id: 'bench-brushes', kind: 'tool', layer: 'counter', at: [BENCH.x0 + 290, BENCH.top], tool: 'paintbrush' },
    { id: 'bench-wrench', kind: 'tool', layer: 'counter', at: [BENCH.x0 + 60, BB - 60], tool: 'wrench' },
    { id: 'saw-table', kind: 'saw', layer: 'counter', at: [BENCH.x0 + 100, BENCH.top], box: [BENCH.x0, BENCH.top - 60, 200, 60] },
    ...[0, 1, 2].map((i) => ({ id: `tool-shelf-${i + 1}`, kind: 'paint', layer: 'back', at: [BENCH.x0 + 140 + i * 60, 560] })),
    ...[[PIT.x0 + 110, 1220], [PIT.x0 + 240, 1320], [PIT.x0 + 390, 1200], [PIT.x0 + 200, 1160], [PIT.x1 - 140, 1300], [PIT.x0 + 310, 1260]].map(([x, y], i) => ({ id: `treasure-${i + 1}`, kind: 'treasure', layer: 'back', at: [x, y] })),
    { id: 'build-origin', kind: 'grid', layer: 'back', at: [DECK.x0, DECK.rest] },
  ],
  spawners: [
    { id: 'lumber', surfaces: ['lumber-top'], at: [(LUMBER.x0 + LUMBER.x1) / 2, MB - 206], items: ['plank', 'beam'] },
    { id: 'bricks', surfaces: ['brick-top'], at: [(BRICKS.x0 + BRICKS.x1) / 2, MB - 180], items: ['block-2x1', 'block-1x1', 'block-2x2'] },
    { id: 'cones', at: [CONES.x, MB - 160], items: ['traffic-cone'] },
    { id: 'paint', surfaces: ['tool-shelf'], at: [BENCH.x0 + 200, 560], items: ['paint-can'] },
    { id: 'hard-hats', at: [OFF.x0 + 86, OFF.top + 210], items: ['hard-hat', 'safety-vest'] },
  ],
  zones: [
    { id: 'build', x0: ZB[0], x1: ZB[1], camera: 0 },
    { id: 'crane', x0: ZC[0], x1: ZC[1], camera: 700 },
    { id: 'dig', x0: ZD[0], x1: ZD[1], camera: 1440 },
  ],
  floor: { y0: WALL_Y, y1: 1372 },
};

// Rig data for the animated pieces, in WORLD units (copied into manifest.rooms.site.rigs by the build).
const W = (p) => toW(p[0], p[1]);
export const SITE_RIGS = {
  towerCrane: {
    pieces: { cab: 'crane-cab', jib: 'crane-jib', trolley: 'crane-trolley', cable: 'crane-cable', hook: 'crane-hook' },
    trolleyRail: { x0: toW(TC.jibX0 + 60, 0)[0], x1: toW(TC.x - 70, 0)[0], y: toW(0, TC.jibY1)[1], rest: toW(TC.trolleyX, 0)[0] },
    cableTop: W([TC.trolleyX, CABLE_TOP]), cableLength: +((TC.hookY - CABLE_TOP) * ART_SCALE).toFixed(1),
    hookTop: W([TC.trolleyX, TC.hookY]), hookGrab: W([TC.trolleyX + 26, TC.hookY + 104]),
    hookRange: { yMin: toW(0, CABLE_TOP + 40)[1], yMax: toW(0, DECK.rest - 110)[1] },
    note: 'Move trolley, cable and hook together along x (trolleyRail). Cable: scaleY = length / cableLength about cableTop; hook: translateY by the same delta. Sway: rotate cable+hook about cableTop.',
  },
  lever: { piece: 'crane-lever', pivot: W([(LEVER.x0 + LEVER.x1) / 2, MB - 170]), up: 'up', down: 'down', note: 'up = hook rises, down = hook lowers' },
  wreckingBall: {
    pieces: { body: 'wreck-body', boom: 'wreck-boom', chain: 'wreck-chain', ball: 'wreck-ball' }, boomPivot: W(WR.pivot), tip: W(WR.tip),
    // Driving: the whole crane (body, boom, chain, ball, its cab seat) shifts by dx along x, dx in [x0, x1] (world units).
    drive: { x0: +((340 - WR.tip[0] * ART_SCALE)).toFixed(1), x1: 40, exhaust: W([WR.x1 - 61, MB - 74 - 204]) },
    ballCentre: W(WR.ball), ballRadius: +(WR.ballR * ART_SCALE).toFixed(1), chainLength: +((WR.ball[1] - WR.tip[1]) * ART_SCALE).toFixed(1),
    note: 'Swing: rotate chain and ball together about tip (pendulum). Boom may tilt a few degrees about boomPivot. Drive: translate body, boom, chain and ball (and the wreck-cab seat) by dx.',
  },
  excavator: {
    pieces: { body: 'excavator', arm: 'excavator-arm', bucket: 'excavator-bucket' }, armPivot: W(EX.pivot), elbow: W(EX.elbow), bucketPivot: W(EX.tip),
    bucketMouth: W([EX.tip[0] - 44, EX.tip[1] + 60]), reach: +(Math.hypot(EX.tip[0] - EX.pivot[0], EX.tip[1] - EX.pivot[1]) * ART_SCALE).toFixed(1),
    note: 'Rotate the arm about armPivot, then the bucket about the arm tip (bucketPivot transformed by the arm rotation). Bucket variants: empty, full. The body piece can translate for driving; move all three.',
  },
  dumpTruck: { pieces: { body: 'dump-truck', bed: 'truck-bed' }, bedPivot: W(TR.bedPivot), tilt: { down: 0, full: 0, tilt: 18, up: 38 }, pour: W([TR.x1 + 60, MB]),
    note: 'Bed variants are pre-rotated about bedPivot (degrees above). Dirt slides out at pour.' },
  mixer: { piece: 'mixer-drum', frames: ['spin0', 'spin1', 'spin2', 'spin3'], fps: 12, mouth: W(MX.mouth), pour: W([MX.mouth[0] - 60, MB]) },
  dig: { piece: 'dirt', box: [...W([PIT.x0 + 30, PIT.top - 20]), +((PIT.x1 - PIT.x0 - 60) * ART_SCALE).toFixed(1), +((PIT.bot - PIT.top + 20) * ART_SCALE).toFixed(1)],
    note: 'Draw the dirt piece into a canvas; erase with a round brush (destination-out) along the bucket or finger path. Treasures sit in slots treasure-1..6 BELOW the dirt: draw them before the dirt canvas.' },
  potty: { piece: 'potty-door', pivot: W([POTTY.x0 + 14, POTTY.top + 58]) },
};
export const BUILD_GRID = {
  cell: 40, x0: toW(DECK.x0, 0)[0], x1: +(DECK.x1 * ART_SCALE).toFixed(1), y: toW(0, DECK.rest)[1], cols: DECK.cells, maxRows: 14,
  note: 'Snap columns start at x0; a piece with footprint [w, h] cells at column c, row r has its anchor (bottom centre) at [x0 + (c + w/2) * cell, y - r * cell].',
};
