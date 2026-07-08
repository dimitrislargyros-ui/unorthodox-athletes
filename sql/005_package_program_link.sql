-- ============================================================================
-- Link packages to a workout program (workout_templates row).
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES workout_templates(id);
