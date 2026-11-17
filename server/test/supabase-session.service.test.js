import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { SupabaseSessionService } from '../src/services/supabase-session.service.js';

function createSessionClient() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, 'excellium_auth_sessions');
      return {
        async insert(row) {
          rows.set(row.token_hash, { ...row });
          return { error: null };
        },
        select(columns) {
          assert.equal(columns, 'user_id, expires_at');
          let hash;
          let after;
          const query = {
            eq(column, value) { assert.equal(column, 'token_hash'); hash = value; return query; },
            gt(column, value) { assert.equal(column, 'expires_at'); after = value; return query; },
            async maybeSingle() {
              const row = rows.get(hash);
              return { data: row?.expires_at > after ? { ...row } : null, error: null };
            }
          };
          return query;
        },
        delete() {
          return { async eq(column, hash) { assert.equal(column, 'token_hash'); rows.delete(hash); return { error: null }; } };
        }
      };
    }
  };
}

test('shares hashed sessions across instances and revokes them on logout', async () => {
  const client = createSessionClient();
  const first = new SupabaseSessionService({ client });
  const second = new SupabaseSessionService({ client });
  const { token, expiresAt } = await first.create('usr_john');
  const hash = createHash('sha256').update(token).digest('hex');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(client.rows.has(token), false);
  assert.equal(client.rows.get(hash).user_id, 'usr_john');
  assert.equal(JSON.stringify([...client.rows.values()]).includes(token), false);
  assert.deepEqual(await second.get(token), { userId: 'usr_john', expiresAt });
  await second.destroy(token);
  assert.equal(await first.get(token), null);
});

test('rejects expired and malformed session tokens', async () => {
  const client = createSessionClient();
  let now = Date.now();
  const sessions = new SupabaseSessionService({ client, now: () => now });
  const { token, expiresAt } = await sessions.create('usr_john');
  now = expiresAt;
  assert.equal(await sessions.get(token), null);
  assert.equal(await sessions.get(undefined), null);
  assert.equal(await sessions.get('invalid-token'), null);
  await sessions.destroy(undefined);
  assert.equal(client.rows.size, 1);
});

test('fails closed when the shared session database is unavailable', async () => {
  const client = { from: () => ({ insert: async () => ({ error: new Error('database offline') }) }) };
  const sessions = new SupabaseSessionService({ client });
  await assert.rejects(sessions.create('usr_john'), /Unable to create the shared sign-in session/);
});
