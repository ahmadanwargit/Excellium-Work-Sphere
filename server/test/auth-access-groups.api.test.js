import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startServer } from '../src/server.js';

async function createTestApi(t) {
  const directory = await mkdtemp(join(tmpdir(), 'excellium-access-groups-'));
  const { server } = await startServer({ port: 0, host: '127.0.0.1', storePath: join(directory, 'store.json') });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function login(baseUrl, body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'password123', ...body })
  });
}

test('signs users into one of two access groups while preserving server-side roles', async (t) => {
  const baseUrl = await createTestApi(t);

  const trainerLogin = await login(baseUrl, { email: 'priya@excellium.com', accessGroup: 'employee' });
  assert.equal(trainerLogin.status, 200);
  const trainer = (await trainerLogin.json()).user;
  assert.equal(trainer.role, 'trainer');
  assert.equal(trainer.accessGroup, 'employee');

  const managerLogin = await login(baseUrl, { email: 'daniel@excellium.com', accessGroup: 'management' });
  assert.equal(managerLogin.status, 200);
  const manager = (await managerLogin.json()).user;
  assert.equal(manager.role, 'manager');
  assert.equal(manager.accessGroup, 'management');

  const employeeInManagement = await login(baseUrl, { email: 'john@excellium.com', accessGroup: 'management' });
  assert.equal(employeeInManagement.status, 403);

  const managerAsEmployee = await login(baseUrl, { email: 'sara@excellium.com', accessGroup: 'employee' });
  assert.equal(managerAsEmployee.status, 403);
});

test('rejects legacy raw-role login selection instead of treating it as access control', async (t) => {
  const baseUrl = await createTestApi(t);
  const response = await login(baseUrl, { email: 'john@excellium.com', accessGroup: 'employee', role: 'admin' });
  assert.equal(response.status, 400);
});
