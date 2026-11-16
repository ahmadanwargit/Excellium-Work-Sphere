import { Button, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { relativeTime } from '../../utils/portal';

export function NotificationsPage({ notifications, onMarkAllRead, onError }) {
  const markAll = async () => { try { await onMarkAllRead(); } catch (error) { onError(error.message); } };
  return <>
    <PageHeading title="Notifications" description="Everything sent to you." action={<Button onClick={markAll}>Mark all read</Button>} />
    <Panel title="Inbox">{notifications.map((notification) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={notification.id}><div>{notification.read ? notification.message : <b>{notification.message}</b>}<small className="block text-muted">{relativeTime(notification.createdAt)}</small></div>{!notification.read && <StatusBadge status="On leave">New</StatusBadge>}</div>)}</Panel>
  </>;
}
