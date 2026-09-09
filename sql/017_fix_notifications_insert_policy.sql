-- ============================================================================
-- Security fix: sql/007 replaced the notifications INSERT policy with
-- `WITH CHECK (auth.uid() IS NOT NULL)` — any authenticated user (any real
-- client's own login) could insert a notification row targeting ANY
-- client_id, with arbitrary type/message. That policy turned out to be
-- unused by the app anyway (007's own header says the feature it was for
-- was superseded) — every notification the app sends actually goes through
-- api/send-push.js using the service key, which bypasses RLS entirely and
-- doesn't consult this policy at all. So this policy was pure exposure with
-- zero functional benefit: anyone could POST directly to
-- {SUPABASE_URL}/rest/v1/notifications with their own anon key + JWT
-- (both sitting in plain sight in the deployed JS bundle) and spoof a
-- notification — e.g. a fake "payment_confirmed" or "your session is
-- cancelled" message — to any other client or the trainer.
--
-- Replace it with the actually-intended shape: a caller may insert a
-- notification row only when they're notifying themselves, notifying the
-- trainer, or (if they ARE the trainer) notifying any client. This matches
-- every real call site in ClientApp.jsx/TrainerApp.jsx's `postNotification`.
-- Idempotent: safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "authenticated can insert notifications" ON notifications;

CREATE POLICY "scoped notification inserts" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = client_id AND role = 'trainer')
  );
