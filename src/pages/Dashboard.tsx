import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, CalendarCheck, CalendarDays, ScanLine, UserPlus, Users, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { Avatar, Button, Card, CardHeader, EmptyState, PageHeader, StatCard, chartTooltip, toneStyles } from '../components/ui';
import { RenewModal } from '../components/RenewModal';
import { MemberFormModal } from '../components/MemberFormModal';
import { cn, daysLeft, fmtClock, fmtHour, fmtTime, greeting, isSameDay, memberStatus, monthKey, peso, relativeDays, todayISO } from '../lib/utils';

export default function Dashboard() {
  const { members, payments, checkIns, classes, bookings, trainers, currentUser } = useStore();
  const [renewId, setRenewId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const today = todayISO();

  const data = useMemo(() => {
    const now = new Date();
    const active = members.filter((m) => memberStatus(m) !== 'expired').length;
    const expiring = members
      .filter((m) => memberStatus(m) === 'expiring')
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const todays = checkIns.filter((c) => isSameDay(c.at, today));

    const sumMonth = (d: Date) =>
      payments.filter((p) => monthKey(new Date(p.date)) === monthKey(d)).reduce((a, p) => a + p.amount, 0);
    const thisMonth = sumMonth(now);
    const lastMonth = sumMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const revenue = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { month: d.toLocaleDateString('en-PH', { month: 'short' }), total: sumMonth(d) };
    });

    const since = now.getTime() - 14 * 86_400_000;
    const counts = new Map<number, number>();
    for (const c of checkIns) {
      const t = new Date(c.at);
      if (t.getTime() >= since) counts.set(t.getHours(), (counts.get(t.getHours()) ?? 0) + 1);
    }
    const hours = Array.from({ length: 18 }, (_, i) => i + 5).map((h) => ({ hour: fmtHour(h), count: counts.get(h) ?? 0 }));
    const peak = hours.reduce((a, b) => (b.count > a.count ? b : a), hours[0]);

    return { active, expiring, todays, thisMonth, lastMonth, revenue, hours, peak };
  }, [members, payments, checkIns, today]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const trainerName = useMemo(() => new Map(trainers.map((t) => [t.id, t.name])), [trainers]);
  const todaysClasses = useMemo(() => {
    const dow = new Date().getDay();
    return classes
      .filter((c) => c.weekday === dow)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((cls) => ({ cls, booked: bookings.filter((b) => b.classId === cls.id && b.date === today).length }));
  }, [classes, bookings, today]);
  const firstName = currentUser?.name.split(' ')[0] ?? '';
  const dateLabel = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}! 👋`}
        subtitle={`${dateLabel} · Here's how the gym is doing today.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setAdding(true)}>
              <UserPlus size={16} /> New member
            </Button>
            <Link to="/check-in">
              <Button>
                <ScanLine size={16} /> Check-in
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Active members" value={data.active} hint={`${members.length} total registered`} />
        <StatCard
          icon={CalendarCheck}
          label="Check-ins today"
          value={data.todays.length}
          tone="sky"
          hint={data.peak.count > 0 ? `Peak hour (last 14 days): ${data.peak.hour}` : 'No check-ins in the last 14 days'}
        />
        <StatCard
          icon={Wallet}
          label="Revenue this month"
          value={peso(data.thisMonth)}
          tone="violet"
          hint={`Last month: ${peso(data.lastMonth)}`}
        />
        <StatCard
          icon={AlertTriangle}
          label="Expiring in 7 days"
          value={data.expiring.length}
          tone="amber"
          hint="Remind them to renew"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue · last 6 months" />
          <div className="h-60 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenue} margin={{ left: 0, right: 12 }}>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#71717a', fontSize: 12 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tick={{ fill: '#71717a', fontSize: 12 }}
                  tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip {...chartTooltip} formatter={(v) => [peso(Number(v)), 'Revenue']} />
                <Bar dataKey="total" fill="#a3e635" radius={[6, 6, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Peak hours · last 14 days" />
          <div className="h-60 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hours} margin={{ left: 0, right: 12 }}>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} interval={1} tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} tick={{ fill: '#71717a', fontSize: 12 }} />
                <Tooltip {...chartTooltip} formatter={(v) => [Number(v), 'Check-ins']} />
                <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Expiring soon"
            action={
              <Link to="/members?status=expiring" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-lime-300">
                View all <ArrowRight size={12} />
              </Link>
            }
          />
          {data.expiring.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="Walang mag-e-expire this week" text="All memberships are good for at least 7 days." />
          ) : (
            <ul className="divide-y divide-zinc-800/80 px-2 pb-2">
              {data.expiring.slice(0, 6).map((m) => (
                <li key={m.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <Avatar name={m.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-amber-300/90">Expires {relativeDays(daysLeft(m))}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setRenewId(m.id)}>
                    Renew
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Today's check-ins"
            action={
              <Link to="/check-in" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-lime-300">
                Open front desk <ArrowRight size={12} />
              </Link>
            }
          />
          {data.todays.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No check-ins yet today" text="They'll show up here as members arrive." />
          ) : (
            <ul className="divide-y divide-zinc-800/80 px-2 pb-2">
              {data.todays.slice(0, 6).map((c) => {
                const name = c.memberId ? memberById.get(c.memberId)?.name ?? 'Former member' : c.guestName ?? 'Guest';
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{name}</div>
                      <div className="text-xs text-zinc-500">{c.memberId ? 'Member' : 'Walk-in'}</div>
                    </div>
                    <span className="text-xs tabular-nums text-zinc-400">{fmtTime(c.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Today's classes"
          action={
            <Link to="/classes" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-lime-300">
              Full schedule <ArrowRight size={12} />
            </Link>
          }
        />
        {todaysClasses.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No group classes today" text="Open gym lang today." />
        ) : (
          <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {todaysClasses.map(({ cls, booked }) => (
              <div key={cls.id} className={cn('rounded-lg border-l-[3px] p-3', toneStyles[cls.tone].card)}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{cls.name}</span>
                  <span className="text-xs text-zinc-400 tabular-nums">{fmtClock(cls.start)}</span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">{trainerName.get(cls.trainerId) ?? 'No trainer'}</div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div className={cn('h-full rounded-full', toneStyles[cls.tone].bar)} style={{ width: `${Math.min(100, (booked / cls.capacity) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-zinc-400 tabular-nums">
                    {booked}/{cls.capacity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <RenewModal memberId={renewId} onClose={() => setRenewId(null)} />
      <MemberFormModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
