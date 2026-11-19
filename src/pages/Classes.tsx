import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Pencil, Phone, Plus, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import type { GymClass, Tone, Trainer } from '../types';
import { useCan, useStore } from '../lib/store';
import { Avatar, Button, Card, EmptyState, Field, Modal, PageHeader, StatusBadge, Tabs, inputCls, toneStyles } from '../components/ui';
import { WEEKDAYS, cn, fmtClock, fmtDate, memberStatus, parseISO, todayISO, weekDates } from '../lib/utils';

type View = 'schedule' | 'trainers';

export default function Classes() {
  const can = useCan();
  const [view, setView] = useState<View>('schedule');
  const [classForm, setClassForm] = useState<GymClass | 'new' | null>(null);
  const [trainerForm, setTrainerForm] = useState<Trainer | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Classes & trainers"
        subtitle="Weekly group classes, bookings and coaching staff."
        actions={
          can('manageClasses') &&
          (view === 'schedule' ? (
            <Button onClick={() => setClassForm('new')}>
              <Plus size={16} /> New class
            </Button>
          ) : (
            <Button onClick={() => setTrainerForm('new')}>
              <Plus size={16} /> New trainer
            </Button>
          ))
        }
      />
      <Tabs<View>
        value={view}
        onChange={setView}
        items={[
          { key: 'schedule', label: 'Weekly schedule' },
          { key: 'trainers', label: 'Trainers' },
        ]}
      />
      {view === 'schedule' ? <Schedule onEditClass={setClassForm} /> : <Trainers onEdit={setTrainerForm} />}
      <ClassFormModal value={classForm} onClose={() => setClassForm(null)} />
      <TrainerFormModal value={trainerForm} onClose={() => setTrainerForm(null)} />
    </>
  );
}

/* ---------------- Schedule ---------------- */

function Schedule({ onEditClass }: { onEditClass: (c: GymClass) => void }) {
  const { classes, bookings, trainers } = useStore();
  const [offset, setOffset] = useState(0);
  const [session, setSession] = useState<{ classId: string; date: string } | null>(null);
  const days = weekDates(offset);
  const today = todayISO();
  const trainerName = useMemo(() => new Map(trainers.map((t) => [t.id, t.name.replace(/^Coach /, '')])), [trainers]);
  const countFor = (classId: string, date: string) => bookings.filter((b) => b.classId === classId && b.date === date).length;
  const range = `${parseISO(days[0]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${parseISO(days[6]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Previous week" onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft size={16} />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOffset(0)} disabled={offset === 0}>
          This week
        </Button>
        <Button variant="outline" size="sm" aria-label="Next week" onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight size={16} />
        </Button>
        <span className="ml-2 text-sm font-medium text-zinc-300">{range}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-7">
        {days.map((date) => {
          const d = parseISO(date);
          const sessions = classes.filter((c) => c.weekday === d.getDay()).sort((a, b) => a.start.localeCompare(b.start));
          const isToday = date === today;
          return (
            <div key={date} className={cn('rounded-2xl border p-2', isToday ? 'border-lime-400/40 bg-lime-400/[.03]' : 'border-zinc-800/80 bg-zinc-900/40')}>
              <div className="flex items-baseline justify-between px-1.5 pt-1 pb-2">
                <span className={cn('text-xs font-semibold tracking-wide uppercase', isToday ? 'text-lime-300' : 'text-zinc-400')}>
                  {WEEKDAYS[d.getDay()]}
                </span>
                <span className={cn('text-lg font-bold tabular-nums', isToday ? 'text-lime-300' : 'text-zinc-300')}>{d.getDate()}</span>
              </div>
              <div className="space-y-2">
                {sessions.map((c) => {
                  const booked = countFor(c.id, date);
                  const t = toneStyles[c.tone];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSession({ classId: c.id, date })}
                      className={cn('w-full rounded-lg border-l-[3px] p-2.5 text-left transition', t.card, date < today && 'opacity-60')}
                    >
                      <div className="text-[11px] text-zinc-400 tabular-nums">{fmtClock(c.start)}</div>
                      <div className="text-sm leading-tight font-semibold">{c.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500">{trainerName.get(c.trainerId) ?? 'No trainer'}</div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
                        <div className={cn('h-full rounded-full', t.bar)} style={{ width: `${Math.min(100, (booked / c.capacity) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                        {booked}/{c.capacity} {booked >= c.capacity && <span className="font-semibold text-red-400">· Full</span>}
                      </div>
                    </button>
                  );
                })}
                {sessions.length === 0 && <div className="px-1.5 pb-2 text-xs text-zinc-600">Rest day</div>}
              </div>
            </div>
          );
        })}
      </div>

      <SessionModal
        session={session}
        onClose={() => setSession(null)}
        onEdit={(c) => {
          setSession(null);
          onEditClass(c);
        }}
      />
    </>
  );
}

function SessionModal({
  session,
  onClose,
  onEdit,
}: {
  session: { classId: string; date: string } | null;
  onClose: () => void;
  onEdit: (c: GymClass) => void;
}) {
  const { classes, bookings, members, trainers, actions } = useStore();
  const can = useCan();
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setQ('');
    setMsg('');
  }, [session]);

  const cls = classes.find((c) => c.id === session?.classId);
  if (!session || !cls) return null;

  const { date } = session;
  const trainer = trainers.find((t) => t.id === cls.trainerId);
  const list = bookings.filter((b) => b.classId === cls.id && b.date === date);
  const bookedIds = new Set(list.map((b) => b.memberId));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const isPast = date < todayISO();
  const full = list.length >= cls.capacity;
  const s = q.trim().toLowerCase();
  const candidates = s
    ? members.filter((m) => !bookedIds.has(m.id) && m.expiryDate >= date && m.name.toLowerCase().includes(s)).slice(0, 5)
    : [];
  const [h, mi] = cls.start.split(':').map(Number);
  const endMin = h * 60 + mi + cls.durationMin;
  const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

  const book = async (memberId: string) => {
    setQ('');
    const r = await actions.book(cls.id, memberId, date);
    setMsg(
      r === 'full' ? 'Class is full.'
      : r === 'duplicate' ? 'Already booked.'
      : r === 'expired' ? 'Membership expires before this session.'
      : r === 'denied' ? "This booking isn't allowed."
      : '',
    );
  };

  const remove = () => {
    if (confirm(`Delete “${cls.name}” on ${WEEKDAYS[cls.weekday]}s? All its bookings will be removed.`)) {
      actions.deleteClass(cls.id);
      onClose();
    }
  };

  return (
    <Modal open onClose={onClose} title={cls.name} wide>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={15} /> {fmtDate(date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock size={15} /> {fmtClock(cls.start)} – {fmtClock(end)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UserRound size={15} /> {trainer?.name ?? 'No trainer'}
        </span>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
          <span>Bookings</span>
          <span className="tabular-nums">
            {list.length} / {cls.capacity}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className={cn('h-full rounded-full', toneStyles[cls.tone].bar)} style={{ width: `${Math.min(100, (list.length / cls.capacity) * 100)}%` }} />
        </div>
      </div>

      {!isPast && (
        <div className="relative mt-5">
          <UserPlus size={16} className="pointer-events-none absolute top-2.5 left-3 text-zinc-500" />
          <input
            className={cn(inputCls, 'pl-9')}
            placeholder={full ? 'Class is full' : 'Add a member: type a name…'}
            value={q}
            disabled={full}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && candidates[0] && book(candidates[0].id)}
          />
          {candidates.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
              {candidates.map((m) => (
                <li key={m.id}>
                  <button onClick={() => book(m.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-800">
                    <Avatar name={m.name} size="sm" />
                    <span className="flex-1">{m.name}</span>
                    <StatusBadge status={memberStatus(m)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {msg && <p className="mt-2 text-sm text-amber-300">{msg}</p>}
        </div>
      )}
      {isPast && <p className="mt-5 text-sm text-zinc-500">This session already happened. The list shows who attended.</p>}

      <ul className="mt-4 grid gap-1 sm:grid-cols-2">
        {list.map((b) => {
          const m = memberById.get(b.memberId);
          if (!m) return null;
          return (
            <li key={b.id} className="flex items-center gap-3 rounded-lg bg-zinc-950/60 px-3 py-2">
              <Avatar name={m.name} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
              {!isPast && (
                <button onClick={() => actions.unbook(b.id)} aria-label={`Remove ${m.name}`} className="rounded p-1 text-zinc-500 hover:text-red-400">
                  <X size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <EmptyState icon={UserRound} title="No bookings yet" />}

      {can('manageClasses') && (
        <div className="mt-6 flex justify-end gap-2 border-t border-zinc-800 pt-4">
          <Button variant="danger" onClick={remove}>
            <Trash2 size={14} /> Delete class
          </Button>
          <Button variant="outline" onClick={() => onEdit(cls)}>
            <Pencil size={14} /> Edit class
          </Button>
        </div>
      )}
    </Modal>
  );
}

/* ---------------- Trainers ---------------- */

function Trainers({ onEdit }: { onEdit: (t: Trainer) => void }) {
  const { trainers, classes, bookings, actions } = useStore();
  const can = useCan();

  const remove = (t: Trainer) => {
    if (classes.some((c) => c.trainerId === t.id)) {
      alert(`${t.name} still has classes. Reassign them first.`);
      return;
    }
    if (confirm(`Remove ${t.name}?`)) actions.deleteTrainer(t.id);
  };

  if (trainers.length === 0) return <EmptyState icon={UserRound} title="No trainers yet" />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {trainers.map((t) => {
        const mine = classes.filter((c) => c.trainerId === t.id).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.start.localeCompare(b.start));
        const mineIds = new Set(mine.map((c) => c.id));
        const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
        const students = bookings.filter((b) => mineIds.has(b.classId) && b.date >= since && b.date <= todayISO()).length;
        return (
          <Card key={t.id} className="p-5">
            <div className="flex items-start gap-3">
              <Avatar name={t.name.replace(/^Coach /, '')} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.name}</div>
                <div className="text-sm text-zinc-400">{t.specialty}</div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">
                  <Phone size={12} /> {t.phone || '—'}
                </div>
              </div>
              {can('manageClasses') && (
                <div className="flex gap-1">
                  <button onClick={() => onEdit(t)} aria-label={`Edit ${t.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(t)} aria-label={`Remove ${t.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Weekly classes</div>
                <div className="font-semibold">{mine.length}</div>
              </div>
              <div className="rounded-xl bg-zinc-950 p-3">
                <div className="text-xs text-zinc-500">Attendees (30d)</div>
                <div className="font-semibold">{students}</div>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm">
              {mine.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', toneStyles[c.tone].dot)} />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-xs text-zinc-500">
                    {WEEKDAYS[c.weekday]} {fmtClock(c.start)}
                  </span>
                </li>
              ))}
              {mine.length === 0 && <li className="text-zinc-500">No classes assigned</li>}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

/* ---------------- Forms ---------------- */

const TONES: Tone[] = ['lime', 'sky', 'violet', 'amber', 'rose', 'teal'];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function ClassFormModal({ value, onClose }: { value: GymClass | 'new' | null; onClose: () => void }) {
  const { trainers, actions } = useStore();
  const blank = { name: '', trainerId: trainers[0]?.id ?? '', weekday: 1, start: '18:00', durationMin: 60, capacity: 15, tone: 'lime' as Tone };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (value === 'new') setF(blank);
    else if (value) setF({ ...value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const valid = f.name.trim() && f.trainerId && f.capacity > 0 && f.durationMin > 0 && /^\d{2}:\d{2}$/.test(f.start);

  return (
    <Modal open={!!value} onClose={onClose} title={value === 'new' ? 'New class' : 'Edit class'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          actions.saveClass({ ...f, name: f.name.trim(), id: value && value !== 'new' ? value.id : undefined });
          onClose();
        }}
      >
        <Field label="Class name">
          <input autoFocus className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Spin Class" />
        </Field>
        <Field label="Trainer">
          <select className={inputCls} value={f.trainerId} onChange={(e) => setF({ ...f, trainerId: e.target.value })}>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Day">
            <select className={inputCls} value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>
              {WEEKDAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAYS[d]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start time">
            <input className={inputCls} type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </Field>
          <Field label="Duration (min)">
            <input className={inputCls} type="number" min={15} step={15} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} />
          </Field>
          <Field label="Capacity">
            <input className={inputCls} type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Color">
          <div className="flex gap-2">
            {TONES.map((t) => (
              <button
                type="button"
                key={t}
                aria-label={t}
                onClick={() => setF({ ...f, tone: t })}
                className={cn('size-8 rounded-full ring-2 ring-offset-2 ring-offset-zinc-900 transition', toneStyles[t].dot, f.tone === t ? 'ring-zinc-100' : 'ring-transparent')}
              />
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Save class
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TrainerFormModal({ value, onClose }: { value: Trainer | 'new' | null; onClose: () => void }) {
  const { actions } = useStore();
  const [f, setF] = useState({ name: '', specialty: '', phone: '' });
  useEffect(() => {
    if (value === 'new') setF({ name: 'Coach ', specialty: '', phone: '' });
    else if (value) setF({ name: value.name, specialty: value.specialty, phone: value.phone });
  }, [value]);
  const valid = f.name.trim().length > 2;

  return (
    <Modal open={!!value} onClose={onClose} title={value === 'new' ? 'New trainer' : 'Edit trainer'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          actions.saveTrainer({ name: f.name.trim(), specialty: f.specialty.trim(), phone: f.phone.trim(), id: value && value !== 'new' ? value.id : undefined });
          onClose();
        }}
      >
        <Field label="Name">
          <input autoFocus className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Specialty">
          <input className={inputCls} value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} placeholder="e.g. CrossFit & Mobility" />
        </Field>
        <Field label="Mobile number">
          <input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Save trainer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
