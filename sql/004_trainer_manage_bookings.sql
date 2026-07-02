-- ============================================================================
-- Fix: trainer "Cancel" on a client's self-booked slot silently did nothing
-- to the actual booking row (RLS blocked the UPDATE for anyone but the
-- owning client), even though the UI optimistically showed it as cancelled
-- and a "your session was cancelled" notification was sent — leaving the
-- client's real booking still active and the trainer's cancellation
-- notification factually wrong.
-- Fix: add a trainer-wide policy on bookings, matching the pattern already
-- used for slot_requests/waitlist/notifications.
-- Idempotent: safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "trainers manage all bookings" ON bookings;
CREATE POLICY "trainers manage all bookings" ON bookings
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));
