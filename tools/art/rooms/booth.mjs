// The Character Maker booth (P1.15): a little dress-up parlour behind the
// photo-booth kiosk on the city map. Front-on dollhouse room like the kitchen
// (art units, world = art * ART_SCALE + offset). The left part is the room
// (a big vanity mirror with bulbs over a round stage where the new character
// stands, a criss-cross rug, a pouf, hat boxes and a clothes rail); the right
// part sits behind the maker's picture-button panel (src/scenes/booth.js), so
// it is only a quiet wall.
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop } from '../ink.mjs';
import { plantLeafy, hangingPlant, bulb, books } from '../props/household.mjs';

const WALL_Y = 1010, VP = [630, 520];
const X0 = -150, X1 = 2210, Y0 = -150, Y1 = 1580;
export const MIRROR = { cx: 630, top: 170, bot: 900, rx: 250 };   // art units
export const STAGE = { cx: 630, y: 1250 };                          // the round stage (preview feet)
const DEFS = `<defs>
  <pattern id="booth-paper" width="120" height="120" patternUnits="userSpaceOnUse">
    <rect width="120" height="120" fill="${P.lav}"/>
    <path d="${star(30, 30, 9, 4)} ${star(90, 90, 9, 4)}" fill="#C8B8DA"/><circle cx="90" cy="30" r="4" fill="#C8B8DA"/><circle cx="30" cy="90" r="4" fill="#C8B8DA"/>
  </pattern>
</defs>`;

function wall() {
  return `<rect class="n" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${WALL_Y - Y0}" fill="url(#booth-paper)"/>
  <rect fill="${P.teal}" x="${X0 - 10}" y="${WALL_Y - 180}" width="${X1 - X0 + 20}" height="180"/>
  <path ${tl(P.tealDeep)} d="${[...Array(30)].map((_, i) => `M${X0 + 40 + i * 84} ${WALL_Y - 160} L${X0 + 40 + i * 84} ${WALL_Y - 20}`).join(' ')}"/>
  <rect fill="${P.cream}" x="${X0 - 10}" y="${WALL_Y - 196}" width="${X1 - X0 + 20}" height="20" rx="4"/>
  <rect fill="${P.cream}" x="${X0 - 10}" y="${WALL_Y - 22}" width="${X1 - X0 + 20}" height="24"/>`;
}
function floor() {
  let lines = '', ticks = '';
  let y = WALL_Y, gap = 26, row = 0;
  while (y < Y1) {
    y += gap; gap *= 1.16; row++;
    lines += `M${X0} ${f(y)} L${X1} ${f(y)} `;
    for (let x = (row % 2) * 110 - 480; x < X1 + 400; x += 420 + row * 30) {
      const yTop = y - gap / 1.16, t = (yTop - VP[1]) / (y - VP[1]);
      ticks += `M${f(VP[0] + (x - VP[0]) * t)} ${f(yTop)} L${f(x)} ${f(y)} `;
    }
  }
  return `<rect class="n" x="${X0}" y="${WALL_Y}" width="${X1 - X0}" height="${Y1 - WALL_Y}" fill="${P.floor}"/>
  <path ${tl(P.floorLine)} d="${lines}"/><path ${tl(P.floorLine)} d="${ticks}"/>`;
}
// The vanity mirror: an arched glass in a butter frame ringed with bulbs.
function mirror() {
  const { cx, top, bot, rx } = MIRROR;
  const arch = (r, t, b) => `M${cx - r} ${b} L${cx - r} ${t + r} A${r} ${r} 0 0 1 ${cx + r} ${t + r} L${cx + r} ${b}Z`;
  let bulbs = '';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1 - i / 10), r = rx + 44;
    bulbs += `<circle fill="#FFF3C4" class="thin" cx="${f(cx + r * Math.cos(a))}" cy="${f(top + rx - r * Math.sin(a) + 30)}" r="15"/>`;
  }
  for (let y = top + rx + 90; y < bot; y += 90) bulbs += [-1, 1].map((s) => `<circle fill="#FFF3C4" class="thin" cx="${cx + s * (rx + 44)}" cy="${y}" r="15"/>`).join('');
  return `<ellipse class="n" fill="#FFF6D8" opacity=".35" cx="${cx}" cy="${f((top + bot) / 2)}" rx="${rx + 110}" ry="${f((bot - top) / 2 + 80)}"/>
    <path fill="${P.mustard}" d="${arch(rx + 60, top - 30, bot + 20)}"/><path fill="${P.butter}" d="${arch(rx + 34, top - 6, bot + 6)}"/>
    <path fill="${P.glass}" d="${arch(rx, top + 30, bot - 10)}"/>
    <path ${tl('#fff', 'stroke:#fff;stroke-width:14;opacity:.8')} d="M${cx - rx + 60} ${top + 330} L${cx - rx + 200} ${top + 150} M${cx - rx + 70} ${top + 430} L${cx - rx + 250} ${top + 200}"/>
    ${bulbs}${heart(cx, top - 56, 1.6, P.berry)}
    <rect fill="${P.woodDeep}" x="${cx - rx - 70}" y="${bot + 10}" width="${2 * rx + 140}" height="26" rx="8"/>`;
}
// A clothes rail with little outfits on hangers, left of the mirror.
function rail() {
  const x0 = -60, x1 = 280, y = 330;
  const hang = (x, c, c2) => `<path class="d" d="M${x} ${y} q-10 -18 4 -24 M${x} ${y} L${x - 34} ${y + 22} L${x + 34} ${y + 22}Z"/>
    <path fill="${c}" d="M${x - 36} ${y + 24} L${x + 36} ${y + 24} L${x + 44} ${y + 60} L${x + 28} ${y + 64} L${x + 26} ${y + 150} L${x - 26} ${y + 150} L${x - 28} ${y + 64} L${x - 44} ${y + 60}Z"/>
    <path ${tl(c2, 'stroke-width:7')} d="M${x - 26} ${y + 90} L${x + 26} ${y + 90} M${x - 26} ${y + 116} L${x + 26} ${y + 116}"/>`;
  return `<rect fill="${P.woodDark}" x="${x0}" y="${y - 12}" width="${x1 - x0}" height="14" rx="6"/>
    <rect fill="${P.woodDark}" x="${x1 - 10}" y="${y - 12}" width="16" height="${WALL_Y - y + 60}" rx="6"/>
    ${hang(20, P.rose, P.cream)}${hang(110, P.sage, P.cream)}${hang(200, P.butter, P.terra)}`;
}
// Hat boxes and a wig stand on a shelf right of the mirror.
function hatShelf() {
  const x0 = 960, x1 = 1250, y = 520;
  const box = (x, w, h, c, c2) => `<rect fill="${c}" x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="8"/><rect fill="${c2}" x="${x - w / 2 - 4}" y="${y - h - 6}" width="${w + 8}" height="22" rx="8"/><path ${tl(c2, 'stroke-width:8')} d="M${x} ${y - h + 16} L${x} ${y}"/>`;
  return `<rect fill="${P.woodLight}" x="${x0}" y="${y}" width="${x1 - x0}" height="12"/><rect fill="${P.wood}" x="${x0}" y="${y + 12}" width="${x1 - x0}" height="16" rx="3"/>
    ${box(1020, 90, 80, P.rose, P.roseDeep)}${box(1110, 70, 110, P.teal, P.tealDeep)}
    <path fill="${P.cream}" d="M1190 ${y} L1180 ${y - 30} L1200 ${y - 30}Z"/><ellipse fill="${P.oat}" cx="1190" cy="${y - 70}" rx="30" ry="38"/>
    <path fill="${P.mustard}" d="M1156 ${y - 90} Q1190 ${y - 150} 1224 ${y - 90} L1230 ${y - 80} L1150 ${y - 80}Z"/><circle fill="${P.berry}" class="thin" cx="1190" cy="${y - 120}" r="8"/>
    <rect fill="${P.woodLight}" x="${x0}" y="${y + 230}" width="${x1 - x0}" height="12"/><rect fill="${P.wood}" x="${x0}" y="${y + 242}" width="${x1 - x0}" height="16" rx="3"/>
    ${at(1040, y + 230, 1, books([[22, 70, P.plum], [18, 60, P.butter], [24, 76, P.sage], [20, 64, P.rose]]))}${at(1180, y + 230, .8, plantLeafy(P.cream))}`;
}
// Curtains framing the room on the left.
function curtain() {
  return `<path fill="${P.rose}" d="M${X0} ${Y0} L60 ${Y0} Q30 300 110 560 Q40 600 20 700 Q-20 400 ${X0} 380Z"/>
    <path ${tl(P.roseDeep, 'stroke-width:6')} d="M-60 ${Y0} Q-70 200 -40 420 M0 ${Y0} Q-10 250 40 520"/>
    <rect fill="${P.mustard}" x="${X0}" y="${Y0 + 40}" width="${X1 - X0}" height="24" rx="10"/>`;
}
// The round stage in front of the mirror (the preview character stands on it).
function stageRug() {
  const { cx, y } = STAGE;
  return `<ellipse fill="${P.plumDeep}" cx="${cx}" cy="${y + 14}" rx="250" ry="64"/><ellipse fill="${P.plum}" cx="${cx}" cy="${y}" rx="250" ry="62"/>
    <ellipse fill="none" style="stroke:${P.butter};stroke-width:8" class="tl" cx="${cx}" cy="${y}" rx="210" ry="46"/>
    ${[-160, -80, 0, 80, 160].map((dx, i) => `<path fill="${P.butter}" class="thin" d="${star(cx + dx, y + (i % 2 ? 10 : -6), 12, 5)}"/>`).join('')}`;
}
// The circle-time rug on the left (sit criss-cross on it).
export const RUG = [230, 1290];
function rug() {
  const [x, y] = RUG;
  return `<ellipse fill="${P.sage}" cx="${x}" cy="${y}" rx="170" ry="48"/><ellipse fill="none" class="tl" style="stroke:${P.cream};stroke-width:8" cx="${x}" cy="${y}" rx="140" ry="36"/>
    <path fill="${P.cream}" class="n" d="${scallop(x, y, 60, 14, 10, 6)}"/>`;
}
// A pouf to sit on, right of the stage.
export const POUF = [1060, 1230];
function pouf() {
  const [x, y] = POUF;
  return `<ellipse class="n" fill="${P.ink}" opacity=".12" cx="${x}" cy="${y + 64}" rx="90" ry="12"/>
    <path fill="${P.butter}" d="M${x - 84} ${y - 30} Q${x - 92} ${y + 50} ${x - 70} ${y + 60} L${x + 70} ${y + 60} Q${x + 92} ${y + 50} ${x + 84} ${y - 30}Z"/>
    <ellipse fill="${P.lemon}" cx="${x}" cy="${y - 30}" rx="84" ry="24"/>
    <path ${tl(P.mustard, 'stroke-width:6')} d="M${x - 60} ${y - 2} L${x - 62} ${y + 50} M${x} ${y + 2} L${x} ${y + 56} M${x + 60} ${y - 2} L${x + 62} ${y + 50}"/>`;
}
const plant = () => at(1320, WALL_Y + 30, 1.1, plantLeafy(P.terra));

export const ROOM = {
  id: 'booth',
  offset: [3, 0],
  canvas: { x: -100, y: -100, w: 1640, h: 1200 },
  width: 1440,
  defs: DEFS,
  layers: [
    { id: 'back', baseline: 0, opaque: true,
      art: () => `${wall()}${floor()}${curtain()}${rail()}${mirror()}${hatShelf()}${stageRug()}${rug()}${plant()}
        ${at(420, 0, 1, bulb(90))}${at(880, 0, 1, bulb(120))}${at(1150, 20, 1, hangingPlant(100, P.cream))}` },
    { id: 'mid', baseline: 900, art: () => pouf() },
    // A big floor plant in the front corner (things pass behind it).
    { id: 'front', baseline: 1000,
      art: () => at(-30, 1560, .9, `${[-60, -35, -10, 15, 40, 65].map((a, i) => leaf(150 + (i % 3) * 30, 44, a, i % 2 ? P.leaf : P.leafDeep, 0, -110)).join('')}${leaf(180, 48, -4, P.leafLight, 0, -110)}<path fill="${P.terra}" d="M-80 -120 L80 -120 L66 0 L-66 0Z"/><rect fill="${P.terraDeep}" x="-88" y="-132" width="176" height="24" rx="8"/>`) },
  ],
  surfaces: [
    { id: 'hat-shelf', layer: 'back', seg: [970, 1240, 520] },
    { id: 'book-shelf', layer: 'back', seg: [970, 1240, 750] },
  ],
  // The rug is for sitting criss-cross (a seat id starting with "rug", char-model.js).
  seats: [
    { id: 'pouf-1', layer: 'mid', at: [POUF[0], POUF[1] - 30] },
    { id: 'rug-1', layer: 'back', at: [RUG[0], RUG[1]] },
  ],
  floor: { y0: 1010, y1: 1372 },
};
