# v2.0 — the everything update

## How to apply
1. Supabase → SQL Editor → run `supabase/migration-v2.sql`
2. In your GitHub repo, upload/replace ALL of: the `api/` folder, the whole
   `src/` folder (it has a new `components/` subfolder and `lib/stats.js`).
   Easiest: repo page → "Add file → Upload files" → drag the api and src
   folders from this zip → Commit. Vercel redeploys automatically.
3. Hard-refresh the site. Done — no env var changes needed.

## New pages
- Home: activity feed (with first-blood 🩸 markers), monthly challenge
  standings, active races, closest-finishes widget, club totals
- Game detail (click any game): full achievement table sorted by rarity
  with per-achievement point values and who-has-what grid, club notes,
  race toggle, per-player hours played
- Player pages (click any name): avatar, badges, perfect shelf,
  completion personality, next-easiest-100% recommendations, streaks,
  signature stats
- Compare: pick two members — W/L record across shared games, progress
  bars, and per-game gap analysis (exactly which achievements only one has)
- Stats: club records, hall of fame (rarest unlocks), rarity scatter
  plot, completion velocity, the graveyard 🪦
- Backlog: propose games, vote (honor-system voter picker), one-click
  promote to tracked

## New mechanics
- Seasons: leaderboard toggle between all-time and current quarter
- First blood: configurable bonus for the first member to unlock any
  achievement (new slider, default +10%)
- Races: flag a game; first 100% gets the crown 👑 forever
- Monthly challenge: pick game + month in settings; standings on Home
- Badges: 12 meta-achievements computed automatically
- Rarity tiers: Common → Mythic color-coding on every achievement
- Library: search + sort (hardest/easiest/A-Z/recently active)

## Deferred (deserve their own session)
- Steam OpenID sign-in (replaces the shared club key)
- Nightly snapshots via Vercel cron (true history + enables notifications)
- Discord webhooks (depends on snapshots to detect what's new)
