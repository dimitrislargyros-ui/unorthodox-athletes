// Vercel Cron (vercel.json, daily ~07:00 Athens) — package expiry reminders and closing.
//
// Packages last exactly their weeks (end_date = last valid day, see isHardExpiry). Each run:
//   end_date = today + 7  -> "expires in a week, N sessions left" to client + trainer
//   end_date = today      -> "expires today" to client (plain) + trainer (with N left)
//   end_date < today      -> close it (reason "expired") and tell the trainer how many were lost
// Nobody has to open the app for any of this, hence a cron and not the client/trainer loads.
//
// Only Vercel Cron may call this: it sends `Authorization: Bearer $CRON_SECRET`.
import { computeCompletedUsed, HARD_EXPIRY_FROM, isHardExpiry } from '../src/sessionsMath.js';
import { sendOnePush } from './send-push.js';

const SUPABASE_URL = 'https://hxyqvryuniqmvpjljrry.supabase.co';

const athensISO = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Athens' });
const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n) => `${n} session${n === 1 ? '' : 's'}`;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (req.headers['authorization'] !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  const svcKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!svcKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });

  const H = { apikey: svcKey, Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' };
  const get = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H }).then(r => (r.ok ? r.json() : []));

  const now = Date.now();
  const today = athensISO(now);
  const in7 = athensISO(now + 7 * 86400000);
  const since = new Date(now - 20 * 3600000).toISOString(); // dedupe window for a re-run the same morning

  const pkgs = await get(`packages?is_active=eq.true&created_at=gte.${HARD_EXPIRY_FROM}&end_date=lte.${in7}&select=*`);
  const due = pkgs.filter(p => isHardExpiry(p) && (p.end_date === in7 || p.end_date <= today));
  if (!due.length) return res.status(200).json({ checked: pkgs.length, acted: 0 });

  const ids = [...new Set(due.map(p => p.client_id))].join(',');
  const [trainers, profiles] = await Promise.all([
    get('profiles?role=eq.trainer&select=id&limit=1'),
    get(`profiles?id=in.(${ids})&select=id,name`),
  ]);
  const trainerId = trainers[0]?.id;
  const nameOf = (id) => profiles.find(p => p.id === id)?.name || 'A client';

  const notify = async (clientId, type, message, dedupe) => {
    if (!clientId) return;
    if (dedupe) {
      const seen = await get(`notifications?client_id=eq.${clientId}&type=eq.${type}&created_at=gte.${since}&message=eq.${encodeURIComponent(message)}&select=id&limit=1`);
      if (seen.length) return;
    }
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ client_id: clientId, type, message, read: false }),
    }).catch(() => {});
    const subs = await get(`push_subscriptions?client_id=eq.${clientId}&select=subscription`);
    const seenEp = new Set();
    await Promise.allSettled(subs.map(s => s.subscription).filter(sub => sub?.endpoint && !seenEp.has(sub.endpoint) && seenEp.add(sub.endpoint))
      .map(sub => sendOnePush(sub, { title: 'Unorthodox Athletes', body: message, tag: 'ua-notification' })));
  };

  let acted = 0;
  for (const p of due) {
    const [sessions, bookings] = await Promise.all([
      get(`sessions?client_id=eq.${p.client_id}&select=session_date,start_time_min,status`),
      get(`bookings?client_id=eq.${p.client_id}&status=eq.booked&select=book_date,schedule_slots(start_time_min)`),
    ]);
    const used = computeCompletedUsed(p, sessions, bookings, now);
    const left = Math.max(0, p.sessions_total - used);
    const name = nameOf(p.client_id);

    if (p.end_date >= today && left === 0) continue; // already got "completed, renew"
    if (p.end_date === in7) {
      await notify(p.client_id, 'package_expiring', `⏳ Your package expires in 1 week (${fmt(p.end_date)}). You have ${plural(left)} left — book them in!`, true);
      await notify(trainerId, 'package_expiring', `⏳ ${name}'s package expires in 1 week (${fmt(p.end_date)}) with ${plural(left)} left.`, true);
      acted++;
    } else if (p.end_date === today) {
      await notify(p.client_id, 'package_expiring', `⏳ Your package expires today. Talk to your trainer about renewing 💪`, true);
      await notify(trainerId, 'package_expiring', `⏳ ${name}'s package expires today with ${plural(left)} left.`, true);
      acted++;
    } else {
      // Claim by matching is_active=true, so an overlapping run can't close + notify twice.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/packages?id=eq.${p.id}&is_active=eq.true`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=representation' },
        body: JSON.stringify({ is_active: false, deactivated_at: new Date(now).toISOString(), deactivation_reason: 'expired', sessions_used: used }),
      });
      const claimed = r.ok ? await r.json().catch(() => []) : [];
      if (!claimed.length) continue;
      const month = new Date(p.start_date + 'T12:00:00Z').toLocaleDateString('en-GB', { month: 'short' });
      await notify(trainerId, 'package_expired', left > 0
        ? `❌ ${name}'s ${month} package expired: ${plural(left)} lost. Renew to keep them training.`
        : `✅ ${name}'s ${month} package expired (all sessions used). Renew to keep them training.`);
      acted++;
    }
  }
  return res.status(200).json({ checked: pkgs.length, acted });
}
