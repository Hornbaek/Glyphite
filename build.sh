#!/bin/sh
# Build the single-file game: concatenate the parts in order, syntax-check the script, and
# write dist/regolith.html (the shippable page) plus dist/test.html (a full HTML document with a
# viewport meta, used by the Playwright tests and for opening locally).
set -e
cd "$(dirname "$0")"
mkdir -p dist
cat src/00_head.html src/01_core.js src/02_particles.js src/03_body.js src/04_light.js src/05_render_base.js src/06_render_scene.js src/07_audio_input.js src/07b_chip.js src/07c_songs.js src/08_level.js src/09_game_sim.js src/09b_boulders.js src/09c_chunks.js src/10_game_view.js src/10a_lander_data.js src/10a_lander_art.js src/10b_music.js src/11_main.js > dist/regolith.html
CHECK="$(mktemp -t glyphite_check.XXXXXX).js"
sed -n '/<script>/,/<\/script>/p' dist/regolith.html | sed '1d;$d' > "$CHECK" && node --check "$CHECK" && echo SYNTAX_OK
rm -f "$CHECK"
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}</style></head><body>\n'; cat dist/regolith.html; printf '\n</body></html>\n'; } > dist/test.html
