import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Booking, Consent, GymClass, Member, Payment, PaymentMethod, Plan, PrivacyRequest, Role, Settings, State, Trainer, User,
} from '../types';
import { createSeed } from './seed';
import { addDays, fmtDate, peso, renewalExpiry, shortId, todayISO, uid } from './utils';
import { LEGAL_VERSION } from './legal';
import {
  ABSOLUTE_LIMIT_MS, IDLE_LIMIT_MS, IDLE_WARNING_MS, checkPassword, checkPin, clearFailures, hashSecret, lockRemaining, randomPin,
  recordFailure, verifySecret,
} from './security';

const STORAGE_KEY = 'irondesk:v4';
const SESSION_KEY = 'irondesk:session:v3';
const ACTIVITY_LIMIT = 400;
// Any valid hash: verified against when an account doesn't exist, so failed sign-ins take the same time.
const DUMMY_HASH = 'pbkdf2-sha256$600000$x69Y+7rBURM+YRIrREpTsw==$2SHR4oarWw3srIoSZJ62ODZkG5o0M0Ou35ZIp724L6w=';

interface Session {
  kind: 'staff' | 'member';
  id: string;
  issuedAt: number;
  lastActive: number;
}

/* ---------- loading & validation ---------- */

const ARRAY_KEYS: (keyof State)[] = [
  'plans', 'members', 'payments', 'checkIns', 'users', 'trainers', 'classes', 'bookings', 'measurements', 'activity', 'privacyRequests',
];

/** Structural validation for persisted data and imported backups (rejects malformed or tampered files). */
export function isValidState(x: unknown): x is State {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  if (!ARRAY_KEYS.every((k) => Array.isArray(s[k]))) return false;
  if (!s.settings || typeof s.settings !== 'object') return false;
  const st = x as State;
  const str = (v: unknown) => typeof v === 'string';
  return (
    str(st.settings.gymName) &&
    st.members.every((m) => m && str(m.id) && str(m.name) && str(m.expiryDate) && str(m.planId)) &&
    st.users.every((u) => u && str(u.id) && str(u.username) && str(u.passwordHash) && (u.role === 'admin' || u.role === 'staff')) &&
    st.users.some((u) => u.role === 'admin') &&
    st.payments.every((p) => p && str(p.id) && typeof p.amount === 'number' && str(p.date)) &&
    st.plans.every((p) => p && str(p.id) && typeof p.price === 'number' && typeof p.durationDays === 'number')
  );
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidState(parsed)) return parsed;
    }
  } catch {
    /* storage unavailable or corrupted: fall back to demo data */
  }
  return createSeed();
}

function sessionExpired(s: Session, now = Date.now()) {
  return now - s.lastActive > IDLE_LIMIT_MS[s.kind] || now - s.issuedAt > ABSOLUTE_LIMIT_MS;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    const ok = s && (s.kind === 'staff' || s.kind === 'member') && typeof s.id === 'string' && typeof s.issuedAt === 'number';
    return ok && !sessionExpired(s) ? s : null;
  } catch {
    return null;
  }
}

const digits = (s: string) => s.replace(/\D/g, '');

/* ---------- permissions (UI) ---------- */

export type Permission = 'reports' | 'settings' | 'deleteMember' | 'manageClasses' | 'manageStaff' | 'privacy' | 'healthDetails';
const STAFF_CAN: Permission[] = [];
export const can = (role: Role | undefined, p: Permission) => role === 'admin' || (role === 'staff' && STAFF_CAN.includes(p));

/* ---------- action types ---------- */

export interface NewMemberInput {
  name: string;
  phone: string;
  email: string;
  notes: string;
  planId: string;
  method: PaymentMethod;
  heightCm?: number;
  birthDate: string;
  guardianName?: string;
  healthAnswers: boolean[];
  clearanceAcknowledged: boolean;
  marketingConsent: boolean;
}

export type LoginResult = { ok: true } | { ok: false; lockedMs?: number; attemptsLeft?: number };
export type BookResult = 'ok' | 'full' | 'duplicate' | 'expired' | 'denied';

/** Mutations may be sync (demo mode) or async (cloud mode). Callers that need a result await it. */
type Act = void | Promise<void>;

/** One interface, two implementations: this file (demo, localStorage) and lib/cloud (Supabase). */
export interface Actions {
  login(username: string, password: string): Promise<LoginResult>;
  memberLogin(phone: string, pin: string): Promise<LoginResult>;
  logout(reason?: string): Act;
  clearNotice(): void;
  stayActive(): void;
  changeOwnPassword(current: string, next: string): Promise<string | null>;
  changeOwnPin(current: string, next: string): Promise<string | null>;
  issueMemberPin(memberId: string): Promise<string | null>;

  addMember(input: NewMemberInput): Promise<string | null>;
  updateMember(id: string, patch: Partial<Pick<Member, 'name' | 'phone' | 'email' | 'notes' | 'heightCm' | 'birthDate' | 'guardianName'>>): Act;
  setMarketingConsent(memberId: string, granted: boolean): Act;
  deleteMember(id: string): Act;
  renew(memberId: string, planId: string, method: PaymentMethod): Act;
  checkIn(memberId: string, via?: 'search' | 'qr'): Act;
  walkIn(guestName: string, method: PaymentMethod): Act;

  addMeasurement(memberId: string, weightKg: number, date: string): Act;
  deleteMeasurement(id: string): Act;

  savePlan(plan: Omit<Plan, 'id'> & { id?: string }): Act;
  deletePlan(id: string): Act;
  updateSettings(patch: Partial<Settings>): Act;

  saveTrainer(t: Omit<Trainer, 'id'> & { id?: string }): Act;
  deleteTrainer(id: string): Act;
  saveClass(c: Omit<GymClass, 'id'> & { id?: string }): Act;
  deleteClass(id: string): Act;
  book(classId: string, memberId: string, date: string): Promise<BookResult>;
  unbook(bookingId: string): Act;

  saveUser(u: { id?: string; name: string; username: string; role: Role; password?: string }): Promise<string | null>;
  deleteUser(id: string): Act;

  submitPrivacyRequest(type: PrivacyRequest['type'], details: string): Act;
  resolvePrivacyRequest(id: string, approve: boolean, note: string): Act;
  applyRetention(): Promise<{ checkIns: number; activity: number; bookings: number }>;

  importData(data: State): Act;
  resetDemo(): Act;
}

export type Store = State & {
  mode: 'demo' | 'cloud';
  actions: Actions;
  currentUser: User | null;
  currentMember: Member | null;
  notice: string | null;
  idleSecondsLeft: number | null;
  /** cloud only: still restoring the session / loading data */
  loading: boolean;
  /** cloud only: signed in with a password but the account requires a second factor */
  mfaPending: boolean;
  /** cloud only: signed in, but the email isn't linked to a staff or member record */
  noAccess: boolean;
  /** last action error, shown as a toast */
  error: string | null;
  clearError(): void;
};

export const StoreContext = createContext<Store | null>(null);

/** Remove a member's personal data. Financial rows are kept for accounting but de-identified. */
function eraseMember(s: State, id: string): State {
  const m = s.members.find((x) => x.id === id);
  if (!m) return s;
  const alias = `Deleted member #${shortId(id)}`;
  const scrub = (t: string) => (m.name ? t.split(m.name).join(alias) : t);
  return {
    ...s,
    members: s.members.filter((x) => x.id !== id),
    checkIns: s.checkIns.filter((c) => c.memberId !== id),
    bookings: s.bookings.filter((b) => b.memberId !== id),
    measurements: s.measurements.filter((x) => x.memberId !== id),
    payments: s.payments.map((p) => (p.memberId === id ? { ...p, memberId: null, label: alias } : p)),
    activity: s.activity.map((a) => ({ ...a, userName: scrub(a.userName), text: scrub(a.text) })),
    privacyRequests: s.privacyRequests.map((r) =>
      r.memberId === id ? { ...r, memberId: null, memberName: alias, details: scrub(r.details) } : r,
    ),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [notice, setNotice] = useState<string | null>(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  // Refs let the memoised actions read the latest values without being recreated.
  const stateRef = useRef(state);
  stateRef.current = state;
  const currentUser = session?.kind === 'staff' ? state.users.find((u) => u.id === session.id) ?? null : null;
  const currentMember = session?.kind === 'member' ? state.members.find((m) => m.id === session.id) ?? null : null;
  const userRef = useRef(currentUser);
  userRef.current = currentUser;
  const memberRef = useRef(currentMember);
  memberRef.current = currentMember;
  const lastActiveRef = useRef(session?.lastActive ?? Date.now());

  /* ----- persistence ----- */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota / private mode errors */
    }
  }, [state]);

  const persistSession = useCallback((s: Session | null) => {
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => persistSession(session), [session, persistSession]);

  // Signing out in one tab signs out every tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY && !e.newValue) setSession(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /* ----- actions ----- */
  const actions = useMemo<Actions>(() => {
    const role = (): Role | 'member' | null => userRef.current?.role ?? (memberRef.current ? 'member' : null);
    const isStaff = () => role() === 'admin' || role() === 'staff';
    const isAdmin = () => role() === 'admin';
    const isSelf = (memberId: string | undefined) => role() === 'member' && !!memberId && memberRef.current?.id === memberId;
    /** Server-style authorisation check: the UI hides controls, but actions refuse on their own too. */
    const allow = (ok: boolean, what: string) => {
      if (!ok) console.warn(`[IronDesk] Blocked "${what}" for role: ${role() ?? 'signed out'}`);
      return ok;
    };
    const who = () => userRef.current?.name ?? (memberRef.current ? `${memberRef.current.name} (member)` : 'System');

    /** Apply a state change and append an audit entry in one update. */
    const commit = (text: string, fn: (s: State) => State | null) =>
      setState((s) => {
        const next = fn(s);
        if (!next) return s;
        const entry = { id: uid(), at: new Date().toISOString(), userName: who(), text };
        return { ...next, activity: [entry, ...next.activity].slice(0, ACTIVITY_LIMIT) };
      });

    const newPayment = (p: Omit<Payment, 'id' | 'date' | 'receivedBy'>, date = new Date().toISOString()): Payment => ({
      ...p,
      id: uid(),
      date,
      receivedBy: who(),
    });

    const consent = (type: Consent['type'], granted: boolean): Consent => ({
      type,
      version: LEGAL_VERSION,
      granted,
      at: new Date().toISOString(),
      recordedBy: role() === 'member' ? 'member (self)' : who(),
    });

    const startSession = (kind: Session['kind'], id: string) => {
      const now = Date.now();
      lastActiveRef.current = now;
      setNotice(null);
      setSession({ kind, id, issuedAt: now, lastActive: now });
    };

    return {
      async login(username, password) {
        const key = `staff:${username.trim().toLowerCase()}`;
        const lockedMs = lockRemaining(key);
        if (lockedMs) return { ok: false, lockedMs };
        const user = stateRef.current.users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
        const ok = await verifySecret(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !ok) {
          const r = recordFailure(key);
          return r.locked ? { ok: false, lockedMs: lockRemaining(key) } : { ok: false, attemptsLeft: r.attemptsLeft };
        }
        clearFailures(key);
        userRef.current = user;
        memberRef.current = null;
        startSession('staff', user.id);
        commit('Logged in', (s) => s);
        return { ok: true };
      },

      async memberLogin(phone, pin) {
        const d = digits(phone).slice(-10); // 09171234567, +639171234567 and 639171234567 all match
        const key = `member:${d}`;
        const lockedMs = lockRemaining(key);
        if (lockedMs) return { ok: false, lockedMs };
        const member = stateRef.current.members.find((m) => d.length === 10 && digits(m.phone).slice(-10) === d && m.pinHash);
        const ok = await verifySecret(pin, member?.pinHash ?? DUMMY_HASH);
        if (!member || !ok) {
          const r = recordFailure(key);
          return r.locked ? { ok: false, lockedMs: lockRemaining(key) } : { ok: false, attemptsLeft: r.attemptsLeft };
        }
        clearFailures(key);
        userRef.current = null;
        memberRef.current = member;
        startSession('member', member.id);
        commit('Signed in to the member portal', (s) => s);
        return { ok: true };
      },

      logout(reason) {
        if (role()) commit(reason ? 'Signed out automatically (inactivity)' : 'Logged out', (s) => s);
        setSession(null);
        setIdleSecondsLeft(null);
        setNotice(reason ?? null);
      },

      clearNotice() {
        setNotice(null);
      },

      stayActive() {
        lastActiveRef.current = Date.now();
        setIdleSecondsLeft(null);
      },

      async changeOwnPassword(current, next) {
        const u = userRef.current;
        if (!u) return 'Not signed in.';
        if (!(await verifySecret(current, u.passwordHash))) return 'Current password is wrong.';
        const err = checkPassword(next, u.username);
        if (err) return err;
        if (current === next) return 'Choose a password different from the current one.';
        const passwordHash = await hashSecret(next);
        commit('Changed their password', (s) => ({
          ...s,
          users: s.users.map((x) => (x.id === u.id ? { ...x, passwordHash, mustChangePassword: false } : x)),
        }));
        return null;
      },

      async changeOwnPin(current, next) {
        const m = memberRef.current;
        if (!m) return 'Not signed in.';
        if (!(await verifySecret(current, m.pinHash))) return 'Current PIN is wrong.';
        const err = checkPin(next, m.phone);
        if (err) return err;
        if (current === next) return 'Choose a PIN different from the current one.';
        const pinHash = await hashSecret(next);
        commit('Changed their portal PIN', (s) => ({
          ...s,
          members: s.members.map((x) => (x.id === m.id ? { ...x, pinHash, mustChangePin: false } : x)),
        }));
        return null;
      },

      async issueMemberPin(memberId) {
        if (!allow(isStaff(), 'issue member PIN')) return null;
        const pin = randomPin();
        const pinHash = await hashSecret(pin);
        const name = stateRef.current.members.find((m) => m.id === memberId)?.name ?? 'member';
        commit(`Issued a temporary portal PIN for ${name}`, (s) => ({
          ...s,
          members: s.members.map((m) => (m.id === memberId ? { ...m, pinHash, mustChangePin: true } : m)),
        }));
        return pin;
      },

      async addMember(input) {
        if (!allow(isStaff(), 'register member')) return null;
        const id = uid();
        const today = todayISO();
        commit(`Registered new member ${input.name.trim()}`, (s) => {
          const plan = s.plans.find((p) => p.id === input.planId);
          if (!plan) return null;
          const at = new Date().toISOString();
          const flagged = input.healthAnswers.some(Boolean);
          const member: Member = {
            id,
            name: input.name.trim(),
            phone: input.phone.trim(),
            email: input.email.trim(),
            notes: input.notes.trim(),
            heightCm: input.heightCm,
            birthDate: input.birthDate,
            guardianName: input.guardianName?.trim() || undefined,
            joinedAt: today,
            planId: plan.id,
            expiryDate: addDays(today, plan.durationDays),
            health: { answers: input.healthAnswers, flagged, clearanceAcknowledged: input.clearanceAcknowledged, at },
            consents: [consent('terms', true), consent('privacy', true), consent('health', true), consent('marketing', input.marketingConsent)],
          };
          const payment = newPayment({
            memberId: id, label: member.name, planName: plan.name, amount: plan.price, method: input.method, kind: 'new',
          });
          return {
            ...s,
            members: [...s.members, member].sort((a, b) => a.name.localeCompare(b.name)),
            payments: [payment, ...s.payments],
          };
        });
        return id;
      },

      updateMember(id, patch) {
        const self = isSelf(id);
        if (!allow(isStaff() || self, 'update member')) return;
        // members may only edit their own contact details and height
        const safe = self ? { phone: patch.phone, email: patch.email, heightCm: patch.heightCm } : patch;
        const clean = Object.fromEntries(Object.entries(safe).filter(([, v]) => v !== undefined));
        const name = stateRef.current.members.find((m) => m.id === id)?.name ?? 'member';
        commit(self ? 'Updated their contact details' : `Updated profile of ${name}`, (s) => ({
          ...s,
          members: s.members.map((m) => (m.id === id ? { ...m, ...clean } : m)),
        }));
      },

      setMarketingConsent(memberId, granted) {
        if (!allow(isStaff() || isSelf(memberId), 'change marketing consent')) return;
        commit(granted ? 'Opted in to marketing messages' : 'Withdrew consent to marketing messages', (s) => ({
          ...s,
          members: s.members.map((m) => (m.id === memberId ? { ...m, consents: [...(m.consents ?? []), consent('marketing', granted)] } : m)),
        }));
      },

      deleteMember(id) {
        if (!allow(isAdmin(), 'delete member')) return;
        commit(`Erased member record #${shortId(id)}`, (s) => eraseMember(s, id));
      },

      renew(memberId, planId, method) {
        if (!allow(isStaff(), 'renew membership')) return;
        const s0 = stateRef.current;
        const plan = s0.plans.find((p) => p.id === planId);
        const member = s0.members.find((m) => m.id === memberId);
        if (!plan || !member) return;
        commit(`Renewed ${member.name} · ${plan.name} · ${peso(plan.price)}`, (s) => {
          const m = s.members.find((x) => x.id === memberId);
          if (!m) return null;
          const updated: Member = { ...m, planId, expiryDate: renewalExpiry(m, plan) };
          const payment = newPayment({ memberId, label: m.name, planName: plan.name, amount: plan.price, method, kind: 'renewal' });
          return {
            ...s,
            members: s.members.map((x) => (x.id === memberId ? updated : x)),
            payments: [payment, ...s.payments],
          };
        });
      },

      checkIn(memberId, via = 'search') {
        if (!allow(isStaff(), 'check in')) return;
        const name = stateRef.current.members.find((m) => m.id === memberId)?.name ?? 'member';
        commit(`Checked in ${name}${via === 'qr' ? ' (QR)' : ''}`, (s) => ({
          ...s,
          checkIns: [{ id: uid(), memberId, at: new Date().toISOString(), via }, ...s.checkIns],
        }));
      },

      walkIn(guestName, method) {
        if (!allow(isStaff(), 'walk-in')) return;
        const name = guestName.trim() || 'Walk-in guest';
        commit(`Walk-in day pass: ${name}`, (s) => {
          const at = new Date().toISOString();
          return {
            ...s,
            checkIns: [{ id: uid(), memberId: null, guestName: name, at }, ...s.checkIns],
            payments: [
              newPayment({ memberId: null, label: name, planName: 'Day Pass', amount: s.settings.walkInPrice, method, kind: 'walk-in' }, at),
              ...s.payments,
            ],
          };
        });
      },

      addMeasurement(memberId, weightKg, date) {
        if (!allow(isStaff() || isSelf(memberId), 'log weigh-in')) return;
        if (!(weightKg > 20 && weightKg < 350) || date > todayISO()) return;
        const name = stateRef.current.members.find((m) => m.id === memberId)?.name ?? 'member';
        commit(isSelf(memberId) ? `Logged a weigh-in: ${weightKg} kg` : `Logged weigh-in for ${name}: ${weightKg} kg`, (s) => ({
          ...s,
          measurements: [{ id: uid(), memberId, date, weightKg }, ...s.measurements].sort((a, b) => b.date.localeCompare(a.date)),
        }));
      },

      deleteMeasurement(id) {
        const owner = stateRef.current.measurements.find((m) => m.id === id)?.memberId;
        if (!allow(isStaff() || isSelf(owner), 'delete weigh-in')) return;
        commit('Removed a weigh-in entry', (s) => ({ ...s, measurements: s.measurements.filter((m) => m.id !== id) }));
      },

      savePlan(plan) {
        if (!allow(isAdmin(), 'save plan')) return;
        commit(plan.id ? `Edited plan ${plan.name}` : `Created plan ${plan.name}`, (s) =>
          plan.id
            ? { ...s, plans: s.plans.map((p) => (p.id === plan.id ? { ...p, ...plan, id: p.id } : p)) }
            : { ...s, plans: [...s.plans, { ...plan, id: uid() }] },
        );
      },

      deletePlan(id) {
        if (!allow(isAdmin(), 'delete plan')) return;
        if (stateRef.current.members.some((m) => m.planId === id)) return;
        const name = stateRef.current.plans.find((p) => p.id === id)?.name ?? 'plan';
        commit(`Deleted plan ${name}`, (s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
      },

      updateSettings(patch) {
        if (!allow(isAdmin(), 'update settings')) return;
        commit('Updated gym settings', (s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },

      saveTrainer(t) {
        if (!allow(isAdmin(), 'save trainer')) return;
        commit(t.id ? `Edited trainer ${t.name}` : `Added trainer ${t.name}`, (s) =>
          t.id
            ? { ...s, trainers: s.trainers.map((x) => (x.id === t.id ? { ...x, ...t, id: x.id } : x)) }
            : { ...s, trainers: [...s.trainers, { ...t, id: uid() }] },
        );
      },

      deleteTrainer(id) {
        if (!allow(isAdmin(), 'delete trainer')) return;
        if (stateRef.current.classes.some((c) => c.trainerId === id)) return;
        const name = stateRef.current.trainers.find((t) => t.id === id)?.name ?? 'trainer';
        commit(`Removed trainer ${name}`, (s) => ({ ...s, trainers: s.trainers.filter((t) => t.id !== id) }));
      },

      saveClass(c) {
        if (!allow(isAdmin(), 'save class')) return;
        commit(c.id ? `Edited class ${c.name}` : `Created class ${c.name}`, (s) =>
          c.id
            ? { ...s, classes: s.classes.map((x) => (x.id === c.id ? { ...x, ...c, id: x.id } : x)) }
            : { ...s, classes: [...s.classes, { ...c, id: uid() }] },
        );
      },

      deleteClass(id) {
        if (!allow(isAdmin(), 'delete class')) return;
        const name = stateRef.current.classes.find((c) => c.id === id)?.name ?? 'class';
        commit(`Deleted class ${name}`, (s) => ({
          ...s,
          classes: s.classes.filter((c) => c.id !== id),
          bookings: s.bookings.filter((b) => b.classId !== id),
        }));
      },

      async book(classId, memberId, date) {
        if (!allow(isStaff() || isSelf(memberId), 'book class')) return 'denied';
        const s0 = stateRef.current;
        const cls = s0.classes.find((c) => c.id === classId);
        const member = s0.members.find((m) => m.id === memberId);
        if (!cls || !member) return 'full';
        if (date < todayISO()) return 'denied';
        if (member.expiryDate < date) return 'expired';
        const sessionBookings = s0.bookings.filter((b) => b.classId === classId && b.date === date);
        if (sessionBookings.some((b) => b.memberId === memberId)) return 'duplicate';
        if (sessionBookings.length >= cls.capacity) return 'full';
        const booking: Booking = { id: uid(), classId, memberId, date };
        const text = isSelf(memberId)
          ? `Booked a slot in ${cls.name} (${fmtDate(date)})`
          : `Booked ${member.name} into ${cls.name} (${fmtDate(date)})`;
        commit(text, (s) => ({ ...s, bookings: [...s.bookings, booking] }));
        return 'ok';
      },

      unbook(bookingId) {
        const s0 = stateRef.current;
        const b = s0.bookings.find((x) => x.id === bookingId);
        if (!b || !allow(isStaff() || (isSelf(b.memberId) && b.date >= todayISO()), 'cancel booking')) return;
        const member = s0.members.find((m) => m.id === b.memberId);
        const cls = s0.classes.find((c) => c.id === b.classId);
        const text = isSelf(b.memberId)
          ? `Cancelled their slot in ${cls?.name ?? 'a class'}`
          : `Cancelled ${member?.name ?? 'a member'}'s booking for ${cls?.name ?? 'a class'}`;
        commit(text, (s) => ({ ...s, bookings: s.bookings.filter((x) => x.id !== bookingId) }));
      },

      async saveUser(u) {
        if (!allow(isAdmin(), 'manage staff accounts')) return 'Not allowed.';
        if (u.password) {
          const err = checkPassword(u.password, u.username);
          if (err) return err;
        } else if (!u.id) return 'Set a temporary password.';
        const passwordHash = u.password ? await hashSecret(u.password) : undefined;
        commit(u.id ? `Edited staff account ${u.username}` : `Created staff account ${u.username}`, (s) => {
          if (u.id) {
            return {
              ...s,
              users: s.users.map((x) =>
                x.id === u.id
                  ? {
                      ...x,
                      name: u.name,
                      username: u.username,
                      role: u.role,
                      passwordHash: passwordHash ?? x.passwordHash,
                      // a password set by an admin is temporary: the user must change it at next sign-in
                      mustChangePassword: passwordHash && x.id !== userRef.current?.id ? true : x.mustChangePassword,
                    }
                  : x,
              ),
            };
          }
          return {
            ...s,
            users: [...s.users, { id: uid(), name: u.name, username: u.username, role: u.role, passwordHash: passwordHash!, mustChangePassword: true }],
          };
        });
        return null;
      },

      deleteUser(id) {
        if (!allow(isAdmin() && id !== userRef.current?.id, 'delete staff account')) return;
        const name = stateRef.current.users.find((u) => u.id === id)?.username ?? 'account';
        commit(`Deleted staff account ${name}`, (s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }));
      },

      submitPrivacyRequest(type, details) {
        const m = memberRef.current;
        if (!allow(!!m, 'submit privacy request') || !m) return;
        const req: PrivacyRequest = {
          id: uid(), memberId: m.id, memberName: m.name, type, details: details.trim().slice(0, 1000), status: 'pending', createdAt: new Date().toISOString(),
        };
        commit(`Submitted a data ${type} request`, (s) => ({ ...s, privacyRequests: [req, ...s.privacyRequests] }));
      },

      resolvePrivacyRequest(id, approve, note) {
        if (!allow(isAdmin(), 'resolve privacy request')) return;
        const req = stateRef.current.privacyRequests.find((r) => r.id === id);
        if (!req || req.status !== 'pending') return;
        const resolved = (s: State): State => ({
          ...s,
          privacyRequests: s.privacyRequests.map((r) =>
            r.id === id
              ? { ...r, status: approve ? 'completed' : 'rejected', resolvedAt: new Date().toISOString(), resolvedBy: who(), note: note.trim() }
              : r,
          ),
        });
        commit(`${approve ? 'Completed' : 'Rejected'} a data ${req.type} request`, (s) => {
          const marked = resolved(s);
          return approve && req.type === 'erasure' && req.memberId ? eraseMember(marked, req.memberId) : marked;
        });
      },

      async applyRetention() {
        if (!allow(isAdmin(), 'apply retention')) return { checkIns: 0, activity: 0, bookings: 0 };
        const months = stateRef.current.settings.retentionMonths ?? 24;
        const cutoffDay = addDays(todayISO(), -Math.round(months * 30.44));
        const cutoffTs = new Date(cutoffDay + 'T00:00:00').toISOString();
        const s0 = stateRef.current;
        const counts = {
          checkIns: s0.checkIns.filter((c) => c.at < cutoffTs).length,
          activity: s0.activity.filter((a) => a.at < cutoffTs).length,
          bookings: s0.bookings.filter((b) => b.date < cutoffDay).length,
        };
        commit(`Applied ${months}-month retention: removed ${counts.checkIns} check-ins, ${counts.bookings} bookings, ${counts.activity} log entries`, (s) => ({
          ...s,
          checkIns: s.checkIns.filter((c) => c.at >= cutoffTs),
          bookings: s.bookings.filter((b) => b.date >= cutoffDay),
          activity: s.activity.filter((a) => a.at >= cutoffTs),
        }));
        return counts;
      },

      importData(data) {
        if (!allow(isAdmin(), 'restore backup') || !isValidState(data)) return;
        commit('Restored data from a backup file', () => data);
      },

      resetDemo() {
        if (!allow(isAdmin(), 'reset demo data')) return;
        const fresh = createSeed();
        setState(fresh);
        if (!fresh.users.some((u) => u.id === userRef.current?.id)) setSession(null);
      },
    };
  }, []);

  /* ----- idle timeout + absolute session lifetime ----- */
  useEffect(() => {
    if (!session) return;
    const bump = () => {
      lastActiveRef.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    let persisted = 0;

    const tick = () => {
      const now = Date.now();
      const limit = IDLE_LIMIT_MS[session.kind];
      const left = lastActiveRef.current + limit - now;
      if (left <= 0 || now - session.issuedAt > ABSOLUTE_LIMIT_MS) {
        actions.logout('You were signed out for security after a period of inactivity. Please sign in again.');
        return;
      }
      setIdleSecondsLeft(left <= IDLE_WARNING_MS ? Math.ceil(left / 1000) : null);
      if (lastActiveRef.current - persisted > 10_000) {
        persisted = lastActiveRef.current;
        persistSession({ ...session, lastActive: lastActiveRef.current });
      }
    };
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [session, actions, persistSession]);

  // A deleted account loses its session immediately.
  useEffect(() => {
    if (session && !currentUser && !currentMember) setSession(null);
  }, [session, currentUser, currentMember]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      mode: 'demo',
      actions,
      currentUser,
      currentMember,
      notice,
      idleSecondsLeft,
      loading: false,
      mfaPending: false,
      noAccess: false,
      error: null,
      clearError: () => {},
    }),
    [state, actions, currentUser, currentMember, notice, idleSecondsLeft],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function useCan() {
  const { currentUser } = useStore();
  return (p: Permission) => can(currentUser?.role, p);
}
