# The Bubbling Moon: level design, puzzles and art

Chapter 9, the second world of Act III ("Worlds out of balance"). This is a **proposal**: the owner gave free hands for the puzzles ("I will think about this
later"), so everything marked *Idea* is a suggestion to cut, swap or keep. What the review notes (`Star Whiskers Review Notes`, the Docs page, 2026-11-13) have
already **decided** about this world is in the first section and is not changed here. The art sheets that go with it are described in the last section.

## 1. What is already decided (from the review notes and STORY_V2)

- **Order and trail.** Cheese Forest, **Bubbling Moon**, Sleeping Station, Scrap Belt. The tower's clues in the Cheese Forest point to the moon, whose pumping
  station points on to the Sleeping Station. Miss Clou knows where the moon is but did not know it mattered until the tower said so.
- **Mood.** Strange and playful in a creative way, though the universe is already sad. Every cat site is high tech but **half finished**, silly rather than scary
  (it is a children's game).
- **The look.** Giant cheese craters with Swiss-cheese holes are **pits**. Bubbles of old milk pop up as **bouncy platforms**. A big wobbling **curd** drifts
  across the dry lake like a slow boat. The dried lakes form a **glossy white crust that mirrors the sky**.
- **The pumping station** holds the **map of the pipes** (reused in Ch 12's milk works). It was built to pump milk from these lakes to the fortress, so MEGA-MJAU's
  empire began by draining this moon.
- **Three rewards:** the pipe map as a scrapbook page; a scrapbook photo with history from the station (an old plaque or a faded photo of the first pumping
  day); a **pump housing** that Pip bolts on as a fuel tank so the ship can run farther (Pip's build rule: cat parts only as dead material, never wired up).
- **The first photo** is the mirror-flat reflection of the thin Milky Way underfoot (a placeholder that may change).
- **Cast.** Pip is naive, kind, eager to help and photographs everything; Miss Clou is lazy, lets him do the legwork while she hovers, hints and turns up with
  help, and disdains the scrapbook. The scrapbook photos are taken at a button prompt, and its pages work as proof, key, gift, map and finale evidence.
- **Still open in the notes:** the moon's **hook** ("so the middle is more than travel") and its first photos. Section 2 proposes a hook.

## 2. The hook (Idea): the moon has hiccups

The pumping station was never finished. Three of its six pumps were bolted on and switched on to "test" and **nobody ever came back to switch them off**. With the
lakes dry, the main pump (No. 4) now sucks on nothing, and every few seconds it **hiccups**: a thump runs along the pipes, and the whole moon answers. Bubbles of
old milk swell and pop in the crust, vents puff, platforms bob. That is why it bubbles.

Why it works for the game:
- **One rhythm for the whole level.** A **pulse** (about every 3 seconds, a heartbeat in the music: the engine already has a beat, `Beat` and `setBeatPulse`) drives
  every mechanic: bubbles, the curd, the pipes, the lights. Learning the beat is learning the level.
- **It tells the sad story without words.** The cats built a machine to take everything and left it running; the moon is hiccuping because it has nothing left to give.
- **It gives the finale a goal that is silly and warm:** cure the hiccup (section 4, P10). When it stops, the moon is quiet for the first time in years, and far
  out on the dry lake a **single new bubble** rises: the same hope as the one cheese fruit in the Cheese Forest.
- It fits the half-finished rule (a pump nobody switched off) and does not copy the Sleeping Station's idea (machines that loyally do their jobs for nobody).

## 3. The route: five zones, about 14 screens (a screen is 480 x 270 game pixels)

| Zone | Length | What it is | Backgrounds | What the player does |
|---|---|---|---|---|
| **A. The Crust Flats** | 3 | arrival: the rocket lands on the glossy dried lake | sky, far mountains, middle plain | learns thin and safe crust (P1) and the first bubbles (P2); **photo 1** |
| **B. The Swiss Craters** | 3 | pits full of holes, cheese cliffs | sky, far, near cliffs | bubble chains over pits (P3), the hole maze (P4) |
| **C. The Dry Lake** | 2 | a wide dry lake with the curd | sky, far, middle (the station far away) | the curd ferry (P5) |
| **D. The Pipeline** | 3 | the great pipe from the station, walked along and slid through | middle (pipeline), near | valves (P6), the pipe slide (P7), the box (P8) |
| **E. Pump No. 1** | 3 | the half-built station, inside | station wall, deep hall | the four map pieces (P9), curing the hiccup (P10), the rewards |

The player can see the station from zone A on (a small silhouette with its pipeline running to the horizon), so the goal is always in sight and the trail
(the pipeline) leads there. Zones B and C can be done in either order (two ways to the pipeline), which gives a bit of choice without breaking the fixed order of worlds.

## 4. The puzzles (a menu: pick what you like)

Each one says what it is, how it works, what it needs drawn (names are the labels on the art sheets), what it teaches, and what the engine would need.
**Size** is S (a screen or less), M (about two screens), L (a set piece).

### P1. Shiny means thin (S, zone A, teaches: read the surface)
The crust has two looks: **matte, chalky** crust is thick and safe; **glossy, mirror-shiny** crust with a bluer sheen is thin. Thin crust shows cracks when Pip
lands on it, and gives way a moment later, dropping him into a pit of old milk (a bounce back up, no damage: it is a children's game). A path of mixed
slabs crosses the first flat; the sign "THIN CRUST" is the only text. One **mirror patch** of thick, glossy crust is safe: the place for photo 1.
*Needs:* glossy crust, thin crust (cracks), matte crust, crack decals, mirror patch, thin-crust sign, pit S. *Engine:* a material that breaks after a short time under a
Character (`brittle` or a timed cell change), `bouncy` milk in the pit.

### P2. Bounce on the beat (M, zone A and B, teaches: the pulse)
Bubbles **swell on the beat and pop on the next**; a bubble is only bouncy while it is full. Sequence of three: (1) one bubble to reach a ledge with the first
cheese; (2) a **chain**: bounce from a small bubble onto a large one within one beat; (3) a **bounce that needs a held jump**: landing on a large bubble with the
jump button held gives a bounce twice as high, to reach a floating chunk. Bubbles reform after a pop, so nothing can be lost for good.
*Needs:* all the bubble states (bud, small, medium, large, squash, pop 1 to 3, puddle, crack and ooze, cluster), floating chunks. *Engine:* `bouncy` material whose
solidity follows the beat; the squash frame when landed on.

### P3. A pit full of bubbles (M, zone B, teaches: planning a route)
A wide crater with Swiss holes in its walls and bubbles rising from its floor in a pattern. The holes are **handholds for the eye**: a drip from a hole shows
where the next bubble will come up (the milk comes from the hole above it). The route is the sequence of drips. Wrong jumps land in the milk (bounce, try again).
*Needs:* crater L and lip, holes with drips, bubbles. *Engine:* bubbles spawning at positions tied to the holes' drips.

### P4. Which hole? (M, zone B, teaches: matching)
A big cheese wall with six holes. Holes with the **same shape** are the two ends of one tunnel through the cheese (the small round ones, the oval ones,
the ones with a **drip**, the ones with a **rind lip**): Pip goes in at one and comes out of its partner, on another level. Which partner leads to the ledge
with the next stretch and which to a dead end (a stash of cheese crumbs, so a wrong guess is a small reward)? The two big holes are the way on.
*Needs:* hole S, M, L, oval, drip, rind lip, cheese wall, tall wall, wall cap. *Engine:* paired triggers that move the Character (a "door" pair, as the pipes in
a classic platformer). A **secret** here: a hole behind a foreground rock (section 6).

### P5. The curd ferry (L, zone C, teaches: wait and ride)
The dry lake is too wide to jump. A big **curd** slides slowly across a thin film of whey from one **dock post** to the other and back; it is a platform that
**wobbles when something lands on it**: it squashes, and if Pip stands near an edge it tilts and tips him off. Two ways to make it a puzzle:
- *The half fan* (cat tech, only two of its four blades fitted): it blows a gust every second beat, and the curd only moves while a gust is on it. Pip rides between
  gusts and must **jump off at the docks** before it turns round. A lever switches the fan's direction.
- *The cheese wheel as ballast:* a big wheel on the curd keeps it level; to carry the wheel across, Pip pushes it on and rides standing on the other side.
Fun: the curd's **sail** (a slice of cheese rind on a stick), the hiccup makes it jump, and a **bubble** can lift it over a rock.
*Needs:* curd (rest, squash, stretch, tilt L and R, sail), small curd, dock post, whey film, half fan, cheese wheel L. *Engine:* a moving platform (the Proving Ground has
`FERRY` and `LIFT`) with a squash animation driven by what stands on it; the physics are not needed, the frames are.

### P6. Valves in the right order (M, zone D, teaches: reading clues)
Three **valve wheels** (red with one paw, blue with two, yellow with three) control the pipeline's three branches; a **gauge** shows the pressure, and the window
pipes show the milk running. A **notice** (the builders' own, with a sticky "FINISH LATER") gives the order as a riddle: *"Red first. Never blue after yellow. (Don't ask.)"*
Right order: the gauge goes green and the milk flows to the lift that raises the next catwalk. Wrong order: a **geyser** pops Pip up in the air (harmless, and a hint:
the wheel's own paw count lights up where he went wrong). The first clue is on the notice board in zone C, so he has met it before he needs it.
*Needs:* wheel red, blue, yellow, gauge low, ok and broken, window pipe, pipes, notice board, note, lamp. *Engine:* a small state machine of three switches.

### P7. The pipe slide (M, zone D, teaches: flow)
The milk used to flow through **transparent pipes**; the old pipes are still full of slow, thick milk, and Pip can **slide through them like a water slide**: he
rides the flow. At two **tees** a lever sets the branch (up, to a high catwalk; down, back to the start), and the **hiccup** shoves him forward in a burst, so the
long straight pipes are a run of boosts on the beat. A branch ends in an **open end** that spits him out onto a ledge with cheese.
*Needs:* window pipes, elbows, tee, cross, open end, main pipeline (straight, up, down, tee, end), levers up and down. *Engine:* a `conveyor`-like zone with a direction set
by a switch; for the first version a rail (a set path) is enough.

### P8. The box (S, zone D, with Miss Clou, teaches: use the cat)
A heavy door of the pipeline office opens only to a **pressure plate** that is too heavy for Pip. A cheese wheel is not heavy enough. **Miss Clou is.** She will
not get on a plate (she is lazy and above it): "I don't do plates." But there is a **cardboard box** on the floor, too small for her, and **cats cannot resist a box**:
"if I fits, I sits." She climbs in, sulking. Pip pushes the box (with her in it) onto the plate. The door opens. **Photo (optional): Miss Clou in the box,
glaring**, which she hates (it adds to the running gag that she disdains the scrapbook). Variation for the end of the world: the **cat bed** instead of the box,
used as bait on the plate.
*Needs:* box open, box closed, cat bed, plate up and down, door shut and open, cheese wheel. *Engine:* a pushable Body that carries a second character; the two-character
switching is an open question (section 7).

### P9. Four torn pieces (L, zone E, teaches: everything again)
The **pipe map** hangs torn in four jigsaw-shaped pieces round the station, each guarded by one of the chapter's mechanics, so the zone is a revision of the world:
1. **Bubble:** a piece caught in a chain on a hook over a pit: bubble chain P2.
2. **Hole:** a piece in a dead-end tunnel of the cheese wall in the pump hall: the matching holes of P4.
3. **Valve:** a piece inside the **empty tank**: drain the tank with the wheels (tank full, half, empty are three frames) and climb in.
4. **Curd:** a piece on the curd's far dock, left there by a survey drone that has landed and stopped.
At the **drafting table** the pieces are put together and the pipe map becomes a **scrapbook page** (and a fuse for the Ch 12 milk works, where the same map
appears, so the player will recognise the pipes it shows). The plaque and the old photo are on the way (photo 2).
*Needs:* map piece 1 to 4, pipe map, drafting table, tank full, half and empty, survey drone, hook, chain.

### P10. Cure the hiccup (L, zone E, the finale, teaches: the beat is yours)
The main pump (No. 4, half built, scaffolding still round it) hiccups on the beat, so all the world's bubbles and pulses come from it. The classic cures work:
**hold its breath**. Pip closes the **four intake valves** (one on each level of the scaffold) in the right order **within one pulse each**, with the pump's
**hiccup lamp** on a panel counting down; each valve closed makes the next hiccup smaller, and the **piston** frames slow down. Too slow and the pump resets
(the valves open again, no penalty). After the fourth, the pump gives one last, long **sigh**, the bubbles all settle, the light goes calm and the music drops
its beat. The **pump housing** is loose now: Pip bolts it on the rocket as a **fuel tank** (reward 3). Outside, far off on the lake, **one new bubble** rises (the hope).
Alternative cures (pick one for the joke): a **fright** (drop the big wrench on the siren: "BOO!"), or a **drink** (a ladle of milk poured into the pump: "a glass of water,
upside down").
*Needs:* main pump, piston 1 to 3, pump housing, hiccup lamp, valve wheels, scaffold, siren, big wrench, ladle. *Engine:* the beat, a countdown per valve.

### Secrets and extras (S each)
- **Behind the foreground.** Foreground pieces (mould bank, pillars, a rind drape) fade as Pip walks behind them and hide **cheese crumbs** and one hole to
  a stash. Count the crumbs for a small, silly bonus (the counter is already in the HUD).
- **The slow ride (photo 3, optional).** A giant bubble in the highest crater lifts Pip slowly up: from above the thin Milky Way can be seen crossing the sky. The
  most beautiful picture in the chapter; the scrapbook photo prompt appears at the top.
- **Echo hole.** A large hole in the cheese wall answers a jump with an echo: a note of the Sampler's, one per jump, going down the scale; nothing depends on it.
- **The sleeping drone.** A survey drone, landed and stopped, can be woken by a stomp and follows Pip for a few steps like a puppy (a gag; it is the one from P9).
- **A helmeted cat (open).** The notes say Pip can help locals and free more cats on every world. One helmeted cat asleep on a pump trolley in zone D, freed by a stomp,
  would be the moon's cat; not drawn yet (the cat designs belong to the cast sheet).

## 5. Miss Clou on the moon (Idea)

She keeps to her pattern: a startle, a snap back to the cool facade, desperation leaking through.
- Arrival: she does not look at the reflection ("I don't look at floors") and only glances at it once Pip has gone: she sees her crew's rocket in it? *(Open: too much
  for this chapter?)*
- She **hints rather than helps**: from a safe place she says things like "mind the shiny bits" (P1) and "I'd go left" (P3), always slightly too late.
- The plaque: she knows who is in the old photo and goes quiet for a second (it echoes the carvings in the Cheese Forest); she brushes it off.
- P8 is her scene; P10 is Pip's. For once she **does one job herself**: a quick dash for the last valve at the end ("it was on my side anyway").

## 6. The scrapbook on the moon

| When | Photo | Notes |
|---|---|---|
| Zone A, on the mirror patch | **the reflection of the thin Milky Way underfoot** | the decided first photo (placeholder); also the **map** use: the broken band points the way to the station |
| Zone D, optional | **Miss Clou in the box**, glaring | gag; a page nobody asks for |
| Zone E, the plaque | **the old plaque** ("FIRST PUMPING DAY") and the **faded photo** of the ribbon-cutting: tiny figures with giant scissors, cats and mice side by side, no faces | the history photo: the **proof / finale evidence** use (cats and mice once did this together) |
| Zone E, the map | **the pipe map**, assembled | the page that becomes the Ch 12 map |
| End | **the one new bubble** | the hope photo, optional |

## 7. Open questions for the owner

1. **The hook.** Is "the moon has hiccups" (one beat for the whole level) the right hook, or do you want something else? It also decides the music (a slow pulse that
   the pump keeps).
2. **Two characters.** Is Miss Clou playable on this world (so P8 and P10 could be solved with a switch), or only a helper who sits where she is put?
3. **How hard.** The puzzles are a menu: which of P1 to P10 do you want, and how many should be optional?
4. **Pushing.** Can Pip push and carry things (cheese wheel, box)? P5 and P8 need it; if not, the puzzles can be done with switches only.
5. **A cat on the moon.** Is one helmeted cat to free here, and who is it?
6. **The curd and the wheels.** Should the curd be a real character (a friendly, silent blob that follows a whistle) or only a platform?

## 8. The art

Everything is drawn at the game's scale: one art pixel is a **4 x 4 block** of picture pixels on the sheets, so the screen (480 x 270 game pixels) is 1920 x 1080 picture
pixels and Pip is 196 picture pixels tall. The sheets are made through the image API by `games/spacewhiskers/tools/sheets.mjs` (the prompts, with the row plan, are in that
file and, with what the API answered, in `ref/prompts/`), with the owner's own pictures as the style references. They are kept untouched in `ref/` and listed in
`ref/ref.json` (the site's ART page shows them). A sheet that is made again is kept under a new name (`_2`); the first terrain take was softer and noisier than the
second, and only the second is kept.

| Sheet (`ref/bubblingmoon_...`) | What is on it |
|---|---|
| `terrain` | 7 rows: platforms (glossy, thin, matte crust, floating chunks, Swiss ledge, wedge), ground blocks, craters and pits, holes and cheese walls, rocks and formations, plants and small decor, ground decals |
| `milk` | 6 rows: every state of the milk bubble, the curd (rest, squash, stretch, tilt, sail) and its dock and whey film, milk things (churns, bottles, drips), pickups and movables (crumb, wedge, cheese wheels, box, cat bed, yarn), signs and markers, the builders' leftovers |
| `station` | 8 rows: pipes, the walkable main pipeline, valves and controls, pumps and tanks (with the pump housing), doors and architecture, the inside (the pipe map and its four pieces, the plaque, the old photo), lights and hazards, tools |
| `bg_outdoor_1` | two panels, each two screens wide (3840 x 1080): **the sky** (top, opaque) and **the far mountains** (bottom, on magenta) |
| `bg_outdoor_2` | **the middle plain with the far pumping station** (top) and **the near cliffs** (bottom), on magenta |
| `bg_station` | **the back wall of the pump hall** (top, opaque) and **the deep machine hall** (bottom, on magenta) |
| `fg_outdoor` | the foreground pieces of the open moon: hanging stalactites, corner rocks, tall pillars, big low shapes, mist |
| `fg_station` | the foreground pieces of the station: hanging pipes and cables, machine edges, beams, railings, steam |

### How the layers are used (Idea)
| Layer | Speed against the action | Notes |
|---|---|---|
| sky | 0.05 | repeats sideways; stars twinkle through the engine's `stars` layer; the broken Milky Way |
| far mountains | 0.15 | repeats sideways |
| middle plain / pumping station | 0.35 | the station gets bigger as the player gets nearer: a second, larger version for zone E |
| near cliffs | 0.6 | behind the platforms; the open middle keeps the action readable |
| **the action** | 1 | platforms, props, Pip |
| foreground | 1.3 to 1.6 | in front of Pip; **fades where Pip is behind it** (the engine's front pass, `drawFront`); a few hide secrets |
| the mirror | | the glossy crust shows the sky **upside down** under it (a trick for the `sky` hook: the sky layer drawn mirrored on the cells of a glossy material), which is what makes the reflection photo |
| light | | the bubbles glow a little (`emit`) and **pulse on the beat** (`setBeatPulse`); the station's lamps are dim; the hiccup lamp is red |

### Cutting the sheets later
- The ground is flat magenta (it comes back as about (247, 54, 238), a little noisy): cut it with a wide tolerance (the pixel-art skill says 40 to 60) and look at a
  contact sheet of every cut. The labels are under the items, with a gap; the row plan in `tools/sheets.mjs` is the list of names, left to right, top to bottom.
- The pictures are made with a 4 x 4 grid but come back a little soft (the model does not keep a perfect grid): the **Pixel Snapper** (`tools/snap.mjs`, the PIXEL LAB)
  puts them on their true grid and palette, as for Pip, before they go into `art/` (`pixelite-pixel-art`).
- Check a sheet against its row plan item by item (missing, extra, garbled label), as `pixelite-art-prompt` says. What each sheet is missing is in `ref/ref.json` under the
  sheet's `note`. Known so far: `terrain` lacks "crater cap L" and has pink paw prints; `station` lacks "map piece 2"; the milk curds, the mist banks, the steam, the dust beam
  and a few piston caps have a pink tint that the magenta key would eat (cut those with a narrower tolerance, or ask for them again); `bg_*` seams are not checked.
- **A gap, again:** magenta comes back as about (247, 54, 238), not (255, 0, 255); `tools/art/image.mjs` `removeKey` takes a tolerance.
