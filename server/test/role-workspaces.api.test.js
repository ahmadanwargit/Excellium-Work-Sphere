import assert from 'node:assert/strict';
import test from 'node:test';
import { createApi } from './helpers/api.js';

const leave = { type: 'Annual', startDate: '2026-12-21', endDate: '2026-12-23', reason: 'Family commitments for the holidays' };

test('Daniel management sees employee AND trainer leave submissions and can review them, not apply', async (t) => {
  const { request, login } = await createApi(t);
  const manager = await login('daniel@excellium.com', 'management');
  const employee = await login();
  const trainer = await login('priya@excellium.com');
  const ids = [];
  for (const cookie of [employee, trainer]) {
    const created = await request('/api/leaves', { method: 'POST', cookie, body: leave });
    assert.equal(created.status, 201);
    ids.push((await created.json()).leave.id);
  }
  const queue = (await (await request('/api/leaves', { cookie: manager })).json()).leaves;
  assert.ok(ids.every((id) => queue.some((item) => item.id === id && item.canReview)));
  const portal = await (await request('/api/portal', { cookie: manager })).json();
  assert.equal(portal.dashboard.summary.pendingLeaves, 2);
  assert.equal(portal.attendance, null, 'the management workspace must not contain personal clock controls');
  assert.ok(portal.user.permissions.includes('reviewLeaves'));
  assert.ok(!portal.user.permissions.includes('selfService'));
  assert.equal((await request('/api/leaves', { method: 'POST', cookie: manager, body: leave })).status, 403);
  const approved = await request(`/api/leaves/${ids[1]}`, { method: 'PATCH', cookie: manager, body: { status: 'Approved', reviewNote: 'Coverage arranged' } });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).leave.decidedBy, 'usr_daniel');
  const personal = await (await request('/api/portal', { cookie: trainer })).json();
  assert.equal(personal.leaves.length, 1);
  assert.equal(personal.leaves[0].status, 'Approved');
  assert.equal(personal.leaves[0].canReview, false);
  assert.equal(personal.dashboard.user.role, 'trainer');
  assert.deepEqual(personal.administration, { users: [], roles: [], departments: [] });
  assert.equal(personal.organization, null);
  assert.deepEqual(personal.auditLog, []);
  assert.ok(personal.notifications.some((item) => item.message.includes('approved')));
  const notices = await (await request('/api/notifications', { cookie: manager })).json();
  assert.ok(notices.notifications.some((item) => item.message.includes('Priya Nair requested')));
});

test('management creates working staff portals but cannot grant privileged roles or edit administrators', async (t) => {
  const { request, login } = await createApi(t);
  const manager = await login('daniel@excellium.com', 'management');
  const admin = await login('sara@excellium.com', 'management');
  const catalog = await (await request('/api/admin/users', { cookie: manager })).json();
  assert.ok(catalog.users.length > 0);
  assert.ok(catalog.users.every((user) => ['employee', 'trainer'].includes(user.role)));
  assert.deepEqual(catalog.roles.map((role) => role.baseRole).sort(), ['employee', 'trainer']);
  const body = { name: 'New Trainer', email: 'manager.created@example.test', title: 'Training Specialist', roleId: 'trainer', departmentId: catalog.departments[0].id, password: 'StaffPortal!234' };
  const created = await request('/api/admin/users', { method: 'POST', cookie: manager, body });
  assert.equal(created.status, 201);
  const user = (await created.json()).user;
  const cookie = await login(body.email, 'employee', body.password);
  const personal = await (await request('/api/portal', { cookie })).json();
  assert.equal(personal.user.role, 'trainer');
  assert.ok(personal.user.permissions.includes('scheduleMeetings'));
  assert.ok(!personal.user.permissions.includes('manageStaff'));
  assert.equal((await request('/api/admin/users', { cookie })).status, 403);
  assert.equal((await request('/api/admin/users', { method: 'POST', cookie: manager, body: { ...body, email: 'forged.admin@example.test', roleId: 'admin' } })).status, 403);
  const edit = { name: body.name, email: body.email, title: body.title, roleId: 'admin', departmentId: body.departmentId, active: true };
  assert.equal((await request(`/api/admin/users/${user.id}`, { method: 'PATCH', cookie: manager, body: edit })).status, 403);
  assert.equal((await request('/api/admin/users/usr_sara', { method: 'PATCH', cookie: manager, body: { ...edit, roleId: 'employee' } })).status, 403);
  const custom = await request('/api/admin/users/roles', { method: 'POST', cookie: admin, body: { name: 'Privileged preset', baseRole: 'admin' } });
  assert.equal(custom.status, 201);
  assert.equal((await request('/api/admin/users', { method: 'POST', cookie: manager, body: { ...body, email: 'custom.escalation@example.test', roleId: (await custom.json()).role.id } })).status, 403);
  assert.equal((await request('/api/admin/users/roles', { method: 'POST', cookie: manager, body: { name: 'No escalation', baseRole: 'employee' } })).status, 403);
});

test('server enforces separate self-service, trainer scheduling and management actions', async (t) => {
  const { request, login } = await createApi(t);
  const staff = await login();
  const trainer = await login('priya@excellium.com');
  const manager = await login('daniel@excellium.com', 'management');
  const admin = await login('sara@excellium.com', 'management');
  for (const cookie of [manager, admin]) {
    for (const [path, body] of [
      ['/api/invoices', { month: 'December', amount: 100 }], ['/api/leaves', leave],
      ['/api/equipment/requests', { item: 'Laptop', type: 'Repair', reason: 'Issue' }], ['/api/attendance/clock-in', {}],
      ['/api/attendance/corrections', { date: '2026-12-01', reason: 'Correction' }], ['/api/activity/heartbeat', {}]
    ]) assert.equal((await request(path, { method: 'POST', cookie, body })).status, 403, path);
  }
  for (const cookie of [staff, trainer]) {
    for (const path of ['/api/admin/users', '/api/attendance/team', '/api/admin/reports/daily', '/api/audit-log']) assert.equal((await request(path, { cookie })).status, 403, path);
    assert.equal((await request('/api/leaves/missing', { method: 'PATCH', cookie, body: { status: 'Approved' } })).status, 403);
  }
  const meeting = { title: 'Training request', startsAt: '2026-12-01T10:00:00.000Z', participants: 'john@excellium.com' };
  assert.equal((await request('/api/meetings', { method: 'POST', cookie: staff, body: meeting })).status, 403);
  const created = await request('/api/meetings', { method: 'POST', cookie: trainer, body: meeting });
  assert.equal(created.status, 201);
  const scheduled = (await created.json()).meeting;
  assert.equal(scheduled.status, 'Pending');
  assert.equal((await request(`/api/meetings/${scheduled.id}`, { method: 'PATCH', cookie: trainer, body: { status: 'Confirmed' } })).status, 403);
  assert.equal((await request(`/api/meetings/${scheduled.id}`, { method: 'PATCH', cookie: manager, body: { status: 'Confirmed' } })).status, 200);
  assert.equal((await request('/api/settings/organization', { method: 'PATCH', cookie: manager, body: { name: 'Unauthorized' } })).status, 403);
});

test('existing sessions use changed stored roles; no category or permission field can elevate access', async (t) => {
  const { request, login } = await createApi(t);
  const admin = await login('sara@excellium.com', 'management');
  const cookie = await login();
  const people = (await (await request('/api/admin/users', { cookie: admin })).json()).users;
  const john = people.find((user) => user.id === 'usr_john');
  const edit = { name: john.name, email: john.email, title: john.title, departmentId: john.departmentId, active: true, roleId: 'manager' };
  assert.equal((await request('/api/admin/users/usr_john', { method: 'PATCH', cookie: admin, body: edit })).status, 200);
  let portal = await (await request('/api/portal', { cookie })).json();
  assert.ok(portal.user.permissions.includes('reviewLeaves'));
  assert.equal(portal.attendance, null);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: john.email, password: 'password123', accessGroup: 'employee' } })).status, 403);
  assert.equal((await request('/api/admin/users/usr_john', { method: 'PATCH', cookie: admin, body: { ...edit, roleId: 'employee' } })).status, 200);
  portal = await (await request('/api/portal', { cookie })).json();
  assert.ok(portal.user.permissions.includes('selfService'));
  assert.deepEqual(portal.administration.users, []);
  assert.equal((await request('/api/admin/users', { cookie })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: john.email, password: 'password123', accessGroup: 'employee', permissions: ['manageStaff'] } })).status, 400);
});

test('management cannot self-review historical requests or read privileged peers outside staff scope', async (t) => {
  const { request, login, store } = await createApi(t);
  const manager = await login('daniel@excellium.com', 'management');
  const admin = await login('sara@excellium.com', 'management');
  const staff = await login();
  await store.mutate((data) => {
    for (const [key, owner] of [['manager', 'usr_daniel'], ['admin', 'usr_sara']]) {
      data.invoices.push({ ...data.invoices[0], id: `historical_invoice_${key}`, employeeId: owner, status: 'Pending' });
      data.equipmentRequests.push({ ...data.equipmentRequests[0], id: `historical_equipment_${key}`, employeeId: owner, status: 'Pending' });
      data.leaveRequests.push({ id: `historical_leave_${key}`, employeeId: owner, ...leave, days: 3, status: 'Pending', createdAt: new Date().toISOString() });
    }
  });
  for (const [cookie, key] of [[manager, 'manager'], [admin, 'admin']]) {
    for (const path of [`/api/invoices/historical_invoice_${key}`, `/api/equipment/requests/historical_equipment_${key}`, `/api/leaves/historical_leave_${key}`]) {
      assert.equal((await request(path, { method: 'PATCH', cookie, body: { status: 'Approved' } })).status, 403, path);
    }
  }
  for (const path of ['/api/invoices/historical_invoice_admin', '/api/equipment/requests/historical_equipment_admin', '/api/leaves/historical_leave_admin']) {
    assert.equal((await request(path, { method: 'PATCH', cookie: manager, body: { status: 'Approved' } })).status, 403);
  }
  assert.equal((await request('/api/invoices/historical_invoice_admin/pdf', { cookie: manager })).status, 403);
  assert.equal((await request('/api/invoices/historical_invoice_manager/pdf', { cookie: staff })).status, 403);
  assert.equal((await request('/api/equipment/requests/historical_equipment_admin/attachment', { cookie: manager })).status, 403);
  assert.equal((await request('/api/admin/logs/usr_sara', { cookie: manager })).status, 403);
  const reports = await (await request('/api/admin/reports/daily', { cookie: manager })).json();
  assert.ok(reports.reports.every((row) => ['employee', 'trainer'].includes(row.employee.role)));
  assert.equal((await request('/api/invoices/historical_invoice_manager', { method: 'PATCH', cookie: admin, body: { status: 'Approved' } })).status, 200);
});

test('scoped portal contains no credentials, restricted administration or private directory profile details', async (t) => {
  const { request, login } = await createApi(t);
  assert.equal((await request('/api/portal')).status, 401);
  for (const [email, group] of [['john@excellium.com', 'employee'], ['priya@excellium.com', 'employee'], ['daniel@excellium.com', 'management'], ['sara@excellium.com', 'management']]) {
    const cookie = await login(email, group);
    const response = await request('/api/portal', { cookie });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private.*no-store/);
    const portal = await response.json();
    assert.doesNotMatch(JSON.stringify(portal), /passwordHash|passwordSalt/);
    assert.ok(portal.directory.every((person) => !('phone' in person) && !('startDate' in person)));
    if (portal.user.role !== 'admin') { assert.equal(portal.organization, null); assert.deepEqual(portal.auditLog, []); }
    if (group === 'employee') {
      assert.equal(portal.teamAttendance, null);
      assert.deepEqual(portal.administration, { users: [], roles: [], departments: [] });
      assert.ok(portal.invoices.every((invoice) => invoice.employeeId === portal.user.id));
      assert.ok(portal.equipment.requests.every((item) => item.employeeId === portal.user.id));
      assert.ok(portal.equipment.assets.every((asset) => asset.assignedTo === portal.user.id));
    } else {
      assert.equal(portal.attendance, null);
      assert.ok(portal.teamAttendance.records.every((record) => ['employee', 'trainer'].includes(record.employee.role)));
      assert.equal((await request('/api/attendance/team?date=2026-02-30', { cookie })).status, 400);
      assert.equal((await request('/api/admin/reports/daily?date=2026-02-30', { cookie })).status, 400);
    }
  }
});

test('live team and meeting views reflect approved leave, active profiles and exact new-user participant IDs', async (t) => {
  const { request, login, store } = await createApi(t);
  const date = new Date().toISOString().slice(0, 10);
  await store.mutate((data) => {
    const source = data.users.find((user) => user.id === 'usr_john');
    data.users.push({ ...source, id: 'usr_CaseSensitive', name: 'Case Sensitive Staff', email: 'case.staff@example.test' });
    data.users.push({ ...source, id: 'usr_InactiveStaff', name: 'Inactive Staff', email: 'inactive.staff@example.test', active: false });
    data.attendance.push({ id: 'today_absence', userId: 'usr_CaseSensitive', date, clockIn: null, clockOut: null, breakMinutes: 0, activeSeconds: 0, idleSeconds: 0, status: 'Absent' });
  });
  const manager = await login('daniel@excellium.com', 'management');
  const trainer = await login('priya@excellium.com');
  const cookie = await login('case.staff@example.test');
  const before = await (await request('/api/portal', { cookie: manager })).json();
  const applied = await request('/api/leaves', { method: 'POST', cookie, body: { ...leave, startDate: date, endDate: date } });
  assert.equal(applied.status, 201);
  const id = (await applied.json()).leave.id;
  assert.equal((await request(`/api/leaves/${id}`, { method: 'PATCH', cookie: manager, body: { status: 'Approved' } })).status, 200);
  const after = await (await request('/api/portal', { cookie: manager })).json();
  assert.equal(after.dashboard.summary.onLeave, before.dashboard.summary.onLeave + 1);
  assert.equal(after.teamAttendance.records.find((record) => record.userId === 'usr_CaseSensitive').status, 'On leave');
  assert.ok(after.teamAttendance.records.every((record) => record.userId !== 'usr_InactiveStaff'));
  const meeting = { title: 'New staff training', startsAt: '2026-12-22T10:00:00.000Z', participants: ['usr_CaseSensitive', ' ', 'john@excellium.com'] };
  const created = await request('/api/meetings', { method: 'POST', cookie: trainer, body: meeting });
  assert.equal(created.status, 201);
  const session = (await created.json()).meeting;
  assert.ok(session.participants.includes('usr_CaseSensitive'));
  assert.equal((await request('/api/meetings', { method: 'POST', cookie: trainer, body: { ...meeting, participants: ['usr_InactiveStaff'] } })).status, 400);
  const personalMeetings = await (await request('/api/meetings', { cookie })).json();
  assert.ok(personalMeetings.meetings.some((item) => item.id === session.id));
});
