# The Craft of Epic Cinematic and Game Music: A Composer's and Critic's Playbook (Skill Source Report)

The best general-purpose game composer is not the person with the biggest orchestral sound. It is the person who can (1) write a short, transformable theme, (2) take it apart into loops, layers and stingers that a game engine can rearrange without breaking, and (3) change genre vocabulary on demand while keeping a recognizable voice. "Epic" is a specific, learnable set of techniques: modal and chromatic-mediant harmony, rising open intervals, ostinato-driven accumulation, register-aware brass/choir/low-percussion tutti, and planned expectation and release. Game craft adds interactivity, tolerance for repetition, and delivery discipline on top of that.

## TL;DR

- **Epic = controlled accumulation plus well-timed surprise.** Most "epic" effects come from a few devices. Aeolian/Dorian harmony with ♭VI–♭VII–I and chromatic-mediant moves; short ostinato modules repeated and thickened (Frank Lehman's "cathartic ostinato" in Zimmer's *Inception* "Time" repeats a four-bar block thirteen times);\[1\] and climaxes built from the events research ties to chills: new voices entering, crescendi, unprepared harmonies and sudden textural change.
- **Game music is a system, not a track.** Write themes and cues as modular segments (intro / loop body / transitions / tails / stingers), stems for vertical layering, and state maps for horizontal resequencing. Deliver them with tempo, bar and cue metadata that Wwise, FMOD or Unreal Quartz can quantize to. Keep music loudness inside the whole-game target (Sony's ASWG-R001: −24 LUFS ±2 for console, −18 for portable, −1 dBTP).
- **To become elite:** daily score study and transcription; orchestration and counterpoint fundamentals; fast mockups; middleware fluency; game jams and a portfolio of *interactive* demos. Business literacy matters too (the GameSoundCon 2025 survey reports an average AAA freelance rate of $1,871 per finished minute).\[2\] An AI skill can realistically produce briefs, chord and motif sketches, MIDI via Python, notation, orchestration plans, adaptive-system designs and rubric-based critique, but not finished audio production.

---

## How to read this report (evidence labels)

- **[E] Established/peer-reviewed:** music theory consensus, music-cognition research, official documentation or standards.
- **[C] Composer-reported:** what composers say they did, in interviews, blogs or GDC talks. It is reliable about intent, not proof of effect.
- **[O] Opinion/heuristic:** practitioner rules of thumb, including this report's recommendations. They are useful defaults, not laws.

---

## PART 1 — What makes epic cinematic music "epic"

### 1.1 Harmony

**Modal mixture and the "heroic" flat-side chords [E].** In a major key, borrowing ♭VI, ♭VII, ♭III and iv from the parallel minor gives a darker, broader, "older" sound than diatonic IV–V–I. The canonical epic cadence is **I–♭VI–♭VII–I** (in C: C–A♭–B♭–C). It replaces the leading-tone pull of V–I with two whole-step-adjacent major triads rising into the tonic. Its relative, **♭VII–IV–I**, is the "rock/heroic plagal" cadence.

**Aeolian/"leading-toneless" minor [E/analysis].** Frank Lehman's analysis of Zimmer finds that "natural minor/aeolian harmony is nearly obligatory for action marcatos," stressing the minor dominant (v) and subtonic (♭VII), with aeolian cadences such as iv7–v–i. The standard minor-epic loop **i–♭VI–♭III–♭VII** (Am–F–C–G) comes from this aeolian world. So does **i–♭VII–♭VI–♭VII** (Am–G–F–G).

**Modal colour cheat sheet [E for the mode facts, O for the associations]:**

| Mode | Characteristic degree | Typical epic/game use | Signature move (in C-root terms) |
|---|---|---|---|
| Lydian | ♯4 | wonder, flight, magic, "sci-fi awe" | I–II (C–D) vamp |
| Ionian | — | triumphant fanfare, Nintendo-bright | I–IV–V, I–V/vi |
| Mixolydian | ♭7 | heroic folk, adventure, rock-epic | I–♭VII–IV–I |
| Dorian | ♮6 in minor | noble melancholy, Celtic/Nordic, determined heroes | i–IV (Cm–F) |
| Aeolian | ♭6, ♭7 | trailer epic, war, tragedy | i–♭VI–♭III–♭VII |
| Phrygian | ♭2 | menace, villains, desert/"ancient" threat | i–♭II (Cm–D♭) |
| Harmonic minor | ♮7 with ♭6 | villain marches, "exotic" danger (use with care) | i–V7–i, ♭VI–V |
| Locrian / whole-tone / octatonic | ♭5 / symmetrical | horror, dream, instability | tritone pedals, diminished planing |

**Chromatic mediants [E].** These are triads whose roots lie a major or minor third apart *and* that do not share a key (C–A♭, C–E, C–E♭, C–A).\[3\] They pair a distant root with smooth voice leading via a common tone.\[4\] Lehman's *Hollywood Harmony* (Oxford, 2018) argues that "pantriadic" chromaticism has become Hollywood's style topic for **wonder**.\[5\]\[6\] His *Music Theory Online* article "Hollywood Cadences" (2013) shows chromatic-mediant cadences becoming a *default* in John Williams, with *Jurassic Park* as the case study.\[7\] Neo-Riemannian labels make these moves easy to discuss:
- **P** (parallel): C→Cm
- **L** (leading-tone exchange): C→Em
- **R** (relative): C→Am
- **Compounds:** PL (C→A♭), LP (C→E), RP (C→E♭/A), and H "hexatonic pole" (C→A♭m, a spooky or uncanny move)

**Leitharmony: harmony as a theme [E/analysis].** Lehman documents Zimmer and Newton Howard's *Dark Knight* trilogy reusing a pantriadic sequence (Dm–B♭–Fm–D♭–E♭m–B–Dm) to signal escalating threat. He shows the *Inception* motif shifting chords (Gm–G♭–E♭–C♭maj7) under a retained B♭ common tone, a transformational structure he notes is identical to the *Vertigo* love theme.\[8\] Takeaway: a *chord progression* can be a leitmotif.

**Zimmer-style vs Williams-style harmony [E/analysis + O]:**

| Dimension | "Zimmer school" (RCP lineage) | "Williams school" (late-Romantic/Golden Age lineage) |
|---|---|---|
| Harmonic rhythm | slow; 1 chord per bar or slower; long pedals | faster; chords change on beats; frequent secondary dominants |
| Vocabulary | diatonic/aeolian, tonal ambiguity (Lehman: each chord in "Time" can "lay claim to the mantle of tonic") | functional plus chromatic: mediants, modal mixture, jazz-informed extensions |
| Growth | additive layering and production (Nolan: "a minimalist composer with a sort of maximalist production sense") | developmental: motivic variation, counterpoint, modulation |
| Texture | "chordy" close-position triads; middle register often static | independent lines, countermelodies, idiomatic orchestration |
| Risk | interchangeable action cues (critique by Buhler & Neumeyer, quoted by Lehman) | can feel "old-fashioned" or over-busy for modern mixes |

Lehman disagrees with Buhler and Neumeyer here. He finds Zimmer's epic style "brimming with strongly individualizing stylistic markers." The skill should present both as valid toolkits and pick by brief.

**Other core devices [E for definitions, O for when to use them]:**
- **Pedal points:** a tonic or dominant pedal under changing chords holds tension cheaply. A low-string or synth sub pedal under i–♭VI–♭VII is the trailer default.
- **Sus2/sus4, add9 and open fifths:** they withhold the third, which gives modal ambiguity and a "big, ancient" open sound. Save the third for the payoff, such as a major third arriving at a Picardy moment.
- **Planing:** parallel triads or fifths moving in lockstep (Debussy to Shore to fantasy RPGs). Diatonic planing is "medieval"; chromatic planing is "uncanny."
- **Quartal/quintal harmony:** stacked 4ths and 5ths are open, modern, "heroic sci-fi" or Copland-esque. Clusters (2nds) suit horror and texture.
- **Deceptive resolutions:** V–♭VI (instead of V–I) for heartbreak; V–vi to extend a phrase.
- **Modulation for lift:** a whole step up for the final chorus (pop "truck-driver" lift). Up a minor third for a bigger jump. Chromatic-mediant key shifts (C→E or C→A♭) for transcendence. Lehman's chapter list even names "pump-up schemes" as a Hollywood tonal practice.
- **Picardy third:** a minor-key cue ends on a major tonic for hope or tragic acceptance.
- **Lehman's "consequential chorale" [E/analysis]:** Zimmer's slow, close-voiced, suspension-laden minor chorales, often reaching root-position i via a leaping V6 approach, used for gravitas, sacrifice and loss.

### 1.2 Melody and motif

**Leitmotif technique [E].** Assign a short, recognizable idea (2–8 notes, or a harmonic or timbral "sound") to a character, place or concept, then *transform* it as the drama changes. Game examples follow below: Bear McCreary's *God of War* themes, and Austin Wintory's single evolving theme in *Journey*.

**Intervallic rhetoric [O, widely taught; consistent with cognition research on contour and expectation]:**
- **Heroic/noble:** opens with a rising perfect 4th or 5th, often followed by stepwise fill. Octave leaps give aspiration. Rising major 6ths give yearning and romance. Dotted rhythms and strong-beat arrivals give fanfare character.
- **Tragic/lament:** descending steps; a descending chromatic or diatonic tetrachord bass (the lament bass); appoggiaturas, meaning accented dissonant notes resolving down. In Sloboda's 1991 survey, tears were most reliably evoked by passages with melodic sequences and appoggiaturas.
- **Villainous:** minor 2nds, tritones, Phrygian ♭2, low-register narrow range, minor-mode marches.
- **Mysterious/atmospheric:** narrow ambitus, long notes, modal ambiguity, motifs that end on non-tonic degrees.
- **Minimalist heroic (Zimmer school):** few notes, narrow range. Lehman describes Batman's material as a "grim minor third" and marcato mottos as built on note repetition and trochaic ("taa-taa-taa-TA-daa") stress.

**Singable vs atmospheric themes [O].**
- Singable themes are what players hum, what concerts sell and what menus can carry: stepwise core, one memorable leap, a range of about a 10th, clear 4- or 8-bar phrasing.
- Atmospheric themes are a harmonic or timbral identity (an *Inception*-style chord loop, a processed instrument).
- A general composer needs both. Use one singable main theme per game plus several "sound identity" motifs.

**Motif transformation toolkit [E]:**

| Transformation | What it does | Dramatic use |
|---|---|---|
| Augmentation | longer note values | grandeur, finale, solemn reprise |
| Diminution | shorter values | urgency, action variant |
| Inversion | flips intervals | antagonist mirror, "corrupted" hero |
| Retrograde | reverses order | rarely audible; use for puzzles or easter eggs |
| Fragmentation | first 2–3 notes only | tension, stingers, hints before the reveal |
| Reharmonization | same melody, new chords (e.g., major→♭VI underneath) | changed meaning without changing the tune |
| Mode change | major↔minor/Dorian/Phrygian | triumph↔tragedy, hero↔villain |
| Re-orchestration | solo instrument→tutti, folk→orchestra | intimacy↔spectacle (McCreary's Kratos theme "graduates up to bigger and bigger orchestral phrases, ultimately arriving at a blasting fanfare in brass and choir") |
| Tempo/meter change | e.g., 4/4 march → 3/4 lullaby or 7/8 battle | character shift, culture shift |

### 1.3 Rhythm and pulse

- **Ostinati [E/analysis].** Repeated 8th or 16th patterns in strings (spiccato or col legno), low synths or percussion supply momentum with low cognitive load. Lehman ties Zimmer's repetition to its "small size—and thus low cognitive load," which leads listeners "blissfully along."
  - Typical action string ostinato: 16ths at 120–150 BPM on a tonic pedal, accenting a 3+3+2 grouping (dotted-quarter/dotted-quarter/quarter) to imply drive without changing meter [O].
- **Tempo bands [O]:**
  - lament/emotional: 60–80 BPM
  - heroic march/anthem: 90–120
  - action: 130–160 (Lehman cites the *Drop Zone* marcato cue at 152 BPM)
  - boss/metal: 140–180+ (or half-time feel)
  - trailer builds: often 80–100 with double-time percussion at the climax
- **Asymmetric meters [O].** 5/4, 7/8 or alternating 6/8+5/8 make fight music feel unstable and "ancient." Keep the downbeat and the percussion strong so players can still entrain.
- **Trailer vocabulary [O, industry practice]:**
  - **braams:** low brass and synth clusters, popularized after *Inception*'s "bwaaahm," which Lehman calls an "inescapable Zimmerism"
  - **risers:** reversed cymbals, string glissandi, synth sweeps, Shepard tones
  - **impacts/hits:** layered taiko, gran cassa, sub-boom, metal
  - **pre-drop silence:** 0.5–2 beats of near-silence before the hit
  - **ticking clocks and pulses**
- **Hybrid percussion [O].** Combine taiko, low toms, surdo and processed synth kicks. High-pass the acoustic drums so the sub (≈30–60 Hz) stays clean and comes from one designated source.

### 1.4 Orchestration and timbre

**Role map for an epic tutti [O, based on standard orchestration texts such as Adler and Rimsky-Korsakov]:**

| Layer | Instruments | Register | Job |
|---|---|---|---|
| Sub/foundation | contrabass, tuba, bass trombone, synth sub, low drums | E1–C3 | root only (octaves or 5ths); no thirds |
| Harmonic body | horns (the "glue"), trombones, cellos, low choir | C3–C5 | sustained chords, chorales |
| Melody | horns in unison (heroic), trumpets (fanfare), violins in octaves, sopranos | C4–C6 | the theme, doubled at the octave |
| Rhythm engine | spiccato strings, low synth ostinato, percussion | mid/low | pulse and momentum |
| Sparkle/air | glockenspiel, harp, celesta, piccolo, high string trills | C6+ | brightness without mass |

**Practical ranges (concert pitch; comfortable range, extreme in brackets) [E, standard references]:**

| Instrument | Comfortable | Notes |
|---|---|---|
| Violin | G3–E6 [–A7] | above E6 thins; octave doublings for melody |
| Viola | C3–C6 | warm mid fill, often under-used in mockups |
| Cello | C2–A5 | heroic tenor melodies in A3–A4 |
| Contrabass | E1–G3 (sounds 8va lower than written) | double celli an octave below |
| Horn in F | about F2–F5 sounding | heroic sweet spot about C4–F5 (written G4–C6) |
| Trumpet (B♭/C) | E3–C6 | fanfare power about G4–C6; tiring when sustained high |
| Tenor trombone | E2–F4 [B♭4] | chorale and "braam" power at E2–C4 |
| Bass trombone / tuba | B♭0/D1–F3/F4 | foundation; avoid close thirds low |
| Flute | C4–C7 | weak in the low octave in tutti |
| Oboe | B♭3–G6 | solo intimacy; cuts through |
| Clarinet (B♭) | D3–B♭6 | chameleon; chalumeau for mystery |
| Bassoon | B♭1–E♭5 | doubling the bass line, comic/grotesque |
| Harp | C♭1–G♯7 | arpeggios, glissandi, pedal-limited chromaticism |
| Choir | S C4–A5 · A F3–D5 · T C3–A4 · B E2–D4 | open vowels for power |

**Anti-mud rules [O, standard teaching]:**
1. Keep intervals below about C3 to octaves and fifths. Close thirds in the bass register blur.
2. Give each register *one* dominant job.
3. Double melodies at the octave, not in mid-register unison clumps.
4. Thin the mid-range (C3–C4) when brass and choir are both sustaining.
5. In hybrid scores, choose *either* the synth sub *or* the orchestral bass to own 30–60 Hz in a given passage.

**Choir [O/C].**
- Open vowels ("ah," "oh") read as power; closed "oo/mm" read as intimacy or menace.
- Hard consonant syllables ("ta," "ka," "dom") add rhythm in action.
- Real-language texts add specificity. McCreary set Old Norse lyrics and recorded Iceland's Schola Cantorum because "by recording with an Icelandic choir, they could read the text and it would be pronounced correctly."
- Pseudo-Latin and constructed languages are common in trailers. Lehman warns that ethnic voices used as "a vague, otherizing gloss" lack "emotional or cultural specificity," so avoid tokenism.

**Solo instruments for intimacy [C].** Wintory chose a solo cello in *Journey* as the voice of the player: "Musically it's like a big cello concerto where you are the soloist and all the rest of the instruments represent the world around you, including other players." McCreary's scores "veer from a pensive solo nyckelharpa up to a massive orchestra and choir." The general rule: establish intimacy with one voice so the tutti feels earned.

### 1.5 Form, dynamics, tension and release — the psychology

**Expectation theory [E].** Leonard Meyer (*Emotion and Meaning in Music*, 1956) argued that emotion arises when musical tendencies are delayed or blocked. David Huron's ITPRA theory (*Sweet Anticipation*, MIT Press 2006) splits expectation responses into five stages:
- **Imagination** and **Tension**, before the event
- **Prediction**, **Reaction** and **Appraisal**, after it\[9\]\[10\]\[11\]

Huron argues that accurate prediction is itself rewarded, and the pleasure is "misattributed to the stimulus." That explains why repetition and familiar schemas feel good.\[12\] Surprising events produce a fast, often negative reaction that a slower positive appraisal can override ("contrastive valence").\[9\]\[13\] That explains why a sudden chromatic-mediant shift or a pre-drop silence feels thrilling.

**Chills/frisson research [E]:**
- **De Fleurian & Pearce (2021).** "Chills in Music: A Systematic Review" (*Psychological Bulletin* 147(9), 890–920) reviewed **167 research reports from 1980–2020**. It grouped elicitors into three kinds:
  - acoustic: sudden loudness increases, expanding register into highs or lows, brightness, roughness
  - musical: crescendi, build-ups and climaxes; changes in harmony, melody or structure; textural changes, "particularly with the entrance of new instruments, and the alternation, contrast, or communion between solo and accompanying instruments"; voices and lyrics
  - emotional\[13\]
  
  It proposed three mechanisms: arousal, expectation and emotion.\[13\]
- **Sloboda (1991).** *Psychology of Music* 19(2), 83 respondents: "tears were most reliably evoked by passages containing sequences and appogiaturas," while "shivers were most reliably evoked by passages containing new or unexpected harmonies."\[14\]
- **Grewe et al. (2007).** *Music Perception* 24(3), 38 participants: chills were tied to the entry of a voice and to loudness increases. Chills also **habituated** with repeated listening over days, which is a direct warning for looping game music.\[15\]\[16\]
- **Bannister & Payne (2025).** "A survey of musical chills experiences while performing music" (*Psychology of Music*, published online 27 October 2025) surveyed 218 musicians. Performers reported chills at climaxes and build-ups and at moments of novelty or change, mirroring listener research, and "71% (n = 114)" of recalled chills experiences involved co-performers.
- **Caveat:** these are correlational and self-report studies with modest samples. They show *where* chills tend to happen, not a formula that reliably causes them.

**Translating research into craft rules [O, grounded in the above]:**
1. **Plan the reveal.** Fragment the main theme early (2–3 notes), withhold the full statement, then deliver it with a *new voice entering* (choir, solo vocal, full horns) on a crescendo.
2. **Violate one dimension at a time.** At the climax, keep rhythm and form predictable and change harmony (♭VI instead of I, or a chromatic-mediant key shift). Or keep the harmony and drop to silence. Too many simultaneous surprises read as chaos.
3. **Contrast is the amplifier.** Quiet before loud, sparse before dense, solo before tutti. "Time" in *Inception* peaks with about 22 low brass, then is "yanked abruptly back to an exposed piano texture."\[1\]
4. **Climax placement.** In linear cues, put the main climax at about 60–75% of the duration (the classic golden-section zone), then leave a denouement. In trailers, put the biggest hit near the end with a button.
5. **Restraint.** Every loud section needs a reason. Games add habituation (Grewe), so the "chill" device must be rationed.\[13\] Save full-theme tutti for story beats, not every combat loop.
6. **Silence is a note.** Use pre-drop gaps, and in games, deliberate *music-off* zones so music returning means something.

### 1.6 Production and mix

- **Space [O].** Record or emulate a real hall (2–3 s RT60 for epic orchestra). Keep percussion and low brass drier than strings. Use pre-delay (20–40 ms) to preserve attack. Put synths in matching reverb or the hybrid will "float."
- **Low end [O].** High-pass everything that doesn't need sub. Mono below ~100–120 Hz. Duck the sub-bass to the kick and impacts (sidechain). Pick one sub owner per section.
- **Stereo width [O].** Use classic seating (violins left, celli/basses right-center, horns left-center, trumpets/trombones center-right). Put width in reverbs and pads, not in bass.
- **Sample libraries by tier [O, indicative, prices change]:**
  - free/entry: Spitfire LABS, BBC Symphony Orchestra Discover
  - mid-tier: BBCSO Core, Orchestral Tools' Berlin series (selectively), Cinesamples CineSymphony, EastWest Hollywood Orchestra Opus
  - epic/hybrid specialists: Heavyocity (Damage, Gravity), Sonuscore (The Orchestra), Spitfire Albion series, Audio Imperia
  - choirs: EastWest Hollywood Choirs, Spitfire Eric Whitacre Choir, Soundiron/8Dio
- **Mockup realism [O].**
  - Program dynamics with CC1 (mod wheel) on *every* sustained line.
  - Use real legato patches, humanize timing by ±10–20 ms, and alternate articulation round-robins.
  - Add even one live soloist (cello, vocal, violin) to lift a sample mockup a lot.
  - Live orchestra matters most for exposed strings and woodwinds and for long legato lines.
- **Loudness [E].** For standalone or soundtrack masters, the AES's 2015 streaming recommendation says integrated loudness "should be between -16LUFS and -20LUFS," while YouTube's preferred level is −14 LUFS. For in-game stems, deliver *un-limited, with headroom* (peaks around −6 to −3 dBFS), because the game mix, not the composer's master, hits the platform target (see 2.6).

### 1.7 Composer case studies (technique-level)

- **Hans Zimmer [E/analysis via Lehman]:** five named tropes plus the cathartic ostinato.
  - *ponderous passacaglia*: string counterpoint added over a glacial ground bass, derived from Górecki in *Gladiator*'s "Am I Not Merciful"
  - *marcato motto*: short, loud, brassy, aeolian, trochaic
  - *consequential chorale*
  - *Teutonic theme*
  - *abstract anthem*
  - Plus high-concept timbral hooks (organ in *Interstellar*) and electronic augmentation.
- **John Williams [E/analysis]:** functional plus chromatic harmony with chromatic-mediant cadences as default (Lehman 2013); jazz-informed harmony; dense developmental leitmotif networks (Lehman's free *Star Wars* thematic catalogue); idiomatic, contrapuntal orchestration; fanfares built on 4ths and 5ths.
- **Howard Shore [E/analysis, secondary]:** film-music theorists note Shore mapping Middle-earth's peoples onto harmonic systems. Hobbits get major/minor diatonic, Men modal diatonic, Elves non-diatonic chromatic mediants.\[17\] Lehman analyzes "pantriadic wonder" and frisson in *The Return of the King*.\[18\] Hard choral text-setting in invented and Tolkien languages.
- **Thomas Bergersen / Two Steps from Hell [O, analyst consensus]:** trailer-anthem form (soft intro → ostinato build → choir and brass chorus → key lift → button). Heavy use of i–♭VI–♭III–♭VII, huge choirs, soaring soprano or violin lines over driving percussion.
- **Ramin Djawadi [O]:** an ostinato-plus-melody model (cello-led *Game of Thrones* main title in 6/8 minor). Themes simple enough to survive heavy repetition across seasons. Rock-inflected minimalism from the RCP lineage.
- **Bear McCreary [C]:** culturally researched instrumentation (nyckelharpa, Hardanger fiddle, hurdy-gurdy, viola da gamba, Old Norse lyrics).\[19\]\[20\] For *God of War* (2018), Billboard reports 50 strings, 17 brass and six low woodwinds, plus Iceland's 22-singer Schola Cantorum, a 48-singer Prague choir and Faroese vocalist Eivør.\[21\] The Kratos theme opens on a rising three-note motif in deep male voices.\[19\] *Ragnarök* themes evolve the 2018 material.\[22\]
- **Hildur Guðnadóttir [O]:** texture-first, cello-centered, slow harmonic motion, near-ambient restraint (*Joker*, *Chernobyl*). Proof that "epic weight" can come from timbre and patience instead of volume.
- **Harry Gregson-Williams [O]:** RCP-lineage hybrid action plus lyrical themes. Long game-scoring history (*Metal Gear Solid* series) bridging film and game workflows.
- **Michael Giacchino [O]:** Williams-lineage thematic writing with strong jazz and brass idiom. Came up through games (*Medal of Honor*), showing that game scores can be a launching pad for symphonic film careers.

---

## PART 2 — What great game soundtracks are made of

### 2.1 How game music differs from film music

| Dimension | Film | Games | Composer implication [O] |
|---|---|---|---|
| Timing | fixed picture lock | player-determined | modular segments, quantized transitions |
| Duration | 1–3 h total, heard once | 10–100+ h, loops heard dozens of times | design for repetition tolerance; avoid "ear-worm fatigue" hooks in exploration loops |
| Role | narrative commentary | narrative *plus* feedback, pacing and mood regulation | music signals state (danger, success, low health) |
| Agency | passive viewer | co-author | Wintory: making "the player feels like a real meaningful co-author of the experience" |
| Mix | dialogue-first linear mix | dynamic mix with SFX and VO priority | leave frequency and dynamic space; stems not masters |

**Koji Kondo's three principles (GDC 2007) [C]: rhythm, balance and interactivity.**
- **Rhythm:** music should reflect the game's internal rhythm. "If the music doesn't reflect the rhythm of the game, it might as well be piped in from a source outside the room." He wrote the *Super Mario Bros.* overworld after watching how Mario moves and jumps.
- **Balance:** pieces must form a coherent whole. Kondo submits pieces four or five at a time so they are judged in relation to each other.
- **Interactivity:**
  - tempo increases when time runs out in *Super Mario Bros.*
  - percussion is added when Mario rides Yoshi
  - *Super Mario 64*'s water level changes instrumentation between swimming and the cave

**Gameplay-loop mapping [O]:**

| Context | Music goal | Typical approach |
|---|---|---|
| Exploration/overworld | long-session comfort, place identity | 2–4 min loops, low density, gentle harmonic rhythm, long silences between plays |
| Combat | arousal, rhythm, feedback | vertical intensity layers (2–4 levels), stingers for kills and phase changes |
| Boss | spectacle, escalation, phases | horizontal phase segments, leitmotif of the boss, climax tied to final phase |
| Stealth | tension without fatigue | pulses, drones, layers driven by detection state |
| Puzzle | focus | low-salience, steady, non-melodic or simple patterns; avoid strong forward drive |
| Menus/title | identity, first impression | main theme statement; must loop cleanly |
| Safe rooms/hubs | relief | warm, diegetic-feeling, slower (save-room trope) |
| Cutscenes | narrative | linear film scoring to picture |
| Credits | catharsis, memory | full main theme, song or suite |

**Diegetic vs non-diegetic [E].**
- Diegetic music exists in the world: radios, bards, Orpheus singing in *Hades*.
- Non-diegetic music is underscore.
- Games blur the line. In *Journey*, the player's shout "stays in tune with the background music," so the player's action becomes musical.

### 2.2 Adaptive and interactive music techniques

**Core taxonomy [E]** (Sweet, *Writing Interactive Music for Video Games*, 2015; Phillips, *A Composer's Guide to Game Music*, 2014):
- **Horizontal resequencing:** music is split into segments that loop, branch or transition by game state. It controls *structure*.
- **Vertical layering/remixing:** synchronized stems faded in and out by a parameter. It controls *intensity*.
- **Stingers:** short overlays triggered on events, synced to beat, bar or cue.
- **Transitions:** dedicated bridge segments, quantized cross-fades, musical "drops."
- **Generative/procedural:** rule-based or randomized recombination, MIDI-driven systems (LucasArts' iMUSE), real-time synthesis.

Audiokinetic's case study of *Sackboy: A Big Adventure* shows a hybrid. Horizontal resequencing "support[s] momentum through the level," and vertical layering builds "up and into narrative moments and boss fights." Stems were split into **drums, bass, lead, accompaniment and vocals** [C].

**Wwise workflow [E, Audiokinetic documentation and design articles]:**
- **Music Segment:** holds tracks; it has tempo and time signature, an **Entry Cue** and **Exit Cue**, a **pre-entry** (pickup before the entry cue) and **post-exit** (tail after the exit cue that overlaps the next segment), plus custom cues.
- **Music Playlist Container:** sequences or randomizes segments (loop body variations).
- **Music Switch Container:** chooses playlists by State or Switch (explore/combat/boss).
- **Transition Matrix:** source→destination rules with sync points (Immediate, Next Beat, Next Bar, Next Cue, Exit Cue). It can insert a transition segment and handles fades. Rules run from general to specific.
- **RTPCs** (game parameters) drive track volumes, filters and effects for vertical layering.
- **Stingers via Triggers** play a segment at the next beat, bar or cue.
- **Practitioner tip from Audiokinetic's Louis-Xavier Buffoni:** "a custom cue in the middle of 16-bar segments with 'Next Cue' transition rules results in faster transitions."

**FMOD Studio workflow [E, FMOD documentation and tutorials]:**
- Each music event has a **timeline** with **tempo markers**.
- **Loop regions** (with conditions), **destination markers** and **transition markers** move the playhead.
- **Transition regions** can be **quantized** to beat or bar intervals.
- **Transition timelines** hold bridge material.
- **Magnet regions** and **sustain points** hold position.
- **Parameter sheets** drive layer volumes for vertical mixing.

**Unreal Engine [E, Epic documentation]:**
- **MetaSounds** are procedural audio graphs, usable as music players with internal state and layers.
- **Quartz** provides sample-accurate musical clocks. **Play Quantized** cues any sound (wav, Sound Cue, MetaSound) to a **Quantization Boundary** (bar, beat, etc.), "independent of the buffer size, game-thread timing, or other sources of variable latency."\[23\]\[24\]\[25\]
- Many Unreal titles use Wwise instead. GameSoundCon 2025 notes that Unreal games "frequently use Unreal's built-in engine, and tend to use Wwise more than FMOD."\[2\]

**Unity [E].** Native: `AudioSource.PlayScheduled` against `AudioSettings.dspTime` for sample-accurate loop and transition scheduling. In practice most teams integrate FMOD or Wwise.

**How to write modular music [O, synthesizing the above]:**
1. Lock **tempo and meter per state family**, or plan explicit tempo-change transitions.
2. Write in **4- or 8-bar phrase units**. Every unit should be able to exit cleanly on its last bar.
3. Keep **harmonic compatibility across layers**. Every stem must sound complete alone and in any combination. Test the "bass + percussion only" and "pad only" mixes.
4. Avoid long melodic phrases that cross segment boundaries. Put melody in its own stem so it can be muted for long exploration sessions.
5. Write **pickups as pre-entry** and **reverb/release as post-exit tails**.
6. Compose **transition kits**: explore→combat (riser + hit), combat→explore (release chord + tail), victory and defeat stingers in every key or modal centre used.
7. Make **2–4 variations** of loop bodies for playlist randomization, so a 2-minute loop feels like 8.

**Delivery checklist for composers [O]:**
- **Files:** 48 kHz / 24-bit WAV (confirm with the audio director). Stereo or the requested channel format. No master limiting on stems. Consistent peak headroom.
- **Loops:** sample-accurate loop points (bar-aligned lengths). Deliver *both* a "loop body" file and a separate "tail" file, or a body+tail file with documented exit cue.
- **Stems:** identical length and start point. Named `MUS_[Area]_[State]_[Layer]_[BPM]_[Key]_v###.wav` (e.g., `MUS_Forest_Combat_L2Perc_140_Dm_v003.wav`).
- **Metadata sheet:** BPM, meter, key/mode, bar count, entry/exit cue positions (in bars and samples), intended state and parameter mapping, layer descriptions, transition intentions, loudness readings.
- **Stingers:** per key centre, with a sync recommendation (next beat or bar).
- **Session archive:** MIDI, DAW project, stem printouts; version-controlled (Perforce/Git LFS/Plastic is common at studios) with change logs.
- **Linear assets:** cutscene cues to timecode, plus alt mixes (no-melody, no-percussion, underscore).

### 2.3 Genre and style playbooks

(All tempo and instrumentation figures are [O] heuristics drawn from repertoire conventions.)

| Genre | Instrumentation | Harmony/modes | Tempo | Structure | Player expectation |
|---|---|---|---|---|---|
| JRPG | orchestra + piano, synth, rock band for battles; folk solos | strong melody; functional plus modal mixture; ii–V–I and I–♭VII–IV; bossa/jazz colours in towns | towns 90–110; battles 140–180; field 100–130 | ABA'-loop 1.5–3 min; character, town and battle themes | memorable melodies, themes per character/location, iconic battle and victory fanfares |
| Western RPG / open world | orchestra, choir, regional folk instruments, ambient pads | modal (Dorian/Aeolian/Lydian), slow harmonic rhythm | exploration 60–90 | long, sparse, non-intrusive exploration pieces spaced by silence; combat layers | atmosphere, place, "wonder" swells at vistas |
| Action / boss | hybrid orchestra, metal guitars, synth bass, epic percussion, choir | aeolian/phrygian, power-chord 5ths, chromatic-mediant shocks | 130–180 | phase segments per boss phase; intensity layers | adrenaline, readable phases, boss leitmotif |
| Horror | prepared/extended strings, aleatoric clusters, drones, processed found sound, sparse piano | atonal/clustered, tritones, Locrian, microtonal bends | free-time or slow 50–80 | ambience beds + scare stingers; long silences | dread, uncertainty; music withheld until threat |
| Platformer / chiptune | pulse/triangle/noise or emulation; bright synths; drums | major/Mixolydian, syncopated bass, catchy hooks | 120–170 | short loops (30–90 s) per level, with jingles | rhythm matched to movement (Kondo), catchy |
| Indie / lo-fi / atmospheric | piano, guitar, synth pads, field recordings, small ensembles | add9/maj7, modal ambiguity, slow change | 60–100 | ambient loops, evolving layers | intimacy, personality, "auteur" sound |
| Strategy / 4X | orchestra, regional/historical instruments, choir | modal, broad, diatonic | 70–110 | long playlists of non-intrusive tracks; era/faction themes | long-session comfort, civilizational identity |
| Racing | EDM, rock, drum'n'bass, synthwave; licensed tracks | loop-based, minor/Dorian riffs | 120–175 | tracks with intensity stems; position/lap-driven layers | energy, speed sync |
| Sci-fi | synth (analog/modular), hybrid orchestra, processed choir | Lydian wonder, quartal, chromatic mediants, drones | varies | ambient + action layers | awe, technology, isolation |
| Fantasy | orchestra, choir, harp, folk winds, Celtic/Nordic/medieval colours | Dorian/Mixolydian/Aeolian, chromatic mediants for magic | varies | leitmotif-rich | heroism, wonder, myth |
| Puzzle / cozy | marimba, kalimba, ukulele, piano, light woodwinds, soft synths | major/Lydian, maj7/add9, gentle | 80–110 | gentle loops 2–3 min; very low fatigue | calm, focus, "never annoying" |
| Rhythm / music-driven | genre of the game; precise beat grid | genre-dependent; clear downbeats | fixed BPM per chart | songs with charting; strict sync | tight timing, satisfying hits |

### 2.4 Acclaimed soundtracks and why they work (technique level)

- **Koji Kondo (Mario, Zelda) [C]:** rhythm derived from movement; instrumentation changes as interactivity; thematic callbacks (the Metal Cap in *SM64* homages the invincibility theme).
- **Nobuo Uematsu (*Final Fantasy*) [O]:** strong singable melodies, genre eclecticism (prog rock to chorale), a fixed thematic vocabulary across a series (prelude arpeggios, victory fanfare), and character themes reused in battle and field variants.
- **Yoko Shimomura (*Kingdom Hearts*, *Street Fighter II*) [O]:** lyrical piano-led themes, waltz and dance rhythms, and a recognizable personal melodic voice across very different franchises. A model of the "versatile but identifiable" composer.
- **Yasunori Mitsuda (*Chrono Trigger/Cross*, *Xenoblade*) [O]:** Celtic and folk-modal melodies, world-building through regional instrumentation, and themes recontextualized across eras and worlds.
- **Jeremy Soule (*Skyrim*, *Oblivion*) [O]:** sparse, modal, slow exploration pieces spaced by silence for long sessions, plus a choral main theme with a constructed-language text.
- **Mick Gordon (*DOOM* 2016/*Eternal*) [C]:**
  - The brief, per his GDC 2017 talk, was to make music "no one has heard before."
  - He built a "DOOM Instrument": sine waves sent through processing chains to "corrupt" sound. He morphed the original game's chainsaw sound with a 9-string guitar.
  - Music is sound-designed, heavily rhythmic, synced to combat intensity, and horizontally resequenced.
  - Gordon publicly disputed the *Eternal* soundtrack release with id Software. *DOOM: The Dark Ages* (2025) was scored by Finishing Move Inc. Treat any comparisons as opinion.
- **Austin Wintory (*Journey*) [C]:** "There is only one theme in Journey, and it evolves through the whole game."\[26\] Cello as the player.\[27\] "Certain instruments – the harp and viola – lay dormant in the mix until you connect with another person." The score was nominated for Best Score Soundtrack for Visual Media at the 55th Grammy Awards (2013), losing to Reznor and Ross's *The Girl with the Dragon Tattoo* (Engadget). It was the only video game nominated in that category before the Recording Academy created a separate games category in 2022.
- **Gareth Coker (*Ori*) [O]:** piano, flute, solo voice and orchestra; emotive themes with platformer-tight rhythmic action cues; heavy use of leitmotif across the two games.
- **Lena Raine (*Celeste*) [O]:** synth-piano hybrid; each chapter has a theme with remixed B-side variants; music mirrors the protagonist's anxiety arc. Electronic production is a first-class compositional parameter.
- **Darren Korb (*Bastion*, *Hades*) [C]:**
  - On *Bastion*, budget shaped the "acoustic frontier" sound ("all of the music that I made had to be stuff that I could make in my apartment").
  - *Hades* is self-described "Mediterranean prog rock Halloween music," with vocal collaborator Ashley Barrett and diegetic songs (Orpheus/Eurydice).
  - Korb is also audio director, sound designer and voice director, so the "constraint as identity" lesson applies.
- **Marty O'Donnell (*Halo*, with Michael Salvatori) [O]:** a Gregorian-style male chant opening into strings and rock percussion; mysterious-ancient plus military-modern fusion; music used sparingly in campaign encounters.
- **Christopher Larkin (*Hollow Knight*) [O]:** chamber-scale strings, piano and harp; melancholic leitmotifs; area themes with combat layers. Intimacy as scale.
- **Disasterpeace (*FEZ*, *Hyper Light Drifter*) [O]:** synth textures, harmonic ambiguity, ambient restraint.
- **Toby Fox (*Undertale*, *Deltarune*) [O]:** extreme leitmotif economy (dozens of tracks derived from a few motifs); chiptune-adjacent; character themes mutating into boss themes. Motivic re-use as storytelling.
- **Jesper Kyd (*Hitman*, *Assassin's Creed II*) [O]:** electronic-choral hybrids and period-flavoured ambient-orchestral writing.
- **Inon Zur (*Fallout 3/4*, *Dragon Age*) [O]:** world-specific palettes (post-apocalyptic Americana, dark fantasy).
- **Garry Schyman (*BioShock*) [O]:** modernist and aleatoric strings set against period diegetic records. Irony through diegetic juxtaposition.
- **Akira Yamaoka (*Silent Hill*) [O]:** industrial noise, trip-hop and melancholic rock songs. Blurs SFX and music, and uses silence and radio static as feedback.
- **Stephen Barton (*Titanfall 2*, *Star Wars Jedi*) [O]:** franchise-adjacent thematic writing within established sound worlds.
- **Jessica Curry (*Dear Esther*, *Everybody's Gone to the Rapture*) [O]:** sacred-choral and chamber writing for walking-sim pacing; music as primary narrative voice.
- **Gustavo Santaolalla (*The Last of Us*) [O]:** sparse ronroco and guitar, a few notes, lots of air. Restraint creating huge emotional weight in a violent game.
- **Lorien Testard (*Clair Obscur: Expedition 33*, 2025) [C]:**
  - It was his first professional game score. The official Bandcamp page says he "spent five years working on the game's soundtrack."
  - He calls voice the "most emotional and powerful of instruments," featuring Alice Duport-Percier.\[28\]
  - The base-game album, released 24 April 2025, has 154 tracks running 8 hours 9 minutes (Apple Music listing).
  - Genres range from classical to heavy metal, with substantial leitmotif use.\[29\]
  - It won the World Soundtrack Award for Game Music and The Game Awards' Best Score and Music (2025).\[30\]
  - Testard says he drew inspiration from the game's concept art and story rather than other soundtracks.\[31\]
  - A current proof that a distinctive vocal identity plus leitmotif can beat "generic epic."

### 2.5 Thematic design for a whole game

**A practical architecture [O]:**
1. **One main theme (the "franchise theme").** Singable, 8–16 bars, harmonized at least three ways (heroic, tragic, intimate). Plan its first full statement for a major story beat, not the opening minute.
2. **Character themes (3–6).** Each with a signature instrument or mode. In McCreary's Atreus theme, the father's low brass and choir give way to "urgently chugging Nordic folk instruments."
3. **Location palettes.** Assign instrumentation, mode and tempo bands per region so players feel geography.
4. **Faction/antagonist motifs.** Ideally derived from the main theme (inversion, Phrygian recolour).
5. **Harmonic or timbral "glue."** A recurring progression or sound (leitharmony, à la Lehman).
6. **Reuse map.** A spreadsheet of where each motif appears, its transformation, and its intended emotional reading.

**Cultural vocabulary, used respectfully [O/C].**
- Research the tradition. McCreary spent months on Nordic folk.
- Hire tradition-bearer musicians and use correct languages.
- Avoid generic "exotic" scales as shorthand.
- Credit performers.
- Lehman's critique of "otherizing gloss" is the cautionary example.

### 2.6 Music vs SFX, dialogue and loudness

- **Frequency planning [O].** Dialogue intelligibility lives around 1–4 kHz. Keep melody and busy figuration out of that band under VO, or let the mixer duck it with sidechain or snapshots. Deliver "no-melody" alts for dialogue-heavy scenes.
- **Sound-design relationship [C/O].** Gordon's synth design and Yamaoka's noise show music and SFX can share material. Coordinate keys and tunings with sound designers (e.g., UI sounds in the area key) and avoid frequency collisions with weapon impacts.
- **Loudness targets [E]:**
  - Sony's ASWG-R001 (2013): **−24 LUFS ±2 LU** integrated for console/PC, **−18 LUFS ±2** for portable, **true peak ≤ −1 dBTP**, loudness range under 20 LU.\[32\]\[33\]
  - Measure the *whole game mix* over at least 30 minutes of representative gameplay (Garry Taylor, Sony, GDC/AES 2013).\[32\]\[34\]
  - G.A.N.G.'s IESD Mix Recommendations (v03.02, March 2015) say console titles "should be normalized to -24 LUFS (tolerance of + or – 2 LU)," and mobile and handheld titles to −16 LUFS ±2 LU. Microsoft and Nintendo later aligned with similar recommendations.
  - Disagreement: one 2012 Sony interview cited −23 LUFS for PS3, and the IESD's −16 LUFS for mobile and handheld differs from Sony's −18 for portables. Treat −24 (console) and −16 to −18 (mobile) as the working range and **always follow the project's audio director**.
  - Taylor's key point: "Make a great sounding game first!" Loudness testing happens at the end.\[32\]

---

## PART 3 — How to become the best general game composer

### 3.1 Learning roadmap (beginner → elite) [O]

| Stage | Duration (typical) | Core skills | Deliverable to prove it |
|---|---|---|---|
| 1. Foundations | 0–12 months | keyboard fluency (chords in all keys), diatonic harmony, Roman numerals, ear training (intervals, chord quality, progressions), one DAW | 10 short loops (30–60 s) in different moods, cleanly looping |
| 2. Craft | 1–2 years | voice leading, 4-part chorale, species counterpoint, modal harmony, orchestration basics (ranges, transpositions), MIDI mockup (CC1/CC11, articulations), basic mixing | 3 orchestral cues (2 min) + 3 hybrid/electronic; transcriptions of 10 game themes |
| 3. Interactivity | 6–12 months overlapping | Wwise/FMOD certification-level fluency, Unity/Unreal integration, stems/loops/tails/markers | a playable demo (vertical + horizontal + stingers); 2–3 game jams |
| 4. Professional | 2–5 years | style versatility across 6+ genres, fast turnaround, revision handling, live recording sessions, contracts | shipped titles, a reel, references from audio directors |
| 5. Elite | ongoing | personal voice, thematic architecture across franchises, team leadership/audio direction, concert arrangements | recognizable signature; repeat clients; awards/concerts |

**Deliberate-practice plan (weekly, about 10–15 h) [O]:**
- **Score study (2 h):** follow a score (IMSLP for public-domain repertoire: Holst, Stravinsky, Debussy, Ravel, Mahler, Prokofiev). Note doublings and register.
- **Transcription (2 h):** a 16–32-bar game or film excerpt by ear into MIDI. Compare against official scores where licensed.
- **Daily 30-minute sketch:** a motif plus 3 transformations.
- **Weekly "style copy" (3 h):** emulate one composer's *technique* in an original piece. Rotate through the genre table.
- **Mockup drill (2 h):** program a 1-minute orchestral passage to "sounds real" quality.
- **Middleware drill (2 h):** implement last week's piece adaptively in Wwise or FMOD.
- **Critique (1 h):** score your work with the rubric below. Get one outside critique per month.

**Recommended books [E, standard literature]:**
- *Game-specific:*
  - Winifred Phillips, *A Composer's Guide to Game Music* (MIT Press, 2014)
  - Michael Sweet, *Writing Interactive Music for Video Games* (Addison-Wesley, 2015)
  - Karen Collins, *Game Sound* (MIT, 2008) and *Playing with Sound* (MIT, 2013)
  - Tim Summers, *Understanding Video Game Music* (Cambridge, 2016)
  - George Sanger ("The Fat Man"), *The Fat Man on Game Audio*
- *Orchestration:*
  - Samuel Adler, *The Study of Orchestration*
  - Nikolai Rimsky-Korsakov, *Principles of Orchestration* (public domain)
  - Cecil Forsyth, *Orchestration*
  - Thomas Goss, *100 Orchestration Tips*
- *Film scoring:*
  - Fred Karlin & Rayburn Wright, *On the Track*
  - Richard Davis, *Complete Guide to Film Scoring*
  - Frank Lehman, *Hollywood Harmony* (Oxford, 2018)
- *Theory/cognition:*
  - Aldwell & Schachter, *Harmony and Voice Leading*
  - Fux, *Gradus ad Parnassum* (counterpoint)
  - Huron, *Sweet Anticipation*
  - Meyer, *Emotion and Meaning in Music*

**Courses, talks, educators and communities [O]:**
- **Courses:**
  - Audiokinetic Wwise certifications (free)
  - FMOD's official learning resources
  - Berklee Online game-scoring courses
  - Thinkspace Education
  - Orchestration Online (Thomas Goss)
  - Spitfire Audio's free masterclass content
- **GDC Vault talks:**
  - Kondo 2007
  - Gordon "DOOM: Behind the Music" 2017
  - Garry Taylor on loudness 2013
  - plus postmortems from Wintory, McCreary and Coker
- **YouTube educators:**
  - 8-Bit Music Theory (game-music analysis)
  - Thomas Goss / Orchestration Online
  - Guy Michelmore
  - Alex Moukala
  - Jake Lizzio / Signals Music Studio (harmony)
  - Adam Neely (theory)
- **Communities:**
  - G.A.N.G. (Game Audio Network Guild)
  - GameSoundCon
  - VI-Control forums
  - Game Audio Discord servers
  - local IGDA chapters
  - Global Game Jam / Ludum Dare

### 3.2 Professional scoring workflow [O, synthesizing composer reports]

1. **Intake:** read the GDD, pillars, art bible, narrative outline and gameplay loops. Ask:
   - What must the music *do* (inform, pace, brand)?
   - Which states exist? What engine and middleware?
   - What is the budget for live players?
2. **Spotting/spec session with the audio director:** list every state and context. Define music on/off rules, adaptive depth per context, delivery format and loudness.
3. **Musical identity/style guide** (1–2 pages):
   - palette and banned sounds
   - modes and harmonic language
   - tempo bands
   - main-theme concept
   - cultural research notes
   - 3–5 *reference* tracks with "what to take / what not to take"
4. **Temp music caution:** temp is useful for communication, but "temp love" traps teams. Reference specific *parameters* (density, tempo, palette), not tracks to imitate.
5. **Prototype a vertical slice:** one exploration plus combat plus stinger set, implemented in-engine. Wintory notes that on *Journey*, "keeping up with the design and its core ideas" was the main task over three years.
6. **Theme development:** write the main theme early. McCreary scored the *God of War* prototype in 2015. Testard wrote character songs used in trailers.
7. **Writing template:** a pre-built DAW template with orchestral and hybrid tracks, stem buses matching delivery layers, tempo-mapped markers, and a loudness meter.
8. **Mockup → review → revision:**
   - Show 2–3 options early.
   - Kondo submits several pieces together so the director judges balance across them.
   - Version every delivery (`v001`).
   - Log feedback against timestamps.
9. **Live recording:** prepare parts (Dorico/Sibelius/Finale-successor tools), click and pre-records, and a stem plan (record sections separately if layers must be isolated).
10. **Implementation and in-game review:** listen in game for 30+ minutes per area. Check fatigue, transitions and mix with SFX and VO.
11. **Final delivery and soundtrack album:** game stems plus a separate album master (album versions often merge loops into through-composed tracks).

### 3.3 Tools and tech stack

- **DAWs [O]:**
  - Cubase: industry favourite for orchestral MIDI and expression maps
  - Logic Pro: Mac, strong value
  - Reaper: cheap, scriptable, beloved for game-audio batch exports and region-render naming
  - Ableton Live: electronic and sound-design composers
  - FL Studio: EDM, chiptune, indie
  - Studio One and Digital Performer also appear
- **Notation:** Dorico, Sibelius, MuseScore (free), LilyPond (text-based).
- **Middleware/engines:** Wwise, FMOD Studio, Unreal (MetaSounds/Quartz), Unity. GameSoundCon advises "some familiarity with each of the main audio engines."
- **Sample library tiers:** see 1.6.
- **Scripting basics:** Reaper ReaScript (Lua/Python) for batch renders; Python for file naming and loudness batch-checking (pyloudnorm); Wwise WAAPI for automation.

**What an AI agent can realistically produce [O]:**

| Output | Feasible for a text/code agent? | How |
|---|---|---|
| Compositional briefs, style guides, spotting/state maps | Yes, high quality | structured text |
| Chord charts with Roman numerals, voice-leading plans | Yes | text, tables |
| Motifs and melodies | Yes, as pitch/rhythm data | ABC notation, note lists, MIDI |
| MIDI files | Yes | Python: `pretty_midi` (note/instrument objects, easy writing), `mido` (low-level messages, CC/tempo meta-events), `music21` (theory-aware: keys, Roman numerals, transposition, MusicXML export) |
| Engraved notation | Yes | LilyPond source, MusicXML via music21, ABC |
| Orchestration plans (who plays what, register, dynamics per bar) | Yes | tables |
| Adaptive system designs (Wwise/FMOD structures, transition matrices, naming, metadata) | Yes | text, JSON/CSV specs |
| Critique of a described or MIDI/notated piece | Yes, if given symbolic data or detailed description | rubric |
| Critique of *audio* | Only if the environment provides audio analysis tools; otherwise rely on user description | — |
| Finished, mixed, realistic audio | No (needs DAW, sample libraries, human performance) | hand off to human production |

Industry context: in GameSoundCon's 2025 survey, only 8% of professional respondents said they were currently using generative AI in some way, and another 15% were exploring it. The most common use was placeholder dialogue (43% of uses), alongside scripting, not music composition.

### 3.4 Career and business

- **Portfolio/reel [O]:**
  - 3–5 minutes, best first.
  - Show *range* (orchestral, hybrid, electronic, one "niche" genre) and *interactivity*: a screen-capture video of your music adapting in Wwise or FMOD, or a playable build.
  - Re-scoring gameplay is acceptable if labelled as a re-score.
- **Game jams:** fastest route to shipped credits, collaborators and implementation experience.
- **Networking:** GDC (including the audio track and G.A.N.G. events), GameSoundCon, Develop:Brighton, local meetups, developer Discords, itch.io communities.
- **Indie vs AAA pitching [O]:**
  - Indies hire composers who understand their game: a custom pitch track to their trailer, flexible terms, often a soundtrack revenue share.
  - AAA hires via audio directors, agents and outsourcing houses. Shipped credits, reliability and implementation knowledge count more than flashy demos.
- **Market data [E, GameSoundCon Survey 2025, 654 respondents]:**
  - **Per-minute rates:** average AAA freelance rate $1,871 per finished minute. The most popular AAA rates were $1,000, $2,000 and $3,600/min, with rates up to $5,000/min. 81% of AAA freelancers, 51% of midcore and 55% of indie charge by the minute.\[2\]
  - **Salaries:** salaried US/Canada composer average $131,686 (median $109,444); EU/UK average $63,236 (median $54,128). All US/Canada game-audio employees averaged $155,198, up about 20% vs 2023.\[2\]
  - **Hiring trends:** audio outsourcing employment almost tripled since 2016 (5%→14.7%). 16% of respondents were laid off in the prior 12 months.\[2\]
  - **Soundtrack revenue:** eligibility was 44% indie, 47% midcore, 29% AAA.\[2\]
  - **Rates have risen over time:** the 2016 survey's most common rates were $100 and $1,000/min.\[35\]
  - A third-party aggregator reports *medians* of $1,700 (AAA), $1,000 (midcore) and $407 (indie) attributed to the same survey.\[36\] This could not be verified against the primary page, so treat it as secondary.
- **Contracts [O]:**
  - **Work-for-hire:** the developer owns the copyright. The usual AAA default.
  - **Licensing:** the composer retains ownership and grants usage rights. More common in indie, and it enables soundtrack sales and sync.
  - Negotiate: soundtrack album rights and revenue share, PRO writer's share, credit, portfolio use, revision rounds, payment milestones (e.g., 30/40/30), live-recording budget separate from creative fee, kill fee.
- **PROs [E/O]:**
  - ASCAP, BMI, SESAC in the US; PRS (UK); SOCAN; GEMA; SACEM; JASRAC.
  - Games rarely generate public-performance royalties: only 16% of composers in GameSoundCon's 2021 survey had received PRO royalties from games in 2020.\[37\]
  - Soundtrack streaming, concerts and sync matter more.
- **What audio directors look for [O]:**
  - reliability and deadlines
  - implementation-aware music (clean loops, correct stems)
  - stylistic range on command
  - collaborative attitude to feedback
  - a memorable theme
  - technical literacy (Wwise/FMOD)
- **Common beginner mistakes:**
  - over-long intros
  - mud in low brass and strings
  - loops that click or have no tail
  - everything at full intensity
  - reels without interactivity
  - unlimited revisions in contracts
  - ignoring VO and SFX space
  - sounding like a library preset

**The AI era [E/O].**
- Generative tools threaten low-budget library and "background" work most.
- Studios are wary because of copyright uncertainty and platform and union policies.
- GameSoundCon's 2025 survey found that only 8% of professional respondents were currently using generative AI in some way, and another 15% were exploring it. Placeholder dialogue was the most common use, at 43%.
- The defensible human value: a distinctive voice, thematic architecture, live performance and direction, adaptive-system design, and collaboration and taste.
- Composers should learn to use AI for scaffolding (scripts, naming, batch QA, idea generation) while protecting their rights in contracts (no training on delivered stems without consent).

### 3.5 Habits of top composers [C/O]

- **Theme first, then system.** Wintory built one evolving theme. McCreary scored a prototype years early. Testard wrote character songs used in trailers.
- **Constraints become identity.**
  - Korb's apartment-recordable "acoustic frontier."
  - Gordon's "no one has heard before" brief turned into the DOOM Instrument.
  - Kondo's NES-era limits pushed rhythmic, efficient writing.
- **Deep research for authenticity:** McCreary's months of Nordic folk study.
- **Sound design as composition:** Gordon, Yamaoka, Raine.
- **Feedback management:** present options in groups (Kondo), keep versioning, separate "taste" notes from "function" notes.
- **Voice + versatility:** keep 2–3 personal fingerprints (a favourite mode, an instrument, a harmonic gesture) constant while swapping genre vocabulary. Shimomura and Uematsu remain recognizable across very different franchises.

---

## PART 4 — Skill-ready distillation

### 4.1 Core principles (checkable rules)

1. **Serve the game state first.** Every cue must answer: which gameplay state, what player emotion, what information does it convey? (Check: a state map exists.)
2. **Match the game's rhythm.** Tempo and groove should fit movement and action pacing (Kondo). (Check: BPM is justified against gameplay speed.)
3. **One main theme, many transformations.** Is the main theme stated in at least 3 distinct guises (heroic, intimate, tragic/variant)?
4. **Themes are short and transformable.** Core motif of 2–8 notes; theme of 8–16 bars; range about a 10th or less for singability.
5. **Withhold, then reveal.** Fragment before the full theme. The full statement coincides with a major beat and a new voice entering.
6. **Change one dimension at a time at peaks.** Surprise in harmony *or* texture *or* silence, with other dimensions stable.
7. **Contrast creates size.** Precede every tutti with a thinner texture. Is there at least a 2-level dynamic drop before the climax?
8. **Bass register = octaves and fifths only** below about C3. One owner of the sub per section.
9. **Every register has one job.** Sub, harmony, melody, rhythm and air are explicitly assigned.
10. **Melody doubled at the octave, not clumped in unison mid-range.**
11. **Harmonic rhythm matches intent:** slow (1 chord/bar or slower) for weight and trailers; faster functional chromaticism for adventure and whimsy.
12. **Use modes deliberately:** Lydian = wonder, Dorian = noble resolve, Aeolian = epic/tragic, Phrygian = menace, Mixolydian = folk heroism.
13. **Chromatic mediants for wonder and scale shifts, sparingly** (no more than 1–2 per phrase unless the cue is "pantriadic" by design).
14. **Design for repetition.** Exploration loops 2–4 min, low-salience melody (or in a mutable stem), variations for randomization, silence between plays.
15. **Ration "chill" devices.** Habituation is real (Grewe et al. 2007). Save full-theme tutti for story beats.
16. **Modular by construction.** 4- or 8-bar units, clean exits, pre-entry pickups, post-exit tails, layers compatible in any combination.
17. **Transitions are composed, not crossfaded at random.** Quantize to beat, bar or cue and write bridge material and stingers per key.
18. **Leave space for dialogue and SFX.** Melody out of 1–4 kHz under VO; deliver no-melody alts.
19. **Deliver stems unlimited with headroom.** The game mix hits −24 LUFS (console) / about −18 (portable), ≤ −1 dBTP, per the project spec.
20. **Metadata is part of the music.** BPM, meter, key, bars, cue points and state mapping accompany every file.
21. **Respect cultural sources.** Research, real performers, correct language; no "exotic" shorthand.
22. **Keep a voice.** Name 2–3 personal fingerprints and keep them across genres.
23. **Label claims.** When coaching, distinguish theory, composer practice and opinion.

### 4.2 Decision frameworks and step-by-step workflows

**General intake (ask or assume):**
- genre/setting
- gameplay context/state
- emotional target
- duration/loop needs
- palette constraints (orchestral/hybrid/synth/chip)
- middleware
- live vs samples
- reference touchpoints

If the user gives none, assume Wwise- or FMOD-style delivery and a hybrid orchestral palette, and state the assumptions.

---

**A. "Write me a boss battle theme"**
- **Key/mode:** D or C♯ Aeolian/Phrygian (low strings and guitars resonate). Boss motif built on a ♭2 or tritone. Final phase lifts to the relative major or a chromatic mediant (Dm → B♭ or F♯m) for "heroic turn."
- **Tempo/meter:** 150–170 BPM in 4/4, with 7/8 or 3+3+2 accents for instability; half-time breakdowns for heavy phases.
- **Progressions:**
  - Phase 1: i–♭VI–♭VII–i (Dm–B♭–C–Dm) over a D pedal ostinato
  - Phase 2: i–♭II–i–♭VII (Dm–E♭–Dm–C)
  - Phase 3: ♭VI–♭VII–I (B♭–C–D major, Picardy-style), or a pantriadic climb (Dm–B♭–Gm–E♭) for escalation
- **Instrumentation:**
  - spiccato strings 16ths; low brass marcato motto
  - choir on hard syllables (Phase 2+); taiko/hybrid percussion
  - distorted synth bass or 7-string guitar (if hybrid/metal); high strings and horns for the hero counter-theme
- **Structure (horizontal segments, 8-bar units):**
  - Intro/Reveal: 4–8 bars (one-shot)
  - Phase 1 loop: A (8) + B (8), 2 variations
  - Phase transition stinger: 1–2 bars, quantized to next bar
  - Phase 2 loop: C (8) + D (8), faster rhythmic density
  - Phase 3 (desperation) loop: E (8) + main-theme quotation (8)
  - Victory stinger: 2–4 bars (I or Picardy); defeat stinger: 2 bars (unresolved ♭II or tritone)
- **Dynamics map:** Intro mf→ff hit; P1 f; transition silence 1 beat → ff impact; P2 ff; P3 starts mf (texture drop, solo choir or horns) → fff by bar 8.
- **Adaptive layers:**
  - L1 percussion + bass; L2 ostinato strings; L3 brass motto; L4 choir/lead
  - RTPC "boss health" or "threat" maps L3/L4
  - stingers on boss phase change and on player critical hit (optional, 1 beat, sync next beat)

---

**B. "An emotional main theme"**
- **Key/mode:** major with modal mixture (E♭ or D major for strings and horns; alternatively D Dorian for noble melancholy).
- **Tempo:** 66–80 BPM in 4/4 or 3/4.
- **Melody:** opens with a rising 5th or 6th, stepwise answer, one octave leap at the climax, an appoggiatura on the cadence (Sloboda's tear-trigger).
- **Progression (D major):**
  - A: I–V/7–vi–IV (D–A/C♯–Bm–G)
  - A': I–iii–IV–iv (minor iv borrowed for ache: D–F♯m–G–Gm)
  - B: vi–IV–I–V, then ♭VI–♭VII–I (B♭–C–D) for the lift
  - Coda: IV–iv–I
- **Structure (about 2:30–3:00):**
  - Intro 4 bars (solo piano/harp)
  - A1 8 bars (solo instrument: cello, voice or oboe)
  - A2 8 bars (strings join, countermelody in violas)
  - B 8 bars (horns join, crescendo)
  - Modulation up a whole step (1-bar pivot)
  - A3 8 bars (tutti with choir: new voice entering + crescendo = chill zone, at about 65–75% of the duration)
  - Coda 6 bars (return to solo; Picardy or plagal iv–I)
- **Dynamics map:** p → mp → mf → f → ff (A3) → pp.
- **Adaptive plan:** derive (a) a menu loop (A1+A2 with a looping tail), (b) an exploration variant (harmony only, melody stem mutable), (c) a tragic variant (minor mode, slower), (d) a victory fanfare fragment (first 4 notes, brass).

---

**C. "An ambient exploration loop"**
- **Key/mode:** Lydian (wonder) or Dorian (melancholic beauty); e.g., F Lydian or D Dorian.
- **Tempo:** 60–84 BPM, or rubato pads with a soft pulse.
- **Harmony:** slow harmonic rhythm, 2–4 bars per chord.
  - F Lydian: Fmaj7–G/F–Fmaj7–Em7 (vamp), or a pedal F with sus and add9 colours
  - D Dorian: Dm9–G/D–Dm9–Cadd9
- **Instrumentation:** pads, piano or harp arpeggios, solo flute, field-recorded or regional instrument, distant choir "oo."
- **Structure:** 64–96 bars (about 2.5–4 min). Melody in short phrases with long rests (no more than 40% of bars contain melody). End on a chord that loops to bar 1. Provide a 4–8 s tail.
- **Repetition plan:**
  - 3 loop-body variations randomized in a playlist
  - 30–120 s silence between plays (random range)
  - melody stem toggled off on the second pass
- **Adaptive layers:**
  - L0 ambient bed (always)
  - L1 harmonic pad
  - L2 melody/solo
  - L3 light pulse (enemy nearby → fades in; seeds the combat transition)
  - Day/night or weather switch for orchestration variants (Kondo's water-level principle)

---

**D. "A trailer-style epic cue" (linear, about 2:00–2:30)**
- **Key/mode:** C minor/Aeolian or D minor.
- **Tempo:** 90–100 BPM, double-time percussion in Act 3.
- **Progression:** i–♭VI–♭III–♭VII (Cm–A♭–E♭–B♭), then for the finale ♭VI–♭VII–i or a modulation up a minor 3rd (C minor → E♭ minor) for the final chorus.
- **Structure (bars at 95 BPM; 4 bars ≈ 10 s):**
  - Act 1 (bars 1–16): solo piano or voice motif, sub pulse, braam hits on bars 1 and 9; sparse
  - Riser (bars 15–16) → impact
  - Act 2 (bars 17–40): string ostinato + taiko, low-brass motto, choir "ah" pads; build each 8 bars by adding one layer
  - Pre-drop silence (1–2 beats at bar 40) → huge impact
  - Act 3 (bars 41–64): full theme in horns + choir + high strings; double-time drums; key lift at bar 57
  - Button (bars 65–66): final hit + tail (3–5 s); optional "sting" after a gap
- **Dynamics map:** pp→mp (Act 1), mf→f with terraced additions (Act 2), silence→fff (Act 3), sudden cut.
- **Delivery:** full mix plus stems (percussion, low end, strings, brass, choir, FX/sound design) and a 30/60-second cutdown.

---

**E. Quick selectors**
- *Horror cue:* atonal clusters, string extended techniques, drones; "music-off" default with stingers on threat.
- *Cozy/puzzle:* major/Lydian, maj7/add9, 85–105 BPM, marimba/kalimba/ukulele/piano, 2–3 min loops, no strong climaxes.
- *Chiptune/platformer:* 2 pulse + triangle + noise. Arpeggiated chords replace polyphony. 130–160 BPM. 8-bar loops with syncopated bass.

### 4.3 Genre-by-genre cheat sheet

| Genre | Default mode(s) | Signature progression | BPM | Palette | Loop length | Adaptive default |
|---|---|---|---|---|---|---|
| JRPG field/town | Ionian/Mixolydian | I–V–vi–IV; I–♭VII–IV | 90–130 | orchestra+piano/folk | 1.5–3 min | region switch; battle swap |
| JRPG battle | Aeolian/Dorian, rock | i–♭VI–♭VII–i | 150–180 | rock band+orchestra/synth | 1–2 min | horizontal + victory fanfare |
| Open-world exploration | Dorian/Lydian/Aeolian | slow pedal vamps | 60–90 | orchestra, choir, regional folk | 2–4 min + silence | vertical threat layers |
| Action combat | Aeolian/Phrygian | i–♭VI–♭VII; i–♭II | 130–170 | hybrid, perc, brass | 1–2 min | 3–4 intensity layers + stingers |
| Boss | Phrygian/Aeolian → mediant lift | i–♭II; ♭VI–♭VII–I | 150–180 | full hybrid + choir | phase loops | horizontal phases |
| Horror | atonal/Locrian | clusters, tritone pedals | free/50–80 | extended strings, drones, noise | beds + stingers | threat RTPC, silence default |
| Platformer/chip | Ionian/Mixolydian | I–IV–V, syncopated | 120–170 | chip/bright synth | 30–90 s | tempo-up timers, item layers |
| Indie atmospheric | modal, add9/maj7 | Imaj7–IVmaj7 | 60–100 | piano, guitar, synth | 2–3 min | layer evolve |
| Strategy/4X | modal, regional | diatonic broad | 70–110 | orchestra, period instruments | long playlist | era/faction switch |
| Racing | Dorian/Aeolian riffs | i–♭VII loops | 120–175 | EDM/rock/synthwave | track length | lap/position intensity |
| Sci-fi | Lydian, quartal | I–II; mediants | varies | analog synth+orchestra | 2–4 min | state + RTPC filters |
| Fantasy | Dorian/Mixolydian; mediants | I–♭VI–♭VII–I | varies | orchestra, choir, harp, folk | 2–3 min | leitmotif variants |
| Puzzle/cozy | Ionian/Lydian | Imaj7–IVmaj7–vi7–V | 80–110 | mallets, ukulele, piano | 2–3 min | minimal; success stingers |
| Rhythm game | genre-specific | genre-specific | fixed chart BPM | genre-specific | song | strict beat sync |

### 4.4 Critique rubric (100 points)

| # | Criterion | Points | What earns full marks |
|---|---|---|---|
| 1 | Functional fit | 15 | music clearly serves the stated game state and emotion; energy matches gameplay pace |
| 2 | Thematic strength | 15 | memorable, short, transformable idea; recognizable after one hearing; motivic economy |
| 3 | Harmony and voice leading | 10 | purposeful mode/progression choice; smooth voice leading; deliberate (not accidental) surprises |
| 4 | Orchestration and register | 10 | each register has one job; no low-end mud; idiomatic ranges; doublings support melody |
| 5 | Form and tension arc | 10 | clear build/release; climax well placed; contrast before peaks; silence used |
| 6 | Interactivity/modularity | 15 | clean loops, compatible layers, composed transitions/stingers, documented cue points |
| 7 | Repetition tolerance | 5 | does not fatigue over 10+ loops; variations; melody mutable |
| 8 | Mix and production | 10 | space and depth coherent; clean sub; leaves room for VO/SFX; correct headroom/loudness |
| 9 | Identity/originality | 5 | distinctive palette or fingerprint; not a preset pastiche |
| 10 | Delivery professionalism | 5 | naming, metadata, versions, formats per spec |

Scoring bands: 90+ ship-ready; 75–89 strong, needs polish; 60–74 functional but generic or flawed; below 60 rework.

**Common mistakes → fixes:**

| Anti-pattern | Fix |
|---|---|
| Everything loud from bar 1 ("wall of epic") | start thin; add one layer per 4–8 bars; drop before the climax |
| Muddy low end (close thirds in low brass/celli, sub fights kick) | octaves/5ths below C3; one sub owner; high-pass layers; sidechain |
| Theme stated in full in the first 10 seconds | fragment first, reveal at a story beat |
| No harmonic direction (four chords forever with nothing changing) | add a lift (mediant/whole-step modulation), a textural reset, or a new voice |
| Loops click or chop reverb | bar-aligned lengths, zero-crossing edits, separate post-exit tails |
| Layers that only work together | test each stem solo and in pairs; keep each harmonically complete |
| Melody under dialogue | no-melody alts; avoid 1–4 kHz busy lines under VO |
| Hard cuts between states | quantized transitions, bridge segments, stingers |
| Exploration loop with a catchy hook that fatigues | move the hook to a mutable stem; insert silence; randomize variations |
| Generic "exotic" scale for a culture | research the tradition, hire performers, use correct language |
| Over-quantized, static-velocity MIDI mockup | CC1/CC11 dynamics, humanized timing, real legato, one live soloist |
| Limited/clipped stems | deliver with headroom; let the game mix hit the platform target |
| Ignoring the brief in favour of personal style | style guide sign-off; references by parameter |

### 4.5 Suggested skill structure

```
game-music-composer/
├── SKILL.md                       # role, intake questions, core principles (4.1), workflow router, output formats, evidence-labelling rule
├── reference/
│   ├── harmony-cheatsheet.md      # modes→affect, epic progressions, chromatic mediants (P/L/R/PL/LP/RP/H), leitharmony, modulation recipes
│   ├── melody-motif.md            # interval rhetoric, transformation table, theme templates (8/16-bar)
│   ├── orchestration-ranges.md    # range table, role map, anti-mud rules, choir vowels, doubling recipes
│   ├── rhythm-trailer-vocab.md    # ostinato patterns, tempo bands, braams/risers/impacts, meter tricks
│   ├── psychology.md              # Meyer, Huron ITPRA, chills research (with caveats) → craft rules
│   ├── adaptive-patterns.md       # vertical/horizontal/stingers/transitions; Wwise, FMOD, Unreal Quartz/MetaSounds, Unity scheduling
│   ├── delivery-checklist.md      # file specs, naming, metadata template (CSV/JSON), loudness targets
│   ├── genre-playbooks.md         # Part 2.3 table + 4.3 cheat sheet + quick selectors
│   ├── case-studies.md            # composer technique notes (labelled [E]/[C]/[O])
│   ├── critique-rubric.md         # 4.4 rubric + anti-patterns
│   ├── learning-roadmap.md        # stages, practice plan, books, courses, communities
│   └── career-business.md         # rates (GameSoundCon), contracts, PROs, AI-era notes
├── templates/
│   ├── cue-brief.md               # state, emotion, key, BPM, bars, palette, dynamics map, layers
│   ├── adaptive-spec.json         # segments, cues, transitions, RTPCs
│   └── style-guide.md
└── scripts/
    ├── make_midi.py               # pretty_midi/mido: progression + motif → multi-track MIDI with CC1
    ├── theory_check.py            # music21: key/Roman numeral analysis, range checks per instrument
    └── to_lilypond.py             # music21 → MusicXML/LilyPond
```

**SKILL.md essentials:**
1. **Modes of operation:** Composer (generate), Coach (teach/plan), Critic (rubric).
2. **Intake checklist.**
3. **Core principles.**
4. **Workflow router:** boss / main theme / exploration / trailer / horror / cozy / chip / custom.
5. **Output contracts:** always include key/mode, BPM, meter, bar-count structure, progression in Roman numerals *and* letters, orchestration table, dynamics map, adaptive-layer plan, and delivery notes.
6. **Honesty rules:** state that audio is not produced; label evidence; don't reproduce copyrighted scores; keep quotes short.
7. **When to generate code** (MIDI/notation) and how to validate it (range check, loop-length check).

**Realistic outputs:**
- text briefs and style guides
- chord charts
- melody/motif data
- runnable Python generating MIDI (with CC dynamics and tempo/markers)
- LilyPond/ABC/MusicXML notation
- orchestration and voicing tables
- Wwise/FMOD architecture specs and naming sheets
- practice plans
- rubric-scored critiques of MIDI, notation or described audio

Not feasible without external tools: rendered, mixed audio.

### 4.6 Curated sources for further learning

- **Theory and analysis:**
  - Frank Lehman, *Hollywood Harmony* (OUP 2018)
  - Lehman, "Hollywood Cadences" (*Music Theory Online* 19.4, 2013)
  - Lehman, "Manufacturing the Epic Score: Hans Zimmer and the Sounds of Significance" (in *Music in Epic Film*, Routledge 2016)
  - Lehman's *Star Wars* thematic catalogue (franklehman.com/starwars)
- **Cognition:**
  - Huron, *Sweet Anticipation* (MIT 2006)
  - Meyer, *Emotion and Meaning in Music* (1956)
  - de Fleurian & Pearce, "Chills in Music: A Systematic Review," *Psychological Bulletin* 147(9), 2021, doi:10.1037/bul0000341
  - Sloboda, "Music Structure and Emotional Response," *Psychology of Music* 19(2), 1991, doi:10.1177/0305735691192002
  - Grewe et al., *Music Perception* 24(3), 2007, doi:10.1525/mp.2007.24.3.297
  - Harrison & Loui, *Frontiers in Psychology* 2014 (frisson review)
- **Game music books:** Phillips (2014); Sweet (2015); Collins (2008, 2013); Summers (2016).
- **Orchestration/film:** Adler; Rimsky-Korsakov; Karlin & Wright, *On the Track*.
- **Talks:**
  - Koji Kondo, "Painting an Interactive Musical Landscape" (GDC 2007)
  - Mick Gordon, "DOOM: Behind the Music" (GDC 2017, free on GDC's YouTube)
  - Garry Taylor, loudness (GDC 2013 slides)
  - GDC Vault audio track postmortems
- **Composer primary writing:**
  - Bear McCreary's blog (*God of War*, *Ragnarök*, "The Lyrics to God of War")
  - PlayStation Blog theme breakdowns
  - Wintory interviews (8dio, NME)
  - Testard interviews (RPG Site, Game Rant, NME)
  - Korb interviews (Laced Records, Echoes and Dust)
- **Middleware:**
  - Audiokinetic Wwise documentation, certifications and blog (incl. "How to Use Interactive Music to Score Gameplay," "Making Music Interactive" series)
  - FMOD Studio user manual
  - Epic's Quartz Overview/Quick Start and MetaSounds documentation
- **Industry data:** GameSoundCon Game Audio Industry Surveys (2016–2025); Sony ASWG-R001.
- **Code tools:** pretty_midi, mido, music21, LilyPond, ABC notation, pyloudnorm.
- **Communities:** G.A.N.G., GameSoundCon, VI-Control, Global Game Jam.

---

## Caveats

- **Composer statements [C]** describe intent and process. They don't prove how music affects players.
- **Chills research** is correlational, mostly self-reported, from small or mostly Western samples. Sloboda's passage-level analyses are especially small, and popularized claims about appoggiaturas overstate them.\[38\]
- **Tempo, bar-count and range "defaults" [O]** are starting points; repertoire contradicts all of them.
- **Loudness figures** differ across sources and eras (−23 vs −24 LUFS console; −16 vs −18 portable). The project audio director's spec wins.
- **Survey data** from GameSoundCon is self-selected and US/EU-heavy. Rates vary hugely by region, scope and reputation.
- **Analyses of some composers** (Uematsu, Shimomura, Mitsuda, Soule, Coker, Raine, Larkin, O'Donnell, Disasterpeace, Toby Fox, Kyd, Zur, Schyman, Yamaoka, Barton, Curry, Santaolalla, Djawadi, Guðnadóttir, Bergersen) are analyst-consensus summaries [O] rather than sourced to primary interviews in this report. The skill should present them as such and invite verification.

## Sources

1. <https://franklehman.com/wp-content/uploads/2021/01/2016-Manufacturing-the-Epic-Score-Music-Epic-Film-Routledge-1.pdf>
2. [GameSoundCon 2025: Game Music and Sound Design Jobs Data Analysis](https://www.gamesoundcon.com/post/gamesoundcon-game-audio-industry-survey-2025)
3. [Cinematic Guitar Chord Progressions: How to Create Mood and Atmosphere](https://guitarwiz.app/articles/cinematic-chord-progressions-guitar/)
4. [Chromatic Mediants Explained (the Cinematic Chord Move), With MIDI — Motifkit](https://motifkit.com/chromatic-mediants/)
5. [Frank Lehman](https://franklehman.com/)
6. [Hollywood Harmony PDF Frank Lehman](https://cdn.bookey.app/files/pdf/book/en/hollywood-harmony.pdf)
7. [MTO 19.4: Lehman, Hollywood Cadences](https://www.mtosmt.org/issues/mto.13.19.4/mto.13.19.4.lehman.pdf)
8. [Frank Lehman - Hollywood Harmony\_ Musical Wonder and the Sound of Cinema-Oxford University Press, USA (2018).pdf - PDFCOFFEE.COM](https://pdfcoffee.com/frank-lehman-hollywood-harmony-musical-wonder-and-the-sound-of-cinema-oxford-university-press-usa-2018pdf-pdf-free.html)
9. [ITPRA theory](https://thebiasedmindblogdotcom.wordpress.com/2014/02/26/itpra-theory/)
10. [Sweet Anticipation Music and the Psychology of Expectation David Huron](https://www.researchgate.net/profile/David-Huron-2/publication/209436188_Sweet_Anticipation_Music_and_the_Psychology_of_Expectation/links/0c96052e02be139f9f000000/Sweet-Anticipation-Music-and-the-Psychology-of-Expectation.pdf)
11. [(PDF) David Huron, Sweet Anticipation. Music and the Psychology of Expectation, Cambridge: MIT Press 2006](https://www.researchgate.net/publication/327813540_David_Huron_Sweet_Anticipation_Music_and_the_Psychology_of_Expectation_Cambridge_MIT_Press_2006)
12. [MTO 15.3 and 4: Aversa, Review of Huron](https://mtosmt.org/issues/mto.09.15.3/mto.09.15.3.aversa.html)
13. [Chills in Music: A Systematic Review Rémi de Fleurian1 and Marcus T. Pearce1, 2](https://www.marcus-pearce.com/assets/papers/deFleurianPearce2021b.pdf)
14. [Music Structure and Emotional Response: Some Empirical Findings - John A. Sloboda, 1991](https://journals.sagepub.com/doi/10.1177/0305735691192002)
15. [LISTENING TO MUSIC AS A RE-CREATIVE PROCESS](https://www.researchgate.net/profile/Frederik-Nagel/publication/249979721_Listening_To_Music_As_A_ReCreative_Process_Physiological_Psychological_And_Psychoacoustical_Correlates_Of_Chills_And_Strong_Emotions/links/00b4953199238cf580000000/Listening-To-Music-As-A-ReCreative-Process-Physiological-Psychological-And-Psychoacoustical-Correlates-Of-Chills-And-Strong-Emotions.pdf)
16. [(PDF) Psychoacoustical correlates of musically induced chills](https://www.researchgate.net/publication/228342123_Psychoacoustical_correlates_of_musically_induced_chills)
17. [Transformational Theory and the Analysis of Film Music](https://www.researchgate.net/publication/365789498_Transformational_Theory_and_the_Analysis_of_Film_Music)
18. [Hollywood harmony : musical wonder and the sound of cinema / Frank Lehman - Penn State University Libraries Catalog](https://catalog.libraries.psu.edu/catalog/23486723)
19. [Bear McCreary: God of War - game score soundtrack, an mfiles review](https://www.mfiles.co.uk/reviews/bear-mccreary-god-of-war.htm)
20. ['God of War': How Viking Folk Music Inspired "Audacious" New Game's Soundtrack](https://www.revolvermag.com/culture/god-war-how-viking-folk-music-inspired-audacious-new-games-soundtrack/)
21. ['God of War' Score: Why Composer Bear McCreary Turned to Nordic Folk](https://www.billboard.com/music/music-news/bear-mccreary-god-of-war-video-game-score-interview-8256913/)
22. [God of War Ragnarök - Bear McCreary](https://bearmccreary.com/god-of-war-ragnarok/)
23. [Procedural music generation with Quartz - Unreal Engine](https://www.unrealengine.com/tech-blog/procedural-music-generation-with-quartz)
24. [Cueing sounds in a non-quantized way with Quartz - Audio - Epic Developer Community Forums](https://forums.unrealengine.com/t/cueing-sounds-in-a-non-quantized-way-with-quartz/609667)
25. [Overview of Quartz in Unreal Engine](https://dev.epicgames.com/documentation/unreal-engine/overview-of-quartz-in-unreal-engine)
26. [Interview: Composer Austin Wintory On Journey](https://www.thesixthaxis.com/2012/03/15/interview-journey-composer-austin-wintory/)
27. [Music Of 'Journey'](https://filmmusictheory.com/article/music-of-journey-how-austin-wintorys-music-defines-a-gaming-masterpiece/)
28. [Clair Obscur: Expedition 33 Composer Lorien Testard Discusses Ambitious Five-Year Soundtrack Project](https://noisypixel.net/clair-obscur-expedition-33-soundtrack-lorien-testard-interview/)
29. [Music of Clair Obscur: Expedition 33](https://en.wikipedia.org/wiki/Music_of_Clair_Obscur:_Expedition_33)
30. [Lorien Testard](https://en.wikipedia.org/wiki/Lorien_Testard)
31. [How 'Clair Obscur's soundtrack became a breakout smash hit](https://www.nme.com/features/gaming-features/clair-obscur-expedition-33-lorien-testard-interview-painted-symphony-3942036)
32. [Loudness in Interactive Sound at Sony](https://randycoppinger.com/2013/10/18/loudness-in-interactive-sound-at-sony/)
33. [Worldwide Loudness Delivery Standards](https://www.rtw.com/blog/rtw-knowledge-base-1/worldwide-loudness-delivery-standards-4)
34. [Garry Taylor, Audio Director Sony Computer Entertainment ...](https://media.gdcvault.com/gdc2013/slides/824764Garry_Taylor_Loudness_and_how.pdf)
35. [Video Game Music Salaries and Jobs](https://www.gamesoundcon.com/game-audio-survey-2016)
36. [Game Development Outsourcing Rates (2026): A Sourced Benchmark](https://www.gamedevoutsourcing.com/game-development-outsourcing-rates)
37. [Survey: Women Making Inroads Into Game Audio Industry - Mixonline](https://www.mixonline.com/news/survey-women-making-inroads-into-game-audio-industry)
38. [Sounds Heard: Anatomy of a Truth-Bender - New Music USA](https://newmusicusa.org/nmbx/sounds-heard-anatomy-of-a-truth-bender/)
