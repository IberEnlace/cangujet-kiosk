-- Phase 1: production restaurant, branch, configuration, and device identity.
-- This migration is additive and backfills the existing MORROW branch.

create type public.device_type as enum (
  'kiosk',
  'cashier_terminal',
  'kitchen_display',
  'order_display',
  'admin_terminal'
);
create type public.device_status as enum ('pending', 'active', 'disabled', 'retired');
create type public.menu_status as enum ('draft', 'published', 'archived');

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  logo_url text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.restaurants(name, slug)
values ('MORROW', 'morrow')
on conflict (slug) do nothing;

alter table public.branches
  add column restaurant_id uuid references public.restaurants(id) on delete restrict,
  add column service_modes text[] not null default array['dine_in', 'take_away']::text[]
    check (
      cardinality(service_modes) > 0
      and service_modes <@ array['dine_in', 'take_away']::text[]
    );

update public.branches
set restaurant_id = (select id from public.restaurants where slug = 'morrow')
where restaurant_id is null;

alter table public.branches
  alter column restaurant_id set not null,
  drop constraint if exists branches_code_key;

create unique index branches_restaurant_code_uidx
  on public.branches(restaurant_id, code);
create unique index branches_id_restaurant_uidx
  on public.branches(id, restaurant_id);
create index branches_restaurant_active_idx
  on public.branches(restaurant_id, is_active);

create table public.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete cascade,
  constraint staff_membership_branch_role_check
    check (role = 'admin' or branch_id is not null)
);
create unique index staff_memberships_restaurant_role_uidx
  on public.staff_memberships(user_id, restaurant_id, role)
  where branch_id is null;
create unique index staff_memberships_branch_role_uidx
  on public.staff_memberships(user_id, restaurant_id, branch_id, role)
  where branch_id is not null;
create index staff_memberships_user_active_idx
  on public.staff_memberships(user_id, is_active);
create index staff_memberships_restaurant_role_idx
  on public.staff_memberships(restaurant_id, role, is_active);

insert into public.staff_memberships(user_id, restaurant_id, branch_id, role, is_active)
select
  p.id,
  coalesce(b.restaurant_id, r.id),
  case when p.role = 'admin' then null else p.branch_id end,
  p.role,
  p.is_active
from public.profiles p
left join public.branches b on b.id = p.branch_id
cross join lateral (
  select id from public.restaurants where slug = 'morrow' limit 1
) r
where p.role = 'admin' or b.id is not null
on conflict do nothing;

create table public.languages (
  code text primary key check (code ~ '^[a-z]{2}(?:-[A-Z]{2})?$'),
  name text not null,
  native_name text not null,
  locale text not null,
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  is_active boolean not null default true
);
insert into public.languages(code, name, native_name, locale)
values
  ('en', 'English', 'English', 'en-US'),
  ('tr', 'Turkish', 'Türkçe', 'tr-TR')
on conflict (code) do nothing;

create table public.restaurant_languages (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  language_code text not null references public.languages(code) on delete restrict,
  is_default boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  primary key (restaurant_id, language_code)
);
create unique index restaurant_languages_one_default_uidx
  on public.restaurant_languages(restaurant_id)
  where is_default;

insert into public.restaurant_languages(restaurant_id, language_code, is_default, display_order)
select id, 'en', true, 0 from public.restaurants where slug = 'morrow'
on conflict do nothing;
insert into public.restaurant_languages(restaurant_id, language_code, is_default, display_order)
select id, 'tr', false, 1 from public.restaurants where slug = 'morrow'
on conflict do nothing;

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  tokens jsonb not null default '{}'::jsonb check (jsonb_typeof(tokens) = 'object'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create unique index themes_one_active_per_restaurant_uidx
  on public.themes(restaurant_id)
  where is_active;

insert into public.themes(restaurant_id, name, tokens, is_active)
select id, 'MORROW Default', jsonb_build_object(
  'background', '#080b08',
  'surface', '#111511',
  'primary', '#D7FB69',
  'primaryText', '#17200f',
  'foreground', '#f0f0eb'
), true
from public.restaurants where slug = 'morrow'
on conflict (restaurant_id, name) do nothing;

create table public.branch_opening_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  sequence smallint not null default 0 check (sequence >= 0),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, day_of_week, sequence),
  constraint branch_opening_hours_values_check check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at <> closes_at)
  )
);

create table public.payment_configurations (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  enabled_methods text[] not null default array['card', 'pay_at_cashier', 'qr']::text[]
    check (
      enabled_methods <@ array['card', 'pay_at_cashier', 'qr']::text[]
      and cardinality(enabled_methods) > 0
    ),
  receipt_printing_enabled boolean not null default true,
  provider_public_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_public_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nori_configurations (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  enabled boolean not null default true,
  voice_enabled boolean not null default true,
  voice_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(voice_settings) = 'object'),
  public_options jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_options) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.idle_screen_configurations (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  timeout_seconds integer not null default 300 check (timeout_seconds between 30 and 86400),
  video_interval_ms integer not null default 9000 check (video_interval_ms between 1000 and 3600000),
  minimum_playback_ms integer not null default 4000 check (minimum_playback_ms between 0 and 3600000),
  transition_ms integer not null default 500 check (transition_ms between 0 and 60000),
  title text not null default 'MORROW',
  slogan text not null default 'Fresh. Fast. Delicious.',
  description text not null default 'Start your delicious journey',
  button_label text not null default 'START ORDER',
  touch_label text not null default 'Touch anywhere to begin',
  videos jsonb not null default '[]'::jsonb check (jsonb_typeof(videos) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  status public.menu_status not null default 'draft',
  version bigint not null default 1 check (version > 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create table public.menu_branches (
  menu_id uuid not null references public.menus(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  primary key (menu_id, branch_id)
);
create unique index menu_branches_one_active_uidx
  on public.menu_branches(branch_id)
  where is_active;

insert into public.menus(restaurant_id, name, status, published_at)
select id, 'MORROW Default Menu', 'published', now()
from public.restaurants where slug = 'morrow'
on conflict (restaurant_id, name) do nothing;
insert into public.menu_branches(menu_id, branch_id, is_active)
select m.id, b.id, true
from public.menus m
join public.branches b on b.restaurant_id = m.restaurant_id
where m.name = 'MORROW Default Menu'
on conflict (menu_id, branch_id) do nothing;

insert into public.payment_configurations(branch_id)
select id from public.branches on conflict (branch_id) do nothing;
insert into public.nori_configurations(branch_id)
select id from public.branches on conflict (branch_id) do nothing;
insert into public.idle_screen_configurations(branch_id, videos)
select id, '[
  "/videos/intro-1.mp4",
  "/videos/intro-2.mp4",
  "/videos/intro-3.mp4",
  "/videos/intro-4.mp4",
  "/videos/intro-5.mp4",
  "/videos/intro-6.mp4"
]'::jsonb
from public.branches on conflict (branch_id) do nothing;

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  branch_id uuid not null,
  device_type public.device_type not null,
  name text not null check (length(trim(name)) > 0),
  status public.device_status not null default 'pending',
  config_version bigint not null default 1 check (config_version > 0),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (branch_id, restaurant_id)
    references public.branches(id, restaurant_id) on delete restrict
);
create index devices_branch_type_status_idx
  on public.devices(branch_id, device_type, status);
create index devices_restaurant_status_idx
  on public.devices(restaurant_id, status);

create table public.device_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  public_key_id text not null unique check (public_key_id ~ '^[a-f0-9]{24}$'),
  secret_hash text not null,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_credentials_device_active_idx
  on public.device_credentials(device_id, revoked_at, expires_at);

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  credential_id uuid not null references public.device_credentials(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index device_sessions_refresh_token_uidx
  on public.device_sessions(refresh_token_hash)
  where refresh_token_hash is not null;
create index device_sessions_device_active_idx
  on public.device_sessions(device_id, revoked_at, expires_at);

create table public.device_audit_events (
  id bigint generated always as identity primary key,
  device_id uuid references public.devices(id) on delete set null,
  credential_id uuid references public.device_credentials(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);
create index device_audit_events_device_occurred_idx
  on public.device_audit_events(device_id, occurred_at desc);

create function public.is_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_memberships m
    where m.user_id = auth.uid()
      and m.restaurant_id = p_restaurant_id
      and m.is_active
  );
$$;
create function public.is_restaurant_admin(p_restaurant_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_memberships m
    where m.user_id = auth.uid()
      and m.restaurant_id = p_restaurant_id
      and m.role = 'admin'
      and m.is_active
  );
$$;
revoke all on function public.is_restaurant_member(uuid), public.is_restaurant_admin(uuid) from public;
grant execute on function public.is_restaurant_member(uuid), public.is_restaurant_admin(uuid) to authenticated;

create function public.bump_branch_device_config_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_branch_id uuid;
  v_previous_branch_id uuid;
begin
  if tg_table_name = 'branches' then
    if tg_op = 'DELETE' then v_branch_id := old.id;
    elsif tg_op = 'INSERT' then v_branch_id := new.id;
    else v_branch_id := new.id; v_previous_branch_id := old.id;
    end if;
  else
    if tg_op = 'DELETE' then v_branch_id := old.branch_id;
    elsif tg_op = 'INSERT' then v_branch_id := new.branch_id;
    else v_branch_id := new.branch_id; v_previous_branch_id := old.branch_id;
    end if;
  end if;
  update public.devices
  set config_version = config_version + 1
  where branch_id = v_branch_id
     or (v_previous_branch_id is distinct from v_branch_id and branch_id = v_previous_branch_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.bump_restaurant_device_config_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_previous_restaurant_id uuid;
begin
  if tg_table_name = 'restaurants' then
    if tg_op = 'DELETE' then v_restaurant_id := old.id;
    elsif tg_op = 'INSERT' then v_restaurant_id := new.id;
    else v_restaurant_id := new.id; v_previous_restaurant_id := old.id;
    end if;
  else
    if tg_op = 'DELETE' then v_restaurant_id := old.restaurant_id;
    elsif tg_op = 'INSERT' then v_restaurant_id := new.restaurant_id;
    else v_restaurant_id := new.restaurant_id; v_previous_restaurant_id := old.restaurant_id;
    end if;
  end if;
  update public.devices
  set config_version = config_version + 1
  where restaurant_id = v_restaurant_id
     or (v_previous_restaurant_id is distinct from v_restaurant_id and restaurant_id = v_previous_restaurant_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.bump_menu_device_config_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_menu_id uuid;
begin
  v_menu_id := case when tg_op = 'DELETE' then old.id else new.id end;
  update public.devices d
  set config_version = d.config_version + 1
  from public.menu_branches mb
  where mb.menu_id = v_menu_id and mb.branch_id = d.branch_id and mb.is_active;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.bump_language_device_config_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_language_code text;
begin
  v_language_code := case when tg_op = 'DELETE' then old.code else new.code end;
  update public.devices d
  set config_version = d.config_version + 1
  from public.restaurant_languages rl
  where rl.language_code = v_language_code
    and rl.restaurant_id = d.restaurant_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create function public.bump_device_own_config_version()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (
    new.restaurant_id,
    new.branch_id,
    new.device_type,
    new.name,
    new.status
  ) is distinct from (
    old.restaurant_id,
    old.branch_id,
    old.device_type,
    old.name,
    old.status
  ) and new.config_version = old.config_version then
    new.config_version := old.config_version + 1;
  end if;
  return new;
end;
$$;

create trigger restaurants_updated_at
before update on public.restaurants for each row execute function public.set_updated_at();
create trigger staff_memberships_updated_at
before update on public.staff_memberships for each row execute function public.set_updated_at();
create trigger themes_updated_at
before update on public.themes for each row execute function public.set_updated_at();
create trigger branch_opening_hours_updated_at
before update on public.branch_opening_hours for each row execute function public.set_updated_at();
create trigger payment_configurations_updated_at
before update on public.payment_configurations for each row execute function public.set_updated_at();
create trigger nori_configurations_updated_at
before update on public.nori_configurations for each row execute function public.set_updated_at();
create trigger idle_screen_configurations_updated_at
before update on public.idle_screen_configurations for each row execute function public.set_updated_at();
create trigger menus_updated_at
before update on public.menus for each row execute function public.set_updated_at();
create trigger devices_updated_at
before update on public.devices for each row execute function public.set_updated_at();
create trigger device_credentials_updated_at
before update on public.device_credentials for each row execute function public.set_updated_at();

create trigger devices_own_config_version
before update on public.devices for each row execute function public.bump_device_own_config_version();
create trigger branches_device_config_version
after update on public.branches for each row execute function public.bump_branch_device_config_version();
create trigger opening_hours_device_config_version
after insert or update or delete on public.branch_opening_hours
for each row execute function public.bump_branch_device_config_version();
create trigger payment_device_config_version
after insert or update or delete on public.payment_configurations
for each row execute function public.bump_branch_device_config_version();
create trigger nori_device_config_version
after insert or update or delete on public.nori_configurations
for each row execute function public.bump_branch_device_config_version();
create trigger idle_device_config_version
after insert or update or delete on public.idle_screen_configurations
for each row execute function public.bump_branch_device_config_version();
create trigger restaurant_device_config_version
after update on public.restaurants for each row execute function public.bump_restaurant_device_config_version();
create trigger theme_device_config_version
after insert or update or delete on public.themes
for each row execute function public.bump_restaurant_device_config_version();
create trigger language_device_config_version
after insert or update or delete on public.restaurant_languages
for each row execute function public.bump_restaurant_device_config_version();
create trigger language_definition_device_config_version
after update on public.languages
for each row execute function public.bump_language_device_config_version();
create trigger menu_device_config_version
after update on public.menus for each row execute function public.bump_menu_device_config_version();
create trigger menu_branch_device_config_version
after insert or update or delete on public.menu_branches
for each row execute function public.bump_branch_device_config_version();

alter table public.restaurants enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.languages enable row level security;
alter table public.restaurant_languages enable row level security;
alter table public.themes enable row level security;
alter table public.branch_opening_hours enable row level security;
alter table public.payment_configurations enable row level security;
alter table public.nori_configurations enable row level security;
alter table public.idle_screen_configurations enable row level security;
alter table public.menus enable row level security;
alter table public.menu_branches enable row level security;
alter table public.devices enable row level security;
alter table public.device_credentials enable row level security;
alter table public.device_sessions enable row level security;
alter table public.device_audit_events enable row level security;

create policy "members read restaurants" on public.restaurants
for select to authenticated using (public.is_restaurant_member(id));
create policy "admins update restaurants" on public.restaurants
for update to authenticated using (public.is_restaurant_admin(id))
with check (public.is_restaurant_admin(id));
create policy "users read own memberships" on public.staff_memberships
for select to authenticated using (
  user_id = auth.uid() or public.is_restaurant_admin(restaurant_id)
);
create policy "admins manage memberships" on public.staff_memberships
for all to authenticated using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));
create policy "authenticated read languages" on public.languages
for select to authenticated using (is_active);
create policy "members read restaurant languages" on public.restaurant_languages
for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "admins manage restaurant languages" on public.restaurant_languages
for all to authenticated using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));
create policy "members read themes" on public.themes
for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "admins manage themes" on public.themes
for all to authenticated using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create policy "branch staff read opening hours" on public.branch_opening_hours
for select to authenticated using (
  branch_id = public.current_user_branch_id()
  or exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);
create policy "admins manage opening hours" on public.branch_opening_hours
for all to authenticated using (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);

create policy "branch staff read payment config" on public.payment_configurations
for select to authenticated using (
  branch_id = public.current_user_branch_id()
  or exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);
create policy "admins manage payment config" on public.payment_configurations
for all to authenticated using (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);

create policy "branch staff read nori config" on public.nori_configurations
for select to authenticated using (
  branch_id = public.current_user_branch_id()
  or exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);
create policy "admins manage nori config" on public.nori_configurations
for all to authenticated using (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);

create policy "branch staff read idle config" on public.idle_screen_configurations
for select to authenticated using (
  branch_id = public.current_user_branch_id()
  or exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);
create policy "admins manage idle config" on public.idle_screen_configurations
for all to authenticated using (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);

create policy "members read menus" on public.menus
for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "admins manage menus" on public.menus
for all to authenticated using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));
create policy "branch staff read menu assignments" on public.menu_branches
for select to authenticated using (
  branch_id = public.current_user_branch_id()
  or exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);
create policy "admins manage menu assignments" on public.menu_branches
for all to authenticated using (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
) with check (
  exists (
    select 1 from public.branches b
    where b.id = branch_id and public.is_restaurant_admin(b.restaurant_id)
  )
);

create policy "members read devices" on public.devices
for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy "admins manage devices" on public.devices
for all to authenticated using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

drop policy if exists "admins manage branches" on public.branches;
create policy "restaurant admins manage branches" on public.branches
for all to authenticated using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

drop policy if exists "admins read profiles" on public.profiles;
create policy "restaurant admins read profiles" on public.profiles
for select to authenticated using (
  exists (
    select 1 from public.staff_memberships target
    where target.user_id = profiles.id
      and public.is_restaurant_admin(target.restaurant_id)
  )
);

revoke all on public.device_credentials, public.device_sessions, public.device_audit_events
from anon, authenticated;
revoke all on public.restaurants, public.staff_memberships, public.languages,
  public.restaurant_languages, public.themes, public.branch_opening_hours,
  public.payment_configurations, public.nori_configurations,
  public.idle_screen_configurations, public.menus, public.menu_branches,
  public.devices
from anon;
grant select, insert, update, delete on public.restaurants, public.staff_memberships,
  public.restaurant_languages, public.themes, public.branch_opening_hours,
  public.payment_configurations, public.nori_configurations,
  public.idle_screen_configurations, public.menus, public.menu_branches,
  public.devices
to authenticated;
grant select on public.languages to authenticated;
