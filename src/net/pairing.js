// Pairing screens for two-iPad play (stretch, bead oxg.2). Zero text: every
// step is a picture Ian can follow.
//
//   badge (corner)  two little iPads; green link when paired, broken when the
//                   link dropped. Tap it to open the chooser.
//   chooser         [my town: host]  [go visit: join]  (+ [go home] while visiting)
//   host            "hold iPads face to face" picture, a big QR code (the
//                   offer), and a small camera viewfinder that waits for the
//                   other iPad's QR code (the answer)
//   join            the same picture and a big viewfinder; once the host's code
//                   is read, a big QR code (the answer) for the host to scan
//   done            two buddies and a heart pop; closes itself
//   oops            a sad buddy and a try-again arrow
//
// Front camera by default (the iPads face each other), with a flip button.
// A small clipboard button opens a copy/paste box for the codes (desktop
// testing, or an iPad whose camera is refused); it opens by itself when there
// is no camera.
//
// KEY RULE (spikes/p2p): the camera starts BEFORE the RTCPeerConnection is
// made, so WebKit gives real LAN addresses instead of mDNS names.
//
// The QR libraries (assets/vendor, MIT and Apache-2.0) load on first use as
// classic scripts; they are in the service-worker precache like everything else.

import { hostOffer, guestAnswer, CODE_RE } from './transport.js';

const QR_GEN = 'assets/vendor/qrcode-generator-2.0.4.js';
const QR_READ = 'assets/vendor/jsQR-1.4.0.js';
const SCAN_MS = 150;
const DONE_MS = 1800;
const CONNECT_MS = 25000;   // after both codes are swapped

// --- pictures (inline SVG, no text) ---------------------------------------

const IPAD = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(w / 8)}" fill="#2b2d42"/>` +
  `<rect x="${x + w * 0.09}" y="${y + h * 0.08}" width="${w * 0.82}" height="${h * 0.84}" rx="${Math.round(w / 16)}" fill="${fill}"/>`;

const QR_MARK = (x, y, s) =>
  `<g fill="#2b2d42"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="2"/><rect x="${x + s * 1.6}" y="${y}" width="${s}" height="${s}" rx="2"/>` +
  `<rect x="${x}" y="${y + s * 1.6}" width="${s}" height="${s}" rx="2"/><rect x="${x + s * 1.7}" y="${y + s * 1.7}" width="${s * 0.8}" height="${s * 0.8}"/></g>` +
  `<g fill="#fff"><rect x="${x + s * 0.3}" y="${y + s * 0.3}" width="${s * 0.4}" height="${s * 0.4}"/><rect x="${x + s * 1.9}" y="${y + s * 0.3}" width="${s * 0.4}" height="${s * 0.4}"/><rect x="${x + s * 0.3}" y="${y + s * 1.9}" width="${s * 0.4}" height="${s * 0.4}"/></g>`;

const HOUSE = (x, y, s, fill) =>
  `<path d="M${x} ${y + s * 0.45} L${x + s / 2} ${y} L${x + s} ${y + s * 0.45} Z" fill="#e4572e"/>` +
  `<rect x="${x + s * 0.12}" y="${y + s * 0.42}" width="${s * 0.76}" height="${s * 0.58}" fill="${fill}"/>` +
  `<rect x="${x + s * 0.4}" y="${y + s * 0.66}" width="${s * 0.2}" height="${s * 0.34}" fill="#2b2d42"/>`;

const FACE = (cx, cy, r, fill, happy) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>` +
  `<circle cx="${cx - r * 0.35}" cy="${cy - r * 0.15}" r="${r * 0.12}" fill="#2b2d42"/><circle cx="${cx + r * 0.35}" cy="${cy - r * 0.15}" r="${r * 0.12}" fill="#2b2d42"/>` +
  (happy
    ? `<path d="M${cx - r * 0.4} ${cy + r * 0.2} Q${cx} ${cy + r * 0.7} ${cx + r * 0.4} ${cy + r * 0.2}" fill="none" stroke="#2b2d42" stroke-width="${r * 0.12}" stroke-linecap="round"/>`
    : `<path d="M${cx - r * 0.35} ${cy + r * 0.5} Q${cx} ${cy + r * 0.2} ${cx + r * 0.35} ${cy + r * 0.5}" fill="none" stroke="#2b2d42" stroke-width="${r * 0.12}" stroke-linecap="round"/>`);

const HEART = (cx, cy, s, fill) =>
  `<path d="M${cx} ${cy + s * 0.9} C${cx - s * 1.4} ${cy - s * 0.1} ${cx - s * 0.6} ${cy - s * 1.1} ${cx} ${cy - s * 0.35} C${cx + s * 0.6} ${cy - s * 1.1} ${cx + s * 1.4} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z" fill="${fill || '#ff5d8f'}"/>`;

const svg = (vb, body) => `<svg viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const PICS = {
  pair: svg('0 0 64 64', IPAD(4, 14, 22, 32, '#9ad0f5') + IPAD(38, 14, 22, 32, '#ffd66e') +
    '<path class="tg-link" d="M26 30 H38" stroke="#2e9e5b" stroke-width="5" stroke-linecap="round"/>' +
    '<path class="tg-broken" d="M26 30 H30 M34 30 H38" stroke="#e4572e" stroke-width="5" stroke-linecap="round"/>'),
  host: svg('0 0 120 120', IPAD(14, 8, 92, 104, '#fff4d6') + HOUSE(34, 22, 52, '#ffd66e') + QR_MARK(46, 84, 9) +
    '<path d="M8 40 Q2 60 8 80 M112 40 Q118 60 112 80" fill="none" stroke="#ff7a59" stroke-width="5" stroke-linecap="round"/>'),
  join: svg('0 0 120 120', IPAD(8, 20, 60, 84, '#dff1ff') +
    '<circle cx="38" cy="54" r="15" fill="#2b2d42"/><circle cx="38" cy="54" r="8" fill="#5bc0eb"/><circle cx="34" cy="50" r="3" fill="#fff"/>' +
    '<path d="M72 62 H92 M84 52 L94 62 L84 72" fill="none" stroke="#ff7a59" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
    HOUSE(88, 30, 30, '#9ad0f5')),
  home: svg('0 0 120 120', HOUSE(30, 20, 62, '#ffd66e') +
    '<path d="M28 96 H92 M40 86 L28 96 L40 106" fill="none" stroke="#2e9e5b" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: svg('0 0 64 64', '<path d="M18 18 L46 46 M46 18 L18 46" stroke="#2b2d42" stroke-width="7" stroke-linecap="round"/>'),
  flip: svg('0 0 64 64', '<rect x="8" y="20" width="48" height="32" rx="7" fill="#2b2d42"/><rect x="22" y="14" width="20" height="8" rx="3" fill="#2b2d42"/>' +
    '<circle cx="32" cy="36" r="10" fill="#9ad0f5"/><path d="M22 36 a10 10 0 0 1 17-7 M42 36 a10 10 0 0 1 -17 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
  paste: svg('0 0 64 64', '<rect x="14" y="12" width="36" height="44" rx="5" fill="#c9a26b"/><rect x="18" y="18" width="28" height="34" rx="2" fill="#fff"/>' +
    '<rect x="24" y="8" width="16" height="9" rx="3" fill="#2b2d42"/><path d="M23 28 H41 M23 35 H41 M23 42 H35" stroke="#9aa" stroke-width="3" stroke-linecap="round"/>'),
  use: svg('0 0 64 64', '<circle cx="32" cy="32" r="26" fill="#2e9e5b"/><path d="M19 33 L28 42 L45 23" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
  retry: svg('0 0 64 64', '<path d="M48 30 A17 17 0 1 1 40 16" fill="none" stroke="#ff7a59" stroke-width="7" stroke-linecap="round"/><path d="M34 6 L44 16 L32 23" fill="none" stroke="#ff7a59" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'),
  nocam: svg('0 0 64 64', '<rect x="8" y="20" width="48" height="32" rx="7" fill="#8d99ae"/><circle cx="32" cy="36" r="10" fill="#dfe4ea"/>' +
    '<path d="M10 56 L54 14" stroke="#e4572e" stroke-width="6" stroke-linecap="round"/>'),
  facing: svg('0 0 240 120',
    '<g transform="rotate(-10 60 60)">' + IPAD(20, 14, 70, 94, '#fff') + QR_MARK(38, 44, 12) + '</g>' +
    '<g transform="rotate(10 180 60)">' + IPAD(150, 14, 70, 94, '#dff1ff') + '<circle cx="185" cy="30" r="5" fill="#2b2d42"/></g>' +
    '<path class="tg-facing-arrows" d="M100 48 H140 M130 38 L140 48 L130 58 M140 76 H100 M110 66 L100 76 L110 86" fill="none" stroke="#ff7a59" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
  done: svg('0 0 240 140', FACE(62, 84, 44, '#5bc0eb', true) + FACE(178, 84, 44, '#ff9fb6', true) +
    '<g class="tg-heart">' + HEART(120, 44, 22) + '</g>'),
  oops: svg('0 0 140 140', FACE(70, 76, 50, '#8d99ae', false)),
};

// --- helpers -------------------------------------------------------------

function el(doc, tag, cls, html) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function button(doc, cls, pic) {
  const b = el(doc, 'button', 'tg-btn ' + cls, PICS[pic]);
  b.type = 'button';
  return b;
}

const scripts = {};
function loadScript(doc, src, global) {
  if (doc.defaultView[global]) return Promise.resolve(doc.defaultView[global]);
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = src;
      s.onload = () => resolve(doc.defaultView[global]);
      s.onerror = () => { delete scripts[src]; reject(new Error('could not load ' + src)); };
      doc.head.appendChild(s);
    });
  }
  return scripts[src];
}

function drawQR(qrcode, canvas, text, size) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.max(3, Math.floor(size / (n + quiet * 2)));
  canvas.width = canvas.height = cell * (n + quiet * 2);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
}

// --- the UI ----------------------------------------------------------------

/**
 * Build the badge and the pairing panel. opts.session: src/net/session.js.
 * Returns { open(), close(), startHost(), startJoin(), useCode(text), el, badge }.
 */
export function createPairingUI({ session, doc = document, nav = navigator }) {
  const win = doc.defaultView;

  const badge = button(doc, 'tg-badge', 'pair');
  badge.dataset.status = session.status;
  doc.body.appendChild(badge);

  const root = el(doc, 'div', 'tg-panel');
  root.hidden = true;
  root.innerHTML = `
    <div class="tg-card">
      <div class="tg-screen" data-screen="choose"><div class="tg-row tg-choices"></div></div>
      <div class="tg-screen" data-screen="pair">
        <div class="tg-facing">${PICS.facing}</div>
        <div class="tg-row tg-pair-row">
          <div class="tg-qrbox"><canvas class="tg-qr"></canvas><div class="tg-wait"></div></div>
          <div class="tg-cam"><div class="tg-view"><video class="tg-video" playsinline muted autoplay></video><div class="tg-frame"></div></div>
            <div class="tg-nocam">${PICS.nocam}</div></div>
        </div>
        <div class="tg-row tg-tools"></div>
        <div class="tg-paste" hidden>
          <textarea class="tg-my-code" readonly rows="3"></textarea>
          <textarea class="tg-their-code" rows="3"></textarea>
        </div>
      </div>
      <div class="tg-screen" data-screen="done"><div class="tg-done">${PICS.done}</div></div>
      <div class="tg-screen" data-screen="oops"><div class="tg-oops">${PICS.oops}</div><div class="tg-row tg-oops-row"></div></div>
    </div>`;
  const q = (s) => root.querySelector(s);
  const closeBtn = button(doc, 'tg-close', 'close');
  q('.tg-card').appendChild(closeBtn);
  const hostBtn = button(doc, 'tg-host', 'host');
  const joinBtn = button(doc, 'tg-join', 'join');
  const homeBtn = button(doc, 'tg-home', 'home');
  q('.tg-choices').append(hostBtn, joinBtn, homeBtn);
  const flipBtn = button(doc, 'tg-flip', 'flip');
  const pasteBtn = button(doc, 'tg-paste-toggle', 'paste');
  const useBtn = button(doc, 'tg-use', 'use');
  q('.tg-tools').append(flipBtn, pasteBtn);
  q('.tg-paste').appendChild(useBtn);
  const retryBtn = button(doc, 'tg-retry', 'retry');
  q('.tg-oops-row').appendChild(retryBtn);
  doc.body.appendChild(root);

  const video = q('.tg-video');
  const qrCanvas = q('.tg-qr');
  const myCode = q('.tg-my-code');
  const theirCode = q('.tg-their-code');

  let facing = 'user';      // front camera: the iPads face each other
  let stream = null;
  let scanTimer = null;
  let attempt = 0;          // bumps on every new try; stale async steps bail out
  let pairing = null;       // { role, peer (hostOffer/guestAnswer result) }
  let lastRole = 'host';
  let doneTimer = 0;
  let connectTimer = 0;

  function show(name, mode) {
    root.hidden = false;
    root.dataset.screen = name;
    if (mode) root.dataset.mode = mode;
    for (const s of root.querySelectorAll('.tg-screen')) s.classList.toggle('tg-on', s.dataset.screen === name);
  }

  function setBadge() {
    badge.dataset.status = session.status;
    homeBtn.hidden = !session.visiting;
  }
  session.on('status', (s) => {
    setBadge();
    // The other iPad went away while this one was waiting on the done screen.
    if (s === 'solo' || s === 'away') badge.classList.remove('tg-pop');
  });
  setBadge();

  // --- camera

  async function startCamera(token) {
    stopCamera();
    root.classList.remove('tg-has-cam');
    if (!nav.mediaDevices || !nav.mediaDevices.getUserMedia) return false;
    try {
      const s = await nav.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } }, audio: false });
      if (token !== attempt) { s.getTracks().forEach((t) => t.stop()); return false; }
      stream = s;
      video.srcObject = s;
      video.classList.toggle('tg-mirror', facing === 'user');
      await video.play().catch(() => {});
      root.classList.add('tg-has-cam');
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopScan() {
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  }

  function stopCamera() {
    stopScan();
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
    root.classList.remove('tg-has-cam');
  }

  async function scan(token, kind, onCode) {
    const jsQR = await loadScript(doc, QR_READ, 'jsQR');
    if (token !== attempt || !stream) return;
    const c = doc.createElement('canvas');
    const g = c.getContext('2d', { willReadFrequently: true });
    stopScan();
    scanTimer = setInterval(() => {
      if (video.readyState < 2 || !video.videoWidth) return;
      const w = 640, h = Math.round(640 * video.videoHeight / video.videoWidth) || 480;
      c.width = w; c.height = h;
      g.drawImage(video, 0, 0, w, h);
      const found = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (found && CODE_RE.test(found.data) && found.data.split('|')[1] === kind) {
        stopScan();
        onCode(found.data);
      }
    }, SCAN_MS);
  }

  function noCamera() {
    q('.tg-paste').hidden = false;
    root.classList.add('tg-no-cam');
  }

  // --- flow

  function reset() {
    attempt++;
    stopCamera();
    clearTimeout(doneTimer);
    clearTimeout(connectTimer);
    if (pairing && pairing.peer && !pairing.connected) pairing.peer.close();
    pairing = null;
    const g = qrCanvas.getContext('2d');
    g.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    myCode.value = '';
    theirCode.value = '';
    q('.tg-paste').hidden = true;
    root.classList.remove('tg-no-cam', 'tg-has-qr', 'tg-waiting');
  }

  function qrSize() {
    return Math.max(220, Math.min(460, Math.round(Math.min(win.innerWidth * 0.42, win.innerHeight * 0.55))));
  }

  async function showCode(token, code) {
    myCode.value = code;
    const qrcode = await loadScript(doc, QR_GEN, 'qrcode');
    if (token !== attempt) return;
    drawQR(qrcode, qrCanvas, code, qrSize());
    root.classList.add('tg-has-qr');
  }

  function oops() {
    const role = pairing ? pairing.role : lastRole;
    reset();
    lastRole = role;
    show('oops');
  }

  function whenConnected(token, p) {
    p.peer.ready.then((link) => {
      if (token !== attempt) { link.close('stale'); return; }
      p.connected = true;
      clearTimeout(connectTimer);
      stopCamera();
      if (p.role === 'host') session.host(link); else session.join(link);
      badge.classList.add('tg-pop');
      show('done');
      doneTimer = setTimeout(() => ui.close(), DONE_MS);
    }, () => { if (token === attempt) oops(); });
  }

  function waitConnect(token) {
    root.classList.add('tg-waiting');
    clearTimeout(connectTimer);
    connectTimer = setTimeout(() => { if (token === attempt && !(pairing && pairing.connected)) oops(); }, CONNECT_MS);
  }

  async function startHost() {
    reset();
    lastRole = 'host';
    const token = attempt;
    show('pair', 'host');
    // KEY RULE: camera first, then the peer connection.
    const cam = await startCamera(token);
    if (token !== attempt) return;
    let peer;
    try { peer = await hostOffer(); } catch (e) { if (token === attempt) oops(); return; }
    if (token !== attempt) { peer.close(); return; }
    pairing = { role: 'host', peer, connected: false };
    whenConnected(token, pairing);
    await showCode(token, peer.code);
    if (cam) scan(token, 'a', (code) => useCode(code));
    else noCamera();
  }

  async function startJoin() {
    reset();
    lastRole = 'guest';
    const token = attempt;
    show('pair', 'join');
    pairing = { role: 'guest', peer: null, connected: false };
    const cam = await startCamera(token);
    if (token !== attempt) return;
    if (cam) scan(token, 'o', (code) => useCode(code));
    else noCamera();
  }

  async function useCode(text) {
    const token = attempt;
    text = String(text || '').trim();
    if (!pairing || !CODE_RE.test(text)) return false;
    const kind = text.split('|')[1];
    try {
      if (pairing.role === 'host') {
        if (kind !== 'a') return false;
        stopCamera();
        await pairing.peer.accept(text);
        waitConnect(token);
      } else {
        if (kind !== 'o' || pairing.peer) return false;
        stopCamera();   // the camera was granted before this peer connection
        const peer = await guestAnswer(text);
        if (token !== attempt) { peer.close(); return false; }
        pairing.peer = peer;
        whenConnected(token, pairing);
        await showCode(token, peer.code);
        waitConnect(token);
      }
      return true;
    } catch (e) {
      if (token === attempt) oops();
      return false;
    }
  }

  // --- buttons (plain click: this panel is outside the stage's input system)

  badge.addEventListener('click', () => ui.open());
  closeBtn.addEventListener('click', () => ui.close());
  hostBtn.addEventListener('click', () => { startHost(); });
  joinBtn.addEventListener('click', () => { startJoin(); });
  homeBtn.addEventListener('click', () => { session.leave(); ui.close(); });
  retryBtn.addEventListener('click', () => { if (lastRole === 'host') startHost(); else startJoin(); });
  flipBtn.addEventListener('click', async () => {
    const token = attempt;
    const kind = pairing && pairing.role === 'host' ? 'a' : 'o';
    if (!pairing || (pairing.role === 'guest' && pairing.peer)) return;
    facing = facing === 'user' ? 'environment' : 'user';
    if (await startCamera(token)) scan(token, kind, (code) => useCode(code));
  });
  pasteBtn.addEventListener('click', () => {
    const p = q('.tg-paste');
    p.hidden = !p.hidden;
    if (!p.hidden && myCode.value) { myCode.focus(); myCode.select(); }
  });
  useBtn.addEventListener('click', () => { useCode(theirCode.value); });

  const ui = {
    el: root,
    badge,
    open() {
      if (pairing && !pairing.connected) return show(root.dataset.screen || 'choose');
      reset();
      setBadge();
      show('choose');
    },
    close() {
      reset();
      root.hidden = true;
    },
    startHost,
    startJoin,
    useCode,
    get myCode() { return myCode.value; },
  };
  return ui;
}
