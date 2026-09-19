# Supabase production foundation

`migrations/20260919_001_production_foundation.sql` is additive and does not
modify the legacy `app_state` row. Apply it in the Supabase SQL Editor or with
the Supabase CLI after linking the production project.

## Storage bucket

Create the private bucket `scd-documents` with:

- public access disabled;
- `file_size_limit` 10 MB;
- MIME types `application/pdf`, `image/jpeg`, `image/png`, and `image/webp`.

The service performs this creation separately so schema and object storage
remain independently retryable.  Objects must use the path:

`{house-number}/{yyyy}/{mm}/{uuid}-{file-type}.{ext}`

Never store permanent public URLs in a job. Store `bucket_id` and
`object_path` in `job_attachments`, then issue a short-lived signed URL through
the server when the user opens a document.

## Cutover order

1. Apply the migration and create the private bucket.
2. Deploy a dual-write adapter from the existing `app_state` object to these
   tables, without reading the new tables yet.
3. Reconcile row counts, House numbers, events and attachment metadata.
4. Switch reads module-by-module: jobs/statuses, warehouse, then billing/files.
5. Remove the `db.json` write fallback only when every active module uses the
   relational tables.

The current application is intentionally unchanged by this migration.
