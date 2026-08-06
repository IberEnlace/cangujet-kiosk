-- Activation keys created after this migration are branch-scoped. The device
-- chooses its workspace only after the key has been verified.

alter table public.device_activation_keys
  alter column device_type drop not null;

create or replace function public.activate_device_key(
  p_key_hash text,
  p_installation_id text,
  p_device_type public.device_type,
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
  v_device_type public.device_type;
begin
  if p_key_hash is null or length(p_key_hash) <> 43
     or p_installation_id is null or length(p_installation_id) not between 8 and 200
     or p_device_type is null
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
  if v_key.device_type is not null and v_key.device_type <> p_device_type then
    raise exception using errcode = 'P0001', message = 'device_type_not_allowed';
  end if;

  if not exists (
    select 1 from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
    where b.id = v_key.branch_id and b.restaurant_id = v_key.restaurant_id
      and b.is_active and r.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'device_scope_disabled';
  end if;

  v_device_type := coalesce(v_key.device_type, p_device_type);
  v_name := coalesce(nullif(trim(p_device_name), ''), v_key.device_name);
  if length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'device_name_invalid';
  end if;

  insert into public.devices (
    restaurant_id, branch_id, device_type, name, status, installation_id,
    activated_at, app_version, connection_health, configuration, metadata
  ) values (
    v_key.restaurant_id, v_key.branch_id, v_device_type, v_name, 'active', p_installation_id,
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
    jsonb_build_object('key_hint', v_key.key_hint, 'installation_id', p_installation_id, 'device_type', v_device_type));

  return query select v_device.id, v_key.id, v_device.restaurant_id, v_device.branch_id,
    v_device.device_type, v_device.name, v_device.status, v_device.config_version, false;
end;
$$;

revoke all on function public.activate_device_key(text, text, public.device_type, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.activate_device_key(text, text, public.device_type, text, text, uuid, jsonb)
  to service_role;

comment on column public.device_activation_keys.device_type is
  'Legacy fixed workspace. NULL means the device chooses its workspace after key verification.';
