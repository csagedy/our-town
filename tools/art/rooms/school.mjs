// The School (P2d.1, docs/design.md 3.4): ONE panning strip, 3200 world
// units wide, with three zones, so Ian can rehearse a kindergarten day:
//   ARRIVAL: the bus at the kerb (door open/closed), the bus stop, the
//     school's front facade (bell tower, front door open/closed), then the
//     hallway: six cubbies with PICTURE labels (an animal each), line-up
//     footprints, a low hand-washing sink and the cozy CALM CORNER
//     (beanbag, canopy, a feelings chart of five faces).
//   CLASSROOM: the letter wall (26 big letters), calendar + weather board,
//     a window whose weather changes, the daily schedule strip (pictures),
//     the whiteboard and the easel (canvas regions), a block shelf with
//     picture-labelled cleanup bins, a low table with small chairs, the
//     teacher's rocking chair, the circle-time rug with coloured spots
//     (sit-cross seats), the sight-word board (blank cards: words are
//     data), a book corner with the class goldfish, and the nap cots.
//   LUNCH + RECESS (outside): a patio lunch table under an awning with a
//     serving hatch, the flag, a play tower with monkey bars and a slide,
//     two swings, a seesaw, a sandbox (its sand is a separate dig layer),
//     and a chalk hopscotch drawn with dots, not numbers.
// Authored in art units like the cafe and the site (world = art * ART_SCALE).
//
// Shipped as depth layers (back / counter / mid / front) plus PIECES: every
// fixture that changes state or moves is its own raster (bus, bus door,
// front door, bell, sink tap, light switch, weather card slot, the window's
// weather, the goldfish, the rocking chair, swing chains and seats, the
// seesaw plank, the sand). SCHOOL_RIGS (world units) records what the engine
// needs beyond surfaces/seats/slots: letter boxes, schedule cards, calendar
// dots, sight-word cards, canvas regions, the slide path, swing and seesaw
// pivots, monkey-bar grips, hopscotch spots and the sandbox dig box.
import { P, ART_SCALE } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';
import * as HH from '../props/household.mjs';
import { WX, feelFace, animal, schedIcon, CUBBY_ANIMALS, SCHEDULE, CRAYONS } from '../props/school.mjs';
const { pot, plantLeafy, succulent, hangingPlant, books, bookStack, pendant, mug, jar } = HH;

export const ART_W = 4571;                          // 3200 world
const WALL_Y = 1010;                                // wall foot = back edge of the floor
const BB = 1040;                                    // counter baseline (art)
const MB = 1290;                                    // mid baseline (art)
const X0 = -150, X1 = 4730, Y0 = -150, Y1 = 1580;
const ZA = [0, 1640], ZB = [1640, 3120], ZC = [3120, ART_W];   // zones (art x)
const HAZ = '#EE9A55';
const SAND = '#EBD3AC', SANDD = '#D9BC90', CHIPS = '#E3C29C', TOP = '#CFC6BD', TOPD = '#BDB2A8';

const DEFS = `<defs>
  <pattern id="sc-hall" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#F8ECCB"/>
    <g fill="#FBF3E1"><circle cx="20" cy="20" r="6"/><circle cx="60" cy="60" r="6"/></g><g fill="#F0DDB0"><circle cx="60" cy="20" r="3"/><circle cx="20" cy="60" r="3"/></g></pattern>
  <pattern id="sc-class" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="#D9EDF2"/>
    <path fill="#EAF5F7" d="M30 22 L33 30 L41 30 L35 35 L37 43 L30 38 L23 43 L25 35 L19 30 L27 30Z"/>
    <path fill="#EAF5F7" d="M84 76 q0 -8 8 -8 q3 -7 11 -5 q7 -2 9 6 q7 1 6 7Z"/><circle cx="90" cy="24" r="4" fill="#C6E3EA"/><circle cx="28" cy="92" r="4" fill="#C6E3EA"/></pattern>
  <pattern id="sc-tile" width="84" height="84" patternUnits="userSpaceOnUse"><rect width="84" height="84" fill="#F4E6CC"/><rect width="42" height="42" fill="#F9EFDB"/><rect x="42" y="42" width="42" height="42" fill="#F9EFDB"/></pattern>
</defs>`;

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------
const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;
const glint = (d, w = 6) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const cloud = (x, y, s = 1) => at(x, y, s, `<path class="n" fill="#fff" d="M0 0 q0 -30 30 -30 q10 -24 38 -18 q26 -6 34 20 q26 2 24 28Z"/>`);
const tree = (x, y, s = 1, c = P.leaf) => at(x, y, s, `<rect fill="${P.woodDeep}" x="-8" y="-60" width="16" height="60"/><path fill="${c}" d="${scallop(0, -96, 50, 46, 9, 10)}"/><path fill="${P.leafLight}" class="n" d="${scallop(-12, -106, 22, 18, 6, 5)}"/>`);
const bush = (x, y, s = 1, flower = P.rose) => at(x, y, s, `<path fill="${P.leafDeep}" d="${scallop(0, -34, 70, 36, 8, 14, 180, 360, false)} L70 0 L-70 0Z"/>
  ${[[-40, -44], [-8, -58], [26, -46], [48, -26], [-52, -18]].map(([a, b], i) => `<circle class="thin" fill="${i % 2 ? P.butter : flower}" cx="${a}" cy="${b}" r="8"/>`).join('')}`);
const shelfBoard = (x0, x1, y) => `${R(x0, y - 10, x1 - x0, 12, P.woodLight)}${R(x0, y + 2, x1 - x0, 16, P.wood, ' rx="3"')}
  <path fill="${P.woodDeep}" d="M${x0 + 24} ${y + 18} L${x0 + 24} ${y + 44} L${x0 + 48} ${y + 18}Z M${x1 - 24} ${y + 18} L${x1 - 24} ${y + 44} L${x1 - 48} ${y + 18}Z"/>`;
const shadow = (cx, cy, rx, ry = 10, o = .1) => `<ellipse class="n" fill="${P.ink}" opacity="${o}" cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"/>`;
function wheel(x, y, r) {
  return `<circle fill="${P.charDeep}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}"/><circle fill="${P.steel}" class="thin" cx="${f(x)}" cy="${f(y)}" r="${f(r * .45)}"/><circle fill="${P.steelDeep}" class="n" cx="${f(x)}" cy="${f(y)}" r="${f(r * .14)}"/>
  <path ${tl(P.charHi, 'stroke-width:5')} d="M${f(x - r * .72)} ${f(y - r * .3)} A${f(r * .78)} ${f(r * .78)} 0 0 1 ${f(x - r * .3)} ${f(y - r * .72)}"/>`;
}
function brick(x, y, w, h, c = P.terra, d = P.terraDeep, row = 26) {
  let lines = '';
  for (let r = 0; r * row < h; r++) {
    const yy = y + r * row;
    if (r) lines += `M${f(x)} ${f(yy)} L${f(x + w)} ${f(yy)} `;
    for (let c2 = (r % 2) * 30 + 30; c2 < w; c2 += 60) lines += `M${f(x + c2)} ${f(yy)} L${f(x + c2)} ${f(Math.min(yy + row, y + h))} `;
  }
  return `${R(x, y, w, h, c)}<path ${tl(d)} d="${lines}"/>${R(x, y, w, h, 'none')}`;
}
/** Chunky outlined LETTERS (a stroke skeleton in a 60 x 80 box), drawn as ink under colour. */
const GLYPH = {
  A: 'M6 76 L30 5 L54 76 M16 50 L44 50', B: 'M11 5 L11 75 M11 5 L31 5 Q50 5 50 22 Q50 39 31 39 L11 39 M11 39 L34 39 Q54 39 54 57 Q54 75 34 75 L11 75',
  C: 'M53 16 Q46 5 32 5 Q7 5 7 40 Q7 75 32 75 Q46 75 53 64', D: 'M11 5 L11 75 M11 5 L25 5 Q53 5 53 40 Q53 75 25 75 L11 75',
  E: 'M50 5 L11 5 L11 75 L50 75 M11 40 L42 40', F: 'M50 5 L11 5 L11 75 M11 40 L42 40',
  G: 'M53 16 Q46 5 32 5 Q7 5 7 40 Q7 75 32 75 Q54 75 54 48 L35 48', H: 'M9 5 L9 75 M51 5 L51 75 M9 40 L51 40',
  I: 'M30 5 L30 75 M15 5 L45 5 M15 75 L45 75', J: 'M44 5 L44 54 Q44 75 26 75 Q11 75 8 60',
  K: 'M11 5 L11 75 M50 5 L13 44 M25 32 L52 75', L: 'M13 5 L13 75 L50 75',
  M: 'M7 75 L7 5 L30 46 L53 5 L53 75', N: 'M9 75 L9 5 L51 75 L51 5',
  O: 'M30 5 A23 35 0 1 0 30 75 A23 35 0 1 0 30 5Z', P: 'M11 75 L11 5 L32 5 Q53 5 53 24 Q53 43 32 43 L11 43',
  Q: 'M30 5 A23 35 0 1 0 30 75 A23 35 0 1 0 30 5Z M36 56 L54 78', R: 'M11 75 L11 5 L32 5 Q53 5 53 23 Q53 41 32 41 L11 41 M30 41 L52 75',
  S: 'M51 15 Q44 5 30 5 Q9 5 9 22 Q9 36 30 40 Q51 44 51 58 Q51 75 30 75 Q15 75 7 65', T: 'M6 5 L54 5 M30 5 L30 75',
  U: 'M9 5 L9 52 Q9 75 30 75 Q51 75 51 52 L51 5', V: 'M6 5 L30 75 L54 5',
  W: 'M3 5 L16 75 L30 30 L44 75 L57 5', X: 'M9 5 L51 75 M51 5 L9 75', Y: 'M6 5 L30 40 L54 5 M30 40 L30 75', Z: 'M9 5 L51 5 L9 75 L51 75',
};
function glyph(ch, x, y, s, c) {
  const d = GLYPH[ch];
  return `<g transform="translate(${f(x - 30 * s)} ${f(y - 40 * s)}) scale(${s})"><path fill="none" style="stroke:${P.ink};stroke-width:${f(15 + 2 * 4.5)}" d="${d}"/><path fill="none" style="stroke:${c};stroke-width:15" d="${d}"/></g>`;
}

// ---------------------------------------------------------------------------
// BACK layer: sky, the kerb and road, the facade, the walls and floors
// ---------------------------------------------------------------------------
const FAC = { x0: 540, x1: 900, top: 330, door: [620, 820], doorTop: 470 };
function skyAndStreet() {
  // outside at the left (in front of the school) and at the right (the playground)
  const sky = (x0, x1) => `<rect class="n" x="${x0}" y="${Y0}" width="${x1 - x0}" height="${WALL_Y - Y0 + 10}" fill="${P.sky}"/>`;
  const hills = (x0, x1, y) => `<path class="n" fill="${P.leafLight}" d="M${x0} ${y + 60} Q${x0 + (x1 - x0) * .25} ${y - 40} ${x0 + (x1 - x0) * .5} ${y + 30} Q${x0 + (x1 - x0) * .75} ${y - 30} ${x1} ${y + 20} L${x1} ${WALL_Y} L${x0} ${WALL_Y}Z"/>`;
  const houses = [[-120, 150, 120, P.lav, P.plum], [80, 120, 150, P.peach, P.terra], [260, 130, 110, P.mint, P.teal]].map(([x, w, h, c, r], i) => {
    const y = 820;
    const roof = i % 2 ? `<path fill="${r}" d="M${x - 10} ${y - h} L${x + w / 2} ${y - h - 50} L${x + w + 10} ${y - h}Z"/>` : R(x - 6, y - h - 14, w + 12, 16, r, ' rx="4"');
    let win = '';
    for (let yy = y - h + 22; yy < y - 30; yy += 44) for (let xx = x + 18; xx < x + w - 30; xx += 40) win += R(xx, yy, 22, 26, P.sky, ' class="thin" rx="3"');
    return `${R(x, y - h, w, h, c)}${roof}${win}`;
  }).join('');
  const left = `${sky(X0, FAC.x1)}${cloud(-60, 160, .9)}${cloud(250, 90, .8)}${hills(X0, FAC.x0 + 20, 760)}${houses}
    ${tree(430, 830, 1.1)}${tree(-40, 840, .9, P.leafDeep)}
    <rect class="n" x="${X0}" y="820" width="${FAC.x0 + 20 - X0}" height="${WALL_Y - 820 + 10}" fill="${P.sage}"/>
    ${bush(120, WALL_Y, .8, P.butter)}${bush(360, WALL_Y, .7, P.rose)}`;
  const right = `${sky(3120, X1)}${cloud(3700, 120, 1.1)}${cloud(4150, 60, .8)}${cloud(4500, 190, .9)}
    ${at(4420, 180, 1, `${[...Array(10)].map((_, i) => `<g transform="rotate(${i * 36})"><path fill="${P.butter}" class="thin" d="M-9 -78 L0 -100 L9 -78Z"/></g>`).join('')}<circle fill="${P.butter}" r="62"/><circle class="n" fill="#FFF3C4" cx="-18" cy="-20" r="16"/>`)}
    ${hills(3540, X1, 690)}${tree(3650, 780, 1.2)}${tree(3990, 770, 1, P.leafDeep)}${tree(4260, 790, 1.3)}${tree(4640, 780, 1, P.leafDeep)}
    ${[[3880, 640, P.rose], [3930, 610, P.blue], [3970, 650, P.butter]].map(([x, y, c], i) => at(x, y, .8, `<path fill="${c}" d="M-16 0 Q-18 -18 0 -20 Q14 -22 18 -8 L28 -10 L20 0 Q10 8 -6 6Z"/><circle class="ink" cx="8" cy="-12" r="2.6"/><path fill="${P.mustard}" class="thin" d="M18 -14 L26 -12 L18 -9Z"/>`)).join('')}`;
  return left + right;
}
function ground() {
  // kerb, sidewalk and road in front of the school
  const walk = `<rect class="n" x="${X0}" y="${WALL_Y}" width="${FAC.x1 - X0}" height="${Y1 - WALL_Y}" fill="#EDE3D6"/>
    <path ${tl('#DCCFBF')} d="${[1060, 1120, 1190].map((y) => `M${X0} ${y} L${FAC.x1} ${y}`).join(' ')} ${[-60, 110, 280, 450, 620, 790].map((x) => `M${x} ${WALL_Y} L${x - 20} 1260`).join(' ')}"/>
    <rect class="n" x="${X0}" y="1250" width="${FAC.x1 - X0}" height="${Y1 - 1250}" fill="${TOP}"/>
    ${R(X0, 1238, FAC.x1 - X0 + 10, 22, P.oat)}
    <path ${tl('#fff', 'stroke:#fff;stroke-width:8;stroke-dasharray:60 40')} d="M${X0} 1500 L${FAC.x1} 1500"/>`;
  // outside at the right: patio, grass, wood chips, blacktop
  let chips = '', seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) { const x = 3620 + rnd() * 820, y = WALL_Y + 20 + rnd() * 190; chips += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(5 + rnd() * 4)}" ry="3" fill="${i % 2 ? P.wood : '#EFD3B1'}"/>`; }
  const yard = `<rect class="n" x="3120" y="${WALL_Y}" width="${X1 - 3120}" height="${Y1 - WALL_Y}" fill="${P.leafLight}"/>
    <path ${tl(P.leaf, 'stroke-width:4')} d="${[...Array(24)].map((_, i) => { const x = 3600 + i * 50 + (i % 3) * 7, y = 1060 + (i % 5) * 40; return `M${x} ${y} l-4 -12 M${x + 6} ${y} l3 -12`; }).join(' ')}"/>
    <path class="n" fill="${CHIPS}" d="M3600 ${WALL_Y + 6} L4480 ${WALL_Y + 6} Q4520 1130 4460 1225 Q4040 1250 3620 1225 Q3570 1130 3600 ${WALL_Y + 6}Z"/><g class="n">${chips}</g>
    <path class="n" fill="${TOP}" d="M3560 1256 Q4100 1240 ${X1} 1252 L${X1} ${Y1} L3560 ${Y1}Z"/>
    <path ${tl(TOPD, 'stroke-width:4')} d="M3600 1286 Q4100 1274 ${X1} 1284"/>
    <rect class="n" x="3120" y="${WALL_Y}" width="440" height="${Y1 - WALL_Y}" fill="#EDE3D6"/>
    <path ${tl('#DCCFBF')} d="${[1070, 1150, 1250, 1370, 1500].map((y) => `M3120 ${y} L3560 ${y}`).join(' ')} M3230 ${WALL_Y} L3210 ${Y1} M3340 ${WALL_Y} L3340 ${Y1} M3450 ${WALL_Y} L3470 ${Y1}"/>`;
  return walk + yard;
}
const HOP = [[3990, 1340], [4070, 1340], [4150, 1340], [4230, 1300], [4230, 1380], [4310, 1340], [4390, 1300], [4390, 1380], [4480, 1340]];
function hopscotch() {
  // shapes with DOTS (1..8), never numbers, plus a sun "home"
  const cells = HOP.slice(0, 8).map(([x, y], i) => [x, y, i + 1]);
  const cols = [CRAYONS.pink[0], CRAYONS.yellow[0], CRAYONS.blue[0], CRAYONS.green[0], CRAYONS.purple[0], CRAYONS.pink[0], CRAYONS.yellow[0], CRAYONS.blue[0]];
  let s = '';
  cells.forEach(([x, y, n], i) => {
    const h = 36;
    s += `<path fill="none" class="n" style="stroke:${cols[i]};stroke-width:7;stroke-linejoin:round" d="${rrect(x - 38, y - h, 76, h * 2, 6)}"/>`;
    const pts = [[0, 0], [-12, 0, 12, 0], [-14, 8, 0, -8, 14, 8], [-10, -10, 10, -10, -10, 10, 10, 10], [-12, -12, 12, -12, 0, 0, -12, 12, 12, 12]][Math.min(n, 5) - 1] || [];
    const dots = [];
    if (n <= 5) for (let k = 0; k < pts.length; k += 2) dots.push([pts[k], pts[k + 1]]);
    else for (let k = 0; k < n; k++) dots.push([(k % 3 - 1) * 14, (Math.floor(k / 3) - (n > 6 ? 1 : .5)) * 14]);
    s += dots.map(([dx, dy]) => `<circle class="n" fill="#fff" cx="${f(x + dx)}" cy="${f(y + dy)}" r="5.5"/>`).join('');
  });
  const ch = (c, w = 7) => `class="n" fill="none" style="stroke:${c};stroke-width:${w};stroke-linecap:round"`;
  s += `<g transform="translate(${HOP[8][0]} ${HOP[8][1]})"><circle ${ch(P.mustard)} r="28"/><path ${ch(P.mustard)} d="${[...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return `M${f(Math.cos(a) * 36)} ${f(Math.sin(a) * 36)} L${f(Math.cos(a) * 48)} ${f(Math.sin(a) * 48)}`; }).join(' ')}"/></g>`;
  // chalk doodles: a flower and a heart
  s += `<path ${ch(CRAYONS.pink[0], 6)} d="${scallop(4560, 1250, 22, 18, 6, 9)}"/><circle class="n" fill="${CRAYONS.yellow[0]}" cx="4560" cy="1250" r="8"/>
    <path class="n" fill="none" style="stroke:${CRAYONS.green[0]};stroke-width:6" d="M4560 1270 L4560 1310 M4560 1294 Q4574 1282 4586 1288"/>
    <path ${ch(CRAYONS.blue[0], 6)} d="M3560 1419 C3531 1400 3531 1376 3548 1376 C3555 1376 3560 1383 3560 1388 C3560 1383 3565 1376 3572 1376 C3589 1376 3589 1400 3560 1419Z"/>`;
  return `<g id="hopscotch">${s}</g>`;
}
/** Soft perspective floors: hallway tiles, classroom planks. */
function floors() {
  const hall = `<rect class="n" x="${FAC.x1}" y="${WALL_Y}" width="${ZA[1] - FAC.x1}" height="${Y1 - WALL_Y}" fill="url(#sc-tile)"/>`;
  let lines = '', ticks = '';
  let y = WALL_Y, gap = 26, row = 0;
  while (y < Y1) {
    y += gap; gap *= 1.16; row++;
    lines += `M${ZB[0]} ${f(y)} L${ZB[1]} ${f(y)} `;
    for (let x = ZB[0] + (row % 2) * 110 - 200; x < ZB[1] + 200; x += 420 + row * 30) {
      const yTop = y - gap / 1.16, t = (yTop - 520) / (y - 520), vx = 2380;
      const a = vx + (x - vx) * t;
      if (x > ZB[0] && x < ZB[1] && a > ZB[0] && a < ZB[1]) ticks += `M${f(a)} ${f(yTop)} L${f(x)} ${f(y)} `;
    }
  }
  const cls = `<rect class="n" x="${ZB[0]}" y="${WALL_Y}" width="${ZB[1] - ZB[0]}" height="${Y1 - WALL_Y}" fill="${P.floor}"/><path ${tl(P.floorLine)} d="${lines}"/><path ${tl(P.floorLine)} d="${ticks}"/>`;
  return hall + cls;
}
function walls() {
  const hall = `<rect class="n" x="${FAC.x1}" y="${Y0}" width="${ZA[1] - FAC.x1}" height="${WALL_Y - Y0}" fill="url(#sc-hall)"/>
    ${R(FAC.x1, 770, ZA[1] - FAC.x1, WALL_Y - 770, P.sage)}${[...Array(8)].map((_, i) => `<rect class="thin" fill="none" style="stroke:${P.sageDeep}" x="${FAC.x1 + 20 + i * 92}" y="796" width="70" height="180" rx="6"/>`).join('')}
    ${R(FAC.x1 - 4, 754, ZA[1] - FAC.x1 + 8, 18, P.wood, ' rx="4"')}`;
  const cls = `<rect class="n" x="${ZB[0]}" y="${Y0}" width="${ZB[1] - ZB[0]}" height="${WALL_Y - Y0}" fill="url(#sc-class)"/>
    ${R(ZB[0], 770, ZB[1] - ZB[0], WALL_Y - 770, P.woodLight)}${[...Array(15)].map((_, i) => `<rect class="thin" fill="none" style="stroke:${P.wood}" x="${ZB[0] + 18 + i * 99}" y="796" width="78" height="180" rx="6"/>`).join('')}
    ${R(ZB[0] - 4, 754, ZB[1] - ZB[0] + 8, 18, P.wood, ' rx="4"')}`;
  const base = `${R(FAC.x1, WALL_Y - 26, ZB[1] - FAC.x1, 28, P.cream)}`;
  return hall + cls + base;
}
function pillar(x) {
  return `<g>${R(x - 22, Y0, 44, WALL_Y - Y0 + 4, P.wood)}<path ${tl(P.woodDeep)} d="M${x - 8} ${Y0} L${x - 8} ${WALL_Y - 40} M${x + 8} ${Y0} L${x + 8} ${WALL_Y - 40}"/>
  ${R(x - 30, WALL_Y - 40, 60, 44, P.woodLight, ' rx="4"')}${R(x - 30, -20, 60, 22, P.woodLight, ' rx="4"')}</g>`;
}

// ---- the facade -----------------------------------------------------------
function facade() {
  const { x0, x1, top, door: [d0, d1], doorTop } = FAC, cx = (d0 + d1) / 2;
  const gable = `<path fill="${P.tealDeep}" d="M${x0 - 24} ${top + 10} L${cx} ${top - 150} L${x1 + 24} ${top + 10}Z"/><path fill="${P.cream}" d="M${x0 + 10} ${top + 4} L${cx} ${top - 118} L${x1 - 10} ${top + 4}Z"/>`;
  const tower = `${R(cx - 50, top - 290, 100, 160, P.cream)}<path fill="${P.charDeep}" d="M${cx - 32} ${top - 150} L${cx - 32} ${top - 230} A32 32 0 0 1 ${cx + 32} ${top - 230} L${cx + 32} ${top - 150}Z"/>
    ${R(cx - 60, top - 160, 120, 16, P.oat, ' rx="4"')}<path fill="${P.tealDeep}" d="M${cx - 66} ${top - 284} L${cx} ${top - 380} L${cx + 66} ${top - 284}Z"/><circle fill="${P.mustard}" cx="${cx}" cy="${top - 386}" r="11"/>`;
  const clock = `<circle fill="#fff" cx="${cx}" cy="${top - 40}" r="42"/><circle fill="${P.cream}" class="thin" cx="${cx}" cy="${top - 40}" r="33"/><path class="d" d="M${cx} ${top - 40} L${cx} ${top - 62} M${cx} ${top - 40} L${cx + 16} ${top - 32}"/>
    ${[0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2; return `<circle class="n" fill="${P.ink}" cx="${f(cx + Math.cos(a) * 24)}" cy="${f(top - 40 + Math.sin(a) * 24)}" r="3.5"/>`; }).join('')}`;
  const awning = `${R(d0 - 30, doorTop - 60, d1 - d0 + 60, 26, P.teal, ' rx="6"')}<path fill="${P.teal}" d="M${d0 - 30} ${doorTop - 36} ${[...Array(7)].map((_, i) => { const a = d0 - 30 + i * ((d1 - d0 + 60) / 7), b = a + (d1 - d0 + 60) / 7; return `Q${f((a + b) / 2)} ${doorTop - 6} ${f(b)} ${doorTop - 36}`; }).join(' ')}Z"/>
    <path fill="${P.cream}" class="n" d="${[1, 3, 5].map((i) => { const a = d0 - 30 + i * ((d1 - d0 + 60) / 7); return `M${f(a)} ${doorTop - 58} L${f(a + (d1 - d0 + 60) / 7)} ${doorTop - 58} L${f(a + (d1 - d0 + 60) / 7)} ${doorTop - 36} L${f(a)} ${doorTop - 36}Z`; }).join(' ')}"/>`;
  const frame = `${R(d0 - 20, doorTop - 10, d1 - d0 + 40, WALL_Y - doorTop + 10, P.cream, ' rx="8"')}<rect class="n" fill="#FFF6DA" x="${d0}" y="${doorTop + 6}" width="${d1 - d0}" height="${WALL_Y - doorTop - 6}"/>
    <path ${tl('#F1DFB4')} d="M${d0} ${WALL_Y - 90} L${d1} ${WALL_Y - 90}"/>
    <g opacity=".9">${at(cx - 40, WALL_Y - 90, .5, plantLeafy(P.rose, 1))}${R(cx + 10, WALL_Y - 230, 60, 140, P.rose, ' class="n" rx="6"')}${R(cx + 16, WALL_Y - 222, 48, 40, P.butter, ' class="n" rx="4"')}</g>`;
  const planters = [x0 + 40, x1 - 40].map((x, i) => at(x, WALL_Y, 1, `${R(-34, -40, 68, 40, P.woodDeep, ' rx="5"')}<path fill="${P.leafDeep}" d="${scallop(0, -44, 34, 20, 7, 8, 180, 360, false)}Z"/>${[-18, 0, 18].map((dx, k) => `<circle class="thin" fill="${[P.butter, P.rose, '#fff'][(k + i) % 3]}" cx="${dx}" cy="${-56 - (k % 2) * 8}" r="7"/>`).join('')}`)).join('');
  const steps = `${R(d0 - 40, WALL_Y - 4, d1 - d0 + 80, 20, P.warmGrey, ' rx="4"')}${R(d0 - 60, WALL_Y + 14, d1 - d0 + 120, 22, P.oat, ' rx="4"')}`;
  const cutout = (x, y, c) => `${R(x, y, 60, 84, P.sky, ' rx="6"')}${c}`;
  const edge = `${R(x1 - 20, top + 4, 34, WALL_Y - top - 4, P.terraDeep)}${R(x1 - 26, top - 4, 46, 16, P.cream, ' rx="4"')}`;
  return `<g id="facade">${tower}${brick(x0, top, x1 - x0, WALL_Y - top)}${gable}${clock}${R(x0 - 8, top - 2, x1 - x0 + 16, 16, P.cream, ' rx="4"')}
    ${frame}${awning}${planters}${steps}${edge}</g>`;
}
function busStop() {
  const x = 506, y = 1238;
  return `<g id="bus-stop">${R(x - 6, 780, 12, y - 780, P.steelDeep, ' rx="5"')}<circle fill="${P.teal}" cx="${x}" cy="760" r="40"/><circle fill="${P.cream}" class="thin" cx="${x}" cy="760" r="30"/>
    <g transform="translate(${x} 762) scale(.7)">${schedIcon('arrive', 1)}</g>${R(x - 22, y - 10, 44, 12, P.charHi, ' rx="4"')}</g>`;
}
/** A small flag like the city map's school flag (teal, a butter star). */
function flagPole(x) {
  return `<g>${R(x - 6, 220, 12, WALL_Y - 220 + 10, P.steelDeep, ' rx="5"')}<circle fill="${P.mustard}" cx="${x}" cy="212" r="12"/>
  <path fill="${P.teal}" d="M${x + 6} 236 Q${x + 60} 216 ${x + 116} 240 Q${x + 144} 252 ${x + 170} 242 L${x + 170} 316 Q${x + 142} 326 ${x + 116} 314 Q${x + 60} 290 ${x + 6} 310Z"/>
  <path fill="${P.butter}" class="thin" d="${star(x + 86, 276, 22, 10)}"/>${R(x - 22, WALL_Y - 4, 44, 16, P.charHi, ' rx="5"')}</g>`;
}

// ---- hallway (back wall decor) -------------------------------------------
const CUB = { x0: 930, cols: 6, w: 70, top: 640, label: 700, lunch: 790, main: 960, shoe: 1024 };
CUB.x1 = CUB.x0 + CUB.cols * CUB.w;
const CUB_BACK = [P.blush, P.butter, P.mint, P.sky, P.lav, P.peach];
function hallDecor() {
  // a string of kids' paintings over the cubbies, a clock, hooks for coats
  let art = `<path class="d" d="M${CUB.x0 - 10} 470 Q${(CUB.x0 + CUB.x1) / 2} 510 ${CUB.x1 + 10} 470"/>`;
  const pics = [
    (x, y) => `<circle class="thin" fill="${CRAYONS.yellow[0]}" cx="${x}" cy="${y - 16}" r="12"/><path class="n" fill="${CRAYONS.green[0]}" d="M${x - 30} ${y + 30} Q${x} ${y + 8} ${x + 30} ${y + 30}Z"/>`,
    (x, y) => `<path class="thin" fill="${CRAYONS.red[0]}" d="M${x - 18} ${y + 26} L${x - 18} ${y} L${x} ${y - 18} L${x + 18} ${y} L${x + 18} ${y + 26}Z"/>`,
    (x, y) => `<g transform="translate(${x} ${y + 4})">${animal('cat', .7)}</g>`,
    (x, y) => `<path fill="none" style="stroke:${CRAYONS.blue[0]};stroke-width:6" d="M${x - 24} ${y} Q${x - 12} ${y - 20} ${x} ${y} Q${x + 12} ${y + 20} ${x + 24} ${y}"/><path class="thin" fill="${CRAYONS.pink[0]}" d="${star(x, y - 22, 9, 4)}"/>`,
    (x, y) => heart(x, y + 4, 2.4, CRAYONS.pink[0]),
    (x, y) => `<circle class="thin" fill="${CRAYONS.purple[0]}" cx="${x - 8}" cy="${y}" r="12"/><circle class="thin" fill="${CRAYONS.green[0]}" cx="${x + 12}" cy="${y + 8}" r="9"/>`,
  ];
  for (let i = 0; i < 6; i++) {
    const x = CUB.x0 + 35 + i * CUB.w, y = 490 + Math.sin((i + .5) / 6 * Math.PI) * 20;
    art += `<g transform="rotate(${[-4, 3, -2, 4, -3, 2][i]} ${x} ${y})">${R(x - 30, y, 60, 76, '#fff', ' rx="2"')}${pics[i](x, y + 38)}</g><rect fill="${[P.rose, P.teal, P.mustard][i % 3]}" class="thin" x="${x - 5}" y="${y - 6}" width="10" height="14" rx="2"/>`;
  }
  const clock = `<circle fill="#fff" cx="1415" cy="440" r="36"/><circle fill="${P.cream}" class="thin" cx="1415" cy="440" r="28"/><path class="d" d="M1415 440 L1415 420 M1415 440 L1430 448"/>`;
  // a "welcome" sun with our hands (hand prints around a sun: no words)
  const hands = at(1200, 300, 1, `${WX.sun(1.1)}${[...Array(8)].map((_, i) => { const a = i * Math.PI / 4 + .2; const c = [P.rose, P.teal, P.mustard, P.lav, P.leafLight, P.peach, P.blue, P.berry][i];
    return `<g transform="translate(${f(Math.cos(a) * 110)} ${f(Math.sin(a) * 66)}) rotate(${f(a * 57.3 + 90)})"><ellipse fill="${c}" class="thin" rx="13" ry="15"/>${[-12, -5, 2, 9].map((dx) => `<ellipse fill="${c}" class="thin" cx="${dx}" cy="-18" rx="4" ry="8"/>`).join('')}<ellipse fill="${c}" class="thin" cx="16" cy="-2" rx="4" ry="7" transform="rotate(40 16 -2)"/></g>`; }).join('')}`);
  return art + clock + hands;
}
/** The calm corner: a canopy, a round rug, the feelings chart (5 faces) and a little lamp. */
const CALM = { x0: 1490, x1: 1620 };
function calmCorner() {
  const { x0, x1 } = CALM, cx = (x0 + x1) / 2;
  const canopy = `<circle fill="${P.butter}" cx="${cx}" cy="330" r="16"/><path fill="${P.blush}" d="M${cx - 8} 340 Q${x0 - 20} 560 ${x0 - 40} 1000 ${scallop(x0 - 4, 1000, 36, 10, 3, 5, 180, 0, false).replace(/^M[^Q]*/, '')} Q${x0 + 20} 640 ${cx - 4} 346Z"/><path fill="${P.blush}" d="M${cx + 8} 340 Q${x1 + 50} 560 ${x1 + 70} 1000 L${x1 + 4} 1000 Q${x1 - 10} 640 ${cx + 4} 346Z"/>
    <path ${tl(P.rose)} d="M${x0 - 44} 900 Q${x0 - 30} 700 ${cx - 16} 380 M${x1 + 40} 900 Q${x1 + 24} 700 ${cx + 16} 380"/>`;
  const lights = `<path class="d" d="M${x0 - 20} 440 Q${cx} 480 ${x1 + 20} 440"/>${[0, 1, 2, 3, 4].map((i) => { const x = x0 - 10 + i * 36, y = 452 + Math.sin(i / 4 * Math.PI) * 20; return `<circle class="n" fill="#FFF6D8" opacity=".6" cx="${x}" cy="${y + 8}" r="12"/><circle fill="${[P.butter, P.rose, P.mint, P.lav, P.butter][i]}" class="thin" cx="${x}" cy="${y + 6}" r="6"/>`; }).join('')}`;
  const chart = `${R(x0 - 6, 500, x1 - x0 + 12, 240, P.cream, ' rx="10"')}${R(x0 + 2, 508, x1 - x0 - 4, 224, '#fff', ' rx="8"')}`
    + FEEL.map(([k, x, y]) => `<g transform="translate(${x} ${y})">${feelFace(k, 24)}</g>`).join('');
  const rug = `<ellipse fill="${P.lav}" cx="${cx}" cy="1110" rx="130" ry="40"/><ellipse class="n" fill="none" cx="${cx}" cy="1110" rx="104" ry="28" style="stroke:${P.plum};stroke-width:4;stroke-dasharray:12 10"/>`;
  return `<g id="calm">${rug}${canopy}${lights}${chart}</g>`;
}
const FEEL = [['happy', 1520, 560], ['sad', 1590, 560], ['mad', 1520, 620], ['scared', 1590, 620], ['calm', 1555, 685]];

// ---- classroom (back wall) --------------------------------------------------
const LET = { x0: 1700, pitch: 104, w: 94, h: 84, rows: [14, 108] };
const LCOL = [P.rose, P.butter, P.mint, P.sky, P.lav, P.peach];
const LINK = [P.berry, P.mustardDeep, P.tealDeep, P.blueDeep, P.plum, P.terra];
function letterWall() {
  let s = `${R(LET.x0 - 20, LET.rows[0] - 12, 13 * LET.pitch + 30, LET.rows[1] + LET.h - LET.rows[0] + 24, P.woodLight, ' rx="10"')}`;
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((ch, i) => {
    const col = i % 13, row = Math.floor(i / 13), x = LET.x0 + col * LET.pitch, y = LET.rows[row];
    s += `${R(x, y, LET.w, LET.h, LCOL[i % 6], ' rx="10"')}${glyph(ch, x + LET.w / 2, y + LET.h / 2, .8, LINK[i % 6])}`;
  });
  return `<g id="letters">${s}</g>`;
}
const CAL = { x0: 1690, x1: 1990, y0: 250, y1: 640, today: [1706, 266, 104, 104] };
CAL.dots = [...Array(35)].map((_, n) => [CAL.x0 + 34 + (n % 7) * 38, CAL.y0 + 196 + Math.floor(n / 7) * 34]);
const DOT_COL = [P.berry, HAZ, P.mustard, P.leaf, P.teal, P.blueDeep, P.plum];
function calendarBoard() {
  const { x0, x1, y0, y1 } = CAL, [tx, ty, tw, th] = CAL.today;
  let s = `${R(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20, P.wood, ' rx="10"')}${R(x0, y0, x1 - x0, y1 - y0, P.sage, ' rx="6"')}`;
  s += `${R(tx - 6, ty - 6, tw + 12, th + 12, P.butter, ' rx="10"')}`;           // the "today's weather" slot (piece on top)
  // birthday cake + a sun-and-moon wheel on the right of the slot
  s += at(1900, 350, .8, `<path fill="${P.cream}" d="M-40 0 L-40 -40 L40 -40 L40 0Z"/><path fill="${P.rose}" d="M-40 -40 L40 -40 L40 -26 Q30 -18 20 -26 Q10 -18 0 -26 Q-10 -18 -20 -26 Q-30 -18 -40 -26Z"/>${[-20, 0, 20].map((x) => `${R(x - 3, -62, 6, 22, [P.teal, P.butter, P.lav][(x + 20) / 20])}<path fill="${P.mustard}" class="thin" d="M${x} -74 Q${x + 5} -66 ${x} -62 Q${x - 5} -66 ${x} -74Z"/>`).join('')}<path ${tl(P.oat)} d="M-34 -12 L34 -12"/>`);
  // days of the week: 7 coloured dots; the month: 5 rows of 7
  for (let d = 0; d < 7; d++) s += `<circle fill="${DOT_COL[d]}" cx="${x0 + 34 + d * 38}" cy="${y0 + 150}" r="13"/>`;
  s += `<path ${tl(P.sageDeep)} d="M${x0 + 14} ${y0 + 172} L${x1 - 14} ${y0 + 172}"/>`;
  for (let r = 0; r < 5; r++) for (let d = 0; d < 7; d++) {
    const x = x0 + 34 + d * 38, y = y0 + 196 + r * 34, n = r * 7 + d;
    s += n < 12 ? `<circle fill="#fff" class="thin" cx="${x}" cy="${y}" r="12"/><path class="thin" fill="${DOT_COL[d]}" d="${star(x, y, 8, 3.6)}"/>` : n === 12 ? `<circle fill="#fff" class="thin" cx="${x}" cy="${y}" r="12"/>` : `<circle fill="#fff" class="thin" cx="${x}" cy="${y}" r="12"/>`;
  }
  // the pocket of weather cards (spawner) at the foot of the board
  s += `${[0, 1, 2, 3].map((i) => `<g transform="translate(${x0 + 50 + i * 68} ${y1 + 20}) scale(.62)">${R(-34, -76, 68, 76, '#fff', ' rx="8"')}<g transform="translate(0 -46)">${WX[['sun', 'cloud', 'rain', 'snow'][i]](.66)}</g></g>`).join('')}
    <path fill="${P.teal}" d="M${x0 - 4} ${y1 - 14} L${x1 + 4} ${y1 - 14} L${x1 - 4} ${y1 + 34} L${x0 + 4} ${y1 + 34}Z"/><path ${tl(P.tealDeep, 'stroke-dasharray:10 8')} d="M${x0 + 10} ${y1 - 6} L${x1 - 10} ${y1 - 6}"/>`;
  return `<g id="calendar">${s}</g>`;
}
const WIN = { x0: 2020, x1: 2250, y0: 260, y1: 620 };
function classWindowFrame() {
  const { x0, x1, y0, y1 } = WIN;
  return `<g id="class-window-frame">${R(x0 - 16, y0 - 16, x1 - x0 + 32, y1 - y0 + 32, '#fff', ' rx="10"')}${R(x0, y0, x1 - x0, y1 - y0, P.sky)}</g>`;
}
function classWindowMullions() {
  const { x0, x1, y0, y1 } = WIN, cx = (x0 + x1) / 2;
  return `${R(cx - 6, y0, 12, y1 - y0, '#fff')}${R(x0, (y0 + y1) / 2 - 6, x1 - x0, 12, '#fff')}${R(x0, y0, x1 - x0, y1 - y0, 'none')}
    ${R(x0 - 26, y1 + 12, x1 - x0 + 52, 18, P.wood, ' rx="5"')}
    ${at(x0 + 20, y1 + 12, .5, plantLeafy(P.teal, 1))}${at(x1 - 30, y1 + 12, .7, succulent(P.rose))}
    <path fill="${P.mint}" d="M${x0 - 30} ${y0 - 30} Q${x0 - 10} ${y0 + 80} ${x0 - 34} ${y0 + 200} L${x0 - 60} ${y0 + 200} L${x0 - 60} ${y0 - 30}Z"/><path fill="${P.mint}" d="M${x1 + 26} ${y0 - 30} Q${x1 + 6} ${y0 + 80} ${x1 + 22} ${y0 + 200} L${x1 + 40} ${y0 + 200} L${x1 + 40} ${y0 - 30}Z"/>
    ${R(x0 - 70, y0 - 40, x1 - x0 + 110, 14, P.woodDeep, ' rx="7"')}`;
}
const SCH = { x0: 2300, pitch: 62, w: 56, y: 240, h: 64 };
function scheduleStrip() {
  let s = `${R(SCH.x0 - 14, SCH.y - 10, SCH.pitch * 7 + 22, SCH.h + 20, P.woodLight, ' rx="8"')}`;
  SCHEDULE.forEach((k, i) => {
    const x = SCH.x0 + i * SCH.pitch;
    s += `${R(x, SCH.y, SCH.w, SCH.h, '#fff', ' rx="6"')}<g transform="translate(${x + SCH.w / 2} ${SCH.y + SCH.h / 2 + 2}) scale(.78)">${schedIcon(k)}</g>`;
  });
  return `<g id="schedule">${s}</g>`;
}
const WB = { x0: 2290, x1: 2710, y0: 330, y1: 610 };
function whiteboard() {
  const { x0, x1, y0, y1 } = WB;
  return `<g id="whiteboard">${R(x0 - 12, y0 - 12, x1 - x0 + 24, y1 - y0 + 24, P.steelDeep, ' rx="8"')}${R(x0, y0, x1 - x0, y1 - y0, '#FFFEFA', ' rx="4"')}
    ${glint(`M${x0 + 20} ${y0 + 60} L${x0 + 60} ${y0 + 20} M${x0 + 20} ${y0 + 96} L${x0 + 96} ${y0 + 20}`, 5)}
    ${R(x0 + 40, y1 + 10, x1 - x0 - 80, 16, P.steel, ' rx="5"')}
    <g transform="translate(${x1 - 70} ${y1 + 8}) rotate(-4)">${R(-30, -14, 58, 14, P.woodLight, ' rx="3"')}${R(-30, -26, 58, 14, P.cream, ' rx="4"')}</g></g>`;
}
const WW = { x0: 2750, x1: 3080, y0: 250, y1: 620 };
WW.cards = [...Array(8)].map((_, i) => [WW.x0 + 16 + (i % 2) * 158 + 16, WW.y0 + 20 + Math.floor(i / 2) * 88 + 6, 120, 58]);
function wordWall() {
  const { x0, x1, y0, y1 } = WW;
  let s = `${R(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20, P.wood, ' rx="10"')}${R(x0, y0, x1 - x0, y1 - y0, P.butter, ' rx="6"')}`;
  for (let i = 0; i < 8; i++) {
    const c = i % 2, r = Math.floor(i / 2), x = x0 + 16 + c * 158, y = y0 + 20 + r * 88, w = 142, h = 70;
    s += `${R(x, y, w, h, '#fff', ' rx="8"')}<rect class="n" fill="${LCOL[i % 6]}" x="${x + 3}" y="${y + 3}" width="10" height="${h - 6}" rx="4"/><path class="thin" fill="${[P.mustard, P.teal, P.rose, P.lav][i % 4]}" d="${star(x + w - 12, y + 12, 8, 3.6)}"/>`;
  }
  return `<g id="word-wall">${s}</g>`;
}
function classDecor() {
  // hanging paper lanterns, a star garland and an "all about me" bunting
  let s = '';
  return s;
}

// ---------------------------------------------------------------------------
// COUNTER layer (against the wall)
// ---------------------------------------------------------------------------
function cubbies() {
  const { x0, x1, cols, w, top, label, lunch, main, shoe } = CUB;
  let s = shadow((x0 + x1) / 2, BB + 2, (x1 - x0) / 2 + 12);
  s += R(x0 - 8, top, x1 - x0 + 16, BB - top, P.wood, ' rx="6"');
  for (let i = 0; i < cols; i++) {
    const a = x0 + i * w;
    s += R(a + 6, label + 12, w - 12, lunch - label - 16, CUB_BACK[i], ' rx="4"');        // lunch shelf
    s += R(a + 6, lunch + 12, w - 12, main - lunch - 16, CUB_BACK[i], ' rx="4"');         // backpack
    s += `<path class="n" fill="${P.ink}" opacity=".07" d="M${a + 6} ${lunch + 12} L${a + w - 6} ${lunch + 12} L${a + w - 6} ${lunch + 30} L${a + 6} ${lunch + 30}Z"/>`;
    s += R(a + 6, main + 12, w - 12, shoe - main - 14, P.woodDeep, ' rx="4"');           // shoe cubby
    s += `<path fill="${P.steelDeep}" d="M${a + w / 2 - 4} ${lunch + 18} L${a + w / 2 + 4} ${lunch + 18} L${a + w / 2 + 4} ${lunch + 40} Q${a + w / 2 + 4} ${lunch + 50} ${a + w / 2 + 14} ${lunch + 46} L${a + w / 2 + 14} ${lunch + 38}"/>`;
    s += `<circle fill="#fff" cx="${a + w / 2}" cy="${top + 32}" r="26"/><g transform="translate(${a + w / 2} ${top + 34})">${animal(CUBBY_ANIMALS[i], .8)}</g>`;
  }
  s += R(x0 - 12, top - 14, x1 - x0 + 24, 18, P.woodLight, ' rx="6"');
  s += R(x0 - 8, label - 2, x1 - x0 + 16, 12, P.woodLight, ' rx="3"') + R(x0 - 8, lunch, x1 - x0 + 16, 12, P.woodLight, ' rx="3"') + R(x0 - 8, main, x1 - x0 + 16, 12, P.woodLight, ' rx="3"');
  s += R(x0 - 8, shoe, x1 - x0 + 16, BB - shoe, P.woodDeep, ' rx="3"');
  // things on top: a basket of hats and a plant
  s += at(x0 + 60, top - 14, .5, plantLeafy(P.teal, 1)) + at(x1 - 80, top - 14, 1, `<path fill="${P.woodLight}" d="M-50 0 L-54 -40 L54 -40 L50 0Z"/><path ${tl(P.wood)} d="M-50 -14 L50 -14 M-52 -28 L52 -28"/><path fill="${P.butter}" d="M-30 -40 Q-30 -64 0 -64 Q30 -64 30 -40Z"/><path fill="${P.mint}" d="M8 -40 Q8 -56 28 -56 Q48 -56 48 -40Z"/>`);
  return `<g id="cubbies">${s}</g>`;
}
const SINK = { x0: 1360, x1: 1470, top: 880 };
function sink() {
  const { x0, x1, top } = SINK, cx = (x0 + x1) / 2;
  return `<g id="sink">${shadow(cx, BB + 2, 70)}
    <ellipse fill="#fff" cx="${cx}" cy="650" rx="52" ry="62"/><ellipse fill="${P.sky}" class="thin" cx="${cx}" cy="650" rx="42" ry="52"/>${glint(`M${cx - 24} 630 Q${cx - 20} 610 ${cx - 6} 604`)}
    ${R(x1 - 6, 740, 44, 56, '#fff', ' rx="6"')}<path fill="${P.oat}" d="M${x1 + 2} 796 L${x1 + 30} 796 L${x1 + 28} 830 L${x1 + 4} 830Z"/>
    ${R(x0 - 4, top, x1 - x0 + 8, BB - top, P.mint, ' rx="6"')}${R(x0 + 10, top + 30, x1 - x0 - 20, BB - top - 50, P.mint, ' class="thin" rx="5"')}<circle fill="${P.woodLight}" cx="${cx}" cy="${top + 70}" r="7"/>
    ${R(x0 - 12, top - 14, x1 - x0 + 24, 20, '#fff', ' rx="6"')}<path fill="${P.steel}" d="M${x0 + 12} ${top - 12} L${x1 - 12} ${top - 12} Q${x1 - 16} ${top + 6} ${cx} ${top + 8} Q${x0 + 16} ${top + 6} ${x0 + 12} ${top - 12}Z"/>
    <g transform="translate(${x0 + 6} ${top - 14})"><path fill="${P.rose}" d="M-10 0 L-10 -30 L10 -30 L10 0Z"/><rect fill="#fff" x="-4" y="-44" width="8" height="14"/><path fill="#fff" d="M-4 -44 L14 -44 L14 -38 L4 -38Z"/>${[[-2, -60], [8, -70], [-10, -74]].map(([x, y]) => `<circle class="thin" fill="${P.sky}" cx="${x}" cy="${y}" r="5"/>`).join('')}</g>
    ${R(x1 - 30, BB - 30, 60, 30, P.leafLight, ' rx="6"')}${R(x1 - 26, BB - 44, 52, 16, P.leafLight, ' rx="5"')}</g>`;
}
function sinkTap(on) {
  const { x0, x1, top } = SINK, cx = (x0 + x1) / 2;
  const water = on ? `<path fill="${P.sky}" d="M${cx + 6} ${top - 44} L${cx + 16} ${top - 44} L${cx + 18} ${top - 2} L${cx + 4} ${top - 2}Z"/><path ${tl('#fff', 'stroke:#fff;stroke-width:3')} d="M${cx + 10} ${top - 36} L${cx + 11} ${top - 10}"/>
    ${[[-6, -8], [26, -12], [12, -20]].map(([dx, dy]) => `<circle class="thin" fill="#fff" cx="${cx + dx}" cy="${top + dy}" r="5"/>`).join('')}` : '';
  return `<g>${water}<path fill="${P.steelDeep}" d="M${cx - 8} ${top - 14} L${cx - 8} ${top - 64} Q${cx - 8} ${top - 76} ${cx + 4} ${top - 76} L${cx + 14} ${top - 76} Q${cx + 20} ${top - 76} ${cx + 20} ${top - 68} L${cx + 20} ${top - 50} L${cx + 4} ${top - 50} L${cx + 4} ${top - 14}Z"/>
    <g transform="rotate(${on ? -30 : 0} ${cx - 20} ${top - 46})"><rect fill="${on ? P.leafLight : P.berry}" x="${cx - 40}" y="${top - 52}" width="28" height="12" rx="6"/></g></g>`;
}
function beanbag() {
  const cx = 1555, y = 1150;
  return `<g id="beanbag">${shadow(cx, y + 4, 90, 12)}<path fill="${P.teal}" d="M${cx - 86} ${y} Q${cx - 100} ${y - 80} ${cx - 40} ${y - 110} Q${cx + 10} ${y - 130} ${cx + 60} ${y - 100} Q${cx + 104} ${y - 70} ${cx + 88} ${y} Q${cx} ${y + 14} ${cx - 86} ${y}Z"/>
    <path class="n" fill="${P.tealDeep}" d="M${cx - 60} ${y - 40} Q${cx} ${y - 70} ${cx + 60} ${y - 40} Q${cx} ${y - 20} ${cx - 60} ${y - 40}Z"/>
    <path ${tl(P.tealDeep)} d="M${cx - 50} ${y - 96} Q${cx - 30} ${y - 60} ${cx - 50} ${y - 20} M${cx + 40} ${y - 104} Q${cx + 60} ${y - 70} ${cx + 50} ${y - 30}"/>
    ${at(cx + 70, y - 60, .45, `<circle fill="${P.butter}" cx="0" cy="-60" r="40"/><circle class="ink" cx="-12" cy="-64" r="4"/><circle class="ink" cx="12" cy="-64" r="4"/><path class="d" d="M-8 -48 Q0 -42 8 -48"/>`)}</g>`;
}
const BLK = { x0: 1880, x1: 2160, top: 860 };
function blockShelf() {
  const { x0, x1, top } = BLK, mid = 950;
  const bin = (x, y, c, pic) => `${R(x - 56, y - 64, 112, 64, c, ' rx="8"')}${R(x - 22, y - 50, 44, 34, '#fff', ' rx="5"')}<g transform="translate(${x} ${y - 33}) scale(.5)">${pic}</g>`;
  const blockPic = `${R(-26, -4, 24, 20, P.rose, ' rx="3"')}${R(2, -4, 24, 20, P.teal, ' rx="3"')}${R(-12, -26, 24, 22, P.butter, ' rx="3"')}`;
  const carPic = `<path fill="${P.berry}" d="M-30 6 L-30 -4 L-18 -4 L-10 -18 L14 -18 L22 -4 L30 -4 L30 6Z"/><circle fill="${P.charDeep}" cx="-16" cy="8" r="7"/><circle fill="${P.charDeep}" cx="16" cy="8" r="7"/>`;
  const crayonPic = `<g transform="scale(.8)">${[CRAYONS.red, CRAYONS.blue, CRAYONS.yellow].map(([c], i) => `<path fill="${c}" d="M${-20 + i * 16} 20 L${-20 + i * 16} -14 L${-14 + i * 16} -26 L${-8 + i * 16} -14 L${-8 + i * 16} 20Z"/>`).join('')}</g>`;
  const bearPic = animal('bear', 1);
  let s = `${shadow((x0 + x1) / 2, BB + 2, (x1 - x0) / 2 + 10)}${R(x0, top, x1 - x0, BB - top, P.woodLight, ' rx="6"')}${R(x0 + 10, top + 12, x1 - x0 - 20, BB - top - 30, P.wood, ' rx="4"')}`;
  s += bin(x0 + 72, mid, P.rose, blockPic) + bin(x1 - 72, mid, P.teal, carPic) + bin(x0 + 72, BB - 18, P.butter, crayonPic) + bin(x1 - 72, BB - 18, P.lav, bearPic);
  s += R(x0 + 10, mid, x1 - x0 - 20, 12, P.woodLight);
  // peeking stock: blocks in the rose bin, cars in the teal one
  s += `${R(x0 + 30, mid - 80, 30, 24, P.woodLight, ' rx="3"')}${R(x0 + 66, mid - 86, 40, 30, P.woodLight, ' rx="3"')}<path fill="${P.berry}" d="M${x1 - 110} ${mid - 64} L${x1 - 104} ${mid - 80} L${x1 - 74} ${mid - 80} L${x1 - 66} ${mid - 64}Z"/>`;
  s += `${R(x0 - 8, top - 14, x1 - x0 + 16, 20, P.wood, ' rx="6"')}`;
  // on top: a little block tower and the art caddy (spawner), a plant
  s += at(x0 + 40, top - 14, 1, `${R(-20, -32, 40, 32, P.woodLight, ' rx="3"')}${R(-28, -48, 56, 16, P.woodLight, ' rx="3"')}<path fill="${P.woodLight}" d="M-14 -48 L0 -70 L14 -48Z"/>`);
  s += at(x0 + 150, top - 14, 1, `${[CRAYONS.red, CRAYONS.green, CRAYONS.blue, CRAYONS.purple, CRAYONS.yellow].map(([c], i) => `<path fill="${c}" d="M${-34 + i * 14} -40 L${-34 + i * 14} -66 L${-30 + i * 14} -74 L${-26 + i * 14} -66 L${-26 + i * 14} -40Z"/>`).join('')}
    <path fill="${P.teal}" d="M-44 0 L-46 -46 L46 -46 L44 0Z"/><path fill="#fff" d="M18 -46 L22 -86 L48 -84 L44 -46Z"/><path ${tl(P.tealDeep)} d="M-40 -14 L40 -14"/><g transform="translate(0 -26) scale(.5)">${heart(0, 0, 2, '#fff')}</g>`);
  s += at(x1 - 40, top - 14, .5, plantLeafy(P.terra, 1));
  return `<g id="block-shelf">${s}</g>`;
}
const BOOK = { x0: 2760, x1: 2970, top: 860 };
function bookCorner() {
  const { x0, x1, top } = BOOK;
  let s = `${shadow((x0 + x1) / 2, BB + 2, (x1 - x0) / 2 + 10)}${R(x0, top, x1 - x0, BB - top, P.wood, ' rx="6"')}`;
  // two slanted rails of face-out books
  const covers = [P.berry, P.blueDeep, P.mustard, P.leaf, P.plum, P.teal];
  for (let r = 0; r < 2; r++) {
    const y = top + 70 + r * 90;
    for (let i = 0; i < 3; i++) {
      const x = x0 + 18 + i * 64, c = covers[r * 3 + i];
      s += `<g transform="rotate(${-4 + i * 3} ${x + 28} ${y})">${R(x, y - 64, 56, 64, c, ' rx="4"')}${R(x + 7, y - 56, 42, 34, P.cream, ' class="n" rx="3"')}<g transform="translate(${x + 28} ${y - 38})">${[animal(['bear', 'bird', 'fish', 'dog', 'bunny', 'cat'][r * 3 + i], .42), WX.sun(.36)][i % 2]}</g></g>`;
    }
    s += R(x0 + 6, y - 6, x1 - x0 - 12, 14, P.woodLight, ' rx="3"');
  }
  s += R(x0 - 8, top - 14, x1 - x0 + 16, 20, P.woodLight, ' rx="6"');
  // cushions on the floor
  s += `<path fill="${P.rose}" d="M${x0 - 30} 1100 Q${x0 - 40} 1050 ${x0} 1046 L${x0 + 90} 1046 Q${x0 + 120} 1050 ${x0 + 110} 1100 Q${x0 + 40} 1112 ${x0 - 30} 1100Z"/><path class="d" d="M${x0 + 10} 1060 Q${x0 + 40} 1080 ${x0 + 70} 1060"/>`;
  return `<g id="book-corner">${s}</g>`;
}
function fishBowlStand() { return ''; }
/** The goldfish bowl (a piece): swim-a / swim-b (the fish on the other side) / fed (flakes on the water). */
const BOWL = [2830, BOOK.top - 14];
function fishBowl(state) {
  const [x, y] = BOWL, flip = state === 'swim-b' ? -1 : 1;
  const flakes = state === 'fed' ? [[-18, -76], [0, -78], [14, -75], [-8, -72]].map(([dx, dy]) => `<rect class="n" fill="${HAZ}" x="${x + dx}" y="${y + dy}" width="5" height="3"/>`).join('') : '';
  const fish = `<g transform="translate(${x + 8 * flip} ${y - 42}) scale(${.62 * flip} .62)"><path fill="${HAZ}" d="M14 0 L32 -14 L30 14Z"/><ellipse fill="${HAZ}" cx="-4" cy="0" rx="22" ry="15"/><circle class="ink" cx="-14" cy="-3" r="3"/><path class="d" d="M6 -11 Q11 0 6 11"/></g>`;
  const bubbles = `<circle class="thin" fill="#fff" cx="${x - 16 * flip}" cy="${y - 62}" r="4"/><circle class="thin" fill="#fff" cx="${x - 22 * flip}" cy="${y - 74}" r="3"/>`;
  return `<g><path fill="${P.glass}" d="M${x - 24} ${y - 88} L${x + 24} ${y - 88} Q${x + 56} ${y - 70} ${x + 52} ${y - 34} Q${x + 46} ${y} ${x} ${y} Q${x - 46} ${y} ${x - 52} ${y - 34} Q${x - 56} ${y - 70} ${x - 24} ${y - 88}Z"/>
    <path class="n" fill="${P.sky}" d="M${x - 50} ${y - 66} Q${x} ${y - 72} ${x + 50} ${y - 66} Q${x + 54} ${y - 40} ${x + 46} ${y - 18} Q${x + 30} ${y - 4} ${x} ${y - 4} Q${x - 30} ${y - 4} ${x - 46} ${y - 18} Q${x - 54} ${y - 40} ${x - 50} ${y - 66}Z"/>
    <path class="n" fill="${SAND}" d="M${x - 40} ${y - 10} Q${x} ${y - 24} ${x + 40} ${y - 10} Q${x + 20} ${y - 3} ${x} ${y - 3} Q${x - 20} ${y - 3} ${x - 40} ${y - 10}Z"/>
    ${leaf(34, 7, -10, P.leaf, x - 26, y - 10)}${leaf(26, 6, 14, P.leafDeep, x - 18, y - 10)}${fish}${bubbles}${flakes}
    <path fill="none" d="M${x - 24} ${y - 88} L${x + 24} ${y - 88} Q${x + 56} ${y - 70} ${x + 52} ${y - 34} Q${x + 46} ${y} ${x} ${y} Q${x - 46} ${y} ${x - 52} ${y - 34} Q${x - 56} ${y - 70} ${x - 24} ${y - 88}Z"/>
    ${glint(`M${x - 34} ${y - 58} Q${x - 38} ${y - 40} ${x - 30} ${y - 26}`)}<ellipse fill="${P.glass}" cx="${x}" cy="${y - 88}" rx="26" ry="5"/></g>`;
}
const COTS = { x0: 2990, x1: 3100 };
function cotStack() {
  const { x0, x1 } = COTS, cx = (x0 + x1) / 2;
  let s = shadow(cx, BB + 2, 60);
  for (let i = 0; i < 4; i++) {
    const y = BB - 6 - i * 26;
    s += `${R(x0, y - 20, x1 - x0, 20, [P.blue, P.sage, P.blue, P.sage][i], ' rx="6"')}${R(x0 + 6, y, 8, 6, P.blueDeep)}${R(x1 - 14, y, 8, 6, P.blueDeep)}`;
  }
  s += `${[0, 1, 2].map((i) => `<path fill="${[P.lav, P.butter, P.blush][i]}" d="M${x0 + 8} ${BB - 110 - i * 16} L${x1 - 8} ${BB - 110 - i * 16} Q${x1} ${BB - 118 - i * 16} ${x1 - 8} ${BB - 126 - i * 16} L${x0 + 8} ${BB - 126 - i * 16} Q${x0} ${BB - 118 - i * 16} ${x0 + 8} ${BB - 110 - i * 16}Z"/>`).join('')}`;
  s += at(cx + 10, BB - 158, .5, `<circle fill="${P.terra}" cx="-20" cy="-70" r="12"/><circle fill="${P.terra}" cx="20" cy="-70" r="12"/><ellipse fill="${P.terra}" cx="0" cy="-30" rx="30" ry="30"/><ellipse fill="${P.terra}" cx="0" cy="-60" rx="28" ry="24"/><circle class="ink" cx="-9" cy="-64" r="3.5"/><circle class="ink" cx="9" cy="-64" r="3.5"/><ellipse fill="${P.peach}" class="thin" cx="0" cy="-54" rx="9" ry="7"/>`);
  return `<g id="cots">${s}</g>`;
}
// ---- outside (counter): the patio wall, hatch, tower, bars, swings -------
const PATIO = { x0: 3120, x1: 3540, top: 300 };
const HATCH = { x0: 3190, x1: 3440, y0: 560, y1: 800 };
function patioWall() {
  const { x0, x1, top } = PATIO, { x0: hx0, x1: hx1, y0: hy0, y1: hy1 } = HATCH;
  const awning = `${R(hx0 - 40, hy0 - 70, hx1 - hx0 + 80, 30, P.teal, ' rx="6"')}<path fill="${P.teal}" d="M${hx0 - 40} ${hy0 - 42} ${[...Array(8)].map((_, i) => { const a = hx0 - 40 + i * ((hx1 - hx0 + 80) / 8), b = a + (hx1 - hx0 + 80) / 8; return `Q${f((a + b) / 2)} ${hy0 - 8} ${f(b)} ${hy0 - 42}`; }).join(' ')}Z"/>
    <path fill="${P.cream}" class="n" d="${[1, 3, 5, 7].map((i) => { const a = hx0 - 40 + i * ((hx1 - hx0 + 80) / 8); return `M${f(a)} ${hy0 - 68} L${f(a + (hx1 - hx0 + 80) / 8)} ${hy0 - 68} L${f(a + (hx1 - hx0 + 80) / 8)} ${hy0 - 42} L${f(a)} ${hy0 - 42}Z`; }).join(' ')}"/>`;
  const inside = `${R(hx0, hy0, hx1 - hx0, hy1 - hy0, '#F3E3C4')}${shelfBoard(hx0 + 10, hx1 - 10, hy0 + 90)}
    ${[0, 1, 2, 3, 4].map((i) => `<path fill="${P.sky}" d="M${hx0 + 20} ${hy0 + 84 - i * 9} L${hx0 + 120} ${hy0 + 84 - i * 9} L${hx0 + 116} ${hy0 + 78 - i * 9} L${hx0 + 24} ${hy0 + 78 - i * 9}Z"/>`).join('')}
    ${at(hx1 - 70, hy0 + 80, .7, `${R(-50, -40, 100, 40, P.blue, ' rx="4"')}${[-30, -10, 10, 30].map((x) => `${R(x - 8, -62, 16, 24, '#fff')}<path fill="#fff" d="M${x - 8} -62 L${x - 4} -70 L${x + 4} -70 L${x + 8} -62Z"/>`).join('')}`)}
    ${at(hx0 + 60, hy1 - 12, .8, `<path fill="${HAZ}" d="M-24 0 Q-30 -24 -14 -34 Q0 -40 14 -34 Q30 -24 24 0Z"/><circle fill="${P.berry}" cx="36" cy="-12" r="12"/><circle fill="${P.leafLight}" cx="-40" cy="-12" r="12"/>`)}
    ${at(hx1 - 60, hy1 - 12, .8, `<path fill="${P.butter}" d="M-30 0 L-26 -30 L26 -30 L30 0Z"/><circle class="n" fill="${P.crust}" cx="-10" cy="-38" r="9"/><circle class="n" fill="${P.crust}" cx="8" cy="-40" r="9"/>`)}`;
  return `<g id="patio-wall">${brick(x0, top, x1 - x0, WALL_Y - top)}${R(x0 - 10, top - 20, x1 - x0 + 30, 26, P.tealDeep, ' rx="6"')}
    ${R(hx0 - 16, hy0 - 16, hx1 - hx0 + 32, hy1 - hy0 + 32, P.cream, ' rx="8"')}${inside}${R(hx0 - 26, hy1, hx1 - hx0 + 52, 22, P.woodLight, ' rx="6"')}${awning}
    ${R(x0 + 30, 400, 110, 110, P.cream, ' rx="8"')}${R(x0 + 42, 412, 86, 86, P.sky, ' rx="4"')}${glint(`M${x0 + 56} 450 L${x0 + 76} 428`)}
    <g transform="translate(${x0 + 360} 430)">${R(-60, -60, 120, 120, P.cream, ' rx="10"')}<g transform="translate(0 -8)">${schedIcon('snack', 1.4)}</g></g></g>`;
}
function fence() {
  let s = '';
  for (let x = 3560; x < X1; x += 44) s += `<path fill="#fff" d="M${x} ${WALL_Y} L${x} 850 L${x + 15} 832 L${x + 30} 850 L${x + 30} ${WALL_Y}Z"/>`;
  return `<g id="fence">${R(3550, 880, X1 - 3550, 14, '#fff')}${R(3550, 960, X1 - 3550, 14, '#fff')}${s}</g>`;
}
const BARS = { x0: 3590, x1: 3800, y: 620 };
const TOWER = { x0: 3810, x1: 3990, deck: 790, roof: 560 };
const SLIDE = { top: [3990, 796], bot: [4250, 1030] };
function playStructure() {
  const { x0: bx0, x1: bx1, y } = BARS, { x0: tx0, x1: tx1, deck, roof } = TOWER, foot = 1062;
  const post = (x, top, c = P.teal) => `${R(x - 12, top, 24, foot - top, c, ' rx="8"')}${R(x - 18, foot - 10, 36, 12, P.tealDeep, ' rx="4"')}`;
  let s = shadow((bx0 + SLIDE.bot[0]) / 2, foot + 4, 380, 14, .08);
  // monkey bars: ladder post on the left, the bar rail to the tower
  s += post(bx0, y - 20) + `<path class="d" style="stroke-width:6" d="${[0, 1, 2, 3, 4].map((i) => `M${bx0 - 12} ${y + 90 + i * 72} L${bx0 + 12} ${y + 90 + i * 72}`).join(' ')}"/>`;
  s += post(bx0 + 70, y - 20);
  s += `<path class="d" style="stroke-width:5" d="${[0, 1, 2, 3, 4].map((i) => `M${bx0 + 58} ${y + 90 + i * 72} L${bx0 + 82} ${y + 90 + i * 72}`).join(' ')}"/>`;
  for (let x = bx0 + 20; x < tx0; x += 34) s += `<path fill="${P.mustard}" d="M${x - 5} ${y - 12} L${x + 5} ${y - 12} L${x + 5} ${y + 12} L${x - 5} ${y + 12}Z"/>`;
  s += R(bx0 - 14, y - 22, tx0 - bx0 + 20, 14, P.mustard, ' rx="6"') + R(bx0 - 14, y + 8, tx0 - bx0 + 20, 14, P.mustard, ' rx="6"');
  // the tower: four posts, a deck, a railing with a steering wheel, a peaked roof and a flag
  s += post(tx0, roof + 30) + post(tx1, roof + 30);
  s += R(tx0 - 20, deck - 10, tx1 - tx0 + 40, 26, P.woodLight, ' rx="6"') + `<path ${tl(P.wood)} d="M${tx0 + 20} ${deck + 4} L${tx1 - 20} ${deck + 4}"/>`;
  s += R(tx0 + 12, deck - 120, tx1 - tx0 - 24, 16, P.teal, ' rx="6"') + `<path class="d" style="stroke-width:5" d="${[1, 2, 3, 4, 5].map((i) => `M${tx0 + 12 + i * 26} ${deck - 104} L${tx0 + 12 + i * 26} ${deck - 10}`).join(' ')}"/>`;
  s += `<g transform="translate(${(tx0 + tx1) / 2} ${deck - 150})"><circle fill="none" style="stroke:${P.berry};stroke-width:10" r="26"/><circle fill="none" r="31" class="thin"/><circle fill="none" r="21" class="thin"/><circle fill="${P.berry}" r="8"/>${[0, 60, 120].map((a) => `<rect fill="${P.berry}" x="-3" y="-24" width="6" height="48" transform="rotate(${a})"/>`).join('')}</g>`;
  s += `<path fill="${P.berry}" d="M${tx0 - 40} ${roof + 40} L${(tx0 + tx1) / 2} ${roof - 70} L${tx1 + 40} ${roof + 40}Z"/><path fill="#fff" class="n" d="M${tx0 - 6} ${roof + 30} L${(tx0 + tx1) / 2 - 30} ${roof - 30} L${(tx0 + tx1) / 2 - 12} ${roof - 30} L${tx0 + 18} ${roof + 30}Z M${tx1 + 6} ${roof + 30} L${(tx0 + tx1) / 2 + 30} ${roof - 30} L${(tx0 + tx1) / 2 + 12} ${roof - 30} L${tx1 - 18} ${roof + 30}Z"/>
    <path fill="none" d="M${tx0 - 40} ${roof + 40} L${(tx0 + tx1) / 2} ${roof - 70} L${tx1 + 40} ${roof + 40}Z"/><path class="d" d="M${(tx0 + tx1) / 2} ${roof - 70} L${(tx0 + tx1) / 2} ${roof - 130}"/><path fill="${P.butter}" class="thin" d="M${(tx0 + tx1) / 2} ${roof - 130} L${(tx0 + tx1) / 2 + 40} ${roof - 118} L${(tx0 + tx1) / 2} ${roof - 104}Z"/>`;
  // a climbing wall on the tower front (below the deck)
  s += R(tx0 + 14, deck + 16, tx1 - tx0 - 28, foot - deck - 30, P.butter, ' rx="6"') + [[20, 50], [70, 90], [120, 40], [40, 150], [110, 170], [80, 230]].map(([dx, dy], i) => `<ellipse fill="${[P.berry, P.teal, P.lav, HAZ, P.leaf, P.blue][i]}" class="thin" cx="${tx0 + 14 + dx}" cy="${deck + 16 + dy}" rx="11" ry="8"/>`).join('');
  // the slide: a wavy chute from the deck to the chips
  const [sx0, sy0] = SLIDE.top, [sx1, sy1] = SLIDE.bot;
  const chute = `M${sx0 - 6} ${sy0 - 30} Q${sx0 + 80} ${sy0 - 26} ${sx0 + 130} ${sy0 + 70} Q${sx0 + 180} ${sy1 - 40} ${sx1} ${sy1 - 46} L${sx1 + 50} ${sy1 - 44} L${sx1 + 50} ${sy1 - 8} L${sx1} ${sy1 - 10} Q${sx0 + 150} ${sy1 - 4} ${sx0 + 100} ${sy0 + 100} Q${sx0 + 60} ${sy0 + 10} ${sx0 - 6} ${sy0 + 6}Z`;
  s += `${R(sx1 + 30, sy1 - 10, 14, foot - sy1 + 10, P.tealDeep, ' rx="5"')}<path fill="${P.mustard}" d="${chute}"/><path ${tl(P.butter, 'stroke-width:8')} d="M${sx0 + 10} ${sy0 - 14} Q${sx0 + 80} ${sy0 - 6} ${sx0 + 118} ${sy0 + 80} Q${sx0 + 164} ${sy1 - 30} ${sx1 + 40} ${sy1 - 28}"/><path ${tl(P.mustardDeep, 'stroke-width:4')} d="M${sx0 - 4} ${sy0 - 4} Q${sx0 + 60} ${sy0 + 10} ${sx0 + 100} ${sy0 + 96}"/>`;
  return `<g id="play-structure">${s}</g>`;
}
const SWING = { x0: 4300, x1: 4540, bar: 580, seatY: 980, seats: [4375, 4490] };
function swingFrame() {
  const { x0, x1, bar } = SWING, foot = 1062;
  const aframe = (x) => `<path fill="${P.blueDeep}" d="M${x - 50} ${foot} L${x - 6} ${bar} L${x + 6} ${bar} L${x + 50} ${foot} L${x + 36} ${foot} L${x} ${bar + 30} L${x - 36} ${foot}Z"/>${R(x - 60, foot - 8, 36, 12, P.charHi, ' rx="4"')}${R(x + 24, foot - 8, 36, 12, P.charHi, ' rx="4"')}`;
  return `<g id="swing-frame">${shadow((x0 + x1) / 2, foot + 4, 170, 12, .08)}${aframe(x0)}${aframe(x1)}${R(x0 - 20, bar - 16, x1 - x0 + 40, 24, P.blue, ' rx="10"')}${[x0, x1].map((x) => `<circle fill="${P.mustard}" cx="${x}" cy="${bar - 4}" r="10"/>`).join('')}</g>`;
}
function swingChains(x) {
  const { bar, seatY } = SWING;
  const chain = (cx) => { let s = ''; for (let y = bar + 8; y < seatY - 10; y += 22) s += `<ellipse fill="none" style="stroke-width:3" cx="${cx}" cy="${y + 10}" rx="5" ry="10"/>`; return s; };
  return `<g>${chain(x - 38)}${chain(x + 38)}${[x - 38, x + 38].map((cx) => `<circle fill="${P.steelDeep}" cx="${cx}" cy="${bar + 4}" r="6"/>`).join('')}</g>`;
}
function swingSeat(x, c) {
  const y = SWING.seatY;
  return `<g><path fill="${c}" d="M${x - 50} ${y - 12} Q${x} ${y + 10} ${x + 50} ${y - 12} L${x + 50} ${y} Q${x} ${y + 24} ${x - 50} ${y}Z"/><circle fill="${P.steelDeep}" class="thin" cx="${x - 40}" cy="${y - 10}" r="5"/><circle fill="${P.steelDeep}" class="thin" cx="${x + 40}" cy="${y - 10}" r="5"/></g>`;
}
function recessBin() {
  const x = 3505;
  return `<g id="recess-bin">${shadow(x, BB + 2, 56)}<circle fill="${P.berry}" cx="${x - 22}" cy="${BB - 78}" r="26"/><circle fill="${P.blue}" cx="${x + 20}" cy="${BB - 84}" r="22"/>
    <path fill="none" style="stroke:${P.ink};stroke-width:8" d="M${x + 10} ${BB - 60} Q${x + 30} ${BB - 120} ${x + 44} ${BB - 70}"/><path fill="none" style="stroke:${P.rose};stroke-width:4" d="M${x + 10} ${BB - 60} Q${x + 30} ${BB - 120} ${x + 44} ${BB - 70}"/>
    <path fill="${P.mint}" d="M${x - 54} ${BB - 66} L${x + 54} ${BB - 66} L${x + 46} ${BB} L${x - 46} ${BB}Z"/><path ${tl(P.teal)} d="M${x - 44} ${BB - 44} L${x + 44} ${BB - 44} M${x - 42} ${BB - 22} L${x + 42} ${BB - 22}"/>
    <g transform="translate(${x} ${BB - 34}) scale(.6)">${`<circle fill="#fff" r="22"/>`}${schedIcon('recess', .7)}</g></g>`;
}
// ---- the bus (pieces) -------------------------------------------------------
const BUS = { x0: -150, x1: 470, top: 790, floor: 1150, wheelY: 1262, windows: [-130, -24, 82, 188], ww: 92, door: [296, 372] };
function busInside() {
  const { x0, windows, ww, top } = BUS;
  let s = R(x0, top + 30, windows[3] + ww - x0 + 10, 330, '#F4E4C6');
  for (const wx of windows) s += `${R(wx + 10, top + 128, ww - 20, 120, P.tealDeep, ' rx="14"')}${R(wx + 18, top + 136, ww - 36, 10, P.teal, ' class="n" rx="5"')}`;
  s += R(BUS.door[0], top + 30, BUS.door[1] - BUS.door[0], 360, '#F4E4C6');
  return `<g>${s}</g>`;
}
function busBody() {
  const { x0, x1, top, wheelY, windows, ww, door: [d0, d1] } = BUS;
  const wy0 = top + 50, wy1 = top + 170;
  const holes = windows.map((x) => rrect(x, wy0, ww, wy1 - wy0, 10)).join(' ') + ' ' + rrect(d0 + 8, top + 40, d1 - d0 - 16, 1230 - top - 40, 6);
  const outer = `M${x0} ${wheelY - 20} L${x0} ${top + 20} Q${x0} ${top} ${x0 + 20} ${top} L${x1 - 110} ${top} Q${x1 - 84} ${top} ${x1 - 80} ${top + 24} L${x1 - 74} ${top + 190} L${x1 - 20} ${top + 200} Q${x1 + 4} ${top + 206} ${x1 + 4} ${top + 232} L${x1 + 4} ${wheelY - 20}Z`;
  return `<g>${shadow((x0 + x1) / 2, wheelY + 40, 340, 16, .12)}
    <path fill="${P.mustard}" fill-rule="evenodd" d="${outer} ${holes}"/>
    ${windows.map((x) => glint(`M${x + 12} ${wy0 + 40} L${x + 36} ${wy0 + 12}`)).join('')}
    <path ${tl(P.mustardDeep, 'stroke-width:9')} d="M${x0} ${wy1 + 44} L${d0 - 6} ${wy1 + 44} M${x0} ${wy1 + 70} L${d0 - 6} ${wy1 + 70}"/>
    ${R(x0 - 6, wheelY - 44, x1 - x0 + 16, 26, P.charHi, ' rx="8"')}
    <path fill="${P.sky}" d="M${x1 - 70} ${top + 40} L${x1 - 64} ${top + 170} L${x1 - 100} ${top + 170} L${x1 - 100} ${top + 40}Z"/>
    <circle fill="#FFF7E0" cx="${x1 - 10}" cy="${top + 250}" r="16"/>${R(x1 - 40, top + 290, 40, 40, P.charHi, ' rx="6"')}<path ${tl(P.char)} d="M${x1 - 34} ${top + 302} L${x1 - 6} ${top + 302} M${x1 - 34} ${top + 316} L${x1 - 6} ${top + 316}"/>
    <path fill="${P.berry}" d="${[...Array(8)].map((_, i) => { const a = (i * 45 + 22.5) * Math.PI / 180; return `${i ? 'L' : 'M'}${f(210 + Math.cos(a) * 34)} ${f(1086 + Math.sin(a) * 34)}`; }).join(' ')}Z"/><path fill="none" style="stroke:#fff;stroke-width:5" class="n" d="${[...Array(8)].map((_, i) => { const a = (i * 45 + 22.5) * Math.PI / 180; return `${i ? 'L' : 'M'}${f(210 + Math.cos(a) * 26)} ${f(1086 + Math.sin(a) * 26)}`; }).join(' ')}Z"/>
    ${R(x0 + 10, top - 16, 40, 20, P.berry, ' rx="6"')}${R(x1 - 170, top - 16, 40, 20, P.berry, ' rx="6"')}
    <path fill="${P.charHi}" d="M${x0 + 30} ${wheelY - 20} A70 70 0 0 1 ${x0 + 170} ${wheelY - 20}Z M${x1 - 190} ${wheelY - 20} A70 70 0 0 1 ${x1 - 50} ${wheelY - 20}Z"/>
    ${wheel(x0 + 100, wheelY, 52)}${wheel(x1 - 120, wheelY, 52)}</g>`;
}
function busDoor(open) {
  const { top, door: [d0, d1] } = BUS, y0 = top + 40, y1 = 1230, w = (d1 - d0 - 16) / 2;
  const step = `${R(d0 + 4, y1 - 30, d1 - d0 - 8, 16, P.charHi, ' rx="4"')}${R(d0 + 4, y1 - 80, d1 - d0 - 8, 12, P.charHi, ' rx="4"')}`;
  const panel = (x, pw) => `${R(x, y0, pw, y1 - y0, P.mustard, ' rx="4"')}${R(x + 5, y0 + 10, pw - 10, (y1 - y0) * .42, P.sky, ' rx="4"')}${R(x + 5, y0 + 20 + (y1 - y0) * .44, pw - 10, (y1 - y0) * .4, P.sky, ' rx="4"')}`;
  if (open) return `<g>${step}${panel(d0 + 2, 12)}${panel(d1 - 14, 12)}<path class="d" d="M${d0 + 20} ${y0 + 60} L${d0 + 20} ${y1 - 90}"/></g>`;
  return `<g>${panel(d0 + 8, w)}${panel(d0 + 8 + w, w)}${glint(`M${d0 + 18} ${y0 + 60} L${d0 + 30} ${y0 + 30}`)}</g>`;
}
function facadeBell(ring) {
  const x = (FAC.door[0] + FAC.door[1]) / 2, y = FAC.top - 250;
  const bell = `<path fill="${P.mustard}" d="M${x - 10} ${y + 4} L${x + 10} ${y + 4} Q${x + 24} ${y + 12} ${x + 24} ${y + 40} Q${x + 24} ${y + 56} ${x + 34} ${y + 66} L${x - 34} ${y + 66} Q${x - 24} ${y + 56} ${x - 24} ${y + 40} Q${x - 24} ${y + 12} ${x - 10} ${y + 4}Z"/><circle fill="${P.mustardDeep}" cx="${x}" cy="${y + 72}" r="9"/>${glint(`M${x - 12} ${y + 22} Q${x - 15} ${y + 40} ${x - 16} ${y + 52}`, 5)}`;
  const rings = ring ? `<path ${tl(P.butter, 'stroke-width:6')} d="M${x + 42} ${y + 10} Q${x + 54} ${y + 34} ${x + 42} ${y + 58} M${x - 42} ${y + 10} Q${x - 54} ${y + 34} ${x - 42} ${y + 58}"/>` : '';
  return `<g><path class="d" d="M${x} ${y - 16} L${x} ${y + 6}"/><g transform="rotate(${ring ? 16 : 0} ${x} ${y})">${bell}</g>${rings}</g>`;
}
function frontDoor(open) {
  const [d0, d1] = FAC.door, y0 = FAC.doorTop, y1 = WALL_Y - 4, m = (d0 + d1) / 2;
  const leaf2 = (x, w) => `${R(x, y0, w, y1 - y0, P.teal, ' rx="6"')}${R(x + 14, y0 + 20, w - 28, 180, P.sky, ' rx="6"')}${R(x + 14, y0 + 250, w - 28, 180, P.tealDeep, ' class="thin" rx="6"')}`;
  if (!open) {
    return `<g>${leaf2(d0, m - d0)}${leaf2(m, d1 - m)}${glint(`M${d0 + 26} ${y0 + 80} L${d0 + 56} ${y0 + 40}`)}<circle fill="${P.mustard}" cx="${m - 16}" cy="${y0 + 300}" r="8"/><circle fill="${P.mustard}" cx="${m + 16}" cy="${y0 + 300}" r="8"/>
      <g transform="translate(${m - 44} ${y0 + 110})">${heart(0, 0, 1.6, P.rose)}</g><g transform="translate(${m + 44} ${y0 + 110})"><path class="thin" fill="${P.butter}" d="${star(0, 0, 14, 6)}"/></g></g>`;
  }
  // both leaves swung outward (foreshortened), the warm hallway showing through
  const sw = (x, dir) => `<path fill="${P.teal}" d="M${x} ${y0} L${x + dir * 44} ${y0 - 18} L${x + dir * 44} ${y1 + 18} L${x} ${y1}Z"/><path fill="${P.sky}" d="M${x + dir * 10} ${y0 + 20} L${x + dir * 34} ${y0 + 12} L${x + dir * 34} ${y0 + 190} L${x + dir * 10} ${y0 + 200}Z"/>`;
  return `<g>${sw(d0, -1)}${sw(d1, 1)}</g>`;
}
function lightSwitch(on) {
  const x = ZA[1] - 60, y = 700;
  return `<g>${R(x - 16, y - 24, 32, 48, '#fff', ' rx="6"')}${R(x - 7, y - (on ? 16 : 0), 14, 16, on ? P.butter : P.warmGrey, ' rx="4"')}</g>`;
}
/** The weather slot on the calendar board (a piece: blank / sun / cloud / rain / snow). */
function weatherToday(kind) {
  const [x, y, w, h] = CAL.today;
  return `<g>${R(x, y, w, h, '#fff', ' rx="8"')}${kind === 'blank' ? `<path ${tl(P.oat, 'stroke-width:4;stroke-dasharray:10 8')} d="${rrect(x + 12, y + 12, w - 24, h - 24, 6)}"/>` : `<g transform="translate(${x + w / 2} ${y + h / 2 + 2})">${WX[kind](1.12)}</g>`}</g>`;
}
/** The classroom window's outside (a piece): the same weather as the card. */
function windowView(kind) {
  const { x0, x1, y0, y1 } = WIN, id = `wv-${kind}`;
  const sky = { sun: P.sky, cloud: '#DCE9EE', rain: '#C4CFD8', snow: '#E4EEF2' }[kind];
  const hill = kind === 'snow' ? '#fff' : P.leafLight, hill2 = kind === 'snow' ? '#EEF3F4' : P.sage;
  let extra = '';
  if (kind === 'sun') extra = `<g transform="translate(${x0 + 60} ${y0 + 70})">${WX.sun(1.3)}</g>`;
  if (kind === 'cloud') extra = `<g transform="translate(${x0 + 80} ${y0 + 80}) scale(1.4)"><path fill="#fff" d="${scallop(0, 0, 40, 18, 8, 10, 180, 360, false)} L40 8 Q0 16 -40 8Z"/></g><g transform="translate(${x1 - 60} ${y0 + 150})"><path fill="#fff" d="${scallop(0, 0, 40, 16, 8, 10, 180, 360, false)} L40 8 Q0 16 -40 8Z"/></g>`;
  if (kind === 'rain') extra = `<g transform="translate(${(x0 + x1) / 2} ${y0 + 70}) scale(1.8)"><path fill="${P.steel}" d="${scallop(0, 0, 50, 20, 8, 10, 180, 360, false)} L50 8 Q0 18 -50 8Z"/></g><path ${tl(P.blueDeep, 'stroke-width:4')} d="${[...Array(14)].map((_, i) => { const x = x0 + 16 + i * 16, y = y0 + 130 + (i % 3) * 50; return `M${x} ${y} l-6 20`; }).join(' ')}"/>`;
  if (kind === 'snow') extra = `<g class="n" fill="#fff">${[...Array(18)].map((_, i) => `<circle cx="${x0 + 14 + (i * 37) % (x1 - x0 - 20)}" cy="${y0 + 20 + ((i * 53) % 260)}" r="${4 + i % 3}"/>`).join('')}</g>`;
  return `<g><clipPath id="${id}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath><g clip-path="url(#${id})">
    <rect class="n" fill="${sky}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>${extra}
    <path class="n" fill="${hill}" d="M${x0} ${y1} L${x0} ${y1 - 120} Q${x0 + 80} ${y1 - 170} ${x0 + 160} ${y1 - 110} Q${x1 - 30} ${y1 - 150} ${x1} ${y1 - 120} L${x1} ${y1}Z"/>
    <path class="n" fill="${hill2}" d="M${x0} ${y1} L${x0} ${y1 - 50} Q${x0 + 110} ${y1 - 80} ${x1} ${y1 - 50} L${x1} ${y1}Z"/>
    <g transform="translate(${x1 - 70} ${y1 - 80}) scale(.7)"><rect fill="${P.woodDeep}" x="-8" y="-60" width="16" height="60"/><path fill="${kind === 'snow' ? '#fff' : P.leaf}" d="${scallop(0, -96, 50, 46, 9, 10)}"/></g>
    ${kind === 'snow' ? `<g transform="translate(${x0 + 70} ${y1 - 70})"><circle fill="#fff" cx="0" cy="0" r="22"/><circle fill="#fff" cx="0" cy="-34" r="16"/><circle fill="${P.ink}" cx="-5" cy="-37" r="2.5"/><circle fill="${P.ink}" cx="5" cy="-37" r="2.5"/><path fill="${HAZ}" d="M0 -32 L12 -30 L0 -28Z"/></g>` : ''}
    </g></g>`;
}

// ---------------------------------------------------------------------------
// MID layer: easel, table chairs, rocking chair, lunch table, sandbox, seesaw
// ---------------------------------------------------------------------------
const EASEL = { cx: 1760, paper: [1690, 900, 140, 190], tray: 1112, foot: 1290 };
function easel() {
  const { cx, paper: [px, py, pw, ph], tray, foot } = EASEL;
  return `<g id="easel">${shadow(cx, foot + 2, 90, 10)}
    <path fill="${P.wood}" d="M${cx - 12} ${py - 40} L${cx + 12} ${py - 40} L${cx + 84} ${foot} L${cx + 64} ${foot} Z M${cx - 12} ${py - 40} L${cx + 12} ${py - 40} L${cx - 64} ${foot} L${cx - 84} ${foot}Z"/>
    ${R(cx - 6, py - 60, 12, 30, P.woodDeep, ' rx="5"')}
    ${R(px - 10, py - 12, pw + 20, ph + 24, P.woodLight, ' rx="6"')}${R(px, py, pw, ph, '#fff', ' rx="2"')}
    ${R(px - 16, py - 20, pw + 32, 12, P.woodDeep, ' rx="5"')}${[px + 20, px + pw - 20].map((x) => `<rect fill="${P.berry}" class="thin" x="${x - 6}" y="${py - 24}" width="12" height="18" rx="3"/>`).join('')}
    ${R(px - 24, tray - 6, pw + 48, 18, P.wood, ' rx="5"')}${R(px - 24, tray - 20, 10, 16, P.wood, ' rx="3"')}${R(px + pw + 14, tray - 20, 10, 16, P.wood, ' rx="3"')}</g>`;
}
const TABLE = { x0: 1890, x1: 2200, top: 1196, legs: 1330, chairs: [1955, 2045, 2135] };
const CHAIR_C = [[P.rose, P.roseDeep], [P.butter, P.mustard], [P.mint, P.teal]];
function kidChairs() {
  return TABLE.chairs.map((x, i) => {
    const [c, d] = CHAIR_C[i], seat = 1256;
    return `${shadow(x, 1300, 40, 7)}${R(x - 34, seat - 100, 68, 56, c, ' rx="14"')}${R(x - 26, seat - 46, 8, 46, d)}${R(x + 18, seat - 46, 8, 46, d)}
      ${R(x - 38, seat - 8, 76, 18, c, ' rx="7"')}${R(x - 32, seat + 10, 8, 38, d, ' rx="3"')}${R(x + 24, seat + 10, 8, 38, d, ' rx="3"')}<circle class="n" fill="#fff" opacity=".6" cx="${x}" cy="${seat - 72}" r="9"/>`;
  }).join('');
}
function kidTable() {
  const { x0, x1, top, legs } = TABLE;
  return `<g id="kid-table">${shadow((x0 + x1) / 2, legs + 4, (x1 - x0) / 2 + 10, 12)}
    ${R(x0 + 20, top + 20, 16, legs - top - 20, P.woodDeep, ' rx="4"')}${R(x1 - 36, top + 20, 16, legs - top - 20, P.woodDeep, ' rx="4"')}
    ${R(x0, top, x1 - x0, 28, P.sage, ' rx="8"')}${R(x0, top, x1 - x0, 12, '#CADBB8', ' rx="6"')}<path ${tl(P.sageDeep)} d="M${x0 + 40} ${top + 20} L${x1 - 40} ${top + 20}"/></g>`;
}
const ROCK = { cx: 2290, feet: 1318, seat: 1150 };
function rockingChair() {
  const { cx, feet, seat } = ROCK;
  return `<g>${shadow(cx, feet + 4, 96, 10)}
    <path fill="none" style="stroke:${P.ink};stroke-width:22" d="M${cx - 104} ${feet - 22} Q${cx} ${feet + 12} ${cx + 104} ${feet - 22}"/><path fill="none" style="stroke:${P.woodDeep};stroke-width:13" d="M${cx - 104} ${feet - 22} Q${cx} ${feet + 12} ${cx + 104} ${feet - 22}"/>
    ${R(cx - 80, seat - 250, 14, feet - seat + 240, P.wood, ' rx="6"')}${R(cx + 66, seat - 250, 14, feet - seat + 240, P.wood, ' rx="6"')}
    ${R(cx - 70, seat - 240, 140, 30, P.wood, ' rx="10"')}<path class="d" d="${[-40, -14, 12, 38].map((dx) => `M${cx + dx} ${seat - 210} L${cx + dx} ${seat - 40}`).join(' ')}"/>
    <path fill="${P.rose}" d="M${cx - 60} ${seat - 196} Q${cx} ${seat - 214} ${cx + 60} ${seat - 196} L${cx + 58} ${seat - 40} L${cx - 58} ${seat - 40}Z"/>${[-26, 0, 26].map((dx) => `<circle class="n" fill="${P.blush}" cx="${cx + dx}" cy="${seat - 130 + (dx ? 24 : 0)}" r="6"/>`).join('')}
    ${R(cx - 94, seat - 110, 36, 14, P.wood, ' rx="6"')}${R(cx + 58, seat - 110, 36, 14, P.wood, ' rx="6"')}
    ${R(cx - 90, seat - 12, 180, 30, P.woodLight, ' rx="10"')}${R(cx - 84, seat - 26, 168, 22, P.rose, ' rx="10"')}
    ${R(cx - 76, seat + 18, 12, feet - seat - 30, P.woodDeep, ' rx="4"')}${R(cx + 64, seat + 18, 12, feet - seat - 30, P.woodDeep, ' rx="4"')}</g>`;
}
const STOOL = { x: 2380, y: 1384 };
function showStool() {
  const { x, y } = STOOL;
  return `<g id="show-stool">${shadow(x, y + 2, 44, 8)}${R(x - 28, y - 70, 10, 70, P.woodDeep, ' rx="4"')}${R(x + 18, y - 70, 10, 70, P.woodDeep, ' rx="4"')}
    <ellipse fill="${P.mustard}" cx="${x}" cy="${y - 74}" rx="44" ry="14"/><path class="thin" fill="${P.butter}" d="${star(x, y - 76, 11, 5)}"/></g>`;
}
const LUNCH = { x0: 3150, x1: 3440, top: 1080, feet: 1190, bench: 1120, seats: [3200, 3295, 3390] };
function lunchBench() {
  const { x0, x1, bench } = LUNCH;
  return `<g id="lunch-bench">${R(x0 + 10, bench + 14, 14, 58, P.woodDeep, ' rx="4"')}${R(x1 - 24, bench + 14, 14, 58, P.woodDeep, ' rx="4"')}${R(x0 - 10, bench - 6, x1 - x0 + 20, 22, P.wood, ' rx="6"')}${R(x0 - 10, bench - 6, x1 - x0 + 20, 9, P.woodLight, ' rx="4"')}</g>`;
}
function lunchTable() {
  const { x0, x1, top, feet } = LUNCH;
  return `<g id="lunch-table">${shadow((x0 + x1) / 2, feet + 4, (x1 - x0) / 2 + 20, 12)}
    <path fill="${P.woodDeep}" d="M${x0 + 30} ${feet} L${x0 + 70} ${top + 20} L${x0 + 86} ${top + 20} L${x0 + 48} ${feet}Z M${x1 - 30} ${feet} L${x1 - 70} ${top + 20} L${x1 - 86} ${top + 20} L${x1 - 48} ${feet}Z"/>
    ${R(x0 - 20, top, x1 - x0 + 40, 28, P.teal, ' rx="8"')}${R(x0 - 20, top, x1 - x0 + 40, 11, '#A9D1CC', ' rx="6"')}<path ${tl(P.tealDeep)} d="M${x0 + 20} ${top + 20} L${x1 - 20} ${top + 20}"/></g>`;
}
const BOX = { x0: 3170, x1: 3480, y0: 1232, y1: 1350 };
function sandboxBack() {
  const { x0, x1, y0, y1 } = BOX;
  return `<g id="sandbox-back">${R(x0 - 20, y0 - 20, x1 - x0 + 40, y1 - y0 + 40, P.wood, ' rx="10"')}${R(x0, y0, x1 - x0, y1 - y0, SANDD, ' rx="6"')}${R(x0 - 20, y0 - 20, x1 - x0 + 40, 22, P.woodLight, ' rx="8"')}</g>`;
}
/** The sand fill (a piece): the engine can dig it away with the dig-mask canvas (site.js), toys beneath. */
function sandFill() {
  const { x0, x1, y0, y1 } = BOX;
  let bits = '', seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { const x = x0 + 20 + rnd() * (x1 - x0 - 40), y = y0 + 24 + rnd() * (y1 - y0 - 40); bits += `<path ${tl(SANDD, 'stroke-width:3')} d="M${f(x - 7)} ${f(y)} Q${f(x)} ${f(y - 6)} ${f(x + 7)} ${f(y)}"/>`; }
  return `<g><path fill="${SAND}" d="M${x0} ${y1} L${x0} ${y0 + 20} ${scallop((x0 + x1) / 2, y0 + 22, (x1 - x0) / 2, 22, 12, 6, 180, 360, false).replace(/^M[^Q]*/, '')} L${x1} ${y1}Z"/>
    <path class="n" fill="#F4E2C2" d="${scallop(x0 + 120, y0 + 40, 70, 18, 8, 5, 180, 360, false)}Z"/>${bits}</g>`;
}
function sandboxFront() {
  const { x0, x1, y1 } = BOX;
  return `<g id="sandbox-front">${R(x0 - 20, y1 - 4, x1 - x0 + 40, 30, P.wood, ' rx="8"')}${R(x0 - 20, y1 - 4, x1 - x0 + 40, 12, P.woodLight, ' rx="6"')}${[x0 + 20, x1 - 20].map((x) => `<circle fill="${P.woodDeep}" class="thin" cx="${x}" cy="${y1 + 12}" r="5"/>`).join('')}</g>`;
}
const SEE = { cx: 3760, pivot: [3760, 1300], half: 190, feet: 1372 };
function seesawBase() {
  const { cx, feet } = SEE;
  return `<g id="seesaw-base">${shadow(cx, feet + 2, 200, 10, .08)}<path fill="${P.blueDeep}" d="M${cx - 50} ${feet} L${cx - 12} ${SEE.pivot[1]} L${cx + 12} ${SEE.pivot[1]} L${cx + 50} ${feet}Z"/>${R(cx - 60, feet - 8, 120, 12, P.charHi, ' rx="4"')}</g>`;
}
function seesawPlank(tilt) {
  const [px, py] = SEE.pivot, h = SEE.half;
  const a = { level: 0, left: -12, right: 12 }[tilt];
  const handle = (x) => `<path fill="none" style="stroke:${P.ink};stroke-width:14" d="M${x - 14} ${py - 12} L${x - 14} ${py - 52} L${x + 14} ${py - 52} L${x + 14} ${py - 12}"/><path fill="none" style="stroke:${P.berry};stroke-width:7" d="M${x - 14} ${py - 12} L${x - 14} ${py - 52} L${x + 14} ${py - 52} L${x + 14} ${py - 12}"/>`;
  return `<g transform="rotate(${a} ${px} ${py})">${handle(px - h + 70)}${handle(px + h - 70)}${R(px - h, py - 12, 2 * h, 22, P.mustard, ' rx="10"')}${R(px - h + 6, py - 10, 70, 16, P.berry, ' rx="7"')}${R(px + h - 76, py - 10, 70, 16, P.berry, ' rx="7"')}
    <circle fill="${P.char}" cx="${px}" cy="${py}" r="11"/><circle fill="${P.steel}" class="thin" cx="${px}" cy="${py}" r="5"/></g>`;
}

// ---------------------------------------------------------------------------
// FRONT layer
// ---------------------------------------------------------------------------
function frontPlants() {
  const big = (x, y, s, c) => at(x, y, s, `${[-70, -45, -20, 5, 30, 55, 75].map((a, i) => leaf((150 + (i % 3) * 30), 44, a, i % 2 ? P.leaf : P.leafDeep, 0, -110)).join('')}${leaf(190, 50, -8, P.leafLight, 0, -110)}${pot(c, 170, 120)}`);
  return `${big(1630, 1580, .55, P.teal)}${big(3080, 1590, .6, P.rose)}${bush(3590, 1560, .9, P.butter)}`;
}

// ---------------------------------------------------------------------------
const toW = (x, y) => [+(x * ART_SCALE).toFixed(1), +(y * ART_SCALE).toFixed(1)];
const W = (p) => toW(p[0], p[1]);
const WB4 = (b) => [...toW(b[0], b[1]), +(b[2] * ART_SCALE).toFixed(1), +(b[3] * ART_SCALE).toFixed(1)];
const RUG = { cx: 2710, cy: 1205, rx: 340, ry: 128 };
const SPOTS = [[2560, 1150], [2740, 1140], [2920, 1150], [2470, 1270], [2650, 1284], [2830, 1284], [2990, 1266]];
const SPOT_C = [P.berry, HAZ, P.mustard, P.leaf, P.teal, P.blueDeep, P.plum];
function rug() {
  const { cx, cy, rx, ry } = RUG;
  return `<g id="circle-rug"><ellipse fill="${P.cream}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><ellipse class="n" fill="none" cx="${cx}" cy="${cy}" rx="${rx - 18}" ry="${ry - 12}" style="stroke:${P.mint};stroke-width:12"/>
    <ellipse class="n" fill="none" cx="${cx}" cy="${cy}" rx="${rx - 36}" ry="${ry - 24}" style="stroke:${P.oat};stroke-width:4;stroke-dasharray:14 10"/>
    <g transform="translate(${cx} ${cy + 4}) scale(1 .6)">${WX.sun(.9)}</g>
    ${SPOTS.map(([x, y], i) => `<ellipse fill="${SPOT_C[i]}" cx="${x}" cy="${y}" rx="46" ry="19"/><ellipse class="n" fill="#fff" opacity=".35" cx="${x - 10}" cy="${y - 4}" rx="12" ry="4"/>`).join('')}</g>`;
}
function runner() {
  const x0 = 930, x1 = 1440, y0 = 1250, y1 = 1360;
  return `<path fill="${P.rose}" d="M${x0 + 30} ${y0} L${x1 - 30} ${y0} L${x1} ${y1} L${x0} ${y1}Z"/><path class="n" fill="none" style="stroke:${P.blush};stroke-width:10" d="M${x0 + 50} ${y0 + 16} L${x1 - 50} ${y0 + 16} L${x1 - 26} ${y1 - 16} L${x0 + 26} ${y1 - 16}Z"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path class="thin" fill="${P.butter}" d="${star(x0 + 90 + i * 82, (y0 + y1) / 2, 14, 6)}"/>`).join('')}
    <path ${tl(P.roseDeep, 'stroke-width:4')} d="${[...Array(22)].map((_, i) => `M${x0 + 4 + i * 24} ${y1} l0 12`).join(' ')}"/>`;
}
function lineSpots() {
  const feet = (x, y) => `<g transform="translate(${x} ${y})"><ellipse class="n" fill="${P.teal}" opacity=".85" cx="-12" cy="0" rx="9" ry="14"/><ellipse class="n" fill="${P.teal}" opacity=".85" cx="12" cy="-2" rx="9" ry="14"/></g>`;
  return LINE.map(([x, y]) => feet(x, y)).join('');
}
const LINE = [0, 1, 2, 3, 4, 5, 6].map((i) => [960 + i * 88, 1190]);

export const ROOM = {
  id: 'school',
  offset: [0, 0],
  canvas: { x: -100, y: -100, w: 3400, h: 1200 },
  width: 3200,
  defs: DEFS,
  layers: [
    { id: 'back', baseline: 0, opaque: true,
      art: () => `${skyAndStreet()}${ground()}${floors()}${walls()}${pillar(ZA[1])}${pillar(ZB[1])}
        ${facade()}${busStop()}${flagPole(3560)}${fence()}${hopscotch()}
        ${hallDecor()}${calmCorner()}${runner()}${lineSpots()}
        ${letterWall()}${calendarBoard()}${classWindowFrame()}${scheduleStrip()}${whiteboard()}${wordWall()}${classDecor()}${rug()}
` },
    { id: 'counter', baseline: 728,
      art: () => `${cubbies()}${sink()}${beanbag()}${blockShelf()}${bookCorner()}${cotStack()}${patioWall()}${recessBin()}${playStructure()}${swingFrame()}${lunchBench()}` },
    { id: 'mid', baseline: 903,
      art: () => `${easel()}${kidChairs()}${showStool()}${lunchTable()}${sandboxBack()}${seesawBase()}` },
    { id: 'front', baseline: 1000,
      art: () => `${kidTable()}${sandboxFront()}${frontPlants()}` },
  ],
  // Pieces (variants[0] = default; all variants share one box). Pivots in art units.
  pieces: [
    { id: 'school-bell', layer: 'back', variants: { still: () => facadeBell(false), ring: () => facadeBell(true) }, pivot: [(FAC.door[0] + FAC.door[1]) / 2, FAC.top - 250] },
    { id: 'front-door', layer: 'back', variants: { closed: () => frontDoor(false), open: () => frontDoor(true) }, taps: ['closed', 'open'] },
    { id: 'light-switch', layer: 'back', variants: { on: () => lightSwitch(true), off: () => lightSwitch(false) }, taps: ['on', 'off'] },
    { id: 'weather-today', layer: 'back', variants: { blank: () => weatherToday('blank'), sun: () => weatherToday('sun'), cloud: () => weatherToday('cloud'), rain: () => weatherToday('rain'), snow: () => weatherToday('snow') } },
    { id: 'class-window', layer: 'back', variants: { sun: () => windowView('sun') + classWindowMullions(), cloud: () => windowView('cloud') + classWindowMullions(), rain: () => windowView('rain') + classWindowMullions(), snow: () => windowView('snow') + classWindowMullions() } },
    { id: 'bus-inside', layer: 'counter', variants: { still: busInside } },
    { id: 'sink-tap', layer: 'counter', variants: { off: () => sinkTap(false), on: () => sinkTap(true) }, taps: ['off', 'on'] },
    { id: 'fish-bowl', layer: 'counter', variants: { 'swim-a': () => fishBowl('swim-a'), 'swim-b': () => fishBowl('swim-b'), fed: () => fishBowl('fed') }, taps: ['swim-a', 'swim-b'] },
    { id: 'swing-1-seat', layer: 'counter', variants: { still: () => swingSeat(SWING.seats[0], P.berry) }, pivot: [SWING.seats[0], SWING.bar] },
    { id: 'swing-2-seat', layer: 'counter', variants: { still: () => swingSeat(SWING.seats[1], P.teal) }, pivot: [SWING.seats[1], SWING.bar] },
    { id: 'bus', layer: 'mid', variants: { still: busBody } },
    { id: 'bus-door', layer: 'mid', variants: { closed: () => busDoor(false), open: () => busDoor(true) }, taps: ['closed', 'open'] },
    { id: 'rocking-chair', layer: 'mid', variants: { still: rockingChair }, pivot: [ROCK.cx, ROCK.feet] },
    { id: 'swing-1-chains', layer: 'mid', variants: { still: () => swingChains(SWING.seats[0]) }, pivot: [SWING.seats[0], SWING.bar] },
    { id: 'swing-2-chains', layer: 'mid', variants: { still: () => swingChains(SWING.seats[1]) }, pivot: [SWING.seats[1], SWING.bar] },
    { id: 'seesaw', layer: 'mid', variants: { level: () => seesawPlank('level'), left: () => seesawPlank('left'), right: () => seesawPlank('right') }, taps: ['left', 'right'], pivot: SEE.pivot },
    { id: 'sand', layer: 'mid', variants: { full: sandFill } },
  ],
  surfaces: [
    { id: 'cubby-top', layer: 'counter', seg: [CUB.x0, CUB.x1, CUB.top - 14] },
    ...[...Array(CUB.cols)].flatMap((_, i) => { const a = CUB.x0 + i * CUB.w; return [
      { id: `cubby-${i + 1}-shelf`, layer: 'counter', seg: [a + 8, a + CUB.w - 8, CUB.lunch] },
      { id: `cubby-${i + 1}-floor`, layer: 'counter', seg: [a + 8, a + CUB.w - 8, CUB.shoe] }]; }),
    { id: 'sink-top', layer: 'counter', seg: [SINK.x0 - 8, SINK.x1 + 8, SINK.top - 14] },
    { id: 'block-shelf', layer: 'counter', seg: [BLK.x0, BLK.x1, BLK.top - 14] },
    { id: 'window-sill', layer: 'back', seg: [WIN.x0 - 20, WIN.x1 + 20, WIN.y1 + 12] },
    { id: 'whiteboard-tray', layer: 'back', seg: [WB.x0 + 40, WB.x1 - 40, WB.y1 + 10] },
    { id: 'easel-tray', layer: 'mid', seg: [EASEL.paper[0] - 20, EASEL.paper[0] + EASEL.paper[2] + 20, EASEL.tray - 6] },
    { id: 'kid-table', layer: 'front', seg: [TABLE.x0 + 10, TABLE.x1 - 10, TABLE.top] },
    { id: 'book-shelf', layer: 'counter', seg: [BOOK.x0, BOOK.x1, BOOK.top - 14] },
    { id: 'cot-stack', layer: 'counter', seg: [COTS.x0, COTS.x1, BB - 158] },
    { id: 'show-stool', layer: 'mid', seg: [STOOL.x - 30, STOOL.x + 30, STOOL.y - 80] },
    { id: 'hatch', layer: 'counter', seg: [HATCH.x0 - 20, HATCH.x1 + 20, HATCH.y1] },
    { id: 'lunch-table', layer: 'mid', seg: [LUNCH.x0 - 10, LUNCH.x1 + 10, LUNCH.top] },
    { id: 'tower-deck', layer: 'counter', seg: [TOWER.x0, TOWER.x1, TOWER.deck - 10] },
    { id: 'sandbox', layer: 'mid', seg: [BOX.x0 + 20, BOX.x1 - 20, BOX.y1 - 30] },
  ],
  seats: [
    ...[76, 182, 288].map((x, i) => ({ id: `bus-seat-${i + 1}`, layer: 'counter', at: [BUS.windows[i + 1] + BUS.ww / 2, BUS.floor] })),
    { id: 'beanbag', layer: 'counter', at: [1545, 1100] },
    ...SPOTS.map((p, i) => ({ id: `rug-${i + 1}`, layer: 'counter', at: p })),
    { id: 'rocking-chair', layer: 'mid', at: [ROCK.cx, ROCK.seat - 20] },
    ...TABLE.chairs.map((x, i) => ({ id: `chair-${i + 1}`, layer: 'mid', at: [x, 1250] })),
    { id: 'show-stool', layer: 'mid', at: [STOOL.x, STOOL.y - 78] },
    { id: 'reading-cushion', layer: 'counter', at: [BOOK.x0 + 40, 1060] },
    ...LUNCH.seats.map((x, i) => ({ id: `lunch-bench-${i + 1}`, layer: 'counter', at: [x, LUNCH.bench - 6] })),
    { id: 'slide-top', layer: 'counter', at: [SLIDE.top[0] - 10, TOWER.deck - 10] },
    ...SWING.seats.map((x, i) => ({ id: `swing-${i + 1}`, layer: 'counter', at: [x, SWING.seatY - 10] })),
    { id: 'seesaw-l', layer: 'mid', at: [SEE.pivot[0] - SEE.half + 40, SEE.pivot[1] - 12] },
    { id: 'seesaw-r', layer: 'mid', at: [SEE.pivot[0] + SEE.half - 40, SEE.pivot[1] - 12] },
  ],
  slots: [
    { id: 'bus-door', kind: 'door', layer: 'mid', at: [(BUS.door[0] + BUS.door[1]) / 2, 1236], piece: 'bus-door' },
    { id: 'front-door', kind: 'door', layer: 'back', at: [(FAC.door[0] + FAC.door[1]) / 2, WALL_Y + 20], box: [FAC.door[0], FAC.doorTop, FAC.door[1] - FAC.door[0], WALL_Y - FAC.doorTop], piece: 'front-door' },
    { id: 'school-bell', kind: 'bell', layer: 'back', at: [(FAC.door[0] + FAC.door[1]) / 2, FAC.top - 200], piece: 'school-bell' },
    ...[...Array(CUB.cols)].map((_, i) => ({ id: `hook-${i + 1}`, kind: 'hook', layer: 'counter', at: [CUB.x0 + i * CUB.w + CUB.w / 2 + 10, CUB.lunch + 44], label: CUBBY_ANIMALS[i] })),
    ...[...Array(CUB.cols)].map((_, i) => ({ id: `label-${i + 1}`, kind: 'label', layer: 'counter', at: [CUB.x0 + i * CUB.w + CUB.w / 2, CUB.top + 32], box: [CUB.x0 + i * CUB.w + CUB.w / 2 - 28, CUB.top + 4, 56, 56], label: CUBBY_ANIMALS[i] })),
    ...LINE.map((p, i) => ({ id: `line-${i + 1}`, kind: 'line', layer: 'back', at: p })),
    { id: 'sink', kind: 'sink', layer: 'counter', at: [(SINK.x0 + SINK.x1) / 2, SINK.top - 6], box: [SINK.x0, SINK.top - 90, SINK.x1 - SINK.x0, 90], piece: 'sink-tap' },
    ...FEEL.map(([k, x, y]) => ({ id: `feeling-${k}`, kind: 'feeling', layer: 'back', at: [x, y], box: [x - 26, y - 26, 52, 52], feeling: k })),
    { id: 'light-switch', kind: 'switch', layer: 'back', at: [ZA[1] - 60, 700], box: [ZA[1] - 90, 660, 60, 80], piece: 'light-switch' },
    { id: 'weather-board', kind: 'weather', layer: 'back', at: [CAL.today[0] + CAL.today[2] / 2, CAL.today[1] + CAL.today[3] / 2], box: CAL.today, piece: 'weather-today', window: 'class-window' },
    { id: 'easel', kind: 'canvas', layer: 'mid', box: EASEL.paper },
    { id: 'whiteboard', kind: 'canvas', layer: 'back', box: [WB.x0, WB.y0, WB.x1 - WB.x0, WB.y1 - WB.y0] },
    { id: 'fish-bowl', kind: 'pet', layer: 'counter', at: [BOWL[0], BOWL[1] - 90], box: [BOWL[0] - 56, BOWL[1] - 92, 112, 92], piece: 'fish-bowl' },
    { id: 'show-and-tell', kind: 'spotlight', layer: 'mid', at: [STOOL.x, STOOL.y - 78] },
    { id: 'teacher-spot', kind: 'teacher', layer: 'mid', at: [2440, 1330] },
    { id: 'sandbox', kind: 'dig', layer: 'mid', box: [BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0], piece: 'sand' },
    ...[[3240, 1320], [3330, 1296], [3410, 1326], [3280, 1270]].map(([x, y], i) => ({ id: `treasure-${i + 1}`, kind: 'treasure', layer: 'mid', at: [x, y] })),
    { id: 'slide', kind: 'slide', layer: 'counter', at: SLIDE.top },
    { id: 'monkey-bars', kind: 'bars', layer: 'counter', at: [BARS.x0 + 20, BARS.y] },
    { id: 'lights', kind: 'lights', layer: 'back', box: [ZB[0], 0, ZB[1] - ZB[0], 1000 / ART_SCALE], note: 'light switch dims this zone (nap time)' },
  ],
  spawners: [
    { id: 'art-caddy', at: [BLK.x0 + 150, BLK.top - 60], items: ['crayon', 'crayon-box', 'marker', 'glue-stick', 'scissors', 'paper-sheet', 'stamp'] },
    { id: 'block-bin', at: [BLK.x0 + 72, 910], items: ['unit-block', 'blocks'] },
    { id: 'toy-bin', at: [BLK.x1 - 72, 910], items: ['toy-car', 'puzzle'] },
    { id: 'crayon-bin', at: [BLK.x0 + 72, BB - 50], items: ['crayon', 'chalk'] },
    { id: 'plush-bin', at: [BLK.x1 - 72, BB - 50], items: ['plush-bunny', 'teddy'] },
    { id: 'books', surfaces: ['book-shelf'], at: [(BOOK.x0 + BOOK.x1) / 2, 960], items: ['picture-book', 'book'] },
    { id: 'weather-cards', at: [CAL.x0 + 150, CAL.y1 + 10], items: ['weather-card'] },
    { id: 'paint', surfaces: ['easel-tray'], at: [EASEL.cx, EASEL.tray - 6], items: ['paint-cup'] },
    { id: 'markers', surfaces: ['whiteboard-tray'], at: [(WB.x0 + WB.x1) / 2, WB.y1 + 10], items: ['marker'] },
    { id: 'cots', surfaces: ['cot-stack'], at: [(COTS.x0 + COTS.x1) / 2, BB - 60], items: ['nap-cot', 'nap-blanket'] },
    { id: 'lunch-hatch', surfaces: ['hatch'], at: [(HATCH.x0 + HATCH.x1) / 2, HATCH.y0 + 80], items: ['lunch-tray', 'milk-carton', 'juice-box', 'snack-cup', 'apple', 'school-lunchbox'] },
    { id: 'recess-bin', at: [3505, BB - 60], items: ['playground-ball', 'jump-rope', 'chalk', 'sand-pail', 'spade', 'sun-hat'] },
  ],
  zones: [
    { id: 'arrival', x0: ZA[0], x1: ZA[1], camera: 0 },
    { id: 'classroom', x0: ZB[0], x1: ZB[1], camera: 946 },
    { id: 'recess', x0: ZC[0], x1: ZC[1], camera: 1760 },
  ],
  floor: { y0: WALL_Y, y1: 1428 },
};
// Alternate piece states for previews and the contact sheet.
export const ALT = { 'front-door': 'open', 'bus-door': 'open', 'school-bell': 'ring', 'sink-tap': 'on', 'light-switch': 'off', 'weather-today': 'rain', 'class-window': 'rain', 'fish-bowl': 'fed', seesaw: 'left' };

// Engine data (world units), copied into manifest.rooms.school.rigs by the build.
const slidePath = () => { const pts = []; const [ax, ay] = SLIDE.top, [bx, by] = SLIDE.bot;
  for (let i = 0; i <= 8; i++) { const t = i / 8; const x = ax + (bx - ax) * t, y = ay + (by - 40 - ay) * (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) - 16; pts.push(W([x, y])); } pts.push(W([bx + 60, by - 36])); return pts; };
export const SCHOOL_RIGS = {
  bus: { pieces: { body: 'bus', door: 'bus-door', inside: 'bus-inside' }, seats: ['bus-seat-1', 'bus-seat-2', 'bus-seat-3'], door: W([(BUS.door[0] + BUS.door[1]) / 2, 1236]), stop: W([(BUS.door[0] + BUS.door[1]) / 2 + 40, 1260]),
    note: 'Arrival: translate bus, bus-door and bus-inside together from off-screen left to rest; open the door; riders hop from bus seats to the kerb at stop. The bus is the travel vehicle (design 2.4).' },
  letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch, i) => ({ ch, box: WB4([LET.x0 + (i % 13) * LET.pitch, LET.rows[Math.floor(i / 13)], LET.w, LET.h]) })),
  sightWords: { cards: WW.cards ? WW.cards.map(WB4) : [], note: 'Blank cards: the engine writes SCHOOL.sightWords[i] into cards[i] (text layer + speech).' },
  schedule: SCHEDULE.map((k, i) => ({ id: k, box: WB4([SCH.x0 + i * SCH.pitch, SCH.y, SCH.w, SCH.h]) })),
  calendar: { today: WB4(CAL.today), weekDots: [...Array(7)].map((_, d) => W([CAL.x0 + 34 + d * 38, CAL.y0 + 150])), monthDots: (CAL.dots || []).map(W), dotRadius: +(12 * ART_SCALE).toFixed(1), doneThrough: 11,
    note: 'weather-today piece variants blank/sun/cloud/rain/snow; set class-window to the same weather. monthDots[0..11] are drawn with stars (days done), [12] is "today".' },
  feelings: FEEL.map(([k, x, y]) => ({ id: k, at: W([x, y]), r: +(26 * ART_SCALE).toFixed(1) })),
  cubbies: [...Array(CUB.cols)].map((_, i) => ({ animal: CUBBY_ANIMALS[i], label: W([CUB.x0 + i * CUB.w + CUB.w / 2, CUB.top + 32]), labelR: +(26 * ART_SCALE).toFixed(1),
    hook: W([CUB.x0 + i * CUB.w + CUB.w / 2 + 10, CUB.lunch + 44]), shelf: `cubby-${i + 1}-shelf`, floor: `cubby-${i + 1}-floor` })),
  canvases: { easel: WB4(EASEL.paper), whiteboard: WB4([WB.x0, WB.y0, WB.x1 - WB.x0, WB.y1 - WB.y0]), note: 'Paint/draw into a canvas over these boxes (blob save, P2d.3). The art underneath is blank paper / board.' },
  rug: { spots: SPOTS.map(W), colors: SPOT_C, seats: SPOTS.map((_, i) => `rug-${i + 1}`), note: 'Seat ids start with rug: characters use the sit-cross pose. Each spot plays a note; a full rug plays a tune.' },
  line: { spots: LINE.map(W), leader: 0, note: 'line-1 (by the door) is the leader; march right toward recess.' },
  slide: { path: slidePath(), top: 'slide-top', note: 'Slide a seated character along path (world points, top to bottom), land sitting at the last point.' },
  swings: SWING.seats.map((x, i) => ({ seat: `swing-${i + 1}`, pieces: { chains: `swing-${i + 1}-chains`, seat: `swing-${i + 1}-seat` }, pivot: W([x, SWING.bar]), length: +((SWING.seatY - SWING.bar) * ART_SCALE).toFixed(1),
    note: 'Rotate chains and seat (and the seated character) together about pivot; push = bigger amplitude.' })),
  seesaw: { piece: 'seesaw', pivot: W(SEE.pivot), halfLength: +(SEE.half * ART_SCALE).toFixed(1), tilt: { level: 0, left: -12, right: 12 }, seats: ['seesaw-l', 'seesaw-r'],
    note: 'Variants are pre-rotated about pivot (degrees). Or rotate the level piece continuously; seats ride the plank ends.' },
  monkeyBars: { grips: [...Array(6)].map((_, i) => W([BARS.x0 + 20 + i * 34, BARS.y])), hangFeet: +(400 * ART_SCALE).toFixed(1), note: 'Hand-over-hand from grips[0] to the tower; the "made it" cheer on the deck (tower-deck surface).' },
  rockingChair: { piece: 'rocking-chair', pivot: W([ROCK.cx, ROCK.feet]), seat: 'rocking-chair', note: 'Rock a few degrees about pivot, with the seated teacher.' },
  sandbox: { piece: 'sand', box: WB4([BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0]), treasures: ['treasure-1', 'treasure-2', 'treasure-3', 'treasure-4'],
    note: 'Same as the dig pit (site.js): draw the sand piece into a canvas, erase with a round brush; toys in treasure slots are drawn under it. A flipped full pail leaves a sand-castle prop.' },
  hopscotch: HOP.map((p, i) => ({ dots: i < 8 ? i + 1 : 0, at: W(p) })),
  lights: { switch: 'light-switch', zone: 'classroom', note: 'off = dim the classroom (nap time), lullaby.' },
};
