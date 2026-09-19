-- Stable local attachment id for idempotent Storage + metadata migration.
alter table public.job_attachments add column if not exists legacy_file_id text;
create unique index if not exists job_attachments_legacy_file_id_idx
  on public.job_attachments(legacy_file_id);
