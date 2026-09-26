// P2b.1: the theater strip's pure parts (src/scenes/theater.js): the room
// definition, piece reactions and hit boxes, the curtain steps, the stage
// test, the first-visit seed and its catalog kinds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  theaterRoom, copyIds, PIECES, HIT, hitBox, pieceState, pieceVariant, curtainStep, curtainDrag, onStage, audienceSeat,
  seedTheater, HOTSPOTS, RACKS, THEATER_ID, CURTAIN, rackSpot,
} from '../../src/scenes/theater.js';
import { normalizeRoom } from '../../src/engine/surfaces.js';
import { createCatalog } from '../../src/core/catalog.js';

const manifest = JSON.parse(readFileSync(new URL('../../assets/art-manifest.json', import.meta.url)));
const catalogJson = JSON.parse(readFileSync(new URL('../../data/catalog.json', import.meta.url)));
const rig = JSON.parse(readFileSync(new URL('../../assets/characters/rig.json', import.meta.url)));
const m = manifest.rooms.theater;

test('the room: tiles, zones, pieces (the spotlight at its three copies), the rope target', () => {
  const def = theaterRoom(m);
  assert.equal(def.id, THEATER_ID);
  assert.equal(def.width, 2880);
  assert.deepEqual(def.cameraStops, [0, 736, 1440]);
  assert.ok(def.tiles.length >= 20);
  const ids = def.art.map((a) => a.id);
  for (const pid of Object.keys(m.pieces)) for (const id of copyIds(pid, m.pieces[pid])) assert.ok(ids.includes(id), id);
  assert.equal(ids.filter((id) => id.indexOf('piece:spotlight') === 0).length, 3);
  assert.ok(ids.includes('hit:curtain-rope'));
  assert.ok(def.surfaces.some((s) => s.id === 'stage'));
  assert.ok(def.seats.some((s) => s.id === 'seat-A1'));
});

test('pieces: every manifest piece reacts; hit boxes lie inside the piece; the poster shows its pictures', () => {
  for (const pid of Object.keys(m.pieces)) {
    assert.ok(PIECES[pid], `${pid} has a reaction`);
    const p = m.pieces[pid];
    for (const v of Object.keys(p.variants)) {
      const b = hitBox(pid, p, v);
      assert.ok(b[0] >= -1 && b[1] >= -1 && b[0] + b[2] <= p.w + 1 && b[1] + b[3] <= p.h + 1, `${pid}:${v} hit ${b} in ${p.w}x${p.h}`);
    }
  }
  for (const pid of Object.keys(HIT)) assert.ok(m.pieces[pid], pid);
  // An open curtain half is touched only where it is gathered.
  assert.ok(hitBox('curtain-left', m.pieces['curtain-left'], 'open')[2] < 200);
  assert.equal(pieceVariant('poster', {}, m.pieces), 'pictures');
  assert.equal(pieceState('curtain-right', { curtain: 'closed' }, m.pieces), 'closed');
  assert.equal(pieceState('valance', { curtain: 'nope' }, m.pieces), 'open');
});

test('the curtain: the rope ping-pongs open -> half -> closed -> half -> open; drags step by distance', () => {
  let s = { state: 'open', dir: 1 };
  const seen = [];
  for (let i = 0; i < 4; i++) { s = curtainStep(s.state, s.dir); seen.push(s.state); }
  assert.deepEqual(seen, ['half', 'closed', 'half', 'open']);
  assert.equal(curtainDrag('closed', -330), 'open');
  assert.equal(curtainDrag('open', 140), 'half');
  assert.equal(curtainDrag('open', 30), 'open');
  assert.equal(curtainDrag('half', 999), 'closed');
  assert.deepEqual(CURTAIN, m.rigs.curtain.states);
});

test('on the stage: standing on the deck inside the proscenium; not seated, not in the pit', () => {
  const st = m.rigs.stage;
  assert.ok(onStage({ x: 1400, y: 805, props: {} }, st));
  assert.ok(!onStage({ x: 1400, y: 900, props: {} }, st), 'the pit');
  assert.ok(!onStage({ x: 600, y: 805, props: {} }, st), 'backstage');
  assert.ok(!onStage({ x: 1400, y: 805, props: { seat: 'piano-bench' } }, st));
  assert.ok(audienceSeat('seat-B2') && audienceSeat('balcony-1') && !audienceSeat('piano-bench'));
});

test('first visit: hot spots, the racks full of costumes and the loose things, all real catalog kinds', () => {
  const catalog = createCatalog(catalogJson, manifest);
  const ops = [];
  let n = 0;
  const store = { newId: () => 'id' + (n++), dispatch: (op, args) => { ops.push([op, args]); return true; } };
  const room = normalizeRoom(theaterRoom(m));
  seedTheater(store, room, m, { catalog });
  const kinds = ops.map(([, a]) => a.kind);
  for (const [k] of HOTSPOTS) assert.ok(kinds.includes(k), k);
  for (const [, list] of RACKS) for (const k of list) assert.ok(kinds.includes(k), k);
  for (const k of kinds) assert.ok(catalog.has(k), `${k} is in the catalog`);
  // Rack costumes hang inside their rack's box.
  for (const [rid, list] of RACKS) {
    const box = m.spawners.find((s) => s.id === rid).box;
    list.forEach((k, i) => { const at = rackSpot(box, i, list.length, catalog.sprite(k)); assert.ok(at.x >= box[0] && at.x <= box[0] + box[2], `${k} x`); });
  }
});

test('the catalog: the 19 costume pieces are rig wear kinds with theater art; spawners give real kinds', () => {
  const k = catalogJson.kinds;
  const costumes = ['gown', 'royal-coat', 'knight-tunic', 'pirate-coat', 'star-dress', 'tuxedo', 'fairy-tutu', 'wizard-robe', 'pirate-hat', 'wizard-hat',
    'top-hat', 'tiara', 'cat-ears', 'bunny-ears', 'lion-mane', 'masquerade', 'sparkle-mask', 'feather-boa', 'lightning-cape'];
  for (const c of costumes) {
    assert.ok(k[c], c);
    assert.ok(rig.wear[c], `${c} is a rig wear piece`);
    assert.ok(k[c].tags.includes('wearable:' + rig.wear[c].slot), `${c} slot`);
    assert.ok(manifest.props[k[c].art.sprite], `${c} art`);
    assert.equal(manifest.props[k[c].art.sprite].wear.piece, c);
  }
  for (const [id, e] of Object.entries(k)) {
    for (const b of e.behaviors || []) if (b.use === 'spawner') for (const s of b.kinds) assert.ok(k[s], `${id} gives ${s}`);
    if (e.home && e.home.room && e.home.room.indexOf('theater') === 0) assert.equal(e.home.room, THEATER_ID, `${id} goes home to the theater strip`);
  }
  for (const s of ['wand', 'foam-sword', 'bouquet', 'microphone', 'top-hat', 'masquerade', 'crown', 'popcorn', 'lemonade-cup', 'ticket', 'rose']) assert.ok(k[s], s);
});
