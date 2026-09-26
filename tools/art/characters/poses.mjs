// Poses as joint angles (docs/rig.md "Poses"). Degrees. Limb angles are
// OUTWARD-POSITIVE: 0 hangs straight down, + swings the limb away from the
// body's centre line (up and out), - swings it across the body. The same
// numbers therefore mean the same thing on the left and the right side.
//   arm: [shoulder, elbow, wrist]   elbow/wrist are relative to the parent segment
//   leg: [hip, knee, ankle, thighScale]   thighScale < 1 foreshortens the thigh
//                                          (a knee pointing at the viewer: sitting)
//   torso: lean (+ = clockwise on screen), head: tilt around the chin (+ = clockwise)
//   root: [dx, dy, rotate] of the pelvis; ground: true shifts the root so the
//         lowest ankle stays at standing height (feet stay on the floor)
//   front: arms drawn in front of the head (default: behind it)
//   legsFront: legs drawn over the body (sitting: knees toward the viewer)
//   anchor: which anchor the runtime puts on the target point: feet | seat | back
// L and R are SCREEN left and right (the character's own right hand is L).
export const POSES = {
  stand: { armL: [8, -4, 0], armR: [8, -4, 0], legL: [2, 0, 0], legR: [2, 0, 0], torso: 0, head: 0, root: [0, 0, 0], ground: true, anchor: 'feet' },
  wave: { armL: [8, -4, 0], armR: [112, 62, 10], legL: [2, 0, 0], legR: [2, 0, 0], torso: -2, head: -5, root: [0, 0, 0], ground: true, anchor: 'feet' },
  wave2: { armL: [8, -4, 0], armR: [106, 38, 0], legL: [2, 0, 0], legR: [2, 0, 0], torso: -2, head: -5, root: [0, 0, 0], ground: true, anchor: 'feet' },
  hold: { armL: [18, -100, 0], armR: [18, -100, 0], legL: [2, 0, 0], legR: [2, 0, 0], torso: 0, head: 3, root: [0, 0, 0], ground: true, anchor: 'feet', front: ['L', 'R'] },
  'hold-up': { armL: [160, -48, 0], armR: [160, -48, 0], legL: [4, 0, 0], legR: [4, 0, 0], torso: 0, head: -3, root: [0, 0, 0], ground: true, anchor: 'feet' },
  cheer: { armL: [138, 18, 0], armR: [138, 18, 0], legL: [6, -2, 0], legR: [6, -2, 0], torso: 0, head: 5, root: [0, -14, 0], ground: false, anchor: 'feet' },
  sing: { armL: [58, 24, 0], armR: [58, 24, 0], legL: [3, 0, 0], legR: [3, 0, 0], torso: 0, head: -6, root: [0, 0, 0], ground: true, anchor: 'feet' },
  sit: { armL: [14, -18, 0], armR: [14, -18, 0], legL: [22, -38, 16, 0.42], legR: [22, -38, 16, 0.42], torso: 0, head: 3, root: [0, 0, 0], ground: true, anchor: 'seat', legsFront: true },
  'sit-eat': { armL: [14, -18, 0], armR: [22, -122, 0], legL: [22, -38, 16, 0.42], legR: [22, -38, 16, 0.42], torso: 0, head: -4, root: [0, 0, 0], ground: true, anchor: 'seat', legsFront: true, front: ['R'] },
  'sit-cross': { armL: [20, -58, 0], armR: [20, -58, 0], legL: [80, -164, 70, 0.62], legR: [80, -164, 70, 0.62], torso: 0, head: 4, root: [0, 0, 0], ground: false, anchor: 'seat', legsFront: true },
  'walk-a': { armL: [14, -34, 0, 0.8], armR: [16, 6, 0], legL: [2, 0, 0], legR: [8, -8, 10, 0.5], torso: 2, head: 3, root: [0, 0, 0], ground: true, anchor: 'feet' },
  'walk-b': { armL: [16, 6, 0], armR: [14, -34, 0, 0.8], legL: [8, -8, 10, 0.5], legR: [2, 0, 0], torso: -2, head: -3, root: [0, 0, 0], ground: true, anchor: 'feet' },
  lie: { armL: [12, -10, 0], armR: [-18, -70, 0], legL: [4, 2, -90], legR: [44, -88, 0], torso: 0, head: 70, root: [0, 0, -90], ground: false, anchor: 'back' },
};
