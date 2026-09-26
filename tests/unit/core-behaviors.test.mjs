// P1.8: the catalog (data/catalog.json + src/core/catalog.js), the behavior
// registry and the runtime's universal tap fallback, driven without a DOM
// (a fake view records sounds; animations are counted, not played).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { createCatalog, loadCatalog, validateCatalog, normalizeKind } from '../../src/core/catalog.js';
import { BEHAVIORS, defineBehavior, resolveBehaviors, createBehaviors } from '../../src/core/behaviors/index.js';
import { SOUND_NAMES } from '../../src/audio/sfx.js';
import { createStore } from '../../src/engine/store.js';
import { childrenOf, getEntity, inRoom } from '../../src/engine/world.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';
import { CATALOG_ROOM, CATALOG_ITEMS } from '../../src/scenes/test-room.js';
import { createRng } from '../../src/engine/random.js';

const json = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const opts = { behaviors: BEHAVIORS, sounds: SOUND_NAMES, manifest };
const STARTER = ['toggle', 'cycle', 'sound', 'squeak', 'wobble', 'spill', 'container', 'eatable', 'spawner'];

test('data/catalog.json is valid: behaviors, params, sounds, art refs, homes', () => {
  assert.deepEqual(validateCatalog(json, opts), []);
  assert.ok(Object.keys(json.kinds).length >= 15);
});

test('the catalog room places 15 kinds covering every starter behavior', () => {
  assert.equal(CATALOG_ITEMS.length, 15);
  const kinds = new Set(CATALOG_ITEMS.map((i) => i[0]));
  assert.equal(kinds.size, 15);
  const used = new Set();
  for (const k of kinds) {
    assert.ok(json.kinds[k], k + ' is in the catalog');
    for (const b of json.kinds[k].behaviors) used.add(b.use);
  }
  for (const b of STARTER) assert.ok(used.has(b), b + ' is used in the room');
  for (const b of STARTER) assert.ok(BEHAVIORS[b], b + ' is registered');
});

test('validateCatalog reports mistakes', () => {
  const bad = {
    schema: 1,
    kinds: {
      a: { size: [10, 10], tags: ['x'], behaviors: [{ use: 'nope' }] },
      b: { size: [10, 10], tags: ['x'], behaviors: [{ use: 'toggle', colour: 1 }] },
      c: { size: [10, 10], tags: ['x'], behaviors: [], sounds: { tap: 'kaboom' } },
      d: { size: [10, 10], tags: ['x'], behaviors: [], home: { spawner: 'zzz' } },
      e: { size: [10, 10], tags: ['x'], behaviors: [{ use: 'container', accepts: [] }] },
      f: { size: [10, 10], tags: ['x'], behaviors: [{ use: 'spawner', kinds: ['ghost'] }] },
      g: { size: [10, 10], tags: ['x'], behaviors: [], art: { sprite: 'not-drawn-yet' } },
      h: { size: [10, 10], anchor: [20, 5], tags: 'x', behaviors: [], wat: 1 },
      Bad_Name: { size: [0, 10], tags: [], behaviors: [] },
    },
  };
  const out = validateCatalog(bad, opts).join('\n');
  for (const m of ['a: unknown behavior nope', 'b: toggle: unknown param colour', 'c: unknown sound kaboom',
    'd: home must be', 'e: container: accepts', 'f: spawner: unknown kinds ghost', 'g: art sprite not-drawn-yet',
    'h: anchor', 'h: tags', 'h: unknown field wat', 'Bad_Name: kind names', 'Bad_Name: size']) {
    assert.ok(out.includes(m), 'reports ' + m + '\n' + out);
  }
  assert.deepEqual(validateCatalog(null), ['catalog is not an object']);
});

test('sprites: manifest art when it exists (anchor at the feet), placeholders otherwise', () => {
  const cat = createCatalog(json, manifest);
  const mug = cat.sprite('mug');
  assert.equal(mug.draw, 'img');
  assert.equal(mug.src, manifest.props.mug.variants.empty.file);
  const v = manifest.props.mug.variants.empty;
  assert.equal(mug.h, v.anchor[1]);                                  // feet = anchor line
  assert.ok(Math.abs(mug.img.left + v.anchor[0] - mug.w / 2) < 0.11, 'anchor x at the box center');
  assert.equal(cat.sprite('mug', 'full').src, manifest.props.mug.variants.full.file);
  assert.equal(cat.sprite('mug', 'no-such-look').src, v.file, 'unknown look: default variant');
  assert.equal(cat.sprite('mug', 'full'), cat.sprite('mug', 'full'), 'cached');
  const lamp = cat.sprite('lamp');                                   // no art: placeholder
  assert.equal(lamp.draw, 'shape');
  assert.deepEqual([lamp.w, lamp.h, lamp.shape, lamp.fill], [60, 130, 'tall', '#9aa5b1']);
  assert.equal(cat.sprite('lamp', 'on').fill, '#ffe066');
  assert.notEqual(cat.sprite('lamp', 'on').key, lamp.key);
  const noArt = createCatalog(json, null);                           // manifest failed to load
  assert.equal(noArt.sprite('mug').draw, 'shape');
  assert.equal(noArt.sprite('mug', 'full').fill, '#8b5a2b');
  assert.equal(noArt.sprite('apple', 'core').w, 22);
  const ghost = cat.sprite('ghost-kind');                            // not in the catalog
  assert.equal(ghost.draw, 'shape');
  assert.equal(ghost.sound, 'pop');
  assert.equal(cat.sprite('teddy').sound, 'squeak');
  assert.equal(cat.labelOf('cookie-jar'), 'Cookie Jar');
  assert.deepEqual(cat.homeOf('ball'), { spawner: 'toy-bin' });
  assert.ok(cat.hasTag('cupcake', 'sweet') && !cat.hasTag('ball', 'food'));
  assert.deepEqual(normalizeKind('x', null).anchor, [45, 90]);
});

test('loadCatalog never rejects: missing files mean placeholders', async () => {
  const cat = await loadCatalog({ fetch: async () => { throw new Error('offline'); } });
  assert.deepEqual(cat.kinds(), []);
  assert.equal(cat.sprite('mug').draw, 'shape');
  const files = { 'data/catalog.json': json, 'assets/art-manifest.json': manifest };
  const ok = await loadCatalog({ fetch: async (u) => ({ ok: !!files[u], json: async () => files[u] }) });
  assert.equal(ok.sprite('mug').draw, 'img');
  assert.equal(ok.kinds().length, Object.keys(json.kinds).length);
});

test('registry: define, refuse duplicates and bad hooks, merge params', () => {
  assert.throws(() => defineBehavior('toggle', {}), /already defined/);
  assert.throws(() => defineBehavior('x-bad', { onTapp() {} }), /unknown hook/);
  assert.throws(() => defineBehavior('x-bad2', { onTap: 3 }), /must be a function/);
  assert.throws(() => defineBehavior('Bad', {}), /behavior name/);
  const r = resolveBehaviors([{ use: 'toggle', key: 'lit' }, { use: 'missing' }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].p.key, 'lit');
  assert.deepEqual(r[0].p.sounds, ['tap', 'ding']);
});

// ---- runtime, without a DOM ----

function world({ seed = 1 } = {}) {
  const catalog = createCatalog(json, manifest);
  const store = createStore({ device: 'tt', now: () => 0 });
  const def = normalizeRoom(CATALOG_ROOM);
  const sounds = [];
  const pops = [];
  const view = { room: { id: def.id, def }, viewOf: () => null, play: (n) => sounds.push(n), animateFrom: (id) => pops.push(id) };
  const b = createBehaviors({ catalog, store, random: createRng(seed) });
  b.bind(view, null);
  const ctx = { view, fx: null, info: {} };
  const spawn = (kind, x = 700, y = 880, props) => {
    const id = store.newId();
    store.dispatch('spawn', { id, kind, room: def.id, x, y, props });
    return id;
  };
  const e = (id) => getEntity(store.state, id);
  const tap = (id) => { assert.equal(b.onTap(e(id), ctx), true); return b.log().at(-1); };
  return { catalog, store, b, ctx, spawn, e, tap, sounds, pops, def };
}

const lively = (r) => r.did.anim && r.did.sound && r.did.fx;

test('toggle: a tap flips the prop and the look; every tap is lively', () => {
  const w = world();
  const lamp = w.spawn('lamp');
  assert.equal(w.b.lookOf(w.e(lamp)), 'off');
  let r = w.tap(lamp);
  assert.deepEqual(r.via, ['toggle']);
  assert.ok(lively(r), JSON.stringify(r));
  assert.equal(w.e(lamp).props.on, true);
  assert.equal(w.b.spriteOf(w.e(lamp)).fill, '#ffe066');
  assert.equal(w.sounds.at(-1), 'ding');
  r = w.tap(lamp);
  assert.equal(w.e(lamp).props.on, false);
  assert.equal(w.sounds.at(-1), 'tap');
  assert.ok(lively(r), 'turning off still sparkles (fallback)');
  assert.deepEqual(r.fallback, ['sparkle']);
});

test('cycle: steps the looks; a one-way cycle at its end falls back, never dead', () => {
  const w = world();
  const mug = w.spawn('mug');
  w.tap(mug);
  assert.equal(w.b.lookOf(w.e(mug)), 'full');
  assert.equal(w.b.spriteOf(w.e(mug)).src, manifest.props.mug.variants.full.file);
  w.tap(mug);
  assert.equal(w.b.lookOf(w.e(mug)), 'empty');
  const egg = w.spawn('egg');
  assert.deepEqual(w.tap(egg).via, ['food'], 'a tap cracks it (P2a.2: the food behavior)');
  assert.equal(w.b.lookOf(w.e(egg)), 'cracked');
  const r = w.tap(egg);
  assert.deepEqual(r.via, [], 'nothing left to crack');
  assert.deepEqual(r.fallback, ['squish', 'sound', 'sparkle']);
  assert.ok(lively(r));
  assert.equal(w.e(egg).props.cracked, 1);
});

test('sound, squeak, wobble each react; an unknown kind gets the full fallback', () => {
  const w = world();
  for (const [kind, via, sound] of [['ball', 'sound', 'boing'], ['teddy', 'squeak', 'squeak'], ['blocks', 'wobble', 'knock'], ['toy-car', 'sound', 'whistle']]) {
    const r = w.tap(w.spawn(kind));
    assert.ok(r.via.includes(via), kind);
    assert.equal(w.sounds.at(-1), sound, kind);
    assert.ok(lively(r), kind);
  }
  const r = w.tap(w.spawn('mystery-thing'));
  assert.deepEqual(r.via, []);
  assert.deepEqual(r.fallback, ['squish', 'sound', 'sparkle']);
  assert.equal(w.sounds.at(-1), 'pop');
});

test('container: accepts the right tags, refuses others (and when full) playfully', () => {
  const w = world();
  const bowl = w.spawn('bowl', 645, 540);
  const ball = w.spawn('ball');
  const apple = w.spawn('apple');
  assert.equal(w.b.dropTarget(w.e(ball), w.e(bowl)), true, 'every container is a target, so a "no" is never silent');
  assert.equal(w.b.dropTarget(w.e(bowl), w.e(ball)), false, 'a ball is not a container');
  assert.equal(w.b.lookOf(w.e(bowl)), null);
  // Refused: handled (so the view springs it back), with sound + shake + puff.
  assert.equal(w.b.onDropInto(w.e(ball), w.e(bowl), w.ctx), true);
  let r = w.b.log().at(-1);
  assert.deepEqual(r.via, ['container:refuse']);
  assert.ok(lively(r));
  assert.equal(w.sounds.at(-1), 'boing');
  assert.equal(w.e(ball).parent, null);
  // Accepted: attached inside in a slot, drawn in the bowl's heap (P1.9).
  assert.equal(w.b.onDropInto(w.e(apple), w.e(bowl), w.ctx), true);
  assert.deepEqual(w.b.log().at(-1).via, ['container:accept']);
  assert.equal(w.e(apple).parent, bowl);
  assert.equal(w.e(apple).slot, 's0');
  const spot = w.b.layoutOf(w.e(bowl), [w.e(apple)]).get(apple);
  assert.equal(spot.hidden, false);
  assert.equal(spot.front, false, 'a heap sits behind the bowl front, peeking over the rim');
  // Capacity 3.
  for (let i = 0; i < 2; i++) assert.ok(w.b.onDropInto(w.e(w.spawn('cupcake')), w.e(bowl), w.ctx));
  assert.equal(childrenOf(w.store.state, bowl).length, 3);
  const extra = w.spawn('egg');
  w.b.onDropInto(w.e(extra), w.e(bowl), w.ctx);
  assert.deepEqual(w.b.log().at(-1).via, ['mix:refuse'], 'full (an egg goes through the bowl\'s mix behavior, P2a.2)');
  assert.equal(w.b.log().at(-1).reason, 'full');
  assert.deepEqual(childrenOf(w.store.state, bowl).map((c) => c.slot).sort(), ['s0', 's1', 's2']);
  // The cookie jar takes sweets only; the pan takes ingredients (an egg cracks in).
  const jar = w.spawn('cookie-jar', 565, 540);
  w.b.onDropInto(w.e(extra), w.e(jar), w.ctx);
  assert.deepEqual(w.b.log().at(-1).via, ['container:refuse']);
  const pan = w.spawn('pan', 750, 540);
  w.b.onDropInto(w.e(extra), w.e(pan), w.ctx);
  assert.deepEqual(w.b.log().at(-1).via, ['mix:accept']);
  assert.equal(w.e(extra).props.cracked, 1, 'it cracked on the rim');
  // P2a.3: the pan draws what is in it (a stack: the egg shows its doneness), not an 'egg' look.
  assert.equal(w.b.lookOf(w.e(pan)), null);
  assert.equal(w.b.layoutOf(w.e(pan), [w.e(extra)]).get(extra).hidden, false);
});

test('spill: a tap tips the contents out onto real spots; an empty spill falls back', () => {
  const w = world();
  const bowl = w.spawn('bowl', 645, 540);
  const empty = w.tap(bowl);
  assert.deepEqual(empty.via, []);
  assert.ok(lively(empty));
  const a = w.spawn('apple'), c = w.spawn('cupcake');
  w.b.onDropInto(w.e(a), w.e(bowl), w.ctx);
  w.b.onDropInto(w.e(c), w.e(bowl), w.ctx);
  const r = w.tap(bowl);
  assert.deepEqual(r.via, ['spill']);
  assert.equal(childrenOf(w.store.state, bowl).length, 0);
  for (const id of [a, c]) {
    const e = w.e(id);
    assert.equal(e.room, w.def.id);
    assert.equal(e.parent, null);
    assert.ok(e.y === 540 || (e.y >= 700 && e.y <= 960), 'rests on the counter or the floor: ' + e.y);
  }
  assert.deepEqual(w.pops.sort(), [a, c].sort(), 'each pops out');
  // The cookie jar spills on a long press instead; a tap toggles its lid.
  const jar = w.spawn('cookie-jar', 565, 540);
  w.b.onDropInto(w.e(w.spawn('cupcake')), w.e(jar), w.ctx);
  assert.deepEqual(w.tap(jar).via, ['toggle']);
  assert.equal(childrenOf(w.store.state, jar).length, 1);
  w.b.onLongPress(w.e(jar), w.ctx);
  assert.deepEqual(w.b.log().at(-1).via, ['spill']);
  assert.equal(childrenOf(w.store.state, jar).length, 0);
});

test('eatable: bites are inc ops through the looks, then gone (or a core stays)', () => {
  const w = world();
  const ops = [];
  w.store.subscribe((s, env) => ops.push(env.op));
  const cake = w.spawn('cupcake');
  w.tap(cake);
  assert.equal(ops.at(-1), 'inc');
  assert.equal(w.b.lookOf(w.e(cake)), 'bite1');
  w.tap(cake);
  assert.equal(w.b.lookOf(w.e(cake)), 'bite2');
  const last = w.tap(cake);
  assert.deepEqual(last.via, ['eatable']);
  assert.ok(lively(last));
  assert.equal(w.e(cake), undefined, 'eaten up');
  assert.equal(w.sounds.at(-1), 'munch');
  const apple = w.spawn('apple');
  w.tap(apple); w.tap(apple);
  assert.equal(w.b.lookOf(w.e(apple)), 'core');
  const core = w.tap(apple);
  assert.deepEqual(core.via, [], 'a core has no bites left');
  assert.ok(lively(core), 'but the tap still reacts');
  assert.ok(w.e(apple));
  // The verb for characters (P1.10).
  const c2 = w.spawn('cupcake');
  assert.equal(w.b.act(c2, 'bite'), true);
  assert.equal(w.e(c2).props.bites, 1);
  assert.equal(w.b.act(c2, 'fly'), false);
});

test('spawner: a tap pops a clone onto a free spot; never draggable itself; the room cap sends old clones home', () => {
  const w = world();
  w.def.cap = 4;
  const bin = w.spawn('toy-bin', 1180, 930);
  assert.equal(w.b.canDrag(w.e(bin)), false);
  assert.equal(w.b.canDrag(w.e(w.spawn('ball'))), true);
  const made = [];
  for (let i = 0; i < 4; i++) {
    const r = w.tap(bin);
    assert.deepEqual(r.via, ['spawner']);
    assert.ok(lively(r));
    made.push(inRoom(w.store.state, w.def.id).filter((e) => e.props.from === bin).map((e) => e.id).find((id) => !made.includes(id)));
  }
  let out = inRoom(w.store.state, w.def.id).filter((e) => e.props.from === bin);
  assert.equal(out.length, 4);
  for (const e of out) {
    assert.ok(['ball', 'toy-car', 'teddy'].includes(e.kind));
    assert.ok(e.y >= 700 && e.y <= 960 && e.x > 0 && e.x < 1440);
  }
  assert.equal(w.pops.length, 4);
  // Past the cap the oldest untouched clone goes home (a hard remove), quietly.
  w.tap(bin);
  out = inRoom(w.store.state, w.def.id).filter((e) => e.props.from === bin);
  assert.equal(out.length, 4, 'back at the cap');
  assert.equal(w.store.state.entities[made[0]].deleted, true, 'the oldest went home');
  // A tapped clone was touched just now: the next oldest goes instead.
  w.tap(made[1]);
  w.tap(bin);
  assert.ok(w.e(made[1]), 'a clone a kid just touched stays');
  assert.equal(w.store.state.entities[made[2]].deleted, true);
});

test('spawner: a drag pulls out a clone under the finger; dropping it back sends it home', () => {
  const w = world();
  const cup = w.spawn('crayon-cup', 400, 330);
  const id = w.b.cloneFor(w.e(cup), Object.assign({}, w.ctx, { info: { x: 420, y: 300 } }));
  assert.ok(id);
  const c = w.e(id);
  assert.equal(c.kind, 'crayon');
  assert.equal(c.props.from, cup);
  assert.ok(['red', 'orange', 'yellow', 'green', 'blue', 'purple'].includes(c.props.color));
  assert.equal(w.b.lookOf(c), c.props.color, 'the variant behavior draws its color');
  assert.equal(c.x, 420);
  assert.equal(w.b.dropTarget(c, w.e(cup)), true);
  assert.equal(w.b.onDropInto(c, w.e(cup), w.ctx), true);
  assert.deepEqual(w.b.log().at(-1).via, ['spawner:accept']);
  assert.equal(w.e(id), undefined, 'home again');
  assert.equal(w.b.cloneFor(w.e(w.spawn('ball')), w.ctx), null, 'only spawners clone');
});

test('landSound: the kind\'s drop sound, else the surface\'s', () => {
  const w = world();
  assert.equal(w.b.landSound(w.e(w.spawn('ball')), 'knock'), 'boing');
  assert.equal(w.b.landSound(w.e(w.spawn('mystery')), 'knock'), 'knock');
});
