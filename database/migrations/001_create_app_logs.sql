create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null,
  location_name text,
  payload jsonb default '{}'::jsonb,
  url text,
  user_agent text,
  source text default 'barstock',
  received_at timestamptz
);

create index if not exists app_logs_created_at_idx
  on public.app_logs (created_at desc);

create index if not exists app_logs_event_name_idx
  on public.app_logs (event_name);
