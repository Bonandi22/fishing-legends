CREATE TABLE IF NOT EXISTS daily_reward_claims (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_date date NOT NULL,
  reward_day integer NOT NULL CHECK (reward_day BETWEEN 1 AND 7),
  amount bigint NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_reward_claims_user_date_unique UNIQUE (user_id, claim_date)
);
