#!/usr/bin/env bash
# Rebuild Pixel Snapper (Sprite Fusion, MIT, https://github.com/Hugo-Dz/spritefusion-pixel-snapper) as WebAssembly into
# portal/vendor/pixel-snapper/, where the PIXEL LAB page and tools/snap.mjs load it. The built files are committed, so the
# site and CI need no Rust; run this only to update it (change COMMIT, then rebuild, test and commit the result).
# tools/pixel-snapper.patch is applied first (what it changes and why: portal/vendor/pixel-snapper/README). It measures edges
# with a forward difference (upstream's centred one put every cut a pixel short) and finds the grid by a lattice fit, which
# handles fractional pixel sizes and follows a given size exactly (tests/node/pixeltools.test.mjs).
#   bash tools/build-snapper.sh
set -euo pipefail
COMMIT=02f9315        # "Update readme", 2026: the version vendored now
BINDGEN=0.2.105       # must match wasm-bindgen in the snapper's Cargo.lock
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
git clone -q https://github.com/Hugo-Dz/spritefusion-pixel-snapper.git "$WORK/snapper"
git -C "$WORK/snapper" checkout -q "$COMMIT"
git -C "$WORK/snapper" apply "$ROOT/tools/pixel-snapper.patch"
rustup target add wasm32-unknown-unknown
command -v wasm-bindgen >/dev/null && [ "$(wasm-bindgen --version)" = "wasm-bindgen $BINDGEN" ] || cargo install -q wasm-bindgen-cli --version "$BINDGEN" --locked
(cd "$WORK/snapper" && cargo build -q --release --lib --target wasm32-unknown-unknown)
OUT="$ROOT/portal/vendor/pixel-snapper"
mkdir -p "$OUT"
wasm-bindgen --target web --no-typescript --out-dir "$OUT" "$WORK/snapper/target/wasm32-unknown-unknown/release/spritefusion_pixel_snapper.wasm"
cp "$WORK/snapper/LICENSE" "$OUT/LICENSE"
echo "built Pixel Snapper $COMMIT into portal/vendor/pixel-snapper/"
