// End-to-end: the theater (P2b.1) with real (trusted) touches. In from the
// city map's theater; the rope steps the curtain half and closed, dragging
// the left half out opens it on Luna and the audience goes "ooh" and
// applauds; backstage, a gown from the rack and a tiara from the wig stand go
// on Maya (worn, ta-da); Maya walks on stage, a tap: she bows, the audience
// applauds and a rose lands on the stage; a seated audience member eats
// popcorn from the snack stand; the ticket window gives a ticket and a tap on
// the booth counter stamps it; reload: all of it is still there; no text on
// screen; an untouched theater does no work.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const THEATER = 'theater/stage';

async function record(page) {
  await page.eval(async () => {
    if (window.__rec) return;
    const rec = window.__rec = { sounds: [] };
    const { sfx } = await import('./src/audio/index.js');
    const play = sfx.play;
    sfx.play = (name, opts) => { rec.sounds.push(name); return play(name, opts); };
  });
}
const clearRec = (page) => page.eval(() => { window.__rec.sounds.length = 0; });
const sounds = (page) => page.eval(() => window.__rec.sounds.slice());

const imagesReady = () => Promise.all([...document.images].filter((i) => i.getAttribute('src'))
  .map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))).then((ok) => ok.every(Boolean));
const noText = () => document.body.innerText.trim();
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0;
const waitWith = (page, fn, arg, timeout = 15000) => page.waitFor(`(${fn})(${JSON.stringify(arg)})`, { timeout });

/** A screen point where a touch picks entity `id` (its own element, or one of a character's parts). */
const entPoint = (page, id, { part = false } = {}) => page.eval(([id, part]) => {
  const v = window.__town.scene.view.viewOf(id);
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    const h = window.__input.hitTest(x, y);
    if (h === v.el || (part && h && v.el.contains(h))) return { x, y };
  }
  return null;
}, [id, part]);
/** A screen point where a touch picks fixture piece `pid` (its hit box). */
const piecePoint = (page, pid) => page.eval((pid) => {
  const el = window.__town.scene.pieces.el(pid);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 90 || y < 90 || x > innerWidth - 90 || y > innerHeight - 20) continue;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, pid);
const w2s = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
const ent = (page, id) => page.eval((id) => { const e = window.__store.state.entities[id]; return e ? { id, kind: e.kind, x: e.x, y: e.y, room: e.room, parent: e.parent || null, slot: e.slot || null, props: e.props } : null; }, id);
const idsOf = (page, kind) => page.eval(([kind, room]) => Object.values(window.__store.state.entities).filter((e) => e.kind === kind && !e.deleted && e.room === room && !e.parent).map((e) => e.id).sort(), [kind, THEATER]);
const castId = (page, cast) => page.eval(([cast, room]) => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && e.room === room && e.props.cast === cast).id, [cast, THEATER]);
const panTo = async (page, x) => { await page.eval((x) => window.__stage.camera.panTo(x), x); await page.waitFor(() => !window.__stage.camera.moving); await page.frames(3); };
const anchor = async (page, id, name) => { const a = await page.eval(([id, n]) => window.__town.scene.chars.anchor(id, n), [id, name]); return w2s(page, a.x, a.y); };

/** Drag entity `id` by its body so its feet end at world (wx, wy). */
async function dragFeetTo(page, id, wx, wy) {
  const from = await entPoint(page, id);
  assert.ok(from, `a touch point on ${id}`);
  const to = await page.eval(([id, fx, fy, wx, wy]) => {
    const v = window.__town.scene.view.viewOf(id);
    const g = window.__stage.screenToWorld(fx, fy);
    return window.__stage.worldToScreen(g.x + wx - v.x, g.y + wy - v.y);
  }, [id, from.x, from.y, wx, wy]);
  await page.drag(from, to, { steps: 16, durationMs: 380 });
  await page.frames(2);
}

describe('theater (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
  });
  after(async () => { if (page) await page.close(); });

  it('the theater on the map leads in, onto the stage: Luna on stage, an audience, costumes on the racks', async () => {
    assert.equal(await page.eval(() => window.__town.at), 'city');
    const at = await page.eval(() => {
      const p = window.__town.manifest.map.pieces.theater;
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('theater', 0.3);
    });
    await clearRec(page);
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.at === 'theater/stage' && !window.__town.busy, { timeout: 20000 });
    assert.ok((await sounds(page)).includes('whoosh'), 'the curtains swish on the way in');
    assert.equal(await page.eval(() => document.querySelector('.room').dataset.room), THEATER);
    assert.equal(await page.eval(() => window.__stage.room.width), 2880);
    assert.equal(await page.eval(() => window.__stage.camera.x), 736, 'opens on the stage');
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    assert.equal(await page.eval(noText), '');
    const cast = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'theater/stage').map((e) => e.props.cast).sort());
    assert.deepEqual(cast, ['boy9', 'dad', 'girl5', 'girl9', 'grandma', 'performer']);
    S.luna = await castId(page, 'performer');
    assert.deepEqual(await page.eval(() => window.__town.scene.performers()), [S.luna], 'Luna is on the stage');
    assert.equal((await page.eval(() => window.__town.scene.audience())).length, 4, 'four in the seats');
    const racked = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.room === 'theater/stage' && e.kind.indexOf('rack-') === 0).length);
    assert.equal(racked, 15, 'costumes hang on the two racks');
    assert.equal(await page.eval(() => window.__town.scene.curtain.state()), 'open');
    await page.screenshot('theater-arrive');
  });

  it('the rope steps the curtain half and closed (a swoosh); dragging the left half out opens it, and the audience goes ooh and applauds', async () => {
    const rope = await page.eval(() => { const r = window.__town.scene.curtain.rope().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    assert.equal(await page.eval(([x, y]) => window.__input.hitTest(x, y) === window.__town.scene.curtain.rope(), [rope.x, rope.y]), true);
    await clearRec(page);
    await page.tap(rope.x, rope.y);
    await page.waitFor(() => window.__town.scene.curtain.state() === 'half');
    await page.tap(rope.x, rope.y);
    await page.waitFor(() => window.__town.scene.curtain.state() === 'closed');
    assert.ok((await sounds(page)).filter((s) => s === 'swoosh').length >= 2, 'a velvet swoosh each time');
    await page.waitFor(() => window.__town.scene.pieces.shown('curtain-left') === 'closed' && window.__town.scene.pieces.shown('valance') === 'closed');
    // Luna is behind the closed curtain now: a touch on her lands on the curtain.
    const lunaAt = await page.eval((id) => { const v = window.__town.scene.view.viewOf(id); return window.__stage.worldToScreen(v.x, v.y - 120); }, S.luna);
    assert.equal(await page.eval(([x, y]) => { const h = window.__input.hitTest(x, y); return h && h.dataset.piece; }, [lunaAt.x, lunaAt.y]), 'curtain-left');
    await page.waitFor(calm);
    await page.screenshot('theater-curtain-closed');
    // Drag the left half out to the left: it opens (closed -> open).
    const from = await piecePoint(page, 'curtain-left');
    assert.ok(from, 'a touch point on the left curtain');
    await clearRec(page);
    await page.drag(from, { x: from.x - 330, y: from.y }, { steps: 14, durationMs: 400 });
    await page.waitFor(() => window.__town.scene.curtain.state() === 'open');
    await page.waitFor(() => window.__rec.sounds.includes('ooh') && window.__rec.sounds.includes('applause'), { timeout: 5000 });
    const st = await page.eval(() => window.__town.scene.stats());
    assert.ok(st.oohs >= 1 && st.applause >= 1, JSON.stringify(st));
    await page.frames(10);
    await page.screenshot('theater-curtain-opened');
    await page.waitFor(calm);
    assert.equal(await page.eval(() => window.__town.scene.curtain.state()), 'open');
  });

  it('backstage: a gown from the rack and a tiara from the wig stand go on Maya (worn, with a ta-da)', async () => {
    await panTo(page, 0);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    S.maya = await castId(page, 'girl9');
    const rack = (await idsOf(page, 'rack-gown'))[0];
    const from = await entPoint(page, rack);
    assert.ok(from, 'a touch point on the hanging gown');
    await clearRec(page);
    let to = await anchor(page, S.maya, 'seat');
    await page.drag(from, { x: to.x, y: to.y - 30 }, { steps: 18, durationMs: 420 });
    await waitWith(page, (id) => { const i = window.__town.scene.chars.inspect(id); return i && i.worn.top === 'gown'; }, S.maya);
    // The wig stand gives a lion mane or a tiara: ask for the tiara.
    await page.waitFor(calm);
    const wig = (await idsOf(page, 'wig-hats'))[0];
    const wf = await entPoint(page, wig);
    assert.ok(wf, 'a touch point on the wig stand');
    await page.eval(() => { window.__rnd = Math.random; Math.random = () => 0.9; });
    to = await anchor(page, S.maya, 'head');
    await page.drag(wf, { x: to.x, y: to.y - 20 }, { steps: 18, durationMs: 420 });
    await page.eval(() => { Math.random = window.__rnd; });
    await waitWith(page, (id) => { const i = window.__town.scene.chars.inspect(id); return i && i.worn.hat === 'tiara'; }, S.maya);
    const worn = await page.eval((id) => window.__town.scene.chars.inspect(id).worn, S.maya);
    assert.equal(worn.top, 'gown');
    assert.equal(worn.hat, 'tiara');
    await page.waitFor(() => window.__rec.sounds.filter((s) => s === 'tada').length >= 2, { timeout: 5000 });
    const gown = await page.eval((id) => Object.values(window.__store.state.entities).find((e) => e.parent === id && e.kind === 'gown').id, S.maya);
    const g = await ent(page, gown);
    assert.equal(g.slot, 'wear-top');
    if (g.props.color) assert.deepEqual(Object.keys(g.props.colors || {}).length > 0, true, 'a coloured gown brings its colours');
    S.gown = gown;
    await page.frames(6);
    await page.screenshot('theater-dressed');
  });

  it('Maya walks on stage; a tap: she bows, the audience applauds and a rose lands on the stage', async () => {
    await page.waitFor(calm);
    await dragFeetTo(page, S.maya, 1340, 800);
    await waitWith(page, (id) => window.__town.scene.performers().includes(id), S.maya);
    await panTo(page, 736);
    await page.waitFor(calm);
    const before = await idsOf(page, 'rose');
    const at = await entPoint(page, S.maya, { part: true });
    assert.ok(at, 'a touch point on Maya');
    await clearRec(page);
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.scene.stats().bows >= 1);
    await page.waitFor(() => window.__rec.sounds.includes('tada') && window.__rec.sounds.includes('applause'), { timeout: 5000 });
    await page.frames(30);
    await page.screenshot('theater-bow');
    await waitWith(page, (b) => Object.values(window.__store.state.entities).some((e) => e.kind === 'rose' && e.room === 'theater/stage' && !b.includes(e.id)), before);
    const roses = (await idsOf(page, 'rose')).filter((id) => !before.includes(id));
    const r = await ent(page, roses[0]);
    const stageY = await page.eval(() => window.__town.manifest.rooms.theater.surfaces.find((s) => s.id === 'stage').y);
    assert.equal(r.y, stageY, 'the rose lies on the stage');
    assert.ok(r.x >= 1078 && r.x <= 1834, `on the stage (${r.x})`);
    await page.waitFor(calm);
    await page.screenshot('theater-roses');
  });

  it('a seated audience member eats popcorn from the snack stand', async () => {
    await panTo(page, 1440);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    S.eater = await castId(page, 'girl5');
    const snack = (await idsOf(page, 'snack-popcorn'))[0];
    const from = await entPoint(page, snack);
    assert.ok(from, 'a touch point on the popcorn');
    const mouth = await anchor(page, S.eater, 'mouth');
    await clearRec(page);
    await page.drag(from, { x: mouth.x, y: mouth.y }, { steps: 18, durationMs: 420 });
    await waitWith(page, (id) => Object.values(window.__store.state.entities).some((e) => e.kind === 'popcorn' && e.parent === id && (e.props.bites || 0) >= 1), S.eater);
    assert.ok((await sounds(page)).includes('munch'), 'munch');
    const e = await ent(page, S.eater);
    assert.equal(e.props.pose, 'sit', 'still in her seat');
    S.popcorn = await page.eval((id) => Object.values(window.__store.state.entities).find((e) => e.kind === 'popcorn' && e.parent === id).id, S.eater);
    await page.frames(10);
    await page.screenshot('theater-popcorn');
  });

  it('the ticket window gives a ticket; a tap on the booth counter stamps it', async () => {
    await page.waitFor(calm);
    const before = await idsOf(page, 'ticket');
    const w = await piecePoint(page, 'ticket-window');
    assert.ok(w, 'a touch point on the ticket window');
    await page.tap(w.x, w.y);
    await page.waitFor(() => window.__town.scene.pieces.shown('ticket-window') === 'open');
    await waitWith(page, (b) => Object.values(window.__store.state.entities).some((e) => e.kind === 'ticket' && e.room === 'theater/stage' && !b.includes(e.id)), before);
    S.ticket = (await idsOf(page, 'ticket')).find((id) => !before.includes(id));
    assert.equal((await ent(page, S.ticket)).props.stamp, undefined);
    await page.waitFor(calm);
    const t = await entPoint(page, S.ticket);
    assert.ok(t, 'a touch point on the ticket');
    await clearRec(page);
    await page.tap(t.x, t.y);
    await waitWith(page, (id) => window.__store.state.entities[id].props.stamp === 'stamped', S.ticket);
    assert.ok((await sounds(page)).includes('clunk'), 'the stamp thunks');
    await page.waitFor(calm);
    await page.screenshot('theater-ticket');
  });

  it('reload: the curtain, the costumes, the roses, the popcorn and the stamp are all still there', async () => {
    await page.goto('index.html');
    await record(page);
    await page.waitFor(() => window.__town && window.__town.at === 'theater/stage' && !window.__town.busy && window.__town.scene.curtain);
    assert.equal(await page.eval(() => window.__town.scene.curtain.state()), 'open');
    const worn = await page.eval((id) => window.__town.scene.chars.inspect(id).worn, S.maya);
    assert.equal(worn.top, 'gown');
    assert.equal(worn.hat, 'tiara');
    assert.ok(await page.eval((id) => window.__town.scene.performers().includes(id), S.maya), 'Maya is still on stage');
    assert.ok((await idsOf(page, 'rose')).length >= 1);
    assert.equal((await ent(page, S.ticket)).props.stamp, 'stamped');
    const pc = await ent(page, S.popcorn);
    assert.equal(pc.parent, S.eater);
    assert.ok(pc.props.bites >= 1);
    await page.waitFor(imagesReady);
    await page.waitFor(calm);
    assert.equal(await page.eval(noText), '');
    await page.screenshot('theater-after-reload');
  });

  it('stays idle when nobody touches it: no frames, no ops, no timers', async () => {
    await page.waitFor(calm);
    await page.waitFor(() => { const t = window.__town.scene.tiles.stats(); return !t.settleTimer && t.loading === 0; });
    await page.eval(() => {
      window.__rafs = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = (fn) => { window.__rafs++; return raf(fn); };
      window.__ops = 0;
      window.__offOps = window.__store.subscribe(() => { window.__ops++; });
    });
    await new Promise((r) => setTimeout(r, 1500));   // a window in which nothing may happen
    const r = await page.eval(() => ({
      rafs: window.__rafs, ops: window.__ops,
      calm: (() => { try { return document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0; } catch { return false; } })(),
      timers: window.__town.scene.stats().timers,
    }));
    assert.deepEqual(r, { rafs: 0, ops: 0, calm: true, timers: 0 });
    assert.equal(await page.eval(noText), '');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
