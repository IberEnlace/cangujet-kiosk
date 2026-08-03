-- Keep the customer order-status board on the production lifecycle while
-- exposing only the three statuses the board is designed to render.
create or replace function public.list_production_orders(
  p_restaurant_id uuid, p_branch_id uuid, p_audience text
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.production_order_json(o.id) order by coalesce(o.placed_at, o.created_at), o.id), '[]'::jsonb)
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and (p_branch_id is null or o.branch_id = p_branch_id)
    and (
      (p_audience = 'kitchen' and (
        o.status in ('submitted', 'accepted', 'preparing', 'ready')
        or (o.status = 'completed' and o.completed_at >= now() - interval '24 hours')
      ))
      or (p_audience = 'display' and (
        o.status in ('preparing', 'ready')
        or (o.status = 'completed' and o.completed_at >= now() - interval '5 minutes')
      ))
      or (p_audience = 'cashier' and o.created_at >= now() - interval '72 hours')
    );
$$;

revoke all on function public.list_production_orders(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.list_production_orders(uuid, uuid, text) to service_role;

-- Realtime clients use the public Supabase client, not the opaque application
-- device token. Publish a data-free, branch-scoped refetch hint instead of
-- granting public reads on orders.
create table if not exists public.order_display_refresh_signals (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  changed_at timestamptz not null default now()
);

alter table public.order_display_refresh_signals enable row level security;
drop policy if exists "public reads order display refresh signals" on public.order_display_refresh_signals;
create policy "public reads order display refresh signals"
  on public.order_display_refresh_signals for select to anon, authenticated using (true);
grant select on public.order_display_refresh_signals to anon, authenticated;

create or replace function public.signal_order_display_refresh()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_display_refresh_signals(branch_id, changed_at)
  values (new.branch_id, now())
  on conflict (branch_id) do update set changed_at = excluded.changed_at;
  return new;
end;
$$;

drop trigger if exists orders_order_display_refresh on public.orders;
create trigger orders_order_display_refresh
after insert or update of status on public.orders
for each row execute function public.signal_order_display_refresh();

insert into public.order_display_refresh_signals(branch_id, changed_at)
select id, now() from public.branches
on conflict (branch_id) do nothing;

do $$ begin
  alter publication supabase_realtime add table public.order_display_refresh_signals;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'supabase_realtime publication is unavailable';
end $$;
