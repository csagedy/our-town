// Cafe kitchen room (from style v2), split into depth layers so characters can
// stand between them (docs/STYLE.md section 6). Authored in art units on the
// style-v2 2048 x 1536 canvas; exported layers are placed in world units by
// ROOM_XFORM (1 art unit = ART_SCALE world units).
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf } from '../ink.mjs';
import * as HH from '../props/household.mjs';
const { mug, cup, jar, bottle, pot, plantLeafy, succulent, snake, hangingPlant, books, bookStack, plates, bowlStack,
  teapot, croissant, cupcake, cakeStand, layerCake, cakeSlice, soupPot, kettle, espresso, toaster, fruitBowl, basket,
  bread, eggCarton, lantern, canister, beanIcon, leafIcon, flourSack, wateringCan, catLoaf, pendant, bulb, cuttingBoard,
  mixingBowl, lemonade, vase, ladle, whisk, spatula, smallPan, stool, chairBack } = HH;

const W = 2048, H = 1536, WALL_Y = 1010, VP = [1024, 520];
// Art-unit canvas that covers the world bleed (-100..1540 x -100..1100 world).
const X0 = -150, X1 = 2210, Y0 = -150, Y1 = 1580;
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
  while (y < Y1) {
    y += gap; gap *= 1.16; row++;
    lines += `M${X0} ${f(y)} L${X1} ${f(y)} `;
    for (let x = (row % 2) * 110 - 480; x < X1 + 400; x += 420 + row * 30) {
      const yTop = y - gap / 1.16, t = (yTop - VP[1]) / (y - VP[1]);
      const xTop = VP[0] + (x - VP[0]) * t;
      ticks += `M${f(xTop)} ${f(yTop)} L${f(x)} ${f(y)} `;
    }
  }
  return `<rect class="n" x="${X0}" y="${WALL_Y}" width="${X1 - X0}" height="${Y1 - WALL_Y}" fill="${P.floor}"/>
  <path ${tl(P.floorLine)} d="${lines}"/><path ${tl(P.floorLine)} d="${ticks}"/>`;
}
function wall() {
  return `<rect class="n" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${WALL_Y - Y0}" fill="url(#brick)"/>
  <rect class="n" x="${X0}" y="${Y0}" width="${X1 - X0}" height="${WALL_Y - Y0}" fill="${P.cream}" opacity=".18"/>
  <rect fill="${P.cream}" x="${X0 - 10}" y="${WALL_Y - 26}" width="${X1 - X0 + 20}" height="28"/>`;
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

// ---------------------------------------------------------------------------
// Layers. Each layer is drawn in one pass; characters and loose props whose
// feet are at world y >= layer.baseline are drawn in front of that layer and
// behind the next one (docs/STYLE.md section 6, docs/rig.md "Depth layers").
// ---------------------------------------------------------------------------
const DINE = { x0: 70, x1: 620, top: 1150 };
function diningRug() {
  return `<ellipse fill="${P.oat}" cx="360" cy="1420" rx="370" ry="104"/><ellipse class="n" fill="none" cx="360" cy="1420" rx="340" ry="84" style="stroke:${P.warmGrey};stroke-width:4;stroke-dasharray:14 12"/>`;
}
function diningChairs() { return `${at(190, 1250, 1, chairBack())}${at(470, 1250, 1, chairBack())}`; }
function diningTable() {
  const { x0, x1, top } = DINE;
  return `<g id="dining-table">
  <path fill="${P.wood}" d="M${x0 + 30} ${top + 20} L${x0 + 30} 1420 L${x0 + 56} 1420 L${x0 + 56} ${top + 20}Z M${x1 - 56} ${top + 20} L${x1 - 56} 1420 L${x1 - 30} 1420 L${x1 - 30} ${top + 20}Z"/>
  <rect fill="${P.woodDeep}" x="${x0 + 56}" y="${top + 34}" width="${x1 - x0 - 112}" height="18"/>
  <rect fill="${P.woodLight}" x="${x0}" y="${top}" width="${x1 - x0}" height="16"/><rect fill="${P.wood}" x="${x0 - 6}" y="${top + 16}" width="${x1 - x0 + 12}" height="24" rx="5"/>
  ${at(170, top + 6, 1, fruitBowl(P.terra))}${at(300, top + 6, 1, vase())}${at(585, top + 6, .7, teapot(P.sage, P.cream))}
  ${at(220, 1510, 1, stool(P.oat))}${at(510, 1510, 1, stool(P.oat))}
  </g>`;
}
const bigPlant = () => at(1840, 1540, .85, `${[-70, -45, -20, 5, 30, 55, 75].map((a, i) => leaf(150 + (i % 3) * 30, 44, a, i % 2 ? P.leaf : P.leafDeep, 0, -110)).join('')}${leaf(190, 50, -8, P.leafLight, 0, -110)}${HH.pot(P.terra, 170, 120)}`);

export const ROOM = {
  id: 'kitchen',
  // world = art * ART_SCALE + offset; the world canvas includes the 100 unit bleed.
  offset: [3, 0],
  canvas: { x: -100, y: -100, w: 1640, h: 1200 },     // world units
  width: 1440,                                         // playable room width (world)
  defs: DEFS,
  layers: [
    { id: 'back', baseline: 0, opaque: true,
      art: () => `${wall()}${floor()}${diningRug()}${windowArt()}${leftShelves()}${rightShelves()}${menuBoard()}
        ${at(1010, 0, 1, bulb(250))}${at(1545, 0, 1, bulb(300))}${at(700, 0, 1, pendant(150, P.sage))}
        ${at(820, 170, 1, hangingPlant(170, P.cream))}${at(1150, 150, 1, hangingPlant(150, P.terra))}${at(60, 110, 1, hangingPlant(110, P.oat))}${at(1960, 130, 1, hangingPlant(130, P.cream))}` },
    { id: 'counter', baseline: 720,
      art: () => `${fridge()}${backCounter()}${displayCase()}${at(1990, WALL_Y + 40, 1.4, snake(P.terra))}` },
    { id: 'mid', baseline: 820,
      art: () => `${island()}${stools()}${diningChairs()}` },
    { id: 'front', baseline: 1000,
      art: () => `${diningTable()}${bigPlant()}` },
  ],
  // Surfaces: [x0, x1, y] in ART units (converted to world by the build).
  // The layer is the one the surface belongs to: a prop on it draws with that layer.
  surfaces: [
    { id: 'shelf-l1', layer: 'back', seg: [70, 550, 240] }, { id: 'shelf-l2', layer: 'back', seg: [70, 550, 440] },
    { id: 'shelf-l3', layer: 'back', seg: [70, 550, 630] }, { id: 'shelf-l4', layer: 'back', seg: [70, 550, 810] },
    { id: 'shelf-r1', layer: 'back', seg: [1180, 1510, 240] }, { id: 'shelf-r2', layer: 'back', seg: [1180, 1510, 410] },
    { id: 'window-sill', layer: 'back', seg: [850, 1170, 498] },
    { id: 'fridge-top', layer: 'counter', seg: [600, 830, 378] },
    { id: 'back-counter', layer: 'counter', seg: [840, 1530, 720] },
    { id: 'display-top', layer: 'counter', seg: [1552, 1928, 626] },
    { id: 'island-top', layer: 'mid', seg: [740, 1340, 900] },
    { id: 'island-shelf', layer: 'mid', seg: [790, 1290, 1100] },
    { id: 'dining-table', layer: 'front', seg: [70, 620, 1150] },
  ],
  // Seats: sit anchors (the pelvis point of a seated character goes here), art units.
  seats: [
    { id: 'stool-1', layer: 'mid', at: [900, 1172] }, { id: 'stool-2', layer: 'mid', at: [1180, 1172] },
    { id: 'chair-1', layer: 'mid', at: [190, 1236] }, { id: 'chair-2', layer: 'mid', at: [470, 1236] },
  ],
  floor: { y0: 1010, y1: 1372 },   // art units: the floor band where characters stand (world 707..960)
};
