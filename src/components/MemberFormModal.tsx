import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { HeartPulse, KeyRound, TriangleAlert } from 'lucide-react';
import type { Member, PaymentMethod } from '../types';
import { useStore } from '../lib/store';
import { HEALTH_QUESTIONS, type LegalDocKey } from '../lib/legal';
import { ageOn } from '../lib/security';
import { addDays, cn, fmtDate, peso, todayISO } from '../lib/utils';
import { Button, Field, MethodPicker, Modal, inputCls } from './ui';
import { LegalModal } from './LegalModal';
import { TempPinModal } from './security';

const PH_MOBILE = /^(09|\+639|639)\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function MemberFormModal({ open, onClose, member }: { open: boolean; onClose: () => void; member?: Member | null }) {
  const { plans, members, actions, mode } = useStore();
  const cloud = mode === 'cloud';
  const editing = !!member;
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<{ name: string; email: string } | null>(null);
  const today = todayISO();
  const empty = { name: '', phone: '', email: '', notes: '', height: '', birthDate: '', guardianName: '', planId: plans[0]?.id ?? '' };
  const [form, setForm] = useState(empty);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [health, setHealth] = useState<boolean[]>(HEALTH_QUESTIONS.map(() => false));
  const [agree, setAgree] = useState({ terms: false, privacy: false, guardian: false, clearance: false, marketing: false });
  const [error, setError] = useState('');
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  const [tempPin, setTempPin] = useState<{ name: string; pin: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      member
        ? {
            name: member.name,
            phone: member.phone,
            email: member.email,
            notes: member.notes,
            height: member.heightCm ? String(member.heightCm) : '',
            birthDate: member.birthDate ?? '',
            guardianName: member.guardianName ?? '',
            planId: member.planId,
          }
        : empty,
    );
    setMethod('Cash');
    setHealth(HEALTH_QUESTIONS.map(() => false));
    setAgree({ terms: false, privacy: false, guardian: false, clearance: false, marketing: false });
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member]);

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const plan = plans.find((p) => p.id === form.planId);
  const age = form.birthDate ? ageOn(form.birthDate, today) : null;
  const minor = age !== null && age < 18;
  const flagged = health.some(Boolean);

  function validate(): string | null {
    if (form.name.trim().length < 2) return 'Enter the full name.';
    const phone = form.phone.replace(/[\s-]/g, '');
    if (!PH_MOBILE.test(phone)) return 'Enter a valid PH mobile number (e.g. 09171234567).';
    const d = phone.replace(/\D/g, '').slice(-10);
    if (members.some((m) => m.id !== member?.id && m.phone.replace(/\D/g, '').slice(-10) === d)) return 'That mobile number is already used by another member.';
    if (cloud && !EMAIL.test(form.email.trim())) return 'An email is required: members sign in with a code sent to it.';
    if (form.email && !EMAIL.test(form.email.trim())) return 'Enter a valid email or leave it blank.';
    if (cloud && members.some((m) => m.id !== member?.id && m.email.toLowerCase() === form.email.trim().toLowerCase()))
      return 'That email is already used by another member.';
    if (!form.birthDate || form.birthDate > today) return 'Enter a valid birth date.';
    if (age !== null && age < 12) return 'Members must be at least 12 years old.';
    if (minor && form.guardianName.trim().length < 2) return 'Members below 18 need a parent or guardian name.';
    if (editing) return null;
    if (!plan) return 'Choose a plan.';
    if (minor && !agree.guardian) return 'The parent/guardian must give consent for a minor.';
    if (!agree.terms) return 'The member must agree to the Membership Terms and Waiver.';
    if (!agree.privacy) return 'The member must acknowledge the Privacy Notice and consent to health data processing.';
    if (flagged && !agree.clearance) return 'Confirm that the member was advised to get medical clearance.';
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) return setError(err);
    const h = Math.round(Number(form.height));
    const heightCm = h > 100 && h < 250 ? h : undefined;
    const base = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      notes: form.notes.trim(),
      heightCm,
      birthDate: form.birthDate,
      guardianName: minor ? form.guardianName.trim() : undefined,
    };
    setBusy(true);
    try {
      if (member) {
        await actions.updateMember(member.id, base);
        onClose();
        return;
      }
      const id = await actions.addMember({
        ...base,
        planId: form.planId,
        method,
        healthAnswers: health,
        clearanceAcknowledged: flagged && agree.clearance,
        marketingConsent: agree.marketing,
      });
      if (!id) return; // the store shows the server's error; keep the form open so nothing is lost
      onClose();
      if (cloud) {
        setRegistered({ name: base.name, email: base.email });
      } else {
        const pin = await actions.issueMemberPin(id);
        if (pin) setTempPin({ name: base.name, pin });
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetPin() {
    if (!member) return;
    if (!confirm(`Issue a new temporary PIN for ${member.name}? Their current PIN will stop working.`)) return;
    const pin = await actions.issueMemberPin(member.id);
    if (pin) {
      onClose();
      setTempPin({ name: member.name, pin });
    }
  }

  const who = minor ? 'Parent/guardian' : 'Member';

  return (
    <>
      <Modal open={open} onClose={onClose} title={editing ? 'Edit member' : 'Register new member'} wide={!editing}>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <Section title="Personal details">
            <Field label="Full name">
              <input autoFocus className={inputCls} value={form.name} onChange={set('name')} placeholder="Juan Dela Cruz" autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile number" hint={cloud ? undefined : 'Also used to sign in to the member portal'}>
                <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="09171234567" inputMode="tel" autoComplete="off" />
              </Field>
              <Field label={cloud ? 'Email' : 'Email (optional)'} hint={cloud ? 'They sign in to the member portal with a code sent here' : undefined}>
                <input className={inputCls} value={form.email} onChange={set('email')} type="email" autoComplete="off" />
              </Field>
              <Field label="Birth date" hint={age !== null ? `${age} years old${minor ? ' · minor' : ''}` : undefined}>
                <input className={inputCls} type="date" max={today} value={form.birthDate} onChange={set('birthDate')} />
              </Field>
              <Field label="Height in cm (optional)" hint="Used for BMI">
                <input className={inputCls} type="number" value={form.height} onChange={set('height')} />
              </Field>
            </div>
            {minor && (
              <Field label="Parent / guardian full name">
                <input className={inputCls} value={form.guardianName} onChange={set('guardianName')} autoComplete="off" />
              </Field>
            )}
          </Section>

          {!editing && (
            <>
              <Section title="Membership">
                <Field label="Plan">
                  <select className={inputCls} value={form.planId} onChange={set('planId')}>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {peso(p.price)} · {p.durationDays} days
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Payment method">
                  <MethodPicker value={method} onChange={setMethod} />
                </Field>
              </Section>

              <Section title={<span className="inline-flex items-center gap-2"><HeartPulse size={15} /> Health screening</span>}>
                <p className="text-xs text-zinc-500">Ask the member each question. Answers are sensitive data: only admins can view them later.</p>
                <ul className="divide-y divide-zinc-800/70 rounded-xl border border-zinc-800">
                  {HEALTH_QUESTIONS.map((q, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="flex-1 text-zinc-300">{q}</span>
                      <div className="flex shrink-0 gap-1">
                        {[false, true].map((v) => (
                          <button
                            type="button"
                            key={String(v)}
                            onClick={() => setHealth((h) => h.map((x, j) => (j === i ? v : x)))}
                            className={cn(
                              'rounded-md px-2.5 py-1 text-xs font-medium transition',
                              health[i] === v ? (v ? 'bg-amber-400/20 text-amber-300' : 'bg-zinc-700 text-zinc-100') : 'text-zinc-500 hover:bg-zinc-800',
                            )}
                          >
                            {v ? 'Yes' : 'No'}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {flagged && (
                  <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">
                    <p className="flex items-start gap-2">
                      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                      At least one "yes": advise the member to get clearance from a doctor before training.
                    </p>
                    <Check checked={agree.clearance} onChange={(v) => setAgree({ ...agree, clearance: v })}>
                      I advised the member to get medical clearance before exercising.
                    </Check>
                  </div>
                )}
              </Section>

              <Section title="Consent">
                {minor && (
                  <Check checked={agree.guardian} onChange={(v) => setAgree({ ...agree, guardian: v })}>
                    The parent/guardian named above is present and consents to this minor's membership.
                  </Check>
                )}
                <Check checked={agree.terms} onChange={(v) => setAgree({ ...agree, terms: v })}>
                  {who} has read and agrees to the <DocLink onClick={() => setDoc('terms')}>Membership Terms</DocLink> and the{' '}
                  <DocLink onClick={() => setDoc('waiver')}>Waiver & Health Declaration</DocLink>. <Req />
                </Check>
                <Check checked={agree.privacy} onChange={(v) => setAgree({ ...agree, privacy: v })}>
                  {who} has read the <DocLink onClick={() => setDoc('privacy')}>Privacy Notice</DocLink> and consents to the processing of personal
                  and health information for the purposes stated. <Req />
                </Check>
                <Check checked={agree.marketing} onChange={(v) => setAgree({ ...agree, marketing: v })}>
                  (Optional) {who} agrees to receive promotions and gym news by SMS/email. Can be withdrawn any time.
                </Check>
              </Section>
            </>
          )}

          <Field label="Notes (optional)" hint="Don't write medical details here. Use the health screening instead.">
            <textarea className={inputCls} rows={2} value={form.notes} onChange={set('notes')} placeholder="Goals, preferred trainer…" />
          </Field>

          {editing && cloud && (
            <p className="rounded-xl bg-zinc-950 p-4 text-sm text-zinc-400">
              Member portal: {member?.userId ? 'active (they sign in with an email code)' : 'not signed in yet. They can sign in any time with a code sent to their email.'}
            </p>
          )}

          {editing && !cloud && (
            <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-4 text-sm">
              <span className="text-zinc-400">
                Portal PIN: {member?.pinHash ? (member.mustChangePin ? 'temporary (not yet changed)' : 'set by member') : 'not issued'}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={resetPin}>
                <KeyRound size={13} /> Issue temporary PIN
              </Button>
            </div>
          )}

          {!editing && plan && (
            <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-4 text-sm">
              <span className="text-zinc-400">
                Valid until <span className="font-medium text-zinc-100">{fmtDate(addDays(today, plan.durationDays))}</span>
              </span>
              <span className="font-semibold">{peso(plan.price)}</span>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Register & collect payment'}
            </Button>
          </div>
        </form>
      </Modal>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
      <TempPinModal value={tempPin} onClose={() => setTempPin(null)} />
      <Modal open={!!registered} onClose={() => setRegistered(null)} title="Member registered">
        <p className="text-sm text-zinc-400">
          <span className="font-medium text-zinc-100">{registered?.name}</span> can now open the member portal and sign in with a code sent to{' '}
          <span className="font-medium text-zinc-100">{registered?.email}</span>. No password or PIN to remember.
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setRegistered(null)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-lime-400" />
      <span>{children}</span>
    </label>
  );
}

const DocLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      onClick();
    }}
    className="font-medium text-lime-300 underline-offset-2 hover:underline"
  >
    {children}
  </button>
);

const Req = () => <span className="text-red-400">*</span>;
