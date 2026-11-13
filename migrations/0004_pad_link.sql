-- The phone pad (/studio/pad/): a phone and the SOUND STUDIO on a PC find each other here. The studio puts a WebRTC offer under a
-- six digit code, the phone answers it, and the two then talk directly over the wifi; nothing about the music passes through here.
-- Rows are only a few minutes old (worker/pad.js deletes the old ones whenever a new offer is put).
CREATE TABLE pad_link (
  code       TEXT PRIMARY KEY,                       -- six digits, made by the studio
  offer      TEXT NOT NULL,                          -- JSON { id, sdp } from the studio
  answer     TEXT NOT NULL DEFAULT '',               -- JSON { id, sdp } from the phone ('' until it answers); id is the offer's
  updated_at INTEGER NOT NULL                        -- ms since 1970 of the last offer
);
