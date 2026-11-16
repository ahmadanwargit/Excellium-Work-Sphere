import { useState } from 'react';
import { ActivityClock } from './ActivityClock';
import { Button, DataTable, MetricCard, Modal, PageHeading, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { attendanceLog, isManager, time } from '../../utils/portal';

function WeeklyBars() {
  const days = [['Mon', 8], ['Tue', 8.5], ['Wed', 7.4], ['Thu', 7.5], ['Fri', 8.5]];
  return <div className="flex h-[150px] items-end gap-2.5 pt-2.5">{days.map(([day, value]) => <div className="chart-column" key={day}><i className="chart-column-bar" style={{ height: `${value / 8.5 * 100}%` }} />{day}</div>)}</div>;
}

export function AttendancePage({ user, data, actions, onError }) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState({ date: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const manager = isManager(user.role);
  const current = data.attendance?.current;
  const rows = [
    ...(current ? [[current.date, time(current.clockIn), time(current.clockOut), current.live ? 'Running' : current.workedLabel, current.status]] : []),
    ...attendanceLog
  ];
  const sendCorrection = async () => {
    try { setBusy(true); await actions.createCorrection(correction); setShowCorrection(false); setCorrection({ date: '', reason: '' }); } catch (error) { onError(error.message); } finally { setBusy(false); }
  };

  return <>
    <PageHeading title="Attendance" description={manager ? 'Your log and the team summary.' : 'Your daily log and monthly summary.'} action={<Button onClick={() => setShowCorrection(true)}>Raise a correction</Button>} />
    {!manager && <div><ActivityClock attendance={data.attendance} onClockIn={actions.clockIn} onClockOut={actions.clockOut} onBreak={actions.updateBreak} onError={onError} /></div>}
    <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Days present" value="16 / 18" detail="November" /><MetricCard label="Late arrivals" value="2" detail="November" /><MetricCard label="Early departures" value="1" detail="November" /><MetricCard label="Leave taken" value="1 day" detail="November" /></div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Panel title="Hours this week"><WeeklyBars /></Panel><Panel title="Daily log"><DataTable headings={['Date', 'In', 'Out', 'Hours', 'Status']} rows={rows.map((row) => ({ cells: [...row.slice(0, 4), <StatusBadge key={`${row[0]}-status`} status={row[4]}>{row[4]}</StatusBadge>] }))} /></Panel></div>
    {manager && <div className="mt-4"><Panel title="Team today"><DataTable headings={['Employee', 'Department', 'Status']} rows={[['John Carter', 'Engineering', 'Present'], ['Aisha Khan', 'Design', 'Present'], ['Marcus Lee', 'Engineering', 'Late'], ['Elena Petrova', 'Finance', 'Present'], ['Omar Siddiqui', 'Sales', 'Absent'], ['Grace Wu', 'Engineering', 'On leave'], ['Tom Becker', 'Operations', 'Present']].map(([name, department, status]) => ({ cells: [name, department, <StatusBadge key={`${name}-status`} status={status}>{status}</StatusBadge>] }))} /></Panel></div>}
    {showCorrection && <Modal title="Raise a correction" confirmLabel="Send request" onClose={() => setShowCorrection(false)} onConfirm={sendCorrection} busy={busy}><p className="m-0 text-muted">Tell your manager what needs fixing.</p><label className="field-label">Date</label><input className="field-control" type="date" value={correction.date} onChange={(event) => setCorrection({ ...correction, date: event.target.value })} /><label className="field-label">Reason</label><textarea className="field-control" rows="3" value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })} /></Modal>}
  </>;
}
