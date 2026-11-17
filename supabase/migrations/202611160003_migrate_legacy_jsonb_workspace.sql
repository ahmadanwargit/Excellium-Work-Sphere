-- One-time upgrade for installations that used the retired JSONB workspace
-- document. It copies each entity into its typed relational table, then removes
-- the JSONB table. New application writes never use this table.
-- It is a no-op for fresh installations where the retired table never existed.

do $legacy_jsonb_migration$
begin
  if to_regclass('public.excellium_portal_state') is null then
    return;
  end if;

insert into public.excellium_workspace_settings (
  id, schema_version, company_name, work_week, standard_start_time,
  inactivity_lock_minutes, version
)
select
  'workspace',
  coalesce((legacy.state ->> 'schemaVersion')::integer, 1),
  legacy.state #>> '{organization,name}',
  legacy.state #>> '{organization,workWeek}',
  (legacy.state #>> '{organization,standardStartTime}')::time,
  (legacy.state #>> '{organization,inactivityLockMinutes}')::integer,
  greatest(coalesce(legacy.version, 1), 1)
from public.excellium_portal_state as legacy
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_users (
  id, email, name, role, title, department, password_salt, password_hash, created_at
)
select
  item.id, item.email, item.name, item.role, item.title, item.department,
  item."passwordSalt", item."passwordHash", item."createdAt"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'users', '[]'::jsonb)) as item(
  id text,
  email text,
  name text,
  role text,
  title text,
  department text,
  "passwordSalt" text,
  "passwordHash" text,
  "createdAt" timestamptz
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_attendance (
  id, user_id, work_date, clock_in, clock_out, break_minutes, break_started_at,
  break_ends_at, status, active_seconds, idle_seconds
)
select
  item.id, item."userId", item.date, item."clockIn", item."clockOut", item."breakMinutes",
  item."breakStartedAt", item."breakEndsAt", item.status, item."activeSeconds", item."idleSeconds"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'attendance', '[]'::jsonb)) as item(
  id text,
  "userId" text,
  date date,
  "clockIn" timestamptz,
  "clockOut" timestamptz,
  "breakMinutes" integer,
  "breakStartedAt" timestamptz,
  "breakEndsAt" timestamptz,
  status text,
  "activeSeconds" integer,
  "idleSeconds" integer
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_attendance_corrections (
  id, user_id, work_date, reason, status, created_at
)
select
  item.id, item."userId", item.date, item.reason, item.status, item."createdAt"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'attendanceCorrections', '[]'::jsonb)) as item(
  id text,
  "userId" text,
  date date,
  reason text,
  status text,
  "createdAt" timestamptz
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_invoices (
  id, employee_id, invoice_month, amount, status, payment_details,
  document_bucket, document_path, document_original_name, document_mime_type,
  document_size, document_uploaded_at, submitted_at, decided_at, decided_by
)
select
  item.id, item."employeeId", item.month, item.amount, item.status, item."paymentDetails",
  item.document ->> 'bucket', item.document ->> 'path',
  coalesce(item.document ->> 'originalName', item."documentName"),
  item.document ->> 'mimeType', (item.document ->> 'size')::bigint,
  (item.document ->> 'uploadedAt')::timestamptz,
  item."submittedAt", item."decidedAt", item."decidedBy"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'invoices', '[]'::jsonb)) as item(
  id text,
  "employeeId" text,
  month text,
  amount numeric(12, 2),
  status text,
  "paymentDetails" text,
  "documentName" text,
  document jsonb,
  "submittedAt" timestamptz,
  "decidedAt" timestamptz,
  "decidedBy" text
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_meetings (id, title, starts_at, status, created_by)
select item.id, item.title, item."startsAt", item.status, item."createdBy"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'meetings', '[]'::jsonb)) as item(
  id text,
  title text,
  "startsAt" timestamptz,
  status text,
  "createdBy" text,
  participants jsonb
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_meeting_participants (meeting_id, user_id)
select meeting.id, participant.user_id
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'meetings', '[]'::jsonb)) as meeting(
  id text,
  participants jsonb
)
cross join lateral jsonb_array_elements_text(coalesce(meeting.participants, '[]'::jsonb)) as participant(user_id)
where legacy.id = 'workspace'
on conflict (meeting_id, user_id) do nothing;

insert into public.excellium_equipment_requests (
  id, employee_id, item, request_type, reason, status, attachment_bucket,
  attachment_path, attachment_original_name, attachment_mime_type, attachment_size,
  attachment_uploaded_at, created_at, decided_at, decided_by
)
select
  item.id, item."employeeId", item.item, item.type, item.reason, item.status,
  item.attachment ->> 'bucket', item.attachment ->> 'path', item.attachment ->> 'originalName',
  item.attachment ->> 'mimeType', (item.attachment ->> 'size')::bigint,
  (item.attachment ->> 'uploadedAt')::timestamptz, item."createdAt", item."decidedAt", item."decidedBy"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'equipmentRequests', '[]'::jsonb)) as item(
  id text,
  "employeeId" text,
  item text,
  type text,
  reason text,
  status text,
  attachment jsonb,
  "createdAt" timestamptz,
  "decidedAt" timestamptz,
  "decidedBy" text
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_assets (
  id, name, asset_type, serial_number, assigned_to, status, issued_on
)
select item.id, item.name, item.type, item."serialNumber", item."assignedTo", item.status, item."issuedOn"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'assets', '[]'::jsonb)) as item(
  id text,
  name text,
  type text,
  "serialNumber" text,
  "assignedTo" text,
  status text,
  "issuedOn" date
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_notifications (id, user_id, message, created_at)
select item.id, item."userId", item.message, item."createdAt"
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'notifications', '[]'::jsonb)) as item(
  id text,
  "userId" text,
  message text,
  "createdAt" timestamptz,
  audience jsonb,
  "readBy" jsonb
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

insert into public.excellium_notification_audiences (notification_id, role)
select notification.id, audience.role
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'notifications', '[]'::jsonb)) as notification(
  id text,
  audience jsonb
)
cross join lateral jsonb_array_elements_text(coalesce(notification.audience, '[]'::jsonb)) as audience(role)
where legacy.id = 'workspace'
on conflict (notification_id, role) do nothing;

insert into public.excellium_notification_reads (notification_id, user_id)
select notification.id, reader.user_id
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'notifications', '[]'::jsonb)) as notification(
  id text,
  "readBy" jsonb
)
cross join lateral jsonb_array_elements_text(coalesce(notification."readBy", '[]'::jsonb)) as reader(user_id)
where legacy.id = 'workspace'
on conflict (notification_id, user_id) do nothing;

insert into public.excellium_audit_log (id, occurred_at, actor_id, action)
select item.id, item.timestamp, item."actorId", item.action
from public.excellium_portal_state as legacy
cross join lateral jsonb_to_recordset(coalesce(legacy.state -> 'auditLog', '[]'::jsonb)) as item(
  id text,
  timestamp timestamptz,
  "actorId" text,
  action text
)
where legacy.id = 'workspace'
on conflict (id) do nothing;

-- The upgrade is complete: remove the retired state document table so a JSONB
-- workspace snapshot cannot be used by this deployment again.
drop table public.excellium_portal_state;
end;
$legacy_jsonb_migration$;
