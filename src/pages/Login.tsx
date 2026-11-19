import { useState, type FormEvent } from 'react';
import { Dumbbell, Info, Lock, LogIn, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useStore, type LoginResult } from '../lib/store';
import type { LegalDocKey } from '../lib/legal';
import { cn } from '../lib/utils';
import { Button, Field, inputCls } from '../components/ui';
import { LegalLinks, LegalModal } from '../components/LegalModal';

type Mode = 'member' | 'staff';
const DEMO_PIN = '246810';

const STAFF_DEMO = [
  { username: 'admin', password: 'admin123', label: 'Admin', desc: 'Full access: reports, settings, staff', icon: ShieldCheck },
  { username: 'staff', password: 'staff123', label: 'Front desk', desc: 'Check-ins, members, payments, classes', icon: UserRound },
];

const mins = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export default function Login() {
  const { settings, members, actions, notice } = useStore();
  const [mode, setMode] = useState<Mode>('member');
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  const demoMember = members.find((m) => m.id === settings.demoMemberId);

  function explain(r: LoginResult, m: Mode) {
    if (r.ok) return '';
    if (r.lockedMs) return `Too many failed attempts. Sign-in is locked for ${mins(r.lockedMs)} minutes for security.`;
    const base = m === 'staff' ? 'Wrong username or password.' : 'Wrong mobile number or PIN.';
    return r.attemptsLeft !== undefined && r.attemptsLeft <= 3 ? `${base} ${r.attemptsLeft} attempt${r.attemptsLeft === 1 ? '' : 's'} left before lock.` : base;
  }

  async function signIn(m: Mode, a: string, b: string) {
    setBusy(true);
    setError('');
    actions.clearNotice();
    const r = m === 'staff' ? await actions.login(a, b) : await actions.memberLogin(a, b);
    setBusy(false);
    if (!r.ok) {
      setError(explain(r, m));
      setSecret('');
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m);
    setId('');
    setSecret('');
    setError('');
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (id && secret) signIn(mode, id, secret);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,rgba(163,230,53,0.08),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-lime-400 text-zinc-950 shadow-[0_0_40px_rgba(163,230,53,0.25)]">
            <Dumbbell size={26} strokeWidth={2.5} />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">IronDesk</h1>
          <p className="mt-1 text-sm text-zinc-400">{settings.gymName}</p>
        </div>

        {notice && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
            <Info size={16} className="mt-0.5 shrink-0" />
            {notice}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {(['member', 'staff'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={cn('rounded-lg py-2 text-sm font-medium transition', mode === m ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200')}
            >
              {m === 'member' ? 'Member' : 'Staff'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
          {mode === 'member' ? (
            <>
              <Field label="Mobile number">
                <input autoFocus className={inputCls} value={id} onChange={(e) => setId(e.target.value)} inputMode="tel" autoComplete="username" placeholder="09XX XXX XXXX" />
              </Field>
              <Field label="PIN" hint="Forgot your PIN? Ask the front desk to reset it.">
                <input
                  className={cn(inputCls, 'tracking-[0.4em]')}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value.replace(/\D/g, ''))}
                  autoComplete="current-password"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Username">
                <input autoFocus className={inputCls} value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
              </Field>
              <Field label="Password">
                <input className={inputCls} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" />
              </Field>
            </>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-red-400">
              {error.startsWith('Too many') && <Lock size={14} className="mt-0.5 shrink-0" />}
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || !id || !secret}>
            <LogIn size={16} /> {busy ? 'Checking…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-center text-xs text-zinc-500">Demo accounts: click one to sign in</p>
          <div className="grid gap-2">
            {mode === 'member' && demoMember && (
              <DemoButton
                icon={Smartphone}
                title={`Member · ${demoMember.name}`}
                sub={`${demoMember.phone} / PIN ${DEMO_PIN}`}
                disabled={busy}
                onClick={() => signIn('member', demoMember.phone, DEMO_PIN)}
              />
            )}
            {mode === 'staff' &&
              STAFF_DEMO.map((d) => (
                <DemoButton
                  key={d.username}
                  icon={d.icon}
                  title={`${d.label} · ${d.username} / ${d.password}`}
                  sub={d.desc}
                  disabled={busy}
                  onClick={() => signIn('staff', d.username, d.password)}
                />
              ))}
          </div>
          {mode === 'member' && <p className="mt-3 text-center text-xs text-zinc-500">All demo members use PIN {DEMO_PIN}.</p>}
        </div>

        <LegalLinks onOpen={setDoc} className="mt-8" />
        <p className="mt-2 text-center text-[11px] text-zinc-600">Portfolio demo · fictional data · not legal advice</p>
      </div>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function DemoButton({
  icon: Icon,
  title,
  sub,
  onClick,
  disabled,
}: {
  icon: typeof ShieldCheck;
  title: string;
  sub: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <span className="grid size-9 place-items-center rounded-lg bg-zinc-800 text-lime-300">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-zinc-500">{sub}</span>
      </span>
    </button>
  );
}
