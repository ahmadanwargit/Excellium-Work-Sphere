import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPassword } from '../src/services/auth.service.js';
import { createApi } from './helpers/api.js';

const password = 'NewEmployee!234';
const profile = { name: 'Test Employee', email: 'new.employee@excellium.com', title: 'Support specialist', phone: '+92 300 1234567', startDate: '2026-12-01' };

test('admin creates departments, named role presets and working user portals without exposing credentials', async (t) => {
  const { request, login, store } = await createApi(t);
  const admin = await login('sara@excellium.com', 'management');
  const employee = await login();
  const manager = await login('daniel@excellium.com', 'management');
  for (const cookie of [employee]) {
    assert.equal((await request('/api/admin/users', { cookie })).status, 403);
    assert.equal((await request('/api/admin/users/roles', { method: 'POST', cookie, body: { name: 'Illegal admin', baseRole: 'admin' } })).status, 403);
  }
  assert.equal((await request('/api/admin/users', { cookie: manager })).status, 200);
  assert.equal((await request('/api/admin/users/roles', { method: 'POST', cookie: manager, body: { name: 'Cannot grant roles', baseRole: 'admin' } })).status, 403);
  const roleResponse = await request('/api/admin/users/roles', { method: 'POST', cookie: admin, body: { name: 'Support Lead', baseRole: 'trainer', description: 'Training and employee tools.' } });
  assert.equal(roleResponse.status, 201);
  const role = (await roleResponse.json()).role;
  const departmentResponse = await request('/api/admin/users/departments', { method: 'POST', cookie: admin, body: { name: 'Customer Success' } });
  assert.equal(departmentResponse.status, 201);
  const department = (await departmentResponse.json()).department;
  const body = { ...profile, password, roleId: role.id, departmentId: department.id };
  const created = await request('/api/admin/users', { method: 'POST', cookie: admin, body });
  assert.equal(created.status, 201);
  const result = await created.json();
  const user = result.user;
  assert.equal(user.role, 'trainer');
  assert.equal(user.roleName, 'Support Lead');
  assert.equal(user.department, 'Customer Success');
  assert.equal(user.accessGroup, 'employee');
  assert.equal(user.active, true);
  assert.doesNotMatch(JSON.stringify(result), /password|Salt|Hash|NewEmployee/);
  const stored = store.data.users.find((item) => item.id === user.id);
  assert.equal(verifyPassword(password, stored), true);
  assert.equal(stored.passwordSalt.length, 48);
  const newCookie = await login(profile.email, 'employee', password);
  assert.equal((await request('/api/dashboard', { cookie: newCookie })).status, 200);
  assert.equal((await request('/api/admin/users', { cookie: newCookie })).status, 403);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: profile.email, password, accessGroup: 'management' } })).status, 403);
  assert.equal((await request('/api/admin/users', { method: 'POST', cookie: admin, body: { ...body, email: profile.email.toUpperCase() } })).status, 409);
  assert.equal((await request('/api/admin/users/roles', { method: 'POST', cookie: admin, body: { name: 'support lead', baseRole: 'employee' } })).status, 409);
  assert.equal((await request('/api/admin/users/departments', { method: 'POST', cookie: admin, body: { name: 'customer success' } })).status, 409);
  const directory = (await (await request('/api/directory', { cookie: newCookie })).json()).people;
  assert.ok(directory.some((item) => item.id === user.id));
});

test('admin edits profiles and roles; deactivation denies both old sessions and new logins', async (t) => {
  const { request, login } = await createApi(t);
  const admin = await login('sara@excellium.com', 'management');
  const all = await (await request('/api/admin/users', { cookie: admin })).json();
  const department = all.departments[0];
  const created = (await (await request('/api/admin/users', { method: 'POST', cookie: admin, body: { ...profile, password, roleId: 'employee', departmentId: department.id } })).json()).user;
  const cookie = await login(profile.email, 'employee', password);
  assert.equal((await request('/api/reports', { cookie })).status, 403);
  const edit = { ...profile, name: 'Updated Employee', roleId: 'manager', departmentId: department.id, active: true };
  const updated = await request(`/api/admin/users/${created.id}`, { method: 'PATCH', cookie: admin, body: edit });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).user.accessGroup, 'management');
  assert.equal((await request('/api/reports', { cookie })).status, 200, 'existing sessions use the current stored permission level');
  assert.equal((await request(`/api/admin/users/${created.id}`, { method: 'PATCH', cookie: admin, body: { ...edit, active: false } })).status, 200);
  assert.equal((await request('/api/me', { cookie })).status, 401);
  assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: profile.email, password, accessGroup: 'management' } })).status, 401);
  const self = all.users.find((item) => item.id === 'usr_sara');
  const selfEdit = { name: self.name, email: self.email, title: self.title, roleId: self.roleId, departmentId: self.departmentId, active: false };
  assert.equal((await request('/api/admin/users/usr_sara', { method: 'PATCH', cookie: admin, body: selfEdit })).status, 403);
});

test('rejects weak passwords, unknown role/department assignments and forged permission fields', async (t) => {
  const { request, login } = await createApi(t);
  const admin = await login('sara@excellium.com', 'management');
  const data = await (await request('/api/admin/users', { cookie: admin })).json();
  const body = { ...profile, password, roleId: 'employee', departmentId: data.departments[0].id };
  for (const invalid of [{ ...body, password: 'short' }, { ...body, email: 'bad' }, { ...body, startDate: '2026-02-31' }, { ...body, role: 'admin' }]) {
    assert.equal((await request('/api/admin/users', { method: 'POST', cookie: admin, body: invalid })).status, 400);
  }
  assert.equal((await request('/api/admin/users', { method: 'POST', cookie: admin, body: { ...body, roleId: 'unknown' } })).status, 404);
  assert.equal((await request('/api/admin/users', { method: 'POST', cookie: admin, body: { ...body, departmentId: 'unknown' } })).status, 404);
});
