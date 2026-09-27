-- HR workflow notifications are in-app only.  No e-mail, LINE, SMS, webhook
-- or browser-push delivery metadata is stored here.
create table if not exists public.hr_in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  legacy_notification_id text not null unique,
  recipient_user_id text not null,
  notification_type text not null default 'hr_workflow',
  title text not null,
  body text not null,
  request_id text,
  request_kind text,
  actor_id text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_in_app_notifications_recipient_idx
  on public.hr_in_app_notifications(recipient_user_id, read, created_at desc);

alter table public.hr_in_app_notifications enable row level security;
