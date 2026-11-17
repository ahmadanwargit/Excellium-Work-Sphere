import { createSeed } from './seed.js';
import { accessGroupForRole } from '../services/access-group.service.js';
import { createSupabaseServerClient } from '../services/supabase-client.service.js';
import { HttpError } from '../utils/http-error.js';

const SETTINGS_ID = 'workspace';
const TABLE = {
  settings: 'excellium_workspace_settings',
  users: 'excellium_users',
  attendance: 'excellium_attendance',
  corrections: 'excellium_attendance_corrections',
  workSessions: 'excellium_work_sessions',
  breakLogs: 'excellium_break_logs',
  heartbeats: 'excellium_activity_heartbeats',
  samples: 'excellium_activity_samples',
  flags: 'excellium_activity_flags',
  invoices: 'excellium_invoices',
  meetings: 'excellium_meetings',
  participants: 'excellium_meeting_participants',
  requests: 'excellium_equipment_requests',
  assets: 'excellium_assets',
  notifications: 'excellium_notifications',
  audiences: 'excellium_notification_audiences',
  reads: 'excellium_notification_reads',
  audit: 'excellium_audit_log'
};

const nullable = (value) => value ?? null;
const clone = (value) => structuredClone(value);
const asNumber = (value) => value === null || value === undefined ? value : Number(value);

function fileColumns(prefix, file) {
  return {
    [`${prefix}_bucket`]: file?.bucket ?? null,
    [`${prefix}_path`]: file?.path ?? null,
    [`${prefix}_original_name`]: file?.originalName ?? null,
    [`${prefix}_mime_type`]: file?.mimeType ?? null,
    [`${prefix}_size`]: file?.size ?? null,
    [`${prefix}_uploaded_at`]: file?.uploadedAt ?? null
  };
}

function fileFromColumns(prefix, row) {
  const path = row[`${prefix}_path`];
  if (!path) return null;
  return {
    bucket: row[`${prefix}_bucket`],
    path,
    originalName: row[`${prefix}_original_name`],
    mimeType: row[`${prefix}_mime_type`],
    size: asNumber(row[`${prefix}_size`]),
    uploadedAt: row[`${prefix}_uploaded_at`]
  };
}

function groupBy(rows, property) {
  return rows.reduce((groups, row) => {
    const key = row[property];
    (groups.get(key) ?? groups.set(key, []).get(key)).push(row);
    return groups;
  }, new Map());
}

function resultData(result, label) {
  if (result.error) throw new Error(`Unable to load ${label} from Supabase: ${result.error.message}`);
  return result.data ?? [];
}

function changedRows(previousRows, nextRows) {
  const previousById = new Map((previousRows ?? []).map((row) => [row.id, JSON.stringify(row)]));
  return (nextRows ?? []).filter((row) => previousById.get(row.id) !== JSON.stringify(row));
}

/** Converts the in-memory domain model into explicit relational table rows. */
export function serializeWorkspace(data) {
  return {
    settings: {
      id: SETTINGS_ID,
      schema_version: data.schemaVersion,
      company_name: data.organization.name,
      work_week: data.organization.workWeek,
      standard_start_time: data.organization.standardStartTime,
      inactivity_lock_minutes: data.organization.inactivityLockMinutes
    },
    users: data.users.map((user) => ({
      id: user.id, email: user.email, name: user.name, role: user.role, title: user.title, department: user.department,
      password_salt: user.passwordSalt, password_hash: user.passwordHash, created_at: user.createdAt
    })),
    attendance: data.attendance.map((record) => ({
      id: record.id, user_id: record.userId, work_date: record.date, clock_in: nullable(record.clockIn), clock_out: nullable(record.clockOut),
      break_minutes: record.breakMinutes ?? 0, break_started_at: nullable(record.breakStartedAt), break_ends_at: nullable(record.breakEndsAt),
      status: record.status, active_seconds: record.activeSeconds ?? 0, idle_seconds: record.idleSeconds ?? 0
    })),
    corrections: data.attendanceCorrections.map((item) => ({
      id: item.id, user_id: item.userId, work_date: item.date, reason: item.reason, status: item.status, created_at: item.createdAt
    })),
    workSessions: (data.workSessions ?? []).map((session) => ({
      id: session.id, user_id: session.userId, work_date: session.workDate, clock_in: session.clockIn, clock_out: nullable(session.clockOut), state: session.state,
      active_seconds: session.activeSeconds ?? 0, idle_seconds: session.idleSeconds ?? 0, break_seconds: session.breakSeconds ?? 0,
      suspicious_flag_count: session.suspiciousFlagCount ?? 0, created_at: session.createdAt, updated_at: session.updatedAt
    })),
    breakLogs: (data.breakLogs ?? []).map((item) => ({
      id: item.id, session_id: item.sessionId, user_id: item.userId, work_date: item.workDate, duration_minutes: item.durationMinutes,
      started_at: item.startedAt, expected_ends_at: item.expectedEndsAt, ended_at: nullable(item.endedAt), actual_seconds: item.actualSeconds ?? 0,
      overage_seconds: item.overageSeconds ?? 0, status: item.status
    })),
    heartbeats: (data.activityHeartbeats ?? []).map((item) => ({
      id: item.id, session_id: item.sessionId, user_id: item.userId, recorded_at: item.recordedAt, state: item.state, duration_seconds: item.durationSeconds ?? 0,
      mouse_clicks: item.mouseClicks ?? 0, keypresses: item.keypresses ?? 0, page_hidden: Boolean(item.pageHidden)
    })),
    samples: (data.activitySamples ?? []).map((item) => ({
      id: item.id, heartbeat_id: item.heartbeatId, session_id: item.sessionId, user_id: item.userId, x: item.x, y: item.y, event_at: item.eventAt, event_type: item.eventType
    })),
    flags: (data.activityFlags ?? []).map((item) => ({
      id: item.id, session_id: item.sessionId, user_id: item.userId, work_date: item.workDate, kind: item.kind, detected_at: item.detectedAt
    })),
    invoices: data.invoices.map((invoice) => ({
      id: invoice.id, employee_id: invoice.employeeId, invoice_month: invoice.month, amount: invoice.amount, status: invoice.status,
      payment_details: invoice.paymentDetails ?? '', ...fileColumns('document', invoice.document), submitted_at: invoice.submittedAt,
      decided_at: nullable(invoice.decidedAt), decided_by: nullable(invoice.decidedBy)
    })),
    meetings: data.meetings.map((meeting) => ({ id: meeting.id, title: meeting.title, starts_at: meeting.startsAt, status: meeting.status, created_by: meeting.createdBy })),
    participants: data.meetings.flatMap((meeting) => meeting.participants.map((userId) => ({ meeting_id: meeting.id, user_id: userId }))),
    equipmentRequests: data.equipmentRequests.map((request) => ({
      id: request.id, employee_id: request.employeeId, item: request.item, request_type: request.type, reason: request.reason, status: request.status,
      ...fileColumns('attachment', request.attachment), created_at: request.createdAt, decided_at: nullable(request.decidedAt), decided_by: nullable(request.decidedBy)
    })),
    assets: data.assets.map((asset) => ({
      id: asset.id, name: asset.name, asset_type: asset.type, serial_number: asset.serialNumber, assigned_to: nullable(asset.assignedTo), status: asset.status, issued_on: nullable(asset.issuedOn)
    })),
    notifications: data.notifications.map((notification) => ({ id: notification.id, user_id: nullable(notification.userId), message: notification.message, created_at: notification.createdAt })),
    audiences: data.notifications.flatMap((notification) => notification.audience.map((role) => ({ notification_id: notification.id, role }))),
    reads: data.notifications.flatMap((notification) => notification.readBy.map((userId) => ({ notification_id: notification.id, user_id: userId }))),
    audit: data.auditLog.map((entry) => ({
      id: entry.id, occurred_at: entry.timestamp, actor_id: nullable(entry.actorId), subject_user_id: nullable(entry.subjectUserId),
      session_id: nullable(entry.sessionId), break_log_id: nullable(entry.breakLogId), event_type: entry.eventType ?? 'GENERAL', action: entry.action
    }))
  };
}

/** Rebuilds the existing domain model from normalized Supabase rows. */
export function hydrateWorkspace(rows) {
  const participantsByMeeting = groupBy(rows.participants, 'meeting_id');
  const audiencesByNotification = groupBy(rows.audiences, 'notification_id');
  const readsByNotification = groupBy(rows.reads, 'notification_id');
  const settings = rows.settings;

  return {
    schemaVersion: settings.schema_version,
    organization: {
      name: settings.company_name,
      workWeek: settings.work_week,
      standardStartTime: String(settings.standard_start_time).slice(0, 5),
      inactivityLockMinutes: asNumber(settings.inactivity_lock_minutes)
    },
    users: rows.users.map((user) => ({
      id: user.id, email: user.email, name: user.name, role: user.role, accessGroup: user.access_group ?? accessGroupForRole(user.role), title: user.title, department: user.department,
      passwordSalt: user.password_salt, passwordHash: user.password_hash, createdAt: user.created_at
    })),
    attendance: rows.attendance.map((record) => ({
      id: record.id, userId: record.user_id, date: record.work_date, clockIn: record.clock_in, clockOut: record.clock_out,
      breakMinutes: asNumber(record.break_minutes), breakStartedAt: record.break_started_at, breakEndsAt: record.break_ends_at,
      status: record.status, activeSeconds: asNumber(record.active_seconds), idleSeconds: asNumber(record.idle_seconds)
    })),
    attendanceCorrections: rows.corrections.map((item) => ({
      id: item.id, userId: item.user_id, date: item.work_date, reason: item.reason, status: item.status, createdAt: item.created_at
    })),
    workSessions: (rows.workSessions ?? []).map((session) => ({
      id: session.id, userId: session.user_id, workDate: session.work_date, clockIn: session.clock_in, clockOut: session.clock_out, state: session.state,
      activeSeconds: asNumber(session.active_seconds), idleSeconds: asNumber(session.idle_seconds), breakSeconds: asNumber(session.break_seconds),
      suspiciousFlagCount: asNumber(session.suspicious_flag_count), createdAt: session.created_at, updatedAt: session.updated_at
    })),
    breakLogs: (rows.breakLogs ?? []).map((item) => ({
      id: item.id, sessionId: item.session_id, userId: item.user_id, workDate: item.work_date, durationMinutes: asNumber(item.duration_minutes),
      startedAt: item.started_at, expectedEndsAt: item.expected_ends_at, endedAt: item.ended_at, actualSeconds: asNumber(item.actual_seconds),
      overageSeconds: asNumber(item.overage_seconds), status: item.status
    })),
    activityHeartbeats: (rows.heartbeats ?? []).map((item) => ({
      id: item.id, sessionId: item.session_id, userId: item.user_id, recordedAt: item.recorded_at, state: item.state,
      durationSeconds: asNumber(item.duration_seconds), mouseClicks: asNumber(item.mouse_clicks), keypresses: asNumber(item.keypresses), pageHidden: item.page_hidden
    })),
    activitySamples: (rows.samples ?? []).map((item) => ({
      id: item.id, heartbeatId: item.heartbeat_id, sessionId: item.session_id, userId: item.user_id, x: asNumber(item.x), y: asNumber(item.y), eventAt: item.event_at, eventType: item.event_type
    })),
    activityFlags: (rows.flags ?? []).map((item) => ({
      id: item.id, sessionId: item.session_id, userId: item.user_id, workDate: item.work_date, kind: item.kind, detectedAt: item.detected_at
    })),
    invoices: rows.invoices.map((invoice) => ({
      id: invoice.id, employeeId: invoice.employee_id, month: invoice.invoice_month, amount: asNumber(invoice.amount), status: invoice.status,
      paymentDetails: invoice.payment_details, documentName: invoice.document_original_name, document: fileFromColumns('document', invoice),
      submittedAt: invoice.submitted_at, decidedAt: invoice.decided_at, decidedBy: invoice.decided_by
    })),
    meetings: rows.meetings.map((meeting) => ({
      id: meeting.id, title: meeting.title, startsAt: meeting.starts_at, status: meeting.status, createdBy: meeting.created_by,
      participants: (participantsByMeeting.get(meeting.id) ?? []).map((item) => item.user_id)
    })),
    equipmentRequests: rows.equipmentRequests.map((request) => ({
      id: request.id, employeeId: request.employee_id, item: request.item, type: request.request_type, reason: request.reason, status: request.status,
      attachment: fileFromColumns('attachment', request), createdAt: request.created_at, decidedAt: request.decided_at, decidedBy: request.decided_by
    })),
    assets: rows.assets.map((asset) => ({
      id: asset.id, name: asset.name, type: asset.asset_type, serialNumber: asset.serial_number, assignedTo: asset.assigned_to, status: asset.status, issuedOn: asset.issued_on
    })),
    notifications: rows.notifications.map((notification) => ({
      id: notification.id, userId: notification.user_id, message: notification.message, createdAt: notification.created_at,
      audience: (audiencesByNotification.get(notification.id) ?? []).map((item) => item.role),
      readBy: (readsByNotification.get(notification.id) ?? []).map((item) => item.user_id)
    })),
    auditLog: rows.audit.map((entry) => ({
      id: entry.id, timestamp: entry.occurred_at, actorId: entry.actor_id, subjectUserId: entry.subject_user_id ?? entry.actor_id,
      sessionId: entry.session_id, breakLogId: entry.break_log_id, eventType: entry.event_type ?? 'GENERAL', action: entry.action
    }))
  };
}

export class SupabaseRelationalStore {
  constructor({ client = createSupabaseServerClient() } = {}) {
    this.client = client;
    this.data = null;
    this.version = 0;
  }

  async initialise() {
    const settingsResult = await this.client.from(TABLE.settings).select('*').eq('id', SETTINGS_ID).maybeSingle();
    if (settingsResult.error) throw new Error(`Unable to load Supabase workspace settings: ${settingsResult.error.message}`);

    if (!settingsResult.data) {
      this.data = createSeed();
      await this.persistAll({ expectedVersion: 0, nextVersion: 1 });
      this.version = 1;
      return this;
    }

    this.version = asNumber(settingsResult.data.version);
    this.data = await this.loadWorkspace(settingsResult.data);
    if (this.data.schemaVersion !== 1) throw new Error('Supabase workspace schema version is not supported');
    return this;
  }

  async loadWorkspace(settings) {
    const [users, attendance, corrections, workSessions, breakLogs, heartbeats, samples, flags, invoices, meetings, participants, equipmentRequests, assets, notifications, audiences, reads, audit] = await Promise.all([
      this.client.from(TABLE.users).select('*'), this.client.from(TABLE.attendance).select('*'), this.client.from(TABLE.corrections).select('*'),
      this.client.from(TABLE.workSessions).select('*'), this.client.from(TABLE.breakLogs).select('*'), this.client.from(TABLE.heartbeats).select('*'),
      this.client.from(TABLE.samples).select('*'), this.client.from(TABLE.flags).select('*'), this.client.from(TABLE.invoices).select('*'),
      this.client.from(TABLE.meetings).select('*'), this.client.from(TABLE.participants).select('*'), this.client.from(TABLE.requests).select('*'),
      this.client.from(TABLE.assets).select('*'), this.client.from(TABLE.notifications).select('*'), this.client.from(TABLE.audiences).select('*'),
      this.client.from(TABLE.reads).select('*'), this.client.from(TABLE.audit).select('*')
    ]);

    return hydrateWorkspace({
      settings,
      users: resultData(users, 'users'), attendance: resultData(attendance, 'attendance'), corrections: resultData(corrections, 'attendance corrections'),
      workSessions: resultData(workSessions, 'work sessions'), breakLogs: resultData(breakLogs, 'break logs'), heartbeats: resultData(heartbeats, 'activity heartbeats'),
      samples: resultData(samples, 'activity samples'), flags: resultData(flags, 'activity flags'), invoices: resultData(invoices, 'invoices'),
      meetings: resultData(meetings, 'meetings'), participants: resultData(participants, 'meeting participants'), equipmentRequests: resultData(equipmentRequests, 'equipment requests'),
      assets: resultData(assets, 'assets'), notifications: resultData(notifications, 'notifications'), audiences: resultData(audiences, 'notification audiences'),
      reads: resultData(reads, 'notification reads'), audit: resultData(audit, 'audit log')
    });
  }

  async upsert(table, rows, onConflict = 'id') {
    if (!rows.length) return;
    const { error } = await this.client.from(table).upsert(rows, { onConflict });
    if (error) throw new Error(`Unable to persist ${table} to Supabase: ${error.message}`);
  }

  async assertVersion(expectedVersion) {
    if (expectedVersion === 0) return;
    const { data, error } = await this.client.from(TABLE.settings).select('version').eq('id', SETTINGS_ID).maybeSingle();
    if (error) throw new Error(`Unable to check Supabase workspace version: ${error.message}`);
    if (!data || asNumber(data.version) !== expectedVersion) throw new HttpError(409, 'Workspace data changed elsewhere. Please retry your action.');
  }

  async persistAll({ expectedVersion, nextVersion }) {
    await this.assertVersion(expectedVersion);
    const rows = serializeWorkspace(this.data);

    // Parent entities are saved first so every foreign key remains valid.
    await this.upsert(TABLE.users, rows.users);
    await this.upsert(TABLE.workSessions, rows.workSessions);
    await Promise.all([
      this.upsert(TABLE.attendance, rows.attendance), this.upsert(TABLE.corrections, rows.corrections), this.upsert(TABLE.invoices, rows.invoices),
      this.upsert(TABLE.meetings, rows.meetings), this.upsert(TABLE.requests, rows.equipmentRequests), this.upsert(TABLE.assets, rows.assets),
      this.upsert(TABLE.notifications, rows.notifications), this.upsert(TABLE.breakLogs, rows.breakLogs), this.upsert(TABLE.flags, rows.flags)
    ]);
    await this.upsert(TABLE.heartbeats, rows.heartbeats);
    await Promise.all([
      this.upsert(TABLE.samples, rows.samples), this.upsert(TABLE.audit, rows.audit),
      this.upsert(TABLE.participants, rows.participants, 'meeting_id,user_id'), this.upsert(TABLE.audiences, rows.audiences, 'notification_id,role'),
      this.upsert(TABLE.reads, rows.reads, 'notification_id,user_id')
    ]);

    await this.persistSettingsVersion(rows.settings, { expectedVersion, nextVersion });
  }

  async persistSettingsVersion(settings, { expectedVersion, nextVersion }) {
    const settingsPayload = { ...settings, version: nextVersion };
    if (expectedVersion === 0) {
      const { error } = await this.client.from(TABLE.settings).insert(settingsPayload);
      if (error?.code === '23505') {
        throw new HttpError(409, 'Workspace data was initialized elsewhere. Restart the server to load it.');
      }
      if (error) throw new Error(`Unable to initialize Supabase workspace settings: ${error.message}`);
      return;
    }

    const { data, error } = await this.client
      .from(TABLE.settings)
      .update(settingsPayload)
      .eq('id', SETTINGS_ID)
      .eq('version', expectedVersion)
      .select('version')
      .maybeSingle();
    if (error) throw new Error(`Unable to persist Supabase workspace settings: ${error.message}`);
    if (!data) throw new HttpError(409, 'Workspace data changed elsewhere. Please retry your action.');
  }

  async persistActivityChanges(snapshot, { expectedVersion, nextVersion }) {
    await this.assertVersion(expectedVersion);
    const previous = serializeWorkspace(snapshot);
    const current = serializeWorkspace(this.data);
    const workSessions = changedRows(previous.workSessions, current.workSessions);
    const attendance = changedRows(previous.attendance, current.attendance);
    const breakLogs = changedRows(previous.breakLogs, current.breakLogs);
    const flags = changedRows(previous.flags, current.flags);
    const heartbeats = changedRows(previous.heartbeats, current.heartbeats);
    const samples = changedRows(previous.samples, current.samples);
    const audit = changedRows(previous.audit, current.audit);

    // Heartbeats are frequent. Persist only the typed rows touched by this
    // heartbeat instead of repeatedly upserting the complete workspace.
    await this.upsert(TABLE.workSessions, workSessions);
    await Promise.all([
      this.upsert(TABLE.attendance, attendance), this.upsert(TABLE.breakLogs, breakLogs), this.upsert(TABLE.flags, flags)
    ]);
    await this.upsert(TABLE.heartbeats, heartbeats);
    await Promise.all([
      this.upsert(TABLE.samples, samples), this.upsert(TABLE.audit, audit)
    ]);
    await this.persistSettingsVersion(current.settings, { expectedVersion, nextVersion });
  }

  async mutate(callback) {
    const snapshot = clone(this.data);
    const version = this.version;
    try {
      const result = callback(this.data);
      await this.persistAll({ expectedVersion: version, nextVersion: version + 1 });
      this.version += 1;
      return result;
    } catch (error) {
      this.data = snapshot;
      this.version = version;
      throw error;
    }
  }

  async mutateActivity(callback) {
    const snapshot = clone(this.data);
    const version = this.version;
    try {
      const result = callback(this.data);
      await this.persistActivityChanges(snapshot, { expectedVersion: version, nextVersion: version + 1 });
      this.version += 1;
      return result;
    } catch (error) {
      this.data = snapshot;
      this.version = version;
      throw error;
    }
  }
}
