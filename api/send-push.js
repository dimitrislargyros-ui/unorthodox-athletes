// Vercel Serverless Function — Web Push sender
// VAPID + AES-128-GCM payload encryption (RFC 8291), pure Node.js crypto

import crypto from 'crypto';

const VAPID_PUBLIC_KEY  = 'BNKaPdypI6pDPj7QQgVHhAAGxQgyjVpNcFIGu6N58WgZG05y9UTG4pwFIMu_9yDa8hMjhqtyUmJvE_84jASmVu0';
const VAPID_PRIVATE_PEM = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgsZVpxdPpgzsoXMVG
BdNRzipid3IdBnjrFjq0H8+w+E2hRANCAATSmj3cqSOqQz4+0EIFR4QABsUIMo1a
TXBSBrujefFoGRtOcvVExuKcBSDLv/cg2vITI4arclJibxP/OIwEplbt
-----END PRIVATE KEY-----`;
const VAPID_SUBJECT = 'mailto:dimitrislargyros@gmail.com';
const SUPABASE_URL  = 'https://hxyqvryuniqmvpjljrry.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU';

// ── Helpers ──────────────────────────────────────────────────
function b64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(s) {
  const pad = s + '='.repeat((4 - s.length % 4) % 4);
  return Buffer.from(pad.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// HKDF-Extract + Expand (single round, SHA-256)
function hkdf(salt, ikm, info, length) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk)
    .update(Buffer.concat([Buffer.isBuffer(info) ? info : Buffer.from(info), Buffer.from([1])]))
    .digest()
    .slice(0, length);
}

// ── RFC 8291 payload encryption (aes128gcm) ──────────────────
function encryptPayload(sub, payload) {
  if (!sub.keys?.p256dh || !sub.keys?.auth) return null;
  try {
    const recipientPub = fromB64url(sub.keys.p256dh); // 65 bytes
    const authSecret   = fromB64url(sub.keys.auth);   // 16 bytes

    // Ephemeral sender ECDH key pair
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const senderPub    = ecdh.getPublicKey();          // 65 bytes uncompressed
    const sharedSecret = ecdh.computeSecret(recipientPub);

    // IKM: HKDF(salt=authSecret, IKM=sharedSecret, info="WebPush: info\0"+recvPub+sendPub, len=32)
    const ikm = hkdf(
      authSecret, sharedSecret,
      Buffer.concat([Buffer.from('WebPush: info\x00'), recipientPub, senderPub]),
      32
    );

    const salt = crypto.randomBytes(16);
    const cek   = hkdf(salt, ikm, 'Content-Encoding: aes128gcm\x00', 16);
    const nonce = hkdf(salt, ikm, 'Content-Encoding: nonce\x00', 12);

    // Plaintext + 0x02 padding delimiter
    const plain = Buffer.concat([
      Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload), 'utf8'),
      Buffer.from([0x02])
    ]);

    const cipher     = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

    // aes128gcm header: salt(16) + rs(4 BE) + idlen(1) + senderPub(65)
    const header = Buffer.alloc(86);
    salt.copy(header, 0);
    header.writeUInt32BE(4096, 16);
    header.writeUInt8(65, 20);
    senderPub.copy(header, 21);

    return Buffer.concat([header, ciphertext]);
  } catch (e) {
    return null; // fallback to thin push
  }
}

// ── VAPID JWT ────────────────────────────────────────────────
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

// ── Send one push ────────────────────────────────────────────
async function sendOnePush(sub, pushPayload) {
  const jwt  = makeVapidJwt(sub.endpoint);
  const auth = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

  let reqBody    = null;
  let extraHdrs  = { 'Content-Length': '0' };

  if (pushPayload) {
    const encrypted = encryptPayload(sub, pushPayload);
    if (encrypted) {
      reqBody   = encrypted;
      extraHdrs = {
        'Content-Type':     'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length':   String(encrypted.length),
      };
    }
  }

  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: auth, TTL: '86400', ...extraHdrs },
      body: reqBody,
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
  if (req.method === 'GET') return res.status(200).json({ ok: true, ts: Date.now() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { client_id, title, body: msgBody } = body;
  if (!client_id) return res.status(400).json({ error: 'client_id required' });

  // Fetch all subscriptions for this client
  const subRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?client_id=eq.${client_id}&select=id,subscription`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  const subs = await subRes.json();
  if (!Array.isArray(subs) || !subs.length) return res.status(200).json({ sent: 0 });

  // ── Deduplicate by endpoint — keep only one push per unique device ──
  const seen      = new Set();
  const dupIds    = [];   // rows to delete (duplicates)
  const uniqueSubs = [];
  for (const s of subs) {
    const ep = s.subscription?.endpoint;
    if (!ep) { dupIds.push(s.id); continue; }
    if (seen.has(ep)) { dupIds.push(s.id); continue; } // duplicate — mark for deletion
    seen.add(ep);
    uniqueSubs.push({ ...s.subscription, id: s.id });
  }

  // Clean up duplicate rows (async, fire-and-forget)
  if (dupIds.length) {
    fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${dupIds.join(',')})`,
      { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    ).catch(() => {});
  }

  // Build payload with the actual message so notification shows the text
  const pushPayload = (title || msgBody) ? {
    title: title || 'Unorthodox Athletes',
    body:  msgBody || '📬 New message.',
    tag:   'ua-notification',
  } : null;

  const results = await Promise.allSettled(
    uniqueSubs.map(sub => sendOnePush(sub, pushPayload).catch(() => ({ error: 'failed' })))
  );

  // Remove expired / invalid subscriptions
  const expiredIds = results
    .map((r, i) => (r.value?.expired ? uniqueSubs[i].id : null))
    .filter(Boolean);
  if (expiredIds.length) {
    fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${expiredIds.join(',')})`,
      { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    ).catch(() => {});
  }

  const sent = results.filter(r => r.value && !r.value.error && !r.value.expired).length;
  return res.status(200).json({ sent, total: uniqueSubs.length });
}
