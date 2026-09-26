// Face atoms and expressions (docs/STYLE.md section 4, docs/rig.md "Face").
// A face is four slots, each showing one atom: eyes, brows, mouth, extras.
// Atoms are drawn in head-centre space from the body type's face metrics, so
// one expression table works for every body type. Nose is always shown.
import { P } from '../palette.mjs';

const dot = (x, y, rx, ry) => `<ellipse class="ink" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
const arcUp = (x, y) => `<path class="d" style="stroke-width:5" d="M${x - 10} ${y + 4} Q${x} ${y - 9} ${x + 10} ${y + 4}"/>`;
const arcDown = (x, y) => `<path class="d" style="stroke-width:5" d="M${x - 10} ${y - 2} Q${x} ${y + 8} ${x + 10} ${y - 2}"/>`;
const lid = (x, y) => `<path class="ink" d="M${x - 9} ${y - 3} L${x + 9} ${y - 3} Q${x + 9} ${y + 10} ${x} ${y + 10} Q${x - 9} ${y + 10} ${x - 9} ${y - 3}Z"/>`;
const shut = (x, y) => `<path class="d" style="stroke-width:4.5" d="M${x - 10} ${y + 2} Q${x} ${y + 6} ${x + 10} ${y + 2}"/>`;
const lashAt = (x, y, s) => `<path class="d" style="stroke-width:3.5" d="M${x + s * 7} ${y - 5} l${s * 7} -4"/>`;

/** All face atoms for face metrics m. Returns { eyes, brows, mouth, extras, nose, lashes }. */
export function faceAtoms(m) {
  const { ex, ey, ny, my, eyeRx: rx, eyeRy: ry, blushX, blushY } = m;
  const both = (fn) => fn(-ex, -1) + fn(ex, 1);
  const eyes = {
    dot: both((x) => dot(x, ey, rx, ry)),
    wide: both((x) => dot(x, ey - 2, rx + 1, ry + 2)),
    happy: both((x) => arcUp(x, ey)),            // ^ ^  laughing, cheering
    content: both((x) => arcDown(x, ey)),        // u u  yum, singing
    closed: both((x) => shut(x, ey)),            // blink, asleep
    lid: both((x) => lid(x, ey)),                // half-lidded: grumpy, sleepy
    sad: both((x) => dot(x, ey + 2, rx - .5, ry - 1.5)),
    wink: arcUp(-ex, ey) + dot(ex, ey, rx, ry),
  };
  // Lashes follow the eye atom (only for characters with lashes: true).
  const lashes = {
    dot: both((x, s) => lashAt(x, ey, s)), wide: both((x, s) => lashAt(x, ey - 2, s)),
    happy: both((x, s) => lashAt(x, ey + 4, s)), content: both((x, s) => lashAt(x, ey + 1, s)),
    closed: both((x, s) => lashAt(x, ey + 5, s)), lid: both((x, s) => lashAt(x, ey, s)),
    sad: both((x, s) => lashAt(x, ey + 2, s)), wink: lashAt(-ex, ey + 4, -1) + lashAt(ex, ey, 1),
  };
  const bw = (x, y, s, tilt) => `<path class="d" style="stroke-width:3.5" d="M${x - 9} ${y + s * tilt} L${x + 9} ${y - s * tilt}"/>`;
  const arch = (x, y) => `<path class="d" style="stroke-width:3.5" d="M${x - 9} ${y + 3} Q${x} ${y - 5} ${x + 9} ${y + 3}"/>`;
  const by = ey - 22;
  const brows = {
    none: '',
    arch: arch(-ex, by) + arch(ex, by),
    angry: bw(-ex + 2, by + 4, -1, 4) + bw(ex - 2, by + 4, 1, 4),   // inner ends low
    worried: bw(-ex + 2, by + 2, 1, 4) + bw(ex - 2, by + 2, -1, 4), // inner ends high
  };
  const mouth = {
    smile: `<path class="d" style="stroke-width:3.5" d="M-9 ${my} Q0 ${my + 8} 9 ${my}"/>`,
    grin: `<path class="thin" fill="${P.mouth}" d="M-13 ${my - 3} Q0 ${my} 13 ${my - 3} Q11 ${my + 14} 0 ${my + 14} Q-11 ${my + 14} -13 ${my - 3}Z"/><path class="n" fill="${P.tongue}" d="M-6 ${my + 10} Q0 ${my + 5} 6 ${my + 10} Q0 ${my + 13} -6 ${my + 10}Z"/>`,
    laugh: `<path class="thin" fill="${P.mouth}" d="M-15 ${my - 5} Q0 ${my - 2} 15 ${my - 5} Q13 ${my + 17} 0 ${my + 17} Q-13 ${my + 17} -15 ${my - 5}Z"/><path class="n" fill="${P.tongue}" d="M-7 ${my + 12} Q0 ${my + 6} 7 ${my + 12} Q0 ${my + 16} -7 ${my + 12}Z"/>`,
    oh: `<ellipse class="thin" fill="${P.mouth}" cx="0" cy="${my + 2}" rx="6" ry="8"/>`,
    sing: `<ellipse class="thin" fill="${P.mouth}" cx="0" cy="${my + 3}" rx="9" ry="11"/><path class="n" fill="${P.tongue}" d="M-5 ${my + 9} Q0 ${my + 5} 5 ${my + 9} Q0 ${my + 12} -5 ${my + 9}Z"/>`,
    frown: `<path class="d" style="stroke-width:3.5" d="M-9 ${my + 5} Q0 ${my - 3} 9 ${my + 5}"/>`,
    wobble: `<path class="d" style="stroke-width:3.5" d="M-11 ${my + 4} q3.7 -5 7.3 0 q3.7 5 7.3 0 q3.7 -5 7.3 0"/>`,
    flat: `<path class="d" style="stroke-width:3.5" d="M-7 ${my + 2} L7 ${my + 2}"/>`,
    small: `<ellipse class="thin" fill="${P.mouth}" cx="0" cy="${my + 3}" rx="4" ry="3.5"/>`,
    tongue: `<path class="thin" fill="${P.tongue}" d="M-2 ${my + 4} L10 ${my + 4} L10 ${my + 11} Q10 ${my + 16} 5 ${my + 16} Q0 ${my + 16} 0 ${my + 11}Z"/><path class="d" style="stroke-width:3.5" d="M-11 ${my} Q0 ${my + 7} 13 ${my}"/>`,
    yuck: `<path class="d" style="stroke-width:3.5" d="M-12 ${my + 4} Q-6 ${my - 2} 0 ${my + 3} Q6 ${my + 8} 12 ${my + 1}"/><path class="thin" fill="${P.tongue}" d="M-4 ${my + 3} Q0 ${my + 14} 5 ${my + 4}Z"/>`,
  };
  const blush = [-1, 1].map((s) => `<ellipse class="n" fill="${P.rose}" opacity=".45" cx="${s * blushX}" cy="${blushY}" rx="13" ry="7"/>`).join('');
  const extras = {
    none: '',
    blush,
    tear: `<path class="thin" fill="${P.sky}" d="M${ex + 4} ${ey + 14} Q${ex + 11} ${ey + 26} ${ex + 4} ${ey + 30} Q${ex - 3} ${ey + 26} ${ex + 4} ${ey + 14}Z"/>`,
    sweat: `<path class="thin" fill="${P.sky}" d="M${ex + 40} ${-40} Q${ex + 49} ${-26} ${ex + 40} ${-21} Q${ex + 31} ${-26} ${ex + 40} ${-40}Z"/>`,
    zzz: `<g class="n" fill="${P.ink}"><path d="M${ex + 44} -70 h16 l-14 16 h14 v4 h-20 l14 -16 h-10Z"/><path d="M${ex + 64} -96 h11 l-9 10 h9 v3 h-14 l9 -10 h-6Z"/></g>`,
    hearts: `<g transform="translate(${ex + 46} -58) scale(.9)"><path class="thin" fill="${P.rose}" d="M0 8 C-12 0 -12 -10 -5 -10 C-2 -10 0 -7 0 -5 C0 -7 2 -10 5 -10 C12 -10 12 0 0 8Z"/></g>`,
    notes: `<g transform="translate(${ex + 50} -54)"><path class="d" d="M6 -22 L6 0 M6 -22 L16 -18"/><ellipse class="ink" cx="1" cy="1" rx="6" ry="4.5" transform="rotate(-20 1 1)"/></g>`,
  };
  const nose = `<ellipse class="skin-sh thin" cx="0" cy="${ny}" rx="7" ry="5.5"/>`;
  return { eyes, brows, mouth, extras, nose, lashes };
}

// Expressions: slot -> atom. "blush" extras are added on top for characters
// with blush: true unless the expression already sets extras.
export const EXPRESSIONS = {
  neutral: { eyes: 'dot', brows: 'none', mouth: 'smile', extras: 'none' },
  happy: { eyes: 'dot', brows: 'none', mouth: 'grin', extras: 'none' },
  laughing: { eyes: 'happy', brows: 'none', mouth: 'laugh', extras: 'blush' },
  surprised: { eyes: 'wide', brows: 'arch', mouth: 'oh', extras: 'none' },
  sad: { eyes: 'sad', brows: 'worried', mouth: 'wobble', extras: 'tear' },
  yum: { eyes: 'content', brows: 'none', mouth: 'tongue', extras: 'blush' },
  sleepy: { eyes: 'closed', brows: 'none', mouth: 'small', extras: 'zzz' },
  grumpy: { eyes: 'lid', brows: 'angry', mouth: 'frown', extras: 'none' },
  cheeky: { eyes: 'wink', brows: 'none', mouth: 'tongue', extras: 'blush' },
  singing: { eyes: 'content', brows: 'arch', mouth: 'sing', extras: 'notes' },
  wheee: { eyes: 'happy', brows: 'arch', mouth: 'laugh', extras: 'blush' },
  yuck: { eyes: 'lid', brows: 'worried', mouth: 'yuck', extras: 'sweat' },
  love: { eyes: 'content', brows: 'none', mouth: 'grin', extras: 'hearts' },
};
// Blink: swap the eyes slot to 'closed' for ~120 ms (the rig keeps the rest).
export const BLINK = 'closed';
