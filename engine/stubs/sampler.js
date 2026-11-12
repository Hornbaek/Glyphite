// ===================== ENGINE · stand-in for the Sampler: this page was built without it =====================
// game.json's "engine" list does not name "sampler", so the page leaves out the 16-bit sampler (engine/13_sampler.js, 57 KB) and keeps this. The engine's
// own calls (Sfx starting the audio, the Beat asking for a meter, the studio's preview message) do nothing; a game that tries to play a song is told what to add.
const Sampler = new Proxy({ ctx: null, playing: false, forced: null, vol: .5, init() { }, stop() { }, setVolume() { }, force() { }, meter() { return null; } }, {
  get: (t, k) => k in t || typeof k !== 'string' ? t[k] : () => { throw new Error(`Sampler.${k}: this page was built without the sampler: add "sampler" to the "engine" list in game.json (engine/API.md, Smaller pages)`); }
});
