-- Keep lifecycle updates (catalog reassignment, removal metadata and audit)
-- atomic across serverless instances. The payload is a transport only; rows
-- remain normalized in their existing typed, RLS-protected tables.
create or replace function public.excellium_persist_workspace(
  p_expected_version bigint,
  p_next_version bigint,
  p_rows jsonb,
  p_removed_invoice_items jsonb default '[]'::jsonb
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stored_version bigint;
  mapping record;
  records jsonb;
  column_list text;
  update_list text;
  conflicts text;
begin
  if p_next_version <> p_expected_version + 1 then
    raise exception 'Invalid workspace version increment' using errcode = '22023';
  end if;
  -- Also serializes first-use initialization, before a settings row exists.
  perform pg_catalog.pg_advisory_xact_lock(726115002);
  select version into stored_version from public.excellium_workspace_settings where id = 'workspace' for update;
  if (p_expected_version = 0 and stored_version is not null)
    or (p_expected_version <> 0 and stored_version is distinct from p_expected_version) then
    raise exception 'Workspace data changed elsewhere. Refresh and retry your action.' using errcode = '40001';
  end if;

  for mapping in select * from (values
    (1, 'roles', 'excellium_roles', 'id', 'removed'),
    (2, 'roles', 'excellium_roles', 'id', 'live'),
    (3, 'departments', 'excellium_departments', 'id', 'removed'),
    (4, 'departments', 'excellium_departments', 'id', 'live'),
    (5, 'users', 'excellium_users', 'id', 'all'),
    (6, 'workSessions', 'excellium_work_sessions', 'id', 'all'),
    (7, 'attendance', 'excellium_attendance', 'id', 'all'),
    (8, 'corrections', 'excellium_attendance_corrections', 'id', 'all'),
    (9, 'invoices', 'excellium_invoices', 'id', 'all'),
    (10, 'invoiceItems', 'excellium_invoice_items', 'invoice_id,position', 'all'),
    (11, 'meetings', 'excellium_meetings', 'id', 'all'),
    (12, 'equipmentRequests', 'excellium_equipment_requests', 'id', 'all'),
    (13, 'assets', 'excellium_assets', 'id', 'all'),
    (14, 'notifications', 'excellium_notifications', 'id', 'all'),
    (15, 'breakLogs', 'excellium_break_logs', 'id', 'all'),
    (16, 'flags', 'excellium_activity_flags', 'id', 'all'),
    (17, 'leaves', 'excellium_leave_requests', 'id', 'all'),
    (18, 'heartbeats', 'excellium_activity_heartbeats', 'id', 'all'),
    (19, 'samples', 'excellium_activity_samples', 'id', 'all'),
    (20, 'audit', 'excellium_audit_log', 'id', 'all'),
    (21, 'participants', 'excellium_meeting_participants', 'meeting_id,user_id', 'all'),
    (22, 'audiences', 'excellium_notification_audiences', 'notification_id,role', 'all'),
    (23, 'reads', 'excellium_notification_reads', 'notification_id,user_id', 'all')
  ) as allowed(sequence, payload_key, table_name, conflict_keys, phase) order by sequence loop
    records := coalesce(p_rows -> mapping.payload_key, '[]'::jsonb);
    if mapping.phase <> 'all' then
      select coalesce(jsonb_agg(item), '[]'::jsonb) into records
      from jsonb_array_elements(records) as item
      where (item ->> 'deleted_at' is not null) = (mapping.phase = 'removed');
    end if;
    if jsonb_array_length(records) = 0 then continue; end if;

    -- Only columns present in the typed serializer are written. Generated
    -- columns (including access_group) are always excluded by Postgres itself.
    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum),
      string_agg(format('%I = excluded.%I', attribute.attname, attribute.attname), ', ' order by attribute.attnum)
    into column_list, update_list
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = mapping.table_name
      and attribute.attnum > 0 and not attribute.attisdropped and attribute.attgenerated = ''
      and (records -> 0) ? attribute.attname;
    select string_agg(format('%I', key), ', ') into conflicts from unnest(string_to_array(mapping.conflict_keys, ',')) as key;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) do update set %s',
      mapping.table_name, column_list, column_list, mapping.table_name, conflicts, update_list) using records;
  end loop;

  delete from public.excellium_invoice_items as existing
  using jsonb_to_recordset(p_removed_invoice_items) as obsolete(invoice_id text, position integer)
  where existing.invoice_id = obsolete.invoice_id and existing.position = obsolete.position;

  insert into public.excellium_workspace_settings
    (id, schema_version, company_name, work_week, standard_start_time, inactivity_lock_minutes, version)
  select id, schema_version, company_name, work_week, standard_start_time, inactivity_lock_minutes, p_next_version
  from jsonb_populate_record(null::public.excellium_workspace_settings, p_rows -> 'settings')
  on conflict (id) do update set schema_version = excluded.schema_version,
    company_name = excluded.company_name, work_week = excluded.work_week,
    standard_start_time = excluded.standard_start_time, inactivity_lock_minutes = excluded.inactivity_lock_minutes,
    version = excluded.version;
  return p_next_version;
end;
$$;

revoke all on function public.excellium_persist_workspace(bigint, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.excellium_persist_workspace(bigint, bigint, jsonb, jsonb) to service_role;
comment on function public.excellium_persist_workspace(bigint, bigint, jsonb, jsonb) is 'Server-only atomic typed workspace writes with version checking; never stores a workspace JSON document.';

notify pgrst, 'reload schema';
