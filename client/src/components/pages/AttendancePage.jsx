import { useState } from 'react';
import { ActivityClock } from './ActivityClock';
import { Button, DataTable, EmptyState, MetricCard, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { can, time } from '../../utils/portal';
import { formErrorMessage } from '../../utils/workflows';

function WeeklyBars({ records }) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start.getTime() - (6 - index) * 86_400_000);
    const hours = records.filter((record) => record.date === date.toISOString().slice(0, 10)).reduce((sum, record) => sum + record.workedMinutes / 60, 0);
    return { label: date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }), hours };
  });
  const max = Math.max(8, ...days.map((day) => day.hours));
  return <div className="flex h-[170px] items-end gap-2.5 pt-5">{days.map(({ label, hours }) => <div className="chart-column" key={label}><small className="text-muted">{hours.toFixed(1)}h</small><i className="chart-column-bar" style={{ height: `${Math.max(hours ? 3 : 0, hours / max * 100)}%` }} />{label}</div>)}</div>;
}

export function AttendancePage({ user, data, actions, onError }) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState({ date: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const teamView = can(user, 'teamAttendance');
  const sendCorrection = async () => {
    try { setBusy(true); setError(''); await actions.createCorrection(correction); setShowCorrection(false); setCorrection({ date: '', reason: '' }); onError('Attendance correction sent'); }
    catch (failure) { setError(formErrorMessage(failure)); } finally { setBusy(false); }
  };

  if (teamView) {
    const records = data.teamAttendance?.records ?? [];
    const results = records.filter((record) => `${record.employee?.name} ${record.employee?.department}`.toLowerCase().includes(query.toLowerCase()) && (status === 'All' || record.status === status));
    return <>
      <PageHeading title="Team attendance" description={`Actual employee and trainer attendance for ${data.teamAttendance?.date ?? 'today'} (UTC). Management has no personal clock or correction controls.`} />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active staff" value={records.length} detail="Employee and trainer accounts" /><MetricCard label="Clocked in today" value={records.filter((record) => record.clockIn).length} detail="Includes completed shifts" /><MetricCard label="On approved leave" value={records.filter((record) => record.status === 'On leave').length} detail="Based on approved applications" /><MetricCard label="Absent" value={records.filter((record) => record.status === 'Absent').length} detail="No clock-in or approved leave" /></div>
      <Panel title="Staff attendance today"><div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"><input aria-label="Search team attendance" className="field-control" placeholder="Search name or department" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter team attendance status" className="field-control !w-auto" value={status} onChange={(event) => setStatus(event.target.value)}>{['All', ...new Set(records.map((record) => record.status))].map((value) => <option key={value}>{value}</option>)}</select></div>
        {results.length ? <DataTable headings={['Employee / trainer', 'Department', 'Clock in', 'Clock out', 'Worked', 'Status']} rows={results.map((record) => ({ id: record.id, cells: [<span key="employee"><b>{record.employee?.name}</b><small className="block text-muted">{record.employee?.roleName ?? record.employee?.role}</small></span>, record.employee?.department, time(record.clockIn), time(record.clockOut), record.clockIn ? record.workedLabel : '—', <StatusBadge key="status" status={record.status}>{record.status}</StatusBadge>] }))} /> : <EmptyState>No staff match this view.</EmptyState>}
      </Panel>
    </>;
  }

  const records = data.attendance?.records ?? [];
  const corrections = data.attendance?.corrections ?? [];
  const worked = records.reduce((sum, record) => sum + record.workedMinutes, 0);
  return <>
    <PageHeading title="My attendance" description="Your recorded work sessions and attendance history. No other employee’s work log is included." action={<Button onClick={() => { setError(''); setShowCorrection(true); }}>Raise a correction</Button>} />
    <ActivityClock attendance={data.attendance} onClockIn={actions.clockIn} onClockOut={actions.clockOut} onStartBreak={actions.startBreak} onEndBreak={actions.endBreak} onHeartbeat={actions.sendActivityHeartbeat} onError={onError} />
    <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Days recorded" value={records.filter((record) => record.clockIn).length} detail="Across your attendance history" /><MetricCard label="Late arrivals" value={data.attendance?.totals?.lateArrivals ?? 0} detail="Across your attendance history" /><MetricCard label="Recorded work time" value={`${Math.floor(worked / 60)}h ${worked % 60}m`} detail="Clock time less recorded breaks" /><MetricCard label="Pending corrections" value={corrections.filter((item) => item.status === 'Pending').length} detail="Your submitted correction requests" /></div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2fr]"><Panel title="Last 7 days (UTC)"><WeeklyBars records={records} /></Panel><Panel title="My daily log">{records.length ? <DataTable headings={['Date', 'In', 'Out', 'Worked', 'Status']} rows={records.map((record) => ({ id: record.id, cells: [record.date, time(record.clockIn), time(record.clockOut), record.clockIn ? record.workedLabel : '—', <StatusBadge key="status" status={record.status}>{record.status}</StatusBadge>] }))} /> : <EmptyState>No attendance records yet. Clock in to start your first session.</EmptyState>}</Panel></div>
    {corrections.length > 0 && <div className="mt-4"><Panel title="My correction requests"><DataTable headings={['Date', 'Reason', 'Status']} rows={corrections.map((item) => ({ id: item.id, cells: [item.date, <span key="reason" className="inline-block max-w-[400px] whitespace-normal">{item.reason}</span>, <StatusBadge key="status" status={item.status}>{item.status}</StatusBadge>] }))} /></Panel></div>}
    {showCorrection && <Modal title="Raise a correction" confirmLabel="Send request" onClose={() => setShowCorrection(false)} onConfirm={sendCorrection} busy={busy}><p className="m-0 text-muted">Tell management which date and work times need fixing.</p><label className="field-label" htmlFor="correction-date">Date</label><input id="correction-date" className="field-control" type="date" required value={correction.date} onChange={(event) => setCorrection({ ...correction, date: event.target.value })} /><label className="field-label" htmlFor="correction-reason">Reason</label><textarea id="correction-reason" className="field-control" rows="3" required maxLength={1000} value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} />{error && <p role="alert" className="text-[var(--color-error)]">{error}</p>}</Modal>}
  </>;
}
