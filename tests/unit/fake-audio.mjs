// A small, strict fake of the Web Audio API for Node unit tests. It records
// every node, connection and automation event, and throws where Safari/Chrome
// would (exponential ramps to <= 0, non-finite values, start/stop misuse).

export class FakeParam {
  constructor(node, name, value) {
    this.node = node;
    this.name = name;
    this.value = value;
    this.events = [];
  }
  _check(v, t) {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new TypeError(`${this.name}: non-finite ${v} @ ${t}`);
    if (t < 0) throw new RangeError(`${this.name}: negative time ${t}`);
  }
  setValueAtTime(v, t) { this._check(v, t); this.events.push({ type: 'set', v, t }); return this; }
  linearRampToValueAtTime(v, t) { this._check(v, t); this.events.push({ type: 'lin', v, t }); return this; }
  exponentialRampToValueAtTime(v, t) {
    this._check(v, t);
    if (v <= 0) throw new RangeError(`${this.name}: exponential ramp to ${v}`);
    this.events.push({ type: 'exp', v, t });
    return this;
  }
  setTargetAtTime(v, t, c) { this._check(v, t); this.events.push({ type: 'target', v, t, c }); return this; }
  cancelScheduledValues(t) { this.events.push({ type: 'cancel', t }); return this; }
  /** Largest value this param is ever set or ramped to. */
  max() {
    const vs = this.events.filter((e) => 'v' in e).map((e) => e.v);
    return vs.length ? Math.max(...vs) : this.value;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    ctx.nodes.push(this);
  }
  connect(dest) {
    if (!dest) throw new TypeError('connect(undefined)');
    this.outputs.push(dest);
    return dest;
  }
  disconnect() { this.outputs = []; this.disconnected = true; }
}

class FakeSource extends FakeNode {
  start(t = 0, offset = 0) {
    if (this.startedAt !== undefined) throw new Error(`${this.kind}: start() twice`);
    if (!Number.isFinite(t) || !Number.isFinite(offset)) throw new TypeError('start: non-finite');
    this.startedAt = t;
  }
  stop(t = 0) {
    if (this.startedAt === undefined) throw new Error(`${this.kind}: stop() before start()`);
    this.stoppedAt = t;
  }
  /** Simulate the source finishing. */
  end() { if (this.onended) this.onended(); }
}

export class FakeAudioContext {
  constructor({ state = 'suspended', sampleRate = 48000 } = {}) {
    this.nodes = [];
    this.state = state;
    this.sampleRate = sampleRate;
    this.currentTime = 0;
    this.destination = new FakeNode(this, 'destination');
    this.calls = { resume: 0, suspend: 0 };
    this.resumeResult = 'running';   // state after resume(); or 'reject'
    FakeAudioContext.instances.push(this);
  }
  _setState(s) { this.state = s; if (this.onstatechange) this.onstatechange(); }
  resume() {
    this.calls.resume++;
    if (this.resumeResult === 'reject') return Promise.reject(new Error('not allowed'));
    return Promise.resolve().then(() => this._setState(this.resumeResult));
  }
  suspend() { this.calls.suspend++; return Promise.resolve().then(() => this._setState('suspended')); }
  close() { this._setState('closed'); return Promise.resolve(); }
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new FakeParam(n, 'gain', 1); return n; }
  createOscillator() {
    const n = new FakeSource(this, 'osc');
    n.type = 'sine';
    n.frequency = new FakeParam(n, 'frequency', 440);
    n.detune = new FakeParam(n, 'detune', 0);
    return n;
  }
  createBiquadFilter() {
    const n = new FakeNode(this, 'biquad');
    n.type = 'lowpass';
    n.frequency = new FakeParam(n, 'frequency', 350);
    n.Q = new FakeParam(n, 'Q', 1);
    n.gain = new FakeParam(n, 'gain', 0);
    return n;
  }
  createBufferSource() {
    const n = new FakeSource(this, 'buffer');
    n.buffer = null;
    n.loop = false;
    n.playbackRate = new FakeParam(n, 'playbackRate', 1);
    return n;
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
  }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'compressor');
    for (const [k, v] of [['threshold', -24], ['knee', 30], ['ratio', 12], ['attack', 0.003], ['release', 0.25]]) {
      n[k] = new FakeParam(n, k, v);
    }
    return n;
  }
  createStereoPanner() { const n = new FakeNode(this, 'panner'); n.pan = new FakeParam(n, 'pan', 0); return n; }
  decodeAudioData(ab, ok, bad) {
    if (!ab || ab.byteLength === 0) { if (bad) bad(new Error('empty')); return undefined; }
    const buf = this.createBuffer(1, 100, this.sampleRate);
    if (ok) setTimeout(() => ok(buf), 0);
    return undefined;         // old callback-only Safari style
  }
  sources() { return this.nodes.filter((n) => n instanceof FakeSource); }
}
FakeAudioContext.instances = [];

/** Does a path of connections lead from `node` to `target`? AudioParam hops count via their node. */
export function reaches(node, target, seen = new Set()) {
  if (node === target) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  for (const out of node.outputs || []) {
    const next = out instanceof FakeParam ? out.node : out;
    if (reaches(next, target, seen)) return true;
  }
  return false;
}
