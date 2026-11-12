// ===================== ENGINE · stand-in for the Chip: this page was built without it =====================
// game.json's "engine" list does not name "chip", so the page leaves out the NES-style synth (engine/08_chip.js, 20 KB) and keeps this. The engine's own
// calls (Sfx starting the audio, the Beat asking for a meter) do nothing; a game that tries to play with the Chip is told what to add.
const Chip = new Proxy({ ctx: null, song: null, playing: false, init() { }, halt() { }, stop() { }, setVolume() { }, meter() { return null; } }, {
  get: (t, k) => k in t || typeof k !== 'string' ? t[k] : () => { throw new Error(`Chip.${k}: this page was built without the chip synth: add "chip" to the "engine" list in game.json (engine/API.md, Smaller pages)`); }
});
