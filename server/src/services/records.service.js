import { createId, currentIso } from '../utils/ids.js';
import { userAccessGroup } from './access-group.service.js';
import { permissionsFor } from '../../../shared/access-control.mjs';

export function isManager(user) {
  return user.role === 'manager' || user.role === 'admin';
}

export function isAdmin(user) {
  return user.role === 'admin';
}

export function findUser(data, userId) {
  return data.users.find((user) => user.id === userId);
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return { ...safeUser, accessGroup: userAccessGroup(user), permissions: permissionsFor(user) };
}

export function publicPerson(user) {
  if (!user) return null;
  const { id, name, email, title, department, departmentId, role, roleId, roleName } = user;
  return { id, name, email, title, department, departmentId, role, roleId, roleName };
}

export function addNotification(data, { userId = null, audience = [], message }) {
  const notification = {
    id: createId('ntf'),
    userId,
    audience,
    message,
    createdAt: currentIso(),
    readBy: []
  };
  data.notifications.unshift(notification);
  return notification;
}

export function addAuditEntry(data, actorId, action, { subjectUserId = actorId, sessionId = null, breakLogId = null, eventType = 'GENERAL' } = {}) {
  data.auditLog.unshift({
    id: createId('aud'),
    timestamp: currentIso(),
    actorId: actorId ?? null,
    subjectUserId: subjectUserId ?? null,
    sessionId,
    breakLogId,
    eventType,
    action
  });
}

export function visibleNotifications(data, user) {
  return data.notifications
    .filter((notification) => notification.userId === user.id || (!notification.userId && notification.audience.includes(user.role)))
    .map((notification) => ({ ...notification, read: notification.readBy.includes(user.id) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function durationLabel(seconds) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(rounded / 3600)}h ${String(Math.floor(rounded / 60) % 60).padStart(2, '0')}m`;
}

export function formatAttendance(data, attendance) {
  const employee = findUser(data, attendance.userId);
  const now = Date.now();
  const endOfDay = new Date(`${attendance.date}T00:00:00Z`).getTime() + 86_400_000;
  const duration = (clockIn, clockOut, breakSeconds) => Math.max(0, Math.floor((Math.min(clockOut ? new Date(clockOut).getTime() : now, endOfDay) - new Date(clockIn).getTime()) / 1000) - (breakSeconds || 0));
  const sessions = (data.workSessions ?? []).filter((session) => session.userId === attendance.userId && session.workDate === attendance.date);
  const incomplete = now >= endOfDay && (sessions.length ? sessions.some((session) => !session.clockOut) : Boolean(attendance.clockIn && !attendance.clockOut));
  const ongoingBreakSeconds = (startedAt) => startedAt ? Math.max(0, Math.floor((Math.min(now, endOfDay) - new Date(startedAt).getTime()) / 1000)) : 0;
  const workedSeconds = sessions.length
    ? sessions.reduce((sum, session) => {
      const activeBreak = (data.breakLogs ?? []).find((item) => item.sessionId === session.id && !item.endedAt);
      return sum + duration(session.clockIn, session.clockOut, (session.breakSeconds || 0) + ongoingBreakSeconds(activeBreak?.startedAt));
    }, 0)
    : attendance.clockIn ? duration(attendance.clockIn, attendance.clockOut, attendance.breakMinutes * 60 + ongoingBreakSeconds(attendance.breakStartedAt)) : 0;

  return {
    ...attendance,
    employee: publicPerson(employee),
    incomplete,
    workedMinutes: incomplete ? null : Math.round(workedSeconds / 60),
    workedLabel: incomplete ? 'Incomplete · no clock-out' : durationLabel(workedSeconds),
    activeLabel: durationLabel(attendance.activeSeconds || 0),
    idleLabel: durationLabel(attendance.idleSeconds || 0),
    live: Boolean(attendance.clockIn && !attendance.clockOut && now < endOfDay)
  };
}

export function formatInvoice(data, invoice) {
  return {
    ...invoice,
    employee: publicPerson(findUser(data, invoice.employeeId)),
    decidedByUser: publicPerson(findUser(data, invoice.decidedBy))
  };
}

export function formatEquipmentRequest(data, request) {
  return {
    ...request,
    employee: publicPerson(findUser(data, request.employeeId)),
    decidedByUser: publicPerson(findUser(data, request.decidedBy))
  };
}

export function formatAsset(data, asset) {
  return { ...asset, assignee: publicPerson(findUser(data, asset.assignedTo)) };
}

export function formatMeeting(data, meeting) {
  return {
    ...meeting,
    creator: publicPerson(findUser(data, meeting.createdBy)),
    participantDetails: meeting.participants.map((id) => publicPerson(findUser(data, id))).filter(Boolean)
  };
}
