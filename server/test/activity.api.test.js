import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server.js';

async function createTestApi(t) {
  const directory = await mkdtemp(join(tmpdir(), 'excellium-activity-'));
  const { server } = await startServer({ port: 0, host: '127.0.0.1', storePath: join(directory, 'store.json') });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function request(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

async function signIn(baseUrl, email, accessGroup) {
  const response = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { email, password: 'password123', accessGroup } });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('logs breaks, ignores activity during breaks, and serves daily admin reports and CSV', async (t) => {
  const baseUrl = await createTestApi(t);
  const employeeCookie = await signIn(baseUrl, 'john@excellium.com', 'employee');
  const clockInResponse = await request(baseUrl, '/api/attendance/clock-in', { method: 'POST', cookie: employeeCookie, body: {} });
  assert.equal(clockInResponse.status, 201);
  const clockIn = await clockInResponse.json();
  assert.equal(clockIn.session.state, 'ACTIVE');

  const breakStart = await request(baseUrl, '/api/attendance/break/start', { method: 'POST', cookie: employeeCookie, body: { minutes: 5 } });
  assert.equal(breakStart.status, 200);
  const breakState = await breakStart.json();
  assert.equal(breakState.session.state, 'ON_BREAK');

  const ignoredHeartbeat = await request(baseUrl, '/api/activity/heartbeat', {
    method: 'POST', cookie: employeeCookie,
    body: { state: 'ACTIVE', durationSeconds: 10, mouseClicks: 1, keypresses: 0, pageHidden: false, coordinates: [] }
  });
  assert.equal(ignoredHeartbeat.status, 202);
  assert.equal((await ignoredHeartbeat.json()).ignored, true);

  const breakEnd = await request(baseUrl, '/api/attendance/break/end', { method: 'POST', cookie: employeeCookie, body: {} });
  assert.equal(breakEnd.status, 200);
  assert.equal((await breakEnd.json()).session.state, 'ACTIVE');

  const heartbeat = await request(baseUrl, '/api/activity/heartbeat', {
    method: 'POST', cookie: employeeCookie,
    body: { state: 'IDLE', durationSeconds: 20, mouseClicks: 0, keypresses: 0, pageHidden: true, coordinates: [] }
  });
  assert.equal(heartbeat.status, 201);
  assert.equal((await heartbeat.json()).session.state, 'IDLE');

  const clockOut = await request(baseUrl, '/api/attendance/clock-out', { method: 'POST', cookie: employeeCookie, body: {} });
  assert.equal(clockOut.status, 200);

  const adminCookie = await signIn(baseUrl, 'sara@excellium.com', 'management');
  const date = clockIn.attendance.date;
  const reportResponse = await request(baseUrl, `/api/admin/reports/daily?date=${date}`, { cookie: adminCookie });
  assert.equal(reportResponse.status, 200);
  const report = await reportResponse.json();
  const john = report.reports.find((row) => row.employee.id === 'usr_john');
  assert.equal(john.idleSeconds, 20);

  const logsResponse = await request(baseUrl, `/api/admin/logs/usr_john?date=${date}`, { cookie: adminCookie });
  assert.equal(logsResponse.status, 200);
  assert.ok((await logsResponse.json()).timeline.some((entry) => entry.eventType === 'BREAK_START'));

  const csvResponse = await request(baseUrl, `/api/admin/reports/daily/export?date=${date}`, { cookie: adminCookie });
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
  assert.match(await csvResponse.text(), /Productivity score/);
});
