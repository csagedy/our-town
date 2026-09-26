// End-to-end: the school (P2d.1) with real (trusted) touches. In from the
// city map's school (ding-dong); the bus honks, opens and the kids hop off
// to the kerb; Priya gets her own cubby (her face shows on its label); her
// backpack comes off her back and hangs in that cubby; the kids line up on
// the footprints (the leader's tap marches them); washing hands at the sink;
// the feelings chart changes the nearest face (voice or a sound); circle
// time: three kids sit criss-cross on the rug spots (each spot a note); the
// rocking chair rocks; the goldfish swims and is fed; a nap on a cot (lie
// pose, z's); reload: all of it is still there; no text on screen; an
// untouched school does no work.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const SCHOOL = 'school/classroom';

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
// No text on screen but the reading layer (P2d.2: the sight-word cards, marked data-reading).
const noText = () => {
  const els = [...document.querySelectorAll('[data-reading]')];
  els.forEach((e) => { e.style.display = 'none'; });
  const t = document.body.innerText.trim();
  els.forEach((e) => { e.style.display = 'flex'; });
  return t;
};
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0;
const waitWith = (page, fn, arg, timeout = 15000) => page.waitFor(`(${fn})(${JSON.stringify(arg)})`, { timeout });
const sc = (page, fn, arg) => page.eval(fn, arg);

const ent = (page, id) => page.eval((id) => { const e = window.__store.state.entities[id]; return e ? { id, kind: e.kind, x: e.x, y: e.y, room: e.room, parent: e.parent || null, slot: e.slot || null, props: e.props } : null; }, id);
const castId = (page, cast) => page.eval(([c, room]) => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && !e.deleted && e.room === room && e.props.cast === c).id, [cast, SCHOOL]);

/** A screen point where a touch picks entity `id` (its own element). */
const entPoint = (page, id) => page.eval((id) => {
  const v = window.__town.scene.view.viewOf(id);
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 12 || y < 100 || x > innerWidth - 10 || y > innerHeight - 10) continue;
    if (window.__input.hitTest(x, y) === v.el) return { x, y };
  }
  return null;
}, id);

/** A screen point on a piece / tap area element that input picks. */
const elPoint = (page, sel) => page.eval((sel) => {
  const sc = window.__town.scene;
  const el = sel.piece ? sc.pieces.el(sel.piece) : sc.hits.el(sel.hit);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if ((x < 130 && (y < 130 || y > innerHeight - 130)) || x > innerWidth - 10 || y < 4 || y > innerHeight - 10) continue;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, sel);

/** Drag character `id` by its body so its anchor `name` (head, seat, feet) ends at world (wx, wy). */
async function dragAnchorTo(page, id, name, wx, wy) {
  const from = await entPoint(page, id);
  assert.ok(from, `a touch point on ${id}`);
  const to = await page.eval(([id, name, fx, fy, wx, wy]) => {
    const a = window.__town.scene.chars.anchor(id, name);
    const g = window.__stage.screenToWorld(fx, fy);
    return window.__stage.worldToScreen(g.x + wx - a.x, g.y + wy - a.y);
  }, [id, name, from.x, from.y, wx, wy]);
  await page.drag(from, to, { steps: 18, durationMs: 420 });
  await page.frames(2);
}
async function panTo(page, x) {
  await page.eval((x) => window.__stage.camera.panTo(x), x);
  await page.waitFor(() => !window.__stage.camera.moving);
  await page.frames(3);
}

describe('school (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
  });
  after(async () => { if (page) await page.close(); });

  it('the school on the map leads in (ding-dong), at the arrival with the bus pulling in', async () => {
    assert.equal(await page.eval(() => window.__town.at), 'city');
    const at = await page.eval(() => {
      const p = window.__town.manifest.map.pieces.school;
      window.__stage.camera.panTo(p.x + p.w / 2 - 720);
      return window.__town.scene.screenPoint('school', 0.62);
    });
    await page.frames(4);
    await clearRec(page);
    await page.tap(at.x, at.y);
    await page.waitFor(() => window.__town.at === 'school/classroom' && !window.__town.busy, { timeout: 20000 });
    assert.ok((await sounds(page)).includes('bell'), 'the bell rings on the way in');
    assert.equal(await page.eval(() => document.querySelector('.room').dataset.room), SCHOOL);
    assert.equal(await page.eval(() => window.__stage.room.width), 3200);
    assert.equal(await page.eval(() => window.__stage.camera.x), 0, 'opens on the arrival');
    assert.equal((await sc(page, () => window.__town.scene.stats())).arrivals, 1, 'the bus drove in');
    await page.waitFor(imagesReady);
    await page.waitFor(calm, { timeout: 20000 });
    assert.equal(await page.eval(noText), '');
    // First visit: Ms. Noor in the rocking chair with her lanyard, Maya on the rug with her cubby, three kids on the bus.
    const cast = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'school/classroom').map((e) => `${e.props.cast}@${e.props.seat}`).sort());
    assert.deepEqual(cast, ['boy5@bus-seat-1', 'boy9@bus-seat-3', 'girl5@bus-seat-2', 'girl9@rug-2', 'teacher@rocking-chair']);
    const teacher = await castId(page, 'teacher');
    assert.ok(await page.eval((t) => Object.values(window.__store.state.entities).some((e) => e.kind === 'lanyard' && e.parent === t), teacher));
    const contents = await sc(page, () => window.__town.scene.cubbies.contents());
    assert.deepEqual(contents.map((c) => c.map((k) => `${k.kind}:${k.spot}`)), [['school-backpack:hook'], ['school-lunchbox:shelf'], [], ['school-backpack:hook'], [], []]);
    const maya = await castId(page, 'girl9');
    assert.deepEqual(await sc(page, () => window.__town.scene.cubbies.face(0)), { owner: maya, visible: true, img: true });
    await page.screenshot('school-arrival');
  });

  it('tap the bus: honk, the door opens and the kids hop off to the kerb', async () => {
    await clearRec(page);
    const p = await elPoint(page, { piece: 'bus' });
    assert.ok(p);
    await page.tap(p.x, p.y);
    await page.waitFor(() => window.__town.scene.riders().length === 0 && window.__town.scene.stats().hops === 3, { timeout: 10000 });
    assert.ok((await sounds(page)).includes('honk'));
    assert.equal(await sc(page, () => window.__town.scene.pieces.state('bus-door')), 'open');
    for (const c of ['boy5', 'girl5', 'boy9']) {
      const e = await ent(page, await castId(page, c));
      assert.equal(e.props.pose, 'stand', c);
      assert.equal(e.props.seat, null, c);
      assert.ok(e.y > 903, `${c} stands on the kerb in front of the bus (${e.x}, ${e.y})`);
    }
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-bus-dropoff');
  });

  it('Priya gets cubby 3: her head up to its label, and her face shows there', async () => {
    const leo = S.leo = await castId(page, 'girl5');
    const lab = await page.eval(() => window.__town.manifest.rooms.school.rigs.cubbies[2].label);
    await clearRec(page);
    await dragAnchorTo(page, leo, 'head', lab[0], lab[1] + 30);
    await waitWith(page, (id) => window.__town.scene.cubbies.owners()[2] === id, leo);
    const f = await sc(page, () => window.__town.scene.cubbies.face(2));
    assert.deepEqual(f, { owner: leo, visible: true, img: true });
    assert.ok((await sounds(page)).includes('chime'));
    // The face element sits over the painted label, on screen.
    const box = await page.eval(() => { const r = window.__town.scene.cubbies.faceEl(2).getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left }; });
    assert.ok(box.w > 20 && box.h > 20 && box.x > 0, JSON.stringify(box));
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-cubby-face');
  });

  it('her backpack comes off her back and hangs in her cubby (and stays)', async () => {
    const leo = S.leo;
    const bag = await page.eval((id) => Object.values(window.__store.state.entities).find((e) => e.kind === 'school-backpack' && e.parent === id).id, leo);
    const from = await page.eval((id) => {
      const v = window.__town.scene.view.viewOf(id);
      const parts = [...v.el.querySelectorAll('[data-w="back"]')];
      for (const p of parts) {
        const r = p.getBoundingClientRect();
        for (const fy of [0.5, 0.3, 0.7, 0.2, 0.8]) for (const fx of [0.5, 0.2, 0.8, 0.1, 0.9]) {
          const x = r.left + r.width * fx, y = r.top + r.height * fy;
          const hit = window.__input.hitTest(x, y);
          if (hit && hit !== v.el && v.el.contains(hit)) return { x, y };
        }
      }
      return null;
    }, leo);
    assert.ok(from, 'a touch point on the worn backpack');
    const hook = await page.eval(() => window.__town.manifest.rooms.school.rigs.cubbies[2].hook);
    const to = await page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [hook[0], hook[1] + 40]);
    await page.drag(from, to, { steps: 18, durationMs: 420 });
    await page.frames(2);
    const cub = (await sc(page, () => window.__town.scene.cubbies.ids()))[2];
    await waitWith(page, ([b, c]) => window.__store.state.entities[b].parent === c, [bag, cub]);
    const contents = await sc(page, () => window.__town.scene.cubbies.contents());
    assert.deepEqual(contents[2].map((k) => `${k.kind}:${k.spot}`), ['school-backpack:hook']);
    assert.equal(await page.eval((id) => window.__town.scene.chars.inspect(id).worn.back || null, leo), null, 'not on her back any more');
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-backpack-in-cubby');
  });

  it('the kids line up on the footprints; the leader\'s tap marches them; hands washed at the sink', async () => {
    const spots = await page.eval(() => window.__town.manifest.rooms.school.rigs.line.spots);
    S.line = { girl5: 0, boy5: 1, boy9: 6 };
    for (const [c, i] of Object.entries(S.line)) {
      const id = await castId(page, c);
      await page.waitFor(calm, { timeout: 15000 });
      await dragAnchorTo(page, id, 'seat', spots[i][0] + 6, spots[i][1] - 30);
      await waitWith(page, ([id, s]) => window.__store.state.entities[id].props.seat === s, [id, `line-${i + 1}`]);
      const e = await ent(page, id);
      assert.deepEqual([e.x, e.y, e.props.pose], [spots[i][0], spots[i][1], 'stand'], `${c} snapped onto footprint ${i + 1}`);
    }
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-line-up');
    // The leader's tap: the line marches in place to a drum.
    await clearRec(page);
    const lead = await entPoint(page, await castId(page, 'girl5'));
    await page.tap(lead.x, lead.y);
    await page.waitFor(() => window.__town.scene.stats().marches === 1);
    await page.waitFor(() => window.__rec.sounds.filter((s) => s === 'knock').length >= 4);
    await page.waitFor(calm, { timeout: 15000 });
    // Kenji on footprint 7 stands at the sink: the tap runs and he washes.
    await clearRec(page);
    const tap = await elPoint(page, { piece: 'sink-tap' });
    await page.tap(tap.x, tap.y);
    await page.waitFor(() => window.__town.scene.stats().washes >= 1);
    assert.equal(await sc(page, () => window.__town.scene.pieces.state('sink-tap')), 'on');
    assert.ok((await sounds(page)).includes('splash'));
    await page.waitFor(() => window.__rec.sounds.includes('bubble'));
    await page.screenshot('school-wash-hands');
    await page.waitFor(calm, { timeout: 15000 });
    await page.tap(tap.x, tap.y);
    await page.waitFor(() => window.__town.scene.pieces.state('sink-tap') === 'off');
  });

  it('the feelings chart: a tap on a face changes the nearest face and names it (a sound with the voice off)', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    const p = await elPoint(page, { hit: 'feeling-sad' });
    assert.ok(p);
    await page.tap(p.x, p.y);
    await page.waitFor(() => window.__town.scene.stats().lastFeeling === 'sad');
    const sad = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && e.room === 'school/classroom' && e.props.expr === 'sad'));
    assert.ok(sad, 'someone looks sad now');
    S.sad = sad.id;
    await page.waitFor(`window.__town.scene.chars.inspect(${JSON.stringify(sad.id)}).atoms.mouth === 'wobble'`);
    assert.ok((await sc(page, () => window.__town.scene.stats().said)).includes('sad'));
    await page.screenshot('school-feelings-sad');
    // Voice off (parent menu): a sound instead of the word.
    await page.eval(async () => { const a = await import('./src/audio/index.js'); a.setSpeechOn(false); });
    await clearRec(page);
    const h = await elPoint(page, { hit: 'feeling-happy' });
    await page.tap(h.x, h.y);
    await page.waitFor(() => window.__town.scene.stats().lastFeeling === 'happy');
    assert.ok((await sounds(page)).includes('giggle'), 'a giggle instead of the voice');
    await page.eval(async () => { const a = await import('./src/audio/index.js'); a.setSpeechOn(true); });
    // Back to sad for the reload check.
    await page.tap(p.x, p.y);
    await waitWith(page, (id) => window.__store.state.entities[id].props.expr === 'sad', S.sad);
    // The schedule card bounces and says its word.
    const card = await elPoint(page, { hit: 'schedule-snack' }).catch(() => null);
    if (card) {
      await page.tap(card.x, card.y);
      await page.waitFor(() => window.__town.scene.stats().said.includes('snack!'));
    }
    await page.waitFor(calm, { timeout: 15000 });
  });

  it('the bell swings ding-dong, the front door opens, the lights dim, and painted things answer (fallback)', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    await clearRec(page);
    const bell = await elPoint(page, { piece: 'school-bell' });
    await page.tap(bell.x, bell.y);
    await page.waitFor(() => window.__town.scene.stats().rings === 1 && window.__town.scene.pieces.shown('school-bell') === 'ring');
    await page.waitFor(() => window.__rec.sounds.filter((s) => s === 'bell').length >= 2);
    const door = await elPoint(page, { piece: 'front-door' });
    await page.tap(door.x, door.y);
    await page.waitFor(() => window.__town.scene.pieces.state('front-door') === 'open');
    const sw = await elPoint(page, { piece: 'light-switch' });
    await page.tap(sw.x, sw.y);
    await page.waitFor(() => window.__town.scene.pieces.state('light-switch') === 'off' && getComputedStyle(window.__town.scene.room.art.get('dim')).opacity === '1');
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-lights-off');
    await page.tap(sw.x, sw.y);
    await page.waitFor(() => window.__town.scene.pieces.state('light-switch') === 'on');
    await panTo(page, 946);
    const a = await elPoint(page, { hit: 'letter-A' });
    await page.tap(a.x, a.y);
    await page.waitFor(() => window.__town.scene.stats().hits['letter-A'] === 1 && window.__town.scene.board.stats().lastLetter === 'A');
    await page.waitFor(calm, { timeout: 15000 });
    assert.equal(await page.eval(noText), '');
  });

  it('circle time: three kids sit criss-cross on the rug spots, each spot a note', async () => {
    await panTo(page, 640);
    const rug = await page.eval(() => window.__town.manifest.rooms.school.rigs.rug.spots);
    const put = [['girl5', 3], ['boy5', 4], ['boy9', 5]];
    const notes0 = (await sc(page, () => window.__town.scene.stats())).notes;
    for (const [c, i] of put) {
      const id = await castId(page, c);
      await page.waitFor(calm, { timeout: 15000 });
      await dragAnchorTo(page, id, 'seat', rug[i][0], rug[i][1] - 10);
      await waitWith(page, ([id, s]) => window.__store.state.entities[id].props.seat === s, [id, `rug-${i + 1}`]);
      await waitWith(page, (id) => window.__town.scene.chars.inspect(id).pose === 'sit-cross', id);
    }
    await page.waitFor(`window.__town.scene.stats().notes >= ${notes0 + 3}`);
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-circle-time');
    // The rocking chair rocks when tapped.
    const rc = await elPoint(page, { piece: 'rocking-chair' });
    if (rc) {
      await page.tap(rc.x, rc.y);
      await page.waitFor(() => window.__town.scene.stats().rocks >= 1);
    }
    await page.waitFor(calm, { timeout: 15000 });
  });

  it('the goldfish swims to the glass on a tap and is fed from the shaker', async () => {
    await panTo(page, 946);
    await page.waitFor(calm, { timeout: 15000 });
    const bowl = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'school-fishbowl').id);
    const b = await entPoint(page, bowl);
    assert.ok(b);
    const before = await sc(page, () => window.__town.scene.pieces.state('fish-bowl'));
    await page.tap(b.x, b.y);
    await page.waitFor(`window.__town.scene.pieces.state('fish-bowl') !== ${JSON.stringify(before)}`);
    await page.waitFor(calm, { timeout: 15000 });
    const food = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'fish-food').id);
    const f = await entPoint(page, food);
    assert.ok(f);
    await page.drag(f, b, { steps: 14, durationMs: 360 });
    await page.waitFor(() => window.__town.scene.stats().feeds === 1 && window.__town.scene.pieces.shown('fish-bowl') === 'fed');
    await page.screenshot('school-fish-fed');
    await page.waitFor(() => window.__town.scene.pieces.shown('fish-bowl') !== 'fed', { timeout: 8000 });
    await page.waitFor(calm, { timeout: 15000 });
  });

  it('nap time: a cot from the stack, and Maya lies down on it with z\'s', async () => {
    await panTo(page, 1000);
    await page.waitFor(calm, { timeout: 15000 });
    const cots = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'school-cots').id);
    const from = await entPoint(page, cots);
    assert.ok(from);
    const to = await page.eval(() => window.__stage.worldToScreen(2110, 968));
    await page.drag(from, to, { steps: 16, durationMs: 380 });
    await page.frames(2);
    await page.waitFor(() => Object.values(window.__store.state.entities).some((e) => e.kind === 'nap-cot' && e.room === 'school/classroom' && !e.parent));
    const cot = await page.eval(() => Object.values(window.__store.state.entities).find((e) => e.kind === 'nap-cot' && !e.parent));
    S.cot = cot.id;
    await page.waitFor(calm, { timeout: 15000 });
    const maya = S.maya = await castId(page, 'girl9');
    const seat = await page.eval((id) => window.__town.scene.seats().find((s) => s.id === 'nap-cot:' + id), cot.id);
    assert.ok(seat && seat.lie, 'the cot is a lying seat');
    await dragAnchorTo(page, maya, 'seat', seat.x, seat.y - 10);
    await waitWith(page, ([id, s]) => window.__store.state.entities[id].props.seat === s, [maya, 'nap-cot:' + cot.id]);
    const e = await ent(page, maya);
    assert.equal(e.props.pose, 'lie');
    assert.equal(e.props.expr, 'sleepy');
    await waitWith(page, (id) => window.__town.scene.chars.inspect(id).pose === 'lie', maya);
    await page.waitFor(() => window.__town.scene.stats().naps >= 1);
    await page.waitFor(() => document.querySelectorAll('.fx-zzz').length > 0);
    await page.screenshot('school-nap');
    await page.waitFor(calm, { timeout: 15000 });
  });

  it('reload: the cubbies, the line, the rug, the nap and the faces are all still there', async () => {
    const snap = () => page.eval(() => {
      const s = window.__store.state;
      const chars = Object.values(s.entities).filter((e) => e.kind === 'char' && e.room === 'school/classroom').map((e) => `${e.props.cast}@${e.props.seat}:${JSON.stringify(e.props.expr)}:${e.x},${e.y}`).sort();
      return { chars, owners: window.__town.scene.cubbies.owners(), contents: window.__town.scene.cubbies.contents() };
    });
    const before = await snap();
    await page.goto('index.html');
    await record(page);
    await page.waitFor(() => window.__town && window.__town.at === 'school/classroom' && !window.__town.busy && window.__town.scene.cubbies);
    assert.deepEqual(await snap(), before);
    assert.equal((await sc(page, () => window.__town.scene.cubbies.face(2))).owner, S.leo);
    assert.equal(await page.eval((id) => window.__store.state.entities[id].props.seat, S.maya), 'nap-cot:' + S.cot);
    await page.waitFor(imagesReady);
    await page.waitFor(calm, { timeout: 15000 });
    assert.equal(await page.eval(noText), '');
    await page.screenshot('school-after-reload');
    await panTo(page, 0);
    await page.waitFor(imagesReady);
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-after-reload-arrival');
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
