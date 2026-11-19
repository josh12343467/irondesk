export type PaymentMethod = 'Cash' | 'GCash' | 'Card';
export type MemberStatus = 'active' | 'expiring' | 'expired';
export type Role = 'admin' | 'staff';
export type Tone = 'lime' | 'sky' | 'violet' | 'amber' | 'rose' | 'teal';

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  price: number;
}

/** A recorded consent decision, kept as evidence (who, what version, when). */
export interface Consent {
  type: 'terms' | 'privacy' | 'health' | 'marketing';
  version: string;
  granted: boolean;
  at: string; // ISO timestamp
  recordedBy: string; // staff name, or "member (self)"
}

export interface HealthDeclaration {
  answers: boolean[]; // one per HEALTH_QUESTIONS entry; true = "yes"
  flagged: boolean; // any "yes"
  clearanceAcknowledged: boolean; // member was advised to get medical clearance
  at: string;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  joinedAt: string; // YYYY-MM-DD
  planId: string;
  expiryDate: string; // YYYY-MM-DD (last valid day)
  heightCm?: number;
  birthDate?: string; // YYYY-MM-DD
  guardianName?: string; // required when the member is a minor
  userId?: string; // cloud mode: linked Supabase Auth account (set once they verify their email)
  pinHash?: string; // demo mode: member portal PIN (PBKDF2), unset = no portal access
  mustChangePin?: boolean; // temporary PIN issued by staff
  consents?: Consent[];
  health?: HealthDeclaration;
}

export interface Payment {
  id: string;
  memberId: string | null; // null = walk-in guest or erased member
  label: string; // payer name
  planName: string;
  amount: number;
  method: PaymentMethod;
  kind: 'new' | 'renewal' | 'walk-in';
  date: string; // ISO timestamp
  receivedBy?: string;
}

export interface CheckIn {
  id: string;
  memberId: string | null; // null = walk-in guest
  guestName?: string;
  at: string; // ISO timestamp
  via?: 'search' | 'qr';
}

export interface User {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  role: Role;
  mustChangePassword?: boolean;
}

export interface Trainer {
  id: string;
  name: string;
  specialty: string;
  phone: string;
}

export interface GymClass {
  id: string;
  name: string;
  trainerId: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  start: string; // HH:MM, 24h
  durationMin: number;
  capacity: number;
  tone: Tone;
}

export interface Booking {
  id: string;
  classId: string;
  memberId: string;
  date: string; // YYYY-MM-DD of the session
}

export interface Measurement {
  id: string;
  memberId: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
}

export interface Activity {
  id: string;
  at: string; // ISO timestamp
  userName: string;
  text: string;
}

/** Data-subject request under the Data Privacy Act (RA 10173). */
export interface PrivacyRequest {
  id: string;
  memberId: string | null;
  memberName: string;
  type: 'erasure' | 'correction' | 'objection';
  details: string;
  status: 'pending' | 'completed' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
}

export interface Settings {
  gymName: string;
  walkInPrice: number;
  demoMemberId?: string; // member shown on the login screen's demo button
  legalName?: string; // registered business name
  address?: string;
  dpoName?: string; // Data Protection Officer
  dpoEmail?: string;
  retentionMonths?: number; // attendance + activity log retention
}

export interface State {
  plans: Plan[];
  members: Member[];
  payments: Payment[];
  checkIns: CheckIn[];
  users: User[];
  trainers: Trainer[];
  classes: GymClass[];
  bookings: Booking[];
  measurements: Measurement[];
  activity: Activity[];
  privacyRequests: PrivacyRequest[];
  settings: Settings;
}
