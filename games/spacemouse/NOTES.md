# Space Mouse: notes

**The game.** Pip, a mouse in a space suit (glass helmet, ears inside, orange air tank), crosses three sectors of an
abandoned, mostly dark space station looking for the great cheese at the end of each. A side-view platformer on the
engine's `Character` controller, with the station's back walls on the engine's back-wall layer.

Sectors (`sectors.js`, one character per 4 × 4 base-unit tile; the legend is at the top of the file):
1. **Cargo Bay**: the tutorial. First jump, a pit of broken glass, crate stairs, a cheese wall to eat through, a rusted floor
   that drops you into the cat-bot hall, a catwalk shaft, a live cable, a window room with the cheese moon.
2. **Hydroponics**: climb a spilled pile of peas (sand), a catwalk shaft, a cheese plug, then a gantry that falls with you
   into the grow trays; crates and a second shaft up to the great cheese.
3. **Observation Deck**: a cat-bot guarding a cracked wall (short it next to the wall for a stash of crumbs), a hatch to the
   outside: a low-gravity spacewalk over the hull in sunlight, a breach full of glass; back in through a high hatch, a long
   gallery under huge windows with cat-bots on two levels, and the captain's cabin with the captain's cheese.

**Controls.** A D / arrows run, W / Up / Space jump (hold for height; press again against a wall to wall-jump), S / Down drops
through catwalks and eats the cheese you stand on, walking into cheese eats it. Touch: < > on the left, v and JUMP on the
right. Enter or tap to start and continue.

**Parts.** `materials.js` (front and back-wall materials, what hurts, what is edible), `sectors.js` (maps), `station.js`
(map → world: tiles, Swiss-cheese holes, sagging cables, back-wall panels, glow-paint signs, lamps, the cheese moon on the
sky), `giveway.js` (rust and cracked walls crumbling, gantries, low gravity), `art.js` (sprites: the mouse in six frames, the
cat-bot), `mouse.js` (input, eating, pickups, checkpoints, hazards, death), `catbots.js` (patrol, sight, chase, stomp),
`main.js` (states, lamps, HUD, hints, camera, hooks).

**Tunables.** Gravity (× normal; jumps keep their height), jump height (mouse heights), run speed (mouse widths/s), air
control, wall jumps on/off, cat-bot speed, station light (the ambient).

**Decisions.**
- Hand-drawn tile maps rather than generated levels: platforming needs designed jumps. The maps scale with RES, so detail
  changes rebuild the same level (`gameRegenerate` keeps crumbs, checkpoints, shorted cat-bots and the mouse's position).
- Gravity is strong (240 base units/s², about 12 g in engine metres) because the world is mouse-sized: a jump rises 2.6 mouse
  heights in a third of a second. Particles and sand share it.
- The mouse dies on contact with cables, glass and the side of a cat-bot; falls never hurt. Respawn at the last checkpoint,
  with 1.5 s in which cat-bots ignore it (it blinks), so a patrol can't trap it in a loop.
- A shorted cat-bot's blast sets off whole cracked-wall panels within about two tiles (`crackWalls`), so secrets open
  reliably instead of being chipped.

**Tests.** `tests/mechanics.py` (the mechanics at RES 1–3) and `tests/reach.py` (every sector finishable, every crumb and
checkpoint reachable). Run `reach.py` after any map edit.

**Known issues / ideas.**
- No music yet (the Chip could play an eerie station theme; the beat could drive the alarm lamps).
- Cat-bots don't jump or use catwalks; a jump-link navgraph (idea bank) would let them follow.
- The gantry falls straight down; a hinge (one bracket going first) would swing it.
- The darkness is a mood choice; the Station light tunable raises it.
