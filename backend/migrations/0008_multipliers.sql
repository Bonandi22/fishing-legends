ALTER TABLE player_progress
  ADD COLUMN IF NOT EXISTS luck_multiplier_power integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luck_multiplier_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS strength_multiplier_power integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strength_multiplier_expires_at timestamptz;

ALTER TABLE player_progress
  ADD CONSTRAINT player_progress_luck_multiplier_power_check CHECK (luck_multiplier_power IN (0, 2, 4)),
  ADD CONSTRAINT player_progress_strength_multiplier_power_check CHECK (strength_multiplier_power IN (0, 2, 4));
