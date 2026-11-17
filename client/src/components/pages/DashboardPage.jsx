import { ActivityClock } from './ActivityClock';
import { MetricCard, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { initials, isManager } from '../../utils/portal';

function UpcomingMeetings({ meetings }) {
  return <Panel title="Upcoming meetings">{meetings.length ? meetings.slice(0, 4).map((meeting) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={meeting.id}><div>{meeting.title}<small className="block text-muted">{new Date(meeting.startsAt).toLocaleString()}</small></div><StatusBadge status={meeting.status}>{meeting.status}</StatusBadge></div>) : <p className="m-0 text-muted">No upcoming meetings.</p>}</Panel>;
}

export function DashboardPage({ user, data, actions, onError }) {
  const { dashboard, attendance, invoices, meetings, notifications } = data;
  const summary = dashboard?.summary ?? {};
  const manager = isManager(user.role);

  if (!manager) {
    return <>
      <PageHeading hero title={user.role === 'trainer' ? 'Training overview' : `Good day, ${user.name.split(' ')[0]}`} description={user.role === 'trainer' ? 'Here are your cohorts and sessions.' : 'Your day at a glance.'} />
      <div className="mt-4"><ActivityClock attendance={attendance} onClockIn={actions.clockIn} onClockOut={actions.clockOut} onStartBreak={actions.startBreak} onEndBreak={actions.endBreak} onHeartbeat={actions.sendActivityHeartbeat} onError={onError} /></div>
      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{user.role === 'trainer' ? <><MetricCard label="Active cohorts" value="3" detail="42 trainees" /><MetricCard label="Sessions this week" value="9" detail="2 today" /><MetricCard label="Trainee attendance" value="94%" detail="Last 7 days" /><MetricCard label="Assessments to grade" value="14" detail="Due Friday" /></> : <><MetricCard label="Hours this week" value="34h 20m" detail="Target 40h" /><MetricCard label="Late arrivals" value={attendance?.totals?.lateArrivals ?? 0} detail="This month" /><MetricCard label="Leave balance" value="12 days" detail="Annual" /><MetricCard label="Last invoice" value={invoices[0] ? `$${invoices[0].amount.toLocaleString()}` : '—'} detail={invoices[0] ? `${invoices[0].month}, ${invoices[0].status.toLowerCase()}` : 'No invoice'} /></>}</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><UpcomingMeetings meetings={meetings} /><Panel title={user.role === 'trainer' ? 'Trainees needing attention' : 'My invoices'}>{user.role === 'trainer' ? [['Omar Siddiqui', 'Missed 2 sessions', 78], ['Marcus Lee', 'Late 3 times', 84], ['Lina Haddad', 'Low quiz score', 71]].map(([name, issue, score]) => <div className="flex justify-between border-b border-line py-2.5 last:border-0" key={name}><div>{name}<small className="block text-muted">{issue}</small></div><b>{score}</b></div>) : invoices.slice(0, 4).map((invoice) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={invoice.id}><div>{invoice.month}<small className="block text-muted">${invoice.amount.toLocaleString()}</small></div><StatusBadge status={invoice.status}>{invoice.status}</StatusBadge></div>)}</Panel></div>
    </>;
  }

  const teamMetrics = [
    ['Total employees', summary.totalEmployees ?? 0, 'Across 5 departments'], ['Present', summary.present ?? 0, `${summary.onLeave ?? 0} on leave`], ['Absent', summary.absent ?? 0, 'Unplanned absences'], ['Avg working hours', '7h 48m', 'This week'],
    ['Late arrivals', '5', 'Today'], ['Pending invoices', summary.pendingInvoices ?? 0, 'Needs your review'], ['Upcoming meetings', summary.upcomingMeetings ?? 0, 'Next 7 days'], ['Equipment requests', summary.pendingEquipmentRequests ?? 0, 'Awaiting decision']
  ];
  return <>
    <PageHeading hero title={user.role === 'admin' ? 'Finance and admin' : 'Team dashboard'} description={user.role === 'admin' ? 'Payroll, assets and system health.' : 'Operations team, today.'} />
    <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{teamMetrics.map(([label, value, detail]) => <MetricCard key={label} label={label} value={value} detail={detail} />)}</div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title="Live activity">{[['John Carter', 'Active', '6h 18m', '0h 15m'], ['Aisha Khan', 'Active', '6h 10m', '0h 22m'], ['Marcus Lee', 'On break', '5h 02m', '0h 41m'], ['Tom Becker', 'Active', '5h 48m', '0h 15m'], ['Grace Wu', 'Offline', '-', '-']].map(([name, status, active, idle]) => <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0" key={name}><span className="flex items-center gap-3"><span className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-line bg-accent-soft font-semibold text-accent">{initials(name)}</span><span>{name}<small className="block text-muted">Active: {active} · Idle: {idle}</small></span></span><StatusBadge status={status}>{status}</StatusBadge></div>)}</Panel><Panel title="Recent activity">{notifications.slice(0, 5).map((notification) => <div className="border-b border-line py-2.5 last:border-0" key={notification.id}>{notification.message}<small className="block text-muted">{new Date(notification.createdAt).toLocaleString()}</small></div>)}</Panel></div>
  </>;
}
