import { createServer as createHttpServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createSeed } from './backend/seed.mjs';

const PROJECT_ROOT = resolve(process.cwd());
const DEFAULT_DATA_FILE = join(PROJECT_ROOT, 'data', 'store.json');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const ROLES = new Set(['employee', 'trainer', 'manager', 'admin']);
const INVOICE_STATUSES = new Set(['Approved', 'Rejected']);
const EQUIPMENT_STATUSES = new Set(['Approved', 'Rejected']);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  async initialise() {
    await mkdir(resolve(this.filePath, '..'), { recursive: true });
    if (existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(await readFile(this.filePath, 'utf8'));
        if (!this.data || this.data.schemaVersion !== 1) throw new Error('unsupported schema');
      } catch (error) {
        throw new Error(`Could not load ${this.filePath}: ${error.message}`);
      }
    } else {
      this.data = createSeed();
      await this.save();
    }
    return this;
  }

  async save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const temporaryFile = `${this.filePath}.tmp`;
      await writeFile(temporaryFile, snapshot, 'utf8');
      await rename(temporaryFile, this.filePath);
    });
    return this.writeQueue;
  }

  async mutate(callback) {
    const result = callback(this.data);
    await this.save();
    return result;
  }
}

function now() {
  return new Date();
}

function isoNow() {
  return now().toISOString();
}

function dayKey(date = now()) {
  return date.toISOString().slice(0, 10);
}

function id(prefix) {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

function isManager(user) {
  return user.role === 'manager' || user.role === 'admin';
}

function isAdmin(user) {
  return user.role === 'admin';
}

function publicUser(user) {
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

function userById(data, userId) {
  return data.users.find((user) => user.id === userId);
}

function requireValue(value, name, { max = 500 } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, `${name} is required`);
  const clean = value.trim();
  if (clean.length > max) throw new ApiError(400, `${name} must be at most ${max} characters`);
  return clean;
}

function asPositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new ApiError(400, 'Amount must be between 0 and 1,000,000');
  }
  return Math.round(amount * 100) / 100;
}

function statusForClockIn(data, clockIn) {
  const [hours, minutes] = data.organization.standardStartTime.split(':').map(Number);
  const start = new Date(clockIn);
  const late = start.getUTCHours() > hours || (start.getUTCHours() === hours && start.getUTCMinutes() > minutes + 5);
  return late ? 'Late' : 'On time';
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 3600)}h ${String(Math.floor(total / 60) % 60).padStart(2, '0')}m`;
}

function minutesBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function formatAttendance(data, attendance) {
  const user = userById(data, attendance.userId);
  const liveSeconds = attendance.clockIn && !attendance.clockOut
    ? Math.max(0, Math.floor((Date.now() - new Date(attendance.clockIn).getTime()) / 1000))
    : 0;
  const workedSeconds = attendance.clockIn
    ? (attendance.clockOut
      ? Math.max(0, Math.floor((new Date(attendance.clockOut) - new Date(attendance.clockIn)) / 1000) - (attendance.breakMinutes || 0) * 60)
      : Math.max(0, liveSeconds - (attendance.breakMinutes || 0) * 60))
    : 0;
  return {
    ...attendance,
    employee: user ? publicUser(user) : null,
    workedMinutes: Math.round(workedSeconds / 60),
    workedLabel: formatDuration(workedSeconds),
    activeLabel: formatDuration((attendance.activeSeconds || 0) + (attendance.clockOut ? 0 : liveSeconds)),
    idleLabel: formatDuration(attendance.idleSeconds || 0),
    live: Boolean(attendance.clockIn && !attendance.clockOut)
  };
}

function formatInvoice(data, invoice) {
  const employee = userById(data, invoice.employeeId);
  const approver = userById(data, invoice.decidedBy);
  return {
    ...invoice,
    employee: employee ? publicUser(employee) : null,
    decidedByUser: approver ? publicUser(approver) : null
  };
}

function formatEquipmentRequest(data, request) {
  const employee = userById(data, request.employeeId);
  const approver = userById(data, request.decidedBy);
  return {
    ...request,
    employee: employee ? publicUser(employee) : null,
    decidedByUser: approver ? publicUser(approver) : null
  };
}

function formatAsset(data, asset) {
  const assignee = userById(data, asset.assignedTo);
  return { ...asset, assignee: assignee ? publicUser(assignee) : null };
}

function formatMeeting(data, meeting) {
  const creator = userById(data, meeting.createdBy);
  return {
    ...meeting,
    creator: creator ? publicUser(creator) : null,
    participantDetails: meeting.participants.map((participantId) => publicUser(userById(data, participantId))).filter(Boolean)
  };
}

function visibleNotifications(data, user) {
  return data.notifications
    .filter((notification) => notification.userId === user.id || (!notification.userId && notification.audience.includes(user.role)))
    .map((notification) => ({ ...notification, read: notification.readBy.includes(user.id) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addNotification(data, { userId = null, audience = [], message }) {
  const notification = {
    id: id('ntf'),
    userId,
    audience,
    message,
    createdAt: isoNow(),
    readBy: []
  };
  data.notifications.unshift(notification);
  return notification;
}

function addAudit(data, actorId, action) {
  data.auditLog.unshift({ id: id('aud'), timestamp: isoNow(), actorId: actorId || null, action });
}

function nextNumberedId(items, prefix, field = 'id') {
  const numbers = items
    .map((item) => Number(String(item[field]).replace(/^\D+/, '')))
    .filter(Number.isFinite);
  return `${prefix}-${Math.max(0, ...numbers) + 1}`;
}

function toPublicDirectory(data) {
  return data.users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    department: user.department,
    role: user.role
  }));
}

function comparePassword(password, user) {
  const supplied = scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, pair) => {
    const index = pair.indexOf('=');
    if (index > 0) cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
    return cookies;
  }, {});
}

async function readJson(request) {
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) throw new ApiError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(body));
}

function sendError(response, error) {
  const status = error instanceof ApiError ? error.status : 500;
  if (!(error instanceof ApiError)) console.error(error);
  sendJson(response, status, {
    error: error instanceof ApiError ? error.message : 'An unexpected server error occurred',
    ...(error instanceof ApiError && error.details ? { details: error.details } : {})
  });
}

function sendNoContent(response, headers = {}) {
  response.writeHead(204, { 'Cache-Control': 'no-store', ...headers });
  response.end();
}

function parseParticipantIds(data, participants, creatorId) {
  if (!participants) return [creatorId];
  const supplied = Array.isArray(participants) ? participants : String(participants).split(',');
  const ids = supplied.map((item) => {
    const value = String(item).trim().toLowerCase();
    if (!value) return null;
    const user = data.users.find((candidate) => candidate.id === value || candidate.email.toLowerCase() === value || candidate.name.toLowerCase() === value);
    if (!user) throw new ApiError(400, `Unknown participant: ${String(item).trim()}`);
    return user.id;
  }).filter(Boolean);
  return [...new Set([creatorId, ...ids])];
}

function requireManager(user) {
  if (!isManager(user)) throw new ApiError(403, 'This action requires management access');
}

function requireAdmin(user) {
  if (!isAdmin(user)) throw new ApiError(403, 'This action requires finance or admin access');
}

function currentRecord(data, userId) {
  return data.attendance.find((record) => record.userId === userId && record.date === dayKey() && record.clockIn && !record.clockOut);
}

function attendanceSummary(data, user) {
  const records = data.attendance.filter((record) => record.userId === user.id);
  const totalActiveSeconds = records.reduce((sum, record) => sum + (record.activeSeconds || 0), 0);
  const lateArrivals = records.filter((record) => record.status === 'Late').length;
  return {
    current: currentRecord(data, user.id) ? formatAttendance(data, currentRecord(data, user.id)) : null,
    records: records.sort((a, b) => b.date.localeCompare(a.date)).map((record) => formatAttendance(data, record)),
    totals: { totalActiveSeconds, lateArrivals }
  };
}

function managerDashboard(data) {
  const today = dayKey();
  const attendance = data.attendance.filter((record) => record.date === today);
  const present = attendance.filter((record) => ['Present', 'On time', 'Late', 'Early departure'].includes(record.status)).length;
  return {
    totalEmployees: data.users.length,
    present,
    absent: attendance.filter((record) => record.status === 'Absent').length,
    onLeave: attendance.filter((record) => record.status === 'On leave').length,
    pendingInvoices: data.invoices.filter((invoice) => invoice.status === 'Pending').length,
    pendingEquipmentRequests: data.equipmentRequests.filter((request) => request.status === 'Pending').length,
    upcomingMeetings: data.meetings.filter((meeting) => new Date(meeting.startsAt) >= now()).length
  };
}

async function serveStatic(request, response, url, projectRoot) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new ApiError(405, 'Method not allowed');
  const decodedPath = decodeURIComponent(url.pathname);
  const requestedPath = decodedPath === '/' ? 'Excellium Global Services frontend.html' : decodedPath.replace(/^\/+/, '');
  // The UI is self-contained. Deliberately expose only it, never source files,
  // local JSON data, or environment files that happen to share this directory.
  if (requestedPath !== 'Excellium Global Services frontend.html') throw new ApiError(404, 'Not found');
  const candidate = resolve(projectRoot, normalize(requestedPath));
  if (!candidate.startsWith(`${projectRoot}/`) && candidate !== projectRoot) throw new ApiError(403, 'Forbidden');
  if (basename(candidate).startsWith('.')) throw new ApiError(404, 'Not found');

  try {
    const content = await readFile(candidate);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(candidate).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': extname(candidate) === '.html' ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method !== 'HEAD') response.end(content);
    else response.end();
  } catch (error) {
    if (error && error.code === 'ENOENT') throw new ApiError(404, 'Not found');
    throw error;
  }
}

export async function createApp({ dataFile = DEFAULT_DATA_FILE, projectRoot = PROJECT_ROOT } = {}) {
  const store = await new JsonStore(dataFile).initialise();
  const sessions = new Map();

  function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
    return token;
  }

  function getAuthenticatedUser(request) {
    const token = parseCookies(request.headers.cookie).excellium_session || request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new ApiError(401, 'Sign in is required');
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(token);
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }
    const user = userById(store.data, session.userId);
    if (!user) throw new ApiError(401, 'Your account is no longer available');
    return { user, token };
  }

  async function handleApi(request, response, url) {
    const { pathname } = url;

    if (request.method === 'GET' && pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, service: 'excellium-api', schemaVersion: store.data.schemaVersion });
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJson(request);
      const email = requireValue(body.email, 'Email', { max: 254 }).toLowerCase();
      const password = requireValue(body.password, 'Password', { max: 500 });
      const user = store.data.users.find((candidate) => candidate.email.toLowerCase() === email);
      if (!user || !comparePassword(password, user)) throw new ApiError(401, 'Incorrect email or password');
      if (body.role && body.role !== user.role) throw new ApiError(403, 'This email does not belong to the selected role');
      const token = createSession(user.id);
      return sendJson(response, 200, { user: publicUser(user), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() }, {
        'Set-Cookie': `excellium_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
      });
    }

    if (request.method === 'POST' && pathname === '/api/auth/logout') {
      const token = parseCookies(request.headers.cookie).excellium_session;
      if (token) sessions.delete(token);
      return sendNoContent(response, { 'Set-Cookie': 'excellium_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    const { user } = getAuthenticatedUser(request);

    if (request.method === 'GET' && pathname === '/api/me') {
      return sendJson(response, 200, { user: publicUser(user) });
    }

    if (request.method === 'GET' && pathname === '/api/dashboard') {
      const base = { role: user.role, user: publicUser(user), notifications: visibleNotifications(store.data, user).filter((item) => !item.read).length };
      if (isManager(user)) return sendJson(response, 200, { ...base, summary: managerDashboard(store.data) });
      return sendJson(response, 200, { ...base, summary: attendanceSummary(store.data, user) });
    }

    if (request.method === 'GET' && pathname === '/api/attendance') {
      return sendJson(response, 200, attendanceSummary(store.data, user));
    }

    if (request.method === 'GET' && pathname === '/api/attendance/team') {
      requireManager(user);
      const today = url.searchParams.get('date') || dayKey();
      const records = store.data.users.map((employee) => {
        const attendance = store.data.attendance.find((record) => record.userId === employee.id && record.date === today) || {
          id: null, userId: employee.id, date: today, clockIn: null, clockOut: null, breakMinutes: 0, status: 'Absent', activeSeconds: 0, idleSeconds: 0
        };
        return formatAttendance(store.data, attendance);
      });
      return sendJson(response, 200, { date: today, records });
    }

    if (request.method === 'POST' && pathname === '/api/attendance/clock-in') {
      let created;
      await store.mutate((data) => {
        if (currentRecord(data, user.id)) throw new ApiError(409, 'You are already clocked in');
        const clockIn = isoNow();
        const existing = data.attendance.find((record) => record.userId === user.id && record.date === dayKey());
        if (existing) {
          existing.clockIn = clockIn;
          existing.clockOut = null;
          existing.breakMinutes = 0;
          existing.breakStartedAt = null;
          existing.breakEndsAt = null;
          existing.activeSeconds = 0;
          existing.idleSeconds = 0;
          existing.status = statusForClockIn(data, clockIn);
          created = existing;
        } else {
          created = {
            id: id('att'), userId: user.id, date: dayKey(), clockIn, clockOut: null, breakMinutes: 0,
            breakStartedAt: null, breakEndsAt: null, status: statusForClockIn(data, clockIn), activeSeconds: 0, idleSeconds: 0
          };
          data.attendance.unshift(created);
        }
        addAudit(data, user.id, 'Clocked in');
      });
      return sendJson(response, 201, { attendance: formatAttendance(store.data, created) });
    }

    if (request.method === 'POST' && pathname === '/api/attendance/clock-out') {
      let updated;
      await store.mutate((data) => {
        updated = currentRecord(data, user.id);
        if (!updated) throw new ApiError(409, 'You must be clocked in before clocking out');
        if (updated.breakStartedAt) {
          updated.breakMinutes += minutesBetween(updated.breakStartedAt, isoNow());
          updated.breakStartedAt = null;
          updated.breakEndsAt = null;
        }
        updated.clockOut = isoNow();
        addAudit(data, user.id, 'Clocked out');
      });
      return sendJson(response, 200, { attendance: formatAttendance(store.data, updated) });
    }

    if (request.method === 'POST' && pathname === '/api/attendance/break') {
      const body = await readJson(request);
      let updated;
      await store.mutate((data) => {
        updated = currentRecord(data, user.id);
        if (!updated) throw new ApiError(409, 'You must be clocked in before starting a break');
        const action = body.action || 'start';
        if (action === 'start') {
          const minutes = Number(body.minutes);
          if (![5, 15].includes(minutes)) throw new ApiError(400, 'Break must be 5 or 15 minutes');
          if (updated.breakStartedAt) throw new ApiError(409, 'A break is already in progress');
          updated.breakStartedAt = isoNow();
          updated.breakEndsAt = new Date(Date.now() + minutes * 60_000).toISOString();
          addAudit(data, user.id, `Started a ${minutes}-minute break`);
        } else if (action === 'end') {
          if (!updated.breakStartedAt) throw new ApiError(409, 'No break is in progress');
          updated.breakMinutes += minutesBetween(updated.breakStartedAt, isoNow());
          updated.breakStartedAt = null;
          updated.breakEndsAt = null;
          addAudit(data, user.id, 'Ended a break');
        } else {
          throw new ApiError(400, 'Break action must be start or end');
        }
      });
      return sendJson(response, 200, { attendance: formatAttendance(store.data, updated) });
    }

    if (request.method === 'POST' && pathname === '/api/attendance/activity') {
      const body = await readJson(request);
      let updated;
      await store.mutate((data) => {
        updated = currentRecord(data, user.id);
        if (!updated) throw new ApiError(409, 'You must be clocked in before sending activity');
        const activeSeconds = Math.min(60, Math.max(0, Number(body.activeSeconds) || 0));
        const idleSeconds = Math.min(60, Math.max(0, Number(body.idleSeconds) || 0));
        updated.activeSeconds = (updated.activeSeconds || 0) + activeSeconds;
        updated.idleSeconds = (updated.idleSeconds || 0) + idleSeconds;
      });
      return sendJson(response, 200, { attendance: formatAttendance(store.data, updated) });
    }

    if (request.method === 'POST' && pathname === '/api/attendance/corrections') {
      const body = await readJson(request);
      const date = requireValue(body.date, 'Date', { max: 10 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'Date must use YYYY-MM-DD');
      const reason = requireValue(body.reason, 'Reason', { max: 1000 });
      let correction;
      await store.mutate((data) => {
        correction = { id: id('cor'), userId: user.id, date, reason, status: 'Pending', createdAt: isoNow() };
        data.attendanceCorrections.unshift(correction);
        addNotification(data, { audience: ['manager', 'admin'], message: `${user.name} requested an attendance correction for ${date}` });
        addAudit(data, user.id, `Submitted attendance correction for ${date}`);
      });
      return sendJson(response, 201, { correction });
    }

    if (request.method === 'GET' && pathname === '/api/invoices') {
      const invoices = (isManager(user) ? store.data.invoices : store.data.invoices.filter((invoice) => invoice.employeeId === user.id))
        .map((invoice) => formatInvoice(store.data, invoice));
      return sendJson(response, 200, { invoices });
    }

    if (request.method === 'POST' && pathname === '/api/invoices') {
      const body = await readJson(request);
      const month = requireValue(body.month, 'Month', { max: 50 });
      const paymentDetails = typeof body.paymentDetails === 'string' ? body.paymentDetails.trim().slice(0, 250) : '';
      const documentName = typeof body.documentName === 'string' ? body.documentName.trim().slice(0, 250) : null;
      let invoice;
      await store.mutate((data) => {
        invoice = {
          id: nextNumberedId(data.invoices, 'INV'), employeeId: user.id, month, amount: asPositiveAmount(body.amount), status: 'Pending',
          paymentDetails, documentName: documentName || null, submittedAt: isoNow(), decidedAt: null, decidedBy: null
        };
        data.invoices.unshift(invoice);
        addNotification(data, { audience: ['manager', 'admin'], message: `Invoice ${invoice.id} is waiting for approval` });
        addAudit(data, user.id, `Submitted ${invoice.id}`);
      });
      return sendJson(response, 201, { invoice: formatInvoice(store.data, invoice) });
    }

    const invoiceMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/);
    if (invoiceMatch && request.method === 'PATCH') {
      requireManager(user);
      const body = await readJson(request);
      const status = requireValue(body.status, 'Status', { max: 20 });
      if (!INVOICE_STATUSES.has(status)) throw new ApiError(400, 'Invoice status must be Approved or Rejected');
      let invoice;
      await store.mutate((data) => {
        invoice = data.invoices.find((item) => item.id === decodeURIComponent(invoiceMatch[1]));
        if (!invoice) throw new ApiError(404, 'Invoice not found');
        if (invoice.status !== 'Pending') throw new ApiError(409, 'Only pending invoices can be decided');
        invoice.status = status;
        invoice.decidedAt = isoNow();
        invoice.decidedBy = user.id;
        addNotification(data, { userId: invoice.employeeId, message: `Your invoice ${invoice.id} was ${status.toLowerCase()}` });
        addAudit(data, user.id, `${status} ${invoice.id}`);
      });
      return sendJson(response, 200, { invoice: formatInvoice(store.data, invoice) });
    }

    if (request.method === 'GET' && pathname === '/api/meetings') {
      const meetings = (isManager(user)
        ? store.data.meetings
        : store.data.meetings.filter((meeting) => meeting.createdBy === user.id || meeting.participants.includes(user.id)))
        .map((meeting) => formatMeeting(store.data, meeting));
      return sendJson(response, 200, { meetings });
    }

    if (request.method === 'POST' && pathname === '/api/meetings') {
      const body = await readJson(request);
      const title = requireValue(body.title, 'Title', { max: 140 });
      const startsAt = requireValue(body.startsAt, 'Date and time', { max: 40 });
      if (Number.isNaN(new Date(startsAt).getTime())) throw new ApiError(400, 'Date and time must be a valid ISO date');
      let meeting;
      await store.mutate((data) => {
        const participants = parseParticipantIds(data, body.participants, user.id);
        meeting = { id: id('mtg'), title, startsAt: new Date(startsAt).toISOString(), participants, status: isManager(user) ? 'Confirmed' : 'Pending', createdBy: user.id };
        data.meetings.unshift(meeting);
        participants.filter((participantId) => participantId !== user.id).forEach((participantId) => addNotification(data, { userId: participantId, message: `You were invited to ${title}` }));
        addAudit(data, user.id, `Scheduled meeting: ${title}`);
      });
      return sendJson(response, 201, { meeting: formatMeeting(store.data, meeting) });
    }

    if (request.method === 'GET' && (pathname === '/api/equipment' || pathname === '/api/equipment/requests')) {
      const requestItems = (isManager(user) ? store.data.equipmentRequests : store.data.equipmentRequests.filter((item) => item.employeeId === user.id))
        .map((item) => formatEquipmentRequest(store.data, item));
      const assets = (isManager(user) ? store.data.assets : store.data.assets.filter((asset) => asset.assignedTo === user.id))
        .map((asset) => formatAsset(store.data, asset));
      return sendJson(response, 200, { assets, requests: requestItems });
    }

    if (request.method === 'POST' && pathname === '/api/equipment/requests') {
      const body = await readJson(request);
      const item = requireValue(body.item, 'Item', { max: 150 });
      const type = requireValue(body.type, 'Request type', { max: 50 });
      const allowedTypes = new Set(['Replacement', 'Upgrade', 'Repair', 'Return']);
      if (!allowedTypes.has(type)) throw new ApiError(400, 'Request type is invalid');
      const reason = requireValue(body.reason, 'Reason', { max: 1000 });
      let equipmentRequest;
      await store.mutate((data) => {
        equipmentRequest = { id: nextNumberedId(data.equipmentRequests, 'REQ'), employeeId: user.id, item, type, reason, status: 'Pending', createdAt: isoNow(), decidedAt: null, decidedBy: null };
        data.equipmentRequests.unshift(equipmentRequest);
        addNotification(data, { audience: ['manager', 'admin'], message: `${user.name} submitted equipment request ${equipmentRequest.id}` });
        addAudit(data, user.id, `Submitted equipment request ${equipmentRequest.id}`);
      });
      return sendJson(response, 201, { request: formatEquipmentRequest(store.data, equipmentRequest) });
    }

    const equipmentMatch = pathname.match(/^\/api\/equipment\/requests\/([^/]+)$/);
    if (equipmentMatch && request.method === 'PATCH') {
      requireManager(user);
      const body = await readJson(request);
      const status = requireValue(body.status, 'Status', { max: 20 });
      if (!EQUIPMENT_STATUSES.has(status)) throw new ApiError(400, 'Request status must be Approved or Rejected');
      let equipmentRequest;
      await store.mutate((data) => {
        equipmentRequest = data.equipmentRequests.find((item) => item.id === decodeURIComponent(equipmentMatch[1]));
        if (!equipmentRequest) throw new ApiError(404, 'Equipment request not found');
        if (equipmentRequest.status !== 'Pending') throw new ApiError(409, 'Only pending requests can be decided');
        equipmentRequest.status = status;
        equipmentRequest.decidedAt = isoNow();
        equipmentRequest.decidedBy = user.id;
        addNotification(data, { userId: equipmentRequest.employeeId, message: `Your equipment request ${equipmentRequest.id} was ${status.toLowerCase()}` });
        addAudit(data, user.id, `${status} ${equipmentRequest.id}`);
      });
      return sendJson(response, 200, { request: formatEquipmentRequest(store.data, equipmentRequest) });
    }

    if (request.method === 'GET' && pathname === '/api/directory') {
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const people = toPublicDirectory(store.data).filter((person) => !query || `${person.name} ${person.department} ${person.title}`.toLowerCase().includes(query));
      return sendJson(response, 200, { people });
    }

    if (request.method === 'GET' && pathname === '/api/reports') {
      requireManager(user);
      const type = url.searchParams.get('type') || 'Attendance';
      const allowedTypes = new Set(['Attendance', 'Payroll', 'Performance', 'Equipment', 'Meetings']);
      if (!allowedTypes.has(type)) throw new ApiError(400, 'Unknown report type');
      const reportData = {
        Attendance: [['Present', store.data.attendance.filter((record) => ['Present', 'On time', 'Late'].includes(record.status)).length], ['Late', store.data.attendance.filter((record) => record.status === 'Late').length], ['Absent', store.data.attendance.filter((record) => record.status === 'Absent').length]],
        Payroll: [['Approved', store.data.invoices.filter((invoice) => invoice.status === 'Approved').reduce((sum, invoice) => sum + invoice.amount, 0)], ['Pending', store.data.invoices.filter((invoice) => invoice.status === 'Pending').reduce((sum, invoice) => sum + invoice.amount, 0)], ['Rejected', store.data.invoices.filter((invoice) => invoice.status === 'Rejected').reduce((sum, invoice) => sum + invoice.amount, 0)]],
        Performance: [['Engineering', 89], ['Design', 96], ['Finance', 89], ['Sales', 78], ['Operations', 87]],
        Equipment: [['In use', store.data.assets.filter((asset) => asset.status === 'In use').length], ['Available', store.data.assets.filter((asset) => asset.status === 'Available').length], ['In repair', store.data.assets.filter((asset) => asset.status === 'In repair').length]],
        Meetings: [['Confirmed', store.data.meetings.filter((meeting) => meeting.status === 'Confirmed').length], ['Pending', store.data.meetings.filter((meeting) => meeting.status === 'Pending').length]]
      };
      return sendJson(response, 200, { type, points: reportData[type].map(([label, value]) => ({ label, value })) });
    }

    if (request.method === 'GET' && pathname === '/api/notifications') {
      return sendJson(response, 200, { notifications: visibleNotifications(store.data, user) });
    }

    if (request.method === 'POST' && pathname === '/api/notifications/read') {
      const body = await readJson(request);
      await store.mutate((data) => {
        const items = data.notifications.filter((notification) => notification.userId === user.id || (!notification.userId && notification.audience.includes(user.role)));
        items.filter((notification) => !body.id || notification.id === body.id).forEach((notification) => {
          if (!notification.readBy.includes(user.id)) notification.readBy.push(user.id);
        });
      });
      return sendNoContent(response);
    }

    if (request.method === 'GET' && pathname === '/api/settings') {
      const responseBody = { profile: publicUser(user), organization: isAdmin(user) ? store.data.organization : undefined };
      return sendJson(response, 200, responseBody);
    }

    if (request.method === 'PATCH' && pathname === '/api/settings/profile') {
      const body = await readJson(request);
      let updated;
      await store.mutate((data) => {
        updated = userById(data, user.id);
        if (body.name !== undefined) updated.name = requireValue(body.name, 'Full name', { max: 100 });
        if (body.title !== undefined) updated.title = requireValue(body.title, 'Job title', { max: 100 });
        addAudit(data, user.id, 'Updated profile');
      });
      return sendJson(response, 200, { user: publicUser(updated) });
    }

    if (request.method === 'PATCH' && pathname === '/api/settings/organization') {
      requireAdmin(user);
      const body = await readJson(request);
      let organization;
      await store.mutate((data) => {
        if (body.name !== undefined) data.organization.name = requireValue(body.name, 'Company name', { max: 120 });
        if (body.workWeek !== undefined) data.organization.workWeek = requireValue(body.workWeek, 'Work week', { max: 50 });
        if (body.standardStartTime !== undefined) {
          const time = requireValue(body.standardStartTime, 'Standard start time', { max: 5 });
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(400, 'Standard start time must use HH:MM');
          data.organization.standardStartTime = time;
        }
        if (body.inactivityLockMinutes !== undefined) {
          const minutes = Number(body.inactivityLockMinutes);
          if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new ApiError(400, 'Inactivity lock must be between 1 and 60 minutes');
          data.organization.inactivityLockMinutes = minutes;
        }
        organization = data.organization;
        addAudit(data, user.id, 'Updated organization settings');
      });
      return sendJson(response, 200, { organization });
    }

    if (request.method === 'GET' && pathname === '/api/audit-log') {
      requireAdmin(user);
      const auditLog = store.data.auditLog.slice(0, 100).map((entry) => ({ ...entry, actor: entry.actorId ? publicUser(userById(store.data, entry.actorId)) : null }));
      return sendJson(response, 200, { auditLog });
    }

    throw new ApiError(404, 'API route not found');
  }

  const server = createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
      else await serveStatic(request, response, url, projectRoot);
    } catch (error) {
      sendError(response, error);
    }
  });

  return { server, store };
}

async function start() {
  const { server } = await createApp();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Excellium Work Sphere is available at http://${host}:${port}`);
  });
}

const entryPoint = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (import.meta.url === entryPoint) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
