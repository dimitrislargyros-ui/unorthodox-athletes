// Vercel Serverless Function — materializes `sessions` rows for a client's completed
// self-booked slots (bookings table) that never got a trainer-logged `sessions` row.
//
// Why this exists: package "sessions used" counting (sessionsMath.js) already merges
// bookings-table attendance so a self-booking client isn't shortchanged on their
// package — but every UI that lists actual session history (Profile "Session History",
// Schedule's past-day view) reads only the `sessions` table. A client who only ever
// self-books (never gets a session logged by the trainer) was therefore invisible in
// their own history, and had no session_id to attach a Notes entry to.
//
// Clients have no INSERT policy on `sessions` (only the trainer writes those today),
// so this bypasses RLS with the service key — same pattern as log-remote-workout.js.
// Idempotent: safe to call on every app load, never creates a duplicate row for a date
// that already has one.
import { completedItems } from '../src/sessionsMath.js';

const SUPABASE_URL = 'https://hxyqvryuniqmvpjljrry.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Verify caller is a valid Supabase user — identity always comes from the token,
  // never from the request body, so this can only ever backfill the caller's OWN history.
  const authHeader = req.headers['authorization'] || '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!callerToken) return res.status(401).json({ error: 'Missing Authorization header' });
  const userCheck = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${callerToken}` },
  }).catch(() => null);
  if (!userCheck || !userCheck.ok) return res.status(401).json({ error: 'Invalid token' });
  const callerUser = await userCheck.json().catch(() => null);
  if (!callerUser?.id) return res.status(401).json({ error: 'Invalid token' });

  const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!svcKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE not configured on server' });
  const svcHeaders = { apikey: svcKey, Authorization: `Bearer ${svcKey}` };

  // Independently re-derive "which days genuinely happened" server-side — never trust
  // the request body for this — using the exact same completedItems() math the client
  // and trainer apps use for package counting, so this can never disagree with what
  // already silently "used" a package session.
  const [trainerRes, sessRes, bookRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.trainer&select=id&limit=1`, { headers: svcHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/sessions?client_id=eq.${callerUser.id}&status=neq.cancelled&select=id,session_date,start_time_min`, { headers: svcHeaders }),
    fetch(`${SUPABASE_URL}/rest/v1/bookings?client_id=eq.${callerUser.id}&status=eq.booked&select=book_date,schedule_slots(start_time_min)`, { headers: svcHeaders }),
  ]);
  if (!trainerRes.ok || !sessRes.ok || !bookRes.ok) return res.status(502).json({ error: 'Lookup failed' });
  const trainerRows = await trainerRes.json().catch(() => []);
  const trainerId = trainerRows[0]?.id;
  if (!trainerId) return res.status(500).json({ error: 'No trainer profile found' });
  const existingSessions = await sessRes.json().catch(() => []);
  const bookings = await bookRes.json().catch(() => []);

  const existingDates = new Set(existingSessions.map(s => s.session_date));
  const completed = completedItems(existingSessions, bookings, Date.now());
  const missing = completed.filter(c => !existingDates.has(c.session_date));
  if (!missing.length) return res.status(200).json({ created: 0 });

  const spwRes = await fetch(
    `${SUPABASE_URL}/rest/v1/packages?client_id=eq.${callerUser.id}&order=created_at.desc&limit=1&select=sessions_per_week`,
    { headers: svcHeaders }
  );
  const spwRows = spwRes.ok ? await spwRes.json().catch(() => []) : [];
  const spw = spwRows[0]?.sessions_per_week || 3;

  // day_num follows the same convention TrainerApp uses when manually logging a single
  // session (count of prior non-cancelled sessions, mod spw) — walk missing days in
  // chronological order so a multi-day backfill numbers them sequentially. Best-effort
  // only: every read path recomputes the displayed Day badge dynamically from position
  // in the full sessions list, so this stored value rarely matters in practice.
  let priorCount = existingSessions.length;
  const rows = missing.map(m => {
    priorCount += 1;
    return {
      client_id: callerUser.id,
      trainer_id: trainerId,
      session_date: m.session_date,
      start_time_min: m.start_time_min,
      day_num: ((priorCount - 1) % spw) + 1,
      status: 'completed',
    };
  });

  const insRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
    method: 'POST',
    headers: { ...svcHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
  if (!insRes.ok) {
    const txt = await insRes.text().catch(() => '');
    return res.status(insRes.status).json({ error: txt });
  }
  const created = await insRes.json().catch(() => []);
  return res.status(200).json({ created: created.length });
}
