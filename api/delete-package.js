// Vercel Serverless Function — Delete a package row (bypasses RLS with service key)
const SUPABASE_URL = 'https://hxyqvryuniqmvpjljrry.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { package_id } = body;
  if (!package_id) return res.status(400).json({ error: 'package_id required' });

  const svcKey = process.env.SUPABASE_SERVICE_KEY || SUPABASE_KEY;

  const r = await fetch(`${SUPABASE_URL}/rest/v1/packages?id=eq.${package_id}`, {
    method: 'DELETE',
    headers: {
      apikey: svcKey,
      Authorization: `Bearer ${svcKey}`,
      Prefer: 'return=minimal',
    },
  });

  if (!r.ok) {
    const txt = await r.text();
    return res.status(r.status).json({ error: txt });
  }

  return res.status(200).json({ ok: true });
}
