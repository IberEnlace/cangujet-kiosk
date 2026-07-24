alter table public.notification_delivery_logs
  drop constraint if exists notification_delivery_logs_status_check;
alter table public.notification_delivery_logs
  add constraint notification_delivery_logs_status_check
  check (status in ('queued','sent','delivered','delayed','failed','bounced','complained')),
  add column if not exists idempotency_key text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists complained_at timestamptz,
  add column if not exists provider_event_id text,
  add column if not exists provider_event_type text,
  add column if not exists last_provider_update_at timestamptz;
create unique index notification_delivery_logs_idempotency_idx
  on public.notification_delivery_logs(idempotency_key) where idempotency_key is not null;
create unique index notification_delivery_logs_provider_event_idx
  on public.notification_delivery_logs(provider_event_id) where provider_event_id is not null;

create table public.notification_provider_events (
  provider_event_id text primary key,
  delivery_log_id uuid not null references public.notification_delivery_logs(id) on delete cascade,
  provider_event_type text not null,
  received_at timestamptz not null default now()
);
alter table public.notification_provider_events enable row level security;
revoke all on public.notification_provider_events from anon, authenticated;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  event_type text not null check (event_type in ('order_failure','payment_failure','kiosk_offline','kitchen_display_offline','device_sync_failure','device_recovery')),
  source_type text,
  source_id text,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  notification_status text not null default 'pending' check (notification_status in ('pending','processing','sent','retry','failed','suppressed')),
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(branch_id, event_key)
);
create index notification_events_pending_idx on public.notification_events(notification_status, next_retry_at, occurred_at);
create index notification_events_branch_created_idx on public.notification_events(branch_id, created_at desc);

create table public.notification_report_runs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  report_type text not null check (report_type in ('daily_sales_report','weekly_sales_summary')),
  report_period_start timestamptz not null,
  report_period_end timestamptz not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','retry','failed','suppressed')),
  delivery_log_id uuid references public.notification_delivery_logs(id) on delete set null,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(branch_id, report_type, report_period_start, report_period_end)
);
create index notification_report_runs_pending_idx on public.notification_report_runs(status, next_retry_at, report_period_start);

create table public.device_health (
  device_id text primary key,
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_type text not null check (device_type in ('kiosk','kitchen_display','order_display')),
  device_name text not null,
  last_seen_at timestamptz not null,
  last_sync_at timestamptz,
  sync_failure_code text,
  sync_retry_count integer not null default 0,
  sync_target text check (sync_target is null or sync_target in ('menu','branch_settings','device_configuration')),
  status text not null default 'online' check (status in ('online','suspected_offline','offline','sync_failed')),
  offline_incident_started_at timestamptz,
  offline_alerted_at timestamptz,
  recovered_at timestamptz,
  updated_at timestamptz not null default now()
);
create index device_health_branch_status_idx on public.device_health(branch_id, status, last_seen_at);
create trigger device_health_updated_at before update on public.device_health
for each row execute function public.set_updated_at();

alter table public.notification_events enable row level security;
alter table public.notification_report_runs enable row level security;
alter table public.device_health enable row level security;
create policy "admins read branch notification events" on public.notification_events for select to authenticated
using (public.is_admin() and branch_id = public.current_user_branch_id());
create policy "admins read branch report runs" on public.notification_report_runs for select to authenticated
using (public.is_admin() and branch_id = public.current_user_branch_id());
create policy "admins read branch device health" on public.device_health for select to authenticated
using (public.is_admin() and branch_id = public.current_user_branch_id());
revoke all on public.notification_events, public.notification_report_runs, public.device_health from anon;
grant select on public.notification_events, public.notification_report_runs, public.device_health to authenticated;
revoke insert, update, delete on public.notification_events, public.notification_report_runs, public.device_health from authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- The job reads both values from Vault at execution time; neither secret is stored
-- in the cron command or exposed to browser roles.
select cron.schedule(
  'morrow-process-notifications',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'morrow_notification_processor_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-morrow-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'morrow_notification_internal_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
