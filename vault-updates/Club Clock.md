---
type: ops
status: live
files: [src/lib/stats.js, src/components/Burndown.jsx]
---
# Club Clock (Month Boundaries)

**The failure it fixes** — `monthKey` bucketed events by the *viewer's browser* timezone (`getMonth()`), so an unlock at 11:45pm Eastern on Aug 31 was August on an Eastern screen and **September** on a UTC one. Two members could see different monthly champions, different "This month" totals, and different hunt standings — the most contested numbers on the site, varying by who's looking. (Proven: the same instant keyed `2026-08` vs `2026-09` depending on viewer TZ.)

**How it works now** — one clock for everyone: months are keyed in `America/New_York` via `Intl.DateTimeFormat("en-CA", …)`, same principle as the cron's en-CA snapshot dates. Memoized per hour bucket (NY offsets are whole hours, so a club month boundary never splits an hour) — ~100k event keys cost a few ms. Applied to: monthly crowns + 🏆 History, the "This month" board tab (was a separate local-midnight cutoff, now the same key), the monthly hunt's veteran/racer/ignore classification (string-compares `YYYY-MM` keys instead of local epoch boundaries), Burndown's burned-this-month counter, and the current-month label. `monthKey` is exported from stats.js now; computeHunt's unused `start`/`end` return fields were dropped.

**What it does NOT do** — it doesn't move any Eastern viewer's numbers; Ethan's own view is unchanged. It makes everyone else's view match his. It also can't restore points that are missing from the payload — that's [[Ownership Carry-Forward]]'s job: crowns are **derived live** from event timestamps on every load (never frozen at cron time), so holes in the data undercount a month until they heal, and heal the crown automatically when they do. First blood is computed from present data too, so a member's missing unlocks can temporarily hand their first-blood bonuses to the next-earliest unlocker — totals can swing *both* ways when a hole closes.

**Watch** — a disputed crown checklist: (1) Data Health strip clear? (2) `ownedCarried`/`playersCarried` zero on a manual `/api/refresh`? (3) both parties' perfects counts correct? Then the 🏆 History standings are the true count. If a crown looks wrong while any of those are dirty, heal first, argue after.

**Tests** — `TZ=UTC node test-months.mjs && TZ=America/New_York node test-months.mjs && TZ=Pacific/Kiritimati node test-months.mjs` — identical results required under all three: boundary instants either side of club midnight, both DST transitions, hunt racer/veteran/next-month classification, memo perf.
