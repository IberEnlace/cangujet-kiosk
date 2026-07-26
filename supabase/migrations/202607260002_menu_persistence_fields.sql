alter table public.categories
  add column if not exists icon text not null default '';

alter table public.products
  add column if not exists display_order integer not null default 0
  check (display_order >= 0);

create index if not exists products_category_display_order_idx
  on public.products(category_id, display_order, name);

do $$ begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; when undefined_object then
  raise notice 'supabase_realtime publication is unavailable';
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads menu images" on storage.objects for select
using (bucket_id = 'menu-images');
create policy "admins upload menu images" on storage.objects for insert to authenticated
with check (bucket_id = 'menu-images' and public.is_admin());
create policy "admins update menu images" on storage.objects for update to authenticated
using (bucket_id = 'menu-images' and public.is_admin()) with check (bucket_id = 'menu-images' and public.is_admin());
create policy "admins delete menu images" on storage.objects for delete to authenticated
using (bucket_id = 'menu-images' and public.is_admin());

do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null; when undefined_object then
  raise notice 'supabase_realtime publication is unavailable';
end $$;
