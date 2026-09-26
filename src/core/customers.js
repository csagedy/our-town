// Cafe customers (P2a.5, docs/design.md 3.1 #13-15, #18): the pure rules.
// The runtime (door bell, walking, bubbles, eating, coins) is
// src/scenes/cafe-customers.js; this module decides WHAT (who comes in,
// where they sit, what they would like, whether a dish is what they asked
// for, where the plate and the coins go). No DOM, no store.
//
// A customer is an ordinary character entity (kind 'char') with a few props
// (all `set` ops, so they are saved, replayed and shared by two iPads):
//   cust    'walk'   a walk-in (came through the door; walks out when done)
//                    absent: any other character (a kid's own one) who got an
//                    order from the counter bell; stays when done
//   order   {dish, recipe, any, name}   the picture in the thought bubble, or null
//   walk    {seat, from: [x, y]}        walking in from the door to that seat
//   eating  {id, match}                 eating the thing with that id
//   paid    {seat, match}               done: coins on the table, a wave
//   leave   {from: [x, y]}              walking out through the door
//   own     [ids]                       the worn pieces it came with (they leave with it)
// Every roll (the look, the seat, the order) is made BEFORE dispatch by the
// iPad that rang, and written into the ops (design.md 6.4 "Determinism").
//
// No pressure, ever: customers come ONLY when a kid rings the bell or opens
// the door (never on a timer), at most MAX_WALKINS at once, and there is no
// wrong dish: a dish that isn't the order (or a Mystery Dish) gets a funny
// face, then a laugh, and coins all the same.

export const WALKIN = 'walk';
export const MAX_WALKINS = 4;
/** Orders a customer may think of even before any recipe is found. */
export const EASY = ['pancakes', 'sandwich', 'strawberry-banana', 'cupcake', 'coffee'];
export const COFFEE = 'coffee';
export const ANY_CHANCE = 0.15;       // "anything!" (a sparkle heart)
export const REGULAR_CHANCE = 0.35;   // a regular from the starter cast instead of a new face
export const REGULARS = ['grandma', 'dad', 'teacher', 'girl5', 'boy9', 'builder'];
export const DRINK_CUPS = ['cafe-cup', 'mug'];
export const DISHES = ['plate', 'bowl'];
export const COINS_MATCH = 3;
export const COINS_OTHER = 2;
export const COIN_KIND = 'coin';
export const TIPJAR_KIND = 'tip-jar';
export const BITES_MAX = 4;           // a thing with no bite looks is done after this many
/** Dining seats walk-ins take, in order of preference (the tables, then the window). */
export const DINING_SEAT = /^(table-|window-seat-)/;
const TABLE_SEAT = /^table-(\d+)-/;

const r1 = (v) => Math.round(v * 10) / 10;

/** The recipe ids a customer may order: the easy ones plus every recipe found. Pure. */
export function orderPool(found = [], table = null) {
  const ids = new Set(EASY);
  for (const id of found) ids.add(id);
  const known = table ? new Set(table.recipes.map((r) => r.id)) : null;
  return [...ids].filter((id) => id === COFFEE || !known || known.has(id)).sort();
}

/**
 * Roll an order: {dish, recipe, any, name}. `random` is called at most twice.
 * table: the recipe table (recipes.js) for the dish kind and the name. Pure.
 */
export function rollOrder(random, { found = [], table = null } = {}) {
  if (random() < ANY_CHANCE) return { dish: null, recipe: null, any: true, name: 'Anything!' };
  const pool = orderPool(found, table);
  const id = pool[Math.floor(random() * pool.length) % pool.length];
  if (id === COFFEE) return { dish: COFFEE, recipe: null, any: false, name: 'Coffee' };
  const r = table ? table.recipes.find((q) => q.id === id) : null;
  return { dish: r ? r.dish : id, recipe: id, any: false, name: r ? r.name : id };
}

/** Is a cup or mug filled with something to drink? Pure. */
export function cupFull(e) {
  if (!e || !DRINK_CUPS.includes(e.kind)) return false;
  const f = e.props && e.props.fill;
  return e.kind === 'mug' ? !!f : typeof f === 'string' && f !== 'empty';
}

/**
 * Can this be served (eaten or drunk)? isFood(kind): catalog food/drink tags.
 * kids: the entity's children (a plate or bowl with food on it). Pure.
 */
export function servable(e, isFood, kids = []) {
  if (!e || e.kind === 'char' || e.kind === COIN_KIND) return false;
  if (e.props && e.props.dirty) return false;
  if (DRINK_CUPS.includes(e.kind)) return cupFull(e);
  if (e.kind === 'glass') return false;                 // an empty glass (a smoothie is its own kind)
  if (DISHES.includes(e.kind)) return kids.some((k) => isFood(k.kind));
  return !!isFood(e.kind);
}

/** Does the served thing match the order? ("anything!" always does.) Pure. */
export function matchesOrder(order, e) {
  if (!order) return false;
  if (order.any) return true;
  if (!e) return false;
  if (order.dish === COFFEE) return cupFull(e);
  return e.kind === order.dish;
}

/** Dining seats nobody sits on or is walking to. seats: normalized; chars: the room's characters. Pure. */
export function freeSeats(seats, chars) {
  const taken = new Set();
  for (const c of chars) {
    const p = c.props || {};
    if (p.seat) taken.add(p.seat);
    if (p.walk && p.walk.seat) taken.add(p.walk.seat);
  }
  return seats.filter((s) => DINING_SEAT.test(s.id) && !s.lie && !taken.has(s.id));
}

/** A free seat for a walk-in (tables first), or null. `random` is called once. Pure. */
export function pickSeat(seats, chars, random) {
  const free = freeSeats(seats, chars);
  const tables = free.filter((s) => TABLE_SEAT.test(s.id));
  const list = tables.length ? tables : free;
  if (!list.length) return null;
  return list[Math.floor(random() * list.length) % list.length];
}

/** Walk-ins in the room (walking in, waiting, eating or on their way out). Pure. */
export function walkIns(chars) {
  return chars.filter((c) => c.props && c.props.cust === WALKIN);
}

/**
 * Where a customer's dish, plate and coins go: the table surface in front of
 * its seat ({surface, x, y}), or null (not at a table: they use their hands
 * and the floor). surfaces: the room's live surfaces. Pure.
 */
export function tableSpot(seat, surfaces) {
  if (!seat) return null;
  const m = TABLE_SEAT.exec(seat.id);
  let s = null;
  if (m) s = surfaces.find((q) => q.id === 'table-' + m[1]);
  else if (/^window-seat-/.test(seat.id)) s = surfaces.find((q) => q.id === 'window-seat-sill');
  else if (/^island-stool/.test(seat.id)) s = surfaces.find((q) => q.id === 'island-top');
  if (!s) return null;
  const mid = (s.x0 + s.x1) / 2;
  // A little toward the middle of the table from the chair (the other chair's plate fits too).
  const x = Math.max(s.x0 + 30, Math.min(s.x1 - 30, seat.x + (mid - seat.x) * 0.45));
  return { surface: s.id, x: r1(x), y: s.y };
}

/** n coin spots beside a plate at (x, y), alternating sides (world units). Pure. */
export function coinSpots(n, x, y, { x0 = -Infinity, x1 = Infinity } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? -1 : 1;
    const k = Math.floor(i / 2);
    const cx = x + side * (58 + k * 26);
    out.push({ x: r1(Math.max(x0 + 14, Math.min(x1 - 14, cx))), y, z: k });
  }
  return out;
}

/** The tip jar's look for its coin count: empty, coins, full. Pure. */
export function tipJarLook(coins) {
  const n = coins | 0;
  return n <= 0 ? 'empty' : n < 6 ? 'coins' : 'full';
}

/** How many coins to draw in the open register drawer's pile. Pure. */
export const pileCount = (coins) => Math.max(0, Math.min(14, coins | 0));

/** A walk's duration (ms) for a distance in world units: an unhurried stroll. Pure. */
export function walkMs(dist) {
  return Math.round(Math.max(1100, Math.min(3000, (dist / 240) * 1000)));
}

/** A customer's phase from its props: 'walk' | 'leave' | 'eat' | 'paid' | 'wait' | 'idle'. Pure. */
export function phaseOf(props = {}) {
  if (props.leave) return 'leave';
  if (props.walk) return 'walk';
  if (props.eating) return 'eat';
  if (props.paid) return 'paid';
  if (props.order) return 'wait';
  return 'idle';
}
