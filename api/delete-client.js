// Vercel Serverless Function — Trainer permanently deletes a client: all their data
// across every table, the profile row, and their Supabase Auth login. Same
// verify-caller-then-service-role-write pattern as delete-package.js/delete-session.js.
// Irreversible — the client UI gates this behind a type-the-name confirmation.
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
  const { client_id } = body;
  if (!client_id) return res.status(400).json({ error: 'client_id required' });

  const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!svcKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE not configured on server' });
  const svcHeaders = { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' };

  // Refuse to ever delete a non-client (e.g. the trainer account itself) even if a
  // wrong id somehow gets sent.
  const targetRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${client_id}&select=id,role`, { headers: svcHeaders });
  const targetRows = await targetRes.json().catch(() => []);
  const target = targetRows[0];
  if (!target) return res.status(404).json({ error: 'Client not found' });
  if (target.role !== 'client') return res.status(403).json({ error: 'Can only delete client accounts' });

  // exercises/session_notes are keyed by session_id, not client_id — collect this
  // client's session ids first so they don't get orphaned by the sessions delete below.
  const sessRes = await fetch(`${SUPABASE_URL}/rest/v1/sessions?client_id=eq.${client_id}&select=id`, { headers: svcHeaders });
  const sessRows = await sessRes.json().catch(() => []);
  const sessionIds = (sessRows || []).map(s => s.id);
  if (sessionIds.length > 0) {
    const idList = sessionIds.join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/exercises?session_id=in.(${idList})`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
    await fetch(`${SUPABASE_URL}/rest/v1/session_notes?session_id=in.(${idList})`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  }

  // Every other table that references this client directly.
  await fetch(`${SUPABASE_URL}/rest/v1/sessions?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/packages?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/personal_records?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/slot_requests?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/waitlist?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/cancel_requests?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?related_client_id=eq.${client_id}`, { method: 'DELETE', headers: svcHeaders }).catch(() => {});

  // Finally the profile row itself.
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${client_id}`, {
    method: 'DELETE',
    headers: { ...svcHeaders, Prefer: 'return=representation' },
  });
  if (!profRes.ok) {
    const txt = await profRes.text();
    return res.status(profRes.status).json({ error: txt });
  }
  const deletedProf = await profRes.json().catch(() => []);
  if (!Array.isArray(deletedProf) || deletedProf.length === 0) {
    return res.status(404).json({ error: 'Client not found or already deleted' });
  }

  // Remove their Supabase Auth login so they can never sign back in. Best-effort —
  // the data above is already gone either way, so a failure here is reported but
  // doesn't undo (and can't easily undo) the deletes already committed.
  let authDeleted = true;
  const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${client_id}`, {
    method: 'DELETE',
    headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` },
  }).catch(() => null);
  if (!authRes || !authRes.ok) authDeleted = false;

  return res.status(200).json({ ok: true, authDeleted });
}
