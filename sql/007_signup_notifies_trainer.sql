-- ============================================================================
-- SUPERSEDED: the "notify trainer via a cross-user notifications row" design
-- below hit an RLS issue in production that we couldn't pin down (the INSERT
-- policy existed exactly as intended per pg_policies but inserts still got
-- rejected 42501). The app was changed instead to derive "new clients still
-- needing a package" directly from data the trainer already has full read
-- access to (TrainerApp.jsx TodayScreen), no new write path needed. This
-- migration is harmless to leave applied (unused column + policies) — no
-- need to run it if you haven't already, and no need to revert it if you have.
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
