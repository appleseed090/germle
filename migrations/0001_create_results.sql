-- Community scores: one row per player per daily puzzle, from the first finished game that player
-- submitted. Nothing else is stored: no moves, no IP address, no user agent.
CREATE TABLE results (
  puzzle_number INTEGER NOT NULL,
  -- A random UUID made in the player's browser; not linked to any account.
  player_id TEXT NOT NULL,
  -- 0–100, computed by the Worker by replaying the submitted moves.
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Unix time in seconds; tells games played on the puzzle's own day from later archive games.
  submitted_at INTEGER NOT NULL,
  PRIMARY KEY (puzzle_number, player_id)
) STRICT;

-- Serves the per-puzzle tallies (players per score, hence below, best and the histogram) from
-- the index alone.
CREATE INDEX results_by_puzzle_and_score ON results (puzzle_number, score);
