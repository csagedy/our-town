// Hair styles (docs/STYLE.md "Hair"): one bold front shape plus an optional
// back shape, 2-4 detail curls, never strands. Authored around a head of
// rx 80 x ry 78 centred at the origin, and scaled to each body's head.
// back.kind: 'top' (a puff or bun above the head: hats hide it) or
// 'hang' (hair hanging behind the head and shoulders: drawn behind the body).
import { scallop, f } from '../ink.mjs';

export const HAIR_STYLES = {
  puff: {
    label: 'curly puff',
    back: { kind: 'top', svg: `<path class="hair" d="${scallop(0, -102, 60, 44, 12, 10)}"/>
      <path class="d" d="M-30 -118 Q-20 -128 -8 -122"/><path class="d" d="M14 -128 Q26 -130 34 -118"/><path class="d" d="M-6 -90 Q6 -98 16 -92"/>` },
    front: `<path class="hair" d="M-84 -4 C-92 -68 -51 -92 0 -92 C51 -92 92 -68 84 -4 C78 -28 70 -42 57 -49 C31 -58 -31 -58 -57 -49 C-70 -42 -78 -28 -84 -4Z"/>
      <path class="d" d="M-44 -80 Q-30 -72 -16 -78"/><path class="d" d="M30 -82 Q44 -78 52 -68"/>
      <path class="hair" d="${scallop(-78, -14, 12, 14, 6, 5)}"/><path class="hair" d="${scallop(78, -14, 12, 14, 6, 5)}"/>`,
  },
  tufts: {
    label: 'messy tufts',
    front: `<path class="hair" d="M-84 4 C-94 -60 -56 -94 0 -94 C56 -94 94 -60 84 4 C80 -18 74 -30 66 -38 L58 -24 L50 -46 C32 -40 22 -48 12 -58 L2 -40 L-10 -58 C-24 -46 -40 -44 -54 -48 L-62 -30 L-70 -40 C-78 -28 -82 -14 -84 4Z"/>
      <path class="hair" d="M-6 -92 C-14 -114 8 -124 18 -110 C8 -114 2 -106 4 -94Z"/>
      <path class="d" d="M-42 -78 Q-30 -72 -22 -78"/><path class="d" d="M28 -80 Q40 -76 48 -68"/>`,
  },
  short: {
    label: 'short side part',
    front: `<path class="hair" d="M-80 6 C-90 -64 -50 -96 4 -96 C56 -96 90 -64 80 6 C78 -16 74 -30 64 -40 C40 -44 18 -50 2 -66 C-10 -50 -34 -40 -64 -38 C-72 -28 -78 -12 -80 6Z"/>
      <path class="d" d="M2 -66 Q-2 -80 8 -92"/><path class="d" d="M26 -78 Q44 -76 58 -64"/>`,
  },
  bob: {
    label: 'long bob with bangs',
    back: { kind: 'hang', svg: `<path class="hair" d="M-94 -20 C-100 -90 -50 -100 0 -100 C50 -100 100 -90 94 -20 L98 74 Q98 92 80 92 L-80 92 Q-98 92 -98 74Z"/>` },
    front: `<path class="hair" d="M-90 40 C-100 -70 -50 -98 0 -98 C50 -98 100 -70 90 40 L90 70 Q86 78 78 72 L72 -8 C70 -28 64 -36 58 -40 L-58 -40 C-64 -36 -70 -28 -72 -8 L-78 72 Q-86 78 -90 70Z"/>
      <path class="d" d="M-30 -84 Q-20 -64 -24 -42"/><path class="d" d="M10 -88 Q18 -66 12 -42"/><path class="d" d="M42 -80 Q50 -62 44 -42"/>`,
  },
  pigtails: {
    label: 'pigtails',
    back: { kind: 'side', svg: [-1, 1].map((s) => `<path class="hair" d="${scallop(s * 104, 16, 26, 40, 9, 6)}"/><path class="d" d="M${s * 98} ${-2} Q${s * 110} 14 ${s * 102} 34"/>`).join('') },
    front: `<path class="hair" d="M-84 0 C-92 -66 -50 -94 0 -94 C50 -94 92 -66 84 0 C80 -24 72 -40 58 -48 C40 -54 18 -54 4 -66 C-10 -54 -34 -54 -58 -48 C-72 -40 -80 -24 -84 0Z"/>
      <path class="d" d="M4 -66 L2 -92"/><path class="d" d="M-44 -74 Q-30 -68 -18 -74"/><path class="d" d="M22 -76 Q36 -74 46 -66"/>
      ${[-1, 1].map((s) => `<circle class="thin" fill="#E9AFAE" cx="${s * 82}" cy="-18" r="9"/>`).join('')}`,
  },
  bald: {
    label: 'balding with side tufts',
    front: `${[-1, 1].map((s) => `<path class="hair" d="M${s * 60} -46 C${s * 82} -46 ${s * 90} -24 ${s * 86} 4 C${s * 80} -8 ${s * 74} -14 ${s * 66} -12 C${s * 70} -24 ${s * 66} -36 ${s * 60} -46Z"/>`).join('')}
      <path class="d" d="M-14 -76 Q-6 -92 8 -90 M6 -78 Q14 -94 26 -88"/>`,
  },
  bun: {
    label: 'curly bun',
    back: { kind: 'top', svg: `<path class="hair" d="${scallop(0, -118, 34, 30, 10, 7)}"/><path class="d" d="M-14 -126 Q-4 -132 6 -126"/>` },
    front: `<path class="hair" d="${scallop(0, -34, 88, 64, 20, 9, 186, 354, false)} C84 -20 80 -12 78 -2 C70 -30 50 -46 0 -48 C-50 -46 -70 -30 -78 -2 C-80 -12 -84 -20 -87.5 -40Z"/>
      <path class="d" d="M-40 -74 Q-30 -66 -18 -72"/><path class="d" d="M24 -76 Q36 -72 44 -62"/>`,
  },
  // ---- P1.15: more styles for the Character Maker ----
  coily: {
    label: 'coily afro',
    back: { kind: 'top', svg: `<path class="hair" d="${scallop(0, -34, 112, 98, 20, 11)}"/>
      <path class="d" d="M-70 -90 q8 -8 16 0"/><path class="d" d="M50 -104 q8 -8 16 0"/><path class="d" d="M-96 -20 q8 -8 16 0"/><path class="d" d="M84 -36 q8 -8 16 0"/>` },
    front: `<path class="hair" d="${scallop(0, -46, 86, 50, 16, 7, 170, 370, false)} Q34 -64 0 -58 Q-34 -64 -84.7 -37.3Z"/>
      <path class="d" d="M-30 -80 q8 -8 16 0"/><path class="d" d="M18 -86 q8 -8 16 0"/>`,
  },
  long: {
    label: 'long straight',
    back: { kind: 'hang', svg: `<path class="hair" d="M-96 -20 C-102 -92 -50 -102 0 -102 C50 -102 102 -92 96 -20 L102 150 Q102 170 82 170 L-82 170 Q-102 170 -102 150Z"/>
      <path class="d" d="M-80 60 L-82 150 M80 60 L82 150"/>` },
    front: `<path class="hair" d="M-88 60 C-100 -70 -50 -98 6 -98 C58 -98 98 -68 88 60 L86 96 Q80 104 74 96 L72 -6 C70 -30 60 -42 44 -46 C24 -50 12 -60 4 -72 C-8 -52 -40 -42 -62 -40 C-70 -30 -72 -16 -74 -4 L-76 96 Q-82 104 -88 96Z"/>
      <path class="d" d="M4 -72 Q0 -86 10 -94"/><path class="d" d="M30 -84 Q50 -80 62 -66"/>`,
  },
  braids: {
    label: 'two braids',
    back: { kind: 'side', svg: [-1, 1].map((s) => [0, 1, 2, 3, 4].map((i) => `<ellipse class="hair" cx="${s * (78 + i * 2)}" cy="${30 + i * 26}" rx="${17 - i}" ry="16"/>`).join('')
      + `<circle class="thin" fill="#E9AFAE" cx="${s * 87}" cy="146" r="9"/><path class="hair" d="${scallop(s * 87, 162, 10, 9, 6, 4)}"/>`).join('') },
    front: `<path class="hair" d="M-84 4 C-92 -66 -50 -94 0 -94 C50 -94 92 -66 84 4 C80 -22 72 -40 58 -48 C40 -54 16 -56 0 -70 C-16 -56 -40 -54 -58 -48 C-72 -40 -80 -22 -84 4Z"/>
      <path class="d" d="M0 -70 L0 -94"/><path class="d" d="M-44 -74 Q-30 -68 -18 -74"/><path class="d" d="M18 -74 Q30 -68 44 -74"/>`,
  },
  buzz: {
    label: 'buzz cut',
    front: `<path class="hair" d="M-80 -12 C-84 -66 -48 -88 0 -88 C48 -88 84 -66 80 -12 C76 -28 70 -38 62 -44 C36 -52 -36 -52 -62 -44 C-70 -38 -76 -28 -80 -12Z"/>
      <g class="n" style="fill:var(--hair-sh)"><circle cx="-30" cy="-70" r="3"/><circle cx="-6" cy="-76" r="3"/><circle cx="20" cy="-72" r="3"/><circle cx="44" cy="-64" r="3"/><circle cx="-50" cy="-58" r="3"/><circle cx="6" cy="-60" r="3"/></g>`,
  },
  curly: {
    label: 'curly to the shoulders',
    back: { kind: 'hang', svg: `<path class="hair" d="${scallop(0, 6, 106, 100, 18, 12)}"/>
      <path class="d" d="M-92 50 q10 -6 14 6"/><path class="d" d="M80 60 q10 -6 14 6"/><path class="d" d="M-80 90 q10 -6 14 6"/>` },
    front: `<path class="hair" d="${scallop(0, -40, 88, 54, 16, 8, 168, 372, false)} C70 -30 56 -52 30 -54 C12 -54 6 -48 0 -44 C-8 -52 -20 -56 -34 -54 C-58 -50 -76 -32 -86.1 -28.8Z"/>
      <path class="d" d="M-40 -82 q8 -8 16 0"/><path class="d" d="M20 -86 q8 -8 16 0"/>`,
  },
  ponytail: {
    label: 'high ponytail',
    back: { kind: 'top', svg: `<path class="hair" d="M40 -80 C80 -120 128 -96 120 -40 C116 -8 104 20 92 36 C98 8 96 -24 84 -44 C74 -58 60 -64 46 -62Z"/>
      <path class="d" d="M100 -70 Q112 -40 100 -6"/><circle class="thin" fill="#8CBDB8" cx="52" cy="-76" r="10"/>` },
    front: `<path class="hair" d="M-82 0 C-92 -66 -50 -96 2 -96 C54 -96 92 -66 82 0 C78 -24 70 -40 58 -48 C34 -58 -30 -60 -58 -48 C-70 -40 -78 -24 -82 0Z"/>
      <path class="d" d="M-40 -80 Q-10 -90 20 -86"/><path class="d" d="M-20 -66 Q14 -76 44 -66"/>`,
  },
};

/** Hair styles in the Character Maker's order. */
export const HAIR_ORDER = ['short', 'buzz', 'tufts', 'coily', 'puff', 'curly', 'bob', 'long', 'ponytail', 'pigtails', 'braids', 'bun', 'bald'];

// Facial hair sits on the face, in hair colour, after the mouth.
export const FACIAL_HAIR = {
  none: '',
  mustache: (m) => mustache(m),
  // A full beard: a crescent along the jaw, below the mouth, plus the mustache.
  beard: (m, h) => `<path class="hair" d="M${-h.rx + 8} 18 C${-h.rx + 8} ${f(h.ry * .8)} ${f(-h.rx * .45)} ${h.ry + 10} 0 ${h.ry + 12} C${f(h.rx * .45)} ${h.ry + 10} ${h.rx - 8} ${f(h.ry * .8)} ${h.rx - 8} 18 C${h.rx - 16} 30 ${m.ex + 14} ${m.my + 2} 14 ${m.my + 12} Q0 ${m.my + 20} -14 ${m.my + 12} C${-m.ex - 14} ${m.my + 2} ${-h.rx + 16} 30 ${-h.rx + 8} 18Z"/>`
    + `<path class="d" d="M-20 ${h.ry - 6} q6 6 12 0 M10 ${h.ry - 4} q6 6 12 0"/>` + mustache(m),
  goatee: (m) => `<path class="hair" d="M-13 ${m.my + 13} Q0 ${m.my + 9} 13 ${m.my + 13} Q12 ${m.my + 30} 0 ${m.my + 32} Q-12 ${m.my + 30} -13 ${m.my + 13}Z"/>` + mustache(m),
  stubble: (m, h) => `<g class="n" style="fill:var(--hair)" opacity=".55">${[[-.62, .35], [-.5, .6], [-.3, .78], [0, .86], [.3, .78], [.5, .6], [.62, .35], [-.18, .66], [.18, .66], [-.42, .45], [.42, .45]]
    .map(([x, y]) => `<circle cx="${f(x * h.rx)}" cy="${f(y * h.ry + 8)}" r="2.6"/>`).join('')}</g>`,
};
function mustache(m) {
  return `<path class="hair" d="M0 ${m.my - 8} C-8 ${m.my - 14} -22 ${m.my - 12} -26 ${m.my - 2} C-18 ${m.my - 4} -8 ${m.my - 2} 0 ${m.my - 5} C8 ${m.my - 2} 18 ${m.my - 4} 26 ${m.my - 2} C22 ${m.my - 12} 8 ${m.my - 14} 0 ${m.my - 8}Z"/>`;
}
export const FACIAL_ORDER = ['none', 'mustache', 'beard', 'goatee', 'stubble'];
