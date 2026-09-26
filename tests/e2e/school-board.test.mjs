// End-to-end: the school's teaching wall (P2d.2) with real (trusted) touches.
// speechSynthesis is stubbed in the page (a fake on-device voice that logs
// each utterance and ends it a moment later), so the test hears what the
// voice would say. Tap B: "B", "buh", "ball" and a ball picture; drag C, A, T
// magnets onto a whiteboard row: a cheer and "cat"; a sight-word card is read
// (and a kid says it again); the turn button flips the words; the weather slot
// to rain: the window rains (particles behind the glass) and then stops;
// today's calendar dot: a star and "Today is <day>!"; the teacher's "line up"
// card: the kids hop to the footprints; the voice off: a wiggle and a plink,
// no words; reload: all of it is still there.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../tools/harness.mjs';

const SCHOOL = 'school/classroom';
const STUB = `(() => {
  const log = window.__utter = [];
  class FakeUtterance { constructor(text) { this.text = text; this.volume = 1; } }
  const fake = {
    speaking: false, pending: false, paused: false,
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'fake-samantha', default: true }],
    speak(u) { if (String(u.text).trim()) log.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 20); },
    cancel() {}, pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
})();`;

const utter = (page) => page.eval(() => window.__utter.slice());
const clearUtter = (page) => page.eval(() => { window.__utter.length = 0; });
const sc = (page, fn, arg) => page.eval(fn, arg);
const board = (page) => sc(page, () => window.__town.scene.board.stats());
const calm = () => !window.__town.busy && !window.__stage.camera.moving && !window.__stage.camera.dragging
  && document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0;
// Text on screen other than the reading layer (the sight words).
const otherText = () => {
  const els = [...document.querySelectorAll('[data-reading]')];
  els.forEach((e) => { e.style.display = 'none'; });
  const t = document.body.innerText.trim();
  els.forEach((e) => { e.style.display = 'flex'; });
  return t;
};

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
const entPoint = (page, id) => page.eval((id) => {
  const v = window.__town.scene.view.viewOf(id);
  const r = v.el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.15, 0.85];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 12 || y < 100 || x > innerWidth - 10 || y > innerHeight - 10) continue;
    const h = window.__input.hitTest(x, y);
    if (h && v.el.contains(h)) return { x, y };
  }
  return null;
}, id);
const toScreen = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
async function panTo(page, x) {
  await page.eval((x) => window.__stage.camera.panTo(x), x);
  await page.waitFor(() => !window.__stage.camera.moving);
  await page.frames(3);
}
const castId = (page, cast) => page.eval(([c, room]) => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && !e.deleted && e.room === room && e.props.cast === c).id, [cast, SCHOOL]);

describe('school teaching wall (ipad-air, landscape, touch)', () => {
  let page;
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    await page.goto('index.html');
    await page.eval(() => window.__town.go('school/classroom'));
    await page.waitFor(() => window.__town.at === 'school/classroom' && !window.__town.busy, { timeout: 20000 });
    await panTo(page, 946);
    await page.waitFor(calm, { timeout: 20000 });
  });
  after(async () => { if (page) await page.close(); });

  it('tap B: it bounces, the voice says "B", "buh", "ball" and a ball picture pops up', async () => {
    await clearUtter(page);
    await page.eval(() => {
      window.__pics = [];
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const p = n.querySelector && n.querySelector('[data-letter-pic]'); if (p) window.__pics.push({ ch: p.dataset.letterPic, sprite: p.querySelector('[data-sprite]').dataset.sprite, img: (p.querySelector('img') || {}).src || null }); } })
        .observe(window.__town.scene.room.fxLayer, { childList: true });
    });
    const b = await elPoint(page, { hit: 'letter-B' });
    assert.ok(b, 'a touch point on B');
    await page.tap(b.x, b.y);
    await page.waitFor(() => window.__utter.length >= 3, { timeout: 10000 });
    assert.deepEqual(await utter(page), ['B.', 'buh.', 'ball!']);
    const pics = await page.eval(() => window.__pics);
    assert.equal(pics.length, 1);
    assert.equal(pics[0].ch, 'B');
    assert.equal(pics[0].sprite, 'ball');
    assert.match(pics[0].img, /sprites\/props\/ball\.webp$/);
    assert.equal((await board(page)).letters, 1);
    await page.frames(12);
    await page.screenshot('school-board-letter-b');
    await page.waitFor(calm, { timeout: 15000 });
    assert.equal(await page.eval(() => window.__town.scene.room.fxLayer.querySelectorAll('[data-letter-pic]').length), 0, 'the picture goes away');
  });

  it('drag C, A, T off the wall onto a whiteboard row: a cheer and "cat"', async () => {
    await clearUtter(page);
    const row = await page.eval(() => window.__town.scene.room.def.surfaces.find((s) => s.id === 'wb-row-1'));
    assert.ok(row);
    const xs = [row.x0 + 50, row.x0 + 108, row.x0 + 166];
    const ids = [];
    for (const [i, ch] of ['C', 'A', 'T'].entries()) {
      await page.waitFor(calm, { timeout: 15000 });
      const from = await elPoint(page, { hit: 'letter-' + ch });
      const to = await toScreen(page, xs[i], row.y - 22);
      const before = await sc(page, () => window.__town.scene.board.magnets().map((q) => q.id));
      await page.drag(from, to, { steps: 16, durationMs: 380 });
      await page.waitFor(`window.__town.scene.board.magnets().length === ${before.length + 1}`);
      const m = (await sc(page, () => window.__town.scene.board.magnets())).find((q) => !before.includes(q.id));
      assert.equal(m.ch, ch);
      ids.push(m.id);
    }
    await page.waitFor(() => window.__town.scene.board.stats().words.includes('cat'), { timeout: 10000 });
    await page.waitFor(() => window.__utter.includes('cat!'));
    const ms = await sc(page, () => window.__town.scene.board.magnets());
    for (const m of ms) assert.equal(m.y, row.y, `${m.ch} sticks on the row`);
    const rows = await sc(page, () => window.__town.scene.board.rows());
    assert.ok(rows.some((r) => r.word === 'cat' && r.ids.length === 3));
    assert.ok((await board(page)).reacts >= 1, 'a character cheers');
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-board-cat');
    // A fourth magnet dropped back on the wall goes home.
    const n0 = ms.length;
    const from = await elPoint(page, { hit: 'letter-Z' });
    const mid = await toScreen(page, 1500, 600);
    await page.drag(from, mid, { steps: 12, durationMs: 300 });
    await page.waitFor(`window.__town.scene.board.magnets().length === ${n0 + 1}`);
    await page.waitFor(calm, { timeout: 15000 });
    const z = (await sc(page, () => window.__town.scene.board.magnets())).find((q) => q.ch === 'Z');
    const zp = await entPoint(page, z.id);
    const wall = await toScreen(page, 1700, 40);
    await page.drag(zp, wall, { steps: 12, durationMs: 300 });
    await page.waitFor(`window.__town.scene.board.magnets().length === ${n0}`);
    assert.equal((await board(page)).homes, 1);
  });

  it('a sight-word card is read, a kid says it again; the turn button flips the words', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    await clearUtter(page);
    const words = await page.eval(() => [...document.querySelectorAll('.school-word')].map((w) => w.textContent));
    assert.deepEqual(words, ['the', 'I', 'a', 'see', 'can', 'like', 'go', 'is']);
    const p = await elPoint(page, { hit: 'sight-3' });
    await page.tap(p.x, p.y);
    await page.waitFor(() => window.__utter.length >= 2);
    assert.deepEqual(await utter(page), ['see.', 'see!']);
    const st = await board(page);
    assert.equal(st.lastSight, 'see');
    assert.equal(st.repeats, 1);
    await page.frames(6);
    await page.screenshot('school-board-sight');
    await page.waitFor(calm, { timeout: 15000 });
    const f = await elPoint(page, { hit: 'sight-flip' });
    assert.ok(f, 'the turn button takes a touch');
    await page.tap(f.x, f.y);
    await page.waitFor(() => document.querySelector('.school-word').textContent === 'my' && window.__town.scene.board.page() === 1);
    await page.waitFor(calm, { timeout: 15000 });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.school-word')].map((w) => w.textContent)), ['my', 'we', 'you', 'and', 'to', 'me', 'it', 'up']);
    await page.tap(f.x, f.y);
    await page.waitFor(() => document.querySelector('.school-word').textContent === 'the');
  });

  it('the weather slot to rain: the window rains behind the glass, then stops by itself', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    const p = await elPoint(page, { piece: 'weather-today' });
    assert.ok(p);
    for (const w of ['sun', 'cloud', 'rain']) {
      await page.tap(p.x, p.y);
      await page.waitFor(`window.__town.scene.board.weather() === '${w}' && window.__town.scene.pieces.shown('class-window') === '${w}' && window.__town.scene.pieces.shown('weather-today') === '${w}'`);
    }
    await page.waitFor(() => window.__town.scene.board.stats().falling > 0);
    const fx = await page.eval(() => {
      const box = document.querySelector('.school-weatherfx');
      return { n: box.children.length, inWindow: box.parentElement === window.__town.scene.pieces.el('class-window'), overflow: getComputedStyle(box).overflow };
    });
    assert.ok(fx.n > 0 && fx.n <= 14, `capped rain drops (${fx.n})`);
    assert.ok(fx.inWindow && fx.overflow === 'hidden', 'only behind the glass');
    await page.frames(20);
    await page.screenshot('school-board-rain');
    await page.waitFor(() => window.__town.scene.board.stats().falling === 0 && document.querySelector('.school-weatherfx').children.length === 0, { timeout: 15000 });
    await page.waitFor(calm, { timeout: 15000 });
  });

  it("today's calendar dot: a sticker star and \"Today is <day>!\"", async () => {
    await clearUtter(page);
    const dot = await page.eval(() => {
      const c = window.__town.manifest.rooms.school.rigs.calendar;
      return c.weekDots[new Date().getDay()];
    });
    const s = await toScreen(page, dot[0], dot[1]);
    assert.equal(await page.eval(([x, y]) => window.__input.hitTest(x, y) === window.__town.scene.hits.el('calendar'), [s.x, s.y]), true);
    await page.tap(s.x, s.y);
    const day = await page.eval(() => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]);
    await page.waitFor(() => window.__utter.length >= 1);
    assert.deepEqual(await utter(page), [`Today is ${day}!`]);
    assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.school-cal-star')).visibility), 'visible');
    assert.equal((await board(page)).stars, 1);
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-board-calendar');
  });

  it('the teacher holds up "line up": the voice says it, the kids hop to the footprints', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    await clearUtter(page);
    const teacher = await castId(page, 'teacher');
    await page.eval(() => window.__town.scene.board.forceCard('line-up'));
    const t = await entPoint(page, teacher);
    assert.ok(t, 'a touch point on the teacher');
    await page.tap(t.x, t.y);
    await page.waitFor(() => !!window.__town.scene.room.fxLayer.querySelector('[data-card="line-up"]'));
    await page.frames(10);
    await page.screenshot('school-board-teacher-card');
    await page.waitFor(() => window.__utter.includes('line up!'));
    const kids = ['girl9', 'boy5', 'girl5', 'boy9'];
    const ids = [];
    for (const k of kids) ids.push(await castId(page, k));
    await page.waitFor(`${JSON.stringify(ids)}.every((id) => /^line-\\d$/.test(window.__store.state.entities[id].props.seat || ''))`, { timeout: 10000 });
    const seats = await page.eval((ids) => ids.map((id) => window.__store.state.entities[id].props.seat), ids);
    assert.equal(new Set(seats).size, 4, 'one footprint each');
    assert.equal(await page.eval((id) => window.__store.state.entities[id].props.seat, teacher), 'rocking-chair', 'the teacher stays');
    await panTo(page, 300);
    await page.waitFor(calm, { timeout: 15000 });
    await page.screenshot('school-board-line-up');
    await panTo(page, 946);
  });

  it('"clean up": only supplies on the floor hop back to their bins; a table, a pocket, food and far-away things stay put', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    const hot = (kind) => page.eval((k) => Object.values(window.__store.state.entities).find((e) => e.kind === k && !e.deleted && e.room === 'school/classroom').id, kind);
    // What a drag pulled out (a bin gives one of its kinds at random: the crayon bin, a crayon or chalk).
    const live = () => page.eval(() => Object.values(window.__store.state.entities).filter((e) => !e.deleted).map((e) => e.id));
    const newOf = async (fn) => {
      const before = await live();
      await fn();
      await page.waitFor(`Object.values(window.__store.state.entities).filter((e) => !e.deleted).length === ${before.length + 1}`);
      await page.waitFor(calm, { timeout: 15000 });
      return (await live()).find((id) => !before.includes(id));
    };
    const bin = await hot('school-crayon-bin');
    const books = await hot('school-books');
    // (Kept above the bottom band: a drop there goes into the pocket tray.)
    // A kid pulls a crayon onto the kid table, another onto the floor, a book onto the floor, a lone O magnet onto the floor.
    const table = await page.eval(() => window.__town.scene.room.def.surfaces.find((q) => q.id === 'kid-table'));
    const onTable = await newOf(async () => page.drag(await entPoint(page, bin), await toScreen(page, 1470, table.y - 20), { steps: 14, durationMs: 340 }));
    const onFloor = await newOf(async () => page.drag(await entPoint(page, bin), await toScreen(page, 1600, 870), { steps: 14, durationMs: 340 }));
    const book = await newOf(async () => page.drag(await entPoint(page, books), await toScreen(page, 1780, 880), { steps: 14, durationMs: 340 }));
    const mag = await newOf(async () => page.drag(await elPoint(page, { hit: 'letter-O' }), await toScreen(page, 1260, 875), { steps: 14, durationMs: 340 }));
    const ents = await page.eval((ids) => ids.map((id) => { const e = window.__store.state.entities[id]; return Object.assign({}, e, { pk: e.parent ? window.__store.state.entities[e.parent].kind : null }); }), [onTable, onFloor, book, mag]);
    assert.equal(ents[0].y, table.y, 'the crayon rests on the table');
    assert.ok([1, 2, 3].every((i) => ents[i].room === 'school/classroom' && ents[i].y > 850), 'the others lie on the floor: ' + JSON.stringify(ents.map((q) => [q.kind, q.x, q.y, q.pk, q.room])));
    // Things from elsewhere: a cupcake in the pocket, a cupcake and a construction block on the classroom floor.
    const far = await page.eval(() => {
      const st = window.__store;
      const ids = { pocket: st.newId(), cupcake: st.newId(), block: st.newId() };
      st.dispatch('spawn', { id: ids.pocket, kind: 'cupcake', room: 'pocket/' + st.device, x: 0, y: 0 });
      st.dispatch('spawn', { id: ids.cupcake, kind: 'cupcake', room: 'school/classroom', x: 1700, y: 960 });
      st.dispatch('spawn', { id: ids.block, kind: 'blocks', room: 'school/classroom', x: 1880, y: 940 });
      return ids;
    });
    const where = (ids) => page.eval((ids) => ids.map((id) => { const e = window.__store.state.entities[id]; return e && !e.deleted ? `${e.room}@${e.x},${e.y}` : null; }), ids);
    const stay = [onTable, far.pocket, far.cupcake, far.block, ...(await sc(page, () => window.__town.scene.board.magnets().filter((q) => q.ch !== 'O').map((q) => q.id)))];
    const stayAt = await where(stay);
    const kids = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'school/classroom').map((e) => `${e.id}:${e.props.seat}@${e.x},${e.y}`).sort());
    await page.waitFor(calm, { timeout: 15000 });
    await clearUtter(page);
    const teacher = await castId(page, 'teacher');
    await page.eval(() => window.__town.scene.board.forceCard('clean-up'));
    const t = await entPoint(page, teacher);
    await page.tap(t.x, t.y);
    await page.waitFor(() => window.__utter.includes('clean up!'));
    await page.waitFor(`${JSON.stringify([onFloor, book, mag])}.every((id) => !window.__store.state.entities[id] || window.__store.state.entities[id].deleted)`, { timeout: 10000 });
    await page.waitFor(calm, { timeout: 15000 });
    assert.deepEqual((await board(page)).lastCleanUp.slice().sort(), [onFloor, book, mag].sort(), 'exactly the floor supplies');
    assert.deepEqual(await where(stay), stayAt, 'the table crayon, the pocket and floor cupcakes, the far-away block and the CAT row stay put');
    assert.deepEqual(await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'school/classroom').map((e) => `${e.id}:${e.props.seat}@${e.x},${e.y}`).sort()), kids, 'no kid moved');
    // Tidy up after the test's own far-away things (so the reload check sees the room as the kids left it).
    await page.eval((ids) => { for (const id of ids) window.__store.dispatch('remove', { id, hard: true }); }, [far.pocket, far.cupcake, far.block]);
    await page.screenshot('school-board-clean-up');
  });

  it('the voice off: a card wiggles and plinks, a letter bounces with notes, no words', async () => {
    await page.waitFor(calm, { timeout: 15000 });
    await page.eval(async () => { const a = await import('./src/audio/index.js'); a.setSpeechOn(false); });
    await clearUtter(page);
    const st0 = await board(page);
    const p = await elPoint(page, { hit: 'sight-0' });
    await page.tap(p.x, p.y);
    await page.waitFor(`window.__town.scene.board.stats().sight === ${st0.sight + 1}`);
    assert.ok(await page.eval(() => window.__town.scene.hits.el('sight-0').getAnimations().length > 0), 'the card wiggles');
    const b = await elPoint(page, { hit: 'letter-M' });
    await page.tap(b.x, b.y);
    await page.waitFor(`window.__town.scene.board.stats().plinks >= ${st0.plinks + 4}`);
    await page.waitFor(calm, { timeout: 15000 });
    assert.deepEqual(await utter(page), [], 'nothing spoken');
    assert.equal((await board(page)).repeats, st0.repeats, 'no kid repeats with the voice off');
    await page.eval(async () => { const a = await import('./src/audio/index.js'); a.setSpeechOn(true); });
  });

  it('reload: the weather, the window, the magnets, the star and the line are all still there', async () => {
    const before = await sc(page, () => window.__town.scene.board.magnets().map((q) => `${q.ch}@${q.x},${q.y}`).sort());
    await page.goto('index.html');
    await page.waitFor(() => window.__town.at === 'school/classroom' && !window.__town.busy, { timeout: 20000 });
    await panTo(page, 946);
    assert.equal(await sc(page, () => window.__town.scene.board.weather()), 'rain');
    await page.waitFor(() => window.__town.scene.pieces.shown('class-window') === 'rain' && window.__town.scene.pieces.shown('weather-today') === 'rain');
    assert.deepEqual(await sc(page, () => window.__town.scene.board.magnets().map((q) => `${q.ch}@${q.x},${q.y}`).sort()), before);
    assert.ok((await sc(page, () => window.__town.scene.board.rows())).some((r) => r.word === 'cat'));
    assert.equal(await page.eval(() => getComputedStyle(document.querySelector('.school-cal-star')).visibility), 'visible');
    const line = await page.eval(() => Object.values(window.__store.state.entities).filter((e) => e.kind === 'char' && e.room === 'school/classroom' && /^line-/.test(e.props.seat || '')).length);
    assert.equal(line, 4);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.school-word')].map((w) => w.textContent)).then((w) => w.length), 8);
    // Back on a rainy day it rains for a moment, then stops: an idle school does no work.
    await page.waitFor(calm, { timeout: 20000 });
    assert.equal(await page.eval(otherText), '', 'no text but the sight words');
    await page.screenshot('school-board-after-reload');
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });
});
