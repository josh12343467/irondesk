import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ErrorToast, ForceChangeScreen, IdleWarning } from './components/security';
import CloudLogin, { MfaChallengeScreen, NoAccessScreen, Splash } from './pages/CloudLogin';
import { useCan, useStore, type Permission } from './lib/store';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import CheckIn from './pages/CheckIn';
import Payments from './pages/Payments';
import Classes from './pages/Classes';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import MemberApp from './member/MemberApp';

function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  return can(permission) ? <>{children}</> : <Navigate to="/" replace />;
}

function Gate() {
  const { mode, currentUser, currentMember, loading, mfaPending, noAccess } = useStore();

  if (loading) return <Splash />;
  if (mfaPending) return <MfaChallengeScreen />;
  if (noAccess) return <NoAccessScreen />;
  if (currentMember) return currentMember.mustChangePin ? <ForceChangeScreen kind="pin" /> : <MemberApp />;
  if (!currentUser) return mode === 'cloud' ? <CloudLogin /> : <Login />;
  if (currentUser.mustChangePassword) return <ForceChangeScreen kind="password" />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="check-in" element={<CheckIn />} />
        <Route path="members" element={<Members />} />
        <Route path="classes" element={<Classes />} />
        <Route path="payments" element={<Payments />} />
        <Route
          path="reports"
          element={
            <RequirePermission permission="reports">
              <Reports />
            </RequirePermission>
          }
        />
        <Route
          path="settings"
          element={
            <RequirePermission permission="settings">
              <Settings />
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <Gate />
      <IdleWarning />
      <ErrorToast />
    </>
  );
}
