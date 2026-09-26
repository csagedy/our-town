/* Drives a real session with synthetic pointer events and reports what
   happened. Injected into a throwaway copy of index.html by tools/test.py. */
(function () {
  const log = [];
  const ok = (n, c, d) => log.push((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + d : ''));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function client(sx, sy) {
    const st = document.getElementById('stage');
    const r = st.getBoundingClientRect();
    const k = r.width / 1200;
    return { x: r.left + sx * k, y: r.top + sy * k };
  }
  function ev(type, x, y, target) {
    const e = new PointerEvent(type, {
      clientX: x, clientY: y, bubbles: true, cancelable: true,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    });
    (target || document.elementFromPoint(x, y) || window).dispatchEvent(e);
    return e;
  }
  async function dragFrom(el, toSx, toSy) {
    const r = el.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const to = client(toSx, toSy);
    ev('pointerdown', from.x, from.y, el);
    await sleep(20);
    ev('pointermove', (from.x + to.x) / 2, (from.y + to.y) / 2, window);
    await sleep(20);
    ev('pointermove', to.x, to.y, window);
    await sleep(20);
    ev('pointerup', to.x, to.y, window);
    await sleep(60);
  }
  async function dragThing(spec, toSx, toSy) {
    const el = LLB.live()[spec.id];
    const from = client(spec.x, spec.y - 20);
    const to = client(toSx, toSy);
    ev('pointerdown', from.x, from.y, el);
    await sleep(20);
    ev('pointermove', to.x, to.y, window);
    await sleep(20);
    ev('pointerup', to.x, to.y, window);
    await sleep(60);
  }
  const station = k => LLB.state() && E.DATA.rooms[LLB.room()].stations[k];

  async function run() {
    try {
      await sleep(400);
      LLB.ovenMs(600);
      const S = LLB.state;

      ok('game started', !!S() && LLB.room() === 'kitchen', LLB.room());
      ok('kitchen seeded', LLB.things().length >= 8, LLB.things().length + ' things');

      // --- tap a source
      const before = S().basket.length;
      document.querySelectorAll('.hotspot').forEach(h => h.click());
      await sleep(120);
      ok('tapping the pantry fills the basket', S().basket.length > before,
         before + ' -> ' + S().basket.length);

      // --- basket -> bowl, twice
      const bowl = station('bowl');
      for (let i = 0; i < 2; i++) {
        const slot = document.querySelector('#basketslots .slot:not(.empty)');
        if (!slot) break;
        await dragFrom(slot, bowl.x, bowl.y);
      }
      ok('ingredients go into the bowl', S().bowl.length >= 1,
         'bowl=' + JSON.stringify(S().bowl));

      // --- mix
      const bowlSpot = [...document.querySelectorAll('.hotspot')].find(h =>
        Math.abs(parseFloat(h.style.left) + parseFloat(h.style.width) / 2 - bowl.x) < 4);
      if (bowlSpot) bowlSpot.click();
      await sleep(900);
      const dough = LLB.things().find(s => s.kind === 'dough');
      ok('mixing makes a dough', !!dough, dough ? dough.item : 'none');
      ok('bowl empties after mixing', S().bowl.length === 0);

      // --- bake
      if (dough) {
        const ov = station('oven');
        await dragThing(dough, ov.x, ov.y);
        ok('dough goes in the oven', !!S().oven,
           S().oven ? JSON.stringify(S().oven.ings) : 'no');
        await sleep(1400);
        const bake = LLB.things().find(s => s.kind === 'bake');
        ok('the oven produces a bake', !!bake, bake ? bake.item : 'none');

        // --- decorate
        const top = LLB.things().find(s => s.kind === 'topping');
        if (bake && top) {
          await dragThing(top, bake.x, bake.y - 6);
          const b2 = LLB.things().find(s => s.id === bake.id);
          ok('a topping sticks to a bake', !!(b2 && b2.layers && b2.layers.length),
             JSON.stringify(b2 && b2.layers));
        }

        // --- carry it to the shop
        if (bake) {
          const el = LLB.live()[bake.id];
          const br = document.getElementById('basket').getBoundingClientRect();
          const from = client(bake.x, bake.y - 20);
          ev('pointerdown', from.x, from.y, el);
          await sleep(20);
          ev('pointermove', br.left + br.width / 2, br.top + 30, window);
          await sleep(20);
          ev('pointerup', br.left + br.width / 2, br.top + 30, window);
          await sleep(120);
          ok('a bake can go in the basket',
             S().basket.indexOf(bake.item) >= 0, JSON.stringify(S().basket));
        }
      }

      // --- surfaces: drop something onto the big kitchen counter
      const anyThing = LLB.things().find(s => s.kind === 'ingredient' || s.kind === 'topping');
      const surf = E.DATA.rooms.kitchen.surfaces[1];
      if (anyThing && surf) {
        const mid = (surf.x0 + surf.x1) / 2;
        await dragThing(anyThing, mid, surf.y + 20);
        const a2 = LLB.things().find(s => s.id === anyThing.id);
        ok('dropping on a counter snaps onto its surface',
           !!(a2 && Math.abs(a2.y - surf.y) < 1), 'y=' + (a2 && a2.y) +
           ' surface=' + surf.y);
      }

      // --- the floor band, and the depth cue that comes with it
      const loose = LLB.things().find(s => s.kind === 'topping');
      if (loose) {
        const b = E.DATA.rooms.kitchen.band;
        await dragThing(loose, (b.x0 + b.x1) / 2, b.front + 400);
        const l2 = LLB.things().find(s => s.id === loose.id);
        ok('a thing dropped past the floor stays in the band',
           !!(l2 && l2.y <= b.front + 0.5 && l2.y >= b.floor - 0.5),
           'y=' + (l2 && l2.y) + ' band=' + b.floor + '..' + b.front);
        ok('coming forward makes it bigger',
           E.nearScale(E.depthOf(b.front)) > E.nearScale(E.depthOf(b.floor)),
           E.nearScale(E.depthOf(b.floor)).toFixed(2) + ' -> ' +
           E.nearScale(E.depthOf(b.front)).toFixed(2));
      }

      // --- the whole-house view
      LLB.show('house');
      await sleep(80);
      ok('the whole-house view opens',
         LLB.room() === 'house' &&
         document.querySelectorAll('.housecell').length === 4,
         document.querySelectorAll('.housecell').length + ' cells');
      document.querySelector('.housecell').click();
      await sleep(80);
      ok('tapping a room in the house enters it',
         LLB.room() !== 'house', LLB.room());
      LLB.show('kitchen');
      await sleep(60);

      // --- rooms
      for (const r of ['shop', 'garden', 'upstairs', 'kitchen']) {
        LLB.show(r);
        await sleep(60);
        if (LLB.room() !== r) { ok('switch to ' + r, false); break; }
      }
      ok('all four rooms load', LLB.room() === 'kitchen');

      // --- shop: case + a customer
      LLB.show('shop');
      await sleep(80);
      LLB.give('cookie');
      await sleep(40);
      const ci = LLB.state().basket.indexOf('cookie');
      const slot = document.querySelectorAll('#basketslots .slot')[ci];
      const slots = E.DATA.rooms.shop.slots;
      if (slot && slots && slots.length) {
        await dragFrom(slot, slots[2].x, slots[2].y);
        const inCase = LLB.things().find(
          s => s.item === 'cookie' &&
               Math.abs(s.x - slots[2].x) < 1 && Math.abs(s.y - slots[2].y) < 1);
        ok('a bake snaps into the display case', !!inCase,
           inCase ? (inCase.item + ' @ ' + inCase.x + ',' + inCase.y) : 'none');
      }

      ok('nothing threw', true);
    } catch (e) {
      log.push('THREW :: ' + (e && e.stack || e));
    }
    document.title = 'TESTDONE';
    document.body.setAttribute('data-test', JSON.stringify(log));
  }

  window.addEventListener('error', e => log.push('JSERROR :: ' + e.message));
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
