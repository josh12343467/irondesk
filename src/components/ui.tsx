import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import type { MemberStatus, PaymentMethod, Tone } from '../types';
import { cn, initials } from '../lib/utils';

export const inputCls =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/15';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-lime-400 text-zinc-950 hover:bg-lime-300 font-semibold',
  outline: 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800',
  ghost: 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100',
  danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-2xl border border-zinc-800/80 bg-zinc-900/60', className)}>{children}</div>;
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'lime',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'lime' | 'amber' | 'sky' | 'violet';
}) {
  const tones = {
    lime: 'bg-lime-400/10 text-lime-300',
    amber: 'bg-amber-400/10 text-amber-300',
    sky: 'bg-sky-400/10 text-sky-300',
    violet: 'bg-violet-400/10 text-violet-300',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-9 place-items-center rounded-xl', tones[tone])}>
          <Icon size={18} />
        </span>
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
      <div className="mt-4 text-3xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </Card>
  );
}

const statusStyles: Record<MemberStatus, [string, string]> = {
  active: ['Active', 'bg-lime-400/10 text-lime-300 ring-lime-400/25'],
  expiring: ['Expiring', 'bg-amber-400/10 text-amber-300 ring-amber-400/25'],
  expired: ['Expired', 'bg-red-500/10 text-red-400 ring-red-500/25'],
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  const [label, cls] = statusStyles[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', cls)}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-300', className)}>
      {children}
    </span>
  );
}

const avatarColors = [
  'bg-lime-400/15 text-lime-300',
  'bg-sky-400/15 text-sky-300',
  'bg-violet-400/15 text-violet-300',
  'bg-amber-400/15 text-amber-300',
  'bg-rose-400/15 text-rose-300',
  'bg-teal-400/15 text-teal-300',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const sizes = { sm: 'size-8 text-xs', md: 'size-9 text-sm', lg: 'size-14 text-lg' };
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full font-semibold', sizes[size], avatarColors[hash % avatarColors.length])}>
      {initials(name)}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

const METHODS: PaymentMethod[] = ['Cash', 'GCash', 'Card'];

export function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
      {METHODS.map((m) => (
        <button
          type="button"
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            'rounded-md py-1.5 text-sm font-medium transition',
            value === m ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-900 shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-zinc-800 text-zinc-400">
        <Icon size={20} />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-300">{title}</p>
      {text && <p className="mt-1 text-xs text-zinc-500">{text}</p>}
    </div>
  );
}

/** Full class strings per tone so Tailwind can see them at build time. */
export const toneStyles: Record<Tone, { card: string; dot: string; bar: string; text: string }> = {
  lime: { card: 'border-l-lime-400 bg-lime-400/[.06] hover:bg-lime-400/10', dot: 'bg-lime-400', bar: 'bg-lime-400', text: 'text-lime-300' },
  sky: { card: 'border-l-sky-400 bg-sky-400/[.06] hover:bg-sky-400/10', dot: 'bg-sky-400', bar: 'bg-sky-400', text: 'text-sky-300' },
  violet: { card: 'border-l-violet-400 bg-violet-400/[.06] hover:bg-violet-400/10', dot: 'bg-violet-400', bar: 'bg-violet-400', text: 'text-violet-300' },
  amber: { card: 'border-l-amber-400 bg-amber-400/[.06] hover:bg-amber-400/10', dot: 'bg-amber-400', bar: 'bg-amber-400', text: 'text-amber-300' },
  rose: { card: 'border-l-rose-400 bg-rose-400/[.06] hover:bg-rose-400/10', dot: 'bg-rose-400', bar: 'bg-rose-400', text: 'text-rose-300' },
  teal: { card: 'border-l-teal-400 bg-teal-400/[.06] hover:bg-teal-400/10', dot: 'bg-teal-400', bar: 'bg-teal-400', text: 'text-teal-300' },
};

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { key: T; label: string }[] }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-1 sm:inline-flex">
      {items.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
            value === t.key ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const chartTooltip = {
  contentStyle: {
    background: '#18181b',
    border: '1px solid #3f3f46',
    borderRadius: 10,
    fontSize: 12,
    color: '#f4f4f5',
  },
  labelStyle: { color: '#a1a1aa' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};
