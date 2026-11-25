-- 2026-11-25: restaurant operations foundation
alter table public.menu_items
  add column if not exists category_key text not null default '',
  add column if not exists category_icon text not null default '🍽️',
  add column if not exists options jsonb not null default '[]'::jsonb;
alter table public.menu_items drop constraint if exists menu_items_options_array_check;
alter table public.menu_items add constraint menu_items_options_array_check check (jsonb_typeof(options)='array');
create unique index if not exists menu_items_category_name_uidx on public.menu_items(category,name);

alter table public.orders
  add column if not exists fulfillment_type text not null default 'delivery',
  add column if not exists tracking_code text,
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists payment_method text not null default 'cash',
  add column if not exists stock_deducted_at timestamptz;
alter table public.orders drop constraint if exists orders_fulfillment_type_check;
alter table public.orders add constraint orders_fulfillment_type_check check (fulfillment_type in ('delivery','pickup'));
create unique index if not exists orders_tracking_code_uidx on public.orders(tracking_code) where tracking_code is not null;

alter table public.bookings add column if not exists booking_code text;
create unique index if not exists bookings_booking_code_uidx on public.bookings(booking_code) where booking_code is not null;

alter table public.restaurant_settings
  add column if not exists maps_url text not null default '',
  add column if not exists facebook_url text not null default '',
  add column if not exists instagram_url text not null default '',
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists minimum_order numeric(10,2) not null default 0,
  add column if not exists delivery_areas text not null default '',
  add column if not exists payment_methods text not null default 'كاش عند الاستلام';

create table if not exists public.menu_item_recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_per_item numeric(12,3) not null check (quantity_per_item > 0),
  created_at timestamptz not null default now(),
  unique(menu_item_id,inventory_item_id)
);
alter table public.menu_item_recipes enable row level security;
drop policy if exists "Staff manage recipes" on public.menu_item_recipes;
create policy "Staff manage recipes" on public.menu_item_recipes for all to authenticated
using (public.is_shrimp_house_staff()) with check (public.is_shrimp_house_staff());

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  delta_quantity numeric(12,3) not null check (delta_quantity <> 0),
  reason text not null check (reason in ('order_use','restock','adjustment')),
  order_id uuid references public.orders(id) on delete set null,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.inventory_movements enable row level security;
drop policy if exists "Staff view inventory movements" on public.inventory_movements;
create policy "Staff view inventory movements" on public.inventory_movements for select to authenticated using (public.is_shrimp_house_staff());
drop policy if exists "Staff add inventory movements" on public.inventory_movements;
create policy "Staff add inventory movements" on public.inventory_movements for insert to authenticated with check (public.is_shrimp_house_staff());

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);
alter table public.order_status_history enable row level security;
drop policy if exists "Staff view order status history" on public.order_status_history;
create policy "Staff view order status history" on public.order_status_history for select to authenticated using (public.is_shrimp_house_staff());

create table if not exists public.staff_activity_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id text not null,
  operation text not null,
  changed_fields text[] not null default '{}',
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.staff_activity_logs enable row level security;
drop policy if exists "Admins view activity logs" on public.staff_activity_logs;
create policy "Admins view activity logs" on public.staff_activity_logs for select to authenticated using (public.is_shrimp_house_admin());

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  promo_code text unique,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.offers enable row level security;
drop policy if exists "Public read active offers" on public.offers;
create policy "Public read active offers" on public.offers for select to anon,authenticated
using (is_active and starts_at<=now() and ends_at>now());
drop policy if exists "Staff manage offers" on public.offers;
create policy "Staff manage offers" on public.offers for all to authenticated
using (public.is_shrimp_house_staff()) with check (public.is_shrimp_house_staff());

create table if not exists public.request_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant all on public.request_rate_limits to service_role;

create or replace function public.consume_sh_request_limit(p_key_hash text,p_limit integer default 12,p_window_seconds integer default 600)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_count integer;
begin
  if p_key_hash is null or length(p_key_hash)<>64 or p_limit<1 or p_window_seconds<1 then return false; end if;
  insert into public.request_rate_limits(key_hash,window_started_at,request_count,updated_at)
  values(p_key_hash,now(),1,now())
  on conflict(key_hash) do update
  set request_count=case
        when public.request_rate_limits.window_started_at + make_interval(secs=>p_window_seconds) <= now() then 1
        else public.request_rate_limits.request_count+1 end,
      window_started_at=case
        when public.request_rate_limits.window_started_at + make_interval(secs=>p_window_seconds) <= now() then now()
        else public.request_rate_limits.window_started_at end,
      updated_at=now()
  returning request_count into v_count;
  return v_count<=p_limit;
end;
$$;
revoke all on function public.consume_sh_request_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_sh_request_limit(text,integer,integer) to service_role;

create or replace function public.log_order_status_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
 if new.status is distinct from old.status then
   insert into public.order_status_history(order_id,old_status,new_status,changed_by)
   values(new.id,old.status,new.status,auth.uid());
 end if;
 return new;
end;
$$;
revoke all on function public.log_order_status_change() from public,anon,authenticated;
drop trigger if exists trg_log_order_status_change on public.orders;
create trigger trg_log_order_status_change after update of status on public.orders
for each row execute function public.log_order_status_change();

create or replace function public.apply_order_recipe_deductions()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
 v_line jsonb; v_menu_id uuid; v_qty numeric; v_need numeric;
 v_stock record;
begin
 if new.status='preparing' and old.status is distinct from new.status and new.stock_deducted_at is null then
   for v_line in select value from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) as x(value) loop
     begin
       v_menu_id := (v_line->>'menu_item_id')::uuid;
     exception when invalid_text_representation then
       continue;
     end;
     v_qty := greatest(1,coalesce((v_line->>'quantity')::numeric,1));
     for v_stock in
       select r.inventory_item_id,r.quantity_per_item,i.name,i.quantity
       from public.menu_item_recipes r
       join public.inventory_items i on i.id=r.inventory_item_id
       where r.menu_item_id=v_menu_id
       order by r.inventory_item_id
       for update of i
     loop
       v_need := v_stock.quantity_per_item*v_qty;
       if v_stock.quantity < v_need then
         raise exception 'مخزون غير كافٍ للخامة: % (المتاح %, المطلوب %)',v_stock.name,v_stock.quantity,v_need;
       end if;
       update public.inventory_items set quantity=quantity-v_need,updated_at=now()
       where id=v_stock.inventory_item_id;
       insert into public.inventory_movements(inventory_item_id,delta_quantity,reason,order_id,note,created_by)
       values(v_stock.inventory_item_id,-v_need,'order_use',new.id,'خصم مكونات الطلب',auth.uid());
     end loop;
   end loop;
   new.stock_deducted_at:=now();
 end if;
 return new;
end;
$$;
revoke all on function public.apply_order_recipe_deductions() from public,anon,authenticated;
drop trigger if exists trg_apply_order_recipe_deductions on public.orders;
create trigger trg_apply_order_recipe_deductions before update of status on public.orders
for each row execute function public.apply_order_recipe_deductions();

create or replace function public.log_staff_activity()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare v_old jsonb:='{}'::jsonb; v_new jsonb:='{}'::jsonb; v_id text; v_keys text[];
begin
 if tg_op<>'INSERT' then v_old:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then v_new:=to_jsonb(new); end if;
 v_id:=coalesce(v_new->>'id',v_old->>'id',v_new->>'user_id',v_old->>'user_id','unknown');
 select array_agg(k order by k) into v_keys from (
   select jsonb_object_keys(v_old) as k union select jsonb_object_keys(v_new) as k
 ) keys where v_old->k is distinct from v_new->k and k not in ('updated_at','created_at');
 insert into public.staff_activity_logs(table_name,record_id,operation,changed_fields,actor_id)
 values(tg_table_name,v_id,tg_op,coalesce(v_keys,'{}'),auth.uid());
 return coalesce(new,old);
end;
$$;
revoke all on function public.log_staff_activity() from public,anon,authenticated;
drop trigger if exists trg_staff_activity_orders on public.orders;
create trigger trg_staff_activity_orders after insert or update or delete on public.orders for each row execute function public.log_staff_activity();
drop trigger if exists trg_staff_activity_bookings on public.bookings;
create trigger trg_staff_activity_bookings after insert or update or delete on public.bookings for each row execute function public.log_staff_activity();
drop trigger if exists trg_staff_activity_menu_items on public.menu_items;
create trigger trg_staff_activity_menu_items after insert or update or delete on public.menu_items for each row execute function public.log_staff_activity();
drop trigger if exists trg_staff_activity_inventory on public.inventory_items;
create trigger trg_staff_activity_inventory after insert or update or delete on public.inventory_items for each row execute function public.log_staff_activity();
drop trigger if exists trg_staff_activity_staff_profiles on public.staff_profiles;
create trigger trg_staff_activity_staff_profiles after insert or update or delete on public.staff_profiles for each row execute function public.log_staff_activity();
drop trigger if exists trg_staff_activity_settings on public.restaurant_settings;
create trigger trg_staff_activity_settings after insert or update or delete on public.restaurant_settings for each row execute function public.log_staff_activity();
drop trigger if exists trg_staff_activity_offers on public.offers;
create trigger trg_staff_activity_offers after insert or update or delete on public.offers for each row execute function public.log_staff_activity();

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_items') then alter publication supabase_realtime add table public.inventory_items; end if;
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='offers') then alter publication supabase_realtime add table public.offers; end if;
 end if;
end $$;
