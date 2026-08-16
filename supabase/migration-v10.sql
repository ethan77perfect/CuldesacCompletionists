-- v10: time-based scoring
-- Paste into Supabase SQL Editor -> New query -> Run
--
-- One nullable column: the club-entered median hours-to-complete.
-- NULL = unrated (the site shows a ⏱ indicator and uses a neutral
-- fallback pool until the number is entered). The old `adjust`
-- column stays in place but is no longer read — harmless history.

alter table games add column if not exists hours_median numeric;
