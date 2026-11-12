# Proving Ground: notes

A test level, not a finished game: one strip of ground with a station for every platformer feature of the engine, left to right. It is
unlisted (`"listed": false` in game.json), so it is not on the public landing page; open it from the game list when signed in.
Read `CLAUDE.md`, then this file; the engine side is `engine/API.md` ("Characters", "Moving platforms", "Entities and projectiles", "World tools",
"Input and actions", "Camera", "HUD kit ... and the standard shell").

## The files

| File | What is in it |
|---|---|
| `game.json` | title, controls, **actions** (keys, gamepad, touch), tunables (gravity, run speed, jump height, coyote time, jump buffer, wall jump) |
| `world.js` | the materials (every flag: `hazard`, `grip`, `conveyor`, `bouncy`, `climbable`, `oneWay`), the pixel art (hero frames, slime, coin, torch, flag), **the level as a text map** (`levelRows()`, `LEGEND`, `HINTS`) and the moving parts (`FERRY`, `LIFT`, `LOW_G`) |
| `play.js` | the hero and slimes as entities with a `Character`, coins, flags (checkpoints), the goal, pebbles and bombs (projectiles), digging (`carve`), hurting and dying, saving, `newLevel()` (loadTileMap, platforms, gravity zone, camera rig) |
| `main.js` | the HUD (hints from triggers), the shell, the sky, `provingCheck()`, `Pixelite.run` |
| `tests/check.mjs` | **the level can be finished** (Node, no browser, about a minute): the engine's `reachSearch` plays the hero's controller; moving platforms are put in as bridges and stairs, the dirt wall as dug |
| `tests/mechanics.py` | each station in a real page: walking, jump height, coin, ladder, catwalk, ice, belt, spring, spikes, ferry, lift, low gravity, stomp, pebble, bomb, dig, checkpoint + save, goal, reload, rebinding, gamepad, replay |

## The stations (tile columns of the 112 x 24 map)

| Cols | Station | Engine feature |
|---|---|---|
| 0-30 | walking, coins, a catwalk (jump up through it, down drops), a ladder to a high ledge | `Character` coyote time and jump buffer, `oneWay`, `climbable` in the back wall |
| 31-53 | ice, two conveyor belts | `grip`, `conveyor` |
| 54-70 | a spring and a spike pit | `bouncy`, `hazard`, hit feedback, respawn |
| 71-91 | a ferry over spikes (or swing over the beam above it with the hook: E), a lift to a high ledge, checkpoint flags | `addPlatform` (carried by whole cells, slimes ride them too), `Grapple` |
| 92-107 | a low-gravity room with a ledge only a floating jump reaches, slimes, a brick tower | `addGravityZone`, entities with `fsm`, `fireProjectile`, `explode` + structures falling |
| 108-111 | a dirt wall to dig and the goal flag | `carve`, `loadTileMap` triggers, `screenResult` |

Also on show: **rewind** (hold R: `Rewind`, the last 8 seconds, with the game's numbers kept through `Rewind.keep`), a **ghost** of your best run replayed beside you (`GhostRecorder`, `spawnGhost`, kept with `Pixelite.save`), the **camera rig** (dead zone, look-ahead, bounds), **actions** with gamepad (A jump, X pebble, B bomb, Y dig) and touch buttons made
from them, the **shell** (title, pause menu, rebinding), **settings** and **saves** (the run continues at its checkpoint after a reload;
"NEW GAME" in the pause menu erases it), seeded **record/replay**, **tunables** that act live, and `Pixelite.run({ detail: { levels: [2] } })`.

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
- No liquids yet (the plan's D2): a pool with swimming would be the next station. No sound design beyond the engine's blips.
