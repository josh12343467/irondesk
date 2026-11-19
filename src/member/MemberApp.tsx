import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { CalendarDays, Dumbbell, Home, Receipt, TrendingUp, UserRound } from 'lucide-react';
import { useStore } from '../lib/store';
import { cn } from '../lib/utils';
import { Avatar } from '../components/ui';
import MemberHome from './Home';
import MemberClasses from './Classes';
import MemberProgressPage from './Progress';
import MemberPayments from './Payments';
import MemberProfile from './Profile';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/classes', label: 'Classes', icon: CalendarDays },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/payments', label: 'Payments', icon: Receipt },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

/** Member-facing portal: a phone-sized app separate from the staff console. */
export default function MemberApp() {
  const { settings, currentMember } = useStore();
  if (!currentMember) return null;

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,rgba(163,230,53,0.06),transparent_50%)]">
      <header className="no-print sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-lime-400 text-zinc-950">
              <Dumbbell size={16} strokeWidth={2.5} />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold">{settings.gymName}</div>
              <div className="text-[11px] text-zinc-500">Member portal</div>
            </div>
          </div>
          <NavLink to="/profile" aria-label="Profile">
            <Avatar name={currentMember.name} size="sm" />
          </NavLink>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-5 pb-28">
        <Routes>
          <Route index element={<MemberHome />} />
          <Route path="classes" element={<MemberClasses />} />
          <Route path="progress" element={<MemberProgressPage />} />
          <Route path="payments" element={<MemberPayments />} />
          <Route path="profile" element={<MemberProfile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-lime-400' : 'text-zinc-500 hover:text-zinc-300')
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
