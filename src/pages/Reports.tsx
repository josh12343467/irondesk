import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Activity, RefreshCw, TrendingDown, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { useStore } from '../lib/store';
import { Avatar, Card, CardHeader, PageHeader, StatCard, Tabs, chartTooltip } from '../components/ui';
import { WEEKDAYS, addDays, cn, isSameDay, parseISO, peso, toISO, todayISO } from '../lib/utils';

type Range = '30' | '90' | '180' | '365';
const PIE_COLORS = ['#a3e635', '#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#2dd4bf'];
const axis = { tickLine: false, axisLine: false, tick: { fill: '#71717a', fontSize: 11 } } as const;

export default function Reports() {
  const { payments, members, checkIns, bookings, classes } = useStore();
  const [range, setRange] = useState<Range>('30');

  const r = useMemo(() => {
    const days = Number(range);
    const today = todayISO();
    const start = addDays(today, -days + 1);
    const prevStart = addDays(start, -days);
    const inRange = (iso: string, a = start, b = today) => iso >= a && iso <= b;
    const dayOf = (ts: string) => toISO(new Date(ts));

    const pays = payments.filter((p) => inRange(dayOf(p.date)));
    const prevPays = payments.filter((p) => inRange(dayOf(p.date), prevStart, addDays(start, -1)));
    const revenue = pays.reduce((a, p) => a + p.amount, 0);
    const prevRevenue = prevPays.reduce((a, p) => a + p.amount, 0);
    const growth = prevRevenue ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;

    const newMembers = members.filter((m) => inRange(m.joinedAt)).length;
    const renewals = pays.filter((p) => p.kind === 'renewal').length;
    // members whose plan ran out inside the window and never came back
    const lapsed = members.filter((m) => m.expiryDate < today && m.expiryDate >= start).length;
    const renewalRate = renewals + lapsed ? Math.round((renewals / (renewals + lapsed)) * 100) : null;

    const visits = checkIns.filter((c) => inRange(dayOf(c.at)));

    // revenue split by type — bucketed by week for short ranges, by month for long ones
    const byWeek = days <= 90;
    const buckets = new Map<string, { label: string; new: number; renewal: number; 'walk-in': number }>();
    const bucketKey = (iso: string) => {
      if (!byWeek) return iso.slice(0, 7);
      const d = parseISO(iso);
      return addDays(iso, -((d.getDay() + 6) % 7)); // Monday of that week
    };
    const bucketLabel = (key: string) =>
      byWeek
        ? parseISO(key).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        : parseISO(key + '-01').toLocaleDateString('en-PH', { month: 'short' });
    for (let d = start; d <= today; d = addDays(d, byWeek ? 7 : 28)) {
      const k = bucketKey(d);
      if (!buckets.has(k)) buckets.set(k, { label: bucketLabel(k), new: 0, renewal: 0, 'walk-in': 0 });
    }
    for (const p of pays) {
      const k = bucketKey(dayOf(p.date));
      if (!buckets.has(k)) buckets.set(k, { label: bucketLabel(k), new: 0, renewal: 0, 'walk-in': 0 });
      buckets.get(k)![p.kind] += p.amount;
    }
    const revenueSeries = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

    const planMap = new Map<string, number>();
    for (const p of pays) planMap.set(p.planName, (planMap.get(p.planName) ?? 0) + p.amount);
    const byPlan = [...planMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const daily = Array.from({ length: Math.min(days, 60) }, (_, i) => {
      const iso = addDays(today, -Math.min(days, 60) + 1 + i);
      return {
        date: parseISO(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        visits: visits.filter((c) => isSameDay(c.at, iso)).length,
      };
    });

    const dow = WEEKDAYS.map((label) => ({ label, visits: 0 }));
    for (const c of visits) dow[new Date(c.at).getDay()].visits++;
    const weekdayOrder = [...dow.slice(1), dow[0]];

    const visitCount = new Map<string, number>();
    for (const c of visits) if (c.memberId) visitCount.set(c.memberId, (visitCount.get(c.memberId) ?? 0) + 1);
    const top = [...visitCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({ member: members.find((m) => m.id === id), count }))
      .filter((x) => x.member);

    const classStats = classes
      .map((c) => {
        const sessions = new Set<string>();
        let seats = 0;
        for (const b of bookings) {
          if (b.classId === c.id && inRange(b.date)) {
            sessions.add(b.date);
            seats++;
          }
        }
        const fill = sessions.size ? Math.round((seats / (sessions.size * c.capacity)) * 100) : 0;
        return { cls: c, seats, fill };
      })
      .sort((a, b) => b.fill - a.fill);

    return { revenue, growth, newMembers, renewals, renewalRate, visits: visits.length, revenueSeries, byPlan, daily, weekdayOrder, top, classStats, days };
  }, [range, payments, members, checkIns, bookings, classes]);

  return (
    <>
      <PageHeader title="Reports & analytics" subtitle="How the gym is performing over time." />
      <Tabs<Range>
        value={range}
        onChange={setRange}
        items={[
          { key: '30', label: 'Last 30 days' },
          { key: '90', label: '90 days' },
          { key: '180', label: '6 months' },
          { key: '365', label: '12 months' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Revenue"
          value={peso(r.revenue)}
          tone="violet"
          hint={
            r.growth === null ? 'No data for previous period' : (
              <span className={cn('inline-flex items-center gap-1', r.growth >= 0 ? 'text-lime-300' : 'text-red-400')}>
                {r.growth >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {r.growth >= 0 ? '+' : ''}
                {r.growth}% vs previous {r.days} days
              </span>
            )
          }
        />
        <StatCard icon={UserPlus} label="New members" value={r.newMembers} hint={`${r.renewals} renewals in the same period`} />
        <StatCard
          icon={RefreshCw}
          label="Renewal rate"
          value={r.renewalRate === null ? '—' : `${r.renewalRate}%`}
          tone="amber"
          hint="Renewals ÷ (renewals + lapsed members)"
        />
        <StatCard icon={Activity} label="Check-ins" value={r.visits} tone="sky" hint={`${(r.visits / r.days).toFixed(1)} per day on average`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Revenue by type" />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.revenueSeries} margin={{ left: 0, right: 12 }}>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} width={44} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip {...chartTooltip} formatter={(v, n) => [peso(Number(v)), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} iconType="circle" iconSize={8} />
                <Bar dataKey="new" name="New" stackId="a" fill="#a3e635" />
                <Bar dataKey="renewal" name="Renewal" stackId="a" fill="#38bdf8" />
                <Bar dataKey="walk-in" name="Walk-in" stackId="a" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenue by plan" />
          <div className="h-64 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={r.byPlan} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
                  {r.byPlan.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltip} formatter={(v, n) => [peso(Number(v)), String(n)]} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={`Daily check-ins${r.days > 60 ? ' · last 60 days' : ''}`} />
          <div className="h-56 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={r.daily} margin={{ left: 0, right: 12 }}>
                <defs>
                  <linearGradient id="visitsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="date" {...axis} minTickGap={24} />
                <YAxis {...axis} width={32} allowDecimals={false} />
                <Tooltip {...chartTooltip} cursor={{ stroke: '#3f3f46' }} formatter={(v) => [Number(v), 'Check-ins']} />
                <Area type="monotone" dataKey="visits" stroke="#38bdf8" strokeWidth={2} fill="url(#visitsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Busiest days" />
          <div className="h-56 px-2 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.weekdayOrder} margin={{ left: 0, right: 12 }}>
                <CartesianGrid vertical={false} stroke="#27272a" />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} width={32} allowDecimals={false} />
                <Tooltip {...chartTooltip} formatter={(v) => [Number(v), 'Check-ins']} />
                <Bar dataKey="visits" fill="#fbbf24" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Most consistent members" />
          <ol className="px-2 pb-3">
            {r.top.map(({ member, count }, i) => (
              <li key={member!.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <span className={cn('w-5 text-center text-sm font-bold tabular-nums', i < 3 ? 'text-lime-300' : 'text-zinc-500')}>{i + 1}</span>
                <Avatar name={member!.name} size="sm" />
                <span className="flex-1 truncate text-sm font-medium">{member!.name}</span>
                <span className="text-sm text-zinc-400 tabular-nums">{count} visits</span>
              </li>
            ))}
            {r.top.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">No visits in this period</li>}
          </ol>
        </Card>
        <Card>
          <CardHeader title="Class fill rate" />
          <ul className="space-y-3 px-5 pb-5">
            {r.classStats.map(({ cls, seats, fill }) => (
              <li key={cls.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">
                    {cls.name} <span className="text-xs font-normal text-zinc-500">· {WEEKDAYS[cls.weekday]}</span>
                  </span>
                  <span className="text-zinc-400 tabular-nums">
                    {fill}% · {seats} seats
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className={cn('h-full rounded-full', fill >= 80 ? 'bg-lime-400' : fill >= 50 ? 'bg-sky-400' : 'bg-zinc-500')} style={{ width: `${fill}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
