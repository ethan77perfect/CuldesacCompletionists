-- v1.1 migration: per-game club difficulty adjustment (-3..+3)
-- Paste into Supabase SQL Editor -> New query -> Run
alter table games add column if not exists adjust int not null default 0;
