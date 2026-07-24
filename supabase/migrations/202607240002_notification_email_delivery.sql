create table public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references public.branches(id) on delete cascade,
  primary_email text not null,
  secondary_email text,
  daily_report_time time not null default '22:00',
  daily_sales_report boolean not null default true,
  weekly_sales_summary boolean not null default false,
  order_failure_alerts boolean not null default true,
  payment_failure_alerts boolean not null default true,
  kiosk_offline_alerts boolean not null default true,
  kitchen_offline_alerts boolean not null default true,
  device_sync_failure_alerts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_settings_primary_email_check check (primary_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint notification_settings_secondary_email_check check (secondary_email is null or secondary_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create table public.notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete set null,
  recipient text not null,
  notification_type text not null,
  provider text not null,
  provider_message_id text,
  status text not null check (status in ('queued', 'sent', 'failed')),
  error_code text,
  error_message text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notification_delivery_logs_branch_created_idx on public.notification_delivery_logs(branch_id, created_at desc);
create index notification_delivery_logs_status_created_idx on public.notification_delivery_logs(status, created_at desc);
create index notification_delivery_logs_recipient_created_idx on public.notification_delivery_logs(recipient, created_at desc);

create trigger notification_settings_updated_at
before update on public.notification_settings
for each row execute function public.set_updated_at();

alter table public.notification_settings enable row level security;
alter table public.notification_delivery_logs enable row level security;

create policy "admins read branch notification settings"
on public.notification_settings for select to authenticated
using (public.is_admin() and branch_id = public.current_user_branch_id());

create policy "admins insert branch notification settings"
on public.notification_settings for insert to authenticated
with check (public.is_admin() and branch_id = public.current_user_branch_id());

create policy "admins update branch notification settings"
on public.notification_settings for update to authenticated
using (public.is_admin() and branch_id = public.current_user_branch_id())
with check (public.is_admin() and branch_id = public.current_user_branch_id());

create policy "admins read branch notification logs"
on public.notification_delivery_logs for select to authenticated
using (public.is_admin() and branch_id = public.current_user_branch_id());

revoke all on public.notification_settings, public.notification_delivery_logs from anon;
grant select, insert, update on public.notification_settings to authenticated;
grant select on public.notification_delivery_logs to authenticated;
revoke insert, update, delete on public.notification_delivery_logs from authenticated;
