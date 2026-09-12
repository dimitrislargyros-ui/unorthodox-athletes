-- Feature request 2026-09-12: add a recurring Saturday Pilates class
-- (10:45-12:00, i.e. 75 min instead of the usual 90-min PT session).
-- schedule_slots previously assumed every slot is exactly 90 minutes
-- (SESS_MIN constant in the app) with no way to label what a slot is.
-- Add a per-slot duration_min (defaults to 90 so every existing slot keeps
-- behaving exactly as before) and an optional class_name used to label
-- non-standard classes in the booking grid.
--
-- For now any client with an active package can book Pilates — trainer
-- wants to decide later whether it needs its own package type.
ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS duration_min integer NOT NULL DEFAULT 90;
ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_name text;

-- day_of_week: 0=Mon ... 5=Sat. start_time_min: 10:45 = 645.
INSERT INTO schedule_slots (trainer_id, day_of_week, start_time_min, duration_min, class_name, is_active, is_public)
SELECT p.id, 5, 645, 75, 'Pilates', true, true
FROM profiles p
WHERE p.role = 'trainer'
  AND NOT EXISTS (
    SELECT 1 FROM schedule_slots s WHERE s.day_of_week = 5 AND s.start_time_min = 645 AND s.class_name = 'Pilates'
  )
LIMIT 1;
