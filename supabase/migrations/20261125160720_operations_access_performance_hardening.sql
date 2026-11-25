-- 2026-11-25: operations access and performance hardening.
-- Apply after restaurant_operations_foundation, secure_public_requests,
-- complete_recipe_coverage, and booking_status_history_timeline.

create index if not exists idx_booking_status_history_booking_changed on public.booking_status_history(booking_id,changed_at);
create index if not exists idx_booking_status_history_changed_by on public.booking_status_history(changed_by);
create index if not exists idx_bookings_date_time on public.bookings(booking_date,booking_time);
create index if not exists idx_inventory_movements_item_created on public.inventory_movements(inventory_item_id,created_at desc);
create index if not exists idx_inventory_movements_order on public.inventory_movements(order_id);
create index if not exists idx_inventory_movements_created_by on public.inventory_movements(created_by);
create index if not exists idx_menu_item_recipes_inventory on public.menu_item_recipes(inventory_item_id);
create index if not exists idx_order_status_history_order_changed on public.order_status_history(order_id,changed_at);
create index if not exists idx_order_status_history_changed_by on public.order_status_history(changed_by);
create index if not exists idx_staff_activity_logs_actor_created on public.staff_activity_logs(actor_id,created_at desc);
create index if not exists idx_site_visits_visited_at on public.site_visits(visited_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon,authenticated,service_role;

create or replace function private.is_shrimp_house_staff()
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$ select exists(select 1 from public.staff_profiles where user_id=auth.uid()); $$;

create or replace function private.is_shrimp_house_admin()
returns boolean language sql stable security definer
set search_path=pg_catalog,public
as $$ select exists(select 1 from public.staff_profiles where user_id=auth.uid() and role='admin'); $$;

revoke all on function private.is_shrimp_house_staff() from public;
revoke all on function private.is_shrimp_house_admin() from public;
grant execute on function private.is_shrimp_house_staff() to anon,authenticated,service_role;
grant execute on function private.is_shrimp_house_admin() to authenticated,service_role;

-- The rate-limit table remains inaccessible to browser roles.
drop policy if exists "No browser access to rate limits" on public.request_rate_limits;
create policy "No browser access to rate limits" on public.request_rate_limits
 for all to anon,authenticated using(false) with check(false);

-- Public visit tracking accepts both the old and current menu routes.
drop policy if exists "Public record page views" on public.site_visits;
create policy "Public record page views" on public.site_visits
 for insert to anon,authenticated
 with check(page_path=any(array['/','/index.html','/menu','/menu.html']::text[]));

-- Consolidate public and staff menu reads; isolate write operations.
drop policy if exists "Staff manage menu" on public.menu_items;
drop policy if exists "Public can view available menu" on public.menu_items;
drop policy if exists "Public and staff view menu" on public.menu_items;
drop policy if exists "Staff insert menu" on public.menu_items;
drop policy if exists "Staff update menu" on public.menu_items;
drop policy if exists "Staff delete menu" on public.menu_items;
create policy "Public and staff view menu" on public.menu_items
 for select to public using(is_available or private.is_shrimp_house_staff());
create policy "Staff insert menu" on public.menu_items
 for insert to authenticated with check(private.is_shrimp_house_staff());
create policy "Staff update menu" on public.menu_items
 for update to authenticated using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
create policy "Staff delete menu" on public.menu_items
 for delete to authenticated using(private.is_shrimp_house_staff());

-- Consolidate active public offer reads and staff-only offer management.
drop policy if exists "Staff manage offers" on public.offers;
drop policy if exists "Public read active offers" on public.offers;
drop policy if exists "Public and staff read offers" on public.offers;
drop policy if exists "Staff insert offers" on public.offers;
drop policy if exists "Staff update offers" on public.offers;
drop policy if exists "Staff delete offers" on public.offers;
create policy "Public and staff read offers" on public.offers
 for select to anon,authenticated
 using((is_active and starts_at<=now() and ends_at>now()) or private.is_shrimp_house_staff());
create policy "Staff insert offers" on public.offers
 for insert to authenticated with check(private.is_shrimp_house_staff());
create policy "Staff update offers" on public.offers
 for update to authenticated using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
create policy "Staff delete offers" on public.offers
 for delete to authenticated using(private.is_shrimp_house_staff());

-- Keep public settings readable; staff writes stay role-restricted.
drop policy if exists restaurant_settings_staff_all on public.restaurant_settings;
drop policy if exists "Staff insert restaurant settings" on public.restaurant_settings;
drop policy if exists "Staff update restaurant settings" on public.restaurant_settings;
drop policy if exists "Staff delete restaurant settings" on public.restaurant_settings;
create policy "Staff insert restaurant settings" on public.restaurant_settings
 for insert to authenticated with check(private.is_shrimp_house_staff());
create policy "Staff update restaurant settings" on public.restaurant_settings
 for update to authenticated using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
create policy "Staff delete restaurant settings" on public.restaurant_settings
 for delete to authenticated using(private.is_shrimp_house_staff());

-- Profile reads are self-only unless the caller is an admin; writes are admin-only.
drop policy if exists "Admins manage staff profiles" on public.staff_profiles;
drop policy if exists "Users see own staff profile" on public.staff_profiles;
drop policy if exists "Users and admins read staff profiles" on public.staff_profiles;
drop policy if exists "Admins insert staff profiles" on public.staff_profiles;
drop policy if exists "Admins update staff profiles" on public.staff_profiles;
drop policy if exists "Admins delete staff profiles" on public.staff_profiles;
create policy "Users and admins read staff profiles" on public.staff_profiles
 for select to authenticated using(user_id=(select auth.uid()) or private.is_shrimp_house_admin());
create policy "Admins insert staff profiles" on public.staff_profiles
 for insert to authenticated with check(private.is_shrimp_house_admin());
create policy "Admins update staff profiles" on public.staff_profiles
 for update to authenticated using(private.is_shrimp_house_admin()) with check(private.is_shrimp_house_admin());
create policy "Admins delete staff profiles" on public.staff_profiles
 for delete to authenticated using(private.is_shrimp_house_admin());

-- Point the remaining staff policies at non-exposed private helper functions.
alter policy "Staff view booking status history" on public.booking_status_history using(private.is_shrimp_house_staff());
alter policy "Staff update bookings" on public.bookings using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
alter policy "Staff view bookings" on public.bookings using(private.is_shrimp_house_staff());
alter policy "Staff manage inventory" on public.inventory_items using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
alter policy "Staff add inventory movements" on public.inventory_movements with check(private.is_shrimp_house_staff());
alter policy "Staff view inventory movements" on public.inventory_movements using(private.is_shrimp_house_staff());
alter policy "Staff manage recipes" on public.menu_item_recipes using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
alter policy "Staff view order status history" on public.order_status_history using(private.is_shrimp_house_staff());
alter policy "Staff update orders" on public.orders using(private.is_shrimp_house_staff()) with check(private.is_shrimp_house_staff());
alter policy "Staff view orders" on public.orders using(private.is_shrimp_house_staff());
alter policy "Staff view page view stats" on public.site_visits using(private.is_shrimp_house_staff());
alter policy "Admins view activity logs" on public.staff_activity_logs using(private.is_shrimp_house_admin());

-- The stock movement RPC uses caller privileges and the same RLS policies.
create or replace function public.record_sh_inventory_movement(
 p_inventory_item_id uuid,p_delta numeric,p_note text default ''
) returns numeric language plpgsql security invoker
set search_path=pg_catalog,public
as $$
declare v_current numeric; v_next numeric;
begin
 if auth.uid() is null or not private.is_shrimp_house_staff() then raise exception 'غير مصرح بتعديل المخزون'; end if;
 if p_delta is null or p_delta=0 or abs(p_delta)>100000 then raise exception 'كمية الحركة غير صحيحة'; end if;
 select quantity into v_current from public.inventory_items where id=p_inventory_item_id for update;
 if not found then raise exception 'الخامة غير موجودة'; end if;
 v_next:=v_current+p_delta;
 if v_next<0 then raise exception 'الكمية المتاحة لا تكفي للصرف'; end if;
 update public.inventory_items set quantity=v_next,updated_at=now() where id=p_inventory_item_id;
 insert into public.inventory_movements(inventory_item_id,delta_quantity,reason,note,created_by)
 values(p_inventory_item_id,p_delta,case when p_delta>0 then 'restock' else 'adjustment' end,left(coalesce(p_note,''),300),auth.uid());
 return v_next;
end;
$$;
revoke all on function public.record_sh_inventory_movement(uuid,numeric,text) from public,anon;
grant execute on function public.record_sh_inventory_movement(uuid,numeric,text) to authenticated;

drop function if exists public.is_shrimp_house_admin();
drop function if exists public.is_shrimp_house_staff();

-- Explicit Data API grants required in addition to RLS policies.
grant select on public.offers to anon,authenticated;
grant insert,update,delete on public.offers to authenticated;
grant select,insert,update,delete on public.menu_item_recipes to authenticated;
grant select,insert on public.inventory_movements to authenticated;
grant select on public.order_status_history,public.booking_status_history,public.staff_activity_logs to authenticated;
