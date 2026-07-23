-- Migration 011: Performance indexes + missing RLS policies
-- Run in Supabase SQL editor

-- ── Indexes ──────────────────────────────────────────────────
-- Speed up push notification lookups by client
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client_id
  ON push_subscriptions(client_id);

-- Speed up in-app notification queries (client badge count, panel load)
CREATE INDEX IF NOT EXISTS idx_notifications_client_id
  ON notifications(client_id);

-- Speed up unread badge count
CREATE INDEX IF NOT EXISTS idx_notifications_client_read
  ON notifications(client_id, read);

-- Speed up cancel_request lookups (trainer panel, client history)
CREATE INDEX IF NOT EXISTS idx_cancel_requests_trainer_status
  ON cancel_requests(trainer_id, status);

CREATE INDEX IF NOT EXISTS idx_cancel_requests_client_status
  ON cancel_requests(client_id, status);

-- Speed up package history queries per client
CREATE INDEX IF NOT EXISTS idx_packages_client_id
  ON packages(client_id);

CREATE INDEX IF NOT EXISTS idx_packages_client_active
  ON packages(client_id, is_active);

-- ── Missing RLS policies ──────────────────────────────────────

-- cancel_requests: clients should be able to delete their own resolved requests
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='cancel_requests' AND policyname='Clients can delete own cancel requests'
  ) THEN
    CREATE POLICY "Clients can delete own cancel requests"
      ON cancel_requests FOR DELETE
      USING (auth.uid() = client_id);
  END IF;
END $$;

-- push_subscriptions: clients manage their own subscriptions
-- (INSERT and DELETE — SELECT/UPDATE already handled via service key in API)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='push_subscriptions' AND policyname='Clients insert own push sub'
  ) THEN
    CREATE POLICY "Clients insert own push sub"
      ON push_subscriptions FOR INSERT
      WITH CHECK (auth.uid() = client_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='push_subscriptions' AND policyname='Clients delete own push sub'
  ) THEN
    CREATE POLICY "Clients delete own push sub"
      ON push_subscriptions FOR DELETE
      USING (auth.uid() = client_id);
  END IF;
END $$;

-- notifications: clients can mark their own as read (UPDATE read column)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='notifications' AND policyname='Clients update own notifications'
  ) THEN
    CREATE POLICY "Clients update own notifications"
      ON notifications FOR UPDATE
      USING (auth.uid() = client_id)
      WITH CHECK (auth.uid() = client_id);
  END IF;
END $$;

-- notifications: clients can delete their own notifications
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='notifications' AND policyname='Clients delete own notifications'
  ) THEN
    CREATE POLICY "Clients delete own notifications"
      ON notifications FOR DELETE
      USING (auth.uid() = client_id);
  END IF;
END $$;
