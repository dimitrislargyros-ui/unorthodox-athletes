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

// Distinct non-cancelled session/booking days, deduped by date (earliest time wins),
// that have actually happened (time + grace window already passed) — unscoped by any
// package. Stats/history views need this too: a client who only ever self-books (never
// gets a trainer-logged `sessions` row) would otherwise be invisible in any view that
// only reads the `sessions` table, even though those days genuinely happened.
// Returns {session_date, start_time_min} items, sorted ascending — shaped like a
// `sessions` row's date/time fields so callers can treat them the same way.
export function completedItems(sessions, bookings, nowMs) {
  const byDate = {};
  const add = (date, min) => {
    if (!date) return;
    if (byDate[date] == null || min < byDate[date]) byDate[date] = min;
  };
  (sessions || []).forEach(s => { if (s.status !== "cancelled") add(s.session_date, s.start_time_min || 0); });
  (bookings || []).forEach(b => { add(b.book_date, b.schedule_slots?.start_time_min || 0); });
  const out = [];
  for (const date in byDate) {
    const min = byDate[date];
    const [y, mo, dy] = date.split('-').map(Number);
    const dt = new Date(y, mo - 1, dy, Math.floor(min / 60), min % 60, 0).getTime();
    if (dt + COMPLETION_GRACE_MS <= nowMs) out.push({ session_date: date, start_time_min: min });
  }
  return out.sort((a, b) => a.session_date.localeCompare(b.session_date));
}

// "Used" = distinct non-cancelled session/booking days (since package start) whose time
// has already passed (plus the grace window). Future/in-progress bookings are reserved,
// not yet charged.
//
// pkg.sessions_used_adjustment is a persistent manual correction (Adjust Package ->
// Override sessions used) layered on top of that raw count, not a one-off value written
// over it — a one-off gets silently recomputed and overwritten on the very next
// auto-settle, which is exactly the bug reported 2026-09-11 (a trainer forgiving one
// session as a credit had it revert the next time the client's card was reopened).
// Stored as a delta so it keeps applying no matter how many more real sessions complete
// afterward. Absent on older packages (undefined), which is equivalent to 0.
export function computeCompletedUsed(pkg, sessions, bookings, nowMs) {
  if (!pkg) return 0;
  const start = pkg.start_date || (pkg.created_at ? String(pkg.created_at).slice(0, 10) : "");
  const n = completedItems(sessions, bookings, nowMs).filter(it => !start || it.session_date >= start).length;
  const adjusted = n + (pkg.sessions_used_adjustment || 0);
  return Math.max(0, Math.min(adjusted, pkg.sessions_total));
}

// The Saturday Pilates class (sql/020_pilates_class_and_slot_duration.sql) sits outside
// the Personal Training Day 1/2/3 rotation entirely: it should never get a "Day N" label
// itself, and booking/completing it must not consume a slot in that rotation for other
// sessions either. Prefer class_name when a slot/booking object carries it (most
// accurate); `sessions` rows aren't linked to schedule_slots, so fall back to
// day-of-week + time — the only identifying info they have.
const PILATES_DOW = 5; // 0=Mon...6=Sun
const PILATES_START_MIN = 645; // 10:45
export function isPilates(item) {
  const cls = item?.class_name ?? item?.schedule_slots?.class_name;
  if (cls != null) return cls === 'Move Well';
  const dateStr = item?.session_date || item?.book_date;
  const startMin = item?.start_time_min ?? item?.schedule_slots?.start_time_min;
  if (dateStr == null || startMin == null) return false;
  const d = new Date(dateStr + "T12:00:00").getDay();
  return startMin === PILATES_START_MIN && (d === 0 ? 6 : d - 1) === PILATES_DOW;
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
