# The Bubbling Moon: the five zones, one by one

A companion to `BUBBLING_MOON.md` (the hook, the puzzle menu, the questions). This file describes **each zone as a place to build**: what it looks like, what happens
in it, a rough sketch of its layout, and which sprites it uses. It is a **sketch for the owner to change**, not a finished map.

**Scale.** A screen is 480 x 270 game pixels. Pip is 49 tall (a bit over six 8-pixel tiles). In the sketches **one character is 32 x 32 game pixels** (so a screen is
15 characters wide and about 8 tall, and Pip is 1.5 characters). Sprite names are `group/name`: the files are `sprites/<group>/<name>.png` in the pack and
`ref/frames/bubblingmoon_<group>_<name>.png` in the repository; a sprite's size in game pixels is its picture size divided by 4 (it is written in `sprites/INDEX.md`).
Backgrounds are `backgrounds/<outdoor|station>/<layer>.png`, two screens wide each.

```
LEGEND   P Pip's start   > way on   * cheese crumb   = matte crust (safe)   g glossy crust (thin: cracks)   m mirror patch (safe, photo 1)
         o milk bubble   O large bubble   U pit   H hole in a cheese wall   ~ whey film / the curd   V valve wheel   L lever   D door   B box   W cheese wheel
         [] catwalk or pipe to walk on   | wall   S sign   F foreground piece (Pip walks behind it)   ^ stalactite   $ pump / machine
```

## The mood in one paragraph

Night on a moon that is **sad and silly at once**: a deep violet sky with the Milky Way broken and fading, a plain of glossy white crust like a frozen lake that
shows the sky upside down, cheese hills with holes in them, and, small and far away, the cats' unfinished pumping station with a pipeline running to the horizon.
Everything bubbles a little on a slow beat (the pump's hiccup). The light is low and bluish; the bubbles glow faintly white and swell with the beat; the cats'
lamps are warm and few. Nothing is scary: the dangers are holes and thin crust, and you bounce back out of them.

## Zone A. The Crust Flats (3 screens: arrival, learning to read the ground)

**Story.** The rockets land. Miss Clou does not look at the floor; Pip does, and sees the sky in it. He takes the first photo (the reflection of the thin Milky Way).
**What happens.** The ground is a field of crust slabs: **matte ones hold, glossy ones crack** (P1); the first **bubbles** swell and pop on the beat (P2);
a **sign** warns about thin crust; from here the station is a tiny silhouette on the horizon. Teaches: read the surface, learn the beat.
**Background** `outdoor/sky` (0.05) and `outdoor/far-mountains` (0.15), `outdoor/middle-plain` (0.35). **Foreground** one `fg_outdoor/mould-bank` and one
`fg_outdoor/crack-front` at the bottom edge, `fg_outdoor/mist-a` low across the first screen (it fades near Pip).

```
screen 1          screen 2          screen 3
...............   ...............   ...............
...............   ........O......   .........*.....
...............   .......=====....   ........[===]..
.P..S...*......   ..........*.o....   ..*....*.*...>
===gg==m===gg==   ==U==gg==mmm=gg=   ====U===gg===U=
```

| Sprites | |
|---|---|
| ground and platforms | `terrain/matte-crust-safe`, `terrain/glossy-crust`, `terrain/thin-crust-cracks`, `terrain/crust-block`, `terrain/crust-block-crack`, `terrain/crust-corner-l`, `terrain/crust-corner-r`, `terrain/floating-chunk-l`, `terrain/floating-chunk-m`, `terrain/floating-chunk-s`, `terrain/slope-up`, `terrain/slope-down` |
| pits | `terrain/pit-s`, `terrain/pit-m`, `terrain/pit-floor` |
| bubbles | `milk/bud`, `milk/small`, `milk/medium`, `milk/large`, `milk/squash`, `milk/pop-1`, `milk/pop-2`, `milk/pop-3`, `milk/puddle`, `milk/crack-and-ooze`, `milk/cluster`, `milk/bubble-with-crumb` |
| decor and decals | `terrain/crack-a` to `crack-d`, `terrain/mirror-patch`, `terrain/milk-splat`, `terrain/dust`, `terrain/skin-curl-a`, `terrain/skin-curl-b`, `terrain/pebbles`, `terrain/bone-white-shell`, `terrain/mould-a`, `terrain/dry-moss-a` |
| signs and pickups | `milk/thin-crust`, `milk/welcome`, `milk/survey-flag`, `milk/crumb`, `milk/wedge` |

**Photo 1** is taken standing on `terrain/mirror-patch` (a safe glossy slab): the sky upside down underfoot.

## Zone B. The Swiss Craters (3 screens: pits, holes and bubble chains)

**Story.** The crust gives way to cheese: hills with big round holes, craters that are the pits. Miss Clou starts hinting ("I'd go left"), always a beat late.
**What happens.** A wide **crater full of bubbles** (P3): the milk drips from the holes in the walls show where the next bubble will rise. Then a **cheese wall with six
holes** (P4): holes of the same shape are the two ends of one tunnel; the right pair leads to the ledge on, the wrong ones to a stash of crumbs. A **secret** behind a foreground
pillar. Teaches: plan a route, match shapes.
**Background** `outdoor/sky`, `outdoor/far-mountains`, `outdoor/near-cliffs` (0.6: the holed cliffs). **Foreground** `fg_outdoor/pillar-a`, `fg_outdoor/pillar-b`, `fg_outdoor/stalactite-a`
to `-c` and `fg_outdoor/rind-drape` hanging from the top edge, `fg_outdoor/corner-rock-l` and `-r` at the bottom corners.

```
screen 1          screen 2          screen 3
.^^......^^....   ...............   ...^^..........
...............   ....H....H.....   ..H..H.....F....
...............   ..o.|....|.o...   ..|..|....F.*..
.*...o.O.o..*..   ..O.|.H..|.O.*.   ..|..|.H.=====>
==UUUUUUUUUUU==   ==UUU|...|UUU===   ===|..|...=====
```

| Sprites | |
|---|---|
| craters and holes | `terrain/pit-m`, `terrain/crater-l`, `terrain/crater-lip`, `terrain/crater-cap-r`, `terrain/hole-s`, `terrain/hole-m`, `terrain/hole-l`, `terrain/hole-oval`, `terrain/hole-drip`, `terrain/hole-rind-lip`, `terrain/cheese-wall`, `terrain/tall-wall`, `terrain/wall-cap` |
| ground | `terrain/swiss-ledge`, `terrain/swiss-block`, `terrain/swiss-block-rind`, `terrain/swiss-edge-l`, `terrain/swiss-edge-r`, `terrain/swiss-edge-r-2`, `terrain/milk-stone`, `terrain/cheese-wedge` |
| rocks | `terrain/boulder-s`, `terrain/boulder-m`, `terrain/boulder-l`, `terrain/stalagmite-a`, `terrain/stalagmite-b`, `terrain/stalactite-a`, `terrain/stalactite-b`, `terrain/stalactite-c`, `terrain/milk-spire`, `terrain/rind-arch`, `terrain/crystals` |
| bubbles | as zone A, plus the large bubble chains |
| pickups | `milk/crumb`, `milk/wedge`, `milk/cube`, `terrain/crumbs` |

## Zone C. The Dry Lake (2 screens: the curd ferry)

**Story.** The lake is too wide to cross. A big **curd** slides across a film of whey from one dock to the other, wobbling like a slow boat. This is the picture of the chapter.
**What happens.** Pip rides the **curd** (P5). It squashes when he lands, tilts if he stands at the edge, and only moves while a **half-built fan** (two blades of four) gusts every
second beat; a lever switches the fan's direction. He jumps off at the docks. Cheese crumbs hang over the gaps (the optional line), and a **cheese wheel** on the far dock is ballast
for a second trip. **Photo (optional):** the curd with its sail. Teaches: wait, ride, jump at the right moment.
**Background** `outdoor/sky`, `outdoor/far-mountains`, `outdoor/middle-plain` (the station very small in the distance: this is where it first grows clear). **Foreground** `fg_outdoor/bubble-a`,
`fg_outdoor/bubble-b`, `fg_outdoor/bubble-group` drifting low across the screen (they pass in front of the curd), `fg_outdoor/milk-fog`.

```
screen 1                            screen 2
...............                     ...............
...............                     ...............
..........*..*.                     ...*.....*....
.P.>-----~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~>.
==|T|====~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~=|T|==
 (dock)  the curd: it goes from the left dock to the right dock and back  (dock)
```

| Sprites | |
|---|---|
| the curd | `milk/curd`, `milk/curd-squash`, `milk/curd-stretch`, `milk/curd-tilt-l`, `milk/curd-tilt-r`, `milk/curd-sail`, `milk/curd-small`, `milk/curd-chunk` |
| track and docks | `milk/whey-film`, `milk/dock-post`, `terrain/whey-puddle` |
| the fan | `station/half-fan`, `station/lever-up`, `station/lever-down` |
| ballast and pickups | `milk/wheel-l`, `milk/wheel-s`, `milk/crumb` |
| scenery | `terrain/mirror-patch`, `terrain/crack-a`, `terrain/skin-curl-a` |

## Zone D. The Pipeline (3 screens: valves, a slide, and a box)

**Story.** On the far shore the great pipe begins: it runs from the station to the horizon on tall legs, and from here on Pip walks along it and through it. This is where the
unfinished tech shows: a pipe that ends in mid-air, a wheel with no hub.
**What happens.** The **valves** (P6): three wheels (one, two and three paws) and a gauge; the builders' notice gives the order as a riddle. The **pipe slide** (P7): the old pipes are still
full of thick milk, Pip slides through them like a water slide, levers pick the branch at the tees, the hiccup shoves him in bursts. The **box** (P8): a heavy door and a plate too heavy for Pip;
Miss Clou will not step on a plate but cannot resist a box ("if I fits, I sits"), so Pip pushes the box with her in it onto the plate. **Photo (optional):** Miss Clou in the box.
**Background** `outdoor/middle-plain` (the pipeline in the distance runs to this very pipe), `outdoor/near-cliffs`. **Foreground** `fg_outdoor/pipe-across`, `fg_outdoor/pipe-up-a`, `fg_outdoor/pipe-up-b`,
`fg_outdoor/corner-pipes-l` and `-r`, `fg_outdoor/cables`, `fg_outdoor/pipe-end-drip` hanging from the top.

```
screen 1          screen 2          screen 3
...............   .....[==]......   ...............
..............V   ....[=||=]....   .....L....D.....
.P.>[==========   ..[==|  |==]..   ..[==]..B..|....
===[|  VVV  |==   =[|  slide  |]=   ===[=====]D=>.
===[|  gauge |==   ==|===========   ======plate===
```

| Sprites | |
|---|---|
| pipes | `station/pipe-s`, `station/pipe-m`, `station/pipe-l`, `station/pipe-up-s`, `station/pipe-up-l`, `station/elbow-ne`, `station/elbow-nw`, `station/elbow-se`, `station/elbow-sw`, `station/tee`, `station/cross`, `station/window-pipe`, `station/open-end`, `station/unfinished` |
| the main pipeline (to walk on) | `station/main-l`, `station/main-m`, `station/main-up`, `station/main-down`, `station/main-tee`, `station/main-end`, `station/main-support`, `station/main-ladder` |
| valves and controls | `station/wheel-red`, `station/wheel-blue`, `station/wheel-yellow`, `station/lever-up`, `station/lever-down`, `station/gauge-low`, `station/gauge-ok`, `station/gauge-broken`, `station/switchbox`, `station/hiccup-lamp` |
| the box scene | `milk/box-open`, `milk/box-closed`, `milk/cat-bed`, `station/plate-up`, `station/plate-down`, `station/door-shut`, `station/door-open`, `station/button-off`, `station/button-on` |
| the notice | `station/notice-board`, `milk/note`, `milk/closed`, `milk/pump-this-way`, `milk/mind-the-holes` |
| lights and small things | `station/ceiling-lamp`, `station/work-light`, `station/siren`, `station/hazard-stripes`, `station/hazard-sign`, `station/cables-a`, `station/cables-b`, `station/cone`, `milk/survey-drone` (a landed drone to wake) |

## Zone E. Pump No. 1 (3 screens: inside, four map pieces, curing the hiccup)

**Story.** The unfinished station: half the wall painted, half bare primer; one pump bolted on and humming, three still in scaffolding, and in the middle the **main pump, No. 4**, hiccuping on the beat.
The plaque and a faded photo of the first pumping day are on the way: a cat and a mouse side by side, cutting the ribbon. Miss Clou goes quiet.
**What happens.** The **four torn pieces of the pipe map** (P9), each guarded by one of the chapter's mechanics (a bubble chain, the matching holes, the tank drained by the valves, the curd's far dock) are put
together at the **drafting table**: the map becomes a scrapbook page. Then **curing the hiccup** (P10): four intake valves on four levels of the main pump's scaffold, each closed within one pulse; the
pump gives one long sigh, the bubbles settle, the beat drops from the music. The **pump housing** is loose now: Pip bolts it on the rocket as a fuel tank. Outside, one new bubble rises.
**Photos:** the plaque and the faded photo; the assembled map; (optional) the new bubble.
**Background** `station/back-wall` (opaque, 0.2) and `station/deep-hall` (0.5). **Foreground** `fg_station/beam-a`, `fg_station/beam-b`, `fg_station/pipe-bundle`, `fg_station/cables-a`, `fg_station/cables-b`, `fg_station/chain`,
`fg_station/railing`, `fg_station/machine-l`, `fg_station/machine-r`, `fg_station/steam-a` (fades near Pip).

```
screen 1          screen 2          screen 3
.[=====]........   ...$$$$$$$$$....   ....F...........
.|.map1.|..L....   ..$$$ pump $$$..   ..V......V..V...
.|......|.[==]..   .[=]$$ No.4 $$.   ..[=]..[===]=[==]
P>D.....|......>   ==|===table==|=   ===scaffold=====>
=====tank=======   =====|valve|====   ======sigh======
```

| Sprites | |
|---|---|
| the pump | `station/main-pump`, `station/piston-1`, `station/piston-2`, `station/piston-3`, `station/tank-full`, `station/tank-half`, `station/tank-empty` (the three canisters; the story's pump housing was not drawn separately), `station/silo`, `station/bellows`, `station/bellows-flat` |
| the map | `station/pipe-map`, `station/map-piece-1`, `station/map-piece-3`, `station/map-piece-4` (piece 2 is missing: redraw), `station/drafting-table`, `station/control-desk` |
| the history | `station/plaque`, `station/photo`, `station/filing-cabinet`, `station/stopped-clock` |
| doors and walkways | `station/door-shut`, `station/door-open`, `station/shutter-shut`, `station/shutter-open`, `station/hatch`, `station/vent`, `station/ladder`, `station/catwalk`, `station/stairs`, `station/porthole`, `station/entrance`, `station/scaffold` |
| valves | `station/wheel-red`, `station/wheel-blue`, `station/wheel-yellow`, `station/gauge-low`, `station/gauge-ok`, `station/hiccup-lamp`, `station/siren` |
| tools and the alternative cures | `station/wrench`, `station/big-wrench`, `station/oil-can`, `station/toolbox`, `station/hose-coil`, `station/spare-wheel`, `station/gasket`, `station/cork`, `station/plunger`, `station/red-yarn`, `milk/ladle`, `milk/funnel`, `milk/churn`, `milk/bucket` |
| leftovers of the builders | `milk/wheelbarrow`, `milk/short-ladder`, `milk/hard-hat`, `milk/mug`, `milk/broom`, `milk/tarp-pile`, `milk/paint-can`, `milk/cat-nap` |

## Where each background and foreground layer is used

| Layer | A | B | C | D | E |
|---|---|---|---|---|---|
| `outdoor/sky` | yes | yes | yes | yes | (the porthole) |
| `outdoor/far-mountains` | yes | yes | yes | yes | |
| `outdoor/middle-plain` | yes | | yes | yes | |
| `outdoor/near-cliffs` | | yes | | yes | |
| `station/back-wall` | | | | | yes |
| `station/deep-hall` | | | | | yes |
| `fg_outdoor/*` | crust, mould, mist | pillars, stalactites, corner rocks | bubbles, fog | pipes, cables | |
| `fg_station/*` | | | | | beams, pipes, cables, machines, steam |

## Technical notes for building it

- **The beat.** One pulse about every 3 seconds drives everything (the bubbles swell on the beat and pop on the next, the fan gusts every second beat, the pipe slide boosts, the lamps pulse). The engine has `Beat` and
  `setBeatPulse`; the bubbles and the hiccup lamp can use `emit` (glowing sprite pixels). Music: a slow bass pulse that the pump keeps; it drops out when the hiccup is cured.
- **The mirror.** The glossy crust shows the sky upside down: the sky layer drawn mirrored on the cells of a glossy material (the `sky` hook). That is photo 1.
- **Bubbles** are a `bouncy` material whose solidity follows the beat, with the `squash` frame when landed on. **Thin crust** is a material that cracks (`crack-a`..) and gives way after a short time.
- **Foreground pieces** are drawn in the front pass (`drawFront`) and fade where Pip is behind them; some hide crumbs.
- **The curd** is a moving platform (the Proving Ground's `FERRY` is the model) with frames chosen by what stands on it (rest, squash, stretch, tilt).
- **Sprites** are cut at their original pixels (4 x 4 picture pixels to a game pixel, a little soft); before they go into the game they are put on the true grid and the master palette
  (`tools/snap.mjs`, the art pipeline), as Pip's were.
