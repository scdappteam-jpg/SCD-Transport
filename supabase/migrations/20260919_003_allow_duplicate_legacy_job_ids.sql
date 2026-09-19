-- Legacy imports can reuse their generated job id across different Houses.
-- House number remains the canonical unique key for the production migration.
alter table public.jobs drop constraint if exists jobs_legacy_job_id_key;
create index if not exists jobs_legacy_job_id_idx on public.jobs(legacy_job_id) where legacy_job_id is not null;
