-- Payroll foundation. Amounts are entered and governed by authorized HR users;
-- this schema intentionally does not seed compensation data.
create table if not exists public.hr_payroll_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  base_salary numeric not null default 0 check (base_salary >= 0),
  fixed_allowance numeric not null default 0 check (fixed_allowance >= 0),
  fixed_deduction numeric not null default 0 check (fixed_deduction >= 0),
  bank_name text,
  bank_account_last4 text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  legacy_run_id text not null unique,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'paid', 'cancelled')),
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

alter table public.hr_payroll_profiles enable row level security;
alter table public.hr_payroll_runs enable row level security;
