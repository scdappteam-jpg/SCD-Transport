-- Stable external keys make the initial dual-write migration idempotent.

alter table public.job_status_events add column if not exists legacy_event_key text;
create unique index if not exists job_status_events_legacy_event_key_idx
  on public.job_status_events(legacy_event_key);

alter table public.warehouse_zones add column if not exists legacy_zone_id text;
create unique index if not exists warehouse_zones_legacy_zone_id_idx
  on public.warehouse_zones(legacy_zone_id);

alter table public.warehouse_locations add column if not exists legacy_location_id text;
create unique index if not exists warehouse_locations_legacy_location_id_idx
  on public.warehouse_locations(legacy_location_id);

alter table public.warehouse_reservations add column if not exists legacy_reservation_key text;
create unique index if not exists warehouse_reservations_legacy_reservation_key_idx
  on public.warehouse_reservations(legacy_reservation_key);

alter table public.warehouse_placements add column if not exists legacy_placement_key text;
create unique index if not exists warehouse_placements_legacy_placement_key_idx
  on public.warehouse_placements(legacy_placement_key);
