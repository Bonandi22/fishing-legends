CREATE TABLE IF NOT EXISTS player_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 30),
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  total_fish_caught integer NOT NULL DEFAULT 0 CHECK (total_fish_caught >= 0),
  coins bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  unlocked_locations text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
