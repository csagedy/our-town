// Construction Site props (P2c.1, docs/design.md 3.3): BUILDING PIECES with
// snap metadata, tools, wearables, the generic hero set and the dig pit's
// buried treasures. Same contract as props/starter.mjs (origin = bottom
// centre = the resting point, art units; variants[0] is the default), plus:
//   snap:  { footprint: [w, h] cells, stack: [[dx, dy], ...] } in WORLD units
//          relative to the anchor: the centres of the cells a piece can take
//          on top of this one (SITE_META.grid has the cell size, 40).
//          Building pieces are drawn exactly on the grid: a [w, h] piece
//          fills x in [-w*20, w*20] and y in [-h*40, 0] (world), so any
//          combination lines up edge to edge.
//   paint: the variant for each paint colour (SITE_META.paints), so a brush
//          dipped in a colour swaps the sprite; `state` pieces (the door)
//          name their variants <state>-<colour>.
//   wear:  { piece, slot, colors? , pending? }: the rig wear piece (docs/rig.md)
//          a wearable puts on; `colors` per variant overrides the piece's
//          colour variables; pending = the rig piece does not exist yet.
import { P, ART_SCALE } from '../palette.mjs';
import { f, at, tl, star, heart, leaf, scallop, rrect } from '../ink.mjs';

const G = 40 / ART_SCALE;                      // one grid cell, art units
const HAZ = '#EE9A55', HAZD = P.terraDeep;
const DIRT = '#B98A66', DIRTD = '#9C7050';
const glint = (d, w = 5) => `<path ${tl('#fff', `stroke:#fff;stroke-width:${w};opacity:.85`)} d="${d}"/>`;
const R = (x, y, w, h, fill, extra = '') => `<rect fill="${fill}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${extra}/>`;

// Paint colours: [base, shade, light]. Muted toy colours (docs/STYLE.md 3).
export const PAINTS = {
  red: ['#E4846F', '#C8695A', '#F2B3A2'],
  yellow: ['#F2C75C', '#D9A83E', '#F8E2A2'],
  blue: ['#8FB1DC', '#6D90C2', '#C3D6EE'],
  green: ['#96C47F', '#6FA262', '#C5E0B5'],
  purple: ['#B69BD3', '#9579B8', '#DCCDEB'],
};
const PN = Object.keys(PAINTS);
const RAINBOW = PN.map((k) => PAINTS[k][0]);

// ---------------------------------------------------------------------------
// BUILDING PIECES (drawn exactly on the grid)
// ---------------------------------------------------------------------------
const cellBox = (w, h) => [-w * G / 2, -h * G, w * G, h * G];
function stackTops(w, h) {
  return [...Array(w)].map((_, i) => [+((-w / 2 + i + .5) * 40).toFixed(1), -h * 40]);
}
const snap = (w, h, stack = stackTops(w, h)) => ({ footprint: [w, h], stack });

/** A toy block: body, an inset rounded square (tone line) and an emblem. */
function block(w, h, [c, d, l], emblem) {
  const [x, y, W, H] = cellBox(w, h);
  const inset = 9;
  const em = emblem === 'star' ? `<path fill="${l}" class="thin" d="${star(0, -H / 2, 26, 12)}"/>`
    : emblem === 'dots' ? [-W / 4, W / 4].map((dx) => `<circle fill="${l}" class="thin" cx="${f(dx)}" cy="${f(-H / 2)}" r="9"/>`).join('')
    : `<circle fill="${l}" class="thin" cx="0" cy="${f(-H / 2)}" r="11"/>`;
  return `<path fill="${c}" d="${rrect(x, y, W, H, 7)}"/>
  <path ${tl(d, 'stroke-width:4')} d="${rrect(x + inset, y + inset, W - inset * 2, H - inset * 2, 5)}"/>
  <path class="n" fill="${d}" d="M${f(x + 4)} ${f(-8)} L${f(x + W - 4)} ${f(-8)} L${f(x + W - 4)} -4 Q${f(x + W - 4)} 0 ${f(x + W - 8)} 0 L${f(x + 8)} 0 Q${f(x + 4)} 0 ${f(x + 4)} -4Z"/>
  ${em}${glint(`M${f(x + 12)} ${f(y + 22)} L${f(x + 12)} ${f(y + 12)} L${f(x + 22)} ${f(y + 12)}`, 4)}
  <path fill="none" d="${rrect(x, y, W, H, 7)}"/>`;
}
function rainbowBlock(w, h, emblem) {
  const [x, y, W, H] = cellBox(w, h);
  const id = `rb${w}${h}`;
  const bands = RAINBOW.map((c, i) => R(x, y + i * H / 5, W, H / 5 + .5, c, ' class="n"')).join('');
  return `<clipPath id="${id}"><path d="${rrect(x, y, W, H, 7)}"/></clipPath><g clip-path="url(#${id})">${bands}</g>
  ${emblem === 'star' ? `<path fill="#fff" class="thin" d="${star(0, -H / 2, 26, 12)}"/>` : `<circle fill="#fff" class="thin" cx="0" cy="${f(-H / 2)}" r="11"/>`}
  <path fill="none" d="${rrect(x, y, W, H, 7)}"/>`;
}
function paintSet(draw, withNatural = null) {
  const v = {};
  if (withNatural) v.natural = withNatural;
  for (const k of PN) v[k] = draw(PAINTS[k], k);
  return v;
}
const paintMap = (hasNatural) => Object.fromEntries(PN.map((k) => [k, k]).concat(hasNatural ? [['natural', 'natural']] : []));

// plank [4 x 0.5]
function plank(c = P.woodLight, d = P.wood) {
  const [x, y, W, H] = cellBox(4, .5);
  return `<path fill="${c}" d="${rrect(x, y, W, H, 5)}"/><path ${tl(d, 'stroke-width:4')} d="M${f(x + 30)} ${f(y + 8)} Q${f(x + 70)} ${f(y + 3)} ${f(x + 110)} ${f(y + 8)} M${f(x + 140)} ${f(y + H - 7)} L${f(x + 200)} ${f(y + H - 7)} M${f(x + W - 60)} ${f(y + 9)} L${f(x + W - 24)} ${f(y + 9)}"/>
  <circle class="thin" fill="${P.steelDeep}" cx="${f(x + 12)}" cy="${f(y + H / 2)}" r="3.5"/><circle class="thin" fill="${P.steelDeep}" cx="${f(x + W - 12)}" cy="${f(y + H / 2)}" r="3.5"/>`;
}
// steel beam [6 x 0.5]: an I-beam seen side on, with bolt holes
function beam(c = P.terra, d = P.terraDeep) {
  const [x, y, W, H] = cellBox(6, .5);
  let holes = '';
  for (let i = 0; i < 6; i++) holes += `<circle class="thin" fill="${d}" cx="${f(x + G * (i + .5))}" cy="${f(y + H / 2)}" r="5"/>`;
  return `<path fill="${c}" d="${rrect(x, y, W, H, 3)}"/><path ${tl(d, 'stroke-width:4')} d="M${f(x + 4)} ${f(y + 6)} L${f(x + W - 4)} ${f(y + 6)} M${f(x + 4)} ${f(y + H - 6)} L${f(x + W - 4)} ${f(y + H - 6)}"/>${holes}`;
}
// gable roof [4 x 2]
function roofTri([c, d, l]) {
  const w = 2 * G, h = 2 * G;
  let rows = '';
  for (let i = 1; i < 4; i++) {
    const yy = -h * i / 4, half = w * (1 - i / 4);
    rows += `<path ${tl(d, 'stroke-width:4')} d="${scallop(0, yy, half - 8, 0.01, Math.max(2, Math.round(half / 18)), 7, 180, 0, false).replace(/^M/, 'M')}"/>`;
  }
  return `<path fill="${c}" d="M${f(-w)} 0 L0 ${f(-h)} L${f(w)} 0Z"/>${rows}
  <path fill="${d}" d="M${f(-w)} 0 L${f(w)} 0 L${f(w - 6)} -10 L${f(-w + 6)} -10Z"/>
  <circle fill="${l}" class="thin" cx="0" cy="${f(-h * .42)}" r="12"/><path class="n" fill="${d}" d="M-12 ${f(-h * .42)} L12 ${f(-h * .42)} M0 ${f(-h * .42 - 12)} L0 ${f(-h * .42 + 12)}" style="stroke:${d};stroke-width:3"/>
  <path fill="none" d="M${f(-w)} 0 L0 ${f(-h)} L${f(w)} 0Z"/>`;
}
// flat roof [4 x 0.5]: a slab with a scalloped trim
function roofFlat([c, d]) {
  const [x, y, W, H] = cellBox(4, .5);
  const trim = [...Array(8)].map((_, i) => { const x0 = x + i * W / 8; return `Q${f(x0 + W / 16)} ${f(y + H + 10)} ${f(x0 + W / 8)} ${f(y + H - 2)}`; }).join(' ');
  return `<path fill="${d}" d="M${f(x)} ${f(y + 8)} L${f(x + W)} ${f(y + 8)} L${f(x + W)} ${f(y + H - 2)} ${[...Array(8)].map((_, i) => { const x0 = x + W - i * W / 8; return `Q${f(x0 - W / 16)} ${f(y + H + 8)} ${f(x0 - W / 8)} ${f(y + H - 2)}`; }).join(' ')}Z"/>
  ${R(x - 4, y, W + 8, 14, c, ' rx="4"')}`;
}
// a wall cell with a window [1 x 1]; the wall takes the paint, the frame stays white
function windowCell([c, d], round = false) {
  const [x, y, W, H] = cellBox(1, 1);
  const glass = round
    ? `<circle fill="#fff" cx="0" cy="${f(-H / 2)}" r="20"/><circle fill="${P.sky}" cx="0" cy="${f(-H / 2)}" r="13"/>${glint(`M-7 ${f(-H / 2 - 3)} Q-6 ${f(-H / 2 - 8)} -1 ${f(-H / 2 - 9)}`, 3.5)}`
    : `${R(-17, y + 11, 34, 32, '#fff', ' rx="3"')}<path class="n" fill="${P.sky}" d="M-12 ${f(y + 16)} L12 ${f(y + 16)} L12 ${f(y + 38)} L-12 ${f(y + 38)}Z"/><path ${tl('#fff', 'stroke:#fff;stroke-width:4')} d="M0 ${f(y + 16)} L0 ${f(y + 38)} M-12 ${f(y + 27)} L12 ${f(y + 27)}"/>${R(-21, y + 42, 42, 7, '#fff', ' rx="3"')}`;
  return `<path fill="${c}" d="${rrect(x, y, W, H, 5)}"/><path class="n" fill="${d}" d="M${f(x + 4)} -6 L${f(x + W - 4)} -6 L${f(x + W - 4)} -2 L${f(x + 4)} -2Z"/>${glass}`;
}
// a wall cell pair with a door [1 x 2]
function doorCell([c, d], open, leaf2 = P.woodDeep, leaf2d = P.woodDark) {
  const [x, y, W, H] = cellBox(1, 2);
  const dx0 = -17, dx1 = 17, dy0 = y + 14;
  const closed = `<path fill="${leaf2}" d="M${dx0} 0 L${dx0} ${f(dy0 + 14)} Q${dx0} ${f(dy0)} 0 ${f(dy0)} Q${dx1} ${f(dy0)} ${dx1} ${f(dy0 + 14)} L${dx1} 0Z"/>
    <path ${tl(leaf2d, 'stroke-width:3.5')} d="M-9 ${f(dy0 + 18)} L-9 -8 M0 ${f(dy0 + 10)} L0 -8 M9 ${f(dy0 + 18)} L9 -8"/><circle fill="${P.mustard}" class="thin" cx="10" cy="${f(-H * .42)}" r="4"/>`;
  const opened = `<path fill="${P.charDeep}" d="M${dx0} 0 L${dx0} ${f(dy0 + 14)} Q${dx0} ${f(dy0)} 0 ${f(dy0)} Q${dx1} ${f(dy0)} ${dx1} ${f(dy0 + 14)} L${dx1} 0Z"/>
    <path class="n" fill="#FFE3A8" opacity=".75" d="M${dx0 + 4} 0 L${dx0 + 4} ${f(dy0 + 30)} L${dx1 - 4} ${f(dy0 + 30)} L${dx1 - 4} 0Z"/>
    <path fill="${leaf2}" d="M${dx0} 0 L${dx0} ${f(dy0 + 14)} L${dx0 - 12} ${f(dy0 + 4)} L${dx0 - 12} 6Z"/><circle fill="${P.mustard}" class="thin" cx="${dx0 - 8}" cy="${f(-H * .42)}" r="3"/>`;
  return `<path fill="${c}" d="${rrect(x, y, W, H, 5)}"/>${open ? opened : closed}${R(dx0 - 4, -6, dx1 - dx0 + 8, 6, d, ' rx="2"')}`;
}
// stairs [2 x 2]: two steps rising to the right
function stairs([c, d, l]) {
  const s = G;
  return `<path fill="${c}" d="M${f(-s)} 0 L${f(-s)} ${f(-s)} L0 ${f(-s)} L0 ${f(-2 * s)} L${f(s)} ${f(-2 * s)} L${f(s)} 0Z"/>
  <path fill="${l}" d="M${f(-s)} ${f(-s)} L0 ${f(-s)} L0 ${f(-s + 10)} L${f(-s)} ${f(-s + 10)}Z M0 ${f(-2 * s)} L${f(s)} ${f(-2 * s)} L${f(s)} ${f(-2 * s + 10)} L0 ${f(-2 * s + 10)}Z"/>
  <path ${tl(d, 'stroke-width:4')} d="M${f(-s + 10)} -12 L-10 -12 M10 ${f(-s - 12)} L${f(s - 10)} ${f(-s - 12)} M10 -12 L${f(s - 10)} -12"/>`;
}
// flag [1 x 2]: a pole with a pennant
function flag([c, d, l]) {
  const h = 2 * G;
  return `${R(-5, -h + 6, 10, h - 12, P.steel, ' rx="4"')}<circle fill="${P.mustard}" cx="0" cy="${f(-h + 4)}" r="7"/>${R(-14, -12, 28, 12, P.steelDeep, ' rx="4"')}
  <path fill="${c}" d="M5 ${f(-h + 12)} Q24 ${f(-h + 4)} 40 ${f(-h + 16)} Q30 ${f(-h + 34)} 44 ${f(-h + 50)} Q24 ${f(-h + 42)} 5 ${f(-h + 50)}Z"/>
  <path fill="${l}" class="thin" d="${star(20, -h + 31, 8, 3.5)}"/>`;
}
// chimney [1 x 1]
function chimney([c, d]) {
  const [x, y, W, H] = cellBox(1, 1);
  return `${R(x + 8, y + 10, W - 16, H - 10, c, ' rx="3"')}<path ${tl(d, 'stroke-width:4')} d="M${f(x + 8)} ${f(y + 26)} L${f(x + W - 8)} ${f(y + 26)} M${f(x + 8)} ${f(y + 42)} L${f(x + W - 8)} ${f(y + 42)} M0 ${f(y + 10)} L0 ${f(y + 26)} M-10 ${f(y + 26)} L-10 ${f(y + 42)} M10 ${f(y + 26)} L10 ${f(y + 42)}"/>
  ${R(x + 2, y, W - 4, 12, d, ' rx="4"')}`;
}
const NATURAL_WALL = [P.cream, P.oat];
const BRICK = [P.terra, P.terraDeep];

// ---------------------------------------------------------------------------
// TOOLS AND GEAR
// ---------------------------------------------------------------------------
const hammer = () => `<g transform="rotate(-24)"><rect fill="${P.wood}" x="-7" y="-92" width="14" height="86" rx="6"/><path ${tl(P.woodDeep, 'stroke-width:3.5')} d="M-1 -70 L-1 -20"/>${R(-10, -24, 20, 22, P.berry, ' rx="6"')}
  <path fill="${P.steel}" d="M-30 -112 L22 -112 Q34 -112 34 -100 L34 -94 L-30 -94 Q-40 -103 -30 -112Z"/><path fill="${P.steelDeep}" d="M-8 -112 L8 -112 L8 -92 L-8 -92Z"/></g>`;
const wrench = () => `<g transform="rotate(-30)"><path fill="${P.steel}" d="M-7 -12 L-7 -76 L7 -76 L7 -12Z"/><path fill="${P.steel}" d="M-20 -80 Q-24 -104 -8 -110 L-6 -94 L6 -94 L8 -110 Q24 -104 20 -80 Q10 -70 0 -72 Q-10 -70 -20 -80Z"/>
  <circle fill="${P.steel}" cx="0" cy="-8" r="13"/><circle fill="${P.steelDeep}" class="thin" cx="0" cy="-8" r="6"/>${glint('M-3 -24 L-3 -64', 3.5)}</g>`;
const saw = () => `<path fill="${P.steel}" d="M-70 -10 L40 -10 L40 -44 L-58 -24 Z"/><path fill="${P.steel}" class="n" d="M-70 -10 L40 -10"/>
  <path class="d" d="${[...Array(11)].map((_, i) => `M${-66 + i * 10} -10 l5 7 l5 -7`).join(' ')}"/>
  <path fill="${P.berry}" d="M34 -52 L78 -52 Q90 -52 90 -40 L90 -14 Q90 -2 78 -2 L34 -2Z"/><path fill="${P.steel}" d="M50 -40 L76 -40 L76 -16 L50 -16Z"/>${glint('M-40 -18 L20 -30', 3.5)}`;
function drill(on) {
  const spin = on ? `<path ${tl('#fff', 'stroke:#fff;stroke-width:4')} d="M-98 -84 q-6 -10 -14 -8 M-98 -60 q-6 10 -14 8"/><circle class="n" fill="${P.butter}" cx="-112" cy="-72" r="5" opacity=".9"/>` : '';
  return `<path fill="${P.teal}" d="M-50 -94 L30 -94 Q46 -94 46 -78 L46 -66 Q46 -52 30 -52 L10 -52 L10 -8 Q10 0 2 0 L-22 0 Q-30 0 -30 -8 L-30 -52 L-50 -52Z"/>
  ${R(-30, -26, 40, 26, P.char, ' rx="5"')}<path fill="${P.char}" d="M-50 -88 L-66 -84 L-66 -62 L-50 -58Z"/><path fill="${P.steel}" d="M-66 -78 L-98 -74 L-98 -70 L-66 -66Z"/>
  ${R(-6, -48, 12, 16, P.berry, ' rx="4"')}<path ${tl(P.tealDeep, 'stroke-width:4')} d="M-30 -80 L28 -80 M-30 -68 L28 -68"/>${spin}`;
}
function brush(c) {
  const bristle = c ? c[0] : P.oat;
  return `<g transform="rotate(-20)">${R(-6, -110, 12, 58, P.wood, ' rx="5"')}<circle fill="${P.woodDeep}" class="thin" cx="0" cy="-104" r="3"/>${R(-12, -56, 24, 16, P.steel, ' rx="3"')}
  <path fill="${bristle}" d="M-14 -40 L14 -40 L12 -8 Q0 4 -12 -8Z"/><path ${tl(c ? c[1] : P.warmGrey, 'stroke-width:3')} d="M-5 -36 L-5 -10 M5 -36 L5 -10"/>
  ${c ? `<path class="thin" fill="${c[0]}" d="M-4 -6 Q0 8 4 -6Z"/>` : ''}</g>`;
}
function paintCan(c, rainbow = false) {
  const top = rainbow ? RAINBOW.map((col, i) => `<path class="n" fill="${col}" d="M${-28 + i * 11.2} -70 L${-16.8 + i * 11.2} -70 L${-16.8 + i * 11.2} -60 L${-28 + i * 11.2} -60Z"/>`).join('') : '';
  const col = rainbow ? RAINBOW[0] : c[0];
  const drip = rainbow ? RAINBOW.slice(1, 4).map((cc, i) => `<path fill="${cc}" class="thin" d="M${-18 + i * 14} -62 L${-10 + i * 14} -62 L${-10 + i * 14} ${-44 + i * 6} Q${-14 + i * 14} ${-38 + i * 6} ${-18 + i * 14} ${-44 + i * 6}Z"/>`).join('')
    : `<path fill="${col}" class="thin" d="M8 -62 L20 -62 L20 -36 Q14 -28 8 -36Z"/>`;
  return `<path fill="${P.steel}" d="M-34 -64 L34 -64 L34 -4 Q34 0 30 0 L-30 0 Q-34 0 -34 -4Z"/>
  ${R(-34, -48, 68, 30, rainbow ? '#fff' : c[2], '')}${rainbow ? RAINBOW.map((cc, i) => R(-34 + i * 13.6, -48, 13.6, 30, cc, ' class="n"')).join('') + R(-34, -48, 68, 30, 'none') : `<path fill="${c[0]}" class="thin" d="${star(0, -33, 11, 5)}"/>`}
  <ellipse fill="${col}" cx="0" cy="-64" rx="34" ry="9"/>${top}${drip}<path class="d" d="M-34 -58 Q0 -110 34 -58"/>${glint('M-26 -10 L-26 -40', 3.5)}`;
}
function cone(down) {
  const body = `${R(-38, -12, 76, 12, HAZD, ' rx="3"')}<path fill="${HAZ}" d="M-30 -12 L-9 -112 Q0 -120 9 -112 L30 -12Z"/><path fill="${P.cream}" class="n" d="M-21 -54 L21 -54 L17 -74 L-17 -74Z"/><path fill="${P.cream}" class="n" d="M-14 -88 L14 -88 L12 -98 L-12 -98Z"/><path fill="none" d="M-30 -12 L-9 -112 Q0 -120 9 -112 L30 -12Z"/>`;
  return down ? `<g transform="translate(-10 -38) rotate(-90)">${body}</g>` : body;
}
function wheelbarrow(full) {
  const load = full ? `<path fill="${DIRT}" d="M-60 -64 ${scallop(-6, -64, 56, 30, 8, 7, 180, 360, false).replace(/^M[^Q]*/, '')} L50 -64Z"/><circle class="thin" fill="${P.warmGrey}" cx="-20" cy="-80" r="7"/><path ${tl(DIRTD, 'stroke-width:3.5')} d="M4 -78 q6 -6 12 0"/>` : '';
  return `<path class="d" d="M24 -36 L88 -58"/><path fill="${P.woodDeep}" d="M84 -62 L110 -70 L112 -62 L88 -54Z"/>
  <path fill="${P.char}" d="M-30 -30 L-38 0 L-30 0 L-22 -30Z"/>${load}
  <path fill="${P.leaf}" d="M-66 -66 L52 -66 L30 -26 Q26 -20 18 -20 L-40 -20 Q-48 -20 -52 -26Z"/><path ${tl(P.leafDeep, 'stroke-width:4')} d="M-54 -54 L44 -54"/>
  <circle fill="${P.char}" cx="40" cy="-18" r="18"/><circle fill="${P.steel}" cx="40" cy="-18" r="7"/>`;
}
function hose(spray) {
  const coil = [0, 1, 2].map((i) => `<ellipse fill="none" style="stroke-width:12" cx="${-10 + i * 2}" cy="${-30 - i * 4}" rx="${44 - i * 8}" ry="${24 - i * 4}"/><ellipse class="n" fill="none" style="stroke:${P.leaf};stroke-width:7" cx="${-10 + i * 2}" cy="${-30 - i * 4}" rx="${44 - i * 8}" ry="${24 - i * 4}"/>`).join('');
  const water = spray ? `<path ${tl(P.skyDeep, 'stroke-width:6')} d="M72 -58 Q100 -80 124 -64 M72 -52 Q104 -60 128 -44 M72 -46 Q98 -40 116 -24"/>${[[126, -70], [132, -44], [118, -20], [110, -84]].map(([x, y]) => `<circle class="thin" fill="${P.sky}" cx="${x}" cy="${y}" r="5"/>`).join('')}` : '';
  return `${R(-60, -8, 100, 10, P.leafDeep, ' rx="4"')}${coil}<path fill="none" style="stroke-width:12" d="M34 -30 Q56 -30 60 -48"/><path class="n" fill="none" style="stroke:${P.leaf};stroke-width:7" d="M34 -30 Q56 -30 60 -48"/>
  <path fill="${P.mustard}" d="M54 -48 L74 -60 L78 -52 L60 -40Z"/>${water}`;
}
function blueprint(kind) {
  if (kind === 'rolled') {
    return `<g transform="rotate(-8)">${R(-60, -30, 120, 30, P.blue, ' rx="15"')}<ellipse fill="${P.sky}" cx="60" cy="-15" rx="8" ry="15"/><ellipse class="thin" fill="none" cx="60" cy="-15" rx="3" ry="7" style="stroke:${P.blueDeep}"/>
    <path ${tl(P.blueDeep, 'stroke-width:3.5')} d="M-40 -22 L30 -22 M-30 -8 L20 -8"/>${R(-10, -32, 12, 34, P.berry, ' rx="3"')}</g>`;
  }
  const art = {
    house: 'M-40 -24 L-40 -64 L0 -94 L40 -64 L40 -24Z M-12 -24 L-12 -50 L10 -50 L10 -24 M18 -68 L32 -68 L32 -54 L18 -54Z M-32 -68 L-18 -68 L-18 -54 L-32 -54Z',
    tower: 'M-20 -24 L-20 -104 L20 -104 L20 -24Z M-26 -104 L0 -128 L26 -104 M-10 -90 L10 -90 L10 -76 L-10 -76Z M-10 -64 L10 -64 L10 -50 L-10 -50Z M-8 -24 L-8 -40 L8 -40 L8 -24',
    bridge: 'M-54 -30 L54 -30 M-54 -44 L54 -44 M-44 -30 L-44 -80 M44 -30 L44 -80 M-44 -80 Q0 -40 44 -80 M-54 -84 Q-44 -92 -34 -84 M-22 -60 L-22 -44 M0 -52 L0 -44 M22 -60 L22 -44',
  }[kind];
  const h = kind === 'tower' ? 140 : 110;
  return `<path fill="${P.blue}" d="M-70 -6 L-70 ${-h} L70 ${-h} L70 -6Z"/><path ${tl('#C3D6EE', 'stroke-width:2.5')} d="${[...Array(6)].map((_, i) => `M${-60 + i * 24} ${-h + 6} L${-60 + i * 24} -12`).join(' ')} ${[...Array(Math.floor(h / 24))].map((_, i) => `M-64 ${-h + 12 + i * 24} L64 ${-h + 12 + i * 24}`).join(' ')}"/>
  <path ${tl('#fff', 'stroke:#fff;stroke-width:5')} d="${art}"/>
  <ellipse fill="${P.sky}" cx="-70" cy="${f(-h / 2 - 3)}" rx="9" ry="${f(h / 2 - 1)}"/><ellipse fill="${P.sky}" cx="70" cy="${f(-h / 2 - 3)}" rx="9" ry="${f(h / 2 - 1)}"/>`;
}
function lunchbox(open) {
  const body = `${R(-44, -46, 88, 46, P.berry, ' rx="8"')}<path fill="${P.cream}" class="thin" d="${star(0, -24, 12, 5)}"/>`;
  if (!open) return `${body}${R(-46, -58, 92, 16, '#C4585C', ' rx="7"')}<path fill="none" d="M-16 -58 L-16 -72 Q-16 -76 -12 -76 L12 -76 Q16 -76 16 -72 L16 -58" style="stroke-width:7"/>${R(-6, -48, 12, 10, P.steel, ' rx="2"')}`;
  return `<path fill="#C4585C" d="M-46 -46 L-50 -96 Q-50 -100 -46 -100 L42 -100 Q46 -100 46 -96 L46 -46Z"/><path fill="#B04D52" d="M-40 -52 L-43 -92 L40 -92 L40 -52Z"/>
  ${at(-16, -44, .9, `<path fill="${P.toast}" d="M-20 0 L-20 -20 Q-24 -32 -10 -34 Q0 -40 10 -34 Q24 -32 20 -20 L20 0Z"/><path fill="${P.leafLight}" class="thin" d="M-22 -12 Q0 -6 22 -12 L22 -8 Q0 -2 -22 -8Z"/>`)}
  <circle fill="${P.berry}" cx="20" cy="-54" r="11"/><path class="d" d="M20 -65 L22 -72"/>${body}`;
}
const thermos = () => `${R(-20, -96, 40, 96, P.teal, ' rx="10"')}${R(-22, -108, 44, 20, P.tealDeep, ' rx="7"')}${R(-14, -116, 28, 10, P.char, ' rx="4"')}
  ${R(-20, -60, 40, 20, P.cream, '')}<path fill="${P.berry}" class="thin" d="${star(0, -50, 7, 3)}"/><path fill="none" d="M20 -80 Q34 -80 34 -60 Q34 -40 20 -40" style="stroke-width:7"/>${glint('M-12 -86 L-12 -68', 3.5)}`;
const toolBelt = () => `${R(-64, -56, 128, 22, P.woodDeep, ' rx="6"')}${R(-10, -60, 20, 30, P.mustard, ' rx="4"')}${R(-4, -54, 8, 18, P.woodDeep, ' rx="2"')}
  <path fill="${P.wood}" d="M-60 -36 L-22 -36 L-24 -2 Q-24 0 -28 0 L-54 0 Q-58 0 -58 -4Z"/><path fill="${P.wood}" d="M22 -36 L60 -36 L58 -4 Q58 0 54 0 L28 0 Q24 0 24 -2Z"/>
  <path class="d" d="M-56 -26 L-26 -26 M26 -26 L56 -26"/>
  ${at(-44, -36, .5, `<rect fill="${P.wood}" x="-7" y="-80" width="14" height="80" rx="6"/><path fill="${P.steel}" d="M-24 -96 L20 -96 L20 -80 L-24 -80Z"/>`)}${at(40, -36, .55, `<rect fill="${P.steel}" x="-6" y="-70" width="12" height="70" rx="5"/><path fill="${P.steel}" d="M-16 -74 Q-18 -94 -6 -96 L-4 -84 L4 -84 L6 -96 Q18 -94 16 -74Z"/>`)}
  ${R(-40, -42, 10, 16, P.berry, ' class="thin" rx="3"')}`;
const gloves = () => [-1, 1].map((s) => `<g transform="translate(${s * 30} 0) scale(${s} 1)"><path fill="${P.butter}" d="M-24 0 L-24 -40 Q-26 -60 -16 -64 L-16 -78 Q-16 -84 -10 -84 Q-4 -84 -4 -78 L-4 -64 L0 -84 Q2 -90 8 -88 Q14 -86 12 -80 L8 -62 L14 -70 Q18 -76 24 -72 Q28 -68 24 -62 L16 -44 L16 0Z"/>
  ${R(-26, -18, 44, 18, HAZ, ' rx="4"')}<path ${tl(P.mustardDeep, 'stroke-width:3.5')} d="M-12 -30 Q-4 -24 6 -30"/></g>`).join('');
function hardHat(c, d, l) {
  return `<path fill="${c}" d="M-50 -18 C-52 -58 -26 -74 0 -74 C26 -74 52 -58 50 -18Z"/><path fill="${l}" d="M-10 -74 L10 -74 L8 -20 L-8 -20Z"/>
  ${R(-64, -24, 128, 20, d, ' rx="10"')}<path class="d" d="M-30 -52 Q-24 -62 -12 -66"/>`;
}
const vest = () => `<path fill="${HAZ}" d="M-50 -110 L-20 -110 L-14 -86 Q0 -74 14 -86 L20 -110 L50 -110 Q60 -80 58 -40 L56 0 L6 0 L6 -60 L-6 -60 L-6 0 L-56 0 L-58 -40 Q-60 -80 -50 -110Z"/>
  ${R(-56, -54, 50, 12, P.cream, ' class="thin" rx="3"')}${R(6, -54, 50, 12, P.cream, ' class="thin" rx="3"')}${R(-56, -30, 50, 12, P.cream, ' class="thin" rx="3"')}${R(6, -30, 50, 12, P.cream, ' class="thin" rx="3"')}
  <path class="d" d="M-6 -60 L-6 0 M6 -60 L6 0"/>${R(-40, -94, 20, 16, HAZD, ' class="thin" rx="3"')}`;

// ---------------------------------------------------------------------------
// HERO SET (original: no real-world IP; teal + orange with a star and swirls)
// ---------------------------------------------------------------------------
export const HERO = {
  teal: [P.teal, P.tealDeep, P.butter], orange: [HAZ, HAZD, P.cream], purple: [P.plum, P.plumDeep, P.butter],
};
function cape([c, d, clasp]) {
  // flying: pinned at the collar, billowing out to the right with a wavy hem
  const out = 'M-22 -156 Q-50 -90 -52 -4 Q-30 6 -12 -6 Q8 8 30 -10 Q54 2 74 -22 Q98 -20 112 -44 Q70 -80 40 -120 Q24 -144 22 -156Z';
  return `<path fill="${c}" d="${out}"/>
  <path class="n" fill="${d}" d="M-30 -8 Q-34 -80 -12 -140 L-4 -138 Q-22 -80 -18 -6Z M28 -14 Q30 -70 14 -132 L22 -134 Q42 -80 44 -18Z M76 -26 Q70 -54 48 -96 L56 -98 Q82 -60 90 -32Z"/>
  <path fill="none" d="${out}"/>
  <path fill="${c}" d="M-36 -168 Q0 -150 36 -168 L28 -146 Q0 -134 -28 -146Z"/>
  <circle fill="${clasp}" cx="0" cy="-150" r="12"/><path fill="${d}" class="thin" d="${star(0, -150, 7, 3)}"/>`;
}
function mask([c, d]) {
  const hole = (x) => `M${x - 14} -30 C${x - 14} -44 ${x + 14} -44 ${x + 14} -30 C${x + 14} -17 ${x - 14} -17 ${x - 14} -30Z`;
  return `<path fill="${c}" fill-rule="evenodd" d="M-66 -44 C-56 -58 -12 -54 0 -46 C12 -54 56 -58 66 -44 C70 -24 60 -10 38 -10 C22 -10 8 -22 0 -20 C-8 -22 -22 -10 -38 -10 C-60 -10 -70 -24 -66 -44Z ${hole(-32)} ${hole(32)}"/>
  <path fill="${c}" d="M64 -38 L86 -48 L82 -30Z M-64 -38 L-86 -48 L-82 -30Z"/><path class="n" fill="${d}" d="M-56 -24 Q-44 -14 -30 -16 L-30 -12 Q-46 -10 -58 -20Z"/>${glint('M-54 -44 Q-46 -50 -36 -50', 3.5)}`;
}
/** The web-slinger style suit top: teal body, orange sleeves and side panels, a star emblem, swirl lines. */
function heroSuit() {
  const T = P.teal, TD = P.tealDeep, O = HAZ, OD = HAZD;
  const body = 'M-44 -150 L-18 -158 Q0 -146 18 -158 L44 -150 L50 -4 Q50 0 46 0 L-46 0 Q-50 0 -50 -4Z';
  const sleeve = (s) => `<path fill="${O}" d="M${s * 44} -150 L${s * 74} -134 L${s * 104} -46 L${s * 80} -36 L${s * 52} -104Z"/>${R(s > 0 ? 78 : -106, -48, 28, 16, T, ` class="thin" rx="5" transform="rotate(${s * -18} ${s * 92} -40)"`)}`;
  let swirls = '';
  for (const [x, y, r] of [[-26, -110, 12], [26, -36, 12], [-24, -30, 10], [28, -118, 9]]) swirls += `M${x + r} ${y} A${r} ${r} 0 1 0 ${x} ${y + r} A${r * .6} ${r * .6} 0 1 1 ${x + r * .5} ${y - r * .2}`;
  return `<clipPath id="suit"><path d="${body}"/></clipPath>${sleeve(-1)}${sleeve(1)}
  <path fill="${T}" d="${body}"/><g clip-path="url(#suit)"><path class="n" fill="${O}" d="M-50 -110 L-36 -110 L-30 0 L-50 0Z M50 -110 L36 -110 L30 0 L50 0Z"/><path ${tl(TD, 'stroke-width:4')} d="${swirls}"/>${R(-50, -16, 100, 16, TD, ' class="n"')}</g>
  <path fill="none" d="${body}"/><path class="d" d="M-18 -158 Q0 -140 18 -158"/>
  <circle fill="${O}" cx="0" cy="-92" r="24"/><path fill="${P.butter}" class="thin" d="${star(0, -92, 17, 7.5)}"/>
  <path class="d" d="M-34 -16 L34 -16"/>`;
}

// ---------------------------------------------------------------------------
// TREASURES (buried in the dig pit)
// ---------------------------------------------------------------------------
const dinoBone = () => `<g transform="rotate(-10)"><path fill="${P.oat}" d="M-54 -34 Q-70 -48 -58 -58 Q-48 -64 -42 -52 Q-40 -64 -28 -62 Q-16 -58 -24 -44 L24 -44 Q16 -58 28 -62 Q40 -64 42 -52 Q48 -64 58 -58 Q70 -48 54 -34 Q70 -22 58 -12 Q48 -6 42 -18 Q40 -6 28 -8 Q16 -12 24 -26 L-24 -26 Q-16 -12 -28 -8 Q-40 -6 -42 -18 Q-48 -6 -58 -12 Q-70 -22 -54 -34Z"/>
  <path ${tl(P.warmGrey, 'stroke-width:3.5')} d="M-20 -38 L20 -38 M-54 -34 Q-48 -34 -46 -30 M54 -34 Q48 -34 46 -30"/></g>`;
function chest(open) {
  const base = `${R(-50, -46, 100, 46, P.woodDeep, ' rx="6"')}<path ${tl(P.woodDark, 'stroke-width:3.5')} d="M-50 -24 L50 -24"/>${R(-40, -46, 10, 46, P.mustard, ' class="thin"')}${R(30, -46, 10, 46, P.mustard, ' class="thin"')}${R(-9, -40, 18, 20, P.mustard, ' rx="3"')}<circle class="ink" cx="0" cy="-32" r="3"/>`;
  if (!open) return `${base}<path fill="${P.woodDeep}" d="M-52 -46 L-52 -64 Q-52 -90 0 -90 Q52 -90 52 -64 L52 -46Z"/>${R(-40, -88, 10, 42, P.mustard, ' class="thin"')}${R(30, -88, 10, 42, P.mustard, ' class="thin"')}${R(-52, -52, 104, 8, P.mustard, ' class="thin" rx="3"')}`;
  const loot = `${[[-30, -54, P.mustard], [-12, -60, P.butter], [8, -56, P.mustard], [26, -52, P.butter], [-4, -66, P.mustard]].map(([x, y, c]) => `<circle fill="${c}" class="thin" cx="${x}" cy="${y}" r="11"/><path ${tl(P.mustardDeep, 'stroke-width:2.5')} d="M${x - 4} ${y} L${x + 4} ${y}"/>`).join('')}
    <path fill="${P.teal}" class="thin" d="M16 -80 L30 -80 L36 -72 L23 -58 L10 -72Z"/><path fill="${P.berry}" class="thin" d="M-34 -78 L-24 -78 L-18 -70 L-29 -60 L-40 -70Z"/>`;
  return `<path fill="${P.woodDark}" d="M-50 -46 L-50 -96 Q-50 -120 -30 -126 L30 -126 Q50 -120 50 -96 L50 -46Z"/>${R(-40, -124, 10, 70, P.mustard, ' class="thin"')}${R(30, -124, 10, 70, P.mustard, ' class="thin"')}${loot}${base}
  ${[[-44, -104], [42, -96], [0, -114]].map(([x, y]) => `<path class="n" fill="#fff" d="${star(x, y, 8, 3, 4)}"/>`).join('')}`;
}
const fossil = () => `<ellipse fill="${P.warmGrey}" cx="0" cy="-36" rx="50" ry="36"/><path class="n" fill="${P.warmGreyDeep}" d="M-40 -14 Q0 0 40 -14 Q20 -6 0 -6 Q-20 -6 -40 -14Z"/>
  <path fill="${P.oat}" d="M24 -38 A24 24 0 1 0 0 -14 A18 18 0 1 0 18 -32 A12 12 0 1 0 6 -20 A6 6 0 1 0 12 -26"/>
  <path ${tl(P.warmGreyDeep, 'stroke-width:3')} d="M0 -62 L0 -52 M14 -58 L10 -50 M-14 -58 L-10 -50 M-24 -46 L-16 -42 M24 -46 L18 -42"/>`;
const duck = () => `<path fill="${P.lemon}" d="M-40 -30 Q-46 -2 -10 0 L24 0 Q46 -4 42 -28 Q38 -40 24 -36 Q18 -44 4 -42 Q-30 -46 -40 -30Z"/>
  <circle fill="${P.lemon}" cx="-18" cy="-58" r="24"/><path fill="${HAZ}" d="M-40 -56 Q-56 -58 -58 -50 Q-54 -44 -40 -48Z"/><circle class="ink" cx="-24" cy="-62" r="3.5"/>
  <path class="d" d="M6 -24 Q16 -14 28 -24"/><path class="n" fill="${P.blush}" d="M-16 -50 a5 3.5 0 1 0 0.1 0Z" opacity=".7"/>`;
const robot = () => `${R(-26, -18, 18, 18, P.steelDeep, ' rx="4"')}${R(8, -18, 18, 18, P.steelDeep, ' rx="4"')}
  ${R(-34, -66, 68, 50, P.blue, ' rx="10"')}${R(-18, -56, 36, 22, P.sky, ' class="thin" rx="5"')}<circle fill="${P.berry}" class="thin" cx="-8" cy="-45" r="4"/><circle fill="${P.leafLight}" class="thin" cx="8" cy="-45" r="4"/>
  ${R(-46, -60, 12, 30, P.blueDeep, ' rx="6"')}${R(34, -60, 12, 30, P.blueDeep, ' rx="6"')}
  ${R(-28, -112, 56, 44, P.steel, ' rx="12"')}<circle fill="#fff" cx="-12" cy="-92" r="9"/><circle fill="#fff" cx="12" cy="-92" r="9"/><circle class="ink" cx="-11" cy="-91" r="4"/><circle class="ink" cx="13" cy="-91" r="4"/>
  <path class="d" d="M-8 -78 Q0 -72 8 -78"/><path class="d" d="M0 -112 L0 -126"/><circle fill="${P.berry}" cx="0" cy="-130" r="7"/>`;
const gem = () => `<path fill="${P.teal}" d="M-30 -40 L-16 -58 L16 -58 L30 -40 L0 0Z"/><path fill="${P.mint}" d="M-30 -40 L30 -40 L16 -58 L-16 -58Z"/><path class="d" d="M-16 -58 L-8 -40 L0 0 M16 -58 L8 -40 L0 0 M-8 -40 L0 -58 L8 -40"/>${glint('M-18 -48 L-12 -54', 3.5)}`;

// ---------------------------------------------------------------------------
const bp = (label, variants, s, paint, extra = {}) => ({ label, tags: ['buildpiece', 'construction', 'paintable'], variants, snap: s, paint, grip: [0, -20], ...extra });
const tool = (label, variants, tags, extra = {}) => ({ label, tags: ['construction', 'tool', ...tags], variants, ...extra });

export const SITE_PROPS = {
  // ---- building pieces ----
  'block-1x1': bp('small block', { ...paintSet((c) => block(1, 1, c, 'dot')), rainbow: rainbowBlock(1, 1, 'dot') }, snap(1, 1), { ...paintMap(false), rainbow: 'rainbow' }, { tags: ['buildpiece', 'construction', 'paintable', 'brick'] }),
  'block-2x1': bp('brick', { ...paintSet((c) => block(2, 1, c, 'dots')), rainbow: rainbowBlock(2, 1, 'dot') }, snap(2, 1), { ...paintMap(false), rainbow: 'rainbow' }, { tags: ['buildpiece', 'construction', 'paintable', 'brick'] }),
  'block-2x2': bp('big block', { ...paintSet((c) => block(2, 2, c, 'star')), rainbow: rainbowBlock(2, 2, 'star') }, snap(2, 2), { ...paintMap(false), rainbow: 'rainbow' }, { tags: ['buildpiece', 'construction', 'paintable', 'brick'] }),
  plank: bp('plank', paintSet((c) => plank(c[0], c[1]), plank()), snap(4, .5), paintMap(true), { tags: ['buildpiece', 'construction', 'paintable', 'wood', 'sawable'], saw: ['plank-half', 'plank-half'] }),
  'plank-half': bp('short plank', paintSet((c) => halfPlank(c[0], c[1]), halfPlank()), snap(2, .5), paintMap(true), { tags: ['buildpiece', 'construction', 'paintable', 'wood'] }),
  beam: bp('steel beam', paintSet((c) => beam(c[0], c[1]), beam()), snap(6, .5), paintMap(true), { tags: ['buildpiece', 'construction', 'paintable', 'metal'] }),
  'roof-triangle': bp('roof', paintSet((c) => roofTri(c)), snap(4, 2, [[0, -80]]), paintMap(false), { tags: ['buildpiece', 'construction', 'paintable', 'roof'] }),
  'roof-flat': bp('flat roof', paintSet((c) => roofFlat(c), roofFlat([P.warmGrey, P.warmGreyDeep])), snap(4, .5), paintMap(true), { tags: ['buildpiece', 'construction', 'paintable', 'roof'] }),
  window: bp('window', paintSet((c) => windowCell(c), windowCell(NATURAL_WALL)), snap(1, 1), paintMap(true)),
  'round-window': bp('round window', paintSet((c) => windowCell(c, true), windowCell(NATURAL_WALL, true)), snap(1, 1), paintMap(true)),
  door: bp('door', {
    closed: doorCell(NATURAL_WALL, false), open: doorCell(NATURAL_WALL, true),
    ...Object.fromEntries(PN.flatMap((k) => [[`closed-${k}`, doorCell(NATURAL_WALL, false, PAINTS[k][0], PAINTS[k][1])], [`open-${k}`, doorCell(NATURAL_WALL, true, PAINTS[k][0], PAINTS[k][1])]])),
  }, snap(1, 2), Object.fromEntries(PN.map((k) => [k, `{state}-${k}`]).concat([['natural', '{state}']])), { taps: ['closed', 'open'], states: ['closed', 'open'] }),
  stairs: bp('stairs', paintSet((c) => stairs(c), stairs([P.woodLight, P.woodDeep, '#F3DABE'])), snap(2, 2, [[-20, -40], [20, -80]]), paintMap(true)),
  flag: bp('flag', paintSet((c) => flag(c)), snap(1, 2, []), paintMap(false), { tags: ['buildpiece', 'construction', 'paintable', 'topper'] }),
  chimney: bp('chimney', paintSet((c) => chimney(c), chimney(BRICK)), snap(1, 1), paintMap(true), { tags: ['buildpiece', 'construction', 'paintable', 'topper'] }),

  // ---- tools and gear ----
  hammer: tool('hammer', { default: hammer() }, ['hammer'], { grip: [-14, -40] }),
  wrench: tool('wrench', { default: wrench() }, ['wrench'], { grip: [0, -20] }),
  saw: tool('saw', { default: saw() }, ['saw'], { grip: [62, -28] }),
  drill: tool('drill', { off: drill(false), on: drill(true) }, ['drill'], { taps: ['off', 'on'], grip: [-10, -20] }),
  paintbrush: tool('paintbrush', { clean: brush(null), ...Object.fromEntries(PN.map((k) => [k, brush(PAINTS[k])])), rainbow: brush([RAINBOW[0], P.berry]) }, ['brush', 'paint'], { grip: [18, -90] }),
  'paint-can': tool('paint can', { ...Object.fromEntries(PN.map((k) => [k, paintCan(PAINTS[k])])), rainbow: paintCan(null, true) }, ['paint', 'container'], { grip: [0, -90] }),
  'traffic-cone': tool('traffic cone', { up: cone(false), down: cone(true) }, ['cone'], { taps: ['up', 'down'], grip: [0, -70] }),
  wheelbarrow: tool('wheelbarrow', { empty: wheelbarrow(false), dirt: wheelbarrow(true) }, ['container', 'vehicle'], { grip: [100, -64], surface: [-50, 40, -64] }),
  hose: tool('hose', { coiled: hose(false), spray: hose(true) }, ['water'], { taps: ['coiled', 'spray'], grip: [64, -50] }),
  blueprint: tool('blueprint', { rolled: blueprint('rolled'), house: blueprint('house'), tower: blueprint('tower'), bridge: blueprint('bridge') }, ['blueprint'], { taps: ['rolled', 'house', 'tower', 'bridge'], grip: [0, -20] }),
  lunchbox: tool('lunchbox', { closed: lunchbox(false), open: lunchbox(true) }, ['container', 'lunch'], { taps: ['closed', 'open'], grip: [0, -72] }),
  thermos: tool('thermos', { default: thermos() }, ['drink', 'lunch'], { grip: [0, -50] }),

  // ---- wearables (rig pieces: docs/rig.md 4) ----
  'hard-hat': { label: 'hard hat', tags: ['wear', 'wearable:hat', 'construction'], variants: { yellow: hardHat(P.mustard, P.mustardDeep, P.butter), orange: hardHat(HAZ, HAZD, '#F6C08E') },
    wear: { piece: 'hard-hat', slot: 'hat', colors: { yellow: { hat: P.mustard, 'hat-sh': P.mustardDeep, 'hat-2': P.butter }, orange: { hat: HAZ, 'hat-sh': HAZD, 'hat-2': '#F6C08E' } } } },
  'safety-vest': { label: 'safety vest', tags: ['wear', 'wearable:over', 'construction'], variants: { default: vest() }, wear: { piece: 'safety-vest', slot: 'over' } },
  'tool-belt': { label: 'tool belt', tags: ['wear', 'wearable:over', 'construction'], variants: { default: toolBelt() }, wear: { piece: 'tool-belt', slot: 'over', pending: true } },
  gloves: { label: 'work gloves', tags: ['wear', 'wearable:hands', 'construction'], variants: { default: gloves() }, wear: { piece: 'gloves', slot: 'hands', pending: true } },
  'hero-cape': { label: 'hero cape', tags: ['wear', 'wearable:back', 'hero'], variants: Object.fromEntries(Object.entries(HERO).map(([k, c]) => [k, cape(c)])),
    wear: { piece: 'hero-cape', slot: 'back', colors: Object.fromEntries(Object.entries(HERO).map(([k, c]) => [k, { back: c[0], 'back-sh': c[1], 'back-2': c[2] }])) } },
  'hero-mask': { label: 'hero mask', tags: ['wear', 'wearable:face', 'hero'], variants: Object.fromEntries(Object.entries(HERO).map(([k, c]) => [k, mask(c)])),
    wear: { piece: 'hero-mask', slot: 'face', colors: Object.fromEntries(Object.entries(HERO).map(([k, c]) => [k, { face: c[0], 'face-sh': c[1] }])) } },
  'hero-suit': { label: 'hero suit', tags: ['wear', 'wearable:top', 'hero'], variants: { default: heroSuit() },
    wear: { piece: 'hero-suit', slot: 'top', pending: true, colors: { default: { top: P.teal, 'top-sh': P.tealDeep, 'top-2': HAZ } },
      design: 'teal long-sleeve top; orange sleeves and side panels; an orange disc with a butter star on the chest; tealDeep swirl tone lines' } },

  // ---- treasures ----
  'dino-bone': { label: 'dinosaur bone', tags: ['treasure', 'construction'], variants: { default: dinoBone() } },
  'treasure-chest': { label: 'treasure chest', tags: ['treasure', 'container', 'construction'], variants: { closed: chest(false), open: chest(true) }, taps: ['closed', 'open'], grip: [0, -60] },
  fossil: { label: 'fossil', tags: ['treasure', 'construction'], variants: { default: fossil() } },
  'rubber-duck': { label: 'rubber duck', tags: ['treasure', 'toy', 'construction'], variants: { default: duck() } },
  'toy-robot': { label: 'lost toy robot', tags: ['treasure', 'toy', 'construction'], variants: { default: robot() }, grip: [0, -60] },
  gem: { label: 'gem', tags: ['treasure', 'construction'], variants: { default: gem() } },
};
function halfPlank(c = P.woodLight, d = P.wood) {
  const [x, y, W, H] = cellBox(2, .5);
  return `<path fill="${c}" d="${rrect(x, y, W, H, 5)}"/><path ${tl(d, 'stroke-width:4')} d="M${f(x + 20)} ${f(y + 8)} Q${f(x + 50)} ${f(y + 3)} ${f(x + 80)} ${f(y + 8)}"/><circle class="thin" fill="${P.steelDeep}" cx="${f(x + 12)}" cy="${f(y + H / 2)}" r="3.5"/><circle class="thin" fill="${P.steelDeep}" cx="${f(x + W - 12)}" cy="${f(y + H / 2)}" r="3.5"/>`;
}

export const TREASURES = ['dino-bone', 'treasure-chest', 'fossil', 'rubber-duck', 'toy-robot', 'gem'];
export const BUILD_PIECES = Object.keys(SITE_PROPS).filter((k) => SITE_PROPS[k].snap);

// Copied into the manifest as `site`.
export const SITE_META = {
  paints: { ...Object.fromEntries(Object.entries(PAINTS).map(([k, v]) => [k, v[0]])), rainbow: 'stripes' },
  paintNote: 'A piece\'s `paint` maps a paint colour to its variant ("{state}" = the piece\'s current state, e.g. the door\'s closed/open). Pieces without that colour keep their look. Rainbow paints stripes on blocks only.',
  buildPieces: BUILD_PIECES,
  treasures: TREASURES,
  hero: Object.fromEntries(Object.entries(HERO).map(([k, v]) => [k, v[0]])),
  blueprints: ['house', 'tower', 'bridge'],
};
