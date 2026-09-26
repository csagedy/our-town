/* Little Lantern Bakery -- rules
 *
 * Design constraints, all deliberate:
 *   - nothing can be lost, failed or scored
 *   - no clock pressures the player; the only timer is the oven, and running
 *     over just means the bake waits for you
 *   - every ingredient combination produces something with a name
 *   - the world is a sandbox first: anything can be dragged anywhere, and the
 *     bakery machinery is opt-in on top of that
 */
'use strict';

(function () {

  const D = E.DATA;
  /* Sprite scales are deliberately not to life scale. A croissant next to a
     128px counter would be about 14px across; the pastries are the point of
     this game, so they are drawn chunky enough to grab and read. */
  const SCALE = { ingredient: .95, dough: 1.0, bake: 1.05, topping: .9,
                  prop: 1.05, character: 2.35, animal: 1.25 };

  function scaleFor(item, kind) {
    if (kind === 'character' && D.characters[item] &&
        D.characters[item].animal) return SCALE.animal;
    return SCALE[kind] || 1;
  }
  const BASKET_MAX = 10;
  const OVEN_MS = 7000;
  let OVEN_MS_OVERRIDE = 0;

  let state = null;
  let room = 'kitchen';
  let live = {};          // id -> element, for the room on screen
  let ovenTimer = null, ovenStop = null, customerTimer = null;

  /* ------------------------------------------------------------- helpers */

  function meta() { return D.rooms[room]; }
  function station(key) { return meta().stations[key]; }
  function itemDef(k) { return D.items[k] || { name: k, kind: 'prop' }; }
  function kindOf(k) { return D.characters[k] ? 'character' : itemDef(k).kind; }

  function newSpec(item, x, y, extra) {
    const kind = kindOf(item);
    const s = {
      id: E.newId(), item: item, kind: kind, x: x, y: y,
      scale: scaleFor(item, kind)
    };
    if (kind === 'character' && D.characters[item].face) s.face = 'face-happy';
    // a topping is a tub on the shelf and a drip on a cake: two sprites, one item
    if (itemDef(item).icon) s.icon = itemDef(item).icon;
    return Object.assign(s, extra || {});
  }

  function displayName(spec) {
    if (spec.customName) return spec.customName;
    if (D.characters[spec.item]) return D.characters[spec.item].name;
    return itemDef(spec.item).name;
  }

  function near(x1, y1, x2, y2, r) {
    const dx = x1 - x2, dy = y1 - y2;
    return dx * dx + dy * dy < r * r;
  }

  /* ---------------------------------------------------------- world I/O */

  function addThing(spec, animate) {
    state.rooms[room].push(spec);
    const el = E.makeThing(spec);
    live[spec.id] = el;
    if (animate) E.pop(el);
    E.save.queue();
    return el;
  }

  function dropThing(spec, roomKey) {
    state.rooms[roomKey || room].push(spec);
    if ((roomKey || room) === room) live[spec.id] = E.makeThing(spec);
    E.save.queue();
  }

  function forget(el) {
    const id = el.__spec.id;
    const list = state.rooms[room];
    const i = list.findIndex(function (s) { return s.id === id; });
    if (i >= 0) list.splice(i, 1);
    delete live[id];
    E.save.queue();
  }

  /* ------------------------------------------------------------- basket */

  const basketSlots = document.getElementById('basketslots');

  function renderBasket() {
    basketSlots.textContent = '';
    for (let i = 0; i < BASKET_MAX; i++) {
      const item = state.basket[i];
      const el = document.createElement('div');
      el.className = 'slot' + (item ? '' : ' empty');
      if (item) {
        el.appendChild(E.icon(itemDef(item).icon || item, 56));
        el.title = itemDef(item).name;
        el.dataset.index = i;
      }
      basketSlots.appendChild(el);
    }
  }

  function toBasket(item) {
    if (state.basket.length >= BASKET_MAX) return false;
    state.basket.push(item);
    renderBasket();
    E.save.queue();
    return true;
  }

  basketSlots.addEventListener('pointerdown', function (ev) {
    const slot = ev.target.closest('.slot');
    if (!slot || slot.classList.contains('empty')) return;
    const i = +slot.dataset.index;
    const item = state.basket[i];
    if (!item) return;
    state.basket.splice(i, 1);
    renderBasket();
    const spec = newSpec(item, 0, 0);
    state.rooms[room].push(spec);
    const el = E.startDragNew(spec, ev);
    live[spec.id] = el;
    E.SFX.pick();
    E.save.queue();
  });

  // Dropping a thing onto the basket strip puts it away.
  E.registerDrop(function (el, sx, sy, cx, cy) {
    const b = document.getElementById('basket');
    const r = b.getBoundingClientRect();
    if (cx == null || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom)
      return false;
    const spec = el.__spec;
    if (spec.kind === 'character') {          // people don't go in the basket
      const c = E.clampToFloor(spec.x, spec.y);
      E.place(el, c.x, c.y);
      E.label(c.x, c.y - 120, displayName(spec) + ' would rather walk', 1600);
      return true;
    }
    if (state.basket.length >= BASKET_MAX) {
      E.label(spec.x, spec.y - 60, 'The basket is full', 1400);
      const c = E.clampToFloor(spec.x, spec.y);
      E.place(el, c.x, c.y);
      return true;
    }
    state.basket.push(spec.item);
    renderBasket();
    forget(el);
    E.removeThing(el, true);
    E.SFX.drop();
    return true;
  });

  /* ------------------------------------------------------------ stations */

  const hotspots = [];

  function addHotspot(key, onTap, tint) {
    const st = station(key);
    if (!st) return null;
    const h = document.createElement('div');
    h.className = 'hotspot';
    const r = st.r;
    h.style.width = (r * 2) + 'px'; h.style.height = (r * 1.3) + 'px';
    h.style.left = (st.x - r) + 'px';
    h.style.top = (st.y - r * 0.65) + 'px';
    h.style.zIndex = Math.round(st.y) + 1;
    if (tint) h.style.borderColor = tint;
    h.addEventListener('click', onTap);
    E.itemLayer.appendChild(h);
    hotspots.push(h);
    if (state.hints) h.classList.add('show');
    return h;
  }

  function clearHotspots() {
    hotspots.forEach(function (h) { h.remove(); });
    hotspots.length = 0;
  }

  /* --------------------------------------------------------- the sources */

  function harvest(key) {
    const pool = D.sources[key];
    if (!pool) return;
    const item = E.pick(pool);
    const st = station(key);
    if (toBasket(item)) {
      E.sparkle(st.x, st.y - 30, 7);
      E.label(st.x, st.y - 50, itemDef(item).name, 1300);
    } else {
      const b = E.band();
      const c = E.clampToBand(st.x + (Math.random() - .5) * 90,
                              b.floor + (b.front - b.floor) * 0.6);
      const spec = newSpec(item, c.x, c.y);
      addThing(spec, true);
      E.label(spec.x, spec.y - 90, 'Basket is full', 1300);
    }
    E.SFX.pop();
  }

  /* ------------------------------------------------------------ the bowl */

  function bowlTap() {
    const st = station('bowl');
    if (!state.bowl.length) {
      E.bubble(st.x, st.y - 20,
        'Drop some ingredients in the bowl, then tap it to mix.', 3200);
      return;
    }
    E.SFX.mix();
    E.sparkle(st.x, st.y - 20, 10, D.palette.paperPale);
    const ings = state.bowl.slice().sort();
    state.bowl = [];
    updateBowlBadge();

    const dough = pickDough(ings);
    const prep = station('prep');
    setTimeout(function () {
      const spec = newSpec(dough, prep.x, prep.y + 14);
      spec.ings = ings;
      addThing(spec, true);
      E.SFX.ding();
      E.label(prep.x, prep.y - 100, itemDef(dough).name, 1800);
    }, 620);
  }

  function pickDough(ings) {
    const has = function (k) { return ings.indexOf(k) >= 0; };
    for (let i = 0; i < D.doughRules.length; i++) {
      const r = D.doughRules[i];
      if (!r.need.every(has)) continue;
      if (r.any && !r.any.some(has)) continue;
      return r.out;
    }
    return 'dough-mystery';
  }

  let bowlBadge = null;
  function updateBowlBadge() {
    if (bowlBadge) { bowlBadge.remove(); bowlBadge = null; }
    if (room !== 'kitchen' || !state.bowl.length) return;
    const st = station('bowl');
    bowlBadge = document.createElement('div');
    bowlBadge.className = 'label';
    bowlBadge.style.zIndex = 8000;
    bowlBadge.textContent = state.bowl.map(function (k) {
      return itemDef(k).name;
    }).join(' + ');
    E.fxLayer.appendChild(bowlBadge);
    const w = bowlBadge.offsetWidth;
    bowlBadge.style.left = Math.max(4, st.x - w / 2) + 'px';
    bowlBadge.style.top = (st.y - 120) + 'px';
  }

  /* ------------------------------------------------------------ the oven */

  function bake(spec) {
    const st = station('oven');
    state.oven = { ings: spec.ings || [], dough: spec.item,
                   ends: Date.now() + (OVEN_MS_OVERRIDE || OVEN_MS) };
    E.save.queue();
    startOvenWatch();
  }

  function startOvenWatch() {
    if (ovenTimer) { clearTimeout(ovenTimer); ovenTimer = null; }
    if (ovenStop) { ovenStop(); ovenStop = null; }
    if (!state.oven) return;
    const left = state.oven.ends - Date.now();
    if (left <= 0) { finishBake(); return; }
    if (room === 'kitchen') {
      const st = station('oven');
      ovenStop = E.steam(st.x, st.y - 70, 3);
      E.label(st.x, st.y - 120, E.pick(D.lines.oven), 2200);
    }
    ovenTimer = setTimeout(finishBake, left);
  }

  function finishBake() {
    if (!state.oven) return;
    const o = state.oven;
    state.oven = null;
    if (ovenStop) { ovenStop(); ovenStop = null; }

    const key = (o.ings || []).slice().sort().join('+');
    let out = D.recipes[key] || D.doughDefault[o.dough] || 'mystery-bake';
    const spec = newSpec(out, 0, 0);
    if (out === 'mystery-bake') spec.customName = E.pick(D.mysteryNames);

    if (room === 'kitchen') {
      const r = station('rack');
      spec.x = r.x + (Math.random() - .5) * 90;
      spec.y = r.y + 12;
      addThing(spec, true);
      E.sparkle(spec.x, spec.y - 40, 10);
      E.SFX.ding();
      E.label(spec.x, spec.y - 100, displayName(spec), 2400);
    } else {
      // baked while she was in another room -- it is waiting when she returns
      const rk = D.rooms.kitchen.stations.rack;
      spec.x = rk.x + (Math.random() - .5) * 60;
      spec.y = rk.y + 12;
      state.rooms.kitchen.push(spec);
    }
    E.save.queue();
  }

  /* ------------------------------------------------------- display case */

  function caseSlotFor(sx, sy) {
    const slots = D.rooms.shop.slots || [];
    let best = null, bestD = 1e9;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const d = Math.abs(s.x - sx) + Math.abs(s.y - sy) * 1.6;
      if (d < bestD) { bestD = d; best = s; }
    }
    return bestD < 150 ? best : null;
  }

  /* -------------------------------------------------------- the customers */

  function spawnCustomer() {
    if (room !== 'shop') return;
    const here = state.rooms.shop.filter(function (s) { return s.customer; });
    if (here.length >= 3) return;
    const who = E.pick(['iris', 'max', 'nell', 'theo', 'juno', 'gran', 'dad',
                        'poppy', 'cat', 'dog', 'bird']);
    const door = station('door');
    const wants = Object.keys(D.items).filter(function (k) {
      return D.items[k].kind === 'bake' && k !== 'mystery-bake';
    });
    const spec = newSpec(who, door.x, door.y);
    spec.customer = true;
    spec.want = E.pick(wants);
    const el = addThing(spec, true);

    // walk to a free table, then say hello
    const spots = ['table2', 'table3', 'counter', 'table1'];
    const t = station(E.pick(spots));
    const b = E.band();
    const tx = E.clamp(t.x + (Math.random() - .5) * 110, b.x0, b.x1);
    const ty = b.floor + (b.front - b.floor) * (0.4 + Math.random() * 0.55);
    E.glide(el, tx, ty, 2200).then(function () {
      el.classList.add('bob');
      say(el, E.pick(D.lines.greetings), 3000);
      setTimeout(function () {
        if (!el.isConnected) return;
        wantBubble(el);
      }, 3400);
    });
  }

  function wantBubble(el) {
    const s = el.__spec;
    if (!s.want || !el.isConnected) return;
    const line = E.pick(D.lines.wants).replace('{}',
      itemDef(s.want).name.toLowerCase());
    E.bubble(s.x, s.y - 88 * (s.scale || 1) * E.nearScale(E.depthOf(s.y)),
      '<span>' + line + '</span><span class="wantitem">' +
      '<svg viewBox="0 0 100 100"><use href="#s-' + s.want + '"/></svg></span>',
      5200, 'want');
  }

  function serve(el, foodEl) {
    const s = el.__spec;
    E.hearts(s.x, s.y - 70, 6);
    E.SFX.happy();
    say(el, E.pick(D.lines.thanks), 2800);
    if (s.face) { s.face = 'face-love'; E.rebuildLayers(el); }
    forget(foodEl);
    E.removeThing(foodEl, true);
    s.served = true;
    E.save.queue();
    setTimeout(function () { leave(el); }, 5000);
  }

  function leave(el) {
    if (!el.isConnected) return;
    const door = station('door');
    el.classList.remove('bob');
    E.glide(el, door.x, door.y + 10, 2200).then(function () {
      forget(el);
      E.removeThing(el, true);
    });
  }

  function say(el, text, ms) {
    const s = el.__spec;
    const h = (s.kind === 'character' ? 88 : 80) * (s.scale || 1) *
      E.nearScale(E.depthOf(s.y));
    E.bubble(s.x, s.y - h, text, ms || 2600);
  }

  /* ------------------------------------------------------------- dropping */

  E.registerDrop(function (el, sx, sy) {
    const spec = el.__spec;

    // 1. a topping onto a baked thing
    if (spec.kind === 'topping') {
      const target = nearestThing(sx, sy, 60, function (o) {
        return o.__spec.kind === 'bake' && o !== el;
      });
      if (target) {
        const t = target.__spec;
        t.layers = (t.layers || []);
        if (t.layers.indexOf(spec.item) < 0) t.layers.push(spec.item);
        E.rebuildLayers(target);
        E.sparkle(t.x, t.y - 50, 8, D.palette.pink);
        E.SFX.pop();
        forget(el); E.removeThing(el, true);
        return true;
      }
    }

    // 2. food to a waiting customer
    if (spec.kind === 'bake') {
      const cust = nearestThing(sx, sy, 90, function (o) {
        return o.__spec.customer && !o.__spec.served;
      });
      if (cust) { serve(cust, el); return true; }
    }

    // 3. into the mixing bowl
    if (room === 'kitchen' && spec.kind === 'ingredient') {
      const st = station('bowl');
      if (near(sx, sy, st.x, st.y, st.r)) {
        if (state.bowl.length >= 4) {
          E.label(st.x, st.y - 100, 'The bowl is full -- tap it to mix', 1800);
        } else {
          state.bowl.push(spec.item);
          updateBowlBadge();
          E.sparkle(st.x, st.y - 16, 5, D.palette.paperPale);
          E.SFX.drop();
          forget(el); E.removeThing(el, true);
          E.save.queue();
          return true;
        }
      }
    }

    // 4. dough into the oven
    if (room === 'kitchen' && spec.kind === 'dough') {
      const st = station('oven');
      if (near(sx, sy, st.x, st.y, st.r)) {
        if (state.oven) {
          E.label(st.x, st.y - 110, 'Something is already baking', 1800);
        } else {
          bake(spec);
          E.sparkle(st.x, st.y, 8, D.palette.orange);
          E.SFX.drop();
          forget(el); E.removeThing(el, true);
          return true;
        }
      }
    }

    // 5. a bake into the display case
    if (room === 'shop' && (spec.kind === 'bake' || spec.kind === 'prop')) {
      const slot = caseSlotFor(sx, sy);
      if (slot) {
        spec.z = 0;
        E.place(el, slot.x, slot.y);
        E.SFX.drop();
        E.save.queue();
        return true;
      }
    }

    return false;
  });

  /** Put a dropped thing down: on a counter if it landed on one, otherwise
   *  in the floor band. Registered last, so every rule above gets first
   *  refusal.
   *
   *  A surface is a line segment, not a box -- "is it on the counter?" is one
   *  x-range test and one y compare. That is the quiet win of drawing rooms
   *  head-on instead of isometrically. */
  function settle(el) {
    const spec = el.__spec;
    let best = null, bestD = 78;
    (meta().surfaces || []).forEach(function (sf) {
      if (spec.x < sf.x0 - 12 || spec.x > sf.x1 + 12) return;
      const d = Math.abs(spec.y - sf.y);
      if (d < bestD) { bestD = d; best = sf; }
    });
    if (best && spec.kind !== 'character') {
      E.place(el, E.clamp(spec.x, best.x0 + 16, best.x1 - 16), best.y);
    } else {
      const c = E.clampToBand(spec.x, spec.y);
      E.place(el, c.x, c.y);
    }
    E.SFX.drop();
    E.save.queue();
  }

  E.registerDrop(function (el) { settle(el); return true; });

  function nearestThing(x, y, r, test) {
    let best = null, bestD = r * r;
    for (const id in live) {
      const el = live[id];
      if (!test(el)) continue;
      const s = el.__spec;
      const dx = s.x - x, dy = (s.y - y) * 1.3;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = el; }
    }
    return best;
  }

  /* --------------------------------------------------------------- taps */

  E.setTapHandler(function (el) {
    const s = el.__spec;
    if (s.kind === 'character') {
      const ch = D.characters[s.item];
      if (s.face) {
        const i = D.faces.indexOf(s.face);
        s.face = D.faces[(i + 1) % D.faces.length];
        E.rebuildLayers(el);
      }
      const lines = (ch.lines && ch.lines.length) ? ch.lines : D.lines.idle;
      say(el, E.pick(lines), 2800);
      if (s.customer && !s.served) setTimeout(function () { wantBubble(el); }, 2900);
      E.SFX.pop();
      E.save.queue();
      return;
    }
    E.label(s.x, s.y - 80 * (s.scale || 1) * E.nearScale(E.depthOf(s.y)),
            displayName(s), 1600);
    E.pop(el);
    E.SFX.pop();
  });

  /* -------------------------------------------------------- room switching */

  function showRoom(key) {
    clearHotspots();
    if (bowlBadge) { bowlBadge.remove(); bowlBadge = null; }
    E.itemLayer.textContent = '';
    E.fxLayer.textContent = '';
    live = {};
    clearTimeout(customerTimer);

    if (key === 'house') {
      room = 'house';
      state.room = 'house';
      document.getElementById('roomart').src = D.house.art;
      D.house.cells.forEach(function (c) {
        // draw the real contents of each room, scaled into its cell. The clip
        // matters: things standing at the front of a floor band would
        // otherwise hang out of the bottom of their room.
        const clip = document.createElement('div');
        clip.className = 'housecellclip';
        clip.style.left = c.x + 'px'; clip.style.top = c.y + 'px';
        clip.style.width = c.w + 'px'; clip.style.height = c.h + 'px';
        (state.rooms[c.room] || []).forEach(function (spec) {
          clip.appendChild(ghost(spec, c));
        });
        E.itemLayer.appendChild(clip);
        hotspots.push(clip);
        const b = document.createElement('button');
        b.className = 'housecell';
        b.style.left = c.x + 'px'; b.style.top = c.y + 'px';
        b.style.width = c.w + 'px'; b.style.height = c.h + 'px';
        b.setAttribute('aria-label', D.rooms[c.room].name);
        b.addEventListener('click', function () { showRoom(c.room); });
        E.itemLayer.appendChild(b);
        hotspots.push(b);
      });
      markTabs(key);
      E.save.queue();
      return;
    }

    room = key;
    state.room = key;
    const m = D.rooms[key];
    E.setBand(m.band);
    document.getElementById('roomart').src = m.art;

    (state.rooms[key] || []).forEach(function (spec) {
      spec.scale = spec.scale || scaleFor(spec.item, spec.kind);
      live[spec.id] = E.makeThing(spec);
    });

    ['tree', 'bushes', 'patch', 'coop', 'pantry'].forEach(function (k) {
      if (m.stations[k]) {
        addHotspot(k, function () { harvest(k); }, D.palette.green);
      }
    });
    if (key === 'kitchen') {
      addHotspot('bowl', bowlTap, D.palette.coral);
      updateBowlBadge();
      startOvenWatch();
    }

    markTabs(key);
    if (key === 'shop') scheduleCustomer(6000);
    E.save.queue();
  }

  /** A non-interactive copy of a thing, transformed into a house-view cell.
   *  Shares the sprite sheet, so it costs one <use> and no new art. */
  function ghost(spec, cell) {
    const rm = D.rooms[cell.room];
    const b = rm.band;
    const t = spec.y <= b.floor ? 0 :
      Math.min(1, (spec.y - b.floor) / (b.front - b.floor));
    const k = (spec.scale || scaleFor(spec.item, spec.kind)) *
      (1 + 0.16 * t) * cell.k;
    const x = cell.ox + cell.k * (spec.x - cell.rx);
    const y = cell.oy + cell.k * (spec.y - cell.ry);
    const anchor = spec.kind === 'character' ? 93 : 87;

    const el = document.createElement('div');
    el.className = 'thing ghost';
    el.appendChild(E.useSvg(spec.icon || spec.item));
    if (spec.face) el.appendChild(E.useSvg(spec.face));
    (spec.layers || []).forEach(function (l) {
      el.appendChild(E.useSvg(l));
    });
    if (spec.face || (spec.layers && spec.layers.length)) {
      el.classList.add('stacked');
    }
    // positioned relative to the clip box, not the stage
    el.style.transform = 'translate3d(' + (x - cell.x - 50 * k).toFixed(1) +
      'px,' + (y - cell.y - anchor * k).toFixed(1) + 'px,0) scale(' +
      ((spec.flip ? -k : k)).toFixed(3) + ',' + k.toFixed(3) + ')';
    el.style.zIndex = Math.round(y);
    return el;
  }

  function markTabs(key) {
    document.querySelectorAll('.roomtab').forEach(function (b) {
      b.setAttribute('aria-current', b.dataset.room === key ? 'true' : 'false');
    });
  }

  function scheduleCustomer(ms) {
    clearTimeout(customerTimer);
    customerTimer = setTimeout(function () {
      spawnCustomer();
      scheduleCustomer(18000 + Math.random() * 24000);
    }, ms);
  }

  /* ------------------------------------------------------------------ UI */

  function buildTabs() {
    const nav = document.getElementById('rooms');
    nav.textContent = '';
    ['house'].concat(D.roomOrder).forEach(function (k) {
      const b = document.createElement('button');
      b.className = 'roomtab' + (k === 'house' ? ' house' : '');
      b.dataset.room = k;
      b.textContent = k === 'house' ? 'The Whole House' : D.rooms[k].name;
      b.addEventListener('click', function () { showRoom(k); });
      nav.appendChild(b);
    });
  }

  function openSheet(id) {
    document.getElementById('scrim').hidden = false;
    document.getElementById(id).hidden = false;
  }
  function closeSheets() {
    document.getElementById('scrim').hidden = true;
    document.getElementById('menu').hidden = true;
    document.getElementById('namesheet').hidden = true;
  }

  function wireUI() {
    document.getElementById('menubtn').addEventListener('click', function () {
      document.getElementById('optsound').checked = !!state.sound;
      document.getElementById('opthints').checked = !!state.hints;
      openSheet('menu');
    });
    document.getElementById('closemenu').addEventListener('click', closeSheets);
    document.getElementById('scrim').addEventListener('click', closeSheets);

    document.getElementById('optsound').addEventListener('change', function (e) {
      state.sound = e.target.checked;
      E.setSound(state.sound);
      if (state.sound) E.SFX.ding();
      E.save.queue();
    });
    document.getElementById('opthints').addEventListener('change', function (e) {
      state.hints = e.target.checked;
      hotspots.forEach(function (h) { h.classList.toggle('show', state.hints); });
      E.save.queue();
    });
    document.getElementById('resetbtn').addEventListener('click', function () {
      E.save.clear();
      location.reload();
    });

    document.getElementById('namebtn').addEventListener('click', function () {
      document.getElementById('nameinput').value = state.name;
      openSheet('namesheet');
      setTimeout(function () { document.getElementById('nameinput').select(); }, 60);
    });
    function commitName() {
      const v = document.getElementById('nameinput').value.trim();
      state.name = v || 'Little Lantern Bakery';
      document.getElementById('shopname').textContent = state.name;
      closeSheets();
      E.save.queue();
    }
    document.getElementById('namedone').addEventListener('click', commitName);
    document.getElementById('nameinput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commitName();
    });
  }

  /* ----------------------------------------------------------- new bakery */

  function freshState() {
    const s = {
      name: 'Little Lantern Bakery',
      room: 'kitchen',
      basket: ['flour', 'sugar', 'butter', 'egg'],
      bowl: [], oven: null,
      sound: false, hints: true,
      rooms: { kitchen: [], shop: [], garden: [], upstairs: [] }
    };

    /* Positions are derived from each room's own metadata rather than
       hardcoded, so moving a counter in tools/rooms_elev.py cannot leave the
       opening scene floating in mid-air.
         u  = fraction across the floor band
         t  = depth into the band, 0 at the wall and 1 at the near edge
         on = index into that room's surfaces, to stand on a counter instead */
    function put(roomKey, item, u, t, extra, on) {
      const m = D.rooms[roomKey];
      const kind = D.characters[item] ? 'character' :
        (D.items[item] ? D.items[item].kind : 'prop');
      let x, y;
      if (on != null && m.surfaces[on]) {
        const sf = m.surfaces[on];
        x = sf.x0 + (sf.x1 - sf.x0) * u;
        y = sf.y;
      } else {
        x = m.band.x0 + (m.band.x1 - m.band.x0) * u;
        y = m.band.floor + (m.band.front - m.band.floor) * t;
      }
      const spec = { id: E.newId(), item: item, kind: kind,
                     x: Math.round(x), y: Math.round(y),
                     scale: scaleFor(item, kind) };
      if (kind === 'character' && D.characters[item].face) {
        spec.face = 'face-happy';
      }
      if (D.items[item] && D.items[item].icon) spec.icon = D.items[item].icon;
      s.rooms[roomKey].push(Object.assign(spec, extra || {}));
    }

    put('kitchen', 'flour', .22, 0, null, 0);      // on the left counter
    put('kitchen', 'egg', .58, 0, null, 0);
    put('kitchen', 'poppy', .25, .62);
    put('kitchen', 'top-pink', .35, .85);
    put('kitchen', 'top-sprinkles', .40, .78);
    put('kitchen', 'top-choc', .45, .90);
    put('kitchen', 'cat', .55, .95);
    put('kitchen', 'gran', .80, .55, { flip: true });

    put('shop', 'sign', .06, .86);

    // a few things already in the case, so the shop reads as a going concern
    ['cookie', 'croissant', 'cupcake'].forEach(function (b, i) {
      const sl = D.rooms.shop.slots[i];
      s.rooms.shop.push({ id: E.newId(), item: b, kind: 'bake',
                          x: sl.x, y: sl.y, scale: SCALE.bake });
    });
    put('shop', 'cake-stand', .45, 0, null, 0);    // on the till counter
    put('shop', 'juno', .62, .52);
    put('shop', 'iris', .85, .84, { flip: true });
    put('shop', 'dog', .95, .95, { flip: true });

    put('garden', 'bird', .18, .80);
    put('garden', 'iris', .60, .66);
    put('garden', 'chicken', .70, .92);

    put('upstairs', 'teddy', .35, 0, null, 1);     // on the bed
    put('upstairs', 'lantern', .5, 0, null, 0);    // on the bedside table
    put('upstairs', 'books', .36, .80);
    put('upstairs', 'theo', .50, .66);

    return s;
  }

  /* --------------------------------------------------------------- start */

  function start() {
    state = E.save.load();
    if (!state || !state.rooms) state = freshState();
    // tolerate a save written by an older build
    D.roomOrder.forEach(function (k) {
      if (!Array.isArray(state.rooms[k])) state.rooms[k] = [];
    });
    if (!Array.isArray(state.basket)) state.basket = [];
    if (!Array.isArray(state.bowl)) state.bowl = [];
    D.roomOrder.forEach(function (k) {
      state.rooms[k].forEach(function (s) {
        if (!s.icon && D.items[s.item] && D.items[s.item].icon) {
          s.icon = D.items[s.item].icon;
        }
      });
    });

    E.save.getState = function () { return state; };

    document.getElementById('shopname').textContent = state.name;
    E.setSound(state.sound);
    buildTabs();
    wireUI();
    renderBasket();
    E.fit();
    showRoom((state.room === 'house' || D.rooms[state.room])
             ? state.room : 'kitchen');

    // an audio context can only start from a real gesture
    window.addEventListener('pointerdown', function once() {
      if (state.sound) E.setSound(true);
      window.removeEventListener('pointerdown', once);
    });

    window.addEventListener('beforeunload', E.save.now);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) E.save.now();
      else startOvenWatch();
    });
  }

  /* A small inspection hook. Not used by the game; it exists so the build's
     self-test can drive a real session, and so a grown-up can poke at a stuck
     bakery from the console. */
  window.LLB = {
    state: function () { return state; },
    room: function () { return room; },
    live: function () { return live; },
    things: function () { return Object.keys(live).map(function (k) { return live[k].__spec; }); },
    show: showRoom,
    ovenMs: function (ms) { OVEN_MS_OVERRIDE = ms; },
    give: function (item) { toBasket(item); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
