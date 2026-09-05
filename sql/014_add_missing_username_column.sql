-- Bug found 2026-09-06: signup (ClientApp.jsx handleSignUp) has PATCHed
-- profiles.username since the "Major UX update" commit (2026-07-14), but the
-- column was never added to the DB. Every signup's profile PATCH has been
-- failing outright with "column profiles.username does not exist" (not the
-- username-collision the retry logic assumed) — new clients are left with
-- the DB trigger's placeholder name/initials and no phone saved. Confirmed
-- 29 affected client accounts since 2026-07-08.
-- Additive only, existing rows unaffected.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;

-- Enforce the uniqueness the app's collision-retry logic already assumes.
-- Multiple NULLs are allowed under a plain UNIQUE constraint, so this is
-- safe even though every existing row currently has username = NULL.
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
