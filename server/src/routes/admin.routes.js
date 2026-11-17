import { Router } from 'express';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { buildDailyActivityReport, employeeActivityTimeline, ensureWorkSessionCollections } from '../services/activity.service.js';
import { currentDateKey } from '../utils/ids.js';
import { HttpError } from '../utils/http-error.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requestedDate(value) {
  const date = String(value ?? currentDateKey());
  if (!DATE_PATTERN.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())) {
    throw new HttpError(400, 'date must use YYYY-MM-DD format');
  }
  return date;
}

function csvField(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportCsv(rows) {
  const headings = ['Employee', 'Department', 'Date', 'Clock in', 'Clock out', 'Total shift', 'Active time', 'Idle time', 'Total break', '5-minute breaks', '15-minute breaks', 'Over-break', 'Productivity score', 'Suspicious flags'];
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
      response.json({ date, reports: buildDailyActivityReport(data, date) });
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
        .send(reportCsv(buildDailyActivityReport(data, date)));
    } catch (error) {
      next(error);
    }
  });

  router.get('/logs/:employeeId', (request, response, next) => {
    try {
      const date = requestedDate(request.query.date);
      const employee = request.app.locals.store.data.users.find((user) => user.id === request.params.employeeId);
      if (!employee) throw new HttpError(404, 'Employee was not found');
      response.json({ date, employee: { id: employee.id, name: employee.name, department: employee.department }, timeline: employeeActivityTimeline(request.app.locals.store.data, employee.id, date) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
