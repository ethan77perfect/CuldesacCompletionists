---
type: feature
status: live
files: [src/components/Bingo.jsx, api/db.js, supabase/migration-v9.sql]
---
# Achievement Bingo

**What it does** — each member gets a personal 5×5 card (center FREE) of 24 achievements they haven't earned, drawn from *their own* owned club games (library-scoped like Burndown — fair by construction). Unlocks mark squares automatically; lines are glory, blackout is legend.

**How it works** — cards generate **client-side** at deal time (the browser has the freshest data) and persist via `dealBingo` so mid-round unlocks can't reshuffle a board. Marking is computed live from `stats` on every load — no honor system, no cron. One round at a time; `deleteBingo` cascades cards (migration-v9). Deal mix: 2 rare (<2%) / 6 mid / 16 common, shortfalls backfilled, ≤4 squares per game (a soft cap — 24 cells is the invariant, so starved pools may exceed it), rarest two on corners, provisional ⏳ excluded. Pool under 24 ⇒ benched with a 🏆 flex line.

**Deliberately not yet** — main-leaderboard points. A deletable test round shouldn't write to the scoring economy; if the club wants stakes after playing a real round, one claim-like event per line wires in cleanly.

## Tweak ideas
- [ ] Auto-deal on the 1st via cron (settings toggle) once the club likes it
- [ ] Line/blackout Discord shoutouts in the morning digest
- [ ] Points per line via claim-style events (decide value vs. hunt economy first)
