import type { Member, MemberStatus, Plan } from '../types';

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 0 });

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

/* ---------- dates (local time, YYYY-MM-DD strings) ---------- */

export function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const todayISO = () => toISO(new Date());

export function parseISO(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000);

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const isSameDay = (ts: string, iso: string) => toISO(new Date(ts)) === iso;

/* ---------- membership logic ---------- */

export const daysLeft = (m: Member) => daysBetween(todayISO(), m.expiryDate);

export function memberStatus(m: Member): MemberStatus {
  const left = daysLeft(m);
  if (left < 0) return 'expired';
  if (left <= 7) return 'expiring';
  return 'active';
}

/** Renewing an active member stacks on top of their current expiry; expired members restart today. */
export function renewalExpiry(m: Member, plan: Plan) {
  const today = todayISO();
  const base = m.expiryDate < today ? today : m.expiryDate;
  return addDays(base, plan.durationDays);
}

/* ---------- formatting ---------- */

export function relativeDays(n: number) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const fmtDate = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

export const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

export const fmtDateTime = (ts: string) =>
  new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtHour = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Magandang umaga' : h < 18 ? 'Magandang hapon' : 'Magandang gabi';
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export const shortId = (id: string) => id.slice(0, 6).toUpperCase();

/* ---------- QR ---------- */

export const QR_PREFIX = 'IRONDESK:';
export const memberQrValue = (id: string) => QR_PREFIX + id;
export const parseMemberQr = (text: string) => (text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : null);

/* ---------- classes / week helpers ---------- */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Monday-first dates of the week containing today + `offset` weeks. */
export function weekDates(offset = 0) {
  const today = todayISO();
  const dow = parseISO(today).getDay();
  const monday = addDays(today, -((dow + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function fmtClock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/* ---------- body metrics ---------- */

export const bmi = (weightKg: number, heightCm?: number) =>
  heightCm ? Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10 : null;

export function bmiLabel(v: number) {
  if (v < 18.5) return 'Underweight';
  if (v < 25) return 'Normal';
  if (v < 30) return 'Overweight';
  return 'Obese';
}

/* ---------- files ---------- */

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
