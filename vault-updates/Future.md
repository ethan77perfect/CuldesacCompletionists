---
type: feature
status: live
files: [src/components/Future.jsx, src/lib/stats.js, api/db.js, src/App.jsx, supabase/migration-v14.sql, supabase/migration-v15.sql]
---
# Future — the burndown calendar

**What it is** — each member drags their unfinished games into a desired completion order, sets a play pace (weekday hours + weekend hours), and the page projects the whole queue forward day by day: the active game's remaining points burn to zero → total 100% count ticks up one → the line jumps to the next game's total and burns again. One projection, three renderings: the sawtooth chart, a Monday-first month calendar (capped at 6 months on screen), and a per-game schedule with start → finish dates.

**The model — "points share of median"** — hours-left = effectiveHours × ptsLeft ÷ pool, i.e. a constant `pool ÷ effHours` points per hour. Earning points is what shrinks the estimate, not logging hours. Effective hours are the existing blend (curator median + club completions' frozen playtimes, v13). Weekends burn at their own pace; a game finishing mid-day hands its leftover hours to the next in line (🏁×2 days possible).

**The chart** — every game plants its **poster** (custom cover → library portrait → header fallback) at the top of its colored run, framed in the game's color. The dashed step on the right axis is the member's **total** perfect count: it starts at today's real number and climbs at each projected 🏁, so the axis reads "12 → 19", not "0 → 7". Long plans split into **half-year panels** (boundaries at +6mo, +12mo… from the start), every panel on the same Y scale so slopes stay comparable; boundary samples land in both panels (projection samples every local midnight), so lines cross panel edges without gaps, and a game carried over a boundary re-plants its poster at the panel's left edge. `chartChunks()` in stats.js — pure, node-tested (tiling, boundary continuity, done-step monotonicity, poster placement).

**Denominators everywhere** — schedule rows read "367 / 500 pts · 12 of 34 ach · ~9h"; chart tooltips and calendar day tooltips read "X / pool pts · ≈N of M ach" (the ≈ is honest: points burn linearly, which achievements land when is unknowable); each calendar cell carries a thin **progress bar** of the active game's pool remaining, draining across the month in the game's color.

**Colors** — every queue row has a native color swatch; picked colors persist in `queue.color` (v15, `#rrggbb` sanitized server-side, null = default palette by position) and flow to chart runs, poster frames, calendar tints, bars, and schedule dots. `saveFuture` tolerates a pre-v15 DB by retrying without the column.

**What it refuses to guess** — unrated games (⏱ no hours) and games completed since queuing are skipped visibly with the reason. Zero pace on both sliders = an honest "the future is a flat line" (`idle`). The walk caps at a 730-day horizon ("beyond the horizon", `truncated`). Day stepping is by calendar dates, so DST can't desync chart from calendar.

**A rolling forecast, not a schedule** — the projection re-anchors to *today* on every load, from live stats: points you actually earned shrink the plan, slack days push it out, finished games drop off (✓ skipped). It never remembers yesterday's plan — planned-vs-actual would be a separate feature (snapshot the plan).

**Live vs. saved** — sliders, queue edits, and color picks re-project instantly from draft state; **Save changes** persists pace (`members.play_weekday/play_weekend`), order, and colors in one `saveFuture` op (wholesale queue replace, position = array index). Meta ships `queue` with pre-v14 tolerance. The bench lists every owned unfinished game, quickest projected wins first.

**Schema** — v14: `queue (steamid, appid, position)` + members pace columns. v15: `queue.color text`. Run both in the Supabase SQL Editor (and take the "enable RLS" option — the API uses the service key, which bypasses RLS, so deny-by-default costs nothing).
