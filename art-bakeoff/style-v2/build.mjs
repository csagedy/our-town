// "our town" art style v2: Toca-style line art. Hand-authored SVG path data;
// this script only assembles parts into files. Run:  node build.mjs && ./render.sh mockup.svg mockup.png
// Style rules live in STYLE.md. Key mechanism: every shape inside <g class="o"> gets the same
// thin dark outline from CSS (non-scaling, so it stays uniform whatever the scale).
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SVG_DIR = path.join(HERE, 'svg');
fs.mkdirSync(SVG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// PALETTE (names match STYLE.md). Muted, warm, cozy. One optional flat shade per family.
// ---------------------------------------------------------------------------
const P = {
  ink: '#3D2C29',                                     // the one outline colour
  white: '#FFFFFF', cream: '#FBF3E8', oat: '#EFE4D6', warmGrey: '#C9BDB3', warmGreyDeep: '#9E918A',
  brick: '#EECAB8', mortar: '#F6E3D8', brickDeep: '#E7BBA7',
  floor: '#E7BFA3', floorLine: '#D2A184',
  wood: '#DDAF87', woodLight: '#EDCBA9', woodDeep: '#C39068', woodDark: '#9C6C4C',
  rose: '#E9AFAE', roseDeep: '#D48C8E', blush: '#F6D3CF',
  terra: '#D98B64', terraDeep: '#BC6E4C', peach: '#F4C7A6',
  butter: '#F4DC98', mustard: '#DFB050', mustardDeep: '#C4933A',
  sage: '#B9CDA4', sageDeep: '#93AE85', leaf: '#79A86D', leafDeep: '#55875A', leafLight: '#A3C98F',
  mint: '#CFE5DA', teal: '#8CBDB8', tealDeep: '#679E9C',
  sky: '#CBE6F1', skyDeep: '#A5D0E3', blue: '#A3BEDC', blueDeep: '#7F9FC4',
  lav: '#D5C8E3', plum: '#9A7A98',
  char: '#57515A', charDeep: '#433E46', charHi: '#6C6670',
  steel: '#D8DADC', steelDeep: '#B2B6BA',
  glass: '#E9F4F1', choc: '#8A5B45', crust: '#E2A860', toast: '#F1D19B',
  berry: '#DC6B6E', lemon: '#F3D46A', egg: '#FFFDF6',
  chalk: '#56645D',
  mouth: '#9C4852', tongue: '#EE9A9C',
};
// UI buttons are the only saturated colours.
const UI = { tangerine: '#F79A4B', grass: '#62B96B', sky: '#4AA6E0', sun: '#FFD552', grape: '#A77BD6' };

const CSS = `
.o path,.o rect,.o circle,.o ellipse,.o polygon,.o polyline,.o line{stroke:${P.ink};stroke-width:4.5;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.o .d{fill:none;stroke-width:3}
.o .thin{stroke-width:3}
.o .n,.o .n *{stroke:none}
.o .tl{fill:none;stroke-width:3}
.o .ink{fill:${P.ink};stroke:none}
.skin{fill:var(--skin)}.skin-sh{fill:var(--skin-sh)}.hair{fill:var(--hair)}.hair-sh{fill:var(--hair-sh)}
.top{fill:var(--top)}.top-sh{fill:var(--top-sh)}.acc{fill:var(--acc)}.acc-sh{fill:var(--acc-sh)}
.bot{fill:var(--bot)}.shoe{fill:var(--shoe)}.sock{fill:var(--sock)}
`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const f = (n) => +(+n).toFixed(1);
const at = (x, y, s, inner, r = 0) => `<g transform="translate(${f(x)} ${f(y)})${s !== 1 ? ` scale(${s})` : ''}${r ? ` rotate(${r})` : ''}">${inner}</g>`;
const tl = (c, extra = "") => `class="tl" style="stroke:${c};${extra}"`;           // tone line (no ink): wallpaper, grain, stripes
const flipX = (inner) => `<g transform="scale(-1 1)">${inner}</g>`;
function scallop(cx, cy, rx, ry, n, bump, a0 = 0, a1 = 360, close = true) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const vx = mx - cx, vy = my - cy, L = Math.hypot(vx, vy) || 1;
    d += ` Q${f(mx + (vx / L) * bump)} ${f(my + (vy / L) * bump)} ${f(x1)} ${f(y1)}`;
  }
  return close ? d + 'Z' : d;
}
function star(cx, cy, R, r, n = 5) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2, rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`;
  }
  return d + 'Z';
}
const heart = (x, y, s, c, cls = 'thin') => `<path class="${cls}" fill="${c}" transform="translate(${x} ${y}) scale(${s})" d="M0 8 C-12 0 -12 -10 -5 -10 C-2 -10 0 -7 0 -5 C0 -7 2 -10 5 -10 C12 -10 12 0 0 8Z"/>`;
const aim = (dx, dy) => f((Math.atan2(-dx, dy) * 180) / Math.PI);
const rot = (x, y, deg) => { const r = (deg * Math.PI) / 180; return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]; };

// ---------------------------------------------------------------------------
// CHARACTERS. Local space: feet at (0,0), +y down. Head is drawn around its own
// centre (head.cy). Arms hang straight down from a shoulder pivot; hand at (0, armLen).
// Colours come from CSS custom properties on the root, so one rig recolours into NPCs.
// ---------------------------------------------------------------------------
function headShape(rx, ry) {
  return `M0 ${-ry} C${f(rx * .62)} ${-ry} ${rx} ${f(-ry * .6)} ${rx} ${f(-ry * .02)} C${rx} ${f(ry * .6)} ${f(rx * .6)} ${ry} 0 ${ry} C${f(-rx * .6)} ${ry} ${-rx} ${f(ry * .6)} ${-rx} ${f(-ry * .02)} C${-rx} ${f(-ry * .6)} ${f(-rx * .62)} ${-ry} 0 ${-ry}Z`;
}
const ears = (rx, ry) => [-1, 1].map((s) => `<ellipse class="skin" cx="${s * (rx - 2)}" cy="${f(ry * .14)}" rx="13" ry="17"/><path class="d" d="M${s * (rx + 3)} ${f(ry * .06)} q${s * 5} 8 ${s * -1} 16"/>`).join('');

// face atoms (head-centre coordinates)
const F = {
  dot: (x, y, rx = 8.5, ry = 11) => `<ellipse class="ink" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`,
  lash: (x, y, s) => `<path class="d" style="stroke-width:3.5" d="M${x + s * 7} ${y - 5} l${s * 7} -4"/>`,
  closedUp: (x, y) => `<path class="d" style="stroke-width:5" d="M${x - 10} ${y + 4} Q${x} ${y - 9} ${x + 10} ${y + 4}"/>`,
  closedDown: (x, y) => `<path class="d" style="stroke-width:5" d="M${x - 10} ${y - 2} Q${x} ${y + 8} ${x + 10} ${y - 2}"/>`,
  lid: (x, y) => `<path class="ink" d="M${x - 9} ${y - 3} L${x + 9} ${y - 3} Q${x + 9} ${y + 10} ${x} ${y + 10} Q${x - 9} ${y + 10} ${x - 9} ${y - 3}Z"/>`,
  nose: (y) => `<ellipse class="skin-sh thin" cx="0" cy="${y}" rx="7" ry="5.5"/>`,
  smile: (y, w = 9) => `<path class="d" style="stroke-width:3.5" d="M${-w} ${y} Q0 ${y + 8} ${w} ${y}"/>`,
  grin: (y, w = 13) => `<path class="thin" fill="${P.mouth}" d="M${-w} ${y} Q0 ${y + 3} ${w} ${y} Q${w - 2} ${y + 17} 0 ${y + 17} Q${-w + 2} ${y + 17} ${-w} ${y}Z"/><path class="n" fill="${P.tongue}" d="M-6 ${y + 13} Q0 ${y + 8} 6 ${y + 13} Q0 ${y + 16} -6 ${y + 13}Z"/>`,
  oh: (y) => `<ellipse class="thin" fill="${P.mouth}" cx="0" cy="${y + 4}" rx="6" ry="8"/>`,
  frown: (y) => `<path class="d" style="stroke-width:3.5" d="M-9 ${y + 5} Q0 ${y - 3} 9 ${y + 5}"/>`,
  tongueOut: (y) => `<path class="thin" fill="${P.tongue}" d="M-2 ${y + 4} L10 ${y + 4} L10 ${y + 11} Q10 ${y + 16} 5 ${y + 16} Q0 ${y + 16} 0 ${y + 11}Z"/><path class="d" style="stroke-width:3.5" d="M-11 ${y} Q0 ${y + 7} 13 ${y}"/>`,
  arch: (x, y) => `<path class="d" style="stroke-width:3.5" d="M${x - 9} ${y + 3} Q${x} ${y - 5} ${x + 9} ${y + 3}"/>`,
  brow: (x, y, s, tilt = 0) => `<path class="d" style="stroke-width:3.5" d="M${x - 9} ${y + s * tilt} L${x + 9} ${y - s * tilt}"/>`,
  blush: (x, y) => `<ellipse class="n" fill="${P.rose}" opacity=".45" cx="${x}" cy="${y}" rx="13" ry="7"/>`,
};

// ---------- ZOE (9): curly high puff + headband, sage tee, rose apron ----------
const ZOE = {
  name: 'zoe', head: { cy: -300, rx: 82, ry: 80 }, shoulderL: [-46, -206], shoulderR: [46, -206], armLen: 84, sleeve: 34, shadow: 66,
  vars: { '--skin': '#A8714D', '--skin-sh': '#8C5A3B', '--hair': '#3A2A2C', '--hair-sh': '#55403F', '--top': P.sage, '--top-sh': P.sageDeep,
    '--acc': P.rose, '--acc-sh': P.roseDeep, '--bot': P.plum, '--shoe': P.cream, '--sock': P.white },
  sleeveLines: P.cream,
};
ZOE.parts = {
  legs: () => `<g id="zoe-legs">
    <rect class="bot" x="-36" y="-134" width="30" height="118" rx="13"/><rect class="bot" x="6" y="-134" width="30" height="118" rx="13"/>
    <path class="shoe" d="M-6 0 L-44 0 Q-54 0 -54 -10 Q-54 -32 -28 -32 Q-6 -32 -6 -12Z"/><path class="shoe" d="M6 0 L44 0 Q54 0 54 -10 Q54 -32 28 -32 Q6 -32 6 -12Z"/>
    <path class="d" d="M-50 -9 L-8 -9"/><path class="d" d="M50 -9 L8 -9"/>
    <circle class="n" fill="${P.roseDeep}" cx="-24" cy="-22" r="3.5"/><circle class="n" fill="${P.roseDeep}" cx="24" cy="-22" r="3.5"/>
  </g>`,
  body: () => `<g id="zoe-body">
    <rect class="skin" x="-13" y="-238" width="26" height="36" rx="8"/>
    <path class="top" d="M-40 -218 Q-52 -216 -54 -200 L-58 -132 Q-58 -120 -46 -120 L46 -120 Q58 -120 58 -132 L54 -200 Q52 -216 40 -218Z"/>
    <path fill="${P.cream}" class="thin" d="M-24 -219 Q-18 -198 0 -206 Q18 -198 24 -219 Q0 -210 -24 -219Z"/>
    <path class="acc" d="M-30 -200 L30 -200 L32 -158 L52 -158 Q57 -158 58 -152 L63 -102 Q63 -94 55 -94 L-55 -94 Q-63 -94 -63 -102 L-58 -152 Q-57 -158 -52 -158 L-32 -158Z"/>
    <path class="acc" d="M-30 -200 L-24 -220 L-16 -218 L-22 -200Z"/><path class="acc" d="M30 -200 L24 -220 L16 -218 L22 -200Z"/>
    <rect class="acc-sh" x="-60" y="-162" width="120" height="12" rx="6"/>
    <path class="acc-sh" d="M58 -156 Q76 -168 78 -150 Q70 -144 58 -150Z"/><path class="acc-sh" d="M58 -154 Q72 -136 66 -122 Q58 -128 56 -150Z"/>
    <g class="n" fill="${P.cream}"><circle cx="-44" cy="-110" r="3.5"/><circle cx="40" cy="-104" r="3.5"/><circle cx="-8" cy="-186" r="3.5"/><circle cx="16" cy="-174" r="3.5"/><circle cx="48" cy="-134" r="3.5"/><circle cx="-46" cy="-138" r="3.5"/></g>
    <rect fill="${P.cream}" class="thin" x="-22" y="-140" width="44" height="30" rx="8"/>
    <path class="thin" fill="${P.berry}" d="M0 -114 Q-11 -122 -9 -130 Q-5 -134 0 -131 Q5 -134 9 -130 Q11 -122 0 -114Z"/><path class="n" fill="${P.leaf}" d="M-6 -132 L0 -128 L6 -132 L0 -136Z"/>
  </g>`,
  hairBack: () => `<g id="zoe-hair-back">
    <path class="hair" d="${scallop(0, -102, 60, 44, 12, 10)}"/>
    <path class="d" d="M-30 -118 Q-20 -128 -8 -122"/><path class="d" d="M14 -128 Q26 -130 34 -118"/><path class="d" d="M-6 -90 Q6 -98 16 -92"/>
  </g>`,
  hairFront: () => `<g id="zoe-hair-front">
    <path class="hair" d="M-86 -4 C-94 -70 -52 -94 0 -94 C52 -94 94 -70 86 -4 C80 -28 72 -42 58 -50 C32 -60 -32 -60 -58 -50 C-72 -42 -80 -28 -86 -4Z"/>
    <path class="acc" d="M-76 -40 C-66 -86 66 -86 76 -40 L66 -36 C56 -72 -56 -72 -66 -36Z"/>
    <path class="d" d="M-44 -82 Q-30 -74 -16 -80"/><path class="d" d="M30 -84 Q44 -80 52 -70"/>
    <path class="hair" d="${scallop(-80, -14, 12, 14, 6, 5)}"/><path class="hair" d="${scallop(80, -14, 12, 14, 6, 5)}"/>
  </g>`,
};
const zf = { ex: 31, ey: 10, ny: 28, my: 42 };
ZOE.faces = {
  happy: `${F.dot(-zf.ex, zf.ey)}${F.dot(zf.ex, zf.ey)}${F.lash(-zf.ex, zf.ey, -1)}${F.lash(zf.ex, zf.ey, 1)}${F.nose(zf.ny)}${F.smile(zf.my)}`,
  laughing: `${F.closedUp(-zf.ex, zf.ey)}${F.closedUp(zf.ex, zf.ey)}${F.lash(-zf.ex, zf.ey + 4, -1)}${F.lash(zf.ex, zf.ey + 4, 1)}${F.nose(zf.ny)}${F.grin(zf.my - 4)}`,
  surprised: `${F.dot(-zf.ex, zf.ey - 2, 9.5, 13)}${F.dot(zf.ex, zf.ey - 2, 9.5, 13)}${F.lash(-zf.ex, zf.ey - 4, -1)}${F.lash(zf.ex, zf.ey - 4, 1)}${F.arch(-zf.ex, -22)}${F.arch(zf.ex, -22)}${F.nose(zf.ny)}${F.oh(zf.my - 2)}`,
};

// ---------- IAN (5): copper tufts, star tee, striped towel cape ----------
const IAN = {
  name: 'ian', head: { cy: -252, rx: 80, ry: 76 }, shoulderL: [-42, -168], shoulderR: [42, -168], armLen: 72, sleeve: 26, shadow: 60,
  vars: { '--skin': '#F3D0B5', '--skin-sh': '#E2AB8E', '--hair': '#C9713F', '--hair-sh': '#A95A31', '--top': P.blue, '--top-sh': P.blueDeep,
    '--acc': P.terra, '--acc-sh': P.terraDeep, '--bot': P.mustard, '--shoe': P.white, '--sock': P.rose },
};
IAN.parts = {
  back: () => {
    // towel cape flaring out to his right (screen left), as if mid-swoosh
    const bl = [-104, -62], br = [72, -48], lerp = (a, b, t) => [f(a[0] + (b[0] - a[0]) * t), f(a[1] + (b[1] - a[1]) * t)];
    const fr = [...Array(13)].map((_, i) => { const [x, y] = lerp(bl, br, (i + .5) / 13); return `M${x} ${y} L${x - 2} ${y + 12}`; }).join(' ');
    return `<g id="ian-cape">
    <path class="acc" d="M-34 -180 L34 -180 Q52 -178 56 -150 L${br[0] + 6} ${br[1] - 10} Q${br[0] + 8} ${br[1]} ${br[0]} ${br[1]} L${bl[0] + 8} ${bl[1]} Q${bl[0] - 6} ${bl[1] - 2} ${bl[0] + 2} ${bl[1] - 14} L-58 -150 Q-52 -178 -34 -180Z"/>
    <path fill="${P.cream}" d="M-94 -94 L69 -82 L72 -72 L-99 -84Z"/><path fill="${P.cream}" d="M-101 -76 L73 -64 L74 -58 L-103 -70Z"/>
    <path class="d" d="${fr}"/>
    <path ${tl(P.terraDeep)} d="M-30 -160 Q-50 -120 -60 -100 M20 -160 Q30 -120 40 -96"/>
  </g>`;
  },
  legs: () => `<g id="ian-legs">
    <rect class="skin" x="-32" y="-72" width="24" height="56" rx="11"/><rect class="skin" x="8" y="-72" width="24" height="56" rx="11"/>
    <rect class="sock" x="-34" y="-44" width="28" height="26" rx="6"/><rect class="sock" x="6" y="-44" width="28" height="26" rx="6"/>
    <path ${tl(P.cream)} d="M-32 -34 L-8 -34 M8 -34 L32 -34"/>
    <path class="shoe" d="M-4 0 L-40 0 Q-50 0 -50 -9 Q-50 -28 -26 -28 Q-4 -28 -4 -10Z"/><path class="shoe" d="M4 0 L40 0 Q50 0 50 -9 Q50 -28 26 -28 Q4 -28 4 -10Z"/>
    <path class="d" d="M-46 -8 L-6 -8"/><path class="d" d="M46 -8 L6 -8"/>
  </g>`,
  body: () => `<g id="ian-body">
    <rect class="skin" x="-12" y="-192" width="24" height="28" rx="8"/>
    <path class="bot" d="M-48 -110 L48 -110 L51 -70 Q51 -62 43 -62 L6 -62 L0 -76 L-6 -62 L-43 -62 Q-51 -62 -51 -70Z"/>
    <path class="top" d="M-36 -182 Q-48 -180 -50 -166 L-52 -112 Q-52 -100 -42 -100 L42 -100 Q52 -100 52 -112 L50 -166 Q48 -180 36 -182Z"/>
    <path class="d" d="M-16 -182 Q0 -168 16 -182"/>
    <path class="thin" fill="${P.butter}" d="${star(0, -138, 24, 11)}"/>
    <circle class="acc" cx="-16" cy="-182" r="8"/><circle class="acc" cx="16" cy="-182" r="8"/>
  </g>`,
  hairBack: () => '',
  hairFront: () => `<g id="ian-hair-front">
    <path class="hair" d="M-84 4 C-94 -60 -56 -92 0 -92 C56 -92 94 -60 84 4 C80 -18 74 -30 66 -38 L58 -24 L50 -46 C32 -40 22 -48 12 -58 L2 -40 L-10 -58 C-24 -46 -40 -44 -54 -48 L-62 -30 L-70 -40 C-78 -28 -82 -14 -84 4Z"/>
    <path class="hair" d="M-6 -90 C-14 -112 8 -122 18 -108 C8 -112 2 -104 4 -92Z"/>
    <path class="d" d="M-42 -76 Q-30 -70 -22 -76"/><path class="d" d="M28 -78 Q40 -74 48 -66"/>
  </g>`,
};
const iff = { ex: 30, ey: 12, ny: 30, my: 44 };
IAN.faces = {
  happy: `${F.dot(-iff.ex, iff.ey)}${F.dot(iff.ex, iff.ey)}${F.nose(iff.ny)}${F.grin(iff.my - 3, 12)}${F.blush(-50, 32)}${F.blush(50, 32)}`,
  cheeky: `${F.closedUp(-iff.ex, iff.ey)}${F.dot(iff.ex, iff.ey)}${F.arch(iff.ex, -12)}${F.nose(iff.ny)}${F.tongueOut(iff.my)}${F.blush(-50, 32)}${F.blush(50, 32)}`,
  grumpy: `${F.lid(-iff.ex, iff.ey)}${F.lid(iff.ex, iff.ey)}${F.brow(-iff.ex + 2, -8, -1, 4)}${F.brow(iff.ex - 2, -8, 1, 4)}${F.nose(iff.ny)}${F.frown(iff.my + 2)}`,
};

// ---------- CUSTOMER (adult): knit beanie, round glasses, mustard cardigan ----------
const CUST = {
  name: 'customer', head: { cy: -452, rx: 74, ry: 78 }, shoulderL: [-56, -352], shoulderR: [56, -352], armLen: 138, sleeve: 118, shadow: 72,
  vars: { '--skin': '#EDC3A2', '--skin-sh': '#D9A07F', '--hair': '#6A4A3A', '--hair-sh': '#523729', '--top': P.mustard, '--top-sh': P.mustardDeep,
    '--acc': P.teal, '--acc-sh': P.tealDeep, '--bot': '#8C6E5C', '--shoe': P.charDeep, '--sock': P.cream },
  sleeveLines: P.mustardDeep,
};
CUST.parts = {
  legs: () => `<g id="customer-legs">
    <rect class="bot" x="-48" y="-222" width="42" height="204" rx="14"/><rect class="bot" x="6" y="-222" width="42" height="204" rx="14"/>
    <rect class="bot" x="-50" y="-226" width="100" height="40" rx="12"/>
    <path class="d" d="M0 -196 L0 -186"/>
    <path class="shoe" d="M-4 0 L-50 0 Q-62 0 -62 -12 Q-62 -34 -32 -34 Q-4 -34 -4 -12Z"/><path class="shoe" d="M4 0 L50 0 Q62 0 62 -12 Q62 -34 32 -34 Q4 -34 4 -12Z"/>
  </g>`,
  body: () => `<g id="customer-body">
    <rect class="skin" x="-15" y="-396" width="30" height="40" rx="9"/>
    <path class="top" d="M-46 -374 Q-58 -372 -60 -354 L-64 -222 Q-64 -206 -50 -206 L50 -206 Q64 -206 64 -222 L60 -354 Q58 -372 46 -374Z"/>
    <path fill="${P.cream}" d="M-20 -374 L20 -374 L12 -206 L-12 -206Z"/>
    <path class="d" d="M-20 -374 Q0 -358 20 -374"/>
    <g fill="${P.cream}" class="thin"><circle cx="-18" cy="-334" r="4.5"/><circle cx="-16" cy="-294" r="4.5"/><circle cx="-15" cy="-254" r="4.5"/></g>
    <path class="d" d="M-52 -262 L-30 -262 L-30 -236 L-52 -236"/><path class="d" d="M52 -262 L30 -262 L30 -236 L52 -236"/>
    <path ${tl(P.mustardDeep)} d="${[-54, -44, -34, 26, 36, 46, 56].map((x) => `M${x} -222 L${x} -210`).join(' ')}"/>
  </g>`,
  hairBack: () => '',
  hairFront: () => `<g id="customer-hair-front">
    <path class="hair" d="M-76 -12 C-76 12 -72 22 -64 30 L-58 -12Z"/><path class="hair" d="M76 -12 C76 12 72 22 64 30 L58 -12Z"/>
    <path class="acc" d="M-78 -30 C-82 -92 -40 -116 0 -116 C40 -116 82 -92 78 -30Z"/>
    <path class="hair" d="${scallop(0, -120, 17, 15, 8, 5)}" style="fill:${P.cream}"/>
    <rect class="acc-sh" x="-84" y="-44" width="168" height="30" rx="14"/>
    <path ${tl(P.tealDeep)} d="${[-64, -48, -32, -16, 0, 16, 32, 48, 64].map((x) => `M${x} -40 L${x} -18`).join(' ')}"/>
    <path class="d" d="M-40 -80 Q-30 -96 -12 -100"/>
    <g fill="none" style="stroke-width:3.5"><circle cx="-28" cy="10" r="20" class="thin"/><circle cx="28" cy="10" r="20" class="thin"/></g>
    <path class="d" d="M-9 8 Q0 2 9 8 M-48 6 L-66 0 M48 6 L66 0"/>
  </g>`,
};
const cf = { ex: 28, ey: 10, ny: 30, my: 46 };
CUST.faces = {
  pleased: `${F.dot(-cf.ex, cf.ey, 7.5, 10)}${F.dot(cf.ex, cf.ey, 7.5, 10)}${F.nose(cf.ny)}${F.smile(cf.my, 10)}`,
  yum: `${F.closedDown(-cf.ex, cf.ey)}${F.closedDown(cf.ex, cf.ey)}${F.nose(cf.ny)}${F.grin(cf.my - 3, 11)}${F.blush(-48, 36)}${F.blush(48, 36)}`,
  surprised: `${F.dot(-cf.ex, cf.ey - 1, 8.5, 12)}${F.dot(cf.ex, cf.ey - 1, 8.5, 12)}${F.arch(-cf.ex, -20)}${F.arch(cf.ex, -20)}${F.nose(cf.ny)}${F.oh(cf.my - 2)}`,
};

// Arm: pivot at shoulder, hanging down. Mitten hand at (0, len).
function arm(def, id) {
  const L = def.armLen, S = def.sleeve;
  const stripes = def.sleeveLines ? `<path ${tl(def.sleeveLines)} d="M-16 ${f(S * .35)} L16 ${f(S * .35)} M-16 ${f(S * .65)} L16 ${f(S * .65)}"/>` : '';
  return `<g id="${id}">
    <rect class="skin" x="-11" y="0" width="22" height="${L - 8}" rx="11"/>
    <path class="top" d="M-18 -8 Q0 -22 18 -8 L17 ${S} Q0 ${S + 6} -17 ${S}Z"/>${stripes}
    <circle class="skin" cx="0" cy="${L}" r="16"/><path class="d" d="M-9 ${L - 4} q-4 8 2 12"/>
  </g>`;
}

// opts: expr, armL, armR (deg), tilt, inHandL/inHandR (drawn under the hand), armLFront, allFaces, id
function character(def, opts = {}) {
  const { expr = Object.keys(def.faces)[0], armL = 8, armR = -8, tilt = 0, id = def.name, allFaces = false,
    inHandL = '', inHandR = '', armLFront = false } = opts;
  const { cy, rx, ry } = def.head;
  const style = Object.entries(def.vars).map(([k, v]) => `${k}:${v}`).join(';');
  const [lx, ly] = def.shoulderL, [rx2, ry2] = def.shoulderR;
  const faceSvg = allFaces
    ? Object.entries(def.faces).map(([k, v]) => `<g id="${id}-face-${k}" class="face"${k === expr ? '' : ' style="display:none"'}>${v}</g>`).join('')
    : `<g id="${id}-face-${expr}" class="face">${def.faces[expr]}</g>`;
  const armLsvg = `${inHandL}<g id="${id}-arm-l-pivot" transform="translate(${lx} ${ly}) rotate(${armL})">${arm(def, `${id}-arm-l`)}</g>`;
  return `<g id="${id}" style="${style}">
  <ellipse class="n" fill="${P.ink}" opacity=".12" cx="0" cy="0" rx="${def.shadow}" ry="13"/>
  ${def.parts.back ? def.parts.back() : ''}
  ${def.parts.legs()}
  ${def.parts.body()}
  ${armLFront ? '' : armLsvg}
  <g id="${id}-head" transform="translate(0 ${cy}) rotate(${tilt} 0 ${ry})">
    ${def.parts.hairBack()}
    ${ears(rx, ry)}
    <path class="skin" d="${headShape(rx, ry)}"/>
    <g id="${id}-face">${faceSvg}</g>
    ${def.parts.hairFront()}
  </g>
  ${armLFront ? armLsvg : ''}
  ${inHandR}<g id="${id}-arm-r-pivot" transform="translate(${rx2} ${ry2}) rotate(${armR})">${arm(def, `${id}-arm-r`)}</g>
</g>`;
}
const handPos = (def, side, deg) => {
  const [sx, sy] = side === 'L' ? def.shoulderL : def.shoulderR;
  const [x, y] = rot(0, def.armLen, deg);
  return [sx + x, sy + y];
};

// ---------------------------------------------------------------------------
// PROPS. Origin = bottom centre (resting point) unless noted.
// ---------------------------------------------------------------------------
const leaf = (len, w, ang, c = P.leaf, x = 0, y = 0) => `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path fill="${c}" d="M0 0 C${w} ${f(-len * .25)} ${w} ${f(-len * .75)} 0 ${-len} C${-w} ${f(-len * .75)} ${-w} ${f(-len * .25)} 0 0Z"/><path class="d" d="M0 -3 L0 ${f(-len * .68)}"/></g>`;
const mug = (c = P.teal, deco = '') => `<g>
  <path fill="${c}" d="M18 -40 Q36 -40 35 -26 Q34 -12 17 -14 L17 -21 Q27 -21 27 -27 Q27 -33 18 -33Z"/>
  <path fill="${c}" d="M-22 -50 L22 -50 L20 -8 Q19 0 11 0 L-11 0 Q-19 0 -20 -8Z"/>${deco}
  <ellipse fill="${P.choc}" class="thin" cx="0" cy="-50" rx="21" ry="4.5"/></g>`;
const cup = (c = P.cream) => `<g><path fill="${c}" d="M13 -22 Q24 -22 23 -14 Q22 -6 12 -8Z"/><path fill="${c}" d="M-16 -26 L16 -26 L13 -6 Q12 0 6 0 L-6 0 Q-12 0 -13 -6Z"/><ellipse fill="${c}" class="thin" cx="0" cy="0" rx="24" ry="4"/></g>`;
const jar = (w, h, fillc, lid, level = .6, bits = null, label = false) => {
  const x = -w / 2, top = -h * level;
  let b = '';
  if (bits) for (let i = 0; i < 7; i++) b += `<circle class="n" fill="${bits}" cx="${f(x + 10 + ((i * 37) % (w - 18)))}" cy="${f(top + 8 + ((i * 23) % Math.max(8, h * level - 18)))}" r="3"/>`;
  return `<g>
  <rect x="${x}" y="${-h}" width="${w}" height="${h}" rx="${Math.min(12, w / 4)}" fill="${P.glass}"/>
  <path class="thin" fill="${fillc}" d="M${x + 5} ${f(top)} L${-x - 5} ${f(top)} L${-x - 5} -9 Q${-x - 5} -5 ${-x - 9} -5 L${x + 9} -5 Q${x + 5} -5 ${x + 5} -9Z"/>${b}
  ${label ? `<rect class="thin" fill="${P.cream}" x="${x + 8}" y="${f(-h * .5)}" width="${w - 16}" height="${f(h * .22)}" rx="4"/>` : ''}
  <rect x="${x + 3}" y="${-h - 13}" width="${w - 6}" height="15" rx="5" fill="${lid}"/>
  <path ${tl(P.white, `stroke:#fff;stroke-width:4`)} d="M${x + 9} ${-h + 12} L${x + 9} ${-h + 26}"/></g>`;
};
const bottle = (c = P.leafDeep, h = 110, label = P.cream) => `<g>
  <path fill="${c}" d="M-18 0 Q-24 0 -24 -8 L-24 ${-h + 46} Q-24 ${-h + 30} -9 ${-h + 24} L-9 ${-h + 6} L9 ${-h + 6} L9 ${-h + 24} Q24 ${-h + 30} 24 ${-h + 46} L24 -8 Q24 0 18 0Z"/>
  <rect fill="${P.woodDeep}" x="-10" y="${-h - 4}" width="20" height="14" rx="4"/>
  <rect class="thin" fill="${label}" x="-18" y="${f(-h * .5)}" width="36" height="${f(h * .26)}" rx="4"/>
  <path ${tl(P.white)} d="M-15 ${-h + 50} L-15 ${-h + 64}"/></g>`;
const pot = (c = P.terra, w = 56, h = 46) => `<g><path fill="${c}" d="M${-w / 2 + 6} ${-h + 8} L${w / 2 - 6} ${-h + 8} L${w / 2 - 12} -4 Q${w / 2 - 13} 0 ${w / 2 - 17} 0 L${-w / 2 + 17} 0 Q${-w / 2 + 13} 0 ${-w / 2 + 12} -4Z"/><rect fill="${c}" x="${-w / 2}" y="${-h}" width="${w}" height="16" rx="5"/></g>`;
const plantLeafy = (potc = P.terra, s = 1, dark = false) => at(0, 0, s, `
  ${[-62, -38, -14, 12, 36, 60].map((a, i) => leaf(52 + (i % 2) * 14, 16, a, i % 2 ? P.leaf : P.leafDeep, 0, -40)).join('')}
  ${leaf(62, 17, -4, dark ? P.leafDeep : P.leafLight, 0, -40)}${pot(potc)}`);
const succulent = (potc = P.cream) => `<g>${[-50, -25, 0, 25, 50].map((a, i) => `<g transform="translate(0 -34) rotate(${a})"><path fill="${i % 2 ? P.sage : P.sageDeep}" d="M0 0 C12 -10 10 -30 0 -40 C-10 -30 -12 -10 0 0Z"/></g>`).join('')}
  <path fill="${potc}" d="M-38 -38 L38 -38 Q36 0 0 0 Q-36 0 -38 -38Z"/></g>`;
const snake = (potc = P.oat) => `<g>${[[-18, -8, 80], [-6, -2, 104], [8, 6, 92], [20, 12, 70]].map(([x, a, l], i) => `<g transform="translate(${x} -40) rotate(${a})"><path fill="${i % 2 ? P.leaf : P.leafDeep}" d="M-8 0 C-10 ${-l * .5} -6 ${-l * .8} 0 ${-l} C6 ${-l * .8} 10 ${-l * .5} 8 0Z"/><path ${tl(P.leafLight)} d="M-4 ${-l * .3} L4 ${-l * .36} M-4 ${-l * .55} L4 ${-l * .6}"/></g>`).join('')}${pot(potc, 58, 44)}</g>`;
const trailing = (len, sway = 16, n = 5) => {
  let s = `<path class="d" d="M0 0 Q${sway} ${len / 2} 0 ${len}"/>`;
  for (let i = 0; i < n; i++) {
    const t = (i + .6) / n, y = len * t, x = sway * 2 * t * (1 - t) * 1.4, side = i % 2 ? 1 : -1;
    s += leaf(24, 10, 180 + side * 50, i % 2 ? P.leaf : P.leafDeep, x, y);
  }
  return s;
};
const hangingPlant = (ropeLen, potc = P.cream) => `<g>
  <path class="d" d="M0 ${-ropeLen} L-26 -30 M0 ${-ropeLen} L26 -30"/>
  ${at(-24, -14, 1, trailing(150, -14, 6))}${at(22, -14, 1, trailing(190, 16, 7))}${at(0, -10, 1, trailing(110, 8, 4))}
  ${[-60, -30, 0, 30, 60].map((a, i) => leaf(34, 12, a, i % 2 ? P.leaf : P.leafDeep, 0, -30)).join('')}
  <path fill="${potc}" d="M-32 -34 L32 -34 Q30 6 0 6 Q-30 6 -32 -34Z"/><path ${tl(P.warmGrey)} d="M-28 -20 L28 -20"/></g>`;
const books = (list) => { let x = 0, s = ''; for (const [w, h, c] of list) { s += `<rect fill="${c}" x="${x}" y="${-h}" width="${w}" height="${h}" rx="3"/><path ${tl(P.cream)} d="M${x + 4} ${-h + 12} L${x + w - 4} ${-h + 12}"/>`; x += w; } return `<g transform="translate(${-x / 2} 0)">${s}</g>`; };
const bookStack = (list) => { let y = 0, s = ''; for (const [w, h, c] of list) { s += `<rect fill="${c}" x="${-w / 2}" y="${y - h}" width="${w}" height="${h}" rx="3"/><path ${tl(P.cream)} d="M${-w / 2 + 8} ${y - h / 2} L${w / 2 - 8} ${y - h / 2}"/>`; y -= h; } return s; };
const plates = (n = 5, w = 96, c = P.cream) => { let s = ''; for (let i = 0; i < n; i++) s += `<rect fill="${c}" x="${-w / 2}" y="${-(i + 1) * 9}" width="${w}" height="10" rx="5"/>`; return s; };
const bowlStack = () => `<path fill="${P.teal}" d="M-44 -54 L44 -54 Q40 -34 0 -32 Q-40 -34 -44 -54Z"/><path fill="${P.rose}" d="M-48 -34 L48 -34 Q44 -12 0 -10 Q-44 -12 -48 -34Z"/><path fill="${P.cream}" d="M-50 -14 L50 -14 Q46 0 0 0 Q-46 0 -50 -14Z"/>`;
const teapot = (c = P.teal, dots = P.cream) => `<g>
  <path fill="${c}" d="M-36 -32 Q-58 -38 -62 -60 L-53 -62 Q-48 -46 -32 -44Z"/>
  <path fill="${c}" d="M34 -60 Q60 -60 58 -36 Q56 -16 36 -18 L36 -26 Q48 -26 49 -37 Q50 -52 34 -52Z"/>
  <path fill="${c}" d="M-40 -8 Q-50 -40 -30 -64 L30 -64 Q50 -40 40 -8 Q38 0 30 0 L-30 0 Q-38 0 -40 -8Z"/>
  <path fill="${c}" d="M-26 -64 Q0 -84 26 -64Z"/><circle fill="${c}" cx="0" cy="-84" r="7"/>
  <g class="n" fill="${dots}"><circle cx="-20" cy="-40" r="5"/><circle cx="4" cy="-28" r="5"/><circle cx="22" cy="-46" r="5"/><circle cx="-8" cy="-52" r="4"/><circle cx="24" cy="-18" r="4"/><circle cx="-24" cy="-16" r="4"/></g></g>`;
const croissant = (s = 1) => at(0, 0, s, `<path fill="${P.crust}" d="M-52 -8 Q-60 -30 -34 -38 Q0 -52 34 -38 Q60 -30 52 -8 Q42 -12 36 -16 Q20 -4 0 -6 Q-20 -4 -36 -16 Q-42 -12 -52 -8Z"/>
  <path class="d" d="M-24 -42 Q-18 -26 -26 -12 M-4 -46 Q2 -26 -4 -6 M18 -44 Q24 -26 18 -8"/><path class="n" fill="#F2C88A" d="M-12 -40 Q0 -44 10 -40 Q0 -38 -12 -40Z"/>`);
const cupcake = (s = 1, frost = P.rose) => at(0, 0, s, `
  <path fill="${frost}" d="M-30 -40 Q-38 -58 -18 -62 Q-16 -82 4 -78 Q24 -84 22 -62 Q40 -58 30 -40Z"/>
  <path class="d" d="M-16 -56 Q0 -48 14 -58"/>
  <path fill="${P.teal}" d="M-26 -40 L26 -40 L20 0 L-20 0Z"/><path ${tl(P.tealDeep)} d="M-12 -38 L-10 -2 M0 -38 L0 -2 M12 -38 L10 -2"/>
  <path class="d" d="M3 -84 Q6 -96 14 -100"/><circle fill="${P.berry}" cx="2" cy="-86" r="9"/>
  <g class="n"><rect fill="${P.butter}" x="-18" y="-52" width="7" height="3" rx="1.5" transform="rotate(30 -15 -50)"/><rect fill="${P.teal}" x="10" y="-66" width="7" height="3" rx="1.5" transform="rotate(-20 13 -64)"/><rect fill="${P.cream}" x="-4" y="-70" width="7" height="3" rx="1.5"/></g>`);
const cakeStand = (inner, w = 150, c = P.cream) => `<g><path fill="${c}" d="M-18 0 L18 0 L10 -8 L-10 -8Z"/><rect fill="${c}" x="-7" y="-30" width="14" height="24"/><rect fill="${c}" x="${-w / 2}" y="-40" width="${w}" height="12" rx="6"/>${at(0, -40, 1, inner)}</g>`;
const layerCake = (s = 1) => at(0, 0, s, `
  <rect fill="${P.peach}" x="-60" y="-96" width="120" height="96" rx="8"/>
  <path ${tl(P.cream, `stroke:${P.cream};stroke-width:6`)} d="M-58 -48 L58 -48"/>
  <path fill="${P.blush}" d="M-64 -100 Q-64 -110 -54 -110 L54 -110 Q64 -110 64 -100 L64 -84 Q58 -72 52 -84 Q46 -68 38 -84 Q30 -76 22 -86 L10 -86 Q2 -66 -8 -86 Q-16 -76 -26 -86 Q-36 -70 -44 -86 Q-54 -74 -64 -86Z"/>
  ${[-36, 0, 34].map((x) => `<path fill="${P.berry}" d="M${x} -106 Q${x - 12} -114 ${x - 10} -124 Q${x} -130 ${x + 10} -124 Q${x + 12} -114 ${x} -106Z"/><path class="n" fill="${P.leaf}" d="M${x - 7} -124 L${x} -120 L${x + 7} -124 L${x} -129Z"/>`).join('')}`);
const cakeSlice = () => `<path fill="${P.choc}" d="M-40 0 L40 0 L40 -40 L-40 -24Z"/><path fill="${P.cream}" d="M-40 -24 L40 -40 L40 -50 L-40 -30Z"/><path ${tl(P.cream, `stroke:${P.cream};stroke-width:5`)} d="M-38 -10 L38 -18"/><circle fill="${P.berry}" cx="20" cy="-52" r="8"/>`;
const panWithEgg = () => `<g>
  <rect fill="${P.woodDark}" x="-12" y="-8" width="84" height="16" rx="8"/><rect fill="${P.steelDeep}" x="68" y="-6" width="26" height="12" rx="4"/>
  <ellipse fill="${P.char}" cx="160" cy="2" rx="72" ry="28"/><ellipse fill="${P.charDeep}" class="thin" cx="160" cy="-2" rx="60" ry="20"/>
  <path fill="${P.egg}" class="thin" d="M126 -4 Q124 -16 144 -16 Q156 -24 172 -16 Q192 -14 188 -2 Q190 10 170 8 Q150 14 136 8 Q122 6 126 -4Z"/>
  <ellipse fill="${P.mustard}" class="thin" cx="158" cy="-5" rx="12" ry="9"/><path class="n" fill="#fff" d="M152 -9 Q156 -12 160 -10 Q156 -8 152 -9Z"/></g>`;
const soupPot = (c = P.teal) => `<g>
  <rect fill="${c}" x="-66" y="-58" width="16" height="12" rx="5"/><rect fill="${c}" x="50" y="-58" width="16" height="12" rx="5"/>
  <path fill="${c}" d="M-54 -66 L54 -66 L50 -6 Q49 0 42 0 L-42 0 Q-49 0 -50 -6Z"/>
  <path fill="${P.steel}" d="M-58 -64 Q0 -92 58 -64Z"/><circle fill="${P.charDeep}" cx="0" cy="-86" r="8"/>
  <path ${tl(P.cream)} d="M-50 -24 L50 -24"/></g>`;
const kettle = (c = P.cream) => `<g>
  <path class="d" style="stroke-width:5" d="M-26 -60 Q0 -96 26 -60"/>
  <path fill="${c}" d="M30 -40 L58 -60 L62 -54 L40 -30Z"/>
  <path fill="${c}" d="M-44 -6 Q-50 -54 0 -60 Q50 -54 44 -6 Q42 0 34 0 L-34 0 Q-42 0 -44 -6Z"/>
  <path fill="${P.blueDeep}" class="thin" d="M-30 -34 Q-18 -44 -8 -34 Q-18 -24 -30 -34Z M8 -34 Q18 -44 30 -34 Q18 -24 8 -34Z"/><circle fill="${P.blueDeep}" class="thin" cx="0" cy="-20" r="6"/>
  <rect fill="${P.charDeep}" x="-10" y="-66" width="20" height="8" rx="4"/></g>`;
const espresso = () => `<g>
  ${at(-26, -164, .6, cup(P.cream))}${at(20, -164, .6, cup(P.rose))}
  <rect fill="${P.steel}" x="-70" y="-166" width="140" height="14" rx="6"/>
  <rect fill="${P.rose}" x="-64" y="-154" width="128" height="146" rx="16"/>
  <circle fill="${P.cream}" cx="-30" cy="-118" r="16"/><path class="d" d="M-30 -118 L-22 -126"/>
  <circle fill="${P.charDeep}" cx="16" cy="-124" r="7"/><circle fill="${P.charDeep}" cx="38" cy="-124" r="7"/>
  <rect fill="${P.steel}" x="-20" y="-86" width="40" height="16" rx="5"/><rect fill="${P.charDeep}" x="20" y="-82" width="46" height="10" rx="5"/>
  <rect fill="${P.steel}" x="-54" y="-18" width="108" height="18" rx="6"/>
  ${at(0, -18, .8, cup(P.cream))}
  <path ${tl(P.white, `stroke:#fff;stroke-width:4;opacity:.8`)} d="M-52 -140 L-52 -104"/></g>`;
const toaster = () => `<g>
  <rect fill="${P.toast}" x="-38" y="-94" width="30" height="36" rx="6"/><rect fill="${P.toast}" x="6" y="-90" width="30" height="32" rx="6"/>
  <rect fill="${P.mint}" x="-56" y="-72" width="112" height="72" rx="24"/><rect fill="${P.charDeep}" x="56" y="-52" width="14" height="10" rx="4"/>
  <circle fill="${P.cream}" cx="-30" cy="-30" r="8"/><path ${tl(P.white)} d="M-44 -58 L-20 -58"/></g>`;
const fruitBowl = (c = P.terra) => `<g>
  <ellipse fill="${P.lemon}" cx="-26" cy="-42" rx="22" ry="17"/><ellipse fill="${P.lemon}" cx="22" cy="-44" rx="22" ry="17"/>
  <circle fill="${P.berry}" cx="-2" cy="-56" r="18"/><path class="d" d="M-2 -74 Q0 -82 6 -84"/>
  <path fill="${c}" d="M-60 -40 L60 -40 Q56 0 0 0 Q-56 0 -60 -40Z"/>
  <g class="n" fill="${P.cream}"><circle cx="-34" cy="-22" r="4"/><circle cx="0" cy="-16" r="4"/><circle cx="34" cy="-22" r="4"/></g></g>`;
const basket = (inner = '', w = 110, h = 60) => `<g>${inner}
  <path class="d" style="stroke-width:5" d="M${-w / 3} ${-h} Q0 ${-h - 50} ${w / 3} ${-h}"/>
  <path fill="${P.wood}" d="M${-w / 2} ${-h} L${w / 2} ${-h} L${w / 2 - 8} -4 Q${w / 2 - 9} 0 ${w / 2 - 14} 0 L${-w / 2 + 14} 0 Q${-w / 2 + 9} 0 ${-w / 2 + 8} -4Z"/>
  <path ${tl(P.woodDeep)} d="M${-w / 2 + 4} ${-h * .66} L${w / 2 - 4} ${-h * .66} M${-w / 2 + 6} ${-h * .33} L${w / 2 - 6} ${-h * .33}"/>
  <rect fill="${P.woodLight}" x="${-w / 2 - 4}" y="${-h - 8}" width="${w + 8}" height="12" rx="6"/></g>`;
const bread = () => `<path fill="${P.crust}" d="M-50 0 Q-60 -44 -20 -50 Q0 -54 20 -50 Q60 -44 50 0Z"/><path class="d" d="M-26 -40 L-16 -18 M-2 -44 L8 -20 M22 -40 L30 -18"/>`;
const eggCarton = () => `<g>${[-36, -12, 12, 36].map((x, i) => `<ellipse fill="${i % 2 ? P.egg : '#F2DCC4'}" cx="${x}" cy="-30" rx="11" ry="14"/>`).join('')}<path fill="${P.warmGrey}" d="M-52 -26 L52 -26 L48 0 L-48 0Z"/><path ${tl(P.warmGreyDeep)} d="M-24 -22 L-24 -4 M0 -22 L0 -4 M24 -22 L24 -4"/></g>`;
const lantern = () => `<g>
  <path class="d" style="stroke-width:4" d="M-12 -104 Q0 -124 12 -104"/>
  <path fill="${P.woodDark}" d="M-20 -104 L20 -104 L26 -88 L-26 -88Z"/>
  <rect fill="${P.butter}" x="-20" y="-88" width="40" height="72" rx="6"/><path ${tl(P.woodDark)} d="M-6 -86 L-6 -18 M6 -86 L6 -18"/>
  <ellipse class="n" fill="#fff" opacity=".7" cx="0" cy="-54" rx="7" ry="12"/>
  <rect fill="${P.woodDark}" x="-26" y="-16" width="52" height="16" rx="5"/></g>`;
const canister = (c, icon, w = 54, h = 70) => `<g><rect fill="${c}" x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="8"/><rect fill="${c}" x="${-w / 2 - 3}" y="${-h - 12}" width="${w + 6}" height="14" rx="6"/><circle fill="${P.woodDeep}" cx="0" cy="${-h - 18}" r="6"/>${at(0, -h / 2 + 4, 1, icon)}</g>`;
const beanIcon = `<ellipse class="thin" fill="${P.choc}" cx="0" cy="0" rx="9" ry="12" transform="rotate(20)"/><path class="d" d="M-2 -10 Q4 0 -2 10" transform="rotate(20)"/>`;
const leafIcon = `<g transform="translate(0 10)">${leaf(22, 9, 0, P.leaf)}</g>`;
const flourSack = () => `<g><path fill="${P.oat}" d="M-40 0 Q-50 -54 -32 -86 L-22 -96 L22 -96 L32 -86 Q50 -54 40 0Z"/><path fill="${P.woodDeep}" d="M-26 -86 L26 -86 L26 -76 L-26 -76Z"/>
  <path fill="${P.oat}" d="M-18 -96 L-26 -110 L-10 -104 L0 -114 L10 -104 L26 -110 L18 -96Z"/>${leaf(26, 7, -20, P.mustard, -4, -24)}${leaf(26, 7, 20, P.mustard, 4, -24)}<path class="d" d="M0 -20 L0 -54"/></g>`;
const wateringCan = () => `<g><path fill="${P.mustard}" d="M30 -44 L78 -80 L84 -72 L40 -30Z"/><path class="d" style="stroke-width:6" d="M-40 -66 Q-66 -60 -44 -24"/><path fill="${P.mustard}" d="M-40 0 L-44 -70 L40 -70 L36 0Z"/><rect fill="${P.mustardDeep}" x="-46" y="-78" width="92" height="12" rx="6"/></g>`;
const catLoaf = () => `<g>
  <path fill="${P.peach}" d="M-66 0 Q-72 -48 -30 -58 Q10 -66 44 -54 Q72 -40 66 0Z"/>
  <path ${tl(P.terra)} d="M0 -58 Q6 -44 0 -32 M22 -56 Q28 -42 22 -30 M42 -50 Q48 -38 42 -28"/>
  <path fill="${P.peach}" d="M-66 -54 L-60 -86 L-42 -66Z"/><path fill="${P.peach}" d="M-20 -66 L-18 -94 L-2 -70Z"/>
  <ellipse fill="${P.peach}" cx="-38" cy="-42" rx="36" ry="30"/>
  <path class="d" style="stroke-width:4" d="M-58 -42 Q-52 -36 -46 -42 M-32 -42 Q-26 -36 -20 -42"/><path class="n" fill="${P.roseDeep}" d="M-42 -32 L-36 -32 L-39 -28Z"/>
  <path fill="${P.peach}" d="M60 -6 Q30 8 -26 0 Q-36 -2 -34 -10 Q10 -4 56 -20Z"/></g>`;
const pendant = (len, shade = P.sage) => `<g><path class="d" d="M0 0 L0 ${len}"/>
  <ellipse class="n" fill="#FFF6D8" opacity=".45" cx="0" cy="${len + 48}" rx="70" ry="60"/>
  <path fill="${shade}" d="M-54 ${len + 40} Q-50 ${len} 0 ${len - 4} Q50 ${len} 54 ${len + 40}Z"/><rect fill="${P.woodDark}" x="-9" y="${len - 12}" width="18" height="12" rx="3"/>
  <circle fill="#FFF3C9" cx="0" cy="${len + 46}" r="14"/></g>`;
const bulb = (len) => `<g><path class="d" d="M0 0 L0 ${len}"/><ellipse class="n" fill="#FFF6D8" opacity=".5" cx="0" cy="${len + 30}" rx="54" ry="54"/><rect fill="${P.charDeep}" x="-9" y="${len}" width="18" height="16" rx="3"/><path fill="#FFF7E0" d="M-8 ${len + 16} L8 ${len + 16} L10 ${len + 22} Q26 ${len + 32} 24 ${len + 48} Q20 ${len + 66} 0 ${len + 66} Q-20 ${len + 66} -24 ${len + 48} Q-26 ${len + 32} -10 ${len + 22}Z"/><path class="d" style="stroke-width:2.5" d="M-4 ${len + 22} L-4 ${len + 40} Q0 ${len + 48} 4 ${len + 40} L4 ${len + 22}"/></g>`;
const cuttingBoard = () => `<g><rect fill="${P.woodLight}" x="-8" y="-150" width="16" height="30" rx="8"/><circle fill="${P.woodLight}" cx="0" cy="-150" r="5" class="thin"/><rect fill="${P.woodLight}" x="-48" y="-128" width="96" height="128" rx="30"/><path ${tl(P.wood)} d="M-30 -100 Q-24 -60 -30 -24 M14 -110 Q20 -60 14 -18"/></g>`;
const mixingBowl = () => `<g><path class="d" style="stroke-width:5" d="M6 -60 L40 -120"/><path fill="${P.steel}" class="thin" d="M40 -120 Q52 -148 60 -136 Q64 -122 40 -120Z"/><ellipse fill="${P.butter}" cx="0" cy="-62" rx="66" ry="12"/><path fill="${P.cream}" d="M-74 -62 L74 -62 Q66 0 0 0 Q-66 0 -74 -62Z"/><path ${tl(P.roseDeep, `stroke:${P.roseDeep};stroke-width:6`)} d="M-68 -40 Q0 -28 68 -40"/></g>`;
const lemonade = () => `<g><rect fill="${P.glass}" x="-30" y="-110" width="60" height="110" rx="10"/><path fill="${P.lemon}" class="thin" d="M-25 -76 L25 -76 L25 -9 Q25 -5 21 -5 L-21 -5 Q-25 -5 -25 -9Z"/><circle class="thin" fill="${P.cream}" cx="-6" cy="-40" r="11"/><path fill="${P.teal}" d="M-32 -110 L32 -110 L28 -122 L-28 -122Z"/><path class="d" d="M8 -122 L20 -150"/></g>`;
const vase = () => `<g>${[[-18, -110, P.rose], [14, -124, P.butter], [0, -140, P.blush]].map(([x, y, c]) => `<path class="d" d="M0 -40 Q${x / 2} ${(y - 40) / 2} ${x} ${y}"/><path fill="${c}" d="${scallop(x, y, 13, 13, 6, 6)}"/><circle fill="${P.mustard}" cx="${x}" cy="${y}" r="5" class="thin"/>`).join('')}${leaf(30, 9, -40, P.leaf, -2, -54)}${leaf(26, 8, 40, P.leafDeep, 2, -60)}
  <path fill="${P.blue}" d="M-14 -50 L14 -50 L12 -40 Q30 -30 26 -10 Q24 0 14 0 L-14 0 Q-24 0 -26 -10 Q-30 -30 -12 -40Z"/></g>`;
const ladle = () => `<g><circle fill="${P.steel}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.steel}" x="-5" y="4" width="10" height="72" rx="5"/><path fill="${P.steel}" d="M-20 76 L20 76 Q20 100 0 100 Q-20 100 -20 76Z"/></g>`;
const whisk = () => `<g><circle fill="${P.rose}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.rose}" x="-6" y="4" width="12" height="36" rx="6"/><path class="d" d="M-4 40 Q-22 80 0 96 Q22 80 4 40 M0 40 L0 96 M-2 40 Q-12 80 0 96 Q12 80 2 40"/></g>`;
const spatula = () => `<g><circle fill="${P.woodDeep}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.woodDeep}" x="-5" y="4" width="10" height="54" rx="5"/><rect fill="${P.woodDeep}" x="-16" y="56" width="32" height="40" rx="6"/><path class="d" d="M-6 64 L-6 88 M6 64 L6 88"/></g>`;
const smallPan = () => `<g><circle fill="${P.char}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.char}" x="-6" y="4" width="12" height="44" rx="6"/><circle fill="${P.char}" cx="0" cy="88" r="42"/><circle fill="${P.charHi}" class="thin" cx="0" cy="88" r="32"/></g>`;
const stool = (c = P.oat) => `<g><path class="d" style="stroke-width:5" d="M-30 -60 L-40 0 M30 -60 L40 0 M-10 -60 L-12 -6 M10 -60 L12 -6"/>
  <rect fill="${P.wood}" x="-42" y="-8" width="10" height="8" rx="3"/><rect fill="${P.wood}" x="32" y="-8" width="10" height="8" rx="3"/>
  <path fill="${P.wood}" d="M-34 -64 L-46 -2 L-38 -2 L-26 -64Z"/><path fill="${P.wood}" d="M34 -64 L46 -2 L38 -2 L26 -64Z"/>
  <rect fill="${P.woodDeep}" x="-38" y="-34" width="76" height="8" rx="4"/>
  <rect fill="${c}" x="-50" y="-76" width="100" height="20" rx="10"/><ellipse fill="${c}" cx="0" cy="-76" rx="50" ry="10"/></g>`;
const chairBack = (c = P.wood) => `<g><rect fill="${c}" x="-54" y="-150" width="12" height="150" rx="5"/><rect fill="${c}" x="42" y="-150" width="12" height="150" rx="5"/><path fill="${c}" d="M-54 -150 Q0 -174 54 -150 L54 -126 Q0 -148 -54 -126Z"/><rect fill="${c}" x="-44" y="-100" width="88" height="12" rx="5"/></g>`;

// UI: big round buttons (only saturated colours in the game). Centre origin.
const uiIcons = {
  home: `<path fill="#fff" d="M0 -34 L34 -4 L24 -4 L24 28 L8 28 L8 8 L-8 8 L-8 28 L-24 28 L-24 -4 L-34 -4Z"/>`,
  camera: `<path fill="#fff" d="M-36 -18 Q-36 -24 -30 -24 L-16 -24 L-10 -34 L10 -34 L16 -24 L30 -24 Q36 -24 36 -18 L36 22 Q36 28 30 28 L-30 28 Q-36 28 -36 22Z"/><circle fill="${UI.sky}" cx="0" cy="2" r="14"/><circle fill="#fff" cx="0" cy="2" r="6"/>`,
  hanger: `<path fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M-8 -20 Q-8 -34 4 -34 Q14 -34 14 -24 Q14 -16 0 -10 L0 -4 L-38 20 Q-42 26 -34 26 L34 26 Q42 26 38 20 L0 -4"/>`,
  people: `<circle fill="#fff" cx="-16" cy="-18" r="13"/><path fill="#fff" d="M-36 26 Q-36 -2 -16 -2 Q4 -2 4 26Z"/><circle fill="#fff" cx="18" cy="-10" r="11"/><path fill="#fff" d="M2 28 Q2 4 18 4 Q34 4 34 28Z"/>`,
};
const button = (color, icon, r = 66) => `<g class="ui"><circle fill="#000" opacity=".16" cx="0" cy="7" r="${r + 12}"/><circle fill="#fff" r="${r + 12}"/><circle fill="${color}" r="${r}"/><path fill="#000" opacity=".08" d="M${-r} 0 A${r} ${r} 0 0 0 ${r} 0 A${r} ${r * .8} 0 0 1 ${-r} 0Z"/>${uiIcons[icon]}</g>`;

// ---------------------------------------------------------------------------
// ROOM. Back wall 0..WALL_Y, floor below. Front-on dollhouse view.
// ---------------------------------------------------------------------------
const W = 2048, H = 1536, WALL_Y = 1010, VP = [1024, 520];
const DEFS = `<defs>
  <pattern id="brick" width="192" height="96" patternUnits="userSpaceOnUse">
    <rect width="192" height="96" fill="${P.mortar}"/>
    ${[[3, 3, 90], [99, 3, 90], [-45, 35, 90], [51, 35, 90], [147, 35, 90], [3, 67, 90], [99, 67, 90]].map(([x, y, w], i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="26" rx="4" fill="${[P.brick, P.brickDeep, P.brick, P.brick, P.brickDeep, P.brick, P.brick][i]}"/>`).join('')}
    <rect x="195" y="35" width="90" height="26" rx="4" fill="${P.brick}"/>
  </pattern>
  <pattern id="tile" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="${P.mint}"/><path d="M0 43 L44 43 M43 0 L43 44" stroke="#AFD2C5" stroke-width="3"/></pattern>
</defs>`;

function floor() {
  let lines = '', ticks = '';
  let y = WALL_Y, gap = 26, row = 0;
  while (y < H) {
    y += gap; gap *= 1.16; row++;
    lines += `M0 ${f(y)} L${W} ${f(y)} `;
    for (let x = (row % 2) * 110 - 60; x < W + 100; x += 420 + row * 30) {
      const yTop = y - gap / 1.16, t = (yTop - VP[1]) / (y - VP[1]);
      const xTop = VP[0] + (x - VP[0]) * t;
      ticks += `M${f(xTop)} ${f(yTop)} L${f(x)} ${f(y)} `;
    }
  }
  return `<rect class="n" x="0" y="${WALL_Y}" width="${W}" height="${H - WALL_Y}" fill="${P.floor}"/>
  <path ${tl(P.floorLine)} d="${lines}"/><path ${tl(P.floorLine)} d="${ticks}"/>`;
}
function wall() {
  return `<rect class="n" width="${W}" height="${WALL_Y}" fill="url(#brick)"/>
  <rect class="n" x="0" y="0" width="${W}" height="${WALL_Y}" fill="${P.cream}" opacity=".18"/>
  <rect fill="${P.cream}" x="-10" y="${WALL_Y - 26}" width="${W + 20}" height="28"/>`;
}
const shelfBoard = (x0, x1, y) => `<rect fill="${P.woodLight}" x="${x0}" y="${y - 10}" width="${x1 - x0}" height="12"/><rect fill="${P.wood}" x="${x0}" y="${y + 2}" width="${x1 - x0}" height="16" rx="3"/>
  <path fill="${P.woodDeep}" d="M${x0 + 30} ${y + 18} L${x0 + 30} ${y + 50} L${x0 + 58} ${y + 18}Z"/><path fill="${P.woodDeep}" d="M${x1 - 30} ${y + 18} L${x1 - 30} ${y + 50} L${x1 - 58} ${y + 18}Z"/>`;

function leftShelves() {
  const X0 = 60, X1 = 560;
  const s1 = 250, s2 = 450, s3 = 640, s4 = 820;
  return `<g id="left-shelves">
  ${shelfBoard(X0, X1, s1)}${shelfBoard(X0, X1, s2)}${shelfBoard(X0, X1, s3)}${shelfBoard(X0, X1, s4)}
  ${at(120, s1 - 4, 1, basket(`${[-50, -20, 10, 40].map((a, i) => leaf(56, 18, a, i % 2 ? P.leaf : P.leafDeep, 0, -56)).join('')}`, 110, 62))}
  ${at(212, s1 - 4, 1, lantern())}
  ${at(290, s1 - 4, 1, bookStack([[96, 18, P.sage], [84, 16, P.rose], [90, 18, P.cream]]))}${at(290, s1 - 56, .7, succulent(P.cream))}
  ${at(390, s1 - 4, 1, jar(58, 84, P.choc, P.woodDeep, .7, P.woodDark, true))}
  ${at(462, s1 - 4, 1, jar(46, 60, P.butter, P.rose, .6, P.mustard))}
  ${at(522, s1 - 4, .9, plantLeafy(P.blue, 1))}
  ${at(116, s2 - 4, 1, plantLeafy(P.terra, 1.25, true))}
  ${at(222, s2 - 4, 1, basket(at(0, -58, .8, bread()), 110, 58))}
  ${at(310, s2 - 4, 1, bottle(P.leafDeep, 118))}${at(356, s2 - 4, .9, bottle(P.terraDeep, 100, P.butter))}
  ${at(430, s2 - 4, 1, canister(P.cream, beanIcon, 60, 76))}
  ${at(508, s2 - 4, 1, canister(P.sage, leafIcon, 52, 60))}
  ${at(120, s3 - 4, 1, eggCarton())}
  ${at(210, s3 - 4, .8, plantLeafy(P.cream, .9))}
  ${at(300, s3 - 4, 1, plates(6, 104))}${at(300, s3 - 58, .9, bowlStack())}
  ${at(400, s3 - 4, 1, mug(P.rose, heart(0, -26, 1, P.cream)))}${at(456, s3 - 4, 1, mug(P.cream, `<path ${tl(P.tealDeep)} d="M-20 -36 L20 -36 M-20 -26 L20 -26"/>`))}${at(514, s3 - 4, 1, mug(P.sage))}
  ${at(120, s4 - 4, 1, jar(64, 96, '#F3E9D6', P.terra, .75, null, true))}${at(190, s4 - 4, 1, jar(50, 74, P.berry, P.cream, .7, P.roseDeep))}
  ${at(262, s4 - 4, 1, jar(50, 90, P.mustard, P.woodDeep, .65, P.mustardDeep))}
  ${at(360, s4 - 4, 1, teapot(P.rose, P.cream))}
  ${at(460, s4 - 4, .85, snake(P.cream))}
  ${at(530, s4 - 4, 1, books([[18, 70, P.terra], [16, 80, P.teal], [20, 64, P.mustard]]))}
  ${at(160, WALL_Y + 20, 1, flourSack())}${at(262, WALL_Y + 16, 1, flourSack())}
  ${at(420, WALL_Y + 22, 1, wateringCan())}
  ${at(510, WALL_Y + 24, 1, basket(`${[P.lemon, P.berry, P.lemon].map((c, i) => `<circle fill="${c}" cx="${-26 + i * 26}" cy="-58" r="17"/>`).join('')}`, 96, 56))}
  </g>`;
}
function fridge() {
  const x = 590, w = 250, top = 380, bot = WALL_Y + 24;
  return `<g id="fridge">
  <rect fill="${P.charDeep}" x="${x + 10}" y="${bot - 14}" width="${w - 20}" height="14" rx="4"/>
  <rect fill="${P.char}" x="${x}" y="${top}" width="${w}" height="${bot - top - 12}" rx="26"/>
  <path class="n" fill="${P.charHi}" d="M${x + 40} ${top + 30} L${x + 90} ${top + 30} L${x + 20} ${top + 200} L${x + 20} ${top + 110}Z"/>
  <path class="n" fill="${P.charHi}" d="M${x + 110} ${top + 30} L${x + 130} ${top + 30} L${x + 20} ${top + 300} L${x + 20} ${top + 250}Z"/>
  <path class="d" d="M${x} ${top + 250} L${x + w} ${top + 250}"/>
  <rect fill="${P.steel}" x="${x + w - 38}" y="${top + 60}" width="16" height="150" rx="8"/><rect fill="${P.steel}" x="${x + w - 38}" y="${top + 290}" width="16" height="200" rx="8"/>
  <g transform="translate(${x + 40} ${top + 290}) rotate(-6)"><rect fill="#fff" x="0" y="0" width="110" height="84" rx="4"/><path class="n" fill="${P.sky}" d="M4 4 L106 4 L106 50 L4 50Z"/><path fill="${P.leaf}" class="thin" d="M4 80 L4 52 Q30 30 56 52 Q80 36 106 54 L106 80Z"/><circle class="thin" fill="${P.lemon}" cx="84" cy="22" r="10"/>
    <path class="d" d="M26 66 L26 50 M18 58 L34 58"/><circle cx="26" cy="44" r="6" fill="${P.rose}" class="thin"/><circle fill="${P.berry}" cx="55" cy="0" r="7"/></g>
  <circle fill="${P.lemon}" cx="${x + 60}" cy="${top + 130}" r="13"/><path fill="${P.leaf}" class="thin" d="${star(x + 110, top + 160, 14, 7)}"/>${heart(x + 70, top + 200, 1.6, P.rose)}
  ${at(x + 70, top - 2, .8, plantLeafy(P.cream, 1))}${at(x + 170, top - 2, 1, jar(80, 80, P.crust, P.rose, .5, P.choc, false))}
  </g>`;
}
function windowArt() {
  const x = 880, y = 110, w = 260, h = 380;
  return `<g id="window">
  <rect fill="#fff" x="${x - 18}" y="${y - 18}" width="${w + 36}" height="${h + 36}" rx="6"/>
  <rect class="n" fill="${P.sky}" x="${x}" y="${y}" width="${w}" height="${h}"/>
  <path class="n" fill="#fff" d="M${x + 40} ${y + 110} q0 -30 30 -30 q10 -24 38 -18 q26 -6 34 20 q26 2 24 28Z"/>
  <path class="n" fill="${P.leafLight}" d="M${x} ${y + h} L${x} ${y + 290} Q${x + 50} ${y + 250} ${x + 100} ${y + 290} Q${x + 170} ${y + 240} ${x + w} ${y + 280} L${x + w} ${y + h}Z"/>
  <path class="n" fill="${P.sage}" d="M${x} ${y + h} L${x} ${y + 330} Q${x + 80} ${y + 300} ${x + 150} ${y + 330} Q${x + 210} ${y + 300} ${x + w} ${y + 330} L${x + w} ${y + h}Z"/>
  <rect fill="none" x="${x}" y="${y}" width="${w}" height="${h}"/>
  <rect fill="#fff" x="${x + w / 2 - 8}" y="${y}" width="16" height="${h}"/><rect fill="#fff" x="${x}" y="${y + 180}" width="${w}" height="16"/>
  <path ${tl('#fff', `stroke:#fff;stroke-width:6;opacity:.8`)} d="M${x + 20} ${y + 60} L${x + 60} ${y + 20} M${x + 20} ${y + 90} L${x + 90} ${y + 20}"/>
  <path fill="${P.rose}" d="M${x - 24} ${y - 22} L${x + w + 24} ${y - 22} L${x + w + 24} ${y + 40} ${[...Array(9)].map((_, i) => { const xx = x + w + 24 - (i + 1) * (w + 48) / 9; return `Q${f(xx + (w + 48) / 18)} ${y + 62} ${f(xx)} ${y + 40}`; }).join(' ')}Z"/>
  <path ${tl(P.cream, `stroke:${P.cream};stroke-width:5`)} d="M${x - 20} ${y + 8} L${x + w + 20} ${y + 8}"/>
  <rect fill="#fff" x="${x - 34}" y="${y + h + 8}" width="${w + 68}" height="20" rx="4"/>
  ${at(x + 20, y + h + 10, .55, plantLeafy(P.terra, 1))}${at(x + 90, y + h + 10, .6, succulent(P.rose))}${at(x + 170, y + h + 10, .8, lemonade())}${at(x + 232, y + h + 10, .5, snake(P.cream))}
  </g>`;
}
function cabinets(x0, x1, top, bot, doors, color = P.sage, shade = P.sageDeep) {
  let s = `<rect fill="${color}" x="${x0}" y="${top}" width="${x1 - x0}" height="${bot - top}"/>`;
  const dw = (x1 - x0) / doors;
  for (let i = 0; i < doors; i++) {
    const dx = x0 + i * dw;
    s += `<rect fill="${color}" x="${f(dx + 10)}" y="${top + 12}" width="${f(dw - 20)}" height="${bot - top - 36}" rx="6"/><rect class="thin" fill="none" x="${f(dx + 22)}" y="${top + 24}" width="${f(dw - 44)}" height="${bot - top - 60}" rx="4" style="stroke:${shade}"/>`;
    s += `<circle fill="${P.woodLight}" cx="${f(dx + (i % 2 ? 26 : dw - 26))}" cy="${top + 50}" r="7"/>`;
  }
  return s + `<rect fill="${shade}" x="${x0}" y="${bot - 16}" width="${x1 - x0}" height="16"/>`;
}
function backCounter() {
  const x0 = 850, x1 = 1520, top = 720, bot = WALL_Y + 24;
  const sx = 1170, sw = 250; // stove
  return `<g id="back-counter">
  <rect class="n" fill="url(#tile)" x="${x0}" y="530" width="${x1 - x0}" height="${top - 530}"/>
  <path class="d" d="M${x0} 530 L${x1} 530"/>
  ${cabinets(x0, sx, top + 30, bot, 3)}
  ${cabinets(sx + sw, x1, top + 30, bot, 1)}
  <rect fill="${P.char}" x="${sx}" y="${top + 30}" width="${sw}" height="${bot - top - 30}"/>
  ${[0, 1, 2, 3].map((i) => `<circle fill="${P.steel}" cx="${sx + 40 + i * 56}" cy="${top + 58}" r="11"/>`).join('')}
  <rect fill="${P.charDeep}" x="${sx + 24}" y="${top + 92}" width="${sw - 48}" height="${bot - top - 150}" rx="12"/>
  <rect class="n" fill="${P.terra}" opacity=".5" x="${sx + 40}" y="${top + 150}" width="${sw - 80}" height="${bot - top - 230}" rx="8"/>
  <rect fill="${P.steel}" x="${sx + 30}" y="${top + 80}" width="${sw - 60}" height="12" rx="6"/>
  <rect fill="${P.woodLight}" x="${x0 - 10}" y="${top}" width="${x1 - x0 + 20}" height="14"/><rect fill="${P.wood}" x="${x0 - 14}" y="${top + 14}" width="${x1 - x0 + 28}" height="20" rx="4"/>
  <rect fill="${P.charDeep}" x="${sx + 20}" y="${top + 2}" width="${sw - 40}" height="10" rx="4"/>
  <rect fill="${P.steelDeep}" x="${x0 + 60}" y="${top + 2}" width="190" height="10" rx="4"/>
  <path fill="${P.steel}" d="M${x0 + 146} ${top} L${x0 + 146} ${top - 70} Q${x0 + 146} ${top - 104} ${x0 + 180} ${top - 104} Q${x0 + 210} ${top - 104} ${x0 + 210} ${top - 76} L${x0 + 196} ${top - 76} Q${x0 + 196} ${top - 90} ${x0 + 180} ${top - 90} Q${x0 + 160} ${top - 90} ${x0 + 160} ${top - 70} L${x0 + 160} ${top}Z"/>
  <rect fill="${P.steel}" x="${x0 + 128}" y="${top - 16}" width="12" height="16" rx="3"/><rect fill="${P.steel}" x="${x0 + 166}" y="${top - 16}" width="12" height="16" rx="3"/>
  ${at(x0 + 40, top + 2, 1, cuttingBoard())}
  ${at(x0 + 310, top + 2, 1, toaster())}
  ${at(sx + 70, top + 2, 1, soupPot(P.teal))}${at(sx + 184, top + 2, .9, kettle())}
  ${at(x1 - 50, top + 2, .8, espresso())}
  </g>`;
}
function rightShelves() {
  const X0 = 1170, X1 = 1520, s1 = 250, s2 = 420;
  return `<g id="right-shelves">
  ${shelfBoard(X0, X1, s1)}${shelfBoard(X0, X1, s2)}
  ${at(1215, s1 - 4, .9, plantLeafy(P.sage, 1))}
  ${at(1290, s1 - 4, 1, books([[20, 86, P.terra], [18, 96, P.mustard], [22, 80, P.sage], [18, 90, P.rose]]))}
  ${at(1370, s1 - 4, 1, canister(P.rose, heart(0, 0, 1.2, P.cream), 56, 64))}
  ${at(1450, s1 - 4, 1, jar(60, 70, P.sage, P.woodDeep, .55, P.leafDeep, true))}
  ${at(1210, s2 - 4, 1, jar(52, 64, P.butter, P.teal, .7))}${at(1270, s2 - 4, 1, mug(P.mustard))}
  ${at(1350, s2 - 4, 1, plates(4, 90, P.blue))}${at(1350, s2 - 44, .8, teapot(P.cream, P.blue))}
  ${at(1440, s2 - 4, 1, cup(P.rose))}${at(1488, s2 - 4, 1, cup(P.teal))}
  <rect fill="${P.steelDeep}" x="1190" y="540" width="300" height="10" rx="5"/>
  ${at(1220, 545, 1, ladle())}${at(1280, 545, 1, whisk())}${at(1340, 545, 1, spatula())}${at(1430, 545, 1, smallPan())}
  </g>`;
}
function displayCase() {
  const x0 = 1560, x1 = 1920, top = 640, mid = 830, bot = WALL_Y + 30;
  return `<g id="display-case">
  ${cabinets(x0, x1, mid, bot, 2, P.rose, P.roseDeep)}
  <rect fill="${P.woodLight}" x="${x0 - 12}" y="${mid - 14}" width="${x1 - x0 + 24}" height="14"/><rect fill="${P.wood}" x="${x0 - 14}" y="${mid}" width="${x1 - x0 + 28}" height="18" rx="4"/>
  <rect fill="${P.glass}" x="${x0}" y="${top}" width="${x1 - x0}" height="${mid - top - 14}" rx="10"/>
  <rect fill="${P.woodLight}" x="${x0 + 10}" y="${top + 86}" width="${x1 - x0 - 20}" height="10"/>
  ${at(x0 + 60, top + 86, .7, croissant())}${at(x0 + 140, top + 86, .7, croissant())}${at(x0 + 230, top + 86, .8, cakeSlice())}${at(x0 + 310, top + 86, .8, cakeSlice())}
  ${at(x0 + 70, mid - 16, .6, cupcake(1))}${at(x0 + 130, mid - 16, .6, cupcake(1, P.butter))}${at(x0 + 190, mid - 16, .6, cupcake(1, P.mint))}${at(x0 + 280, mid - 16, .7, bread())}
  <path ${tl('#fff', `stroke:#fff;stroke-width:6;opacity:.9`)} d="M${x0 + 24} ${top + 60} L${x0 + 60} ${top + 20} M${x1 - 70} ${mid - 30} L${x1 - 30} ${mid - 70}"/>
  <rect fill="${P.wood}" x="${x0 - 8}" y="${top - 14}" width="${x1 - x0 + 16}" height="16" rx="4"/>
  ${at(x0 + 110, top - 14, 1, cakeStand(layerCake(.9), 150))}
  ${at(x1 - 90, top - 14, 1, catLoaf())}
  </g>`;
}
function menuBoard() {
  const x = 1600, y = 170, w = 290, h = 330;
  const chalk = `style="stroke:${P.cream}" class="tl"`;
  const row = (yy, icon) => `${at(x + 60, yy, 1, icon)}<path class="tl" style="stroke:${P.cream};stroke-dasharray:2 12" d="M${x + 100} ${yy - 10} L${x + 220} ${yy - 10}"/><circle class="n" fill="${P.butter}" cx="${x + 244}" cy="${yy - 10}" r="10"/>`;
  return `<g id="menu-board">
  <path class="d" d="M${x + 40} ${y} L${x + w / 2} ${y - 60} L${x + w - 40} ${y}"/><circle fill="${P.woodDark}" cx="${x + w / 2}" cy="${y - 60}" r="7"/>
  <rect fill="${P.woodDeep}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/><rect fill="${P.chalk}" x="${x + 16}" y="${y + 16}" width="${w - 32}" height="${h - 32}" rx="6"/>
  <path class="tl" style="stroke:${P.cream};stroke-width:4" d="M${x + 50} ${y + 50} Q${x + w / 2} ${y + 30} ${x + w - 50} ${y + 50}"/>
  ${row(y + 120, `<path ${chalk} d="M-20 -30 L20 -30 L17 -6 Q16 0 10 0 L-10 0 Q-16 0 -17 -6Z M20 -24 Q30 -24 29 -16 Q28 -10 18 -10 M-6 -40 Q-10 -48 -4 -54 M6 -40 Q2 -48 8 -54"/>`)}
  ${row(y + 190, `<path ${chalk} d="M-30 -4 Q-34 -20 -18 -24 Q0 -32 18 -24 Q34 -20 30 -4 Q16 0 0 -2 Q-16 0 -30 -4Z M-10 -26 Q-6 -14 -10 -4 M10 -26 Q14 -14 10 -4"/>`)}
  ${row(y + 260, `<path ${chalk} d="M-24 0 L24 0 L24 -26 L-24 -26Z M-28 -26 Q-28 -36 0 -36 Q28 -36 28 -26 M0 -36 L0 -46"/><circle ${chalk} cx="0" cy="-50" r="4"/>`)}
  </g>`;
}
function island() {
  const x0 = 760, x1 = 1320, top = 900, bot = 1170;
  return `<g id="island">
  <rect fill="${P.woodLight}" x="${x0 + 16}" y="${top + 30}" width="${x1 - x0 - 32}" height="${bot - top - 40}"/><path ${tl(P.wood)} d="${[...Array(9)].map((_, i) => `M${x0 + 70 + i * 52} ${top + 36} L${x0 + 70 + i * 52} ${bot - 76}`).join(' ')}"/>
  <rect fill="${P.wood}" x="${x0}" y="${top + 20}" width="28" height="${bot - top - 20}" rx="4"/><rect fill="${P.wood}" x="${x1 - 28}" y="${top + 20}" width="28" height="${bot - top - 20}" rx="4"/>
  <rect fill="${P.woodLight}" x="${x0 + 28}" y="${bot - 70}" width="${x1 - x0 - 56}" height="12"/><rect fill="${P.wood}" x="${x0 + 28}" y="${bot - 58}" width="${x1 - x0 - 56}" height="16"/>
  ${at(x0 + 120, bot - 64, 1, basket(`${[P.lemon, P.lemon].map((c, i) => `<circle fill="${c}" cx="${-18 + i * 36}" cy="-56" r="16"/>`).join('')}`, 100, 54))}
  ${at(x0 + 260, bot - 64, 1, plates(4, 110, P.cream))}${at(x0 + 400, bot - 64, .9, soupPot(P.rose))}
  <rect fill="${P.woodLight}" x="${x0 - 20}" y="${top}" width="${x1 - x0 + 40}" height="14"/><rect fill="${P.wood}" x="${x0 - 24}" y="${top + 14}" width="${x1 - x0 + 48}" height="22" rx="5"/>
  ${at(x0 + 70, top + 4, 1, mixingBowl())}
  ${at(x0 + 210, top + 4, 1, cakeStand(`${at(-34, 0, .55, cupcake(1))}${at(34, 0, .55, cupcake(1, P.butter))}${at(0, -2, .6, cupcake(1, P.mint))}`, 150, P.teal))}
  ${at(x0 + 340, top + 4, 1, `<rect fill="${P.woodLight}" x="-80" y="-14" width="160" height="16" rx="8"/>${at(-20, -14, .8, bread())}${at(46, -14, .45, croissant())}`)}
  ${at(x0 + 460, top + 4, 1, mug(P.cream, `<path ${tl(P.roseDeep)} d="M-20 -36 L20 -36 M-20 -26 L20 -26"/>`))}${at(x0 + 510, top + 4, .9, jar(40, 60, P.berry, P.cream, .7, P.roseDeep))}
  </g>`;
}
function dining() {
  const x0 = 70, x1 = 620, top = 1150;
  return `<g id="dining">
  <ellipse fill="${P.oat}" cx="360" cy="1420" rx="370" ry="104"/><ellipse class="n" fill="none" cx="360" cy="1420" rx="340" ry="84" style="stroke:${P.warmGrey};stroke-width:4;stroke-dasharray:14 12"/>
  ${at(190, 1240, 1, chairBack())}${at(470, 1240, 1, chairBack())}
  <path fill="${P.wood}" d="M${x0 + 30} ${top + 20} L${x0 + 30} 1420 L${x0 + 56} 1420 L${x0 + 56} ${top + 20}Z M${x1 - 56} ${top + 20} L${x1 - 56} 1420 L${x1 - 30} 1420 L${x1 - 30} ${top + 20}Z"/>
  <rect fill="${P.woodDeep}" x="${x0 + 56}" y="${top + 34}" width="${x1 - x0 - 112}" height="18"/>
  <rect fill="${P.woodLight}" x="${x0}" y="${top}" width="${x1 - x0}" height="16"/><rect fill="${P.wood}" x="${x0 - 6}" y="${top + 16}" width="${x1 - x0 + 12}" height="24" rx="5"/>
  ${at(190, top + 6, 1, fruitBowl(P.terra))}${at(330, top + 6, 1, vase())}${at(460, top + 6, .8, teapot(P.sage, P.cream))}${at(540, top + 6, .8, cup(P.rose))}
  ${at(220, 1500, 1, stool(P.oat))}${at(510, 1500, 1, stool(P.oat))}
  </g>`;
}
function stools() { return `${at(900, 1250, 1, stool(P.oat))}${at(1180, 1250, 1, stool(P.oat))}`; }

function kitchen() {
  return `<g class="o">
  ${wall()}${floor()}
  ${windowArt()}${leftShelves()}${fridge()}${rightShelves()}${backCounter()}${menuBoard()}${displayCase()}
  ${at(1990, WALL_Y + 40, 1.4, snake(P.terra))}
  ${at(1010, 0, 1, bulb(250))}${at(1545, 0, 1, bulb(300))}${at(700, 0, 1, pendant(150, P.sage))}
  ${at(820, 170, 1, hangingPlant(170, P.cream))}${at(1150, 150, 1, hangingPlant(150, P.terra))}${at(60, 110, 1, hangingPlant(110, P.oat))}${at(1960, 130, 1, hangingPlant(130, P.cream))}
  ${island()}${stools()}
  </g>`;
}
function dollhouseFrame() {
  return `<g class="o"><rect fill="#fff" x="-10" y="-10" width="36" height="${WALL_Y + 10}"/><rect fill="#fff" x="${W - 26}" y="-10" width="36" height="${WALL_Y + 10}"/>
  <path fill="#fff" d="M-10 ${WALL_Y} L26 ${WALL_Y} L-60 ${H + 10} L-100 ${H + 10}Z"/><path fill="#fff" d="M${W + 10} ${WALL_Y} L${W - 26} ${WALL_Y} L${W + 60} ${H + 10} L${W + 100} ${H + 10}Z"/></g>`;
}
function uiLayer() {
  return `${at(118, 118, 1, button(UI.tangerine, 'home'))}${at(290, 118, 1, button(UI.grass, 'hanger'))}${at(W - 118, 118, 1, button(UI.sky, 'camera'))}${at(W - 118, H - 118, 1, button(UI.sun, 'people'))}`;
}

// ---------------------------------------------------------------------------
// OUTPUT
// ---------------------------------------------------------------------------
const svgDoc = (vb, body, size = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size}>\n<style>${CSS}</style>${DEFS}\n<g class="o">${body}</g>\n</svg>\n`;
const write = (name, s) => fs.writeFileSync(path.join(SVG_DIR, name), s);
const CHARS = [[ZOE, '-130 -450 260 470'], [IAN, '-110 -370 220 390'], [CUST, '-130 -600 260 620']];
for (const [def, vb] of CHARS) write(`${def.name}.svg`, svgDoc(vb, character(def, { allFaces: true })));
write('kitchen-bg.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">\n<style>${CSS}</style>${DEFS}${kitchen()}${dollhouseFrame()}\n</svg>\n`);
const PROPS = {
  'prop-mug': ['-30 -64 72 70', mug(P.rose, heart(0, -26, 1, P.cream))],
  'prop-cupcake': ['-45 -110 90 115', cupcake(1)],
  'prop-croissant': ['-65 -58 130 64', croissant()],
  'prop-layer-cake': ['-80 -186 160 192', cakeStand(layerCake(.9), 150)],
  'prop-teapot': ['-70 -96 136 102', teapot(P.teal)],
  'prop-pan-egg': ['-20 -40 256 76', panWithEgg()],
  'prop-espresso': ['-80 -196 160 202', espresso()],
  'prop-plant': ['-70 -120 140 126', plantLeafy(P.terra)],
};
for (const [n, [vb, s]] of Object.entries(PROPS)) write(`${n}.svg`, svgDoc(vb, s));
write('ui-buttons.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 170">${['home', 'hanger', 'camera', 'people'].map((ic, i) => at(85 + i * 170, 85, 1, button([UI.tangerine, UI.grass, UI.sky, UI.sun][i], ic))).join('')}</svg>\n`);

// ---- mockup ----
const Z = { x: 1080, y: 1480 }, I = { x: 730, y: 1470 }, K = { x: 1470, y: 1460 };
const zArmR = aim(150, -30);
const [zhx, zhy] = handPos(ZOE, 'R', zArmR);
const zPan = at(zhx, zhy, .8, panWithEgg());
const iArmL = aim(-60, -70);
const [ihx, ihy] = handPos(IAN, 'L', iArmL);
const iCup = at(ihx, ihy + 10, .9, cupcake(1), -8);
const kArmR = aim(100, -40);
const [khx, khy] = handPos(CUST, 'R', kArmR);
const kMug = at(khx + 4, khy + 26, 1, mug(P.teal, heart(0, -26, 1, P.cream)));
const steam = (x, y) => `<g class="o"><path ${tl('#fff', `stroke:#fff;stroke-width:6;opacity:.85`)} d="M${x} ${y} q-12 -24 0 -48 q12 -24 0 -48 M${x + 26} ${y + 6} q-12 -24 0 -48 q12 -24 0 -48"/></g>`;
const mockBody = `${DEFS}
${kitchen()}
<g class="o">
${dining()}
${at(K.x, K.y, 1.08, character(CUST, { expr: 'yum', armL: 6, armR: kArmR, tilt: -4, inHandR: kMug }))}
${at(I.x, I.y, 1.12, character(IAN, { expr: 'cheeky', armL: iArmL, armR: -18, tilt: -5, inHandL: iCup, armLFront: true }))}
${at(Z.x, Z.y, 1.12, character(ZOE, { expr: 'laughing', armL: 14, armR: zArmR, tilt: 5, inHandR: zPan }))}
</g>
${steam(Z.x + (zhx + 128 * .8) * 1.12 - 14, Z.y + zhy * 1.12 - 26)}
<g class="o">${at(1760, 1520, .85, `${[-70,-45,-20,5,30,55,75].map((a,i)=>leaf(150+(i%3)*30, 44, a, i%2?P.leaf:P.leafDeep, 0, -110)).join('')}${leaf(190, 50, -8, P.leafLight, 0, -110)}${pot(P.terra, 170, 120)}`)}</g>
${dollhouseFrame()}
${uiLayer()}`;
fs.writeFileSync(path.join(HERE, 'mockup.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<style>${CSS}</style>${mockBody}\n</svg>\n`);

// ---- sheet: characters x expressions, props, UI ----
const label = (x, y, t) => `<text x="${x}" y="${y}" font-family="Avenir Next, Helvetica, sans-serif" font-size="22" font-weight="600" fill="${P.ink}" text-anchor="middle">${t}</text>`;
let sheetChars = '';
const rows = [[ZOE, 110, 540, .95], [IAN, 760, 540, 1.05], [CUST, 1420, 540, .78]];
for (const [def, x0, y, s] of rows) {
  Object.keys(def.faces).forEach((k, i) => {
    const x = x0 + i * 205;
    const poses = [{ armL: 10, armR: -10, tilt: 0 }, { armL: 150, armR: -150, tilt: -5, armLFront: true }, { armL: 30, armR: -40, tilt: 6 }][i];
    sheetChars += at(x, y, s, character(def, { expr: k, id: `${def.name}-s${i}`, ...poses })) + label(x, y + 48, `${def.name} · ${k}`);
  });
}
const headRow = [[ZOE, 180], [IAN, 820], [CUST, 1460]].map(([def, x0]) => Object.keys(def.faces).map((k, i) => {
  const { cy, rx, ry } = def.head; const hx = x0 + i * 190, hy = 760;
  return at(hx, hy, .9, `<g style="${Object.entries(def.vars).map(([a, b]) => `${a}:${b}`).join(';')}">${def.parts.hairBack()}${ears(rx, ry)}<path class="skin" d="${headShape(rx, ry)}"/>${def.faces[k]}${def.parts.hairFront()}</g>`);
}).join('')).join('');
const propRow = [[140, mug(P.rose, heart(0, -26, 1, P.cream)), 'mug'], [300, cupcake(1), 'cupcake'], [470, croissant(), 'croissant'], [660, cakeStand(layerCake(.9), 150), 'layer cake'],
  [850, teapot(P.teal), 'teapot'], [1030, panWithEgg(), 'pan + egg', .75, -100], [1250, espresso(), 'espresso'], [1420, plantLeafy(P.terra), 'plant'], [1560, jar(58, 84, P.choc, P.woodDeep, .7, P.woodDark, true), 'jar'], [1700, catLoaf(), 'cafe cat']]
  .map(([x, s, t, sc = 1, dx = 0]) => at(x + dx, 1090, sc, s) + label(x, 1130, t)).join('');
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1536" viewBox="0 0 2048 1536">
<style>${CSS}</style>${DEFS}
<rect width="2048" height="1536" fill="${P.cream}"/>
<g class="o">${sheetChars}${headRow}${propRow}</g>
${label(1024, 40, 'style v2 — characters × expressions (faces are swappable groups), props, UI')}
${[['home', UI.tangerine], ['hanger', UI.grass], ['camera', UI.sky], ['people', UI.sun]].map(([ic, c], i) => at(700 + i * 190, 1330, 1, button(c, ic))).join('')}
${Object.entries(P).filter(([k]) => !['mouth', 'tongue'].includes(k)).map(([k, v], i) => `<rect x="${40 + (i % 32) * 62}" y="${1450 + Math.floor(i / 32) * 40}" width="56" height="34" rx="6" fill="${v}" stroke="${P.ink}" stroke-width="2"/>`).join('')}
</svg>\n`;
fs.writeFileSync(path.join(HERE, 'sheet.svg'), sheet);
console.log('ok');
