-- Prevent partial or falsely-completed recipe-based stock deductions.
create or replace function public.apply_order_recipe_deductions()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
declare
 v_line jsonb;
 v_menu_id uuid;
 v_qty numeric;
 v_need numeric;
 v_any_recipe boolean;
 v_has_recipe boolean := false;
 v_menu_name text;
 v_stock record;
begin
 if new.status='preparing' and old.status is distinct from new.status and new.stock_deducted_at is null then
   select exists(select 1 from public.menu_item_recipes) into v_any_recipe;
   for v_line in
     select value from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) as x(value)
   loop
     begin
       v_menu_id := (v_line->>'menu_item_id')::uuid;
     exception when invalid_text_representation or null_value_not_allowed then
       continue;
     end;
     select count(*) into v_qty
     from public.menu_item_recipes
     where menu_item_id=v_menu_id;
     if v_qty=0 then
       if v_any_recipe then
         v_menu_name:=coalesce(v_line->>'name','صنف غير معروف');
         raise exception 'لا يمكن بدء التجهيز: وصفة مكونات الصنف "%" غير مسجلة بعد. أكمل وصفات جميع أصناف الطلب أولًا.',v_menu_name;
       end if;
       continue;
     end if;
     v_qty := greatest(1,coalesce((v_line->>'quantity')::numeric,1));
     for v_stock in
       select r.inventory_item_id,r.quantity_per_item,i.name,i.quantity
       from public.menu_item_recipes r
       join public.inventory_items i on i.id=r.inventory_item_id
       where r.menu_item_id=v_menu_id
       order by r.inventory_item_id
       for update of i
     loop
       v_need:=v_stock.quantity_per_item*v_qty;
       if v_stock.quantity<v_need then
         raise exception 'مخزون غير كافٍ للخامة: % (المتاح %, المطلوب %)',v_stock.name,v_stock.quantity,v_need;
       end if;
       update public.inventory_items
       set quantity=quantity-v_need,updated_at=now()
       where id=v_stock.inventory_item_id;
       insert into public.inventory_movements(inventory_item_id,delta_quantity,reason,order_id,note,created_by)
       values(v_stock.inventory_item_id,-v_need,'order_use',new.id,'خصم مكونات الطلب',auth.uid());
       v_has_recipe:=true;
     end loop;
   end loop;
   if v_has_recipe then new.stock_deducted_at:=now(); end if;
 end if;
 return new;
end;
$$;
revoke all on function public.apply_order_recipe_deductions() from public,anon,authenticated;
drop trigger if exists trg_apply_order_recipe_deductions on public.orders;
create trigger trg_apply_order_recipe_deductions before update of status on public.orders
for each row execute function public.apply_order_recipe_deductions();
