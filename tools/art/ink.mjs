// Drawing primitives shared by props, rooms and characters (docs/STYLE.md).
// Everything returns SVG text. Coordinates are art units, +y down.
import { P } from './palette.mjs';

export const f = (n) => +(+n).toFixed(1);

/** Place inner at (x, y), scaled by s and rotated r degrees. */
export const at = (x, y, s, inner, r = 0) =>
  `<g transform="translate(${f(x)} ${f(y)})${s !== 1 ? ` scale(${s})` : ''}${r ? ` rotate(${r})` : ''}">${inner}</g>`;

/** Tone line attributes (a darker tone of the surface, not ink). */
export const tl = (c, extra = '') => `class="tl" style="stroke:${c};${extra}"`;

export const flipX = (inner) => `<g transform="scale(-1 1)">${inner}</g>`;

/** Bumpy ellipse outline (curly hair, clouds, flowers, chef hat). */
export function scallop(cx, cy, rx, ry, n, bump, a0 = 0, a1 = 360, close = true) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const vx = mx - cx, vy = my - cy, L = Math.hypot(vx, vy) || 1;
    d += ` Q${f(mx + (vx / L) * bump)} ${f(my + (vy / L) * bump)} ${f(x1)} ${f(y1)}`;
  }
  return close ? d + 'Z' : d;
}

export function star(cx, cy, R, r, n = 5) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2, rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(a))} ${f(cy + rr * Math.sin(a))}`;
  }
  return d + 'Z';
}

export const heart = (x, y, s, c, cls = 'thin') =>
  `<path class="${cls}" fill="${c}" transform="translate(${x} ${y}) scale(${s})" d="M0 8 C-12 0 -12 -10 -5 -10 C-2 -10 0 -7 0 -5 C0 -7 2 -10 5 -10 C12 -10 12 0 0 8Z"/>`;

export const rot = (x, y, deg) => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/** A pointed leaf of length len and half-width w, rotated ang, based at (x, y). */
export const leaf = (len, w, ang, c = P.leaf, x = 0, y = 0) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><path fill="${c}" d="M0 0 C${w} ${f(-len * .25)} ${w} ${f(-len * .75)} 0 ${-len} C${-w} ${f(-len * .75)} ${-w} ${f(-len * .25)} 0 0Z"/><path class="d" d="M0 -3 L0 ${f(-len * .68)}"/></g>`;

/** Rounded rectangle path data. */
export const rrect = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  return `M${f(x + r)} ${f(y)} L${f(x + w - r)} ${f(y)} Q${f(x + w)} ${f(y)} ${f(x + w)} ${f(y + r)} L${f(x + w)} ${f(y + h - r)} Q${f(x + w)} ${f(y + h)} ${f(x + w - r)} ${f(y + h)} L${f(x + r)} ${f(y + h)} Q${f(x)} ${f(y + h)} ${f(x)} ${f(y + h - r)} L${f(x)} ${f(y + r)} Q${f(x)} ${f(y)} ${f(x + r)} ${f(y)}Z`;
};

/** Steam wisps (white tone lines), rising from (x, y). */
export const steam = (x, y) =>
  `<path ${tl('#fff', 'stroke:#fff;stroke-width:6;opacity:.85')} d="M${x} ${y} q-12 -24 0 -48 q12 -24 0 -48 M${x + 26} ${y + 6} q-12 -24 0 -48 q12 -24 0 -48"/>`;
