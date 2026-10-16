-- The owner can ask a Claude session to explain an idea in more detail (the [?] on /ideas/). A session explains the marked
-- ideas in its chat and clears the mark (CLAUDE.md, "The idea bank"). A row is now also kept while an idea is marked.
ALTER TABLE idea_state ADD COLUMN ask INTEGER NOT NULL DEFAULT 0;   -- 1 = explain this idea to me
