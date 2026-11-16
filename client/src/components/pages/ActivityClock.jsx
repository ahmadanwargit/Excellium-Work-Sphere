import { useEffect, useMemo, useState } from 'react';
import { Button, MetricCard, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { time } from '../../utils/portal';

function secondsLabel(seconds = 0) {
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`;
}

export function ActivityClock({ attendance, onClockIn, onClockOut, onBreak, onError }) {
  const [now, setNow] = useState(Date.now());
  const current = attendance?.current;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const workingLabel = useMemo(() => {
    if (!current?.clockIn) return 'Not clocked in';
    if (current.clockOut) return `Clocked out at ${time(current.clockOut)}`;
    const minutes = Math.floor((now - new Date(current.clockIn).getTime()) / 60_000);
    return `Working for ${Math.max(0, Math.floor(minutes / 60))}h ${Math.max(0, minutes % 60)}m${current.breakStartedAt ? ' (on break)' : ''}`;
  }, [current, now]);

  const invoke = async (action) => { try { await action(); } catch (error) { onError(error.message); } };
  const onBreakNow = (minutes) => invoke(() => current?.breakStartedAt ? onBreak({ action: 'end' }) : onBreak({ action: 'start', minutes }));
  const breakRemaining = current?.breakEndsAt ? Math.max(0, Math.round((new Date(current.breakEndsAt).getTime() - now) / 1000)) : 0;

  return <>
    <Panel title="Today"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-[38px] font-semibold tabular-nums">{new Date(now).toLocaleTimeString([], { hour12: false })}</div><small className="text-muted">{workingLabel}</small></div><div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => invoke(onClockIn)}>Clock in</Button>{current?.breakStartedAt ? <Button variant="primary" onClick={() => onBreakNow()}>End break</Button> : <><Button onClick={() => onBreakNow(5)}>5 min break</Button><Button onClick={() => onBreakNow(15)}>15 min break</Button></>}<Button variant="danger" onClick={() => invoke(onClockOut)}>Clock out</Button></div></div></Panel>
    <div className="h-4" />
    <Panel title="Activity monitor" action={<StatusBadge status={current?.clockIn && !current?.clockOut ? 'Active' : 'Offline'}>{current?.clockIn && !current?.clockOut ? 'Monitoring on' : 'Starts when you clock in'}</StatusBadge>}>
      <p className="m-0 mb-3.5 max-w-[70ch] text-muted">While you are clocked in, this portal records mouse, keyboard and touch activity only. It never records what you type or see. Choose a 5 or 15 minute break before you step away.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Status" value={<StatusBadge status={current?.breakStartedAt ? 'On break' : current?.live ? 'Active' : 'Offline'}>{current?.breakStartedAt ? 'On break' : current?.live ? 'Active' : 'Offline'}</StatusBadge>} /><MetricCard label="Active time" value={secondsLabel(current?.activeSeconds)} detail="Mouse or keyboard in use" /><MetricCard label="Idle time" value={secondsLabel(current?.idleSeconds)} detail="No input detected" /><MetricCard label="Break" value={current?.breakStartedAt ? `${Math.floor(breakRemaining / 60)}:${String(breakRemaining % 60).padStart(2, '0')} left` : 'None active'} detail="Breaks taken today" /></div>
    </Panel>
  </>;
}
