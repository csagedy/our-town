// Construction site behaviors (P2c.1, docs/design.md 3.3).
//
//   buildpiece  a block, plank, roof, window, door...: its look is its paint
//               colour (props.paint, set by a paintbrush in the site scene);
//               a door (states) also opens and shuts on a tap (props.open),
//               its look '<state>' or '<state>-<colour>'. Other pieces clack
//               on a tap, higher the higher they sit. The grid snapping, the
//               hammer lock and the paint itself are the site scene's
//               (src/scenes/site.js), because they need the room.
//   hose        tap: the hose sprays (props.spray) with a fan of water drops
//               and a whoosh; tap again: coiled up.
//
// Pure except what the reaction context does.

import { defineBehavior } from './registry.js';

const isStrList = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every((s) => typeof s === 'string' && s);

/** The look of a build piece from its props. Pure. p.states: [shut, open] for a door, or null. */
export function pieceLook(props = {}, p = {}) {
  const paint = typeof props.paint === 'string' && props.paint !== 'natural' ? props.paint : null;
  if (p.states) {
    const state = p.states[props.open ? 1 : 0];
    return paint ? `${state}-${paint}` : state;
  }
  return paint;
}

defineBehavior('buildpiece', {
  params: {
    states: null,       // [closed, open] looks for a door; null for a plain piece
    sound: 'clack',
  },
  check(p, { sounds }) {
    if (p.states != null && !isStrList(p.states, 2)) return 'states must be [closed, open]';
    if (sounds && !sounds.includes(p.sound)) return 'unknown sound ' + p.sound;
    return null;
  },
  look: (e, p) => pieceLook(e.props, p),
  onTap(e, rx, p) {
    if (p.states) {
      const open = !e.props.open;
      rx.set('open', open);
      rx.play(open ? 'squeak' : 'knock', { pitch: open ? 1.2 : 1.1 });
      rx.squish({ amount: 0.6 });
      if (open) rx.burst('sparkle', { count: 4 });
      return true;
    }
    // Higher up, higher note (the stack pitch, design 3.3 #1).
    const up = rx.room && rx.room.id === 'construction/yard' ? Math.max(0, (880 - e.y) / 40) : 0;
    rx.play(p.sound, { pitch: 0.9 + Math.min(1.2, up * 0.09) });
    rx.squish({ amount: 0.8 });
    return true;
  },
});

defineBehavior('hose', {
  params: {
    key: 'spray',
    looks: ['coiled', 'spray'],
    nozzle: [0.95, 0.55],   // where the water comes out: fractions of its box from the left and the bottom
  },
  check: (p) => (isStrList(p.looks, 2) ? null : 'looks must be [off, on]'),
  look: (e, p) => p.looks[e.props[p.key] ? 1 : 0],
  onTap(e, rx, p) {
    const on = !e.props[p.key];
    rx.set(p.key, on);
    rx.squish({ amount: 0.7 });
    if (on) {
      rx.play('whoosh', { pitch: 1.5 });
      rx.play('bubble', { pitch: 0.7 });
      // rx.burst centres on the body (0.6 of its height up): offset to the nozzle.
      const s = rx.size();
      rx.burst('drop', { count: 12, spread: 130, angle: -25, arc: 50, stagger: 30, ox: s.w * (p.nozzle[0] - 0.5), oy: s.h * (0.6 - p.nozzle[1]) });
    } else rx.play('squeak', { pitch: 0.8 });
    return true;
  },
});
