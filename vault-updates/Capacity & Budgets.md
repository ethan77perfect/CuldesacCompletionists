---
type: ops
status: live
files: [lib/clubSync.js, api/cron.js, api/refresh.js, src/lib/stats.js, src/components/Century.jsx]
---
# Capacity & Budgets

**The scaling law**: every game costs **(2 + members)** Steam calls per fetch (global + schema + one player call each), plus (members + 1) profile calls per run. Members multiply the price of everything.

**The walls, in order of bite** (at the 300-games × 20-members target):
1. **Serverless duration (60s)** — ~900 Steam calls fit safely at concurrency 5 with retry headroom. Fixed game budgets (cron 60, refresh 36) silently crossed this as members grew — cron broke around 15 members. Now **member-aware**: `gameBudget(M, {callBudget})` → games = ⌊(callBudget − M − 1)/(2 + M)⌋, clamped [10, max]. Cron spends 900 calls (max 75 games), refresh 700 (max 45, snappier — a visitor is waiting). Both report `budget` in their JSON. At 20 members: cron 39/run, refresh 30/run.
2. **Payload weight** — ~2–2.5MB at target scale after the diet (below). Hard wall: Vercel's ~4.5MB response cap, reached around **600–700 games** — that's where the change-detection/task-queue redesign stops being optional. Supabase free egress (5GB/mo) is the metered concern before then; ballpark 3.5GB/mo at target scale. Watch it.
3. **Freshness cadence** — 300 games cycle fully every ~2 days via cron alone (2 nightly passes × budget); visitor polls drain the rest (~9 background slices after a quiet day, behind an instantly-served cached page). **Hot games stay minutes-fresh at any scale** — the mechanism that makes the site feel live.
4. **Steam daily quota (100k)** — a full 300×20 crawl is ~6,600 calls. Non-issue.

**The payload diet** — `GetOwnedGames` returns each member's *entire* Steam library, and the payload stored full minute-maps for all of it: it scaled with friends' personal hoards (a 2,000-game whale ≈ 100KB, twice), not with the club. Now: `playtime`/`lastPlayed` maps are **club-scoped** at merge; full-library ownership survives as a compact sorted appid array (`profiles[sid].owned`, ~10KB/whale) with a **shrink guard** (a "successful" list under half the previous size is treated as a partial answer — previous array kept). Old payloads drain their foreign entries automatically, strike-free, on each member's next good fetch — no migration. Club-game ownership checks keep using the minute maps (strike-carries live there); **beyond-catalog checks use `stats.profilesOwned`** — currently only Century's dusty covers, which keep full fidelity. Known small trade: Century's *playtime/last-played sorts* on untracked, non-club picks now read "unknown" (minutes for those games are no longer stored).

**Verdict**: 300 × 20 is comfortable on this architecture with ~1–2 day dormant-game staleness. 500+ games or same-day-everything freshness → the task-queue redesign.

**Tests** — T13–T15 in `test-ownership.mjs` (suite: 53): budget arithmetic + clamps, club-scoping with strike-carry through the filter, foreign drain, compact array, shrink guard both directions.
