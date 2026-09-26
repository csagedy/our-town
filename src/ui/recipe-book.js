// The recipe book (P2a.4, docs/design.md 3.1 + 4): a picture book that opens
// over the cafe when the recipe-book prop on the kitchen shelf is tapped.
// Every page shows picture recipes: the ingredients (in the state the recipe
// wants: toast, chopped lettuce, a fried egg), where they go (a plate, the
// pot, the oven, the tray, the blender), an arrow, and the dish. No text is
// needed: a dish a kid has made has a gold star sticker and full colour;
// one not made yet is a dark silhouette with a question mark, so there is
// always something to go and find. With the text layer on (parent menu),
// Zoe also sees each dish's name (tap it to hear it).
//
//   const book = createRecipeBook({ host, input, sfx, recipes, spriteOf, stationIcon, found, say });
//   book.open(page?)  book.close()  book.turn(+1|-1)  book.isOpen()  book.page()  book.pages()
//   book.refresh()    (discoveries changed)   book.destroy()
//
// DOM in screen space over the stage (like the pocket tray), big touch
// targets (arrows and the close button at least 64 pt), transform/opacity
// animations only, nothing running while it is closed.

import * as tween from '../engine/tween.js';

export const PER_PAGE = 2;        // recipes per page; a spread is two pages
export const PER_SPREAD = PER_PAGE * 2;

const STAR = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2.5 L25.2 13.6 L37.4 15 L28.3 23.3 L30.8 35.4 L20 29.3 L9.2 35.4 L11.7 23.3 L2.6 15 L14.8 13.6 Z" fill="#F7C948" stroke="#3D2C29" stroke-width="2.6" stroke-linejoin="round"/><path d="M14 15.5 L18 14.8" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ARROW = (dir) => `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="${dir > 0 ? 'M22 14 L40 30 L22 46' : 'M38 14 L20 30 L38 46'}" fill="none" stroke="#3D2C29" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CLOSE = '<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M18 18 L42 42 M42 18 L18 42" fill="none" stroke="#3D2C29" stroke-width="7" stroke-linecap="round"/></svg>';
const MAKES = '<svg viewBox="0 0 60 40" aria-hidden="true"><path d="M6 20 H44" stroke="#C9A06A" stroke-width="6" stroke-linecap="round"/><path d="M36 9 L52 20 L36 31" fill="none" stroke="#C9A06A" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLUS = '<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 7 V23 M7 15 H23" stroke="#C9A06A" stroke-width="4.5" stroke-linecap="round"/></svg>';
const QUESTION = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#FFFDF6" stroke="#3D2C29" stroke-width="2.6"/><path d="M14.5 15.5 C14.5 11.5 17.2 9.6 20.3 9.6 C23.6 9.6 26 11.8 26 14.8 C26 18.9 20.6 19.4 20.6 23.6" fill="none" stroke="#3D2C29" stroke-width="3.4" stroke-linecap="round"/><circle cx="20.6" cy="29.4" r="2.3" fill="#3D2C29"/></svg>';

const CSS = `
.rbook{position:absolute;inset:0;z-index:60;display:none;touch-action:none;-webkit-user-select:none;user-select:none}
.rbook.is-open{display:block}
.rbook-dim{position:absolute;inset:0;background:rgba(61,44,41,.5);opacity:0;transition:opacity .25s}
.rbook.is-shown .rbook-dim{opacity:1}
.rbook-book{position:absolute;left:50%;top:50%;width:min(86vw,150vh);height:min(78vh,56vw);transform:translate(-50%,-46%) scale(.86);opacity:0;transition:transform .28s cubic-bezier(.34,1.4,.64,1),opacity .2s;
  background:#C9695F;border:.6vmin solid #3D2C29;border-radius:3vmin;box-shadow:0 1.6vmin 0 rgba(61,44,41,.35);padding:1.6vmin;box-sizing:border-box;display:flex;gap:0}
.rbook.is-shown .rbook-book{transform:translate(-50%,-50%) scale(1);opacity:1}
.rbook-page{flex:1;background:#FBF3E8;border:.4vmin solid #3D2C29;display:flex;flex-direction:column;justify-content:space-around;padding:1.4vmin 1.6vmin;box-sizing:border-box;position:relative;overflow:hidden}
.rbook-page.l{border-radius:2vmin .4vmin .4vmin 2vmin;border-right-width:.2vmin;background:linear-gradient(90deg,#FBF3E8 88%,#EAD9C2)}
.rbook-page.r{border-radius:.4vmin 2vmin 2vmin .4vmin;border-left-width:.2vmin;background:linear-gradient(270deg,#FBF3E8 88%,#EAD9C2)}
.rbook-turn .rbook-page{animation:rbook-flip .32s ease-out}
@keyframes rbook-flip{0%{opacity:.2;transform:translateX(var(--rb-dx,0))}100%{opacity:1;transform:none}}
.rbook-row{position:relative;display:flex;align-items:center;justify-content:center;gap:1vmin;height:44%;border-bottom:.3vmin dashed #E2C9A8}
.rbook-row:last-child{border-bottom:0}
.rbook-row.is-empty{visibility:hidden}
.rbook-ings{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.4vmin;max-width:46%}
.rbook-ico{position:relative;width:10vmin;height:10vmin;flex:none}
.rbook-ico.small{width:8.5vmin;height:8.5vmin}
.rbook-ico .rb-spr{position:absolute;left:50%;top:50%;transform-origin:50% 50%}
.rbook-ico img{position:absolute;display:block;pointer-events:none}
.rbook-plus{width:3vmin;height:3vmin;flex:none}
.rbook-at{width:9vmin;height:9vmin;border-radius:50%;background:#F4E6D2;border:.3vmin solid #E2C9A8}
.rbook-makes{width:6vmin;height:4vmin;flex:none}
.rbook-dish{position:relative;width:17vmin;height:17vmin;flex:none;border-radius:50%;background:#FFFDF6;border:.45vmin solid #3D2C29}
.rbook-dish .rbook-ico{position:absolute;inset:6%;width:auto;height:auto}
.rbook-dish.is-hidden .rbook-ico img{filter:brightness(0) opacity(.22)!important}
.rbook-q{position:absolute;right:-1.2vmin;top:-1.2vmin;width:7vmin;height:7vmin;display:none}
.rbook-dish.is-hidden .rbook-q{display:block}
.rbook-star{position:absolute;right:-1.8vmin;top:-1.8vmin;width:8vmin;height:8vmin;display:none;transform:rotate(12deg)}
.rbook-dish.is-found .rbook-star{display:block}
.rbook-dish.is-new .rbook-star{animation:rbook-pop .6s cubic-bezier(.34,1.8,.64,1)}
@keyframes rbook-pop{0%{transform:scale(0) rotate(-90deg)}100%{transform:scale(1) rotate(12deg)}}
.rbook-name{position:absolute;left:-6vmin;right:-6vmin;top:100%;margin-top:.6vmin;text-align:center;font:600 2.3vmin/1.1 ui-rounded,"SF Pro Rounded",system-ui,sans-serif;color:#3D2C29;display:none}
body.text-layer .rbook-name{display:block}
.rbook-btn{position:absolute;width:12vmin;height:12vmin;min-width:64px;min-height:64px;border-radius:50%;background:#FFE9A8;border:.5vmin solid #3D2C29;box-shadow:0 .8vmin 0 rgba(61,44,41,.3);box-sizing:border-box}
.rbook-btn svg{position:absolute;inset:14%;width:72%;height:72%}
.rbook-prev{left:1.5vmin;top:50%;margin-top:-6vmin}
.rbook-next{right:1.5vmin;top:50%;margin-top:-6vmin}
.rbook-close{right:1.5vmin;top:1.5vmin;background:#FBF3E8}
.rbook-btn.is-off{opacity:.35}
.rbook-dots{position:absolute;left:50%;bottom:2.2vmin;transform:translateX(-50%);display:flex;gap:1vmin;z-index:2}
.rbook-dots i{width:1.6vmin;height:1.6vmin;border-radius:50%;background:#E2C9A8;border:.25vmin solid #3D2C29}
.rbook-dots i.on{background:#F7C948}
`;

function ensureCss() {
  if (document.getElementById('rbook-css')) return;
  const st = document.createElement('style');
  st.id = 'rbook-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/** Paint a sprite ({draw:'img', src, w, h, img, overlays, filter} or a plain {src, w, h}) into an icon box. */
export function paintIcon(box, sprite) {
  box.textContent = '';
  if (!sprite || !sprite.src) return;
  const w = sprite.w || (sprite.img && sprite.img.w) || 60;
  const h = sprite.img ? Math.max(sprite.h, sprite.img.top + sprite.img.h) : sprite.h || 60;
  const inner = document.createElement('div');
  inner.className = 'rb-spr';
  inner.style.width = `${w}px`;
  inner.style.height = `${h}px`;
  const im = sprite.img || { left: 0, top: 0, w, h };
  let top = Math.min(0, im.top);
  let bottom = Math.max(h, im.top + im.h);
  for (const o of sprite.overlays || []) { top = Math.min(top, o.top); bottom = Math.max(bottom, o.top + o.h); }
  const add = (src, L, T, W, H, filter, rot) => {
    const i = document.createElement('img');
    i.src = src;
    i.alt = '';
    i.draggable = false;
    i.style.cssText = `left:${L}px;top:${T - top}px;width:${W}px;height:${H}px` + (filter ? `;filter:${filter}` : '') + (rot ? `;transform:rotate(${rot}deg)` : '');
    inner.appendChild(i);
  };
  add(sprite.src, im.left, im.top, im.w, im.h, sprite.filter, im.rot);
  for (const o of sprite.overlays || []) add(o.src || sprite.src, o.left, o.top, o.w, o.h, o.filter, o.rot);
  const H = bottom - top;
  inner.style.height = `${H}px`;
  box.appendChild(inner);
  // Fit into the box once it has a size (the book is laid out when shown).
  inner.dataset.w = String(w);
  inner.dataset.h = String(H);
}

function fitIcons(root) {
  for (const inner of root.querySelectorAll('.rb-spr')) {
    const box = inner.parentNode;
    const bw = box.clientWidth || 60;
    const bh = box.clientHeight || 60;
    const w = Number(inner.dataset.w) || 60;
    const h = Number(inner.dataset.h) || 60;
    const k = Math.min(bw / w, bh / h) * 0.94;
    inner.style.transform = `translate(-50%, -50%) scale(${Math.round(k * 1000) / 1000})`;
  }
}

export function createRecipeBook({ host, input, sfx = null, recipes, spriteOf, stationIcon, found, say = null }) {
  ensureCss();
  const root = document.createElement('div');
  root.className = 'rbook';
  root.dataset.noPan = '';
  root.dataset.ui = 'recipe-book';
  root.innerHTML = `<div class="rbook-dim"></div><div class="rbook-book"><div class="rbook-page l"></div><div class="rbook-page r"></div></div>
    <div class="rbook-dots"></div>
    <div class="rbook-btn rbook-prev" data-ui="rbook-prev">${ARROW(-1)}</div><div class="rbook-btn rbook-next" data-ui="rbook-next">${ARROW(1)}</div>
    <div class="rbook-btn rbook-close" data-ui="rbook-close">${CLOSE}</div>`;
  host.appendChild(root);
  const dim = root.querySelector('.rbook-dim');
  const bookEl = root.querySelector('.rbook-book');
  const pagesEl = [...root.querySelectorAll('.rbook-page')];
  const dots = root.querySelector('.rbook-dots');
  const prev = root.querySelector('.rbook-prev');
  const next = root.querySelector('.rbook-next');
  const close = root.querySelector('.rbook-close');
  const play = (n, o) => { if (sfx) sfx.play(n, o); };
  const spreads = () => Math.max(1, Math.ceil(recipes().length / PER_SPREAD));
  const regs = [];
  const reg = (el, h) => { input.register(el, h); regs.push(el); };
  let open = false;
  let spread = 0;
  let seen = null;         // found ids when the spread was drawn (a new sticker pops)
  let hideTimer = 0;
  const rows = [];         // {el, dish, id}

  function rowEl(r, known) {
    const row = document.createElement('div');
    row.className = 'rbook-row';
    row.dataset.recipe = r.id;
    const ings = document.createElement('div');
    ings.className = 'rbook-ings';
    const needs = [];
    for (const n of r.needs) for (let i = 0; i < n.n; i++) needs.push(n);
    needs.forEach((n, i) => {
      if (i) { const p = document.createElement('div'); p.className = 'rbook-plus'; p.innerHTML = PLUS; ings.appendChild(p); }
      const ico = document.createElement('div');
      ico.className = 'rbook-ico' + (needs.length > 2 ? ' small' : '');
      ico.dataset.kind = n.kinds[0];
      paintIcon(ico, spriteOf(n));
      ings.appendChild(ico);
    });
    row.appendChild(ings);
    const at = document.createElement('div');
    at.className = 'rbook-ico rbook-at';
    at.dataset.at = r.at;
    paintIcon(at, stationIcon(r.at));
    row.appendChild(at);
    const mk = document.createElement('div');
    mk.className = 'rbook-makes';
    mk.innerHTML = MAKES;
    row.appendChild(mk);
    const dish = document.createElement('div');
    dish.className = 'rbook-dish ' + (known ? 'is-found' : 'is-hidden');
    dish.dataset.recipe = r.id;
    const di = document.createElement('div');
    di.className = 'rbook-ico';
    paintIcon(di, spriteOf(r));
    dish.appendChild(di);
    dish.insertAdjacentHTML('beforeend', `<div class="rbook-star">${STAR}</div><div class="rbook-q">${QUESTION}</div><div class="rbook-name"></div>`);
    dish.lastChild.textContent = r.name;
    row.appendChild(dish);
    return { row, dish };
  }

  function draw(dir = 0) {
    for (const r of rows) input.unregister(r.dish);
    rows.length = 0;
    const list = recipes();
    const got = found();
    spread = Math.max(0, Math.min(spreads() - 1, spread));
    pagesEl.forEach((pg, side) => {
      pg.textContent = '';
      for (let i = 0; i < PER_PAGE; i++) {
        const r = list[spread * PER_SPREAD + side * PER_PAGE + i];
        if (!r) { const e = document.createElement('div'); e.className = 'rbook-row is-empty'; pg.appendChild(e); continue; }
        const { row, dish } = rowEl(r, got.has(r.id));
        if (got.has(r.id) && seen && !seen.has(r.id)) dish.classList.add('is-new');
        pg.appendChild(row);
        rows.push({ el: row, dish, id: r.id, name: r.name });
        input.register(dish, {
          onTap() {
            const on = got.has(r.id);
            tween.squish(dish, { amount: on ? 0.8 : 0.5, duration: 320 });
            play(on ? 'chime' : 'boing', { pitch: on ? 1.2 : 1.4, gain: 0.6 });
            if (on && say && document.body.classList.contains('text-layer')) say(r.name);
          },
        });
      }
    });
    seen = got;
    dots.innerHTML = '<i></i>'.repeat(Math.min(spreads(), 16));
    const d = dots.children[Math.min(spread, dots.children.length - 1)];
    if (d) d.className = 'on';
    prev.classList.toggle('is-off', spread === 0);
    next.classList.toggle('is-off', spread >= spreads() - 1);
    if (dir) {
      bookEl.style.setProperty('--rb-dx', `${dir * 6}vmin`);
      bookEl.classList.remove('rbook-turn');
      void bookEl.offsetWidth;
      bookEl.classList.add('rbook-turn');
    }
    fitIcons(root);
  }

  function turn(dir) {
    const to = spread + dir;
    if (to < 0 || to >= spreads()) {
      tween.shake(bookEl, { amount: 0.3 });
      play('boing', { pitch: 1.2, gain: 0.5 });
      return false;
    }
    spread = to;
    play('swoosh', { pitch: 1.2, gain: 0.7 });
    draw(dir);
    return true;
  }

  function show(at = null) {
    clearTimeout(hideTimer);
    if (typeof at === 'number') spread = at;
    open = true;
    root.classList.add('is-open');
    draw();
    void root.offsetWidth;
    root.classList.add('is-shown');
    play('whoosh', { pitch: 0.9 });
    play('swoosh', { pitch: 1.1, gain: 0.5 });
  }

  function hide() {
    if (!open) return;
    open = false;
    root.classList.remove('is-shown');
    play('thud', { pitch: 1.3, gain: 0.6 });
    hideTimer = setTimeout(() => { hideTimer = 0; if (!open) root.classList.remove('is-open'); }, 280);
  }

  const btn = (el, fn) => reg(el, { onTap() { tween.squish(el, { amount: 0.7, duration: 280 }); fn(); } });
  btn(prev, () => turn(-1));
  btn(next, () => turn(1));
  btn(close, hide);
  reg(dim, { onTap: hide });
  // Swipe the pages to turn them too.
  reg(bookEl, {
    onTap() {},
    onDragStart: (info) => { info.data.x0 = info.sx; return true; },
    onDragMove() {},
    onDragEnd: (info) => { const dx = info.sx - info.data.x0; if (Math.abs(dx) > 40) turn(dx < 0 ? 1 : -1); },
  });

  return {
    el: root,
    open: show,
    close: hide,
    turn,
    isOpen: () => open,
    page: () => spread,
    pages: spreads,
    shown: () => rows.map((r) => ({ id: r.id, found: r.dish.classList.contains('is-found') })),
    refresh() { if (open) draw(); },
    destroy() {
      clearTimeout(hideTimer);
      for (const r of rows) input.unregister(r.dish);
      for (const el of regs) input.unregister(el);
      root.remove();
    },
  };
}
