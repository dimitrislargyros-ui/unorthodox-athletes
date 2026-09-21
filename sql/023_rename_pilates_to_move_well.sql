-- Feature request 2026-09-21: rename the Saturday "Pilates" class to "Move Well".
-- Name change only — same slot, same time, same booking behavior. The app code
-- (isPilates() in sessionsMath.js) now matches class_name === 'Move Well'.
UPDATE schedule_slots SET class_name = 'Move Well' WHERE class_name = 'Pilates';
