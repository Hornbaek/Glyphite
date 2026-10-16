# Testing

Three layers:
1. **Unit tests** (`npm test`, Node's built-in runner, `tests/node/`): the build (every game assembles, the
   browser assembler gives the same page as the Node build, page lines map back to sources), the editor's
   patches (`git apply` round trips) and the Worker's Access check.
2. **The smoke test** (`tests/smoke.py`): any game, in both renderers: loads, starts, steps with keys, survives
   detail changes, no page errors, a screenshot per renderer in `shots/`. CI runs it for every game.
3. **Each game's own probes** in `games/<id>/tests/` (Regolith's are below).
4. **Engine feature probes** in `tests/` (not tied to one game): `engine_light.py [2d|gl ...]` checks `sunAt` / `isLitBy`, the
   sun's colour from an atmosphere or a blackbody, star twinkle and lamp glare, and eye adaptation, in both renderers. It
   uses Regolith as the host game and asserts properties (redder, dimmer, steady vs. varying), not exact pixels.
   `engine_audio.py [2d|gl ...]` checks sound through air (delay, volume and dullness with distance, only with an atmosphere;
   `explode()` passing it on; the listener hook) by spying on `Sfx.burst`, and the beat (drum-hit edges from a faked chip
   meter, `blink`, material `beatGlow` and the bloom swell measured in pixels).
   `notfound.py [2d|gl ...]` (or `--url <a missing page on a running site>`) plays the 404 game: the address becomes rock, the
   lander crashes within ten seconds and breaks some of it, Enter restarts, a hostile address is only drawn as rock.
   `thumbnail_pick.py` checks the frame scoring of `tools/thumbnail.py --auto` on synthetic frames (no browser).

All browser tests drive headless Chromium with Playwright against the built pages in `dist/games/<id>/`
(build first). Scripts find the repo root from their own path, so they run from any directory. Screenshots
go to `shots/` (created on demand; not committed).

## Setup

```sh
npm ci                             # wrangler (the only dependency, for the Worker)
pip install playwright==1.56.0 pillow numpy
python -m playwright install chromium   # not needed in Claude Code cloud sessions: Chromium is preinstalled for 1.56
npm run build                      # must print SYNTAX_OK
```

Renderer selection (used in every script):

| Path | Chromium args | URL suffix |
|---|---|---|
| WebGL (SwiftShader) | `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` | `#gl` (forces GL even though it is software) |
| 2D canvas | `--disable-gpu` | `#2d` |

## Techniques used throughout

- **Synchronous stepping.** Inside `page.evaluate`, call `Glyphite.test.start()` (or the game's own setup,
  e.g. Regolith's `startSite(n)` and `L.body` position and velocity), then `Glyphite.test.step(n, keys)` or
  loop `update(DT)`. This is fast and avoids slow headless frames.
- **Freeze for screenshots.** `Glyphite.test.freeze()` (it saves `window.update` and replaces it), take the
  screenshot, `Glyphite.test.unfreeze()`. Don't pause: it draws a PAUSED box.
- **Engine globals:** `state`, `stateT`, `cam`, `R` (renderer: `cols`, `rows`, `cw`, `chh`, `dpr`, `mode`), `RES`,
  `UNIT_M`, `ASPECT`, `DT`, `TUNE`, `chunks`, `P`, `setDetail(r)`, `explode(x, y, R, power)`, `blastFrom(vx, vy)`,
  `getC(x, y)`, `update`, `draw`. Regolith adds `L` (lander: `body`, `legs`, `touchV`, `reason`), `LEVEL`
  (pads, lamps, crystals), `startSite(lv)`, `fireRocket(aim)`.
- **Clip around an object.** `x = (b.x - cam.x) * R.cw / R.dpr + canvasLeft` and
  `y = (b.y - cam.y) * R.chh / R.dpr / ASPECT + canvasTop`.
- **Through the agent proxy** (Claude Code cloud sessions): pages from `http://127.0.0.1` need
  `proxy={'server': os.environ['HTTPS_PROXY'], 'bypass': '<-loopback>,localhost,127.0.0.1'}`; `file://` pages
  need nothing.

## Regolith Lander (`games/regolith/tests/`, current)

| Script | What it checks |
|---|---|
| `dbg_legs.py [RES]` | Touchdowns from 0.5 to 5.5 m/s on pad 1: state, crash reason, peak and rest compression, measured touchdown speed. Expect landed up to 3.5, "GEAR COLLAPSED" from 4.5. |
| `dbg_legs2.py [RES]` | Tilted (±0.2, −0.35, 0.5 rad) and drifting (1.5 and 3 m/s) landings, plus a slope landing that should settle off-site. |
| `test14.py [gl\|2d] [RES,...]` | Shoots a pad lamp post halfway up. The post is cut (stump shorter), the top becomes a chunk carrying the lamp, falls, and freezes. Screenshots `post_*`. |
| `test15.py [gl\|2d] [RES]` | Level 2: blasts the x3 roof pillar until the roof (~650–700 cells) breaks off. It falls onto the pad with its two lamps riding, then freezes. Screenshots `roof_*`. |
| `test16.py gl 2d` | Real-time smoke test: title, play, burn, fire rockets, roof drop, page errors, rough frame times. |
| `test17.py 2d gl` | Earth centroid across sub-cell camera steps (sky smoothness, screenshot based). |
| `test18.py [gl\|2d]` | Lander sprite renders, landed and tilted with the engine on, at RES 1/2/3. Zoomed clips `lm_*`. |
| `check_floating_islands.py` | After generation, no non-granular cell is disconnected from bedrock, at every level 1–8 and RES 1/2/3. |
| `check_sky_smooth.py` | Computes a star's on-screen path during a camera glide, old formula vs new: the new path is monotonic. |
| `check_x3_clearance.py` | Lands on the x3 pad at every detail level; prints the clearance from the antenna to the roof and the lamps (must stay positive). |
| `perf_lander_sprite.py` | ms per `drawLanderArt` / `markLanderDyn` call at RES 1–3 (about 0.5 / 0.7 / 1.6 ms headless). |
| `prof_systems.py` | ms per second spent in each engine system during a roof collapse (wraps globals with timers). |
| `shot_lander_normal_view.py` | Normal-zoom gameplay screenshots, in flight and landed. |

## Regolith Lander: historical tests (written for earlier versions; may need updating)

| Script | Original purpose |
|---|---|
| `test.py` | First boot: title, play start, engine burn. |
| `test2.py` | Pad landings and the second site. |
| `test3.py` | Boulders pushed and broken by a blast. |
| `test3_phone.py`, `test7.py` | Phone layouts (2D and GL). |
| `test4.py` | Screenshots of every site, and bloom. |
| `test5.py` | Boot timing per detail level. |
| `test6.py` | Hover, blast and aftermath in both renderers. |
| `test8.py` to `test11.py` | Spotlights at different sites, lights on/off, landing on x2. |
| `test12.py` | Chip music: autoplay on title, loading a MIDI file, meters. |
| `test13.py` | Phone title layout; desktop hides touch controls and the title bar during play. |
| `dbg.py`, `prof*.py` | Early debugging and profiling probes. |

## Audio check without a browser

```sh
node games/regolith/tools/render_songs.cjs   # parses the embedded songs with the engine's MIDI parser, renders WAVs to games/regolith/music/
```

## Checklist before calling a change done

1. `npm run build` prints SYNTAX_OK and `npm test` passes.
2. The focused probe for the change passes at RES 1, 2 and 3.
3. `python3 tests/smoke.py <id>` passes, and the screenshots in both renderers look right: look at them, at zoom.
4. Related regression scripts still pass (for Regolith: landing, islands, clearance, roof, lamp post).
5. No `pageerror` in any run.
6. `docs/` are updated (HISTORY, LESSONS, ROADMAP, `engine/API.md`, the game's NOTES.md as relevant).
