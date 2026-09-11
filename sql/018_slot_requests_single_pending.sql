-- Migration 018: enforce at most one PENDING custom-time request per client.
--
-- Bug found 2026-09-11: a client submitted 2-3 duplicate custom-time requests for
-- the same thing (no feedback that the first one was still awaiting the trainer, so
-- they assumed it hadn't gone through and tried again). The trainer approved one of
-- them; the other 1-2 stayed "pending" forever with no indication they were now
-- redundant — cluttering the Custom Time Requests panel, and nothing stopped the
-- trainer from later approving one of the leftover duplicates too, double-booking
-- the client. This mirrors the low_sessions dedup lesson: an app-level-only check
-- isn't enough, it needs to be impossible at the DB level, not just discouraged in
-- the UI (see also the ClientApp-side "wait for trainer to respond" guard).

-- Step 1: clean up any duplicate pending rows that already exist (exactly the state
-- the reported bug leaves behind) — keep only the most recent pending request per
-- client, mark the rest as superseded so they read clearly as "no longer relevant"
-- instead of silently disappearing or blocking the index below from being created.
UPDATE slot_requests sr
SET status = 'superseded'
WHERE status = 'pending'
  AND id NOT IN (
    SELECT DISTINCT ON (client_id) id
    FROM slot_requests
    WHERE status = 'pending'
    ORDER BY client_id, created_at DESC
  );

-- Step 2: make it impossible to insert a second pending row for the same client —
-- PostgREST surfaces a violation as a 409 with "duplicate key value violates unique
-- constraint" in the body, which ClientApp.jsx's handleSlotRequest already recognizes
-- and turns into a friendly "you already have a pending request" message.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_slot_request_per_client
  ON slot_requests(client_id)
  WHERE status = 'pending';
