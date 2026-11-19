import assert from 'node:assert/strict';
import test from 'node:test';
import { createApi } from './helpers/api.js';

const leave = { type: 'Annual', startDate: '2026-12-01', endDate: '2026-12-03', reason: 'Family commitments.' };

test('staff apply privately and management or administrators approve or reject leave', async (t) => {
  const { request, login } = await createApi(t);
  const employee = await login();
  const colleague = await login('priya@excellium.com');
  const manager = await login('daniel@excellium.com', 'management');
  const admin = await login('sara@excellium.com', 'management');
  const created = await request('/api/leaves', { method: 'POST', cookie: employee, body: leave });
  assert.equal(created.status, 201);
  const { leave: item } = await created.json();
  assert.equal(item.days, 3);
  assert.equal(item.employeeId, 'usr_john');
  assert.equal((await (await request('/api/leaves', { cookie: colleague })).json()).leaves.length, 0);
  assert.equal((await (await request('/api/leaves', { cookie: manager })).json()).leaves.length, 1);
  for (const cookie of [employee]) assert.equal((await request(`/api/leaves/${item.id}`, { method: 'PATCH', cookie, body: { status: 'Approved' } })).status, 403);
  assert.equal((await request(`/api/leaves/${item.id}`, { method: 'PATCH', cookie: admin, body: { status: 'Rejected' } })).status, 400);
  const approved = await request(`/api/leaves/${item.id}`, { method: 'PATCH', cookie: admin, body: { status: 'Approved', reviewNote: 'Enjoy your time off.' } });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).leave.decidedBy, 'usr_sara');
  assert.equal((await request(`/api/leaves/${item.id}`, { method: 'PATCH', cookie: admin, body: { status: 'Rejected', reviewNote: 'Changed mind.' } })).status, 409);
  assert.equal((await request(`/api/leaves/${item.id}/cancel`, { method: 'POST', cookie: employee, body: {} })).status, 409);
  assert.ok((await (await request('/api/notifications', { cookie: employee })).json()).notifications.some((notice) => notice.message.includes('leave') && notice.message.includes('approved')));

  const second = (await (await request('/api/leaves', { method: 'POST', cookie: colleague, body: leave })).json()).leave;
  const rejected = await request(`/api/leaves/${second.id}`, { method: 'PATCH', cookie: admin, body: { status: 'Rejected', reviewNote: 'Please arrange coverage first.' } });
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).leave.reviewNote, 'Please arrange coverage first.');
  assert.equal((await request('/api/leaves')).status, 401);
});

test('rejects invalid dates, overlapping leave and forged ownership; lets an owner withdraw pending leave', async (t) => {
  const { request, login, store } = await createApi(t);
  const cookie = await login();
  const admin = await login('sara@excellium.com', 'management');
  for (const body of [
    { ...leave, startDate: '2026-02-30' }, { ...leave, endDate: '2026-11-30' },
    { ...leave, endDate: '2028-12-01' }, { ...leave, reason: ' ' },
    { ...leave, employeeId: 'usr_sara' }, { ...leave, status: 'Approved' }
  ]) assert.equal((await request('/api/leaves', { method: 'POST', cookie, body })).status, 400);
  const created = (await (await request('/api/leaves', { method: 'POST', cookie, body: leave })).json()).leave;
  assert.equal((await request('/api/leaves', { method: 'POST', cookie, body: { ...leave, startDate: leave.endDate } })).status, 409);
  assert.equal((await request(`/api/leaves/${created.id}/cancel`, { method: 'POST', cookie: admin, body: {} })).status, 403);
  assert.equal((await request(`/api/leaves/${created.id}/cancel`, { method: 'POST', cookie, body: {} })).status, 200);
  assert.equal((await request('/api/leaves', { method: 'POST', cookie, body: leave })).status, 201);
  assert.equal((await request('/api/leaves', { method: 'POST', cookie: admin, body: leave })).status, 403);
  // Historical admin applications remain protected against self-review.
  await store.mutate((data) => data.leaveRequests.push({ ...data.leaveRequests[0], id: 'legacy_admin_leave', employeeId: 'usr_sara', status: 'Pending' }));
  assert.equal((await request('/api/leaves/legacy_admin_leave', { method: 'PATCH', cookie: admin, body: { status: 'Approved' } })).status, 403);
});
