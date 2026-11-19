export const roleMeta = {
  employee: { label: 'Employee', name: 'John Carter', title: 'Software Engineer', description: 'Attendance, pay and tasks', email: 'john@excellium.com', pages: ['dashboard', 'attendance', 'invoices', 'leaves', 'rankings', 'meetings', 'equipment', 'directory'] },
  trainer: { label: 'Trainer', name: 'Priya Nair', title: 'Lead Trainer', description: 'Cohorts and sessions', email: 'priya@excellium.com', pages: ['dashboard', 'attendance', 'invoices', 'leaves', 'rankings', 'meetings', 'equipment', 'directory'] },
  manager: { label: 'Management', name: 'Daniel Okafor', title: 'Operations Manager', description: 'Team and approvals', email: 'daniel@excellium.com', pages: ['dashboard', 'attendance', 'invoices', 'leaves', 'rankings', 'meetings', 'equipment', 'directory', 'reports'] },
  admin: { label: 'Finance / Admin', name: 'Sara Malik', title: 'Finance and Admin', description: 'Payroll, assets, system', email: 'sara@excellium.com', pages: ['dashboard', 'attendance', 'invoices', 'leaves', 'rankings', 'meetings', 'equipment', 'directory', 'reports', 'users'] }
};

// Sign-in deliberately exposes only these broad access categories. The API
// returns the underlying role after authentication for fine-grained features.
export const accessGroupMeta = {
  employee: { label: 'Employee / Trainer', description: 'Your attendance, tasks and personal records', email: 'john@excellium.com' },
  management: { label: 'Admin / Management', description: 'Organization progress, invoices and management data', email: 'daniel@excellium.com' }
};

export const pageTitles = {
  dashboard: 'Dashboard',
  attendance: 'Attendance',
  invoices: 'Salary invoices',
  leaves: 'Leave applications',
  users: 'User administration',
  rankings: 'Performance and rankings',
  meetings: 'Meetings',
  equipment: 'Equipment and assets',
  directory: 'Employee directory',
  reports: 'Reports and analytics',
  notifications: 'Notifications',
  settings: 'Settings'
};

export const people = [
  ['John Carter', 'Engineering', 'Present', 92], ['Aisha Khan', 'Design', 'Present', 96], ['Marcus Lee', 'Engineering', 'Late', 84], ['Elena Petrova', 'Finance', 'Present', 89],
  ['Omar Siddiqui', 'Sales', 'Absent', 78], ['Grace Wu', 'Engineering', 'On leave', 91], ['Tom Becker', 'Operations', 'Present', 87], ['Priya Nair', 'Training', 'Present', 94]
];

export const attendanceLog = [
  ['Fri 13 Nov', '09:02', '17:34', '8h 32m', 'On time'], ['Thu 12 Nov', '09:41', '17:10', '7h 29m', 'Late'],
  ['Wed 11 Nov', '08:55', '16:20', '7h 25m', 'Early departure'], ['Tue 10 Nov', '08:58', '17:30', '8h 32m', 'On time'], ['Mon 9 Nov', '-', '-', '-', 'On leave']
];

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
