-- Feature change 2026-09-12: replaced the within-48h "cancel request" approval
-- flow entirely. There is no cancel concept anymore and no 48h rule — a client
-- can freely rearrange (drop) a booked session at any time, up to 3 times per
-- package. Track the count directly on the package row; it naturally resets to
-- 0 whenever a new package is created (renewal).
ALTER TABLE packages ADD COLUMN IF NOT EXISTS rearranges_used integer NOT NULL DEFAULT 0;
