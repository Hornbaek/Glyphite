# Recipes: a plan for each kind of cue

Pick the nearest, then adapt it to the game. Every plan fills in the same five lines (state and feeling, key and mode, BPM, form
as a bar map, palette) and an arc. Bar numbers count from 1 here; the kit counts from 0. Tempo and instruments are heuristics [O]
from the playbook (`playbook.md`, part 4), mapped to the Sampler's instruments. Worked examples: `example-cheese-moon.mjs`
(reveal arc), `games/spacemouse/music/escape-velocity.song.json` (fast loop), `cargo-bay.song.json` (a gentler loop).

## A. A fast, cinematic loop (a chase, a dash, an action sector)

*Example: Escape Velocity (C minor, 164 BPM, 32 bars).*
- **Mode:** Aeolian (C minor). Progression `i - bVI - bIII - bVII` (Cm - Ab - Eb - Bb) for the hook; `iv - bVI - bIII - bVII` then `... V` for
  the lift; one chord a bar.
- **Form:** 4-bar intro (plays once) | A 8 (the hook) | B 8 (the broad theme, long notes) | A' 8 (the hook with more) | break 4 (thin,
  a roll back in). Loop from bar 5 to 32. The seam: the break's last beat is silent, then the crash lands on A.
- **Palette:** string ostinato in staccato 16ths (the engine) | synth bass in 8ths with an octave jump | `saw` lead (A) and `trumpet` (B) |
  `brass` power chords on the theme's rhythm | choir and strings pad in B | harp arpeggio in A' | four-on-the-floor kit: kick on the
  beats, snare and clap on 2 and 4, hats in 8ths then 16ths, ride in B, a roll with a tom run into every new section.
- **Arc:** intro swells (lane from 0.6 to 1 on the ostinato), A is the hook with the drive, B opens up (a different
  melody register and a different instrument), A' adds (octave brass, harp, 16th hats), the break thins out and builds a roll.
- **The hook:** a rising triad that lands on a pushed (syncopated) note and falls back, sequenced over the chords.

## B. An emotional main theme (a title, a victory, a quiet reveal)

- **Mode:** major with modal mixture (D or Eb major) or D Dorian. **BPM** 66-80. **Melody:** rising 5th or 6th, a stepwise answer,
  one octave leap at the climax, an appoggiatura on the cadence.
- **Progression (D):** A: `I - V/3 - vi - IV`; A': `I - iii - IV - iv` (the borrowed iv for ache); B: `vi - IV - I - V`, then
  `bVI - bVII - I` (Bb - C - D) for the lift; coda `IV - iv - I`.
- **Form (~2:30):** intro 4 (solo harp or piano) | A1 8 (solo flute, cello-range strings or voice) | A2 8 (strings join, a counter-line)
  | B 8 (horns join, crescendo) | pivot 1 bar, a whole step up | A3 8 (everything, choir: the climax at 65-75%) | coda 6 (solo again, Picardy or plagal).
- **Dynamics:** p, mp, mf, f, ff (A3), pp. Derive variants for the game: a menu loop (A1+A2 with a tail), a sparse exploration
  one (harmony only), a tragic one (minor, slower), a victory fanfare (the first four notes in brass).
- *Cheese Moon is this plan in F Lydian with a retained common tone in B.*

## C. A calm exploration loop (a quiet sector, a hub, the spacewalk)

- **Mode:** Lydian (wonder) or Dorian (melancholic beauty). **BPM** 60-90. **Harmony:** 2-4 bars a chord: `Fmaj7 - G/F - Fmaj7 - Em7`
  (F Lydian) or `Dm9 - G/D - Dm9 - Cadd9` (D Dorian); or a pedal with sus and add9 colours.
- **Palette:** pad, `harp` or `piano` arpeggios, a solo `flute`, a bell, a distant `choir` "ah". No drums, or a soft pulse that
  can be muted. **Melody in short phrases with long rests** (no more than ~40% of the bars carry the tune).
- **Form:** 64-96 bars (2.5-4 min). End on a chord that loops to bar 1. Make **three variations** of the loop body (the game picks
  one per play) and leave **30-120 s of silence** between plays (a game feature that does not exist yet: today a song loops without a gap).
- **Layers a game can use** (separate tracks, each complete alone): bed (always) | harmony pad | melody (mutable, off on the second pass) |
  a light pulse that fades in when an enemy is near and seeds the combat music.

## D. A boss or a hard fight

- **Mode:** Aeolian or Phrygian (D or C#). A motif on a b2 or a tritone. **BPM** 150-170; a 3+3+2 accent or a 7/8 bar for instability;
  half-time breakdowns.
- **Phases as separate songs** (the game switches on the boss's state, `Sampler.play(..., { fadeIn })`): phase 1 `i - bVI - bVII - i` over a pedal, an 8-bar A
  and B with 2 variations; phase 2 `i - bII - i - bVII` with denser rhythm; phase 3 (desperation) starts thin (solo choir or horns) and quotes the
  main theme, `bVI - bVII - I` (a Picardy lift) at the end. A short **victory stinger** (a non-looping song ending on I) and a **defeat**
  one (unresolved bII or a tritone).
- **Layers:** percussion + bass | string ostinato | brass motto | choir and lead; the game maps a "threat" or the boss's health to
  `Sampler.track` volumes.

## E. A platformer or chiptune level

- **Mode:** Ionian or Mixolydian. **BPM** 120-170, matched to the player's run. **Palette:** `square` and `pulse` leads, fast arpeggios
  instead of chords (one voice, the way the chips did it), a `synthbass` with syncopated 8ths, a plain kit. **Form:** an 8-bar loop of 30-90 s with a
  4-bar variation; a jingle for pickups and level end (short non-looping songs). Catchy beats clever: a hook in the first two bars.
  Set `snes: true` for the console's 8 voices and echo if the sound should be that constrained.

## F. Horror, suspense, stealth

- **Default is silence.** Beds of low drones (`slowstr`, `choir` on a tritone or cluster), a pulse that speeds up with the threat
  (a lane on tempo or on a track's volume), sparse `piano` or `bell` notes with long echo; **stingers** are short non-looping songs
  on a sudden threat. Locrian or clusters; no melody, or a melody that never resolves. BPM free, 50-80.

## G. Cozy, puzzle

- **Major or Lydian** with maj7 and add9, 80-110 BPM; `marimba`, `epiano`, `piano`, `harp`, a soft `flute`; no climax, loops of 2-3 minutes,
  a melody that is pleasant on the twentieth hearing; success stingers of the first four notes up a step.

## H. Choosing a tempo and checking it

Count how often the player's main action repeats (steps, jumps, shots) and make the beat a multiple or half of it. Tempo bands in
`craft.md` 3. If the game has a clock that runs out, a tempo change is a feature (`song.tempo`, a list of `[tick, bpm]`): Kondo sped
up Super Mario Bros.' music when time was low.
