-- Cancel Requests table
-- Stores client requests to cancel a session that is within 48 hours
-- Trainer can accept (booking gets cancelled) or decline

CREATE TABLE IF NOT EXISTS public.cancel_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trainer_id    UUID NOT NULL,
  booking_id    UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  book_date     DATE NOT NULL,
  start_time_min INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | declined
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.cancel_requests ENABLE ROW LEVEL SECURITY;

-- Client can insert their own requests
CREATE POLICY "clients_insert_cancel_requests"
  ON public.cancel_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = client_id);

-- Both client and trainer can read
CREATE POLICY "client_trainer_read_cancel_requests"
  ON public.cancel_requests FOR SELECT TO authenticated
  USING (auth.uid() = client_id OR auth.uid() = trainer_id);

-- Trainer can update status (accept/decline)
CREATE POLICY "trainer_update_cancel_requests"
  ON public.cancel_requests FOR UPDATE TO authenticated
  USING (auth.uid() = trainer_id);

-- Also allow trainers to insert notifications for clients (needed for cancel request responses)
-- Run this if not already done:
CREATE POLICY IF NOT EXISTS "trainers_can_notify_clients"
  ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'trainer'
    )
  );
