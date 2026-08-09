-- v2.0 migration: races, per-game notes, backlog voting
-- Paste into Supabase SQL Editor -> New query -> Run
alter table games add column if not exists race boolean not null default false;
alter table games add column if not exists notes text not null default '';

create table if not exists backlog (
  appid       bigint primary key,
  name        text not null,
  proposed_by text,
  votes       jsonb not null default '[]'::jsonb,
  added_at    timestamptz not null default now()
);
alter table backlog enable row level security;
