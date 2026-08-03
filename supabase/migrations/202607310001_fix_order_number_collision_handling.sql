-- Migration: Fix Order Number Collision Handling & Idempotency Exception Scope
-- Created at: 2026-07-31

create or replace function public.create_production_order(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_source text,
  p_service_mode text,
  p_language text,
  p_notes text,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_menu_id uuid,
  p_menu_version integer,
  p_quote jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_branch public.branches%rowtype;
  v_existing public.orders%rowtype;
  v_order public.orders%rowtype;
  v_business_date date;
  v_counter integer;
  v_number text;
  v_item jsonb;
  v_modifier jsonb;
  v_item_id uuid;
begin
  if p_idempotency_key is null or p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_order_request';
  end if;

  select * into v_existing from public.orders
  where restaurant_id = p_restaurant_id and branch_id = p_branch_id
    and coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_device_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and source::text = p_source and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint is distinct from p_request_fingerprint then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('order', public.production_order_json(v_existing.id), 'duplicate', true);
  end if;

  select * into v_branch from public.branches
  where id = p_branch_id and restaurant_id = p_restaurant_id and is_active for share;
  if not found then raise exception 'order_not_found'; end if;

  if p_device_id is not null and not exists (
    select 1 from public.devices d where d.id = p_device_id and d.restaurant_id = p_restaurant_id
      and d.branch_id = p_branch_id and d.status = 'active'
  ) then raise exception 'unauthorized'; end if;

  if not exists (
    select 1 from public.menu_branches mb join public.menus m on m.id = mb.menu_id
    where mb.branch_id = p_branch_id and mb.menu_id = p_menu_id and mb.is_active
      and m.restaurant_id = p_restaurant_id and m.status = 'published' and m.version = p_menu_version
  ) then raise exception 'price_changed'; end if;

  if p_service_mode not in ('dine_in', 'take_away') or not (p_service_mode = any(v_branch.service_modes)) then
    raise exception 'unsupported_service_mode';
  end if;

  v_business_date := (now() at time zone v_branch.timezone)::date;

  insert into public.order_counters(branch_id, business_date, current_value)
  values (p_branch_id, v_business_date, 1)
  on conflict (branch_id, business_date)
  do update set current_value = public.order_counters.current_value + 1
  returning current_value into v_counter;

  v_number := upper(left(v_branch.code, 1)) || lpad((100 + v_counter)::text, 3, '0');

  insert into public.orders(
    restaurant_id, branch_id, device_id, source, order_number, status, service_mode,
    currency, subtotal, tax_total, discount_total, total, notes, language,
    customer_reference, business_date, idempotency_key, request_fingerprint, menu_id, menu_version
  ) values (
    p_restaurant_id, p_branch_id, p_device_id, p_source::public.order_source, v_number,
    'awaiting_payment', p_service_mode, v_branch.currency,
    (p_quote->>'subtotal')::numeric, (p_quote->>'taxTotal')::numeric,
    (p_quote->>'discountTotal')::numeric, (p_quote->>'total')::numeric,
    nullif(trim(p_notes), ''), p_language, encode(gen_random_bytes(24), 'hex'),
    v_business_date, p_idempotency_key, p_request_fingerprint, p_menu_id, p_menu_version
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_quote->'items') loop
    insert into public.order_items(
      order_id, product_id, product_name_snapshot, quantity, unit_price,
      line_subtotal, tax_total, line_total, notes, sort_order, tax_rate, allergens, customizations
    ) values (
      v_order.id, v_item->>'productId', v_item->>'productName', (v_item->>'quantity')::integer,
      (v_item->>'unitPrice')::numeric, (v_item->>'lineSubtotal')::numeric,
      (v_item->>'taxTotal')::numeric, (v_item->>'lineTotal')::numeric,
      nullif(trim(v_item->>'notes'), ''), (v_item->>'sortOrder')::integer,
      (v_item->>'taxRate')::numeric,
      array(select jsonb_array_elements_text(coalesce(v_item->'allergens', '[]'::jsonb))),
      coalesce(v_item->'modifiers', '[]'::jsonb)
    ) returning id into v_item_id;

    for v_modifier in select value from jsonb_array_elements(coalesce(v_item->'modifiers', '[]'::jsonb)) loop
      insert into public.order_item_modifiers(
        order_item_id, modifier_group_id, modifier_id, group_name_snapshot,
        modifier_name_snapshot, quantity, unit_price, total
      ) values (
        v_item_id, (v_modifier->>'modifierGroupId')::uuid, (v_modifier->>'modifierId')::uuid,
        v_modifier->>'groupName', v_modifier->>'name', (v_modifier->>'quantity')::integer,
        (v_modifier->>'unitPrice')::numeric, (v_modifier->>'total')::numeric
      );
    end loop;
  end loop;

  insert into public.order_status_events(order_id, from_status, to_status, actor_type, actor_id)
  values (v_order.id, null, 'awaiting_payment', p_actor_type::public.order_actor_type, p_actor_id);

  return jsonb_build_object('order', public.production_order_json(v_order.id), 'duplicate', false);
exception when unique_violation then
  select * into v_existing from public.orders
  where restaurant_id = p_restaurant_id and branch_id = p_branch_id
    and coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_device_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and source::text = p_source and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_fingerprint = p_request_fingerprint then
      return jsonb_build_object('order', public.production_order_json(v_existing.id), 'duplicate', true);
    end if;
    raise;
  end if;
  raise;
end;
$$;

revoke all on function public.create_production_order(uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_production_order(uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, uuid, integer, jsonb) to service_role;

-- Synchronize order_counters for all active branches and business dates
do $$
declare
  r record;
  v_max_val integer;
begin
  for r in
    select branch_id, business_date
    from public.orders
    group by branch_id, business_date
  loop
    select coalesce(max(
      case
        when order_number ~ '^[A-Za-z][0-9]+$' then substring(order_number from 2)::integer - 100
        else 0
      end
    ), 0) into v_max_val
    from public.orders
    where branch_id = r.branch_id and business_date = r.business_date;

    if v_max_val > 0 then
      insert into public.order_counters(branch_id, business_date, current_value)
      values (r.branch_id, r.business_date, v_max_val)
      on conflict (branch_id, business_date)
      do update set current_value = greatest(public.order_counters.current_value, v_max_val);
    end if;
  end loop;
end;
$$;
