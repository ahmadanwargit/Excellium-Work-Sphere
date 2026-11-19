import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { Button, DataTable, EmptyState, MetricCard, PageHeading, Panel } from '../common/UI';
import { BarChart } from '../common/BarChart';

const rate = (value) => value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;

export function RankingsPage({ user, rankings }) {
  const [month, setMonth] = useState(rankings?.month ?? new Date().toISOString().slice(0, 7));
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [reload, setReload] = useState(0);
  const current = rankings?.month === month;
  const result = current ? rankings : loaded?.month === month ? loaded : null;
  useEffect(() => {
    if (current) return undefined;
    const controller = new window.AbortController();
    setLoaded(null); setError('');
    apiRequest(`/api/attendance/rankings?month=${encodeURIComponent(month)}`, { signal: controller.signal }).then(setLoaded).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [month, current, reload, rankings?.updatedAt]);
  const rows = result?.rows.filter((row) => `${row.employee.name} ${row.employee.department}`.toLowerCase().includes(query.toLowerCase()) && (!department || department === row.employee.department)) ?? [];
  return <>
    <PageHeading title="Attendance ranking" description="Attendance only — calculated from recorded attendance, scheduled workdays and approved leave. No performance, delivery or peer-feedback scores." action={<div><label className="mb-1 block text-xs text-muted" htmlFor="ranking-month">Attendance month (UTC)</label><input id="ranking-month" className="field-control !w-auto" type="month" min="2000-01" max={new Date().toISOString().slice(0, 7)} required value={month} onChange={(event) => { if (event.target.value) { setError(''); setMonth(event.target.value); } }} /></div>} />
    {error ? <Panel title="Attendance data unavailable"><p role="alert" className="text-[var(--color-error)]">{error}</p><Button onClick={() => setReload((value) => value + 1)}>Retry</Button></Panel> : !result ? <Panel><p role="status">Loading recorded attendance…</p></Panel> : <>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"><MetricCard label="Staff with recorded attendance" value={`${result.summary.rankedStaff} / ${result.summary.totalStaff}`} detail="Active employees and trainers only" /><MetricCard label="Team attendance rate" value={rate(result.summary.attendanceRate)} detail={`${result.summary.presentDays} present / ${result.summary.expectedDays} scheduled staff-days`} /><MetricCard label="Period through" value={result.end} detail={`${result.start} onwards · UTC`} /></div>
      <Panel title="How this ranking is calculated" className="mb-4"><p className="mb-2 mt-0 text-xs leading-relaxed text-muted">{result.methodology}</p><p className="m-0 text-xs leading-relaxed text-muted">Workweek: {result.workWeek}.{result.workWeekFallback && ' Organization workweek was not recognized, so Monday–Friday is used.'} {result.punctualityRule}</p></Panel>
      <Panel title="Attendance leaderboard">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><input className="field-control" aria-label="Search attendance ranking" placeholder="Search name or department" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="field-control" aria-label="Filter ranking department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{result.departments.map((item) => <option key={item.name}>{item.name}</option>)}</select></div>
        {rows.length ? <DataTable headings={['Rank', 'Employee / trainer', 'Department', 'Attendance rate', 'Present / scheduled', 'Late days', 'Punctuality', 'Excused leave days']} rows={rows.map((row) => ({ id: row.employee.id, cells: [row.rank === null ? 'Unranked' : `#${row.rank}`, <span key="name"><b>{row.employee.name}{row.employee.id === user.id ? ' (you)' : ''}</b><small className="block text-muted">{row.employee.roleName}{row.rank === null && ' · No attendance recorded'}</small></span>, row.employee.department, <b key="rate" className="tabular-nums text-accent">{rate(row.attendanceRate)}</b>, `${row.presentDays} / ${row.expectedDays}`, row.lateDays, rate(row.onTimeRate), row.excusedDays] }))} /> : <EmptyState>No employees or trainers match this view.</EmptyState>}
        <p className="mb-0 mt-3 text-xs text-muted">Filters narrow this list without recalculating ranks. Absence is inferred only for scheduled elapsed days. Staff with no eligible days show —, not a fabricated score.</p>
      </Panel>
      <div className="mt-4"><Panel title="Attendance by department"><BarChart label={`Actual attendance rate · ${result.start} to ${result.end} · fixed 0–100% scale`} unit="%" max={100} points={result.departments.map((item) => ({ label: item.name, value: item.attendanceRate, formatted: rate(item.attendanceRate), detail: `${item.presentDays} present / ${item.expectedDays} scheduled staff-days · ${item.staffCount} staff` }))} /><p className="mb-0 mt-4 text-xs text-muted">Department rates use total days present ÷ total eligible staff-days, not an average of rounded individual rates. Includes all departments regardless of the leaderboard filter.</p></Panel></div>
    </>}
  </>;
}
