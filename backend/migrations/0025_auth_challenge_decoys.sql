-- Decoy challenges: stored rows for addresses with no (eligible) account, so that
-- verify/resend/rate limits behave identically and cannot be used to enumerate emails.
-- A decoy has no user and is never emailed.
ALTER TABLE auth_challenges ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE auth_challenges ADD COLUMN decoy_email varchar(320);
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_owner_check CHECK ((user_id IS NULL) <> (decoy_email IS NULL));
CREATE INDEX auth_challenges_decoy_email_created_at_idx ON auth_challenges (decoy_email, created_at);
