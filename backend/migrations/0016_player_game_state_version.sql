ALTER TABLE player_game_state ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
