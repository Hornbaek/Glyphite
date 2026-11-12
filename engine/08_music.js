// ===================== ENGINE · what the music parts share: note names, base64 data, the beat =====================
// Kept apart from the Chip (08_chip.js) and the Sampler (13_sampler.js), which a game may leave out of its page (game.json "engine"),
// because the scene reads the beat every frame and games read it for lights that follow the music.
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
const noteName = n => n < 0 ? '---' : NOTE_NAMES[n % 12] + Math.max(0, Math.floor(n / 12) - 1);

// base64 text (e.g. a .mid file embedded in a game) → ArrayBuffer, for Chip.load
const b64buf = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;

// ---------- beat: a pulse that follows the music, for lights, glow and bloom ----------
// phase() is the musical position (in beats) of the music playing (the Sampler's song, else the chip's), -1 when nothing is. blink(t) is true during the first
// `duty` of every beat, and with no music blinks at `hz` instead, so lights that follow the beat still blink in silence.
// v jumps to 1 on every drum hit (a rising edge of the noise-drum level, which is what the listener hears now) and eases back
// to 0; hit(strength) fires it by hand for events of the game's own. pulse() is v scaled by setBeatPulse (0 = off by default).
let BEAT_K = 0;
// strength 0..1 scales every material's `beatGlow` and the bloom pulse together
function setBeatPulse(strength) { BEAT_K = clamp(+strength || 0, 0, 1); }
const Beat = {
  v: 0, last: 0, t: -1,
  meter() { return Sampler.playing ? Sampler.meter() : Chip.playing ? Chip.meter() : null; },
  phase() { const m = this.meter(); return m && m.beat >= 0 ? m.beat : -1; },
  blink(t, hz = 1.6, duty = .45) { const b = this.phase(); return b >= 0 ? b % 1 < duty : ((t * hz) | 0) % 2 === 0; },
  hit(strength = 1) { this.v = Math.max(this.v, clamp(strength, 0, 1)); },
  pulse() { return this.v * BEAT_K; },
  step(time) {
    const dt = this.t < 0 ? 0 : clamp(time - this.t, 0, .1); this.t = time;
    const m = this.meter(), d = m ? m.drum : 0;
    if (d >= 7 && d - this.last >= 4) this.hit(d / 14);
    this.last = d;
    this.v *= Math.exp(-dt / .16);
  }
};
