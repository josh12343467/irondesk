# Connecting IronDesk to Supabase

About 20–30 minutes, all on the free plan. After this, data lives in Postgres instead of the browser, every device stays in sync in real time, and permissions are enforced by the database.

> **Two keys, two rules.** The **anon / publishable** key goes in `.env.local` and is safe in the browser. The **service_role / secret** key and the **database password** must never go in the front end, in chat, or in git.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. **Region: Southeast Asia (Singapore)**, the closest to the Philippines.
3. Save the database password in a password manager. You won't need it for the app.

## 2. Create the database

In the dashboard, go to **SQL Editor → New query**:

1. Paste the whole of `supabase/migrations/20261119000000_init.sql`, then click **Run**.
2. (Optional) Paste `supabase/seed.sql` to add starter plans, trainers and a class schedule, then click **Run**.

> Prefer the CLI? Run `npx supabase login`, then `npx supabase link --project-ref <ref>`, then `npx supabase db push`.

Check the result in **Database → Tables**: every table should show **RLS enabled**.

## 3. Configure Auth

**Authentication → Sign In / Providers**
- **Email**: enabled. Keep **Confirm email** on.
- Allow new users to sign up: **on**. Members create their login the first time they request a code. A login that doesn't match a registered member's email gets no data; it lands on a "no account linked" screen.

**Email templates.** Templates are locked until custom SMTP is set up, so do the [Email sending](#email-sending-important) step below first. In the Authentication sidebar, find **Email** under the *Notifications* group (older dashboards call it *Emails* and put it under *Configuration*), then open the **Templates** tab. You can also go straight to `https://supabase.com/dashboard/project/<your-project-ref>/auth/templates`.

Edit **both** of these templates so members get a code they can type in:
- **Confirm signup**: used the first time a member signs in
- **Magic Link**: used every time after that

Paste this as the body of each:

```html
<h2>Your IronDesk sign-in code</h2>
<p>Enter this code in the app: <strong style="font-size:24px">{{ .Token }}</strong></p>
<p>It expires in a few minutes. If you didn't request it, ignore this email.</p>
```

**Authentication → Multi-Factor**: enable **TOTP (App Authenticator)**.

In the same **Email** provider settings, set the minimum password length to **8** and require letters and digits. Enable leaked-password protection too, if your plan offers it.

**Authentication → Rate limits**: the defaults are fine. They throttle sign-in attempts and email sends server-side.

**Authentication → URL Configuration**: set the **Site URL** to where the app is hosted (e.g. `https://your-gym.vercel.app`), and add `http://localhost:5173` to the redirect URLs for development.

### Email sending (important)

Supabase's built-in email only delivers to your **own team's addresses** and has a very low hourly limit. It's for testing only. For real members, set up **Authentication → Emails → SMTP Settings**:

| Option | Settings | Notes |
|---|---|---|
| **Gmail** | Host `smtp.gmail.com`, port **`465`**, user = your Gmail address (same as the sender email), password = a Google **App Password** typed without spaces | Needs 2-Step Verification on the Google account. Roughly 500 emails/day. Fine for a small gym. Port 587 tends to time out from Supabase's servers ("Context deadline exceeded" / HTTP 504), so use 465. |
| Brevo / Resend / SendGrid | Their SMTP details | Better deliverability, use your own domain, and free tiers are available. |

## 4. Create the first admin

1. **Authentication → Users → Add user → Create new user**: enter your email and a strong password, and tick **Auto Confirm User**.
2. In the **SQL Editor**, run this, replacing the email and name:

```sql
insert into public.staff (user_id, email, name, role)
select id, email, 'Your Name', 'admin' from auth.users where email = 'you@gmail.com';
```

Add everyone else later from the app (**Settings → Staff accounts**).

## 5. Deploy the Edge Function (staff accounts)

Creating staff logins needs the service-role key, so it runs on Supabase's servers. Run these in a terminal (they sign you in through the browser):

```powershell
npx supabase login
```
```powershell
npx supabase link --project-ref your-project-ref
```
```powershell
npx supabase functions deploy admin-users
```

Optionally, restrict which website may call it:

```powershell
npx supabase secrets set ALLOWED_ORIGIN=https://your-gym.vercel.app
```

## 6. Point the app at the project

Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   (or sb_publishable_...)
```

Then run `npm run dev`. The login screen now shows **email code** for members and **email + password** for staff.

## 7. First sign-in checklist

- [ ] Sign in as the admin. Go to **Settings → Staff accounts → Two-factor authentication → Set up**, and scan the QR code with Google Authenticator. Once MFA is set up, the database refuses admin actions on a session that hasn't entered a code.
- [ ] Fill in **Settings → Privacy & compliance** (business name, address, DPO).
- [ ] Register a test member with **your own second email**, open the app in a private window, and sign in with the emailed code.
- [ ] Create a front-desk staff account. They must change the temporary password at first sign-in.

## 8. Deploy the front end

On Vercel or Netlify, set the same two environment variables and deploy. The build automatically adds your Supabase URL to the Content Security Policy. `vercel.json` and `public/_headers` add the remaining security headers.

## Maintenance

- **Backups**: the free plan keeps daily backups for a limited time. Upgrade to the Pro plan for point-in-time recovery, or schedule `pg_dump`.
- **Retention**: run **Settings → Privacy & compliance → Apply retention now** monthly, or schedule it with `pg_cron`:

  ```sql
  -- requires the pg_cron extension (Database → Extensions)
  select cron.schedule('irondesk-retention', '0 3 1 * *', $$
    delete from public.check_ins where created_at < now() - interval '24 months';
    delete from public.bookings  where session_date < (now() - interval '24 months')::date;
    delete from public.activity_log where created_at < now() - interval '24 months';
  $$);
  ```
- **Free-plan projects pause after a week without activity.** Open the dashboard to resume, or upgrade.
- **Security tests**: run `npm run test:db` after changing the migration. It checks 68 permission and business rules against a local Postgres.
