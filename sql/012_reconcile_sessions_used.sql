-- ============================================================
-- One-time reconciliation: set sessions_used on active packages
-- to match the number of past booked sessions since package creation.
--
-- Run this once in the Supabase SQL Editor.
-- It only INCREASES sessions_used (never decreases a value that
-- the trainer has already manually set higher).
-- ============================================================

-- Step 1: Preview what will change (run this first to verify)
SELECT
  p.id                                AS package_id,
  p.client_id,
  p.sessions_total,
  p.sessions_used                     AS current_sessions_used,
  COUNT(b.id)                         AS booked_sessions_since_start,
  GREATEST(p.sessions_used, COUNT(b.id)::int) AS new_sessions_used
FROM packages p
LEFT JOIN bookings b
  ON  b.client_id  = p.client_id
  AND b.book_date  >= p.created_at::date   -- only sessions after package was created
  AND b.book_date  <  CURRENT_DATE         -- exclude today's future or in-progress session
  AND b.status     = 'booked'              -- 'booked' = session happened (not cancelled)
WHERE p.is_active = true
GROUP BY p.id, p.client_id, p.sessions_total, p.sessions_used
ORDER BY p.client_id;

-- Step 2: Apply the fix (uncomment when you're happy with the preview above)
/*
UPDATE packages p
SET sessions_used = sub.new_used
FROM (
  SELECT
    p2.id,
    GREATEST(p2.sessions_used, COUNT(b.id)::int) AS new_used
  FROM packages p2
  LEFT JOIN bookings b
    ON  b.client_id  = p2.client_id
    AND b.book_date  >= p2.created_at::date
    AND b.book_date  <  CURRENT_DATE
    AND b.status     = 'booked'
  WHERE p2.is_active = true
  GROUP BY p2.id, p2.sessions_used
) sub
WHERE p.id = sub.id
  AND sub.new_used <> p.sessions_used;  -- only touch rows that actually change
*/
