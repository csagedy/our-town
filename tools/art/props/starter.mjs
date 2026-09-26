// The starter prop set (P1.12): 22 generic props with their tap-state
// variants. Origin = bottom centre (the resting point) in art units.
// Each prop: { label, tags, variants: {name: svg} (the first is the default),
// taps: the variants a tap cycles through (oneWay: stop at the last one),
// bites: the variants eating steps through (null = all gone),
// grip: [x, y] where a hand holds it (default: the middle),
// surface: [x0, x1, y] where other things sit on or in it }.
// Bites (food) are variants named bite1, bite2, ... ; the last one is what is
// left (a wrapper, a core) or nothing.
import { P } from '../palette.mjs';
import { f, at, tl, scallop, heart, leaf, star } from '../ink.mjs';
import { teapot, cupcake as cupcakeFull, croissant as croissantFull, pot as flowerPotBase, soupPot, bread as breadLoaf } from './household.mjs';

const glint = (x, y, h) => `<path ${tl('#fff', 'stroke:#fff;stroke-width:4')} d="M${x} ${y} L${x} ${y + h}"/>`;
// A bite: a scalloped notch cut out of a shape, painted in the background
// colour is not possible (props are transparent), so bites are drawn as the
// food outline with a scalloped edge. biteEdge(cx, cy, r) gives the notch path.

function mug(full) {
  const c = P.rose;
  return `<g><path fill="${c}" d="M18 -40 Q36 -40 35 -26 Q34 -12 17 -14 L17 -21 Q27 -21 27 -27 Q27 -33 18 -33Z"/>
  <path fill="${c}" d="M-22 -50 L22 -50 L20 -8 Q19 0 11 0 L-11 0 Q-19 0 -20 -8Z"/>${heart(0, -26, 1, P.cream)}
  <ellipse fill="${full ? P.choc : P.roseDeep}" class="thin" cx="0" cy="-50" rx="21" ry="4.5"/>
  ${full ? `<rect class="thin" fill="${P.cream}" x="-10" y="-58" width="10" height="9" rx="3"/><rect class="thin" fill="${P.blush}" x="3" y="-56" width="9" height="8" rx="3"/>` : ''}</g>`;
}
const plate = () => `<g><path fill="${P.cream}" d="M-56 -12 Q-50 0 -34 0 L34 0 Q50 0 56 -12Z"/><ellipse fill="${P.cream}" cx="0" cy="-12" rx="60" ry="7"/><path ${tl(P.blue)} d="M-40 -12 Q0 -6 40 -12"/></g>`;
function bowl(soup) {
  return `<g>${soup ? `<path ${tl('#fff', 'stroke:#fff;stroke-width:5;opacity:.85')} d="M-10 -52 q-8 -14 0 -28 q8 -14 0 -28 M12 -50 q-8 -14 0 -28"/>` : ''}
  <path fill="${P.teal}" d="M-46 -40 L46 -40 Q44 -6 20 -2 L20 0 L-20 0 L-20 -2 Q-44 -6 -46 -40Z"/>
  <ellipse fill="${soup ? P.terra : P.tealDeep}" class="thin" cx="0" cy="-40" rx="44" ry="7"/>
  ${soup ? `<circle class="n" fill="${P.leaf}" cx="-14" cy="-41" r="3.5"/><circle class="n" fill="${P.butter}" cx="10" cy="-39" r="4"/><circle class="n" fill="${P.leaf}" cx="24" cy="-42" r="3"/>` : ''}
  <g class="n" fill="${P.cream}"><circle cx="-26" cy="-22" r="4"/><circle cx="0" cy="-16" r="4"/><circle cx="26" cy="-22" r="4"/></g></g>`;
}
function pan(egg) {
  return at(-40, -10, 1, `
  <rect fill="${P.woodDark}" x="54" y="-8" width="84" height="16" rx="8"/><rect fill="${P.steelDeep}" x="40" y="-6" width="20" height="12" rx="4"/>
  <ellipse fill="${P.char}" cx="0" cy="2" rx="64" ry="24"/><ellipse fill="${P.charDeep}" class="thin" cx="0" cy="-2" rx="52" ry="16"/>
  ${egg ? `<path fill="${P.egg}" class="thin" d="M-30 -4 Q-32 -14 -14 -14 Q-2 -21 12 -14 Q30 -12 27 -2 Q29 8 10 7 Q-8 12 -20 7 Q-33 5 -30 -4Z"/><ellipse fill="${P.mustard}" class="thin" cx="-2" cy="-4" rx="11" ry="8"/><path class="n" fill="#fff" d="M-7 -8 Q-3 -11 1 -9 Q-3 -7 -7 -8Z"/>` : ''}`);
}
function cookingPot(open) {
  if (!open) return soupPot(P.teal);
  return `<g><path ${tl('#fff', 'stroke:#fff;stroke-width:6;opacity:.85')} d="M-20 -74 q-12 -22 0 -44 q12 -22 0 -44 M10 -70 q-12 -22 0 -44 q12 -22 0 -44"/>
  <rect fill="${P.teal}" x="-66" y="-58" width="16" height="12" rx="5"/><rect fill="${P.teal}" x="50" y="-58" width="16" height="12" rx="5"/>
  <path fill="${P.teal}" d="M-54 -66 L54 -66 L50 -6 Q49 0 42 0 L-42 0 Q-49 0 -50 -6Z"/>
  <ellipse fill="${P.terra}" class="thin" cx="0" cy="-66" rx="52" ry="8"/><circle class="n" fill="${P.leaf}" cx="-18" cy="-67" r="4"/><circle class="n" fill="${P.butter}" cx="14" cy="-65" r="4.5"/>
  <path ${tl(P.cream)} d="M-50 -24 L50 -24"/></g>`;
}
function cookieJar(open) {
  const cookies = [[-14, -24], [10, -20], [-2, -42], [16, -46], [-18, -52]].map(([x, y]) => `<circle class="thin" fill="${P.crust}" cx="${x}" cy="${y}" r="12"/><circle class="n" fill="${P.choc}" cx="${x - 3}" cy="${y - 2}" r="2.5"/><circle class="n" fill="${P.choc}" cx="${x + 4}" cy="${y + 3}" r="2.5"/>`).join('');
  const lid = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect fill="${P.rose}" x="-33" y="-8" width="66" height="16" rx="6"/><circle fill="${P.roseDeep}" cx="0" cy="-13" r="7"/></g>`;
  return `<g><rect x="-36" y="-80" width="72" height="80" rx="16" fill="${P.glass}"/>${cookies}
  <path ${tl('#fff', 'stroke:#fff;stroke-width:4')} d="M-26 -66 L-26 -50"/>
  ${open ? `<circle class="thin" fill="${P.crust}" cx="0" cy="-78" r="12"/><circle class="n" fill="${P.choc}" cx="-3" cy="-80" r="2.5"/>${lid(34, -96, 32)}` : lid(0, -86, 0)}</g>`;
}
function cupcake(stage) {
  if (stage === 0) return cupcakeFull(1);
  const wrap = `<path fill="${P.teal}" d="M-26 -40 L26 -40 L20 0 L-20 0Z"/><path ${tl(P.tealDeep)} d="M-12 -38 L-10 -2 M0 -38 L0 -2 M12 -38 L10 -2"/>`;
  if (stage === 1) {
    return `<g><path fill="${P.rose}" d="M-30 -40 Q-38 -58 -18 -62 Q-16 -80 2 -78 L6 -70 Q14 -74 12 -64 Q22 -66 20 -56 Q30 -58 30 -40Z"/><path class="d" d="M-16 -56 Q-4 -50 6 -56"/>${wrap}</g>`;
  }
  return `<g><path fill="${P.rose}" d="M-28 -40 Q-32 -50 -22 -52 Q-18 -46 -10 -50 Q-4 -44 4 -48 Q10 -44 16 -48 Q20 -44 28 -46 L28 -40Z"/>${wrap}
  <g class="n" fill="${P.crust}"><circle cx="-38" cy="-4" r="3"/><circle cx="34" cy="-3" r="2.5"/><circle cx="40" cy="-8" r="2"/></g></g>`;
}
function croissant(stage) {
  if (stage === 0) return croissantFull();
  return `<g><path fill="${P.crust}" d="M-52 -8 Q-60 -30 -34 -38 Q-6 -50 12 -44 Q6 -38 12 -32 Q4 -26 10 -18 Q2 -14 6 -6 Q-12 -4 -36 -16 Q-42 -12 -52 -8Z"/>
  <path class="d" d="M-24 -42 Q-18 -26 -26 -12 M-4 -44 Q0 -30 -4 -10"/><path class="n" fill="${P.toast}" d="M11 -42 Q7 -38 11 -32 Q5 -27 9 -19 Q3 -15 5 -8 L0 -9 Q-2 -26 3 -41Z"/></g>`;
}
function apple(stage) {
  const stem = `<path class="d" style="stroke-width:5" d="M0 -64 Q2 -74 8 -78"/>${leaf(18, 8, 60, P.leaf, 4, -70)}`;
  if (stage === 0) return `<g><path fill="${P.berry}" d="M0 -58 C-14 -70 -38 -64 -38 -36 C-38 -12 -20 2 -8 0 Q0 -2 8 0 C20 2 38 -12 38 -36 C38 -64 14 -70 0 -58Z"/>${stem}<path ${tl('#fff', 'stroke:#fff;stroke-width:4;opacity:.8')} d="M-24 -44 Q-26 -32 -20 -24"/></g>`;
  if (stage === 1) return `<g><path fill="${P.berry}" d="M0 -58 C-14 -70 -38 -64 -38 -36 C-38 -12 -20 2 -8 0 Q0 -2 8 0 C18 2 30 -6 34 -18 Q24 -18 26 -26 Q18 -28 22 -36 Q16 -40 22 -48 Q20 -58 14 -64 C8 -66 4 -62 0 -58Z"/>
    <path class="n" fill="${P.egg}" d="M31 -19 Q22 -19 23 -27 Q15 -29 19 -37 Q13 -41 19 -49 Q17 -56 13 -60 L10 -56 Q8 -40 12 -30 Q16 -22 28 -16Z"/>${stem}</g>`;
  return `<g><path fill="${P.egg}" d="M-10 -56 Q-18 -50 -12 -44 Q-20 -38 -12 -30 Q-20 -22 -10 -14 Q-16 -6 -10 0 L10 0 Q16 -6 10 -14 Q20 -22 12 -30 Q20 -38 12 -44 Q18 -50 10 -56Z"/>
    <path fill="${P.berry}" d="M-12 -62 Q0 -66 12 -62 L10 -56 L-10 -56Z"/><path fill="${P.berry}" d="M-12 4 Q0 8 12 4 L10 0 L-10 0Z"/><ellipse class="ink" cx="-3" cy="-30" rx="2" ry="3.5"/><ellipse class="ink" cx="4" cy="-24" rx="2" ry="3.5"/>${stem.replace('-64', '-66')}</g>`;
}
function banana(peeled) {
  if (!peeled) return `<g><path fill="${P.banana}" d="M-56 -26 Q-58 -34 -50 -34 Q-20 -6 20 -14 Q44 -20 54 -44 Q62 -46 60 -38 Q52 -6 14 2 Q-30 8 -56 -26Z"/><path class="d" d="M-40 -18 Q-6 2 30 -8"/><path fill="${P.choc}" d="M54 -44 L58 -52 L64 -48 L60 -40Z"/><circle class="n" fill="${P.bananaDeep}" cx="-54" cy="-30" r="3"/></g>`;
  return `<g><path fill="${P.banana}" d="M-50 -6 Q-30 6 0 4 Q24 2 30 -6 Q14 -16 -14 -16 Q-36 -16 -50 -6Z"/><path fill="${P.banana}" d="M-44 -2 Q-60 -20 -52 -34 Q-40 -18 -30 -12Z"/><path fill="${P.banana}" d="M22 -4 Q44 -10 50 -30 Q34 -22 18 -14Z"/>
    <path fill="${P.egg}" d="M-18 -14 Q-24 -52 -2 -74 Q14 -80 18 -66 Q24 -40 10 -14Z"/><path class="d" d="M-2 -60 Q-6 -40 0 -22"/></g>`;
}
function egg(cracked) {
  if (!cracked) return `<g><path fill="${P.egg}" d="M0 -64 C22 -64 32 -30 30 -18 C28 -4 16 0 0 0 C-16 0 -28 -4 -30 -18 C-32 -30 -22 -64 0 -64Z"/><path ${tl(P.oat, 'stroke-width:4')} d="M-16 -44 Q-20 -34 -18 -24"/></g>`;
  return `<g><ellipse fill="${P.egg}" class="thin" cx="0" cy="-8" rx="36" ry="9"/><ellipse fill="${P.mustard}" class="thin" cx="0" cy="-10" rx="12" ry="7"/>
    <path fill="${P.egg}" d="M-62 -2 Q-64 -26 -48 -30 L-44 -22 L-38 -28 L-32 -20 L-28 -24 Q-26 -4 -40 0 Q-58 2 -62 -2Z"/><path fill="${P.egg}" d="M62 -2 Q64 -26 48 -30 L44 -22 L38 -28 L32 -20 L28 -24 Q26 -4 40 0 Q58 2 62 -2Z"/></g>`;
}
function bread(sliced) {
  if (!sliced) return breadLoaf();
  return `<g><path fill="${P.crust}" d="M-50 0 Q-60 -44 -20 -50 Q0 -54 8 -52 L8 0Z"/><path class="d" d="M-26 -40 L-16 -18"/><path fill="${P.toast}" d="M10 0 L10 -50 Q18 -54 22 -48 L22 0Z"/>
    <path fill="${P.crust}" d="M30 0 L30 -46 Q30 -56 41 -56 Q56 -56 56 -45 Q56 -38 51 -36 L51 0Z"/><path fill="${P.toast}" class="thin" d="M35 -4 L35 -44 Q35 -50 41 -50 Q50 -50 50 -44 Q50 -40 46 -38 L46 -4Z"/></g>`;
}
function cakeSlice(stage) {
  if (stage === 0) return `<g><path fill="${P.choc}" d="M-40 0 L40 0 L40 -40 L-40 -24Z"/><path fill="${P.cream}" d="M-40 -24 L40 -40 L40 -50 L-40 -30Z"/><path ${tl(P.cream, `stroke:${P.cream};stroke-width:5`)} d="M-38 -10 L38 -18"/><circle fill="${P.berry}" cx="20" cy="-52" r="8"/></g>`;
  return `<g><path fill="${P.choc}" d="M-40 0 L6 0 Q0 -6 6 -12 Q0 -18 8 -24 Q2 -30 8 -34 L-40 -24Z"/><path fill="${P.cream}" d="M-40 -24 L8 -33 L10 -38 L-40 -30Z"/><path ${tl(P.cream, `stroke:${P.cream};stroke-width:5`)} d="M-38 -10 L2 -14"/>
    <g class="n" fill="${P.choc}"><circle cx="16" cy="-3" r="3"/><circle cx="24" cy="-6" r="2.5"/></g></g>`;
}
function juice(full) {
  return `<g><rect fill="${P.glass}" x="-24" y="-80" width="48" height="80" rx="9"/>
    ${full ? `<path class="thin" fill="${P.lemon}" d="M-20 -58 L20 -58 L20 -9 Q20 -4 15 -4 L-15 -4 Q-20 -4 -20 -9Z"/><circle class="thin" fill="${P.cream}" cx="-4" cy="-30" r="9"/><circle class="n" fill="#fff" opacity=".7" cx="8" cy="-18" r="3"/>` : `<path class="thin" fill="${P.lemon}" d="M-20 -12 L20 -12 L20 -9 Q20 -4 15 -4 L-15 -4 Q-20 -4 -20 -9Z"/>`}
    <path class="d" style="stroke-width:5" d="M8 -64 L20 -104"/><path fill="${P.rose}" d="M18 -104 L24 -104 L22 -94 L16 -94Z" class="thin"/>${glint(-16, -72, 16)}</g>`;
}
const ball = () => `<g><circle fill="${P.teal}" cx="0" cy="-40" r="40"/><path fill="${P.butter}" class="thin" d="M-40 -40 Q-20 -54 0 -40 Q20 -26 40 -40 Q40 -60 26 -70 Q10 -62 0 -66 Q-14 -72 -26 -70 Q-40 -60 -40 -40Z" opacity="1"/>
  <path fill="${P.berry}" class="thin" d="M-38 -26 Q-18 -40 0 -26 Q18 -12 36 -24 Q30 -8 16 -2 Q0 -8 -14 -2 Q-30 -8 -38 -26Z"/><path ${tl('#fff', 'stroke:#fff;stroke-width:5;opacity:.8')} d="M-22 -60 Q-28 -52 -28 -44"/></g>`;
const teddy = () => `<g>
  <circle fill="${P.terra}" cx="-30" cy="-110" r="14"/><circle fill="${P.terra}" cx="30" cy="-110" r="14"/><circle class="n" fill="${P.peach}" cx="-30" cy="-110" r="7"/><circle class="n" fill="${P.peach}" cx="30" cy="-110" r="7"/>
  <ellipse fill="${P.terra}" cx="-26" cy="-12" rx="17" ry="13"/><ellipse fill="${P.terra}" cx="26" cy="-12" rx="17" ry="13"/>
  <path fill="${P.terra}" d="M-30 -8 Q-38 -60 0 -64 Q38 -60 30 -8 Q24 0 0 0 Q-24 0 -30 -8Z"/><ellipse class="n" fill="${P.peach}" cx="0" cy="-28" rx="16" ry="18"/>
  <ellipse fill="${P.terra}" cx="-34" cy="-42" rx="10" ry="18" transform="rotate(20 -34 -42)"/><ellipse fill="${P.terra}" cx="34" cy="-42" rx="10" ry="18" transform="rotate(-20 34 -42)"/>
  <ellipse fill="${P.terra}" cx="0" cy="-92" rx="36" ry="32"/><ellipse fill="${P.peach}" class="thin" cx="0" cy="-82" rx="14" ry="11"/><ellipse class="ink" cx="0" cy="-87" rx="5" ry="3.5"/>
  <circle class="ink" cx="-14" cy="-98" r="4"/><circle class="ink" cx="14" cy="-98" r="4"/><path class="d" d="M-5 -79 Q0 -75 5 -79"/>
  <path class="thin" fill="${P.teal}" d="M-18 -62 L0 -56 L18 -62 L14 -50 L0 -54 L-14 -50Z"/></g>`;
const toyCar = () => `<g>
  <path fill="${P.berry}" d="M-60 -16 L-60 -34 Q-60 -42 -50 -42 L-34 -42 L-22 -64 Q-18 -70 -10 -70 L22 -70 Q30 -70 34 -64 L44 -42 L52 -42 Q62 -42 62 -32 L62 -16Z"/>
  <path fill="${P.sky}" class="thin" d="M-26 -44 L-16 -62 L-2 -62 L-2 -44Z M4 -44 L4 -62 L20 -62 Q24 -62 26 -58 L34 -44Z"/>
  <rect fill="${P.butter}" class="thin" x="50" y="-36" width="10" height="8" rx="3"/><path class="d" d="M0 -40 L0 -20"/>
  <circle fill="${P.charDeep}" cx="-34" cy="-14" r="15"/><circle fill="${P.steel}" class="thin" cx="-34" cy="-14" r="6"/><circle fill="${P.charDeep}" cx="36" cy="-14" r="15"/><circle fill="${P.steel}" class="thin" cx="36" cy="-14" r="6"/></g>`;
function book(open) {
  if (!open) return `<g><rect fill="${P.cream}" x="-38" y="-14" width="80" height="14" rx="3"/><path ${tl(P.warmGrey)} d="M-34 -9 L38 -9 M-34 -5 L38 -5"/>
    <rect fill="${P.teal}" x="-44" y="-20" width="86" height="10" rx="4"/><rect fill="${P.teal}" x="-44" y="-4" width="86" height="6" rx="3"/><path class="thin" fill="${P.butter}" d="${star(0, -15, 7, 3.2)}"/></g>`;
  return `<g><path fill="${P.teal}" d="M-66 -4 L-64 -44 L0 -38 L64 -44 L66 -4 L0 0Z"/>
    <path fill="${P.cream}" d="M-60 -10 L-60 -46 Q-30 -54 0 -42 L0 -6 Q-30 -18 -60 -10Z"/><path fill="${P.cream}" d="M60 -10 L60 -46 Q30 -54 0 -42 L0 -6 Q30 -18 60 -10Z"/>
    <circle class="thin" fill="${P.lemon}" cx="-40" cy="-34" r="7"/><path class="n" fill="${P.leaf}" d="M-54 -16 Q-40 -30 -26 -18 Q-16 -26 -6 -14 L-6 -12 Q-30 -20 -54 -14Z"/>
    ${heart(30, -30, .9, P.rose)}<path ${tl(P.warmGrey)} d="M14 -18 L46 -22 M16 -12 L40 -15"/></g>`;
}
function flowerPot(bloom) {
  const stem = `<path class="d" style="stroke-width:5" d="M0 -40 L0 -96"/>${leaf(30, 11, -50, P.leaf, 0, -56)}${leaf(28, 10, 46, P.leafDeep, 0, -66)}`;
  const head = bloom
    ? `<path fill="${P.rose}" d="${scallop(0, -108, 26, 26, 7, 10)}"/><circle class="thin" fill="${P.butter}" cx="0" cy="-108" r="10"/>`
    : `<path fill="${P.leafLight}" d="M-10 -94 Q-12 -116 0 -124 Q12 -116 10 -94Z"/><path fill="${P.rose}" d="M-5 -110 Q0 -126 5 -110Z" class="thin"/>`;
  return `<g>${stem}${head}${flowerPotBase(P.terra, 64, 46)}<g class="n" fill="${P.cream}"><circle cx="-12" cy="-20" r="3.5"/><circle cx="0" cy="-14" r="3.5"/><circle cx="12" cy="-20" r="3.5"/></g></g>`;
}
function gift(open) {
  const box = `<rect fill="${P.sage}" x="-40" y="-60" width="80" height="60" rx="6"/><rect class="thin" fill="${P.rose}" x="-8" y="-60" width="16" height="60"/>`;
  if (!open) return `<g>${box}<rect fill="${P.sage}" x="-46" y="-74" width="92" height="18" rx="6"/><rect class="thin" fill="${P.rose}" x="-8" y="-74" width="16" height="18"/>
    <path fill="${P.rose}" d="M0 -74 Q-30 -100 -26 -80 Q-24 -72 0 -74Z M0 -74 Q30 -100 26 -80 Q24 -72 0 -74Z"/></g>`;
  return `<g><path fill="${P.butter}" class="thin" d="${star(0, -84, 22, 10)}"/><path ${tl(P.mustard, `stroke:${P.mustard};stroke-width:4`)} d="M-26 -96 L-34 -104 M26 -96 L34 -104 M0 -110 L0 -120"/>${box}
    <g transform="translate(76 -10) rotate(12)"><rect fill="${P.sage}" x="-46" y="-9" width="92" height="18" rx="6"/><rect class="thin" fill="${P.rose}" x="-8" y="-9" width="16" height="18"/></g></g>`;
}
const backpack = () => `<g><path class="d" style="stroke-width:6" d="M-20 -92 Q0 -112 20 -92"/>
  <path fill="${P.mustard}" d="M-42 -8 L-42 -70 Q-42 -94 -18 -94 L18 -94 Q42 -94 42 -70 L42 -8 Q42 0 34 0 L-34 0 Q-42 0 -42 -8Z"/>
  <path fill="${P.mustardDeep}" d="M-42 -62 Q0 -48 42 -62 L42 -68 Q0 -54 -42 -68Z"/><rect fill="${P.mustard}" x="-28" y="-44" width="56" height="36" rx="10"/>
  <circle class="thin" fill="${P.teal}" cx="0" cy="-26" r="7"/><path class="d" d="M-24 -52 L-24 -58 M24 -52 L24 -58"/></g>`;
const blocks = () => `<g>
  <rect fill="${P.rose}" x="-56" y="-44" width="52" height="44" rx="6"/><circle class="thin" fill="${P.cream}" cx="-30" cy="-22" r="10"/>
  <rect fill="${P.teal}" x="4" y="-44" width="52" height="44" rx="6"/><path class="thin" fill="${P.cream}" d="M30 -34 L40 -12 L20 -12Z"/>
  <rect fill="${P.butter}" x="-26" y="-92" width="52" height="48" rx="6"/><path class="thin" fill="${P.cream}" d="${star(0, -68, 13, 6)}"/></g>`;
// The town car (P1.14): an open-top convertible facing right, so the
// passengers (drawn behind the body by the view) peek out over the door
// line at y -150. Big: about 390 x 180 world units in a room (the city map
// draws everything smaller).
const car = () => `<g>
  <path fill="${P.steelDeep}" d="M86 -150 Q84 -176 104 -178 Q124 -178 122 -150Z"/>
  <path fill="${P.glass}" d="M150 -150 L176 -238 Q180 -248 190 -244 Q198 -240 196 -230 L186 -150Z"/>
  <path ${tl('#fff', 'stroke:#fff;stroke-width:5')} d="M178 -160 L192 -224"/>
  <path fill="${P.mustard}" d="M-262 -66 Q-266 -150 -196 -150 L176 -150 Q206 -150 226 -124 L256 -118 Q284 -112 284 -84 L284 -66 Q284 -40 260 -40 L-240 -40 Q-262 -40 -262 -66Z"/>
  <path fill="${P.mustardDeep}" d="M-262 -70 L284 -70 L284 -64 Q284 -40 260 -40 L-240 -40 Q-262 -40 -262 -64Z"/>
  <path ${tl(P.butter, 'stroke-width:7')} d="M-236 -124 L196 -124"/>
  <path class="d" d="M-40 -146 L-40 -74 M110 -146 L110 -74"/>
  <rect fill="${P.woodDark}" class="thin" x="60" y="-116" width="30" height="9" rx="4"/>
  ${heart(-122, -100, 1.3, P.cream)}
  <rect fill="${P.butter}" class="thin" x="258" y="-108" width="22" height="16" rx="7"/>
  <rect fill="${P.berry}" class="thin" x="-266" y="-116" width="14" height="22" rx="6"/>
  <rect fill="${P.steel}" x="262" y="-66" width="30" height="14" rx="6"/><rect fill="${P.steel}" x="-274" y="-66" width="26" height="14" rx="6"/>
  <circle fill="${P.charDeep}" cx="-170" cy="-44" r="44"/><circle fill="${P.steel}" class="thin" cx="-170" cy="-44" r="18"/>
  <circle fill="${P.charDeep}" cx="176" cy="-44" r="44"/><circle fill="${P.steel}" class="thin" cx="176" cy="-44" r="18"/></g>`;
const teapotProp = () => teapot(P.teal);

export const PROPS = {
  mug: { label: 'mug', tags: ['dish', 'cup', 'drink'], variants: { empty: mug(false), full: mug(true) }, taps: ['empty', 'full'], grip: [26, -28] },
  plate: { label: 'plate', tags: ['dish', 'container'], variants: { default: plate() }, surface: [-44, 44, -14] },
  bowl: { label: 'bowl', tags: ['dish', 'container'], variants: { empty: bowl(false), soup: bowl(true) }, taps: null, surface: [-36, 36, -40] },
  teapot: { label: 'teapot', tags: ['dish', 'drink'], variants: { default: teapotProp() }, grip: [44, -40] },
  pan: { label: 'frying pan', tags: ['cookware', 'container'], variants: { empty: pan(false), egg: pan(true) }, taps: null, grip: [80, -10], surface: [-80, 0, -12] },
  pot: { label: 'soup pot', tags: ['cookware', 'container'], variants: { closed: cookingPot(false), open: cookingPot(true) }, taps: ['closed', 'open'] },
  'cookie-jar': { label: 'cookie jar', tags: ['container', 'food'], variants: { closed: cookieJar(false), open: cookieJar(true) }, taps: ['closed', 'open'] },
  cupcake: { label: 'cupcake', tags: ['food', 'sweet'], variants: { whole: cupcake(0), bite1: cupcake(1), bite2: cupcake(2) }, bites: ['whole', 'bite1', 'bite2', null] },
  croissant: { label: 'croissant', tags: ['food', 'bread'], variants: { whole: croissant(0), bite1: croissant(1) }, bites: ['whole', 'bite1', null] },
  apple: { label: 'apple', tags: ['food', 'fruit'], variants: { whole: at(0, 0, .8, apple(0)), bite1: at(0, 0, .8, apple(1)), core: at(0, 0, .8, apple(2)) }, bites: ['whole', 'bite1', 'core'] },
  banana: { label: 'banana', tags: ['food', 'fruit'], variants: { whole: banana(false), peeled: banana(true) }, taps: ['whole', 'peeled'], oneWay: true },
  egg: { label: 'egg', tags: ['food', 'ingredient'], variants: { whole: egg(false), cracked: egg(true) }, taps: ['whole', 'cracked'], oneWay: true },
  bread: { label: 'bread', tags: ['food', 'bread'], variants: { loaf: bread(false), sliced: bread(true) }, taps: ['loaf', 'sliced'], oneWay: true },
  'cake-slice': { label: 'cake slice', tags: ['food', 'sweet'], variants: { whole: cakeSlice(0), bite1: cakeSlice(1) }, bites: ['whole', 'bite1', null] },
  juice: { label: 'juice glass', tags: ['drink', 'cup'], variants: { full: juice(true), empty: juice(false) }, bites: ['full', 'empty'] },
  ball: { label: 'ball', tags: ['toy', 'bouncy'], variants: { default: ball() } },
  teddy: { label: 'teddy bear', tags: ['toy', 'soft'], variants: { default: teddy() }, grip: [0, -60] },
  'toy-car': { label: 'toy car', tags: ['toy', 'vehicle'], variants: { default: toyCar() } },
  book: { label: 'picture book', tags: ['book', 'school'], variants: { closed: book(false), open: book(true) }, taps: ['closed', 'open'] },
  'flower-pot': { label: 'flower pot', tags: ['plant'], variants: { bud: flowerPot(false), bloom: flowerPot(true) }, taps: ['bud', 'bloom'], oneWay: true },
  gift: { label: 'gift box', tags: ['container', 'toy'], variants: { closed: gift(false), open: gift(true) }, taps: ['closed', 'open'] },
  backpack: { label: 'backpack', tags: ['container', 'wearable:back', 'school'], variants: { default: backpack() }, grip: [0, -96] },
  car: { label: 'car', tags: ['vehicle', 'container'], variants: { default: car() } },
  blocks: { label: 'toy blocks', tags: ['toy', 'buildpiece'], variants: { default: blocks() } },
};
