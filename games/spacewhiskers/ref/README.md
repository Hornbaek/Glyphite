# Space Whiskers: reference art

The owner's sheets, untouched, and every drawing cut from them at its original pixels (`frames/`). Made by `tools/art.py`, which also
writes `ref.json` (the site's ART page reads it). Boxes are x0, y0, x1, y1 on the sheet.

## SNES sprites: the mouse, side view (idle, walking, running, sliding, crouching, jumping, wall sliding)

`pip.png`, 1088 x 608, from the owner (an image model). Its pixel grid sets the scale of the whole game: one art pixel of this sheet is one game pixel (about 2.86 picture pixels; Pip stands about 49 game pixels tall).

![pip.png](pip.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![pip idle](frames/pip_idle.png) | pip idle | 25, 184, 142, 325 | Pip idle: snapped to the game grid in art/ (the animations) |
| ![pip walk1](frames/pip_walk1.png) | pip walk1 | 181, 186, 285, 327 | Pip walking, frame 1 of 4: snapped to the game grid in art/ (the animations) |
| ![pip walk2](frames/pip_walk2.png) | pip walk2 | 285, 186, 385, 326 | Pip walking, frame 2 of 4: snapped to the game grid in art/ (the animations) |
| ![pip walk3](frames/pip_walk3.png) | pip walk3 | 389, 185, 493, 326 | Pip walking, frame 3 of 4: snapped to the game grid in art/ (the animations) |
| ![pip walk4](frames/pip_walk4.png) | pip walk4 | 493, 184, 597, 325 | Pip walking, frame 4 of 4: snapped to the game grid in art/ (the animations) |
| ![pip run1](frames/pip_run1.png) | pip run1 | 620, 190, 747, 322 | Pip running, frame 1 of 4: snapped to the game grid in art/ (the animations) |
| ![pip run2](frames/pip_run2.png) | pip run2 | 733, 189, 852, 325 | Pip running, frame 2 of 4: snapped to the game grid in art/ (the animations) |
| ![pip run3](frames/pip_run3.png) | pip run3 | 846, 190, 957, 323 | Pip running, frame 3 of 4: snapped to the game grid in art/ (the animations) |
| ![pip run4](frames/pip_run4.png) | pip run4 | 943, 190, 1064, 325 | Pip running, frame 4 of 4: snapped to the game grid in art/ (the animations) |
| ![pip slide](frames/pip_slide.png) | pip slide | 110, 460, 272, 553 | Pip sliding: snapped to the game grid in art/ (the animations) |
| ![pip slide dust](frames/pip_slide_dust.png) | pip slide dust | 38, 505, 107, 553 | Pip sliding: the dust behind him: snapped to the game grid in art/ (the animations) |
| ![pip crouch](frames/pip_crouch.png) | pip crouch | 345, 448, 476, 554 | Pip crouching: snapped to the game grid in art/ (the animations) |
| ![pip jump](frames/pip_jump.png) | pip jump | 571, 397, 699, 542 | Pip jumping: snapped to the game grid in art/ (the animations) |
| ![pip wall slide](frames/pip_wall_slide.png) | pip wall slide | 930, 392, 1031, 551 | Pip wall sliding (the wall left out): snapped to the game grid in art/ (the animations) |

## Level inspiration: the Whiskerworks shipyard with the SS Mewoh-1

`levelinspiration.png`, 1088 x 608, from the owner (an image model) Used for: the look of a level: platforms, scaffolding, signs, sleeping cats, cheese (not cut yet).

![levelinspiration.png](levelinspiration.png)

## Level props: platforms, girders, pipes, machines, crates, signs, cats and ship parts

`levelinspirationprops.png`, 3840 x 2160, from the owner (an image model) Used for: props for the levels, on a green ground (not cut yet).

![levelinspirationprops.png](levelinspirationprops.png)

## Cover: Pip, the cat, the Holy Cow and MEGA-MJAU's fortress (title art still reads "Star Whiskers")

`StarWhiskers-theholycow_cover.png`, 1088 x 608, from the owner (an image model) Used for: the cover and title screen; the look of the cast.

![StarWhiskers-theholycow_cover.png](StarWhiskers-theholycow_cover.png)

## Bubbling Moon props 1: ground and platforms (glossy, thin and matte crust, floating chunks, Swiss ledges), craters and holes, rocks, plants, decals

`bubblingmoon_terrain.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). 7 rows, cut into 69 sprites (tools/cut_sheets.py). Missing: "crater cap L" (row 3 has 6 of 7); "swiss edge R" was drawn twice (the second is "swiss edge R 2"); two labels are garbled ("hole oval", "wall cap"). The paw prints came out pink-purple, so the key left only fragments of them. (A first take, made at medium quality with a looser style block, was softer and noisier and is not kept.) Used for: the level's ground, platforms, pits and holes (not cut yet).

![bubblingmoon_terrain.png](bubblingmoon_terrain.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![terrain glossy crust](frames/bubblingmoon_terrain_glossy-crust.png) | terrain glossy crust | 50, 111, 458, 182 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain thin crust (cracks)](frames/bubblingmoon_terrain_thin-crust-cracks.png) | terrain thin crust (cracks) | 511, 111, 928, 186 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain matte crust (safe)](frames/bubblingmoon_terrain_matte-crust-safe.png) | terrain matte crust (safe) | 981, 103, 1371, 183 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain crust with skin](frames/bubblingmoon_terrain_crust-with-skin.png) | terrain crust with skin | 1426, 74, 1774, 184 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain floating chunk L](frames/bubblingmoon_terrain_floating-chunk-l.png) | terrain floating chunk L | 1862, 63, 2152, 184 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain floating chunk M](frames/bubblingmoon_terrain_floating-chunk-m.png) | terrain floating chunk M | 2272, 89, 2498, 184 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain floating chunk S](frames/bubblingmoon_terrain_floating-chunk-s.png) | terrain floating chunk S | 2630, 103, 2843, 184 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain swiss ledge](frames/bubblingmoon_terrain_swiss-ledge.png) | terrain swiss ledge | 2952, 74, 3330, 184 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain cheese wedge](frames/bubblingmoon_terrain_cheese-wedge.png) | terrain cheese wedge | 3457, 47, 3729, 182 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 1: not in a game yet |
| ![terrain crust block](frames/bubblingmoon_terrain_crust-block.png) | terrain crust block | 73, 349, 279, 537 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain crust block (crack)](frames/bubblingmoon_terrain_crust-block-crack.png) | terrain crust block (crack) | 401, 351, 616, 538 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain crust corner L](frames/bubblingmoon_terrain_crust-corner-l.png) | terrain crust corner L | 749, 347, 954, 537 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain crust corner R](frames/bubblingmoon_terrain_crust-corner-r.png) | terrain crust corner R | 1157, 347, 1361, 536 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain swiss block](frames/bubblingmoon_terrain_swiss-block.png) | terrain swiss block | 1495, 347, 1698, 536 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain swiss block (rind)](frames/bubblingmoon_terrain_swiss-block-rind.png) | terrain swiss block (rind) | 1833, 345, 2039, 536 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain swiss edge L](frames/bubblingmoon_terrain_swiss-edge-l.png) | terrain swiss edge L | 2180, 347, 2371, 536 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain swiss edge R](frames/bubblingmoon_terrain_swiss-edge-r.png) | terrain swiss edge R | 2473, 347, 2664, 536 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain swiss edge R 2](frames/bubblingmoon_terrain_swiss-edge-r-2.png) | terrain swiss edge R 2 | 2778, 347, 2967, 536 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain milk stone](frames/bubblingmoon_terrain_milk-stone.png) | terrain milk stone | 3066, 346, 3248, 537 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain slope up](frames/bubblingmoon_terrain_slope-up.png) | terrain slope up | 3329, 345, 3527, 519 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain slope down](frames/bubblingmoon_terrain_slope-down.png) | terrain slope down | 3610, 345, 3798, 519 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 2: not in a game yet |
| ![terrain pit S](frames/bubblingmoon_terrain_pit-s.png) | terrain pit S | 69, 704, 341, 854 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 3: not in a game yet |
| ![terrain pit M](frames/bubblingmoon_terrain_pit-m.png) | terrain pit M | 450, 698, 836, 861 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 3: not in a game yet |
| ![terrain crater L](frames/bubblingmoon_terrain_crater-l.png) | terrain crater L | 934, 675, 1464, 865 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 3: not in a game yet |
| ![terrain crater lip](frames/bubblingmoon_terrain_crater-lip.png) | terrain crater lip | 1569, 651, 2032, 865 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 3: not in a game yet |
| ![terrain crater cap R](frames/bubblingmoon_terrain_crater-cap-r.png) | terrain crater cap R | 2139, 675, 2629, 861 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 3: not in a game yet |
| ![terrain pit floor](frames/bubblingmoon_terrain_pit-floor.png) | terrain pit floor | 2734, 676, 3226, 861 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 3: not in a game yet |
| ![terrain hole S](frames/bubblingmoon_terrain_hole-s.png) | terrain hole S | 79, 1031, 231, 1172 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain hole M](frames/bubblingmoon_terrain_hole-m.png) | terrain hole M | 417, 1017, 640, 1196 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain hole L](frames/bubblingmoon_terrain_hole-l.png) | terrain hole L | 828, 988, 1126, 1209 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain hole oval](frames/bubblingmoon_terrain_hole-oval.png) | terrain hole oval | 1325, 1029, 1572, 1172 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain hole (drip)](frames/bubblingmoon_terrain_hole-drip.png) | terrain hole (drip) | 1776, 1029, 2031, 1209 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain hole (rind lip)](frames/bubblingmoon_terrain_hole-rind-lip.png) | terrain hole (rind lip) | 2222, 1014, 2518, 1209 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain cheese wall](frames/bubblingmoon_terrain_cheese-wall.png) | terrain cheese wall | 2717, 966, 2994, 1210 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain tall wall](frames/bubblingmoon_terrain_tall-wall.png) | terrain tall wall | 3176, 950, 3363, 1210 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain wall cap](frames/bubblingmoon_terrain_wall-cap.png) | terrain wall cap | 3521, 980, 3774, 1209 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 4: not in a game yet |
| ![terrain boulder S](frames/bubblingmoon_terrain_boulder-s.png) | terrain boulder S | 59, 1338, 324, 1507 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain boulder M](frames/bubblingmoon_terrain_boulder-m.png) | terrain boulder M | 397, 1327, 668, 1505 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain boulder L](frames/bubblingmoon_terrain_boulder-l.png) | terrain boulder L | 741, 1306, 1030, 1504 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain stalagmite A](frames/bubblingmoon_terrain_stalagmite-a.png) | terrain stalagmite A | 1133, 1312, 1373, 1508 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain stalagmite B](frames/bubblingmoon_terrain_stalagmite-b.png) | terrain stalagmite B | 1477, 1306, 1751, 1508 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain stalactite A](frames/bubblingmoon_terrain_stalactite-a.png) | terrain stalactite A | 1869, 1320, 2053, 1504 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain stalactite B](frames/bubblingmoon_terrain_stalactite-b.png) | terrain stalactite B | 2178, 1312, 2400, 1508 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain stalactite C](frames/bubblingmoon_terrain_stalactite-c.png) | terrain stalactite C | 2543, 1312, 2737, 1504 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain milk spire](frames/bubblingmoon_terrain_milk-spire.png) | terrain milk spire | 2896, 1306, 3048, 1508 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain rind arch](frames/bubblingmoon_terrain_rind-arch.png) | terrain rind arch | 3165, 1312, 3470, 1504 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain crystals](frames/bubblingmoon_terrain_crystals.png) | terrain crystals | 3565, 1312, 3784, 1504 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 5: not in a game yet |
| ![terrain mould A](frames/bubblingmoon_terrain_mould-a.png) | terrain mould A | 60, 1660, 288, 1782 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain mould B](frames/bubblingmoon_terrain_mould-b.png) | terrain mould B | 371, 1641, 614, 1785 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain mould C](frames/bubblingmoon_terrain_mould-c.png) | terrain mould C | 679, 1687, 934, 1780 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain dry moss A](frames/bubblingmoon_terrain_dry-moss-a.png) | terrain dry moss A | 1021, 1641, 1233, 1780 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain dry moss B](frames/bubblingmoon_terrain_dry-moss-b.png) | terrain dry moss B | 1333, 1658, 1596, 1782 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain skin curl A](frames/bubblingmoon_terrain_skin-curl-a.png) | terrain skin curl A | 1696, 1671, 1934, 1780 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain skin curl B](frames/bubblingmoon_terrain_skin-curl-b.png) | terrain skin curl B | 2046, 1660, 2294, 1783 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain buried wheel](frames/bubblingmoon_terrain_buried-wheel.png) | terrain buried wheel | 2399, 1660, 2677, 1783 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain crumbs](frames/bubblingmoon_terrain_crumbs.png) | terrain crumbs | 2784, 1657, 3003, 1782 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain pebbles](frames/bubblingmoon_terrain_pebbles.png) | terrain pebbles | 3128, 1671, 3346, 1773 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain bone-white shell](frames/bubblingmoon_terrain_bone-white-shell.png) | terrain bone-white shell | 3524, 1614, 3759, 1783 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 6: not in a game yet |
| ![terrain crack A](frames/bubblingmoon_terrain_crack-a.png) | terrain crack A | 51, 1919, 335, 2034 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain crack B](frames/bubblingmoon_terrain_crack-b.png) | terrain crack B | 404, 1929, 684, 2039 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain crack C](frames/bubblingmoon_terrain_crack-c.png) | terrain crack C | 758, 1921, 1037, 2025 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain crack D](frames/bubblingmoon_terrain_crack-d.png) | terrain crack D | 1110, 1929, 1350, 2034 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain paws A](frames/bubblingmoon_terrain_paws-a.png) | terrain paws A | 1448, 1913, 1665, 2040 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain paws B](frames/bubblingmoon_terrain_paws-b.png) | terrain paws B | 1769, 1913, 1988, 2046 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain paws C](frames/bubblingmoon_terrain_paws-c.png) | terrain paws C | 2089, 1928, 2321, 2026 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain milk splat](frames/bubblingmoon_terrain_milk-splat.png) | terrain milk splat | 2399, 1898, 2699, 2054 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain mirror patch](frames/bubblingmoon_terrain_mirror-patch.png) | terrain mirror patch | 2761, 1899, 3108, 2047 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain dust](frames/bubblingmoon_terrain_dust.png) | terrain dust | 3168, 1943, 3407, 2047 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |
| ![terrain whey puddle](frames/bubblingmoon_terrain_whey-puddle.png) | terrain whey puddle | 3469, 1943, 3787, 2047 | Bubbling Moon terrain (ground, platforms, craters, holes, rocks, decals), row 7: not in a game yet |

## Bubbling Moon props 2: milk bubbles (every state of the pop), the curd boat, milk things, pickups and movables, signs, the builders' leftovers

`bubblingmoon_milk.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). 6 rows, every item there, cut into 70 sprites (tools/cut_sheets.py). The curds have a rosy tint in their shading; a few tiny gaps (rope fence, ladder) still keep pink specks. One label reads "nug" for "mug". Used for: the bubble platforms, the curd, cheese pickups, the pushable wheels, the box and the cat bed, signs (not cut yet).

![bubblingmoon_milk.png](bubblingmoon_milk.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![milk bud](frames/bubblingmoon_milk_bud.png) | milk bud | 58, 137, 264, 276 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk small](frames/bubblingmoon_milk_small.png) | milk small | 380, 160, 498, 277 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk medium](frames/bubblingmoon_milk_medium.png) | milk medium | 629, 109, 805, 277 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk large](frames/bubblingmoon_milk_large.png) | milk large | 906, 81, 1113, 277 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk squash](frames/bubblingmoon_milk_squash.png) | milk squash | 1191, 160, 1452, 269 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk pop 1](frames/bubblingmoon_milk_pop-1.png) | milk pop 1 | 1521, 81, 1776, 277 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk pop 2](frames/bubblingmoon_milk_pop-2.png) | milk pop 2 | 1846, 96, 2086, 274 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk pop 3](frames/bubblingmoon_milk_pop-3.png) | milk pop 3 | 2154, 96, 2397, 269 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk puddle](frames/bubblingmoon_milk_puddle.png) | milk puddle | 2467, 185, 2717, 269 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk crack and ooze](frames/bubblingmoon_milk_crack-and-ooze.png) | milk crack and ooze | 2784, 144, 3123, 273 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk cluster](frames/bubblingmoon_milk_cluster.png) | milk cluster | 3228, 96, 3450, 277 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk bubble with crumb](frames/bubblingmoon_milk_bubble-with-crumb.png) | milk bubble with crumb | 3586, 109, 3765, 277 | Bubbling Moon milk and movable props, row 1: not in a game yet |
| ![milk curd](frames/bubblingmoon_milk_curd.png) | milk curd | 86, 451, 380, 662 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd squash](frames/bubblingmoon_milk_curd-squash.png) | milk curd squash | 462, 527, 790, 661 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd stretch](frames/bubblingmoon_milk_curd-stretch.png) | milk curd stretch | 895, 408, 1125, 662 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd tilt L](frames/bubblingmoon_milk_curd-tilt-l.png) | milk curd tilt L | 1237, 458, 1521, 661 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd tilt R](frames/bubblingmoon_milk_curd-tilt-r.png) | milk curd tilt R | 1617, 458, 1885, 661 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd sail](frames/bubblingmoon_milk_curd-sail.png) | milk curd sail | 1981, 392, 2263, 662 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd small](frames/bubblingmoon_milk_curd-small.png) | milk curd small | 2365, 554, 2583, 661 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk dock post](frames/bubblingmoon_milk_dock-post.png) | milk dock post | 2689, 458, 2896, 662 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk whey film](frames/bubblingmoon_milk_whey-film.png) | milk whey film | 2992, 580, 3487, 661 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk curd chunk](frames/bubblingmoon_milk_curd-chunk.png) | milk curd chunk | 3583, 547, 3749, 662 | Bubbling Moon milk and movable props, row 2: not in a game yet |
| ![milk churn](frames/bubblingmoon_milk_churn.png) | milk churn | 95, 794, 272, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk churn dented](frames/bubblingmoon_milk_churn-dented.png) | milk churn dented | 426, 794, 610, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk bottle full](frames/bubblingmoon_milk_bottle-full.png) | milk bottle full | 786, 787, 926, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk bottle empty](frames/bubblingmoon_milk_bottle-empty.png) | milk bottle empty | 1109, 787, 1247, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk bottle crate](frames/bubblingmoon_milk_bottle-crate.png) | milk bottle crate | 1400, 822, 1715, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk bucket](frames/bubblingmoon_milk_bucket.png) | milk bucket | 1823, 818, 2035, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk ladle](frames/bubblingmoon_milk_ladle.png) | milk ladle | 2142, 770, 2355, 1063 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk funnel](frames/bubblingmoon_milk_funnel.png) | milk funnel | 2460, 823, 2679, 1062 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk drip 1](frames/bubblingmoon_milk_drip-1.png) | milk drip 1 | 2803, 794, 2983, 1015 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk drip 2](frames/bubblingmoon_milk_drip-2.png) | milk drip 2 | 3056, 794, 3236, 1030 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk drip 3](frames/bubblingmoon_milk_drip-3.png) | milk drip 3 | 3310, 794, 3502, 1062 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk pour](frames/bubblingmoon_milk_pour.png) | milk pour | 3610, 794, 3767, 1062 | Bubbling Moon milk and movable props, row 3: not in a game yet |
| ![milk crumb](frames/bubblingmoon_milk_crumb.png) | milk crumb | 69, 1284, 177, 1356 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk wedge](frames/bubblingmoon_milk_wedge.png) | milk wedge | 246, 1234, 432, 1363 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk cube](frames/bubblingmoon_milk_cube.png) | milk cube | 501, 1246, 670, 1368 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk wheel S](frames/bubblingmoon_milk_wheel-s.png) | milk wheel S | 739, 1251, 939, 1368 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk wheel L](frames/bubblingmoon_milk_wheel-l.png) | milk wheel L | 1008, 1175, 1281, 1375 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk crate](frames/bubblingmoon_milk_crate.png) | milk crate | 1353, 1200, 1586, 1373 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk box open](frames/bubblingmoon_milk_box-open.png) | milk box open | 1658, 1183, 1927, 1375 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk box closed](frames/bubblingmoon_milk_box-closed.png) | milk box closed | 2008, 1186, 2246, 1376 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk cat bed](frames/bubblingmoon_milk_cat-bed.png) | milk cat bed | 2312, 1227, 2557, 1375 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk yarn](frames/bubblingmoon_milk_yarn.png) | milk yarn | 2618, 1222, 2789, 1376 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk fish bone](frames/bubblingmoon_milk_fish-bone.png) | milk fish bone | 2845, 1244, 3043, 1368 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk toy mouse](frames/bubblingmoon_milk_toy-mouse.png) | milk toy mouse | 3098, 1235, 3373, 1368 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk tin can](frames/bubblingmoon_milk_tin-can.png) | milk tin can | 3441, 1211, 3567, 1375 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk sack](frames/bubblingmoon_milk_sack.png) | milk sack | 3630, 1192, 3784, 1375 | Bubbling Moon milk and movable props, row 4: not in a game yet |
| ![milk thin crust](frames/bubblingmoon_milk_thin-crust.png) | milk thin crust | 58, 1473, 266, 1732 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk arrow right](frames/bubblingmoon_milk_arrow-right.png) | milk arrow right | 339, 1503, 524, 1732 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk arrow down](frames/bubblingmoon_milk_arrow-down.png) | milk arrow down | 617, 1488, 764, 1732 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk welcome](frames/bubblingmoon_milk_welcome.png) | milk welcome | 883, 1466, 1219, 1731 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk survey flag](frames/bubblingmoon_milk_survey-flag.png) | milk survey flag | 1327, 1472, 1513, 1719 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk rope fence](frames/bubblingmoon_milk_rope-fence.png) | milk rope fence | 1591, 1518, 1875, 1719 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk pump this way](frames/bubblingmoon_milk_pump-this-way.png) | milk pump this way | 1958, 1476, 2186, 1726 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk mind the holes](frames/bubblingmoon_milk_mind-the-holes.png) | milk mind the holes | 2273, 1488, 2461, 1719 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk closed](frames/bubblingmoon_milk_closed.png) | milk closed | 2545, 1466, 2850, 1719 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk lamp post](frames/bubblingmoon_milk_lamp-post.png) | milk lamp post | 2946, 1466, 3089, 1732 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk survey tripod](frames/bubblingmoon_milk_survey-tripod.png) | milk survey tripod | 3222, 1466, 3450, 1725 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk survey drone](frames/bubblingmoon_milk_survey-drone.png) | milk survey drone | 3553, 1520, 3781, 1698 | Bubbling Moon milk and movable props, row 5: not in a game yet |
| ![milk wheelbarrow](frames/bubblingmoon_milk_wheelbarrow.png) | milk wheelbarrow | 58, 1850, 439, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk short ladder](frames/bubblingmoon_milk_short-ladder.png) | milk short ladder | 573, 1823, 756, 2063 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk toolbox](frames/bubblingmoon_milk_toolbox.png) | milk toolbox | 927, 1854, 1218, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk hard hat](frames/bubblingmoon_milk_hard-hat.png) | milk hard hat | 1318, 1854, 1569, 2063 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk mug](frames/bubblingmoon_milk_mug.png) | milk mug | 1689, 1893, 1875, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk note](frames/bubblingmoon_milk_note.png) | milk note | 2016, 1822, 2227, 2056 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk broom](frames/bubblingmoon_milk_broom.png) | milk broom | 2353, 1822, 2507, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk tarp pile](frames/bubblingmoon_milk_tarp-pile.png) | milk tarp pile | 2592, 1849, 3077, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk paint can](frames/bubblingmoon_milk_paint-can.png) | milk paint can | 3170, 1822, 3338, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |
| ![milk cat nap](frames/bubblingmoon_milk_cat-nap.png) | milk cat nap | 3471, 1842, 3768, 2064 | Bubbling Moon milk and movable props, row 6: not in a game yet |

## Bubbling Moon props 3: the pumping station: pipes, the main pipeline, valves and controls, pumps and tanks, doors, the inside, lights, tools

`bubblingmoon_station.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). 8 rows, cut into 90 sprites (tools/cut_sheets.py). Missing: "map piece 2" (three of the four pieces are there) and the separate "pump housing" (the story's fuel tank: the three "tank" canisters are the nearest thing). The model moved "wrench", "big wrench" and "oil can" up to the lights row. The piston caps and the tanks' sight glass are tinted pink; the ladders keep pink specks between the rungs. Used for: the pumping station and its puzzles: valve wheels, levers, plates, gauges, pumps and tanks, the pump housing, the pipe map and its torn pieces, the plaque and the old photo (not cut yet).

![bubblingmoon_station.png](bubblingmoon_station.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![station pipe S](frames/bubblingmoon_station_pipe-s.png) | station pipe S | 61, 71, 244, 158 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station pipe M](frames/bubblingmoon_station_pipe-m.png) | station pipe M | 304, 70, 534, 158 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station pipe L](frames/bubblingmoon_station_pipe-l.png) | station pipe L | 583, 69, 924, 158 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station pipe up S](frames/bubblingmoon_station_pipe-up-s.png) | station pipe up S | 1053, 44, 1143, 198 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station pipe up L](frames/bubblingmoon_station_pipe-up-l.png) | station pipe up L | 1281, 44, 1371, 199 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station elbow NE](frames/bubblingmoon_station_elbow-ne.png) | station elbow NE | 1493, 62, 1639, 194 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station elbow NW](frames/bubblingmoon_station_elbow-nw.png) | station elbow NW | 1727, 61, 1878, 193 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station elbow SE](frames/bubblingmoon_station_elbow-se.png) | station elbow SE | 1960, 61, 2104, 194 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station elbow SW](frames/bubblingmoon_station_elbow-sw.png) | station elbow SW | 2202, 61, 2349, 194 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station tee](frames/bubblingmoon_station_tee.png) | station tee | 2416, 67, 2614, 194 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station cross](frames/bubblingmoon_station_cross.png) | station cross | 2697, 44, 2875, 195 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station window pipe](frames/bubblingmoon_station_window-pipe.png) | station window pipe | 2974, 64, 3286, 176 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station open end](frames/bubblingmoon_station_open-end.png) | station open end | 3393, 61, 3473, 177 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station unfinished](frames/bubblingmoon_station_unfinished.png) | station unfinished | 3576, 65, 3791, 170 | Bubbling Moon pumping-station props, row 1: not in a game yet |
| ![station main L](frames/bubblingmoon_station_main-l.png) | station main L | 61, 319, 585, 469 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main M](frames/bubblingmoon_station_main-m.png) | station main M | 704, 319, 1110, 469 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main up](frames/bubblingmoon_station_main-up.png) | station main up | 1192, 319, 1504, 510 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main down](frames/bubblingmoon_station_main-down.png) | station main down | 1574, 319, 1846, 509 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main tee](frames/bubblingmoon_station_main-tee.png) | station main tee | 1918, 267, 2274, 486 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main end](frames/bubblingmoon_station_main-end.png) | station main end | 2371, 303, 2767, 517 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main support](frames/bubblingmoon_station_main-support.png) | station main support | 2889, 268, 3346, 517 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station main ladder](frames/bubblingmoon_station_main-ladder.png) | station main ladder | 3566, 267, 3718, 523 | Bubbling Moon pumping-station props, row 2: not in a game yet |
| ![station wheel red](frames/bubblingmoon_station_wheel-red.png) | station wheel red | 46, 604, 242, 777 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station wheel blue](frames/bubblingmoon_station_wheel-blue.png) | station wheel blue | 304, 604, 495, 777 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station wheel yellow](frames/bubblingmoon_station_wheel-yellow.png) | station wheel yellow | 559, 603, 803, 777 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station lever up](frames/bubblingmoon_station_lever-up.png) | station lever up | 899, 587, 1061, 777 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station lever down](frames/bubblingmoon_station_lever-down.png) | station lever down | 1142, 649, 1316, 765 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station button off](frames/bubblingmoon_station_button-off.png) | station button off | 1399, 680, 1589, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station button on](frames/bubblingmoon_station_button-on.png) | station button on | 1656, 680, 1845, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station plate up](frames/bubblingmoon_station_plate-up.png) | station plate up | 1913, 680, 2160, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station plate down](frames/bubblingmoon_station_plate-down.png) | station plate down | 2208, 680, 2458, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station switchbox](frames/bubblingmoon_station_switchbox.png) | station switchbox | 2552, 635, 2717, 777 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station gauge low](frames/bubblingmoon_station_gauge-low.png) | station gauge low | 2799, 620, 2967, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station gauge ok](frames/bubblingmoon_station_gauge-ok.png) | station gauge ok | 3059, 620, 3229, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station gauge broken](frames/bubblingmoon_station_gauge-broken.png) | station gauge broken | 3322, 620, 3494, 783 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station hiccup lamp](frames/bubblingmoon_station_hiccup-lamp.png) | station hiccup lamp | 3621, 624, 3790, 784 | Bubbling Moon pumping-station props, row 3: not in a game yet |
| ![station main pump](frames/bubblingmoon_station_main-pump.png) | station main pump | 46, 860, 741, 1152 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station tank full](frames/bubblingmoon_station_tank-full.png) | station tank full | 874, 874, 1064, 1141 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station tank half](frames/bubblingmoon_station_tank-half.png) | station tank half | 1140, 874, 1325, 1140 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station tank empty](frames/bubblingmoon_station_tank-empty.png) | station tank empty | 1393, 874, 1573, 1140 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station silo](frames/bubblingmoon_station_silo.png) | station silo | 1685, 874, 1841, 1140 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station piston 1](frames/bubblingmoon_station_piston-1.png) | station piston 1 | 1966, 883, 2103, 1140 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station piston 2](frames/bubblingmoon_station_piston-2.png) | station piston 2 | 2231, 874, 2362, 1140 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station piston 3](frames/bubblingmoon_station_piston-3.png) | station piston 3 | 2489, 874, 2621, 1140 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station bellows](frames/bubblingmoon_station_bellows.png) | station bellows | 2768, 893, 2945, 1138 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station bellows flat](frames/bubblingmoon_station_bellows-flat.png) | station bellows flat | 3023, 946, 3285, 1135 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station half fan](frames/bubblingmoon_station_half-fan.png) | station half fan | 3489, 874, 3804, 1146 | Bubbling Moon pumping-station props, row 4: not in a game yet |
| ![station door shut](frames/bubblingmoon_station_door-shut.png) | station door shut | 46, 1249, 275, 1457 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station door open](frames/bubblingmoon_station_door-open.png) | station door open | 361, 1249, 585, 1456 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station shutter shut](frames/bubblingmoon_station_shutter-shut.png) | station shutter shut | 679, 1254, 929, 1457 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station shutter open](frames/bubblingmoon_station_shutter-open.png) | station shutter open | 1037, 1254, 1281, 1456 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station hatch](frames/bubblingmoon_station_hatch.png) | station hatch | 1377, 1262, 1589, 1452 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station vent](frames/bubblingmoon_station_vent.png) | station vent | 1678, 1271, 1876, 1444 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station ladder](frames/bubblingmoon_station_ladder.png) | station ladder | 1997, 1231, 2081, 1459 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station catwalk](frames/bubblingmoon_station_catwalk.png) | station catwalk | 2183, 1279, 2578, 1452 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station stairs](frames/bubblingmoon_station_stairs.png) | station stairs | 2654, 1246, 2914, 1460 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station porthole](frames/bubblingmoon_station_porthole.png) | station porthole | 2971, 1248, 3171, 1452 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station entrance](frames/bubblingmoon_station_entrance.png) | station entrance | 3250, 1230, 3487, 1468 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station scaffold](frames/bubblingmoon_station_scaffold.png) | station scaffold | 3575, 1230, 3804, 1468 | Bubbling Moon pumping-station props, row 5: not in a game yet |
| ![station control desk](frames/bubblingmoon_station_control-desk.png) | station control desk | 46, 1535, 364, 1709 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station drafting table](frames/bubblingmoon_station_drafting-table.png) | station drafting table | 422, 1545, 713, 1706 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station notice board](frames/bubblingmoon_station_notice-board.png) | station notice board | 802, 1534, 1064, 1705 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station pipe map](frames/bubblingmoon_station_pipe-map.png) | station pipe map | 1160, 1534, 1574, 1699 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station map piece 1](frames/bubblingmoon_station_map-piece-1.png) | station map piece 1 | 1688, 1529, 1859, 1703 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station map piece 3](frames/bubblingmoon_station_map-piece-3.png) | station map piece 3 | 1904, 1529, 2075, 1704 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station map piece 4](frames/bubblingmoon_station_map-piece-4.png) | station map piece 4 | 2120, 1529, 2298, 1702 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station plaque](frames/bubblingmoon_station_plaque.png) | station plaque | 2495, 1529, 2742, 1705 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station photo](frames/bubblingmoon_station_photo.png) | station photo | 2879, 1534, 3139, 1703 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station filing cabinet](frames/bubblingmoon_station_filing-cabinet.png) | station filing cabinet | 3282, 1529, 3418, 1704 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station stopped clock](frames/bubblingmoon_station_stopped-clock.png) | station stopped clock | 3591, 1529, 3777, 1703 | Bubbling Moon pumping-station props, row 6: not in a game yet |
| ![station ceiling lamp](frames/bubblingmoon_station_ceiling-lamp.png) | station ceiling lamp | 61, 1776, 246, 1934 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station work light](frames/bubblingmoon_station_work-light.png) | station work light | 398, 1782, 509, 1938 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station siren](frames/bubblingmoon_station_siren.png) | station siren | 686, 1792, 819, 1912 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station hazard stripes](frames/bubblingmoon_station_hazard-stripes.png) | station hazard stripes | 945, 1792, 1172, 1920 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station hazard sign](frames/bubblingmoon_station_hazard-sign.png) | station hazard sign | 1297, 1775, 1470, 1935 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station cables A](frames/bubblingmoon_station_cables-a.png) | station cables A | 1593, 1791, 1812, 1917 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station cables B](frames/bubblingmoon_station_cables-b.png) | station cables B | 1845, 1791, 2068, 1918 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station steam vent](frames/bubblingmoon_station_steam-vent.png) | station steam vent | 2225, 1782, 2330, 1923 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station cone](frames/bubblingmoon_station_cone.png) | station cone | 2525, 1781, 2659, 1935 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station bolts](frames/bubblingmoon_station_bolts.png) | station bolts | 2813, 1797, 3024, 1934 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station wrench](frames/bubblingmoon_station_wrench.png) | station wrench | 3159, 1790, 3324, 1935 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station big wrench](frames/bubblingmoon_station_big-wrench.png) | station big wrench | 3383, 1782, 3557, 1935 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station oil can](frames/bubblingmoon_station_oil-can.png) | station oil can | 3617, 1798, 3790, 1935 | Bubbling Moon pumping-station props, row 7: not in a game yet |
| ![station toolbox](frames/bubblingmoon_station_toolbox.png) | station toolbox | 61, 1992, 319, 2116 | Bubbling Moon pumping-station props, row 8: not in a game yet |
| ![station hose coil](frames/bubblingmoon_station_hose-coil.png) | station hose coil | 502, 2002, 742, 2115 | Bubbling Moon pumping-station props, row 8: not in a game yet |
| ![station spare wheel](frames/bubblingmoon_station_spare-wheel.png) | station spare wheel | 920, 1985, 1084, 2116 | Bubbling Moon pumping-station props, row 8: not in a game yet |
| ![station gasket](frames/bubblingmoon_station_gasket.png) | station gasket | 1296, 1988, 1472, 2115 | Bubbling Moon pumping-station props, row 8: not in a game yet |
| ![station cork](frames/bubblingmoon_station_cork.png) | station cork | 1690, 1993, 1815, 2103 | Bubbling Moon pumping-station props, row 8: not in a game yet |
| ![station plunger](frames/bubblingmoon_station_plunger.png) | station plunger | 2050, 1980, 2170, 2115 | Bubbling Moon pumping-station props, row 8: not in a game yet |
| ![station red yarn](frames/bubblingmoon_station_red-yarn.png) | station red yarn | 2393, 1992, 2593, 2114 | Bubbling Moon pumping-station props, row 8: not in a game yet |

## Bubbling Moon backgrounds, outdoors 1: the sky with the broken Milky Way (top panel) and the far cheese mountains (bottom panel)

`bubblingmoon_bg_outdoor_1.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). Two panels of 3840 x 1080 picture pixels (960 x 270 game pixels). Cut as sky.png and far-mountains.png (keyed) by `cut_sheets.py --panels <folder>`, which are not stored twice in the repository. The sky's left and right edges almost meet (difference 1.5 of 255); the mountains' do not (27). Used for: the slowest background layers outdoors: each panel is two screens wide (3840 x 1080), the sky is opaque, the mountains stand on magenta (not cut yet).

![bubblingmoon_bg_outdoor_1.png](bubblingmoon_bg_outdoor_1.png)

## Bubbling Moon backgrounds, outdoors 2: the middle plain with the far pumping station (top panel) and the near cliffs and pipes (bottom panel)

`bubblingmoon_bg_outdoor_2.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). Two panels of 3840 x 1080 picture pixels: middle-plain.png and near-cliffs.png (`cut_sheets.py --panels <folder>`). The seams do not meet yet (edge difference 16 and 37 of 255), so they need a blend to repeat. Used for: the middle and near layers outdoors, on magenta (not cut yet).

![bubblingmoon_bg_outdoor_2.png](bubblingmoon_bg_outdoor_2.png)

## Bubbling Moon backgrounds, inside the pumping station: the half-painted back wall (top panel) and the deep machine hall (bottom panel)

`bubblingmoon_bg_station.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). Two panels of 3840 x 1080 picture pixels: back-wall.png and deep-hall.png (`cut_sheets.py --panels <folder>`). The seams do not meet yet (edge difference 35 and 45 of 255), so they need a blend to repeat. Used for: the interior layers of the pumping station: the wall is opaque, the deep hall stands on magenta (not cut yet).

![bubblingmoon_bg_station.png](bubblingmoon_bg_station.png)

## Bubbling Moon foregrounds, outdoors: hanging stalactites, corner rocks, pillars, big low shapes, mist

`bubblingmoon_fg_outdoor.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). 5 rows, all 31 pieces, cut into 31 sprites (tools/cut_sheets.py). The mist banks are pale lavender-pink and are partly eaten by the magenta key: they need a redraw. Used for: the front pass outdoors: pieces drawn in front of Pip, which fade where he walks behind them (not cut yet).

![bubblingmoon_fg_outdoor.png](bubblingmoon_fg_outdoor.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![fg_outdoor stalactite A](frames/bubblingmoon_fg_outdoor_stalactite-a.png) | fg_outdoor stalactite A | 155, 49, 454, 429 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor stalactite B](frames/bubblingmoon_fg_outdoor_stalactite-b.png) | fg_outdoor stalactite B | 645, 49, 840, 422 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor stalactite C](frames/bubblingmoon_fg_outdoor_stalactite-c.png) | fg_outdoor stalactite C | 982, 49, 1441, 422 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor rind drape](frames/bubblingmoon_fg_outdoor_rind-drape.png) | fg_outdoor rind drape | 1534, 49, 1904, 429 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor pipe end drip](frames/bubblingmoon_fg_outdoor_pipe-end-drip.png) | fg_outdoor pipe end drip | 1994, 49, 2184, 414 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor cables](frames/bubblingmoon_fg_outdoor_cables.png) | fg_outdoor cables | 2280, 48, 2726, 414 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor hole rock top](frames/bubblingmoon_fg_outdoor_hole-rock-top.png) | fg_outdoor hole rock top | 2814, 48, 3426, 429 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor lamp](frames/bubblingmoon_fg_outdoor_lamp.png) | fg_outdoor lamp | 3522, 49, 3762, 415 | Bubbling Moon foreground, outdoors, row 1: not in a game yet |
| ![fg_outdoor corner rock L](frames/bubblingmoon_fg_outdoor_corner-rock-l.png) | fg_outdoor corner rock L | 58, 535, 590, 838 | Bubbling Moon foreground, outdoors, row 2: not in a game yet |
| ![fg_outdoor corner rock R](frames/bubblingmoon_fg_outdoor_corner-rock-r.png) | fg_outdoor corner rock R | 679, 535, 1197, 838 | Bubbling Moon foreground, outdoors, row 2: not in a game yet |
| ![fg_outdoor corner crust L](frames/bubblingmoon_fg_outdoor_corner-crust-l.png) | fg_outdoor corner crust L | 1277, 588, 1872, 838 | Bubbling Moon foreground, outdoors, row 2: not in a game yet |
| ![fg_outdoor corner crust R](frames/bubblingmoon_fg_outdoor_corner-crust-r.png) | fg_outdoor corner crust R | 1952, 603, 2533, 838 | Bubbling Moon foreground, outdoors, row 2: not in a game yet |
| ![fg_outdoor corner pipes L](frames/bubblingmoon_fg_outdoor_corner-pipes-l.png) | fg_outdoor corner pipes L | 2614, 535, 3166, 838 | Bubbling Moon foreground, outdoors, row 2: not in a game yet |
| ![fg_outdoor corner pipes R](frames/bubblingmoon_fg_outdoor_corner-pipes-r.png) | fg_outdoor corner pipes R | 3250, 535, 3794, 838 | Bubbling Moon foreground, outdoors, row 2: not in a game yet |
| ![fg_outdoor pillar A](frames/bubblingmoon_fg_outdoor_pillar-a.png) | fg_outdoor pillar A | 153, 931, 501, 1400 | Bubbling Moon foreground, outdoors, row 3: not in a game yet |
| ![fg_outdoor pillar B](frames/bubblingmoon_fg_outdoor_pillar-b.png) | fg_outdoor pillar B | 808, 931, 1184, 1400 | Bubbling Moon foreground, outdoors, row 3: not in a game yet |
| ![fg_outdoor pipe up A](frames/bubblingmoon_fg_outdoor_pipe-up-a.png) | fg_outdoor pipe up A | 1524, 931, 1743, 1400 | Bubbling Moon foreground, outdoors, row 3: not in a game yet |
| ![fg_outdoor pipe up B](frames/bubblingmoon_fg_outdoor_pipe-up-b.png) | fg_outdoor pipe up B | 2078, 931, 2368, 1400 | Bubbling Moon foreground, outdoors, row 3: not in a game yet |
| ![fg_outdoor pylon](frames/bubblingmoon_fg_outdoor_pylon.png) | fg_outdoor pylon | 2737, 931, 3149, 1400 | Bubbling Moon foreground, outdoors, row 3: not in a game yet |
| ![fg_outdoor dead tree](frames/bubblingmoon_fg_outdoor_dead-tree.png) | fg_outdoor dead tree | 3305, 931, 3729, 1400 | Bubbling Moon foreground, outdoors, row 3: not in a game yet |
| ![fg_outdoor pipe across](frames/bubblingmoon_fg_outdoor_pipe-across.png) | fg_outdoor pipe across | 50, 1495, 1073, 1742 | Bubbling Moon foreground, outdoors, row 4: not in a game yet |
| ![fg_outdoor bubble A](frames/bubblingmoon_fg_outdoor_bubble-a.png) | fg_outdoor bubble A | 1169, 1510, 1425, 1742 | Bubbling Moon foreground, outdoors, row 4: not in a game yet |
| ![fg_outdoor bubble B](frames/bubblingmoon_fg_outdoor_bubble-b.png) | fg_outdoor bubble B | 1551, 1569, 1735, 1742 | Bubbling Moon foreground, outdoors, row 4: not in a game yet |
| ![fg_outdoor bubble group](frames/bubblingmoon_fg_outdoor_bubble-group.png) | fg_outdoor bubble group | 1853, 1495, 2335, 1727 | Bubbling Moon foreground, outdoors, row 4: not in a game yet |
| ![fg_outdoor mould bank](frames/bubblingmoon_fg_outdoor_mould-bank.png) | fg_outdoor mould bank | 2376, 1564, 3082, 1742 | Bubbling Moon foreground, outdoors, row 4: not in a game yet |
| ![fg_outdoor crack front](frames/bubblingmoon_fg_outdoor_crack-front.png) | fg_outdoor crack front | 3157, 1564, 3794, 1742 | Bubbling Moon foreground, outdoors, row 4: not in a game yet |
| ![fg_outdoor mist A](frames/bubblingmoon_fg_outdoor_mist-a.png) | fg_outdoor mist A | 50, 1875, 1024, 2051 | Bubbling Moon foreground, outdoors, row 5: not in a game yet |
| ![fg_outdoor mist B](frames/bubblingmoon_fg_outdoor_mist-b.png) | fg_outdoor mist B | 1114, 1894, 1772, 2035 | Bubbling Moon foreground, outdoors, row 5: not in a game yet |
| ![fg_outdoor milk fog](frames/bubblingmoon_fg_outdoor_milk-fog.png) | fg_outdoor milk fog | 1853, 1839, 2534, 2036 | Bubbling Moon foreground, outdoors, row 5: not in a game yet |
| ![fg_outdoor dust drift](frames/bubblingmoon_fg_outdoor_dust-drift.png) | fg_outdoor dust drift | 2624, 1888, 3342, 2035 | Bubbling Moon foreground, outdoors, row 5: not in a game yet |
| ![fg_outdoor cobweb](frames/bubblingmoon_fg_outdoor_cobweb.png) | fg_outdoor cobweb | 3478, 1840, 3795, 2048 | Bubbling Moon foreground, outdoors, row 5: not in a game yet |

## Bubbling Moon foregrounds, inside the pumping station: hanging pipes and cables, machine edges, beams, railings, steam

`bubblingmoon_fg_station.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets.mjs). 5 rows, all 31 pieces, cut into 31 sprites (tools/cut_sheets.py). The steam, the dust beam and the milk haze are pink-tinted and partly eaten by the magenta key: they need a redraw. Used for: the front pass inside the pumping station: close pipes, cables, machine edges, beams, railings, steam (not cut yet).

![bubblingmoon_fg_station.png](bubblingmoon_fg_station.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![fg_station pipe bundle](frames/bubblingmoon_fg_station_pipe-bundle.png) | fg_station pipe bundle | 84, 55, 407, 428 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station cables A](frames/bubblingmoon_fg_station_cables-a.png) | fg_station cables A | 541, 55, 963, 390 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station cables B](frames/bubblingmoon_fg_station_cables-b.png) | fg_station cables B | 1020, 55, 1457, 423 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station chain](frames/bubblingmoon_fg_station_chain.png) | fg_station chain | 1598, 55, 1714, 446 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station lamp dark](frames/bubblingmoon_fg_station_lamp-dark.png) | fg_station lamp dark | 1918, 55, 2181, 401 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station duct](frames/bubblingmoon_fg_station_duct.png) | fg_station duct | 2346, 105, 2754, 331 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station girder](frames/bubblingmoon_fg_station_girder.png) | fg_station girder | 2863, 55, 3418, 301 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station cobweb](frames/bubblingmoon_fg_station_cobweb.png) | fg_station cobweb | 3471, 67, 3762, 390 | Bubbling Moon foreground, inside the station, row 1: not in a game yet |
| ![fg_station machine L](frames/bubblingmoon_fg_station_machine-l.png) | fg_station machine L | 50, 531, 551, 882 | Bubbling Moon foreground, inside the station, row 2: not in a game yet |
| ![fg_station machine R](frames/bubblingmoon_fg_station_machine-r.png) | fg_station machine R | 710, 531, 1181, 882 | Bubbling Moon foreground, inside the station, row 2: not in a game yet |
| ![fg_station tank L](frames/bubblingmoon_fg_station_tank-l.png) | fg_station tank L | 1296, 546, 1858, 882 | Bubbling Moon foreground, inside the station, row 2: not in a game yet |
| ![fg_station tank R](frames/bubblingmoon_fg_station_tank-r.png) | fg_station tank R | 1982, 546, 2558, 882 | Bubbling Moon foreground, inside the station, row 2: not in a game yet |
| ![fg_station crates L](frames/bubblingmoon_fg_station_crates-l.png) | fg_station crates L | 2640, 536, 3128, 882 | Bubbling Moon foreground, inside the station, row 2: not in a game yet |
| ![fg_station crates R](frames/bubblingmoon_fg_station_crates-r.png) | fg_station crates R | 3250, 537, 3798, 882 | Bubbling Moon foreground, inside the station, row 2: not in a game yet |
| ![fg_station beam A](frames/bubblingmoon_fg_station_beam-a.png) | fg_station beam A | 151, 980, 367, 1443 | Bubbling Moon foreground, inside the station, row 3: not in a game yet |
| ![fg_station beam B](frames/bubblingmoon_fg_station_beam-b.png) | fg_station beam B | 720, 980, 970, 1443 | Bubbling Moon foreground, inside the station, row 3: not in a game yet |
| ![fg_station pipe up A](frames/bubblingmoon_fg_station_pipe-up-a.png) | fg_station pipe up A | 1394, 991, 1622, 1442 | Bubbling Moon foreground, inside the station, row 3: not in a game yet |
| ![fg_station pipe up B](frames/bubblingmoon_fg_station_pipe-up-b.png) | fg_station pipe up B | 1989, 1002, 2265, 1443 | Bubbling Moon foreground, inside the station, row 3: not in a game yet |
| ![fg_station scaffold](frames/bubblingmoon_fg_station_scaffold.png) | fg_station scaffold | 2584, 996, 3003, 1443 | Bubbling Moon foreground, inside the station, row 3: not in a game yet |
| ![fg_station cable drum](frames/bubblingmoon_fg_station_cable-drum.png) | fg_station cable drum | 3292, 1008, 3736, 1443 | Bubbling Moon foreground, inside the station, row 3: not in a game yet |
| ![fg_station railing](frames/bubblingmoon_fg_station_railing.png) | fg_station railing | 50, 1545, 654, 1691 | Bubbling Moon foreground, inside the station, row 4: not in a game yet |
| ![fg_station rail corner](frames/bubblingmoon_fg_station_rail-corner.png) | fg_station rail corner | 750, 1525, 1036, 1701 | Bubbling Moon foreground, inside the station, row 4: not in a game yet |
| ![fg_station pipe across](frames/bubblingmoon_fg_station_pipe-across.png) | fg_station pipe across | 1166, 1524, 1972, 1694 | Bubbling Moon foreground, inside the station, row 4: not in a game yet |
| ![fg_station cable trunk](frames/bubblingmoon_fg_station_cable-trunk.png) | fg_station cable trunk | 2052, 1545, 2588, 1701 | Bubbling Moon foreground, inside the station, row 4: not in a game yet |
| ![fg_station hazard ramp](frames/bubblingmoon_fg_station_hazard-ramp.png) | fg_station hazard ramp | 2649, 1536, 3168, 1701 | Bubbling Moon foreground, inside the station, row 4: not in a game yet |
| ![fg_station bucket line](frames/bubblingmoon_fg_station_bucket-line.png) | fg_station bucket line | 3241, 1534, 3790, 1701 | Bubbling Moon foreground, inside the station, row 4: not in a game yet |
| ![fg_station steam A](frames/bubblingmoon_fg_station_steam-a.png) | fg_station steam A | 101, 1843, 625, 2040 | Bubbling Moon foreground, inside the station, row 5: not in a game yet |
| ![fg_station steam B](frames/bubblingmoon_fg_station_steam-b.png) | fg_station steam B | 777, 1844, 1324, 2040 | Bubbling Moon foreground, inside the station, row 5: not in a game yet |
| ![fg_station dust beam](frames/bubblingmoon_fg_station_dust-beam.png) | fg_station dust beam | 1511, 1827, 2048, 2051 | Bubbling Moon foreground, inside the station, row 5: not in a game yet |
| ![fg_station vent grille](frames/bubblingmoon_fg_station_vent-grille.png) | fg_station vent grille | 2239, 1864, 2745, 2052 | Bubbling Moon foreground, inside the station, row 5: not in a game yet |
| ![fg_station milk haze](frames/bubblingmoon_fg_station_milk-haze.png) | fg_station milk haze | 2934, 1864, 3743, 2040 | Bubbling Moon foreground, inside the station, row 5: not in a game yet |

## Bubbling Moon round 2, animation frames A: bubbles, glow, the fan, the curd, the thin crust, the new bubble

`bubblingmoon2_anim_a.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs). Animation frames: the bubble swell (7 of the 8 steps: step 5 was not drawn), crumb bubbles, glows, fan, gust, curd, crust, rising bubble. The large glow has two tiny white ticks under it. Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_anim_a.png](bubblingmoon2_anim_a.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![anim bubble-swell-1](frames/bubblingmoon2_anim_bubble-swell-1.png) | anim bubble-swell-1 | 101, 159, 405, 235 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-swell-2](frames/bubblingmoon2_anim_bubble-swell-2.png) | anim bubble-swell-2 | 573, 126, 873, 235 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-swell-3](frames/bubblingmoon2_anim_bubble-swell-3.png) | anim bubble-swell-3 | 1044, 101, 1347, 234 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-swell-4](frames/bubblingmoon2_anim_bubble-swell-4.png) | anim bubble-swell-4 | 1529, 71, 1833, 234 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-swell-5](frames/bubblingmoon2_anim_bubble-swell-5.png) | anim bubble-swell-5 | 2013, 48, 2324, 234 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-swell-6](frames/bubblingmoon2_anim_bubble-swell-6.png) | anim bubble-swell-6 | 2513, 40, 2833, 236 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-swell-7](frames/bubblingmoon2_anim_bubble-swell-7.png) | anim bubble-swell-7 | 2998, 24, 3339, 236 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 1: not in a game yet |
| ![anim bubble-crumb-1](frames/bubblingmoon2_anim_bubble-crumb-1.png) | anim bubble-crumb-1 | 114, 398, 385, 554 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 2: not in a game yet |
| ![anim bubble-crumb-2](frames/bubblingmoon2_anim_bubble-crumb-2.png) | anim bubble-crumb-2 | 594, 372, 869, 554 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 2: not in a game yet |
| ![anim bubble-crumb-3](frames/bubblingmoon2_anim_bubble-crumb-3.png) | anim bubble-crumb-3 | 1078, 335, 1354, 554 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 2: not in a game yet |
| ![anim bubble-crumb-pop](frames/bubblingmoon2_anim_bubble-crumb-pop.png) | anim bubble-crumb-pop | 1567, 352, 1848, 565 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 2: not in a game yet |
| ![anim bubble-glow-s](frames/bubblingmoon2_anim_bubble-glow-s.png) | anim bubble-glow-s | 184, 690, 347, 847 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 3: not in a game yet |
| ![anim bubble-glow-m](frames/bubblingmoon2_anim_bubble-glow-m.png) | anim bubble-glow-m | 639, 659, 854, 864 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 3: not in a game yet |
| ![anim bubble-glow-l](frames/bubblingmoon2_anim_bubble-glow-l.png) | anim bubble-glow-l | 1092, 632, 1361, 905 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 3: not in a game yet |
| ![anim fan-spin-1](frames/bubblingmoon2_anim_fan-spin-1.png) | anim fan-spin-1 | 140, 951, 404, 1199 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim fan-spin-2](frames/bubblingmoon2_anim_fan-spin-2.png) | anim fan-spin-2 | 639, 951, 903, 1199 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim fan-spin-3](frames/bubblingmoon2_anim_fan-spin-3.png) | anim fan-spin-3 | 1128, 951, 1392, 1199 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim fan-spin-4](frames/bubblingmoon2_anim_fan-spin-4.png) | anim fan-spin-4 | 1610, 951, 1873, 1199 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim gust-1](frames/bubblingmoon2_anim_gust-1.png) | anim gust-1 | 2127, 988, 2454, 1181 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim gust-2](frames/bubblingmoon2_anim_gust-2.png) | anim gust-2 | 2544, 979, 3032, 1180 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim gust-3](frames/bubblingmoon2_anim_gust-3.png) | anim gust-3 | 3116, 1000, 3539, 1180 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 4: not in a game yet |
| ![anim curd-landed-1](frames/bubblingmoon2_anim_curd-landed-1.png) | anim curd-landed-1 | 77, 1356, 497, 1496 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 5: not in a game yet |
| ![anim curd-landed-2](frames/bubblingmoon2_anim_curd-landed-2.png) | anim curd-landed-2 | 640, 1297, 1023, 1496 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 5: not in a game yet |
| ![anim curd-landed-3](frames/bubblingmoon2_anim_curd-landed-3.png) | anim curd-landed-3 | 1199, 1335, 1563, 1496 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 5: not in a game yet |
| ![anim curd-wheel-1](frames/bubblingmoon2_anim_curd-wheel-1.png) | anim curd-wheel-1 | 1715, 1281, 2071, 1496 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 5: not in a game yet |
| ![anim curd-wheel-2](frames/bubblingmoon2_anim_curd-wheel-2.png) | anim curd-wheel-2 | 2312, 1257, 2652, 1496 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 5: not in a game yet |
| ![anim crust-crack-1](frames/bubblingmoon2_anim_crust-crack-1.png) | anim crust-crack-1 | 46, 1641, 607, 1727 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 6: not in a game yet |
| ![anim crust-crack-2](frames/bubblingmoon2_anim_crust-crack-2.png) | anim crust-crack-2 | 710, 1641, 1282, 1727 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 6: not in a game yet |
| ![anim crust-crack-3](frames/bubblingmoon2_anim_crust-crack-3.png) | anim crust-crack-3 | 1355, 1634, 1975, 1729 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 6: not in a game yet |
| ![anim crust-crack-4](frames/bubblingmoon2_anim_crust-crack-4.png) | anim crust-crack-4 | 2040, 1629, 2654, 1727 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 6: not in a game yet |
| ![anim crust-fall-1](frames/bubblingmoon2_anim_crust-fall-1.png) | anim crust-fall-1 | 2866, 1607, 3119, 1727 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 6: not in a game yet |
| ![anim crust-fall-2](frames/bubblingmoon2_anim_crust-fall-2.png) | anim crust-fall-2 | 3373, 1591, 3592, 1728 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 6: not in a game yet |
| ![anim bubble-rise-1](frames/bubblingmoon2_anim_bubble-rise-1.png) | anim bubble-rise-1 | 80, 1967, 424, 2025 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 7: not in a game yet |
| ![anim bubble-rise-2](frames/bubblingmoon2_anim_bubble-rise-2.png) | anim bubble-rise-2 | 590, 1939, 936, 2025 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 7: not in a game yet |
| ![anim bubble-rise-3](frames/bubblingmoon2_anim_bubble-rise-3.png) | anim bubble-rise-3 | 1117, 1894, 1464, 2025 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 7: not in a game yet |
| ![anim bubble-rise-4](frames/bubblingmoon2_anim_bubble-rise-4.png) | anim bubble-rise-4 | 1651, 1852, 2003, 2025 | Bubbling Moon round 2, animation frames A (bubbles, fan, curd, crust), row 7: not in a game yet |

## Bubbling Moon round 2, animation frames B: valves, the geyser, the pump (hiccup, sigh), the housing coming loose

`bubblingmoon2_anim_b.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_anim_b.png](bubblingmoon2_anim_b.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![anim wheel-red-lit](frames/bubblingmoon2_anim_wheel-red-lit.png) | anim wheel-red-lit | 82, 39, 340, 229 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 1: not in a game yet |
| ![anim wheel-blue-lit](frames/bubblingmoon2_anim_wheel-blue-lit.png) | anim wheel-blue-lit | 487, 39, 754, 229 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 1: not in a game yet |
| ![anim wheel-yellow-lit](frames/bubblingmoon2_anim_wheel-yellow-lit.png) | anim wheel-yellow-lit | 896, 39, 1159, 229 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 1: not in a game yet |
| ![anim wheel-red-turn-1](frames/bubblingmoon2_anim_wheel-red-turn-1.png) | anim wheel-red-turn-1 | 79, 327, 341, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-red-turn-2](frames/bubblingmoon2_anim_wheel-red-turn-2.png) | anim wheel-red-turn-2 | 486, 327, 756, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-red-turn-3](frames/bubblingmoon2_anim_wheel-red-turn-3.png) | anim wheel-red-turn-3 | 893, 326, 1161, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-blue-turn-1](frames/bubblingmoon2_anim_wheel-blue-turn-1.png) | anim wheel-blue-turn-1 | 1303, 326, 1576, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-blue-turn-2](frames/bubblingmoon2_anim_wheel-blue-turn-2.png) | anim wheel-blue-turn-2 | 1780, 327, 2062, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-blue-turn-3](frames/bubblingmoon2_anim_wheel-blue-turn-3.png) | anim wheel-blue-turn-3 | 2202, 327, 2478, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-yellow-turn-1](frames/bubblingmoon2_anim_wheel-yellow-turn-1.png) | anim wheel-yellow-turn-1 | 2642, 326, 2923, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-yellow-turn-2](frames/bubblingmoon2_anim_wheel-yellow-turn-2.png) | anim wheel-yellow-turn-2 | 3062, 326, 3341, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim wheel-yellow-turn-3](frames/bubblingmoon2_anim_wheel-yellow-turn-3.png) | anim wheel-yellow-turn-3 | 3481, 327, 3765, 532 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 2: not in a game yet |
| ![anim geyser-1](frames/bubblingmoon2_anim_geyser-1.png) | anim geyser-1 | 168, 745, 323, 947 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim geyser-2](frames/bubblingmoon2_anim_geyser-2.png) | anim geyser-2 | 552, 655, 715, 947 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim geyser-3](frames/bubblingmoon2_anim_geyser-3.png) | anim geyser-3 | 924, 621, 1143, 947 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim geyser-4](frames/bubblingmoon2_anim_geyser-4.png) | anim geyser-4 | 1298, 654, 1564, 947 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim geyser-5](frames/bubblingmoon2_anim_geyser-5.png) | anim geyser-5 | 1730, 678, 1899, 947 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim drain-wheel-1](frames/bubblingmoon2_anim_drain-wheel-1.png) | anim drain-wheel-1 | 2299, 690, 2599, 954 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim drain-wheel-2](frames/bubblingmoon2_anim_drain-wheel-2.png) | anim drain-wheel-2 | 2844, 690, 3145, 954 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim drain-wheel-3](frames/bubblingmoon2_anim_drain-wheel-3.png) | anim drain-wheel-3 | 3390, 690, 3678, 954 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 3: not in a game yet |
| ![anim pump-hiccup-1](frames/bubblingmoon2_anim_pump-hiccup-1.png) | anim pump-hiccup-1 | 66, 1049, 910, 1349 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 4: not in a game yet |
| ![anim pump-hiccup-2](frames/bubblingmoon2_anim_pump-hiccup-2.png) | anim pump-hiccup-2 | 1001, 1043, 1764, 1349 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 4: not in a game yet |
| ![anim pump-hiccup-3](frames/bubblingmoon2_anim_pump-hiccup-3.png) | anim pump-hiccup-3 | 1877, 1060, 2686, 1356 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 4: not in a game yet |
| ![anim pump-off](frames/bubblingmoon2_anim_pump-off.png) | anim pump-off | 2843, 1059, 3622, 1343 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 4: not in a game yet |
| ![anim pump-sigh-1](frames/bubblingmoon2_anim_pump-sigh-1.png) | anim pump-sigh-1 | 180, 1465, 415, 1654 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 5: not in a game yet |
| ![anim pump-sigh-2](frames/bubblingmoon2_anim_pump-sigh-2.png) | anim pump-sigh-2 | 768, 1421, 1278, 1654 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 5: not in a game yet |
| ![anim pump-sigh-3](frames/bubblingmoon2_anim_pump-sigh-3.png) | anim pump-sigh-3 | 1524, 1416, 2100, 1654 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 5: not in a game yet |
| ![anim pump-sigh-4](frames/bubblingmoon2_anim_pump-sigh-4.png) | anim pump-sigh-4 | 2368, 1440, 2821, 1654 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 5: not in a game yet |
| ![anim pump-sigh-5](frames/bubblingmoon2_anim_pump-sigh-5.png) | anim pump-sigh-5 | 3165, 1451, 3510, 1654 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 5: not in a game yet |
| ![anim housing-loose-1](frames/bubblingmoon2_anim_housing-loose-1.png) | anim housing-loose-1 | 120, 1749, 469, 2046 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 6: not in a game yet |
| ![anim housing-loose-2](frames/bubblingmoon2_anim_housing-loose-2.png) | anim housing-loose-2 | 731, 1760, 1112, 2039 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 6: not in a game yet |
| ![anim housing-loose-3](frames/bubblingmoon2_anim_housing-loose-3.png) | anim housing-loose-3 | 1355, 1752, 1749, 2051 | Bubbling Moon round 2, animation frames B (valves, geyser, the pump), row 6: not in a game yet |

## Bubbling Moon round 2 backgrounds, outdoors: the middle plain with the LARGE pumping station (top), the near pipeline legs (bottom)

`bubblingmoon2_bg_outdoor.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_bg_outdoor.png](bubblingmoon2_bg_outdoor.png)

## Bubbling Moon round 2 backgrounds, inside: the arrival hall wall (top), the tank room wall (bottom)

`bubblingmoon2_bg_station_a.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_bg_station_a.png](bubblingmoon2_bg_station_a.png)

## Bubbling Moon round 2 backgrounds, inside: the scaffold hall wall (top), a second deep hall layer (bottom)

`bubblingmoon2_bg_station_b.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_bg_station_b.png](bubblingmoon2_bg_station_b.png)

## Bubbling Moon round 2: Miss Clou, the helmeted cat and its trolley, Pip crawling, Pip's rocket

`bubblingmoon2_characters.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs). The cats, Pip crawling and the rocket. Its first Miss Clou (row 1 and the box, cut as missclou_old) came out as a mouse in a cat suit because Pip's picture was one of the references: kept, not used. missclou.png redraws her without it. Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_characters.png](bubblingmoon2_characters.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![missclou_old stand](frames/bubblingmoon2_missclou_old_stand.png) | missclou_old stand | 334, 64, 696, 487 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 1: not in a game yet |
| ![missclou_old cool](frames/bubblingmoon2_missclou_old_cool.png) | missclou_old cool | 1064, 64, 1411, 487 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 1: not in a game yet |
| ![missclou_old startled](frames/bubblingmoon2_missclou_old_startled.png) | missclou_old startled | 1721, 72, 2182, 487 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 1: not in a game yet |
| ![missclou_old hover-1](frames/bubblingmoon2_missclou_old_hover-1.png) | missclou_old hover-1 | 2496, 25, 2755, 462 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 1: not in a game yet |
| ![missclou_old hover-2](frames/bubblingmoon2_missclou_old_hover-2.png) | missclou_old hover-2 | 3207, 25, 3472, 465 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 1: not in a game yet |
| ![missclou_old box-open-cat](frames/bubblingmoon2_missclou_old_box-open-cat.png) | missclou_old box-open-cat | 73, 634, 600, 975 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![missclou_old box-closed-cat](frames/bubblingmoon2_missclou_old_box-closed-cat.png) | missclou_old box-closed-cat | 733, 656, 1186, 964 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![cat trolley](frames/bubblingmoon2_cat_trolley.png) | cat trolley | 1339, 677, 1777, 970 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![cat helmet-asleep-1](frames/bubblingmoon2_cat_helmet-asleep-1.png) | cat helmet-asleep-1 | 1888, 638, 2347, 970 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![cat helmet-asleep-2](frames/bubblingmoon2_cat_helmet-asleep-2.png) | cat helmet-asleep-2 | 2457, 639, 2926, 970 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![cat helmet](frames/bubblingmoon2_cat_helmet.png) | cat helmet | 3048, 741, 3364, 963 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![cat freed](frames/bubblingmoon2_cat_freed.png) | cat freed | 3483, 611, 3770, 975 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 2: not in a game yet |
| ![pip crawl-1](frames/bubblingmoon2_pip_crawl-1.png) | pip crawl-1 | 120, 1150, 531, 1453 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 3: not in a game yet |
| ![pip crawl-2](frames/bubblingmoon2_pip_crawl-2.png) | pip crawl-2 | 733, 1150, 1145, 1453 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 3: not in a game yet |
| ![pip crawl-3](frames/bubblingmoon2_pip_crawl-3.png) | pip crawl-3 | 1327, 1154, 1771, 1455 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 3: not in a game yet |
| ![pip crawl-4](frames/bubblingmoon2_pip_crawl-4.png) | pip crawl-4 | 1942, 1154, 2374, 1453 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 3: not in a game yet |
| ![pip pop-out-1](frames/bubblingmoon2_pip_pop-out-1.png) | pip pop-out-1 | 2566, 1072, 3134, 1469 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 3: not in a game yet |
| ![pip pop-out-2](frames/bubblingmoon2_pip_pop-out-2.png) | pip pop-out-2 | 3326, 1150, 3730, 1456 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 3: not in a game yet |
| ![ending rocket](frames/bubblingmoon2_ending_rocket.png) | ending rocket | 94, 1641, 790, 1949 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 4: not in a game yet |
| ![ending rocket-tank](frames/bubblingmoon2_ending_rocket-tank.png) | ending rocket-tank | 883, 1642, 1553, 1947 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 4: not in a game yet |
| ![ending bolt-1](frames/bubblingmoon2_ending_bolt-1.png) | ending bolt-1 | 1657, 1642, 2306, 1966 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 4: not in a game yet |
| ![ending bolt-2](frames/bubblingmoon2_ending_bolt-2.png) | ending bolt-2 | 2396, 1641, 3051, 1962 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 4: not in a game yet |
| ![ending bolt-3](frames/bubblingmoon2_ending_bolt-3.png) | ending bolt-3 | 3146, 1641, 3803, 1963 | Bubbling Moon round 2, the cats, Pip crawling, the rocket (its first Miss Clou is kept as missclou_old), row 4: not in a game yet |

## Bubbling Moon round 2, fixes: the known gaps, the pink or damaged items redrawn, white curds

`bubblingmoon2_fixes.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_fixes.png](bubblingmoon2_fixes.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![terrain crater-cap-l](frames/bubblingmoon2_terrain_crater-cap-l.png) | terrain crater-cap-l | 68, 64, 639, 238 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 1: not in a game yet |
| ![terrain crater-cap-r](frames/bubblingmoon2_terrain_crater-cap-r.png) | terrain crater-cap-r | 757, 63, 1326, 238 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 1: not in a game yet |
| ![station map-piece-2](frames/bubblingmoon2_station_map-piece-2.png) | station map-piece-2 | 118, 344, 650, 639 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 2: not in a game yet |
| ![station pump-housing](frames/bubblingmoon2_station_pump-housing.png) | station pump-housing | 869, 314, 1172, 640 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 2: not in a game yet |
| ![station pump-housing-loose](frames/bubblingmoon2_station_pump-housing-loose.png) | station pump-housing-loose | 1486, 280, 1942, 640 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 2: not in a game yet |
| ![station hiccup-lamp-off](frames/bubblingmoon2_station_hiccup-lamp-off.png) | station hiccup-lamp-off | 2114, 344, 2378, 640 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 2: not in a game yet |
| ![station ladder](frames/bubblingmoon2_station_ladder.png) | station ladder | 2682, 276, 2879, 640 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 2: not in a game yet |
| ![station main-ladder](frames/bubblingmoon2_station_main-ladder.png) | station main-ladder | 3300, 276, 3526, 640 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 2: not in a game yet |
| ![milk short-ladder](frames/bubblingmoon2_milk_short-ladder.png) | milk short-ladder | 194, 746, 415, 981 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 3: not in a game yet |
| ![milk rope-fence](frames/bubblingmoon2_milk_rope-fence.png) | milk rope-fence | 652, 768, 1250, 973 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 3: not in a game yet |
| ![terrain paws-a](frames/bubblingmoon2_terrain_paws-a.png) | terrain paws-a | 144, 1093, 478, 1235 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 4: not in a game yet |
| ![terrain paws-b](frames/bubblingmoon2_terrain_paws-b.png) | terrain paws-b | 801, 1093, 1149, 1235 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 4: not in a game yet |
| ![terrain paws-c](frames/bubblingmoon2_terrain_paws-c.png) | terrain paws-c | 1497, 1094, 1720, 1235 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 4: not in a game yet |
| ![fg_outdoor mist-a](frames/bubblingmoon2_fg_outdoor_mist-a.png) | fg_outdoor mist-a | 83, 1328, 870, 1436 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 5: not in a game yet |
| ![fg_outdoor mist-b](frames/bubblingmoon2_fg_outdoor_mist-b.png) | fg_outdoor mist-b | 1069, 1344, 1616, 1436 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 5: not in a game yet |
| ![fg_outdoor milk-fog](frames/bubblingmoon2_fg_outdoor_milk-fog.png) | fg_outdoor milk-fog | 1830, 1282, 2413, 1437 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 5: not in a game yet |
| ![fg_outdoor dust-drift](frames/bubblingmoon2_fg_outdoor_dust-drift.png) | fg_outdoor dust-drift | 2604, 1291, 3363, 1436 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 5: not in a game yet |
| ![fg_station steam-a](frames/bubblingmoon2_fg_station_steam-a.png) | fg_station steam-a | 107, 1544, 643, 1701 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 6: not in a game yet |
| ![fg_station steam-b](frames/bubblingmoon2_fg_station_steam-b.png) | fg_station steam-b | 905, 1501, 1221, 1701 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 6: not in a game yet |
| ![fg_station dust-beam](frames/bubblingmoon2_fg_station_dust-beam.png) | fg_station dust-beam | 1636, 1518, 1989, 1701 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 6: not in a game yet |
| ![fg_station milk-haze](frames/bubblingmoon2_fg_station_milk-haze.png) | fg_station milk-haze | 2245, 1558, 3152, 1701 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 6: not in a game yet |
| ![milk curd-white](frames/bubblingmoon2_milk_curd-white.png) | milk curd-white | 89, 1793, 432, 2021 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-squash-white](frames/bubblingmoon2_milk_curd-squash-white.png) | milk curd-squash-white | 581, 1848, 943, 2018 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-stretch-white](frames/bubblingmoon2_milk_curd-stretch-white.png) | milk curd-stretch-white | 1150, 1766, 1406, 2021 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-tilt-l-white](frames/bubblingmoon2_milk_curd-tilt-l-white.png) | milk curd-tilt-l-white | 1621, 1817, 1905, 2018 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-tilt-r-white](frames/bubblingmoon2_milk_curd-tilt-r-white.png) | milk curd-tilt-r-white | 2102, 1809, 2387, 2018 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-sail-white](frames/bubblingmoon2_milk_curd-sail-white.png) | milk curd-sail-white | 2594, 1737, 2879, 2018 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-small-white](frames/bubblingmoon2_milk_curd-small-white.png) | milk curd-small-white | 3105, 1885, 3295, 2017 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |
| ![milk curd-chunk-white](frames/bubblingmoon2_milk_curd-chunk-white.png) | milk curd-chunk-white | 3536, 1885, 3730, 2017 | Bubbling Moon round 2, fixes (the gaps, the redraws, white curds), row 7: not in a game yet |

## Bubbling Moon round 2: the ground: end caps, pit walls, underground fills, the milk pool

`bubblingmoon2_ground.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_ground.png](bubblingmoon2_ground.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![ground cap-left](frames/bubblingmoon2_ground_cap-left.png) | ground cap-left | 112, 171, 714, 609 | Bubbling Moon round 2, the ground, row 1: not in a game yet |
| ![ground cap-right](frames/bubblingmoon2_ground_cap-right.png) | ground cap-right | 873, 171, 1369, 609 | Bubbling Moon round 2, the ground, row 1: not in a game yet |
| ![ground pit-wall-crust-l](frames/bubblingmoon2_ground_pit-wall-crust-l.png) | ground pit-wall-crust-l | 1559, 102, 1804, 609 | Bubbling Moon round 2, the ground, row 1: not in a game yet |
| ![ground pit-wall-crust-r](frames/bubblingmoon2_ground_pit-wall-crust-r.png) | ground pit-wall-crust-r | 2031, 102, 2277, 609 | Bubbling Moon round 2, the ground, row 1: not in a game yet |
| ![ground pit-wall-cheese-l](frames/bubblingmoon2_ground_pit-wall-cheese-l.png) | ground pit-wall-cheese-l | 2485, 115, 2820, 609 | Bubbling Moon round 2, the ground, row 1: not in a game yet |
| ![ground pit-wall-cheese-r](frames/bubblingmoon2_ground_pit-wall-cheese-r.png) | ground pit-wall-cheese-r | 3401, 115, 3722, 609 | Bubbling Moon round 2, the ground, row 1: not in a game yet |
| ![ground fill-a](frames/bubblingmoon2_ground_fill-a.png) | ground fill-a | 91, 836, 900, 1385 | Bubbling Moon round 2, the ground, row 2: not in a game yet |
| ![ground fill-b](frames/bubblingmoon2_ground_fill-b.png) | ground fill-b | 1060, 836, 1861, 1385 | Bubbling Moon round 2, the ground, row 2: not in a game yet |
| ![ground fill-c](frames/bubblingmoon2_ground_fill-c.png) | ground fill-c | 2017, 836, 2832, 1385 | Bubbling Moon round 2, the ground, row 2: not in a game yet |
| ![ground fill-d](frames/bubblingmoon2_ground_fill-d.png) | ground fill-d | 2987, 836, 3751, 1385 | Bubbling Moon round 2, the ground, row 2: not in a game yet |
| ![ground milk-pool-1](frames/bubblingmoon2_ground_milk-pool-1.png) | ground milk-pool-1 | 133, 1624, 1256, 1799 | Bubbling Moon round 2, the ground, row 3: not in a game yet |
| ![ground milk-pool-2](frames/bubblingmoon2_ground_milk-pool-2.png) | ground milk-pool-2 | 1367, 1609, 2471, 1799 | Bubbling Moon round 2, the ground, row 3: not in a game yet |
| ![ground milk-pool-3](frames/bubblingmoon2_ground_milk-pool-3.png) | ground milk-pool-3 | 2582, 1624, 3708, 1799 | Bubbling Moon round 2, the ground, row 3: not in a game yet |

## Bubbling Moon round 2: the pump hall: floor, ceiling, partition, ladder, door frames, exterior wall, the big entrance

`bubblingmoon2_hall.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_hall.png](bubblingmoon2_hall.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![hall floor-tile](frames/bubblingmoon2_hall_floor-tile.png) | hall floor-tile | 104, 160, 736, 351 | Bubbling Moon round 2, the pump hall, row 1: not in a game yet |
| ![hall floor-end-l](frames/bubblingmoon2_hall_floor-end-l.png) | hall floor-end-l | 865, 159, 1471, 353 | Bubbling Moon round 2, the pump hall, row 1: not in a game yet |
| ![hall floor-end-r](frames/bubblingmoon2_hall_floor-end-r.png) | hall floor-end-r | 1618, 159, 2194, 353 | Bubbling Moon round 2, the pump hall, row 1: not in a game yet |
| ![hall ceiling-girder](frames/bubblingmoon2_hall_ceiling-girder.png) | hall ceiling-girder | 2311, 136, 3024, 363 | Bubbling Moon round 2, the pump hall, row 1: not in a game yet |
| ![hall ceiling-pipes](frames/bubblingmoon2_hall_ceiling-pipes.png) | hall ceiling-pipes | 3127, 133, 3787, 349 | Bubbling Moon round 2, the pump hall, row 1: not in a game yet |
| ![hall wall-partition](frames/bubblingmoon2_hall_wall-partition.png) | hall wall-partition | 167, 583, 671, 1124 | Bubbling Moon round 2, the pump hall, row 2: not in a game yet |
| ![hall wall-partition-top](frames/bubblingmoon2_hall_wall-partition-top.png) | hall wall-partition-top | 938, 665, 1427, 1124 | Bubbling Moon round 2, the pump hall, row 2: not in a game yet |
| ![hall ladder](frames/bubblingmoon2_hall_ladder.png) | hall ladder | 1769, 618, 2051, 1124 | Bubbling Moon round 2, the pump hall, row 2: not in a game yet |
| ![hall door-frame](frames/bubblingmoon2_hall_door-frame.png) | hall door-frame | 2323, 661, 2919, 1124 | Bubbling Moon round 2, the pump hall, row 2: not in a game yet |
| ![hall door-frame-tall](frames/bubblingmoon2_hall_door-frame-tall.png) | hall door-frame-tall | 3146, 560, 3722, 1124 | Bubbling Moon round 2, the pump hall, row 2: not in a game yet |
| ![hall exterior-wall](frames/bubblingmoon2_hall_exterior-wall.png) | hall exterior-wall | 251, 1317, 1686, 1922 | Bubbling Moon round 2, the pump hall, row 3: not in a game yet |
| ![hall entrance-big](frames/bubblingmoon2_hall_entrance-big.png) | hall entrance-big | 1946, 1321, 3044, 1922 | Bubbling Moon round 2, the pump hall, row 3: not in a game yet |

## Bubbling Moon round 2: Miss Clou (a second try, drawn without the picture of Pip)

`bubblingmoon2_missclou.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs). Miss Clou without Pip among the references: pointed ears, white and orange suit, cyan chest gauge, ion boosters, no cape (a text description of the owner's character sheet: the sheet itself was not in the repository). Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_missclou.png](bubblingmoon2_missclou.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![missclou stand](frames/bubblingmoon2_missclou_stand.png) | missclou stand | 94, 145, 741, 1003 | Bubbling Moon round 2, Miss Clou, row 1: not in a game yet |
| ![missclou cool](frames/bubblingmoon2_missclou_cool.png) | missclou cool | 911, 131, 1475, 1003 | Bubbling Moon round 2, Miss Clou, row 1: not in a game yet |
| ![missclou startled](frames/bubblingmoon2_missclou_startled.png) | missclou startled | 1577, 137, 2256, 1004 | Bubbling Moon round 2, Miss Clou, row 1: not in a game yet |
| ![missclou hover-1](frames/bubblingmoon2_missclou_hover-1.png) | missclou hover-1 | 2348, 37, 2939, 975 | Bubbling Moon round 2, Miss Clou, row 1: not in a game yet |
| ![missclou hover-2](frames/bubblingmoon2_missclou_hover-2.png) | missclou hover-2 | 3149, 53, 3717, 1003 | Bubbling Moon round 2, Miss Clou, row 1: not in a game yet |
| ![missclou box-open-cat](frames/bubblingmoon2_missclou_box-open-cat.png) | missclou box-open-cat | 279, 1250, 1198, 1852 | Bubbling Moon round 2, Miss Clou, row 2: not in a game yet |
| ![missclou box-closed-cat](frames/bubblingmoon2_missclou_box-closed-cat.png) | missclou box-closed-cat | 1478, 1257, 2307, 1852 | Bubbling Moon round 2, Miss Clou, row 2: not in a game yet |
| ![missclou box-empty](frames/bubblingmoon2_missclou_box-empty.png) | missclou box-empty | 2675, 1264, 3428, 1852 | Bubbling Moon round 2, Miss Clou, row 2: not in a game yet |

## Bubbling Moon round 2: the scrapbook: polaroid frame, the photos, the camera, the map page, HUD icons

`bubblingmoon2_scrapbook.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs) Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_scrapbook.png](bubblingmoon2_scrapbook.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![scrapbook polaroid-frame](frames/bubblingmoon2_scrapbook_polaroid-frame.png) | scrapbook polaroid-frame | 376, 48, 729, 424 | Bubbling Moon round 2, the scrapbook, row 1: not in a game yet |
| ![scrapbook camera-icon](frames/bubblingmoon2_scrapbook_camera-icon.png) | scrapbook camera-icon | 1098, 63, 1458, 397 | Bubbling Moon round 2, the scrapbook, row 1: not in a game yet |
| ![scrapbook hud-photo-icon](frames/bubblingmoon2_scrapbook_hud-photo-icon.png) | scrapbook hud-photo-icon | 1788, 102, 2066, 397 | Bubbling Moon round 2, the scrapbook, row 1: not in a game yet |
| ![scrapbook hud-map-icon](frames/bubblingmoon2_scrapbook_hud-map-icon.png) | scrapbook hud-map-icon | 2367, 109, 2778, 381 | Bubbling Moon round 2, the scrapbook, row 1: not in a game yet |
| ![scrapbook hud-camera-icon](frames/bubblingmoon2_scrapbook_hud-camera-icon.png) | scrapbook hud-camera-icon | 3130, 124, 3455, 376 | Bubbling Moon round 2, the scrapbook, row 1: not in a game yet |
| ![scrapbook photo-reflection](frames/bubblingmoon2_scrapbook_photo-reflection.png) | scrapbook photo-reflection | 127, 512, 764, 932 | Bubbling Moon round 2, the scrapbook, row 2: not in a game yet |
| ![scrapbook photo-curd-sail](frames/bubblingmoon2_scrapbook_photo-curd-sail.png) | scrapbook photo-curd-sail | 868, 512, 1510, 932 | Bubbling Moon round 2, the scrapbook, row 2: not in a game yet |
| ![scrapbook photo-milkyway-top](frames/bubblingmoon2_scrapbook_photo-milkyway-top.png) | scrapbook photo-milkyway-top | 1614, 512, 2260, 935 | Bubbling Moon round 2, the scrapbook, row 2: not in a game yet |
| ![scrapbook photo-missclou-box](frames/bubblingmoon2_scrapbook_photo-missclou-box.png) | scrapbook photo-missclou-box | 2364, 512, 3004, 935 | Bubbling Moon round 2, the scrapbook, row 2: not in a game yet |
| ![scrapbook photo-plaque](frames/bubblingmoon2_scrapbook_photo-plaque.png) | scrapbook photo-plaque | 3105, 512, 3729, 935 | Bubbling Moon round 2, the scrapbook, row 2: not in a game yet |
| ![scrapbook photo-old-ceremony](frames/bubblingmoon2_scrapbook_photo-old-ceremony.png) | scrapbook photo-old-ceremony | 175, 1036, 862, 1473 | Bubbling Moon round 2, the scrapbook, row 3: not in a game yet |
| ![scrapbook photo-pipe-map](frames/bubblingmoon2_scrapbook_photo-pipe-map.png) | scrapbook photo-pipe-map | 1046, 1048, 1793, 1468 | Bubbling Moon round 2, the scrapbook, row 3: not in a game yet |
| ![scrapbook photo-new-bubble](frames/bubblingmoon2_scrapbook_photo-new-bubble.png) | scrapbook photo-new-bubble | 2024, 1048, 2686, 1468 | Bubbling Moon round 2, the scrapbook, row 3: not in a game yet |
| ![scrapbook photo-blank](frames/bubblingmoon2_scrapbook_photo-blank.png) | scrapbook photo-blank | 2923, 1048, 3653, 1469 | Bubbling Moon round 2, the scrapbook, row 3: not in a game yet |
| ![scrapbook map-page](frames/bubblingmoon2_scrapbook_map-page.png) | scrapbook map-page | 1418, 1556, 2412, 2054 | Bubbling Moon round 2, the scrapbook, row 4: not in a game yet |

## Bubbling Moon round 2: the pipe slide at Pip's size, flow frames, a tall support leg, the giant bubble

`bubblingmoon2_slide.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs). The second take of the slide pieces: straight, end-left, end-right, tee-up, tee-down (clear inside about 52 art pixels), the pipeline leg and the giant bubble. Its shaft, corners and flow frames are cut as pipeslide_take1 (too small); slide2 has the good ones. Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_slide.png](bubblingmoon2_slide.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![pipeslide straight](frames/bubblingmoon2_pipeslide_straight.png) | pipeslide straight | 74, 154, 757, 406 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 1: not in a game yet |
| ![pipeslide end-left](frames/bubblingmoon2_pipeslide_end-left.png) | pipeslide end-left | 942, 147, 1461, 411 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 1: not in a game yet |
| ![pipeslide end-right](frames/bubblingmoon2_pipeslide_end-right.png) | pipeslide end-right | 1607, 147, 2176, 450 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 1: not in a game yet |
| ![pipeslide tee-up](frames/bubblingmoon2_pipeslide_tee-up.png) | pipeslide tee-up | 2366, 42, 2983, 409 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 1: not in a game yet |
| ![pipeslide tee-down](frames/bubblingmoon2_pipeslide_tee-down.png) | pipeslide tee-down | 3146, 148, 3755, 457 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 1: not in a game yet |
| ![pipeslide_take1 shaft](frames/bubblingmoon2_pipeslide_take1_shaft.png) | pipeslide_take1 shaft | 330, 576, 534, 996 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 2: not in a game yet |
| ![pipeslide_take1 corner-up](frames/bubblingmoon2_pipeslide_take1_corner-up.png) | pipeslide_take1 corner-up | 1146, 576, 1625, 969 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 2: not in a game yet |
| ![pipeslide_take1 corner-down](frames/bubblingmoon2_pipeslide_take1_corner-down.png) | pipeslide_take1 corner-down | 2007, 637, 2654, 996 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 2: not in a game yet |
| ![pipeslide_take1 flow-1](frames/bubblingmoon2_pipeslide_take1_flow-1.png) | pipeslide_take1 flow-1 | 55, 1191, 699, 1405 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 3: not in a game yet |
| ![pipeslide_take1 flow-2](frames/bubblingmoon2_pipeslide_take1_flow-2.png) | pipeslide_take1 flow-2 | 772, 1191, 1469, 1405 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 3: not in a game yet |
| ![pipeslide_take1 flow-3](frames/bubblingmoon2_pipeslide_take1_flow-3.png) | pipeslide_take1 flow-3 | 1558, 1191, 2249, 1405 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 3: not in a game yet |
| ![pipeslide_take1 flow-4](frames/bubblingmoon2_pipeslide_take1_flow-4.png) | pipeslide_take1 flow-4 | 2365, 1191, 3078, 1405 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 3: not in a game yet |
| ![station main-support-tall](frames/bubblingmoon2_station_main-support-tall.png) | station main-support-tall | 3231, 996, 3710, 1501 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 3: not in a game yet |
| ![milk bubble-giant](frames/bubblingmoon2_milk_bubble-giant.png) | milk bubble-giant | 110, 1536, 623, 2034 | Bubbling Moon round 2, the pipe slide and the giant bubble, row 4: not in a game yet |

## Bubbling Moon round 2: the slide pieces redrawn to the size of the straight piece (shaft, corners, flow frames)

`bubblingmoon2_slide2.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs). The shaft, the two corners and the four flow frames redrawn to the straight piece's size (clear inside 53-56 art pixels): about 1.2 times the size of the straight piece of slide. Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_slide2.png](bubblingmoon2_slide2.png)

| drawing | name | box | used for |
|---|---|---|---|
| ![pipeslide shaft](frames/bubblingmoon2_pipeslide_shaft.png) | pipeslide shaft | 558, 149, 879, 1043 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 1: not in a game yet |
| ![pipeslide corner-up](frames/bubblingmoon2_pipeslide_corner-up.png) | pipeslide corner-up | 1463, 172, 2283, 954 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 1: not in a game yet |
| ![pipeslide corner-down](frames/bubblingmoon2_pipeslide_corner-down.png) | pipeslide corner-down | 2613, 386, 3346, 1008 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 1: not in a game yet |
| ![pipeslide flow-1](frames/bubblingmoon2_pipeslide_flow-1.png) | pipeslide flow-1 | 72, 1388, 943, 1698 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 2: not in a game yet |
| ![pipeslide flow-2](frames/bubblingmoon2_pipeslide_flow-2.png) | pipeslide flow-2 | 1017, 1387, 1885, 1696 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 2: not in a game yet |
| ![pipeslide flow-3](frames/bubblingmoon2_pipeslide_flow-3.png) | pipeslide flow-3 | 1959, 1387, 2829, 1695 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 2: not in a game yet |
| ![pipeslide flow-4](frames/bubblingmoon2_pipeslide_flow-4.png) | pipeslide flow-4 | 2902, 1387, 3771, 1695 | Bubbling Moon round 2, the slide pieces redrawn to the straight piece's size, row 2: not in a game yet |

## Bubbling Moon round 2: the pipe slide at Pip's size, flow frames, a tall support leg, the giant bubble

`bubblingmoon2_slide_take1.png`, 3840 x 2160, from Claude, through the image API (gpt-image-2.6-flare, high; tools/sheets2.mjs). The first take of the pipe slide: its tubes came out about 52 art pixels clear inside, the flow strips 39 and the shaft 37 wide, too small for Pip. Kept as drawn; only slide (the second take) and slide2 are cut. Used for: what the owner's second list of art still needed asks for (the Godot level).

![bubblingmoon2_slide_take1.png](bubblingmoon2_slide_take1.png)
