import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';

async function startTestServer(t) {
  const directory = await mkdtemp(join(tmpdir(), 'excellium-api-'));
  const { server } = await createApp({ dataFile: join(directory, 'store.json') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(base, path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function login(base, email, role) {
  const response = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { email, password: 'password123', role }
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('authenticates a user, enforces roles, and persists an approval workflow', async (t) => {
  const base = await startTestServer(t);
  const employeeCookie = await login(base, 'john@excellium.com', 'employee');

  const forbidden = await request(base, '/api/reports?type=Attendance', { cookie: employeeCookie });
  assert.equal(forbidden.status, 403);

  const submitted = await request(base, '/api/invoices', {
    method: 'POST',
    cookie: employeeCookie,
    body: { month: 'November 2026', amount: 4200, paymentDetails: 'Test payroll account' }
  });
  assert.equal(submitted.status, 201);
  const submittedInvoice = (await submitted.json()).invoice;
  assert.equal(submittedInvoice.status, 'Pending');
  assert.equal(submittedInvoice.employee.email, 'john@excellium.com');

  const adminCookie = await login(base, 'sara@excellium.com', 'admin');
  const approved = await request(base, `/api/invoices/${submittedInvoice.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'Approved' }
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).invoice.status, 'Approved');

  const employeeInvoices = await request(base, '/api/invoices', { cookie: employeeCookie });
  const invoices = (await employeeInvoices.json()).invoices;
  assert.ok(invoices.some((invoice) => invoice.id === submittedInvoice.id && invoice.status === 'Approved'));
});

test('serves the single-page portal and accepts a clock-in event', async (t) => {
  const base = await startTestServer(t);
  const portal = await request(base, '/');
  assert.equal(portal.status, 200);
  assert.match(await portal.text(), /Excellium Global Services/);
  const privateSource = await request(base, '/server.mjs');
  assert.equal(privateSource.status, 404);

  const cookie = await login(base, 'priya@excellium.com', 'trainer');
  const clockIn = await request(base, '/api/attendance/clock-in', { method: 'POST', cookie, body: {} });
  assert.equal(clockIn.status, 201);
  assert.equal((await clockIn.json()).attendance.live, true);
});
