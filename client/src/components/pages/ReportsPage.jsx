import { useCallback, useEffect, useState } from 'react';
import { apiRequest, downloadApiFile } from '../../api/client';
import { Button, DataTable, PageHeading, Panel } from '../common/UI';
import { time } from '../../utils/portal';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function Timeline({ timeline }) {
  if (!timeline?.length) return <p className="m-0 text-muted">No activity events were recorded for this employee on this date.</p>;
  return <ol className="m-0 list-none space-y-2 p-0">{timeline.map((entry) => <li key={entry.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0"><time className="min-w-[56px] font-semibold tabular-nums text-accent">{time(entry.timestamp)}</time><div><b className="font-medium">{entry.action}</b><small className="block text-muted">{entry.eventType.replaceAll('_', ' ').toLowerCase()}</small></div></li>)}</ol>;
}

/** Admin-only end-of-day operational view, using the existing portal visual language. */
export function ReportsPage({ onError }) {
  const [date, setDate] = useState(todayKey);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiRequest(`/api/admin/reports/daily?date=${encodeURIComponent(date)}`);
      setReports(result.reports);
      setSelected(null);
      setTimeline([]);
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
    }
  }, [date, onError]);

  useEffect(() => { void loadReports(); }, [loadReports]);

  const toggleTimeline = async (report) => {
    if (selected?.employee.id === report.employee.id) {
      setSelected(null);
      setTimeline([]);
      return;
    }
    try {
      setTimelineLoading(true);
      const result = await apiRequest(`/api/admin/logs/${encodeURIComponent(report.employee.id)}?date=${encodeURIComponent(date)}`);
      setSelected(report);
      setTimeline(result.timeline);
    } catch (error) {
      onError(error.message);
    } finally {
      setTimelineLoading(false);
    }
  };

  const exportCsv = async () => {
    try {
      await downloadApiFile(`/api/admin/reports/daily/export?date=${encodeURIComponent(date)}`, `excellium-daily-activity-${date}.csv`);
    } catch (error) {
      onError(error.message);
    }
  };

  return <>
    <PageHeading title="End-of-day activity" description="Session, break, activity and review signals by employee." action={<div className="flex flex-wrap gap-2"><input className="field-control !w-auto !py-2" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><Button variant="primary" onClick={exportCsv}>Download CSV</Button></div>} />
    <Panel title={`Daily summary · ${date}`} action={loading ? <small className="text-muted">Loading…</small> : <small className="text-muted">{reports.length} employees</small>}>
      <DataTable
        headings={['Employee', 'In', 'Out', 'Shift', 'Active', 'Idle', 'Breaks', 'Score', 'Flags', 'Timeline']}
        rows={reports.map((report) => ({
          id: report.employee.id,
          cells: [
            <span key="name"><b className="block">{report.employee.name}</b><small className="text-muted">{report.employee.department}</small></span>,
            time(report.clockIn), time(report.clockOut), report.labels.totalShift, report.labels.active, report.labels.idle,
            <span key="breaks">{report.labels.totalBreak}<small className="block text-muted">5m {report.labels.break5} · 15m {report.labels.break15}{report.overBreakSeconds > 0 ? ` · +${report.labels.overBreak}` : ''}</small></span>,
            `${report.productivityScore}%`,
            report.suspiciousFlagsCount ? <b className="text-[var(--color-warn)]" key="flags">{report.suspiciousFlagsCount}</b> : '—',
            <Button key="timeline" small onClick={() => toggleTimeline(report)} disabled={timelineLoading}>{selected?.employee.id === report.employee.id ? 'Hide' : 'View'}</Button>
          ]
        }))}
      />
    </Panel>
    {selected && <div className="mt-4"><Panel title={`${selected.employee.name} · chronological audit log`} action={<Button small onClick={() => { setSelected(null); setTimeline([]); }}>Close</Button>}><Timeline timeline={timeline} /></Panel></div>}
  </>;
}
