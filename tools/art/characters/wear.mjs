// Outfit pieces (wear slots, docs/rig.md "Wear"). Every piece is generated
// per body type from the skeleton numbers, so one piece fits every body.
// Fragments and the frame each is drawn in:
//   back    torso frame, drawn first (behind legs, body and arms): capes
//   pelvis  root frame, after the legs: waistbands, skirts, shorts tops
//   torso   torso frame, after the bare torso: shirts, aprons, cape ties
//   arm     {upper, lower, patch} on both arms (see body.mjs limbLayer)
//   leg     {upper, lower, patch} on both legs
//   foot    foot frame, replaces the bare foot (authored for the right foot)
//   head    head-centre frame: hats (slot hat) and glasses/masks (slot face)
// Colours are CSS custom properties named after the slot (--top, --top-sh,
// --top-2, ...), so the same piece recolours per character.
import { P } from '../palette.mjs';
import { f, tl, star, heart, scallop, rrect } from '../ink.mjs';
import { capsule, limbLayer, torsoPath } from './body.mjs';

const rel = (b, y) => y - b.hipY;

function sleeveShort(b, cls, len = 0.58) {
  const r = b.armR + 7, S = f(b.upper * len);
  return { upper: `<path class="${cls}" d="M${-r} -4 Q0 ${-r - 14} ${r} -4 L${r - 1} ${S} Q0 ${S + 6} ${-r + 1} ${S}Z"/>`, lower: '', patch: '' };
}
function sleeveLong(b, cls, cuff) {
  const r = b.armR + 5, end = b.lower - b.handR * 0.95;
  const L = limbLayer(b.upper, b.lower, r, cls, { lowerTo: end, lowerCap: false });
  L.upper = `<path class="${cls}" d="M${-r - 2} -2 Q0 ${-r - 14} ${r + 2} -2 L${r} ${b.upper} A${r} ${r} 0 0 1 ${-r} ${b.upper}Z"/>`;
  L.lower += `<rect class="${cuff}" x="${-r - 1}" y="${f(end - 9)}" width="${2 * r + 2}" height="11" rx="4"/>`;
  return L;
}
function trouserLegs(b, cls, { full = true, hemCls = null } = {}) {
  const r = b.legR + 2;
  if (!full) {
    return { upper: capsule(-4, b.thigh * 0.72, r + 3, cls, { cap1: false }), lower: '', patch: '' };
  }
  const L = limbLayer(b.thigh, b.shin, r, cls, { lowerTo: b.shin - 6, lowerCap: false });
  if (hemCls) L.lower += `<rect class="${hemCls}" x="${-r - 1}" y="${b.shin - 14}" width="${2 * r + 2}" height="10" rx="4"/>`;
  return L;
}
const waist = (b, cls, h = 1.3) => {
  const w = b.hipX + b.legR + 4, top = -b.legR * 1.5;
  return `<path class="${cls}" d="${rrect(-w, top, w * 2, b.legR * (1.5 + h), 10)}"/>`;
};

// ---------------------------------------------------------------------------
export const WEAR = {
  // ---- tops ----
  'tee-star': {
    slot: 'top', label: 'star tee', colors: { top: P.blue, 'top-sh': P.blueDeep, 'top-2': P.butter },
    gen: (b) => {
      const T = b.torso, t = rel(b, T.top), h = rel(b, T.hem), cy = (t + h) / 2 + 4;
      const R = Math.min(24, (T.tw) * 0.55);
      return {
        torso: `<path class="top" d="${torsoPath(t, h, T.tw, T.bw)}"/><path class="d" d="M-16 ${t} Q0 ${t + 14} 16 ${t}"/>`
          + `<path class="top-2 thin" d="${star(0, cy, R, R * .46)}"/>`,
        arm: sleeveShort(b, 'top'),
      };
    },
  },
  'tee-stripe': {
    slot: 'top', label: 'striped tee', colors: { top: P.sage, 'top-sh': P.sageDeep, 'top-2': P.cream },
    gen: (b) => {
      const T = b.torso, t = rel(b, T.top), h = rel(b, T.hem);
      const n = 4, gap = (h - t) / (n + 1);
      const sw = T.tw + (T.bw - T.tw) * 0.18 + 14;
      const hw = (y) => sw + (T.bw - sw) * Math.max(0, (y - t - 18) / (h - t - 18)) - 3;
      const stripes = [...Array(n)].map((_, i) => { const y = t + gap * (i + 1) + 6; return `M${f(-hw(y))} ${f(y)} L${f(hw(y))} ${f(y)}`; }).join(' ');
      return {
        torso: `<path class="top" d="${torsoPath(t, h, T.tw, T.bw)}"/>`
          + `<path class="tl" style="stroke:var(--top-2);stroke-width:7;stroke-linecap:butt" d="${stripes}"/>`
          + `<path class="top-2 thin" d="M-22 ${t - 1} Q-16 ${t + 18} 0 ${t + 12} Q16 ${t + 18} 22 ${t - 1} Q0 ${t + 8} -22 ${t - 1}Z"/>`,
        arm: (() => { const s = sleeveShort(b, 'top'); const r = b.armR + 7; s.upper += `<path class="tl" style="stroke:var(--top-2);stroke-width:6" d="M${-r + 3} ${f(b.upper * .3)} L${r - 3} ${f(b.upper * .3)}"/>`; return s; })(),
      };
    },
  },
  cardigan: {
    slot: 'top', label: 'cardigan', colors: { top: P.mustard, 'top-sh': P.mustardDeep, 'top-2': P.cream },
    gen: (b) => {
      const T = b.torso, t = rel(b, T.top), h = rel(b, T.hem) + 6, pw = T.tw * 0.42;
      const btn = [0.25, 0.5, 0.75].map((k) => `<circle class="thin" fill="${P.cream}" cx="${f(-pw * .9)}" cy="${f(t + (h - t) * k)}" r="4.5"/>`).join('');
      const pk = (s) => `<path class="d" d="M${s * (T.bw - 4)} ${f(h - 50)} L${s * (T.bw - 26)} ${f(h - 50)} L${s * (T.bw - 26)} ${f(h - 24)} L${s * (T.bw - 4)} ${f(h - 24)}"/>`;
      const ribs = [...Array(7)].map((_, i) => `M${f(-T.bw + 8 + i * ((2 * T.bw - 16) / 6))} ${h - 14} L${f(-T.bw + 8 + i * ((2 * T.bw - 16) / 6))} ${h - 3}`).join(' ');
      return {
        torso: `<path class="top" d="${torsoPath(t, h, T.tw, T.bw + 4)}"/>`
          + `<path class="top-2" d="M${-pw} ${t} L${pw} ${t} L${f(pw * .6)} ${h} L${f(-pw * .6)} ${h}Z"/><path class="d" d="M${-pw} ${t} Q0 ${t + 16} ${pw} ${t}"/>`
          + btn + pk(-1) + pk(1) + `<path ${tl('var(--top-sh)')} d="${ribs}"/>`,
        arm: sleeveLong(b, 'top', 'top-sh'),
      };
    },
  },
  // ---- bottoms ----
  pants: {
    slot: 'bottom', label: 'long trousers', colors: { bot: P.denim, 'bot-sh': P.denimDeep },
    gen: (b) => ({ pelvis: waist(b, 'bot') + `<path class="d" d="M0 ${-b.legR * .6} L0 ${f(b.legR * 1.2)}"/>`, leg: trouserLegs(b, 'bot', { hemCls: 'bot-sh' }) }),
  },
  leggings: {
    slot: 'bottom', label: 'leggings', colors: { bot: P.plum, 'bot-sh': P.plumDeep },
    gen: (b) => ({ pelvis: waist(b, 'bot', 1.0), leg: trouserLegs(b, 'bot') }),
  },
  shorts: {
    slot: 'bottom', label: 'shorts', colors: { bot: P.mustard, 'bot-sh': P.mustardDeep },
    gen: (b) => ({ pelvis: waist(b, 'bot', 1.4) + `<path class="d" d="M0 ${-b.legR * .4} L0 ${f(b.legR * 1.3)}"/>`, leg: trouserLegs(b, 'bot', { full: false }) }),
  },
  skirt: {
    slot: 'bottom', label: 'skirt', colors: { bot: P.rose, 'bot-sh': P.roseDeep },
    gen: (b) => {
      const w = b.hipX + b.legR + 4, top = -b.legR * 1.5, bot = f(b.thigh * 0.62), fw = w + b.thigh * 0.32;
      return {
        pelvis: `<path class="bot" d="M${-w} ${top} L${w} ${top} L${f(fw)} ${bot - 8} Q${f(fw)} ${bot} ${f(fw - 8)} ${bot} L${f(-fw + 8)} ${bot} Q${f(-fw)} ${bot} ${f(-fw)} ${bot - 8}Z"/>`
          + `<path class="d" d="M${f(-w * .4)} ${top + 10} L${f(-fw * .5)} ${bot - 4} M${f(w * .4)} ${top + 10} L${f(fw * .5)} ${bot - 4}"/>`
          + `<rect class="bot-sh" x="${-w}" y="${top}" width="${w * 2}" height="10" rx="4"/>`,
      };
    },
  },
  // ---- over (worn on top of the top) ----
  apron: {
    slot: 'over', label: 'apron', colors: { over: P.rose, 'over-sh': P.roseDeep, 'over-2': P.cream },
    gen: (b) => {
      const T = b.torso, t = rel(b, T.top), h = rel(b, T.hem), bw = T.tw * 0.7, sw = T.bw + 5;
      const bibTop = f(t + 18), waistY = f(t + (h - t) * 0.42), bot = f(h + (h - t) * 0.27);
      const dots = [[-.75, .82], [.68, .9], [-.14, .3], [.3, .44], [.8, .62], [-.8, .6], [0, .95]]
        .map(([x, y]) => `<circle cx="${f(x * sw)}" cy="${f(bibTop + (bot - bibTop) * y)}" r="3.5"/>`).join('');
      const pw = Math.min(24, T.tw * .5), py = f(h - 20);
      return {
        torso: `<path class="over" d="M${-bw} ${bibTop} L${bw} ${bibTop} L${bw + 2} ${waistY} L${sw - 6} ${waistY} Q${sw} ${waistY} ${sw + 1} ${waistY + 6} L${sw + 5} ${bot - 8} Q${sw + 5} ${bot} ${sw - 3} ${bot} L${-sw + 3} ${bot} Q${-sw - 5} ${bot} ${-sw - 5} ${bot - 8} L${-sw - 1} ${waistY + 6} Q${-sw} ${waistY} ${-sw + 6} ${waistY} L${-bw - 2} ${waistY}Z"/>`
          + `<path class="over" d="M${-bw} ${bibTop} L${-bw + 6} ${t - 2} L${-bw + 14} ${t} L${-bw + 8} ${bibTop}Z"/><path class="over" d="M${bw} ${bibTop} L${bw - 6} ${t - 2} L${bw - 14} ${t} L${bw - 8} ${bibTop}Z"/>`
          + `<rect class="over-sh" x="${-sw - 1}" y="${waistY - 4}" width="${2 * sw + 2}" height="12" rx="6"/>`
          + `<g class="n" style="fill:var(--over-2)">${dots}</g>`
          + `<rect class="over-2 thin" x="${-pw}" y="${f(py - pw * 1.25)}" width="${pw * 2}" height="${f(pw * 1.3)}" rx="7"/>${heart(0, f(py - pw * .62), pw / 22, P.berry)}`,
      };
    },
  },
  // ---- back ----
  'towel-cape': {
    slot: 'back', label: 'towel cape', colors: { back: P.terra, 'back-sh': P.terraDeep, 'back-2': P.cream },
    gen: (b) => {
      const t = rel(b, b.torso.top) + 4, bot = f(b.thigh * 0.9 + b.legR), w0 = b.torso.tw - 6, w1 = b.torso.bw + b.thigh * 0.55;
      const fr = [...Array(11)].map((_, i) => { const x = f(-w1 + 10 + i * ((2 * w1 - 20) / 10)); return `M${x} ${bot} L${x - 1} ${bot + 12}`; }).join(' ');
      return {
        back: `<path class="back" d="M${-w0} ${t} L${w0} ${t} Q${w0 + 18} ${t + 8} ${w0 + 22} ${t + 30} L${w1} ${bot - 10} Q${w1 + 2} ${bot} ${w1 - 8} ${bot} L${-w1 + 8} ${bot} Q${-w1 - 2} ${bot} ${-w1} ${bot - 10} L${-w0 - 22} ${t + 30} Q${-w0 - 18} ${t + 8} ${-w0} ${t}Z"/>`
          + `<path class="back-2 fo" d="M${-w1 + 4} ${bot - 34} L${w1 - 4} ${bot - 34} L${w1 - 3} ${bot - 26} L${-w1 + 3} ${bot - 26}Z M${-w1 + 2} ${bot - 20} L${w1 - 2} ${bot - 20} L${w1 - 1} ${bot - 14} L${-w1 + 1} ${bot - 14}Z"/>`
          + `<path class="d" d="${fr}"/>`,
        torso: `<circle class="back" cx="${-b.neck[0] - 4}" cy="${t - 2}" r="8"/><circle class="back" cx="${b.neck[0] + 4}" cy="${t - 2}" r="8"/>`,
      };
    },
  },
  'hero-cape': {
    slot: 'back', label: 'hero cape', colors: { back: P.berry, 'back-sh': '#B9575B', 'back-2': P.butter },
    gen: (b) => {
      const t = rel(b, b.torso.top) + 2, bot = f(b.thigh + b.shin * 0.6), w0 = b.torso.tw - 4, w1 = b.torso.bw + b.thigh * 0.7;
      const hem = [...Array(5)].map((_, i) => { const x0 = w1 - i * (2 * w1 / 5), x1 = x0 - 2 * w1 / 5; return `Q${f((x0 + x1) / 2)} ${bot + 16} ${f(x1)} ${bot}`; }).join(' ');
      return {
        back: `<path class="back" d="M${-w0} ${t} L${w0} ${t} Q${w0 + 16} ${t + 20} ${w1} ${bot} ${hem} Q${-w0 - 16} ${t + 20} ${-w0} ${t}Z"/>`
          + `<path class="back-sh fo" d="M${f(-w1 * .5)} ${bot - 4} Q${f(-w1 * .3)} ${f((t + bot) / 2)} ${-w0 + 10} ${t + 16} L${-w0 + 18} ${t + 16} Q${f(-w1 * .2)} ${f((t + bot) / 2)} ${f(-w1 * .3)} ${bot + 4}Z"/>`,
        torso: `<path class="back" d="M${-w0 - 6} ${t - 4} L${-b.neck[0] - 2} ${t + 16} L${-b.neck[0] - 12} ${t + 2}Z"/><path class="back" d="M${w0 + 6} ${t - 4} L${b.neck[0] + 2} ${t + 16} L${b.neck[0] + 12} ${t + 2}Z"/>`
          + `<circle class="back-2 thin" cx="0" cy="${t + 4}" r="8"/>`,
      };
    },
  },
  // ---- hats (head-centre space) ----
  beanie: {
    slot: 'hat', label: 'knit beanie', hides: ['top'], colors: { hat: P.teal, 'hat-sh': P.tealDeep, 'hat-2': P.cream },
    gen: (b) => {
      const { rx, ry } = b.head, bw = rx + 10, by = f(-ry * .46);
      return {
        head: `<path class="hat" d="M${-rx - 4} ${by} C${-rx - 8} ${f(-ry * 1.2)} ${f(-rx * .54)} ${f(-ry * 1.5)} 0 ${f(-ry * 1.5)} C${f(rx * .54)} ${f(-ry * 1.5)} ${rx + 8} ${f(-ry * 1.2)} ${rx + 4} ${by}Z"/>`
          + `<path class="hat-2" d="${scallop(0, f(-ry * 1.54), 17, 15, 8, 5)}"/>`
          + `<rect class="hat-sh" x="${-bw}" y="${f(by - 14)}" width="${bw * 2}" height="30" rx="14"/>`
          + `<path ${tl('var(--hat-sh)')} d="${[-.8, -.6, -.4, -.2, 0, .2, .4, .6, .8].map((k) => `M${f(k * bw)} ${f(by - 10)} L${f(k * bw)} ${f(by + 12)}`).join(' ')}"/>`
          + `<path class="d" d="M${f(-rx * .54)} ${f(-ry * .96)} Q${f(-rx * .4)} ${f(-ry * 1.18)} ${f(-rx * .16)} ${f(-ry * 1.26)}"/>`,
      };
    },
  },
  'chef-hat': {
    slot: 'hat', label: 'chef hat', hides: ['top'], colors: { hat: P.white, 'hat-sh': P.oat, 'hat-2': P.cream },
    gen: (b) => {
      const { rx, ry } = b.head, bw = rx * .8, by = f(-ry * .62);
      return {
        head: `<path class="hat" d="${scallop(0, f(-ry * 1.28), rx * .92, ry * .52, 9, 12)}"/>`
          + `<rect class="hat" x="${f(-bw)}" y="${f(by - 30)}" width="${f(bw * 2)}" height="36" rx="10"/>`
          + `<path class="d" d="M${f(-bw * .4)} ${f(by - 30)} Q${f(-bw * .5)} ${f(-ry * 1.1)} ${f(-bw * .3)} ${f(-ry * 1.3)} M${f(bw * .4)} ${f(by - 30)} Q${f(bw * .5)} ${f(-ry * 1.1)} ${f(bw * .3)} ${f(-ry * 1.3)}"/>`,
      };
    },
  },
  crown: {
    slot: 'hat', label: 'play crown', colors: { hat: P.mustard, 'hat-sh': P.mustardDeep, 'hat-2': P.berry },
    gen: (b) => {
      const { rx, ry } = b.head, w = rx * .62, y0 = f(-ry * .78), y1 = f(-ry * 1.28);
      return {
        head: `<path class="hat" d="M${f(-w)} ${y0} L${f(-w - 4)} ${y1} L${f(-w * .5)} ${f(y1 + 22)} L0 ${f(y1 - 8)} L${f(w * .5)} ${f(y1 + 22)} L${f(w + 4)} ${y1} L${f(w)} ${y0}Z"/>`
          + `<circle class="hat-2 thin" cx="0" cy="${f(y0 - 14)}" r="7"/><circle class="thin" fill="${P.teal}" cx="${f(-w * .6)}" cy="${f(y0 - 12)}" r="5"/><circle class="thin" fill="${P.teal}" cx="${f(w * .6)}" cy="${f(y0 - 12)}" r="5"/>`
          + [-1, 0, 1].map((k) => `<circle class="thin" fill="${P.cream}" cx="${f(k * (w + 4))}" cy="${f(y1 - (k ? 0 : 8))}" r="5"/>`).join(''),
      };
    },
  },
  headband: {
    slot: 'hat', label: 'headband', colors: { hat: P.rose, 'hat-sh': P.roseDeep, 'hat-2': P.cream },
    gen: (b) => {
      const { rx, ry } = b.head, k = rx / 82, m = ry / 80;
      return { head: `<path class="hat" d="M${f(-76 * k)} ${f(-40 * m)} C${f(-66 * k)} ${f(-86 * m)} ${f(66 * k)} ${f(-86 * m)} ${f(76 * k)} ${f(-40 * m)} L${f(66 * k)} ${f(-36 * m)} C${f(56 * k)} ${f(-72 * m)} ${f(-56 * k)} ${f(-72 * m)} ${f(-66 * k)} ${f(-36 * m)}Z"/>` };
    },
  },
  // ---- face accessories (head-centre space, uses the eye metrics) ----
  glasses: {
    slot: 'face', label: 'round glasses', colors: { face: 'none', 'face-sh': P.ink },
    gen: (b) => {
      const { ex, ey } = b.face, r = Math.round(ex * .7);
      return { head: `<circle class="thin" fill="none" cx="${-ex}" cy="${ey}" r="${r}"/><circle class="thin" fill="none" cx="${ex}" cy="${ey}" r="${r}"/>`
        + `<path class="d" d="M${-ex + r} ${ey - 2} Q0 ${ey - 8} ${ex - r} ${ey - 2} M${-ex - r} ${ey - 4} L${-b.head.rx + 4} ${ey - 10} M${ex + r} ${ey - 4} L${b.head.rx - 4} ${ey - 10}"/>` };
    },
  },
  'hero-mask': {
    slot: 'face', label: 'hero mask', colors: { face: P.plum, 'face-sh': P.plumDeep },
    gen: (b) => {
      const { ex, ey } = b.face, w = ex + 26, hole = (x) => `M${x - 13} ${ey} C${x - 13} ${ey - 14} ${x + 13} ${ey - 14} ${x + 13} ${ey} C${x + 13} ${ey + 13} ${x - 13} ${ey + 13} ${x - 13} ${ey}Z`;
      return { head: `<path class="face" fill-rule="evenodd" d="M${-w} ${ey - 16} C${-w + 10} ${ey - 28} ${-12} ${ey - 24} 0 ${ey - 16} C12 ${ey - 24} ${w - 10} ${ey - 28} ${w} ${ey - 16} C${w + 4} ${ey + 4} ${w - 6} ${ey + 20} ${ex + 4} ${ey + 20} C${ex - 12} ${ey + 20} 8 ${ey + 8} 0 ${ey + 10} C-8 ${ey + 8} ${-ex + 12} ${ey + 20} ${-ex - 4} ${ey + 20} C${-w + 6} ${ey + 20} ${-w - 4} ${ey + 4} ${-w} ${ey - 16}Z ${hole(-ex)} ${hole(ex)}"/>`
        + `<path class="face" d="M${w - 2} ${ey - 10} L${w + 20} ${ey - 20} L${w + 16} ${ey - 4}Z"/>` };
    },
  },
  // ---- shoes (foot frame: origin at the ankle, toe points +x) ----
  sneakers: {
    slot: 'shoes', label: 'sneakers', colors: { shoe: P.white, 'shoe-sh': P.rose },
    gen: (b) => {
      const r = b.legR, L = b.foot.len + 4, H = b.foot.h;
      return { foot: `<path class="shoe" d="M${-r - 2} ${H - 2} L${L - 6} ${H - 2} Q${L + 4} ${H - 2} ${L + 4} ${H - 12} Q${L + 4} ${-4} ${f(L * .45)} ${-6} Q${-r - 2} ${-8} ${-r - 2} ${H - 18}Z"/>`
        + `<path class="d" d="M${-r + 2} ${H - 11} L${L} ${H - 11}"/><circle class="n" style="fill:var(--shoe-sh)" cx="${f(L * .35)}" cy="${f(H * .1)}" r="3.5"/>` };
    },
  },
  boots: {
    slot: 'shoes', label: 'boots', colors: { shoe: P.woodDark, 'shoe-sh': P.woodDeep },
    gen: (b) => {
      const r = b.legR + 3, L = b.foot.len + 4, H = b.foot.h, top = -b.shin * .42;
      return { foot: `<path class="shoe" d="M${-r} ${top} L${r} ${top} L${r} ${-4} Q${L + 4} ${-6} ${L + 4} ${H - 12} Q${L + 4} ${H - 2} ${L - 6} ${H - 2} L${-r + 6} ${H - 2} Q${-r} ${H - 2} ${-r} ${H - 8}Z"/>`
        + `<rect class="shoe-sh" x="${-r - 2}" y="${top - 2}" width="${2 * r + 4}" height="12" rx="5"/><path class="d" d="M${-r + 3} ${H - 10} L${L} ${H - 10}"/>` };
    },
  },
};

// ---------------------------------------------------------------------------
// P1.15: more pieces for the Character Maker and the 12-character cast
// (construction worker, chef, performer, grandparents, a headscarf).
// ---------------------------------------------------------------------------
const tee = (b) => { const T = b.torso; return { t: rel(b, T.top), h: rel(b, T.hem), T }; };
Object.assign(WEAR, {
  'tee-dots': {
    slot: 'top', label: 'polka-dot tee', colors: { top: P.rose, 'top-sh': P.roseDeep, 'top-2': P.cream },
    gen: (b) => {
      const { t, h, T } = tee(b);
      const dots = [[-.55, .3], [.2, .22], [.6, .5], [-.2, .55], [-.62, .8], [.3, .8], [0, .38]]
        .map(([x, y]) => `<circle cx="${f(x * T.bw)}" cy="${f(t + (h - t) * y)}" r="${f(Math.max(4, T.tw * .12))}"/>`).join('');
      return {
        torso: `<path class="top" d="${torsoPath(t, h, T.tw, T.bw)}"/><g class="n" style="fill:var(--top-2)">${dots}</g><path class="d" d="M-16 ${t} Q0 ${t + 14} 16 ${t}"/>`,
        arm: sleeveShort(b, 'top'),
      };
    },
  },
  hoodie: {
    slot: 'top', label: 'hoodie', colors: { top: P.teal, 'top-sh': P.tealDeep, 'top-2': P.cream },
    gen: (b) => {
      const { t, h, T } = tee(b);
      const pw = T.bw * .55, py = h - (h - t) * .38;
      return {
        torso: `<path class="top-sh" d="M${-T.tw - 10} ${t + 14} Q${-T.tw} ${t - 20} 0 ${t - 18} Q${T.tw} ${t - 20} ${T.tw + 10} ${t + 14}Z"/>`
          + `<path class="top" d="${torsoPath(t, h + 4, T.tw, T.bw + 3)}"/>`
          + `<path class="top-sh" d="M${f(-pw)} ${f(py)} L${f(pw)} ${f(py)} L${f(pw + 8)} ${f(h - 4)} L${f(-pw - 8)} ${f(h - 4)}Z"/>`
          + `<path class="d" d="M-10 ${t + 6} L-12 ${t + 36} M10 ${t + 6} L12 ${t + 36}"/><circle class="top-2 thin" cx="-12" cy="${t + 38}" r="4"/><circle class="top-2 thin" cx="12" cy="${t + 38}" r="4"/>`
          + `<rect class="top-sh" x="${-T.bw - 3}" y="${h - 8}" width="${2 * T.bw + 6}" height="12" rx="5"/>`,
        arm: sleeveLong(b, 'top', 'top-sh'),
      };
    },
  },
  'chef-coat': {
    slot: 'top', label: 'chef coat', colors: { top: P.white, 'top-sh': P.oat, 'top-2': P.ink },
    gen: (b) => {
      const { t, h, T } = tee(b);
      const btn = (x) => [0.3, 0.52, 0.74].map((k) => `<circle class="n" style="fill:var(--top-2)" cx="${f(x)}" cy="${f(t + (h - t) * k)}" r="3.6"/>`).join('');
      return {
        torso: `<path class="top" d="${torsoPath(t, h + 8, T.tw, T.bw + 4)}"/>`
          + `<path class="d" d="M${f(-T.tw * .5)} ${t + 2} Q${f(T.tw * .1)} ${f(t + (h - t) * .3)} ${f(T.tw * .35)} ${h + 6}"/>`
          + btn(-T.tw * .42) + btn(T.tw * .42)
          + `<rect class="top-sh" x="${-b.neck[0] - 6}" y="${t - 8}" width="${2 * b.neck[0] + 12}" height="14" rx="6"/>`,
        arm: sleeveLong(b, 'top', 'top-sh'),
      };
    },
  },
  'sparkle-top': {
    slot: 'top', label: 'sparkly show top', colors: { top: P.plum, 'top-sh': P.plumDeep, 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b);
      const stars = [[-.5, .3, 9], [.35, .24, 7], [.1, .6, 11], [-.3, .75, 6], [.6, .7, 8]]
        .map(([x, y, r]) => `<path class="top-2 thin" d="${star(f(x * T.bw), f(t + (h - t) * y), r * (T.tw / 44), r * .45 * (T.tw / 44))}"/>`).join('');
      const sl = sleeveShort(b, 'top', 0.45);
      const r = b.armR + 10;
      sl.upper = `<path class="top" d="${scallop(0, 0, r, r * .8, 8, 4)}"/>`;
      return {
        torso: `<path class="top" d="${torsoPath(t, h, T.tw, T.bw)}"/>${stars}<path class="d" d="M-18 ${t} Q0 ${t + 18} 18 ${t}"/>`,
        arm: sl,
      };
    },
  },
  'safety-vest': {
    slot: 'over', label: 'safety vest', colors: { over: '#EE9A55', 'over-sh': P.terraDeep, 'over-2': P.cream },
    gen: (b) => {
      const { t, h, T } = tee(b);
      const sw = T.bw + 4, gap = T.tw * .34, y1 = f(t + (h - t) * .5), y2 = f(t + (h - t) * .72);
      const side = (s) => `<path class="over" d="M${s * gap} ${t - 2} L${s * (T.tw + 6)} ${t + 4} Q${s * (sw + 8)} ${t + 30} ${s * sw} ${h - 8} Q${s * sw} ${h + 4} ${s * (sw - 10)} ${h + 4} L${s * (gap - 2)} ${h + 4}Z"/>`;
      const band = (y) => [-1, 1].map((s) => `<rect class="over-2 thin" x="${s < 0 ? -sw + 1 : gap - 1}" y="${y}" width="${f(sw - gap)}" height="10" rx="3"/>`).join('');
      return { torso: side(-1) + side(1) + band(y1) + band(y2) };
    },
  },
  tutu: {
    slot: 'bottom', label: 'tutu', colors: { bot: P.blush, 'bot-sh': P.rose },
    gen: (b) => {
      const w = b.hipX + b.legR + 4, top = -b.legR * 1.5, fw = w + b.thigh * .5 + 14, bot = f(b.thigh * .38 + 8);
      return {
        pelvis: `<path class="bot-sh" d="${scallop(0, f(bot * .3), fw, bot * .9, 14, 7, 0, 180, false)}Z"/>`
          + `<path class="bot" d="${scallop(0, f(bot * .12), fw - 6, bot * .8, 12, 7, 0, 180, false)}Z"/>`
          + `<rect class="bot-sh" x="${-w}" y="${top}" width="${w * 2}" height="${f(-top + 6)}" rx="6"/>`,
      };
    },
  },
  sandals: {
    slot: 'shoes', label: 'sandals', colors: { shoe: P.woodDeep, 'shoe-sh': P.woodDark },
    gen: (b) => {
      const r = b.legR, L = b.foot.len + 2, H = b.foot.h;
      return { foot: `<path class="skin" d="M${-r} ${-4} L${-r} ${H - 10} Q${-r} ${H - 4} ${-r + 8} ${H - 4} L${L - 6} ${H - 4} Q${L} ${H - 4} ${L} ${H - 12} Q${L} ${-2} ${r} ${-4}Z"/>`
        + `<rect class="shoe" x="${-r - 3}" y="${H - 6}" width="${L + r + 5}" height="8" rx="4"/>`
        + `<path class="shoe fo" d="M${f(L * .15)} ${H - 6} L${f(L * .35)} ${f(H * .15)} L${f(L * .55)} ${H - 6}Z"/><path fill="none" style="stroke:var(--shoe-sh);stroke-width:6" d="M${-r + 2} ${f(H * .3)} L${r + 4} ${f(H * .3)}"/>` };
    },
  },
  wings: {
    slot: 'back', label: 'fairy wings', colors: { back: P.lav, 'back-sh': P.sky, 'back-2': P.white },
    gen: (b) => {
      const t = rel(b, b.torso.top), k = b.torso.tw / 44, cy = t + 36 * k;
      const wing = (s) => `<path class="back" d="M${s * 8} ${f(cy)} C${f(s * 70 * k)} ${f(cy - 110 * k)} ${f(s * 150 * k)} ${f(cy - 60 * k)} ${f(s * 118 * k)} ${f(cy + 4 * k)} C${f(s * 140 * k)} ${f(cy + 40 * k)} ${f(s * 96 * k)} ${f(cy + 96 * k)} ${s * 8} ${f(cy + 16 * k)}Z"/>`
        + `<ellipse class="n" style="fill:var(--back-sh)" cx="${f(s * 84 * k)}" cy="${f(cy - 34 * k)}" rx="${f(18 * k)}" ry="${f(13 * k)}"/><circle class="n" style="fill:var(--back-2)" cx="${f(s * 76 * k)}" cy="${f(cy + 36 * k)}" r="${f(8 * k)}"/>`;
      return { back: wing(-1) + wing(1), torso: '' };
    },
  },
  // ---- hats ----
  'hard-hat': {
    slot: 'hat', label: 'hard hat', hides: ['top'], colors: { hat: P.mustard, 'hat-sh': P.mustardDeep, 'hat-2': P.butter },
    gen: (b) => {
      const { rx, ry } = b.head, by = f(-ry * .42), bw = rx + 16;
      return {
        head: `<path class="hat" d="M${-rx - 2} ${by} C${-rx - 4} ${f(-ry * 1.3)} ${f(-rx * .5)} ${f(-ry * 1.46)} 0 ${f(-ry * 1.46)} C${f(rx * .5)} ${f(-ry * 1.46)} ${rx + 4} ${f(-ry * 1.3)} ${rx + 2} ${by}Z"/>`
          + `<path class="hat-2" d="M-12 ${f(-ry * 1.44)} L12 ${f(-ry * 1.44)} L10 ${by} L-10 ${by}Z"/>`
          + `<rect class="hat-sh" x="${-bw}" y="${f(by - 6)}" width="${bw * 2}" height="16" rx="8"/>`
          + `<path class="d" d="M${f(-rx * .55)} ${f(-ry * 1.05)} Q${f(-rx * .45)} ${f(-ry * 1.25)} ${f(-rx * .25)} ${f(-ry * 1.32)}"/>`,
      };
    },
  },
  cap: {
    slot: 'hat', label: 'baseball cap', hides: ['top'], colors: { hat: P.berry, 'hat-sh': '#B9575B', 'hat-2': P.cream },
    gen: (b) => {
      const { rx, ry } = b.head, by = f(-ry * .5);
      return {
        head: `<path class="hat" d="M${-rx - 3} ${by} C${-rx - 5} ${f(-ry * 1.22)} ${f(-rx * .5)} ${f(-ry * 1.34)} 0 ${f(-ry * 1.34)} C${f(rx * .5)} ${f(-ry * 1.34)} ${rx + 5} ${f(-ry * 1.22)} ${rx + 3} ${by}Z"/>`
          + `<circle class="hat-2 thin" cx="0" cy="${f(-ry * 1.3)}" r="7"/><path class="d" d="M0 ${f(-ry * 1.24)} L0 ${f(by - 8)}"/>`
          + `<path class="hat-sh" d="M${f(-rx * .95)} ${f(by - 4)} Q0 ${f(by - 14)} ${f(rx * .95)} ${f(by - 4)} Q${f(rx * .8)} ${f(by + 22)} 0 ${f(by + 24)} Q${f(-rx * .8)} ${f(by + 22)} ${f(-rx * .95)} ${f(by - 4)}Z"/>`,
      };
    },
  },
  bow: {
    slot: 'hat', label: 'big bow', colors: { hat: P.rose, 'hat-sh': P.roseDeep, 'hat-2': P.cream },
    gen: (b) => {
      const { rx, ry } = b.head, x = f(rx * .5), y = f(-ry * .86);
      return {
        head: `<g transform="translate(${x} ${y}) rotate(18)"><path class="hat" d="M0 0 C-14 -26 -44 -26 -40 0 C-44 26 -14 26 0 0Z"/><path class="hat" d="M0 0 C14 -26 44 -26 40 0 C44 26 14 26 0 0Z"/>`
          + `<path class="d" d="M-10 -6 Q-24 -12 -30 -4 M10 -6 Q24 -12 30 -4"/><circle class="hat-sh" cx="0" cy="0" r="9"/></g>`,
      };
    },
  },
  hijab: {
    slot: 'hat', label: 'headscarf', hides: ['top', 'hair'], colors: { hat: P.teal, 'hat-sh': P.tealDeep, 'hat-2': P.cream },
    gen: (b) => {
      const { rx, ry } = b.head, fx = f(rx * .84), fy = f(ry * .86), cy = 14;
      const outer = `M${-rx - 10} 20 C${-rx - 14} ${f(-ry * .9)} ${f(-rx * .6)} ${-ry - 12} 0 ${-ry - 12} C${f(rx * .6)} ${-ry - 12} ${rx + 14} ${f(-ry * .9)} ${rx + 10} 20 C${rx + 8} ${ry - 4} ${rx + 26} ${ry + 18} ${rx + 30} ${ry + 30} Q0 ${ry + 50} ${-rx - 30} ${ry + 30} C${-rx - 26} ${ry + 18} ${-rx - 8} ${ry - 4} ${-rx - 10} 20Z`;
      const hole = `M${-fx} ${cy} C${-fx} ${f(cy - fy * 1.1)} ${fx} ${f(cy - fy * 1.1)} ${fx} ${cy} C${fx} ${f(cy + fy * 1.02)} ${-fx} ${f(cy + fy * 1.02)} ${-fx} ${cy}Z`;
      return {
        head: `<path class="hat" fill-rule="evenodd" d="${outer} ${hole}"/>`
          + `<path class="d" d="M${f(-rx * .7)} ${ry + 24} Q${f(-rx * .1)} ${ry + 34} ${f(rx * .5)} ${ry + 24}"/><path class="d" d="M${f(-rx * .5)} ${f(-ry * .96)} Q${f(-rx * .1)} ${f(-ry * 1.04)} ${f(rx * .3)} ${f(-ry * .98)}"/>`,
      };
    },
  },
  // ---- face ----
  'square-glasses': {
    slot: 'face', label: 'square glasses', colors: { face: 'none', 'face-sh': P.ink },
    gen: (b) => {
      const { ex, ey } = b.face, w = Math.round(ex * .78), hh = Math.round(ex * .6);
      const box = (x) => `<rect class="thin" fill="none" x="${x - w}" y="${ey - hh}" width="${w * 2}" height="${hh * 2 - 2}" rx="6"/>`;
      return { head: box(-ex) + box(ex) + `<path class="d" d="M${-ex + w} ${ey - 4} L${ex - w} ${ey - 4} M${-ex - w} ${ey - 6} L${-b.head.rx + 4} ${ey - 10} M${ex + w} ${ey - 6} L${b.head.rx - 4} ${ey - 10}"/>` };
    },
  },
  sunglasses: {
    slot: 'face', label: 'sunglasses', colors: { face: P.charDeep, 'face-sh': P.char },
    gen: (b) => {
      const { ex, ey } = b.face, w = Math.round(ex * .8);
      const lens = (x) => `<path class="face thin" d="M${x - w} ${ey - 10} L${x + w} ${ey - 10} Q${x + w} ${ey + 14} ${x} ${ey + 14} Q${x - w} ${ey + 14} ${x - w} ${ey - 10}Z"/><path class="n" fill="#FFFFFF" opacity=".7" d="M${x - w + 6} ${ey - 5} l8 0 l-6 8Z"/>`;
      return { head: lens(-ex) + lens(ex) + `<path class="d" d="M${-ex + w} ${ey - 8} L${ex - w} ${ey - 8} M${-ex - w} ${ey - 8} L${-b.head.rx + 4} ${ey - 12} M${ex + w} ${ey - 8} L${b.head.rx - 4} ${ey - 12}"/>` };
    },
  },
});

// ---------------------------------------------------------------------------
// P2c: the construction site's wearables (props/site.mjs `wear`): a tool
// belt (new slot `belt`: worn at the waist, over the top AND a vest or
// apron), work gloves (new slot `hands`: a mitten over each hand plus a cuff
// on the forearm, so they follow the 2-segment arms in every pose) and the
// hero suit (a `top`, but a costume: dropped on a character it is a worn
// child that covers its own top until it is pulled off; docs/rig.md 4).
// ---------------------------------------------------------------------------
const HAZ = '#EE9A55';
Object.assign(WEAR, {
  'tool-belt': {
    slot: 'belt', label: 'tool belt', colors: { belt: P.wood, 'belt-sh': P.woodDeep, 'belt-2': P.mustard },
    gen: (b) => {
      const { h, T } = tee(b);
      const k = Math.min(1.15, T.bw / 58), w = T.bw + 4, bh = f(14 * k + 2), y0 = f(h - bh + 2);
      const pw = f(15 * k), px = f(T.bw - pw - 2), ph = f(30 * k + 6), py = f(y0 + bh - 4);
      const pouch = (s) => {
        const x = s * px;
        return `<path class="belt" d="M${f(x - pw)} ${py} L${f(x + pw)} ${py} L${f(x + pw - 2)} ${f(py + ph - 8)} Q${f(x + pw - 2)} ${f(py + ph)} ${f(x + pw - 10)} ${f(py + ph)} L${f(x - pw + 10)} ${f(py + ph)} Q${f(x - pw + 2)} ${f(py + ph)} ${f(x - pw + 2)} ${f(py + ph - 8)}Z"/>`
          + `<path class="d" d="M${f(x - pw + 5)} ${f(py + ph * .38)} L${f(x + pw - 5)} ${f(py + ph * .38)}"/>`;
      };
      // a hammer in the screen-left pouch, a wrench in the right one (fixed toy colours)
      const hx = -px - pw * .3, wx = px + pw * .3, top = f(py - 26 * k);
      const hammer = `<rect fill="${P.woodDark}" x="${f(hx - 4 * k)}" y="${top}" width="${f(8 * k)}" height="${f(py - top + 4)}" rx="3"/>`
        + `<rect fill="${P.steelDeep}" x="${f(hx - 13 * k)}" y="${f(top - 9 * k)}" width="${f(24 * k)}" height="${f(11 * k)}" rx="3"/>`;
      const wrench = `<rect fill="${P.steel}" x="${f(wx - 4 * k)}" y="${f(top + 4)}" width="${f(8 * k)}" height="${f(py - top)}" rx="3"/>`
        + `<path fill="${P.steel}" d="M${f(wx - 10 * k)} ${f(top + 8)} Q${f(wx - 12 * k)} ${f(top - 8 * k)} ${f(wx - 4 * k)} ${f(top - 9 * k)} L${f(wx - 3 * k)} ${f(top - 1)} L${f(wx + 3 * k)} ${f(top - 1)} L${f(wx + 4 * k)} ${f(top - 9 * k)} Q${f(wx + 12 * k)} ${f(top - 8 * k)} ${f(wx + 10 * k)} ${f(top + 8)}Z"/>`;
      const bk = f(11 * k + 2);
      return {
        torso: hammer + wrench + pouch(-1) + pouch(1)
          + `<rect class="belt-sh" x="${-w}" y="${y0}" width="${w * 2}" height="${bh}" rx="${f(bh / 2)}"/>`
          + `<rect class="belt-2 thin" x="${-bk}" y="${f(y0 - 3)}" width="${bk * 2}" height="${f(bh + 6)}" rx="4"/>`
          + `<rect class="belt-sh thin" x="${f(-bk * .38)}" y="${f(y0 + 2)}" width="${f(bk * .76)}" height="${f(bh - 4)}" rx="2"/>`
          + `<rect class="n" fill="${P.berry}" x="${f(-px + pw * .15)}" y="${f(py + ph * .52)}" width="${f(pw * .55)}" height="${f(ph * .3)}" rx="3"/>`,
      };
    },
  },
  gloves: {
    slot: 'hands', label: 'work gloves', colors: { hands: P.butter, 'hands-sh': P.mustardDeep, 'hands-2': HAZ },
    gen: (b) => {
      // hand frame (origin = hand centre, authored for the right hand: the
      // thumb faces the body at -x), plus a flared cuff in the forearm frame.
      const r = b.handR + 2, L = b.lower, a = b.armR;
      const cuff = `<path class="hands-2" d="M${-a - 1} ${f(L - r - 14)} L${a + 1} ${f(L - r - 14)} L${a + 6} ${f(L - r * .35)} L${-a - 6} ${f(L - r * .35)}Z"/>`
        + `<path ${tl('var(--hands-sh)', 'stroke-width:3.5')} d="M${-a + 1} ${f(L - r - 6)} L${a - 1} ${f(L - r - 6)}"/>`;
      return {
        hand: `<circle class="hands" cx="0" cy="0" r="${r}"/>`
          + `<path class="hands" d="M${f(-r * .62)} ${f(-r * .48)} Q${f(-r * 1.32)} ${f(-r * .2)} ${f(-r * 1.02)} ${f(r * .42)} Q${f(-r * .72)} ${f(r * .72)} ${f(-r * .38)} ${f(r * .3)}Z"/>`
          + `<path ${tl('var(--hands-sh)', 'stroke-width:3.5')} d="M${f(-r * .1)} ${f(r * .42)} Q${f(r * .25)} ${f(r * .58)} ${f(r * .58)} ${f(r * .36)}"/>`,
        cuff,
      };
    },
  },
  'hero-suit': {
    slot: 'top', label: 'hero suit', costume: true, colors: { top: P.teal, 'top-sh': P.tealDeep, 'top-2': HAZ },
    gen: (b) => {
      // Original design (no web or spider): a teal top, orange side panels
      // and sleeves with teal cuffs, an orange disc with a butter star, and
      // tealDeep swirl tone lines.
      const { t, h: h0, T } = tee(b);
      const h = h0 + 4, bw = T.bw + 2, sw = T.tw + (bw - T.tw) * 0.18 + 14;
      const k = T.tw / 44;
      const y0 = t + 18, y1 = h - 12;
      const edge = (y) => sw + (bw - sw) * (y - y0) / (y1 - y0);   // the torso's side edge
      const pw = f(bw * .3), ys = f(t + 30);
      const panel = (s) => `<path class="top-2 n" d="M${f(s * edge(ys))} ${ys} L${f(s * bw)} ${y1} Q${f(s * bw)} ${h} ${f(s * (bw - 12))} ${h} L${f(s * (bw - 12 - pw * .5))} ${h} L${f(s * (edge(ys) - pw))} ${f(ys + 6)}Z"/>`;
      const body = torsoPath(t, h, T.tw, bw);
      const cy = f(t + (h - t) * .4), R = f(Math.min(22, T.tw * .5));
      let sw2 = '';
      for (const [x, y, r] of [[-.56, .2, 8.5], [.58, .18, 7.5], [-.5, .74, 8], [.46, .8, 9]]) {
        const X = f(x * T.tw), Y = f(t + (h - t) * y), rr = f(r * k);
        sw2 += `M${f(X + rr)} ${Y} A${rr} ${rr} 0 1 0 ${X} ${f(Y + rr)} A${f(rr * .6)} ${f(rr * .6)} 0 1 1 ${f(X + rr * .5)} ${f(Y - rr * .2)}`;
      }
      const arm = sleeveLong(b, 'top-2', 'top');
      const r = b.armR + 5;
      arm.upper += `<path ${tl('var(--top-sh)', 'stroke-width:3.5')} d="M${-r + 4} ${f(b.upper * .55)} Q0 ${f(b.upper * .55 + 6)} ${r - 4} ${f(b.upper * .55)}"/>`;
      return {
        torso: `<path class="top" d="${body}"/>` + panel(-1) + panel(1)
          + `<path class="top-sh n" d="M${-bw + 1} ${h - 11} L${bw - 1} ${h - 11} L${bw - 1} ${h - 10} Q${bw - 1} ${h - 1} ${bw - 11} ${h - 1} L${-bw + 11} ${h - 1} Q${-bw + 1} ${h - 1} ${-bw + 1} ${h - 10}Z"/>`
          + `<path ${tl('var(--top-sh)', 'stroke-width:4')} d="${sw2}"/>`
          + `<path fill="none" d="${body}"/><path class="d" d="M${-bw + 4} ${h - 11} L${bw - 4} ${h - 11}"/>`
          + `<path class="d" d="M-16 ${t} Q0 ${t + 14} 16 ${t}"/>`
          + `<circle class="top-2" cx="0" cy="${cy}" r="${R}"/><path class="thin" fill="${P.butter}" d="${star(0, cy, f(R * .72), f(R * .32))}"/>`,
        arm,
      };
    },
  },
});

// ---------------------------------------------------------------------------
// P2b: THEATER COSTUMES (docs/design.md 3.2; prop sprites and their `wear`
// in props/theater.mjs). Dresses, coats and robes are costume TOPS: their
// skirt or coat tails live in the torso fragment (torso frame, pelvis at y 0,
// the ground at y -hipY), so they cover the legs when standing and walking,
// and the legs draw over them when sitting (legsFront). Nothing here uses a
// new slot. Hats and ears are `hat`, masks `face`, the boa `over`, the
// lightning cape `back`. All original designs (no real-world IP).
// ---------------------------------------------------------------------------
/** A flared skirt from the waist (y0, half-width a) to the hem (y1, half-width c); hem 'round' or 'scallop'. */
function skirtPath(y0, a, y1, c, hem = 'round', n = 7) {
  const mx = (s) => f(s * (a + (c - a) * .3)), my = f(y0 + (y1 - y0) * .5);
  let d = `M${f(-a)} ${f(y0)} L${f(a)} ${f(y0)} Q${mx(1)} ${my} ${f(c)} ${f(y1 - 8)}`;
  if (hem === 'scallop') {
    d += ` L${f(c)} ${f(y1)}`;
    for (let i = 0; i < n; i++) {
      const x0 = c - (2 * c * i) / n, x1 = c - (2 * c * (i + 1)) / n;
      d += ` Q${f((x0 + x1) / 2)} ${f(y1 + 14)} ${f(x1)} ${f(y1)}`;
    }
  } else d += ` Q${f(c)} ${f(y1)} ${f(c - 10)} ${f(y1)} L${f(-c + 10)} ${f(y1)} Q${f(-c)} ${f(y1)} ${f(-c)} ${f(y1 - 8)}`;
  return d + ` L${f(-c)} ${f(y1 - 8)} Q${mx(-1)} ${my} ${f(-a)} ${f(y0)}Z`;
}
const puffSleeve = (b, cls) => { const r = b.armR + 10; return { upper: `<path class="${cls}" d="${scallop(0, 2, r, r * .82, 8, 4)}"/><path class="d" d="M-4 ${f(-r * .5)} Q-2 4 -5 ${f(r * .6)} M6 ${f(-r * .4)} Q8 4 5 ${f(r * .6)}"/>`, lower: '', patch: '' }; };
/** Small stars scattered at [x (x half-width), y (0 top .. 1 bottom), size] over a box. */
const sprinkle = (list, x0, y0, w, h, cls = 'top-2 thin', k = 1) => list.map(([x, y, r]) => `<path class="${cls}" d="${star(f(x * w + x0), f(y0 + y * h), f(r * k), f(r * .45 * k))}"/>`).join('');
const TK = (b) => b.torso.tw / 44;   // detail scale per body
const ellPath = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;

Object.assign(WEAR, {
  // ---- costume tops (costume: true: worn over the character's own top) ----
  gown: {
    slot: 'top', label: 'princess gown', costume: true, colors: { top: P.rose, 'top-sh': P.roseDeep, 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b);
      const yW = f(h - (h - t) * .3), a = T.bw - 4;
      const y1 = f(b.thigh + b.shin * .72), c = f(T.bw + b.thigh * .55 + b.shin * .25 + 10);
      const folds = [-.55, 0, .55].map((s) => `M${f(s * a * .6)} ${f(yW + 12)} Q${f(s * c * .5)} ${f((yW + y1) / 2)} ${f(s * c * .72)} ${f(y1 - 24)}`).join(' ');
      return {
        torso: `<path class="top" d="${torsoPath(t, yW + 6, T.tw, T.bw - 2)}"/>`
          + `<path class="d" d="M${f(-T.tw * .62)} ${f(t + 6)} Q${f(-T.tw * .3)} ${f(t + 22 * k)} 0 ${f(t + 10)} Q${f(T.tw * .3)} ${f(t + 22 * k)} ${f(T.tw * .62)} ${f(t + 6)}"/>`
          + `<path class="top-2" d="${skirtPath(yW, a, y1, c, 'scallop', 8)}"/>`
          + `<path class="top" d="${skirtPath(yW, a, y1 - 16 * k - 6, c - 5, 'scallop', 8)}"/>`
          + `<path ${tl('var(--top-sh)', 'stroke-width:4')} d="${folds}"/>`
          + sprinkle([[-.62, .52, 7], [.1, .38, 6], [.58, .6, 7], [-.2, .74, 6], [.36, .84, 5], [-.7, .86, 5]], 0, yW, c, y1 - yW, 'top-2 thin', k)
          + `<rect class="top-2" x="${f(-a - 2)}" y="${f(yW - 6)}" width="${f(2 * a + 4)}" height="${f(12 * k + 2)}" rx="6"/>`
          + heart(0, f(yW + 1), .55 * k, P.berry),
        arm: puffSleeve(b, 'top'),
      };
    },
  },
  'royal-coat': {
    slot: 'top', label: 'prince coat', costume: true, colors: { top: P.blue, 'top-sh': P.blueDeep, 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b), hh = h + 14;
      const btn = [0.3, 0.52, 0.74].map((y) => [-1, 1].map((s) => `<circle class="top-2 thin" cx="${f(s * T.tw * .3)}" cy="${f(t + (hh - t) * y)}" r="${f(4.5 * k)}"/>`).join('')).join('');
      const sash = `<path fill="${P.berry}" d="M${f(-T.tw + 2)} ${f(t + 8)} L${f(-T.tw + 22 * k)} ${f(t + 2)} L${f(T.bw + 2)} ${f(hh - 30 * k)} L${f(T.bw - 4)} ${f(hh - 8 * k)}Z"/>`;
      const arm = sleeveLong(b, 'top', 'top-2');
      const r = b.armR + 5;
      arm.upper += `<path class="top-2" d="M${-r - 6} -4 Q0 ${-r - 18} ${r + 6} -4 L${r + 4} 8 ${[...Array(5)].map((_, i) => `Q${f(r + 4 - (2 * r + 8) * (i + .5) / 5)} 18 ${f(r + 4 - (2 * r + 8) * (i + 1) / 5)} 8`).join(' ')}Z"/>`;
      return {
        torso: `<path class="top" d="${torsoPath(t, hh, T.tw, T.bw + 4)}"/>`
          + `<path class="d" d="M0 ${f(t + 12)} L0 ${f(hh - 2)}"/>` + btn + sash
          + `<path class="d" d="M${f(-T.tw + 22 * k)} ${f(t + 2)} L${f(T.bw + 2)} ${f(hh - 30 * k)}"/>`
          + `<circle class="top-2 thin" cx="${f(T.bw * .55)}" cy="${f(hh - 30 * k)}" r="${f(8 * k)}"/><path class="thin" fill="${P.berry}" d="${star(f(T.bw * .55), f(hh - 30 * k), f(5 * k), f(2.4 * k))}"/>`
          + `<rect class="top-2" x="${-b.neck[0] - 8}" y="${t - 10}" width="${2 * b.neck[0] + 16}" height="16" rx="7"/>`
          + `<rect class="top-sh" x="${f(-T.bw - 4)}" y="${f(hh - 12)}" width="${f(2 * T.bw + 8)}" height="12" rx="5"/>`,
        arm,
      };
    },
  },
  'knight-tunic': {
    slot: 'top', label: 'knight tunic', costume: true, colors: { top: P.steel, 'top-sh': P.steelDeep, 'top-2': P.blue },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b);
      const mail = [...Array(6)].map((_, i) => { const y = t + 14 + i * ((h - t) / 6); return `M${f(-T.bw)} ${f(y)} ${[...Array(8)].map((__, j) => { const x = -T.bw + (2 * T.bw) * (j + 1) / 8; return `Q${f(x - T.bw / 8)} ${f(y + 8)} ${f(x)} ${f(y)}`; }).join(' ')}`; }).join(' ');
      const tw = T.tw * .78, bw = T.bw * .7, y1 = f(h + b.thigh * .5 + 4);
      const tab = `M${f(-tw)} ${f(t - 2)} L${f(tw)} ${f(t - 2)} L${f(bw)} ${f(y1 - 14)} L0 ${f(y1)} L${f(-bw)} ${f(y1 - 14)}Z`;
      const cy = f(t + (h - t) * .42), R = f(Math.min(20, T.tw * .44));
      const arm = sleeveLong(b, 'top', 'top-sh');
      const r = b.armR + 5;
      arm.upper += `<path class="top" d="M${-r - 8} 6 Q${-r - 8} ${-r - 14} 0 ${-r - 14} Q${r + 8} ${-r - 14} ${r + 8} 6 Q0 14 ${-r - 8} 6Z"/><path ${tl('var(--top-sh)', 'stroke-width:3.5')} d="M${-r - 2} -2 Q0 6 ${r + 2} -2"/>`;
      arm.upper += `<path ${tl('var(--top-sh)', 'stroke-width:3.5')} d="${[.42, .72].map((y) => `M${-r + 3} ${f(b.upper * y)} Q${-r / 2} ${f(b.upper * y + 6)} 0 ${f(b.upper * y)} Q${r / 2} ${f(b.upper * y + 6)} ${r - 3} ${f(b.upper * y)}`).join(' ')}"/>`;
      return {
        torso: `<path class="top" d="${torsoPath(t, h + 6, T.tw, T.bw + 2)}"/><path ${tl('var(--top-sh)', 'stroke-width:3.5')} d="${mail}"/><path fill="none" d="${torsoPath(t, h + 6, T.tw, T.bw + 2)}"/>`
          + `<path class="top-2" d="${tab}"/><path class="d" d="M${f(-tw + 8)} ${f(t + 8)} L${f(-bw + 8)} ${f(y1 - 18)} M${f(tw - 8)} ${f(t + 8)} L${f(bw - 8)} ${f(y1 - 18)}"/>`
          + `<circle class="thin" fill="${P.cream}" cx="0" cy="${cy}" r="${R}"/><path class="thin" fill="${P.mustard}" d="${star(0, cy, f(R * .78), f(R * .36))}"/>`
          + `<rect fill="${P.woodDark}" x="${f(-T.bw - 2)}" y="${f(h - 22 * k)}" width="${f(2 * T.bw + 4)}" height="${f(11 * k + 2)}" rx="5"/>`
          + `<rect class="thin" fill="${P.butter}" x="${f(-8 * k)}" y="${f(h - 24 * k)}" width="${f(16 * k)}" height="${f(14 * k + 4)}" rx="3"/>`,
        arm,
      };
    },
  },
  'pirate-coat': {
    slot: 'top', label: 'pirate coat', costume: true, colors: { top: P.denimDeep, 'top-sh': '#55739A', 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b);
      const y1 = f(h + b.thigh * .78 + 6), sw = T.bw + 8, gap = T.tw * .34;
      // coat tails: two panels with a slit up the middle (the legs show through it)
      const tail = (s) => `<path class="top" d="M${f(s * 2)} ${f(h - 20)} L${f(s * (T.bw + 4))} ${f(h - 20)} Q${f(s * (sw + 6))} ${f((h + y1) / 2)} ${f(s * (sw + b.thigh * .2))} ${f(y1 - 8)} Q${f(s * (sw + b.thigh * .2))} ${f(y1)} ${f(s * (sw + b.thigh * .2 - 10))} ${f(y1)} L${f(s * 12)} ${f(y1)} L${f(s * 4)} ${f(h + 4)}Z"/>`;
      const shirt = `<path fill="${P.cream}" d="M${f(-gap)} ${f(t - 2)} L${f(gap)} ${f(t - 2)} L${f(gap * .7)} ${f(h - 20)} L${f(-gap * .7)} ${f(h - 20)}Z"/>`;
      const jabot = [0, 1, 2].map((i) => `<path fill="${P.cream}" d="${scallop(0, f(t + 10 + i * 12 * k), f((14 - i * 2) * k), f(7 * k), 6, 3)}"/>`).join('');
      const btn = [.28, .5, .72].map((y) => [-1, 1].map((s) => `<circle class="top-2 thin" cx="${f(s * (gap + 12 * k))}" cy="${f(t + (h - t) * y)}" r="${f(4.5 * k)}"/>`).join('')).join('');
      const arm = sleeveLong(b, 'top', 'top-2');
      const r = b.armR + 5, end = b.lower - b.handR * .95;
      arm.lower += `<path class="top-2" d="M${-r - 4} ${f(end - 26 * k)} L${r + 4} ${f(end - 26 * k)} L${r + 8} ${f(end + 2)} L${-r - 8} ${f(end + 2)}Z"/>`;
      return {
        torso: tail(-1) + tail(1)
          + `<path class="top" d="${torsoPath(t, h, T.tw, T.bw + 4)}"/>` + shirt + jabot
          + `<path class="d" d="M${f(-gap)} ${f(t - 2)} L${f(-gap * .7)} ${f(h - 20)} M${f(gap)} ${f(t - 2)} L${f(gap * .7)} ${f(h - 20)}"/>` + btn
          + `<rect fill="${P.woodDark}" x="${f(-T.bw - 4)}" y="${f(h - 26 * k)}" width="${f(2 * T.bw + 8)}" height="${f(13 * k + 2)}" rx="5"/>`
          + `<rect class="thin" fill="${P.butter}" x="${f(-10 * k)}" y="${f(h - 29 * k)}" width="${f(20 * k)}" height="${f(18 * k + 3)}" rx="4"/><rect class="thin" fill="${P.woodDark}" x="${f(-4 * k)}" y="${f(h - 24 * k)}" width="${f(8 * k)}" height="${f(9 * k)}" rx="2"/>`,
        arm,
      };
    },
  },
  'star-dress': {
    slot: 'top', label: 'star dress', costume: true, colors: { top: P.blueDeep, 'top-sh': P.denimDeep, 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b);
      const yW = f(h - (h - t) * .34), a = T.bw - 6;
      const y1 = f(b.thigh + b.shin * .22), c = f(T.bw + b.thigh * .42 + 8);
      const sl = puffSleeve(b, 'top');
      return {
        torso: `<path class="top" d="${torsoPath(t, yW + 6, T.tw, T.bw - 4)}"/>`
          + `<path class="top" d="${skirtPath(yW, a, y1, c)}"/>`
          + `<path ${tl('var(--top-sh)', 'stroke-width:4')} d="${[-.5, .5].map((s) => `M${f(s * a * .5)} ${f(yW + 14)} Q${f(s * c * .45)} ${f((yW + y1) / 2)} ${f(s * c * .6)} ${f(y1 - 10)}`).join(' ')}"/>`
          + sprinkle([[-.6, .3, 9], [.2, .22, 7], [.62, .5, 9], [-.18, .6, 10], [.36, .82, 7], [-.66, .8, 7]], 0, yW, c, y1 - yW, 'top-2 thin', k)
          + sprinkle([[0, .45, 11]], 0, t, T.tw, yW - t, 'top-2 thin', k)
          + `<path class="d" d="M-18 ${t} Q0 ${t + 18} 18 ${t}"/><rect class="top-sh" x="${f(-a - 2)}" y="${f(yW - 4)}" width="${f(2 * a + 4)}" height="10" rx="5"/>`,
        arm: sl,
      };
    },
  },
  tuxedo: {
    slot: 'top', label: 'tuxedo jacket', costume: true, colors: { top: P.charDeep, 'top-sh': P.char, 'top-2': P.berry },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b), hh = h + 8;
      const vy = f(t + (h - t) * .62), sw = T.tw * .56;
      const tails = [-1, 1].map((s) => `<path class="top" d="M${f(s * T.bw * .2)} ${f(hh - 10)} L${f(s * (T.bw + 3))} ${f(hh - 10)} L${f(s * (T.bw + 2))} ${f(hh + b.thigh * .55)} Q${f(s * (T.bw * .7))} ${f(hh + b.thigh * .62)} ${f(s * T.bw * .45)} ${f(hh + b.thigh * .3)}Z"/>`).join('');
      const lapel = (s) => `<path class="top-sh" d="M${f(s * sw)} ${f(t - 2)} L${f(s * (sw + 10 * k))} ${f(t + 16)} L${f(s * 9 * k)} ${vy} L0 ${vy} Z"/>`;
      const arm = sleeveLong(b, 'top', 'top-sh');
      const r = b.armR + 5, end = b.lower - b.handR * .95;
      arm.lower += `<rect fill="${P.cream}" x="${-r + 1}" y="${f(end - 1)}" width="${2 * r - 2}" height="8" rx="3"/>`;
      const bx = 0, by = f(t + 8 * k);
      return {
        torso: tails + `<path class="top" d="${torsoPath(t, hh, T.tw, T.bw + 3)}"/>`
          + `<path fill="${P.cream}" d="M${f(-sw)} ${f(t - 2)} L${f(sw)} ${f(t - 2)} L0 ${vy}Z"/>` + lapel(-1) + lapel(1)
          + `<path class="d" d="M0 ${vy} L0 ${f(hh - 2)}"/>`
          + [.72, .86].map((y) => `<circle class="top-sh thin" cx="${f(-7 * k)}" cy="${f(t + (hh - t) * y)}" r="${f(4 * k)}"/>`).join('')
          + `<circle class="n" fill="${P.ink}" cx="0" cy="${f(t + (vy - t) * .55)}" r="${f(2.6 * k)}"/><circle class="n" fill="${P.ink}" cx="0" cy="${f(t + (vy - t) * .8)}" r="${f(2.6 * k)}"/>`
          + `<path class="top-2" d="M${bx} ${by} L${f(-17 * k)} ${f(by - 9 * k)} L${f(-17 * k)} ${f(by + 9 * k)}Z M${bx} ${by} L${f(17 * k)} ${f(by - 9 * k)} L${f(17 * k)} ${f(by + 9 * k)}Z"/><circle class="top-2 thin" cx="0" cy="${by}" r="${f(5 * k)}"/>`
          + `<path class="thin" fill="${P.cream}" d="M${f(T.tw * .38)} ${f(t + (h - t) * .34)} L${f(T.tw * .38 + 16 * k)} ${f(t + (h - t) * .34)} L${f(T.tw * .38 + 12 * k)} ${f(t + (h - t) * .34 - 10 * k)}Z"/>`,
        arm,
      };
    },
  },
  'fairy-tutu': {
    slot: 'top', label: 'fairy tutu', costume: true, colors: { top: P.blush, 'top-sh': P.rose, 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b);
      const w = b.hipX + b.legR + 4, fw = w + b.thigh * .5 + 18, bot = f(b.thigh * .42 + 10), y0 = f(-b.legR * .6);
      const dots = [[-.7, .45], [-.35, .7], [0, .5], [.35, .72], [.7, .42], [-.15, .25], [.5, .2]]
        .map(([x, y]) => `<circle cx="${f(x * fw)}" cy="${f(y0 + y * (bot - y0 + 10))}" r="${f(3.2 * k)}"/>`).join('');
      return {
        torso: `<path class="top" d="${torsoPath(t + 8, h, T.tw - 4, T.bw)}"/>`
          + `<path class="d" d="M${f(-T.tw * .6)} ${f(t + 12)} Q${f(-T.tw * .3)} ${f(t + 28 * k)} 0 ${f(t + 16)} Q${f(T.tw * .3)} ${f(t + 28 * k)} ${f(T.tw * .6)} ${f(t + 12)}"/>`
          + sprinkle([[0, .42, 12]], 0, t, T.tw, h - t, 'top-2 thin', k)
          + `<path class="top-sh" d="${scallop(0, y0, fw + 6, bot - y0 + 6, 16, 7, 0, 180, false)}Z"/>`
          + `<path class="top" d="${scallop(0, y0 - 4, fw - 4, bot - y0 - 2, 14, 7, 0, 180, false)}Z"/>`
          + `<g class="n" style="fill:var(--top-2)">${dots}</g>`
          + `<rect class="top-sh" x="${f(-T.bw - 2)}" y="${f(y0 - 12)}" width="${f(2 * T.bw + 4)}" height="14" rx="6"/>`,
      };
    },
  },
  'wizard-robe': {
    slot: 'top', label: 'wizard robe', costume: true, colors: { top: P.plum, 'top-sh': P.plumDeep, 'top-2': P.butter },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b);
      const yW = f(h - (h - t) * .2), a = T.bw;
      const y1 = f(b.thigh + b.shin * .8), c = f(T.bw + b.thigh * .3 + 12);
      const moon = (x, y, r) => `<path class="top-2 thin" d="M${f(x)} ${f(y - r)} A${f(r)} ${f(r)} 0 1 0 ${f(x)} ${f(y + r)} A${f(r * .72)} ${f(r * .72)} 0 1 1 ${f(x)} ${f(y - r)}Z"/>`;
      const r = b.armR + 5, end = b.lower - b.handR * .95;
      const arm = limbLayer(b.upper, b.lower, r, 'top', { lowerTo: end - 20, lowerCap: false });
      arm.upper = `<path class="top" d="M${-r - 2} -2 Q0 ${-r - 14} ${r + 2} -2 L${r} ${b.upper} A${r} ${r} 0 0 1 ${-r} ${b.upper}Z"/>`;
      arm.lower += `<path class="top" d="M${-r} ${f(end - 30)} L${r} ${f(end - 30)} L${f(r + 12 * k)} ${f(end + 4)} L${f(-r - 12 * k)} ${f(end + 4)}Z"/><rect class="top-2" x="${f(-r - 13 * k)}" y="${f(end - 4)}" width="${f(2 * r + 26 * k)}" height="9" rx="4"/>`;
      return {
        torso: `<path class="top" d="${torsoPath(t, yW + 8, T.tw, T.bw + 2)}"/>`
          + `<path class="top-2" d="${skirtPath(yW, a, y1, c)}"/><path class="top" d="${skirtPath(yW, a, y1 - 12, c - 3)}"/>`
          + `<path class="d" d="M0 ${t + 10} L0 ${f(y1 - 14)}"/>`
          + sprinkle([[-.55, .3, 8], [.5, .55, 9], [-.3, .78, 7], [.2, .2, 6]], 0, yW, c, y1 - yW, 'top-2 thin', k)
          + moon(-c * .1, yW + (y1 - yW) * .55, 10 * k) + moon(T.tw * .4, t + (h - t) * .35, 9 * k)
          + sprinkle([[-.45, .3, 7]], 0, t, T.tw, h - t, 'top-2 thin', k)
          + `<path fill="none" style="stroke:var(--top-2);stroke-width:${f(7 * k)}" d="M${f(-a)} ${yW} Q0 ${f(yW + 8)} ${f(a)} ${yW}"/><path class="top-2" d="M${f(T.bw * .4)} ${f(yW + 2)} L${f(T.bw * .34)} ${f(yW + 34 * k)} L${f(T.bw * .52)} ${f(yW + 34 * k)}Z"/>`
          + `<path class="top-sh" d="M${-b.neck[0] - 12} ${t - 6} Q0 ${t + 16} ${b.neck[0] + 12} ${t - 6} L${b.neck[0] + 6} ${t + 2} Q0 ${t + 8} ${-b.neck[0] - 6} ${t + 2}Z"/>`,
        arm,
      };
    },
  },
  // ---- over: the feather boa (around the neck, both ends down the front) ----
  'feather-boa': {
    slot: 'over', label: 'feather boa', colors: { over: P.rose, 'over-sh': P.roseDeep, 'over-2': P.blush },
    gen: (b) => {
      const { t, h, T } = tee(b), k = TK(b), R = f(12 * k + 3);
      const pts = [];
      const strand = (x0, y0, x1, y1, bend, n) => { for (let i = 0; i <= n; i++) { const u = i / n; pts.push([x0 + (x1 - x0) * u + Math.sin(u * Math.PI) * bend, y0 + (y1 - y0) * u]); } };
      strand(-T.tw * .5, t - 6, -T.tw * .75, h + 6, -T.tw * .35, 8);
      strand(T.tw * .5, t - 6, T.tw * .55, h - (h - t) * .1, T.tw * .4, 7);
      const across = [...Array(5)].map((_, i) => [-T.tw * .5 + (T.tw * i) / 4, t - 8 + Math.sin((i / 4) * Math.PI) * 4]);
      const fluff = ([x, y], i) => `<path class="${i % 3 === 1 ? 'over-sh' : 'over'}" d="${scallop(f(x), f(y), R, R * .9, 8, 4 * k)}"/>`;
      return {
        torso: across.map(fluff).join('') + pts.map(fluff).join('')
          + `<g class="n" style="fill:var(--over-2)">${pts.filter((_, i) => i % 2).map(([x, y]) => `<circle cx="${f(x - 2)}" cy="${f(y - 3)}" r="${f(3 * k)}"/>`).join('')}</g>`,
      };
    },
  },
  // ---- back: the lightning cape (zigzag hem, a bolt clasp) ----
  'lightning-cape': {
    slot: 'back', label: 'lightning cape', colors: { back: P.blueDeep, 'back-sh': P.denimDeep, 'back-2': P.butter },
    gen: (b) => {
      const t = rel(b, b.torso.top) + 2, bot = f(b.thigh + b.shin * .6), w0 = b.torso.tw - 4, w1 = b.torso.bw + b.thigh * .7, k = TK(b);
      const n = 6, zig = [...Array(n)].map((_, i) => { const x0 = w1 - i * (2 * w1 / n), x1 = x0 - 2 * w1 / n; return `L${f((x0 + x1) / 2)} ${f(bot - 22 * k)} L${f(x1)} ${bot}`; }).join(' ');
      const bolt = (s) => `M${f(s * 2)} ${f(t - 12 * k)} L${f(s * 12 * k)} ${f(t - 12 * k)} L${f(s * 4 * k)} ${f(t + 1)} L${f(s * 12 * k)} ${f(t + 1)} L${f(-s * 6 * k)} ${f(t + 20 * k)} L${f(-s * 1 * k)} ${f(t + 6 * k)} L${f(-s * 8 * k)} ${f(t + 6 * k)}Z`;
      return {
        back: `<path class="back" d="M${-w0} ${t} L${w0} ${t} Q${w0 + 16} ${t + 20} ${f(w1)} ${bot} ${zig} Q${-w0 - 16} ${t + 20} ${-w0} ${t}Z"/>`
          + `<path class="back-sh fo" d="M${f(-w1 * .5)} ${f(bot - 20 * k)} Q${f(-w1 * .3)} ${f((t + bot) / 2)} ${-w0 + 10} ${t + 16} L${-w0 + 18} ${t + 16} Q${f(-w1 * .2)} ${f((t + bot) / 2)} ${f(-w1 * .3)} ${f(bot - 16 * k)}Z"/>`
          + `<path class="back-2 thin" d="M${f(w1 * .55)} ${f(bot - 60 * k)} L${f(w1 * .72)} ${f(bot - 60 * k)} L${f(w1 * .62)} ${f(bot - 40 * k)} L${f(w1 * .74)} ${f(bot - 40 * k)} L${f(w1 * .5)} ${f(bot - 10 * k)} L${f(w1 * .58)} ${f(bot - 34 * k)} L${f(w1 * .47)} ${f(bot - 34 * k)}Z"/>`,
        torso: `<path class="back" d="M${-w0 - 6} ${t - 4} L${-b.neck[0] - 2} ${t + 16} L${-b.neck[0] - 12} ${t + 2}Z"/><path class="back" d="M${w0 + 6} ${t - 4} L${b.neck[0] + 2} ${t + 16} L${b.neck[0] + 12} ${t + 2}Z"/>`
          + `<path class="back-2 thin" d="${bolt(1)}"/>`,
      };
    },
  },
  // ---- hats (head-centre space) ----
  'pirate-hat': {
    slot: 'hat', label: 'pirate hat', hides: ['top'], colors: { hat: P.charDeep, 'hat-sh': P.char, 'hat-2': P.butter },
    gen: (b) => {
      const { rx, ry } = b.head, by = f(-ry * .6), k = rx / 80;
      const crown = `<path class="hat" d="M${f(-rx * .8)} ${by} C${f(-rx * .86)} ${f(-ry * 1.4)} ${f(-rx * .3)} ${f(-ry * 1.52)} 0 ${f(-ry * 1.52)} C${f(rx * .3)} ${f(-ry * 1.52)} ${f(rx * .86)} ${f(-ry * 1.4)} ${f(rx * .8)} ${by}Z"/>`;
      const brim = `M${f(-rx - 30)} ${f(by - 58 * k)} Q${f(-rx * .55)} ${f(by + 8)} 0 ${f(by + 14)} Q${f(rx * .55)} ${f(by + 8)} ${f(rx + 30)} ${f(by - 58 * k)} Q${f(rx + 14)} ${f(by - 46 * k)} ${f(rx * .62)} ${f(by - 34 * k)} Q${f(rx * .3)} ${f(by - 26 * k)} 0 ${f(by - 20 * k)} Q${f(-rx * .3)} ${f(by - 26 * k)} ${f(-rx * .62)} ${f(by - 34 * k)} Q${f(-rx - 14)} ${f(by - 46 * k)} ${f(-rx - 30)} ${f(by - 58 * k)}Z`;
      const sy = f(-ry * 1.12), sk = f(12 * k);
      const bone = (a) => `<rect fill="${P.cream}" class="thin" x="${f(-sk * 1.9)}" y="${f(-3.5 * k)}" width="${f(sk * 3.8)}" height="${f(7 * k)}" rx="${f(3.5 * k)}" transform="translate(0 ${f(+sy + sk * .5)}) rotate(${a})"/>`;
      return {
        head: crown + bone(28) + bone(-28)
          + `<circle fill="${P.cream}" class="thin" cx="0" cy="${sy}" r="${sk}"/><circle class="ink" cx="${f(-sk * .38)}" cy="${f(sy - 1)}" r="${f(2.8 * k)}"/><circle class="ink" cx="${f(sk * .38)}" cy="${f(sy - 1)}" r="${f(2.8 * k)}"/><path class="d" d="M${f(-sk * .35)} ${f(sy + sk * .42)} Q0 ${f(sy + sk * .7)} ${f(sk * .35)} ${f(sy + sk * .42)}"/>`
          + `<path class="hat" d="${brim}"/><path fill="none" style="stroke:var(--hat-2);stroke-width:6" d="M${f(-rx - 20)} ${f(by - 46 * k)} Q${f(-rx * .55)} ${f(by + 2)} 0 ${f(by + 6)} Q${f(rx * .55)} ${f(by + 2)} ${f(rx + 20)} ${f(by - 46 * k)}"/>`,
      };
    },
  },
  'wizard-hat': {
    slot: 'hat', label: 'wizard hat', hides: ['top'], colors: { hat: P.plum, 'hat-sh': P.plumDeep, 'hat-2': P.butter },
    gen: (b) => {
      const { rx, ry } = b.head, by = f(-ry * .66), k = rx / 80;
      const cone = `M${f(-rx * .78)} ${by} C${f(-rx * .55)} ${f(-ry * 1.6)} ${f(-rx * .05)} ${f(-ry * 2.3)} ${f(rx * .62)} ${f(-ry * 2.45)} Q${f(rx * .2)} ${f(-ry * 1.8)} ${f(rx * .78)} ${by}Z`;
      return {
        head: `<path class="hat" d="${cone}"/>`
          + `<path class="hat-2 thin" d="${star(f(-rx * .18), f(-ry * 1.12), f(12 * k), f(5.4 * k))}"/><path class="hat-2 thin" d="${star(f(rx * .12), f(-ry * 1.7), f(9 * k), f(4 * k))}"/><path class="hat-2 thin" d="${star(f(rx * .3), f(-ry * .92), f(7 * k), f(3.2 * k))}"/>`
          + `<circle class="hat-2 thin" cx="${f(rx * .62)}" cy="${f(-ry * 2.45)}" r="${f(8 * k)}"/>`
          + `<rect class="hat-sh" x="${f(-rx - 22)}" y="${f(by - 12)}" width="${f(2 * rx + 44)}" height="22" rx="11"/>`
          + `<path ${tl('var(--hat-2)', 'stroke-width:5')} d="M${f(-rx * .62)} ${f(by - 18)} Q0 ${f(by - 28)} ${f(rx * .62)} ${f(by - 18)}"/>`,
      };
    },
  },
  'top-hat': {
    slot: 'hat', label: 'top hat', hides: ['top'], colors: { hat: P.charDeep, 'hat-sh': P.char, 'hat-2': P.berry },
    gen: (b) => {
      const { rx, ry } = b.head, by = f(-ry * .7), w = f(rx * .58), top = f(-ry * 1.78);
      return {
        head: `<path class="hat" d="M${f(-w)} ${by} L${f(-w - 4)} ${top} Q0 ${f(top - 10)} ${f(w + 4)} ${top} L${w} ${by}Z"/>`
          + `<ellipse class="hat-sh" cx="0" cy="${top}" rx="${f(w + 4)}" ry="9"/>`
          + `<path class="hat-2" d="M${f(-w - 1)} ${f(by - 34)} L${f(w + 1)} ${f(by - 34)} L${w} ${f(by - 12)} L${f(-w)} ${f(by - 12)}Z"/>`
          + `<path class="hat" d="M${f(-rx - 18)} ${f(by - 2)} Q0 ${f(by - 18)} ${f(rx + 18)} ${f(by - 2)} Q${f(rx + 22)} ${f(by + 12)} ${f(rx + 8)} ${f(by + 12)} Q0 ${f(by + 2)} ${f(-rx - 8)} ${f(by + 12)} Q${f(-rx - 22)} ${f(by + 12)} ${f(-rx - 18)} ${f(by - 2)}Z"/>`
          + `<path ${tl('#fff', 'stroke:#fff;stroke-width:5;opacity:.5')} d="M${f(-w * .55)} ${f(top + 16)} L${f(-w * .5)} ${f(by - 44)}"/>`,
      };
    },
  },
  tiara: {
    slot: 'hat', label: 'tiara', colors: { hat: P.steel, 'hat-sh': P.steelDeep, 'hat-2': P.rose },
    gen: (b) => {
      const { rx, ry } = b.head, w = f(rx * .6), y0 = f(-ry * .8), k = rx / 80;
      const band = `M${-w} ${y0} Q0 ${f(y0 - 22)} ${w} ${y0} L${f(w - 5)} ${f(y0 + 9)} Q0 ${f(y0 - 10)} ${f(-w + 5)} ${f(y0 + 9)}Z`;
      const spike = (x, hgt, s) => `<path class="hat" d="M${f(x - 10 * k)} ${f(y0 - 8 - Math.abs(x) * .12)} L${f(x)} ${f(y0 - hgt * k)} L${f(x + 10 * k)} ${f(y0 - 8 - Math.abs(x) * .12)}Z"/>`;
      return {
        head: spike(-w * .55, 30) + spike(w * .55, 30) + spike(0, 50)
          + `<path class="hat" d="${band}"/>`
          + `<path class="hat-2 thin" d="M0 ${f(y0 - 42 * k)} L${f(9 * k)} ${f(y0 - 28 * k)} L0 ${f(y0 - 14 * k)} L${f(-9 * k)} ${f(y0 - 28 * k)}Z"/>`
          + [-1, 1].map((s) => `<circle fill="${P.cream}" class="thin" cx="${f(s * w * .55)}" cy="${f(y0 - 20 * k)}" r="${f(4.5 * k)}"/>`).join('')
          + `<path ${tl('#fff', 'stroke:#fff;stroke-width:4;opacity:.8')} d="M${f(-w * .5)} ${f(y0 - 6)} Q${f(-w * .2)} ${f(y0 - 14)} ${f(w * .1)} ${f(y0 - 12)}"/>`,
      };
    },
  },
  'cat-ears': {
    slot: 'hat', label: 'cat ears', colors: { hat: P.terra, 'hat-sh': P.terraDeep, 'hat-2': P.blush },
    gen: (b) => {
      const { rx, ry } = b.head, k = rx / 82, m = ry / 80;
      const { ex, ny, my } = b.face;
      const ear = (s) => `<path class="hat" d="M${f(s * rx * .22)} ${f(-ry * .86)} Q${f(s * rx * .42)} ${f(-ry * 1.38)} ${f(s * rx * .68)} ${f(-ry * 1.36)} Q${f(s * rx * .86)} ${f(-ry * 1.1)} ${f(s * rx * .8)} ${f(-ry * .6)}Z"/>`
        + `<path class="hat-2 n" d="M${f(s * rx * .36)} ${f(-ry * .9)} Q${f(s * rx * .5)} ${f(-ry * 1.24)} ${f(s * rx * .64)} ${f(-ry * 1.24)} Q${f(s * rx * .72)} ${f(-ry * 1.04)} ${f(s * rx * .68)} ${f(-ry * .78)}Z"/>`;
      const band = `<path class="hat-sh" d="M${f(-76 * k)} ${f(-40 * m)} C${f(-66 * k)} ${f(-86 * m)} ${f(66 * k)} ${f(-86 * m)} ${f(76 * k)} ${f(-40 * m)} L${f(66 * k)} ${f(-36 * m)} C${f(56 * k)} ${f(-72 * m)} ${f(-56 * k)} ${f(-72 * m)} ${f(-66 * k)} ${f(-36 * m)}Z"/>`;
      const wh = (s) => `M${f(s * (ex + 16))} ${f(my - 12)} L${f(s * (ex + 40))} ${f(my - 18)} M${f(s * (ex + 16))} ${f(my - 4)} L${f(s * (ex + 42))} ${f(my - 2)}`;
      return { head: ear(-1) + ear(1) + band + `<path class="d" style="stroke-width:3" d="${wh(-1)} ${wh(1)}"/><ellipse class="hat-2 thin" cx="0" cy="${f(ny - 1)}" rx="7" ry="5"/>` };
    },
  },
  'bunny-ears': {
    slot: 'hat', label: 'bunny ears', colors: { hat: P.white, 'hat-sh': P.oat, 'hat-2': P.blush },
    gen: (b) => {
      const { rx, ry } = b.head, k = rx / 82, m = ry / 80, L = f(ry * 1.08), W = f(19 * k);
      const ear = (s, a, fold) => `<g transform="translate(${f(s * rx * .34)} ${f(-ry * .8)}) rotate(${a})">`
        + (fold ? `<path class="hat" d="M${-W} 0 C${f(-W - 4)} ${f(-L * .5)} ${f(-W * .6)} ${f(-L * .7)} 0 ${f(-L * .7)} C${f(W * .6)} ${f(-L * .7)} ${f(W + 4)} ${f(-L * .5)} ${W} 0Z"/><path class="hat" d="M${f(-W * .7)} ${f(-L * .66)} Q${f(W * .2)} ${f(-L * .9)} ${f(W * 1.9)} ${f(-L * .72)} Q${f(W * 1.4)} ${f(-L * .52)} ${f(W * .7)} ${f(-L * .6)}Z"/><path class="hat-2 n" d="M${f(-W * .45)} ${f(-8)} C${f(-W * .5)} ${f(-L * .4)} ${f(-W * .2)} ${f(-L * .55)} 0 ${f(-L * .55)} C${f(W * .2)} ${f(-L * .55)} ${f(W * .5)} ${f(-L * .4)} ${f(W * .45)} -8Z"/>`
          : `<path class="hat" d="M${-W} 0 C${f(-W - 6)} ${f(-L * .6)} ${f(-W * .6)} ${-L} 0 ${-L} C${f(W * .6)} ${-L} ${f(W + 6)} ${f(-L * .6)} ${W} 0Z"/><path class="hat-2 n" d="M${f(-W * .45)} -8 C${f(-W * .55)} ${f(-L * .55)} ${f(-W * .25)} ${f(-L * .82)} 0 ${f(-L * .82)} C${f(W * .25)} ${f(-L * .82)} ${f(W * .55)} ${f(-L * .55)} ${f(W * .45)} -8Z"/>`)
        + `</g>`;
      const band = `<path class="hat-sh" d="M${f(-76 * k)} ${f(-40 * m)} C${f(-66 * k)} ${f(-86 * m)} ${f(66 * k)} ${f(-86 * m)} ${f(76 * k)} ${f(-40 * m)} L${f(66 * k)} ${f(-36 * m)} C${f(56 * k)} ${f(-72 * m)} ${f(-56 * k)} ${f(-72 * m)} ${f(-66 * k)} ${f(-36 * m)}Z"/>`;
      return { head: ear(-1, -12, false) + ear(1, 14, true) + band };
    },
  },
  'lion-mane': {
    slot: 'hat', label: 'lion mane', hides: ['top', 'hair'], colors: { hat: P.mustard, 'hat-sh': P.mustardDeep, 'hat-2': P.terra },
    gen: (b) => {
      const { rx, ry } = b.head, k = rx / 80, cy = f(ry * .1);
      const outer = scallop(0, 4, rx + 34 * k, ry + 32 * k, 16, 13 * k);
      const hole = ellPath(0, cy, rx * .84, ry * .86);
      const ear = (s) => `<circle class="hat" cx="${f(s * rx * .7)}" cy="${f(-ry * 1.12)}" r="${f(19 * k)}"/><circle class="hat-2 n" cx="${f(s * rx * .7)}" cy="${f(-ry * 1.1)}" r="${f(9 * k)}"/>`;
      const curls = [...Array(10)].map((_, i) => { const a = (i / 10) * Math.PI * 2 + .3, x = Math.cos(a) * (rx + 12 * k), y = 4 + Math.sin(a) * (ry + 10 * k); return `M${f(x)} ${f(y)} q${f(Math.cos(a + 1.2) * 10 * k)} ${f(Math.sin(a + 1.2) * 10 * k)} ${f(Math.cos(a + 2) * 4 * k)} ${f(Math.sin(a + 2) * 12 * k)}`; }).join(' ');
      const tuft = (x, s) => `<path class="hat" d="M${f(x - 16 * k)} ${f(-ry * .78)} Q${f(x + s * 4 * k)} ${f(-ry * .5)} ${f(x + s * 14 * k)} ${f(-ry * .44)} Q${f(x + s * 4 * k)} ${f(-ry * .62)} ${f(x + 16 * k)} ${f(-ry * .78)}Z"/>`;
      const outer2 = scallop(0, 8, rx + 44 * k, ry + 40 * k, 18, 12 * k);
      return {
        head: `<path class="hat-sh" fill-rule="evenodd" d="${outer2} ${hole}"/>`
          + `<path class="hat" fill-rule="evenodd" d="${outer} ${hole}"/><path ${tl('var(--hat-sh)', 'stroke-width:4')} d="${curls}"/>`
          + ear(-1) + ear(1) + tuft(-rx * .22, -1) + tuft(0, 1) + tuft(rx * .22, 1)
          + `<path class="hat-2 thin" d="M${f(-9 * k)} ${f(b.face.ny - 5)} L${f(9 * k)} ${f(b.face.ny - 5)} Q${f(8 * k)} ${f(b.face.ny + 5)} 0 ${f(b.face.ny + 7)} Q${f(-8 * k)} ${f(b.face.ny + 5)} ${f(-9 * k)} ${f(b.face.ny - 5)}Z"/>`,
      };
    },
  },
  // ---- face (head-centre space, eye metrics) ----
  masquerade: {
    slot: 'face', label: 'masquerade mask', colors: { face: P.teal, 'face-sh': P.tealDeep },
    gen: (b) => {
      const { ex, ey } = b.face, w = ex + 28;
      const hole = (x) => `M${x - 13} ${ey} C${x - 13} ${ey - 14} ${x + 13} ${ey - 14} ${x + 13} ${ey} C${x + 13} ${ey + 12} ${x - 13} ${ey + 12} ${x - 13} ${ey}Z`;
      const body = `M${-w - 8} ${ey - 30} C${-w + 8} ${ey - 24} ${-14} ${ey - 26} 0 ${ey - 16} C14 ${ey - 26} ${w - 8} ${ey - 24} ${w + 8} ${ey - 30} C${w + 6} ${ey + 2} ${w - 4} ${ey + 20} ${ex + 4} ${ey + 20} C${ex - 12} ${ey + 20} 8 ${ey + 8} 0 ${ey + 10} C-8 ${ey + 8} ${-ex + 12} ${ey + 20} ${-ex - 4} ${ey + 20} C${-w + 4} ${ey + 20} ${-w - 6} ${ey + 2} ${-w - 8} ${ey - 30}Z`;
      const feather = `<g transform="translate(${w - 2} ${ey - 20}) rotate(28)"><path class="face-sh" d="M0 0 C-14 -20 -12 -52 0 -70 C12 -52 14 -20 0 0Z"/><path class="d" d="M0 -4 L0 -58 M0 -22 L-7 -30 M0 -36 L7 -44 M0 -46 L-6 -52"/></g>`;
      return { head: feather + `<path class="face" fill-rule="evenodd" d="${body} ${hole(-ex)} ${hole(ex)}"/>`
        + [-1, 1].map((s) => [.2, .5, .8].map((u) => `<circle class="n" fill="${P.butter}" cx="${f(s * (6 + u * (w - 4)))}" cy="${f(ey - 20 - u * 8 + (u > .7 ? 2 : 0))}" r="3"/>`).join('')).join('')
        + `<circle class="thin" fill="${P.butter}" cx="0" cy="${ey - 8}" r="5"/>` };
    },
  },
  'sparkle-mask': {
    slot: 'face', label: 'sparkly hero mask', colors: { face: P.rose, 'face-sh': P.roseDeep },
    gen: (b) => {
      const { ex, ey } = b.face, w = ex + 26, hole = (x) => `M${x - 13} ${ey} C${x - 13} ${ey - 14} ${x + 13} ${ey - 14} ${x + 13} ${ey} C${x + 13} ${ey + 13} ${x - 13} ${ey + 13} ${x - 13} ${ey}Z`;
      return { head: `<path class="face" fill-rule="evenodd" d="M${-w} ${ey - 16} C${-w + 10} ${ey - 28} ${-12} ${ey - 24} 0 ${ey - 16} C12 ${ey - 24} ${w - 10} ${ey - 28} ${w} ${ey - 16} C${w + 4} ${ey + 4} ${w - 6} ${ey + 20} ${ex + 4} ${ey + 20} C${ex - 12} ${ey + 20} 8 ${ey + 8} 0 ${ey + 10} C-8 ${ey + 8} ${-ex + 12} ${ey + 20} ${-ex - 4} ${ey + 20} C${-w + 6} ${ey + 20} ${-w - 4} ${ey + 4} ${-w} ${ey - 16}Z ${hole(-ex)} ${hole(ex)}"/>`
        + `<path class="face" d="M${w - 2} ${ey - 10} L${w + 20} ${ey - 20} L${w + 16} ${ey - 4}Z M${-w + 2} ${ey - 10} L${-w - 20} ${ey - 20} L${-w - 16} ${ey - 4}Z"/>`
        + `<path class="thin" fill="${P.butter}" d="${star(0, ey - 10, 9, 4)}"/><path class="thin" fill="${P.butter}" d="${star(-w + 8, ey - 14, 6, 2.6)}"/><path class="thin" fill="${P.butter}" d="${star(w - 8, ey - 14, 6, 2.6)}"/>`
        + `<g class="n" fill="#fff" opacity=".85">${[[-ex - 18, ey + 8], [ex + 18, ey + 8], [-8, ey + 2], [10, ey - 2], [-ex + 2, ey - 18], [ex - 2, ey - 18]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('')}</g>` };
    },
  },
});

export const SLOTS = ['back', 'bottom', 'top', 'over', 'belt', 'shoes', 'hands', 'face', 'hat'];
/** Pieces per slot in the Character Maker's order. */
export const WEAR_ORDER = {
  top: ['tee-star', 'tee-stripe', 'tee-dots', 'hoodie', 'cardigan', 'chef-coat', 'sparkle-top', 'hero-suit'],
  bottom: ['pants', 'leggings', 'shorts', 'skirt', 'tutu'],
  shoes: ['sneakers', 'boots', 'sandals'],
  hat: [null, 'headband', 'bow', 'beanie', 'cap', 'hijab', 'crown', 'chef-hat', 'hard-hat'],
  face: [null, 'glasses', 'square-glasses', 'sunglasses', 'hero-mask'],
  over: [null, 'apron', 'safety-vest'],
  back: [null, 'towel-cape', 'hero-cape', 'wings'],
  // Booth tabs since mhf.20; worn children like hat/face/over/back.
  belt: [null, 'tool-belt'],
  hands: [null, 'gloves'],
};

// Colour choices per slot variable prefix: tapping the chosen piece again in
// the Character Maker steps through these ([base, shade, second]).
const C3 = (a, b, c) => [P[a] || a, P[b] || b, P[c] || c];
export const OUTFIT_COLORS = {
  top: [C3('blue', 'blueDeep', 'butter'), C3('sage', 'sageDeep', 'cream'), C3('rose', 'roseDeep', 'cream'), C3('mustard', 'mustardDeep', 'cream'),
    C3('teal', 'tealDeep', 'cream'), C3('lav', 'plum', 'white'), C3('terra', 'terraDeep', 'butter'), C3('white', 'oat', 'berry'), C3('charHi', 'char', 'butter')],
  bot: [C3('denim', 'denimDeep', 'white'), C3('plum', 'plumDeep', 'white'), C3('mustard', 'mustardDeep', 'white'), C3('rose', 'roseDeep', 'white'),
    C3('brown', 'brownDeep', 'white'), C3('sage', 'sageDeep', 'white'), C3('charDeep', 'char', 'white'), C3('blush', 'rose', 'white')],
  shoe: [C3('white', 'rose', 'white'), C3('woodDark', 'woodDeep', 'white'), C3('charDeep', 'char', 'white'), C3('berry', '#B9575B', 'white'), C3('teal', 'tealDeep', 'white'), C3('butter', 'mustard', 'white')],
  hat: [C3('teal', 'tealDeep', 'cream'), C3('rose', 'roseDeep', 'cream'), C3('mustard', 'mustardDeep', 'butter'), C3('berry', '#B9575B', 'cream'), C3('lav', 'plum', 'white'), C3('sage', 'sageDeep', 'cream'), C3('white', 'oat', 'cream'), C3('charHi', 'char', 'cream')],
  face: [C3('charDeep', 'char', 'white'), C3('plum', 'plumDeep', 'white'), C3('berry', '#B9575B', 'white'), C3('teal', 'tealDeep', 'white')],
  over: [C3('rose', 'roseDeep', 'cream'), C3('butter', 'mustard', 'white'), C3('sage', 'sageDeep', 'cream'), C3('#EE9A55', 'terraDeep', 'cream'), C3('blue', 'blueDeep', 'cream')],
  back: [C3('terra', 'terraDeep', 'cream'), C3('berry', '#B9575B', 'butter'), C3('lav', 'sky', 'white'), C3('teal', 'tealDeep', 'butter'), C3('mustard', 'mustardDeep', 'cream')],
  belt: [C3('wood', 'woodDeep', 'mustard'), C3('woodDark', 'woodDeep', 'steel'), C3('terra', 'terraDeep', 'butter'), C3('sage', 'sageDeep', 'mustard')],
  hands: [C3('butter', 'mustardDeep', '#EE9A55'), C3('#EE9A55', 'terraDeep', 'butter'), C3('sky', 'blueDeep', 'blue'), C3('rose', 'roseDeep', 'berry'), C3('sage', 'sageDeep', 'leaf')],
};
