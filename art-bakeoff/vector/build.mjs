// Hand-authored vector art for the "our town" art bake-off (style B: flat vector).
// Every shape below is written by hand as SVG path data; this script only
// assembles the parts into files. Run:  node build.mjs
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SVG_DIR = path.join(HERE, 'svg');
fs.mkdirSync(SVG_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// PALETTE. One small shared palette. Every colour has a base, a shade and
// (sometimes) a highlight. Characters never hardcode colours: they use CSS
// classes that read custom properties, so one rig can be recoloured.
// ---------------------------------------------------------------------------
const C = {
  ink: '#2B2340', inkSoft: '#4A3F63', white: '#FFFFFF', cream: '#FFF6E8',
  blush: '#FF7E8A',
  wall: '#FDE6C8', wallSh: '#F6D2AA', wallDeep: '#EFC193',
  tile: '#C4EADF', tileSh: '#A9DDCF', tileHi: '#E3F6F0',
  teal: '#2FA59B', tealSh: '#228179', tealHi: '#5CC3B8',
  wood: '#E9A765', woodSh: '#C98547', woodHi: '#F7C58E',
  coral: '#F0604D', coralSh: '#C9473A', coralHi: '#F98A77',
  butter: '#FFD470', butterSh: '#F0B544', butterHi: '#FFE7A8',
  pink: '#FF9DB3', pinkSh: '#EC7896', pinkHi: '#FFC4D2',
  sky: '#9FDBF7', skyHi: '#C9ECFB',
  leaf: '#5DBE6A', leafSh: '#3C9A52', leafHi: '#8AD68D',
  steel: '#D9DEEA', steelSh: '#AEB6CB', char: '#3A3552', charHi: '#56507A',
  floorA: '#F6B49D', floorB: '#FFF1E0', floorSh: '#E79A82',
  tomato: '#EE4336', tomatoSh: '#C22F2A', tomatoHi: '#FF7A62', tomatoFlesh: '#FF8266', seed: '#FFD98A',
};

// Character style sheet: shape classes -> custom properties (with fallbacks).
const CHAR_CSS = `
.skin{fill:var(--skin)}.skin-sh{fill:var(--skin-sh)}.hair{fill:var(--hair)}.hair-hi{fill:var(--hair-hi)}
.hair-st{fill:none;stroke:var(--hair-hi);stroke-width:6;stroke-linecap:round}
.top{fill:var(--top)}.top-sh{fill:var(--top-sh)}.acc{fill:var(--acc)}.acc-sh{fill:var(--acc-sh)}
.bot{fill:var(--bottom)}.bot-sh{fill:var(--bottom-sh)}.shoe{fill:var(--shoe)}.shoe-sh{fill:var(--shoe-sh)}
.ink{fill:${C.ink}}.wht{fill:#fff}.blush{fill:${C.blush};opacity:.45}.mouth{fill:#8A2A3E}.tongue{fill:#FF7C88}
.ln{fill:none;stroke:${C.ink};stroke-width:7;stroke-linecap:round;stroke-linejoin:round}
.brow{fill:none;stroke:var(--hair);stroke-width:9;stroke-linecap:round}
.skin-ln{fill:none;stroke:var(--skin-sh);stroke-width:6;stroke-linecap:round}
.freck{fill:var(--skin-sh);opacity:.8}
.shadow{fill:${C.ink};opacity:.13}
`;

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------
const f = (n) => +n.toFixed(1);
// Scalloped (curly) outline along an ellipse arc: used for curly hair / frosting.
function scallop(cx, cy, rx, ry, n, bump, a0 = 0, a1 = 360, close = true) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    // push the control point outward from the ellipse centre
    const vx = mx - cx, vy = my - cy, L = Math.hypot(vx, vy) || 1;
    d += ` Q${f(mx + (vx / L) * bump)} ${f(my + (vy / L) * bump)} ${f(x1)} ${f(y1)}`;
  }
  return close ? d + 'Z' : d;
}
// Angle so an arm drawn pointing straight down (+y) points toward (dx,dy).
const aim = (dx, dy) => f((Math.atan2(-dx, dy) * 180) / Math.PI);
const rot = (x, y, deg) => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

// ---------------------------------------------------------------------------
// CHARACTER PARTS. Local space: feet at (0,0), +y is down, x=0 is the centre.
// Arms are authored hanging straight down from their shoulder pivot at (0,0).
// Faces are authored in head space (same space as the body).
// ---------------------------------------------------------------------------

// ---------- ZOE (9): tall, curly high puff, apron -------------------------
const ZOE = {
  vars: {
    '--skin': '#C47F54', '--skin-sh': '#A5623D', '--hair': '#2E1A2B', '--hair-hi': '#51314A',
    '--top': '#6CB8EC', '--top-sh': '#4C97D0', '--acc': C.coral, '--acc-sh': C.coralSh,
    '--bottom': '#3A3F7A', '--bottom-sh': '#2A2E5E', '--shoe': '#FFFFFF', '--shoe-sh': '#D9DDEB',
  },
  shoulderL: [-68, -318], shoulderR: [68, -318], armLen: 146, neck: [0, -360],
};

function zoeLegs() {
  return `
  <g id="zoe-legs">
    <path class="bot" d="M-44 -190 L-40 -34 Q-40 -24 -30 -24 L-16 -24 Q-8 -24 -8 -34 L-6 -190Z"/>
    <path class="bot" d="M6 -190 L8 -34 Q8 -24 16 -24 L30 -24 Q40 -24 40 -34 L44 -190Z"/>
    <path class="bot-sh" d="M-8 -150 L-6 -190 L6 -190 L8 -150Z" opacity=".6"/>
    <!-- sneakers -->
    <path class="shoe" d="M-6 -2 L-6 -30 Q-6 -46 -24 -46 Q-44 -46 -56 -32 Q-68 -18 -64 -6 Q-62 0 -52 0 L-10 0 Q-6 0 -6 -2Z"/>
    <path class="shoe" d="M6 -2 L6 -30 Q6 -46 24 -46 Q44 -46 56 -32 Q68 -18 64 -6 Q62 0 52 0 L10 0 Q6 0 6 -2Z"/>
    <path class="acc" d="M-64 -8 Q-62 0 -52 0 L-10 0 Q-6 0 -6 -2 L-6 -10Z"/>
    <path class="acc" d="M64 -8 Q62 0 52 0 L10 0 Q6 0 6 -2 L6 -10Z"/>
    <path class="shoe-sh" d="M-44 -40 Q-30 -30 -34 -18" fill="none" stroke="#D9DDEB" stroke-width="5" stroke-linecap="round"/>
    <path class="shoe-sh" d="M44 -40 Q30 -30 34 -18" fill="none" stroke="#D9DDEB" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function zoeBody() {
  return `
  <g id="zoe-body">
    <rect class="skin-sh" x="-20" y="-378" width="40" height="46" rx="14"/>
    <!-- tunic -->
    <path class="top" d="M-44 -352 L44 -352 Q76 -352 80 -318 L94 -196 Q96 -176 76 -176 L-76 -176 Q-96 -176 -94 -196 L-80 -318 Q-76 -352 -44 -352Z"/>
    <path class="top-sh" d="M60 -340 Q72 -332 76 -318 L92 -196 Q94 -176 74 -176 L58 -176 Q72 -260 60 -340Z"/>
    <!-- collar -->
    <path class="wht" d="M-26 -352 Q0 -326 26 -352 L34 -348 Q0 -312 -34 -348Z"/>
    <!-- apron -->
    <path class="acc" d="M-40 -322 L40 -322 Q46 -322 46 -314 L48 -262 L84 -174 Q88 -160 74 -158 L-74 -158 Q-88 -160 -84 -174 L-48 -262 L-46 -314 Q-46 -322 -40 -322Z"/>
    <path class="acc-sh" d="M48 -262 L84 -174 Q88 -160 74 -158 L50 -158 Q70 -200 48 -262Z"/>
    <path class="acc" d="M-40 -322 L-30 -350 L-22 -350 L-30 -322Z"/>
    <path class="acc" d="M40 -322 L30 -350 L22 -350 L30 -322Z"/>
    <!-- waist tie + bow tail -->
    <rect class="acc-sh" x="-62" y="-268" width="124" height="14" rx="7"/>
    <path class="acc" d="M62 -262 Q88 -276 92 -254 Q84 -246 62 -256Z"/>
    <path class="acc" d="M62 -260 Q80 -240 74 -222 Q64 -226 60 -256Z"/>
    <!-- pocket with a heart -->
    <path fill="${C.cream}" d="M-34 -236 L34 -236 L32 -196 Q31 -186 21 -186 L-21 -186 Q-31 -186 -32 -196Z"/>
    <path fill="${C.pink}" d="M0 -196 C-16 -206 -18 -222 -8 -224 C-4 -225 -1 -222 0 -219 C1 -222 4 -225 8 -224 C18 -222 16 -206 0 -196Z"/>
    <!-- polka dots on apron skirt -->
    <g fill="${C.cream}" opacity=".85"><circle cx="-60" cy="-176" r="4"/><circle cx="-46" cy="-246" r="4"/><circle cx="52" cy="-180" r="4"/><circle cx="-6" cy="-300" r="4"/><circle cx="20" cy="-282" r="4"/><circle cx="-24" cy="-282" r="4"/><circle cx="46" cy="-214" r="4"/><circle cx="-52" cy="-206" r="4"/></g>
  </g>`;
}

// Arm: pivot at shoulder (0,0), pointing down. hand at (0, len).
function arm(id, len, { sleeve = 'top', flip = 1, holding = false } = {}) {
  const hl = len;
  return `
    <g id="${id}">
      <rect class="skin" x="-13" y="0" width="26" height="${hl}" rx="13"/>
      <path class="${sleeve}" d="M-24 -12 Q0 -30 24 -12 L22 44 Q0 54 -22 44Z"/>
      <path class="${sleeve}-sh" d="M-22 34 Q0 46 22 34 L22 44 Q0 54 -22 44Z"/>
      ${holding
        ? `<circle class="skin" cx="0" cy="${hl}" r="21"/><path class="skin-sh" d="M-14 ${hl + 10} Q0 ${hl + 22} 14 ${hl + 10}" fill="none" stroke-width="0"/>`
        : `<circle class="skin" cx="0" cy="${hl}" r="21"/><ellipse class="skin" cx="${-14 * flip}" cy="${hl - 8}" rx="9" ry="12" transform="rotate(${-25 * flip} ${-14 * flip} ${hl - 8})"/>`}
    </g>`;
}

function zoeHairBack() {
  return `
  <g id="zoe-hair-back">
    <path class="hair" d="${scallop(4, -720, 76, 70, 11, 16)}"/>
    <path class="hair-hi" d="M-30 -752 Q-10 -778 20 -770" fill="none" stroke="var(--hair-hi)" stroke-width="8" stroke-linecap="round"/>
    <path class="hair" d="${scallop(0, -520, 158, 168, 13, 18, 160, 380, false)} C176 -456 168 -404 138 -404 C118 -404 110 -424 112 -440 L-112 -440 C-110 -424 -118 -404 -138 -404 C-168 -404 -176 -456 -150 -440Z"/>
    <rect x="-46" y="-672" width="96" height="30" rx="15" fill="${C.butter}"/>
    <path d="M-20 -672 Q-24 -656 -20 -642 M14 -672 Q10 -656 14 -642" stroke="${C.butterSh}" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>`;
}
function zoeHead() {
  return `
  <g id="zoe-headshape">
    <circle class="skin" cx="-128" cy="-500" r="24"/><circle class="skin" cx="128" cy="-500" r="24"/>
    <circle class="skin-sh" cx="-130" cy="-500" r="11"/><circle class="skin-sh" cx="130" cy="-500" r="11"/>
    <path class="skin" d="M0 -648 C88 -648 132 -596 132 -514 C132 -426 86 -366 0 -366 C-86 -366 -132 -426 -132 -514 C-132 -596 -88 -648 0 -648Z"/>
    <!-- soft jaw shade -->
    <path class="skin-sh" opacity=".35" d="M116 -450 C98 -396 56 -366 0 -366 C40 -380 90 -400 116 -450Z"/>
    <ellipse class="blush" cx="-82" cy="-452" rx="24" ry="15"/><ellipse class="blush" cx="82" cy="-452" rx="24" ry="15"/>
    <path class="skin-sh" d="M-10 -476 Q0 -466 10 -476 Q12 -462 0 -460 Q-12 -462 -10 -476Z"/>
  </g>`;
}
function zoeHairFront() {
  return `
  <g id="zoe-hair-front">
    <path class="hair" d="M-138 -470 C-150 -600 -90 -676 4 -676 C96 -676 152 -604 140 -486
      C132 -520 122 -552 100 -574 Q84 -548 60 -574 Q44 -552 20 -580 Q-6 -554 -30 -584
      Q-58 -556 -84 -580 Q-104 -546 -112 -520 Q-122 -500 -138 -470Z"/>
    <path class="hair-st" d="M-86 -636 Q-60 -652 -36 -646"/>
    <path class="hair-st" d="M30 -650 Q56 -652 76 -636"/>
    <path class="hair-st" d="M-120 -560 Q-118 -586 -104 -604"/>
  </g>`;
}

// Expressions: eyes + brows + mouth, in head space.
const zoeEyes = (ry = 19, dy = 0) => `
    <ellipse class="ink" cx="-50" cy="${-506 + dy}" rx="14" ry="${ry}"/><ellipse class="ink" cx="50" cy="${-506 + dy}" rx="14" ry="${ry}"/>
    <circle class="wht" cx="-45" cy="${-513 + dy}" r="5.5"/><circle class="wht" cx="55" cy="${-513 + dy}" r="5.5"/>
    <circle class="wht" cx="-54" cy="${-498 + dy}" r="2.5"/><circle class="wht" cx="46" cy="${-498 + dy}" r="2.5"/>
    <path class="ln" d="M-64 ${-518 + dy} L-74 ${-526 + dy}" stroke-width="5"/><path class="ln" d="M64 ${-518 + dy} L74 ${-526 + dy}" stroke-width="5"/>`;
const ZOE_FACES = {
  happy: `
    ${zoeEyes()}
    <path class="brow" d="M-68 -548 Q-50 -560 -32 -552"/><path class="brow" d="M32 -552 Q50 -560 68 -548"/>
    <path class="mouth" d="M-34 -436 Q0 -428 34 -436 Q30 -396 0 -396 Q-30 -396 -34 -436Z"/>
    <path class="wht" d="M-28 -434 Q0 -428 28 -434 L26 -424 Q0 -420 -26 -424Z"/>
    <path class="tongue" d="M-16 -401 Q0 -416 16 -401 Q8 -396 0 -396 Q-8 -396 -16 -401Z"/>`,
  surprised: `
    ${zoeEyes(23, -2)}
    <path class="brow" d="M-70 -566 Q-52 -582 -32 -572"/><path class="brow" d="M32 -572 Q52 -582 70 -566"/>
    <ellipse class="mouth" cx="0" cy="-414" rx="17" ry="22"/>
    <ellipse class="tongue" cx="0" cy="-402" rx="10" ry="7"/>`,
  yum: `
    <path class="ln" d="M-68 -500 Q-50 -524 -32 -500"/><path class="ln" d="M32 -500 Q50 -524 68 -500"/>
    <path class="brow" d="M-68 -552 Q-50 -562 -32 -554"/><path class="brow" d="M32 -554 Q50 -562 68 -552"/>
    <path class="mouth" d="M-36 -438 Q0 -426 36 -438 Q28 -408 0 -408 Q-28 -408 -36 -438Z"/>
    <path class="tongue" d="M4 -414 Q22 -420 26 -404 Q26 -390 14 -390 Q4 -392 4 -414Z"/>`,
};

// ---------- IAN (5): short, big round head, ginger tufts, towel cape ------
const IAN = {
  vars: {
    '--skin': '#F7C9A3', '--skin-sh': '#E4A07A', '--hair': '#E26F34', '--hair-hi': '#F7985A',
    '--top': '#3F86DE', '--top-sh': '#2E69B8', '--acc': C.coral, '--acc-sh': C.coralSh,
    '--bottom': '#F4B63E', '--bottom-sh': '#D9962A', '--shoe': '#E8473B', '--shoe-sh': '#B7352E',
  },
  shoulderL: [-60, -236], shoulderR: [60, -236], armLen: 106, neck: [0, -262],
};
function ianCape() {
  return `
  <g id="ian-cape">
    <path class="acc" d="M-52 -256 Q0 -272 52 -256 Q80 -170 110 -96 Q90 -84 74 -96 Q56 -80 36 -94 Q10 -78 -12 -94 Q-34 -80 -52 -96 Q-70 -82 -86 -98 Q-66 -170 -52 -256Z"/>
    <path class="acc-sh" d="M-52 -256 Q-30 -230 -34 -170 Q-38 -120 -52 -96 Q-70 -82 -86 -98 Q-66 -170 -52 -256Z"/>
    <path class="acc-sh" d="M40 -250 Q70 -180 110 -96 Q90 -84 74 -96 Q60 -170 40 -250Z" opacity=".6"/>
  </g>`;
}
function ianLegs() {
  return `
  <g id="ian-legs">
    <rect class="skin" x="-40" y="-130" width="28" height="110" rx="13"/>
    <rect class="skin" x="12" y="-130" width="28" height="110" rx="13"/>
    <rect class="wht" x="-42" y="-54" width="32" height="30" rx="8"/><rect class="wht" x="10" y="-54" width="32" height="30" rx="8"/>
    <rect x="-42" y="-50" width="32" height="6" fill="${C.teal}"/><rect x="10" y="-50" width="32" height="6" fill="${C.teal}"/>
    <!-- chunky shoes -->
    <path class="shoe" d="M-4 -4 L-4 -26 Q-4 -44 -26 -44 Q-50 -44 -62 -28 Q-72 -14 -66 -4 Q-62 2 -52 2 L-8 2 Q-4 2 -4 -4Z"/>
    <path class="shoe" d="M4 -4 L4 -26 Q4 -44 26 -44 Q50 -44 62 -28 Q72 -14 66 -4 Q62 2 52 2 L8 2 Q4 2 4 -4Z"/>
    <path fill="#fff" d="M-68 -8 Q-64 2 -52 2 L-8 2 Q-4 2 -4 -4 L-4 -10Z"/><path fill="#fff" d="M68 -8 Q64 2 52 2 L8 2 Q4 2 4 -4 L4 -10Z"/>
    <rect class="shoe-sh" x="-44" y="-36" width="30" height="10" rx="5"/><rect class="shoe-sh" x="14" y="-36" width="30" height="10" rx="5"/>
  </g>`;
}
function ianBody() {
  return `
  <g id="ian-body">
    <!-- shorts -->
    <path class="bot" d="M-58 -168 L58 -168 L62 -110 Q62 -100 52 -100 L8 -100 L0 -118 L-8 -100 L-52 -100 Q-62 -100 -62 -110Z"/>
    <path class="bot-sh" d="M-58 -168 L58 -168 L59 -150 L-59 -150Z"/>
    <rect class="skin-sh" x="-18" y="-280" width="36" height="40" rx="12"/>
    <!-- tee -->
    <path class="top" d="M-38 -262 L38 -262 Q64 -262 70 -234 L74 -168 Q74 -150 56 -150 L-56 -150 Q-74 -150 -74 -168 L-70 -234 Q-64 -262 -38 -262Z"/>
    <path class="top-sh" d="M56 -250 Q68 -242 70 -234 L74 -168 Q74 -150 56 -150 L48 -150 Q62 -200 56 -250Z"/>
    <path fill="${C.butter}" d="M0 -232 L9 -212 L31 -210 L14 -196 L20 -174 L0 -186 L-20 -174 L-14 -196 L-31 -210 L-9 -212Z"/>
    <!-- cape knot -->
    <path class="acc" d="M-40 -264 Q0 -246 40 -264 L36 -252 Q0 -236 -36 -252Z"/>
    <circle class="acc-sh" cx="0" cy="-248" r="10"/><circle class="acc" cx="0" cy="-250" r="8"/>
  </g>`;
}
function ianHairBack() {
  return `<g id="ian-hair-back"></g>`;
}
function ianHead() {
  return `
  <g id="ian-headshape">
    <circle class="skin" cx="-130" cy="-376" r="28"/><circle class="skin" cx="130" cy="-376" r="28"/>
    <circle class="skin-sh" cx="-134" cy="-376" r="13"/><circle class="skin-sh" cx="134" cy="-376" r="13"/>
    <path class="skin" d="M0 -516 C92 -516 134 -466 134 -386 C134 -302 88 -254 0 -254 C-88 -254 -134 -302 -134 -386 C-134 -466 -92 -516 0 -516Z"/>
    <path class="skin-sh" opacity=".35" d="M120 -330 C100 -280 56 -254 0 -254 C44 -268 96 -290 120 -330Z"/>
    <ellipse class="blush" cx="-80" cy="-340" rx="26" ry="16"/><ellipse class="blush" cx="80" cy="-340" rx="26" ry="16"/>
    <g class="freck"><circle cx="-90" cy="-352" r="3.5"/><circle cx="-76" cy="-346" r="3.5"/><circle cx="-86" cy="-336" r="3.5"/>
    <circle cx="90" cy="-352" r="3.5"/><circle cx="76" cy="-346" r="3.5"/><circle cx="86" cy="-336" r="3.5"/></g>
    <ellipse class="skin-sh" cx="0" cy="-360" rx="13" ry="9"/>
  </g>`;
}
function ianHairFront() {
  return `
  <g id="ian-hair-front">
    <path class="hair" d="M-136 -396 C-156 -452 -128 -506 -86 -520 C-98 -548 -70 -566 -44 -552
      C-38 -584 0 -590 12 -560 C32 -588 70 -578 68 -548 C100 -560 126 -532 112 -506
      C146 -490 156 -440 136 -396 C126 -430 104 -454 74 -462 C62 -440 30 -436 16 -456
      C0 -434 -32 -436 -42 -458 C-62 -440 -98 -444 -106 -466 C-124 -450 -132 -426 -136 -396Z"/>
    <path class="hair" d="M8 -560 C-6 -610 50 -628 58 -594 C62 -578 46 -572 40 -584" fill="none" stroke="var(--hair)" stroke-width="12" stroke-linecap="round"/>
    <path class="hair-st" d="M-96 -500 Q-80 -512 -62 -508"/><path class="hair-st" d="M60 -520 Q80 -524 94 -510"/>
    <path class="hair-st" d="M-20 -540 Q-6 -548 8 -540"/>
  </g>`;
}
const ianEyes = (ry = 20, big = false) => `
    <ellipse class="ink" cx="-48" cy="-390" rx="${big ? 20 : 15}" ry="${ry}"/><ellipse class="ink" cx="48" cy="-390" rx="${big ? 20 : 15}" ry="${ry}"/>
    <circle class="wht" cx="${big ? -41 : -43}" cy="${big ? -400 : -397}" r="${big ? 7.5 : 6}"/><circle class="wht" cx="${big ? 55 : 53}" cy="${big ? -400 : -397}" r="${big ? 7.5 : 6}"/>
    <circle class="wht" cx="-53" cy="-380" r="${big ? 4 : 2.5}"/><circle class="wht" cx="43" cy="-380" r="${big ? 4 : 2.5}"/>`;
const IAN_FACES = {
  happy: `
    ${ianEyes()}
    <path class="brow" d="M-66 -432 Q-48 -442 -30 -434"/><path class="brow" d="M30 -434 Q48 -442 66 -432"/>
    <path class="mouth" d="M-44 -326 Q0 -316 44 -326 Q38 -282 0 -282 Q-38 -282 -44 -326Z"/>
    <path class="wht" d="M-24 -321 L-4 -320 L-5 -306 Q-14 -304 -22 -307Z"/><path class="wht" d="M4 -320 L24 -321 L22 -307 Q14 -304 5 -306Z"/>
    <path class="tongue" d="M-20 -288 Q0 -304 20 -288 Q10 -282 0 -282 Q-10 -282 -20 -288Z"/>`,
  surprised: `
    ${ianEyes(26, true)}
    <path class="brow" d="M-72 -452 Q-50 -468 -28 -454"/><path class="brow" d="M28 -454 Q50 -468 72 -452"/>
    <path class="mouth" d="M-22 -312 Q0 -334 22 -312 Q26 -280 0 -278 Q-26 -280 -22 -312Z"/>
    <ellipse class="tongue" cx="0" cy="-288" rx="12" ry="7"/>`,
  grumpy: `
    <ellipse class="ink" cx="-48" cy="-386" rx="15" ry="16"/><ellipse class="ink" cx="48" cy="-386" rx="15" ry="16"/>
    <circle class="wht" cx="-43" cy="-391" r="5"/><circle class="wht" cx="53" cy="-391" r="5"/>
    <path class="skin" d="M-70 -410 L-26 -396 L-26 -420 L-70 -420Z"/><path class="skin" d="M70 -410 L26 -396 L26 -420 L70 -420Z"/>
    <path class="brow" d="M-70 -424 L-28 -406"/><path class="brow" d="M28 -406 L70 -424"/>
    <path class="ln" d="M-22 -300 Q0 -318 22 -300"/>
    <ellipse class="blush" cx="-80" cy="-336" rx="30" ry="19" opacity=".35"/><ellipse class="blush" cx="80" cy="-336" rx="30" ry="19" opacity=".35"/>`,
};

// Assemble a character rig. opts: { expr, armL, armR (deg), headTilt, holdL, holdR, id }
function character(def, parts, faces, opts = {}) {
  const { expr = Object.keys(faces)[0], armL = 8, armR = -8, headTilt = 0, id = def.name,
          allFaces = false, inHandL = '', inHandR = '', armLFront = false } = opts;
  const style = Object.entries(def.vars).map(([k, v]) => `${k}:${v}`).join(';');
  const [lx, ly] = def.shoulderL, [rx, ry] = def.shoulderR, [nx, ny] = def.neck;
  const faceSvg = allFaces
    ? Object.entries(faces).map(([k, v]) => `<g id="${id}-face-${k}" class="face"${k === expr ? '' : ' style="display:none"'}>${v}</g>`).join('')
    : `<g id="${id}-face-${expr}" class="face">${faces[expr]}</g>`;
  return `
<g id="${id}" style="${style}">
  <ellipse class="shadow" cx="0" cy="0" rx="${def.shadow}" ry="16"/>
  ${parts.back ? parts.back() : ''}
  ${parts.legs()}
  ${parts.body()}
  ${armLFront ? '' : `<g id="${id}-arm-l-pivot" transform="translate(${lx} ${ly}) rotate(${armL})">${arm(`${id}-arm-l`, def.armLen, { flip: -1 })}</g>${inHandL}`}
  <g id="${id}-head" transform="rotate(${headTilt} ${nx} ${ny})">
    ${parts.hairBack()}
    ${parts.head()}
    <g id="${id}-face">${faceSvg}</g>
    ${parts.hairFront()}
  </g>
  ${armLFront ? `<g id="${id}-arm-l-pivot" transform="translate(${lx} ${ly}) rotate(${armL})">${arm(`${id}-arm-l`, def.armLen, { flip: -1 })}</g>${inHandL}` : ''}
  <g id="${id}-arm-r-pivot" transform="translate(${rx} ${ry}) rotate(${armR})">${arm(`${id}-arm-r`, def.armLen, { flip: 1 })}</g>
  ${inHandR}
</g>`;
}
ZOE.name = 'zoe'; ZOE.shadow = 90;
IAN.name = 'ian'; IAN.shadow = 84;
const zoeParts = { legs: zoeLegs, body: zoeBody, hairBack: zoeHairBack, head: zoeHead, hairFront: zoeHairFront };
const ianParts = { back: ianCape, legs: ianLegs, body: ianBody, hairBack: ianHairBack, head: ianHead, hairFront: ianHairFront };
const handPos = (def, side, deg) => {
  const [sx, sy] = side === 'L' ? def.shoulderL : def.shoulderR;
  const [x, y] = rot(0, def.armLen, deg);
  return [sx + x, sy + y];
};

// ---------------------------------------------------------------------------
// PROPS. Each is authored around its own origin (resting point / grip noted).
// ---------------------------------------------------------------------------
// Frying pan: pan centre at (0,0); handle grip at about (-205, 6).
const pan = (inside = '') => `
<g class="prop-pan">
  <path fill="${C.woodSh}" d="M-110 -6 L-210 -2 Q-236 0 -236 14 Q-236 28 -210 28 L-106 20Z"/>
  <path fill="${C.wood}" d="M-110 -6 L-210 -2 Q-236 0 -236 10 Q-236 18 -210 18 L-108 12Z"/>
  <circle cx="-222" cy="13" r="5" fill="${C.woodSh}"/>
  <rect x="-128" y="-10" width="34" height="30" rx="8" fill="${C.char}"/>
  <path fill="${C.char}" d="M-112 0 Q-106 58 0 60 Q106 58 112 0Z"/>
  <ellipse cx="0" cy="0" rx="114" ry="40" fill="${C.charHi}"/>
  <ellipse cx="0" cy="4" rx="100" ry="31" fill="${C.char}"/>
  <path d="M-70 36 Q-20 50 40 44" stroke="${C.charHi}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>
  <path d="M-80 -14 Q-50 -26 -10 -28" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".35"/>
  ${inside}
</g>`;
const egg = (x = 0, y = 0) => `
<g transform="translate(${x} ${y})">
  <path fill="#fff" d="M-52 2 C-60 -14 -34 -22 -18 -18 C-8 -28 22 -26 34 -16 C56 -16 62 2 44 10 C38 22 10 24 -4 18 C-26 26 -58 18 -52 2Z"/>
  <ellipse cx="-2" cy="-2" rx="19" ry="13" fill="${C.butterSh}"/><ellipse cx="-2" cy="-4" rx="17" ry="11" fill="#FFC23D"/>
  <ellipse cx="-8" cy="-8" rx="6" ry="3.5" fill="#fff" opacity=".7"/>
</g>`;
// Whole tomato: sits on (0,0) bottom, ~120 wide.
const tomato = (s = 1) => `
<g class="prop-tomato" transform="scale(${s})">
  <path fill="${C.tomato}" d="M0 -104 C44 -110 66 -80 64 -52 C62 -18 36 0 0 0 C-36 0 -62 -18 -64 -52 C-66 -80 -44 -110 0 -104Z"/>
  <path fill="${C.tomatoSh}" d="M58 -64 C60 -24 34 0 0 0 C-26 0 -46 -10 -56 -28 C-30 -10 30 -10 58 -64Z"/>
  <path fill="${C.tomatoHi}" d="M-44 -82 Q-50 -60 -40 -46 Q-44 -70 -30 -86Z"/>
  <path fill="${C.tomatoSh}" opacity=".5" d="M-6 -102 Q-2 -60 0 -30 Q4 -60 8 -102Z"/>
  <path fill="${C.leaf}" d="M0 -100 L-30 -110 L-10 -96 L-28 -80 L-2 -92 L8 -76 L10 -94 L34 -92 L14 -102 L24 -118 L4 -106Z"/>
  <path d="M2 -104 Q2 -122 12 -130" stroke="${C.leafSh}" stroke-width="7" fill="none" stroke-linecap="round"/>
</g>`;
// Tomato slice face: flat circle, centre (0,0) radius r.
const slice = (r = 44) => `
<g class="prop-slice">
  <circle r="${r}" fill="${C.tomatoSh}"/><circle r="${r - 4}" fill="${C.tomato}"/>
  <circle r="${r - 10}" fill="${C.tomatoFlesh}"/>
  ${[0, 72, 144, 216, 288].map((a) => {
    const [x, y] = rot(0, -(r * 0.46), a);
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.2)}" ry="${f(r * 0.28)}" transform="rotate(${a} ${f(x)} ${f(y)})" fill="#FFB199"/>
      <ellipse cx="${f(x * 0.95)}" cy="${f(y * 0.95)}" rx="${f(r * 0.06)}" ry="${f(r * 0.1)}" transform="rotate(${a} ${f(x * 0.95)} ${f(y * 0.95)})" fill="${C.seed}"/>`;
  }).join('')}
  <circle r="${f(r * 0.16)}" fill="#FFB199"/>
  <path d="M${-r * 0.6} ${-r * 0.55} Q${-r * 0.2} ${-r * 0.85} ${r * 0.25} ${-r * 0.8}" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5"/>
</g>`;
// Sliced tomato set: a cut half + fanned slices, resting on y=0.
const slicedTomato = () => `
<g class="prop-sliced-tomato">
  <path fill="${C.tomato}" d="M40 -96 C80 -100 104 -76 104 -48 C104 -16 80 0 50 0 L40 0Z"/>
  <path fill="${C.tomatoSh}" d="M100 -60 C102 -20 80 0 50 0 L42 0 Q90 -14 100 -60Z"/>
  <path fill="${C.leaf}" d="M60 -96 L44 -108 L62 -104 L74 -118 L74 -100 L92 -100 L74 -92Z"/>
  <g transform="translate(40 -48) scale(0.34 1)">${slice(48)}</g>
  <g transform="translate(-6 -30) rotate(-8) scale(1 .62)">${slice(40)}</g>
  <g transform="translate(-58 -22) rotate(-14) scale(1 .62)">${slice(38)}</g>
</g>`;
// Cupcake: sits on (0,0). ~120 wide, ~170 tall.
const cupcake = (s = 1) => `
<g class="prop-cupcake" transform="scale(${s})">
  <path fill="${C.teal}" d="M-50 -64 L50 -64 L40 -4 Q39 0 34 0 L-34 0 Q-39 0 -40 -4Z"/>
  <g stroke="${C.tealSh}" stroke-width="5" stroke-linecap="round"><path d="M-30 -60 L-24 -6"/><path d="M-10 -60 L-8 -6"/><path d="M10 -60 L8 -6"/><path d="M30 -60 L24 -6"/></g>
  <path fill="${C.tealSh}" d="M40 -4 L50 -64 L36 -64 L28 0 L34 0 Q39 0 40 -4Z" opacity=".6"/>
  <path fill="${C.pink}" d="M-62 -66 C-74 -86 -52 -100 -40 -94 C-46 -118 -20 -128 -6 -118 C-2 -138 30 -142 36 -120
    C54 -126 72 -106 60 -90 C78 -86 76 -62 58 -60 L-54 -58 C-66 -58 -70 -62 -62 -66Z"/>
  <path fill="${C.pinkHi}" d="M-40 -94 C-30 -108 -8 -106 -6 -118 C4 -104 -20 -94 -40 -94Z"/>
  <path fill="${C.pinkSh}" d="M58 -60 C76 -62 78 -86 60 -90 C62 -76 50 -66 30 -62Z"/>
  <path fill="${C.pinkSh}" d="M-54 -58 L58 -60 Q30 -70 0 -66 Q-30 -70 -54 -58Z" opacity=".7"/>
  <g stroke-width="6" stroke-linecap="round">
    <path d="M-34 -80 L-26 -84" stroke="${C.butter}"/><path d="M-6 -94 L0 -100" stroke="${C.sky}"/><path d="M20 -84 L28 -80" stroke="#fff"/>
    <path d="M-20 -70 L-12 -68" stroke="${C.sky}"/><path d="M40 -72 L44 -78" stroke="${C.butter}"/><path d="M8 -112 L14 -108" stroke="${C.butter}"/>
  </g>
  <path d="M10 -142 Q12 -164 26 -170" stroke="${C.leafSh}" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="8" cy="-138" r="17" fill="${C.tomato}"/><circle cx="3" cy="-143" r="5" fill="#fff" opacity=".7"/>
</g>`;
// Mixing bowl: sits on (0,0), ~300 wide. With batter + whisk.
const bowl = () => `
<g class="prop-bowl">
  <!-- whisk (behind rim) -->
  <g transform="translate(-10 -40) rotate(24 40 -120)">
    <rect x="30" y="-250" width="20" height="96" rx="10" fill="${C.coral}"/>
    <rect x="30" y="-250" width="7" height="96" rx="3.5" fill="${C.coralHi}"/>
    <g fill="none" stroke="#8C95B0" stroke-width="6">
      <path d="M40 -156 C-10 -120 0 -40 40 -40 C80 -40 90 -120 40 -156Z"/>
      <path d="M40 -156 C14 -120 20 -44 40 -44 C60 -44 66 -120 40 -156Z"/>
      <path d="M40 -156 L40 -44"/>
    </g>
  </g>
  <ellipse cx="0" cy="-122" rx="150" ry="38" fill="${C.butterSh}"/>
  <ellipse cx="0" cy="-116" rx="136" ry="28" fill="#FFF0C8"/>
  <path d="M-60 -122 Q-20 -134 30 -120" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>
  <path fill="${C.sky}" d="M-150 -122 Q-148 -30 -70 -8 L-60 0 L60 0 L70 -8 Q148 -30 150 -122 Q150 -84 0 -84 Q-150 -84 -150 -122Z"/>
  <path fill="#7CC4EA" d="M150 -122 Q148 -30 70 -8 L60 0 L40 0 Q120 -40 136 -104 Q150 -110 150 -122Z"/>
  <path fill="${C.skyHi}" d="M-128 -96 Q-120 -50 -84 -30 Q-110 -60 -112 -92Z"/>
  <path fill="#fff" d="M-146 -86 Q0 -60 146 -86 L140 -66 Q0 -40 -140 -66Z" opacity=".9"/>
  <g fill="${C.coral}"><circle cx="-90" cy="-72" r="7"/><circle cx="-45" cy="-64" r="7"/><circle cx="0" cy="-62" r="7"/><circle cx="45" cy="-64" r="7"/><circle cx="90" cy="-72" r="7"/></g>
  <ellipse cx="0" cy="-2" rx="64" ry="8" fill="#7CC4EA"/>
</g>`;

// ---------------------------------------------------------------------------
// KITCHEN BACKGROUND (2048 x 1536). Back wall base at y=1160.
// ---------------------------------------------------------------------------
const W = 2048, H = 1536, BASE = 1160;
function floor() {
  const rows = [BASE, 1206, 1264, 1336, 1424, 1536];
  const vx = 1024, k0 = 0.6, tw = 190;
  const scale = (y) => k0 + (1 - k0) * ((y - BASE) / (H - BASE));
  let s = `<rect x="0" y="${BASE}" width="${W}" height="${H - BASE}" fill="${C.floorB}"/>`;
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = rows[r], y1 = rows[r + 1];
    for (let j = -9; j < 9; j++) {
      if ((j + r) % 2 === 0) continue;
      const a = vx + j * tw * scale(y0), b = vx + (j + 1) * tw * scale(y0);
      const c = vx + (j + 1) * tw * scale(y1), d = vx + j * tw * scale(y1);
      s += `<path d="M${f(a)} ${y0}L${f(b)} ${y0}L${f(c)} ${y1}L${f(d)} ${y1}Z" fill="${C.floorA}"/>`;
    }
  }
  // soft contact shadow along the wall base
  s += `<rect x="0" y="${BASE}" width="${W}" height="26" fill="${C.floorSh}" opacity=".45"/>`;
  return s;
}
function wall() {
  return `
  <rect width="${W}" height="${BASE}" fill="${C.wall}"/>
  <rect width="${W}" height="${BASE}" fill="url(#wallpaper)"/>
  <!-- backsplash -->
  <rect x="390" y="610" width="${W - 390}" height="270" fill="${C.tile}"/>
  <rect x="390" y="610" width="${W - 390}" height="270" fill="url(#tiles)"/>
  <rect x="390" y="604" width="${W - 390}" height="12" fill="${C.tileSh}"/>
  <!-- baseboard (visible left of fridge) -->
  <rect x="0" y="${BASE - 34}" width="80" height="34" fill="${C.wallDeep}"/>
  <!-- ceiling trim -->
  <rect x="0" y="0" width="${W}" height="28" fill="${C.wallDeep}"/>
  <rect x="0" y="28" width="${W}" height="8" fill="${C.wallSh}"/>`;
}
function bunting() {
  const cols = [C.coral, C.butter, C.teal, C.pink, C.sky];
  let s = `<path d="M-20 60 Q260 150 540 70" stroke="${C.inkSoft}" stroke-width="4" fill="none"/>`;
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const x = (1 - t) * (1 - t) * -20 + 2 * (1 - t) * t * 260 + t * t * 540;
    const y = (1 - t) * (1 - t) * 60 + 2 * (1 - t) * t * 150 + t * t * 70;
    s += `<path d="M${f(x - 26)} ${f(y - 3)} L${f(x + 26)} ${f(y + 3)} L${f(x + 2)} ${f(y + 58)}Z" fill="${cols[i % 5]}"/>`;
  }
  return s;
}
function windowArt() {
  return `
  <g id="window">
    <rect x="520" y="146" width="480" height="420" rx="40" fill="${C.white}"/>
    <rect x="548" y="174" width="424" height="364" rx="22" fill="${C.sky}"/>
    <clipPath id="winclip"><rect x="548" y="174" width="424" height="364" rx="22"/></clipPath>
    <g clip-path="url(#winclip)">
      <circle cx="880" cy="250" r="44" fill="${C.butterHi}"/>
      <path fill="#fff" d="M580 300 Q586 270 616 276 Q628 250 660 262 Q690 256 694 286 Q716 290 710 310 L582 312Z"/>
      <path fill="#fff" opacity=".8" d="M790 350 Q796 330 818 334 Q830 316 852 326 Q874 324 874 346 L790 352Z"/>
      <!-- rooftops of the little town -->
      <path fill="${C.pinkHi}" d="M548 440 L610 400 L672 440 L672 540 L548 540Z"/>
      <path fill="${C.butterHi}" d="M680 460 L680 410 Q720 380 760 410 L760 540 L680 540Z"/>
      <path fill="#B9E3C7" d="M770 430 L840 430 L840 540 L770 540Z"/>
      <path fill="${C.tealHi}" d="M760 432 L805 392 L850 432Z"/>
      <path fill="${C.coralHi}" d="M850 450 L972 450 L972 540 L850 540Z"/>
      <g fill="#fff" opacity=".85"><rect x="580" y="460" width="24" height="30" rx="6"/><rect x="620" y="460" width="24" height="30" rx="6"/>
      <rect x="704" y="440" width="32" height="32" rx="16"/><rect x="790" y="460" width="22" height="28" rx="5"/><rect x="872" y="474" width="26" height="26" rx="6"/><rect x="920" y="474" width="26" height="26" rx="6"/></g>
      <circle cx="930" cy="410" r="50" fill="${C.leaf}"/><circle cx="960" cy="440" r="40" fill="${C.leafSh}"/>
    </g>
    <rect x="752" y="174" width="16" height="364" fill="#fff"/>
    <rect x="548" y="350" width="424" height="14" fill="#fff"/>
    <!-- sill -->
    <rect x="496" y="552" width="528" height="30" rx="15" fill="${C.woodHi}"/>
    <rect x="510" y="576" width="500" height="10" rx="5" fill="${C.woodSh}" opacity=".5"/>
    <!-- curtains -->
    <path fill="${C.pink}" d="M500 130 L610 130 Q600 260 640 330 Q600 350 560 340 Q520 250 500 130Z"/>
    <path fill="${C.pink}" d="M1020 130 L910 130 Q920 260 880 330 Q920 350 960 340 Q1000 250 1020 130Z"/>
    <path fill="${C.pinkSh}" d="M560 340 Q600 350 640 330 L630 318 Q590 330 560 324Z"/>
    <path fill="${C.pinkSh}" d="M960 340 Q920 350 880 330 L890 318 Q930 330 960 324Z"/>
    <g fill="#fff" opacity=".6"><circle cx="540" cy="170" r="6"/><circle cx="580" cy="210" r="6"/><circle cx="560" cy="260" r="6"/><circle cx="600" cy="300" r="6"/><circle cx="980" cy="170" r="6"/><circle cx="940" cy="210" r="6"/><circle cx="960" cy="260" r="6"/><circle cx="920" cy="300" r="6"/></g>
    <rect x="480" y="116" width="560" height="18" rx="9" fill="${C.woodSh}"/>
    <circle cx="480" cy="125" r="16" fill="${C.wood}"/><circle cx="1040" cy="125" r="16" fill="${C.wood}"/>
    <!-- plant on the sill -->
    <g transform="translate(900 552)">
      <path fill="${C.leafSh}" d="M0 -40 C-50 -60 -60 -110 -30 -120 C-20 -90 -10 -60 0 -40Z"/>
      <path fill="${C.leaf}" d="M0 -40 C40 -70 70 -120 30 -140 C14 -110 6 -70 0 -40Z"/>
      <path fill="${C.leafHi}" d="M0 -40 C-10 -90 0 -140 10 -150 C20 -120 12 -80 0 -40Z"/>
      <path fill="${C.coral}" d="M-40 -46 L40 -46 L32 0 L-32 0Z"/><rect x="-46" y="-56" width="92" height="16" rx="8" fill="${C.coralHi}"/>
    </g>
    <g transform="translate(640 552)">
      <path fill="${C.butter}" d="M-30 -60 L30 -60 L24 0 L-24 0Z"/><path fill="${C.butterSh}" d="M16 -60 L30 -60 L24 0 L12 0Z"/>
      <circle cx="-14" cy="-78" r="18" fill="${C.leaf}"/><circle cx="12" cy="-84" r="20" fill="${C.leafSh}"/><circle cx="0" cy="-100" r="18" fill="${C.leaf}"/>
      <circle cx="-4" cy="-104" r="6" fill="${C.pink}"/><circle cx="16" cy="-86" r="6" fill="#fff"/>
    </g>
  </g>`;
}
function fridge() {
  return `
  <g id="fridge">
    <rect x="70" y="${BASE - 14}" width="340" height="16" rx="6" fill="${C.ink}" opacity=".15"/>
    <rect x="74" y="300" width="330" height="${BASE - 300 - 6}" rx="56" fill="${C.butter}"/>
    <path fill="${C.butterSh}" d="M350 300 Q404 300 404 356 L404 1098 Q404 1154 350 1154 L330 1154 Q370 1100 370 1000 L370 380 Q370 320 330 300Z"/>
    <path fill="${C.butterHi}" d="M110 360 Q112 330 140 326 L140 1080 Q112 1076 110 1050Z"/>
    <rect x="74" y="628" width="330" height="12" fill="${C.butterSh}"/>
    <!-- handles -->
    <rect x="330" y="470" width="22" height="130" rx="11" fill="${C.steel}"/><rect x="330" y="470" width="8" height="130" rx="4" fill="#fff"/>
    <rect x="330" y="670" width="22" height="160" rx="11" fill="${C.steel}"/><rect x="330" y="670" width="8" height="160" rx="4" fill="#fff"/>
    <!-- feet -->
    <rect x="110" y="1146" width="40" height="14" rx="6" fill="${C.inkSoft}"/><rect x="330" y="1146" width="40" height="14" rx="6" fill="${C.inkSoft}"/>
    <!-- kid drawing: sun + house -->
    <g transform="rotate(-5 200 760)">
      <rect x="140" y="690" width="140" height="170" rx="6" fill="#fff"/>
      <circle cx="180" cy="732" r="18" fill="${C.butter}"/>
      <path d="M170 838 L170 790 L210 760 L250 790 L250 838Z" fill="${C.sky}"/>
      <path d="M160 792 L210 752 L260 792" stroke="${C.coral}" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="202" y="808" width="16" height="30" fill="${C.coral}"/>
      <circle cx="210" cy="696" r="9" fill="${C.teal}"/>
    </g>
    <!-- magnets -->
    <circle cx="140" cy="420" r="18" fill="${C.coral}"/><circle cx="135" cy="415" r="6" fill="#fff" opacity=".6"/>
    <path d="M230 400 L262 400 L262 440 L230 440Z" fill="${C.teal}" transform="rotate(10 246 420)"/>
    <path d="M170 520 C154 508 152 490 164 486 C170 484 174 490 175 494 C176 490 180 484 186 486 C198 490 196 508 180 520Z" fill="${C.pink}"/>
    <g transform="translate(250 930) rotate(6)"><rect x="-50" y="-40" width="100" height="84" rx="4" fill="#fff"/><rect x="-42" y="-32" width="84" height="56" fill="${C.skyHi}"/><circle cx="-12" cy="-6" r="12" fill="${C.coralHi}"/><circle cx="14" cy="-2" r="10" fill="${C.leafHi}"/><circle cx="0" cy="-44" r="10" fill="${C.butterSh}"/></g>
  </g>`;
}
function counter(x0, x1, { drawers = true } = {}) {
  const top = 870;
  let s = `
    <rect x="${x0}" y="${top + 40}" width="${x1 - x0}" height="${BASE - top - 40}" fill="${C.teal}"/>
    <rect x="${x0}" y="${BASE - 30}" width="${x1 - x0}" height="30" fill="${C.tealSh}"/>`;
  // doors / drawers
  const n = Math.round((x1 - x0) / 250);
  const dw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const dx = x0 + i * dw + 14;
    const w = dw - 28;
    if (drawers && i % 2 === 0) {
      s += `<rect x="${f(dx)}" y="${top + 56}" width="${f(w)}" height="70" rx="14" fill="${C.tealHi}"/>
        <rect x="${f(dx)}" y="${top + 142}" width="${f(w)}" height="96" rx="14" fill="${C.tealHi}"/>
        <rect x="${f(dx + w / 2 - 36)}" y="${top + 84}" width="72" height="14" rx="7" fill="${C.cream}"/>
        <rect x="${f(dx + w / 2 - 36)}" y="${top + 184}" width="72" height="14" rx="7" fill="${C.cream}"/>`;
    } else {
      s += `<rect x="${f(dx)}" y="${top + 56}" width="${f(w)}" height="182" rx="16" fill="${C.tealHi}"/>
        <rect x="${f(dx + 18)}" y="${top + 74}" width="${f(w - 36)}" height="146" rx="10" fill="${C.teal}" opacity=".5"/>
        <circle cx="${f(dx + (i % 2 ? 26 : w - 26))}" cy="${top + 150}" r="10" fill="${C.cream}"/>`;
    }
  }
  s += `
    <rect x="${x0 - 12}" y="${top}" width="${x1 - x0 + 24}" height="44" rx="12" fill="${C.wood}"/>
    <rect x="${x0 - 12}" y="${top}" width="${x1 - x0 + 24}" height="12" rx="6" fill="${C.woodHi}"/>
    <rect x="${x0 - 4}" y="${top + 38}" width="${x1 - x0 + 8}" height="10" fill="${C.tealSh}" opacity=".7"/>`;
  return s;
}
function stove() {
  const x0 = 1170, x1 = 1560, top = 870;
  return `
  <g id="stove">
    <!-- back guard with dials -->
    <rect x="${x0 + 6}" y="770" width="${x1 - x0 - 12}" height="110" rx="22" fill="${C.coral}"/>
    <rect x="${x0 + 6}" y="770" width="${x1 - x0 - 12}" height="16" rx="8" fill="${C.coralHi}"/>
    <circle cx="1365" cy="826" r="30" fill="${C.cream}"/><circle cx="1365" cy="826" r="22" fill="#fff"/>
    <path d="M1365 826 L1365 810 M1365 826 L1376 832" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
    ${[1230, 1290, 1440, 1500].map((x) => `<circle cx="${x}" cy="826" r="20" fill="${C.cream}"/><rect x="${x - 4}" y="808" width="8" height="18" rx="4" fill="${C.coralSh}"/>`).join('')}
    <!-- cooktop -->
    <rect x="${x0 - 6}" y="${top}" width="${x1 - x0 + 12}" height="30" rx="10" fill="${C.char}"/>
    <rect x="1210" y="${top - 8}" width="130" height="12" rx="6" fill="${C.charHi}"/><rect x="1390" y="${top - 8}" width="130" height="12" rx="6" fill="${C.charHi}"/>
    <!-- body -->
    <rect x="${x0}" y="${top + 30}" width="${x1 - x0}" height="${BASE - top - 30}" fill="${C.coral}"/>
    <rect x="${x1 - 40}" y="${top + 30}" width="40" height="${BASE - top - 30}" fill="${C.coralSh}"/>
    <!-- oven door -->
    <rect x="${x0 + 30}" y="${top + 60}" width="${x1 - x0 - 60}" height="210" rx="26" fill="${C.coralHi}"/>
    <rect x="${x0 + 60}" y="${top + 110}" width="${x1 - x0 - 120}" height="130" rx="18" fill="${C.char}"/>
    <rect x="${x0 + 60}" y="${top + 110}" width="${x1 - x0 - 120}" height="130" rx="18" fill="url(#ovenglow)"/>
    <path d="M${x0 + 84} ${top + 128} L${x0 + 130} ${top + 128} L${x0 + 96} ${top + 210}Z" fill="#fff" opacity=".15"/>
    <rect x="${x0 + 70}" y="${top + 76}" width="${x1 - x0 - 140}" height="18" rx="9" fill="${C.steel}"/>
    <rect x="${x0 + 70}" y="${top + 76}" width="${x1 - x0 - 140}" height="6" rx="3" fill="#fff"/>
    <!-- a tray of little buns glowing inside -->
    <g fill="${C.butterSh}"><ellipse cx="1300" cy="1080" rx="34" ry="20"/><ellipse cx="1370" cy="1080" rx="34" ry="20"/><ellipse cx="1440" cy="1080" rx="34" ry="20"/></g>
    <g fill="${C.butterHi}" opacity=".7"><ellipse cx="1292" cy="1072" rx="14" ry="6"/><ellipse cx="1362" cy="1072" rx="14" ry="6"/><ellipse cx="1432" cy="1072" rx="14" ry="6"/></g>
    <rect x="1250" y="1098" width="230" height="8" rx="4" fill="${C.steelSh}"/>
    <rect x="${x0}" y="${BASE - 26}" width="${x1 - x0}" height="26" fill="${C.coralSh}"/>
  </g>`;
}
function hood() {
  return `
  <g id="hood">
    <rect x="1305" y="36" width="120" height="230" fill="${C.steel}"/>
    <rect x="1305" y="36" width="24" height="230" fill="#fff" opacity=".6"/>
    <rect x="1395" y="36" width="30" height="230" fill="${C.steelSh}"/>
    <path d="M1300 260 L1430 260 L1560 420 L1170 420Z" fill="${C.steel}"/>
    <path d="M1300 260 L1330 260 L1230 420 L1170 420Z" fill="#fff" opacity=".6"/>
    <path d="M1400 260 L1430 260 L1560 420 L1510 420Z" fill="${C.steelSh}"/>
    <rect x="1160" y="412" width="410" height="34" rx="17" fill="${C.steelSh}"/>
    <rect x="1160" y="412" width="410" height="12" rx="6" fill="#fff" opacity=".5"/>
    <circle cx="1270" cy="429" r="6" fill="${C.butter}"/>
  </g>`;
}
function chalkboard() {
  return `
  <g id="chalkboard" transform="rotate(-2 1090 360)">
    <rect x="1030" y="176" width="100" height="16" rx="8" fill="${C.woodSh}"/>
    <path d="M1080 150 L1040 180 M1080 150 L1120 180" stroke="${C.inkSoft}" stroke-width="3"/>
    <circle cx="1080" cy="150" r="7" fill="${C.woodSh}"/>
    <rect x="1030" y="180" width="110" height="360" rx="14" fill="${C.wood}"/>
    <rect x="1042" y="192" width="86" height="336" rx="8" fill="#39505A"/>
    <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".9">
      <!-- cupcake doodle -->
      <path d="M1066 290 L1070 262 L1100 262 L1104 290Z"/><path d="M1064 262 Q1062 240 1085 236 Q1108 240 1106 262"/>
      <!-- cup doodle -->
      <path d="M1064 350 L1068 384 Q1085 392 1102 384 L1106 350Z"/><path d="M1106 358 Q1120 362 1104 376"/><path d="M1078 340 Q1074 330 1080 324 M1092 340 Q1088 330 1094 324"/>
      <!-- heart doodle -->
      <path d="M1085 478 C1062 462 1064 440 1076 440 C1082 440 1085 446 1085 450 C1085 446 1088 440 1094 440 C1106 440 1108 462 1085 478Z"/>
    </g>
    <g fill="${C.pinkHi}"><circle cx="1085" cy="228" r="6"/></g>
    <g fill="${C.butterHi}"><circle cx="1070" cy="420" r="5"/><circle cx="1085" cy="420" r="5"/><circle cx="1100" cy="420" r="5"/></g>
  </g>`;
}
function shelves() {
  const jar = (x, y, w, h, lid, fill) => `
    <g><rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="14" fill="#E9F6F8" opacity=".9"/>
    <rect x="${x + 6}" y="${y - h * 0.7}" width="${w - 12}" height="${h * 0.7 - 6}" rx="10" fill="${fill}"/>
    <rect x="${x - 4}" y="${y - h - 14}" width="${w + 8}" height="20" rx="8" fill="${lid}"/>
    <rect x="${x + 8}" y="${y - h + 14}" width="8" height="${h * 0.5}" rx="4" fill="#fff" opacity=".8"/></g>`;
  return `
  <g id="shelves">
    <!-- upper shelf -->
    <rect x="1610" y="300" width="400" height="24" rx="8" fill="${C.wood}"/><rect x="1610" y="318" width="400" height="8" rx="4" fill="${C.woodSh}"/>
    <path d="M1650 324 L1650 370 L1690 324Z" fill="${C.woodSh}"/><path d="M1970 324 L1970 370 L1930 324Z" fill="${C.woodSh}"/>
    ${jar(1640, 300, 70, 110, C.coral, '#FFFFFF')}
    ${jar(1726, 300, 60, 84, C.teal, C.woodHi)}
    ${jar(1800, 300, 54, 64, C.butter, C.pinkHi)}
    <!-- teapot -->
    <g transform="translate(1920 300)">
      <path d="M-60 -40 Q-84 -50 -86 -76 L-74 -78 Q-70 -58 -54 -52Z" fill="${C.tealSh}"/>
      <path d="M40 -60 Q66 -64 62 -40 Q58 -22 40 -24" stroke="${C.tealSh}" stroke-width="10" fill="none"/>
      <path d="M-56 0 Q-66 -40 -40 -70 Q0 -90 40 -70 Q66 -40 56 0Z" fill="${C.tealHi}"/>
      <path d="M20 -80 Q52 -66 56 0 L36 0 Q46 -50 20 -80Z" fill="${C.teal}"/>
      <ellipse cx="0" cy="-78" rx="30" ry="8" fill="${C.teal}"/><circle cx="0" cy="-90" r="10" fill="${C.teal}"/>
      <g fill="#fff"><circle cx="-20" cy="-36" r="6"/><circle cx="4" cy="-44" r="6"/><circle cx="-8" cy="-18" r="6"/><circle cx="22" cy="-24" r="6"/></g>
    </g>
    <!-- lower shelf -->
    <rect x="1610" y="520" width="400" height="24" rx="8" fill="${C.wood}"/><rect x="1610" y="538" width="400" height="8" rx="4" fill="${C.woodSh}"/>
    <path d="M1650 544 L1650 590 L1690 544Z" fill="${C.woodSh}"/><path d="M1970 544 L1970 590 L1930 544Z" fill="${C.woodSh}"/>
    <!-- books -->
    <rect x="1636" y="400" width="30" height="120" rx="5" fill="${C.coral}"/><rect x="1668" y="420" width="26" height="100" rx="5" fill="${C.butter}"/>
    <rect x="1696" y="410" width="32" height="110" rx="5" fill="${C.sky}"/><rect x="1730" y="436" width="24" height="84" rx="5" fill="${C.pink}" transform="rotate(12 1742 520)"/>
    <g fill="#fff" opacity=".7"><rect x="1642" y="424" width="18" height="6" rx="3"/><rect x="1702" y="434" width="20" height="6" rx="3"/></g>
    <!-- stacked plates + bowls -->
    <g><rect x="1800" y="508" width="110" height="12" rx="6" fill="#fff"/><rect x="1806" y="496" width="98" height="12" rx="6" fill="${C.cream}"/><rect x="1800" y="484" width="110" height="12" rx="6" fill="#fff"/>
    <path d="M1812 484 Q1814 450 1855 450 Q1896 450 1898 484Z" fill="${C.pink}"/><path d="M1826 452 Q1856 440 1884 452" stroke="#fff" stroke-width="4" fill="none" opacity=".6"/></g>
    <!-- trailing plant -->
    <g transform="translate(1960 520)">
      <path fill="${C.leafSh}" d="M-14 -4 Q-20 60 6 110 Q14 70 4 -4Z"/>
      <path fill="${C.leaf}" d="M10 -4 Q26 50 18 150 Q-4 90 -2 -4Z"/>
      ${[[4, 30], [14, 70], [8, 110], [18, 140], [-4, 50], [0, 90]].map(([x, y], i) => `<ellipse cx="${x + (i % 2 ? -10 : 12)}" cy="${y}" rx="14" ry="9" fill="${i % 2 ? C.leaf : C.leafHi}" transform="rotate(${i % 2 ? -30 : 30} ${x} ${y})"/>`).join('')}
      <path fill="${C.leafHi}" d="M-30 -30 Q0 -80 30 -30Z"/><path fill="${C.leaf}" d="M-20 -40 Q-10 -96 10 -40Z"/>
      <path d="M-34 -36 L34 -36 L28 0 L-28 0Z" fill="${C.cream}"/><rect x="-38" y="-44" width="76" height="14" rx="7" fill="#fff"/>
      <path d="M-28 -20 L28 -20" stroke="${C.coral}" stroke-width="6"/>
    </g>
    <!-- mugs on hooks -->
    ${[1730, 1810, 1890].map((x, i) => `
      <path d="M${x} 546 L${x} 566" stroke="${C.inkSoft}" stroke-width="4"/>
      <g transform="translate(${x} 566) rotate(${[8, -4, 6][i]})">
        <path d="M-26 6 L26 6 L22 62 Q20 70 12 70 L-12 70 Q-20 70 -22 62Z" fill="${[C.butter, C.coral, C.tealHi][i]}"/>
        <path d="M24 18 Q46 18 42 38 Q38 54 22 50" stroke="${[C.butterSh, C.coralSh, C.teal][i]}" stroke-width="8" fill="none"/>
      </g>`).join('')}
  </g>`;
}
function wallClock() {
  return `
  <g id="clock" transform="translate(240 190)">
    <circle r="72" fill="${C.teal}"/><circle r="58" fill="${C.cream}"/>
    ${[0, 90, 180, 270].map((a) => { const [x, y] = rot(0, -46, a); return `<circle cx="${f(x)}" cy="${f(y)}" r="6" fill="${C.tealSh}"/>`; }).join('')}
    <path d="M0 0 L0 -36 M0 0 L24 12" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
    <circle r="7" fill="${C.coral}"/>
    <path d="M-40 -50 Q-20 -64 6 -62" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>
  </g>`;
}
function counterClutter() {
  // Background-only dressing on the right counter: utensil crock + cookie jar.
  return `
  <g id="crock" transform="translate(1660 870)">
    <path d="M-16 -86 L-30 -210" stroke="${C.woodSh}" stroke-width="12" stroke-linecap="round"/><ellipse cx="-32" cy="-222" rx="18" ry="26" fill="${C.wood}" transform="rotate(-12 -32 -222)"/>
    <path d="M10 -86 L24 -196" stroke="${C.steelSh}" stroke-width="10" stroke-linecap="round"/><rect x="8" y="-246" width="36" height="50" rx="10" fill="${C.steel}" transform="rotate(8 26 -220)"/>
    <path d="M0 -86 L2 -230" stroke="${C.coral}" stroke-width="12" stroke-linecap="round"/><circle cx="2" cy="-238" r="14" fill="${C.coral}"/>
    <path d="M-50 -100 L50 -100 L42 -8 Q40 0 30 0 L-30 0 Q-40 0 -42 -8Z" fill="${C.cream}"/>
    <path d="M30 -100 L50 -100 L42 -8 Q40 0 30 0 L22 0 Q36 -50 30 -100Z" fill="${C.wallSh}"/>
    <path d="M-46 -64 L46 -64" stroke="${C.teal}" stroke-width="10"/>
  </g>
  <g id="cookiejar" transform="translate(1870 870)">
    <path d="M-70 -120 Q-80 0 -50 0 L50 0 Q80 0 70 -120Z" fill="#E8F6F8" opacity=".92"/>
    <g fill="${C.woodHi}"><circle cx="-30" cy="-30" r="26"/><circle cx="24" cy="-34" r="26"/><circle cx="0" cy="-72" r="26"/></g>
    <g fill="${C.woodSh}"><circle cx="-36" cy="-34" r="4"/><circle cx="-22" cy="-24" r="4"/><circle cx="20" cy="-40" r="4"/><circle cx="32" cy="-28" r="4"/><circle cx="-4" cy="-78" r="4"/><circle cx="8" cy="-66" r="4"/></g>
    <rect x="-50" y="-100" width="12" height="80" rx="6" fill="#fff" opacity=".8"/>
    <rect x="-80" y="-140" width="160" height="26" rx="13" fill="${C.pink}"/><circle cx="0" cy="-150" r="16" fill="${C.pinkSh}"/>
  </g>`;
}
const DEFS = `
  <defs>
    <pattern id="wallpaper" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M40 22 C34 16 26 20 30 28 L40 38 L50 28 C54 20 46 16 40 22Z" fill="${C.wallSh}" opacity=".55"/>
      <circle cx="0" cy="70" r="4" fill="${C.wallSh}" opacity=".55"/><circle cx="80" cy="70" r="4" fill="${C.wallSh}" opacity=".55"/>
    </pattern>
    <pattern id="tiles" width="68" height="45" patternUnits="userSpaceOnUse" x="390" y="610">
      <rect x="3" y="3" width="62" height="39" rx="9" fill="${C.tileHi}" opacity=".55"/>
      <rect x="3" y="30" width="62" height="12" rx="6" fill="${C.tileSh}" opacity=".5"/>
    </pattern>
    <radialGradient id="ovenglow" cx=".5" cy=".85" r=".8">
      <stop offset="0" stop-color="#FFB347" stop-opacity=".85"/><stop offset=".6" stop-color="#FF7A45" stop-opacity=".3"/><stop offset="1" stop-color="#3A3552" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r=".9" fill="${C.ink}" opacity=".05"/><circle cx="6.5" cy="5.5" r=".9" fill="${C.ink}" opacity=".04"/>
    </pattern>
  </defs>`;
function kitchen() {
  return `
  <g id="kitchen">
    ${wall()}
    ${floor()}
    ${bunting()}
    ${wallClock()}
    ${windowArt()}
    ${chalkboard()}
    ${hood()}
    ${shelves()}
    ${counter(410, 1160)}
    ${stove()}
    ${counter(1570, 2060)}
    ${counterClutter()}
    ${fridge()}
    <rect width="${W}" height="${H}" fill="url(#grain)"/>
  </g>`;
}

// ---------------------------------------------------------------------------
// OUTPUT
// ---------------------------------------------------------------------------
const doc = (vb, body, extra = '', size = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size}>\n<style>${CHAR_CSS}</style>${extra}\n${body}\n</svg>\n`;
const write = (name, s) => fs.writeFileSync(path.join(SVG_DIR, name), s);

// Background
write('kitchen-bg.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${DEFS}${kitchen()}</svg>\n`);
// Characters (full rigs, every face included; non-default hidden)
write('zoe.svg', doc('-200 -820 400 840', character(ZOE, zoeParts, ZOE_FACES, { allFaces: true })));
write('ian.svg', doc('-200 -640 400 660', character(IAN, ianParts, IAN_FACES, { allFaces: true })));
// Expression sheets
const exprSheet = (def, parts, faces, w, vb) => {
  const keys = Object.keys(faces);
  return doc(vb, keys.map((k, i) => `<g transform="translate(${i * w} 0)">${character(def, parts, faces, { expr: k, id: `${def.name}-${k}` })}</g>`).join(''));
};
write('zoe-expressions.svg', exprSheet(ZOE, zoeParts, ZOE_FACES, 400, '-200 -820 1200 840'));
write('ian-expressions.svg', exprSheet(IAN, ianParts, IAN_FACES, 400, '-200 -640 1200 660'));
// Props
write('prop-frying-pan.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-245 -50 370 120">${pan()}</svg>\n`);
write('prop-tomato.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-75 -140 150 150">${tomato()}</svg>\n`);
write('prop-tomato-sliced.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -125 225 135">${slicedTomato()}</svg>\n`);
write('prop-cupcake.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-85 -180 170 190">${cupcake()}</svg>\n`);
write('prop-mixing-bowl.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-165 -280 330 290">${bowl()}</svg>\n`);

// ---------------------------------------------------------------------------
// MOCKUP COMPOSITE (2048 x 1536)
// ---------------------------------------------------------------------------
// Zoe: at the stove, frying pan held out over the burner.
const Z = { x: 1250, y: 1450, s: 1.12 };
const zArmR = aim(150, -40); // reach up-right toward the stove
const [zhx, zhy] = handPos(ZOE, 'R', zArmR);
const zPan = `<g transform="translate(${f(zhx + 205)} ${f(zhy - 14)})">${pan(egg(-6, 2))}</g>`;
// Ian: on a step stool at the counter, holding a cupcake up high.
const I = { x: 480, y: 1330, s: 1.1 };
const iArmL = aim(-120, -45);
const [ihx, ihy] = handPos(IAN, 'L', iArmL);
const iCup = `<g transform="translate(${f(ihx - 16)} ${f(ihy + 8)}) rotate(-10)">${cupcake(0.95)}</g>`;
const stool = `
  <g id="stool" transform="translate(480 1470)">
    <ellipse cx="0" cy="0" rx="150" ry="18" fill="${C.ink}" opacity=".12"/>
    <path d="M-120 -140 L120 -140 L130 -4 Q130 4 120 4 L90 4 L80 -70 L-80 -70 L-90 4 L-120 4 Q-130 4 -130 -4Z" fill="${C.butter}"/>
    <path d="M100 -140 L120 -140 L130 -4 Q130 4 120 4 L100 4Z" fill="${C.butterSh}"/>
    <rect x="-134" y="-152" width="268" height="26" rx="13" fill="${C.butterHi}"/>
    <path d="M-30 -110 L30 -110" stroke="${C.butterSh}" stroke-width="10" stroke-linecap="round"/>
  </g>`;
const counterProps = `
  <g transform="translate(760 882) scale(.9)">${bowl()}</g>
  <!-- cutting board with tomatoes -->
  <g transform="translate(1010 880)">
    <rect x="-150" y="-22" width="300" height="26" rx="13" fill="${C.woodSh}"/>
    <rect x="-150" y="-30" width="300" height="24" rx="12" fill="${C.woodHi}"/>
    <circle cx="136" cy="-18" r="6" fill="${C.woodSh}"/>
    <g transform="translate(-70 -26) scale(.85)">${tomato()}</g>
    <g transform="translate(58 -26) scale(.85)">${slicedTomato()}</g>
  </g>
  <g transform="translate(560 870) scale(.7)">${cupcake()}</g><g transform="translate(640 870) scale(.6)">${cupcake()}</g>`;
const steam = `<g fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".7">
  <path d="M${f(zhx + 180)} ${f(zhy - 60)} q-16 -30 0 -60 q16 -30 0 -60"/><path d="M${f(zhx + 240)} ${f(zhy - 50)} q-16 -30 0 -60 q16 -30 0 -60"/></g>`;
const mockBody = `
${DEFS}
${kitchen()}
${counterProps}
${stool}
<g transform="translate(${I.x} ${I.y}) scale(${I.s})">${character(IAN, ianParts, IAN_FACES, { expr: 'surprised', armL: iArmL, armR: -14, headTilt: -5, inHandL: iCup, armLFront: true })}</g>
<g transform="translate(${Z.x} ${Z.y}) scale(${Z.s})">${character(ZOE, zoeParts, ZOE_FACES, { expr: 'happy', armL: 12, armR: zArmR, headTilt: 6, inHandR: zPan + steam })}</g>`;
const mock = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<style>${CHAR_CSS}</style>${mockBody}\n</svg>\n`;
fs.writeFileSync(path.join(HERE, 'mockup.svg'), mock);

// Sheet: characters x expressions + props, for review.
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1536" viewBox="0 0 2048 1536">
<style>${CHAR_CSS}</style>
<rect width="2048" height="1536" fill="${C.cream}"/>
${Object.keys(ZOE_FACES).map((k, i) => `<g transform="translate(${190 + i * 330} 720) scale(.8)">${character(ZOE, zoeParts, ZOE_FACES, { expr: k, id: 'sz' + i, armL: [8, 30, 4][i], armR: [-8, -30, -60][i], headTilt: [0, -4, 6][i] })}</g>`).join('')}
${Object.keys(IAN_FACES).map((k, i) => `<g transform="translate(${1150 + i * 320} 720) scale(.9)">${character(IAN, ianParts, IAN_FACES, { expr: k, id: 'si' + i, armLFront: i === 1, armL: [30, 130, 10][i], armR: [-30, -130, -10][i], headTilt: [4, 0, -6][i] })}</g>`).join('')}
<g transform="translate(300 1180)">${pan(egg(0, 2))}</g>
<g transform="translate(620 1180)">${tomato()}</g>
<g transform="translate(860 1180)">${slicedTomato()}</g>
<g transform="translate(1100 1180)">${cupcake()}</g>
<g transform="translate(1400 1180)">${bowl()}</g>
<g transform="translate(1760 1180)">${slice(60)}</g>
</svg>\n`;
fs.writeFileSync(path.join(HERE, 'sheet.svg'), sheet);
console.log('ok');
