-- ============================================================================
-- New client sign-ups now notify the trainer, so they know to set up the
-- client's package/program. Idempotent, safe to re-run.
-- ============================================================================

-- A fresh client needs to resolve the trainer's id to notify them.
DROP POLICY IF EXISTS "authenticated can read trainer profiles" ON profiles;
CREATE POLICY "authenticated can read trainer profiles" ON profiles
  FOR SELECT USING (auth.uid() IS NOT NULL AND role = 'trainer');

-- A client posting a notification *to the trainer* has client_id = the
-- trainer's id, not their own — the existing "clients manage own
-- notifications" policy (auth.uid() = client_id) doesn't cover that.
DROP POLICY IF EXISTS "authenticated can insert notifications" ON notifications;
CREATE POLICY "authenticated can insert notifications" ON notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Lets the trainer jump straight to the new client's profile from the
-- notification instead of just seeing a name in a text message.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS related_client_id uuid REFERENCES profiles(id);
