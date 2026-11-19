import { can, canManagePerson, canReviewPerson, assignableRoles, isStaffRole } from '../../../shared/access-control.mjs';
import { env } from '../config/env.js';
import { currentActivitySession, ensureWorkSessionCollections } from './activity.service.js';
import { formatAsset, formatAttendance, formatEquipmentRequest, formatInvoice, formatMeeting, publicUser, publicPerson, visibleNotifications, findUser } from './records.service.js';
import { currentDateKey } from '../utils/ids.js';

const newest = (left, right) => String(right.createdAt ?? right.submittedAt ?? '').localeCompare(String(left.createdAt ?? left.submittedAt ?? ''));
const managedOwner = (data, actor, id) => canManagePerson(actor, findUser(data, id));

export function leaveList(data, actor) {
  return data.leaveRequests.filter((leave) => can(actor, 'reviewLeaves') ? managedOwner(data, actor, leave.employeeId) : leave.employeeId === actor.id)
    .map((leave) => ({ ...leave, employee: publicPerson(findUser(data, leave.employeeId)), decidedByUser: publicPerson(findUser(data, leave.decidedBy)), canReview: can(actor, 'reviewLeaves') && canReviewPerson(actor, findUser(data, leave.employeeId)) }))
    .sort(newest);
}

export function invoiceList(data, actor) {
  return data.invoices.filter((invoice) => invoice.employeeId === actor.id || (invoice.status !== 'Draft' && can(actor, 'reviewInvoices') && managedOwner(data, actor, invoice.employeeId)))
    .map((invoice) => ({ ...formatInvoice(data, invoice), canReview: can(actor, 'reviewInvoices') && canReviewPerson(actor, findUser(data, invoice.employeeId)) })).sort(newest);
}

export function equipmentView(data, actor) {
  return {
    assets: data.assets.filter((asset) => can(actor, 'inventory') || asset.assignedTo === actor.id).map((asset) => formatAsset(data, asset)),
    requests: data.equipmentRequests.filter((item) => item.employeeId === actor.id || (can(actor, 'reviewEquipment') && managedOwner(data, actor, item.employeeId)))
      .map((item) => ({ ...formatEquipmentRequest(data, item), canReview: can(actor, 'reviewEquipment') && canReviewPerson(actor, findUser(data, item.employeeId)) })).sort(newest)
  };
}

export function meetingList(data, actor) {
  return data.meetings.filter((meeting) => can(actor, 'teamAttendance') || meeting.createdBy === actor.id || meeting.participants.includes(actor.id))
    .map((meeting) => formatMeeting(data, meeting)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function administrationView(data, actor) {
  if (!can(actor, 'manageStaff')) return { users: [], roles: [], departments: [] };
  const bases = assignableRoles(actor);
  return {
    users: data.users.filter((person) => canManagePerson(actor, person)).map(publicUser).sort((a, b) => a.name.localeCompare(b.name)),
    roles: data.roles.filter((role) => bases.includes(role.baseRole)),
    departments: [...data.departments].sort((a, b) => a.name.localeCompare(b.name))
  };
}

export function personalAttendance(data, actor) {
  ensureWorkSessionCollections(data);
  const records = data.attendance.filter((record) => record.userId === actor.id).sort((left, right) => right.date.localeCompare(left.date));
  const current = records.find((record) => record.date === currentDateKey() && record.clockIn && !record.clockOut);
  return {
    current: current ? formatAttendance(data, current) : null,
    currentSession: currentActivitySession(data, actor.id),
    records: records.map((record) => formatAttendance(data, record)),
    corrections: data.attendanceCorrections.filter((item) => item.userId === actor.id),
    totals: { totalActiveSeconds: records.reduce((sum, record) => sum + (record.activeSeconds || 0), 0), lateArrivals: records.filter((record) => record.status === 'Late').length },
    activityConfig: { idleAfterSeconds: env.activityIdleMinutes * 60, heartbeatEverySeconds: env.activityHeartbeatSeconds }
  };
}

export function teamAttendance(data, actor, date = currentDateKey()) {
  const records = data.users.filter((person) => person.active !== false && isStaffRole(person.role) && canManagePerson(actor, person)).map((person) => {
    const actual = data.attendance.find((record) => record.userId === person.id && record.date === date);
    const approvedLeave = data.leaveRequests.some((leave) => leave.employeeId === person.id && leave.status === 'Approved' && leave.startDate <= date && leave.endDate >= date);
    const record = actual ? { ...actual, ...(!actual.clockIn && approvedLeave ? { status: 'On leave' } : {}) } : { id: `absent-${person.id}-${date}`, userId: person.id, date, clockIn: null, clockOut: null, breakMinutes: 0, activeSeconds: 0, idleSeconds: 0, status: approvedLeave ? 'On leave' : 'Absent' };
    return formatAttendance(data, record);
  });
  return { date, records };
}

export function dashboardSummary(data, actor) {
  if (!can(actor, 'teamAttendance')) {
    const records = data.attendance.filter((record) => record.userId === actor.id);
    return { totalActiveSeconds: records.reduce((sum, record) => sum + (record.activeSeconds || 0), 0), lateArrivals: records.filter((record) => record.status === 'Late').length };
  }
  const team = teamAttendance(data, actor).records;
  const pending = (items) => items.filter((item) => item.status === 'Pending' && item.canReview).length;
  return {
    totalEmployees: team.length, departmentCount: data.departments.length,
    present: team.filter((item) => item.clockIn).length, late: team.filter((item) => item.status === 'Late').length,
    absent: team.filter((item) => item.status === 'Absent').length, onLeave: team.filter((item) => item.status === 'On leave').length,
    pendingLeaves: pending(leaveList(data, actor)), pendingInvoices: pending(invoiceList(data, actor)), pendingEquipmentRequests: pending(equipmentView(data, actor).requests),
    upcomingMeetings: meetingList(data, actor).filter((item) => new Date(item.startsAt) >= new Date()).length
  };
}

export function auditView(data) {
  return data.auditLog.slice(0, 100).map((entry) => ({ ...entry, actor: publicPerson(findUser(data, entry.actorId)) }));
}

// A single scoped read avoids nine independent serverless snapshots per screen
// refresh. The individual domain routes use these same visibility functions.
export function portalView(data, actor) {
  const notifications = visibleNotifications(data, actor);
  const user = publicUser(actor);
  return {
    user, dashboard: { user, role: actor.role, notifications: notifications.filter((item) => !item.read).length, summary: dashboardSummary(data, actor) },
    attendance: can(actor, 'selfService') ? personalAttendance(data, actor) : null,
    teamAttendance: can(actor, 'teamAttendance') ? teamAttendance(data, actor) : null,
    invoices: invoiceList(data, actor), leaves: leaveList(data, actor), meetings: meetingList(data, actor), equipment: equipmentView(data, actor), notifications,
    directory: data.users.filter((person) => person.active !== false).map(publicPerson),
    administration: administrationView(data, actor), organization: can(actor, 'organization') ? data.organization : null,
    auditLog: can(actor, 'audit') ? auditView(data) : []
  };
}
