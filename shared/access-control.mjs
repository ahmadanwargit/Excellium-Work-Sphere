// One permission policy for the Express guards and React navigation. Permission
// decisions use the persisted base role, never a form's selected login category.
export const ROLE_PERMISSIONS = Object.freeze({
  employee: Object.freeze(['selfService']),
  trainer: Object.freeze(['selfService', 'scheduleMeetings']),
  manager: Object.freeze(['reviewLeaves', 'reviewInvoices', 'reviewEquipment', 'manageStaff', 'manageDepartments', 'teamAttendance', 'inventory', 'scheduleMeetings', 'reports']),
  admin: Object.freeze(['reviewLeaves', 'reviewInvoices', 'reviewEquipment', 'manageStaff', 'manageDepartments', 'teamAttendance', 'inventory', 'scheduleMeetings', 'reports', 'manageRoles', 'organization', 'audit'])
});

export const PERMISSION_LABELS = Object.freeze({
  selfService: 'Own attendance, invoices, leave and equipment requests',
  scheduleMeetings: 'Schedule meetings or request training sessions',
  reviewLeaves: 'Review staff leave applications',
  reviewInvoices: 'Review submitted staff invoices',
  reviewEquipment: 'Review staff equipment requests',
  manageStaff: 'Create and manage employee / trainer profiles',
  manageDepartments: 'Create departments',
  teamAttendance: 'View team attendance',
  inventory: 'View company asset inventory',
  reports: 'View workforce reports and timelines',
  manageRoles: 'Create role presets and assign privileged roles',
  organization: 'Manage organization settings',
  audit: 'View organization audit trail'
});

export const roleOf = (userOrRole) => typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
export const isStaffRole = (role) => ['employee', 'trainer'].includes(role);
export const can = (userOrRole, permission) => ROLE_PERMISSIONS[roleOf(userOrRole)]?.includes(permission) ?? false;
export const permissionsFor = (userOrRole) => [...(ROLE_PERMISSIONS[roleOf(userOrRole)] ?? [])];
export const assignableRoles = (actor) => roleOf(actor) === 'admin' ? ['employee', 'trainer', 'manager', 'admin'] : can(actor, 'manageStaff') ? ['employee', 'trainer'] : [];

// Managers administer staff, not peers or administrators. Full admins can view
// all personnel; self-decisions and last-admin changes have additional guards.
export function canManagePerson(actor, person) {
  return Boolean(person && can(actor, 'manageStaff') && (roleOf(actor) === 'admin' || isStaffRole(person.role)));
}

export function canReviewPerson(actor, person) {
  return Boolean(person && actor.id !== person.id && canManagePerson(actor, person));
}
