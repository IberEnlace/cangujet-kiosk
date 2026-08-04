-- Production device activation keys and lifecycle management.
-- Additive to 202607300001_production_device_identity_bootstrap.sql.

alter table public.devices
  add column if not exists installation_id text,
  add column if not exists activated_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists configuration jsonb not null default '{}'::jsonb,
  add column if not exists app_version text,
  add column if not exists connection_health text not null default 'unknown',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.devices drop constraint if exists devices_installation_id_length_check;
alter table public.devices add constraint devices_installation_id_length_check
  check (installation_id is null or length(installation_id) between 8 and 200);
alter table public.devices drop constraint if exists devices_configuration_object_check;
alter table public.devices add constraint devices_configuration_object_check
  check (jsonb_typeof(configuration) = 'object');
alter table public.devices drop constraint if exists devices_metadata_object_check;
alter table public.devices add constraint devices_metadata_object_check
  check (jsonb_typeof(metadata) = 'object');
alter table public.devices drop constraint if exists devices_connection_health_check;
alter table public.devices add constraint devices_connection_health_check
  check (connection_health in ('unknown', 'online', 'degraded', 'offline'));

create index if not exists devices_installation_idx
  on public.devices(installation_id) where installation_id is not null;
create index if not exists devices_last_seen_idx
  on public.devices(restaurant_id, last_seen_at desc);

create or replace function public.bump_device_own_config_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.restaurant_id, new.branch_id, new.device_type, new.name, new.status, new.configuration
  ) is distinct from (
    old.restaurant_id, old.branch_id, old.device_type, old.name, old.status, old.configuration
  ) and new.config_version = old.config_version then
    new.config_version := old.config_version + 1;
  end if;
  return new;
end;
$$;

create table if not exists public.device_activation_keys (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid not null,
  device_type public.device_type not null,
  device_name text not null check (length(trim(device_name)) between 1 and 120),
  key_hash text not null unique check (length(key_hash) = 43),
  key_hint text not null check (key_hint ~ '^[A-Z0-9]{4}$'),
  status text not null default 'active' check (status in ('active', 'used', 'expired', 'revoked')),
  activation_policy text not null default 'one_time' check (activation_policy in ('one_time', 'reusable')),
  expires_at timestamptz,
  max_activations integer not null default 1 check (max_activations between 1 and 1000),
  activation_count integer not null default 0 check (activation_count between 0 and max_activations),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete cascade
);

create index if not exists device_activation_keys_admin_idx
  on public.device_activation_keys(restaurant_id, created_at desc);
create index if not exists device_activation_keys_branch_status_idx
  on public.device_activation_keys(branch_id, status, expires_at);

create table if not exists public.device_activations (
  id uuid primary key default gen_random_uuid(),
  activation_key_id uuid not null references public.device_activation_keys(id) on delete restrict,
  device_id uuid not null references public.devices(id) on delete restrict,
  installation_id text not null check (length(installation_id) between 8 and 200),
  app_version text,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  activated_at timestamptz not null default now(),
  unique (activation_key_id, installation_id),
  unique (activation_key_id, request_id)
);

create index if not exists device_activations_device_idx
  on public.device_activations(device_id, activated_at desc);

alter table public.device_sessions
  alter column credential_id drop not null,
  add column if not exists activation_key_id uuid references public.device_activation_keys(id) on delete restrict;

alter table public.device_sessions drop constraint if exists device_sessions_identity_check;
alter table public.device_sessions add constraint device_sessions_identity_check
  check (num_nonnulls(credential_id, activation_key_id) = 1);
create index if not exists device_sessions_activation_key_idx
  on public.device_sessions(activation_key_id) where activation_key_id is not null;

alter table public.device_audit_events
  add column if not exists activation_key_id uuid references public.device_activation_keys(id) on delete set null,
  add column if not exists request_id uuid;
create index if not exists device_audit_events_activation_key_idx
  on public.device_audit_events(activation_key_id, occurred_at desc);

drop trigger if exists device_activation_keys_updated_at on public.device_activation_keys;
create trigger device_activation_keys_updated_at
before update on public.device_activation_keys
for each row execute function public.set_updated_at();

create or replace function public.activate_device_key(
  p_key_hash text,
  p_installation_id text,
  p_device_name text default null,
  p_app_version text default null,
  p_request_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  device_id uuid,
  activation_key_id uuid,
  restaurant_id uuid,
  branch_id uuid,
  device_type public.device_type,
  device_name text,
  device_status public.device_status,
  configuration_version bigint,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.device_activation_keys%rowtype;
  v_device public.devices%rowtype;
  v_existing public.device_activations%rowtype;
  v_now timestamptz := clock_timestamp();
  v_name text;
begin
  if p_key_hash is null or length(p_key_hash) <> 43
     or p_installation_id is null or length(p_installation_id) not between 8 and 200
     or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'device_key_invalid';
  end if;

  select * into v_key
  from public.device_activation_keys k
  where k.key_hash = p_key_hash
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'device_key_invalid';
  end if;
  if v_key.revoked_at is not null or v_key.status = 'revoked' then
    raise exception using errcode = 'P0001', message = 'device_key_revoked';
  end if;
  if v_key.expires_at is not null and v_key.expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'device_key_expired';
  end if;

  select * into v_existing
  from public.device_activations a
  where a.activation_key_id = v_key.id
    and (a.installation_id = p_installation_id or (p_request_id is not null and a.request_id = p_request_id))
  order by a.activated_at
  limit 1;

  if found then
    select * into v_device from public.devices d where d.id = v_existing.device_id;
    return query select v_device.id, v_key.id, v_device.restaurant_id, v_device.branch_id,
      v_device.device_type, v_device.name, v_device.status, v_device.config_version, true;
    return;
  end if;

  if v_key.status <> 'active' or v_key.activation_count >= v_key.max_activations then
    raise exception using errcode = 'P0001', message = 'device_key_used';
  end if;

  if not exists (
    select 1 from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
    where b.id = v_key.branch_id and b.restaurant_id = v_key.restaurant_id
      and b.is_active and r.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'device_scope_disabled';
  end if;

  v_name := coalesce(nullif(trim(p_device_name), ''), v_key.device_name);
  if length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'device_name_invalid';
  end if;

  insert into public.devices (
    restaurant_id, branch_id, device_type, name, status, installation_id,
    activated_at, app_version, connection_health, configuration, metadata
  ) values (
    v_key.restaurant_id, v_key.branch_id, v_key.device_type, v_name, 'active', p_installation_id,
    v_now, nullif(trim(p_app_version), ''), 'online',
    coalesce(v_key.metadata -> 'configuration', '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_device;

  insert into public.device_activations (
    activation_key_id, device_id, installation_id, app_version, request_id, metadata, activated_at
  ) values (
    v_key.id, v_device.id, p_installation_id, nullif(trim(p_app_version), ''), p_request_id,
    coalesce(p_metadata, '{}'::jsonb), v_now
  );

  update public.device_activation_keys
  set activation_count = activation_count + 1,
      status = case
        when activation_policy = 'one_time' or activation_count + 1 >= max_activations then 'used'
        else 'active'
      end
  where id = v_key.id;

  insert into public.device_audit_events(device_id, activation_key_id, event_type, request_id, metadata)
  values (v_device.id, v_key.id, 'key_activated', p_request_id,
    jsonb_build_object('key_hint', v_key.key_hint, 'installation_id', p_installation_id));

  return query select v_device.id, v_key.id, v_device.restaurant_id, v_device.branch_id,
    v_device.device_type, v_device.name, v_device.status, v_device.config_version, false;
end;
$$;

revoke all on function public.activate_device_key(text, text, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.activate_device_key(text, text, text, text, uuid, jsonb) to service_role;

alter table public.device_activation_keys enable row level security;
alter table public.device_activations enable row level security;

-- Activation key hashes and activation bindings are server-only. Admin access is
-- deliberately mediated by the authenticated application API, never PostgREST.
revoke all on public.device_activation_keys, public.device_activations from anon, authenticated;
grant all on public.device_activation_keys, public.device_activations to service_role;

-- Existing devices remain readable through the tenant-scoped policy. Only the
-- application server may read sessions, credentials, activation hashes or audits.
revoke all on public.device_sessions, public.device_credentials, public.device_audit_events from anon, authenticated;
