// Palette and line CSS for all "our town" art (docs/STYLE.md section 3).
// Names match the style guide table. Muted, warm, earthy; one optional flat
// shade per family. Saturated colours belong to UI buttons only.

export const P = {
  ink: '#3D2C29',
  white: '#FFFFFF', cream: '#FBF3E8', oat: '#EFE4D6', warmGrey: '#C9BDB3', warmGreyDeep: '#9E918A',
  brick: '#EECAB8', mortar: '#F6E3D8', brickDeep: '#E7BBA7',
  floor: '#E7BFA3', floorLine: '#D2A184',
  wood: '#DDAF87', woodLight: '#EDCBA9', woodDeep: '#C39068', woodDark: '#9C6C4C',
  rose: '#E9AFAE', roseDeep: '#D48C8E', blush: '#F6D3CF',
  terra: '#D98B64', terraDeep: '#BC6E4C', peach: '#F4C7A6',
  butter: '#F4DC98', mustard: '#DFB050', mustardDeep: '#C4933A',
  sage: '#B9CDA4', sageDeep: '#93AE85', leaf: '#79A86D', leafDeep: '#55875A', leafLight: '#A3C98F',
  mint: '#CFE5DA', teal: '#8CBDB8', tealDeep: '#679E9C',
  sky: '#CBE6F1', skyDeep: '#A5D0E3', blue: '#A3BEDC', blueDeep: '#7F9FC4',
  lav: '#D5C8E3', plum: '#9A7A98', plumDeep: '#7E6180',
  char: '#57515A', charDeep: '#433E46', charHi: '#6C6670',
  steel: '#D8DADC', steelDeep: '#B2B6BA',
  glass: '#E9F4F1', choc: '#8A5B45', crust: '#E2A860', toast: '#F1D19B',
  berry: '#DC6B6E', lemon: '#F3D46A', egg: '#FFFDF6', banana: '#F5DB7A', bananaDeep: '#D9B94F',
  chalk: '#56645D',
  denim: '#7F9FC4', denimDeep: '#6886AE', brown: '#8C6E5C', brownDeep: '#735746',
  mouth: '#9C4852', tongue: '#EE9A9C',
  nightSky: '#3A4170', nightSkyDeep: '#2E3460',   // the city map at night (rooms/city.mjs)
};

// UI buttons are the only saturated colours in the game.
export const UI = { tangerine: '#F79A4B', grass: '#62B96B', sky: '#4AA6E0', sun: '#FFD552', grape: '#A77BD6' };

// Skin tones: [base, shade]. Hair: [base, shade].
export const SKINS = {
  s1: ['#F3D0B5', '#E2AB8E'], s2: ['#EDC3A2', '#D9A07F'], s3: ['#D39A6E', '#B97E55'],
  s4: ['#A8714D', '#8C5A3B'], s5: ['#7E5236', '#65402A'],
};
export const HAIRS = {
  black: ['#3A2A2C', '#55403F'], brown: ['#6A4A3A', '#523729'], copper: ['#C9713F', '#A95A31'],
  honey: ['#E0B872', '#C49A55'], grey: ['#B8B0AA', '#9A918B'],
};

// Line weights. All art is AUTHORED on the style-v2 convention: a 4.5 unit
// ink outline in "art units" (style-v2 scene px). One art unit is ART_SCALE
// world units (the 1440 x 1000 stage, where 1 CSS px = 1 world unit before
// the stage scale). Output code multiplies every stroke width by k:
//   live SVG in the world (characters):      k = ART_SCALE           (ink 3.15 CSS px)
//   rasters at R pixels per world unit:      k = ART_SCALE * R
export const ART_SCALE = 0.7;
export const INK_W = 4.5;          // art units

/** The outline CSS for a stroke scale k (see above). Plain numbers, no var()/calc(). */
export function css(k = 1) {
  const w = (n) => +(n * k).toFixed(2);
  return `.o path,.o rect,.o circle,.o ellipse,.o polygon,.o polyline,.o line{stroke:${P.ink};stroke-width:${w(INK_W)};stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.o .d{fill:none;stroke-width:${w(3)}}
.o .thin{stroke-width:${w(3)}}
.o .n,.o .n *{stroke:none}
.o .tl{fill:none;stroke-width:${w(3)}}
.o .ink{fill:${P.ink};stroke:none}
.o .fo{stroke:none}
.skin{fill:var(--skin)}.skin-sh{fill:var(--skin-sh)}.hair{fill:var(--hair)}.hair-sh{fill:var(--hair-sh)}
.top{fill:var(--top)}.top-sh{fill:var(--top-sh)}.top-2{fill:var(--top-2)}
.bot{fill:var(--bot)}.bot-sh{fill:var(--bot-sh)}.sock{fill:var(--sock)}
.shoe{fill:var(--shoe)}.shoe-sh{fill:var(--shoe-sh)}
.hat{fill:var(--hat)}.hat-sh{fill:var(--hat-sh)}.hat-2{fill:var(--hat-2)}
.back{fill:var(--back)}.back-sh{fill:var(--back-sh)}.back-2{fill:var(--back-2)}
.over{fill:var(--over)}.over-sh{fill:var(--over-sh)}.over-2{fill:var(--over-2)}
.face{fill:var(--face)}.face-sh{fill:var(--face-sh)}`;
}

/** Scale every inline stroke-width in authored SVG text by k (see css()). */
export function scaleStrokes(svg, k) {
  if (k === 1) return svg;
  return svg.replace(/stroke-width(:|=")\s*([\d.]+)/g, (m, sep, n) => `stroke-width${sep}${+(n * k).toFixed(2)}`);
}
