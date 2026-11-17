-- A session must never silently continue into a later work day. Preserve an
-- unknown historic clock-out timestamp as null, but mark stale open sessions as
-- CLOCKED_OUT so they cannot receive new breaks or activity heartbeats.
update public.excellium_work_sessions
set state = 'CLOCKED_OUT',
    updated_at = timezone('utc', now())
where clock_out is null
  and state in ('ACTIVE', 'IDLE', 'ON_BREAK')
  and work_date < current_date;
