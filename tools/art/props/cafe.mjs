// Cafe props (P2a.1, docs/design.md 3.1): ingredients with their prep states,
// cookware and tools, finished dishes, and the Mystery Dish kit.
// Same contract as props/starter.mjs (origin = bottom centre, the resting
// point, art units; variants[0] is the default), plus:
//   prep: { cut: [variants a chop steps through], cook: [variant at doneness 0, 1, 2, 3] }
//         doneness 3 is "extra toasty": deeper caramel, grill stripes and a
//         happy steam curl, never black or burnt-looking.
//   leaves: the prop that is left when a dish's last bite is gone (the plate).
// EXTEND adds variants to starter props (egg, bread, apple, banana) so there
// is one kind per food. CAFE_META is copied into the manifest as `cafe`.
import { P } from '../palette.mjs';
import { f, at, tl, scallop, heart, leaf, star, rrect } from '../ink.mjs';
import { cup as cupShape, cupcake } from './household.mjs';

const glint = (d, w = 4) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const wisps = (x, y, s = 1) => at(x, y, s, `<path ${tl('#fff', 'stroke:#fff;stroke-width:5;opacity:.9')} d="M0 0 q-8 -12 0 -24 q8 -12 0 -24 M16 4 q-8 -12 0 -24"/>`);
const grill = (x0, x1, y0, y1, c = P.toastyDeep, n = 3) => `<path ${tl(c, 'stroke-width:5')} d="${[...Array(n)].map((_, i) => { const t = (i + 1) / (n + 1), x = x0 + (x1 - x0) * t; return `M${f(x - 6)} ${y1} L${f(x + 6)} ${y0}`; }).join(' ')}"/>`;

// ---- bites: a scalloped notch cut out of the food, outlined, plate intact ----
let UID = 0;
/** food with bites taken out: notches [[cx, cy, r], ...] (art units). */
export function bitten(food, notches) {
  const id = `bt${++UID}`;
  const nd = notches.map(([x, y, r]) => scallop(x, y, r, r, 8, r * .2)).join(' ');
  // The food is inlined twice (not <use>d) so the outline CSS reaches it: once
  // under the notch mask, once as a white silhouette that clips the notch's ink edge.
  return `<defs><mask id="${id}m" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800"><rect class="n" x="-400" y="-400" width="800" height="800" fill="#fff"/><path class="n" fill="#000" d="${nd}"/></mask>
  <filter id="${id}w" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>
  <mask id="${id}s" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800"><g filter="url(#${id}w)">${food}</g></mask></defs>
  <g mask="url(#${id}m)">${food}</g><g mask="url(#${id}s)"><path fill="none" d="${nd}"/></g>`;
}
/** whole / bite1 / bite2 variants for a dish drawn as plate + food. */
function dishBites(plate, food, n1, n2) {
  return { whole: plate + food, bite1: plate + bitten(food, [n1]), bite2: plate + bitten(food, [n1, n2]) };
}

// ---- tableware ------------------------------------------------------------
const plateD = (w = 66, c = P.cream, rim = P.blue) => `<path fill="${c}" d="M${-w + 8} -10 Q${-w + 16} 0 ${-w + 34} 0 L${w - 34} 0 Q${w - 16} 0 ${w - 8} -10Z"/><ellipse fill="${c}" cx="0" cy="-11" rx="${w}" ry="8"/><path ${tl(rim)} d="M${-w + 18} -11 Q0 -5 ${w - 18} -11"/>`;
const bowlBack = (c = P.teal, w = 52, h = 44) => `<ellipse fill="${P.tealDeep}" class="thin" cx="0" cy="${-h}" rx="${w - 2}" ry="8"/>`;
const bowlFront = (c = P.teal, w = 52, h = 44, dots = P.cream) => `<path fill="${c}" d="M${-w} ${-h} L${w} ${-h} Q${w - 2} -6 ${w * .42} -2 L${w * .42} 0 L${-w * .42} 0 L${-w * .42} -2 Q${-w + 2} -6 ${-w} ${-h}Z"/><g class="n" fill="${dots}"><circle cx="${-w * .5}" cy="${-h * .5}" r="4"/><circle cx="0" cy="${-h * .36}" r="4"/><circle cx="${w * .5}" cy="${-h * .5}" r="4"/></g>`;

// ---------------------------------------------------------------------------
// INGREDIENTS
// ---------------------------------------------------------------------------
const tomatoWhole = () => `<g><path fill="${P.berry}" d="M0 -58 C-22 -60 -36 -44 -36 -28 C-36 -8 -18 0 0 0 C18 0 36 -8 36 -28 C36 -44 22 -60 0 -58Z"/>
  <path fill="${P.leaf}" class="thin" d="M0 -60 L-16 -66 L-6 -56 L-18 -48 L-2 -52 L0 -40 L4 -52 L18 -48 L8 -56 L16 -66Z"/><path class="d" d="M0 -62 L2 -72"/>${glint('M-24 -38 Q-26 -26 -20 -18')}</g>`;
const tomatoSlice = (x, y, r = 22) => `<g><circle fill="${P.berry}" cx="${x}" cy="${y}" r="${r}"/><circle class="n" fill="${P.rose}" cx="${x}" cy="${y}" r="${r - 6}"/>
  ${[0, 120, 240].map((a) => { const rr = (a + 30) * Math.PI / 180; return `<ellipse class="n" fill="${P.blush}" cx="${f(x + Math.cos(rr) * r * .42)}" cy="${f(y + Math.sin(rr) * r * .42)}" rx="${r * .26}" ry="${r * .2}"/><circle class="n" fill="${P.cream}" cx="${f(x + Math.cos(rr) * r * .42)}" cy="${f(y + Math.sin(rr) * r * .42)}" r="2.5"/>`; }).join('')}<circle class="n" fill="${P.berry}" cx="${x}" cy="${y}" r="3"/></g>`;
const tomatoSliced = () => `<g>${tomatoSlice(-26, -24)}${tomatoSlice(0, -28)}${tomatoSlice(26, -24)}</g>`;

const cheeseBlock = () => `<g><path fill="${P.mustard}" d="M-44 0 L-44 -34 L44 -50 L44 0Z"/><path fill="${P.butter}" d="M-44 -34 L44 -50 L28 -58 L-50 -40Z"/>
  <path fill="${P.butter}" d="M-44 0 L-44 -34 L44 -50 L44 0Z"/><g fill="${P.mustard}" class="thin"><circle cx="-24" cy="-18" r="7"/><circle cx="12" cy="-28" r="5"/><circle cx="24" cy="-12" r="8"/><ellipse cx="-6" cy="-46" rx="6" ry="2.5"/></g></g>`;
const cheeseSlice = () => `<g><path fill="${P.butter}" d="M-40 -2 L-36 -44 L38 -48 L40 -6 Q30 -10 26 0 Q10 -4 0 2 Q-18 -6 -40 -2Z"/><g fill="${P.mustard}" class="thin"><circle cx="-18" cy="-30" r="6"/><circle cx="14" cy="-34" r="5"/><circle cx="4" cy="-14" r="7"/></g></g>`;

const lettuceWhole = () => `<g><path fill="${P.leaf}" d="${scallop(0, -34, 40, 32, 10, 8)}"/><path fill="${P.leafLight}" d="${scallop(0, -32, 30, 26, 8, 7)}"/>
  <path class="d" d="M0 -8 L0 -48 M0 -26 Q-14 -34 -20 -44 M0 -30 Q12 -38 18 -48"/></g>`;
const lettuceChopped = () => `<g>${[[-30, -12, P.leafLight], [0, -16, P.leaf], [28, -12, P.leafLight], [-14, -30, P.leaf], [14, -30, P.leafLight], [0, -44, P.leafLight]].map(([x, y, c]) => `<path fill="${c}" d="${scallop(x, y, 17, 12, 7, 4)}"/><path class="d" d="M${x - 8} ${y + 2} Q${x} ${y - 4} ${x + 8} ${y}"/>`).join('')}</g>`;

const carrotWhole = () => `<g>${[-30, 0, 30].map((a, i) => leaf(30, 9, a + 40, i % 2 ? P.leaf : P.leafDeep, 34, -34)).join('')}
  <path fill="${P.terra}" d="M34 -34 Q42 -18 26 -10 L-54 -2 Q-58 -4 -54 -8 L18 -46 Q30 -48 34 -34Z"/><path ${tl(P.terraDeep, 'stroke-width:4')} d="M4 -30 L10 -22 M-18 -18 L-12 -12 M18 -38 L22 -32"/></g>`;
const coin = (x, y, r, c, inner) => `<ellipse fill="${c}" cx="${x}" cy="${y}" rx="${r}" ry="${r * .9}"/><ellipse class="n" fill="${inner}" cx="${x}" cy="${y}" rx="${r * .5}" ry="${r * .45}"/>`;
const carrotChopped = () => `<g>${[[-30, -16], [-4, -14], [22, -16], [-16, -38], [10, -38]].map(([x, y]) => coin(x, y, 15, P.terra, P.peach)).join('')}</g>`;

const onionWhole = () => `<g><path fill="${P.lav}" d="M0 -64 Q10 -52 26 -44 Q42 -32 36 -14 Q30 0 0 0 Q-30 0 -36 -14 Q-42 -32 -26 -44 Q-10 -52 0 -64Z"/>
  <path ${tl(P.plum, 'stroke-width:4')} d="M-8 -54 Q-26 -30 -14 -4 M8 -54 Q24 -30 14 -4"/><path class="d" d="M0 -64 L-2 -76 M0 -64 L6 -74"/><path class="d" d="M-6 0 L-10 8 M0 0 L0 9 M6 0 L10 8"/></g>`;
const onionChopped = () => `<g>${[[-26, -12], [2, -14], [28, -10], [-12, -32], [16, -32]].map(([x, y], i) => `<path fill="${i % 2 ? P.lav : P.cream}" d="M${x - 14} ${y + 6} Q${x - 16} ${y - 14} ${x} ${y - 14} Q${x + 16} ${y - 14} ${x + 14} ${y + 6} L${x + 7} ${y + 6} Q${x + 8} ${y - 6} ${x} ${y - 6} Q${x - 8} ${y - 6} ${x - 7} ${y + 6}Z"/>`).join('')}</g>`;

const potatoWhole = () => `<g><path fill="${P.woodLight}" d="M-40 -18 Q-44 -44 -10 -46 Q30 -52 40 -30 Q46 -6 14 -2 Q-36 4 -40 -18Z"/><g class="n" fill="${P.woodDeep}"><circle cx="-18" cy="-30" r="3"/><circle cx="10" cy="-36" r="3"/><circle cx="22" cy="-18" r="3"/><circle cx="-4" cy="-14" r="2.5"/></g></g>`;
const sticks = (c, d) => `<g>${[[-24, -4, -8], [-10, -2, 6], [4, -4, -4], [18, -2, 10], [-18, -18, 12], [8, -20, -10], [-4, -32, 4]].map(([x, y, r]) => `<rect fill="${c}" x="${x - 30}" y="${y - 8}" width="60" height="12" rx="5" transform="rotate(${r} ${x} ${y})"/>`).join('')}${d || ''}</g>`;
const friesCone = (c, extra = '') => `<g>${[-18, -8, 2, 12, 20, -2].map((x, i) => `<rect fill="${c}" x="${x - 6}" y="${-86 + (i % 3) * 8}" width="12" height="54" rx="4" transform="rotate(${(i - 2.5) * 5} ${x} -40)"/>`).join('')}
  <path fill="${P.berry}" d="M-32 -46 L32 -46 L22 -2 Q21 0 16 0 L-16 0 Q-21 0 -22 -2Z"/><path fill="${P.cream}" class="thin" d="${star(0, -24, 10, 5)}"/>${extra}</g>`;

const strawberryWhole = () => `<g><path fill="${P.berry}" d="M0 0 C-10 0 -30 -20 -30 -36 C-30 -52 -14 -54 0 -50 C14 -54 30 -52 30 -36 C30 -20 10 0 0 0Z"/>
  <g class="n" fill="${P.butter}">${[[-14, -36], [0, -38], [14, -36], [-8, -22], [8, -22], [0, -10]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="3"/>`).join('')}</g>
  <path fill="${P.leaf}" class="thin" d="M0 -48 L-18 -56 L-8 -48 L-16 -40 L0 -46 L16 -40 L8 -48 L18 -56Z"/><path class="d" d="M0 -52 L2 -62"/></g>`;
const berrySlice = (x, y, r) => `<g transform="translate(${x} ${y})"><path fill="${P.berry}" d="M0 ${r} C${-r * .5} ${r} ${-r} ${r * .1} ${-r} ${-r * .4} C${-r} ${-r} 0 ${-r} 0 ${-r * .8} C0 ${-r} ${r} ${-r} ${r} ${-r * .4} C${r} ${r * .1} ${r * .5} ${r} 0 ${r}Z"/><path class="n" fill="${P.blush}" d="M0 ${r * .6} C${-r * .3} ${r * .6} ${-r * .66} 0 ${-r * .66} ${-r * .34} C${-r * .66} ${-r * .7} 0 ${-r * .66} 0 ${-r * .5} C0 ${-r * .66} ${r * .66} ${-r * .7} ${r * .66} ${-r * .34} C${r * .66} 0 ${r * .3} ${r * .6} 0 ${r * .6}Z"/></g>`;
const strawberrySliced = () => `<g>${berrySlice(-24, -18, 18)}${berrySlice(4, -22, 20)}${berrySlice(30, -18, 17)}</g>`;
const blueberries = () => `<g>${[[-24, -12], [0, -12], [24, -12], [-12, -30], [12, -30], [0, -48]].map(([x, y]) => `<circle fill="${P.blueDeep}" cx="${x}" cy="${y}" r="13"/><path class="n" fill="${P.denimDeep}" d="${star(x, y - 5, 5, 2.4)}"/>`).join('')}${glint('M-28 -18 L-26 -12', 3)}</g>`;
const lemonWhole = () => `<g><path fill="${P.lemon}" d="M-44 -24 Q-40 -46 -4 -48 Q34 -48 42 -26 Q48 -24 46 -20 Q40 0 0 0 Q-38 0 -44 -16 Q-50 -20 -44 -24Z"/><path ${tl(P.mustard, 'stroke-width:4')} d="M-20 -38 Q-4 -42 10 -40"/>${leaf(20, 8, 60, P.leaf, 20, -46)}</g>`;
const lemonWheel = (x, y, r) => `<circle fill="${P.lemon}" cx="${x}" cy="${y}" r="${r}"/><circle class="n" fill="${P.butter}" cx="${x}" cy="${y}" r="${r - 6}"/><path ${tl(P.lemon, 'stroke-width:3')} d="${[0, 60, 120].map((a) => { const rr = a * Math.PI / 180; return `M${f(x - Math.cos(rr) * (r - 6))} ${f(y - Math.sin(rr) * (r - 6))} L${f(x + Math.cos(rr) * (r - 6))} ${f(y + Math.sin(rr) * (r - 6))}`; }).join(' ')}"/>`;
const lemonSliced = () => `<g><path fill="${P.lemon}" d="M-44 0 Q-44 -40 -8 -40 L-8 0Z"/><path class="n" fill="${P.butter}" d="M-38 -4 Q-38 -34 -12 -34 L-12 -4Z"/>${lemonWheel(22, -28, 26)}</g>`;

const sack = (c, icon, h = 80) => `<g><path fill="${c}" d="M-34 0 Q-42 ${-h * .6} -28 ${-h + 12} L-18 ${-h} L18 ${-h} L28 ${-h + 12} Q42 ${-h * .6} 34 0Z"/>
  <path fill="${c}" d="M-16 ${-h} L-22 ${-h - 12} L-8 ${-h - 6} L0 ${-h - 14} L8 ${-h - 6} L22 ${-h - 12} L16 ${-h}Z"/><rect fill="${P.woodDeep}" x="-20" y="${-h + 4}" width="40" height="8" rx="3"/>
  <circle fill="${P.cream}" class="thin" cx="0" cy="${-h * .42}" r="18"/>${at(0, -h * .42, 1, icon)}</g>`;
const wheatIcon = `${leaf(14, 5, -30, P.mustard, 0, 8)}${leaf(14, 5, 30, P.mustard, 0, 8)}${leaf(12, 5, 0, P.mustard, 0, 0)}`;
const cubeIcon = `<rect fill="#fff" class="thin" x="-9" y="-6" width="14" height="14" rx="2"/><rect fill="#fff" class="thin" x="-1" y="-12" width="12" height="12" rx="2"/>`;
const grainIcon = `${[[-6, -4], [4, -6], [-2, 5], [7, 4]].map(([x, y]) => `<ellipse fill="#fff" class="thin" cx="${x}" cy="${y}" rx="3" ry="5" transform="rotate(30 ${x} ${y})"/>`).join('')}`;
const beanIcon = `<ellipse class="thin" fill="${P.choc}" cx="0" cy="0" rx="8" ry="11" transform="rotate(20)"/><path class="d" d="M-2 -9 Q4 0 -2 9" transform="rotate(20)"/>`;

const butterStick = () => `<g><rect fill="${P.cream}" x="-46" y="-30" width="92" height="30" rx="5"/><rect fill="${P.butter}" x="-46" y="-30" width="34" height="30" rx="5"/><path class="d" d="M-12 -28 L-12 -2"/><rect class="thin" fill="${P.sky}" x="0" y="-22" width="30" height="14" rx="4"/></g>`;
const butterPat = () => `<g><path fill="${P.butter}" d="M-22 0 L-22 -18 L22 -22 L22 -4Z"/><path fill="#FAE7AE" d="M-22 -18 L22 -22 L16 -28 L-26 -24Z"/></g>`;
const milkCarton = () => `<g><rect fill="#fff" x="-26" y="-80" width="52" height="80" rx="4"/><path fill="#fff" d="M-26 -80 L-14 -98 L14 -98 L26 -80Z"/><rect fill="#fff" x="-10" y="-108" width="20" height="10" rx="2"/>
  <rect class="thin" fill="${P.sky}" x="-20" y="-60" width="40" height="40" rx="6"/><path class="n" fill="${P.ink}" d="M-12 -52 q6 -4 8 4 q-6 4 -8 -4Z M6 -38 q6 -4 8 4 q-6 4 -8 -4Z"/><circle class="n" fill="${P.leaf}" cx="0" cy="-26" r="4"/></g>`;
const chocBar = () => `<g><rect fill="${P.choc}" x="-40" y="-26" width="80" height="26" rx="4"/><path ${tl(P.brownDeep, 'stroke-width:3')} d="M-20 -24 L-20 -2 M0 -24 L0 -2 M20 -24 L20 -2 M-38 -13 L38 -13"/>
  <path fill="${P.blush}" d="M4 -30 L44 -30 L44 4 L4 4 Q10 -2 4 -8 Q10 -14 4 -20 Q10 -26 4 -30Z"/>${heart(26, -12, .9, P.rose)}</g>`;
const chocChunks = () => `<g>${[[-22, -2, -6], [4, 0, 10], [26, -2, -4], [-8, -24, 14], [16, -24, -10]].map(([x, y, r]) => `<g transform="rotate(${r} ${x} ${y - 10})"><rect fill="${P.choc}" x="${x - 12}" y="${y - 20}" width="24" height="20" rx="4"/><path class="n" fill="${P.brown}" d="M${x - 8} ${y - 16} L${x + 4} ${y - 16} L${x - 8} ${y - 8}Z"/></g>`).join('')}</g>`;
const sprinklesJar = () => `<g><rect fill="${P.glass}" x="-24" y="-70" width="48" height="70" rx="10"/>
  <g class="n">${[...Array(16)].map((_, i) => `<rect fill="${[P.berry, P.butter, P.teal, P.lav, P.rose, P.leaf][i % 6]}" x="${-16 + (i * 7) % 30}" y="${-52 + Math.floor(i / 4) * 12}" width="7" height="3" rx="1.5" transform="rotate(${(i * 47) % 180} ${-12 + (i * 7) % 30} ${-50 + Math.floor(i / 4) * 12})"/>`).join('')}</g>
  <rect fill="${P.rose}" x="-26" y="-82" width="52" height="16" rx="5"/><g class="n" fill="${P.roseDeep}"><circle cx="-12" cy="-74" r="2.5"/><circle cx="0" cy="-74" r="2.5"/><circle cx="12" cy="-74" r="2.5"/></g>${glint('M-16 -58 L-16 -44')}</g>`;
const honeyJar = () => `<g><path fill="${P.glass}" d="M-30 -8 Q-34 -40 -24 -56 L24 -56 Q34 -40 30 -8 Q30 0 22 0 L-22 0 Q-30 0 -30 -8Z"/>
  <path class="thin" fill="${P.mustard}" d="M-27 -40 L27 -40 Q30 -24 27 -9 Q26 -4 20 -4 L-20 -4 Q-26 -4 -27 -9 Q-30 -24 -27 -40Z"/>
  <rect fill="${P.woodDeep}" x="-26" y="-66" width="52" height="12" rx="4"/><path class="n" fill="${P.butter}" d="${[[-10, -24], [6, -24], [-2, -14]].map(([x, y]) => `M${x - 6} ${y} l3 -5 l6 0 l3 5 l-3 5 l-6 0Z`).join(' ')}"/>
  <path class="d" style="stroke-width:5" d="M14 -58 L30 -92"/><ellipse fill="${P.woodLight}" cx="31" cy="-98" rx="8" ry="11" transform="rotate(25 31 -98)"/><path ${tl(P.wood)} d="M24 -102 L38 -96 M26 -95 L36 -90"/></g>`;
const pastaDry = () => `<g><path fill="${P.butter}" d="M-22 -96 L22 -96 L10 -52 L20 0 L-20 0 L-10 -52Z"/><path ${tl(P.mustard, 'stroke-width:3')} d="M-12 -92 L-4 -52 L-10 -4 M0 -92 L0 -4 M12 -92 L4 -52 L10 -4"/><rect fill="${P.rose}" x="-16" y="-60" width="32" height="14" rx="6"/>${heart(0, -53, .6, P.cream)}</g>`;
const noodles = (w, y0, c = P.butter, d = P.mustard) => `<path fill="${c}" d="${scallop(0, y0, w, w * .45, 12, 6, 180, 360, false)} L${w} ${y0 + 4} Q0 ${y0 + 12} ${-w} ${y0 + 4}Z"/><path ${tl(d, 'stroke-width:3')} d="M${-w * .7} ${y0 - 4} q${w * .2} ${-w * .3} ${w * .4} 0 q${w * .2} ${w * .3} ${w * .4} 0 q${w * .2} ${-w * .3} ${w * .4} 0 M${-w * .5} ${y0 - w * .22} q${w * .25} ${-w * .2} ${w * .5} 0 q${w * .25} ${w * .2} ${w * .5} 0"/>`;
const pastaCooked = () => `<g>${noodles(40, -8)}</g>`;
const riceCooked = () => `<g><path fill="#fff" d="${scallop(0, -18, 36, 22, 11, 5, 180, 360, false)} L36 -2 Q36 0 32 0 L-32 0 Q-36 0 -36 -2Z"/><g class="n" fill="${P.oat}">${[[-18, -20], [0, -30], [16, -18], [-6, -12], [24, -8], [-24, -6]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="4" transform="rotate(40 ${x} ${y})"/>`).join('')}</g></g>`;

const sausageShape = (c, d, extra = '') => `<g><path fill="${c}" d="M-50 -14 Q-50 -30 -34 -30 L34 -30 Q50 -30 50 -14 Q50 0 34 0 L-34 0 Q-50 0 -50 -14Z"/><path class="n" fill="${d}" d="M-30 -24 L30 -24" style="stroke:${d};stroke-width:3" />${extra}
  <path class="d" d="M-54 -16 L-60 -18 M54 -16 L60 -18"/></g>`;
const fishRaw = () => `<g><path fill="${P.blue}" d="M-44 -20 Q-20 -46 20 -34 L46 -46 Q40 -22 46 2 L20 -8 Q-20 6 -44 -20Z"/><path fill="${P.sky}" class="n" d="M-36 -18 Q-10 -6 16 -12 Q-8 -18 -36 -18Z"/>
  <path class="d" d="M-14 -36 Q-8 -20 -14 -8"/><circle class="ink" cx="-30" cy="-24" r="3.5"/><path ${tl(P.blueDeep, 'stroke-width:3')} d="M0 -26 q4 4 0 8 M10 -26 q4 4 0 8"/></g>`;
const fillet = (c, d, extra = '') => `<g><path fill="${c}" d="M-46 -12 Q-44 -34 -10 -34 Q30 -36 46 -20 Q50 -8 40 -2 Q0 4 -36 0 Q-48 -2 -46 -12Z"/><path ${tl(d, 'stroke-width:4')} d="M-24 -30 Q-18 -16 -24 -4 M-4 -32 Q2 -16 -4 -2 M16 -32 Q22 -16 16 -2"/>${extra}</g>`;
const drumstick = (c, d, extra = '') => `<g><rect fill="${P.cream}" x="20" y="-26" width="30" height="12" rx="6" transform="rotate(-20 20 -20)"/><circle fill="${P.cream}" cx="50" cy="-36" r="8"/><circle fill="${P.cream}" cx="54" cy="-26" r="8"/>
  <path fill="${c}" d="M24 -24 Q14 -4 -18 -2 Q-48 -4 -48 -28 Q-46 -54 -16 -52 Q10 -50 24 -24Z"/><path class="n" fill="${d}" d="M-36 -34 Q-30 -46 -16 -46" style="stroke:${d};stroke-width:4;fill:none"/>${extra}</g>`;
const tofu = (c, edge) => `<g>${[[-22, 0], [4, 0], [-9, -24]].map(([x, y]) => `<rect fill="${c}" x="${x - 12}" y="${y - 24}" width="26" height="24" rx="4"/>${edge ? `<rect class="n" fill="${edge}" x="${x - 12}" y="${y - 6}" width="26" height="6" rx="2"/>` : ''}`).join('')}${edge ? '' : `<g class="n" fill="${P.oat}"><circle cx="-18" cy="-12" r="2"/><circle cx="8" cy="-14" r="2"/></g>`}</g>`;
const seaweed = () => `<g><rect fill="${P.nori}" x="-38" y="-52" width="76" height="52" rx="4"/><path ${tl(P.noriDeep, 'stroke-width:4')} d="M-30 -40 L30 -40 M-30 -26 L30 -26 M-30 -12 L30 -12"/></g>`;
const pancake = (c, d, top, extra = '') => `<g><path fill="${c}" d="M-50 -6 Q-50 -22 0 -22 Q50 -22 50 -6 Q50 0 42 0 L-42 0 Q-50 0 -50 -6Z"/><ellipse fill="${top}" cx="0" cy="-17" rx="46" ry="7"/>${extra}</g>`;
const batter = () => `<g><path fill="${P.butter}" d="M-44 -4 Q-48 -16 -30 -18 Q-20 -26 0 -22 Q20 -28 34 -18 Q50 -14 44 -4 Q40 0 30 0 L-34 0 Q-42 0 -44 -4Z"/><ellipse class="n" fill="#FAE7AE" cx="-8" cy="-14" rx="16" ry="4"/></g>`;
const scoopShape = (c, d) => `<g><path fill="${c}" d="${scallop(0, -34, 32, 30, 11, 5, 150, 390, false)} Q34 -10 22 -8 Q16 0 8 -8 Q0 2 -8 -8 Q-16 0 -22 -8 Q-34 -10 -30 -18Z"/><path ${tl(d, 'stroke-width:4')} d="M-16 -46 Q-8 -54 2 -52"/></g>`;
const cone = () => `<g><path fill="${P.crust}" d="M-26 -60 L26 -60 L2 0 Q0 2 -2 0Z"/><path ${tl(P.mustardDeep, 'stroke-width:3')} d="M-18 -52 L10 -18 M-6 -58 L16 -34 M18 -52 L-10 -18 M6 -58 L-14 -32"/><rect fill="${P.crust}" x="-30" y="-66" width="60" height="10" rx="5"/></g>`;

// cafe cup with saucer: empty / coffee / cocoa / latte
function cafeCup(fill) {
  const top = { empty: P.steelDeep, coffee: P.choc, cocoa: P.brown, latte: P.toast }[fill];
  return `<g>${fill !== 'empty' && fill !== 'latte' ? wisps(-6, -58, .7) : ''}<ellipse fill="${P.cream}" cx="0" cy="-5" rx="40" ry="7"/>
  <path fill="${P.cream}" d="M24 -40 Q40 -40 39 -28 Q38 -16 22 -18 L23 -24 Q31 -24 31 -29 Q31 -34 24 -34Z"/>
  <path fill="${P.cream}" d="M-28 -46 L28 -46 L24 -14 Q22 -8 14 -8 L-14 -8 Q-22 -8 -24 -14Z"/><path ${tl(P.rose, 'stroke-width:5')} d="M-26 -30 L26 -30"/>
  <ellipse fill="${top}" class="thin" cx="0" cy="-46" rx="26" ry="5"/>
  ${fill === 'latte' ? `<path class="n" fill="${P.cream}" transform="translate(0 -46) scale(1 .3)" d="M0 10 C-12 2 -14 -10 -6 -12 C-3 -12 0 -9 0 -6 C0 -9 3 -12 6 -12 C14 -10 12 2 0 10Z"/>` : ''}
  ${fill === 'cocoa' ? `<rect class="thin" fill="#fff" x="-12" y="-54" width="10" height="9" rx="3"/><rect class="thin" fill="${P.blush}" x="2" y="-52" width="9" height="8" rx="3"/>` : ''}</g>`;
}

// ---- starter extensions -------------------------------------------------
const friedEgg = (edge) => `<g>${edge ? wisps(22, -24, .6) : ''}<path fill="${P.egg}" d="M-44 -6 Q-50 -20 -30 -22 Q-20 -32 0 -26 Q22 -32 34 -20 Q52 -16 44 -4 Q40 2 20 0 Q0 4 -20 0 Q-40 2 -44 -6Z"/>
  ${edge ? `<path ${tl(P.toasty, 'stroke-width:5')} d="M-40 -8 Q-44 -18 -28 -19 Q-18 -28 0 -23 Q20 -28 32 -18 Q46 -14 40 -6"/>` : ''}
  <ellipse fill="${P.mustard}" class="thin" cx="-2" cy="-16" rx="14" ry="9"/><path class="n" fill="#fff" d="M-9 -20 Q-5 -23 -1 -21 Q-5 -19 -9 -20Z"/></g>`;
const breadSlice = (inner, crust, extra = '') => `<g><path fill="${crust}" d="M-34 0 L-34 -52 Q-50 -56 -48 -72 Q-44 -90 -20 -86 Q0 -96 20 -86 Q44 -90 48 -72 Q50 -56 34 -52 L34 0Z"/>
  <path class="thin" fill="${inner}" d="M-26 -6 L-26 -56 Q-40 -60 -38 -72 Q-36 -82 -18 -79 Q0 -88 18 -79 Q36 -82 38 -72 Q40 -60 26 -56 L26 -6Z"/>${extra}</g>`;
const appleSliced = () => `<g>${[[-20, 12], [20, -14]].map(([x, r]) => `<g transform="translate(${x} 0) rotate(${r} 0 -20)"><path fill="${P.berry}" d="M-24 -4 Q-26 -36 0 -40 Q26 -36 24 -4Z"/><path class="n" fill="${P.egg}" d="M-18 -6 Q-19 -30 0 -33 Q19 -30 18 -6Z"/><ellipse class="ink" cx="-3" cy="-18" rx="2" ry="3.5"/><ellipse class="ink" cx="4" cy="-14" rx="2" ry="3.5"/></g>`).join('')}</g>`;
const bananaSliced = () => `<g>${[[-26, -12], [0, -14], [26, -12], [-13, -32], [13, -32]].map(([x, y]) => coin(x, y, 14, P.banana, P.egg) + `<g class="n" fill="${P.bananaDeep}"><circle cx="${x - 3}" cy="${y}" r="1.5"/><circle cx="${x + 3}" cy="${y}" r="1.5"/><circle cx="${x}" cy="${y - 3}" r="1.5"/></g>`).join('')}</g>`;

// ---------------------------------------------------------------------------
// COOKWARE AND TOOLS
// ---------------------------------------------------------------------------
function saucepan(state) {
  const water = state !== 'empty';
  return `<g>${state === 'boiling' || state === 'pasta' ? `<path ${tl('#fff', 'stroke:#fff;stroke-width:6;opacity:.9')} d="M-20 -70 q-10 -18 0 -36 q10 -18 0 -36 M12 -66 q-10 -18 0 -36"/>` : ''}
  <rect fill="${P.woodDark}" x="54" y="-54" width="80" height="14" rx="7"/><rect fill="${P.steelDeep}" x="46" y="-52" width="16" height="10" rx="3"/>
  <path fill="${P.rose}" d="M-52 -60 L52 -60 L48 -6 Q47 0 40 0 L-40 0 Q-47 0 -48 -6Z"/><path ${tl(P.roseDeep)} d="M-48 -22 L48 -22"/>
  <ellipse fill="${water ? P.sky : P.roseDeep}" class="thin" cx="0" cy="-60" rx="50" ry="8"/>
  ${state === 'boiling' ? [[-26, -62, 6], [4, -60, 5], [28, -62, 7], [-8, -64, 4]].map(([x, y, r]) => `<circle fill="#fff" class="thin" cx="${x}" cy="${y}" r="${r}"/>`).join('') : ''}
  ${state === 'pasta' ? `<path ${tl(P.mustard, 'stroke-width:5')} d="M-34 -62 q8 -8 16 0 q8 8 16 0 q8 -8 16 0 q8 8 16 0"/>${[...Array(4)].map((_, i) => `<rect fill="${P.butter}" x="${-24 + i * 14}" y="-96" width="4" height="40" rx="2" transform="rotate(${(i - 1.5) * 10} ${-22 + i * 14} -60)"/>`).join('')}` : ''}</g>`;
}
function mixingBowl(fillc) {
  return `<g>${fillc ? `<ellipse fill="${fillc[0]}" cx="0" cy="-58" rx="62" ry="10"/><path class="n" fill="${fillc[1]}" d="M-30 -60 q16 -8 30 0 q14 8 30 0" style="fill:none;stroke:${fillc[1]};stroke-width:5"/>` : `<ellipse fill="${P.oat}" cx="0" cy="-58" rx="62" ry="10"/>`}
  <path fill="${P.cream}" d="M-70 -58 L70 -58 Q62 0 0 0 Q-62 0 -70 -58Z"/><path ${tl(P.roseDeep, 'stroke:' + P.roseDeep + ';stroke-width:6')} d="M-64 -38 Q0 -26 64 -38"/></g>`;
}
const whiskTool = () => `<g transform="scale(1.25) rotate(-90) translate(-10 0)"><rect fill="${P.rose}" x="-6" y="-70" width="12" height="34" rx="6"/><path class="d" d="M-4 -36 Q-20 0 0 14 Q20 0 4 -36 M0 -36 L0 14 M-2 -36 Q-11 0 0 14 Q11 0 2 -36"/></g>`;
const knife = () => `<g transform="scale(1.2)"><rect fill="${P.woodDeep}" x="10" y="-16" width="46" height="14" rx="7"/><circle class="n" fill="${P.woodLight}" cx="22" cy="-9" r="2.5"/><circle class="n" fill="${P.woodLight}" cx="42" cy="-9" r="2.5"/>
  <path fill="${P.steel}" d="M12 -20 L-44 -20 Q-58 -18 -56 -8 Q-54 0 -44 0 L12 0Z"/><path ${tl('#fff', 'stroke:#fff;stroke-width:4')} d="M-40 -14 L0 -14"/></g>`;
const spatulaTool = () => `<g transform="scale(1.25)"><rect fill="${P.woodDeep}" x="-6" y="-12" width="70" height="10" rx="5"/><rect fill="${P.teal}" x="-50" y="-18" width="46" height="18" rx="6"/><path class="d" d="M-40 -9 L-14 -9"/></g>`;
const ladleTool = (soup) => at(0, 0, 1.2, `<g transform="translate(-4 -20) rotate(-35)"><rect fill="${P.steel}" x="0" y="-5" width="60" height="10" rx="5"/><circle fill="${P.steel}" class="thin" cx="64" cy="0" r="6"/></g>
  <path fill="${P.steel}" d="M-44 -24 L4 -24 Q4 0 -20 0 Q-44 0 -44 -24Z"/><ellipse fill="${soup ? P.terra : P.steelDeep}" class="thin" cx="-20" cy="-24" rx="23" ry="5"/>${soup ? wisps(-26, -30, .5) : ''}`);
const tray = () => `<g><rect fill="${P.woodDeep}" x="-92" y="-18" width="18" height="12" rx="5"/><rect fill="${P.woodDeep}" x="74" y="-18" width="18" height="12" rx="5"/><path fill="${P.wood}" d="M-80 -18 L80 -18 L72 0 L-72 0Z"/><rect fill="${P.woodLight}" x="-82" y="-24" width="164" height="10" rx="5"/></g>`;
function bakingTray(what) {
  const cookie = (x, raw) => raw ? `<path fill="${P.toast}" d="${scallop(x, -16, 14, 9, 7, 2, 180, 360, false)} L${x + 14} -14 L${x - 14} -14Z"/><g class="n" fill="${P.choc}"><circle cx="${x - 4}" cy="-18" r="2"/><circle cx="${x + 5}" cy="-20" r="2"/></g>`
    : `<ellipse fill="${P.crust}" cx="${x}" cy="-17" rx="16" ry="6"/><g class="n" fill="${P.choc}"><circle cx="${x - 6}" cy="-18" r="2.5"/><circle cx="${x + 5}" cy="-16" r="2.5"/><circle cx="${x + 1}" cy="-20" r="2"/></g>`;
  return `<g>${what === 'cookies' ? wisps(-8, -30, .6) : ''}${what ? [-52, -18, 18, 52].map((x) => cookie(x, what === 'raw')).join('') : ''}<rect fill="${P.steel}" x="-80" y="-14" width="160" height="14" rx="4"/><rect fill="${P.steelDeep}" x="-90" y="-14" width="14" height="8" rx="3"/><rect fill="${P.steelDeep}" x="76" y="-14" width="14" height="8" rx="3"/></g>`;
}
function shaker(dots) {
  const head = { herbs: P.leaf, pepper: P.warmGreyDeep, salt: P.cream, sprinkles: P.rose }[dots];
  return `<g><path fill="${P.glass}" d="M-20 -8 L-20 -54 Q-20 -60 -14 -60 L14 -60 Q20 -60 20 -54 L20 -8 Q20 0 12 0 L-12 0 Q-20 0 -20 -8Z"/>
  <path class="thin" fill="${dots === 'salt' ? '#fff' : dots === 'pepper' ? P.warmGrey : dots === 'herbs' ? P.sage : P.blush}" d="M-16 -36 L16 -36 L16 -9 Q16 -4 11 -4 L-11 -4 Q-16 -4 -16 -9Z"/>
  ${dots === 'sprinkles' ? `<g class="n">${[P.berry, P.butter, P.teal, P.lav, P.leaf].map((c, i) => `<rect fill="${c}" x="${-12 + i * 5}" y="${-28 + (i % 2) * 10}" width="6" height="3" rx="1.5"/>`).join('')}</g>` : dots === 'herbs' ? `<g class="n" fill="${P.leafDeep}"><circle cx="-8" cy="-22" r="2"/><circle cx="4" cy="-16" r="2"/><circle cx="8" cy="-28" r="2"/></g>` : ''}
  <path fill="${head}" d="M-22 -60 Q-22 -80 0 -80 Q22 -80 22 -60Z"/><g class="n" fill="${P.ink}"><circle cx="-7" cy="-70" r="2"/><circle cx="0" cy="-74" r="2"/><circle cx="7" cy="-70" r="2"/></g>${glint('M-14 -48 L-14 -40', 3)}</g>`;
}
function sauceBottle(c) {
  return `<g><path fill="${c}" d="M-22 -8 L-24 -70 Q-24 -80 -12 -82 L12 -82 Q24 -80 24 -70 L22 -8 Q22 0 14 0 L-14 0 Q-22 0 -22 -8Z"/><path fill="${P.cream}" d="M-10 -82 L10 -82 L4 -104 L-4 -104Z"/><circle class="thin" fill="${P.cream}" cx="0" cy="-42" r="12"/>${heart(0, -42, .7, c)}${glint('M-14 -66 L-14 -52', 3)}</g>`;
}
const glassEmpty = () => `<g><path fill="${P.glass}" d="M-24 -96 L24 -96 L18 -6 Q17 0 10 0 L-10 0 Q-17 0 -18 -6Z"/>${glint('M-14 -84 L-12 -30')}</g>`;
function tipJar(level) {
  const coins = level === 'empty' ? '' : [[-12, -10], [8, -12], [-4, -24], [14, -26], [-16, -30], [0, -40], [16, -44], [-12, -48]].slice(0, level === 'coins' ? 3 : 8).map(([x, y]) => `<ellipse fill="${P.mustard}" class="thin" cx="${x}" cy="${y}" rx="10" ry="7"/>`).join('');
  return `<g><path fill="${P.glass}" d="M-28 -8 L-30 -60 Q-30 -66 -22 -66 L22 -66 Q30 -66 30 -60 L28 -8 Q28 0 20 0 L-20 0 Q-28 0 -28 -8Z"/>${coins}
  <path fill="none" d="M-28 -8 L-30 -60 Q-30 -66 -22 -66 L22 -66 Q30 -66 30 -60 L28 -8 Q28 0 20 0 L-20 0 Q-28 0 -28 -8Z"/>
  <rect fill="${P.rose}" x="-32" y="-72" width="64" height="12" rx="5"/>${heart(0, -34, 1.1, P.rose)}${glint('M-20 -56 L-20 -40')}</g>`;
}
const coinProp = () => `<g><ellipse fill="${P.mustard}" cx="0" cy="-14" rx="14" ry="14"/><path class="thin" fill="${P.butter}" d="${star(0, -14, 7, 3.2)}"/></g>`;

// ---------------------------------------------------------------------------
// DISHES (plate + food; bites cut the food only)
// ---------------------------------------------------------------------------
const pancakeStackFood = () => `<g>${[0, 1, 2].map((i) => `<path fill="${P.crust}" d="M-46 ${-14 - i * 16} Q-48 ${-28 - i * 16} 0 ${-30 - i * 16} Q48 ${-28 - i * 16} 46 ${-14 - i * 16} Q44 ${-10 - i * 16} 0 ${-10 - i * 16} Q-44 ${-10 - i * 16} -46 ${-14 - i * 16}Z"/>`).join('')}
  <path fill="${P.mustard}" d="M-40 -60 Q0 -70 40 -60 Q42 -52 34 -50 L32 -40 Q28 -36 26 -44 L24 -52 Q0 -48 -16 -52 L-18 -42 Q-22 -38 -24 -44 L-26 -54 Q-42 -54 -40 -60Z"/>
  ${butterPat().replace('<g>', '<g transform="translate(-4 -64) scale(.7)">')}<circle fill="${P.berry}" cx="24" cy="-70" r="8"/><circle fill="${P.blueDeep}" cx="36" cy="-64" r="6"/></g>`;
const burgerFood = () => `<g><path fill="${P.crust}" d="M-44 -14 L44 -14 Q44 -18 40 -20 L-40 -20 Q-44 -18 -44 -14Z M-44 -14 Q-44 -4 -34 -4 L34 -4 Q44 -4 44 -14Z"/>
  <path fill="${P.brown}" d="M-46 -30 Q-46 -40 -36 -40 L36 -40 Q46 -40 46 -30 Q46 -20 36 -20 L-36 -20 Q-46 -20 -46 -30Z"/><path ${tl(P.brownDeep, 'stroke-width:4')} d="M-30 -30 L-18 -30 M0 -32 L12 -32 M24 -28 L34 -28"/>
  <path fill="${P.butter}" d="M-44 -40 L44 -40 L40 -34 L30 -26 L22 -36 L-8 -36 L-18 -26 L-26 -36 L-44 -36Z"/>
  <rect fill="${P.berry}" x="-40" y="-48" width="80" height="10" rx="5"/>
  <path fill="${P.leafLight}" d="${scallop(0, -50, 48, 6, 12, 4)}"/>
  <path fill="${P.crust}" d="M-46 -52 Q-46 -92 0 -92 Q46 -92 46 -52Z"/><g class="n" fill="${P.cream}">${[[-24, -70], [-6, -80], [14, -74], [26, -62], [-10, -64]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.5" ry="2" transform="rotate(20 ${x} ${y})"/>`).join('')}</g>${glint('M-30 -66 Q-28 -78 -16 -84')}</g>`;
const pizzaFood = () => `<g transform="scale(1.12)"><ellipse fill="${P.crust}" cx="0" cy="-26" rx="60" ry="18"/><ellipse fill="${P.berry}" class="thin" cx="0" cy="-27" rx="50" ry="13"/>
  <path class="n" fill="${P.butter}" d="M-40 -28 Q-30 -38 -10 -34 Q10 -40 30 -32 Q44 -28 38 -22 Q20 -16 0 -20 Q-26 -14 -40 -28Z"/>
  ${[[-24, -28], [4, -32], [26, -24], [-6, -20]].map(([x, y]) => `<ellipse fill="${P.terraDeep}" class="thin" cx="${x}" cy="${y}" rx="8" ry="4.5"/>`).join('')}${leaf(12, 5, 70, P.leaf, 14, -36)}${leaf(12, 5, -60, P.leaf, -12, -24)}
  <path ${tl(P.mustardDeep, 'stroke-width:3')} d="M-54 -20 Q0 -4 54 -20"/></g>`;
const saladFood = () => `<g>${[[-30, -52, P.leaf], [-6, -60, P.leafLight], [20, -56, P.leaf], [36, -48, P.leafLight], [-40, -44, P.leafLight]].map(([x, y, c]) => `<path fill="${c}" d="${scallop(x, y, 18, 13, 7, 4)}"/>`).join('')}
  ${tomatoSlice(-10, -50, 12)}${coin(20, -46, 10, P.terra, P.peach)}${coin(-30, -46, 9, P.terra, P.peach)}<circle fill="${P.berry}" cx="6" cy="-66" r="8"/></g>`;
const spaghettiFood = () => `<g>${noodles(46, -14)}<path fill="${P.berry}" d="${scallop(0, -34, 22, 12, 8, 4)}"/>${[[-14, -40], [12, -42], [0, -48]].map(([x, y]) => `<circle fill="${P.brown}" cx="${x}" cy="${y}" r="9"/>`).join('')}${leaf(12, 5, 20, P.leaf, 4, -54)}</g>`;
const sandwichFood = () => at(0, -10, 1.2, `<path class="d" style="stroke-width:4" d="M10 -44 L14 -76"/><path fill="${P.teal}" d="M14 -76 L34 -70 L13 -64Z"/>
  <path fill="${P.crust}" d="M-40 0 L40 0 Q42 -14 36 -16 L-36 -16 Q-42 -14 -40 0Z"/><rect fill="${P.berry}" x="-38" y="-24" width="76" height="8" rx="4"/>
  <path fill="${P.butter}" d="M-38 -24 L38 -24 L34 -18 L24 -12 L18 -20 L-10 -20 L-18 -12 L-26 -20 L-38 -20Z"/><path fill="${P.leafLight}" d="${scallop(0, -26, 42, 5, 11, 3)}"/>
  <path fill="${P.crust}" d="M-40 -28 Q-40 -46 -26 -46 L26 -46 Q40 -46 40 -28Z"/><path class="thin" fill="${P.egg}" d="M-32 -30 Q-32 -40 -22 -40 L22 -40 Q32 -40 32 -30Z"/>`);
const smoothieFood = (c, d) => `<g><path class="d" style="stroke-width:6" d="M8 -90 L24 -128"/><path fill="${P.rose}" class="thin" d="M22 -128 L28 -128 L26 -118 L20 -118Z"/>
  <path fill="${P.glass}" d="M-26 -100 L26 -100 L20 -6 Q19 0 12 0 L-12 0 Q-19 0 -20 -6Z"/><path class="thin" fill="${c}" d="M-24 -84 L24 -84 L19 -9 Q18 -4 12 -4 L-12 -4 Q-18 -4 -19 -9Z"/>
  <path class="n" fill="${d}" d="M-24 -84 Q-12 -74 0 -84 Q12 -94 24 -84 L24 -80 Q12 -90 0 -78 Q-12 -70 -24 -80Z"/><g class="n" fill="${d}"><circle cx="-8" cy="-50" r="4"/><circle cx="10" cy="-36" r="3"/></g>
  ${berrySlice(-22, -100, 12)}${glint('M-16 -90 L-12 -30')}</g>`;
const smoothieEmpty = () => `<g><path class="d" style="stroke-width:6" d="M8 -90 L24 -128"/><path fill="${P.rose}" class="thin" d="M22 -128 L28 -128 L26 -118 L20 -118Z"/>${glassEmpty().replace('-96', '-100').replace('24 -96', '26 -100')}</g>`;
const makiRoll = (x, c) => `<g><rect fill="${P.nori}" x="${x - 22}" y="-40" width="44" height="30" rx="8"/><ellipse fill="${P.nori}" cx="${x}" cy="-40" rx="22" ry="11"/><ellipse fill="#fff" class="thin" cx="${x}" cy="-40" rx="16" ry="7"/><ellipse fill="${c}" class="thin" cx="${x}" cy="-40" rx="6" ry="3.5"/></g>`;
const sushiPlate = () => `<g><rect fill="${P.woodLight}" x="-72" y="-12" width="144" height="12" rx="4"/><rect fill="${P.woodDeep}" x="-60" y="-2" width="16" height="4"/><rect fill="${P.woodDeep}" x="44" y="-2" width="16" height="4"/></g>`;
const sushiFood = () => `<g transform="translate(0 2)">${makiRoll(-44, P.terra)}${makiRoll(0, P.leafLight)}${makiRoll(44, P.rose)}<path fill="${P.blush}" d="M56 -14 Q66 -26 72 -16 Q66 -10 56 -14Z"/></g>`;
const soupFood = () => `<g><ellipse fill="${P.terra}" class="thin" cx="0" cy="-44" rx="48" ry="7"/>${[[-20, -45], [14, -44]].map(([x, y]) => `<rect fill="${P.toast}" class="thin" x="${x - 6}" y="${y - 5}" width="12" height="9" rx="2"/>`).join('')}${leaf(12, 5, 70, P.leaf, 0, -44)}${wisps(-12, -58, .8)}</g>`;
const fruitBowlFood = () => `<g><path fill="${P.banana}" d="M-44 -52 Q-20 -30 20 -50 Q26 -46 20 -40 Q-18 -20 -48 -46Z"/>${berrySlice(-14, -60, 12)}${berrySlice(30, -58, 11)}
  ${[[4, -62], [16, -66], [-28, -60]].map(([x, y]) => `<circle fill="${P.blueDeep}" cx="${x}" cy="${y}" r="7"/>`).join('')}${lemonWheel(34, -46, 12)}</g>`;
const sundaeFood = () => `<g>${scoopShape(P.egg, P.oat).replace('<g>', '<g transform="translate(-16 -52) scale(.7)">')}${scoopShape(P.blush, P.rose).replace('<g>', '<g transform="translate(16 -52) scale(.7)">')}${scoopShape(P.choc, P.brownDeep).replace('<g>', '<g transform="translate(0 -74) scale(.72)">')}
  <path fill="#fff" d="${scallop(0, -104, 16, 10, 7, 4)}"/><circle fill="${P.berry}" cx="2" cy="-118" r="8"/><path class="d" d="M2 -126 Q6 -134 12 -136"/>
  <rect fill="${P.crust}" x="22" y="-122" width="10" height="44" rx="3" transform="rotate(18 26 -100)"/><g class="n">${[[-14, -90, P.teal], [10, -94, P.butter], [-4, -84, P.berry], [16, -80, P.lav]].map(([x, y, c]) => `<rect fill="${c}" x="${x}" y="${y}" width="7" height="3" rx="1.5"/>`).join('')}</g></g>`;
const sundaeGlass = () => `<g><path fill="${P.glass}" d="M-20 0 L20 0 L6 -10 L6 -24 L-6 -24 L-6 -10Z"/><path fill="${P.glass}" d="M-40 -58 L40 -58 Q36 -24 0 -22 Q-36 -24 -40 -58Z"/>${glint('M-30 -50 Q-26 -36 -16 -30')}</g>`;
const cookiesFood = () => `<g>${[[-26, -18], [24, -18], [0, -30]].map(([x, y]) => `<ellipse fill="${P.crust}" cx="${x}" cy="${y}" rx="26" ry="10"/><g class="n" fill="${P.choc}"><circle cx="${x - 10}" cy="${y - 2}" r="3"/><circle cx="${x + 6}" cy="${y - 4}" r="3"/><circle cx="${x + 12}" cy="${y + 2}" r="2.5"/><circle cx="${x - 2}" cy="${y + 3}" r="2.5"/></g>`).join('')}</g>`;
const grilledCheeseFood = () => `<g>${[[-26, -4], [24, 6]].map(([x, r]) => `<g transform="translate(${x} -14) rotate(${r})"><path fill="${P.butter}" d="M-30 0 L30 0 L0 -56Z"/><path fill="${P.crust}" d="M-34 2 L34 2 L4 -54 Q0 -60 -4 -54Z" transform="translate(0 -4)"/><path class="thin" fill="${P.toast}" d="M-24 -4 L24 -4 L0 -46Z"/>${grill(-16, 16, -34, -12, P.crust, 2)}<path fill="${P.butter}" d="M-30 0 Q-24 10 -18 0 Q-10 8 -4 0Z"/></g>`).join('')}</g>`;
const eggToastFood = () => `<g transform="translate(0 -12)"><path fill="${P.crust}" d="M-46 0 L-46 -34 Q-56 -40 -50 -50 Q-40 -60 0 -58 Q40 -60 50 -50 Q56 -40 46 -34 L46 0Z"/><path class="thin" fill="${P.toast}" d="M-38 -6 L-38 -34 Q-46 -40 -40 -46 Q-30 -52 0 -50 Q30 -52 40 -46 Q46 -40 38 -34 L38 -6Z"/>${friedEgg(false).replace('<g>', '<g transform="translate(0 -14) scale(.8)">')}</g>`;

// ---------------------------------------------------------------------------
// MYSTERY DISH: plate + a lumpy blob (colour variants) + separate face parts
// ---------------------------------------------------------------------------
export const MYSTERY_COLORS = { pink: [P.rose, P.blush], yellow: [P.butter, '#FAECC0'], green: [P.sage, P.mint], brown: [P.crust, P.toast], purple: [P.lav, '#E7DEF0'], orange: [P.peach, P.brick], blue: [P.blue, P.sky], cream: [P.oat, P.cream] };
const blob = (c, d) => `<g><path fill="${c}" d="M-48 -14 Q-56 -40 -36 -54 Q-30 -78 -6 -76 Q14 -92 30 -72 Q54 -66 50 -40 Q58 -22 46 -14Z"/>
  <g class="n" fill="${d}"><circle cx="-30" cy="-44" r="6"/><circle cx="26" cy="-56" r="5"/><circle cx="36" cy="-28" r="4"/><circle cx="-20" cy="-22" r="4"/></g>${glint('M-34 -52 Q-30 -64 -18 -68', 5)}</g>`;
const EYES = {
  googly: `<circle fill="#fff" cx="-14" cy="0" r="12"/><circle fill="#fff" cx="14" cy="-2" r="14"/><circle class="ink" cx="-10" cy="4" r="5"/><circle class="ink" cx="10" cy="4" r="6"/>`,
  wonky: `<circle fill="#fff" cx="-16" cy="2" r="9"/><circle fill="#fff" cx="12" cy="-4" r="17"/><circle class="ink" cx="-19" cy="-1" r="4"/><circle class="ink" cx="18" cy="2" r="7"/>`,
  happy: `<path class="d" style="stroke-width:4.5" d="M-22 4 Q-14 -8 -6 4 M6 4 Q14 -8 22 4"/>`,
  sleepy: `<path class="d" style="stroke-width:4.5" d="M-22 0 Q-14 8 -6 0 M6 0 Q14 8 22 0"/><path ${tl(P.ink, 'stroke-width:3')} d="M26 -10 L34 -10 L26 -2 L34 -2"/>`,
  stars: `<path class="thin" fill="${P.butter}" d="${star(-14, 0, 11, 5)}"/><path class="thin" fill="${P.butter}" d="${star(14, 0, 11, 5)}"/>`,
  dots: `<ellipse class="ink" cx="-12" cy="0" rx="4.5" ry="6"/><ellipse class="ink" cx="12" cy="0" rx="4.5" ry="6"/>`,
};
const MOUTHS = {
  grin: `<path fill="${P.mouth}" d="M-16 -4 L16 -4 Q14 12 0 12 Q-14 12 -16 -4Z"/><path class="n" fill="${P.tongue}" d="M-8 6 Q0 1 8 6 Q4 11 0 11 Q-4 11 -8 6Z"/>`,
  tongue: `<path class="d" style="stroke-width:4" d="M-14 -2 Q0 8 14 -2"/><path fill="${P.tongue}" class="thin" d="M-2 3 L10 1 Q12 14 4 14 Q-2 14 -2 3Z"/>`,
  o: `<ellipse fill="${P.mouth}" cx="0" cy="2" rx="7" ry="9"/>`,
  wavy: `<path class="d" style="stroke-width:4" d="M-18 0 q4.5 -6 9 0 q4.5 6 9 0 q4.5 -6 9 0 q4.5 6 9 0"/>`,
  teeth: `<path fill="${P.mouth}" d="M-16 -4 L16 -4 Q14 12 0 12 Q-14 12 -16 -4Z"/><rect fill="#fff" class="thin" x="-8" y="-4" width="7" height="8" rx="1.5"/><rect fill="#fff" class="thin" x="1" y="-4" width="7" height="8" rx="1.5"/>`,
  smile: `<path class="d" style="stroke-width:4" d="M-12 -2 Q0 8 12 -2"/>`,
};
const TOPPERS = {
  sprout: `<path class="d" d="M0 0 L0 -18"/>${leaf(20, 8, -50, P.leaf, 0, -14)}${leaf(22, 8, 45, P.leafDeep, 0, -16)}`,
  cherry: `<path class="d" d="M0 -14 Q4 -26 12 -30"/><circle fill="${P.berry}" cx="0" cy="-10" r="10"/>${glint('M-4 -14 L-2 -10', 3)}`,
  flag: `<path class="d" style="stroke-width:4" d="M0 0 L0 -40"/><path fill="${P.teal}" d="M0 -40 L28 -32 L0 -24Z"/>${heart(10, -32, .45, P.cream)}`,
  bow: `<path fill="${P.rose}" d="M0 -10 L-20 -22 L-20 2 Z M0 -10 L20 -22 L20 2Z"/><circle fill="${P.roseDeep}" cx="0" cy="-10" r="6"/>`,
  steam: `<path class="d" d="M-10 0 q-8 -12 0 -24 q8 -12 0 -24 M8 2 q-8 -12 0 -24"/>`,
  candle: `<rect fill="${P.blue}" x="-5" y="-30" width="10" height="30" rx="3"/><path ${tl('#fff', 'stroke:#fff;stroke-width:3')} d="M-5 -22 L5 -26 M-5 -12 L5 -16"/><path fill="${P.butter}" d="M0 -48 Q-7 -38 0 -32 Q7 -38 0 -48Z"/>`,
};

// ---------------------------------------------------------------------------
const food = (label, tags, variants, extra = {}) => ({ label, tags: ['food', 'ingredient', ...tags], variants, ...extra });
const cooked = (raw, done, toasty) => ({ raw, cooked: done, toasty });

export const CAFE_PROPS = {
  // ---- ingredients ----
  tomato: food('tomato', ['veg', 'red', 'fridge'], { whole: tomatoWhole(), sliced: tomatoSliced() }, { taps: ['whole', 'sliced'], oneWay: true, prep: { cut: ['whole', 'sliced'] } }),
  cheese: food('cheese', ['dairy', 'yellow', 'fridge'], { block: cheeseBlock(), slice: cheeseSlice() }, { taps: ['block', 'slice'], oneWay: true, prep: { cut: ['block', 'slice'] } }),
  lettuce: food('lettuce', ['veg', 'green', 'fridge'], { whole: lettuceWhole(), chopped: lettuceChopped() }, { taps: ['whole', 'chopped'], oneWay: true, prep: { cut: ['whole', 'chopped'] } }),
  carrot: food('carrot', ['veg', 'orange', 'fridge'], { whole: carrotWhole(), chopped: carrotChopped() }, { taps: ['whole', 'chopped'], oneWay: true, prep: { cut: ['whole', 'chopped'] } }),
  onion: food('onion', ['veg', 'pantry'], { whole: onionWhole(), chopped: onionChopped() }, { taps: ['whole', 'chopped'], oneWay: true, prep: { cut: ['whole', 'chopped'] } }),
  potato: food('potato', ['veg', 'pantry'], { whole: potatoWhole(), sticks: sticks(P.egg), fries: friesCone(P.toast), toasty: friesCone(P.toasty, wisps(-4, -92, .6)) },
    { prep: { cut: ['whole', 'sticks'], cook: ['sticks', 'fries', 'fries', 'toasty'] } }),
  strawberry: food('strawberry', ['fruit', 'red', 'sweet', 'fridge'], { whole: strawberryWhole(), sliced: strawberrySliced() }, { taps: ['whole', 'sliced'], oneWay: true, prep: { cut: ['whole', 'sliced'] } }),
  blueberries: food('blueberries', ['fruit', 'blue', 'sweet', 'fridge'], { default: blueberries() }),
  lemon: food('lemon', ['fruit', 'yellow', 'sour', 'fridge'], { whole: lemonWhole(), sliced: lemonSliced() }, { taps: ['whole', 'sliced'], oneWay: true, prep: { cut: ['whole', 'sliced'] } }),
  flour: food('flour', ['baking', 'pantry'], { default: sack(P.oat, wheatIcon) }),
  sugar: food('sugar', ['baking', 'sweet', 'pantry'], { default: sack(P.blush, cubeIcon, 74) }),
  butter: food('butter', ['dairy', 'fridge'], { stick: butterStick(), pat: butterPat() }, { taps: ['stick', 'pat'], oneWay: true, prep: { cut: ['stick', 'pat'] } }),
  milk: food('milk', ['dairy', 'drink', 'fridge'], { default: milkCarton() }, { grip: [0, -50] }),
  chocolate: food('chocolate', ['sweet', 'brown', 'pantry'], { bar: chocBar(), chunks: chocChunks() }, { taps: ['bar', 'chunks'], oneWay: true, prep: { cut: ['bar', 'chunks'] } }),
  sprinkles: food('sprinkles', ['sweet', 'topping', 'pantry'], { default: sprinklesJar() }),
  honey: food('honey', ['sweet', 'topping', 'pantry'], { default: honeyJar() }),
  pasta: food('pasta', ['grain', 'pantry'], { dry: pastaDry(), cooked: pastaCooked() }, { prep: { cook: ['dry', 'cooked', 'cooked', 'cooked'], method: 'boiled' } }),
  rice: food('rice', ['grain', 'pantry'], { dry: sack(P.cream, grainIcon, 70), cooked: riceCooked() }, { prep: { cook: ['dry', 'cooked', 'cooked', 'cooked'], method: 'boiled' } }),
  sausage: food('sausage', ['meat', 'fridge'], cooked(sausageShape(P.blush, P.rose), sausageShape(P.terra, P.terraDeep, grill(-40, 40, -26, -4, P.terraDeep, 4)), sausageShape(P.toasty, P.toastyDeep, grill(-40, 40, -26, -4, P.toastyDeep, 4) + wisps(-8, -34, .6))),
    { prep: { cook: ['raw', 'cooked', 'cooked', 'toasty'] } }),
  fish: food('fish', ['fish', 'fridge'], cooked(fishRaw(), fillet(P.peach, P.terra), fillet(P.toasty, P.toastyDeep, wisps(0, -36, .6))), { prep: { cook: ['raw', 'cooked', 'cooked', 'toasty'] } }),
  chicken: food('chicken', ['meat', 'fridge'], cooked(drumstick(P.blush, P.rose), drumstick(P.crust, P.mustardDeep), drumstick(P.toasty, P.toastyDeep, wisps(-20, -56, .6))), { prep: { cook: ['raw', 'cooked', 'cooked', 'toasty'] } }),
  tofu: food('tofu', ['veg', 'fridge'], { raw: tofu(P.egg), cooked: tofu(P.egg, P.crust), toasty: tofu(P.toast, P.toasty) }, { prep: { cook: ['raw', 'cooked', 'cooked', 'toasty'] } }),
  seaweed: food('seaweed', ['veg', 'pantry'], { default: seaweed() }),
  pancake: food('pancake', ['baking', 'sweet'], { batter: batter(), cooked: pancake(P.crust, P.toast, P.toast), toasty: pancake(P.toastyDeep, P.toasty, P.toasty, grill(-30, 30, -20, -14, P.toastyDeep, 3) + wisps(-6, -26, .6)) },
    { prep: { cook: ['batter', 'cooked', 'cooked', 'toasty'], method: 'fried' } }),
  scoop: food('ice cream scoop', ['sweet', 'cold', 'dessert'], { vanilla: scoopShape(P.egg, P.oat), strawberry: scoopShape(P.blush, P.rose), chocolate: scoopShape(P.choc, P.brownDeep) }),
  cone: food('ice cream cone', ['sweet', 'container'], { default: cone() }, { surface: [-24, 24, -66] }),
  'coffee-beans': food('coffee beans', ['drink', 'pantry'], { default: sack(P.woodLight, beanIcon, 74) }),
  'cafe-cup': { label: 'cafe cup', tags: ['dish', 'cup', 'drink'], variants: { empty: cafeCup('empty'), coffee: cafeCup('coffee'), cocoa: cafeCup('cocoa'), latte: cafeCup('latte') }, bites: null, grip: [30, -28] },

  // ---- cookware and tools ----
  saucepan: { label: 'saucepan', tags: ['cookware', 'container', 'pot'], variants: { empty: saucepan('empty'), water: saucepan('water'), boiling: saucepan('boiling'), pasta: saucepan('pasta') }, grip: [100, -48], surface: [-44, 44, -60] },
  'mixing-bowl': { label: 'mixing bowl', tags: ['cookware', 'container', 'bowl'], variants: { empty: mixingBowl(null), batter: mixingBowl([P.butter, '#FAE7AE']), 'choc-batter': mixingBowl([P.choc, P.brown]), 'pink-batter': mixingBowl([P.rose, P.blush]) }, surface: [-56, 56, -58] },
  whisk: { label: 'whisk', tags: ['tool'], variants: { default: whiskTool() }, grip: [50, -8] },
  knife: { label: 'knife', tags: ['tool', 'chop'], variants: { default: knife() }, grip: [34, -9] },
  spatula: { label: 'spatula', tags: ['tool', 'flip'], variants: { default: spatulaTool() }, grip: [40, -7] },
  ladle: { label: 'ladle', tags: ['tool', 'scoop'], variants: { empty: ladleTool(false), soup: ladleTool(true) }, grip: [30, -30] },
  tray: { label: 'tray', tags: ['dish', 'container'], variants: { default: tray() }, surface: [-76, 76, -24] },
  'baking-tray': { label: 'baking tray', tags: ['cookware', 'container', 'oven'], variants: { empty: bakingTray(null), raw: bakingTray('raw'), cookies: bakingTray('cookies') }, surface: [-76, 76, -14], prep: { cook: ['raw', 'cookies', 'cookies', 'cookies'], method: 'baked' } },
  'garnish-shaker': { label: 'garnish shaker', tags: ['tool', 'topping', 'shake'], variants: { herbs: shaker('herbs'), pepper: shaker('pepper'), salt: shaker('salt'), sprinkles: shaker('sprinkles') } },
  'sauce-bottle': { label: 'sauce bottle', tags: ['tool', 'topping', 'shake'], variants: { tomato: sauceBottle(P.berry), mustard: sauceBottle(P.mustard), chocolate: sauceBottle(P.choc) } },
  glass: { label: 'glass', tags: ['dish', 'cup', 'drink'], variants: { default: glassEmpty() } },
  'tip-jar': { label: 'tip jar', tags: ['container', 'shake', 'music'], variants: { empty: tipJar('empty'), coins: tipJar('coins'), full: tipJar('full') } },
  coin: { label: 'coin', tags: ['coin', 'token'], variants: { default: coinProp() } },
};

// ---- dishes ----
const DISHES = {
  pancakes: ['pancake stack', ['sweet', 'breakfast'], plateD(), pancakeStackFood(), [34, -60, 18], [-34, -56, 16]],
  burger: ['burger', ['savory'], plateD(), burgerFood(), [36, -76, 18], [-38, -72, 16]],
  pizza: ['pizza', ['savory', 'baked'], plateD(70), pizzaFood(), [46, -34, 18], [-48, -30, 16]],
  salad: ['salad', ['veg', 'healthy'], '', `${bowlBack()}${saladFood()}${bowlFront()}`, [40, -60, 16], [-44, -54, 14]],
  spaghetti: ['spaghetti', ['savory'], plateD(), spaghettiFood(), [38, -32, 16], [-40, -28, 14]],
  sandwich: ['sandwich', ['savory'], plateD(), sandwichFood(), [44, -56, 16], [-44, -52, 16]],
  sushi: ['sushi roll', ['fish', 'savory'], sushiPlate(), sushiFood(), [58, -44, 16], [-58, -44, 16]],
  soup: ['soup bowl', ['savory', 'warm'], plateD(60), `${at(0, -12, 1, `${bowlBack(P.teal, 50, 44)}${soupFood()}${bowlFront(P.teal, 50, 44)}`)}`, null, null],
  'fruit-bowl': ['fruit bowl', ['fruit', 'sweet', 'healthy'], '', `${bowlBack(P.rose)}${fruitBowlFood()}${bowlFront(P.rose, 52, 44, P.cream)}`, [40, -58, 16], [-44, -54, 14]],
  sundae: ['ice cream sundae', ['sweet', 'cold', 'dessert'], '', `${sundaeGlass()}${sundaeFood()}`, [26, -96, 14], [-26, -84, 14]],
  cookies: ['cookies', ['sweet', 'baked'], plateD(), cookiesFood(), [42, -22, 16], [-44, -22, 14]],
  'grilled-cheese': ['grilled cheese', ['savory', 'toasty'], plateD(), grilledCheeseFood(), [46, -40, 16], [-48, -36, 16]],
  'egg-toast': ['egg on toast', ['breakfast', 'savory'], plateD(), eggToastFood(), [46, -54, 16], [-46, -52, 16]],
};
for (const [id, [label, tags, plate, art, n1, n2]] of Object.entries(DISHES)) {
  const bowlish = !plate;
  const variants = n1 ? dishBites(plate, art, n1, n2) : { whole: plate + art };
  if (id === 'soup') {
    const bowl = (lvl) => at(0, -12, 1, `${bowlBack(P.teal, 50, 44)}${lvl ? `<ellipse fill="${P.terra}" class="thin" cx="0" cy="-44" rx="48" ry="7"/>${lvl > 1 ? `<rect fill="${P.toast}" class="thin" x="8" y="-49" width="12" height="9" rx="2"/>` : ''}` : ''}${bowlFront(P.teal, 50, 44)}`);
    Object.assign(variants, { bite1: plate + bowl(2), bite2: plate + bowl(1) });
  }
  CAFE_PROPS[id] = { label, tags: ['food', 'dish', ...tags], variants, bites: ['whole', 'bite1', 'bite2', null], leaves: bowlish ? (id === 'sundae' ? 'glass' : 'bowl') : (id === 'sushi' ? 'tray' : 'plate') };
}
// Smoothie: one full variant per blender colour, then the empty glass.
const SM = { pink: [P.rose, P.blush], yellow: [P.banana, P.butter], green: [P.leafLight, P.mint], purple: [P.plum, P.lav], choc: [P.choc, P.woodLight], cream: [P.oat, '#fff'] };
CAFE_PROPS.smoothie = { label: 'smoothie', tags: ['food', 'dish', 'drink', 'sweet', 'cold'],
  variants: { ...Object.fromEntries(Object.entries(SM).map(([k, [c, d]]) => [k, smoothieFood(c, d)])), empty: smoothieEmpty() },
  bites: ['pink', 'empty'], grip: [0, -50] };
CAFE_PROPS['mystery-dish'] = { label: 'mystery dish', tags: ['food', 'dish', 'mystery'],
  variants: Object.fromEntries(Object.entries(MYSTERY_COLORS).flatMap(([k, [c, d]]) => {
    const art = at(0, -12, 1, blob(c, d));
    return [[k, plateD() + art], [`${k}-bite1`, plateD() + bitten(art, [[44, -70, 16]])], [`${k}-bite2`, plateD() + bitten(art, [[44, -70, 16], [-46, -62, 15]])]];
  })), bites: ['pink', 'pink-bite1', 'pink-bite2', null], leaves: 'plate' };
// Face parts: origin at the part's centre (toppers: their base).
CAFE_PROPS['mystery-eyes'] = { label: 'mystery eyes', tags: ['mystery-part'], variants: EYES };
CAFE_PROPS['mystery-mouth'] = { label: 'mystery mouth', tags: ['mystery-part'], variants: MOUTHS };
CAFE_PROPS['mystery-topper'] = { label: 'mystery topper', tags: ['mystery-part'], variants: TOPPERS };

// ---- extra variants for starter props (one kind per food) ----
export const EXTEND = {
  egg: { variants: { fried: friedEgg(false), toasty: friedEgg(true) }, prep: { crack: ['whole', 'cracked'], cook: ['cracked', 'fried', 'fried', 'toasty'], method: 'fried' } },
  bread: { variants: { slice: breadSlice(P.egg, P.crust), toast: breadSlice(P.toast, P.crust), toasty: breadSlice(P.toasty, P.toastyDeep, grill(-20, 20, -70, -16, P.toastyDeep, 3) + wisps(-6, -92, .6)) },
    prep: { cut: ['loaf', 'sliced', 'slice'], cook: ['slice', 'toast', 'toast', 'toasty'], method: 'toasted' } },
  apple: { variants: { sliced: appleSliced() }, prep: { cut: ['whole', 'sliced'] } },
  banana: { variants: { sliced: bananaSliced() }, prep: { cut: ['peeled', 'sliced'] } },
};

// Copied into the manifest as `cafe` (world units are converted by the build where marked).
export const CAFE_META = {
  doneness: {
    levels: ['raw', 'cooked', 'cooked', 'toasty'],       // design 3.1: cooked 0..3, 3 = "extra toasty", never burnt
    note: 'prep.cook[n] names the variant for doneness n. Toasty = warm caramel + grill stripes + a steam curl.',
    // For foods without baked doneness variants, tint the sprite (CSS filter on the img; one per level).
    tint: [null, 'sepia(.25) saturate(1.15)', 'sepia(.4) saturate(1.2) brightness(.96)', 'sepia(.6) saturate(1.3) brightness(.9)'],
  },
  ingredients: ['tomato', 'egg', 'bread', 'cheese', 'lettuce', 'carrot', 'onion', 'potato', 'banana', 'apple', 'strawberry', 'blueberries', 'lemon',
    'flour', 'sugar', 'butter', 'milk', 'chocolate', 'sprinkles', 'honey', 'pasta', 'rice', 'sausage', 'fish', 'chicken', 'tofu', 'seaweed', 'pancake', 'scoop', 'cone', 'coffee-beans', 'cafe-cup'],
  dishes: [...Object.keys(DISHES), 'smoothie', 'cupcake', 'cake-slice'],
  cookware: { pan: 'pan', pot: 'pot', saucepan: 'saucepan', 'mixing-bowl': 'mixing-bowl', 'baking-tray': 'baking-tray', whisk: 'whisk', knife: 'knife', spatula: 'spatula', ladle: 'ladle', plate: 'plate', bowl: 'bowl', cup: 'cafe-cup', mug: 'mug', glass: 'glass', tray: 'tray', 'garnish-shaker': 'garnish-shaker', 'sauce-bottle': 'sauce-bottle' },
  mystery: {
    base: 'mystery-dish', colors: Object.keys(MYSTERY_COLORS),
    parts: { eyes: 'mystery-eyes', mouth: 'mystery-mouth', topper: 'mystery-topper' },
    // Where each part's origin goes, relative to the base's anchor.
    at: { eyes: [0, -56], mouth: [2, -34], topper: [4, -86] },   // art units here; the manifest has them in world units
  },
};
