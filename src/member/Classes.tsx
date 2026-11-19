import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, UserRound, XCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { Button, Card, toneStyles } from '../components/ui';
import { addDays, cn, fmtClock, parseISO, todayISO } from '../lib/utils';

export default function MemberClasses() {
  const { currentMember: m, classes, bookings, trainers, actions } = useStore();
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!m) return null;

  const today = todayISO();
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const trainerName = (id: string) => trainers.find((t) => t.id === id)?.name ?? 'No trainer';
  const startOf = (classId: string) => classes.find((c) => c.id === classId)?.start ?? '00:00';
  const myCount = bookings.filter(
    (b) => b.memberId === m.id && (b.date > today || (b.date === today && startOf(b.classId) > nowHHMM)),
  ).length;

  const book = async (classId: string, date: string, name: string) => {
    const r = await actions.book(classId, m.id, date);
    setToast(
      r === 'ok'
        ? { ok: true, text: `You're booked for ${name}! See you there. 💪` }
        : {
            ok: false,
            text:
              r === 'full' ? 'This class is full.'
              : r === 'expired' ? 'Your membership will have expired by that date.'
              : r === 'duplicate' ? "You're already booked for this class."
              : "This class can't be booked.",
          },
    );
  };

  const cancel = async (bookingId: string, name: string) => {
    if (!confirm(`Cancel your slot in ${name}?`)) return;
    await actions.unbook(bookingId);
    setToast({ ok: true, text: `Cancelled your slot in ${name}.` });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Book a class</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Next 7 days · {myCount} upcoming booking{myCount === 1 ? '' : 's'}
        </p>
      </div>

      {toast && (
        <div
          role="status"
          className={cn(
            'sticky top-16 z-20 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm backdrop-blur',
            toast.ok ? 'border-lime-400/30 bg-lime-400/10 text-lime-200' : 'border-red-500/30 bg-red-500/10 text-red-300',
          )}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.text}
        </div>
      )}

      {days.map((date) => {
        const d = parseISO(date);
        const sessions = classes.filter((c) => c.weekday === d.getDay()).sort((a, b) => a.start.localeCompare(b.start));
        if (sessions.length === 0) return null;
        return (
          <section key={date}>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              {date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : d.toLocaleDateString('en-PH', { weekday: 'long' })}
              <span className="ml-2 font-normal text-zinc-600 normal-case">{d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>
            </h2>
            <div className="space-y-2">
              {sessions.map((c) => {
                const list = bookings.filter((b) => b.classId === c.id && b.date === date);
                const mine = list.find((b) => b.memberId === m.id);
                const left = c.capacity - list.length;
                const started = date === today && c.start <= nowHHMM;
                const expired = m.expiryDate < date;
                return (
                  <Card key={c.id} className={cn('flex items-center gap-3 border-l-[3px] p-4', toneStyles[c.tone].card.split(' ')[0], started && 'opacity-50')}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{c.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> {fmtClock(c.start)} · {c.durationMin} min
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <UserRound size={12} /> {trainerName(c.trainerId)}
                        </span>
                      </div>
                      <div className={cn('mt-1 text-xs', left <= 3 && left > 0 ? 'text-amber-300' : left <= 0 ? 'text-red-400' : 'text-zinc-500')}>
                        {left > 0 ? `${left} slot${left === 1 ? '' : 's'} left` : 'Full'}
                      </div>
                    </div>
                    {mine ? (
                      started ? (
                        <span className="text-xs font-medium text-lime-300">Booked ✓</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-medium text-lime-300">Booked ✓</span>
                          <button onClick={() => cancel(mine.id, c.name)} className="text-xs text-zinc-500 underline-offset-2 hover:text-red-400 hover:underline">
                            Cancel
                          </button>
                        </div>
                      )
                    ) : started ? (
                      <span className="text-xs text-zinc-500">Started</span>
                    ) : expired ? (
                      <span className="text-right text-xs text-red-400">Renew to book</span>
                    ) : (
                      <Button size="sm" disabled={left <= 0} onClick={() => book(c.id, date, c.name)}>
                        {left <= 0 ? 'Full' : 'Book'}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
