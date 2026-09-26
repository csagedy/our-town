// Unit: the construction site's pure parts (P2c.1): the build grid rules
// (src/core/buildgrid.js), the site scene's room definition, pieces, paint
// and first-visit data (src/scenes/site.js), and the buildpiece look.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shapeOf, anchorAt, cellOf, columnFor, overGrid, heightMap, restRow, snapDrop, settleGrid, wobbly, topSurfaces, towerOf,
} from '../../src/core/buildgrid.js';
import { siteRoom, zoneCamera, PIECES, pieceState, nextToggle, paintFor, gridSpot, seedSite, HOTSPOTS, STOCK, BUILD, SITE_ITEMS, PAINT_STOCK, SITE_ID, siteFiles } from '../../src/scenes/site.js';
import { pieceLook } from '../../src/core/behaviors/site.js';
import { createStore } from '../../src/engine/store.js';
import { inRoom } from '../../src/engine/world.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';

const manifest = JSON.parse(readFileSync(new URL('../../assets/art-manifest.json', import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL('../../data/catalog.json', import.meta.url)));
const m = manifest.rooms.site;
const G = m.grid;
const snap = (id) => manifest.props[id].snap;
const S = (id) => shapeOf(snap(id), G.cell);
const put = (id, kind, c, r) => ({ id, kind, c, r, shape: S(kind) });

test('shapes: footprints, column tops from stack points (stairs step, roof apex, flag)', () => {
  assert.deepEqual(S('block-2x1').tops, [1, 1]);
  assert.deepEqual(S('block-2x2').tops, [2, 2]);
  assert.deepEqual(S('plank').tops, [0.5, 0.5, 0.5, 0.5]);
  assert.equal(S('beam').w, 6);
  assert.deepEqual(S('stairs').tops, [1, 2]);
  assert.deepEqual(S('roof-triangle').tops, [2, 2, 2, 2]);
  assert.deepEqual(S('roof-triangle').stands, [false, true, true, false], 'only the apex carries');
  assert.deepEqual(S('flag').stands, [false], 'a flag carries nothing');
  assert.deepEqual(S('flag').tops, [2], 'but nothing goes through it either');
});

test('anchors and cells round-trip; off-grid points are not cells', () => {
  const sh = S('block-2x1');
  const a = anchorAt(G, sh.w, 3, 1.5);
  assert.deepEqual(a, { x: G.x0 + 4 * 40, y: G.y - 60 });
  assert.deepEqual(cellOf(G, sh, a.x, a.y), { c: 3, r: 1.5 });
  assert.equal(cellOf(G, sh, a.x + 7, a.y), null);
  assert.equal(cellOf(G, sh, a.x, a.y - 13), null);
  assert.equal(cellOf(G, sh, G.x0 + 16 * 40, G.y), null, 'past the last column');
  assert.equal(cellOf(G, sh, a.x, G.y + 40), null, 'below the deck');
  assert.equal(columnFor(G, 2, G.x0 - 500), 0);
  assert.equal(columnFor(G, 2, G.x1 + 500), G.cols - 2);
  assert.ok(overGrid(G, 500, 600) && !overGrid(G, 500, 960) && !overGrid(G, 1100, 700));
});

test('snapping stacks on the height map, half cells included, and stops at the top', () => {
  let placed = [];
  const drop = (kind, x, id) => { const s = snapDrop(G, placed, S(kind), x); if (s) placed.push(put(id, kind, s.c, s.r)); return s; };
  const a = drop('block-2x1', 550, 'a');
  assert.deepEqual([a.c, a.r, a.x, a.y], [7, 0, 550, 880]);
  const b = drop('plank', 550, 'b');
  assert.deepEqual([b.c, b.r], [6, 1], 'a plank over it');
  const c = drop('block-1x1', 530, 'c');
  assert.equal(c.r, 1.5, 'half-cell heights');
  assert.equal(c.y, 820);
  assert.deepEqual(heightMap(G, placed).slice(5, 11), [0, 1.5, 2.5, 1.5, 1.5, 0]);
  // Stairs: step 1 on the left, 2 on the right.
  placed = [put('s', 'stairs', 2, 0)];
  assert.equal(snapDrop(G, placed, S('block-1x1'), G.x0 + 2.5 * 40).r, 1);
  assert.equal(snapDrop(G, placed, S('block-1x1'), G.x0 + 3.5 * 40).r, 2);
  // Never above maxRows.
  placed = [];
  for (let i = 0; i < 20; i++) drop('block-1x1', 250, 't' + i);
  assert.equal(heightMap(G, placed)[0], G.maxRows);
  assert.equal(snapDrop(G, placed, S('block-1x1'), 250), null);
});

test('gravity: pull a piece out of the middle, the ones above settle down; overlaps pushed up', () => {
  const placed = [put('a', 'block-2x1', 7, 0), put('b', 'block-1x1', 8, 1), put('c', 'block-2x2', 7, 2), put('d', 'roof-triangle', 6, 4)];
  assert.deepEqual(settleGrid(G, placed), [], 'a good tower stays');
  const moves = settleGrid(G, placed.filter((p) => p.id !== 'a'));
  assert.deepEqual(moves.map((mv) => [mv.id, mv.from, mv.r]), [['b', 1, 0], ['c', 2, 1], ['d', 4, 3]]);
  for (const mv of moves) assert.equal(mv.y, G.y - mv.r * 40);
  const over = settleGrid(G, [put('x', 'block-1x1', 3, 0), put('y', 'block-1x1', 3, 0)]);
  assert.deepEqual(over.map((mv) => [mv.id, mv.r]), [['y', 1]], 'two iPads dropping at once: stacked, not merged');
  // Held pieces are left out (skip).
  assert.deepEqual(settleGrid(G, placed, new Set(['a'])).map((mv) => mv.id), ['b', 'c', 'd']);
});

test('tops: flat runs merge, the roof gives its apex only, covered tops vanish; wobbly and towers', () => {
  const placed = [put('a', 'block-2x1', 0, 0), put('b', 'block-1x1', 2, 0)];
  assert.deepEqual(topSurfaces(G, placed).map((t) => [t.x0, t.x1, t.y]), [[230, 350, 840]]);
  const roofed = [put('a', 'block-2x1', 7, 0), put('r', 'roof-triangle', 6, 1)];
  const t = topSurfaces(G, roofed);
  assert.deepEqual(t.map((s) => [s.x0, s.x1, s.y]), [[530, 570, 760]], 'only the apex, and the block under is covered');
  assert.deepEqual(topSurfaces(G, [put('f', 'flag', 3, 0)]), []);
  assert.deepEqual(wobbly(G, [put('a', 'block-1x1', 8, 0), put('p', 'beam', 6, 1)]), ['p'], 'a beam on one block wobbles');
  assert.deepEqual(wobbly(G, [put('a', 'block-2x1', 7, 0), put('p', 'block-2x1', 7, 1)]), []);
  assert.deepEqual(towerOf(roofed, roofed[0]).map((q) => q.id), ['r']);
  assert.equal(restRow([0, 2, 1], 0, S('block-2x1')), 2);
});

test('the room: tiles, zones, surfaces (the deck sorts at its front line), seats', () => {
  const def = siteRoom(m);
  assert.equal(def.id, SITE_ID);
  assert.equal(def.width, 2880);
  assert.deepEqual(def.cameraStops, [0, 700, 1440]);
  assert.equal(zoneCamera(m, 'dig'), 1440);
  assert.ok(def.tiles.length > 4 && def.art.some((a) => a.id === 'piece:potty-door'));
  assert.equal(def.surfaces.find((s) => s.id === 'build-deck').depth, G.y);
  assert.ok(def.seats.some((s) => s.id === 'scaffold-sit'));
  const files = siteFiles(manifest);
  assert.ok(files.length && files.every((f) => typeof f === 'string'));
});

test('pieces: every manifest piece reacts; the toilet door and the lever toggle', () => {
  for (const pid of Object.keys(m.pieces)) assert.ok(PIECES[pid], `${pid} has a reaction`);
  assert.equal(pieceState('potty-door', {}, m.pieces), 'closed');
  assert.equal(nextToggle('potty-door', 'closed'), 'open');
  assert.equal(nextToggle('crane-lever', 'up'), 'down');
  assert.deepEqual(PIECES['potty-door'].then.closed[0], 'flush');
  assert.equal(nextToggle('dump-truck', 'still'), null);
});

test('paint: colours the piece has; rainbow on blocks only; the door keeps its state', () => {
  assert.equal(paintFor(manifest.props['block-1x1'], 'rainbow'), 'rainbow');
  assert.equal(paintFor(manifest.props.plank, 'rainbow'), null);
  assert.equal(paintFor(manifest.props.plank, 'blue'), 'blue');
  assert.equal(paintFor(manifest.props.plank, 'clean'), null);
  assert.equal(pieceLook({ paint: 'blue' }, {}), 'blue');
  assert.equal(pieceLook({}, {}), null);
  assert.equal(pieceLook({ paint: 'red', open: true }, { states: ['closed', 'open'] }), 'open-red');
  assert.equal(pieceLook({ paint: 'natural' }, { states: ['closed', 'open'] }), 'closed');
  for (const look of ['open-red', 'closed']) assert.ok(manifest.props.door.variants[look]);
});

test('first visit seeds the house and bricks on the grid, stock, spawners and tools', () => {
  const store = createStore({ device: 'aaaaaa' });
  const room = normalizeRoom(siteRoom(m));
  const kinds = catalog.kinds;
  const shapeOfKind = (k) => shapeOf(manifest.props[kinds[k].art.sprite].snap, G.cell);
  seedSite(store, room, { grid: G, shapeOfKind });
  const all = inRoom(store.state, SITE_ID);
  assert.equal(all.length, HOTSPOTS.length + PAINT_STOCK.length + STOCK.length + BUILD.length + SITE_ITEMS.length);
  const built = all.filter((e) => kinds[e.kind] && kinds[e.kind].tags.includes('buildpiece'));
  const placed = built.map((e) => { const sh = shapeOfKind(e.kind); return Object.assign({ id: e.id, shape: sh }, cellOf(G, sh, e.x, e.y)); });
  assert.ok(placed.every((p) => p.c != null), 'every seeded piece is on a grid anchor');
  assert.deepEqual(settleGrid(G, placed), [], 'and rests on the height map');
  for (const e of all) assert.ok(kinds[e.kind], `${e.kind} is in the catalog`);
  assert.deepEqual(gridSpot(G, shapeOfKind('door'), 2, 0), { x: G.x0 + 2.5 * 40, y: G.y, z: 1 });
});

test('the catalog: every build piece is a buildpiece with manifest art; spawners give real kinds', () => {
  const kinds = catalog.kinds;
  for (const id of manifest.site.buildPieces) {
    assert.ok(kinds[id], id);
    assert.equal(kinds[id].art.sprite, id);
    assert.ok(kinds[id].behaviors.some((b) => b.use === 'buildpiece'));
    assert.ok(manifest.props[id].snap, `${id} has a snap footprint`);
  }
  for (const [kind] of [...HOTSPOTS, ...STOCK]) {
    const sp = kinds[kind].behaviors.find((b) => b.use === 'spawner');
    assert.ok(sp && sp.kinds.every((k) => kinds[k]), kind);
  }
});
