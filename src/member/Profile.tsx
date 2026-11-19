import { useEffect, useState, type FormEvent } from 'react';
import { Download, FileText, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import type { PrivacyRequest } from '../types';
import { useStore } from '../lib/store';
import type { LegalDocKey } from '../lib/legal';
import { Avatar, Button, Card, CardHeader, Field, StatusBadge, inputCls } from '../components/ui';
import { ChangePinForm } from '../components/security';
import { LEGAL_LABELS, LegalModal } from '../components/LegalModal';
import { cn, downloadFile, fmtDate, fmtDateTime, memberStatus, shortId, todayISO } from '../lib/utils';

const PH_MOBILE = /^(09|\+639|639)\d{9}$/;
const REQUEST_LABEL: Record<PrivacyRequest['type'], string> = {
  erasure: 'Delete my account and data',
  correction: 'Correct my data',
  objection: 'Object to / stop a type of processing',
};

export default function MemberProfile() {
  const store = useStore();
  const { currentMember: m, members, plans, privacyRequests, actions, mode } = store;
  const cloud = mode === 'cloud';
  const [phone, setPhone] = useState(m?.phone ?? '');
  const [email, setEmail] = useState(m?.email ?? '');
  const [contactMsg, setContactMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  const [reqType, setReqType] = useState<PrivacyRequest['type']>('correction');
  const [reqDetails, setReqDetails] = useState('');
  const [reqMsg, setReqMsg] = useState('');

  useEffect(() => {
    setPhone(m?.phone ?? '');
    setEmail(m?.email ?? '');
  }, [m?.phone, m?.email]);

  if (!m) return null;
  const plan = plans.find((p) => p.id === m.planId);
  const marketing = [...(m.consents ?? [])].reverse().find((c) => c.type === 'marketing');
  const myRequests = privacyRequests.filter((r) => r.memberId === m.id);
  const pendingErasure = myRequests.some((r) => r.type === 'erasure' && r.status === 'pending');

  const saveContact = (e: FormEvent) => {
    e.preventDefault();
    const p = phone.replace(/[\s-]/g, '');
    if (!PH_MOBILE.test(p)) return setContactMsg({ ok: false, text: 'Enter a valid PH mobile number.' });
    const d = p.replace(/\D/g, '').slice(-10);
    if (members.some((x) => x.id !== m.id && x.phone.replace(/\D/g, '').slice(-10) === d))
      return setContactMsg({ ok: false, text: 'That number is already used by another member.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setContactMsg({ ok: false, text: 'Enter a valid email.' });
    actions.updateMember(m.id, cloud ? { phone: phone.trim() } : { phone: phone.trim(), email: email.trim() });
    setContactMsg({ ok: true, text: cloud ? 'Saved.' : 'Saved. Use your new number the next time you sign in.' });
  };

  /** Right to data portability: everything we hold about this member, minus security secrets. */
  const downloadMyData = () => {
    const { pinHash: _p, ...profile } = m;
    void _p;
    const data = {
      exportedAt: new Date().toISOString(),
      gym: store.settings.legalName || store.settings.gymName,
      profile,
      payments: store.payments.filter((p) => p.memberId === m.id),
      checkIns: store.checkIns.filter((c) => c.memberId === m.id),
      classBookings: store.bookings.filter((b) => b.memberId === m.id),
      weighIns: store.measurements.filter((x) => x.memberId === m.id),
      privacyRequests: myRequests,
    };
    downloadFile(`my-gym-data-${shortId(m.id)}-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  const submitRequest = (e: FormEvent) => {
    e.preventDefault();
    if (reqType !== 'erasure' && reqDetails.trim().length < 5) return setReqMsg('Please describe your request.');
    if (reqType === 'erasure' && !confirm('Request permanent deletion of your account and data? Once approved, this cannot be undone.')) return;
    actions.submitPrivacyRequest(reqType, reqDetails);
    setReqDetails('');
    setReqMsg('Request sent. The gym will review it and update the status here.');
  };

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{m.name}</div>
          <div className="text-sm text-zinc-400">
            #{shortId(m.id)} · since {fmtDate(m.joinedAt)}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-400">
            <StatusBadge status={memberStatus(m)} /> {plan?.name} · until {fmtDate(m.expiryDate)}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Contact info" />
        <form onSubmit={saveContact} className="space-y-4 px-5 pb-5">
          <Field label="Mobile number" hint={cloud ? undefined : 'This is also your sign-in number.'}>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Email" hint={cloud ? 'You sign in with this email. To change it, ask the front desk or send a correction request below.' : undefined}>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" readOnly={cloud} disabled={cloud} />
          </Field>
          {contactMsg && <p className={cn('text-sm', contactMsg.ok ? 'text-lime-300' : 'text-red-400')}>{contactMsg.text}</p>}
          <Button type="submit" variant="outline">
            Save contact info
          </Button>
        </form>
      </Card>

      {!cloud && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><KeyRound size={15} /> Change PIN</span>} />
          <div className="px-5 pb-5">
            <ChangePinForm />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} /> Privacy & data</span>} />
        <div className="space-y-5 px-5 pb-5 text-sm">
          <div className="grid gap-2">
            {(Object.keys(LEGAL_LABELS) as LegalDocKey[]).map((k) => (
              <button key={k} onClick={() => setDoc(k)} className="flex items-center gap-2 text-left text-zinc-300 hover:text-lime-300">
                <FileText size={14} className="text-zinc-500" /> {LEGAL_LABELS[k]}
              </button>
            ))}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-zinc-950 p-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-lime-400"
              checked={!!marketing?.granted}
              onChange={(e) => actions.setMarketingConsent(m.id, e.target.checked)}
            />
            <span>
              <span className="block font-medium">Promotions & gym news</span>
              <span className="block text-xs text-zinc-500">
                {marketing ? `Last updated ${fmtDateTime(marketing.at)}` : 'Not set'} · You can change this any time.
              </span>
            </span>
          </label>

          <div>
            <div className="font-medium">Download my data</div>
            <p className="mt-0.5 mb-2 text-xs text-zinc-500">A copy of everything the gym holds about you, in a portable JSON file.</p>
            <Button size="sm" variant="outline" onClick={downloadMyData}>
              <Download size={13} /> Download (.json)
            </Button>
          </div>

          <form onSubmit={submitRequest} className="space-y-3 border-t border-zinc-800 pt-4">
            <div className="font-medium">Make a data privacy request</div>
            <select className={inputCls} value={reqType} onChange={(e) => setReqType(e.target.value as PrivacyRequest['type'])}>
              {(Object.keys(REQUEST_LABEL) as PrivacyRequest['type'][]).map((t) => (
                <option key={t} value={t} disabled={t === 'erasure' && pendingErasure}>
                  {REQUEST_LABEL[t]}
                </option>
              ))}
            </select>
            <textarea
              className={inputCls}
              rows={2}
              maxLength={1000}
              value={reqDetails}
              onChange={(e) => setReqDetails(e.target.value)}
              placeholder={reqType === 'erasure' ? 'Reason (optional)' : 'What should we change or stop?'}
            />
            {reqType === 'erasure' && (
              <p className="text-xs text-zinc-500">Payment records are kept de-identified as required for accounting. Any remaining membership days are forfeited unless the gym agrees otherwise.</p>
            )}
            {reqMsg && <p className="text-xs text-lime-300">{reqMsg}</p>}
            <Button size="sm" type="submit" variant={reqType === 'erasure' ? 'danger' : 'outline'}>
              Send request
            </Button>
          </form>

          {myRequests.length > 0 && (
            <ul className="space-y-2 border-t border-zinc-800 pt-4">
              {myRequests.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-zinc-400">
                    {REQUEST_LABEL[r.type]} · {fmtDateTime(r.createdAt)}
                    {r.note && <span className="block text-zinc-500">Reply: {r.note}</span>}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-0.5 font-medium capitalize',
                      r.status === 'pending' ? 'bg-amber-400/10 text-amber-300' : r.status === 'completed' ? 'bg-lime-400/10 text-lime-300' : 'bg-zinc-800 text-zinc-400',
                    )}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Button variant="danger" className="w-full" onClick={() => actions.logout()}>
        <LogOut size={16} /> Sign out
      </Button>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
