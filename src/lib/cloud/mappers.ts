/* Row (snake_case, Postgres) → app model (camelCase) mapping. */
import type {
  Activity, Booking, CheckIn, Consent, GymClass, Measurement, Member, Payment, Plan, PrivacyRequest, Settings, Tone, Trainer, User,
} from '../../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export const toSettings = (r: Row | null): Settings => ({
  gymName: r?.gym_name ?? 'IronDesk',
  walkInPrice: r?.walk_in_price ?? 100,
  legalName: r?.legal_name ?? '',
  address: r?.address ?? '',
  dpoName: r?.dpo_name ?? '',
  dpoEmail: r?.dpo_email ?? '',
  retentionMonths: r?.retention_months ?? 24,
});

export const fromSettings = (s: Partial<Settings>) => {
  const out: Row = {};
  if (s.gymName !== undefined) out.gym_name = s.gymName;
  if (s.walkInPrice !== undefined) out.walk_in_price = s.walkInPrice;
  if (s.legalName !== undefined) out.legal_name = s.legalName;
  if (s.address !== undefined) out.address = s.address;
  if (s.dpoName !== undefined) out.dpo_name = s.dpoName;
  if (s.dpoEmail !== undefined) out.dpo_email = s.dpoEmail;
  if (s.retentionMonths !== undefined) out.retention_months = s.retentionMonths;
  return out;
};

export const toPlan = (r: Row): Plan => ({ id: r.id, name: r.name, durationDays: r.duration_days, price: r.price });

export const toConsent = (r: Row): Consent => ({
  type: r.type, version: r.version, granted: r.granted, at: r.created_at, recordedBy: r.recorded_by,
});

export function toMember(r: Row, consents: Consent[], health?: Row): Member {
  return {
    id: r.id,
    userId: r.user_id ?? undefined,
    name: r.name,
    phone: r.phone,
    email: r.email,
    notes: r.notes,
    joinedAt: r.joined_at,
    planId: r.plan_id,
    expiryDate: r.expiry_date,
    heightCm: r.height_cm ?? undefined,
    birthDate: r.birth_date ?? undefined,
    guardianName: r.guardian_name ?? undefined,
    consents,
    // full answers only arrive for admins and the member themselves (RLS); staff get the flag
    health: health
      ? { answers: health.answers, flagged: health.flagged, clearanceAcknowledged: health.clearance_acknowledged, at: health.declared_at }
      : { answers: [], flagged: r.health_flagged, clearanceAcknowledged: r.clearance_acknowledged, at: r.created_at },
  };
}

export const fromMemberPatch = (p: Partial<Member>) => {
  const out: Row = {};
  if (p.name !== undefined) out.name = p.name;
  if (p.phone !== undefined) out.phone = p.phone;
  if (p.email !== undefined) out.email = p.email.toLowerCase();
  if (p.notes !== undefined) out.notes = p.notes;
  if ('heightCm' in p) out.height_cm = p.heightCm ?? null;
  if ('birthDate' in p) out.birth_date = p.birthDate ?? null;
  if ('guardianName' in p) out.guardian_name = p.guardianName ?? null;
  return out;
};

export const toPayment = (r: Row): Payment => ({
  id: r.id, memberId: r.member_id, label: r.label, planName: r.plan_name, amount: r.amount,
  method: r.method, kind: r.kind, date: r.created_at, receivedBy: r.received_by,
});

export const toCheckIn = (r: Row): CheckIn => ({
  id: r.id, memberId: r.member_id, guestName: r.guest_name ?? undefined, at: r.created_at, via: r.via ?? undefined,
});

export const toTrainer = (r: Row): Trainer => ({ id: r.id, name: r.name, specialty: r.specialty, phone: r.phone });

export const toClass = (r: Row): GymClass => ({
  id: r.id, name: r.name, trainerId: r.trainer_id, weekday: r.weekday, start: r.start_time,
  durationMin: r.duration_min, capacity: r.capacity, tone: r.tone as Tone,
});

export const fromClass = (c: Omit<GymClass, 'id'>) => ({
  name: c.name, trainer_id: c.trainerId, weekday: c.weekday, start_time: c.start,
  duration_min: c.durationMin, capacity: c.capacity, tone: c.tone,
});

export const toBooking = (r: Row): Booking => ({ id: r.id, classId: r.class_id, memberId: r.member_id, date: r.session_date });

export const toMeasurement = (r: Row): Measurement => ({
  id: r.id, memberId: r.member_id, date: r.measured_on, weightKg: Number(r.weight_kg),
});

export const toRequest = (r: Row): PrivacyRequest => ({
  id: r.id, memberId: r.member_id, memberName: r.member_name, type: r.type, details: r.details, status: r.status,
  createdAt: r.created_at, resolvedAt: r.resolved_at ?? undefined, resolvedBy: r.resolved_by ?? undefined, note: r.note ?? undefined,
});

export const toActivity = (r: Row): Activity => ({ id: String(r.id), at: r.created_at, userName: r.actor_name, text: r.summary });

export const toUser = (r: Row): User => ({
  id: r.user_id, name: r.name, username: r.email, role: r.role, passwordHash: '', mustChangePassword: r.must_change_password,
});
