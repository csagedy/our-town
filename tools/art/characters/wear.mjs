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

export const SLOTS = ['back', 'bottom', 'top', 'over', 'shoes', 'face', 'hat'];
