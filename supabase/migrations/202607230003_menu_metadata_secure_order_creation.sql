-- Phase 6 metadata preserves Nori's richer local model without changing stable product IDs.
alter table public.products add column if not exists metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object');
alter table public.product_customization_groups add column if not exists source_id text;
alter table public.product_customization_options add column if not exists source_id text;
alter table public.product_customization_options add column if not exists metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object');
create unique index if not exists customization_groups_product_source_uidx on public.product_customization_groups(product_id, source_id);
create unique index if not exists customization_options_group_source_uidx on public.product_customization_options(group_id, source_id);

-- Tax is branch configuration, not a browser-supplied or globally hardcoded value.
alter table public.branches add column if not exists tax_rate numeric(7,6) not null default 0 check (tax_rate >= 0 and tax_rate <= 1);
alter table public.orders add column if not exists idempotency_key uuid;
create unique index if not exists orders_branch_source_idempotency_uidx on public.orders(branch_id, source, idempotency_key) where idempotency_key is not null;

create function public.resolve_active_branch(p_code text)
returns table(id uuid, name text, code text, currency character, timezone text, tax_rate numeric)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.code, b.currency, b.timezone, b.tax_rate
  from public.branches b where b.code = upper(trim(p_code)) and b.is_active limit 1;
$$;
revoke all on function public.resolve_active_branch(text) from public;
grant execute on function public.resolve_active_branch(text) to anon, authenticated;

create function public.create_order(
  p_branch_id uuid,
  p_source public.order_source,
  p_order_type text,
  p_items jsonb,
  p_customer_note text,
  p_idempotency_key uuid
)
returns table(
  order_id uuid, order_number text, subtotal numeric, tax numeric, total numeric, currency character,
  order_status public.order_status, payment_status public.payment_status, created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_option_ids uuid[];
  v_option record;
  v_group record;
  v_selected_count integer;
  v_unit numeric(12,2);
  v_line numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax numeric(12,2);
  v_total numeric(12,2);
  v_customizations jsonb;
  v_line_count integer;
  v_total_quantity integer;
begin
  if p_idempotency_key is null then raise exception using errcode = '22023', message = 'idempotency_key_required'; end if;
  if p_source not in ('kiosk', 'cashier', 'nori') then raise exception using errcode = '22023', message = 'invalid_source'; end if;
  if auth.role() = 'anon' and p_source not in ('kiosk', 'nori') then raise exception using errcode = '42501', message = 'source_not_authorized'; end if;
  if p_order_type not in ('dine_in', 'takeaway') then raise exception using errcode = '22023', message = 'invalid_order_type'; end if;
  if p_customer_note is not null and length(p_customer_note) > 500 then raise exception using errcode = '22023', message = 'customer_note_too_long'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception using errcode = '22023', message = 'invalid_items'; end if;
  v_line_count := jsonb_array_length(p_items);
  if v_line_count < 1 or v_line_count > 50 then raise exception using errcode = '22023', message = 'invalid_line_count'; end if;
  select coalesce(sum((item->>'quantity')::integer), 0) into v_total_quantity from jsonb_array_elements(p_items) item;
  if v_total_quantity < 1 or v_total_quantity > 100 then raise exception using errcode = '22023', message = 'invalid_total_quantity'; end if;

  select * into v_branch from public.branches where id = p_branch_id and is_active for share;
  if not found then raise exception using errcode = 'P0002', message = 'branch_unavailable'; end if;
  if auth.role() = 'authenticated' and public.current_user_role() = 'cashier' and public.current_user_branch_id() <> p_branch_id then
    raise exception using errcode = '42501', message = 'branch_not_authorized';
  end if;
  if auth.role() = 'authenticated' and public.current_user_role() = 'cashier' and p_source <> 'cashier' then
    raise exception using errcode = '42501', message = 'source_not_authorized';
  end if;
  if auth.role() = 'authenticated' and public.current_user_role() not in ('admin', 'cashier') then
    raise exception using errcode = '42501', message = 'role_not_authorized';
  end if;

  select * into v_order from public.orders where branch_id = p_branch_id and source = p_source and idempotency_key = p_idempotency_key;
  if found then
    return query select v_order.id, v_order.order_number, v_order.subtotal, v_order.tax, v_order.total, v_order.currency,
      v_order.status, v_order.payment_status, v_order.created_at;
    return;
  end if;

  -- Validate and price the entire request before inserting anything.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'product_id') or not (v_item ? 'quantity') then
      raise exception using errcode = '22023', message = 'invalid_item';
    end if;
    begin v_qty := (v_item->>'quantity')::integer; exception when others then raise exception using errcode = '22023', message = 'invalid_quantity'; end;
    if v_qty < 1 or v_qty > 20 then raise exception using errcode = '22023', message = 'invalid_quantity'; end if;
    select * into v_product from public.products where id = v_item->>'product_id' and is_active and is_available for share;
    if not found then raise exception using errcode = 'P0002', message = 'product_unavailable'; end if;
    if v_product.currency <> v_branch.currency then raise exception using errcode = '22023', message = 'currency_mismatch'; end if;
    begin
      select coalesce(array_agg(value::text::uuid), '{}'::uuid[]) into v_option_ids
      from jsonb_array_elements_text(coalesce(v_item->'customization_option_ids', '[]'::jsonb));
    exception when others then raise exception using errcode = '22023', message = 'invalid_customization_option'; end;
    if cardinality(v_option_ids) <> (select count(distinct value) from unnest(v_option_ids) value) then
      raise exception using errcode = '22023', message = 'duplicate_customization_option';
    end if;
    for v_option in
      select o.*, g.product_id from public.product_customization_options o
      join public.product_customization_groups g on g.id = o.group_id where o.id = any(v_option_ids)
    loop
      if not v_option.is_available or v_option.product_id <> v_product.id then
        raise exception using errcode = '22023', message = 'invalid_customization_option';
      end if;
    end loop;
    if cardinality(v_option_ids) <> (select count(*) from public.product_customization_options where id = any(v_option_ids)) then
      raise exception using errcode = '22023', message = 'invalid_customization_option';
    end if;
    for v_group in select * from public.product_customization_groups where product_id = v_product.id
    loop
      select count(*) into v_selected_count from public.product_customization_options where group_id = v_group.id and id = any(v_option_ids);
      if v_selected_count < v_group.minimum_selections or v_selected_count > v_group.maximum_selections then
        raise exception using errcode = '22023', message = 'customization_selection_count';
      end if;
    end loop;
    select v_product.price + coalesce(sum(price_delta), 0) into v_unit from public.product_customization_options where id = any(v_option_ids);
    v_subtotal := v_subtotal + round(v_unit * v_qty, 2);
  end loop;

  v_tax := round(v_subtotal * v_branch.tax_rate, 2);
  v_total := v_subtotal + v_tax;
  insert into public.orders(branch_id, order_number, order_type, status, payment_status, subtotal, tax, total, currency, customer_note, source, created_by, idempotency_key)
  values (p_branch_id, v_branch.code || '-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_sequence')::text, 6, '0'),
    p_order_type, 'pending', 'unpaid', v_subtotal, v_tax, v_total, v_branch.currency, nullif(trim(p_customer_note), ''), p_source,
    case when auth.role() = 'authenticated' then auth.uid() else null end, p_idempotency_key)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_item->>'product_id';
    select coalesce(array_agg(value::text::uuid), '{}'::uuid[]) into v_option_ids from jsonb_array_elements_text(coalesce(v_item->'customization_option_ids', '[]'::jsonb));
    select v_product.price + coalesce(sum(price_delta), 0) into v_unit from public.product_customization_options where id = any(v_option_ids);
    v_line := round(v_unit * v_qty, 2);
    select coalesce(jsonb_agg(jsonb_build_object('option_id', id, 'name', name, 'price_delta', price_delta)), '[]'::jsonb)
      into v_customizations from public.product_customization_options where id = any(v_option_ids);
    insert into public.order_items(order_id, product_id, product_name_snapshot, unit_price, quantity, line_total, customizations, notes)
    values (v_order.id, v_product.id, v_product.name, v_unit, v_qty, v_line, v_customizations, null);
  end loop;

  return query select v_order.id, v_order.order_number, v_order.subtotal, v_order.tax, v_order.total, v_order.currency,
    v_order.status, v_order.payment_status, v_order.created_at;
exception when unique_violation then
  select * into v_order from public.orders where branch_id = p_branch_id and source = p_source and idempotency_key = p_idempotency_key;
  if found then return query select v_order.id, v_order.order_number, v_order.subtotal, v_order.tax, v_order.total, v_order.currency, v_order.status, v_order.payment_status, v_order.created_at; return; end if;
  raise;
end;
$$;

revoke all on function public.create_order(uuid, public.order_source, text, jsonb, text, uuid) from public;
grant execute on function public.create_order(uuid, public.order_source, text, jsonb, text, uuid) to anon, authenticated;

-- All order creation now goes through the pricing RPC; direct client inserts are closed.
drop policy if exists "cashiers insert branch orders" on public.orders;
drop policy if exists "cashiers insert branch order items" on public.order_items;

-- Example development branch. Review tax_rate before production use.
insert into public.branches(name, code, currency, timezone, tax_rate)
values ('cangujet Main Branch', 'MAIN', 'EUR', 'Europe/Istanbul', 0.08)
on conflict (code) do nothing;
