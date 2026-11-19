import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileCheck2, HeartPulse, IdCard, Pencil, RefreshCw, Search, Trash2, UserPlus, Users } from 'lucide-react';
import type { Consent, Member, MemberStatus } from '../types';
import { HEALTH_QUESTIONS } from '../lib/legal';
import { ageOn } from '../lib/security';
import { useCan, useStore } from '../lib/store';
import { Avatar, Button, Card, EmptyState, Modal, PageHeader, Pill, StatusBadge, inputCls } from '../components/ui';
import { MemberFormModal } from '../components/MemberFormModal';
import { RenewModal } from '../components/RenewModal';
import { MemberCardModal } from '../components/qr';
import { MemberProgress } from '../components/MemberProgress';
import { cn, daysLeft, fmtClock, fmtDate, fmtDateTime, memberStatus, peso, relativeDays, shortId, todayISO } from '../lib/utils';

type Filter = 'all' | MemberStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'expired', label: 'Expired' },
];

export default function Members() {
  const { members, plans, checkIns, actions } = useStore();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('status') as Filter) || 'all';
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState(false);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [cardFor, setCardFor] = useState<Member | null>(null);

  const planName = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const lastVisit = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checkIns) if (c.memberId && !map.has(c.memberId)) map.set(c.memberId, c.at);
    return map;
  }, [checkIns]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: members.length, active: 0, expiring: 0, expired: 0 };
    members.forEach((m) => c[memberStatus(m)]++);
    return c;
  }, [members]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return members.filter(
      (m) =>
        (filter === 'all' || memberStatus(m) === filter) &&
        (!s || m.name.toLowerCase().includes(s) || m.phone.includes(s) || shortId(m.id).toLowerCase().includes(s)),
    );
  }, [members, q, filter]);

  const remove = (m: Member) => {
    if (
      confirm(
        `Permanently erase ${m.name}?\n\nTheir profile, attendance, bookings, health and progress data will be deleted. Payment records are kept for accounting but de-identified. This cannot be undone.`,
      )
    )
      actions.deleteMember(m.id);
  };

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${counts.active + counts.expiring} active · ${counts.expired} expired`}
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus size={16} /> New member
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setParams(f.key === 'all' ? {} : { status: f.key })}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
                filter === f.key ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              {f.label}
              <span className="rounded-md bg-zinc-950/60 px-1.5 text-xs tabular-nums text-zinc-400">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <input className={cn(inputCls, 'pl-9')} placeholder="Search name, phone or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={Users} title="No members found" text="Try a different search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-3 py-3 font-medium">Plan</th>
                  <th className="px-3 py-3 font-medium">Expiry</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Last visit</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {list.map((m) => {
                  const left = daysLeft(m);
                  const visit = lastVisit.get(m.id);
                  return (
                    <tr key={m.id} className="transition hover:bg-zinc-800/30">
                      <td className="px-5 py-3">
                        <button onClick={() => setViewId(m.id)} className="flex items-center gap-3 text-left">
                          <Avatar name={m.name} size="sm" />
                          <div>
                            <div className="font-medium hover:text-lime-300">{m.name}</div>
                            <div className="text-xs text-zinc-500">
                              #{shortId(m.id)} · {m.phone}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <Pill>{planName.get(m.planId) ?? '—'}</Pill>
                      </td>
                      <td className="px-3 py-3">
                        <div>{fmtDate(m.expiryDate)}</div>
                        <div className={cn('text-xs', left < 0 ? 'text-red-400/80' : left <= 7 ? 'text-amber-300/80' : 'text-zinc-500')}>
                          {relativeDays(left)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={memberStatus(m)} />
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{visit ? fmtDateTime(visit) : '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setRenewId(m.id)}>
                            <RefreshCw size={13} /> Renew
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="ID card" title="ID card & QR" onClick={() => setCardFor(m)}>
                            <IdCard size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" aria-label="Edit" title="Edit" onClick={() => setEditing(m)}>
                            <Pencil size={14} />
                          </Button>
                          {can('deleteMember') && (
                            <Button size="sm" variant="ghost" aria-label="Delete" title="Delete" onClick={() => remove(m)} className="hover:text-red-400">
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <MemberFormModal
        open={adding || !!editing}
        member={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <RenewModal memberId={renewId} onClose={() => setRenewId(null)} />
      <MemberCardModal member={cardFor} onClose={() => setCardFor(null)} />
      <MemberDetail
        memberId={viewId}
        onClose={() => setViewId(null)}
        onRenew={(id) => {
          setViewId(null);
          setRenewId(id);
        }}
        onEdit={(m) => {
          setViewId(null);
          setEditing(m);
        }}
        onCard={(m) => {
          setViewId(null);
          setCardFor(m);
        }}
      />
    </>
  );
}

type Tab = 'overview' | 'progress' | 'classes';

export const latestConsent = (m: Member, type: Consent['type']) => [...(m.consents ?? [])].reverse().find((c) => c.type === type);

function MemberDetail({
  memberId,
  onClose,
  onRenew,
  onEdit,
  onCard,
}: {
  memberId: string | null;
  onClose: () => void;
  onRenew: (id: string) => void;
  onEdit: (m: Member) => void;
  onCard: (m: Member) => void;
}) {
  const { members, plans, payments, checkIns, bookings, classes, mode } = useStore();
  const can = useCan();
  const [tab, setTab] = useState<Tab>('overview');
  const m = members.find((x) => x.id === memberId);
  if (!m) return null;

  const myPayments = payments.filter((p) => p.memberId === m.id);
  const myVisits = checkIns.filter((c) => c.memberId === m.id);
  const totalPaid = myPayments.reduce((a, p) => a + p.amount, 0);
  const plan = plans.find((p) => p.id === m.planId);
  const today = todayISO();
  const myBookings = bookings
    .filter((b) => b.memberId === m.id)
    .map((b) => ({ ...b, cls: classes.find((c) => c.id === b.classId) }))
    .filter((b) => b.cls)
    .sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = myBookings.filter((b) => b.date >= today).reverse();
  const past = myBookings.filter((b) => b.date < today);

  const close = () => {
    setTab('overview');
    onClose();
  };

  return (
    <Modal open onClose={close} title="Member profile" wide>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{m.name}</div>
          <div className="text-sm text-zinc-400">
            #{shortId(m.id)} · Member since {fmtDate(m.joinedAt)}
          </div>
        </div>
        <StatusBadge status={memberStatus(m)} />
      </div>

      <div className="mt-5 flex gap-1 border-b border-zinc-800">
        {(['overview', 'progress', 'classes'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize transition',
              tab === t ? 'border-lime-400 text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-300',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Plan', plan?.name ?? '—'],
                ['Expires', fmtDate(m.expiryDate)],
                ['Total visits', String(myVisits.length)],
                ['Total paid', peso(totalPaid)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-zinc-950 p-3">
                  <div className="text-xs text-zinc-500">{k}</div>
                  <div className="mt-0.5 font-semibold">{v}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-1 text-sm text-zinc-400">
              <div>📱 {m.phone || '—'}</div>
              <div>✉️ {m.email || '—'}</div>
              {m.notes && <div>📝 {m.notes}</div>}
              {m.birthDate && (
                <div>
                  🎂 {fmtDate(m.birthDate)} ({ageOn(m.birthDate, today)} yrs){m.guardianName && ` · Guardian: ${m.guardianName}`}
                </div>
              )}
              <div>
                🔑 Member portal:{' '}
                {mode === 'cloud'
                  ? m.userId
                    ? 'active (signs in with an email code)'
                    : 'not signed in yet'
                  : m.pinHash
                    ? m.mustChangePin
                      ? 'temporary PIN issued (not yet changed)'
                      : 'active'
                    : 'no PIN yet. Issue one via Edit'}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-zinc-950 p-3 text-sm">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  <HeartPulse size={13} /> Health screening
                </div>
                {!m.health ? (
                  <span className="text-zinc-500">Not on file</span>
                ) : m.health.flagged ? (
                  <span className="text-amber-300">⚠ Needs medical clearance{m.health.clearanceAcknowledged ? ' (member advised)' : ''}</span>
                ) : (
                  <span className="text-lime-300">No risk factors declared</span>
                )}
                {m.health?.flagged &&
                  (can('healthDetails') ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-zinc-400">
                      {HEALTH_QUESTIONS.map((q, i) => (m.health!.answers[i] ? <li key={i}>{q}</li> : null))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Details are visible to admins only.</p>
                  ))}
              </div>
              <div className="rounded-xl bg-zinc-950 p-3 text-sm">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  <FileCheck2 size={13} /> Consents on file
                </div>
                <ul className="space-y-0.5 text-xs">
                  {(['terms', 'privacy', 'health', 'marketing'] as const).map((t) => {
                    const c = latestConsent(m, t);
                    return (
                      <li key={t} className="flex justify-between gap-2">
                        <span className="text-zinc-400 capitalize">{t === 'health' ? 'Health data' : t}</span>
                        <span className={c?.granted ? 'text-lime-300' : 'text-zinc-500'}>
                          {c ? `${c.granted ? 'Yes' : 'No'} · v${c.version} · ${fmtDate(c.at.slice(0, 10))}` : 'Missing'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Payments</h3>
                <ul className="space-y-1.5 text-sm">
                  {myPayments.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span className="text-zinc-400">
                        {fmtDateTime(p.date)} · {p.planName} · {p.method}
                      </span>
                      <span className="tabular-nums">{peso(p.amount)}</span>
                    </li>
                  ))}
                  {myPayments.length === 0 && <li className="text-zinc-500">No payments yet</li>}
                </ul>
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Recent visits</h3>
                <ul className="space-y-1.5 text-sm text-zinc-400">
                  {myVisits.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      {fmtDateTime(c.at)}
                      {c.via === 'qr' && <span className="ml-2 text-xs text-zinc-500">QR</span>}
                    </li>
                  ))}
                  {myVisits.length === 0 && <li className="text-zinc-500">No visits yet</li>}
                </ul>
              </section>
            </div>
          </>
        )}

        {tab === 'progress' && <MemberProgress member={m} />}

        {tab === 'classes' && (
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              ['Upcoming', upcoming],
              ['Attended', past.slice(0, 8)],
            ].map(([label, rows]) => (
              <section key={label as string}>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{label as string}</h3>
                <ul className="space-y-2 text-sm">
                  {(rows as typeof myBookings).map((b) => (
                    <li key={b.id} className="flex justify-between gap-2">
                      <span className="font-medium">{b.cls!.name}</span>
                      <span className="text-zinc-400">
                        {fmtDate(b.date)} · {fmtClock(b.cls!.start)}
                      </span>
                    </li>
                  ))}
                  {(rows as typeof myBookings).length === 0 && <li className="text-zinc-500">None</li>}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => onCard(m)}>
          <IdCard size={14} /> ID card
        </Button>
        <Button variant="outline" onClick={() => onEdit(m)}>
          <Pencil size={14} /> Edit
        </Button>
        <Button onClick={() => onRenew(m.id)}>
          <RefreshCw size={14} /> Renew
        </Button>
      </div>
    </Modal>
  );
}
