-- ============================================================================
-- Fix: "Book -> Change -> Book" (or any re-book of a previously-cancelled
-- slot) crashed with a raw Postgres error popup.
-- Root cause: the unique constraint on (slot_id, client_id, book_date)
-- applied to ALL rows regardless of status, so once a booking was cancelled,
-- that exact slot+date could never be booked again for that client — every
-- retry hit "duplicate key value violates unique constraint
-- bookings_slot_id_client_id_book_date_key" (23505), shown to the user via
-- a raw alert().
-- Fix: replace the blanket unique constraint with a partial unique index
-- that only applies to active ('booked') rows, so cancelled history can
-- coexist with a fresh booking of the same slot/date.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_slot_id_client_id_book_date_key;

DROP INDEX IF EXISTS bookings_active_slot_client_date_uidx;
CREATE UNIQUE INDEX bookings_active_slot_client_date_uidx
  ON bookings (slot_id, client_id, book_date)
  WHERE status = 'booked';
