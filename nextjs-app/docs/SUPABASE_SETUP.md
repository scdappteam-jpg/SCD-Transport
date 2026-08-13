# Supabase shared data setup

Use this when the Render link must show the same jobs, imports, CS approvals, attendance, warehouse map, and billing data for every user.

## 1. Create table in Supabase

Open Supabase SQL Editor and run:

```sql
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
```

The server uses the Supabase REST API with the service role key, so no public policy is required.

## 2. Add Render environment variables

In Render > SCD-Transport > Environment, add:

```text
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
SUPABASE_STATE_TABLE=app_state
SUPABASE_STATE_ID=scd-transport
```

Keep `SUPABASE_SERVICE_ROLE_KEY` secret. Do not put it in frontend files.

## 3. Deploy

Commit and push these changes, then run Manual Deploy on Render.

After deploy, open:

```text
https://scd-transport.onrender.com/api/admin/db-info
```

You should see:

```json
"sharedDatabase": {
  "provider": "supabase",
  "table": "app_state",
  "id": "scd-transport",
  "loaded": true
}
```

When this is enabled, people opening the same Render link will read and write the same shared data.
