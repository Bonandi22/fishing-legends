-- The cast now rolls the fish, so the session stores the roll (result_fish_id /
-- result_weight / result_xp already exist since 0009). result_lucky records
-- whether the server's lucky-mode window was active for this cast.
ALTER TABLE fishing_sessions ADD COLUMN IF NOT EXISTS result_lucky boolean NOT NULL DEFAULT false;
