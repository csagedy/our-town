// Transport for two-iPad play (stretch, bead oxg.2; findings in spikes/p2p/).
// A WebRTC data channel over the local Wi-Fi, with NO servers: no STUN/TURN
// (`iceServers: []`) and no signaling server. The two iPads swap one pairing
// code each way, by QR code (src/net/pairing.js) or copy/paste.
//
//   // host iPad                                 // guest iPad
//   const h = await hostOffer();                 (scans h.code)
//   show QR(h.code)                              const g = await guestAnswer(h.code);
//   (scans g.code)                               show QR(g.code)
//   await h.accept(answerCode);
//   await h.link.ready;                          await g.link.ready;
//   h.link.send({ t: 'hi' });                    g.link.on('message', (m) => ...);
//
// KEY RULE (WebKit, from the spike): call getUserMedia (the QR camera) BEFORE
// creating the RTCPeerConnection. A page with a live camera grant gets real
// LAN IPs as ICE host candidates; without it WebKit hands out mDNS
// "<uuid>.local" names that the other iPad often cannot resolve. pairing.js
// starts the camera first, then calls hostOffer()/guestAnswer().
//
// Pieces:
//   encodeDesc / decodeDesc  compact pairing code <-> SDP (about 130 bytes, so
//                            the QR code stays small and easy to scan)
//   createLink(channel)      JSON messages over a data channel (or any
//                            channel-like object: tests use an in-memory pair)
//                            with chunking for big snapshots, a heartbeat and
//                            one 'close' event however the link dies
//   hostOffer / guestAnswer  the RTCPeerConnection dance
//
// No DOM access at module top level (unit tests import this in Node).

// ---------------------------------------------------------------------------
// Compact SDP codec. A data-channel-only SDP carries very little that
// matters: ICE ufrag/pwd, the DTLS fingerprint, the DTLS setup role and the
// candidates. Only those travel; the other side rebuilds a canonical SDP.
//   P1|<o|a>|<setup a/c/p>|<ufrag>|<pwd>|<sha-256 fingerprint, base64>|<cand>;<cand>...
//   cand = u<address>/<port>   (UDP host candidates; address may be an mDNS *.local name)
// Fallback for an SDP we cannot compact: S|<o|a>|<base64 of the full SDP>.

const SETUP = { actpass: 'a', active: 'c', passive: 'p' };
const SETUP_R = { a: 'actpass', c: 'active', p: 'passive' };
export const CODE_RE = /^(P1|S)\|[oa]\|/;

function hexToB64(hex) {
  const bytes = hex.split(':').map((h) => parseInt(h, 16));
  return btoa(String.fromCharCode.apply(null, bytes));
}

function b64ToHex(b64) {
  return Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(':');
}

/** RTCSessionDescription (or {type, sdp}) -> short pairing code. */
export function encodeDesc(desc) {
  const sdp = desc.sdp;
  const kind = desc.type === 'offer' ? 'o' : 'a';
  const get = (re) => { const m = sdp.match(re); return m ? m[1].trim() : null; };
  const ufrag = get(/a=ice-ufrag:(.+)/);
  const pwd = get(/a=ice-pwd:(.+)/);
  const fp = sdp.match(/a=fingerprint:(\S+) ([0-9A-Fa-f:]+)/);
  const setup = get(/a=setup:(\S+)/);
  const cands = [];
  const re = /a=candidate:\S+ (\d) (\S+) \d+ (\S+) (\d+) typ (\S+)/g;
  let m;
  while ((m = re.exec(sdp))) {
    const component = m[1], proto = m[2].toLowerCase(), addr = m[3], port = m[4], typ = m[5];
    if (component !== '1' || typ !== 'host' || proto !== 'udp') continue;   // no TURN/STUN; TCP costs QR space
    const c = 'u' + addr + '/' + port;
    if (cands.indexOf(c) === -1) cands.push(c);
  }
  const ok = ufrag && pwd && fp && fp[1].toLowerCase() === 'sha-256' && setup && SETUP[setup] &&
    !/[|;]/.test(ufrag + pwd + cands.join('')) && /m=application/.test(sdp) && !/m=(audio|video)/.test(sdp);
  if (!ok) return 'S|' + kind + '|' + btoa(sdp);
  return ['P1', kind, SETUP[setup], ufrag, pwd, hexToB64(fp[2]), cands.join(';')].join('|');
}

/** Pairing code -> {type, sdp}. Throws on something that is not a code. */
export function decodeDesc(text) {
  text = String(text || '').trim();
  const parts = text.split('|');
  if (parts[0] === 'S' && parts.length === 3 && (parts[1] === 'o' || parts[1] === 'a')) {
    return { type: parts[1] === 'o' ? 'offer' : 'answer', sdp: atob(parts[2]) };
  }
  if (parts[0] !== 'P1' || parts.length !== 7 || !SETUP_R[parts[2]] || (parts[1] !== 'o' && parts[1] !== 'a')) {
    throw new Error('not a pairing code');
  }
  const kind = parts[1], setupC = parts[2], ufrag = parts[3], pwd = parts[4], fpB64 = parts[5], candStr = parts[6];
  const lines = [
    'v=0',
    'o=- ' + (Date.now() % 1e9) + ' 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    'a=ice-ufrag:' + ufrag,
    'a=ice-pwd:' + pwd,
    'a=ice-options:trickle',
    'a=fingerprint:sha-256 ' + b64ToHex(fpB64),
    'a=setup:' + SETUP_R[setupC],
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
  ];
  const prio = 2130706431;
  candStr.split(';').filter(Boolean).forEach((c, i) => {
    const proto = c[0] === 'u' ? 'udp' : 'tcp';
    const slash = c.lastIndexOf('/');
    lines.push('a=candidate:' + (i + 1) + ' 1 ' + proto + ' ' + (prio - i) + ' ' + c.slice(1, slash) + ' ' +
      c.slice(slash + 1) + ' typ host generation 0');
  });
  lines.push('a=end-of-candidates');
  return { type: kind === 'o' ? 'offer' : 'answer', sdp: lines.join('\r\n') + '\r\n' };
}

// ---------------------------------------------------------------------------
// Link: JSON messages over a channel, with a heartbeat.
//
// Wire frames are JSON objects. App messages go as they are; transport
// control frames use the key "~":
//   {"~":"ping","t":<ms>}  {"~":"pong","t":<ms>}   heartbeat (rtt from the echo)
//   {"~":"c","k":<n>,"i":<i>,"n":<count>,"d":<text>} one chunk of a big message
// Safari's SCTP stack limits one message to 64KB-256KB, and a snapshot of a
// full town can pass that, so anything over CHUNK chars travels in pieces.
//
// The link closes (emits 'close' once, with a reason) when the channel closes,
// when nothing has been heard for `timeoutMs` (the other iPad slept or walked
// off; WebRTC itself takes 10-30s to notice), or on link.close().

export const CHUNK = 16000;
export const HEARTBEAT_MS = 1000;
export const TIMEOUT_MS = 6000;

function listen(target, type, fn) {
  if (target.addEventListener) target.addEventListener(type, fn);
  else target['on' + type] = fn;
}

/**
 * Wrap an RTCDataChannel (or anything with send, readyState and
 * open/message/close events) as a link.
 *   link.on('open' | 'message' | 'close', fn) -> off()
 *   link.send(obj) -> false if not open;  link.close(reason);  link.ready (Promise)
 *   link.isOpen, link.rtt (ms, from the heartbeat)
 * opts.onClose(reason): extra teardown (close the peer connection).
 */
export function createLink(channel, opts = {}) {
  const heartbeatMs = opts.heartbeatMs || HEARTBEAT_MS;
  const timeoutMs = opts.timeoutMs || TIMEOUT_MS;
  const chunk = opts.chunk || CHUNK;
  const now = opts.now || (() => Date.now());
  const setInt = opts.setInterval || ((fn, ms) => setInterval(fn, ms));
  const clearInt = opts.clearInterval || ((t) => clearInterval(t));
  const listeners = { open: [], message: [], close: [] };
  const partial = new Map();   // chunk key -> array of parts
  let open = false;
  let closed = false;
  let lastHeard = now();
  let beat = null;
  let nextKey = 1;
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  ready.catch(() => {});

  function emit(type, a) {
    for (const fn of listeners[type].slice()) {
      try { fn(a); } catch (e) { setTimeout(() => { throw e; }, 0); }
    }
  }

  function raw(obj) {
    if (!open || closed) return false;
    try { channel.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
  }

  function onOpen() {
    if (open || closed) return;
    open = true;
    lastHeard = now();
    beat = setInt(() => {
      if (now() - lastHeard > timeoutMs) { link.close('timeout'); return; }
      raw({ '~': 'ping', t: now() });
    }, heartbeatMs);
    readyResolve(link);
    emit('open');
  }

  function onMessage(e) {
    lastHeard = now();
    let m;
    try { m = JSON.parse(e.data); } catch (err) { return; }
    if (!m || typeof m !== 'object') return;
    const ctl = m['~'];
    if (ctl === 'ping') { raw({ '~': 'pong', t: m.t }); return; }
    if (ctl === 'pong') { link.rtt = Math.max(0, now() - m.t); return; }
    if (ctl === 'c') {
      let parts = partial.get(m.k);
      if (!parts) { parts = []; partial.set(m.k, parts); }
      parts[m.i] = m.d;
      let have = 0;
      for (let i = 0; i < m.n; i++) if (typeof parts[i] === 'string') have++;
      if (have < m.n) return;
      partial.delete(m.k);
      try { m = JSON.parse(parts.join('')); } catch (err) { return; }
    } else if (ctl) {
      return;
    }
    emit('message', m);
  }

  const link = {
    ready,
    rtt: null,
    get isOpen() { return open && !closed; },
    on(type, fn) {
      listeners[type].push(fn);
      return () => { const i = listeners[type].indexOf(fn); if (i !== -1) listeners[type].splice(i, 1); };
    },
    send(obj) {
      if (!open || closed) return false;
      const text = JSON.stringify(obj);
      if (text.length <= chunk) {
        try { channel.send(text); return true; } catch (e) { return false; }
      }
      const k = nextKey++;
      const n = Math.ceil(text.length / chunk);
      for (let i = 0; i < n; i++) {
        if (!raw({ '~': 'c', k, i, n, d: text.slice(i * chunk, (i + 1) * chunk) })) return false;
      }
      return true;
    },
    close(reason) {
      if (closed) return;
      closed = true;
      if (beat !== null) { clearInt(beat); beat = null; }
      try { channel.close(); } catch (e) { /* already gone */ }
      if (opts.onClose) { try { opts.onClose(reason || 'closed'); } catch (e) { /* ignore */ } }
      readyReject(new Error('link closed before it opened: ' + (reason || 'closed')));
      emit('close', reason || 'closed');
    },
  };

  listen(channel, 'open', onOpen);
  listen(channel, 'message', onMessage);
  listen(channel, 'close', () => link.close('channel closed'));
  listen(channel, 'error', () => link.close('channel error'));
  if (channel.readyState === 'open') onOpen();
  return link;
}

// ---------------------------------------------------------------------------
// RTCPeerConnection

export const RTC_CONFIG = { iceServers: [] };   // nothing ever leaves the local network
export const GATHER_MS = 4000;

function waitIceComplete(pc, ms) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const t = setTimeout(resolve, ms);   // use what we have
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
}

function watchPeer(pc, getLink) {
  pc.addEventListener('connectionstatechange', () => {
    const s = pc.connectionState;
    if (s === 'failed' || s === 'closed') { const l = getLink(); if (l) l.close('peer ' + s); }
  });
}

function peerClose(pc) {
  return () => { try { pc.close(); } catch (e) { /* ignore */ } };
}

/**
 * Host side. Start the camera first (see KEY RULE). Resolves once ICE
 * gathering is done: { code, accept(answerCode), link, pc }. `link` opens
 * after accept() once the guest connects (await ready, which resolves the link).
 */
export async function hostOffer(opts = {}) {
  const RTC = opts.RTCPeerConnection || globalThis.RTCPeerConnection;
  const pc = new RTC(RTC_CONFIG);
  const channel = pc.createDataChannel('ourtown', { ordered: true });
  const link = createLink(channel, Object.assign({ onClose: peerClose(pc) }, opts.link));
  watchPeer(pc, () => link);
  await pc.setLocalDescription(await pc.createOffer());
  await waitIceComplete(pc, opts.gatherMs || GATHER_MS);
  return {
    code: encodeDesc(pc.localDescription),
    link,
    pc,
    ready: link.ready,
    close() { link.close('closed'); },
    async accept(answerCode) {
      const desc = decodeDesc(answerCode);
      if (desc.type !== 'answer') throw new Error('that is an offer, not an answer');
      await pc.setRemoteDescription(desc);
    },
  };
}

/**
 * Guest side, after scanning the host's code (the camera is already on).
 * Resolves { code, link, pc } with the answer code to show the host.
 */
export async function guestAnswer(offerCode, opts = {}) {
  const desc = decodeDesc(offerCode);
  if (desc.type !== 'offer') throw new Error('that is an answer, not an offer');
  const RTC = opts.RTCPeerConnection || globalThis.RTCPeerConnection;
  const pc = new RTC(RTC_CONFIG);
  let link = null;
  let resolveLink;
  const linkP = new Promise((r) => { resolveLink = r; });
  pc.addEventListener('datachannel', (e) => {
    link = createLink(e.channel, Object.assign({ onClose: peerClose(pc) }, opts.link));
    resolveLink(link);
  });
  watchPeer(pc, () => link);
  await pc.setRemoteDescription(desc);
  await pc.setLocalDescription(await pc.createAnswer());
  await waitIceComplete(pc, opts.gatherMs || GATHER_MS);
  // The data channel shows up only once connected; hand out a link-shaped
  // object whose `ready` waits for it.
  const pending = {
    pc,
    code: encodeDesc(pc.localDescription),
    ready: linkP.then((l) => l.ready),
    get link() { return link; },
    close() { if (link) link.close('closed'); else peerClose(pc)(); },
  };
  return pending;
}
