import { createHash } from 'node:crypto';

export const SYSTEM_ROLES = Object.freeze([
  { id: 'employee', name: 'Employee', baseRole: 'employee', description: 'Personal attendance, invoices, leave, equipment and invited meetings.', system: true },
  { id: 'trainer', name: 'Trainer', baseRole: 'trainer', description: 'Employee self-service plus training session requests.', system: true },
  { id: 'manager', name: 'Management', baseRole: 'manager', description: 'Staff leave, invoice and equipment approvals, employee profiles, team attendance and reports.', system: true },
  { id: 'admin', name: 'Finance / Admin', baseRole: 'admin', description: 'Full management workspace plus privileged role assignment, role creation, organization settings and audit trail.', system: true }
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
  for (const role of data.roles) {
    const builtIn = SYSTEM_ROLES.find((item) => item.id === role.id);
    if (builtIn && role.system) role.description = builtIn.description;
  }
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
