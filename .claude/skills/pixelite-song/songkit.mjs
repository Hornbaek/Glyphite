#!/usr/bin/env node
// A small kit for writing a Pixelite song as code (see SKILL.md). A song is plain data (engine/13_sampler.js, Sampler.check),
// so a session can compose by writing a script that calls put() for every note, then writing the JSON. Time is in bars and
// sixteenths ("units"): 4/4 only, 96 ticks per beat, so a unit is 24 ticks and a bar 384.
//
//   import { track, put, hold, writeSong, lint, ... } from '<this file>';       (example: example-cheese-moon.mjs)
//   node .claude/skills/pixelite-song/songkit.mjs lint games/<game>/music/<id>.song.json     (the checks in lint() below)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PPQ = 96, U = 24, BAR = 384;

// "F#4" → 66 (MIDI; middle C = C4 = 60)
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const n = name => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note name: ${name}`);
  return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1);
};

// General MIDI drum notes the kit instrument knows (Sampler.KIT)
export const DRUM = { kick: 36, rim: 37, snare: 38, clap: 39, snare2: 40, tomLow: 41, hat: 42, tom2: 43, pedalHat: 44, tomMid: 45, openHat: 46, tom3: 47, tomHigh: 48, crash: 49, tom4: 50, ride: 51, tamb: 54, crash2: 57, shaker: 70 };

// A track with the engine's defaults for everything left out; `extra` can hold sound, eq, filter, chorus, sends, auto, mute, solo
export const track = (name, instrument, volume = 0.6, pan = 0, extra = {}) => ({ name, instrument, volume, pan, notes: [], ...extra });

// One note: bar (from 0), start unit (0-15), length in units (may be fractional), MIDI note, velocity 1-127.
// A note that fills a bar should be about 15.6 units long so the next bar's attack is clean.
export const put = (t, bar, unit, len, note, vel = 100) => { t.notes.push([Math.round(bar * BAR + unit * U), Math.max(1, Math.round(len * U)), note, vel]); };
// Several notes at once: putAll(t, bar, [[unit, len, note, vel?], ...], defaultVel)
export const putAll = (t, bar, list, vel = 100) => list.forEach(([u, l, nt, v]) => put(t, bar, u, l, nt, v ?? vel));
// A sustained chord, all notes starting together
export const hold = (t, bar, notes, len = 15.6, vel = 90, unit = 0) => notes.forEach(nt => put(t, bar, unit, len, nt, vel));
// Remove a track's notes that start in [fromUnit, toUnit) of a bar (to make room for a fill or a breath of silence)
export const clear = (t, bar, fromUnit = 0, toUnit = 16) => { t.notes = t.notes.filter(([tick]) => !(tick >= bar * BAR + fromUnit * U && tick < bar * BAR + toUnit * U)); };

// A volume lane that is full everywhere except between two bars, where it ramps from `lo` to `hi`.
// (A lane holds the level of its first point before it, and of its last point after it, so a swell that only has the two
// points would turn the whole song down before it: that went wrong once and silenced a pad for 8 bars.)
export const swellLane = (fromBar, toBar, lo = 0.5, hi = 1) => ({ volume: [[0, 1], [fromBar * BAR - 1, 1], [fromBar * BAR, lo], [toBar * BAR, hi]].filter(([t], i, a) => i === 0 || t > a[i - 1][0]) });
// A lane that rises over bars [fromBar, toBar) and stays up; before it the level is `lo`
export const riseLane = (fromBar, toBar, lo = 0.3, hi = 1) => ({ volume: [[fromBar * BAR, lo], [toBar * BAR, hi]] });

// ----- drum helpers (a drums track from DRUM notes) -----
export const hits = (d, bar, units, note, vel = 100, len = 1) => units.forEach(u => put(d, bar, u, len, note, vel));
// a snare roll from `from` to the bar's end growing louder, the last four 16ths on toms (or `toms: false` for a plain roll)
export const roll = (d, bar, from = 8, { lo = 60, hi = 122, toms = true } = {}) => {
  for (let u = from; u < 16; u++) put(d, bar, u, 1, toms && u >= 12 ? [DRUM.tom4, DRUM.tomHigh, DRUM.tomMid, DRUM.tom2][u - 12] : DRUM.snare, Math.round(lo + (hi - lo) * (u - from) / (16 - from)));
};
export const crash = (d, bar, vel = 118) => { put(d, bar, 0, 4, DRUM.crash, vel); put(d, bar, 0, 1, DRUM.kick, vel + 4); };

// ----- the song -----
export const MASTER = { volume: 0.8, echo: { delay: 10, feedback: 0.36, fir: 'soft', volume: 0.26 }, reverb: { size: 2.4, damp: 0.5, volume: 0.28 }, eq: { low: 1, high: 0 }, comp: 0.45 };

// song({ title, bpm, bars, tracks, loop: [startBar, endBar] | false, places: { title, levels, note }, master })
export const song = ({ title, bpm, bars, tracks, loop = [0, bars], places = {}, master = {} }) => ({
  format: 'pixelite-song', version: 1, title, bpm, beatsPerBar: 4, bars, snes: false,
  loop: loop ? { on: true, start: loop[0] * BAR, end: loop[1] * BAR } : { on: false, start: 0, end: bars * BAR },
  places: { title: false, levels: [], note: '', ...places },
  master: { ...MASTER, ...master }, tracks
});
// Write it; `node tools/song.mjs <game>` (or the studio) tidies the layout and makes the game's songs.js
export const writeSong = (path, s) => { writeFileSync(path, JSON.stringify(s)); console.log(`${s.title}: ${s.tracks.map(t => `${t.name} ${t.notes.length}`).join(', ')}`); };

// ----- checks the playbook's rules can be tested with (returns warnings; an empty list is a pass) -----
export function lint(s, S = null) {   // S: the Sampler (tools/song.mjs exports it), so a track's clips count as the notes they play
  const out = [], end = s.bars * BAR, drums = t => t.instrument === 'kit' || t.instrument.startsWith('drums:'), voiced = s.tracks.filter(t => !drums(t) && !t.mute);
  const notesOf = t => (S && t.clips && t.clips.length ? S.notesOf(s, t) : t.notes);
  for (const t of s.tracks) {
    const N = notesOf(t);
    if (!N.length) { out.push(`${t.name}: no notes`); continue; }
    const pitched = !drums(t), late = N.filter(([tick, len]) => tick + len > end + 1).length;
    if (late) out.push(`${t.name}: ${late} note(s) run past the end of the song (${s.bars} bars)`);
    if (pitched) { const lo = Math.min(...N.map(x => x[2])), hi = Math.max(...N.map(x => x[2])); if (hi - lo > 48) out.push(`${t.name}: range of ${hi - lo} semitones, is that right?`); }
  }
  // mud: anything sounding below C3 (48) together should be octaves, fifths or fourths of each other (the playbook's anti-mud rule)
  const flat = voiced.flatMap(t => notesOf(t).map(([tick, len, nt]) => ({ tick, end: tick + len, nt, tr: t.name })));
  const muddy = new Set();
  for (const a of flat) {
    if (a.nt >= 48) continue;
    for (const b of flat) {
      if (b === a || b.nt >= 48 || b.tick > a.tick || b.end <= a.tick || b.nt === a.nt) continue;
      const iv = Math.abs(a.nt - b.nt) % 12;
      if (iv !== 0 && iv !== 5 && iv !== 7) muddy.add(Math.floor(a.tick / BAR));
    }
  }
  if (muddy.size) out.push(`low notes (below C3) that are not octaves or fifths of each other in bar(s) ${[...muddy].map(b => b + 1).join(', ')}`);
  // loop region
  if (s.loop.on && (s.loop.end > end || s.loop.start >= s.loop.end)) out.push('loop region is outside the song');
  // a bar with nothing in it (inside the song)
  for (let b = 0; b < s.bars; b++) if (!s.tracks.some(t => notesOf(t).some(([tick]) => tick >= b * BAR && tick < (b + 1) * BAR))) out.push(`bar ${b + 1} is empty`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== 'lint' || !process.argv[3]) { console.error('usage: node songkit.mjs lint <song.json>'); process.exit(2); }
  const { Sampler } = await import('../../../tools/song.mjs');   // (only the command line needs the engine: the kit itself does not)
  const warnings = lint(Sampler.check(JSON.parse(readFileSync(process.argv[3], 'utf8'))), Sampler);   // checked first: a clip written by hand has no `off` until it is
  console.log(warnings.length ? warnings.join('\n') : 'lint: no warnings');
  process.exit(warnings.length ? 1 : 0);
}
