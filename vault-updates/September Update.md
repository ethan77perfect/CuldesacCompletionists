---
type: feature
status: live
files: [src/lib/stats.js, src/lib/bingo.js, src/components/Bingo.jsx, src/components/Hunt.jsx, src/components/Trophies.jsx, src/components/Home.jsx, src/App.jsx]
---
# September Update — Focus Hunts, Bingo Five, Trophy Room

## Hunt: Focus Scoring
Each player's hunt games are ranked by their **own raw totals**; rank 1 counts 100%, then **85 / 70 / 55 / 40%** (steeper curve, chosen deliberately — game 5 stays alive but clearly secondary; override via `settings.huntFocusWeights` if the club revolts). The per-achievement race is untouched: place multipliers (1/.8/.6/.4/.2) and veteran credit (0.6×) still resolve against the whole club, and the board chips show **raw** points — the discount applies at the standings level, with a "Focus scoring" panel showing every player's portfolio (`game — raw × weight = weighted`) so nothing is mysterious. Properties worth remembering: the weight assignment is automatic (biggest total × biggest weight — the provably maximal pairing), so it can't be gamed and **capturing never lowers your score**; same raw points, concentrated vs scattered across five games: 385 vs 280. Veteran credit runs through the weights too, which quietly diminishes the "I already owned everything" advantage. **Past hunts are safe**: finished hunts store frozen `final` standings, so old winners never rescore. Softens but does not remove the wallet edge — access to unowned slate games is unchanged, by choice.

## Bingo: Five Games
Cards now pick **5 games first**, then deal 24 cells inside them (5+5+5+5+4) — a card you chase in a handful of installs, not a dozen. Game pick is difficulty-balanced from your owned, unfinished games with 5+ eligible achievements: **at most one bruiser (diff ≥7), at least one comfort game (≤3)** when the library allows; unrated counts as mid. Rarity bands (2 rare / 6 mid / 16 common) and rarest-on-corners survive, now scoped inside the chosen games; quotas relax only as a last resort. Fewer than 5 qualifying games → a chunkier card from what exists, padded from small pools; benched only when the total eligible pool is under 24. Deal logic moved to `lib/bingo.js` (UI-free, testable).

## Bingo rounds now ACCUMULATE
"New round" deals fresh cards while old rounds persist — **the Trophy Room derives each past round's winners from real unlock timestamps** (`deriveBingoWinners`): a line's time is its slowest cell, a card's first line is the fastest of its 12, the round winner is the earliest first-line across members; blackout tracked the same way; zero-timestamp unlocks floor to the deal time. No honor system, retroactive for any round still in the DB. **Delete is now the only way history is lost** — the button says so.

## Trophy Room (`#/trophies`)
One hall for every honor: monthly crowns (+most-crowns), hunt champions (frozen finals), bingo champions (derived), perfection leaders + hardest clear, club records (fastest/longest 100%, best day, first perfect, biggest unlock), five rarest unlocks, race podium. Pure derivation — the page owns no data and never writes. The reigning-champ chip on Home links in.

**Also fixed in passing**: hunt creation's default month was UTC (`toISOString`), so a hunt created after 8pm Eastern on month's end filed under the wrong month — now on the club clock via `monthKey`.

**Tests** — `node test-features.mjs` (21 asserts): the 385-vs-280 concentration example, monotonicity, veteran-through-weights, rank clamping past 5 games, cfg curve override, raw board chips, deal invariants (game count, quotas, bruiser cap, comfort floor, corners, chunky cards, benching, ownership gating), winner derivation (center-free lines, blackout, timestamp flooring).
