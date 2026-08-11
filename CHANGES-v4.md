# v4.0 — nightly snapshots: memory, instant loads, Discord digest

## Apply
1. Copy this zip over your repo (new: lib/, api/cron.js, api/cached.js,
   api/history.js, vercel.json; changed: api/club.js, src/App.jsx,
   src/components/StatsPage.jsx, src/components/Hunt.jsx, Wheel.jsx, stats.js)
2. Supabase SQL Editor → run supabase/migration-v4.sql
3. Vercel → Settings → Environment Variables → add CRON_SECRET
   (make one up) and optionally DISCORD_WEBHOOK_URL → Redeploy
4. Test immediately: open https://your-site/api/cron?secret=YOUR_SECRET
   — you should see { ok: true, snapshotted: N, ... } and, if the
   webhook is set, a digest lands in Discord.

## What it does
- 08:00 UTC nightly: full club fetch → snapshot_cache (whole payload)
  + snapshots (one row per player-per-game-per-day). Aborts without
  writing if Steam throttled >5% of requests — garbage is never saved.
- INSTANT LOADS: the site paints from last night's snapshot in
  milliseconds (pulsing "showing last night's snapshot" note), then
  swaps in live data silently once the background refresh completes.
- Discord morning digest (optional): 💯 new completions, 💎 rare
  unlocks since last run (threshold settings.notifyRarePct, default
  1%), and a Monday SPIN DAY post with last week's contract report
  (✅ beaten / ❌ expired).
- New Stats chart: "Perfect games over time" from real snapshot
  history (appears once ≥2 days of snapshots exist).
- Also in this zip: hunt Scrap button, weekly bounty lock, wheel
  landing fix.
