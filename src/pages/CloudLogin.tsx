import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Dumbbell, Info, Lock, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { useStore } from '../lib/store';
import type { LegalDocKey } from '../lib/legal';
import { friendlyError } from '../lib/cloud/client';
import { mfaChallenge, sendEmailCode, verifyEmailCode } from '../lib/cloud/auth';
import { cn } from '../lib/utils';
import { Button, Field, inputCls } from '../components/ui';
import { LegalLinks, LegalModal } from '../components/LegalModal';

type Mode = 'member' | 'staff';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Shell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  const { settings, notice } = useStore();
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
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
        {children}
        {footer && <LegalLinks onOpen={setDoc} className="mt-8" />}
      </div>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

export default function CloudLogin() {
  const { actions } = useStore();
  const [mode, setMode] = useState<Mode>('member');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setPassword('');
    setCode('');
    setCodeSent(false);
  };

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!EMAIL.test(email.trim())) return setError('Enter the email you registered with at the front desk.');
    setBusy(true);
    setError('');
    actions.clearNotice();
    try {
      await sendEmailCode(email);
      setCodeSent(true);
      setCooldown(60);
    } catch (err) {
      setError(/rate|seconds/i.test(String((err as Error).message)) ? 'Please wait a minute before requesting another code.' : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await verifyEmailCode(email, code);
    } catch {
      setError('That code is wrong or has expired. Request a new one.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function staffSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    actions.clearNotice();
    const r = await actions.login(email, password);
    setBusy(false);
    if (!r.ok) {
      setPassword('');
      setError(
        r.lockedMs
          ? `Too many failed attempts. Sign-in is locked for ${Math.ceil(r.lockedMs / 60_000)} minutes for security.`
          : `Wrong email or password.${r.attemptsLeft !== undefined && r.attemptsLeft <= 3 ? ` ${r.attemptsLeft} attempts left before lock.` : ''}`,
      );
    }
  }

  return (
    <Shell>
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
        {mode === 'member' && !codeSent && (
          <form onSubmit={sendCode} className="space-y-4">
            <Field label="Email" hint="The email you gave the front desk when you registered.">
              <input autoFocus className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="juan@gmail.com" />
            </Field>
            {error && <ErrorText text={error} />}
            <Button type="submit" className="w-full" disabled={busy || !email}>
              <Mail size={16} /> {busy ? 'Sending…' : 'Send sign-in code'}
            </Button>
          </form>
        )}

        {mode === 'member' && codeSent && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-zinc-400">
              We sent a code to <span className="font-medium text-zinc-100">{email.trim().toLowerCase()}</span>. Check your Spam folder too.
            </p>
            <Field label="Sign-in code">
              <input
                autoFocus
                className={cn(inputCls, 'text-center font-mono text-xl tracking-[0.4em]')}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            {error && <ErrorText text={error} />}
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
              <LogIn size={16} /> {busy ? 'Checking…' : 'Sign in'}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button type="button" onClick={() => switchMode('member')} className="inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300">
                <ArrowLeft size={12} /> Change email
              </button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={() => sendCode()} className="text-zinc-400 hover:text-lime-300 disabled:text-zinc-600">
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {mode === 'staff' && (
          <form onSubmit={staffSignIn} className="space-y-4">
            <Field label="Email">
              <input autoFocus className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password">
              <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            {error && <ErrorText text={error} />}
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>
              <LogIn size={16} /> {busy ? 'Checking…' : 'Sign in'}
            </Button>
          </form>
        )}
      </div>
      <p className="mt-4 text-center text-xs text-zinc-500">
        {mode === 'member' ? 'No password needed: we email you a sign-in code.' : 'Staff accounts are created by an admin.'}
      </p>
    </Shell>
  );
}

const ErrorText = ({ text }: { text: string }) => (
  <p role="alert" className="flex items-start gap-1.5 text-sm text-red-400">
    {text.startsWith('Too many') && <Lock size={14} className="mt-0.5 shrink-0" />}
    {text}
  </p>
);

/** Second step for accounts with an authenticator app. */
export function MfaChallengeScreen() {
  const { actions } = useStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mfaChallenge(code);
    } catch {
      setError('Wrong or expired code. Try the newest code in your authenticator app.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell footer={false}>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-lime-400/10 text-lime-300">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h2 className="font-semibold">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-zinc-400">Enter the 6-digit code from your authenticator app.</p>
        </div>
        <input
          autoFocus
          className={cn(inputCls, 'text-center font-mono text-xl tracking-[0.4em]')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error && <ErrorText text={error} />}
        <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
          Verify
        </Button>
        <button type="button" onClick={() => actions.logout()} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300">
          Use a different account
        </button>
      </form>
    </Shell>
  );
}

/** Signed in, but the email isn't linked to a member or staff record. */
export function NoAccessScreen() {
  const { actions } = useStore();
  return (
    <Shell footer={false}>
      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 text-sm">
        <h2 className="text-base font-semibold">No account linked</h2>
        <p className="text-zinc-400">
          Your email is verified, but no member or staff record is linked to it yet. If you're a member, make sure this is the email you
          gave the front desk, or ask them to update it.
        </p>
        <Button className="w-full" variant="outline" onClick={() => actions.logout()}>
          Sign out
        </Button>
      </div>
    </Shell>
  );
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-zinc-500">
        <span className="grid size-12 animate-pulse place-items-center rounded-2xl bg-lime-400 text-zinc-950">
          <Dumbbell size={22} strokeWidth={2.5} />
        </span>
        Loading…
      </div>
    </div>
  );
}
