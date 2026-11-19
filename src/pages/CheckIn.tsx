import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Footprints, QrCode, Search, TriangleAlert, XCircle } from 'lucide-react';
import type { Member, PaymentMethod } from '../types';
import { useStore } from '../lib/store';
import { Avatar, Button, Card, CardHeader, EmptyState, Field, MethodPicker, Modal, PageHeader, StatusBadge, inputCls } from '../components/ui';
import { RenewModal } from '../components/RenewModal';
import { QrScannerModal } from '../components/qr';
import { maskPhone } from '../lib/security';
import { cn, daysLeft, fmtTime, isSameDay, memberStatus, parseMemberQr, peso, relativeDays, shortId, todayISO } from '../lib/utils';

type Toast = { type: 'ok' | 'warn' | 'err'; msg: string };

export default function CheckIn() {
  const { members, checkIns, settings, actions } = useStore();
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const today = todayISO();

  const todays = useMemo(() => checkIns.filter((c) => isSameDay(c.at, today)), [checkIns, today]);
  const checkedToday = useMemo(() => new Set(todays.map((c) => c.memberId)), [todays]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return members
      .filter((m) => m.name.toLowerCase().includes(s) || m.phone.includes(s) || shortId(m.id).toLowerCase() === s)
      .slice(0, 6);
  }, [q, members]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleQr(text: string) {
    setScanning(false);
    const id = parseMemberQr(text.trim());
    const m = id ? memberById.get(id) : undefined;
    if (!m) {
      setToast({ type: 'err', msg: id ? 'QR is valid but that member no longer exists.' : "That's not an IronDesk member QR code." });
      return;
    }
    checkIn(m, 'qr');
  }

  function onEnter() {
    // USB/Bluetooth QR scanners "type" the code and press Enter, so a raw QR value lands here
    if (parseMemberQr(q.trim())) return handleQr(q);
    if (results[0]) checkIn(results[0]);
  }

  function checkIn(m: Member, via: 'search' | 'qr' = 'search') {
    const status = memberStatus(m);
    if (status === 'expired') {
      setToast({ type: 'err', msg: `${m.name}'s membership expired ${relativeDays(daysLeft(m))}. They need to renew before entering.` });
      setQ(m.name);
      return;
    }
    if (checkedToday.has(m.id)) {
      setToast({ type: 'warn', msg: `${m.name} already checked in today.` });
      setQ('');
      return;
    }
    actions.checkIn(m.id, via);
    const first = m.name.split(' ')[0];
    setToast({
      type: status === 'expiring' ? 'warn' : 'ok',
      msg: status === 'expiring' ? `Welcome, ${first}! Reminder: membership expires ${relativeDays(daysLeft(m))}.` : `Welcome, ${first}! Checked in ✅`,
    });
    setQ('');
    inputRef.current?.focus();
  }

  const toastStyles = {
    ok: ['border-lime-400/30 bg-lime-400/10 text-lime-200', CheckCircle2],
    warn: ['border-amber-400/30 bg-amber-400/10 text-amber-200', TriangleAlert],
    err: ['border-red-500/30 bg-red-500/10 text-red-300', XCircle],
  } as const;

  return (
    <>
      <PageHeader
        title="Front desk check-in"
        subtitle="Scan a member QR, or search by name, mobile number or member ID and press Enter."
        actions={
          <>
            <Button variant="outline" onClick={() => setWalkInOpen(true)}>
              <Footprints size={16} /> Walk-in · {peso(settings.walkInPrice)}
            </Button>
            <Button onClick={() => setScanning(true)}>
              <QrCode size={16} /> Scan QR
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="relative">
            <Search size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-zinc-500" />
            <input
              ref={inputRef}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onEnter()}
              placeholder="Type a member's name…"
              className={cn(inputCls, 'h-14 rounded-2xl pl-12 text-base')}
            />
          </div>

          {toast && (() => {
            const [cls, Icon] = toastStyles[toast.type];
            return (
              <div role="status" className={cn('mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm', cls)}>
                <Icon size={18} className="shrink-0" />
                {toast.msg}
              </div>
            );
          })()}

          <div className="mt-3 space-y-2">
            {results.map((m, i) => {
              const status = memberStatus(m);
              const done = checkedToday.has(m.id);
              return (
                <Card key={m.id} className={cn('flex flex-wrap items-center gap-4 p-4', i === 0 && 'border-zinc-700')}>
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      <StatusBadge status={status} />
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      #{shortId(m.id)} · {maskPhone(m.phone)} · expires {relativeDays(daysLeft(m))}
                    </div>
                  </div>
                  {status === 'expired' ? (
                    <Button variant="outline" onClick={() => setRenewId(m.id)}>
                      Renew
                    </Button>
                  ) : (
                    <Button onClick={() => checkIn(m)} disabled={done}>
                      {done ? 'Checked in' : 'Check in'}
                    </Button>
                  )}
                </Card>
              );
            })}
            {q.trim() && results.length === 0 && (
              <Card>
                <EmptyState icon={Search} title={`No member matches “${q}”`} text="Register them from the Members page, or log a walk-in." />
              </Card>
            )}
            {!q.trim() && (
              <p className="px-1 pt-2 text-xs text-zinc-500">
                Tip: try typing “ma” or “santos”. Expired members are blocked until they renew.
              </p>
            )}
          </div>
        </div>

        <Card className="self-start">
          <CardHeader title={`Today's log · ${todays.length}`} />
          {todays.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No check-ins yet" />
          ) : (
            <ul className="max-h-[520px] divide-y divide-zinc-800/80 overflow-y-auto px-2 pb-2">
              {todays.map((c) => {
                const name = c.memberId ? memberById.get(c.memberId)?.name ?? 'Former member' : c.guestName ?? 'Guest';
                return (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{name}</div>
                      <div className="text-xs text-zinc-500">{c.memberId ? (c.via === 'qr' ? 'Member · QR' : 'Member') : 'Walk-in'}</div>
                    </div>
                    <span className="text-xs tabular-nums text-zinc-400">{fmtTime(c.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <RenewModal memberId={renewId} onClose={() => setRenewId(null)} />
      <QrScannerModal open={scanning} onClose={() => setScanning(false)} onResult={handleQr} />
      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        price={settings.walkInPrice}
        onSave={(name, method) => {
          actions.walkIn(name, method);
          setToast({ type: 'ok', msg: `Walk-in logged: ${name || 'Guest'} · ${peso(settings.walkInPrice)}` });
        }}
      />
    </>
  );
}

function WalkInModal({
  open,
  onClose,
  price,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  price: number;
  onSave: (name: string, method: PaymentMethod) => void;
}) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  useEffect(() => {
    if (open) {
      setName('');
      setMethod('Cash');
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Walk-in day pass">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name.trim(), method);
          onClose();
        }}
      >
        <Field label="Guest name">
          <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="Payment method">
          <MethodPicker value={method} onChange={setMethod} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Collect {peso(price)}</Button>
        </div>
      </form>
    </Modal>
  );
}
