-- 2026-11-25: route public submissions through a server-side validated Edge Function.
do $$
declare p record;
begin
 for p in
  select schemaname,tablename,policyname
  from pg_policies
  where schemaname='public'
    and tablename in ('orders','bookings')
    and cmd in ('INSERT','ALL')
    and (roles @> array['anon']::name[] or roles @> array['public']::name[])
 loop
  execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;
revoke insert on public.orders, public.bookings from anon, authenticated;

create or replace function public.record_sh_inventory_movement(
 p_inventory_item_id uuid,p_delta numeric,p_note text default ''
) returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_current numeric; v_next numeric;
begin
 if auth.uid() is null or not public.is_shrimp_house_staff() then raise exception 'غير مصرح بتعديل المخزون'; end if;
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
