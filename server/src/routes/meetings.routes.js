import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireManagement, requirePermission } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, formatMeeting, isManager } from '../services/records.service.js';
import { meetingList } from '../services/workspace-views.service.js';
import { createId } from '../utils/ids.js';
import { conflict, HttpError, notFound } from '../utils/http-error.js';

const meetingSchema = z.object({
  title: z.string().trim().min(1).max(140),
  startsAt: z.string().trim().min(1).max(40).refine((value) => !Number.isNaN(new Date(value).getTime()), 'Date and time must be valid'),
  participants: z.union([z.string().max(1000), z.array(z.string().max(254)).max(50)]).optional()
}).strict();

function participantIds(data, participants, creatorId) {
  if (!participants) return [creatorId];
  const values = Array.isArray(participants) ? participants : participants.split(',');
  const ids = values.map((value) => value.trim()).filter(Boolean).map((value) => {
    const reference = value.toLowerCase();
    const user = data.users.find((candidate) => candidate.active !== false && (candidate.id === value || candidate.email.toLowerCase() === reference || candidate.name.toLowerCase() === reference));
    if (!user) throw new HttpError(400, `Unknown or inactive participant: ${value.trim()}`);
    return user.id;
  });
  return [...new Set([creatorId, ...ids])];
}

export function createMeetingsRouter() {
  const router = Router();
  router.use(requireAuthentication);
  router.get('/', (request, response) => response.json({ meetings: meetingList(request.app.locals.store.data, request.auth.user) }));

  router.post('/', requirePermission('scheduleMeetings'), validate(meetingSchema), async (request, response, next) => {
    try {
      let meeting;
      await request.app.locals.store.mutate((data) => {
        const participants = participantIds(data, request.validated.participants, request.auth.user.id);
        meeting = { id: createId('mtg'), title: request.validated.title, startsAt: new Date(request.validated.startsAt).toISOString(), participants, status: isManager(request.auth.user) ? 'Confirmed' : 'Pending', createdBy: request.auth.user.id };
        data.meetings.unshift(meeting);
        if (meeting.status === 'Pending') addNotification(data, { audience: ['manager', 'admin'], message: `${request.auth.user.name} requested training session: ${meeting.title}` });
        participants.filter((id) => id !== request.auth.user.id).forEach((id) => addNotification(data, { userId: id, message: `You were invited to ${meeting.title}${meeting.status === 'Pending' ? ' (awaiting confirmation)' : ''}` }));
        addAuditEntry(data, request.auth.user.id, `Scheduled meeting: ${meeting.title}`);
      });
      response.status(201).json({ meeting: formatMeeting(request.app.locals.store.data, meeting) });
    } catch (error) { next(error); }
  });

  router.patch('/:meetingId', requireManagement, validate(z.object({ status: z.literal('Confirmed') }).strict()), async (request, response, next) => {
    try {
      let meeting;
      await request.app.locals.store.mutate((data) => {
        meeting = data.meetings.find((item) => item.id === request.params.meetingId);
        if (!meeting) throw notFound('Meeting not found');
        if (meeting.status !== 'Pending') throw conflict('Only pending meeting requests can be confirmed');
        meeting.status = 'Confirmed';
        meeting.participants.forEach((id) => addNotification(data, { userId: id, message: `Meeting confirmed: ${meeting.title}` }));
        addAuditEntry(data, request.auth.user.id, `Confirmed meeting: ${meeting.title}`);
      });
      response.json({ meeting: formatMeeting(request.app.locals.store.data, meeting) });
    } catch (error) { next(error); }
  });
  return router;
}
