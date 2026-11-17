import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeed } from '../src/data/seed.js';
import { hydrateWorkspace, serializeWorkspace, SupabaseRelationalStore } from '../src/data/supabase-relational-store.js';

function relationalClientDouble() {
  const rows = new Map();
  let settings = null;
  const keyFor = (table, row) => {
    if (table === 'excellium_meeting_participants') return `${row.meeting_id}:${row.user_id}`;
    if (table === 'excellium_notification_audiences') return `${row.notification_id}:${row.role}`;
    if (table === 'excellium_notification_reads') return `${row.notification_id}:${row.user_id}`;
    return row.id;
  };

  return {
    rows,
    get settings() { return settings; },
    from(table) {
      return {
        select() {
          const query = {
            eq: () => query,
            maybeSingle: async () => ({ data: table === 'excellium_workspace_settings' ? settings : null, error: null })
          };
          return query;
        },
        upsert: async (items) => {
          const tableRows = rows.get(table) ?? new Map();
          items.forEach((item) => tableRows.set(keyFor(table, item), structuredClone(item)));
          rows.set(table, tableRows);
          return { error: null };
        },
        insert: async (item) => {
          if (table === 'excellium_workspace_settings') settings = structuredClone(item);
          return { error: null };
        },
        update(values) {
          const query = {
            eq: () => query,
            select: () => ({
              maybeSingle: async () => {
                settings = { ...settings, ...structuredClone(values) };
                return { data: { version: settings.version }, error: null };
              }
            })
          };
          return query;
        }
      };
    }
  };
}

test('supports the default no-options construction used by server startup', () => {
  assert.throws(
    () => new SupabaseRelationalStore(),
    /Supabase is not configured/,
    'the constructor should reach the configuration guard rather than destructuring undefined options'
  );
});

test('serializes workspace state into normalized Supabase table rows without a JSON dump', () => {
  const seed = createSeed();
  const rows = serializeWorkspace(seed);

  assert.equal(rows.settings.company_name, 'Excellium Global Services');
  assert.equal(rows.users[0].password_hash.length, 128);
  assert.equal('access_group' in rows.users[0], false, 'the database computes its generated category');
  assert.equal(rows.attendance[0].user_id, 'usr_john');
  assert.equal(rows.attendance[0].work_date, '2026-11-13');
  assert.equal(rows.invoices[0].employee_id, 'usr_john');
  assert.equal(rows.invoices[0].amount, 4200);
  assert.deepEqual(rows.participants.find((item) => item.meeting_id === 'mtg_101'), { meeting_id: 'mtg_101', user_id: 'usr_john' });
  assert.deepEqual(rows.audiences.find((item) => item.notification_id === 'ntf_1001'), { notification_id: 'ntf_1001', role: 'manager' });
  assert.deepEqual(rows.workSessions, []);
  assert.deepEqual(rows.heartbeats, []);
  assert.equal('state' in rows, false);
});

test('hydrates the current application domain shape from normalized rows', () => {
  const seed = createSeed();
  const rows = serializeWorkspace(seed);
  const hydrated = hydrateWorkspace({
    settings: { ...rows.settings, version: 1 },
    users: rows.users,
    attendance: rows.attendance,
    corrections: rows.corrections,
    workSessions: rows.workSessions,
    breakLogs: rows.breakLogs,
    heartbeats: rows.heartbeats,
    samples: rows.samples,
    flags: rows.flags,
    invoices: rows.invoices,
    meetings: rows.meetings,
    participants: rows.participants,
    equipmentRequests: rows.equipmentRequests,
    assets: rows.assets,
    notifications: rows.notifications,
    audiences: rows.audiences,
    reads: rows.reads,
    audit: rows.audit
  });

  assert.equal(hydrated.organization.name, seed.organization.name);
  assert.equal(hydrated.users.find((user) => user.id === 'usr_john').accessGroup, 'employee');
  assert.equal(hydrated.attendance[0].userId, seed.attendance[0].userId);
  assert.equal(hydrated.invoices[0].amount, seed.invoices[0].amount);
  assert.deepEqual(hydrated.meetings.find((meeting) => meeting.id === 'mtg_101').participants, seed.meetings.find((meeting) => meeting.id === 'mtg_101').participants);
  assert.deepEqual(hydrated.activitySamples, []);
});

test('persists a clock-in style mutation as a normalized attendance row', async () => {
  const client = relationalClientDouble();
  const store = await new SupabaseRelationalStore({ client }).initialise();

  await store.mutate((data) => {
    data.attendance.unshift({ id: 'att_clocked_in', userId: 'usr_john', date: '2026-11-16', clockIn: '2026-11-16T09:00:00.000Z', clockOut: null, breakMinutes: 0, status: 'On time', activeSeconds: 0, idleSeconds: 0 });
  });

  const attendanceRow = client.rows.get('excellium_attendance').get('att_clocked_in');
  assert.equal(attendanceRow.user_id, 'usr_john');
  assert.equal(attendanceRow.work_date, '2026-11-16');
  assert.equal(attendanceRow.clock_in, '2026-11-16T09:00:00.000Z');
  assert.equal(client.settings.version, 2);
});

test('persists only typed activity delta rows for a heartbeat', async () => {
  const client = relationalClientDouble();
  const store = await new SupabaseRelationalStore({ client }).initialise();

  await store.mutateActivity((data) => {
    data.workSessions.unshift({ id: 'ses_1', userId: 'usr_john', workDate: '2026-11-16', clockIn: '2026-11-16T09:00:00.000Z', clockOut: null, state: 'ACTIVE', activeSeconds: 30, idleSeconds: 0, breakSeconds: 0, suspiciousFlagCount: 0, createdAt: '2026-11-16T09:00:00.000Z', updatedAt: '2026-11-16T09:00:30.000Z' });
    data.activityHeartbeats.unshift({ id: 'hbt_1', sessionId: 'ses_1', userId: 'usr_john', recordedAt: '2026-11-16T09:00:30.000Z', state: 'ACTIVE', durationSeconds: 30, mouseClicks: 1, keypresses: 0, pageHidden: false });
    data.activitySamples.unshift({ id: 'smp_1', heartbeatId: 'hbt_1', sessionId: 'ses_1', userId: 'usr_john', x: 12, y: 18, eventAt: '2026-11-16T09:00:27.000Z', eventType: 'pointer' });
    data.auditLog.unshift({ id: 'aud_activity', timestamp: '2026-11-16T09:00:30.000Z', actorId: 'usr_john', subjectUserId: 'usr_john', sessionId: 'ses_1', breakLogId: null, eventType: 'ACTIVE', action: 'Returned active' });
  });

  assert.equal(client.rows.get('excellium_work_sessions').get('ses_1').state, 'ACTIVE');
  assert.equal(client.rows.get('excellium_activity_heartbeats').get('hbt_1').duration_seconds, 30);
  assert.equal(client.rows.get('excellium_activity_samples').get('smp_1').x, 12);
  assert.equal(client.rows.get('excellium_audit_log').get('aud_activity').event_type, 'ACTIVE');
  assert.equal(client.settings.version, 2);
});
