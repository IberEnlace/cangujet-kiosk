-- cangujet Supabase foundation. Apply with `supabase db push`.
create extension if not exists pgcrypto;

create type public.staff_role as enum ('admin', 'cashier', 'kitchen');
create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
create type public.order_source as enum ('kiosk', 'cashier', 'nori');
create type public.nori_message_role as enum ('user', 'assistant', 'system', 'tool');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]+$'),
  address text,
  currency char(3) not null default 'EUR' check (currency = upper(currency)),
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.staff_role not null,
  branch_id uuid references public.branches(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint non_admin_requires_branch check (role = 'admin' or branch_id is not null)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  image_url text,
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id text primary key check (length(trim(id)) > 0),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  price numeric(12,2) not null check (price >= 0),
  currency char(3) not null default 'EUR' check (currency = upper(currency)),
  image_url text,
  calories numeric(10,2) check (calories >= 0),
  protein numeric(10,2) check (protein >= 0),
  carbohydrates numeric(10,2) check (carbohydrates >= 0),
  fat numeric(10,2) check (fat >= 0),
  fiber numeric(10,2) check (fiber >= 0),
  sugars numeric(10,2) check (sugars >= 0),
  sodium numeric(10,2) check (sodium >= 0),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  allergens text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  recommendation_score numeric(8,4) not null default 0,
  is_available boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_customization_groups (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  name text not null,
  minimum_selections integer not null default 0 check (minimum_selections >= 0),
  maximum_selections integer not null default 1 check (maximum_selections >= minimum_selections),
  required boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0)
);

create table public.product_customization_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_customization_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,
  is_available boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0)
);

create sequence public.order_number_sequence;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  order_number text not null,
  order_type text not null check (order_type in ('dine_in', 'takeaway')),
  status public.order_status not null default 'pending',
  payment_status public.payment_status not null default 'unpaid',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  tax numeric(12,2) not null check (tax >= 0),
  total numeric(12,2) not null check (total >= 0 and total = subtotal + tax),
  currency char(3) not null check (currency = upper(currency)),
  customer_note text,
  source public.order_source not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, order_number)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  product_name_snapshot text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0 and line_total = unit_price * quantity),
  customizations jsonb not null default '[]'::jsonb check (jsonb_typeof(customizations) = 'array'),
  notes text,
  created_at timestamptz not null default now()
);

create table public.nori_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  active_allergens text[] not null default '{}',
  dietary_preferences text[] not null default '{}',
  budget numeric(12,2) check (budget is null or budget >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nori_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.nori_conversations(id) on delete cascade,
  role public.nori_message_role not null,
  content text not null check (length(content) > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index profiles_branch_idx on public.profiles(branch_id) where is_active;
create index categories_active_order_idx on public.categories(is_active, display_order);
create index products_category_active_idx on public.products(category_id, is_active, is_available);
create index products_dietary_tags_idx on public.products using gin(dietary_tags);
create index products_allergens_idx on public.products using gin(allergens);
create index customization_groups_product_idx on public.product_customization_groups(product_id, display_order);
create index customization_options_group_idx on public.product_customization_options(group_id, display_order);
create index orders_branch_status_created_idx on public.orders(branch_id, status, created_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index nori_conversations_branch_created_idx on public.nori_conversations(branch_id, created_at desc);
create index nori_messages_conversation_created_idx on public.nori_messages(conversation_id, created_at);

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger branches_updated_at before update on public.branches for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger nori_conversations_updated_at before update on public.nori_conversations for each row execute function public.set_updated_at();

comment on table public.nori_messages is 'Retain only for the restaurant-defined support period; purge expired kiosk conversations with a scheduled server job. Never store audio or provider secrets.';
