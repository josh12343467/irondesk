# Security

IronDesk runs in two modes:

- **Cloud mode** (Supabase, set up with [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md)). The **database is the security boundary**. Row Level Security and `SECURITY DEFINER` functions decide what each role can read and change, so editing the JavaScript in a browser gets nobody anything. `npm run test:db` checks 68 of these rules against a real Postgres engine.
- **Demo mode** (no `.env`): fictional data in `localStorage` for portfolio links. There the controls below are defence in depth only. **Never put real data in demo mode.**

## Cloud mode: server-side controls

| Area | Control |
|---|---|
| Authorisation | RLS on every table. Members read only their own rows; staff can't read health answers or the audit log; only admins change prices, settings, classes and staff. Anonymous visitors can read only the gym's public settings. |
| Business rules in the database | Registration (age, guardian, health clearance, consents), renewals, check-ins (expiry, once per day), bookings (capacity with row locking, weekday, own-booking only), erasure and retention all run inside Postgres functions that check the caller. |
| Column-level protection | Staff can edit profile fields but **not** expiry dates, linked logins or health flags. Payments have no update or delete policy, so they are immutable. |
| Admin MFA | Admins can enrol an authenticator app (TOTP). Once they do, `is_admin()` requires an `aal2` session, so a stolen password alone unlocks nothing. |
| Member sign-in | Passwordless email codes (Supabase Auth). A login is linked to a member record **only after the email is verified**, so signing up with someone else's email gets you nothing. |
| Secrets | The browser only has the anon/publishable key. Creating or deleting staff logins needs the service-role key, which lives only in the `admin-users` Edge Function, and that function re-checks that the caller is an MFA-verified admin. |
| Audit trail | Database triggers write every change to `activity_log`. Clients can't insert, edit or delete entries. Erasure scrubs the person's name from it. |
| Time zone | All "today" rules use Asia/Manila time, not the server's UTC clock. |
| Transport & browser | HTTPS (Supabase), a strict CSP that allows only your Supabase origin, and the security headers in `vercel.json` / `public/_headers`. |

## Controls in the app (both modes)

The table below describes the browser-side controls. In cloud mode, Supabase handles password hashing and server-side rate limiting, and the client-side lockout is an extra UX layer.

| Area | Control | Where |
|---|---|---|
| Password & PIN storage | PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte random salt per secret, constant-time comparison. No plaintext is ever stored. | `src/lib/security.ts` |
| Password policy | Staff: ≥ 8 chars, letters + numbers, not containing the username, not a common password, plus a strength meter. Members: 6-digit PIN, no repeated digits, no sequences, not part of their mobile number. | `checkPassword`, `checkPin` |
| Temporary credentials | New staff accounts and admin password resets are temporary: the user must set their own at next sign-in. New members get a **random** 6-digit PIN (CSPRNG), shown to staff once and never stored readably. Members must change it on first sign-in. | `issueMemberPin`, `ForceChangeScreen` |
| Brute-force protection | 5 failed attempts per username or mobile number lock that identifier for 5 minutes. Error messages don't reveal whether an account exists, and unknown accounts are verified against a dummy hash so timing is similar. | `recordFailure`, `login`, `memberLogin` |
| Sessions | Idle timeout (staff 15 min, members 10 min) with a 60-second warning, a 12-hour absolute lifetime, sign-out broadcast to other tabs, and immediate sign-out if the account is deleted. | `StoreProvider` |
| Authorisation | Role checks run **inside every store action** (admin / staff / member-self), not just in the UI. Members can only touch their own bookings, weigh-ins, contact details and PIN. Blocked attempts are logged to the console. | `allow()` in `store.tsx` |
| Least privilege | Staff see health *flags* only. Full health answers, reports, settings, staff accounts and privacy requests are admin-only. Phone numbers are masked on the public-facing check-in screen. | `Members.tsx`, `CheckIn.tsx` |
| Audit trail | Every mutation writes who / what / when to the activity log. Erasure scrubs the member's name from it. | `commit()` |
| Content Security Policy | Production builds ship a strict CSP (as a `<meta>` tag): `default-src 'self'`, and the only remote origin allowed is your Supabase project (HTTPS + WSS, read from `VITE_SUPABASE_URL` at build time). Also `object-src 'none'` and `base-uri 'self'`. | `vite.config.ts` |
| Security headers | `public/_headers` (Netlify, Cloudflare Pages) and `vercel.json` add `X-Frame-Options: DENY` (anti-clickjacking), `nosniff`, `Referrer-Policy: no-referrer`, HSTS, a `Permissions-Policy` limiting the camera to this site, and COOP. | `public/_headers`, `vercel.json` |
| No third-party requests | The Inter font is self-hosted. There are no analytics, trackers or CDNs, so no visitor data leaves the site. | `main.tsx` |
| Output safety | React escapes all rendered text. CSV exports neutralise spreadsheet formula injection (`=`, `+`, `-`, `@`). | `csvCell` |
| Input validation | PH mobile and email formats, birth dates, weight ranges, unique phone numbers, and length limits on free text. Backup files are size-limited (20 MB) and structurally validated before restore. | forms, `isValidState` |
| Camera | Requested only when the scanner opens, and released as soon as it closes. QR codes contain only a random member ID, never personal data. | `components/qr.tsx` |
| Safe defaults | No source maps in production, `noindex` meta tag and header, and a confirmation before backups that contain personal data. | |

## Known limitations of demo mode

1. **Client-side storage.** Data, hashes and the lockout counter live in `localStorage`. A user with device access can read, edit or reset them. Lockouts can be bypassed by clearing storage.
2. **Client-side authorisation.** Role checks can be bypassed by someone who edits the JavaScript in their own browser. Only a server can enforce them.
3. **Shared demo credentials.** All seeded members share one PIN hash (`246810`), and the demo staff passwords are published on the login screen.
4. **Unencrypted backups.** Exported JSON files are plain text.
5. **4–6 digit PINs are low-entropy.** They are safe only behind *server-side* rate limiting.

## Going to production

| | Status |
|---|---|
| Data and auth on a backend, permissions enforced server-side | ✅ Supabase + RLS (cloud mode) |
| Server-side rate limiting | ✅ Supabase Auth rate limits (tune under Authentication → Rate limits) |
| MFA for admins | ✅ available. **Turn it on for every admin.** |
| Append-only, server-side audit log | ✅ |
| Secrets only on the server | ✅ service role only in the Edge Function |
| HTTPS, CSP, security headers | ✅ |
| Encrypted at rest | ✅ Supabase encrypts storage. Exported backups are your responsibility. |
| Custom SMTP for member emails | ⬜ you set this up (see setup guide) |
| Point-in-time backups | ⬜ Supabase Pro plan, or schedule `pg_dump` |
| Dependency scanning | ⬜ enable Dependabot on the GitHub repo; run `npm audit` |
| Penetration test | ⬜ before handling real members at scale |
| Legal review and compliance items | ⬜ see [`docs/PRIVACY-COMPLIANCE.md`](docs/PRIVACY-COMPLIANCE.md) |

Note: loading all visible rows into the browser suits a single gym (hundreds to a few thousand members). For larger datasets, move to paginated queries.

## Reporting a vulnerability

Please don't open a public issue. Email the maintainer at `[security contact email]` with steps to reproduce. You'll get a reply within 5 working days.
