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
import { ReportsPage } from './components/pages/ReportsPage';
import { RankingsPage } from './components/pages/RankingsPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { AdministrationPage } from './components/pages/AdministrationPage';
import { allowedPages } from './utils/portal';
import { usePortal } from './hooks/usePortal';

export default function App() {
  const portal = usePortal();
  const [requestedPage, setRequestedPage] = useState(() => window.location.hash.slice(1) || 'dashboard');
  const [toast, setToast] = useState('');
  const showToast = useCallback((message) => setToast(message), []);
  const role = portal.user?.role;
  // A deep link or a role change cannot mount a privileged page. The API also
  // independently checks every read/write against the current stored role.
  const page = role && allowedPages(role).includes(requestedPage) ? requestedPage : 'dashboard';

  useEffect(() => {
    const update = () => setRequestedPage(window.location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (role && !allowedPages(role).includes(requestedPage)) window.location.replace('#dashboard');
  }, [role, requestedPage]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const refresh = () => portal.refresh({ force: true }).catch((error) => { if (error.status !== 401) showToast(error.message); });
  const navigate = (next) => {
    if (!allowedPages(portal.user.role).includes(next)) return;
    setRequestedPage(next);
    window.location.hash = next;
    void refresh();
  };
  const logout = async () => {
    try { await portal.logout(); } catch (error) { showToast(error.message); }
    finally { setRequestedPage('dashboard'); window.location.hash = 'dashboard'; }
  };

  if (portal.loading) return <div className="grid min-h-screen place-items-center bg-canvas text-muted">Loading Excellium Work Sphere…</div>;
  if (!portal.user) return <><LoginScreen onLogin={portal.login} connectionError={portal.syncError} /><Toast message={toast} /></>;

  const props = { user: portal.user, data: portal.data, actions: portal, onError: showToast, onNavigate: navigate };
  const content = {
    dashboard: <DashboardPage {...props} />,
    attendance: <AttendancePage {...props} />,
    invoices: <InvoicesPage {...props} invoices={portal.data.invoices} />,
    leaves: <LeavePage {...props} leaves={portal.data.leaves} />,
    users: <UsersPage {...props} administration={portal.data.administration} section="Users" />,
    roles: <UsersPage {...props} administration={portal.data.administration} section="Roles" />,
    departments: <UsersPage {...props} administration={portal.data.administration} section="Departments" />,
    meetings: <MeetingsPage {...props} meetings={portal.data.meetings} />,
    equipment: <EquipmentPage {...props} equipment={portal.data.equipment} />,
    assets: <EquipmentPage {...props} equipment={portal.data.equipment} inventoryOnly />,
    directory: <DirectoryPage people={portal.data.directory} />,
    reports: <ReportsPage onError={showToast} />,
    rankings: <RankingsPage trainer={portal.user.role === 'trainer'} />,
    notifications: <NotificationsPage notifications={portal.data.notifications} onMarkAllRead={portal.markNotificationsRead} onError={showToast} />,
    settings: <SettingsPage {...props} />,
    organization: <AdministrationPage {...props} section="organization" />,
    audit: <AdministrationPage {...props} section="audit" />
  };
  return <><AppShell user={portal.user} page={page} onPageChange={navigate} notifications={portal.data.notifications} summary={portal.data.dashboard?.summary} sessionState={portal.data.attendance?.currentSession?.state} onLogout={logout} onRefresh={refresh} refreshing={portal.refreshing} lastUpdated={portal.lastUpdated} syncError={portal.syncError}><div key={`${portal.user.id}:${role}:${page}`}>{content[page]}</div></AppShell><Toast message={toast} /></>;
}
