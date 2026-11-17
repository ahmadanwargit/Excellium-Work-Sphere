-- Typed activity tracking for work sessions. This stores operational events in
-- relational tables; it does not store a portal-state JSON document.

create table if not exists public.excellium_work_sessions (
  id text primary key,
  user_id text not null references public.excellium_users(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  state text not null check (state in ('CLOCKED_OUT', 'ACTIVE', 'IDLE', 'ON_BREAK')),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  idle_seconds integer not null default 0 check (idle_seconds >= 0),
  break_seconds integer not null default 0 check (break_seconds >= 0),
  suspicious_flag_count integer not null default 0 check (suspicious_flag_count >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (user_id, work_date)
);
create index if not exists excellium_work_sessions_date_idx on public.excellium_work_sessions (work_date, user_id);

create table if not exists public.excellium_break_logs (
  id text primary key,
  session_id text not null references public.excellium_work_sessions(id) on delete cascade,
  user_id text not null references public.excellium_users(id) on delete cascade,
  work_date date not null,
  duration_minutes integer not null check (duration_minutes in (5, 15)),
  started_at timestamptz not null,
  expected_ends_at timestamptz not null,
  ended_at timestamptz,
  actual_seconds integer not null default 0 check (actual_seconds >= 0),
  overage_seconds integer not null default 0 check (overage_seconds >= 0),
  status text not null check (status in ('ACTIVE', 'COMPLETED', 'OVERRUN'))
);
create index if not exists excellium_break_logs_session_idx on public.excellium_break_logs (session_id, started_at);

create table if not exists public.excellium_activity_heartbeats (
  id text primary key,
  session_id text not null references public.excellium_work_sessions(id) on delete cascade,
  user_id text not null references public.excellium_users(id) on delete cascade,
  recorded_at timestamptz not null,
  state text not null check (state in ('ACTIVE', 'IDLE')),
  duration_seconds integer not null check (duration_seconds between 0 and 180),
  mouse_clicks integer not null default 0 check (mouse_clicks >= 0),
  keypresses integer not null default 0 check (keypresses >= 0),
  page_hidden boolean not null default false
);
create index if not exists excellium_activity_heartbeats_session_idx on public.excellium_activity_heartbeats (session_id, recorded_at);

-- Coordinates are lightweight samples only. No screen, page, or key content is
-- collected. The explicit columns support auditable anti-jiggler heuristics.
create table if not exists public.excellium_activity_samples (
  id text primary key,
  heartbeat_id text not null references public.excellium_activity_heartbeats(id) on delete cascade,
  session_id text not null references public.excellium_work_sessions(id) on delete cascade,
  user_id text not null references public.excellium_users(id) on delete cascade,
  x integer not null check (x >= 0),
  y integer not null check (y >= 0),
  event_at timestamptz not null,
  event_type text not null check (event_type in ('pointer', 'touch'))
);
create index if not exists excellium_activity_samples_session_idx on public.excellium_activity_samples (session_id, event_at);

create table if not exists public.excellium_activity_flags (
  id text primary key,
  session_id text not null references public.excellium_work_sessions(id) on delete cascade,
  user_id text not null references public.excellium_users(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('REPETITIVE_COORDINATE_LOOP', 'FIXED_INTERVAL_PIXEL_NUDGE', 'MOTION_WITHOUT_INPUT_30_MIN')),
  detected_at timestamptz not null,
  unique (session_id, kind)
);
create index if not exists excellium_activity_flags_date_idx on public.excellium_activity_flags (work_date, user_id);

-- Existing audit entries stay valid. These typed links make activity timelines
-- filterable without parsing display text.
alter table public.excellium_audit_log add column if not exists subject_user_id text references public.excellium_users(id) on delete set null;
alter table public.excellium_audit_log add column if not exists session_id text references public.excellium_work_sessions(id) on delete set null;
alter table public.excellium_audit_log add column if not exists break_log_id text references public.excellium_break_logs(id) on delete set null;
alter table public.excellium_audit_log add column if not exists event_type text not null default 'GENERAL';
update public.excellium_audit_log set subject_user_id = actor_id where subject_user_id is null and actor_id is not null;
create index if not exists excellium_audit_log_subject_date_idx on public.excellium_audit_log (subject_user_id, occurred_at);

-- Backfill the pre-existing typed attendance records as sessions so daily
-- reporting remains useful immediately after upgrade. Historic break minutes
-- remain on attendance; future breaks receive their own break-log rows.
insert into public.excellium_work_sessions (
  id, user_id, work_date, clock_in, clock_out, state, active_seconds,
  idle_seconds, break_seconds, suspicious_flag_count, created_at, updated_at
)
select
  'legacy_' || attendance.id,
  attendance.user_id,
  attendance.work_date,
  attendance.clock_in,
  attendance.clock_out,
  case
    when attendance.clock_out is not null then 'CLOCKED_OUT'
    when attendance.work_date < current_date then 'CLOCKED_OUT'
    else 'ACTIVE'
  end,
  attendance.active_seconds,
  attendance.idle_seconds,
  attendance.break_minutes * 60,
  0,
  attendance.clock_in,
  coalesce(attendance.clock_out, timezone('utc', now()))
from public.excellium_attendance as attendance
where attendance.clock_in is not null
on conflict (user_id, work_date) do nothing;

alter table public.excellium_work_sessions enable row level security;
alter table public.excellium_break_logs enable row level security;
alter table public.excellium_activity_heartbeats enable row level security;
alter table public.excellium_activity_samples enable row level security;
alter table public.excellium_activity_flags enable row level security;

revoke all on table public.excellium_work_sessions, public.excellium_break_logs, public.excellium_activity_heartbeats, public.excellium_activity_samples, public.excellium_activity_flags from anon, authenticated;
