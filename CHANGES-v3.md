# v3.0 — wheels, hunts, challenges, themes

## Apply (you have local git now)
1. Copy this zip's contents over your repo folder (overwrite all)
2. Supabase SQL Editor → run supabase/migration-v3.sql
3. git add -A && git commit -m "v3.0" && git push  → Vercel deploys

## New
- Wheel page: personal wheel (unfinished games, weighted toward closest-to-100%,
  1.5× contract) + public bounty wheel (whole library, equal odds, 2× for
  everyone, club-key gated). Contract ledger with fulfillment tracking.
  Multipliers apply to unlocks after acceptance; overlaps take the max, no stacking.
- Leaderboard: third mode "⚔ Contract kills" (points + kill count under contracts)
- Hunt page: monthly hunt with creator flow (spin/pick 5 games → generated
  slate: 60% rare "important" / 25% mid / 15% wildcard → checkbox curation →
  lock in). Race scoring 1/.8/.6/.4/.2× by place; pre-month owners get flat
  0.6× veteran credit, no podium slot. Hunt points are their own economy.
  Hall of Fame tab with monthly winner banners.
- Challenges page: honor-system custom challenges (Celeste mods etc.) —
  category + 1-10 difficulty, worth diff×100 on the MAIN leaderboard
  (🎯 in feed, first claim gets first blood, optional proof links,
  settings.countChallenges=false to exclude).
- Themes: 5 game-inspired palettes in Settings — House of Hades (default),
  Pale Court (Hollow Knight), Golden Berry (Celeste), Junimo Grove (Stardew),
  Aperture (Portal). Per-device. Plus polish: card hover lift, gradient
  header rule, themed scrollbars.
- Charts merged into the Stats page (nav slot freed for the new pages).
