-- Data-only branding migration. Compatibility-sensitive slugs, identifiers,
-- schema, and API contracts intentionally remain unchanged.

update public.restaurants
set name = 'cangujet'
where slug = 'morrow'
  and name = 'MORROW';

update public.branches
set name = 'cangujet Main Branch'
where name = 'MORROW Main Branch';

update public.themes t
set name = 'cangujet Default'
where t.name = 'MORROW Default'
  and exists (
    select 1
    from public.restaurants r
    where r.id = t.restaurant_id
      and r.slug = 'morrow'
  );

update public.idle_screen_configurations i
set title = 'cangujet'
where i.title = 'MORROW'
  and exists (
    select 1
    from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
    where b.id = i.branch_id
      and r.slug = 'morrow'
  );

update public.menus m
set name = 'cangujet Default Menu'
where m.name = 'MORROW Default Menu'
  and exists (
    select 1
    from public.restaurants r
    where r.id = m.restaurant_id
      and r.slug = 'morrow'
  );
