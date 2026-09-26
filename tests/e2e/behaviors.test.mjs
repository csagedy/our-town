// End-to-end: P1.8 catalog and behaviors in the catalog room
// (index.html?room=catalog), driven with real (trusted) CDP touches:
// - a tap on each of the 15 kinds gives its behavior's reaction, and the
//   state change survives a reload where the behavior is stateful;
// - no tap is dead: every tap animates, sounds and sparkles, including the
//   ones whose behaviors have nothing to do (an empty bowl, an apple core);
// - containers accept the right tags and refuse others with a playful
//   bounce-back (the item springs back, the container shakes, a boing),
//   never silently; spill tips the contents out again.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pt = (x, y, id = 0) => ({ x, y, id, radiusX: 11, radiusY: 11, force: 1 });

/** Store fields + view metrics for an entity id. */
const ent = (page, id) => page.eval((i) => {
  const e = window.__store.state.entities[i];
  const v = window.__scene.view.viewOf(i);
  return {
    id: i, kind: e.kind, x: e.x, y: e.y, rev: e.rev, parent: e.parent || null, props: e.props, deleted: !!e.deleted,
    drawn: !!v, spriteKey: v ? v.sprite.key : null, h: v ? v.sprite.h * v.scale : 0,
  };
}, id);

/** First-boot ids by kind. */
const idsByKind = (page) => page.eval(() => {
  const out = {};
  for (const id of window.__scene.view.ids()) out[window.__store.state.entities[id].kind] = id;
  return out;
});

const toScreen = (page, x, y) => page.eval(([a, b]) => window.__stage.worldToScreen(a, b), [x, y]);
const bodyPoint = async (page, e) => toScreen(page, e.x, e.y - e.h / 2);
const logLen = (page) => page.eval(() => window.__scene.behaviors.log().length);
const idle = (page) => page.waitFor(() => document.getAnimations().length === 0 && document.querySelectorAll('[data-dragging]').length === 0);

// Test instrumentation: remember which entity each Web Animation ran on, so
// short reactions are proven without racing them.
const trackAnims = (page) => page.eval(() => {
  if (window.__anims) { window.__anims.length = 0; return; }
  window.__anims = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    const ent = this.closest && this.closest('.ent');
    window.__anims.push({ id: ent ? ent.dataset.id : null, fx: this.classList.contains('fx-p') });
    return orig.call(this, k, o);
  };
});

/** Tap entity `id` with a real touch; return the reaction logged for it. */
async function tapEntity(page, id) {
  const e = await ent(page, id);
  const n = await logLen(page);
  const sounds = await page.eval(() => window.__scene.view.stats().sounds);
  await trackAnims(page);
  const p = await bodyPoint(page, e);
  await page.tap(p.x, p.y);
  await page.waitFor(`window.__scene.behaviors.log().length > ${n}`);
  const r = await page.eval(() => window.__scene.behaviors.log().at(-1));
  const after = await page.eval(() => ({ sounds: window.__scene.view.stats().sounds, anims: window.__anims.slice() }));
  assert.equal(r.id, id, `the tap on ${e.kind} reached it`);
  assert.ok(r.did.anim && r.did.sound && r.did.fx, `${e.kind}: tap reacted ${JSON.stringify(r)}`);
  assert.ok(after.sounds > sounds, `${e.kind}: a sound played`);
  assert.ok(after.anims.some((a) => a.fx), `${e.kind}: particles`);
  assert.ok(after.anims.some((a) => a.id === id) || r.via.includes('eatable'), `${e.kind}: it animated`);
  return r;
}

async function touchDrag(page, from, to, { steps = 14, stepMs = 16 } = {}) {
  await page.touch('touchStart', [pt(from.x, from.y)]);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    await page.touch('touchMove', [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)]);
    await sleep(stepMs);
  }
  await page.touch('touchEnd', []);
}

/** Drag `id` by its body and let go with the finger over `target`'s body. Returns the logged reaction. */
async function dropOnto(page, id, target) {
  await idle(page);
  const e = await ent(page, id);
  const t = await ent(page, target);
  const n = await logLen(page);
  await trackAnims(page);
  await touchDrag(page, await bodyPoint(page, e), await bodyPoint(page, t));
  await page.waitFor(`window.__scene.behaviors.log().length > ${n}`);
  const r = await page.eval(() => window.__scene.behaviors.log().at(-1));
  await idle(page);
  return r;
}

// kind -> [behaviors that react to the first tap, the saved prop change (or null)]
const FIRST_TAP = {
  book: [['toggle'], { open: true }],
  'flower-pot': [['cycle'], { grow: 1 }],
  mug: [['cycle'], { fill: 1 }],
  lamp: [['toggle'], { on: true }],
  'cookie-jar': [['toggle'], { open: true }],
  bowl: [[], null],                 // empty: nothing to spill, the fallback still reacts
  pan: [[], null],
  cupcake: [['eatable'], { bites: 1 }],
  apple: [['eatable'], { bites: 1 }],
  egg: [['food'], { cracked: 1 }],        // P2a.2: the food behavior cracks it
  gift: [['toggle'], { open: true }],
  ball: [['sound'], null],
  blocks: [['wobble'], null],
  teddy: [['squeak'], null],
  'toy-bin': [['spawner'], null],
};

for (const name of ['ipad-pro-9.7', 'ipad-air']) {
  describe(`catalog behaviors on ${name}`, () => {
    let page;
    before(async () => { page = await openPage({ viewport: name, path: 'index.html?room=catalog' }); });
    after(async () => {
      if (!page) return;
      assert.deepEqual(page.errors, []);
      assert.deepEqual(page.externalRequests(), []);
      await page.close();
    });

    it('spawns 15 catalog kinds, manifest art where it exists', async () => {
      const ids = await idsByKind(page);
      assert.deepEqual(Object.keys(ids).sort(), Object.keys(FIRST_TAP).sort());
      const draws = await page.eval(() => window.__scene.view.ids().map((id) => window.__scene.view.viewOf(id).sprite.draw));
      assert.ok(draws.filter((d) => d === 'img').length >= 12, 'art manifest sprites in use');
      assert.ok(draws.includes('shape'), 'placeholders for kinds with no art yet');
      await page.waitFor(() => [...document.querySelectorAll('.ent img')].every((i) => i.complete && i.naturalWidth > 0));
      await page.screenshot(`behaviors-${name}-boot`);
    });

    it('a tap on each kind gives its reaction; no tap is dead; state survives a reload', async () => {
      const ids = await idsByKind(page);
      const before = {};
      for (const kind of Object.keys(FIRST_TAP)) {
        await idle(page);
        before[kind] = await ent(page, ids[kind]);
        const r = await tapEntity(page, ids[kind]);
        const [via, props] = FIRST_TAP[kind];
        assert.deepEqual(r.via, via, `${kind} reacted through ${via}`);
        if (!via.length) assert.deepEqual(r.fallback, ['squish', 'sound', 'sparkle'], `${kind}: universal fallback`);
        const now = await ent(page, ids[kind]);
        assert.equal(now.x, before[kind].x, `${kind}: a tap does not move it`);
        if (props) {
          for (const [k, v] of Object.entries(props)) assert.equal(now.props[k], v, `${kind}.${k}`);
          assert.notEqual(now.spriteKey, before[kind].spriteKey, `${kind}: its look changed`);
        }
      }
      const spawned = await page.eval((bin) => Object.values(window.__store.state.entities)
        .filter((e) => e.props.from === bin && !e.deleted).map((e) => e.id), ids['toy-bin']);
      assert.equal(spawned.length, 1, 'the toy bin popped one thing out');
      await idle(page);
      await page.screenshot(`behaviors-${name}-tapped`);

      // Reload: the state and looks are the saved ones.
      const keys = {};
      for (const kind of Object.keys(FIRST_TAP)) keys[kind] = (await ent(page, ids[kind])).spriteKey;
      await page.goto('index.html?room=catalog');
      for (const kind of Object.keys(FIRST_TAP)) {
        const e = await ent(page, ids[kind]);
        const props = FIRST_TAP[kind][1];
        if (props) for (const [k, v] of Object.entries(props)) assert.equal(e.props[k], v, `${kind}.${k} after reload`);
        assert.equal(e.spriteKey, keys[kind], `${kind}: same look after reload`);
      }
      assert.ok((await ent(page, spawned[0])).drawn, 'the spawned toy is still there');
      assert.equal(await page.eval(() => window.__scene.view.ids().length), 16);
    });

    it('taps with nothing left to do still react (egg cracked, apple core, cupcake eaten up)', async () => {
      const ids = await idsByKind(page);
      const egg = await tapEntity(page, ids.egg);             // cracked already: nothing left to crack
      assert.deepEqual(egg.via, []);
      await tapEntity(page, ids.apple);                         // bite1 -> core
      const core = await tapEntity(page, ids.apple);
      assert.deepEqual(core.via, []);
      assert.equal((await ent(page, ids.apple)).props.bites, 2);
      for (let i = 0; i < 2; i++) await tapEntity(page, ids.cupcake);   // bite2, then gone
      await page.waitFor(`!window.__scene.view.viewOf(${JSON.stringify(ids.cupcake)})`);
      assert.equal((await ent(page, ids.cupcake)).deleted, true, 'eaten up');
      await idle(page);
      await page.screenshot(`behaviors-${name}-eaten`);
    });
  });
}

describe('containers: accept by tag, refuse with a bounce-back, spill (ipad-air)', () => {
  let page, ids;
  before(async () => {
    page = await openPage({ viewport: 'ipad-air', path: 'index.html?room=catalog' });
    ids = await idsByKind(page);
  });
  after(async () => {
    if (!page) return;
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
    await page.close();
  });

  it('the bowl refuses a ball: it springs back, the bowl shakes, a boing', async () => {
    const ball0 = await ent(page, ids.ball);
    const r = await dropOnto(page, ids.ball, ids.bowl);
    assert.deepEqual(r.via, ['container:refuse']);
    assert.equal(r.id, ids.bowl);
    assert.ok(r.did.anim && r.did.sound && r.did.fx, 'never a silent failure');
    const anims = await page.eval(() => window.__anims);
    assert.ok(anims.some((a) => a.id === ids.bowl), 'the bowl shook');
    assert.ok(anims.some((a) => a.id === ids.ball), 'the ball sprang back');
    assert.equal(await page.eval(() => window.__scene.view.stats().lastSound), 'boing');
    const ball = await ent(page, ids.ball);
    assert.deepEqual([ball.x, ball.y, ball.rev, ball.parent], [ball0.x, ball0.y, ball0.rev, null], 'back where it was, nothing saved');
    const rect = await page.eval((i) => { const r = window.__scene.view.viewOf(i).el.getBoundingClientRect(); return r.bottom; }, ids.ball);
    const feet = await toScreen(page, ball0.x, ball0.y);
    assert.ok(Math.abs(rect - feet.y) < 2, 'drawn back at its spot');
  });

  it('the bowl accepts an apple: it goes in and peeks over the rim (P1.9 heap)', async () => {
    const r = await dropOnto(page, ids.apple, ids.bowl);
    assert.deepEqual(r.via, ['container:accept']);
    const apple = await ent(page, ids.apple);
    assert.equal(apple.parent, ids.bowl);
    assert.equal(await page.eval((i) => window.__scene.view.parentOf(i), ids.apple), ids.bowl, 'drawn inside the bowl');
    await page.screenshot('behaviors-bowl-filled');
  });

  it('the cookie jar takes sweets only; the pan takes ingredients only', async () => {
    let r = await dropOnto(page, ids.egg, ids['cookie-jar']);
    assert.deepEqual(r.via, ['container:refuse']);
    assert.equal((await ent(page, ids.egg)).parent, null);
    r = await dropOnto(page, ids.cupcake, ids.pan);
    assert.deepEqual(r.via, ['container:refuse']);
    r = await dropOnto(page, ids.cupcake, ids['cookie-jar']);
    assert.deepEqual(r.via, ['container:accept']);
    assert.equal((await ent(page, ids.cupcake)).parent, ids['cookie-jar']);
    r = await dropOnto(page, ids.egg, ids.pan);
    // P2a.2: an uncracked egg goes in through the pan's mix behavior (it cracks on the rim).
    assert.ok(['container:accept', 'mix:accept'].includes(r.via[0]) && r.via.length === 1, r.via.join());
    assert.equal((await ent(page, ids.egg)).props.cracked, 1);
    // P2a.3: the pan draws what is in it (the egg shows its doneness), not an 'egg' look.
    assert.equal(await page.eval((i) => window.__scene.view.parentOf(i), ids.egg), ids.pan);
    await page.screenshot('behaviors-containers-filled');
  });

  it('contents survive a reload; tapping the bowl and long-pressing the jar spill them out', async () => {
    await page.goto('index.html?room=catalog');
    assert.equal((await ent(page, ids.apple)).parent, ids.bowl);
    assert.equal(await page.eval((i) => window.__scene.view.parentOf(i), ids.apple), ids.bowl);
    const r = await tapEntity(page, ids.bowl);
    assert.deepEqual(r.via, ['spill']);
    await page.waitFor(`!window.__scene.view.parentOf(${JSON.stringify(ids.apple)})`);
    const apple = await ent(page, ids.apple);
    assert.equal(apple.parent, null);
    assert.ok(apple.y === 540 || (apple.y >= 700 && apple.y <= 960), 'landed on the counter or the floor');
    assert.equal(await page.eval((i) => window.__scene.view.parentOf(i), ids.apple), null, 'drawn loose again');

    await idle(page);
    const jar = await ent(page, ids['cookie-jar']);
    const n = await logLen(page);
    const p = await bodyPoint(page, jar);
    await page.longPress(p.x, p.y);
    await page.waitFor(`window.__scene.behaviors.log().length > ${n}`);
    const lp = await page.eval(() => window.__scene.behaviors.log().at(-1));
    assert.deepEqual(lp.via, ['spill']);
    assert.equal((await ent(page, ids.cupcake)).parent, null);
    await page.waitFor(`!!window.__scene.view.viewOf(${JSON.stringify(ids.cupcake)})`);
    assert.equal((await ent(page, ids['cookie-jar'])).x, jar.x, 'a long press does not move the jar');
    await idle(page);
    await page.screenshot('behaviors-spilled');
  });
});
