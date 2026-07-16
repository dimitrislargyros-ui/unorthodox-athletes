// Vercel Serverless Function — Web Push sender
// Uses VAPID (no external dependencies, pure Node.js crypto)

import crypto from 'crypto';

const VAPID_PUBLIC_KEY  = '0po93KkjqkM-PtBCBUeEAAbFCDKNWk1wUga7o3nxaBkbTnL1RMbinAUgy7_3INryEyOGq3JSYm8T_ziMBKZW7Q';
const VAPID_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgsZVpxdPpgzsoXMVG
BdNRzipid3IdBnjrFjq0H8+w+E2hRANCAATSmj3cqSOqQz4+0EIFR4QABsUIMo1a
TXBSBrujefFoGRtOcvVExuKcBSDLv/cg2vITI4arclJibxP/OIwEplbt
-----END PRIVATE KEY-----`;
const VAPID_SUBJECT = 'mailto:dimitrislargyros@gmail.com';
const SUPABASE_URL  = 'https://hxyqvryuniqmvpjljrry.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU';

// ── VAPID JWT ────────────────────────────────────────────────
function b64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeVapidJwt(endpoint) {
  const u = new URL(endpoint);
  const aud = `${u.protocol}//${u.host}`;
  const header  = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(Buffer.from(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 43200, sub: VAPID_SUBJECT,
  })));
  const toSign = `${header}.${payload}`;
  const sign   = crypto.createSign('SHA256');
  sign.update(toSign);
  const sig = sign.sign({ key: VAPID_PRIVATE_PEM, dsaEncoding: 'ieee-p1363' });
  return `${toSign}.${b64url(sig)}`;
}

// ── Send one thin push (no body — SW shows generic notification) ──
async function sendOnePush(sub) {
  const jwt  = makeVapidJwt(sub.endpoint);
  const auth = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: auth, TTL: '86400', 'Content-Length': '0' },
    });
    return { status: res.status, expired: res.status === 410 || res.status === 404, subId: sub.id };
  } catch (e) {
    return { error: e.message, subId: sub.id };
  }
}

// ── Handler ──────────────────────────────────────────────────
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

  const { client_id } = body;
  if (!client_id) return res.status(400).json({ error: 'client_id required' });

  // Fetch subscriptions for this client
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?client_id=eq.${client_id}&select=id,subscription`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const subs = await subRes.json();
  if (!Array.isArray(subs) || !subs.length) return res.status(200).json({ sent: 0 });

  // Send push to all subscriptions for this client
  const results = await Promise.allSettled(subs.map(s => sendOnePush(s.subscription ? { ...s.subscription, id: s.id } : null).catch(() => ({ error: 'invalid' }))));

  // Remove expired/invalid subscriptions
  const expiredIds = results
    .map((r, i) => (r.value?.expired ? subs[i].id : null))
    .filter(Boolean);
  if (expiredIds.length) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${expiredIds.join(',')})`,
      { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    ).catch(() => {});
  }

  const sent = results.filter(r => r.value && !r.value.error && !r.value.expired).length;
  return res.status(200).json({ sent, total: subs.length });
}
