-- Bug found 2026-09-17: a client's booking got silently cancelled by another
-- client's unrelated rearrange (schedule_slots is a weekly template, so the
-- same slot_id recurs every week — matching a booking by slot_id alone,
-- without book_date, matched the wrong week). Fixed client-side in
-- ClientApp.jsx (handleBook now matches slot_id AND book_date). This column
-- is the forensics side of that fix: bookings had no updated_at, so when the
-- cancellation happened there was no way to tell WHEN a row flipped to
-- cancelled, or to check server-side after the fact — only the client-side
-- realtime logs, which expire after 24h on the free plan.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION set_bookings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION set_bookings_updated_at();
