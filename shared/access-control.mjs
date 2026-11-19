// Shared by Express authorization and React navigation. Always use the stored
// base role, not a browser-selected category or a custom role's display name.
export const ROLE_PERMISSIONS = Object.freeze({
  employee: Object.freeze(['selfService', 'attendanceRanking']),
  trainer: Object.freeze(['selfService', 'attendanceRanking', 'scheduleMeetings']),
  manager: Object.freeze(['reviewLeaves', 'reviewInvoices', 'reviewEquipment', 'manageStaff', 'manageDepartments', 'teamAttendance', 'inventory', 'assignEquipment', 'attendanceRanking', 'scheduleMeetings', 'reports']),
  admin: Object.freeze(['reviewLeaves', 'reviewInvoices', 'reviewEquipment', 'manageStaff', 'manageDepartments', 'teamAttendance', 'inventory', 'assignEquipment', 'attendanceRanking', 'scheduleMeetings', 'reports', 'manageRoles', 'organization', 'audit'])
});

export const PERMISSION_LABELS = Object.freeze({
  selfService: 'Own attendance, invoices, leave and equipment requests',
  attendanceRanking: 'View attendance-only rankings and attendance rates',
  scheduleMeetings: 'Schedule meetings; trainers request a meeting with management',
  reviewLeaves: 'Review staff leave applications',
  reviewInvoices: 'Review submitted staff invoices',
  reviewEquipment: 'Review staff equipment requests',
  manageStaff: 'Create, manage and safely remove employee / trainer profiles',
  manageDepartments: 'Create departments, assign employees and remove departments safely',
  teamAttendance: 'View team attendance',
  inventory: 'View company asset inventory',
  assignEquipment: 'Add equipment and assign or reassign it to employees / trainers',
  reports: 'View workforce reports and timelines',
  manageRoles: 'Create/remove custom role presets and assign privileged roles',
  organization: 'Manage organization settings',
  audit: 'View organization audit trail'
});

export const roleOf = (userOrRole) => typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
export const isStaffRole = (role) => ['employee', 'trainer'].includes(role);
export const isAvailablePerson = (person) => Boolean(person && person.active !== false && !person.deletedAt);
export const can = (userOrRole, permission) => (typeof userOrRole === 'string' || isAvailablePerson(userOrRole)) && (ROLE_PERMISSIONS[roleOf(userOrRole)]?.includes(permission) ?? false);
export const permissionsFor = (userOrRole) => Object.keys(PERMISSION_LABELS).filter((permission) => can(userOrRole, permission));
export const assignableRoles = (actor) => can(actor, 'manageRoles') ? ['employee', 'trainer', 'manager', 'admin'] : can(actor, 'manageStaff') ? ['employee', 'trainer'] : [];

// Historical requests remain viewable after a profile is removed. Account
// availability is checked independently for sign-in and new assignments.
export function canManagePerson(actor, person) {
  return Boolean(person && can(actor, 'manageStaff') && (roleOf(actor) === 'admin' || isStaffRole(person.role)));
}
export function canReviewPerson(actor, person) {
  return Boolean(person && actor.id !== person.id && canManagePerson(actor, person));
}
