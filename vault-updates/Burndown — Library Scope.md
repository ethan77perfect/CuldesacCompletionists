---
type: feature
status: live
files: [src/components/Burndown.jsx, api/cron.js]
---
# Burndown — Library Scope

**What it does** — the backlog-burning page, scoped to each member's *own* games. Your mountain = club games ∩ your Steam library; games you don't own don't exist on your Burndown. Rewards conquering what you already have.

**How it works** — ownership comes from `GetOwnedGames`, which the payload has carried all along (`profiles[sid].playtime` / `.lastPlayed` maps, surfaced as `stats.profilesPlaytime` / `stats.profilesLastPlayed`). A game is on your mountain if you own it **or** have achievement data for it — the OR covers free games (Steam only reports those as owned after first launch) and loads where the ownership fetch failed (empty playtime map = *unknown*, not "owns nothing"; degrades to started-games scope, same convention as Century's dust).

## The pieces
- **Cleanest shelf** — ranked by **% of your own library conquered**, tiebreak fewest remaining. Ranking by raw remaining would crown the smallest library forever ("don't buy games" would be the meta). Absolute effort still gets its prize via 🔥 Biggest Burner (monthly).
- **Untouched Shelf** — owned, zero achievements, dustiest first (never-launched 🧊 at the top, then stalest `rtime_last_played`). This is the deep backlog the page exists to shame.
- **Top offenders** — started, then abandoned (biggest remaining count). Untouched games live on the Shelf, not here — no double-billing.
- **Quick wins** — unchanged (`stats.recs`, already started-games-only).
- **Points remaining** = Σ over your mountain of `pool − basePoints`: untouched games owe their full pool, perfected games owe 0, completion bonus included automatically. Uses the real scoring tables, so club adjustments and provisional weighting flow through.

## History chart
`snapshot_daily` groups by (day, member), so the chart was always per-member — the *denominator* is what changed. `cron.js` now writes a row for every **owned** club game (untouched ⇒ `unlocked=0, total=n`), so `sum(total)` = your library size going forward. Two honest artifacts, both footnoted on the page:
- Days recorded before this change counted started games only → each line may **step down once** at the changeover.
- Buying more club games makes your % dip. That's a taller mountain, not a bug.

## Ops notes
- No migration — `snapshots` schema already fits; v8 (drop+recreate view) is still the prerequisite for the chart at all.
- Discord/pioneer/diff logic reads the cached payload, not snapshot rows — unaffected by the extra zero-rows (`complete=false` keeps them out of the 💯 loop, and StatsPage's perfects chart only counts `complete`).
- Fixed in passing: v8's Burndown read a nonexistent `players[sid].unlocked` field (real shape: `unlocks.length`), which would have shown everyone at 0%.

## Tweak ideas
- [ ] Discord digest line when someone clears their last untouched game ("shelf sweep")
- [ ] Owned-but-not-clubbed teaser: "N games in your library the club doesn't track yet"
- [ ] Per-member "% conquered" milestone pings (50 / 75 / 90)
