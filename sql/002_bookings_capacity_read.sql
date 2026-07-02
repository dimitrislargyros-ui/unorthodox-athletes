-- ============================================================================
-- Fix: clients could only see their own bookings, so the "X/8 booked" gym
-- capacity display and full-slot blocking never worked correctly for them
-- (they could never see more than their own 1 booking in any slot).
-- This adds a read policy so any authenticated user can see booking rows
-- for capacity-counting purposes, matching the pattern already used for
-- schedule_periods/announcements. Existing "own rows" policies (if any)
-- for INSERT/UPDATE/DELETE are untouched — this only affects what can be
-- read via SELECT.
-- Idempotent: safe to re-run.
-- ============================================================================

DROP POLICY IF EXISTS "authenticated can read bookings for capacity" ON bookings;
CREATE POLICY "authenticated can read bookings for capacity" ON bookings
  FOR SELECT USING (auth.uid() IS NOT NULL);
