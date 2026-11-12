// A recording stand-in for the Web Audio API, so the engine's sound parts (Sfx, Sampler, Music) run in Node and a test can look at what they
// built: which nodes exist, what is connected to what, and what every parameter was told to do. Nothing is rendered or heard.
//
//   const audio = makeAudio();            // { AudioContext, AudioBuffer, ctx (the last context made), reaches(a, b), ... }
//   const E = loadEngine({ audio });      // tests/node/engine-harness.mjs puts them where the engine looks
//   ... run engine code ...
//   audio.ctx.nodes.filter(n => n.kind === 'stereopanner')
//
// Time stands still until a test moves it: ctx.currentTime = 2.
const PARAMS = {
  gain: { gain: 1 }, biquadfilter: { frequency: 350, Q: 1, gain: 0, detune: 0 }, oscillator: { frequency: 440, detune: 0 },
  buffersource: { playbackRate: 1, detune: 0 }, stereopanner: { pan: 0 }, delay: { delayTime: 0 }, constantsource: { offset: 1 },
  dynamicscompressor: { threshold: -24, knee: 30, ratio: 12, attack: .003, release: .25 }, convolver: {}, destination: {}
};

export function makeAudio({ sampleRate = 48000 } = {}) {
  const out = { contexts: [] };
  class Param {
    constructor(ctx, value) { this.ctx = ctx; this.base = this._cur = value; this.events = []; }
    get value() { return this._cur; }
    set value(v) { this.base = this._cur = v; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); if (t <= this.ctx.currentTime) this._cur = v; return this; }
    linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
    exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); return this; }
    setTargetAtTime(v, t, k) { this.events.push(['target', v, t, k]); return this; }
    cancelScheduledValues(t) { this.events = this.events.filter(e => e[2] < t); return this; }
    // roughly what the parameter is at time t: the events replayed (a ramp runs from the event before it)
    at(t) {
      let v = this.base, t0 = -Infinity;
      for (const [k, x, et, tc] of this.events) {
        if (k === 'set') { if (et <= t) { v = x; t0 = et; } }
        else if (k === 'lin') { if (et <= t) { v = x; t0 = et; } else if (t0 > -Infinity) { v = v + (x - v) * (t - t0) / (et - t0); break; } else { v = x; break; } }
        else if (k === 'target' && et <= t) { v = x + (v - x) * Math.exp(-(t - et) / tc); t0 = et; }
      }
      return v;
    }
  }
  class Node {
    constructor(ctx, kind) {
      this.ctx = ctx; this.kind = kind; this.id = ctx.nodes.length + 1; this.out = []; this.started = undefined; this.stopped = undefined;
      for (const [k, v] of Object.entries(PARAMS[kind] || {})) this[k] = new Param(ctx, v);
      ctx.nodes.push(this);
    }
    connect(to) { this.out.push(to); return to; }
    disconnect(to) { this.out = to ? this.out.filter(n => n !== to) : []; }
    start(t = 0) { this.started = t; }
    stop(t = 0) { this.stopped = t; }
  }
  class AudioBuffer {
    constructor({ length, sampleRate: sr = sampleRate, numberOfChannels = 1 }) { this.length = length; this.sampleRate = sr; this.numberOfChannels = numberOfChannels; this.duration = length / sr; this.ch = Array.from({ length: numberOfChannels }, () => new Float32Array(length)); }
    getChannelData(i = 0) { return this.ch[i]; }
    copyToChannel(a, i = 0) { this.ch[i].set(a); }
  }
  class AudioContext {
    constructor() {
      this.currentTime = 0; this.sampleRate = sampleRate; this.state = 'running'; this.nodes = []; out.ctx = this; out.contexts.push(this);
      this.destination = new Node(this, 'destination');
    }
    resume() { this.state = 'running'; } suspend() { this.state = 'suspended'; }
    createBuffer(numberOfChannels, length, sr) { return new AudioBuffer({ length, sampleRate: sr, numberOfChannels }); }
  }
  for (const [method, kind] of [['createGain', 'gain'], ['createBiquadFilter', 'biquadfilter'], ['createOscillator', 'oscillator'], ['createBufferSource', 'buffersource'],
    ['createStereoPanner', 'stereopanner'], ['createDelay', 'delay'], ['createConvolver', 'convolver'], ['createDynamicsCompressor', 'dynamicscompressor'], ['createConstantSource', 'constantsource']]) {
    AudioContext.prototype[method] = function () { return new Node(this, kind); };
  }
  // is `to` reachable from `from` through connections (an audio param counts as its node's input)?
  out.reaches = (from, to) => {
    const seen = new Set(), todo = [from];
    while (todo.length) { const n = todo.pop(); if (n === to) return true; if (seen.has(n)) continue; seen.add(n); for (const m of n.out || []) todo.push(m); }
    return false;
  };
  out.AudioContext = AudioContext; out.AudioBuffer = AudioBuffer; out.Param = Param; out.Node = Node;
  // nodes of a kind that are not connected to anything yet counted, and so on: small helpers for the assertions
  out.of = (kind, ctx = out.ctx) => ctx.nodes.filter(n => n.kind === kind);
  return out;
}
