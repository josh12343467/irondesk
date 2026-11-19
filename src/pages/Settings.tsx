import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2, CircleAlert, Download, Eraser, FileText, History, KeyRound, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, Upload, UserRound,
} from 'lucide-react';
import type { Plan, PrivacyRequest, Role, User } from '../types';
import { isValidState, useStore } from '../lib/store';
import { LEGAL_VERSION, type LegalDocKey } from '../lib/legal';
import { Avatar, Button, Card, CardHeader, Field, Modal, Pill, Tabs, PageHeader, inputCls } from '../components/ui';
import { LEGAL_LABELS, LegalModal } from '../components/LegalModal';
import { StrengthMeter } from '../components/security';
import { MfaCard } from '../components/MfaCard';
import { cn, downloadFile, fmtDateTime, memberStatus, peso, todayISO } from '../lib/utils';

type Tab = 'plans' | 'staff' | 'privacy' | 'activity' | 'backup';

export default function Settings() {
  const { privacyRequests } = useStore();
  const pending = privacyRequests.filter((r) => r.status === 'pending').length;
  const [tab, setTab] = useState<Tab>('plans');
  return (
    <>
      <PageHeader title="Settings" subtitle="Prices, staff accounts, privacy compliance, audit trail and data backup." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { key: 'plans', label: 'Plans & gym' },
          { key: 'staff', label: 'Staff accounts' },
          { key: 'privacy', label: `Privacy & compliance${pending ? ` (${pending})` : ''}` },
          { key: 'activity', label: 'Activity log' },
          { key: 'backup', label: 'Backup' },
        ]}
      />
      {tab === 'plans' && <PlansTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'backup' && <BackupTab />}
    </>
  );
}

/* ---------------- Privacy & compliance ---------------- */

const REQ_LABEL: Record<PrivacyRequest['type'], string> = { erasure: 'Erasure', correction: 'Correction', objection: 'Objection' };

function PrivacyTab() {
  const { settings, privacyRequests, members, checkIns, activity, actions } = useStore();
  const [f, setF] = useState({
    legalName: settings.legalName ?? '',
    address: settings.address ?? '',
    dpoName: settings.dpoName ?? '',
    dpoEmail: settings.dpoEmail ?? '',
    retentionMonths: String(settings.retentionMonths ?? 24),
  });
  const [saved, setSaved] = useState(false);
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [retentionMsg, setRetentionMsg] = useState('');

  const pending = privacyRequests.filter((r) => r.status === 'pending');
  const done = privacyRequests.filter((r) => r.status !== 'pending');
  const missingConsent = members.filter((m) => !['terms', 'privacy'].every((t) => m.consents?.some((c) => c.type === t && c.granted))).length;
  const marketingYes = members.filter((m) => [...(m.consents ?? [])].reverse().find((c) => c.type === 'marketing')?.granted).length;
  const minors = members.filter((m) => m.guardianName).length;

  const save = (e: FormEvent) => {
    e.preventDefault();
    const months = Math.min(120, Math.max(1, Math.round(Number(f.retentionMonths) || 24)));
    actions.updateSettings({
      legalName: f.legalName.trim(),
      address: f.address.trim(),
      dpoName: f.dpoName.trim(),
      dpoEmail: f.dpoEmail.trim(),
      retentionMonths: months,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resolve = (r: PrivacyRequest, approve: boolean) => {
    const note = notes[r.id] ?? '';
    if (approve && r.type === 'erasure' && !confirm(`Erase ${r.memberName}'s data permanently? This cannot be undone.`)) return;
    if (!approve && note.trim().length < 5) return alert('Give the member a reason when rejecting a request.');
    actions.resolvePrivacyRequest(r.id, approve, note);
  };

  const runRetention = async () => {
    if (!confirm(`Delete check-ins, bookings and log entries older than ${settings.retentionMonths ?? 24} months?`)) return;
    const c = await actions.applyRetention();
    setRetentionMsg(`Removed ${c.checkIns} check-ins, ${c.bookings} bookings and ${c.activity} log entries.`);
  };

  const checklist: [boolean, string][] = [
    [!!settings.legalName && !!settings.address, 'Business name and address are filled in (they appear in the Privacy Notice).'],
    [!!settings.dpoName && !!settings.dpoEmail, 'A Data Protection Officer is designated, with a contact email.'],
    [missingConsent === 0, `Every member has Terms and Privacy consent on file (${missingConsent} missing).`],
    [pending.length === 0, `No privacy requests waiting (${pending.length} pending).`],
    [true, 'Passwords and PINs are salted and hashed; sign-in lockout and idle sign-out are on.'],
    [true, 'Audit log records who changed what, and when.'],
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">
        These tools help you follow the Data Privacy Act of 2012 (RA 10173), but they don't replace a lawyer or your own DPO. See{' '}
        <code className="text-xs">docs/PRIVACY-COMPLIANCE.md</code> for the full checklist, including NPC registration and breach reporting.
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Compliance checklist" />
          <ul className="space-y-2 px-5 pb-5 text-sm">
            {checklist.map(([ok, text]) => (
              <li key={text} className="flex items-start gap-2">
                {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-lime-400" /> : <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />}
                <span className={ok ? 'text-zinc-300' : 'text-amber-200'}>{text}</span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-3 gap-3 border-t border-zinc-800 px-5 py-4 text-center">
            <Stat label="Marketing opt-ins" value={`${marketingYes}/${members.length}`} />
            <Stat label="Minors (with guardian)" value={minors} />
            <Stat label="Records in log" value={checkIns.length + activity.length} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Business & Data Protection Officer" />
          <form onSubmit={save} className="space-y-3 px-5 pb-5">
            <Field label="Registered business name">
              <input className={inputCls} value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} placeholder="e.g. Demo Fitness Gym OPC" />
            </Field>
            <Field label="Business address">
              <input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="DPO name">
                <input className={inputCls} value={f.dpoName} onChange={(e) => setF({ ...f, dpoName: e.target.value })} />
              </Field>
              <Field label="DPO email">
                <input className={inputCls} type="email" value={f.dpoEmail} onChange={(e) => setF({ ...f, dpoEmail: e.target.value })} />
              </Field>
            </div>
            <Field label="Keep attendance & activity logs for (months)" hint="Older records can be purged below. Payments are not affected.">
              <input className={inputCls} type="number" min={1} max={120} value={f.retentionMonths} onChange={(e) => setF({ ...f, retentionMonths: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Button type="submit">Save</Button>
              {saved && <span className="text-sm text-lime-300">Saved ✓</span>}
            </div>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader title={`Data subject requests${pending.length ? ` · ${pending.length} pending` : ''}`} />
        <div className="px-5 pb-5">
          {pending.length === 0 && <p className="text-sm text-zinc-500">No pending requests. Members submit these from their portal (Profile → Privacy & data).</p>}
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{r.memberName}</span> · <span className={r.type === 'erasure' ? 'text-red-300' : 'text-zinc-300'}>{REQ_LABEL[r.type]}</span>
                  </div>
                  <span className="text-xs text-zinc-500">{fmtDateTime(r.createdAt)}</span>
                </div>
                {r.details && <p className="mt-2 text-sm text-zinc-400">“{r.details}”</p>}
                <input
                  className={cn(inputCls, 'mt-3')}
                  placeholder="Reply to the member (required when rejecting)"
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => resolve(r, false)}>
                    Reject
                  </Button>
                  <Button size="sm" variant={r.type === 'erasure' ? 'danger' : 'primary'} onClick={() => resolve(r, true)}>
                    {r.type === 'erasure' ? 'Approve & erase data' : 'Mark as completed'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {done.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-zinc-400">Resolved requests ({done.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-zinc-500">
                {done.map((r) => (
                  <li key={r.id}>
                    {fmtDateTime(r.resolvedAt ?? r.createdAt)} · {r.memberName} · {REQ_LABEL[r.type]} · {r.status} by {r.resolvedBy}
                    {r.note && ` · “${r.note}”`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold">Legal documents</h3>
          <p className="mt-1 text-sm text-zinc-400">Shown to members at registration and in their portal. Version {LEGAL_VERSION}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(LEGAL_LABELS) as LegalDocKey[]).map((k) => (
              <Button key={k} size="sm" variant="outline" onClick={() => setDoc(k)}>
                <FileText size={13} /> {LEGAL_LABELS[k]}
              </Button>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold">Data retention</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Delete attendance, class bookings and log entries older than {settings.retentionMonths ?? 24} months, as stated in the Privacy Notice.
          </p>
          <Button className="mt-3" size="sm" variant="outline" onClick={runRetention}>
            <Eraser size={13} /> Apply retention now
          </Button>
          {retentionMsg && <p className="mt-2 text-xs text-lime-300">{retentionMsg}</p>}
        </Card>
      </div>

      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <div className="text-lg font-bold tabular-nums">{value}</div>
    <div className="text-[11px] text-zinc-500">{label}</div>
  </div>
);

/* ---------------- Plans & gym ---------------- */

function PlansTab() {
  const { plans, members, settings, actions } = useStore();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [gymName, setGymName] = useState(settings.gymName);
  const [walkIn, setWalkIn] = useState(String(settings.walkInPrice));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setGymName(settings.gymName);
    setWalkIn(String(settings.walkInPrice));
  }, [settings]);

  const usage = (id: string) => members.filter((m) => m.planId === id && memberStatus(m) !== 'expired').length;

  const remove = (p: Plan) => {
    if (members.some((m) => m.planId === p.id)) {
      alert(`Can't delete “${p.name}”: may mga member pa na naka-${p.name}. Move them to another plan first.`);
      return;
    }
    if (confirm(`Delete the ${p.name} plan?`)) actions.deletePlan(p.id);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Membership plans</h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus size={14} /> New plan
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between">
              <div className="text-sm font-medium text-zinc-400">{p.name}</div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                  <Pencil size={14} />
                </button>
                <button onClick={() => remove(p)} aria-label={`Delete ${p.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 text-3xl font-bold tracking-tight">{peso(p.price)}</div>
            <div className="mt-1 text-sm text-zinc-500">
              {p.durationDays} days · {peso(Math.round(p.price / p.durationDays))}/day
            </div>
            <div className="mt-5 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
              <span className="font-semibold text-lime-300">{usage(p.id)}</span> active members
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-6 max-w-xl">
        <CardHeader title={<span className="inline-flex items-center gap-2"><Settings2 size={16} /> Gym details</span>} />
        <form
          className="space-y-4 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            actions.updateSettings({ gymName: gymName.trim() || settings.gymName, walkInPrice: Math.max(0, Number(walkIn) || 0) });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        >
          <Field label="Gym name">
            <input className={inputCls} value={gymName} onChange={(e) => setGymName(e.target.value)} />
          </Field>
          <Field label="Walk-in / day pass price (₱)">
            <input className={inputCls} type="number" min={0} value={walkIn} onChange={(e) => setWalkIn(e.target.value)} />
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit">Save</Button>
            {saved && <span className="text-sm text-lime-300">Saved ✓</span>}
          </div>
        </form>
      </Card>

      <PlanModal plan={editing} onClose={() => setEditing(null)} onSave={actions.savePlan} />
    </>
  );
}

function PlanModal({ plan, onClose, onSave }: { plan: Plan | 'new' | null; onClose: () => void; onSave: (p: Omit<Plan, 'id'> & { id?: string }) => void }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState('30');
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (plan && plan !== 'new') {
      setName(plan.name);
      setDays(String(plan.durationDays));
      setPrice(String(plan.price));
    } else if (plan === 'new') {
      setName('');
      setDays('30');
      setPrice('');
    }
  }, [plan]);

  const valid = name.trim() && Number(days) > 0 && price !== '' && Number(price) >= 0;

  return (
    <Modal open={!!plan} onClose={onClose} title={plan === 'new' ? 'New plan' : 'Edit plan'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ id: plan && plan !== 'new' ? plan.id : undefined, name: name.trim(), durationDays: Math.round(Number(days)), price: Math.round(Number(price)) });
          onClose();
        }}
      >
        <Field label="Plan name">
          <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Student Monthly" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration (days)">
            <input className={inputCls} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label="Price (₱)">
            <input className={inputCls} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid}>
            Save plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Staff accounts ---------------- */

function StaffTab() {
  const { users, currentUser, actions, mode } = useStore();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const admins = users.filter((u) => u.role === 'admin').length;

  const remove = (u: User) => {
    if (u.id === currentUser?.id) return alert("You can't delete the account you're signed in with.");
    if (u.role === 'admin' && admins <= 1) return alert('Keep at least one admin account.');
    if (confirm(`Delete the account “${u.username}”?`)) actions.deleteUser(u.id);
  };

  return (
    <>
      {mode === 'cloud' && <MfaCard required={currentUser?.role === 'admin'} />}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">{users.length} accounts</h2>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus size={14} /> New account
        </Button>
      </div>
      <Card className="divide-y divide-zinc-800/70">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <Avatar name={u.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {u.name}
                {u.id === currentUser?.id && <span className="text-xs font-normal text-zinc-500">(you)</span>}
              </div>
              <div className="text-xs text-zinc-500">{mode === 'cloud' ? u.username : `@${u.username}`}</div>
            </div>
            <Pill className={u.role === 'admin' ? 'bg-lime-400/10 text-lime-300' : ''}>
              {u.role === 'admin' ? <ShieldCheck size={12} className="mr-1" /> : <UserRound size={12} className="mr-1" />}
              {u.role === 'admin' ? 'Admin' : 'Staff'}
            </Pill>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(u)}>
                <Pencil size={14} />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(u)} className="hover:text-red-400">
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="mt-6 p-5 text-sm text-zinc-400">
        <h3 className="mb-2 font-semibold text-zinc-200">What each role can do</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 font-medium text-lime-300">Admin</div>
            Everything: reports, plans and prices, staff accounts, activity log, backup, deleting members, managing classes and trainers.
          </div>
          <div>
            <div className="mb-1 font-medium text-zinc-200">Staff (front desk)</div>
            Check-ins, walk-ins, registering and renewing members, payments and receipts, booking members into classes, logging weigh-ins.
          </div>
        </div>
      </Card>

      <UserModal value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function UserModal({ value, onClose }: { value: User | 'new' | null; onClose: () => void }) {
  const { users, actions, mode } = useStore();
  const cloud = mode === 'cloud'; // cloud accounts sign in with email; demo accounts with a username
  const [f, setF] = useState({ name: '', username: '', role: 'staff' as Role, password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = value === 'new';

  useEffect(() => {
    setError('');
    if (value === 'new') setF({ name: '', username: '', role: 'staff', password: '' });
    else if (value) setF({ name: value.name, username: value.username, role: value.role, password: '' });
  }, [value]);

  async function submit() {
    const username = f.username.trim().toLowerCase();
    if (f.name.trim().length < 2) return setError('Enter a display name.');
    if (cloud ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(username) : !/^[a-z0-9._-]{3,}$/.test(username))
      return setError(cloud ? 'Enter a valid email address.' : 'Username needs 3+ letters/numbers (no spaces).');
    if (users.some((u) => u.username === username && (isNew || u.id !== (value as User).id))) return setError(`That ${cloud ? 'email' : 'username'} is taken.`);
    if (!isNew && (value as User).role === 'admin' && f.role !== 'admin' && users.filter((u) => u.role === 'admin').length <= 1)
      return setError('Keep at least one admin account.');
    setBusy(true);
    const err = await actions.saveUser({
      id: isNew ? undefined : (value as User).id,
      name: f.name.trim(),
      username,
      role: f.role,
      password: f.password || undefined,
    });
    setBusy(false);
    if (err) return setError(err);
    onClose();
  }

  return (
    <Modal open={!!value} onClose={onClose} title={isNew ? 'New staff account' : 'Edit account'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Display name">
          <input autoFocus className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Ate Joy" />
        </Field>
        <Field label={cloud ? 'Email (used to sign in)' : 'Username'}>
          <input
            className={inputCls}
            type={cloud ? 'email' : 'text'}
            value={f.username}
            disabled={cloud && !isNew}
            onChange={(e) => setF({ ...f, username: e.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field label="Role">
          <div className="grid grid-cols-2 gap-2">
            {(['staff', 'admin'] as Role[]).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setF({ ...f, role: r })}
                className={cn('rounded-xl border p-3 text-left text-sm transition', f.role === r ? 'border-lime-400/60 bg-lime-400/5' : 'border-zinc-800 hover:border-zinc-700')}
              >
                <div className="font-medium capitalize">{r}</div>
                <div className="text-xs text-zinc-500">{r === 'admin' ? 'Full access' : 'Front desk only'}</div>
              </button>
            ))}
          </div>
        </Field>
        <Field
          label={isNew ? 'Temporary password' : 'Reset password'}
          hint={
            isNew
              ? 'At least 8 characters with letters and numbers. They must change it at first sign-in.'
              : 'Leave blank to keep the current password. A reset password is temporary.'
          }
        >
          <div className="relative">
            <KeyRound size={15} className="pointer-events-none absolute top-3 left-3 text-zinc-500" />
            <input className={cn(inputCls, 'pl-9')} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
          </div>
          <StrengthMeter value={f.password} />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Activity log ---------------- */

function ActivityTab() {
  const { activity } = useStore();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const people = useMemo(() => [...new Set(activity.map((a) => a.userName))], [activity]);
  const list = activity.filter(
    (a) => (who === 'all' || a.userName === who) && (!q.trim() || a.text.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <input className={cn(inputCls, 'pl-9')} placeholder="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={cn(inputCls, 'sm:w-48')} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <Card>
        {list.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-sm text-zinc-500">
            <History size={20} className="mb-2" /> Nothing logged yet. Actions you take show up here.
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {list.slice(0, 200).map((a) => (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <Avatar name={a.userName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-medium">{a.userName}</span> <span className="text-zinc-400">{a.text.charAt(0).toLowerCase() + a.text.slice(1)}</span>
                  </div>
                  <div className="text-xs text-zinc-500">{fmtDateTime(a.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ---------------- Backup ---------------- */

function BackupTab() {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const exportJson = () => {
    if (
      !confirm(
        'This backup contains personal and health data of all members, plus hashed staff passwords.\n\nStore it encrypted (e.g. a password-protected drive), never share it by chat or email, and delete old copies. Continue?',
      )
    )
      return;
    const {
      actions: _a, currentUser: _u, currentMember: _m, notice: _n, idleSecondsLeft: _i, mode: _mo, loading: _l, mfaPending: _mf,
      noAccess: _na, error: _e, clearError: _ce, ...data
    } = store;
    void [_a, _u, _m, _n, _i, _mo, _l, _mf, _na, _e, _ce];
    downloadFile(`irondesk-backup-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
    setMsg({ ok: true, text: 'Backup downloaded.' });
  };

  const importJson = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('too large'); // refuse oversized files
      const data = JSON.parse(await file.text());
      if (!isValidState(data)) throw new Error('invalid'); // structural validation: rejects malformed or tampered files
      if (!data.users.some((u) => u.id === store.currentUser?.id))
        if (!confirm('Your current account is not in this backup, so you will be signed out. Continue?')) return;
      if (!confirm(`Restore ${data.members.length} members and ${data.payments.length} payments? This replaces everything currently saved.`)) return;
      store.actions.importData(data);
      setMsg({ ok: true, text: 'Backup restored.' });
    } catch {
      setMsg({ ok: false, text: 'That file is not a valid IronDesk backup.' });
    }
  };

  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Card className="p-5">
        <Download size={20} className="text-lime-300" />
        <h3 className="mt-3 font-semibold">Export backup</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Download everything (members, payments, classes, staff) as a JSON file. It contains personal and health data: keep it encrypted.
        </p>
        <Button className="mt-4" onClick={exportJson}>
          Download .json
        </Button>
      </Card>
      <Card className="p-5">
        <Upload size={20} className="text-sky-300" />
        <h3 className="mt-3 font-semibold">Restore backup</h3>
        <p className="mt-1 text-sm text-zinc-400">Load a backup file. This replaces the data saved in this browser.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importJson(file);
            e.target.value = '';
          }}
        />
        <Button className="mt-4" variant="outline" disabled={store.mode === 'cloud'} onClick={() => fileRef.current?.click()}>
          {store.mode === 'cloud' ? 'Use Supabase backups' : 'Choose file…'}
        </Button>
      </Card>
      {msg && <p className={cn('text-sm sm:col-span-2', msg.ok ? 'text-lime-300' : 'text-red-400')}>{msg.text}</p>}
    </div>
  );
}
