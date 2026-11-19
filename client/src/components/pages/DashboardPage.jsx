import { ActivityClock } from './ActivityClock';
import { Button, EmptyState, MetricCard, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can, initials, time } from '../../utils/portal';
import { formatMoney } from '../../utils/workflows';

function UpcomingMeetings({ meetings }) {
  const upcoming = meetings.filter((meeting) => new Date(meeting.startsAt) >= new Date());
  return <Panel title="Upcoming meetings">{upcoming.length ? upcoming.slice(0, 4).map((meeting) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={meeting.id}><div>{meeting.title}<small className="block text-muted">{new Date(meeting.startsAt).toLocaleString()}</small></div><StatusBadge status={meeting.status}>{meeting.status}</StatusBadge></div>) : <EmptyState>No upcoming meetings.</EmptyState>}</Panel>;
}

function RecentNotifications({ notifications }) {
  return <Panel title="Recent notifications">{notifications.length ? notifications.slice(0, 5).map((notification) => <div className="border-b border-line py-2.5 last:border-0" key={notification.id}>{notification.message}<small className="block text-muted">{new Date(notification.createdAt).toLocaleString()}</small></div>) : <EmptyState>No notifications yet.</EmptyState>}</Panel>;
}

export function DashboardPage({ user, data, actions, onError, onNavigate }) {
  const { dashboard, attendance, invoices, meetings, notifications } = data;
  const summary = dashboard?.summary ?? {};
  const management = can(user, 'manageStaff');

  if (!management) {
    const active = attendance?.totals?.totalActiveSeconds ?? 0;
    const trainer = user.role === 'trainer';
    return <>
      <PageHeading hero title={trainer ? 'Trainer overview' : `Good day, ${user.name.split(' ')[0]}`} description={trainer ? 'Your work session, personal requests, attendance ranking and meetings with management.' : 'Your attendance, invoices and time-off requests in one personal workspace.'} />
      <div className="mt-4"><ActivityClock attendance={attendance} onClockIn={actions.clockIn} onClockOut={actions.clockOut} onStartBreak={actions.startBreak} onEndBreak={actions.endBreak} onHeartbeat={actions.sendActivityHeartbeat} onError={onError} /></div>
      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Recorded active time" value={`${Math.floor(active / 3600)}h ${Math.floor(active / 60) % 60}m`} detail="Across your recorded sessions" />
        <MetricCard label="Late arrivals" value={attendance?.totals?.lateArrivals ?? 0} detail="Across your attendance history" />
        <MetricCard label="Pending leave" value={data.leaves.filter((leave) => leave.status === 'Pending').length} detail="Awaiting management review" />
        {trainer ? <MetricCard label="My meeting requests" value={meetings.filter((meeting) => meeting.createdBy === user.id && meeting.status === 'Pending').length} detail="Awaiting management confirmation" /> : <MetricCard label="Last invoice" value={invoices[0] ? formatMoney(invoices[0].amount, invoices[0].currency) : '—'} detail={invoices[0] ? `${invoices[0].month} · ${invoices[0].status}` : 'No invoice submitted'} />}
      </div>
      <div className="mb-4 flex flex-wrap gap-2"><Button onClick={() => onNavigate('leaves')}>My leave requests</Button><Button onClick={() => onNavigate('invoices')}>Prepare an invoice</Button>{trainer && <Button variant="primary" onClick={() => onNavigate('meetings')}>Schedule a meeting with management</Button>}</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><UpcomingMeetings meetings={meetings} /><Panel title="My latest invoices">{invoices.length ? invoices.slice(0, 4).map((invoice) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={invoice.id}><div>{invoice.month}<small className="block text-muted">{formatMoney(invoice.amount, invoice.currency)}</small></div><StatusBadge status={invoice.status}>{invoice.status}</StatusBadge></div>) : <EmptyState>No invoices yet. Prepare one from My invoices.</EmptyState>}</Panel></div>
      <div className="mt-4"><RecentNotifications notifications={notifications} /></div>
    </>;
  }

  const teamMetrics = [
    ['Active staff', summary.totalEmployees ?? 0, `Across ${summary.departmentCount ?? 0} departments`],
    ['Present today', summary.present ?? 0, `${summary.late ?? 0} late arrivals`],
    ['Pending leave', summary.pendingLeaves ?? 0, 'Employee and trainer applications'],
    ['Pending invoices', summary.pendingInvoices ?? 0, 'Submitted and ready for review'],
    ['Absent today', summary.absent ?? 0, 'No attendance or approved leave'],
    ['On leave today', summary.onLeave ?? 0, 'Approved time off'],
    ['Equipment requests', summary.pendingEquipmentRequests ?? 0, 'Awaiting your decision'],
    ['Upcoming meetings', summary.upcomingMeetings ?? 0, 'Scheduled for a future date']
  ];
  return <>
    <PageHeading hero title={user.role === 'admin' ? 'Admin workspace' : 'Management workspace'} description={user.role === 'admin' ? 'Manage people, approve staff requests and administer organization access.' : 'Manage employee and trainer profiles, review requests and oversee team operations.'} action={<Button onClick={() => onNavigate('users')}>Manage employee profiles</Button>} />
    <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{teamMetrics.map(([label, value, detail]) => <MetricCard key={label} label={label} value={value} detail={detail} />)}</div>
    <Panel title="Review queues" className="mb-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['leaves', 'Leave applications', summary.pendingLeaves], ['invoices', 'Submitted invoices', summary.pendingInvoices], ['equipment', 'Equipment requests', summary.pendingEquipmentRequests]].map(([page, label, count]) => <div key={page} className="rounded-xl border border-line p-4"><span className="mb-2 block text-muted">{label}</span><b className="mb-3 block text-2xl">{count ?? 0} <small className="text-xs font-normal text-muted">pending</small></b><Button variant="primary" small onClick={() => onNavigate(page)}>Review {page === 'leaves' ? 'leave' : page}</Button></div>)}</div></Panel>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title="Team today" action={<Button small onClick={() => onNavigate('attendance')}>View team attendance</Button>}>{data.teamAttendance?.records.length ? data.teamAttendance.records.slice(0, 6).map((record) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={record.id}><span className="flex min-w-0 items-center gap-3"><span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl border border-line bg-accent-soft font-semibold text-accent">{initials(record.employee?.name ?? '?')}</span><span className="min-w-0">{record.employee?.name}<small className="block text-muted">{record.employee?.department} · In: {time(record.clockIn)}</small></span></span><StatusBadge status={record.status}>{record.status}</StatusBadge></div>) : <EmptyState>Create an employee profile to start building your team.</EmptyState>}</Panel><RecentNotifications notifications={notifications} /></div>
    <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => onNavigate('users')}>Employee profiles</Button><Button onClick={() => onNavigate('departments')}>Manage departments</Button><Button onClick={() => onNavigate('reports')}>Workforce reports</Button>{can(user, 'manageRoles') && <Button onClick={() => onNavigate('roles')}>Roles & permissions</Button>}</div>
  </>;
}
