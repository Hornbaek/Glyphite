#!/usr/bin/env node
// MIDI files ↔ Pixelite songs from the command line (the SOUND STUDIO's [ MORE ] menu does the same in the page).
//
//   node tools/midi.mjs import <file.mid> [out.song.json] [--title "Name"]   a MIDI file → a song file, ready for games/<id>/music/
//   node tools/midi.mjs export <file.song.json> [out.mid]                     a song file → a MIDI file
//
// What carries over (and what does not) is at the top of portal/assets/midi-core.mjs. After an import, run
// `node tools/song.mjs <game>` as for any song, and listen: General MIDI programs only roughly say which instrument was meant.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Sampler, formatSong } from './song.mjs';
import { songFromMidi, midiFromSong } from '../portal/assets/midi-core.mjs';

const args = process.argv.slice(2), ti = args.indexOf('--title');
const title = ti >= 0 ? args.splice(ti, 2)[1] : undefined;
const [cmd, src, dst] = args;
const usage = () => { console.error('usage: node tools/midi.mjs import <file.mid> [out.song.json] [--title "Name"]\n       node tools/midi.mjs export <file.song.json> [out.mid]'); process.exit(2); };
if (!src || (cmd !== 'import' && cmd !== 'export')) usage();

try {
  if (cmd === 'import') {
    const name = basename(src).replace(/\.midi?$/i, '');
    const { song, warnings, info } = songFromMidi(readFileSync(src), Sampler, { title, name });
    const out = dst || join(dirname(src), `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song'}.song.json`);
    writeFileSync(out, formatSong(song));
    console.log(`${out}: "${song.title}", ${song.bpm} BPM, ${song.bars} bars, ${info.tracks} tracks, ${info.notes} notes`);
    for (const w of warnings) console.warn(`note: ${w}`);
  } else {
    const { bytes, warnings } = midiFromSong(Sampler.check(JSON.parse(readFileSync(src, 'utf8'))));
    const out = dst || src.replace(/(\.song)?\.json$/i, '') + '.mid';
    writeFileSync(out, bytes);
    console.log(`${out}: ${bytes.length} bytes`);
    for (const w of warnings) console.warn(`note: ${w}`);
  }
} catch (e) { console.error(`${src}: ${e.message}`); process.exit(1); }
