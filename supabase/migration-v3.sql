-- v3.0 migration: contracts (wheel), hunts, custom challenges
-- Paste into Supabase SQL Editor -> New query -> Run

create table if not exists contracts (
  id          bigserial primary key,
  steamid     text,                      -- null = public bounty (applies to everyone)
  appid       bigint not null,
  multiplier  numeric not null default 1.5,
  source      text not null default 'personal',  -- 'personal' | 'public'
  accepted_at timestamptz not null default now()
);

create table if not exists hunts (
  month        text primary key,         -- 'YYYY-MM'
  appids       jsonb not null,
  achievements jsonb not null,           -- [{appid, id, name, pct, base}]
  status       text not null default 'active',   -- 'active' | 'finished'
  final        jsonb,                    -- frozen standings at finish
  created_at   timestamptz not null default now()
);

create table if not exists challenges (
  id          bigserial primary key,
  title       text not null,
  description text not null default '',
  category    text not null default 'General',
  difficulty  int not null default 5,
  proposed_by text,
  created_at  timestamptz not null default now()
);

create table if not exists claims (
  challenge_id bigint not null references challenges(id) on delete cascade,
  steamid      text not null,
  proof        text,
  claimed_at   timestamptz not null default now(),
  primary key (challenge_id, steamid)
);

alter table contracts  enable row level security;
alter table hunts      enable row level security;
alter table challenges enable row level security;
alter table claims     enable row level security;
