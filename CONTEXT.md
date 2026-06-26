# UNORTHODOX ATHLETES — Project Context
> Read this file first before making any changes.

## Project Overview
A mobile-first web app for a personal trainer gym. Two separate apps:
- **Client App**: `https://unorthodox-athletes.vercel.app/`
- **Trainer App**: `https://unorthodox-athletes.vercel.app/trainer`

## Tech Stack
- **Frontend**: React (Vite) — `src/ClientApp.jsx` + `src/TrainerApp.jsx`
- **Backend**: Supabase (PostgreSQL + Auth + REST API)
- **Hosting**: Vercel (auto-deploy from GitHub)
- **Repo**: `https://github.com/dimitrislargyros-ui/unorthodox-athletes`

## Supabase Config
```
URL: https://hxyqvryuniqmvpjljrry.supabase.co
ANON KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU
```

## Database Tables
- `profiles` — id (uuid FK auth.users), role ('trainer'|'client'), name, email, initials, avatar_url
- `packages` — client_id, sessions_total (8/10/12), sessions_used, sessions_per_week, weeks, start_date, end_date, is_active, has_injury, injury_notes, package_notes
- `sessions` — client_id, trainer_id, session_date, start_time_min (mins from midnight), day_num, status ('booked'|'completed'|'cancelled'), is_free
- `session_notes` — session_id (unique), trainer_note, client_note, updated_at
- `exercises` — session_id, name, sets, reps, weight, order_index
- `personal_records` — client_id, exercise, weight, unit, reps, record_date
- `schedule_slots` — trainer_id, day_of_week (0=Mon,6=Sun), start_time_min, is_active
- `bookings` — slot_id, client_id, book_date, status ('booked'|'cancelled')

## Accounts
- Trainer: `dimitrislargyros@gmail.com` / role: trainer
- Client: `dimitrisl1996@hotmail.gr` / role: client

## Auth (localStorage)
- Client session key: `ua_client_auth`
- Trainer session key: `ua_trainer_auth`
- Format: `{token, userId, expiresAt}`

## Business Logic
- Gym capacity: 8 people per slot
- Session duration: 90 minutes (SESS_MIN = 90)
- Week: Mon-Sat (Sunday = closed)
- Day counter: cycles per sessions_per_week (e.g. 3x/week → Day1→Day2→Day3→Day1→...)
  - Formula: `(sessions_completed_total % sessions_per_week) + 1`
- Standard slots trainer set: Δευ/Τρ/Πεμ/Παρ 11:30 & 13:00, Δευ/Τετ/Παρ 17:00-21:00 (every 1.5h), Σαβ 12:00-15:00
- Cancellation policy: client can cancel max 48h before, otherwise show message to contact trainer

## Current Bugs (Priority Order)
1. **JWT expired** — token expires and user gets PGRST303 error. Need auto-refresh:
   - On any 401/403 error, clear localStorage and redirect to login
   - OR use Supabase refresh token to get new access token
2. **PR save error** ("l is not a function") — bug in addPR function, likely `r=>r[0]` on non-array
3. **Trainer notes not visible to client** — session_notes loaded with sessions but trainer_note not showing
4. **Schedule doesn't open on today** — week strip starts from Monday of week, should highlight today
5. **Layout too narrow on desktop** — maxWidth:430 looks narrow on big screens, should be responsive
6. **Schedule slot add gives JWT error** — related to bug #1

## Planned Features (In Order)
1. Fix all bugs above
2. Sign up screen for new clients (with Supabase signUp API)
3. Weekly schedule slots in DB (SQL to insert standard slots)
4. Client cancellation with 48h rule
5. Trainer cancellation with double confirmation
6. Free session flag (trainer marks session as complimentary)
7. Avatar upload (client picks profile photo)
8. Session rating (client rates 1-5 stars after session)
9. Monthly report for trainer
10. Workout templates (trainer saves reusable exercise lists)
11. Waiting list for full slots
12. Payment tracking (trainer marks who paid)
13. PWA (installable on mobile)
14. Push notifications (full booking, expiring package, custom slot request)

## File Structure
```
unorthodox-athletes/
├── src/
│   ├── ClientApp.jsx    (client-facing app, ~700 lines)
│   ├── TrainerApp.jsx   (trainer-facing app, ~650 lines)
│   ├── main.jsx         (routes: / → Client, /trainer → Trainer)
│   └── index.css        (minimal reset)
├── vercel.json          (SPA routing rewrites)
├── package.json
└── CONTEXT.md           (this file)
```

## Deployment
- Push to GitHub → Vercel auto-deploys in ~1 minute
- Build command: `npm run build` (Vite)
- No environment variables needed (keys hardcoded for now)

## Important Notes
- Logo is embedded as base64 PNG in each JSX file (~430KB) — this is intentional for now
- Both apps share the same Supabase project and domain
- RLS policies are set up: clients see own data, trainers see all
- The `is_trainer()` SQL function checks role for RLS policies
- `sessions_per_week` and `has_injury` fields were added via ALTER TABLE (may need to verify they exist)

## SQL to Run if Needed
```sql
-- Add missing columns (run if they don't exist)
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS sessions_per_week int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS has_injury boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS injury_notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS package_notes text DEFAULT '';

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Insert standard weekly slots (replace TRAINER_UUID with actual trainer ID)
-- Trainer UUID: get from: SELECT id FROM profiles WHERE role='trainer';
```
