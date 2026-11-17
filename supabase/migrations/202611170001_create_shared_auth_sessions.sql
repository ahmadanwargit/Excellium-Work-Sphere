-- Vercel instances must share sign-in and logout state. Store only a SHA-256
-- digest of each opaque bearer token; never the cookie value itself.
create table if not exists public.excellium_auth_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id text not null references public.excellium_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists excellium_auth_sessions_expires_at_idx
  on public.excellium_auth_sessions (expires_at);
create index if not exists excellium_auth_sessions_user_id_idx
  on public.excellium_auth_sessions (user_id);

alter table public.excellium_auth_sessions enable row level security;
revoke all on table public.excellium_auth_sessions from anon, authenticated;
grant select, insert, update, delete on table public.excellium_auth_sessions to service_role;
