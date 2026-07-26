-- Dashboard health and notification cards depend on these branch-scoped changes.
do $$ begin
  alter publication supabase_realtime add table public.device_health;
exception when duplicate_object then null; when undefined_object then
  raise notice 'supabase_realtime publication is unavailable';
end $$;

do $$ begin
  alter publication supabase_realtime add table public.notification_settings;
exception when duplicate_object then null; when undefined_object then
  raise notice 'supabase_realtime publication is unavailable';
end $$;
