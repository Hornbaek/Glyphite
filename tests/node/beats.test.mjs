// The studio's beat and clip edits (portal/assets/beats-core.mjs): what they do to a song, and that the Sampler plays what they say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sampler as S } from '../../tools/song.mjs';
import { addBeat, newBeatId, usesOf, removeBeat, tidyBeat, setLength, stepVel, setStep, nextAccent, accentOf, ACCENTS, rowsOf, MAIN_ROWS, addClip, beatFromNotes, beatsOf, sortClips, clipEnd, repeatsOf, splitClip, trimStart, makeUnique, flattenClip } from '../../portal/assets/beats-core.mjs';

const song = (o = {}) => S.check({ format: 'pixelite-song', bpm: 120, bars: 8, tracks: [{ name: 'Drums', instrument: 'kit' }, { name: 'Lead', instrument: 'square' }], ...o });
const sound = s => JSON.stringify(S.notesOf(s, s.tracks[0]));

test('a new beat has an id nothing else has, a name, a bar, and may be removed only while no clip plays it', () => {
  const s = song();
  const a = addBeat(s), b = addBeat(s, { name: 'Fill', len: 2 * 384 });
  assert.deepEqual([a, b], ['beat-1', 'beat-2']);
  assert.deepEqual([s.patterns[a].name, s.patterns[a].len, s.patterns[b].name, s.patterns[b].len], ['Beat 1', 384, 'Fill', 768]);
  assert.equal(removeBeat(s, a), true); assert.equal(newBeatId(s), 'beat-1', 'a freed id is used again');
  const c = addClip(s.tracks[0], { at: 0, p: b, len: 768 });
  assert.deepEqual(usesOf(s, b), [{ track: 0, clip: 0 }]); assert.equal(c.off, 0);
  assert.equal(removeBeat(s, b), false, 'a clip still plays it'); assert.ok(s.patterns[b]);
  s.tracks[0].clips = []; assert.equal(removeBeat(s, b), true); assert.ok(!('patterns' in s), 'the field goes when the last beat does');
  assert.equal(addBeat(s, { len: 1 }) && s.patterns['beat-1'].len, 24, 'a beat is at least a 16th long');
});

test('a new beat\'s default name is not one another beat already has', () => {
  const s = song(), a = addBeat(s), b = addBeat(s);
  removeBeat(s, a);
  const c = addBeat(s);
  assert.deepEqual([s.patterns[b].name, s.patterns[c].name], ['Beat 2', 'Beat 3']);
});

test('tidyBeat keeps a beat\'s notes inside it, in time order', () => {
  const P = { len: 96, notes: [[48, 24, 38, 100], [90, 24, 36, 100], [96, 24, 42, 100], [200, 24, 42, 100], [0, 24, 36, 100]] };
  tidyBeat(P);
  assert.deepEqual(P.notes.map(n => n.slice(0, 2)), [[0, 24], [48, 24], [90, 6]], 'none at or after the end, one running past it cut, in order');
  setLength(P, 48); assert.deepEqual(P.notes.map(n => n[0]), [0]); assert.equal(P.len, 48);
});

test('steps: a hit goes on, changes its velocity, and comes off, at any step size, never twice', () => {
  const P = { len: 384, notes: [] };
  assert.equal(setStep(P, 36, 0, 100), true); assert.equal(setStep(P, 36, 0, 100), false, 'already there');
  assert.equal(setStep(P, 36, 4, 70), true); assert.equal(setStep(P, 38, 4, 120), true);
  assert.deepEqual(P.notes, [[0, 24, 36, 100], [96, 24, 36, 70], [96, 24, 38, 120]]);
  assert.equal(stepVel(P, 36, 4), 70); assert.equal(stepVel(P, 36, 5), 0); assert.equal(stepVel(P, 38, 4), 120);
  assert.equal(setStep(P, 36, 4, 127), true); assert.equal(stepVel(P, 36, 4), 127, 'the accent of a hit that is there changes it');
  assert.equal(P.notes.filter(n => n[2] === 36 && n[0] === 96).length, 1);
  assert.equal(setStep(P, 36, 4, 0), true); assert.equal(setStep(P, 36, 4, 0), false, 'nothing to take away'); assert.equal(stepVel(P, 36, 4), 0);
  assert.equal(setStep(P, 36, 16, 100), false, 'a step past the end of the beat'); assert.equal(setStep(P, 36, -1, 100), false);
  assert.equal(setStep(P, 42, 3, 100, 48), true); assert.deepEqual(P.notes.find(n => n[2] === 42).slice(0, 3), [144, 48, 42], 'eighth-note steps: step 3 is at 144 and a hit is an eighth long');
  assert.equal(stepVel(P, 42, 3, 48), 100);
  const t = { len: 30, notes: [] }; setStep(t, 36, 1, 100); assert.equal(t.notes[0][1], 6, 'a hit on the last, short step is cut at the beat\'s end');
});

test('accents go soft, medium, hard and round again, and a velocity belongs to the nearest', () => {
  assert.deepEqual(ACCENTS, [70, 100, 127]);
  assert.deepEqual([0, 70, 100, 127].map(nextAccent), [70, 100, 127, 70]);
  assert.deepEqual([10, 70, 85, 86, 100, 113, 114, 127].map(accentOf), [0, 0, 0, 1, 1, 1, 2, 2]);
  assert.equal(nextAccent(101), 127, 'a velocity between: the next one up');
});

test('the rows of the grid: the built-in kit, a kit of the song\'s own by its pads, and any other note the beat holds', () => {
  const s = song({ samples: { thump: { name: 'Big thump', rate: 16000, root: 60, loop: -1, brr: 'AAAAAAAAAAAA' } },
    kits: { k: { name: 'K', pads: [{ note: 60, sample: 'thump' }, { note: 61, sound: 'snare' }, { note: 36, sound: 'open' }] } },
    tracks: [{ instrument: 'kit' }, { instrument: 'drums:k' }] });
  const P = { len: 384, notes: [[0, 24, 99, 100], [0, 24, 38, 100]] };
  const built = rowsOf(S, s, s.tracks[0], P);
  assert.deepEqual(built.map(r => r.note), [...MAIN_ROWS, 99], 'the main sounds in their order; 38 is among them already, 99 is added');
  assert.equal(built[0].name, 'Kick'); assert.equal(built.at(-1).name, 'D#7');
  assert.deepEqual(rowsOf(S, s, s.tracks[1], P).map(r => [r.note, r.name]), [[60, 'Big thump'], [61, 'Snare'], [36, 'Open hat'], [38, 'Snare'], [99, 'D#7']], 'a pad is named for its sound, not for the General MIDI name of its note (36 is a kick there)');
});

test('a beat made of selected notes plays exactly what they played, where they were', () => {
  const s = song();
  s.tracks[0].notes = [[0, 24, 36, 100], [96, 24, 38, 100], [200, 24, 42, 90], [384, 24, 36, 100], [480, 24, 38, 100], [1000, 24, 49, 120]];
  const before = sound(s), picked = s.tracks[0].notes.slice(0, 5);
  const { id, clip } = beatFromNotes(s, s.tracks[0], picked, { name: 'Groove' });
  assert.deepEqual(clip, { at: 0, p: id, len: 768, off: 0 }, 'from the bar the first note is in to the end of the bar the last one ends in');
  assert.equal(s.patterns[id].name, 'Groove'); assert.equal(s.tracks[0].notes.length, 1, 'only the note that was not picked stays loose');
  assert.equal(sound(s), before, 'the same notes at the same ticks');
  assert.deepEqual(JSON.parse(JSON.stringify(S.check(s))).patterns, s.patterns, 'a song the Sampler would change is a song with a mistake in it');
  assert.deepEqual(S.check(s).tracks[0].clips, s.tracks[0].clips);
  // picked from later in the song
  const t = song(); t.tracks[1].notes = [[800, 48, 60, 100], [900, 48, 64, 100]];
  const r = beatFromNotes(t, t.tracks[1], t.tracks[1].notes.slice());
  assert.deepEqual(r.clip, { at: 768, p: r.id, len: 384, off: 0 }); assert.deepEqual(t.patterns[r.id].notes, [[32, 48, 60, 100], [132, 48, 64, 100]]);
  assert.equal(JSON.stringify(S.notesOf(t, t.tracks[1])), JSON.stringify([[800, 48, 60, 100], [900, 48, 64, 100]]));
});

test('clips are kept in time order and the beats are listed', () => {
  const s = song(), a = addBeat(s), b = addBeat(s);
  addClip(s.tracks[0], { at: 768, p: a, len: 384 }); addClip(s.tracks[0], { at: 0, p: b, len: 384 }); addClip(s.tracks[0], { at: 0, p: a, len: 96, off: 24 });
  assert.deepEqual(s.tracks[0].clips.map(c => [c.at, c.p, c.len, c.off]), [[0, a, 96, 24], [0, b, 384, 0], [768, a, 384, 0]]);
  assert.deepEqual(beatsOf(s).map(([id]) => id), [a, b]);
  assert.deepEqual(S.check(s).tracks[0].clips, s.tracks[0].clips);
});

// what the arranger does to clips: each must leave the track sounding as it says
const clipSong = () => {
  const s = song(), id = addBeat(s, { len: 384, notes: [[0, 24, 36, 100], [96, 24, 38, 90], [192, 24, 36, 100], [288, 24, 42, 80]] });
  const c = addClip(s.tracks[0], { at: 384, p: id, len: 1152 });   // three times round
  return { s, id, c, t: s.tracks[0] };
};
const at = (s, t) => S.notesOf(s, t).map(n => n[0] + ':' + n[2]).join(' ');

test('repeats: the notches where a looped clip comes round again', () => {
  const { s, c } = clipSong();
  assert.deepEqual(repeatsOf(s, c), [768, 1152]);
  assert.deepEqual(repeatsOf(s, { at: 400, p: c.p, len: 700, off: 100 }), [684, 1068], 'a trimmed start: the beat comes round 284 ticks in');
});

test('split: two clips of the same beat that sound exactly what the one did', () => {
  const { s, c, t } = clipSong(), before = at(s, t);
  const [a, b] = splitClip(s, t, c, 960);
  assert.deepEqual([a.at, a.len, a.off, b.at, b.len, b.off, b.p], [384, 576, 0, 960, 576, 192, c.p]);
  assert.equal(at(s, t), before, 'no note crosses the cut here, so nothing changes');
  assert.equal(splitClip(s, t, a, 384), null, 'not at the very start'); assert.equal(splitClip(s, t, a, 960), null, 'not at its end');
  assert.deepEqual(S.check(s).tracks[0].clips, t.clips);
});

test('trim the start: the end stays, the beat is shown from further in; earlier wraps round', () => {
  const { s, c, t } = clipSong();
  assert.equal(trimStart(s, c, 480), true);
  assert.deepEqual([c.at, c.len, c.off], [480, 1056, 96]);
  assert.equal(at(s, t).split(' ')[0], '480:38', 'the kick at the old start is not heard any more');
  assert.equal(trimStart(s, c, 384), true); assert.deepEqual([c.at, c.len, c.off], [384, 1152, 0], 'trimmed back: as it was');
  assert.equal(trimStart(s, c, 300), true); assert.deepEqual([c.at, c.len, c.off], [300, 1236, 300], 'earlier than the start: the beat from before it');
  assert.equal(trimStart(s, c, 1536), false, 'not past the end'); assert.deepEqual(S.check(s).tracks[0].clips, t.clips);
});

test('make unique: a copy of its own; the others stay linked', () => {
  const { s, id, c, t } = clipSong(), d = addClip(t, { at: 2000, p: id, len: 384 });
  const nid = makeUnique(s, id, [d]);
  assert.notEqual(nid, id); assert.equal(d.p, nid); assert.equal(c.p, id);
  s.patterns[nid].notes.push([48, 24, 49, 100]);
  assert.equal(s.patterns[id].notes.length, 4, 'the old beat is untouched'); assert.equal(s.patterns[nid].name, 'Beat 1 copy');
  assert.equal(usesOf(s, id).length, 1);
});

test('flatten: a clip becomes the track\'s own notes and the track sounds the same', () => {
  const { s, c, t } = clipSong(), other = addClip(t, { at: 2000, p: c.p, len: 384 }), before = at(s, t);
  t.notes.push([5, 10, 60, 100]); const before2 = at(s, t);
  flattenClip(S, s, t, c);
  assert.equal(t.clips.length, 1); assert.equal(t.clips[0], other);
  assert.equal(at(s, t), before2, 'the same notes at the same ticks'); assert.notEqual(before, before2);
  flattenClip(S, s, t, other); assert.ok(!('clips' in t), 'the field goes with the last clip');
  assert.equal(at(s, t), before2); assert.deepEqual(S.check(s).tracks[0].notes, t.notes);
});
