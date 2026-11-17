-- Excellium Work Sphere: normalized Supabase persistence schema.
-- Every operational entity has its own table and typed columns. The Express
-- server uses a secret key, while all browser-facing PostgREST access is denied.

create table if not exists public.excellium_workspace_settings (
  id text primary key check (id = 'workspace'),
  schema_version integer not null default 1 check (schema_version > 0),
  company_name text not null,
  work_week text not null,
  standard_start_time time not null,
  inactivity_lock_minutes integer not null check (inactivity_lock_minutes between 1 and 60),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.excellium_users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('employee', 'trainer', 'manager', 'admin')),
  title text not null,
  department text not null,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null
);

create table if not exists public.excellium_attendance (
  id text primary key,
  user_id text not null references public.excellium_users(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  break_started_at timestamptz,
  break_ends_at timestamptz,
  status text not null,
  active_seconds integer not null default 0 check (active_seconds >= 0),
  idle_seconds integer not null default 0 check (idle_seconds >= 0),
  unique (user_id, work_date)
);
create index if not exists excellium_attendance_user_date_idx on public.excellium_attendance (user_id, work_date desc);

create table if not exists public.excellium_attendance_corrections (
  id text primary key,
  user_id text not null references public.excellium_users(id) on delete cascade,
  work_date date not null,
  reason text not null,
  status text not null,
  created_at timestamptz not null
);

create table if not exists public.excellium_invoices (
  id text primary key,
  employee_id text not null references public.excellium_users(id) on delete restrict,
  invoice_month text not null,
  amount numeric(12, 2) not null check (amount > 0),
  status text not null check (status in ('Pending', 'Approved', 'Rejected')),
  payment_details text not null default '',
  document_bucket text,
  document_path text,
  document_original_name text,
  document_mime_type text,
  document_size bigint check (document_size >= 0),
  document_uploaded_at timestamptz,
  submitted_at timestamptz not null,
  decided_at timestamptz,
  decided_by text references public.excellium_users(id) on delete set null
);
create index if not exists excellium_invoices_employee_idx on public.excellium_invoices (employee_id, submitted_at desc);

create table if not exists public.excellium_meetings (
  id text primary key,
  title text not null,
  starts_at timestamptz not null,
  status text not null check (status in ('Pending', 'Confirmed', 'Missed')),
  created_by text not null references public.excellium_users(id) on delete restrict
);

create table if not exists public.excellium_meeting_participants (
  meeting_id text not null references public.excellium_meetings(id) on delete cascade,
  user_id text not null references public.excellium_users(id) on delete cascade,
  primary key (meeting_id, user_id)
);

create table if not exists public.excellium_equipment_requests (
  id text primary key,
  employee_id text not null references public.excellium_users(id) on delete restrict,
  item text not null,
  request_type text not null check (request_type in ('Replacement', 'Upgrade', 'Repair', 'Return')),
  reason text not null,
  status text not null check (status in ('Pending', 'Approved', 'Rejected')),
  attachment_bucket text,
  attachment_path text,
  attachment_original_name text,
  attachment_mime_type text,
  attachment_size bigint check (attachment_size >= 0),
  attachment_uploaded_at timestamptz,
  created_at timestamptz not null,
  decided_at timestamptz,
  decided_by text references public.excellium_users(id) on delete set null
);
create index if not exists excellium_equipment_requests_employee_idx on public.excellium_equipment_requests (employee_id, created_at desc);

create table if not exists public.excellium_assets (
  id text primary key,
  name text not null,
  asset_type text not null,
  serial_number text not null,
  assigned_to text references public.excellium_users(id) on delete set null,
  status text not null,
  issued_on date
);

create table if not exists public.excellium_notifications (
  id text primary key,
  user_id text references public.excellium_users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null
);

create table if not exists public.excellium_notification_audiences (
  notification_id text not null references public.excellium_notifications(id) on delete cascade,
  role text not null check (role in ('employee', 'trainer', 'manager', 'admin')),
  primary key (notification_id, role)
);

create table if not exists public.excellium_notification_reads (
  notification_id text not null references public.excellium_notifications(id) on delete cascade,
  user_id text not null references public.excellium_users(id) on delete cascade,
  primary key (notification_id, user_id)
);

create table if not exists public.excellium_audit_log (
  id text primary key,
  occurred_at timestamptz not null,
  actor_id text references public.excellium_users(id) on delete set null,
  action text not null
);
create index if not exists excellium_audit_log_occurred_idx on public.excellium_audit_log (occurred_at desc);

create or replace function public.set_excellium_workspace_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists excellium_workspace_settings_set_updated_at on public.excellium_workspace_settings;
create trigger excellium_workspace_settings_set_updated_at
before update on public.excellium_workspace_settings
for each row execute function public.set_excellium_workspace_updated_at();

-- The browser has no direct database access. Express uses SUPABASE_SECRET_KEY,
-- which bypasses RLS; no anon/authenticated policies are intentionally created.
alter table public.excellium_workspace_settings enable row level security;
alter table public.excellium_users enable row level security;
alter table public.excellium_attendance enable row level security;
alter table public.excellium_attendance_corrections enable row level security;
alter table public.excellium_invoices enable row level security;
alter table public.excellium_meetings enable row level security;
alter table public.excellium_meeting_participants enable row level security;
alter table public.excellium_equipment_requests enable row level security;
alter table public.excellium_assets enable row level security;
alter table public.excellium_notifications enable row level security;
alter table public.excellium_notification_audiences enable row level security;
alter table public.excellium_notification_reads enable row level security;
alter table public.excellium_audit_log enable row level security;

revoke all on table public.excellium_workspace_settings, public.excellium_users, public.excellium_attendance, public.excellium_attendance_corrections, public.excellium_invoices, public.excellium_meetings, public.excellium_meeting_participants, public.excellium_equipment_requests, public.excellium_assets, public.excellium_notifications, public.excellium_notification_audiences, public.excellium_notification_reads, public.excellium_audit_log from anon, authenticated;
