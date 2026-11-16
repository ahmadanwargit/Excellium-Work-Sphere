-- Excellium Work Sphere: Supabase application state persistence
--
-- This private, versioned JSONB document is intentionally the persistence
-- boundary for the current Express domain model. It allows a single atomic
-- save to include attendance, invoices, meetings, equipment, notifications,
-- settings, audit history, and seeded users while the backend evolves.

create table if not exists public.excellium_portal_state (
  id text primary key check (id = 'workspace'),
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_excellium_portal_state_updated_at()
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

drop trigger if exists excellium_portal_state_set_updated_at on public.excellium_portal_state;
create trigger excellium_portal_state_set_updated_at
before update on public.excellium_portal_state
for each row execute function public.set_excellium_portal_state_updated_at();

alter table public.excellium_portal_state enable row level security;

-- No browser-facing policies are created: React never queries this table.
-- The Express server accesses it through SUPABASE_SECRET_KEY, which bypasses
-- RLS. Explicit grants keep ordinary roles from reading employee data.
revoke all on table public.excellium_portal_state from anon, authenticated;
