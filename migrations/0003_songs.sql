-- Songs made in the SOUND STUDIO (/studio/): the whole song as JSON (engine/13_sampler.js, Sampler.check, describes it).
-- A session reads a song from here with the D1 connector and commits it into a game (games/<id>/music/<id>.song.json,
-- then tools/song.mjs); the repository's copy is what the game plays.
CREATE TABLE songs (
  id         TEXT PRIMARY KEY,                       -- made by the studio from the title: a-z, 0-9 and dashes
  title      TEXT NOT NULL,
  game       TEXT NOT NULL DEFAULT '',               -- the game it is for, '' while it is for none yet
  data       TEXT NOT NULL,                          -- the song
  updated_at TEXT NOT NULL,                          -- ISO time of the last save
  updated_by TEXT NOT NULL DEFAULT ''                -- an Access email, or 'claude-session'
);
