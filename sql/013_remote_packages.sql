-- Remote-client workout mode: additive columns only, existing rows unaffected.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'in_person';

DO $$ BEGIN
  ALTER TABLE packages ADD CONSTRAINT packages_delivery_mode_check
    CHECK (delivery_mode IN ('in_person','remote'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration_sec integer;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false;
