---
name: glyphite-verify
description: Build and verify any change to the Glyphite engine or a Glyphite game - syntax check, fast synchronous physics probes, zoomed screenshots in both renderers at every detail level, regressions - before calling it done.
---

# Verify a Glyphite change

Glyphite games are one HTML file built from `src/` parts. Headless Chromium runs WebGL on SwiftShader
at about 70 ms per frame, so waiting on wall-clock time barely moves the simulation. Verify by
*stepping the simulation yourself* and by *looking at zoomed screenshots*. Run this loop for every
change, scaled to how risky the change is.

## 1. Build

```sh
./build.sh        # must print SYNTAX_OK; writes dist/regolith.html and dist/test.html
```
When you add a source part, add it to the `cat` list in `build.sh` in dependency order. Data comes
before the code that reads it at load time.

## 2. Probe the behaviour synchronously

Write or reuse a small Playwright script. Start from `tests/dbg_legs.py` for physics and
`tests/test14.py` / `tests/test15.py` for blasts and structures. The pattern:

```python
page = await browser.new_page(viewport={'width': 1200, 'height': 750})
await page.goto(f'file://{ROOT}/dist/test.html#2d'); await page.wait_for_timeout(600)
await page.evaluate('setDetail(2)')
r = await page.evaluate('''() => { startSite(1); const b = L.body; /* set up */ 
  for (let i = 0; i < 300 && state === 'play'; i++) update(DT);   // step the sim deterministically
  return { state, reason: L.reason }; }''')
```

- Check outcomes (state, counts, ranges), not exact positions. Explosions and particles use
  `Math.random`, so run anything that looks flaky three times.
- Physics must agree at **RES 1, 2 and 3**. Sizes are authored in base units × RES, but constants
  such as the contact skin (0.3 units) do not scale. Find RES-dependent behaviour early.
- Useful globals:
  - `L` (lander), `LEVEL`, `chunks`, `state`, `cam`, `R`, `RES`, `UNIT_M`, `ASPECT`, `DT`.
  - `setDetail`, `startSite`, `explode`, `blastFrom`, `fireRocket`, `getC`.
  - `update` and `draw`.

## 3. Look at it

- **Freeze, don't pause:** `window.__upd = update; window.update = () => {}`. Pausing draws a
  PAUSED box. Restore `window.update = window.__upd` afterwards.
- **Zoom:** use `device_scale_factor=3` and clip around the subject. The world-to-CSS-pixel mapping:
  `x = (wx - cam.x)·R.cw/R.dpr + canvasLeft`, `y = (wy - cam.y)·R.chh/R.dpr/ASPECT + canvasTop`.
- **Both renderers:** WebGL with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`
  and `#gl`; 2D with `--disable-gpu` and `#2d`.
- **All detail levels:** RES 1, 2 and 3 at least. RES 2 is the desktop default and 1.5 the phone
  default.
- **Normal zoom** too (`tests/shot_lander_normal_view.py`): it is what the player actually sees.
- Build contact sheets with Pillow (sequences, renderer A/B, before/after, reference vs result) and
  **actually look at them** with the image viewer before judging.

## 4. Regressions

Run what the change could break (see `docs/TESTING.md`):

| Area touched | Scripts |
|---|---|
| Lander, legs, contacts, hull | `tests/dbg_legs.py 1`, `2`, `3`; `tests/dbg_legs2.py 2`; `tests/check_x3_clearance.py` |
| Level generation, materials, sand | `tests/check_floating_islands.py` |
| Blasts, chunks, structures, lamps | `tests/test14.py 2d 2`, `tests/test15.py 2d 2` |
| Renderer, sky, layers | `tests/test17.py 2d gl`, `tests/check_sky_smooth.py`, and screenshots |
| Sprites | `tests/test18.py 2d`, `tests/test18.py gl`, `tests/perf_lander_sprite.py` |
| Anything | `tests/test16.py gl 2d` (real-time smoke test, page errors) |

Always collect `pageerror` events and treat any as a failure.

## 5. Performance sanity

Headless frame time is dominated by presenting the canvas, so it is a poor absolute measure. Compare
*per-system* costs instead: `tests/prof_systems.py` wraps the global functions with timers and
reports ms per second. Each new per-frame system should cost well under 2 ms per frame at RES 3.

## 6. Report

State briefly:
- what you checked;
- the numbers that matter (thresholds, timings);
- what the screenshots showed;
- anything still uncertain.

Update `docs/` when behaviour changed: HISTORY for what was done, LESSONS for any new pitfall,
ROADMAP for follow-ups. If this loop missed something, or a step proved unnecessary, edit this
skill.
