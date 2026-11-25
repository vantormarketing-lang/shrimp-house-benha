do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='site_visits') then alter publication supabase_realtime add table public.site_visits; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_movements') then alter publication supabase_realtime add table public.inventory_movements; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='menu_item_recipes') then alter publication supabase_realtime add table public.menu_item_recipes; end if;
 end if;
end $$;