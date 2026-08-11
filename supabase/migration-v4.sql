-- v4.0 migration: nightly snapshots
-- Paste into Supabase SQL Editor -> New query -> Run

-- one row per player per game per day: the club's memory
create table if not exists snapshots (
  day      date   not null,
  steamid  text   not null,
  appid    bigint not null,
  unlocked int    not null default 0,
  total    int    not null default 0,
  complete boolean not null default false,
  primary key (day, steamid, appid)
);

-- the full club payload from the last cron run — what makes page loads instant
create table if not exists snapshot_cache (
  id         int primary key default 1,
  payload    jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table snapshots      enable row level security;
alter table snapshot_cache enable row level security;

-- pre-aggregated history for charts (service key bypasses RLS)
create or replace view snapshot_daily as
  select day, steamid,
         sum(unlocked)::int as unlocked,
         count(*) filter (where complete)::int as perfects
  from snapshots group by day, steamid;
