// Character rig assembler: turns rig data (assets/characters/rig.json, built
// by tools/art/build.mjs) plus a character spec, a pose and an expression into
// live SVG text, and computes the pose's forward kinematics (part transforms
// and anchors). Pure functions, no DOM: the build (contact sheet) and the
// dev preview (tools/rig-preview.html) use it too. Contract: docs/rig.md.
//
//   const rig = await (await fetch('assets/characters/rig.json')).json();
//   const out = renderCharacter(rig, rig.characters[0], { pose: 'wave', expr: 'happy' });
//   el.innerHTML = svgWrap(rig, out);    // or put out.svg inside an existing <svg>
//
// Posing at runtime (P1.10): every drawn fragment is a <g data-f="frame">;
// poseFrames() gives a matrix per frame, so a pose change (or a tween step on
// the joint angles) is setAttribute('transform', ...) on those groups.

// ---- 2D affine matrices [a, b, c, d, e, f] (SVG matrix order) ----
const ID = [1, 0, 0, 1, 0, 0];
function mul(m, n) {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
const T = (x, y) => [1, 0, 0, 1, x, y];
const S = (x, y) => [x, 0, 0, y, 0, 0];
function R(deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}
function chain() { let m = ID; for (let i = 0; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
export function applyMatrix(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
const r2 = (n) => Math.round(n * 1000) / 1000;
export const matrixAttr = (m) => `matrix(${m.map(r2).join(' ')})`;

const SIDES = [['L', 1], ['R', -1]];   // screen left / right; sign turns outward-positive angles into SVG rotation

function fk(sk, pose, dy) {
  const [rdx, rdy, rrot] = pose.root || [0, 0, 0];
  const root = chain(T(rdx, sk.hipY + rdy + dy), R(rrot));
  const torso = mul(root, R(pose.torso || 0));
  const fr = { root, torso };
  for (const [side, sg] of SIDES) {
    const [a1, a2, a3, s = 1] = pose['leg' + side] || [0, 0, 0];
    const hx = side === 'L' ? -sk.hip[0] : sk.hip[0];
    const u = chain(root, T(hx, 0), R(sg * a1));
    const lo = chain(u, T(0, sk.thigh * s), R(sg * a2));
    fr['legU' + side] = mul(u, S(1, s));
    fr['legL' + side] = lo;
    fr['foot' + side] = chain(lo, T(0, sk.shin), R(sg * a3), side === 'L' ? S(-1, 1) : ID);
    const [b1, b2, b3, t = 1] = pose['arm' + side] || [0, 0, 0];
    const sx = side === 'L' ? -sk.shoulder[0] : sk.shoulder[0];
    const au = chain(torso, T(sx, sk.shoulder[1]), R(sg * b1));
    const al = chain(au, T(0, sk.upper * t), R(sg * b2));
    fr['armU' + side] = mul(au, S(1, t));
    fr['armL' + side] = al;
    fr['hand' + side] = chain(al, T(0, sk.lower), R(sg * b3), side === 'L' ? S(-1, 1) : ID);
  }
  fr.head = chain(torso, T(sk.chin[0], sk.chin[1]), R(pose.head || 0), T(0, -sk.headRy));
  return fr;
}

/** Frame matrices and anchors for a pose on a body skeleton. */
export function poseFrames(sk, pose) {
  let fr = fk(sk, pose, 0);
  if (pose.ground) {
    const standAnkle = sk.hipY + sk.thigh + sk.shin;
    const low = Math.max(applyMatrix(fr.legLL, 0, sk.shin)[1], applyMatrix(fr.legLR, 0, sk.shin)[1]);
    fr = fk(sk, pose, standAnkle - low);
  }
  const pelvis = applyMatrix(fr.root, 0, 0);
  const anchors = {
    feet: [r2(pelvis[0]), 0],
    seat: applyMatrix(fr.root, 0, sk.legR).map(r2),
    back: applyMatrix(fr.root, -sk.halfW, 0).map(r2),
    handL: applyMatrix(fr.handL, 0, 0).map(r2),
    handR: applyMatrix(fr.handR, 0, 0).map(r2),
    mouth: applyMatrix(fr.head, sk.mouth[0], sk.mouth[1]).map(r2),
    head: applyMatrix(fr.head, 0, 0).map(r2),
  };
  return { frames: fr, anchors };
}

/** CSS custom properties for a character spec (skin, hair, sock, worn pieces' colours + overrides). */
export function charVars(rig, spec) {
  const v = { '--skin': spec.skin[0], '--skin-sh': spec.skin[1], '--hair': spec.hair.color[0], '--hair-sh': spec.hair.color[1], '--sock': spec.sock || '#FBF3E8' };
  const wear = spec.wear || {};
  for (const slot of Object.keys(wear)) {
    const item = rig.wear[wear[slot]];
    if (!item) continue;
    for (const k of Object.keys(item.colors)) v['--' + k] = item.colors[k];
  }
  const c = spec.colors || {};
  for (const k of Object.keys(c)) v['--' + k] = c[k];
  return Object.keys(v).map((k) => `${k}:${v[k]}`).join(';');
}

/** Resolve an expression name or {eyes, brows, mouth, extras} object. */
export function resolveExpr(rig, expr, blink) {
  const e = typeof expr === 'string' ? (rig.expressions[expr] || rig.expressions.neutral) : Object.assign({}, rig.expressions.neutral, expr);
  return blink ? Object.assign({}, e, { eyes: rig.blink }) : e;
}

/** Face slot SVG for one atom (runtime expression swaps set innerHTML of the slot group). */
export function faceSlot(rig, spec, slot, atom) {
  const face = rig.bodies[spec.body].face;
  let s = (face[slot] && face[slot][atom]) || '';
  if (slot === 'eyes' && spec.lashes && face.lashes[atom]) s += face.lashes[atom];
  if (slot === 'extras' && spec.blush && atom !== 'blush') s = face.extras.blush + s;
  return s;
}

/**
 * Assemble a character. opts: pose (name or pose object), expr (name or slot
 * object), blink, held: {L, R} SVG drawn upright at that hand (under the
 * mitten), shadow (default true), id (for data-char).
 * Returns { svg: '<g class="o rig" ...>', anchors, frames, body }.
 */
export function renderCharacter(rig, spec, opts) {
  opts = opts || {};
  const body = rig.bodies[spec.body];
  const sk = body.skeleton;
  const pose = typeof opts.pose === 'object' ? opts.pose : rig.poses[opts.pose || 'stand'];
  const { frames, anchors } = poseFrames(sk, pose);
  const wear = spec.wear || {};
  const piece = (slot) => (wear[slot] && body.wear[wear[slot]]) || null;
  const hides = {};
  for (const slot of Object.keys(wear)) (rig.wear[wear[slot]] ? rig.wear[wear[slot]].hides : []).forEach((h) => { hides[h] = true; });
  const hair = body.hair[spec.hair.style] || { front: '', back: '', backKind: null };
  const expr = resolveExpr(rig, opts.expr || spec.expr || 'neutral', opts.blink);
  const held = opts.held || {};

  const out = [];
  const put = (frame, svg, extra) => { if (svg) out.push(`<g data-f="${frame}"${extra || ''} transform="${matrixAttr(frames[frame])}">${svg}</g>`); };
  const limb = (layer, fu, fl) => { if (!layer) return; put(fu, layer.upper); put(fl, layer.lower); put(fu, layer.patch); };

  if (opts.shadow !== false && pose.anchor !== 'back') out.push(`<ellipse class="n" data-f="shadow" fill="#3D2C29" opacity=".12" cx="${anchors.feet[0]}" cy="0" rx="${sk.shadow}" ry="13"/>`);
  const back = piece('back');
  if (back) put('torso', back.back);
  if (hair.back && !(hair.backKind === 'top' && hides.top)) put('head', hair.back, ' data-p="hair-back"');
  const bottom = piece('bottom');
  const legs = () => {
    for (const [s] of SIDES) {
      limb(body.parts.leg, 'legU' + s, 'legL' + s);
      if (bottom) limb(bottom.leg, 'legU' + s, 'legL' + s);
      const shoes = piece('shoes');
      put('foot' + s, (shoes && shoes.foot) || body.parts.foot);
    }
  };
  // Sitting: the knees come toward the viewer, so the legs draw over the lap.
  if (!pose.legsFront) legs();
  put('root', body.parts.pelvis);
  if (bottom) put('root', bottom.pelvis);
  put('torso', body.parts.torso);
  const top = piece('top'), over = piece('over');
  if (top) put('torso', top.torso);
  if (over) put('torso', over.torso);
  if (back) put('torso', back.torso);
  if (pose.legsFront) legs();

  const front = pose.front || [];
  const arm = (s) => {
    limb(body.parts.arm, 'armU' + s, 'armL' + s);
    if (top) limb(top.arm, 'armU' + s, 'armL' + s);
    if (held[s]) out.push(`<g data-f="held${s}" transform="translate(${anchors['hand' + s].join(' ')})">${held[s]}</g>`);
    put('hand' + s, body.parts.hand);
  };
  SIDES.forEach(([s]) => { if (front.indexOf(s) < 0) arm(s); });

  const face = ['eyes', 'brows', 'mouth', 'extras'].map((slot) => `<g data-slot="${slot}">${faceSlot(rig, spec, slot, expr[slot])}</g>`).join('');
  const faceAcc = piece('face'), hat = piece('hat');
  put('head', body.parts.ears + body.parts.head + body.face.nose + face
    + (spec.facialHair ? body.facialHair[spec.facialHair] || '' : '')
    + hair.front + (faceAcc ? faceAcc.head : '') + (hat ? hat.head : ''), ' data-p="head"');
  SIDES.forEach(([s]) => { if (front.indexOf(s) >= 0) arm(s); });

  return {
    svg: `<g class="o rig"${opts.id ? ` data-char="${opts.id}"` : ''} style="${charVars(rig, spec)}">${out.join('')}</g>`,
    anchors, frames, body: spec.body,
  };
}

/** viewBox [x, y, w, h] (art units) that fits every standing pose of a body. */
export function bodyBox(rig, bodyId) {
  const h = rig.bodies[bodyId].skeleton.height;
  return [-Math.round(h * 0.62), -Math.round(h * 1.12), Math.round(h * 1.24), Math.round(h * 1.2)];
}

/** Standalone <svg> for a render result: sized so 1 art unit = artScale CSS px.
 *  opts: viewBox, css (false: the page already has rig.css), clip (hide overflow). */
export function svgWrap(rig, res, opts) {
  opts = opts || {};
  const vb = opts.viewBox || bodyBox(rig, res.body);
  const k = opts.scale || rig.artScale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${Math.round(vb[2] * k)}" height="${Math.round(vb[3] * k)}" overflow="${opts.clip ? 'hidden' : 'visible'}">`
    + (opts.css === false ? '' : `<style>${rig.css}</style>`) + res.svg + '</svg>';
}
