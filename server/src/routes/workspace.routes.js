import { Router } from 'express';
import { z } from 'zod';
import { requireAdministrator, requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, formatAttendance, isManager, publicUser, visibleNotifications } from '../services/records.service.js';
import { currentDateKey } from '../utils/ids.js';

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(100).optional()
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field');

const organizationSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  workWeek: z.string().trim().min(1).max(50).optional(),
  standardStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  inactivityLockMinutes: z.number().int().min(1).max(60).optional()
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one organization field');

function dashboardSummary(data, user) {
  if (isManager(user)) {
    const attendance = data.attendance.filter((record) => record.date === currentDateKey());
    return {
      totalEmployees: data.users.length,
      present: attendance.filter((record) => ['Present', 'On time', 'Late', 'Early departure'].includes(record.status)).length,
      absent: attendance.filter((record) => record.status === 'Absent').length,
      onLeave: attendance.filter((record) => record.status === 'On leave').length,
      pendingInvoices: data.invoices.filter((invoice) => invoice.status === 'Pending').length,
      pendingEquipmentRequests: data.equipmentRequests.filter((request) => request.status === 'Pending').length,
      upcomingMeetings: data.meetings.filter((meeting) => new Date(meeting.startsAt) >= new Date()).length
    };
  }

  const records = data.attendance.filter((record) => record.userId === user.id);
  return {
    current: records.find((record) => record.date === currentDateKey() && record.clockIn && !record.clockOut) ?? null,
    totalActiveSeconds: records.reduce((sum, record) => sum + (record.activeSeconds || 0), 0),
    lateArrivals: records.filter((record) => record.status === 'Late').length
  };
}

const reportBuilders = {
  Attendance: (data) => [
    ['Present', data.attendance.filter((record) => ['Present', 'On time', 'Late'].includes(record.status)).length],
    ['Late', data.attendance.filter((record) => record.status === 'Late').length],
    ['Absent', data.attendance.filter((record) => record.status === 'Absent').length]
  ],
  Payroll: (data) => ['Approved', 'Pending', 'Rejected'].map((status) => [status, data.invoices.filter((invoice) => invoice.status === status).reduce((sum, invoice) => sum + invoice.amount, 0)]),
  Performance: () => [['Engineering', 89], ['Design', 96], ['Finance', 89], ['Sales', 78], ['Operations', 87]],
  Equipment: (data) => ['In use', 'Available', 'In repair'].map((status) => [status, data.assets.filter((asset) => asset.status === status).length]),
  Meetings: (data) => ['Confirmed', 'Pending'].map((status) => [status, data.meetings.filter((meeting) => meeting.status === status).length])
};

export function createWorkspaceRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/me', (request, response) => response.json({ user: publicUser(request.auth.user) }));

  router.get('/dashboard', (request, response) => {
    const data = request.app.locals.store.data;
    response.json({
      role: request.auth.user.role,
      user: publicUser(request.auth.user),
      notifications: visibleNotifications(data, request.auth.user).filter((notification) => !notification.read).length,
      summary: dashboardSummary(data, request.auth.user)
    });
  });

  router.get('/directory', (request, response) => {
    const query = String(request.query.q ?? '').trim().toLowerCase();
    const people = request.app.locals.store.data.users
      .map((user) => ({ id: user.id, name: user.name, email: user.email, title: user.title, department: user.department, role: user.role }))
      .filter((person) => !query || `${person.name} ${person.department} ${person.title}`.toLowerCase().includes(query));
    response.json({ people });
  });

  router.get('/reports', requireManagement, (request, response) => {
    const type = request.query.type || 'Attendance';
    const builder = reportBuilders[type];
    if (!builder) return response.status(400).json({ error: 'Unknown report type' });
    response.json({ type, points: builder(request.app.locals.store.data).map(([label, value]) => ({ label, value })) });
  });

  router.get('/notifications', (request, response) => {
    response.json({ notifications: visibleNotifications(request.app.locals.store.data, request.auth.user) });
  });

  router.post('/notifications/read', async (request, response, next) => {
    try {
      const notificationId = request.body?.id;
      await request.app.locals.store.mutate((data) => {
        visibleNotifications(data, request.auth.user)
          .filter((item) => !notificationId || item.id === notificationId)
          .forEach((item) => {
            const persisted = data.notifications.find((notification) => notification.id === item.id);
            if (!persisted.readBy.includes(request.auth.user.id)) persisted.readBy.push(request.auth.user.id);
          });
      });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get('/settings', (request, response) => {
    response.json({
      profile: publicUser(request.auth.user),
      organization: request.auth.user.role === 'admin' ? request.app.locals.store.data.organization : undefined
    });
  });

  router.patch('/settings/profile', validate(profileSchema), async (request, response, next) => {
    try {
      let user;
      await request.app.locals.store.mutate((data) => {
        user = data.users.find((candidate) => candidate.id === request.auth.user.id);
        Object.assign(user, request.validated);
        addAuditEntry(data, user.id, 'Updated profile');
      });
      response.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/settings/organization', requireAdministrator, validate(organizationSchema), async (request, response, next) => {
    try {
      await request.app.locals.store.mutate((data) => {
        Object.assign(data.organization, request.validated);
        addAuditEntry(data, request.auth.user.id, 'Updated organization settings');
      });
      response.json({ organization: request.app.locals.store.data.organization });
    } catch (error) {
      next(error);
    }
  });

  router.get('/audit-log', requireAdministrator, (request, response) => {
    const data = request.app.locals.store.data;
    const auditLog = data.auditLog.slice(0, 100).map((entry) => ({
      ...entry,
      actor: entry.actorId ? publicUser(data.users.find((user) => user.id === entry.actorId)) : null
    }));
    response.json({ auditLog });
  });

  return router;
}
