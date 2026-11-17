-- Two sign-in/storage categories, derived from the existing fine-grained role.
-- This is a generated relational column rather than a user-controlled role
-- field: employees/trainers are always employee and managers/admins management.

alter table public.excellium_users
  add column if not exists access_group text generated always as (
    case when role in ('employee', 'trainer') then 'employee' else 'management' end
  ) stored;

create index if not exists excellium_users_access_group_idx
  on public.excellium_users (access_group, id);
