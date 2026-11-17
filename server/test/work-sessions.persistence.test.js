import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeed } from '../src/data/seed.js';
import { serializeWorkspace } from '../src/data/supabase-relational-store.js';
import { SESSION_STATES, closeWorkSession, openWorkSession } from '../src/services/activity.service.js';

test('serializes distinct work sessions when an employee returns on the same date', () => {
  const data = createSeed();
  const first = openWorkSession(data, 'usr_john', { at: '2026-11-16T09:00:00.000Z' });
  closeWorkSession(data, 'usr_john', { at: '2026-11-16T12:00:00.000Z' });
  const second = openWorkSession(data, 'usr_john', { at: '2026-11-16T13:00:00.000Z' });

  const rows = serializeWorkspace(data).workSessions.filter((row) => row.user_id === 'usr_john' && row.work_date === '2026-11-16');
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.id === first.id).state, SESSION_STATES.CLOCKED_OUT);
  assert.equal(rows.find((row) => row.id === second.id).state, SESSION_STATES.ACTIVE);
  assert.notEqual(first.id, second.id);
});
