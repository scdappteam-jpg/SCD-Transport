-- Phase 1 HR foundation: employee profile metadata, check-in locations and
-- attendance-correction requests.  Sensitive compensation data is purposely
-- excluded until payroll access rules are approved.

create table if not exists public.hr_employee_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null unique,
  nickname text,
  email text,
  department text,
  position text,
  employee_level text,
  supervisor_id text,
  branch text,
  start_date date,
  employment_type text,
  emergency_contact_name text,
  emergency_contact_phone text,
  assigned_location_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_checkin_locations (
  id uuid primary key default gen_random_uuid(),
  legacy_location_id text not null unique,
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius_meters integer not null default 300 check (radius_meters between 20 and 5000),
  branch text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  legacy_request_id text not null unique,
  employee_id text not null,
  target_date date not null,
  requested_checkin time,
  requested_checkout time,
  reason text not null,
  status text not null default 'pendingLead' check (status in ('pendingLead', 'pendingExecutive', 'approved', 'rejected', 'cancelled')),
  approval_trail jsonb not null default '[]'::jsonb,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_attendance_corrections_employee_date_idx
  on public.hr_attendance_corrections(employee_id, target_date desc);
create index if not exists hr_attendance_corrections_status_idx
  on public.hr_attendance_corrections(status, requested_at desc);

alter table public.hr_employee_profiles enable row level security;
alter table public.hr_checkin_locations enable row level security;
alter table public.hr_attendance_corrections enable row level security;
