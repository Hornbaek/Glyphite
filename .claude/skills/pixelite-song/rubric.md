# Critique rubric (100 points) and the usual mistakes

Score a song before shipping it, and use it to critique one the owner brings. From the playbook (part 4.4), with the checks a
session can run. The honest ceiling: you cannot hear, so score *Mix* from the numbers and mark anything that needs ears
("needs a listen") instead of guessing.

| # | Criterion | Pts | Full marks, and how to check |
|---|---|---|---|
| 1 | Functional fit | 15 | Serves the stated state and feeling; tempo matches the game's pace. Check: the brief's five lines exist and agree with the notes |
| 2 | Thematic strength | 15 | A short, memorable, transformable idea, recognisable after one hearing; motifs reused. Check: the motif is 2-8 notes, the tune ~a 9th, it returns changed |
| 3 | Harmony and voice leading | 10 | A purposeful mode and progression, smooth voices, surprises on purpose. Check: chords named in the plan; any mediant has a common tone |
| 4 | Orchestration and register | 10 | One job per register, no low-end mud, idiomatic ranges, melody doubled at the octave. Check: `songkit.mjs lint` clean; the role table filled in |
| 5 | Form and tension arc | 10 | A real build and release, a climax at 60-75% (linear) or a clean seam (loop), contrast before the peak, silence used. Check: the per-bar RMS table follows the plan |
| 6 | Modularity | 15 | Clean loop point, 4- or 8-bar phrases, tracks that work alone, `places` set, documented. Check: loop region in bars; solo each stem (`levels.py --solo`); the seam leads |
| 7 | Repetition tolerance | 5 | Does not tire over ten loops: variations, a mutable melody track. Check: the loop length (>= 40 s for a calm cue), the hook not in every bar |
| 8 | Mix | 10 | Coherent space, clean sub, room for the sound effects, no clipping. Check: `levels.py`: peak < ~0.5, no clipped samples, melody ~ drums, backing 1/3-1/2 of the melody |
| 9 | Identity | 5 | A distinct palette or fingerprint, not a preset pastiche. Needs a listen |
| 10 | Delivery | 5 | The right files, ids, `places`, notes, history, tests green. Check: the ship list in SKILL.md step 7 |

Bands: **90+** ship; **75-89** strong, needs polish; **60-74** functional but generic or flawed; **below 60** rework.

## Mistakes and fixes

| Mistake | Fix |
|---|---|
| Everything loud from bar 1 ("wall of epic") | Start thin; add one layer every 4-8 bars; drop before the climax |
| Muddy low end (close thirds in low strings, bass fighting the kick) | Octaves and fifths below C3; one owner of the sub; `lint` |
| The theme stated in full in the first ten seconds | Fragment first; reveal at the climax with a new voice |
| No harmonic direction (four chords forever) | A lift (mediant, whole-step modulation), a textural reset, or a new voice |
| A loop that clicks, or whose end does not lead to its start | Bar-aligned `loop`, the last chord leads to the first, a rest on the last beat if the first bar is a downbeat hit |
| Layers that only work together | Solo each, and pairs; every track harmonically complete |
| An exploration loop with a catchy hook that tires | Put the hook on a track the game can mute; add silence; make variations |
| Hard cuts between states | Fade in (`Sampler.play(..., { fadeIn })`); a short bridge song; `Sampler.track` fades |
| A first mix with drums twice the melody | Measure (`levels.py --solo`); gain is volume squared: scale the *fader* by the square root of the level you want |
| A volume lane that mutes the song before its first point | A lane holds its first level before the first point: use `swellLane`/`riseLane` |
| "Exotic" scales as shorthand for a culture | Research the tradition, or leave it out |
| Ignoring the brief for personal style | Show the five-line brief and a plan first |
| Telling the owner it "sounds epic" | Say what you wrote and measured; ask them to listen |
