// End-to-end: the Character Maker booth (P1.15) with real (trusted) touches on
// an iPad viewport: tap the kiosk on the city map and go in; every category
// tab changes the character on the stage (the preview redraws, no text on
// screen); tapping the chosen outfit piece again steps its colour; the die
// shuffles; the photo-frame button pops the character out onto the floor
// (and it is still there, looking the same, after a reload); dragging a
// character onto the stage restyles it; characters sit on the pouf and sit
// criss-cross on the rug. Belt and gloves tabs (mhf.20); a hero suit worn as
// a costume comes off onto the floor when a top is picked.

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
// The belt and gloves tabs are "none" plus the one piece.
const MIN_OPTS = { belt: 2, hands: 2 };
const floorChars = () => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && !e.deleted && e.room === 'booth').map((e) => e.id).sort();

/**
 * Pixel signature of every option thumbnail on the open tab (bead mhf.18):
 * each picture drawn into an 88px canvas; returns, per pair of options, the
 * share of pixels that differ visibly (RGB distance over 30: the two
 * lightest skin tones just make it), and a
 * hash per option.
 */
const thumbDiffs = () => Promise.all([...document.querySelectorAll('[data-mk-opt] img.mk-thumb')].map((img) => img.decode().then(() => img))).then((imgs) => {
  const N = 88;
  const px = imgs.map((img) => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, N, N);
    g.drawImage(img, 0, 0, N, N);
    return g.getImageData(0, 0, N, N).data;
  });
  const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return (h >>> 0).toString(16); };
  const pairs = [];
  for (let a = 0; a < px.length; a++) {
    for (let b = a + 1; b < px.length; b++) {
      let n = 0;
      for (let i = 0; i < px[a].length; i += 4) {
        if (Math.abs(px[a][i] - px[b][i]) + Math.abs(px[a][i + 1] - px[b][i + 1]) + Math.abs(px[a][i + 2] - px[b][i + 2]) > 30) n++;
      }
      pairs.push({ a, b, diff: n / (N * N) });
    }
  }
  return { n: imgs.length, hashes: px.map(hash), pairs, nodes: document.querySelectorAll('[data-mk-opt] *').length };
});

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
    assert.ok(await page.eval(() => document.querySelectorAll('[data-mk-tab]').length) >= 17, 'category tabs');
    for (const cat of ['belt', 'hands']) assert.ok(await page.eval((c) => !!document.querySelector(`[data-mk-tab="${c}"] svg.mk-icon`), cat), `a ${cat} tab with a picture icon`);
    // Every tab sits inside the panel, and none overlaps another or the die / done buttons.
    const boxes = await page.eval(() => [...document.querySelectorAll('[data-mk-tab], [data-mk]:not([data-mk="preview"])')].map((el) => { const r = el.getBoundingClientRect(); return [el.dataset.mkTab || el.dataset.mk, r.left, r.top, r.right, r.bottom]; }));
    const panel = await page.eval(() => { const r = document.querySelector('.mk-panel').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    for (const [n, l, t, r, b] of boxes) {
      assert.ok(l >= panel[0] && t >= panel[1] && r <= panel[2] && b <= panel[3], `${n} inside the panel`);
      for (const [m, l2, t2, r2, b2] of boxes) if (m !== n) assert.ok(r <= l2 || r2 <= l || b <= t2 || b2 <= t, `${n} overlaps ${m}`);
    }
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
      assert.ok(n >= (MIN_OPTS[cat] || 3), `${cat}: ${n} options`);
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
      if (cat === 'hair' || cat === 'hat' || cat === 'top' || cat === 'belt' || cat === 'hands') await page.screenshot(`booth-${cat}`);
    }
    // The preview wiggled (a reaction per change).
    assert.ok(await page.eval(() => window.__town.scene.stats.reactions) >= cats.length);
    assert.equal(await page.eval(() => window.__town.scene.stats.changes), cats.length);
  });

  it('with a hat, mask, apron, cape, tool belt and gloves on, every tab\'s thumbnails still show distinct choices (mhf.18)', async () => {
    const rigWear = await page.eval(() => window.__town.scene.chars.rig.maker.wear);
    const cover = { hat: 'hard-hat', face: 'hero-mask', over: 'apron', back: 'hero-cape', belt: 'tool-belt', hands: 'gloves' };
    for (const [cat, kind] of Object.entries(cover)) {
      await page.tapElement(`[data-mk-tab="${cat}"]`);
      await page.waitFor(`window.__town.scene.maker.tab === ${JSON.stringify(cat)}`);
      const i = rigWear[cat].indexOf(kind);
      const on = await page.eval((j) => document.querySelector(`[data-mk-opt="${j}"]`).classList.contains('is-on'), i);
      if (!on) {
        await page.tapElement(`[data-mk-opt="${i}"]`);
        await page.waitFor(`document.querySelector('[data-mk-opt="${i}"]').classList.contains('is-on')`);
      }
    }
    // The real character keeps all of it on.
    const kids = (await page.eval(draft)).kids.map((k) => k[1]).sort();
    assert.deepEqual(kids, Object.values(cover).sort());
    const cats = await page.eval(() => [...document.querySelectorAll('[data-mk-tab]')].map((el) => el.dataset.mkTab));
    for (const cat of cats) {
      await page.tapElement(`[data-mk-tab="${cat}"]`);
      await page.waitFor(`window.__town.scene.maker.tab === ${JSON.stringify(cat)}`);
      const r = await page.eval(thumbDiffs);
      await page.screenshot(`booth-thumbs-${cat}`);
      assert.ok(r.n >= (MIN_OPTS[cat] || 3), `${cat}: ${r.n} thumbnails`);
      assert.equal(r.nodes, 2 * r.n, `${cat}: a button face and one <img> per thumbnail (no live SVG): ${r.nodes} nodes`);
      assert.equal(new Set(r.hashes).size, r.n, `${cat}: every thumbnail is a different picture`);
      const worst = r.pairs.reduce((m, p) => (p.diff < m.diff ? p : m));
      console.log(`thumbs ${cat}: ${r.n} options, least different pair ${worst.a}/${worst.b} ${(worst.diff * 100).toFixed(1)}% of pixels`);
      // Lashes on/off is the subtlest pair (about 0.5%); a hat over every hair style was 0%.
      assert.ok(worst.diff >= 0.003, `${cat}: options ${worst.a} and ${worst.b} look almost the same (${(worst.diff * 100).toFixed(2)}% of pixels differ)`);
    }
  });

  it('a hero suit worn as a costume: chosen on the top tab; picking a top takes it off onto the floor with a sparkle (mhf.20)', async () => {
    // Put the suit on like a drop from the world does: a worn child in wear-top.
    const suit = await page.eval(() => {
      const d = window.__town.scene.maker.draftId;
      const id = window.__store.newId();
      window.__store.dispatch('spawn', { id, kind: 'hero-suit', parent: d, slot: 'wear-top', props: {} });
      return id;
    });
    await page.tapElement('[data-mk-tab="top"]');
    await page.waitFor(() => window.__town.scene.maker.tab === 'top');
    const wear = await page.eval(() => window.__town.scene.chars.rig.maker.wear.top);
    const suitAt = wear.indexOf('hero-suit');
    await page.waitFor(`document.querySelector('[data-mk-opt="${suitAt}"]').classList.contains('is-on')`);
    assert.equal(await page.eval(() => document.querySelectorAll('[data-mk-opt].is-on').length), 1, 'only the suit is marked');
    // The other tops' thumbnails show those tops, not the suit over them.
    const r = await page.eval(thumbDiffs);
    assert.equal(new Set(r.hashes).size, r.n, 'every top thumbnail differs with the suit on');
    await page.screenshot('booth-costume-on');
    const own = (await page.eval(draft)).props.wear.top;
    const pickAt = wear.findIndex((k) => k !== own && k !== 'hero-suit');
    const html = await page.eval(previewHtml);
    await page.tapElement(`[data-mk-opt="${pickAt}"]`);
    await page.waitFor(`(() => { const e = window.__store.state.entities[${JSON.stringify(suit)}]; return e && !e.parent && e.room === 'booth'; })()`);
    const d = await page.eval(draft);
    assert.equal(d.props.wear.top, wear[pickAt], 'the new top is on');
    assert.ok(!d.kids.some((k) => k[0] === 'wear-top'), 'the suit is off the character');
    await page.waitFor(`document.querySelector('[data-mk="preview"]').innerHTML !== ${JSON.stringify(html)}`);
    await page.waitFor(`document.querySelector('[data-mk-opt="${pickAt}"]').classList.contains('is-on')`);
    assert.equal(await page.eval(() => window.__town.scene.stats.costumesOff), 1);
    // It lies on the booth floor, drawn like any thing, and still exists (nothing vanishes).
    await page.waitFor(`!!window.__town.scene.view.viewOf(${JSON.stringify(suit)})`);
    await page.waitFor(`window.__town.scene.view.viewOf(${JSON.stringify(suit)}).el.getAnimations().length === 0`);
    assert.equal(await page.eval(noText), '');
    await page.screenshot('booth-costume-off');
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
