-- Phase 3: authoritative order lifecycle, payments, snapshots, and realtime kitchen queue.
-- Deploy after 202607300002_dynamic_restaurant_configuration.sql.

-- Retire every legacy mutation/tracking RPC before changing the status type. The
-- application server below is the only order write boundary after this migration.
drop function if exists public.create_order(uuid, public.order_source, text, jsonb, text, uuid);
drop function if exists public.transition_order_status(uuid, public.order_status, text);
drop function if exists public.public_order_status();
drop function if exists public.get_public_order_board(text);
drop function if exists public.get_order_tracking(uuid, text);

do $$ begin
  create type public.order_lifecycle_status as enum (
    'draft', 'awaiting_payment', 'paid', 'submitted', 'accepted', 'preparing',
    'ready', 'completed', 'cancelled', 'payment_failed', 'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_payment_lifecycle_status as enum (
    'pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_payment_method as enum ('cash', 'pay_at_cashier', 'card_terminal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_actor_type as enum ('device', 'cashier', 'kitchen', 'admin', 'system');
exception when duplicate_object then null; end $$;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'order_type'
  ) then alter table public.orders rename column order_type to service_mode; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'tax'
  ) then alter table public.orders rename column tax to tax_total; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'customer_note'
  ) then alter table public.orders rename column customer_note to notes; end if;
end $$;

update public.orders set service_mode = 'take_away' where service_mode = 'takeaway';

-- PostgreSQL will not alter a column type while a trigger has a column-level
-- dependency on it (for example, "UPDATE OF status"). Preserve every such
-- trigger definition, remove it only while conversion is required, and restore
-- it in the same transaction. A failure rolls the whole operation back.
create temporary table if not exists phase3_orders_status_triggers (
  trigger_name text primary key,
  trigger_definition text not null
) on commit drop;
truncate table pg_temp.phase3_orders_status_triggers;

do $$
declare
  v_status_type text;
  v_status_attnum smallint;
  v_trigger record;
begin
  select format('%I.%I', type_namespace.nspname, status_type.typname), status_attribute.attnum
  into v_status_type, v_status_attnum
  from pg_attribute status_attribute
  join pg_class orders_table on orders_table.oid = status_attribute.attrelid
  join pg_namespace orders_namespace on orders_namespace.oid = orders_table.relnamespace
  join pg_type status_type on status_type.oid = status_attribute.atttypid
  join pg_namespace type_namespace on type_namespace.oid = status_type.typnamespace
  where orders_namespace.nspname = 'public'
    and orders_table.relname = 'orders'
    and status_attribute.attname = 'status'
    and not status_attribute.attisdropped;

  if v_status_type is null then
    raise exception 'public.orders.status is required before the production order migration';
  end if;

  -- An already-migrated production database needs no type rewrite. This also
  -- leaves all of its triggers and indexes continuously installed.
  if v_status_type <> 'public.order_lifecycle_status' then
    insert into pg_temp.phase3_orders_status_triggers(trigger_name, trigger_definition)
    select status_trigger.tgname, pg_get_triggerdef(status_trigger.oid, true)
    from pg_trigger status_trigger
    where status_trigger.tgrelid = 'public.orders'::regclass
      and not status_trigger.tgisinternal
      and exists (
        select 1
        from pg_depend dependency
        where dependency.classid = 'pg_trigger'::regclass
          and dependency.objid = status_trigger.oid
          and dependency.refclassid = 'pg_class'::regclass
          and dependency.refobjid = status_trigger.tgrelid
          and dependency.refobjsubid = v_status_attnum
      )
    on conflict (trigger_name) do update
      set trigger_definition = excluded.trigger_definition;

    for v_trigger in
      select trigger_name from pg_temp.phase3_orders_status_triggers order by trigger_name
    loop
      execute format('drop trigger %I on public.orders', v_trigger.trigger_name);
    end loop;

    alter table public.orders alter column status drop default;
    alter table public.orders
      alter column status type public.order_lifecycle_status
      using (
        case status::text
          when 'pending' then 'awaiting_payment'
          when 'confirmed' then 'accepted'
          else status::text
        end
      )::public.order_lifecycle_status;

    for v_trigger in
      select trigger_definition
      from pg_temp.phase3_orders_status_triggers
      order by trigger_name
    loop
      execute v_trigger.trigger_definition;
    end loop;
  end if;
end;
$$;

alter table public.orders alter column status set default 'awaiting_payment';
drop table if exists pg_temp.phase3_orders_status_triggers;

alter table public.orders
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete restrict,
  add column if not exists device_id uuid references public.devices(id) on delete set null,
  add column if not exists discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  add column if not exists language text not null default 'en' check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  add column if not exists customer_reference text default encode(gen_random_bytes(24), 'hex'),
  add column if not exists placed_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists business_date date,
  add column if not exists request_fingerprint text,
  add column if not exists menu_id uuid references public.menus(id) on delete restrict,
  add column if not exists menu_version integer;

update public.orders o
set restaurant_id = b.restaurant_id,
    business_date = (o.created_at at time zone b.timezone)::date,
    customer_reference = coalesce(o.customer_reference, encode(gen_random_bytes(24), 'hex'))
from public.branches b
where b.id = o.branch_id
  and (o.restaurant_id is null or o.business_date is null or o.customer_reference is null);

alter table public.orders
  alter column restaurant_id set not null,
  alter column customer_reference set not null,
  alter column business_date set not null,
  alter column subtotal type numeric(14,2),
  alter column tax_total type numeric(14,2),
  alter column total type numeric(14,2);

alter table public.orders drop constraint if exists orders_total_check;
alter table public.orders add constraint orders_authoritative_total_check
  check (total = subtotal + tax_total - discount_total and total >= 0);
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders drop constraint if exists orders_service_mode_check;
alter table public.orders add constraint orders_service_mode_check
  check (service_mode in ('dine_in', 'take_away'));
do $$ begin
  alter table public.orders add constraint orders_customer_reference_key unique(customer_reference);
exception when duplicate_object then null; end $$;
create unique index if not exists orders_branch_business_number_uidx
  on public.orders(branch_id, business_date, order_number);
create unique index if not exists orders_actor_idempotency_uidx
  on public.orders(restaurant_id, branch_id, coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid), source, idempotency_key)
  where idempotency_key is not null;

alter table public.order_items
  add column if not exists line_subtotal numeric(14,2),
  add column if not exists tax_total numeric(14,2) not null default 0,
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
  add column if not exists sort_order integer not null default 0 check (sort_order >= 0),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists tax_rate numeric(7,6) not null default 0 check (tax_rate between 0 and 1),
  add column if not exists allergens text[] not null default '{}';
update public.order_items set line_subtotal = line_total where line_subtotal is null;
alter table public.order_items
  alter column line_subtotal set not null,
  alter column unit_price type numeric(14,2),
  alter column line_total type numeric(14,2);
alter table public.order_items drop constraint if exists order_items_line_total_check;
alter table public.order_items add constraint order_items_line_total_check
  check (line_total = line_subtotal + tax_total and line_total >= 0);

create table if not exists public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  modifier_group_id uuid references public.product_customization_groups(id) on delete set null,
  modifier_id uuid references public.product_customization_options(id) on delete set null,
  group_name_snapshot text not null,
  modifier_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total numeric(14,2) not null check (total = unit_price * quantity),
  created_at timestamptz not null default now()
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  method public.order_payment_method not null,
  status public.order_payment_lifecycle_status not null,
  amount numeric(14,2) not null check (amount >= 0),
  amount_received numeric(14,2) check (amount_received is null or amount_received >= 0),
  change numeric(14,2) not null default 0 check (change >= 0),
  currency char(3) not null check (currency = upper(currency)),
  external_reference text,
  idempotency_key uuid not null,
  request_fingerprint text not null,
  failure_code text,
  failure_message text,
  authorized_at timestamptz,
  captured_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, idempotency_key)
);

create table if not exists public.order_status_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_lifecycle_status,
  to_status public.order_lifecycle_status not null,
  actor_type public.order_actor_type not null,
  actor_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

-- Preserve genuine legacy transition history before retiring the old
-- enum-backed table. On an already-migrated database the table is absent, so
-- there is nothing to backfill and rerunning remains safe.
do $$
begin
  if to_regclass('public.order_status_history') is not null then
    execute $history$
      insert into public.order_status_events(
        order_id, from_status, to_status, actor_type, actor_id, reason, metadata, created_at
      )
      select
        h.order_id,
        (case h.previous_status::text
          when 'pending' then 'awaiting_payment'
          when 'confirmed' then 'accepted'
          else h.previous_status::text
        end)::public.order_lifecycle_status,
        (case h.new_status::text
          when 'pending' then 'awaiting_payment'
          when 'confirmed' then 'accepted'
          else h.new_status::text
        end)::public.order_lifecycle_status,
        'system',
        h.changed_by::text,
        h.reason,
        jsonb_build_object('migratedFrom', 'order_status_history'),
        h.changed_at
      from public.order_status_history h
    $history$;
  end if;
end;
$$;
drop table if exists public.order_status_history cascade;

create table if not exists public.order_counters (
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  current_value integer not null default 0 check (current_value >= 0),
  primary key(branch_id, business_date)
);

create index if not exists orders_branch_status_idx on public.orders(branch_id, status, created_at);
create index if not exists orders_branch_created_idx on public.orders(branch_id, created_at desc);
create index if not exists orders_restaurant_created_idx on public.orders(restaurant_id, created_at desc);
create index if not exists orders_order_number_idx on public.orders(order_number);
create index if not exists orders_active_kitchen_idx on public.orders(branch_id, placed_at, version)
  where status in ('submitted', 'accepted', 'preparing', 'ready');
create index if not exists orders_device_created_idx on public.orders(device_id, created_at desc) where device_id is not null;
create index if not exists order_items_order_sort_idx on public.order_items(order_id, sort_order);
create index if not exists order_item_modifiers_item_idx on public.order_item_modifiers(order_item_id);
create index if not exists order_payments_status_idx on public.order_payments(status, created_at desc);
create index if not exists order_payments_order_idx on public.order_payments(order_id, created_at desc);
create index if not exists order_status_events_history_idx on public.order_status_events(order_id, created_at, id);

create or replace function public.bump_order_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists orders_version_update on public.orders;
create trigger orders_version_update before update on public.orders
for each row execute function public.bump_order_version();
drop trigger if exists order_items_updated_at on public.order_items;
create trigger order_items_updated_at before update on public.order_items
for each row execute function public.set_updated_at();
drop trigger if exists order_payments_updated_at on public.order_payments;
create trigger order_payments_updated_at before update on public.order_payments
for each row execute function public.set_updated_at();

alter table public.order_item_modifiers enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_status_events enable row level security;
alter table public.order_counters enable row level security;

drop policy if exists "branch staff read orders" on public.orders;
drop policy if exists "admins update orders" on public.orders;
drop policy if exists "branch staff read order items" on public.order_items;
drop policy if exists "public read orders" on public.orders;
drop policy if exists "public read order items" on public.order_items;
drop policy if exists "restaurant staff read scoped orders" on public.orders;
drop policy if exists "restaurant staff read scoped order items" on public.order_items;
drop policy if exists "restaurant staff read scoped modifiers" on public.order_item_modifiers;
drop policy if exists "restaurant staff read scoped payments" on public.order_payments;
drop policy if exists "restaurant staff read scoped status events" on public.order_status_events;
revoke insert, update, delete, truncate, references, trigger on public.orders, public.order_items
  from anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

create policy "restaurant staff read scoped orders" on public.orders for select to authenticated using (
  exists (
    select 1 from public.staff_memberships sm
    where sm.user_id = auth.uid() and sm.restaurant_id = orders.restaurant_id and sm.is_active
      and (sm.role = 'admin' or sm.branch_id = orders.branch_id)
  )
);
create policy "restaurant staff read scoped order items" on public.order_items for select to authenticated using (
  exists (
    select 1 from public.orders o
    join public.staff_memberships sm on sm.restaurant_id = o.restaurant_id
    where o.id = order_items.order_id and sm.user_id = auth.uid() and sm.is_active
      and (sm.role = 'admin' or sm.branch_id = o.branch_id)
  )
);
create policy "restaurant staff read scoped modifiers" on public.order_item_modifiers for select to authenticated using (
  exists (
    select 1 from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.staff_memberships sm on sm.restaurant_id = o.restaurant_id
    where oi.id = order_item_modifiers.order_item_id and sm.user_id = auth.uid() and sm.is_active
      and (sm.role = 'admin' or sm.branch_id = o.branch_id)
  )
);
create policy "restaurant staff read scoped payments" on public.order_payments for select to authenticated using (
  exists (
    select 1 from public.orders o
    join public.staff_memberships sm on sm.restaurant_id = o.restaurant_id
    where o.id = order_payments.order_id and sm.user_id = auth.uid() and sm.is_active
      and (sm.role = 'admin' or sm.branch_id = o.branch_id)
  )
);
create policy "restaurant staff read scoped status events" on public.order_status_events for select to authenticated using (
  exists (
    select 1 from public.orders o
    join public.staff_memberships sm on sm.restaurant_id = o.restaurant_id
    where o.id = order_status_events.order_id and sm.user_id = auth.uid() and sm.is_active
      and (sm.role = 'admin' or sm.branch_id = o.branch_id)
  )
);
-- Counters are intentionally service-role only.

create or replace function public.production_order_json(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'status', o.status,
    'paymentStatus', (
      select p.status from public.order_payments p
      where p.order_id = o.id order by p.created_at desc limit 1
    ),
    'paymentMethod', (
      select p.method from public.order_payments p
      where p.order_id = o.id order by p.created_at desc limit 1
    ),
    'source', o.source,
    'customerReference', o.customer_reference,
    'version', o.version,
    'notes', o.notes,
    'menuId', o.menu_id,
    'menuVersion', o.menu_version,
    'currency', o.currency,
    'subtotal', to_char(o.subtotal, 'FM9999999990.00'),
    'taxTotal', to_char(o.tax_total, 'FM9999999990.00'),
    'discountTotal', to_char(o.discount_total, 'FM9999999990.00'),
    'total', to_char(o.total, 'FM9999999990.00'),
    'serviceMode', o.service_mode,
    'language', o.language,
    'placedAt', o.placed_at,
    'acceptedAt', o.accepted_at,
    'preparingAt', o.preparing_at,
    'readyAt', o.ready_at,
    'completedAt', o.completed_at,
    'cancelledAt', o.cancelled_at,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', oi.product_id,
        'productName', oi.product_name_snapshot,
        'quantity', oi.quantity,
        'unitPrice', to_char(oi.unit_price, 'FM9999999990.00'),
        'lineSubtotal', to_char(oi.line_subtotal, 'FM9999999990.00'),
        'taxTotal', to_char(oi.tax_total, 'FM9999999990.00'),
        'lineTotal', to_char(oi.line_total, 'FM9999999990.00'),
        'taxRate', to_char(oi.tax_rate, 'FM0.000000'),
        'notes', oi.notes,
        'sortOrder', oi.sort_order,
        'allergens', oi.allergens,
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'modifierGroupId', m.modifier_group_id,
            'modifierId', m.modifier_id,
            'groupName', m.group_name_snapshot,
            'name', m.modifier_name_snapshot,
            'quantity', m.quantity,
            'unitPrice', to_char(m.unit_price, 'FM9999999990.00'),
            'total', to_char(m.total, 'FM9999999990.00')
          ) order by m.created_at, m.id)
          from public.order_item_modifiers m where m.order_item_id = oi.id
        ), '[]'::jsonb)
      ) order by oi.sort_order, oi.id)
      from public.order_items oi where oi.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o where o.id = p_order_id;
$$;

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
  if found and v_existing.request_fingerprint = p_request_fingerprint then
    return jsonb_build_object('order', public.production_order_json(v_existing.id), 'duplicate', true);
  end if;
  raise exception 'idempotency_conflict';
end;
$$;

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
      'order', public.production_order_json(v_order.id), 'paymentId', v_existing.id,
      'paymentStatus', v_existing.status, 'amount', to_char(v_existing.amount, 'FM9999999990.00'),
      'change', to_char(v_existing.change, 'FM9999999990.00'), 'duplicate', true
    );
  end if;
  if v_order.status not in ('awaiting_payment', 'payment_failed') then raise exception 'invalid_order_transition'; end if;
  if p_method = 'cash' and coalesce(p_amount_received, 0) < v_order.total then raise exception 'payment_failed'; end if;
  if p_method = 'cash' then v_change := p_amount_received - v_order.total; end if;
  v_status := case when p_captured then 'captured' else 'pending' end;
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
    update public.orders set status = 'paid', payment_status = 'paid' where id = v_order.id;
    insert into public.order_status_events(order_id, from_status, to_status, actor_type, actor_id)
    values (v_order.id, v_order.status, 'paid', p_actor_type::public.order_actor_type, p_actor_id);
  end if;
  return jsonb_build_object(
    'order', public.production_order_json(v_order.id), 'paymentId', v_payment.id,
    'paymentStatus', v_payment.status, 'amount', to_char(v_payment.amount, 'FM9999999990.00'),
    'change', to_char(v_payment.change, 'FM9999999990.00'), 'duplicate', false
  );
end;
$$;

create or replace function public.transition_production_order(
  p_order_id uuid,
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_expected_version integer,
  p_next_status text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_next public.order_lifecycle_status := p_next_status::public.order_lifecycle_status;
begin
  select * into v_order from public.orders
  where id = p_order_id and restaurant_id = p_restaurant_id
    and (p_branch_id is null or branch_id = p_branch_id) for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.version <> p_expected_version then raise exception 'order_conflict'; end if;
  if not (
    (v_order.status = 'draft' and v_next in ('awaiting_payment', 'cancelled'))
    or (v_order.status = 'awaiting_payment' and v_next in ('paid', 'payment_failed', 'cancelled'))
    or (v_order.status = 'payment_failed' and v_next in ('awaiting_payment', 'cancelled'))
    or (v_order.status = 'paid' and v_next in ('submitted', 'cancelled'))
    or (v_order.status = 'submitted' and v_next in ('accepted', 'rejected', 'cancelled'))
    or (v_order.status = 'accepted' and v_next in ('preparing', 'cancelled'))
    or (v_order.status = 'preparing' and v_next in ('ready', 'cancelled'))
    or (v_order.status = 'ready' and v_next = 'completed')
  ) then raise exception 'invalid_order_transition'; end if;
  update public.orders set
    status = v_next,
    placed_at = case when v_next = 'submitted' then now() else placed_at end,
    accepted_at = case when v_next = 'accepted' then now() else accepted_at end,
    preparing_at = case when v_next = 'preparing' then now() else preparing_at end,
    ready_at = case when v_next = 'ready' then now() else ready_at end,
    completed_at = case when v_next = 'completed' then now() else completed_at end,
    cancelled_at = case when v_next = 'cancelled' then now() else cancelled_at end
  where id = v_order.id;
  insert into public.order_status_events(order_id, from_status, to_status, actor_type, actor_id, reason)
  values (v_order.id, v_order.status, v_next, p_actor_type::public.order_actor_type, p_actor_id, nullif(trim(p_reason), ''));
  return public.production_order_json(v_order.id);
end;
$$;

create or replace function public.get_production_order(
  p_order_id uuid, p_restaurant_id uuid, p_branch_id uuid
) returns jsonb language sql stable security definer set search_path = '' as $$
  select public.production_order_json(o.id) from public.orders o
  where o.id = p_order_id and o.restaurant_id = p_restaurant_id
    and (p_branch_id is null or o.branch_id = p_branch_id);
$$;

create or replace function public.get_production_order_tracking(p_customer_reference text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'orderNumber', o.order_number, 'status', o.status, 'version', o.version,
    'placedAt', o.placed_at, 'acceptedAt', o.accepted_at, 'preparingAt', o.preparing_at,
    'readyAt', o.ready_at, 'completedAt', o.completed_at, 'cancelledAt', o.cancelled_at,
    'updatedAt', o.updated_at
  ) from public.orders o where o.customer_reference = p_customer_reference;
$$;

create or replace function public.list_production_orders(
  p_restaurant_id uuid, p_branch_id uuid, p_audience text
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.production_order_json(o.id) order by coalesce(o.placed_at, o.created_at), o.id), '[]'::jsonb)
  from public.orders o
  where o.restaurant_id = p_restaurant_id and (p_branch_id is null or o.branch_id = p_branch_id)
    and (
      (p_audience = 'kitchen' and (
        o.status in ('submitted', 'accepted', 'preparing', 'ready')
        or (o.status = 'completed' and o.completed_at >= now() - interval '24 hours')
      ))
      or (p_audience = 'display' and (
        o.status in ('submitted', 'accepted', 'preparing', 'ready')
        or (o.status = 'completed' and o.completed_at >= now() - interval '5 minutes')
      ))
      or (p_audience = 'cashier' and o.created_at >= now() - interval '72 hours')
    );
$$;

revoke all on function public.production_order_json(uuid) from public, anon, authenticated;
revoke all on function public.create_production_order(uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.record_production_payment(uuid, uuid, uuid, text, text, uuid, text, text, numeric, text, boolean) from public, anon, authenticated;
revoke all on function public.transition_production_order(uuid, uuid, uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_production_order(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_production_orders(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_production_order_tracking(text) from public, anon, authenticated;
grant execute on function public.production_order_json(uuid) to service_role;
grant execute on function public.create_production_order(uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, uuid, integer, jsonb) to service_role;
grant execute on function public.record_production_payment(uuid, uuid, uuid, text, text, uuid, text, text, numeric, text, boolean) to service_role;
grant execute on function public.transition_production_order(uuid, uuid, uuid, text, text, integer, text, text) to service_role;
grant execute on function public.get_production_order(uuid, uuid, uuid) to service_role;
grant execute on function public.list_production_orders(uuid, uuid, text) to service_role;
grant execute on function public.get_production_order_tracking(text) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_item_modifiers;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_payments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_status_events;
exception when duplicate_object then null; end $$;
