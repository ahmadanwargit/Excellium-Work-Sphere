import { Router } from 'express';
import { z } from 'zod';
import { requireAdministrator, requireAuthentication } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, publicUser, findUser } from '../services/records.service.js';
import { createId, currentIso } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';
import { calendarDays, dateOnlySchema } from '../utils/validation.js';

const leaveSchema = z.object({
  type: z.enum(['Annual', 'Sick', 'Casual', 'Unpaid']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  reason: z.string().trim().min(5).max(2000)
}).strict().superRefine((value, context) => {
  const days = calendarDays(value.startDate, value.endDate);
  if (days < 1 || days > 366) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Leave must cover between 1 and 366 calendar days' });
});

const decisionSchema = z.object({
  status: z.enum(['Approved', 'Rejected']),
  reviewNote: z.string().trim().max(1000).default('')
}).strict().refine((value) => value.status !== 'Rejected' || value.reviewNote.length >= 3, {
  path: ['reviewNote'], message: 'Give the employee a reason for rejection'
});

function findLeave(data, id) {
  const leave = data.leaveRequests.find((item) => item.id === id);
  if (!leave) throw notFound('Leave request not found');
  return leave;
}

function formatLeave(data, leave) {
  return { ...leave, employee: publicUser(findUser(data, leave.employeeId)), decidedByUser: publicUser(findUser(data, leave.decidedBy)) };
}

export function createLeavesRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    const data = request.app.locals.store.data;
    const leaves = data.leaveRequests.filter((leave) => request.auth.user.role === 'admin' || leave.employeeId === request.auth.user.id);
    response.json({ leaves: leaves.map((leave) => formatLeave(data, leave)) });
  });

  router.post('/', validate(leaveSchema), async (request, response, next) => {
    try {
      let leave;
      await request.app.locals.store.mutate((data) => {
        const input = request.validated;
        const overlap = data.leaveRequests.some((item) => item.employeeId === request.auth.user.id
          && ['Pending', 'Approved'].includes(item.status) && item.startDate <= input.endDate && item.endDate >= input.startDate);
        if (overlap) throw conflict('You already have a pending or approved leave request for these dates');
        leave = {
          id: createId('leave'), employeeId: request.auth.user.id, ...input,
          days: calendarDays(input.startDate, input.endDate), status: 'Pending', createdAt: currentIso(),
          decidedAt: null, decidedBy: null, reviewNote: ''
        };
        data.leaveRequests.unshift(leave);
        addNotification(data, { audience: ['admin'], message: `${request.auth.user.name} requested ${leave.days} day(s) of ${leave.type.toLowerCase()} leave` });
        addAuditEntry(data, request.auth.user.id, `Applied for leave ${leave.id}`, { eventType: 'LEAVE_REQUEST' });
      });
      response.status(201).json({ leave: formatLeave(request.app.locals.store.data, leave) });
    } catch (error) { next(error); }
  });

  router.patch('/:leaveId', requireAdministrator, validate(decisionSchema), async (request, response, next) => {
    try {
      let leave;
      await request.app.locals.store.mutate((data) => {
        leave = findLeave(data, request.params.leaveId);
        if (leave.employeeId === request.auth.user.id) throw forbidden('An administrator cannot decide their own leave request');
        if (leave.status !== 'Pending') throw conflict('Only pending leave requests can be decided');
        Object.assign(leave, request.validated, { decidedBy: request.auth.user.id, decidedAt: currentIso() });
        addNotification(data, { userId: leave.employeeId, message: `Your ${leave.type.toLowerCase()} leave (${leave.startDate} to ${leave.endDate}) was ${leave.status.toLowerCase()}${leave.reviewNote ? `: ${leave.reviewNote}` : ''}` });
        addAuditEntry(data, request.auth.user.id, `${leave.status} leave ${leave.id}`, { subjectUserId: leave.employeeId, eventType: 'LEAVE_DECISION' });
      });
      response.json({ leave: formatLeave(request.app.locals.store.data, leave) });
    } catch (error) { next(error); }
  });

  router.post('/:leaveId/cancel', validate(z.object({}).strict()), async (request, response, next) => {
    try {
      let leave;
      await request.app.locals.store.mutate((data) => {
        leave = findLeave(data, request.params.leaveId);
        if (leave.employeeId !== request.auth.user.id) throw forbidden('You can only withdraw your own leave request');
        if (leave.status !== 'Pending') throw conflict('Only pending leave requests can be withdrawn');
        leave.status = 'Cancelled';
        addAuditEntry(data, request.auth.user.id, `Withdrew leave ${leave.id}`, { eventType: 'LEAVE_CANCELLED' });
      });
      response.json({ leave: formatLeave(request.app.locals.store.data, leave) });
    } catch (error) { next(error); }
  });

  return router;
}
