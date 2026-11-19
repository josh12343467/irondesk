import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3, CalendarDays, CreditCard, Dumbbell, KeyRound, LayoutDashboard, LogOut, RotateCcw, ScanLine, Settings, Users, type LucideIcon,
} from 'lucide-react';
import { can, useStore, type Permission } from '../lib/store';
import { cn } from '../lib/utils';
import { Avatar } from './ui';
import { ChangePasswordModal } from './security';

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean; perm?: Permission; mobile?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, mobile: true },
  { to: '/check-in', label: 'Check-in', icon: ScanLine, mobile: true },
  { to: '/members', label: 'Members', icon: Users, mobile: true },
  { to: '/classes', label: 'Classes', icon: CalendarDays, mobile: true },
  { to: '/payments', label: 'Payments', icon: CreditCard, mobile: true },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings' },
];

function Logo({ gymName }: { gymName: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-lime-400 text-zinc-950">
        <Dumbbell size={18} strokeWidth={2.5} />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-extrabold tracking-tight">IronDesk</div>
        <div className="max-w-[150px] truncate text-xs text-zinc-500">{gymName}</div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { settings, actions, currentUser, mode } = useStore();
  const role = currentUser?.role;
  const items = NAV.filter((n) => !n.perm || can(role, n.perm));
  const mobileItems = items.filter((n) => n.mobile);
  const extraMobile = items.filter((n) => !n.mobile);
  const [pwOpen, setPwOpen] = useState(false);

  const reset = () => {
    if (confirm('Reset all data back to the demo members? Your changes will be lost.')) actions.resetDemo();
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-zinc-800/80 bg-zinc-950 p-4 md:flex">
        <div className="px-2 py-2">
          <Logo gymName={settings.gymName} />
        </div>
        <nav className="mt-8 flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={isActive ? 'text-lime-400' : ''} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          {role === 'admin' && mode === 'demo' && (
            <div className="rounded-xl border border-zinc-800 p-3 text-xs text-zinc-500">
              <p>Demo mode: data is saved in this browser only.</p>
              <button onClick={reset} className="mt-2 inline-flex items-center gap-1.5 font-medium text-zinc-300 hover:text-lime-300">
                <RotateCcw size={13} /> Reset demo data
              </button>
            </div>
          )}
          {currentUser && (
            <div className="flex items-center gap-3 rounded-xl bg-zinc-900/70 p-2.5">
              <Avatar name={currentUser.name} size="sm" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-medium">{currentUser.name}</div>
                <div className="text-xs text-zinc-500 capitalize">{currentUser.role}</div>
              </div>
              <button
                onClick={() => setPwOpen(true)}
                aria-label="Change password"
                title="Change password"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <KeyRound size={16} />
              </button>
              <button
                onClick={() => actions.logout()}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo gymName={settings.gymName} />
        <div className="flex items-center gap-1">
          {extraMobile.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className={({ isActive }) => cn('rounded-lg p-2', isActive ? 'text-lime-400' : 'text-zinc-400 hover:bg-zinc-800')}
            >
              <Icon size={18} />
            </NavLink>
          ))}
          <button onClick={() => setPwOpen(true)} aria-label="Change password" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800">
            <KeyRound size={18} />
          </button>
          <button onClick={() => actions.logout()} aria-label="Sign out" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />

      <main className="min-w-0 px-4 pt-6 pb-28 sm:px-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {mobileItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-lime-400' : 'text-zinc-500')
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
