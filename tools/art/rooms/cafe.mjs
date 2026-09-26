// The Cafe (P2a.1, docs/design.md 3.1): ONE panning strip, 2880 world units
// wide, with three zones: the KITCHEN (evolved from rooms/kitchen.mjs), the
// ORDER COUNTER and the DINING ROOM. Authored in art units exactly like the
// kitchen (1 art unit = ART_SCALE world units, world = art * ART_SCALE).
//
// Shipped as depth layers (back / counter / mid / front, docs/STYLE.md 6) plus
// PIECES: every appliance or fixture that changes state is its own cropped
// raster with named variants, all rasterized in one shared box so a variant
// swap is an in-place `src` change (oven door, fridge door, burner flames,
// stove knobs, sink tap, toaster lever, blender, coffee machine, register
// drawer, counter bell, menu board, front door, door bell). The static layer
// never draws a piece; a piece is drawn right after its `layer`.
//
// Besides surfaces and seats the room records SLOTS (burner rests, the oven
// interior, the sink basin, the cutting board, the toaster, blender and
// coffee spout, the register drawer and keys, the ice-cream tubs, the door
// and the order spot), SPAWNERS (fridge, pantry, freezer tubs, cup and plate
// stacks) and ZONES (camera stops) so the engine can wire stations.
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';
import * as HH from '../props/household.mjs';
const { mug, cup, jar, bottle, pot, plantLeafy, succulent, snake, hangingPlant, books, bookStack, plates, bowlStack,
  teapot, croissant, cupcake, cakeStand, layerCake, cakeSlice, soupPot, kettle, fruitBowl, basket,
  bread, eggCarton, lantern, canister, beanIcon, leafIcon, flourSack, wateringCan, catLoaf, pendant, bulb, cuttingBoard,
  lemonade, vase, ladle, whisk, spatula, smallPan, stool, chairBack } = HH;

export const ART_W = 4114;                          // 2880 world
const WALL_Y = 1010, CT = 720, CB = WALL_Y + 24;    // wall foot, back-counter top, counter front edge
const X0 = -150, X1 = 4270, Y0 = -150, Y1 = 1580;   // art canvas incl. the 100-unit world bleed
const ZK = [0, 1950], ZC = [1950, 2760], ZD = [2760, ART_W];   // zones (art x)

const DEFS = `<defs>
  <pattern id="c-brick" width="192" height="96" patternUnits="userSpaceOnUse">
    <rect width="192" height="96" fill="${P.mortar}"/>
    ${[[3, 3, 90], [99, 3, 90], [-45, 35, 90], [51, 35, 90], [147, 35, 90], [3, 67, 90], [99, 67, 90]].map(([x, y, w], i) =>
      `<rect x="${x}" y="${y}" width="${w}" height="26" rx="4" fill="${[P.brick, P.brickDeep, P.brick, P.brick, P.brickDeep, P.brick, P.brick][i]}"/>`).join('')}
    <rect x="195" y="35" width="90" height="26" rx="4" fill="${P.brick}"/>
  </pattern>
  <pattern id="c-tile" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="${P.mint}"/><path d="M0 43 L44 43 M43 0 L43 44" stroke="#AFD2C5" stroke-width="3"/></pattern>
  <pattern id="c-tile2" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#F8EBC6"/><path d="M0 39 L40 39 M39 0 L39 40" stroke="#EBD7A0" stroke-width="3"/></pattern>
  <pattern id="c-paper" width="96" height="120" patternUnits="userSpaceOnUse">
    <rect width="96" height="120" fill="${P.mint}"/><rect x="0" y="0" width="30" height="120" fill="#C3DDD0"/>
    <g fill="${P.cream}"><circle cx="63" cy="30" r="5"/><circle cx="57" cy="36" r="4"/><circle cx="69" cy="36" r="4"/><circle cx="63" cy="90" r="4"/></g>
    <path d="M63 40 Q60 50 64 58" stroke="#AFD2C5" stroke-width="3" fill="none"/>
  </pattern>
</defs>`;

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------
const shelfBoard = (x0, x1, y) => `<rect fill="${P.woodLight}" x="${x0}" y="${y - 10}" width="${x1 - x0}" height="12"/><rect fill="${P.wood}" x="${x0}" y="${y + 2}" width="${x1 - x0}" height="16" rx="3"/>
  <path fill="${P.woodDeep}" d="M${x0 + 30} ${y + 18} L${x0 + 30} ${y + 50} L${x0 + 58} ${y + 18}Z"/><path fill="${P.woodDeep}" d="M${x1 - 30} ${y + 18} L${x1 - 30} ${y + 50} L${x1 - 58} ${y + 18}Z"/>`;
const topSlab = (x0, x1, y) => `<rect fill="${P.woodLight}" x="${x0}" y="${y}" width="${x1 - x0}" height="14"/><rect fill="${P.wood}" x="${x0 - 4}" y="${y + 14}" width="${x1 - x0 + 8}" height="20" rx="4"/>`;
function cabinets(x0, x1, top, bot, doors, color = P.sage, shade = P.sageDeep, drawer = false) {
  let s = `<rect fill="${color}" x="${x0}" y="${top}" width="${x1 - x0}" height="${bot - top}"/>`;
  const dw = (x1 - x0) / doors;
  const dt = drawer ? top + 60 : top;
  for (let i = 0; i < doors; i++) {
    const dx = x0 + i * dw;
    if (drawer) s += `<rect fill="${color}" x="${f(dx + 10)}" y="${top + 10}" width="${f(dw - 20)}" height="40" rx="6"/><rect fill="${P.woodLight}" x="${f(dx + dw / 2 - 18)}" y="${top + 26}" width="36" height="9" rx="4.5"/>`;
    s += `<rect fill="${color}" x="${f(dx + 10)}" y="${dt + 12}" width="${f(dw - 20)}" height="${bot - dt - 36}" rx="6"/><rect class="thin" fill="none" x="${f(dx + 22)}" y="${dt + 24}" width="${f(dw - 44)}" height="${bot - dt - 60}" rx="4" style="stroke:${shade}"/>`;
    s += `<circle fill="${P.woodLight}" cx="${f(dx + (i % 2 ? 26 : dw - 26))}" cy="${dt + 50}" r="7"/>`;
  }
  return s + `<rect fill="${shade}" x="${x0}" y="${bot - 16}" width="${x1 - x0}" height="16"/>`;
}
const glint = (d, w = 6) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const bigLeaves = (s = 1) => `${[-70, -45, -20, 5, 30, 55, 75].map((a, i) => leaf((150 + (i % 3) * 30) * s, 44 * s, a, i % 2 ? P.leaf : P.leafDeep, 0, -110 * s)).join('')}${leaf(190 * s, 50 * s, -8, P.leafLight, 0, -110 * s)}`;
const bigPlant = (x, y, s, potc = P.terra) => at(x, y, s, `${bigLeaves()}${pot(potc, 170, 120)}`);

/** Sky, hills, a tree and a little house, clipped to a window box. */
function outside(id, x, y, w, h, extra = '') {
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>
  <g clip-path="url(#${id})" class="n">
    <rect fill="${P.sky}" x="${x}" y="${y}" width="${w}" height="${h}"/>
    <path fill="#fff" d="M${x + w * .18} ${y + 110} q0 -30 30 -30 q10 -24 38 -18 q26 -6 34 20 q26 2 24 28Z"/>
    <path fill="#fff" d="M${x + w * .62} ${y + 70} q0 -20 20 -20 q8 -16 26 -12 q18 -4 22 14 q18 2 16 18Z"/>
    <path fill="${P.leafLight}" d="M${x} ${y + h} L${x} ${y + h * .62} Q${x + w * .3} ${y + h * .5} ${x + w * .55} ${y + h * .62} Q${x + w * .8} ${y + h * .52} ${x + w} ${y + h * .6} L${x + w} ${y + h}Z"/>
    ${extra}
    <path fill="${P.sage}" d="M${x} ${y + h} L${x} ${y + h * .78} Q${x + w * .35} ${y + h * .7} ${x + w * .6} ${y + h * .78} Q${x + w * .8} ${y + h * .72} ${x + w} ${y + h * .78} L${x + w} ${y + h}Z"/>
  </g>`;
}
const house = (x, y, c = P.butter, roof = P.terra) => `<g><rect fill="${c}" x="${x - 40}" y="${y - 60}" width="80" height="60"/><path fill="${roof}" d="M${x - 50} ${y - 58} L${x} ${y - 100} L${x + 50} ${y - 58}Z"/><rect fill="${P.sky}" class="thin" x="${x - 26}" y="${y - 44}" width="18" height="18"/><rect fill="${P.woodDeep}" class="thin" x="${x + 6}" y="${y - 34}" width="18" height="34"/></g>`;
const tree = (x, y, s = 1) => at(x, y, s, `<rect fill="${P.woodDeep}" x="-8" y="-60" width="16" height="60"/><path fill="${P.leaf}" d="${scallop(0, -96, 50, 46, 9, 10)}"/><path fill="${P.leafLight}" class="n" d="${scallop(-12, -106, 22, 18, 6, 5)}"/>`);

// ---------------------------------------------------------------------------
// back layer: walls, floor, windows, shelves, lamps
// ---------------------------------------------------------------------------
function wall() {
  const dx = ZD[0];
  return `<rect class="n" x="${X0}" y="${Y0}" width="${dx - X0}" height="${WALL_Y - Y0}" fill="url(#c-brick)"/>
  <rect class="n" x="${X0}" y="${Y0}" width="${dx - X0}" height="${WALL_Y - Y0}" fill="${P.cream}" opacity=".18"/>
  <rect class="n" x="${dx}" y="${Y0}" width="${X1 - dx}" height="${760 - Y0}" fill="url(#c-paper)"/>
  <rect fill="${P.woodLight}" x="${dx}" y="760" width="${X1 - dx}" height="${WALL_Y - 760}"/>
  ${[...Array(Math.ceil((X1 - dx) / 110))].map((_, i) => `<rect class="thin" fill="none" style="stroke:${P.wood}" x="${dx + 18 + i * 110}" y="790" width="80" height="180" rx="6"/>`).join('')}
  <rect fill="${P.wood}" x="${dx - 4}" y="744" width="${X1 - dx + 8}" height="18" rx="4"/>
  <rect fill="${P.cream}" x="${X0 - 10}" y="${WALL_Y - 26}" width="${X1 - X0 + 20}" height="28"/>`;
}
function pillar(x) {
  return `<g><rect fill="${P.wood}" x="${x - 22}" y="${Y0}" width="44" height="${WALL_Y - Y0 + 4}"/><path ${tl(P.woodDeep)} d="M${x - 8} ${Y0} L${x - 8} ${WALL_Y - 40} M${x + 8} ${Y0} L${x + 8} ${WALL_Y - 40}"/>
  <rect fill="${P.woodLight}" x="${x - 30}" y="${WALL_Y - 40}" width="60" height="44" rx="4"/><rect fill="${P.woodLight}" x="${x - 30}" y="-20" width="60" height="22" rx="4"/></g>`;
}
function floor() {
  let lines = '', ticks = '';
  const vpx = (x) => (x < ZK[1] ? 1000 : x < ZC[1] ? 2350 : 3440);
  let y = WALL_Y, gap = 26, row = 0;
  while (y < Y1) {
    y += gap; gap *= 1.16; row++;
    lines += `M${X0} ${f(y)} L${X1} ${f(y)} `;
    for (let x = (row % 2) * 110 - 480; x < X1 + 400; x += 420 + row * 30) {
      const yTop = y - gap / 1.16, t = (yTop - 520) / (y - 520), vx = vpx(x);
      ticks += `M${f(vx + (x - vx) * t)} ${f(yTop)} L${f(x)} ${f(y)} `;
    }
  }
  return `<rect class="n" x="${X0}" y="${WALL_Y}" width="${X1 - X0}" height="${Y1 - WALL_Y}" fill="${P.floor}"/>
  <path ${tl(P.floorLine)} d="${lines}"/><path ${tl(P.floorLine)} d="${ticks}"/>`;
}
function rugs() {
  const oval = (cx, cy, rx, ry, c, st) => `<ellipse fill="${c}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse class="n" fill="none" cx="${cx}" cy="${cy}" rx="${rx - 26}" ry="${ry - 18}" style="stroke:${st};stroke-width:4;stroke-dasharray:14 12"/>`;
  return `<rect fill="${P.sage}" x="1330" y="1250" width="330" height="74" rx="20"/><path ${tl(P.sageDeep, 'stroke-width:6')} d="M1350 1276 L1640 1276 M1350 1298 L1640 1298"/>
  ${oval(2320, 1470, 330, 80, P.blush, P.roseDeep)}
  ${[3300, 3640, 3980].map((x) => oval(x, 1420, 200, 70, P.oat, P.warmGrey)).join('')}
  <rect fill="${P.terra}" x="3720" y="1022" width="160" height="30" rx="10"/><path ${tl(P.terraDeep, 'stroke-width:4')} d="M3734 1037 L3866 1037"/>`;
}

// ---- KITCHEN -------------------------------------------------------------
function pantry() {
  const x0 = 40, x1 = 540, top = 170, rows = [330, 510, 690, 870];
  const sh = (y) => `<rect fill="${P.wood}" x="${x0 + 22}" y="${y}" width="${x1 - x0 - 44}" height="16" rx="3"/>`;
  return `<g id="pantry">
  <rect fill="${P.wood}" x="${x0}" y="${top}" width="${x1 - x0}" height="${WALL_Y + 14 - top}" rx="8"/>
  <rect fill="${P.woodDeep}" x="${x0 + 22}" y="${top + 40}" width="${x1 - x0 - 44}" height="${WALL_Y - 30 - top - 40}"/>
  <path ${tl(P.woodDark)} d="${[1, 2, 3, 4, 5].map((i) => `M${x0 + 22 + i * 76} ${top + 44} L${x0 + 22 + i * 76} ${WALL_Y - 34}`).join(' ')}"/>
  <path fill="${P.woodLight}" d="M${x0 - 16} ${top + 40} L${x1 + 16} ${top + 40} L${x1 + 6} ${top} L${x0 - 6} ${top}Z"/>
  <path fill="${P.rose}" d="M${x0 + 10} ${top + 40} L${x1 - 10} ${top + 40} L${x1 - 10} ${top + 70} ${[...Array(8)].map((_, i) => { const xx = x1 - 10 - (i + 1) * (x1 - x0 - 20) / 8; return `Q${f(xx + (x1 - x0 - 20) / 16)} ${top + 92} ${f(xx)} ${top + 70}`; }).join(' ')}Z"/>
  ${rows.map(sh).join('')}
  ${at(110, rows[0], 1, jar(62, 92, P.oat, P.woodDeep, .75, null, true))}${at(186, rows[0], 1, jar(54, 84, '#FFFDF6', P.teal, .7, null, true))}
  ${at(262, rows[0], 1, jar(52, 96, P.butter, P.rose, .7, P.crust))}${at(338, rows[0], 1, jar(54, 70, P.mustard, P.woodDark, .8))}
  ${at(412, rows[0], 1, canister(P.cream, beanIcon, 56, 70))}${at(484, rows[0], .8, plantLeafy(P.blue, 1))}
  ${at(120, rows[1], 1, flourSack())}${at(220, rows[1], 1, canister(P.rose, heart(0, 0, 1.2, P.cream), 60, 74))}
  ${at(310, rows[1], 1, `<rect fill="${P.choc}" x="-30" y="-18" width="60" height="18" rx="3"/><rect fill="${P.choc}" x="-26" y="-36" width="52" height="18" rx="3"/><rect class="thin" fill="${P.blush}" x="-26" y="-30" width="20" height="10"/>`)}
  ${at(394, rows[1], 1, jar(48, 72, P.cream, P.blue, .7, P.berry))}${at(470, rows[1], 1, bottle(P.terraDeep, 104, P.butter))}
  ${at(120, rows[2], 1, basket(at(0, -58, .8, bread()), 110, 58))}${at(236, rows[2], 1, eggCarton())}
  ${at(338, rows[2], 1, plates(5, 96, P.cream))}${at(338, rows[2] - 46, .9, bowlStack())}${at(452, rows[2], 1, teapot(P.rose, P.cream))}
  ${at(120, rows[3], 1, basket([P.lemon, P.lemon, P.lemon].map((c, i) => `<ellipse fill="${c}" cx="${-26 + i * 26}" cy="-58" rx="16" ry="13"/>`).join(''), 100, 50))}
  ${at(234, rows[3], 1, basket(`<path fill="${P.banana}" d="M-40 -60 Q-10 -40 30 -64 Q36 -60 30 -52 Q-10 -28 -44 -54Z"/><path fill="${P.banana}" d="M-36 -70 Q-6 -52 34 -76 Q40 -72 34 -64 Q-6 -40 -40 -64Z"/>`, 100, 50))}
  ${at(350, rows[3], 1, books([[18, 70, P.terra], [16, 80, P.teal], [20, 64, P.mustard]]))}${at(452, rows[3], .85, snake(P.cream))}
  ${at(120, WALL_Y + 8, 1, basket([[-26, P.wood], [0, P.woodLight], [26, P.wood]].map(([x, c]) => `<ellipse fill="${c}" cx="${x}" cy="-60" rx="18" ry="14"/>`).join(''), 110, 60))}
  ${at(250, WALL_Y + 8, 1, basket([[-24, P.lav], [4, P.cream], [28, P.lav]].map(([x, c]) => `<circle fill="${c}" cx="${x}" cy="-60" r="16"/><path class="d" d="M${x} -76 L${x + 2} -84"/>`).join(''), 110, 60))}
  ${at(400, WALL_Y + 8, 1, flourSack())}${at(480, WALL_Y + 8, .8, flourSack())}
  </g>`;
}
const FR = { x: 580, w: 260, top: 360, split: 560, bot: CB };   // fridge
function fridgeBody() {
  const { x, w, top, split, bot } = FR;
  return `<g id="fridge">
  <rect fill="${P.charDeep}" x="${x + 10}" y="${bot - 14}" width="${w - 20}" height="14" rx="4"/>
  <rect fill="${P.char}" x="${x}" y="${top}" width="${w}" height="${bot - top - 12}" rx="26"/>
  <rect fill="#F4FAF7" x="${x + 16}" y="${split + 10}" width="${w - 32}" height="${bot - split - 40}" rx="10"/>
  <ellipse class="n" fill="#FFF6D8" opacity=".7" cx="${x + w / 2}" cy="${split + 40}" rx="${w / 2 - 30}" ry="30"/>
  ${[690, 820].map((y) => `<rect fill="${P.glass}" x="${x + 16}" y="${y}" width="${w - 32}" height="10" rx="3"/>`).join('')}
  <rect fill="${P.mint}" x="${x + 26}" y="940" width="${w - 52}" height="50" rx="8"/><rect fill="${P.teal}" x="${x + w / 2 - 22}" y="954" width="44" height="9" rx="4.5"/>
  <rect fill="${P.char}" x="${x}" y="${top}" width="${w}" height="${split - top}" rx="26"/>
  <path class="n" fill="${P.charHi}" d="M${x + 40} ${top + 30} L${x + 90} ${top + 30} L${x + 20} ${top + 170} L${x + 20} ${top + 100}Z"/>
  <path class="d" d="M${x} ${split} L${x + w} ${split}"/>
  <rect fill="${P.steel}" x="${x + w - 38}" y="${top + 50}" width="16" height="120" rx="8"/>
  <g transform="translate(${x + 60} ${top + 70}) rotate(-6)"><rect fill="#fff" x="0" y="0" width="110" height="84" rx="4"/><path class="n" fill="${P.sky}" d="M4 4 L106 4 L106 50 L4 50Z"/><path fill="${P.leaf}" class="thin" d="M4 80 L4 52 Q30 30 56 52 Q80 36 106 54 L106 80Z"/><circle class="thin" fill="${P.lemon}" cx="84" cy="22" r="10"/>
    <path class="d" d="M26 66 L26 50 M18 58 L34 58"/><circle cx="26" cy="44" r="6" fill="${P.rose}" class="thin"/><circle fill="${P.berry}" cx="55" cy="0" r="7"/></g>
  ${at(x + 70, top - 2, .8, plantLeafy(P.cream, 1))}${at(x + 180, top - 2, 1, jar(80, 80, P.crust, P.rose, .5, P.choc, false))}
  </g>`;
}
function fridgeDoor(open) {
  const { x, w, split, bot } = FR, y0 = split + 2, y1 = bot - 14;
  if (!open) {
    return `<g><rect fill="${P.char}" x="${x}" y="${y0}" width="${w}" height="${y1 - y0}" rx="24"/>
    <rect class="n" fill="${P.char}" x="${x + 2}" y="${y0}" width="${w - 4}" height="30"/><path class="d" d="M${x + 4} ${y0} L${x + w - 4} ${y0}"/>
    <path class="n" fill="${P.charHi}" d="M${x + 110} ${y0 + 30} L${x + 130} ${y0 + 30} L${x + 20} ${y0 + 260} L${x + 20} ${y0 + 210}Z"/>
    <rect fill="${P.steel}" x="${x + w - 38}" y="${y0 + 40}" width="16" height="200" rx="8"/>
    <circle fill="${P.lemon}" cx="${x + 60}" cy="${y0 + 90}" r="13"/><path fill="${P.leaf}" class="thin" d="${star(x + 110, y0 + 120, 14, 7)}"/>${heart(x + 70, y0 + 160, 1.6, P.rose)}
    <circle fill="${P.berry}" cx="${x + 150}" cy="${y0 + 70}" r="10"/></g>`;
  }
  // swung open toward the viewer on its left hinge: a foreshortened panel with door bins
  const hx = x + 2, ox = x - 110;
  const yy = (t) => [f(y0 + (y1 - y0) * t), f(y0 - 24 + (y1 - y0 + 48) * t)];
  const bin = (t) => { const [a, b] = yy(t); return `<path fill="${P.glass}" d="M${hx - 10} ${a} L${ox + 12} ${b} L${ox + 12} ${f(+b + 34)} L${hx - 10} ${f(+a + 26)}Z"/>`; };
  return `<g><path fill="${P.char}" d="M${hx} ${y0} L${ox} ${y0 - 24} Q${ox - 14} ${y0 - 22} ${ox - 14} ${y0 - 6} L${ox - 14} ${y1 + 8} Q${ox - 14} ${y1 + 24} ${ox} ${y1 + 24} L${hx} ${y1}Z"/>
  <path fill="#F4FAF7" d="M${hx - 10} ${y0 + 14} L${ox + 8} ${y0 - 6} L${ox + 8} ${y1 + 6} L${hx - 10} ${y1 - 12}Z"/>
  ${at(ox + 34, +yy(.3)[1] + 8, .55, bottle(P.sky, 110, P.cream))}${at(ox + 72, +yy(.3)[0] + 12, .5, bottle(P.butter, 100, P.rose))}
  ${at(ox + 40, +yy(.64)[1] + 10, .6, `<rect fill="#fff" x="-20" y="-70" width="40" height="70" rx="4"/><path fill="#fff" d="M-20 -70 L0 -88 L20 -70Z"/><rect class="thin" fill="${P.sky}" x="-14" y="-46" width="28" height="22" rx="4"/>`)}
  ${at(ox + 78, +yy(.64)[0] + 12, .55, jar(40, 50, P.berry, P.cream, .7))}
  ${bin(.3)}${bin(.64)}${bin(.94)}
  <rect fill="${P.steel}" x="${ox - 8}" y="${+yy(.25)[1]}" width="12" height="160" rx="6"/></g>`;
}
function windowK() {
  const x = 880, y = 110, w = 260, h = 380;
  return `<g id="window">
  <rect fill="#fff" x="${x - 18}" y="${y - 18}" width="${w + 36}" height="${h + 36}" rx="6"/>
  ${outside('ow-k', x, y, w, h, house(x + 190, y + h * .66, P.butter, P.rose))}
  <rect fill="none" x="${x}" y="${y}" width="${w}" height="${h}"/>
  <rect fill="#fff" x="${x + w / 2 - 8}" y="${y}" width="16" height="${h}"/><rect fill="#fff" x="${x}" y="${y + 180}" width="${w}" height="16"/>
  ${glint(`M${x + 20} ${y + 60} L${x + 60} ${y + 20} M${x + 20} ${y + 90} L${x + 90} ${y + 20}`)}
  <path fill="${P.rose}" d="M${x - 24} ${y - 22} L${x + w + 24} ${y - 22} L${x + w + 24} ${y + 40} ${[...Array(9)].map((_, i) => { const xx = x + w + 24 - (i + 1) * (w + 48) / 9; return `Q${f(xx + (w + 48) / 18)} ${y + 62} ${f(xx)} ${y + 40}`; }).join(' ')}Z"/>
  <path ${tl(P.cream, `stroke:${P.cream};stroke-width:5`)} d="M${x - 20} ${y + 8} L${x + w + 20} ${y + 8}"/>
  <rect fill="#fff" x="${x - 34}" y="${y + h + 8}" width="${w + 68}" height="20" rx="4"/>
  ${at(x + 20, y + h + 10, .55, plantLeafy(P.terra, 1))}${at(x + 90, y + h + 10, .6, succulent(P.rose))}${at(x + 170, y + h + 10, .8, lemonade())}${at(x + 232, y + h + 10, .5, snake(P.cream))}
  </g>`;
}
function hood() {
  return `<g id="hood"><rect fill="${P.steel}" x="1440" y="${Y0}" width="60" height="${430 - Y0}"/><path ${tl(P.steelDeep)} d="M1450 ${Y0} L1450 420 M1490 ${Y0} L1490 420"/>
  <path fill="${P.steel}" d="M1330 560 L1610 560 L1540 430 L1400 430Z"/><rect fill="${P.steelDeep}" x="1318" y="556" width="304" height="20" rx="6"/>
  <circle class="n" fill="#FFF6D8" cx="1420" cy="572" r="5"/><circle class="n" fill="#FFF6D8" cx="1520" cy="572" r="5"/></g>`;
}
function utensilRail() {
  return `<rect fill="${P.steelDeep}" x="1160" y="540" width="150" height="10" rx="5"/>${at(1180, 545, 1, ladle())}${at(1230, 545, 1, whisk())}${at(1284, 545, 1, spatula())}`;
}
function shelvesK() {
  const X0s = 1660, X1s = 1920, s1 = 250, s2 = 420;
  return `<g id="right-shelves">${shelfBoard(X0s, X1s, s1)}${shelfBoard(X0s, X1s, s2)}
  ${at(1700, s1 - 4, .9, plantLeafy(P.sage, 1))}${at(1774, s1 - 4, 1, books([[20, 86, P.terra], [18, 96, P.mustard], [22, 80, P.sage]]))}
  ${at(1850, s1 - 4, 1, canister(P.rose, heart(0, 0, 1.2, P.cream), 52, 60))}${at(1900, s1 - 4, .8, cup(P.teal))}
  ${at(1700, s2 - 4, 1, jar(52, 64, P.butter, P.teal, .7))}${at(1760, s2 - 4, 1, mug(P.mustard))}
  ${at(1840, s2 - 4, 1, plates(4, 90, P.blue))}${at(1840, s2 - 44, .8, teapot(P.cream, P.blue))}</g>`;
}
// back counter geometry
const SINK = 990, BOARD = [1120, 1290], STOVE = [1310, 1630], BURN = [1390, 1550], TOAST = 1700, BLEND = 1810;
const OVEN = { x0: 1334, x1: 1606, y0: 790, y1: 1010 };
function backCounter() {
  const x0 = 850, x1 = 1930, [sx0, sx1] = STOVE;
  return `<g id="back-counter">
  <rect class="n" fill="url(#c-tile)" x="${x0}" y="530" width="${x1 - x0}" height="${CT - 530}"/>
  <path class="d" d="M${x0} 530 L${x1} 530"/>
  ${cabinets(x0, sx0, CT + 30, CB, 3, P.sage, P.sageDeep)}
  ${cabinets(sx1, x1, CT + 30, CB, 2, P.sage, P.sageDeep, true)}
  <rect fill="${P.char}" x="${sx0}" y="${CT + 30}" width="${sx1 - sx0}" height="${CB - CT - 30}"/>
  <rect fill="${P.charDeep}" x="${sx0}" y="${CB - 16}" width="${sx1 - sx0}" height="16"/>
  <circle fill="${P.cream}" cx="${(sx0 + sx1) / 2}" cy="762" r="13"/><path class="d" d="M${(sx0 + sx1) / 2} 762 L${(sx0 + sx1) / 2 + 7} 754"/>
  <rect fill="${P.charDeep}" x="${OVEN.x0 + 8}" y="${OVEN.y0 + 8}" width="${OVEN.x1 - OVEN.x0 - 16}" height="${OVEN.y1 - OVEN.y0 - 22}" rx="10"/>
  <circle fill="#FFF3C9" cx="${OVEN.x0 + 40}" cy="${OVEN.y0 + 38}" r="9"/><ellipse class="n" fill="#FFF6D8" opacity=".25" cx="${OVEN.x0 + 40}" cy="${OVEN.y0 + 44}" rx="40" ry="26"/>
  <path ${tl(P.steelDeep, 'stroke-width:5')} d="M${OVEN.x0 + 20} 930 L${OVEN.x1 - 20} 930 M${OVEN.x0 + 20} 870 L${OVEN.x1 - 20} 870"/>
  ${topSlab(x0 - 10, sx0, CT)}${topSlab(sx1, x1 + 10, CT)}
  <rect fill="${P.charDeep}" x="${sx0 - 4}" y="${CT}" width="${sx1 - sx0 + 8}" height="34" rx="4"/><rect fill="${P.charHi}" class="n" x="${sx0 + 6}" y="${CT + 4}" width="${sx1 - sx0 - 12}" height="4" rx="2"/>
  <rect fill="${P.steelDeep}" x="${SINK - 92}" y="${CT + 2}" width="184" height="10" rx="4"/>
  ${at(SINK - 130, CT + 2, .7, bottle(P.mint, 100, P.cream))}
  <rect fill="${P.woodLight}" x="${BOARD[0]}" y="${CT - 16}" width="${BOARD[1] - BOARD[0]}" height="18" rx="7"/><path ${tl(P.wood)} d="M${BOARD[0] + 20} ${CT - 7} L${BOARD[1] - 20} ${CT - 7}"/><circle class="n" fill="${P.wood}" cx="${BOARD[1] - 16}" cy="${CT - 8}" r="4"/>
  ${at(1880, CT + 2, 1, `${[[-12, -96, ladle], [6, -100, spatula], [18, -90, whisk]].map(([x, y, fn]) => at(x, y, .8, fn())).join('')}<path fill="${P.teal}" d="M-26 -60 L26 -60 L22 -4 Q21 0 16 0 L-16 0 Q-21 0 -22 -4Z"/><path ${tl(P.tealDeep)} d="M-24 -40 L24 -40"/>`)}
  </g>`;
}
function leaningBoard() { return at(1210, CT - 16, 1, cuttingBoard()); }
const ISL = { x0: 780, x1: 1250, top: 900, bot: 1170 };
function island() {
  const { x0, x1, top, bot } = ISL;
  return `<g id="island">
  <rect fill="${P.woodLight}" x="${x0 + 16}" y="${top + 30}" width="${x1 - x0 - 32}" height="${bot - top - 40}"/><path ${tl(P.wood)} d="${[...Array(8)].map((_, i) => `M${x0 + 64 + i * 50} ${top + 36} L${x0 + 64 + i * 50} ${bot - 76}`).join(' ')}"/>
  <rect fill="${P.wood}" x="${x0}" y="${top + 20}" width="28" height="${bot - top - 20}" rx="4"/><rect fill="${P.wood}" x="${x1 - 28}" y="${top + 20}" width="28" height="${bot - top - 20}" rx="4"/>
  <rect fill="${P.woodLight}" x="${x0 + 28}" y="${bot - 70}" width="${x1 - x0 - 56}" height="12"/><rect fill="${P.wood}" x="${x0 + 28}" y="${bot - 58}" width="${x1 - x0 - 56}" height="16"/>
  ${at(x0 + 110, bot - 64, 1, basket([P.berry, P.berry].map((c, i) => `<circle fill="${c}" cx="${-18 + i * 36}" cy="-56" r="16"/>`).join(''), 100, 54))}
  ${at(x0 + 240, bot - 64, 1, plates(4, 110, P.cream))}${at(x0 + 370, bot - 64, .9, soupPot(P.rose))}
  <rect fill="${P.woodLight}" x="${x0 - 20}" y="${top}" width="${x1 - x0 + 40}" height="14"/><rect fill="${P.wood}" x="${x0 - 24}" y="${top + 14}" width="${x1 - x0 + 48}" height="22" rx="5"/>
  ${at(x0 + 30, top + 4, .8, cakeStand(`${at(-24, 0, .45, cupcake(1))}${at(24, 0, .45, cupcake(1, P.butter))}`, 110, P.teal))}
  ${at(x1 - 40, top + 4, .75, fruitBowl(P.sage))}
  </g>`;
}

// ---- ORDER COUNTER ---------------------------------------------------------
const MENU = { x: 2090, y: 150, w: 380, h: 360 };
const COFFEE = 2110, BAR = [1990, 2730], FREEZER = [2450, 2718], TUBS = [2510, 2584, 2658];
const ORD = { x0: 2000, x1: 2710, top: 880, bot: 1170 }, REG = 2450, BELL = 2590, TIP = 2662;
function cupShelves() {
  const x0 = 2510, x1 = 2730, s1 = 300, s2 = 460;
  return `<g>${shelfBoard(x0, x1, s1)}${shelfBoard(x0, x1, s2)}
  ${at(2548, s1 - 4, 1, mug(P.rose, heart(0, -26, 1, P.cream)))}${at(2604, s1 - 4, 1, mug(P.cream, `<path ${tl(P.tealDeep)} d="M-20 -36 L20 -36 M-20 -26 L20 -26"/>`))}${at(2660, s1 - 4, 1, mug(P.sage))}${at(2708, s1 - 4, .7, succulent(P.cream))}
  ${at(2544, s2 - 4, 1, bottle(P.rose, 104, P.cream))}${at(2590, s2 - 4, 1, bottle(P.mustard, 96, P.cream))}${at(2636, s2 - 4, 1, bottle(P.choc, 110, P.cream))}${at(2694, s2 - 4, .9, plantLeafy(P.teal, 1))}</g>`;
}
function backBar() {
  const [x0, x1] = BAR;
  return `<g id="back-bar">
  <rect class="n" fill="url(#c-tile2)" x="${x0}" y="560" width="${x1 - x0}" height="${CT - 560}"/><path class="d" d="M${x0} 560 L${x1} 560"/>
  ${cabinets(x0, FREEZER[0], CT + 30, CB, 3, P.rose, P.roseDeep)}
  <rect fill="${P.cream}" x="${FREEZER[0]}" y="${CT + 30}" width="${FREEZER[1] - FREEZER[0]}" height="${CB - CT - 30}"/>
  <rect fill="${P.sky}" x="${FREEZER[0] + 16}" y="${CT + 44}" width="${FREEZER[1] - FREEZER[0] - 32}" height="110" rx="10"/>
  ${TUBS.map((x, i) => { const c = [P.egg, P.blush, P.choc][i], d = [P.oat, P.rose, P.brownDeep][i]; return `<rect fill="${P.steel}" x="${x - 32}" y="${CT + 100}" width="64" height="50" rx="6"/><path fill="${c}" d="${scallop(x, CT + 100, 30, 18, 7, 5, 180, 360, false)} L${x + 30} ${CT + 102} L${x - 30} ${CT + 102}Z"/><path class="n" fill="${d}" d="M${x - 10} ${CT + 92} q6 -6 12 0"/>`; }).join('')}
  ${glint(`M${FREEZER[0] + 30} ${CT + 84} L${FREEZER[0] + 60} ${CT + 54}`, 5)}
  <rect fill="${P.warmGrey}" x="${FREEZER[0]}" y="${CB - 16}" width="${FREEZER[1] - FREEZER[0]}" height="16"/>
  ${topSlab(x0 - 10, x1 + 10, CT)}
  ${at(2262, CT + 2, 1, `<rect fill="${P.char}" x="-30" y="-70" width="60" height="70" rx="10"/><path fill="${P.glass}" d="M-26 -70 L26 -70 L34 -130 L-34 -130Z"/><path class="thin" fill="${P.choc}" d="M-28 -84 L28 -84 L32 -116 L-32 -116Z"/><rect fill="${P.charDeep}" x="-36" y="-138" width="72" height="12" rx="6"/><circle fill="${P.steel}" cx="0" cy="-36" r="8"/>`)}
  ${at(2340, CT + 2, 1, `${[0, 1, 2, 3].map((i) => `<path fill="${P.cream}" d="M-24 ${-i * 14 - 14} L24 ${-i * 14 - 14} L20 ${-i * 14} L-20 ${-i * 14}Z"/>`).join('')}`)}
  ${at(2408, CT + 2, 1, plates(5, 72, P.blue))}
  </g>`;
}
function orderCounter() {
  const { x0, x1, top, bot } = ORD, dx1 = 2330;
  return `<g id="order-counter">
  <rect fill="${P.sage}" x="${x0}" y="${top + 20}" width="${x1 - x0}" height="${bot - top - 20}"/>
  <rect fill="${P.glass}" x="${x0 + 26}" y="${top + 44}" width="${dx1 - x0 - 40}" height="${bot - top - 90}" rx="10"/>
  <rect fill="${P.woodLight}" x="${x0 + 30}" y="1018" width="${dx1 - x0 - 48}" height="10"/>
  ${at(x0 + 80, 1018, .6, croissant())}${at(x0 + 150, 1018, .6, croissant())}${at(x0 + 222, 1018, .7, cakeSlice())}${at(x0 + 280, 1018, .6, cupcake(1, P.mint))}
  ${[x0 + 70, x0 + 124, x0 + 178, x0 + 232].map((x, i) => `<circle fill="${i % 2 ? P.crust : P.toast}" cx="${x}" cy="1100" r="20"/><g class="n" fill="${P.choc}"><circle cx="${x - 6}" cy="1096" r="3"/><circle cx="${x + 6}" cy="1104" r="3"/><circle cx="${x + 4}" cy="1092" r="2.5"/></g>`).join('')}
  ${at(x0 + 290, 1122, .55, cupcake(1))}
  ${glint(`M${x0 + 48} ${top + 90} L${x0 + 84} ${top + 60} M${dx1 - 60} ${bot - 70} L${dx1 - 30} ${bot - 100}`)}
  <rect class="thin" fill="none" style="stroke:${P.sageDeep}" x="${dx1 + 24}" y="${top + 50}" width="${x1 - dx1 - 50}" height="${bot - top - 90}" rx="8"/>
  <circle fill="${P.cream}" cx="${(dx1 + x1) / 2}" cy="1020" r="62"/><circle class="thin" fill="none" style="stroke:${P.sageDeep}" cx="${(dx1 + x1) / 2}" cy="1020" r="50"/>
  ${at((dx1 + x1) / 2, 1052, 1, `<path fill="${P.rose}" d="M-26 -48 L26 -48 L22 -8 Q21 0 12 0 L-12 0 Q-21 0 -22 -8Z"/><path fill="${P.rose}" d="M24 -40 Q40 -40 38 -26 Q36 -14 21 -16 L22 -22 Q30 -22 30 -28 Q30 -34 24 -34Z"/>${heart(0, -26, 1, P.cream)}<path ${tl(P.warmGrey, 'stroke-width:4')} d="M-8 -58 q-6 -10 0 -20 M8 -58 q-6 -10 0 -20"/>`)}
  <rect fill="${P.sageDeep}" x="${x0}" y="${bot - 16}" width="${x1 - x0}" height="16"/>
  <rect fill="${P.woodLight}" x="${x0 - 16}" y="${top}" width="${x1 - x0 + 32}" height="14"/><rect fill="${P.wood}" x="${x0 - 20}" y="${top + 14}" width="${x1 - x0 + 40}" height="22" rx="5"/>
  ${at(x0 + 120, top + 4, 1, `<rect fill="${P.woodLight}" x="-70" y="-12" width="140" height="12" rx="6"/>${at(0, -12, .7, layerCake(1))}<path fill="${P.glass}" opacity=".55" d="M-62 -12 L-62 -110 Q-62 -150 0 -150 Q62 -150 62 -110 L62 -12Z"/><path fill="none" d="M-62 -12 L-62 -110 Q-62 -150 0 -150 Q62 -150 62 -110 L62 -12"/><circle fill="${P.glass}" cx="0" cy="-156" r="8"/>${glint('M-44 -110 Q-44 -130 -28 -138', 5)}`)}
  ${at(x0 + 250, top + 4, .8, `<rect fill="${P.cream}" x="-30" y="-50" width="60" height="50" rx="6"/>${[-16, -4, 8].map((x) => `<rect class="thin" fill="#fff" x="${x}" y="-70" width="14" height="24" rx="2"/>`).join('')}`)}
  </g>`;
}

// ---- DINING ----------------------------------------------------------------
const WSEAT = { x0: 2820, x1: 3200, top: 830 }, DOOR = { x0: 3710, x1: 3890, top: 470 };
const TABLES = [3300, 3640, 3980], TTOP = 1150;
function windowSeatWindow() {
  const x = 2850, y = 200, w = 320, h = 470;
  const archD = `M${x} ${y + h} L${x} ${y + 150} Q${x} ${y} ${x + w / 2} ${y} Q${x + w} ${y} ${x + w} ${y + 150} L${x + w} ${y + h}Z`;
  return `<g id="window-seat-window">
  <path fill="#fff" d="M${x - 20} ${y + h + 10} L${x - 20} ${y + 150} Q${x - 20} ${y - 20} ${x + w / 2} ${y - 20} Q${x + w + 20} ${y - 20} ${x + w + 20} ${y + 150} L${x + w + 20} ${y + h + 10}Z"/>
  <clipPath id="ow-d-arch"><path d="${archD}"/></clipPath>
  <g clip-path="url(#ow-d-arch)">${outside('ow-d', x, y, w, h, `${tree(x + 70, y + h * .74, 1)}${house(x + 230, y + h * .72, P.blush, P.teal)}`)}</g>
  <path fill="none" d="${archD}"/>
  <rect fill="#fff" x="${x + w / 2 - 8}" y="${y}" width="16" height="${h}"/><rect fill="#fff" x="${x}" y="${y + 200}" width="${w}" height="14"/>
  ${glint(`M${x + 30} ${y + 190} L${x + 80} ${y + 140} M${x + 30} ${y + 230} L${x + 70} ${y + 190}`)}
  <path fill="${P.rose}" d="M${x - 50} ${y - 40} L${x + 10} ${y - 40} Q${x + 30} ${y + 200} ${x - 6} ${y + 330} Q${x - 30} ${y + 420} ${x - 44} ${y + h + 20} L${x - 60} ${y + h + 20}Z"/>
  <path fill="${P.rose}" d="M${x + w + 50} ${y - 40} L${x + w - 10} ${y - 40} Q${x + w - 30} ${y + 200} ${x + w + 6} ${y + 330} Q${x + w + 30} ${y + 420} ${x + w + 44} ${y + h + 20} L${x + w + 60} ${y + h + 20}Z"/>
  <path ${tl(P.roseDeep)} d="M${x - 30} ${y - 30} Q${x - 10} ${y + 150} ${x - 20} ${y + 300} M${x + w + 30} ${y - 30} Q${x + w + 10} ${y + 150} ${x + w + 20} ${y + 300}"/>
  <rect fill="${P.mustard}" x="${x - 26}" y="${y + 318}" width="30" height="14" rx="7"/><rect fill="${P.mustard}" x="${x + w - 4}" y="${y + 318}" width="30" height="14" rx="7"/>
  <rect fill="${P.woodDark}" x="${x - 80}" y="${y - 50}" width="${w + 160}" height="14" rx="7"/>
  <rect fill="#fff" x="${x - 30}" y="${y + h + 8}" width="${w + 60}" height="18" rx="4"/>
  ${at(x + 30, y + h + 10, .55, succulent(P.teal))}${at(x + w - 30, y + h + 10, .6, plantLeafy(P.cream, 1))}
  </g>`;
}
function windowSeatBench() {
  const { x0, x1, top } = WSEAT;
  return `<g id="window-seat">
  <rect fill="${P.wood}" x="${x0}" y="${top + 30}" width="${x1 - x0}" height="${CB - top - 30}"/>
  ${[0, 1, 2].map((i) => `<rect class="thin" fill="none" style="stroke:${P.woodDeep}" x="${x0 + 20 + i * 120}" y="${top + 56}" width="100" height="${CB - top - 100}" rx="6"/><circle fill="${P.woodLight}" cx="${x0 + 70 + i * 120}" cy="${top + 110}" r="7"/>`).join('')}
  <rect fill="${P.woodDeep}" x="${x0}" y="${CB - 16}" width="${x1 - x0}" height="16"/>
  <rect fill="${P.sage}" x="${x0 - 8}" y="${top - 6}" width="${x1 - x0 + 16}" height="40" rx="18"/><path ${tl(P.sageDeep, 'stroke-dasharray:10 10')} d="M${x0 + 10} ${top + 14} L${x1 - 10} ${top + 14}"/>
  <path fill="${P.blush}" d="M${x0 + 6} ${top - 2} Q${x0 - 4} ${top - 70} ${x0 + 30} ${top - 76} Q${x0 + 80} ${top - 84} ${x0 + 84} ${top - 30} Q${x0 + 86} ${top} ${x0 + 60} ${top}Z"/>
  <g class="n" fill="${P.rose}"><circle cx="${x0 + 30}" cy="${top - 50}" r="5"/><circle cx="${x0 + 56}" cy="${top - 30}" r="5"/><circle cx="${x0 + 60}" cy="${top - 60}" r="4"/></g>
  ${at(x1 - 70, top - 4, .9, catLoaf())}
  </g>`;
}
function frames() {
  const fr = (x, y, w, h, c, inner) => `<rect fill="${c}" x="${x - w / 2 - 12}" y="${y - h / 2 - 12}" width="${w + 24}" height="${h + 24}" rx="4"/><rect fill="${P.cream}" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"/>${at(x, y, 1, inner)}`;
  return `<g id="wall-decor">
  ${fr(3300, 300, 90, 110, P.woodDeep, at(0, 34, .7, cupcake(1, P.mint)))}
  ${fr(3440, 260, 150, 100, P.mustard, `<path class="n" fill="${P.sky}" d="M-75 -50 L75 -50 L75 50 L-75 50Z"/><path class="n" fill="${P.leafLight}" d="M-75 50 L-75 10 Q-30 -20 10 10 Q40 -10 75 10 L75 50Z"/><circle class="thin" fill="${P.lemon}" cx="40" cy="-20" r="12"/><rect fill="none" x="-75" y="-50" width="150" height="100"/>`)}
  ${fr(3580, 310, 80, 100, P.rose, `<path class="d" d="M0 36 L0 -6"/>${leaf(22, 8, -40, P.leaf, 0, 20)}<path fill="${P.butter}" d="${scallop(0, -14, 16, 16, 6, 6)}"/><circle class="thin" fill="${P.terra}" cx="0" cy="-14" r="6"/>`)}
  <circle fill="${P.cream}" cx="3440" cy="440" r="42"/><circle class="thin" fill="none" style="stroke:${P.warmGrey}" cx="3440" cy="440" r="32"/>${[0, 90, 180, 270].map((a) => `<circle class="n" fill="${P.ink}" cx="${f(3440 + 32 * Math.sin(a * Math.PI / 180))}" cy="${f(440 - 32 * Math.cos(a * Math.PI / 180))}" r="3.5"/>`).join('')}<path class="d" d="M3440 440 L3440 414 M3440 440 L3458 448"/>
  ${shelfBoard(3250, 3630, 580)}
  ${at(3290, 576, .9, plantLeafy(P.terra, 1))}${at(3360, 576, 1, teapot(P.sage, P.cream))}${at(3440, 576, 1, books([[18, 74, P.teal], [16, 86, P.rose], [20, 70, P.butter]]))}
  ${at(3510, 576, 1, jar(50, 66, P.lav, P.woodDeep, .6, P.plum))}${at(3584, 576, .9, vase())}
  </g>`;
}
function doorFrame() {
  const { x0, x1, top } = DOOR;
  return `<g id="door-frame">
  <rect fill="#fff" x="${x0 - 26}" y="${top - 26}" width="${x1 - x0 + 52}" height="${WALL_Y - top + 26}" rx="8"/>
  ${outside('ow-door', x0, top, x1 - x0, WALL_Y - top, `${tree(x0 + 40, top + 420, .9)}<rect fill="${P.steel}" x="${x0 + 132}" y="${top + 200}" width="10" height="400"/><circle fill="#FFF6D8" cx="${x0 + 137}" cy="${top + 196}" r="14"/>`)}
  <rect class="n" fill="${P.oat}" x="${x0}" y="${WALL_Y - 60}" width="${x1 - x0}" height="60"/><path ${tl(P.warmGrey)} d="M${x0} ${WALL_Y - 40} L${x1} ${WALL_Y - 40}"/>
  <rect fill="none" x="${x0}" y="${top}" width="${x1 - x0}" height="${WALL_Y - top}"/>
  <path fill="${P.teal}" d="M${x0 - 50} ${top - 40} L${x1 + 50} ${top - 40} L${x1 + 50} ${top - 90} L${x0 - 50} ${top - 90}Z"/>
  <path fill="${P.cream}" d="M${x0 - 50} ${top - 40} ${[...Array(6)].map((_, i) => { const xx = x0 - 50 + (i + 1) * (x1 - x0 + 100) / 6; return `Q${f(xx - (x1 - x0 + 100) / 12)} ${top - 14} ${f(xx)} ${top - 40}`; }).join(' ')} L${x1 + 50} ${top - 50} L${x0 - 50} ${top - 50}Z"/>
  <path ${tl(P.tealDeep, 'stroke-width:8')} d="${[...Array(5)].map((_, i) => `M${x0 - 20 + i * 70} ${top - 88} L${x0 - 20 + i * 70} ${top - 52}`).join(' ')}"/>
  <rect fill="${P.woodDark}" x="${x0 - 4}" y="${top - 26}" width="80" height="10" rx="5"/>
  </g>`;
}
function doorPiece(open) {
  const { x0, x1, top } = DOOR, w = x1 - x0, h = WALL_Y - top;
  if (!open) {
    return `<g><rect fill="${P.teal}" x="${x0}" y="${top}" width="${w}" height="${h}" rx="6"/>
    <circle fill="#fff" cx="${x0 + w / 2}" cy="${top + 130}" r="56"/><circle class="n" fill="${P.sky}" cx="${x0 + w / 2}" cy="${top + 130}" r="44"/><circle fill="none" cx="${x0 + w / 2}" cy="${top + 130}" r="44"/>
    ${glint(`M${x0 + w / 2 - 22} ${top + 118} L${x0 + w / 2 - 6} ${top + 100}`, 5)}
    <rect class="thin" fill="none" style="stroke:${P.tealDeep}" x="${x0 + 26}" y="${top + 220}" width="${w - 52}" height="200" rx="8"/>${heart(x0 + w / 2, top + 324, 2, P.cream)}
    <rect fill="${P.steel}" x="${x0 + 10}" y="${WALL_Y - 60}" width="${w - 20}" height="44" rx="6"/>
    <circle fill="${P.mustard}" cx="${x1 - 26}" cy="${top + 290}" r="12"/></g>`;
  }
  const ox = x0 - 100;
  return `<g><path fill="${P.teal}" d="M${x0} ${top} L${ox} ${top - 30} Q${ox - 8} ${top - 30} ${ox - 8} ${top - 20} L${ox - 8} ${WALL_Y + 30} Q${ox - 8} ${WALL_Y + 40} ${ox} ${WALL_Y + 40} L${x0} ${WALL_Y}Z"/>
  <ellipse fill="#fff" cx="${x0 - 50}" cy="${top + 120}" rx="26" ry="58"/><ellipse class="n" fill="${P.sky}" cx="${x0 - 50}" cy="${top + 120}" rx="18" ry="46"/><ellipse fill="none" cx="${x0 - 50}" cy="${top + 120}" rx="18" ry="46"/>
  <path fill="${P.steel}" d="M${x0 - 4} ${WALL_Y - 60} L${ox + 6} ${WALL_Y - 70} L${ox + 6} ${WALL_Y - 20} L${x0 - 4} ${WALL_Y - 14}Z"/>
  <circle fill="${P.mustard}" cx="${ox + 18}" cy="${top + 290}" r="10"/></g>`;
}
function doorBellPiece(ring) {
  const x = DOOR.x0 + 50, y = DOOR.top - 16;
  const bell = `<path class="d" d="M0 0 L0 18"/><path fill="${P.mustard}" d="M-18 50 Q-18 18 0 16 Q18 18 18 50 L22 56 L-22 56Z"/><circle fill="${P.mustardDeep}" cx="0" cy="60" r="6"/><path ${tl(P.butter, 'stroke-width:4')} d="M-8 26 Q-12 36 -12 46"/>`;
  return at(x, y, 1, ring ? `<g transform="rotate(-18)">${bell}</g><path ${tl(P.mustardDeep, 'stroke-width:4')} d="M30 24 q8 10 0 20 M40 18 q12 16 0 32"/>` : bell);
}
function coatRack() {
  return `<g id="coat-rack"><rect fill="${P.woodDeep}" x="3992" y="520" width="16" height="${WALL_Y - 520}"/><path fill="${P.woodDeep}" d="M3960 ${WALL_Y + 6} L4040 ${WALL_Y + 6} L4012 ${WALL_Y - 20} L3988 ${WALL_Y - 20}Z"/>
  <path class="d" style="stroke-width:6" d="M4000 560 L3960 530 M4000 560 L4040 530"/><circle fill="${P.woodDeep}" cx="4000" cy="514" r="10"/>
  <path fill="${P.mustard}" d="M3940 520 Q3960 490 3980 520 L3984 540 L3936 540Z"/><rect fill="${P.mustardDeep}" x="3926" y="536" width="66" height="10" rx="5"/>
  <path fill="${P.rose}" d="M4034 532 Q4060 600 4046 700 L4026 700 Q4030 620 4020 540Z"/><path ${tl(P.cream, 'stroke-width:5')} d="M4030 580 L4050 576 M4032 620 L4052 616 M4032 660 L4050 656"/></g>`;
}
function fairyLights() {
  let s = '', bulbs = '';
  for (let x = ZD[0] + 20; x < X1; x += 180) {
    s += `M${x} 70 Q${x + 90} 130 ${x + 180} 70 `;
    for (let i = 1; i < 4; i++) {
      const t = i / 4, bx = x + 180 * t, by = 70 + 60 * 2 * t * (1 - t) * 1;
      bulbs += `<ellipse class="n" fill="#FFF6D8" opacity=".6" cx="${f(bx)}" cy="${f(by + 12)}" rx="16" ry="16"/><path fill="${[P.butter, P.rose, P.mint][i - 1]}" class="thin" d="M${f(bx - 6)} ${f(by + 4)} Q${f(bx - 8)} ${f(by + 20)} ${f(bx)} ${f(by + 22)} Q${f(bx + 8)} ${f(by + 20)} ${f(bx + 6)} ${f(by + 4)}Z"/>`;
    }
  }
  return `<path class="d" d="${s}"/>${bulbs}`;
}
function lamps() {
  return `${at(1060, 0, 1, pendant(120, P.sage))}${at(660, 0, 1, bulb(120))}
  ${at(2640, 0, 1, pendant(160, P.mustard))}${at(2020, 0, 1, bulb(230))}
  ${at(3990, 0, 1, pendant(230, P.teal))}${at(3150, 0, 1, bulb(40))}
  ${at(60, 110, 1, hangingPlant(110, P.oat))}${at(820, 170, 1, hangingPlant(170, P.cream))}${at(1180, 150, 1, hangingPlant(150, P.terra))}
  ${at(2500, 150, 1, hangingPlant(150, P.cream))}${at(3230, 170, 1, hangingPlant(160, P.terra))}${at(4100, 150, 1, hangingPlant(140, P.oat))}`;
}

// ---------------------------------------------------------------------------
// counter / mid / front layers
// ---------------------------------------------------------------------------
const diningChairs = () => TABLES.map((x, i) => i < 2 ? `${at(x - 80, 1250, 1, chairBack(P.wood))}${at(x + 80, 1250, 1, chairBack(P.wood))}` : `${at(x - 80, 1312, 1, stool(P.sage))}${at(x + 80, 1312, 1, stool(P.sage))}`).join('');
const SIDE = { x0: 3250, x1: 3630, top: 850 };
function sideboard() {
  const { x0, x1, top } = SIDE;
  return `<g id="sideboard">${cabinets(x0, x1, top + 30, CB, 3, P.butter, P.mustard, true)}${topSlab(x0 - 10, x1 + 10, top)}
  ${at(x0 + 40, top + 2, .8, plantLeafy(P.cream, 1))}
  ${at(x0 + 110, top + 2, 1, `<path fill="${P.glass}" d="M-24 -8 L-26 -80 Q-26 -86 -18 -86 L18 -86 Q26 -86 26 -80 L24 -8 Q24 0 16 0 L-16 0 Q-24 0 -24 -8Z"/><path class="thin" fill="${P.sky}" d="M-22 -60 L22 -60 L21 -8 Q21 -4 16 -4 L-16 -4 Q-21 -4 -21 -8Z"/><circle class="thin" fill="${P.lemon}" cx="-4" cy="-34" r="10"/><path fill="${P.glass}" d="M24 -76 Q40 -76 38 -54 Q36 -34 22 -34 L22 -42 Q30 -42 30 -54 Q30 -68 24 -68Z"/>${glint('M-16 -74 L-16 -60', 4)}`)}
  ${at(x0 + 170, top + 2, 1, `${[0, 1, 2].map((i) => `<rect fill="${[P.rose, P.cream, P.sage][i]}" x="-24" y="${-12 - i * 10}" width="48" height="10" rx="3"/>`).join('')}`)}
  ${at(x1 - 50, top + 2, 1, `<rect fill="${P.woodDeep}" x="-18" y="-10" width="36" height="10" rx="4"/><rect fill="${P.woodDeep}" x="-5" y="-60" width="10" height="52"/><ellipse class="n" fill="#FFF6D8" opacity=".5" cx="0" cy="-70" rx="46" ry="34"/><path fill="${P.blush}" d="M-30 -58 L30 -58 L20 -100 L-20 -100Z"/><path ${tl(P.rose)} d="M-26 -70 L26 -70"/>`)}
  </g>`;
}
function table(cx, deco) {
  const x0 = cx - 150, x1 = cx + 150, top = TTOP;
  return `<g><path fill="${P.wood}" d="M${x0 + 24} ${top + 20} L${x0 + 24} 1420 L${x0 + 48} 1420 L${x0 + 48} ${top + 20}Z M${x1 - 48} ${top + 20} L${x1 - 48} 1420 L${x1 - 24} 1420 L${x1 - 24} ${top + 20}Z"/>
  <rect fill="${P.woodDeep}" x="${x0 + 48}" y="${top + 34}" width="${x1 - x0 - 96}" height="16"/>
  <rect fill="${P.woodLight}" x="${x0}" y="${top}" width="${x1 - x0}" height="16"/><rect fill="${P.wood}" x="${x0 - 6}" y="${top + 16}" width="${x1 - x0 + 12}" height="24" rx="5"/>
  ${at(x1 - 34, top + 6, 1, deco)}</g>`;
}
const budVase = (c) => `<path class="d" d="M0 -30 Q-4 -50 -8 -62"/><path fill="${c}" d="${scallop(-8, -66, 10, 10, 6, 5)}"/><circle class="thin" fill="${P.mustard}" cx="-8" cy="-66" r="4"/>${leaf(18, 6, 40, P.leaf, -2, -40)}<path fill="${P.blue}" d="M-10 -30 L10 -30 L12 -6 Q12 0 6 0 L-6 0 Q-12 0 -12 -6Z"/>`;

// ---------------------------------------------------------------------------
// Pieces: art for each state; the build rasterizes all of a piece's variants
// in one shared box.
// ---------------------------------------------------------------------------
function burner(bx, on) {
  const y = CT + 2;
  const flames = on ? [-40, -26, -12, 0, 12, 26, 40].map((dx, i) => { const h = 18 + (i % 3) * 6; return `<path fill="${P.terra}" d="M${bx + dx - 7} ${y} Q${bx + dx - 8} ${y - h * .6} ${bx + dx} ${y - h} Q${bx + dx + 8} ${y - h * .6} ${bx + dx + 7} ${y}Z"/><path class="n" fill="${P.butter}" d="M${bx + dx - 3} ${y} Q${bx + dx - 3} ${y - h * .4} ${bx + dx} ${y - h * .6} Q${bx + dx + 3} ${y - h * .4} ${bx + dx + 3} ${y}Z"/>`; }).join('') : '';
  return `<g>${on ? `<ellipse class="n" fill="${P.terra}" opacity=".35" cx="${bx}" cy="${y - 10}" rx="66" ry="26"/>` : ''}
  <ellipse fill="${P.charHi}" cx="${bx}" cy="${y}" rx="54" ry="9"/>${flames}<ellipse fill="${P.charDeep}" cx="${bx}" cy="${y}" rx="40" ry="6"/>
  <path ${tl(P.steelDeep, 'stroke-width:4')} d="M${bx - 48} ${y - 1} L${bx - 30} ${y - 1} M${bx + 30} ${y - 1} L${bx + 48} ${y - 1}"/></g>`;
}
function knob(x, on) {
  const y = 762;
  return `<g><circle fill="${P.steel}" cx="${x}" cy="${y}" r="17"/><g transform="rotate(${on ? 90 : 0} ${x} ${y})"><rect fill="${P.charDeep}" class="n" x="${x - 3}" y="${y - 14}" width="6" height="14" rx="3"/></g>${on ? `<circle class="thin" fill="${P.terra}" cx="${x + 26}" cy="${y - 12}" r="5"/>` : ''}</g>`;
}
function ovenDoor(state) {
  const { x0, x1, y0, y1 } = OVEN;
  if (state === 'open') {
    return `<g><path fill="${P.char}" d="M${x0} ${y1 - 4} L${x1} ${y1 - 4} L${x1 + 24} ${y1 + 62} L${x0 - 24} ${y1 + 62}Z"/>
    <path fill="${P.charHi}" d="M${x0 + 20} ${y1 + 4} L${x1 - 20} ${y1 + 4} L${x1 - 4} ${y1 + 46} L${x0 + 4} ${y1 + 46}Z"/>
    <rect fill="${P.steel}" x="${x0 + 10}" y="${y1 + 56}" width="${x1 - x0 - 20}" height="14" rx="7"/></g>`;
  }
  const lit = state === 'closedOn';
  return `<g><rect fill="${P.char}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="12"/>
  <rect fill="${P.steel}" x="${x0 + 14}" y="${y0 + 12}" width="${x1 - x0 - 28}" height="14" rx="7"/>
  <rect class="n" fill="${lit ? P.butter : P.charDeep}" opacity="${lit ? .45 : .55}" x="${x0 + 30}" y="${y0 + 46}" width="${x1 - x0 - 60}" height="${y1 - y0 - 86}" rx="10"/>
  <rect fill="none" x="${x0 + 30}" y="${y0 + 46}" width="${x1 - x0 - 60}" height="${y1 - y0 - 86}" rx="10"/>
  ${lit ? `<ellipse class="n" fill="${P.terra}" opacity=".3" cx="${(x0 + x1) / 2}" cy="${(y0 + y1) / 2 + 10}" rx="${(x1 - x0) / 2 - 40}" ry="50"/>` : ''}
  ${glint(`M${x0 + 50} ${y0 + 90} L${x0 + 84} ${y0 + 60}`, 5)}</g>`;
}
function sinkTap(on) {
  const x = SINK, t = CT;
  return `<g><path fill="${P.steel}" d="M${x - 7} ${t} L${x - 7} ${t - 70} Q${x - 7} ${t - 104} ${x + 27} ${t - 104} Q${x + 57} ${t - 104} ${x + 57} ${t - 76} L${x + 43} ${t - 76} Q${x + 43} ${t - 90} ${x + 27} ${t - 90} Q${x + 7} ${t - 90} ${x + 7} ${t - 70} L${x + 7} ${t}Z"/>
  <rect fill="${P.steel}" x="${x - 26}" y="${t - 16}" width="12" height="16" rx="3"/><rect fill="${on ? P.sky : P.steel}" x="${x + 14}" y="${t - 16}" width="12" height="16" rx="3"/>
  ${on ? `<rect fill="${P.sky}" x="${x + 44}" y="${t - 74}" width="12" height="72" rx="5"/>${glint(`M${x + 50} ${t - 62} L${x + 50} ${t - 40}`, 3)}${[[30, -8, 9], [62, -10, 7], [74, -4, 6], [42, -2, 6]].map(([dx, dy, r]) => `<circle fill="#fff" class="thin" cx="${x + dx}" cy="${t + dy}" r="${r}"/>`).join('')}` : ''}</g>`;
}
function toasterPiece(down) {
  const x = TOAST, y = CT + 2;
  return at(x, y, 1, `${down ? `<ellipse class="n" fill="${P.terra}" opacity=".35" cx="-2" cy="-74" rx="40" ry="8"/>` : ''}
  <rect fill="${P.mint}" x="-56" y="-78" width="112" height="78" rx="24"/>
  <rect fill="${P.tealDeep}" class="thin" x="-38" y="-80" width="30" height="8" rx="4"/><rect fill="${P.tealDeep}" class="thin" x="6" y="-80" width="30" height="8" rx="4"/>
  <rect fill="${P.teal}" x="54" y="-66" width="8" height="54" rx="4"/><rect fill="${P.charDeep}" x="52" y="${down ? -26 : -64}" width="20" height="12" rx="4"/>
  <circle fill="${P.cream}" cx="-30" cy="-34" r="9"/><path class="d" d="M-30 -34 L-24 -40"/>${heart(12, -34, .8, P.cream)}
  <rect fill="${P.tealDeep}" x="-50" y="-6" width="20" height="8" rx="3"/><rect fill="${P.tealDeep}" x="30" y="-6" width="20" height="8" rx="3"/>
  <path ${tl(P.white)} d="M-44 -62 L-20 -62"/>`);
}
const FILLS = { pink: [P.rose, P.blush], yellow: [P.banana, P.butter], green: [P.leafLight, P.mint], choc: [P.choc, P.woodLight], purple: [P.plum, P.lav], cream: [P.oat, '#fff'] };
function blenderPiece(fill) {
  const x = BLEND, y = CT + 2;
  const jug = `<path fill="${P.glass}" d="M-32 -60 L-38 -176 L38 -176 L32 -60Z"/>`;
  const liquid = fill ? `<path class="thin" fill="${FILLS[fill][0]}" d="M-31 -64 L-35 -140 L35 -140 L31 -64Z"/><path class="n" fill="${FILLS[fill][1]}" d="M-34 -140 Q-12 -128 0 -140 Q14 -152 35 -140 L35 -136 Q14 -146 0 -134 Q-14 -122 -34 -134Z"/><g class="n" fill="${FILLS[fill][1]}"><circle cx="-10" cy="-100" r="5"/><circle cx="12" cy="-86" r="4"/><circle cx="4" cy="-116" r="3.5"/></g>` : `<path ${tl(P.steelDeep, 'stroke-width:5')} d="M-14 -70 L14 -76 M-14 -76 L14 -70"/>`;
  return at(x, y, 1, `${jug}${liquid}<path fill="none" d="M-32 -60 L-38 -176 L38 -176 L32 -60Z"/>
  <path fill="${P.glass}" d="M36 -160 Q58 -160 56 -130 Q54 -104 34 -104 L34 -114 Q46 -114 46 -130 Q46 -150 36 -150Z"/>
  <rect fill="${P.rose}" x="-42" y="-190" width="84" height="18" rx="7"/><rect fill="${P.roseDeep}" x="-10" y="-202" width="20" height="14" rx="5"/>
  ${glint('M-24 -164 L-22 -120', 4)}
  <path fill="${P.rose}" d="M-40 -2 L-36 -62 L36 -62 L40 -2 Q40 0 36 0 L-36 0 Q-40 0 -40 -2Z"/>
  <circle fill="${P.cream}" cx="0" cy="-30" r="13"/><circle class="n" fill="${P.berry}" cx="0" cy="-30" r="6"/>`);
}
function coffeePiece(pour) {
  const x = COFFEE, y = CT + 2;
  const streamC = pour === 'coffee' ? P.choc : pour === 'cocoa' ? P.brown : pour === 'milk' ? '#fff' : null;
  return at(x, y, 1, `
  <rect fill="${P.steel}" x="-110" y="-196" width="220" height="16" rx="6"/>
  <rect fill="${P.teal}" x="-100" y="-182" width="200" height="150" rx="18"/>
  <rect fill="${P.tealDeep}" x="-100" y="-44" width="200" height="12" rx="4"/>
  <circle fill="${P.cream}" cx="-58" cy="-146" r="18"/><path class="d" d="M-58 -146 L-48 -154"/>
  <circle fill="${P.charDeep}" cx="-10" cy="-150" r="8"/><circle fill="${P.rose}" cx="16" cy="-150" r="8"/><circle fill="${P.butter}" cx="42" cy="-150" r="8"/>
  <rect fill="${P.steel}" x="-30" y="-120" width="60" height="18" rx="6"/><rect fill="${P.charDeep}" x="30" y="-116" width="50" height="10" rx="5"/>
  <rect fill="${P.steel}" x="-12" y="-102" width="24" height="12" rx="4"/>
  <path fill="${P.steel}" d="M70 -120 L78 -120 L82 -60 Q82 -54 76 -54 L72 -54Z"/>
  ${streamC ? `<rect fill="${streamC}" x="-5" y="-90" width="10" height="${pour === 'milk' ? 50 : 58}" rx="4"/>${pour === 'milk' ? '' : `<path ${tl('#fff', 'stroke:#fff;stroke-width:4;opacity:.85')} d="M-30 -110 q-8 -14 0 -28 M28 -110 q-8 -14 0 -28"/>`}` : ''}
  <rect fill="${P.steel}" x="-60" y="-32" width="120" height="16" rx="6"/><path ${tl(P.steelDeep)} d="M-44 -24 L44 -24"/>
  <rect fill="${P.tealDeep}" x="-100" y="-16" width="200" height="16" rx="6"/>
  ${glint('M-88 -166 L-88 -126', 4)}`);
}
function registerPiece(open) {
  const x = REG, y = ORD.top + 4;
  const drawer = open
    ? `<path fill="${P.mustardDeep}" d="M-72 -34 L72 -34 L84 22 L-84 22Z"/><path fill="${P.cream}" d="M-64 -28 L64 -28 L72 10 L-72 10Z"/>${[-44, -14, 16, 46].map((dx, i) => `<path class="thin" fill="none" d="M${dx - 12} -24 L${dx + 16} -24"/><circle class="thin" fill="${i % 2 ? P.mustard : P.steel}" cx="${dx}" cy="-8" r="8"/><circle class="thin" fill="${i % 2 ? P.mustard : P.steel}" cx="${dx + 6}" cy="-2" r="8"/>`).join('')}<rect fill="${P.mustardDeep}" x="-84" y="16" width="168" height="10" rx="5"/><rect fill="${P.woodDark}" x="-14" y="10" width="28" height="8" rx="4"/>`
    : `<rect fill="${P.mustardDeep}" x="-76" y="-34" width="152" height="34" rx="6"/><rect fill="${P.woodDark}" x="-14" y="-20" width="28" height="8" rx="4"/>`;
  const keys = [[-40, -70, P.rose], [-14, -70, P.butter], [12, -70, P.mint], [-44, -52, P.sky], [-18, -52, P.lav], [8, -52, P.peach]].map(([kx, ky, c]) => `<rect fill="${c}" class="thin" x="${kx}" y="${ky}" width="20" height="13" rx="4"/>`).join('');
  return at(x, y, 1, `
  <path fill="${P.mustard}" d="M-70 -34 L-60 -96 L70 -96 L70 -34Z"/>${keys}
  <rect fill="${P.teal}" x="36" y="-80" width="24" height="36" rx="6"/>
  <rect fill="${P.mustard}" x="-8" y="-136" width="78" height="44" rx="8"/><rect fill="${P.sky}" class="thin" x="2" y="-128" width="58" height="26" rx="4"/>
  ${open ? `<rect fill="${P.cream}" class="thin" x="-40" y="-136" width="30" height="24" rx="4"/><circle class="n" fill="${P.berry}" cx="-25" cy="-124" r="6"/><rect fill="${P.woodDark}" x="-27" y="-114" width="4" height="22"/>` : ''}
  ${drawer}`);
}
function bellPiece(down) {
  const x = BELL, y = ORD.top + 4;
  return at(x, y, 1, `<rect fill="${P.woodDark}" x="-34" y="-10" width="68" height="10" rx="4"/>
  <path fill="${P.mustard}" d="M-28 -10 Q-28 -46 0 -48 Q28 -46 28 -10Z"/><path ${tl(P.butter, 'stroke-width:4')} d="M-16 -18 Q-18 -32 -8 -40"/>
  <rect fill="${P.steelDeep}" x="-3" y="${down ? -52 : -60}" width="6" height="${down ? 6 : 14}"/><circle fill="${P.steel}" cx="0" cy="${down ? -54 : -62}" r="7"/>
  ${down ? `<path ${tl(P.mustardDeep, 'stroke-width:4')} d="M-40 -46 L-50 -58 M40 -46 L50 -58 M0 -76 L0 -88"/>` : ''}`);
}
function menuPiece(pictures) {
  const { x, y, w, h } = MENU;
  const chalk = `style="stroke:${P.cream}" class="tl"`;
  const row = (yy, icon) => `${at(x + 70, yy, 1, icon)}<path class="tl" style="stroke:${P.cream};stroke-dasharray:2 12" d="M${x + 120} ${yy - 12} L${x + 290} ${yy - 12}"/><circle class="n" fill="${P.butter}" cx="${x + 316}" cy="${yy - 12}" r="10"/>`;
  const board = `<path class="d" d="M${x + 50} ${y} L${x + w / 2} ${y - 70} L${x + w - 50} ${y}"/><circle fill="${P.woodDark}" cx="${x + w / 2}" cy="${y - 70}" r="7"/>
  <rect fill="${P.woodDeep}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/><rect fill="${P.chalk}" x="${x + 16}" y="${y + 16}" width="${w - 32}" height="${h - 32}" rx="6"/>
  ${at(x + w / 2, y + 74, 1, `<path ${chalk} d="M-20 -30 L20 -30 L17 -6 Q16 0 10 0 L-10 0 Q-16 0 -17 -6Z M20 -24 Q30 -24 29 -16 Q28 -10 18 -10 M-6 -40 Q-10 -48 -4 -54 M6 -40 Q2 -48 8 -54"/>`)}
  <path class="tl" style="stroke:${P.cream};stroke-width:4" d="M${x + 50} ${y + 96} Q${x + w / 2} ${y + 84} ${x + w - 50} ${y + 96}"/>
  <path class="tl" style="stroke:${P.cream}" d="M${x + 36} ${y + h - 40} l10 -10 l10 10 M${x + w - 56} ${y + h - 40} l10 -10 l10 10"/>`;
  if (!pictures) return `<g>${board}</g>`;
  return `<g>${board}
  ${row(y + 170, `<path ${chalk} d="M-30 -4 L30 -4 M-26 -12 Q0 -20 26 -12 M-28 -20 Q0 -30 28 -20 M-24 -30 Q0 -38 24 -30"/><path class="n" fill="${P.butter}" d="M-6 -42 L6 -42 L6 -34 L-6 -34Z"/>`)}
  ${row(y + 240, `<path ${chalk} d="M-30 -18 Q-30 -40 0 -40 Q30 -40 30 -18Z M-32 -12 L32 -12 M-30 -4 Q0 4 30 -4"/>`)}
  ${row(y + 310, `<path ${chalk} d="M-18 0 L-22 -24 L22 -24 L18 0Z M-26 -24 Q-30 -40 -12 -42 Q-6 -56 8 -50 Q26 -52 26 -30 L26 -24"/>`)}</g>`;
}

// ---------------------------------------------------------------------------
export const ROOM = {
  id: 'cafe',
  offset: [0, 0],                                      // world = art * ART_SCALE + offset
  canvas: { x: -100, y: -100, w: 3080, h: 1200 },      // world units, incl. the bleed
  width: 2880,                                         // playable strip width (world)
  defs: DEFS,
  layers: [
    { id: 'back', baseline: 0, opaque: true,
      art: () => `${wall()}${floor()}${rugs()}${pillar(ZK[1])}${pillar(ZC[1])}
        ${pantry()}${windowK()}${hood()}${utensilRail()}${shelvesK()}${cupShelves()}
        ${windowSeatWindow()}${frames()}${doorFrame()}${coatRack()}${at(4120, WALL_Y + 20, .8, `${bigLeaves()}${pot(P.teal, 170, 120)}`)}
        ${fairyLights()}${lamps()}` },
    { id: 'counter', baseline: 724,
      art: () => `${fridgeBody()}${backCounter()}${leaningBoard()}${backBar()}${windowSeatBench()}${sideboard()}` },
    { id: 'mid', baseline: 820,
      art: () => `${island()}${at(860, 1250, 1, stool(P.oat))}${at(1170, 1250, 1, stool(P.oat))}${orderCounter()}${diningChairs()}` },
    { id: 'front', baseline: 1000,
      art: () => `${table(TABLES[0], budVase(P.rose))}${table(TABLES[1], budVase(P.butter))}${table(TABLES[2], budVase(P.lav))}
        ${bigPlant(1950, 1560, .62, P.teal)}${bigPlant(-60, 1560, .85, P.terra)}` },
  ],
  // Pieces: things that change state. variants[0] is the default. `taps` is the
  // natural tap cycle; pivot is a hinge point (art units) for a squash/swing.
  pieces: [
    { id: 'fridge-door', layer: 'counter', variants: { closed: () => fridgeDoor(false), open: () => fridgeDoor(true) }, taps: ['closed', 'open'], pivot: [FR.x, 790] },
    { id: 'oven-door', layer: 'counter', variants: { closed: () => ovenDoor('closed'), closedOn: () => ovenDoor('closedOn'), open: () => ovenDoor('open') }, taps: ['closed', 'open'], pivot: [(OVEN.x0 + OVEN.x1) / 2, OVEN.y1] },
    { id: 'burner-1', layer: 'counter', variants: { off: () => burner(BURN[0], false), on: () => burner(BURN[0], true) }, taps: ['off', 'on'] },
    { id: 'burner-2', layer: 'counter', variants: { off: () => burner(BURN[1], false), on: () => burner(BURN[1], true) }, taps: ['off', 'on'] },
    { id: 'knob-1', layer: 'counter', variants: { off: () => knob(BURN[0], false), on: () => knob(BURN[0], true) }, taps: ['off', 'on'], controls: 'burner-1' },
    { id: 'knob-2', layer: 'counter', variants: { off: () => knob(BURN[1], false), on: () => knob(BURN[1], true) }, taps: ['off', 'on'], controls: 'burner-2' },
    { id: 'sink-tap', layer: 'counter', variants: { off: () => sinkTap(false), on: () => sinkTap(true) }, taps: ['off', 'on'] },
    { id: 'toaster', layer: 'counter', variants: { up: () => toasterPiece(false), down: () => toasterPiece(true) }, taps: ['up', 'down'] },
    { id: 'blender', layer: 'counter', variants: { empty: () => blenderPiece(null), ...Object.fromEntries(Object.keys(FILLS).map((k) => [k, () => blenderPiece(k)])) } },
    { id: 'coffee-machine', layer: 'counter', variants: { idle: () => coffeePiece(null), coffee: () => coffeePiece('coffee'), cocoa: () => coffeePiece('cocoa'), milk: () => coffeePiece('milk') } },
    { id: 'register', layer: 'mid', variants: { closed: () => registerPiece(false), open: () => registerPiece(true) }, taps: ['closed', 'open'] },
    { id: 'counter-bell', layer: 'mid', variants: { up: () => bellPiece(false), down: () => bellPiece(true) }, taps: ['up', 'down'] },
    { id: 'menu-board', layer: 'back', variants: { blank: () => menuPiece(false), pictures: () => menuPiece(true) },
      // the blank chalk area under the header doodle, for Zoe's text layer (art units)
      textArea: [MENU.x + 34, MENU.y + 110, MENU.w - 68, MENU.h - 170] },
    { id: 'front-door', layer: 'back', variants: { closed: () => doorPiece(false), open: () => doorPiece(true) }, taps: ['closed', 'open'], pivot: [DOOR.x0, 740] },
    { id: 'door-bell', layer: 'back', variants: { still: () => doorBellPiece(false), ring: () => doorBellPiece(true) }, pivot: [DOOR.x0 + 50, DOOR.top - 16] },
  ],
  // Surfaces: [x0, x1, y] art units. `inside` = only usable while that piece variant shows.
  surfaces: [
    { id: 'pantry-1', layer: 'back', seg: [70, 510, 330] }, { id: 'pantry-2', layer: 'back', seg: [70, 510, 510] },
    { id: 'pantry-3', layer: 'back', seg: [70, 510, 690] }, { id: 'pantry-4', layer: 'back', seg: [70, 510, 870] },
    { id: 'window-sill', layer: 'back', seg: [850, 1170, 498] },
    { id: 'shelf-k1', layer: 'back', seg: [1670, 1910, 240] }, { id: 'shelf-k2', layer: 'back', seg: [1670, 1910, 410] },
    { id: 'cup-shelf-1', layer: 'back', seg: [2520, 2720, 290] }, { id: 'cup-shelf-2', layer: 'back', seg: [2520, 2720, 450] },
    { id: 'dining-shelf', layer: 'back', seg: [3260, 3620, 570] },
    { id: 'sideboard', layer: 'counter', seg: [SIDE.x0 - 10, SIDE.x1 + 10, SIDE.top] },
    { id: 'window-seat-sill', layer: 'back', seg: [2830, 3190, 678] },
    { id: 'fridge-top', layer: 'counter', seg: [590, 830, 358] },
    { id: 'fridge-1', layer: 'counter', seg: [600, 820, 690], inside: 'fridge-door:open' },
    { id: 'fridge-2', layer: 'counter', seg: [600, 820, 820], inside: 'fridge-door:open' },
    { id: 'fridge-3', layer: 'counter', seg: [606, 814, 940], inside: 'fridge-door:open' },
    { id: 'oven-rack', layer: 'counter', seg: [OVEN.x0 + 24, OVEN.x1 - 24, 930], inside: 'oven-door:open' },
    { id: 'counter-sink', layer: 'counter', seg: [840, 1110, CT] },
    { id: 'cutting-board', layer: 'counter', seg: [BOARD[0] + 4, BOARD[1] - 4, CT - 16] },
    { id: 'stovetop', layer: 'counter', seg: [STOVE[0], STOVE[1], CT] },
    { id: 'counter-right', layer: 'counter', seg: [STOVE[1], 1940, CT] },
    { id: 'back-bar', layer: 'counter', seg: [BAR[0] - 10, BAR[1] + 10, CT] },
    { id: 'window-seat', layer: 'counter', seg: [WSEAT.x0, WSEAT.x1 - 120, WSEAT.top - 6] },
    { id: 'island-top', layer: 'mid', seg: [760, 1270, ISL.top] },
    { id: 'island-shelf', layer: 'mid', seg: [810, 1220, ISL.bot - 70] },
    { id: 'order-counter', layer: 'mid', seg: [ORD.x0 - 16, ORD.x1 + 16, ORD.top] },
    { id: 'display-shelf', layer: 'mid', seg: [ORD.x0 + 30, 2312, 1018] },
    ...TABLES.map((x, i) => ({ id: `table-${i + 1}`, layer: 'front', seg: [x - 150, x + 150, TTOP] })),
  ],
  seats: [
    { id: 'island-stool-1', layer: 'mid', at: [860, 1172] }, { id: 'island-stool-2', layer: 'mid', at: [1170, 1172] },
    { id: 'window-seat-1', layer: 'counter', at: [2920, WSEAT.top - 6] }, { id: 'window-seat-2', layer: 'counter', at: [3050, WSEAT.top - 6] },
    ...TABLES.flatMap((x, i) => { const k = i < 2 ? 'chair' : 'stool'; return [{ id: `table-${i + 1}-${k}-l`, layer: 'mid', at: [x - 80, 1236] }, { id: `table-${i + 1}-${k}-r`, layer: 'mid', at: [x + 80, 1236] }]; }),
  ],
  // Slots: appliance/station anchor points (art units). at = where a prop rests; box = [x, y, w, h].
  slots: [
    { id: 'burner-1', kind: 'burner', layer: 'counter', at: [BURN[0], CT - 2], piece: 'burner-1' },
    { id: 'burner-2', kind: 'burner', layer: 'counter', at: [BURN[1], CT - 2], piece: 'burner-2' },
    { id: 'oven', kind: 'oven', layer: 'counter', at: [(OVEN.x0 + OVEN.x1) / 2, 930], box: [OVEN.x0 + 16, OVEN.y0 + 16, OVEN.x1 - OVEN.x0 - 32, OVEN.y1 - OVEN.y0 - 36], piece: 'oven-door' },
    { id: 'sink', kind: 'sink', layer: 'counter', at: [SINK, CT + 6], box: [SINK - 90, CT - 30, 180, 40], piece: 'sink-tap' },
    { id: 'cutting-board', kind: 'board', layer: 'counter', at: [(BOARD[0] + BOARD[1]) / 2, CT - 16], box: [BOARD[0], CT - 90, BOARD[1] - BOARD[0], 76] },
    { id: 'toaster', kind: 'toaster', layer: 'counter', at: [TOAST - 12, CT - 70], piece: 'toaster' },
    { id: 'blender', kind: 'blender', layer: 'counter', at: [BLEND, CT - 176], box: [BLEND - 38, CT - 176, 76, 116], piece: 'blender' },
    { id: 'coffee-cup', kind: 'coffee', layer: 'counter', at: [COFFEE, CT - 30], piece: 'coffee-machine' },
    { id: 'fridge', kind: 'fridge', layer: 'counter', box: [FR.x + 16, FR.split + 10, FR.w - 32, FR.bot - FR.split - 40], piece: 'fridge-door' },
    { id: 'register-drawer', kind: 'register', layer: 'mid', at: [REG, ORD.top + 10], piece: 'register' },
    ...[[-30, -64], [-4, -64], [22, -64], [-34, -46], [-8, -46], [18, -46]].map(([dx, dy], i) => ({ id: `register-key-${i + 1}`, kind: 'key', layer: 'mid', at: [REG + dx, ORD.top + 4 + dy], piece: 'register', note: i })),
    { id: 'counter-bell', kind: 'bell', layer: 'mid', at: [BELL, ORD.top - 40], piece: 'counter-bell' },
    { id: 'tip-jar', kind: 'tip-jar', layer: 'mid', at: [TIP, ORD.top] },
    ...TUBS.map((x, i) => ({ id: `ice-cream-${['vanilla', 'strawberry', 'chocolate'][i]}`, kind: 'scoop', layer: 'counter', at: [x, CT + 96] })),
    { id: 'door', kind: 'door', layer: 'back', at: [(DOOR.x0 + DOOR.x1) / 2, WALL_Y + 20], piece: 'front-door' },
    { id: 'order-spot', kind: 'queue', layer: 'mid', at: [2420, 1300] },
    { id: 'staff-spot', kind: 'staff', layer: 'counter', at: [2300, 1110] },
  ],
  // Spawners (design 2.3): drag out a fresh copy; `items` are prop ids.
  spawners: [
    { id: 'fridge', surfaces: ['fridge-1', 'fridge-2', 'fridge-3'], piece: 'fridge-door', when: 'open',
      items: ['egg', 'milk', 'butter', 'cheese', 'tomato', 'lettuce', 'carrot', 'strawberry', 'blueberries', 'lemon', 'sausage', 'fish', 'chicken', 'tofu'] },
    { id: 'pantry', surfaces: ['pantry-1', 'pantry-2', 'pantry-3', 'pantry-4'],
      items: ['flour', 'sugar', 'rice', 'pasta', 'honey', 'chocolate', 'sprinkles', 'coffee-beans', 'bread', 'onion', 'potato', 'banana', 'apple', 'seaweed'] },
    { id: 'ice-cream', slots: ['ice-cream-vanilla', 'ice-cream-strawberry', 'ice-cream-chocolate'], items: ['scoop'] },
    { id: 'cups', at: [2340, CT], items: ['cafe-cup'] },
    { id: 'plates', at: [2408, CT], items: ['plate'] },
  ],
  // Camera zones (art x). camera = the left edge of a 1440-wide view (world) that frames the zone.
  zones: [
    { id: 'kitchen', x0: ZK[0], x1: ZK[1], camera: 0 },
    { id: 'counter', x0: ZC[0], x1: ZC[1], camera: 900 },
    { id: 'dining', x0: ZD[0], x1: ZD[1], camera: 1440 },
  ],
  floor: { y0: WALL_Y, y1: 1372 },
};
