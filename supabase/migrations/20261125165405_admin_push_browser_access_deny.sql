create policy "deny browser access to admin push config"
  on public.admin_push_config
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "deny browser access to admin push subscriptions"
  on public.admin_push_subscriptions
  for all
  to anon, authenticated
  using (false)
  with check (false);
