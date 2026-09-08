-- 6b-2: submarine sessions also use result_catches, so the net/rod inference
-- (result_catches != null => net) breaks. A real mode column replaces it.
ALTER TABLE fishing_sessions ADD COLUMN mode varchar(16) NOT NULL DEFAULT 'rod';

-- Cleanup: existing rows are all past their 5-min TTL, but keep them consistent.
UPDATE fishing_sessions SET mode = 'net' WHERE result_catches IS NOT NULL;

ALTER TABLE fishing_sessions ADD CONSTRAINT fishing_sessions_mode_check
  CHECK (mode IN ('rod', 'net', 'submarine'));
