// ===================== ENGINE · sound: effects (Sfx), sounds as data (defineSound), the music director (Music) =====================
// Sfx: procedural one-shots plus a filtered-noise "thrust hum" loop (engine(throttle) 0..1), all synthesised, started by the first input.
// Everything it plays goes through two buses: effects (the effects volume) and music (the Chip and the Sampler), then one master that
// mute switches off. The volumes and the mute are the player's: they are kept in localStorage (storeKey('sound')) and come back next time,
// and the settings screen (Pixelite.settings, part 16) shows and changes the same numbers through setVolumes() and `muted`.
// Sound that travels through air. In a vacuum (setAtmosphere 0, the default) a sound is heard at once at full volume, as if felt
// through the ground. With an atmosphere it arrives distance / 343 m/s later, and the farther it is the quieter and duller it
// is, so a flash can be followed by thunder you can count. Sfx.heard(x, y) says how a sound at (x, y) is heard; pass the result
// as the last argument of burst() / tone() / boom(). Sfx.place(x, y) says the same and adds where it is heard from (left or right,
// by how far from the listener it is) and, without air, how far it carries; Sfx.play uses it. The listener is the camera's centre
// unless GAME.listener() returns [x, y].
const HEARD_NOW = { delay: 0, gain: 1, muffle: 1, m: 0 };
const SFX_MASTER = .5;   // the master gain: headroom, so effects, Sampler and Chip together do not clip
const SOUNDS = {};       // name → sound (defineSound)
const Sfx = {
  ctx: null, master: null, sfxBus: null, musicBus: null, noiseBuf: null, engGain: null, engFilt: null, buzzGain: null,
  volumes: { music: 1, sfx: 1 }, _muted: false, _for: null,
  maxVoices: 24, voices: [], stats: { played: 0, dropped: 0, stolen: 0 },
  get muted() { this.load(); return this._muted; },
  // assigning it mutes (or not) at once; it is not kept by itself: setMuted() and toggle() keep it, and the settings do their own
  set muted(on) { this._for = GAME.id || ''; this._muted = !!on; this.applyVolumes(); },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.load();
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this._muted ? 0 : SFX_MASTER; this.master.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.volumes.sfx; this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.volumes.music; this.musicBus.connect(this.master);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      this.engFilt = c.createBiquadFilter(); this.engFilt.type = 'lowpass'; this.engFilt.frequency.value = 200;
      this.engGain = c.createGain(); this.engGain.gain.value = 0;
      src.connect(this.engFilt); this.engFilt.connect(this.engGain); this.engGain.connect(this.sfxBus); src.start();
      // mains hum for buzzing lamps and live wires: a 100 Hz sawtooth, filtered (buzz(level))
      const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 100;
      const hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 400; hf.Q.value = .8;
      this.buzzGain = c.createGain(); this.buzzGain.gain.value = 0;
      hum.connect(hf); hf.connect(this.buzzGain); this.buzzGain.connect(this.sfxBus); hum.start();
      Chip.init(c, this.musicBus); Sampler.init(c, this.musicBus);
      document.addEventListener('visibilitychange', () => { if (document.hidden) c.suspend(); else c.resume(); });
    } catch (e) { this.ctx = null; }
  },

  // ----- the player's volumes and mute: kept per game, read again at the first input -----
  load() {
    const id = GAME.id || '';
    if (this._for === id) return;
    this._for = id;
    try {
      const d = JSON.parse(localStorage.getItem(storeKey('sound')) || 'null');
      if (!d || typeof d !== 'object') return;
      for (const k of ['music', 'sfx']) if (Number.isFinite(d[k])) this.volumes[k] = clamp(d[k], 0, 1);
      this._muted = d.muted === true;
    } catch (e) { }
  },
  save() {
    try { localStorage.setItem(storeKey('sound'), JSON.stringify({ music: this.volumes.music, sfx: this.volumes.sfx, muted: this._muted })); } catch (e) { }
    // the settings system, when there is one (part 16), holds the same three numbers for the pause menu: keep them the same
    if (typeof SETTINGS !== 'undefined') { SETTINGS.music = this.volumes.music; SETTINGS.sfx = this.volumes.sfx; SETTINGS.mute = this._muted; saveSettings(); }
  },
  applyVolumes() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, .02); this.musicBus.gain.setTargetAtTime(this.volumes.music, t, .02);
    this.master.gain.setTargetAtTime(this._muted ? 0 : SFX_MASTER, t, .02);
  },
  // setVolumes({ music, sfx }): each 0..1 (1 = as made), kept for next time; a settings screen reads them back with getVolumes()
  setVolumes(v = {}) {
    this.load();
    for (const k of ['music', 'sfx']) if (v[k] !== undefined && Number.isFinite(+v[k])) this.volumes[k] = clamp(+v[k], 0, 1);
    this.applyVolumes(); this.save();
    return this.getVolumes();
  },
  getVolumes() { this.load(); return { music: this.volumes.music, sfx: this.volumes.sfx, muted: this._muted }; },
  setMuted(on) { this.load(); this._muted = !!on; this.applyVolumes(); this.save(); },
  toggle() { this.setMuted(!this.muted); },

  engine(th) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(th * .55, t, .05); this.engFilt.frequency.setTargetAtTime(160 + th * 520, t, .05);
  },
  // electrical buzz 0..1 (a dying tube, a live cable); set it every frame, e.g. from flickerAt() times how near the lamp is
  buzz(level) { if (this.buzzGain) this.buzzGain.gain.setTargetAtTime(clamp(level, 0, 1) * .09, this.ctx.currentTime, .015); },

  // ----- where a sound is -----
  listener() { return (GAME.listener && GAME.listener()) || [cam.x + R.cols / 2, cam.y + R.rows * ASPECT / 2]; },
  heard(x, y) {
    if (!(ATMOS > 0)) return HEARD_NOW;
    const l = this.listener();
    const m = Math.hypot(x - l[0], y - l[1]) * UNIT_M;   // metres
    return { delay: m / 343, gain: 1 / (1 + m / 120), muffle: Math.max(.2, 1 / (1 + m / 250)), m };
  },
  // heard() plus pan (-1 far left .. 1 far right: a sound at the edge of the screen is 85% to that side) and, in a vacuum, a distance gain
  // (full beside the listener, half at 1.5 screens' half-width, a fifth at 4.5: a far blast is felt, not as loud as a near one); with an
  // atmosphere the gain is heard()'s own. y may be left out: then only how far left or right counts.
  place(x, y) {
    const l = this.listener(), half = Math.max(8, R.cols / 2), dx = x - l[0], dy = (y === undefined ? l[1] : y) - l[1], d = Math.hypot(dx, dy);
    const h = this.heard(x, y === undefined ? l[1] : y);
    return { delay: h.delay, muffle: h.muffle, m: d * UNIT_M, pan: clamp(dx / half, -1, 1) * .85, gain: ATMOS > 0 ? h.gain : 1 / (1 + (d / (half * 1.5)) ** 2) };
  },

  // ----- voices: at most maxVoices sound at once; when a new one finds none free it takes the place of the quietest, or is dropped if it is quieter still -----
  admit(t, dur, vol) {
    const vs = this.voices, now = this.ctx.currentTime;
    for (let i = vs.length - 1; i >= 0; i--) if (vs[i].end <= now) vs.splice(i, 1);
    if (vs.length >= this.maxVoices) {
      let q = vs[0]; for (const v of vs) if (v.vol < q.vol) q = v;
      if (q.vol >= vol) { this.stats.dropped++; return null; }
      q.kill(); vs.splice(vs.indexOf(q), 1); this.stats.stolen++;
    }
    const v = { end: t + dur, vol, kill: () => { } }; vs.push(v); this.stats.played++;
    return v;
  },
  // end a voice quickly (5 ms): a stolen one
  fade(g, s) { const t = this.ctx.currentTime; try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, .004); s.stop(t + .03); } catch (e) { } },
  // where a voice's gain connects: straight to the effects bus, or through a panner when the sound has a place
  out(at) {
    if (!at.pan || !this.ctx.createStereoPanner) return this.sfxBus;
    const p = this.ctx.createStereoPanner(); p.pan.value = at.pan; p.connect(this.sfxBus); return p;
  },
  burst(dur, f0, f1, vol, type = 'lowpass', q = 1, at = HEARD_NOW) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + at.delay;
    vol *= at.gain; f0 *= at.muffle; f1 *= at.muffle;
    if (vol < .003) return false;
    const slot = this.admit(t, dur + .05, vol); if (!slot) return false;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = .7 + Math.random() * .4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(at)); s.start(t, Math.random()); s.stop(t + dur + .05);
    slot.kill = () => this.fade(g, s);
    return true;
  },
  // `to`: a frequency to slide to over the tone; `at`: where it is heard from (heard() or place())
  tone(freq, dur, vol = .15, type = 'square', delay = 0, at = HEARD_NOW, to = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay + at.delay;
    vol *= at.gain;
    if (vol < .003) return false;
    const slot = this.admit(t, dur + .02, vol); if (!slot) return false;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    if (to) { o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); }
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.out(at)); o.start(t); o.stop(t + dur + .02);
    slot.kill = () => this.fade(g, o);
    return true;
  },
  boom(p, at = HEARD_NOW) {
    this.burst(1.2 + p * .4, 900, 40, Math.min(1, .45 + p * .35), 'lowpass', 1, at); this.burst(.25, 3000, 400, .25, 'bandpass', .7, at);
    if (at.m > 100) this.burst(1.4 + p * .5 + at.m / 150, 300, 28, .45, 'lowpass', 1, at);   // far away: a long low rumble, thunder
  },
  launch() { this.play('launch'); },
  thud(v) { this.burst(.25, 300, 60, Math.min(.6, v * .06)); },
  pickup() { this.play('pickup'); },
  alarm() { this.play('alarm'); },
  win() { this.play('win'); },

  // ----- sounds as data (defineSound below) -----
  // Sfx.play(name, { x, y, pitch, vol }): the sound at a place in the world (omit x and y: right here, centred). pitch is a frequency
  // multiplier (2 = an octave up), vol scales it. Returns true when it played, false when it was dropped (no audio yet, an unknown name,
  // its `gap` or `limit`, or too many voices).
  play(name, o = {}) {
    const S = SOUNDS[name];
    if (!S) { if (DEV) { const n = devNear(name, Object.keys(SOUNDS)); console.warn(`Sfx.play: no sound "${name}"${n ? ` (did you mean "${n}"?)` : ''}`); } return false; }
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (S.gap && now - S.last < S.gap) return false;
    S.live = S.live.filter(t => t > now);
    if (S.limit && S.live.length >= S.limit) return false;
    const at = o.x === undefined ? HEARD_NOW : this.place(o.x, o.y), vol = (o.vol ?? 1) * S.vol;
    const mul = (o.pitch ?? 1) * (S.spread ? 1 + (Math.random() * 2 - 1) * S.spread : 1);
    let end = 0;
    for (const L of S.layers) {
      const d = L.delay || 0, v = (L.vol ?? 1) * vol;
      if (L.tone) { if (this.tone(L.tone * mul, L.dur ?? .15, (L.vol ?? .15) * vol, L.type || 'square', d, at, L.slide ? L.slide * mul : 0)) end = Math.max(end, now + d + at.delay + (L.dur ?? .15)); }
      else if (L.burst) { if (this.burst(L.burst, (L.from ?? 1000) * mul, (L.to ?? 100) * mul, (L.vol ?? .3) * vol, L.filter || 'lowpass', L.q ?? 1, d ? { ...at, delay: at.delay + d } : at)) end = Math.max(end, now + d + at.delay + L.burst); }
      else if (L.note !== undefined) {
        // the instrument is made between frames (defineSound asked for it): until it is, this layer is silent rather than a stall
        if (!L.ready) { if (!Sampler.ready([{ instrument: L.instrument || 'piano', rate: L.rate }])) continue; L.ready = true; }
        const dur = L.dur ?? .3, g = v * at.gain;
        if (g < .003) continue;
        const slot = this.admit(now + d + at.delay + .005, dur + (L.release ?? .6), g); if (!slot) continue;
        const nv = Sampler.note(L.instrument || 'piano', L.note, { vel: L.vel ?? 100, dur, rate: L.rate, pitch: mul, gain: g, pan: at.pan || 0, delay: d + at.delay, release: L.release, dest: this.sfxBus });
        if (!nv) { slot.end = 0; continue; }
        slot.end = nv.end; slot.kill = () => nv.cut(); end = Math.max(end, nv.end);
      }
    }
    if (end) { S.last = now; S.live.push(end); }
    return end > 0;
  }
};

// defineSound(name, recipe): a sound as plain data, played with Sfx.play(name, { x, y, pitch, vol }). A recipe is { vol, spread, limit, gap, layers }
// (or just the list of layers, or one layer), a layer one of
//   { tone: Hz, dur, vol, type: 'square', slide: Hz to slide to, delay }          an oscillator that fades out
//   { burst: dur, from: Hz, to: Hz, vol, filter: 'lowpass', q, delay }            filtered noise sweeping from one frequency to another
//   { note: 72, instrument: 'bell', dur, vel, rate, release, vol, delay }          one note of a Sampler instrument (engine/API.md, Sampler.note)
// vol scales the whole sound; spread (0.05 = ±5%) detunes every play a little so repeats do not sound alike; limit: at most this many of it at
// once; gap: seconds that must pass before it plays again. Defining a name again replaces it. The effects the engine plays itself
// (pickup, alarm, win, launch) are defined below, so a game can replace them.
const SOUND_KEYS = ['vol', 'spread', 'limit', 'gap', 'layers'];
const SOUND_LAYER_KEYS = ['tone', 'burst', 'note', 'dur', 'vol', 'type', 'slide', 'delay', 'from', 'to', 'filter', 'q', 'instrument', 'vel', 'rate', 'release'];
const soundOf = (name, recipe) => {
  const r = Array.isArray(recipe) ? { layers: recipe } : recipe && recipe.layers ? recipe : { layers: [recipe] };
  return { name, recipe: r, vol: r.vol ?? 1, spread: r.spread || 0, limit: r.limit | 0, gap: r.gap || 0, layers: (r.layers || []).filter(l => l && typeof l === 'object').map(l => ({ ...l })), last: -1e9, live: [] };
};
function defineSound(name, recipe) {
  const S = SOUNDS[name] = soundOf(name, recipe);
  devKeys(`defineSound('${name}')`, S.recipe, SOUND_KEYS);
  for (const l of S.layers) devKeys(`defineSound('${name}') layer`, l, SOUND_LAYER_KEYS);
  // instruments a note layer plays are made now, between frames, so the first play does not stall
  const ids = S.layers.filter(l => l.note !== undefined).map(l => ({ instrument: l.instrument || 'piano', rate: l.rate }));
  if (ids.length) Sampler.prepare(ids).catch(e => console.warn('defineSound', name, e));
  return name;
}
// (set up directly: the dev checks above need parts that load later)
for (const [name, recipe] of Object.entries({
  pickup: [{ tone: 1320, dur: .12, vol: .12, type: 'sine' }, { tone: 1760, dur: .18, vol: .1, type: 'sine', delay: .07 }],
  alarm: [{ tone: 880, dur: .09, vol: .08 }, { tone: 660, dur: .09, vol: .08, delay: .11 }],
  win: [523, 659, 784, 1047].map((f, i) => ({ tone: f, dur: .25, vol: .12, type: 'triangle', delay: i * .11 })),
  launch: { burst: .45, from: 2200, to: 300, vol: .35, filter: 'bandpass', q: 1.2 }
})) SOUNDS[name] = soundOf(name, recipe);

// ===================== ENGINE · the music director (Music) =====================
// A game says where it is, and the director plays the song for that place: it crossfades between songs, brings tracks (layers) in and
// out as the game's mood changes, and plays one-shot stingers over the music. It works on the Sampler's songs (the game's SONGS and
// SONG_AT, written by tools/song.mjs from the SOUND STUDIO's songs) and uses the Sampler's own deck, so Beat, Sampler.meter() and the
// studio's preview (Sampler.force) work as before. A song whose instruments are still being made starts when they are, never stalling
// a frame (Sampler.play's wait): Music.preload() at the start of the game makes them all in the idle time.
//   Music.place('title') / Music.place(levelIndex)    the song SONG_AT names for that place (a level with none plays the title's)
//   Music.play(id, { fade })                          this song, crossfading from the one playing; nothing happens if it already plays
//   Music.layer('danger', true)                       the tracks of that layer come in (false: out); only does anything when it changes
//   Music.stinger(id)                                 a short song over the music, which ducks under it; the music carries on
// They are plain calls, so a trigger or a hook can make them.
const Music = {
  current: null,    // the song asked for (it may still be getting ready)
  fade: 1.5,        // seconds of the crossfade, unless a call says otherwise
  extra: {},        // songs added with define()
  groups: {},       // layer name → the names of the tracks it brings in and out (a layer with no entry is the track of that name)
  levels: {},       // layer name → 0..1 for every layer set so far (they carry over to the next song)
  last: null,       // what play() was last asked, for resume()
  decks: [],        // the stingers that are playing (or ringing out)
  ducked: 0,        // how many of them hold the music down
  songs() { return { ...(typeof SONGS !== 'undefined' ? SONGS : {}), ...this.extra }; },
  places() { return typeof SONG_AT !== 'undefined' ? SONG_AT : { title: null, levels: {}, other: [] }; },
  // a song of your own, besides the game's SONGS
  define(id, song) { this.extra[id] = Sampler.check(song); return id; },
  // name layers: Music.layers({ danger: ['drums', 'bass'], calm: ['pad'] })
  layers(defs) { Object.assign(this.groups, defs); },
  // make the instruments of the songs (default: every song) between frames; a promise
  preload(ids) { const all = this.songs(); return Promise.all((ids || Object.keys(all)).filter(id => all[id]).map(id => Sampler.prepare(all[id]))); },
  // the id of the song SONG_AT gives a place: 'title', a level index (the title's song when the level has none), or a song id placed by a note only
  songAt(where) {
    const at = this.places();
    return where === 'title' ? at.title : typeof where === 'number' ? at.levels[where] ?? at.title : at.other.includes(where) ? where : null;
  },
  place(where, o) {
    if (Sampler.forced) { this.current = null; return false; }
    const id = this.songAt(where);
    return id ? this.play(id, o) : false;
  },
  play(id, { fade = this.fade, from = 0, loop = true, restart = false } = {}) {
    if (Sampler.forced) { this.current = null; return false; }   // the studio is previewing a song in this game: it has the say
    if (id === this.current && !restart) return true;
    const song = this.songs()[id];
    if (!song) { if (DEV) console.warn(`Music.play: no song "${id}"`); return false; }
    this.current = id; this.last = { id, o: { fade, from, loop } };
    Sampler.play(song, { from, loop, fadeIn: fade, crossfade: fade, wait: true, layers: s => this.mutedFor(s) });
    return true;
  },
  stop({ fade = 1 } = {}) { this.current = this.last = null; Sampler.stop(fade); },
  // after the studio's preview of a song ends (Sampler.force(null)) the song the game last asked for plays again
  resume() { const l = this.last; if (l) { this.current = null; this.play(l.id, l.o); } },
  tracksOf(name) { return this.groups[name] || [name]; },
  // the levels of the layers set so far, as the song's tracks
  mutedFor(song) {
    const out = {};
    for (const name in this.levels) for (const t of this.tracksOf(name)) out[t] = this.levels[name];
    return out;
  },
  layer(name, on = true, { volume = 1, fade = .5 } = {}) {
    const v = on ? clamp(+volume || 0, 0, 1) : 0;
    if (this.levels[name] === v) return;
    this.levels[name] = v;
    for (const t of this.tracksOf(name)) Sampler.track(t, { volume: v, fade });
  },
  // a song of one pass over the music (a fanfare, a death): the music ducks to `duck` of its level while it plays, then comes back
  stinger(id, { duck = .35, fade = .15, volume = 1 } = {}) {
    const song = this.songs()[id];
    if (!song || Sampler.forced || !Sampler.ctx) return false;
    const go = () => {
      const deck = Sampler.deck(); if (!deck) return;
      deck.setVolume(volume); Sampler.duck(duck, { fade }); this.ducked++; this.decks.push(deck);
      deck.play(song, { loop: false, onEnd: () => {
        if (--this.ducked <= 0) { this.ducked = 0; Sampler.duck(1, { fade: .8 }); }
        setTimeout(() => { deck.dispose(); this.decks.splice(this.decks.indexOf(deck), 1); }, 3500);   // the reverb and the echo ring on for a while after its last note
      } });
    };
    if (Sampler.ready(song)) go(); else Sampler.prepare(song, { first: true }).then(go, e => console.warn('Music.stinger', e));
    return true;
  }
};
