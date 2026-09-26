// End-to-end: the theater's show magic (P2b.2, src/scenes/theater-show.js)
// with real (trusted) touches on an iPad landscape viewport. A spotlight is
// dragged along the rail to another spot (the lamp there slides over) and
// tapped through its colours; Luna standing in a lit pool shines (sparkle,
// proud face, star pose), and walking into another lit pool she shines again.
// The backdrop is tapped and the fly rope pulled through all four scenes:
// each flies, brings its ambience sound and a few particles (capped), and the
// ambience stops by itself. The four booth buttons and the machines fire fog,
// confetti, snow and thunder; the audience goes ooh, cheers, gasps and laughs;
// thunder flashes (not with prefers-reduced-motion). After it all the page
// goes back to zero animations and zero timers. Reload: the spotlight spots
// and colours and the backdrop are still there.

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
const busyAnims = () => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length;
const show = (page) => page.eval(() => window.__town.scene.show.state());
const stats = (page) => page.eval(() => window.__town.scene.show.stats());

/** A screen point where a touch picks element el (found in the page by `find`). */
const pointOn = (page, find, arg) => page.eval(([src, arg]) => {
  const el = (0, eval)(src)(arg);
  const r = el.getBoundingClientRect();
  const fr = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const fy of fr) for (const fx of fr) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < 90 || y < 90 || x > innerWidth - 20 || y > innerHeight - 20) continue;
    if (window.__input.hitTest(x, y) === el) return { x, y };
  }
  return null;
}, [String(find), arg]);
const piecePoint = (page, pid, i = 0) => pointOn(page, ([pid, i]) => window.__town.scene.pieces.el(pid, i), [pid, i]);
const w2s = (page, x, y) => page.eval(([x, y]) => window.__stage.worldToScreen(x, y), [x, y]);
const panTo = async (page, x) => { await page.eval((x) => window.__stage.camera.panTo(x), x); await page.waitFor(() => !window.__stage.camera.moving); await page.frames(3); };
const castId = (page, cast) => page.eval(([cast, room]) => Object.values(window.__store.state.entities).find((e) => e.kind === 'char' && e.room === room && e.props.cast === cast).id, [cast, THEATER]);

describe('theater show: spotlights, scenery, effects (ipad-air, landscape, touch)', () => {
  let page;
  const S = {};
  before(async () => {
    page = await openPage({ viewport: 'ipad-air' });
    await record(page);
    await page.eval(() => window.__town.go('theater/stage'));
    await page.waitFor(() => window.__town.at === 'theater/stage' && !window.__town.busy, { timeout: 20000 });
    await page.waitFor(imagesReady);
    await page.waitFor(() => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0, { timeout: 20000 });
    S.luna = await castId(page, 'performer');
  });
  after(async () => { if (page) await page.close(); });

  it('a spotlight drags along the rail and snaps to a spot (the lamp there slides over); a tap cycles its colour; Luna in the light shines', async () => {
    const s0 = await show(page);
    assert.deepEqual(s0.spots.map((q) => [q.x, q.color]), [[1204, 'off'], [1456, 'off'], [1708, 'off']]);
    assert.equal(s0.perm, '012');
    // Drag lamp 0 by its body to (near) the third spot, with a real finger.
    const from = await piecePoint(page, 'spotlight', 0);
    assert.ok(from, 'a touch point on lamp 0');
    const to = await page.eval(([x, y]) => { const g = window.__stage.screenToWorld(x, y); return window.__stage.worldToScreen(g.x + 1690 - 1204, g.y + 8); }, [from.x, from.y]);
    await clearRec(page);
    await page.drag(from, to, { steps: 18, durationMs: 420 });
    await page.waitFor(() => window.__town.scene.show.state().perm === '210');
    await page.waitFor(() => { const s = window.__town.scene.show.state().spots; return s[0].x === 1708 && s[2].x === 1204; });
    assert.ok((await sounds(page)).includes('clunk'), 'the lamp clunks into its spot');
    await page.waitFor(() => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0);
    // The copy's element really sits at the new spot once it has slid there (its hit box rides along).
    const lampX = await page.eval(() => { const r = window.__town.scene.pieces.el('spotlight', 0).getBoundingClientRect(); return window.__stage.screenToWorld(r.left + r.width / 2, r.top).x; });
    assert.ok(Math.abs(lampX - 1708) < 4, `lamp 0 is over x 1708 (${lampX})`);

    // Lamp 2 is now at 1204, right over Luna (x 1290): tap it on -> white; she shines.
    const shines0 = (await stats(page)).shines;
    const p2 = await piecePoint(page, 'spotlight', 2);
    await clearRec(page);
    await page.tap(p2.x, p2.y);
    await page.waitFor(() => window.__town.scene.show.state().spots[2].shown === 'white');
    await page.waitFor(`window.__town.scene.show.stats().shines > ${shines0}`);
    const snd = await sounds(page);
    assert.ok(snd.includes('clink'), 'the lamp clicks on');
    assert.ok(snd.includes('sparkle'), 'Luna sparkles in the light');
    await page.frames(12);
    await page.screenshot('theater-show-spot-white');
    // Two more taps: pink, blue.
    for (const want of ['pink', 'blue']) {
      await page.tap(p2.x, p2.y);
      await page.waitFor(`window.__town.scene.show.state().spots[2].shown === '${want}'`);
    }
    // Lamp 0 (at 1708) on: gold (4 taps).
    const p0 = await piecePoint(page, 'spotlight', 0);
    for (const want of ['white', 'pink', 'blue', 'gold']) {
      await page.tap(p0.x, p0.y);
      await page.waitFor(`window.__town.scene.show.state().spots[0].shown === '${want}'`);
    }
    const props = await page.eval(() => window.__town.scene.fixtures().props);
    assert.equal(props.spot0, 'gold');
    assert.equal(props.spot2, 'blue');
    assert.equal(props.spots, '210');

    // Walk Luna into lamp 0's gold pool (a real drag of her body): she shines again.
    const shines1 = (await stats(page)).shines;
    await page.waitFor(() => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0, { timeout: 20000 });
    const lf = await pointOn(page, (id) => window.__town.scene.view.viewOf(id).el, S.luna);
    const lt = await page.eval(([id, fx, fy]) => {
      const v = window.__town.scene.view.viewOf(id);
      const g = window.__stage.screenToWorld(fx, fy);
      return window.__stage.worldToScreen(g.x + 1700 - v.x, g.y + 805 - v.y);
    }, [S.luna, lf.x, lf.y]);
    await page.drag(lf, lt, { steps: 18, durationMs: 500 });
    await page.waitFor(`Math.abs(window.__store.state.entities['${S.luna}'].x - 1700) < 60`);
    await page.waitFor(`window.__town.scene.show.stats().shines > ${shines1}`);
    assert.deepEqual(await page.eval(() => window.__town.scene.performers()), [S.luna], 'Luna is still on the stage');
    await page.frames(15);
    await page.screenshot('theater-show-spot-gold');
  });

  it('the backdrop flies through all four scenes (tap, or pull the fly rope): a whoosh, the ambience sound, a few capped particles; the ambience stops by itself', async () => {
    const seen = [];
    assert.equal((await show(page)).backdrop, 'stars');
    const want = { castle: 'breeze', sea: 'waves', city: 'traffic', stars: 'crickets' };
    for (const [i, scene] of ['castle', 'sea', 'city', 'stars'].entries()) {
      await clearRec(page);
      if (i === 2) {
        // Pull the fly rope down with a finger.
        const r = await pointOn(page, () => window.__town.scene.show.rope());
        assert.ok(r, 'a touch point on the fly rope');
        await page.drag(r, { x: r.x, y: r.y + 110 }, { steps: 12, durationMs: 360 });
      } else {
        const b = await piecePoint(page, 'backdrop');
        assert.ok(b, 'a touch point on the backdrop');
        await page.tap(b.x, b.y);
      }
      await page.waitFor(`window.__town.scene.show.state().backdrop === '${scene}'`);
      await page.waitFor(`(() => { const s = window.__town.scene.show.state(); return !s.flying && s.ambience === '${scene}'; })()`, { timeout: 20000 });
      await page.waitFor(`window.__rec.sounds.includes('${want[scene]}')`);
      const snd = await sounds(page);
      assert.ok(snd.includes('swoosh'), 'it flies with a whoosh');
      assert.ok(snd.includes('thud'), 'the next one lands with a thud');
      assert.equal(await page.eval(() => window.__town.scene.pieces.shown('backdrop')), scene, 'the new scene is shown');
      if (i === 1) { await page.waitFor(() => window.__town.scene.show.stats().ambience.particles >= 3); await page.screenshot('theater-show-sea'); }
      seen.push(scene);
    }
    assert.equal((await stats(page)).ropePulls, 1);
    // The last ambience (the stars' crickets) stops by itself.
    await page.waitFor(() => window.__town.scene.show.state().ambience === null, { timeout: 20000 });
    const st = await stats(page);
    assert.equal(st.ambience.why, 'done');
    assert.equal(st.ambience.started, 4);
    assert.equal(st.ambience.stopped, 4, 'every ambience stopped (3 by the next scene, the last by itself)');
    assert.ok(st.ambience.particles > 0 && st.ambience.particles < 80, `ambient particles ${st.ambience.particles}`);
    const s = await show(page);
    assert.ok(s.fx.created <= 48 && st.peak <= 48, `particles capped (${s.fx.created} made, peak ${st.peak})`);
    assert.equal(s.fx.active, 0);
    assert.deepEqual(seen, ['castle', 'sea', 'city', 'stars']);
  });

  it('the booth buttons and the machines: fog (ooh), confetti (cheer), snow, thunder (a flash, a gasp, then laughter)', async () => {
    await panTo(page, 1440);   // the audience + booth
    const react = async (pid, effect, sfxWanted) => {
      const n0 = (await stats(page)).effects[effect];
      await clearRec(page);
      const p = await piecePoint(page, pid);
      assert.ok(p, `a touch point on ${pid}`);
      await page.tap(p.x, p.y);
      await page.waitFor(`window.__town.scene.show.stats().effects['${effect}'] === ${n0 + 1}`);
      for (const s of sfxWanted) await page.waitFor(`window.__rec.sounds.includes('${s}')`, { timeout: 8000 });
    };
    await react('fx-fog', 'fog', ['ooh']);
    assert.equal(await page.eval(() => window.__town.scene.pieces.shown('fog-machine')), 'on');
    await react('fx-confetti', 'confetti', ['pop', 'cheer', 'applause']);
    await react('fx-snow', 'snow', ['whoosh']);
    const flashes = (await stats(page)).flashes;
    await react('fx-thunder', 'thunder', ['thunder', 'gasp', 'laugh']);
    assert.equal((await stats(page)).flashes, flashes + 1, 'a lightning flash');
    const r = (await stats(page)).reactions;
    assert.ok(r.ooh >= 1 && r.cheer >= 1 && r.gasp >= 1 && r.laugh >= 1, JSON.stringify(r));
    // Everything ends: back to zero.
    await page.waitFor(() => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0, { timeout: 20000 });
    await page.waitFor(() => window.__town.scene.show.state().timers === 0 && window.__town.scene.show.state().fx.active === 0, { timeout: 20000 });

    // The machines on the stage fire too (all three at once), and thunder from the sheet backstage.
    await panTo(page, 736);
    const before = (await stats(page)).effects;
    for (const pid of ['fog-machine', 'confetti-cannon', 'snow-machine']) {
      // The middle of each machine is the machine (not the piano or the guitar in front of it).
      const p = await page.eval((pid) => { const el = window.__town.scene.pieces.el(pid); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return { x, y, ok: window.__input.hitTest(x, y) === el }; }, pid);
      assert.ok(p.ok, `a tap in the middle of ${pid} lands on it`);
      await page.tap(p.x, p.y);
    }
    await page.waitFor(`(() => { const e = window.__town.scene.show.stats().effects; return e.fog === ${before.fog + 1} && e.confetti === ${before.confetti + 1} && e.snow === ${before.snow + 1}; })()`);
    await page.frames(40);
    await page.screenshot('theater-show-fog-confetti-snow');
    const s = await show(page);
    assert.ok(s.fx.created <= 48, `the show pool stays capped (${s.fx.created})`);
    // Reduced motion: thunder rumbles and the audience reacts, but no flash.
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await panTo(page, 400);
    const f0 = (await stats(page)).flashes;
    await clearRec(page);
    const t = await piecePoint(page, 'thunder-sheet');
    assert.ok(t, 'a touch point on the thunder sheet');
    await page.tap(t.x, t.y);
    await page.waitFor(() => window.__rec.sounds.includes('thunder'));
    await page.waitFor(() => window.__rec.sounds.includes('laugh'), { timeout: 8000 });
    assert.equal((await stats(page)).flashes, f0, 'no flash with reduced motion');
    assert.equal(await page.eval(() => document.querySelectorAll('.show-flash').length), 0);
    await page.send('Emulation.setEmulatedMedia', { features: [] });
    // Idle: zero animations, zero timers (show and theater), no particles.
    await page.waitFor(() => document.getAnimations().filter((a) => a.animationName !== 'char-breathe' && a.id !== 'char-idle').length === 0, { timeout: 20000 });
    await page.waitFor(() => window.__town.scene.show.state().timers === 0 && window.__town.scene.stats().timers === 0, { timeout: 20000 });
    await page.frames(30);
    assert.equal(await page.eval(busyAnims), 0, 'nothing animates once the effects end');
    assert.equal((await show(page)).fx.active, 0);
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.externalRequests(), []);
  });

  it('reload: the spotlight spots and colours and the backdrop are still there', async () => {
    await page.goto('index.html');
    await page.waitFor(() => window.__town.at === 'theater/stage' && !window.__town.busy && window.__town.scene.show, { timeout: 20000 });
    await page.waitFor(imagesReady);
    const s = await show(page);
    assert.equal(s.perm, '210');
    assert.deepEqual(s.spots.map((q) => [q.x, q.color]), [[1708, 'gold'], [1456, 'off'], [1204, 'blue']]);
    assert.equal(s.backdrop, 'stars');
    await page.waitFor(() => window.__town.scene.show.state().spots.every((q) => q.shown === q.color));
    assert.equal(s.ambience, null, 'no ambience plays on its own after a reload');
    await panTo(page, 736);
    await page.screenshot('theater-show-after-reload');
    assert.deepEqual(page.errors, []);
  });
});
