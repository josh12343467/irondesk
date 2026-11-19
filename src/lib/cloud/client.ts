import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Cloud mode is on when both env vars are set at build time; otherwise the app runs the offline demo. */
export const CLOUD = Boolean(url && key);

/** When this browser session signed in (for the 12-hour absolute session limit). */
export const ISSUED_KEY = 'irondesk:cloud-issued-at';
export const markSignedIn = () => {
  try {
    localStorage.setItem(ISSUED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!CLOUD) throw new Error('Supabase is not configured');
  client ??= createClient(url!, key!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce', // magic links come back as ?code=, which plays nicely with the HashRouter
      detectSessionInUrl: true,
    },
  });
  return client;
}

/** Turn Postgres / Supabase errors into messages a front-desk user can act on. */
export function friendlyError(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string };
  const msg = err?.message ?? String(e);
  if (err?.code === '42501' || /not allowed|permission denied|row-level security/i.test(msg)) return "You don't have permission to do that.";
  if (/members_phone_key/.test(msg)) return 'That mobile number is already used by another member.';
  if (/members_email_key/.test(msg)) return 'That email is already used by another member.';
  if (/violates foreign key/.test(msg)) return "It's still in use, so it can't be deleted. Reassign it first.";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No connection to the server. Check your internet and try again.';
  // Supabase Auth times out (504) or reports a send error when the SMTP settings are wrong
  if (/HTTP 50[234]|timeout|sending .*email|smtp/i.test(msg))
    return "We couldn't send the email right now. This is a problem with the gym's email server, not with you. Try again later or ask the front desk.";
  if (/JWT expired|invalid claim/i.test(msg)) return 'Your session expired. Please sign in again.';
  return msg.length < 160 ? msg : 'Something went wrong. Please try again.';
}
