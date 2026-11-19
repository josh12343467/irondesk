import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, Flame, TriangleAlert, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { Card, StatusBadge, toneStyles } from '../components/ui';
import { QrCode } from '../components/qr';
import {
  cn, daysBetween, daysLeft, fmtClock, fmtDate, fmtDateTime, greeting, memberQrValue, memberStatus, monthKey, parseISO, relativeDays, shortId, toISO, todayISO,
} from '../lib/utils';

export default function MemberHome() {
  const { currentMember: m, plans, checkIns, bookings, classes, trainers } = useStore();

  const data = useMemo(() => {
    if (!m) return null;
    const today = todayISO();
    const nowHHMM = new Date().toTimeString().slice(0, 5);
    const visits = checkIns.filter((c) => c.memberId === m.id);
    const thisMonth = visits.filter((c) => monthKey(new Date(c.at)) === monthKey(new Date())).length;

    // consecutive weeks (Mon–Sun) with at least one visit, counting back from this week
    const weekOf = (iso: string) => Math.floor(daysBetween('2000-01-03', iso) / 7); // 2000-01-03 was a Monday
    const weeks = new Set(visits.map((c) => weekOf(toISO(new Date(c.at)))));
    let streak = 0;
    for (let w = weekOf(today); weeks.has(w); w--) streak++;

    const upcoming = bookings
      .filter((b) => b.memberId === m.id && b.date >= today)
      .map((b) => ({ ...b, cls: classes.find((c) => c.id === b.classId)! }))
      .filter((b) => b.cls && (b.date > today || b.cls.start > nowHHMM))
      .sort((a, b) => (a.date + a.cls.start).localeCompare(b.date + b.cls.start));

    return { visits, thisMonth, streak, upcoming };
  }, [m, checkIns, bookings, classes]);

  if (!m || !data) return null;
  const plan = plans.find((p) => p.id === m.planId);
  const status = memberStatus(m);
  const left = daysLeft(m);
  const pct = plan ? Math.max(0, Math.min(100, (left / plan.durationDays) * 100)) : 0;
  const next = data.upcoming[0];
  const trainerName = (id: string) => trainers.find((t) => t.id === id)?.name ?? 'No trainer';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting()}, {m.name.split(' ')[0]}! 💪
        </h1>
        <p className="mt-1 text-sm text-zinc-400">Ready for today's session?</p>
      </div>

      {status !== 'active' && (
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
            status === 'expired' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-200',
          )}
        >
          {status === 'expired' ? <XCircle size={18} className="mt-0.5 shrink-0" /> : <TriangleAlert size={18} className="mt-0.5 shrink-0" />}
          <span>
            {status === 'expired'
              ? `Your membership expired ${relativeDays(left)}. Renew at the front desk to get back in.`
              : `Your membership expires ${relativeDays(left)}. Renew at the front desk to keep training without a break.`}
          </span>
        </div>
      )}

      {/* Digital pass */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5">
          <div>
            <div className="text-xs tracking-widest text-lime-300 uppercase">Member pass</div>
            <div className="mt-1 text-lg font-bold">{m.name}</div>
            <div className="font-mono text-xs text-zinc-500">ID #{shortId(m.id)}</div>
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="flex flex-col items-center px-5 py-5">
          <div className={cn('rounded-2xl bg-white p-3', status === 'expired' && 'opacity-40 grayscale')}>
            <QrCode value={memberQrValue(m.id)} size={190} />
          </div>
          <p className="mt-3 text-center text-xs text-zinc-500">Show this QR code at the front desk to check in.</p>
        </div>
        <div className="border-t border-zinc-800 px-5 py-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-zinc-400">{plan?.name ?? 'Plan'}</span>
            <span className="font-medium">Valid until {fmtDate(m.expiryDate)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn('h-full rounded-full', status === 'active' ? 'bg-lime-400' : status === 'expiring' ? 'bg-amber-400' : 'bg-red-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-zinc-500">{left >= 0 ? `${left} days left` : 'Expired'}</div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="This month" value={data.thisMonth} unit="visits" />
        <Stat label="All time" value={data.visits.length} unit="visits" />
        <Stat label="Streak" value={data.streak} unit={data.streak === 1 ? 'week' : 'weeks'} icon={<Flame size={14} className="text-amber-400" />} />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Next class</h2>
          <Link to="/classes" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-lime-300">
            Book a class <ArrowRight size={12} />
          </Link>
        </div>
        {next ? (
          <div className={cn('rounded-lg border-l-[3px] p-3', toneStyles[next.cls.tone].card)}>
            <div className="font-semibold">{next.cls.name}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} /> {next.date === todayISO() ? 'Today' : parseISO(next.date).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {fmtClock(next.cls.start)}
              </span>
              <span>{trainerName(next.cls.trainerId)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No upcoming classes. Book one and sweat it out with the crew! 🔥</p>
        )}
        {data.upcoming.length > 1 && <p className="mt-2 text-xs text-zinc-500">+{data.upcoming.length - 1} more booked</p>}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent visits</h2>
        <ul className="space-y-2 text-sm text-zinc-400">
          {data.visits.slice(0, 5).map((c) => (
            <li key={c.id} className="flex justify-between">
              <span>{fmtDateTime(c.at)}</span>
              {c.via === 'qr' && <span className="text-xs text-zinc-500">QR</span>}
            </li>
          ))}
          {data.visits.length === 0 && <li className="text-zinc-500">No visits yet</li>}
        </ul>
      </Card>
    </div>
  );
}

function Stat({ label, value, unit, icon }: { label: string; value: number; unit: string; icon?: ReactNode }) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-1 text-xs text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{unit}</div>
    </Card>
  );
}
