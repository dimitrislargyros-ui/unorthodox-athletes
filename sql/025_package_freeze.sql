-- Package freeze (trainer puts a package on hold, e.g. injury/travel).
-- frozen_at = day the freeze started (null = not frozen); freeze_reason = trainer's note.
-- While frozen: no booking, no expiry reminders/auto-close. On unfreeze the app moves
-- end_date forward so the client keeps the time they had left when it was frozen.
-- Additive only: two nullable columns, existing rows untouched.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS frozen_at date;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS freeze_reason text;
