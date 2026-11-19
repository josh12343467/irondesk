import type { Booking, CheckIn, GymClass, Measurement, Member, Payment, PaymentMethod, Plan, State, Trainer, User } from '../types';
import { addDays, parseISO, todayISO, uid } from './utils';
import { HEALTH_QUESTIONS, LEGAL_VERSION } from './legal';

/** Small deterministic PRNG so the demo data looks the same on every reset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Juan', 'Maria', 'Jose', 'Ana', 'Mark', 'Angel', 'John Paul', 'Kristine', 'Miguel', 'Patricia',
  'Carlo', 'Bea', 'Paolo', 'Andrea', 'Rafael', 'Nicole', 'Joshua', 'Camille', 'Gabriel', 'Erika',
  'Daniel', 'Trisha', 'Kevin', 'Sofia', 'Renz', 'Janine', 'Christian', 'Aira', 'Bryan', 'Hazel',
];
const LAST = [
  'Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Bautista', 'Villanueva', 'Ramos', 'Aquino', 'Navarro',
  'Castillo', 'Flores', 'Torres', 'Rivera', 'Gonzales', 'Lopez', 'Cruz', 'Morales', 'Fernandez', 'Pascual',
];
// Weighted toward the usual gym rush hours (early morning + after work)
const HOURS = [5, 6, 6, 6, 7, 7, 8, 9, 10, 12, 15, 16, 17, 17, 18, 18, 18, 18, 19, 19, 19, 20, 21];

export const DEFAULT_PLANS: Plan[] = [
  { id: 'monthly', name: 'Monthly', durationDays: 30, price: 1200 },
  { id: 'quarterly', name: 'Quarterly', durationDays: 90, price: 3200 },
  { id: 'semi', name: 'Semi-Annual', durationDays: 180, price: 6000 },
  { id: 'annual', name: 'Annual', durationDays: 365, price: 10500 },
];

export function createSeed(): State {
  const rand = mulberry32(20261119);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const today = todayISO();
  const now = new Date();
  const stamp = (iso: string, hour: number) => {
    const d = parseISO(iso);
    d.setHours(hour, Math.floor(rand() * 60));
    return d.toISOString();
  };

  const plans = DEFAULT_PLANS.map((p) => ({ ...p }));
  const planPool = ['monthly', 'monthly', 'monthly', 'monthly', 'quarterly', 'quarterly', 'semi', 'annual'];
  const methods: PaymentMethod[] = ['Cash', 'Cash', 'GCash', 'GCash', 'GCash', 'Card'];

  const members: Member[] = [];
  const payments: Payment[] = [];
  const checkIns: CheckIn[] = [];

  FIRST.forEach((first, i) => {
    const last = pick(LAST);
    const name = `${first} ${last}`;
    const planId = pick(planPool);
    const plan = plans.find((p) => p.id === planId)!;
    const id = uid() + i;
    const joinedAt = addDays(today, -Math.floor(12 + rand() * 340));

    const pay = (start: string, kind: Payment['kind']) =>
      payments.push({
        id: uid() + payments.length,
        memberId: id,
        label: name,
        planName: plan.name,
        amount: plan.price,
        method: pick(methods),
        kind,
        date: stamp(start, 7 + Math.floor(rand() * 13)),
      });

    let start = joinedAt;
    let expiry = addDays(start, plan.durationDays);
    pay(start, 'new');
    // most members keep renewing; some drop off and expire
    while (expiry < today && rand() < 0.82) {
      start = expiry;
      expiry = addDays(start, plan.durationDays);
      pay(start, 'renewal');
    }
    // guarantee a few "expiring soon" members so the dashboard has something to show
    if (i < 3) expiry = addDays(today, 2 + i * 2);

    const handle = `${first}.${last}`.toLowerCase().replace(/\s+/g, '');
    members.push({
      id,
      name,
      phone: '09' + String(Math.floor(100000000 + rand() * 899999999)),
      email: `${handle}@example.com`,
      notes: i % 7 === 0 ? 'Prefers morning sessions' : '',
      joinedAt,
      planId: plan.id,
      expiryDate: expiry,
    });
  });

  // ~3 weeks of attendance + walk-ins
  for (let d = 20; d >= 0; d--) {
    const day = addDays(today, -d);
    for (const m of members) {
      if (m.joinedAt > day || m.expiryDate < day || rand() > 0.42) continue;
      const hour = pick(HOURS);
      if (d === 0 && hour >= now.getHours()) continue;
      checkIns.push({ id: uid() + checkIns.length, memberId: m.id, at: stamp(day, hour) });
    }
    const walkIns = Math.floor(rand() * 4);
    for (let w = 0; w < walkIns; w++) {
      const hour = pick(HOURS);
      if (d === 0 && hour >= now.getHours()) continue;
      const guest = `${pick(FIRST)} ${pick(LAST)}`;
      const at = stamp(day, hour);
      checkIns.push({ id: uid() + checkIns.length, memberId: null, guestName: guest, at });
      payments.push({
        id: uid() + payments.length,
        memberId: null,
        label: guest,
        planName: 'Day Pass',
        amount: 100,
        method: pick(methods),
        kind: 'walk-in',
        date: at,
      });
    }
  }

  /* ---------- body progress: height + monthly weigh-ins for some members ---------- */
  const measurements: Measurement[] = [];
  members.forEach((m, i) => {
    m.heightCm = 152 + Math.floor(rand() * 32);
    if (i % 2 !== 0) return;
    const goalLoss = rand() < 0.75; // most are cutting, some are bulking
    let w = Math.round((m.heightCm - 100) * (0.85 + rand() * 0.45));
    const entries = 3 + Math.floor(rand() * 5);
    for (let e = entries - 1; e >= 0; e--) {
      const date = addDays(today, -e * 28 - Math.floor(rand() * 5));
      if (date < m.joinedAt || date > m.expiryDate) continue; // only weigh in while a member
      measurements.push({ id: uid() + measurements.length, memberId: m.id, date, weightKg: Math.round(w * 10) / 10 });
      w += (goalLoss ? -1 : 0.6) * (0.4 + rand() * 1.4);
    }
  });

  /* ---------- trainers, weekly classes, bookings ---------- */
  const trainers: Trainer[] = [
    { id: 't-migs', name: 'Coach Migs Alonzo', specialty: 'Strength & Powerlifting', phone: '09171234501' },
    { id: 't-lea', name: 'Coach Lea Manalo', specialty: 'Zumba & Dance Fitness', phone: '09171234502' },
    { id: 't-rey', name: 'Coach Rey Salazar', specialty: 'Boxing & Muay Thai', phone: '09171234503' },
    { id: 't-jen', name: 'Coach Jen Ocampo', specialty: 'HIIT & Yoga', phone: '09171234504' },
  ];
  const classes: GymClass[] = [
    { id: 'c1', name: 'Morning HIIT', trainerId: 't-jen', weekday: 1, start: '06:30', durationMin: 45, capacity: 15, tone: 'amber' },
    { id: 'c2', name: 'Zumba Night', trainerId: 't-lea', weekday: 1, start: '18:30', durationMin: 60, capacity: 25, tone: 'rose' },
    { id: 'c3', name: 'Boxing Basics', trainerId: 't-rey', weekday: 2, start: '19:00', durationMin: 60, capacity: 12, tone: 'sky' },
    { id: 'c4', name: 'Powerlifting Clinic', trainerId: 't-migs', weekday: 3, start: '17:30', durationMin: 90, capacity: 8, tone: 'lime' },
    { id: 'c5', name: 'Yoga Flow', trainerId: 't-jen', weekday: 3, start: '07:00', durationMin: 60, capacity: 18, tone: 'teal' },
    { id: 'c6', name: 'Zumba Night', trainerId: 't-lea', weekday: 4, start: '18:30', durationMin: 60, capacity: 25, tone: 'rose' },
    { id: 'c7', name: 'Muay Thai', trainerId: 't-rey', weekday: 4, start: '19:30', durationMin: 75, capacity: 12, tone: 'violet' },
    { id: 'c8', name: 'Morning HIIT', trainerId: 't-jen', weekday: 5, start: '06:30', durationMin: 45, capacity: 15, tone: 'amber' },
    { id: 'c9', name: 'Strength 101', trainerId: 't-migs', weekday: 6, start: '09:00', durationMin: 60, capacity: 10, tone: 'lime' },
    { id: 'c10', name: 'Weekend Boxing', trainerId: 't-rey', weekday: 6, start: '16:00', durationMin: 60, capacity: 12, tone: 'sky' },
    { id: 'c11', name: 'Sunday Yoga', trainerId: 't-jen', weekday: 0, start: '08:00', durationMin: 60, capacity: 18, tone: 'teal' },
  ];
  const bookings: Booking[] = [];
  for (let d = -21; d <= 6; d++) {
    const date = addDays(today, d);
    const weekday = parseISO(date).getDay();
    for (const c of classes.filter((x) => x.weekday === weekday)) {
      const eligible = members.filter((m) => m.joinedAt <= date && m.expiryDate >= date);
      const fill = d > 2 ? 0.2 + rand() * 0.3 : 0.45 + rand() * 0.55; // future sessions are still filling up
      const count = Math.min(c.capacity, Math.round(c.capacity * fill), eligible.length);
      const shuffled = [...eligible].sort(() => rand() - 0.5).slice(0, count);
      shuffled.forEach((m) => bookings.push({ id: uid() + bookings.length, classId: c.id, memberId: m.id, date }));
    }
  }

  /* ---------- staff accounts (demo) ---------- */
  // PBKDF2-SHA256 (600k iterations, random salt), precomputed so seeding stays synchronous: admin123 / staff123
  const users: User[] = [
    {
      id: 'u-admin', name: 'Ramon Villareal', username: 'admin', role: 'admin',
      passwordHash: 'pbkdf2-sha256$600000$7tqnSswmSYxnPJ8QyG5+aA==$5ZTeU6D9THnNdv4K3quxY/gOwTav8uVi0IH0PyBIC0A=',
    },
    {
      id: 'u-staff', name: 'Joy Santiago', username: 'staff', role: 'staff',
      passwordHash: 'pbkdf2-sha256$600000$kEbYNEdV9E6JyvhLqJa1Sg==$AxsGqkQn9CbOpO9d5VhIygeep5K/oXmZauct3qUh3yg=',
    },
  ];

  const byDateDesc = (a: { date?: string; at?: string }, b: { date?: string; at?: string }) =>
    (b.date ?? b.at ?? '').localeCompare(a.date ?? a.at ?? '');

  payments.forEach((p) => (p.receivedBy = p.kind === 'walk-in' || rand() < 0.6 ? users[1].name : users[0].name));

  /* ---------- member portal: every demo member's PIN is 246810 (one shared hash, demo only) ---------- */
  const DEMO_PIN_HASH = 'pbkdf2-sha256$600000$x69Y+7rBURM+YRIrREpTsw==$2SHR4oarWw3srIoSZJ62ODZkG5o0M0Ou35ZIp724L6w=';
  members.forEach((m, i) => {
    m.pinHash = DEMO_PIN_HASH;
    // adults born 1975–2006, plus one 16-year-old with guardian consent to demo the minors rule
    const minor = i === 5;
    const year = minor ? Number(today.slice(0, 4)) - 16 : 1975 + Math.floor(rand() * 32);
    m.birthDate = `${year}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`;
    if (minor) m.guardianName = `${pick(FIRST)} ${m.name.split(' ').slice(-1)[0]}`;
    const answers = HEALTH_QUESTIONS.map(() => rand() < 0.06);
    const at = new Date(parseISO(m.joinedAt).setHours(9)).toISOString();
    m.health = { answers, flagged: answers.some(Boolean), clearanceAcknowledged: answers.some(Boolean), at };
    const by = users[1].name;
    m.consents = [
      { type: 'terms', version: LEGAL_VERSION, granted: true, at, recordedBy: by },
      { type: 'privacy', version: LEGAL_VERSION, granted: true, at, recordedBy: by },
      { type: 'health', version: LEGAL_VERSION, granted: true, at, recordedBy: by },
      { type: 'marketing', version: LEGAL_VERSION, granted: rand() < 0.5, at, recordedBy: by },
    ];
  });
  // pick a member with an active plan, weigh-ins and upcoming bookings so the portal demo looks lived-in
  const demoMember =
    members.find(
      (m) =>
        m.expiryDate >= addDays(today, 14) &&
        measurements.filter((x) => x.memberId === m.id).length >= 3 &&
        bookings.some((b) => b.memberId === m.id && b.date > today),
    ) ?? members.find((m) => m.expiryDate >= today);

  return {
    plans,
    members: members.sort((a, b) => a.name.localeCompare(b.name)),
    payments: payments.sort(byDateDesc),
    checkIns: checkIns.sort(byDateDesc),
    users,
    trainers,
    classes,
    bookings,
    measurements: measurements.sort(byDateDesc),
    activity: [{ id: uid(), at: new Date().toISOString(), userName: 'System', text: 'Demo data loaded' }],
    privacyRequests: [],
    settings: {
      gymName: 'Demo Fitness Gym',
      walkInPrice: 100,
      demoMemberId: demoMember?.id,
      legalName: '',
      address: '',
      dpoName: '',
      dpoEmail: '',
      retentionMonths: 24,
    },
  };
}
