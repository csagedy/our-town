// End-to-end: the Character Maker booth (P1.15) with real (trusted) touches on
// an iPad viewport: tap the kiosk on the city map and go in; every category
// tab changes the character on the stage (the preview redraws, no text on
// screen); tapping the chosen outfit piece again steps its colour; the die
// shuffles; the photo-frame button pops the character out onto the floor
// (and it is still there, looking the same, after a reload); dragging a
// character onto the stage restyles it; characters sit on the pouf and sit
// criss-cross on the rug.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const noText = () => document.body.innerText.trim();
const booth = () => window.__town.scene;
const draft = () => {
  const s = window.__store.state;
  const id = window.__town.scene.maker.draftId;
  const e = s.entities[id];
  const kids = Object.values(s.entities).filter((q) => q.parent === id && !q.deleted).map((q) => [q.slot, q.kind, JSON.stringify(q.props.colors || {})]).sort();
  return { id, props: e.props, kids };
};
const previewHtml = () => document.querySelector('[data-mk="preview"]').innerHTML;
const floorChars = () => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && !e.deleted && e.room === 'booth').map((e) => e.id).sort();

async function center(page, sel) {
  const b = await page.box(sel);
  assert.ok(b, `no ${sel}`);
  return { x: b.cx, y: b.cy };
}

/** Drag a floor character (grabbed at its chest) so its feet (or seat point) land at world (tx, ty). */
async function carry(page, id, tx, ty, anchor = 'feet') {
  await page.waitFor(`(() => { const l = window.__town.scene.chars.inspect(${JSON.stringify(id)}); const v = window.__town.scene.view.viewOf(${JSON.stringify(id)}); return l && !l.dragging && v && v.el.getAnimations().length === 0; })()`);
  const c = await page.eval((i) => {
    const e = window.__store.state.entities[i];
    return { rev: e.rev, look: window.__town.scene.chars.inspect(i) };
  }, id);
  const a = c.look.anchors;
  const grab = { x: a.seat.x, y: (a.seat.y + a.head.y) / 2 };
  const toS = (x, y) => page.eval(([p, q]) => window.__stage.worldToScreen(p, q), [x, y]);
  const from = await toS(grab.x, grab.y);
  const to = await toS(grab.x + (tx - a[anchor].x), grab.y + (ty - a[anchor].y));
  await page.drag(from, to, { steps: 16, durationMs: 420 });
  try {
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(id)}].rev > ${c.rev}`);
  } catch (err) {
    await page.screenshot('booth-carry-failed');
    console.log('carry failed', JSON.stringify({ id, from, to, look: c.look }));
    throw err;
  }
}

describe('character maker booth (ipad-air, landscape, touch)', () => {
  let page;
  before(async () => { page = await openPage({ viewport: 'ipad-air' }); });
  after(async () => { if (page) await page.close(); });

  it('the kiosk on the city map opens the booth', async () => {
    assert.equal(await page.eval(() => window.__town.at), 'city');
    const p = await page.eval(() => {
      const m = window.__town.manifest.map.pieces['booth-curtain'];
      window.__stage.camera.panTo(m.x + m.w / 2 - 720);
      return new Promise((r) => setTimeout(() => r(window.__town.scene.screenPoint('booth-curtain', 0.6)), 50));
    });
    await page.tap(p.x, p.y);
    await page.waitFor(() => window.__town.at === 'booth' && !window.__town.busy && window.__town.scene.maker, { timeout: 20000 });
    await page.waitFor(imagesReady);
    assert.equal(await page.eval(noText), '', 'no text on screen');
    assert.ok(await page.eval(() => !!document.querySelector('[data-mk="preview"] svg')), 'a preview character');
    assert.ok(await page.eval(() => document.querySelectorAll('[data-mk-tab]').length) >= 15, 'category tabs');
    // The starter pair sitting in the booth: criss-cross on the rug, on the pouf.
    const poses = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'booth').map((e) => [e.props.cast, e.props.pose]).sort());
    assert.deepEqual(poses, [['boy9', 'sit'], ['performer', 'sit-cross']]);
    await page.screenshot('booth-open');
  });

  it('every category changes the character on the stage (and nothing is text)', async () => {
    const cats = await page.eval(() => [...document.querySelectorAll('[data-mk-tab]')].map((el) => el.dataset.mkTab));
    for (const cat of cats) {
      await page.tapElement(`[data-mk-tab="${cat}"]`);
      await page.waitFor(`window.__town.scene.maker.tab === ${JSON.stringify(cat)} && document.querySelector('[data-mk-tab="${cat}"]').classList.contains('is-on')`);
      const n = await page.eval(() => document.querySelectorAll('[data-mk-opt]').length);
      assert.ok(n >= 3, `${cat}: ${n} options`);
      // The first option that is not chosen yet.
      const i = await page.eval(() => [...document.querySelectorAll('[data-mk-opt]')].findIndex((el) => !el.classList.contains('is-on')));
      assert.ok(i >= 0, `${cat}: something to choose`);
      const before = JSON.stringify(await page.eval(draft));
      const html = await page.eval(previewHtml);
      await page.tapElement(`[data-mk-opt="${i}"]`);
      await page.waitFor(`JSON.stringify((${draft.toString()})()) !== ${JSON.stringify(before)}`);
      await page.waitFor(`document.querySelector('[data-mk="preview"]').innerHTML !== ${JSON.stringify(html)}`);
      assert.ok(await page.eval(() => document.querySelector(`[data-mk-opt].is-on`) !== null), `${cat}: the choice is marked`);
      assert.equal(await page.eval(noText), '', `${cat}: no text`);
      if (cat === 'hair' || cat === 'hat' || cat === 'top') await page.screenshot(`booth-${cat}`);
    }
    // The preview wiggled (a reaction per change).
    assert.ok(await page.eval(() => window.__town.scene.stats.reactions) >= cats.length);
    assert.equal(await page.eval(() => window.__town.scene.stats.changes), cats.length);
  });

  it('tapping the chosen top again steps its colour', async () => {
    await page.tapElement('[data-mk-tab="top"]');
    await page.waitFor(() => window.__town.scene.maker.tab === 'top');
    const i = await page.eval(() => [...document.querySelectorAll('[data-mk-opt]')].findIndex((el) => el.classList.contains('is-on')));
    const c0 = (await page.eval(draft)).props.colors.top || null;
    await page.tapElement(`[data-mk-opt="${i}"]`);
    await page.waitFor(`(${draft.toString()})().props.colors.top !== ${JSON.stringify(c0)}`);
  });

  it('the die shuffles the whole look (with a giggle)', async () => {
    const before = JSON.stringify(await page.eval(draft));
    await page.tapElement('[data-mk="shuffle"]');
    await page.waitFor(`JSON.stringify((${draft.toString()})()) !== ${JSON.stringify(before)}`);
    assert.equal(await page.eval(() => window.__town.scene.stats.shuffles), 1);
    await page.screenshot('booth-shuffled');
  });

  let made = null;
  it('the photo frame pops the character out onto the floor; a new one takes the stage', async () => {
    const d0 = await page.eval(draft);
    const floor0 = await page.eval(floorChars);
    await page.tapElement('[data-mk="done"]');
    await page.waitFor(`window.__town.scene.maker.draftId && window.__town.scene.maker.draftId !== ${JSON.stringify(d0.id)}`);
    const floor1 = await page.eval(floorChars);
    assert.equal(floor1.length, floor0.length + 1);
    assert.ok(floor1.includes(d0.id), 'the made character is on the booth floor');
    await page.waitFor(`!!window.__town.scene.view.viewOf(${JSON.stringify(d0.id)})`);
    await page.waitFor(`window.__town.scene.view.viewOf(${JSON.stringify(d0.id)}).el.getAnimations().length === 0`);
    made = await page.eval((id) => { const e = window.__store.state.entities[id]; return { id, x: e.x, y: e.y, props: e.props }; }, d0.id);
    assert.equal(made.props.pose, 'stand');
    assert.deepEqual(made.props.skin, d0.props.skin);
    await page.screenshot('booth-done');
  });

  it('the new character is still there after a reload, looking the same', async () => {
    await page.goto('index.html');
    await page.waitFor(() => window.__town.at === 'booth' && window.__town.scene.maker);
    const e = await page.eval((id) => window.__store.state.entities[id], made.id);
    assert.equal(e.room, 'booth');
    for (const k of ['body', 'skin', 'hair', 'wear', 'colors', 'eyes', 'brows', 'lashes', 'freckles', 'blush']) {
      assert.deepEqual(e.props[k], made.props[k], `${k} survived the reload`);
    }
    await page.waitFor(`!!window.__town.scene.view.viewOf(${JSON.stringify(made.id)})`);
  });

  it('drag a character onto the stage: it goes up to be restyled', async () => {
    const fresh = await page.eval(() => window.__town.scene.maker.draftId);
    await carry(page, made.id, 444, 872);
    await page.waitFor(`window.__town.scene.maker.draftId === ${JSON.stringify(made.id)}`);
    assert.equal(await page.eval((id) => window.__store.state.entities[id].room, made.id), 'booth/mirror');
    assert.ok(await page.eval((id) => window.__store.state.entities[id].deleted, fresh), 'the untouched stand-in went away');
    // Restyle it: a hat.
    await page.tapElement('[data-mk-tab="hat"]');
    await page.waitFor(() => window.__town.scene.maker.tab === 'hat');
    const i = await page.eval(() => [...document.querySelectorAll('[data-mk-opt]')].findIndex((el) => !el.classList.contains('is-on') && el.dataset.mkOpt !== '0'));
    await page.tapElement(`[data-mk-opt="${i}"]`);
    await page.waitFor(`Object.values(window.__store.state.entities).some((q) => q.parent === ${JSON.stringify(made.id)} && q.slot === 'wear-hat' && !q.deleted)`);
    await page.screenshot('booth-restyle');
    // Done again: back on the floor, same id, with the hat.
    await page.tapElement('[data-mk="done"]');
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(made.id)}].room === 'booth'`);
  });

  it('characters sit on the pouf and criss-cross on the rug', async () => {
    const seats = await page.eval(() => window.__town.scene.chars.seats.map((s) => ({ id: s.id, x: s.x, y: s.y, pose: s.pose })));
    const pouf = seats.find((s) => s.id === 'pouf-1');
    const rug = seats.find((s) => s.id === 'rug-1');
    // Free both seats first (the starter pair stands up on the floor).
    const sitters = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'booth' && e.props.seat).map((e) => e.id));
    await page.waitFor(`window.__town.scene.view.viewOf(${JSON.stringify(made.id)}).el.getAnimations().length === 0`);
    await carry(page, made.id, 240, 722);
    let x = 60;
    for (const id of sitters) { await carry(page, id, x, 722); x += 660; }
    await page.waitFor(() => Object.values(window.__store.state.entities).every((e) => e.kind !== 'char' || e.room !== 'booth' || !e.props.seat));
    await carry(page, made.id, pouf.x, pouf.y, 'seat');
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(made.id)}].props.pose === 'sit'`);
    const other = sitters[0];
    await carry(page, other, rug.x, rug.y, 'seat');
    await page.waitFor(`window.__store.state.entities[${JSON.stringify(other)}].props.pose === 'sit-cross'`);
    await page.waitFor(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity).length === 0);
    await page.screenshot('booth-sit');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
