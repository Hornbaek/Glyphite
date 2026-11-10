#!/usr/bin/env node
// MIDI files ↔ Pixelite songs from the command line (the SOUND STUDIO's [ MORE ] menu does the same in the page).
//
//   node tools/midi.mjs import <file.mid> [out.song.json] [--title "Name"] [--tracks 0,2,3]   a MIDI file → a song file, ready for games/<id>/music/
//   node tools/midi.mjs list <file.mid>                                                       the instruments in a file, numbered (for --tracks)
//   node tools/midi.mjs export <file.song.json> [out.mid]                                     a song file → a MIDI file
//
// What carries over (and what does not) is at the top of portal/assets/midi-core.mjs. After an import, run
// `node tools/song.mjs <game>` as for any song, and listen: General MIDI programs only roughly say which instrument was meant.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Sampler, formatSong } from './song.mjs';
import { songFromMidi, midiFromSong } from '../portal/assets/midi-core.mjs';

const args = process.argv.slice(2), flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const title = flag('--title'), tracks = flag('--tracks');
const [cmd, src, dst] = args;
const usage = () => { console.error('usage: node tools/midi.mjs import <file.mid> [out.song.json] [--title "Name"] [--tracks 0,2,3]\n       node tools/midi.mjs list <file.mid>\n       node tools/midi.mjs export <file.song.json> [out.mid]'); process.exit(2); };
if (!src || !['import', 'export', 'list'].includes(cmd)) usage();

try {
  if (cmd === 'list') {
    const { info } = songFromMidi(readFileSync(src), Sampler, {});
    for (const c of info.candidates) console.log(`${String(c.index).padStart(3)}  ${c.name.padEnd(28)} ${c.instrument.padEnd(12)} channel ${String(c.channel).padStart(2)}  ${c.notes} notes`);
  } else if (cmd === 'import') {
    const name = basename(src).replace(/\.midi?$/i, '');
    const only = tracks === undefined ? undefined : tracks.split(',').map(Number).filter(Number.isInteger);
    const { song, warnings, info } = songFromMidi(readFileSync(src), Sampler, { title, name, only });
    const out = dst || join(dirname(src), `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song'}.song.json`);
    writeFileSync(out, formatSong(song));
    console.log(`${out}: "${song.title}", ${song.bpm} BPM, ${song.bars} bars, ${info.tracks} tracks, ${info.notes} notes`);
    for (const w of warnings) console.warn(`note: ${w}`);
  } else {
    const { bytes, warnings } = midiFromSong(Sampler.check(JSON.parse(readFileSync(src, 'utf8'))), Sampler);
    const out = dst || src.replace(/(\.song)?\.json$/i, '') + '.mid';
    writeFileSync(out, bytes);
    console.log(`${out}: ${bytes.length} bytes`);
    for (const w of warnings) console.warn(`note: ${w}`);
  }
} catch (e) { console.error(`${src}: ${e.message}`); process.exit(1); }
