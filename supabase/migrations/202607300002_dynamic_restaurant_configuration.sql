-- Phase 2: tenant-owned menu configuration and dynamic branch contact data.

alter table public.branches
  add column if not exists phone text;

alter table public.categories
  add column if not exists menu_id uuid references public.menus(id) on delete cascade,
  add column if not exists localized_names jsonb not null default '{}'::jsonb
    check (jsonb_typeof(localized_names) = 'object'),
  add column if not exists is_visible boolean not null default true;

update public.categories c
set menu_id = m.id
from public.menus m
where c.menu_id is null
  and m.status = 'published'
  and m.name = 'cangujet Default Menu';

alter table public.categories
  alter column menu_id set not null,
  drop constraint if exists categories_slug_key;

create unique index if not exists categories_menu_slug_uidx
  on public.categories(menu_id, slug);
create index if not exists categories_menu_visibility_idx
  on public.categories(menu_id, is_active, is_visible, display_order);

-- Kiosks now read menus only through the authenticated device endpoint. Remove the
-- legacy cross-tenant anon policies and scope staff mutation to restaurant ownership.
drop policy if exists "public read active categories" on public.categories;
drop policy if exists "public read available products" on public.products;
drop policy if exists "public read active customization groups" on public.product_customization_groups;
drop policy if exists "public read available customization options" on public.product_customization_options;
drop policy if exists "admins manage categories" on public.categories;
drop policy if exists "admins manage products" on public.products;
drop policy if exists "admins manage customization groups" on public.product_customization_groups;
drop policy if exists "admins manage customization options" on public.product_customization_options;

create policy "restaurant admins manage categories" on public.categories
for all to authenticated using (
  exists (
    select 1 from public.menus m
    where m.id = public.categories.menu_id and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.menus m
    where m.id = public.categories.menu_id and public.is_restaurant_admin(m.restaurant_id)
  )
);
create policy "restaurant admins manage products" on public.products
for all to authenticated using (
  exists (
    select 1 from public.categories c
    join public.menus m on m.id = c.menu_id
    where c.id = public.products.category_id and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.categories c
    join public.menus m on m.id = c.menu_id
    where c.id = public.products.category_id and public.is_restaurant_admin(m.restaurant_id)
  )
);
create policy "restaurant admins manage customization groups" on public.product_customization_groups
for all to authenticated using (
  exists (
    select 1 from public.products p
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where p.id = public.product_customization_groups.product_id and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.products p
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where p.id = public.product_customization_groups.product_id and public.is_restaurant_admin(m.restaurant_id)
  )
);
create policy "restaurant admins manage customization options" on public.product_customization_options
for all to authenticated using (
  exists (
    select 1 from public.product_customization_groups g
    join public.products p on p.id = g.product_id
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where g.id = public.product_customization_options.group_id and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.product_customization_groups g
    join public.products p on p.id = g.product_id
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where g.id = public.product_customization_options.group_id and public.is_restaurant_admin(m.restaurant_id)
  )
);

create or replace function public.bump_owned_menu_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_menu_ids uuid[];
begin
  if tg_table_name = 'categories' then
    if tg_op = 'INSERT' then
      v_menu_ids := array[new.menu_id];
    elsif tg_op = 'DELETE' then
      v_menu_ids := array[old.menu_id];
    else
      v_menu_ids := array_remove(array[old.menu_id, new.menu_id], null);
    end if;
  elsif tg_table_name = 'products' then
    select array_agg(distinct c.menu_id) into v_menu_ids
    from public.categories c
    where c.id = any(case
      when tg_op = 'INSERT' then array[new.category_id]
      when tg_op = 'DELETE' then array[old.category_id]
      else array[old.category_id, new.category_id]
    end);
  elsif tg_table_name = 'product_customization_groups' then
    select array_agg(distinct c.menu_id) into v_menu_ids
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = any(case
      when tg_op = 'INSERT' then array[new.product_id]
      when tg_op = 'DELETE' then array[old.product_id]
      else array[old.product_id, new.product_id]
    end);
  else
    select array_agg(distinct c.menu_id) into v_menu_ids
    from public.product_customization_groups g
    join public.products p on p.id = g.product_id
    join public.categories c on c.id = p.category_id
    where g.id = any(case
      when tg_op = 'INSERT' then array[new.group_id]
      when tg_op = 'DELETE' then array[old.group_id]
      else array[old.group_id, new.group_id]
    end);
  end if;

  update public.menus
  set version = version + 1
  where id = any(coalesce(v_menu_ids, '{}'::uuid[]));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger categories_owned_menu_version
before insert or update or delete on public.categories
for each row execute function public.bump_owned_menu_version();
create trigger products_owned_menu_version
before insert or update or delete on public.products
for each row execute function public.bump_owned_menu_version();
create trigger customization_groups_owned_menu_version
before insert or update or delete on public.product_customization_groups
for each row execute function public.bump_owned_menu_version();
create trigger customization_options_owned_menu_version
before insert or update or delete on public.product_customization_options
for each row execute function public.bump_owned_menu_version();
