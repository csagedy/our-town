// Theater props (P2b.1, docs/design.md 3.2): the props-shelf toys (crown,
// wand, foam sword, bouquet, microphone, top hat, masquerade mask), the
// costume-closet sprites (every costume is a rig wear piece, `wear` below),
// snacks (popcorn, lemonade), tickets, roses, programs, tapes and the small
// hand instruments. Same contract as props/starter.mjs and props/site.mjs:
// origin = bottom centre = the resting point, art units, variants[0] is the
// default; `wear: { piece, slot, colors }` names the rig piece a wearable
// puts on (docs/rig.md 4) and, per variant, the colour variables it brings.
// Costumes are drawn on a hanger (the costume racks hang them), so their
// grip is the hanger hook. All original designs: no real-world IP; the foam
// sword is a chunky pastel toy with a round tip.
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';

const glint = (d, w = 5) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;
const sprinkle = (list, c = P.butter) => list.map(([x, y, r]) => `<path class="thin" fill="${c}" d="${star(x, y, r, r * .45)}"/>`).join('');

// ---------------------------------------------------------------------------
// PROPS SHELF
// ---------------------------------------------------------------------------
export function crown([c, d, g] = [P.mustard, P.mustardDeep, P.berry]) {
  return `<path fill="${c}" d="M-46 0 L-50 -60 L-26 -32 L0 -72 L26 -32 L50 -60 L46 0Z"/>
  ${R(-48, -18, 96, 18, d, ' rx="6"')}
  <circle fill="${g}" class="thin" cx="0" cy="-34" r="8"/><circle fill="${P.teal}" class="thin" cx="-28" cy="-9" r="5"/><circle fill="${P.teal}" class="thin" cx="28" cy="-9" r="5"/><circle fill="${g}" class="thin" cx="0" cy="-9" r="5"/>
  ${[[-50, -62], [0, -74], [50, -62]].map(([x, y]) => `<circle fill="${P.cream}" class="thin" cx="${x}" cy="${y}" r="6"/>`).join('')}
  ${glint('M-36 -44 L-34 -26', 4)}`;
}
export function tiara() {
  return `<path fill="${P.steel}" d="M-50 0 Q0 -26 50 0 L46 8 Q0 -14 -46 8Z"/>
  <path fill="${P.steel}" d="M-38 -8 L-28 -40 L-18 -12Z M18 -12 L28 -40 L38 -8Z M-12 -16 L0 -62 L12 -16Z"/>
  <path fill="${P.rose}" class="thin" d="M0 -58 L9 -44 L0 -30 L-9 -44Z"/><circle fill="${P.cream}" class="thin" cx="-28" cy="-30" r="5"/><circle fill="${P.cream}" class="thin" cx="28" cy="-30" r="5"/>
  ${glint('M-30 -4 Q-14 -12 4 -12', 3.5)}`;
}
export function wand(sparkle = false) {
  const s = `<g transform="rotate(14)">${R(-5, -120, 10, 120, P.plum, ' rx="5"')}<path ${tl(P.plumDeep, 'stroke-width:3.5')} d="M-4 -92 L4 -84 M-4 -64 L4 -56 M-4 -36 L4 -28"/>
    <path fill="${P.butter}" d="${star(0, -146, 34, 15)}"/><circle class="n" fill="#fff" cx="-8" cy="-152" r="3.5"/>${R(-10, -122, 20, 10, P.rose, ' rx="4"')}
    <path fill="${P.rose}" class="thin" d="M-6 -118 Q-26 -96 -18 -80 Q-10 -96 -2 -114Z"/><path fill="${P.teal}" class="thin" d="M6 -118 Q24 -100 22 -84 Q12 -98 2 -114Z"/></g>`;
  if (!sparkle) return s;
  return s + [[-40, -170, 12], [46, -186, 10], [-8, -206, 9], [58, -140, 8], [-52, -126, 7]].map(([x, y, r], i) => `<path class="thin" fill="${[P.butter, P.rose, P.mint, P.lav, P.butter][i]}" d="${star(x, y, r, r * .42, 4)}"/>`).join('');
}
export function foamSword([blade, bladeSh] = [P.sky, P.skyDeep]) {
  // a chunky, rounded toy: fat blade with a ROUND tip, a big squishy guard, a star sticker
  return `<g transform="rotate(-8)">${R(-11, -58, 22, 50, P.berry, ' rx="10"')}<path ${tl('#C4575B', 'stroke-width:3.5')} d="M-10 -46 L10 -40 M-10 -30 L10 -24"/>
    <circle fill="${P.butter}" cx="0" cy="-2" r="14"/>
    <path fill="${blade}" d="M-20 -80 L-20 -212 Q-20 -244 0 -244 Q20 -244 20 -212 L20 -80Z"/>
    <path class="n" fill="${bladeSh}" d="M8 -84 L8 -210 Q8 -228 2 -234 Q16 -232 16 -210 L16 -84Z"/>
    ${glint('M-10 -110 L-10 -200', 5)}
    <path fill="${P.mustard}" d="M-54 -76 Q-54 -94 -36 -92 L36 -92 Q54 -94 54 -76 Q54 -60 36 -62 L-36 -62 Q-54 -60 -54 -76Z"/>
    <path fill="${P.cream}" class="thin" d="${star(0, -77, 11, 5)}"/>
    <circle class="n" fill="${P.mustardDeep}" cx="-38" cy="-77" r="4"/><circle class="n" fill="${P.mustardDeep}" cx="38" cy="-77" r="4"/></g>`;
}
export function bouquet() {
  const fl = (x, y, c, r = 16) => `<path fill="${c}" d="${scallop(x, y, r, r, 6, 6)}"/><circle fill="${P.butter}" class="thin" cx="${x}" cy="${y}" r="${r * .35}"/>`;
  return `${leaf(46, 12, -40, P.leaf, -10, -112)}${leaf(50, 12, 36, P.leafDeep, 10, -112)}${leaf(40, 11, -8, P.leafLight, 0, -120)}
  ${fl(-28, -150, P.rose)}${fl(24, -154, P.lav)}${fl(-2, -172, P.berry, 18)}${fl(-6, -134, P.butter, 14)}${fl(32, -126, P.rose, 13)}${fl(-36, -120, P.cream, 13)}
  <path fill="${P.cream}" d="M-50 -122 L50 -122 L10 0 L-10 0Z"/><path class="n" fill="${P.blush}" d="M-30 -122 L-6 -122 L-2 -12Z M20 -122 L40 -122 L6 -20Z"/><path fill="none" d="M-50 -122 L50 -122 L10 0 L-10 0Z"/>
  <path fill="${P.berry}" d="M-4 -52 C-30 -72 -40 -50 -22 -44 C-34 -34 -14 -26 -2 -46Z M4 -52 C30 -72 40 -50 22 -44 C34 -34 14 -26 2 -46Z"/><circle fill="${P.berry}" cx="0" cy="-48" r="7"/>`;
}
export function microphone() {
  return `<path fill="${P.charDeep}" d="M-13 -86 L13 -86 L8 -6 Q8 0 2 0 L-2 0 Q-8 0 -8 -6Z"/>
  ${R(-16, -96, 32, 14, P.butter, ' rx="5"')}
  <circle fill="${P.steel}" cx="0" cy="-122" r="30"/><path ${tl(P.steelDeep, 'stroke-width:3.5')} d="M-22 -136 L22 -136 M-28 -124 L28 -124 M-24 -110 L24 -110 M-10 -150 L-10 -96 M8 -150 L8 -96"/>
  <circle fill="none" cx="0" cy="-122" r="30"/>${glint('M-18 -140 Q-10 -148 0 -148', 4)}
  <circle fill="${P.berry}" class="thin" cx="0" cy="-54" r="6"/>`;
}
export function topHat() {
  return `<path fill="${P.charDeep}" d="M-38 -26 L-42 -110 Q0 -118 42 -110 L38 -26Z"/><ellipse fill="${P.char}" cx="0" cy="-110" rx="42" ry="9"/>
  <path fill="${P.berry}" d="M-39 -54 L39 -54 L38 -30 L-38 -30Z"/>
  <path fill="${P.charDeep}" d="M-66 -24 Q0 -38 66 -24 Q72 -8 56 -4 Q0 -16 -56 -4 Q-72 -8 -66 -24Z"/>
  ${glint('M-24 -96 L-22 -62', 4)}`;
}
export function masquerade([c, d] = [P.teal, P.tealDeep]) {
  const hole = (x) => `M${x - 15} -38 C${x - 15} -52 ${x + 15} -52 ${x + 15} -38 C${x + 15} -26 ${x - 15} -26 ${x - 15} -38Z`;
  return `<g transform="translate(58 -48) rotate(28)"><path fill="${d}" d="M0 0 C-16 -22 -14 -58 0 -80 C14 -58 16 -22 0 0Z"/><path class="d" d="M0 -4 L0 -66 M0 -24 L-8 -32 M0 -40 L8 -48 M0 -52 L-6 -58"/></g>
  <path fill="${c}" fill-rule="evenodd" d="M-74 -66 C-56 -58 -16 -60 0 -48 C16 -60 56 -58 74 -66 C72 -32 60 -14 38 -14 C22 -14 8 -26 0 -24 C-8 -26 -22 -14 -38 -14 C-60 -14 -72 -32 -74 -66Z ${hole(-32)} ${hole(32)}"/>
  ${[-1, 1].map((s) => [.2, .5, .8].map((u) => `<circle class="n" fill="${P.butter}" cx="${f(s * (8 + u * 58))}" cy="${f(-54 - u * 6)}" r="3.5"/>`).join('')).join('')}
  <circle fill="${P.butter}" class="thin" cx="0" cy="-40" r="6"/>`;
}
export function sparkleMask([c, d] = [P.rose, P.roseDeep]) {
  const hole = (x) => `M${x - 14} -30 C${x - 14} -44 ${x + 14} -44 ${x + 14} -30 C${x + 14} -17 ${x - 14} -17 ${x - 14} -30Z`;
  return `<path fill="${c}" fill-rule="evenodd" d="M-66 -44 C-56 -58 -12 -54 0 -46 C12 -54 56 -58 66 -44 C70 -24 60 -10 38 -10 C22 -10 8 -22 0 -20 C-8 -22 -22 -10 -38 -10 C-60 -10 -70 -24 -66 -44Z ${hole(-32)} ${hole(32)}"/>
  <path fill="${c}" d="M64 -38 L86 -48 L82 -30Z M-64 -38 L-86 -48 L-82 -30Z"/><path class="n" fill="${d}" d="M-56 -24 Q-44 -14 -30 -16 L-30 -12 Q-46 -10 -58 -20Z"/>
  ${sprinkle([[0, -38, 10], [-56, -44, 7], [56, -44, 7]])}
  <g class="n" fill="#fff">${[[-50, -18], [50, -18], [-10, -26], [12, -30], [-30, -50], [30, -50]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`).join('')}</g>`;
}

// ---------------------------------------------------------------------------
// COSTUMES (flat on a hanger; origin = the hem's centre)
// ---------------------------------------------------------------------------
const hanger = (y) => `<path class="d" d="M0 ${y - 30} Q0 ${y - 44} 10 ${y - 44} Q20 ${y - 44} 20 ${y - 34}"/><path fill="${P.woodLight}" d="M-50 ${y + 4} L0 ${y - 22} L50 ${y + 4} L44 ${y + 8} L0 ${y - 14} L-44 ${y + 8}Z"/><path class="d" d="M0 ${y - 30} L0 ${y - 20}"/>`;
const puffs = (y, c) => `<path fill="${c}" d="${scallop(-46, y + 12, 20, 16, 7, 4)}"/><path fill="${c}" d="${scallop(46, y + 12, 20, 16, 7, 4)}"/>`;
function gown([c, d, g]) {
  return `${hanger(-200)}${puffs(-196, c)}<path fill="${c}" d="M-36 -200 L36 -200 L40 -126 L-40 -126Z"/><path class="d" d="M-26 -196 Q-12 -182 0 -192 Q12 -182 26 -196"/>
  <path fill="${g}" d="M-38 -128 L38 -128 Q60 -70 86 -12 L86 0 ${[...Array(8)].map((_, i) => `Q${f(86 - 21.5 * (i + .5))} 14 ${f(86 - 21.5 * (i + 1))} 0`).join(' ')} L-86 -12 Q-60 -70 -38 -128Z"/>
  <path fill="${c}" d="M-38 -128 L38 -128 Q58 -74 82 -24 L82 -16 ${[...Array(8)].map((_, i) => `Q${f(82 - 20.5 * (i + .5))} -4 ${f(82 - 20.5 * (i + 1))} -16`).join(' ')} L-82 -24 Q-58 -74 -38 -128Z"/>
  <path ${tl(d, 'stroke-width:4')} d="M-16 -118 Q-30 -70 -50 -30 M16 -118 Q30 -70 50 -30 M0 -118 L0 -30"/>
  ${sprinkle([[-44, -60, 7], [30, -86, 6], [52, -44, 7], [-14, -40, 6]], g)}
  ${R(-40, -134, 80, 14, g, ' rx="6"')}${heart(0, -127, .6, P.berry)}`;
}
function coat([c, d, g], kind) {
  // royal coat / pirate coat / tuxedo / knight tunic / wizard robe / star dress, flat on a hanger
  const sleeves = `<path fill="${c}" d="M-40 -196 L-70 -180 L-92 -84 L-70 -78 L-50 -150Z"/><path fill="${c}" d="M40 -196 L70 -180 L92 -84 L70 -78 L50 -150Z"/>`;
  if (kind === 'royal') return `${hanger(-200)}${sleeves}${R(-94, -92, 26, 14, g, ' rx="5" transform="rotate(12 -81 -85)"')}${R(68, -92, 26, 14, g, ' rx="5" transform="rotate(-12 81 -85)"')}
    <path fill="${c}" d="M-44 -200 L44 -200 L52 -30 Q52 -20 42 -20 L-42 -20 Q-52 -20 -52 -30Z"/><path class="d" d="M0 -190 L0 -22"/>
    <path fill="${P.berry}" d="M-40 -196 L-24 -200 L50 -64 L48 -44Z"/><circle fill="${g}" class="thin" cx="30" cy="-80" r="9"/>
    ${[-160, -120, -80, -48].map((y) => `<circle fill="${g}" class="thin" cx="-14" cy="${y}" r="4.5"/><circle fill="${g}" class="thin" cx="14" cy="${y}" r="4.5"/>`).join('')}
    ${R(-26, -210, 52, 16, g, ' rx="7"')}<path fill="${g}" d="${scallop(-56, -188, 22, 12, 6, 4, 180, 360, false)}Z"/><path fill="${g}" d="${scallop(56, -188, 22, 12, 6, 4, 180, 360, false)}Z"/>${R(-54, -32, 108, 12, d, ' rx="5"')}`;
  if (kind === 'pirate') return `${hanger(-200)}${sleeves}<path fill="${g}" d="M-96 -106 L-66 -100 L-64 -72 L-96 -78Z M96 -106 L66 -100 L64 -72 L96 -78Z"/>
    <path fill="${c}" d="M-4 -200 L-44 -200 L-52 -110 L-70 -8 L-10 -8 L-4 -100Z"/><path fill="${c}" d="M4 -200 L44 -200 L52 -110 L70 -8 L10 -8 L4 -100Z"/>
    <path fill="${P.cream}" d="M-18 -200 L18 -200 L12 -104 L-12 -104Z"/>${[0, 1, 2].map((i) => `<path fill="${P.cream}" d="${scallop(0, -186 + i * 14, 14 - i * 2, 7, 6, 3)}"/>`).join('')}
    ${[-170, -140, -110].map((y) => `<circle fill="${g}" class="thin" cx="-28" cy="${y}" r="4.5"/><circle fill="${g}" class="thin" cx="28" cy="${y}" r="4.5"/>`).join('')}
    ${R(-54, -112, 108, 14, P.woodDark, ' rx="5"')}${R(-11, -116, 22, 22, P.butter, ' class="thin" rx="4"')}`;
  if (kind === 'tux') return `${hanger(-200)}${sleeves}${R(-86, -90, 18, 10, P.cream, ' rx="3" transform="rotate(12 -77 -85)"')}${R(68, -90, 18, 10, P.cream, ' rx="3" transform="rotate(-12 77 -85)"')}
    <path fill="${c}" d="M-44 -200 L44 -200 L50 -80 L52 -10 L22 -40 L-22 -40 L-52 -10 L-50 -80Z"/>
    <path fill="${P.cream}" d="M-26 -200 L26 -200 L0 -120Z"/><path fill="${d}" d="M-26 -200 L-18 -186 L-6 -120 L0 -120Z M26 -200 L18 -186 L6 -120 L0 -120Z"/>
    <path fill="${g}" d="M0 -188 L-18 -198 L-18 -178Z M0 -188 L18 -198 L18 -178Z"/><circle fill="${g}" class="thin" cx="0" cy="-188" r="5"/>
    <circle fill="${d}" class="thin" cx="-8" cy="-96" r="4"/><circle fill="${d}" class="thin" cx="-8" cy="-76" r="4"/><path class="thin" fill="${P.cream}" d="M18 -160 L36 -160 L32 -172Z"/>`;
  if (kind === 'knight') return `${hanger(-200)}<path fill="${P.steel}" d="M-40 -196 L-70 -180 L-92 -84 L-70 -78 L-50 -150Z"/><path fill="${P.steel}" d="M40 -196 L70 -180 L92 -84 L70 -78 L50 -150Z"/>
    <path fill="${P.steel}" d="M-44 -200 L44 -200 L48 -60 L-48 -60Z"/><path ${tl(P.steelDeep, 'stroke-width:3.5')} d="${[-180, -160, -140, -120, -100, -80].map((y) => `M-44 ${y} ${[...Array(6)].map((_, i) => `Q${-44 + 88 * (i + .5) / 6} ${y + 7} ${f(-44 + 88 * (i + 1) / 6)} ${y}`).join(' ')}`).join(' ')}"/><path fill="none" d="M-44 -200 L44 -200 L48 -60 L-48 -60Z"/>
    <path fill="${c}" d="M-32 -202 L32 -202 L34 -24 L0 -6 L-34 -24Z"/><circle fill="${P.cream}" class="thin" cx="0" cy="-130" r="20"/><path fill="${P.mustard}" class="thin" d="${star(0, -130, 16, 7)}"/>
    ${R(-50, -80, 100, 12, P.woodDark, ' rx="5"')}${R(-8, -84, 16, 20, P.butter, ' class="thin" rx="3"')}`;
  if (kind === 'wizard') return `${hanger(-200)}<path fill="${c}" d="M-40 -196 L-70 -180 L-100 -76 L-60 -70 L-50 -150Z"/><path fill="${c}" d="M40 -196 L70 -180 L100 -76 L60 -70 L50 -150Z"/>${R(-104, -82, 46, 10, g, ' rx="4" transform="rotate(8 -81 -77)"')}${R(58, -82, 46, 10, g, ' rx="4" transform="rotate(-8 81 -77)"')}
    <path fill="${g}" d="M-44 -200 L44 -200 Q60 -100 74 0 L-74 0 Q-60 -100 -44 -200Z"/><path fill="${c}" d="M-44 -200 L44 -200 Q58 -104 70 -12 L-70 -12 Q-58 -104 -44 -200Z"/>
    <path class="d" d="M0 -190 L0 -14"/><path fill="${g}" class="thin" d="M-24 -52 A14 14 0 1 0 -24 -24 A10 10 0 1 1 -24 -52Z"/>${sprinkle([[30, -70, 9], [-30, -150, 8], [26, -160, 7], [40, -30, 7]], g)}
    <path fill="none" style="stroke:${g};stroke-width:6" d="M-46 -130 Q0 -122 46 -130"/>`;
  if (kind === 'star') return `${hanger(-200)}${puffs(-196, c)}<path fill="${c}" d="M-34 -200 L34 -200 L38 -120 L-38 -120Z"/>
    <path fill="${c}" d="M-38 -122 L38 -122 Q56 -70 74 -10 Q74 0 64 0 L-64 0 Q-74 0 -74 -10 Q-56 -70 -38 -122Z"/>
    ${sprinkle([[-40, -70, 10], [10, -90, 8], [44, -50, 10], [-10, -30, 11], [30, -160, 9], [-18, -170, 7]], g)}${R(-40, -128, 80, 10, d, ' rx="5"')}`;
  return '';
}
function tutuDress([c, d, g]) {
  return `${hanger(-200)}<path class="d" d="M-24 -200 L-30 -186 M24 -200 L30 -186"/>
  <path fill="${c}" d="M-30 -188 Q-16 -170 0 -182 Q16 -170 30 -188 L36 -110 L-36 -110Z"/>${sprinkle([[0, -146, 12]], g)}
  <path fill="${d}" d="${scallop(0, -110, 92, 70, 16, 7, 0, 180, false)}Z"/><path fill="${c}" d="${scallop(0, -114, 80, 56, 14, 7, 0, 180, false)}Z"/>
  <g class="n" fill="${g}">${[[-60, -90], [-28, -70], [4, -80], [36, -66], [62, -92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('')}</g>${R(-40, -120, 80, 14, d, ' rx="6"')}`;
}
function capeProp([c, d, g], bolt) {
  const out = 'M-22 -156 Q-50 -90 -52 -4 L-36 -20 L-20 -2 L-2 -20 L16 -2 L34 -20 L52 -4 L74 -22 Q98 -20 112 -44 Q70 -80 40 -120 Q24 -144 22 -156Z';
  return `<path fill="${c}" d="${out}"/><path class="n" fill="${d}" d="M-30 -18 Q-34 -80 -12 -140 L-4 -138 Q-22 -80 -18 -14Z M28 -18 Q30 -70 14 -132 L22 -134 Q42 -80 44 -18Z"/><path fill="none" d="${out}"/>
  ${bolt ? `<path fill="${g}" class="thin" d="M50 -110 L72 -110 L60 -84 L76 -84 L44 -40 L54 -72 L38 -72Z"/>` : ''}
  <path fill="${c}" d="M-36 -168 Q0 -150 36 -168 L28 -146 Q0 -134 -28 -146Z"/><path fill="${g}" class="thin" d="M-4 -170 L10 -170 L2 -156 L12 -156 L-6 -136 L-2 -150 L-10 -150Z"/>`;
}
function ears(kind, [c, d, g]) {
  const band = `<path fill="${d}" d="M-62 0 C-56 -60 56 -60 62 0 L52 2 C46 -46 -46 -46 -52 2Z"/>`;
  if (kind === 'cat') return `<path fill="${c}" d="M-46 -30 Q-40 -82 -20 -84 Q-6 -62 -6 -40Z M46 -30 Q40 -82 20 -84 Q6 -62 6 -40Z"/><path class="n" fill="${g}" d="M-38 -38 Q-34 -70 -22 -72 Q-14 -58 -14 -44Z M38 -38 Q34 -70 22 -72 Q14 -58 14 -44Z"/>${band}`;
  if (kind === 'bunny') return `<g transform="translate(-24 -38) rotate(-12)"><path fill="${c}" d="M-16 0 C-22 -60 -14 -94 0 -94 C14 -94 22 -60 16 0Z"/><path class="n" fill="${g}" d="M-7 -8 C-10 -52 -6 -78 0 -78 C6 -78 10 -52 7 -8Z"/></g>
    <g transform="translate(24 -38) rotate(14)"><path fill="${c}" d="M-16 0 C-20 -40 -14 -62 0 -62 C14 -62 20 -40 16 0Z"/><path fill="${c}" d="M-12 -58 Q4 -80 34 -64 Q26 -48 12 -54Z"/><path class="n" fill="${g}" d="M-7 -8 C-10 -34 -6 -50 0 -50 C6 -50 10 -34 7 -8Z"/></g>${band}`;
  // lion mane on a band
  return `<path fill="${d}" fill-rule="evenodd" d="${scallop(0, -52, 70, 54, 16, 10)} M-30 -48 A30 30 0 1 0 30 -48 A30 30 0 1 0 -30 -48Z"/><path fill="${c}" fill-rule="evenodd" d="${scallop(0, -52, 60, 46, 14, 9)} M-30 -48 A30 30 0 1 0 30 -48 A30 30 0 1 0 -30 -48Z"/>
    <circle fill="${c}" cx="-42" cy="-94" r="14"/><circle fill="${c}" cx="42" cy="-94" r="14"/><circle class="n" fill="${g}" cx="-42" cy="-93" r="6"/><circle class="n" fill="${g}" cx="42" cy="-93" r="6"/>
    <path ${tl(d, 'stroke-width:4')} d="M-50 -20 q-8 -6 -4 -14 M50 -20 q8 -6 4 -14 M-58 -60 q-8 -2 -8 -10 M58 -60 q8 -2 8 -10"/>`;
}
function pirateHat() {
  return `<path fill="${P.charDeep}" d="M-50 -30 C-54 -90 -20 -100 0 -100 C20 -100 54 -90 50 -30Z"/>
  <rect fill="${P.cream}" class="thin" x="-22" y="-80" width="44" height="8" rx="4" transform="rotate(28 0 -70)"/><rect fill="${P.cream}" class="thin" x="-22" y="-80" width="44" height="8" rx="4" transform="rotate(-28 0 -70)"/>
  <circle fill="${P.cream}" class="thin" cx="0" cy="-74" r="12"/><circle class="ink" cx="-4" cy="-75" r="2.6"/><circle class="ink" cx="4" cy="-75" r="2.6"/>
  <path fill="${P.charDeep}" d="M-96 -96 Q-50 -6 0 0 Q50 -6 96 -96 Q74 -62 42 -52 Q20 -46 0 -44 Q-20 -46 -42 -52 Q-74 -62 -96 -96Z"/>
  <path fill="none" style="stroke:${P.butter};stroke-width:6" d="M-86 -84 Q-48 -12 0 -8 Q48 -12 86 -84"/>`;
}
function wizardHat() {
  return `<path fill="${P.plum}" d="M-50 -20 C-36 -80 -4 -140 44 -160 Q16 -110 50 -20Z"/>
  ${sprinkle([[-12, -60, 11], [8, -104, 8], [24, -40, 7]])}<circle fill="${P.butter}" class="thin" cx="44" cy="-160" r="7"/>
  ${R(-72, -30, 144, 22, P.plumDeep, ' rx="11"')}<path fill="none" style="stroke:${P.butter};stroke-width:5" d="M-44 -38 Q0 -46 44 -38"/>`;
}
function boa() {
  const pts = [...Array(16)].map((_, i) => { const u = i / 15; return [f(-80 + 160 * u), f(-30 - Math.sin(u * Math.PI * 2) * 22)]; });
  return pts.map(([x, y], i) => `<path fill="${i % 3 === 1 ? P.roseDeep : P.rose}" d="${scallop(x, y, 16, 14, 8, 5)}"/>`).join('')
    + `<g class="n" fill="${P.blush}">${pts.filter((_, i) => i % 2).map(([x, y]) => `<circle cx="${x - 3}" cy="${y - 4}" r="4"/>`).join('')}</g>`;
}
function sunglasses() {
  const lens = (x) => `<path fill="${P.charDeep}" class="thin" d="M${x - 26} -44 L${x + 26} -44 Q${x + 26} -12 ${x} -12 Q${x - 26} -12 ${x - 26} -44Z"/><path class="n" fill="#fff" opacity=".7" d="M${x - 18} -38 l10 0 l-8 10Z"/>`;
  return `${lens(-32)}${lens(32)}<path class="d" d="M-6 -42 Q0 -48 6 -42 M-58 -42 L-76 -50 M58 -42 L76 -50"/>`;
}
function wings() {
  const w = (s) => `<path fill="${P.lav}" d="M${s * 6} -70 C${s * 50} -150 ${s * 116} -110 ${s * 92} -66 C${s * 110} -36 ${s * 74} 4 ${s * 6} -56Z"/><ellipse class="n" fill="${P.sky}" cx="${s * 62}" cy="-98" rx="14" ry="10"/><circle class="n" fill="#fff" cx="${s * 58}" cy="-44" r="7"/>`;
  return `${w(-1)}${w(1)}${R(-8, -80, 16, 30, P.plum, ' rx="8"')}`;
}

// ---------------------------------------------------------------------------
// SNACKS, TICKETS, FLOWERS, TAPES, INSTRUMENTS
// ---------------------------------------------------------------------------
export function popcorn(state = 'full') {
  const box = `<path fill="${P.cream}" d="M-40 -92 L40 -92 L30 0 L-30 0Z"/><path class="n" fill="${P.berry}" d="M-30 -92 L-16 -92 L-12 0 L-22 0Z M-2 -92 L12 -92 L10 0 L0 0Z M24 -92 L38 -92 L30 0 L20 0Z"/><path fill="none" d="M-40 -92 L40 -92 L30 0 L-30 0Z"/>
    <circle fill="${P.butter}" class="thin" cx="0" cy="-50" r="14"/><path fill="${P.berry}" class="thin" d="${star(0, -50, 9, 4)}"/>`;
  const pops = { full: [[-30, -98], [-12, -110], [8, -104], [26, -98], [-22, -118], [0, -126], [18, -120], [34, -108], [-36, -104]], half: [[-26, -96], [-4, -100], [20, -96], [6, -110]], empty: [] }[state];
  return pops.map(([x, y]) => `<path fill="${P.egg}" d="${scallop(x, y, 12, 11, 6, 4)}"/><circle class="n" fill="${P.butter}" cx="${x + 2}" cy="${y + 2}" r="4"/>`).join('') + box;
}
export function lemonadeCup(full = true) {
  return `<path fill="${P.berry}" d="M8 -118 L20 -150 L28 -146 L16 -114Z"/>
  <path fill="${P.glass}" d="M-30 -110 L30 -110 L24 0 L-24 0Z"/>${full ? `<path class="n" fill="${P.lemon}" d="M-27 -92 L27 -92 L24 -4 L-24 -4Z"/><circle class="n" fill="#fff" cx="-8" cy="-60" r="4"/><circle class="n" fill="#fff" cx="8" cy="-34" r="3"/>` : ''}<path fill="none" d="M-30 -110 L30 -110 L24 0 L-24 0Z"/>
  ${R(-34, -118, 68, 10, P.cream, ' rx="4"')}<circle fill="${P.lemon}" cx="-28" cy="-110" r="16"/><path ${tl('#E0BE4E', 'stroke-width:3')} d="M-28 -110 L-38 -120 M-28 -110 L-16 -118 M-28 -110 L-28 -96"/>
  ${glint('M-18 -80 L-16 -30', 4)}`;
}
export function ticket(stamped = false) {
  return `<g transform="rotate(-6)"><path fill="${P.butter}" d="M-60 -54 L60 -54 Q60 -44 66 -40 L66 -14 Q60 -10 60 0 L-60 0 Q-60 -10 -66 -14 L-66 -40 Q-60 -44 -60 -54Z"/>
    <path class="d" style="stroke-dasharray:6 6" d="M30 -50 L30 -4"/><path class="thin" fill="${P.berry}" d="${star(-14, -27, 16, 7)}"/><circle class="thin" fill="${P.cream}" cx="46" cy="-27" r="8"/>
    ${stamped ? `<circle class="n" fill="none" style="stroke:${P.plum};stroke-width:4" cx="8" cy="-26" r="22"/>${heart(8, -24, 1.1, P.plum, 'n')}` : ''}</g>`;
}
export function rose() {
  return `<g transform="rotate(-20)"><path fill="${P.leafDeep}" d="M-3 0 L-3 -96 L3 -96 L3 0Z"/>${leaf(28, 9, -60, P.leaf, 0, -40)}${leaf(24, 8, 55, P.leafLight, 0, -62)}
    <path fill="${P.leaf}" d="M-16 -94 L0 -104 L16 -94 L0 -98Z"/>
    <path fill="${P.berry}" d="M-18 -106 Q-22 -130 -6 -138 Q0 -128 6 -138 Q22 -130 18 -106 Q0 -94 -18 -106Z"/><path class="d" d="M-6 -126 Q0 -116 8 -126 M-10 -110 Q0 -104 10 -112"/></g>`;
}
export function program() {
  return `<path fill="${P.plum}" d="M-44 -110 L44 -110 L44 0 L-44 0Z"/><path fill="${P.plumDeep}" d="M-44 -110 L-34 -110 L-34 0 L-44 0Z"/>
  <path fill="${P.butter}" class="thin" d="${star(4, -70, 24, 10)}"/>${R(-20, -34, 48, 8, P.cream, ' rx="4"')}${R(-12, -20, 32, 6, P.cream, ' rx="3"')}`;
}
export function tape(c = P.rose) {
  return `${R(-60, -76, 120, 76, P.charHi, ' rx="8"')}${R(-50, -68, 100, 36, c, ' rx="5"')}${R(-34, -60, 68, 20, P.cream, ' rx="10"')}
  <circle fill="#fff" cx="-18" cy="-50" r="8"/><circle fill="#fff" cx="18" cy="-50" r="8"/><path class="d" d="M-22 -50 L-14 -50 M14 -50 L22 -50"/>
  <path fill="${P.char}" d="M-34 0 L-26 -20 L26 -20 L34 0Z"/>${heart(-40, -58, .45, P.cream, 'n')}`;
}
export function tambourine() {
  return `<ellipse fill="${P.woodLight}" cx="0" cy="-44" rx="44" ry="44"/><ellipse fill="${P.cream}" cx="0" cy="-44" rx="32" ry="32"/><path class="thin" fill="${P.rose}" d="${star(0, -44, 14, 6)}"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => { const a = i * Math.PI / 3 + .5; return `<ellipse fill="${P.butter}" class="thin" cx="${f(Math.cos(a) * 38)}" cy="${f(-44 + Math.sin(a) * 38)}" rx="9" ry="6"/>`; }).join('')}`;
}
export function maracas() {
  const m = (x, a, c) => `<g transform="translate(${x} 0) rotate(${a})">${R(-5, -60, 10, 60, P.woodDeep, ' rx="5"')}<ellipse fill="${c}" cx="0" cy="-86" rx="26" ry="32"/><path ${tl('#fff', 'stroke:#fff;stroke-width:5;opacity:.7')} d="M-14 -98 Q-8 -108 2 -110"/><path class="d" d="M-24 -78 Q0 -70 24 -78"/><g class="n" fill="${P.cream}"><circle cx="-10" cy="-66" r="3"/><circle cx="8" cy="-64" r="3"/></g></g>`;
  return m(-18, -12, P.terra) + m(20, 14, P.teal);
}

// ---------------------------------------------------------------------------
// the list
// ---------------------------------------------------------------------------
const W = (label, slot, piece, variants, colors, extra = {}) => ({
  label, tags: ['wear', `wearable:${slot}`, 'theater', 'costume'], variants,
  wear: { piece, slot, colors }, ...extra,
});
const V3 = (map, fn) => Object.fromEntries(Object.entries(map).map(([k, c]) => [k, fn(c)]));
const cmap = (map, pre) => Object.fromEntries(Object.entries(map).map(([k, c]) => [k, { [pre]: c[0], [`${pre}-sh`]: c[1], ...(c[2] && pre !== 'face' ? { [`${pre}-2`]: c[2] } : {}) }]));

const GOWNS = { pink: [P.rose, P.roseDeep, P.butter], blue: [P.sky, P.skyDeep, P.butter], gold: [P.butter, P.mustard, P.cream] };
const MASKS = { teal: [P.teal, P.tealDeep], berry: [P.berry, '#B9575B'], lav: [P.lav, P.plum] };
const SPARKLE = { pink: [P.rose, P.roseDeep], teal: [P.teal, P.tealDeep], gold: [P.mustard, P.mustardDeep] };
const CROWNS = { gold: [P.mustard, P.mustardDeep, P.berry], silver: [P.steel, P.steelDeep, P.teal] };
const HANG = [0, -206];   // hanger hook, relative to the hem centre

export const THEATER_PROPS = {
  // ---- props shelf ----
  crown: { label: 'crown', tags: ['wear', 'wearable:hat', 'theater', 'prop'], variants: V3(CROWNS, (c) => crown(c)), grip: [0, -20],
    wear: { piece: 'crown', slot: 'hat', colors: cmap(CROWNS, 'hat') } },
  tiara: W('tiara', 'hat', 'tiara', { default: tiara() }, { default: { hat: P.steel, 'hat-sh': P.steelDeep, 'hat-2': P.rose } }, { grip: [0, -10] }),
  wand: { label: 'magic wand', tags: ['theater', 'prop', 'wand'], variants: { still: wand(false), sparkle: wand(true) }, taps: ['still', 'sparkle'], grip: [2, -40] },
  'foam-sword': { label: 'foam sword', tags: ['theater', 'prop', 'toy', 'sword'], variants: V3({ blue: [P.sky, P.skyDeep], mint: [P.mint, P.teal], pink: [P.blush, P.rose] }, (c) => foamSword(c)), grip: [-4, -32] },
  bouquet: { label: 'flower bouquet', tags: ['theater', 'prop', 'flowers'], variants: { default: bouquet() }, grip: [0, -34] },
  microphone: { label: 'microphone', tags: ['theater', 'prop', 'mic', 'sing'], variants: { default: microphone() }, grip: [0, -44] },
  'top-hat': W('top hat', 'hat', 'top-hat', { default: topHat() }, { default: { hat: P.charDeep, 'hat-sh': P.char, 'hat-2': P.berry } }, { grip: [0, -60] }),
  'masquerade-mask': W('masquerade mask', 'face', 'masquerade', V3(MASKS, (c) => masquerade(c)), cmap(MASKS, 'face'), { grip: [0, -30] }),
  // ---- costume closet (on hangers) ----
  gown: W('princess gown', 'top', 'gown', V3(GOWNS, gown), cmap(GOWNS, 'top'), { grip: HANG }),
  'royal-coat': W('prince coat', 'top', 'royal-coat', { default: coat([P.blue, P.blueDeep, P.butter], 'royal') }, { default: { top: P.blue, 'top-sh': P.blueDeep, 'top-2': P.butter } }, { grip: HANG }),
  'knight-tunic': W('knight tunic', 'top', 'knight-tunic', { default: coat([P.blue, P.blueDeep, P.butter], 'knight') }, { default: { top: P.steel, 'top-sh': P.steelDeep, 'top-2': P.blue } }, { grip: HANG }),
  'pirate-hat': W('pirate hat', 'hat', 'pirate-hat', { default: pirateHat() }, { default: { hat: P.charDeep, 'hat-sh': P.char, 'hat-2': P.butter } }, { grip: [0, -40] }),
  'pirate-coat': W('pirate coat', 'top', 'pirate-coat', { default: coat([P.denimDeep, '#55739A', P.butter], 'pirate') }, { default: { top: P.denimDeep, 'top-sh': '#55739A', 'top-2': P.butter } }, { grip: HANG }),
  'cat-ears': W('cat ears', 'hat', 'cat-ears', { default: ears('cat', [P.terra, P.terraDeep, P.blush]) }, { default: { hat: P.terra, 'hat-sh': P.terraDeep, 'hat-2': P.blush } }, { grip: [0, -20] }),
  'bunny-ears': W('bunny ears', 'hat', 'bunny-ears', { default: ears('bunny', [P.white, P.oat, P.blush]) }, { default: { hat: P.white, 'hat-sh': P.oat, 'hat-2': P.blush } }, { grip: [0, -20] }),
  'lion-mane': W('lion mane', 'hat', 'lion-mane', { default: ears('lion', [P.mustard, P.mustardDeep, P.terra]) }, { default: { hat: P.mustard, 'hat-sh': P.mustardDeep, 'hat-2': P.terra } }, { grip: [0, -52] }),
  'star-dress': W('star dress', 'top', 'star-dress', { default: coat([P.blueDeep, P.denimDeep, P.butter], 'star') }, { default: { top: P.blueDeep, 'top-sh': P.denimDeep, 'top-2': P.butter } }, { grip: HANG }),
  tuxedo: W('tuxedo jacket', 'top', 'tuxedo', { default: coat([P.charDeep, P.char, P.berry], 'tux') }, { default: { top: P.charDeep, 'top-sh': P.char, 'top-2': P.berry } }, { grip: HANG }),
  'fairy-tutu': W('fairy tutu', 'top', 'fairy-tutu', { default: tutuDress([P.blush, P.rose, P.butter]) }, { default: { top: P.blush, 'top-sh': P.rose, 'top-2': P.butter } }, { grip: HANG }),
  'fairy-wings': W('fairy wings', 'back', 'wings', { default: wings() }, { default: { back: P.lav, 'back-sh': P.sky, 'back-2': P.white } }, { grip: [0, -66] }),
  'wizard-hat': W('wizard hat', 'hat', 'wizard-hat', { default: wizardHat() }, { default: { hat: P.plum, 'hat-sh': P.plumDeep, 'hat-2': P.butter } }, { grip: [0, -40] }),
  'wizard-robe': W('wizard robe', 'top', 'wizard-robe', { default: coat([P.plum, P.plumDeep, P.butter], 'wizard') }, { default: { top: P.plum, 'top-sh': P.plumDeep, 'top-2': P.butter } }, { grip: HANG }),
  sunglasses: W('sunglasses', 'face', 'sunglasses', { default: sunglasses() }, { default: { face: P.charDeep, 'face-sh': P.char } }, { grip: [0, -28] }),
  'feather-boa': W('feather boa', 'over', 'feather-boa', { default: boa() }, { default: { over: P.rose, 'over-sh': P.roseDeep, 'over-2': P.blush } }, { grip: [0, -30] }),
  // ---- hero gear (the site's hero cape, mask and suit are reused; these are new) ----
  'sparkle-mask': W('sparkly hero mask', 'face', 'sparkle-mask', V3(SPARKLE, (c) => sparkleMask(c)), cmap(SPARKLE, 'face'), { grip: [0, -30] }),
  'lightning-cape': W('lightning cape', 'back', 'lightning-cape', { default: capeProp([P.blueDeep, P.denimDeep, P.butter], true) }, { default: { back: P.blueDeep, 'back-sh': P.denimDeep, 'back-2': P.butter } }, { grip: [0, -150] }),
  // ---- snacks and show things ----
  popcorn: { label: 'popcorn', tags: ['food', 'snack', 'theater', 'sweet'], variants: { full: popcorn('full'), half: popcorn('half'), empty: popcorn('empty') }, bites: ['full', 'half', 'empty'], grip: [0, -46] },
  'lemonade-cup': { label: 'lemonade', tags: ['drink', 'theater', 'sweet'], variants: { full: lemonadeCup(true), empty: lemonadeCup(false) }, bites: ['full', 'empty'], grip: [0, -56] },
  ticket: { label: 'ticket', tags: ['theater', 'ticket', 'paper'], variants: { blank: ticket(false), stamped: ticket(true) }, oneWay: true, grip: [0, -27] },
  rose: { label: 'rose', tags: ['theater', 'flowers', 'throw'], variants: { default: rose() }, grip: [0, -40] },
  program: { label: 'show program', tags: ['theater', 'paper', 'text'], variants: { default: program() }, grip: [0, -55] },
  tape: { label: 'tape', tags: ['theater', 'tape', 'recording'], variants: V3({ pink: P.rose, teal: P.teal, yellow: P.butter, lav: P.lav }, (c) => tape(c)), grip: [0, -38] },
  tambourine: { label: 'tambourine', tags: ['theater', 'instrument'], variants: { default: tambourine() }, grip: [-38, -44] },
  maracas: { label: 'maracas', tags: ['theater', 'instrument'], variants: { default: maracas() }, grip: [-18, -20] },
};

// Which props each spawner of rooms/theater.mjs hands out, plus the colours
// the effects/spotlights use. Copied into manifest.theater by the build.
export const THEATER_META = {
  costumes: ['gown', 'royal-coat', 'knight-tunic', 'pirate-coat', 'star-dress', 'tuxedo', 'fairy-tutu', 'wizard-robe', 'fairy-wings', 'feather-boa', 'lightning-cape'],
  hats: ['crown', 'tiara', 'top-hat', 'pirate-hat', 'cat-ears', 'bunny-ears', 'lion-mane', 'wizard-hat'],
  faces: ['masquerade-mask', 'sparkle-mask', 'sunglasses'],
  shelf: ['crown', 'wand', 'foam-sword', 'bouquet', 'microphone', 'top-hat', 'masquerade-mask'],
  heroReuse: ['hero-cape', 'hero-mask', 'hero-suit'],
  snacks: ['popcorn', 'lemonade-cup'],
  show: ['ticket', 'rose', 'program', 'tape', 'tambourine', 'maracas'],
  rack: [0, -206],
  note: 'Costumes hang on the racks by their hanger hook (grip). Wear pieces: props[id].wear (rig piece, slot, colours per variant). The site hero set (hero-cape, hero-mask, hero-suit) is reused in the closet.',
};
