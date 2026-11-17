import { createId, currentDateKey, currentIso } from '../utils/ids.js';
import { conflict } from '../utils/http-error.js';
import { addAuditEntry, findUser, publicUser } from './records.service.js';
import { detectJigglerPatterns } from './jiggler.service.js';

export const SESSION_STATES = Object.freeze({
  CLOCKED_OUT: 'CLOCKED_OUT',
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  ON_BREAK: 'ON_BREAK'
});

const FLAG_LABELS = Object.freeze({
  REPETITIVE_COORDINATE_LOOP: 'Flagged repetitive cursor pattern',
  FIXED_INTERVAL_PIXEL_NUDGE: 'Flagged fixed-interval pixel nudges',
  MOTION_WITHOUT_INPUT_30_MIN: 'Flagged cursor motion without clicks or keystrokes for 30 minutes'
});

export function secondsBetween(start, end) {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

export function activeWorkSession(data, userId) {
  return data.workSessions.find((session) => session.userId === userId && !session.clockOut && session.state !== SESSION_STATES.CLOCKED_OUT) ?? null;
}

export function attendanceForSession(data, session) {
  return data.attendance.find((attendance) => attendance.userId === session.userId && attendance.date === session.workDate && !attendance.clockOut) ?? null;
}

function sessionDate(at) {
  return new Date(at).toISOString().slice(0, 10);
}

function sessionAudit(data, userId, action, { sessionId, breakLogId = null, eventType }) {
  addAuditEntry(data, userId, action, { subjectUserId: userId, sessionId, breakLogId, eventType });
}

/** Opens a typed work session. The caller keeps legacy attendance presentation in sync. */
export function openWorkSession(data, userId, { at = currentIso() } = {}) {
  if (activeWorkSession(data, userId)) throw conflict('You are already clocked in');
  const session = {
    id: createId('ses'),
    userId,
    workDate: sessionDate(at),
    clockIn: at,
    clockOut: null,
    state: SESSION_STATES.ACTIVE,
    activeSeconds: 0,
    idleSeconds: 0,
    breakSeconds: 0,
    suspiciousFlagCount: 0,
    createdAt: at,
    updatedAt: at
  };
  data.workSessions.unshift(session);
  sessionAudit(data, userId, 'Clocked in', { sessionId: session.id, eventType: 'CLOCK_IN' });
  return session;
}

export function startWorkBreak(data, userId, durationMinutes, { at = currentIso() } = {}) {
  const session = activeWorkSession(data, userId);
  if (!session) throw conflict('You must be clocked in before starting a break');
  if (session.state === SESSION_STATES.ON_BREAK) throw conflict('A break is already in progress');

  const breakLog = {
    id: createId('brk'),
    sessionId: session.id,
    userId,
    workDate: session.workDate,
    durationMinutes,
    startedAt: at,
    expectedEndsAt: new Date(new Date(at).getTime() + durationMinutes * 60_000).toISOString(),
    endedAt: null,
    actualSeconds: 0,
    overageSeconds: 0,
    status: 'ACTIVE'
  };
  data.breakLogs.unshift(breakLog);
  Object.assign(session, { state: SESSION_STATES.ON_BREAK, updatedAt: at });
  sessionAudit(data, userId, `Started ${durationMinutes}-minute break`, { sessionId: session.id, breakLogId: breakLog.id, eventType: 'BREAK_START' });
  return { session, breakLog };
}

export function endWorkBreak(data, userId, { at = currentIso(), resumeState = SESSION_STATES.ACTIVE } = {}) {
  const session = activeWorkSession(data, userId);
  if (!session || session.state !== SESSION_STATES.ON_BREAK) throw conflict('No break is in progress');
  const breakLog = data.breakLogs.find((item) => item.sessionId === session.id && !item.endedAt);
  if (!breakLog) throw new Error('The active work session has no active break log');

  const actualSeconds = secondsBetween(breakLog.startedAt, at);
  const overageSeconds = Math.max(0, actualSeconds - breakLog.durationMinutes * 60);
  Object.assign(breakLog, { endedAt: at, actualSeconds, overageSeconds, status: overageSeconds ? 'OVERRUN' : 'COMPLETED' });
  Object.assign(session, {
    state: resumeState,
    breakSeconds: (session.breakSeconds || 0) + actualSeconds,
    updatedAt: at
  });
  const overageNote = overageSeconds ? ` (${Math.ceil(overageSeconds / 60)} minute overrun)` : '';
  sessionAudit(data, userId, `Resumed work from ${breakLog.durationMinutes}-minute break${overageNote}`, { sessionId: session.id, breakLogId: breakLog.id, eventType: 'BREAK_END' });
  return { session, breakLog };
}

export function closeWorkSession(data, userId, { at = currentIso() } = {}) {
  let session = activeWorkSession(data, userId);
  if (!session) throw conflict('You must be clocked in before clocking out');
  if (session.state === SESSION_STATES.ON_BREAK) endWorkBreak(data, userId, { at, resumeState: SESSION_STATES.CLOCKED_OUT });
  session = activeWorkSession(data, userId);
  Object.assign(session, { clockOut: at, state: SESSION_STATES.CLOCKED_OUT, updatedAt: at });
  sessionAudit(data, userId, 'Clocked out', { sessionId: session.id, eventType: 'CLOCK_OUT' });
  return session;
}

function safeSampleTimestamp(timestamp, fallback) {
  const date = new Date(timestamp);
  const fallbackDate = new Date(fallback);
  return Number.isNaN(date.getTime()) || Math.abs(date.getTime() - fallbackDate.getTime()) > 2 * 60_000 ? fallback : date.toISOString();
}

function addActivityFlags(data, session, detectedKinds, at) {
  detectedKinds.forEach((kind) => {
    const alreadyFlagged = data.activityFlags.some((flag) => flag.sessionId === session.id && flag.kind === kind);
    if (alreadyFlagged) return;
    const flag = { id: createId('flg'), sessionId: session.id, userId: session.userId, workDate: session.workDate, kind, detectedAt: at };
    data.activityFlags.unshift(flag);
    session.suspiciousFlagCount = (session.suspiciousFlagCount || 0) + 1;
    sessionAudit(data, session.userId, FLAG_LABELS[kind] ?? 'Flagged suspicious activity pattern', { sessionId: session.id, eventType: 'ACTIVITY_FLAG' });
  });
}

/** Records only lightweight activity metadata; never keystrokes, page content, or screenshots. */
export function recordActivityHeartbeat(data, userId, payload, { at = currentIso() } = {}) {
  const session = activeWorkSession(data, userId);
  if (!session) throw conflict('You must be clocked in before sending activity');
  if (session.state === SESSION_STATES.ON_BREAK) return { ignored: true, session };

  const state = payload.state === 'IDLE' ? SESSION_STATES.IDLE : SESSION_STATES.ACTIVE;
  const durationSeconds = Math.min(180, Math.max(0, Math.floor(payload.durationSeconds || 0)));
  const heartbeat = {
    id: createId('hbt'),
    sessionId: session.id,
    userId,
    recordedAt: at,
    state,
    durationSeconds,
    mouseClicks: Math.min(100, Math.max(0, Math.floor(payload.mouseClicks || 0))),
    keypresses: Math.min(300, Math.max(0, Math.floor(payload.keypresses || 0))),
    pageHidden: Boolean(payload.pageHidden)
  };
  data.activityHeartbeats.unshift(heartbeat);
  (payload.coordinates ?? []).forEach((coordinate) => {
    data.activitySamples.unshift({
      id: createId('smp'), heartbeatId: heartbeat.id, sessionId: session.id, userId,
      x: Math.round(coordinate.x), y: Math.round(coordinate.y),
      eventAt: safeSampleTimestamp(coordinate.timestamp, at), eventType: coordinate.eventType ?? 'pointer'
    });
  });

  if (state === SESSION_STATES.ACTIVE) session.activeSeconds = (session.activeSeconds || 0) + durationSeconds;
  else session.idleSeconds = (session.idleSeconds || 0) + durationSeconds;
  if (session.state !== state) {
    const action = state === SESSION_STATES.IDLE ? 'Marked idle' : 'Returned active';
    sessionAudit(data, userId, action, { sessionId: session.id, eventType: state === SESSION_STATES.IDLE ? 'IDLE' : 'ACTIVE' });
  }
  Object.assign(session, { state, updatedAt: at });

  const attendance = attendanceForSession(data, session);
  if (attendance) {
    attendance.activeSeconds = session.activeSeconds;
    attendance.idleSeconds = session.idleSeconds;
  }

  const cutoff = new Date(new Date(at).getTime() - 30 * 60_000).getTime();
  const samples = data.activitySamples.filter((sample) => sample.sessionId === session.id && new Date(sample.eventAt).getTime() >= cutoff);
  const heartbeats = data.activityHeartbeats.filter((item) => item.sessionId === session.id && new Date(item.recordedAt).getTime() >= cutoff);
  addActivityFlags(data, session, detectJigglerPatterns({ samples, heartbeats, now: at }), at);
  return { ignored: false, session, heartbeat };
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 3600)}h ${String(Math.floor(total / 60) % 60).padStart(2, '0')}m`;
}

function sessionDuration(session, now) {
  // A historic imported session may have no reliable clock-out timestamp. Do
  // not let it appear to run forever in an end-of-day report.
  const fallbackEnd = session.workDate < currentDateKey() ? `${session.workDate}T23:59:59.999Z` : now;
  return secondsBetween(session.clockIn, session.clockOut ?? fallbackEnd);
}

function breakDuration(log, now) {
  return log.actualSeconds || secondsBetween(log.startedAt, log.endedAt ?? now);
}

export function buildDailyActivityReport(data, date, { now = currentIso() } = {}) {
  return data.users.map((user) => {
    const sessions = data.workSessions.filter((session) => session.userId === user.id && session.workDate === date);
    const sessionIds = new Set(sessions.map((session) => session.id));
    const breaks = data.breakLogs.filter((item) => sessionIds.has(item.sessionId));
    const flags = data.activityFlags.filter((item) => sessionIds.has(item.sessionId));
    const activeSeconds = sessions.reduce((sum, session) => sum + (session.activeSeconds || 0), 0);
    const idleSeconds = sessions.reduce((sum, session) => sum + (session.idleSeconds || 0), 0);
    const totalShiftSeconds = sessions.reduce((sum, session) => sum + sessionDuration(session, now), 0);
    const break5Seconds = breaks.filter((item) => item.durationMinutes === 5).reduce((sum, item) => sum + breakDuration(item, now), 0);
    const break15Seconds = breaks.filter((item) => item.durationMinutes === 15).reduce((sum, item) => sum + breakDuration(item, now), 0);
    const overBreakSeconds = breaks.reduce((sum, item) => sum + (item.overageSeconds || Math.max(0, breakDuration(item, now) - item.durationMinutes * 60)), 0);
    const clockIn = sessions.length ? sessions.reduce((earliest, session) => earliest < session.clockIn ? earliest : session.clockIn, sessions[0].clockIn) : null;
    const clockOut = sessions.length && sessions.every((session) => session.clockOut)
      ? sessions.reduce((latest, session) => latest > session.clockOut ? latest : session.clockOut, sessions[0].clockOut)
      : null;
    const productiveSeconds = activeSeconds + idleSeconds;
    const productivityScore = productiveSeconds ? Math.round((activeSeconds / productiveSeconds) * 100) : 0;

    return {
      employee: publicUser(user), date, clockIn, clockOut, totalShiftSeconds, activeSeconds, idleSeconds,
      totalBreakSeconds: break5Seconds + break15Seconds, break5Seconds, break15Seconds, overBreakSeconds,
      productivityScore, suspiciousFlagsCount: flags.length,
      labels: {
        totalShift: formatDuration(totalShiftSeconds), active: formatDuration(activeSeconds), idle: formatDuration(idleSeconds),
        totalBreak: formatDuration(break5Seconds + break15Seconds), break5: formatDuration(break5Seconds), break15: formatDuration(break15Seconds), overBreak: formatDuration(overBreakSeconds)
      }
    };
  });
}

export function employeeActivityTimeline(data, employeeId, date) {
  return data.auditLog
    .filter((entry) => (entry.subjectUserId ?? entry.actorId) === employeeId && entry.timestamp.slice(0, 10) === date)
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp))
    .map((entry) => ({ ...entry, employee: publicUser(findUser(data, employeeId)) }));
}

export function currentActivitySession(data, userId) {
  const session = activeWorkSession(data, userId);
  if (!session) return null;
  const activeBreak = data.breakLogs.find((item) => item.sessionId === session.id && !item.endedAt) ?? null;
  return { ...session, activeBreak };
}

export function ensureWorkSessionCollections(data) {
  // Allows pre-existing local JSON stores to upgrade safely without requiring a
  // destructive reset. Supabase always hydrates these arrays from typed tables.
  ['workSessions', 'breakLogs', 'activityHeartbeats', 'activitySamples', 'activityFlags'].forEach((key) => {
    if (!Array.isArray(data[key])) data[key] = [];
  });
}

export function currentSessionDate() {
  return currentDateKey();
}
