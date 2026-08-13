-- v6.0 migration: The Century Club (personal 100-game 100% goals)
create table if not exists century (
  steamid  text   not null,
  appid    bigint not null,
  name     text   not null,
  added_at timestamptz not null default now(),
  primary key (steamid, appid)
);
alter table century enable row level security;

-- fun rating (0–5 stars), per member per pick
alter table century add column if not exists fun smallint not null default 0;
