# IronDesk: Gym Management System

A gym management system with three kinds of users: **admins**, **front-desk staff**, and **members**. It covers QR check-in, memberships and renewals, group classes, trainer schedules, payments with printable receipts, progress tracking, analytics, and a mobile-first member portal.

> **Demo accounts** (the login screen has one-click buttons for each)
> - **Member:** any member's mobile number + PIN `246810`
> - **Admin:** `admin` / `admin123` (full access)
> - **Staff:** `staff` / `staff123` (front desk)

> ⚠️ **Portfolio demo.** All data is fictional and stored only in your browser. Read [SECURITY.md](SECURITY.md) before using it with real people's data. The legal templates are **not legal advice**.

## Backend (Supabase)

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to run on **Supabase** (Postgres + Auth + Realtime). Without them, the app runs the offline demo. Setup guide: [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md).

- **Members sign in with a code sent to their email.** No passwords to forget.
- **Staff use email + password**, and admins can turn on an authenticator app (MFA).
- **Row Level Security on every table**, with business rules (capacity, expiry, consents, erasure) as Postgres functions and an append-only audit log written by triggers. See `supabase/migrations/`.
- `npm run test:db` runs **68 security tests** for the policies against Postgres (PGlite) with a stubbed Supabase auth schema. No Docker needed.
- Realtime sync: a check-in at the front desk shows up on other screens instantly.
- The `admin-users` Edge Function creates staff logins, because only the server holds the service-role key.

## Security & compliance

- **Security:** PBKDF2 (600k iterations, salted) for passwords and PINs; sign-in lockout; idle and absolute session timeouts; forced change of temporary credentials; role checks enforced inside every action; strict CSP and security headers; self-hosted fonts (no third-party requests); CSV-injection-safe exports. Details and limitations in [SECURITY.md](SECURITY.md).
- **Data Privacy Act (RA 10173):** a Privacy Notice, Membership Terms and Waiver (versioned templates); separate, recorded consents at registration; health screening; guardian consent for minors; member self-service data download, correction, objection and erasure requests; an admin request queue; a retention purge; and a compliance checklist. See [docs/PRIVACY-COMPLIANCE.md](docs/PRIVACY-COMPLIANCE.md).
- **Operations:** a [breach response plan](docs/INCIDENT-RESPONSE.md) (72-hour NPC notification) and [front-desk staff guidelines](docs/STAFF-GUIDELINES.md).
- Payment slips are labelled **acknowledgement receipts**, not BIR invoices.

## Features

### Member portal (mobile-first)
- Sign in with **mobile number + PIN**. New members get a random temporary PIN (shown once to staff) and must set their own on first sign-in
- **Home:** digital member pass with QR code, membership status, days left, visits this month, weekly attendance streak, next class
- **Classes:** book or cancel a slot for the next 7 days, with live slots-left counts. Expired members can't book, and classes that already started are locked
- **Progress:** log weigh-ins and see a weight and BMI chart
- **Payments:** history with viewable/printable receipts
- **Profile:** update contact info, change PIN, read the legal documents, manage marketing consent, download your data, and request correction or deletion
- Renewals stay at the front desk (no online payments)

### Front desk
- **QR check-in:** every member gets a printable ID card with a QR code. Scan it with a webcam or phone camera, or with a USB/Bluetooth scanner (those type the code into the search box). You can also search by name, phone or member ID
- **Entry rules:** expired members are blocked until they renew, a second check-in on the same day is flagged, and members whose plan is about to expire get a reminder
- **Walk-ins:** sell a day pass and log the visit in one step

### Members
- Search, filter by status (active / expiring / expired), register, edit, renew
- Profile tabs: **Overview** (payments and visits), **Progress** (weigh-ins, BMI, weight chart), **Classes** (upcoming and attended)
- Renewal logic: renewing an active member stacks the new plan on top of the current expiry; an expired member restarts from today

### Classes & trainers
- Weekly calendar with prev/next week navigation and capacity bars
- Book members into a session from a type-ahead search, with capacity limits and duplicate checks. Past sessions are read-only
- Trainer profiles with their weekly classes and 30-day attendance

### Payments
- Monthly view with Cash / GCash / Card breakdown, plus CSV export
- Click any transaction for a **printable official receipt** that records who received the payment

### Reports (admin)
- Revenue with period-over-period change, new members, renewal rate, check-ins
- Charts: revenue by type (stacked), revenue by plan (donut), daily check-ins, busiest weekdays
- Most consistent members and class fill rate

### Settings (admin)
- Membership plans and prices, walk-in price, gym name
- **Staff accounts** with Admin / Staff roles (passwords are stored as SHA-256 hashes)
- **Activity log:** an audit trail of who checked in, renewed, booked, edited or deleted what, and when
- **Backup / restore** of all data as JSON

### Roles

| | Admin | Staff | Member |
|---|:-:|:-:|:-:|
| Check-in, walk-ins, register/renew, payments | ✅ | ✅ | — |
| Book into classes, log weigh-ins | ✅ | ✅ | ✅ (self only) |
| View own pass, payments, receipts; change own PIN | — | — | ✅ |
| Create, edit and delete classes and trainers | ✅ | — | — |
| Delete members, reset member PINs | ✅ | ✅ (reset only) | — |
| Reports, settings, staff accounts, activity log, backup | ✅ | — | — |

## Tech

React 18 · TypeScript · Vite · Tailwind CSS v4 · Recharts · React Router · `qrcode` (generate) · `jsQR` (camera scan) · lucide-react

All state lives in one typed store (`src/lib/store.tsx`) and persists to `localStorage`, so the app runs with no backend. Every mutation goes through a `commit()` helper that also writes the audit-log entry. Seeded demo data (`src/lib/seed.ts`) is deterministic. Admins can bring it back with **Reset demo data**.

> Auth is client-side only, for demo purposes. A production version would move users, sessions and data to a real backend (Supabase, Firebase, or a Node API).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

The camera scanner needs HTTPS or `localhost`, plus camera permission.

## Deploy

The app uses `HashRouter` and a relative `base`, so you can put `dist/` on any static host (GitHub Pages, Netlify, Vercel) without extra config.

## Project structure

```
src/
  components/   Layout, shared UI, modals (member form, renew, receipt), QR card + scanner, progress chart
  pages/        Staff console: Login, Dashboard, CheckIn, Members, Classes, Payments, Reports, Settings
  member/       Member portal: layout + Home, Classes, Progress, Payments, Profile
  lib/          store (state, actions, permissions), seed data, utils,
                security.ts (hashing, lockout, policies), legal.ts (privacy notice, terms, waiver)
  lib/cloud/    Supabase client, data mappers, cloud store provider, email-code + MFA auth
docs/           Supabase setup, privacy compliance guide, incident response plan, staff guidelines
supabase/
  migrations/   schema, RLS policies, business-rule functions, audit triggers
  functions/    admin-users Edge Function (staff accounts)
  tests/        PGlite security tests (npm run test:db)
  seed.sql      starter plans, trainers, classes
  types.ts      domain types
```

## Ideas for v3

- Real backend + multi-device sync
- SMS/email reminders before expiry
- Online payments via GCash/Maya
