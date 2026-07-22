-- Increase the sessions_total check constraint to allow larger packages (e.g. 50, 100 sessions)
-- The default constraint was too restrictive for clients with high-volume packages.

ALTER TABLE packages
  DROP CONSTRAINT IF EXISTS packages_sessions_total_check;

ALTER TABLE packages
  ADD CONSTRAINT packages_sessions_total_check
    CHECK (sessions_total >= 1 AND sessions_total <= 500);
