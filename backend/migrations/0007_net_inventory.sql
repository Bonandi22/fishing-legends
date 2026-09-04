ALTER TABLE player_progress
  ADD COLUMN IF NOT EXISTS nets integer NOT NULL DEFAULT 10;

ALTER TABLE player_progress
  ADD CONSTRAINT player_progress_nets_check CHECK (nets >= 0 AND nets <= 10);
