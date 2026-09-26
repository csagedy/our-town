// End-to-end: characters as living entities in rooms (P1.10), in the cast
// dev room (index.html?room=cast), driven with real (trusted) CDP touches on
// iPad viewports: lift a character and drop it on the stool (it sits at the
// seat), on the floor (it stands), on the sofa (it lies down); give it a
// cupcake (it holds it), drag the cupcake to its mouth (a bite: the look
// changes and the face says yum), tap the held cupcake (shown off), put a
// cape on and drag it off; tap it (a reaction on every iPad: an inc op);
// everything persists through a reload; 8 characters stay idle-cheap.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pt = (x, y, id = 0) => ({ x, y, id, radiusX: 11, radiusY: 11, force: 1 });

const toScreen = (page, x, y) => page.eval(([a, b]) => window.__stage.worldToScreen(a, b), [x, y]);

/** A character by cast id: entity fields, its look (chars.inspect) and its box. */
const char = (page, cast) => page.eval((c) => {
  const s = window.__store.state;
  const e = Object.values(s.entities).find((q) => q.kind === 'char' && q.props.cast === c && !q.deleted);
  const v = window.__scene.view.viewOf(e.id);
  const kids = Object.values(s.entities).filter((q) => q.parent === e.id && !q.deleted).map((q) => [q.slot, q.kind, q.id, q.props.bites || 0]);
  return {
    id: e.id, x: e.x, y: e.y, rev: e.rev, props: e.props, kids,
    look: window.__scene.chars.inspect(e.id), scale: v && v.scale, zIndex: v && Number(v.zIndex),
  };
}, cast);
const thing = (page, kind) => page.eval((k) => {
  const s = window.__store.state;
  const e = Object.values(s.entities).find((q) => q.kind === k && !q.deleted);
  if (!e) return null;
  const v = window.__scene.view.viewOf(e.id);
  return { id: e.id, x: e.x, y: e.y, rev: e.rev, parent: e.parent || null, slot: e.slot || null, props: e.props, h: v ? v.sprite.h * v.scale : 0 };
}, kind);

async function touchDrag(page, from, to, { steps = 14, stepMs = 16, beforeEnd } = {}) {
  await page.touch('touchStart', [pt(from.x, from.y)]);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    await page.touch('touchMove', [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)]);
    await sleep(stepMs);
  }
  if (beforeEnd) await beforeEnd();
  await page.touch('touchEnd', []);
}

/** Grab a character at its chest and drag so its seat point (pelvis) goes to world (tx, ty). */
async function carryChar(page, cast, tx, ty, opts) {
  const c = await char(page, cast);
  const a = c.look.anchors;
  const grab = { x: a.seat.x, y: (a.seat.y + a.head.y) / 2 };
  const from = await toScreen(page, grab.x, grab.y);
  const to = await toScreen(page, grab.x + (tx - a.seat.x), grab.y + (ty - a.seat.y));
  await touchDrag(page, from, to, opts);
  await page.waitFor(`(() => { const e = window.__store.state.entities[${JSON.stringify(c.id)}]; return e.rev > ${c.rev}; })()`);
  await page.waitFor(`window.__scene.view.viewOf(${JSON.stringify(c.id)}).el.getAnimations().length === 0 && !window.__scene.chars.inspect(${JSON.stringify(c.id)}).dragging`);
  await sleep(250);
  return char(page, cast);
}

// Idle life (breathing CSS animation, glance / tilt WAAPI tweens) never stops; anything else does.
const idleChars = () => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0
  && document.querySelectorAll('[data-dragging]').length === 0;

describe('characters in the cast room (ipad-air)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-air', path: 'index.html?room=cast' }); });
  after(async () => {
    if (!page) return;
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
    await page.close();
  });

  it('4 starter characters, drawn as live SVG, with what they wear as child entities', async () => {
    const r = await page.eval(() => {
      const s = window.__store.state;
      const cs = Object.values(s.entities).filter((e) => e.kind === 'char' && !e.deleted);
      return {
        casts: cs.map((e) => e.props.cast).sort(),
        svgs: document.querySelectorAll('.ent[data-kind="char"] svg.char-svg g.rig').length,
        breathing: document.getAnimations().filter((a) => a.animationName === 'char-breathe').length,
        girl: window.__scene.chars.inspect(cs.find((e) => e.props.cast === 'girl9').id),
      };
    });
    assert.deepEqual(r.casts, ['boy5', 'girl9', 'grandpa', 'grownup']);
    assert.equal(r.svgs, 4);
    assert.equal(r.breathing, 4, 'one breathing CSS animation per character');
    assert.equal(r.girl.pose, 'sit');
    assert.deepEqual(r.girl.worn, { hat: 'headband', over: 'apron' });
    await page.screenshot('chars-boot');
  });

  it('drag a character to the stool: it dangles, the seat glows, it sits at the seat', async () => {
    await page.waitFor(idleChars);
    let during = null;
    const c = await carryChar(page, 'boy5', 1372, 738, {
      beforeEnd: async () => {
        during = await page.eval(() => {
          const e = Object.values(window.__store.state.entities).find((q) => q.kind === 'char' && q.props.cast === 'boy5');
          return {
            look: window.__scene.chars.inspect(e.id),
            hl: [...document.querySelectorAll('.drop-hl')].filter((h) => h.style.visibility !== 'hidden').map((h) => h.dataset.target),
          };
        });
        await page.screenshot('chars-dangle');
      },
    });
    assert.equal(during.look.dragging, true);
    assert.ok(['wheee', 'surprised', 'laughing'].includes(during.look.shown), `lifted face ${during.look.shown}`);
    assert.deepEqual(during.hl, ['surface:seat:stool'], 'the stool glows');
    assert.equal(c.props.pose, 'sit');
    assert.equal(c.props.seat, 'stool');
    assert.equal(c.x, 1372);
    assert.equal(c.y, 738);
    assert.equal(c.look.pose, 'sit');
    // Drawn in front of the stool (sorted by the seat's depth), seat point on the seat.
    const stoolZ = await page.eval(() => Number(document.querySelector('[data-art="stool"]').style.zIndex));
    assert.ok(c.zIndex > stoolZ, 'in front of the stool');
    assert.ok(Math.abs(c.look.anchors.seat.x - 1372) < 2 && Math.abs(c.look.anchors.seat.y - 738) < 2, JSON.stringify(c.look.anchors.seat));
    await page.screenshot('chars-sit-stool');
  });

  it('drag it to the floor: it lands on its feet, standing', async () => {
    await page.waitFor(idleChars);
    const c = await carryChar(page, 'boy5', 1010, 870);
    assert.equal(c.props.pose, 'stand');
    assert.equal(c.props.seat, null);
    assert.ok(c.y >= 700 && c.y <= 960, `on the floor (y ${c.y})`);
    assert.equal(c.look.pose, 'stand');
    assert.ok(Math.abs(c.look.anchors.feet.y - c.y) < 1, 'feet on the floor line');
    await page.screenshot('chars-floor');
  });

  it('drag one onto the sofa: it lies down and gets sleepy', async () => {
    await page.waitFor(idleChars);
    const c = await carryChar(page, 'grownup', 640, 860);
    assert.equal(c.props.pose, 'lie');
    assert.equal(c.props.seat, 'sofa');
    assert.equal(c.props.expr, 'sleepy');
    await page.screenshot('chars-lie-sofa');
  });

  it('give it a cupcake: it holds it; drag the cupcake to its mouth: a bite, crumbs, a yum face', async () => {
    await page.waitFor(idleChars);
    const boy = await char(page, 'boy5');
    const cup = await thing(page, 'cupcake');
    const from = await toScreen(page, cup.x, cup.y - cup.h / 2);
    const hand = boy.look.anchors.handR;
    await touchDrag(page, from, await toScreen(page, hand.x, hand.y));
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(cup.id)}].parent === ${JSON.stringify(boy.id)}`);
    await sleep(300);
    const held = await char(page, 'boy5');
    assert.ok(held.look.held.R === 'cupcake' || held.look.held.L === 'cupcake', JSON.stringify(held.look.held));
    await page.screenshot('chars-hold-cupcake');

    // The held cupcake is its own touch target: drag it up to the mouth.
    const side = held.look.held.R === 'cupcake' ? 'R' : 'L';
    const h = held.look.anchors['hand' + side];
    const m = held.look.anchors.mouth;
    const before = await page.eval(() => window.__scene.chars.stats().bites);
    await touchDrag(page, await toScreen(page, h.x, h.y), await toScreen(page, m.x, m.y + 6));
    await page.waitFor(`(window.__store.state.entities[${JSON.stringify(cup.id)}].props.bites || 0) === 1`);
    const r = await page.waitFor(`(() => { const s = window.__scene.chars.stats(); return s.bites > ${before} && s; })()`);
    assert.equal(r.lastTaste, 'sweet');
    const after = await thing(page, 'cupcake');
    assert.equal(after.parent, boy.id, 'back in its hand after the bite');
    assert.equal(await page.eval((id) => window.__scene.behaviors.lookOf(window.__store.state.entities[id]), cup.id), 'bite1');
    const yum = await page.waitFor(`(() => { const l = window.__scene.chars.inspect(${JSON.stringify(boy.id)}); return l.shown === 'yum' && l; })()`);
    assert.equal(yum.atoms.mouth, 'tongue');
    await page.screenshot('chars-bite-yum');

    // Tap the held cupcake: shown off high (a set op), tap again: down.
    await page.waitFor(idleChars);
    const l2 = await char(page, 'boy5');
    const side2 = l2.look.held.R === 'cupcake' ? 'R' : 'L';
    const h2 = l2.look.anchors['hand' + side2];
    const p2 = await toScreen(page, h2.x, h2.y);
    await page.tap(p2.x, p2.y);
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(boy.id)}].props.raise === ${JSON.stringify(side2)}`);
    await sleep(300);
    await page.screenshot('chars-hold-up');
  });

  it('put a cape on (sparkle); drag it off again', async () => {
    await page.waitFor(idleChars);
    const boy = await char(page, 'boy5');
    const cape = await thing(page, 'hero-cape');
    const from = await toScreen(page, cape.x, cape.y - cape.h / 2);
    const chest = boy.look.anchors.seat;
    await touchDrag(page, from, await toScreen(page, chest.x, chest.y - 40));
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(cape.id)}].slot === 'wear-back'`);
    const towel = await thing(page, 'towel-cape');
    assert.equal(towel.parent, null, 'the towel cape it wore popped off');
    await sleep(400);
    let c = await char(page, 'boy5');
    assert.equal(c.look.worn.back, 'hero-cape');
    await page.screenshot('chars-cape-on');
    // Drag the towel cape back on, then pull the hero cape off by its edge.
    await page.waitFor(idleChars);
    const edge = await page.eval((id) => {
      const el = document.querySelector(`.ent[data-id="${id}"] [data-w="back"]`);
      const r = el.getBoundingClientRect();
      return { x: r.left + 6, y: r.top + r.height * 0.75 };
    }, boy.id);
    await touchDrag(page, edge, { x: edge.x - 200, y: edge.y + 40 });
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(cape.id)}].parent == null`);
    c = await char(page, 'boy5');
    assert.equal(c.look.worn.back, undefined);
    await page.waitFor(idleChars);
    await page.screenshot('chars-cape-off');
    // And back on for the persistence check.
    const cape2 = await thing(page, 'hero-cape');
    await touchDrag(page, await toScreen(page, cape2.x, cape2.y - cape2.h / 2), await toScreen(page, c.look.anchors.seat.x, c.look.anchors.seat.y - 40));
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(cape.id)}].slot === 'wear-back'`);
  });

  it('construction wearables: a tool belt, gloves and a hero suit dropped on go on; gloves and suit come off again', async () => {
    await page.waitFor(idleChars);
    const kinds = ['tool-belt', 'gloves', 'hero-suit'];
    await page.eval((ks) => {
      const s = window.__store, room = window.__scene.room.id;
      ks.forEach((kind, i) => s.dispatch('spawn', { id: s.newId(), kind, room, x: 220 + i * 110, y: 965 }));
    }, kinds);
    const girl = await char(page, 'girl9');
    const baseTop = girl.props.wear.top;
    const slotOf = { 'tool-belt': 'belt', gloves: 'hands', 'hero-suit': 'top' };
    for (const kind of kinds) {
      await page.waitFor(idleChars);
      const it = await thing(page, kind);
      assert.ok(it.h > 20, `${kind} lies on the floor with its sprite`);
      const c = await char(page, 'girl9');
      const seat = c.look.anchors.seat;
      await touchDrag(page, await toScreen(page, it.x, it.y - it.h / 2), await toScreen(page, seat.x, seat.y - 40));
      await page.waitFor(`window.__store.state.entities[${JSON.stringify(it.id)}].slot === 'wear-${slotOf[kind]}'`);
      await page.waitFor(`window.__scene.chars.inspect(${JSON.stringify(girl.id)}).worn[${JSON.stringify(slotOf[kind])}] === ${JSON.stringify(kind)}`);
      assert.ok(await page.eval(([id, w]) => document.querySelectorAll(`.ent[data-id="${id}"] [data-w="${w}"]`).length > 0, [girl.id, slotOf[kind]]), `${kind} drawn on her`);
    }
    let c = await char(page, 'girl9');
    assert.equal(c.props.wear.top, baseTop, 'her own top is still hers under the suit');
    await page.waitFor(idleChars);
    await page.screenshot('chars-site-wear');
    // Pull a glove off (sideways), and the suit off by a sleeve (downwards).
    const grab = (w, f) => page.eval(([id, w2, f2]) => {
      const el = document.querySelector(`.ent[data-id="${id}"] [data-w="${w2}"][data-f^="${f2}"]`);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, [girl.id, w, f]);
    const gloves = await thing(page, 'gloves');
    const g = await grab('hands', 'hand');
    await touchDrag(page, g, { x: g.x + 220, y: g.y + 30 });
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(gloves.id)}].parent == null`);
    await page.waitFor(idleChars);
    const suit = await thing(page, 'hero-suit');
    const sl = await grab('top', 'armU');
    await touchDrag(page, sl, { x: sl.x + 20, y: sl.y + 200 });
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(suit.id)}].parent == null`);
    c = await char(page, 'girl9');
    assert.equal(c.look.worn.hands, undefined);
    assert.equal(c.look.worn.top, undefined);
    assert.equal(c.look.worn.belt, 'tool-belt', 'the belt stays on');
    await page.waitFor(idleChars);
    await page.screenshot('chars-site-wear-off');
  });

  it('tap a character: an inc op, and it plays the next reaction', async () => {
    await page.waitFor(idleChars);
    const g = await char(page, 'grandpa');
    const a = g.look.anchors.head;
    const p = await toScreen(page, a.x, a.y + 30);
    const before = await page.eval(() => window.__scene.chars.stats().reactions);
    await page.tap(p.x, p.y);
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(g.id)}].props.taps === ${(g.props.taps || 0) + 1}`);
    const s = await page.waitFor(`(() => { const s = window.__scene.chars.stats(); return s.reactions > ${before} && s; })()`);
    assert.equal(s.lastReaction, 'giggle');
    await page.tap(p.x, p.y);
    await page.waitFor(`window.__scene.chars.stats().lastReaction === 'wave'`);
    await sleep(350);
    await page.screenshot('chars-wave');
  });

  it('long press: it says something short; a raw egg at the mouth: a grimace, then a laugh', async () => {
    await page.waitFor(idleChars);
    const g = await char(page, 'girl9');
    const p = await toScreen(page, g.look.anchors.head.x, g.look.anchors.head.y + 20);
    await page.longPress(p.x, p.y, { holdMs: 700 });
    const said = await page.waitFor(() => window.__scene.chars.stats().said > 0 && window.__scene.chars.stats());
    assert.ok(said.lastSaid.length > 0 && said.lastSaid.length <= 16, `said "${said.lastSaid}"`);
    // An egg (tags food + ingredient: weird), dropped at her mouth.
    await page.waitFor(idleChars);
    const e = await thing(page, 'egg');
    const egg = e.id;
    const m = g.look.anchors.mouth;
    await touchDrag(page, await toScreen(page, e.x, e.y - e.h / 2), await toScreen(page, m.x, m.y));
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(egg)}].parent === ${JSON.stringify(g.id)}`);
    await page.waitFor(`window.__scene.chars.inspect(${JSON.stringify(g.id)}).shown === 'yuck'`);
    await page.screenshot('chars-yuck');
    await page.waitFor(`window.__scene.chars.inspect(${JSON.stringify(g.id)}).shown === 'laughing'`);
    assert.equal(await page.eval(() => window.__scene.chars.stats().lastTaste), 'weird');
  });

  it('everything persists through a reload', async () => {
    await page.waitFor(idleChars);
    const snap = () => page.eval(() => Object.values(window.__store.state.entities)
      .filter((e) => !e.deleted && (e.kind === 'char' || e.parent))
      .map((e) => [e.id, e.kind, e.x ?? null, e.y ?? null, e.parent || null, e.slot || null, JSON.stringify(e.props)]).sort());
    const before = await snap();
    await page.goto('index.html?room=cast');
    await page.frames(4);
    assert.deepEqual(await snap(), before);
    const boy = await char(page, 'boy5');
    assert.equal(boy.look.worn.back, 'hero-cape');
    assert.ok(boy.look.held.R === 'cupcake' || boy.look.held.L === 'cupcake');
    const grown = await char(page, 'grownup');
    assert.equal(grown.look.pose, 'lie');
    await page.screenshot('chars-after-reload');
  });
});

describe('characters: 8 on screen stay idle-cheap (ipad-pro-9.7)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-pro-9.7', path: 'index.html?room=cast' }); });
  after(async () => {
    if (!page) return;
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  it('idle life (breathing, blinks, glances) with no frame loop and few style recalcs', async () => {
    await page.eval(async () => {
      const m = await import('/src/engine/char-model.js');
      const chars = window.__scene.chars;
      for (const [cast, x] of [['girl9', 560], ['boy5', 700], ['grandpa', 960], ['grownup', 1180]]) {
        m.spawnCharacter(window.__store, chars.rig, cast, { room: 'test/cast', x, y: 905 });
      }
    });
    await page.waitFor(() => window.__scene.chars.stats().chars === 8);
    await page.waitFor(idleChars);
    await page.send('Performance.enable', {});
    const metric = async () => Object.fromEntries((await page.send('Performance.getMetrics', {})).metrics.map((m) => [m.name, m.value]));
    await page.eval(() => {
      window.__rafs = 0;
      const raf = window.requestAnimationFrame;
      window.__rafOrig = raf;
      window.requestAnimationFrame = (fn) => { window.__rafs++; return raf.call(window, fn); };
      window.__stats0 = window.__scene.chars.stats();
    });
    const m0 = await metric();
    await sleep(4000);    // a window in which nothing may run per frame
    const m1 = await metric();
    const r = await page.eval(() => {
      window.requestAnimationFrame = window.__rafOrig;
      const s = window.__scene.chars.stats();
      const anims = document.getAnimations();
      return {
        rafs: window.__rafs,
        running: anims.length,
        breathing: anims.filter((a) => a.animationName === 'char-breathe').length,
        other: anims.filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').map((a) => a.animationName || a.id || 'waapi'),
        blinks: s.blinks - window.__stats0.blinks, glances: s.glances - window.__stats0.glances, tilts: s.tilts - window.__stats0.tilts,
        ticks: s.idleTicks - window.__stats0.idleTicks, tweens: s.tweens - window.__stats0.tweens,
      };
    });
    const recalcs = m1.RecalcStyleCount - m0.RecalcStyleCount;
    const layouts = m1.LayoutCount - m0.LayoutCount;
    const scriptMs = (m1.ScriptDuration - m0.ScriptDuration) * 1000;
    const styleMs = (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000;
    const layoutMs = (m1.LayoutDuration - m0.LayoutDuration) * 1000;
    console.log(`  8 characters idle for 4s: ${JSON.stringify(r)} recalcs ${recalcs} (${styleMs.toFixed(1)}ms), layouts ${layouts} (${layoutMs.toFixed(1)}ms), script ${scriptMs.toFixed(1)}ms`);
    assert.equal(r.breathing, 8, 'one composited breathing animation per character');
    assert.ok(r.ticks >= 3, 'the shared idle timer ran');
    assert.ok(r.blinks >= 2, 'they blink');
    assert.equal(r.rafs, 0, 'no frame loop: blinks are a class, glances and tilts WAAPI');
    assert.deepEqual(r.other, [], 'no animations but idle life');
    // Idle life is composited WAAPI on HTML layer boxes (bead lm8): a few
    // recalcs when one starts and ends, never one per frame, and no layout.
    const events = r.blinks + r.glances + r.tilts;
    const budget = 6 + events * 10;
    assert.ok(recalcs <= budget, `style recalcs in 4s idle: ${recalcs} (budget ${budget} for ${r.blinks} blinks, ${r.glances + r.tilts} glances/tilts)`);
    assert.ok(layouts <= 2, `layouts in 4s idle: ${layouts} (${events} blinks/glances/tilts)`);
    assert.ok(styleMs + layoutMs + scriptMs < 120, `main-thread work in 4s idle: ${styleMs + layoutMs + scriptMs}ms`);
    assert.ok(scriptMs < 150, `script time in 4s idle: ${scriptMs}ms`);
    await page.screenshot('chars-8-idle');
  });

  // Deterministic (bead mhf.19): the shared idle timer is held, so the window
  // holds exactly the idle life the test plays with chars.idle(), and it
  // starts with none running. Each event's animations start and end in a few
  // batched recalcs (~16 for 24 events); an animation Blink can't composite
  // (e.g. a second transform animation on a box still playing one) runs on
  // the main thread: a recalc every frame of its 1.3-1.7 s, ~80-100 more.
  const castIds = () => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && !e.deleted && e.room === 'test/cast').map((e) => e.id);
  const noIdleAnims = () => document.getAnimations().filter((a) => a.id === 'char-idle').length === 0;
  const metrics = async () => Object.fromEntries((await page.send('Performance.getMetrics', {})).metrics.map((m) => [m.name, m.value]));
  /** Recalcs and layouts over a fixed 2.2 s window (not a poll: getAnimations() itself recalcs style), long enough for a 1.7 s tilt to play out. */
  async function measure(play) {
    const m0 = await metrics();
    const r = await page.eval(play);
    await sleep(2200);
    const m1 = await metrics();
    return Object.assign(r, { layouts: m1.LayoutCount - m0.LayoutCount, recalcs: m1.RecalcStyleCount - m0.RecalcStyleCount });
  }

  it('every kind of idle life costs no layout (lm8 regression): blinks, glances, tilts on all 8', async () => {
    await page.send('Performance.enable', {});
    await page.eval(() => window.__scene.chars.idleHold(true));
    try {
      await page.waitFor(idleChars);
      await page.waitFor(noIdleAnims);
      await page.frames(2);
      const r = await measure(`(() => {
        let n = 0;
        for (const id of (${castIds})()) for (const what of ['blink', 'glance', 'tilt']) if (window.__scene.chars.idle(id, what)) n++;
        return { n, running: document.getAnimations().filter((a) => a.id === 'char-idle').length };
      })()`);
      console.log(`  24 idle events on 8 characters: layouts ${r.layouts}, style recalcs ${r.recalcs}`);
      assert.equal(r.n, 24, 'blink + glance + tilt on each of the 8');
      assert.equal(r.running, 8 * 5, 'blink: 2 layers, glance: the eyes box, tilt: 2 head boxes');
      // Before lm8 (SVG class toggles + WAAPI on SVG groups): ~2 layouts per blink
      // and one per frame of a glance/tilt, hundreds here.
      assert.ok(r.layouts <= 2, `layouts: ${r.layouts}`);
      assert.ok(r.recalcs <= 24 * 1.5, `style recalcs for 24 events: ${r.recalcs} (at most 1.5 per event; ~0.7 when all composite)`);
    } finally {
      await page.eval(() => window.__scene.chars.idleHold(false));
    }
  });

  it('a glance or tilt started over a running one replaces it and stays composited (mhf.19)', async () => {
    await page.send('Performance.enable', {});
    await page.eval(() => window.__scene.chars.idleHold(true));
    try {
      await page.waitFor(noIdleAnims);
      await page.eval(`(() => { for (const id of (${castIds})()) { window.__scene.chars.idle(id, 'glance'); window.__scene.chars.idle(id, 'tilt'); } })()`);
      await page.frames(3);
      const r = await measure(`(() => {
        for (const id of (${castIds})()) { window.__scene.chars.idle(id, 'glance'); window.__scene.chars.idle(id, 'tilt'); }
        return { running: document.getAnimations().filter((a) => a.id === 'char-idle').length };
      })()`);
      console.log(`  16 overlapping glances/tilts on 8 characters: layouts ${r.layouts}, style recalcs ${r.recalcs}`);
      assert.equal(r.running, 8 * 3, 'the new moves replaced the running ones (one animation per box)');
      assert.ok(r.layouts <= 2, `layouts: ${r.layouts}`);
      // Two transform animations on one box: Blink runs the new one on the
      // main thread (kTargetHasIncompatibleAnimations): ~80-100 recalcs here.
      assert.ok(r.recalcs <= 16 * 1.5, `style recalcs for 16 overlapping events: ${r.recalcs}`);
    } finally {
      await page.eval(() => window.__scene.chars.idleHold(false));
    }
  });

  it('pauses when the page is hidden: no idle timer, breathing paused', async () => {
    const r = await page.eval(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      const out = {
        timer: window.__scene.chars.stats().idleTimer,
        paused: getComputedStyle(document.querySelector('.char-bob')).animationPlayState,
      };
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      out.back = window.__scene.chars.stats().idleTimer;
      return out;
    });
    assert.deepEqual(r, { timer: false, paused: 'paused', back: true });
  });
});
