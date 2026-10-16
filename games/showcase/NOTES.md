# Glyphite Showcase: notes

**What it is.** The live engine demo at the top of the public landing page (`portal/welcome/`), unlisted on the game list
and one of the two places visitors who are not signed in may see (`/games/showcase/`, `worker/index.js` `isPublic`).
GLYPHITE is spelled in rock on the ground (drawn by the browser into a tiny canvas, every lit pixel a block, as in the 404
game), lit by a low sun and two flickering lamps. Sand pours from two hoppers in turn; meteors fall every few seconds and
wherever the visitor clicks, and the rock that loses its support breaks off as falling chunks. When less than 30% of the
word is left (or after 75 s) it is built again.

**Sizing.** The word takes about 70% of the view and is built from a smaller font when the view is narrow, so a phone sees
it whole; the sand rate and the blast size follow the word's size, so a small word is not buried or flattened at once.

**Sound.** Meteors the visitor drops boom; the ones that fall by themselves are quiet (and the browser starts no sound
before the visitor's first click anyway).

**Tunables.** Meteor every (s), sand (x).

**Keep it public-safe.** It must not load anything private (no `/games.json`, no `/src/`, no other game's files): signed
out, those answer 401. It has no links into the site.
