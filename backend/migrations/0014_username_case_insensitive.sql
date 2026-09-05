-- Usernames are unique regardless of case: `Angler` and `angler` must not coexist.
-- 0001 created this as a table constraint; drop whichever form exists.
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_username_unique;
DROP INDEX IF EXISTS user_profiles_username_unique;
CREATE UNIQUE INDEX user_profiles_username_unique ON user_profiles (lower(username));
