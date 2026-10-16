# Page Not Found (the 404 game)

Unlisted. `worker/index.js` serves it, with status 404, to a browser that asks for a page that is not there (`GET`, `Accept:
text/html`, not under `/api/`). It is a normal Glyphite game: `world.js` builds the address as rock, `main.js` is the lander.

- **The address.** `missingPath()` takes `location.pathname` (a test or preview can pass `?path=/x`; opened from the game list it
  shows a sample). Only printable ASCII is kept, and a long address becomes `...` plus its last 11 characters. It is drawn with
  the browser's own font into a 14 pixel high canvas; each lit pixel becomes `2k x k` cells of `slab` (k = round(RES)), standing
  on the ground, so it is rock the engine can break into chunks. It is never read as markup.
- **The run.** The lander (a point mass, 5 x 2 cells) drops from the top; W/Up burns (about 4 s of fuel), A/D drift. Any touch
  over 1.4 m/s crashes (the engine's `explode`), a slower one is a soft touchdown on a page that does not exist. Enter or a tap
  tries again. About ten seconds start to finish.
- **Tests.** `python3 tests/notfound.py` (2D and GL) and `tests/node/notfound.test.mjs` (the Worker's routing).
