// The music director (Music, engine/07_sound.js) with a game's SONGS and SONG_AT, as tools/song.mjs writes them, against a recording Web Audio
// (tests/node/audio-mock.mjs): a song per place, crossfades, layers that carry over from song to song, stingers over the music, and the
// studio's preview taking the music over and giving it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine-harness.mjs';
import { makeAudio } from './audio-mock.mjs';

const GAME = `
const mkSong = (title, ...tracks) => Sampler.check({ format: 'pixelite-song', title, bpm: 120, bars: 1, tracks: tracks.map((t, i) => ({ name: t, instrument: i ? 'organ' : 'square', notes: [[0, 96, 60 + i, 100]] })) });
const SONGS = { calm: mkSong('Calm', 'lead', 'drums'), battle: mkSong('Battle', 'lead', 'drums', 'bass'), fanfare: mkSong('Fanfare', 'horn') };
const SONG_AT = { title: 'calm', levels: { 0: 'calm', 1: 'battle' }, other: ['fanfare'] };
`;
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const boot = async ({ start = true } = {}) => {
  const audio = makeAudio(), E = loadEngine({ audio, storage: new Map(), now: () => performance.now(), gameCode: GAME });
  E.ctx.__later = f => queueMicrotask(f);
  E.ctx.setTimeout = (f, ms, ...a) => { const t = setTimeout(f, ms, ...a); t.unref?.(); return t; };   // a timer the page would keep waiting for must not hold the test up
  E.run('Sampler.build.later = __later');
  if (start) { E.run('Sfx.init()'); await E.run('Music.preload()'); }
  return { E, audio, run: E.run, ctx: () => audio.ctx };
};
const title = () => `Sampler.song && Sampler.song.title`;

test('a place plays its song; the same place again does nothing; a level with no song of its own plays the title\'s', async () => {
  const { run, audio } = await boot();
  assert.equal(run("Music.place('title')"), true);
  assert.equal(run(title()), 'Calm'); assert.equal(run('Sampler.playing'), true);
  const gain = run('Sampler.gain'); const nodes = audio.ctx.nodes.length;
  for (let i = 0; i < 5; i++) run("Music.place('title')");
  assert.equal(audio.ctx.nodes.length, nodes, 'asking again for the place it is already in builds nothing');
  assert.equal(run('Sampler.gain'), gain);
  run('Music.place(7)'); assert.equal(run(title()), 'Calm', 'level 7 has no song: the title\'s, which already plays');
  assert.equal(run("Music.place('nowhere')"), false);
  assert.equal(run("Music.songAt(1)"), 'battle'); assert.equal(run("Music.songAt('fanfare')"), 'fanfare'); assert.equal(run("Music.songAt('calm')"), null, 'only songs placed by a note by name');
});

test('moving to another place crossfades: the old song fades out in its own deck, the new one fades in', async () => {
  const { run, audio, ctx } = await boot();
  run("Music.place('title')");
  run('globalThis.calmGain = Sampler.gain');
  run('Music.place(1)');
  assert.equal(run(title()), 'Battle'); assert.equal(run('Sampler.ghosts.length'), 1);
  assert.equal(run('Sampler.ghosts[0].song.title'), 'Calm', 'Calm plays on, fading');
  const t = ctx().currentTime, old = run('calmGain').gain;
  assert.ok(old.events.some(e => e[0] === 'lin' && e[1] === 0 && Math.abs(e[2] - (t + 1.5)) < 1e-9), 'the default crossfade is 1.5 s');
  run('Music.place(0, { fade: .2 })'); assert.equal(run(title()), 'Calm');
  assert.equal(run('Sampler.ghosts.length'), 2, 'and back again while the first fade still runs: two old decks fading');
  run("Music.stop({ fade: .1 })");
  assert.equal(run('Music.current'), null); assert.equal(run('Sampler.playing'), false);
});

test('a song whose instruments are not made yet starts when they are, and the page is not stalled meanwhile', async () => {
  const { run } = await boot({ start: false });
  run('Sfx.init()');
  assert.equal(run('Sampler.ready(SONGS.calm)'), false);
  run("Music.place('title')");
  assert.equal(run('Sampler.playing'), false, 'nothing plays yet: it is being made');
  assert.equal(run('Sampler.want !== null'), true);
  await tick(200);
  assert.equal(run('Sampler.playing && Sampler.song.title'), 'Calm');
});

test('before the first input the director only remembers; the song starts with the sound', async () => {
  const { run, audio } = await boot({ start: false });
  run("Music.place('title')"); run('Music.place(1)');
  assert.equal(audio.contexts.length, 0);
  run('Sfx.init()'); await tick(200);
  assert.equal(run(title()), 'Battle', 'the last one asked for');
});

test('layers: tracks come in and out by name, only when that changes, and carry over to the next song', async () => {
  const { run } = await boot();
  run("Music.place('title')");
  const strip = n => run(`Sampler.mix.strips[${n}]`);
  run("Music.layer('drums', false)");
  const ev = strip(1).mute.gain.events;
  assert.deepEqual([ev.at(-1)[0], ev.at(-1)[1]], ['target', 0]); assert.equal(strip(1).layer, 0); assert.equal(strip(0).layer, 1, 'the lead plays on');
  const n = ev.length; for (let i = 0; i < 20; i++) run("Music.layer('drums', false)");
  assert.equal(strip(1).mute.gain.events.length, n, 'saying it again is free: it can be called every frame');
  run("Music.place(1, { fade: .1 })");     // Battle: lead, drums, bass: the drums stay out in the new song
  assert.equal(run('Sampler.song.title'), 'Battle'); assert.equal(strip(1).mute.gain.value, 0, 'its drums start out'); assert.equal(strip(0).mute.gain.value, 1);
  run("Music.layer('drums', true)"); assert.equal(strip(1).layer, 1);
  run("Music.layers({ danger: ['drums', 'bass'] }); Music.layer('danger', false, { fade: .3 })");
  assert.equal(strip(1).layer, 0); assert.equal(strip(2).layer, 0, 'a named layer brings several tracks in and out');
  run("Music.layer('danger', true, { volume: .5 })"); assert.equal(strip(2).layer, .5);
  assert.equal(run("Music.layer('no-such-track', false)"), undefined, 'a layer no song has is harmless');
});

test('a stinger plays over the music on a deck of its own, ducking the music, which comes back when it ends', async () => {
  const { run, audio, ctx } = await boot();
  run("Music.place('title')");
  assert.equal(run("Music.stinger('fanfare')"), true);
  assert.equal(run('Sampler.ghosts.length'), 0, 'not a crossfade');
  assert.equal(run('Sampler.playing && Sampler.song.title'), 'Calm', 'the music goes on');
  const out = run('Sampler.out'), last = () => out.gain.events.at(-1);
  assert.deepEqual([last()[0], last()[1]], ['target', .35], 'ducked');
  assert.equal(run('Music.ducked'), 1);
  assert.equal(run('Music.decks.length'), 1);
  const dk = run('Music.decks[0]');
  assert.ok(dk !== run('Sampler') && dk.playing && dk.song.title === 'Fanfare', 'a second deck');
  assert.ok(audio.reaches(dk.gain, run('Sampler.dest')) && audio.reaches(run('Sampler.gain'), run('Sampler.dest')), 'both feed the music bus');
  assert.equal(run("Music.stinger('nope')"), false);
  // let the fanfare run to its end: the music comes back up
  ctx().currentTime = 5; dk.pump(); await tick(50);
  assert.equal(run('Music.ducked'), 0); assert.deepEqual([last()[0], last()[1]], ['target', 1], 'the music is let up again');
  assert.equal(run('Sampler.playing && Sampler.song.title'), 'Calm');
});

test('the studio previewing a song in the game takes the music over, and gives it back', async () => {
  const { run } = await boot();
  run("Music.place('title')");
  run("Sampler.force({ format: 'pixelite-song', title: 'Preview', tracks: [{ instrument: 'square', notes: [[0, 96, 60, 100]] }] })");
  assert.equal(run(title()), 'Preview');
  assert.equal(run("Music.place(1)"), false, 'the director keeps quiet meanwhile');
  assert.equal(run('Music.play("calm")'), false); assert.equal(run("Music.stinger('fanfare')"), false);
  assert.equal(run(title()), 'Preview');
  run('Sampler.force(null)');
  await tick(100);
  assert.equal(run('Sampler.forced'), null);
  assert.equal(run('Sampler.playing && Sampler.song.title'), 'Calm', 'the song the game last asked for plays again (Music.resume)');
});

test('songs of your own can be added; an unknown id says so only in dev', async () => {
  const { run } = await boot();
  run("Music.define('own', { format: 'pixelite-song', title: 'Own', tracks: [{ instrument: 'organ', notes: [[0, 96, 60, 100]] }] })");
  assert.equal(run("Music.play('own', { fade: .1 })"), true);
  await tick(100); assert.equal(run('Sampler.song.title'), 'Own');
  assert.equal(run("Music.play('ghost-song')"), false);
});
