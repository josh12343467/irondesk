import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Scale, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import type { Member } from '../types';
import { useStore } from '../lib/store';
import { bmi, bmiLabel, cn, fmtDate, parseISO, todayISO } from '../lib/utils';
import { Button, EmptyState, Field, chartTooltip, inputCls } from './ui';

export function MemberProgress({ member }: { member: Member }) {
  const { measurements, actions } = useStore();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(todayISO());
  const [height, setHeight] = useState(member.heightCm ? String(member.heightCm) : '');

  const mine = measurements.filter((m) => m.memberId === member.id); // newest first
  const latest = mine[0];
  const first = mine[mine.length - 1];
  const change = latest && first && mine.length > 1 ? Math.round((latest.weightKg - first.weightKg) * 10) / 10 : null;
  const currentBmi = latest ? bmi(latest.weightKg, member.heightCm) : null;
  const chart = [...mine].reverse().map((m) => ({
    date: parseISO(m.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    weight: m.weightKg,
  }));

  const addEntry = () => {
    const w = Number(weight);
    if (!(w > 20 && w < 350)) return;
    actions.addMeasurement(member.id, Math.round(w * 10) / 10, date);
    setWeight('');
  };

  const saveHeight = () => {
    const h = Number(height);
    if (h > 100 && h < 250 && h !== member.heightCm) actions.updateMember(member.id, { heightCm: Math.round(h) });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Current weight" value={latest ? `${latest.weightKg} kg` : '—'} />
        <Metric
          label="Change"
          value={
            change === null ? '—' : (
              <span className={cn('inline-flex items-center gap-1', change < 0 ? 'text-lime-300' : change > 0 ? 'text-amber-300' : '')}>
                {change < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                {change > 0 ? '+' : ''}
                {change} kg
              </span>
            )
          }
        />
        <Metric label="BMI" value={currentBmi ?? '—'} hint={currentBmi ? bmiLabel(currentBmi) : member.heightCm ? undefined : 'Set height'} />
        <div className="rounded-xl bg-zinc-950 p-3">
          <div className="text-xs text-zinc-500">Height (cm)</div>
          <input
            className="mt-0.5 w-full bg-transparent font-semibold outline-none"
            type="number"
            value={height}
            placeholder="—"
            onChange={(e) => setHeight(e.target.value)}
            onBlur={saveHeight}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
      </div>

      {chart.length > 1 ? (
        <div className="h-48 rounded-xl bg-zinc-950 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#27272a" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis
                domain={[(min: number) => Math.floor(min - 2), (max: number) => Math.ceil(max + 2)]}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fill: '#71717a', fontSize: 11 }}
              />
              <Tooltip {...chartTooltip} cursor={{ stroke: '#3f3f46' }} formatter={(v) => [`${v} kg`, 'Weight']} />
              <Line type="monotone" dataKey="weight" stroke="#a3e635" strokeWidth={2} dot={{ r: 3, fill: '#a3e635' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-xl bg-zinc-950">
          <EmptyState icon={Scale} title="Not enough weigh-ins yet" text="Log at least two to see the progress chart." />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Field label="Weight (kg)">
            <input className={inputCls} type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addEntry()} />
          </Field>
        </div>
        <div className="w-44">
          <Field label="Date">
            <input className={inputCls} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
          </Field>
        </div>
        <Button onClick={addEntry} disabled={!(Number(weight) > 20)}>
          Log weigh-in
        </Button>
      </div>

      <p className="text-xs text-zinc-500">
        BMI is a general screening number and doesn't account for muscle mass, age or sex. It is not medical advice. Consult a doctor for health
        concerns.
      </p>

      {mine.length > 0 && (
        <ul className="divide-y divide-zinc-800/70 text-sm">
          {mine.slice(0, 8).map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2">
              <span className="text-zinc-400">{fmtDate(m.date)}</span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">{m.weightKg} kg</span>
                <button onClick={() => actions.deleteMeasurement(m.id)} aria-label="Delete entry" className="rounded p-1 text-zinc-500 hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
      {hint && <div className="text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
