import { can } from '../../../shared/access-control.mjs';
export { can, canManagePerson, canReviewPerson, PERMISSION_LABELS, permissionsFor } from '../../../shared/access-control.mjs';

export const roleMeta = {
  employee: { label: 'Employee', description: 'Your personal workspace', email: 'john@excellium.com' },
  trainer: { label: 'Trainer', description: 'Self-service and management meetings', email: 'priya@excellium.com' },
  manager: { label: 'Management', description: 'Staff administration and approvals', email: 'daniel@excellium.com' },
  admin: { label: 'Administrator', description: 'Full workforce and access administration', email: 'sara@excellium.com' }
};

export const accessGroupMeta = {
  employee: { label: 'Employee / Trainer', description: 'Your attendance, invoices, leave and meetings', email: 'john@excellium.com' },
  management: { label: 'Admin / Management', description: 'Staff profiles, approvals and organization operations', email: 'sara@excellium.com' }
};

export const pageTitles = {
  dashboard: 'My overview', attendance: 'My attendance', invoices: 'My invoices', leaves: 'My leave',
  meetings: 'My meetings', equipment: 'My equipment', directory: 'Staff directory', rankings: 'Attendance ranking',
  users: 'Employee profiles', roles: 'Roles & permissions', departments: 'Departments', assets: 'Asset inventory',
  reports: 'Workforce reports', organization: 'Organization settings', audit: 'Audit trail',
  notifications: 'Notifications', settings: 'My profile'
};

export function pageTitle(page, role) {
  if (can(role, 'manageStaff')) return ({ dashboard: role === 'admin' ? 'Admin overview' : 'Management overview', attendance: 'Team attendance', invoices: 'Invoice approvals', leaves: 'Leave approvals', meetings: 'Meeting management', equipment: 'Equipment requests' })[page] ?? pageTitles[page];
  if (role === 'trainer' && page === 'meetings') return 'Schedule a meeting with management';
  return pageTitles[page];
}

export function navigationFor(role) {
  const group = (label, pages) => ({ label, pages });
  if (can(role, 'manageStaff')) return [
    group('Overview', ['dashboard']),
    group('People & access', ['users', ...(can(role, 'manageRoles') ? ['roles'] : []), 'departments', 'directory']),
    group('Review & approvals', ['leaves', 'invoices', 'equipment']),
    group('Operations', ['attendance', 'assets', 'meetings']),
    group('Insights & administration', ['rankings', 'reports', ...(can(role, 'organization') ? ['organization', 'audit'] : [])]),
    group('My account', ['settings', 'notifications'])
  ];
  return [
    group(role === 'trainer' ? 'Trainer workspace' : 'Employee workspace', ['dashboard']),
    group('My self-service', ['attendance', 'invoices', 'leaves', 'equipment']),
    group(role === 'trainer' ? 'Meetings & workplace' : 'Workplace', ['meetings', 'rankings', 'directory']),
    group('My account', ['settings', 'notifications'])
  ];
}

export const allowedPages = (role) => navigationFor(role).flatMap((group) => group.pages);

export function initials(name) {
  return name.split(' ').map((part) => part[0]).join('');
}

export function isManager(role) {
  return role === 'manager' || role === 'admin';
}

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date) ? value : date.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function time(value) {
  return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
}

export function relativeTime(value) {
  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  if (difference < 60_000) return 'Just now';
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} min ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} h ago`;
  return formatDateTime(value);
}
