# Testing

Every test is a Python script that drives headless Chromium with Playwright against `dist/test.html`
(build first with `./build.sh`). Scripts find the repo root from their own path, so they can run
from any directory. Screenshots go to `shots/` (created on demand; not committed).

## Setup

```sh
pip install playwright pillow numpy
playwright install chromium        # or point Playwright at an existing Chromium
./build.sh                         # must print SYNTAX_OK
```

Renderer selection (used in every script):

| Path | Chromium args | URL suffix |
|---|---|---|
| WebGL (SwiftShader) | `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` | `#gl` (forces GL even though it is software) |
| 2D canvas | `--disable-gpu` | `#2d` |

## Techniques used throughout

- **Synchronous stepping.** Inside `page.evaluate`, call `startSite(n)`, set `L.body` position and
  velocity, then loop `update(DT)`. This is fast and avoids slow headless frames.
- **Freeze for screenshots.** Use `window.__upd = update; window.update = () => {}`, take the
  screenshot, then restore `window.update = window.__upd`. Don't use `state = 'paused'`: it draws a
  PAUSED box.
- **Useful globals:** `L` (lander: `body`, `legs`, `touchV`, `reason`), `LEVEL` (pads, lamps,
  crystals), `chunks`, `state`, `cam`, `R` (renderer: `cols`, `rows`, `cw`, `chh`, `dpr`, `mode`),
  `RES`, `UNIT_M`, `ASPECT`, `DT`, `setDetail(r)`, `startSite(lv)`, `explode(x, y, R, power)`,
  `blastFrom(vx, vy)`, `fireRocket(aim)`, `getC(x, y)`.
- **Clip around an object.** `x = (b.x - cam.x) * R.cw / R.dpr + canvasLeft` and
  `y = (b.y - cam.y) * R.chh / R.dpr / ASPECT + canvasTop`.

## Current tests (written for the latest version)

| Script | What it checks |
|---|---|
| `tests/dbg_legs.py [RES]` | Touchdowns from 0.5 to 5.5 m/s on pad 1: state, crash reason, peak and rest compression, measured touchdown speed. Expect landed up to 3.5, "GEAR COLLAPSED" from 4.5. |
| `tests/dbg_legs2.py [RES]` | Tilted (±0.2, −0.35, 0.5 rad) and drifting (1.5 and 3 m/s) landings, plus a slope landing that should settle off-site. |
| `tests/test14.py [gl\|2d] [RES,...]` | Shoots a pad lamp post halfway up. The post is cut (stump shorter), the top becomes a chunk carrying the lamp, falls, and freezes. Screenshots `post_*`. |
| `tests/test15.py [gl\|2d] [RES]` | Level 2: blasts the x3 roof pillar until the roof (~650–700 cells) breaks off. It falls onto the pad with its two lamps riding, then freezes. Screenshots `roof_*`. |
| `tests/test16.py gl 2d` | Real-time smoke test: title, play, burn, fire rockets, roof drop, page errors, rough frame times. |
| `tests/test17.py 2d gl` | Earth centroid across sub-cell camera steps (sky smoothness, screenshot based). |
| `tests/test18.py [gl\|2d]` | Lander sprite renders, landed and tilted with the engine on, at RES 1/2/3. Zoomed clips `lm_*`. |
| `tests/check_floating_islands.py` | After generation, no non-granular cell is disconnected from bedrock, at every level 1–8 and RES 1/2/3. |
| `tests/check_sky_smooth.py` | Computes a star's on-screen path during a camera glide, old formula vs new: the new path is monotonic. |
| `tests/check_x3_clearance.py` | Lands on the x3 pad at every detail level; prints the clearance from the antenna to the roof and the lamps (must stay positive). |
| `tests/perf_lander_sprite.py` | ms per `drawLanderArt` / `markLanderDyn` call at RES 1–3 (about 0.5 / 0.7 / 1.6 ms headless). |
| `tests/prof_systems.py` | ms per second spent in each engine system during a roof collapse (wraps globals with timers). |
| `tests/shot_lander_normal_view.py` | Normal-zoom gameplay screenshots, in flight and landed. |

## Historical tests (written for earlier versions; may need updating)

| Script | Original purpose |
|---|---|
| `tests/test.py` | First boot: title, play start, engine burn. |
| `tests/test2.py` | Pad landings and the second site. |
| `tests/test3.py` | Boulders pushed and broken by a blast. |
| `tests/test3_phone.py`, `tests/test7.py` | Phone layouts (2D and GL). |
| `tests/test4.py` | Screenshots of every site, and bloom. |
| `tests/test5.py` | Boot timing per detail level. |
| `tests/test6.py` | Hover, blast and aftermath in both renderers. |
| `tests/test8.py` to `tests/test11.py` | Spotlights at different sites, lights on/off, landing on x2. |
| `tests/test12.py` | Chip music: autoplay on title, loading a MIDI file, meters. |
| `tests/test13.py` | Phone title layout; desktop hides touch controls and the title bar during play. |
| `tests/dbg.py`, `tests/prof*.py` | Early debugging and profiling probes. |

## Audio check without a browser

```sh
node tools/render_songs.js     # parses the embedded songs with the game's MIDI parser, renders WAVs to music/
```

## Checklist before calling a change done

1. `./build.sh` prints SYNTAX_OK.
2. The focused probe for the change passes at RES 1, 2 and 3.
3. Screenshots in both renderers look right: look at them, at zoom.
4. Related regression scripts still pass (landing, islands, clearance, smoke).
5. No `pageerror` in any run.
6. `docs/` are updated (HISTORY, LESSONS, ROADMAP as relevant).
