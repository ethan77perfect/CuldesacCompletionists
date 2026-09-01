---
type: ops
status: live
files: [lib/steamFetch.js, lib/clubSync.js, api/cron.js, api/refresh.js, src/App.jsx]
---
# Ownership Carry-Forward

**The failure it fixes** — a failed or throttled Steam call was indistinguishable from real absence, in two places. (1) `GetOwnedGames` returning a 403/timeout/empty body read as "owns nothing," and the merge replaced that member's profile wholesale — instantly un-owning their whole library. Any game whose only owner was in the bad batch showed **nobody owns this** (A Short Hike), vanished from Future/Burndown/Bingo scope, and dropped its snapshot rows. (2) A hard-failed `GetPlayerAchievements` call inside an otherwise-good game fetch silently omitted that player from the game's `players` map, and the fetched game replaced the cached one — so a perfect blinked out for a cycle (**10 → 9 → 10**). The 15% throttle guard never caught either: one bad call out of ~600 is 0.2%, and 403s didn't even count as failures.

**How it works now** — the fetch layer *reports* failure instead of shrugging:

- `profileMeta[sid].ownedFetched` — true only when Steam genuinely returned a games array. False (403, timeout, private-profile empty response) → the merge carries the member's **entire previous library forward**, `ownedAt` keeps its old stamp.
- On a *successful* fetch, a previously-owned game missing from the new list gets **strikes**: carried with benefit of the doubt until it's absent from `OWNED_DROP_AFTER = 3` consecutive good fetches, then really dropped. Reappearing clears the strike. Real removals (refunds) lag by ~3 good fetches — under a day.
- `playerMisses[appid]` — sids whose player call hard-failed. The merge patches their previous unlocks into the fetched game before it replaces the cache entry. A clean 400 ("never played") is *not* a miss and stays absent — the legitimate signal is preserved.
- A game whose **schema or global** call hard-failed is not emitted at all (carried whole) — a schema-less emission could shrink the achievement list and mint false perfects.
- Personas/avatars carry through summary failures the same way.

**Side-fixes in cron (found while in there)** — the announce diff ran *after* the cache write, so cron runs never persisted their watermarks (letting a later refresh re-announce rares) and the CAS-retry path referenced `ann` before its declaration (crash on a write race). Diff now runs before the write, mirroring `/api/refresh`. Also `staleRemaining` referenced an undefined `gameFetchedAt` — every cron run finished its work, then 500'd on the response line. If Discord ever re-congratulated an old perfect: that was the hole+refetch cycle, also closed now (test T5).

**Surfacing** — a 📚 Data Health strip appears when a member's `ownedAt` is >36h old while a carried library is showing: "library list carried from the last good fetch." If it persists, it's not throttling — check their Steam privacy (Game details: Public). Both endpoints now report `ownedCarried: [sids]` and `playersCarried: n` in their JSON for manual runs.

**Deploy notes** — payload-shape change only (`ownedAt`, `ownedStrikes` on profiles): **no migration**. Old payloads without `ownedAt` never trigger the strip. One repair pass after deploy restores anything currently wiped.

**Watch** — `ownedCarried` nonzero occasionally = Steam being Steam, self-heals. The same sid for days = privacy or a broken steamid. Flicker-prone games were always the one-or-two-owner indies; if a widely-owned game ever flickers again, that's a *new* bug, not this one.

**Tests** — `node test-ownership.mjs` (26 asserts): mocked-Steam end-to-end through `fetchClubData`, carry/strike/reappear cycle, hole patching vs legitimate absence, ghost-💯 prevention, snapshot-row stability, new-member and legacy-shape edges.
