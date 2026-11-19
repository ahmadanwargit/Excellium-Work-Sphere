import { isAvailablePerson, isStaffRole } from '../../../shared/access-control.mjs';
import { HttpError } from '../utils/http-error.js';

const DAY = 86_400_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const round = (value) => Math.round(value * 10) / 10;
const ratio = (part, total) => total ? round(part / total * 100) : null;

export function workDaysFor(value = '') {
  const names = value.toLowerCase().match(/\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/g) ?? [];
  const indices = names.map((name) => DAY_NAMES.findIndex((day) => day.toLowerCase() === name.slice(0, 3)));
  if (indices.length === 2 && /\b(to|through)\b|[-–—]/i.test(value)) {
    const result = [];
    for (let i = indices[0]; result.length < 7; i = (i + 1) % 7) { result.push(i); if (i === indices[1]) break; }
    return { days: result, fallback: false };
  }
  return indices.length ? { days: [...new Set(indices)], fallback: false } : { days: [1, 2, 3, 4, 5], fallback: true };
}

export function attendanceRanking(data, month, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  month ??= today.slice(0, 7);
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < '2000-01' || month > today.slice(0, 7)) throw new HttpError(400, 'Choose a valid attendance month from January 2000 through the current month');
  const start = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const end = last < today ? last : today;
  const schedule = workDaysFor(data.organization.workWeek);
  const [hours, minutes] = data.organization.standardStartTime.split(':').map(Number);
  const lateAfterMinutes = hours * 60 + minutes + 5;
  const periodDays = [];
  for (let value = new Date(`${start}T00:00:00Z`).getTime(); value <= new Date(`${end}T00:00:00Z`).getTime(); value += DAY) {
    const date = new Date(value);
    if (schedule.days.includes(date.getUTCDay())) periodDays.push(date.toISOString().slice(0, 10));
  }
  const rows = data.users.filter((person) => isAvailablePerson(person) && isStaffRole(person.role)).map((person) => {
    const records = data.attendance.filter((record) => record.userId === person.id);
    const sessions = (data.workSessions ?? []).filter((session) => session.userId === person.id);
    const knownDates = [person.createdAt?.slice(0, 10), ...records.map((record) => record.date), ...sessions.map((session) => session.workDate)].filter(Boolean).sort();
    const joined = person.startDate || knownDates[0] || start;
    let expectedDays = 0; let presentDays = 0; let lateDays = 0; let excusedDays = 0;
    for (const date of periodDays.filter((day) => day >= joined)) {
      const daily = records.filter((record) => record.date === date);
      const clocks = [...daily.map((record) => record.clockIn), ...sessions.filter((session) => session.workDate === date).map((session) => session.clockIn)].filter(Boolean).sort();
      const present = clocks.length > 0 || daily.some((record) => ['Present', 'On time', 'Late', 'Early departure'].includes(record.status));
      const leave = !present && (daily.some((record) => record.status === 'On leave') || data.leaveRequests.some((item) => item.employeeId === person.id && item.status === 'Approved' && item.startDate <= date && item.endDate >= date));
      if (leave) { excusedDays += 1; continue; }
      expectedDays += 1;
      if (present) {
        presentDays += 1;
        const first = clocks[0] ? new Date(clocks[0]) : null;
        if (first ? first.getUTCHours() * 60 + first.getUTCMinutes() > lateAfterMinutes : daily.some((record) => record.status === 'Late')) lateDays += 1;
      }
    }
    return { employee: { id: person.id, name: person.name, department: person.department, roleName: person.roleName }, expectedDays, presentDays, absentDays: expectedDays - presentDays, excusedDays, lateDays, onTimeDays: presentDays - lateDays, attendanceRate: ratio(presentDays, expectedDays), onTimeRate: ratio(presentDays - lateDays, presentDays), rank: null };
  });
  rows.sort((a, b) => (b.presentDays > 0) - (a.presentDays > 0) || (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1) || (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1) || b.presentDays - a.presentDays || a.employee.name.localeCompare(b.employee.name));
  rows.forEach((row, index) => {
    if (!row.presentDays) return;
    const previous = rows[index - 1];
    row.rank = previous && previous.attendanceRate === row.attendanceRate && previous.onTimeRate === row.onTimeRate && previous.presentDays === row.presentDays ? previous.rank : index + 1;
  });
  const departments = [...new Set(rows.map((row) => row.employee.department))].map((name) => {
    const members = rows.filter((row) => row.employee.department === name);
    const expectedDays = members.reduce((sum, row) => sum + row.expectedDays, 0);
    const presentDays = members.reduce((sum, row) => sum + row.presentDays, 0);
    return { name, staffCount: members.length, expectedDays, presentDays, attendanceRate: ratio(presentDays, expectedDays) };
  }).sort((a, b) => (b.attendanceRate ?? -1) - (a.attendanceRate ?? -1) || a.name.localeCompare(b.name));
  const expected = rows.reduce((sum, row) => sum + row.expectedDays, 0);
  const present = rows.reduce((sum, row) => sum + row.presentDays, 0);
  return {
    month, start, end, timeZone: 'UTC', updatedAt: now.toISOString(), workWeek: schedule.days.map((index) => DAY_NAMES[index]).join(', '), workWeekFallback: schedule.fallback,
    methodology: 'Attendance rate = recorded days present ÷ scheduled workdays elapsed, excluding approved/logged leave and days before joining. Ties use punctuality, then days present. No recorded attendance means unranked; this is not a performance score. Today can still change. Public holidays are not configured.',
    punctualityRule: `On time through ${data.organization.standardStartTime} UTC + 5 minutes. Repeat clock-ins count once per day, using the earliest clock-in.`,
    summary: { totalStaff: rows.length, rankedStaff: rows.filter((row) => row.rank !== null).length, presentDays: present, expectedDays: expected, attendanceRate: ratio(present, expected) },
    rows, departments
  };
}
