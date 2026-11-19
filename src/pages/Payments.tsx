import { useMemo, useState } from 'react';
import { Download, Receipt, Search, Wallet } from 'lucide-react';
import type { Payment, PaymentMethod } from '../types';
import { useStore } from '../lib/store';
import { Avatar, Button, Card, EmptyState, PageHeader, Pill, StatCard, inputCls } from '../components/ui';
import { ReceiptModal } from '../components/ReceiptModal';
import { csvCell } from '../lib/security';
import { cn, downloadFile, fmtDateTime, monthKey, peso } from '../lib/utils';

const KIND_STYLE: Record<Payment['kind'], string> = {
  new: 'bg-lime-400/10 text-lime-300',
  renewal: 'bg-sky-400/10 text-sky-300',
  'walk-in': 'bg-zinc-800 text-zinc-300',
};

function exportCsv(rows: Payment[], month: string) {
  const header = ['Date', 'Payer', 'Type', 'Plan', 'Method', 'Received by', 'Amount'];
  // csvCell neutralises formula injection (a payer named "=HYPERLINK(...)" can't run in Excel)
  const lines = rows.map((p) =>
    [new Date(p.date).toLocaleString('en-PH'), p.label, p.kind, p.planName, p.method, p.receivedBy ?? '', p.amount].map(csvCell).join(','),
  );
  downloadFile(`payments-${month}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
}

export default function Payments() {
  const { payments } = useStore();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [q, setQ] = useState('');
  const [receipt, setReceipt] = useState<Payment | null>(null);

  const inMonth = useMemo(() => payments.filter((p) => monthKey(new Date(p.date)) === month), [payments, month]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? inMonth.filter((p) => p.label.toLowerCase().includes(s) || p.planName.toLowerCase().includes(s)) : inMonth;
  }, [inMonth, q]);

  const total = inMonth.reduce((a, p) => a + p.amount, 0);
  const byMethod = (m: PaymentMethod) => inMonth.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0);
  const walkIns = inMonth.filter((p) => p.kind === 'walk-in');
  const monthLabel = new Date(month + '-01T00:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle={`Collections for ${monthLabel}`}
        actions={
          <>
            <input
              type="month"
              value={month}
              max={monthKey(new Date())}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className={cn(inputCls, 'w-auto')}
            />
            <Button variant="outline" onClick={() => exportCsv(list, month)} disabled={list.length === 0}>
              <Download size={16} /> Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Wallet} label="Total collected" value={peso(total)} hint={`${inMonth.length} transactions`} />
        <StatCard icon={Receipt} label="Cash" value={peso(byMethod('Cash'))} tone="amber" />
        <StatCard icon={Receipt} label="GCash" value={peso(byMethod('GCash'))} tone="sky" />
        <StatCard
          icon={Receipt}
          label="Card"
          value={peso(byMethod('Card'))}
          tone="violet"
          hint={`${walkIns.length} walk-ins · ${peso(walkIns.reduce((a, p) => a + p.amount, 0))}`}
        />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-300">Transactions</h2>
        <div className="relative w-full max-w-64">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <input className={cn(inputCls, 'pl-9')} placeholder="Search payer or plan" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments for this period" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="px-5 py-3 font-medium">Payer</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Plan</th>
                  <th className="px-3 py-3 font-medium">Method</th>
                  <th className="px-3 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Received by</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {list.map((p) => (
                  <tr key={p.id} onClick={() => setReceipt(p)} className="cursor-pointer hover:bg-zinc-800/30" title="View receipt">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.label} size="sm" />
                        <span className="font-medium">{p.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium capitalize', KIND_STYLE[p.kind])}>{p.kind}</span>
                    </td>
                    <td className="px-3 py-3 text-zinc-300">{p.planName}</td>
                    <td className="px-3 py-3">
                      <Pill>{p.method}</Pill>
                    </td>
                    <td className="px-3 py-3 text-zinc-400">{fmtDateTime(p.date)}</td>
                    <td className="px-3 py-3 text-zinc-400">{p.receivedBy ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{peso(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-zinc-500">Tip: click a transaction to view and print its receipt.</p>
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
    </>
  );
}
