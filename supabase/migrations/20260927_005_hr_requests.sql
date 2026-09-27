-- Shared HR request records.  The existing app_state remains the runtime
-- source during migration; the server mirrors these rows for reporting and
-- a later relational-read cutover.

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_request_id text not null unique,
  employee_id text not null,
  leave_type text not null check (leave_type in ('sick', 'personal', 'vacation', 'other')),
  day_part text not null default 'full' check (day_part in ('full', 'am', 'pm')),
  start_date date not null,
  end_date date not null,
  requested_days numeric not null check (requested_days > 0),
  reason text,
  status text not null default 'pendingLead' check (status in ('pendingLead', 'pendingExecutive', 'approved', 'rejected', 'cancelled', 'expired')),
  work_zone text,
  remaining_quota_at_submit numeric,
  approval_trail jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  cancelled_at timestamptz,
  rejection_reason text,
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists hr_leave_requests_employee_dates_idx
  on public.hr_leave_requests(employee_id, start_date desc);
create index if not exists hr_leave_requests_status_idx
  on public.hr_leave_requests(status, requested_at desc);

create table if not exists public.hr_ot_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_request_id text not null unique,
  employee_id text not null,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  requested_hours numeric not null check (requested_hours > 0),
  actual_hours numeric not null default 0 check (actual_hours >= 0),
  paid_hours numeric not null default 0 check (paid_hours >= 0),
  rate_multiplier numeric,
  work_ref text,
  reason text,
  status text not null default 'pendingLead' check (status in ('pendingLead', 'pendingExecutive', 'approved', 'done', 'closed', 'rejected', 'cancelled')),
  approval_trail jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  closed_at timestamptz,
  rejection_reason text,
  updated_at timestamptz not null default now()
);

create index if not exists hr_ot_requests_employee_date_idx
  on public.hr_ot_requests(employee_id, work_date desc);
create index if not exists hr_ot_requests_status_idx
  on public.hr_ot_requests(status, requested_at desc);

alter table public.hr_leave_requests enable row level security;
alter table public.hr_ot_requests enable row level security;
