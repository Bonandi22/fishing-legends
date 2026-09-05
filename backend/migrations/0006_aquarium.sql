CREATE TABLE IF NOT EXISTS aquarium_fish (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fish_id varchar(120) NOT NULL,
  location_id varchar(120) NOT NULL,
  weight numeric(12, 2) NOT NULL CHECK (weight > 0),
  sector integer NOT NULL CHECK (sector BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aquarium_fish_user_id_idx ON aquarium_fish(user_id);
