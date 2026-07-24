create or replace function public.transition_order_status(
  p_order_id uuid,
  p_next_status public.order_status,
  p_reason text default null
)
returns table(
  order_id uuid,
  previous_status public.order_status,
  new_status public.order_status,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_role public.staff_role;
  v_changed timestamptz := now();
  v_allow_unpaid boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  v_role := public.current_user_role();

  select o.*
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'order_not_found';
  end if;

  select b.allow_unpaid_kitchen_orders
  into v_allow_unpaid
  from public.branches b
  where b.id = v_order.branch_id;

  if not public.is_admin() and v_order.branch_id <> public.current_user_branch_id() then
    raise exception using errcode = '42501', message = 'branch_not_authorized';
  end if;

  if not (
    (v_order.status = 'pending' and p_next_status in ('confirmed', 'cancelled'))
    or (v_order.status = 'confirmed' and p_next_status in ('preparing', 'cancelled'))
    or (v_order.status = 'preparing' and p_next_status in ('ready', 'cancelled'))
    or (v_order.status = 'ready' and p_next_status = 'completed')
  ) then
    raise exception using errcode = '22023', message = 'illegal_status_transition';
  end if;

  if v_role = 'kitchen' and not (
    (v_order.status = 'pending' and p_next_status = 'confirmed'
      and (v_order.payment_status = 'paid' or v_allow_unpaid))
    or (v_order.status = 'confirmed' and p_next_status = 'preparing')
    or (v_order.status = 'preparing' and p_next_status = 'ready')
    or (v_order.status = 'ready' and p_next_status = 'completed')
  ) then
    raise exception using errcode = '42501', message = 'role_transition_not_allowed';
  end if;

  if v_role = 'cashier' and not (
    (v_order.status = 'pending' and p_next_status in ('confirmed', 'cancelled'))
    or (v_order.status = 'ready' and p_next_status = 'completed')
  ) then
    raise exception using errcode = '42501', message = 'role_transition_not_allowed';
  end if;

  if v_role not in ('admin', 'cashier', 'kitchen') then
    raise exception using errcode = '42501', message = 'role_not_authorized';
  end if;

  if p_next_status in ('confirmed', 'preparing')
    and v_order.payment_status <> 'paid'
    and not v_allow_unpaid then
    raise exception using errcode = '22023', message = 'payment_not_eligible';
  end if;

  update public.orders
  set status = p_next_status,
      confirmed_at = case when p_next_status = 'confirmed' then v_changed else confirmed_at end,
      preparing_at = case when p_next_status = 'preparing' then v_changed else preparing_at end,
      ready_at = case when p_next_status = 'ready' then v_changed else ready_at end,
      completed_at = case when p_next_status = 'completed' then v_changed else completed_at end,
      cancelled_at = case when p_next_status = 'cancelled' then v_changed else cancelled_at end
  where id = p_order_id;

  insert into public.order_status_history(
    order_id, previous_status, new_status, changed_by, changed_at, reason
  )
  values (
    p_order_id, v_order.status, p_next_status, auth.uid(), v_changed, nullif(trim(p_reason), '')
  );

  return query select p_order_id, v_order.status, p_next_status, v_changed;
end;
$$;

revoke all on function public.transition_order_status(uuid, public.order_status, text) from public;
grant execute on function public.transition_order_status(uuid, public.order_status, text) to authenticated;
