-- Employees may clock out and later clock in again on the same work date. The
-- work-session primary key, not a user/date pair, identifies a distinct shift.
-- The earlier unique constraint rejected valid second sessions after a
-- clock-out or a legacy-session migration.

alter table public.excellium_work_sessions
  drop constraint if exists excellium_work_sessions_user_id_work_date_key;

-- Keep daily reporting efficient without restricting an employee to one shift.
create index if not exists excellium_work_sessions_user_date_idx
  on public.excellium_work_sessions (user_id, work_date, clock_in);
