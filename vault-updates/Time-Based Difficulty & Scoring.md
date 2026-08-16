---
type: feature
status: live
files: [src/lib/scoring.js, src/lib/stats.js, src/App.jsx, src/components/ui.jsx, api/db.js, supabase/migration-v10.sql]
---
# Time-Based Difficulty & Scoring (engine v2)

**The model** — one human input per game: **median hours to complete** (Settings → Tracked games; HowLongToBeat's "Completionist" median is the natural source). From that: **difficulty is graded on a curve** — a game's percentile among all *rated club games*, pushed through the inverse normal CDF, centered on 5, scale 2.0, spanning **0.5–10** (hard floor: the easiest game is always worth ≥50 pts). The bell is forced by construction (skew in raw hours can't break it), ties share a midrank, and the curve **re-flows automatically** whenever a game is added or re-timed, because every percentile moves. **Points come from the curve**: `pool = difficulty × 100` — a 10/10 game is worth 1000 points, a 5.0 worth 500. Same currency as custom challenges (difficulty × 100), so games and challenges price in one economy; hours only enter through the curve. Rarity decides *where* points sit inside a game; hours decide *how many* the game is worth.

**Verified shape** (80 realistic skewed games): buckets `1..10 = 0,4,7,12,16,16,12,8,4,1` — 32 games at 5–6 vs 5 at 9–10. Adding three 150h monsters demoted the old 55h king from 10 → 9 on the same load. N=1 → 5.5; identical hours → identical difficulty.

**Unrated games** (no hours yet): difficulty null → every Dial shows **⏱**, GameDetail/Library carry a "needs time data" tag, Settings header counts them, and the default *"⏱ Needs time first"* sort is the data-entry checklist. Their pool stands in at the curve's center (5.0 → 500 pts) so the site works mid-entry.

**Scrapped** — rarity-difficulty, the ±3 adjust (UI + `setAdjust` op; the db column remains, unread), steepness + rarest-weight sliders, the pts/hr slider (pool no longer reads raw hours directly), dead `buildTimeline` export. Provisional-⏳ handling stays (affects point *placement*, no longer difficulty). Giant Slayer (8+) / Legend (9+) badges now mean "top ~11% / ~4% of the club's library by time" — arguably more honest than before.

**Warnings, honestly** — everything reprices retroactively on every load (compute-from-source design; the adjust slider already did this, now it's systemic): all-time totals, month standings, and August's in-progress crown **will shift as hours land**. Best done in one sitting. Point magnitudes stay familiar — diff×100 is the old scale — and the 0.5 floor guarantees no game is ever worth 0, however large the library grows.

## Tweak ideas
- [ ] Auto-suggest hours from HowLongToBeat (no official API — scrape or manual stays)
- [ ] Show each game's club percentile on GameDetail ("harder than 87% of the library")
- [ ] SCALE const (2.0) exposed as a club rule if the bell ever feels too tight/loose
