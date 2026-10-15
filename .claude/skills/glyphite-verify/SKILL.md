---
name: glyphite-verify
description: Build and verify any change to the Glyphite engine or a Glyphite game - build and unit tests, fast synchronous probes, the smoke test, zoomed screenshots in both renderers at every detail level, the game's regressions - before calling it done.
---

# Verify a Glyphite change

Each game is one HTML page assembled from `engine/` plus `games/<id>/`. Headless Chromium runs WebGL on
SwiftShader at about 70 ms per frame, so waiting on wall-clock time barely moves the simulation. Verify by
*stepping the simulation yourself* and by *looking at zoomed screenshots*. Run this loop for every change,
scaled to how risky it is. An engine change is risky for every game: run 1, 3 and 4 for all of them.

## 1. Build and unit tests

```sh
node tools/glyphite.mjs build <id>   # or npm run build for everything; must print SYNTAX_OK
npm test                             # build ↔ editor parity, editor patches, the Worker's Access check
```
The build also refuses a game top-level name that repeats an engine name (it would silently replace the
engine's function). A syntax error is reported against the source file and line.

## 2. Probe the behaviour synchronously

Use Playwright from Python (`pip install playwright==1.56.0 pillow numpy`; 1.56 matches the Chromium preinstalled
in Claude Code cloud sessions). Load `dist/games/<id>/index.html#2d` and drive the game with the test API:

```python
page = await browser.new_page(viewport={'width': 1200, 'height': 750})
errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
await page.goto(f'file://{ROOT}/dist/games/{gid}/index.html#2d'); await page.wait_for_timeout(800)
await page.evaluate('setDetail(2)')
r = await page.evaluate('''() => { Glyphite.test.start();
  /* set up: the game's own globals are available here (e.g. L.body.x = ...) */
  return Glyphite.test.step(300, ['ArrowUp']); }''')    # 300 fixed steps with Up held → probe()
```
- `Glyphite.test.probe()` returns engine stats plus the game's own `probe()`. Make the game's `probe()` report
  what you need to check (alive, score, position...).
- Check outcomes (states, counts, ranges), not exact positions: blasts and particles use `Math.random`.
  Run anything that looks flaky three times.
- Physics must agree at **RES 1, 2 and 3**. Sizes are authored in base units × RES, but some constants (the
  contact skin of 0.3 units) do not scale.

## 3. Smoke test and look at it

```sh
python3 tests/smoke.py <id>          # 2D + GL: loads, starts, steps with keys, changes detail → shots/smoke_<id>_*.png
```
Then **look** at the screenshots, and take zoomed ones of whatever changed:
- **Freeze, don't pause:** `Glyphite.test.freeze()` then `Glyphite.test.render()`. Pausing draws a PAUSED box.
- **Zoom:** `device_scale_factor=3` and a clip. World → CSS pixels:
  `x = (wx - cam.x)·R.cw/R.dpr + canvasLeft`, `y = (wy - cam.y)·R.chh/R.dpr/ASPECT + canvasTop`.
- **Both renderers:** WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` and `#gl`;
  2D with `--disable-gpu` and `#2d`.
- **Detail levels:** RES 1, 2 and 3 at least (2 is the desktop default, 1.5 phones).
- Build contact sheets with Pillow (before/after, renderer A/B, reference vs result) and actually look at them.

## 4. Regressions

Each game keeps its own scripts in `games/<id>/tests/` (see `docs/TESTING.md`). For Regolith:

| Area touched | Scripts (in games/regolith/tests/) |
|---|---|
| Lander, legs, contacts, hull | `dbg_legs.py 1`, `2`, `3`; `dbg_legs2.py 2`; `check_x3_clearance.py` |
| Level generation, materials, sand | `check_floating_islands.py` |
| Blasts, chunks, structures, mounts | `test14.py 2d 2`, `test15.py 2d 2` |
| Renderer, sky, layers | `test17.py 2d gl`, `check_sky_smooth.py`, screenshots |
| Sprites | `test18.py 2d`, `test18.py gl`, `perf_lander_sprite.py` |
| Anything | `test16.py gl 2d` (real-time smoke), `python3 tests/smoke.py --all` |

Always collect `pageerror` events and treat any as a failure.

## 5. Performance sanity

Headless frame time is dominated by presenting the canvas, so it is a poor absolute measure. Compare
*per-system* costs instead (`games/regolith/tests/prof_systems.py` wraps global functions with timers). Each new
per-frame system should cost well under 2 ms per frame at RES 3.

## 6. Report

State briefly what you checked, the numbers that matter, what the screenshots showed, and anything still
uncertain. Update `docs/` when behaviour changed (HISTORY, LESSONS, ROADMAP, `engine/API.md`, the game's
NOTES.md). If this loop missed something, or a step proved unnecessary, edit this skill.
