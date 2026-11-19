import { Dumbbell, Printer } from 'lucide-react';
import type { Payment } from '../types';
import { useStore } from '../lib/store';
import { peso, shortId } from '../lib/utils';
import { Button, Modal } from './ui';

const KIND_LABEL: Record<Payment['kind'], string> = {
  new: 'New membership',
  renewal: 'Membership renewal',
  'walk-in': 'Walk-in day pass',
};

export function ReceiptModal({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const { settings, members } = useStore();
  if (!payment) return null;
  const member = members.find((m) => m.id === payment.memberId);
  const when = new Date(payment.date);

  const rows: [string, string][] = [
    ['Date', when.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })],
    ['Time', when.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })],
    ['Received from', payment.label],
    ...(member ? ([['Member ID', '#' + shortId(member.id)]] as [string, string][]) : []),
    ['Payment method', payment.method],
    ['Received by', payment.receivedBy ?? '—'],
  ];

  return (
    <Modal open onClose={onClose} title="Payment acknowledgement">
      <div className="flex justify-center">
        <div className="print-area w-[320px] rounded-xl bg-white p-6 font-mono text-[13px] text-zinc-900 shadow-xl ring-1 ring-zinc-200">
          <div className="flex flex-col items-center text-center font-sans">
            <span className="grid size-9 place-items-center rounded-lg bg-zinc-950 text-lime-400">
              <Dumbbell size={18} strokeWidth={2.5} />
            </span>
            <div className="mt-2 font-bold">{settings.gymName}</div>
            <div className="text-xs text-zinc-500">Acknowledgement receipt</div>
            <div className="mt-1 text-xs text-zinc-500">Ref. No. {shortId(payment.id)}</div>
          </div>
          <div className="my-4 border-t border-dashed border-zinc-300" />
          <dl className="space-y-1.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="my-4 border-t border-dashed border-zinc-300" />
          <div className="flex justify-between gap-4">
            <span>
              {KIND_LABEL[payment.kind]}
              <br />
              <span className="text-zinc-500">{payment.planName}</span>
            </span>
            <span>{peso(payment.amount)}</span>
          </div>
          <div className="my-4 border-t border-dashed border-zinc-300" />
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL</span>
            <span>{peso(payment.amount)}</span>
          </div>
          <p className="mt-5 text-center font-sans text-xs text-zinc-500">Salamat! Keep showing up. 💪</p>
          <p className="mt-3 border-t border-zinc-200 pt-3 text-center font-sans text-[10px] leading-snug text-zinc-500">
            THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX. This is an acknowledgement of payment only, not a BIR-registered
            invoice or official receipt. Ask the front desk for your BIR invoice.
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-center">
        <Button onClick={() => window.print()}>
          <Printer size={15} /> Print receipt
        </Button>
      </div>
    </Modal>
  );
}
