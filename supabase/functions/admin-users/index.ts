// Supabase Edge Function: staff account management.
// Creating or deleting login accounts needs the service-role key, which must never reach the browser,
// so the admin's app calls this function and it checks the caller is an admin (MFA-verified if enrolled).
//
// Deploy:  npx supabase functions deploy admin-users
// Env:     SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//          Optionally set ALLOWED_ORIGIN (e.g. https://your-gym.vercel.app) to restrict CORS.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function passwordProblem(pw: string, email: string): string | null {
  if (pw.length < 8 || pw.length > 128) return 'Password must be 8–128 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use both letters and numbers.';
  if (pw.toLowerCase().includes(email.split('@')[0].toLowerCase())) return "Password can't contain the email name.";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });

  // 1. The caller must be an admin. is_admin() also enforces MFA (aal2) when the admin has enrolled it.
  const { data: isAdmin, error: roleErr } = await caller.rpc('is_admin');
  if (roleErr || isAdmin !== true) return json({ error: 'Not allowed' }, 403);
  const { data: auth } = await caller.auth.getUser();
  const me = auth.user!;
  const { data: meRow } = await caller.from('staff').select('name').eq('user_id', me.id).single();
  const actor = meRow?.name ?? 'Admin';

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const log = (summary: string) => admin.from('activity_log').insert({ actor_id: me.id, actor_name: actor, action: 'staff', summary });
  const adminCount = async () => (await admin.from('staff').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')).count ?? 0;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const name = String(body.name ?? '').trim();
  const role = body.role === 'admin' ? 'admin' : 'staff';
  const password = body.password ? String(body.password) : '';

  try {
    switch (body.action) {
      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: 'Enter a valid email.' }, 400);
        if (name.length < 2 || name.length > 100) return json({ error: 'Enter the staff member’s name.' }, 400);
        const pwErr = passwordProblem(password, email);
        if (pwErr) return json({ error: pwErr }, 400);
        const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) return json({ error: error.message.includes('already') ? 'That email already has an account.' : 'Could not create the account.' }, 400);
        const { error: insErr } = await admin.from('staff').insert({ user_id: data.user.id, email, name, role, must_change_password: true });
        if (insErr) {
          await admin.auth.admin.deleteUser(data.user.id); // don't leave a half-created login behind
          return json({ error: 'Could not create the staff record.' }, 400);
        }
        await log(`Created ${role} account ${email}`);
        return json({ ok: true });
      }

      case 'update': {
        const id = String(body.id ?? '');
        const { data: target } = await admin.from('staff').select('*').eq('user_id', id).single();
        if (!target) return json({ error: 'Account not found.' }, 404);
        if (target.role === 'admin' && role !== 'admin' && (await adminCount()) <= 1) return json({ error: 'Keep at least one admin account.' }, 400);
        if (name.length < 2 || name.length > 100) return json({ error: 'Enter the staff member’s name.' }, 400);
        const patch: Record<string, unknown> = { name, role };
        if (password) {
          const pwErr = passwordProblem(password, target.email);
          if (pwErr) return json({ error: pwErr }, 400);
          const { error } = await admin.auth.admin.updateUserById(id, { password });
          if (error) return json({ error: 'Could not reset the password.' }, 400);
          if (id !== me.id) patch.must_change_password = true; // an admin-set password is temporary
        }
        await admin.from('staff').update(patch).eq('user_id', id);
        await log(`Edited staff account ${target.email}${password ? ' (password reset)' : ''}`);
        return json({ ok: true });
      }

      case 'delete': {
        const id = String(body.id ?? '');
        if (id === me.id) return json({ error: "You can't delete your own account." }, 400);
        const { data: target } = await admin.from('staff').select('*').eq('user_id', id).single();
        if (!target) return json({ error: 'Account not found.' }, 404);
        if (target.role === 'admin' && (await adminCount()) <= 1) return json({ error: 'Keep at least one admin account.' }, 400);
        const { error } = await admin.auth.admin.deleteUser(id); // cascades to public.staff
        if (error) return json({ error: 'Could not delete the account.' }, 400);
        await log(`Deleted staff account ${target.email}`);
        return json({ ok: true });
      }

      default:
        return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: 'Server error' }, 500);
  }
});
