import { useCallback, useEffect, useState } from 'react';
import { LoginScreen } from './components/login/LoginScreen';
import { AppShell } from './components/layout/AppShell';
import { Toast } from './components/common/UI';
import { AttendancePage } from './components/pages/AttendancePage';
import { DashboardPage } from './components/pages/DashboardPage';
import { DirectoryPage } from './components/pages/DirectoryPage';
import { EquipmentPage } from './components/pages/EquipmentPage';
import { InvoicesPage } from './components/pages/InvoicesPage';
import { LeavePage } from './components/pages/LeavePage';
import { UsersPage } from './components/pages/UsersPage';
import { MeetingsPage } from './components/pages/MeetingsPage';
import { NotificationsPage } from './components/pages/NotificationsPage';
import { RankingsPage } from './components/pages/RankingsPage';
import { ReportsPage } from './components/pages/ReportsPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { usePortal } from './hooks/usePortal';

export default function App() {
  const portal = usePortal();
  const [page, setPage] = useState('dashboard');
  const [toast, setToast] = useState('');
  const showToast = useCallback((message) => setToast(message), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleLogout = async () => {
    await portal.logout();
    setPage('dashboard');
  };

  if (portal.loading) return <div className="grid min-h-screen place-items-center bg-canvas text-muted">Loading Excellium Work Sphere…</div>;
  if (!portal.user) return <LoginScreen onLogin={portal.login} />;

  const pageProps = { user: portal.user, data: portal.data, actions: portal, onError: showToast };
  const content = {
    dashboard: <DashboardPage {...pageProps} />,
    attendance: <AttendancePage {...pageProps} />,
    invoices: <InvoicesPage user={portal.user} invoices={portal.data.invoices} actions={portal} onError={showToast} />,
    leaves: <LeavePage user={portal.user} leaves={portal.data.leaves} actions={portal} onError={showToast} />,
    users: portal.user.role === 'admin' ? <UsersPage user={portal.user} administration={portal.data.administration} actions={portal} onError={showToast} /> : null,
    rankings: <RankingsPage trainer={portal.user.role === 'trainer'} />,
    meetings: <MeetingsPage meetings={portal.data.meetings} actions={portal} onError={showToast} />,
    equipment: <EquipmentPage user={portal.user} equipment={portal.data.equipment} actions={portal} onError={showToast} />,
    directory: <DirectoryPage people={portal.data.directory} />,
    reports: <ReportsPage onError={showToast} />,
    notifications: <NotificationsPage notifications={portal.data.notifications} onMarkAllRead={portal.markNotificationsRead} onError={showToast} />,
    settings: <SettingsPage user={portal.user} administration={portal.data.administration} actions={portal} onError={showToast} />
  };

  return <><AppShell user={portal.user} page={page} onPageChange={setPage} notifications={portal.data.notifications} sessionState={portal.data.attendance?.currentSession?.state} onLogout={handleLogout}>{content[page] ?? content.dashboard}</AppShell><Toast message={toast} /></>;
}
