-- What we decided about each idea in docs/ideas.json (the ideas themselves live in the repository).
-- A row exists only for an idea that is starred, has a status other than 'idea', or has a note.
CREATE TABLE idea_state (
  id         TEXT PRIMARY KEY,                       -- the idea's id in docs/ideas.json
  starred    INTEGER NOT NULL DEFAULT 0,             -- 1 = highlighted
  status     TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'planned', 'building', 'shipped', 'parked')),
  note       TEXT NOT NULL DEFAULT '',               -- a few words: why, the PR, what is left
  updated_at TEXT NOT NULL,                          -- ISO time of the last change
  updated_by TEXT NOT NULL DEFAULT ''                -- who changed it: an Access email, or 'claude-session'
);
CREATE INDEX idea_state_status ON idea_state (status);
