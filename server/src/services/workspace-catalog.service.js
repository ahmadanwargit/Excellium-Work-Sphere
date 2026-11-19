import { createHash } from 'node:crypto';

export const SYSTEM_ROLES = Object.freeze([
  { id: 'employee', name: 'Employee', baseRole: 'employee', description: 'Personal attendance, invoices, leave and equipment.', system: true },
  { id: 'trainer', name: 'Trainer', baseRole: 'trainer', description: 'Employee tools plus the training workspace.', system: true },
  { id: 'manager', name: 'Management', baseRole: 'manager', description: 'Team reports, invoice and equipment approvals.', system: true },
  { id: 'admin', name: 'Finance / Admin', baseRole: 'admin', description: 'Management tools, leave approvals and user administration.', system: true }
]);

export function departmentId(name) {
  // Stable identifiers let existing JSON stores and SQL migrations backfill
  // the same department without changing any existing user's department.
  return `dept_${createHash('md5').update(name.trim().toLowerCase()).digest('hex')}`;
}

export function ensureWorkspaceFeatures(data) {
  data.roles ??= SYSTEM_ROLES.map((role) => ({ ...role, createdAt: '2026-01-02T09:00:00.000Z' }));
  data.departments ??= [...new Set(data.users.map((user) => user.department.trim()))].map((name) => ({
    id: departmentId(name), name, createdAt: '2026-01-02T09:00:00.000Z'
  }));
  data.leaveRequests ??= [];
  for (const user of data.users) {
    user.roleId ??= user.role;
    user.roleName = data.roles.find((role) => role.id === user.roleId)?.name ?? user.role;
    user.departmentId ??= data.departments.find((department) => department.name.toLowerCase() === user.department.toLowerCase())?.id ?? null;
    user.phone ??= '';
    user.startDate ??= null;
    user.active ??= true;
  }
  return data;
}
