import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeed } from '../src/data/seed.js';
import {
  SESSION_STATES,
  buildDailyActivityReport,
  closeWorkSession,
  endWorkBreak,
  openWorkSession,
  recordActivityHeartbeat,
  startWorkBreak
} from '../src/services/activity.service.js';
import { detectJigglerPatterns } from '../src/services/jiggler.service.js';

test('work sessions transition through active, break, active, and clocked-out states', () => {
  const data = createSeed();
  const startedAt = '2026-11-16T09:00:00.000Z';
  const session = openWorkSession(data, 'usr_john', { at: startedAt });
  assert.equal(session.state, SESSION_STATES.ACTIVE);

  const { breakLog } = startWorkBreak(data, 'usr_john', 5, { at: '2026-11-16T10:00:00.000Z' });
  assert.equal(session.state, SESSION_STATES.ON_BREAK);
  assert.equal(breakLog.durationMinutes, 5);

  const ignored = recordActivityHeartbeat(data, 'usr_john', { state: 'ACTIVE', durationSeconds: 30, coordinates: [] }, { at: '2026-11-16T10:02:00.000Z' });
  assert.equal(ignored.ignored, true, 'heartbeats are ignored while the session is on break');

  const resumed = endWorkBreak(data, 'usr_john', { at: '2026-11-16T10:06:30.000Z' });
  assert.equal(resumed.session.state, SESSION_STATES.ACTIVE);
  assert.equal(resumed.breakLog.actualSeconds, 390);
  assert.equal(resumed.breakLog.overageSeconds, 90);

  recordActivityHeartbeat(data, 'usr_john', { state: 'IDLE', durationSeconds: 120, mouseClicks: 0, keypresses: 0, coordinates: [] }, { at: '2026-11-16T11:00:00.000Z' });
  assert.equal(session.state, SESSION_STATES.IDLE);
  const closed = closeWorkSession(data, 'usr_john', { at: '2026-11-16T17:00:00.000Z' });
  assert.equal(closed.state, SESSION_STATES.CLOCKED_OUT);
  assert.equal(closed.clockOut, '2026-11-16T17:00:00.000Z');
});

test('jiggler detection flags repetitive loops, fixed pixel nudges, and motion without direct input', () => {
  const loopSamples = Array.from({ length: 12 }, (_, index) => ({
    x: index % 2, y: 10, eventAt: new Date(Date.UTC(2026, 10, 16, 9, 0, index * 3)).toISOString()
  }));
  assert.ok(detectJigglerPatterns({ samples: loopSamples, heartbeats: [], now: '2026-11-16T09:01:00.000Z' }).includes('REPETITIVE_COORDINATE_LOOP'));

  const nudges = Array.from({ length: 11 }, (_, index) => ({ x: index, y: 42, eventAt: new Date(Date.UTC(2026, 10, 16, 10, 0, index * 3)).toISOString() }));
  const thirtyMinuteHeartbeats = Array.from({ length: 10 }, (_, index) => ({
    recordedAt: new Date(Date.UTC(2026, 10, 16, 10, index * 3, 0)).toISOString(), durationSeconds: 180, mouseClicks: 0, keypresses: 0
  }));
  const nudgeFlags = detectJigglerPatterns({ samples: nudges, heartbeats: [], now: '2026-11-16T10:01:00.000Z' });
  assert.ok(nudgeFlags.includes('FIXED_INTERVAL_PIXEL_NUDGE'));

  const motionSamples = Array.from({ length: 11 }, (_, index) => ({ x: index * 10, y: 42, eventAt: new Date(Date.UTC(2026, 10, 16, 10, index * 3, 0)).toISOString() }));
  const motionFlags = detectJigglerPatterns({ samples: motionSamples, heartbeats: thirtyMinuteHeartbeats, now: '2026-11-16T10:30:00.000Z' });
  assert.ok(motionFlags.includes('MOTION_WITHOUT_INPUT_30_MIN'));
});

test('daily report calculates work, break overrun, productivity, and flags from typed records', () => {
  const data = createSeed();
  data.workSessions = [{
    id: 'ses_report', userId: 'usr_john', workDate: '2026-11-16', clockIn: '2026-11-16T09:00:00.000Z', clockOut: '2026-11-16T17:00:00.000Z',
    state: SESSION_STATES.CLOCKED_OUT, activeSeconds: 18_000, idleSeconds: 3_600, breakSeconds: 1_500, suspiciousFlagCount: 2,
    createdAt: '2026-11-16T09:00:00.000Z', updatedAt: '2026-11-16T17:00:00.000Z'
  }];
  data.breakLogs = [
    { id: 'brk_5', sessionId: 'ses_report', userId: 'usr_john', workDate: '2026-11-16', durationMinutes: 5, startedAt: '2026-11-16T11:00:00.000Z', expectedEndsAt: '2026-11-16T11:05:00.000Z', endedAt: '2026-11-16T11:05:00.000Z', actualSeconds: 300, overageSeconds: 0, status: 'COMPLETED' },
    { id: 'brk_15', sessionId: 'ses_report', userId: 'usr_john', workDate: '2026-11-16', durationMinutes: 15, startedAt: '2026-11-16T14:00:00.000Z', expectedEndsAt: '2026-11-16T14:15:00.000Z', endedAt: '2026-11-16T14:20:00.000Z', actualSeconds: 1_200, overageSeconds: 300, status: 'OVERRUN' }
  ];
  data.activityFlags = [
    { id: 'flg_1', sessionId: 'ses_report', userId: 'usr_john', workDate: '2026-11-16', kind: 'REPETITIVE_COORDINATE_LOOP', detectedAt: '2026-11-16T12:00:00.000Z' },
    { id: 'flg_2', sessionId: 'ses_report', userId: 'usr_john', workDate: '2026-11-16', kind: 'FIXED_INTERVAL_PIXEL_NUDGE', detectedAt: '2026-11-16T15:00:00.000Z' }
  ];

  const report = buildDailyActivityReport(data, '2026-11-16').find((row) => row.employee.id === 'usr_john');
  assert.equal(report.totalShiftSeconds, 28_800);
  assert.equal(report.activeSeconds, 18_000);
  assert.equal(report.idleSeconds, 3_600);
  assert.equal(report.break5Seconds, 300);
  assert.equal(report.break15Seconds, 1_200);
  assert.equal(report.overBreakSeconds, 300);
  assert.equal(report.productivityScore, 83);
  assert.equal(report.suspiciousFlagsCount, 2);
});
