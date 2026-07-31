-- Migration: Fix Payment Capture Order Transition & RPC Status JSON
-- Created at: 2026-07-31

create or replace function public.record_production_payment(
  p_order_id uuid,
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_method text,
  p_amount_received numeric,
  p_external_reference text,
  p_captured boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_existing public.order_payments%rowtype;
  v_payment public.order_payments%rowtype;
  v_change numeric(14,2) := 0;
  v_status public.order_payment_lifecycle_status;
begin
  select * into v_order from public.orders
  where id = p_order_id and restaurant_id = p_restaurant_id and branch_id = p_branch_id for update;
  if not found then raise exception 'order_not_found'; end if;

  select * into v_existing from public.order_payments
  where order_id = p_order_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object(
      'order', public.production_order_json(v_order.id),
      'paymentId', v_existing.id,
      'paymentStatus', v_existing.status,
      'amount', to_char(v_existing.amount, 'FM9999999990.00'),
      'change', to_char(v_existing.change, 'FM9999999990.00'),
      'duplicate', true
    );
  end if;

  if v_order.status not in ('awaiting_payment', 'payment_failed') then
    raise exception 'invalid_order_transition';
  end if;

  if p_method = 'cash' and coalesce(p_amount_received, 0) < v_order.total then
    raise exception 'payment_failed';
  end if;

  if p_method = 'cash' then
    v_change := p_amount_received - v_order.total;
  end if;

  v_status := case when p_captured then 'captured'::public.order_payment_lifecycle_status else 'pending'::public.order_payment_lifecycle_status end;

  insert into public.order_payments(
    order_id, provider, method, status, amount, amount_received, change, currency,
    external_reference, idempotency_key, request_fingerprint, authorized_at, captured_at
  ) values (
    v_order.id, case when p_method = 'card_terminal' then 'card_terminal' else 'internal' end,
    p_method::public.order_payment_method, v_status, v_order.total, p_amount_received,
    v_change, v_order.currency, nullif(trim(p_external_reference), ''), p_idempotency_key,
    p_request_fingerprint, case when p_captured then now() end, case when p_captured then now() end
  ) returning * into v_payment;

  if p_captured then
    update public.orders
    set status = 'paid',
        payment_status = 'paid',
        updated_at = now()
    where id = v_order.id;

    insert into public.order_status_events(order_id, from_status, to_status, actor_type, actor_id)
    values (v_order.id, v_order.status, 'paid', p_actor_type::public.order_actor_type, p_actor_id);
  end if;

  return jsonb_build_object(
    'order', public.production_order_json(v_order.id),
    'paymentId', v_payment.id,
    'paymentStatus', v_payment.status,
    'amount', to_char(v_payment.amount, 'FM9999999990.00'),
    'change', to_char(v_payment.change, 'FM9999999990.00'),
    'duplicate', false
  );
exception when unique_violation then
  select * into v_existing from public.order_payments
  where order_id = p_order_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint = p_request_fingerprint then
      return jsonb_build_object(
        'order', public.production_order_json(v_order.id),
        'paymentId', v_existing.id,
        'paymentStatus', v_existing.status,
        'amount', to_char(v_existing.amount, 'FM9999999990.00'),
        'change', to_char(v_existing.change, 'FM9999999990.00'),
        'duplicate', true
      );
    end if;
    raise exception 'idempotency_conflict';
  end if;
  raise;
end;
$$;

revoke all on function public.record_production_payment(uuid, uuid, uuid, text, text, uuid, text, text, numeric, text, boolean) from public, anon, authenticated;
grant execute on function public.record_production_payment(uuid, uuid, uuid, text, text, uuid, text, text, numeric, text, boolean) to service_role;
