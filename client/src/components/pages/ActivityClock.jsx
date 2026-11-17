import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, MetricCard, Panel } from '../common/UI';
import { StatusBadge } from '../common/StatusBadge';
import { time } from '../../utils/portal';
import { TRACKING_STATES, useActivityTracker } from '../../hooks/useActivityTracker';

function secondsLabel(seconds = 0) {
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`;
}

function stateLabel(state) {
  return ({
    [TRACKING_STATES.CLOCKED_OUT]: 'Clocked out',
    [TRACKING_STATES.ACTIVE]: 'Active',
    [TRACKING_STATES.IDLE]: 'Idle',
    [TRACKING_STATES.ON_BREAK]: 'On break'
  })[state] ?? 'Clocked out';
}

/** Lightweight employee control bar backed by the explicit session state machine. */
export function ActivityClock({ attendance, onClockIn, onClockOut, onStartBreak, onEndBreak, onHeartbeat, onError }) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const session = attendance?.currentSession;
  const current = attendance?.current;
  const autoResumeBreakId = useRef(null);
  const { state, trackingEnabled, pauseForBreak, restoreSessionState } = useActivityTracker({ session, config: attendance?.activityConfig, onHeartbeat });
  const activeBreak = session?.activeBreak;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const invoke = async (action) => {
    try {
      setBusy(true);
      await action();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const startBreak = async (durationMinutes) => {
    // Stop listeners and idle timers before the network round-trip so a user
    // who has started a break cannot be marked idle during that transition.
    pauseForBreak();
    try {
      setBusy(true);
      await onStartBreak(durationMinutes);
    } catch (error) {
      restoreSessionState();
      onError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const endBreak = () => invoke(onEndBreak);
  const breakRemaining = activeBreak?.expectedEndsAt ? Math.max(0, Math.ceil((new Date(activeBreak.expectedEndsAt).getTime() - now) / 1_000)) : 0;

  useEffect(() => {
    if (state !== TRACKING_STATES.ON_BREAK || !activeBreak?.id || breakRemaining > 0 || autoResumeBreakId.current === activeBreak.id) return;
    autoResumeBreakId.current = activeBreak.id;
    void endBreak();
  // The callback is intentionally tied to the active break identity: the timer
  // may tick many times at zero while the request is being completed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBreak?.id, breakRemaining, state]);

  useEffect(() => {
    if (state !== TRACKING_STATES.ON_BREAK) autoResumeBreakId.current = null;
  }, [state]);

  const workingLabel = useMemo(() => {
    if (!session?.clockIn) return 'Tracking remains stopped until you clock in.';
    if (session.clockOut) return `Clocked out at ${time(session.clockOut)}`;
    const seconds = Math.max(0, Math.floor((now - new Date(session.clockIn).getTime()) / 1_000));
    return `Shift running for ${secondsLabel(seconds)}${state === TRACKING_STATES.ON_BREAK ? ' · break timer paused from tracking' : ''}`;
  }, [now, session?.clockIn, session?.clockOut, state]);

  const status = stateLabel(state);
  const canWork = state === TRACKING_STATES.ACTIVE || state === TRACKING_STATES.IDLE;

  return <>
    <Panel title="Employee control bar" action={<StatusBadge status={state === TRACKING_STATES.ACTIVE ? 'Active' : state === TRACKING_STATES.ON_BREAK ? 'On break' : state === TRACKING_STATES.IDLE ? 'Late' : 'Offline'}>{status}</StatusBadge>}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="text-[38px] font-semibold tabular-nums">{new Date(now).toLocaleTimeString([], { hour12: false })}</div><small className="text-muted">{workingLabel}</small></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy || state !== TRACKING_STATES.CLOCKED_OUT} onClick={() => invoke(onClockIn)}>Clock in</Button>
          <Button disabled={busy || !canWork} onClick={() => startBreak(5)}>5 min break</Button>
          <Button disabled={busy || !canWork} onClick={() => startBreak(15)}>15 min break</Button>
          {state === TRACKING_STATES.ON_BREAK && <Button variant="primary" disabled={busy} onClick={endBreak}>Clock back in / resume</Button>}
          <Button variant="danger" disabled={busy || state === TRACKING_STATES.CLOCKED_OUT} onClick={() => invoke(onClockOut)}>Clock out</Button>
        </div>
      </div>
    </Panel>
    <div className="h-4" />
    <Panel title="Activity monitor" action={<StatusBadge status={trackingEnabled ? 'Active' : state === TRACKING_STATES.ON_BREAK ? 'On break' : 'Offline'}>{trackingEnabled ? 'Monitoring on' : state === TRACKING_STATES.ON_BREAK ? 'Break in progress' : 'Monitoring off'}</StatusBadge>}>
      <p className="m-0 mb-3.5 max-w-[70ch] text-muted">While working, this portal samples trusted mouse, keyboard, scroll and touch activity. It never records what you type or view. Tracking stops completely when you clock out or take a break.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Session state" value={<StatusBadge status={state === TRACKING_STATES.ACTIVE ? 'Active' : state === TRACKING_STATES.ON_BREAK ? 'On break' : state === TRACKING_STATES.IDLE ? 'Late' : 'Offline'}>{status}</StatusBadge>} detail={state === TRACKING_STATES.IDLE ? 'Waiting for trusted activity' : 'Current work-session state'} />
        <MetricCard label="Active time" value={secondsLabel(session?.activeSeconds ?? current?.activeSeconds)} detail="Trusted interaction" />
        <MetricCard label="Idle time" value={secondsLabel(session?.idleSeconds ?? current?.idleSeconds)} detail="No interaction or portal hidden" />
        <MetricCard label="Break countdown" value={state === TRACKING_STATES.ON_BREAK ? `${Math.floor(breakRemaining / 60)}:${String(breakRemaining % 60).padStart(2, '0')}` : '—'} detail={state === TRACKING_STATES.ON_BREAK ? `${activeBreak?.durationMinutes}-minute break · auto-resumes at zero` : 'Choose 5 or 15 minutes when stepping away'} />
      </div>
    </Panel>
  </>;
}
