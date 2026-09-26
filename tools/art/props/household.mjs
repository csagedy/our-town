// Kitchen and household props from style v2 (art-bakeoff/style-v2/build.mjs).
// Origin = bottom centre, the point where the prop rests on a shelf, unless
// noted (hanging utensils hang from their hook at the origin). Art units.
import { P } from '../palette.mjs';
import { f, at, tl, scallop, heart, leaf } from '../ink.mjs';

export const mug = (c = P.teal, deco = '') => `<g>
  <path fill="${c}" d="M18 -40 Q36 -40 35 -26 Q34 -12 17 -14 L17 -21 Q27 -21 27 -27 Q27 -33 18 -33Z"/>
  <path fill="${c}" d="M-22 -50 L22 -50 L20 -8 Q19 0 11 0 L-11 0 Q-19 0 -20 -8Z"/>${deco}
  <ellipse fill="${P.choc}" class="thin" cx="0" cy="-50" rx="21" ry="4.5"/></g>`;
export const cup = (c = P.cream) => `<g><path fill="${c}" d="M13 -22 Q24 -22 23 -14 Q22 -6 12 -8Z"/><path fill="${c}" d="M-16 -26 L16 -26 L13 -6 Q12 0 6 0 L-6 0 Q-12 0 -13 -6Z"/><ellipse fill="${c}" class="thin" cx="0" cy="0" rx="24" ry="4"/></g>`;
export const jar = (w, h, fillc, lid, level = .6, bits = null, label = false) => {
  const x = -w / 2, top = -h * level;
  let b = '';
  if (bits) for (let i = 0; i < 7; i++) b += `<circle class="n" fill="${bits}" cx="${f(x + 10 + ((i * 37) % (w - 18)))}" cy="${f(top + 8 + ((i * 23) % Math.max(8, h * level - 18)))}" r="3"/>`;
  return `<g>
  <rect x="${x}" y="${-h}" width="${w}" height="${h}" rx="${Math.min(12, w / 4)}" fill="${P.glass}"/>
  <path class="thin" fill="${fillc}" d="M${x + 5} ${f(top)} L${-x - 5} ${f(top)} L${-x - 5} -9 Q${-x - 5} -5 ${-x - 9} -5 L${x + 9} -5 Q${x + 5} -5 ${x + 5} -9Z"/>${b}
  ${label ? `<rect class="thin" fill="${P.cream}" x="${x + 8}" y="${f(-h * .5)}" width="${w - 16}" height="${f(h * .22)}" rx="4"/>` : ''}
  <rect x="${x + 3}" y="${-h - 13}" width="${w - 6}" height="15" rx="5" fill="${lid}"/>
  <path ${tl(P.white, `stroke:#fff;stroke-width:4`)} d="M${x + 9} ${-h + 12} L${x + 9} ${-h + 26}"/></g>`;
};
export const bottle = (c = P.leafDeep, h = 110, label = P.cream) => `<g>
  <path fill="${c}" d="M-18 0 Q-24 0 -24 -8 L-24 ${-h + 46} Q-24 ${-h + 30} -9 ${-h + 24} L-9 ${-h + 6} L9 ${-h + 6} L9 ${-h + 24} Q24 ${-h + 30} 24 ${-h + 46} L24 -8 Q24 0 18 0Z"/>
  <rect fill="${P.woodDeep}" x="-10" y="${-h - 4}" width="20" height="14" rx="4"/>
  <rect class="thin" fill="${label}" x="-18" y="${f(-h * .5)}" width="36" height="${f(h * .26)}" rx="4"/>
  <path ${tl(P.white)} d="M-15 ${-h + 50} L-15 ${-h + 64}"/></g>`;
export const pot = (c = P.terra, w = 56, h = 46) => `<g><path fill="${c}" d="M${-w / 2 + 6} ${-h + 8} L${w / 2 - 6} ${-h + 8} L${w / 2 - 12} -4 Q${w / 2 - 13} 0 ${w / 2 - 17} 0 L${-w / 2 + 17} 0 Q${-w / 2 + 13} 0 ${-w / 2 + 12} -4Z"/><rect fill="${c}" x="${-w / 2}" y="${-h}" width="${w}" height="16" rx="5"/></g>`;
export const plantLeafy = (potc = P.terra, s = 1, dark = false) => at(0, 0, s, `
  ${[-62, -38, -14, 12, 36, 60].map((a, i) => leaf(52 + (i % 2) * 14, 16, a, i % 2 ? P.leaf : P.leafDeep, 0, -40)).join('')}
  ${leaf(62, 17, -4, dark ? P.leafDeep : P.leafLight, 0, -40)}${pot(potc)}`);
export const succulent = (potc = P.cream) => `<g>${[-50, -25, 0, 25, 50].map((a, i) => `<g transform="translate(0 -34) rotate(${a})"><path fill="${i % 2 ? P.sage : P.sageDeep}" d="M0 0 C12 -10 10 -30 0 -40 C-10 -30 -12 -10 0 0Z"/></g>`).join('')}
  <path fill="${potc}" d="M-38 -38 L38 -38 Q36 0 0 0 Q-36 0 -38 -38Z"/></g>`;
export const snake = (potc = P.oat) => `<g>${[[-18, -8, 80], [-6, -2, 104], [8, 6, 92], [20, 12, 70]].map(([x, a, l], i) => `<g transform="translate(${x} -40) rotate(${a})"><path fill="${i % 2 ? P.leaf : P.leafDeep}" d="M-8 0 C-10 ${-l * .5} -6 ${-l * .8} 0 ${-l} C6 ${-l * .8} 10 ${-l * .5} 8 0Z"/><path ${tl(P.leafLight)} d="M-4 ${-l * .3} L4 ${-l * .36} M-4 ${-l * .55} L4 ${-l * .6}"/></g>`).join('')}${pot(potc, 58, 44)}</g>`;
export const trailing = (len, sway = 16, n = 5) => {
  let s = `<path class="d" d="M0 0 Q${sway} ${len / 2} 0 ${len}"/>`;
  for (let i = 0; i < n; i++) {
    const t = (i + .6) / n, y = len * t, x = sway * 2 * t * (1 - t) * 1.4, side = i % 2 ? 1 : -1;
    s += leaf(24, 10, 180 + side * 50, i % 2 ? P.leaf : P.leafDeep, x, y);
  }
  return s;
};
export const hangingPlant = (ropeLen, potc = P.cream) => `<g>
  <path class="d" d="M0 ${-ropeLen} L-26 -30 M0 ${-ropeLen} L26 -30"/>
  ${at(-24, -14, 1, trailing(150, -14, 6))}${at(22, -14, 1, trailing(190, 16, 7))}${at(0, -10, 1, trailing(110, 8, 4))}
  ${[-60, -30, 0, 30, 60].map((a, i) => leaf(34, 12, a, i % 2 ? P.leaf : P.leafDeep, 0, -30)).join('')}
  <path fill="${potc}" d="M-32 -34 L32 -34 Q30 6 0 6 Q-30 6 -32 -34Z"/><path ${tl(P.warmGrey)} d="M-28 -20 L28 -20"/></g>`;
export const books = (list) => { let x = 0, s = ''; for (const [w, h, c] of list) { s += `<rect fill="${c}" x="${x}" y="${-h}" width="${w}" height="${h}" rx="3"/><path ${tl(P.cream)} d="M${x + 4} ${-h + 12} L${x + w - 4} ${-h + 12}"/>`; x += w; } return `<g transform="translate(${-x / 2} 0)">${s}</g>`; };
export const bookStack = (list) => { let y = 0, s = ''; for (const [w, h, c] of list) { s += `<rect fill="${c}" x="${-w / 2}" y="${y - h}" width="${w}" height="${h}" rx="3"/><path ${tl(P.cream)} d="M${-w / 2 + 8} ${y - h / 2} L${w / 2 - 8} ${y - h / 2}"/>`; y -= h; } return s; };
export const plates = (n = 5, w = 96, c = P.cream) => { let s = ''; for (let i = 0; i < n; i++) s += `<rect fill="${c}" x="${-w / 2}" y="${-(i + 1) * 9}" width="${w}" height="10" rx="5"/>`; return s; };
export const bowlStack = () => `<path fill="${P.teal}" d="M-44 -54 L44 -54 Q40 -34 0 -32 Q-40 -34 -44 -54Z"/><path fill="${P.rose}" d="M-48 -34 L48 -34 Q44 -12 0 -10 Q-44 -12 -48 -34Z"/><path fill="${P.cream}" d="M-50 -14 L50 -14 Q46 0 0 0 Q-46 0 -50 -14Z"/>`;
export const teapot = (c = P.teal, dots = P.cream) => `<g>
  <path fill="${c}" d="M-36 -32 Q-58 -38 -62 -60 L-53 -62 Q-48 -46 -32 -44Z"/>
  <path fill="${c}" d="M34 -60 Q60 -60 58 -36 Q56 -16 36 -18 L36 -26 Q48 -26 49 -37 Q50 -52 34 -52Z"/>
  <path fill="${c}" d="M-40 -8 Q-50 -40 -30 -64 L30 -64 Q50 -40 40 -8 Q38 0 30 0 L-30 0 Q-38 0 -40 -8Z"/>
  <path fill="${c}" d="M-26 -64 Q0 -84 26 -64Z"/><circle fill="${c}" cx="0" cy="-84" r="7"/>
  <g class="n" fill="${dots}"><circle cx="-20" cy="-40" r="5"/><circle cx="4" cy="-28" r="5"/><circle cx="22" cy="-46" r="5"/><circle cx="-8" cy="-52" r="4"/><circle cx="24" cy="-18" r="4"/><circle cx="-24" cy="-16" r="4"/></g></g>`;
export const croissant = (s = 1) => at(0, 0, s, `<path fill="${P.crust}" d="M-52 -8 Q-60 -30 -34 -38 Q0 -52 34 -38 Q60 -30 52 -8 Q42 -12 36 -16 Q20 -4 0 -6 Q-20 -4 -36 -16 Q-42 -12 -52 -8Z"/>
  <path class="d" d="M-24 -42 Q-18 -26 -26 -12 M-4 -46 Q2 -26 -4 -6 M18 -44 Q24 -26 18 -8"/><path class="n" fill="#F2C88A" d="M-12 -40 Q0 -44 10 -40 Q0 -38 -12 -40Z"/>`);
export const cupcake = (s = 1, frost = P.rose) => at(0, 0, s, `
  <path fill="${frost}" d="M-30 -40 Q-38 -58 -18 -62 Q-16 -82 4 -78 Q24 -84 22 -62 Q40 -58 30 -40Z"/>
  <path class="d" d="M-16 -56 Q0 -48 14 -58"/>
  <path fill="${P.teal}" d="M-26 -40 L26 -40 L20 0 L-20 0Z"/><path ${tl(P.tealDeep)} d="M-12 -38 L-10 -2 M0 -38 L0 -2 M12 -38 L10 -2"/>
  <path class="d" d="M3 -84 Q6 -96 14 -100"/><circle fill="${P.berry}" cx="2" cy="-86" r="9"/>
  <g class="n"><rect fill="${P.butter}" x="-18" y="-52" width="7" height="3" rx="1.5" transform="rotate(30 -15 -50)"/><rect fill="${P.teal}" x="10" y="-66" width="7" height="3" rx="1.5" transform="rotate(-20 13 -64)"/><rect fill="${P.cream}" x="-4" y="-70" width="7" height="3" rx="1.5"/></g>`);
export const cakeStand = (inner, w = 150, c = P.cream) => `<g><path fill="${c}" d="M-18 0 L18 0 L10 -8 L-10 -8Z"/><rect fill="${c}" x="-7" y="-30" width="14" height="24"/><rect fill="${c}" x="${-w / 2}" y="-40" width="${w}" height="12" rx="6"/>${at(0, -40, 1, inner)}</g>`;
export const layerCake = (s = 1) => at(0, 0, s, `
  <rect fill="${P.peach}" x="-60" y="-96" width="120" height="96" rx="8"/>
  <path ${tl(P.cream, `stroke:${P.cream};stroke-width:6`)} d="M-58 -48 L58 -48"/>
  <path fill="${P.blush}" d="M-64 -100 Q-64 -110 -54 -110 L54 -110 Q64 -110 64 -100 L64 -84 Q58 -72 52 -84 Q46 -68 38 -84 Q30 -76 22 -86 L10 -86 Q2 -66 -8 -86 Q-16 -76 -26 -86 Q-36 -70 -44 -86 Q-54 -74 -64 -86Z"/>
  ${[-36, 0, 34].map((x) => `<path fill="${P.berry}" d="M${x} -106 Q${x - 12} -114 ${x - 10} -124 Q${x} -130 ${x + 10} -124 Q${x + 12} -114 ${x} -106Z"/><path class="n" fill="${P.leaf}" d="M${x - 7} -124 L${x} -120 L${x + 7} -124 L${x} -129Z"/>`).join('')}`);
export const cakeSlice = () => `<path fill="${P.choc}" d="M-40 0 L40 0 L40 -40 L-40 -24Z"/><path fill="${P.cream}" d="M-40 -24 L40 -40 L40 -50 L-40 -30Z"/><path ${tl(P.cream, `stroke:${P.cream};stroke-width:5`)} d="M-38 -10 L38 -18"/><circle fill="${P.berry}" cx="20" cy="-52" r="8"/>`;
export const panWithEgg = () => `<g>
  <rect fill="${P.woodDark}" x="-12" y="-8" width="84" height="16" rx="8"/><rect fill="${P.steelDeep}" x="68" y="-6" width="26" height="12" rx="4"/>
  <ellipse fill="${P.char}" cx="160" cy="2" rx="72" ry="28"/><ellipse fill="${P.charDeep}" class="thin" cx="160" cy="-2" rx="60" ry="20"/>
  <path fill="${P.egg}" class="thin" d="M126 -4 Q124 -16 144 -16 Q156 -24 172 -16 Q192 -14 188 -2 Q190 10 170 8 Q150 14 136 8 Q122 6 126 -4Z"/>
  <ellipse fill="${P.mustard}" class="thin" cx="158" cy="-5" rx="12" ry="9"/><path class="n" fill="#fff" d="M152 -9 Q156 -12 160 -10 Q156 -8 152 -9Z"/></g>`;
export const soupPot = (c = P.teal) => `<g>
  <rect fill="${c}" x="-66" y="-58" width="16" height="12" rx="5"/><rect fill="${c}" x="50" y="-58" width="16" height="12" rx="5"/>
  <path fill="${c}" d="M-54 -66 L54 -66 L50 -6 Q49 0 42 0 L-42 0 Q-49 0 -50 -6Z"/>
  <path fill="${P.steel}" d="M-58 -64 Q0 -92 58 -64Z"/><circle fill="${P.charDeep}" cx="0" cy="-86" r="8"/>
  <path ${tl(P.cream)} d="M-50 -24 L50 -24"/></g>`;
export const kettle = (c = P.cream) => `<g>
  <path class="d" style="stroke-width:5" d="M-26 -60 Q0 -96 26 -60"/>
  <path fill="${c}" d="M30 -40 L58 -60 L62 -54 L40 -30Z"/>
  <path fill="${c}" d="M-44 -6 Q-50 -54 0 -60 Q50 -54 44 -6 Q42 0 34 0 L-34 0 Q-42 0 -44 -6Z"/>
  <path fill="${P.blueDeep}" class="thin" d="M-30 -34 Q-18 -44 -8 -34 Q-18 -24 -30 -34Z M8 -34 Q18 -44 30 -34 Q18 -24 8 -34Z"/><circle fill="${P.blueDeep}" class="thin" cx="0" cy="-20" r="6"/>
  <rect fill="${P.charDeep}" x="-10" y="-66" width="20" height="8" rx="4"/></g>`;
export const espresso = () => `<g>
  ${at(-26, -164, .6, cup(P.cream))}${at(20, -164, .6, cup(P.rose))}
  <rect fill="${P.steel}" x="-70" y="-166" width="140" height="14" rx="6"/>
  <rect fill="${P.rose}" x="-64" y="-154" width="128" height="146" rx="16"/>
  <circle fill="${P.cream}" cx="-30" cy="-118" r="16"/><path class="d" d="M-30 -118 L-22 -126"/>
  <circle fill="${P.charDeep}" cx="16" cy="-124" r="7"/><circle fill="${P.charDeep}" cx="38" cy="-124" r="7"/>
  <rect fill="${P.steel}" x="-20" y="-86" width="40" height="16" rx="5"/><rect fill="${P.charDeep}" x="20" y="-82" width="46" height="10" rx="5"/>
  <rect fill="${P.steel}" x="-54" y="-18" width="108" height="18" rx="6"/>
  ${at(0, -18, .8, cup(P.cream))}
  <path ${tl(P.white, `stroke:#fff;stroke-width:4;opacity:.8`)} d="M-52 -140 L-52 -104"/></g>`;
export const toaster = () => `<g>
  <rect fill="${P.toast}" x="-38" y="-94" width="30" height="36" rx="6"/><rect fill="${P.toast}" x="6" y="-90" width="30" height="32" rx="6"/>
  <rect fill="${P.mint}" x="-56" y="-72" width="112" height="72" rx="24"/><rect fill="${P.charDeep}" x="56" y="-52" width="14" height="10" rx="4"/>
  <circle fill="${P.cream}" cx="-30" cy="-30" r="8"/><path ${tl(P.white)} d="M-44 -58 L-20 -58"/></g>`;
export const fruitBowl = (c = P.terra) => `<g>
  <ellipse fill="${P.lemon}" cx="-26" cy="-42" rx="22" ry="17"/><ellipse fill="${P.lemon}" cx="22" cy="-44" rx="22" ry="17"/>
  <circle fill="${P.berry}" cx="-2" cy="-56" r="18"/><path class="d" d="M-2 -74 Q0 -82 6 -84"/>
  <path fill="${c}" d="M-60 -40 L60 -40 Q56 0 0 0 Q-56 0 -60 -40Z"/>
  <g class="n" fill="${P.cream}"><circle cx="-34" cy="-22" r="4"/><circle cx="0" cy="-16" r="4"/><circle cx="34" cy="-22" r="4"/></g></g>`;
export const basket = (inner = '', w = 110, h = 60) => `<g>${inner}
  <path class="d" style="stroke-width:5" d="M${-w / 3} ${-h} Q0 ${-h - 50} ${w / 3} ${-h}"/>
  <path fill="${P.wood}" d="M${-w / 2} ${-h} L${w / 2} ${-h} L${w / 2 - 8} -4 Q${w / 2 - 9} 0 ${w / 2 - 14} 0 L${-w / 2 + 14} 0 Q${-w / 2 + 9} 0 ${-w / 2 + 8} -4Z"/>
  <path ${tl(P.woodDeep)} d="M${-w / 2 + 4} ${-h * .66} L${w / 2 - 4} ${-h * .66} M${-w / 2 + 6} ${-h * .33} L${w / 2 - 6} ${-h * .33}"/>
  <rect fill="${P.woodLight}" x="${-w / 2 - 4}" y="${-h - 8}" width="${w + 8}" height="12" rx="6"/></g>`;
export const bread = () => `<path fill="${P.crust}" d="M-50 0 Q-60 -44 -20 -50 Q0 -54 20 -50 Q60 -44 50 0Z"/><path class="d" d="M-26 -40 L-16 -18 M-2 -44 L8 -20 M22 -40 L30 -18"/>`;
export const eggCarton = () => `<g>${[-36, -12, 12, 36].map((x, i) => `<ellipse fill="${i % 2 ? P.egg : '#F2DCC4'}" cx="${x}" cy="-30" rx="11" ry="14"/>`).join('')}<path fill="${P.warmGrey}" d="M-52 -26 L52 -26 L48 0 L-48 0Z"/><path ${tl(P.warmGreyDeep)} d="M-24 -22 L-24 -4 M0 -22 L0 -4 M24 -22 L24 -4"/></g>`;
export const lantern = () => `<g>
  <path class="d" style="stroke-width:4" d="M-12 -104 Q0 -124 12 -104"/>
  <path fill="${P.woodDark}" d="M-20 -104 L20 -104 L26 -88 L-26 -88Z"/>
  <rect fill="${P.butter}" x="-20" y="-88" width="40" height="72" rx="6"/><path ${tl(P.woodDark)} d="M-6 -86 L-6 -18 M6 -86 L6 -18"/>
  <ellipse class="n" fill="#fff" opacity=".7" cx="0" cy="-54" rx="7" ry="12"/>
  <rect fill="${P.woodDark}" x="-26" y="-16" width="52" height="16" rx="5"/></g>`;
export const canister = (c, icon, w = 54, h = 70) => `<g><rect fill="${c}" x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="8"/><rect fill="${c}" x="${-w / 2 - 3}" y="${-h - 12}" width="${w + 6}" height="14" rx="6"/><circle fill="${P.woodDeep}" cx="0" cy="${-h - 18}" r="6"/>${at(0, -h / 2 + 4, 1, icon)}</g>`;
export const beanIcon = `<ellipse class="thin" fill="${P.choc}" cx="0" cy="0" rx="9" ry="12" transform="rotate(20)"/><path class="d" d="M-2 -10 Q4 0 -2 10" transform="rotate(20)"/>`;
export const leafIcon = `<g transform="translate(0 10)">${leaf(22, 9, 0, P.leaf)}</g>`;
export const flourSack = () => `<g><path fill="${P.oat}" d="M-40 0 Q-50 -54 -32 -86 L-22 -96 L22 -96 L32 -86 Q50 -54 40 0Z"/><path fill="${P.woodDeep}" d="M-26 -86 L26 -86 L26 -76 L-26 -76Z"/>
  <path fill="${P.oat}" d="M-18 -96 L-26 -110 L-10 -104 L0 -114 L10 -104 L26 -110 L18 -96Z"/>${leaf(26, 7, -20, P.mustard, -4, -24)}${leaf(26, 7, 20, P.mustard, 4, -24)}<path class="d" d="M0 -20 L0 -54"/></g>`;
export const wateringCan = () => `<g><path fill="${P.mustard}" d="M30 -44 L78 -80 L84 -72 L40 -30Z"/><path class="d" style="stroke-width:6" d="M-40 -66 Q-66 -60 -44 -24"/><path fill="${P.mustard}" d="M-40 0 L-44 -70 L40 -70 L36 0Z"/><rect fill="${P.mustardDeep}" x="-46" y="-78" width="92" height="12" rx="6"/></g>`;
export const catLoaf = () => `<g>
  <path fill="${P.peach}" d="M-66 0 Q-72 -48 -30 -58 Q10 -66 44 -54 Q72 -40 66 0Z"/>
  <path ${tl(P.terra)} d="M0 -58 Q6 -44 0 -32 M22 -56 Q28 -42 22 -30 M42 -50 Q48 -38 42 -28"/>
  <path fill="${P.peach}" d="M-66 -54 L-60 -86 L-42 -66Z"/><path fill="${P.peach}" d="M-20 -66 L-18 -94 L-2 -70Z"/>
  <ellipse fill="${P.peach}" cx="-38" cy="-42" rx="36" ry="30"/>
  <path class="d" style="stroke-width:4" d="M-58 -42 Q-52 -36 -46 -42 M-32 -42 Q-26 -36 -20 -42"/><path class="n" fill="${P.roseDeep}" d="M-42 -32 L-36 -32 L-39 -28Z"/>
  <path fill="${P.peach}" d="M60 -6 Q30 8 -26 0 Q-36 -2 -34 -10 Q10 -4 56 -20Z"/></g>`;
export const pendant = (len, shade = P.sage) => `<g><path class="d" d="M0 0 L0 ${len}"/>
  <ellipse class="n" fill="#FFF6D8" opacity=".45" cx="0" cy="${len + 48}" rx="70" ry="60"/>
  <path fill="${shade}" d="M-54 ${len + 40} Q-50 ${len} 0 ${len - 4} Q50 ${len} 54 ${len + 40}Z"/><rect fill="${P.woodDark}" x="-9" y="${len - 12}" width="18" height="12" rx="3"/>
  <circle fill="#FFF3C9" cx="0" cy="${len + 46}" r="14"/></g>`;
export const bulb = (len) => `<g><path class="d" d="M0 0 L0 ${len}"/><ellipse class="n" fill="#FFF6D8" opacity=".5" cx="0" cy="${len + 30}" rx="54" ry="54"/><rect fill="${P.charDeep}" x="-9" y="${len}" width="18" height="16" rx="3"/><path fill="#FFF7E0" d="M-8 ${len + 16} L8 ${len + 16} L10 ${len + 22} Q26 ${len + 32} 24 ${len + 48} Q20 ${len + 66} 0 ${len + 66} Q-20 ${len + 66} -24 ${len + 48} Q-26 ${len + 32} -10 ${len + 22}Z"/><path class="d" style="stroke-width:2.5" d="M-4 ${len + 22} L-4 ${len + 40} Q0 ${len + 48} 4 ${len + 40} L4 ${len + 22}"/></g>`;
export const cuttingBoard = () => `<g><rect fill="${P.woodLight}" x="-8" y="-150" width="16" height="30" rx="8"/><circle fill="${P.woodLight}" cx="0" cy="-150" r="5" class="thin"/><rect fill="${P.woodLight}" x="-48" y="-128" width="96" height="128" rx="30"/><path ${tl(P.wood)} d="M-30 -100 Q-24 -60 -30 -24 M14 -110 Q20 -60 14 -18"/></g>`;
export const mixingBowl = () => `<g><path class="d" style="stroke-width:5" d="M6 -60 L40 -120"/><path fill="${P.steel}" class="thin" d="M40 -120 Q52 -148 60 -136 Q64 -122 40 -120Z"/><ellipse fill="${P.butter}" cx="0" cy="-62" rx="66" ry="12"/><path fill="${P.cream}" d="M-74 -62 L74 -62 Q66 0 0 0 Q-66 0 -74 -62Z"/><path ${tl(P.roseDeep, `stroke:${P.roseDeep};stroke-width:6`)} d="M-68 -40 Q0 -28 68 -40"/></g>`;
export const lemonade = () => `<g><rect fill="${P.glass}" x="-30" y="-110" width="60" height="110" rx="10"/><path fill="${P.lemon}" class="thin" d="M-25 -76 L25 -76 L25 -9 Q25 -5 21 -5 L-21 -5 Q-25 -5 -25 -9Z"/><circle class="thin" fill="${P.cream}" cx="-6" cy="-40" r="11"/><path fill="${P.teal}" d="M-32 -110 L32 -110 L28 -122 L-28 -122Z"/><path class="d" d="M8 -122 L20 -150"/></g>`;
export const vase = () => `<g>${[[-18, -110, P.rose], [14, -124, P.butter], [0, -140, P.blush]].map(([x, y, c]) => `<path class="d" d="M0 -40 Q${x / 2} ${(y - 40) / 2} ${x} ${y}"/><path fill="${c}" d="${scallop(x, y, 13, 13, 6, 6)}"/><circle fill="${P.mustard}" cx="${x}" cy="${y}" r="5" class="thin"/>`).join('')}${leaf(30, 9, -40, P.leaf, -2, -54)}${leaf(26, 8, 40, P.leafDeep, 2, -60)}
  <path fill="${P.blue}" d="M-14 -50 L14 -50 L12 -40 Q30 -30 26 -10 Q24 0 14 0 L-14 0 Q-24 0 -26 -10 Q-30 -30 -12 -40Z"/></g>`;
export const ladle = () => `<g><circle fill="${P.steel}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.steel}" x="-5" y="4" width="10" height="72" rx="5"/><path fill="${P.steel}" d="M-20 76 L20 76 Q20 100 0 100 Q-20 100 -20 76Z"/></g>`;
export const whisk = () => `<g><circle fill="${P.rose}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.rose}" x="-6" y="4" width="12" height="36" rx="6"/><path class="d" d="M-4 40 Q-22 80 0 96 Q22 80 4 40 M0 40 L0 96 M-2 40 Q-12 80 0 96 Q12 80 2 40"/></g>`;
export const spatula = () => `<g><circle fill="${P.woodDeep}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.woodDeep}" x="-5" y="4" width="10" height="54" rx="5"/><rect fill="${P.woodDeep}" x="-16" y="56" width="32" height="40" rx="6"/><path class="d" d="M-6 64 L-6 88 M6 64 L6 88"/></g>`;
export const smallPan = () => `<g><circle fill="${P.char}" class="thin" cx="0" cy="0" r="5"/><rect fill="${P.char}" x="-6" y="4" width="12" height="44" rx="6"/><circle fill="${P.char}" cx="0" cy="88" r="42"/><circle fill="${P.charHi}" class="thin" cx="0" cy="88" r="32"/></g>`;
export const stool = (c = P.oat) => `<g><path class="d" style="stroke-width:5" d="M-30 -60 L-40 0 M30 -60 L40 0 M-10 -60 L-12 -6 M10 -60 L12 -6"/>
  <rect fill="${P.wood}" x="-42" y="-8" width="10" height="8" rx="3"/><rect fill="${P.wood}" x="32" y="-8" width="10" height="8" rx="3"/>
  <path fill="${P.wood}" d="M-34 -64 L-46 -2 L-38 -2 L-26 -64Z"/><path fill="${P.wood}" d="M34 -64 L46 -2 L38 -2 L26 -64Z"/>
  <rect fill="${P.woodDeep}" x="-38" y="-34" width="76" height="8" rx="4"/>
  <rect fill="${c}" x="-50" y="-76" width="100" height="20" rx="10"/><ellipse fill="${c}" cx="0" cy="-76" rx="50" ry="10"/></g>`;
export const chairBack = (c = P.wood) => `<g><rect fill="${c}" x="-54" y="-150" width="12" height="150" rx="5"/><rect fill="${c}" x="42" y="-150" width="12" height="150" rx="5"/><path fill="${c}" d="M-54 -150 Q0 -174 54 -150 L54 -126 Q0 -148 -54 -126Z"/><rect fill="${c}" x="-44" y="-100" width="88" height="12" rx="5"/></g>`;
