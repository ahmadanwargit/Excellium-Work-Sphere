import { Router } from 'express';
import { z } from 'zod';
import { requireAdministrator, requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { isAvailablePerson } from '../../../shared/access-control.mjs';
import { attendanceRanking } from '../services/attendance-ranking.service.js';
import { meetingList, teamAttendance } from '../services/workspace-views.service.js';
import { addAuditEntry, publicPerson, publicUser, visibleNotifications } from '../services/records.service.js';
import { auditView, dashboardSummary, invoiceList, portalView } from '../services/workspace-views.service.js';

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

const reportBuilders = {
  Attendance: (data, actor) => ['Present', 'Late', 'Absent', 'On leave'].map((status) => [status, teamAttendance(data, actor).records.filter((record) => status === 'Present' ? Boolean(record.clockIn) && record.status !== 'Late' : record.status === status).length]),
  Payroll: (data, actor) => {
    const invoices = invoiceList(data, actor).filter((item) => item.status !== 'Draft');
    return [...new Set(invoices.map((item) => item.currency ?? 'USD'))].flatMap((currency) => ['Approved', 'Pending', 'Rejected'].map((status) => [`${currency} · ${status}`, Math.round(invoices.filter((item) => item.status === status && (item.currency ?? 'USD') === currency).reduce((sum, invoice) => sum + invoice.amount, 0) * 100) / 100]));
  },
  'Attendance ranking': (data) => attendanceRanking(data).departments.map((item) => [item.name, item.attendanceRate]),
  Equipment: (data) => ['In use', 'Available', 'In repair'].map((status) => [status, data.assets.filter((asset) => asset.status === status).length]),
  Meetings: (data, actor) => ['Confirmed', 'Pending'].map((status) => [status, meetingList(data, actor).filter((meeting) => meeting.status === status).length])
};

export function createWorkspaceRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/portal', (request, response) => {
    response.set('Cache-Control', 'private, no-store').json(portalView(request.app.locals.store.data, request.auth.user));
  });

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
      .filter(isAvailablePerson)
      .map(publicPerson)
      .filter((person) => !query || `${person.name} ${person.department} ${person.title}`.toLowerCase().includes(query));
    response.json({ people });
  });

  router.get('/reports', requireManagement, (request, response) => {
    const type = request.query.type || 'Attendance';
    const builder = typeof type === 'string' && Object.hasOwn(reportBuilders, type) ? reportBuilders[type] : null;
    if (!builder) return response.status(400).json({ error: 'Unknown report type' });
    response.json({ type, points: builder(request.app.locals.store.data, request.auth.user).map(([label, value]) => ({ label, value })) });
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
    response.json({ auditLog: auditView(request.app.locals.store.data) });
  });

  return router;
}
