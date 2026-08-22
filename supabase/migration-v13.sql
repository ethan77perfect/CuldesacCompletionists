-- v13: club completion times
-- Paste into Supabase SQL Editor -> New query -> Run
--
-- When the sync pipeline detects a member hitting 100%, it freezes
-- their playtime at that moment as their "time to complete" — one row
-- per (member, game), written once and NEVER updated, so post-100%
-- victory laps can't drag the number. These blend with the curator's
-- median (each an equal vote) into the game's effective hours:
-- median 30 + completions 40 and 25 -> (25+30+40)/3.
-- Completions that predate this table self-backfill with current
-- playtime the next time their game rotates through a fetch.

create table if not exists completions (
  steamid      text not null,
  appid        bigint not null,
  hours        numeric not null,
  completed_at timestamptz not null default now(),
  primary key (steamid, appid)
);
alter table completions enable row level security;
