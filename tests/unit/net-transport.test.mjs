// src/net/transport.js: the compact pairing code (SDP encode/decode), the
// vendored QR libraries carrying it, and the link (framing, chunking,
// heartbeat, one close event).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';
import { encodeDesc, decodeDesc, CODE_RE, createLink } from '../../src/net/transport.js';
import { channelPair, linkPair, manualTimers, settle } from './fake-link.mjs';

const FP = 'AB:CD:EF:01:23:45:67:89:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78';

// A data-channel offer the way Chrome writes it (trimmed), with a real LAN
// IPv4 candidate, an IPv6 one, a duplicate, a TCP and an RTCP-component one.
function chromeOffer({ cands } = {}) {
  return [
    'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
    'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    ...(cands || [
      'a=candidate:1467250027 1 udp 2122260223 192.168.1.23 54321 typ host generation 0 network-id 1',
      'a=candidate:1467250028 1 udp 2122262783 fe80::1c2d:3e4f:5a6b:7c8d 54322 typ host generation 0 network-id 2',
      'a=candidate:1467250029 1 udp 2122260223 192.168.1.23 54321 typ host generation 0 network-id 1',
      'a=candidate:435653019 1 tcp 1518280447 192.168.1.23 9 typ host tcptype active generation 0',
      'a=candidate:435653020 2 udp 2122260222 192.168.1.23 54323 typ host generation 0',
    ]),
    'a=ice-ufrag:Xk3f', 'a=ice-pwd:aBcDeFgHiJkLmNoPqRsTuVwX', 'a=ice-options:trickle',
    'a=fingerprint:sha-256 ' + FP, 'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144',
  ].join('\r\n') + '\r\n';
}

test('offer code round-trips the fields that matter and stays QR-small', () => {
  const code = encodeDesc({ type: 'offer', sdp: chromeOffer() });
  assert.match(code, CODE_RE);
  assert.equal(code, 'P1|o|a|Xk3f|aBcDeFgHiJkLmNoPqRsTuVwX|' + Buffer.from(FP.split(':').map((h) => parseInt(h, 16))).toString('base64') +
    '|u192.168.1.23/54321;ufe80::1c2d:3e4f:5a6b:7c8d/54322');
  assert.ok(code.length < 160, code.length + ' chars');
  const d = decodeDesc(code);
  assert.equal(d.type, 'offer');
  assert.match(d.sdp, /a=ice-ufrag:Xk3f\r\n/);
  assert.match(d.sdp, /a=ice-pwd:aBcDeFgHiJkLmNoPqRsTuVwX\r\n/);
  assert.match(d.sdp, new RegExp('a=fingerprint:sha-256 ' + FP + '\r\n'));
  assert.match(d.sdp, /a=setup:actpass\r\n/);
  assert.match(d.sdp, /a=candidate:1 1 udp \d+ 192\.168\.1\.23 54321 typ host/);
  assert.match(d.sdp, /a=candidate:2 1 udp \d+ fe80::1c2d:3e4f:5a6b:7c8d 54322 typ host/);
  assert.equal((d.sdp.match(/a=candidate/g) || []).length, 2);
  // Encoding the rebuilt SDP gives the same code: a fixed point.
  assert.equal(encodeDesc(d), code);
});

test('answer code with an mDNS candidate and the active role round-trips', () => {
  const sdp = chromeOffer({ cands: ['a=candidate:9 1 udp 2113937151 3b1c9a52-7d7e-4f0e-9c1a-2f6f8f1e6d11.local 60001 typ host generation 0'] })
    .replace('a=setup:actpass', 'a=setup:active');
  const code = encodeDesc({ type: 'answer', sdp });
  assert.match(code, /^P1\|a\|c\|/);
  const d = decodeDesc(code);
  assert.equal(d.type, 'answer');
  assert.match(d.sdp, /a=setup:active/);
  assert.match(d.sdp, /3b1c9a52-7d7e-4f0e-9c1a-2f6f8f1e6d11\.local 60001 typ host/);
  assert.equal(encodeDesc(d), code);
});

test('an SDP that cannot be compacted travels whole', () => {
  const sdp = chromeOffer().replace('a=fingerprint:sha-256', 'a=fingerprint:sha-1');
  const code = encodeDesc({ type: 'offer', sdp });
  assert.match(code, /^S\|o\|/);
  assert.deepEqual(decodeDesc(code), { type: 'offer', sdp });
});

test('junk is not a pairing code', () => {
  for (const bad of ['', 'hello', 'P1|o|a|x', 'P1|x|a|u|p|f|', 'P1|o|z|u|p|f|', 'S|q|abc']) {
    assert.throws(() => decodeDesc(bad), /not a pairing code/, bad);
  }
});

// The vendored QR libraries (assets/vendor, loaded as classic scripts in the
// page) carry a real code: draw it with qrcode-generator, read it with jsQR.
function loadUmd(file) {
  const src = readFileSync(path.join(ROOT, 'assets', 'vendor', file), 'utf8');
  const module = { exports: {} };
  new Function('module', 'exports', 'define', 'self', src)(module, module.exports, undefined, undefined);
  return module.exports;
}

test('a pairing code survives QR encode -> pixels -> jsQR decode', () => {
  const qrcode = loadUmd('qrcode-generator-2.0.4.js');
  const jsQR = loadUmd('jsQR-1.4.0.js');
  const code = encodeDesc({ type: 'offer', sdp: chromeOffer() });
  const qr = qrcode(0, 'M');
  qr.addData(code, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const cell = 4, quiet = 4, size = (n + quiet * 2) * cell;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.isDark(r, c)) continue;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = (((r + quiet) * cell + y) * size + (c + quiet) * cell + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  const got = jsQR(px, size, size, { inversionAttempts: 'dontInvert' });
  assert.ok(got, 'jsQR found the code');
  assert.equal(got.data, code);
  assert.ok((n - 17) / 4 <= 8, 'QR version ' + (n - 17) / 4 + ' is small enough to scan across two iPads');
});

// --- the link

test('link: messages arrive in order, big ones in chunks', async () => {
  const { a, b, ca } = linkPair({ chunk: 100, setInterval: () => 0, clearInterval: () => {} });
  const got = [];
  b.on('message', (m) => got.push(m));
  const big = { t: 'snap', state: { entities: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['e' + i, { i }])) } };
  assert.equal(a.send({ t: 'one' }), true);
  assert.equal(a.send(big), true);
  assert.equal(a.send({ t: 'two' }), true);
  await settle();
  assert.deepEqual(got, [{ t: 'one' }, big, { t: 'two' }]);
  assert.ok(ca.sent.length > 5, 'the snapshot went as several frames');
  assert.ok(ca.sent.every((f) => f.length <= 200));
});

test('link: close on either side closes both, once, and sending then fails', async () => {
  const { a, b } = linkPair({ setInterval: () => 0, clearInterval: () => {} });
  const closes = [];
  a.on('close', (r) => closes.push('a:' + r));
  b.on('close', (r) => closes.push('b:' + r));
  a.close('bye');
  a.close('again');
  await settle();
  assert.deepEqual(closes, ['a:bye', 'b:channel closed']);
  assert.equal(a.isOpen, false);
  assert.equal(b.send({ t: 'x' }), false);
});

test('link: heartbeat keeps a quiet link open, and a silent peer times out', async () => {
  const clock = manualTimers();
  const opts = { heartbeatMs: 1000, timeoutMs: 5000, now: clock.now, setInterval: clock.setInterval, clearInterval: clock.clearInterval };
  const { a, b, cb } = linkPair(opts);
  const closes = [];
  a.on('close', (r) => closes.push(r));
  for (let i = 0; i < 20; i++) { clock.advance(1000); await settle(2); }
  assert.deepEqual(closes, [], 'pings keep it alive');
  assert.equal(typeof a.rtt, 'number');
  cb.cutOff = true;               // b's iPad goes to sleep: no frames, no close event
  for (let i = 0; i < 7; i++) { clock.advance(1000); await settle(2); }
  assert.deepEqual(closes, ['timeout']);
  b.close();
});

test('link: ready resolves on open and rejects if closed first', async () => {
  const [c1] = channelPair();
  const l1 = createLink(c1, { setInterval: () => 0, clearInterval: () => {} });
  c1.open();
  assert.equal(await l1.ready, l1);
  const [c2] = channelPair();
  const l2 = createLink(c2, { setInterval: () => 0, clearInterval: () => {} });
  l2.close('gave up');
  await assert.rejects(l2.ready, /gave up/);
});
