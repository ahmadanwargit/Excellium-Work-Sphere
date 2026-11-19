import { useMemo, useState } from 'react';
import { Icon } from '../common/Icon';
import { Logo } from '../common/Logo';
import { Button } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can, navigationFor, pageTitle, roleMeta } from '../../utils/portal';

export function AppShell({ user, page, onPageChange, notifications, summary, sessionState, onLogout, onRefresh, refreshing, lastUpdated, syncError, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const groups = useMemo(() => navigationFor(user.role), [user.role]);
  const management = can(user, 'manageStaff');
  const unreadCount = notifications.filter((item) => !item.read).length;
  const workspace = user.role === 'admin' ? 'Admin portal' : management ? 'Management portal' : user.role === 'trainer' ? 'Trainer portal' : 'Employee portal';
  const badges = { leaves: summary?.pendingLeaves, invoices: summary?.pendingInvoices, equipment: summary?.pendingEquipmentRequests, notifications: unreadCount };
  const go = (nextPage) => { onPageChange(nextPage); setMenuOpen(false); setNotificationsOpen(false); };
  const sessionLabel = sessionState ? sessionState.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase()) : roleMeta[user.role].label;

  return <div className="grid min-h-screen grid-cols-1 md:grid-cols-[264px_minmax(0,1fr)]">
    {menuOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 border-0 bg-black/50 md:hidden" onClick={() => setMenuOpen(false)} />}
    <aside id="workspace-sidebar" className={`sidebar sidebar-mobile fixed inset-y-0 left-0 z-40 flex h-screen w-[264px] flex-col p-[22px_14px] md:sticky md:top-0 md:z-auto md:translate-x-0 ${menuOpen ? 'sidebar-mobile-open' : ''}`}>
      <div className="px-2.5 pb-4"><Logo /></div>
      <div className="mx-2 mb-3 rounded-xl border border-white/10 bg-white/[.05] px-3 py-2.5"><b className="block text-[11px] uppercase tracking-[.15em] text-[#c4b5fd]">{workspace}</b><small className="mt-1 block text-[#9ca6c0]">{roleMeta[user.role].description}</small></div>
      <nav aria-label={`${workspace} navigation`} className="min-h-0 flex-1 overflow-y-auto pr-1">
        {groups.map((group) => <div className="mb-3" key={group.label}>
          <p className="mb-1 mt-2 px-2.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#818aa4]">{group.label}</p>
          {group.pages.map((item) => <button key={item} type="button" aria-label={pageTitle(item, user.role)} aria-current={page === item ? 'page' : undefined} onClick={() => go(item)} className={`sidebar-link mb-0.5 w-full border-0 text-left text-[13px] ${page === item ? 'sidebar-link-active' : ''}`}>
            <span className="shrink-0"><Icon name={item} /></span><span className="min-w-0 flex-1">{pageTitle(item, user.role)}</span>
            {badges[item] > 0 && <span aria-label={`${badges[item]} pending`} className="rounded-md bg-white/10 px-1.5 text-[10px] text-[#ddd6fe]">{badges[item]}</span>}
          </button>)}
        </div>)}
      </nav>
      <div className="mt-3 border-t border-white/10 px-2.5 pt-3 text-[12px] text-[#aeb7d6]"><b className="block truncate text-[13px] text-white">{user.name}</b><span className="block truncate">{user.roleName ?? roleMeta[user.role].label} · {user.department}</span><button type="button" className="mt-2 p-0 text-[#c4b5fd]" onClick={onLogout}>Sign out</button></div>
    </aside>
    <main className="min-w-0">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3.5 backdrop-blur-[10px] md:px-7">
        <div className="flex min-w-0 items-center gap-3"><Button className="md:hidden" aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Icon name="menu" /></Button><div><small className="block text-[10px] font-semibold uppercase tracking-widest text-accent">{workspace}</small><h2 className="m-0 text-lg font-semibold">{pageTitle(page, user.role)}</h2></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline"><StatusBadge status={management ? 'Confirmed' : sessionState === 'ACTIVE' ? 'Active' : 'Offline'}>{management ? roleMeta[user.role].label : sessionLabel}</StatusBadge></span>
          <Button small onClick={onRefresh} disabled={refreshing} aria-label="Refresh workspace"><Icon name="refresh" size={14} /><span className="ml-1.5">{refreshing ? 'Refreshing…' : 'Refresh'}</span></Button>
          <div className="relative"><Button small aria-label={`Notifications${unreadCount ? ` ${unreadCount}` : ''}`} onClick={() => setNotificationsOpen(!notificationsOpen)}><Icon name="notifications" size={14} /><span className="ml-1.5">Notifications</span>{unreadCount > 0 && <span className="ml-1.5 rounded-full bg-[var(--color-error)] px-1.5 py-0.5 text-[10px] text-white">{unreadCount}</span>}</Button>
            {notificationsOpen && <aside className="absolute right-0 top-10 z-30 max-h-[65vh] w-[340px] max-w-[85vw] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-xl"><div className="mb-2 flex items-center justify-between"><b>Notifications</b><Button small onClick={() => setNotificationsOpen(false)}>Close</Button></div>{notifications.length ? notifications.slice(0, 5).map((item) => <div className="border-b border-line py-2.5 text-xs last:border-0" key={item.id}>{item.message}<small className="mt-1 block text-muted">{new Date(item.createdAt).toLocaleString()}</small></div>) : <p className="text-muted">No notifications.</p>}<Button small className="mt-3" onClick={() => go('notifications')}>View all notifications</Button></aside>}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1440px] p-4 md:px-7 md:py-6">
        {syncError ? <p role="alert" className="mb-4 rounded-lg border border-[var(--color-warn)] p-3 text-xs text-[var(--color-warn)]">Could not refresh: {syncError}. Use Refresh to try again.</p> : <p className="mb-4 mt-0 text-[11px] text-muted">{management ? 'Management view · review and administer staff records' : 'Personal view · only your own requests and work records'}{lastUpdated && <span className="ml-2">· Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</p>}
        {children}
      </div>
    </main>
  </div>;
}
