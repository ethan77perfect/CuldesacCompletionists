---
type: feature
status: live
files: [src/components/Future.jsx, src/lib/stats.js, api/db.js, src/App.jsx, supabase/migration-v14.sql]
---
# Future — the burndown calendar

**What it is** — each member drags their unfinished games into a desired completion order, sets a play pace (weekday hours + weekend hours), and the page projects the whole queue forward day by day: the active game's remaining points burn to zero → completed count ticks up one → the line jumps to the next game's total and burns again. One projection, three renderings: a sawtooth chart (per-game colored runs + a dashed completions step on the right axis), a Monday-first month calendar (day cells tinted by the game you're on, points left at day's end, 🏁 on projected finishes, capped at 6 months on screen), and a per-game schedule with start → finish dates.

**The model — "points share of median"** — hours-left = effectiveHours × ptsLeft ÷ pool, i.e. a constant `pool ÷ effHours` points per hour. Earning points is what shrinks the estimate, not logging hours: 50 aimless hours in a game move nothing until achievements land. Effective hours are the existing blend (curator median + club completions' frozen playtimes, v13), so a new club 100% sharpens everyone's forecast. Weekends burn at their own pace; a game finishing mid-day hands its leftover hours to the next in line, so two short games can fall on one day (🏁×2).

**What it refuses to guess** — unrated games (⏱ no hours yet) and games completed since queuing are *skipped visibly*, listed with the reason, never silently projected. Zero pace on both sliders = an honest "the future is a flat line" instead of an infinite loop (`idle`). The walk caps at a 730-day horizon; games past it show "beyond the horizon" (`truncated`). Day stepping is by calendar dates, not 24h blocks, so DST shifts can't desync the calendar grid from the projection (`projectQueue` in stats.js — pure, node-tested).

**Live vs. saved** — sliders and queue edits re-project instantly from draft state; **Save changes** persists both in one `saveFuture` op: pace → `members.play_weekday/play_weekend`, order → wholesale replace of the member's `queue` rows (position = array index; no row-diffing bugs by construction). Meta ships `queue` with pre-v14 tolerance. The bench below the queue lists every owned unfinished game, quickest projected wins first.

**Schema (migration-v14)** — `queue (steamid, appid, position, pk (steamid, appid))` + `members.play_weekday numeric default 2`, `members.play_weekend numeric default 4`. Run in the Supabase SQL Editor.
