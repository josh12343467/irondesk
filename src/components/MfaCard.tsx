import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { friendlyError } from '../lib/cloud/client';
import { mfaConfirmEnrollment, mfaEnroll, mfaRemove, verifiedFactors } from '../lib/cloud/auth';
import { cn } from '../lib/utils';
import { Button, Card, CardHeader, inputCls } from './ui';

/** Cloud mode: set up an authenticator app (TOTP) for the signed-in staff account. */
export function MfaCard({ required }: { required: boolean }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    verifiedFactors()
      .then((f) => setFactorId(f[0]?.id ?? null))
      .catch(() => setFactorId(null))
      .finally(() => setChecked(true));
  useEffect(() => {
    load();
  }, []);

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      setEnrolling(await mfaEnroll());
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!enrolling) return;
    setBusy(true);
    try {
      await mfaConfirmEnrollment(enrolling.factorId, code);
      setEnrolling(null);
      setCode('');
      setMsg({ ok: true, text: 'Two-factor authentication is on. You’ll be asked for a code each time you sign in.' });
      await load();
    } catch {
      setMsg({ ok: false, text: 'That code didn’t match. Check the time on your phone and try the newest code.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!factorId || !confirm_('Turn off two-factor authentication for your account?')) return;
    try {
      await mfaRemove(factorId);
      setMsg({ ok: true, text: 'Two-factor authentication is off.' });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            {factorId ? <ShieldCheck size={16} className="text-lime-400" /> : <ShieldOff size={16} className="text-amber-400" />}
            Two-factor authentication (your account)
          </span>
        }
      />
      <div className="space-y-4 px-5 pb-5 text-sm">
        {!checked ? (
          <p className="text-zinc-500">Checking…</p>
        ) : factorId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-zinc-300">On: you sign in with your password plus a code from your authenticator app.</p>
            <Button size="sm" variant="ghost" onClick={remove}>
              Turn off
            </Button>
          </div>
        ) : enrolling ? (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <img src={enrolling.qr} alt="Scan with your authenticator app" width={168} height={168} className="rounded-lg bg-white p-2" />
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-4 text-zinc-400">
                <li>Open Google Authenticator, Microsoft Authenticator or similar.</li>
                <li>Scan the QR code (or enter the key below).</li>
                <li>Type the 6-digit code it shows.</li>
              </ol>
              <code className="block rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs break-all text-zinc-400">{enrolling.secret}</code>
              <div className="flex gap-2">
                <input
                  className={cn(inputCls, 'max-w-40 text-center font-mono tracking-[0.3em]')}
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                />
                <Button onClick={confirm} disabled={busy || code.length !== 6}>
                  Confirm
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={required ? 'text-amber-200' : 'text-zinc-400'}>
              {required
                ? 'Strongly recommended for admins: protects members’ health and payment data even if your password leaks.'
                : 'Add a second step to your sign-in with an authenticator app.'}
            </p>
            <Button size="sm" onClick={start} disabled={busy}>
              <Smartphone size={14} /> Set up
            </Button>
          </div>
        )}
        {msg && <p className={msg.ok ? 'text-lime-300' : 'text-red-400'}>{msg.text}</p>}
      </div>
    </Card>
  );
}

const confirm_ = (q: string) => window.confirm(q);
