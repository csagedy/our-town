// P2a.3 heat: the pure rules (src/core/food.js heat helpers) and the
// stove/oven geometry (src/scenes/cafe-heat.js heatSpots, heatedThings):
// progress read from a clock (pause banks it), what one step cooks, batter
// poured and baked, the ladle's scoop, the saucepan's look, what sits on a
// lit burner or in the shut oven. The looks go through the real catalog.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { createCatalog, validateCatalog } from '../../src/core/catalog.js';
import { createBehaviors } from '../../src/core/behaviors/index.js';
import { BEHAVIORS } from '../../src/core/behaviors/registry.js';
import { createStore } from '../../src/engine/store.js';
import {
  HEAT, heatProgress, heatDue, isHeating, isWarm, cookPlan, pourOf, scoopOf, potLook, MIX_DONE,
} from '../../src/core/food.js';
import { heatSpots, heatedThings, BURNER_REACH } from '../../src/scenes/cafe-heat.js';

const json = JSON.parse(readFileSync(path.join(ROOT, 'data/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'assets/art-manifest.json'), 'utf8'));
const m = manifest.rooms.cafe;

test('heat progress is read from the clock; a pause banks it; steps are whole', () => {
  assert.equal(isHeating({}), false);
  assert.equal(heatProgress({ heatAt: 1000 }, 2500), 1500);
  assert.equal(heatProgress({ heatAt: 0, heatMs: 700 }, 99999), 700, 'paused: only the banked part');
  assert.equal(heatProgress({ heatAt: 1000, heatMs: 700 }, 2000), 1700);
  assert.deepEqual(heatDue({ heatAt: 1000 }, 3000, 2000), { steps: 0, rest: 1000, next: 2000 });
  assert.deepEqual(heatDue({ heatAt: 1000, heatMs: 2500 }, 3000, 1600), { steps: 1, rest: 100, next: 2900 });
  assert.equal(heatDue({ heatAt: 1 }, 3000, 1 + 3000 * 7).steps, 7, 'a long absence: many steps (doneness clamps them)');
  assert.equal(isWarm({ hotAt: 1000 }, 1000 + HEAT.warmMs - 1), true);
  assert.equal(isWarm({ hotAt: 1000 }, 1000 + HEAT.warmMs), false);
});

test('one step: food cooks up to extra toasty; batter in the oven bakes; dough on the tray cooks', () => {
  const paramsOf = (k) => (['egg', 'pasta', 'pancake', 'flour', 'milk'].includes(k) ? {} : null);
  const pan = { kind: 'pan', props: {} };
  const kids = [{ id: 'b', kind: 'egg', props: { cooked: 1 } }, { id: 'a', kind: 'pancake', props: { cooked: 5 } }, { id: 'c', kind: 'spoon', props: {} }];
  assert.deepEqual(cookPlan(pan, kids, { paramsOf }), { self: false, foods: ['b'], bake: null, method: null });
  assert.equal(cookPlan({ kind: 'saucepan', props: { water: 1 } }, [], { paramsOf }).method, 'boiled');
  const batter = [{ id: 'x', kind: 'flour', props: { stir: MIX_DONE } }, { id: 'y', kind: 'milk', props: { stir: MIX_DONE } }];
  assert.deepEqual(cookPlan({ kind: 'mixing-bowl', props: {} }, batter, { oven: true, paramsOf }).bake, { ids: ['x', 'y'], kind: 'cupcake' });
  assert.equal(cookPlan({ kind: 'mixing-bowl', props: {} }, batter, { paramsOf }).bake, null, 'the stove never bakes');
  assert.deepEqual(cookPlan({ kind: 'mixing-bowl', props: {} }, batter, { paramsOf }).foods, [], 'mixed-in things are batter, not food on their own');
  assert.equal(cookPlan({ kind: 'baking-tray', props: { dough: 'plain' } }, [], { oven: true, paramsOf }).self, true);
  assert.equal(cookPlan({ kind: 'baking-tray', props: { dough: 'plain', cooked: 3 } }, [], { oven: true, paramsOf }).self, false);
  assert.equal(cookPlan({ kind: 'egg', props: { cracked: 1 } }, [], { oven: true, paramsOf }).self, true, 'food straight on the rack');
});

test('pour, scoop and the saucepan look', () => {
  const batter = [{ kind: 'flour', props: { stir: MIX_DONE } }, { kind: 'chocolate', props: { stir: MIX_DONE } }];
  assert.deepEqual(pourOf(batter, 'pan'), { into: 'pancake', batter: 'choc' });
  assert.deepEqual(pourOf(batter, 'baking-tray'), { into: 'dough', batter: 'choc' });
  assert.equal(pourOf([{ kind: 'flour', props: { stir: 1 } }], 'pan'), null, 'not batter yet');
  assert.equal(pourOf(batter, 'plate'), null);
  const pasta = { id: 'p', kind: 'pasta', props: { cooked: 1 } };
  const carrot = { id: 'c', kind: 'carrot', props: { cooked: 2 } };
  assert.equal(scoopOf({}, [pasta]), null, 'no water, no soup');
  assert.deepEqual(scoopOf({ water: 1 }, [pasta, carrot]), { dish: 'spaghetti', take: ['c', 'p'] });
  assert.deepEqual(scoopOf({ water: 1 }, [carrot]), { dish: 'soup', take: ['c'] });
  assert.equal(scoopOf({ water: 1 }, [], 0), null, 'cold water');
  assert.deepEqual(scoopOf({ water: 1, heatAt: 5 }, [], 10), { dish: 'soup', take: [] }, 'hot water: a broth');
  assert.equal(potLook({}, [pasta]), null);
  assert.equal(potLook({ water: 1 }, []), 'water');
  assert.equal(potLook({ water: 1, heatAt: 9 }, [{ kind: 'pasta', props: {} }]), 'boiling');
  assert.equal(potLook({ water: 1 }, [pasta]), 'pasta');
});

test('what is on heat: a lit burner under a pan\'s bowl, or the shut oven\'s rack', () => {
  const spots = heatSpots(m);
  assert.deepEqual(spots.burners.map((b) => b.piece), ['burner-1', 'burner-2']);
  assert.ok(spots.stovetop && spots.rack);
  const b1 = spots.burners[0];
  const pan = { id: 'pan', kind: 'pan', x: b1.x + 28, y: spots.stovetop.y, props: {} };
  const far = { id: 'far', kind: 'pan', x: b1.x + BURNER_REACH + 40, y: spots.stovetop.y, props: {} };
  const tray = { id: 'tray', kind: 'baking-tray', x: 1029, y: spots.rack.y, props: {} };
  const kid = { id: 'kid', kind: 'egg', parent: 'pan', x: 0, y: 0, props: {} };
  const centerOf = (e) => (e.kind === 'pan' ? e.x - 28 : e.x);
  const all = [pan, far, tray, kid];
  assert.equal(heatedThings(all, spots, { centerOf }).size, 0, 'all off');
  const lit = heatedThings(all, spots, { centerOf, lit: (p) => p === 'burner-1' });
  assert.deepEqual([...lit], [['pan', { where: 'stove', burner: 'burner-1' }]]);
  assert.deepEqual([...heatedThings(all, spots, { centerOf, lit: (p) => p === 'burner-2' }).keys()], ['far'], 'the other burner');
  assert.deepEqual([...heatedThings(all, spots, { centerOf, ovenShut: true }).keys()], ['tray']);
});

test('the catalog is valid, and the saucepan and tray looks follow their state', () => {
  assert.deepEqual(validateCatalog(json, { behaviors: BEHAVIORS, manifest }), []);
  const catalog = createCatalog(json, manifest);
  const store = createStore({ device: 'hot1' });
  const b = createBehaviors({ catalog, store });
  const spawn = (kind, props, parent = null) => {
    const id = store.newId();
    store.dispatch('spawn', parent ? { id, kind, parent, slot: 's0', props } : { id, kind, room: 'cafe/kitchen', x: 500, y: 600, props });
    return id;
  };
  const E = (id) => store.state.entities[id];
  const pot = spawn('saucepan', { water: 1 });
  assert.equal(b.lookOf(E(pot)), 'water');
  const pasta = spawn('pasta', { cooked: 1 }, pot);
  assert.equal(b.lookOf(E(pot)), 'pasta');
  assert.equal(b.layoutOf(E(pot), [E(pasta)]).get(pasta).hidden, true, 'the pot art draws the pasta');
  const tray = spawn('baking-tray', { dough: 'plain' });
  assert.equal(b.lookOf(E(tray)), 'raw');
  store.dispatch('inc', { id: tray, path: 'props.cooked', by: 1 });
  assert.equal(b.lookOf(E(tray)), 'cookies');
  const egg = spawn('egg', { cracked: 1 }, spawn('pan', {}));
  const raw = b.spriteOf(E(egg));
  assert.equal(raw.look, 'fried');
  assert.match(raw.filter, /opacity/, 'a raw yolk in the pan');
  store.dispatch('inc', { id: egg, path: 'props.cooked', by: 1 });
  assert.equal(b.spriteOf(E(egg)).filter, undefined);
  store.dispatch('inc', { id: egg, path: 'props.cooked', by: 5 });
  assert.equal(b.lookOf(E(egg)), 'toasty', 'clamped at extra toasty');
});
