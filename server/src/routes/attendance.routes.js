import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  closeWorkSession,
  currentActivitySession,
  endWorkBreak,
  ensureWorkSessionCollections,
  openWorkSession,
  recordActivityHeartbeat,
  startWorkBreak
} from '../services/activity.service.js';
import { addAuditEntry, formatAttendance } from '../services/records.service.js';
import { createId, currentDateKey, currentIso } from '../utils/ids.js';
import { conflict } from '../utils/http-error.js';

const breakStartSchema = z.object({
  minutes: z.number().int().refine((value) => [5, 15].includes(value), 'Break must be 5 or 15 minutes')
});

const breakSchema = z.object({
  action: z.enum(['start', 'end']).default('start'),
  minutes: z.number().int().refine((value) => [5, 15].includes(value), 'Break must be 5 or 15 minutes').optional()
}).superRefine((value, context) => {
  if (value.action === 'start' && !value.minutes) context.addIssue({ code: 'custom', message: 'Break minutes are required' });
});

// Legacy endpoint compatibility. New browser tracking uses /api/activity/heartbeat.
const activitySchema = z.object({
  activeSeconds: z.number().min(0).max(180).default(0),
  idleSeconds: z.number().min(0).max(180).default(0)
});

const correctionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(1000)
});

function currentRecord(data, userId) {
  return data.attendance.find((record) => record.userId === userId && record.date === currentDateKey() && record.clockIn && !record.clockOut);
}

function clockInStatus(data, clockIn) {
  const [hours, minutes] = data.organization.standardStartTime.split(':').map(Number);
  const time = new Date(clockIn);
  return time.getUTCHours() > hours || (time.getUTCHours() === hours && time.getUTCMinutes() > minutes + 5) ? 'Late' : 'On time';
}

function updateAttendanceBreak(attendance, session, activeBreak) {
  attendance.breakMinutes = Math.round((session.breakSeconds || 0) / 60);
  attendance.breakStartedAt = activeBreak?.startedAt ?? null;
  attendance.breakEndsAt = activeBreak?.expectedEndsAt ?? null;
}

function sessionForResponse(data, userId) {
  return currentActivitySession(data, userId);
}

function summary(data, user) {
  ensureWorkSessionCollections(data);
  const records = data.attendance
    .filter((record) => record.userId === user.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  const current = currentRecord(data, user.id);

  return {
    current: current ? formatAttendance(data, current) : null,
    currentSession: sessionForResponse(data, user.id),
    records: records.map((record) => formatAttendance(data, record)),
    totals: {
      totalActiveSeconds: records.reduce((sum, record) => sum + (record.activeSeconds || 0), 0),
      lateArrivals: records.filter((record) => record.status === 'Late').length
    },
    activityConfig: {
      idleAfterSeconds: env.activityIdleMinutes * 60,
      heartbeatEverySeconds: env.activityHeartbeatSeconds
    }
  };
}

async function updateWorkBreak(request, response, next, { action, minutes }) {
  try {
    let attendance;
    let session;
    let breakLog;
    await request.app.locals.store.mutate((data) => {
      ensureWorkSessionCollections(data);
      attendance = currentRecord(data, request.auth.user.id);
      if (!attendance) throw conflict('You must be clocked in before updating a break');
      const at = currentIso();
      if (action === 'start') {
        ({ session, breakLog } = startWorkBreak(data, request.auth.user.id, minutes, { at }));
        updateAttendanceBreak(attendance, session, breakLog);
      } else {
        ({ session, breakLog } = endWorkBreak(data, request.auth.user.id, { at }));
        updateAttendanceBreak(attendance, session, null);
      }
    });
    response.json({ attendance: formatAttendance(request.app.locals.store.data, attendance), session, break: breakLog });
  } catch (error) {
    next(error);
  }
}

export function createAttendanceRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    response.json(summary(request.app.locals.store.data, request.auth.user));
  });

  router.get('/team', requireManagement, (request, response) => {
    const data = request.app.locals.store.data;
    const date = request.query.date || currentDateKey();
    const records = data.users.map((employee) => {
      const attendance = data.attendance.find((record) => record.userId === employee.id && record.date === date) ?? {
        id: null, userId: employee.id, date, clockIn: null, clockOut: null, breakMinutes: 0, status: 'Absent', activeSeconds: 0, idleSeconds: 0
      };
      return formatAttendance(data, attendance);
    });
    response.json({ date, records });
  });

  router.post('/clock-in', async (request, response, next) => {
    try {
      let attendance;
      let session;
      await request.app.locals.store.mutate((data) => {
        ensureWorkSessionCollections(data);
        if (currentRecord(data, request.auth.user.id)) throw conflict('You are already clocked in');
        const clockIn = currentIso();
        session = openWorkSession(data, request.auth.user.id, { at: clockIn });
        attendance = data.attendance.find((record) => record.userId === request.auth.user.id && record.date === currentDateKey());
        if (attendance) {
          Object.assign(attendance, { clockIn, clockOut: null, breakMinutes: 0, breakStartedAt: null, breakEndsAt: null, activeSeconds: 0, idleSeconds: 0, status: clockInStatus(data, clockIn) });
        } else {
          attendance = { id: createId('att'), userId: request.auth.user.id, date: currentDateKey(), clockIn, clockOut: null, breakMinutes: 0, breakStartedAt: null, breakEndsAt: null, activeSeconds: 0, idleSeconds: 0, status: clockInStatus(data, clockIn) };
          data.attendance.unshift(attendance);
        }
      });
      response.status(201).json({ attendance: formatAttendance(request.app.locals.store.data, attendance), session });
    } catch (error) {
      next(error);
    }
  });

  router.post('/clock-out', async (request, response, next) => {
    try {
      let attendance;
      let session;
      await request.app.locals.store.mutate((data) => {
        ensureWorkSessionCollections(data);
        attendance = currentRecord(data, request.auth.user.id);
        if (!attendance) throw conflict('You must be clocked in before clocking out');
        const at = currentIso();
        session = closeWorkSession(data, request.auth.user.id, { at });
        Object.assign(attendance, {
          clockOut: at,
          breakMinutes: Math.round((session.breakSeconds || 0) / 60),
          breakStartedAt: null,
          breakEndsAt: null,
          activeSeconds: session.activeSeconds,
          idleSeconds: session.idleSeconds
        });
      });
      response.json({ attendance: formatAttendance(request.app.locals.store.data, attendance), session });
    } catch (error) {
      next(error);
    }
  });

  // Explicit start/end routes are the public API; /break is retained for the
  // already-shipped UI and maps to the same state-machine transition.
  router.post('/break/start', validate(breakStartSchema), (request, response, next) => updateWorkBreak(request, response, next, { action: 'start', minutes: request.validated.minutes }));
  router.post('/break/end', (request, response, next) => updateWorkBreak(request, response, next, { action: 'end' }));
  router.post('/break', validate(breakSchema), (request, response, next) => updateWorkBreak(request, response, next, request.validated));

  router.post('/activity', validate(activitySchema), async (request, response, next) => {
    try {
      let attendance;
      await request.app.locals.store.mutate((data) => {
        ensureWorkSessionCollections(data);
        attendance = currentRecord(data, request.auth.user.id);
        if (!attendance) throw conflict('You must be clocked in before sending activity');
        const state = request.validated.idleSeconds > request.validated.activeSeconds ? 'IDLE' : 'ACTIVE';
        recordActivityHeartbeat(data, request.auth.user.id, {
          state,
          durationSeconds: Math.max(request.validated.activeSeconds, request.validated.idleSeconds),
          mouseClicks: 0,
          keypresses: 0,
          coordinates: []
        });
      });
      response.json({ attendance: formatAttendance(request.app.locals.store.data, attendance) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/corrections', validate(correctionSchema), async (request, response, next) => {
    try {
      let correction;
      await request.app.locals.store.mutate((data) => {
        correction = { id: createId('cor'), userId: request.auth.user.id, ...request.validated, status: 'Pending', createdAt: currentIso() };
        data.attendanceCorrections.unshift(correction);
        addAuditEntry(data, request.auth.user.id, `Submitted attendance correction for ${correction.date}`, { subjectUserId: request.auth.user.id, eventType: 'ATTENDANCE_CORRECTION' });
      });
      response.status(201).json({ correction });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
