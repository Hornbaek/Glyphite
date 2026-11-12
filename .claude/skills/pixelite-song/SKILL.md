---
name: pixelite-song
description: Compose a song for a Pixelite game, or a sketch for the SOUND STUDIO - plan it from the game state (key and mode, tempo, form, who plays what, where the climax lands), write it as code with the song kit, check it (lint, offline render, per-track levels), and ship it (music/<id>.song.json, songs.js, places, docs). Use when the owner asks for a new song, theme, boss or level music, a title tune, a sketch, to change or critique an existing song, or to make music "epic", "cinematic", "catchy" or "calmer".
---

# Compose a song for Pixelite

A song is plain data (`engine/13_sampler.js`, `Sampler.check`; `engine/API.md`, Sampler): tracks of `[tick, length, note, velocity]`
on SNES-style sampled instruments, with echo and reverb. A session writes one as a script that calls `put()` for every note,
renders it offline to check the levels, and saves the JSON. The craft comes from the owner's playbook, distilled here:
`craft.md` (harmony, melody, rhythm, orchestration, psychology), `recipes.md` (a plan per kind of cue), `rubric.md` (a score
and the usual mistakes); the full report is `playbook.md` (books, composers, middleware, career: look there only for depth).

**You cannot listen.** Say so, check what numbers can check (below), and ask the owner to listen and say what to change. Never
claim a song "sounds" a certain way: say what you wrote and measured. Send them the render (`--wav`) with `SendUserFile`.

## The workflow

1. **Read the place.** Which game state is this for (title, a sector, a chase, a boss, a calm moment)? Read the game's
   `NOTES.md`, its `music/` and `songs.js` (`SONG_AT`), and what the player is doing there. Ask the owner only what changes
   the song: the state, the feeling, whether it loops, any instrument they want. Otherwise assume, and state the assumptions.
2. **Write the brief in five lines:** state and feeling; key and mode; BPM (matched to how the game moves, `craft.md` 3);
   form as a bar map; the palette (who plays which role). Pick a recipe in `recipes.md`.
3. **Plan the arc before a note.** Where is the climax (60-75% of a linear piece), what is withheld until then (a fragment of
   the theme early, the full tune late), what enters when (**one new layer every 4-8 bars**), where is the silence, and what
   does the loop do at its seam. For a loop: an intro that plays once (`loop.start` after it), 4- or 8-bar phrases.
4. **Theme first.** 2-8 notes of motif, an 8-bar tune of about a 9th in range, singable: rising 4th/5th, stepwise answer,
   a sequence, a cadence with an appoggiatura. Then the harmony under it, then bass and drums, then the arrangement.
5. **Write the script** from `example-cheese-moon.mjs` (a slow reveal arc) or read `games/spacemouse/music/escape-velocity.song.json`
   (fast, loop). Use `songkit.mjs`: `track`, `put`, `putAll`, `hold`, `hits`, `roll`, `song`, `writeSong`, `n('F#4')`.
6. **Check** (the loop: change, check, change - twice is usually enough):
   - `node .claude/skills/pixelite-song/songkit.mjs lint <song.json>` (mud below C3, notes past the end, empty bars, loop region).
   - `python3 -I .claude/skills/pixelite-song/levels.py <song.json> [--wav out.wav]`: peak under ~0.5, **no clipping**, whole-mix
     RMS near 0.08 at the loudest section (Cargo Bay and Escape Velocity are both 0.082, peak 0.43), a loudness *arc* that
     matches the plan (quiet start, climax the loudest, the stop really drops).
   - `... levels.py <song.json> --solo FROM TO [Track ...]`: each track alone. **Melody about as loud as the drums, bass a little
     under, the backing 1/3 to 1/2 of the melody.** Fix by faders, not by velocity everywhere.
   - Score it with `rubric.md`; fix what scores low.
7. **Ship.**
   - *For a game:* save as `games/<game>/music/<id>.song.json` (id: a-z, 0-9, dashes), set `places` (`{ title, levels: [level indices],
     note }`; **two songs must not claim the same place**, the build warns: narrow the old one), run `node tools/song.mjs <game>`
     (tidies the JSON, writes `songs.js`; `songs.js` must be in game.json's `parts` before `main.js`), then the game's
     verify loop (`pixelite-verify`: build, `npm test`, `python3 tests/smoke.py <game>`, and probe that the game picks the song at its
     place). Update the game's `NOTES.md`, `docs/HISTORY.md`, and `docs/ROADMAP.md` if it leaves follow-ups.
   - *As a sketch for the owner to open in the studio:* save it to D1, table `songs`, in the Sketches project (`game = ''`), see
     "Sketches" below. Nothing in the repository changes.
8. **Tell the owner** what you wrote (key, tempo, form in a line), what the numbers said, what to listen for and where to turn the
   knobs (the faders, the tempo, the `places`), and that it has not been heard.

## What the engine gives you (and the traps)

- **Roles to instruments** (`Sampler.INSTRUMENTS`): melody `flute` `oboe` `trumpet` `saw` `square` `pulse` `bell`; body `brass`
  `strings` `slowstr` `choir` `pad` `organ`; rhythm engine `strings` with a short `sound.attack` (staccato), `marimba`,
  `epiano`, `pizz`; air `harp` `bell` `piano`; bass `synthbass` `fingerbass`; drums `kit` (General MIDI notes in `DRUM`).
  One instrument per track: a section that changes instrument is a second track.
- **Track gain is `volume` squared**, so a fader of 0.5 is a quarter of the level. First mixes are wrong in the same ways: drums
  twice the melody, strings and choir pads inaudible. Measure, then set the faders.
- **An automation lane holds its first level before its first point and its last after the last.** A swell that only has its two
  points turns the track down for the whole song before it. Use `swellLane`/`riseLane` in the kit.
- **Loop:** `loop: [startBar, endBar]`. An intro before `startBar` plays once, then the song loops from `startBar`. A full
  render does not loop, so check the seam by ear-proxy: the last chord should lead to the first.
- **Velocity** shapes phrases (accent beat 1, ghost notes lower); **sends** (echo, reverb) give the room: melody and bell wet,
  bass and drums dry. The master has a compressor (`comp`), so a quiet song and a loud one come out at similar peaks: judge the
  *arc* by the per-bar RMS.
- **Stems:** the Sampler plays all tracks; a game brings a layer in or out with `Sampler.track(name, { volume, fade })`. Write
  each track so it is harmonically complete alone, if a game is going to mute it. `Music.layer(name, on)` does that by name, and a stinger is a short
  non-looping song the game plays over the music with `Music.stinger(id)` (it ducks the music; preload it with `Music.preload([id])`);
  songs change between places with a crossfade (`Music.place`, `engine/API.md`, "The music director"), not yet on the bar line.
- **MIDI in and out:** `node tools/midi.mjs import <file.mid>` makes a song from a MIDI file (a starting point to re-voice: check the
  instruments, volumes and the loop, then run it through `levels.py`); `export` writes a song as a .mid for other programs. Effects,
  automation and the song's own samples are not in a MIDI file.
- **Songs are data in the repository.** The studio copy in D1 changes nothing in a game until a session brings it over
  (`CLAUDE.md`, "Songs"). Keep the generator script in the session's scratchpad unless it is an example: the song file is the source.

## The rules the playbook boils down to (all checkable)

1. Serve the game state; match the game's rhythm (tempo from how the player moves).
2. One short, transformable theme; withhold, then reveal (a 2-3 note fragment early, the whole tune late, with a new voice entering).
3. Contrast makes size: thin before thick, a drop before the climax; build by adding one layer every 4-8 bars.
4. Change one dimension at a time at the peak (harmony, or texture, or silence), the rest stays predictable.
5. Below C3, only octaves and fifths. One job per register. Double the melody at the octave, not in a mid-range clump.
6. Slow harmonic rhythm (one chord a bar or slower) for weight; modes on purpose (`craft.md` 1).
7. Silence is a note. Ration the big devices (habituation is real: a loop heard fifty times loses its thrill).
8. Loops: bar-aligned, phrases of 4 or 8 bars, the exit leads to the entry; long loops get quieter melody or variations.
9. Label what you claim: theory, composer practice, or your own opinion.

## Sketches (for the studio)

A sketch is a song saved for the owner to open at `/studio/` (Sketches project). With the Cloudflare D1 connector
(`d1_database_query`, database `glyphite`, id `a3675d08-0fe6-43f0-989c-f3a5cdb3db39`; `CLAUDE.md`):

```sql
INSERT INTO songs (id, title, game, data, updated_at, updated_by) VALUES (?, ?, '', ?, ?, 'claude-session')
ON CONFLICT(id) DO UPDATE SET title = excluded.title, data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
```
`data` is the song JSON (under 1.5 MB), `updated_at` an ISO time. Check an id is free first (`SELECT id FROM songs WHERE id = ?`) and
never overwrite one the owner may have edited in the studio (its `updated_by` is their email): pick a new id. Read it back to verify.
