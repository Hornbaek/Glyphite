# Proving Ground: notes

A test level, not a finished game: one strip of ground with a station for every platformer feature of the engine, left to right. It is
unlisted (`"listed": false` in game.json), so it is not on the public landing page; open it from the game list when signed in.
Read `CLAUDE.md`, then this file; the engine side is `engine/API.md` ("Characters", "Moving platforms", "Entities and projectiles", "World tools",
"Input and actions", "Camera", "HUD kit ... and the standard shell").

## The files

| File | What is in it |
|---|---|
| `game.json` | title, controls, **actions** (keys, gamepad, touch), tunables (gravity, run speed, jump height, coyote time, jump buffer, wall jump) |
| `world.js` | the materials (every flag: `hazard`, `grip`, `conveyor`, `bouncy`, `climbable`, `oneWay`, and `liquid` for the water), the pixel art (hero frames, slime, coin, torch, flag), **the level as a text map** (`levelRows()`, `LEGEND`, `HINTS`) and the moving parts (`FERRY`, `LIFT`, `LOW_G`) |
| `play.js` | the hero and slimes as entities with a `Character`, coins, flags (checkpoints), the goal, pebbles and bombs (projectiles), digging (`carve`), hurting and dying, saving, `newLevel()` (loadTileMap, platforms, gravity zone, camera rig) |
| `look.js` | **the look (engine plan E1 to E8)**: two backdrop layers of hills, the grass in the front pass, the torches' glowing flames (in `world.js`), and `applyLook()`, which the seven look tunables call (below) |
| `main.js` | the HUD (hints from triggers), the shell, the sky, `provingCheck()`, `Pixelite.run` |
| `tests/check.mjs` | **the level can be finished** (Node, no browser, about a minute): the engine's `reachSearch` plays the hero's controller; moving platforms are put in as bridges and stairs, the dirt wall as dug |
| `tests/mechanics.py` | each station in a real page: walking, jump height, coin, ladder, catwalk, ice, belt, spring, spikes, ferry, lift, low gravity, stomp, pebble, bomb, dig, the pool (falling in, treading water, diving, every coin, the water's look and light, a way out), checkpoint + save, goal, reload, rebinding, gamepad, replay |

## The stations (tile columns of the 132 x 24 map)

| Cols | Station | Engine feature |
|---|---|---|
| 0-30 | walking, coins, a catwalk (jump up through it, down drops), a ladder to a high ledge | `Character` coyote time and jump buffer, `oneWay`, `climbable` in the back wall |
| 31-53 | ice, two conveyor belts | `grip`, `conveyor` |
| 54-70 | a spring and a spike pit | `bouncy`, `hazard`, hit feedback, respawn |
| 71-91 | a ferry over spikes (or swing over the beam above it with the hook: E), a lift to a high ledge, checkpoint flags | `addPlatform` (carried by whole cells, slimes ride them too), `Grapple` |
| 92-107 | a low-gravity room with a ledge only a floating jump reaches, slimes, a brick tower | `addGravityZone`, entities with `fsm`, `fireProjectile`, `explode` + structures falling |
| 108-127 | **a pool**: a basin four tiles deep with water three deep (its surface a tile below the ground), four coins on the bottom and floating in it, steps up the far side, a checkpoint | `liquid` (`WATER`), `Character` swimming (`swimming`, `submerged`, `splashed`), the light dimming with depth, `loadTileMap` entries with a material and an entity (`C`) |
| 128-131 | a dirt wall to dig and the goal flag | `carve`, `loadTileMap` triggers, `screenResult` |

Also on show: **rewind** (hold R: `Rewind`, the last 8 seconds, with the game's numbers kept through `Rewind.keep`), a **ghost** of your best run replayed beside you (`GhostRecorder`, `spawnGhost`, kept with `Pixelite.save`), the **camera rig** (dead zone, look-ahead, bounds), **actions** with gamepad (A jump, X pebble, B bomb, Y dig) and touch buttons made
from them, the **shell** (title, pause menu, rebinding), **settings** and **saves** (the run continues at its checkpoint after a reload;
"NEW GAME" in the pause menu erases it), seeded **record/replay**, **tunables** that act live, and `Pixelite.run({ detail: { levels: [2] } })`.

## The look (engine 0.18.0)

Always there: hills behind the level (`addBackdrop`, two layers, painted by `look.js`: the far one lighter and slower), grass on the plain rock of the ground in the **front pass** (`drawFront`: the hero walks behind it,
it leans with the wind), the torches' flames as an **emit** layer (their own colour at any hour, a little light of their own), the mouse wheel and a pinch for **zoom** (`zoom: { min: .5, max: 3 }`).
Tunables, all `live` and all off by default so the level plays and looks as it always did (change them in the web editor, or `TUNE.x = v; applyLook()` in a test):

| Tunable | What it does |
|---|---|
| `daylight` (0 / 1) | `setTimeOfDay` drives the sun, the shadows, the sky gradient, the stars and the ambient light; the old painted daytime sky then paints only its clouds, as bright as the hour; the torches burn brighter at night |
| `hour` (0 to 24) | the clock's start (and what moving it in the editor sets); 6 is sunrise, 18 sunset |
| `dayRate` (hours a second) | the engine runs the clock by itself (`rate`) |
| `weather` (0 / 1 / 2) | none, rain (cools, splashes, ends in the pool), snow (piles up as `SNOW` cells: they are in the hero's way) |
| `wind` (-30 to 30) | blows the weather, smoke and dust, and leans the grass |
| `fog` (0 to 1) | `setFog`, a ground mist, thicker over the hills and the sky |
| `look` (0 / 1 / 2) | normal / four greens with a dither (`setPost` palette) / a CRT (scanlines and a strong vignette) |

`tests/check.mjs` and `tests/mechanics.py` run with these off. The pool check in `mechanics.py` finds the first water cell of its column (the surface is a row higher while the water sloshes after the hero has swum about).

## Commands

```sh
node tools/pixelite.mjs build proving
node games/proving/tests/check.mjs               # can it be finished? (Node, about a minute)
python3 games/proving/tests/mechanics.py         # every station, in a page
python3 tests/smoke.py proving
```
(On Windows without Playwright's own Chromium: `python tools/with_chrome.py games/proving/tests/mechanics.py`.)

## Known and next

- The level check cannot ride platforms: they are solid bridges and stairs there. Their timing is checked by `mechanics.py`.
- Spring flights are tuned to the pit (8 tiles): change the pit, the spring or `bounceMin` together, then run `check.mjs`.
- The pool: the reach search swims it (holding jump and a direction already swims to the steps; it never needs the hop out, which `mechanics.py` checks by hand). The steps up the far side keep that so:
  make the exit a hop higher than the water and the search will no longer find it. The coins sit on a tile with water (`C` = water and a coin), or the sim would have to fill their tiles. The goal and the
  dirt wall are 20 columns further right than before the pool (`mechanics.py`'s `tp(128, 18)` and `tp(131, 18)`).
- No sound design beyond the engine's blips (a splash is a noise burst).
