-- v5.0 migration: pioneer records (unlocked while globally <=1%)
create table if not exists pioneers (
  steamid       text   not null,
  appid         bigint not null,
  achid         text   not null,
  unlocked_at   timestamptz,
  pct_at_unlock numeric,
  recorded_at   timestamptz not null default now(),
  primary key (steamid, appid, achid)
);
alter table pioneers enable row level security;
