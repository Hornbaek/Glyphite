// Beats and clips for the SOUND STUDIO: what the BEAT grid and the arranger change in a song (song.patterns, track.clips: engine/API.md,
// "Patterns and clips"), kept apart from the page so it can be tested without one. Every function changes the song it is given in place and
// returns what it made; the studio wraps each in its undo step. A pattern is `{ name, len, notes, swing?, color? }` (ticks from its own start),
// a clip is `{ at, p, len, off }` (where it starts in the song, which pattern, how long it plays, where in the pattern it starts).

export const STEP = 24;   // a 16th, in ticks (the Sampler has 96 to a beat)
const MAX_LEN = 64 * 4 * 96;
const byTime = (a, b) => a[0] - b[0] || a[2] - b[2];
const clipOrder = (a, b) => a.at - b.at || (a.p < b.p ? -1 : a.p > b.p ? 1 : 0);

// ---------- beats ----------
export const beatsOf = song => Object.entries(song.patterns || {});
export function newBeatId(song, base = 'beat') {
  for (let n = 1; ; n++) { const id = `${base}-${n}`; if (!Object.prototype.hasOwnProperty.call(song.patterns || {}, id)) return id; }
}
// a new, empty beat (a bar long unless told); returns its id
export function addBeat(song, { name, len = 4 * 96, notes = [], swing, color } = {}) {
  song.patterns = song.patterns || {};
  const id = newBeatId(song), n = Object.keys(song.patterns).length + 1;
  song.patterns[id] = { name: String(name || `Beat ${n}`).slice(0, 40), len: Math.max(24, Math.min(MAX_LEN, Math.round(len))), notes };
  if (swing > 0) song.patterns[id].swing = swing;
  if (color) song.patterns[id].color = color;
  return id;
}
// the clips that play a beat: [{ track (index), clip (index in the track's clips) }]
export function usesOf(song, id) {
  const out = [];
  song.tracks.forEach((t, track) => (t.clips || []).forEach((c, clip) => { if (c.p === id) out.push({ track, clip }); }));
  return out;
}
// removes a beat nothing plays; false (and nothing changed) when a clip still does
export function removeBeat(song, id) {
  if (!song.patterns || !song.patterns[id] || usesOf(song, id).length) return false;
  delete song.patterns[id];
  if (!Object.keys(song.patterns).length) delete song.patterns;
  return true;
}
// a beat's notes belong inside it: none at or after its end, none running past it, in time order
export function tidyBeat(P) {
  P.notes = P.notes.filter(n => n[0] >= 0 && n[0] < P.len).map(n => { if (n[0] + n[1] > P.len) n[1] = P.len - n[0]; return n; }).sort(byTime);
  return P;
}
export function setLength(P, len) { P.len = Math.max(24, Math.min(MAX_LEN, Math.round(len))); return tidyBeat(P); }

// ---------- the step grid ----------
// the velocity of the note that starts exactly on a step (0: none); step n is at n * stepTicks
export function stepVel(P, note, step, stepTicks = STEP) {
  const at = step * stepTicks, n = P.notes.find(x => x[2] === note && x[0] === at);
  return n ? n[3] : 0;
}
// puts a hit on a step (vel 1..127), or takes it away (vel 0); returns true when the beat changed
export function setStep(P, note, step, vel, stepTicks = STEP) {
  const at = step * stepTicks; if (at < 0 || at >= P.len) return false;
  const i = P.notes.findIndex(x => x[2] === note && x[0] === at);
  if (!vel) { if (i < 0) return false; P.notes.splice(i, 1); return true; }
  vel = Math.max(1, Math.min(127, Math.round(vel)));
  if (i >= 0) { if (P.notes[i][3] === vel) return false; P.notes[i][3] = vel; return true; }
  P.notes.push([at, Math.min(stepTicks, P.len - at), note, vel]); P.notes.sort(byTime);
  return true;
}
export const ACCENTS = [70, 100, 127];   // soft, medium, hard
// the next accent after a velocity (shift-click): soft, medium, hard, then soft again
export const nextAccent = vel => ACCENTS.find(a => a > vel + 3) ?? ACCENTS[0];
export const accentOf = vel => (vel <= 85 ? 0 : vel <= 113 ? 1 : 2);

// the rows of the grid for a track: the built-in kit's main sounds, or a kit of the song's own by its pads, then any other note the beat
// already uses (so nothing a beat holds is hidden). S is the Sampler.
export const MAIN_ROWS = [36, 38, 37, 39, 42, 46, 41, 45, 48, 49, 51, 70];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = n => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
const SOUND_NAMES = { kick: 'Kick', snare: 'Snare', hat: 'Closed hat', open: 'Open hat', tom: 'Tom', crash: 'Crash', ride: 'Ride', rim: 'Rim', clap: 'Clap', shaker: 'Shaker' };
export function rowsOf(S, song, track, P) {
  const rows = [], have = new Set();
  const add = (note, name) => { if (!have.has(note)) { have.add(note); rows.push({ note, name }); } };
  const ki = track.instrument.startsWith('drums:') && song.kits ? song.kits[track.instrument.slice(6)] : null;
  if (ki) for (const p of ki.pads) add(p.note, p.sample ? ((song.samples || {})[p.sample] || {}).name || p.sample : SOUND_NAMES[p.sound] || p.sound);   // (what the pad plays, not what General MIDI calls its note)
  else for (const n of MAIN_ROWS) add(n, S.KIT[n]);
  for (const n of P.notes.map(x => x[2]).sort((a, b) => a - b)) add(n, S.KIT[n] || noteName(n));
  return rows;
}

// ---------- clips ----------
// a clip of a beat in a track (kept in time order); returns it
export function addClip(track, { at, p, len, off = 0 }) {
  track.clips = track.clips || [];
  const c = { at: Math.max(0, Math.round(at)), p, len: Math.max(1, Math.round(len)), off: Math.max(0, Math.round(off)) };
  track.clips.push(c); track.clips.sort(clipOrder);
  return c;
}
// the loose notes of a track, picked out into a new beat and a clip that plays it where they were. The beat starts on the bar the first note
// is in and runs to the end of the bar the last one ends in. Returns { id, clip }.
export function beatFromNotes(song, track, picked, { name } = {}) {
  const bar = song.beatsPerBar * 96, set = new Set(picked);
  const a = Math.floor(Math.min(...picked.map(n => n[0])) / bar) * bar, b = Math.ceil(Math.max(...picked.map(n => n[0] + n[1])) / bar) * bar;
  const len = Math.max(bar, b - a);
  const id = addBeat(song, { name, len, notes: picked.map(([at, l, note, vel]) => [at - a, l, note, vel]) });
  tidyBeat(song.patterns[id]);
  track.notes = track.notes.filter(n => !set.has(n));
  return { id, clip: addClip(track, { at: a, p: id, len, off: 0 }) };
}

// ---------- what the arranger does to clips ----------
export const sortClips = track => { if (track.clips) track.clips.sort(clipOrder); return track; };
export const clipEnd = c => c.at + c.len;
const mod = (a, n) => ((a % n) + n) % n;
// the ticks where a clip's pattern comes round again (the notches to draw), inside the clip
export function repeatsOf(song, c) {
  const P = song.patterns && song.patterns[c.p], out = []; if (!P) return out;
  for (let t = c.at - c.off + P.len; t < clipEnd(c); t += P.len) if (t > c.at) out.push(t);
  return out;
}
// cut a clip in two at a tick inside it: the same beat, the second part starting where the first stopped; returns [first, second] or null
export function splitClip(song, track, c, tick) {
  const P = song.patterns && song.patterns[c.p]; tick = Math.round(tick);
  if (!P || tick <= c.at || tick >= clipEnd(c)) return null;
  const second = { at: tick, p: c.p, len: clipEnd(c) - tick, off: mod(c.off + tick - c.at, P.len) };
  c.len = tick - c.at; track.clips.push(second); sortClips(track);
  return [c, second];
}
// move a clip's start, its end staying where it is (a trim; going earlier shows the beat from before, wrapping round); false when it cannot
export function trimStart(song, c, newAt, min = 1) {
  const P = song.patterns && song.patterns[c.p]; newAt = Math.max(0, Math.round(newAt));
  if (!P || newAt > clipEnd(c) - min) return false;
  c.off = mod(c.off + newAt - c.at, P.len); c.len = clipEnd(c) - newAt; c.at = newAt;
  return true;
}
// a copy of a beat of its own (the clips given play the copy; the others stay linked to the old one); returns the new id
export function makeUnique(song, id, clips = []) {
  const P = song.patterns[id], nid = addBeat(song, { name: `${P.name} copy`.slice(0, 40), len: P.len, notes: P.notes.map(n => n.slice()), swing: P.swing, color: P.color });
  for (const c of clips) c.p = nid;
  return nid;
}
// a clip's notes written out as the track's own, the clip gone: the track sounds the same; returns the notes
export function flattenClip(S, song, track, c) {
  const out = []; S.clipNotes(song, { clips: [c] }, 0, Infinity, (at, len, note, vel) => out.push([at, len, note, vel]));
  track.clips = track.clips.filter(x => x !== c); if (!track.clips.length) delete track.clips;
  track.notes.push(...out); track.notes.sort(byTime);
  return out;
}
