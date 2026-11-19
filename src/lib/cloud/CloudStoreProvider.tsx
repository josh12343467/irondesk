/**
 * Cloud implementation of the store, backed by Supabase.
 *
 * It exposes exactly the same `Store` shape as the demo store so every page works unchanged.
 * Authorisation is enforced by Postgres Row Level Security + SECURITY DEFINER functions
 * (see supabase/migrations). Whatever a user is allowed to read is loaded into memory, and
 * Realtime keeps every open screen in sync across devices.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Booking, Consent, State } from '../../types';
import { StoreContext, type Actions, type BookResult, type Store } from '../store';
import { ISSUED_KEY, friendlyError, markSignedIn, supabase } from './client';
import * as map from './mappers';
import { LEGAL_VERSION } from '../legal';
import { addDays, todayISO } from '../utils';
import { ABSOLUTE_LIMIT_MS, IDLE_LIMIT_MS, IDLE_WARNING_MS, checkPassword, clearFailures, lockRemaining, recordFailure } from '../security';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Res = { data: any; error: any };
const must = (r: Res) => {
  if (r.error) throw r.error;
  return r.data;
};

const emptyState = (settings = map.toSettings(null)): State => ({
  plans: [], members: [], payments: [], checkIns: [], users: [], trainers: [], classes: [], bookings: [],
  measurements: [], activity: [], privacyRequests: [], settings,
});

/** Load everything this user may see. RLS decides what that is. */
async function fetchAll(uid: string): Promise<State> {
  const sb = supabase();
  const today = todayISO();
  const r = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('plans').select('*').order('price'),
    sb.from('members').select('*').order('name'),
    sb.from('payments').select('*').order('created_at', { ascending: false }).limit(5000),
    sb.from('check_ins').select('*').order('created_at', { ascending: false }).limit(5000),
    sb.from('trainers').select('*').order('name'),
    sb.from('classes').select('*'),
    sb.from('bookings').select('*').gte('session_date', addDays(today, -120)),
    sb.from('measurements').select('*').order('measured_on', { ascending: false }),
    sb.from('consents').select('*').order('created_at'),
    sb.from('health_declarations').select('*'),
    sb.from('privacy_requests').select('*').order('created_at', { ascending: false }),
    sb.from('activity_log').select('*').order('created_at', { ascending: false }).limit(400),
    sb.from('staff').select('*'),
    sb.rpc('session_counts', { p_from: today, p_to: addDays(today, 13) }),
  ]);
  const [settings, plans, members, payments, checkIns, trainers, classes, bookings, measurements, consents, health, requests, activity, staff, counts] =
    r.map((x) => must(x as Res) ?? []);

  const consentsBy = new Map<string, Consent[]>();
  for (const c of consents) consentsBy.set(c.member_id, [...(consentsBy.get(c.member_id) ?? []), map.toConsent(c)]);
  const healthBy = new Map<string, any>(health.map((h: any) => [h.member_id, h]));

  const isStaff = staff.some((s: any) => s.user_id === uid);
  const mapped: Booking[] = bookings.map(map.toBooking);
  // Members can only read their own bookings, but the schedule needs slot counts:
  // add anonymous placeholders so "slots left" is right without exposing who booked.
  if (!isStaff) {
    for (const c of counts as { class_id: string; session_date: string; booked: number }[]) {
      const own = mapped.filter((b) => b.classId === c.class_id && b.date === c.session_date).length;
      for (let i = 0; i < c.booked - own; i++) {
        mapped.push({ id: `other-${c.class_id}-${c.session_date}-${i}`, classId: c.class_id, memberId: '__other__', date: c.session_date });
      }
    }
  }

  return {
    settings: map.toSettings(settings),
    plans: plans.map(map.toPlan),
    members: members.map((m: any) => map.toMember(m, consentsBy.get(m.id) ?? [], healthBy.get(m.id))),
    payments: payments.map(map.toPayment),
    checkIns: checkIns.map(map.toCheckIn),
    trainers: trainers.map(map.toTrainer),
    classes: classes.map(map.toClass),
    bookings: mapped,
    measurements: measurements.map(map.toMeasurement),
    privacyRequests: requests.map(map.toRequest),
    activity: activity.map(map.toActivity),
    users: staff.map(map.toUser),
  };
}

export function CloudStoreProvider({ children }: { children: ReactNode }) {
  const sb = supabase();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [aal, setAal] = useState<{ token: string; current: string | null; next: string | null } | null>(null);
  const [state, setState] = useState<State>(emptyState());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  const uid = session?.user.id ?? null;
  const token = session?.access_token ?? '';
  const aalReady = !!session && aal?.token === token;
  const mfaPending = aalReady && aal!.current === 'aal1' && aal!.next === 'aal2';

  /* ----- public settings for the login screen (anon can read settings) ----- */
  useEffect(() => {
    sb.from('settings').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setState((s) => ({ ...s, settings: map.toSettings(data) }));
    });
  }, [sb]);

  /* ----- session ----- */
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      const issued = Number(localStorage.getItem(ISSUED_KEY) || 0);
      if (data.session && issued && Date.now() - issued > ABSOLUTE_LIMIT_MS) {
        sb.auth.signOut(); // absolute lifetime exceeded
        setNotice('Your session expired. Please sign in again.');
      } else setSession(data.session);
      setBooting(false);
    });
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  // Assurance level (aal1 = password/email code, aal2 = + authenticator) for this exact token.
  useEffect(() => {
    if (!session) return setAal(null);
    let alive = true;
    sb.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (alive) setAal({ token, current: data?.currentLevel ?? null, next: data?.nextLevel ?? null });
    });
    return () => {
      alive = false;
    };
  }, [sb, session, token]);

  /* ----- data ----- */
  const uidRef = useRef(uid);
  uidRef.current = uid;
  const refresh = useCallback(async () => {
    const id = uidRef.current;
    if (!id) return;
    try {
      const next = await fetchAll(id);
      if (uidRef.current === id) {
        setState(next);
        setLoadedFor(id);
      }
    } catch (e) {
      setError(friendlyError(e));
      setLoadedFor(id);
    }
  }, []);

  useEffect(() => {
    if (!uid) {
      setState((s) => emptyState(s.settings));
      setLoadedFor(null);
      return;
    }
    if (aalReady && !mfaPending) refresh();
  }, [uid, aalReady, mfaPending, refresh]);

  // Live updates from other devices (front desk ↔ member phones). RLS applies to Realtime too.
  useEffect(() => {
    if (!uid || !aalReady || mfaPending) return;
    let t: number | undefined;
    const channel = sb
      .channel('irondesk-db')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        window.clearTimeout(t);
        t = window.setTimeout(refresh, 400);
      })
      .subscribe();
    return () => {
      window.clearTimeout(t);
      sb.removeChannel(channel);
    };
  }, [sb, uid, aalReady, mfaPending, refresh]);

  const currentUser = uid ? state.users.find((u) => u.id === uid) ?? null : null;
  const currentMember = uid && !currentUser ? state.members.find((m) => m.userId === uid) ?? null : null;
  const userRef = useRef(currentUser);
  userRef.current = currentUser;
  const memberRef = useRef(currentMember);
  memberRef.current = currentMember;
  const aalRef = useRef(aal);
  aalRef.current = aal;
  const lastActiveRef = useRef(Date.now());

  /* ----- actions ----- */
  const actions = useMemo<Actions>(() => {
    /** Run a mutation, surface errors as a toast, then reload. */
    const run = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        const out = await fn();
        await refresh();
        return out;
      } catch (e) {
        setError(friendlyError(e));
        return fallback;
      }
    };
    const exec = (fn: () => PromiseLike<Res>) => run(async () => void must(await fn()), undefined);

    return {
      async login(email, password) {
        const key = `staff:${email.trim().toLowerCase()}`;
        const lockedMs = lockRemaining(key);
        if (lockedMs) return { ok: false, lockedMs };
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (err) {
          const r = recordFailure(key);
          return r.locked ? { ok: false, lockedMs: lockRemaining(key) } : { ok: false, attemptsLeft: r.attemptsLeft };
        }
        clearFailures(key);
        setNotice(null);
        markSignedIn();
        await sb.rpc('log_sign_in');
        return { ok: true };
      },

      async memberLogin() {
        return { ok: false }; // members use email codes in cloud mode (lib/cloud/auth.ts)
      },

      async logout(reason) {
        await sb.auth.signOut();
        try {
          localStorage.removeItem(ISSUED_KEY);
        } catch {
          /* ignore */
        }
        setIdleSecondsLeft(null);
        setNotice(reason ?? null);
      },

      clearNotice: () => setNotice(null),
      stayActive: () => {
        lastActiveRef.current = Date.now();
        setIdleSecondsLeft(null);
      },

      async changeOwnPassword(current, next) {
        const u = userRef.current;
        if (!u) return 'Not signed in.';
        const err = checkPassword(next, u.username.split('@')[0]);
        if (err) return err;
        if (current === next) return 'Choose a password different from the current one.';
        // Re-check the current password, unless the session is already MFA-verified (re-signing in would drop it to aal1).
        if (aalRef.current?.current !== 'aal2') {
          const { error: e1 } = await sb.auth.signInWithPassword({ email: u.username, password: current });
          if (e1) return 'Current password is wrong.';
        }
        const { error: e2 } = await sb.auth.updateUser({ password: next });
        if (e2) return friendlyError(e2);
        await sb.rpc('password_changed');
        await refresh();
        return null;
      },

      async changeOwnPin() {
        return 'Members sign in with an email code; there is no PIN in cloud mode.';
      },
      async issueMemberPin() {
        return null;
      },

      addMember: (input) =>
        run(async () => {
          const r = await sb.rpc('register_member', {
            p_name: input.name,
            p_phone: input.phone,
            p_email: input.email,
            p_notes: input.notes,
            p_plan_id: input.planId,
            p_method: input.method,
            p_height_cm: input.heightCm ?? null,
            p_birth_date: input.birthDate,
            p_guardian_name: input.guardianName ?? null,
            p_health_answers: input.healthAnswers,
            p_clearance: input.clearanceAcknowledged,
            p_marketing: input.marketingConsent,
            p_version: LEGAL_VERSION,
          });
          return must(r) as string;
        }, null),

      updateMember: (id, patch) => {
        const self = memberRef.current;
        if (self && self.id === id) {
          return exec(() => sb.rpc('update_my_profile', { p_phone: patch.phone ?? self.phone, p_height_cm: patch.heightCm ?? self.heightCm ?? null }));
        }
        return exec(() => sb.from('members').update(map.fromMemberPatch(patch)).eq('id', id));
      },

      setMarketingConsent: (memberId, granted) =>
        exec(() => sb.rpc('set_marketing_consent', { p_member_id: memberId, p_granted: granted, p_version: LEGAL_VERSION })),
      deleteMember: (id) => exec(() => sb.rpc('erase_member', { p_member_id: id })),
      renew: (memberId, planId, method) => exec(() => sb.rpc('renew_membership', { p_member_id: memberId, p_plan_id: planId, p_method: method })),
      checkIn: (memberId, via = 'search') =>
        run(async () => {
          const res = must(await sb.rpc('check_in_member', { p_member_id: memberId, p_via: via }));
          if (res !== 'ok') setError(res === 'expired' ? 'Membership has expired.' : res === 'duplicate' ? 'Already checked in today.' : 'Member not found.');
        }, undefined),
      walkIn: (guestName, method) => exec(() => sb.rpc('record_walk_in', { p_guest_name: guestName, p_method: method })),

      addMeasurement: (memberId, weightKg, date) =>
        exec(() => sb.from('measurements').insert({ member_id: memberId, weight_kg: weightKg, measured_on: date })),
      deleteMeasurement: (id) => exec(() => sb.from('measurements').delete().eq('id', id)),

      savePlan: ({ id, name, durationDays, price }) => {
        const row = { name, duration_days: durationDays, price };
        return exec(() => (id ? sb.from('plans').update(row).eq('id', id) : sb.from('plans').insert(row)));
      },
      deletePlan: (id) => exec(() => sb.from('plans').delete().eq('id', id)),
      updateSettings: (patch) => exec(() => sb.from('settings').update({ ...map.fromSettings(patch), updated_at: new Date().toISOString() }).eq('id', 1)),

      saveTrainer: ({ id, name, specialty, phone }) => {
        const row = { name, specialty, phone };
        return exec(() => (id ? sb.from('trainers').update(row).eq('id', id) : sb.from('trainers').insert(row)));
      },
      deleteTrainer: (id) => exec(() => sb.from('trainers').delete().eq('id', id)),
      saveClass: ({ id, ...c }) => {
        const row = map.fromClass(c);
        return exec(() => (id ? sb.from('classes').update(row).eq('id', id) : sb.from('classes').insert(row)));
      },
      deleteClass: (id) => exec(() => sb.from('classes').delete().eq('id', id)),

      book: (classId, memberId, date) =>
        run(async () => must(await sb.rpc('book_class', { p_class_id: classId, p_member_id: memberId, p_date: date })) as BookResult, 'denied' as BookResult),
      unbook: (bookingId) => exec(() => sb.rpc('cancel_booking', { p_booking_id: bookingId })),

      async saveUser(u) {
        const { error: err } = await sb.functions.invoke('admin-users', {
          body: { action: u.id ? 'update' : 'create', id: u.id, email: u.username, name: u.name, role: u.role, password: u.password },
        });
        if (err) {
          try {
            const body = await (err as { context?: Response }).context?.json();
            if (body?.error) return String(body.error);
          } catch {
            /* fall through */
          }
          return 'Could not save the account. Is the admin-users function deployed?';
        }
        await refresh();
        return null;
      },
      deleteUser: (id) =>
        run(async () => {
          const { error: err } = await sb.functions.invoke('admin-users', { body: { action: 'delete', id } });
          if (err) throw new Error('Could not delete the account.');
        }, undefined),

      submitPrivacyRequest: (type, details) => exec(() => sb.rpc('submit_privacy_request', { p_type: type, p_details: details })),
      resolvePrivacyRequest: (id, approve, note) => exec(() => sb.rpc('resolve_privacy_request', { p_id: id, p_approve: approve, p_note: note })),
      applyRetention: () =>
        run(async () => {
          const r = must(await sb.rpc('apply_retention'));
          return { checkIns: r.checkIns ?? 0, bookings: r.bookings ?? 0, activity: r.activity ?? 0 };
        }, { checkIns: 0, bookings: 0, activity: 0 }),

      importData: () => setError('In cloud mode, restore backups from the Supabase dashboard (Database → Backups).'),
      resetDemo: () => {},
    };
  }, [sb, refresh]);

  /* ----- idle timeout ----- */
  const kind: 'staff' | 'member' = currentUser ? 'staff' : 'member';
  useEffect(() => {
    if (!uid) return;
    lastActiveRef.current = Date.now();
    const bump = () => {
      lastActiveRef.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(() => {
      const issued = Number(localStorage.getItem(ISSUED_KEY) || Date.now());
      const left = lastActiveRef.current + IDLE_LIMIT_MS[kind] - Date.now();
      if (left <= 0 || Date.now() - issued > ABSOLUTE_LIMIT_MS) {
        actions.logout('Na-sign out ka para sa security dahil matagal kang walang activity. Mag-sign in ulit.');
        return;
      }
      setIdleSecondsLeft(left <= IDLE_WARNING_MS ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [uid, kind, actions]);

  const loading = booting || (!!uid && !aalReady) || (!!uid && !mfaPending && loadedFor !== uid);
  const noAccess = !!uid && !mfaPending && loadedFor === uid && !currentUser && !currentMember;

  const value = useMemo<Store>(
    () => ({
      ...state,
      mode: 'cloud',
      actions,
      currentUser,
      currentMember,
      notice,
      idleSecondsLeft,
      loading,
      mfaPending,
      noAccess,
      error,
      clearError: () => setError(null),
    }),
    [state, actions, currentUser, currentMember, notice, idleSecondsLeft, loading, mfaPending, noAccess, error],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
