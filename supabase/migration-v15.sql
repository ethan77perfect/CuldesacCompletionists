-- migration-v15 — Future page tweaks.
-- Run in the Supabase SQL Editor.
--
-- Custom color per queued game (null = the page's default palette by
-- queue position). Sanitized server-side to #rrggbb.
alter table queue add column if not exists color text;
