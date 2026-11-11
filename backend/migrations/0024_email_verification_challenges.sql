-- Email verification state on users + short-lived code challenges (verify email,
-- 2-step login, password reset). verification_required_since is set only for
-- accounts created after this migration, so legacy accounts are never purged.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN locale char(2) NOT NULL DEFAULT 'en';
ALTER TABLE users ADD COLUMN verification_required_since timestamptz;
ALTER TABLE users ADD CONSTRAINT users_locale_check CHECK (locale IN ('pt', 'en', 'es', 'fr', 'de', 'ja'));

CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose varchar(20) NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_challenges_purpose_check CHECK (purpose IN ('verify_email', 'login', 'password_reset'))
);

CREATE INDEX auth_challenges_user_purpose_created_at_idx ON auth_challenges (user_id, purpose, created_at DESC);
