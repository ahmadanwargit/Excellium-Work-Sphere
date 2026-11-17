import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSeed } from '../src/data/seed.js';
import { createServerlessHandler } from '../src/serverless.js';
import { SessionService } from '../src/services/session.service.js';

async function listen(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

function asynchronousSessions() {
  const sessions = new SessionService();
  return {
    async create(userId) { return sessions.create(userId); },
    async get(token) { return sessions.get(token); },
    async destroy(token) { sessions.destroy(token); }
  };
}

test('serverless invocations use a fresh store and await shared login, authentication and logout', async (t) => {
  const data = createSeed();
  const snapshots = new Set();
  const sessions = asynchronousSessions();
  const options = {
    sessions,
    storage: { enabled: false },
    createStore: async () => {
      const store = { data: structuredClone(data) };
      snapshots.add(store);
      return store;
    }
  };
  const firstUrl = await listen(t, createServerlessHandler(options));
  const secondUrl = await listen(t, createServerlessHandler(options));
  const health = await fetch(`${firstUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'private, no-store');

  const login = await fetch(`${firstUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.4' },
    body: JSON.stringify({ email: 'john@excellium.com', password: 'password123', accessGroup: 'employee' })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const me = await fetch(`${secondUrl}/api/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'john@excellium.com');

  const logout = await fetch(`${secondUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${firstUrl}/api/me`, { headers: { cookie } })).status, 401);
  assert.equal(snapshots.size, 5);
});

test('does not leak initialization errors or fall back to an ephemeral local store', async (t) => {
  const errors = [];
  const handler = createServerlessHandler({
    createStore: async () => { throw new Error('private configuration detail'); },
    logger: { error: (...args) => errors.push(args) }
  });
  const url = await listen(t, handler);
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /private configuration detail/);
  assert.equal(errors.length, 1);
});

test('passes rejected asynchronous authentication to the Express error handler', async (t) => {
  const handler = createServerlessHandler({
    createStore: async () => ({ data: createSeed() }),
    sessions: { async get() { throw new Error('shared session backend unavailable'); } },
    storage: { enabled: false }
  });
  const url = await listen(t, handler);
  const response = await fetch(`${url}/api/me`);
  assert.equal(response.status, 500);
});
