---
type: feature
status: live
files: [src/lib/scoring.js, src/lib/stats.js, src/App.jsx, src/components/ui.jsx, api/db.js, supabase/migration-v10.sql]
---
# Time-Based Difficulty & Scoring (engine v2)

**The model** — one human input per game: **median hours to complete** (Settings → Tracked games; HowLongToBeat's "Completionist" median is the natural source). From that: **difficulty is graded on a curve** — a game's percentile among all *rated club games*, pushed through the inverse normal CDF, centered on 5.5, scale 2.0. The bell is forced by construction (skew in raw hours can't break it), ties share a midrank, and the curve **re-flows automatically** whenever a game is added or re-timed, because every percentile moves. **Points come from time**: `pool = hours × ptsPerHour` (club rule, default 10 = a point per six minutes), divided among achievements by inverse-sqrt global rarity exactly as before; the 100% bonus is still a % of pool. Rarity decides *where* points sit inside a game; hours decide *how many* the game is worth.

**Verified shape** (80 realistic skewed games): buckets `1..10 = 0,4,7,12,16,16,12,8,4,1` — 32 games at 5–6 vs 5 at 9–10. Adding three 150h monsters demoted the old 55h king from 10 → 9 on the same load. N=1 → 5.5; identical hours → identical difficulty.

**Unrated games** (no hours yet): difficulty null → every Dial shows **⏱**, GameDetail/Library carry a "needs time data" tag, Settings header counts them, and the default *"⏱ Needs time first"* sort is the data-entry checklist. Their pool uses a neutral fallback (median of rated games; `defaultHours: 20` before any exist) so the site works mid-entry.

**Scrapped** — rarity-difficulty, the ±3 adjust (UI + `setAdjust` op; the db column remains, unread), steepness + rarest-weight sliders, dead `buildTimeline` export. Provisional-⏳ handling stays (affects point *placement*, no longer difficulty). Giant Slayer (8+) / Legend (9+) badges now mean "top ~11% / ~4% of the club's library by time" — arguably more honest than before.

**Warnings, honestly** — everything reprices retroactively on every load (compute-from-source design; the adjust slider already did this, now it's systemic): all-time totals, month standings, and August's in-progress crown **will shift as hours land**. Best done in one sitting. Total point *scale* also changes (30h game = 300 pts vs old diff×100) — cosmetic, since everyone's measured identically; tune with the pts/hr slider.

## Tweak ideas
- [ ] Auto-suggest hours from HowLongToBeat (no official API — scrape or manual stays)
- [ ] Show each game's club percentile on GameDetail ("harder than 87% of the library")
- [ ] SCALE const (2.0) exposed as a club rule if the bell ever feels too tight/loose
