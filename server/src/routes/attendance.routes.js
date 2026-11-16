import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, findUser, formatAttendance } from '../services/records.service.js';
import { createId, currentDateKey, currentIso } from '../utils/ids.js';
import { conflict, HttpError } from '../utils/http-error.js';

const breakSchema = z.object({
  action: z.enum(['start', 'end']).default('start'),
  minutes: z.number().int().refine((value) => [5, 15].includes(value), 'Break must be 5 or 15 minutes').optional()
}).superRefine((value, context) => {
  if (value.action === 'start' && !value.minutes) context.addIssue({ code: 'custom', message: 'Break minutes are required' });
});

const activitySchema = z.object({
  activeSeconds: z.number().min(0).max(60).default(0),
  idleSeconds: z.number().min(0).max(60).default(0)
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

function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60_000));
}

function summary(data, user) {
  const records = data.attendance
    .filter((record) => record.userId === user.id)
    .sort((left, right) => right.date.localeCompare(left.date));

  return {
    current: currentRecord(data, user.id) ? formatAttendance(data, currentRecord(data, user.id)) : null,
    records: records.map((record) => formatAttendance(data, record)),
    totals: {
      totalActiveSeconds: records.reduce((sum, record) => sum + (record.activeSeconds || 0), 0),
      lateArrivals: records.filter((record) => record.status === 'Late').length
    }
  };
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
      await request.app.locals.store.mutate((data) => {
        if (currentRecord(data, request.auth.user.id)) throw conflict('You are already clocked in');
        const clockIn = currentIso();
        attendance = data.attendance.find((record) => record.userId === request.auth.user.id && record.date === currentDateKey());
        if (attendance) {
          Object.assign(attendance, { clockIn, clockOut: null, breakMinutes: 0, breakStartedAt: null, breakEndsAt: null, activeSeconds: 0, idleSeconds: 0, status: clockInStatus(data, clockIn) });
        } else {
          attendance = { id: createId('att'), userId: request.auth.user.id, date: currentDateKey(), clockIn, clockOut: null, breakMinutes: 0, breakStartedAt: null, breakEndsAt: null, activeSeconds: 0, idleSeconds: 0, status: clockInStatus(data, clockIn) };
          data.attendance.unshift(attendance);
        }
        addAuditEntry(data, request.auth.user.id, 'Clocked in');
      });
      response.status(201).json({ attendance: formatAttendance(request.app.locals.store.data, attendance) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/clock-out', async (request, response, next) => {
    try {
      let attendance;
      await request.app.locals.store.mutate((data) => {
        attendance = currentRecord(data, request.auth.user.id);
        if (!attendance) throw conflict('You must be clocked in before clocking out');
        if (attendance.breakStartedAt) attendance.breakMinutes += minutesBetween(attendance.breakStartedAt, currentIso());
        Object.assign(attendance, { clockOut: currentIso(), breakStartedAt: null, breakEndsAt: null });
        addAuditEntry(data, request.auth.user.id, 'Clocked out');
      });
      response.json({ attendance: formatAttendance(request.app.locals.store.data, attendance) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/break', validate(breakSchema), async (request, response, next) => {
    try {
      let attendance;
      await request.app.locals.store.mutate((data) => {
        attendance = currentRecord(data, request.auth.user.id);
        if (!attendance) throw conflict('You must be clocked in before starting a break');
        if (request.validated.action === 'start') {
          if (attendance.breakStartedAt) throw conflict('A break is already in progress');
          attendance.breakStartedAt = currentIso();
          attendance.breakEndsAt = new Date(Date.now() + request.validated.minutes * 60_000).toISOString();
          addAuditEntry(data, request.auth.user.id, `Started a ${request.validated.minutes}-minute break`);
        } else {
          if (!attendance.breakStartedAt) throw conflict('No break is in progress');
          attendance.breakMinutes += minutesBetween(attendance.breakStartedAt, currentIso());
          attendance.breakStartedAt = null;
          attendance.breakEndsAt = null;
          addAuditEntry(data, request.auth.user.id, 'Ended a break');
        }
      });
      response.json({ attendance: formatAttendance(request.app.locals.store.data, attendance) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/activity', validate(activitySchema), async (request, response, next) => {
    try {
      let attendance;
      await request.app.locals.store.mutate((data) => {
        attendance = currentRecord(data, request.auth.user.id);
        if (!attendance) throw conflict('You must be clocked in before sending activity');
        attendance.activeSeconds = (attendance.activeSeconds || 0) + request.validated.activeSeconds;
        attendance.idleSeconds = (attendance.idleSeconds || 0) + request.validated.idleSeconds;
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
        addNotification(data, { audience: ['manager', 'admin'], message: `${request.auth.user.name} requested an attendance correction for ${correction.date}` });
        addAuditEntry(data, request.auth.user.id, `Submitted attendance correction for ${correction.date}`);
      });
      response.status(201).json({ correction });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
