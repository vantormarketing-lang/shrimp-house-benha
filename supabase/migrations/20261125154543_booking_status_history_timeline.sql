create table if not exists public.booking_status_history (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 old_status text,
 new_status text not null,
 changed_by uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default now()
);
alter table public.booking_status_history enable row level security;
drop policy if exists "Staff view booking status history" on public.booking_status_history;
create policy "Staff view booking status history" on public.booking_status_history
 for select to authenticated using (private.is_shrimp_house_staff());

create or replace function public.log_booking_status_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$
begin
 if new.status is distinct from old.status then
  insert into public.booking_status_history(booking_id,old_status,new_status,changed_by)
  values(new.id,old.status,new.status,auth.uid());
 end if;
 return new;
end;
$$;
revoke all on function public.log_booking_status_change() from public,anon,authenticated;
drop trigger if exists trg_log_booking_status_change on public.bookings;
create trigger trg_log_booking_status_change after update of status on public.bookings
 for each row execute function public.log_booking_status_change();

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='booking_status_history') then alter publication supabase_realtime add table public.booking_status_history; end if;
 end if;
end $$;
