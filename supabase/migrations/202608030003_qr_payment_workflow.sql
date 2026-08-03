-- Production QR payments reuse order_payments and the existing order lifecycle.

alter table public.order_payments
  add column if not exists payment_session_id uuid,
  add column if not exists provider_session_id text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_status text,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_event_ids text[] not null default '{}',
  add column if not exists expires_at timestamptz,
  add column if not exists paid_at timestamptz;

create unique index if not exists order_payments_qr_session_idx
  on public.order_payments(payment_session_id) where payment_session_id is not null;
create unique index if not exists order_payments_provider_session_idx
  on public.order_payments(provider, provider_session_id) where provider_session_id is not null;
create unique index if not exists order_payments_provider_reference_idx
  on public.order_payments(provider, external_reference) where method = 'qr'::public.order_payment_method and external_reference is not null;
create unique index if not exists order_payments_one_active_qr_idx
  on public.order_payments(order_id) where method = 'qr'::public.order_payment_method
    and status in ('pending'::public.order_payment_lifecycle_status, 'authorized'::public.order_payment_lifecycle_status);

create or replace function public.qr_payment_session_json(p_payment_id uuid, p_duplicate boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'paymentSessionId', p.payment_session_id,
    'paymentReference', p.external_reference,
    'orderId', o.id,
    'orderNumber', o.order_number,
    'status', case
      when p.status::text = 'captured' then 'paid'
      when p.status::text = 'authorized' then 'processing'
      when p.status::text = 'cancelled' then 'cancelled'
      when p.status::text = 'failed' and p.failure_code = 'qr_expired' then 'expired'
      when p.status::text = 'failed' then 'failed'
      else 'pending'
    end,
    'qrPayload', coalesce(p.provider_payload->>'qrPayload', ''),
    'qrCode', coalesce(p.provider_payload->>'qrCode', ''),
    'amount', to_char(p.amount, 'FM9999999990.00'),
    'currency', p.currency,
    'expiresAt', p.expires_at,
    'providerName', p.provider,
    'duplicate', p_duplicate,
    'order', public.production_order_json(o.id)
  )
  from public.order_payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id and p.method::text = 'qr';
$$;

create or replace function public.find_reusable_qr_payment_session(
  p_order_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_device_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.order_payments%rowtype;
begin
  if not exists(select 1 from public.orders o where o.id=p_order_id and o.restaurant_id=p_restaurant_id and o.branch_id=p_branch_id and o.device_id=p_device_id) then
    raise exception 'order_not_found';
  end if;
  update public.order_payments set status='failed', provider_status='expired', failure_code='qr_expired', failed_at=now()
  where order_id=p_order_id and method::text='qr' and status::text in ('pending','authorized') and expires_at <= now();
  select * into v_payment from public.order_payments
  where order_id=p_order_id and method::text='qr' and status::text in ('pending','authorized') and expires_at > now()
  order by created_at desc limit 1;
  return case when found then public.qr_payment_session_json(v_payment.id, true) else null end;
end;
$$;

create or replace function public.create_qr_payment_session(
  p_order_id uuid, p_payment_session_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_device_id uuid,
  p_idempotency_key uuid, p_request_fingerprint text, p_provider text,
  p_provider_session_id text, p_payment_reference text, p_qr_payload text,
  p_qr_code text, p_expires_at timestamptz, p_replace_expired boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
begin
  select * into v_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id
    and branch_id=p_branch_id and device_id=p_device_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'awaiting_payment' then raise exception 'invalid_order_transition'; end if;

  select * into v_payment from public.order_payments where order_id=p_order_id and idempotency_key=p_idempotency_key;
  if found then
    if v_payment.request_fingerprint <> p_request_fingerprint then raise exception 'idempotency_conflict'; end if;
    return public.qr_payment_session_json(v_payment.id, true);
  end if;

  update public.order_payments set status='failed', provider_status='expired', failure_code='qr_expired', failed_at=now()
  where order_id=p_order_id and method::text='qr' and status::text in ('pending','authorized') and expires_at <= now();

  select * into v_payment from public.order_payments
  where order_id=p_order_id and method::text='qr' and status::text in ('pending','authorized') and expires_at > now()
  order by created_at desc limit 1;
  if found then return public.qr_payment_session_json(v_payment.id, true); end if;
  if p_expires_at <= now() then raise exception 'payment_expired'; end if;

  insert into public.order_payments(
    order_id, provider, method, status, amount, change, currency, external_reference,
    idempotency_key, request_fingerprint, payment_session_id, provider_session_id,
    provider_status, provider_payload, expires_at
  ) values (
    v_order.id, trim(p_provider), 'qr'::public.order_payment_method, 'pending', v_order.total, 0,
    v_order.currency, trim(p_payment_reference), p_idempotency_key, p_request_fingerprint,
    p_payment_session_id, trim(p_provider_session_id), 'pending',
    jsonb_build_object('qrPayload', p_qr_payload, 'qrCode', p_qr_code), p_expires_at
  ) returning * into v_payment;
  update public.orders set payment_status='pending' where id=v_order.id;
  return public.qr_payment_session_json(v_payment.id, false);
exception when unique_violation then
  select * into v_payment from public.order_payments
  where order_id=p_order_id and method::text='qr' and (
    idempotency_key=p_idempotency_key or provider_session_id=p_provider_session_id
    or (status::text in ('pending','authorized') and expires_at > now())
  ) order by created_at desc limit 1;
  if found then return public.qr_payment_session_json(v_payment.id, true); end if;
  raise;
end;
$$;

-- Development-only RPCs. They remain service-role protected; the API exposes
-- them only while QR_PAYMENT_PROVIDER=mock and never in NODE_ENV=production.
create or replace function public.get_mock_qr_payment_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.order_payments%rowtype;
begin
  select * into v_payment from public.order_payments
  where payment_session_id=p_session_id and method::text='qr' and provider='mock'
  for update;
  if not found then return null; end if;
  if v_payment.status::text in ('pending','authorized') and v_payment.expires_at <= now() then
    update public.order_payments set status='failed',provider_status='expired',failure_code='qr_expired',failed_at=now()
    where id=v_payment.id returning * into v_payment;
  end if;
  return public.qr_payment_session_json(v_payment.id,false);
end;
$$;

create or replace function public.apply_mock_qr_payment_outcome(p_session_id uuid, p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
  v_event_id text := 'mock:' || p_session_id::text || ':' || lower(trim(p_outcome));
begin
  if lower(trim(p_outcome)) not in ('success','failed','cancelled') then
    raise exception 'invalid_order_request';
  end if;
  select * into v_payment from public.order_payments
  where payment_session_id=p_session_id and method::text='qr' and provider='mock'
  for update;
  if not found then return null; end if;

  -- A captured payment is final. Repeated success is an exact idempotent replay;
  -- failure or cancellation can never reverse it.
  if v_payment.status::text='captured' then
    return public.qr_payment_session_json(v_payment.id,lower(trim(p_outcome))='success');
  end if;
  if v_payment.status::text in ('failed','cancelled') then
    return public.qr_payment_session_json(v_payment.id,false);
  end if;
  if v_payment.expires_at <= now() then
    update public.order_payments set status='failed',provider_status='expired',failure_code='qr_expired',failed_at=now()
    where id=v_payment.id returning * into v_payment;
    return public.qr_payment_session_json(v_payment.id,false);
  end if;

  if lower(trim(p_outcome))='failed' then
    update public.order_payments set status='failed',provider_status='failed',failure_code='mock_failed',failed_at=now(),
      provider_event_ids=array_append(provider_event_ids,v_event_id)
    where id=v_payment.id returning * into v_payment;
    return public.qr_payment_session_json(v_payment.id,false);
  elsif lower(trim(p_outcome))='cancelled' then
    update public.order_payments set status='cancelled',provider_status='cancelled',
      provider_event_ids=array_append(provider_event_ids,v_event_id)
    where id=v_payment.id returning * into v_payment;
    return public.qr_payment_session_json(v_payment.id,false);
  end if;

  select * into v_order from public.orders where id=v_payment.order_id for update;
  update public.order_payments set status='captured',provider_status='paid',authorized_at=coalesce(authorized_at,now()),
    captured_at=now(),paid_at=now(),provider_transaction_id='mock-' || p_session_id::text,
    provider_event_ids=array_append(provider_event_ids,v_event_id)
  where id=v_payment.id returning * into v_payment;

  if v_order.status in ('awaiting_payment','payment_failed') then
    update public.orders set status='paid',payment_status='paid' where id=v_order.id;
    insert into public.order_status_events(order_id,from_status,to_status,actor_type,actor_id,metadata)
    values(v_order.id,v_order.status,'paid','system','qr_mock',jsonb_build_object('mockSessionId',p_session_id));
    update public.orders set status='submitted',placed_at=now() where id=v_order.id;
    insert into public.order_status_events(order_id,from_status,to_status,actor_type,actor_id,metadata)
    values(v_order.id,'paid','submitted','system','qr_mock',jsonb_build_object('mockSessionId',p_session_id));
  elsif v_order.status='paid' then
    update public.orders set status='submitted',placed_at=now(),payment_status='paid' where id=v_order.id;
    insert into public.order_status_events(order_id,from_status,to_status,actor_type,actor_id,metadata)
    values(v_order.id,'paid','submitted','system','qr_mock',jsonb_build_object('mockSessionId',p_session_id));
  end if;
  return public.qr_payment_session_json(v_payment.id,false);
end;
$$;

create or replace function public.get_qr_payment_session(
  p_order_id uuid, p_session_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_device_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.order_payments%rowtype;
begin
  select p.* into v_payment from public.order_payments p join public.orders o on o.id=p.order_id
  where p.order_id=p_order_id and p.payment_session_id=p_session_id and p.method::text='qr'
    and o.restaurant_id=p_restaurant_id and o.branch_id=p_branch_id and o.device_id=p_device_id for update of p;
  if not found then return null; end if;
  if v_payment.status::text in ('pending','authorized') and v_payment.expires_at <= now() then
    update public.order_payments set status='failed', provider_status='expired', failure_code='qr_expired', failed_at=now()
    where id=v_payment.id returning * into v_payment;
  end if;
  return public.qr_payment_session_json(v_payment.id, false);
end;
$$;

create or replace function public.cancel_qr_payment_session(
  p_order_id uuid, p_session_id uuid, p_restaurant_id uuid, p_branch_id uuid, p_device_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.order_payments%rowtype;
begin
  select p.* into v_payment from public.order_payments p join public.orders o on o.id=p.order_id
  where p.order_id=p_order_id and p.payment_session_id=p_session_id and p.method::text='qr'
    and o.restaurant_id=p_restaurant_id and o.branch_id=p_branch_id and o.device_id=p_device_id for update of p;
  if not found then raise exception 'order_not_found'; end if;
  if v_payment.status::text = 'captured' then return public.qr_payment_session_json(v_payment.id, false); end if;
  if v_payment.status::text in ('pending','authorized') then
    update public.order_payments set status='cancelled', provider_status='cancelled'
    where id=v_payment.id returning * into v_payment;
  end if;
  return public.qr_payment_session_json(v_payment.id, false);
end;
$$;

create or replace function public.apply_qr_payment_webhook(
  p_event_id text, p_event_type text, p_provider_session_id text, p_payment_reference text,
  p_provider_transaction_id text, p_amount numeric, p_currency text, p_failure_code text,
  p_provider_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.order_payments%rowtype;
  v_order public.orders%rowtype;
begin
  if nullif(trim(p_event_id),'') is null then raise exception 'invalid_order_request'; end if;
  select * into v_payment from public.order_payments
  where method::text='qr' and (provider_session_id=nullif(trim(p_provider_session_id),'') or external_reference=trim(p_payment_reference))
  order by created_at desc limit 1 for update;
  if not found then return null; end if;
  if p_event_id = any(v_payment.provider_event_ids) then return public.qr_payment_session_json(v_payment.id, true); end if;
  if v_payment.amount <> p_amount or v_payment.currency <> upper(trim(p_currency)) then raise exception 'payment_amount_mismatch'; end if;
  select * into v_order from public.orders where id=v_payment.order_id for update;

  update public.order_payments set
    provider_event_ids=array_append(provider_event_ids,p_event_id),
    provider_payload=provider_payload || coalesce(p_provider_payload,'{}'::jsonb),
    provider_transaction_id=coalesce(nullif(trim(p_provider_transaction_id),''),provider_transaction_id)
  where id=v_payment.id returning * into v_payment;

  if p_event_type='payment.paid' then
    if v_payment.status::text='captured' then return public.qr_payment_session_json(v_payment.id, true); end if;
    if v_payment.expires_at <= now() then
      update public.order_payments set status='failed',provider_status='expired',failure_code='qr_expired',failed_at=now()
      where id=v_payment.id returning * into v_payment;
      return public.qr_payment_session_json(v_payment.id,false);
    end if;
    if v_payment.status::text in ('failed','cancelled') then return public.qr_payment_session_json(v_payment.id,false); end if;
    update public.order_payments set status='captured',provider_status='paid',authorized_at=coalesce(authorized_at,now()),
      captured_at=now(),paid_at=now() where id=v_payment.id returning * into v_payment;
    if v_order.status in ('awaiting_payment','payment_failed') then
      update public.orders set status='paid',payment_status='paid' where id=v_order.id;
      insert into public.order_status_events(order_id,from_status,to_status,actor_type,actor_id,metadata)
      values(v_order.id,v_order.status,'paid','system','qr_webhook',jsonb_build_object('providerEventId',p_event_id));
      update public.orders set status='submitted',placed_at=now() where id=v_order.id;
      insert into public.order_status_events(order_id,from_status,to_status,actor_type,actor_id,metadata)
      values(v_order.id,'paid','submitted','system','qr_webhook',jsonb_build_object('providerEventId',p_event_id));
    elsif v_order.status='paid' then
      update public.orders set status='submitted',placed_at=now(),payment_status='paid' where id=v_order.id;
      insert into public.order_status_events(order_id,from_status,to_status,actor_type,actor_id,metadata)
      values(v_order.id,'paid','submitted','system','qr_webhook',jsonb_build_object('providerEventId',p_event_id));
    end if;
  elsif p_event_type='payment.processing' and v_payment.status::text='pending' then
    update public.order_payments set status='authorized',provider_status='processing',authorized_at=now()
    where id=v_payment.id returning * into v_payment;
  elsif p_event_type='payment.expired' and v_payment.status::text in ('pending','authorized') then
    update public.order_payments set status='failed',provider_status='expired',failure_code='qr_expired',failed_at=now()
    where id=v_payment.id returning * into v_payment;
  elsif p_event_type='payment.cancelled' and v_payment.status::text in ('pending','authorized') then
    update public.order_payments set status='cancelled',provider_status='cancelled'
    where id=v_payment.id returning * into v_payment;
  elsif p_event_type='payment.failed' and v_payment.status::text in ('pending','authorized') then
    update public.order_payments set status='failed',provider_status='failed',failure_code=coalesce(nullif(trim(p_failure_code),''),'provider_failed'),failed_at=now()
    where id=v_payment.id returning * into v_payment;
  end if;
  return public.qr_payment_session_json(v_payment.id,false);
end;
$$;

create table if not exists public.qr_payment_refresh_signals(
  payment_session_id uuid primary key,
  changed_at timestamptz not null default now()
);
alter table public.qr_payment_refresh_signals enable row level security;
drop policy if exists "public reads QR payment refresh signals" on public.qr_payment_refresh_signals;
create policy "public reads QR payment refresh signals" on public.qr_payment_refresh_signals
  for select to anon,authenticated using(true);
grant select on public.qr_payment_refresh_signals to anon,authenticated;

create or replace function public.signal_qr_payment_refresh()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.method::text='qr' and new.payment_session_id is not null then
    insert into public.qr_payment_refresh_signals(payment_session_id,changed_at) values(new.payment_session_id,now())
    on conflict(payment_session_id) do update set changed_at=excluded.changed_at;
  end if;
  return new;
end;
$$;
drop trigger if exists order_payments_qr_refresh on public.order_payments;
create trigger order_payments_qr_refresh after insert or update on public.order_payments
for each row execute function public.signal_qr_payment_refresh();

revoke all on function public.qr_payment_session_json(uuid,boolean) from public,anon,authenticated;
revoke all on function public.find_reusable_qr_payment_session(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_qr_payment_session(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,boolean) from public,anon,authenticated;
revoke all on function public.get_qr_payment_session(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.cancel_qr_payment_session(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.apply_qr_payment_webhook(text,text,text,text,text,numeric,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.get_mock_qr_payment_session(uuid) from public,anon,authenticated;
revoke all on function public.apply_mock_qr_payment_outcome(uuid,text) from public,anon,authenticated;
grant execute on function public.qr_payment_session_json(uuid,boolean) to service_role;
grant execute on function public.find_reusable_qr_payment_session(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.create_qr_payment_session(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,boolean) to service_role;
grant execute on function public.get_qr_payment_session(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.cancel_qr_payment_session(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.apply_qr_payment_webhook(text,text,text,text,text,numeric,text,text,jsonb) to service_role;
grant execute on function public.get_mock_qr_payment_session(uuid) to service_role;
grant execute on function public.apply_mock_qr_payment_outcome(uuid,text) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.qr_payment_refresh_signals;
exception when duplicate_object then null; when undefined_object then raise notice 'supabase_realtime publication is unavailable'; end $$;
