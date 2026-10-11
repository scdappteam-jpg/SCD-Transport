-- Supabase Auth migration foundation.
--
-- This migration is deliberately additive: it introduces a profile row for
-- every existing legacy user but does not change the active login flow.  The
-- application can therefore dual-read while real user credentials are
-- provisioned in auth.users and verified in UAT.

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  legacy_user_id text not null unique,
  login_email text not null unique,
  display_name text not null,
  role text not null,
  vehicle_plate text,
  status text not null default 'Active',
  metadata jsonb not null default '{}'::jsonb,
  migrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_profiles_role_status_idx
  on public.user_profiles(role, status);

-- Migrate every user currently stored in the shared compatibility state.  The
-- generated login address is an internal account identifier, not an e-mail
-- delivery address; it lets the legacy user selector map to Supabase Auth
-- without exposing a personal address or changing the current UI.
insert into public.user_profiles
  (legacy_user_id, login_email, display_name, role, vehicle_plate, status, metadata, migrated_at)
select
  trim(user_row->>'id'),
  lower(regexp_replace(trim(user_row->>'id'), '[^a-zA-Z0-9._-]', '-', 'g')) || '@login.scdtransport.local',
  coalesce(nullif(trim(user_row->>'name'), ''), trim(user_row->>'id')),
  coalesce(nullif(trim(user_row->>'role'), ''), 'Staff'),
  nullif(trim(user_row->>'vehiclePlate'), ''),
  coalesce(nullif(trim(user_row->>'status'), ''), 'Active'),
  jsonb_strip_nulls(jsonb_build_object('legacy', user_row - 'password' - 'passwordHash')),
  now()
from public.app_state state_row
cross join lateral jsonb_array_elements(coalesce(state_row.data->'users', '[]'::jsonb)) as user_row
where state_row.id = 'scd-transport'
  and coalesce(trim(user_row->>'id'), '') <> ''
on conflict (legacy_user_id) do update
  set display_name = excluded.display_name,
      role = excluded.role,
      vehicle_plate = excluded.vehicle_plate,
      status = excluded.status,
      metadata = excluded.metadata,
      migrated_at = now(),
      updated_at = now();

-- New Auth users can be linked automatically when they are created with a
-- legacy_user_id in raw_user_meta_data.  Provisioning remains server-side via
-- the service-role key; browsers never receive that key.
create or replace function public.link_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_legacy_user_id text := nullif(new.raw_user_meta_data->>'legacy_user_id', '');
begin
  if v_legacy_user_id is not null then
    update public.user_profiles
       set auth_user_id = new.id,
           login_email = coalesce(new.email, login_email),
           updated_at = now()
     where legacy_user_id = v_legacy_user_id;
  elsif new.email is not null then
    update public.user_profiles
       set auth_user_id = new.id,
           login_email = new.email,
           updated_at = now()
     where lower(login_email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_profile on auth.users;
create trigger on_auth_user_created_link_profile
  after insert on auth.users
  for each row execute procedure public.link_auth_user_profile();

alter table public.user_profiles enable row level security;

-- Profiles are private by default.  The application server uses service_role;
-- an authenticated user may only read their own profile once JWT-based login
-- is enabled in the next cutover step.
drop policy if exists "users_can_read_own_profile" on public.user_profiles;
create policy "users_can_read_own_profile"
  on public.user_profiles for select to authenticated
  using (auth_user_id = auth.uid());

