import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../src/server.js';

export async function createApi(t) {
  const directory = await mkdtemp(join(tmpdir(), 'excellium-workflows-'));
  const storePath = join(directory, 'store.json');
  const { server, store } = await startServer({ port: 0, host: '127.0.0.1', storePath });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = 'GET', body, cookie } = {}) => fetch(`${url}${path}`, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const login = async (email = 'john@excellium.com', accessGroup = 'employee', password = 'password123') => {
    const response = await request('/api/auth/login', { method: 'POST', body: { email, accessGroup, password } });
    assert.equal(response.status, 200, `Could not sign in as ${email}: ${await response.clone().text()}`);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { url, request, login, store, storePath };
}
