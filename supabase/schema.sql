-- The 100% Club — database schema
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run

create table if not exists members (
  steamid  text primary key,
  name     text not null,
  color    text not null default '#E8B84B',
  added_at timestamptz not null default now()
);

create table if not exists games (
  appid    bigint primary key,
  name     text,
  added_at timestamptz not null default now()
);

create table if not exists settings (
  id   int primary key default 1,
  data jsonb not null default '{}'::jsonb
);

insert into settings (id, data)
values (1, '{"bonus": 0.4, "steepness": 3.0, "rarestWeight": 0.65}')
on conflict (id) do nothing;

-- Row Level Security: locked down entirely. Only the backend
-- (using the service role key) can read or write. The website
-- never talks to Supabase directly.
alter table members  enable row level security;
alter table games    enable row level security;
alter table settings enable row level security;
