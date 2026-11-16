import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server.js';

async function createTestApi(t, storage) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'excellium-express-'));
  const { server } = await startServer({ port: 0, host: '127.0.0.1', storePath: join(temporaryDirectory, 'store.json'), storage });
  const address = server.address();
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(temporaryDirectory, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${address.port}`;
}

async function request(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function signIn(baseUrl, email, role) {
  const response = await request(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email, password: 'password123', role }
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}


test('protects role-based API access and persists invoice approvals', async (t) => {
  const baseUrl = await createTestApi(t);
  const employeeCookie = await signIn(baseUrl, 'john@excellium.com', 'employee');

  assert.equal((await request(baseUrl, '/api/reports?type=Attendance', { cookie: employeeCookie })).status, 403);

  const createResponse = await request(baseUrl, '/api/invoices', {
    method: 'POST',
    cookie: employeeCookie,
    body: { month: 'November 2026', amount: 4200, paymentDetails: 'Demo payroll account' }
  });
  assert.equal(createResponse.status, 201);
  const invoice = (await createResponse.json()).invoice;

  const adminCookie = await signIn(baseUrl, 'sara@excellium.com', 'admin');
  const approvalResponse = await request(baseUrl, `/api/invoices/${invoice.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'Approved' }
  });
  assert.equal(approvalResponse.status, 200);
  assert.equal((await approvalResponse.json()).invoice.status, 'Approved');
});

test('allows authenticated users to clock in and create an equipment request', async (t) => {
  const baseUrl = await createTestApi(t);
  const cookie = await signIn(baseUrl, 'priya@excellium.com', 'trainer');

  const clockIn = await request(baseUrl, '/api/attendance/clock-in', { method: 'POST', cookie, body: {} });
  assert.equal(clockIn.status, 201);
  assert.equal((await clockIn.json()).attendance.live, true);

  const requestResponse = await request(baseUrl, '/api/equipment/requests', {
    method: 'POST',
    cookie,
    body: { item: 'Presentation adapter', type: 'Upgrade', reason: 'Required for customer workshops.' }
  });
  assert.equal(requestResponse.status, 201);
  assert.equal((await requestResponse.json()).request.status, 'Pending');
});
