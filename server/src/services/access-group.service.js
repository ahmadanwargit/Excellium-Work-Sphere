export const ACCESS_GROUPS = Object.freeze({
  EMPLOYEE: 'employee',
  MANAGEMENT: 'management'
});

const EMPLOYEE_ROLES = new Set(['employee', 'trainer']);
const MANAGEMENT_ROLES = new Set(['manager', 'admin']);

/**
 * Login has two intentional access groups while preserving the existing
 * fine-grained operational roles used for route authorization.
 */
export function accessGroupForRole(role) {
  if (EMPLOYEE_ROLES.has(role)) return ACCESS_GROUPS.EMPLOYEE;
  if (MANAGEMENT_ROLES.has(role)) return ACCESS_GROUPS.MANAGEMENT;
  throw new Error(`Unsupported application role: ${role}`);
}

export function userAccessGroup(user) {
  // The category is derived from the authoritative internal role. Never trust
  // a client-supplied or stale stored category for authorization decisions.
  return accessGroupForRole(user.role);
}

export function hasAccessGroup(user, accessGroup) {
  return userAccessGroup(user) === accessGroup;
}

export function ensureAccessGroups(data) {
  data.users.forEach((user) => {
    user.accessGroup = userAccessGroup(user);
  });
}
