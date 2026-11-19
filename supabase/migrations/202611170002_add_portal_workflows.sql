-- Additive portal workflows. Existing users, roles, invoices, attendance and
-- storage objects are preserved. Run before deploying the matching API.

create table if not exists public.excellium_roles (
  id text primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  base_role text not null check (base_role in ('employee', 'trainer', 'manager', 'admin')),
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, base_role)
);
create unique index if not exists excellium_roles_name_idx on public.excellium_roles (lower(name));

insert into public.excellium_roles (id, name, base_role, description, is_system) values
  ('employee', 'Employee', 'employee', 'Personal attendance, invoices, leave and equipment.', true),
  ('trainer', 'Trainer', 'trainer', 'Employee tools plus the training workspace.', true),
  ('manager', 'Management', 'manager', 'Team reports, invoice and equipment approvals.', true),
  ('admin', 'Finance / Admin', 'admin', 'Management tools, leave approvals and user administration.', true)
on conflict (id) do nothing;

create table if not exists public.excellium_departments (
  id text primary key,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  created_at timestamptz not null default now()
);
create unique index if not exists excellium_departments_name_idx on public.excellium_departments (lower(name));

insert into public.excellium_departments (id, name)
select distinct on (lower(btrim(department)))
  'dept_' || md5(lower(btrim(department))), btrim(department)
from public.excellium_users
where char_length(btrim(department)) > 0
order by lower(btrim(department))
on conflict do nothing;

alter table public.excellium_users
  add column if not exists role_id text,
  add column if not exists department_id text references public.excellium_departments(id),
  add column if not exists phone text not null default '',
  add column if not exists start_date date,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz;

update public.excellium_users set role_id = role where role_id is null;
update public.excellium_users u set department_id = d.id
from public.excellium_departments d
where u.department_id is null and lower(btrim(u.department)) = lower(d.name);
update public.excellium_users set updated_at = created_at where updated_at is null;
alter table public.excellium_users
  alter column role_id set not null,
  alter column department_id set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- The custom role is a named preset for an existing permission level, not a
-- browser-controlled elevation. The generated access_group remains unchanged.
alter table public.excellium_users drop constraint if exists excellium_users_role_assignment_fk;
alter table public.excellium_users add constraint excellium_users_role_assignment_fk
  foreign key (role_id, role) references public.excellium_roles(id, base_role);
create unique index if not exists excellium_users_email_case_insensitive_idx on public.excellium_users (lower(email));

create table if not exists public.excellium_leave_requests (
  id text primary key,
  employee_id text not null references public.excellium_users(id) on delete restrict,
  leave_type text not null check (leave_type in ('Annual', 'Sick', 'Casual', 'Unpaid')),
  start_date date not null,
  end_date date not null,
  days integer not null check (days between 1 and 366),
  reason text not null check (char_length(btrim(reason)) between 5 and 2000),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  review_note text not null default '' check (char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text references public.excellium_users(id) on delete restrict,
  check (end_date >= start_date and days = (end_date - start_date) + 1),
  check (decided_by is null or decided_by <> employee_id),
  check (status <> 'Rejected' or char_length(btrim(review_note)) >= 3),
  check ((status in ('Pending', 'Cancelled') and decided_by is null and decided_at is null)
    or (status in ('Approved', 'Rejected') and decided_by is not null and decided_at is not null))
);
create index if not exists excellium_leave_employee_dates_idx on public.excellium_leave_requests (employee_id, start_date, end_date);
create index if not exists excellium_leave_status_idx on public.excellium_leave_requests (status, created_at desc);

alter table public.excellium_invoices
  add column if not exists currency text not null default 'USD' check (currency in ('USD', 'PKR', 'GBP', 'EUR', 'AED')),
  add column if not exists subtotal numeric(12, 2),
  add column if not exists tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  add column if not exists tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  add column if not exists notes text not null default '',
  add column if not exists due_date date,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.excellium_invoices set subtotal = amount where subtotal is null;
update public.excellium_invoices set created_at = coalesce(submitted_at, now()) where created_at is null;
update public.excellium_invoices set updated_at = coalesce(decided_at, submitted_at, created_at) where updated_at is null;
alter table public.excellium_invoices
  alter column subtotal set not null,
  alter column subtotal set default 0,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now(),
  alter column submitted_at drop not null;
alter table public.excellium_invoices drop constraint if exists excellium_invoices_status_check;
alter table public.excellium_invoices add constraint excellium_invoices_status_check check (status in ('Draft', 'Pending', 'Approved', 'Rejected'));
alter table public.excellium_invoices drop constraint if exists excellium_invoices_submission_check;
alter table public.excellium_invoices add constraint excellium_invoices_submission_check
  check ((status = 'Draft' and submitted_at is null) or (status <> 'Draft' and submitted_at is not null));

create table if not exists public.excellium_invoice_items (
  invoice_id text not null references public.excellium_invoices(id) on delete cascade,
  position integer not null check (position between 0 and 49),
  description text not null check (char_length(btrim(description)) between 1 and 250),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_rate numeric(12, 2) not null check (unit_rate >= 0),
  amount numeric(12, 2) not null check (amount >= 0),
  primary key (invoice_id, position)
);

-- As with every existing workspace table, browsers have no direct table access.
alter table public.excellium_roles enable row level security;
alter table public.excellium_departments enable row level security;
alter table public.excellium_leave_requests enable row level security;
alter table public.excellium_invoice_items enable row level security;
revoke all on table public.excellium_roles, public.excellium_departments, public.excellium_leave_requests, public.excellium_invoice_items from anon, authenticated;
grant select, insert, update, delete on table public.excellium_roles, public.excellium_departments, public.excellium_leave_requests, public.excellium_invoice_items to service_role;
