// Body types and base body parts for the character rig (docs/rig.md).
// Art units, feet at y = 0, +y down. Limbs are 2-segment capsules drawn along
// +y from their joint; the rig rotates them (see src/engine/rig-svg.js).
import { f, rrect } from '../ink.mjs';

// hipY: pelvis (root joint) height. hipX: hip joints at +-hipX.
// thigh/shin: segment lengths (hip->knee->ankle). legR: leg radius.
// shoulder: [x, y] of the right shoulder (mirrored for left), absolute y.
// upper/lower: arm segments (shoulder->elbow->hand centre). armR, handR.
// torso: top y, hem y, top half-width, hem half-width. neck: [halfW, top y].
// head: centre y, rx, ry (chin = cy + ry). face: eye x/y, nose y, mouth y, eye size.
export const BODIES = {
  kid5: {
    label: 'child ~5', hipY: -76, hipX: 19, thigh: 28, shin: 28, legR: 12,
    shoulder: [42, -168], upper: 36, lower: 36, armR: 11, handR: 15,
    torso: { top: -182, hem: -100, tw: 38, bw: 52 }, neck: [12, -192],
    head: { cy: -252, rx: 80, ry: 76 }, face: { ex: 30, ey: 12, ny: 30, my: 44, eyeRx: 8.5, eyeRy: 11, blushX: 50, blushY: 32 },
    shadow: 60, foot: { len: 36, h: 26 },
  },
  kid9: {
    label: 'child ~9', hipY: -128, hipX: 21, thigh: 54, shin: 50, legR: 15,
    shoulder: [46, -206], upper: 42, lower: 42, armR: 11, handR: 16,
    torso: { top: -218, hem: -120, tw: 42, bw: 58 }, neck: [13, -238],
    head: { cy: -300, rx: 82, ry: 80 }, face: { ex: 31, ey: 10, ny: 28, my: 42, eyeRx: 8.5, eyeRy: 11, blushX: 52, blushY: 30 },
    shadow: 66, foot: { len: 40, h: 30 },
  },
  teen: {
    label: 'teen ~14', hipY: -174, hipX: 24, thigh: 76, shin: 72, legR: 17,
    shoulder: [50, -290], upper: 56, lower: 58, armR: 12, handR: 16,
    torso: { top: -310, hem: -168, tw: 44, bw: 58 }, neck: [14, -332],
    head: { cy: -390, rx: 78, ry: 78 }, face: { ex: 29, ey: 10, ny: 29, my: 44, eyeRx: 8, eyeRy: 10.5, blushX: 50, blushY: 34 },
    shadow: 68, foot: { len: 42, h: 30 },
  },
  adult: {
    label: 'adult', hipY: -214, hipX: 27, thigh: 96, shin: 92, legR: 20,
    shoulder: [56, -352], upper: 68, lower: 70, armR: 13, handR: 17,
    torso: { top: -374, hem: -206, tw: 48, bw: 64 }, neck: [15, -396],
    head: { cy: -452, rx: 74, ry: 78 }, face: { ex: 28, ey: 10, ny: 30, my: 46, eyeRx: 7.5, eyeRy: 10, blushX: 48, blushY: 36 },
    shadow: 72, foot: { len: 44, h: 32 },
  },
  // Grandparents: a little shorter and rounder than a grown-up.
  elder: {
    label: 'grandparent', hipY: -200, hipX: 28, thigh: 88, shin: 84, legR: 20,
    shoulder: [56, -330], upper: 64, lower: 66, armR: 13, handR: 17,
    torso: { top: -350, hem: -192, tw: 50, bw: 70 }, neck: [15, -372],
    head: { cy: -426, rx: 76, ry: 78 }, face: { ex: 28, ey: 10, ny: 30, my: 46, eyeRx: 7.5, eyeRy: 10, blushX: 48, blushY: 36 },
    shadow: 76, foot: { len: 44, h: 32 },
  },
};

// ---------------------------------------------------------------------------
// Limb segments. A limb layer (skin, a sleeve, a trouser leg) is three
// fragments, drawn in this order so the bent joint has no seam:
//   upper  closed capsule in the upper segment frame (full outline)
//   lower  capsule with an OPEN top in the lower segment frame: fill, then an
//          outline along the two sides and the far end only
//   patch  fill-only capsule end in the upper frame, inset by half the ink
//          width: it hides the lower segment's outline stubs inside the upper
// y0/y1 let a layer cover part of a segment (a short sleeve covers 0..0.6).
// ---------------------------------------------------------------------------
const INSET = 2.4;   // half the ink width in art units

/** Closed capsule from y0 to y1 along +y, radius r (flat caps if cap0/cap1 false). */
export function capsule(y0, y1, r, cls, { cap0 = true, cap1 = true } = {}) {
  const top = cap0 ? `M${-r} ${f(y0)} A${r} ${r} 0 0 1 ${r} ${f(y0)}` : `M${-r} ${f(y0)} L${r} ${f(y0)}`;
  const bot = cap1 ? `L${r} ${f(y1)} A${r} ${r} 0 0 1 ${-r} ${f(y1)}` : `L${r} ${f(y1)} L${-r} ${f(y1)}`;
  return `<path class="${cls}" d="${top} ${bot}Z"/>`;
}

/** Lower segment: fill with a flat top at y=0, outline only on the sides and the far end. */
export function openCapsule(y1, r, cls, { cap1 = true } = {}) {
  const end = cap1 ? `A${r} ${r} 0 0 1 ${-r} ${f(y1)}` : `L${-r} ${f(y1)}`;
  return `<path class="${cls} fo" d="M${-r} 0 L${r} 0 L${r} ${f(y1)} ${end}Z"/><path fill="none" d="M${r} 0 L${r} ${f(y1)} ${end} L${-r} 0"/>`;
}

/** Fill-only patch over the joint end of the upper segment. */
export function patch(len, r, cls) {
  const rr = r - INSET, y0 = Math.max(0, len - r * 2.2);
  return `<path class="${cls} fo" d="M${-rr} ${f(y0)} L${rr} ${f(y0)} L${rr} ${f(len)} A${rr} ${rr} 0 0 1 ${-rr} ${f(len)}Z"/>`;
}

/**
 * Knee cap for a foreshortened thigh (sitting: the knee points at the
 * viewer). Lower-segment frame: a dome over the knee point, a little wider
 * than the shin (nearer = bigger), easing into the shin's sides. Outline on
 * the dome and the sides only, so it reads as the top of the shin coming
 * toward you, never as a crease. rig-svg draws it instead of the patch when
 * the pose has legsFront.
 */
export function kneeCap(r, cls) {
  const R = r * 1.22, y1 = r * 2;
  const sides = `M${-r} ${f(y1)} C${-r} ${f(y1 * .55)} ${f(-R)} ${f(r * .45)} ${f(-R)} 0 A${f(R)} ${f(R)} 0 0 1 ${f(R)} 0 C${f(R)} ${f(r * .45)} ${r} ${f(y1 * .55)} ${r} ${f(y1)}`;
  return `<path class="${cls} fo" d="${sides}Z"/><path fill="none" d="${sides}"/>`;
}

/** A full limb layer: {upper, lower, patch, knee} fragments. */
export function limbLayer(upperLen, lowerLen, r, cls, { upperFrom = 0, lowerTo = null, lowerCap = true } = {}) {
  const lt = lowerTo == null ? lowerLen : lowerTo;
  return {
    upper: capsule(upperFrom, upperLen, r, cls, { cap0: true }),
    lower: openCapsule(lt, r, cls, { cap1: lowerCap }),
    patch: patch(upperLen, r, cls),
    knee: kneeCap(r, cls),
  };
}

// ---------------------------------------------------------------------------
// Base (unclothed) parts. A bare torso is skin; kids always wear a top in the
// starter cast, but the rig must render without one.
// ---------------------------------------------------------------------------
/** Rounded trapezoid torso path from y top to y bot, half-widths tw (top), bw (bottom). */
export function torsoPath(top, bot, tw, bw, round = 12) {
  const sw = tw + (bw - tw) * 0.18;
  return `M${-tw} ${top} Q${-sw - 12} ${top + 2} ${-sw - 14} ${top + 18} L${-bw} ${bot - round} Q${-bw} ${bot} ${-bw + round} ${bot} L${bw - round} ${bot} Q${bw} ${bot} ${bw} ${bot - round} L${sw + 14} ${top + 18} Q${sw + 12} ${top + 2} ${tw} ${top}Z`;
}

/** Base part fragments for a body type. Frames: torso/root in pelvis space
 *  (y relative to the pelvis), head in head-centre space, limbs along +y. */
export function baseParts(b) {
  const rel = (y) => y - b.hipY;       // absolute (feet) y -> pelvis-relative
  const T = b.torso;
  const [nw, ny] = b.neck;
  const chinRel = rel(b.head.cy + b.head.ry);
  const ankle = b.shin;
  return {
    torso: `<rect class="skin" x="${-nw}" y="${rel(ny)}" width="${nw * 2}" height="${f(rel(T.top) - rel(ny) + 20)}" rx="8"/>`
      + `<path class="skin" d="${torsoPath(rel(T.top), rel(T.hem), T.tw, T.bw)}"/>`,
    pelvis: `<path class="skin" d="${rrect(-(b.hipX + b.legR), -b.legR * 1.2, (b.hipX + b.legR) * 2, b.legR * 2.4, b.legR)}"/>`,
    arm: limbLayer(b.upper, b.lower - b.handR * 0.4, b.armR, 'skin'),
    leg: limbLayer(b.thigh, ankle, b.legR, 'skin', { lowerCap: false }),
    // hand: mitten, drawn centred on the hand point; thumb detail faces the body (authored for the right side)
    hand: `<circle class="skin" cx="0" cy="0" r="${b.handR}"/><path class="d" d="M${f(-b.handR * .55)} ${f(-b.handR * .3)} q-4 8 2 12"/>`,
    // bare foot (a sock-coloured nub; shoes replace it), authored for the right side: toe points +x
    foot: `<path class="sock" d="M${-b.legR} ${-4} L${-b.legR} ${b.foot.h - 10} Q${-b.legR} ${b.foot.h - 2} ${-b.legR + 8} ${b.foot.h - 2} L${b.foot.len - 6} ${b.foot.h - 2} Q${b.foot.len} ${b.foot.h - 2} ${b.foot.len} ${b.foot.h - 10} Q${b.foot.len} ${-2} ${b.legR} ${-4}Z"/>`,
    ears: [-1, 1].map((s) => `<ellipse class="skin" cx="${s * (b.head.rx - 2)}" cy="${f(b.head.ry * .14)}" rx="13" ry="17"/><path class="d" d="M${s * (b.head.rx + 3)} ${f(b.head.ry * .06)} q${s * 5} 8 ${s * -1} 16"/>`).join(''),
    head: `<path class="skin" d="${headShape(b.head.rx, b.head.ry)}"/>`,
    chinRel,
  };
}

export function headShape(rx, ry) {
  return `M0 ${-ry} C${f(rx * .62)} ${-ry} ${rx} ${f(-ry * .6)} ${rx} ${f(-ry * .02)} C${rx} ${f(ry * .6)} ${f(rx * .6)} ${ry} 0 ${ry} C${f(-rx * .6)} ${ry} ${-rx} ${f(ry * .6)} ${-rx} ${f(-ry * .02)} C${-rx} ${f(-ry * .6)} ${f(-rx * .62)} ${-ry} 0 ${-ry}Z`;
}

/** Skeleton numbers the runtime FK needs (pelvis-relative where noted). */
export function skeleton(b) {
  const rel = (y) => y - b.hipY;
  return {
    hipY: b.hipY, hip: [b.hipX, 0], thigh: b.thigh, shin: b.shin,
    shoulder: [b.shoulder[0], rel(b.shoulder[1])], upper: b.upper, lower: b.lower,
    chin: [0, rel(b.head.cy + b.head.ry)], headRy: b.head.ry,
    handR: b.handR, legR: b.legR, armR: b.armR,
    mouth: [0, b.face.my], eyes: [b.face.ex, b.face.ey],
    height: -(b.head.cy - b.head.ry), shadow: b.shadow, halfW: b.torso.bw,
  };
}
