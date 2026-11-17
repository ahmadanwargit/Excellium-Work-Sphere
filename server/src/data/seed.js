import { scryptSync } from 'node:crypto';
import { accessGroupForRole } from '../services/access-group.service.js';

const DEMO_PASSWORD = 'password123';

function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function seededUser({ id, email, name, role, title, department }) {
  const passwordSalt = `excellium-demo-${id}-v1`;
  return {
    id,
    email,
    name,
    role,
    accessGroup: accessGroupForRole(role),
    title,
    department,
    passwordSalt,
    passwordHash: passwordHash(DEMO_PASSWORD, passwordSalt),
    createdAt: '2026-01-02T09:00:00.000Z'
  };
}

/**
 * Returns a fresh, serialisable starting point for the local demo database.
 * Runtime mutations are written to data/store.json, which is deliberately
 * untracked so a developer can reset the demo by deleting that file.
 */
export function createSeed() {
  const users = [
    seededUser({ id: 'usr_john', email: 'john@excellium.com', name: 'John Carter', role: 'employee', title: 'Software Engineer', department: 'Engineering' }),
    seededUser({ id: 'usr_priya', email: 'priya@excellium.com', name: 'Priya Nair', role: 'trainer', title: 'Lead Trainer', department: 'Training' }),
    seededUser({ id: 'usr_daniel', email: 'daniel@excellium.com', name: 'Daniel Okafor', role: 'manager', title: 'Operations Manager', department: 'Operations' }),
    seededUser({ id: 'usr_sara', email: 'sara@excellium.com', name: 'Sara Malik', role: 'admin', title: 'Finance and Admin', department: 'Finance' }),
    seededUser({ id: 'usr_aisha', email: 'aisha@excellium.com', name: 'Aisha Khan', role: 'employee', title: 'Product Designer', department: 'Design' }),
    seededUser({ id: 'usr_marcus', email: 'marcus@excellium.com', name: 'Marcus Lee', role: 'employee', title: 'Software Engineer', department: 'Engineering' }),
    seededUser({ id: 'usr_elena', email: 'elena@excellium.com', name: 'Elena Petrova', role: 'employee', title: 'Financial Analyst', department: 'Finance' }),
    seededUser({ id: 'usr_omar', email: 'omar@excellium.com', name: 'Omar Siddiqui', role: 'employee', title: 'Account Executive', department: 'Sales' }),
    seededUser({ id: 'usr_grace', email: 'grace@excellium.com', name: 'Grace Wu', role: 'employee', title: 'Platform Engineer', department: 'Engineering' }),
    seededUser({ id: 'usr_tom', email: 'tom@excellium.com', name: 'Tom Becker', role: 'employee', title: 'Operations Specialist', department: 'Operations' })
  ];

  return {
    schemaVersion: 1,
    organization: {
      name: 'Excellium Global Services',
      workWeek: 'Mon to Fri',
      standardStartTime: '09:00',
      inactivityLockMinutes: 3
    },
    users,
    attendance: [
      { id: 'att_1001', userId: 'usr_john', date: '2026-11-13', clockIn: '2026-11-13T09:02:00.000Z', clockOut: '2026-11-13T17:34:00.000Z', breakMinutes: 30, status: 'On time', activeSeconds: 28120, idleSeconds: 520 },
      { id: 'att_1002', userId: 'usr_john', date: '2026-11-12', clockIn: '2026-11-12T09:41:00.000Z', clockOut: '2026-11-12T17:10:00.000Z', breakMinutes: 30, status: 'Late', activeSeconds: 24480, idleSeconds: 780 },
      { id: 'att_1003', userId: 'usr_john', date: '2026-11-11', clockIn: '2026-11-11T08:55:00.000Z', clockOut: '2026-11-11T16:20:00.000Z', breakMinutes: 30, status: 'Early departure', activeSeconds: 24300, idleSeconds: 900 },
      { id: 'att_1004', userId: 'usr_john', date: '2026-11-10', clockIn: '2026-11-10T08:58:00.000Z', clockOut: '2026-11-10T17:30:00.000Z', breakMinutes: 30, status: 'On time', activeSeconds: 27920, idleSeconds: 420 },
      { id: 'att_1005', userId: 'usr_aisha', date: '2026-11-16', clockIn: '2026-11-16T08:57:00.000Z', clockOut: null, breakMinutes: 0, status: 'Present', activeSeconds: 22140, idleSeconds: 1320 },
      { id: 'att_1006', userId: 'usr_marcus', date: '2026-11-16', clockIn: '2026-11-16T09:42:00.000Z', clockOut: null, breakMinutes: 15, status: 'Late', activeSeconds: 18120, idleSeconds: 2460 },
      { id: 'att_1007', userId: 'usr_elena', date: '2026-11-16', clockIn: '2026-11-16T08:49:00.000Z', clockOut: null, breakMinutes: 0, status: 'Present', activeSeconds: 23520, idleSeconds: 810 },
      { id: 'att_1008', userId: 'usr_omar', date: '2026-11-16', clockIn: null, clockOut: null, breakMinutes: 0, status: 'Absent', activeSeconds: 0, idleSeconds: 0 },
      { id: 'att_1009', userId: 'usr_grace', date: '2026-11-16', clockIn: null, clockOut: null, breakMinutes: 0, status: 'On leave', activeSeconds: 0, idleSeconds: 0 },
      { id: 'att_1010', userId: 'usr_tom', date: '2026-11-16', clockIn: '2026-11-16T08:58:00.000Z', clockOut: null, breakMinutes: 0, status: 'Present', activeSeconds: 20880, idleSeconds: 900 }
    ],
    attendanceCorrections: [],
    // Activity-tracking data is intentionally stored as separate, typed
    // collections. It is never folded into a whole-workspace state document.
    workSessions: [],
    breakLogs: [],
    activityHeartbeats: [],
    activitySamples: [],
    activityFlags: [],
    invoices: [
      { id: 'INV-1042', employeeId: 'usr_john', month: 'October 2026', amount: 4200, status: 'Approved', paymentDetails: 'Payroll transfer', documentName: null, submittedAt: '2026-10-28T08:00:00.000Z', decidedAt: '2026-10-29T10:42:00.000Z', decidedBy: 'usr_sara' },
      { id: 'INV-1031', employeeId: 'usr_john', month: 'September 2026', amount: 4200, status: 'Approved', paymentDetails: 'Payroll transfer', documentName: null, submittedAt: '2026-09-27T08:00:00.000Z', decidedAt: '2026-09-28T11:20:00.000Z', decidedBy: 'usr_sara' },
      { id: 'INV-1050', employeeId: 'usr_aisha', month: 'October 2026', amount: 4800, status: 'Pending', paymentDetails: 'Payroll transfer', documentName: null, submittedAt: '2026-10-31T08:00:00.000Z', decidedAt: null, decidedBy: null },
      { id: 'INV-1051', employeeId: 'usr_marcus', month: 'October 2026', amount: 3900, status: 'Pending', paymentDetails: 'Payroll transfer', documentName: null, submittedAt: '2026-10-31T08:00:00.000Z', decidedAt: null, decidedBy: null },
      { id: 'INV-1049', employeeId: 'usr_omar', month: 'October 2026', amount: 3600, status: 'Rejected', paymentDetails: 'Payroll transfer', documentName: null, submittedAt: '2026-10-30T08:00:00.000Z', decidedAt: '2026-10-30T15:00:00.000Z', decidedBy: 'usr_sara' }
    ],
    meetings: [
      { id: 'mtg_101', title: 'Sprint planning', startsAt: '2026-11-16T10:00:00.000Z', participants: ['usr_john', 'usr_daniel', 'usr_marcus', 'usr_grace'], status: 'Confirmed', createdBy: 'usr_daniel' },
      { id: 'mtg_102', title: '1:1 with manager', startsAt: '2026-11-17T14:30:00.000Z', participants: ['usr_john', 'usr_daniel'], status: 'Pending', createdBy: 'usr_daniel' },
      { id: 'mtg_103', title: 'Onboarding cohort 7', startsAt: '2026-11-18T09:00:00.000Z', participants: ['usr_priya', 'usr_omar'], status: 'Confirmed', createdBy: 'usr_priya' }
    ],
    equipmentRequests: [
      { id: 'REQ-88', employeeId: 'usr_john', item: 'Laptop battery', type: 'Repair', reason: 'Battery health is degraded.', status: 'Pending', createdAt: '2026-11-15T10:00:00.000Z', decidedAt: null, decidedBy: null },
      { id: 'REQ-84', employeeId: 'usr_grace', item: 'Monitor 27"', type: 'Upgrade', reason: 'Required for platform monitoring.', status: 'Approved', createdAt: '2026-11-11T10:00:00.000Z', decidedAt: '2026-11-12T13:00:00.000Z', decidedBy: 'usr_daniel' }
    ],
    assets: [
      { id: 'AST-2041', name: 'MacBook Pro 14"', type: 'Laptop', serialNumber: 'C02XK1', assignedTo: 'usr_john', status: 'In use', issuedOn: '2025-01-12' },
      { id: 'AST-1190', name: 'Dell U2723QE', type: 'Monitor', serialNumber: 'CN8841', assignedTo: 'usr_grace', status: 'In use', issuedOn: '2025-01-12' },
      { id: 'AST-3302', name: 'iPhone 14', type: 'Phone', serialNumber: 'IP14-3302', assignedTo: 'usr_tom', status: 'In repair', issuedOn: '2025-04-04' },
      { id: 'AST-2077', name: 'ThinkPad T14', type: 'Laptop', serialNumber: 'TP-2077', assignedTo: null, status: 'Available', issuedOn: null },
      { id: 'AST-4410', name: 'Logitech MX Keys', type: 'Keyboard', serialNumber: 'MX-4410', assignedTo: 'usr_aisha', status: 'In use', issuedOn: '2025-05-18' }
    ],
    notifications: [
      { id: 'ntf_1001', userId: null, audience: ['manager', 'admin'], message: 'Invoice INV-1050 is waiting for approval', createdAt: '2026-11-16T09:50:00.000Z', readBy: [] },
      { id: 'ntf_1002', userId: null, audience: ['trainer', 'manager', 'admin'], message: 'Onboarding cohort 7 starts Wednesday', createdAt: '2026-11-16T08:00:00.000Z', readBy: [] },
      { id: 'ntf_1003', userId: null, audience: ['manager', 'admin'], message: 'Marcus Lee clocked in late', createdAt: '2026-11-16T09:42:00.000Z', readBy: ['usr_daniel'] },
      { id: 'ntf_1004', userId: null, audience: ['employee', 'trainer', 'manager', 'admin'], message: 'Policy update: remote work days', createdAt: '2026-11-15T09:00:00.000Z', readBy: [] }
    ],
    auditLog: [
      { id: 'aud_1001', timestamp: '2026-11-16T10:42:00.000Z', actorId: 'usr_sara', action: 'Approved INV-1042' },
      { id: 'aud_1002', timestamp: '2026-11-16T09:15:00.000Z', actorId: 'usr_daniel', action: 'Updated role: Trainer' },
      { id: 'aud_1003', timestamp: '2026-11-15T23:00:00.000Z', actorId: null, action: 'Backup completed' }
    ]
  };
}
