import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeed } from '../src/data/seed.js';
import { attendanceRanking, workDaysFor } from '../src/services/attendance-ranking.service.js';
import { formatAttendance } from '../src/services/records.service.js';
import { approvedInvoiceSeries, weeklyWorkSeries } from '../../client/src/utils/charts.js';

const now = new Date('2026-11-07T12:00:00Z');
const clock = (id, date, time = '09:00') => ({ id: `${id}-${date}`, userId: id, date, clockIn: `${date}T${time}:00Z`, clockOut: `${date}T17:00:00Z`, breakMinutes: 30, activeSeconds: 120, idleSeconds: 30, status: time === '09:00' ? 'On time' : 'Late' });

function rankingData() {
  const data = createSeed();
  data.users.forEach((person) => { person.startDate = '2026-11-02'; });
  data.attendance = [clock('usr_john', '2026-11-02'), clock('usr_john', '2026-11-04', '09:20'), clock('usr_john', '2026-11-07')];
  data.attendance.push(...[2, 3, 4, 5, 6].map((day) => clock('usr_priya', `2026-11-0${day}`)));
  data.workSessions = [{ ...clock('usr_john', '2026-11-02', '14:00'), workDate: '2026-11-02' }];
  data.leaveRequests = [{ id: 'approved', employeeId: 'usr_john', status: 'Approved', startDate: '2026-11-03', endDate: '2026-11-03' }, { id: 'pending', employeeId: 'usr_john', status: 'Pending', startDate: '2026-11-05', endDate: '2026-11-05' }];
  return data;
}

test('attendance ranks use elapsed scheduled days, approved leave, earliest clock-in and no performance data', () => {
  const result = attendanceRanking(rankingData(), '2026-11', { now });
  const john = result.rows.find((row) => row.employee.id === 'usr_john');
  const priya = result.rows.find((row) => row.employee.id === 'usr_priya');
  assert.equal(john.presentDays, 2); assert.equal(john.expectedDays, 4); assert.equal(john.excusedDays, 1);
  assert.equal(john.attendanceRate, 50); assert.equal(john.onTimeRate, 50); assert.equal(john.lateDays, 1); assert.equal(john.rank, 2);
  assert.equal(priya.attendanceRate, 100); assert.equal(priya.rank, 1);
  assert.ok(result.rows.filter((row) => !['usr_john', 'usr_priya'].includes(row.employee.id)).every((row) => row.rank === null));
  assert.ok(result.rows.every((row) => row.employee.id !== 'usr_sara' && row.employee.id !== 'usr_daniel'));
  assert.equal(result.summary.presentDays, 7);
});

test('rank ties, new joiners, inactive profiles and zero eligible days are explicit rather than invented', () => {
  const data = rankingData();
  data.users.find((person) => person.id === 'usr_aisha').startDate = '2026-11-10';
  data.users.find((person) => person.id === 'usr_omar').active = false;
  data.users.find((person) => person.id === 'usr_elena').deletedAt = '2026-11-04T12:00:00Z';
  data.users.find((person) => person.id === 'usr_tom').startDate = '2026-11-06';
  data.attendance.push(...[2, 3, 4, 5, 6].map((day) => clock('usr_grace', `2026-11-0${day}`)));
  const result = attendanceRanking(data, '2026-11', { now });
  const aisha = result.rows.find((row) => row.employee.id === 'usr_aisha');
  assert.equal(aisha.expectedDays, 0); assert.equal(aisha.attendanceRate, null); assert.equal(aisha.rank, null);
  assert.equal(result.rows.find((row) => row.employee.id === 'usr_tom').expectedDays, 1);
  assert.equal(result.rows.find((row) => row.employee.id === 'usr_priya').rank, result.rows.find((row) => row.employee.id === 'usr_grace').rank);
  assert.ok(!result.rows.some((row) => ['usr_omar', 'usr_elena'].includes(row.employee.id)));
  assert.equal(result.departments.find((item) => item.name === 'Engineering').presentDays, 7);
});

test('workweek parsing, month bounds and empty periods have deterministic denominators', () => {
  assert.deepEqual(workDaysFor('Mon to Fri').days, [1, 2, 3, 4, 5]);
  assert.deepEqual(workDaysFor('Sunday–Thursday').days, [0, 1, 2, 3, 4]);
  assert.deepEqual(workDaysFor('Mon, Wed, Sat').days, [1, 3, 6]);
  assert.equal(workDaysFor('Not configured').fallback, true);
  for (const month of ['2026-13', '1999-01', '2026-12', '../private']) assert.throws(() => attendanceRanking(rankingData(), month, { now }), /valid attendance month/);
  const empty = rankingData(); empty.users = [];
  const result = attendanceRanking(empty, '2026-11', { now });
  assert.equal(result.summary.attendanceRate, null); assert.deepEqual(result.rows, []); assert.deepEqual(result.departments, []);
});

test('work charts show exact recorded hours with UTC dates and leave incomplete past shifts uncounted', () => {
  const records = [{ date: '2026-11-03', workedMinutes: 90 }, { date: '2026-11-03', workedMinutes: 30 }, { date: '2026-11-04', workedMinutes: 999, incomplete: true }];
  const points = weeklyWorkSeries(records, now);
  assert.equal(points.length, 7);
  assert.equal(points.find((point) => point.id === '2026-11-03').value, 2);
  assert.equal(points.find((point) => point.id === '2026-11-04').value, 0);
  assert.equal(points.find((point) => point.id === '2026-11-03').formatted, '2h 0m');
  const data = createSeed();
  const old = formatAttendance(data, { ...clock('usr_john', '2026-11-02'), clockOut: null });
  assert.equal(old.incomplete, true); assert.equal(old.workedMinutes, null); assert.match(old.workedLabel, /Incomplete/);
});

test('approved invoice charts aggregate chronologically and never mix currencies, draft or pending values', () => {
  const values = [
    { month: 'November 2026', currency: 'USD', amount: 20, status: 'Approved' },
    { month: 'September 2026', currency: 'USD', amount: 10, status: 'Approved' },
    { month: 'November 2026', currency: 'USD', amount: 30, status: 'Approved' },
    { month: 'November 2026', currency: 'PKR', amount: 10000, status: 'Approved' },
    { month: 'November 2026', currency: 'USD', amount: 9999, status: 'Pending' },
    { month: 'November 2026', currency: 'USD', amount: 8888, status: 'Draft' }
  ];
  const series = approvedInvoiceSeries(values);
  assert.equal(series.length, 2);
  assert.equal(series.find((group) => group.currency === 'PKR').points[0].total, 10000);
  assert.deepEqual(series.find((group) => group.currency === 'USD').points.map((point) => [point.label, point.total]), [['September 2026', 10], ['November 2026', 50]]);
  assert.deepEqual(approvedInvoiceSeries(values.filter((item) => item.status !== 'Approved')), []);
});

test('work duration sums repeated sessions and subtracts an in-progress break without inventing active time', (t) => {
  t.mock.method(Date, 'now', () => now.getTime());
  const data = createSeed();
  data.workSessions = [
    { id: 'session1', userId: 'usr_john', workDate: '2026-11-07', clockIn: '2026-11-07T09:00:00Z', clockOut: '2026-11-07T10:00:00Z', breakSeconds: 0 },
    { id: 'session2', userId: 'usr_john', workDate: '2026-11-07', clockIn: '2026-11-07T11:00:00Z', clockOut: null, breakSeconds: 300 }
  ];
  data.breakLogs = [{ id: 'break1', sessionId: 'session2', startedAt: '2026-11-07T11:50:00Z', endedAt: null }];
  const result = formatAttendance(data, { ...clock('usr_john', '2026-11-07'), clockOut: null });
  assert.equal(result.workedMinutes, 105);
  assert.equal(result.workedLabel, '1h 45m');
  assert.equal(result.activeLabel, '0h 02m');
  assert.equal(result.incomplete, false);
});
