/**
 * Client-side security helpers.
 *
 * IMPORTANT: this app has no server, so everything here is defence-in-depth for a demo.
 * Anyone with access to the browser profile can read localStorage. See SECURITY.md for
 * what a production deployment must move to a backend.
 */

/* ---------------- password / PIN hashing (PBKDF2-SHA256, per-secret random salt) ---------------- */

const ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
const PREFIX = 'pbkdf2-sha256';

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

/** Returns `pbkdf2-sha256$<iterations>$<salt>$<hash>` */
export async function hashSecret(secret: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(secret, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
}

export async function verifySecret(secret: string, stored: string | undefined) {
  if (!stored) return false;
  const [prefix, iter, salt, hash] = stored.split('$');
  if (prefix !== PREFIX || !iter || !salt || !hash) return false;
  const bits = new Uint8Array(await derive(secret, fromB64(salt), Number(iter)));
  const expected = fromB64(hash);
  // constant-time comparison
  if (bits.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < bits.length; i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

/* ---------------- credential policy ---------------- */

const COMMON_PASSWORDS = new Set(['password', 'password1', 'password123', '12345678', '123456789', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein1']);

/** Returns an error message, or null when the password is acceptable. */
export function checkPassword(pw: string, username = ''): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use both letters and numbers.';
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "Password can't contain the username.";
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'That password is too common. Pick another.';
  return null;
}

export function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return Math.min(4, score); // 0–4
}

/** Returns an error message, or null when the PIN is acceptable. */
export function checkPin(pin: string, phone = ''): string | null {
  if (!/^\d{6}$/.test(pin)) return 'PIN must be exactly 6 digits.';
  if (/^(\d)\1+$/.test(pin)) return "PIN can't be the same digit repeated.";
  const asc = '0123456789012345';
  const desc = '9876543210987654';
  if (asc.includes(pin) || desc.includes(pin)) return "PIN can't be a sequence like 123456.";
  const d = phone.replace(/\D/g, '');
  if (d && d.includes(pin)) return "PIN can't be part of your mobile number.";
  if (['121212', '112233', '123123', '696969', '000000'].includes(pin)) return 'That PIN is too easy to guess.';
  return null;
}

/** Cryptographically random 6-digit PIN that passes checkPin. */
export function randomPin(): string {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
    const pin = String(n).padStart(6, '0');
    if (!checkPin(pin)) return pin;
  }
}

/* ---------------- brute-force protection (per identifier) ---------------- */

const LOCK_KEY = 'irondesk:lockout';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

type LockMap = Record<string, { fails: number; until: number }>;

function readLocks(): LockMap {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeLocks(m: LockMap) {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Milliseconds remaining on a lock for this identifier (0 = not locked). */
export function lockRemaining(id: string) {
  const entry = readLocks()[id.toLowerCase()];
  return entry && entry.until > Date.now() ? entry.until - Date.now() : 0;
}

export function recordFailure(id: string) {
  const m = readLocks();
  const k = id.toLowerCase();
  const now = Date.now();
  let e = m[k];
  if (!e || (e.until && e.until <= now)) e = { fails: 0, until: 0 }; // fresh, or a lock that has expired
  e.fails += 1;
  if (e.fails >= MAX_ATTEMPTS) {
    e.until = now + LOCK_MS;
    e.fails = 0;
  }
  m[k] = e;
  writeLocks(m);
  const locked = e.until > now;
  return { locked, attemptsLeft: locked ? 0 : MAX_ATTEMPTS - e.fails };
}

export function clearFailures(id: string) {
  const m = readLocks();
  delete m[id.toLowerCase()];
  writeLocks(m);
}

/* ---------------- sessions ---------------- */

export const IDLE_LIMIT_MS = { staff: 15 * 60_000, member: 10 * 60_000 } as const;
export const ABSOLUTE_LIMIT_MS = 12 * 60 * 60_000;
export const IDLE_WARNING_MS = 60_000;

/* ---------------- output safety ---------------- */

/** Neutralise spreadsheet formula injection (=, +, -, @, tab, CR) in CSV cells. */
export function csvCell(v: string | number) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

/** 0917•••4567 */
export function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length >= 8 ? `${d.slice(0, 4)}•••${d.slice(-4)}` : '•••';
}

export const ageOn = (birthDate: string, today: string) => {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
};
