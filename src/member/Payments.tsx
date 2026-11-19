import { useState } from 'react';
import { ChevronRight, Receipt } from 'lucide-react';
import type { Payment } from '../types';
import { useStore } from '../lib/store';
import { Card, EmptyState } from '../components/ui';
import { ReceiptModal } from '../components/ReceiptModal';
import { fmtDateTime, peso } from '../lib/utils';

const KIND: Record<Payment['kind'], string> = { new: 'New membership', renewal: 'Renewal', 'walk-in': 'Day pass' };

export default function MemberPayments() {
  const { currentMember: m, payments } = useStore();
  const [receipt, setReceipt] = useState<Payment | null>(null);
  if (!m) return null;

  const mine = payments.filter((p) => p.memberId === m.id);
  const total = mine.reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {mine.length} payment{mine.length === 1 ? '' : 's'} · {peso(total)} total
        </p>
      </div>
      <Card>
        {mine.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" />
        ) : (
          <ul className="divide-y divide-zinc-800/70">
            {mine.map((p) => (
              <li key={p.id}>
                <button onClick={() => setReceipt(p)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/30">
                  <span className="grid size-9 place-items-center rounded-lg bg-zinc-800 text-zinc-400">
                    <Receipt size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {p.planName} · {KIND[p.kind]}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {fmtDateTime(p.date)} · {p.method}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{peso(p.amount)}</span>
                  <ChevronRight size={16} className="text-zinc-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-zinc-500">Tap a payment to view or print its receipt. Renewals are paid at the front desk.</p>
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
