-- Feature change 2026-09-12: replaced the within-48h "cancel request" approval
-- flow entirely. There is no cancel concept anymore and no 48h rule — a client
-- can freely rearrange (drop) a booked session at any time, up to 3 times
-- since their last completed session. Track the count directly on the package
-- row; it resets to 0 whenever a new package is created (renewal) AND (as of
-- 2026-09-14) whenever a session completes — see the sessions_used auto-settle
-- effects in ClientApp.jsx/TrainerApp.jsx, which zero it out in the same patch
-- the moment the completion-based count ticks up.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS rearranges_used integer NOT NULL DEFAULT 0;
