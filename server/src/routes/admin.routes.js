import { Router } from 'express';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { buildDailyActivityReport, employeeActivityTimeline, ensureWorkSessionCollections } from '../services/activity.service.js';
import { currentDateKey } from '../utils/ids.js';
import { forbidden, HttpError } from '../utils/http-error.js';
import { canManagePerson } from '../../../shared/access-control.mjs';
import { dateOnlySchema } from '../utils/validation.js';

function requestedDate(value) {
  const parsed = dateOnlySchema.safeParse(value ?? currentDateKey());
  if (!parsed.success) throw new HttpError(400, 'date must be a valid calendar date in YYYY-MM-DD format');
  return parsed.data;
}

function scopedReport(request, date) {
  return buildDailyActivityReport(request.app.locals.store.data, date).filter((row) => canManagePerson(request.auth.user, row.employee));
}

function csvField(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportCsv(rows) {
  const headings = ['Employee', 'Department', 'Date', 'Clock in', 'Clock out', 'Total shift', 'Active time', 'Idle time', 'Total break', '5-minute breaks', '15-minute breaks', 'Over-break', 'Active share (active / active + idle)', 'Suspicious flags'];
  const lines = rows.map((row) => [
    row.employee.name, row.employee.department, row.date, row.clockIn, row.clockOut, row.labels.totalShift,
    row.labels.active, row.labels.idle, row.labels.totalBreak, row.labels.break5, row.labels.break15,
    row.labels.overBreak, `${row.productivityScore}%`, row.suspiciousFlagsCount
  ].map(csvField).join(','));
  return [headings.join(','), ...lines].join('\r\n');
}

export function createAdminRouter() {
  const router = Router();
  router.use(requireAuthentication, requireManagement);

  router.get('/reports/daily', (request, response, next) => {
    try {
      const date = requestedDate(request.query.date);
      const data = request.app.locals.store.data;
      ensureWorkSessionCollections(data);
      response.json({ date, reports: scopedReport(request, date) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports/daily/export', (request, response, next) => {
    try {
      const date = requestedDate(request.query.date);
      const data = request.app.locals.store.data;
      ensureWorkSessionCollections(data);
      response
        .status(200)
        .type('text/csv')
        .attachment(`excellium-daily-activity-${date}.csv`)
        .send(reportCsv(scopedReport(request, date)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/logs/:employeeId', (request, response, next) => {
    try {
      const date = requestedDate(request.query.date);
      const employee = request.app.locals.store.data.users.find((user) => user.id === request.params.employeeId);
      if (!employee) throw new HttpError(404, 'Employee was not found');
      if (!canManagePerson(request.auth.user, employee)) throw forbidden('You cannot view a timeline outside your staff scope');
      response.json({ date, employee: { id: employee.id, name: employee.name, department: employee.department }, timeline: employeeActivityTimeline(request.app.locals.store.data, employee.id, date) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
