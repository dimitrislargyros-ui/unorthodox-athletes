-- ============================================================================
-- UA App v2 migration
-- Run this whole file once in the Supabase SQL Editor (Project > SQL Editor).
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS / DROP POLICY IF EXISTS + CREATE POLICY everywhere).
-- ============================================================================

-- ── slot_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slot_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES profiles(id),
  requested_date date,
  requested_time_min int,
  note text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE slot_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients manage own requests" ON slot_requests;
CREATE POLICY "clients manage own requests" ON slot_requests
  FOR ALL USING (auth.uid() = client_id);
DROP POLICY IF EXISTS "trainers see all requests" ON slot_requests;
CREATE POLICY "trainers see all requests" ON slot_requests
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));

-- ── waitlist ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_id uuid REFERENCES schedule_slots(id),
  client_id uuid REFERENCES profiles(id),
  book_date date,
  position int,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients manage own waitlist entries" ON waitlist;
CREATE POLICY "clients manage own waitlist entries" ON waitlist
  FOR ALL USING (auth.uid() = client_id);
DROP POLICY IF EXISTS "trainers see all waitlist entries" ON waitlist;
CREATE POLICY "trainers see all waitlist entries" ON waitlist
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));

-- ── announcements ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid REFERENCES profiles(id),
  title text,
  body text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone authenticated can read announcements" ON announcements;
CREATE POLICY "anyone authenticated can read announcements" ON announcements
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "trainers manage announcements" ON announcements;
CREATE POLICY "trainers manage announcements" ON announcements
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));

-- ── notifications ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES profiles(id),
  type text,
  message text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clients manage own notifications" ON notifications;
CREATE POLICY "clients manage own notifications" ON notifications
  FOR ALL USING (auth.uid() = client_id);
DROP POLICY IF EXISTS "trainers manage all notifications" ON notifications;
CREATE POLICY "trainers manage all notifications" ON notifications
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));

-- ── workout_templates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid REFERENCES profiles(id),
  name text,
  exercises jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trainers manage own templates" ON workout_templates;
CREATE POLICY "trainers manage own templates" ON workout_templates
  FOR ALL USING (auth.uid() = trainer_id);

-- ── schedule_periods / period_slots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_periods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id uuid REFERENCES profiles(id),
  name text,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE schedule_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone authenticated can read periods" ON schedule_periods;
CREATE POLICY "anyone authenticated can read periods" ON schedule_periods
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "trainers manage periods" ON schedule_periods;
CREATE POLICY "trainers manage periods" ON schedule_periods
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));

CREATE TABLE IF NOT EXISTS period_slots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id uuid REFERENCES schedule_periods(id),
  day_of_week int,
  start_time_min int
);
ALTER TABLE period_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone authenticated can read period slots" ON period_slots;
CREATE POLICY "anyone authenticated can read period slots" ON period_slots
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "trainers manage period slots" ON period_slots;
CREATE POLICY "trainers manage period slots" ON period_slots
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'trainer'));

-- ── column additions ─────────────────────────────────────────────────────
ALTER TABLE packages ADD COLUMN IF NOT EXISTS paid boolean DEFAULT false;
ALTER TABLE session_notes ADD COLUMN IF NOT EXISTS rating int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- NOTE: this backfills every existing row's created_at to "now" (the moment
-- this migration runs), since there's no earlier record of real signup dates.
-- Existing members' "Member since" will show this migration's run date until
-- manually corrected per-row in the Supabase table editor if you want the
-- real historical date.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
