-- ============================================================================
-- Bug fix found during testing on 2026-07-09. Idempotent, safe to re-run.
-- (The other bug found in the same session — new client sign-ups silently
-- failing to save name/phone — was a client-side code bug only: the app was
-- INSERTing into profiles when a DB trigger already creates that row on
-- signup, so it needed a PATCH instead. Confirmed the existing UPDATE-own-row
-- policy already covers that; no SQL change needed for it.)
-- ============================================================================

-- A client's assigned program name never showed on their
-- schedule/profile. packages.program_id -> workout_templates(id) resolves
-- fine, but workout_templates only had a trainer-owner policy, so the
-- PostgREST embed silently returned null for anyone who isn't the trainer.
DROP POLICY IF EXISTS "authenticated can read workout templates" ON workout_templates;
CREATE POLICY "authenticated can read workout templates" ON workout_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);
