#!/usr/bin/env node
// Songs from the SOUND STUDIO into a game. A game keeps its songs as games/<id>/music/<song-id>.song.json (a session saves
// them there from the site's database: CLAUDE.md, "Songs"); this checks each one with the engine's own Sampler.check, writes it
// back in one tidy layout (one note per line, so a diff shows what changed), and writes games/<id>/songs.js, the game part
// that holds them all as SONGS['<song-id>'] for Sampler.play. tests/node/songs.test.mjs fails if songs.js is out of date.
//
//   node tools/song.mjs <game>          (add "songs.js" to the game's game.json parts, before the code that plays them)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const Sampler = new Function(`${readFileSync(join(ROOT, 'engine/13_sampler.js'), 'utf8')}; return Sampler;`)();

// JSON with every array of plain numbers on one line
export const formatSong = song => JSON.stringify(Sampler.check(song), null, 1).replace(/\[[-\d.,\s]*\]/g, a => JSON.stringify(JSON.parse(a))) + '\n';

export function songsOf(game) {
  const dir = join(ROOT, 'games', game, 'music');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.song.json')).sort().map(f => ({ id: f.slice(0, -'.song.json'.length), file: join(dir, f), song: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}
export function songsJs(game) {
  const songs = songsOf(game);
  return `// ===================== GAME · songs (made by tools/song.mjs from music/*.song.json: change those, then run it) =====================
// Play one with Sampler.play(SONGS['<id>']) (engine/API.md, Sampler); the SOUND STUDIO (/studio/) made them.
const SONGS = {
${songs.map(s => `  ${JSON.stringify(s.id)}: ${JSON.stringify(Sampler.check(s.song))}`).join(',\n')}
};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const game = process.argv[2];
  if (!game || !existsSync(join(ROOT, 'games', game, 'game.json'))) { console.error('usage: node tools/song.mjs <game>'); process.exit(2); }
  const songs = songsOf(game);
  for (const s of songs) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.id)) { console.error(`${s.file}: the song id must be a-z, 0-9 and dashes`); process.exit(1); }
    writeFileSync(s.file, formatSong(s.song));
  }
  writeFileSync(join(ROOT, 'games', game, 'songs.js'), songsJs(game));
  const m = JSON.parse(readFileSync(join(ROOT, 'games', game, 'game.json'), 'utf8'));
  console.log(`wrote games/${game}/songs.js: ${songs.map(s => s.id).join(', ') || 'no songs'}${m.parts.includes('songs.js') ? '' : `\nadd "songs.js" to games/${game}/game.json's parts`}`);
}
