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

## v5.0 hotfix — the Peak follow-ups
- Achievement lists are now the UNION of the schema endpoint (knows new
  achievements immediately) and the global-percentages endpoint (lags
  behind updates). Newly added achievements appear on game pages right
  away as ⏳ Unrated with proper names, and graduate automatically.
- Feed events for achievements missing from the table show Unrated
  instead of a false "0.00%".
- Game page sorts Unrated rows to the bottom, not fake-rarest top.
- Pioneer GRADUATION: when an achievement transitions from unknown to a
  real sub-threshold %, everyone already holding it gets their 🚩
  recorded retroactively (catches unlocks made during the 0.0% window).

Difficulty lifecycle is fully automatic (verified): unknown 0.0% → no
effect; real 0.2–0.5% arrives → difficulty and point values jump; as
the world catches up (5–15%) → decays back down. Set and forget.
