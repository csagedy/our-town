/* Little Lantern Bakery -- engine
 *
 * Stage, sprites, dragging, effects, sound, saving. Knows nothing about
 * baking; game.js supplies all the rules.
 *
 * The performance shape of this file: there is no animation loop. Nothing
 * runs every frame except while a finger is actually down, and even then the
 * only work per move is writing one `transform` string. Everything else is a
 * CSS animation the compositor owns.
 */
'use strict';

const E = (function () {

  const DATA = JSON.parse(document.getElementById('gamedata').textContent);
  const VIEW = DATA.view;

  /* The floor band of the room currently on screen. Front-elevation rooms
     have no depth, so this strip is where the illusion of depth lives:
     `floor` is the line big furniture stands on, `front` is the near edge,
     and anything between the two is "closer to you". */
  let band = { floor: 637, front: 770, x0: 86, x1: 1114 };
  const NEAR = 0.16;          // how much bigger something gets at the front

  const stage = document.getElementById('stage');
  const stagewrap = document.getElementById('stagewrap');
  const itemLayer = document.getElementById('items');
  const fxLayer = document.getElementById('fx');

  let scale = 1;

  /* ------------------------------------------------------------- stage fit */

  function fit() {
    const pad = 8;
    const availW = stagewrap.clientWidth - pad * 2;
    // leave room for the basket strip and the room tabs
    const availH = stagewrap.clientHeight - 118 - 46;
    scale = Math.min(availW / VIEW.w, availH / VIEW.h);
    scale = Math.max(0.2, Math.min(scale, 1.6));
    stage.style.transform = 'translateY(-16px) scale(' + scale.toFixed(4) + ')';
  }

  /* --------------------------------------------------------- coordinates */

  // Screen (client) -> stage coordinates.
  function toStage(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  function setBand(b) { if (b) band = b; }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /** How far into the floor band a baseline sits: 0 at the wall, 1 at the
   *  near edge. Anything resting on a counter is above the band and reads as
   *  0, which is exactly right -- it is against the wall. */
  function depthOf(y) {
    if (y <= band.floor) return 0;
    return clamp((y - band.floor) / (band.front - band.floor), 0, 1);
  }

  /** The depth cue. Deliberately small: this is a hint, not a projection. */
  function nearScale(t) { return 1 + NEAR * t; }

  function clampToBand(x, y) {
    return { x: clamp(x, band.x0, band.x1),
             y: clamp(y, band.floor, band.front) };
  }

  /* ------------------------------------------------------------- sprites */

  function useSvg(id, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    if (cls) svg.setAttribute('class', cls);
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#s-' + id);
    svg.appendChild(use);
    return svg;
  }

  // An <svg> sized for UI chrome (the basket, bubbles) rather than the stage.
  function icon(id, px) {
    const s = useSvg(id);
    s.setAttribute('width', px); s.setAttribute('height', px);
    return s;
  }

  let uid = 0;
  function newId() { return 't' + (++uid) + '-' + Date.now().toString(36); }

  /**
   * A thing in the world. `spec` is {id,item,x,y,scale,layers,kind,face,...}
   * and is also exactly what gets saved, so the world round-trips for free.
   */
  function makeThing(spec) {
    const el = document.createElement('div');
    el.className = 'thing';
    el.dataset.id = spec.id;
    el.dataset.item = spec.item;
    el.dataset.kind = spec.kind || '';
    el.appendChild(useSvg(spec.icon || spec.item));
    if (spec.face) { el.classList.add('stacked'); el.appendChild(useSvg(spec.face)); }
    if (spec.layers) {
      el.classList.add('stacked');
      spec.layers.forEach(function (l) { el.appendChild(useSvg(l)); });
    }
    el.__spec = spec;
    place(el, spec.x, spec.y);
    itemLayer.appendChild(el);
    return el;
  }

  function place(el, x, y) {
    const s = el.__spec;
    s.x = x; s.y = y;
    const k = (s.scale || 1) * nearScale(depthOf(y));
    // characters stand with their feet at y=93 in sprite units; objects sit a
    // little higher because they are drawn with a contact shadow under them
    const anchor = s.kind === 'character' ? 93 : 87;
    const sx = (s.flip ? -k : k);
    const t = 'translate3d(' + (x - 50 * k).toFixed(1) + 'px,' +
      (y - anchor * k).toFixed(1) + 'px,0) scale(' + sx.toFixed(3) + ',' +
      k.toFixed(3) + ')';
    el.style.setProperty('--t', t);
    el.style.transform = t;
    // y alone gives correct ordering in elevation: things further down the
    // floor band are nearer the viewer, things on counters are further back
    el.style.zIndex = Math.round(y) + (s.z || 0);
  }

  function rebuildLayers(el) {
    const s = el.__spec;
    while (el.childNodes.length) el.removeChild(el.firstChild);
    el.appendChild(useSvg(s.icon || s.item));
    if (s.face) el.appendChild(useSvg(s.face));
    (s.layers || []).forEach(function (l) { el.appendChild(useSvg(l)); });
    el.classList.toggle('stacked', !!(s.face || (s.layers && s.layers.length)));
  }

  function removeThing(el, animate) {
    if (!animate) { el.remove(); return Promise.resolve(); }
    el.classList.add('leaving');
    return new Promise(function (res) {
      setTimeout(function () { el.remove(); res(); }, 500);
    });
  }

  function pop(el) {
    el.classList.remove('pop');
    void el.offsetWidth;          // restart the animation
    el.classList.add('pop');
  }

  function glide(el, x, y, ms) {
    return new Promise(function (res) {
      el.style.transition = 'transform ' + ms + 'ms cubic-bezier(.4,0,.3,1)';
      place(el, x, y);
      setTimeout(function () { el.style.transition = ''; res(); }, ms);
    });
  }

  /* -------------------------------------------------------------- drag */

  let drag = null;
  const dropHandlers = [];       // fn(el, stageX, stageY) -> true if consumed
  let onTap = function () { };

  function registerDrop(fn) { dropHandlers.push(fn); }
  function setTapHandler(fn) { onTap = fn; }

  function beginDrag(el, ev) {
    if (drag) return;
    const p = toStage(ev.clientX, ev.clientY);
    drag = {
      el: el,
      dx: p.x - el.__spec.x,
      dy: p.y - el.__spec.y,
      moved: 0,
      startX: p.x, startY: p.y,
      homeX: el.__spec.x, homeY: el.__spec.y,
      cx: ev.clientX, cy: ev.clientY
    };
    el.classList.add('dragging');
    el.classList.remove('bob');
    try { el.setPointerCapture(ev.pointerId); } catch (e) { }
    ev.preventDefault();
  }

  function moveDrag(ev) {
    if (!drag) return;
    const p = toStage(ev.clientX, ev.clientY);
    drag.moved = Math.max(drag.moved,
      Math.abs(p.x - drag.startX) + Math.abs(p.y - drag.startY));
    drag.cx = ev.clientX; drag.cy = ev.clientY;
    place(drag.el, p.x - drag.dx, p.y - drag.dy);
    ev.preventDefault();
  }

  function endDrag(ev) {
    if (!drag) return;
    const d = drag; drag = null;
    d.el.classList.remove('dragging');
    if (d.moved < 6) {
      place(d.el, d.homeX, d.homeY);
      onTap(d.el);
      return;
    }
    const s = d.el.__spec;
    for (let i = 0; i < dropHandlers.length; i++) {
      if (dropHandlers[i](d.el, s.x, s.y, d.cx, d.cy)) return;
    }
    const c = clampToBand(s.x, s.y);
    place(d.el, c.x, c.y);
    save.queue();
  }

  itemLayer.addEventListener('pointerdown', function (ev) {
    const el = ev.target.closest('.thing');
    if (el) beginDrag(el, ev);
  });
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  function draggingEl() { return drag ? drag.el : null; }

  /** Create a thing under the pointer and start dragging it immediately.
   *  This is what makes the basket feel like a basket rather than a menu. */
  function startDragNew(spec, ev) {
    const p = toStage(ev.clientX, ev.clientY);
    spec.x = p.x; spec.y = p.y;
    const el = makeThing(spec);
    beginDrag(el, ev);
    return el;
  }

  /* ---------------------------------------------------------------- fx */

  function sparkle(x, y, n, tint) {
    n = n || 8;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'spark';
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = 26 + Math.random() * 44;
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', (Math.cos(a) * d).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.sin(a) * d - 14).toFixed(0) + 'px');
      s.innerHTML = '<svg viewBox="0 0 20 20"><path d="M10 1 L12 8 L19 10 ' +
        'L12 12 L10 19 L8 12 L1 10 L8 8 Z" fill="' +
        (tint || DATA.palette.yellow) + '"/></svg>';
      s.classList.add('fly');
      fxLayer.appendChild(s);
      setTimeout(function () { s.remove(); }, 950);
    }
  }

  function hearts(x, y, n) {
    n = n || 5;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'spark fly';
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.setProperty('--dx', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
      s.style.setProperty('--dy', (-50 - Math.random() * 50).toFixed(0) + 'px');
      s.style.animationDelay = (i * 90) + 'ms';
      s.innerHTML = '<svg viewBox="0 0 20 20"><path d="M10 17 C2 11 3 5 7 5 ' +
        'C9 5 10 7 10 7 C10 7 11 5 13 5 C17 5 18 11 10 17 Z" fill="' +
        DATA.palette.coral + '"/></svg>';
      fxLayer.appendChild(s);
      setTimeout(function () { s.remove(); }, 1100 + i * 90);
    }
  }

  function steam(x, y, n) {
    const held = [];
    for (let i = 0; i < (n || 3); i++) {
      const s = document.createElement('div');
      s.className = 'steamline';
      s.style.left = (x + (i - 1) * 13) + 'px';
      s.style.top = y + 'px';
      s.style.animationDelay = (i * 480) + 'ms';
      fxLayer.appendChild(s);
      held.push(s);
    }
    return function () { held.forEach(function (s) { s.remove(); }); };
  }

  function bubble(x, y, html, ms, cls) {
    const b = document.createElement('div');
    b.className = 'bubble' + (cls ? ' ' + cls : '');
    b.innerHTML = html;
    b.style.left = '0px'; b.style.top = '0px';
    fxLayer.appendChild(b);
    // measure, then centre above the point
    const w = b.offsetWidth, h = b.offsetHeight;
    b.style.left = Math.max(6, Math.min(VIEW.w - w - 6, x - w / 2)) + 'px';
    b.style.top = Math.max(6, y - h - 18) + 'px';
    let gone = false;
    function close() {
      if (gone) return; gone = true;
      b.classList.add('out');
      setTimeout(function () { b.remove(); }, 260);
    }
    if (ms) setTimeout(close, ms);
    return close;
  }

  function label(x, y, text, ms) {
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = text;
    fxLayer.appendChild(l);
    const w = l.offsetWidth;
    l.style.left = Math.max(4, Math.min(VIEW.w - w - 4, x - w / 2)) + 'px';
    l.style.top = (y - 26) + 'px';
    setTimeout(function () { l.remove(); }, ms || 1500);
    return l;
  }

  /* ------------------------------------------------------------- sound
   * Generated, not sampled: no audio files to load, nothing to go missing,
   * and every tone is a soft sine with a slow attack. Off by default -- this
   * game is built for a kid who does not enjoy being startled.
   */

  let ac = null, soundOn = false;

  function setSound(on) {
    soundOn = !!on;
    if (soundOn && !ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ac = null; soundOn = false; }
    }
    if (soundOn && ac && ac.state === 'suspended') ac.resume();
  }

  function tone(freq, dur, vol, type) {
    if (!soundOn || !ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const t = ac.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.06, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.25));
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + (dur || 0.25) + 0.05);
  }

  const SFX = {
    pick: function () { tone(660, 0.16, 0.05); },
    drop: function () { tone(400, 0.14, 0.04); },
    mix: function () { tone(330, 0.5, 0.045, 'triangle'); },
    ding: function () { tone(880, 0.5, 0.05); setTimeout(function () { tone(1320, 0.5, 0.035); }, 90); },
    happy: function () { tone(523, 0.2, 0.05); setTimeout(function () { tone(784, 0.3, 0.045); }, 120); },
    pop: function () { tone(740, 0.12, 0.04, 'triangle'); }
  };

  /* ------------------------------------------------------------- storage */

  const KEY = 'little-lantern-bakery-v2';
  const save = {
    getState: function () { return {}; },   // game.js replaces this
    queue: function () {
      clearTimeout(save._t);
      save._t = setTimeout(save.now, 700);
    },
    now: function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(save.getState()));
      } catch (e) { /* private mode, a full disk -- play on regardless */ }
    },
    load: function () {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { }
    }
  };

  /* --------------------------------------------------------------- misc */

  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function chance(p) { return Math.random() < p; }

  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', function () {
    setTimeout(fit, 150);
  });

  return {
    DATA: DATA, VIEW: VIEW, stage: stage, itemLayer: itemLayer, fxLayer: fxLayer,
    fit: fit, toStage: toStage, setBand: setBand, band: function () { return band; },
    clampToBand: clampToBand, depthOf: depthOf, nearScale: nearScale,
    clamp: clamp,
    useSvg: useSvg, icon: icon, newId: newId,
    makeThing: makeThing, place: place, rebuildLayers: rebuildLayers,
    removeThing: removeThing, pop: pop, glide: glide,
    registerDrop: registerDrop, setTapHandler: setTapHandler,
    draggingEl: draggingEl, startDragNew: startDragNew,
    sparkle: sparkle, hearts: hearts, steam: steam, bubble: bubble, label: label,
    setSound: setSound, SFX: SFX, save: save,
    pick: pick, chance: chance
  };
})();
