// Vercel Serverless Function — Client self-logs a completed remote workout.
// Clients have no INSERT policy on `sessions`/`exercises` (only the trainer writes those
// today), so this bypasses RLS with the service key — same pattern as delete-package.js.
const SUPABASE_URL = 'https://hxyqvryuniqmvpjljrry.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const authHeader = req.headers['authorization'] || '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!callerToken) return res.status(401).json({ error: 'Missing Authorization header' });
  const userCheck = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${callerToken}` },
  }).catch(() => null);
  if (!userCheck || !userCheck.ok) return res.status(401).json({ error: 'Invalid token' });
  const callerUser = await userCheck.json().catch(() => null);
  if (!callerUser?.id) return res.status(401).json({ error: 'Invalid token' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const { package_id, day_num, session_date, start_time_min, duration_sec, checklist } = body;
  if (!package_id || !day_num || !session_date) {
    return res.status(400).json({ error: 'package_id, day_num, session_date required' });
  }

  const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!svcKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE not configured on server' });

  // Verify this package belongs to the caller AND is actually a remote package —
  // stops an in-person client from using this endpoint to charge themselves a session
  // without going through the booking flow.
  const pkgRes = await fetch(
    `${SUPABASE_URL}/rest/v1/packages?id=eq.${package_id}&select=id,client_id,delivery_mode,is_active`,
    { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } }
  );
  const pkgRows = await pkgRes.json().catch(() => []);
  const pkg = pkgRows[0];
  if (!pkg || pkg.client_id !== callerUser.id) return res.status(403).json({ error: 'Package not found or not yours' });
  if (pkg.delivery_mode !== 'remote') return res.status(403).json({ error: 'Not a remote package' });
  if (!pkg.is_active) return res.status(403).json({ error: 'Package is not active' });

  // Single-trainer gym assumption already used elsewhere in this app (see getTrainerProfile).
  const trainerRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.trainer&select=id&limit=1`, {
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
  });
  const trainerRows = await trainerRes.json().catch(() => []);
  const trainerId = trainerRows[0]?.id;
  if (!trainerId) return res.status(500).json({ error: 'No trainer profile found' });

  const sessRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
    method: 'POST',
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      client_id: callerUser.id,
      trainer_id: trainerId,
      session_date,
      start_time_min: start_time_min ?? 0,
      day_num,
      status: 'completed',
      duration_sec: duration_sec ?? null,
    }),
  });
  if (!sessRes.ok) {
    const txt = await sessRes.text().catch(() => '');
    return res.status(sessRes.status).json({ error: txt });
  }

  // The session row is already committed at this point — a hiccup in anything below
  // (parsing the response, the exercises insert) must NOT turn a successful save into
  // a reported failure to the client.
  let sessionId = null;
  try {
    const created = await sessRes.json();
    sessionId = (Array.isArray(created) ? created[0] : created)?.id;
  } catch {}

  if (Array.isArray(checklist) && checklist.length > 0 && sessionId) {
    await fetch(`${SUPABASE_URL}/rest/v1/exercises`, {
      method: 'POST',
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(
        checklist.map((c, i) => ({ session_id: sessionId, order_index: i, name: c.name, done: !!c.done }))
      ),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true, session_id: sessionId });
}
