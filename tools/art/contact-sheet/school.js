// School panels of the art contact sheet (P2d.1), imported by index.html.
// Composes the shipped school strip (layers + pieces from the manifest) with
// props and live rig characters, the same way the cafe and site panels do.
export function schoolSheet({ manifest, rig, cast, P, A, held, placed, propImg, cell }) {
  const room = manifest.rooms.school, c = room.canvas, o = [c.x, c.y];
  const surf = Object.fromEntries(room.surfaces.map((s) => [s.id, s]));
  const seat = Object.fromEntries(room.seats.map((s) => [s.id, s]));
  const slot = Object.fromEntries(room.slots.map((s) => [s.id, s]));
  const img = (file, x, y, w, h, extra = '') => `<img src="${A + file}" style="left:${x - c.x}px;top:${y - c.y}px;width:${w}px;height:${h}px;${extra}">`;
  const wearAs = (id, extra = {}) => { const b = cast[id]; return Object.assign({}, b, { wear: Object.assign({}, b.wear, extra.wear), colors: Object.assign({}, b.colors, extra.colors) }); };
  const on = (id, v, sid, dx = 0) => { const s = surf[sid]; return propImg(id, v, (s.x0 + s.x1) / 2 + dx, s.y, o); };
  const at = (id, v, sl, dx = 0, dy = 0) => propImg(id, v, slot[sl].at[0] + dx, slot[sl].at[1] + dy, o);
  const hang = (id, v, sl) => { const g = P[id].grip; return propImg(id, v, slot[sl].at[0] - g[0], slot[sl].at[1] - g[1], o); };
  const sit = (spec, pose, expr, sid, extra = {}) => placed(spec, Object.assign({ pose, expr, anchor: 'seat' }, extra), seat[sid].at[0], seat[sid].at[1], o);
  const ALT = { 'front-door': 'open', 'bus-door': 'open', 'school-bell': 'ring', 'sink-tap': 'on', 'light-switch': 'off', 'weather-today': 'rain', 'class-window': 'rain', 'fish-bowl': 'fed', seesaw: 'left' };
  const DAY = { 'front-door': 'open', 'bus-door': 'open', 'weather-today': 'sun', 'class-window': 'sun', 'fish-bowl': 'swim-b', seesaw: 'right' };

  /** The strip: states = piece variants; people = true adds the "day at school" cast. */
  function scene(states, zoom, clip = null, people = false, noZones = false) {
    const after = { back: '', counter: '', mid: '', front: '' };
    for (const [id, pc] of Object.entries(room.pieces)) {
      const v = pc.variants[states[id] || pc.default] || pc.variants[pc.default];
      let extra = '';
      if (id === 'sand' && people) {
        // two dug holes (the engine does this with the dig-mask canvas), a toy beneath
        after.mid += at('rubber-duck', null, 'treasure-2');
        const hole = (s) => { const [x, y] = slot[s].at; return `radial-gradient(ellipse 40px 22px at ${x - pc.x}px ${y - 12 - pc.y}px, transparent 96%, #000 100%)`; };
        const m = ['treasure-2', 'treasure-4'].map(hole).join(',');
        extra = `-webkit-mask-image:${m};mask-image:${m};-webkit-mask-composite:source-in;mask-composite:intersect;`;
      }
      after[pc.layer] += img(v.file, pc.x, pc.y, pc.w, pc.h, extra);
    }
    // stock that is always around: cubby bags and lunchboxes, shelf props, table supplies
    const bags = ['teal', 'rose', 'butter', 'lav', 'sage', 'orange'];
    [0, 2, 3, 5].forEach((i) => { after.counter += hang('school-backpack', bags[i], `hook-${i + 1}`); });
    [1, 2, 4].forEach((i) => { after.counter += on('school-lunchbox', 'closed', `cubby-${i + 1}-shelf`); });
    after.counter += on('globe', 'still', 'book-shelf', 60) + on('hand-bell', 'still', 'block-shelf', 94) + on('picture-book', 'closed-blue', 'cubby-top', -120);
    after.back += on('marker', 'blue', 'whiteboard-tray', -60) + on('marker', 'red', 'whiteboard-tray', -10) + on('stamp', 'star', 'whiteboard-tray', 60);
    after.mid += on('paint-cup', 'red', 'easel-tray', -50) + on('paint-cup', 'yellow', 'easel-tray', -14) + on('paint-cup', 'blue', 'easel-tray', 22) + on('paint-cup', 'green', 'easel-tray', 56);
    after.front += on('crayon-box', 'open', 'kid-table', -70) + on('paper-sheet', 'drawing', 'kid-table', 10) + on('crayon', 'blue', 'kid-table', 70);
    after.counter += on('nap-blanket', 'folded', 'cot-stack', -10);
    after.back += on('weather-card', 'snow', 'window-sill', 70);
    if (people) {
      // ARRIVAL: mom waves at the door, kids with backpacks, the calm corner
      after.mid += placed(cast.grownup, { pose: 'wave', expr: 'happy' }, 420, 890, o);
      after.mid += placed(wearAs('boy5', { wear: { back: 'school-backpack' } }), { pose: 'walk-a', expr: 'happy', held: { R: held('school-lunchbox', 'closed') } }, 560, 900, o);
      after.counter += placed(wearAs('girl5', { wear: { back: 'school-backpack' }, colors: { back: '#E9AFAE', 'back-sh': '#D48C8E', 'back-2': '#FBF3E8' } }), { pose: 'wave2', expr: 'laughing' }, 790, 820, o);
      after.counter += sit(cast.boy9, 'sit', 'neutral', 'beanbag', { held: { R: held('plush-bunny') } });
      after.counter += placed(cast.grandma, { pose: 'hold', expr: 'happy', held: { R: held('milk-carton', 'closed') } }, 700, 780, o);
      // CLASSROOM: circle time, the teacher in the rocking chair, painting at the easel
      after.mid += sit(wearAs('teacher', { wear: { over: 'lanyard' } }), 'sit', 'happy', 'rocking-chair', { pose: Object.assign({}, rig.poses.sit, { armR: [70, -60, 0] }), held: { R: held('picture-book', 'open') } });
      after.counter += sit(wearAs('girl5', { wear: { hat: null } }), 'sit-cross', 'happy', 'rug-2') + sit(cast.boy5, 'sit-cross', 'laughing', 'rug-3')
        + sit(cast.performer, 'sit-cross', 'surprised', 'rug-4') + sit(wearAs('boy9', { wear: { back: 'school-backpack' } }), 'sit-cross', 'happy', 'rug-6');
      after.mid += placed(wearAs('girl9', { wear: { over: 'smock' } }), { pose: 'hold', expr: 'yum', held: { R: held('paint-cup', 'pink') } }, 1290, 930, o);
      after.mid += sit(wearAs('grandpa'), 'sit', 'happy', 'chair-2', { held: { R: held('crayon', 'green') } });
      // RECESS + LUNCH: lunch on the bench, the slide, a swing, the sandbox, the seesaw
      after.mid += on('lunch-tray', 'lunch', 'lunch-table', -70) + on('milk-carton', 'open', 'lunch-table', 10) + on('school-lunchbox', 'open', 'lunch-table', 80);
      after.counter += sit(cast.girl9, 'sit-eat', 'yum', 'lunch-bench-1', { held: { R: held('apple', 'bite1') } }) + sit(wearAs('boy5', { wear: { hat: 'sun-hat' } }), 'sit', 'happy', 'lunch-bench-3', { held: { R: held('juice-box', 'full') } });
      const sp = room.rigs.slide.path[4];
      after.counter += placed(cast.girl5, { pose: 'sit', expr: 'wheee', anchor: 'seat' }, sp[0], sp[1] + 4, o);
      after.counter += sit(cast.boy9, 'sit', 'laughing', 'swing-1');
      after.mid += placed(wearAs('builder', { wear: { hat: 'sun-hat', over: null } }), { pose: 'wave', expr: 'happy', held: { R: held('hand-bell', 'ring') } }, 2530, 880, o);
      after.mid += sit(cast.performer, 'sit', 'wheee', 'seesaw-l') + sit(cast.boy5, 'sit', 'laughing', 'seesaw-r');
      after.mid += on('sand-castle', null, 'sandbox', -60) + on('sand-pail', 'full', 'sandbox', 60) + propImg('spade', null, 2370, 925, o);
      after.front += propImg('playground-ball', null, 2980, 985, o) + propImg('jump-rope', 'coiled', 2860, 990, o) + propImg('chalk', 'pink', 3080, 975, o);
    } else {
      after.mid += on('lunch-tray', 'empty', 'lunch-table', -40);
    }
    const html = room.layers.map((L) => img(L.file, L.x, L.y, L.w, L.h) + (after[L.id] || '')).join('');
    const zones = room.zones.map((z) => `<div style="left:${z.camera - c.x}px;top:${-c.y}px;width:1440px;height:1000px;outline:4px dashed rgba(61,44,41,.3)"></div>`).join('');
    const clipStyle = clip != null ? 'width:1440px;height:1000px;' : `width:${c.w}px;height:${c.h}px;`;
    const inner = `<div class="room" style="width:${c.w}px;height:${c.h}px;${clip != null ? `margin-left:${-(clip - c.x)}px;margin-top:${c.y}px;` : ''}">${html}${clip != null || noZones ? '' : zones}</div>`;
    return `<div class="room" style="${clipStyle}zoom:${zoom};margin:0 8px 8px 0;display:${clip != null ? 'block' : 'inline-block'};position:relative;contain:paint">${inner}</div>`;
  }
  document.getElementById('school-view').innerHTML = scene({}, 1550 / c.w) + scene(ALT, 1550 / c.w);
  document.getElementById('school-zone-view').innerHTML = room.zones.map((z) => scene(ALT, 1, z.camera)).join('');
  // weather: the board slot and the window, every weather side by side (a crop of the classroom wall)
  const wx = ['sun', 'cloud', 'rain', 'snow'].map((w) => `<div style="display:inline-block;width:560px;height:330px;overflow:hidden;position:relative;margin:0 8px 8px 0">
    <div style="position:absolute;left:-${1170 - c.x}px;top:-${150 - c.y}px">${scene({ 'weather-today': w, 'class-window': w }, 1, null, false, true)}</div></div>`).join('');
  document.getElementById('school-weather-view').innerHTML = wx;
  document.getElementById('school-day-view').innerHTML = room.zones.map((z) => scene(DAY, 1, z.camera, true)).join('');
  let h = '';
  for (const [id, p] of Object.entries(P)) if (p.set === 'school') for (const vn of Object.keys(p.variants)) h += cell(id, vn, 1.25);
  document.getElementById('school-prop-row').innerHTML = h;
}
