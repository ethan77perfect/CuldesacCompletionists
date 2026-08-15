---
type: feature
status: live
files: [src/App.jsx]
---
# Ladder Levers

**What it does** — every all-time leaderboard row shows the gap to the person above and the *cheapest single game to finish* that closes it: "▲ 214 behind Alex · cheapest pass: finish Celeste (87% in) → +230". #1 sees who's chasing. Turns standings into a quest log.

**How it works** — pure client math, no schema. Candidates are started-incomplete games only (finishing an untouched game is a wish, not a plan); payout = `pool − basePoints`, so the completion bonus is included. Cheapest lever that ≥ gap wins; if none closes it, shows the biggest move and the shortfall; ties get "any unlock breaks it". All-time board only — season/contract points are different economies.
