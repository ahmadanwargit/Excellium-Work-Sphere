import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabaseStateStore } from '../src/data/supabase-state-store.js';

function createStateClient() {
  let record = null;

  const selectQuery = () => {
    const query = {
      eq: () => query,
      maybeSingle: async () => ({ data: record ? { state: structuredClone(record.state), version: record.version } : null, error: null })
    };
    return query;
  };

  return {
    get record() { return record; },
    from: () => ({
      select: () => selectQuery(),
      insert: (row) => ({
        select: () => ({
          single: async () => {
            record = { state: structuredClone(row.state), version: row.version };
            return { data: structuredClone(record), error: null };
          }
        })
      }),
      update: (values) => {
        const query = {
          eq: () => query,
          select: () => ({
            maybeSingle: async () => {
              record = { state: structuredClone(values.state), version: values.version };
              return { data: { version: record.version }, error: null };
            }
          })
        };
        return query;
      }
    })
  };
}

test('seeds and persists all workspace records through the Supabase state adapter', async () => {
  const client = createStateClient();
  const store = await new SupabaseStateStore({ client, tableName: 'excellium_portal_state' }).initialise();

  assert.equal(store.data.schemaVersion, 1);
  assert.equal(client.record.version, 1);

  await store.mutate((data) => {
    data.attendance.unshift({ id: 'att_supabase', userId: 'usr_john', date: '2026-11-16', clockIn: '2026-11-16T09:00:00.000Z', clockOut: null, breakMinutes: 0, status: 'On time', activeSeconds: 0, idleSeconds: 0 });
    data.notifications.unshift({ id: 'ntf_supabase', userId: 'usr_john', audience: [], message: 'Clock-in persisted to Supabase', createdAt: '2026-11-16T09:00:00.000Z', readBy: [] });
  });

  assert.equal(client.record.version, 2);
  assert.equal(client.record.state.attendance[0].id, 'att_supabase');
  assert.equal(client.record.state.notifications[0].id, 'ntf_supabase');
});
