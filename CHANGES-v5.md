# v5.0 — provisional rarity + Pioneers 🚩

## Apply
1. Copy over repo, commit, push
2. Supabase SQL Editor → run supabase/migration-v5.sql
3. Manually run /api/cron?secret=... once — the first pioneer scan
   backfills records for every current sub-1% unlock in the club
   (silently, no Discord spam)

## Provisional rarity (the Peak fix)
Steam reports 0.0% for achievements it hasn't computed yet. Those are
now treated as UNKNOWN, not mythic: excluded from the rarest-driver of
difficulty, point-weighted at the game's own typical rarity, shown as
a dashed "⏳ Unrated" chip, kept out of hall of fame / rarest-unlock
stats and hunt slates. They graduate to real tiers automatically as
Steam's data settles. (All scores always recompute from live rarity —
tier drift as data matures was already automatic; this removes the
false-mythic surge in the meantime.)

## Pioneers 🚩
Steam exposes no world-first ordering — but unlocking while the global
rate is ≤1% is provable. The nightly cron records those permanently
(pioneers table): even when the % climbs to 40, week-one unlocks stay
Pioneer. +25% points on pioneer unlocks (settings.pioneerBonus),
🚩 in the feed and Discord digest, a profile stat, and Pioneer (1+) /
Trailblazer (10+) badges. Thresholds: settings.pioneerPct (default 1.0).
