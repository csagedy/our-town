// Hair styles (docs/STYLE.md "Hair"): one bold front shape plus an optional
// back shape, 2-4 detail curls, never strands. Authored around a head of
// rx 80 x ry 78 centred at the origin, and scaled to each body's head.
// back.kind: 'top' (a puff or bun above the head: hats hide it) or
// 'hang' (hair hanging behind the head and shoulders: drawn behind the body).
import { scallop } from '../ink.mjs';

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
};

// Facial hair sits on the face, in hair colour, after the mouth.
export const FACIAL_HAIR = {
  none: '',
  mustache: (m) => `<path class="hair" d="M0 ${m.my - 8} C-8 ${m.my - 14} -22 ${m.my - 12} -26 ${m.my - 2} C-18 ${m.my - 4} -8 ${m.my - 2} 0 ${m.my - 5} C8 ${m.my - 2} 18 ${m.my - 4} 26 ${m.my - 2} C22 ${m.my - 12} 8 ${m.my - 14} 0 ${m.my - 8}Z"/>`,
};
