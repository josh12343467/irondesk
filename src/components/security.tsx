import { useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, LogOut, ShieldCheck, TimerReset } from 'lucide-react';
import { useStore } from '../lib/store';
import { passwordStrength } from '../lib/security';
import { cn } from '../lib/utils';
import { Button, Field, Modal, inputCls } from './ui';

/* ---------------- password strength meter ---------------- */

export function StrengthMeter({ value }: { value: string }) {
  if (!value) return null;
  const score = passwordStrength(value);
  const labels = ['Very weak', 'Weak', 'Okay', 'Strong', 'Very strong'];
  const colors = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-lime-400', 'bg-lime-300'];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < score ? colors[score] : 'bg-zinc-800')} />
        ))}
      </div>
      <span className="mt-1 block text-xs text-zinc-500">{labels[score]}</span>
    </div>
  );
}

/* ---------------- change password / PIN forms ---------------- */

function ChangeSecretForm({ kind, onDone }: { kind: 'password' | 'pin'; onDone?: () => void }) {
  const { actions } = useStore();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const isPin = kind === 'pin';
  const label = isPin ? 'PIN' : 'password';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.next !== f.confirm) return setMsg({ ok: false, text: `New ${label}s don't match.` });
    setBusy(true);
    const err = isPin ? await actions.changeOwnPin(f.current, f.next) : await actions.changeOwnPassword(f.current, f.next);
    setBusy(false);
    if (err) return setMsg({ ok: false, text: err });
    setF({ current: '', next: '', confirm: '' });
    setMsg({ ok: true, text: `${isPin ? 'PIN' : 'Password'} updated ✓` });
    onDone?.();
  }

  const input = (key: keyof typeof f, autoComplete: string) => (
    <input
      className={cn(inputCls, isPin && 'tracking-[0.4em]')}
      type="password"
      inputMode={isPin ? 'numeric' : undefined}
      maxLength={isPin ? 6 : 128}
      autoComplete={autoComplete}
      value={f[key]}
      onChange={(e) => setF({ ...f, [key]: isPin ? e.target.value.replace(/\D/g, '') : e.target.value })}
    />
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={`Current ${label}`}>{input('current', 'current-password')}</Field>
      <Field
        label={`New ${label}`}
        hint={isPin ? '6 digits. No repeated digits, sequences, or digits from your mobile number.' : 'At least 8 characters with letters and numbers.'}
      >
        {input('next', 'new-password')}
        {!isPin && <StrengthMeter value={f.next} />}
      </Field>
      <Field label={`Confirm new ${label}`}>{input('confirm', 'new-password')}</Field>
      {msg && <p className={cn('text-sm', msg.ok ? 'text-lime-300' : 'text-red-400')}>{msg.text}</p>}
      <Button type="submit" disabled={busy || !f.current || !f.next || !f.confirm}>
        <KeyRound size={15} /> {busy ? 'Saving…' : `Update ${label}`}
      </Button>
    </form>
  );
}

export const ChangePinForm = () => <ChangeSecretForm kind="pin" />;

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <ChangeSecretForm kind="password" onDone={() => setTimeout(onClose, 900)} />
    </Modal>
  );
}

/** Full-screen gate shown when an admin issued a temporary password or PIN. */
export function ForceChangeScreen({ kind }: { kind: 'password' | 'pin' }) {
  const { actions, currentUser, currentMember } = useStore();
  const name = currentUser?.name ?? currentMember?.name ?? '';
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
        <span className="grid size-11 place-items-center rounded-xl bg-lime-400/10 text-lime-300">
          <ShieldCheck size={22} />
        </span>
        <h1 className="mt-4 text-xl font-bold">Set your own {kind === 'pin' ? 'PIN' : 'password'}</h1>
        <p className="mt-1 mb-5 text-sm text-zinc-400">
          Hi {name.split(' ')[0]}! You signed in with a temporary {kind === 'pin' ? 'PIN' : 'password'} from the {kind === 'pin' ? 'front desk' : 'admin'}. For your security,
          choose a new one only you know.
        </p>
        <ChangeSecretForm kind={kind} />
        <button onClick={() => actions.logout()} className="mt-5 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}

/* ---------------- idle warning ---------------- */

export function IdleWarning() {
  const { idleSecondsLeft, actions } = useStore();
  if (idleSecondsLeft === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-amber-400/40 bg-zinc-900 p-4 shadow-2xl">
        <TimerReset size={20} className="shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Still there?</div>
          <div className="text-zinc-400">You'll be signed out in {idleSecondsLeft}s for security.</div>
        </div>
        <Button size="sm" onClick={actions.stayActive}>
          Stay signed in
        </Button>
      </div>
    </div>
  );
}

/* ---------------- action error toast ---------------- */

export function ErrorToast() {
  const { error, clearError } = useStore();
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 6000);
    return () => clearTimeout(t);
  }, [error, clearError]);
  if (!error) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="flex max-w-md items-start gap-3 rounded-xl border border-red-500/40 bg-zinc-900 px-4 py-3 text-sm text-red-200 shadow-2xl">
        <span className="flex-1">{error}</span>
        <button onClick={clearError} className="text-xs text-zinc-400 hover:text-zinc-100">
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ---------------- one-time PIN display ---------------- */

export function TempPinModal({ value, onClose }: { value: { name: string; pin: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <Modal open onClose={onClose} title="Temporary portal PIN">
      <p className="text-sm text-zinc-400">
        Give this PIN to <span className="font-medium text-zinc-100">{value.name}</span> in person or by SMS. It is shown only once and is
        not stored anywhere in readable form. They will be asked to set their own PIN on first sign-in.
      </p>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-zinc-950 px-5 py-4">
        <span className="font-mono text-3xl font-bold tracking-[0.3em] text-lime-300">{value.pin}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(value.pin).then(() => setCopied(true), () => setCopied(false));
          }}
        >
          <Copy size={13} /> {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
