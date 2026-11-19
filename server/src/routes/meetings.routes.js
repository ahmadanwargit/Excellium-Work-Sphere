import { Router } from 'express';
import { z } from 'zod';
import { can, isAvailablePerson } from '../../../shared/access-control.mjs';
import { requireAuthentication, requireManagement, requirePermission } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, formatMeeting } from '../services/records.service.js';
import { canConfirmMeeting, meetingList } from '../services/workspace-views.service.js';
import { createId } from '../utils/ids.js';
import { conflict, forbidden, HttpError, notFound } from '../utils/http-error.js';

const meetingSchema = z.object({
  title: z.string().trim().min(1).max(140),
  startsAt: z.string().datetime({ offset: true }),
  participants: z.union([z.string().max(1000), z.array(z.string().min(1).max(254)).max(50)]).optional(),
  meetingType: z.enum(['General', 'Management']).optional(),
  durationMinutes: z.number().int().min(15).max(240).default(30),
  notes: z.string().trim().max(2000).default('')
}).strict();

function participantIds(data, participants, creatorId) {
  if (!participants) return [creatorId];
  const values = Array.isArray(participants) ? participants : participants.split(',');
  const ids = values.map((value) => value.trim()).filter(Boolean).map((value) => {
    const reference = value.toLowerCase();
    const user = data.users.find((candidate) => isAvailablePerson(candidate) && (candidate.id === value || candidate.email.toLowerCase() === reference || candidate.name.toLowerCase() === reference));
    if (!user) throw new HttpError(400, `Unknown or inactive participant: ${value}`);
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
        const actor = request.auth.user;
        const trainer = actor.role === 'trainer';
        const participants = participantIds(data, request.validated.participants, actor.id);
        const meetingType = request.validated.meetingType ?? (trainer ? 'Management' : 'General');
        if (trainer && meetingType !== 'Management') throw forbidden('Trainers can schedule meetings with management, not training sessions');
        if (meetingType === 'Management') {
          const guests = participants.filter((id) => id !== actor.id).map((id) => data.users.find((person) => person.id === id));
          if (!guests.length || guests.some((person) => !can(person, 'manageStaff'))) throw new HttpError(400, 'Select at least one active management or administrator contact for this meeting');
        }
        if (new Date(request.validated.startsAt).getTime() <= Date.now()) throw new HttpError(400, 'Choose a future meeting time');
        meeting = { id: createId('mtg'), title: request.validated.title, startsAt: new Date(request.validated.startsAt).toISOString(), participants, meetingType, durationMinutes: request.validated.durationMinutes, notes: request.validated.notes, status: trainer ? 'Pending' : 'Confirmed', createdBy: actor.id };
        data.meetings.unshift(meeting);
        participants.filter((id) => id !== actor.id).forEach((id) => addNotification(data, { userId: id, message: trainer ? `${actor.name} requested a meeting with you: ${meeting.title} (awaiting confirmation)` : `You were invited to ${meeting.title}` }));
        addAuditEntry(data, actor.id, `${trainer ? 'Requested management meeting' : 'Scheduled meeting'}: ${meeting.title}`, { eventType: 'MEETING_CREATED' });
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
        if (!canConfirmMeeting(meeting, request.auth.user)) throw forbidden('Only an invited management contact or an administrator can confirm this meeting');
        meeting.status = 'Confirmed';
        meeting.participants.forEach((id) => addNotification(data, { userId: id, message: `Meeting confirmed: ${meeting.title}` }));
        addAuditEntry(data, request.auth.user.id, `Confirmed meeting: ${meeting.title}`, { eventType: 'MEETING_CONFIRMED', subjectUserId: meeting.createdBy });
      });
      response.json({ meeting: formatMeeting(request.app.locals.store.data, meeting) });
    } catch (error) { next(error); }
  });
  return router;
}
