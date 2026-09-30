-- ============================================================================
-- Remote programs as weeks (W1D1, W1D2, W1D3, W2D1 ...).
-- A remote session's day_num is now the absolute program day (4 = W2D1), and
-- program_id ties it to the program so progress survives a package renewal.
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES workout_templates(id) ON DELETE SET NULL;

-- Step 1 (preview): old remote sessions and the day they will become.
SELECT s.client_id, s.session_date, s.day_num AS old_day_num,
       row_number() OVER (PARTITION BY s.client_id, p.program_id ORDER BY s.session_date, s.start_time_min, s.id) AS new_day_num
FROM sessions s
JOIN packages p ON p.client_id = s.client_id
WHERE p.delivery_mode = 'remote' AND p.program_id IS NOT NULL
  AND s.status <> 'cancelled'
  AND s.session_date >= p.start_date AND (p.end_date IS NULL OR s.session_date <= p.end_date)
ORDER BY s.client_id, s.session_date;

-- Step 2: tag old remote sessions with their program and renumber them in date
-- order (old 1,2,3,1,2 -> 1,2,3,4,5 = W1D1..W2D2). Only touches untagged rows, so
-- re-running never reshuffles sessions logged by the new app.
UPDATE sessions s SET program_id = r.program_id, day_num = r.rn
FROM (
  SELECT s.id, p.program_id,
         row_number() OVER (PARTITION BY s.client_id, p.program_id ORDER BY s.session_date, s.start_time_min, s.id) AS rn
  FROM sessions s
  JOIN packages p ON p.client_id = s.client_id
  WHERE p.delivery_mode = 'remote' AND p.program_id IS NOT NULL
    AND s.program_id IS NULL
    AND s.status <> 'cancelled'
    AND s.session_date >= p.start_date AND (p.end_date IS NULL OR s.session_date <= p.end_date)
) r
WHERE s.id = r.id;
