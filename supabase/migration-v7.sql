-- v7: custom cover overrides (club-wide, honor system)
create table if not exists covers (
  appid      bigint primary key,
  url        text not null,
  updated_at timestamptz not null default now()
);
alter table covers enable row level security;
