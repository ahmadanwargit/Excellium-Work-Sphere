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
  const elapsedSeconds = attendance.clockIn && !attendance.clockOut
    ? Math.max(0, Math.floor((Date.now() - new Date(attendance.clockIn).getTime()) / 1000))
    : 0;
  const workedSeconds = attendance.clockIn
    ? (attendance.clockOut
      ? Math.max(0, Math.floor((new Date(attendance.clockOut) - new Date(attendance.clockIn)) / 1000) - attendance.breakMinutes * 60)
      : Math.max(0, elapsedSeconds - attendance.breakMinutes * 60))
    : 0;

  return {
    ...attendance,
    employee: publicPerson(employee),
    workedMinutes: Math.round(workedSeconds / 60),
    workedLabel: durationLabel(workedSeconds),
    activeLabel: durationLabel((attendance.activeSeconds || 0) + (attendance.clockOut ? 0 : elapsedSeconds)),
    idleLabel: durationLabel(attendance.idleSeconds || 0),
    live: Boolean(attendance.clockIn && !attendance.clockOut)
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
