// The Theater (P2b.1, docs/design.md 3.2): ONE panning strip, 2880 world
// units wide, with three zones: BACKSTAGE and the COSTUME CLOSET (a props
// shelf, a vanity with a bulb mirror and a wig stand, two costume racks, a
// trunk, a quick-change screen and the thunder sheet), the STAGE (a big
// proscenium with the city map's look: bulbs, a big star, a berry velvet
// curtain; swappable backdrops, three spotlights on a rail, a mic stand, a
// trapdoor, effects machines and a small orchestra pit) and the AUDIENCE and
// LOBBY (three tiered rows of seats, a balcony with the sound and light
// booth: effects buttons and a tape boombox; a ticket booth, a snack stand
// and the marquee poster frame). Authored in art units like the cafe
// (world = art * ART_SCALE).
//
// Shipped as depth layers (back / counter / mid / front) plus PIECES: every
// part that moves or changes state is its own raster whose variants share one
// box (docs/STYLE.md 9, "The theater strip"). The curtain is three pieces
// (left half, right half, valance; each open / half / closed), the backdrop
// one piece with a variant per scene, the spotlight one piece drawn at three
// `copies` along the rail (off / white / pink / blue / gold, cone included).
// The room records surfaces, seats, SLOTS (curtain rope, trapdoor, bow spot),
// STATIONS (mic, instruments with their key/pad boxes, effects buttons, the
// spotlight rail, the backdrop hook, the boombox, ticket window, snack
// counter), SPAWNERS (costume racks, props shelf, trunk, popcorn, lemonade,
// tickets) and camera ZONES. Rig numbers for the engine: THEATER_RIGS.
import { P, ART_SCALE } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';
import * as HH from '../props/household.mjs';
import { crown, tiara, wand, foamSword, bouquet, microphone, topHat, masquerade, popcorn, tape, tambourine, maracas, program, ticket } from '../props/theater.mjs';
const { pot, plantLeafy, books, bulb, hangingPlant, lemonade, jar, mug, succulent, vase } = HH;

export const ART_W = 4114;                          // 2880 world
const WALL_Y = 1010;                                // wall foot (backstage, stage, house)
const X0 = -150, X1 = 4270, Y0 = -150, Y1 = 1580;   // art canvas incl. the 100-unit world bleed
const ZB = [0, 1370], ZS = [1370, 2790], ZA = [2790, ART_W];   // zones (art x)
const toW = (x, y) => [+(x * ART_SCALE).toFixed(1), +(y * ART_SCALE).toFixed(1)];

// Theater-only colours (local, like the site's dirt): velvet, stage dark, glow.
const VEL = '#C95F63', VELD = '#AE4E53', VELL = '#DC7B7E';        // curtain / seat velvet (berry family)
const STAGE = '#5E4A66', STAGED = '#4E3D56';                       // the room's one dark anchor: the stage box
const LAMP = '#FFE9A8', GLOW = '#FFD27A';
const LAVB = ['#E3D8EC', '#D6C8E3', '#EDE6F3'];                    // lavender brick, brick 2, mortar
const LIGHTS = { white: '#FFF6DE', pink: '#F7B9C6', blue: '#BCDDF3', gold: '#FFD27A' };

const glint = (d, w = 6) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;
const bulbs = (pts, r = 9) => pts.map(([x, y]) => `<circle class="n" fill="${GLOW}" opacity=".35" cx="${f(x)}" cy="${f(y)}" r="${r * 2.1}"/><circle fill="${P.butter}" cx="${f(x)}" cy="${f(y)}" r="${r}"/><circle class="n" fill="#fff" cx="${f(x - r * .3)}" cy="${f(y - r * .3)}" r="${f(r * .3)}"/>`).join('');
const stars = (list, c = P.butter) => list.map(([x, y, r]) => `<path class="thin" fill="${c}" d="${star(x, y, r, r * .45)}"/>`).join('');
const twinkles = (list, c = '#fff') => list.map(([x, y, r]) => `<path class="n" fill="${c}" d="${star(x, y, r, r * .3, 4)}"/>`).join('');

const DEFS = `<defs>
  <pattern id="t-brick" width="160" height="80" patternUnits="userSpaceOnUse">
    <rect width="160" height="80" fill="${LAVB[2]}"/>
    ${[[3, 3, 74, 0], [83, 3, 74, 1], [-37, 43, 74, 0], [43, 43, 74, 0], [123, 43, 74, 1]].map(([x, y, w, k]) => `<rect x="${x}" y="${y}" width="${w}" height="34" rx="4" fill="${LAVB[k]}"/>`).join('')}
  </pattern>
  <pattern id="t-paper" width="120" height="120" patternUnits="userSpaceOnUse">
    <rect width="120" height="120" fill="${P.lav}"/>
    <path d="${star(30, 30, 9, 4)} ${star(90, 90, 9, 4)}" fill="#E9DFF1"/><circle cx="90" cy="30" r="3" fill="#C9B9DA"/><circle cx="30" cy="90" r="3" fill="#C9B9DA"/>
  </pattern>
  <pattern id="t-stripe" width="80" height="80" patternUnits="userSpaceOnUse">
    <rect width="80" height="80" fill="${P.blush}"/><rect x="0" y="0" width="30" height="80" fill="#F9E0DC"/><circle cx="55" cy="40" r="4" fill="${P.cream}"/>
  </pattern>
  <pattern id="t-carpet" width="90" height="60" patternUnits="userSpaceOnUse">
    <rect width="90" height="60" fill="${VEL}"/><path d="${star(45, 30, 8, 3.6)}" fill="${VELL}"/><circle cx="0" cy="0" r="3" fill="${VELD}"/><circle cx="90" cy="60" r="3" fill="${VELD}"/>
  </pattern>
</defs>`;

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------
const shelfBoard = (x0, x1, y, c = P.wood, d = P.woodDeep) => `${R(x0, y - 10, x1 - x0, 12, P.woodLight)}${R(x0, y + 2, x1 - x0, 16, c, ' rx="3"')}
  <path fill="${d}" d="M${x0 + 26} ${y + 18} L${x0 + 26} ${y + 46} L${x0 + 52} ${y + 18}Z"/><path fill="${d}" d="M${x1 - 26} ${y + 18} L${x1 - 26} ${y + 46} L${x1 - 52} ${y + 18}Z"/>`;
const bigLeaves = (s = 1) => `${[-70, -45, -20, 5, 30, 55, 75].map((a, i) => leaf((150 + (i % 3) * 30) * s, 44 * s, a, i % 2 ? P.leaf : P.leafDeep, 0, -110 * s)).join('')}${leaf(190 * s, 50 * s, -8, P.leafLight, 0, -110 * s)}`;
const bigPlant = (x, y, s, potc = P.terra) => at(x, y, s, `${bigLeaves()}${pot(potc, 170, 120)}`);
const frame = (x, y, w, h, inner, c = P.mustard) => `${R(x - 10, y - 10, w + 20, h + 20, c, ' rx="6"')}${R(x, y, w, h, P.cream, ' rx="3"')}${inner}`;
function floorPlanks(x0, x1, y0, y1, base, line, vx) {
  let lines = '', ticks = '', y = y0, gap = 26, row = 0;
  while (y < y1) {
    y += gap; gap *= 1.16; row++;
    lines += `M${x0} ${f(y)} L${x1} ${f(y)} `;
    for (let x = x0 + (row % 2) * 110 - 200; x < x1 + 200; x += 420 + row * 30) {
      const yTop = y - gap / 1.16, t = (yTop - 520) / (y - 520);
      ticks += `M${f(vx + (x - vx) * t)} ${f(yTop)} L${f(x)} ${f(y)} `;
    }
  }
  return `${R(x0, y0, x1 - x0, y1 - y0, base, ' class="n"')}<path ${tl(line)} d="${lines}"/><path ${tl(line)} d="${ticks}"/>`;
}

// ---------------------------------------------------------------------------
// BACK LAYER
// ---------------------------------------------------------------------------
function walls() {
  return `<rect class="n" x="${X0}" y="${Y0}" width="${ZB[1] - X0}" height="${WALL_Y - Y0}" fill="url(#t-brick)"/>
  ${R(X0, WALL_Y - 150, ZB[1] - X0, 150, P.plum, ' class="n"')}${R(X0, WALL_Y - 158, ZB[1] - X0, 14, P.plumDeep)}
  <rect class="n" x="${ZA[0]}" y="${Y0}" width="${3590 - ZA[0]}" height="${WALL_Y - Y0}" fill="url(#t-paper)"/>
  ${R(ZA[0], 700, 3590 - ZA[0], WALL_Y - 700, P.plum)}${[...Array(7)].map((_, i) => `<rect class="thin" fill="none" style="stroke:${P.plumDeep}" x="${ZA[0] + 20 + i * 110}" y="730" width="80" height="${WALL_Y - 760}" rx="6"/>`).join('')}
  ${R(ZA[0] - 4, 688, 3590 - ZA[0] + 8, 16, P.mustard, ' rx="4"')}
  <rect class="n" x="3590" y="${Y0}" width="${X1 - 3590}" height="${WALL_Y - Y0}" fill="url(#t-stripe)"/>
  ${R(3590, 760, X1 - 3590, WALL_Y - 760, P.woodLight)}${[...Array(6)].map((_, i) => `<rect class="thin" fill="none" style="stroke:${P.wood}" x="${3606 + i * 110}" y="790" width="80" height="180" rx="6"/>`).join('')}
  ${R(3586, 744, X1 - 3586, 18, P.wood, ' rx="4"')}
  ${R(X0 - 10, WALL_Y - 22, X1 - X0 + 20, 26, P.cream)}`;
}
function floors() {
  return `${floorPlanks(X0, ZB[1], WALL_Y, Y1, P.floor, P.floorLine, 600)}
  ${floorPlanks(ZA[0], X1, WALL_Y, Y1, P.floor, P.floorLine, 3400)}
  <ellipse fill="${P.lav}" cx="600" cy="1300" rx="300" ry="72"/><ellipse class="n" fill="none" cx="600" cy="1300" rx="270" ry="54" style="stroke:${P.plum};stroke-width:4;stroke-dasharray:14 12"/>${[[430, 1296], [600, 1276], [770, 1300], [520, 1326], [690, 1328]].map(([x, y]) => `<path class="n" fill="${P.butter}" d="${star(x, y, 12, 5)}"/>`).join('')}
  <path class="n" fill="url(#t-carpet)" d="M3640 ${WALL_Y + 4} L4150 ${WALL_Y + 4} L4300 ${Y1} L3560 ${Y1}Z"/><path fill="none" style="stroke:${P.mustard};stroke-width:8" d="M3640 ${WALL_Y + 4} L3560 ${Y1} M4150 ${WALL_Y + 4} L4300 ${Y1}"/>`;
}
const pillar = (x, top = Y0) => `<g>${R(x - 22, top, 44, WALL_Y - top + 4, P.wood)}<path ${tl(P.woodDeep)} d="M${x - 8} ${top} L${x - 8} ${WALL_Y - 40} M${x + 8} ${top} L${x + 8} ${WALL_Y - 40}"/>
  ${R(x - 30, WALL_Y - 40, 60, 44, P.woodLight, ' rx="4"')}</g>`;

// ---- BACKSTAGE ------------------------------------------------------------
const SHELF = { x0: 40, x1: 340, top: 180, rows: [340, 520, 700, 880] };
function propsShelf() {
  const { x0, x1, top, rows } = SHELF;
  const it = (x, y, s, art) => at(x, y, s, art);
  return `<g id="props-shelf">
  ${R(x0, top, x1 - x0, WALL_Y + 10 - top, P.plum, ' rx="8"')}${R(x0 + 18, top + 40, x1 - x0 - 36, WALL_Y - 30 - top - 40, P.plumDeep)}
  <path fill="${P.lav}" d="M${x0 - 14} ${top + 40} L${x1 + 14} ${top + 40} L${x1 + 4} ${top} L${x0 - 4} ${top}Z"/>
  ${bulbs([...Array(5)].map((_, i) => [x0 + 30 + i * 60, top + 20]), 7)}
  ${rows.map((y) => R(x0 + 18, y, x1 - x0 - 36, 16, P.lav, ' rx="3"')).join('')}
  ${it(110, rows[0], .8, crown())}${it(190, rows[0], .62, topHat())}${it(280, rows[0] + 4, .66, masquerade())}
  ${it(92, rows[1], .52, wand())}${it(170, rows[1], .56, microphone())}${it(262, rows[1], .5, bouquet())}
  ${at(190, rows[2] - 20, .5, `<g transform="rotate(-80)">${foamSword()}</g>`)}${it(112, rows[2], .6, tambourine())}${it(286, rows[2], .55, maracas())}
  ${it(100, rows[3], .5, tape(P.rose))}${it(160, rows[3] - 20, .5, tape(P.teal))}${it(250, rows[3], .6, program())}${it(306, rows[3], .5, tape(P.butter))}
  ${it(120, WALL_Y + 6, .8, `${R(-60, -90, 120, 90, P.woodDeep, ' rx="8"')}${R(-50, -78, 100, 16, P.woodLight, ' rx="4"')}<path fill="${P.butter}" class="thin" d="${star(0, -40, 18, 8)}"/>`)}
  ${it(260, WALL_Y + 6, .8, `${R(-50, -70, 100, 70, P.teal, ' rx="8"')}${R(-40, -60, 80, 14, P.mint, ' rx="4"')}${heart(0, -28, 1.2, P.rose)}`)}
  </g>`;
}
const VAN = { x0: 380, x1: 790, top: 760, mirror: [420, 260, 300, 330] };
function vanityMirror() {
  const [mx, my, mw, mh] = VAN.mirror;
  const pts = [];
  for (let i = 0; i <= 5; i++) pts.push([mx + (mw * i) / 5, my - 22]);
  for (let i = 1; i <= 4; i++) { pts.push([mx - 22, my + (mh * i) / 5]); pts.push([mx + mw + 22, my + (mh * i) / 5]); }
  return `${R(mx - 40, my - 44, mw + 80, mh + 64, P.mustard, ' rx="18"')}${R(mx - 26, my - 30, mw + 52, mh + 36, P.mustardDeep, ' rx="12"')}
  ${R(mx, my, mw, mh, P.glass, ' rx="8"')}<path class="n" fill="#fff" opacity=".6" d="M${mx + 30} ${my + mh - 20} L${mx + mw - 110} ${my + 20} L${mx + mw - 70} ${my + 20} L${mx + 70} ${my + mh - 20}Z"/>
  ${glint(`M${mx + mw - 60} ${my + 40} L${mx + mw - 30} ${my + 10}`)}
  ${bulbs(pts, 10)}
  ${at(mx + mw - 30, my + mh - 30, .5, `<path fill="${P.rose}" class="thin" d="${star(0, 0, 30, 13)}"/>`)}
  <g transform="rotate(8 ${mx + mw - 40} ${my + 40})">${R(mx + mw - 74, my + 6, 64, 76, P.white, ' rx="3"')}${R(mx + mw - 68, my + 12, 52, 48, P.sky)}<circle fill="${P.butter}" class="thin" cx="${mx + mw - 42}" cy="${my + 36}" r="12"/><path class="d" d="M${mx + mw - 48} ${my + 38} Q${mx + mw - 42} ${my + 44} ${mx + mw - 36} ${my + 38}"/></g>
  <g transform="rotate(-10 ${mx + 50} ${my + 40})">${R(mx + 12, my + 8, 64, 76, P.white, ' rx="3"')}${R(mx + 18, my + 14, 52, 48, P.blush)}<path fill="${P.berry}" class="thin" d="${star(mx + 44, my + 38, 16, 7)}"/></g>
  ${heart(mx + mw / 2 + 20, my + mh / 2 + 10, 2.2, P.rose, 'n')}<path class="n" fill="none" style="stroke:${P.roseDeep};stroke-width:4" d="M${mx + mw / 2 - 40} ${my + mh / 2 + 70} q14 -18 28 0 q14 18 28 0"/>
  ${R(mx + 20, my + mh - 60, 40, 50, P.cream, ' rx="3" transform="rotate(-8 440 540)"')}<circle fill="${P.peach}" class="thin" cx="${mx + 38}" cy="${my + mh - 40}" r="12" transform="rotate(-8 440 540)"/>`;
}
function backstageWall() {
  // posters of past shows (pictures only), a clock, bunting, a hanging bulb, and the fly-rail ropes by the stage
  const poster = (x, y, bg, inner) => `${R(x - 8, y - 8, 116, 156, P.woodDeep, ' rx="6"')}${R(x, y, 100, 140, bg, ' rx="3"')}${inner}`;
  const flags = [...Array(9)].map((_, i) => { const x = 820 + i * 60, y = 200 + Math.sin(i / 8 * Math.PI) * 30; return `<path fill="${[P.rose, P.butter, P.teal, P.lav][i % 4]}" class="thin" d="M${x} ${f(y)} L${x + 44} ${f(y + 2)} L${x + 22} ${f(y + 40)}Z"/>`; }).join('');
  return `${poster(860, 330, P.butter, `<path fill="${P.plum}" d="M870 470 Q910 400 950 470Z"/><circle fill="${P.cream}" class="thin" cx="910" cy="380" r="24"/><circle class="ink" cx="902" cy="378" r="3"/><circle class="ink" cx="918" cy="378" r="3"/><path class="d" d="M902 390 Q910 398 918 390"/>${stars([[944, 350, 10], [878, 350, 7]], P.rose)}`)}
  ${poster(1010, 300, P.teal, `<path fill="${P.butter}" d="M1060 336 A34 34 0 1 0 1060 404 A26 26 0 1 1 1060 336Z"/>${stars([[1086, 350, 8], [1030, 410, 6], [1090, 410, 7]])}<path fill="${P.tealDeep}" class="n" d="M1010 440 L1110 420 L1110 440Z"/>`)}
  <path class="d" d="M800 196 Q1070 260 1340 196"/>${flags}
  <circle fill="${P.cream}" cx="620" cy="130" r="40"/><circle fill="none" cx="620" cy="130" r="40"/><path class="d" d="M620 130 L620 104 M620 130 L640 138"/>
  ${at(250, -150, 1, bulb(200))}
`;
}

// ---- STAGE ------------------------------------------------------------------
const PRO = { x0: 1370, x1: 2790, ox0: 1460, ox1: 2700, top: 150 };
const CX = (PRO.ox0 + PRO.ox1) / 2;                 // 2080: stage centre
const DECK = { back: WALL_Y, lip: 1180, face: 1250 };
const CURTAIN_Y = 1092;                              // the curtain line (bottom of the curtain)
const BD = { x0: 1500, x1: 2660, y0: 196, y1: 1004 };   // backdrop cloth
const PIT = { x0: 1450, x1: 2710, rail: 1372 };
function stageBox() {
  // dark stage box behind the opening: back wall, side masking flats, fly bar with ropes, the deck
  const flats = [PRO.ox0, PRO.ox1 - 70].map((x) => `${R(x, PRO.top, 70, WALL_Y - PRO.top, STAGED)}<path ${tl('#46374D')} d="M${x + 20} ${PRO.top} L${x + 20} ${WALL_Y} M${x + 50} ${PRO.top} L${x + 50} ${WALL_Y}"/>`).join('');
  const deck = floorPlanks(PRO.x0, PRO.x1, DECK.back, DECK.lip, P.woodLight, P.wood, CX);
  const foot = [...Array(15)].map((_, i) => [PRO.ox0 + 40 + i * ((PRO.ox1 - PRO.ox0 - 80) / 14), DECK.lip - 2]);
  return `${R(PRO.ox0, PRO.top - 10, PRO.ox1 - PRO.ox0, WALL_Y - PRO.top + 10, STAGE)}
  <path ${tl(STAGED)} d="${[...Array(12)].map((_, i) => `M${PRO.ox0 + 50 + i * 100} ${PRO.top} L${PRO.ox0 + 50 + i * 100} ${WALL_Y}`).join(' ')}"/>
  ${[1560, 1800, 2360, 2600].map((x) => `<path class="d" style="stroke:#8E7A94;stroke-width:4" d="M${x} ${PRO.top} L${x} ${BD.y0 - 12}"/>`).join('')}
  ${flats}${deck}
  <path class="n" fill="${P.ink}" opacity=".12" d="M${PRO.ox0} ${DECK.back} L${PRO.ox1} ${DECK.back} L${PRO.ox1} ${DECK.back + 30} L${PRO.ox0} ${DECK.back + 30}Z"/>
  ${R(PRO.x0 - 20, DECK.lip - 4, PRO.x1 - PRO.x0 + 40, 14, P.mustard, ' rx="5"')}
  ${foot.map(([x, y]) => `<path fill="${P.charHi}" d="M${f(x - 16)} ${y + 2} L${f(x - 12)} ${y - 14} L${f(x + 12)} ${y - 14} L${f(x + 16)} ${y + 2}Z"/><ellipse class="n" fill="${GLOW}" opacity=".45" cx="${f(x)}" cy="${y - 20}" rx="26" ry="10"/><ellipse fill="${LAMP}" cx="${f(x)}" cy="${y - 15}" rx="10" ry="4"/>`).join('')}
  ${R(PRO.x0 - 20, DECK.lip + 10, PRO.x1 - PRO.x0 + 40, DECK.face - DECK.lip - 10, P.plum)}
  ${[...Array(12)].map((_, i) => `<path class="thin" fill="${P.butter}" d="${star(PRO.x0 + 60 + i * 120, DECK.lip + 44, 13, 6)}"/>`).join('')}
  ${R(PRO.x0 - 20, DECK.face - 6, PRO.x1 - PRO.x0 + 40, 12, P.mustardDeep, ' rx="4"')}
  ${R(PRO.x0 - 20, DECK.face + 6, PRO.x1 - PRO.x0 + 40, Y1 - DECK.face, STAGED)}
  <path ${tl('#46374D')} d="${[...Array(6)].map((_, i) => `M${PIT.x0 - 60} ${DECK.face + 40 + i * 50} L${PIT.x1 + 60} ${DECK.face + 40 + i * 50}`).join(' ')}"/>
  ${[1560, 1900, 2250, 2600].map((x) => `<ellipse class="n" fill="${GLOW}" opacity=".25" cx="${x}" cy="${DECK.face + 70}" rx="90" ry="34"/><path fill="${P.mustard}" class="thin" d="M${x - 14} ${DECK.face + 20} L${x + 14} ${DECK.face + 20} L${x + 8} ${DECK.face + 40} L${x - 8} ${DECK.face + 40}Z"/>`).join('')}`;
}
function proscenium() {
  // the two side columns with marquee bulbs, down to the stage lip
  const col = (x0, x1) => {
    const cx = (x0 + x1) / 2, pts = [...Array(14)].map((_, i) => [cx, 210 + i * 64]);
    return `${R(x0, PRO.top - 20, x1 - x0, DECK.lip - PRO.top + 20, P.lav)}${R(x0 + 14, PRO.top, x1 - x0 - 28, DECK.lip - PRO.top - 30, P.plum, ' rx="10"')}
    ${R(x0 - 10, DECK.lip - 60, x1 - x0 + 20, 60, P.oat, ' rx="6"')}<path ${tl(P.warmGrey)} d="M${x0} ${DECK.lip - 30} L${x1} ${DECK.lip - 30}"/>
    ${bulbs(pts, 9)}`;
  };
  return col(PRO.x0, PRO.ox0) + col(PRO.ox1, PRO.x1);
}
function header() {
  // front layer: the top of the proscenium (hides the valance top and the fly bar)
  const { x0, x1 } = PRO;
  const arc = [...Array(11)].map((_, i) => { const a = Math.PI * (i / 10); return [f(CX - Math.cos(a) * 190), f(40 - Math.sin(a) * 150)]; });
  const row = [...Array(22)].map((_, i) => [x0 + 50 + i * ((x1 - x0 - 100) / 21), 118]);
  return `<g id="header">
  <path fill="${P.plum}" d="M${CX - 220} 40 Q${CX - 220} -130 ${CX} -150 Q${CX + 220} -130 ${CX + 220} 40Z"/>
  ${R(x0 - 20, Y0, x1 - x0 + 40, 150 - Y0, P.lav)}${R(x0 - 20, Y0, x1 - x0 + 40, 60, P.plum)}
  <path ${tl('#C4B4D6')} d="${[...Array(4)].map((_, i) => `M${x0} ${-60 + i * 44} L${x1} ${-60 + i * 44}`).join(' ')}"/>
  <path fill="${P.plum}" d="M${CX - 250} 60 Q${CX - 250} -100 ${CX} -118 Q${CX + 250} -100 ${CX + 250} 60Z"/>
  ${bulbs(arc, 10)}
  <path fill="${P.mustard}" d="${star(CX, -20, 96, 42)}"/><path ${tl(P.mustardDeep, 'stroke-width:4')} d="M${CX - 30} -34 L${CX} -60 L${CX + 30} -34"/>
  <circle class="ink" cx="${CX - 22}" cy="-14" r="6"/><circle class="ink" cx="${CX + 22}" cy="-14" r="6"/><path class="d" d="M${CX - 14} 6 Q${CX} 18 ${CX + 14} 6"/><ellipse class="n" fill="${P.rose}" opacity=".5" cx="${CX - 38}" cy="2" rx="9" ry="6"/><ellipse class="n" fill="${P.rose}" opacity=".5" cx="${CX + 38}" cy="2" rx="9" ry="6"/>
  ${R(x0 - 26, 88, x1 - x0 + 52, 60, P.mustard, ' rx="10"')}${R(x0 - 10, 100, x1 - x0 + 20, 36, P.mustardDeep, ' rx="6"')}
  ${bulbs(row, 9)}
  ${[x0 + 20, x1 - 20].map((x) => `<path fill="${P.plum}" d="M${x - 70} ${Y0} L${x + 70} ${Y0} L${x + 70} 88 L${x - 70} 88Z"/><circle fill="${P.butter}" class="thin" cx="${x}" cy="10" r="30"/>${heart(x, 12, 1.6, P.rose)}`).join('')}
  </g>`;
}
// Spotlight rail: a truss pipe under the header; lamps are the `spotlight` piece.
const SPOT = { y: 176, rail: [1480, 2680], rest: [1720, 2080, 2440] };
function spotRail() {
  const [a, b] = SPOT.rail;
  return `${R(a - 20, SPOT.y - 12, b - a + 40, 20, P.charHi, ' rx="10"')}${R(a - 20, SPOT.y + 16, b - a + 40, 10, P.char, ' rx="5"')}
  <path ${tl(P.char, 'stroke-width:3.5')} d="${[...Array(24)].map((_, i) => { const x = a + i * ((b - a) / 23); return `M${f(x)} ${SPOT.y + 8} L${f(x + 25)} ${SPOT.y + 18}`; }).join(' ')}"/>
  ${[a - 10, b + 10].map((x) => `<path class="d" style="stroke-width:5" d="M${x} ${SPOT.y - 12} L${x} 150"/>`).join('')}`;
}
function spotlight(color, x = SPOT.rest[0]) {
  // one lamp hanging from the rail (clamp + yoke + can), aimed down; with a colour: the cone and its pool
  const y = SPOT.y + 14, can = `<g transform="translate(${x} ${y + 60}) rotate(0)">
    ${R(-44, -34, 88, 68, P.charDeep, ' rx="14"')}${R(-48, 24, 96, 20, P.charHi, ' rx="8"')}<path ${tl(P.char, 'stroke-width:4')} d="M-30 -20 L30 -20 M-30 -6 L30 -6"/>
    <ellipse fill="${color ? LIGHTS[color] : P.warmGreyDeep}" cx="0" cy="44" rx="40" ry="10"/></g>`;
  const yoke = `${R(x - 10, y - 26, 20, 26, P.char, ' rx="4"')}<path fill="none" style="stroke:${P.char};stroke-width:10" d="M${x - 56} ${y + 60} L${x - 56} ${y + 6} L${x + 56} ${y + 6} L${x + 56} ${y + 60}"/><path fill="none" d="M${x - 61} ${y + 60} L${x - 61} ${y + 1} L${x + 61} ${y + 1} L${x + 61} ${y + 60}"/>`;
  if (!color) return yoke + can;
  const c = LIGHTS[color], top = y + 104, bot = DECK.lip - 44;
  const cone = `<path class="n" fill="${c}" opacity=".32" d="M${x - 40} ${top} L${x + 40} ${top} L${x + 190} ${bot} L${x - 190} ${bot}Z"/>
    <path class="n" fill="${c}" opacity=".3" d="M${x - 26} ${top} L${x + 26} ${top} L${x + 120} ${bot} L${x - 120} ${bot}Z"/>
    <ellipse class="n" fill="${c}" opacity=".55" cx="${x}" cy="${bot}" rx="200" ry="42"/><ellipse class="n" fill="#fff" opacity=".35" cx="${x}" cy="${bot}" rx="120" ry="24"/>`;
  return cone + yoke + can + `<ellipse class="n" fill="${c}" opacity=".6" cx="${x}" cy="${y + 104}" rx="56" ry="16"/>`;
}
// Backdrops (scenery flats) hang from the fly bar: one piece, a variant per scene.
function cloth(inner, id) {
  const { x0, x1, y0, y1 } = BD;
  return `<clipPath id="bd-${id}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="6"/></clipPath>
  <g clip-path="url(#bd-${id})">${inner}</g><rect fill="none" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="6"/>
  ${R(x0 - 30, y0 - 18, x1 - x0 + 60, 26, P.woodDeep, ' rx="10"')}${[x0 + 60, (x0 + x1) / 2, x1 - 60].map((x) => `<circle fill="${P.steelDeep}" class="thin" cx="${x}" cy="${y0 - 5}" r="7"/>`).join('')}`;
}
function backdropCastle() {
  const { x0, x1, y0, y1 } = BD, cx = CX;
  const tower = (x, w, top, bot, roofc) => `${R(x - w / 2, top, w, bot - top, P.blush)}${[...Array(Math.floor(w / 28))].map((_, i) => R(x - w / 2 + 4 + i * 28, top - 20, 18, 22, P.blush)).join('')}
    <path fill="${roofc}" d="M${x - w / 2 - 12} ${top - 18} L${x} ${top - w * 1.25} L${x + w / 2 + 12} ${top - 18}Z"/><path class="d" d="M${x} ${top - w * 1.25} L${x} ${top - w * 1.25 - 40}"/><path fill="${P.berry}" class="thin" d="M${x} ${top - w * 1.25 - 40} L${x + 34} ${top - w * 1.25 - 30} L${x} ${top - w * 1.25 - 20}Z"/>
    <path fill="${P.plumDeep}" d="M${x - 12} ${top + 70} L${x - 12} ${top + 50} Q${x} ${top + 34} ${x + 12} ${top + 50} L${x + 12} ${top + 70}Z"/>`;
  return cloth(`${R(x0, y0, x1 - x0, y1 - y0, P.sky)}
    ${[[P.rose, 250], [P.butter, 228], [P.mint, 206], [P.skyDeep, 184]].map(([c, r]) => `<path class="n" fill="none" style="stroke:${c};stroke-width:22" d="M${x0 + 80} ${y0 + 460} A${r} ${r} 0 0 1 ${x0 + 80 + 2 * r} ${y0 + 460}"/>`).join('')}
    ${[[1640, 300, 1], [2440, 260, .8], [2280, 420, .6]].map(([x, y, s]) => at(x, y, s, `<path class="n" fill="#fff" d="${scallop(0, 0, 120, 44, 9, 22, 180, 360, false)} L120 18 Q0 34 -120 18Z"/>`)).join('')}
    <circle fill="${P.butter}" cx="2530" cy="330" r="50"/>
    <path fill="${P.leafLight}" d="M${x0} ${y1} L${x0} 760 Q1760 640 2080 740 Q2400 650 ${x1} 740 L${x1} ${y1}Z"/>
    ${tower(cx - 190, 90, 520, 880, P.plum)}${tower(cx + 190, 90, 520, 880, P.plum)}
    ${R(cx - 170, 600, 340, 290, P.blush)}${[...Array(12)].map((_, i) => R(cx - 170 + i * 29, 580, 18, 22, P.blush)).join('')}
    ${tower(cx, 120, 440, 620, P.berry)}
    <path fill="${P.woodDeep}" d="M${cx - 50} 890 L${cx - 50} 790 Q${cx} 740 ${cx + 50} 790 L${cx + 50} 890Z"/><path class="d" d="M${cx} 760 L${cx} 890"/>
    ${[cx - 110, cx + 110].map((x) => `<path fill="${P.sky}" d="M${x - 18} 720 L${x - 18} 690 Q${x} 668 ${x + 18} 690 L${x + 18} 720Z"/>`).join('')}
    ${heart(cx, 660, 1.6, P.rose)}
    <path fill="${P.sage}" d="M${x0} ${y1} L${x0} 880 Q1800 820 2080 890 Q2360 830 ${x1} 870 L${x1} ${y1}Z"/>
    <path fill="${P.butter}" d="M${cx - 40} 890 L${cx + 40} 890 L${cx + 110} ${y1} L${cx - 110} ${y1}Z"/>
    ${[[1580, 900, 1], [1680, 930, .8], [2520, 910, 1], [2610, 940, .8]].map(([x, y, s]) => at(x, y, s, `<rect fill="${P.woodDeep}" x="-8" y="-60" width="16" height="60"/><path fill="${P.leaf}" d="${scallop(0, -96, 50, 46, 9, 10)}"/>`)).join('')}
    ${[[1760, 950], [1840, 980], [2330, 960], [2420, 985]].map(([x, y], i) => `<circle class="thin" fill="${[P.rose, P.butter, P.lav, P.rose][i]}" cx="${x}" cy="${y}" r="9"/>`).join('')}`, 'castle');
}
function backdropSea() {
  const { x0, x1, y0, y1 } = BD;
  const fish = (x, y, c, s = 1, flip = 1) => at(x, y, s, `<g transform="scale(${flip} 1)"><path fill="${c}" d="M-40 0 Q-10 -30 30 0 Q-10 30 -40 0Z"/><path fill="${c}" d="M30 0 L56 -20 L52 0 L56 20Z"/><circle class="ink" cx="-22" cy="-4" r="4"/><path class="d" d="M-4 -14 Q4 0 -4 14"/></g>`);
  const weed = (x, h, c) => `<path fill="${c}" d="M${x - 12} ${y1} Q${x - 30} ${y1 - h * .3} ${x - 6} ${y1 - h * .5} Q${x - 26} ${y1 - h * .75} ${x} ${y1 - h} Q${x + 18} ${y1 - h * .72} ${x + 6} ${y1 - h * .5} Q${x + 26} ${y1 - h * .3} ${x + 12} ${y1}Z"/>`;
  const coral = (x, c) => `<path fill="${c}" d="M${x - 10} ${y1} L${x - 8} ${y1 - 60} L${x - 40} ${y1 - 110} L${x - 28} ${y1 - 116} L${x - 4} ${y1 - 80} L${x} ${y1 - 150} L${x + 14} ${y1 - 150} L${x + 12} ${y1 - 90} L${x + 36} ${y1 - 124} L${x + 48} ${y1 - 116} L${x + 14} ${y1 - 56} L${x + 12} ${y1}Z"/>`;
  return cloth(`${R(x0, y0, x1 - x0, y1 - y0, P.sky)}${R(x0, y0 + 260, x1 - x0, y1 - y0, P.skyDeep)}${R(x0, y0 + 540, x1 - x0, y1 - y0, P.teal)}
    <path class="n" fill="#fff" opacity=".18" d="M1640 ${y0} L1720 ${y0} L1900 ${y1} L1760 ${y1}Z M2200 ${y0} L2260 ${y0} L2420 ${y1} L2320 ${y1}Z"/>
    ${[[1600, 360, 18], [1630, 300, 11], [2560, 420, 16], [2590, 360, 10], [2080, 330, 12], [2110, 280, 8], [1860, 500, 9]].map(([x, y, r]) => `<circle class="thin" fill="${P.glass}" cx="${x}" cy="${y}" r="${r}"/><circle class="n" fill="#fff" cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .28}"/>`).join('')}
    ${fish(1760, 420, P.butter, 2.2)}${fish(2360, 540, P.terra, 1.9, -1)}${fish(1940, 640, P.lav, 1.6, -1)}${fish(2520, 330, P.rose, 1.5)}${fish(2230, 770, P.butter, 1.3)}${fish(1640, 700, P.mint, 1.2, -1)}
    ${at(2060, 610, 1.1, `<path fill="${P.leafLight}" d="M-70 10 Q-70 -60 0 -64 Q70 -60 70 10Z"/><path ${tl(P.leaf, 'stroke-width:5')} d="M-40 -40 L-20 0 M0 -60 L0 6 M40 -40 L20 0 M-66 -10 L66 -10"/><path fill="none" d="M-70 10 Q-70 -60 0 -64 Q70 -60 70 10Z"/>
      <path fill="${P.sage}" d="M60 -10 Q110 -20 112 10 Q100 34 64 20Z"/><circle class="ink" cx="96" cy="0" r="4"/><path class="d" d="M88 14 Q96 18 104 12"/>
      <path fill="${P.sage}" d="M-50 10 L-66 34 L-40 22Z M40 10 L60 34 L30 22Z M-64 -20 L-96 -6 L-62 0Z M64 -30 L90 -46 L70 -16Z"/>`)}
    <path fill="${P.lav}" d="M2420 640 Q2420 590 2460 590 Q2500 590 2500 640 Z"/><path class="d" d="M2430 640 q-6 30 4 50 M2450 640 q6 30 -4 60 M2470 640 q-6 30 4 50 M2490 640 q6 30 -2 44"/><circle class="ink" cx="2448" cy="620" r="3"/><circle class="ink" cx="2472" cy="620" r="3"/>
    <path fill="${P.butter}" d="M${x0} ${y1} L${x0} 930 Q1800 880 2080 930 Q2380 880 ${x1} 930 L${x1} ${y1}Z"/><path fill="${P.oat}" class="n" d="M${x0} ${y1} L${x0} 975 Q2080 945 ${x1} 975 L${x1} ${y1}Z"/>
    ${weed(1560, 300, P.leafDeep)}${weed(1600, 220, P.leaf)}${weed(2600, 320, P.leaf)}${weed(2560, 240, P.leafDeep)}${weed(2000, 160, P.leafLight)}
    ${coral(1720, P.rose)}${coral(2420, P.terra)}${coral(2250, P.blush)}${coral(1840, P.lav)}${weed(2320, 280, P.leafDeep)}${weed(1680, 200, P.leafLight)}
    ${[[1640, 520], [1650, 470], [1662, 430], [2500, 720], [2508, 670], [2520, 628], [2140, 560], [2150, 520]].map(([x, y], i) => `<circle class="thin" fill="${P.glass}" cx="${x}" cy="${y}" r="${7 + (i % 3) * 3}"/>`).join('')}
    ${at(1900, 860, 1, `<path fill="${P.rose}" d="M-40 0 Q-44 -60 0 -64 Q44 -60 40 0 Q30 -10 20 0 Q10 -10 0 0 Q-10 -10 -20 0 Q-30 -10 -40 0Z"/><circle class="ink" cx="-12" cy="-34" r="4"/><circle class="ink" cx="12" cy="-34" r="4"/><path class="d" d="M-8 -20 Q0 -14 8 -20"/>`)}
    <path fill="${P.rose}" class="thin" d="${star(1900, 960, 26, 12)}"/><path fill="${P.cream}" d="M2140 990 Q2140 950 2170 950 Q2200 950 2200 990Z"/><path class="d" d="M2154 988 L2160 958 M2170 988 L2170 954 M2186 988 L2180 958"/>`, 'sea');
}
function backdropStars() {
  const { x0, x1, y0, y1 } = BD;
  const house = (x, y, c) => `${R(x - 40, y - 60, 80, 60, c)}<path fill="${P.nightSkyDeep}" d="M${x - 50} ${y - 58} L${x} ${y - 100} L${x + 50} ${y - 58}Z"/>${R(x - 24, y - 44, 18, 18, LAMP, ' class="thin"')}${R(x + 8, y - 44, 18, 18, LAMP, ' class="thin"')}<ellipse class="n" fill="${GLOW}" opacity=".3" cx="${x}" cy="${y - 36}" rx="60" ry="30"/>`;
  return cloth(`${R(x0, y0, x1 - x0, y1 - y0, P.nightSky)}
    ${[[1600, 300, 14], [1720, 420, 9], [1860, 280, 12], [1990, 380, 8], [2160, 300, 10], [2300, 440, 13], [2600, 520, 9], [1560, 560, 8], [2230, 560, 7], [1900, 520, 10], [2460, 260, 8]].map(([x, y, r]) => `<path class="thin" fill="${P.butter}" d="${star(x, y, r, r * .45)}"/>`).join('')}
    ${twinkles([[1660, 480, 8], [2060, 250, 7], [2380, 330, 9], [2520, 620, 7], [1800, 600, 6]])}
    <path fill="${P.butter}" d="M2440 320 A92 92 0 1 0 2530 460 A76 76 0 1 1 2440 320Z"/><path class="d" d="M2432 400 Q2442 410 2452 400"/><ellipse class="n" fill="${P.rose}" opacity=".5" cx="2420" cy="420" rx="9" ry="6"/>
    <path class="n" fill="#fff" opacity=".7" d="M1640 380 L1780 330 L1784 336 L1644 390Z"/><path class="thin" fill="${P.butter}" d="${star(1790, 330, 16, 7)}"/>
    <path fill="#4A5285" d="M${x0} ${y1} L${x0} 780 Q1760 700 2000 790 Q2300 720 ${x1} 780 L${x1} ${y1}Z"/>
    <path fill="${P.nightSkyDeep}" d="M${x0} ${y1} L${x0} 880 Q1900 820 2200 890 Q2450 850 ${x1} 870 L${x1} ${y1}Z"/>
    ${house(1720, 880, '#6C6A9A')}${house(2380, 890, '#7A6C9A')}${house(2100, 850, '#646A9C')}`, 'stars');
}
function backdropCity() {
  const { x0, x1, y0, y1 } = BD;
  const bldg = (x, w, top, c, cols = 2) => {
    let win = '';
    const rows = Math.floor((y1 - top - 60) / 70);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) win += R(x + 16 + k * ((w - 32) / cols) + 4, top + 30 + r * 70, (w - 32) / cols - 12, 34, (r + k) % 3 ? P.butter : P.cream, ' class="thin" rx="3"');
    return `${R(x, top, w, y1 - top, c)}${R(x - 8, top - 14, w + 16, 16, c, ' rx="4"')}${win}`;
  };
  return cloth(`${R(x0, y0, x1 - x0, y1 - y0, P.peach)}${R(x0, y0, x1 - x0, 150, P.blush)}${R(x0, y0, x1 - x0, 70, P.lav)}
    <circle fill="${P.butter}" cx="1960" cy="330" r="80"/>
    ${[[1640, 330, .9], [2480, 300, 1]].map(([x, y, s]) => at(x, y, s, `<path class="n" fill="#fff" d="${scallop(0, 0, 120, 44, 9, 22, 180, 360, false)} L120 18 Q0 34 -120 18Z"/>`)).join('')}
    ${bldg(1510, 150, 560, P.lav)}${bldg(1670, 130, 440, P.blue)}${bldg(1810, 170, 620, P.rose, 3)}${bldg(1990, 110, 380, P.sage)}
    ${bldg(2110, 160, 520, P.mustard, 3)}${bldg(2280, 120, 460, P.teal)}${bldg(2410, 140, 600, P.lav)}${bldg(2560, 110, 500, P.rose)}
    <path class="d" d="M2045 380 L2045 300"/><circle fill="${P.berry}" class="thin" cx="2045" cy="296" r="8"/>
    ${[[1760, 280], [1790, 300], [2340, 330]].map(([x, y]) => `<path class="d" d="M${x - 12} ${y} q6 -8 12 0 q6 -8 12 0"/>`).join('')}
    ${R(x0, y1 - 40, x1 - x0, 40, P.charHi)}<path ${tl(P.butter, 'stroke-width:6;stroke-dasharray:40 30')} d="M${x0} ${y1 - 20} L${x1} ${y1 - 20}"/>`, 'city');
}
function trapdoor(open) {
  const x0 = 2330, x1 = 2510, y0 = 1112, y1 = 1160;
  const hole = `M${x0} ${y0} L${x1} ${y0} L${x1 + 10} ${y1} L${x0 - 10} ${y1}Z`;
  if (!open) return `<path fill="${P.wood}" d="${hole}"/><path ${tl(P.woodDeep)} d="M${x0 + 40} ${y0} L${x0 + 36} ${y1} M${x0 + 90} ${y0} L${x0 + 90} ${y1} M${x1 - 40} ${y0} L${x1 - 36} ${y1}"/>
    <ellipse fill="none" style="stroke:${P.steelDeep};stroke-width:5" cx="${(x0 + x1) / 2}" cy="${(y0 + y1) / 2}" rx="14" ry="7"/><path fill="${P.butter}" class="thin" d="${star(x1 - 20, y0 + 24, 9, 4)}"/>`;
  return `<path fill="${P.ink}" d="${hole}"/><path class="n" fill="${P.plumDeep}" d="M${x0 + 12} ${y0 + 8} L${x1 - 12} ${y0 + 8} L${x1 - 4} ${y1 - 6} L${x0 + 4} ${y1 - 6}Z"/>
    <path class="n" fill="${P.lav}" opacity=".35" d="M${x0 + 20} ${y0 + 4} L${x1 - 20} ${y0 + 4} L${x1 + 30} ${y0 - 150} L${x0 - 30} ${y0 - 150}Z"/>
    ${R(x0 + 54, y0 - 34, 10, 60, P.woodLight, ' rx="4"')}${R(x0 + 116, y0 - 34, 10, 60, P.woodLight, ' rx="4"')}${R(x0 + 54, y0 - 20, 72, 8, P.woodLight, ' rx="3"')}${R(x0 + 54, y0 + 2, 72, 8, P.woodLight, ' rx="3"')}
    <path fill="${P.woodDeep}" d="M${x0 - 10} ${y1} L${x1 + 10} ${y1} L${x1 + 16} ${y1 + 10} L${x0 - 16} ${y1 + 10}Z"/>
    ${twinkles([[x0 + 30, y0 - 60, 14], [x1 - 30, y0 - 90, 11], [x0 + 100, y0 - 130, 12], [x1 - 10, y0 - 30, 8]], P.butter)}${twinkles([[x0 + 70, y0 - 100, 7], [x1 - 60, y0 - 50, 6]], '#fff')}`;}

// ---- the curtain: two halves and a valance, each open / half / closed ----
const CW = (PRO.ox1 - PRO.ox0) / 2 + 8;              // one half's closed width (overlaps at the centre)
const TIE_Y = 640;
function curtainHalf(side, state) {
  // side -1 = left (outer edge at ox0), +1 = right; u = distance from the outer edge
  const xo = side < 0 ? PRO.ox0 : PRO.ox1, d = side < 0 ? 1 : -1, X = (u) => f(xo + d * u);
  const W = CW, top = PRO.top - 30, bot = CURTAIN_Y;
  const [uT, uTie, uB] = { closed: [W, W, W], half: [W, W * .36, W * .48], open: [W * .32, W * .13, W * .24] }[state];
  const n = Math.max(5, Math.round(uB / 42));
  const hemPts = [...Array(n + 1)].map((_, i) => uB - (uB * i) / n);
  let hem = '';
  for (let i = 0; i < n; i++) hem += ` Q${X((hemPts[i] + hemPts[i + 1]) / 2)} ${bot + 16} ${X(hemPts[i + 1])} ${bot}`;
  const inner = state === 'closed' ? `L${X(uB)} ${bot}` : `Q${X(uT)} ${f(TIE_Y - 170)} ${X(uTie)} ${TIE_Y} Q${X(uTie * .92)} ${f(TIE_Y + 160)} ${X(uB)} ${bot}`;
  const shape = `M${X(0)} ${top} L${X(uT)} ${top} ${inner}${hem} L${X(0)} ${top}Z`;
  // folds: velvet shade bands (the one shade tone) and fold lines
  const folds = [...Array(n)].map((_, i) => {
    const v = (i + .5) / n, v2 = (i + .78) / n;
    const path = (vv) => state === 'closed' ? `M${X(vv * uT)} ${top} L${X(vv * uB)} ${bot}` : `M${X(vv * uT)} ${top} Q${X(vv * uT)} ${f(TIE_Y - 170)} ${X(vv * uTie)} ${TIE_Y} Q${X(vv * uTie * .92)} ${f(TIE_Y + 160)} ${X(vv * uB)} ${bot}`;
    return { band: path(v), line: path(v2) };
  });
  const fringe = [...Array(n)].map((_, i) => `M${X(hemPts[i])} ${bot} Q${X((hemPts[i] + hemPts[i + 1]) / 2)} ${bot + 16} ${X(hemPts[i + 1])} ${bot}`).join(' ');
  const tie = state === 'closed' ? '' : `<path fill="${P.mustard}" d="M${X(-6)} ${TIE_Y - 12} Q${X(uTie * .6)} ${TIE_Y - 24} ${X(uTie + 12)} ${TIE_Y - 4} Q${X(uTie * .6)} ${TIE_Y + 18} ${X(-6)} ${TIE_Y + 10}Z"/>
    <circle fill="${P.mustard}" cx="${X(uTie + 8)}" cy="${TIE_Y + 4}" r="11"/><path fill="${P.mustard}" d="M${X(uTie + 2)} ${TIE_Y + 12} L${X(uTie + 14)} ${TIE_Y + 12} L${X(uTie + 20)} ${TIE_Y + 60} L${X(uTie - 4)} ${TIE_Y + 60}Z"/><path ${tl(P.mustardDeep, 'stroke-width:3')} d="M${X(uTie + 4)} ${TIE_Y + 26} L${X(uTie + 2)} ${TIE_Y + 56} M${X(uTie + 12)} ${TIE_Y + 26} L${X(uTie + 14)} ${TIE_Y + 56}"/>`;
  return `<clipPath id="cur-${side}-${state}"><path d="${shape}"/></clipPath>
    <path fill="${VEL}" d="${shape}"/>
    <g clip-path="url(#cur-${side}-${state})"><path class="n" fill="none" style="stroke:${VELD};stroke-width:${f(Math.max(10, uB / n * .42))}" d="${folds.map((q) => q.band).join(' ')}"/>
      <path class="n" fill="none" style="stroke:${VELL};stroke-width:6;opacity:.7" d="${folds.map((q) => q.line).join(' ')}"/></g>
    <path fill="none" d="${shape}"/>
    <path fill="none" style="stroke:${P.mustard};stroke-width:12" d="${fringe}"/><path class="d" d="${fringe}"/>${tie}`;
}
function valance(state) {
  const x0 = PRO.ox0 - 30, x1 = PRO.ox1 + 30, top = 100, drop = { open: 290, half: 400, closed: 520 }[state];
  const n = 5, w = (x1 - x0) / n;
  let d = `M${x0} ${top} L${x1} ${top} L${x1} ${drop - 50}`;
  for (let i = 0; i < n; i++) { const a = x1 - i * w, b = a - w; d += ` Q${f((a + b) / 2)} ${drop + 34} ${f(b)} ${drop - 50}`; }
  d += 'Z';
  let fringe = '';
  for (let i = 0; i < n; i++) { const a = x1 - i * w, b = a - w; fringe += `M${f(a)} ${drop - 46} Q${f((a + b) / 2)} ${drop + 38} ${f(b)} ${drop - 46} `; }
  const tassels = [...Array(n + 1)].map((_, i) => { const x = x0 + i * w; return `<circle fill="${P.mustard}" cx="${f(x)}" cy="${drop - 46}" r="12"/><path fill="${P.mustard}" d="M${f(x - 8)} ${drop - 38} L${f(x + 8)} ${drop - 38} L${f(x + 14)} ${drop + 6} L${f(x - 14)} ${drop + 6}Z"/><path ${tl(P.mustardDeep, 'stroke-width:3')} d="M${f(x - 4)} ${drop - 30} L${f(x - 6)} ${drop + 2} M${f(x + 4)} ${drop - 30} L${f(x + 6)} ${drop + 2}"/>`; }).join('');
  const swagLines = [...Array(n)].map((_, i) => { const a = x1 - i * w, b = a - w; return [.35, .7].map((k) => `M${f(a - 10)} ${f(top + (drop - top) * k * .6)} Q${f((a + b) / 2)} ${f(top + (drop - top) * k + 40)} ${f(b + 10)} ${f(top + (drop - top) * k * .6)}`).join(' '); }).join(' ');
  return `<clipPath id="val-${state}"><path d="${d}"/></clipPath><path fill="${VEL}" d="${d}"/>
    <g clip-path="url(#val-${state})"><path class="n" fill="none" style="stroke:${VELD};stroke-width:14" d="${swagLines}"/></g><path fill="none" d="${d}"/>
    <path fill="none" style="stroke:${P.mustard};stroke-width:14" d="${fringe}"/><path class="d" d="${fringe}"/>
    ${R(x0 - 10, top - 14, x1 - x0 + 20, 26, P.mustard, ' rx="12"')}${tassels}`;
}
// Mic stand at the stage lip, with the big red record dot on a box at the stand.
const MIC = { x: CX, base: 1166 };
function micStand(rec) {
  // the pole with the mic at a kid's mouth height, and a big record box on the floor beside the base
  const { x, base } = MIC, top = 900, bx = x + 64, by = base - 58;
  return `<ellipse class="n" fill="${P.ink}" opacity=".12" cx="${x + 30}" cy="${base + 4}" rx="110" ry="12"/>
  <path fill="${P.char}" d="M${x - 70} ${base} L${x - 8} ${base - 30} L${x + 8} ${base - 30} L${x + 70} ${base} L${x + 56} ${base + 6} L${x} ${base - 18} L${x - 56} ${base + 6}Z"/>
  ${R(x - 8, top, 16, base - top, P.charHi, ' rx="6"')}${R(x - 12, 990, 24, 18, P.char, ' rx="5"')}
  <path class="d" style="stroke:${P.ink};stroke-width:5" d="M${x + 6} ${top + 10} Q${x + 40} ${top + 60} ${x + 20} ${top + 130} Q${x + 10} ${top + 200} ${bx - 20} ${by + 10}"/>
  <g transform="translate(${x} ${top}) rotate(-14)">${R(-9, -54, 18, 54, P.charDeep, ' rx="8"')}<circle fill="${P.steel}" cx="0" cy="-70" r="22"/><path ${tl(P.steelDeep, 'stroke-width:3.5')} d="M-16 -80 L16 -80 M-20 -70 L20 -70 M-16 -58 L16 -58"/><circle fill="none" cx="0" cy="-70" r="22"/>${R(-11, -58, 22, 9, P.butter, ' rx="4"')}</g>
  ${R(bx - 50, by - 36, 100, 94, P.cream, ' rx="18"')}${R(bx - 42, by - 28, 84, 78, P.oat, ' rx="14"')}
  ${rec ? `<circle class="n" fill="${P.berry}" opacity=".35" cx="${bx}" cy="${by + 11}" r="52"/>` : ''}<circle fill="${rec ? '#E5484D' : P.berry}" cx="${bx}" cy="${by + 11}" r="30"/><circle class="n" fill="#fff" opacity=".7" cx="${bx - 10}" cy="${by + 1}" r="7"/>
  ${rec ? [0, 1, 2, 3, 4].map((i) => R(bx + 60 + i * 14, by + 40 - [16, 28, 40, 24, 12][i], 10, [16, 28, 40, 24, 12][i], [P.leafLight, P.leafLight, P.butter, P.leafLight, P.leafLight][i], ' class="thin" rx="3"')).join('') : ''}`;
}
// ---- orchestra pit (pieces in the mid layer, behind the pit rail) ----
const PIANO = { x0: 1500, x1: 1760, top: 1196 }, DRUM = { x: 1990 }, XYL = { x0: 2170, x1: 2410, y: 1276 }, GTR = { x: 2560 };
function piano() {
  const { x0, x1, top } = PIANO, keys = 8, kw = (x1 - x0 - 40) / keys;
  return `${R(x0, top, x1 - x0, 320, P.teal, ' rx="14"')}${R(x0 - 10, top - 14, x1 - x0 + 20, 24, P.tealDeep, ' rx="8"')}
  ${R(x0 + 20, top + 30, x1 - x0 - 40, 34, P.mint, ' rx="6"')}${[...Array(3)].map((_, i) => `<path class="thin" fill="${P.butter}" d="${star(x0 + 70 + i * 60, top + 47, 10, 4.5)}"/>`).join('')}
  ${R(x0 + 14, top + 72, x1 - x0 - 28, 64, P.cream, ' rx="4"')}
  ${[...Array(keys)].map((_, i) => `<rect fill="${[P.white, P.cream][i % 2 ? 1 : 0]}" x="${f(x0 + 20 + i * kw)}" y="${top + 78}" width="${f(kw)}" height="54" rx="3"/>`).join('')}
  ${[0, 1, 3, 4, 5].map((i) => R(x0 + 20 + (i + 1) * kw - 9, top + 78, 18, 30, P.charDeep, ' rx="3"')).join('')}
  ${R(x0 - 6, top + 136, x1 - x0 + 12, 18, P.tealDeep, ' rx="6"')}
  <path fill="${P.cream}" class="thin" d="M${x0 + 160} ${top - 14} L${x0 + 190} ${top - 60} L${x0 + 240} ${top - 50} L${x0 + 214} ${top - 14}Z"/><path class="d" d="M${x0 + 196} ${top - 44} L${x0 + 226} ${top - 38} M${x0 + 192} ${top - 32} L${x0 + 222} ${top - 26}"/>`;
}
function drums() {
  const x = DRUM.x;
  return `<path class="d" style="stroke-width:5" d="M${x + 110} 1372 L${x + 110} 1170 M${x + 80} 1372 L${x + 110} 1300 L${x + 140} 1372"/>
  <ellipse fill="${P.butter}" cx="${x + 110}" cy="1166" rx="54" ry="12"/><circle fill="${P.mustardDeep}" class="thin" cx="${x + 110}" cy="1164" r="6"/>
  <circle fill="${P.rose}" cx="${x}" cy="1340" r="84"/><circle fill="${P.cream}" cx="${x}" cy="1340" r="64"/><path fill="${P.berry}" class="thin" d="${star(x, 1340, 30, 13)}"/>
  <path fill="${P.lav}" d="M${x - 130} 1250 L${x - 50} 1250 L${x - 50} 1296 Q${x - 90} 1306 ${x - 130} 1296Z"/><ellipse fill="${P.cream}" cx="${x - 90}" cy="1250" rx="40" ry="10"/><path class="d" d="M${x - 118} 1260 L${x - 108} 1296 M${x - 72} 1260 L${x - 62} 1296"/>
  <path fill="${P.lav}" d="M${x + 44} 1226 L${x + 106} 1226 L${x + 106} 1266 Q${x + 75} 1274 ${x + 44} 1266Z"/><ellipse fill="${P.cream}" cx="${x + 75}" cy="1226" rx="31" ry="8"/>
  <path class="d" style="stroke:${P.woodDeep};stroke-width:7" d="M${x - 60} 1214 L${x - 20} 1250 M${x + 30} 1196 L${x + 60} 1224"/>`;
}
function xylophone() {
  const { x0, x1, y } = XYL, n = 8, bw = (x1 - x0) / n, cols = [P.berry, P.terra, P.mustard, P.lemon, P.leafLight, P.teal, P.blue, P.lav];
  return `<path class="d" style="stroke-width:6" d="M${x0 + 20} ${y + 20} L${x0} 1400 M${x1 - 20} ${y + 20} L${x1} 1400"/>
  ${R(x0 - 10, y + 8, x1 - x0 + 20, 20, P.woodDeep, ' rx="8"')}
  ${cols.map((c, i) => { const h = 104 - i * 8; return `<rect fill="${c}" x="${f(x0 + i * bw + 3)}" y="${f(y - h / 2)}" width="${f(bw - 6)}" height="${h}" rx="6"/><circle class="n" fill="${P.ink}" opacity=".35" cx="${f(x0 + i * bw + bw / 2)}" cy="${f(y - h / 2 + 10)}" r="3"/><circle class="n" fill="${P.ink}" opacity=".35" cx="${f(x0 + i * bw + bw / 2)}" cy="${f(y + h / 2 - 10)}" r="3"/>`; }).join('')}
  <g transform="translate(${x1 + 16} ${y - 70}) rotate(30)">${R(-4, 0, 8, 80, P.woodLight, ' rx="4"')}<circle fill="${P.rose}" cx="0" cy="0" r="12"/></g>`;
}
function guitar() {
  const x = GTR.x;
  return `<path class="d" style="stroke-width:6" d="M${x - 50} 1400 L${x} 1330 L${x + 50} 1400 M${x} 1330 L${x} 1250"/>
  <path fill="${P.woodDeep}" d="M${x - 9} 1070 L${x + 9} 1070 L${x + 8} 1250 L${x - 8} 1250Z"/>${R(x - 16, 1030, 32, 48, P.woodDark, ' rx="8"')}${[1044, 1062].map((y) => `<circle fill="${P.cream}" class="thin" cx="${x - 20}" cy="${y}" r="5"/><circle fill="${P.cream}" class="thin" cx="${x + 20}" cy="${y}" r="5"/>`).join('')}
  <path fill="${P.terra}" d="M${x} 1210 C${x - 60} 1206 ${x - 66} 1256 ${x - 44} 1280 C${x - 90} 1300 ${x - 86} 1380 ${x} 1386 C${x + 86} 1380 ${x + 90} 1300 ${x + 44} 1280 C${x + 66} 1256 ${x + 60} 1206 ${x} 1210Z"/>
  <circle fill="${P.woodDark}" cx="${x}" cy="1290" r="22"/>${R(x - 30, 1340, 60, 12, P.woodDark, ' rx="4"')}
  <path class="n" fill="none" style="stroke:${P.cream};stroke-width:2.5" d="M${x - 5} 1076 L${x - 5} 1344 M${x} 1076 L${x} 1344 M${x + 5} 1076 L${x + 5} 1344"/>
  <path fill="${P.butter}" class="thin" d="${star(x + 40, 1330, 12, 5)}"/>`;
}
function pitRail() {
  const { x0, x1, rail } = PIT;
  const posts = [...Array(9)].map((_, i) => x0 - 40 + i * ((x1 - x0 + 80) / 8));
  return `${R(x0 - 60, rail + 22, x1 - x0 + 120, Y1 - rail, P.plum)}${[...Array(8)].map((_, i) => `<rect class="thin" fill="none" style="stroke:${P.plumDeep}" x="${f(x0 - 40 + i * ((x1 - x0 + 80) / 8) + 14)}" y="${rail + 44}" width="${f((x1 - x0 + 80) / 8 - 28)}" height="${Y1 - rail - 60}" rx="8"/>`).join('')}
  ${posts.map((x) => `${R(x - 10, rail - 8, 20, 40, P.mustard, ' rx="5"')}<circle fill="${P.mustard}" cx="${f(x)}" cy="${rail - 12}" r="12"/>`).join('')}
  ${R(x0 - 70, rail + 6, x1 - x0 + 140, 22, P.mustard, ' rx="10"')}${glint(`M${x0 - 40} ${rail + 12} L${x1 + 40} ${rail + 12}`, 4)}
  ${[...Array(8)].map((_, i) => `<path class="thin" fill="${P.butter}" d="${star(f(x0 + 40 + i * ((x1 - x0 - 80) / 7)), rail + 90, 14, 6)}"/>`).join('')}`;
}
// ---- effects machines (pieces) ----
function fogMachine(on) {
  const x = 1560, y = 1170;
  const puffs = on ? [[x + 120, y - 60, 60], [x + 210, y - 80, 70], [x + 310, y - 60, 60], [x + 170, y - 20, 50], [x + 260, y - 24, 56]].map(([a, b, r]) => `<path class="n" fill="#fff" opacity=".75" d="${scallop(a, b, r, r * .62, 8, 12)}"/>`).join('') : '';
  return `${puffs}${R(x - 60, y - 70, 120, 70, P.teal, ' rx="14"')}${R(x + 60, y - 50, 30, 24, P.charHi, ' rx="6"')}${R(x - 44, y - 58, 44, 30, P.mint, ' rx="6"')}
  <path class="thin" fill="#fff" d="${scallop(x - 22, y - 43, 14, 9, 6, 4)}"/><circle fill="${on ? P.leafLight : P.warmGreyDeep}" class="thin" cx="${x + 26}" cy="${y - 44}" r="9"/>${R(x - 52, y - 6, 16, 10, P.char, ' rx="3"')}${R(x + 36, y - 6, 16, 10, P.char, ' rx="3"')}`;
}
function confettiCannon(fire) {
  const x = 2610, y = 1170;
  const bits = fire ? [...Array(34)].map((_, i) => { const a = -2.5 + (i / 33) * 1.5, r = 110 + (i * 53) % 280; const bx = x - 60 + Math.cos(a) * r, by = y - 170 + Math.sin(a) * r; const c = [P.rose, P.butter, P.teal, P.lav, P.leafLight, P.berry][i % 6];
    return i % 3 ? `<rect class="thin" fill="${c}" x="${f(bx)}" y="${f(by)}" width="24" height="13" rx="3" transform="rotate(${(i * 47) % 180} ${f(bx + 12)} ${f(by + 6)})"/>` : `<path class="thin" fill="${c}" d="${star(f(bx), f(by), 15, 6.5)}"/>`; }).join('') : '';
  return `${bits}<g transform="rotate(-38 ${x} ${y - 60})">${R(x - 40, y - 130, 80, 150, P.rose, ' rx="16"')}${R(x - 48, y - 140, 96, 26, P.berry, ' rx="10"')}${[0, 1, 2].map((i) => `<path class="thin" fill="${P.butter}" d="${star(x, y - 90 + i * 34, 10, 4.5)}"/>`).join('')}</g>
  <path fill="${P.woodDeep}" d="M${x - 70} ${y} L${x - 40} ${y - 70} L${x + 40} ${y - 70} L${x + 70} ${y}Z"/><circle fill="${P.woodDark}" cx="${x - 40}" cy="${y - 8}" r="20"/><circle fill="${P.woodDark}" cx="${x + 40}" cy="${y - 8}" r="20"/><circle fill="${P.woodLight}" class="thin" cx="${x - 40}" cy="${y - 8}" r="7"/><circle fill="${P.woodLight}" class="thin" cx="${x + 40}" cy="${y - 8}" r="7"/>`;
}
function snowMachine(on) {
  const x = 2560, y = 330;
  const flakes = on ? [[x - 20, y + 120], [x + 40, y + 190], [x - 60, y + 260], [x + 10, y + 330], [x + 70, y + 290], [x - 30, y + 420], [x + 50, y + 470], [x - 80, y + 520], [x + 20, y + 580], [x - 10, y + 220]]
    .map(([a, b], i) => `<g class="n" transform="translate(${a} ${b})"><path fill="none" style="stroke:#fff;stroke-width:4" d="M-${8 + i % 3 * 2} 0 L${8 + i % 3 * 2} 0 M0 -${8 + i % 3 * 2} L0 ${8 + i % 3 * 2} M-6 -6 L6 6 M-6 6 L6 -6"/></g>`).join('') : '';
  return `<path class="d" style="stroke-width:5" d="M${x - 40} ${SPOT.y + 10} L${x - 40} ${y - 50} M${x + 40} ${SPOT.y + 10} L${x + 40} ${y - 50}"/>
  ${R(x - 70, y - 60, 140, 80, P.sky, ' rx="16"')}${R(x - 50, y + 16, 100, 18, P.skyDeep, ' rx="6"')}<path class="thin" fill="none" style="stroke:#fff;stroke-width:4" d="M${x - 16} ${y - 20} L${x + 16} ${y - 20} M${x} ${y - 36} L${x} ${y - 4} M${x - 11} ${y - 31} L${x + 11} ${y - 9} M${x - 11} ${y - 9} L${x + 11} ${y - 31}"/>
  <circle fill="${on ? P.leafLight : P.warmGreyDeep}" class="thin" cx="${x + 46}" cy="${y - 36}" r="8"/>${flakes}`;
}
function thunderSheet(shake) {
  const x = 1250, top = 360, bot = 760;
  const w = shake ? ` Q${x - 50} ${top + 100} ${x - 70} ${top + 200} Q${x - 50} ${top + 300} ${x - 70} ${bot}` : ` L${x - 70} ${bot}`;
  const e = shake ? ` Q${x + 90} ${top + 300} ${x + 70} ${top + 200} Q${x + 90} ${top + 100} ${x + 70} ${top}` : ` L${x + 70} ${top}`;
  return `<path class="d" style="stroke:${P.woodDark};stroke-width:6" d="M${x - 40} ${Y0} L${x - 40} ${top} M${x + 40} ${Y0} L${x + 40} ${top}"/>
  <path fill="${P.steel}" d="M${x - 70} ${top}${w} L${x + 70} ${bot}${e}Z"/><path ${tl(P.steelDeep, 'stroke-width:4')} d="M${x - 40} ${top + 60} Q${x} ${top + 80} ${x + 40} ${top + 60} M${x - 40} ${top + 200} Q${x} ${top + 220} ${x + 40} ${top + 200} M${x - 40} ${top + 330} Q${x} ${top + 350} ${x + 40} ${top + 330}"/>
  ${R(x - 76, top - 10, 152, 20, P.woodDeep, ' rx="8"')}<path fill="${P.butter}" class="thin" d="M${x + 6} ${top + 110} L${x + 34} ${top + 110} L${x + 16} ${top + 160} L${x + 36} ${top + 160} L${x - 12} ${top + 240} L${x} ${top + 180} L${x - 20} ${top + 180}Z"/>
  ${shake ? `<path class="d" style="stroke:${P.butter};stroke-width:6" d="M${x - 110} ${top + 120} l-20 20 l14 6 l-20 22 M${x + 110} ${top + 180} l20 20 l-14 6 l20 22"/>` : ''}
  <g transform="translate(${x} ${bot + 40}) rotate(-20)">${R(-6, -40, 12, 60, P.woodLight, ' rx="5"')}<ellipse fill="${P.oat}" cx="0" cy="-48" rx="20" ry="16"/></g>`;
}

// ---- BACKSTAGE furniture ----------------------------------------------------
function vanityTable() {
  const { x0, x1, top } = VAN;
  const heads = (x) => `${R(x - 8, top - 70, 16, 70, P.woodDark, ' rx="5"')}<ellipse fill="${P.woodDark}" cx="${x}" cy="${top - 2}" rx="36" ry="8"/><ellipse fill="${P.oat}" cx="${x}" cy="${top - 118}" rx="40" ry="50"/>
    <path fill="${P.butter}" d="${scallop(x, top - 136, 50, 46, 11, 12, 180, 360, false)} Q${x + 58} ${top - 60} ${x + 44} ${top - 50} Q${x + 34} ${top - 100} ${x} ${top - 140} Q${x - 34} ${top - 100} ${x - 44} ${top - 50} Q${x - 58} ${top - 60} ${x - 50} ${top - 136}Z"/>
    <path class="d" d="M${x - 24} ${top - 150} q10 -12 20 -2 M${x + 4} ${top - 160} q10 -12 20 -2"/>`;
  return `${R(x0, top, x1 - x0, 24, P.woodLight, ' rx="6"')}${R(x0 + 14, top + 24, x1 - x0 - 28, 90, P.rose)}${R(x0 + 30, top + 36, (x1 - x0 - 72) / 2, 66, P.blush, ' rx="8"')}${R(x0 + 42 + (x1 - x0 - 72) / 2, top + 36, (x1 - x0 - 72) / 2, 66, P.blush, ' rx="8"')}
  <circle fill="${P.woodLight}" class="thin" cx="${x0 + 30 + (x1 - x0 - 72) / 4}" cy="${top + 69}" r="8"/><circle fill="${P.woodLight}" class="thin" cx="${x1 - 30 - (x1 - x0 - 72) / 4}" cy="${top + 69}" r="8"/>
  <path class="d" style="stroke-width:6" d="M${x0 + 26} ${top + 114} L${x0 + 20} ${WALL_Y + 14} M${x1 - 26} ${top + 114} L${x1 - 20} ${WALL_Y + 14}"/>
  ${at(x0 + 50, top, 1, `${R(-24, -30, 48, 30, P.lav, ' rx="6"')}${[-14, 0, 14].map((x, i) => `<rect fill="${[P.berry, P.teal, P.butter][i]}" class="thin" x="${x - 5}" y="-54" width="10" height="26" rx="4"/>`).join('')}`)}
  ${at(x0 + 118, top, 1, `<ellipse fill="${P.rose}" cx="0" cy="-12" rx="30" ry="12"/><ellipse fill="${P.blush}" cx="0" cy="-16" rx="20" ry="6"/><circle class="n" fill="#fff" cx="-6" cy="-20" r="6"/>`)}
  ${at(x0 + 180, top, 1, `${R(-26, -18, 52, 18, P.cream, ' rx="5"')}${[[-14, P.berry], [0, P.butter], [14, P.teal], [-7, P.leafLight], [7, P.lav]].map(([x, c], i) => `<circle class="thin" fill="${c}" cx="${x}" cy="${i < 3 ? -24 : -34}" r="6"/>`).join('')}`)}
  ${at(x0 + 240, top, .8, HH.jar(46, 60, P.glass, P.rose, .5, P.butter))}
  ${heads(x1 - 40)}`;
}
function rackCostume(x, top, kind, c, d) {
  // a costume hanging on a rack: a hook, a hanger and a simple silhouette per kind
  const h = `<path class="d" d="M${x} ${top} Q${x} ${top - 14} ${x + 10} ${top - 14}"/><path fill="${P.woodLight}" d="M${x - 40} ${top + 26} L${x} ${top + 6} L${x + 40} ${top + 26} L${x + 34} ${top + 30} L${x} ${top + 14} L${x - 34} ${top + 30}Z"/>`;
  const y = top + 20;
  const body = {
    dress: `<path fill="${c}" d="M${x - 26} ${y} L${x + 26} ${y} L${x + 30} ${y + 70} L${x + 62} ${y + 230} ${[...Array(6)].map((_, i) => `Q${f(x + 62 - 124 * (i + .5) / 6)} ${y + 246} ${f(x + 62 - 124 * (i + 1) / 6)} ${y + 230}`).join(' ')} L${x - 30} ${y + 70}Z"/><path fill="${d}" d="M${x - 30} ${y + 66} L${x + 30} ${y + 66} L${x + 30} ${y + 80} L${x - 30} ${y + 80}Z"/>`,
    coat: `<path fill="${c}" d="M${x - 32} ${y} L${x + 32} ${y} L${x + 40} ${y + 200} L${x + 4} ${y + 200} L${x} ${y + 60} L${x - 4} ${y + 200} L${x - 40} ${y + 200}Z"/><path fill="${c}" d="M${x - 32} ${y} L${x - 56} ${y + 16} L${x - 66} ${y + 150} L${x - 44} ${y + 150} L${x - 40} ${y + 50}Z M${x + 32} ${y} L${x + 56} ${y + 16} L${x + 66} ${y + 150} L${x + 44} ${y + 150} L${x + 40} ${y + 50}Z"/><circle fill="${d}" class="thin" cx="${x - 12}" cy="${y + 60}" r="5"/><circle fill="${d}" class="thin" cx="${x - 12}" cy="${y + 100}" r="5"/>`,
    tutu: `<path fill="${c}" d="M${x - 24} ${y} L${x + 24} ${y} L${x + 26} ${y + 80} L${x - 26} ${y + 80}Z"/><path fill="${d}" d="${scallop(x, y + 80, 70, 50, 12, 6, 0, 180, false)}Z"/>`,
    robe: `<path fill="${c}" d="M${x - 30} ${y} L${x + 30} ${y} L${x + 54} ${y + 240} L${x - 54} ${y + 240}Z"/><path fill="${d}" class="thin" d="${star(x + 10, y + 120, 14, 6)}"/><path fill="${d}" class="thin" d="${star(x - 20, y + 190, 10, 4.5)}"/>`,
    cape: `<path fill="${c}" d="M${x - 24} ${y} L${x + 24} ${y} L${x + 60} ${y + 200} L${x + 30} ${y + 190} L${x} ${y + 206} L${x - 30} ${y + 190} L${x - 60} ${y + 200}Z"/><path fill="${d}" class="thin" d="M${x - 4} ${y + 60} L${x + 16} ${y + 60} L${x + 4} ${y + 90} L${x + 18} ${y + 90} L${x - 10} ${y + 136} L${x - 2} ${y + 104} L${x - 14} ${y + 104}Z"/>`,
  }[kind];
  return h + body;
}
function rackFrame(x0, x1, top, floor, wheels = true) {
  return `<path class="d" style="stroke:${P.steelDeep};stroke-width:10" d="M${x0} ${floor - (wheels ? 24 : 4)} L${x0} ${top} L${x1} ${top} L${x1} ${floor - (wheels ? 24 : 4)} M${x0 - 34} ${floor - 24} L${x0 + 34} ${floor - 24} M${x1 - 34} ${floor - 24} L${x1 + 34} ${floor - 24}"/>
  <path fill="none" style="stroke:${P.ink};stroke-width:4.5" d="M${x0 - 5} ${floor - 30} L${x0 - 5} ${top - 5} L${x1 + 5} ${top - 5} L${x1 + 5} ${floor - 30}"/>
  ${R(x0 - 10, top - 14, x1 - x0 + 20, 20, P.steel, ' rx="10"')}${wheels ? [x0 - 26, x0 + 26, x1 - 26, x1 + 26].map((x) => `<circle fill="${P.charHi}" cx="${x}" cy="${floor - 12}" r="12"/>`).join('') : ''}`;
}
const RACK_A = { x0: 820, x1: 1150, top: 470, floor: WALL_Y + 20 };
const RACK_B = { x0: 690, x1: 960, top: 830, floor: 1330 };
function rackA() {
  const { x0, x1, top, floor } = RACK_A;
  const list = [['dress', P.rose, P.butter], ['coat', P.blue, P.butter], ['tutu', P.blush, P.rose], ['robe', P.plum, P.butter], ['coat', P.denimDeep, P.butter], ['dress', P.sky, P.butter]];
  return rackFrame(x0, x1, top, floor) + list.map(([k, c, d], i) => rackCostume(x0 + 36 + i * ((x1 - x0 - 72) / 5), top, k, c, d)).join('')
    + `${at(x0 + 40, top - 14, .5, crown())}${at(x0 + 130, top - 14, .5, topHat())}${at(x1 - 60, top - 14, .5, HH.jar(40, 50, P.lav, P.plum, 0))}`;
}
function rackB() {
  const { x0, x1, top, floor } = RACK_B;
  const list = [['cape', P.teal, P.butter], ['cape', P.blueDeep, P.butter], ['coat', P.charDeep, P.berry], ['dress', P.butter, P.mustard], ['cape', '#EE9A55', P.cream]];
  return rackFrame(x0, x1, top, floor) + list.map(([k, c, d], i) => rackCostume(x0 + 30 + i * ((x1 - x0 - 60) / 4), top, k, c, d)).join('');
}
function changeScreen() {
  const x0 = 1060, x1 = 1350, floor = 1270, top = 810, n = 3, w = (x1 - x0) / n;
  return `${[...Array(n)].map((_, i) => { const a = x0 + i * w, sk = i === 1 ? 0 : 10; return `<path fill="${i === 1 ? P.lav : P.blush}" d="M${a + 4} ${top + sk} Q${a + w / 2} ${top - 30 + sk} ${a + w - 4} ${top + sk} L${a + w - 4} ${floor - 40} L${a + 4} ${floor - 40}Z"/>
    <rect class="thin" fill="none" style="stroke:${i === 1 ? P.plum : P.rose}" x="${a + 18}" y="${top + 30}" width="${w - 36}" height="${floor - top - 90}" rx="10"/>${i === 1 ? `<path class="thin" fill="${P.butter}" d="${star(a + w / 2, top + 150, 24, 10)}"/>` : heart(a + w / 2, top + 160, 1.4, i ? P.rose : P.roseDeep)}`; }).join('')}
  ${[x0 + 4, x0 + w, x0 + 2 * w, x1 - 4].map((x) => R(x - 6, top - 10, 12, floor - top + 10, P.woodDeep, ' rx="5"')).join('')}
  ${at(x0 + w + 20, top - 6, 1, `<path fill="${P.berry}" d="M0 0 Q-20 30 -10 70 L10 70 Q20 30 0 0Z"/>`)}${at(x0 + 2 * w - 10, top - 6, 1, `<path fill="${P.teal}" d="M0 0 Q30 20 26 60 L8 64 Q10 30 0 0Z"/>`)}`;
}
function trunk(open) {
  const x0 = 80, x1 = 330, floor = 1300, top = 1150;
  const base = `${R(x0, top, x1 - x0, floor - top, P.terra, ' rx="10"')}${R(x0, top + 50, x1 - x0, 16, P.terraDeep)}${[x0 + 30, x1 - 44].map((x) => R(x, top, 14, floor - top, P.mustard, ' class="thin"')).join('')}
    ${R((x0 + x1) / 2 - 16, top + 6, 32, 34, P.mustard, ' rx="5"')}<circle class="ink" cx="${(x0 + x1) / 2}" cy="${top + 24}" r="4"/>${stars([[x0 + 80, top + 100, 12], [x1 - 80, top + 110, 9]])}`;
  if (!open) return `${base}<path fill="${P.terra}" d="M${x0 - 4} ${top + 4} L${x0 - 4} ${top - 30} Q${(x0 + x1) / 2} ${top - 76} ${x1 + 4} ${top - 30} L${x1 + 4} ${top + 4}Z"/>${[x0 + 30, x1 - 44].map((x) => `<path class="thin" fill="${P.mustard}" d="M${x} ${top + 2} L${x} ${top - 40} L${x + 14} ${top - 44} L${x + 14} ${top + 2}Z"/>`).join('')}`;
  const spill = `<path fill="${P.berry}" d="M${x0 + 20} ${top} Q${x0 + 40} ${top - 50} ${x0 + 90} ${top - 30} L${x0 + 110} ${top + 6}Z"/><path fill="${P.teal}" d="${scallop(x0 + 150, top - 20, 40, 26, 8, 6, 180, 360, false)}Z"/>
    ${at(x1 - 50, top - 10, .5, crown())}<path fill="${P.lav}" d="M${x1 - 10} ${top - 4} Q${x1 + 30} ${top + 40} ${x1 + 16} ${top + 90} L${x1 + 2} ${top + 86} Q${x1 + 8} ${top + 40} ${x1 - 20} ${top + 4}Z"/>
    ${twinkles([[x0 + 60, top - 80, 12], [x1 - 20, top - 90, 10], [x0 + 150, top - 110, 9]], P.butter)}`;
  return `<path fill="${P.terraDeep}" d="M${x0 - 4} ${top} L${x0 + 6} ${top - 150} Q${(x0 + x1) / 2} ${top - 180} ${x1 - 6} ${top - 150} L${x1 + 4} ${top}Z"/><path fill="${P.woodDark}" d="M${x0 + 16} ${top - 4} L${x0 + 24} ${top - 136} L${x1 - 24} ${top - 136} L${x1 - 16} ${top - 4}Z"/>${spill}${base}`;
}

// ---- AUDIENCE --------------------------------------------------------------
const SEATX = [2910, 3090, 3270, 3450];
const ROWS = [{ y: 1076, layer: 'counter' }, { y: 1206, layer: 'mid' }, { y: 1336, layer: 'front' }];   // back row first
const BAL = { x0: 2800, x1: 3580, floor: 540, rail: 468, seats: [2900, 3050, 3200], y: 520 };
function seat(x, y, back = VEL) {
  return `${R(x - 66, y - 190, 132, 180, back, ' rx="40"')}<path ${tl(VELD, 'stroke-width:6')} d="M${x - 30} ${y - 170} L${x - 30} ${y - 30} M${x} ${y - 176} L${x} ${y - 30} M${x + 30} ${y - 170} L${x + 30} ${y - 30}"/>
  <path fill="${P.butter}" class="thin" d="${star(x, y - 196, 11, 5)}"/>
  ${R(x - 72, y - 16, 144, 36, VELL, ' rx="14"')}${R(x - 84, y - 70, 20, 110, P.woodDeep, ' rx="8"')}${R(x + 64, y - 70, 20, 110, P.woodDeep, ' rx="8"')}
  ${R(x - 50, y + 20, 100, 16, P.woodDark, ' rx="5"')}`;
}
function riser(y, h) { return `${R(2800, y + 30, 790, h, P.plumDeep)}${R(2796, y + 26, 798, 14, P.mustard, ' rx="4"')}`; }
function row(i) { const r = ROWS[i]; return `${riser(r.y, 150)}${SEATX.map((x) => seat(x, r.y)).join('')}`; }
function balconyBack() {
  // behind the balcony: the back wall shows; balcony seats (back layer) sit on the balcony floor
  return `${R(BAL.x0 - 20, BAL.floor - 16, BAL.x1 - BAL.x0 + 40, 40, P.plumDeep)}
  ${BAL.seats.map((x) => seat(x, BAL.y)).join('')}
  ${[2830, 3560].map((x) => `${R(x - 20, 600, 40, WALL_Y - 600, P.mustard)}${R(x - 30, 590, 60, 24, P.mustardDeep, ' rx="6"')}${R(x - 30, WALL_Y - 30, 60, 30, P.mustardDeep, ' rx="6"')}`).join('')}
  ${[2980, 3380].map((x) => `${R(x - 10, 760, 20, 30, P.mustard, ' rx="4"')}<path fill="${LAMP}" d="M${x - 30} 760 L${x + 30} 760 L${x + 20} 720 L${x - 20} 720Z"/><ellipse class="n" fill="${GLOW}" opacity=".35" cx="${x}" cy="740" rx="70" ry="50"/>`).join('')}
  ${at(3180, 870, 1, `${R(-60, -130, 120, 130, P.woodDeep, ' rx="10"')}${R(-50, -120, 48, 120, P.wood, ' rx="4"')}${R(2, -120, 48, 120, P.wood, ' rx="4"')}<circle fill="${P.mustard}" class="thin" cx="-8" cy="-60" r="5"/><circle fill="${P.mustard}" class="thin" cx="8" cy="-60" r="5"/>${R(-40, -170, 80, 34, P.leafLight, ' rx="8"')}<circle fill="#fff" cx="-10" cy="-160" r="6"/><path class="d" style="stroke:#fff" d="M-10 -154 L-6 -140 L4 -146 M-6 -150 L6 -150 M-6 -140 L-16 -130 M-6 -140 L4 -130"/><path class="thin" fill="#fff" d="M14 -160 L28 -153 L14 -146Z"/>`)}`;
}
function balconyFront() {
  // counter layer: the fascia with the gold rail and bulbs, and the booth console on the balcony
  const { x0, x1, rail } = BAL;
  const pts = [...Array(12)].map((_, i) => [x0 + 40 + i * ((x1 - x0 - 80) / 11), rail + 80]);
  return `${R(x0 - 20, rail, x1 - x0 + 40, 150, P.plum, ' rx="10"')}${R(x0 - 30, rail - 14, x1 - x0 + 60, 26, P.mustard, ' rx="12"')}
  <path ${tl(P.plumDeep, 'stroke-width:6')} d="M${x0} ${rail + 40} ${[...Array(8)].map((_, i) => { const a = x0 + i * ((x1 - x0) / 8), b = a + (x1 - x0) / 8; return `Q${f((a + b) / 2)} ${rail + 70} ${f(b)} ${rail + 40}`; }).join(' ')}"/>
  ${bulbs(pts, 8)}${R(x0 - 20, rail + 138, x1 - x0 + 40, 16, P.mustardDeep, ' rx="6"')}`;
}
const BOOTH = { x0: 3280, x1: 3570, top: 370 };
function boothConsole() {
  const { x0, x1, top } = BOOTH;
  return `${R(x0, top, x1 - x0, BAL.rail - top + 10, P.charHi, ' rx="12"')}${R(x0 - 8, top - 10, x1 - x0 + 16, 22, P.char, ' rx="10"')}
  ${[...Array(10)].map((_, i) => `<circle class="thin" fill="${[P.leafLight, P.butter, P.rose][i % 3]}" cx="${x0 + 30 + i * 26}" cy="${top + 30}" r="6"/>`).join('')}
  ${[...Array(5)].map((_, i) => `${R(x0 + 36 + i * 50, top + 44, 8, 36, P.charDeep, ' rx="4"')}${R(x0 + 30 + i * 50, top + 50 + (i * 13) % 24, 20, 12, P.cream, ' class="thin" rx="3"')}`).join('')}`;
}
// the effects buttons on the console (pieces): big round picture buttons
const FXB = { y: 330, xs: [3312, 3386, 3460, 3534] };
const FX_ICONS = {
  fog: (x, y) => `<path class="n" fill="#fff" d="${scallop(x, y + 2, 16, 10, 6, 5)}"/>`,
  confetti: (x, y) => `<path class="n" fill="${P.butter}" d="${star(x - 6, y - 4, 8, 3.5)}"/><rect class="n" fill="#fff" x="${x + 2}" y="${y - 2}" width="10" height="6" rx="2" transform="rotate(30 ${x + 7} ${y + 1})"/><circle class="n" fill="${P.mint}" cx="${x - 2}" cy="${y + 10}" r="4"/>`,
  snow: (x, y) => `<path class="n" fill="none" style="stroke:#fff;stroke-width:4" d="M${x - 12} ${y} L${x + 12} ${y} M${x} ${y - 12} L${x} ${y + 12} M${x - 8} ${y - 8} L${x + 8} ${y + 8} M${x - 8} ${y + 8} L${x + 8} ${y - 8}"/>`,
  thunder: (x, y) => `<path class="n" fill="${P.butter}" d="M${x - 2} ${y - 16} L${x + 10} ${y - 16} L${x + 2} ${y - 2} L${x + 12} ${y - 2} L${x - 8} ${y + 18} L${x - 2} ${y + 4} L${x - 12} ${y + 4}Z"/>`,
};
const FX_COL = { fog: [P.teal, P.tealDeep], confetti: [P.rose, P.roseDeep], snow: [P.blue, P.blueDeep], thunder: [P.plum, P.plumDeep] };
function fxButton(kind, i, down) {
  const x = FXB.xs[i], y = FXB.y + (down ? 8 : 0), [c, d] = FX_COL[kind];
  return `${R(x - 30, FXB.y + 18, 60, 22, P.char, ' rx="8"')}${down ? '' : R(x - 26, y + 8, 52, 18, d, ' rx="8"')}<ellipse fill="${c}" cx="${x}" cy="${y + 8}" rx="28" ry="24"/>${down ? `<ellipse class="n" fill="${P.butter}" opacity=".35" cx="${x}" cy="${y + 8}" rx="44" ry="38"/>` : ''}${FX_ICONS[kind](x, y + 6)}`;
}
// the tape boombox on the console (piece): idle / play / rec
const BOOM = { x: 3420, y: 370 - 10 };
function boombox(state) {
  const { x, y } = BOOM, spin = state !== 'idle';
  const reel = (cx) => `<circle fill="#fff" class="thin" cx="${cx}" cy="${y - 64}" r="11"/>${spin ? `<path class="d" d="M${cx - 7} ${y - 70} L${cx + 7} ${y - 58} M${cx + 7} ${y - 70} L${cx - 7} ${y - 58}"/>` : `<path class="d" d="M${cx - 8} ${y - 64} L${cx + 8} ${y - 64}"/>`}`;
  const spk = (cx) => `<circle fill="${P.charHi}" cx="${cx}" cy="${y - 60}" r="34"/><circle fill="${P.char}" cx="${cx}" cy="${y - 60}" r="22"/><circle fill="${P.charHi}" class="thin" cx="${cx}" cy="${y - 60}" r="8"/>${spin ? `<circle class="n" fill="none" style="stroke:${P.butter};stroke-width:4" cx="${cx}" cy="${y - 60}" r="44" opacity=".8"/>` : ''}`;
  return `<path class="d" style="stroke-width:7" d="M${x - 70} ${y - 110} Q${x} ${y - 150} ${x + 70} ${y - 110}"/>
  ${R(x - 120, y - 110, 240, 104, P.rose, ' rx="18"')}${spk(x - 72)}${spk(x + 72)}
  ${R(x - 34, y - 90, 68, 50, P.cream, ' rx="6"')}${R(x - 28, y - 82, 56, 34, state === 'rec' ? P.blush : P.lav, ' rx="4"')}${reel(x - 14)}${reel(x + 14)}
  ${[[x - 28, P.leafLight, 'play'], [x - 6, '#E5484D', 'rec'], [x + 16, P.cream, 'stop']].map(([bx, c, k]) => R(bx, y - 34 + (state === k ? 4 : 0), 18, 12 - (state === k ? 4 : 0), c, ' class="thin" rx="3"')).join('')}
  ${state === 'rec' ? `<circle fill="#E5484D" cx="${x + 100}" cy="${y - 96}" r="7"/>` : ''}${state === 'play' ? `<path class="d" style="stroke:${P.plum}" d="M${x + 124} ${y - 120} q10 -16 20 -6 M${x + 138} ${y - 150} l0 26"/><circle fill="${P.plum}" class="thin" cx="${x + 132}" cy="${y - 124}" r="6"/>` : ''}`;
}

// ---- LOBBY -----------------------------------------------------------------
const TICK = { x0: 3614, x1: 3834, top: 520, counter: 800 };
const SNACK = { x0: 3860, x1: 4100, counter: 800 };
const POSTER = { x: 3630, y: 150, w: 190, h: 270 };
function lobbyBack() {
  // pillar between house and lobby, the lobby door, a chandelier, picture frames, plants
  return `${pillar(3590)}
  ${at(4020, -150, 1, `<path class="d" d="M0 0 L0 150"/><path fill="${P.mustard}" d="M-70 150 L70 150 L50 176 L-50 176Z"/>${[-56, -20, 20, 56].map((x) => `<path class="d" d="M${x} 176 L${x} 210"/><path fill="${LAMP}" d="M${x - 12} 210 L${x + 12} 210 L${x + 8} 236 L${x - 8} 236Z"/><ellipse class="n" fill="${GLOW}" opacity=".3" cx="${x}" cy="224" rx="34" ry="30"/>`).join('')}`)}
  ${frame(3900, 250, 90, 110, `<circle fill="${P.peach}" class="thin" cx="3945" cy="296" r="24"/><path fill="${P.plum}" d="M3918 290 Q3945 250 3972 290 Q3960 272 3945 272 Q3930 272 3918 290Z"/><circle class="ink" cx="3937" cy="298" r="3"/><circle class="ink" cx="3953" cy="298" r="3"/><path fill="${P.berry}" d="M3920 360 Q3945 322 3970 360Z"/>`, P.mustard)}
  ${frame(4030, 290, 80, 90, `<path fill="${P.butter}" class="thin" d="${star(4070, 335, 26, 11)}"/>`, P.rose)}
  ${at(3750, 150, 1, `<path class="d" d="M-110 0 L-110 -300 M110 0 L110 -300"/>`)}`;
}
function posterFrame(pictures) {
  const { x, y, w, h } = POSTER;
  const pts = [...Array(6)].map((_, i) => [x + (w * i) / 5, y - 18]).concat([...Array(6)].map((_, i) => [x + (w * i) / 5, y + h + 18]));
  const inner = pictures
    ? `${R(x, y, w, h, P.plum)}<path fill="${VEL}" d="M${x} ${y} L${x + 50} ${y} Q${x + 30} ${y + 120} ${x + 10} ${y + h} L${x} ${y + h}Z M${x + w} ${y} L${x + w - 50} ${y} Q${x + w - 30} ${y + 120} ${x + w - 10} ${y + h} L${x + w} ${y + h}Z"/>
       <path class="n" fill="${P.butter}" opacity=".35" d="M${x + w / 2 - 20} ${y + 20} L${x + w / 2 + 20} ${y + 20} L${x + w / 2 + 70} ${y + h - 30} L${x + w / 2 - 70} ${y + h - 30}Z"/>
       <circle fill="${P.peach}" class="thin" cx="${x + w / 2}" cy="${y + 130}" r="30"/><path fill="${P.plum}" d="M${x + w / 2 - 32} ${y + 124} Q${x + w / 2} ${y + 80} ${x + w / 2 + 32} ${y + 124} Q${x + w / 2 + 16} ${y + 104} ${x + w / 2} ${y + 104} Q${x + w / 2 - 16} ${y + 104} ${x + w / 2 - 32} ${y + 124}Z"/>
       <circle class="ink" cx="${x + w / 2 - 10}" cy="${y + 134}" r="3.5"/><circle class="ink" cx="${x + w / 2 + 10}" cy="${y + 134}" r="3.5"/><path fill="${P.mouth}" class="thin" d="M${x + w / 2 - 8} ${y + 144} Q${x + w / 2} ${y + 158} ${x + w / 2 + 8} ${y + 144}Z"/>
       <path fill="${P.rose}" d="M${x + w / 2 - 40} ${y + h - 30} L${x + w / 2 - 26} ${y + 164} L${x + w / 2 + 26} ${y + 164} L${x + w / 2 + 40} ${y + h - 30}Z"/>
       ${stars([[x + 40, y + 40, 16], [x + w - 40, y + 60, 12], [x + 30, y + 180, 10], [x + w - 34, y + 190, 14]])}
       <path class="d" style="stroke:${P.butter}" d="M${x + w / 2 + 44} ${y + 100} q10 -16 20 -6 M${x + w / 2 + 58} ${y + 70} l0 30"/><circle fill="${P.butter}" class="thin" cx="${x + w / 2 + 52}" cy="${y + 104}" r="7"/>`
    : `${R(x, y, w, h, P.cream)}${R(x, y, w, 70, P.plum)}${stars([[x + w / 2, y + 35, 22], [x + 34, y + 35, 10], [x + w - 34, y + 35, 10]])}
       <path ${tl(P.oat, 'stroke-width:4;stroke-dasharray:12 12')} d="M${x + 24} ${y + 110} L${x + w - 24} ${y + 110} M${x + 24} ${y + 160} L${x + w - 24} ${y + 160} M${x + 24} ${y + 210} L${x + w - 24} ${y + 210}"/>`;
  return `${R(x - 34, y - 34, w + 68, h + 68, P.mustard, ' rx="14"')}${R(x - 20, y - 20, w + 40, h + 40, P.mustardDeep, ' rx="8"')}${inner}<rect fill="none" x="${x}" y="${y}" width="${w}" height="${h}"/>${bulbs(pts, 8)}`;
}
function ticketBooth() {
  const { x0, x1, top, counter } = TICK, cx = (x0 + x1) / 2;
  const n = 6, w = (x1 - x0 + 40) / n;
  const awn = [...Array(n)].map((_, i) => `<path fill="${i % 2 ? P.cream : P.berry}" d="M${f(x0 - 20 + i * w)} ${top - 60} L${f(x0 - 20 + (i + 1) * w)} ${top - 60} L${f(x0 - 20 + (i + 1) * w)} ${top} Q${f(x0 - 20 + (i + .5) * w)} ${top + 26} ${f(x0 - 20 + i * w)} ${top}Z"/>`).join('');
  return `${R(x0, top - 20, x1 - x0, WALL_Y + 10 - top + 20, P.teal, ' rx="10"')}
  ${R(x0 - 26, top - 80, x1 - x0 + 52, 26, P.tealDeep, ' rx="10"')}${awn}
  <path fill="${P.mustard}" d="M${cx - 90} ${counter - 10} L${cx - 90} ${top + 100} Q${cx} ${top + 20} ${cx + 90} ${top + 100} L${cx + 90} ${counter - 10}Z"/>
  ${R(x0 - 16, counter - 8, x1 - x0 + 32, 24, P.woodLight, ' rx="8"')}${R(x0 + 20, counter + 30, x1 - x0 - 40, WALL_Y - counter - 40, P.tealDeep, ' rx="10"')}
  <path class="thin" fill="${P.butter}" d="${star(cx, counter + 100, 30, 13)}"/>${at(x0 + 50, counter - 8, .6, ticket())}`;
}
function ticketWindow(open) {
  const { top, counter } = TICK, cx = (TICK.x0 + TICK.x1) / 2;
  const arch = `M${cx - 74} ${counter - 12} L${cx - 74} ${top + 104} Q${cx} ${top + 40} ${cx + 74} ${top + 104} L${cx + 74} ${counter - 12}Z`;
  if (!open) return `<path fill="${P.rose}" d="${arch}"/><path ${tl(P.roseDeep, 'stroke-width:5')} d="${[...Array(6)].map((_, i) => `M${cx - 74} ${top + 120 + i * 24} L${cx + 74} ${top + 120 + i * 24}`).join(' ')}"/><path fill="none" d="${arch}"/>
    ${R(cx - 20, counter - 30, 40, 14, P.mustard, ' rx="5"')}<circle fill="${P.cream}" cx="${cx}" cy="${top + 160}" r="30"/><path class="thin" fill="${P.berry}" d="${star(cx, top + 160, 20, 9)}"/>`;
  return `<path fill="${P.glass}" d="${arch}"/><path class="n" fill="${P.sky}" opacity=".5" d="M${cx - 70} ${counter - 12} L${cx - 70} ${top + 200} Q${cx} ${top + 170} ${cx + 70} ${top + 200} L${cx + 70} ${counter - 12}Z"/>
    <path fill="none" d="${arch}"/>${glint(`M${cx + 30} ${top + 110} L${cx + 50} ${top + 90}`)}
    <path fill="${P.rose}" d="M${cx - 74} ${top + 104} Q${cx} ${top + 40} ${cx + 74} ${top + 104} L${cx + 74} ${top + 130} Q${cx} ${top + 70} ${cx - 74} ${top + 130}Z"/>
    ${at(cx + 40, counter - 12, .8, `<path fill="${P.mustard}" d="M-24 0 Q-24 -30 0 -30 Q24 -30 24 0Z"/><circle fill="${P.mustard}" class="thin" cx="0" cy="-34" r="5"/>${R(-30, -4, 60, 8, P.mustardDeep, ' rx="3"')}`)}`;
}
function snackStand() {
  const { x0, x1, counter } = SNACK;
  // counter + popcorn machine + lemonade jug; a picture menu above
  const pop = (x) => `${R(x - 70, counter - 250, 140, 230, P.berry, ' rx="12"')}${R(x - 56, counter - 220, 112, 170, P.glass, ' rx="6"')}
    ${[...Array(18)].map((_, i) => `<path class="n" fill="${P.egg}" d="${scallop(x - 44 + (i % 6) * 18, counter - 70 - Math.floor(i / 6) * 18, 10, 9, 6, 3)}"/>`).join('')}
    <path class="d" d="${[...Array(18)].map((_, i) => `M${x - 50 + (i % 6) * 18} ${counter - 70 - Math.floor(i / 6) * 18} q4 -4 8 0`).join(' ')}"/>
    <rect fill="none" x="${x - 56}" y="${counter - 220}" width="112" height="170" rx="6"/>${glint(`M${x + 30} ${counter - 200} L${x + 40} ${counter - 180}`, 4)}
    <path fill="${P.berry}" d="M${x - 80} ${counter - 250} L${x + 80} ${counter - 250} L${x + 50} ${counter - 290} L${x - 50} ${counter - 290}Z"/><path class="thin" fill="${P.butter}" d="${star(x, counter - 268, 14, 6)}"/>
    ${R(x - 60, counter - 44, 120, 24, P.butter, ' rx="6"')}`;
  return `${R(x0, counter, x1 - x0, WALL_Y + 10 - counter, P.butter, ' rx="8"')}${[...Array(5)].map((_, i) => R(x0 + 10 + i * 50, counter + 30, 34, WALL_Y - counter - 40, i % 2 ? P.cream : P.berry, ' rx="6"')).join('')}
  ${R(x0 - 14, counter - 12, x1 - x0 + 28, 26, P.woodLight, ' rx="8"')}
  ${pop(x0 + 80)}${at(x1 - 50, counter - 12, 1, lemonade())}${at(x1 - 50, counter - 100, 1, `${R(-10, -6, 20, 8, P.steelDeep, ' rx="3"')}`)}
  ${at(x1 - 110, counter - 12, .6, popcorn('full'))}
  ${R(x0 + 10, 420, x1 - x0 - 20, 150, P.charDeep, ' rx="10"')}${R(x0 + 18, 428, x1 - x0 - 36, 134, P.chalk, ' rx="6"')}
  ${at(x0 + 70, 540, .6, popcorn('full'))}${at(x0 + 150, 540, .55, HH.lemonade())}${at(x0 + 212, 540, .5, `<path fill="${P.butter}" d="M-20 0 L20 0 L0 -60Z"/><circle fill="${P.rose}" cx="0" cy="-70" r="20"/>`)}`;
}
function lobbyFront() {
  const stanchion = (x) => `${R(x - 8, 1300, 16, 110, P.mustard, ' rx="6"')}<circle fill="${P.mustard}" cx="${x}" cy="1296" r="14"/><ellipse fill="${P.mustardDeep}" cx="${x}" cy="1410" rx="34" ry="10"/>`;
  return `${stanchion(3690)}${stanchion(3900)}<path fill="none" style="stroke:${VEL};stroke-width:16" d="M3700 1310 Q3795 1370 3890 1310"/><path fill="none" d="M3700 1302 Q3795 1362 3890 1302 M3700 1318 Q3795 1378 3890 1318"/>
  ${bigPlant(4190, 1560, .7, P.teal)}`;
}

// ---------------------------------------------------------------------------
export const ROOM = {
  id: 'theater',
  offset: [0, 0],
  canvas: { x: -100, y: -100, w: 3080, h: 1200 },
  width: 2880,
  defs: DEFS,
  layers: [
    { id: 'back', baseline: 0, opaque: true,
      art: () => `${walls()}${floors()}${stageBox()}${proscenium()}
        ${propsShelf()}${vanityMirror()}${backstageWall()}
        ${balconyBack()}${lobbyBack()}` },
    { id: 'counter', baseline: 724,
      art: () => `${vanityTable()}${rackA()}${row(0)}${balconyFront()}${boothConsole()}${ticketBooth()}${snackStand()}` },
    { id: 'mid', baseline: +(CURTAIN_Y * ART_SCALE).toFixed(1),
      art: () => `${at(560, 1260, 1, HH.stool(P.rose))}${rackB()}${changeScreen()}${row(1)}` },
    { id: 'front', baseline: 1000,
      art: () => `${row(2)}${pitRail()}${spotRail()}${header()}${lobbyFront()}${bigPlant(-60, 1560, .85, P.plum)}${bigPlant(1440, 1580, .5, P.teal)}` },
  ],
  pieces: [
    { id: 'backdrop', layer: 'back', variants: { stars: backdropStars, castle: backdropCastle, sea: backdropSea, city: backdropCity } },
    { id: 'trapdoor', layer: 'back', variants: { closed: () => trapdoor(false), open: () => trapdoor(true) }, taps: ['closed', 'open'], pivot: [2420, 1112] },
    { id: 'poster', layer: 'back', variants: { blank: () => posterFrame(false), pictures: () => posterFrame(true) },
      textArea: [POSTER.x + 16, POSTER.y + 86, POSTER.w - 32, POSTER.h - 100] },
    { id: 'thunder-sheet', layer: 'counter', variants: { still: () => thunderSheet(false), shake: () => thunderSheet(true) }, pivot: [1250, 360] },
    { id: 'ticket-window', layer: 'counter', variants: { closed: () => ticketWindow(false), open: () => ticketWindow(true) }, taps: ['closed', 'open'] },
    { id: 'boombox', layer: 'counter', variants: { idle: () => boombox('idle'), play: () => boombox('play'), rec: () => boombox('rec') } },
    ...['fog', 'confetti', 'snow', 'thunder'].map((k, i) => ({ id: `fx-${k}`, layer: 'counter', variants: { up: () => fxButton(k, i, false), down: () => fxButton(k, i, true) }, controls: { fog: 'fog-machine', confetti: 'confetti-cannon', snow: 'snow-machine', thunder: 'thunder-sheet' }[k] })),
    { id: 'trunk', layer: 'mid', variants: { closed: () => trunk(false), open: () => trunk(true) }, taps: ['closed', 'open'], pivot: [205, 1150] },
    { id: 'curtain-left', layer: 'mid', variants: { open: () => curtainHalf(-1, 'open'), half: () => curtainHalf(-1, 'half'), closed: () => curtainHalf(-1, 'closed') }, pivot: [PRO.ox0, PRO.top] },
    { id: 'curtain-right', layer: 'mid', variants: { open: () => curtainHalf(1, 'open'), half: () => curtainHalf(1, 'half'), closed: () => curtainHalf(1, 'closed') }, pivot: [PRO.ox1, PRO.top] },
    { id: 'valance', layer: 'mid', variants: { open: () => valance('open'), half: () => valance('half'), closed: () => valance('closed') } },
    { id: 'fog-machine', layer: 'mid', variants: { off: () => fogMachine(false), on: () => fogMachine(true) } },
    { id: 'confetti-cannon', layer: 'mid', variants: { idle: () => confettiCannon(false), fire: () => confettiCannon(true) }, pivot: [2610, 1110] },
    { id: 'piano', layer: 'mid', variants: { still: piano } },
    { id: 'drums', layer: 'mid', variants: { still: drums } },
    { id: 'xylophone', layer: 'mid', variants: { still: xylophone } },
    { id: 'guitar', layer: 'mid', variants: { still: guitar }, pivot: [GTR.x, 1330] },
    // one lamp art, three copies along the rail (the engine drags each along SPOT.rail)
    { id: 'spotlight', layer: 'front', variants: { off: () => spotlight(null), white: () => spotlight('white'), pink: () => spotlight('pink'), blue: () => spotlight('blue'), gold: () => spotlight('gold') },
      taps: ['off', 'white', 'pink', 'blue', 'gold'], copies: SPOT.rest.map((x) => [x, SPOT.y]), pivot: [SPOT.rest[0], SPOT.y] },
    { id: 'mic-stand', layer: 'front', variants: { idle: () => micStand(false), rec: () => micStand(true) }, pivot: [MIC.x, MIC.base] },
    { id: 'snow-machine', layer: 'front', variants: { off: () => snowMachine(false), on: () => snowMachine(true) } },
  ],
  surfaces: [
    ...SHELF.rows.map((y, i) => ({ id: `props-shelf-${i + 1}`, layer: 'back', seg: [SHELF.x0 + 24, SHELF.x1 - 24, y] })),
    { id: 'vanity', layer: 'counter', seg: [VAN.x0 + 10, VAN.x1 - 90, VAN.top] },
    { id: 'rack-top', layer: 'counter', seg: [RACK_A.x0, RACK_A.x1, RACK_A.top - 14] },
    { id: 'trunk-top', layer: 'mid', seg: [90, 320, 1100], inside: 'trunk:closed' },
    { id: 'trunk-inside', layer: 'mid', seg: [100, 310, 1150], inside: 'trunk:open' },
    { id: 'stage', layer: 'back', seg: [PRO.ox0 + 20, PRO.ox1 - 20, 1150] },
    { id: 'piano-top', layer: 'mid', seg: [PIANO.x0, PIANO.x1, PIANO.top - 14] },
    { id: 'pit-rail', layer: 'front', seg: [PIT.x0 - 60, PIT.x1 + 60, PIT.rail - 6] },
    { id: 'balcony-rail', layer: 'counter', seg: [BAL.x0 - 20, BOOTH.x0 - 20, BAL.rail - 14] },
    { id: 'booth-console', layer: 'counter', seg: [BOOTH.x0 + 10, BOOTH.x1 - 10, BOOTH.top - 10] },
    { id: 'ticket-counter', layer: 'counter', seg: [TICK.x0 - 10, TICK.x1 + 10, TICK.counter - 8] },
    { id: 'snack-counter', layer: 'counter', seg: [SNACK.x0 + 160, SNACK.x1 + 10, SNACK.counter - 12] },
  ],
  seats: [
    ...ROWS.flatMap((r, i) => SEATX.map((x, j) => ({ id: `seat-${String.fromCharCode(67 - i)}${j + 1}`, layer: r.layer, at: [x, r.y - 10] }))),
    ...BAL.seats.map((x, j) => ({ id: `balcony-${j + 1}`, layer: 'back', at: [x, BAL.y - 10] })),
    { id: 'piano-bench', layer: 'mid', at: [PIANO.x1 + 60, 1330] },
    { id: 'vanity-stool', layer: 'mid', at: [560, 1196] },
  ],
  // Slots: anchor points for things that are not stations (art units).
  slots: [
    { id: 'curtain-rope', kind: 'rope', layer: 'back', at: [PRO.ox1 + 45, 900], box: [PRO.ox1 + 15, 700, 60, 400], piece: 'curtain-left' },
    { id: 'trapdoor', kind: 'trapdoor', layer: 'back', at: [2420, 1136], box: [2320, 1104, 200, 60], piece: 'trapdoor' },
    { id: 'bow-spot', kind: 'bow', layer: 'mid', at: [CX, 1150] },
    { id: 'rose-land', kind: 'throw-target', layer: 'back', at: [CX, 1140], box: [PRO.ox0 + 80, 1110, PRO.ox1 - PRO.ox0 - 160, 60] },
    { id: 'behind-screen', kind: 'change', layer: 'mid', at: [1200, 1040], box: [1070, 800, 270, 460] },
    { id: 'vanity-mirror', kind: 'mirror', layer: 'back', at: [VAN.mirror[0] + VAN.mirror[2] / 2, VAN.top], box: VAN.mirror },
    { id: 'wig-stand', kind: 'wig', layer: 'counter', at: [VAN.x1 - 40, VAN.top] },
    { id: 'ticket-spot', kind: 'queue', layer: 'mid', at: [(TICK.x0 + TICK.x1) / 2, 1200] },
    { id: 'snack-spot', kind: 'queue', layer: 'mid', at: [SNACK.x0 + 120, 1200] },
    { id: 'booth-operator', kind: 'staff', layer: 'back', at: [BOOTH.x0 + 150, BAL.floor] },
    { id: 'fog-out', kind: 'fx', layer: 'mid', at: [1680, 1110], piece: 'fog-machine' },
    { id: 'confetti-out', kind: 'fx', layer: 'mid', at: [2480, 980], piece: 'confetti-cannon' },
    { id: 'snow-out', kind: 'fx', layer: 'front', at: [2560, 400], piece: 'snow-machine' },
  ],
  // Stations: interactive spots the engine wires (art units). box = the tap area [x, y, w, h].
  stations: [
    { id: 'mic', kind: 'mic', layer: 'front', at: [MIC.x + 64, MIC.base - 47], box: [MIC.x + 14, MIC.base - 94, 100, 94], piece: 'mic-stand', singer: [MIC.x, 1130], head: [MIC.x - 17, 832] },
    { id: 'piano', kind: 'instrument', instrument: 'piano', layer: 'mid', at: [(PIANO.x0 + PIANO.x1) / 2, PIANO.top + 100], box: [PIANO.x0 + 20, PIANO.top + 78, PIANO.x1 - PIANO.x0 - 40, 54], piece: 'piano',
      keys: [...Array(8)].map((_, i) => { const kw = (PIANO.x1 - PIANO.x0 - 40) / 8; return [+(PIANO.x0 + 20 + i * kw).toFixed(1), PIANO.top + 78, +kw.toFixed(1), 54]; }), seat: 'piano-bench' },
    { id: 'drums', kind: 'instrument', instrument: 'drums', layer: 'mid', at: [DRUM.x, 1300], box: [DRUM.x - 140, 1150, 310, 220], piece: 'drums',
      pads: { kick: [DRUM.x - 84, 1256, 168, 110], snare: [DRUM.x - 130, 1236, 82, 64], tom: [DRUM.x + 44, 1214, 64, 56], cymbal: [DRUM.x + 56, 1150, 108, 30] } },
    { id: 'xylophone', kind: 'instrument', instrument: 'xylophone', layer: 'mid', at: [(XYL.x0 + XYL.x1) / 2, XYL.y], box: [XYL.x0, XYL.y - 52, XYL.x1 - XYL.x0, 104], piece: 'xylophone',
      keys: [...Array(8)].map((_, i) => { const bw = (XYL.x1 - XYL.x0) / 8, h = 104 - i * 8; return [+(XYL.x0 + i * bw).toFixed(1), +(XYL.y - h / 2).toFixed(1), +bw.toFixed(1), h]; }) },
    { id: 'guitar', kind: 'instrument', instrument: 'guitar', layer: 'mid', at: [GTR.x, 1300], box: [GTR.x - 90, 1030, 180, 360], piece: 'guitar', strings: [GTR.x - 12, 1076, 24, 268] },
    ...['fog', 'confetti', 'snow', 'thunder'].map((k, i) => ({ id: `fx-${k}`, kind: 'fx-button', effect: k, layer: 'counter', at: [FXB.xs[i], FXB.y + 8], box: [FXB.xs[i] - 34, FXB.y - 20, 68, 60], piece: `fx-${k}`,
      machine: { fog: 'fog-machine', confetti: 'confetti-cannon', snow: 'snow-machine', thunder: 'thunder-sheet' }[k] })),
    { id: 'spotlight-rail', kind: 'rail', layer: 'front', at: [CX, SPOT.y], box: [SPOT.rail[0], SPOT.y - 20, SPOT.rail[1] - SPOT.rail[0], 150], piece: 'spotlight', rail: SPOT.rail, rest: SPOT.rest, colors: ['off', 'white', 'pink', 'blue', 'gold'] },
    { id: 'backdrop-hook', kind: 'fly', layer: 'back', at: [CX, BD.y0 - 6], box: [BD.x0, BD.y0 - 30, BD.x1 - BD.x0, 120], piece: 'backdrop', scenes: ['stars', 'castle', 'sea', 'city'] },
    { id: 'boombox', kind: 'tape-deck', layer: 'counter', at: [BOOM.x, BOOM.y - 64], box: [BOOM.x - 120, BOOM.y - 110, 240, 104], piece: 'boombox', tapeSlot: [BOOM.x, BOOM.y - 64] },
    { id: 'curtain', kind: 'curtain', layer: 'mid', at: [CX, 640], box: [PRO.ox0, PRO.top, PRO.ox1 - PRO.ox0, CURTAIN_Y - PRO.top], pieces: ['curtain-left', 'curtain-right', 'valance'], states: ['open', 'half', 'closed'] },
    { id: 'ticket-window', kind: 'ticket', layer: 'counter', at: [(TICK.x0 + TICK.x1) / 2, TICK.counter - 8], box: [(TICK.x0 + TICK.x1) / 2 - 74, TICK.top + 60, 148, TICK.counter - TICK.top - 70], piece: 'ticket-window', stamp: [(TICK.x0 + TICK.x1) / 2 + 40, TICK.counter - 20] },
    { id: 'snack-counter', kind: 'snack', layer: 'counter', at: [SNACK.x0 + 80, SNACK.counter - 12], box: [SNACK.x0, SNACK.counter - 300, SNACK.x1 - SNACK.x0, 300] },
    { id: 'marquee', kind: 'poster', layer: 'back', at: [POSTER.x + POSTER.w / 2, POSTER.y + POSTER.h], box: [POSTER.x, POSTER.y, POSTER.w, POSTER.h], piece: 'poster' },
    { id: 'vanity', kind: 'makeup', layer: 'counter', at: [VAN.x0 + 150, VAN.top], box: [VAN.x0, VAN.top - 60, 300, 60], mirror: VAN.mirror },
    { id: 'thunder-sheet', kind: 'fx', effect: 'thunder', layer: 'counter', at: [1250, 560], box: [1180, 360, 140, 400], piece: 'thunder-sheet' },
  ],
  // Spawners (design 2.3): drag out a fresh copy; `items` are prop ids.
  spawners: [
    { id: 'rack-a', at: [(RACK_A.x0 + RACK_A.x1) / 2, RACK_A.top + 20], box: [RACK_A.x0, RACK_A.top, RACK_A.x1 - RACK_A.x0, 300],
      items: ['gown', 'royal-coat', 'fairy-tutu', 'wizard-robe', 'pirate-coat', 'star-dress', 'tuxedo', 'knight-tunic'] },
    { id: 'rack-b', at: [(RACK_B.x0 + RACK_B.x1) / 2, RACK_B.top + 20], box: [RACK_B.x0, RACK_B.top, RACK_B.x1 - RACK_B.x0, 260],
      items: ['hero-cape', 'lightning-cape', 'hero-suit', 'hero-mask', 'sparkle-mask', 'fairy-wings', 'feather-boa'] },
    { id: 'props-shelf', surfaces: SHELF.rows.map((_, i) => `props-shelf-${i + 1}`),
      items: ['crown', 'top-hat', 'masquerade-mask', 'wand', 'microphone', 'bouquet', 'foam-sword', 'tambourine', 'maracas', 'tape', 'program'] },
    { id: 'trunk', piece: 'trunk', when: 'open', surfaces: ['trunk-inside'], items: ['pirate-hat', 'wizard-hat', 'cat-ears', 'bunny-ears', 'lion-mane', 'tiara', 'sunglasses'] },
    { id: 'wig-stand', at: [VAN.x1 - 40, VAN.top], items: ['lion-mane', 'tiara'] },
    { id: 'popcorn', at: [SNACK.x0 + 80, SNACK.counter - 12], items: ['popcorn'] },
    { id: 'lemonade', at: [SNACK.x1 - 50, SNACK.counter - 12], items: ['lemonade-cup'] },
    { id: 'tickets', at: [TICK.x0 + 50, TICK.counter - 8], items: ['ticket'] },
    { id: 'roses', at: [CX, 1140], items: ['rose'], note: 'thrown onto the stage (rose-land) by the audience at a bow' },
  ],
  zones: [
    { id: 'backstage', x0: ZB[0], x1: ZB[1], camera: 0 },
    { id: 'stage', x0: ZS[0], x1: ZS[1], camera: 736 },
    { id: 'audience', x0: ZA[0], x1: ZA[1], camera: 1440 },
  ],
  floor: { y0: WALL_Y, y1: 1372 },
};

// Rig numbers for the animated pieces, in WORLD units (manifest.rooms.theater.rigs).
const W = (p) => toW(p[0], p[1]);
export const THEATER_RIGS = {
  curtain: {
    pieces: { left: 'curtain-left', right: 'curtain-right', valance: 'valance' }, states: ['open', 'half', 'closed'],
    opening: [...W([PRO.ox0, PRO.top]), +((PRO.ox1 - PRO.ox0) * ART_SCALE).toFixed(1), +((CURTAIN_Y - PRO.top) * ART_SCALE).toFixed(1)],
    line: toW(0, CURTAIN_Y)[1],
    note: 'Swap the three pieces\' variants together (open/half/closed). A tween between states can scaleX each half about its outer edge (pivot) while swapping. Characters upstage of `line` (y < line) are hidden by the closed curtain (it is in the mid layer, baseline = line); the apron in front of it (line..lip) is where bows happen.',
  },
  stage: { lip: toW(0, DECK.lip)[1], upstage: toW(0, DECK.back)[1], x0: toW(PRO.ox0, 0)[0], x1: toW(PRO.ox1, 0)[0], bow: W([CX, 1150]),
    note: 'The stage deck is the floor band between upstage and lip inside x0..x1 (same wall foot as the rest of the strip). The orchestra pit is in front of the lip, behind the pit rail (front layer).' },
  spotlights: { piece: 'spotlight', rail: { x0: toW(SPOT.rail[0], 0)[0] + 50, x1: toW(SPOT.rail[1], 0)[0] - 50, y: toW(0, SPOT.y)[1] }, rest: SPOT.rest.map((x) => toW(x, 0)[0]),
    pool: toW(0, DECK.lip - 44)[1], colors: ['off', 'white', 'pink', 'blue', 'gold'], hex: LIGHTS,
    note: 'One piece, three copies (manifest pieces.spotlight.copies). Drag a copy along x (translate only); tap cycles colours. The cone pools on the stage at y = pool; a character whose x is within ~120 of a lit copy is "in the light".' },
  backdrop: { piece: 'backdrop', scenes: ['stars', 'castle', 'sea', 'city'], hook: W([CX, BD.y0 - 6]), fly: toW(0, BD.y0 - 700)[1],
    note: 'Swap by flying: translateY the piece up out of sight (to fly), swap the variant, drop it back with a thud and a dust puff at the deck.' },
  trapdoor: { piece: 'trapdoor', hole: [...W([2330, 1112]), +(180 * ART_SCALE).toFixed(1), +(48 * ART_SCALE).toFixed(1)] },
  effects: { fog: { machine: 'fog-machine', out: W([1680, 1110]) }, confetti: { machine: 'confetti-cannon', out: W([2480, 980]) }, snow: { machine: 'snow-machine', out: W([2560, 400]) }, thunder: { machine: 'thunder-sheet', pivot: W([1250, 360]) } },
  mic: { piece: 'mic-stand', button: W([MIC.x + 64, MIC.base - 47]), singer: W([MIC.x, 1130]), head: W([MIC.x - 17, 832]) },
};
