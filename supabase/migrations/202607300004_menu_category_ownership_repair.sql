-- Repair schema drift where Phase 2 was recorded without its category ownership
-- columns. Categories belong directly to a menu; menus are assigned to branches
-- through menu_branches.

alter table public.categories
  add column if not exists menu_id uuid,
  add column if not exists localized_names jsonb not null default '{}'::jsonb
    check (jsonb_typeof(localized_names) = 'object'),
  add column if not exists is_visible boolean not null default true;

-- Every category predating restaurant tenancy belongs to the single MORROW
-- menu created and assigned by 202607300001. Existing non-null ownership is
-- never changed.
do $$
declare
  v_legacy_menu_id uuid;
begin
  select m.id into v_legacy_menu_id
  from public.menus m
  join public.restaurants r on r.id = m.restaurant_id
  where r.slug = 'morrow'
    and m.name = 'MORROW Default Menu'
  order by (m.status = 'published') desc, m.created_at, m.id
  limit 1;

  if exists (select 1 from public.categories where menu_id is null) then
    if v_legacy_menu_id is null then
      raise exception 'The legacy MORROW menu required to preserve existing categories is missing.';
    end if;
    update public.categories
    set menu_id = v_legacy_menu_id
    where menu_id is null;
  end if;
end;
$$;

alter table public.categories
  alter column menu_id set not null,
  drop constraint if exists categories_menu_id_fkey,
  drop constraint if exists categories_slug_key;
alter table public.categories
  add constraint categories_menu_id_fkey
  foreign key (menu_id) references public.menus(id) on delete cascade not valid;
alter table public.categories validate constraint categories_menu_id_fkey;

create unique index if not exists categories_menu_slug_uidx
  on public.categories(menu_id, slug);
create index if not exists categories_menu_visibility_idx
  on public.categories(menu_id, is_active, is_visible, display_order);

-- Restore tenant-owned category/menu policies even when the original Phase 2
-- policy statements did not reach this database.
drop policy if exists "public read active categories" on public.categories;
drop policy if exists "public read available products" on public.products;
drop policy if exists "public read active customization groups" on public.product_customization_groups;
drop policy if exists "public read available customization options" on public.product_customization_options;
drop policy if exists "admins manage categories" on public.categories;
drop policy if exists "admins manage products" on public.products;
drop policy if exists "admins manage customization groups" on public.product_customization_groups;
drop policy if exists "admins manage customization options" on public.product_customization_options;
drop policy if exists "restaurant admins manage categories" on public.categories;
drop policy if exists "restaurant admins manage products" on public.products;
drop policy if exists "restaurant admins manage customization groups" on public.product_customization_groups;
drop policy if exists "restaurant admins manage customization options" on public.product_customization_options;

create policy "restaurant admins manage categories" on public.categories
for all to authenticated using (
  exists (
    select 1 from public.menus m
    where m.id = public.categories.menu_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.menus m
    where m.id = public.categories.menu_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
);

create policy "restaurant admins manage products" on public.products
for all to authenticated using (
  exists (
    select 1 from public.categories c
    join public.menus m on m.id = c.menu_id
    where c.id = public.products.category_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.categories c
    join public.menus m on m.id = c.menu_id
    where c.id = public.products.category_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
);

create policy "restaurant admins manage customization groups"
on public.product_customization_groups
for all to authenticated using (
  exists (
    select 1 from public.products p
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where p.id = public.product_customization_groups.product_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.products p
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where p.id = public.product_customization_groups.product_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
);

create policy "restaurant admins manage customization options"
on public.product_customization_options
for all to authenticated using (
  exists (
    select 1 from public.product_customization_groups g
    join public.products p on p.id = g.product_id
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where g.id = public.product_customization_options.group_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.product_customization_groups g
    join public.products p on p.id = g.product_id
    join public.categories c on c.id = p.category_id
    join public.menus m on m.id = c.menu_id
    where g.id = public.product_customization_options.group_id
      and public.is_restaurant_admin(m.restaurant_id)
  )
);

-- Reinstall version propagation so category/product/modifier edits invalidate
-- authenticated device configuration caches.
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

drop trigger if exists categories_owned_menu_version on public.categories;
drop trigger if exists products_owned_menu_version on public.products;
drop trigger if exists customization_groups_owned_menu_version on public.product_customization_groups;
drop trigger if exists customization_options_owned_menu_version on public.product_customization_options;
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
