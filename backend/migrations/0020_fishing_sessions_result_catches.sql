-- Net / submarine casts roll a batch. Rod sessions leave this null and keep using
-- result_fish_id / result_weight / result_xp.
ALTER TABLE fishing_sessions ADD COLUMN IF NOT EXISTS result_catches jsonb;
