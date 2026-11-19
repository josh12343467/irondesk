/* Cloud-only auth flows: member email codes and admin/staff TOTP (MFA). */
import { markSignedIn, supabase } from './client';

const norm = (email: string) => email.trim().toLowerCase();

/** Sends a one-time sign-in code (and link) to the member's email. */
export async function sendEmailCode(email: string) {
  const { error } = await supabase().auth.signInWithOtp({
    email: norm(email),
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await supabase().auth.verifyOtp({ email: norm(email), token: token.trim(), type: 'email' });
  if (error) throw error;
  markSignedIn();
  await supabase().rpc('log_sign_in');
}

/* ---------------- MFA (authenticator app, TOTP) ---------------- */

export async function verifiedFactors() {
  const { data, error } = await supabase().auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.filter((f) => f.status === 'verified');
}

/** Step-up after password sign-in when the account has an authenticator enrolled. */
export async function mfaChallenge(code: string) {
  const [factor] = await verifiedFactors();
  if (!factor) throw new Error('No authenticator is set up for this account.');
  const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
  if (error) throw error;
}

export async function mfaEnroll() {
  const sb = supabase();
  const { data: list } = await sb.auth.mfa.listFactors();
  // drop abandoned, never-verified enrolments first
  for (const f of list?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `IronDesk ${new Date().toISOString().slice(0, 10)}` });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function mfaConfirmEnrollment(factorId: string, code: string) {
  const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw error;
}

export async function mfaRemove(factorId: string) {
  const { error } = await supabase().auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
