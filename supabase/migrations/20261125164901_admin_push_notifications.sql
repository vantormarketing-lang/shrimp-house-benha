create table if not exists public.admin_push_config (
  id smallint primary key default 1 check (id = 1),
  vapid_public_key text not null,
  vapid_private_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_push_config enable row level security;
revoke all on table public.admin_push_config from anon, authenticated;
grant all on table public.admin_push_config to service_role;

create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_push_subscriptions enable row level security;
revoke all on table public.admin_push_subscriptions from anon, authenticated;
grant all on table public.admin_push_subscriptions to service_role;
create index if not exists admin_push_subscriptions_user_id_idx on public.admin_push_subscriptions(user_id);
