// Cafe customers (P2a.5, docs/design.md 3.1 #13-15, #17-18): the door bell,
// walk-ins, picture orders, serving, eating, coins, the register and the tip
// jar. The rules (who, where, what, match) are pure in src/core/customers.js;
// this module is the cafe's side.
//
//   DOOR       tap the little bell over the front door (or the closed door
//              itself): ding-dong, the door swings open and a CUSTOMER walks
//              in: a new face (the Character Maker's random look) or one of
//              the regulars, walking (walk-a / walk-b steps while it glides)
//              to a free table and sitting down. Only a kid's tap brings
//              anyone in (never a timer), at most 4 walk-ins at once; a ring
//              when the cafe is full just gets waves from everyone inside.
//   ORDER      seated, a thought bubble pops up with a PICTURE of what they
//              would like (an easy dish, or any recipe the kids have found,
//              or "anything!": a sparkly heart). Zoe's text layer adds the
//              dish name under the picture.
//   SERVE      put a dish (or a full cup) on their table in front of them, or
//              drop it on them. The dish they wanted: a big cheer and hearts.
//              Anything else (a Mystery Dish too): a funny face, then a
//              laugh. Either way they eat it bite by bite, leave the dirty
//              plate and COINS on the table, wave, and walk out of the door
//              (unless a kid carries them off somewhere: then they stay and
//              chat). Any character can be dragged anywhere at any time.
//   KID TURN   the bell on the order counter: every character sitting at a
//              dining seat with no order gets one (the kids' own characters
//              too), so the kids can take turns being customer and chef.
//   MONEY      coins are play props. Dropped on the register: the drawer
//              springs open, cha-ching, `inc` of the register's coin count
//              (fixtures props.coins), and the open drawer shows the pile.
//              The register's keys boop (a little pentatonic instrument); a
//              tap below them opens or shuts the drawer. The tip jar fills
//              (empty -> coins -> full; behavior `tipjar`) and a tap shakes it
//              like a tambourine while the customers dance.
//
// Two iPads: every lasting change is a store op, and every roll (the look,
// the seat, the order) is made before dispatch and carried in the op. What
// happens by itself after a kid's action (sitting down at the end of the
// walk, the bites, the coins, walking out) is written by the solo iPad or
// the HOST only, from timers that run only while a customer is walking,
// eating or leaving: waiting customers cost nothing (no loop, no timer).
//
//   const cust = createCustomers({ store, catalog, behaviors, m, room, chars, fx, sfx, pieceApi, isGuest });
//   hooks = cust.wrap(hooks);   // outermost
//   cust.bind(view);            // after createRoomView (spawns the tip jar if missing)
//   cust.onPieceTap(pid, info)  // the door, its bell, the register: true if handled
//   cust.afterPieceTap(pid)     // the counter bell: orders for the seated kids
//   cust.destroy()

import { getEntity, inRoom, childrenOf } from '../engine/world.js';
import { settle, ON_EPS, EDGE_TOL } from '../engine/surfaces.js';
import * as tween from '../engine/tween.js';
import { castProps, anchorOffset, wearSlotName, HANDS, CHAR_KIND } from '../engine/char-model.js';
import { randomLook } from '../engine/char-maker.js';
import { recipeTable, discovered, exampleItems } from '../core/recipes.js';
import { smoothieOf } from '../core/food.js';
import { paintIcon } from '../ui/recipe-book.js';
import {
  WALKIN, MAX_WALKINS, REGULARS, REGULAR_CHANCE, COFFEE, DRINK_CUPS, DISHES, COINS_MATCH, COINS_OTHER, COIN_KIND,
  TIPJAR_KIND, BITES_MAX, DINING_SEAT, rollOrder, servable, matchesOrder, pickSeat, walkIns, tableSpot, coinSpots,
  pileCount, walkMs, phaseOf,
} from '../core/customers.js';

const REGISTER = 'register';
const r1 = (v) => Math.round(v * 10) / 10;
// The register art (126 x 122 units): keys in the upper half, the drawer below.
const KEYS_BOTTOM = 0.62;       // a tap above this fraction of the piece is on the keys
const DRAWER = [0.1, 0.66, 0.9, 0.9];   // the open drawer's tray (fractions of the piece box)
const BUBBLE_SCALE = 1.25;      // big enough to read from across the room (and for small fingers to point at)
const KEY_PITCH = [1, 1.122, 1.26, 1.498, 1.682, 2];   // pentatonic steps for the six keys

const CSS = `
.cust-layer{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none}
.cust-bubble{position:absolute;left:0;top:0;width:118px;height:0;pointer-events:none}
.cust-bubble .cb-pop{position:absolute;left:0;bottom:0;width:118px;height:112px;transform-origin:14px 108px}
.cust-bubble .cb-cloud{position:absolute;left:10px;top:0;width:106px;height:88px;border-radius:44px;background:#FFFDF8;border:4px solid #E4CDB5}
.cust-bubble .cb-dot{position:absolute;border-radius:50%;background:#FFFDF8;border:3px solid #E4CDB5}
.cust-bubble .cb-d1{left:10px;top:86px;width:18px;height:16px}
.cust-bubble .cb-d2{left:0;top:103px;width:10px;height:9px}
.cust-bubble .cb-pic{position:absolute;left:22px;top:10px;width:84px;height:72px;overflow:visible}
.cust-bubble .cb-pic .rb-spr{position:absolute;left:50%;top:50%;transform-origin:50% 50%}
.cust-bubble .cb-pic .rb-spr img{position:absolute}
.cust-bubble .cb-pic svg{position:absolute;left:8px;top:2px;width:68px;height:68px;overflow:visible}
.cust-bubble .cb-name{display:none;position:absolute;left:-14px;top:112px;width:150px;text-align:center;font:600 17px/1.15 system-ui,sans-serif;color:#5A3E2B;background:rgba(255,253,248,.92);border-radius:9px;padding:2px 4px}
body.text-layer .cust-bubble .cb-name{display:block}
.cust-bubble.cb-left .cb-pop{transform-origin:104px 108px}
.cust-bubble.cb-left .cb-cloud{left:2px}
.cust-bubble.cb-left .cb-pic{left:14px}
.cust-bubble.cb-left .cb-d1{left:90px}
.cust-bubble.cb-left .cb-d2{left:108px}
.reg-pile{position:absolute;pointer-events:none;display:none}
.reg-pile.open{display:block}
.reg-pile img{position:absolute;width:22px;height:22px}
.reg-pile .rp-count{display:none;position:absolute;left:50%;top:-30px;transform:translateX(-50%);min-width:30px;text-align:center;font:700 17px/1.2 system-ui,sans-serif;color:#5A3E2B;background:#FFF3C4;border-radius:10px;padding:1px 6px}
body.text-layer .reg-pile .rp-count{display:block}
`;
const HEART_SVG = '<svg viewBox="-12 -12 44 44"><path d="M10 18 C4 13 0 10 0 5.6 C0 2.4 2.4 0 5.4 0 C7.4 0 9 1.2 10 3 C11 1.2 12.6 0 14.6 0 C17.6 0 20 2.4 20 5.6 C20 10 16 13 10 18 Z" fill="#FF7FA8" stroke="#E0527F" stroke-width="1.4"/>'
  + '<path d="M-6 -2 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#FFD43B"/>'
  + '<path d="M26 -6 l1.2 2.6 2.6 1.2 -2.6 1.2 -1.2 2.6 -1.2 -2.6 -2.6 -1.2 2.6 -1.2z" fill="#FFD43B"/>'
  + '<path d="M24 20 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z" fill="#8FD3FF"/></svg>';

function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('cust-css')) return;
  const st = document.createElement('style');
  st.id = 'cust-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

export function createCustomers({ store, catalog, behaviors, m, room, chars = null, fx = null, sfx = null, pieceApi, isGuest = () => false, random = () => Math.random() }) {
  const roomId = room.id;
  const rig = chars ? chars.rig : null;
  const seats = chars ? chars.seats : [];
  const fd = (m.pieces || {})['front-door'];
  const DOOR = { x: r1(fd ? fd.x + fd.w / 2 : m.width - 260), y: r1(m.floor.y0 + 14) };
  const reg = (m.pieces || {})[REGISTER];
  const tune = { walkMs: null, firstBiteMs: 1300, biteMs: 850, thanksMs: 1700, doorMs: 1300 };
  const stats = { rings: 0, full: 0, arrivals: 0, sat: 0, orders: 0, serves: 0, matches: 0, others: 0, bites: 0, paid: 0, coins: 0, leaves: 0, gone: 0, deposits: 0, keys: 0, drawer: 0, dances: 0, stays: 0 };
  const timers = new Map();        // `${id}:${phase}` -> timeout (host brain)
  const local = new Set();         // local one-shot timeouts (door close, faces)
  const last = new Map();          // char id -> {phase, sig, x, y}
  const bubbles = new Map();       // char id -> {el, key}
  const pending = new Set();       // char ids whose bubble waits for their first draw
  const biteLoc = new Map();       // customer id -> {n, loc} while eating (host)
  let known = null;                // char ids present when bound (a reload: no walk-in animation)
  let view = null;
  let base = null;
  let layer = null;
  let pile = null;
  let unsubscribe = null;
  let destroyed = false;

  const S = () => store.state;
  const ent = (id) => getEntity(S(), id);
  const play = (name, o) => { if (view) view.play(name, o); else if (sfx) sfx.play(name, o); };
  const soon = (ms, fn) => { const t = setTimeout(() => { local.delete(t); if (!destroyed) fn(); }, ms); local.add(t); return t; };
  const set = (id, key, value) => store.dispatch('set', { id, path: 'props.' + key, value });
  const charsHere = () => inRoom(S(), roomId).filter((e) => e.kind === CHAR_KIND);
  const tagsOf = (kind) => (catalog ? catalog.tagsOf(kind) : []);
  const isFood = (kind) => { const t = tagsOf(kind); return t.includes('food') || t.includes('drink'); };
  const canServe = (e) => servable(e, isFood, childrenOf(S(), e.id));
  const seatOf = (id) => seats.find((s) => s.id === id) || null;
  const surfaces = () => room.def.surfaces || [];
  const dur = (a, b) => (tune.walkMs != null ? tune.walkMs : walkMs(Math.hypot(b[0] - a[0], b[1] - a[1])));

  // ---- looks, spots ----
  /** A new face (the Character Maker's shuffle) or a regular not in town yet: {props, pieces}. */
  function rollLook() {
    const present = new Set();
    for (const id of Object.keys(S().entities)) { const e = ent(id); if (e && e.kind === CHAR_KIND && e.props.cast) present.add(e.props.cast); }
    const free = REGULARS.filter((c) => !present.has(c) && rig.characters.some((q) => q.id === c));
    if (free.length && random() < REGULAR_CHANCE) return castProps(rig, free[Math.floor(random() * free.length) % free.length]);
    if (rig.maker) return randomLook(rig, random);
    return castProps(rig, rig.characters[Math.floor(random() * rig.characters.length) % rig.characters.length].id);
  }

  /** Where a character stands (feet) in front of a seat, on the floor. */
  function standSpot(seat, body) {
    let off = [0, -60];
    try { if (rig) off = anchorOffset(rig, body || 'adult', rig.poses.stand, 'seat'); } catch { /* keep the guess */ }
    const y = Math.max(m.floor.y0 + 12, Math.min(m.floor.y1 - 8, seat.y - off[1]));
    return { x: r1(seat.x - off[0]), y: r1(y) };
  }

  // ---- the door ----
  function ring() {
    stats.rings++;
    pieceApi.press('door-bell', 'ring');
    play('doorbell');
    const opened = pieceApi.state('front-door') !== 'open';
    if (opened) pieceApi.set('front-door', 'open');
    const bell = pieceApi.el('door-bell');
    if (bell && bell.firstChild) tween.squish(bell.firstChild, { amount: 0.8 });
    const body = pieceApi.el('front-door');
    if (body && body.firstChild) tween.squish(body.firstChild, { amount: 0.4, duration: 300 });
    const id = rig ? walkIn() : null;
    if (!id) {
      // Full (or nowhere to sit): everyone inside waves hello; the door swings shut.
      stats.full++;
      for (const c of walkIns(charsHere())) waveAt(c.id);
      if (opened) soon(tune.doorMs, () => { if (!busyDoor()) pieceApi.set('front-door', 'closed'); });
    }
    return id;
  }

  /** Spawn a walk-in at a free table (store ops; every roll is in them). Returns its id, or null. */
  function walkIn() {
    const here = charsHere();
    if (walkIns(here).length >= MAX_WALKINS) return null;
    const seat = pickSeat(seats, here, random);
    if (!seat) return null;
    const look = rollLook();
    const order = rollOrder(random, { found: [...discovered(S())], table: recipeTable() });
    const id = store.newId();
    const spot = standSpot(seat, look.props.body);
    const own = look.pieces.map(() => store.newId());
    const props = Object.assign({}, look.props, {
      pose: 'stand', seat: null, expr: 'happy', cust: WALKIN, order,
      walk: { seat: seat.id, from: [DOOR.x, DOOR.y] }, own,
    });
    if (!store.dispatch('spawn', { id, kind: CHAR_KIND, room: roomId, x: spot.x, y: spot.y, z: 0, props })) return null;
    look.pieces.forEach((p, i) => {
      store.dispatch('spawn', { id: own[i], kind: p.kind, parent: id, slot: wearSlotName(p.slot), props: p.colors && Object.keys(p.colors).length ? { colors: p.colors } : {} });
    });
    return id;
  }

  const busyDoor = () => charsHere().some((c) => c.props.walk || c.props.leave);

  // ---- the counter bell: the kids' turn to be customers ----
  function kidOrders() {
    const got = [];
    for (const c of charsHere()) {
      if (!c.props.seat || !DINING_SEAT.test(c.props.seat) || phaseOf(c.props) !== 'idle') continue;
      const order = rollOrder(random, { found: [...discovered(S())], table: recipeTable() });
      if (store.dispatch('set', { id: c.id, path: 'props.order', value: order })) got.push(c.id);
    }
    return got;
  }

  // ---- serving ----
  /** Serve `item` to customer `c`. how: 'table' (it is on their table already) or 'drop' (dropped on them). */
  function serve(c, item, how) {
    const order = c.props.order;
    const match = matchesOrder(order, item);
    if (how === 'drop') {
      const spot = tableSpot(seatOf(c.props.seat), surfaces());
      if (spot) {
        store.dispatch('move', { id: item.id, room: roomId, x: spot.x, y: spot.y, z: 0 });
      } else {
        const kids = childrenOf(S(), c.id);
        const hand = !kids.some((k) => k.slot === HANDS.R) ? HANDS.R : !kids.some((k) => k.slot === HANDS.L) ? HANDS.L : null;
        if (hand) store.dispatch('attach', { id: item.id, parent: c.id, slot: hand });
        else {
          const r = settle(room.def, { x: c.x + 60, y: Math.min(m.floor.y1 - 8, c.y + 30), halfW: 30 });
          store.dispatch('move', { id: item.id, room: roomId, x: r1(r.x), y: r1(r.y), z: 0 });
        }
      }
    }
    // eating first: the order stays drawn until then, so the bubble pops away on every iPad.
    set(c.id, 'eating', { id: item.id, match });
    set(c.id, 'order', null);
    stats.serves++;
    if (match) stats.matches++; else stats.others++;
    return match;
  }

  /** The waiting customer whose table spot a thing just landed at, or null. */
  function customerAtTable(item) {
    let best = null;
    let bd = 130;
    for (const c of charsHere()) {
      if (phaseOf(c.props) !== 'wait') continue;
      const spot = tableSpot(seatOf(c.props.seat), surfaces());
      if (!spot || Math.abs(item.y - spot.y) > ON_EPS) continue;
      const s = surfaces().find((q) => q.id === spot.surface);
      if (!s || item.x < s.x0 - EDGE_TOL || item.x > s.x1 + EDGE_TOL) continue;
      const d = Math.abs(item.x - spot.x);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ---- the register ----
  const regBox = () => (reg ? { x0: reg.x, y0: reg.y, x1: reg.x + reg.w, y1: reg.y + reg.h } : null);
  function overRegister(pts) {
    const b = regBox();
    if (!b) return false;
    return pts.some((p) => p && p.x >= b.x0 - 16 && p.x <= b.x1 + 16 && p.y >= b.y0 - 16 && p.y <= b.y1 + 16);
  }
  function deposit(coin) {
    const f = pieceApi.fixtures();
    if (!f) return false;
    store.dispatch('remove', { id: coin.id, hard: true });
    store.dispatch('inc', { id: f.id, path: 'props.coins', by: 1 });
    if (pieceApi.state(REGISTER) !== 'open') pieceApi.set(REGISTER, 'open');
    stats.deposits++;
    play('chaching');
    const body = pieceApi.el(REGISTER);
    if (body && body.firstChild) tween.squish(body.firstChild, { amount: 0.7, duration: 320 });
    if (fx && reg) fx.burst('sparkle', reg.x + reg.w / 2, reg.y + reg.h * 0.75, { count: 7, spread: 90 });
    renderPile(true);
    return true;
  }
  function tapKey(info) {
    const keys = (m.slots || []).filter((s) => s.kind === 'key' && s.at);
    let k = keys[0];
    let bd = Infinity;
    for (const q of keys) { const d = Math.hypot(q.at[0] - info.x, q.at[1] - info.y); if (d < bd) { bd = d; k = q; } }
    const note = k ? k.note | 0 : 0;
    stats.keys++;
    play('beep', { pitch: KEY_PITCH[note % KEY_PITCH.length], vary: 0 });
    const body = pieceApi.el(REGISTER);
    if (body && body.firstChild) tween.squish(body.firstChild, { amount: 0.25, duration: 200 });
    if (fx && k) fx.burst('sparkle', k.at[0], k.at[1] - 10, { count: 2, spread: 24, scale: 0.6 });
  }
  const registerCoins = () => { const f = pieceApi.fixtures(); return f ? f.props.coins | 0 : 0; };
  let pileShown = -1;
  function renderPile(force = false) {
    if (!pile) return;
    const open = pieceApi.state(REGISTER) === 'open';
    pile.classList.toggle('open', open);
    const n = pileCount(registerCoins());
    if (!force && n === pileShown) return;
    pileShown = n;
    const w = reg.w * (DRAWER[2] - DRAWER[0]);
    const h = reg.h * (DRAWER[3] - DRAWER[1]);
    let html = '';
    for (let i = 0; i < n; i++) {
      // A heap: a row along the tray, then coins piled on top, toward the middle.
      const row = i < 6 ? 0 : i < 11 ? 1 : 2;
      const j = row === 0 ? i : row === 1 ? i - 6 : i - 11;
      const across = row === 0 ? 6 : row === 1 ? 5 : 3;
      const x = (w - 22) * ((j + 0.5) / across) + (row ? (6 - across) * 4 : 0) - 11 + (row ? 11 : 0) * 0.5;
      const y = h - 24 - row * 9 - ((i * 7) % 5);
      html += `<img src="assets/sprites/props/coin.webp" alt="" draggable="false" style="left:${r1(x)}px;top:${r1(y)}px">`;
    }
    pile.innerHTML = html + `<div class="rp-count">${registerCoins()}</div>`;
  }

  // ---- bubbles (every iPad) ----
  function orderSprite(order) {
    const spriteOf = (e) => (base && base.spriteOf ? base.spriteOf(e) : null) || catalog.sprite(e.kind);
    if (!order || order.any) return null;
    if (order.dish === COFFEE) return spriteOf({ id: 'order:coffee', kind: 'cafe-cup', props: { fill: 'coffee' }, parent: null });
    const r = recipeTable() && recipeTable().recipes.find((q) => q.id === order.recipe);
    if (!r) return catalog.has(order.dish) ? spriteOf({ id: 'order:' + order.dish, kind: order.dish, props: {}, parent: null }) : null;
    const props = { recipe: r.id };
    if (r.look && r.look.tint) props.tint = r.look.tint;
    if (r.look && r.look.topper) props.topper = r.look.topper;
    if (r.dish === 'smoothie') props.color = smoothieOf(exampleItems(r).map((it) => ({ kind: it.kind, props: {} })));
    return spriteOf({ id: 'order:' + r.id, kind: r.dish, props, parent: null });
  }
  const orderKey = (o) => (o ? (o.any ? 'any' : o.recipe || o.dish) : '');

  function bubbleSpot(e) {
    const v = view && view.viewOf(e.id);
    const s = v ? v.scale : 1;
    let off = [0, -150];
    try { if (rig) off = anchorOffset(rig, e.props.body || 'adult', rig.poses[e.props.pose || 'stand'] || rig.poses.stand, 'head'); } catch { /* guess */ }
    const hx = e.x + off[0] * s;
    // By the right wall the bubble floats on the head's left, so it never leaves the room.
    const left = hx + 14 + 118 * BUBBLE_SCALE > m.width - 8;
    return { x: r1(left ? hx - 14 - 118 * BUBBLE_SCALE : hx + 14), y: r1(e.y + off[1] * s - 40 * s), left };
  }

  function syncBubble(e, pop) {
    const want = phaseOf(e.props) === 'wait';
    let b = bubbles.get(e.id);
    const v = view && view.viewOf(e.id);
    if (!want || !v) {
      if (b) { b.el.remove(); bubbles.delete(e.id); }
      if (want) pending.add(e.id);    // not drawn yet: its first render shows it
      return;
    }
    pending.delete(e.id);
    const key = orderKey(e.props.order);
    if (!b || b.key !== key) {
      if (!b) {
        const el = document.createElement('div');
        el.className = 'cust-bubble';
        el.dataset.cust = e.id;
        el.innerHTML = '<div class="cb-pop"><div class="cb-dot cb-d2"></div><div class="cb-dot cb-d1"></div><div class="cb-cloud"></div><div class="cb-pic"></div><div class="cb-name"></div></div>';
        layer.appendChild(el);
        b = { el, key: null };
        bubbles.set(e.id, b);
      }
      b.key = key;
      b.el.dataset.order = key;
      const pic = b.el.querySelector('.cb-pic');
      const o = e.props.order;
      if (o.any) pic.innerHTML = HEART_SVG;
      else {
        paintIcon(pic, orderSprite(o));
        const inner = pic.firstChild;
        if (inner) {
          const k = Math.min(84 / (Number(inner.dataset.w) || 60), 72 / (Number(inner.dataset.h) || 60)) * 0.92;
          inner.style.transform = `translate(-50%, -50%) scale(${Math.round(k * 1000) / 1000})`;
        }
      }
      b.el.querySelector('.cb-name').textContent = o.name || '';
      if (pop) popIn(b.el.firstChild, e);
    }
    const p = bubbleSpot(e);
    b.el.classList.toggle('cb-left', !!p.left);
    b.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${BUBBLE_SCALE})`;
    b.el.style.visibility = v.held ? 'hidden' : '';
  }

  function popIn(el, e) {
    tween.animate(el, [
      { transform: 'scale(0.1)', opacity: 0 },
      { transform: 'scale(1.12)', opacity: 1, offset: 0.6 },
      { transform: 'scale(0.96)', offset: 0.82 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 460, easing: 'ease-out', delay: 260, fill: 'backwards' });
    soon(260, () => play('pop', { pitch: 1.25 }));
    if (fx) soon(420, () => { const p = bubbleSpot(e); fx.burst('sparkle', p.x + 60, p.y - 50, { count: 4, spread: 70 }); });
  }

  function hideBubble(id) { const b = bubbles.get(id); if (b) b.el.style.visibility = 'hidden'; }

  // ---- what every iPad shows when a customer's state changes ----
  function walkAnim(id, from, to) {
    const ms = dur(from, to);
    if (view) view.glideFrom(id, from[0], from[1], { duration: ms, easing: 'linear' });
    if (chars && rig) {
      const frames = [];
      for (let t = 0, k = 0; t < ms; t += 240, k++) frames.push([rig.poses[k % 2 ? 'walk-b' : 'walk-a'], 240]);
      chars.gesture(id, frames, { face: [['happy', ms]] });
    }
    // Footsteps: a soft tap per step (few, no loop).
    const steps = Math.min(8, Math.floor(ms / 480));
    for (let i = 1; i <= steps; i++) soon(i * 480 - 200, () => play('tap', { pitch: 0.7 + (i % 2) * 0.12, gain: 0.35 }));
    return ms;
  }

  function waveAt(id) {
    if (!chars || !rig) return;
    const w = rig.poses.wave, w2 = rig.poses.wave2;
    chars.gesture(id, [[{ armR: w.armR, head: w.head }, 200], [{ armR: w2.armR, head: w2.head }, 200], [{ armR: w.armR }, 200], [{ armR: w2.armR }, 200]], { face: [['happy', 900]] });
    soon(80, () => play('plink', { pitch: 1.3 }));
  }

  function reactServed(e) {
    const eating = e.props.eating;
    const head = chars ? chars.anchor(e.id, 'head') : null;
    if (eating.match) {
      // The dish they wanted: a big cheer, arms up, hearts.
      play('cheer');
      soon(200, () => play('tada', { gain: 0.6 }));
      if (chars && rig) {
        const c = rig.poses.cheer;
        chars.gesture(e.id, [[{ armL: c.armL, armR: c.armR, head: c.head }, 420], [{ armL: c.armL, armR: c.armR }, 420]], { face: [['wheee', 700], ['love', 700]] });
      }
      if (fx && head) { fx.burst('heart', head.x, head.y - 40, { count: 7, spread: 110 }); soon(350, () => fx.burst('sparkle', head.x, head.y - 60, { count: 6, spread: 120 })); }
    } else {
      // Not what they asked for: a funny face... then a laugh. Never sad.
      if (chars) chars.face(e.id, [['surprised', 420], ['yuck', 520], ['cheeky', 300], ['laughing', 1000]]);
      play('boing', { pitch: 1.3 });
      soon(1150, () => play('giggle'));
      soon(1400, () => play('laugh', { gain: 0.7 }));
      if (fx && head) soon(1200, () => fx.burst('sparkle', head.x, head.y - 40, { count: 5, spread: 80 }));
    }
    const b = bubbles.get(e.id);
    if (b) { const el = b.el; bubbles.delete(e.id); tween.animate(el.firstChild, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 240 }); soon(260, () => el.remove()); }
  }

  function chomp(e) {
    if (!chars) return;
    const good = e.props.eating && e.props.eating.match;
    const seq = [[{ eyes: 'content', mouth: 'oh' }, 130], [{ eyes: 'content', mouth: 'small' }, 120], [{ eyes: 'content', mouth: 'oh' }, 130], [{ eyes: 'content', mouth: 'small' }, 120]];
    chars.face(e.id, seq.concat(good ? [['yum', 500]] : [['cheeky', 250], ['laughing', 350]]));
  }

  function thanks(e) {
    waveAt(e.id);
    const head = chars ? chars.anchor(e.id, 'head') : null;
    if (fx && head) fx.burst('heart', head.x, head.y - 40, { count: 3, spread: 60 });
    for (let i = 0; i < 3; i++) soon(120 + i * 140, () => play('clink', { pitch: 1.3 + i * 0.15, gain: 0.7 }));
  }

  function eatSig(e) {
    const it = e.props.eating ? ent(e.props.eating.id) : null;
    if (!it) return 'gone';
    return (it.props.bites | 0) + ':' + childrenOf(S(), it.id).length + ':' + (it.props.fill == null ? '' : it.props.fill);
  }

  function onStore() {
    const seen = new Set();
    for (const e of charsHere()) {
      seen.add(e.id);
      const ph = phaseOf(e.props);
      const prev = last.get(e.id);
      const sig = ph === 'eat' ? eatSig(e) : '';
      if (!prev) {
        if (ph === 'walk' && known && !known.has(e.id)) { stats.arrivals++; walkAnim(e.id, e.props.walk.from, [e.x, e.y]); }
        syncBubble(e, !!known && !known.has(e.id));
      } else {
        if (ph === 'walk' && prev.phase !== 'walk') walkAnim(e.id, e.props.walk.from, [e.x, e.y]);
        if (ph === 'leave' && prev.phase !== 'leave') { stats.leaves++; walkAnim(e.id, e.props.leave.from, [e.x, e.y]); }
        if (ph === 'eat' && prev.phase !== 'eat') reactServed(e);
        else if (ph === 'eat' && sig !== prev.sig) chomp(e);
        if (ph === 'paid' && prev.phase !== 'paid') thanks(e);
        if (prev.phase === 'walk' && ph !== 'walk' && e.props.seat) { stats.sat++; if (chars) soon(300, () => chars.face(e.id, [['happy', 900]])); }
        syncBubble(e, ph === 'wait' && (prev.phase !== 'wait' || prev.order !== orderKey(e.props.order)));
      }
      last.set(e.id, { phase: ph, sig, order: orderKey(e.props.order) });
    }
    for (const id of [...last.keys()]) {
      if (seen.has(id)) continue;
      last.delete(id);
      const b = bubbles.get(id);
      if (b) { b.el.remove(); bubbles.delete(id); }
    }
    renderPile();
    if (!isGuest()) think();
  }

  // ---- the host's brain: what happens by itself, from timers that run only while something is going on ----
  function schedule(id, phase, ms, fn) {
    const key = id + ':' + phase;
    if (timers.has(key)) return;
    timers.set(key, setTimeout(() => { timers.delete(key); if (!destroyed) fn(); }, ms));
  }

  function think() {
    const phases = new Map();
    for (const e of charsHere()) {
      const ph = phaseOf(e.props);
      phases.set(e.id, ph);
      const fresh = known && !known.has(e.id);
      if (ph === 'walk') {
        const seat = seatOf(e.props.walk.seat);
        // Present when the cafe opened (a reload mid-walk): sit down at once.
        const ms = fresh ? dur(e.props.walk.from, [e.x, e.y]) : 30;
        schedule(e.id, 'walk', seat ? ms : 30, () => finishWalk(e.id));
      } else if (ph === 'eat') {
        schedule(e.id, 'eat', biteLoc.has(e.id) ? tune.biteMs : tune.firstBiteMs, () => eatStep(e.id));
      } else if (ph === 'paid') {
        schedule(e.id, 'paid', tune.thanksMs, () => afterPaid(e.id));
      } else if (ph === 'leave') {
        schedule(e.id, 'leave', e.props.leave.from ? dur(e.props.leave.from, [e.x, e.y]) + 150 : 30, () => leaveDone(e.id));
      } else if (ph === 'idle' && e.props.cust === WALKIN && (e.props.pose || 'stand') === 'stand' && Math.hypot(e.x - DOOR.x, e.y - DOOR.y) < 110) {
        // A finished walk-in carried to the door: waves and goes home.
        schedule(e.id, 'door', 700, () => { const c = ent(e.id); if (c && phaseOf(c.props) === 'idle' && Math.hypot(c.x - DOOR.x, c.y - DOOR.y) < 110) startLeave(c); });
      }
    }
    // Timers of phases that ended (a kid carried the customer off, the other iPad served...).
    for (const [key, t] of [...timers]) {
      const i = key.lastIndexOf(':');
      const id = key.slice(0, i), ph = key.slice(i + 1);
      const now = phases.get(id);
      if (now === ph || (ph === 'door' && now === 'idle')) continue;
      clearTimeout(t);
      timers.delete(key);
      if (ph === 'eat') biteLoc.delete(id);
    }
  }

  function finishWalk(id) {
    const e = ent(id);
    if (!e || !e.props.walk) return;
    const seat = seatOf(e.props.walk.seat);
    const v = view && view.viewOf(id);
    const spot = seat ? standSpot(seat, e.props.body) : null;
    const where = spot && Math.abs(e.x - spot.x) < 2 && Math.abs(e.y - spot.y) < 2;
    const taken = seat && charsHere().some((c) => c.id !== id && c.props.seat === seat.id);
    if (seat && where && !taken && !(v && v.held)) {
      set(id, 'pose', seat.pose || 'sit');
      set(id, 'seat', seat.id);
      store.dispatch('move', { id, room: roomId, x: r1(seat.x), y: r1(seat.y), z: 0 });
    }
    // Last: the walk is over (every iPad then pops the order bubble up where they sit).
    set(id, 'walk', null);
    if (!busyDoor() && pieceApi.state('front-door') === 'open') pieceApi.set('front-door', 'closed');
  }

  /** Where the thing being eaten is (to find the plate it leaves). */
  const locOf = (it) => (it.parent ? { parent: it.parent, slot: it.slot } : { room: it.room, x: it.x, y: it.y });
  function leftAt(loc) {
    for (const id of Object.keys(S().entities)) {
      const q = ent(id);
      if (!q || !(DISHES.includes(q.kind) || DRINK_CUPS.includes(q.kind) || q.kind === 'glass')) continue;
      if (loc.parent ? q.parent === loc.parent && q.slot === loc.slot : !q.parent && q.room === loc.room && Math.abs(q.x - loc.x) < 1 && Math.abs(q.y - loc.y) < 1) return q;
    }
    return null;
  }

  function takeBite(c, target) {
    const k = catalog.get(target.kind);
    const sip = k && k.behaviors.some((b) => b.use === 'drink');
    if (sip) {
      const at = chars ? chars.anchor(c.id, 'mouth') : null;
      const ok = behaviors.act(target.id, 'bite', { at });
      return { ate: ok, gone: !ent(target.id) };
    }
    if (chars) return chars.bite(c.id, target.id);
    return { ate: behaviors.act(target.id, 'bite'), gone: !ent(target.id) };
  }

  function eatStep(id) {
    const c = ent(id);
    if (!c || !c.props.eating) return;
    const it = ent(c.props.eating.id);
    const st = biteLoc.get(id) || { n: 0, loc: null };
    biteLoc.set(id, st);
    if (!it || st.n >= BITES_MAX) { finishEat(id); return; }
    let target = it;
    if (DISHES.includes(it.kind)) {
      target = childrenOf(S(), it.id).find((k) => isFood(k.kind));
      if (!target) { finishEat(id); return; }
    }
    st.loc = locOf(it);
    const r = takeBite(c, target);
    st.n++;
    stats.bites++;
    if (!r.ate) { finishEat(id); return; }
    if (r.gone && target === it) { schedule(id, 'eat', 500, () => finishEat(id)); return; }
    schedule(id, 'eat', tune.biteMs, () => eatStep(id));
  }

  function finishEat(id) {
    const c = ent(id);
    if (!c || !c.props.eating) return;
    const { id: itemId, match } = c.props.eating;
    const st = biteLoc.get(id) || { n: 0, loc: null };
    biteLoc.delete(id);
    let it = ent(itemId);
    // Leftovers: a cup is drunk up; food still on a plate is eaten up; the dish is left dirty.
    if (it) {
      if (DRINK_CUPS.includes(it.kind)) { set(it.id, 'fill', it.kind === 'mug' ? 0 : 'empty'); set(it.id, 'dirty', 1); }
      else if (DISHES.includes(it.kind)) {
        for (const k of childrenOf(S(), it.id)) if (isFood(k.kind)) store.dispatch('remove', { id: k.id, hard: true });
        set(it.id, 'dirty', 1);
      } else if (tagsOf(it.kind).includes('dish')) set(it.id, 'dirty', 1);
      else { store.dispatch('remove', { id: it.id, hard: true }); it = null; }
    }
    const dish = it || (st.loc ? leftAt(st.loc) : null);
    // The dirty plate goes on the table (out of their hands).
    const seat = seatOf(c.props.seat);
    const spot = tableSpot(seat, surfaces());
    let at = null;
    if (dish && dish.parent === id) {
      const r = spot || settle(room.def, { x: c.x + 50, y: Math.min(m.floor.y1 - 8, c.y + 40), halfW: 30 });
      store.dispatch('detach', { id: dish.id, room: roomId, x: r1(r.x), y: r1(r.y), z: 0 });
      at = { x: r.x, y: r.y };
    } else if (dish && !dish.parent) at = { x: dish.x, y: dish.y };
    if (!at) at = spot || settle(room.def, { x: c.x + 50, y: Math.min(m.floor.y1 - 8, c.y + 40), halfW: 30 });
    // Coins, happily, whatever they got.
    const s = surfaces().find((q) => Math.abs(q.y - at.y) < ON_EPS && at.x >= q.x0 - EDGE_TOL && at.x <= q.x1 + EDGE_TOL);
    const spots = coinSpots(match ? COINS_MATCH : COINS_OTHER, at.x, at.y, s ? { x0: s.x0, x1: s.x1 } : {});
    const hand = chars ? chars.anchor(id, 'handR') : null;
    spots.forEach((p, i) => {
      const cid = store.newId();
      const r = s ? p : settle(room.def, { x: p.x, y: p.y, halfW: 14 });
      if (store.dispatch('spawn', { id: cid, kind: COIN_KIND, room: roomId, x: r1(r.x), y: r1(r.y), z: p.z || 0 })) {
        stats.coins++;
        if (view && hand) soon(i * 110, () => view.animateFrom(cid, hand.x, hand.y));
      }
    });
    set(id, 'eating', null);
    set(id, 'paid', { seat: c.props.seat || null, match: !!match });
    stats.paid++;
  }

  function afterPaid(id) {
    const c = ent(id);
    if (!c || !c.props.paid) return;
    const paid = c.props.paid;
    set(id, 'paid', null);
    const v = view && view.viewOf(id);
    if (c.props.cust === WALKIN && (c.props.seat || null) === paid.seat && !(v && v.held)) startLeave(ent(id));
    else stats.stays++;
  }

  function startLeave(c) {
    const seat = seatOf(c.props.seat);
    const from = seat && c.props.seat ? standSpot(seat, c.props.body) : { x: c.x, y: c.y };
    // Things a kid gave them (not their own hat) stay behind.
    const own = new Set(c.props.own || []);
    for (const k of childrenOf(S(), c.id)) {
      if (own.has(k.id)) continue;
      const r = settle(room.def, { x: from.x + 40, y: from.y, halfW: 25 });
      store.dispatch('detach', { id: k.id, room: roomId, x: r1(r.x), y: r1(r.y), z: 0 });
    }
    set(c.id, 'pose', 'stand');
    set(c.id, 'seat', null);
    store.dispatch('move', { id: c.id, room: roomId, x: DOOR.x, y: DOOR.y, z: 0 });
    set(c.id, 'leave', { from: [from.x, from.y] });
    if (pieceApi.state('front-door') !== 'open') pieceApi.set('front-door', 'open');
  }

  function leaveDone(id) {
    const c = ent(id);
    if (!c || !c.props.leave) return;
    const v = view && view.viewOf(id);
    if (Math.abs(c.x - DOOR.x) > 2 || Math.abs(c.y - DOOR.y) > 2 || (v && v.held)) {
      // A kid caught them on the way out: they stay and chat.
      set(id, 'leave', null);
      stats.stays++;
    } else {
      for (const k of childrenOf(S(), id)) store.dispatch('remove', { id: k.id, hard: true });
      store.dispatch('remove', { id, hard: true });
      stats.gone++;
      play('thud', { pitch: 0.8, gain: 0.6 });
    }
    if (!busyDoor() && pieceApi.state('front-door') === 'open') pieceApi.set('front-door', 'closed');
  }

  // ---- the tip jar ----
  function tipJar() {
    let best = null;
    for (const id of Object.keys(S().entities)) { const e = ent(id); if (e && e.kind === TIPJAR_KIND && (!best || id < best.id)) best = e; }
    return best;
  }
  function ensureTipJar() {
    if (tipJar() || !catalog.has(TIPJAR_KIND)) return null;
    // The counter's left end: the manifest's tip-jar slot sits in front of the
    // chocolate ice-cream tub's hot spot, which the jar would cover.
    const s = surfaces().find((q) => q.id === 'order-counter');
    const x = s ? s.x0 + 24 : 1410;
    const y = s ? s.y : 616;
    const id = store.newId();
    store.dispatch('spawn', { id, kind: TIPJAR_KIND, room: roomId, x: r1(x), y, z: 0 });
    return id;
  }
  function dance() {
    // A shake of the tip jar: the customers do a little dance.
    const who = charsHere().filter((c) => c.props.cust === WALKIN || c.props.order || c.props.eating);
    if (!who.length || !chars || !rig) return;
    stats.dances++;
    const c = rig.poses.cheer, w = rig.poses.wave, w2 = rig.poses.wave2;
    for (const e of who) {
      chars.gesture(e.id, [[{ armL: c.armL, armR: w.armR, head: w.head }, 220], [{ armL: w2.armR, armR: c.armR, head: w2.head }, 220], [{ armL: c.armL, armR: w.armR, head: w.head }, 220], [{ armL: w2.armR, armR: c.armR }, 220]], { face: [['wheee', 900]] });
      const v = view && view.viewOf(e.id);
      if (v) tween.wobble(v.body, { amount: 0.35, duration: 880 });
    }
  }

  // ---- hooks ----
  function wrap(b) {
    base = b;
    return Object.assign({}, b, {
      onTap(e, ctx) {
        const r = b.onTap ? b.onTap(e, ctx) : false;
        if (e.kind === TIPJAR_KIND) dance();
        return r;
      },
      dropTarget(item, other) {
        if (other.kind === CHAR_KIND && phaseOf(other.props) === 'wait' && canServe(item)) return true;
        return b.dropTarget ? b.dropTarget(item, other) : false;
      },
      onDropInto(item, target, ctx) {
        if (target.kind === CHAR_KIND && phaseOf(target.props) === 'wait' && canServe(item)) { serve(target, item, 'drop'); return true; }
        const handled = b.onDropInto ? b.onDropInto(item, target, ctx) : false;
        // Food put on a plate (or in a bowl) on a waiting customer's table: served too.
        if (handled && DISHES.includes(target.kind) && !target.parent && isFood(item.kind)) {
          const now = ent(item.id);
          const c = now && now.parent === target.id ? customerAtTable(target) : null;
          if (c) serve(c, now, 'table');
        }
        return handled;
      },
      onDrop(e, ctx) {
        if (e.kind === COIN_KIND && !e.parent) {
          const v = ctx.view.viewOf(e.id);
          if (overRegister([ctx.info, v ? { x: v.x, y: v.y - 12 } : null])) return deposit(e);
        }
        return b.onDrop ? b.onDrop(e, ctx) : false;
      },
      onLanded(e, ctx) {
        if (b.onLanded) b.onLanded(e, ctx);
        const now = ent(e.id);
        if (!now || now.parent || !canServe(now)) return;
        const c = customerAtTable(now);
        if (c) serve(c, now, 'table');
      },
      onDragStart(e, ctx) {
        if (e.kind === CHAR_KIND) hideBubble(e.id);
        if (b.onDragStart) b.onDragStart(e, ctx);
      },
      onRender(e, ctx) {
        if (b.onRender) b.onRender(e, ctx);
        // Follow the character (only bubbles already up, or waiting for their first draw: a new one pops in onStore).
        if (e.kind === CHAR_KIND && layer && (bubbles.has(e.id) || pending.has(e.id))) syncBubble(e, false);
      },
    });
  }

  function onPieceTap(pid, info) {
    if (pid === 'door-bell') { ring(); return true; }
    if (pid === 'front-door' && pieceApi.state('front-door') !== 'open') { ring(); return true; }
    if (pid === REGISTER && info && reg && info.y < reg.y + reg.h * KEYS_BOTTOM) { tapKey(info); return true; }
    if (pid === REGISTER) stats.drawer++;
    return false;
  }
  function afterPieceTap(pid) {
    if (pid === 'counter-bell') kidOrders();
    if (pid === REGISTER) renderPile();
  }

  return {
    wrap,
    bind(v) {
      view = v;
      ensureCss();
      layer = document.createElement('div');
      layer.className = 'cust-layer';
      layer.style.zIndex = String(Number(room.fxLayer.style.zIndex || 0) - 1);
      room.el.insertBefore(layer, room.fxLayer);
      const regEl = pieceApi.el(REGISTER);
      if (regEl && reg) {
        pile = document.createElement('div');
        pile.className = 'reg-pile';
        pile.style.cssText = `left:${r1(reg.w * DRAWER[0])}px;top:${r1(reg.h * DRAWER[1])}px;width:${r1(reg.w * (DRAWER[2] - DRAWER[0]))}px;height:${r1(reg.h * (DRAWER[3] - DRAWER[1]))}px`;
        regEl.appendChild(pile);
      }
      ensureTipJar();
      known = new Set(charsHere().map((e) => e.id));
      onStore();
      unsubscribe = store.subscribe(onStore);
    },
    ring,
    kidOrders,
    serve: (custId, itemId) => { const c = ent(custId), it = ent(itemId); return c && it ? serve(c, it, 'drop') : null; },
    onPieceTap,
    afterPieceTap,
    tipJarId: () => (tipJar() || {}).id || null,
    door: () => ({ ...DOOR }),
    registerCoins,
    /** The customers here: [{id, phase, order, seat, walkIn}] (tests, debugging). */
    list: () => charsHere().filter((e) => e.props.cust || e.props.order || e.props.eating || e.props.paid)
      .map((e) => ({ id: e.id, phase: phaseOf(e.props), order: orderKey(e.props.order), seat: e.props.seat || null, walkIn: e.props.cust === WALKIN })),
    bubbles: () => [...bubbles.keys()],
    stats: () => ({ ...stats, timers: timers.size, local: local.size }),
    tune(o) { Object.assign(tune, o || {}); return { ...tune }; },
    destroy() {
      destroyed = true;
      if (unsubscribe) unsubscribe();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      for (const t of local) clearTimeout(t);
      local.clear();
      if (layer) layer.remove();
      if (pile) pile.remove();
      bubbles.clear();
      view = null;
    },
  };
}
