import { useMemo, useState } from 'react';
import { Icon } from '../common/Icon';
import { Logo } from '../common/Logo';
import { Button } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { pageTitles, roleMeta } from '../../utils/portal';

export function AppShell({ user, page, onPageChange, notifications, onLogout, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const nav = useMemo(() => roleMeta[user.role].pages, [user.role]);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const go = (nextPage) => { onPageChange(nextPage); setMenuOpen(false); };

  return <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
    <aside className={`sidebar sidebar-mobile fixed inset-y-0 left-0 z-20 flex h-screen w-[240px] flex-col gap-0.5 p-[22px_14px] md:sticky md:top-0 md:z-auto md:translate-x-0 ${menuOpen ? 'sidebar-mobile-open' : ''}`}>
      <div className="px-2.5 pb-6"><Logo /></div>
      <nav className="flex flex-col gap-0.5">{nav.map((item) => <button key={item} onClick={() => go(item)} className={`sidebar-link border-0 text-left ${page === item ? 'sidebar-link-active' : ''}`}><Icon name={item} />{pageTitles[item].split(' and ')[0]}</button>)}</nav>
      <div className="flex-1" />
      <div className="border-t border-white/10 px-2.5 pt-3 text-[13px] text-[#aeb7d6]"><b className="block text-white">{user.name}</b><span>{user.title}</span><br /><button className="mt-1.5 p-0 text-[#92a19a]" onClick={onLogout}>Sign out</button></div>
    </aside>
    <main className="min-w-0">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 py-3.5 backdrop-blur-[10px] md:px-7">
        <div className="flex items-center gap-3"><Button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Icon name="menu" /></Button><h2 className="m-0 text-lg font-semibold">{pageTitles[page]}</h2></div>
        <div className="flex items-center gap-2.5"><StatusBadge status="On break">{roleMeta[user.role].label}</StatusBadge><div className="relative"><Button onClick={() => setNotificationsOpen(!notificationsOpen)}>Notifications {unreadCount > 0 && <span className="ml-1 rounded-full bg-[var(--color-error)] px-1.5 py-0.5 text-[10px] text-white">{unreadCount}</span>}</Button>{notificationsOpen && <aside className="absolute right-0 top-12 z-30 w-[340px] max-w-[90vw] border border-line bg-surface p-[18px] shadow-xl"><div className="mb-3 flex items-center justify-between"><h3 className="m-0 text-lg font-bold">Notifications</h3><Button small onClick={() => setNotificationsOpen(false)}>Close</Button></div>{notifications.slice(0, 5).map((notification) => <div className="border-b border-line py-2.5 last:border-0" key={notification.id}>{notification.message}<small className="block text-muted">{new Date(notification.createdAt).toLocaleString()}</small></div>)}</aside>}</div></div>
      </header>
      <div className="mx-auto max-w-[1280px] p-4 md:px-7 md:py-6">{children}</div>
    </main>
  </div>;
}
