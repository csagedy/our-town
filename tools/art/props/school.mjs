// School props (P2d.1, docs/design.md 3.4): classroom supplies, lunch,
// nap time, recess toys and the school wearables. Same contract as
// props/starter.mjs: origin = bottom centre = the resting point, art units,
// variants[0] is the default, `taps` / `bites` name variant cycles, `grip`
// is the hold point relative to the anchor, `surface` a [x0, x1, y] rest
// segment on the prop (a tray, a cot). Wearables carry `wear` (the rig
// piece, slot and per-variant colour overrides; the pieces are in
// characters/wear.mjs, "P2d").
//
// Also exported: the PICTOGRAMS the school room reuses (weather, feelings
// faces, cubby animals, daily-schedule pictures), so a weather card, the
// board and the window all draw the same sun. No words anywhere: the
// letter wall's letters are art in rooms/school.mjs; sight words and the
// schedule's words are data for the engine (SCHOOL_META).
import { P } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';

const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;
const glint = (d, w = 5) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const HAZ = '#EE9A55';
// Muted classroom colours (paint pots, crayons, chalk): [base, shade].
export const CRAYONS = {
  red: ['#E4846F', '#C8695A'], yellow: ['#F2C75C', '#D9A83E'], blue: ['#8FB1DC', '#6D90C2'],
  green: ['#96C47F', '#6FA262'], purple: ['#B69BD3', '#9579B8'], pink: ['#EFA3B4', '#D9849A'],
};
const CK = Object.keys(CRAYONS);

// ---------------------------------------------------------------------------
// PICTOGRAMS (centred on 0,0; about 30 units in radius at s = 1)
// ---------------------------------------------------------------------------
const cloudPath = (w = 1) => `M${f(-34 * w)} 12 Q${f(-46 * w)} 12 ${f(-44 * w)} -2 Q${f(-42 * w)} -16 ${f(-26 * w)} -14 Q${f(-22 * w)} -34 0 -32 Q${f(20 * w)} -32 ${f(24 * w)} -14 Q${f(42 * w)} -18 ${f(44 * w)} 0 Q${f(46 * w)} 12 ${f(32 * w)} 12Z`;
export const WX = {
  sun: (s = 1) => at(0, 0, s, `${[...Array(8)].map((_, i) => `<g transform="rotate(${i * 45})"><path fill="${P.mustard}" class="thin" d="M-7 -30 L0 -44 L7 -30Z"/></g>`).join('')}
    <circle fill="${P.butter}" r="25"/><circle class="ink" cx="-9" cy="-2" r="3"/><circle class="ink" cx="9" cy="-2" r="3"/><path class="d" d="M-7 8 Q0 14 7 8"/>
    <ellipse class="n" fill="${P.rose}" opacity=".5" cx="-16" cy="7" rx="5" ry="3"/><ellipse class="n" fill="${P.rose}" opacity=".5" cx="16" cy="7" rx="5" ry="3"/>`),
  cloud: (s = 1) => at(0, 4, s, `<g transform="translate(14 -14) scale(.55)"><path fill="${P.butter}" d="${scallop(0, 0, 26, 26, 8, 5)}"/></g><path fill="#fff" d="${cloudPath()}"/><path ${tl(P.skyDeep)} d="M-30 4 Q-18 8 -6 4"/>`),
  rain: (s = 1) => at(0, -6, s, `<path fill="${P.steel}" d="${cloudPath()}"/><path ${tl(P.steelDeep)} d="M-30 4 Q-18 8 -6 4"/>
    ${[[-22, 26], [0, 32], [22, 26]].map(([x, y]) => `<path fill="${P.blue}" class="thin" d="M${x} ${y - 12} Q${x + 8} ${y} ${x} ${y + 4} Q${x - 8} ${y} ${x} ${y - 12}Z"/>`).join('')}`),
  snow: (s = 1) => at(0, 0, s, `${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><rect fill="#fff" x="-4.5" y="-34" width="9" height="68" rx="4.5"/><path class="d" style="stroke:${P.skyDeep}" d="M-9 -26 L0 -18 L9 -26 M-9 26 L0 18 L9 26"/></g>`).join('')}<circle fill="${P.sky}" class="thin" r="8"/>`),
};
export const WEATHER = ['sun', 'cloud', 'rain', 'snow'];

/** A round feelings face: happy, sad, mad, scared, calm (5 feelings chart, design 3.4 #16). */
export const FEELINGS = { happy: P.butter, sad: P.blue, mad: '#EFA08A', scared: P.lav, calm: P.mint };
export function feelFace(kind, r = 30) {
  const k = r / 30, e = (x, y, rx = 3.6, ry = 4.6) => `<ellipse class="ink" cx="${f(x * k)}" cy="${f(y * k)}" rx="${f(rx * k)}" ry="${f(ry * k)}"/>`;
  const d = (p) => `<path class="d" d="${p}"/>`;
  const S = (n) => f(n * k);
  const blush = `<ellipse class="n" fill="${P.rose}" opacity=".55" cx="${S(-17)}" cy="${S(8)}" rx="${S(6)}" ry="${S(3.5)}"/><ellipse class="n" fill="${P.rose}" opacity=".55" cx="${S(17)}" cy="${S(8)}" rx="${S(6)}" ry="${S(3.5)}"/>`;
  const face = {
    happy: e(-10, -2) + e(10, -2) + `<path fill="${P.mouth}" class="thin" d="M${S(-11)} ${S(8)} Q0 ${S(22)} ${S(11)} ${S(8)}Z"/>` + blush,
    sad: e(-10, 0) + e(10, 0) + d(`M${S(-9)} ${S(16)} Q0 ${S(8)} ${S(9)} ${S(16)}`) + d(`M${S(-16)} ${S(-12)} L${S(-5)} ${S(-9)} M${S(16)} ${S(-12)} L${S(5)} ${S(-9)}`)
      + `<path fill="${P.sky}" class="thin" d="M${S(12)} ${S(6)} Q${S(17)} ${S(14)} ${S(12)} ${S(17)} Q${S(7)} ${S(14)} ${S(12)} ${S(6)}Z"/>`,
    mad: e(-10, 0, 3.6, 3.2) + e(10, 0, 3.6, 3.2) + d(`M${S(-17)} ${S(-12)} L${S(-5)} ${S(-6)} M${S(17)} ${S(-12)} L${S(5)} ${S(-6)}`) + d(`M${S(-9)} ${S(15)} Q0 ${S(9)} ${S(9)} ${S(15)}`),
    scared: `<circle fill="#fff" class="thin" cx="${S(-10)}" cy="${S(-2)}" r="${S(6.5)}"/><circle fill="#fff" class="thin" cx="${S(10)}" cy="${S(-2)}" r="${S(6.5)}"/>` + e(-10, -1, 2.8, 3.2) + e(10, -1, 2.8, 3.2)
      + `<ellipse fill="${P.mouth}" class="thin" cx="0" cy="${S(14)}" rx="${S(5)}" ry="${S(6)}"/>` + d(`M${S(-16)} ${S(-12)} Q${S(-10)} ${S(-17)} ${S(-4)} ${S(-13)} M${S(16)} ${S(-12)} Q${S(10)} ${S(-17)} ${S(4)} ${S(-13)}`),
    calm: d(`M${S(-15)} ${S(-1)} Q${S(-10)} ${S(4)} ${S(-5)} ${S(-1)} M${S(5)} ${S(-1)} Q${S(10)} ${S(4)} ${S(15)} ${S(-1)}`) + d(`M${S(-6)} ${S(11)} Q0 ${S(16)} ${S(6)} ${S(11)}`) + blush,
  }[kind];
  return `<circle fill="${FEELINGS[kind]}" r="${f(r)}"/>${face}`;
}

/** Cubby label animals (one per child; the engine may swap in the owner's face). */
export const CUBBY_ANIMALS = ['cat', 'dog', 'fish', 'bird', 'bunny', 'bear'];
export function animal(kind, s = 1) {
  const eyes = (y = 0, dx = 8) => `<circle class="ink" cx="${-dx}" cy="${y}" r="3"/><circle class="ink" cx="${dx}" cy="${y}" r="3"/>`;
  const art = {
    cat: `<path fill="${P.peach}" d="M-22 -8 L-24 -32 L-8 -20 Z M22 -8 L24 -32 L8 -20Z"/><ellipse fill="${P.peach}" cx="0" cy="0" rx="24" ry="20"/><path class="n" fill="${P.terra}" d="M-6 -19 L0 -10 L6 -19Z"/>${eyes(-2)}<path fill="${P.rose}" class="thin" d="M-4 5 L4 5 L0 9Z"/><path class="d" d="M-12 8 L-26 6 M12 8 L26 6"/>`,
    dog: `<ellipse fill="${P.woodLight}" cx="0" cy="0" rx="22" ry="21"/><ellipse fill="${P.woodDeep}" cx="-22" cy="2" rx="8" ry="15" transform="rotate(14 -22 2)"/><ellipse fill="${P.woodDeep}" cx="22" cy="2" rx="8" ry="15" transform="rotate(-14 22 2)"/>${eyes(-4)}<ellipse fill="${P.cream}" class="thin" cx="0" cy="9" rx="10" ry="7"/><ellipse class="ink" cx="0" cy="5" rx="4" ry="3"/>`,
    fish: `<path fill="${HAZ}" d="M14 0 L32 -14 L30 14Z"/><ellipse fill="${HAZ}" cx="-4" cy="0" rx="22" ry="16"/><path class="d" d="M6 -12 Q12 0 6 12"/><circle class="ink" cx="-14" cy="-3" r="3"/><path ${tl('#fff', 'stroke:#fff;stroke-width:3')} d="M-16 -10 Q-10 -13 -4 -12"/>`,
    bird: `<circle fill="${P.butter}" cx="0" cy="2" r="21"/><path fill="${P.mustard}" class="thin" d="M18 -2 L30 2 L18 7Z"/><path fill="${P.mustard}" class="thin" d="M-10 6 Q-2 18 10 8 Q2 4 -10 6Z"/><circle class="ink" cx="8" cy="-4" r="3"/><path fill="${P.mustard}" class="thin" d="M-4 -18 Q0 -28 6 -18Z"/>`,
    bunny: `<ellipse fill="#fff" cx="-9" cy="-26" rx="7" ry="17"/><ellipse fill="#fff" cx="9" cy="-26" rx="7" ry="17"/><ellipse class="n" fill="${P.blush}" cx="-9" cy="-25" rx="3" ry="11"/><ellipse class="n" fill="${P.blush}" cx="9" cy="-25" rx="3" ry="11"/><ellipse fill="#fff" cx="0" cy="2" rx="21" ry="18"/>${eyes(0, 7)}<path fill="${P.rose}" class="thin" d="M-3 7 L3 7 L0 10Z"/>`,
    bear: `<circle fill="${P.wood}" cx="-17" cy="-15" r="8"/><circle fill="${P.wood}" cx="17" cy="-15" r="8"/><circle fill="${P.wood}" cx="0" cy="1" r="21"/>${eyes(-3)}<ellipse fill="${P.woodLight}" class="thin" cx="0" cy="9" rx="9" ry="7"/><ellipse class="ink" cx="0" cy="6" rx="3.5" ry="2.6"/>`,
  }[kind];
  return at(0, 0, s, art);
}

/** Daily schedule pictures: arrive, circle, play, snack, recess, story, home. */
export const SCHEDULE = ['arrive', 'circle', 'play', 'snack', 'recess', 'story', 'home'];
export function schedIcon(kind, s = 1) {
  const art = {
    arrive: `<path fill="${P.mustard}" d="M-30 10 L-30 -16 Q-30 -22 -24 -22 L16 -22 Q22 -22 24 -16 L30 -4 L30 10Z"/>${[-24, -10, 4].map((x) => R(x, -18, 11, 11, P.sky, ' class="thin" rx="2"')).join('')}<circle fill="${P.charDeep}" cx="-16" cy="12" r="7"/><circle fill="${P.charDeep}" cx="18" cy="12" r="7"/>`,
    circle: [...Array(6)].map((_, i) => { const a = i * Math.PI / 3; return `<circle fill="${[P.berry, P.mustard, P.leaf, P.blue, P.plum, HAZ][i]}" class="thin" cx="${f(Math.cos(a) * 20)}" cy="${f(Math.sin(a) * 14)}" r="7"/>`; }).join('') + `<circle fill="${P.butter}" class="thin" cx="0" cy="0" r="5"/>`,
    play: `${R(-26, -4, 24, 20, P.rose, ' rx="3"')}${R(2, -4, 24, 20, P.teal, ' rx="3"')}${R(-12, -26, 24, 22, P.butter, ' rx="3"')}`,
    snack: `<path fill="${P.berry}" d="M0 -12 Q-10 -20 -18 -12 Q-26 2 -14 16 Q-6 22 0 18 Q6 22 14 16 Q26 2 18 -12 Q10 -20 0 -12Z"/><path class="d" d="M0 -12 Q2 -20 6 -24"/>${leaf(14, 5, 60, P.leaf, 3, -18)}`,
    recess: `<path class="d" style="stroke-width:5" d="M-22 16 L-22 -22 M-8 16 L-8 -22"/><path class="d" d="M-22 -8 L-8 -8 M-22 4 L-8 4"/><path fill="${P.mustard}" d="M-8 -22 Q12 -20 18 4 Q20 14 30 14 L30 20 Q14 20 12 8 Q6 -12 -8 -14Z"/>`,
    story: `<path fill="${P.teal}" d="M-30 12 L-28 -16 L0 -12 L28 -16 L30 12 L0 16Z"/><path fill="${P.cream}" d="M-26 8 L-26 -18 Q-12 -22 0 -14 L0 12 Q-12 4 -26 8Z"/><path fill="${P.cream}" d="M26 8 L26 -18 Q12 -22 0 -14 L0 12 Q12 4 26 8Z"/>${heart(13, -4, .7, P.rose)}<circle class="thin" fill="${P.lemon}" cx="-13" cy="-6" r="4"/>`,
    home: `<path fill="${P.rose}" d="M-20 18 L-20 -4 L0 -22 L20 -4 L20 18Z"/><path fill="${P.terraDeep}" class="thin" d="M-26 -2 L0 -26 L26 -2 L22 2 L0 -18 L-22 2Z"/>${R(-6, 4, 12, 14, P.woodDeep, ' class="thin" rx="2"')}${heart(11, 0, .45, P.cream)}`,
  }[kind];
  return at(0, 0, s, art);
}

// ---------------------------------------------------------------------------
// ART SUPPLIES
// ---------------------------------------------------------------------------
function crayon(c, d) {
  return `<g transform="rotate(-8)"><path fill="${c}" d="M-34 -16 L20 -16 L34 -8 L20 0 L-34 0 Q-38 0 -38 -4 L-38 -12 Q-38 -16 -34 -16Z"/>
  <rect class="n" fill="${P.cream}" x="-24" y="-15" width="30" height="14"/><path ${tl(d, 'stroke-width:3')} d="M-18 -8 Q-9 -12 0 -8"/><path fill="none" d="M-24 -16 L-24 0 M6 -16 L6 0"/>
  <path fill="none" d="M-34 -16 L20 -16 L34 -8 L20 0 L-34 0 Q-38 0 -38 -4 L-38 -12 Q-38 -16 -34 -16Z"/></g>`;
}
function crayonBox(open) {
  const tips = CK.map((k, i) => { const x = -30 + i * 12; return `<path fill="${CRAYONS[k][0]}" d="M${x - 5} -50 L${x - 5} ${open ? -70 : -56} L${x} ${open ? -80 : -62} L${x + 5} ${open ? -70 : -56} L${x + 5} -50Z"/>`; }).join('');
  const box = `${R(-40, -56, 80, 56, P.mustard, ' rx="5"')}<path fill="${P.leafLight}" class="thin" d="M-40 -18 L40 -18 L40 -8 Q40 0 32 0 L-32 0 Q-40 0 -40 -8Z"/>
    <g transform="translate(0 -36)">${crayon(CRAYONS.red[0], CRAYONS.red[1]).replace('rotate(-8)', 'rotate(-8) scale(.62)')}</g>`;
  return open ? `<g>${tips}${box}</g>` : `<g>${box}<path fill="${P.mustardDeep}" d="M-42 -58 L42 -58 L40 -70 L-40 -70Z"/></g>`;
}
function marker(c, d) {
  return `<g transform="rotate(-6)"><rect fill="#fff" x="-36" y="-18" width="54" height="18" rx="6"/><path fill="${c}" d="M18 -19 L36 -19 Q42 -19 42 -13 L42 -5 Q42 1 36 1 L18 1Z"/>
  <path ${tl(d, 'stroke-width:3')} d="M24 -15 L24 -3"/><rect class="thin" fill="${c}" x="-30" y="-13" width="26" height="8" rx="4"/>${glint('M-28 -15 L-6 -15', 3)}</g>`;
}
function glueStick(open) {
  const body = `<path fill="${P.butter}" d="M-12 -6 L-12 -48 L12 -48 L12 -6 Q12 0 6 0 L-6 0 Q-12 0 -12 -6Z"/><rect class="thin" fill="${P.blue}" x="-12" y="-36" width="24" height="18"/>${heart(0, -27, .55, '#fff')}<rect fill="${P.mustardDeep}" x="-14" y="-10" width="28" height="10" rx="4"/>`;
  return open ? `<g>${body}<path fill="#fff" d="M-9 -48 L-9 -58 Q0 -64 9 -58 L9 -48Z"/><g transform="translate(26 0) rotate(8)"><path fill="${P.blue}" d="M-12 0 L-12 -24 Q-12 -28 -8 -28 L8 -28 Q12 -28 12 -24 L12 0Z"/></g></g>`
    : `<g>${body}<path fill="${P.blue}" d="M-13 -46 L-13 -70 Q-13 -74 -9 -74 L9 -74 Q13 -74 13 -70 L13 -46Z"/></g>`;
}
const scissors = () => `<g transform="translate(0 8)">
  <path fill="${P.steel}" d="M-6 -30 L34 -42 Q46 -44 44 -36 Q40 -30 -2 -22Z"/><path fill="${P.steel}" d="M-6 -22 L34 -12 Q46 -10 44 -18 Q40 -24 -2 -30Z"/>
  <circle fill="${P.steelDeep}" class="thin" cx="-2" cy="-26" r="4"/>${glint('M8 -32 L30 -38', 3)}
  <path fill="${P.teal}" fill-rule="evenodd" d="M-8 -30 Q-20 -46 -34 -42 Q-46 -36 -40 -26 Q-34 -18 -10 -26Z M-34 -34 Q-28 -40 -20 -36 Q-26 -30 -34 -30Z"/>
  <path fill="${P.rose}" fill-rule="evenodd" d="M-8 -22 Q-20 -6 -34 -10 Q-46 -16 -40 -26 Q-34 -34 -10 -26Z M-34 -18 Q-28 -12 -20 -16 Q-26 -22 -34 -22Z"/></g>`;
function paper(kind) {
  const sheet = `<path fill="#fff" d="M-34 0 L-38 -86 L34 -90 L38 -4Z"/>`;
  const draw = kind === 'drawing'
    ? `<circle class="thin" fill="${CRAYONS.yellow[0]}" cx="-16" cy="-68" r="9"/><path ${tl(CRAYONS.yellow[1], 'stroke-width:3')} d="M-16 -82 L-16 -86 M-30 -68 L-34 -68 M-26 -78 L-29 -81"/>
      <path fill="${CRAYONS.red[0]}" class="thin" d="M2 -18 L2 -44 L16 -56 L30 -44 L30 -18Z"/><path fill="${CRAYONS.green[0]}" class="n" d="M-34 -12 Q-10 -22 34 -14 L36 -6 L-34 -3Z"/><path ${tl(CRAYONS.blue[1], 'stroke-width:3')} d="M-26 -30 Q-20 -40 -14 -30 Q-8 -20 -2 -30"/>`
    : kind === 'stars' ? [[-16, -64], [14, -62], [-2, -36], [-20, -16], [18, -18]].map(([x, y], i) => `<path class="thin" fill="${[P.butter, CRAYONS.pink[0], CRAYONS.blue[0], P.leafLight, P.lav][i]}" d="${star(x, y, 10, 4.6)}"/>`).join('') : '';
  return `<g>${sheet}${draw}<path fill="none" d="M-34 0 L-38 -86 L34 -90 L38 -4Z"/></g>`;
}
function paintCup(c, d) {
  return `<g><path class="d" style="stroke-width:5" d="M6 -34 L14 -70"/><path fill="${P.woodDeep}" class="thin" d="M12 -70 L18 -70 L18 -80 Q15 -84 12 -80Z"/>
  <path fill="#fff" d="M-20 -34 L20 -34 L16 -4 Q15 0 10 0 L-10 0 Q-15 0 -16 -4Z"/><ellipse fill="${c}" cx="0" cy="-34" rx="20" ry="6"/><path class="n" fill="${c}" d="M-19 -26 L19 -26 L18 -18 L-18 -18Z"/>
  <path fill="${c}" class="thin" d="M-14 -34 Q-16 -24 -12 -22 Q-9 -24 -10 -34Z"/><rect fill="${d}" x="-22" y="-38" width="44" height="6" rx="3"/></g>`;
}
function stamp(kind) {
  const sym = kind === 'star' ? `<path class="thin" fill="${P.butter}" d="${star(0, -36, 9, 4)}"/>`
    : kind === 'smile' ? `<circle class="thin" fill="${P.butter}" cx="0" cy="-36" r="9"/><circle class="ink" cx="-3" cy="-38" r="1.6"/><circle class="ink" cx="3" cy="-38" r="1.6"/><path class="d" d="M-4 -33 Q0 -30 4 -33"/>`
      : `<path fill="none" style="stroke:${P.leaf};stroke-width:6" d="M-7 -36 L-2 -31 L8 -42"/>`;
  const ink = { star: P.berry, smile: P.blueDeep, check: P.leafDeep }[kind];
  return `<g><circle fill="${P.woodDeep}" cx="0" cy="-58" r="12"/><rect fill="${P.wood}" x="-7" y="-50" width="14" height="22" rx="4"/><rect fill="${P.woodLight}" x="-22" y="-28" width="44" height="16" rx="4"/>${sym}
  <rect fill="${ink}" x="-20" y="-12" width="40" height="12" rx="3"/></g>`;
}
function pictureBook(open, c = P.berry) {
  if (!open) {
    return `<g><path fill="${P.cream}" d="M-34 0 L-34 -76 L38 -76 L38 0Z"/><path fill="${c}" d="M-40 -2 L-40 -80 Q-40 -84 -36 -84 L34 -84 Q38 -84 38 -80 L38 -2 Q38 2 34 2 L-36 2 Q-40 2 -40 -2Z"/>
    <path class="n" fill="${P.sky}" d="M-30 -74 L28 -74 L28 -10 L-30 -10Z"/><path fill="${P.leafLight}" class="n" d="M-30 -10 L-30 -28 Q-6 -40 28 -26 L28 -10Z"/>
    <circle class="thin" fill="${P.butter}" cx="12" cy="-58" r="8"/><g transform="translate(-10 -30)">${animal('bear', .55)}</g><rect fill="none" x="-30" y="-74" width="58" height="64" class="thin"/>
    <path fill="${P.roseDeep}" class="n" d="M-40 -80 L-32 -80 L-32 0 L-40 0Z"/></g>`;
  }
  return `<g><path fill="${c}" d="M-78 -2 L-76 -64 L0 -58 L76 -64 L78 -2 L0 2Z"/>
    <path fill="#fff" d="M-70 -8 L-70 -66 Q-34 -76 0 -62 L0 -4 Q-34 -18 -70 -8Z"/><path fill="#fff" d="M70 -8 L70 -66 Q34 -76 0 -62 L0 -4 Q34 -18 70 -8Z"/>
    <g transform="translate(-36 -38)">${WX.sun(.5)}</g><path class="n" fill="${P.leafLight}" d="M-66 -14 Q-40 -26 -6 -14 L-6 -8 Q-36 -18 -66 -10Z"/>
    <g transform="translate(36 -36)">${animal('bunny', .6)}</g><path class="d" d="M0 -62 L0 -4"/></g>`;
}
function puzzle(state) {
  const board = `<path fill="${P.woodLight}" d="M-50 0 L-46 -74 L50 -74 L50 0Z"/>`;
  const pic = (cls = '') => `<path class="n" fill="${P.sky}" d="M-40 -8 L-38 -66 L42 -66 L42 -8Z"/><path fill="${P.leafLight}" class="n" d="M-40 -8 L-40 -26 Q-10 -40 42 -24 L42 -8Z"/><circle class="thin" fill="${P.butter}" cx="18" cy="-48" r="10"/><g transform="translate(-14 -24)">${animal('cat', .5)}</g>`;
  const hole = (x, y) => `<path fill="${P.woodDeep}" d="M${x - 11} ${y - 11} L${x - 3} ${y - 11} Q${x} ${y - 17} ${x + 3} ${y - 11} L${x + 11} ${y - 11} L${x + 11} ${y + 11} L${x - 11} ${y + 11}Z"/>`;
  const piece = (x, y, c, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><path fill="${c}" d="M-11 -11 L-3 -11 Q0 -17 3 -11 L11 -11 L11 11 L-11 11Z"/></g>`;
  const lines = `<path ${tl(P.woodDeep, 'stroke-width:2.5;opacity:.7')} d="M-14 -66 L-14 -8 M14 -66 L14 -8 M-40 -38 L42 -38"/>`;
  if (state === 'done') return `<g>${board}${pic()}${lines}<path fill="none" d="M-40 -8 L-38 -66 L42 -66 L42 -8Z"/></g>`;
  return `<g>${board}${pic()}${lines}${hole(-26, -52)}${hole(28, -22)}<path fill="none" d="M-40 -8 L-38 -66 L42 -66 L42 -8Z"/>${piece(-62, -10, P.sky, -14)}${piece(64, -12, P.leafLight, 18)}</g>`;
}
function unitBlock(kind) {
  const grain = (x0, x1, y) => `<path ${tl(P.wood, 'stroke-width:3')} d="M${x0} ${y} Q${(x0 + x1) / 2} ${y - 4} ${x1} ${y}"/>`;
  const art = {
    square: `${R(-22, -44, 44, 44, P.woodLight, ' rx="4"')}${grain(-14, 12, -26)}`,
    long: `${R(-44, -26, 88, 26, P.woodLight, ' rx="4"')}${grain(-34, 20, -14)}`,
    arch: `<path fill="${P.woodLight}" d="M-44 0 L-44 -40 L44 -40 L44 0 L22 0 Q22 -20 0 -20 Q-22 -20 -22 0Z"/>${grain(-30, 30, -32)}`,
    cylinder: `${R(-15, -62, 30, 62, P.woodLight, ' rx="4"')}<ellipse fill="${P.wood}" cx="0" cy="-62" rx="15" ry="5"/>${grain(-8, 8, -30)}`,
    triangle: `<path fill="${P.woodLight}" d="M-30 0 L0 -44 L30 0Z"/>${grain(-12, 12, -12)}`,
  }[kind];
  return `<g>${art}</g>`;
}
function handBell(ring) {
  const bell = `<rect fill="${P.woodDeep}" x="-6" y="-78" width="12" height="36" rx="5"/><circle fill="${P.woodDeep}" cx="0" cy="-80" r="8"/>
    <path fill="${P.mustard}" d="M-8 -44 L8 -44 Q20 -38 20 -18 Q20 -8 28 -4 L-28 -4 Q-20 -8 -20 -18 Q-20 -38 -8 -44Z"/><circle fill="${P.mustardDeep}" cx="0" cy="0" r="6"/>${glint('M-10 -34 Q-13 -24 -13 -14', 4)}`;
  return ring ? `<g><g transform="rotate(-18 0 -40)">${bell}</g><path ${tl(P.mustardDeep, 'stroke-width:4')} d="M30 -50 Q38 -40 30 -30 M40 -58 Q52 -40 40 -22 M-34 -58 Q-42 -46 -36 -36"/></g>` : `<g>${bell}</g>`;
}
function globe(spin) {
  const land = spin ? `<path class="n" fill="${P.leaf}" d="M-20 -86 Q-4 -92 2 -80 Q-6 -70 -18 -74 Q-28 -78 -20 -86Z M8 -62 Q24 -66 26 -50 Q16 -40 6 -48Z M-26 -54 Q-16 -52 -18 -40 Q-28 -40 -30 -48Z"/>`
    : `<path class="n" fill="${P.leaf}" d="M-10 -88 Q10 -92 16 -78 Q8 -66 -6 -70 Q-18 -76 -10 -88Z M-24 -58 Q-6 -62 -4 -46 Q-14 -36 -26 -44Z M14 -56 Q28 -54 24 -40 Q14 -38 10 -48Z"/>`;
  return `<g><path fill="${P.woodDeep}" d="M-24 0 L24 0 L16 -10 L-16 -10Z"/><rect fill="${P.wood}" x="-4" y="-26" width="8" height="18"/>
  <path fill="none" style="stroke:${P.mustardDeep};stroke-width:6" d="M-30 -40 A34 34 0 0 0 30 -84"/>
  <circle fill="${P.blue}" cx="0" cy="-64" r="30"/><clipPath id="glb${spin ? 1 : 0}"><circle cx="0" cy="-64" r="30"/></clipPath><g clip-path="url(#glb${spin ? 1 : 0})">${land}</g><circle fill="none" cx="0" cy="-64" r="30"/>
  ${glint('M-18 -80 Q-22 -72 -22 -64', 4)}<circle fill="${P.mustard}" class="thin" cx="-30" cy="-40" r="4"/><circle fill="${P.mustard}" class="thin" cx="30" cy="-84" r="4"/></g>`;
}

// ---------------------------------------------------------------------------
// BAGS AND LUNCH
// ---------------------------------------------------------------------------
export const BAGS = { teal: [P.teal, P.tealDeep, P.butter], rose: [P.rose, P.roseDeep, P.cream], butter: [P.butter, P.mustard, P.teal],
  lav: [P.lav, P.plum, P.butter], sage: [P.sage, P.sageDeep, P.berry], orange: [HAZ, P.terraDeep, P.cream] };
function schoolBackpack([c, d, e]) {
  return `<g><path class="d" style="stroke-width:7" d="M-18 -84 Q0 -104 18 -84"/>
  <path fill="${c}" d="M-38 -8 L-38 -62 Q-38 -88 -14 -88 L14 -88 Q38 -88 38 -62 L38 -8 Q38 0 30 0 L-30 0 Q-38 0 -38 -8Z"/>
  <path fill="${d}" class="n" d="M-36 -60 Q0 -48 36 -60 L36 -66 Q0 -54 -36 -66Z"/><path class="d" d="M-36 -60 Q0 -48 36 -60"/>
  <path fill="${c}" d="M-26 -8 L-26 -34 Q-26 -42 -18 -42 L18 -42 Q26 -42 26 -34 L26 -8Z"/><path class="d" d="M-26 -30 L26 -30"/>
  <path class="thin" fill="${e}" d="${star(0, -18, 8, 3.6)}"/><circle fill="${P.steel}" class="thin" cx="-12" cy="-58" r="3.5"/><path class="d" d="M-12 -55 L-14 -46"/>
  <rect fill="${d}" x="-44" y="-44" width="8" height="30" rx="4"/><rect fill="${d}" x="36" y="-44" width="8" height="30" rx="4"/></g>`;
}
function lunchbox(open) {
  const base = `<path fill="${P.teal}" d="M-44 -6 L-44 -40 L44 -40 L44 -6 Q44 0 38 0 L-38 0 Q-44 0 -44 -6Z"/><path ${tl(P.tealDeep)} d="M-38 -12 L38 -12"/>`;
  if (!open) return `<g><path class="d" style="stroke-width:6" d="M-14 -58 Q0 -72 14 -58"/>${base}<path fill="${P.teal}" d="M-46 -38 L46 -38 L46 -52 Q46 -58 40 -58 L-40 -58 Q-46 -58 -46 -52Z"/>
    <rect fill="${P.butter}" class="thin" x="-6" y="-44" width="12" height="10" rx="3"/><g transform="translate(-24 -22)">${animal('fish', .42)}</g><path class="thin" fill="${P.butter}" d="${star(24, -22, 8, 3.6)}"/></g>`;
  return `<g><g transform="translate(0 -40) rotate(-12)"><path fill="${P.teal}" d="M-46 2 L46 2 L46 -18 Q46 -24 40 -24 L-40 -24 Q-46 -24 -46 -18Z"/><path class="n" fill="${P.tealDeep}" d="M-40 -2 L40 -2 L40 -14 L-40 -14Z"/></g>
    <path fill="${P.toast}" d="M-38 -38 Q-40 -54 -24 -54 Q-8 -54 -10 -38Z"/><path fill="${P.leafLight}" class="thin" d="M-38 -38 L-10 -38 L-12 -34 L-36 -34Z"/>
    <path fill="${HAZ}" d="M2 -40 L10 -60 Q14 -62 14 -58 L10 -40Z"/>${leaf(10, 4, 20, P.leaf, 12, -58)}<circle fill="${P.berry}" cx="28" cy="-46" r="10"/><path class="d" d="M28 -56 L30 -60"/>${base}</g>`;
}
function milkCarton(state) {
  const box = `<path fill="#fff" d="M-18 0 L-18 -52 L18 -52 L18 0Z"/><path fill="${P.sky}" class="n" d="M-17 -34 L17 -34 L17 -12 L-17 -12Z"/><path class="d" d="M-18 -34 L18 -34 M-18 -12 L18 -12"/>
    <g transform="translate(0 -23)"><path fill="#fff" class="thin" d="M-6 -6 Q-8 4 0 6 Q8 4 6 -6Z"/><circle class="ink" cx="-2" cy="-1" r="1.2"/><circle class="ink" cx="2" cy="-1" r="1.2"/></g>`;
  const top = state === 'closed' ? `<path fill="#fff" d="M-18 -52 L-10 -66 L10 -66 L18 -52Z"/><rect fill="#fff" x="-10" y="-72" width="20" height="7" rx="2"/><path class="d" d="M0 -66 L0 -52"/>`
    : `<path fill="#fff" d="M-18 -52 L-10 -66 L4 -66 L18 -52Z"/><path fill="${P.oat}" d="M4 -66 L22 -72 L18 -52Z"/><path class="d" style="stroke:${P.rose};stroke-width:5" d="M2 -60 L10 -92 L20 -96"/>`;
  if (state === 'spilled') {
    return `<g><path fill="#fff" d="M-70 0 Q-74 -8 -60 -10 Q-40 -16 -14 -12 Q10 -16 40 -8 Q62 -6 60 0Z"/><path ${tl(P.oat)} d="M-40 -6 Q-20 -9 0 -6"/>
      <g transform="translate(20 -18) rotate(84)">${box}<path fill="#fff" d="M-18 -52 L-10 -66 L4 -66 L18 -52Z"/><path fill="${P.oat}" d="M4 -66 L22 -72 L18 -52Z"/></g></g>`;
  }
  return `<g>${box}${top}</g>`;
}
function juiceBox(full) {
  const body = full ? `<path fill="${P.leafLight}" d="M-18 0 L-18 -56 L18 -56 L18 0Z"/>` : `<path fill="${P.leafLight}" d="M-18 0 L-16 -30 Q-22 -40 -14 -52 L16 -54 Q20 -42 14 -30 L18 0Z"/>`;
  return `<g>${body}<g transform="translate(0 -26)"><circle fill="${HAZ}" class="thin" cx="-2" cy="2" r="9"/><circle fill="${P.berry}" class="thin" cx="7" cy="-4" r="6"/>${leaf(9, 4, 30, P.leafDeep, 8, -9)}</g>
  <path class="d" style="stroke:${P.blue};stroke-width:5" d="M8 -54 L10 -82 L16 -88"/><path class="d" d="M-18 -46 L18 -46"/></g>`;
}
function snackCup(level) {
  const crackers = level === 'empty' ? '' : (level === 'full' ? [[-14, -46], [0, -52], [14, -46], [-8, -40], [8, -40]] : [[-8, -38], [8, -36]])
    .map(([x, y]) => `<circle fill="${P.crust}" class="thin" cx="${x}" cy="${y}" r="9"/><circle class="n" fill="${P.toastyDeep}" cx="${x - 2}" cy="${y - 1}" r="1.6"/><circle class="n" fill="${P.toastyDeep}" cx="${x + 3}" cy="${y + 2}" r="1.6"/>`).join('');
  return `<g>${crackers}<path fill="${P.butter}" d="M-24 -40 L24 -40 L18 -4 Q17 0 12 0 L-12 0 Q-17 0 -18 -4Z"/><path class="n" fill="${P.mustard}" d="M-22 -30 L22 -30 L21 -24 L-21 -24Z"/>
  <g transform="translate(0 -14)">${[-9, 0, 9].map((x) => `<circle class="n" fill="#fff" cx="${x}" cy="0" r="3"/>`).join('')}</g><rect fill="${P.mustard}" x="-26" y="-44" width="52" height="7" rx="3.5"/></g>`;
}
function lunchTray(food) {
  const tray = `<path fill="${P.sky}" d="M-66 -4 L-70 -20 L70 -20 L66 -4 Q64 0 58 0 L-58 0 Q-64 0 -66 -4Z"/><path ${tl(P.skyDeep)} d="M-20 -18 L-22 -2 M24 -18 L26 -2"/>`;
  if (!food) return `<g>${tray}</g>`;
  return `<g><path fill="${P.toast}" d="M-58 -18 Q-60 -40 -42 -40 Q-24 -40 -26 -18Z"/><path fill="${P.leafLight}" class="thin" d="M-58 -18 L-26 -18 L-28 -14 L-56 -14Z"/>
    <g transform="translate(4 -18)">${[-10, 0, 10].map((x, i) => `<path fill="${HAZ}" class="thin" d="M${x - 3} 0 L${x - 1} -22 Q${x + 2} -24 ${x + 3} -20 L${x + 3} 0Z"/>`).join('')}</g>
    <g transform="translate(46 -18)"><path fill="${P.cream}" d="M-14 0 Q-16 -14 0 -16 Q16 -14 14 0Z"/><path class="n" fill="${P.berry}" d="M-10 -6 Q0 -14 10 -6 L10 -2 L-10 -2Z"/></g>${tray}</g>`;
}

// ---------------------------------------------------------------------------
// NAP, SHOW AND TELL, REWARDS
// ---------------------------------------------------------------------------
const napCot = () => `<g><rect fill="${P.blueDeep}" x="-110" y="-12" width="10" height="12" rx="3"/><rect fill="${P.blueDeep}" x="100" y="-12" width="10" height="12" rx="3"/>
  <path fill="${P.blue}" d="M-116 -30 L116 -30 Q120 -30 120 -26 L120 -16 Q120 -12 116 -12 L-116 -12 Q-120 -12 -120 -16 L-120 -26 Q-120 -30 -116 -30Z"/>
  <path ${tl(P.blueDeep)} d="M-100 -21 L100 -21"/><path fill="#fff" d="M-114 -30 Q-116 -46 -96 -46 L-66 -46 Q-54 -44 -56 -30Z"/></g>`;
function napBlanket(spread) {
  if (spread) return `<g><path fill="${P.lav}" d="M-110 0 Q-116 -20 -104 -28 L100 -30 Q114 -22 110 0Z"/>${[-70, -20, 30, 80].map((x, i) => `<path class="thin" fill="${i % 2 ? P.butter : '#fff'}" d="${star(x, -14, 8, 3.6)}"/>`).join('')}<path ${tl(P.plum)} d="M-100 -24 L96 -26"/></g>`;
  return `<g>${[0, 1, 2].map((i) => `<path fill="${i % 2 ? P.plum : P.lav}" d="M-40 ${-i * 14} L40 ${-i * 14} Q46 ${-i * 14 - 7} 40 ${-i * 14 - 14} L-40 ${-i * 14 - 14} Q-46 ${-i * 14 - 7} -40 ${-i * 14}Z"/>`).join('')}<path class="thin" fill="${P.butter}" d="${star(20, -35, 6, 2.8)}"/></g>`;
}
const plushBunny = () => `<g>
  <ellipse fill="#fff" cx="-14" cy="-92" rx="10" ry="26" transform="rotate(-10 -14 -92)"/><ellipse fill="#fff" cx="14" cy="-92" rx="10" ry="26" transform="rotate(10 14 -92)"/>
  <ellipse class="n" fill="${P.blush}" cx="-14" cy="-90" rx="4" ry="16" transform="rotate(-10 -14 -90)"/><ellipse class="n" fill="${P.blush}" cx="14" cy="-90" rx="4" ry="16" transform="rotate(10 14 -90)"/>
  <ellipse fill="#fff" cx="-22" cy="-10" rx="15" ry="11"/><ellipse fill="#fff" cx="22" cy="-10" rx="15" ry="11"/>
  <path fill="#fff" d="M-26 -8 Q-32 -48 0 -50 Q32 -48 26 -8 Q20 0 0 0 Q-20 0 -26 -8Z"/><ellipse class="n" fill="${P.blush}" cx="0" cy="-24" rx="12" ry="14"/>
  <circle fill="#fff" cx="0" cy="-62" r="28"/><circle class="ink" cx="-10" cy="-64" r="3.4"/><circle class="ink" cx="10" cy="-64" r="3.4"/><path fill="${P.rose}" class="thin" d="M-4 -56 L4 -56 L0 -52Z"/>
  <ellipse class="n" fill="${P.rose}" opacity=".5" cx="-17" cy="-54" rx="5" ry="3"/><ellipse class="n" fill="${P.rose}" opacity=".5" cx="17" cy="-54" rx="5" ry="3"/>
  <path class="thin" fill="${P.teal}" d="M-14 -38 L0 -32 L14 -38 L11 -28 L0 -31 L-11 -28Z"/></g>`;
function showBox(open) {
  const box = `<path fill="${P.lav}" d="M-44 0 L-44 -54 L44 -54 L44 0Z"/>${[[-26, -36, P.butter], [22, -18, '#fff'], [4, -40, P.rose], [-14, -14, P.teal]].map(([x, y, c]) => `<path class="thin" fill="${c}" d="${star(x, y, 8, 3.6)}"/>`).join('')}`;
  if (open) return `<g><path ${tl(P.mustard, 'stroke-width:4')} d="M-20 -66 L-28 -84 M0 -70 L0 -92 M20 -66 L28 -84"/><path fill="${P.plum}" class="n" d="M-40 -54 L40 -54 L40 -46 L-40 -46Z"/>${box}
    <g transform="translate(66 -8) rotate(16)"><path fill="${P.plum}" d="M-48 0 L48 0 L48 -14 L-48 -14Z"/><path fill="${P.butter}" class="thin" d="M-8 -14 L8 -14 L8 0 L-8 0Z"/></g></g>`;
  return `<g>${box}<path fill="${P.plum}" d="M-48 -52 L48 -52 L48 -66 L-48 -66Z"/><path fill="${P.butter}" class="thin" d="M-8 -66 L8 -66 L8 0 L-8 0Z"/><path fill="${P.butter}" d="M0 -66 Q-24 -88 -22 -70 Q-20 -64 0 -66Z M0 -66 Q24 -88 22 -70 Q20 -64 0 -66Z"/></g>`;
}
function stickerSheet(n) {
  const all = [[-20, -62, 'star', P.butter], [4, -62, 'heart', P.rose], [26, -62, 'smile', P.butter], [-20, -38, 'heart', P.berry], [4, -38, 'star', P.teal], [26, -38, 'star', P.lav],
    [-20, -14, 'smile', P.leafLight], [4, -14, 'star', HAZ], [26, -14, 'heart', P.blue]];
  const list = n === 'full' ? all : all.filter((_, i) => i % 3 !== 1);
  const one = ([x, y, k, c]) => k === 'star' ? `<path class="thin" fill="${c}" d="${star(x, y, 9, 4.2)}"/>` : k === 'heart' ? heart(x, y + 1, 1.05, c)
    : `<circle class="thin" fill="${c}" cx="${x}" cy="${y}" r="8"/><circle class="ink" cx="${x - 3}" cy="${y - 2}" r="1.4"/><circle class="ink" cx="${x + 3}" cy="${y - 2}" r="1.4"/><path class="d" d="M${x - 3} ${y + 2} Q${x} ${y + 5} ${x + 3} ${y + 2}"/>`;
  return `<g><path fill="#fff" d="M-40 0 L-40 -76 L46 -76 L46 0Z"/><path ${tl(P.oat, 'stroke-dasharray:5 4')} d="M-34 -50 L40 -50 M-34 -26 L40 -26"/>${list.map(one).join('')}</g>`;
}
function starChart(many) {
  const rows = ['happy', 'calm', 'happy'];
  let s = `<path fill="#fff" d="M-60 0 L-60 -96 L60 -96 L60 0Z"/><path fill="${P.butter}" class="n" d="M-58 -94 L58 -94 L58 -80 L-58 -80Z"/><path class="thin" fill="${P.mustard}" d="${star(0, -87, 6, 2.8)}"/><path class="d" d="M-60 -80 L60 -80"/>`;
  rows.forEach((r, i) => {
    const y = -62 + i * 26;
    s += `<g transform="translate(-44 ${y})">${feelFace(r, 9)}</g><path ${tl(P.oat)} d="M-60 ${y + 13} L60 ${y + 13}"/>`;
    const n = many ? [4, 3, 4][i] : [2, 1, 2][i];
    for (let j = 0; j < 4; j++) s += j < n ? `<path class="thin" fill="${[P.butter, P.rose, P.teal][i]}" d="${star(-20 + j * 22, y, 9, 4.2)}"/>` : `<circle class="n" fill="${P.oat}" cx="${-20 + j * 22}" cy="${y}" r="5"/>`;
  });
  return `<g>${s}<path fill="none" d="M-60 0 L-60 -96 L60 -96 L60 0Z"/></g>`;
}
function weatherCard(kind) {
  return `<g>${R(-34, -76, 68, 76, '#fff', ' rx="8"')}<rect class="n" fill="${{ sun: P.butter, cloud: P.sky, rain: P.blue, snow: P.mint }[kind]}" opacity=".45" x="-28" y="-70" width="56" height="64" rx="6"/>
  <g transform="translate(0 -38)">${WX[kind](.78)}</g><path fill="none" d="${rrect(-34, -76, 68, 76, 8)}"/></g>`;
}

// ---------------------------------------------------------------------------
// RECESS
// ---------------------------------------------------------------------------
const playBall = () => `<g><circle fill="${P.berry}" cx="0" cy="-34" r="34"/><path ${tl('#C4585C', 'stroke-width:4')} d="M-30 -48 Q0 -38 30 -48 M-32 -20 Q0 -30 32 -20"/>${glint('M-16 -58 Q-24 -52 -26 -44', 5)}</g>`;
function jumpRope(open) {
  const handle = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect fill="${P.teal}" x="-6" y="-26" width="12" height="30" rx="6"/><rect fill="${P.tealDeep}" x="-7" y="-28" width="14" height="6" rx="3"/></g>`;
  if (open) return `<g><path fill="none" style="stroke:${P.ink};stroke-width:9" d="M-80 -30 Q-70 6 0 2 Q70 6 80 -30"/><path fill="none" style="stroke:${P.rose};stroke-width:5" d="M-80 -30 Q-70 6 0 2 Q70 6 80 -30"/>${handle(-82, -34, -20)}${handle(82, -34, 20)}</g>`;
  return `<g><path fill="none" style="stroke:${P.ink};stroke-width:9" d="M-26 -10 Q-40 -30 -10 -34 Q24 -36 22 -18 Q18 -2 -8 -6 Q-28 -10 -14 -22 Q2 -30 10 -18"/><path fill="none" style="stroke:${P.rose};stroke-width:5" d="M-26 -10 Q-40 -30 -10 -34 Q24 -36 22 -18 Q18 -2 -8 -6 Q-28 -10 -14 -22 Q2 -30 10 -18"/>${handle(-32, -2, -70)}${handle(34, -4, 64)}</g>`;
}
const chalk = ([c, d]) => `<g><g transform="rotate(-10)"><rect fill="${c}" x="-28" y="-16" width="56" height="16" rx="8"/><path ${tl(d, 'stroke-width:3')} d="M-16 -8 L10 -8"/></g></g>`;
function sandPail(full) {
  return `<g>${full ? `<path fill="#EBD3AC" d="${scallop(0, -46, 28, 12, 7, 4, 180, 360, false)}Z"/>` : ''}<path fill="${P.blue}" d="M-28 -46 L28 -46 L22 -4 Q21 0 16 0 L-16 0 Q-21 0 -22 -4Z"/><ellipse fill="${full ? '#EBD3AC' : P.blueDeep}" cx="0" cy="-46" rx="28" ry="6"/>
  <path class="d" d="M-28 -44 Q0 -84 28 -44"/><path class="thin" fill="${P.butter}" d="${star(0, -22, 9, 4)}"/></g>`;
}
const spade = () => `<g transform="rotate(-30)"><rect fill="${P.mustard}" x="-4" y="-66" width="8" height="40" rx="4"/><rect fill="${P.mustardDeep}" x="-12" y="-72" width="24" height="8" rx="4"/><path fill="${P.berry}" d="M-14 -28 L14 -28 Q14 -6 0 0 Q-14 -6 -14 -28Z"/></g>`;
const sandCastle = () => `<g><path fill="#EBD3AC" d="M-40 0 L-34 -40 L34 -40 L40 0Z"/><path fill="#EBD3AC" d="M-30 -40 L-30 -56 L-20 -56 L-20 -48 L-5 -48 L-5 -56 L5 -56 L5 -48 L20 -48 L20 -56 L30 -56 L30 -40Z"/>
  <path ${tl('#D9BC90', 'stroke-width:3')} d="M-30 -20 L30 -20 M-26 -30 L26 -30"/><path class="d" d="M0 -56 L0 -80"/><path fill="${P.berry}" class="thin" d="M0 -80 L18 -74 L0 -68Z"/><path fill="#D9BC90" class="thin" d="M-8 0 L-8 -12 Q0 -20 8 -12 L8 0Z"/></g>`;

// ---------------------------------------------------------------------------
// WEARABLES (prop sprites while they lie around; worn look = the rig piece)
// ---------------------------------------------------------------------------
const lanyardProp = () => `<g><path fill="none" style="stroke:${P.ink};stroke-width:9" d="M-26 -120 Q-34 -70 -6 -40 M26 -120 Q34 -70 6 -40"/><path fill="none" style="stroke:${P.teal};stroke-width:5" d="M-26 -120 Q-34 -70 -6 -40 M26 -120 Q34 -70 6 -40"/>
  <path class="d" d="M-26 -120 Q0 -132 26 -120"/><rect fill="${P.steel}" x="-6" y="-44" width="12" height="10" rx="3"/>
  ${R(-24, -36, 48, 36, '#fff', ' rx="6"')}<rect class="n" fill="${P.mint}" x="-20" y="-32" width="18" height="22" rx="3"/><circle fill="${P.butter}" class="thin" cx="-11" cy="-22" r="6"/><path ${tl(P.warmGrey)} d="M4 -28 L18 -28 M4 -20 L18 -20 M-20 -6 L18 -6"/></g>`;
const smockProp = (c, d) => `<g><path fill="${c}" d="M-42 0 L-40 -70 Q-40 -86 -24 -90 L-12 -92 Q0 -80 12 -92 L24 -90 Q40 -86 40 -70 L42 0Z"/>
  <path fill="${c}" d="M-40 -84 L-62 -40 L-48 -34 L-36 -60Z M40 -84 L62 -40 L48 -34 L36 -60Z"/><path class="d" d="M-12 -92 Q0 -80 12 -92"/>
  <circle class="n" fill="${CRAYONS.red[0]}" cx="-18" cy="-40" r="7"/><circle class="n" fill="${CRAYONS.blue[0]}" cx="14" cy="-58" r="6"/><circle class="n" fill="${CRAYONS.yellow[0]}" cx="16" cy="-22" r="8"/><circle class="n" fill="${CRAYONS.green[0]}" cx="-8" cy="-16" r="5"/>
  ${R(-20, -34, 40, 22, d, ' rx="5"')}</g>`;
export const SUNHATS = { butter: [P.butter, P.mustard, P.teal], rose: [P.blush, P.rose, P.leaf], mint: [P.mint, P.teal, P.rose] };
const sunHatProp = ([c, d, e]) => `<g><path fill="${c}" d="M-66 0 Q-70 -14 -40 -16 Q-40 -50 0 -52 Q40 -50 40 -16 Q70 -14 66 0 Q0 10 -66 0Z"/>
  <path fill="${e}" d="M-40 -18 Q0 -28 40 -18 L40 -28 Q0 -38 -40 -28Z"/><path class="d" d="M-40 -16 Q0 -8 40 -16"/><path ${tl(d, 'stroke-width:3')} d="M-56 -6 Q0 2 56 -6"/>
  <circle class="thin" fill="#fff" cx="30" cy="-26" r="7"/><circle class="n" fill="${P.butter}" cx="30" cy="-26" r="3"/></g>`;

// ---------------------------------------------------------------------------
const T = (...t) => ['school', ...t];
const byColor = (map, fn) => Object.fromEntries(Object.entries(map).map(([k, c]) => [k, fn(c, k)]));
export const SCHOOL_PROPS = {
  // ---- art supplies ----
  crayon: { label: 'crayon', tags: T('art', 'draw', 'crayon'), variants: byColor(CRAYONS, ([c, d]) => crayon(c, d)), grip: [-6, -8] },
  'crayon-box': { label: 'crayon box', tags: T('art', 'container'), variants: { closed: crayonBox(false), open: crayonBox(true) }, taps: ['closed', 'open'], grip: [0, -30] },
  marker: { label: 'marker', tags: T('art', 'draw', 'marker', 'whiteboard'), variants: byColor({ red: CRAYONS.red, blue: CRAYONS.blue, green: CRAYONS.green, purple: CRAYONS.purple }, ([c, d]) => marker(c, d)), grip: [-10, -9] },
  'glue-stick': { label: 'glue stick', tags: T('art', 'glue'), variants: { closed: glueStick(false), open: glueStick(true) }, taps: ['closed', 'open'], grip: [0, -26] },
  scissors: { label: 'safety scissors', tags: T('art', 'cut'), variants: { default: scissors() }, grip: [-26, -18] },
  'paper-sheet': { label: 'paper', tags: T('art', 'paper', 'stampable'), variants: { blank: paper('blank'), drawing: paper('drawing'), stars: paper('stars') }, grip: [0, -44] },
  'paint-cup': { label: 'paint cup', tags: T('art', 'paint'), variants: byColor(CRAYONS, ([c, d]) => paintCup(c, d)), grip: [0, -20] },
  stamp: { label: 'stamp', tags: T('art', 'stamp', 'teacher'), variants: { star: stamp('star'), smile: stamp('smile'), check: stamp('check') }, grip: [0, -52] },
  'picture-book': { label: 'picture book', tags: T('book', 'story'), variants: { closed: pictureBook(false), open: pictureBook(true), 'closed-blue': pictureBook(false, P.blueDeep), 'open-blue': pictureBook(true, P.blueDeep) }, taps: ['closed', 'open'], grip: [0, -40] },
  puzzle: { label: 'puzzle', tags: T('toy', 'puzzle'), variants: { pieces: puzzle('pieces'), done: puzzle('done') }, taps: ['pieces', 'done'], oneWay: false, grip: [0, -36] },
  'unit-block': { label: 'wooden block', tags: T('toy', 'block', 'build'), variants: { square: unitBlock('square'), long: unitBlock('long'), arch: unitBlock('arch'), cylinder: unitBlock('cylinder'), triangle: unitBlock('triangle') }, grip: [0, -20] },
  'hand-bell': { label: 'hand bell', tags: T('teacher', 'bell', 'sound'), variants: { still: handBell(false), ring: handBell(true) }, taps: ['still', 'ring'], grip: [0, -66] },
  globe: { label: 'globe', tags: T('teacher', 'globe', 'spin'), variants: { still: globe(false), spin: globe(true) }, taps: ['still', 'spin'], grip: [0, -30] },
  // ---- bags and lunch ----
  'school-backpack': { label: 'backpack', tags: ['wear', 'wearable:back', 'container', 'school', 'bag'], variants: byColor(BAGS, (c) => schoolBackpack(c)), grip: [0, -92],
    wear: { piece: 'school-backpack', slot: 'back', colors: byColor(BAGS, ([a, b, c]) => ({ back: a, 'back-sh': b, 'back-2': c })) } },
  'school-lunchbox': { label: 'lunchbox', tags: T('container', 'lunch', 'lunchbox'), variants: { closed: lunchbox(false), open: lunchbox(true) }, taps: ['closed', 'open'], grip: [0, -64] },
  'lunch-tray': { label: 'lunch tray', tags: T('lunch', 'tray', 'container'), variants: { empty: lunchTray(false), lunch: lunchTray(true) }, grip: [0, -10], surface: [-60, 60, -20] },
  'milk-carton': { label: 'milk', tags: T('drink', 'lunch', 'milk'), variants: { closed: milkCarton('closed'), open: milkCarton('open'), spilled: milkCarton('spilled') }, taps: ['closed', 'open'], grip: [0, -30] },
  'juice-box': { label: 'juice box', tags: T('drink', 'lunch', 'snack'), variants: { full: juiceBox(true), empty: juiceBox(false) }, bites: ['full', 'empty'], grip: [0, -28] },
  'snack-cup': { label: 'snack cup', tags: T('food', 'snack', 'lunch'), variants: { full: snackCup('full'), half: snackCup('half'), empty: snackCup('empty') }, bites: ['full', 'half', 'empty'], grip: [0, -20] },
  // ---- nap, show and tell, rewards ----
  'nap-cot': { label: 'nap cot', tags: T('nap', 'bed', 'furniture'), variants: { default: napCot() }, grip: [0, -20], surface: [-110, 110, -30] },
  'nap-blanket': { label: 'nap blanket', tags: T('nap', 'blanket', 'cloth'), variants: { folded: napBlanket(false), spread: napBlanket(true) }, taps: ['folded', 'spread'], grip: [0, -18] },
  'plush-bunny': { label: 'stuffed bunny', tags: T('toy', 'plush', 'hug', 'nap'), variants: { default: plushBunny() }, grip: [0, -40] },
  'show-tell-box': { label: 'show-and-tell box', tags: T('container', 'show-and-tell'), variants: { closed: showBox(false), open: showBox(true) }, taps: ['closed', 'open'], grip: [0, -34] },
  'sticker-sheet': { label: 'stickers', tags: T('reward', 'sticker', 'teacher'), variants: { full: stickerSheet('full'), some: stickerSheet('some') }, bites: ['full', 'some'], grip: [0, -38] },
  'star-chart': { label: 'star chart', tags: T('reward', 'chart', 'teacher'), variants: { few: starChart(false), many: starChart(true) }, taps: ['few', 'many'], grip: [0, -48] },
  'weather-card': { label: 'weather card', tags: T('weather', 'card', 'calendar'), variants: Object.fromEntries(WEATHER.map((k) => [k, weatherCard(k)])), grip: [0, -38] },
  // ---- recess ----
  'playground-ball': { label: 'playground ball', tags: T('toy', 'ball', 'recess', 'throw'), variants: { default: playBall() }, grip: [0, -34] },
  'jump-rope': { label: 'jump rope', tags: T('toy', 'recess', 'rope'), variants: { coiled: jumpRope(false), open: jumpRope(true) }, taps: ['coiled', 'open'], grip: [-30, -14] },
  chalk: { label: 'sidewalk chalk', tags: T('recess', 'draw', 'chalk'), variants: byColor({ pink: CRAYONS.pink, blue: CRAYONS.blue, yellow: CRAYONS.yellow, green: CRAYONS.green }, (c) => chalk(c)), grip: [0, -8] },
  'sand-pail': { label: 'sand pail', tags: T('recess', 'sand', 'container', 'bucket'), variants: { empty: sandPail(false), full: sandPail(true) }, grip: [0, -60] },
  spade: { label: 'sand spade', tags: T('recess', 'sand', 'dig', 'tool'), variants: { default: spade() }, grip: [-30, -50] },
  'sand-castle': { label: 'sand castle', tags: T('recess', 'sand', 'build'), variants: { default: sandCastle() }, grip: [0, -30] },
  // ---- wearables ----
  lanyard: { label: 'teacher lanyard', tags: ['wear', 'wearable:over', 'school', 'teacher'], variants: { default: lanyardProp() }, grip: [0, -120], wear: { piece: 'lanyard', slot: 'over' } },
  smock: { label: 'art smock', tags: ['wear', 'wearable:over', 'school', 'art'], variants: { sky: smockProp(P.sky, P.skyDeep), butter: smockProp(P.butter, P.mustard) }, grip: [0, -88],
    wear: { piece: 'smock', slot: 'over', colors: { sky: { over: P.sky, 'over-sh': P.skyDeep, 'over-2': P.blue }, butter: { over: P.butter, 'over-sh': P.mustard, 'over-2': P.mustardDeep } } } },
  'sun-hat': { label: 'sun hat', tags: ['wear', 'wearable:hat', 'school', 'recess'], variants: byColor(SUNHATS, (c) => sunHatProp(c)), grip: [0, -30],
    wear: { piece: 'sun-hat', slot: 'hat', colors: byColor(SUNHATS, ([a, b, c]) => ({ hat: a, 'hat-sh': b, 'hat-2': c })) } },
};

// Data for the engine (copied into manifest.school by the build).
export const SCHOOL_META = {
  weather: WEATHER,
  feelings: Object.keys(FEELINGS),
  cubbyAnimals: CUBBY_ANIMALS,
  schedule: SCHEDULE,
  // words for the text layer / speech only (never drawn): design 3.4 #6
  scheduleWords: { arrive: 'arrive', circle: 'circle time', play: 'centers', snack: 'snack', recess: 'recess', story: 'story', home: 'home' },
  letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  letterWords: { A: 'apple', B: 'ball', C: 'cat', D: 'dog', E: 'egg', F: 'fish', G: 'goat', H: 'hat', I: 'igloo', J: 'jam', K: 'kite', L: 'leaf', M: 'moon', N: 'nest', O: 'octopus', P: 'pig', Q: 'queen', R: 'rain', S: 'sun', T: 'tree', U: 'umbrella', V: 'van', W: 'whale', X: 'fox', Y: 'yo-yo', Z: 'zebra' },
  sightWords: ['the', 'I', 'a', 'see', 'can', 'go', 'like', 'is'],
  paints: Object.fromEntries(Object.entries(CRAYONS).map(([k, v]) => [k, v[0]])),
  stamps: ['star', 'smile', 'check'],
};
