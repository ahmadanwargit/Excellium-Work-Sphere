import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, formatMeeting, isManager } from '../services/records.service.js';
import { createId } from '../utils/ids.js';
import { HttpError } from '../utils/http-error.js';

const meetingSchema = z.object({
  title: z.string().trim().min(1).max(140),
  startsAt: z.string().trim().min(1).max(40).refine((value) => !Number.isNaN(new Date(value).getTime()), 'Date and time must be valid'),
  participants: z.union([z.string().max(1000), z.array(z.string().max(254))]).optional()
});

function participantIds(data, participants, creatorId) {
  if (!participants) return [creatorId];
  const values = Array.isArray(participants) ? participants : participants.split(',');
  const ids = values.filter(Boolean).map((value) => {
    const reference = value.trim().toLowerCase();
    const user = data.users.find((candidate) => candidate.id === reference || candidate.email.toLowerCase() === reference || candidate.name.toLowerCase() === reference);
    if (!user) throw new HttpError(400, `Unknown participant: ${value.trim()}`);
    return user.id;
  });
  return [...new Set([creatorId, ...ids])];
}

export function createMeetingsRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    const data = request.app.locals.store.data;
    const meetings = (isManager(request.auth.user)
      ? data.meetings
      : data.meetings.filter((meeting) => meeting.createdBy === request.auth.user.id || meeting.participants.includes(request.auth.user.id)))
      .map((meeting) => formatMeeting(data, meeting));
    response.json({ meetings });
  });

  router.post('/', validate(meetingSchema), async (request, response, next) => {
    try {
      let meeting;
      await request.app.locals.store.mutate((data) => {
        const participants = participantIds(data, request.validated.participants, request.auth.user.id);
        meeting = {
          id: createId('mtg'),
          title: request.validated.title,
          startsAt: new Date(request.validated.startsAt).toISOString(),
          participants,
          status: isManager(request.auth.user) ? 'Confirmed' : 'Pending',
          createdBy: request.auth.user.id
        };
        data.meetings.unshift(meeting);
        participants
          .filter((participantId) => participantId !== request.auth.user.id)
          .forEach((participantId) => addNotification(data, { userId: participantId, message: `You were invited to ${meeting.title}` }));
        addAuditEntry(data, request.auth.user.id, `Scheduled meeting: ${meeting.title}`);
      });
      response.status(201).json({ meeting: formatMeeting(request.app.locals.store.data, meeting) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
