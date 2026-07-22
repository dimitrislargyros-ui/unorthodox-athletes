-- Add package history tracking columns to packages table
-- When a package is renewed/cancelled, record when and why it was deactivated

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS deactivated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deactivation_reason text;

-- Index for quick history lookups per client
CREATE INDEX IF NOT EXISTS packages_client_deactivated_idx
  ON packages (client_id, deactivated_at DESC NULLS LAST);
