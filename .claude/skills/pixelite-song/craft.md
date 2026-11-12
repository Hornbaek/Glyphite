# Craft: what makes the music work

Distilled from the owner's report (`playbook.md`, "The Craft of Epic Cinematic and Game Music"), for writing songs on the Sampler.
Labels: **[E]** established (theory, research), **[C]** what composers report, **[O]** a heuristic: a default, not a law. Chords are
in C or in the key named; pitches are MIDI numbers (C4 = 60; `n('C4')` in the kit).

## 1. Harmony

**Modes** [E for the facts, O for the feelings]. Pick one on purpose:

| Mode | Colour | Use | Move (C root) |
|---|---|---|---|
| Lydian (#4) | wonder, flight, sci-fi awe | calm moments, the sky, discovery | I - II (C - D), Fmaj7 - G/F |
| Ionian | triumph, bright | fanfares, platformer | I - IV - V, I - V/vi |
| Mixolydian (b7) | heroic folk, adventure | overworld, rock-epic | I - bVII - IV - I |
| Dorian (natural 6 in minor) | noble, determined | resolve, Nordic/Celtic | i - IV (Cm - F) |
| Aeolian (b6, b7) | epic, tragic, war | action, trailers | i - bVI - bIII - bVII (Cm - Ab - Eb - Bb) |
| Phrygian (b2) | menace, ancient threat | villains, bosses | i - bII (Cm - Db) |
| Harmonic minor | danger, villain march (use sparingly) | | i - V7 - i, bVI - V |
| Locrian, whole-tone, clusters | dread, instability | horror | tritone pedals |

**Epic progressions** [E/analysis]: `i - bVI - bIII - bVII` (the minor-epic loop; Escape Velocity's A section), `I - bVI - bVII - I`
(heroic cadence in a major key), `i - bVII - bVI - bVII`, `bVII - IV - I`. A **slow harmonic rhythm** (a chord a bar or slower,
over a pedal) is the weight of the "Zimmer school"; faster, functional, chromatic changes (secondary dominants, mediants) are the
"Williams school", more adventure and whimsy. Both are valid: pick by the brief.

**Chromatic mediants** [E]: major or minor triads a third apart that share no key (C - Ab, C - E, C - Eb, C - A). They shift the
scale of a moment: wonder, magic, a bigger room. Hold a **common tone** across them (a melody note that is in both chords: C is
the 3rd of Ab and the 5th of F) and the move sounds earned. Use sparingly: one or two a phrase, unless the whole cue is
"pantriadic" on purpose (Cheese Moon's B section). A progression can itself be a motif (a leitmotif in harmony).

**Other devices** [E/O]: a **pedal** (tonic or dominant bass held under changing chords) holds tension cheaply; **sus2/sus4, add9
and open fifths** withhold the third (save it for the payoff); **planing** (parallel triads) is medieval when diatonic, uncanny
when chromatic; **quartal** (stacked 4ths) is open, modern, heroic sci-fi; **deceptive resolution** V - bVI is heartbreak;
**modulation for lift**: up a whole step for the last chorus, up a minor third for a bigger jump (an unprepared lift is a chills
trigger, see 5); **Picardy third** (a minor cue ending on a major tonic) is hope or acceptance.

## 2. Melody and motif

- **A theme is 2-8 notes of motif, 8-16 bars of tune, a range of about a 9th-10th** [O]: singable, memorable after one hearing.
  Atmospheric "sound identity" (a chord loop, a timbre) is a second kind of theme; a game wants one tune and a few of these.
- **Contour carries the feeling** [O, consistent with the research]: *heroic* opens on a rising 4th or 5th, then fills by step,
  octave leaps give aspiration, dotted rhythms and strong-beat arrivals give fanfare; *yearning* rising 6ths; *lament* descending
  steps, a descending bass tetrachord, **appoggiaturas** (an accented dissonance resolving down; tears in Sloboda's 1991 survey
  came most from sequences and appoggiaturas); *villain* minor 2nds, tritones, narrow low range; *mystery* narrow range, long
  notes, ending on a non-tonic degree; *Zimmer minimal* a few repeated notes, narrow range, stressed rhythm.
- **Sequences** (the same shape one step higher over the next chord) make a hook stick: Escape Velocity's A section is one idea
  sequenced over four chords.
- **Transform, do not replace** [E]: augmentation (longer notes: grandeur), diminution (shorter: urgency), inversion (the
  antagonist's mirror), **fragmentation** (the first 2-3 notes only: hints and stingers), reharmonization (the same tune over new
  chords), mode change (major to minor: triumph to tragedy), re-orchestration (solo to tutti), a **whole-step or octave lift**.
  A game's themes should be one tune in many guises (heroic, intimate, tragic, a victory fanfare of its first four notes).

## 3. Rhythm and tempo

- **Tempo follows the game** (Kondo's rule [C]: music that does not reflect the game's rhythm "might as well be piped in"). Bands [O]:
  lament 60-80; calm exploration 60-90; heroic march 90-120; action and chase 130-165; boss 140-180 (or half-time); platformer
  120-170; trailer builds 80-100 with double-time percussion at the climax. Space Mouse's Cargo Bay is 104 BPM (a cautious
  run through a dark station), Escape Velocity 164 (a dash).
- **Ostinati** [E/analysis]: a repeated 8th or 16th pattern is momentum at low cognitive load. Strings staccato (a short
  `sound.attack` ~0.01 s and release ~0.05 s on `strings`) at 16ths on a root-fifth pattern; accent beat 1 and let the rest sit at
  ~60% velocity. Build by *adding layers on a repeating block*, not by changing it.
- **Meter tricks** [O]: a 3+3+2 grouping implies drive in 4/4; 7/8 or 5/4 feels unstable and ancient (keep the downbeat strong). The kit
  assumes 4/4 (`beatsPerBar` is available but the helpers are 4/4).
- **Trailer vocabulary** [O]: braams (low brass and synth hits), risers (a snare roll that grows, `roll()`), impacts (crash + kick
  + low toms together), **a pre-drop silence of half a beat to two beats**, ticking pulses. Hybrid percussion: one designated
  source owns the sub (the synth bass *or* the kick, not both fighting).

## 4. Orchestration with the Sampler

**One job per register** [O]; role map for a full texture:

| Layer | Job | Register | Sampler instruments |
|---|---|---|---|
| Sub / foundation | roots and fifths only | E1-C3 (28-48) | `synthbass`, `fingerbass`, low `kit` toms |
| Body | sustained chords | C3-C5 (48-72) | `slowstr`, `strings`, `brass`, `choir`, `pad`, `organ` |
| Melody | the tune, doubled at the octave | C4-C6 (60-84) | `flute`, `oboe`, `trumpet`, `saw`, `square`, `brass` (octave below) |
| Rhythm engine | pulse | mid and low | staccato `strings`, `marimba`, `pizz`, `kit` |
| Air / sparkle | brightness without mass | C6+ | `bell`, `harp` (high), `piano`, `flute` |

**Anti-mud** [O]: below C3 (48) only octaves and fifths (close thirds blur; `songkit.mjs lint` checks it); thin the mid-range
(C3-C4) when brass and choir both sustain; double the melody an octave apart (flute with horns an octave below, bell an octave
above) instead of unison clumps; let one source own the sub. **Ranges** (comfortable, concert pitch): violin G3-E6, cello C2-A5
(tenor melody A3-A4), horn about F2-F5 (heroic C4-F5), trumpet E3-C6 (fanfare G4-C6; tiring held high), flute C4-C7 (weak low),
oboe Bb3-G6, choir S C4-A5 / A F3-D5 / T C3-A4 / B E2-D4. The Sampler's instruments are synthesized, so these are guides, but they
keep a part sounding like the instrument it is named after.

**Choir** [O]: open vowels (the `choir` instrument is an open "ah") are power; closed are intimacy or menace. A choir *entering* is the
strongest "new voice" you have. **One solo voice first** [C] (Wintory's cello): intimacy establishes the tutti as earned.
**Cultural vocabulary** [O]: do not use a generic "exotic" scale as a shorthand for a culture; research it or leave it out.

## 5. Form, tension and the psychology

- **Expectation** [E] (Meyer; Huron's ITPRA): the feeling comes from tendencies delayed, met or broken. Accurate prediction is
  itself rewarding (so repetition and familiar schemas feel good); a surprise gives a fast reaction that a slower appraisal can turn
  into thrill (a chromatic-mediant lift, a stop).
- **Chills** [E, correlational, modest samples; where they tend to happen, not a formula]: *new or unexpected harmonies* (shivers),
  *sequences and appoggiaturas* (tears), **a new voice entering**, loudness rises and crescendi, widening register, textural change,
  solo-against-tutti contrast. They **habituate** with repetition (Grewe 2007), so ration them: a full-theme tutti is for story
  beats, not every loop.
- **Craft rules from it** [O]:
  1. **Plan the reveal**: fragment the theme early, withhold the full statement, deliver it with a new voice on a crescendo.
  2. **Break one dimension at a time at the peak**: change the harmony *or* the texture *or* go silent; keep the rest predictable.
  3. **Contrast is the amplifier**: quiet before loud, solo before tutti; Inception's "Time" peaks, then is yanked back to a piano.
  4. **Climax at 60-75% of a linear piece** (the golden-section zone) and leave a denouement; in a trailer the biggest hit is near the end
     with a button.
  5. **Restraint and silence**: every loud section needs a reason; the stop before the climax is the cheapest big effect.
  6. **Build by layers**: one new layer every 4-8 bars, not everything from bar 1 (the "wall of epic" mistake).

## 6. Music in a game

- **A game's music is a system** [E]: it serves a state (danger, calm, success), reflects the game's rhythm, and is heard dozens
  of times. Exploration loops: 2-4 minutes, low-salience melody (or a melody track that can be muted), variations, silence between
  plays. Combat: layers by intensity. Boss: segments per phase. Puzzle: steady, non-melodic. Title: the main theme that loops cleanly.
- **Layering and sequencing on the Sampler**: *vertical* = tracks the game fades with `Sampler.track(name, { volume, fade })`
  (drums when the danger starts; `Music.layer(name, on)` does it by name and remembers it from song to song); *horizontal* = separate
  songs the game switches (`Music.place(...)` crossfades per place; `Music.stinger(id)` plays a one-shot over the music, ducking it).
  The engine has no quantized transitions yet (a crossfade starts at once, not on the bar line; `engine/API.md`, "The music director").
- **Leave room** for sound effects: the game's SFX are in the same mix; keep the melody and busy figuration out of the way of the
  sounds the player must hear (jumps, pickups, alarms), and the whole song at a modest level (the Music tunable can turn it down).
- **Keep a voice** [C]: pick two or three fingerprints (a favourite mode, an instrument, a harmonic gesture) and keep them across
  genres, so a game's songs sound like one place: reuse the instruments and the echo and reverb settings of the game's other songs.
