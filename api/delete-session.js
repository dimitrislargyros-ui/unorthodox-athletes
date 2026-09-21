// Vercel Serverless Function — Trainer deletes a single logged session (bypasses RLS
// with the service key, same verify-caller-then-service-role-write pattern as
// delete-package.js). Clients never see this endpoint or call it.
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

  const roleCheck = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerUser.id}&select=role`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${callerToken}` },
  }).catch(() => null);
  const roleRows = roleCheck && roleCheck.ok ? await roleCheck.json().catch(() => []) : [];
  if (roleRows[0]?.role !== 'trainer') return res.status(403).json({ error: 'Trainer role required' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const { session_id } = body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!svcKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE not configured on server' });
  const svcHeaders = { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' };

  // exercises/session_notes are keyed by session_id, not linked via a DB cascade —
  // must be removed first or the sessions delete below would leave them orphaned.
  await fetch(`${SUPABASE_URL}/rest/v1/exercises?session_id=eq.${session_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/session_notes?session_id=eq.${session_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});

  const r = await fetch(`${SUPABASE_URL}/rest/v1/sessions?id=eq.${session_id}`, {
    method: 'DELETE',
    headers: { ...svcHeaders, Prefer: 'return=representation' },
  });
  if (!r.ok) {
    const txt = await r.text();
    return res.status(r.status).json({ error: txt });
  }
  const deleted = await r.json().catch(() => []);
  if (!Array.isArray(deleted) || deleted.length === 0) {
    return res.status(404).json({ error: 'Session not found or already deleted' });
  }

  // sessions_used is derived (charge-at-completion) — it self-corrects to the real
  // count next time either app reconciles the package, no manual adjustment needed here.
  return res.status(200).json({ ok: true, deleted: deleted.length });
}
