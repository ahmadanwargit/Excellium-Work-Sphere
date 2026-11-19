-- Additive lifecycle metadata. No existing profiles, work records or assets
-- are deleted. Removed profiles/catalog entries are retained for audit history.
alter table public.excellium_users
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.excellium_users(id) on delete set null;
alter table public.excellium_users drop constraint if exists excellium_users_deleted_inactive_check;
alter table public.excellium_users add constraint excellium_users_deleted_inactive_check
  check (deleted_at is null or not is_active);

alter table public.excellium_roles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.excellium_users(id) on delete set null;
alter table public.excellium_roles drop constraint if exists excellium_system_roles_retained_check;
alter table public.excellium_roles add constraint excellium_system_roles_retained_check
  check (not is_system or deleted_at is null);
alter table public.excellium_departments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text references public.excellium_users(id) on delete set null;

-- A removed catalog name may be reused, but its old ID/audit history remains.
drop index if exists public.excellium_roles_name_idx;
create unique index excellium_roles_name_idx on public.excellium_roles (lower(name)) where deleted_at is null;
drop index if exists public.excellium_departments_name_idx;
create unique index excellium_departments_name_idx on public.excellium_departments (lower(name)) where deleted_at is null;

alter table public.excellium_meetings
  add column if not exists meeting_type text not null default 'General' check (meeting_type in ('General', 'Management')),
  add column if not exists duration_minutes integer not null default 30 check (duration_minutes between 15 and 240),
  add column if not exists notes text not null default '' check (char_length(notes) <= 2000);

-- Existing RLS and revoked browser privileges continue to cover the new columns.
comment on column public.excellium_users.deleted_at is 'Portal removal timestamp; payroll, attendance and audit references remain intact.';
comment on column public.excellium_meetings.meeting_type is 'Management meetings are requested by staff with selected active management participants.';
