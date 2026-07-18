# Unorthodox Athletes — Claude Handoff Context

> **Give this file to a new Claude conversation** so it has full context to continue development without starting from scratch.
> Last updated: July 2026

---

## 1. What This App Is

**Unorthodox Athletes** is a mobile-first Progressive Web App (PWA) for a personal training gym. It has two completely separate apps sharing the same codebase:

- **Client app** — accessed via the root URL (`/`). Clients book sessions, view their workout program, track PRs, see announcements, get push notifications.
- **Trainer app** — accessed via `/trainer`. The trainer manages clients, logs sessions, creates packages, manages the weekly schedule, posts announcements.

The app is deployed on **Vercel** (auto-deploy from GitHub push to `master`).

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, JSX (no TypeScript) |
| Backend / DB | Supabase (PostgreSQL + Realtime WebSocket) |
| Auth | Supabase Auth (email/password, JWT) |
| Serverless API | Vercel Functions (`/api/` folder) |
| Push Notifications | Web Push API + VAPID, RFC 8291 AES-128-GCM encryption |
| Service Worker | `/public/sw.js` (push events + notification clicks) |
| Fonts | Google Fonts — Oswald (headings), Inter (body, via system stack) |
| Styling | 100% inline React styles. No CSS framework. |
| Package manager | npm |

**No `@supabase/supabase-js`** — all API calls are raw `fetch()` calls to the Supabase REST and Auth endpoints. Deliberate choice to keep bundle size tiny.

---

## 3. Repository Structure

```
/
├── api/
│   └── send-push.js          ← Vercel serverless function: sends Web Push notifications
├── public/
│   ├── sw.js                 ← Service worker (push + click handling)
│   ├── logo.png              ← App logo
│   ├── icon-192.png          ← PWA icon
│   └── manifest.json         ← PWA manifest
├── sql/
│   ├── 001_v2_migration.sql  ← Main schema migration (run once in Supabase SQL editor)
│   ├── 002_bookings_capacity_read.sql
│   ├── 003_bookings_rebook_after_cancel.sql
│   ├── 004_trainer_manage_bookings.sql
│   ├── 005_package_program_link.sql
│   ├── 006_bugfixes_signup_and_program_visibility.sql
│   ├── 007_signup_notifies_trainer.sql
│   └── 008_cancel_requests.sql
├── src/
│   ├── main.jsx              ← Entry point. URL routing: /trainer → TrainerApp, else → ClientApp
│   ├── ClientApp.jsx         ← ALL client-side UI (~2400 lines, single file)
│   ├── TrainerApp.jsx        ← ALL trainer-side UI (~2000+ lines, single file)
│   ├── ExercisePicker.jsx    ← Autocomplete exercise search component (shared)
│   ├── exerciseList.js       ← Static list of exercise names
│   └── index.css             ← Minimal global CSS (body bg, .ua-app max-width centering)
├── index.html                ← Single HTML entry (PWA meta, manifest link)
├── vite.config.js            ← Vite config (@vitejs/plugin-react)
├── vercel.json               ← Vercel SPA rewrite: all non-/api/* → /index.html
└── package.json              ← React 19 + Vite 8, no supabase-js
```

---

## 4. Routing

**`src/main.jsx`** — URL-based routing, not React Router:
```js
const path = window.location.pathname;
const isTrainer = path.startsWith('/trainer');
// renders <TrainerApp/> or <ClientApp/>
```

**Auth storage (separate keys):**
- Client: `localStorage.getItem("ua_client_auth")` → `{ access_token, user: { id } }`
- Trainer: `localStorage.getItem("ua_trainer_auth")` → same shape

The `role` field in the DB is NOT used for routing — it's purely URL-based. Anyone at `/trainer` sees the trainer app (the login screen enforces trainer-only access).

---

## 5. Supabase Configuration

```
Project URL:  https://hxyqvryuniqmvpjljrry.supabase.co
Anon Key:     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU
```

Both constants are hardcoded at the top of `ClientApp.jsx` and `TrainerApp.jsx` as `SB_URL` / `SB_KEY`.

---

## 6. Database Schema

### Core Tables

| Table | Key Columns | Notes |
|---|---|---|
| `profiles` | `id` (= auth.users.id), `name`, `email`, `role` ('client'/'trainer'), `initials`, `avatar_url`, `phone`, `created_at` | One per user |
| `packages` | `id`, `client_id`, `trainer_id`, `sessions_total`, `sessions_used`, `sessions_per_week`, `weeks`, `is_active`, `paid`, `workout_template_id` (FK), `start_date` | Active = `is_active=true` |
| `sessions` | `id`, `client_id`, `trainer_id`, `session_date`, `start_time_min`, `status` ('upcoming'/'completed'/'cancelled'), `day_num` | Logged training sessions |
| `session_notes` | `session_id`, `trainer_note`, `client_note`, `rating`, `updated_at` | 1:1 with sessions |
| `exercises` | `session_id`, `name`, `sets`, `reps`, `weight`, `order_index` | Per-session exercise log |
| `personal_records` | `client_id`, `exercise`, `weight`, `unit`, `reps`, `record_date` | PRs per client |
| `schedule_slots` | `trainer_id`, `day_of_week` (0=Mon,6=Sun), `start_time_min` (mins from midnight), `is_active` | Regular weekly slots |
| `bookings` | `slot_id`, `client_id`, `book_date`, `status` ('booked'/'cancelled') | Client slot reservations |
| `workout_templates` | `trainer_id`, `name`, `exercises` (jsonb), `created_at` | Reusable workout programs |

### v2 Tables

| Table | Key Columns | Notes |
|---|---|---|
| `slot_requests` | `client_id`, `requested_date`, `requested_time_min`, `note`, `status` ('pending'/'approved'/'rejected') | Client requests for custom slots |
| `waitlist` | `slot_id`, `client_id`, `book_date`, `position` | Waitlist when slot is full (GYM_CAP=8) |
| `announcements` | `trainer_id`, `title`, `body`, `created_at` | Trainer broadcasts to clients |
| `notifications` | `client_id`, `type`, `message`, `read` (bool), `created_at` | In-app notification bell |
| `schedule_periods` | `trainer_id`, `name`, `start_date`, `end_date` | Date-range overrides for schedule |
| `period_slots` | `period_id`, `day_of_week`, `start_time_min` | Which slots active during a period |
| `push_subscriptions` | `client_id`, `subscription` (jsonb Web Push object), `created_at` | Browser push subscriptions |
| `cancel_requests` | `client_id`, `trainer_id`, `booking_id`, `book_date`, `start_time_min`, `status` | Late cancellation requests (within 48h) |

### Time format
All times stored as **minutes from midnight**:
- `480` = 08:00, `540` = 09:00, `1020` = 17:00
- `toTime(min)` → "HH:MM" string helper in both files

### Workout templates exercises format
```json
[
  { "day": 1, "exercises": [{ "name": "Squat", "sets": "4", "reps": "8", "weight": "80kg" }] },
  { "day": 2, "exercises": [...] },
  { "day": 3, "exercises": [...] }
]
```

---

## 7. Push Notifications System

### VAPID Keys (in `api/send-push.js` — keep secret)
```
Public:  BNKaPdypI6pDPj7QQgVHhAAGxQgyjVpNcFIGu6N58WgZG05y9UTG4pwFIMu_9yDa8hMjhqtyUmJvE_84jASmVu0
Private: in send-push.js (PEM format)
Subject: mailto:dimitrislargyros@gmail.com
```

### Registration flow (ClientApp)
1. App loads → `registerPush()` called if `Notification.permission === 'granted'`
2. Service worker subscribes → `savePushSub()` POSTs to `push_subscriptions`
3. Dedup: `localStorage` stores endpoint, `sessionStorage` stores session flag — avoids re-saving same subscription every page load

### `POST /api/send-push` API
```json
// Send to specific client:
{ "client_id": "uuid", "title": "...", "body": "..." }

// Broadcast to ALL clients:
{ "broadcast": true, "title": "...", "body": "..." }
```
`GET /api/send-push` → health check.

The serverless function:
- Fetches subscriptions from Supabase
- Deduplicates by endpoint (cleans up duplicate rows)
- Encrypts payload with RFC 8291 AES-128-GCM
- Signs with VAPID JWT
- Removes expired/410 subscriptions

### All notification triggers

**From TrainerApp → `postNotification(data, token)`:**
| Type | When |
|---|---|
| `package_renewed` | New package assigned to client |
| `low_sessions` | Sessions remaining ≤ 2 (auto on package create) |
| `payment_confirmed` | Trainer marks package paid |
| `payment_reminder` | Trainer manually sends reminder |
| `session_cancelled` | Trainer cancels a session |
| `session_scheduled` | Trainer manually books session for client |
| `slot_request_approved` | Slot request approved |
| `slot_request_rejected` | Slot request rejected |
| `cancel_accepted` | Late cancel request approved |
| `cancel_declined` | Late cancel request declined |

**Announcements (TrainerApp broadcast):**
```js
// After postAnnouncement succeeds:
fetch('/api/send-push', { body: JSON.stringify({ broadcast: true, title: '📣 '+title, body }) })
```

**From ClientApp:**
| Type | When |
|---|---|
| `cancel_request` (to trainer) | Client requests late cancellation (within 48h window) — sends push TO TRAINER |

---

## 8. Design System

### Theme Engine (ClientApp only)
```js
const THEMES = {
  cyber:   { bg:"#0A0A0A", surface:"#161616", surface2:"#252525", cyan:"#00C9E1", pink:"#E8197A", ... },
  electric:{ ... cyan:"#4361EE", pink:"#F72585" ... },
  emerald: { ... cyan:"#10B981", pink:"#F43F5E" ... },
  violet:  { ... cyan:"#8B5CF6", pink:"#EC4899" ... },
  gold:    { ... cyan:"#F59E0B", pink:"#EF4444" ... },
};
const THEME_KEY = "ua_theme";
const C = getTheme(); // loaded once at module init
```

TrainerApp is always hardcoded cyber theme.

### Standard color tokens (cyber)
```
C.bg      = "#0A0A0A"  — page background
C.surface = "#161616"  — card surface
C.surface2= "#252525"  — inputs, secondary surfaces
C.cyan    = "#00C9E1"  — primary accent
C.pink    = "#E8197A"  — secondary accent / danger
C.white   = "#FFFFFF"
C.muted   = "#666666"  — secondary text
C.border  = "#2A2A2A"
C.green   = "#22C55E"  — success
C.amber   = "#F59E0B"  — warning
```

### Shared UI components
- `GBtn` — gradient (cyan→pink) or ghost button
- `Card` — glassmorphism card (`backdrop-filter: blur(10px)`)
- `SL` — section label (10px, uppercase, spaced, muted, Oswald)
- `Spinner` — animated conic-gradient spinner with pulsing logo
- `Empty` — empty state message
- `UaToast` — bottom-fixed toast (green/pink)
- `UaConfirm` — confirmation modal dialog
- `UaPrompt` — text input modal dialog
- `Avatar` — user avatar image or initials circle
- `StatusBadge` — colored pill badge (Upcoming/Booked/Completed/Cancelled)

---

## 9. Client App Screens (`ClientApp.jsx`)

### Screen routing
```js
switch(screen) {
  case "home":          return <HomeScreen .../>
  case "schedule":      return <ScheduleScreen .../>
  case "announcements": return <AnnouncementsScreen .../>
  case "profile":       return <ProfileScreen .../>
}
```
BottomNav: Home / Schedule / News / Profile (4 tabs).

### HomeScreen
- Welcome header, notification bell badge (opens `NotifPanel`)
- Active package card: sessions left, progress bar, low-sessions alert
- Upcoming session card (next booked/upcoming session)
- WOD preview (today's workout day + exercise count from template)
- Quick-book for today's available slots
- Recent PRs strip
- Real-time updates via Supabase Realtime WebSocket

### ScheduleScreen
- Week strip (Mon–Sun) date selector
- Per-day time slots with booking counts vs GYM_CAP (8)
- States: Available / Full / Booked (yours) / Past
- Book / Cancel buttons
- Within 48h: cancel → `CancelRequestSheet` (sends request, doesn't auto-cancel)
- Waitlist: if full, can join, shows queue position
- "Request custom slot" button

### AnnouncementsScreen
- List of trainer announcements (reverse chronological)
- New announcements badge on BottomNav (tracked via `localStorage["ua_ann_seen"]`)

### ProfileScreen
- Avatar upload (Supabase Storage `avatars/` bucket, upsert)
- Name, email, @handle (auto-generated from name), phone, member since
- Edit phone number inline
- Active package: name, sessions, days/week, progress
- Personal Records CRUD
- Session history (last 3, "View more" expands full sheet)
- App theme switcher (5 themes, instant reload)
- 🔔/🔕 bell icon top-right → opens `NotifBellSheet` for push settings

### Key client components
- `ImportantEventModal` — full-screen modal for payment_confirmed / package_renewed / payment_reminder (shows on load if unread, also fires from Realtime INSERT)
- `SwipeNotifRow` — notification row: swipe left → snap open, red 🗑 appears behind, tap to delete. Right swipe closes. No auto-delete.
- `NotifPanel` — bottom sheet with all unread notifications + "Delete All"
- `NotifBellSheet` — notification settings (Enable / Refresh / status display)
- `CancelRequestSheet` — late cancellation flow (sends to trainer)
- `SessionSheet` — session detail view
- `WODSheet` — workout of day bottom sheet

### Realtime subscriptions (after login)
```js
rt.subscribe('notifications', 'INSERT', `client_id=eq.${userId}`, handler)
rt.subscribe('packages', 'UPDATE', `client_id=eq.${userId}`, handler)
rt.subscribe('sessions', '*', `client_id=eq.${userId}`, handler)
rt.subscribe('bookings', '*', `client_id=eq.${userId}`, handler)
```
Custom minimal Phoenix WebSocket implementation in `makeRealtime()` — no supabase-js.

---

## 10. Trainer App Screens (`TrainerApp.jsx`)

### TodayScreen
- Today's header with date
- New client setup nudges (clients without packages, within 14 days of joining)
- Sessions by time slot (sessions + bookings merged, deduped by client)
- "View →" opens `ClientDetailSheet`
- Announcements section: post (title + body), delete — broadcasts push to all clients on post

### ClientsScreen
- Searchable client list with package progress, sessions left, current day number
- Low-sessions warning (pink border when ≤ 2 left)
- Tap → `ClientDetailSheet`

### ClientDetailSheet (bottom sheet, full-featured)
- Client avatar, name, email, phone, member since
- Package progress (sessions used/total, days/week, start date)
- **Package actions:** Mark Paid / Payment Reminder / Renew Package / Assign Program
- Session list: all sessions with status, day num, exercise count
- Tap session → `SessionEditor`
- "New Session" button → creates today session
- Cancel session support (with package credit refund)
- Personal Records list
- Monthly Report (sessions + PRs for current month)
- Pending slot requests for this client
- Pending cancel requests for this client

### SessionEditor (bottom sheet)
- Exercise list CRUD (add/remove exercises with sets/reps/weight)
- Load from workout templates or save current list as new template
- Trainer notes textarea
- Client notes display (read-only)
- Save to `sessions_notes` + `exercises` tables

### ScheduleScreen (Trainer)
- Week strip selector
- Day bookings view with client avatars
- Add / Deactivate time slots
- Cancel bookings from this view
- Schedule Periods — create named date-range schedule overrides
- Pending slot requests panel with approve/reject

### ProgramsScreen
- Workout template list
- Create/edit templates
- Multi-day split: Day 1, Day 2, Day 3 (up to sessions_per_week days)
- Exercises: name, sets, reps, weight per exercise per day
- Templates linked to packages (`packages.workout_template_id`)

---

## 11. Session Day Numbering

Day numbers (Day 1 / Day 2 / Day 3) reset every Monday.

**ClientApp** (frontend, uses cached session list):
```js
const computeDayNum = (session, allSessions, spw=3) => {
  const wk = weekMon(session.session_date); // Monday of that week
  const weekSess = allSessions
    .filter(s => (s.status==="completed"||s.status==="booked") && weekMon(s.session_date)===wk)
    .sort((a,b) => a.session_date.localeCompare(b.session_date) || (a.start_time_min - b.start_time_min));
  const idx = weekSess.findIndex(x => x.id === session.id);
  return idx >= 0 ? (idx % spw) + 1 : (session.day_num || null);
};
```

**TrainerApp** (async, queries DB):
```js
const calcDayNum = async (clientId, date, tk, spw=3) => {
  const all = await dbGet("sessions", `client_id=eq.${clientId}&session_date=lte.${date}&status=neq.cancelled`, tk);
  return ((all?.length||0) % spw) + 1;
};
```

---

## 12. Important Constants

```js
GYM_CAP = 8        // max concurrent bookings per time slot
SESS_MIN = 90      // session duration in minutes
THEME_KEY = "ua_theme"  // localStorage key
```

---

## 13. Known Issues / Pending Work

### Should be fixed
- **Trainer BottomNav positioning** — still uses old pattern (`className="ua-app"` + `left:50%;transform:translateX(-50%)`). Should use same fix as Client BottomNav (move outside `div.ua-app`, use `position:fixed;left:0;right:0`). This causes the same "nav in middle of screen" bug on trainer side.

### Low priority / future features
- Monthly report PDF export
- Client messaging / DMs
- Payment integration (Stripe)
- Multiple trainers support
- Push for waitlist promotion (currently DB-trigger based)

---

## 14. Deployment

- **GitHub**: `dimitrislargyros-ui/unorthodox-athletes` — branch `master`
- **Vercel**: auto-deploys on push to `master` (~1 min)
- **Build**: `vite build` → `dist/`
- **API**: `/api/*.js` → Vercel Serverless (Node.js ESM, `export default async function handler(req,res)`)

To deploy any change:
```bash
git add <files>
git commit -m "description"
git push origin master
```

---

## 15. How to Work in This Codebase

1. Files are large (~2000-2400 lines each). Always use `Read` with `offset` + `limit` to read specific sections.
2. Use `Grep` to find component/function locations before editing.
3. All styles are inline — no class names except: `ua-btn-grad`, `ua-btn-ghost`, `ua-card-glass` (CSS animations injected at module init).
4. The one global CSS file (`index.css`) only has: `body { margin:0; background:#0A0A0A; }` and `.ua-app { max-width:430px; margin:0 auto; }`.
5. Never add external CSS libraries — keep everything inline.
6. After editing, `git push origin master` and Vercel deploys automatically.

---

## 16. Quick Reference: What to Say to Next Claude

> "This is the Unorthodox Athletes gym PWA. The repo is at `/home/user/repo`. Trainer at `/trainer`, clients at `/`. Read `CONTEXT.md` first. All styles inline React. No supabase-js — raw fetch only. Push to `master` → Vercel auto-deploys."

Then describe what you want to add or fix.
