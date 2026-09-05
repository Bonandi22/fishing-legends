ALTER TABLE fishing_sessions
  ADD COLUMN IF NOT EXISTS result_fish_id varchar(120),
  ADD COLUMN IF NOT EXISTS result_weight numeric(12, 2),
  ADD COLUMN IF NOT EXISTS result_xp integer;
