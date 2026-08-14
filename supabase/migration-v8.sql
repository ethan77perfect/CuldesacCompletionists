-- v8: expose total achievements in daily history (powers the Burndown
-- page's %-over-time chart — retroactive for all existing snapshots)
create or replace view snapshot_daily as
  select day, steamid,
         sum(unlocked)::int as unlocked,
         sum(total)::int    as total,
         count(*) filter (where complete)::int as perfects
  from snapshots group by day, steamid;
