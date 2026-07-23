create function public.current_user_role() returns public.staff_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() and is_active limit 1 $$;

create function public.current_user_branch_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select branch_id from public.profiles where id = auth.uid() and is_active limit 1 $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_user_role() = 'admin', false) $$;

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_branch_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_user_role(), public.current_user_branch_id(), public.is_admin() to authenticated;

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_customization_groups enable row level security;
alter table public.product_customization_options enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.nori_conversations enable row level security;
alter table public.nori_messages enable row level security;

create policy "staff read own branch" on public.branches for select to authenticated
using (id = public.current_user_branch_id() or public.is_admin());
create policy "admins manage branches" on public.branches for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "staff read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "admins read profiles" on public.profiles for select to authenticated using (public.is_admin());
-- Profile creation and role changes intentionally require a trusted server/admin workflow.

create policy "public read active categories" on public.categories for select to anon, authenticated using (is_active);
create policy "admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public read available products" on public.products for select to anon, authenticated using (is_active and is_available);
create policy "admins manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "public read active customization groups" on public.product_customization_groups for select to anon, authenticated
using (exists (select 1 from public.products p where p.id = product_id and p.is_active and p.is_available));
create policy "admins manage customization groups" on public.product_customization_groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public read available customization options" on public.product_customization_options for select to anon, authenticated
using (is_available and exists (
  select 1 from public.product_customization_groups g join public.products p on p.id = g.product_id
  where g.id = group_id and p.is_active and p.is_available
));
create policy "admins manage customization options" on public.product_customization_options for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "branch staff read orders" on public.orders for select to authenticated
using (public.is_admin() or branch_id = public.current_user_branch_id());
create policy "cashiers insert branch orders" on public.orders for insert to authenticated
with check (public.current_user_role() = 'cashier' and branch_id = public.current_user_branch_id() and created_by = auth.uid() and source = 'cashier');
create policy "admins update orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Kitchen/cashier operational updates will be exposed through narrow RPCs in the orders phase.

create policy "branch staff read order items" on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (public.is_admin() or o.branch_id = public.current_user_branch_id())));
create policy "cashiers insert branch order items" on public.order_items for insert to authenticated
with check (public.current_user_role() = 'cashier' and exists (
  select 1 from public.orders o where o.id = order_id and o.branch_id = public.current_user_branch_id() and o.created_by = auth.uid()
));

create policy "staff read branch nori conversations" on public.nori_conversations for select to authenticated
using (public.is_admin() or branch_id = public.current_user_branch_id());
create policy "staff read branch nori messages" on public.nori_messages for select to authenticated
using (exists (select 1 from public.nori_conversations c where c.id = conversation_id and (public.is_admin() or c.branch_id = public.current_user_branch_id())));
-- Kiosk Nori writes will use a server/Edge Function in the persistence phase.

create function public.public_order_status()
returns table(order_number text, status public.order_status)
language sql stable security definer set search_path = ''
as $$
  select o.order_number, o.status
  from public.orders o
  where o.status in ('preparing', 'ready')
    and o.created_at > now() - interval '24 hours'
  order by o.created_at;
$$;
revoke all on function public.public_order_status() from public;
grant execute on function public.public_order_status() to anon, authenticated;

revoke all on all tables in schema public from anon;
grant select on public.categories, public.products, public.product_customization_groups, public.product_customization_options to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.profiles from authenticated;
revoke all on public.orders, public.order_items, public.nori_conversations, public.nori_messages from anon;
