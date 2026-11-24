-- Shrimp House Supabase starter schema
-- Review and run ONLY in the dedicated Shrimp House Supabase project.
-- This script does not grant anyone the admin role automatically.

create extension if not exists pgcrypto;

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'staff' check (role in ('staff','admin')),
  created_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;

create or replace function public.is_shrimp_house_staff()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid()
  );
$$;

create or replace function public.is_shrimp_house_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default '',
  price numeric(10,2) not null check (price >= 0),
  image_url text not null default '',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_items enable row level security;
drop policy if exists "Public can view available menu" on public.menu_items;
create policy "Public can view available menu" on public.menu_items for select using (is_available);
drop policy if exists "Staff manage menu" on public.menu_items;
create policy "Staff manage menu" on public.menu_items for all to authenticated using (public.is_shrimp_house_staff()) with check (public.is_shrimp_house_staff());

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  address text not null default '',
  items jsonb not null default '[]'::jsonb,
  total numeric(10,2) not null default 0 check (total >= 0),
  status text not null default 'new' check (status in ('new','confirmed','preparing','out_for_delivery','completed','cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
drop policy if exists "Staff view orders" on public.orders;
create policy "Staff view orders" on public.orders for select to authenticated using (public.is_shrimp_house_staff());
drop policy if exists "Staff update orders" on public.orders;
create policy "Staff update orders" on public.orders for update to authenticated using (public.is_shrimp_house_staff()) with check (public.is_shrimp_house_staff());
drop policy if exists "Public submit order" on public.orders;
create policy "Public submit order" on public.orders for insert to anon, authenticated with check (true);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  guests integer not null check (guests between 1 and 30),
  booking_date date not null,
  booking_time text not null,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','completed')),
  created_at timestamptz not null default now()
);
alter table public.bookings enable row level security;
drop policy if exists "Staff view bookings" on public.bookings;
create policy "Staff view bookings" on public.bookings for select to authenticated using (public.is_shrimp_house_staff());
drop policy if exists "Staff update bookings" on public.bookings;
create policy "Staff update bookings" on public.bookings for update to authenticated using (public.is_shrimp_house_staff()) with check (public.is_shrimp_house_staff());
drop policy if exists "Public submit booking" on public.bookings;
create policy "Public submit booking" on public.bookings for insert to anon, authenticated with check (true);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default '',
  quantity numeric(12,3) not null default 0,
  reorder_threshold numeric(12,3) not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.inventory_items enable row level security;
drop policy if exists "Staff manage inventory" on public.inventory_items;
create policy "Staff manage inventory" on public.inventory_items for all to authenticated using (public.is_shrimp_house_staff()) with check (public.is_shrimp_house_staff());

-- Profile visibility and editing restricted to the account owner; admins can manage staff.
drop policy if exists "Admins manage staff profiles" on public.staff_profiles;
create policy "Admins manage staff profiles" on public.staff_profiles for all to authenticated using (public.is_shrimp_house_admin()) with check (public.is_shrimp_house_admin());
drop policy if exists "Users see own staff profile" on public.staff_profiles;
create policy "Users see own staff profile" on public.staff_profiles for select to authenticated using (user_id = auth.uid());

-- IMPORTANT: grant initial admin role manually in Supabase after creating the admin account.
-- Never expose service-role keys in frontend HTML/JS.
