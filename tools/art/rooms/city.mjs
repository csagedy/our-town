// The city map (P1.13, docs/design.md 2.6): the game's home screen. A cozy,
// dense little town seen front-on, wider than the screen so it pans.
//
// Authored in art units like the kitchen (1 art unit = ART_SCALE world units,
// world = art * ART_SCALE + offset). The world is 2400 x 1000 units, so the
// art is 3429 x 1429 plus the 100-unit world bleed.
//
// Unlike a room, the map is split into a static `back` and `front` layer plus
// separate *pieces*: every thing that reacts to a tap (the four buildings, the
// sun and moon, the birds, the school bus, the lots and the Lost & Found box)
// and every moving part (the cafe door, the theater curtains, the crane's jib
// and the school bell) is its own cropped raster, placed by a world box.
//
// Night: every layer and piece also builds a night variant from the same art.
// The day art goes through the NIGHT colour matrix (a build-time SVG filter,
// never at runtime), then the `lit` extras are drawn on top unfiltered: warm
// windows, lamp glows, stars. Draw functions call lit() next to the day
// shape they light up, so the two always line up.
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';
import { croissant, cupcake, cakeStand, layerCake, bread, plantLeafy, pot, cakeSlice } from '../props/household.mjs';

// Canvas in art units: the world bleed box (-100..2500 x -100..1100 world).
const X0 = -143, X1 = 3572, Y0 = -143, Y1 = 1572;
export const BASE = 914;                 // sidewalk top: where the buildings stand
const CURB = 972, ST0 = 986, ST1 = 1140, FSW = 1192;   // curb, street, front sidewalk
export const LOT_Y = 1372;               // lots, Lost & Found and the front row stand here
export const LOT_X = [230, 720, 1210, 2040, 2530, 3020];

// ---- night -----------------------------------------------------------------
const NM = [[0.42, 0, 0, 0.035], [0, 0.46, 0, 0.045], [0, 0, 0.64, 0.125]];
const hex2 = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
/** A colour as it looks through the night filter. */
export function nightHex(c) {
  const v = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return '#' + NM.map((r) => hex2(r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3])).join('');
}
const NIGHT_INK = nightHex(P.ink);
const LAMP = '#FFE9A8';                  // lit glass
const GLOW = '#FFD27A';                  // lamp glow, 30-45% opacity, no outline

export const DEFS = `<defs>
  <filter id="night" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="${NM.map((r) => `${r[0]} ${r[1]} ${r[2]} 0 ${r[3]}`).join(' ')} 0 0 0 1 0"/>
  </filter>
  <style>.lit path,.lit rect,.lit circle,.lit ellipse,.lit polygon{stroke:${NIGHT_INK}}</style>
</defs>`;

let LIT = null;
/** Record night-only art drawn over the filtered day art (see header). */
const lit = (s) => { if (LIT) LIT.push(s); return ''; };
/** Run a draw function, collecting its lit extras: {art, lit}. */
function collect(fn) {
  const prev = LIT;
  LIT = [];
  const art = fn();
  const out = { art, lit: LIT.join('') };
  LIT = prev;
  return out;
}

// ---- small helpers ---------------------------------------------------------
const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;
const glint = (x, y, len = 30) => `<path ${tl('#fff', 'stroke:#fff;stroke-width:6;opacity:.85')} d="M${x} ${y + len} L${x + len} ${y}"/>`;
const archPath = (x, y, w, h) => `M${f(x)} ${f(y + h)} L${f(x)} ${f(y + w / 2)} A${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(x + w)} ${f(y + w / 2)} L${f(x + w)} ${f(y + h)}Z`;

/**
 * A window: frame, glass, mullions and a glint. Lights up at night (warm
 * glass, same frame in its night colour). deco: extra art on the glass
 * (paper cut-outs, curtains), drawn in both variants.
 */
function win(x, y, w, h, { frame = P.white, glass = P.sky, cross = true, arch = false, deco = '', sill = true } = {}) {
  const shape = (g, fr) => {
    const glassShape = arch ? `<path fill="${g}" d="${archPath(x, y, w, h)}"/>` : R(x, y, w, h, g, ' rx="4"');
    const mull = cross ? `${R(x + w / 2 - 5, y + (arch ? w / 4 : 0), 10, h - (arch ? w / 4 : 0), fr)}${R(x, y + h * 0.5 - 5, w, 10, fr)}` : '';
    const frameShape = arch ? `<path fill="${fr}" d="${archPath(x - 10, y - 10, w + 20, h + 20)}"/>` : R(x - 10, y - 10, w + 20, h + 20, fr, ' rx="6"');
    return `${frameShape}${glassShape}${deco}${mull}${sill ? R(x - 16, y + h + 4, w + 32, 12, fr, ' rx="4"') : ''}`;
  };
  lit(shape(LAMP, nightHex(frame)));
  return shape(glass, frame) + glint(x + 8, y + 10, Math.min(24, w / 3));
}

const cloud = (x, y, s) => at(x, y, s, `<path class="n" fill="#fff" d="${scallop(0, 0, 120, 44, 9, 22, 180, 360, false)} L120 18 Q0 34 -120 18Z"/>`);

function tree(x, y, s = 1, tone = 0) {
  const crowns = [[P.leaf, P.leafDeep], [P.leafLight, P.leaf], [P.sage, P.sageDeep]][tone % 3];
  return at(x, y, s, `<path fill="${P.woodDark}" d="M-12 0 L-9 -110 L-30 -150 L-22 -154 L-4 -126 L0 -170 L8 -170 L10 -128 L28 -156 L36 -150 L14 -110 L14 0Z"/>
    <path fill="${crowns[0]}" d="${scallop(0, -210, 92, 86, 11, 18)}"/>
    <path class="n" fill="${crowns[1]}" d="M-60 -170 Q-30 -150 0 -158 Q40 -150 70 -176 Q60 -140 20 -134 Q-30 -130 -60 -170Z" opacity=".7"/>
    <path class="d" d="M-40 -240 q10 -12 22 -8 M30 -210 q10 -12 22 -8 M-10 -190 q10 -12 22 -8"/>`);
}
function bush(x, y, s = 1, flower = P.rose) {
  return at(x, y, s, `<path fill="${P.leafDeep}" d="${scallop(0, -34, 70, 36, 8, 14, 180, 360, false)} L70 0 L-70 0Z"/>
    ${[[-40, -44], [-8, -58], [26, -46], [48, -26], [-52, -18]].map(([a, b], i) => `<circle class="thin" fill="${i % 2 ? P.butter : flower}" cx="${a}" cy="${b}" r="8"/>`).join('')}`);
}
function lampPost(x, y, h = 250) {
  const top = y - h;
  lit(`<ellipse class="n" fill="${GLOW}" opacity=".3" cx="${x}" cy="${top - 26}" rx="84" ry="84"/><ellipse class="n" fill="${GLOW}" opacity=".35" cx="${x}" cy="${top - 26}" rx="48" ry="48"/>
    <ellipse class="n" fill="${GLOW}" opacity=".22" cx="${x}" cy="${y - 6}" rx="70" ry="14"/>
    <path fill="${LAMP}" d="M${x - 18} ${top - 8} L${x + 18} ${top - 8} L${x + 24} ${top - 46} L${x - 24} ${top - 46}Z"/>`);
  return `<rect fill="${P.charDeep}" x="${x - 18}" y="${y - 14}" width="36" height="14" rx="4"/>
    <rect fill="${P.char}" x="${x - 7}" y="${top}" width="14" height="${h - 12}" rx="5"/>
    <rect fill="${P.char}" x="${x - 20}" y="${top - 10}" width="40" height="10" rx="4"/>
    <path fill="#FFF7E0" d="M${x - 18} ${top - 8} L${x + 18} ${top - 8} L${x + 24} ${top - 46} L${x - 24} ${top - 46}Z"/>
    <path fill="${P.char}" d="M${x - 30} ${top - 46} L${x + 30} ${top - 46} L${x + 10} ${top - 66} L${x - 10} ${top - 66}Z"/><circle fill="${P.char}" cx="${x}" cy="${top - 72}" r="7"/>`;
}

// ---- back layer --------------------------------------------------------------
function daySky() {
  return `${R(X0, Y0, X1 - X0, 960 - Y0, P.sky, ' class="n"')}
    ${cloud(300, 170, 1)}${cloud(1390, 96, 0.8)}${cloud(2420, 250, 0.9)}${cloud(3020, 110, 1.1)}${cloud(-60, 360, 0.7)}${cloud(1900, 330, 0.55)}`;
}
function nightSky() {
  let stars = '';
  const pts = [[80, 60], [420, 40], [640, 250], [980, 70], [1240, 200], [1500, 60], [1700, 270], [2060, 90], [2330, 60], [2620, 300],
    [2900, 50], [3180, 190], [3430, 80], [240, 300], [1100, 330], [1880, 40], [2780, 180], [3300, 330], [560, 120], [1620, 150]];
  pts.forEach(([x, y], i) => {
    stars += i % 3 ? `<circle class="n" fill="${P.butter}" cx="${x}" cy="${y}" r="${4 + (i % 2) * 2}"/>` : `<path class="thin" fill="${P.butter}" d="${star(x, y, 16, 6, 4)}"/>`;
  });
  return `${R(X0, Y0, X1 - X0, 960 - Y0, P.nightSky, ' class="n"')}${stars}`;
}
function hills() {
  const hill = (y, amp, n, fill, phase) => {
    let d = `M${X0} ${BASE + 20} L${X0} ${y}`;
    const step = (X1 - X0) / n;
    for (let i = 0; i < n; i++) {
      const x0 = X0 + i * step;
      d += ` Q${f(x0 + step / 2)} ${f(y - amp * (0.6 + 0.4 * Math.sin(i * 1.7 + phase)))} ${f(x0 + step)} ${y}`;
    }
    return `<path fill="${fill}" d="${d} L${X1} ${BASE + 20}Z"/>`;
  };
  return hill(700, 170, 7, P.sage, 0.4) + hill(780, 120, 9, P.leafLight, 1.3);
}
const HOUSE_COLORS = [[P.blush, P.roseDeep], [P.butter, P.terra], [P.mint, P.tealDeep], [P.lav, P.plum], [P.peach, P.woodDeep], [P.sky, P.blueDeep]];
function distantHouses() {
  let s = '';
  let x = X0 + 10, i = 0;
  while (x < X1) {
    const w = 96 + ((i * 37) % 60), h = 110 + ((i * 53) % 90), [c, roof] = HOUSE_COLORS[i % HOUSE_COLORS.length];
    const top = BASE - 60 - h;
    s += `<path fill="${roof}" d="M${x - 10} ${top} L${x + w / 2} ${top - 44 - (i % 3) * 8} L${x + w + 10} ${top}Z"/>${R(x, top, w, h + 60, c)}`;
    const wx = x + w / 2 - 14, wy = top + 24;
    s += R(wx, wy, 28, 30, P.white, ' rx="3"');
    lit(R(wx + 3, wy + 3, 22, 24, LAMP, ' rx="2"'));
    x += w + 22 + ((i * 17) % 30);
    i++;
  }
  return s;
}
function backTrees() {
  return [[40, BASE, 1.05, 0], [760, BASE, 0.8, 1], [1530, BASE, 0.9, 2], [1612, BASE - 10, 0.7, 0], [2440, BASE, 0.85, 1], [3360, BASE, 1, 0], [3480, BASE - 6, 0.8, 2]]
    .map(([x, y, s, t]) => tree(x, y, s, t)).join('');
}
function street() {
  let pav = '', dash = '', front = '';
  for (let x = X0 + 20; x < X1; x += 76) pav += `M${x} ${BASE + 8} L${x - 8} ${CURB - 4} `;
  for (let x = X0 + 40; x < X1; x += 150) dash += R(x, 1056, 80, 12, P.cream, ' rx="6" class="n"');
  for (let x = X0 + 30; x < X1; x += 80) front += `M${x} ${ST1 + 18} L${x + 6} ${FSW - 4} `;
  return `${R(X0, BASE, X1 - X0, CURB - BASE, P.oat)}<path ${tl(P.warmGrey)} d="${pav}"/>
    ${R(X0, CURB, X1 - X0, ST0 - CURB, P.warmGrey)}
    ${R(X0, ST0, X1 - X0, ST1 - ST0, P.warmGreyDeep)}${dash}
    ${R(X0, ST1, X1 - X0, 14, P.warmGrey)}${R(X0, ST1 + 14, X1 - X0, FSW - ST1 - 14, P.oat)}<path ${tl(P.warmGrey)} d="${front}"/>
    ${R(X0, FSW, X1 - X0, Y1 - FSW, P.sage)}
    <path ${tl(P.sageDeep)} d="${[...Array(40)].map((_, i) => { const x = X0 + 60 + i * 97, y = FSW + 60 + ((i * 71) % 300); return `M${x} ${y} l6 -14 M${x + 12} ${y} l2 -18 M${x + 22} ${y} l-4 -12`; }).join(' ')}"/>`;
}
function parkedCar(x, y, c = P.teal) {
  lit(`<ellipse class="n" fill="${GLOW}" opacity=".45" cx="${x + 132}" cy="${y - 44}" rx="46" ry="26"/><circle fill="${LAMP}" cx="${x + 118}" cy="${y - 46}" r="9"/>`);
  return `<ellipse class="n" fill="${P.ink}" opacity=".12" cx="${x}" cy="${y}" rx="130" ry="12"/>
    <path fill="${c}" d="M${x - 126} ${y - 22} L${x - 126} ${y - 60} Q${x - 124} ${y - 76} ${x - 100} ${y - 78} L${x - 70} ${y - 80} L${x - 44} ${y - 124} Q${x - 36} ${y - 134} ${x - 20} ${y - 134} L${x + 40} ${y - 134} Q${x + 58} ${y - 134} ${x + 66} ${y - 122} L${x + 92} ${y - 80} L${x + 110} ${y - 78} Q${x + 128} ${y - 74} ${x + 128} ${y - 56} L${x + 128} ${y - 22}Z"/>
    <path fill="${P.sky}" d="M${x - 58} ${y - 82} L${x - 36} ${y - 118} L${x - 6} ${y - 118} L${x - 6} ${y - 82}Z M${x + 6} ${y - 82} L${x + 6} ${y - 118} L${x + 40} ${y - 118} Q${x + 50} ${y - 118} ${x + 54} ${y - 110} L${x + 70} ${y - 82}Z"/>
    ${glint(x - 40, y - 112, 16)}
    <path class="d" d="M${x} ${y - 78} L${x} ${y - 30} M${x - 16} ${y - 66} L${x - 4} ${y - 66} M${x + 20} ${y - 66} L${x + 32} ${y - 66}"/>
    <circle fill="#FFF7E0" cx="${x + 118}" cy="${y - 46}" r="9"/>${R(x - 130, y - 36, 22, 12, P.berry, ' rx="4"')}
    <circle fill="${P.charDeep}" cx="${x - 70}" cy="${y - 20}" r="26"/><circle fill="${P.steel}" class="thin" cx="${x - 70}" cy="${y - 20}" r="11"/>
    <circle fill="${P.charDeep}" cx="${x + 72}" cy="${y - 20}" r="26"/><circle fill="${P.steel}" class="thin" cx="${x + 72}" cy="${y - 20}" r="11"/>`;
}
function playground() {
  // Slide and a little swing, right of the school (static: taps on it pan).
  const x = 3150, y = BASE + 20;
  return `<ellipse fill="${P.oat}" cx="${x + 170}" cy="${y - 4}" rx="200" ry="26"/>
    <rect fill="${P.steelDeep}" x="${x}" y="${y - 240}" width="12" height="236" rx="5"/><rect fill="${P.steelDeep}" x="${x + 58}" y="${y - 240}" width="12" height="236" rx="5"/>
    <path class="d" d="${[0, 1, 2, 3, 4].map((i) => `M${x + 8} ${y - 50 - i * 40} L${x + 62} ${y - 50 - i * 40}`).join(' ')}"/>
    <rect fill="${P.blue}" x="${x - 10}" y="${y - 262}" width="90" height="24" rx="6"/>
    <path fill="${P.blue}" d="M${x - 6} ${y - 262} L${x - 6} ${y - 300} L${x + 6} ${y - 300} L${x + 6} ${y - 262} M${x + 64} ${y - 262} L${x + 64} ${y - 300} L${x + 76} ${y - 300} L${x + 76} ${y - 262}Z"/>
    <path fill="${P.mustard}" d="M${x + 76} ${y - 262} Q${x + 150} ${y - 250} ${x + 196} ${y - 80} Q${x + 208} ${y - 30} ${x + 250} ${y - 22} L${x + 250} ${y - 2} Q${x + 190} ${y - 6} ${x + 176} ${y - 70} Q${x + 136} ${y - 220} ${x + 76} ${y - 234}Z"/>
    <path ${tl(P.mustardDeep)} d="M${x + 100} ${y - 244} Q${x + 158} ${y - 214} ${x + 188} ${y - 90}"/>
    ${R(x + 262, y - 36, 150, 36, P.woodDeep, ' rx="6"')}<path fill="${P.butter}" d="M${x + 272} ${y - 36} Q${x + 300} ${y - 60} ${x + 330} ${y - 44} Q${x + 364} ${y - 64} ${x + 402} ${y - 36}Z"/>
    <path fill="${P.berry}" d="M${x + 350} ${y - 50} L${x + 354} ${y - 76} L${x + 380} ${y - 76} L${x + 384} ${y - 50}Z"/><path class="d" d="M${x + 356} ${y - 76} Q${x + 367} ${y - 94} ${x + 378} ${y - 76}"/>`;
}
function sandwichBoard(x, y) {
  return `<path fill="${P.woodDeep}" d="M${x - 40} ${y} L${x - 20} ${y - 110} L${x + 20} ${y - 110} L${x + 40} ${y}Z"/>
    <path fill="${P.chalk}" d="M${x - 28} ${y - 14} L${x - 13} ${y - 96} L${x + 13} ${y - 96} L${x + 28} ${y - 14}Z"/>
    ${at(x, y - 34, 0.62, cupcake(1, P.rose))}<path fill="${P.woodDark}" d="M${x - 8} ${y - 110} L${x + 8} ${y - 110} L${x + 6} ${y - 118} L${x - 6} ${y - 118}Z"/>`;
}
function backArt() {
  return `${hills()}${distantHouses()}${backTrees()}${street()}${playground()}
    ${lampPost(790, BASE + 36)}${lampPost(2446, BASE + 36)}${lampPost(-40, BASE + 36)}
    ${sandwichBoard(716, BASE + 40)}${parkedCar(1290, 1112, P.rose)}${parkedCar(420, 1100, P.teal)}`;
}

// ---- front layer (the strip in front of the street) ---------------------------
function bench(x, y) {
  return `<path fill="${P.char}" d="M${x - 70} ${y} L${x - 64} ${y - 44} L${x - 56} ${y - 44} L${x - 60} ${y}Z M${x + 70} ${y} L${x + 64} ${y - 44} L${x + 56} ${y - 44} L${x + 60} ${y}Z"/>
    ${R(x - 86, y - 56, 172, 16, P.wood, ' rx="5"')}${R(x - 80, y - 96, 160, 14, P.wood, ' rx="5"')}${R(x - 80, y - 76, 160, 14, P.wood, ' rx="5"')}`;
}
function flowerBed(x, y, w) {
  let s = `<ellipse fill="${P.woodDeep}" cx="${x}" cy="${y - 6}" rx="${w / 2}" ry="16"/>`;
  for (let i = 0; i < w / 34; i++) {
    const fx = x - w / 2 + 20 + i * 34, c = [P.rose, P.butter, P.lav, P.blush][i % 4];
    s += `${leaf(26, 9, -20, P.leaf, fx, y - 10)}${leaf(24, 8, 24, P.leafDeep, fx, y - 10)}<path class="d" d="M${fx} ${y - 10} L${fx} ${y - 40}"/><path fill="${c}" class="thin" d="${scallop(fx, y - 46, 10, 10, 5, 5)}"/><circle fill="${P.mustard}" class="n" cx="${fx}" cy="${y - 46}" r="4"/>`;
  }
  return s;
}
function frontArt() {
  return `${tree(475, LOT_Y + 30, 0.95, 1)}${tree(965, LOT_Y + 40, 1.05, 0)}${bush(1400, LOT_Y + 30, 1, P.rose)}${tree(1860, LOT_Y + 30, 0.9, 2)}
    ${bush(2290, LOT_Y + 30, 1.1, P.lav)}${bush(2775, LOT_Y + 30, 1, P.butter)}${tree(3280, LOT_Y + 40, 1, 0)}${tree(3500, LOT_Y + 10, 0.8, 1)}
    ${bench(1435, FSW + 64)}${flowerBed(-40, LOT_Y + 50, 180)}${flowerBed(2290, LOT_Y + 110, 220)}${flowerBed(965, LOT_Y + 130, 200)}
    ${bush(3440, LOT_Y + 120, 0.9, P.rose)}`;
}

// ---- pieces --------------------------------------------------------------------
// Each piece: { id, art() -> svg (lit() inside), pivot?: [x, y] art units (the
// point a moving part turns around), depth: draw order }.

// CAFE: mint shop with a terracotta gable, striped awning, a big cup sign and
// pastries in the window. The door leaf is its own piece (cafe-door).
const CAFE = { x0: 130, x1: 670, door: [476, 716, 128, 198] };
function awning(x0, x1, y0, y1, a = P.rose, b = P.cream) {
  const n = 10, w = (x1 - x0) / n;
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + i * w;
    s += `<path fill="${i % 2 ? b : a}" class="n" d="M${f(x)} ${y0} L${f(x + w)} ${y0} L${f(x + w)} ${y1} Q${f(x + w / 2)} ${y1 + 26} ${f(x)} ${y1}Z"/>`;
  }
  let edge = `M${x0} ${y0} L${x1} ${y0} L${x1} ${y1}`;
  for (let i = n - 1; i >= 0; i--) edge += ` Q${f(x0 + i * w + w / 2)} ${y1 + 26} ${f(x0 + i * w)} ${y1}`;
  return `${s}<path fill="none" d="${edge}Z"/>${R(x0 - 8, y0 - 14, x1 - x0 + 16, 18, a, ' rx="6"')}`;
}
function shopWindow(x, y, w, h, interior) {
  return `${R(x - 14, y - 14, w + 28, h + 28, P.white, ' rx="8"')}${R(x, y, w, h, interior, ' rx="4"')}
    ${R(x + 8, y + 74, w - 16, 10, P.woodLight)}
    ${at(x + 50, y + 74, 0.7, cakeStand(layerCake(0.8), 120))}${at(x + 128, y + 74, 0.55, cupcake(1))}${at(x + 172, y + 74, 0.55, cupcake(1, P.butter))}${at(x + 216, y + 74, 0.55, cupcake(1, P.mint))}
    ${at(x + 60, y + h - 4, 0.62, croissant())}${at(x + 132, y + h - 4, 0.6, bread())}${at(x + 206, y + h - 4, 0.62, croissant())}`;
}
function cafeArt() {
  const { x0, x1 } = CAFE, [dx, dy, dw, dh] = CAFE.door;
  const siding = [...Array(22)].map((_, i) => `M${x0 + 20} ${452 + i * 22} L${x1 - 20} ${452 + i * 22}`).join(' ');
  const tiles = [...Array(6)].map((_, i) => { const y = 330 + i * 24; const hw = 40 + i * 50; return `M${400 - hw} ${y} L${400 + hw} ${y}`; }).join(' ');
  const flowers = (x) => `${R(x - 62, 588, 124, 26, P.woodDeep, ' rx="5"')}${[-44, -18, 8, 34].map((o, i) => `${leaf(26, 9, -30 + i * 20, i % 2 ? P.leaf : P.leafDeep, x + o, 588)}<path fill="${i % 2 ? P.butter : P.rose}" class="thin" d="${scallop(x + o + 6, 572, 10, 10, 5, 5)}"/>`).join('')}`;
  lit(`<g>${shopWindow(186, 740, 240, 130, P.butter)}</g>`);
  lit(`${R(dx, dy, dw, dh, '#E8B874')}<ellipse class="n" fill="${GLOW}" opacity=".35" cx="${dx + dw / 2}" cy="${BASE}" rx="110" ry="20"/>`);
  return `<g id="cafe">
    <ellipse class="n" fill="${P.ink}" opacity=".1" cx="400" cy="${BASE + 6}" rx="300" ry="14"/>
    ${R(540, 300, 52, 110, P.terraDeep)}${R(530, 290, 72, 18, P.woodDark, ' rx="5"')}
    <path ${tl('#fff', 'stroke:#fff;stroke-width:7;opacity:.9')} d="M556 270 q-14 -26 0 -52 q14 -26 0 -52 M580 262 q-12 -22 0 -44"/>
    ${R(x0 + 10, 440, x1 - x0 - 20, BASE - 440, P.mint)}<path ${tl('#AFD2C5')} d="${siding}"/>
    <path fill="${P.terra}" d="M${x0 - 26} 462 L400 282 L${x1 + 26} 462 L${x1 + 6} 476 L400 306 L${x0 - 6} 476Z"/>
    <path fill="${P.terra}" d="M${x0 + 10} 454 L400 300 L${x1 - 10} 454Z"/><path ${tl(P.terraDeep)} d="${tiles}"/>
    ${win(372, 358, 56, 56, { arch: true, cross: false, sill: false, deco: heart(400, 396, 1.4, P.rose) })}
    ${win(200, 486, 96, 92, {})}${win(504, 486, 96, 92, {})}${flowers(248)}${flowers(552)}
    <circle fill="${P.woodDeep}" cx="400" cy="532" r="70"/><circle fill="${P.cream}" cx="400" cy="532" r="58"/>
    ${at(400, 566, 1.25, `<ellipse fill="${P.white}" class="thin" cx="0" cy="0" rx="36" ry="7"/><path fill="${P.rose}" d="M18 -36 Q34 -36 33 -24 Q32 -12 16 -14 L16 -20 Q26 -20 26 -25 Q26 -30 18 -30Z"/><path fill="${P.rose}" d="M-24 -44 L22 -44 L19 -8 Q18 -2 11 -2 L-13 -2 Q-20 -2 -21 -8Z"/>${heart(-1, -22, 1.1, P.cream)}`)}
    <path ${tl(P.woodDeep, 'stroke-width:5')} d="M388 482 q-8 -14 0 -26 M410 480 q-8 -14 0 -26"/>
    ${R(x0, 616, x1 - x0, 16, P.cream)}
    ${awning(x0 - 4, x1 + 4, 640, 700)}
    ${shopWindow(186, 740, 240, 130, P.cream)}${glint(200, 752, 26)}${glint(390, 820, 22)}
    ${R(dx - 14, dy - 14, dw + 28, dh + 14, P.white, ' rx="8"')}${R(dx, dy, dw, dh, P.woodDark)}
    ${R(dx + 10, dy + 30, dw - 20, dh - 30, '#B07A55', ' class="n"')}<ellipse class="n" fill="${P.butter}" opacity=".5" cx="${dx + dw / 2}" cy="${dy + 60}" rx="40" ry="30"/>
    <path fill="${P.mustard}" d="M${dx + dw / 2 - 12} ${dy - 20} Q${dx + dw / 2 - 12} ${dy - 38} ${dx + dw / 2} ${dy - 38} Q${dx + dw / 2 + 12} ${dy - 38} ${dx + dw / 2 + 12} ${dy - 20}Z"/><circle fill="${P.mustardDeep}" cx="${dx + dw / 2}" cy="${dy - 17}" r="4"/>
    ${R(dx - 24, BASE - 14, dw + 48, 14, P.oat, ' rx="3"')}
    ${at(158, BASE, 0.9, plantLeafy(P.terra, 1))}${at(646, BASE, 0.9, plantLeafy(P.cream, 1, true))}
    </g>`;
}
function cafeDoorArt() {
  const [dx, dy, dw, dh] = CAFE.door;
  lit(`<circle fill="${LAMP}" cx="${dx + dw / 2}" cy="${dy + 58}" r="30"/>`);
  return `<g id="cafe-door">${R(dx, dy, dw, dh, P.roseDeep, ' rx="4"')}
    <circle fill="${P.white}" cx="${dx + dw / 2}" cy="${dy + 58}" r="38"/><circle fill="${P.sky}" cx="${dx + dw / 2}" cy="${dy + 58}" r="30"/>${glint(dx + dw / 2 - 18, dy + 44, 16)}
    ${R(dx + 18, dy + 116, dw - 36, 60, P.rose, ' rx="6"')}<circle fill="${P.mustard}" cx="${dx + dw - 20}" cy="${dy + 110}" r="9"/></g>`;
}

// THEATER: lavender hall with a plum crest and a big star, a bulb-lit marquee,
// posters and a red-curtained entrance (curtains: theater-curtains).
const TH = { x0: 880, x1: 1434, cx: 1157, door: [1040, 706, 234, 208] };
function bulbs(pts) {
  lit(pts.map(([x, y]) => `<circle class="n" fill="${GLOW}" opacity=".5" cx="${x}" cy="${y}" r="18"/><circle fill="${LAMP}" cx="${x}" cy="${y}" r="8"/>`).join(''));
  return pts.map(([x, y]) => `<circle fill="${P.butter}" cx="${x}" cy="${y}" r="8"/>`).join('');
}
function theaterArt() {
  const { x0, x1, cx } = TH, [dx, dy, dw, dh] = TH.door;
  const courses = [...Array(12)].map((_, i) => `M${x0 + 60} ${400 + i * 44} L${x1 - 60} ${400 + i * 44}`).join(' ');
  const arc = [...Array(9)].map((_, i) => { const a = Math.PI * (i / 8); return [f(cx - Math.cos(a) * 128), f(356 - Math.sin(a) * 118)]; });
  const marqueeTop = [...Array(16)].map((_, i) => [f(912 + i * 32.8), 612]);
  const marqueeBot = [...Array(16)].map((_, i) => [f(912 + i * 32.8), 690]);
  const blade = [0, 1, 2, 3, 4, 5].map((i) => [[cx - 50, 400 + i * 38], [cx + 50, 400 + i * 38]]).flat();
  const poster = (x, bg, inner) => `${R(x - 8, 718, 84, 138, P.woodDeep, ' rx="6"')}${R(x, 726, 68, 122, bg, ' rx="3"')}${inner}`;
  return `<g id="theater">
    <ellipse class="n" fill="${P.ink}" opacity=".1" cx="${cx}" cy="${BASE + 6}" rx="310" ry="14"/>
    <path fill="${P.plum}" d="M${cx - 150} 372 L${cx - 150} 350 Q${cx} 196 ${cx + 150} 350 L${cx + 150} 372Z"/>
    ${bulbs(arc)}
    <path fill="${P.mustard}" d="${star(cx, 228, 64, 28)}"/><path ${tl(P.mustardDeep)} d="M${cx - 18} 220 L${cx} 204 L${cx + 18} 220"/>
    ${R(x0 + 10, 366, x1 - x0 - 20, BASE - 366, P.lav)}<path ${tl('#C4B4D6')} d="${courses}"/>
    ${R(x0 - 6, 356, x1 - x0 + 12, 24, P.plum, ' rx="6"')}
    ${[x0, x1 - 52].map((x) => `${R(x, 370, 52, BASE - 370, P.cream)}${R(x - 6, 370, 64, 20, P.oat, ' rx="4"')}${R(x - 6, BASE - 24, 64, 24, P.oat, ' rx="4"')}<path ${tl(P.warmGrey)} d="M${x + 16} 400 L${x + 16} ${BASE - 34} M${x + 36} 400 L${x + 36} ${BASE - 34}"/>`).join('')}
    ${win(972, 420, 84, 120, { arch: true, frame: P.cream })}${win(1258, 420, 84, 120, { arch: true, frame: P.cream })}
    ${R(cx - 60, 380, 120, 214, P.roseDeep, ' rx="10"')}${R(cx - 44, 394, 88, 186, P.berry, ' rx="6"')}
    ${[0, 1, 2, 3].map((i) => `<path fill="${P.butter}" class="thin" d="${star(cx, 420 + i * 46, 18, 8)}"/>`).join('')}${bulbs(blade)}
    <path fill="${P.plum}" d="M${x0 + 10} 596 L${x1 - 10} 596 L${x1 + 8} 612 L${x0 - 8} 612Z"/>
    ${R(x0 + 18, 610, x1 - x0 - 36, 82, P.mustard, ' rx="8"')}${R(cx - 150, 624, 300, 54, P.cream, ' rx="6"')}
    ${bulbs(marqueeTop)}${bulbs(marqueeBot)}
    ${at(cx - 98, 664, 1, `<path fill="${P.rose}" class="thin" d="${star(0, -14, 20, 9)}"/>`)}
    ${at(cx - 42, 666, 1, `<ellipse fill="${P.butter}" cx="0" cy="-16" rx="18" ry="21"/><path class="d" d="M-10 -20 q4 -5 8 0 M2 -20 q4 -5 8 0 M-8 -8 q8 8 16 0"/>`)}
    ${at(cx + 14, 666, 1, `<ellipse fill="${P.blue}" cx="0" cy="-16" rx="18" ry="21"/><path class="d" d="M-10 -18 q4 5 8 0 M2 -18 q4 5 8 0 M-8 -4 q8 -8 16 0"/>`)}
    ${at(cx + 70, 668, 1, `<path fill="${P.plum}" d="M-4 -8 L-4 -38 L16 -44 L16 -14"/><ellipse fill="${P.plum}" cx="-10" cy="-8" rx="9" ry="7"/><ellipse fill="${P.plum}" cx="10" cy="-14" rx="9" ry="7"/>`)}
    ${heart(cx + 118, 646, 1.3, P.roseDeep)}
    <path fill="${P.oat}" d="${rrect(dx - 20, dy - 20, dw + 40, dh + 20, 70)}"/>
    <path fill="${P.plumDeep}" d="${rrect(dx, dy, dw, dh, 58)}"/>
    <path class="n" fill="${P.butter}" opacity=".35" d="M${cx - 24} ${dy + 60} L${cx + 24} ${dy + 60} L${cx + 80} ${BASE - 26} L${cx - 80} ${BASE - 26}Z"/>
    <ellipse class="n" fill="${P.butter}" opacity=".6" cx="${cx}" cy="${BASE - 26}" rx="84" ry="18"/>
    <path fill="${P.butter}" class="thin" d="${star(cx, dy + 120, 22, 10)}"/>
    ${R(dx - 4, BASE - 30, dw + 8, 18, P.woodDeep, ' rx="4"')}
    ${poster(930, P.butter, `<path fill="${P.rose}" class="thin" d="${star(964, 772, 26, 12)}"/><path fill="${P.plum}" d="${scallop(964, 826, 18, 9, 6, 4)}"/>`)}
    ${poster(1316, P.teal, `<circle fill="${P.peach}" cx="1350" cy="780" r="22"/><circle class="ink" cx="1342" cy="780" r="3"/><circle class="ink" cx="1358" cy="780" r="3"/><path fill="${P.mouth}" class="thin" d="M1344 788 Q1350 800 1356 788Z"/><path fill="${P.cream}" d="M1328 840 Q1350 806 1372 840Z"/><path fill="${P.cream}" class="thin" d="M1374 760 L1374 740 L1386 736 L1386 756"/>`)}
    ${R(x0 + 40, BASE - 28, x1 - x0 - 80, 14, P.oat, ' rx="3"')}${R(x0 + 60, BASE - 14, x1 - x0 - 120, 14, P.oat, ' rx="3"')}
    </g>`;
}
function curtainsArt() {
  const [dx, dy, dw, dh] = TH.door, cx = dx + dw / 2, bot = dy + dh;
  const half = (s) => {
    const e = cx - s * 20;                           // inner edge at the top
    const o = cx - s * (dw / 2);                     // outer edge
    return `<path fill="${P.roseDeep}" d="M${o} ${dy + 20} L${e} ${dy + 20} Q${e - s * 10} ${dy + 90} ${o + s * 36} ${dy + 118} Q${e - s * 30} ${bot - 50} ${e + s * 6} ${bot} L${o} ${bot}Z"/>
      <path ${tl('#BC7072')} d="M${o + s * 24} ${dy + 30} L${o + s * 26} ${bot - 6} M${o + s * 52} ${dy + 30} Q${o + s * 50} ${dy + 90} ${o + s * 44} ${dy + 110} M${o + s * 56} ${dy + 130} Q${o + s * 70} ${bot - 40} ${o + s * 80} ${bot - 6}"/>
      <ellipse fill="${P.mustard}" cx="${o + s * 34}" cy="${dy + 118}" rx="14" ry="10"/>`;
  };
  let val = '', back = '';
  const n = 6, w = dw / n;
  for (let i = 0; i < n; i++) val += ` Q${f(dx + (i + 0.5) * w)} ${dy + 70} ${f(dx + (i + 1) * w)} ${dy + 46}`;
  for (let i = n - 1; i >= 0; i--) back += ` Q${f(dx + (i + 0.5) * w)} ${dy + 70} ${f(dx + i * w)} ${dy + 46}`;
  return `<g id="curtains"><clipPath id="stage-open"><path d="${rrect(dx, dy, dw, dh, 58)}"/></clipPath>
    <g clip-path="url(#stage-open)">${half(1)}${half(-1)}
    <path fill="${P.roseDeep}" d="M${dx} ${dy - 10} L${dx + dw} ${dy - 10} L${dx + dw} ${dy + 46}${back}Z"/>
    <path ${tl(P.mustard, 'stroke-width:6')} d="M${dx} ${dy + 44}${val}"/></g></g>`;
}

// CONSTRUCTION SITE: a half-built steel frame, a hoarding fence with hazard
// stripes, cones, a brick pile and a tower crane (jib: crane-jib).
const CR = { mastX: 2205, top: 168, pivot: [2205, 150] };
function cone(x, y, s = 1) {
  return at(x, y, s, `${R(-30, -10, 60, 10, P.terraDeep, ' rx="3"')}<path fill="${P.terra}" d="M-22 -10 L-6 -84 Q0 -90 6 -84 L22 -10Z"/><path fill="${P.cream}" class="n" d="M-15 -40 L15 -40 L12 -54 L-12 -54Z"/>`);
}
function constructionArt() {
  const cols = [[1722, 440], [1832, 440], [1942, 560], [2052, 700]];
  const beams = [[560, 1722, 1960], [700, 1722, 2070], [820, 1722, 2070]];
  let frame = '';
  for (const [x, top] of cols) frame += `${R(x - 10, top, 20, BASE - top, P.terra)}<path ${tl(P.terraDeep)} d="M${x - 4} ${top + 10} L${x - 4} ${BASE - 10}"/>`;
  for (const [y, a, b] of beams) frame += `${R(a - 14, y - 10, b - a + 28, 20, P.terra, ' rx="3"')}<circle class="n" fill="${P.terraDeep}" cx="${a + 20}" cy="${y}" r="3"/><circle class="n" fill="${P.terraDeep}" cx="${b - 20}" cy="${y}" r="3"/>`;
  const x = CR.mastX;
  let lattice = '';
  for (let y = BASE - 40; y > CR.top + 40; y -= 50) lattice += `M${x - 16} ${y} L${x + 16} ${y - 25} L${x - 16} ${y - 50} `;
  let bricks = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4 - (r > 1 ? 1 : 0); c++) bricks += R(1732 + c * 28 + (r % 2) * 14, 890 - r * 22 - 70, 26, 20, r % 2 ? P.brickDeep : P.terra, ' rx="3"');
  const panelsTop = 804;
  let fence = '', stripes = '';
  for (let px = 1676; px < 2384; px += 118) {
    if (px > 2080 && px < 2190) continue;                  // the open gate
    fence += `${R(px, panelsTop, 112, BASE - panelsTop, P.woodLight, ' rx="3"')}<path ${tl(P.wood)} d="M${px + 28} ${panelsTop + 34} L${px + 28} ${BASE - 4} M${px + 56} ${panelsTop + 34} L${px + 56} ${BASE - 4} M${px + 84} ${panelsTop + 34} L${px + 84} ${BASE - 4}"/>`;
    stripes += `<g clip-path="url(#hz${px})"><clipPath id="hz${px}"><rect x="${px}" y="${panelsTop}" width="112" height="26"/></clipPath>${[0, 1, 2, 3, 4].map((i) => `<path class="n" fill="${P.mustard}" d="M${px - 20 + i * 36} ${panelsTop + 26} L${px + i * 36} ${panelsTop} L${px + 18 + i * 36} ${panelsTop} L${px - 2 + i * 36} ${panelsTop + 26}Z"/>`).join('')}</g><rect fill="none" x="${px}" y="${panelsTop}" width="112" height="26"/>`;
  }
  const warn = [[1734, panelsTop - 12], [2324, panelsTop - 12]];
  lit(warn.map(([a, b]) => `<circle class="n" fill="#FFD9A0" opacity=".55" cx="${a}" cy="${b}" r="26"/><circle fill="#FFC48A" cx="${a}" cy="${b}" r="10"/>`).join(''));
  lit(`${R(x - 22, CR.top + 14, 36, 26, LAMP, ' rx="3"')}`);
  return `<g id="construction">
    <ellipse class="n" fill="${P.ink}" opacity=".1" cx="2030" cy="${BASE + 6}" rx="360" ry="14"/>
    <path fill="${P.woodDeep}" d="M1670 ${BASE} L1670 870 Q1780 846 1900 866 Q2020 830 2140 862 Q2260 846 2390 868 L2390 ${BASE}Z"/>
    ${R(1722, 820, 330, BASE - 820, P.brick)}<path ${tl(P.brickDeep)} d="M1722 844 L2052 844 M1722 868 L2052 868 M1722 892 L2052 892 M1780 820 L1780 844 M1860 820 L1860 844 M1940 844 L1940 868 M1820 868 L1820 892 M2000 868 L2000 892"/>
    ${frame}
    ${R(1830, 690, 236, 14, P.woodLight, ' rx="3"')}
    <path fill="${P.wood}" d="M1996 ${BASE} L2040 690 L2056 690 L2012 ${BASE}Z M2030 ${BASE} L2074 690 L2090 690 L2046 ${BASE}Z"/>
    <path class="d" d="${[0, 1, 2, 3, 4].map((i) => { const t = (i + 0.5) / 5; return `M${f(2004 + 44 * t)} ${f(BASE - 224 * t)} L${f(2038 + 44 * t)} ${f(BASE - 224 * t)}`; }).join(' ')}"/>
    ${R(x - 44, BASE - 40, 88, 40, P.warmGrey, ' rx="4"')}
    ${R(x - 22, CR.top, 12, BASE - 40 - CR.top, P.mustard)}${R(x + 10, CR.top, 12, BASE - 40 - CR.top, P.mustard)}
    <path ${tl(P.mustardDeep, 'stroke-width:5')} d="${lattice}"/>
    ${R(x - 34, CR.top + 4, 60, 44, P.mustard, ' rx="6"')}${R(x - 24, CR.top + 12, 34, 26, P.sky, ' rx="3"')}
    ${R(1846, 708, 82, 104, P.woodLight, ' rx="3"')}<path ${tl(P.wood)} d="M1860 720 L1860 800 M1914 720 L1914 800"/>${R(1956, 580, 82, 110, P.woodLight, ' rx="3"')}${R(1974, 600, 46, 44, P.sky, ' rx="3"')}
    ${at(1722, 446, 0.55, `<path fill="${P.leafDeep}" d="M0 -120 L34 -50 L16 -52 L42 0 L-42 0 L-16 -52 L-34 -50Z"/>${R(-5, 0, 10, 14, P.woodDark)}`)}
    <path fill="${P.brown}" d="M2084 ${BASE} Q2098 862 2134 856 Q2170 862 2186 ${BASE}Z"/><path ${tl(P.brownDeep)} d="M2104 896 l10 -6 M2140 880 l10 -4 M2160 900 l8 -6"/>
    <path fill="${P.steelDeep}" d="M2150 856 L2146 820 L2156 820 L2160 856Z"/><path fill="${P.woodDeep}" d="M2146 822 L2140 760 L2150 760 L2156 822Z"/>
    <path fill="${P.mustard}" d="M2260 790 L2266 736 Q2268 720 2284 720 L2330 720 Q2346 720 2348 736 L2354 790Z"/>${R(2276, 732, 34, 30, P.sky, ' rx="4"')}
    <path fill="${P.mustard}" d="M2330 740 L2372 668 L2386 676 L2346 752Z"/><path fill="${P.mustard}" d="M2372 668 L2398 704 L2386 712 L2362 680Z"/>
    <path fill="${P.char}" d="M2380 700 L2420 712 L2410 744 Q2390 746 2378 728Z"/><circle fill="${P.mustardDeep}" cx="2374" cy="672" r="7"/>
    ${bricks}
    ${fence}${stripes}
    ${R(2150, panelsTop - 6, 40, BASE - panelsTop + 6, P.woodDeep, ' rx="3"')}
    ${R(1880, 832, 90, 62, P.cream, ' rx="6"')}${at(1925, 880, 1, `<path fill="${P.mustard}" d="M-30 0 Q-30 -34 0 -36 Q30 -34 30 0Z"/>${R(-38, -6, 76, 10, P.mustard, ' rx="5"')}<path class="d" d="M0 -36 L0 -8"/>`)}
    ${warn.map(([a, b]) => `${R(a - 6, b + 4, 12, 10, P.char)}<circle fill="#F6C28E" cx="${a}" cy="${b}" r="10"/>`).join('')}
    ${cone(1686, BASE + 40)}${cone(1740, BASE + 46, 0.9)}${cone(2380, BASE + 40)}${cone(2240, BASE + 50, 0.85)}
    </g>`;
}
function craneJibArt() {
  const [px, py] = CR.pivot;
  const L = 1872, Rr = 2300, top = py - 20, bot = py + 16;
  let truss = '';
  for (let x = L + 10; x < Rr - 20; x += 40) truss += `M${x} ${bot} L${x + 20} ${top} L${x + 40} ${bot} `;
  const hookX = 1972, hookY = 408;
  lit(`<circle class="n" fill="#FFC8B0" opacity=".6" cx="${px}" cy="${py - 92}" r="24"/><circle fill="${P.berry}" cx="${px}" cy="${py - 92}" r="10"/>`);
  return `<g id="crane-jib">
    <path fill="${P.mustard}" d="M${px - 26} ${top} L${px - 6} ${py - 84} L${px + 6} ${py - 84} L${px + 26} ${top}Z"/>
    <circle fill="${P.berry}" cx="${px}" cy="${py - 92}" r="10"/>
    <path class="d" d="M${px} ${py - 84} L${L + 20} ${top} M${px} ${py - 84} L${Rr - 10} ${top}"/>
    ${R(L, top - 6, Rr - L, 12, P.mustard, ' rx="4"')}${R(L, bot - 6, Rr - L, 12, P.mustard, ' rx="4"')}
    <path ${tl(P.mustardDeep, 'stroke-width:5')} d="${truss}"/>
    ${R(Rr - 70, bot, 60, 24, P.char, ' rx="4"')}${R(Rr - 70, bot + 24, 60, 24, P.charHi, ' rx="4"')}
    ${R(hookX - 20, bot + 4, 40, 16, P.char, ' rx="4"')}
    <path class="d" d="M${hookX - 6} ${bot + 20} L${hookX - 6} ${hookY - 50} M${hookX + 6} ${bot + 20} L${hookX + 6} ${hookY - 50}"/>
    ${R(hookX - 16, hookY - 56, 32, 22, P.charHi, ' rx="5"')}
    <path fill="none" style="stroke-width:7" d="M${hookX} ${hookY - 34} L${hookX} ${hookY - 12} Q${hookX} ${hookY + 4} ${hookX + 14} ${hookY - 2}"/>
    <path class="d" d="M${hookX} ${hookY - 10} L${hookX - 70} ${hookY + 22} M${hookX} ${hookY - 10} L${hookX + 70} ${hookY + 22}"/>
    ${R(hookX - 96, hookY + 22, 192, 24, P.terra, ' rx="4"')}<path ${tl(P.terraDeep)} d="M${hookX - 84} ${hookY + 34} L${hookX + 84} ${hookY + 34}"/>
    </g>`;
}

// SCHOOL: brick school with a bell tower (bell: school-bell), a flag, big
// windows with paper cut-outs, and double doors.
const SC = { x0: 2496, x1: 3080, cx: 2788, bell: [2788, 246] };
function brickWall(x, y, w, h) {
  let lines = '';
  for (let r = 0; r * 26 < h; r++) {
    const yy = y + r * 26;
    lines += `M${x} ${yy} L${x + w} ${yy} `;
    for (let c = (r % 2) * 30; c < w; c += 60) lines += `M${x + c} ${yy} L${x + c} ${Math.min(yy + 26, y + h)} `;
  }
  return `${R(x, y, w, h, P.terra)}<path ${tl(P.terraDeep)} d="${lines}"/>`;
}
const cutouts = [
  (x, y) => `<circle class="thin" fill="${P.berry}" cx="${x}" cy="${y}" r="13"/>${leaf(12, 5, 30, P.leaf, x + 2, y - 11)}`,
  (x, y) => `<path class="thin" fill="${P.butter}" d="${star(x, y, 16, 7)}"/>`,
  (x, y) => heart(x, y + 2, 1.6, P.rose),
  (x, y) => `<circle class="thin" fill="${P.lemon}" cx="${x}" cy="${y}" r="10"/><path ${tl(P.mustardDeep, 'stroke-width:4')} d="M${x - 18} ${y} L${x - 13} ${y} M${x + 13} ${y} L${x + 18} ${y} M${x} ${y - 18} L${x} ${y - 13} M${x} ${y + 13} L${x} ${y + 18}"/>`,
  (x, y) => `<path class="thin" fill="${P.lav}" d="${scallop(x, y, 12, 12, 5, 6)}"/><circle class="n" fill="${P.mustard}" cx="${x}" cy="${y}" r="4"/>`,
];
function schoolArt() {
  const { x0, x1, cx } = SC;
  let wins = '', k = 0;
  for (const wx of [2540, 2640, 2880, 2980]) {
    for (const wy of [580, 730]) {
      const c = cutouts[k++ % cutouts.length];
      wins += win(wx, wy, 68, 92, { frame: P.cream, deco: c(wx + 18, wy + 22) });
    }
  }
  lit(`${R(cx - 38, 778, 28, 40, LAMP, ' rx="4"')}${R(cx + 10, 778, 28, 40, LAMP, ' rx="4"')}`);
  return `<g id="school">
    <ellipse class="n" fill="${P.ink}" opacity=".1" cx="${cx}" cy="${BASE + 6}" rx="330" ry="14"/>
    ${R(3104, 420, 10, BASE - 420, P.steelDeep, ' rx="4"')}<circle fill="${P.mustard}" cx="3109" cy="414" r="10"/>
    <path fill="${P.teal}" d="M3114 430 Q3160 414 3206 434 Q3230 444 3252 436 L3252 496 Q3228 504 3206 494 Q3160 474 3114 490Z"/>
    <path fill="${P.butter}" class="thin" d="${star(3180, 462, 18, 8)}"/>
    <path fill="${P.tealDeep}" d="M${x0 - 16} 530 L${x0 + 20} 486 L2712 486 L2712 530Z M${x1 + 16} 530 L${x1 - 20} 486 L2864 486 L2864 530Z"/>
    ${brickWall(x0, 526, 216, BASE - 526)}${brickWall(2864, 526, x1 - 2864, BASE - 526)}
    ${R(x0 - 8, 520, 224, 16, P.cream, ' rx="4"')}${R(2856, 520, x1 - 2856 + 8, 16, P.cream, ' rx="4"')}
    <path fill="${P.tealDeep}" d="M2748 236 L${cx} 150 L2828 236Z"/><circle fill="${P.mustard}" cx="${cx}" cy="146" r="9"/>
    ${R(2752, 230, 72, 130, P.cream)}<path fill="${P.charDeep}" d="${archPath(2764, 248, 48, 72)}"/>
    ${R(2744, 314, 88, 14, P.oat, ' rx="4"')}
    <path fill="${P.cream}" d="M2700 408 L${cx} 344 L2876 408Z"/>
    ${brickWall(2712, 404, 152, BASE - 404)}${R(2702, 398, 172, 16, P.cream, ' rx="4"')}
    <circle fill="${P.white}" cx="${cx}" cy="470" r="38"/><circle fill="${P.cream}" class="thin" cx="${cx}" cy="470" r="30"/>
    <path class="d" d="M${cx} 470 L${cx} 450 M${cx} 470 L${cx + 14} 476"/>${[0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2; return `<circle class="n" fill="${P.ink}" cx="${f(cx + Math.cos(a) * 22)}" cy="${f(470 + Math.sin(a) * 22)}" r="3"/>`; }).join('')}
    ${wins}
    ${R(2728, 570, 120, 150, P.cream, ' rx="8"')}${win(2748, 590, 80, 110, { frame: P.white, cross: true, arch: true, deco: cutouts[0](2770, 640) })}
    ${R(cx - 64, 748, 128, BASE - 748, P.cream, ' rx="8"')}
    ${R(cx - 50, 762, 100, BASE - 776, P.teal, ' rx="6"')}<path class="d" d="M${cx} 762 L${cx} ${BASE - 14}"/>
    ${R(cx - 38, 778, 28, 40, P.sky, ' rx="4"')}${R(cx + 10, 778, 28, 40, P.sky, ' rx="4"')}
    <circle fill="${P.mustard}" cx="${cx - 10}" cy="850" r="6"/><circle fill="${P.mustard}" cx="${cx + 10}" cy="850" r="6"/>
    ${R(cx - 90, BASE - 18, 180, 18, P.oat, ' rx="3"')}
    ${bush(x0 + 30, BASE, 0.7, P.butter)}${bush(x1 - 30, BASE, 0.7, P.rose)}
    </g>`;
}
function bellArt() {
  const [bx, by] = SC.bell;
  return `<g id="bell"><path class="d" d="M${bx} ${by} L${bx} ${by + 8}"/>
    <path fill="${P.mustard}" d="M${bx - 8} ${by + 6} L${bx + 8} ${by + 6} Q${bx + 18} ${by + 12} ${bx + 18} ${by + 34} Q${bx + 18} ${by + 48} ${bx + 26} ${by + 56} L${bx - 26} ${by + 56} Q${bx - 18} ${by + 48} ${bx - 18} ${by + 34} Q${bx - 18} ${by + 12} ${bx - 8} ${by + 6}Z"/>
    <circle fill="${P.mustardDeep}" cx="${bx}" cy="${by + 60}" r="7"/><path ${tl(P.butter, 'stroke-width:4')} d="M${bx - 8} ${by + 20} Q${bx - 11} ${by + 34} ${bx - 12} ${by + 44}"/></g>`;
}
function busArt() {
  const y = 1128, x0 = 2560, x1 = 2990;
  let wins = '';
  const faces = { 1: [P.peach, P.brown], 3: ['#A8714D', '#3A2A2C'], 4: ['#F3D0B5', P.crust] };
  for (let i = 0; i < 6; i++) {
    const wx = x0 + 30 + i * 60;
    const face = faces[i];
    const kid = face ? `<circle fill="${face[0]}" class="thin" cx="${wx + 23}" cy="${y - 124}" r="15"/><path fill="${face[1]}" class="thin" d="M${wx + 8} ${y - 126} Q${wx + 23} ${y - 148} ${wx + 38} ${y - 126} Q${wx + 23} ${y - 134} ${wx + 8} ${y - 126}Z"/><circle class="ink" cx="${wx + 18}" cy="${y - 122}" r="2.2"/><circle class="ink" cx="${wx + 28}" cy="${y - 122}" r="2.2"/>` : '';
    wins += `${R(wx, y - 150, 46, 50, P.sky, ' rx="6"')}${kid}`;
    lit(`${R(wx, y - 150, 46, 50, LAMP, ' rx="6"')}${kid}`);
  }
  lit(`<ellipse class="n" fill="${GLOW}" opacity=".5" cx="${x1 + 34}" cy="${y - 50}" rx="58" ry="30"/><circle fill="${LAMP}" cx="${x1 - 6}" cy="${y - 52}" r="11"/>`);
  return `<g id="bus"><ellipse class="n" fill="${P.ink}" opacity=".12" cx="${(x0 + x1) / 2}" cy="${y}" rx="230" ry="12"/>
    <path fill="${P.mustard}" d="M${x0} ${y - 30} L${x0} ${y - 150} Q${x0} ${y - 174} ${x0 + 24} ${y - 174} L${x1 - 90} ${y - 174} Q${x1 - 70} ${y - 174} ${x1 - 64} ${y - 154} L${x1 - 56} ${y - 110} L${x1 - 10} ${y - 100} Q${x1 + 6} ${y - 96} ${x1 + 6} ${y - 78} L${x1 + 6} ${y - 30}Z"/>
    ${wins}
    ${R(x1 - 118, y - 150, 44, 110, P.sky, ' rx="5"')}<path class="d" d="M${x1 - 96} ${y - 146} L${x1 - 96} ${y - 44}"/>
    <path ${tl(P.mustardDeep, 'stroke-width:8')} d="M${x0 + 8} ${y - 82} L${x1 - 124} ${y - 82} M${x0 + 8} ${y - 62} L${x1 - 124} ${y - 62}"/>
    ${R(x0 - 6, y - 40, x1 - x0 + 18, 16, P.charHi, ' rx="6"')}
    <circle fill="#FFF7E0" cx="${x1 - 6}" cy="${y - 52}" r="11"/>${R(x0 + 2, y - 70, 14, 20, P.berry, ' rx="4"')}
    ${glint(x0 + 38, y - 142, 16)}${glint(x1 - 110, y - 140, 18)}
    <circle fill="${P.charDeep}" cx="${x0 + 90}" cy="${y - 22}" r="30"/><circle fill="${P.steel}" class="thin" cx="${x0 + 90}" cy="${y - 22}" r="12"/>
    <circle fill="${P.charDeep}" cx="${x1 - 80}" cy="${y - 22}" r="30"/><circle fill="${P.steel}" class="thin" cx="${x1 - 80}" cy="${y - 22}" r="12"/>
    </g>`;
}

// Sky toggles and the birds.
const SUN = [760, 160];
function sunArt() {
  const [x, y] = SUN;
  const rays = [...Array(10)].map((_, i) => { const a = (i / 10) * 360; return `<g transform="translate(${x} ${y}) rotate(${a})"><path fill="${P.mustard}" d="M-12 -70 Q0 -104 12 -70Z"/></g>`; }).join('');
  return `<g id="sun">${rays}<circle fill="${P.butter}" cx="${x}" cy="${y}" r="58"/>
    <circle class="ink" cx="${x - 20}" cy="${y + 4}" r="5"/><circle class="ink" cx="${x + 20}" cy="${y + 4}" r="5"/>
    <path class="d" d="M${x - 12} ${y + 20} Q${x} ${y + 32} ${x + 12} ${y + 20}"/>
    <ellipse class="n" fill="${P.rose}" opacity=".45" cx="${x - 34}" cy="${y + 18}" rx="10" ry="6"/><ellipse class="n" fill="${P.rose}" opacity=".45" cx="${x + 34}" cy="${y + 18}" rx="10" ry="6"/></g>`;
}
function moonArt() {
  const [x, y] = SUN;
  return `<g id="moon"><circle class="n" fill="${P.cream}" opacity=".12" cx="${x}" cy="${y}" r="100"/>
    <path fill="${P.cream}" d="M${x + 10} ${y - 66} A66 66 0 1 0 ${x + 62} ${y + 30} A54 54 0 1 1 ${x + 10} ${y - 66}Z"/>
    <path class="d" d="M${x - 34} ${y + 2} q7 6 14 0 M${x - 4} ${y + 18} q7 6 14 0"/>
    <path class="d" d="M${x - 22} ${y + 34} Q${x - 12} ${y + 42} ${x - 2} ${y + 36}"/>
    <path fill="${P.butter}" class="thin" d="${star(x + 70, y - 60, 14, 6, 4)}"/><path fill="${P.butter}" class="thin" d="${star(x + 96, y - 14, 9, 4, 4)}"/></g>`;
}
function birdsArt() {
  const bird = (x, y, s, c, flip = 1, up = true) => at(x, y, s, `<g transform="scale(${flip} 1)">
    <path fill="${c}" d="M-30 -4 L-50 -16 L-46 8Z"/>
    <path fill="${c}" d="M-34 0 Q-32 -22 -4 -24 Q10 -38 26 -30 Q40 -22 34 -6 Q30 16 0 18 Q-30 18 -34 0Z"/>
    <path fill="${P.mustard}" class="thin" d="M36 -20 L50 -15 L35 -11Z"/><circle class="ink" cx="24" cy="-20" r="3.2"/>
    <ellipse class="n" fill="${P.rose}" opacity=".5" cx="22" cy="-8" rx="6" ry="4"/>
    <path fill="${c}" d="${up ? 'M-16 -10 Q-38 -52 -8 -58 Q12 -52 10 -12Z' : 'M-16 0 Q-34 36 -6 40 Q12 34 8 2Z'}"/>
    <path ${tl('#fff', 'stroke:#fff;opacity:.6')} d="${up ? 'M-10 -18 Q-18 -38 -8 -48' : 'M-8 8 Q-16 24 -6 32'}"/></g>`);
  return `<g id="birds">${bird(1570, 262, 1, P.blue)}${bird(1672, 206, 0.8, P.rose, 1, false)}${bird(1480, 196, 0.72, P.butter, -1)}</g>`;
}

// BOOTH (P1.15): the Character Maker, a narrow photo-booth kiosk between the
// theater and the construction site. Reads by silhouette: a striped canopy, a
// round mirror sign with a smiling face, a curtained doorway (its own piece,
// booth-curtain) and bulbs.
const BO = { cx: 1555, x0: 1470, x1: 1640, door: [1500, 690, 110, 224] };
function boothArt() {
  const { cx, x0, x1 } = BO, top = BASE - 360, w = x1 - x0;
  const stripes = [...Array(6)].map((_, i) => `<path fill="${i % 2 ? P.cream : P.teal}" d="M${f(x0 - 16 + i * (w + 32) / 6)} ${top - 4} L${f(x0 - 16 + (i + 1) * (w + 32) / 6)} ${top - 4} L${f(x0 - 16 + (i + 1) * (w + 32) / 6)} ${top + 30} Q${f(x0 - 16 + (i + .5) * (w + 32) / 6)} ${top + 50} ${f(x0 - 16 + i * (w + 32) / 6)} ${top + 30}Z"/>`).join('');
  const bulbsAt = [...Array(7)].map((_, i) => [f(x0 + 6 + i * (w - 12) / 6), top + 64]);
  lit(bulbsAt.map(([x, y]) => `<ellipse class="n" fill="${GLOW}" opacity=".4" cx="${x}" cy="${y}" rx="18" ry="18"/><circle fill="${LAMP}" cx="${x}" cy="${y}" r="7"/>`).join('')
    + `<circle class="n" fill="${GLOW}" opacity=".35" cx="${cx}" cy="${top - 70}" r="80"/>`);
  return `<g id="booth"><ellipse class="n" fill="${P.ink}" opacity=".12" cx="${cx}" cy="${BASE + 4}" rx="110" ry="12"/>
    <path fill="${P.lav}" d="M${x0} ${BASE} L${x0} ${top + 20} L${x1} ${top + 20} L${x1} ${BASE}Z"/>
    <path ${tl(P.plum)} d="M${x0 + 12} ${top + 90} L${x0 + 12} ${BASE - 10} M${x1 - 12} ${top + 90} L${x1 - 12} ${BASE - 10}"/>
    <rect fill="${P.plum}" x="${x0 - 8}" y="${BASE - 26}" width="${w + 16}" height="26" rx="6"/>
    ${stripes}<rect fill="${P.tealDeep}" x="${x0 - 20}" y="${top - 16}" width="${w + 40}" height="16" rx="6"/>
    ${bulbsAt.map(([x, y]) => `<circle fill="#FFF3C4" class="thin" cx="${x}" cy="${y}" r="7"/>`).join('')}
    <rect fill="${P.plumDeep}" x="${BO.door[0] - 10}" y="${BO.door[1] - 10}" width="${BO.door[2] + 20}" height="${BO.door[3] + 10}" rx="10"/>
    <rect fill="${P.oat}" x="${BO.door[0]}" y="${BO.door[1]}" width="${BO.door[2]}" height="${BO.door[3]}" rx="6"/>
    <ellipse fill="${P.butter}" cx="${cx}" cy="${BASE - 60}" rx="30" ry="10"/><rect fill="${P.woodDeep}" x="${cx - 6}" y="${BASE - 58}" width="12" height="40"/>
    <rect fill="${P.mustard}" x="${cx - 8}" y="${top - 40}" width="16" height="30"/>
    <circle fill="${P.mustard}" cx="${cx}" cy="${top - 100}" r="74"/><circle fill="${P.glass}" cx="${cx}" cy="${top - 100}" r="58"/>
    <path fill="${P.brown}" d="M${cx - 30} ${top - 110} Q${cx - 34} ${top - 146} ${cx} ${top - 148} Q${cx + 34} ${top - 146} ${cx + 30} ${top - 110} Q${cx + 20} ${top - 128} ${cx} ${top - 128} Q${cx - 20} ${top - 128} ${cx - 30} ${top - 110}Z"/>
    <ellipse fill="${P.peach}" cx="${cx}" cy="${top - 100}" rx="28" ry="30"/>
    <circle fill="${P.ink}" class="n" cx="${cx - 10}" cy="${top - 98}" r="4"/><circle fill="${P.ink}" class="n" cx="${cx + 10}" cy="${top - 98}" r="4"/>
    <path class="d" d="M${cx - 10} ${top - 84} Q${cx} ${top - 76} ${cx + 10} ${top - 84}"/>
    <path fill="${P.brown}" d="M${cx - 30} ${top - 110} Q${cx - 26} ${top - 136} ${cx} ${top - 136} Q${cx + 26} ${top - 136} ${cx + 30} ${top - 110} Q${cx + 12} ${top - 122} ${cx} ${top - 116} Q${cx - 12} ${top - 122} ${cx - 30} ${top - 110}Z"/>
    <path fill="${P.butter}" class="thin" d="${star(cx + 62, top - 150, 16, 7)}"/><path fill="${P.butter}" class="thin" d="${star(cx - 66, top - 60, 11, 5)}"/>
    ${glint(cx + 20, top - 138, 14)}</g>`;
}
function boothCurtainArt() {
  const [x, y, w, h] = BO.door;
  const half = (s) => { const e = s < 0 ? x : x + w, m = x + w / 2; return `<path fill="${P.berry}" d="M${e} ${y} L${m} ${y} Q${f(m + s * 10)} ${f(y + h * .45)} ${f(m + s * 32)} ${y + h} L${e} ${y + h}Z"/><path ${tl('#B9575B', 'stroke-width:5')} d="M${f(e - s * 16)} ${y + 10} L${f(e - s * 16)} ${y + h - 6} M${f(e - s * 34)} ${y + 10} L${f(e - s * 36)} ${y + h - 6}"/>`; };
  return `<g id="booth-curtain">${half(-1)}${half(1)}<rect fill="${P.mustard}" x="${x - 8}" y="${y - 8}" width="${w + 16}" height="14" rx="6"/></g>`;
}

// LOT: an empty plot with a hanging "for sale" sign that shows a little house.
// Drawn at the origin; the piece places it at the first lot and copies it.
function lotArt() {
  const x = 0, y = 0;
  let stones = '';
  [[-80, -8], [-20, 6], [50, -4], [96, 8], [-110, 10]].forEach(([a, b], i) => { stones += `<ellipse class="thin" fill="${i % 2 ? P.warmGrey : P.oat}" cx="${a}" cy="${b}" rx="${7 + (i % 3) * 2}" ry="5"/>`; });
  return `<g id="lot"><path fill="${P.wood}" d="M-150 4 Q-150 -26 -100 -30 L100 -30 Q150 -26 150 4 Q150 30 100 32 L-100 32 Q-150 30 -150 4Z"/>
    <path ${tl(P.woodDeep)} d="M-110 -10 L-60 -10 M-20 16 L40 16 M70 -12 L120 -12 M-80 20 L-50 20"/>${stones}
    ${leaf(26, 9, -30, P.leaf, -146, 6)}${leaf(22, 8, 20, P.leafDeep, -140, 8)}${leaf(26, 9, 30, P.leaf, 146, 6)}${leaf(22, 8, -20, P.leafDeep, 140, 8)}
    ${R(x + 70, y - 196, 14, 206, P.woodDark, ' rx="5"')}${R(x - 44, y - 190, 128, 12, P.woodDark, ' rx="5"')}
    <path class="d" d="M${x - 28} ${y - 178} L${x - 28} ${y - 160} M${x + 56} ${y - 178} L${x + 56} ${y - 160}"/>
    ${R(x - 46, y - 162, 124, 96, P.woodDeep, ' rx="10"')}${R(x - 36, y - 152, 104, 76, P.cream, ' rx="6"')}
    <path fill="${P.terra}" d="M${x - 16} ${y - 110} L${x + 16} ${y - 140} L${x + 48} ${y - 110}Z"/>${R(x - 8, y - 112, 48, 30, P.butter)}${R(x + 10, y - 102, 12, 20, P.teal)}
    <path fill="${P.mustard}" class="thin" d="${star(x + 52, y - 138, 10, 4, 4)}"/><path fill="${P.mustard}" class="thin" d="${star(x - 24, y - 92, 7, 3, 4)}"/></g>`;
}
// LOST & FOUND: an open cardboard box of odds and ends, a magnifier picture on it.
const LF = [1625, LOT_Y - 10];
function lostFoundArt() {
  const [x, y] = LF;
  return `<g id="lostfound"><ellipse class="n" fill="${P.ink}" opacity=".12" cx="${x}" cy="${y + 2}" rx="96" ry="12"/>
    <circle fill="${P.teal}" cx="${x - 34}" cy="${y - 124}" r="26"/><path ${tl(P.cream, 'stroke-width:6')} d="M${x - 58} ${y - 128} Q${x - 34} ${y - 112} ${x - 10} ${y - 130}"/>
    <path fill="${P.rose}" d="M${x + 6} ${y - 110} L${x + 10} ${y - 176} L${x + 38} ${y - 176} L${x + 36} ${y - 132} Q${x + 60} ${y - 128} ${x + 58} ${y - 110}Z"/><path ${tl(P.cream, 'stroke-width:6')} d="M${x + 10} ${y - 160} L${x + 38} ${y - 160} M${x + 10} ${y - 144} L${x + 37} ${y - 144}"/>
    <path fill="${P.sage}" d="M${x + 40} ${y - 104} Q${x + 44} ${y - 150} ${x + 70} ${y - 142} Q${x + 82} ${y - 128} ${x + 74} ${y - 104}Z"/><ellipse fill="${P.sage}" cx="${x + 80}" cy="${y - 134}" rx="10" ry="14"/>
    <path fill="${P.woodLight}" d="M${x - 78} ${y - 110} L${x - 120} ${y - 150} L${x - 72} ${y - 150} L${x - 50} ${y - 110}Z"/>
    <path fill="${P.woodLight}" d="M${x + 78} ${y - 110} L${x + 116} ${y - 140} L${x + 60} ${y - 146} L${x + 50} ${y - 110}Z"/>
    ${R(x - 80, y - 112, 160, 112, P.wood, ' rx="6"')}<path ${tl(P.woodDeep, 'stroke-width:8')} d="M${x - 80} ${y - 100} L${x + 80} ${y - 100}"/>
    ${R(x - 36, y - 80, 72, 60, P.cream, ' rx="6"')}<circle fill="${P.sky}" cx="${x - 4}" cy="${y - 54}" r="16"/><path fill="${P.woodDeep}" d="M${x + 6} ${y - 42} L${x + 24} ${y - 26} L${x + 18} ${y - 20} L${x} ${y - 36}Z"/>
    </g>`;
}

export const CITY = {
  id: 'city',
  offset: [0, 0],                                      // world = art * ART_SCALE + offset
  width: 2400,                                         // world units: pans on every iPad
  canvas: { x: -100, y: -100, w: 2600, h: 1200 },      // world units, bleed included
  defs: DEFS,
  backdrop: { day: { top: P.sky, bottom: P.sage, horizon: 700 }, night: { top: P.nightSky, bottom: nightHex(P.sage), horizon: 700 } },
  layers: [
    { id: 'back', opaque: true, sky: daySky, nightSky, art: backArt },
    { id: 'front', art: frontArt },
  ],
  // depth = draw order (a world y). tap = what a tap means (city.js).
  pieces: [
    { id: 'sun', art: sunArt, depth: 5, noNight: true },
    { id: 'moon', art: moonArt, depth: 5, noNight: true },
    { id: 'birds', art: birdsArt, depth: 6 },
    { id: 'cafe', art: cafeArt, depth: 640 },
    { id: 'cafe-door', art: cafeDoorArt, depth: 641, pivot: [CAFE.door[0], CAFE.door[1] + CAFE.door[3] / 2] },
    { id: 'theater', art: theaterArt, depth: 640 },
    { id: 'theater-curtains', art: curtainsArt, depth: 641, pivot: [TH.door[0] + TH.door[2] / 2, TH.door[1]] },
    { id: 'construction', art: constructionArt, depth: 640 },
    { id: 'crane-jib', art: craneJibArt, depth: 641, pivot: CR.pivot },
    { id: 'school', art: schoolArt, depth: 640 },
    { id: 'school-bell', art: bellArt, depth: 641, pivot: SC.bell },
    { id: 'booth', art: boothArt, depth: 640 },
    { id: 'booth-curtain', art: boothCurtainArt, depth: 641, pivot: [BO.door[0] + BO.door[2] / 2, BO.door[1]] },
    { id: 'bus', art: busArt, depth: 790 },
    { id: 'lot', art: () => at(LOT_X[0], LOT_Y, 1, lotArt()), depth: 960, copies: LOT_X.map((x) => [x, LOT_Y]) },
    { id: 'lostfound', art: lostFoundArt, depth: 962 },
  ],
  collect,
};
