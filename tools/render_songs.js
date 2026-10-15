// Offline check: parse the embedded MIDI songs with the game's parser and render them through the chip.
// Run from anywhere: node tools/render_songs.js  -> writes music/*.wav
const fs = require('fs'), vm = require('vm');
process.chdir(require('path').join(__dirname, '..'));   // work from the repo root
const ctx = { clamp: (v, a, b) => v < a ? a : v > b ? b : v, performance, setInterval: () => 0, setTimeout: (f) => 0, atob: s => Buffer.from(s, 'base64').toString('binary'), console, Math, Uint8Array, Float32Array, Set, Object, Array, String, Error };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/07b_chip.js', 'utf8') + '\n' + fs.readFileSync('src/07c_songs.js', 'utf8') + '\nthis.Chip = Chip; this.SONG_DATA = SONG_DATA; this.b64buf = b64buf; this.parseMidi = parseMidi; this.chipLane = chipLane;', ctx);
const { Chip, SONG_DATA, b64buf } = ctx;
const SR = 44100;
// fake init without an AudioContext
Chip.ctx = { currentTime: 0, sampleRate: SR }; Chip.sr = SR; Chip.frameLen = Math.round(SR / 60);
Chip.hpR = Math.exp(-2 * Math.PI * 37 / SR); Chip.lpA = 1 - Math.exp(-2 * Math.PI * 14000 / SR);
Chip.gain = { gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} } };
for (let c = 0; c < 16; c++) { Chip.lanes.push(ctx.chipLane(c)); Chip.live.push(ctx.chipLane(c)); }
Chip.drum = { v4: 0, vol: 0, dec: 0, rate: 0, mode: 0, lfsr: 1, acc: 0, tlen: 0, tk: 0, f0: 0, f1: 0, tph: 0, tinc: 0 };
function wav(path, f32) {
  const n = f32.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path, b);
}
fs.mkdirSync('music', { recursive: true });
for (const key of Object.keys(SONG_DATA)) {
  const song = Chip.load(b64buf(SONG_DATA[key].b64));
  Chip.play(song, { loop: false });
  const total = Math.ceil((song.dur + 0.6) * SR), out = new Float32Array(total), B = 2048;
  const t0 = Date.now();
  for (let i = 0; i < total; i += B) { const n = Math.min(B, total - i); out.set(Chip.render(n, i / SR).subarray(0, n), i); }
  const ms = Date.now() - t0;
  let peak = 0, sum = 0, nan = 0; for (const v of out) { if (Number.isNaN(v)) nan++; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  // count loudness per beat to make sure every section actually sounds
  const secs = Math.floor(song.dur), quiet = [];
  for (let s = 0; s < secs; s++) { let e = 0; for (let i = s * SR; i < (s + 1) * SR; i++) e += out[i] * out[i]; if (Math.sqrt(e / SR) < .01) quiet.push(s); }
  console.log(key.padEnd(10), 'name', JSON.stringify(song.name), 'dur', song.dur.toFixed(2) + 's', 'notes', song.notes, 'ch', song.channels,
    '| render', ms + 'ms', '(' + (song.dur * 1000 / ms).toFixed(0) + 'x realtime)', '| peak', peak.toFixed(3), 'rms', Math.sqrt(sum / total).toFixed(3), 'NaN', nan, 'quiet secs', quiet.join(',') || 'none');
  wav(`music/${key}.wav`, out);
  Chip.halt();
}
