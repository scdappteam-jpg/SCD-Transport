-- S.C.D.TRANSPORT production data foundation
--
-- This migration is additive.  It deliberately does NOT alter the current
-- app_state row, so it is safe to apply before the application cutover.
-- The application must only start reading these tables after its migration
-- adapter has been deployed and verified.

create extension if not exists pgcrypto;

-- A customer is deliberately independent from the legacy JSON customer id.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  tax_id text,
  contact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row is the canonical record for one House.  The remaining fields from
-- Excel/N8N live in source_data until they become first-class operational data.
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  house_number text not null unique,
  legacy_job_id text unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null default '',
  status text not null default 'รอรับสินค้า',
  route_status text,
  cargo_type text,
  package_type text,
  carton_count numeric,
  pallet_count numeric,
  flight_number text,
  flight_etd timestamptz,
  sla_due_at timestamptz,
  pickup jsonb not null default '{}'::jsonb,
  source_data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text
);

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_customer_id_idx on public.jobs(customer_id);
create index if not exists jobs_sla_due_at_idx on public.jobs(sla_due_at) where cancelled_at is null;
create index if not exists jobs_flight_etd_idx on public.jobs(flight_etd) where cancelled_at is null;

-- Append-only event stream: the audit trail for every scan and status update.
create table if not exists public.job_status_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  stage text not null,
  actor_id text,
  actor_name text,
  source text not null default 'application',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists job_status_events_job_time_idx on public.job_status_events(job_id, occurred_at desc);

create table if not exists public.warehouse_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  storage_mode text not null default 'Flexible',
  max_pallets numeric,
  layout jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.warehouse_zones(id) on delete restrict,
  code text not null unique,
  capacity_pallets numeric,
  is_active boolean not null default true,
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_locations_zone_id_idx on public.warehouse_locations(zone_id);

-- Reservations are rows, not mutable fields on jobs, so capacity calculations
-- and later cancellation/release are auditable.
create table if not exists public.warehouse_reservations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  zone_id uuid not null references public.warehouse_zones(id) on delete restrict,
  reserved_pallets numeric not null default 0 check (reserved_pallets >= 0),
  status text not null default 'Reserved' check (status in ('Reserved', 'Released', 'Consumed', 'Cancelled')),
  reserved_by text,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  note text
);

create unique index if not exists warehouse_reservations_active_job_idx
  on public.warehouse_reservations(job_id) where status = 'Reserved';
create index if not exists warehouse_reservations_zone_status_idx
  on public.warehouse_reservations(zone_id, status);

create table if not exists public.warehouse_placements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  location_id uuid references public.warehouse_locations(id) on delete restrict,
  zone_id uuid not null references public.warehouse_zones(id) on delete restrict,
  pallets numeric not null default 0 check (pallets >= 0),
  cartons numeric not null default 0 check (cartons >= 0),
  status text not null default 'Stored' check (status in ('Stored', 'Released')),
  placed_by text,
  placed_at timestamptz not null default now(),
  released_at timestamptz
);

create index if not exists warehouse_placements_job_idx on public.warehouse_placements(job_id) where status = 'Stored';
create index if not exists warehouse_placements_zone_idx on public.warehouse_placements(zone_id) where status = 'Stored';

-- Files are stored in private Supabase Storage.  This table stores the object
-- path, never a permanent public URL.
create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  bucket_id text not null default 'scd-documents',
  object_path text not null unique,
  file_type text not null,
  original_filename text not null,
  mime_type text,
  byte_size bigint,
  checksum text,
  uploaded_by text,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists job_attachments_job_idx on public.job_attachments(job_id, created_at desc);

-- Makes email/CSV/N8N import idempotent and gives cancellation detection a
-- durable source batch to compare against.
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_filename text,
  content_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'Received' check (status in ('Received', 'Processing', 'Completed', 'Failed')),
  summary jsonb not null default '{}'::jsonb,
  error text,
  unique(source, content_hash)
);

create table if not exists public.job_import_links (
  job_id uuid not null references public.jobs(id) on delete cascade,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_row integer,
  imported_at timestamptz not null default now(),
  primary key (job_id, import_batch_id)
);

-- Route assignment provides the future link from Cartrack vehicle to an ordered
-- pickup sequence without putting GPS records inside a job document.
create table if not exists public.route_runs (
  id uuid primary key default gen_random_uuid(),
  route_status text not null default 'ยังไม่เริ่ม',
  driver_id text,
  vehicle_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_run_id uuid not null references public.route_runs(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete restrict,
  sequence_no integer not null check (sequence_no > 0),
  stop_status text not null default 'รอรับสินค้า',
  eta_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  unique(route_run_id, sequence_no),
  unique(route_run_id, job_id)
);

-- One atomic API/RPC for status transition.  Clients pass the last version
-- they read; stale mobile/offline updates fail instead of overwriting new work.
create or replace function public.transition_job_status(
  p_job_id uuid,
  p_expected_version bigint,
  p_to_status text,
  p_stage text,
  p_actor_id text default null,
  p_actor_name text default null,
  p_source text default 'application',
  p_metadata jsonb default '{}'::jsonb
) returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
  v_from_status text;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'JOB_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_job.version <> p_expected_version then
    raise exception 'STALE_JOB_VERSION' using errcode = 'P0001';
  end if;

  v_from_status := v_job.status;
  update public.jobs
     set status = p_to_status,
         version = version + 1,
         updated_at = now()
   where id = p_job_id
   returning * into v_job;

  insert into public.job_status_events
    (job_id, from_status, to_status, stage, actor_id, actor_name, source, metadata)
  values
    (p_job_id, v_from_status, p_to_status, p_stage, p_actor_id, p_actor_name, p_source, coalesce(p_metadata, '{}'::jsonb));

  return v_job;
end;
$$;

-- Production policy: browser clients get no data by default.  The existing
-- server uses the service-role key; user-specific RLS policies are added only
-- together with real Supabase Auth roles.
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.job_status_events enable row level security;
alter table public.warehouse_zones enable row level security;
alter table public.warehouse_locations enable row level security;
alter table public.warehouse_reservations enable row level security;
alter table public.warehouse_placements enable row level security;
alter table public.job_attachments enable row level security;
alter table public.import_batches enable row level security;
alter table public.job_import_links enable row level security;
alter table public.route_runs enable row level security;
alter table public.route_stops enable row level security;

revoke all on function public.transition_job_status(uuid, bigint, text, text, text, text, text, jsonb) from public;
grant execute on function public.transition_job_status(uuid, bigint, text, text, text, text, text, jsonb) to service_role;
