import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { PaymentMethod } from '../types';
import { useStore } from '../lib/store';
import { cn, fmtDate, peso, renewalExpiry } from '../lib/utils';
import { Button, Field, MethodPicker, Modal } from './ui';

export function RenewModal({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { members, plans, actions } = useStore();
  const member = members.find((m) => m.id === memberId);
  const [planId, setPlanId] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');

  useEffect(() => {
    if (member) {
      setPlanId(member.planId);
      setMethod('Cash');
    }
    // reset only when a different member is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const plan = plans.find((p) => p.id === planId) ?? plans[0];

  return (
    <Modal open={!!member} onClose={onClose} title="Renew membership">
      {member && plan && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            actions.renew(member.id, plan.id, method);
            onClose();
          }}
          className="space-y-5"
        >
          <p className="text-sm text-zinc-400">
            Renewing <span className="font-medium text-zinc-100">{member.name}</span>
          </p>

          <Field label="Plan">
            <div className="grid grid-cols-2 gap-2">
              {plans.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    p.id === plan.id ? 'border-lime-400/60 bg-lime-400/5' : 'border-zinc-800 hover:border-zinc-700',
                  )}
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    {peso(p.price)} · {p.durationDays} days
                  </div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Payment method">
            <MethodPicker value={method} onChange={setMethod} />
          </Field>

          <div className="flex items-center justify-between rounded-xl bg-zinc-950 p-4 text-sm">
            <div>
              <div className="text-xs text-zinc-500">Expiry</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-zinc-400">{fmtDate(member.expiryDate)}</span>
                <ArrowRight size={14} className="text-zinc-600" />
                <span className="font-semibold text-lime-300">{fmtDate(renewalExpiry(member, plan))}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">Amount</div>
              <div className="mt-0.5 font-semibold">{peso(plan.price)}</div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Confirm · {peso(plan.price)}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
