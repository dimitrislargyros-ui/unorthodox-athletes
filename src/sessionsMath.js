// Shared charge-at-completion math for package session counting.
// Both ClientApp and TrainerApp must derive `sessions_used`/`reservedCount` the exact
// same way, or the two apps drift and fight over the counter every time either one opens
// a package (this happened once already — see git history). Import from here, don't
// re-implement the dedup-by-date logic locally.

// Grace window after a session's scheduled start before it auto-charges the package —
// gives the trainer/client room to log a last-minute cancellation before the no-show
// is treated as attended. Shared by the "used" count and the status-badge display so
// they never disagree about when a session flips to "completed".
export const COMPLETION_GRACE_MS = 90 * 60 * 1000;

// "Used" = distinct non-cancelled session/booking days (since package start) whose time
// has already passed (plus the grace window). Future/in-progress bookings are reserved,
// not yet charged.
export function computeCompletedUsed(pkg, sessions, bookings, nowMs) {
  if (!pkg) return 0;
  const start = pkg.start_date || (pkg.created_at ? String(pkg.created_at).slice(0, 10) : "");
  const byDate = {};
  const add = (date, min) => {
    if (!date) return;
    if (start && date < start) return;
    if (byDate[date] == null || min < byDate[date]) byDate[date] = min;
  };
  (sessions || []).forEach(s => { if (s.status !== "cancelled") add(s.session_date, s.start_time_min || 0); });
  (bookings || []).forEach(b => { add(b.book_date, b.schedule_slots?.start_time_min || 0); });
  let n = 0;
  for (const d in byDate) {
    const [y, mo, dy] = d.split('-').map(Number);
    const dt = new Date(y, mo - 1, dy, Math.floor(byDate[d] / 60), byDate[d] % 60, 0).getTime();
    if (dt + COMPLETION_GRACE_MS <= nowMs) n++;
  }
  return Math.min(n, pkg.sessions_total);
}

// Booked = distinct non-cancelled session/booking days (since package start), regardless of time.
export function computeReservedCount(pkg, sessions, bookings) {
  if (!pkg) return 0;
  const start = pkg.start_date || (pkg.created_at ? String(pkg.created_at).slice(0, 10) : "");
  const byDate = {};
  const add = (date) => { if (!date) return; if (start && date < start) return; byDate[date] = true; };
  (sessions || []).forEach(s => { if (s.status !== "cancelled") add(s.session_date); });
  (bookings || []).forEach(b => { add(b.book_date); });
  return Object.keys(byDate).length;
}
