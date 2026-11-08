#!/usr/bin/env node
// "Cheese Moon", a sketch: the worked example for SKILL.md. F Lydian ("wonder", the cheese moon over the station), 72 BPM, 40 bars
// (about 2:13). Where Escape Velocity (games/spacemouse/music) is fast and loud from the first bar, this one follows the playbook's
// reveal arc, and each device below is named where it is used (bars here count from 0, as the kit does; the song's own note counts from 1):
//
//   intro   0-3    a harp vamp I - II, a bell hints at the theme (FRAGMENT: 2-3 notes, never the whole tune)
//   A1      4-11   a solo flute states the theme (rising 5th, stepwise answer, appoggiatura on the cadence), harp under it
//   A2     12-19   the same theme: strings join with a counter-line, a bass enters (octaves and fifths only)
//   B      20-27   a RETAINED COMMON TONE (C5) held while the chords move by chromatic mediant (F - Ab - Db - C); horns enter on
//                  the second half (one layer at a time), then choir (a NEW VOICE) and low toms; a CRESCENDO to bar 27, which
//                  stops dead on the last beat (SILENCE IS A NOTE)
//   A3     28-35   the theme again, unprepared, a WHOLE STEP UP (G Lydian) with an octave leap added and every voice in: the
//                  CLIMAX, at 28/40 = 70% of the song (the playbook says 60-75%)
//   coda   36-39   back to a solo flute with the theme's first notes, home to F
//
// Run: node .claude/skills/pixelite-song/example-cheese-moon.mjs <out.song.json>
import { track, put, putAll, hold, n, DRUM, hits, crash, song, writeSong, lint } from './songkit.mjs';

// chords: a bass root, and five ascending tones (harp arpeggio; pad = tones 1-3; choir = tones 2-4). Low notes are roots and fifths only.
const CH = {
  Fmaj7: { bass: n('F2'), t: [53, 60, 64, 69, 72] },
  'G/F': { bass: n('F2'), t: [53, 62, 67, 71, 74] },        // II over the tonic bass: the Lydian sound
  Dm7: { bass: n('D2'), t: [50, 57, 60, 65, 69] },
  Em7: { bass: n('E2'), t: [52, 59, 62, 67, 71] },
  Am7: { bass: n('A2'), t: [57, 64, 67, 72, 76] },
  Ab: { bass: n('Ab2'), t: [56, 63, 68, 72, 75] },           // chromatic mediant of F
  Dbmaj7: { bass: n('Db2'), t: [49, 56, 60, 65, 68] },       // bVI
  C: { bass: n('C2'), t: [48, 55, 60, 64, 67] },
  Gmaj7: { bass: n('G2'), t: [55, 62, 66, 71, 74] },
  'A/G': { bass: n('G2'), t: [55, 64, 69, 73, 76] },
  'F#m7': { bass: n('F#2'), t: [54, 61, 64, 69, 73] },
  Bm7: { bass: n('B2'), t: [59, 66, 69, 74, 78] }
};
const INTRO = ['Fmaj7', 'G/F', 'Fmaj7', 'G/F'];
const A = ['Fmaj7', 'G/F', 'Dm7', 'Em7', 'Fmaj7', 'G/F', ['Am7', 'Em7'], 'Fmaj7'];
const B = ['Fmaj7', 'Ab', 'Dbmaj7', 'C', 'Fmaj7', 'Ab', 'Dbmaj7', 'C'];
const A3 = ['Gmaj7', 'A/G', 'Em7', 'F#m7', 'Gmaj7', 'A/G', ['Bm7', 'F#m7'], 'Gmaj7'];
const CODA = ['Gmaj7', 'A/G', 'C', 'Fmaj7'];
const at = { intro: 0, A1: 4, A2: 12, B: 20, A3: 28, coda: 36 };

// the theme, 8 bars, [unit, length, note]: range F4-G5 (a 9th, singable); rises a 5th (F-C), answers by step, sequences
// (tears), then an appoggiatura (F5 over Em7 resolving down to E5) before the long cadence note
const THEME = [
  [[0, 4, 65], [4, 8, 72], [12, 4, 69]],
  [[0, 4, 71], [4, 8, 74], [12, 4, 72]],
  [[0, 4, 69], [4, 6, 74], [10, 2, 77], [12, 4, 76]],
  [[0, 8, 76], [8, 4, 74], [12, 4, 71]],
  [[0, 4, 69], [4, 8, 76], [12, 4, 72]],
  [[0, 4, 74], [4, 8, 79], [12, 4, 77]],
  [[0, 8, 76], [8, 4, 77], [12, 4, 76]],
  [[0, 12, 72]]
];
const up = (bars, semis) => bars.map(b => b.map(([u, l, nt]) => [u, l, nt + semis]));
// the theme a whole step up, its first leap widened to an octave (G4 - G5)
const THEME3 = up(THEME, 2); THEME3[0] = [[0, 4, 67], [4, 8, 79], [12, 4, 76]];

// a counter-line for the strings in A2: two long notes a bar, moving by step
const COUNTER = [[69, 67], [71, 69], [65, 62], [67, 64], [69, 72], [71, 74], [72, 71], [69, 69]];

const flute = track('Flute', 'flute', 0.7, 0.1, { sends: { echo: 0.35, reverb: 0.4 } });
const harp = track('Harp', 'harp', 0.52, -0.3, { sends: { echo: 0.3, reverb: 0.35 } });
const pad = track('Pad', 'slowstr', 0.45, 0.25, { chorus: { mix: 0.3 }, sends: { echo: 0, reverb: 0.55 } });
const strings = track('Strings', 'strings', 0.5, -0.15, { sends: { echo: 0, reverb: 0.4 } });
const bass = track('Bass', 'fingerbass', 0.62, 0, { sends: { echo: 0, reverb: 0.06 } });
const horns = track('Horns', 'brass', 0.45, -0.2, { sends: { echo: 0.05, reverb: 0.4 } });
const choir = track('Choir', 'choir', 0.3, 0, { sends: { echo: 0.1, reverb: 0.6 } });
const bell = track('Bell', 'bell', 0.6, 0.35, { sends: { echo: 0.55, reverb: 0.5 } });
const taiko = track('Taiko', 'kit', 0.4, 0, { eq: { high: -3 }, sends: { echo: 0, reverb: 0.3 } });

const halves = c => (Array.isArray(c) ? c : [c]);
// a harp arpeggio over a bar's chord(s); `units` is how much of the bar sounds (12 = it stops before the last beat)
const arp = (bar, c, vel, units = 16) => {
  const cs = halves(c).map(x => CH[x].t);
  const order = cs.length === 1 ? [0, 1, 2, 3, 4, 3, 2, 1] : [0, 1, 2, 3, 0, 1, 2, 3];
  order.forEach((i, e) => { if (e * 2 < units) put(harp, bar, e * 2, 2.4, cs[e < 4 ? 0 : cs.length - 1][i], e % 4 === 0 ? vel : vel - 18); });
};
const padBar = (bar, c, vel, len = 15.6) => halves(c).forEach((x, i, a) => hold(pad, bar, CH[x].t.slice(1, 4), len / a.length - (a.length > 1 ? 0.2 : 0), vel, i * 8));
// the bass: root on the first beat, its fifth on the third (never a third: the playbook's anti-mud rule)
const bassBar = (bar, c, vel = 80, units = 16) => halves(c).forEach((x, i, a) => {
  const r = CH[x].bass, at0 = i * (16 / a.length), half = 8 / a.length;
  if (at0 < units) put(bass, bar, at0, Math.min(half, units - at0) - 0.4, r, vel);
  if (at0 + half < units) put(bass, bar, at0 + half, Math.min(half, units - at0 - half) - 0.4, r + 7, vel - 14);
});

// ----- intro: a harp vamp, a bell that only hints (the first two, then three notes of the theme, an octave up) -----
INTRO.forEach((c, i) => arp(at.intro + i, c, 58 + i * 4));
putAll(bell, 1, [[0, 4, 77], [4, 8, 84]], 88);
putAll(bell, 3, [[0, 4, 77], [4, 8, 84], [12, 4, 81]], 88);

// ----- A1: the solo flute states the theme, harp under it -----
A.forEach((c, i) => { putAll(flute, at.A1 + i, THEME[i].map(([u, l, nt]) => [u, l - 0.2, nt]), i === 7 ? 80 : 86); arp(at.A1 + i, c, 70); });
// ----- A2: strings join (a counter-line), a bass enters -----
A.forEach((c, i) => {
  const bar = at.A2 + i;
  putAll(flute, bar, THEME[i].map(([u, l, nt]) => [u, l - 0.2, nt]), 90);
  arp(bar, c, 66); padBar(bar, c, 66); bassBar(bar, c);
  COUNTER[i].forEach((nt, k) => put(strings, bar, k * 8, 7.8, nt, 70));
});

// ----- B: a retained common tone over chromatic mediants; layers join one at a time; a crescendo into a stop -----
// the flute holds C5 (the 5th of F, the 3rd of Ab, the 7th of Db, the root of C), then climbs: F5, Ab5, C6, and G5 at the stop
const B_MELODY = [[[0, 16, 72]], [[0, 16, 72]], [[0, 16, 72]], [[0, 16, 72]], [[0, 16, 77]], [[0, 16, 80]], [[0, 16, 84]], [[0, 12, 79]]];
B.forEach((c, i) => {
  const bar = at.B + i, stop = i === 7 ? 12 : 16, ramp = i / 7;
  putAll(flute, bar, B_MELODY[i].map(([u, l, nt]) => [u, l - 0.2, nt]), Math.round(66 + 30 * ramp));
  arp(bar, c, Math.round(62 + 22 * ramp), stop);
  padBar(bar, c, Math.round(66 + 30 * ramp), stop - 0.4);
  bassBar(bar, c, 84, stop);
  if (i >= 4) hold(horns, bar, CH[c].t.slice(1, 4), stop - 0.4, Math.round(56 + 44 * (i - 4) / 3));   // horns: the second half
  if (i >= 6) hold(choir, bar, CH[c].t.slice(2, 5), stop - 0.4, 84 + (i - 6) * 8);                    // a new voice: bar 27, one bar before the climax
  if (i >= 4) hits(taiko, bar, [0, 8], DRUM.tomLow, Math.round(70 + 36 * (i - 4) / 3), 2);
});

// ----- A3: the climax: a whole step up, unprepared, every voice in, the theme in an octave spread -----
A3.forEach((c, i) => {
  const bar = at.A3 + i, m = THEME3[i];
  putAll(flute, bar, m.map(([u, l, nt]) => [u, l - 0.2, nt]), 100);
  putAll(strings, bar, m.map(([u, l, nt]) => [u, l - 0.2, nt]), 88);            // violins, with the flute
  putAll(horns, bar, m.map(([u, l, nt]) => [u, l - 0.2, nt - 12]), 96);         // horns an octave below
  putAll(bell, bar, m.map(([u, l, nt]) => [u, l - 0.2, nt + 12]), 70);          // bell an octave above
  arp(bar, c, 78); padBar(bar, c, 84); bassBar(bar, c, 96);
  halves(c).forEach((x, k, a) => hold(choir, bar, CH[x].t.slice(2, 5), 15.6 / a.length - (a.length > 1 ? 0.2 : 0), 96, k * 8));
  hits(taiko, bar, [0, 8], DRUM.tomLow, 112, 2); hits(taiko, bar, [12], DRUM.tom2, 84, 1);
});
crash(taiko, at.A3);

// ----- coda: back to a solo flute, the theme's first notes, home to F -----
putAll(flute, 36, [[0, 4, 67], [4, 12, 74]], 82);
putAll(flute, 39, [[0, 15, 72]], 76);
CODA.forEach((c, i) => {
  const bar = at.coda + i;
  arp(bar, c, 62 - i * 6, i === 3 ? 4 : 16);
  padBar(bar, c, 70 - i * 8);
  if (i < 3) bassBar(bar, c, 70); else put(bass, bar, 0, 15.6, CH.Fmaj7.bass, 66);
});
putAll(bell, 38, [[0, 4, 77], [4, 8, 84], [12, 4, 81]], 70);

const tracks = [flute, harp, pad, strings, bass, horns, choir, bell, taiko];
const s = song({
  title: 'Cheese Moon (sketch)', bpm: 72, bars: 40, tracks, loop: [0, 40],
  places: { note: 'A sketch for a calm moment (the Observation Deck, the spacewalk). F Lydian, 72 BPM, 40 bars. The theme is withheld until bar 5, climbs at bar 29 a whole step up. Not placed anywhere yet.' },
  master: { reverb: { size: 2.8, damp: 0.5, volume: 0.32 } }
});
if (process.argv[2]) writeSong(process.argv[2], s);
const warnings = lint(s);
console.log(warnings.length ? warnings.join('\n') : 'lint: no warnings');
