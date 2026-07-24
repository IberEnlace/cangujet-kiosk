alter table public.orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;
alter table public.branches add column if not exists allow_unpaid_kitchen_orders boolean not null default true;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status public.order_status not null,
  new_status public.order_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  reason text
);
create index if not exists orders_branch_payment_created_idx on public.orders(branch_id, payment_status, created_at desc);
create index if not exists order_status_history_order_changed_idx on public.order_status_history(order_id, changed_at desc);
alter table public.order_status_history enable row level security;
create policy "branch staff read order history" on public.order_status_history for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (public.is_admin() or o.branch_id = public.current_user_branch_id())));

create function public.transition_order_status(p_order_id uuid, p_next_status public.order_status, p_reason text default null)
returns table(order_id uuid, previous_status public.order_status, new_status public.order_status, changed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_order public.orders%rowtype; v_role public.staff_role; v_changed timestamptz := now(); v_allow_unpaid boolean;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  v_role := public.current_user_role();
 select o.*
into v_order
from public.orders o
where o.id = p_order_id
for update;
select b.allow_unpaid_kitchen_orders
into v_allow_unpaid
from public.branches b
where b.id = v_order.branch_id;
  if not found then raise exception using errcode = 'P0002', message = 'order_not_found'; end if;
  if not public.is_admin() and v_order.branch_id <> public.current_user_branch_id() then raise exception using errcode = '42501', message = 'branch_not_authorized'; end if;
  if not ((v_order.status = 'pending' and p_next_status in ('confirmed','cancelled'))
    or (v_order.status = 'confirmed' and p_next_status in ('preparing','cancelled'))
    or (v_order.status = 'preparing' and p_next_status in ('ready','cancelled'))
    or (v_order.status = 'ready' and p_next_status = 'completed')) then
    raise exception using errcode = '22023', message = 'illegal_status_transition';
  end if;
  if v_role = 'kitchen' and not (
    (v_order.status = 'pending' and p_next_status = 'confirmed' and v_allow_unpaid)
    or (v_order.status = 'confirmed' and p_next_status = 'preparing')
    or (v_order.status = 'preparing' and p_next_status = 'ready')
  ) then
    raise exception using errcode = '42501', message = 'role_transition_not_allowed';
  end if;
  if v_role = 'cashier' and not ((v_order.status = 'pending' and p_next_status in ('confirmed','cancelled')) or (v_order.status = 'ready' and p_next_status = 'completed')) then
    raise exception using errcode = '42501', message = 'role_transition_not_allowed';
  end if;
  if v_role not in ('admin','cashier','kitchen') then raise exception using errcode = '42501', message = 'role_not_authorized'; end if;
  if p_next_status in ('confirmed','preparing') and v_order.payment_status <> 'paid' and not v_allow_unpaid then
    raise exception using errcode = '22023', message = 'payment_not_eligible';
  end if;
  update public.orders set status = p_next_status,
    confirmed_at = case when p_next_status = 'confirmed' then v_changed else confirmed_at end,
    preparing_at = case when p_next_status = 'preparing' then v_changed else preparing_at end,
    ready_at = case when p_next_status = 'ready' then v_changed else ready_at end,
    completed_at = case when p_next_status = 'completed' then v_changed else completed_at end,
    cancelled_at = case when p_next_status = 'cancelled' then v_changed else cancelled_at end
  where id = p_order_id;
  insert into public.order_status_history(order_id, previous_status, new_status, changed_by, changed_at, reason)
  values (p_order_id, v_order.status, p_next_status, auth.uid(), v_changed, nullif(trim(p_reason), ''));
  return query select p_order_id, v_order.status, p_next_status, v_changed;
end;
$$;
revoke all on function public.transition_order_status(uuid, public.order_status, text) from public;
grant execute on function public.transition_order_status(uuid, public.order_status, text) to authenticated;

create function public.get_public_order_board(p_branch_code text)
returns table(order_number text, public_status text, created_at timestamptz, ready_at timestamptz)
language sql stable security definer set search_path = ''
as $$
 select o.order_number,
   case when o.status in ('confirmed','preparing') then 'preparing' else o.status::text end,
   o.created_at, o.ready_at
 from public.orders o join public.branches b on b.id = o.branch_id
 where b.code = upper(trim(p_branch_code)) and b.is_active
   and (o.status in ('confirmed','preparing','ready')
     or (o.status = 'completed' and o.completed_at > now() - interval '5 minutes'))
   and o.created_at > now() - interval '24 hours'
 order by o.created_at;
$$;
revoke all on function public.get_public_order_board(text) from public;
grant execute on function public.get_public_order_board(text) to anon, authenticated;

create function public.get_order_tracking(p_order_id uuid, p_tracking_token text)
returns table(order_number text, status public.order_status, created_at timestamptz, confirmed_at timestamptz, preparing_at timestamptz, ready_at timestamptz, completed_at timestamptz, total numeric, currency character)
language sql stable security definer set search_path = ''
as $$
 select o.order_number, o.status, o.created_at, o.confirmed_at, o.preparing_at, o.ready_at, o.completed_at, o.total, o.currency
 from public.orders o where o.id = p_order_id and o.idempotency_key::text = p_tracking_token limit 1;
$$;
revoke all on function public.get_order_tracking(uuid, text) from public;
grant execute on function public.get_order_tracking(uuid, text) to anon, authenticated;

-- Contains no order or branch data. Public clients receive only a refetch hint.
create table if not exists public.public_order_refresh_signal (
  singleton boolean primary key default true check (singleton),
  changed_at timestamptz not null default now()
);
insert into public.public_order_refresh_signal(singleton) values (true) on conflict (singleton) do nothing;
alter table public.public_order_refresh_signal enable row level security;
create policy "public reads refresh signal" on public.public_order_refresh_signal for select to anon, authenticated using (true);
grant select on public.public_order_refresh_signal to anon, authenticated;

create function public.signal_public_order_refresh() returns trigger language plpgsql security definer set search_path = ''
as $$ begin update public.public_order_refresh_signal set changed_at = now() where singleton; return new; end; $$;
create trigger orders_public_refresh after insert or update of status on public.orders for each statement execute function public.signal_public_order_refresh();

do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; when undefined_object then raise notice 'supabase_realtime publication is unavailable';
end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_items;
exception when duplicate_object then null; when undefined_object then raise notice 'supabase_realtime publication is unavailable';
end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_status_history;
exception when duplicate_object then null; when undefined_object then raise notice 'supabase_realtime publication is unavailable';
end $$;
do $$ begin
  alter publication supabase_realtime add table public.public_order_refresh_signal;
exception when duplicate_object then null; when undefined_object then raise notice 'supabase_realtime publication is unavailable';
end $$;
