-- migration-v14 — the Future page.
-- Run in the Supabase SQL Editor (same drill as v12/v13).
--
-- 1) queue: each member's desired completion order. Wholesale-replaced
--    on every save (the client sends the full ordered list), so
--    position is just the array index — no gap management needed.
create table if not exists queue (
  steamid  text    not null,
  appid    bigint  not null,
  position integer not null default 0,
  primary key (steamid, appid)
);

-- 2) play pace lives on the member: hours per weekday / weekend day.
--    Defaults are a gentle 2h weekdays, 4h weekends until they save.
alter table members add column if not exists play_weekday numeric default 2;
alter table members add column if not exists play_weekend numeric default 4;
